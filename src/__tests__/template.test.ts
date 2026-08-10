import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_OPTIONS,
  TemplateOptions,
  containsAnyWorkout,
  containsWorkout,
  dayMarker,
  normalizeNotePath,
  renderDaySummary,
  renderWorkoutNote,
  renderWorkoutSnippet,
  sanitizeFileName,
  shouldIncludeDaySummary,
  suggestNotePath,
  workoutMarker,
} from "../template.ts";
import { SPORT_NAMES, sportName } from "../models.ts";
import {
  cyclingWorkout,
  dayContext,
  liftingWorkout,
  pendingWorkout,
  recovery,
  runningWorkout,
  sleep,
  workoutScore,
  zoneDuration,
} from "./fixtures.ts";

function options(overrides: Partial<TemplateOptions> = {}): TemplateOptions {
  return { ...DEFAULT_TEMPLATE_OPTIONS, ...overrides };
}

/** Pulls "| Label | Value |" rows out of a rendered snippet. */
function rows(markdown: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of markdown.split("\n")) {
    const m = line.match(/^\| (.+?) \| (.+?) \|$/);
    if (!m || m[1] === "Metric" || m[1].startsWith("---")) continue;
    out[m[1]] = m[2];
  }
  return out;
}

describe("sportName", () => {
  it("prefers the name the API sent", () => {
    expect(sportName({ sport_id: 0, sport_name: "Trail Run" })).toBe("Trail Run");
  });

  it("falls back to the lookup table when the name is empty", () => {
    expect(sportName({ sport_id: 0, sport_name: "" })).toBe("Running");
    expect(sportName({ sport_id: 52, sport_name: undefined })).toBe("Hiking/Rucking");
  });

  it("degrades gracefully for an unknown sport id", () => {
    expect(sportName({ sport_id: 9999, sport_name: "" })).toBe("Sport 9999");
  });

  it("covers the breadth of WHOOP sports", () => {
    expect(Object.keys(SPORT_NAMES).length).toBeGreaterThan(70);
    expect(SPORT_NAMES[0]).toBe("Running");
    expect(SPORT_NAMES[1]).toBe("Cycling");
    expect(SPORT_NAMES[52]).toBe("Hiking/Rucking");
    expect(SPORT_NAMES[-1]).toBe("Activity");
  });
});

describe("renderWorkoutSnippet", () => {
  it("renders a run as a self-contained block", () => {
    const markdown = renderWorkoutSnippet(runningWorkout(), options());

    expect(markdown).toBe(
      [
        "### 🏃 Running — 2026-08-09 07:12",
        "",
        "#whoop/sport/running #whoop/strain/moderate",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        "| Strain | 12.4 |",
        "| Duration | 42 min |",
        "| Distance | 8.02 km |",
        "| Pace | 5:14 /km |",
        "| Avg HR | 148 bpm |",
        "| Max HR | 167 bpm |",
        "| Calories | 612 kcal |",
        "| Calorie rate | 874 kcal/h |",
        "| Strain rate | 17.7 /h |",
        "| Zone 2 time | 15 min (36%) |",
        "| Zone 3 time | 19 min (45%) |",
        "| Zone 4 time | 5 min (12%) |",
        "| Zone 5 time | 3 min (7%) |",
        "| Time in zone 3+ | 27 min (64%) |",
        "| Data completeness | 98% |",
        "<!-- whoop-workout: b5f2c1a0-1111-4a2b-9c3d-000000000001 -->",
      ].join("\n")
    );
  });

  it("contains no day-level scaffolding or links", () => {
    const markdown = renderWorkoutSnippet(runningWorkout(), options());
    const lines = markdown.split("\n");

    expect(markdown).not.toContain("[[");
    // No frontmatter fence — the snippet drops into a note that has its own.
    expect(lines.some((line) => line.trim() === "---")).toBe(false);
    expect(lines[0].startsWith("### ")).toBe(true);
    // Exactly one heading: the workout's own. The tag line also opens with "#"
    // but has no space after it, so it is not an ATX heading.
    expect(lines.filter((line) => /^#{1,6}(\s|$)/.test(line))).toHaveLength(1);
  });

  it("switches distance, pace and elevation to imperial units", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({ score: workoutScore({ altitude_gain_meter: 610 }) }),
      options({ distanceUnit: "miles" })
    );
    const table = rows(markdown);

    expect(table.Distance).toBe("4.98 mi");
    expect(table.Pace).toBe("8:26 /mi");
    expect(table["Elevation gain"]).toBe("2001 ft");
  });

  it("shows average speed instead of pace for cycling", () => {
    const table = rows(renderWorkoutSnippet(cyclingWorkout(), options()));

    expect(table["Avg speed"]).toBe("26.7 km/h");
    expect(table.Pace).toBeUndefined();
    expect(table["Elevation gain"]).toBe("610 m");
  });

  it("omits distance and pace for a workout without them", () => {
    const table = rows(renderWorkoutSnippet(liftingWorkout(), options()));

    expect(table.Distance).toBeUndefined();
    expect(table.Pace).toBeUndefined();
    expect(table.Strain).toBe("9.7");
    expect(table.Duration).toBe("1 h 5 min");
  });

  it("says so when a distance sport recorded no distance", () => {
    const table = rows(
      renderWorkoutSnippet(
        runningWorkout({ score: workoutScore({ distance_meter: 0 }) }),
        options()
      )
    );
    expect(table.Distance).toBe("not recorded");
    expect(table.Pace).toBeUndefined();
  });

  it("respects the heading level, emoji and optional-row settings", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout(),
      options({
        headingLevel: 2,
        includeEmoji: false,
        includeZoneDurations: false,
        includeDataCompleteness: false,
      })
    );

    expect(markdown.split("\n")[0]).toBe("## Running — 2026-08-09 07:12");
    expect(markdown).not.toContain("Zone 5 time");
    expect(markdown).not.toContain("Data completeness");
  });

  it("clamps an out-of-range heading level", () => {
    expect(renderWorkoutSnippet(runningWorkout(), options({ headingLevel: 9 })).startsWith("###### ")).toBe(true);
    expect(renderWorkoutSnippet(runningWorkout(), options({ headingLevel: 0 })).startsWith("# ")).toBe(true);
  });

  it("honours a custom date format", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout(),
      options({ dateFormat: "ddd DD MMM, HH:mm" })
    );
    expect(markdown.split("\n")[0]).toBe("### 🏃 Running — Sun 09 Aug, 07:12");
  });

  it("skips zones with no time in them", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({
        score: workoutScore({
          zone_durations: zoneDuration({
            zone_zero_milli: 600_000,
            zone_one_milli: 120_000,
          }),
        }),
      }),
      options()
    );

    expect(markdown).toContain("| Zone 0 time | 10 min (83%) |");
    expect(markdown).toContain("| Zone 1 time | 2 min (17%) |");
    expect(markdown).not.toContain("Zone 2 time");
    // Nothing at zone 3 or above, so the hard-effort summary is omitted.
    expect(markdown).not.toContain("Time in zone 3+");
  });

  it("reads zone durations under the v1 key as well as the v2 one", () => {
    const legacy = renderWorkoutSnippet(
      runningWorkout({
        score: workoutScore({
          zone_durations: undefined,
          zone_duration: zoneDuration({ zone_three_milli: 1_200_000 }),
        }),
      }),
      options()
    );

    expect(legacy).toContain("| Zone 3 time | 20 min (100%) |");
  });

  it("omits the zone rows entirely when every zone is empty", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({
        score: workoutScore({ zone_durations: zoneDuration() }),
      }),
      options()
    );

    expect(markdown).not.toContain("Zone ");
    expect(markdown).not.toContain("Time in zone 3+");
  });

  it("reads percent_recorded given as a 0-1 fraction", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({ score: workoutScore({ percent_recorded: 1 }) }),
      options()
    );

    expect(markdown).toContain("| Data completeness | 100% |");
  });

  it("reports a net descent separately from the elevation gain", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({
        score: workoutScore({
          altitude_gain_meter: 148,
          altitude_change_meter: -320,
        }),
      }),
      options()
    );

    expect(markdown).toContain("| Elevation gain | 148 m |");
    expect(markdown).toContain("| Net elevation | −320 m |");
  });

  it("omits the net elevation row on a loop that returns to its start", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({
        score: workoutScore({
          altitude_gain_meter: 148,
          altitude_change_meter: 0,
        }),
      }),
      options()
    );

    expect(markdown).not.toContain("Net elevation");
  });

  it("drops the per-hour rates when they are turned off", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout(),
      options({ includeRates: false })
    );

    expect(markdown).toContain("| Calories | 612 kcal |");
    expect(markdown).not.toContain("Calorie rate");
    expect(markdown).not.toContain("Strain rate");
  });

  it("still renders a workout that has not been scored", () => {
    const markdown = renderWorkoutSnippet(pendingWorkout(), options());

    expect(markdown.split("\n")[0]).toBe("### 🥾 Hiking/Rucking — 2026-08-09 05:00");
    expect(rows(markdown).Duration).toBe("30 min");
    expect(markdown).toContain("_Score state: PENDING_SCORE._");
    expect(markdown).not.toContain("Strain");
  });

  it("falls back to a plain sentence when there is nothing to tabulate", () => {
    const markdown = renderWorkoutSnippet(
      pendingWorkout({ end: "2026-08-09T12:00:00.000Z" }),
      options()
    );
    expect(markdown).toContain("_No score available for this workout (PENDING_SCORE)._");
    expect(markdown).not.toContain("| Metric |");
  });

  it("escapes pipes so a value cannot break the table", () => {
    const markdown = renderWorkoutSnippet(
      runningWorkout({ sport_name: "Run | Trail" }),
      options()
    );
    // The heading is free text; the rows are what must stay well-formed.
    expect(rows(markdown).Duration).toBe("42 min");
  });
});

describe("workout markers", () => {
  const id = "b5f2c1a0-1111-4a2b-9c3d-000000000001";

  it("tags every rendered snippet with its workout id", () => {
    expect(renderWorkoutSnippet(runningWorkout(), options())).toContain(workoutMarker(id));
  });

  it("tags a snippet that has no score to show", () => {
    const markdown = renderWorkoutSnippet(
      pendingWorkout({ end: "2026-08-09T12:00:00.000Z" }),
      options()
    );
    expect(markdown).toContain(workoutMarker("b5f2c1a0-4444-4a2b-9c3d-000000000004"));
  });

  it("recognises its own marker in a note", () => {
    const note = `# Runs\n\n${renderWorkoutSnippet(runningWorkout(), options())}\n`;
    expect(containsWorkout(note, id)).toBe(true);
  });

  it("does not confuse one workout for another", () => {
    const note = renderWorkoutSnippet(runningWorkout(), options());
    expect(containsWorkout(note, "b5f2c1a0-2222-4a2b-9c3d-000000000002")).toBe(false);
  });

  it("reports nothing for a note this plugin never touched", () => {
    expect(containsWorkout("# Runs\n\nWent for a jog.\n", id)).toBe(false);
  });

  it("survives the marker being carried into a new note", () => {
    expect(containsWorkout(renderWorkoutNote(runningWorkout(), options()), id)).toBe(true);
  });

  it("cannot be made to close the comment early", () => {
    const marker = workoutMarker("evil--> <script>");
    expect(marker.match(/-->/g)).toHaveLength(1);
    expect(marker.endsWith("-->")).toBe(true);
  });
});

describe("renderWorkoutNote", () => {
  it("writes frontmatter followed by the snippet", () => {
    const note = renderWorkoutNote(runningWorkout(), options());
    const [, frontmatter, body] = note.split(/^---$/m);

    expect(frontmatter).toContain('whoop_workout_id: "b5f2c1a0-1111-4a2b-9c3d-000000000001"');
    expect(frontmatter).toContain("date: 2026-08-09");
    expect(frontmatter).toContain('sport: "Running"');
    expect(frontmatter).toContain("sport_id: 0");
    expect(frontmatter).toContain("duration_minutes: 42");
    expect(frontmatter).toContain("strain: 12.4");
    expect(frontmatter).toContain("distance_km: 8.02");
    expect(frontmatter).toContain("average_heart_rate: 148");
    expect(frontmatter).toContain("max_heart_rate: 167");
    expect(frontmatter).toContain("kilocalories: 612");
    expect(frontmatter).toContain("tags:\n  - whoop\n  - workout");

    expect(body).toContain("### 🏃 Running — 2026-08-09 07:12");
    expect(note.endsWith("\n")).toBe(true);
  });

  it("names the distance key after the chosen unit", () => {
    const note = renderWorkoutNote(runningWorkout(), options({ distanceUnit: "miles" }));
    expect(note).toContain("distance_miles: 4.98");
    expect(note).not.toContain("distance_km:");
  });

  it("omits score-derived keys when the workout is unscored", () => {
    const note = renderWorkoutNote(pendingWorkout(), options());
    expect(note).toContain('sport: "Hiking/Rucking"');
    expect(note).not.toContain("strain:");
    expect(note).not.toContain("distance_km:");
  });

  it("declares the workout's tags as a property as well as in the body", () => {
    const note = renderWorkoutNote(runningWorkout(), options());

    expect(note).toContain(
      "tags:\n  - whoop\n  - workout\n  - whoop/sport/running\n  - whoop/strain/moderate"
    );
    // Without the "#" in YAML, but with it in the body.
    expect(note).toContain("#whoop/sport/running #whoop/strain/moderate");
  });

  it("keeps the base tags when the workout's own tags are turned off", () => {
    const note = renderWorkoutNote(
      runningWorkout(),
      options({ includeSportTag: false, includeStrainTag: false })
    );

    expect(note).toContain("tags:\n  - whoop\n  - workout\n---");
    expect(note).not.toContain("whoop/sport/");
  });

  it("quotes values so a sport name with punctuation stays valid YAML", () => {
    const note = renderWorkoutNote(runningWorkout({ sport_name: 'Run: "hard"' }), options());
    expect(note).toContain('sport: "Run: \\"hard\\""');
  });
});

describe("suggestNotePath", () => {
  it("builds a path from the folder and filename template", () => {
    expect(
      suggestNotePath(runningWorkout(), "WHOOP Workouts", "{{date}} {{sport}}", "km")
    ).toBe("WHOOP Workouts/2026-08-09 Running.md");
  });

  it("supports the time and id tokens", () => {
    expect(suggestNotePath(runningWorkout(), "", "{{date}}-{{time}}", "km")).toBe(
      "2026-08-09-0712.md"
    );
    expect(suggestNotePath(runningWorkout(), "", "{{id}}", "km")).toBe(
      "b5f2c1a0-1111-4a2b-9c3d-000000000001.md"
    );
  });

  it("strips characters that are illegal in a filename", () => {
    expect(suggestNotePath(pendingWorkout(), "Health", "{{date}} {{sport}}", "km")).toBe(
      "Health/2026-08-09 Hiking Rucking.md"
    );
  });

  it("puts the note in the vault root when no folder is set", () => {
    expect(suggestNotePath(runningWorkout(), "  ", "{{sport}}", "km")).toBe("Running.md");
  });

  it("uses the workout's own date, not the reader's", () => {
    // 23:00Z at UTC-07:00 is still the 9th locally.
    expect(suggestNotePath(liftingWorkout(), "", "{{date}}", "km")).toBe("2026-08-09.md");
  });
});

describe("sanitizeFileName", () => {
  it("removes path and wiki-link characters", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("a b c d e f g h i j k l m n");
  });

  it("strips leading dots so no hidden file is created", () => {
    expect(sanitizeFileName("...hidden")).toBe("hidden");
  });
});

describe("normalizeNotePath", () => {
  it("adds the .md extension when it is missing", () => {
    expect(normalizeNotePath("Runs/Today")).toBe("Runs/Today.md");
  });

  it("does not double up an existing extension", () => {
    expect(normalizeNotePath("Runs/Today.md")).toBe("Runs/Today.md");
    expect(normalizeNotePath("Runs/Today.MD")).toBe("Runs/Today.md");
  });

  it("drops a leading slash", () => {
    expect(normalizeNotePath("/Runs/Today.md")).toBe("Runs/Today.md");
  });

  it("returns null when nothing usable is left", () => {
    expect(normalizeNotePath("")).toBeNull();
    expect(normalizeNotePath("   ")).toBeNull();
    expect(normalizeNotePath("///")).toBeNull();
  });

  it("keeps a path from escaping the vault", () => {
    expect(normalizeNotePath("../../etc/passwd")).toBe("etc/passwd.md");
  });
});

describe("renderDaySummary", () => {
  it("states recovery and sleep as prose, not table rows", () => {
    const summary = renderDaySummary(dayContext());

    expect(summary).toBe(
      [
        "Recovery that morning was 62%, with a resting heart rate of 48 bpm, " +
          "HRV of 78 ms and blood oxygen at 96%. The night before brought " +
          "7 h 12 min of sleep against a need of 8 h 22 min — 86% sleep " +
          "performance, 93% efficiency and 9 disturbances.",
        "#whoop/recovery/yellow",
        "<!-- whoop-day: 2026-08-09 -->",
      ].join("\n")
    );
    expect(summary).not.toContain("|");
  });

  it("never quotes day strain, which is a running total rather than a figure", () => {
    // The cycle endpoint reports strain accumulated so far, so on a workout
    // filed the same day it would be stale the moment it was written.
    expect(renderDaySummary(dayContext())).not.toMatch(/strain/i);
  });

  it("counts sleep as time in bed less time awake", () => {
    // 27,000,000 ms in bed − 1,080,000 ms awake = 7 h 12 min.
    expect(renderDaySummary(dayContext())).toContain("7 h 12 min of sleep");
  });

  it("drops the clauses it has no numbers for", () => {
    const summary = renderDaySummary(dayContext({ sleep: null }));

    expect(summary).toContain("Recovery that morning was 62%");
    expect(summary).not.toContain("night before");
    expect(summary).not.toContain("Day strain");
  });

  it("flags a recovery score WHOOP is still calibrating", () => {
    const summary = renderDaySummary(
      dayContext({
        sleep: null,
        recovery: recovery({ score: { recovery_score: 55, user_calibrating: true } }),
      })
    );

    expect(summary).toContain("still calibrating");
  });

  it("falls back to the sleep score when the stages are missing", () => {
    const summary = renderDaySummary(
      dayContext({
        recovery: null,
        sleep: sleep({ score: { sleep_performance_percentage: 88 } }),
      })
    );

    expect(summary).toContain("Sleep the night before scored 88%.");
  });

  it("renders nothing at all when the day has no scores", () => {
    const empty = { date: "2026-08-09", recovery: null, sleep: null };
    expect(renderDaySummary(empty)).toBe("");
  });
});

describe("shouldIncludeDaySummary", () => {
  it("is true for a note with no WHOOP blocks in it", () => {
    expect(shouldIncludeDaySummary("")).toBe(true);
    expect(shouldIncludeDaySummary("# Monday\n\nSome notes.\n")).toBe(true);
  });

  it("is false once the note already carries a workout", () => {
    const note = `# Monday\n\n${renderWorkoutSnippet(runningWorkout())}\n`;

    expect(containsAnyWorkout(note)).toBe(true);
    expect(shouldIncludeDaySummary(note)).toBe(false);
  });

  it("is false when the day sentence is there without a workout", () => {
    // Covers a workout block deleted by hand while the sentence above it stayed.
    expect(shouldIncludeDaySummary(`Recovery was 62%.\n${dayMarker("2026-08-09")}`)).toBe(
      false
    );
  });

  it("does not repeat the day sentence for a second workout on another day", () => {
    const note = `${renderDaySummary(dayContext())}\n\n${renderWorkoutSnippet(runningWorkout())}`;

    expect(shouldIncludeDaySummary(note)).toBe(false);
  });
});

describe("renderWorkoutNote with a day context", () => {
  it("puts the sentence between the frontmatter and the workout heading", () => {
    const note = renderWorkoutNote(runningWorkout(), DEFAULT_TEMPLATE_OPTIONS, dayContext());
    const lines = note.split("\n");

    const frontmatterEnd = lines.indexOf("---", 1);
    const sentence = lines.findIndex((l) => l.startsWith("Recovery that morning"));
    const heading = lines.findIndex((l) => l.startsWith("### "));

    expect(frontmatterEnd).toBeGreaterThan(0);
    expect(sentence).toBeGreaterThan(frontmatterEnd);
    expect(heading).toBeGreaterThan(sentence);
  });

  it("is unchanged when there is no day context to render", () => {
    expect(renderWorkoutNote(runningWorkout(), DEFAULT_TEMPLATE_OPTIONS, null)).toBe(
      renderWorkoutNote(runningWorkout())
    );
  });
});

describe("heart rate as a percentage of max", () => {
  it("expresses both heart rate rows against the max", () => {
    const table = rows(
      renderWorkoutSnippet(runningWorkout(), options({ maxHeartRate: 185 }))
    );

    expect(table["Avg HR"]).toBe("148 bpm (80% of max)");
    expect(table["Max HR"]).toBe("167 bpm (90% of max)");
  });

  it("leaves the rows bare when the max is unknown", () => {
    const table = rows(renderWorkoutSnippet(runningWorkout(), options()));

    expect(table["Avg HR"]).toBe("148 bpm");
    expect(table["Max HR"]).toBe("167 bpm");
  });

  it("drops the percentage rather than reporting over 100%", () => {
    // A reading above the recorded max means the max is stale, not that the
    // workout was run at 104%.
    const table = rows(
      renderWorkoutSnippet(runningWorkout(), options({ maxHeartRate: 160 }))
    );

    expect(table["Avg HR"]).toBe("148 bpm (93% of max)");
    expect(table["Max HR"]).toBe("167 bpm");
  });
});

describe("sport name casing", () => {
  it("prefers the table's casing over v2's lower-case name", () => {
    expect(sportName({ sport_id: 0, sport_name: "running" })).toBe("Running");
    expect(sportName({ sport_id: 98, sport_name: "hiit" })).toBe("HIIT");
  });

  it("title-cases a lower-case name for a sport it does not know", () => {
    expect(sportName({ sport_id: 9999, sport_name: "moon walking" })).toBe(
      "Moon Walking"
    );
  });

  it("leaves a name that carries its own capitalisation alone", () => {
    expect(sportName({ sport_id: 9999, sport_name: "eFoiling" })).toBe("eFoiling");
    expect(sportName({ sport_id: 0, sport_name: "Trail Run" })).toBe("Trail Run");
  });
});

describe("renderWorkoutNote frontmatter", () => {
  /** Parses the YAML frontmatter into a flat key/value map. */
  function frontmatter(note: string): Record<string, string> {
    const lines = note.split("\n");
    const end = lines.indexOf("---", 1);
    const out: Record<string, string> = {};
    for (const line of lines.slice(1, end)) {
      const m = line.match(/^([a-z0-9_]+): (.+)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  }

  it("writes pace as a number so it can be sorted and averaged", () => {
    const front = frontmatter(renderWorkoutNote(runningWorkout()));

    // 42 min over 8.02 km.
    expect(front.pace_seconds_per_km).toBe("314");
    expect(front.avg_speed_kmh).toBeUndefined();
  });

  it("writes speed instead of pace for a wheeled sport", () => {
    const front = frontmatter(renderWorkoutNote(cyclingWorkout()));

    expect(front.avg_speed_kmh).toBe("26.7");
    expect(front.pace_seconds_per_km).toBeUndefined();
  });

  it("follows the distance unit into the field names", () => {
    const front = frontmatter(
      renderWorkoutNote(runningWorkout(), options({ distanceUnit: "miles" }))
    );

    expect(front.distance_miles).toBe("4.98");
    expect(front.pace_seconds_per_mile).toBe("506");
    expect(front.pace_seconds_per_km).toBeUndefined();
  });

  it("makes the zone breakdown queryable", () => {
    const front = frontmatter(renderWorkoutNote(runningWorkout()));

    expect(front.zone_2_minutes).toBe("15");
    expect(front.zone_3_minutes).toBe("19");
    expect(front.zone_4_minutes).toBe("5");
    expect(front.zone_5_minutes).toBe("3");
    expect(front.zone_1_minutes).toBeUndefined();
  });

  it("carries data completeness and elevation", () => {
    const front = frontmatter(
      renderWorkoutNote(
        runningWorkout({ score: workoutScore({ altitude_gain_meter: 148 }) })
      )
    );

    expect(front.percent_recorded).toBe("98");
    expect(front.elevation_gain_m).toBe("148");
  });

  it("omits every field the workout has no value for", () => {
    const front = frontmatter(renderWorkoutNote(pendingWorkout()));

    expect(front.whoop_workout_id).toBeDefined();
    expect(front.pace_seconds_per_km).toBeUndefined();
    expect(front.percent_recorded).toBeUndefined();
    expect(front.zone_3_minutes).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_OPTIONS,
  TemplateOptions,
  describeWorkout,
  normalizeNotePath,
  renderWorkoutNote,
  renderWorkoutSnippet,
  sanitizeFileName,
  suggestNotePath,
} from "../template.ts";
import { SPORT_NAMES, sportName } from "../models.ts";
import {
  cyclingWorkout,
  liftingWorkout,
  pendingWorkout,
  runningWorkout,
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
        "| Metric | Value |",
        "|--------|-------|",
        "| Strain | 12.4 |",
        "| Duration | 42 min |",
        "| Distance | 8.02 km |",
        "| Pace | 5:14 /km |",
        "| Avg HR | 148 bpm |",
        "| Max HR | 167 bpm |",
        "| Calories | 612 kcal |",
        "| Zone 2 time | 15 min |",
        "| Zone 3 time | 19 min |",
        "| Zone 4 time | 5 min |",
        "| Zone 5 time | 3 min |",
        "| Data completeness | 98% |",
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
    // Exactly one heading: the workout's own.
    expect(lines.filter((line) => line.startsWith("#"))).toHaveLength(1);
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
          zone_duration: zoneDuration({ zone_zero_milli: 600_000, zone_one_milli: 120_000 }),
        }),
      }),
      options()
    );

    expect(markdown).toContain("| Zone 1 time | 2 min |");
    expect(markdown).not.toContain("Zone 0");
    expect(markdown).not.toContain("Zone 2 time");
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

describe("describeWorkout", () => {
  it("summarises a workout for the picker", () => {
    expect(describeWorkout(runningWorkout(), "km")).toBe("Running — 07:12 — 42 min — 8.02 km");
  });

  it("leaves out distance when there is none", () => {
    expect(describeWorkout(liftingWorkout(), "km")).toBe("Weightlifting — 16:00 — 1 h 5 min");
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

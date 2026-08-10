import { describe, expect, it } from "vitest";
import {
  GREEN_RECOVERY,
  HIGH_STRAIN,
  MODERATE_STRAIN,
  YELLOW_RECOVERY,
  dayTags,
  normalizeTagPrefix,
  recoveryBand,
  slugifyTag,
  strainBand,
  workoutTags,
} from "../tags.ts";
import { scanHeadings } from "../insert.ts";
import {
  DEFAULT_TEMPLATE_OPTIONS,
  renderDaySummary,
  renderWorkoutSnippet,
} from "../template.ts";
import { SPORT_NAMES } from "../models.ts";
import {
  cyclingWorkout,
  dayContext,
  liftingWorkout,
  pendingWorkout,
  recovery,
  runningWorkout,
  workoutScore,
} from "./fixtures.ts";

const ON = {
  tagPrefix: "whoop",
  includeSportTag: true,
  includeStrainTag: true,
  includeRecoveryTag: true,
};

describe("slugifyTag", () => {
  it("lower-cases and hyphenates a sport name", () => {
    expect(slugifyTag("Running")).toBe("running");
    expect(slugifyTag("Cross Country Skiing")).toBe("cross-country-skiing");
    expect(slugifyTag("HIIT")).toBe("hiit");
  });

  it("collapses a slash rather than nesting on it", () => {
    // "Hiking/Rucking" is one sport, not rucking filed under hiking.
    expect(slugifyTag("Hiking/Rucking")).toBe("hiking-rucking");
  });

  it("removes punctuation that would end the tag early", () => {
    expect(slugifyTag("Track & Field")).toBe("track-field");
    expect(slugifyTag("Operations - Tactical")).toBe("operations-tactical");
    expect(slugifyTag("Jiu Jitsu")).toBe("jiu-jitsu");
  });

  it("leaves no leading or trailing hyphen", () => {
    expect(slugifyTag("  ...Yoga!  ")).toBe("yoga");
    expect(slugifyTag("&&&")).toBe("");
  });

  it("keeps non-ASCII letters, which Obsidian indexes", () => {
    expect(slugifyTag("Föhnwandern")).toBe("föhnwandern");
  });

  it("produces an indexable tag for every sport WHOOP names", () => {
    for (const name of Object.values(SPORT_NAMES)) {
      const slug = slugifyTag(name);
      expect(slug, name).not.toBe("");
      // A space or "#" would end the tag; a bare number is never indexed.
      expect(slug, name).toMatch(/^[\p{L}\p{N}_-]+$/u);
      expect(slug, name).not.toMatch(/^\d+$/);
    }
  });
});

describe("strainBand", () => {
  it("uses WHOOP's own boundaries", () => {
    expect(strainBand(MODERATE_STRAIN)).toBe("moderate");
    expect(strainBand(HIGH_STRAIN)).toBe("high");
    expect(strainBand(13.9)).toBe("moderate");
    expect(strainBand(20.5)).toBe("high");
  });

  it("leaves a light workout untagged", () => {
    // A tag on every workout would partition nothing.
    expect(strainBand(9.9)).toBeNull();
    expect(strainBand(0)).toBeNull();
  });

  it("returns null rather than guessing at a missing strain", () => {
    expect(strainBand(undefined)).toBeNull();
    expect(strainBand(Number.NaN)).toBeNull();
  });
});

describe("recoveryBand", () => {
  it("uses WHOOP's own colour boundaries", () => {
    expect(recoveryBand(YELLOW_RECOVERY)).toBe("yellow");
    expect(recoveryBand(GREEN_RECOVERY)).toBe("green");
    expect(recoveryBand(33)).toBe("red");
    expect(recoveryBand(66)).toBe("yellow");
    expect(recoveryBand(100)).toBe("green");
  });

  it("bands every scored day, unlike strain", () => {
    // Recovery is a percentage of a fixed range, so there is no light end to
    // leave untagged the way a low strain is.
    expect(recoveryBand(1)).toBe("red");
  });

  it("reads a missing or zero score as absent rather than as very red", () => {
    expect(recoveryBand(undefined)).toBeNull();
    expect(recoveryBand(Number.NaN)).toBeNull();
    expect(recoveryBand(0)).toBeNull();
  });
});

describe("dayTags", () => {
  it("names the recovery colour", () => {
    // The fixture scores 62% — yellow.
    expect(dayTags(dayContext(), ON)).toEqual(["#whoop/recovery/yellow"]);
  });

  it("says nothing for a score WHOOP is still calibrating", () => {
    // The sentence hedges the figure; a tag cannot, so it would assert as fact
    // exactly what the prose beside it disclaims.
    const calibrating = dayContext({
      recovery: recovery({ score: { recovery_score: 78, user_calibrating: true } }),
    });

    expect(dayTags(calibrating, ON)).toEqual([]);
    expect(renderDaySummary(calibrating)).toContain("still calibrating");
  });

  it("says nothing when the day has no recovery at all", () => {
    expect(dayTags(dayContext({ recovery: null }), ON)).toEqual([]);
  });

  it("honours its own flag and the prefix", () => {
    expect(dayTags(dayContext(), { ...ON, includeRecoveryTag: false })).toEqual([]);
    expect(dayTags(dayContext(), { ...ON, tagPrefix: "" })).toEqual([]);
    expect(dayTags(dayContext(), { ...ON, tagPrefix: "health/whoop" })).toEqual([
      "#health/whoop/recovery/yellow",
    ]);
  });

  it("is independent of the workout tag flags", () => {
    const options = { ...ON, includeSportTag: false, includeStrainTag: false };
    expect(dayTags(dayContext(), options)).toEqual(["#whoop/recovery/yellow"]);
  });
});

describe("the recovery tag in a rendered day sentence", () => {
  it("sits between the prose and the marker", () => {
    const lines = renderDaySummary(dayContext()).split("\n");

    expect(lines[0].startsWith("Recovery that morning was 62%")).toBe(true);
    expect(lines[1]).toBe("#whoop/recovery/yellow");
    expect(lines[2]).toBe("<!-- whoop-day: 2026-08-09 -->");
  });

  it("rides with the sentence, so it is written once per note", () => {
    // The sentence is what carries it, and shouldIncludeDaySummary already
    // keeps that to the first workout on a page.
    const summary = renderDaySummary(dayContext());
    const both = `${summary}\n\n${renderWorkoutSnippet(runningWorkout())}`;

    expect(both.match(/#whoop\/recovery\//g)).toHaveLength(1);
  });

  it("leaves the sentence untouched when switched off", () => {
    const summary = renderDaySummary(dayContext(), {
      ...ON,
      includeRecoveryTag: false,
    });

    expect(summary).not.toContain("#whoop/recovery");
    expect(summary.split("\n")).toHaveLength(2);
  });

  it("is dropped when the day has a sleep score but no recovery", () => {
    const summary = renderDaySummary(dayContext({ recovery: null }));

    expect(summary).toContain("The night before brought");
    expect(summary).not.toContain("#whoop/recovery");
  });
});

describe("normalizeTagPrefix", () => {
  it("strips a leading hash the user typed", () => {
    expect(normalizeTagPrefix("#whoop")).toBe("whoop");
  });

  it("keeps slashes so the namespace can nest under an existing tag", () => {
    expect(normalizeTagPrefix("health/whoop")).toBe("health/whoop");
    expect(normalizeTagPrefix("/health//whoop/")).toBe("health/whoop");
  });

  it("leaves the user's capitalisation alone", () => {
    expect(normalizeTagPrefix("WHOOP")).toBe("WHOOP");
  });

  it("replaces characters that would end the tag early", () => {
    expect(normalizeTagPrefix("my whoop")).toBe("my-whoop");
  });

  it("is empty when nothing usable is left", () => {
    expect(normalizeTagPrefix("")).toBe("");
    expect(normalizeTagPrefix("   ")).toBe("");
    expect(normalizeTagPrefix("###")).toBe("");
  });
});

describe("workoutTags", () => {
  it("names the sport and the strain band", () => {
    expect(workoutTags(runningWorkout(), ON)).toEqual([
      "#whoop/sport/running",
      "#whoop/strain/moderate",
    ]);
  });

  it("omits the strain tag for a light workout", () => {
    // The lifting fixture is 9.7 — under WHOOP's moderate threshold.
    expect(workoutTags(liftingWorkout(), ON)).toEqual(["#whoop/sport/weightlifting"]);
  });

  it("marks a hard workout high", () => {
    const hard = runningWorkout({ score: workoutScore({ strain: 17.2 }) });
    expect(workoutTags(hard, ON)).toContain("#whoop/strain/high");
  });

  it("still tags the sport of an unscored workout", () => {
    // No score means no strain, but the sport is known regardless.
    expect(workoutTags(pendingWorkout(), ON)).toEqual(["#whoop/sport/hiking-rucking"]);
  });

  it("honours each flag independently", () => {
    expect(workoutTags(cyclingWorkout(), { ...ON, includeStrainTag: false })).toEqual([
      "#whoop/sport/cycling",
    ]);
    expect(workoutTags(runningWorkout(), { ...ON, includeSportTag: false })).toEqual([
      "#whoop/strain/moderate",
    ]);
    expect(
      workoutTags(runningWorkout(), {
        ...ON,
        includeSportTag: false,
        includeStrainTag: false,
      })
    ).toEqual([]);
  });

  it("writes nothing at all when the prefix is empty", () => {
    expect(workoutTags(runningWorkout(), { ...ON, tagPrefix: "  " })).toEqual([]);
  });

  it("applies a custom prefix to both kinds", () => {
    expect(workoutTags(runningWorkout(), { ...ON, tagPrefix: "#health/whoop" })).toEqual([
      "#health/whoop/sport/running",
      "#health/whoop/strain/moderate",
    ]);
  });

  it("prefers the name the API sent over the lookup table", () => {
    const trail = runningWorkout({ sport_name: "Trail Run" });
    expect(workoutTags(trail, ON)).toContain("#whoop/sport/trail-run");
  });

  it("falls back to the id when a sport name leaves no usable slug", () => {
    const odd = runningWorkout({ sport_id: 71, sport_name: "!!!" });
    expect(workoutTags(odd, ON)).toContain("#whoop/sport/sport-71");
  });
});

describe("the tag line in a rendered snippet", () => {
  it("sits on its own line under the heading", () => {
    const lines = renderWorkoutSnippet(runningWorkout()).split("\n");

    expect(lines[0]).toBe("### 🏃 Running — 2026-08-09 07:12");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("#whoop/sport/running #whoop/strain/moderate");
    expect(lines[3]).toBe("");
  });

  it("is not read as a heading", () => {
    // "#whoop/..." has no space after the hash, so it is not an ATX heading —
    // if it were, it would break the section boundaries every insert relies on.
    const snippet = renderWorkoutSnippet(runningWorkout());
    const headings = scanHeadings(snippet.split("\n"));

    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("🏃 Running — 2026-08-09 07:12");
  });

  it("does not appear when both tag settings are off", () => {
    const snippet = renderWorkoutSnippet(runningWorkout(), {
      ...DEFAULT_TEMPLATE_OPTIONS,
      includeSportTag: false,
      includeStrainTag: false,
    });

    expect(snippet).not.toContain("#whoop/");
    expect(snippet.split("\n")[2]).toBe("| Metric | Value |");
  });
});

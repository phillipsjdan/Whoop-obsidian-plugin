import { describe, expect, it } from "vitest";
import {
  convertDistance,
  durationMs,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  kilojoulesToKcal,
  parseOffsetMinutes,
  workoutDateStamp,
} from "../format.ts";

describe("formatDuration", () => {
  it("uses seconds below a minute", () => {
    expect(formatDuration(48_000)).toBe("48 s");
    expect(formatDuration(0)).toBe("0 s");
  });

  it("uses minutes below an hour", () => {
    expect(formatDuration(42 * 60_000)).toBe("42 min");
    expect(formatDuration(60_000)).toBe("1 min");
  });

  it("uses hours and minutes above an hour", () => {
    expect(formatDuration(72 * 60_000)).toBe("1 h 12 min");
    expect(formatDuration(2 * 3_600_000)).toBe("2 h");
  });

  it("returns a placeholder for nonsense", () => {
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
  });
});

describe("distance conversion", () => {
  it("converts metres to kilometres and miles", () => {
    expect(convertDistance(8020, "km")).toBeCloseTo(8.02, 5);
    expect(convertDistance(1609.344, "miles")).toBeCloseTo(1, 9);
  });

  it("formats with a unit label", () => {
    expect(formatDistance(8020, "km")).toBe("8.02 km");
    expect(formatDistance(8020, "miles")).toBe("4.98 mi");
  });
});

describe("formatPace", () => {
  it("computes minutes per kilometre", () => {
    expect(formatPace(42 * 60_000, 8020, "km")).toBe("5:14 /km");
  });

  it("computes minutes per mile", () => {
    expect(formatPace(42 * 60_000, 8020, "miles")).toBe("8:26 /mi");
  });

  it("zero-pads the seconds", () => {
    expect(formatPace(50 * 60_000, 10_000, "km")).toBe("5:00 /km");
    expect(formatPace(301_000, 1000, "km")).toBe("5:01 /km");
  });

  it("returns null without a usable distance or duration", () => {
    expect(formatPace(42 * 60_000, 0, "km")).toBeNull();
    expect(formatPace(0, 8020, "km")).toBeNull();
    expect(formatPace(Number.NaN, 8020, "km")).toBeNull();
  });
});

describe("formatSpeed", () => {
  it("computes distance per hour", () => {
    expect(formatSpeed(90 * 60_000, 40_000, "km")).toBe("26.7 km/h");
  });

  it("returns null without a usable distance", () => {
    expect(formatSpeed(90 * 60_000, 0, "km")).toBeNull();
  });
});

describe("kilojoulesToKcal", () => {
  it("converts using the thermochemical calorie", () => {
    expect(Math.round(kilojoulesToKcal(2560.6))).toBe(612);
  });
});

describe("durationMs", () => {
  it("measures the gap between two instants", () => {
    expect(durationMs("2026-08-09T14:12:00.000Z", "2026-08-09T14:54:00.000Z")).toBe(
      42 * 60_000
    );
  });

  it("spans midnight", () => {
    expect(durationMs("2026-08-09T23:00:00.000Z", "2026-08-10T00:05:00.000Z")).toBe(
      65 * 60_000
    );
  });
});

describe("parseOffsetMinutes", () => {
  it("parses both punctuation styles and signs", () => {
    expect(parseOffsetMinutes("-07:00")).toBe(-420);
    expect(parseOffsetMinutes("+0530")).toBe(330);
    expect(parseOffsetMinutes("+00:00")).toBe(0);
    expect(parseOffsetMinutes("Z")).toBe(0);
  });

  it("returns null for anything it cannot read", () => {
    for (const bad of [undefined, "", "PST", "-7:00", "+25:00", "+00:99"]) {
      expect(parseOffsetMinutes(bad)).toBeNull();
    }
  });
});

describe("formatDateTime", () => {
  const start = "2026-08-09T14:12:00.000Z";

  it("renders in the workout's own time zone, not the reader's", () => {
    expect(formatDateTime(start, "-07:00", "YYYY-MM-DD HH:mm")).toBe("2026-08-09 07:12");
    expect(formatDateTime(start, "+05:30", "YYYY-MM-DD HH:mm")).toBe("2026-08-09 19:42");
  });

  it("rolls the date over when the offset crosses midnight", () => {
    expect(formatDateTime("2026-08-09T23:00:00.000Z", "-07:00", "YYYY-MM-DD HH:mm")).toBe(
      "2026-08-09 16:00"
    );
    expect(formatDateTime("2026-08-09T02:00:00.000Z", "-07:00", "YYYY-MM-DD")).toBe(
      "2026-08-08"
    );
  });

  it("supports every documented token", () => {
    expect(formatDateTime(start, "-07:00", "ddd DD MMM YYYY (YY) HH:mm:ss")).toBe(
      "Sun 09 Aug 2026 (26) 07:12:00"
    );
    expect(formatDateTime(start, "-07:00", "MMMM")).toBe("Aug");
  });

  it("falls back to UTC when the offset is unreadable", () => {
    expect(formatDateTime(start, "nonsense", "HH:mm")).toBe("14:12");
    expect(formatDateTime(start, undefined, "HH:mm")).toBe("14:12");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatDateTime("not-a-date", "-07:00", "YYYY")).toBe("not-a-date");
  });

  it("leaves non-token characters alone", () => {
    expect(formatDateTime(start, "-07:00", "[on] YYYY")).toBe("[on] 2026");
  });
});

describe("workoutDateStamp", () => {
  it("returns the local calendar date of the workout", () => {
    expect(workoutDateStamp("2026-08-09T23:00:00.000Z", "-07:00")).toBe("2026-08-09");
    expect(workoutDateStamp("2026-08-10T05:00:00.000Z", "-07:00")).toBe("2026-08-09");
  });
});

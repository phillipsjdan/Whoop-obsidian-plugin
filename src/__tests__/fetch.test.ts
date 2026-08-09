import { describe, expect, it } from "vitest";
import { ApiClient, NotFoundError } from "../client.ts";
import {
  addLocalDays,
  fetchPaginated,
  formatLocalDate,
  getWorkoutsForDay,
  localDayRange,
  parseDateInput,
  startOfLocalDay,
} from "../fetch.ts";
import { PaginatedResponse, Workout } from "../models.ts";
import { cyclingWorkout, liftingWorkout, runningWorkout } from "./fixtures.ts";

interface Call {
  path: string;
  params?: Record<string, string>;
}

/** Replays a scripted list of responses and records what it was asked for. */
class FakeClient implements ApiClient {
  readonly calls: Call[] = [];

  constructor(private readonly responses: unknown[]) {}

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    this.calls.push({ path, params });
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next ?? { records: [] };
  }
}

function page<T>(records: T[], nextToken?: string): PaginatedResponse<T> {
  return { records, next_token: nextToken ?? null };
}

describe("parseDateInput", () => {
  it("parses YYYY-MM-DD to local midnight", () => {
    const date = parseDateInput("2026-08-09");
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(7);
    expect(date!.getDate()).toBe(9);
    expect(date!.getHours()).toBe(0);
    expect(date!.getMinutes()).toBe(0);
  });

  it("tolerates surrounding whitespace", () => {
    expect(formatLocalDate(parseDateInput("  2026-01-02  ")!)).toBe("2026-01-02");
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "today", "2026-8-9", "20260809", "2026/08/09", "2026-08-09T10:00"]) {
      expect(parseDateInput(bad)).toBeNull();
    }
  });

  it("rejects dates that do not exist", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
    expect(parseDateInput("2026-00-10")).toBeNull();
  });

  it("accepts a leap day in a leap year but not otherwise", () => {
    expect(parseDateInput("2024-02-29")).not.toBeNull();
    expect(parseDateInput("2026-02-29")).toBeNull();
  });
});

describe("localDayRange", () => {
  it("spans local midnight to the next local midnight", () => {
    const { start, end } = localDayRange(new Date(2026, 7, 9, 15, 42, 13, 500));

    expect(formatLocalDate(start)).toBe("2026-08-09");
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(formatLocalDate(end)).toBe("2026-08-10");
    expect(end.getHours()).toBe(0);
    expect(end.getMilliseconds()).toBe(0);
  });

  it("uses local boundaries, not UTC ones", () => {
    // Would only hold for UTC-based boundaries in a UTC-offset-zero zone.
    const { start } = localDayRange(new Date(2026, 7, 9, 23, 30));
    expect(start.getTime()).toBe(new Date(2026, 7, 9).getTime());
  });

  it("crosses month and year boundaries", () => {
    expect(formatLocalDate(localDayRange(new Date(2026, 0, 31)).end)).toBe("2026-02-01");
    expect(formatLocalDate(localDayRange(new Date(2025, 11, 31)).end)).toBe("2026-01-01");
  });
});

describe("startOfLocalDay / addLocalDays", () => {
  it("zeroes the time components", () => {
    const d = startOfLocalDay(new Date(2026, 7, 9, 18, 5, 6, 7));
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it("steps forwards and backwards, staying at midnight", () => {
    const base = new Date(2026, 7, 9);
    expect(formatLocalDate(addLocalDays(base, 1))).toBe("2026-08-10");
    expect(formatLocalDate(addLocalDays(base, -1))).toBe("2026-08-08");
    expect(addLocalDays(base, 5).getHours()).toBe(0);
  });
});

describe("fetchPaginated", () => {
  it("sends the range as ISO8601 start/end query params", async () => {
    const client = new FakeClient([page<Workout>([])]);
    const start = new Date("2026-08-09T07:00:00.000Z");
    const end = new Date("2026-08-10T07:00:00.000Z");

    await fetchPaginated(client, "/activity/workout", start, end);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].path).toBe("/activity/workout");
    expect(client.calls[0].params).toMatchObject({
      start: "2026-08-09T07:00:00.000Z",
      end: "2026-08-10T07:00:00.000Z",
    });
    expect(client.calls[0].params).not.toHaveProperty("nextToken");
  });

  it("follows next_token until it is absent", async () => {
    const client = new FakeClient([
      page([{ id: "a" }], "token-1"),
      page([{ id: "b" }], "token-2"),
      page([{ id: "c" }]),
    ]);

    const records = await fetchPaginated<{ id: string }>(
      client,
      "/activity/workout",
      new Date(0),
      new Date(1)
    );

    expect(records.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(client.calls.map((c) => c.params?.nextToken)).toEqual([
      undefined,
      "token-1",
      "token-2",
    ]);
  });

  it("stops if the server keeps returning the same cursor", async () => {
    const client = new FakeClient(
      Array.from({ length: 10 }, () => page([{ id: "loop" }], "same-token"))
    );

    const records = await fetchPaginated<{ id: string }>(
      client,
      "/activity/workout",
      new Date(0),
      new Date(1)
    );

    expect(records).toHaveLength(2);
    expect(client.calls).toHaveLength(2);
  });

  it("treats a 404 as an empty range", async () => {
    const client = new FakeClient([new NotFoundError("/activity/workout")]);
    await expect(
      fetchPaginated(client, "/activity/workout", new Date(0), new Date(1))
    ).resolves.toEqual([]);
  });

  it("keeps records collected before a mid-pagination 404", async () => {
    const client = new FakeClient([
      page([{ id: "a" }], "token-1"),
      new NotFoundError("/activity/workout"),
    ]);

    const records = await fetchPaginated<{ id: string }>(
      client,
      "/activity/workout",
      new Date(0),
      new Date(1)
    );
    expect(records.map((r) => r.id)).toEqual(["a"]);
  });

  it("propagates errors that are not 404s", async () => {
    const client = new FakeClient([new Error("boom")]);
    await expect(
      fetchPaginated(client, "/activity/workout", new Date(0), new Date(1))
    ).rejects.toThrow("boom");
  });

  it("survives a response with no records array", async () => {
    const client = new FakeClient([{}]);
    await expect(
      fetchPaginated(client, "/activity/workout", new Date(0), new Date(1))
    ).resolves.toEqual([]);
  });
});

describe("getWorkoutsForDay", () => {
  /** The instant a workout must start at to fall on the given local day. */
  function localInstant(year: number, month: number, day: number, hour: number): string {
    return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
  }

  it("queries the local day range for the requested date", async () => {
    const client = new FakeClient([page<Workout>([])]);
    const date = new Date(2026, 7, 9);

    await getWorkoutsForDay(client, date);

    const { start, end } = localDayRange(date);
    expect(client.calls[0].params).toMatchObject({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  });

  it("returns the day's workouts newest first", async () => {
    const morning = runningWorkout({ start: localInstant(2026, 8, 9, 7), end: localInstant(2026, 8, 9, 8) });
    const midday = cyclingWorkout({ start: localInstant(2026, 8, 9, 12), end: localInstant(2026, 8, 9, 13) });
    const evening = liftingWorkout({ start: localInstant(2026, 8, 9, 18), end: localInstant(2026, 8, 9, 19) });

    const client = new FakeClient([page([morning, evening, midday])]);
    const workouts = await getWorkoutsForDay(client, new Date(2026, 7, 9));

    expect(workouts.map((w) => w.id)).toEqual([evening.id, midday.id, morning.id]);
  });

  it("drops workouts that started outside the requested local day", async () => {
    const inRange = runningWorkout({ start: localInstant(2026, 8, 9, 7), end: localInstant(2026, 8, 9, 8) });
    const dayBefore = cyclingWorkout({ start: localInstant(2026, 8, 8, 23), end: localInstant(2026, 8, 9, 1) });
    const dayAfter = liftingWorkout({ start: localInstant(2026, 8, 10, 0), end: localInstant(2026, 8, 10, 1) });

    const client = new FakeClient([page([dayBefore, inRange, dayAfter])]);
    const workouts = await getWorkoutsForDay(client, new Date(2026, 7, 9));

    expect(workouts.map((w) => w.id)).toEqual([inRange.id]);
  });

  it("returns an empty list for a day with nothing recorded", async () => {
    const client = new FakeClient([page<Workout>([])]);
    await expect(getWorkoutsForDay(client, new Date(2026, 7, 9))).resolves.toEqual([]);
  });
});

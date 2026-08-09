import { ApiClient, NotFoundError } from "./client.ts";
import { PaginatedResponse, Workout } from "./models.ts";

/** Safety valve so a misbehaving next_token can't spin forever. */
const MAX_PAGES = 50;

/**
 * Fetches every record from a next_token-paginated WHOOP endpoint covering
 * [start, end). A 404 is treated as "no records" rather than an error, which is
 * what the API returns for ranges with nothing in them.
 */
export async function fetchPaginated<T>(
  client: ApiClient,
  path: string,
  start: Date,
  end: Date
): Promise<T[]> {
  const all: T[] = [];
  const seenTokens = new Set<string>();
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      start: start.toISOString(),
      end: end.toISOString(),
      limit: "25",
    };
    if (nextToken) params.nextToken = nextToken;

    let response: PaginatedResponse<T>;
    try {
      response = (await client.get(path, params)) as PaginatedResponse<T>;
    } catch (e) {
      if (e instanceof NotFoundError) return all;
      throw e;
    }

    all.push(...(response?.records ?? []));

    const token = response?.next_token;
    if (!token) return all;
    // A server that keeps handing back the same cursor would loop forever.
    if (seenTokens.has(token)) return all;
    seenTokens.add(token);
    nextToken = token;
  }

  return all;
}

export function getWorkouts(
  client: ApiClient,
  start: Date,
  end: Date
): Promise<Workout[]> {
  return fetchPaginated<Workout>(client, "/activity/workout", start, end);
}

/**
 * Fetches the workouts that *started* on a given local calendar day, newest
 * first. The API filters on the workout start instant, so the range is built
 * from local midnight boundaries rather than UTC ones — otherwise an evening
 * workout west of Greenwich lands on the wrong day.
 */
export async function getWorkoutsForDay(
  client: ApiClient,
  date: Date
): Promise<Workout[]> {
  const { start, end } = localDayRange(date);
  const workouts = await getWorkouts(client, start, end);
  return workouts
    .filter((w) => {
      const t = new Date(w.start).getTime();
      return t >= start.getTime() && t < end.getTime();
    })
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}

/** Local midnight of `date` through local midnight of the following day. */
export function localDayRange(date: Date): { start: Date; end: Date } {
  const start = startOfLocalDay(date);
  return { start, end: addLocalDays(start, 1) };
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Adds days keeping local midnight, so DST transitions stay on the hour. */
export function addLocalDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 0, 0, 0, 0);
}

/** Parses YYYY-MM-DD into local midnight. Returns null if malformed or invalid. */
export function parseDateInput(input: string): Date | null {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Rejects rollovers like 2026-02-30.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Formats a Date as YYYY-MM-DD in local time. */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

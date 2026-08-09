/** Unit conversion and human-readable formatting helpers. */

export type DistanceUnit = "km" | "miles";

export const METERS_PER_KM = 1000;
export const METERS_PER_MILE = 1609.344;
export const KJ_PER_KCAL = 4.184;

export function metersPerUnit(unit: DistanceUnit): number {
  return unit === "miles" ? METERS_PER_MILE : METERS_PER_KM;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === "miles" ? "mi" : "km";
}

export function convertDistance(meters: number, unit: DistanceUnit): number {
  return meters / metersPerUnit(unit);
}

/** e.g. "8.02 km" / "4.98 mi". */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  return `${convertDistance(meters, unit).toFixed(2)} ${unitLabel(unit)}`;
}

export function kilojoulesToKcal(kj: number): number {
  return kj / KJ_PER_KCAL;
}

export function durationMs(startIso: string, endIso: string): number {
  return new Date(endIso).getTime() - new Date(startIso).getTime();
}

/**
 * e.g. "42 min", "1 h 12 min", "48 s". Rounds to the nearest minute above one
 * minute, which is the resolution anyone reads these at.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;

  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/**
 * Pace as m:ss per distance unit, e.g. "5:14 /km". WHOOP does not report pace,
 * so it is derived from duration ÷ distance. Returns null when there is no
 * distance to divide by.
 */
export function formatPace(
  ms: number,
  meters: number,
  unit: DistanceUnit
): string | null {
  const secondsPerUnit = paceSecondsPerUnit(ms, meters, unit);
  if (secondsPerUnit === null) return null;

  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = secondsPerUnit % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /${unitLabel(unit)}`;
}

/** Pace as whole seconds per distance unit — the queryable form of the above. */
export function paceSecondsPerUnit(
  ms: number,
  meters: number,
  unit: DistanceUnit
): number | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (!Number.isFinite(meters) || meters <= 0) return null;

  const secondsPerUnit = Math.round(ms / 1000 / convertDistance(meters, unit));
  return Number.isFinite(secondsPerUnit) ? secondsPerUnit : null;
}

/** Average speed, e.g. "24.6 km/h" — more natural than pace for cycling. */
export function formatSpeed(
  ms: number,
  meters: number,
  unit: DistanceUnit
): string | null {
  const perHour = speedPerHour(ms, meters, unit);
  if (perHour === null) return null;
  return `${perHour.toFixed(1)} ${unitLabel(unit)}/h`;
}

/** Average speed in units per hour — the queryable form of the above. */
export function speedPerHour(
  ms: number,
  meters: number,
  unit: DistanceUnit
): number | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return convertDistance(meters, unit) / (ms / 3_600_000);
}

/**
 * Parses a WHOOP timezone_offset ("-07:00", "+0530", "Z") into minutes east of
 * UTC. Returns null when unparseable, so callers can fall back to UTC.
 */
export function parseOffsetMinutes(offset: string | undefined): number | null {
  if (!offset) return null;
  const trimmed = offset.trim();
  if (trimmed === "Z" || trimmed === "z") return 0;
  const m = trimmed.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  if (hours > 23 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Formats an ISO instant using a token string, rendered in the workout's own
 * timezone offset rather than the reader's — a run is remembered by the clock
 * time it happened at.
 *
 * Tokens: YYYY YY MMMM MMM MM DD ddd HH mm ss
 */
export function formatDateTime(
  iso: string,
  offset: string | undefined,
  pattern: string
): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;

  const offsetMinutes = parseOffsetMinutes(offset) ?? 0;
  const shifted = new Date(instant.getTime() + offsetMinutes * 60_000);

  const values: Record<string, string> = {
    YYYY: String(shifted.getUTCFullYear()),
    YY: String(shifted.getUTCFullYear()).slice(-2),
    MMMM: MONTHS[shifted.getUTCMonth()],
    MMM: MONTHS[shifted.getUTCMonth()],
    MM: pad2(shifted.getUTCMonth() + 1),
    DD: pad2(shifted.getUTCDate()),
    ddd: WEEKDAYS[shifted.getUTCDay()],
    HH: pad2(shifted.getUTCHours()),
    mm: pad2(shifted.getUTCMinutes()),
    ss: pad2(shifted.getUTCSeconds()),
  };

  return pattern.replace(/YYYY|YY|MMMM|MMM|MM|DD|ddd|HH|mm|ss/g, (t) => values[t]);
}

/** YYYY-MM-DD in the workout's own timezone. */
export function workoutDateStamp(iso: string, offset: string | undefined): string {
  return formatDateTime(iso, offset, "YYYY-MM-DD");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

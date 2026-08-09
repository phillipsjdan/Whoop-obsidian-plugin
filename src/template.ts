import { normalizePath } from "obsidian";
import {
  DISTANCE_SPORT_IDS,
  DayContext,
  Workout,
  ZoneDuration,
  asleepMs,
  hasDayContext,
  percentRecorded,
  sleepNeededMs,
  sportEmoji,
  sportName,
  totalZoneMs,
  zoneDurations,
} from "./models.ts";
import {
  DistanceUnit,
  durationMs,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  convertDistance,
  kilojoulesToKcal,
  paceSecondsPerUnit,
  speedPerHour,
  unitLabel,
  workoutDateStamp,
} from "./format.ts";

export interface TemplateOptions {
  distanceUnit: DistanceUnit;
  /** Token pattern for the timestamp in the snippet heading. */
  dateFormat: string;
  /** Markdown heading level (1–6) for the snippet's own heading. */
  headingLevel: number;
  includeEmoji: boolean;
  includeZoneDurations: boolean;
  includeDataCompleteness: boolean;
  /** Per-hour derived figures: calorie burn rate and strain rate. */
  includeRates: boolean;
  /**
   * The user's max heart rate, for expressing the HR rows as a percentage.
   * Null when unknown or the setting is off, which drops the percentage only.
   */
  maxHeartRate: number | null;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  distanceUnit: "km",
  dateFormat: "YYYY-MM-DD HH:mm",
  headingLevel: 3,
  includeEmoji: true,
  includeZoneDurations: true,
  includeDataCompleteness: true,
  includeRates: true,
  maxHeartRate: null,
};

/** Sports where average speed reads better than pace. */
const SPEED_SPORT_IDS = new Set<number>([1, 28, 29, 57, 91, 92, 97, 99]);

const METERS_PER_FOOT = 0.3048;

const ZONE_LABELS: Array<[keyof ZoneDuration, string]> = [
  ["zone_zero_milli", "Zone 0 time"],
  ["zone_one_milli", "Zone 1 time"],
  ["zone_two_milli", "Zone 2 time"],
  ["zone_three_milli", "Zone 3 time"],
  ["zone_four_milli", "Zone 4 time"],
  ["zone_five_milli", "Zone 5 time"],
];

/** Zones counted as hard effort for the "time in zone 3+" summary row. */
const HARD_ZONE_KEYS: Array<keyof ZoneDuration> = [
  "zone_three_milli",
  "zone_four_milli",
  "zone_five_milli",
];

const MARKER_PREFIX = "<!-- whoop-workout:";
const DAY_MARKER_PREFIX = "<!-- whoop-day:";

/**
 * Hidden tag identifying which workout a block came from. HTML comments do not
 * render in reading view, and this is the only way to tell later that a given
 * workout is already in a note.
 */
export function workoutMarker(id: string): string {
  // A workout id is a UUID, but never let one close the comment early.
  return `${MARKER_PREFIX} ${id.replace(/--+>/g, "")} -->`;
}

/** True when a note already contains a block for this workout. */
export function containsWorkout(content: string, id: string): boolean {
  return content.includes(workoutMarker(id));
}

/** True when a note already carries any workout this plugin wrote. */
export function containsAnyWorkout(content: string): boolean {
  return content.includes(MARKER_PREFIX);
}

/** Hidden tag marking the day-context sentence, so it is written only once. */
export function dayMarker(date: string): string {
  return `${DAY_MARKER_PREFIX} ${date.replace(/--+>/g, "")} -->`;
}

/** True when a note already carries a day-context sentence for any day. */
export function containsAnyDaySummary(content: string): boolean {
  return content.includes(DAY_MARKER_PREFIX);
}

/**
 * Whether a note should get the day-context sentence along with this workout.
 *
 * It belongs to the note, not to the workout: the first WHOOP block on a page
 * carries it and later ones do not, so a daily note that collects several
 * workouts states the day's recovery and sleep once.
 */
export function shouldIncludeDaySummary(content: string): boolean {
  return !containsAnyWorkout(content) && !containsAnyDaySummary(content);
}

/**
 * The day's recovery and sleep as prose.
 *
 * Deliberately sentences rather than table rows: none of this describes the
 * workout it sits above, and folding it into that table would imply it did.
 * Every clause is dropped when its number is missing, so a partially scored day
 * still reads as English.
 *
 * Both figures are settled by the time any workout exists to write them against
 * — WHOOP scores them once in the morning and they do not move.
 */
export function renderDaySummary(context: DayContext): string {
  if (!hasDayContext(context)) return "";

  const sentences = [recoverySentence(context), sleepSentence(context)].filter(
    (s): s is string => s !== null
  );

  if (sentences.length === 0) return "";
  return `${sentences.join(" ")}\n${dayMarker(context.date)}`;
}

function recoverySentence(context: DayContext): string | null {
  const score = context.recovery?.score;
  if (!score) return null;

  const clauses: string[] = [];
  if (isPositive(score.resting_heart_rate)) {
    clauses.push(`a resting heart rate of ${Math.round(score.resting_heart_rate)} bpm`);
  }
  if (isPositive(score.hrv_rmssd_milli)) {
    clauses.push(`HRV of ${Math.round(score.hrv_rmssd_milli)} ms`);
  }
  if (isPositive(score.spo2_percentage)) {
    clauses.push(`blood oxygen at ${Math.round(score.spo2_percentage)}%`);
  }

  if (!isPositive(score.recovery_score)) {
    if (clauses.length === 0) return null;
    return `WHOOP recorded ${joinClauses(clauses)} that morning.`;
  }

  const calibrating = score.user_calibrating
    ? " WHOOP was still calibrating, so treat that figure loosely."
    : "";
  const detail = clauses.length > 0 ? `, with ${joinClauses(clauses)}` : "";
  return `Recovery that morning was ${Math.round(score.recovery_score)}%${detail}.${calibrating}`;
}

function sleepSentence(context: DayContext): string | null {
  const sleep = context.sleep;
  if (!sleep?.score) return null;

  const slept = asleepMs(sleep);
  const needed = sleepNeededMs(sleep);
  const performance = sleep.score.sleep_performance_percentage;
  const efficiency = sleep.score.sleep_efficiency_percentage;

  let opening: string;
  if (slept !== null) {
    opening = `The night before brought ${formatDuration(slept)} of sleep`;
    if (needed !== null) {
      opening += ` against a need of ${formatDuration(needed)}`;
    }
  } else if (isPositive(performance)) {
    opening = `Sleep the night before scored ${Math.round(performance)}%`;
  } else {
    return null;
  }

  const tail: string[] = [];
  if (slept !== null && isPositive(performance)) {
    tail.push(`${Math.round(performance)}% sleep performance`);
  }
  if (isPositive(efficiency)) {
    tail.push(`${Math.round(efficiency)}% efficiency`);
  }
  const disturbances = sleep.score.stage_summary?.disturbance_count;
  if (Number.isFinite(disturbances) && (disturbances as number) > 0) {
    tail.push(`${disturbances} disturbances`);
  }

  return tail.length > 0 ? `${opening} — ${joinClauses(tail)}.` : `${opening}.`;
}

/** "a, b and c" — an Oxford-comma-free list for prose. */
function joinClauses(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function isPositive(value: number | undefined): value is number {
  return Number.isFinite(value) && (value as number) > 0;
}

/**
 * Renders one workout as a self-contained Markdown block: a heading plus a
 * metric table. No day-level scaffolding or navigation links, because this gets
 * dropped into notes that already have their own structure.
 */
export function renderWorkoutSnippet(
  workout: Workout,
  options: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS
): string {
  const level = clampHeadingLevel(options.headingLevel);
  const name = sportName(workout);
  const emoji = options.includeEmoji ? `${sportEmoji(workout.sport_id)} ` : "";
  const timestamp = formatDateTime(
    workout.start,
    workout.timezone_offset,
    options.dateFormat
  );

  const lines: string[] = [`${"#".repeat(level)} ${emoji}${name} — ${timestamp}`, ""];

  const rows = buildRows(workout, options);
  if (rows.length === 0) {
    lines.push(
      `_No score available for this workout (${workout.score_state ?? "unknown state"})._`
    );
  } else {
    lines.push("| Metric | Value |", "|--------|-------|");
    for (const [label, value] of rows) {
      lines.push(`| ${label} | ${escapeCell(value)} |`);
    }

    if (workout.score_state && workout.score_state !== "SCORED") {
      lines.push("", `_Score state: ${workout.score_state}._`);
    }
  }

  lines.push(workoutMarker(workout.id));
  return lines.join("\n");
}

function buildRows(
  workout: Workout,
  options: TemplateOptions
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const elapsed = durationMs(workout.start, workout.end);
  const unit = options.distanceUnit;
  const score = workout.score;

  if (score && Number.isFinite(score.strain)) {
    rows.push(["Strain", score.strain.toFixed(1)]);
  }

  if (Number.isFinite(elapsed) && elapsed > 0) {
    rows.push(["Duration", formatDuration(elapsed)]);
  }

  if (!score) return rows;

  const distance = score.distance_meter ?? 0;
  if (distance > 0) {
    rows.push(["Distance", formatDistance(distance, unit)]);

    if (SPEED_SPORT_IDS.has(workout.sport_id)) {
      const speed = formatSpeed(elapsed, distance, unit);
      if (speed) rows.push(["Avg speed", speed]);
    } else {
      const pace = formatPace(elapsed, distance, unit);
      if (pace) rows.push(["Pace", pace]);
    }
  } else if (DISTANCE_SPORT_IDS.has(workout.sport_id)) {
    // A run with no distance usually means GPS never locked — say so rather
    // than silently dropping the row.
    rows.push(["Distance", "not recorded"]);
  }

  if (score.average_heart_rate > 0) {
    rows.push(["Avg HR", formatHeartRate(score.average_heart_rate, options.maxHeartRate)]);
  }
  if (score.max_heart_rate > 0) {
    rows.push(["Max HR", formatHeartRate(score.max_heart_rate, options.maxHeartRate)]);
  }
  if (score.kilojoule > 0) {
    rows.push(["Calories", `${Math.round(kilojoulesToKcal(score.kilojoule))} kcal`]);
  }

  if (score.kilojoule > 0 && options.includeRates) {
    const perHour = ratePerHour(kilojoulesToKcal(score.kilojoule), elapsed);
    if (perHour !== null) rows.push(["Calorie rate", `${Math.round(perHour)} kcal/h`]);
  }

  if (options.includeRates && Number.isFinite(score.strain) && score.strain > 0) {
    const perHour = ratePerHour(score.strain, elapsed);
    if (perHour !== null) rows.push(["Strain rate", `${perHour.toFixed(1)} /h`]);
  }

  if (score.altitude_gain_meter > 0) {
    rows.push(["Elevation gain", formatElevation(score.altitude_gain_meter, unit)]);
  }

  // Net change only earns a row when it says something the gain does not — on a
  // loop it is ~0, and repeating the gain on an out-and-back is noise.
  const net = score.altitude_change_meter;
  if (
    Number.isFinite(net) &&
    Math.abs(net) >= 1 &&
    Math.round(net) !== Math.round(score.altitude_gain_meter)
  ) {
    const sign = net > 0 ? "+" : "−";
    rows.push(["Net elevation", `${sign}${formatElevation(Math.abs(net), unit)}`]);
  }

  const zones = zoneDurations(score);
  if (options.includeZoneDurations && zones) {
    const total = totalZoneMs(zones);
    for (const [key, label] of ZONE_LABELS) {
      const ms = zones[key];
      if (Number.isFinite(ms) && ms > 0) {
        rows.push([label, withShare(formatDuration(ms), ms, total)]);
      }
    }

    const hardMs = HARD_ZONE_KEYS.reduce((sum, key) => {
      const ms = zones[key];
      return Number.isFinite(ms) && ms > 0 ? sum + ms : sum;
    }, 0);
    if (hardMs > 0) {
      rows.push(["Time in zone 3+", withShare(formatDuration(hardMs), hardMs, total)]);
    }
  }

  const recorded = percentRecorded(score);
  if (options.includeDataCompleteness && recorded !== null) {
    rows.push(["Data completeness", `${Math.round(recorded)}%`]);
  }

  return rows;
}

/**
 * "159 bpm (80% of max)". The percentage is dropped when the max is unknown, and
 * when the reading exceeds it — a bpm above your recorded max means the max is
 * stale, not that you trained at 104%.
 */
export function formatHeartRate(bpm: number, maxHeartRate: number | null): string {
  const rounded = Math.round(bpm);
  if (!maxHeartRate || maxHeartRate <= 0 || rounded > maxHeartRate) {
    return `${rounded} bpm`;
  }
  return `${rounded} bpm (${Math.round((rounded / maxHeartRate) * 100)}% of max)`;
}

/** "12 min (34%)" — the share is omitted when there is no total to divide by. */
function withShare(text: string, ms: number, totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return text;
  return `${text} (${Math.round((ms / totalMs) * 100)}%)`;
}

/** Converts a per-workout total into a per-hour rate. */
function ratePerHour(value: number, elapsedMs: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }
  return value / (elapsedMs / 3_600_000);
}

function formatElevation(meters: number, unit: DistanceUnit): string {
  if (unit === "miles") return `${Math.round(meters / METERS_PER_FOOT)} ft`;
  return `${Math.round(meters)} m`;
}

/**
 * Full note: YAML frontmatter for querying, then the same snippet as the body.
 *
 * A new note is by definition the first WHOOP block on its page, so the day
 * sentence goes in whenever there is a context to render.
 */
export function renderWorkoutNote(
  workout: Workout,
  options: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS,
  context: DayContext | null = null
): string {
  const unit = options.distanceUnit;
  const elapsed = durationMs(workout.start, workout.end);
  const score = workout.score;

  const front: Array<[string, string]> = [
    ["whoop_workout_id", yamlString(workout.id)],
    ["date", workoutDateStamp(workout.start, workout.timezone_offset)],
    ["sport", yamlString(sportName(workout))],
    ["sport_id", String(workout.sport_id)],
    ["start", yamlString(workout.start)],
    ["end", yamlString(workout.end)],
    ["timezone_offset", yamlString(workout.timezone_offset ?? "")],
    ["duration_minutes", String(Math.round(elapsed / 60_000))],
  ];

  if (score) {
    if (Number.isFinite(score.strain)) {
      front.push(["strain", score.strain.toFixed(1)]);
    }
    const distance = score.distance_meter ?? 0;
    if (distance > 0) {
      front.push([
        `distance_${unit === "miles" ? "miles" : "km"}`,
        convertDistance(score.distance_meter, unit).toFixed(2),
      ]);

      // Numeric rather than the table's "5:14 /km", so it sorts and averages in
      // a Dataview or Bases query instead of only reading well.
      if (SPEED_SPORT_IDS.has(workout.sport_id)) {
        const speed = speedPerHour(elapsed, distance, unit);
        if (speed !== null) {
          front.push([`avg_speed_${unit === "miles" ? "mph" : "kmh"}`, speed.toFixed(1)]);
        }
      } else {
        const seconds = paceSecondsPerUnit(elapsed, distance, unit);
        if (seconds !== null) {
          front.push([
            `pace_seconds_per_${unit === "miles" ? "mile" : "km"}`,
            String(seconds),
          ]);
        }
      }
    }
    if (score.average_heart_rate > 0) {
      front.push(["average_heart_rate", String(Math.round(score.average_heart_rate))]);
    }
    if (score.max_heart_rate > 0) {
      front.push(["max_heart_rate", String(Math.round(score.max_heart_rate))]);
    }
    if (score.kilojoule > 0) {
      front.push(["kilocalories", String(Math.round(kilojoulesToKcal(score.kilojoule)))]);
    }
    if (score.altitude_gain_meter > 0) {
      front.push([
        `elevation_gain_${unit === "miles" ? "feet" : "m"}`,
        String(
          unit === "miles"
            ? Math.round(score.altitude_gain_meter / METERS_PER_FOOT)
            : Math.round(score.altitude_gain_meter)
        ),
      ]);
    }

    const zones = zoneDurations(score);
    if (zones) {
      for (const [key, label] of ZONE_LABELS) {
        const ms = zones[key];
        if (Number.isFinite(ms) && ms > 0) {
          // "Zone 3 time" -> zone_3_minutes
          const field = label.toLowerCase().replace(" time", "").replace(" ", "_");
          front.push([`${field}_minutes`, String(Math.round(ms / 60_000))]);
        }
      }
    }

    const recorded = percentRecorded(score);
    if (recorded !== null) {
      front.push(["percent_recorded", String(Math.round(recorded))]);
    }
  }

  const lines = ["---"];
  for (const [key, value] of front) lines.push(`${key}: ${value}`);
  lines.push("tags:", "  - whoop", "  - workout", "---", "");

  const summary = context ? renderDaySummary(context) : "";
  if (summary) lines.push(summary, "");

  lines.push(renderWorkoutSnippet(workout, options), "");

  return lines.join("\n");
}

/**
 * Default path for "create new note", built from a token template.
 * Tokens: {{date}} {{time}} {{sport}} {{id}} {{unit}}
 */
export function suggestNotePath(
  workout: Workout,
  folder: string,
  filenameTemplate: string,
  unit: DistanceUnit
): string {
  const values: Record<string, string> = {
    date: workoutDateStamp(workout.start, workout.timezone_offset),
    time: formatDateTime(workout.start, workout.timezone_offset, "HHmm"),
    sport: sportName(workout),
    id: workout.id,
    unit: unitLabel(unit),
  };

  const rendered = filenameTemplate.replace(
    /\{\{\s*(date|time|sport|id|unit)\s*\}\}/g,
    (_match, token: string) => values[token]
  );

  const filename = sanitizeFileName(rendered) || "WHOOP workout";
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}.md` : `${filename}.md`;
}

/** Strips characters that are illegal in vault paths on at least one platform. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}

/**
 * Normalizes a user-typed destination into a vault-relative `.md` path,
 * sanitizing each folder segment. Returns null when nothing usable is left.
 */
export function normalizeNotePath(input: string): string | null {
  const trimmed = input.trim().replace(/^\/+/, "");
  if (!trimmed) return null;

  const withoutExt = trimmed.replace(/\.md$/i, "");
  const segments = withoutExt
    .split("/")
    .map((segment) => sanitizeFileName(segment))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  return normalizePath(`${segments.join("/")}.md`);
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) return 3;
  return Math.min(6, Math.max(1, Math.round(level)));
}

/** Escapes pipes so a value can never break out of a table cell. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

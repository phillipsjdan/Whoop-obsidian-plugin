import { normalizePath } from "obsidian";
import {
  DISTANCE_SPORT_IDS,
  Workout,
  sportEmoji,
  sportName,
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
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  distanceUnit: "km",
  dateFormat: "YYYY-MM-DD HH:mm",
  headingLevel: 3,
  includeEmoji: true,
  includeZoneDurations: true,
  includeDataCompleteness: true,
};

/** Sports where average speed reads better than pace. */
const SPEED_SPORT_IDS = new Set<number>([1, 28, 29, 57, 91, 92, 97, 99]);

const METERS_PER_FOOT = 0.3048;

const ZONE_LABELS: Array<[keyof ZoneDurationLike, string]> = [
  ["zone_one_milli", "Zone 1 time"],
  ["zone_two_milli", "Zone 2 time"],
  ["zone_three_milli", "Zone 3 time"],
  ["zone_four_milli", "Zone 4 time"],
  ["zone_five_milli", "Zone 5 time"],
];

interface ZoneDurationLike {
  zone_zero_milli: number;
  zone_one_milli: number;
  zone_two_milli: number;
  zone_three_milli: number;
  zone_four_milli: number;
  zone_five_milli: number;
}

const MARKER_PREFIX = "<!-- whoop-workout:";

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
    rows.push(["Avg HR", `${Math.round(score.average_heart_rate)} bpm`]);
  }
  if (score.max_heart_rate > 0) {
    rows.push(["Max HR", `${Math.round(score.max_heart_rate)} bpm`]);
  }
  if (score.kilojoule > 0) {
    rows.push(["Calories", `${Math.round(kilojoulesToKcal(score.kilojoule))} kcal`]);
  }

  if (score.altitude_gain_meter > 0) {
    rows.push(["Elevation gain", formatElevation(score.altitude_gain_meter, unit)]);
  }

  if (options.includeZoneDurations && score.zone_duration) {
    for (const [key, label] of ZONE_LABELS) {
      const ms = score.zone_duration[key];
      if (Number.isFinite(ms) && ms > 0) {
        rows.push([label, formatDuration(ms)]);
      }
    }
  }

  if (options.includeDataCompleteness && Number.isFinite(score.percent_recorded)) {
    rows.push(["Data completeness", `${Math.round(score.percent_recorded)}%`]);
  }

  return rows;
}

function formatElevation(meters: number, unit: DistanceUnit): string {
  if (unit === "miles") return `${Math.round(meters / METERS_PER_FOOT)} ft`;
  return `${Math.round(meters)} m`;
}

/** Full note: YAML frontmatter for querying, then the same snippet as the body. */
export function renderWorkoutNote(
  workout: Workout,
  options: TemplateOptions = DEFAULT_TEMPLATE_OPTIONS
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
    if ((score.distance_meter ?? 0) > 0) {
      front.push([
        `distance_${unit === "miles" ? "miles" : "km"}`,
        convertDistance(score.distance_meter, unit).toFixed(2),
      ]);
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
  }

  const lines = ["---"];
  for (const [key, value] of front) lines.push(`${key}: ${value}`);
  lines.push("tags:", "  - whoop", "  - workout", "---", "");
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

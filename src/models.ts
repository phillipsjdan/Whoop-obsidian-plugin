/**
 * TypeScript models for the subset of the WHOOP v2 developer API this plugin
 * uses. Workouts only — recovery, sleep and cycle data are out of scope.
 *
 * The interfaces and the SPORT_NAMES table are adapted from
 * benstraw/obsidian-whoop-plugin (MIT).
 */

export interface ZoneDuration {
  zone_zero_milli: number;
  zone_one_milli: number;
  zone_two_milli: number;
  zone_three_milli: number;
  zone_four_milli: number;
  zone_five_milli: number;
}

export interface WorkoutScore {
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule: number;
  /**
   * How much of the activity WHOOP actually captured. Responses have been seen
   * using both a 0–100 percentage and a 0–1 fraction, so read it through
   * {@link percentRecorded} rather than directly.
   */
  percent_recorded: number;
  distance_meter: number;
  altitude_gain_meter: number;
  /** Net change from start to finish; negative for a net descent. */
  altitude_change_meter: number;
  /** v2 spelling. */
  zone_durations?: ZoneDuration;
  /** v1 spelling. Still returned by some responses, so both are accepted. */
  zone_duration?: ZoneDuration;
}

const ZONE_KEYS: Array<keyof ZoneDuration> = [
  "zone_zero_milli",
  "zone_one_milli",
  "zone_two_milli",
  "zone_three_milli",
  "zone_four_milli",
  "zone_five_milli",
];

/**
 * Heart rate zone durations, under whichever key the response used.
 *
 * v2 renamed `zone_duration` to `zone_durations`, and reading only the old name
 * silently dropped the whole breakdown. An object with nothing but zeros — which
 * is what an unscored or partially recorded workout yields — counts as absent so
 * callers do not render six empty rows.
 */
export function zoneDurations(score: WorkoutScore): ZoneDuration | null {
  const zones = score.zone_durations ?? score.zone_duration;
  if (!zones) return null;

  const hasTime = ZONE_KEYS.some((key) => {
    const ms = zones[key];
    return Number.isFinite(ms) && ms > 0;
  });
  return hasTime ? zones : null;
}

/** Total milliseconds across every zone, including zone 0. */
export function totalZoneMs(zones: ZoneDuration): number {
  return ZONE_KEYS.reduce((sum, key) => {
    const ms = zones[key];
    return Number.isFinite(ms) && ms > 0 ? sum + ms : sum;
  }, 0);
}

/**
 * Normalizes `percent_recorded` to 0–100.
 *
 * The documented scale is 0–100, but real responses have carried a 0–1 fraction
 * — a fully recorded run arriving as `1` and rendering as "1%". Anything at or
 * below 1 is therefore read as a fraction. That does mistake a genuine 1% for
 * 100%, which is an acceptable trade: a workout WHOOP captured 1% of does not
 * reach a scored state with usable metrics anyway.
 */
export function percentRecorded(score: WorkoutScore): number | null {
  const raw = score.percent_recorded;
  if (!Number.isFinite(raw) || raw < 0) return null;
  return raw > 0 && raw <= 1 ? raw * 100 : raw;
}

export interface Workout {
  id: string;
  v1_id?: number | null;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  /** ISO8601 instant. */
  start: string;
  /** ISO8601 instant. */
  end: string;
  /** UTC offset the workout was recorded in, e.g. "-07:00". */
  timezone_offset: string;
  /**
   * WHOOP's spec marks this optional and dates its removal to 09/01/2025, but a
   * note rendered on 2026-08-09 still had a sport-specific emoji in its heading,
   * which is only reachable through this field. It is typed required on that
   * evidence. Should it ever actually go, the fallout is silent rather than
   * fatal — see the note in CLAUDE.md.
   */
  sport_id: number;
  /** May be absent or empty; fall back to SPORT_NAMES[sport_id]. */
  sport_name?: string;
  /** "SCORED" | "PENDING_SCORE" | "UNSCORABLE" */
  score_state: string;
  /** Absent unless score_state is "SCORED". */
  score?: WorkoutScore;
}

export interface PaginatedResponse<T> {
  records: T[];
  next_token?: string | null;
}

/**
 * Day-level records. Every score field is optional: WHOOP omits scores that are
 * still pending, and the renderer drops any clause it has no number for rather
 * than printing a blank.
 */

export interface RecoveryScore {
  /** True while WHOOP is still establishing a baseline; the score is unreliable. */
  user_calibrating?: boolean;
  recovery_score?: number;
  resting_heart_rate?: number;
  hrv_rmssd_milli?: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
}

export interface Recovery {
  cycle_id?: number;
  sleep_id?: string;
  score_state?: string;
  score?: RecoveryScore;
}

export interface SleepStageSummary {
  total_in_bed_time_milli?: number;
  total_awake_time_milli?: number;
  total_no_data_time_milli?: number;
  total_light_sleep_time_milli?: number;
  total_slow_wave_sleep_time_milli?: number;
  total_rem_sleep_time_milli?: number;
  sleep_cycle_count?: number;
  disturbance_count?: number;
}

export interface SleepNeeded {
  baseline_milli?: number;
  need_from_sleep_debt_milli?: number;
  need_from_recent_strain_milli?: number;
  need_from_recent_nap_milli?: number;
}

export interface SleepScore {
  stage_summary?: SleepStageSummary;
  sleep_needed?: SleepNeeded;
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
}

export interface Sleep {
  id: string;
  start: string;
  end: string;
  timezone_offset?: string;
  nap?: boolean;
  score_state?: string;
  score?: SleepScore;
}

/**
 * Height, weight and max heart rate. Only the max heart rate is used — it is the
 * denominator that turns a bare bpm figure into an intensity.
 */
export interface BodyMeasurement {
  height_meter?: number;
  weight_kilogram?: number;
  max_heart_rate?: number;
}

/**
 * The day a workout happened in, as far as WHOOP knows. Either part may be
 * absent.
 *
 * Day strain is deliberately not here. The cycle endpoint reports strain
 * accumulated so far, not the day's total or the app's strain target, so for a
 * workout filed the same day it is a snapshot that is stale by the time it is
 * read — and reading like a settled figure is worse than saying nothing.
 */
export interface DayContext {
  /** Local calendar day, YYYY-MM-DD — identifies the summary in a note. */
  date: string;
  recovery: Recovery | null;
  sleep: Sleep | null;
}

/** True when there is at least one number worth writing a sentence about. */
export function hasDayContext(context: DayContext | null): boolean {
  if (!context) return false;
  return Boolean(context.recovery?.score || context.sleep?.score);
}

/**
 * Total time actually asleep: time in bed less time awake.
 *
 * WHOOP reports the stages rather than a single total, and in-bed time on its
 * own overstates a night with long wakes in it.
 */
export function asleepMs(sleep: Sleep): number | null {
  const stages = sleep.score?.stage_summary;
  if (!stages) return null;
  const inBed = stages.total_in_bed_time_milli;
  if (!Number.isFinite(inBed) || (inBed ?? 0) <= 0) return null;
  const awake = Number.isFinite(stages.total_awake_time_milli)
    ? (stages.total_awake_time_milli as number)
    : 0;
  return Math.max(0, (inBed as number) - awake);
}

/** Sleep WHOOP judged was needed, summing the baseline and its adjustments. */
export function sleepNeededMs(sleep: Sleep): number | null {
  const needed = sleep.score?.sleep_needed;
  if (!needed) return null;
  const parts = [
    needed.baseline_milli,
    needed.need_from_sleep_debt_milli,
    needed.need_from_recent_strain_milli,
    needed.need_from_recent_nap_milli,
  ];
  let total = 0;
  let sawBaseline = false;
  for (const part of parts) {
    if (!Number.isFinite(part)) continue;
    total += part as number;
    sawBaseline = true;
  }
  return sawBaseline && total > 0 ? total : null;
}

/**
 * Human-readable name for a WHOOP sport_id.
 *
 * v2 populates `sport_name` in lower case ("running"), which would otherwise put
 * a lower-case heading on every note. The lookup table holds the presentable
 * form, including the ones blind title-casing would mangle — "HIIT", not "Hiit".
 * A name that is not simply the table's entry in another case is left alone, so
 * anything WHOOP starts sending with its own capitalisation survives.
 */
export function sportName(workout: Pick<Workout, "sport_id" | "sport_name">): string {
  const explicit = workout.sport_name?.trim();
  const known = SPORT_NAMES[workout.sport_id];

  if (!explicit) return known ?? `Sport ${workout.sport_id}`;
  if (known && explicit.toLowerCase() === known.toLowerCase()) return known;
  return explicit === explicit.toLowerCase() ? titleCase(explicit) : explicit;
}

/** Capitalises each word, leaving separators like "/" and "-" in place. */
function titleCase(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => word[0].toUpperCase() + word.slice(1));
}

export const SPORT_NAMES: Record<number, string> = {
  "-1": "Activity",
  0: "Running",
  1: "Cycling",
  16: "Baseball",
  17: "Basketball",
  18: "Rowing",
  19: "Fencing",
  20: "Field Hockey",
  21: "Football",
  22: "Golf",
  24: "Ice Hockey",
  25: "Lacrosse",
  27: "Rugby",
  28: "Sailing",
  29: "Skiing",
  30: "Soccer",
  31: "Softball",
  32: "Squash",
  33: "Swimming",
  34: "Tennis",
  35: "Track & Field",
  36: "Volleyball",
  37: "Water Polo",
  38: "Wrestling",
  39: "Boxing",
  42: "Dance",
  43: "Pilates",
  44: "Yoga",
  45: "Weightlifting",
  47: "Cross Country Skiing",
  48: "Functional Fitness",
  49: "Duathlon",
  51: "Gymnastics",
  52: "Hiking/Rucking",
  53: "Horseback Riding",
  55: "Kayaking",
  56: "Martial Arts",
  57: "Mountain Biking",
  59: "Powerlifting",
  60: "Rock Climbing",
  61: "Paddleboarding",
  62: "Triathlon",
  63: "Walking",
  64: "Surfing",
  65: "Elliptical",
  66: "Stairmaster",
  70: "Meditation",
  71: "Other",
  73: "Diving",
  74: "Operations - Tactical",
  75: "Operations - Medical",
  76: "Operations - Flying",
  77: "Operations - Water",
  82: "Ultimate",
  83: "Climber",
  84: "Jumping Rope",
  85: "Australian Football",
  86: "Skateboarding",
  87: "Coaching",
  88: "Ice Bath",
  89: "Commuting",
  90: "Gaming",
  91: "Snowboarding",
  92: "Motocross",
  93: "Cricket",
  94: "Pickleball",
  95: "Badminton",
  96: "Obstacle Course Racing",
  97: "Motor Racing",
  98: "HIIT",
  99: "Spin",
  100: "Jiu Jitsu",
  101: "Manual Labor",
  103: "Archery",
};

/** Sports where a distance-based pace (min/km, min/mi) is meaningful. */
export const DISTANCE_SPORT_IDS = new Set<number>([
  0, // Running
  1, // Cycling
  18, // Rowing
  33, // Swimming
  35, // Track & Field
  47, // Cross Country Skiing
  49, // Duathlon
  52, // Hiking/Rucking
  57, // Mountain Biking
  61, // Paddleboarding
  62, // Triathlon
  63, // Walking
  89, // Commuting
  96, // Obstacle Course Racing
]);

/** Emoji used in the snippet heading, keyed by sport_id. */
export const SPORT_EMOJI: Record<number, string> = {
  0: "🏃",
  1: "🚴",
  17: "🏀",
  18: "🚣",
  21: "🏈",
  22: "⛳",
  29: "⛷️",
  30: "⚽",
  32: "🎾",
  33: "🏊",
  34: "🎾",
  35: "🏃",
  39: "🥊",
  43: "🧘",
  44: "🧘",
  45: "🏋️",
  47: "🎿",
  48: "💪",
  51: "🤸",
  52: "🥾",
  55: "🛶",
  56: "🥋",
  57: "🚵",
  59: "🏋️",
  60: "🧗",
  61: "🏄",
  62: "🏅",
  63: "🚶",
  64: "🏄",
  65: "🏃",
  66: "🪜",
  70: "🧘",
  84: "🪢",
  86: "🛹",
  88: "🧊",
  91: "🏂",
  94: "🏓",
  95: "🏸",
  98: "🔥",
  99: "🚴",
  100: "🥋",
};

export function sportEmoji(sportId: number): string {
  return SPORT_EMOJI[sportId] ?? "💪";
}

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

/** Human-readable name for a WHOOP sport_id. */
export function sportName(workout: Pick<Workout, "sport_id" | "sport_name">): string {
  const explicit = workout.sport_name?.trim();
  if (explicit) return explicit;
  return SPORT_NAMES[workout.sport_id] ?? `Sport ${workout.sport_id}`;
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

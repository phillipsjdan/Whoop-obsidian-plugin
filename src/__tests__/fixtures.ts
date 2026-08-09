import { Workout, WorkoutScore, ZoneDuration } from "../models.ts";

export function zoneDuration(overrides: Partial<ZoneDuration> = {}): ZoneDuration {
  return {
    zone_zero_milli: 0,
    zone_one_milli: 0,
    zone_two_milli: 0,
    zone_three_milli: 0,
    zone_four_milli: 0,
    zone_five_milli: 0,
    ...overrides,
  };
}

export function workoutScore(overrides: Partial<WorkoutScore> = {}): WorkoutScore {
  return {
    strain: 12.4,
    average_heart_rate: 148,
    max_heart_rate: 167,
    kilojoule: 2560.6,
    percent_recorded: 98,
    distance_meter: 8020,
    altitude_gain_meter: 0,
    altitude_change_meter: 0,
    zone_duration: zoneDuration({
      zone_two_milli: 900_000,
      zone_three_milli: 1_140_000,
      zone_four_milli: 300_000,
      zone_five_milli: 180_000,
    }),
    ...overrides,
  };
}

/** A 42-minute, 8.02 km run starting 07:12 local time at UTC-07:00. */
export function runningWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "b5f2c1a0-1111-4a2b-9c3d-000000000001",
    start: "2026-08-09T14:12:00.000Z",
    end: "2026-08-09T14:54:00.000Z",
    timezone_offset: "-07:00",
    sport_id: 0,
    sport_name: "",
    score_state: "SCORED",
    score: workoutScore(),
    ...overrides,
  };
}

/** A 90-minute, 40 km ride — exercises the speed-instead-of-pace branch. */
export function cyclingWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "b5f2c1a0-2222-4a2b-9c3d-000000000002",
    start: "2026-08-09T16:00:00.000Z",
    end: "2026-08-09T17:30:00.000Z",
    timezone_offset: "-07:00",
    sport_id: 1,
    sport_name: "Cycling",
    score_state: "SCORED",
    score: workoutScore({
      strain: 14.1,
      distance_meter: 40_000,
      altitude_gain_meter: 610,
      percent_recorded: 100,
      zone_duration: zoneDuration({ zone_three_milli: 3_600_000 }),
    }),
    ...overrides,
  };
}

/** Strength work: no distance, so no pace row. */
export function liftingWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "b5f2c1a0-3333-4a2b-9c3d-000000000003",
    start: "2026-08-09T23:00:00.000Z",
    end: "2026-08-10T00:05:00.000Z",
    timezone_offset: "-07:00",
    sport_id: 45,
    sport_name: "Weightlifting",
    score_state: "SCORED",
    score: workoutScore({
      strain: 9.7,
      distance_meter: 0,
      kilojoule: 1200,
      percent_recorded: 100,
      zone_duration: zoneDuration({ zone_one_milli: 2_400_000 }),
    }),
    ...overrides,
  };
}

/** Recorded but not yet scored — score is absent entirely. */
export function pendingWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "b5f2c1a0-4444-4a2b-9c3d-000000000004",
    start: "2026-08-09T12:00:00.000Z",
    end: "2026-08-09T12:30:00.000Z",
    timezone_offset: "-07:00",
    sport_id: 52,
    score_state: "PENDING_SCORE",
    ...overrides,
  };
}

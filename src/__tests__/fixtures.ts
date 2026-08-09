import {
  Cycle,
  DayContext,
  Recovery,
  Sleep,
  Workout,
  WorkoutScore,
  ZoneDuration,
} from "../models.ts";

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
    zone_durations: zoneDuration({
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
      zone_durations: zoneDuration({ zone_three_milli: 3_600_000 }),
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
      zone_durations: zoneDuration({ zone_one_milli: 2_400_000 }),
    }),
    ...overrides,
  };
}

/** Day strain of 14.2 for the cycle starting 2026-08-09 local. */
export function cycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: 93845,
    start: "2026-08-09T11:00:00.000Z",
    end: "2026-08-10T11:00:00.000Z",
    timezone_offset: "-07:00",
    score_state: "SCORED",
    score: { strain: 14.2, kilojoule: 9800, average_heart_rate: 74, max_heart_rate: 180 },
    ...overrides,
  };
}

export function recovery(overrides: Partial<Recovery> = {}): Recovery {
  return {
    cycle_id: 93845,
    sleep_id: "c1d2e3f4-0000-4a2b-9c3d-000000000010",
    score_state: "SCORED",
    score: {
      user_calibrating: false,
      recovery_score: 62,
      resting_heart_rate: 48,
      hrv_rmssd_milli: 78.4,
      spo2_percentage: 95.6,
      skin_temp_celsius: 33.2,
    },
    ...overrides,
  };
}

/** 7 h 30 min in bed, 18 min of it awake, ending on the morning of the 9th. */
export function sleep(overrides: Partial<Sleep> = {}): Sleep {
  return {
    id: "c1d2e3f4-0000-4a2b-9c3d-000000000010",
    start: "2026-08-09T04:30:00.000Z",
    end: "2026-08-09T12:00:00.000Z",
    timezone_offset: "-07:00",
    nap: false,
    score_state: "SCORED",
    score: {
      stage_summary: {
        total_in_bed_time_milli: 27_000_000,
        total_awake_time_milli: 1_080_000,
        total_light_sleep_time_milli: 13_000_000,
        total_slow_wave_sleep_time_milli: 6_500_000,
        total_rem_sleep_time_milli: 6_420_000,
        sleep_cycle_count: 5,
        disturbance_count: 9,
      },
      sleep_needed: {
        baseline_milli: 28_000_000,
        need_from_sleep_debt_milli: 1_200_000,
        need_from_recent_strain_milli: 900_000,
        need_from_recent_nap_milli: 0,
      },
      respiratory_rate: 14.6,
      sleep_performance_percentage: 86,
      sleep_consistency_percentage: 71,
      sleep_efficiency_percentage: 93,
    },
    ...overrides,
  };
}

export function dayContext(overrides: Partial<DayContext> = {}): DayContext {
  return {
    date: "2026-08-09",
    cycle: cycle(),
    recovery: recovery(),
    sleep: sleep(),
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

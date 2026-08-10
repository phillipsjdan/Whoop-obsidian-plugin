/**
 * Tags for an inserted workout block.
 *
 * The metric table is invisible to every query engine in Obsidian: Dataview
 * reads frontmatter and inline fields, Bases reads properties, and neither one
 * parses a rendered table. Frontmatter cannot fix that here either — it is one
 * flat namespace per note, so a page holding three workouts has nowhere to put
 * three strains under a single `strain:` key without indexed names no filter
 * can match on.
 *
 * Tags are the one form of metadata that is indexed, sits in the body beside
 * the block it describes, and is multi-valued by nature. Three workout blocks
 * on a page contribute three sets of tags and Obsidian indexes all of them.
 */

import { DayContext, Workout, sportName } from "./models.ts";

export const DEFAULT_TAG_PREFIX = "whoop";

/**
 * WHOOP's own strain bands are light 0–9.9, moderate 10–13.9, strenuous
 * 14–17.9 and all out 18–21. These boundaries are WHOOP's, with strenuous and
 * all out collapsed into one "high". Nothing below moderate is tagged: a tag
 * that lands on every workout partitions nothing, and the point of these is to
 * make the hard days findable.
 */
export const MODERATE_STRAIN = 10;
export const HIGH_STRAIN = 14;

export type StrainBand = "moderate" | "high";

/**
 * WHOOP's recovery colours: red 1–33%, yellow 34–66%, green 67–100%. Unlike
 * strain, every scored day falls in a band — recovery is a percentage of a
 * fixed range rather than an open-ended effort score, so there is no "light"
 * end to leave untagged.
 */
export const YELLOW_RECOVERY = 34;
export const GREEN_RECOVERY = 67;

export type RecoveryBand = "red" | "yellow" | "green";

export interface TagOptions {
  /** Tag namespace, without the leading "#". Empty means write no tags. */
  tagPrefix: string;
  /** `#whoop/sport/running` — the sport as a tag. */
  includeSportTag: boolean;
  /** `#whoop/strain/high` — only for a moderate or harder workout. */
  includeStrainTag: boolean;
  /** `#whoop/recovery/green` — on the day sentence, not the workout. */
  includeRecoveryTag: boolean;
}

export const DEFAULT_TAG_OPTIONS: TagOptions = {
  tagPrefix: DEFAULT_TAG_PREFIX,
  includeSportTag: true,
  includeStrainTag: true,
  includeRecoveryTag: true,
};

/** Which band a strain figure falls in, or null when it is light or missing. */
export function strainBand(strain: number | undefined): StrainBand | null {
  if (!Number.isFinite(strain)) return null;
  const value = strain as number;
  if (value >= HIGH_STRAIN) return "high";
  if (value >= MODERATE_STRAIN) return "moderate";
  return null;
}

/**
 * Which colour a recovery score falls in, or null when there is no usable
 * score. Zero is read as absent rather than as a very red day: WHOOP scores
 * recovery from 1, and the day sentence already treats a non-positive score as
 * a figure it does not have.
 */
export function recoveryBand(score: number | undefined): RecoveryBand | null {
  if (!Number.isFinite(score)) return null;
  const value = score as number;
  if (value <= 0) return null;
  if (value >= GREEN_RECOVERY) return "green";
  if (value >= YELLOW_RECOVERY) return "yellow";
  return "red";
}

/**
 * Tags for one workout block: what the sport was, and how hard it was.
 *
 * Namespaced (`#whoop/sport/running`, not `#whoop/running`) so the two kinds
 * never sit at the same level — Obsidian nests tags on `/`, so this keeps the
 * tag pane readable and lets `tag:#whoop/strain` match either band.
 */
export function workoutTags(workout: Workout, options: TagOptions): string[] {
  const prefix = normalizeTagPrefix(options.tagPrefix);
  if (!prefix) return [];

  const tags: string[] = [];

  if (options.includeSportTag) {
    tags.push(`#${prefix}/sport/${sportSlug(workout)}`);
  }

  if (options.includeStrainTag) {
    const band = strainBand(workout.score?.strain);
    if (band) tags.push(`#${prefix}/strain/${band}`);
  }

  return tags;
}

/**
 * Tags for the day sentence: how recovered the body was that morning.
 *
 * This belongs to the day rather than to any workout on it, which is why it
 * rides with the sentence — written once per note — instead of with each block.
 * Recovery is also the figure worth joining to your own writing: WHOOP can plot
 * it, but only the vault knows what you said about the days it was red.
 *
 * A score WHOOP is still calibrating gets no tag. The sentence can hedge it
 * ("treat that figure loosely") and a tag cannot, so tagging one would state as
 * fact exactly what the prose next to it disclaims.
 */
export function dayTags(context: DayContext, options: TagOptions): string[] {
  const prefix = normalizeTagPrefix(options.tagPrefix);
  if (!prefix || !options.includeRecoveryTag) return [];

  const score = context.recovery?.score;
  if (!score || score.user_calibrating) return [];

  const band = recoveryBand(score.recovery_score);
  return band ? [`#${prefix}/recovery/${band}`] : [];
}

/**
 * Lower-cases and strips a string down to what Obsidian will index as a tag.
 *
 * A space ends a tag, so "Track & Field" has to collapse to "track-field" or
 * only `#whoop/sport/track` would be picked up and the rest left as loose text.
 * `/` is folded to `-` rather than kept: it nests in Obsidian's tag tree, and
 * "Hiking/Rucking" is one sport, not a rucking sub-category of hiking.
 */
export function slugifyTag(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Cleans a user-typed prefix into something that can front a tag: no leading
 * "#", no characters that would end the tag early, and `/` preserved so the
 * whole namespace can nest under an existing tag like "health/whoop".
 *
 * Case is left as typed — it is the user's tag, and Obsidian matches tags
 * case-insensitively either way. Returns "" when nothing usable is left, which
 * callers read as "write no tags".
 */
export function normalizeTagPrefix(input: string): string {
  return input
    .trim()
    .replace(/^#+/, "")
    .split("/")
    .map((segment) =>
      segment.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "")
    )
    .filter((segment) => segment.length > 0)
    .join("/");
}

/**
 * The sport as a tag leaf, falling back to the id when the name slugs away to
 * nothing or to digits alone. Obsidian does not index a tag made only of
 * numbers, and an empty leaf would leave a trailing slash.
 */
function sportSlug(workout: Workout): string {
  const slug = slugifyTag(sportName(workout));
  if (!slug || /^\d+$/.test(slug)) return `sport-${workout.sport_id}`;
  return slug;
}

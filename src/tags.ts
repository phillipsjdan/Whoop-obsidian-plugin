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

import { Workout, sportName } from "./models.ts";

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

export interface TagOptions {
  /** Tag namespace, without the leading "#". Empty means write no tags. */
  tagPrefix: string;
  includeSportTag: boolean;
  includeStrainTag: boolean;
}

/** Which band a strain figure falls in, or null when it is light or missing. */
export function strainBand(strain: number | undefined): StrainBand | null {
  if (!Number.isFinite(strain)) return null;
  const value = strain as number;
  if (value >= HIGH_STRAIN) return "high";
  if (value >= MODERATE_STRAIN) return "moderate";
  return null;
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

/**
 * Version bumping for automated releases.
 *
 * Obsidian identifies a plugin release by a git tag that is exactly the version
 * — MAJOR.MINOR.PATCH with no `v` prefix — and expects manifest.json to carry
 * the same value, with versions.json mapping it to the minimum Obsidian version
 * it supports. This script keeps manifest.json, package.json and versions.json
 * in step so that contract cannot drift.
 *
 * Two subcommands, both configured through the environment so an arbitrary
 * commit message can never be mistaken for an argument:
 *
 *   decide   RELEASE_MESSAGE, RELEASE_OVERRIDE -> prints major|minor|patch|skip
 *   apply    RELEASE_BUMP                      -> writes the files, prints the new version
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BUMPS = ["major", "minor", "patch"];

const MANIFEST = "manifest.json";
const PACKAGE = "package.json";
const VERSIONS = "versions.json";

/** Parses a strict MAJOR.MINOR.PATCH version. Throws on anything else. */
export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? "").trim());
  if (!match) {
    throw new Error(
      `"${value}" is not a MAJOR.MINOR.PATCH version. Obsidian tags releases with the bare version, so pre-release and "v"-prefixed forms cannot be used.`
    );
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Increments a version. */
export function nextVersion(current, bump) {
  const { major, minor, patch } = parseVersion(current);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump "${bump}". Expected one of: ${BUMPS.join(", ")}.`);
  }
}

/**
 * Works out the bump for a merge from its commit message. Patch by default;
 * `[minor]` or `[major]` anywhere in the message overrides that, and
 * `[skip release]` suppresses the release entirely.
 *
 * A squash merge uses the pull request title and body as the commit message, so
 * putting `[major]` in the PR title is enough.
 */
export function bumpFromMessage(message) {
  const text = String(message ?? "");
  if (/\[(?:skip|no)[\s-]?release\]/i.test(text)) return null;
  if (/\[major\]/i.test(text)) return "major";
  if (/\[minor\]/i.test(text)) return "minor";
  if (/\[patch\]/i.test(text)) return "patch";
  return "patch";
}

/**
 * Resolves the bump to use. A manual override always wins over the message, so
 * a major release can be cut from the Actions tab without an empty commit.
 */
export function decideBump(message, override) {
  const chosen = String(override ?? "").trim();
  if (chosen) {
    if (!BUMPS.includes(chosen)) {
      throw new Error(`Unknown override "${chosen}". Expected one of: ${BUMPS.join(", ")}.`);
    }
    return chosen;
  }
  return bumpFromMessage(message);
}

/**
 * Produces the updated file contents for a new version. Pure: takes and returns
 * plain objects so the caller owns all the file IO.
 */
export function applyVersion({ manifest, pkg, versions }, version) {
  parseVersion(version);

  const minAppVersion = manifest?.minAppVersion;
  if (!minAppVersion) {
    throw new Error(`${MANIFEST} has no minAppVersion; versions.json cannot be updated without it.`);
  }
  parseVersion(minAppVersion);

  const current = parseVersion(manifest.version);
  const next = parseVersion(version);
  if (compare(next, current) <= 0) {
    throw new Error(
      `Refusing to move ${MANIFEST} from ${manifest.version} to ${version}: a release version must increase.`
    );
  }

  return {
    manifest: { ...manifest, version },
    pkg: { ...pkg, version },
    // Sorted so the file stays readable as releases accumulate.
    versions: sortVersions({ ...versions, [version]: minAppVersion }),
  };
}

function compare(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function sortVersions(versions) {
  return Object.fromEntries(
    Object.entries(versions).sort(([a], [b]) => compare(parseVersion(a), parseVersion(b)))
  );
}

// --- CLI -------------------------------------------------------------------

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function main(argv) {
  const command = argv[2];

  if (command === "decide") {
    const bump = decideBump(process.env.RELEASE_MESSAGE, process.env.RELEASE_OVERRIDE);
    process.stdout.write(`${bump ?? "skip"}\n`);
    return;
  }

  if (command === "apply") {
    const bump = String(process.env.RELEASE_BUMP ?? "").trim();
    if (!BUMPS.includes(bump)) {
      throw new Error(`RELEASE_BUMP must be one of: ${BUMPS.join(", ")}. Got "${bump}".`);
    }

    const manifest = readJson(MANIFEST);
    const pkg = readJson(PACKAGE);
    const versions = readJson(VERSIONS);
    const version = nextVersion(manifest.version, bump);

    const updated = applyVersion({ manifest, pkg, versions }, version);
    writeJson(MANIFEST, updated.manifest);
    writeJson(PACKAGE, updated.pkg);
    writeJson(VERSIONS, updated.versions);

    process.stdout.write(`${version}\n`);
    return;
  }

  throw new Error(`Usage: node scripts/version.mjs <decide|apply>`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

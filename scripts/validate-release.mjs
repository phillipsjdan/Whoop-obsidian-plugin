/**
 * Checks a built release against what Obsidian requires before anything is
 * tagged or published. Every rule here is one that would leave the plugin
 * uninstallable or invisible to the community directory and BRAT.
 *
 *   node scripts/validate-release.mjs <expected-version>
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseVersion } from "./version.mjs";

/** Files Obsidian downloads from a release, as individual assets — never a zip. */
export const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"];

/** Fields the plugin manifest must carry, with the type each must have. */
export const REQUIRED_MANIFEST_FIELDS = {
  id: "string",
  name: "string",
  version: "string",
  minAppVersion: "string",
  description: "string",
  author: "string",
  isDesktopOnly: "boolean",
};

/**
 * Returns a list of problems; empty means the release is good to publish.
 * Pure, so the rules are testable without building anything.
 */
export function findProblems({ manifest, versions, expectedVersion, assets }) {
  const problems = [];

  for (const [field, type] of Object.entries(REQUIRED_MANIFEST_FIELDS)) {
    if (manifest?.[field] === undefined) {
      problems.push(`manifest.json is missing the required field "${field}".`);
    } else if (typeof manifest[field] !== type) {
      problems.push(
        `manifest.json field "${field}" should be a ${type}, got ${typeof manifest[field]}.`
      );
    }
  }

  // Obsidian derives the plugin folder name from the id.
  if (typeof manifest?.id === "string" && !/^[a-z0-9-]+$/.test(manifest.id)) {
    problems.push(
      `manifest.json id "${manifest.id}" must be lowercase letters, digits and hyphens only.`
    );
  }

  for (const [label, value] of [
    ["version", manifest?.version],
    ["minAppVersion", manifest?.minAppVersion],
  ]) {
    if (typeof value !== "string") continue;
    try {
      parseVersion(value);
    } catch {
      problems.push(`manifest.json ${label} "${value}" must be MAJOR.MINOR.PATCH with no "v" prefix.`);
    }
  }

  // The release tag is the version verbatim, so these have to agree exactly.
  if (manifest?.version !== expectedVersion) {
    problems.push(
      `manifest.json version is "${manifest?.version}" but the release tag is "${expectedVersion}"; Obsidian requires them to match.`
    );
  }

  if (versions?.[expectedVersion] === undefined) {
    problems.push(`versions.json has no entry for "${expectedVersion}".`);
  } else if (versions[expectedVersion] !== manifest?.minAppVersion) {
    problems.push(
      `versions.json maps "${expectedVersion}" to "${versions[expectedVersion]}" but manifest.json declares minAppVersion "${manifest?.minAppVersion}".`
    );
  }

  for (const asset of RELEASE_ASSETS) {
    const found = assets?.[asset];
    if (found === undefined) {
      problems.push(`Release asset "${asset}" is missing.`);
    } else if (found <= 0) {
      problems.push(`Release asset "${asset}" is empty.`);
    }
  }

  return problems;
}

function main(argv) {
  const expectedVersion = argv[2];
  if (!expectedVersion) {
    throw new Error("Usage: node scripts/validate-release.mjs <expected-version>");
  }

  const assets = Object.fromEntries(
    RELEASE_ASSETS.map((name) => [name, existsSync(name) ? statSync(name).size : undefined]).filter(
      ([, size]) => size !== undefined
    )
  );

  const problems = findProblems({
    manifest: JSON.parse(readFileSync("manifest.json", "utf8")),
    versions: JSON.parse(readFileSync("versions.json", "utf8")),
    expectedVersion,
    assets,
  });

  if (problems.length > 0) {
    process.stderr.write(`Release ${expectedVersion} is not publishable:\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `Release ${expectedVersion} looks good: ${RELEASE_ASSETS.join(", ")} present, manifest and versions.json agree.\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

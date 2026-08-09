import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyVersion,
  bumpFromMessage,
  decideBump,
  nextVersion,
  parseVersion,
} from "../version.mjs";
import { RELEASE_ASSETS, findProblems } from "../validate-release.mjs";

describe("parseVersion", () => {
  it("reads a plain semver version", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("10.0.11")).toEqual({ major: 10, minor: 0, patch: 11 });
  });

  it("rejects a v prefix, which Obsidian tags must never carry", () => {
    expect(() => parseVersion("v1.2.3")).toThrow(/MAJOR\.MINOR\.PATCH/);
  });

  it("rejects pre-release and partial versions", () => {
    for (const bad of ["1.2", "1.2.3-beta", "1.2.3.4", "", "latest", null]) {
      expect(() => parseVersion(bad)).toThrow();
    }
  });
});

describe("nextVersion", () => {
  it("bumps patch", () => {
    expect(nextVersion("1.0.0", "patch")).toBe("1.0.1");
    expect(nextVersion("1.4.9", "patch")).toBe("1.4.10");
  });

  it("bumps minor and resets patch", () => {
    expect(nextVersion("1.4.9", "minor")).toBe("1.5.0");
  });

  it("bumps major and resets the rest", () => {
    expect(nextVersion("1.4.9", "major")).toBe("2.0.0");
    expect(nextVersion("0.9.3", "major")).toBe("1.0.0");
  });

  it("rejects an unknown bump", () => {
    expect(() => nextVersion("1.0.0", "huge")).toThrow(/Unknown bump/);
  });
});

describe("bumpFromMessage", () => {
  it("defaults to patch", () => {
    expect(bumpFromMessage("Fix the picker")).toBe("patch");
    expect(bumpFromMessage("")).toBe("patch");
    expect(bumpFromMessage(undefined)).toBe("patch");
  });

  it("honours an explicit marker anywhere in the message", () => {
    expect(bumpFromMessage("Add zone charts [minor]")).toBe("minor");
    expect(bumpFromMessage("[major] Rewrite the template engine")).toBe("major");
    expect(bumpFromMessage("Title\n\nBody explaining things\n\n[major]")).toBe("major");
  });

  it("is case insensitive", () => {
    expect(bumpFromMessage("Something [MAJOR]")).toBe("major");
  });

  it("lets major win over minor", () => {
    expect(bumpFromMessage("[minor] and also [major]")).toBe("major");
  });

  it("suppresses the release entirely on request", () => {
    expect(bumpFromMessage("Tidy the README [skip release]")).toBeNull();
    expect(bumpFromMessage("Docs only [no release]")).toBeNull();
    expect(bumpFromMessage("Docs only [skip-release]")).toBeNull();
  });

  it("lets a skip marker beat a bump marker", () => {
    expect(bumpFromMessage("[major] but [skip release]")).toBeNull();
  });

  it("does not fire on similar prose", () => {
    expect(bumpFromMessage("Discussing a major refactor later")).toBe("patch");
    expect(bumpFromMessage("This will skip release notes eventually")).toBe("patch");
  });
});

describe("decideBump", () => {
  it("uses the message when there is no override", () => {
    expect(decideBump("Add a thing [minor]", "")).toBe("minor");
    expect(decideBump("Add a thing [minor]", undefined)).toBe("minor");
  });

  it("lets a manual override win, even over a skip marker", () => {
    expect(decideBump("whatever [minor]", "major")).toBe("major");
    expect(decideBump("whatever [skip release]", "patch")).toBe("patch");
  });

  it("rejects an override it does not understand", () => {
    expect(() => decideBump("msg", "enormous")).toThrow(/Unknown override/);
  });
});

describe("applyVersion", () => {
  const base = {
    manifest: { id: "whoop-workout-insert", version: "1.0.0", minAppVersion: "1.5.0" },
    pkg: { name: "whoop-workout-insert", version: "1.0.0" },
    versions: { "1.0.0": "1.5.0" },
  };

  it("moves manifest and package to the new version together", () => {
    const result = applyVersion(base, "1.0.1");
    expect(result.manifest.version).toBe("1.0.1");
    expect(result.pkg.version).toBe("1.0.1");
  });

  it("records the new version against the manifest's minAppVersion", () => {
    expect(applyVersion(base, "1.1.0").versions).toEqual({
      "1.0.0": "1.5.0",
      "1.1.0": "1.5.0",
    });
  });

  it("picks up a raised minAppVersion", () => {
    const raised = { ...base, manifest: { ...base.manifest, minAppVersion: "1.7.2" } };
    expect(applyVersion(raised, "1.1.0").versions["1.1.0"]).toBe("1.7.2");
  });

  it("keeps versions.json in version order", () => {
    const messy = { ...base, versions: { "1.10.0": "1.5.0", "1.2.0": "1.5.0", "1.0.0": "1.5.0" } };
    const result = applyVersion({ ...messy, manifest: { ...base.manifest, version: "1.10.0" } }, "2.0.0");
    expect(Object.keys(result.versions)).toEqual(["1.0.0", "1.2.0", "1.10.0", "2.0.0"]);
  });

  it("does not mutate its input", () => {
    applyVersion(base, "2.0.0");
    expect(base.manifest.version).toBe("1.0.0");
    expect(base.versions).toEqual({ "1.0.0": "1.5.0" });
  });

  it("refuses to go backwards or stand still", () => {
    expect(() => applyVersion(base, "1.0.0")).toThrow(/must increase/);
    expect(() => applyVersion(base, "0.9.9")).toThrow(/must increase/);
  });

  it("refuses a manifest with no minAppVersion", () => {
    const broken = { ...base, manifest: { id: "x", version: "1.0.0" } };
    expect(() => applyVersion(broken, "1.0.1")).toThrow(/minAppVersion/);
  });
});

describe("findProblems", () => {
  const good = {
    manifest: {
      id: "whoop-workout-insert",
      name: "WHOOP Workout Insert",
      version: "1.0.1",
      minAppVersion: "1.5.0",
      description: "Insert a WHOOP workout.",
      author: "phillipsjdan",
      isDesktopOnly: false,
    },
    versions: { "1.0.0": "1.5.0", "1.0.1": "1.5.0" },
    expectedVersion: "1.0.1",
    assets: { "main.js": 36000, "manifest.json": 300, "styles.css": 1200 },
  };

  it("passes a well-formed release", () => {
    expect(findProblems(good)).toEqual([]);
  });

  it("catches a manifest version that does not match the tag", () => {
    const problems = findProblems({ ...good, expectedVersion: "1.0.2" });
    expect(problems.join(" ")).toMatch(/requires them to match/);
  });

  it("catches a missing versions.json entry", () => {
    const problems = findProblems({ ...good, versions: { "1.0.0": "1.5.0" } });
    expect(problems.join(" ")).toMatch(/versions\.json has no entry/);
  });

  it("catches versions.json disagreeing with minAppVersion", () => {
    const problems = findProblems({ ...good, versions: { "1.0.1": "1.4.0" } });
    expect(problems.join(" ")).toMatch(/declares minAppVersion/);
  });

  it("catches each missing manifest field", () => {
    for (const field of ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"]) {
      const manifest = { ...good.manifest };
      delete manifest[field];
      expect(findProblems({ ...good, manifest }).join(" ")).toContain(`"${field}"`);
    }
  });

  it("catches a manifest field of the wrong type", () => {
    const manifest = { ...good.manifest, isDesktopOnly: "false" };
    expect(findProblems({ ...good, manifest }).join(" ")).toMatch(/should be a boolean/);
  });

  it("catches a plugin id that cannot be a folder name", () => {
    const manifest = { ...good.manifest, id: "WHOOP Workout Insert" };
    expect(findProblems({ ...good, manifest }).join(" ")).toMatch(/lowercase letters/);
  });

  it("catches a v-prefixed version", () => {
    const manifest = { ...good.manifest, version: "v1.0.1" };
    const problems = findProblems({ ...good, manifest, expectedVersion: "v1.0.1" });
    expect(problems.join(" ")).toMatch(/no "v" prefix/);
  });

  it("catches each missing or empty release asset", () => {
    for (const asset of RELEASE_ASSETS) {
      const assets = { ...good.assets };
      delete assets[asset];
      expect(findProblems({ ...good, assets }).join(" ")).toContain(`"${asset}" is missing`);

      expect(
        findProblems({ ...good, assets: { ...good.assets, [asset]: 0 } }).join(" ")
      ).toContain(`"${asset}" is empty`);
    }
  });

  it("reports every problem at once rather than stopping at the first", () => {
    expect(findProblems({ manifest: {}, versions: {}, expectedVersion: "1.0.0", assets: {} }).length)
      .toBeGreaterThan(5);
  });
});

describe("the repository's own release files", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const load = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));

  it("agree on the current version", () => {
    const manifest = load("manifest.json");

    expect(manifest.version).toBe(load("package.json").version);
    expect(load("versions.json")[manifest.version]).toBe(manifest.minAppVersion);
    expect(() => parseVersion(manifest.version)).not.toThrow();
    expect(() => parseVersion(manifest.minAppVersion)).not.toThrow();
  });

  it("carry every field a release needs, so only the build can fail the gate", () => {
    const problems = findProblems({
      manifest: load("manifest.json"),
      versions: load("versions.json"),
      expectedVersion: load("manifest.json").version,
      // The real assets only exist after a build; assume they are fine here.
      assets: Object.fromEntries(RELEASE_ASSETS.map((name) => [name, 1])),
    });
    expect(problems).toEqual([]);
  });
});

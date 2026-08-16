#!/usr/bin/env node
/**
 * Bump module.json's version, commit that alone, tag it, and push both - the same four-step dance
 * (bump, commit, tag, push) this project has done by hand for every release so far. Dev tooling only,
 * not part of the runtime module - lives outside scripts/ so it never ends up in the release zip.
 *
 * Usage: node tools/release.mjs [major|minor|patch] ["optional tag message"]
 * Defaults to a patch bump if no argument is given.
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(repoRoot, "module.json");

function run(command, args) {
  execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

function runCapture(command, args) {
  return execFileSync(command, args, { cwd: repoRoot }).toString().trim();
}

const bumpType = process.argv[2] ?? "patch";
if (!["major", "minor", "patch"].includes(bumpType)) {
  console.error(`Unknown bump type "${bumpType}". Use major, minor, or patch.`);
  process.exit(1);
}

const status = runCapture("git", ["status", "--porcelain"]);
if (status) {
  console.error(
    "Working tree has uncommitted changes. Commit or stash them first so the release commit only "
    + "contains the version bump:\n" + status
  );
  process.exit(1);
}

const moduleData = JSON.parse(fs.readFileSync(modulePath, "utf8"));
const oldVersion = moduleData.version;
const [major, minor, patch] = oldVersion.split(".").map(Number);

let newVersion;
if (bumpType === "major") newVersion = `${major + 1}.0.0`;
else if (bumpType === "minor") newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

moduleData.version = newVersion;
fs.writeFileSync(modulePath, JSON.stringify(moduleData, null, 2) + "\n");

const tag = `v${newVersion}`;
const tagMessage = process.argv[3] ?? `Release ${tag}`;

console.log(`Bumping version ${oldVersion} -> ${newVersion}`);

run("git", ["add", "module.json"]);
run("git", ["commit", "-m", `Bump version to ${newVersion}`]);
run("git", ["push", "origin", "main"]);
run("git", ["tag", "-a", tag, "-m", tagMessage]);
run("git", ["push", "origin", tag]);

console.log(`\nReleased ${tag}. GitHub Actions will build and publish it shortly:`);
console.log("https://github.com/Brianthas/Tricky-Homebrew-Rules/actions");

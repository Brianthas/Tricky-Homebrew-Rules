/**
 * Check that every localisation key the code asks for actually exists.
 *
 * This exists because of a real failure. The ring style dropdown built its keys by capitalising the
 * style name, giving StyleSolid, while the strings were written as Stylesolid. Nothing matched,
 * Foundry returned the key itself, and a dropdown reading "THR.Rules.Auras.Config.StyleSolid"
 * shipped in a release. A syntax check cannot see that, and the end to end test that ran at the time
 * read the form's values rather than its labels.
 *
 * Four kinds of key are understood:
 *
 *   1. Written out in full. Checked.
 *   2. Reached through a prefix helper that is handed a literal. The whole key is still knowable,
 *      so it is reconstructed and checked.
 *   3. Reached through a prefix helper handed something else, which is the shape that broke. These
 *      fail, because the fix is to write the key out rather than to teach this to guess.
 *   4. A whole family interpolated inline, such as the settings headings derived from each rule's
 *      own id. Members cannot be checked individually, so the family is reported and its keys are
 *      not counted as unused.
 *
 * Missing keys fail. Unused ones are reported only, since a string may be kept deliberately.
 *
 * Run: node tools/check-lang.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LANG = path.join(ROOT, "lang", "en.json");
const SOURCE_DIRS = ["scripts"];

/**
 * Every .mjs file under a directory, recursively.
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

const defined = new Set(Object.keys(JSON.parse(fs.readFileSync(LANG, "utf8"))));

const files = SOURCE_DIRS.flatMap(dir => sourceFiles(path.join(ROOT, dir)));
const sources = new Map(files.map(f => [path.relative(ROOT, f), fs.readFileSync(f, "utf8")]));

const used = new Map();
const families = new Map();
const problems = [];

const note = (key, where) => {
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add(where);
};

const LITERAL = /["'`](THR\.[A-Za-z0-9_.]+)["'`]/g;
const FAMILY = /`(THR\.[A-Za-z0-9_.]*?)\$\{/g;
const HELPER = /(?:const|let)\s+(\w+)\s*=\s*\(?\s*(\w+)\s*\)?\s*=>\s*game\.i18n\.\w+\(\s*`(THR\.[A-Za-z0-9_.]*)\$\{\s*\2\s*\}`/g;

for (const [where, text] of sources) {
  for (const match of text.matchAll(LITERAL)) note(match[1], where);

  for (const match of text.matchAll(FAMILY)) {
    if (!families.has(match[1])) families.set(match[1], new Set());
    families.get(match[1]).add(where);
  }

  const prefixes = new Map();
  for (const match of text.matchAll(HELPER)) prefixes.set(match[1], match[3]);

  for (const [fn, prefix] of prefixes) {
    const call = new RegExp(`\\b${fn}\\(\\s*["'\`]([A-Za-z0-9_.]+)["'\`]\\s*\\)`, "g");
    for (const match of text.matchAll(call)) note(prefix + match[1], where);

    const dynamic = new RegExp(`\\b${fn}\\(\\s*(?!["'\`][A-Za-z0-9_.]+["'\`]\\s*\\))([^)]+)\\)`, "g");
    for (const match of text.matchAll(dynamic)) {
      const line = text.slice(0, match.index).split("\n").length;
      problems.push(`${where}:${line}  ${fn}(${match[1].trim().slice(0, 60)})`);
    }
  }
}

// A helper's prefix is itself a family, so its keys should not be reported as unused either.
for (const [, prefix] of [...sources].flatMap(([, text]) => [...text.matchAll(HELPER)].map(m => [m[1], m[3]]))) {
  if (!families.has(prefix)) families.set(prefix, new Set(["prefix helper"]));
}

const inFamily = key => [...families.keys()].some(prefix => key.startsWith(prefix));
const missing = [...used.keys()].filter(key => !defined.has(key)).sort();
const unused = [...defined].filter(key => !used.has(key) && !inFamily(key)).sort();

console.log(`checked ${used.size} keys used across ${SOURCE_DIRS.join(", ")} against ${defined.size} defined in lang/en.json`);

if (families.size) {
  console.log(`\n${families.size} key famil${families.size === 1 ? "y" : "ies"} reached by interpolation, members not individually verified:`);
  for (const [prefix, where] of families) console.log(`  ${prefix}*  (${[...where].join(", ")})`);
}

if (unused.length) {
  console.log(`\n${unused.length} defined but not referenced:`);
  for (const key of unused) console.log(`  ${key}`);
}

if (problems.length) {
  console.error(`\n${problems.length} key(s) assembled from a value, so they cannot be verified. Write them out in full:`);
  for (const where of problems) console.error(`  ${where}`);
}

if (missing.length) {
  console.error(`\n${missing.length} used but missing from lang/en.json:`);
  for (const key of missing) console.error(`  ${key}  (${[...used.get(key)].join(", ")})`);
}

if (missing.length || problems.length) process.exit(1);
console.log("\nall good");

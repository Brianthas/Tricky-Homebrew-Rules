import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs } from "./stubs.mjs";

installStubs();

const { computeDesired, appliesTo, beats } = await import("../scripts/rules/auras.mjs");

const ANY = 0;
const ALLIES = 1;
const ENEMIES = -1;

/**
 * A stand-in token. Distances are declared rather than measured, so the competition can be tested
 * without a canvas: `at` is how far this token is from the origin of the aura being considered.
 */
const token = (id, { disposition = 1, at = 0 } = {}) => ({
  id,
  at,
  document: { disposition },
  center: { x: 0, y: 0 }
});

const source = (id, tokenObj, { radius = 10, strength = 0, ...config } = {}) => ({
  token: tokenObj,
  effect: { uuid: `Effect.${id}`, name: config.name ?? "Aura of Protection" },
  radius,
  strength,
  config: {
    disposition: ALLIES,
    applyToSelf: true,
    respectWalls: false,
    stacks: false,
    ...config
  }
});

/** Distances come from the target token; walls are declared per test. */
const reach = (blockedPairs = []) => ({
  distance: (from, to) => to.at,
  blocked: (from, to) => blockedPairs.some(([a, b]) => a === from.id && b === to.id)
});

const wanted = (desired, tokenId) => [...(desired.get(tokenId) ?? [])];

describe("appliesTo", () => {
  const paladin = token("paladin");

  test("the owner is included only when the aura affects its own token", () => {
    assert.equal(appliesTo(source("a", paladin, { applyToSelf: true }), paladin, reach()), true);
    assert.equal(appliesTo(source("a", paladin, { applyToSelf: false }), paladin, reach()), false);
  });

  test("allies only reaches the same side", () => {
    const ally = token("ally", { disposition: 1, at: 5 });
    const foe = token("foe", { disposition: -1, at: 5 });
    const aura = source("a", paladin, { disposition: ALLIES });
    assert.equal(appliesTo(aura, ally, reach()), true);
    assert.equal(appliesTo(aura, foe, reach()), false);
  });

  test("enemies only reaches the other side", () => {
    const ally = token("ally", { disposition: 1, at: 5 });
    const foe = token("foe", { disposition: -1, at: 5 });
    const aura = source("a", paladin, { disposition: ENEMIES });
    assert.equal(appliesTo(aura, ally, reach()), false);
    assert.equal(appliesTo(aura, foe, reach()), true);
  });

  test("anyone means anyone", () => {
    const foe = token("foe", { disposition: -1, at: 5 });
    assert.equal(appliesTo(source("a", paladin, { disposition: ANY }), foe, reach()), true);
  });

  test("beyond the radius is out, and the edge is in", () => {
    const aura = source("a", paladin, { radius: 10 });
    assert.equal(appliesTo(aura, token("t", { at: 10 }), reach()), true);
    assert.equal(appliesTo(aura, token("t", { at: 11 }), reach()), false);
  });

  test("a wall stops it only when the aura respects walls", () => {
    const ally = token("ally", { at: 5 });
    const walls = reach([["paladin", "ally"]]);
    assert.equal(appliesTo(source("a", paladin, { respectWalls: true }), ally, walls), false);
    assert.equal(appliesTo(source("a", paladin, { respectWalls: false }), ally, walls), true);
  });
});

describe("beats", () => {
  const a = { strength: 5, effect: { uuid: "Effect.aaa" } };
  const b = { strength: 3, effect: { uuid: "Effect.bbb" } };

  test("the stronger aura wins", () => {
    assert.equal(beats(a, b), true);
    assert.equal(beats(b, a), false);
  });

  test("a tie breaks the same way every time", () => {
    // Not arbitrary: an unstable tiebreak would swap the winner between reconciles and rewrite the
    // effect on every pass.
    const tieA = { strength: 4, effect: { uuid: "Effect.aaa" } };
    const tieB = { strength: 4, effect: { uuid: "Effect.bbb" } };
    assert.equal(beats(tieA, tieB), true);
    assert.equal(beats(tieB, tieA), false);
  });
});

describe("computeDesired", () => {
  test("one aura reaches everyone inside it and nobody outside", () => {
    const paladin = token("paladin");
    const near = token("near", { at: 5 });
    const far = token("far", { at: 50 });
    const aura = source("a", paladin, { radius: 10, strength: 3 });

    const desired = computeDesired([aura], [paladin, near, far], reach());
    assert.deepEqual(wanted(desired, "near"), ["Effect.a"]);
    assert.deepEqual(wanted(desired, "paladin"), ["Effect.a"]);
    assert.deepEqual(wanted(desired, "far"), []);
  });

  test("two identical auras grant one bonus, the stronger", () => {
    // The bug this exists to prevent: two paladins standing together, both bonuses applying at once.
    const p1 = token("p1");
    const p2 = token("p2");
    const ally = token("ally", { at: 5 });
    const weak = source("weak", p1, { strength: 3 });
    const strong = source("strong", p2, { strength: 10 });

    const desired = computeDesired([weak, strong], [p1, p2, ally], reach());
    assert.deepEqual(wanted(desired, "ally"), ["Effect.strong"]);
  });

  test("losing the stronger aura falls back to the weaker rather than nothing", () => {
    const p1 = token("p1");
    const ally = token("ally", { at: 5 });
    const weak = source("weak", p1, { strength: 3 });

    const desired = computeDesired([weak], [p1, ally], reach());
    assert.deepEqual(wanted(desired, "ally"), ["Effect.weak"]);
  });

  test("auras with different names do not compete", () => {
    const p1 = token("p1");
    const ally = token("ally", { at: 5 });
    const protection = source("prot", p1, { strength: 3, name: "Aura of Protection" });
    const life = source("life", p1, { strength: 1, name: "Aura of Life", radius: 30 });

    const desired = computeDesired([protection, life], [p1, ally], reach());
    assert.deepEqual(wanted(desired, "ally").sort(), ["Effect.life", "Effect.prot"]);
  });

  test("a stacking aura opts out of the competition entirely", () => {
    const p1 = token("p1");
    const p2 = token("p2");
    const ally = token("ally", { at: 5 });
    const weak = source("weak", p1, { strength: 3, stacks: true });
    const strong = source("strong", p2, { strength: 10, stacks: true });

    const desired = computeDesired([weak, strong], [p1, p2, ally], reach());
    assert.deepEqual(wanted(desired, "ally").sort(), ["Effect.strong", "Effect.weak"]);
  });

  test("a wall between them removes that aura but not the other", () => {
    const p1 = token("p1");
    const p2 = token("p2");
    const ally = token("ally", { at: 5 });
    const blocked = source("blocked", p1, { strength: 10, respectWalls: true });
    const open = source("open", p2, { strength: 3, respectWalls: true });

    const desired = computeDesired([blocked, open], [p1, p2, ally], reach([["p1", "ally"]]));
    assert.deepEqual(wanted(desired, "ally"), ["Effect.open"]);
  });

  test("nobody in range means nothing is wanted", () => {
    const p1 = token("p1");
    const far = token("far", { at: 100 });
    const aura = source("a", p1, { radius: 10, applyToSelf: false });

    const desired = computeDesired([aura], [p1, far], reach());
    assert.deepEqual(wanted(desired, "far"), []);
    assert.deepEqual(wanted(desired, "p1"), []);
  });
});

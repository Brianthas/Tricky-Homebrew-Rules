import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs, fakeEffect, setSetting } from "./stubs.mjs";

installStubs();

const { ringColour, toHex, lightAnimationOf, sameLight, auraIsLive } = await import("../scripts/rules/auras.mjs");

const ALLIES = 1;
const ENEMIES = -1;
const GOLD = 0xFFD54F;
const RED = 0xE57373;

describe("ringColour", () => {
  test("falls back to disposition when no colour is stored", () => {
    assert.equal(ringColour({ disposition: ALLIES }), GOLD);
    assert.equal(ringColour({ disposition: ENEMIES }), RED);
  });

  test("an empty colour still means automatic", () => {
    // Every aura configured before the colour option existed stores nothing, and the save writes an
    // empty string when Automatic is ticked. Both have to keep meaning "decide from disposition"
    // rather than "black".
    assert.equal(ringColour({ disposition: ENEMIES, colour: "" }), RED);
    assert.equal(ringColour({ disposition: ALLIES }), GOLD);
  });

  test("an explicit colour wins, in either case and with stray whitespace", () => {
    assert.equal(ringColour({ disposition: ALLIES, colour: "#3ba7ff" }), 0x3BA7FF);
    assert.equal(ringColour({ disposition: ALLIES, colour: "#3BA7FF" }), 0x3BA7FF);
    assert.equal(ringColour({ disposition: ALLIES, colour: "  #112233  " }), 0x112233);
  });

  test("black is a choice, not an absence", () => {
    assert.equal(ringColour({ disposition: ALLIES, colour: "#000000" }), 0x000000);
  });

  test("anything unparseable falls back rather than throwing", () => {
    assert.equal(ringColour({ disposition: ENEMIES, colour: "not a colour" }), RED);
    assert.equal(ringColour({ disposition: ALLIES, colour: "#abc" }), GOLD);
    assert.equal(ringColour(null), GOLD);
  });
});

describe("toHex", () => {
  test("pads to six digits so a colour input accepts it", () => {
    assert.equal(toHex(0xFFD54F), "#ffd54f");
    assert.equal(toHex(0x000000), "#000000");
    assert.equal(toHex(0x0000FF), "#0000ff");
  });

  test("round trips through ringColour", () => {
    assert.equal(ringColour({ colour: toHex(0x123456) }), 0x123456);
  });
});

describe("lightAnimationOf", () => {
  test("recognises a light style and returns the animation", () => {
    assert.equal(lightAnimationOf("light:emanation"), "emanation");
    assert.equal(lightAnimationOf("light:dome"), "dome");
  });

  test("drawn styles are not light styles", () => {
    assert.equal(lightAnimationOf("solid"), null);
    assert.equal(lightAnimationOf("rotate"), null);
  });

  test("an animation Foundry does not have is refused", () => {
    // Guards against a saved style surviving a Foundry release that drops an animation.
    assert.equal(lightAnimationOf("light:nonsense"), null);
  });

  test("junk does not throw", () => {
    assert.equal(lightAnimationOf(undefined), null);
    assert.equal(lightAnimationOf(null), null);
    assert.equal(lightAnimationOf(42), null);
  });
});

describe("sameLight", () => {
  const light = () => ({
    dim: 30, bright: 0, luminosity: 0, alpha: 0.4, color: "#ffd54f",
    attenuation: 0.6, coloration: 1, angle: 360,
    animation: { type: "emanation", speed: 4, intensity: 5 }
  });

  test("identical configurations match", () => {
    assert.equal(sameLight(light(), light()), true);
  });

  test("a different radius, colour or animation does not match", () => {
    assert.equal(sameLight(light(), { ...light(), dim: 10 }), false);
    assert.equal(sameLight(light(), { ...light(), color: "#000000" }), false);
    assert.equal(sameLight(light(), { ...light(), animation: { type: "dome" } }), false);
  });

  test("fields this rule never sets are ignored", () => {
    // Compared on meaning rather than deep equality, so an unrelated default cannot cause a write
    // on every single reconcile.
    assert.equal(sameLight(light(), { ...light(), shadows: 0.5 }), true);
    assert.equal(sameLight(light(), { ...light(), animation: { type: "emanation", speed: 9 } }), true);
  });

  test("a missing side never matches", () => {
    assert.equal(sameLight(null, light()), false);
    assert.equal(sameLight(light(), undefined), false);
  });
});

describe("auraIsLive", () => {
  const on = { enabled: true, combatOnly: false };

  test("an enabled aura on an active effect is live", () => {
    assert.equal(auraIsLive(fakeEffect(), on), true);
  });

  test("disabled or suppressed effects are not", () => {
    assert.equal(auraIsLive(fakeEffect({ disabled: true }), on), false);
    assert.equal(auraIsLive(fakeEffect({ isSuppressed: true }), on), false);
  });

  test("an aura switched off in its own config is not", () => {
    assert.equal(auraIsLive(fakeEffect(), { enabled: false }), false);
    assert.equal(auraIsLive(fakeEffect(), null), false);
  });

  test("combat only means nothing outside combat", () => {
    // This is the bug it exists to prevent: a combat only aura applied nothing out of combat but
    // still drew its ring and lit its token, which reads as a buff that is running.
    game.combat = null;
    assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: true }), false);

    game.combat = { started: true };
    assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: true }), true);

    game.combat = { started: false };
    assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: true }), false);
    game.combat = null;
  });
});

describe("switching the rule off", () => {
  test("no aura is live once the rule is disabled", () => {
    // Off has to mean off. Bailing out of the reconcile instead left every applied copy in place
    // and every ring drawn, so a paladin kept granting saves with the rule switched off and no way
    // to clear it but by hand.
    const restore = setSetting("aurasEnabled", false);
    try {
      assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: false }), false);
    } finally {
      restore();
    }
    assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: false }), true);
  });

  test("the master switch turns them off too", () => {
    const restore = setSetting("moduleEnabled", false);
    try {
      assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: false }), false);
    } finally {
      restore();
    }
    assert.equal(auraIsLive(fakeEffect(), { enabled: true, combatOnly: false }), true);
  });
});

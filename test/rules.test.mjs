import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs, fakeEffect, registerUuid } from "./stubs.mjs";

installStubs();

const { isExpired } = await import("../scripts/rules/expire-effects.mjs");
const { formatBonus } = await import("../scripts/rules/roll-to-bonus.mjs");
const { nameFromItem } = await import("../scripts/rules/source-named-effects.mjs");
const { isRunning } = await import("../scripts/rules/effects-panel.mjs");

const MODULE_ID = "tricky-homebrew-rules";

describe("isExpired", () => {
  test("an effect with time left has not expired", () => {
    assert.equal(isExpired(fakeEffect({ duration: { seconds: 60, remaining: 30, expired: false } })), false);
  });

  test("an effect whose countdown has run out has", () => {
    assert.equal(isExpired(fakeEffect({ duration: { seconds: 60, remaining: 0, expired: true } })), true);
  });

  test("a condition with no countdown never expires, however it reports itself", () => {
    // Foundry calls an effect temporary if it has an expiry OR a finite duration value, which is
    // true for conditions like Bloodied that have no countdown at all, and those report
    // `expired: true` permanently. Trusting that switched off every condition on the actor.
    assert.equal(isExpired(fakeEffect({ duration: { expiry: "turnStart", expired: true } })), false);
    assert.equal(isExpired(fakeEffect({ duration: { value: null, expired: true } })), false);
  });

  test("a countdown with no remaining figure is left alone", () => {
    assert.equal(isExpired(fakeEffect({ duration: { seconds: 60, expired: true } })), false);
  });

  test("a disabled effect is never expired by this rule", () => {
    assert.equal(isExpired(fakeEffect({ disabled: true, duration: { seconds: 1, remaining: 0, expired: true } })), false);
  });

  test("rounds and turns count as countdowns too", () => {
    assert.equal(isExpired(fakeEffect({ duration: { rounds: 3, remaining: 0, expired: true } })), true);
    assert.equal(isExpired(fakeEffect({ duration: { turns: 1, remaining: 0, expired: true } })), true);
  });

  test("nothing at all does not throw", () => {
    assert.equal(isExpired(null), false);
    assert.equal(isExpired(fakeEffect()), false);
  });
});

describe("formatBonus", () => {
  test("a positive bonus is added with spaces around the sign", () => {
    // dnd5e bonus fields are formula strings and ADD concatenates them, so writing a bare 4 onto an
    // existing 1d4 produces 1d44. The spacing is what keeps it arithmetic.
    assert.equal(formatBonus(4), " + 4");
    assert.equal(formatBonus(0), " + 0");
  });

  test("a negative bonus subtracts rather than adding a minus", () => {
    assert.equal(formatBonus(-2), " - 2");
    assert.equal(formatBonus(-10), " - 10");
  });

  test("concatenating onto an existing formula stays valid", () => {
    assert.equal(`1d4${formatBonus(3)}`, "1d4 + 3");
    assert.equal(`1d4${formatBonus(-3)}`, "1d4 - 3");
  });
});

describe("nameFromItem", () => {
  const item = (name, effectCount = 1) => ({
    name,
    effects: Array.from({ length: effectCount }, () => ({ type: "base" }))
  });

  test("an effect is named after the item that granted it", () => {
    assert.equal(nameFromItem(fakeEffect({ name: "Effect" }), item("Shield")), "Shield");
  });

  test("an item with several effects keeps each one distinguishable", () => {
    assert.equal(
      nameFromItem(fakeEffect({ name: "Armor" }), item("Draconic Resilience", 2)),
      "Draconic Resilience: Armor"
    );
  });

  test("a name that is already correct is left alone", () => {
    assert.equal(nameFromItem(fakeEffect({ name: "Shield" }), item("Shield")), null);
  });

  test("repeated passes do not stack the prefix", () => {
    // "Draconic Resilience: Draconic Resilience: Armor" was a real thing that happened.
    const doubled = fakeEffect({ name: "Draconic Resilience: Draconic Resilience: Armor" });
    assert.equal(nameFromItem(doubled, item("Draconic Resilience", 2)), "Draconic Resilience: Armor");
  });

  test("an already prefixed name is recomputed to itself", () => {
    const named = fakeEffect({ name: "Draconic Resilience: Armor" });
    assert.equal(nameFromItem(named, item("Draconic Resilience", 2)), null);
  });

  test("an item with no name changes nothing", () => {
    assert.equal(nameFromItem(fakeEffect({ name: "Effect" }), null), null);
    assert.equal(nameFromItem(fakeEffect({ name: "Effect" }), { name: "" }), null);
  });
});

describe("isRunning", () => {
  test("anything Foundry calls temporary is running", () => {
    assert.equal(isRunning(fakeEffect({ isTemporary: true })), true);
  });

  test("permanent kit is not", () => {
    assert.equal(isRunning(fakeEffect({ name: "Jack of All Trades" })), false);
  });

  test("an aura copy is as temporary as the aura behind it", () => {
    // A copy carries no duration of its own, so judging it alone would call every one permanent.
    // Aura of Life runs for ten minutes and belongs on the panel; a paladin's Aura of Protection is
    // a class feature and does not.
    registerUuid("spell-aura", fakeEffect({ isTemporary: true }));
    registerUuid("feature-aura", fakeEffect({ isTemporary: false }));

    const fromSpell = fakeEffect({ flags: { [MODULE_ID]: { fromAura: "spell-aura" } } });
    const fromFeature = fakeEffect({ flags: { [MODULE_ID]: { fromAura: "feature-aura" } } });

    assert.equal(isRunning(fromSpell), true);
    assert.equal(isRunning(fromFeature), false);
  });

  test("a copy whose aura has vanished is not running", () => {
    const orphan = fakeEffect({ flags: { [MODULE_ID]: { fromAura: "gone" } } });
    assert.equal(isRunning(orphan), false);
  });
});

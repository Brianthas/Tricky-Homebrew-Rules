import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs, fakeEffect, registerUuid, setSetting } from "./stubs.mjs";

installStubs();

const { isExpired } = await import("../scripts/rules/expire-effects.mjs");
const { formatBonus, shouldOfferBonus } = await import("../scripts/rules/roll-to-bonus.mjs");
const { nameFromItem } = await import("../scripts/rules/source-named-effects.mjs");
const { isRunning } = await import("../scripts/rules/effects-panel.mjs");
const { appliesToCasterOnly } = await import("../scripts/rules/self-effects.mjs");

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

describe("shouldOfferBonus", () => {
  /**
   * A chat card carrying only the two flags the decision reads.
   *
   * @param {string|null} rollType  `flags.dnd5e.roll.type`.
   * @param {string|null} itemType  `flags.dnd5e.item.type`.
   * @returns {object}
   */
  function card(rollType, itemType) {
    const flags = { dnd5e: { roll: rollType ? { type: rollType } : undefined, item: itemType ? { type: itemType } : undefined } };
    return { getFlag: (scope, key) => flags[scope]?.[key] };
  }

  test("a feature's utility roll is offered", () => {
    // The case the rule exists for: Bardic Inspiration and friends roll as "generic" from a feat.
    // If this ever fails the exclusions below have eaten the feature rather than trimmed it.
    assert.equal(shouldOfferBonus(card("generic", "feat")), true);
    assert.equal(shouldOfferBonus(card("generic", "spell")), true);
  });

  test("attack and damage rolls are refused whatever produced them", () => {
    // Both were offered before: a spell's damage roll passed every check under the default scope,
    // and both passed under "Every roll", which returned true before reading the roll type at all.
    assert.equal(shouldOfferBonus(card("attack", "spell")), false);
    assert.equal(shouldOfferBonus(card("damage", "spell")), false);
    assert.equal(shouldOfferBonus(card("damage", "feat")), false);
    assert.equal(shouldOfferBonus(card("damage", "weapon")), false);
  });

  test("a healing roll keeps the button", () => {
    // A heal activity rolls through the damage machinery but overrides the flag to "healing" before
    // the message is made, so excluding damage does not take healing with it. Read off a live
    // Second Wind card on dnd5e 5.3.3, not off the exclusion list.
    assert.equal(shouldOfferBonus(card("healing", "feat")), true);
    assert.equal(shouldOfferBonus(card("healing", "spell")), true);
  });

  test("a bare check or save has no item and is refused", () => {
    assert.equal(shouldOfferBonus(card("generic", null)), false);
    assert.equal(shouldOfferBonus(card(null, null)), false);
  });

  test("scope widens which items qualify, and never which roll types do", () => {
    const restore = setSetting("rollToBonusScope", "allItems");
    assert.equal(shouldOfferBonus(card("generic", "weapon")), true);
    assert.equal(shouldOfferBonus(card("damage", "weapon")), false);
    restore();

    // "Every roll" still means every roll that could be a bonus. It skips the item check, not the
    // roll type check.
    const restoreAll = setSetting("rollToBonusScope", "everything");
    assert.equal(shouldOfferBonus(card("generic", null)), true);
    assert.equal(shouldOfferBonus(card("attack", "weapon")), false);
    assert.equal(shouldOfferBonus(card("damage", "weapon")), false);
    restoreAll();
  });

  test("the default scope keeps the button on features and spells only", () => {
    assert.equal(shouldOfferBonus(card("generic", "weapon")), false);
    assert.equal(shouldOfferBonus(card("generic", "consumable")), false);
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

describe("appliesToCasterOnly", () => {
  // Every shape below is copied from dnd5e 5.3.3's own packs (packs/_source), not invented: the
  // rule reads four fields and the bug was believing one of them meant more than it does.
  const activity = (type, { range = "self", affects = "", template = "" } = {}) => ({
    type,
    range: { units: range },
    target: { affects: { type: affects }, template: { type: template } }
  });

  const casterOnly = () => setSetting("selfEffectsScope", "casterOnly");
  const emanations = () => setSetting("selfEffectsScope", "emanations");

  test("Shield says both range Self and affects Self", () => {
    const restore = emanations();
    assert.equal(appliesToCasterOnly(activity("utility", { affects: "self" })), true);
    restore();
  });

  test("a self buff that names no target type at all still counts", () => {
    // Blur, Mirror Image and Fire Shield in the 2024 packs leave affects.type empty.
    const restore = emanations();
    assert.equal(appliesToCasterOnly(activity("utility")), true);
    restore();
  });

  test("anything with a range in feet is somebody else's problem", () => {
    const restore = emanations();
    assert.equal(appliesToCasterOnly(activity("utility", { range: "ft", affects: "creature" })), false);
    restore();
  });

  test("Stunning Strike is range Self and still belongs on the enemy", () => {
    // The feature has no range of its own, so dnd5e authored it as Self. It is a save activity
    // affecting a creature, and applying it to the caster stunned the monk.
    const restore = emanations();
    assert.equal(appliesToCasterOnly(activity("save", { affects: "creature" })), false);
    restore();
  });

  test("an activity that resolves against another creature never self-applies", () => {
    // A monster's Grab is a check activity, range Self, naming no target type: without the type
    // test it would grapple the monster itself.
    const restore = emanations();
    for (const type of ["attack", "check", "damage", "save"]) {
      assert.equal(appliesToCasterOnly(activity(type)), false, type);
    }
    restore();
  });

  test("a named target type other than Self is a statement about somebody else", () => {
    const restore = emanations();
    for (const affects of ["creature", "enemy", "ally", "object", "space", "willing"]) {
      assert.equal(appliesToCasterOnly(activity("utility", { affects })), false, affects);
    }
    restore();
  });

  test("a cone centred on the caster points away from them", () => {
    // Burning Hands, Cone of Cold and every breath weapon are range Self with an area.
    const restore = emanations();
    for (const template of ["cone", "line", "cube", "square", "sphere"]) {
      assert.equal(appliesToCasterOnly(activity("utility", { template })), false, template);
    }
    restore();
  });

  test("an emanation is the one area that includes its own origin", () => {
    const restore = emanations();
    assert.equal(appliesToCasterOnly(activity("heal", { template: "radius" })), true);
    restore();
  });

  test("the narrow setting keeps the button on emanations", () => {
    const restore = casterOnly();
    assert.equal(appliesToCasterOnly(activity("heal", { template: "radius" })), false);
    assert.equal(appliesToCasterOnly(activity("utility", { affects: "self" })), true);
    restore();
  });

  test("an emanation aimed at other creatures is still not the caster's", () => {
    // A monster's Fear Aura is a radius affecting enemies; Spirit Guardians halves the speed of
    // creatures in it, not of the cleric.
    const restore = emanations();
    assert.equal(appliesToCasterOnly(activity("utility", { affects: "enemy", template: "radius" })), false);
    restore();
  });

  test("nothing at all does not throw", () => {
    assert.equal(appliesToCasterOnly(null), false);
    assert.equal(appliesToCasterOnly({}), false);
  });
});

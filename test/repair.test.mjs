import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs } from "./stubs.mjs";

installStubs();

// `embedded` as `foundry.utils.parseUuid` returned it for each UUID on the Foundry 14.369 client.
// A UUID missing from the table throws, so a test cannot pass on an answer nobody recorded.
const PARSED = {
  "Actor.Qf69kQz5yhg9frOr.Item.Cw3qlCqMDGnv97eH": ["Item", "Cw3qlCqMDGnv97eH"],
  "Actor.Qf69kQz5yhg9frOr.Item.aVhSujZJ7eL0FHbu": ["Item", "aVhSujZJ7eL0FHbu"],
  "Actor.Qf69kQz5yhg9frOr.Item.qf4iWBUqttodhPMJ": ["Item", "qf4iWBUqttodhPMJ"],
  "Actor.SVtLstUzhbopbXR9.Item.bzWsfevJ8dssm3wc": ["Item", "bzWsfevJ8dssm3wc"],
  "Compendium.dnd5e.classes24.Item.phbsrcFontOfMagi": [],
  "Compendium.dnd5e.classes24.Item.phbsrcSorcerousR": [],
  "Compendium.dnd5e.spells24.Item.phbsplShield0000.ActiveEffect.Bv3EoHGfYCprLdG1": ["ActiveEffect", "Bv3EoHGfYCprLdG1"],
  "Item.Cw3qlCqMDGnv97eH": []
};
globalThis.foundry = {
  utils: {
    parseUuid: uuid => {
      if (!(uuid in PARSED)) throw new Error(`No recorded parseUuid result for ${uuid}`);
      return { embedded: PARSED[uuid] };
    }
  }
};

const { isEmbeddedUuid, repairsFor } = await import("../scripts/rules/repair-imported-items.mjs");

/**
 * An imported class item's stored advancement, in the shape read off the test world's Sorcerer:
 * an object keyed by advancement id, ItemGrant entries listing `{ uuid }` objects.
 */
function importedSorcerer() {
  return {
    system: {
      advancement: {
        wyYA3oRezgFjsKqo: {
          type: "ItemGrant",
          level: 1,
          configuration: { items: [
            { uuid: "Actor.Qf69kQz5yhg9frOr.Item.Cw3qlCqMDGnv97eH" },
            { uuid: "Actor.Qf69kQz5yhg9frOr.Item.aVhSujZJ7eL0FHbu" }
          ] },
          value: { added: { Cw3qlCqMDGnv97eH: "x", aVhSujZJ7eL0FHbu: "y" } }
        },
        mixedGrant: {
          type: "ItemGrant",
          level: 2,
          configuration: { items: [
            { uuid: "Compendium.dnd5e.classes24.Item.phbsrcFontOfMagi" },
            { uuid: "Actor.Qf69kQz5yhg9frOr.Item.qf4iWBUqttodhPMJ" }
          ] }
        },
        hitPoints: { type: "HitPoints", configuration: { items: [{ uuid: "Actor.Qf69kQz5yhg9frOr.Item.Cw3qlCqMDGnv97eH" }] } },
        cleanGrant: {
          type: "ItemGrant",
          configuration: { items: [{ uuid: "Compendium.dnd5e.classes24.Item.phbsrcSorcerousR" }] }
        }
      }
    }
  };
}

describe("isEmbeddedUuid", () => {
  test("a link to an item on an actor is embedded", () => {
    assert.equal(isEmbeddedUuid("Actor.Qf69kQz5yhg9frOr.Item.Cw3qlCqMDGnv97eH"), true);
  });

  test("a link inside a compendium document is embedded too", () => {
    assert.equal(isEmbeddedUuid("Compendium.dnd5e.spells24.Item.phbsplShield0000.ActiveEffect.Bv3EoHGfYCprLdG1"), true);
  });

  test("a compendium item and a world item are not", () => {
    assert.equal(isEmbeddedUuid("Compendium.dnd5e.classes24.Item.phbsrcFontOfMagi"), false);
    assert.equal(isEmbeddedUuid("Item.Cw3qlCqMDGnv97eH"), false);
  });

  test("anything that is not a string is not", () => {
    assert.equal(isEmbeddedUuid(null), false);
    assert.equal(isEmbeddedUuid(undefined), false);
  });
});

describe("repairsFor", () => {
  test("removes every embedded link and keeps every other one", () => {
    const { changes, removed } = repairsFor(importedSorcerer());
    assert.equal(removed, 3);
    assert.deepEqual(changes["system.advancement.wyYA3oRezgFjsKqo.configuration.items"], []);
    assert.deepEqual(changes["system.advancement.mixedGrant.configuration.items"],
      [{ uuid: "Compendium.dnd5e.classes24.Item.phbsrcFontOfMagi" }]);
  });

  test("touches only ItemGrant advancements that need it", () => {
    const { changes } = repairsFor(importedSorcerer());
    assert.deepEqual(Object.keys(changes).sort(), [
      "system.advancement.mixedGrant.configuration.items",
      "system.advancement.wyYA3oRezgFjsKqo.configuration.items"
    ]);
  });

  test("leaves what dnd5e granted alone", () => {
    const { changes } = repairsFor(importedSorcerer());
    assert.ok(!Object.keys(changes).some(path => path.includes("value")));
  });

  test("an entry stored as a bare string is judged the same way", () => {
    const { changes, removed } = repairsFor({ system: { advancement: { a: { type: "ItemGrant", configuration: { items: [
      "Actor.SVtLstUzhbopbXR9.Item.bzWsfevJ8dssm3wc",
      "Compendium.dnd5e.classes24.Item.phbsrcSorcerousR"
    ] } } } } });
    assert.equal(removed, 1);
    assert.deepEqual(changes["system.advancement.a.configuration.items"], ["Compendium.dnd5e.classes24.Item.phbsrcSorcerousR"]);
  });

  test("a valid item needs nothing", () => {
    assert.deepEqual(repairsFor({ system: { advancement: {} } }), { changes: {}, removed: 0 });
    assert.deepEqual(repairsFor(null), { changes: {}, removed: 0 });
  });
});

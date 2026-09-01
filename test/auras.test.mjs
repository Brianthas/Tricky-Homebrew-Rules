import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs, fakeEffect, setSetting, registerUuid } from "./stubs.mjs";

installStubs();

const {
  ringColour, toHex, lightAnimationOf, sameLight, auraIsLive, auraSeedFor, ignoredDispositionsFor, groundBandFor, canRememberAura, onSocket
} = await import("../scripts/rules/auras.mjs");

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

describe("auraSeedFor", () => {
  // The bug this covers: an aura's settings live in a flag on the effect document, and a spell's
  // applied effect is rebuilt from scratch on every cast. Configuring the one on the sheet
  // configured a document that was thrown away, so recasting produced a plain effect and it read as
  // the settings not having saved. Permanent auras never showed it, because a class feature's
  // effect sits on an item and is never recreated.

  const remembered = (config = {}) => setSetting("aurasCustom", {
    "conjure minor elementals": {
      enabled: true, radius: "20", disposition: -1, applyToSelf: false,
      style: "light:pulse", respectWalls: false, colour: "#3ba7ff"
    },
    ...config
  });

  test("a remembered aura is applied to a fresh copy of the same name", () => {
    const restore = remembered();
    try {
      const seed = auraSeedFor(fakeEffect({ name: "Conjure Minor Elementals" }));
      assert.equal(seed?.enabled, true);
      assert.equal(seed.radius, "20");
      assert.equal(seed.disposition, -1);
    } finally {
      restore();
    }
  });

  test("every remembered setting comes back, not just radius and reach", () => {
    // Remembering only three fields meant a recalled aura returned with a plain gold ring and walls
    // back on, which is not the aura that was remembered.
    const restore = remembered();
    try {
      const seed = auraSeedFor(fakeEffect({ name: "Conjure Minor Elementals" }));
      assert.equal(seed.style, "light:pulse");
      assert.equal(seed.respectWalls, false);
      assert.equal(seed.colour, "#3ba7ff");
    } finally {
      restore();
    }
  });

  test("defaults fill in whatever the table does not say", () => {
    const seed = auraSeedFor(fakeEffect({ name: "Spirit Guardians" }));
    assert.equal(seed.radius, "15");
    assert.equal(seed.disposition, -1);
    assert.equal(seed.stacks, false);
    assert.equal(seed.style, "solid");
  });

  test("the name is matched case and whitespace insensitively", () => {
    assert.ok(auraSeedFor(fakeEffect({ name: "  AURA OF LIFE " })));
  });

  test("an unknown effect is left alone", () => {
    assert.equal(auraSeedFor(fakeEffect({ name: "Bless" })), null);
    assert.equal(auraSeedFor(fakeEffect({ name: "" })), null);
    assert.equal(auraSeedFor(null), null);
  });

  test("a concentration marker is never seeded, however its origin resolves", () => {
    // dnd5e names the marker "Concentrating: <spell>" but sets its origin to the spell item, so the
    // fallback match on the source item's name finds it. Seeding it would give one cast two auras,
    // and write showIcon NEVER onto the marker, taking the Concentrating icon off the caster's token
    // while they are still concentrating.
    registerUuid("Actor.abc.Item.spirit", { documentName: "Item", name: "Spirit Guardians" });

    const marker = fakeEffect({
      name: "Concentrating: Spirit Guardians",
      statuses: ["concentrating"]
    });
    assert.equal(auraSeedFor(marker, "Actor.abc.Item.spirit"), null);

    // The spell's own applied effect, with the same origin and no status, still seeds.
    const applied = fakeEffect({ name: "Spirit Guardians" });
    assert.equal(auraSeedFor(applied, "Actor.abc.Item.spirit")?.radius, "15");
  });

  test("a config already stored wins, including one deliberately switched off", () => {
    // Reseeding over a stored answer would turn an aura the GM had switched off back on every time
    // the effect was recreated, with no way to keep it off.
    const off = fakeEffect({
      name: "Spirit Guardians",
      flags: { "tricky-homebrew-rules": { aura: { enabled: false, radius: "15" } } }
    });
    assert.equal(auraSeedFor(off), null);
  });

  test("a copy this rule applied is never seeded into an aura of its own", () => {
    // It carries its source's name, so seeding it would make every recipient radiate the aura.
    const copy = fakeEffect({
      name: "Spirit Guardians",
      flags: { "tricky-homebrew-rules": { fromAura: "Actor.abc.ActiveEffect.def" } }
    });
    assert.equal(auraSeedFor(copy), null);
  });

  test("an enchantment is not an aura whatever it is called", () => {
    assert.equal(auraSeedFor(fakeEffect({ name: "Spirit Guardians", type: "enchantment" })), null);
  });

  test("the source item's name is matched when the effect carries a flavour name", () => {
    // dnd5e's 2024 content names spell effects for flavour rather than after the spell, and the
    // Source Named Effects rule that renames them can be switched off, so the item name has to be
    // reached independently.
    registerUuid("Actor.a.Item.b", { documentName: "Item", name: "Spirit Guardians" });
    const seed = auraSeedFor(fakeEffect({ name: "Spectral Wardens" }), "Actor.a.Item.b");
    assert.equal(seed?.radius, "15");
  });

  test("a concentration origin is followed back to the spell", () => {
    // dnd5e points an applied concentration effect's origin at the caster's concentration effect,
    // not at the spell, so the item reference it carries has to be followed.
    registerUuid("Actor.a.Item.spell", { documentName: "Item", name: "Aura of Purity" });
    registerUuid("Actor.a.ActiveEffect.conc", {
      documentName: "ActiveEffect",
      getFlag: (scope, key) => (scope === "dnd5e" && key === "item") ? { uuid: "Actor.a.Item.spell" } : undefined
    });
    const seed = auraSeedFor(fakeEffect({ name: "Purified" }), "Actor.a.ActiveEffect.conc");
    assert.equal(seed?.radius, "30");
    assert.equal(seed.disposition, 1);
  });

  test("a scaling formula never reaches the stored config", () => {
    // `scaling` is a table concept the radius has already been resolved from. Carrying it into the
    // flag would let it override that radius on an actor who cannot resolve it.
    const seed = auraSeedFor(fakeEffect({ name: "Aura of Protection" }));
    assert.equal(seed.scaling, undefined);
    assert.equal(seed.radius, "10");
  });
});

describe("ignoredDispositionsFor", () => {
  // The translation between the two systems of meaning. An aura's disposition is relative, a
  // product of the two tokens' values, so 1 means "my side" whoever I am. dnd5e's terrain behavior
  // is absolute, testing the raw token.disposition against a list. Getting this backwards makes a
  // spell that should slow the enemy slow the party instead, which is the failure that matters.
  const FRIENDLY = 1;
  const NEUTRAL = 0;
  const HOSTILE = -1;

  const sorted = value => [...value].sort((a, b) => a - b);

  test("a friendly caster's enemies-only aura charges hostiles alone", () => {
    assert.deepEqual(
      sorted(ignoredDispositionsFor({ disposition: ENEMIES }, FRIENDLY)),
      [NEUTRAL, FRIENDLY]
    );
  });

  test("a hostile caster's enemies-only aura charges the party instead", () => {
    // Same spell, opposite side of the table. Conjure Minor Elementals cast by an NPC has to make
    // the ground difficult for the players, not for its own allies.
    assert.deepEqual(
      sorted(ignoredDispositionsFor({ disposition: ENEMIES }, HOSTILE)),
      [HOSTILE, NEUTRAL]
    );
  });

  test("an allies-only aura is the mirror of it", () => {
    assert.deepEqual(sorted(ignoredDispositionsFor({ disposition: ALLIES }, FRIENDLY)), [HOSTILE, NEUTRAL]);
    assert.deepEqual(sorted(ignoredDispositionsFor({ disposition: ALLIES }, HOSTILE)), [NEUTRAL, FRIENDLY]);
  });

  test("anyone means nobody is ignored", () => {
    // Computed rather than special-cased, this comes out as "friendly and hostile ignored" for a
    // friendly caster, because only a neutral token's product with 1 is 0.
    assert.deepEqual(ignoredDispositionsFor({ disposition: 0 }, FRIENDLY), []);
    assert.deepEqual(ignoredDispositionsFor({ disposition: 0 }, HOSTILE), []);
  });

  test("a neutral caster's sided aura reaches nobody, matching appliesTo", () => {
    // Every product with 0 is 0, so `appliesTo` never matches a disposition of 1 or -1 either. The
    // region has to agree, or the terrain would apply where the effect does not.
    assert.deepEqual(
      sorted(ignoredDispositionsFor({ disposition: ENEMIES }, NEUTRAL)),
      [HOSTILE, NEUTRAL, FRIENDLY]
    );
  });
});

describe("groundBandFor", () => {
  // Difficult terrain is a property of the ground. createTokenEmanation builds a sphere, so 0.17.0
  // charged a flying creature anywhere inside the radius: a hostile flying at 10 feet paid 30 for a
  // 15 foot move through a 15 foot emanation and only cleared it above 20.

  test("a medium creature on the floor occupies one square of height", () => {
    assert.deepEqual(groundBandFor({ elevation: 0, depth: 1 }, 5), { bottom: 0, top: 5 });
  });

  test("the band sits at the emitter's own elevation, not at the floor", () => {
    // A caster on a ledge makes the ledge difficult, not the ground twenty feet below it.
    assert.deepEqual(groundBandFor({ elevation: 20, depth: 1 }, 5), { bottom: 20, top: 25 });
  });

  test("a taller creature occupies a taller band", () => {
    assert.deepEqual(groundBandFor({ elevation: 0, depth: 2 }, 5), { bottom: 0, top: 10 });
  });

  test("a scene using metres is measured in metres", () => {
    assert.deepEqual(groundBandFor({ elevation: 0, depth: 1 }, 1.5), { bottom: 0, top: 1.5 });
  });

  test("a missing depth or distance falls back rather than collapsing the band", () => {
    // A zero-height band contains nothing, so the terrain would silently apply to nobody.
    assert.deepEqual(groundBandFor({ elevation: 0 }, 5), { bottom: 0, top: 5 });
    assert.deepEqual(groundBandFor({ elevation: 0, depth: 0 }, 0), { bottom: 0, top: 5 });
    assert.deepEqual(groundBandFor(null, 5), { bottom: 0, top: 5 });
  });
});

describe("canRememberAura", () => {
  // "Remember this aura" writes a world setting. Foundry lets anyone with SETTINGS_MODIFY do that
  // directly (BaseSetting#canModify), and everyone else has to ask the GM over a socket. The gate on
  // asking is the world's own answer to "may this player add shared content".
  const user = (...granted) => ({ can: p => granted.includes(p) });

  test("a user who may modify settings qualifies, having no need of the socket", () => {
    assert.equal(canRememberAura(user("SETTINGS_MODIFY")), true);
  });

  test("a player who may create items qualifies", () => {
    assert.equal(canRememberAura(user("ITEM_CREATE")), true);
  });

  test("a player with neither does not", () => {
    assert.equal(canRememberAura(user("SHOW_CURSOR")), false);
    assert.equal(canRememberAura(user()), false);
  });

  test("a user the GM cannot resolve does not", () => {
    // The socket carries a user id, and a disconnected or deleted user resolves to nothing. Treating
    // that as allowed would let any client rewrite the table by sending an unknown id.
    assert.equal(canRememberAura(null), false);
    assert.equal(canRememberAura(undefined), false);
    assert.equal(canRememberAura({}), false);
  });
});

describe("onSocket", () => {
  // The GM's half of "Remember this aura" when a player asks for it. Testing it here rather than in
  // Foundry because the branch needs a player and a GM connected at once, which one browser session
  // cannot produce. The network hop is Foundry's; everything either side of it is checked.

  const asGM = (activeGMIsSelf, users = {}) => {
    const previousUsers = game.users;
    const previousUser = game.user;
    game.users = {
      activeGM: activeGMIsSelf === null ? null : { isSelf: activeGMIsSelf },
      get: id => users[id]
    };
    // The receiving client writes the setting itself, so it holds the permission to do so.
    game.user = { can: () => true, id: "gm" };
    return () => { game.users = previousUsers; game.user = previousUser; };
  };

  const permitted = { can: p => p === "ITEM_CREATE" };
  const forbidden = { can: () => false };
  const request = (userId = "p3") => ({
    action: "rememberAura", userId, name: "Conjure Minor Elementals",
    config: { enabled: true, radius: "15" }
  });

  const table = () => setSetting("aurasCustom", {});

  test("a permitted user's request is written", async () => {
    const restoreSetting = table();
    const restore = asGM(true, { p3: permitted });
    try {
      await onSocket(request());
      assert.equal(game.settings.get(null, "aurasCustom")["conjure minor elementals"]?.radius, "15");
    } finally {
      restore(); restoreSetting();
    }
  });

  test("a user without the permission is refused", async () => {
    // Without this the socket is a way for any connected client to rewrite the world's aura table.
    const restoreSetting = table();
    const restore = asGM(true, { p3: forbidden });
    try {
      await onSocket(request());
      assert.deepEqual(game.settings.get(null, "aurasCustom"), {});
    } finally {
      restore(); restoreSetting();
    }
  });

  test("a user id that resolves to nobody is refused", async () => {
    const restoreSetting = table();
    const restore = asGM(true, {});
    try {
      await onSocket(request("someone-who-left"));
      assert.deepEqual(game.settings.get(null, "aurasCustom"), {});
    } finally {
      restore(); restoreSetting();
    }
  });

  test("only the active GM writes, so two GMs do not both act", async () => {
    const restoreSetting = table();
    const restore = asGM(false, { p3: permitted });
    try {
      await onSocket(request());
      assert.deepEqual(game.settings.get(null, "aurasCustom"), {});
    } finally {
      restore(); restoreSetting();
    }
  });

  test("another module's socket traffic is ignored", async () => {
    const restoreSetting = table();
    const restore = asGM(true, { p3: permitted });
    try {
      await onSocket({ action: "somethingElse", userId: "p3", name: "X", config: {} });
      assert.deepEqual(game.settings.get(null, "aurasCustom"), {});
    } finally {
      restore(); restoreSetting();
    }
  });
});

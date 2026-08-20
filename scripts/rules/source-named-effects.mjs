import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";
import { allActors } from "../lib/actors.mjs";

const RULE_ID = "sourceNamedEffects";

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Names Active Effects after the item that produced them.
 *
 * dnd5e's 2024 content gives spell effects flavourful names rather than the spell's name: casting
 * Shield applies an effect called "Imperceptible Barrier". That reads nicely but makes it hard to
 * glance at a token and see where a bonus came from.
 *
 * Applies both ways: new effects are renamed as they land, and a sweep in the module settings
 * renames the ones already sitting on actors, so a world does not end up half converted.
 */
export const sourceNamedEffects = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.SourceNamedEffects.Enabled.Name",
      hint: "THR.Rules.SourceNamedEffects.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    // Renaming what already exists edits world data in bulk, so it is a button the GM presses
    // rather than something that happens quietly on load.
    game.settings.registerMenu(MODULE_ID, "sourceNamedEffectsSweep", {
      name: "THR.Rules.SourceNamedEffects.Sweep.Name",
      label: "THR.Rules.SourceNamedEffects.Sweep.Label",
      hint: "THR.Rules.SourceNamedEffects.Sweep.Hint",
      icon: "fa-solid fa-tags",
      type: renameExistingEffectsMenu(),
      restricted: true
    });
  },

  registerPatches() {
    Hooks.on("preCreateActiveEffect", onPreCreateActiveEffect);
  }
};

/* -------------------------------------------- */
/*  Renaming                                    */
/* -------------------------------------------- */

/**
 * Rename an effect to its source item as it is created.
 * @param {object} effect
 * @param {object} data
 */
function onPreCreateActiveEffect(effect, data) {
  try {
    if (!isRuleEnabled(RULE_ID)) return;

    const name = sourceNameFor(effect, data?.origin ?? effect.origin);
    if (name) effect.updateSource({ name });
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to rename an effect after its source.`, err);
  }
}

/**
 * What this effect should be called, or null to leave it alone.
 *
 * @param {object} effect   The effect document (or a candidate for renaming).
 * @param {string} origin   The effect's origin UUID.
 * @returns {string|null}
 */
function sourceNameFor(effect, origin) {
  // Enchantments modify an item rather than mark an actor, so their names are a different thing.
  if (effect.type === "enchantment") return null;

  // A copy applied by the Auras rule is named by that rule, which says which token it radiates
  // from. Renaming it after its source item would strip that back off on every reconcile, and the
  // two rules would take turns undoing each other.
  if (effect.getFlag?.(MODULE_ID, "fromAura")) return null;

  // Conditions and concentration carry status ids. Renaming "Prone" to the item that inflicted it,
  // or the concentration marker to the spell, would lose information rather than add it.
  if (effect.statuses?.size) return null;

  const parentKind = effect.parent?.documentName;

  // An effect living on an item that transfers to its owner, such as a class feature's passive
  // effect. dnd5e shows these in the actor's effects list, so the paladin's Aura of Protection reads
  // "Protected" there. The item itself is the source, no origin lookup needed.
  //
  // Restricted to items owned by an actor. Owned items are copies, so this rewrites the character's
  // own feature and never reaches world or compendium content.
  if (parentKind === "Item") {
    const item = effect.parent;
    if (item.parent?.documentName !== "Actor") return null;
    return nameFromItem(effect, item);
  }

  if (parentKind !== "Actor") return null;
  if (!origin) return null;

  return nameFromItem(effect, resolveSourceItem(origin));
}

/**
 * The name an effect should take from its source item, or null to leave it alone.
 * @param {object} effect
 * @param {object} item
 * @returns {string|null}
 */
export function nameFromItem(effect, item) {
  if (!item?.name) return null;

  // Strip any leading copies of the item name before deciding anything.
  //
  // Content often already names its effects "Draconic Resilience: Armor", and prefixing that again
  // produced "Draconic Resilience: Draconic Resilience: Armor". Reducing to the bare part first
  // makes this idempotent: a correct name is recomputed to itself and left alone, and a name
  // doubled by an earlier pass is repaired rather than extended again.
  const prefix = `${item.name}: `;
  let base = effect.name ?? "";
  while (base.startsWith(prefix)) base = base.slice(prefix.length);

  // A source with several effects would collapse into several identically named entries, so those
  // keep their own name alongside the source rather than becoming indistinguishable.
  const siblings = item.effects?.filter?.(e => e.type !== "enchantment")?.length ?? 0;
  const proposed = (siblings > 1) ? `${item.name}: ${base}` : item.name;

  return (proposed === effect.name) ? null : proposed;
}

/**
 * Resolve an effect origin to the item that produced it.
 *
 * dnd5e sets origin to either an item UUID or an activity UUID depending on what applied the
 * effect, so both shapes have to resolve to the same place.
 *
 * @param {string} origin
 * @returns {object|null}
 */
function resolveSourceItem(origin) {
  let doc = null;
  try {
    doc = fromUuidSync(origin, { strict: false });
  } catch {
    return null;
  }
  if (!doc) return null;

  if (doc.documentName === "Item") return doc;
  if (doc.item?.documentName === "Item") return doc.item;

  // A concentration spell's effect on a target has its origin set to the caster's concentration
  // effect, not to the spell (see dnd5e's EffectApplicationElement#_applyEffectToActor). Follow the
  // item reference the concentration effect carries to get back to the spell that started it.
  if (doc.documentName === "ActiveEffect") {
    const itemUuid = doc.getFlag?.("dnd5e", "item")?.uuid;
    if (itemUuid) {
      const item = fromUuidSync(itemUuid, { strict: false });
      if (item?.documentName === "Item") return item;
      if (typeof item?.name === "string") return item;
    }
    return null;
  }

  // Compendium origins resolve to a plain index entry rather than a document. It still carries the
  // name, which is all this needs.
  if (typeof doc.name === "string") return doc;

  return null;
}

/* -------------------------------------------- */
/*  Sweep                                       */
/* -------------------------------------------- */

/**
 * Settings menu entry that renames effects already present in the world.
 *
 * `registerMenu` checks `type.prototype instanceof ApplicationV2` (or the deprecated
 * FormApplication), so this has to be a real ApplicationV2 subclass. It does not need a window of
 * its own though: Foundry does `new type()` then `render(true)`, so overriding `render` is enough to
 * ask the question and do the work without ever opening an empty frame.
 *
 * Built lazily rather than declared at module scope so it never depends on when `foundry` becomes
 * available relative to this module being imported.
 *
 * @returns {Function}
 */
let menuClass = null;
function renameExistingEffectsMenu() {
  if (menuClass) return menuClass;

  menuClass = class extends foundry.applications.api.ApplicationV2 {
    async render() {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("THR.Rules.SourceNamedEffects.Sweep.Name") },
        content: `<p>${game.i18n.localize("THR.Rules.SourceNamedEffects.Sweep.Confirm")}</p>`
      });
      if (confirmed) await renameExistingEffects();
      return this;
    }
  };

  return menuClass;
}

/**
 * Walk every actor in the world and rename effects to match their source.
 *
 * Covers unlinked token actors as well as world actors, because an unlinked token keeps its own copy
 * of its effects and would otherwise be the one place the naming stayed inconsistent.
 *
 * @returns {Promise<number>}  How many effects were renamed.
 */
export async function renameExistingEffects() {
  if (!game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize("THR.Rules.SourceNamedEffects.Sweep.GMOnly"));
    return 0;
  }

  let renamed = 0;
  for (const actor of allActors()) {
    try {
      const updates = [];
      for (const effect of actor.effects) {
        const name = sourceNameFor(effect, effect.origin);
        if (name) updates.push({ _id: effect.id, name });
      }
      if (updates.length) {
        await actor.updateEmbeddedDocuments("ActiveEffect", updates);
        renamed += updates.length;
      }

      // Effects living on the actor's own items transfer onto the actor and show in its effects
      // list, so they need converting too. They are never created through preCreateActiveEffect,
      // because they arrive as part of the item, which makes this sweep their only route.
      for (const item of actor.items) {
        const itemUpdates = [];
        for (const effect of item.effects) {
          const name = sourceNameFor(effect, effect.origin);
          if (name) itemUpdates.push({ _id: effect.id, name });
        }
        if (itemUpdates.length) {
          await item.updateEmbeddedDocuments("ActiveEffect", itemUpdates);
          renamed += itemUpdates.length;
        }
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to rename effects on "${actor.name}".`, err);
    }
  }

  ui.notifications?.info(game.i18n.format("THR.Rules.SourceNamedEffects.Sweep.Done", { count: renamed }));
  return renamed;
}

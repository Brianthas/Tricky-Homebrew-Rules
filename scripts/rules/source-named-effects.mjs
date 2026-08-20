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
  // Only effects landing on an actor. Effects living on items, and enchantments that modify an item,
  // are a different thing entirely and their names are not "where did this bonus come from".
  if (effect.parent?.documentName !== "Actor") return null;
  if (effect.type === "enchantment") return null;

  // Conditions and concentration carry status ids. Renaming "Prone" to the item that inflicted it,
  // or the concentration marker to the spell, would lose information rather than add it.
  if (effect.statuses?.size) return null;

  if (!origin) return null;

  const item = resolveSourceItem(origin);
  if (!item?.name) return null;
  if (effect.name === item.name) return null;

  // A source with several effects would collapse into several identically named entries, so those
  // keep their own name alongside the source rather than becoming indistinguishable.
  const siblings = item.effects?.filter?.(e => e.type !== "enchantment" && !e.transfer)?.length ?? 0;
  if (siblings > 1) {
    const combined = `${item.name}: ${effect.name}`;
    return (effect.name === combined) ? null : combined;
  }

  return item.name;
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
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to rename effects on "${actor.name}".`, err);
    }
  }

  ui.notifications?.info(game.i18n.format("THR.Rules.SourceNamedEffects.Sweep.Done", { count: renamed }));
  return renamed;
}

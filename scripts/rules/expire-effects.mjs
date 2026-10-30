import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";
import { allActors } from "../lib/actors.mjs";

const RULE_ID = "expireEffects";

/** Region flag holding the UUID of the concentration effect the area belongs to. */
const CONCENTRATION_FLAG = "concentration";

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Removes Active Effects once their duration has run out.
 *
 * Foundry 14's effect registry marks an expired effect `duration.expired`, which `isSuppressed`
 * reads, so the effect stops applying. With the default `CONFIG.ActiveEffect.expiryAction` of
 * "update" it stays on the actor. dnd5e 6 deletes expired effects only when a combatant leaves
 * combat (`Combat5e#_onExit`). This deletes them when their time is up.
 *
 * Concentration is handled the way the rules describe it. dnd5e already puts the concentration
 * effect on the caster and cascades to the targets when it is deleted, so when a concentration
 * spell's effect runs out of time this ends the caster's concentration rather than the target's
 * effect. The target loses the effect and the caster loses the concentration, in one step.
 */
export const expireEffects = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.ExpireEffects.Enabled.Name",
      hint: "THR.Rules.ExpireEffects.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "expireEffectsMode", {
      name: "THR.Rules.ExpireEffects.Mode.Name",
      hint: "THR.Rules.ExpireEffects.Mode.Hint",
      scope: "world",
      config: true,
      type: String,
      default: "delete",
      choices: {
        delete: "THR.Rules.ExpireEffects.Mode.Delete",
        disable: "THR.Rules.ExpireEffects.Mode.Disable"
      }
    });
  },

  registerPatches() {
    // Round and turn based durations tick on turn changes; second based ones tick on world time,
    // which also covers the GM advancing the clock outside combat.
    Hooks.on("combatTurnChange", () => sweepExpired());
    Hooks.on("updateWorldTime", () => sweepExpired());
    Hooks.on("deleteCombat", () => sweepExpired());
    Hooks.on("preCreateRegion", region => linkAreaToConcentration(region));
    Hooks.on("deleteActiveEffect", effect => removeConcentrationAreas(effect));
  },

  onReady() {
    // Catch anything that expired while nobody was logged in to notice.
    if (isRuleEnabled(RULE_ID)) sweepExpired();
  }
};

/* -------------------------------------------- */
/*  Sweep                                       */
/* -------------------------------------------- */

/**
 * Find every expired effect and deal with it.
 *
 * Runs on the active GM alone. Every client sees the same turn change, and without a single owner
 * they would all race to delete the same documents.
 */
async function sweepExpired() {
  if (!game.users.activeGM?.isSelf) return;
  if (!isRuleEnabled(RULE_ID)) return;

  const mode = game.settings.get(MODULE_ID, "expireEffectsMode") ?? "delete";

  try {
    // Deleting a concentration effect cascades to its dependents, which can be on other actors
    // entirely. Collect first, then act, so nothing is handled twice or acted on after its parent
    // already removed it.
    const concentrationToEnd = new Set();
    const perActor = new Map();

    for (const actor of allActors()) {
      for (const effect of actor.effects) {
        if (!isExpired(effect)) continue;

        const concentration = concentrationBehind(effect);
        if (concentration) {
          // The spell ran out of time, so the spell ends: the caster stops concentrating and dnd5e
          // removes this effect, and any sibling effects on other targets, as dependents.
          concentrationToEnd.add(concentration);
          continue;
        }

        if (!perActor.has(actor)) perActor.set(actor, []);
        perActor.get(actor).push(effect);
      }
    }

    // Concentration markers are always deleted, even in disable mode.
    //
    // dnd5e decides whether an actor is concentrating in `Actor5e#concentration`, which walks the
    // actor's effects and checks only for the concentrating status. It never looks at `disabled` or
    // `active`. So a disabled marker still counts: the actor keeps being prompted for concentration
    // saves and keeps consuming a concentration slot, while appearing to have stopped.
    //
    // There is no half-measure available. Ending concentration means removing the marker, and dnd5e
    // then cascades to the dependent effects on every target.
    for (const concentration of concentrationToEnd) {
      try {
        await concentration.delete();
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to end concentration on "${concentration.parent?.name}".`, err);
      }
    }

    for (const [actor, effects] of perActor) {
      // A cascade may already have taken some of these away.
      const remaining = effects.filter(e => actor.effects.get(e.id));
      if (!remaining.length) continue;

      try {
        if (mode === "disable") {
          await actor.updateEmbeddedDocuments("ActiveEffect", remaining.map(e => ({ _id: e.id, disabled: true })));
        } else {
          await actor.deleteEmbeddedDocuments("ActiveEffect", remaining.map(e => e.id));
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to expire effects on "${actor.name}".`, err);
      }
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed while sweeping expired effects.`, err);
  }
}

/* -------------------------------------------- */
/*  Concentration Areas                         */
/* -------------------------------------------- */

/**
 * Record on a spell's area which concentration it belongs to.
 *
 * dnd5e ends a concentration's dependent effects but not the area the spell placed:
 * `ActiveEffect5e#getDependents` keeps a stored dependent only when it shares the caster's actor or
 * item, and core's RegionDocument does not join dnd5e's dependents registry. Aura of Life's area
 * stayed on the scene after concentration ended, still applying its effect to allies inside it.
 *
 * dnd5e flags the area with the activity that placed it (`flags.dnd5e.activity`) and begins
 * concentration before placing it, so at creation the caster's concentration on that activity is
 * this casting's. Its UUID goes on the region, and `removeConcentrationAreas` matches on it. A cast
 * without concentration finds none and the area is left alone.
 *
 * Runs on the client creating the region, before it is saved.
 *
 * @param {object} region  The region about to be created.
 */
function linkAreaToConcentration(region) {
  try {
    if (!isRuleEnabled(RULE_ID)) return;
    const uuid = region.getFlag("dnd5e", "activity");
    if (!uuid) return;

    const actor = fromUuidSync(uuid, { strict: false })?.actor;
    const concentration = actor?.effects.find(effect => isConcentration(effect)
      && (effect.getFlag("dnd5e", "activity")?.uuid === uuid));
    if (concentration) region.updateSource({ [`flags.${MODULE_ID}.${CONCENTRATION_FLAG}`]: concentration.uuid });
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to link a spell's area to its concentration.`, err);
  }
}

/**
 * When concentration ends, delete the areas linked to it by `linkAreaToConcentration`.
 *
 * Runs on the active GM alone, for the same reason as the sweep.
 *
 * @param {object} effect  The deleted effect.
 */
async function removeConcentrationAreas(effect) {
  try {
    if (!game.users.activeGM?.isSelf) return;
    if (!isRuleEnabled(RULE_ID)) return;
    if (!isConcentration(effect)) return;

    for (const scene of game.scenes) {
      const ids = scene.regions
        .filter(region => region.getFlag(MODULE_ID, CONCENTRATION_FLAG) === effect.uuid)
        .map(region => region.id);
      if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to remove the area of a spell whose concentration ended.`, err);
  }
}

/**
 * Is this effect past its duration?
 *
 * Foundry decides, and this rule reads the decision. On each combat event and world time change,
 * core's `ActiveEffectRegistry#refresh` expires a tracked effect when its remaining duration is
 * reached and the event matches its `expiry`, then writes `duration.expired: true` to the stored
 * effect (`CONFIG.ActiveEffect.expiryAction` "update"). Only temporary effects with a start are
 * tracked, so a condition with no duration is never written as expired.
 *
 * The stored value and the derived one must both say expired. `ActiveEffect#_prepareDuration`
 * forces the derived value false for an effect that is not temporary, and for a timed effect with
 * time left after the clock is wound back.
 *
 * No numeric countdown is required. An expiry-only duration such as Shield's "until the start of
 * your next turn" (`value: null, expiry: "sourceStart"`) has infinite `seconds` and `remaining`, and
 * dnd5e's packs carry 18 effects of that shape.
 *
 * @param {object} effect
 * @returns {boolean}
 */
export function isExpired(effect) {
  if (!effect) return false;
  if (effect.disabled) return false;
  if (!effect.isTemporary) return false;
  if (effect._source?.duration?.expired !== true) return false;
  return effect.duration?.expired === true;
}

/**
 * If this effect only exists because someone is concentrating, return that concentration effect.
 *
 * A concentration spell's effect on a target carries `flags.dnd5e.dependentOn` pointing at the
 * caster's concentration effect (see dnd5e's EffectApplicationElement#_applyEffectToActor), which is
 * what makes the caster the owner of the spell rather than the target.
 *
 * @param {object} effect
 * @returns {object|null}
 */
function concentrationBehind(effect) {
  // The concentration effect itself expiring is an ordinary expiry: delete it and dnd5e cascades.
  if (isConcentration(effect)) return null;

  const dependentOn = effect.getFlag?.("dnd5e", "dependentOn");
  if (!dependentOn) return null;

  let parent = null;
  try {
    parent = fromUuidSync(dependentOn, { strict: false });
  } catch {
    return null;
  }

  if (parent?.documentName !== "ActiveEffect") return null;
  return isConcentration(parent) ? parent : null;
}

/**
 * Is this the marker that says someone is concentrating?
 * @param {object} effect
 * @returns {boolean}
 */
function isConcentration(effect) {
  const status = CONFIG.specialStatusEffects?.CONCENTRATING;
  return !!status && !!effect?.statuses?.has(status);
}

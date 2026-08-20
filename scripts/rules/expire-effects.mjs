import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";
import { allActors } from "../lib/actors.mjs";

const RULE_ID = "expireEffects";

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Removes Active Effects once their duration has run out.
 *
 * Nothing on a stock Foundry 14 plus dnd5e install does this. dnd5e has no expiry handling and does
 * not listen for turn changes. Foundry works out that an effect is expired and exposes it as
 * `effect.duration.expired`, but neither deletes nor disables it, so the effect keeps applying
 * forever. The modules that normally fill this gap, Times-Up and DAE, both stop at Foundry 13.999.
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

/**
 * Is this effect past its duration?
 *
 * Foundry already does the arithmetic and exposes the answer, including the rounds and turns cases,
 * so this rule never has to work out durations itself.
 *
 * @param {object} effect
 * @returns {boolean}
 */
function isExpired(effect) {
  if (!effect) return false;
  if (effect.disabled) return false;

  const duration = effect.duration ?? {};

  // `isTemporary` and `expired` are not enough on their own. Foundry defines isTemporary as
  // `!!duration.expiry || Number.isFinite(duration.value)`, which is true for conditions like
  // Bloodied that have no countdown whatsoever, and those report `expired: true` permanently.
  // Trusting those two fields alone switched off every condition on the actor.
  //
  // An effect can only run out of time if it was given time to begin with, so require a real
  // countdown. This still covers concentration, whose marker carries a genuine duration.
  const hasCountdown = Number.isFinite(duration.seconds)
    || Number.isFinite(duration.rounds)
    || Number.isFinite(duration.turns);
  if (!hasCountdown) return false;
  if (!Number.isFinite(duration.remaining)) return false;

  return duration.expired === true;
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

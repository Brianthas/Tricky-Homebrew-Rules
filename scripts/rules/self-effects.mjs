import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";

const RULE_ID = "selfEffects";
const SCOPE_KEY = `${RULE_ID}Scope`;

/** Which self-range spells get their effect applied without being asked. */
const SCOPE = {
  /** Only spells that target nobody but the caster, such as Shield or Mage Armor. */
  CASTER_ONLY: "casterOnly",

  /** Also spells centred on the caster that radiate, such as Aura of Life. */
  INCLUDING_EMANATIONS: "emanations"
};

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Applies a self-targeted spell's effect to the caster automatically.
 *
 * dnd5e posts a card with an Apply Effect button and waits to be told who to apply it to. For a
 * spell whose range is Self there is nobody else it could go on, so the button asks a question with
 * one possible answer. Shield in particular is cast in the middle of someone else's attack, where
 * the extra clicks are worst.
 *
 * Range is the test, because it is the field that actually says so. Shield reports `range.units` of
 * "self" with `affects.type` of "self", while Bless and Shield of Faith report a range in feet and
 * affect a creature, so they keep their button and their choice of target.
 *
 * The application itself mirrors dnd5e's own `EffectApplicationElement#_applyEffectToActor` rather
 * than inventing a second way to do it: the same `dependentOn`, `scaling` and `spellLevel` flags,
 * the same reuse of an existing effect from the same origin, and the same origin pointing at the
 * concentration effect when there is one. Getting that wrong would break concentration tracking,
 * which is what makes an aura disappear when the caster loses it.
 */
export const selfEffects = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.SelfEffects.Settings.Enabled.Name",
      hint: "THR.Rules.SelfEffects.Settings.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, SCOPE_KEY, {
      name: "THR.Rules.SelfEffects.Settings.Scope.Name",
      hint: "THR.Rules.SelfEffects.Settings.Scope.Hint",
      scope: "world",
      config: true,
      type: String,
      default: SCOPE.INCLUDING_EMANATIONS,
      choices: {
        [SCOPE.CASTER_ONLY]: "THR.Rules.SelfEffects.Settings.Scope.CasterOnly",
        [SCOPE.INCLUDING_EMANATIONS]: "THR.Rules.SelfEffects.Settings.Scope.Emanations"
      }
    });
  },

  registerPatches() {
    Hooks.on("dnd5e.postCreateUsageMessage", onUsageMessage);
  }
};

/* -------------------------------------------- */
/*  Application                                 */
/* -------------------------------------------- */

/**
 * A usage card has been posted. Apply the activity's effects to the caster if it only targets them.
 *
 * @param {object} activity
 * @param {object} card
 */
async function onUsageMessage(activity, card) {
  try {
    if (!isRuleEnabled(RULE_ID)) return;

    // Every connected client sees this hook. Only the one who used the item should write, otherwise
    // three players cast Shield once and the effect is created three times.
    if (card?.author?.id && card.author.id !== game.user.id) return;

    // `create: false` hands back plain data rather than a document, which is not a real usage.
    if (!card?.id) return;

    if (!appliesToCasterOnly(activity)) return;

    const actor = activity?.actor;
    if (!actor) return;
    if (!game.user.isGM && !actor.isOwner) return;

    for (const entry of activity.effects ?? []) {
      const effect = entry?.effect;
      if (!effect) continue;

      // Enchantments modify an item rather than buffing a creature, so they are never a self buff.
      if (effect.type === "enchantment") continue;

      await applyToCaster(effect, actor, card);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply a self-targeted effect automatically.`, err);
  }
}

/**
 * Does this activity have the caster as its only possible recipient?
 *
 * @param {object} activity
 * @returns {boolean}
 */
function appliesToCasterOnly(activity) {
  if (activity?.range?.units !== "self") return false;

  const scope = game.settings.get(MODULE_ID, SCOPE_KEY);
  if (scope !== SCOPE.CASTER_ONLY) return true;

  // An emanation is centred on the caster but reaches other creatures, so under the narrow setting
  // it keeps its button.
  return !activity?.target?.template?.type;
}

/**
 * Put one effect on the caster, the way dnd5e's own Apply Effect button would.
 *
 * @param {object} effect  The effect on the item.
 * @param {object} actor   The caster.
 * @param {object} card    The usage message.
 * @returns {Promise<object|null>}
 */
async function applyToCaster(effect, actor, card) {
  // A concentration spell's effect hangs off the concentration marker rather than off itself. That
  // is what lets dnd5e remove it when concentration ends, so the origin has to match what dnd5e
  // would have written.
  const concentration = actor.effects.get(card?.system?.concentration);
  const origin = concentration ?? effect;

  const flags = {
    dnd5e: {
      dependentOn: origin.uuid,
      scaling: card?.system?.scaling,
      spellLevel: card?.system?.spellLevel
    }
  };

  // Recasting refreshes what is already there instead of stacking a second copy, matching what
  // clicking the button twice does.
  const existing = actor.effects.find(e => e.origin === origin.uuid);
  if (existing) {
    return existing.update(foundry.utils.mergeObject({
      ...effect.constructor.getInitialDuration(),
      disabled: false
    }, { flags }));
  }

  const data = foundry.utils.mergeObject({
    ...effect.toObject(),
    disabled: false,
    transfer: false,
    origin: origin.uuid
  }, { flags });

  return ActiveEffect.implementation.create(data, { parent: actor });
}

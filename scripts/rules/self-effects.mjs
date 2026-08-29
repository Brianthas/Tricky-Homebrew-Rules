import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";

const RULE_ID = "selfEffects";
const SCOPE_KEY = `${RULE_ID}Scope`;

/** Which self-range spells get their effect applied without being asked. */
const SCOPE = {
  /** Only spells that target nobody but the caster, such as Shield or Blur. */
  CASTER_ONLY: "casterOnly",

  /** Also spells centred on the caster that radiate, such as Aura of Life. */
  INCLUDING_EMANATIONS: "emanations"
};

/**
 * Activity types that resolve against a creature other than the one using them, whatever their
 * range says. An attack rolls against another creature's AC, a save asks another creature for a
 * saving throw, a check contests another creature's check, and damage is dealt to somebody.
 *
 * Stunning Strike is why this list exists: it is a `save` activity whose range is Self, because the
 * feature has no range of its own and rides an attack that already found its target. Its Stunned
 * and Slowed effects belong on that target, not on the monk.
 */
const RESOLVES_AGAINST_ANOTHER = new Set(["attack", "check", "damage", "save"]);

/**
 * dnd5e's area type for an emanation, which it labels `DND5E.TARGET.Type.Emanation.Label`. It is
 * the only self-centred area that contains its own origin: a cone, line or cube with a range of
 * Self starts at the caster and points away from them.
 */
const EMANATION = "radius";

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
 * A range of Self is necessary but nowhere near sufficient. It is also what dnd5e writes on a
 * feature that has no range of its own, so Stunning Strike, every poison and most monster grapples
 * report `range.units` of "self" while their effects belong on somebody else entirely. Three more
 * questions separate them: the activity must not resolve against another creature, it must not name
 * a target type other than Self, and any area it covers must be an emanation rather than a cone.
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
 * Exported for the tests: this is the whole rule, and every bug it has had was here.
 *
 * @param {object} activity
 * @returns {boolean}
 */
export function appliesToCasterOnly(activity) {
  // Range says where the activity reaches. Anything with a range in feet reaches somebody else.
  if (activity?.range?.units !== "self") return false;

  // ...but a range of Self is also the default for a feature that never had one, so it cannot be
  // trusted alone. How the activity resolves is the more honest answer.
  if (RESOLVES_AGAINST_ANOTHER.has(activity?.type)) return false;

  // A named target type other than Self says somebody else receives this. Shield says "self",
  // Blur and Mirror Image say nothing at all and both mean the caster, while Stunning Strike says
  // "creature" and a monster's Fear Aura says "enemy".
  const affects = activity?.target?.affects?.type ?? "";
  if (affects && (affects !== "self")) return false;

  // No area at all: the caster is the only one left.
  const template = activity?.target?.template?.type ?? "";
  if (!template) return true;

  // Burning Hands is range Self too, and does not burn the wizard. Only an emanation includes the
  // creature it radiates from.
  if (template !== EMANATION) return false;

  // An emanation reaches other creatures as well, so under the narrow setting it keeps its button.
  return game.settings.get(MODULE_ID, SCOPE_KEY) !== SCOPE.CASTER_ONLY;
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

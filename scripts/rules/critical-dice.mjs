import { MODULE_ID } from "../lib/constants.mjs";
import { registerLibWrapper } from "../lib/wrapper.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";

const RULE_ID = "criticalDice";

/**
 * Set on a die result this rule has maximized. DiceTerm serializes its `results` array wholesale, so
 * these ride along onto the chat message and survive a reload - which is what lets the markers still
 * be there when the log is scrolled back through later.
 */
const UPGRADED = "trickyCritical";

/** CSS class marking an upgraded die, so it reads differently from a die that honestly rolled max. */
const UPGRADED_CLASS = "tricky-critical-upgraded";

/** CSS class for the small "what it actually rolled" number in the corner of an upgraded die. */
const FROM_CLASS = "tricky-critical-from";

/**
 * dnd5e reuses its DamageRoll class for healing activities too, and a "critical heal" isn't a thing
 * this house rule is meant to touch. Damage types in this set are skipped entirely.
 */
const HEALING_TYPES = new Set(["healing", "temphp"]);

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * On a critical hit, the dice with the most to gain are replaced with their maximum value.
 *
 * Selection is by *gain* (`faces - rolled`), not by lowest roll - a 5 on a d12 (+7) beats a 1 on a
 * d4 (+3). Every damage part of the crit shares one pool, so a Rogue's weapon dice and Sneak Attack
 * dice compete for the same slots rather than each getting their own.
 */
export const criticalDice = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.CriticalDice.Enabled.Name",
      hint: "THR.Rules.CriticalDice.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "criticalDiceCount", {
      name: "THR.Rules.CriticalDice.Count.Name",
      hint: "THR.Rules.CriticalDice.Count.Hint",
      scope: "world",
      config: true,
      type: Number,
      default: 2,
      range: { min: 1, max: 10, step: 1 }
    });

    game.settings.register(MODULE_ID, "criticalDiceApplyToNPCs", {
      name: "THR.Rules.CriticalDice.ApplyToNPCs.Name",
      hint: "THR.Rules.CriticalDice.ApplyToNPCs.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
  },

  registerPatches() {
    // buildEvaluate is the only stage of dnd5e's roll pipeline (buildConfigure -> buildEvaluate ->
    // buildPost) where every damage part of a single crit is both already rolled and not yet posted
    // to chat. Rolling happens per damage part, but this rule pools across all of them, so a per-roll
    // hook can't see enough - and the post-roll hooks fire after the chat message already exists.
    registerLibWrapper("CONFIG.Dice.DamageRoll.buildEvaluate", onBuildEvaluate, "WRAPPER", {
      feature: "Critical dice upgrading"
    });

    // Tags upgraded dice in the roll breakdown. Die inherits getResultCSS from DiceTerm rather than
    // overriding it, so this one patch covers every damage die. It only appends a class when this
    // rule's own marker is present, so unrelated dice everywhere else in the game are untouched.
    registerLibWrapper("foundry.dice.terms.DiceTerm.prototype.getResultCSS", onGetResultCSS, "WRAPPER", {
      feature: "Highlighting of upgraded critical dice"
    });

    // Draws the natural value into the corner of an upgraded die. This one returns markup, which is
    // safe here specifically: getResultLabel has exactly one consumer in core - getTooltipData - and
    // the tooltip template renders it through a triple-stash ({{{this.result}}}), i.e. as HTML by
    // design. The only interpolated value is a number this rule itself recorded.
    registerLibWrapper("foundry.dice.terms.DiceTerm.prototype.getResultLabel", onGetResultLabel, "WRAPPER", {
      feature: "The original-value marker on upgraded critical dice"
    });
  },

  onReady() {
    if (!isRuleEnabled(RULE_ID)) return;

    // dnd5e's own "Powerful Critical" already maximizes the base damage dice and drops the crit
    // multiplier to 1, so there are far fewer rolled dice left for this rule to upgrade. The two
    // house rules stack into something neither of them describes - warn rather than silently fight it.
    if (game.settings.get("dnd5e", "criticalDamageMaxDice")) {
      console.warn(
        `${MODULE_ID} | dnd5e's "Maximize Critical Damage" (Powerful Critical) setting is enabled. It `
        + "already maximizes base damage dice on a crit, leaving fewer rolled dice for the Tricky "
        + "Critical Dice rule to upgrade. Turn one of the two off unless you specifically want both."
      );
    }
  }
};

/* -------------------------------------------- */
/*  Roll Interception                           */
/* -------------------------------------------- */

/**
 * Wraps `DamageRoll.buildEvaluate`. Lets dnd5e roll the damage exactly as normal, then upgrades the
 * best dice before `buildPost` turns the rolls into a chat message.
 *
 * `buildEvaluate` is inherited from BasicRoll rather than defined on DamageRoll, so libWrapper may
 * bind this patch somewhere that sees non-damage rolls too. Every guard below is written to bail
 * harmlessly in that case rather than assuming the rolls are damage.
 *
 * @param {Function} wrapped
 * @param {object[]} rolls    Rolls to evaluate.
 * @param {object} [config]   Configuration for the rolls.
 * @param {object} [message]  Configuration for message creation.
 */
async function onBuildEvaluate(wrapped, rolls, config = {}, message = {}, ...rest) {
  const result = await wrapped(rolls, config, message, ...rest);

  // Never let a bug in this rule break the underlying roll - the damage still needs to be dealt.
  try {
    applyCriticalDice(rolls, config);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply critical dice upgrades. The roll is unmodified.`, err);
  }

  return result;
}

/**
 * Wraps `DiceTerm#getResultCSS` to mark dice this rule maximized.
 * @param {Function} wrapped
 * @param {object} result   The rolled result being rendered.
 * @returns {(string|null)[]}
 */
function onGetResultCSS(wrapped, result, ...rest) {
  const classes = wrapped(result, ...rest);
  if (result?.[UPGRADED] && Array.isArray(classes)) classes.push(UPGRADED_CLASS);
  return classes;
}

/**
 * Wraps `DiceTerm#getResultLabel` to tuck the natural rolled value into the corner of an upgraded
 * die, so the table can see what it actually rolled before the house rule replaced it.
 * @param {Function} wrapped
 * @param {object} result   The rolled result being rendered.
 * @returns {string}
 */
function onGetResultLabel(wrapped, result, ...rest) {
  const label = wrapped(result, ...rest);
  const from = result?.[`${UPGRADED}From`];
  if (!result?.[UPGRADED] || !Number.isFinite(from)) return label;
  return `${label}<span class="${FROM_CLASS}">${from}</span>`;
}

/**
 * The house rule itself. Pools every die across every damage part of one critical hit, picks the
 * dice with the most to gain, and rewrites those dice to their maximum value.
 *
 * The winning dice are edited in place rather than being left alone with a flat bonus added
 * alongside them, so the card reads as an ordinary (very good) roll: 4d6 showing 6, 6, 6, 5 rather
 * than 4d6 + 6. Because this happens before the chat message is created, Dice So Nice animates the
 * upgraded values - the natural roll is never shown landing.
 *
 * @param {object[]} rolls
 * @param {object} config
 */
function applyCriticalDice(rolls, config) {
  if (!isRuleEnabled(RULE_ID)) return;
  if (!Array.isArray(rolls) || !rolls.length) return;

  const criticalRolls = rolls.filter(roll => isUpgradableRoll(roll));
  if (!criticalRolls.length) return;

  if (!game.settings.get(MODULE_ID, "criticalDiceApplyToNPCs")) {
    const actor = config?.subject?.actor ?? null;
    if (actor && !actor.hasPlayerOwner) return;
  }

  const candidates = collectCandidates(criticalRolls);
  if (!candidates.length) return;

  // Largest gain first. The rule is "most to gain", NOT "lowest rolled" - a 1 on a d4 (+3) is worth
  // less than a 5 on a d12 (+7), so the d12 wins even though it rolled higher. Ties go to the bigger
  // die, which is the "prioritise the higher die" half of the house rule.
  candidates.sort((a, b) => (b.gain - a.gain) || (b.faces - a.faces));

  const count = game.settings.get(MODULE_ID, "criticalDiceCount") ?? 2;
  const chosen = candidates.slice(0, count);
  if (!chosen.length) return;

  // Rewrite each winning die to its maximum face. DiceTerm#total is a live getter over `results`, so
  // editing a result here is enough to change what that term contributes - only the parent Roll's
  // cached total needs recomputing afterwards.
  const touched = new Set();
  for (const candidate of chosen) {
    candidate.result[`${UPGRADED}From`] = candidate.result.result;
    candidate.result[UPGRADED] = true;
    candidate.result.result = candidate.faces;
    touched.add(candidate.roll);
  }

  // Damage typing takes care of itself: each die stays in the damage part it was already part of, so
  // a maximized fire die is still fire when the card is applied.
  for (const roll of touched) roll._total = roll._evaluateTotal();
}

/**
 * Is this a critical damage roll this rule should touch?
 * @param {object} roll
 * @returns {boolean}
 */
function isUpgradableRoll(roll) {
  if (!(roll instanceof CONFIG.Dice.DamageRoll)) return false;
  if (roll.isCritical !== true) return false;
  if (HEALING_TYPES.has(roll.options?.type)) return false;
  return true;
}

/**
 * Collect every die that could be upgraded, across all damage parts of the crit.
 * @param {object[]} rolls
 * @returns {object[]}  `{roll, result, faces, gain}` per eligible die result.
 */
function collectCandidates(rolls) {
  const { DiceTerm, OperatorTerm } = foundry.dice.terms;
  const candidates = [];

  for (const roll of rolls) {
    // Tracks whether the current term is being added or subtracted. Maximizing a subtracted die
    // would make the damage *worse*, so those are skipped entirely.
    let sign = 1;

    for (const term of roll.terms) {
      if (term instanceof OperatorTerm) {
        if (term.operator === "+") sign = 1;
        else if (term.operator === "-") sign = -1;
        else sign = 0; // "*" or "/" - the die's contribution isn't a simple sum, so leave it alone.
        continue;
      }

      if (!(term instanceof DiceTerm)) continue;
      if (sign !== 1) continue;
      if (term.number < 0) continue;

      const faces = term.faces;
      if (!Number.isFinite(faces) || faces < 2) continue;

      for (const result of term.results) {
        // Dice dropped by a modifier (kh, r, etc.) don't contribute to the total, so upgrading one
        // would add nothing while burning one of the slots.
        if (result.active === false) continue;
        if (result.count !== undefined) continue; // success-counting dice, not a damage value.

        const gain = faces - result.result;
        if (gain <= 0) continue; // Already maximized - nothing to win here.

        candidates.push({ roll, result, faces, gain });
      }
    }
  }

  return candidates;
}

const MODULE_ID = "tricky-critical-dice";

/**
 * Marks the NumericTerm this module appends to a damage roll, so it can be recognised later (for
 * debugging, or to avoid double-counting if some other module re-runs the same roll through us).
 */
const BONUS_TERM_FLAG = "trickyCriticalBonus";

/**
 * dnd5e reuses its DamageRoll class for healing activities too, and a "critical heal" isn't a thing
 * this house rule is meant to touch. Damage types in this set are skipped entirely.
 */
const HEALING_TYPES = new Set(["healing", "temphp"]);

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

/**
 * Register a libWrapper patch defensively. This module hooks one fairly deep, undocumented part of
 * dnd5e's roll pipeline (`DamageRoll.buildEvaluate`), which a future dnd5e release could rename or
 * restructure. Failing loudly here means the GM finds out exactly what broke after a system update
 * instead of quietly wondering why crits stopped upgrading.
 * @param {string} target
 * @param {Function} fn
 * @param {string} type
 */
function registerLibWrapper(target, fn, type) {
  try {
    libWrapper.register(MODULE_ID, target, fn, type);
  } catch (err) {
    console.error(
      `${MODULE_ID} | Failed to patch "${target}". The dnd5e system may have changed something this `
      + "module depends on - critical dice will not be upgraded until the module is updated.", err
    );
    ui.notifications?.error(
      `Tricky Critical Dice failed to patch dnd5e (${target}). Critical hits will roll normally - `
      + "check the console (F12) and consider reporting this on the module's GitHub issues.",
      { permanent: true }
    );
  }
}

Hooks.once("init", () => {
  if (!CONFIG.DND5E) {
    console.error(`${MODULE_ID} | The dnd5e system is not active. This module requires it and will not function.`);
    return;
  }

  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "TCD.Settings.ModuleEnabled.Name",
    hint: "TCD.Settings.ModuleEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "diceCount", {
    name: "TCD.Settings.DiceCount.Name",
    hint: "TCD.Settings.DiceCount.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 2,
    range: { min: 1, max: 10, step: 1 }
  });

  game.settings.register(MODULE_ID, "applyToNPCs", {
    name: "TCD.Settings.ApplyToNPCs.Name",
    hint: "TCD.Settings.ApplyToNPCs.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // buildEvaluate is the only stage of dnd5e's roll pipeline (buildConfigure -> buildEvaluate ->
  // buildPost) where every damage part of a single crit is both already rolled and not yet posted to
  // chat. Rolling happens per damage part, but the house rule pools across all of them, so a per-roll
  // hook can't see enough - and the post-roll hooks fire after the chat message already exists.
  registerLibWrapper("CONFIG.Dice.DamageRoll.buildEvaluate", onBuildEvaluate, "WRAPPER");
});

Hooks.once("ready", () => {
  if (!CONFIG.DND5E || !game.settings.settings.has(`${MODULE_ID}.moduleEnabled`)) return;

  // dnd5e's own "Powerful Critical" already maximizes the base damage dice and drops the crit
  // multiplier to 1, so there are far fewer rolled dice left for this module to upgrade. The two
  // house rules stack into something neither of them describes - warn rather than silently fight it.
  if (game.settings.get("dnd5e", "criticalDamageMaxDice")) {
    console.warn(
      `${MODULE_ID} | dnd5e's "Maximize Critical Damage" (Powerful Critical) setting is enabled. It `
      + "already maximizes base damage dice on a crit, leaving fewer rolled dice for this module to "
      + "upgrade. Turn one of the two off unless you specifically want both."
    );
  }
});

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
 * @param {object[]} rolls                Rolls to evaluate.
 * @param {object} [config]               Configuration for the rolls.
 * @param {object} [message]              Configuration for message creation.
 */
async function onBuildEvaluate(wrapped, rolls, config = {}, message = {}, ...rest) {
  const result = await wrapped(rolls, config, message, ...rest);

  // Never let a bug in this module break the underlying roll - the damage still needs to be dealt.
  try {
    applyTrickyCritical(rolls, config, message);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply critical dice upgrades. The roll is unmodified.`, err);
  }

  return result;
}

/**
 * The house rule itself. Pools every die across every damage part of one critical hit, picks the
 * dice with the most to gain, and adds their combined gain as a flat bonus.
 *
 * The dice results themselves are deliberately left untouched. Rewriting them before the message is
 * created would make Dice So Nice land the 3D dice on the already-upgraded values, so nobody at the
 * table ever sees the natural roll. Adding a flat bonus instead keeps the real dice visible and makes
 * the upgrade auditable - and it's the same approach dnd5e uses for its own Powerful Critical rule.
 *
 * @param {object[]} rolls
 * @param {object} config
 * @param {object} message
 */
function applyTrickyCritical(rolls, config, message) {
  if (!game.settings.get(MODULE_ID, "moduleEnabled")) return;
  if (!Array.isArray(rolls) || !rolls.length) return;

  const criticalRolls = rolls.filter(roll => isUpgradableRoll(roll));
  if (!criticalRolls.length) return;

  if (!game.settings.get(MODULE_ID, "applyToNPCs")) {
    const actor = config?.subject?.actor ?? null;
    if (actor && !actor.hasPlayerOwner) return;
  }

  const candidates = collectCandidates(criticalRolls);
  if (!candidates.length) return;

  // Largest gain first. The rule is "most to gain", NOT "lowest rolled" - a 1 on a d4 (+3) is worth
  // less than a 5 on a d12 (+7), so the d12 wins even though it rolled higher. Ties go to the bigger
  // die, which is the "prioritise the higher die" half of the house rule.
  candidates.sort((a, b) => (b.gain - a.gain) || (b.faces - a.faces));

  const count = game.settings.get(MODULE_ID, "diceCount") ?? 2;
  const chosen = candidates.slice(0, count);
  if (!chosen.length) return;

  // Group by the roll each die belongs to. The two winners can come from different damage parts (a
  // slashing d6 and a fire d8), and each part's bonus has to stay on that part so damage typing and
  // per-type resistance still work when the card is applied.
  const byRoll = new Map();
  for (const candidate of chosen) {
    if (!byRoll.has(candidate.roll)) byRoll.set(candidate.roll, []);
    byRoll.get(candidate.roll).push(candidate);
  }

  for (const [roll, picks] of byRoll) {
    const bonus = picks.reduce((sum, pick) => sum + pick.gain, 0);
    appendBonusTerm(roll, bonus, damageTypeLabel(roll));
  }

  recordUpgrades(message, chosen);
}

/**
 * Is this a critical damage roll this module should touch?
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
 * @returns {object[]}  `{roll, faces, gain, from}` per eligible die result.
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
        // would add nothing while burning one of the two slots.
        if (result.active === false) continue;
        if (result.count !== undefined) continue; // success-counting dice, not a damage value.

        const gain = faces - result.result;
        if (gain <= 0) continue; // Already maximized - nothing to win here.

        candidates.push({ roll, faces, gain, from: result.result });
      }
    }
  }

  return candidates;
}

/**
 * Append an evaluated flat bonus to an already-evaluated roll and recompute its total.
 * @param {object} roll
 * @param {number} number
 * @param {string} flavor
 */
function appendBonusTerm(roll, number, flavor) {
  const { NumericTerm, OperatorTerm } = foundry.dice.terms;

  const operator = new OperatorTerm({ operator: "+" });
  const bonus = new NumericTerm({ number, options: { flavor, [BONUS_TERM_FLAG]: true } });

  // RollTerm#_evaluated defaults to false. The roll itself is already evaluated by this point, so
  // these have to be marked evaluated too or the roll ends up in a mixed state.
  operator._evaluated = true;
  bonus._evaluated = true;

  roll.terms.push(operator, bonus);
  roll.resetFormula();
  roll._total = roll._evaluateTotal();
}

/**
 * Human-readable damage type for a roll, used as the bonus term's flavor.
 * @param {object} roll
 * @returns {string}
 */
function damageTypeLabel(roll) {
  const type = roll.options?.type;
  if (!type) return game.i18n.localize("TCD.BonusFlavor");
  return CONFIG.DND5E.damageTypes?.[type]?.label ?? type;
}

/**
 * Stash what was upgraded on the pending message so the chat card can show it.
 *
 * `buildPost` runs `expandObject` over `message.data` before creating the message, so writing a
 * nested flag here rides along onto the created ChatMessage.
 *
 * @param {object} message
 * @param {object[]} chosen
 */
function recordUpgrades(message, chosen) {
  if (!message || typeof message !== "object") return;

  message.data ??= {};
  foundry.utils.setProperty(message.data, `flags.${MODULE_ID}.upgrades`, chosen.map(pick => ({
    faces: pick.faces,
    from: pick.from,
    to: pick.faces,
    gain: pick.gain,
    type: pick.roll.options?.type ?? null
  })));
}

/* -------------------------------------------- */
/*  Chat Card                                   */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const upgrades = message.getFlag(MODULE_ID, "upgrades");
  if (!upgrades?.length) return;

  const content = html.querySelector(".message-content");
  if (!content) return;

  const section = document.createElement("section");
  section.classList.add("tricky-critical");

  const title = document.createElement("h4");
  title.classList.add("tricky-critical-title");
  title.textContent = game.i18n.localize("TCD.CardTitle");
  section.append(title);

  const list = document.createElement("ul");
  list.classList.add("tricky-critical-list");

  for (const upgrade of upgrades) {
    const item = document.createElement("li");

    const die = document.createElement("span");
    die.classList.add("tricky-critical-die");
    die.textContent = game.i18n.format("TCD.CardUpgrade", {
      faces: upgrade.faces,
      from: upgrade.from,
      to: upgrade.to
    });

    const gain = document.createElement("span");
    gain.classList.add("tricky-critical-gain");
    const type = upgrade.type ? (CONFIG.DND5E.damageTypes?.[upgrade.type]?.label ?? upgrade.type) : null;
    gain.textContent = type ? `+${upgrade.gain} ${type}` : `+${upgrade.gain}`;

    item.append(die, gain);
    list.append(item);
  }

  section.append(list);
  content.append(section);
});

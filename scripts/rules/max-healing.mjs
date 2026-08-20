import { MODULE_ID } from "../lib/constants.mjs";
import { registerLibWrapper } from "../lib/wrapper.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";

const RULE_ID = "maxHealing";

/**
 * Set on a roll chosen to be maximized, so the evaluate wrapper knows to pass `maximize` through.
 * Lives on `roll.options` because that is the only thing that survives from the dialog finalising
 * the rolls to dnd5e actually evaluating them.
 */
const MAXIMIZE = "trickyMaximize";

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Adds a "Maximize" button to the healing roll dialog, which rolls the healing at its maximum value
 * instead of rolling the dice.
 *
 * For a potion drunk as an action, or any healing while Beacon of Hope is up, where the rules say the
 * recipient regains the maximum possible.
 *
 * This is deliberately a button rather than automatic detection. Whether healing should be maximized
 * depends on an effect sitting on the *recipient*, and the recipient is not reliably known at the
 * moment the healer rolls. A button puts the decision where the information actually is.
 */
export const maxHealing = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.MaxHealing.Enabled.Name",
      hint: "THR.Rules.MaxHealing.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
  },

  registerPatches() {
    // The dialog class reached through CONFIG rather than the dnd5e namespace, so a future
    // reorganisation of dnd5e's exports does not break the target path.
    const dialogPath = "CONFIG.Dice.DamageRoll.DefaultConfigurationDialog.prototype";

    registerLibWrapper(`${dialogPath}._prepareButtonsContext`, onPrepareButtonsContext, "WRAPPER", {
      feature: "The Maximize button on healing rolls"
    });

    // The clicked button's data-action is handed straight to _finalizeRolls with no validation
    // against a known list, so a new button needs no other registration to be recognised.
    registerLibWrapper(`${dialogPath}._finalizeRolls`, onFinalizeRolls, "WRAPPER", {
      feature: "The Maximize button on healing rolls"
    });

    // dnd5e's BasicRoll#evaluate already forwards `maximize` into both its own preCalculateDiceTerms
    // and Foundry's core evaluation, so the whole rule amounts to getting that one option set.
    registerLibWrapper("CONFIG.Dice.DamageRoll.prototype.evaluate", onEvaluate, "WRAPPER", {
      feature: "Maximized healing rolls"
    });

    // A maximized roll otherwise looks identical to one that genuinely rolled its maximum, which
    // makes it impossible to tell the difference after the fact.
    Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  }
};

/* -------------------------------------------- */
/*  Chat Card Marker                            */
/* -------------------------------------------- */

/**
 * Label a card whose healing was maximized rather than rolled.
 *
 * The tag lives on `roll.options`, which Foundry serializes onto the message, so it survives a
 * reload and needs no separate message flag.
 *
 * @param {object} message
 * @param {HTMLElement} html
 */
function onRenderChatMessage(message, html) {
  try {
    if (!message?.rolls?.some(roll => roll?.options?.[MAXIMIZE])) return;

    const content = html.querySelector(".message-content");
    if (!content) return;
    if (content.querySelector(".tricky-maximized")) return;

    const banner = document.createElement("div");
    banner.classList.add("tricky-maximized");
    banner.innerHTML = `<i class="fa-solid fa-heart-circle-plus" inert></i> `
      + game.i18n.localize("THR.Rules.MaxHealing.Marker");

    content.prepend(banner);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to mark a maximized healing card.`, err);
  }
}

/* -------------------------------------------- */
/*  Dialog                                      */
/* -------------------------------------------- */

/**
 * Wraps the damage roll dialog's button context to append a Maximize button on healing rolls.
 * @param {Function} wrapped
 * @param {object} context
 * @param {object} options
 * @returns {Promise<object>}
 */
async function onPrepareButtonsContext(wrapped, context, options) {
  context = await wrapped(context, options);

  try {
    if (!isRuleEnabled(RULE_ID)) return context;
    if (!isHealingDialog(this)) return context;

    // Appended rather than inserted, so the existing button keeps its position and its `default`
    // flag. Pressing Enter still rolls normally.
    context.buttons ??= {};
    context.buttons.maximize = {
      icon: '<i class="fa-solid fa-heart-circle-plus" inert></i>',
      label: game.i18n.localize("THR.Rules.MaxHealing.Button")
    };
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to add the Maximize button. The dialog is unchanged.`, err);
  }

  return context;
}

/**
 * Wraps the dialog's roll finalisation to tag rolls when Maximize was the button clicked.
 * @param {Function} wrapped
 * @param {string} action
 * @returns {object[]}
 */
function onFinalizeRolls(wrapped, action, ...rest) {
  const rolls = wrapped(action, ...rest);

  try {
    if (action !== "maximize") return rolls;
    if (!isRuleEnabled(RULE_ID)) return rolls;
    for (const roll of rolls ?? []) {
      roll.options ??= {};
      roll.options[MAXIMIZE] = true;
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to mark rolls as maximized. They will roll normally.`, err);
  }

  return rolls;
}

/* -------------------------------------------- */
/*  Evaluation                                  */
/* -------------------------------------------- */

/**
 * Wraps `DamageRoll#evaluate` to force maximum results on a tagged roll.
 * @param {Function} wrapped
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function onEvaluate(wrapped, options = {}, ...rest) {
  if (this?.options?.[MAXIMIZE]) options = { ...options, maximize: true };
  return wrapped(options, ...rest);
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Is every roll in this dialog a healing roll?
 *
 * Strict on purpose. An activity that rolled healing and damage together would otherwise get a button
 * that silently maximizes the damage too, which is not what anyone clicking "Maximize" on a healing
 * roll expects. If the answer cannot be determined, no button is added.
 *
 * @param {object} dialog
 * @returns {boolean}
 */
function isHealingDialog(dialog) {
  const healingTypes = CONFIG.DND5E?.healingTypes ?? {};

  // `rolls` is the built roll objects; `config.rolls` is the configuration they came from. Which of
  // the two is populated depends on how far through rendering the dialog is, so check both.
  const candidates = dialog?.rolls?.length ? dialog.rolls : dialog?.config?.rolls;
  if (!candidates?.length) return false;

  return candidates.every(entry => {
    const type = entry?.options?.type;
    return !!type && Object.hasOwn(healingTypes, type);
  });
}

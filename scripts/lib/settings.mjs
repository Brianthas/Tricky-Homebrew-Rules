import { MODULE_ID } from "./constants.mjs";

/**
 * Build the settings key a rule's own on/off switch is stored under.
 * @param {string} ruleId
 * @returns {string}
 */
export function ruleEnabledKey(ruleId) {
  return `${ruleId}Enabled`;
}

/**
 * Is a given rule live? Both the module master switch and the rule's own switch have to be on, so a
 * GM can disable one house rule without turning the whole module off, or kill everything at once.
 * @param {string} ruleId
 * @returns {boolean}
 */
export function isRuleEnabled(ruleId) {
  if (!game.settings.get(MODULE_ID, "moduleEnabled")) return false;
  return game.settings.get(MODULE_ID, ruleEnabledKey(ruleId)) === true;
}

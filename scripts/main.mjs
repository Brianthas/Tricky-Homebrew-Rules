import { MODULE_ID } from "./lib/constants.mjs";
import { criticalDice } from "./rules/critical-dice.mjs";
import { maxHealing } from "./rules/max-healing.mjs";
import { rollToBonus } from "./rules/roll-to-bonus.mjs";
import { sourceNamedEffects } from "./rules/source-named-effects.mjs";
import { expireEffects } from "./rules/expire-effects.mjs";

/**
 * Every house rule this module provides. Adding a rule means writing one file under `rules/` that
 * exports an object with this shape, and listing it here - nothing else in the module needs to know
 * about it.
 *
 * Rule shape (all methods optional):
 *   id                 Unique key. Its on/off setting is stored as `<id>Enabled`.
 *   registerSettings() Called during `init`. Register the rule's own settings.
 *   registerPatches()  Called during `init`. Register libWrapper patches and hooks.
 *   onReady()          Called during `ready`, once the world and other modules exist.
 */
const RULES = [criticalDice, maxHealing, rollToBonus, sourceNamedEffects, expireEffects];

Hooks.once("init", () => {
  if (!CONFIG.DND5E) {
    console.error(`${MODULE_ID} | The dnd5e system is not active. This module requires it and will not function.`);
    return;
  }

  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "THR.Settings.ModuleEnabled.Name",
    hint: "THR.Settings.ModuleEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  runForEachRule("registerSettings");
  runForEachRule("registerPatches");
});

Hooks.once("ready", () => {
  if (!CONFIG.DND5E) return;
  runForEachRule("onReady");
});

/**
 * Run one lifecycle method across every rule, isolating failures.
 *
 * Rules are independent house rules that happen to ship together, so one throwing during setup must
 * not stop the others from registering. Without this, a single rule broken by a dnd5e update would
 * take the whole module down.
 *
 * @param {string} method
 */
function runForEachRule(method) {
  for (const rule of RULES) {
    try {
      rule[method]?.();
    } catch (err) {
      console.error(`${MODULE_ID} | Rule "${rule.id}" failed during ${method}(). Other rules are unaffected.`, err);
    }
  }
}

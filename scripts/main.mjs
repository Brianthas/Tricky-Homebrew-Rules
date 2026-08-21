import { MODULE_ID } from "./lib/constants.mjs";
import { criticalDice } from "./rules/critical-dice.mjs";
import { maxHealing } from "./rules/max-healing.mjs";
import { rollToBonus } from "./rules/roll-to-bonus.mjs";
import { sourceNamedEffects } from "./rules/source-named-effects.mjs";
import { expireEffects } from "./rules/expire-effects.mjs";
import { auras } from "./rules/auras.mjs";
import { selfEffects } from "./rules/self-effects.mjs";
import { effectsPanel } from "./rules/effects-panel.mjs";
import { runSelfCheck } from "./lib/selfcheck.mjs";

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
const RULES = [criticalDice, maxHealing, rollToBonus, sourceNamedEffects, expireEffects, auras, selfEffects, effectsPanel];

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
    default: true,

    // Rules that apply documents have to hear about this, or turning the module off would leave
    // everything it had applied in place with nothing left running to clean it up.
    onChange: () => Hooks.callAll("trickyHomebrewRulesToggled")
  });

  runForEachRule("registerSettings");
  runForEachRule("registerPatches");
});

Hooks.once("ready", () => {
  if (!CONFIG.DND5E) return;

  // Say so if Foundry or dnd5e has moved something these rules reach into, rather than letting a
  // rule fail silently and turn up mid-session as "why didn't that work".
  runSelfCheck();

  runForEachRule("onReady");
});

// Six rules put a lot of switches in one undifferentiated list. Foundry has no way to group settings
// within a module, so they are grouped after the fact.
Hooks.on("renderSettingsConfig", groupSettingsByRule);

/**
 * Insert a heading above each rule's settings, and gather that rule's controls beneath it.
 *
 * The grouping is derived rather than listed: every setting and menu a rule registers is named after
 * its rule id, so `criticalDiceCount` belongs to `criticalDice`. That means a rule adding a setting
 * later lands in the right place with nothing here to update, and there is no second list to fall
 * out of step with the first.
 *
 * Foundry renders all of a module's menus before any of its settings, so a rule's button would
 * otherwise sit far from the switches it belongs with. Each group's elements are moved into order
 * under their heading.
 *
 * @param {object} app
 * @param {HTMLElement} html
 */
function groupSettingsByRule(app, html) {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const groups = [
      { id: null, label: "THR.Groups.General" },
      ...RULES.map(rule => ({ id: rule.id, label: `THR.Groups.${rule.id}` }))
    ];

    // Nothing of ours on screen means this is another module's section entirely.
    if (!root.querySelector(`[name^="${MODULE_ID}."]`)) return;

    for (const group of groups) {
      const elements = controlsFor(root, group.id);
      if (!elements.length) continue; // A rule with nothing to show simply gets no heading.

      const heading = document.createElement("h3");
      heading.classList.add("tricky-settings-group");
      heading.textContent = game.i18n.localize(group.label);

      elements[0].before(heading);
      let previous = heading;
      for (const element of elements) {
        previous.after(element);
        previous = element;
      }
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to group the settings.`, err);
  }
}

/**
 * The form groups belonging to one rule, in registration order.
 *
 * A null id collects the module-wide settings, which are the ones whose key matches no rule.
 *
 * @param {HTMLElement} root
 * @param {string|null} ruleId
 * @returns {HTMLElement[]}
 */
function controlsFor(root, ruleId) {
  const owned = [];

  for (const node of root.querySelectorAll(`[name^="${MODULE_ID}."], button[data-key]`)) {
    const key = node.name?.split(".").pop() ?? node.dataset.key?.split(".").pop();
    if (!key) continue;
    if (node.dataset.key && !node.dataset.key.startsWith(MODULE_ID)) continue;

    const belongs = ruleId
      ? key.startsWith(ruleId)
      : !RULES.some(rule => key.startsWith(rule.id));
    if (!belongs) continue;

    const group = node.closest(".form-group");
    if (group && !owned.includes(group)) owned.push(group);
  }

  return owned;
}

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

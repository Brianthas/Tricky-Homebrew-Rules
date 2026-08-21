import { MODULE_ID } from "./constants.mjs";

/**
 * Check on startup that the parts of Foundry and dnd5e this module reaches into still exist.
 *
 * Most of these rules work by reaching into somebody else's code: a dnd5e hook, a method on a roll
 * class, a getter on a token. When one of those moves in an update, a rule stops working without
 * saying anything, and the failure shows up mid-session as "why didn't Shield apply". That happened
 * in testing, where a spell not applying turned out to be spent spell slots rather than a bug, and
 * the only way to tell was to go and look.
 *
 * The libWrapper patches are deliberately not listed. libWrapper already refuses loudly when its
 * target is missing, so repeating that here would only add a second voice saying the same thing.
 *
 * Hook names cannot be probed at all: there is no way to ask whether dnd5e still calls something.
 * The system version is reported instead, so an untested version is visible rather than assumed.
 */

/**
 * Everything worth confirming, and which rule stops working without it.
 *
 * @returns {object[]}
 */
export function dependencies() {
  return [
    {
      label: "CONFIG.Dice.DamageRoll.buildEvaluate",
      rules: ["Critical Dice"],
      present: () => typeof CONFIG?.Dice?.DamageRoll?.buildEvaluate === "function"
    },
    {
      label: "CONFIG.Dice.DamageRoll.DefaultConfigurationDialog",
      rules: ["Max Healing"],
      present: () => !!CONFIG?.Dice?.DamageRoll?.DefaultConfigurationDialog?.prototype
    },
    {
      label: "Actor#allApplicableEffects",
      rules: ["Auras", "Effects Panel"],
      present: () => typeof CONFIG?.Actor?.documentClass?.prototype?.allApplicableEffects === "function"
    },
    {
      label: "ChatMessage#getAssociatedItem",
      rules: ["Roll to Bonus"],
      present: () => typeof CONFIG?.ChatMessage?.documentClass?.prototype?.getAssociatedItem === "function"
    },
    {
      label: "ActiveEffect.getInitialDuration",
      rules: ["Self Effects"],
      present: () => typeof CONFIG?.ActiveEffect?.documentClass?.getInitialDuration === "function"
    },
    {
      label: "CONFIG.Canvas.polygonBackends.move.testCollision",
      rules: ["Auras, wall blocking"],
      present: () => typeof CONFIG?.Canvas?.polygonBackends?.move?.testCollision === "function"
    },
    {
      label: "CONFIG.Canvas.lightAnimations",
      rules: ["Auras, light ring styles"],
      present: () => !!CONFIG?.Canvas?.lightAnimations
    }
  ];
}

/**
 * Which of these are missing.
 *
 * Separated from the reporting so it can be tested: a check that never fires is indistinguishable
 * from a check that cannot fire.
 *
 * @param {object[]} list
 * @returns {object[]}
 */
export function missingFrom(list) {
  return list.filter(entry => {
    try {
      return !entry.present();
    } catch {
      return true;
    }
  });
}

/**
 * Run the check and say something if anything is wrong.
 *
 * Quiet when everything is fine. A module that congratulates itself on every load is a module whose
 * messages get ignored.
 */
export function runSelfCheck() {
  try {
    const missing = missingFrom(dependencies());
    if (!missing.length) return;

    const system = `${game.system?.id ?? "unknown"} ${game.system?.version ?? "?"}`;
    console.warn(`${MODULE_ID} | ${missing.length} expected API(s) are missing on ${system}. `
      + `Some rules will not work until this module is updated.`);
    for (const entry of missing) {
      console.warn(`${MODULE_ID} |   ${entry.label} is gone, which affects: ${entry.rules.join(", ")}`);
    }

    const affected = [...new Set(missing.flatMap(entry => entry.rules))].join(", ");
    ui.notifications?.warn(game.i18n.format("THR.SelfCheck.Missing", { rules: affected }), { permanent: true });
  } catch (err) {
    console.error(`${MODULE_ID} | The startup check itself failed.`, err);
  }
}

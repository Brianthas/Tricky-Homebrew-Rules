import { MODULE_ID, MODULE_TITLE } from "./constants.mjs";

/**
 * Register a libWrapper patch defensively.
 *
 * The rules in this module hook fairly deep, undocumented parts of dnd5e and Foundry that a future
 * release could rename or restructure. Without this, one broken target would throw inside the `init`
 * hook and silently prevent every *later* patch in the same callback from registering too - one
 * upstream refactor could quietly take out the whole module instead of just the affected rule.
 *
 * Failing loudly per-patch means the GM finds out exactly what broke, and which feature it cost them.
 *
 * @param {string} target             libWrapper target path.
 * @param {Function} fn               The wrapper function.
 * @param {string} type               libWrapper type, e.g. "WRAPPER".
 * @param {object} [options]
 * @param {string} [options.feature]  What stops working if this patch fails, in plain language.
 */
export function registerLibWrapper(target, fn, type, { feature } = {}) {
  try {
    libWrapper.register(MODULE_ID, target, fn, type);
  } catch (err) {
    const consequence = feature ? ` ${feature} will not work until the module is updated.` : "";
    console.error(
      `${MODULE_ID} | Failed to patch "${target}". An upstream update may have changed something `
      + `this module depends on.${consequence}`, err
    );
    ui.notifications?.error(
      `${MODULE_TITLE} failed to patch ${target}.${consequence} Check the console (F12) and consider `
      + "reporting this on the module's GitHub issues.",
      { permanent: true }
    );
  }
}

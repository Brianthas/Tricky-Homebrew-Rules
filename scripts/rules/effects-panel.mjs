import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";

const RULE_ID = "effectsPanel";
const SHOW_KEY = `${RULE_ID}Show`;
const PANEL_ID = "tricky-effects-panel";
const FROM_AURA = "fromAura";

/** Which effects the panel lists. */
const SHOW = {
  TEMPORARY: "temporary",
  ALL: "all"
};

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Lists what is currently running on the selected token, beside the sidebar.
 *
 * dnd5e keeps effects on the character sheet, two clicks and a tab away from the table. Systems like
 * pf2e put them on screen next to the sidebar where everyone can see them, which is what this
 * copies: a row of icons, with the detail on hover and a cross to be rid of one.
 *
 * The panel lives inside `#ui-right-column-1`, the flex column that already holds chat
 * notifications, so it sits left of the sidebar and follows the sidebar being collapsed without this
 * rule having to know the sidebar's width or listen for it changing.
 */
export const effectsPanel = {
  id: RULE_ID,

  registerSettings() {
    // Client scoped, both of them. Where a panel sits and what it lists is a preference about one
    // person's screen, not a rule the table has to agree on.
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.EffectsPanel.Settings.Enabled.Name",
      hint: "THR.Rules.EffectsPanel.Settings.Enabled.Hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => render()
    });

    game.settings.register(MODULE_ID, SHOW_KEY, {
      name: "THR.Rules.EffectsPanel.Settings.Show.Name",
      hint: "THR.Rules.EffectsPanel.Settings.Show.Hint",
      scope: "client",
      config: true,
      type: String,
      default: SHOW.TEMPORARY,
      choices: {
        [SHOW.TEMPORARY]: "THR.Rules.EffectsPanel.Settings.Show.Temporary",
        [SHOW.ALL]: "THR.Rules.EffectsPanel.Settings.Show.All"
      },
      onChange: () => render()
    });
  },

  registerPatches() {
    Hooks.on("controlToken", () => render());
    Hooks.on("canvasReady", () => render());
    Hooks.on("deleteToken", () => render());

    // Anything that changes what is running, or how long it has left.
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(hook, effect => { if (concernsSelection(effect)) render(); });
    }
    Hooks.on("updateWorldTime", () => render());
    Hooks.on("combatTurnChange", () => render());
    Hooks.on("updateActor", actor => { if (actor.id === selectedActor()?.id) render(); });
  },

  onReady() {
    render();
  }
};

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

/**
 * The actor whose effects should be listed, or null.
 *
 * Selection rather than assignment, because the panel answers "what is on the thing I am looking
 * at". A player with no token selected sees nothing rather than someone else's effects.
 *
 * @returns {object|null}
 */
function selectedActor() {
  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? null;
  if (!actor) return null;
  return (game.user.isGM || actor.isOwner) ? actor : null;
}

/**
 * Does an effect change belong to the actor currently on screen?
 * @param {object} effect
 * @returns {boolean}
 */
function concernsSelection(effect) {
  const actor = selectedActor();
  if (!actor) return false;
  const parent = effect?.parent;
  const owner = parent?.documentName === "Item" ? parent.parent : parent;
  return owner?.id === actor.id;
}

/**
 * Rebuild the panel from scratch.
 *
 * Redrawn wholesale rather than patched icon by icon: the list is a handful of entries and only
 * changes when something happens, so diffing would be more code and more ways to leave a stale
 * duration on screen.
 */
function render() {
  try {
    document.getElementById(PANEL_ID)?.remove();

    if (!isRuleEnabled(RULE_ID)) return;
    const actor = selectedActor();
    if (!actor) return;

    const effects = listed(actor);
    if (!effects.length) return;

    const column = document.getElementById("ui-right-column-1");
    if (!column) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    for (const effect of effects) panel.append(iconFor(effect));

    column.prepend(panel);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to draw the effects panel.`, err);
  }
}

/**
 * The effects to list, in a stable order.
 * @param {object} actor
 * @returns {object[]}
 */
function listed(actor) {
  const all = actor.allApplicableEffects ? [...actor.allApplicableEffects()] : [...actor.effects];
  const temporaryOnly = game.settings.get(MODULE_ID, SHOW_KEY) !== SHOW.ALL;

  return all
    .filter(effect => !effect.disabled && !effect.isSuppressed)
    .filter(effect => !temporaryOnly || isRunning(effect))
    .filter(effect => !isOwnAuraCopy(effect, actor))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Is this something currently happening to the creature, rather than part of what it permanently is?
 *
 * Foundry's `isTemporary` answers most of it: true for Shield, for a Concentrating marker and for a
 * spell effect with a countdown, false for Jack of All Trades, Improved Critical, a fighting style
 * and the rest of a character's permanent kit.
 *
 * An aura copy carries no duration of its own, so that test alone would always call it permanent.
 * It is as temporary as the aura behind it: Aura of Life runs for ten minutes and belongs here,
 * while a paladin's Aura of Protection is a permanent class feature and does not, even though the
 * copy itself comes and goes as people move.
 *
 * @param {object} effect
 * @returns {boolean}
 */
export function isRunning(effect) {
  if (effect.isTemporary) return true;

  const fromAura = effect.getFlag(MODULE_ID, FROM_AURA);
  if (!fromAura) return false;

  const source = fromUuidSync(fromAura, { strict: false });
  return !!source?.isTemporary;
}

/**
 * Is this the copy an aura applied to the very token radiating it?
 *
 * An aura that affects its own token leaves its owner holding two effects of the same name and
 * icon: the aura, and a copy of it. Listing both says nothing extra and invites exactly the mistake
 * of reaching for the wrong one. A copy radiating from somebody else still earns its place, because
 * "you have this because of that paladin" is worth knowing.
 *
 * @param {object} effect
 * @param {object} actor
 * @returns {boolean}
 */
function isOwnAuraCopy(effect, actor) {
  const fromAura = effect.getFlag(MODULE_ID, FROM_AURA);
  if (!fromAura) return false;

  const source = fromUuidSync(fromAura, { strict: false });
  const parent = source?.parent;
  const owner = parent?.documentName === "Item" ? parent.parent : parent;
  return owner?.id === actor.id;
}

/* -------------------------------------------- */
/*  Entries                                     */
/* -------------------------------------------- */

/**
 * One effect, as its icon alone. Everything else is on the tooltip.
 * @param {object} effect
 * @returns {HTMLElement}
 */
function iconFor(effect) {
  const entry = document.createElement("div");
  entry.classList.add("tricky-effect-icon");
  entry.dataset.tooltip = tooltip(effect);
  entry.dataset.tooltipDirection = "LEFT";

  const img = document.createElement("img");
  img.src = effect.img;
  img.alt = effect.name;
  entry.append(img);

  // Opening the effect is the safe default for a click, so removing one stays deliberate.
  img.addEventListener("click", () => effect.sheet?.render(true));

  const remove = removeBadge(effect);
  if (remove) entry.append(remove);

  return entry;
}

/**
 * What the hover says: what it is, how long it has left, and how to be rid of it.
 * @param {object} effect
 * @returns {string}
 */
function tooltip(effect) {
  const lines = [`<strong>${foundry.utils.escapeHTML(effect.name)}</strong>`];

  const remaining = durationLabel(effect);
  if (remaining) lines.push(remaining);

  const fromAura = effect.getFlag(MODULE_ID, FROM_AURA);
  if (fromAura) {
    const source = fromUuidSync(fromAura, { strict: false });
    const parent = source?.parent;
    const owner = parent?.documentName === "Item" ? parent.parent : parent;
    lines.push(game.i18n.format("THR.Rules.EffectsPanel.FromAura", {
      name: owner?.name ?? game.i18n.localize("THR.Rules.EffectsPanel.AnotherToken")
    }));
  } else {
    lines.push(game.i18n.localize(effect.parent?.documentName === "Item"
      ? "THR.Rules.EffectsPanel.HintDisable"
      : "THR.Rules.EffectsPanel.HintRemove"));
  }

  return lines.join("<br>");
}

/**
 * The cross that appears on hover, or nothing for an effect this panel will not remove.
 *
 * A copy applied by the Auras rule is owned by that rule and would be recreated on the next pass, so
 * a cross on one would visibly do nothing. Its tooltip names the token it radiates from instead,
 * which is what you need in order to go and turn the aura off.
 *
 * @param {object} effect
 * @returns {HTMLElement|null}
 */
function removeBadge(effect) {
  if (effect.getFlag(MODULE_ID, FROM_AURA)) return null;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("tricky-effect-remove");
  button.innerHTML = '<i class="fa-solid fa-xmark"></i>';

  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      // An effect sitting on an item is granted by that item, so deleting it would edit the
      // character rather than clear something that is running. Switching it off is the reversible
      // equivalent, and the sheet can switch it back on.
      if (effect.parent?.documentName === "Item") await effect.update({ disabled: true });
      else await effect.delete();
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to remove "${effect.name}".`, err);
      ui.notifications?.warn(game.i18n.localize("THR.Rules.EffectsPanel.RemoveFailed"));
    }
  });

  return button;
}

/**
 * How long an effect has left, or an empty string if it does not run out.
 * @param {object} effect
 * @returns {string}
 */
function durationLabel(effect) {
  const label = effect.duration?.label;
  if (!label || label === "None") return "";
  return label;
}

import { MODULE_ID } from "../lib/constants.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";

const RULE_ID = "rollToBonus";

/** Flag holding everything needed to expire a bonus, stored on the created effect. */
const FLAG = "bonus";

/**
 * Item types that hand out a bonus die. A weapon's damage roll or a raw skill check is a number you
 * rolled, not a bonus someone granted, so the button has no business appearing there.
 */
const SOURCE_ITEM_TYPES = new Set(["feat", "spell"]);

/**
 * Bonus values are written into dnd5e formula fields (`system.bonuses.*`), which are strings, and
 * Foundry's ADD mode concatenates strings rather than adding them. A bare "4" would turn an existing
 * "1d4" bonus into "1d44".
 *
 * Foundry's roll grammar allows a leading additive operator, so formatting the value as " + 4"
 * concatenates safely onto both an empty field and an existing formula.
 *
 * @param {number} value
 * @returns {string}
 */
function formatBonus(value) {
  return value < 0 ? ` - ${Math.abs(value)}` : ` + ${value}`;
}

/* -------------------------------------------- */
/*  Bonus Targets                               */
/* -------------------------------------------- */

/**
 * What a rolled value can be applied to. Keys verified against the dnd5e actor data model: the
 * global ones live under `system.bonuses`, AC and initiative under `system.attributes`.
 *
 * A target maps to one or more change keys, because "attack rolls" means all four attack categories
 * (melee/ranged weapon, melee/ranged spell) rather than a single field.
 *
 * @returns {object[]}
 */
function bonusTargets() {
  const abilities = CONFIG.DND5E?.abilities ?? {};

  const targets = [
    { id: "ac", label: game.i18n.localize("THR.Rules.RollToBonus.Target.AC"), keys: ["system.attributes.ac.bonus"] },
    {
      id: "saveAll",
      label: game.i18n.localize("THR.Rules.RollToBonus.Target.SaveAll"),
      keys: ["system.bonuses.abilities.save"]
    }
  ];

  // One entry per ability rather than a dependent second dropdown. A single list of fourteen options
  // is simpler to use, and simpler to code, than two lists where the second depends on the first.
  for (const [key, config] of Object.entries(abilities)) {
    targets.push({
      id: `save.${key}`,
      label: game.i18n.format("THR.Rules.RollToBonus.Target.SaveOne", { ability: config.label ?? key }),
      keys: [`system.abilities.${key}.bonuses.save`]
    });
  }

  targets.push(
    {
      id: "check",
      label: game.i18n.localize("THR.Rules.RollToBonus.Target.Check"),
      keys: ["system.bonuses.abilities.check"]
    },
    {
      id: "skill",
      label: game.i18n.localize("THR.Rules.RollToBonus.Target.Skill"),
      keys: ["system.bonuses.abilities.skill"]
    },
    {
      id: "attack",
      label: game.i18n.localize("THR.Rules.RollToBonus.Target.Attack"),
      keys: ["mwak", "rwak", "msak", "rsak"].map(t => `system.bonuses.${t}.attack`)
    },
    {
      id: "damage",
      label: game.i18n.localize("THR.Rules.RollToBonus.Target.Damage"),
      keys: ["mwak", "rwak", "msak", "rsak"].map(t => `system.bonuses.${t}.damage`)
    },
    {
      id: "init",
      label: game.i18n.localize("THR.Rules.RollToBonus.Target.Initiative"),
      keys: ["system.attributes.init.bonus"]
    }
  );

  return targets;
}

/** Durations offered, in the order they appear in the dropdown. */
const DURATIONS = [
  { id: "startOfNextTurn", label: "THR.Rules.RollToBonus.Duration.StartOfNextTurn", needsCombat: true },
  { id: "endOfNextTurn", label: "THR.Rules.RollToBonus.Duration.EndOfNextTurn", needsCombat: true },
  { id: "rounds", label: "THR.Rules.RollToBonus.Duration.Rounds", needsCombat: true },
  { id: "endOfCombat", label: "THR.Rules.RollToBonus.Duration.EndOfCombat", needsCombat: true },
  { id: "manual", label: "THR.Rules.RollToBonus.Duration.Manual", needsCombat: false }
];

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Adds an "Apply as bonus" button to chat cards carrying a roll, turning the rolled number into a
 * temporary Active Effect on a chosen actor.
 *
 * For Swords Bard flourishes, Combat Inspiration, and any homebrew of the shape "roll a die, add it
 * to something for a while". Deliberately generic: it knows nothing about which feature produced the
 * roll, so it works for features no premade module has ever implemented.
 */
export const rollToBonus = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.RollToBonus.Enabled.Name",
      hint: "THR.Rules.RollToBonus.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "rollToBonusScope", {
      name: "THR.Rules.RollToBonus.Scope.Name",
      hint: "THR.Rules.RollToBonus.Scope.Hint",
      scope: "world",
      config: true,
      type: String,
      default: "featuresAndSpells",
      choices: {
        featuresAndSpells: "THR.Rules.RollToBonus.Scope.FeaturesAndSpells",
        allItems: "THR.Rules.RollToBonus.Scope.AllItems",
        everything: "THR.Rules.RollToBonus.Scope.Everything"
      }
    });
  },

  registerPatches() {
    Hooks.on("renderChatMessageHTML", onRenderChatMessage);

    // Nothing on a stock Foundry 14 plus dnd5e install expires an Active Effect. dnd5e has no expiry
    // handling and does not listen for turn changes; Foundry marks an effect expired but neither
    // deletes nor disables it, so its bonus would keep applying forever. Times-Up and DAE normally
    // fill this gap and both stop at Foundry 13.999, so this rule has to do it itself.
    Hooks.on("combatTurnChange", onCombatTurnChange);
    Hooks.on("deleteCombat", onDeleteCombat);
  }
};

/* -------------------------------------------- */
/*  Chat Card Button                            */
/* -------------------------------------------- */

/**
 * Add the "Apply as bonus" button to any chat message carrying at least one evaluated roll.
 * @param {object} message
 * @param {HTMLElement} html
 */
function onRenderChatMessage(message, html) {
  try {
    if (!isRuleEnabled(RULE_ID)) return;
    if (!message?.rolls?.length) return;
    if (!shouldOfferBonus(message)) return;

    // Anyone who can meaningfully act on it: the GM, or whoever made the roll.
    if (!game.user.isGM && !message.isAuthor) return;

    const content = html.querySelector(".message-content");
    if (!content) return;

    const wrapper = document.createElement("div");
    wrapper.classList.add("tricky-bonus-actions");

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("tricky-bonus-apply");
    button.innerHTML = `<i class="fa-solid fa-shield-halved" inert></i> `
      + game.i18n.localize("THR.Rules.RollToBonus.Button");
    button.addEventListener("click", () => promptApplyBonus(message));

    wrapper.append(button);
    content.append(wrapper);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to add the Apply as bonus button.`, err);
  }
}

/**
 * Is this a roll someone might hand out as a bonus?
 *
 * Without this the button appears on every roll in the log: attack rolls, skill checks, saving
 * throws, weapon damage. Those are numbers you rolled, not bonuses granted by a feature.
 *
 * Two signals, both recorded by dnd5e on the message itself, so nothing has to be resolved:
 *
 * - `flags.dnd5e.roll.type` is "attack", "damage", "generic", "hitDie" or "hitPoints". A feature's
 *   utility roll, which is what Bardic Inspiration and friends are, comes through as "generic".
 * - `flags.dnd5e.item.type` is the type of the item that produced the card. A bare skill check or
 *   saving throw has no item at all, which is what excludes them.
 *
 * @param {object} message
 * @returns {boolean}
 */
function shouldOfferBonus(message) {
  const scope = game.settings.get(MODULE_ID, "rollToBonusScope") ?? "featuresAndSpells";
  if (scope === "everything") return true;

  // An attack roll is a to-hit number. Even from a spell, it is never the bonus being handed out.
  if (message.getFlag("dnd5e", "roll")?.type === "attack") return false;

  const itemType = message.getFlag("dnd5e", "item")?.type ?? message.getAssociatedItem?.()?.type;
  if (!itemType) return false;

  if (scope === "allItems") return true;
  return SOURCE_ITEM_TYPES.has(itemType);
}

/* -------------------------------------------- */
/*  Dialog                                      */
/* -------------------------------------------- */

/**
 * Ask what the rolled value should be applied to, then apply it.
 * @param {object} message
 */
async function promptApplyBonus(message) {
  const total = message.rolls.reduce((sum, roll) => sum + (roll.total ?? 0), 0);
  const combat = game.combat ?? null;

  const targetOptions = bonusTargets()
    .map(t => `<option value="${t.id}">${foundry.utils.escapeHTML(t.label)}</option>`)
    .join("");

  const durationOptions = DURATIONS
    .map(d => `<option value="${d.id}">${foundry.utils.escapeHTML(game.i18n.localize(d.label))}</option>`)
    .join("");

  // Turn-based durations have nothing to anchor to outside combat, so say so up front rather than
  // silently creating an effect that never expires.
  // Most bonus dice are handed to someone else, so preselect whoever is actually indicated on the
  // canvas rather than always defaulting to the person who rolled.
  const defaultRecipient = game.user.targets.size ? "targeted"
    : (canvas.tokens?.controlled?.length ? "selected" : "self");

  const noCombatWarning = combat?.started
    ? ""
    : `<p class="notification warning">${game.i18n.localize("THR.Rules.RollToBonus.NoCombat")}</p>`;

  const content = `
    ${noCombatWarning}
    <div class="form-group">
      <label>${game.i18n.localize("THR.Rules.RollToBonus.Field.Value")}</label>
      <div class="form-fields"><input type="number" name="value" value="${total}" step="1" autofocus></div>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("THR.Rules.RollToBonus.Field.Target")}</label>
      <div class="form-fields"><select name="target">${targetOptions}</select></div>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("THR.Rules.RollToBonus.Field.Duration")}</label>
      <div class="form-fields"><select name="duration">${durationOptions}</select></div>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("THR.Rules.RollToBonus.Field.Rounds")}</label>
      <div class="form-fields"><input type="number" name="rounds" value="1" min="1" step="1"></div>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("THR.Rules.RollToBonus.Field.Recipient")}</label>
      <div class="form-fields">
        <select name="recipient">
          <option value="self"${defaultRecipient === "self" ? " selected" : ""}>${game.i18n.localize("THR.Rules.RollToBonus.Recipient.Self")}</option>
          <option value="targeted"${defaultRecipient === "targeted" ? " selected" : ""}>${game.i18n.localize("THR.Rules.RollToBonus.Recipient.Targeted")}</option>
          <option value="selected"${defaultRecipient === "selected" ? " selected" : ""}>${game.i18n.localize("THR.Rules.RollToBonus.Recipient.Selected")}</option>
        </select>
      </div>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize("THR.Rules.RollToBonus.DialogTitle") },
    content,
    ok: { label: game.i18n.localize("THR.Rules.RollToBonus.Apply"), icon: "fa-solid fa-check" }
  });

  if (!result) return;
  await applyBonus(message, result);
}

/* -------------------------------------------- */
/*  Applying                                    */
/* -------------------------------------------- */

/**
 * Create the bonus effect on every chosen actor.
 * @param {object} message
 * @param {object} form
 */
async function applyBonus(message, form) {
  try {
    const value = Number(form.value);
    if (!Number.isFinite(value) || (value === 0)) {
      ui.notifications?.warn(game.i18n.localize("THR.Rules.RollToBonus.BadValue"));
      return;
    }

    const target = bonusTargets().find(t => t.id === form.target);
    if (!target) return;

    const actors = resolveRecipients(form.recipient, message);
    if (!actors.length) {
      // Saying which of the three ways to pick a recipient came up empty is the difference between
      // a useful message and "it didn't work".
      const key = (form.recipient === "self")
        ? "THR.Rules.RollToBonus.NoRoller"
        : "THR.Rules.RollToBonus.NoRecipient";
      ui.notifications?.warn(game.i18n.localize(key));
      return;
    }

    let applied = 0;
    for (const actor of actors) {
      if (!actor.isOwner) {
        ui.notifications?.warn(game.i18n.format("THR.Rules.RollToBonus.NotOwner", { name: actor.name }));
        continue;
      }
      await actor.createEmbeddedDocuments("ActiveEffect", [
        buildEffectData({ actor, message, value, target, form })
      ]);
      applied += 1;
    }

    if (applied) {
      ui.notifications?.info(game.i18n.format("THR.Rules.RollToBonus.Applied", {
        value: value > 0 ? `+${value}` : String(value),
        label: target.label,
        count: applied
      }));
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply the bonus.`, err);
    ui.notifications?.error(game.i18n.localize("THR.Rules.RollToBonus.Failed"));
  }
}

/**
 * Build the ActiveEffect document data for one recipient.
 * @param {object} options
 * @returns {object}
 */
function buildEffectData({ actor, message, value, target, form }) {
  const combat = game.combat ?? null;
  const combatant = combat?.combatants?.find(c => c.actor?.id === actor.id) ?? null;

  // Turn-based durations need a combatant to anchor to. Without one there is nothing to count from,
  // so the effect falls back to manual removal rather than pretending it will expire.
  const anchored = !!(combat?.started && combatant);
  const requested = DURATIONS.find(d => d.id === form.duration) ?? DURATIONS.at(-1);
  const expiry = (requested.needsCombat && !anchored) ? "manual" : requested.id;

  const rounds = Math.max(1, Number(form.rounds) || 1);
  const sign = value > 0 ? "+" : "";

  // Named and illustrated after the item that produced the roll, so an effect sitting on a token
  // lines up with the card it came from. `message.flavor` is not that name: on a spell card it is
  // the spell's flavour text, which is why Shield used to arrive called "imperceptible barrier".
  const item = message.getAssociatedItem?.() ?? null;
  const activity = message.getAssociatedActivity?.() ?? null;
  const source = item?.name
    || activity?.name
    || message.flavor?.trim()
    || game.i18n.localize("THR.Rules.RollToBonus.EffectName");

  // The source name alone is not enough. The Effect Names rule renames dnd5e's own effects after
  // their item too, so holding a Bardic Inspiration die and having spent one on AC would both read
  // "Bardic Inspiration" and be indistinguishable on the token. Naming what the bonus does keeps the
  // source leading while separating the two.
  const name = game.i18n.format("THR.Rules.RollToBonus.EffectTitle", {
    source,
    label: target.label,
    value: `${sign}${value}`
  });

  // What it actually does goes in the description rather than the name, so the name stays clean
  // while the detail is still one hover away.
  const durationConfig = DURATIONS.find(d => d.id === expiry) ?? DURATIONS.at(-1);

  // "A number of rounds" tells the reader nothing once it is on the sheet, so the description gets
  // the actual count instead of the dropdown's wording.
  const durationLabel = (expiry === "rounds")
    ? game.i18n.format("THR.Rules.RollToBonus.Duration.RoundsCount", { rounds })
    : game.i18n.localize(durationConfig.label);

  return {
    name,
    img: item?.img || "icons/svg/upgrade.svg",

    // Foundry defaults showIcon to CONDITIONAL, which means "only if the effect has a temporary
    // duration". A turn-relative bonus carries no Foundry duration at all, because "start of their
    // next turn" cannot be expressed as one, so it would silently never appear on the token. These
    // are short-lived buffs whose whole point is being visible.
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    description: game.i18n.format("THR.Rules.RollToBonus.EffectDescription", {
      label: target.label,
      value: `${sign}${value}`,
      duration: durationLabel
    }),
    disabled: false,
    duration: (expiry === "rounds") ? { rounds } : {},
    changes: target.keys.map(key => ({
      key,
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: formatBonus(value),
      priority: 20
    })),
    flags: {
      [MODULE_ID]: {
        [FLAG]: {
          expiry,
          rounds,
          combatId: anchored ? combat.id : null,
          combatantId: anchored ? combatant.id : null,
          startRound: anchored ? combat.round : null,
          startTurn: anchored ? combat.turn : null
        }
      }
    }
  };
}

/**
 * Work out which actors should receive the bonus.
 * @param {string} mode
 * @param {object} message
 * @returns {object[]}
 */
function resolveRecipients(mode, message) {
  if (mode === "targeted") {
    return [...game.user.targets].map(t => t.actor).filter(Boolean);
  }
  if (mode === "selected") {
    return (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  }

  // "self" means whoever made the roll.
  //
  // dnd5e's own resolver reads the message speaker, but a feature's utility roll posts its message
  // with a completely empty speaker (scene, actor and token all null). That is exactly the roll type
  // this rule exists for, so relying on the speaker alone fails on the main case. The item flag is
  // present on those messages, and an owned item knows its actor.
  const actor = message.getAssociatedActor?.()
    ?? message.getAssociatedItem?.()?.actor
    ?? null;
  return actor ? [actor] : [];
}

/* -------------------------------------------- */
/*  Expiry                                      */
/* -------------------------------------------- */

/**
 * Expire bonuses whose time is up, on every turn change.
 *
 * Both turn-relative durations are decided from the prior and current turn alone, with no extra
 * state written to the effect:
 *
 * - "start of my next turn" ends when the turn arrives at the anchor combatant again, excluding the
 *   turn it was created on.
 * - "end of my next turn" ends when a turn belonging to the anchor combatant finishes, again
 *   excluding the turn it was created on. Applied on your own turn, that correctly leaves it running
 *   through your following turn rather than ending it the moment your current turn ends.
 *
 * @param {object} combat
 * @param {object} prior
 * @param {object} current
 */
async function onCombatTurnChange(combat, prior, current) {
  // One client must own the deletions, or several will race to remove the same effect.
  if (!game.users.activeGM?.isSelf) return;
  if (!isRuleEnabled(RULE_ID)) return;

  try {
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (!actor) continue;

      const expired = actor.effects.filter(effect => {
        const data = effect.getFlag(MODULE_ID, FLAG);
        if (!data || (data.combatId !== combat.id)) return false;
        return shouldExpire(data, prior, current);
      });

      if (expired.length) await removeExpired(actor, expired);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed while expiring bonuses.`, err);
  }
}

/**
 * Remove expired bonuses, honouring the module's delete-or-disable setting.
 *
 * This rule keeps its own expiry, because turn-relative rules like "end of their next turn" cannot
 * be expressed as a Foundry duration and so are invisible to the Expire Effects rule. That setting
 * is still the one place a GM says whether expiry may destroy documents, so it has to be obeyed
 * here too. Deleting during a run explicitly chosen as non-destructive is exactly the surprise the
 * setting exists to prevent.
 *
 * @param {object} actor
 * @param {object[]} expired
 */
async function removeExpired(actor, expired) {
  const mode = game.settings.settings.has(`${MODULE_ID}.expireEffectsMode`)
    ? game.settings.get(MODULE_ID, "expireEffectsMode")
    : "delete";

  if (mode === "disable") {
    await actor.updateEmbeddedDocuments("ActiveEffect", expired.map(e => ({ _id: e.id, disabled: true })));
  } else {
    await actor.deleteEmbeddedDocuments("ActiveEffect", expired.map(e => e.id));
  }
}

/**
 * Has this bonus reached the end of its duration?
 * @param {object} data
 * @param {object} prior
 * @param {object} current
 * @returns {boolean}
 */
function shouldExpire(data, prior, current) {
  const createdOn = state => (state?.round === data.startRound) && (state?.turn === data.startTurn);

  switch (data.expiry) {
    case "startOfNextTurn":
      return (current?.combatantId === data.combatantId) && !createdOn(current);
    case "endOfNextTurn":
      return (prior?.combatantId === data.combatantId) && !createdOn(prior);
    case "rounds":
      return Number.isFinite(current?.round) && (current.round >= (data.startRound + data.rounds));
    default:
      return false;
  }
}

/**
 * Clear out anything set to last until the end of the encounter.
 * @param {object} combat
 */
async function onDeleteCombat(combat) {
  if (!game.users.activeGM?.isSelf) return;
  if (!isRuleEnabled(RULE_ID)) return;

  try {
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (!actor) continue;

      const expired = actor.effects.filter(effect => {
        const data = effect.getFlag(MODULE_ID, FLAG);
        return data && (data.combatId === combat.id) && (data.expiry !== "manual");
      });

      if (expired.length) await removeExpired(actor, expired);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed while clearing bonuses at end of combat.`, err);
  }
}

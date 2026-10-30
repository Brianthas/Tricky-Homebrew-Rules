import { MODULE_ID } from "../lib/constants.mjs";

const RULE_ID = "repairImportedItems";

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Repairs imported items that dnd5e 6 refuses to load.
 *
 * dnd5e 6 declares an ItemGrant advancement's `configuration.items[].uuid` as a `DocumentUUIDField`
 * with `embedded: false`; dnd5e 5.3.3 declared it a plain string. Some class, subclass, species and
 * background items brought in by a third-party importer list the character's own granted copies
 * there (`Actor.<id>.Item.<id>`), or items that no longer exist. Such an item fails validation, so
 * Foundry leaves it out of the actor's items, and a character can lose a whole class.
 *
 * The repair removes those embedded entries. Each points at a copy already on the character or at
 * nothing, so neither is a source anything could be granted from. The granted features are separate
 * items and stay, and `value.added`, which dnd5e reads to remove them on a level-down, is untouched.
 *
 * A player can run it, because the characters it matters for are theirs. It only touches actors the
 * user owns.
 */
export const repairImportedItems = {
  id: RULE_ID,

  registerSettings() {
    game.settings.registerMenu(MODULE_ID, `${RULE_ID}Menu`, {
      name: "THR.Rules.RepairImportedItems.Name",
      label: "THR.Rules.RepairImportedItems.Label",
      hint: "THR.Rules.RepairImportedItems.Hint",
      icon: "fa-solid fa-wrench",
      type: repairMenu(),
      restricted: false
    });
  }
};

/* -------------------------------------------- */
/*  Menu                                        */
/* -------------------------------------------- */

/**
 * Settings menu entry. Same construction as Effect Names' sweep: `registerMenu` needs an
 * ApplicationV2 subclass, and overriding `render` asks and acts without opening an empty window.
 *
 * @returns {Function}
 */
let menuClass = null;
function repairMenu() {
  if (menuClass) return menuClass;

  menuClass = class extends foundry.applications.api.ApplicationV2 {
    async render() {
      const plan = planRepairs();
      if (!plan.length) {
        ui.notifications?.info(game.i18n.localize("THR.Rules.RepairImportedItems.Nothing"));
        return this;
      }

      const lines = plan.map(p => `<li>${game.i18n.format("THR.Rules.RepairImportedItems.Line", {
        item: foundry.utils.escapeHTML(p.item.name),
        actor: foundry.utils.escapeHTML(p.actor.name),
        count: p.removed
      })}</li>`).join("");

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("THR.Rules.RepairImportedItems.Name") },
        content: `<p>${game.i18n.localize("THR.Rules.RepairImportedItems.Confirm")}</p>`
          + `<ul class="thr-repair-list">${lines}</ul>`
      });
      if (confirmed) await applyRepairs(plan);
      return this;
    }
  };

  return menuClass;
}

/* -------------------------------------------- */
/*  Repair                                      */
/* -------------------------------------------- */

/**
 * Does this UUID point inside another document?
 *
 * @param {string} uuid
 * @returns {boolean}
 */
export function isEmbeddedUuid(uuid) {
  if (typeof uuid !== "string") return false;
  try {
    return (foundry.utils.parseUuid(uuid)?.embedded?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * The advancement changes that make one item's source valid again, keyed by update path.
 *
 * @param {object} source  The item's stored data.
 * @returns {{changes: object, removed: number}}
 */
export function repairsFor(source) {
  const changes = {};
  let removed = 0;
  for (const [id, advancement] of Object.entries(source?.system?.advancement ?? {})) {
    if (advancement?.type !== "ItemGrant") continue;
    const items = advancement.configuration?.items ?? [];
    const kept = items.filter(entry => !isEmbeddedUuid(typeof entry === "string" ? entry : entry?.uuid));
    if (kept.length === items.length) continue;
    changes[`system.advancement.${id}.configuration.items`] = kept;
    removed += items.length - kept.length;
  }
  return { changes, removed };
}

/**
 * Every invalid item on a world actor the user owns that this repair would change.
 *
 * Invalid items are absent from `actor.items` and listed in its `invalidDocumentIds`. Unlinked
 * tokens keep their items in an ActorDelta, which the database read in `applyRepairs` does not
 * return, so only world actors are covered; imported characters are world actors.
 *
 * @returns {object[]}
 */
function planRepairs() {
  const plan = [];
  for (const actor of game.actors) {
    if (!actor.isOwner) continue;
    for (const id of actor.items.invalidDocumentIds ?? []) {
      const item = actor.items.getInvalid(id, { strict: false });
      if (!item) continue;
      const { changes, removed } = repairsFor(item._source);
      if (removed) plan.push({ actor, item, id, changes, removed });
    }
  }
  return plan;
}

/**
 * Write the repairs and report how many items load afterwards, read back from the database.
 *
 * Foundry 14.369 stores an update to an invalid item, then throws while applying the result on
 * each client, because `ClientDatabaseBackend#handleUpdateDocuments` looks the item up with
 * `collection.get`, which leaves invalid documents out. Every connected client keeps the broken copy
 * until it reloads. So a thrown update is not a failed one, and the local actor is not evidence
 * either way: the actor is fetched fresh from the database and an item counts as repaired when the
 * fresh copy loads it.
 *
 * @param {object[]} plan
 * @returns {Promise<number>}
 */
async function applyRepairs(plan) {
  const errors = new Map();
  for (const entry of plan) {
    try {
      await entry.item.update(entry.changes);
    } catch (err) {
      errors.set(entry, err);
    }
  }

  let repaired = 0;
  let failed = 0;
  const fresh = new Map();
  for (const entry of plan) {
    try {
      if (!fresh.has(entry.actor.id)) {
        const cls = entry.actor.constructor;
        const [stored] = await cls.database.get(cls, { query: { _id: entry.actor.id } });
        fresh.set(entry.actor.id, stored ?? null);
      }
      if (fresh.get(entry.actor.id)?.items.has(entry.id)) {
        repaired++;
        continue;
      }
    } catch (err) {
      errors.set(entry, err);
    }
    failed++;
    console.error(`${MODULE_ID} | "${entry.item.name}" on "${entry.actor.name}" still fails to load.`,
      errors.get(entry) ?? "");
  }

  const key = failed ? "THR.Rules.RepairImportedItems.DoneWithFailures" : "THR.Rules.RepairImportedItems.Done";
  ui.notifications?.[failed ? "warn" : "info"](game.i18n.format(key, { repaired, failed }), { permanent: true });
  return repaired;
}

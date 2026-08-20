import { MODULE_ID } from "../lib/constants.mjs";
import { registerLibWrapper } from "../lib/wrapper.mjs";
import { isRuleEnabled, ruleEnabledKey } from "../lib/settings.mjs";
import { allActors } from "../lib/actors.mjs";
import { knownAuraFor } from "./known-auras.mjs";

const RULE_ID = "auras";

/** Flag holding an aura's configuration, on the source effect. */
const AURA = "aura";

/** Flag on an applied child effect, holding the uuid of the source effect that produced it. */
const FROM_AURA = "fromAura";

/**
 * Runtime property where a source effect's changes are parked.
 *
 * An aura effect is a template, not a buff: it should never apply to the actor carrying it. Its
 * changes are moved here during data preparation so the effect itself contributes nothing, and the
 * children copied onto tokens in range carry the changes instead. Borrowed from Aura Effects, which
 * does the same thing in its own data model.
 */
const STASHED = "trickyAuraChanges";

/**
 * Who an aura reaches. Compared against the product of the two tokens' dispositions, so +1 means
 * both are on the same side and -1 means opposite sides, whichever side either happens to be.
 */
const DISPOSITION = { ANY: 0, ALLIES: 1, ENEMIES: -1 };

/** Applied over whatever the flag actually holds, so a partial config is still usable. */
const DEFAULTS = {
  enabled: true,
  radius: 10,

  // Allies by default. Almost every aura in play is a buff for your own side, and the cost of the
  // wrong default is asymmetric: an aura that quietly helps the enemy is far worse than one that
  // needs widening.
  disposition: DISPOSITION.ALLIES,
  applyToSelf: true,
  combatOnly: false,
  respectWalls: true,
  stacks: false,
  strength: "",
  showRadius: true,

  // Empty means "pick from disposition". Every aura configured before this option existed stores
  // no colour at all, so empty has to keep meaning the old behaviour rather than black.
  colour: ""
};

/** Ring colours used when an aura has no colour of its own. */
const AUTO_RING_COLOUR = { ENEMIES: 0xE57373, DEFAULT: 0xFFD54F };

/* -------------------------------------------- */
/*  Rule Definition                             */
/* -------------------------------------------- */

/**
 * Auras: an effect that applies itself to other tokens within a radius, and keeps up as they move.
 *
 * Built as a reconcile rather than an event log. Every trigger recomputes which tokens should be
 * inside which auras, then creates or deletes the difference. That is idempotent, so a missed
 * trigger corrects itself on the next one rather than leaving a buff on someone who walked away,
 * and "only the strongest of a duplicated aura applies" falls out of recomputing rather than needing
 * a special path when one is removed.
 */
export const auras = {
  id: RULE_ID,

  registerSettings() {
    game.settings.register(MODULE_ID, ruleEnabledKey(RULE_ID), {
      name: "THR.Rules.Auras.Enabled.Name",
      hint: "THR.Rules.Auras.Enabled.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    // Setting auras up one at a time is the slow part. This finds the ones official content
    // provides and configures them in a single reviewed pass.
    game.settings.registerMenu(MODULE_ID, "aurasSetup", {
      name: "THR.Rules.Auras.Setup.Name",
      label: "THR.Rules.Auras.Setup.Label",
      hint: "THR.Rules.Auras.Setup.Hint",
      icon: "fa-solid fa-wand-magic-sparkles",
      type: setupMenu(),
      restricted: true
    });
  },

  registerPatches() {
    // Reached through CONFIG rather than the global, since dnd5e substitutes its own class.
    registerLibWrapper(
      "CONFIG.ActiveEffect.documentClass.prototype.prepareDerivedData",
      onPrepareDerivedData,
      "WRAPPER",
      { feature: "Auras" }
    );

    // Anything that can change who is inside what.
    //
    // Movement is handled separately from other token updates. Both `updateToken` and `moveToken`
    // fire before the document's position has caught up, so reconciling from either reads the
    // token's previous coordinates and lands a full move behind.
    Hooks.on("moveToken", onTokenMoved);
    for (const hook of ["createToken", "deleteToken"]) Hooks.on(hook, () => scheduleReconcile());
    Hooks.on("updateToken", onTokenChanged);
    for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(hook, onEffectChanged);
    }
    for (const hook of ["createWall", "updateWall", "deleteWall"]) Hooks.on(hook, scheduleReconcile);
    Hooks.on("updateActor", scheduleReconcile);
    Hooks.on("canvasReady", scheduleReconcile);
    Hooks.on("updateCombat", scheduleReconcile);
    Hooks.on("deleteCombat", scheduleReconcile);
    Hooks.on("createCombat", scheduleReconcile);

    Hooks.on("drawToken", drawAuraRing);
    Hooks.on("renderTokenHUD", onRenderTokenHUD);
    Hooks.on("renderActiveEffectConfig", onRenderEffectConfig);
  },

  onReady() {
    if (isRuleEnabled(RULE_ID)) scheduleReconcile();
  }
};

/* -------------------------------------------- */
/*  Source Effects                              */
/* -------------------------------------------- */

/**
 * Park an aura effect's changes so it never applies to its own owner.
 * @param {Function} wrapped
 */
function onPrepareDerivedData(wrapped, ...args) {
  const result = wrapped(...args);

  try {
    const config = auraConfig(this);

    // Always neutralised. The source is a template, never a buff in its own right.
    //
    // Letting it apply to its owner instead was tried, to avoid the owner holding two documents for
    // one aura, and it broke the more important rule: the owner's own aura then sat outside the
    // best-of competition, so a weaker aura from someone else stacked on top of it and two paladins
    // standing together each got both. The owner receives a copy like everyone else, and the
    // source's icon is hidden instead.
    if (config?.enabled && this.changes?.length) {
      // `changes` is a schema field with only a getter, so it cannot be reassigned. The prepared
      // array is a fresh copy rather than the stored one, verified against the live document, so
      // emptying it in place neutralises the effect without touching what is persisted.
      this[STASHED] = [...this.changes];
      this.changes.length = 0;
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to prepare an aura effect.`, err);
  }

  return result;
}

/**
 * The aura configuration on an effect, with defaults filled in, or null if it is not an aura.
 * @param {object} effect
 * @returns {object|null}
 */
function auraConfig(effect) {
  const stored = effect?.getFlag?.(MODULE_ID, AURA);
  return stored ? { ...DEFAULTS, ...stored } : null;
}

/**
 * The changes an aura hands out. Parked during preparation, so read from there first.
 * @param {object} effect
 * @returns {object[]}
 */
function auraChanges(effect) {
  return effect?.[STASHED] ?? effect?.changes ?? [];
}

/**
 * Every aura-carrying effect on an actor, including those granted by items.
 * @param {object} actor
 * @returns {object[]}
 */
function auraEffectsOf(actor) {
  const all = actor?.allApplicableEffects ? [...actor.allApplicableEffects()] : [...(actor?.effects ?? [])];
  return all.filter(effect => auraConfig(effect));
}

/* -------------------------------------------- */
/*  Triggers                                    */
/* -------------------------------------------- */

let reconciling = false;
let debounced = null;

/**
 * Queue a reconcile, coalescing a burst of changes into a single pass.
 */
function scheduleReconcile() {
  if (!debounced) debounced = foundry.utils.debounce(() => reconcile(), 100);
  debounced();
}

/**
 * Effect changes schedule a pass, except for the children this rule creates.
 *
 * Without this guard, creating a child fires `createActiveEffect`, which would schedule another
 * reconcile, which would create more, forever.
 *
 * @param {object} effect
 */
function onEffectChanged(effect) {
  if (effect?.getFlag?.(MODULE_ID, FROM_AURA)) return;
  scheduleReconcile();
}

/**
 * Token updates other than movement: disposition, visibility, size and elevation.
 *
 * Position deliberately absent. `x` and `y` arrive here before the document has been updated, so
 * acting on them measures from where the token used to be.
 *
 * @param {object} token
 * @param {object} [changes]
 */
function onTokenChanged(token, changes) {
  if (changes && !["elevation", "disposition", "hidden", "width", "height"].some(k => k in changes)) return;
  scheduleReconcile();
}

/**
 * A token finished moving.
 *
 * `moveToken` fires when the movement is accepted, not when the document has arrived: measured at
 * that instant the token still reports its old coordinates, so every aura decision was made against
 * the previous position and appeared one move stale. Foundry exposes the animation as a promise for
 * exactly this, and core's own documentation waits on it the same way.
 *
 * The race is a safety net. If a promise never settles, a reconcile against slightly stale positions
 * still beats an aura that silently stops updating for the rest of the session.
 *
 * @param {object} doc
 */
async function onTokenMoved(doc) {
  try {
    const animation = doc?.object?.movementAnimationPromise;
    if (animation) {
      // Measured settle times ranged from about 300ms for a single square to over a second for a
      // longer path, so the ceiling is deliberately generous. It exists only so a promise that never
      // settles cannot freeze auras for the session, not as a timing assumption.
      await Promise.race([animation, new Promise(resolve => setTimeout(resolve, 10000))]);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed waiting for token movement to finish.`, err);
  }
  scheduleReconcile();
}

/* -------------------------------------------- */
/*  Reconcile                                   */
/* -------------------------------------------- */

/**
 * Recompute every aura on the active scene and apply the difference.
 */
async function reconcile() {
  if (reconciling) return;
  if (!game.users.activeGM?.isSelf) return;
  if (!isRuleEnabled(RULE_ID)) return;
  if (!canvas?.ready || !canvas.scene) return;

  reconciling = true;
  try {
    const tokens = canvas.tokens.placeables.filter(token => token.actor);
    if (!tokens.length) return;

    const sources = collectSources(tokens);
    ensureSourceIcons(sources);
    const desired = computeDesired(sources, tokens);
    await applyDifference(tokens, desired);
    for (const token of tokens) drawAuraRing(token);
  } catch (err) {
    console.error(`${MODULE_ID} | Aura reconcile failed. Auras may be stale until the next change.`, err);
  } finally {
    reconciling = false;
  }
}

/**
 * Keep an aura's template out of the token's icons.
 *
 * Token icons come from `showIcon` rather than from having a duration (see Foundry's Token
 * `_refreshEffects`). The owner receives a copy of their own aura like anyone else, and that copy
 * carries the icon, so showing the template as well would give the emitting token two icons for one
 * aura.
 *
 * Written once and then left alone, so this settles after a single extra pass rather than churning.
 *
 * @param {object[]} sources
 */
function ensureSourceIcons(sources) {
  const never = CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER;
  for (const { effect } of sources) {
    if (effect.showIcon === never) continue;
    effect.update({ showIcon: never }).catch(err => {
      console.error(`${MODULE_ID} | Could not hide the template icon for "${effect.name}".`, err);
    });
  }
}

/**
 * Every live aura emitter on the scene.
 * @param {object[]} tokens
 * @returns {object[]}
 */
function collectSources(tokens) {
  const inCombat = !!game.combat?.started;
  const sources = [];

  for (const token of tokens) {
    for (const effect of auraEffectsOf(token.actor)) {
      const config = auraConfig(effect);
      if (!config.enabled) continue;
      if (effect.disabled || effect.isSuppressed) continue;
      if (config.combatOnly && !inCombat) continue;

      const radius = resolveNumber(config.radius, token.actor);
      if (!(radius > 0)) continue;

      sources.push({
        token,
        effect,
        config,
        radius,
        strength: resolveStrength(effect, config, token.actor)
      });
    }
  }

  return sources;
}

/**
 * Which source auras each token should be receiving.
 * @param {object[]} sources
 * @param {object[]} tokens
 * @returns {Map<string, Set<string>>}  Token id to the set of source effect uuids.
 */
function computeDesired(sources, tokens) {
  const desired = new Map();
  const contested = new Map();

  const want = (tokenId, uuid) => {
    if (!desired.has(tokenId)) desired.set(tokenId, new Set());
    desired.get(tokenId).add(uuid);
  };

  for (const source of sources) {
    for (const token of tokens) {
      if (!appliesTo(source, token)) continue;

      // A stacking aura is unconditional. Everything else competes by name, because two paladins
      // both radiating Aura of Protection grant one bonus, not two.
      if (source.config.stacks) {
        want(token.id, source.effect.uuid);
        continue;
      }

      const key = `${token.id}::${source.effect.name}`;
      const held = contested.get(key);
      if (!held || beats(source, held)) contested.set(key, source);
    }
  }

  for (const [key, source] of contested) {
    want(key.split("::")[0], source.effect.uuid);
  }

  return desired;
}

/**
 * Does this source reach this token?
 *
 * Ordered cheapest first: identity and disposition are free, distance costs a grid measurement, and
 * the wall test is the most expensive so it runs last and only when asked for.
 *
 * @param {object} source
 * @param {object} token
 * @returns {boolean}
 */
function appliesTo(source, token) {
  const { config, radius } = source;
  const origin = source.token;
  const isSelf = token.id === origin.id;

  // The owner is an ordinary candidate, which is what keeps their own aura inside the best-of
  // comparison rather than stacking underneath someone else's.
  if (isSelf) return config.applyToSelf;

  if (config.disposition !== DISPOSITION.ANY) {
    const product = (token.document.disposition ?? 0) * (origin.document.disposition ?? 0);
    if (product !== config.disposition) return false;
  }

  if (tokenDistance(origin, token) > radius) return false;

  if (config.respectWalls) {
    const blocked = CONFIG.Canvas.polygonBackends.move.testCollision(origin.center, token.center, {
      type: "move",
      mode: "any"
    });
    if (blocked) return false;
  }

  return true;
}

/**
 * Distance between two tokens, measured between the grid spaces they occupy.
 *
 * Measuring raw pixel centres looks right until a token is dropped off-grid, at which point the
 * distance comes back fractional (8.5 where the grid reads 10) and the aura appears to switch on and
 * off at inconsistent ranges. Snapping to the containing cell first makes the measurement match what
 * the grid shows.
 *
 * Enumerating each occupied cell also gets large tokens right: 5e measures from a creature's nearest
 * space, not from the middle of it, so a 3x3 giant reaches three squares further than its centre
 * suggests.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function tokenDistance(a, b) {
  const grid = canvas.grid;
  if (grid.type === CONST.GRID_TYPES.GRIDLESS) {
    return grid.measurePath([a.center, b.center]).distance;
  }

  let shortest = Infinity;
  for (const pointA of occupiedCells(a)) {
    for (const pointB of occupiedCells(b)) {
      const distance = grid.measurePath([pointA, pointB]).distance;
      if (distance < shortest) shortest = distance;
    }
  }
  return Number.isFinite(shortest) ? shortest : grid.measurePath([a.center, b.center]).distance;
}

/**
 * The centre point of every grid cell a token stands on.
 * @param {object} token
 * @returns {object[]}
 */
function occupiedCells(token) {
  const grid = canvas.grid;
  const size = canvas.scene.grid.size;
  const doc = token.document;

  const columns = Math.max(1, Math.round(doc.width ?? 1));
  const rows = Math.max(1, Math.round(doc.height ?? 1));

  const points = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      points.push(grid.getCenterPoint({
        x: doc.x + (i * size) + (size / 2),
        y: doc.y + (j * size) + (size / 2)
      }));
    }
  }
  return points;
}

/**
 * Create and delete children so each token holds exactly the auras it should.
 * @param {object[]} tokens
 * @param {Map<string, Set<string>>} desired
 */
async function applyDifference(tokens, desired) {
  for (const token of tokens) {
    const actor = token.actor;
    const wanted = desired.get(token.id) ?? new Set();

    const existing = actor.effects.filter(effect => effect.getFlag(MODULE_ID, FROM_AURA));
    const held = new Set(existing.map(effect => effect.getFlag(MODULE_ID, FROM_AURA)));

    const stale = existing.filter(effect => !wanted.has(effect.getFlag(MODULE_ID, FROM_AURA)));
    const missing = [...wanted].filter(uuid => !held.has(uuid));

    // Children that should stay still need refreshing. Creating and deleting alone would leave a
    // copy frozen with whatever it was given when it was first applied, so a paladin raising their
    // Charisma, or an edit to the aura itself, would never reach anyone already standing in it.
    const refreshed = [];
    for (const child of existing) {
      const uuid = child.getFlag(MODULE_ID, FROM_AURA);
      if (!wanted.has(uuid)) continue;

      const fresh = childData(uuid);
      if (!fresh) continue;
      if (matches(child, fresh)) continue;

      refreshed.push({ _id: child.id, name: fresh.name, img: fresh.img, changes: fresh.changes });
    }

    try {
      if (stale.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(effect => effect.id));
      }
      if (refreshed.length) {
        await actor.updateEmbeddedDocuments("ActiveEffect", refreshed);
      }
      if (missing.length) {
        const data = missing.map(uuid => childData(uuid)).filter(Boolean);
        if (data.length) await actor.createEmbeddedDocuments("ActiveEffect", data);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to update auras on "${actor.name}".`, err);
    }
  }
}

/**
 * The effect document data for one applied aura.
 * @param {string} sourceUuid
 * @returns {object|null}
 */
function childData(sourceUuid) {
  const effect = fromUuidSync(sourceUuid, { strict: false });
  if (!effect) return null;

  return {
    name: effect.name,
    img: effect.img,
    origin: sourceUuid,
    disabled: false,
    transfer: false,

    // An aura child has no duration, and Foundry's CONDITIONAL default hides the icon for anything
    // that is not temporary. Without this the buff would apply invisibly.
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,

    changes: resolvedChanges(effect),
    flags: { [MODULE_ID]: { [FROM_AURA]: sourceUuid } }
  };
}

/**
 * Does an applied child already say what it should?
 *
 * Compared on the parts that carry meaning rather than by deep equality, so incidental document
 * fields do not trigger a pointless write on every single reconcile.
 *
 * @param {object} child
 * @param {object} fresh
 * @returns {boolean}
 */
function matches(child, fresh) {
  if (child.name !== fresh.name) return false;

  const shape = changes => (changes ?? []).map(c => `${c.key}|${c.mode}|${c.value}`).join("~");
  return shape(child.changes) === shape(fresh.changes);
}

/**
 * The actor an effect belongs to, whether it sits on the actor or on one of its items.
 * @param {object} effect
 * @returns {object|null}
 */
function actorOf(effect) {
  const parent = effect?.parent;
  if (!parent) return null;
  if (parent.documentName === "Actor") return parent;
  if (parent.documentName === "Item") return parent.parent ?? null;
  return null;
}

/**
 * An aura's changes with actor references resolved against the actor radiating it.
 *
 * Copying the raw formula would be wrong. A paladin's Aura of Protection is written as
 * `@abilities.cha.mod`, and handing that string to an ally means the ally resolves it against their
 * own Charisma, so everyone quietly receives their own modifier instead of the paladin's. Resolving
 * at copy time bakes in the source's value.
 *
 * `replaceFormulaData` substitutes the references and leaves everything else intact, so a die like
 * `1d4` still arrives as a die and is rolled by the recipient as normal.
 *
 * @param {object} effect
 * @returns {object[]}
 */
function resolvedChanges(effect) {
  const rollData = actorOf(effect)?.getRollData?.() ?? {};

  return auraChanges(effect).map(change => {
    const copy = foundry.utils.deepClone(change);
    try {
      copy.value = Roll.replaceFormulaData(String(change.value ?? ""), rollData, { missing: "0" });
    } catch (err) {
      console.error(`${MODULE_ID} | Could not resolve an aura change against its source actor.`, err);
    }
    return copy;
  });
}

/* -------------------------------------------- */
/*  Strength                                    */
/* -------------------------------------------- */

/**
 * How strong an aura is, for deciding which of two same-named auras wins.
 *
 * Derived from the change values by default, so a paladin's `+@abilities.cha.mod` compares correctly
 * against another paladin's without anyone configuring anything.
 *
 * @param {object} effect
 * @param {object} config
 * @param {object} actor
 * @returns {number}
 */
function resolveStrength(effect, config, actor) {
  if (String(config.strength ?? "").trim()) return resolveNumber(config.strength, actor);

  let total = 0;
  for (const change of auraChanges(effect)) total += resolveNumber(change?.value, actor);
  return total;
}

/**
 * Is a strictly better than b? Ties break on uuid so the outcome is stable between passes rather
 * than flickering between two equal auras.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function beats(a, b) {
  if (a.strength !== b.strength) return a.strength > b.strength;
  return a.effect.uuid < b.effect.uuid;
}

/**
 * Evaluate a number or a deterministic formula against an actor's roll data.
 * @param {string|number} value
 * @param {object} actor
 * @returns {number}
 */
function resolveNumber(value, actor) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (Number.isFinite(Number(text))) return Number(text);

  try {
    const roll = new Roll(text, actor?.getRollData?.() ?? {});
    return roll.isDeterministic ? (roll.evaluateSync().total ?? 0) : 0;
  } catch {
    return 0;
  }
}

/* -------------------------------------------- */
/*  Radius Ring                                 */
/* -------------------------------------------- */

/** Where the ring graphic is parked on the token, so it can be found and replaced. */
const RING = "trickyAuraRing";

/**
 * Draw the reach of every aura this token radiates.
 *
 * Attached to the token rather than to a canvas layer, so it follows movement for free instead of
 * needing to be repositioned on every frame of an animation.
 *
 * The circle is measured from the token's edge, not its centre, which is what "within 10 feet"
 * means at the table. Aura Effects gets a grid-accurate emanation free from Foundry's region
 * rendering; this is a plain circle, which reads clearly enough and costs no documents.
 *
 * @param {object} token
 */
function ringColour(config) {
  const chosen = String(config?.colour ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(chosen)) return Number.parseInt(chosen.slice(1), 16);
  return (config?.disposition === DISPOSITION.ENEMIES) ? AUTO_RING_COLOUR.ENEMIES : AUTO_RING_COLOUR.DEFAULT;
}

/**
 * A colour number as the `#rrggbb` string an `<input type="color">` needs.
 *
 * @param {number} value
 * @returns {string}
 */
function toHex(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function drawAuraRing(token) {
  try {
    if (token?.[RING]) {
      token[RING].destroy();
      delete token[RING];
    }
    if (!isRuleEnabled(RULE_ID)) return;
    if (!token?.actor || !canvas?.scene) return;

    const showing = auraEffectsOf(token.actor).filter(effect => {
      const config = auraConfig(effect);
      return config?.enabled && config.showRadius && !effect.disabled && !effect.isSuppressed;
    });
    if (!showing.length) return;

    const perFoot = canvas.scene.dimensions.distancePixels;
    const edge = Math.max(token.w, token.h) / 2;
    const graphics = new PIXI.Graphics();
    let drew = false;

    for (const effect of showing) {
      const config = auraConfig(effect);
      const feet = resolveNumber(config.radius, token.actor);
      if (!(feet > 0)) continue;

      const colour = ringColour(config);
      graphics.lineStyle(3, colour, 0.65);
      graphics.beginFill(colour, 0.05);
      graphics.drawCircle(token.w / 2, token.h / 2, (feet * perFoot) + edge);
      graphics.endFill();
      drew = true;
    }

    if (!drew) {
      graphics.destroy();
      return;
    }

    // Behind the token art, so a ring never obscures the creature standing in it.
    token.addChildAt(graphics, 0);
    token[RING] = graphics;
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to draw an aura ring.`, err);
  }
}

/**
 * Flip the ring on or off for every aura on a token.
 * @param {object} actor
 * @param {boolean} visible
 */
async function setRingVisibility(actor, visible) {
  for (const effect of auraEffectsOf(actor)) {
    const config = auraConfig(effect);
    if (!config?.enabled) continue;
    await effect.setFlag(MODULE_ID, AURA, { ...config, showRadius: visible });
  }
}

/* -------------------------------------------- */
/*  Token HUD Toggle                            */
/* -------------------------------------------- */

/**
 * Add a button to the token HUD that flips every aura on that token at once.
 * @param {object} hud
 * @param {HTMLElement} html
 */
function onRenderTokenHUD(hud, html) {
  try {
    if (!isRuleEnabled(RULE_ID)) return;

    const actor = hud?.object?.actor;
    if (!actor) return;

    const sources = auraEffectsOf(actor);
    if (!sources.length) return;

    const column = html.querySelector(".col.right") ?? html.querySelector(".col.left");
    if (!column) return;

    const anyActive = sources.some(effect => !effect.disabled);

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("control-icon", "tricky-aura-toggle");
    if (anyActive) button.classList.add("active");
    button.dataset.tooltip = game.i18n.localize(anyActive ? "THR.Rules.Auras.HUD.Off" : "THR.Rules.Auras.HUD.On");
    button.innerHTML = '<i class="fa-solid fa-circle-nodes"></i>';

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        for (const effect of sources) await effect.update({ disabled: anyActive });
        scheduleReconcile();
        hud.render();
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to toggle auras.`, err);
      }
    });

    column.append(button);

    // A separate control, because hiding the ring and switching the aura off are different
    // intentions: a permanent aura usually wants to stay on with its ring out of the way.
    const anyRings = sources.some(effect => auraConfig(effect)?.showRadius);

    const ring = document.createElement("button");
    ring.type = "button";
    ring.classList.add("control-icon", "tricky-aura-ring-toggle");
    if (anyRings) ring.classList.add("active");
    ring.dataset.tooltip = game.i18n.localize(anyRings ? "THR.Rules.Auras.HUD.HideRing" : "THR.Rules.Auras.HUD.ShowRing");
    ring.innerHTML = '<i class="fa-regular fa-circle-dot"></i>';

    ring.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await setRingVisibility(actor, !anyRings);
        for (const placeable of canvas.tokens.placeables) drawAuraRing(placeable);
        hud.render();
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to toggle the aura ring.`, err);
      }
    });

    column.append(ring);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to add the aura toggle to the token HUD.`, err);
  }
}

/* -------------------------------------------- */
/*  Configuration UI                            */
/* -------------------------------------------- */

/**
 * Add an Aura button to the effect config sheet.
 *
 * A button plus an own dialog, rather than extending the sheet's PARTS to add a tab, so this stays
 * uncoupled from dnd5e's sheet structure.
 *
 * @param {object} app
 * @param {HTMLElement} html
 */
function onRenderEffectConfig(app, html) {
  try {
    if (!isRuleEnabled(RULE_ID)) return;

    const effect = app?.document;
    if (!effect) return;
    if (html.querySelector(".tricky-aura-config")) return;

    const footer = html.querySelector("footer") ?? html.querySelector(".sheet-footer") ?? html;

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("tricky-aura-config");
    button.innerHTML = '<i class="fa-solid fa-circle-nodes"></i> '
      + game.i18n.localize("THR.Rules.Auras.Config.Button");
    button.addEventListener("click", event => {
      event.preventDefault();
      promptAuraConfig(effect);
    });

    footer.prepend(button);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to add the aura config button.`, err);
  }
}

/**
 * Ask for an effect's aura settings and store them.
 * @param {object} effect
 */
async function promptAuraConfig(effect) {
  // An effect with no config yet is being turned into an aura for the first time, so two things are
  // assumed about the intent. The switch starts on, because starting it off meant configuring
  // everything correctly, saving, and having nothing happen. And the known table is consulted for a
  // radius and reach, because it had the right answer for Aura of Life all along while only the bulk
  // setup asked it, so configuring one by hand pre-filled ten feet for a thirty foot aura. Matched
  // on the effect's own name first, then on the item it came from.
  const stored = auraConfig(effect);
  const known = stored
    ? null
    : (knownAuraFor(effect.name)
      ?? (effect.parent?.documentName === "Item" ? knownAuraFor(effect.parent.name) : null));
  const current = stored ?? { ...DEFAULTS, ...known, enabled: true };
  const L = key => game.i18n.localize(`THR.Rules.Auras.Config.${key}`);
  const checked = value => (value ? " checked" : "");
  const selected = (a, b) => (a === b ? " selected" : "");

  const notice = known
    ? `<p class="notification info">${game.i18n.localize("THR.Rules.Auras.Config.Seeded")}</p>`
    : "";

  const content = `${notice}
    <div class="form-group">
      <label>${L("Enabled")}</label>
      <div class="form-fields"><input type="checkbox" name="enabled"${checked(current.enabled)}></div>
    </div>
    <div class="form-group">
      <label>${L("Radius")}</label>
      <div class="form-fields"><input type="text" name="radius" value="${current.radius}"></div>
      <p class="hint">${L("RadiusHint")}</p>
    </div>
    <div class="form-group">
      <label>${L("Disposition")}</label>
      <div class="form-fields">
        <select name="disposition">
          <option value="0"${selected(current.disposition, DISPOSITION.ANY)}>${L("Any")}</option>
          <option value="1"${selected(current.disposition, DISPOSITION.ALLIES)}>${L("Allies")}</option>
          <option value="-1"${selected(current.disposition, DISPOSITION.ENEMIES)}>${L("Enemies")}</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>${L("ApplyToSelf")}</label>
      <div class="form-fields"><input type="checkbox" name="applyToSelf"${checked(current.applyToSelf)}></div>
    </div>
    <div class="form-group">
      <label>${L("RespectWalls")}</label>
      <div class="form-fields"><input type="checkbox" name="respectWalls"${checked(current.respectWalls)}></div>
    </div>
    <div class="form-group">
      <label>${L("CombatOnly")}</label>
      <div class="form-fields"><input type="checkbox" name="combatOnly"${checked(current.combatOnly)}></div>
    </div>
    <div class="form-group">
      <label>${L("ShowRadius")}</label>
      <div class="form-fields"><input type="checkbox" name="showRadius"${checked(current.showRadius)}></div>
    </div>
    <div class="form-group tricky-aura-colour">
      <label>${L("Colour")}</label>
      <div class="form-fields">
        <input type="color" name="colour" value="${toHex(ringColour(current))}">
        <label class="checkbox">${L("AutoColour")}<input type="checkbox" name="autoColour"${checked(!current.colour)}></label>
      </div>
      <p class="hint">${L("ColourHint")}</p>
    </div>
    <div class="form-group">
      <label>${L("Stacks")}</label>
      <div class="form-fields"><input type="checkbox" name="stacks"${checked(current.stacks)}></div>
      <p class="hint">${L("StacksHint")}</p>
    </div>
    <div class="form-group">
      <label>${L("Strength")}</label>
      <div class="form-fields"><input type="text" name="strength" value="${current.strength ?? ""}"></div>
      <p class="hint">${L("StrengthHint")}</p>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.format("THR.Rules.Auras.Config.Title", { name: effect.name }) },
    content,
    ok: { label: game.i18n.localize("THR.Rules.Auras.Config.Save"), icon: "fa-solid fa-check" }
  });
  if (!result) return;

  try {
    // Hidden alongside the flag, so a newly configured aura does not briefly show two icons on its
    // own token before the next reconcile tidies up.
    if (result.enabled) {
      await effect.update({ showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER });
    }

    await effect.setFlag(MODULE_ID, AURA, {
      enabled: !!result.enabled,
      radius: String(result.radius ?? "").trim() || "0",
      disposition: Number(result.disposition) || 0,
      applyToSelf: !!result.applyToSelf,
      respectWalls: !!result.respectWalls,
      combatOnly: !!result.combatOnly,
      stacks: !!result.stacks,
      showRadius: !!result.showRadius,
      colour: result.autoColour ? "" : String(result.colour ?? "").trim(),
      strength: String(result.strength ?? "").trim()
    });
    scheduleReconcile();
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to save the aura configuration.`, err);
    ui.notifications?.error(game.i18n.localize("THR.Rules.Auras.Config.Failed"));
  }
}


/* -------------------------------------------- */
/*  Bulk Setup                                  */
/* -------------------------------------------- */

/**
 * Every effect in the world belonging to an item this module recognises as an aura.
 *
 * Matched on the item's name against the known table, because the data itself does not say. See
 * `known-auras.mjs` for why inference was rejected.
 *
 * @returns {object[]}
 */
function findKnownAuras() {
  const found = [];

  for (const actor of allActors()) {
    for (const item of actor.items) {
      const known = knownAuraFor(item.name);
      if (!known) continue;

      for (const effect of item.effects) {
        if (effect.type === "enchantment") continue;
        found.push({
          actor: actor.name,
          item: item.name,
          effect,
          known,
          already: !!effect.getFlag(MODULE_ID, AURA)
        });
      }
    }
  }

  return found;
}

/**
 * Show what was found, let it be corrected, and configure whatever is ticked.
 */
async function promptKnownAuraSetup() {
  const found = findKnownAuras();
  if (!found.length) {
    ui.notifications?.info(game.i18n.localize("THR.Rules.Auras.Setup.NoneFound"));
    return;
  }

  const label = key => game.i18n.localize(`THR.Rules.Auras.Setup.${key}`);
  const rows = found.map((entry, i) => `
    <tr>
      <td style="text-align:center"><input type="checkbox" name="pick.${i}"${entry.already ? "" : " checked"}></td>
      <td>${foundry.utils.escapeHTML(entry.item)}</td>
      <td>${foundry.utils.escapeHTML(entry.actor)}</td>
      <td><input type="text" name="radius.${i}" value="${entry.known.radius}" style="width:4em"></td>
      <td>${label(entry.known.disposition === -1 ? "Enemies" : "Allies")}</td>
      <td>${entry.already ? label("Already") : ""}</td>
    </tr>`).join("");

  const content = `
    <p>${label("Intro")}</p>
    <table style="width:100%">
      <thead><tr>
        <th></th><th>${label("ColItem")}</th><th>${label("ColActor")}</th>
        <th>${label("ColRadius")}</th><th>${label("ColReaches")}</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">${label("Hint")}</p>
  `;

  const result = await foundry.applications.api.DialogV2.input({
    window: { title: label("Name") },
    position: { width: 620 },
    content,
    ok: { label: label("Apply"), icon: "fa-solid fa-check" }
  });
  if (!result) return;

  let configured = 0;
  for (const [i, entry] of found.entries()) {
    if (!result.pick?.[i]) continue;

    try {
      await entry.effect.update({ showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER });
      await entry.effect.setFlag(MODULE_ID, AURA, {
        enabled: true,
        radius: String(result.radius?.[i] ?? entry.known.radius).trim() || String(entry.known.radius),
        disposition: entry.known.disposition,
        applyToSelf: entry.known.applyToSelf,
        respectWalls: true,
        combatOnly: false,
        stacks: false,
        strength: ""
      });
      configured += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | Could not configure "${entry.item}" on "${entry.actor}".`, err);
    }
  }

  scheduleReconcile();
  ui.notifications?.info(game.i18n.format("THR.Rules.Auras.Setup.Done", { count: configured }));
}

/**
 * Settings menu shim. `registerMenu` requires an ApplicationV2 subclass, but this needs no window of
 * its own beyond the review dialog it opens.
 * @returns {Function}
 */
let setupMenuClass = null;
function setupMenu() {
  if (setupMenuClass) return setupMenuClass;

  setupMenuClass = class extends foundry.applications.api.ApplicationV2 {
    async render() {
      await promptKnownAuraSetup();
      return this;
    }
  };

  return setupMenuClass;
}

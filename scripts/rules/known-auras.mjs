/**
 * Auras that official 5e content provides, with the values it does not record anywhere machine
 * readable.
 *
 * This table exists because the data cannot be inferred. A scan of a real world finds four items
 * with a "self, 30 foot radius" shape, of which three are detection spells rather than auras, while
 * Aura of Protection carries no range, target or activity at all and its ten feet appears only in
 * prose. Guessing from templates or description text configures the wrong things and misses the
 * obvious ones.
 *
 * Radii are the values at the level the feature is gained. Where a feature widens with level, a
 * `scaling` formula expresses it and is used in place of the flat number when the actor can
 * actually resolve it. Paladin auras go from 10 feet to 30 at 18th level, and `floor(levels / 18)`
 * is 0 below 18th and 1 from 18th to 20th, which is exactly the step needed.
 *
 * Keys are matched against the item's name, case-insensitively.
 */
/**
 * A paladin's aura radius. Ten feet, thirty from 18th level.
 *
 * Written as a formula rather than a flat number so it follows the character up, instead of being a
 * value somebody has to remember to change mid-campaign.
 */
const PALADIN_AURA_RADIUS = "10 + 20 * floor(@classes.paladin.levels / 18)";

export const KNOWN_AURAS = {
  // Paladin class features
  "aura of protection": { radius: 10, disposition: 1, applyToSelf: true, scaling: PALADIN_AURA_RADIUS },
  "aura of courage": { radius: 10, disposition: 1, applyToSelf: true, scaling: PALADIN_AURA_RADIUS },
  "aura of warding": { radius: 10, disposition: 1, applyToSelf: true, scaling: PALADIN_AURA_RADIUS },
  "aura of alacrity": { radius: 10, disposition: 1, applyToSelf: true, scaling: PALADIN_AURA_RADIUS },
  "aura of hate": { radius: 10, disposition: 1, applyToSelf: true, scaling: PALADIN_AURA_RADIUS },

  // Paladin and cleric spells
  "aura of life": { radius: 30, disposition: 1, applyToSelf: true },
  "aura of purity": { radius: 30, disposition: 1, applyToSelf: true },
  "aura of vitality": { radius: 30, disposition: 1, applyToSelf: true },
  "crusader's mantle": { radius: 30, disposition: 1, applyToSelf: false },
  "circle of power": { radius: 30, disposition: 1, applyToSelf: true },

  // Hostile emanations
  //
  // No difficult terrain here, deliberately. dnd5e's 2024 Spirit Guardians ships its own "Half
  // Speed" effect, whose changes multiply walk, fly, climb, swim and burrow by 0.5, and radiating
  // that effect is exactly what this aura is for. Measured: a Ghoul in range went from 30 to 15
  // walking. Adding a terrain region on top halves the speed *and* doubles the cost, leaving a
  // quarter of normal movement.
  "spirit guardians": { radius: 15, disposition: -1, applyToSelf: false },

  // The 2024 spell, whose emanation does two things: the extra 2d8 applies to anything you hit
  // inside it, and the ground in it is Difficult Terrain for your enemies. Only the second half is
  // automated. The damage is conditional on the target being inside at the moment you hit, which no
  // active effect change can express, so the ring is there to answer "does the 2d8 apply" by eye and
  // the item's own Bonus Attack Damage activity rolls it.
  "conjure minor elementals": { radius: 15, disposition: -1, applyToSelf: false, difficultTerrain: true },
  "aura of hostility": { radius: 10, disposition: -1, applyToSelf: false },

  // Other emanating buffs
  "beacon of hope": { radius: 30, disposition: 1, applyToSelf: false },
  "antilife shell": { radius: 10, disposition: -1, applyToSelf: false }
};

/**
 * The known configuration for an item, or null.
 * @param {string} name
 * @returns {object|null}
 */
export function knownAuraFor(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return KNOWN_AURAS[key] ? { ...KNOWN_AURAS[key] } : null;
}

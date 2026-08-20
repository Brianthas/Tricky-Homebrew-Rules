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
 * Radii are the values at the level the feature is gained. Paladin auras widen to 30 feet at 18th
 * level, which is not represented here: the review screen shows the radius before anything is
 * written, so it can be corrected there.
 *
 * Keys are matched against the item's name, case-insensitively.
 */
export const KNOWN_AURAS = {
  // Paladin class features
  "aura of protection": { radius: 10, disposition: 1, applyToSelf: true },
  "aura of courage": { radius: 10, disposition: 1, applyToSelf: true },
  "aura of warding": { radius: 10, disposition: 1, applyToSelf: true },
  "aura of alacrity": { radius: 10, disposition: 1, applyToSelf: true },
  "aura of hate": { radius: 10, disposition: 1, applyToSelf: true },

  // Paladin and cleric spells
  "aura of life": { radius: 30, disposition: 1, applyToSelf: true },
  "aura of purity": { radius: 30, disposition: 1, applyToSelf: true },
  "aura of vitality": { radius: 30, disposition: 1, applyToSelf: true },
  "crusader's mantle": { radius: 30, disposition: 1, applyToSelf: false },
  "circle of power": { radius: 30, disposition: 1, applyToSelf: true },

  // Hostile emanations
  "spirit guardians": { radius: 15, disposition: -1, applyToSelf: false },
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

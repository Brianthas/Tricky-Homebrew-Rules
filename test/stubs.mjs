/**
 * The smallest amount of Foundry needed to import the rules outside of Foundry.
 *
 * These tests exercise the parts of the module that are ordinary logic: what colour a ring is, what
 * an effect should be called, whether a duration has run out. That logic is where the bugs have
 * actually been, and none of it needs a canvas.
 *
 * Everything here is deliberately minimal. A stub rich enough to be convincing is a second
 * implementation to keep in step, and a test that passes against a fake nobody maintains is worse
 * than no test. Anything needing more of Foundry than this belongs in the live client instead.
 */

/** Install the globals the rule modules touch. Call once, before importing them. */
export function installStubs() {
  // Settings default to on, since that is the state the rules are normally in. Individual tests
  // flip one with setSetting to check what happens when it is off.
  globalThis.__settings ??= new Map([["moduleEnabled", true]]);

  globalThis.game ??= {
    combat: null,
    settings: {
      get: (scope, key) => globalThis.__settings.has(key)
        ? globalThis.__settings.get(key)
        : (key.endsWith("Enabled") ? true : undefined),
      set: (scope, key, value) => { globalThis.__settings.set(key, value); }
    },
    i18n: { localize: key => key, format: key => key }
  };

  globalThis.CONFIG ??= {
    Canvas: {
      lightAnimations: {
        emanation: { label: "LIGHT.ANIMATION.Emanation" },
        pulse: { label: "LIGHT.ANIMATION.Pulse" },
        dome: { label: "LIGHT.ANIMATION.Dome" }
      }
    }
  };

  globalThis.Hooks ??= { on: () => {}, once: () => {}, off: () => {} };
  globalThis.fromUuidSync ??= uuid => globalThis.__uuids?.[uuid] ?? null;
}

/**
 * A stand-in ActiveEffect.
 *
 * @param {object} [data]
 * @returns {object}
 */
export function fakeEffect(data = {}) {
  const flags = data.flags ?? {};
  return {
    name: data.name ?? "Test Effect",
    disabled: data.disabled ?? false,
    isSuppressed: data.isSuppressed ?? false,
    isTemporary: data.isTemporary ?? false,
    duration: data.duration ?? {},
    type: data.type ?? "base",
    parent: data.parent ?? null,
    origin: data.origin ?? null,
    flags,
    getFlag: (scope, key) => flags?.[scope]?.[key]
  };
}

/**
 * Override one setting for the duration of a test. Returns a function that puts it back.
 *
 * @param {string} key
 * @param {*} value
 * @returns {Function}
 */
export function setSetting(key, value) {
  const had = globalThis.__settings.has(key);
  const previous = globalThis.__settings.get(key);
  globalThis.__settings.set(key, value);
  return () => { if (had) globalThis.__settings.set(key, previous); else globalThis.__settings.delete(key); };
}

/** Register a uuid so `fromUuidSync` can resolve it inside a test. */
export function registerUuid(uuid, doc) {
  globalThis.__uuids ??= {};
  globalThis.__uuids[uuid] = doc;
}

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installStubs } from "./stubs.mjs";

installStubs();

const { dependencies, missingFrom } = await import("../scripts/lib/selfcheck.mjs");

/**
 * Everything the checks look for, present and correct.
 *
 * Kept here rather than in the shared stubs because it is the point of these tests: a self check
 * that cannot fail is decoration, and one that cannot pass is an alarm nobody can silence.
 */
function satisfyEverything() {
  const previous = globalThis.CONFIG;
  globalThis.CONFIG = {
    Dice: {
      DamageRoll: {
        buildEvaluate: () => {},
        DefaultConfigurationDialog: class { }
      }
    },
    Actor: { documentClass: { prototype: { allApplicableEffects: () => {} } } },
    ChatMessage: { documentClass: { prototype: { getAssociatedItem: () => {} } } },
    ActiveEffect: { documentClass: { getInitialDuration: () => {} } },
    Canvas: {
      polygonBackends: { move: { testCollision: () => {} } },
      lightAnimations: { emanation: {} }
    }
  };
  return () => { globalThis.CONFIG = previous; };
}

describe("missingFrom", () => {
  test("reports nothing when everything is present", () => {
    assert.deepEqual(missingFrom([{ label: "a", rules: ["X"], present: () => true }]), []);
  });

  test("reports what is absent", () => {
    const missing = missingFrom([
      { label: "here", rules: ["X"], present: () => true },
      { label: "gone", rules: ["Y"], present: () => false }
    ]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].label, "gone");
  });

  test("a check that throws counts as missing rather than taking the module down", () => {
    // Probing a path that no longer exists can throw rather than return undefined, and a startup
    // check that itself explodes is worse than the problem it looks for.
    const missing = missingFrom([{ label: "explodes", rules: ["Z"], present: () => { throw new Error("gone"); } }]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].label, "explodes");
  });
});

describe("dependencies", () => {
  test("every entry can be reported on", () => {
    for (const entry of dependencies()) {
      assert.equal(typeof entry.label, "string", "needs a label to print");
      assert.ok(entry.label.length, "label must not be empty");
      assert.ok(Array.isArray(entry.rules) && entry.rules.length, `${entry.label} must name the rules it affects`);
      assert.equal(typeof entry.present, "function", `${entry.label} must be probeable`);
    }
  });

  test("nothing is reported when every API is there", () => {
    const restore = satisfyEverything();
    try {
      assert.deepEqual(missingFrom(dependencies()).map(e => e.label), []);
    } finally {
      restore();
    }
  });

  test("every single check fails when its API is taken away", () => {
    // One at a time, so a check cannot pass because some other entry happens to cover for it. This
    // is what stops a self check quietly reporting all clear while probing the wrong thing.
    for (const entry of dependencies()) {
      const restore = satisfyEverything();
      try {
        assert.deepEqual(missingFrom([entry]), [], `${entry.label} should pass when present`);

        globalThis.CONFIG = {};
        assert.equal(missingFrom([entry]).length, 1, `${entry.label} should fail when absent`);
      } finally {
        restore();
      }
    }
  });
});

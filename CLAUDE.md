# Tricky-Homebrew-Rules

Foundry module for the dnd5e system. Root `CLAUDE.md` and `RULES.md` apply here too; what follows
is the system-specific knowledge that has already cost a test cycle at least once each, recorded in
`Mistakes.MD`.

## Active effects

- **`actor.effects` omits every effect transferred from an item.** To enumerate everything affecting
  an actor, use `actor.allApplicableEffects()`. Reading the wrong collection has twice produced a
  near-miss bug report about a rule that works.
- **When an update looks like it did not apply, compare `doc._source.<field>` against `doc.<field>`
  before theorising about why the write failed.** One is what was stored, the other is what was
  derived, and the difference answers the question in one line.

## Ephemeral documents

Several rules here create and destroy their own copies of effects during normal play. That makes a
whole class of feature wrong by construction:

- **Never offer configuration on a document your own code creates and destroys.** A re-cast throws
  the copy away, taking the config with it, and the failure looks like the rule being broken rather
  than the setting having evaporated. Detect the copy, redirect to the durable original (the item's
  effect), and never let a derived copy be accepted as a source.
- **Two identically named effects are a trap for the user, not just for the code.** Offering an
  Aura config button on the wrong one of a pair silently tore down a caster's concentration and
  dropped the spell.

## Anything that deletes or disables

- **State the exact condition under which it fires, and check that condition against a case that
  must survive.** An expiry rule once matched every condition on the actor, so advancing combat
  would have stripped Prone, Poisoned and Bloodied from every actor in the world.
- **When a decision depends on several framework fields, read the definition of each one.** Not the
  name, the implementation.
- **The delete/disable setting must be honoured on every write path**, not just the one that
  motivated adding it. It is the safeguard offered to make testing safe, so a path that ignores it
  destroys a document during a run that was promised to be non-destructive.

## Tables of correct values

When the module holds a table of known-good values (aura radii, for instance), **every path that
asks the user for one of those values seeds from it** - not just the bulk path that motivated
writing the table. A 10 foot aura that should be 30 misbehaves only for allies standing 10 to 30
feet away, which is precisely where the spell matters and nowhere near where anyone is looking.

## Installing before the first release

A `module.json` with `manifest`/`download` pointing at `releases/latest/download/...` makes Foundry
404 on every world load until a release actually exists. Either omit both keys until the first
release is published, or say up front that the red error is expected.

## Editor type checking

`jsconfig.json` points at `fvtt-types` (a dev-only devDependency, aliased to
`@league-of-foundry-developers/foundry-vtt-types`), so `game`, `CONFIG` and `Hooks` resolve in the
editor and a mistyped document key is flagged instead of failing silently in Foundry.

`checkJs` is off. Turning it on across `scripts/`, `test/` and `tools/` reports 247 errors, most of
them in `scripts/rules/auras.mjs` and `scripts/rules/roll-to-bonus.mjs`. Opt a single file in with
`// @ts-check` on line 1.

`package.json` exists for this dependency only. The module version stays in `module.json`, and CI
does not run npm.

`eslint.config.mjs` is flat config on eslint 10. `no-undef` is off because fvtt-types covers the
globals. `no-useless-assignment` is off because the `let x = null; try { x = ... } catch { return
null; }` idiom in `expire-effects.mjs` and `source-named-effects.mjs` reads as a dead store to it.
`npm run lint` is clean; `npm test` runs the same 99 tests CI does.

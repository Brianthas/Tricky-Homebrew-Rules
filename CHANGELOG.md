# Changelog

## 0.8.1

- Bonus effects are now named for what they do as well as where they came from, for example `Bardic Inspiration: Armor Class +1`. Previously they took the source item's name alone, which collided with the Effect Names rule naming dnd5e's own effects the same way: holding a Bardic Inspiration die and having spent one on AC both read simply "Bardic Inspiration" and were indistinguishable on the token.

## 0.8.0

- Max Healing now marks the chat card with a **Maximized** banner. A maximized roll was previously indistinguishable from one that honestly rolled its maximum, so there was no way to tell after the fact, and no way for the table to check.

## 0.7.7

- **Concentration markers are now always deleted when a concentration spell expires, even in disable mode.** dnd5e's `Actor5e#concentration` decides whether an actor is concentrating by checking only for the concentrating status, never `disabled` or `active`. A disabled marker therefore still counts: the caster keeps being prompted for concentration saves and keeps consuming a concentration slot while appearing to have stopped. 0.7.6 introduced this by making concentration honour the disable setting, which turned out not to be a safe thing to honour.

## 0.7.6

- Bonus effects now always show their icon on the token. Foundry's `showIcon` defaults to CONDITIONAL, meaning "only if the effect has a temporary duration", and a turn-relative bonus carries no Foundry duration because "start of their next turn" cannot be expressed as one. The result was a bonus that applied correctly with nothing visible on the token to say so.
- Roll to Bonus now honours the delete-or-disable setting when its own bonuses expire. It kept a separate expiry from the Expire Effects rule, for the turn-relative durations Foundry cannot express, and that path always deleted. Choosing disable mode to test safely no longer gets quietly overruled.

## 0.7.5

- **Fixed Expire Effects switching off conditions.** Conditions such as Bloodied have no countdown at all, yet Foundry reports them as `isTemporary` with `expired: true`, because `isTemporary` is `!!duration.expiry || Number.isFinite(duration.value)`. Checking only those two fields meant every condition on an actor got disabled or deleted on the first sweep. An effect must now have a real countdown in seconds, rounds or turns before it can expire.
- Ending concentration now honours the delete/disable setting. It previously always deleted the marker, so a run in disable mode could still destroy a concentration effect and cascade to its targets. In disable mode it now switches off the marker and its dependents instead.

## 0.7.4

- Fixed a bonus effect's description reading "until Until removed by hand". The duration now appears as its own clause, so it reads correctly whatever the wording.
- A round-count duration now shows the actual number in the description rather than the dropdown's "A number of rounds".

## 0.7.3

- Fixed the Effect Names rule throwing during setup, which meant the **Rename Existing Effects** button never appeared in the module settings. Foundry requires a settings menu to be an ApplicationV2 subclass; it was a plain class. Renaming of newly applied effects was unaffected.

## 0.7.2

- Fixed "No one to apply the bonus to" when applying a feature's roll with "Whoever made the roll" chosen. dnd5e posts a feature's utility roll with a completely empty speaker, so the lookup had nothing to work from, on exactly the roll type this rule exists for. It now falls back to the item recorded on the message, which knows its owning actor.
- The recipient now defaults to your targeted tokens if you have any, then your selected tokens, then whoever rolled. Most bonus dice get handed to someone else, so defaulting to the roller meant changing the dropdown almost every time.
- The failure message now says which way of picking a recipient came up empty, instead of one message for all three.

## 0.7.1

- The Apply as bonus button no longer appears on every roll. It was landing on attack rolls, skill checks, saving throws and weapon damage, none of which are bonuses a feature handed out.
- It now shows on feature and spell rolls only by default, never on attack rolls, and never on bare skill checks or saves since those come from no item.
- Added a setting to widen it to any item roll, or back to every roll, without needing a code change.

## 0.7.0

- New rule: **Expire Effects**. Removes Active Effects once their duration runs out. Nothing in Foundry or dnd5e does this, and the modules that normally would (Times-Up, DAE) stop at Foundry 13.999, so buffs otherwise applied forever.
- Concentration is handled in the correct direction. When a concentration spell's duration ends, the **caster** stops concentrating and dnd5e's own cascade clears the effect from every target, rather than the target quietly losing the effect while the caster concentrates on nothing.
- Choice of deleting an expired effect or leaving it in place switched off. Only the active GM performs removals, so clients cannot race.
- Effect Names now handles concentration spells. A concentration spell's effect on a target has its origin set to the caster's concentration effect rather than the spell, so those were being skipped. It now follows that reference back to the spell.

## 0.6.0

- New rule: **Effect Names**. Names applied effects after the item that produced them, so casting Shield gives an effect called Shield rather than dnd5e's flavour name "Imperceptible Barrier".
- Includes a **Rename Existing Effects** button in the module settings, which converts effects already in the world rather than leaving it half converted. It covers world actors and unlinked tokens on every scene, confirms first, and reports a count.
- Conditions, concentration markers and enchantments are deliberately left alone. Items carrying more than one effect become `Item: Effect Name` so they stay distinguishable.

## 0.5.1

- Roll to Bonus effects are now named after the item that produced the roll, and carry its icon. Applying Shield used to create an effect called "imperceptible barrier", because the name came from `message.flavor`, which on a spell card is the spell's flavour text rather than its name.
- What the bonus actually does moved into the effect's description, so the name stays clean and matches the card while the detail is still one hover away.
- "Whoever made the roll" now uses dnd5e's own actor resolver, which handles the scene and token case properly instead of assuming the token is on the currently viewed scene.

## 0.5.0

- New rule: **Roll to Bonus**. Adds an Apply as bonus button to chat cards with a roll, turning the rolled number into a temporary bonus to AC, saves, a single ability's saves, checks, skills, attacks, damage or initiative.
- Durations: start of their next turn, end of their next turn, a round count, end of combat, or until removed by hand. Outside combat the turn-based options fall back to manual removal and the dialog says so.
- The rule runs its own effect expiry. Nothing on a stock Foundry 14 install removes an expired Active Effect, and the modules that normally do (Times-Up, DAE) stop at Foundry 13.999. Only the active GM performs deletions, so clients cannot race.
- Bonus values are written as " + 4" rather than "4", because dnd5e's bonus fields are formula strings and Foundry's ADD mode concatenates them. A bare number would turn an existing 1d4 bonus into 1d44.
- Renamed the stylesheet to `styles/tricky-homebrew-rules.css`, since it now covers more than one rule.

## 0.4.0

- New rule: **Max Healing**. Adds a Maximize button to the healing roll dialog, taking the maximum value instead of rolling. For potions drunk as an action, or any healing while Beacon of Hope is up.
- The button only appears when everything being rolled is healing, so it can never quietly maximize damage alongside it. The normal Roll button stays the default.

## 0.3.1

No changes to how the module behaves in play. Build and packaging only.

- `CHANGELOG.md` is now included in the release zip. It was left out because the workflow lists files explicitly.
- Workflow actions updated to releases that run on Node 24, since GitHub had started forcing the older ones off Node 20 and warning about it.

## 0.3.0

**Renamed from Tricky Critical Dice.** The module is now a collection of house rules rather than a single one, with Critical Dice as the first.

- Module id changed from `tricky-critical-dice` to `tricky-homebrew-rules`. Foundry treats this as a new module: re-enable it in your world, and its settings return to defaults.
- Restructured into a small core (`main.mjs`, `lib/`) plus one file per rule under `rules/`. Adding a rule means writing one file and listing it - nothing else needs to change.
- Rules are isolated from each other during setup, so one rule broken by a dnd5e update can no longer stop the others from registering.
- Settings renamed and regrouped under a master switch plus a per-rule switch: `Critical Dice: Maximize Best Dice`, `Critical Dice: Dice Maximized`, `Critical Dice: Apply to NPCs`.

## 0.2.3

- Upgraded dice now show the natural rolled value, struck through, in the bottom-left corner - so a die reading `8` with a small `2` shows at a glance that it actually rolled a 2.

## 0.2.2

- Upgraded dice now render in a brighter green than Foundry's normal "rolled max" green, so a maximized die is distinguishable from a die that honestly rolled its maximum at a glance.
- Removed the die-size label from the corner of upgraded dice.

## 0.2.1

- Upgraded dice keep their normal appearance again - the gold background and border are gone, so a die still looks like a die. Only the small ▲ pip is overlaid.
- Added a die-size label (`d8`, `d6`, …) to upgraded dice. The roll breakdown renders every die as an identical box, so a maximized 8 was indistinguishable from a 6 at a glance; now you can see which die was upgraded.

## 0.2.0

- Upgraded dice are now **replaced in place** rather than left alone with a flat bonus added beside them. A `4d6` crit that rolled `4, 6, 2, 5` now shows `6, 6, 6, 5` instead of `4, 6, 2, 5 + 6`.
- Upgraded dice are marked in the roll breakdown - gold highlight with a ▲ pip - so they're distinguishable from dice that genuinely rolled max (which Foundry highlights green).
- The natural value is preserved in the message data as `trickyCriticalFrom` on the die result, so a total can still be traced.
- Removed the "Tricky Critical" chat card section, now redundant.
- Note: because dice are edited before the roll is posted, Dice So Nice animates the upgraded values.

## 0.1.0

Initial release.

- On a critical hit, the two dice with the largest potential gain are maximized, pooled across every damage part of the crit.
- Selection is by gain (`faces − rolled`), not by lowest roll; ties go to the larger die.
- Normal crit dice doubling is unchanged - this applies on top of it.
- Dice are not rewritten: the real roll stays visible (including in Dice So Nice), and the upgrade is added as an explicit flat bonus that keeps its damage part's type.
- Chat cards show exactly which dice were upgraded and by how much.
- Skips dice that already rolled max, dice dropped by modifiers, subtracted dice, and healing rolls.
- World settings: master switch, dice count per crit (default 2), and whether NPCs benefit.
- Warns in console when dnd5e's own "Maximize Critical Damage" setting is also enabled.

# Changelog

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

# Changelog

## 0.1.0

Initial release.

- On a critical hit, the two dice with the largest potential gain are maximized, pooled across every damage part of the crit.
- Selection is by gain (`faces − rolled`), not by lowest roll; ties go to the larger die.
- Normal crit dice doubling is unchanged — this applies on top of it.
- Dice are not rewritten: the real roll stays visible (including in Dice So Nice), and the upgrade is added as an explicit flat bonus that keeps its damage part's type.
- Chat cards show exactly which dice were upgraded and by how much.
- Skips dice that already rolled max, dice dropped by modifiers, subtracted dice, and healing rolls.
- World settings: master switch, dice count per crit (default 2), and whether NPCs benefit.
- Warns in console when dnd5e's own "Maximize Critical Damage" setting is also enabled.

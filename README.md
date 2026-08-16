# Tricky Homebrew Rules

A collection of house rules for the Foundry VTT **dnd5e** system. Each rule is independent and has its own on/off switch, plus a master switch for the whole module.

| Rule | What it does |
| --- | --- |
| [Critical Dice](#critical-dice) | On a critical hit, the dice with the most to gain are replaced with their maximum. |

---

## Critical Dice

Normal crit behavior is untouched — the dice still double as usual. This rule applies on top of that, to whatever was rolled.

1. A crit rolls its damage dice as normal (doubled).
2. Every die from **every damage part** of that crit goes into one pool — weapon dice, a weapon's elemental dice, Sneak Attack, smites, all of it.
3. Each die's **gain** is `faces − rolled`.
4. The **two dice with the largest gain** are maximized. Two per crit, total — not two per damage part.
5. If two dice would gain the same, the larger die wins.

### Selection is by gain, not by lowest roll

This is the part worth being precise about, because the two are not the same thing.

Say a crit rolls `d12 → 5`, `d6 → 2`, `d4 → 1`:

| Die | Rolled | Maximized | Gain |
| --- | --- | --- | --- |
| d12 | 5 | 12 | **+7** ← picked |
| d6 | 2 | 6 | **+4** ← picked |
| d4 | 1 | 4 | +3 |

The d4 rolled *lowest*, but it is **not** upgraded — it has the least to gain. The d12 and d6 are, for **+11** total. Picking the two lowest rolls instead would only have been +7.

Smaller example: a `d6` rolls 1 and a `d8` rolls 2. The d8 is ranked first (2 → 8 is +6, beating the d6's 1 → 6 at +5). With only two dice in the pool, both are upgraded anyway.

### What is never upgraded

- Dice that already rolled their maximum — there's nothing to gain, and they won't waste a slot.
- Dice dropped by a modifier such as `kh` or a reroll — they don't contribute to the total.
- Subtracted dice, e.g. the `1d4` in `2d6 - 1d4` — maximizing those would make the damage *worse*.
- Healing and temp HP, which use the same underlying roll class in dnd5e but aren't what this rule is for.

### What it looks like at the table

The winning dice are **replaced in place**. A `4d6` crit that rolled `4, 6, 2, 5` becomes `6, 6, 6, 5` — the card reads as an ordinary, very good roll rather than a roll plus a bonus.

Upgraded dice keep their normal die shape and are marked two ways: they render in a **brighter green** than Foundry's normal "rolled max" green, and they carry a small **▲ pip** in the corner. Both matter — a maximized 6 would otherwise be indistinguishable from a 6 that honestly rolled, and the pip keeps that readable without relying on the colour difference alone.

The **natural rolled value** is also shown, struck through, in the die's bottom-left corner — a die reading `8` with a small `2` beneath it rolled a 2 and was upgraded. It's kept in the message data too (`trickyCriticalFrom` on the die result), so it survives a reload and a total can always be traced back.

Because dice belong to their own damage part throughout, damage typing is unaffected — a maximized fire die is still fire, and per-type resistances and immunities apply as normal.

**One consequence worth knowing:** the dice are edited before the roll is posted, so Dice So Nice animates the *upgraded* values. Nobody at the table sees the natural roll land.

### Settings

All world-scoped (GM-controlled).

| Setting | Default | What it does |
| --- | --- | --- |
| **Critical Dice: Maximize Best Dice** | On | Turns this rule on or off. |
| **Critical Dice: Dice Maximized** | 2 | How many dice are upgraded per crit, total across the whole crit. |
| **Critical Dice: Apply to NPCs** | On | When off, only player-owned characters benefit. |

### A note on "Maximize Critical Damage"

dnd5e has its own optional **Maximize Critical Damage** setting (Powerful Critical), which maximizes the base damage dice and reduces the crit multiplier to 1. That leaves far fewer *rolled* dice for this rule to work with, and the two stack into something neither of them describes.

If it's enabled, the module logs a warning to the console (F12) rather than silently fighting it. Pick one or the other unless you specifically want both.

---

## Requirements

- Foundry VTT v13 or v14
- dnd5e system 4.0.0+ (verified against 5.3.3)
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## Structure

```text
scripts/
  main.mjs              init/ready lifecycle, master setting, rule registry
  lib/
    constants.mjs       module id and title
    wrapper.mjs         defensive libWrapper registration
    settings.mjs        master + per-rule enabled checks
  rules/
    critical-dice.mjs   the Critical Dice rule
```

Each rule is one file exporting `{ id, registerSettings?, registerPatches?, onReady? }`, listed in `main.mjs`'s `RULES` array. Nothing else in the module needs to know a rule exists. Rules are run through a wrapper that isolates failures, so one rule broken by a dnd5e update can't stop the others from registering.

### How Critical Dice works

dnd5e builds every roll in three stages — `buildConfigure`, then `buildEvaluate`, then `buildPost`. The rule wraps **`buildEvaluate`** with libWrapper, the only stage where all of a crit's damage parts are already rolled but nothing has been posted to chat. That matters because dnd5e rolls each damage part separately, while this rule pools across all of them.

Once the wrapped call returns:

1. Bail unless at least one roll is a critical damage roll.
2. Walk every dice term in every roll, collecting each eligible result along with its gain.
3. Sort by gain (ties → larger die) and take the top two.
4. Rewrite each winner's result to its maximum face, recording the natural value and tagging it for styling.
5. Recompute the total of each roll that changed.

Step 5 is all that's needed because `DiceTerm#total` reads from its `results` array live — editing a result changes what that term contributes on its own; only the parent `Roll`'s cached total is stale.

Two smaller libWrapper patches handle presentation: `DiceTerm#getResultCSS` adds the highlight class, and `DiceTerm#getResultLabel` injects the struck-through original value. Both only act when this rule's own marker is on the die, so dice elsewhere in the game are untouched.

If anything in steps 1–5 throws, the error is logged and the roll is left exactly as dnd5e produced it — a bug here should never stop damage being dealt.

## License

[MIT](LICENSE)

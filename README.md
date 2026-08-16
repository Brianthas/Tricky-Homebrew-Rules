# Tricky Critical Dice

A Foundry VTT module for the **dnd5e** system. When a critical hit's damage is rolled, the two dice with the most to gain are maximized.

Normal crit behavior is untouched — the dice still double as usual. This rule applies on top of that, to whatever was rolled.

## The rule

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

## What it looks like at the table

The module **does not rewrite the rolled dice**. They roll for real and stay visible — if you use Dice So Nice, the 3D dice land on their natural values rather than silently showing the upgraded ones.

The upgrade is added afterward as an explicit bonus, and the chat card spells out what happened:

```
Tricky Critical
  d8: 2 → 8                    +6 fire
  d6: 1 → 6                    +5 slashing
```

So the card reconciles: the real dice in the tooltip, then the upgrade, then the total. If a number ever looks wrong, you can see exactly what the module did.

Each bonus keeps the damage type of the part its die came from, so per-type resistances and immunities still apply correctly when the damage is applied.

## Settings

All are world-scoped (GM-controlled).

| Setting | Default | What it does |
| --- | --- | --- |
| **Enable Tricky Critical Dice** | On | Master switch. When off, crits roll and total exactly as dnd5e normally would. |
| **Dice Maximized Per Critical** | 2 | How many dice are upgraded per crit, total across the whole crit. |
| **Apply to NPCs** | On | When off, only player-owned characters benefit. |

### A note on "Maximize Critical Damage"

dnd5e has its own optional **Maximize Critical Damage** setting (Powerful Critical), which maximizes the base damage dice and reduces the crit multiplier to 1. That leaves far fewer *rolled* dice for this module to work with, and the two rules stack into something neither of them describes.

If it's enabled, this module logs a warning to the console (F12) rather than silently fighting it. Pick one or the other unless you specifically want both.

## Requirements

- Foundry VTT v13 or v14
- dnd5e system 4.0.0+ (verified against 5.3.3)
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## How it works

The whole module is one file: [`scripts/tricky-critical-dice.mjs`](scripts/tricky-critical-dice.mjs).

dnd5e builds every roll in three stages — `buildConfigure`, then `buildEvaluate`, then `buildPost`. This module wraps **`buildEvaluate`** with libWrapper, which is the only stage where all of a crit's damage parts are already rolled but nothing has been posted to chat yet. That matters because dnd5e rolls each damage part separately, while this house rule pools across all of them.

Once the wrapped call returns:

1. Bail unless at least one roll is a critical damage roll.
2. Walk every dice term in every roll, collecting each eligible result along with its gain.
3. Sort by gain (ties → larger die) and take the top two.
4. Group the winners by which roll they came from, and append a flat bonus term to each of those rolls equal to its winners' combined gain, flavored with that part's damage type.
5. Recompute each modified roll's total, and record what changed on the pending chat message so the card can display it.

Appending a flavored flat bonus rather than editing dice results is the same technique dnd5e itself uses for Powerful Critical, so it stays on a path the system already supports.

If anything in step 1–5 throws, the error is logged and the roll is left exactly as dnd5e produced it — a bug here should never stop damage being dealt.

## License

[MIT](LICENSE)

# Tricky Homebrew Rules

A collection of house rules for the Foundry VTT **dnd5e** system. Each rule is independent and has its own on/off switch, plus a master switch for the whole module.

| Rule | What it does |
| --- | --- |
| [Critical Dice](#critical-dice) | On a critical hit, the dice with the most to gain are replaced with their maximum. |
| [Max Healing](#max-healing) | Adds a Maximize button to healing rolls, for potions and Beacon of Hope. |
| [Roll to Bonus](#roll-to-bonus) | Turns any rolled number into a temporary bonus to AC, saves, attacks and more. |
| [Effect Names](#effect-names) | Names applied effects after the item that produced them. |
| [Expire Effects](#expire-effects) | Removes effects once their duration runs out, including concentration spells. |

---

## Critical Dice

Normal crit behavior is untouched - the dice still double as usual. This rule applies on top of that, to whatever was rolled.

1. A crit rolls its damage dice as normal (doubled).
2. Every die from **every damage part** of that crit goes into one pool - weapon dice, a weapon's elemental dice, Sneak Attack, smites, all of it.
3. Each die's **gain** is `faces − rolled`.
4. The **two dice with the largest gain** are maximized. Two per crit, total - not two per damage part.
5. If two dice would gain the same, the larger die wins.

### Selection is by gain, not by lowest roll

This is the part worth being precise about, because the two are not the same thing.

Say a crit rolls `d12 → 5`, `d6 → 2`, `d4 → 1`:

| Die | Rolled | Maximized | Gain |
| --- | --- | --- | --- |
| d12 | 5 | 12 | **+7** ← picked |
| d6 | 2 | 6 | **+4** ← picked |
| d4 | 1 | 4 | +3 |

The d4 rolled *lowest*, but it is **not** upgraded - it has the least to gain. The d12 and d6 are, for **+11** total. Picking the two lowest rolls instead would only have been +7.

Smaller example: a `d6` rolls 1 and a `d8` rolls 2. The d8 is ranked first (2 → 8 is +6, beating the d6's 1 → 6 at +5). With only two dice in the pool, both are upgraded anyway.

### What is never upgraded

- Dice that already rolled their maximum - there's nothing to gain, and they won't waste a slot.
- Dice dropped by a modifier such as `kh` or a reroll - they don't contribute to the total.
- Subtracted dice, e.g. the `1d4` in `2d6 - 1d4` - maximizing those would make the damage *worse*.
- Healing and temp HP, which use the same underlying roll class in dnd5e but aren't what this rule is for.

### What it looks like at the table

The winning dice are **replaced in place**. A `4d6` crit that rolled `4, 6, 2, 5` becomes `6, 6, 6, 5` - the card reads as an ordinary, very good roll rather than a roll plus a bonus.

Upgraded dice keep their normal die shape and are marked two ways: they render in a **brighter green** than Foundry's normal "rolled max" green, and they carry a small **▲ pip** in the corner. Both matter - a maximized 6 would otherwise be indistinguishable from a 6 that honestly rolled, and the pip keeps that readable without relying on the colour difference alone.

The **natural rolled value** is also shown, struck through, in the die's bottom-left corner - a die reading `8` with a small `2` beneath it rolled a 2 and was upgraded. It's kept in the message data too (`trickyCriticalFrom` on the die result), so it survives a reload and a total can always be traced back.

Because dice belong to their own damage part throughout, damage typing is unaffected - a maximized fire die is still fire, and per-type resistances and immunities apply as normal.

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

## Max Healing

Adds a **Maximize** button to the healing roll dialog. It takes the maximum value instead of rolling the dice.

For a potion drunk as an action, or any healing while Beacon of Hope is up, where the rules say the recipient regains the maximum possible.

### Why a button and not automatic

Whether healing should be maximized usually depends on an effect sitting on the *recipient*, and the recipient is not reliably known at the moment the healer rolls. Detecting it would mean guessing from the current target, which quietly does the wrong thing whenever the healer forgets to target or targets more than one token.

A button puts the decision where the information actually is, with the person who knows Beacon of Hope is up.

### When the button appears

Only when **everything** being rolled is healing. If an activity rolls healing and damage together, the button is hidden rather than shown, because clicking Maximize on what looks like a healing roll should never silently maximize damage as well.

The normal Roll button stays the default, so pressing Enter still rolls as usual.

### You can tell it was maximized

A maximized roll would otherwise look exactly like one that honestly rolled its maximum, which makes it unverifiable after the fact. Cards produced this way carry a **Maximized** banner.

The marker rides on the roll itself rather than a separate message flag, so it survives a reload and stays with the card in the log.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Max Healing: Add a Maximize Button** | On | Turns this rule on or off. |

---

## Roll to Bonus

Adds an **Apply as bonus** button to any chat card carrying a roll. Click it, and the rolled number becomes a temporary bonus on whoever you choose.

Built for the Swords Bard's Defensive Flourish (spend Bardic Inspiration, add the die to your AC until the start of your next turn), Combat Inspiration, and any homebrew of the same shape: roll a die, add it to something, for a while.

It is deliberately generic. It knows nothing about which feature produced the roll, so it works for things no premade automation module has ever implemented, including whatever you invent next.

### Where the button appears

Only on cards that could plausibly be handing out a bonus. Left to itself the button would land on every roll in the log: attack rolls, skill checks, saving throws, weapon damage. Those are numbers you rolled, not bonuses a feature granted.

Two signals decide it, both already recorded by dnd5e on the message:

- **Attack rolls are always excluded.** A to-hit number is never the bonus being handed out, even when it came from a spell.
- **The item type.** A bare skill check or saving throw carries no item at all, which is what keeps them out. By default only features and spells qualify.

| Setting value | Button appears on |
| --- | --- |
| Features and spells only (default) | Feature and spell rolls, except attack rolls |
| Any roll from an item | Any roll produced by an item, except attack rolls |
| Every roll | Everything, including bare skill checks and saves |

A feature's utility roll, which is what Bardic Inspiration and its relatives are, comes through as a `generic` roll and qualifies under the default.

### Who gets it

The recipient defaults to your **targeted** tokens if you have any, then your **selected** tokens, then whoever made the roll. Most bonus dice are handed to someone else, so defaulting to the roller meant changing the dropdown nearly every time.

"Whoever made the roll" works even on rolls that carry no speaker. dnd5e posts a feature's utility roll with an empty speaker, so the actor is recovered from the item recorded on the message instead.

### What you can apply it to

Armor Class, all saving throws, a single ability's saves, ability checks, skill checks, attack rolls, damage rolls, or initiative.

### How effects are named

An applied bonus takes the name and icon of the item that produced the roll, so an effect sitting on a token lines up with the card that created it. Applying Shield gives you an effect called Shield, with the Shield icon.

What the bonus does goes in the effect's description rather than its name, so the name stays clean and the detail is one hover away.

### How applied bonuses are named

A bonus is named for its source *and* its effect, for example `Bardic Inspiration: Armor Class +1`.

The source alone is not enough, because the [Effect Names](#effect-names) rule also renames dnd5e's own effects after their item. Holding a Bardic Inspiration die and having spent one on AC would otherwise both read "Bardic Inspiration" and be impossible to tell apart on the token.

### How long it lasts

| Option | Ends when |
| --- | --- |
| Start of their next turn | The turn order reaches them again. This is what Defensive Flourish actually says. |
| End of their next turn | Their next turn finishes. Applied on their own turn, it runs through their following turn rather than ending immediately. |
| A number of rounds | That many rounds have passed. |
| End of combat | The encounter ends. |
| Until removed by hand | Never expires on its own. |

Outside combat there is nothing for a turn-based duration to count from, so the dialog says so and the bonus falls back to manual removal rather than pretending it will expire.

### It expires its own effects, and it has to

Nothing on a stock Foundry 14 and dnd5e install removes an expired Active Effect. dnd5e has no expiry handling and does not listen for turn changes. Foundry marks an effect as expired but neither deletes nor disables it, so the bonus would keep applying forever.

The modules that normally solve this, Times-Up and DAE, both stop at Foundry `13.999`. So this rule runs its own expiry off `combatTurnChange`, and only the active GM performs the deletions so several clients cannot race to remove the same effect.

### A note on how the bonus is written

dnd5e's bonus fields are formula strings, and Foundry's ADD mode concatenates strings rather than adding them. Writing a bare `4` onto an existing `1d4` bonus would produce `1d44`.

Foundry's roll grammar allows a leading additive operator, so the value is written as `" + 4"`. That concatenates safely onto an empty field and onto an existing formula alike.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Roll to Bonus: Apply Rolled Values** | On | Turns this rule on or off. |
| **Roll to Bonus: Where The Button Appears** | Features and spells only | Which cards get the button. |

---

## Effect Names

dnd5e's 2024 content gives spell effects flavourful names rather than the spell's name. Casting **Shield** applies an effect called **Imperceptible Barrier**. That reads nicely on a card and is useless when you are looking at a token trying to work out where a bonus came from.

This rule names applied effects after the item that produced them, so Shield gives you an effect called Shield.

It works in both directions:

- **New effects** are renamed as they are applied.
- **Existing effects** can be converted with the *Rename Existing Effects* button in the module settings, so a world does not end up half converted. It covers world actors and unlinked tokens on every scene, asks for confirmation first, and reports how many it changed.

### What it leaves alone

- **Conditions** such as Prone or Poisoned. They carry status ids, and renaming them to whatever inflicted them would lose information rather than add it.
- **Concentration markers**, for the same reason. dnd5e already names those after the spell.
- **Enchantments**, which modify an item rather than mark an actor.
- **Items with more than one effect.** Those would collapse into several identically named entries, so they become `Item: Effect Name` instead.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Effect Names: Use the Source Item Name** | On | Turns this rule on or off. |
| **Rename Existing Effects** | Button | Converts effects already in your world. GM only. |

---

## Expire Effects

Removes Active Effects once their duration has run out.

Nothing on a stock Foundry 14 and dnd5e install does this. Foundry works out that an effect is expired and exposes it as `effect.duration.expired`, but it neither deletes nor disables it, and dnd5e has no expiry handling of its own. The result is that a one round buff keeps applying for the rest of the session. The modules that normally fill this gap, Times-Up and DAE, both stop at Foundry `13.999`.

The rule checks on turn changes, on world time changes, when a combat ends, and once at startup to catch anything that expired while nobody was watching.

### Concentration

Concentration is handled the way the rules describe it, and the direction matters.

dnd5e already puts the concentration marker on the **caster**, and a concentration spell's effect on a target carries `flags.dnd5e.dependentOn` pointing back at it. So:

- **The caster loses concentration** and dnd5e removes the effect from every target. This already worked.
- **The spell's duration runs out**, and rather than quietly removing the target's effect and leaving the caster still concentrating on nothing, this ends the **caster's** concentration. dnd5e's own cascade then clears the effect from every target.

In both directions: you lose the effect, the caster loses the concentration, in one step.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Expire Effects: Remove Them When Time Runs Out** | On | Turns this rule on or off. |
| **Expire Effects: What To Do** | Delete it | Delete the expired effect outright, or leave it in place switched off. |

Only the active GM performs the removals, so several clients seeing the same turn change cannot race to delete the same effect.

**Concentration is always deleted, never disabled.** dnd5e works out whether someone is concentrating by looking for the concentrating status on their effects, and never checks whether the effect is disabled. Switching a marker off would leave the caster still prompted for concentration saves and still holding a concentration slot for a spell that had ended, so the delete-or-disable setting deliberately does not apply here.

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
    actors.mjs          world actors plus unlinked token actors
  rules/
    critical-dice.mjs   the Critical Dice rule
    max-healing.mjs     the Max Healing rule
    roll-to-bonus.mjs   the Roll to Bonus rule
    source-named-effects.mjs  the Effect Names rule
    expire-effects.mjs        the Expire Effects rule
```

Each rule is one file exporting `{ id, registerSettings?, registerPatches?, onReady? }`, listed in `main.mjs`'s `RULES` array. Nothing else in the module needs to know a rule exists. Rules are run through a wrapper that isolates failures, so one rule broken by a dnd5e update can't stop the others from registering.

### How Critical Dice works

dnd5e builds every roll in three stages - `buildConfigure`, then `buildEvaluate`, then `buildPost`. The rule wraps **`buildEvaluate`** with libWrapper, the only stage where all of a crit's damage parts are already rolled but nothing has been posted to chat. That matters because dnd5e rolls each damage part separately, while this rule pools across all of them.

Once the wrapped call returns:

1. Bail unless at least one roll is a critical damage roll.
2. Walk every dice term in every roll, collecting each eligible result along with its gain.
3. Sort by gain (ties → larger die) and take the top two.
4. Rewrite each winner's result to its maximum face, recording the natural value and tagging it for styling.
5. Recompute the total of each roll that changed.

Step 5 is all that's needed because `DiceTerm#total` reads from its `results` array live - editing a result changes what that term contributes on its own; only the parent `Roll`'s cached total is stale.

Two smaller libWrapper patches handle presentation: `DiceTerm#getResultCSS` adds the highlight class, and `DiceTerm#getResultLabel` injects the struck-through original value. Both only act when this rule's own marker is on the die, so dice elsewhere in the game are untouched.

If anything in steps 1-5 throws, the error is logged and the roll is left exactly as dnd5e produced it - a bug here should never stop damage being dealt.

### How Max Healing works

dnd5e already has the machinery. `BasicRoll#evaluate` forwards a `maximize` option into both its own `preCalculateDiceTerms` (which handles dice carrying modifiers) and Foundry's core evaluation. The rule is really just about getting that one option set on the right roll.

Three small libWrapper patches:

1. `_prepareButtonsContext` on the damage roll dialog appends the Maximize button when every roll is healing.
2. `_finalizeRolls` tags the rolls when Maximize was the button clicked. dnd5e hands the clicked button's `data-action` straight through with no validation against a known list, so a new button needs nothing else registered.
3. `DamageRoll#evaluate` sees the tag and passes `maximize: true` down.

## License

[MIT](LICENSE)

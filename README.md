# Tricky Homebrew Rules

A collection of house rules for the Foundry VTT **dnd5e** system. Each rule is independent and has its own on/off switch, plus a master switch for the whole module.

| Rule | What it does |
| --- | --- |
| [Critical Dice](#critical-dice) | On a critical hit, the dice with the most to gain are replaced with their maximum. |
| [Max Healing](#max-healing) | Adds a Maximize button to healing rolls, for potions and Beacon of Hope. |
| [Roll to Bonus](#roll-to-bonus) | Turns any rolled number into a temporary bonus to AC, saves, attacks and more. |
| [Effect Names](#effect-names) | Names applied effects after the item that produced them. |
| [Expire Effects](#expire-effects) | Removes effects once their duration runs out, including concentration spells. |
| [Auras](#auras) | An effect radiates to tokens within a radius and keeps up as they move. |
| [Self Effects](#self-effects) | A spell that can only target its caster applies itself, with no button to press. |
| [Effects Panel](#effects-panel) | What is running on the selected token, as icons beside the sidebar. |

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

### Passive effects on items

A class feature's passive effect lives on the item, not the actor, and transfers onto its owner. dnd5e still shows it in the actor's effects list, which is why a paladin's Aura of Protection reads "Protected" there.

Those are renamed too, but only on items owned by an actor. Owned items are copies, so this rewrites the character's own feature and never touches world or compendium content.

They never pass through effect creation, since they arrive as part of the item, so the **Rename Existing Effects** sweep is the only thing that converts them.

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

## Effects Panel

Select a token and what is running on it appears as a column of icons at the top right, beside the sidebar. The same idea as the panel pf2e ships, which dnd5e has no equivalent of: effects otherwise live on the character sheet, two clicks and a tab away from the table.

Just the icons. Hover one for its name, how long it has left, and what the cross will do. Click the icon to open the effect, or the cross in its corner to remove it, so removal is always the deliberate action rather than the accidental one.

The backdrop is mostly opaque on purpose. Foundry's faded panel style reads nicely over artwork but leaves the icons hard to pick out, and a status readout you have to squint at is one you stop checking.

### What counts as running

Only things happening **to** the creature, not the permanent kit that makes it what it is. Foundry's own `isTemporary` draws most of that line:

| Shown | Not shown |
| --- | --- |
| Shield, Bless, spell effects with a countdown | Jack of All Trades, Improved Critical, Remarkable Athlete |
| Concentration markers | Fighting styles, Draconic Resilience |
| An aura reaching the token from a spell, like Aura of Life | An aura from a permanent feature, like Aura of Protection |

An aura copy carries no duration of its own, so that test alone would call every one of them permanent. A copy is judged by the aura behind it instead: Aura of Life runs for ten minutes and belongs here, while a paladin's Aura of Protection is a permanent class feature and does not, even though the copy itself comes and goes as people move.

A setting switches the panel back to listing everything active, permanent features included.

### Where it sits

Inside `#ui-right-column-1`, the flex column that already holds chat notifications. That means it sits left of the sidebar and follows the sidebar being collapsed on its own, rather than this rule having to know the sidebar's width or watch for it changing.

### What the cross will not do for you

| Kind of effect | The cross does |
| --- | --- |
| An ordinary effect on the actor | deletes it |
| An effect granted by an item | switches it off, since deleting it would edit the character |
| A copy applied by an aura | there is no cross, and the hover says which token it radiates from |

An aura copy is owned by the Auras rule and would be recreated on the next pass, so a cross on one would visibly do nothing. It names the source instead, which is what you need in order to go and turn the aura off.

An aura that affects its own token leaves its owner holding the aura and a copy of it, under the same name and icon. The panel shows only one in that case. A copy radiating from somebody else still gets its icon, because "you have this because of that paladin" is worth knowing.

### Settings

Both are per person rather than per world, since this is about one player's screen.

| Setting | Default | What it does |
| --- | --- | --- |
| **Effects Panel: Show Effects Beside The Sidebar** | On | Turns the panel on or off. |
| **Effects Panel: Which Effects** | Only what is happening to it | Whether permanent features are listed alongside what is currently running. |

---

## Self Effects

A spell whose range is **Self** applies its effect to the caster the moment it is cast, with no Apply Effect button to press.

dnd5e posts a card and waits to be told who the effect goes on. For Shield or Mage Armor there is nobody else it could be, so the button asks a question with exactly one answer. Shield is the worst case, since it is cast in the middle of somebody else's attack roll.

### What counts as self

The **range** is the test, because that is the field that actually says so:

| Spell | Range | Applied automatically |
| --- | --- | --- |
| Shield | Self | yes |
| Aura of Life | Self, 30 ft emanation | yes |
| Bless | 30 ft, affects creatures | no |
| Shield of Faith | 15 ft, affects a creature | no |

Anything that targets other creatures keeps its button and its choice of target.

Emanations are centred on the caster but reach other creatures. The Auras rule spreads them from the caster's own copy, so including them is the default. A setting narrows it to spells that affect nobody else at all, for a game not using auras.

### It applies effects the way dnd5e does

The effect is created exactly as dnd5e's own button would create it, with the same `dependentOn`, `scaling` and `spellLevel` flags, and with its origin pointing at the concentration effect when the spell needs concentration. That is what lets dnd5e remove the effect when concentration breaks. Recasting refreshes the existing effect rather than stacking a second copy, matching what pressing the button twice does.

Only the client that cast the spell writes anything, so a spell cast once is applied once rather than once per connected player.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Self Effects: Apply Self-Targeted Spells Automatically** | On | Turns this rule on or off. |
| **Self Effects: Which Spells** | Also emanations | Whether emanations centred on the caster are included, or only spells that affect nobody else. |

---

## Auras

Turns any effect into an aura: it applies itself to other tokens within a radius, and keeps up as everyone moves.

Set one up with the **Aura** button on any effect's configuration sheet. Radius, who it reaches, whether walls block it, and whether it affects its own token.

If the effect is one the module recognises, the dialog pre-fills from the same table [Set Up Known Auras](#setting-up-official-auras-in-one-pass) uses, matching on the effect's name and then on the item it came from. It tells you when it has done so, because the table cannot know about level scaling: a paladin's aura widens to 30 feet at 18th level.

### Only the strongest applies

Two paladins radiating Aura of Protection grant one bonus, not two, matching 5e. The stronger wins, and walking out of the stronger one's range downgrades you to the weaker rather than dropping you to nothing.

Strength is worked out from the aura's own change values against the source actor's roll data, so `+@abilities.cha.mod` compares correctly between two paladins with no configuration. There's an optional override, and a per-aura switch for homebrew that is meant to stack.

### Numbers come from the source, not the recipient

A paladin's Aura of Protection is written as `@abilities.cha.mod`. Copying that formula to an ally would make the ally resolve it against their *own* Charisma, so everyone would quietly receive their own modifier rather than the paladin's.

References are resolved against the actor radiating the aura at the moment it is applied. Dice are left as dice, so an aura granting `1d4` is still rolled by whoever receives it.

### Seeing the range

An aura draws its reach on the token, measured from the token's **edge** rather than its centre, matching how "within 10 feet" is counted at the table. Drawn behind the token art, so a ring never obscures the creature standing in it.

Each aura also picks a **ring style**: solid, pulse, breathe, glow, or rotating dashes. The animation is a transform applied to the ring each frame, so nothing is redrawn while it moves.

These are drawn by this module rather than by the token's light. Foundry's light animations are properties of a light source, so using them would mean writing to `token.light`, which overwrites whatever torch or lantern the token actually carries and still counts as a light source in the scene's vision and darkness. A ring that decorates the token should not change what anyone can see.

Colour is set per aura in its Aura dialog. Left on **Automatic** it uses gold for auras that reach allies and red for those that reach enemies. Pick a colour instead when several auras overlap and you want to tell at a glance which ring is whose.

The ring has its own token HUD control, separate from the switch that turns the aura on and off. A permanent aura like Aura of Protection usually wants to keep running with its ring out of the way, so hiding the ring and disabling the aura are deliberately different buttons.

### One click on the token HUD

Selecting a token with auras adds a button to its HUD that turns all of them on or off at once. For an aura that is only sometimes running, like a spell you have just cast, that beats opening the sheet and hunting for the effect.

### How it works

The rule **reconciles** rather than tracking events. Any relevant change (movement, an effect appearing, a wall opening, combat starting) triggers one pass that recomputes which tokens should be inside which auras and creates or deletes the difference.

That is idempotent, which matters: a missed trigger corrects itself on the next one, instead of leaving a buff on someone who has walked away. It is also what makes "the strongest applies" free, since every pass recomputes the whole picture.

An aura effect never applies to the actor carrying it. Its changes are parked during data preparation and copied onto tokens in range as separate child effects, so the aura itself is a template. "Also affects its own token" then makes its owner an ordinary recipient like anyone else.

Distance uses Foundry's own grid measurement and the wall check uses its movement-collision test, so both respect whatever your scene is configured to do.

### Setting up official auras in one pass

The module settings have a **Set Up Known Auras** button. It finds auras that official content provides and configures them together, so you are not visiting each feature by hand.

Radius and reach come from a built-in table rather than from the item, because the item does not record them. Scanning a real world for items shaped like "self, 30 foot radius" turns up three detection spells for every genuine aura, and Aura of Protection has no range, target or activity at all: its ten feet exists only in the description text. Inference would configure the wrong things and miss the obvious ones.

Nothing is written until you approve the review screen, and radii can be corrected there. Paladin auras widen to 30 feet at 18th level, which the table does not track, so raise those before applying.

Homebrew auras are still set up individually from the Aura button on their effect.

### Known limitation

Only the **active scene** reconciles, because the wall check needs the canvas. Auras on a scene nobody is looking at do not update until it is loaded. In practice the GM is viewing the scene the combat is on.

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Auras: Apply Effects To Tokens In Range** | On | Turns this rule on or off. |

Per aura, on the effect itself: radius, reaches (anyone, allies, enemies), affects its own token, blocked by walls, only during combat, whether to draw the range ring and in what colour, stacks, and an optional strength override.

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
    auras.mjs                 the Auras rule
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

## Credits

The Auras rule was written after reading [Aura Effects](https://git.gay/roth-michael/Aura-Effects) by Michael Roth, MIT licensed, which solves the same problem. Two ideas are taken from its design: an aura effect parking its own changes so it acts as a template, and comparing the product of two tokens' dispositions to express "allies" and "enemies" in one test. The implementation here is independent and takes a different approach, reconciling state rather than reacting to region enter and exit events.

If you want a maintained, general purpose aura module, use theirs.

## License

[MIT](LICENSE)

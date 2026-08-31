# Changelog

## 0.17.0

- **An aura can now make the ground inside it difficult terrain.** Tick **Difficult terrain** in the Aura dialog and the area costs the extra movement, for whoever the aura's Applies to setting names. This cannot be done with an active effect: what a square costs to enter is decided by region behaviors, which read the token and the region and never look at the actor's effects. The rule creates a scene Region instead, an emanation attached to the emitting token, so Foundry moves it inside the token's own update rather than the module writing a new position on every step. It is created when the aura goes live and deleted when the aura stops.
- Regions are marked magical, so a creature that ignores magical difficult terrain ignores this, and they are visible only on the Regions layer, since the aura already draws its ring. Three limits: walls do not carve a notch out of the terrain the way they block the effect, a region cannot exclude its own emitter so an aura set to reach *anyone* charges its caster too, and dnd5e's behavior cannot be told to ignore a Secret disposition.
- **Conjure Minor Elementals is in the known-auras table**, at 15 feet, reaching enemies, with difficult terrain on. Only that half of the spell is automated: the extra 2d8 depends on the target being inside the emanation at the moment you hit, which no active effect change can express, so the ring answers it by eye and the item's own damage activity rolls it.
- **A concentration marker is no longer seeded as an aura.** dnd5e names it `Concentrating: <spell>` but sets its origin to the spell item, so the fallback match on the source item's name found it, and a remembered spell aura would have configured both the spell's effect and the marker. That gave one cast two auras, and wrote `showIcon: NEVER` onto the marker, taking the Concentrating icon off the caster's token while they were still concentrating.

## 0.16.1

- **Stunning Strike no longer stuns the monk.** Self Effects treated a range of Self as proof that the caster was the only possible recipient, and a range of Self is also what dnd5e writes on a feature that has no range of its own. Stunning Strike is a saving throw against a creature you just hit, with a range of Self, so its Stunned and Slowed effects were landing on the monk who used it. Three more questions are now asked before anything is applied: the activity must not resolve against another creature (no attack, save, check or damage roll), it must not name a target type other than Self, and any area it covers must be an emanation. In dnd5e 5.3.3's own content that is the difference between 70-odd wrong applications and none, covering every poison, most monster grapples, the 2024 smite spells and the breath weapons.
- **A cone or a line centred on the caster no longer counts as an emanation.** Burning Hands, Cone of Cold, Fear and every dragon's breath have a range of Self and an area, and the wider setting was reading all of them as reaching the caster. Only an emanation contains the creature it radiates from.
- Beneficial self effects are untouched: Shield, Blur, Mirror Image, Rage, potions, Aura of Life and the Detect spells all still apply themselves. The one deliberate loss is the 2014 Fire Shield, whose effects hang off a damage activity; it was applying both the warm and the chill shield at once, which is one more than the spell grants.

## 0.16.0

- **A spell's aura now comes back when the spell is recast.** An aura's settings live in a flag on the effect they configure, which is durable for a class feature, whose effect sits on the item and is never recreated, and useless for a spell: dnd5e builds the applied effect fresh from the item's copy on every cast, so the effect you configured is thrown away when the spell ends and the next cast lands a plain one. Configuring Conjure Minor Elementals, letting it drop and casting it again produced no aura at all, which read as the settings not having saved. Effects are now configured as they are created, from what this world knows about an aura of that name, so a known or remembered aura is live from the moment the effect exists. An aura that is already configured is never overwritten, including one deliberately switched off.
- The name is matched against the effect and against the item that produced it, following a concentration effect back to the spell the way the effect naming rule does, so a 2024 spell whose effect is called something flavourful is still recognised.
- **Configuring an effect that came from a spell pre-ticks Remember this aura**, and says why. That effect is a copy with no durable home, so the world's known-aura table is the only place its settings can survive to the next cast, and leaving it as an unticked box nobody had reason to notice is what made the original problem look like a bug.
- **Remember this aura now remembers the whole aura.** It stored only radius, reach and whether it affects its own token, so a remembered aura came back with a plain gold ring, walls back on and any strength override gone. Set Up Known Auras applies the stored settings the same way rather than rebuilding three of them from defaults.

## 0.15.2

- **Dialogs taller than the window now scroll instead of hiding their top half.** The Aura settings need around 940 pixels of window height, which most screens do not have once the browser's own chrome is out of the way. Foundry caps a dialog at the height of the window and clips whatever does not fit rather than scrolling it, so the rows above the cut could not be read, reached or corrected, and there was no way to fill the settings in and save them. The Aura settings, the per-aura on and off list, Set Up Known Auras and the Roll to Bonus dialog now cap their body and scroll it, which changes nothing on a screen where they already fitted.

## 0.15.1

- **Switching the Auras rule off now actually turns the auras off.** It stopped updating them but left every applied copy in place and every ring drawn, so a paladin kept granting saves with the rule disabled and no way to clear it but by hand. A borrowed token light was never handed back either. Whether the rule is on is now part of the single question of whether an aura is live, so turning it off tears down and turning it back on restores.
- The module master switch reaches the rules the same way, rather than leaving behind whatever was applied when it was turned off.

## 0.15.0

- **A startup check reports when Foundry or dnd5e moves something these rules reach into.** Most of these rules work by reaching into somebody else's code, and when one of those moves in an update the rule stops working without saying anything, surfacing mid-session as "why didn't that apply". Seven APIs are confirmed on load and a warning names the affected rules if any are gone. Silent when all is well.
- The competition between overlapping auras is now **testable and tested**: which of two paladins grants the bonus, ties broken the same way every time, stacking auras opting out, walls removing one aura and not the other. That logic was wrong once, granting both bonuses at once, and had no test because it reached straight for the canvas.
- **Your own auras can be added to the known table.** The Aura dialog has a **Remember this aura** switch: tick it and Set Up Known Auras will offer the same settings on any other character with that feature. The built-in table only covers official content, so homebrew previously meant configuring it by hand on every character that had it.

- Added a **test suite** covering the parts of the module that are ordinary logic: ring colours, effect naming, expiry, bonus formatting, aura liveness and light comparison. 39 tests, no Foundry required, run by CI on every push. Several of tonight's bugs came from two places deciding the same thing separately, which is exactly what a test pins down.
- Added a **localisation key check**, also in CI. Reintroducing the raw-key bug that shipped in 0.12.0 now fails the build and names the key and file. Keys assembled by transforming a value fail outright, since that is the shape that broke; keys reached through a prefix helper are reconstructed and checked.
- Ring style labels are written out rather than built by capitalising the style name, which is what caused that bug.

## 0.14.0

- **Individual auras can be switched on and off from the token HUD.** Clicking the aura button still flips everything, which is right for a paladin with one aura and too blunt for one also concentrating on a spell. Right clicking opens a list with a switch per aura, and the tooltip says so only when there is more than one.
- Deleting an aura's applied copies now re-checks that each still exists at the moment of deletion. dnd5e removes an effect's dependents when a concentration spell ends, so a copy can vanish between being listed and being deleted.

- **Paladin auras now widen at 18th level on their own.** Set Up Known Auras wrote a flat 10 feet, which someone would have had to remember to change mid-campaign. It now writes `10 + 20 * floor(@classes.paladin.levels / 18)`, which is 10 below 18th and 30 from 18th to 20th. The Aura dialog offers the same formula when configuring one by hand.

- **Auras now account for elevation.** They were measured purely on the flat grid, so a dragon hovering sixty feet up sat inside every aura on the ground and a paladin buffed an ally flying overhead. Foundry does the measuring once the waypoints carry a height, using the scene's own diagonal rule, so a token a hundred feet up is a hundred feet away.
- Height is read from the token's stored elevation rather than its animated one. Foundry animates a climb over several seconds, and reconciling against a value partway up never corrected itself afterwards, because animation frames are not document changes.

## 0.13.1

- Copies applied by an aura are now named after the token radiating them, so a paladin's sheet reads **Aura of Protection** for the aura and **Aura of Protection (from Paladin 2)** for the copy that actually grants the bonus. Two identically named passive effects gave no way to tell which was which, and editing the wrong one is what ended a concentration spell earlier.
- The Effect Names rule leaves those copies alone. It would otherwise rename them back after their source item on every pass, and the two rules would take turns undoing each other.

## 0.13.0

- Aura rings can now use **Foundry's own light effects**: emanation, dome, pulse, energy, vortex and the rest, with its coloration techniques. These are the shaders behind the prototype token light settings and look far better than a drawn circle.
- They emit no light and reveal nothing. `luminosity: 0` means no contribution to illumination, and a token light grants no vision at all, so a dark room stays dark and no terrain is uncovered. Verified against the created `PointLightSource` rather than assumed.
- **An aura never takes a light the token is actually using.** These lights emit nothing by design, so replacing a torch with one would leave a character dark in a dark room. A token carrying any light keeps it and the aura draws a ring instead; put the torch out and the aura picks the light up by itself.
- A token has one light, so the widest aura asking for one gets it and the rest keep drawn rings. The token's own light is stashed first and handed back when no aura needs it, and is left alone if it has been edited in the meantime.
- **An aura that is doing nothing no longer looks like it is.** A combat-only aura outside combat applied no effects, correctly, but still drew its ring and lit its token, which at the table reads as a buff that is running while nobody is getting it. Whether an aura is live is now decided in one place and honoured by the effects, the ring and the light alike.
- Drawn rings are unchanged and remain the default. Nothing touches a token's light unless a light effect is picked.

## 0.12.0

### Effects Panel, a new rule

- Selecting a token now shows what is running on it as a row of icons at the top right beside the sidebar, in the style of the panel pf2e ships. dnd5e keeps effects on the character sheet, two clicks and a tab away from the table.
- Icons only, with the name, remaining time and what the cross will do on hover. Clicking the icon opens the effect, so removal is always deliberate. An effect granted by an item is switched off rather than deleted, since deleting it would edit the character.
- Lists only what is happening **to** the creature: spell effects, conditions, concentration, and auras from spells. Permanent kit like Jack of All Trades, Improved Critical or a fighting style is left off, with a setting to include it. An aura copy is judged by the aura behind it, so Aura of Life is listed and a paladin's permanent Aura of Protection is not.
- A column at the right hand edge, on a backdrop solid enough to read the icons against artwork.
- A copy applied by an aura cannot be removed here, because the Auras rule would put it straight back. It names the token it radiates from instead. Where an aura affects its own token, only the aura is listed rather than the aura and its copy under the same name.
- Both settings are per person rather than per world.

### Self Effects, a new rule

- A spell whose range is **Self** now applies its effect to the caster on casting, with no Apply Effect button to press. Shield is the case that hurts, since it is cast in the middle of someone else's attack roll.
- Range is the test rather than a list of spell names, so Shield and Aura of Life apply themselves while Bless and Shield of Faith keep their button and their choice of target.
- Effects are created exactly as dnd5e's own button creates them, including the concentration link, so an aura still disappears when its caster loses concentration. Recasting refreshes rather than stacking.
- A setting narrows it to spells that affect nobody else at all, for a game not using auras.

### Auras

- An aura's range ring colour is now set per aura, in its Aura dialog. Left on **Automatic** it keeps the old behaviour, gold for auras reaching allies and red for those reaching enemies. Every aura configured before this update stays on Automatic, so nothing changes appearance until you pick a colour.
- Useful when auras overlap: two paladins both radiating to allies drew two identical gold rings, with no way to tell which was whose.
- The **Aura** button on a copy an aura applied now opens the original instead of configuring the copy. With "affects own token" on, the owner carries two effects of the same name, the aura and the copy of it, so choosing the wrong one was easy and the settings were silently discarded on the next pass. A copy is also no longer treated as a source, whatever flags it carries.
- Auras can now **animate**: solid, pulse, breathe, glow, or rotating dashes, chosen per aura. Each ring is its own display object with its own phase offset, so two auras on one token do not beat in lockstep, and the animation is a transform rather than a redraw.
- Deliberately not driven by the token's light. Foundry's light animations belong to a light source, so using them would overwrite the token's own torch or lantern and would still affect vision and darkness. A decoration should not change what anyone can see.
- Picking a colour turns **Automatic** off by itself. Leaving it ticked made the swatch a decoy: the colour was stored as empty and the choice silently disappeared. Ticking Automatic back on repaints the swatch with the colour it will actually use, so the two controls never disagree.
- **Set Up Known Auras configured nothing at all, and had not since it shipped in 0.10.0.** Foundry hands a dialog form back as flat keys, so a checkbox named `pick.0` arrives under the key `"pick.0"`, not as `pick[0]`. The apply loop read it as nested, found undefined on every row, and skipped all of them while still reporting success. Any aura that looked set up by it was in fact set up by hand.
- The **Aura** dialog now pre-fills from the built-in table of known auras when the effect is not an aura yet. Configuring Aura of Life by hand offered a generic 10 feet, even though the table knew it was 30, because only the bulk setup consulted it. It fills in reach and "affects its own token" too, so Spirit Guardians arrives set to enemies rather than allies, and says when the values came from the table so they get checked rather than trusted.

## 0.11.0

- Auras now draw their range on the token, measured from the token's edge rather than its centre, which is what "within 10 feet" means at the table. Rings are gold for auras reaching allies and red for those reaching enemies, and sit behind the token art so they never obscure the creature.
- A second token HUD control shows or hides the ring, separately from the switch that turns the aura itself on and off. A permanent aura usually wants to stay running with its ring out of the way, so those are different intentions and get different buttons.
- Also configurable per aura from its Aura dialog.

## 0.10.1

- Module settings are now grouped under a heading per rule. Six rules had put a lot of switches into one undifferentiated list. The grouping is derived from each setting's own name rather than a second hand-maintained list, so a rule adding a setting later lands in the right place on its own, and each rule's button sits with its switches instead of being pushed to the top with every other module button.
- New auras now default to reaching **tokens on the same side** rather than anyone in range. Nearly every aura in play buffs your own side, and an aura that quietly helps the enemy is a worse failure than one that needs widening. Existing auras keep whatever they were set to.

## 0.10.0

- New **Set Up Known Auras** button in the module settings. It finds auras that official content provides, such as Aura of Protection, Spirit Guardians and Crusader's Mantle, and configures them in a single reviewed pass rather than one at a time.
- The radius and reach come from a built-in table, because the data does not record them. A scan of a real world finds four items shaped like "self, 30 foot radius", of which three are detection spells rather than auras, while Aura of Protection carries no range, target or activity at all and its ten feet appears only in prose. Inferring would configure Detect Magic as an aura and miss the obvious one.
- Nothing is written until the review screen is approved, and every radius can be corrected there first. Paladin auras widen to 30 feet at 18th level, which the table does not know about, so those are worth raising before applying.

## 0.9.11

- **Fixed two paladins stacking each other's auras.** Standing together, each was receiving their own aura plus the other's, so a pair with +5 and +10 both ended up on +15 instead of +10. Introduced in 0.9.7: the owner stopped receiving a copy of their own aura, which quietly took their own aura out of the best-of comparison and let a weaker one from someone else pile on top.
- The owner receives a copy like any other recipient again, so every aura of the same name competes on equal footing. The duplicate icon that 0.9.7 was trying to solve is handled by hiding the source template's icon instead, since the copy already carries one.

## 0.9.10

- **The token radiating an aura shows its icon again.** Since 0.9.7 the owner benefits from the aura's own effect rather than a copy, and that effect never expires, so Foundry's default of showing icons only for temporary effects hid it. The one token with no sign of the aura was the one emitting it. An aura's effect is now marked to always show its icon, applied when it is configured and repaired automatically for auras set up earlier.

## 0.9.9

- **Applied auras are now refreshed, not just created and deleted.** A copy already sitting on someone was left untouched by every later pass, so it kept whatever it was given when it first landed. A paladin raising their Charisma, or any edit to the aura itself, never reached anyone already standing in it. Copies are now compared against what they should say and updated when they differ, which also means the 0.9.8 fix reaches auras that were applied before it.

## 0.9.8

- **Fixed auras handing out the recipient's own numbers instead of the source's.** A paladin's Aura of Protection is written as `@abilities.cha.mod`, and that formula was being copied verbatim onto everyone in range, so each ally resolved it against their own Charisma. A paladin with Charisma 30 granted an ally with Charisma 18 a bonus of +4 rather than +10. Actor references are now resolved against the actor radiating the aura at the moment the copy is made. Dice are left alone, so an aura granting `1d4` is still rolled by the recipient.

## 0.9.7

- **Fixed an aura showing two icons on its own token.** The owner carried both the source effect and a copy created for itself, one document each, one icon each. The owner is no longer given a copy: when an aura affects its own token the source effect simply applies, which is what it would have done anyway, and it is only neutralised when the owner is meant to be excluded.

## 0.9.6

- **Fixed auras applying a move behind.** Moving the token an aura was reaching did nothing, while moving the aura's owner updated it, and every result trailed the previous position. Both `updateToken` and `moveToken` fire when a movement is accepted rather than when it has arrived, and the document takes the length of the movement animation to catch up, measured at around 800ms on a single square step. Reconciling 100ms after the hook therefore measured from where the token used to be. Movement now waits on `Token#movementAnimationPromise`, which is what Foundry provides for this, with a timeout so a stalled promise cannot leave auras frozen.
- Other token updates such as disposition, visibility and size still reconcile immediately, since those take effect at once.

## 0.9.5

Two fixes to the Auras rule found in live testing.

- **Auras switched on and off at inconsistent distances.** Range was measured between raw pixel centres, which reads correctly only while both tokens sit neatly on the grid. Dropped off-grid, the same apparent distance measured 11.56 one way and 8.5 the other, so an aura would refuse to apply at what looked like 10 feet and then apply a step later. Distance is now measured between the grid spaces the tokens occupy, matching both the grid and how 5e measures. Every cell of a large token is considered, so a big creature reaches from its nearest square rather than its middle.
- **The source effect applied twice to its own owner.** Neutralising an aura effect by clearing its changes failed silently, because dnd5e exposes `changes` as a getter and it cannot be reassigned. The prepared array is a copy of the stored one, so it is now emptied in place instead.

## 0.9.3

- The Aura dialog now opens with "Radiate as an aura" already ticked for an effect that is not yet an aura. Opening it means the intent is to create one, and starting the switch off meant filling in radius and disposition, saving, and watching nothing happen.

## 0.9.2

- Fixed Effect Names doubling a prefix that was already there, turning `Draconic Resilience: Armor` into `Draconic Resilience: Draconic Resilience: Armor`. Content frequently names its own effects after the item already, and the rule prefixed them again without checking.
- The naming is now idempotent: leading copies of the item name are stripped before deciding, so a correct name recomputes to itself and a doubled one is repaired. Re-running the sweep fixes anything the previous version mangled.

## 0.9.1

- Effect Names now covers passive effects living on a character's own items, so a paladin's Aura of Protection reads as such instead of dnd5e's flavour name "Protected". These transfer onto the actor and show in its effects list, but were never renamed because they are not applied to the actor and never pass through effect creation. The sweep is their only route, and it now walks items as well as actors.
- Only items owned by an actor are touched. Owned items are copies, so this rewrites the character's own feature and never reaches world or compendium content.

## 0.9.0

- New rule: **Auras**. Any effect can radiate to tokens within a radius and keep up as they move. Configure it from the Aura button on an effect's sheet: radius, who it reaches, whether walls block it, whether it affects its own token, and whether it only runs in combat.
- Where two tokens radiate the same aura only the strongest applies, matching 5e. Strength comes from the aura's own change values, so two paladins with different Charisma compare correctly with no configuration.
- A token HUD button turns every aura on that token on or off in one click.
- Works by reconciling rather than tracking enter and exit events: each pass recomputes the whole picture and applies the difference, so a missed trigger corrects itself instead of stranding a buff on someone who walked away.
- Credits Aura Effects by Michael Roth (MIT) in the README for two ideas taken from its design.

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

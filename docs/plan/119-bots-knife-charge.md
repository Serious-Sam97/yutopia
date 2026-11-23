# 119 — The Strike Park: how many bots, the knife, the charge

Ask (2026-11-23, the user, after plan 118's two double checks): "Add a selector of the number of bots if the vortex
bots option is on. Copy CS on that. Also using the bomb and knife is bad and don't work. Let's plan."

Status: **planned 2026-11-23; forks decided by the user one by one 2026-11-23**: F1a the total of players with bots
filling (CS's quota), F2a CS's two knife attacks, F3a Blender models, F4a planting CS's way only (5, then the left
button held; E only defuses), **F5b no sign-offs** (straight through, stills at the end). Follows plans 114–118. The rule since plan 114 still
holds: third-person *gun* handling stays untouched. The knife and the charge aren't guns, so this plan gives them
their own holds. Nothing of CS's assets enters the repo: CS's numbers and flow, our own models and sounds.

## Where we are — tried in the game (2026-11-23, `e2e/zz-knifebomb119.mts`, `e2e/zz-bomb119.mts`, stills in the scratchpad)

**The bots.** The lobby terminal has one switch: "Vortex bots fill the teams", On or Off, plus the level (Easy–Expert).
On, `fillBots` (`world-server features/strike.ts`) fills every side to the mode's size (Competitive 5, Casual 10,
Wingman 2, Deathmatch 8, Arms Race 8, Retakes 4 v 3), people replacing bots. There's no way to ask for fewer, say
2 v 2 with bots in a Competitive match, or a lone bot to practise on.

**The knife (slot 3): it's the world's toy, not a weapon.**
- 3 sends `strike:knife`. The server puts the world's held item `knife` (`shared held.ts`, a *toy*: label "Combat
  knife") in the hand. So the world's held-item card "Combat knife · Put down" sits mid-screen through the match.
- In first person the hand holds a flat white slab in the toy grip, the fingers open, the blade back along the wrist.
  It doesn't look like a knife held to cut.
- No swing at all: the click sends `strike:stab`, the server judges it, and nothing in the hand moves, in 1P or 3P.
- One attack only (40 in front, 90 in the back, 1.8 m, every 0.5 s); no right-click stab. Two clicks 0.48 s apart gave
  one swing (the 0.5 s cooldown eats a click unseen).
- A swing that hits gives no feedback of its own (it goes through the gun's hit marker only when it lands).

**The charge (slot 5): there's no charge in the hand.**
- 5 only toggles a line, "The charge in hand · G drops it". The revolver stays in the hand, and nothing shows the
  charge, in 1P or 3P. The weapon strip shows 2 and 3 but no 5.
- **The left click with the "charge in hand" fires the revolver.** That's CS's planting button.
- Planting is **E held** on a site, the gun still raised. The server does plant it in ~3 s (`holdTick`: works, +$300).
  But the player doesn't kneel or stop, nothing is typed, and the "PLANTING" bar reads empty at half time.
- The carrier carries nothing visible on the back. The planted charge is `arena3d.ts chargeModel()`, a small
  procedural box with a blinking light.
- Defusing is E held at the charge: works, but again no kneel, no cutters, the gun up.

## What CS does (CS2, the numbers we copy)

**Bots.** `bot_quota N` with `bot_quota_mode fill`: N is how many *players* the match keeps, bots filling what people
don't. A person joining kicks a bot; leaving brings one back. `bot_add_t` / `bot_add_ct` / `bot_kick` add or drop one on
a side. Offline, the lobby shows the bot difficulty and the teams' size. Bots split evenly, the odd one to the side
with fewer people.

**The knife.** Slot 3, drawn in ~1 s, run speed 250 (the fastest: everything else is slower).
- Left: a quick slash, 40 on the first swing, 25 on swings straight after; 90 in the back. ~0.4 s apart; reach ~1.2 m.
- Right: a heavy stab, 65 in front, 180 in the back (always kills). ~1 s apart; reach ~0.9 m.
- Each swing has its own animation (left: a slash across, alternating sides; right: a thrust), and its own sounds
  (a whoosh, a hit on flesh, a hit on a wall with a spark and a mark).
- Inspect (F) turns the blade.

**The charge (C4).** Slot 5. The Raiders' one carrier wears it on the back; drawn with 5, it sits in both hands, a
keypad up.
- Plant: **left button held** inside a site, standing on the ground. The player stops (can't move) and crouches over
  it, typing a code on the keypad, beep by beep, for 3 s. Letting go, or being knocked off the site, stops it and
  starts it again.
- Planted, it beeps faster as its 40 s fuse runs; the round's timer becomes the charge's.
- After planting, the hand goes back to the last weapon.
- Defuse: E held at it, 10 s (5 s with a kit). The defuser kneels with the gun lowered; moving stops it.
- G with the charge in hand drops it; a dead carrier drops it.
- The HUD's slot 5 shows the charge; on the radar a mark shows where it lies.

## The plan (phases)

**0. Look.** Our own knife and our own charge, built in Blender like plan 79's guns (`tools/art/strike/`):
- the knife: a drop-point combat knife with a guard and a ridged grip;
- the charge: a block of charges strapped to a small box with a keypad, a screen and a light;
- the carrier's pack: a strap holding it on the back.

Rendered stills for the record (F5b: no sign-off), then exported as GLB beside the guns.

**1. The bot count.** CS's quota:
- In the lobby terminal, when bots are on, a stepper next to the level: "Players: 10" (CS's quota, fill), down to 1
  and up to the mode's full size.
- The server keeps `arena.quota` (on StrikeArena: 38 fields, under the 64 limit).
- `fillBots` keeps the match at that many players, splitting the bots evenly by CS's rule (the odd one to the side
  with fewer).
- Changed only before the match, like the mode. A team vote's kicked bot stays gone.
- Tested on the server: 4 players asked → 2 v 2 with me and three bots; someone joins → a bot leaves.

**2. The knife, a weapon of the park.**
- 3 draws the park's knife, no longer the world's toy: no held-item card, no "Put down".
- 1P: the GLB knife in the view model, held to cut (an overhand grip, the blade forward), with draw, idle and inspect.
- 3P: the same knife in the right hand, the arm low and forward (not a gun hold).
- HUD: slot 3 lit.

**3. The knife's two attacks.** CS's numbers: left 40/25 (90 back) every 0.4 s at 1.2 m; right 65 (180 back) every
1 s at 0.9 m.
- A click during the cooldown is kept and swung when it ends (no eaten click).
- Each attack has its own 1P and 3P animation (the slash alternating sides, the stab a thrust), seen by everyone.
- Sounds: whoosh, flesh, wall (a spark and a scratch mark).
- Run speed 250 with the knife out (CS's; the walker's park speed table).
- Bots: a bot in reach with its gun empty uses the knife's left (the brains already know `KNIFE`).

**4. The charge in the hand.**
- 5 draws the charge: the GLB in both hands in 1P, the keypad up; in 3P held at the chest.
- The gun is put away. Slot 5 shows in the weapon strip; 1/2/3/Q put it away (as plan 118's double check made them
  do).
- The carrier's pack shows on the back (3P, and to everyone) while it's carried and not in hand.
- G drops it, in hand or not (CS: G drops what's in hand; with the charge carried, the charge after the gun if chosen).

**5. Planting, CS's way.**
- With the charge in hand on a site: the **left button held** plants. The player is held still and crouched, the 1P
  hands type on the keypad, a beep per key, the bar filling over 3 s.
- Letting go stops it. Afterwards the last weapon comes back.
- The server checks the same as now (on a site, alive, on the ground, not moving), and refuses a plant from off the
  ground.
- E no longer plants (F4a): E is the Wardens' defuse and the hostages' only. The bots plant through the same server
  path as now.

**6. The planted charge and the defuse.**
- The planted GLB with the screen counting, the light and the beep quickening (the sounds of plan 115).
- Defusing: the defuser kneels, the gun lowered, the cutters out with a kit; the bar fills over 10 s or 5 s. Moving
  stops it (CS's).
- 3P shows the kneel to everyone.

**7. Words and checks.**
- How to play, the tutorial and the keys list say: 3 the knife (left slash, right stab), 5 then hold the left button to
  plant, E to defuse.
- e2e:
  - `strike.spec` grows a knife round (a bot stabbed from behind dies in one right stab) and a plant (5, left held, the
    charge planted, the revolver back).
  - The quota test runs on the world server.
  - Stills of the knife and the charge in 1P and 3P.
- The fp-guard and arms-feel specs stay green (no gun's handling changes).

## Forks

- **F1 the bot count's shape.**
  - (a) One number of players, bots filling (CS's `bot_quota` + `fill`), split evenly.
  - (b) A number per side (CS's `bot_add_t` / `bot_add_ct`), e.g. 2 Raiders v 4 Wardens.
  - (c) Both: the total, and an "uneven" switch that shows the two sides.
- **F2 the knife's attacks.**
  - (a) CS's two: left slash, right stab, CS's damage.
  - (b) One attack, as now, with an animation.
- **F3 the models.**
  - (a) Blender knife, charge and pack, as the guns were made.
  - (b) Procedural three.js pieces, refined.
- **F4 planting's input.**
  - (a) CS only: 5, then the left button held.
  - (b) CS's way, and E held still plants too.
  - (c) E only, as now, with the charge drawn and the kneel.
- **F5 sign-offs.**
  - (a) The knife and charge mocks shown before they're built into the game, the rest straight through.
  - (b) No sign-offs: all straight through, stills at the end.

## Built (2026-11-23, straight through: F5b)

| Phase | What | Where |
|---|---|---|
| 1 | The bot quota (F1a): "N players · k bots" stepper by the level, when bots are on; `StrikeArena.quota` (0 the mode's full size); `botsWanted` keeps the match at N, people first, each bot to the side with fewer players (a tie: the Raiders'), never past a side's size or a vote's empty place | world-server `features/strike.ts`, `schema.ts`; `StrikePanels.tsx` Quota; test "the bot quota" |
| 0 | Our own knife, charge and pack in Blender (F3a) — `tools/art/strike/gear.py` → `public/life/strike/gear.glb` (three nodes; the charge's `screen` and `led`) | loaded by the view (`tp/view.ts lifeGear`), lit as the guns are |
| 2–3 | The knife a weapon of the park, not the world's toy (no held card; `HELD` from "strike" hides it). CS's two attacks (F2a): left 40 / 25 chained / 90 back every 0.4 s at 1.55 m; right 65 / 180 back every 1 s at 1.2 m; through no wall; armour as CS's (85 % through); each swing sets the next's earliest time; a click in the wait swung when it ends, a held button swings on. Sounds: whoosh (the stab's lower), flesh, a wall's scrape | server `strike:stab {heavy}`; `strike.ts onGearMouse / knifeFrame`; `sound.ts slice / scrape`; test "the knife" (65 in front, a kill in the back) |
| 2–3 | Hands: the body's own gear pass (`person3d strikeHands`) — the knife in a closed fist (the torch's grip and hold shape), the slash across (sides alternate) and the stab's thrust, seen by everyone (`strike:boom` swing says whose); first person's arms hold it CS's way (fist high, blade laid across) | `tp/person3d.ts`, `strike/flag.ts swings` |
| 4 | The charge in the hand: 5 → `strike:charge` (the server's `held = "charge"`, the gun away); in both hands before the chest, the keypad tipped up; slot 5 in the weapon strip; 1/2/3/Q, a plant, a drop put it away (the server clears it once it's not mine); the carrier's pack on the back (people and bots) | server `strike:charge`; `person3d`; `strike.ts gearFrame` |
| 5 | Planting CS's way (F4a): the charge drawn, on a site, the left button held — crouched and held still (walker `holding`), the bar filling over `ROUND.plant`; let go: it stops; planted: the last gun back. E never plants (the server refuses a carrier's use without `plant` and the charge drawn); the range's pad drill too | server `strike:use {plant}`; test "the charge"; `strike.ts plantStart / plantStop` |
| 6 | Knelt over the charge planting or defusing (people and bots: `view.ts strikeKneel`), the hands at it — typing while planting; the planted charge is the model (its light blinking on its own material) | `tp/view.ts`, `person3d`, `strike.ts drawCharge` |
| 7 | Words: How to play (3 then the mouse, 5 then left held, E defuses), the tutorial, the HUD's lines | `StrikePanels.tsx`, `tutorial.ts`, `strike.ts` |

Checks: shared 860, client 477, world-server strike 9 (the quota, the charge's CS plant, the knife's front and back) +
schema; stills `e2e/zz-gear119.mts` (the pack, the knife idle/slash/stab from beside, the charge held and knelt over,
first person), `e2e/zz-knife119.mts`.

### The leftovers, done (2026-11-23)

| Was left | Now |
|---|---|
| A bot never took out its knife | someone at arm's length while its gun's empty or reloading: the stab if they're close enough, else the slash (the brain's `out.stab`, the server's one `knifeSwing` for people and bots alike); its knife drawn in its hand a moment (its NPC's mood) and swung for all to see. Rare, as CS's: the lab's 12 matches gave one close fight, 13 swings (`LabResult.stabs`) |
| First person planting showed no hands | the charge held low before me, the left hand on it, the right's fingers going over the keypad key by key (`person3d` the arms' kneel); defusing keeps the gun as CS's view model does; the planting and defusing bars moved up off the hands |
| The knife on a wall left no mark | a cut where the blade met it — the slash a long thin one along the wall, the stab a short upright one (`strike.ts knifeMark`, a stretched mark turned onto its line); the swing's `yaw` sent for it |
| Bots' gear unseen | stills: a bot carrying the charge (its pack), a bot knelt planting; and defusing from beside (`e2e/zz-bots119.mts`, `zz-defuse119.mts`, Retakes with no bots) |

Not checked: a real browser holding the pointer (the app's browser pane was hidden — a hidden page draws no frames —
and the headless one refuses the lock); the user's test.

### Feedback: "the arm's the wrong way round with the knife" (2026-11-23)

The fist took the knife in the torch's thumb-forward place, which turned the wrist over: the arm hung straight down
and back, the palm up under the grip. Now the fist is turned a half turn round the grip (`person3d KNIFE_ROLL`) and
the knife turned back by the same in the hand, so it still points and cuts the same way. The knuckles are up, the
thumb is over the grip and the elbow bends below. Checked from beside, in first person, mid-slash and mid-stab
(`e2e/zz-knifearm119.mts`, the two ways side by side first).

### Feedback: four more bugs (2026-11-23)

| The user's | Cause | Fixed |
|---|---|---|
| Dead, you can still shoot | the dark's press and the server's `arms:fire` never asked the park whether the shooter was still in the round | `strikeKeys.dead`: the press ignores the click; the server drops a dead member's shot (`features/arms.ts`) — checked: dead, three clicks, no `arms:fire` sent |
| The way you look on the map is wrong | the radar's arrow took the view's `yaw` — the camera's orbit angle, not where it looks | the camera's own look direction (the world's x and z are the map's; +z down the radar): looking +x it points right, +z down |
| The charge drawn, then reloading or taking out a gun: the charge in your face | 2 drew quick slot 1, but with no rifle the pistol is in slot 0: nothing came out, the charge stayed up, in first person a big block across the screen's bottom | 1 and 2 draw the primary and the pistol wherever their slots are (`arms.slotOf`); the charge in first person further out, lower right, the keypad to the eye; when I carry it the radar's charge glyph no longer covers my arrow |
| Dead, you can still move lying down | the walker only froze for a fall, a hold, an admin | dead in the match counts as frozen (`walker.ts`) — checked: W and D, 0 m moved |

### Feedback: reloading with the charge carried showed it on screen (2026-11-23)

The pack was hung on first person's arms too (they're a copy of the body), behind the shoulders; a reload swings the
arms and tips the view enough to bring it in. The pack is now only on the body others see (`person3d`,
`this.part === "all"`). Checked: the charge carried, the revolver fired and reloaded — four stills through the reload,
no charge in any.

### Feedback: out mid-match, back stuck on the map (2026-11-23)

Leaving by the match menu puts you in the lobby yard (`toLobby`); closing the page or losing the line didn't, and the
room brings you back where you were — on the arena, with no match of yours (the map maybe swapped since): stuck. The
park now does the same on the way back in: its `join` and `back` hooks put anyone not in its match, found on the
arena, by the desk. A line dropped and back in time is still in its match and stays where it is. Test: "out mid-match
by closing the page, back later".

### Feedback: a roof on the lobby — the rain fell all over it (2026-11-23)

The lobby's buildings were dry already (town buildings: their roofs are the rain's), but the yard between the inner
wall and the gate, where everyone waits, was open sky. It has a roof now (shared `STRIKE_YARD_ROOF`, `arena3d.ts
yardRoof`): steel trusses every 8 m from wall to wall on posts set in the parapets, 3.2 m over the gallery's walkway
(none over the gate or the team doors), purlins along, translucent sheets — the yard keeps its daylight. Its box is
one of the rain's and the snow's roofs (`grounds-stream.ts`, `open`: the camera free under it), so no rain falls and
no snow settles under it. Stills in a forced rain: along the yard, from the gallery, from outside the gate.

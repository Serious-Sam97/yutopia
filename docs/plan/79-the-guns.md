# 79 — The guns

Ask (2026-11-11): "The weapons mechanic is poor … Redo the animations (the animations are horrible, the
weapon sight is shit and misplaced). Rethink the position of the weapon and camera (we probably gonna go
Alan Wake 2 style). Create the weapons' models using Blender to replace ours. Add more weapons (AK-47,
sniper and BFG). Fix one thing: right mouse click only focuses with the lantern if we have it equipped, if
not, don't anymore." References: Alan Wake 2 and Resident Evil 5.

Status: **planned 2026-11-11**. Forks decided 2026-11-11: the recommendations, all ten — F1a the AW2
shoulder camera whenever a gun is out (no swap key), F2a walk while aiming, F3a guns third-person only
(the sniper's scope the one first-person view), F4a scripted Blender models, F5a keyed clips on the bench
with a recoil layer, F6a the torch held with the gun, F7 **the Daybreak**, F8a the right button focuses
only a torch already on, F9a the AK in the lockers / the sniper in the hunting bag / the Daybreak from
Spawn, F10a four quick slots. Phase 1 (the right button) built; phase 0 mocks delivered (second round: the camera closer, the guns
detailed; the revolver and the double-barrel redesigned after AW2's), signed off 2026-11-11 (the long guns held where the arms reach); phase 2 (the camera, the reticle) and phase 3 (the two guns' models in the game) built 2026-11-11; phase 4 built and signed off 2026-11-12 ("look fine for now"); phase 5 (the AK-47) built and signed off 2026-11-12; phase 6 (the sniper) built and signed off 2026-11-12; phase 7 (the Daybreak) built and signed off 2026-11-12; phase 8 (checks) built and signed off 2026-11-12; phase 9 (the sounds) built and signed off 2026-11-12 — picked by the user's ear; **plan 79 done**; F11a (the speedloader) and F12a (both shells out) decided 2026-11-11. Follows plan 32 (the arms: the
rules, kick, bloom, falloff, heads), plan 30 (the dark: light is the weapon), plans 58/77/78 (the body,
its moves, its hands) and plan 73 (the life look).

## Where we are — read from the code

- **Two guns** (`shared/dark/arms.ts` `ARMS`, `shared/inventory.ts` `WEAPONS`): the revolver (6 rounds,
  50 a hit, 40 tiles, 0.42 s a shot, a loading gate: a round at a time) and the double-barrel (2 shells,
  8 pellets × 18, 14 tiles, broken open to load). The shadowed have 250 hp behind a 100 shield a focused
  beam burns at 60/s (`dark/fsm.ts` `SHADE`): ~1.7 s of light, then five revolver shots (three to the head).
  The server checks the rate, the hand, the muzzle (`MUZZLE_REACH`), rewinds the targets, casts the
  pellets from a shared seed (`world-server/features/arms.ts`). This part is good and stays.
- **The models** (`tp/guns3d.ts`, plan 32): drawn in code — extruded side profiles, turned barrels,
  vertex colours tuned for the old Lambert/stylized light. **Plan 73 never reached them**: in a life-look
  hand they're the last things in the world still in the old look.
- **The hold** (`chars/moves.ts` `aimPose`, `chars/anim/night.ts` `aim2`, `reload2`):
  - aiming with a gun lifts both arms by `ADS_UP` "so its sights come to the eye" — a first-person idea
    used in third person: **the gun sits in front of the face**, over the line the camera looks down, and
    the hands' IK target is a fixed point 1.42 m up, 0.5 m out, whatever the gun;
  - not aiming, the gun hangs in the right fist like a phone — there's no ready stance;
  - **one reload for both guns** (the left hand to the hip pocket and back, in a 0.95 s loop) — the
    revolver's gate and the double-barrel's break are only in the gun's own parts;
  - drawing is a time on the server (0.35 s), not a move: the gun pops into the hand; no holster, no
    sprint-with-a-gun, no dry fire, no hit or dodge holding it;
  - the torch's left hand and the gun's fore-end share one grip (`hL`), so with the torch on and a
    double-barrel, the light points nowhere the gun does.
- **The camera** (`tp/view.ts`): centred behind you until you aim; aiming pulls it to
  `min(dist, 2.6)` m, 0.8 m over the shoulder, 0.35 m up, FOV 50 → 42 — the same for every gun. Only the
  move sandbox can swap the shoulder (`tp/move/sandbox.ts`); in the world it's always the right (Y swaps
  first/third person). A shot kicks the camera's pitch and yaw. **First person** has its own gun: down the sights
  (`tp/hands1p.ts`, FOV × 0.82).
- **The crosshair**: four CSS ticks that open with the spread (`dk-cross`), hidden down the sights.
- **The right button** (`dark/arms.ts:455–466`): with no gun, held a quarter second, it **switches the
  phone's torch on** and focuses it, off again when let go — whether you'd switched it on or not. With a
  gun it aims, and the torch focuses only if it's on (`beamOf` while `MV_AIM`). There's no lantern item:
  plan 56 said the lantern would become a pocket item "in plan 57", which was never written; it's L.

## The idea

**The gun and the light are one tool, held like a person would hold them.** Alan Wake 2's way: the camera
sits over the right shoulder whenever a gun is out, the body on the left third of the screen, the gun low
and ready; aiming brings the camera in and the gun up to the shoulder's line (never in front of the face),
the torch along it, focused by the same button. Every gun is a real object, made in Blender in the life
look's materials, with parts that move; every thing you do with it is its own move — draw, ready, aim,
fire, its own reload, sprint carrying it, put it away.

## Forks — all decided 2026-11-11 (the recommended column)

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| F1 | The camera | **a)** AW2: tight over the right shoulder whenever a gun is out, in closer on aim (AW2 has no shoulder swap) · **b)** RE5: centred till you aim, then to the shoulder · **c)** keep today's, retuned | **a**; a shoulder-swap key as an extra, if you want one |
| F2 | Moving while aiming | **a)** AW2: walk while aiming (about half speed), no sprint · **b)** RE5: the feet planted to aim (Capcom's choice, for tension) | **a** (the walker already mixes aim with the legs) |
| F3 | First person and guns | **a)** guns are third-person: a gun drawn in first person goes over the shoulder; the sniper's scope is the one first-person view; plan 32's down-the-sights goes · **b)** keep down-the-sights in first person too, rebuilt on the new models and clips | **a** (half the work and AW2 has none) |
| F4 | The models | **a)** scripted in Blender (`bpy`, like `tools/art/life/build_plant.py`): ours, rebuilt by one command, life-look materials, the moving parts named the way the moves need · **b)** CC0 / CC-BY downloads, rigged by us (the plan 75 credits list) | **a** |
| F5 | The animations | **a)** keyed clips on our rig on the bench (`/dev/anim`, as plans 58/77/78), the hands on each gun's own grip points from its model, a procedural recoil layer on top · **b)** motion capture / Mixamo, retargeted — no pipeline, and our rig's joints aren't Mixamo's | **a** |
| F6 | The light with a gun | **a)** AW2: the torch in the left hand under the handgun (the wrists crossed, back to back); with a long gun the left hand holds the fore-end and the torch along it · **b)** a light mounted on every gun | **a** |
| F7 | The big gun | It can't be Doom's BFG (the name and the look are id Software's). **Ours:** a light cannon — the dark's own rule, light is the weapon: it charges ~1 s and fires a slow ball of light that **burns every shield it passes** and bursts where it lands. A name: **the Daybreak** · the Sunburst · the Lighthouse · yours | **the Daybreak** |
| F8 | The right button with no lantern | **a)** "equipped" = the torch switched on (L): the right button focuses it; switched off, it **no longer switches it on** — with no gun and no light, it does nothing in the dark · **b)** the lantern becomes a real item (plan 56's promise): in a hand slot to focus, L goes · **c)** AW2's way: aiming never focuses, a button of its own does (AW2: RB / the mouse wheel) | **a** now (phase 1, small); **b** or **c** later if you want them |
| F9 | Where the new guns come from | **a)** the AK in the supply lockers (rare), the sniper in the hunting bag (rare), the Daybreak only from the admins' Spawn at first · **b)** all three in the caches · **c)** Spawn only | **a** |
| F10 | Quick slots (4; weapons go only there) with 5 guns | **a)** keep 4: you choose what you carry · **b)** 5 | **a** |
| F11 | The revolver's reload, now it's a double-action with a swing-out cylinder (the redesign, after AW2's) — **decided 2026-11-11: a** | **a)** AW2's: swing out, dump all six, a speedloader (all six in, ~1.6 s; the live rounds dumped go back to the pockets) · **b)** today's rule: swing out, a round at a time (0.35 s each, a shot stops it) | **a** |
| F12 | The double-barrel's reload — **decided 2026-11-11: a** | **a)** AW2's: both shells come out, even the live one (it goes back to the pockets) · **b)** plan 32's: only the fired ones | **a** |

## The guns

Numbers are a first proposal, set against the shadowed's 250 hp behind a 100 shield; tuned on the bench and
in the dark (phase 8).

| | Revolver | Double-barrel | AK-47 | Sniper | Daybreak |
| --- | --- | --- | --- | --- | --- |
| Holds | 6 | 2 | 30 (a magazine) | 5 | 3 cells |
| Fires | 0.42 s, single | 0.95 s, a barrel a pull | **full auto**, 0.1 s (600 a min) | bolt: 1.3 s between | charge 1.0 s, 2.5 s between |
| Damage | 50 | 8 × 18, falling off past 5 | 22 | 170 (×1.5 head: 255, a kill once the shield's gone) | burst 300 in 3 m, to 0 at 6 m; burns shields within 5 m of its path |
| Range (tiles) | 40 | 14 | 50 | 120 | flies 40, 14 tiles/s |
| Spread | tight, blooms | wide | tight first round, climbs fast | huge from the hip, ~0 scoped and still | — |
| Reload | swing out, dump all six, a speedloader (~1.6 s; the live rounds back to the pockets) | break, both shells out (the live one back to the pockets), a shell at a time, shut | the magazine out and in (2.2 s); empty, the charging handle too (2.8 s) | the bolt back, a round at a time, the bolt home | a cell out, a cell in (2.0 s) |
| Ammo | `r38` (stack 24) | `shell` (12) | **`r762`** (60) | **`r308`** (15) | **`cell`** (3) |
| Look | after AW2's (redesigned 2026-11-11): a double-action .357, 4-inch — vent rib, full underlug, red-insert ramp sight; worn nickel, walnut target grips | after AW2's: a hammerless side-by-side boxlock — round-bodied engraved silver action, blued barrels, semi-beavertail fore-end, semi-pistol walnut stock, thick rubber pad | stamped receiver, wood furniture, curved steel magazine | bolt-action, synthetic stock, a scope | ours: a heavy lamp of a gun — a glass core, cooling fins, warm white glow |

The rules (shared + server), on top of plan 32's:

- **Full auto**: each round is still its own `arms:fire` (the server's rate check, bloom and rewind work
  as they are); the shooter holds the button, the client sends at the gun's rate. The kick climbs and
  walks a little sideways (seeded), the bloom grows per round.
- **The bolt and the magazine**: `ARM` gets `bolt` (the sniper's cycle: no shot till it's home) and
  `mag` (the AK's magazine out); a magazine reload is all-or-nothing (cut short, nothing's in), the
  rounds left in the old magazine come back to the pockets.
- **The scope**: `Stance` gets `scope` (near-zero spread, still and scoped); the server knows it from the
  `mv` bits as it knows aiming. Holding breath (Shift, scoped) steadies the sway for 3 s, then it's worse.
- **The Daybreak's ball** is a projectile on the server, like a flare (`flareFlight`): a straight flight
  from the muzzle, stopped by walls and trunks, a `state.orbs` entry everyone draws; it burns the
  shadowed it passes (as a focused beam, ×3) and its burst does the damage. Against one of us: plan 30's
  half (`PVP`).

## The camera and the screen (F1–F3)

- **A gun out, not aiming**: the camera tight over the right shoulder (~0.5 m right, ~1.5 m back — the
  user's call 2026-11-11, closer, as AW2 and RE5), the body on the left, the look line clear of the head.
  Put away, it eases back to centred.
- **Aiming**: in to ~0.95 m, ~0.45 m right, at the head's height — the head and right shoulder big on the
  left of the picture; mostly by distance, the FOV only a little (50 → 46:
  big FOV swings make people sick); the ease per gun (revolver 0.18 s, shotgun 0.26 s, AK 0.24 s, sniper
  0.3 s then the scope); the offset blended in the picture's plane so you never leave the frame.
- **The sniper's scope**: first person through the glass, 4× and 8× (the wheel), a dark ring round it, the
  sway in the picture; the reticle is the scope's. Working the bolt drops you out of the scope and back in
  (RE5's S75 does this).
- **The reticle**: AW2-like — a small dot, four short ticks opening with the real spread (`spreadOf`, the
  same as the server's), shown only while aiming; a mark on a hit, a brighter one on a head.
- **Where the shot really goes** (the misplaced sight): over the shoulder the muzzle isn't the camera, so
  something just in front of the gun can stop a shot the crosshair says is clear. The shot goes from the
  muzzle to the point the screen's centre meets; when the muzzle's line meets something first, **the
  reticle moves to where it'll hit and shows it's blocked**. The server takes the ray as today.
- **The kick** splits in two, as plan 32 meant: the camera's (small, mostly recovered) and the gun's own in
  the hands (bigger, its own spring), per gun.

## The hold and the moves (F5, F6)

Every gun has its **grip** (the right hand), its **fore** (the left hand, or the torch), its **sights**, its
**muzzle** and its **ejection port** as points in its model; the hands go to them (plan 78's hand library
for the fingers: a pistol grip, a trigger finger on the guard or the trigger, a fore-end cup, the torch).

| Move | Handguns | Long guns |
| --- | --- | --- |
| Ready (not aiming) | low ready, both hands, the muzzle ~40° down | AW2's: in the right hand alone, the stock under the arm, the muzzle down ahead — the left hand holding the torch |
| Aim | arms out at the shoulder's line, the gun under the eye line (not in front of the face); with the torch: wrists back to back, the light along the barrel | the stock in the shoulder, the cheek on it, the left hand on the fore-end (with the torch) |
| Draw / put away | from the hip, 0.35 s / 0.25 s | from the back, over the shoulder |
| Fire | recoil per gun (the revolver's muzzle flip; the shotgun rocks the shoulders; the AK's climb; the sniper's push and the bolt) | |
| Reload | revolver: the cylinder swung out, the rod punched (all six out), the speedloader in and twisted, the cylinder shut · Daybreak: a cell out, a cell in | double-barrel: break, both shells out, shells in, snap shut · AK: magazine out, the new one rocked in, the charging handle when empty · sniper: bolt back, rounds thumbed in, bolt home |
| Moving | walking, aiming: the upper body held on the look, the legs walking under it | |
| Sprint | the gun tucked to the chest | across the chest (port arms) |
| Dodge, hit, fall | the gun kept in the hand through the roll, the stagger, the getting up | |
| Dry fire | the click, a look at it | |

Others see the same moves (`Player.arm` gets the new states; the clips play from it, as now).

## The models (F4)

- `tools/art/guns/build_guns.py` (`blender -b --factory-startup -P … -- --gun <id>`), seeded like the plant
  and the people; writes `apps/client/public/life/guns/<id>.glb` and `<id>-far.glb`; a `build_all.sh`
  entry.
- Life-look materials (`tools/art/life/materials.mts`: blued and parkerized steel, colour-case, walnut,
  polymer, brass, glass) — the same lit material as the rest of the world, not vertex colours.
- Each model: named nodes for the moving parts (hammer, cylinder, gate, trigger · barrels, lever ·
  magazine, bolt carrier, charging handle, safety · bolt, scope lens · cell, core, fins) and the sockets
  (grip, fore, sights, muzzle, port); near ~6–12k triangles, far ~1–2k, merged for the snow.
- Real types drawn ours: the single-action revolver, the side-by-side, the AK pattern, a bolt-action rifle
  with a scope; the Daybreak designed from nothing.
- `/dev/guns` redone: the sheet (side, three-quarter, open), in the hand, on the snow by day, under the
  torch at night — set beside reference photos.
- `tp/guns3d.ts`'s drawn guns and `items3d`'s lying ones go once the GLBs are in.

## Sound

Every gun's sounds are redone together, at the end (phase 9 — the user's call, 2026-11-11). Till then the
new guns borrow placeholder sounds (the AK the revolver's shot, faster; the sniper the double-barrel's;
the Daybreak the torch's focus hum and a flare's burst) so the phases before can be played.

## Phases

0. **Mocks** — the references beside our scene: three camera framings (F1), the hold (F6) for a handgun and a
   long gun posed on the bench, first Blender blockouts of all five guns. Signed off before code.
1. **The right button** (F8) — RMB focuses the torch only when it's on; no gun, no light: nothing. A test.
   Small; can ship on its own.
2. **The camera and the reticle** — F1/F2/F3, per-gun aim, the convergence and the blocked mark, the new
   reticle, the kick split. First-person down-the-sights goes (if F3a).
3. **The models, the two we have** — the Blender script, the GLB loading (fetched, not in a chunk; the
   materials compiled behind the loading screen), sockets, the revolver and the double-barrel replacing
   `guns3d.ts` in my hand, in others', on the snow. Stills.
4. **The moves, the two we have** — ready, aim (with and without the torch), draw, put away, fire, both
   reloads, sprint, walk aiming, dodge/hit/fall, dry fire; on the bench, then in the dark. **The feel
   signed off.**
5. **The AK-47** — the rules (full auto, the magazine), the model, its moves, a placeholder sound, the lockers.
6. **The sniper** — the rules (the bolt, the scope, the breath), the model, the scope view, moves, a placeholder sound,
   the hunting bag.
7. **The Daybreak** — the ball on the server, the model, its light and burst, moves, a placeholder sound, Spawn.
8. **Checks** — server tests per gun (rate, reload, magazine, bolt, the ball); e2e: draw, fire, reload,
   switch, two players seeing each other's moves; frame cost on High and Low; page/chunk budgets measured
   and noted; the tuning pass in the dark; stills.
9. **The sounds — every gun, redone** (the user's call, 2026-11-11). All five guns, the old two included:
   the shots (near, far, indoors, outdoors in the snow and its echo), the handling (draw, put away, dry
   fire, each reload's every step, casings and shells on snow and on floors), the Daybreak's charge, ball
   and burst, others' shots at a distance. **It starts with questions to the user** before anything is
   made — at least:
   - where the sounds come from: recorded CC0 / CC-BY picks (as plans 63, 65), made in `dark/synth.ts`, or
     a mix;
   - the character: heavy and realistic (AW2's) or punchier and more game-like;
   - how far a shot carries, and how loud the guns are against the rest of the world;
   - the Daybreak's voice (it has no real-world sound);
   - whether you choose from candidates for each sound (3–4 each, as the steps were picked), or I pick and
     you veto.
   Then: the picks, the mix, the checks (the steps' level rule: plan 63), credits in `sources.json`.

## Phase 9 — the sounds: built, signed off (2026-11-12)

**Decided by the user 2026-11-12** (the questions the phase began with):
- **Sources**: recordings (CC0 — CC-BY only with its credit in `sources.json`) for everything a real gun
  makes, layered and processed; made in code only where nothing real exists — the Daybreak.
- **Character**: heavy and real, AW2's — weighty, dry, close shots with a long tail into the woods; the
  reloads slow and mechanical. Frightening, not fun.
- **Reach**: far but not deafening — others hear a shot to ~90 tiles, dulled with distance; mine sits
  clearly over the world without drowning the steps and voices for long.
- **The Daybreak's voice**: sci-fi energy — a whining charge, a zap as the ball leaves, a big electric
  boom for its burst (not a lamp-and-storm, not quiet).
- **Picking**: by the user's ear from 3–4 candidates a sound on `/dev/gun-sound` (as the steps and the
  water were), then wired in.

**The sounds** (slots — `tools/sfx-guns.json`, `public/sfx/guns/`):
- shots, each near (outdoors, its tail into the land), in (a room), far (dulled): `revolver-*`,
  `shotgun-*`, `ak-*`, `sniper-*` — 12;
- the Daybreak (made in code, its candidates variants): `daybreak-charge`, `daybreak-fire`,
  `daybreak-ball` (a loop as it flies), `daybreak-burst`, `daybreak-burst-far` — 5;
- handling, every gun: `draw`, `holster`; dry `revolver-dry`, `shotgun-dry`, `rifle-dry` (the AK's and
  the sniper's); the brass and the shells landing `case-snow`, `case-floor`, `shell-snow`, `shell-floor`;
- the revolver: `revolver-open` (the cylinder out), `revolver-eject` (the rod: the cases dumped),
  `revolver-speedloader`, `revolver-close`, `revolver-cock`;
- the double-barrel: `shotgun-break`, `shotgun-eject`, `shotgun-shell` (one in), `shotgun-close`;
- the AK: `ak-mag-out`, `ak-mag-in`, `ak-rack` (the charging handle);
- the sniper: `sniper-bolt-open`, `sniper-bolt-close`, `sniper-round` (one thumbed in);
- the Daybreak's cells: `daybreak-cell-out`, `daybreak-cell-in`.
About 43 slots.

**The candidates** (2026-11-12): `tools/sfx-guns-search.mjs` searched Freesound for each slot (CC0, the
most downloaded first, read from its search page with plain curl 4 s apart — plan 63's rate limit), kept
up to 4 of a fitting length (the thin ones searched again wider; a reload filed under shots, a CD case
under brass, dropped by hand) → `tools/sfx-guns.json`, 159 candidates; `tools/sfx-weather.mjs`
(`LIST=tools/sfx-guns.json DIR=guns`, the guns' own cut lengths: `hitLen`) fetched and cut them into
347 takes, `public/sfx/guns/<slot>-<c><n>.mp3` + manifest (3.95 MB till the picks prune it). A full
reload's recording serves several slots: its takes are its moments. The Daybreak's are recorded sci-fi
sounds (charges, zaps, energy blasts — CC0), not made in code: there were real ones to pick from.
**The bench**: `/dev/gun-sound` — each candidate's takes played in turn, ★ a pick; a handling sound's
single take ★-able (a shot keeps all its takes: the game goes round them); each gun's moments "in order"
with the picks (draw, shots, its reload, put away); "copy picks" → the tool's PICK (`[candidate, take]`
for a take). **Waiting on the user's picks.**
- `shotgun-in`: none of its recordings would do (the user, 2026-11-12) — searched wider (4 real shots
  kept: a western blast with reverb, loud blasts, a Mossberg, one from the target's end) and **made** four
  more (`tools/sfx-guns-rooms.mjs`): the outdoor double-barrel's candidates through a real garage's impulse
  response (CC0, found by the same search), some of the dry shot kept for its punch — the same gun
  indoors as out. Any `-in` slot can be made so. (The user picked a recorded one, the Mossberg's.)

**The picks** (the user's, 2026-11-12, by ear): one candidate a slot, a handling moment's take where
starred — `tools/sfx-guns.json` `pick`/`take` (the tool keeps only that take now), re-cut to 53 takes,
714 KB in `public/sfx/guns`. Among them: the revolver Shark_Anthony's .357 with its tail; the
double-barrel MrGungus' shot, a Mossberg indoors; the AK SuperPhat's, an AR15 indoors; the sniper
qubodup's M2010; the Daybreak's charge a laser charge-up, a laser blast, a sci-fi generator's loop for the
ball, qubodup's *Ion Cannon* for its burst.

**Wired in** (`dark/voices.ts`, `dark/arms.ts`):
- `DarkSound.gun(slot, at, range)`: the recordings decoded the moment a gun's out (`warmGuns`: every slot
  at once — fetched one by one, the first shots were silent), a shot's take at random, a handling moment's
  in turn, each a touch different (±3.5% / 5% pitch, ±8% level: a held AK's rounds aren't one sample over
  and over); `GUN_LEVEL` each slot's level (the handling well under a shot, the brass quietest).
- **Shots**: near (outdoors) / in (a room — where I am) / far by the shooter's distance (past
  `SHOT_REACH.near` 22 tiles the far recording, dulling on to 90). **Mine ducks the world's bed** a moment
  (`duck`: the ambience bus to 55% — 75% for the AK's rounds — back over ~0.4 s).
- **Handling** by Player.arm, mine and everyone's: drawn, put away; the revolver's cylinder out, the rod's
  dump (its brass on snow or a floor), the speedloader as the rounds go in, shut; the double-barrel's
  break, eject, a shell a shell, shut; the AK's magazine out, in, the rack after a dry one (mine: the
  others' emptiness isn't known); the sniper's bolt after a shot (open, close, its case), its reload's
  rounds; the Daybreak's charge (mine pressed, others' by ARM.charge), its zap, **its ball's hum
  following the ball** (the nearest in the air, `ballAt`), its burst near or far, its cells. Others'
  rounds going in aren't known: heard when the server's step would put them in. Dry: the revolver's,
  the double-barrel's, the rifles'.
- **The synth's gun sounds retired** (`dark/synth.ts`: 19 recipes and their helpers gone; the hits, the
  flares, the dark's own stay).
- **Credits**: every pick in `public/sfx/CREDITS.md` (the guns' section) → `tools/credits.py` →
  `public/credits.json` (102 sounds).
- **Checks**: `arms-feel.spec.ts` — all 43 decoded before the first shot's over (the audio running), the
  feel as before; `daybreak.spec.ts`; the credits test. Not checked by a test: how it sounds — the
  user's ear, in the game. Then: the picks wired in (the shots' near/in/far by where
the shooter is and how far; ~90 tiles), the mix (mine over the world, ducked briefly), the synth worker's
gun sounds retired, credits (CC0: listed anyway, `sources.json`'s way), the checks.

## Phase 8 — checks: built, signed off (2026-11-12)

- **The metals**: every gun read near black by day — **the game never gave the guns' materials the
  sky's reflection** (the life look gives it only to its own materials: look/lit.ts `adoptLife`; the
  guns' come from their files), so a metal one showed nothing. `tp/view.ts` lifeGun adopts them now: the
  revolver's nickel, the double-barrel's silver boxlock and blued barrels, the AK's dark phosphate, read.
  The flat values tuned beside it (`build_guns.py` FLAT: blued 0.05–0.07 metal 0.85, phosphate 0.06 metal
  0.5 rough 0.56, polymer a touch lighter; first tried much lighter before the cause was found — the AK
  went aluminium grey); all five rebuilt (sizes and triangles as before). Stills: design/guns/p8.
  **Baking the node materials' grain, checkering and engraving into textures is not done** (a Blender bake
  per gun, UVs, the files' size) — the user's call.
- **Dropped guns** (`items3d.ts` `lifeItemModel`, `arms3d.ts` `lifeGun`): a gun on the snow lies as its own
  life model once its file has loaded (its parts merged, coloured by their materials, on its side), a
  drop already lying swapped over — no more the double-barrel standing in for the AK, the sniper, the
  Daybreak. (`guns-hold.mts DROPS=1`.) The classic look keeps the drawn stand-ins.
- **Two of us** (`e2e/guns-two.spec.ts`): Ana sees Bia's guns — the AK in her hands as its own model, its
  burst's shots, its magazine out in her left hand reloading; the sniper's bolt worked; the Daybreak's
  core swelling as she charges, its ball and burst. On the way, **a bug: an admin's give** (`mod:give`,
  survival's `give`) read addItem's "how many it took" as "how many were left" — a give that fitted said
  "That didn't go" and its owner was never told (the server had it). Fixed; a survival test (fails
  without the fix). (Two 3D pages share the GPU: the one behind runs a few frames a second — full auto
  fires on its own frames, so the burst's count is checked as "more than one"; the rate is arms-feel's.)
- **The blocked reticle** (`arms-feel.spec.ts`): the muzzle's line made to stop a metre out — the reticle
  turns blocked and moves there; clear, it's back. (The wiring; a real wall in the way isn't staged.)
- **Frame cost** (`e2e/guns-perf.spec.ts`, at night on the pond's shore, the torch on; against the same
  view with no gun out, in the same run — the machine was loaded, the dark's own 60 fps check read 21.5):
  | | High | Low |
  | --- | --- | --- |
  | no gun | 25.5 fps | 37.8 |
  | aimed | 26.1 | 37.6 |
  | the AK held down | 27.8 | 37.8 |
  | the Daybreak's ball | 23.8 (+7% frame time, one 83 ms frame) | 37.5 |
  The guns cost nothing measurable but the Daybreak's ball on High; the check: ≤ 15% more frame time.
- **Page budgets** (a production build, `tools/budget.mjs`): **the page 480.8 KB of 469 and yutopia-chars
  68.4 of 62 — over, but not by the guns**: no gun word is in any of the page's 18 files (`daybreak`,
  `ak47`, `sniper`, `speedloader`…); the person's gun hands, the scope, the ball's light are all in the
  3D view's lazy chunk (107 KB, no budget of its own), the gun controls in yutopia-dark (33.6 of 80);
  yutopia-chars has none of the gun code. Both budgets were last measured 2026-11-06 / 11-09 — the 70
  commits since (plans 73–78) grew them. Not raised here: what grew, and whether it's a split, is its own
  look (offered to the user as a session).
- **Survival's tests**: my give test first reused uid 391 — the indoor torch test's — and the same person
  twice in the room hung the file's teardown (cancelled at the limit); its own people now (395, 396), the
  file ends in 42 s. Its loot-spot test is **red on HEAD too** (the teleport to a house's door times out,
  every run of the whole file; alone it passes) — not the guns'; left as it was.
- **What a gun takes to put one of the shadowed down** (250 hp, once the light's burnt its shield off;
  the head ×1.5) — for the tuning in the dark, the user's:
  | | body | head | notes |
  | --- | --- | --- | --- |
  | revolver | 5 | 4 | 0.42 s apart: ~2 s |
  | double-barrel | 2 (8 × 18 within 5 tiles) | — | falling off to 0.4 at 14 |
  | AK-47 | 12 | 8 | ~1.2 s held; 0.7 of it at 50 tiles |
  | sniper | 2 | 1 | 1.3 s between |
  | Daybreak | 1 (300 in 3 tiles) | — | burns the shield itself as it passes: no torch needed |

## Phase 7 — the Daybreak: built, signed off (2026-11-12)

- **The rules** (shared `ARMS.daybreak`, `WEAPONS.daybreak` 3 of `cell`, `STACKS.cell` 3; `ORB`, `burstAt`,
  `orbFlight`, `isCharged`, `ARM.charge` 5): pressed, it charges 1.0 s (`arms:charge` — the server's own
  clock: a fire before it's charged isn't one; let go of the aim, `{ stop }`); then a ball of light, 14
  tiles/s, at most 40; 2.5 s between. Its burst: 300 to 3 tiles, falling to nothing at 6 (one of us: half,
  `pvpDamage`, not through a wall); passing, it burns the shields within 5 tiles as 3 focused beams would.
  Its reload: the spent cells out (the live back to the pockets), three in at once (0.7 + 0.9 + 0.4 s).
- **The server**: the ball isn't a ray — `features/arms.ts` flies it each tick from the muzzle (where it
  stops at the latest from `orbFlight`: the ground), against walls and trunks by Jolt's sight (the grid's
  "can't stand there" stopped it at the pond's edge — open water isn't a wall), against the others on its
  floor and the shadowed (`dark.near`); bursting there. The dark (`features/dark.ts`) got `sear` (the
  burn as it passes) and `blast` (every shield in reach gone at once, the damage on them 0.3 s on — exposed
  by then — told back as `arms:hit`). The flight and the burst go to everyone near as `arms:orb` and
  `arms:burst` messages (as a flare's throw is), no schema change. **Plan change:** messages, not a
  `state.orbs` — someone joining mid-flight misses a ball (2.9 s at most). A test: no charge no shot; the
  charge seen; one of the shadowed burnt bare by the passing ball and put down by its burst in one.
- **Where it comes from** (F9a): the admins' Spawn only (its list; the kit's `daybreak`, in quick 4 in
  the sniper's place — "Arm me" stays the four).
- **The model**: phase 0's Blender Daybreak: 0.22 MB, 25.4k triangles — over the guns' 20k, **its own budget
  raised to 26k** (the lens, the cage, the fins, the filament; the user's standing rule: budgets raised as
  needed, measured, noted). Pivots `cell` (slides out underneath), `core` (glows by the charge: it swells),
  `needle` (the gauge swings with it), `trigger`; flat materials `enamel` (navy), `glass`, `glow` (emissive).
- **In the world** (`tp/arms3d.ts` `orb`/`burst`/`lights`, `parts/sun.ts` ORB_LAMP, `view.orbLights`): the
  ball a hot core in a wide glow (not fogged — at night the fog's blue drowned it), its light carried with
  it through the lamp pool; the burst a flash, a ring of light on the ground, sparks every way, its light
  bright and gone in a second. Tuned down once: at the muzzle the first lamp blew her out white.
- **In the hands**: a long gun (`isLongGun`). The reload is the AK's hands (`magHand`/`magFrame`, now by a
  load spec: `AK_LOAD`, `CELL_LOAD`) — the cell slides out underneath, to the belt's pouch, back, in; never
  racked. Others see the charge (Player.arm: the core swells on their gun too).
- **The feel** (`dark/arms.ts`): the left button charges (`charge()`), the ball goes on its own once
  charged if still aimed; empty, the click and the reload. The HUD three glowing cells, "+N cells". A shove
  on firing. Placeholder sounds: the charge the torch's focus, deeper; the shot a flare's strike, low; the
  burst the double-barrel's far shot, slowed, and a strike; the cell out/in the break and the cock.
- **A bug on the way**: the AK's rack time was named `charge` — `isCharged` took the AK for a charged gun
  (its shots refused on the server, its click a charge on the client). Renamed `rack`; caught by the AK's
  server test.
- Seen with `e2e/guns-hold.mts` (`ONLY=daybreak HOUR=22`: on the pond's north shore at night facing out
  over the water, the ball flying out, lighting the reeds and the water, bursting on the far side; by day
  the hold and the reload). `e2e/daybreak.spec.ts`: charging (no ball, none spent), the ball's light, a
  cell spent, its burst (`burstsShown`), let go mid-charge nothing, R three again. Server 16/16, dark,
  down; survival's loot-spot test failed (red on HEAD too — see phase 8).
- The capture's start moved off the pond (open water out of the winter: she stood in it): (−240, −18).
- **Left for phase 8**: the Daybreak on the snow and in the classic look is the double-barrel's drawn
  model; a ball in flight isn't seen by someone joining mid-flight.

## Phase 6 — the sniper: built, signed off (2026-11-12)

- **The rules** (shared `ARMS.sniper`, `WEAPONS.sniper` 5 of `r308`, `STACKS.r308` 15): 170 a hit (255 at
  the head), flat to 120 tiles; 1.3 s between shots — the bolt worked from 0.2 s after one for 0.85 s
  (`ARM.bolt`, everyone sees it); wide aimed over the shoulder (0.05 rad), ×0.015 down the scope
  (`SPREAD.scope`, `Stance.scope`, `isScoped`). Its reload: the bolt back (0.35 s; nothing dumped — the
  rounds stay in the magazine: `dumpsOnOpen`), a round at a time (0.5 s), the bolt home (0.35 s).
  **Plan change:** the scope is said in the shot itself (`arms:fire { scope }`), not an `mv` bit — taken at
  the shooter's word, as the moves are (no anticheat for now). A server test: scoped vs wide, the bolt
  (no shot till home), the reload keeping its rounds.
- **Where it comes from** (F9a): the hunting bag, 12% the rifle (empty) with five .308, else 30% five
  .308 (shared `cacheItems`' `extra` dice — their own, seeded per nest, so the day's nests lie as before;
  `HUNTING_RIFLE`). The admins' kit: `sniper` (quick 4, 15 .308; "Arm me" asks for all four). The kit now
  lays its own kinds of stack in fresh (a stray single shell had kept the rifle's rounds out of full
  pockets); what else is carried stays.
- **The model**: phase 0's Blender rifle for the game: 0.15 MB, 17.8k triangles; pivots `bolt` (on the
  bore: turned up, run back), `trigger`; lens glass a `coated` flat material. In the budget test.
- **The scope** (`tp/view.ts` `scope`/`scopeK`/`scopeSway`, `dark/arms.ts` `scopeFrame`): aimed its 0.3 s
  over the shoulder, the camera goes to the eye (on the stock), the lens to 50/4 or 50/8 (the wheel, while
  in it), the mouse slowed (`lookScale`), her body not drawn; a black ring and a post reticle (`.dk-scope`),
  the crosshair gone. The sway on the look (and so the shot — it goes from the eye along it), steadied by
  the breath held (Shift: ×0.12 for 3 s, then ×2.2 till let go, back over 2 s), more on the move, less
  crouched. A shot drops you out of it for the bolt and back in once it's home (RE5's). The aim's pull
  comes up near level for it (`aimRise` 0.04 — the others' 0.15, the ground ahead, would fill the glass).
- **In the hands** (`person3d.ts`): a long gun (`isLongGun`). The bolt worked by the left hand — over the
  top to the knob, with it up, back and home, back to the fore-end (`boltHand`, from Player.arm, so
  everyone's); the gun stays shouldered in the right (it hangs from that hand: the right working the bolt
  would carry the gun with it). The reload: the hand to the port, rounds from the belt pouch one at a
  time (`roundHand`), timed from the server's opening.
- **The feel**: a hard push (camera share of 0.07 up, mostly settling), the bolt's case out; the HUD five
  brass rounds and "+N .308". Placeholder sounds: the double-barrel's shot, deeper (×0.8); the bolt the
  revolver's cock, low, twice; open the gate, shut the cock.
- Seen with `e2e/guns-hold.mts` (`ONLY=sniper`: its aim before the scope, the game's view at 4× and 8×,
  the bolt from both sides, the reload; `DEBUG=1` prints the camera and the pockets too).
  `arms-feel.spec.ts`: scoped in time, the glass on and the crosshair off, 8× narrower, out for the bolt
  and back, R back to five. Server tests 15/15 + survival/down; shared nests (the bag's rifle).
- **Left for phase 8**: the sniper on the snow and in the classic look is the double-barrel's drawn model;
  the scope view's light (the night: the torch's beam along the barrel isn't in the glass's picture yet).

## Phase 5 — the AK-47: built, signed off (2026-11-12)

- **The rules** (shared `ARMS.ak47`, `WEAPONS.ak47`, `STACKS.r762` 60): full auto at 0.1 s, 22 a hit
  (full to 30 tiles, 0.7 of it at 50), tight first round (0.004) blooming 0.011 a round to 0.07, calming
  fast (3.2/s); drawn in 0.45 s, aimed in 0.24 s. `isAuto`, `isWhole` (loaded all at once: the
  speedloader, the magazine).
- **The server** (`features/arms.ts`): each round its own `arms:fire`, the rate kept in slots — a shot
  late on the line may take the slot it missed (so a held trigger keeps 600 a minute through jitter),
  never faster over time. The magazine reload on the revolver's step machine: open 0.8 s (the magazine
  out, every round left in it back to the pockets), load 1.0 s (thirty at once), shut 0.4 s — or, begun
  empty, the charging handle racked, 1.0 s (2.2 s / 2.8 s, as the table). **Plan change:** no `ARM.mag`
  — the AK's whole reload is `ARM.open`, as the others' opened guns are (the clients time it from there).
  A test: rate through jitter, a burst sent at once, the magazine's rounds back, the dry rack.
- **Where it comes from** (F9a): the supply locker's kit, some days (12%) an empty AK and 30 rounds for
  one who carries none; carrying one, some days (35%) its 30 rounds (shared `lockerAk`, `LOCKER_AK`; the
  dice settable for tests: `lockerDice`). The admins' kit (`mod:refill { kit, ak }`, Spawn's "Arm me"):
  the AK in quick 3, 60 rounds — opt-in, so the older kit's free pocket and quick slot stay free.
- **The model**: phase 0's Blender AK, built for the game (`build_guns.py --only ak47`): 0.11 MB, 11.2k
  triangles; pivots `magazine` (on its front lug), `carrier` (the charging handle on it), `trigger`,
  `selector`; `round0` the top round; points with `pt_fore`, `pt_butt`. In the budget test.
- **In the hands** (`tp/person3d.ts`): a long gun as the double-barrel is (`isLongGun`) — carried across
  the body, shouldered aimed, the cheek on the stock. The carrier jumps back with each round (poseGun).
  **Its reload** (`magHand`, `magFrame`, `AK_LOAD`): the gun kept at the shoulder, muzzle lowered; the
  left hand off the fore-end to the magazine, rocked out, down to a pouch at the belt's front left (out
  of the coat, seen), back with it, rocked in; run dry, over the top to the charging handle, racked, let
  go; back to the fore-end — timed from the server's opening, so a reload begun aiming joins where it's
  got to once the gun comes down. The magazine follows the hand while it's off the gun.
- **The feel** (`dark/arms.ts`): the left button (RT) held fires at the beat (the next round's slot from
  the last, not the frame); a round's camera kick small and mostly kept — it climbs — walking aside the
  same way each burst; the dry click once a pull; shots counted ahead of the server's count (so a burst
  doesn't fire past empty on the line's delay). A case out of the port a round. The HUD: a magazine bar
  with its count, "+N 7.62".
- **Placeholder sounds** (phase 9 redoes them): the shot the revolver's, quicker (×1.22) and quieter;
  the magazine out the double-barrel's break, higher; in, the revolver's load; shut/racked its cock,
  lower.
- Seen with `e2e/guns-hold.mts` (now all three; `ONLY=ak47`, a burst frame, the reload from both sides,
  its state in her own frame with `DEBUG=1`; back to the start for each gun, the moves facing away from
  the pond — open water out of the winter, it swam): hold, aim, the burst, the reload, walking aimed,
  sprint, dodge, put away. `arms-feel.spec.ts` has the AK: a second held ≈ ten rounds, the climb, let go
  no more, R thirty. Server tests 14/14, survival + down 17/17, shared loot (the locker's AK).
- **Left for phase 8**: the AK on the snow is the double-barrel's drawn model (no drawn AK; the life
  model on the snow is phase 8's) — and the classic look's AK too; the guns' metals read near black by day
  (the flat placeholder materials: the baked textures).

## Phase 4 — the moves, the two we have: built, signed off (2026-11-12)

Seen close in the game with `e2e/guns-hold.mts` (each gun ready and aimed, drawn again by the game's
renderer from her right, her left and ahead of her — the player's camera, which her aim follows, untouched).
Before: the revolver floated above an open right hand; the double-barrel sat on top of the shoulder, the
left hand holding the torch out below it.

- **The revolver in a life hand** (`person3d` `gunInHand`): seated by the hand's own frame (plan 78's
  `HandFrame`) — the grip across the palm, raked forward 0.38 rad as the model's is, its middle at the
  fingers' roots out of the palm by its half thickness, the palm on its right side, the barrel along the
  knuckles; the fingers closed round a grip-shaped cylinder (`hold`, `GUN_GRIP_SHAPE`); aimed by **turning
  the wrist** (`aimHand`, within a wrist's reach) instead of the gun in it; its kick the arms'. Now: in the
  fist, along the aim, the torch hand under it.
- **The double-barrel** from the model's own points (butt, grip, fore) at life size, the butt 5 cm under
  the shoulder joint (in its pocket), the left hand at the moved-back `fore` (where it reaches): now the
  torch hand under the action, the stock in the shoulder. Its ready carry already reads as AW2's (the
  right hand on it, the torch free in the left).
- **The revolver's low ready** (AW2's): out and not aimed, both hands bring it before the waist — the right
  fist under the shoulder, 0.34 ahead (level, the body's own forward), 0.12 in, 0.17 down; the muzzle ~35°
  down and a little left (running: tucked nearer, steeper); the torch hand beside it. Reloading lets it go.
- **The reloads, AW2's (F11a, F12a)** — the rules (shared `ARMS`, `world-server/features/arms.ts`): both
  guns open first and everything comes out, the live rounds back to the pockets (what fits; the rest stays
  in); then the revolver's speedloader (every round it needs at once) or the double-barrel's shells one at
  a time; shut. Revolver: open 0.45 s, speedloader 0.8 s, shut 0.3 s (1.55 s in all); a shot while it's
  out snaps it shut (0.2 s) if a round's in, nothing dumped. Player.arm says `open` for both. Server tests
  rewritten (`arms.test.ts`: the dump, the live rounds back, the six at once after its time, the snap; the
  double-barrel's live shell back) — 13/13 green. My side: the cylinder swings out (poseGun's crane) and
  its spent cases fall as it opens; one click for the speedloader. Seen in the game (`guns-hold.mts`'s
  reload pass): the revolver's window empty, its cylinder out to the left, two cases tumbling; the
  double-barrel broken, its fired shells kicked out. **The body's speedloader trip**: the revolver's
  reload is one trip now (`night.ts` `reload2(t, fear, once)`, `LocoIn.speedloader`) — at the gun while
  it swings out and dumps (to 0.35 s), the left hand down to the pocket by 0.6, back at the cylinder by
  1.05, at the gun while it shuts; frames through it in the game (`guns-hold.mts` reload pass, five
  frames): out and away at 0.85 s, back at the gun at 1.45 s (plan 32's loop would be at the pocket
  again). The double-barrel keeps its shell-at-a-time trips.
- `arms-feel.spec`, `arms.spec` green. (Both time out at their teleport when Ana starts on floor 4 — the
  dev world's spawn after a restart — and pass once she's at the pond: the tests' start, not the guns.)
- **The draw and the put-away** (`person3d`): a gun taken out, the hands rise from the side at its draw
  (0.35 s — shared ARMS' — not the old snap); put away, a life gun stays in the hand while they go down to
  the side (0.25 s), then it's gone. Seen: at 0.15 s into the put-away the revolver still in both hands,
  lowering.
- **The cheek on the stock**: a long gun aimed, the head down 0.2 rad and over 0.12 to the right (the neck
  0.4 of it; `locomotion` `CHEEK`, `LocoIn.longGun`). Measured on the head bone in the game (its axes, with
  and without): the face 0.27 rad lower, rolled to the right — the roll's sign was wrong at first (to the
  left) and was flipped.
- **On the move** — seen in the game (`guns-hold.mts`'s moves pass: W with the right button, W+Shift, Q):
  walking aimed, both guns up on the aim, the legs walking under it; sprinting, the revolver tucked to the
  chest in both hands, the double-barrel carried across the body, the torch free; a dodge, the gun kept in
  the hand through the roll. Hit and fall (read in `person3d`, not staged): the two-hand hold lets go when
  down or falling (`gunHands` want 0) and the gun stays on the right wrist, going down with it.
- **Dry fire**: an empty pull moves the trigger and drops the hammer on nothing for a moment (`dark/arms.ts`
  `dryAt`), with the click as before, then the reload starts. Measured: 40 ms after, trigger 1, hammer 0.27;
  re-cocked by 0.44 s. (Mine only: the others don't hear a dry pull.)
- **The gun bench is `e2e/guns-hold.mts`, not a tab on `/dev/anim`** (a change to this plan, 2026-11-11):
  the holds live in `person3d` (the hand's frame, the two-hand reach, the wrist's aim, the fingers' close),
  which the bench doesn't run — a tab would copy them. The script is the bench: in the game, from three
  sides, ready, aimed, the draw, a reload's frames, the moves, the put-away; `DEBUG=1` prints each step's
  state (the gun, Player.arm, the rounds, the open).
- A dev-world gotcha found on the way: the world server's watch restarted on a first edit to
  `features/arms.ts` and missed the next (an import), so the dev room ran a reload that threw; after 100
  throws it switched the arms tick off (reloads stuck open, Player.arm 3). `docker restart yutopia-world`
  fixed it; the code and its tests were right.
- **Signed off** by the user 2026-11-12 ("look fine for now"): the feel may be tuned again in phase 8's pass in
  the dark.

## Phase 3 — the models, the two we have: built (2026-11-11)

- `tools/art/guns/build_guns.py` writes `apps/client/public/life/guns/revolver.glb` (0.14 MB, 15.1k
  triangles) and `shotgun.glb` (0.10 MB, 10.5k): every boolean and bevel applied, each moving group's
  parts merged by material and hung on a pivot at its hinge (the revolver's hammer, trigger, crane › cylinder;
  the double-barrel's barrels with the fore-end, lever, triggers), the rounds (`round<i>`: the revolver's six,
  the double-barrel's two shells' heads) and the points (`pt_grip`, `pt_muzzle`, `pt_rear`, `pt_front`,
  `pt_fore`, `pt_butt`) as nodes; meshopt geometry; plain PBR materials by kind.
- The game: the view loads a gun's file the first time a hand asks for it (`lifeGun`: the life loader, the
  room's light patched in, the shaders compiled before the first draw) and hands it to the people through
  their materials (`Mats.gun`, as the pets' toys and the pool balls come); `person3d` builds the model from
  it (`guns3d.ts` `lifeGunModel`: the same `GunModel` — parts, rounds, sight, muzzle, grip — so `poseGun`,
  the hands and the muzzle flash work unchanged), life size, swapped in when it arrives (the drawn gun till
  then, or if it fails); a life gun's shared geometry isn't disposed with one copy. `poseGun` swings the
  double-action's crane out to the left as it opens (F11a's reload).
- Checks: by day and at night in the game (`e2e/guns-today.mts`, now `HOUR=` and `NAME=`, which reports
  which model's in the hand): both life models in Ana's hands; `look/life-budget.test.ts` has the guns
  (≤ 0.25 MB, ≤ 20k triangles, every pivot, round and point named) — green; `arms-feel.spec.ts` and
  `arms.spec.ts` green (the feel spec failed once, on the first run after the swap, green twice since).
- **Left for later**:
  - the guns lying on the snow (`items3d.ts` `gunLying`) are still the drawn ones — that path paints by
    vertex colour, which the files don't carry;
  - no far level yet (one file for every hand: 10–15k triangles a gun);
  - the node materials' wood grain, checkering and engraving aren't baked into textures yet (plain colours);
  - the revolver still sits upright in the fist (the old hold): phase 4.

## Phase 2 — the camera and the reticle: built (2026-11-11)

- **The camera** (`tp/view.ts` `CAM_READY`, `CAM_AIM`): a gun out (`armed`, eased `armK`), tight over the
  right shoulder — at most 1.5 back, 0.5 right, 0.3 up over EYE; aiming, 0.95 back, 0.45 right, 0.42 up,
  the lens 4° narrower. The offset moves the camera and what it looks at alike. The aim eases in at the
  gun's own pace (shared `ARMS[gun].aim`: the revolver 0.18 s, the double-barrel 0.26; `tp.aimSecs`).
- **Guns are third person** (F3a): `camWanted` gives the chase camera in first person while a gun is out;
  `dark/arms.ts` re-asks it when the gun comes out or goes away. Plan 32's down-the-sights is gone
  (`hands1p.ts` `downSights`, the `ads` getters, the lens's zoom with it).
- **Shots converge** on what the crosshair is really on: one of the shadowed, one of us, else now a wall
  or the ground (the view's `aimHit`, within its 16 tiles), else 30 tiles out.
- **The reticle**: a dot and the four ticks (opening with the spread, as before). **Blocked**: when a wall
  or the ground stands between the muzzle and that point, the reticle moves to where the shot would stop
  and turns into a ring, the ticks dimmed (`blockedAt`: `rayStop` from the muzzle, `tp.project`). Built,
  **not yet seen in the game** — the checks (phase 8) put a wall in front of the muzzle.
- **The kick split**: the look takes 65% of a gun's kick and settles ≥ 80% of it back by itself; the gun
  in the hands keeps its own (the body's `aim2`, unchanged).
- Checks: `e2e/arms-feel.spec.ts` rewritten for it (a gun out: the camera under 2.1 tiles away; aimed,
  0.3 nearer; Y keeps the chase camera with a gun out, first person back once it's away; the look's kick
  smaller), green; `arms.spec.ts` (armed at night) and the torch test green; shared arms and inventory
  tests green. Budgets not measured yet (phase 8).

## Phase 1 — the right button: built (2026-11-11)

`dark/arms.ts` no longer switches the torch on for an aim with no gun (and off after); the walker's focus
already needed it on. The right button still aims with empty hands — a held pool ball's throw uses it.
`e2e/beam.spec.ts` "aiming with the torch off leaves it off": red on the old code ("the torch not switched
on": it was), green on the fix.

## Phase 0 — mocks: delivered and signed off (2026-11-11)

All in Blender, headless (Eevee), rebuilt by one command each:

- `tools/art/guns/guns.py` — the five guns and the torch, life size, with their points (grip, fore, muzzle,
  rear, front, butt) as empties. Second pass (the user, 2026-11-11: "improve a lot the models details"):
  real parts — the revolver's fluted cylinder and chamber mouths, gate, screws, checkered hammer spur and
  walnut panels; the double-barrel's fences, hinge pin, top lever, two triggers, splinter fore-end and
  iron; the AK's stamped receiver with rivets, dimples and ejection port, ribbed dust cover, gas block,
  hooded front sight, slant brake, cleaning rod, a swept ribbed magazine; the sniper's fluted barrel, ported
  brake, slotted rail, bolt and shroud, cheek riser, bipod, and a full scope (turrets, power ring, coated
  lenses, rings and screws); the Daybreak's Fresnel lens and cage, riveted bands, gauge, filament cell and
  copper lines. Outlines smoothed and edges rounded; the materials drawn by nodes (wood grain, checkering,
  colour-case hardening, worn bluing, stippled polymer) — for these renders; phase 3 bakes them to the
  life look's textures. `sheet.py` renders them (`design/guns/0-blockouts-side.png` at one scale with a
  10 cm bar; `0-blockout-<gun>.png` three-quarter).
- `tools/art/guns/mock.py` — the life man posed by a two-bone solve onto each gun's points (the rig's bones
  are joints, so Blender's own IK doesn't fit), at night with the torch's spot and fog, one of the shadowed
  under the crosshair; through the plan's cameras (second pass, closer: ready 0.5 m right, 1.5 m back; aim
  0.45 m right, 0.95 m back, FOV 46°) and from his side and front (`0-aw2-<gun>-<ready|aim>[-side|-front].png`),
  and the sniper's scope at 4× (`0-aw2-sniper-scope.png`).
- `apps/client/e2e/guns-today.mts` — today in the game, for beside them (`0-today-<gun>-<ready|aim>.png`).
- `contact.py` → `design/guns/0-sheet.png` (today, then the mocks, two to a row) and `0-guns.png` (the five
  three-quarter).

What they showed:

- **The arms are short for a long gun.** The life man's shoulder to wrist is 0.50 m; with the butt in his
  shoulder his left hand falls 8 cm (double-barrel), 10 (Daybreak), 14 (sniper), 15 (AK) short of the
  fore-end, so in the mocks it holds where it reaches (the AK's at the receiver's front). For phase 4:
  **a)** hold where it reaches (the guns' `fore` points moved back), **b)** longer arms on the life rig (as
  plan 59 lengthened the legs ×1.14), **c)** both, a little each. **Decided 2026-11-11: a** — the body stays;
  each long gun's `fore` point moves back to where the left hand reaches.
- The handgun hold works as drawn (arms out at the shoulder's line, the torch fist under the gun hand, the
  beam along the barrel), and the gun is never in front of the face.
- The scope's picture washes out under the focused torch at 8 m: the scope view wants the torch dimmed or
  narrowed in it (phase 6).
- **The revolver and the double-barrel redesigned after Alan Wake 2's** (the user, 2026-11-11). Per the
  gun reference wiki (imfdb.org, "Alan Wake 2"), Alan's revolver is a 4-inch double-action .357 in nickel,
  reloaded by a speedloader, and his double-barrel a hammerless side-by-side boxlock; long guns are held
  in the right hand alone when not aimed, the left on the flashlight. Ours take that language — no
  makers' names or marks: the revolver a nickel double-action with a ventilated rib, full underlug,
  ramp sight with a red insert, fluted cylinder, swing-out crane and latch, checkered walnut target grips;
  the double-barrel round-bodied, its action silver and engraved in scrolls, a semi-beavertail fore-end,
  a semi-pistol stock with a grip cap, a white spacer and a thick pad. Their reloads went AW2's way too (F11a, F12a).
- The models still want, in phase 3: the moving parts split and pivoted, the node materials baked to
  textures, near/far detail levels, and a polish pass on the long guns' stocks (flat-sided seen square on).

## Risks

- **Lit materials compiled late stall a frame** — each gun's materials compiled before it's first drawn
  (memory: a shadow light with no map breaks every lit draw on High — no new lights on guns; the
  Daybreak's glow is emissive, its light borrows a flare's).
- **Full auto on the wire**: 10 `arms:fire` a second per player — measured with the bots
  (`tools/bots.mts`) at the dark's busiest.
- **Removing first-person guns** touches `hands1p.ts` and the page budget (memory: page budget traps).
- **Five guns, four slots, saved inventories**: the new ammo kinds and guns must pass `isWeapon` /
  `isStack` everywhere and old saves load unchanged.
- **Two-browser e2e** stall each other's frames (memory) — clip timing checked in one browser.

## References

Gathered 2026-11-11. The fandom wikis and IMFDB refused automated reads (402/403): the image pages from
them below still need a look in a browser.

- **AW2's camera**: "positioned tight over your shoulder" (blog.playstation.com/?p=384760); it stays over
  one shoulder, unlike AW1's swap (newgamenetwork.com/article/2723); an FOV slider since the 2024-01-31
  patch (alanwake.com/story/alan-wake-2-patch-notes). A reticle shows with the pistol; AW1 had none, the beam
  was the aim (pcgamer.com: "the man has no reticle").
- **AW2's light**: aim LT, boost RB — "hold R1 to burn away an enemy's protective shielding" (PlayStation
  blog); boosting drains the battery and strips the shield so guns can hurt (gamepressure.com/alan-wake-2/
  all-weapons/z7110a4); boosting during a reload cancels it (patch notes). Light, stagger, shoot
  (gamedeveloper.com, "why Remedy revived Alan Wake").
- **AW2's guns**: Saga's pistol (12), sawed-off, crossbow, hunting rifle (bolt, 5), pump shotgun (6); Alan's
  revolver (6, "strong recoil"), flare gun, double-barrel (2) (gamepressure, gmtreks.com/alanwake2). The
  rifle steadies the longer you hold aim; the pump's upgrade tightens it standing still.
- **RE5**: over the shoulder, stop to aim, a laser sight (a reticle on PC); you can't run and shoot
  (en.wikipedia.org/wiki/Resident_Evil_5); stop-to-aim was for tension (Takeuchi, engadget.com 2009-02-24).
  The set: handguns, shotguns, machine guns (an AK-74 among them), rifles (S75 bolt, Dragunov, PSG-1),
  magnums, launchers (gamewith.net/resident-evil-5/article/show/12336). The S75 leaves its scope to work
  the bolt (evilresource.com/resident-evil-5/weaponry/s75).
- **Recoil and cameras**: recoil as an additive layer over the base pose (CRYENGINE 3 docs); the kick in
  three parts — the gun's move, a pattern, the camera's shake (kinemation recoil docs); blend the camera's
  offset in the picture's plane, change distance rather than FOV (blog.littlepolygon.com/posts/cameras);
  John Nesky's "50 Camera Mistakes" (GDC 2014); "A Second Shot: Improving Ranged Combat in The Last of Us
  Part II" (GDC).
- **What not to copy from Doom's BFG** (en.wikipedia.org/wiki/BFG_(weapon), doomwiki.org/wiki/BFG9000): the
  three letters and the 9000s, the green plasma ball, the ball followed by a fan of rays. A slow, charged
  gun that clears a room is a genre idea and ours to make.
- **Pictures**: Saga with pistol and torch (en.wikipedia.org/wiki/File:Alan_Wake_2_screenshot.jpg); AW2 hero
  shot (blog.playstation.com/tachyon/2023/09/f520e1eb00c0ffd0ac53994299e75b718376d6bc-scaled.jpg); AW2's
  guns (gamepressure.com/alan-wake-2/gfx/word/1934375687.jpg pistol, …609 revolver, …625 pump, …703 torch);
  RE5 (en.wikipedia.org/wiki/File:Resi5gameplay.jpg); not yet seen: alanwake.fandom.com/wiki/File:Revolvers.jpg,
  imfdb.org/wiki/Alan_Wake_2, imfdb.org/wiki/Resident_Evil_5.

# Plan 104 — the skate, again

Asked 2026-11-18, after plan 103 was built:

> Thats the ugliest thing i ever see in my entire life, the visuals, mechanics, all of it is shit. Create a plan to
> improve every detail and spec, please compare with tony hawk. Lets plan again.

Status: **planned 2026-11-18; forks decided 2026-11-18 one by one: the recommendations for F1–F6 and F8–F12;
**F7b**, the skate HUD in Tony Hawk's bold punk-print style; **F13c**, no sign-offs — you test at the end. Built
2026-11-18 (phases 0–10), committed to main (818aebaa … c0f98dc7), not pushed — yours to test.**

Plan 103's code stays where it's right: the board as a walker mode, the exact ramp profiles, the wire, the items
and racks. Everything you see, feel and hear is redone against Tony Hawk's own numbers.

## What's wrong now (the audit: `design/skate/audit/`, the game's own camera, 2026-11-18)

- **The camera is broken on a board.** It's the walker's follow camera. Near a ramp it pushes into the wood, and on a
  rail the screen is one brown wall (`audit-20-rail-1.png`). Rolling, it sits inside her hair (`audit-13`). On vert
  it never looks down the ramp, so you don't see the air.
- **The parks are grey boxes with brown planes in them.** One flat colour per ramp; no plywood sheets, screws, seams,
  wear, no visible coping (`audit-00`, `audit-15`). The hall is an empty grey shed with flat light; the yard is a
  slab with tile lines.
- **The skater doesn't look like skating.**
  - The board vanishes under her shoes.
  - The indy is a crouch, the hand nowhere near the board (`audit-17`).
  - The tricks are code-made poses with no anticipation, pop or catch, so they read as twitches.
  - Snow lies on her head and shoulders indoors.
  - The shotgun stays slung on her back.
  - On a ramp she sinks halfway into it (`audit-04`).
- **The feel is the wrong way round.** Plan 103 made it floaty (g 8 m/s², a 1.2 s flat ollie). Tony Hawk's is heavy
  and fast: a flat ollie lasts about 0.5 s; the big airs come from speed.
- **The HUD is the walker's.** The dock and the at-hand bar stay up. The combo is a small box. There's no special
  meter and no score of the session.
- **The controls fight each other.** A/D both carve and spin; E/R/F with a direction also spin you in the air. Our
  direction maps differ from Tony Hawk's (our left-grab is the Indy, his is the Melon).
- **The sound** was cut by measurement, never heard; only a handful of slots.

## The reference — Tony Hawk's Pro Skater

Sourced numbers, mostly from Neversoft's released THUG source (the THPS3/4/THUG engine line; the 2020 remake reused
Neversoft code and kept its feel), plus the remake's official control page. Where the number lives in a script
nobody released, it's marked *est.*

| Area | Tony Hawk's | Ours now |
| --- | --- | --- |
| Top speed | ~25–28 m/s ("about 1100 in/s, depends on stats") | 16 m/s, push to 7.6 |
| Pushing | auto-kick below ~1.3 m/s, so you never stall; the Speed stat sets top speed and push rate | W held pushes |
| Flat ollie | ~0.5 s in the air ("around 30 frames"); hold to crouch, release; height by hold time, *est.* 0.6–1.0 m | 1.2 s, 0.75–1.45 m (floaty) |
| Gravity | heavy (it follows from 0.5 s ollies) | 8 m/s² (moon) |
| Vert | velocity turned into the ramp's plane: straight up, auto-turn to face back in, back down; break vert by pressing up/break | straight up and back, no auto-turn |
| Vert air | *est.* 3–5 m over the coping, 1.5–2.5 s | ~1.6 m at 9 m/s |
| Landing | auto-upright ~5°/frame in the air; stick angles; fakie or forward snapped to; bail *est.* past ~45–60° sideways, mid-trick, upside down | 52° sideways, mid-trick |
| Grinds | caught only in the air with grind held; parallel approaches favoured; grinds add speed | caught by F, lose speed |
| Balance | an inverted pendulum (manuals, grinds, lips): drift grows with time held, **carried over the whole combo**; repeats make it harder | pendulum per trick, reset each time |
| Glue | manual, revert, spine transfer, acid drop | manual, revert |
| Scoring | base × repeat (100/75/50/25/10 %) × **spin ×1.5/2/2.5/3/3.5**, ×1.2 switch; combo ×(trick count); kickflip 100, varial 300, indy 300, Madonna 750 | spin +100 a half turn; other bases |
| Special meter | fills from combos (full at 3000), lit it drains ~15 s, raises speed, unlocks specials (e.g. a McTwist 5000), a bail empties it | none |
| Controls (PC) | Space ollie, flip / grab / grind on their own keys, **Q / E spin**, A / D steer, a break / revert key | E R F + WASD, A/D also spin |
| Flip map | ← Kickflip, → Heelflip, ↑ Impossible, ↓ Pop Shove-it, ↖ Hardflip, ↗ Inward Heel, ↙ Varial Kickflip, ↘ Varial Heel | close, differs |
| Grab map | ← Melon, → Indy, ↑ Nosegrab, ↓ Tailgrab, ↖ Japan, ↗ Madonna, ↙ Benihana, ↘ Airwalk | differs |
| Grind map | none 50-50, ← Noseslide, → Tailslide, ↑ Nosegrind, ↓ 5-0, ↖ Overcrook, ↗ Crooked, ↙ Feeble, ↘ Smith | differs |
| Doubles | tap again: Kickflip → Double, Melon → Method, Indy → Stiffy | flips only |
| Animation | hand-keyed / mocapped clips; the board a bone of the skater, so a flip spins it and it's caught back under the feet; grab in → hold loop → out; balance poses blended by the meter's lean | carStep poses in code |
| Camera | lerps 0.25 across / 0.5 up a frame; heading by the velocity; **on vert it looks straight down the ramp from above the coping**; rolls with the grind's lean up to 30°; presets Normal / Far / Low / Near; *est.* 3–4 m back, 1.5–2 m up, FOV 70–80° | the walker's, clipping |
| Parks | a 10 ft (3.05 m) module, 4 ft (1.22 m) height steps; quarter pipes on a 10 ft transition, vert 11–14 ft with 1–2 ft of vert; masonite / plywood / steel / concrete each with its own sound; heavy graffiti, motivated light (tubes, street lamps, sunset), dense lines and named gaps every few metres | flat brown, few lines |
| HUD | the trick string lower centre, growing and pulsing; score in a corner; special bar; a grind meter as an arc above the string, the manual meter upright by the skater; the pot counts into the score on landing | a walnut box over the walker HUD |
| Audio | 11 sounds per surface (roll, grind, jump, land, bonk, grind-jump, grind-land, slide, slide-jump, slide-land, powerslide); wheels pitched and loudened with speed; in the air the wheels spin down over ~3 s | 6 slots, measured cuts |
| Skater, board | life size (~1.8 m); the deck 0.8 × 0.2 m, ~45 % of her height, always readable under the feet | the board hidden by the shoes |

What makes Tony Hawk's feel like itself, in short: speed with an auto-kick; heavy gravity and punchy ollies; hold to
crouch, let go to pop; vert assist; rails caught in the air and grinds that speed you up; a pendulum balance that
gets harder through a combo; manual, revert, spine and acid as glue; the multiplier paid only on landing; spin
factors; repeat decay; the special meter; forgiving auto-upright landings with instant trick interrupts; a camera
that looks down on vert and rolls with the grind; per-surface sound; dense parks packed with gaps.

## Forks — decided 2026-11-18 (asked one by one)

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | Speed and gravity | **a)** Tony Hawk's own: top ~25 m/s, auto-kick, heavy gravity (a 0.5 s flat ollie ~0.8 m), vert airs 3–5 m from speed · **b)** his feel scaled to our town: top ~18 m/s, the same heavy gravity and ollie, airs 2.5–4 m · **c)** keep plan 103's floaty feel || **a** |
| F2 | Keys | **a)** Tony Hawk's PC layout: A/D steer, W/S lean, Space ollie, **J flip, K grind, L grab**, **Q/E spin**, Shift revert / break vert, X off; the mouse camera off while riding (the skate camera drives) · **b)** the arrows for direction and a numpad for the tricks (the old PC THPS) · **c)** a gamepad first (PlayStation layout), the keys mapped to it || **a** |
| F3 | The trick list | **a)** Tony Hawk's 1+2 maps exactly (above), its taps to the doubles (Method, Stiffy…), the missing tricks added (Madonna, Benihana, Varial Heel, Overcrook), its base points · **b)** keep ours, fix only the clashes || **a** |
| F4 | Animation | **a)** keyed clips in Blender on our rig with **a board bone**: each trick its anticipation, pop, flip and catch, grabs in / hold loop / out, a pose per grind, balance poses blended by the meter; the legs then locked to the deck by IK · **b)** better procedural poses in code · **c)** licensed mocap (none free for skating; would need buying) || **a** |
| F5 | The camera | **a)** a skate camera after Tony Hawk's: its lerps, heading by the velocity, looking down the ramp on vert, rolling with the grind, kept out of the ramps, presets Normal / Far / Low / Near · **b)** the walker's camera fixed for ramps only || **a** |
| F6 | The parks | **a)** rebuilt in Blender: real ramp construction (masonite faces on plywood, steel coping and plates, screw lines, sheet seams, wear and wax marks), the hall a real warehouse (steel trusses, skylights, fluorescent tubes, graffiti, a viewing deck), the yard a poured-concrete plaza; layouts redesigned on the 10 ft module with lines and named gaps; the physics profiles exported from the same Blender data · **b)** keep the layouts, texture and light them · **c)** one park only, the hall, done properly || **a** |
| F7 | The HUD's look | **a)** a skate HUD that replaces the game's while you ride (the dock and the at-hand bar hidden): the trick string lower centre, score and special bar up top, the grind arc and the manual bar — drawn in our walnut and ink · **b)** the same, in Tony Hawk's bold punk-print style · **c)** keep the box, hide the rest || **b**: Tony Hawk's bold punk-print style (the user, 2026-11-18) |
| F8 | The special meter | **a)** yes: fills from combos, lit it drains ~15 s, raises speed, unlocks about 8 specials (each its own clip), a bail empties it · **b)** no specials || **a** |
| F9 | Gaps and goals | **a)** named gaps in both parks (a transfer, a rail, a hip… each scored) and your best scores · **b)** (a) plus Tony Hawk's 2-minute sessions with goals and letters to find · **c)** none || **a** |
| F10 | More glue | **a)** spine transfers, acid drops, wallplants (the remake's) · **b)** (a) plus skitching cars · **c)** none || **a** |
| F11 | The skater on a board | **a)** the guns stowed out of sight while riding, no snow on her indoors, the board's size and colours made readable from the camera; clothes stay hers · **b)** (a) plus a skate outfit put on with the board || **a** |
| F12 | The sound | **a)** Tony Hawk's 11 slots per surface (concrete, wood, metal, asphalt), recorded candidates, wheels pitched by speed, spin-down in the air, **picked by your ear on a `/dev/skate-sound` bench** · **b)** I pick || **a** |
| F13 | Sign-offs | **a)** your sign-off at each visual phase, on stills and short gameplay videos side by side with the reference, before the next one builds on it · **b)** the mocks only · **c)** none || **c**: no sign-offs — the user tests at the end (2026-11-18), and asked for care with the board's direction (below) |

## The board's direction (the user, 2026-11-18)

> here my skater was going backwards, going na diagonal etc... be careful on this part

What's wrong, from the code: three things say which way a board goes, and plan 103 lets them disagree.
- The step's `b.yaw` is the nose, but the board rolls along `±yaw` by the sign of `s` (fakie when it's negative).
- The person is drawn turned `yaw ± 90°` (sideways), smoothed at 14 rad/s (`Person3D.turned`). Others get only a
  byte of yaw at 20 Hz.
- On getting on, the speed is the walking velocity projected on the facing, so a sideways walk gets on rolling
  diagonally to the way she faced.
- After a vert air or a revert the nose flips 180° in a step; drawn smoothed, she swings round the long way.
- `landing` snaps the nose to the velocity in the tangent plane, but then the camera's yaw (the velocity) and her
  drawn facing (yaw + 90°) can be a quarter turn apart for a moment.

What it must be (checked every phase):
- **The board always rolls along its own length**: the velocity is ±nose, never across it (a powerslide is the only
  sideways roll, and it's its own state).
- **Fakie only when it should be**: getting on rolls forward along the way she faces (the nose ahead of her lead foot);
  fakie only after a vert air without a 180, a revert, or a 180 landing; and the HUD says "Fakie" when it is.
- **Her body, the board and the camera agree**: she's drawn exactly sideways to the board (no smoothing lag on the
  turn, the board and the body one rigid frame), a 180 turns her the short way, and the camera sits behind the way it
  rolls.
- **Others see the same**: the wire carries the nose and fakie exactly (not a byte of facing smoothed).
- **Tests**: in Node, the velocity against the nose every step of every ride in the suite (never more than 2° off,
  powerslides apart); in the browser, an e2e that rides straight, carves, ollies, does a vert air, a revert, a 180, and
  checks the drawn board's, body's and camera's headings against the step's.

## Guardrails

- Mechanics and specs from Tony Hawk's; nothing of its levels, skaters, logos, art or music copied. The parks are
  our own layouts.
- Every phase ends with gameplay screenshots and a short video from the game's own camera (as `e2e/skate-audit.mts`),
  compared with the audit's "before".
- The physics stays pure and tested in Node; the feel is tuned on a `/dev/skate` bench with live sliders.
- Plan 103's guardrails carry on: the wire's 64 fields, the page budget, memcheck, the item whitelist.

## The phases

0. **The look, signed off first**: a reference sheet (ours against the Tony Hawk's numbers above), Blender mocks of
   one ramp up close (masonite, coping, screws, wear), the hall's interior, the yard, and the skater's key poses
   with the board bone — stills for your sign-off.
1. **The feel**: speed, gravity, the ollie, the auto-kick, vert assist with auto-turn and break-vert, landings with
   auto-upright, grinds that add speed, the pendulum carried through a combo — retuned to F1, on the `/dev/skate`
   bench and in Node tests.
2. **The keys and the tricks**: F2's layout, F3's maps and taps, buffered inputs, instant trick interrupts.
3. **The camera**: F5.
4. **The animation**: F4 — the board bone, the clips, the blends, the IK to the deck.
5. **The parks**: F6 — built, lit, their gaps placed (F9).
6. **The HUD, the score and the special**: F7, Tony Hawk's scoring, F8.
7. **More glue**: F10.
8. **The skater**: F11.
9. **The sound**: F12.
10. **Checks**: Node, e2e videos against the audit, memcheck, the page budget.

## Progress (2026-11-18)

**How to try it:** an admin's Spawn tab → A skateboard (or a park's rack: Use), then 1. **A/D** steer, **W** push,
**S** brake (a powerslide at speed), **W/A/S/D** the tricks' directions, **Space** held crouch / let go ollie, **J**
flip, **L** grab (held; again: the upgrade), **K** grind / lip / wallride, **Q/E** spin, **Shift** revert (just after
landing in a ramp) / break vert (spine transfer, acid drop), **Space at a wall in the air** a wallplant, **W then S**
a manual (S then W, a nose manual), **X** off, **C** the camera (Normal / Far / Low / Near). Lit special: two
directions then the key (→↓ + L a McTwist, ←↓ + L a Christ Air, ↑↓ + L a Judo, ↓↑ + J a Ghetto Bird, ←→ + J a
Fingerflip Airwalk, →← + K a Darkslide, ←→ + K a Casper Slide, ↑↓ + K a Hang Ten). The sound's picks:
`/dev/skate-sound`; the HUD's look: `/dev/skate-hud`.

- **Feel and rules** (shared `skate/`, 19 Node tests): heavy street gravity (a ~0.5 s, ~0.95 m ollie), the ramps' and
  vert air's lighter (2.5–6 m over the coping, 1.2–2.5 s); push 11, the auto-kick, top 25; the vert assist turned
  back in (forwards); break vert; spine, acid, wallplant, powerslide; Q/E spins; THPS 1+2's maps, upgrades,
  score.cpp's spin factors and repeats; the special meter and 8 specials; grinds that speed you up; the pendulum
  carried through the combo; the needle and the glue's moments on the wire.
- **The direction**: the board rolls along its own length on every step of every Node ride (< 2°); in the browser
  (`e2e/skate-direction.mts`) the nose against the way it rolls 0.0°, her body against the nose 6.8° at worst (was
  66°), the camera against the way it rolls 28°.
- **The camera** (`skate/camera.ts`): Neversoft's lags, behind the way it goes, out over the pipe on vert, rolled with
  the grind, kept out of the ramps, four presets.
- **The animation** (`tools/art/skate-anim/`, `public/life/skate/anim.json`, `skate/pose.ts`): 80 clips with a board
  bone, mirrored for goofy, remapped per board, feet locked to the deck; guns stowed while riding; no snow on anyone
  under a roof on the land.
- **The parks** (`tools/art/skate-parks/`, `public/life/skate-parks/`): both rebuilt in Blender from the profiles
  (4 mm at worst); the hall a brick warehouse; masonite ramps, steel coping; the yard poured concrete; 12 new piece
  kinds; 21 named gaps scored in the combo (`skate/gaps.ts`).
- **The HUD** (`skate/hud.ts`): the punk zine — clippings for the tricks, the torn score sheet, the special bar, the
  grind arc and manual bar; the walker's dock and at-hand hidden while riding.
- **The sound** (`skate/sound.ts`, `public/sfx/skate/`): 11 slots × 4 surfaces (25 recorded, 19 reused) and the
  board's own; others' boards heard.
- **Checks**: Node (shared skate 41, client skate 12 + shapes), the direction e2e, gameplay stills
  (`design/skate/audit104/` against `design/skate/audit/`), the page 490.9 of 491 KB, memcheck 3 cycles flat
  (geometries, textures, programs, sound nodes, heap).

### Left, or not checked
- The sound and the HUD are picked / styled by me: yours to change on their benches.
- In memcheck's own world the board's first get-on of a cycle is sometimes refused (it works at once on the dev
  world); the car's life in memcheck failed once ("not parked after getting out") — not the skate's.
- The kick-up clip never plays (the board's dropped the moment you step off); no stumble for a small slip.
- The yard's concrete edges are sharp; its bowl stands on the slab rather than sunk in; the hall in daytime is lit by
  its tubes' glow and the ambient only.
- Headless key timing runs behind the sim's clock: bails and trick timing are checked in Node, not in the browser.

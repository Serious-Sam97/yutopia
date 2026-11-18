# Plan 106 — the skater's animation, redone

Asked 2026-11-18 (a screenshot of the push: the back leg kicked up behind her):

> Ok, now we you need to do a attention and improve all ANIMATIONS, idle, ollie etc... is trash. Lets plan

Status: **planned 2026-11-18; forks decided 2026-11-18: F1c, from video — real skaters' footage, free stock (Pexels,
Pixabay) and CC-BY (credited), turned into 3D motion by an open-source model on this Mac; Tony Hawk's 1+2 gameplay
only as a reference to compare timing and feel against (its own mocap is its art: not traced); F2b, no sign-off,
you test at the end; F3a, every clip; F4a, the life layers on top. Built 2026-11-18: see Progress.**

## What's wrong (the audit: `design/skate/anim104/*-side.png`, the game's own screenshots)

Plan 104's 80 clips were keyed by script from numbers, with no footage to key against. It shows:
- **The stance is a squat.** Knees bow outward, the trunk sits square over the feet, the arms hang with stiff elbows.
  A skater's knees track over the toes, the hips and shoulders turn along the board, and the head looks down it.
- **The push is wrong.** The back foot kicks up behind her instead of stepping down beside the board and sweeping back.
- **The flips are one pose.** It's the same crouch with only the board spinning: no pop of the tail, no front foot
  sliding up the grip, no flick, no catch. In the shove-it, varial and hardflip her legs cross in an X.
- **No weight or timing.** No anticipation before the pop, no absorb on landing, no follow-through in the arms. The
  balance poses and grabs are held stills.
- **Grabs don't read**, and the grinds and vert clips weren't seen in motion at all before shipping.

## What real skating looks like (the spec every clip is checked against)

- **Stance**:
  - Feet about shoulder width (~50 cm). The front foot is just behind the front bolts, turned 30–45° toward the nose;
    the back foot is across the tail, 70–90°.
  - Knees bent 15–25° over the toes. The hips are sideways; the shoulders are 10–20° open toward the nose.
  - The head is turned 60–80° down the board; the arms are loose, a little out.
  - Weight shifts by the ankles and knees, never by the waist.
- **Push** (a cycle of 0.6–0.8 s):
  - The front foot pivots to point down the board, the body turns to face the way it goes, and the front knee bends.
  - The back foot steps down on the toe side beside the front truck, sweeps back, lifts low, and comes back to the
    tail (or plants for the next kick).
- **Ollie**:
  - The crouch takes 0.15–0.3 s; the hips drop 25–35 cm and the arms come down and back.
  - The pop: the back foot snaps the tail (~40 ms) while the body rises.
  - The front foot slides up the grip toward the nose, its side dragging.
  - At the top the knees are pulled to the chest and the board is levelled under the feet.
  - The landing: the feet over the bolts, the knees absorbing 15–25 cm over ~0.15 s.
- **Flips**:
  - The ollie's pop, then the flick: the kickflip off the front foot's toe edge at the nose's heel-side corner, the
    heelflip off the heel.
  - The feet pull up and out of the board's way. The catch is a front foot first (or both), stamped down.
  - Shove-its are scooped by the back foot behind; the legs never cross.
- **Grabs**: the knees come up to the board, the hand reaches it, the body bends to it, the free arm is out; the
  release comes before the landing.
- **Grinds and slides**: weight over the truck that's on the rail, the knees low, the arms out, the body square to the
  rail on a slide.
- **Vert**: low through the transition, extended at the lip, tucked in the air; landing, the body is perpendicular to
  the wall.

## Where the motion can come from

- **Real motion capture, bought.** Reallusion's "Skateboard – Flatground Skate Tricks"
  (Monkey Chow / Motion Capture Orlando) is 26 mocap clips: push, tic-tac, ollie, flips, shove-its, the board synced.
  Paid, royalty-free; its price and export path (FBX for Blender) need checking on the store. I can't buy it — you
  would.
- **Mixamo** (Adobe): free for use in a game (not redistributed on its own), but whether it has skateboarding clips
  isn't confirmed.
- **CMU Motion Capture Database**: free for any use, but skateboarding isn't confirmed in it.
- **Keyed by hand again, against footage**: frame-by-frame timing from real skating, the spec above, and a review bench.
  It costs nothing, but it's the slowest path and still hand-made.
- **From video**: open-source pose estimation on licensed or your own skating footage. Experimental, noisy.

## Forks — decided 2026-11-18

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | Where the motion comes from | **a)** real mocap as the base: you buy Reallusion's skate pack (26 clips: push, ollie, flips, shove-its), I retarget it to our rig in Blender and key the rest (grabs, grinds, vert, lips, specials) on top of its stance, crouch and landing · **b)** keyed by hand again, but frame by frame against real footage and the spec above, with your sign-off per group · **c)** from video: pose estimation on footage (yours or licensed), cleaned in Blender || **c**: from video — real skaters (stock: Pexels / Pixabay; CC-BY, credited), an open-source model run here; Tony Hawk's gameplay a reference only (the user, 2026-11-18) |
| F2 | Reviewing it | **a)** a `/dev/skate-anim` bench: each clip on our real character with the board, scrubbed, slowed, looped, the side view and the game's, with your sign-off per group (stance & push → ollie & flips → grabs → grinds & manuals → vert & lips → bails & specials) before the next is built · **b)** no sign-off, built straight, you test at the end || **b**: no sign-off (the user, 2026-11-18) |
| F3 | Scope | **a)** every clip (~80), in the order above · **b)** the core first (stance, push, carve, crouch, ollie, land, the 8 flips, 4 grabs, 50-50 / 5-0 / boardslide, manual), the rest after your feedback || **a** |
| F4 | Life on top of the clips | **a)** yes: procedural layers over every clip — the lean into a carve, the landing absorbed by speed, the head looking where it goes, the arms swinging on springs, small breathing and weight shifts at a stand — so it never looks like a loop · **b)** clips only || **a** |

## The pipeline (F1c)

1. **Footage**: per trick, real skaters filmed from the side or three-quarters, the whole body and board in frame,
   steady (a tripod's or a follow cam's), 24–60 fps. Candidates found on Pexels and Pixabay (their licence) and under
   CC-BY (YouTube, Vimeo, Wikimedia Commons: credited in `credits.json`) — listed with links, licences and sizes for
   your OK before anything's downloaded.
2. **3D motion**: an open-source world-grounded human-motion model (GVHMR, or WHAM) installed here — Python, PyTorch on
   the Mac's GPU (MPS), its weights downloaded once (a few GB, from the projects' own releases; your OK first).
   Nothing leaves the machine.
3. **Retarget**: its SMPL body's motion onto our rig in Blender (`tools/art/skate-anim/`), scaled to her proportions.
4. **The board**: keyed from the feet (it's under them, between the bolts) and, for flips, from the footage's frames;
   its spin kept the trick's.
5. **Clean-up**: the feet locked to the deck where they're on it (the clip's contacts), the jitter filtered, the timing
   matched to the game's (a flip's length, an ollie's air), the loops made seamless.
6. **Gaps**: what no footage covers (vert, lips, specials, some grinds) keyed by hand on top of the captured stance,
   crouch and landing, against Tony Hawk's gameplay for timing only.

## The phases

0. The reference: the spec above as a sheet, a frame-timing table per clip; the footage found (for your OK), the
   model installed (for your OK).
1. The bench (F2).
2. Stance, idle, push, carve (the base everything else blends from).
3. Crouch, ollie, land, nollie, fakie.
4. Flips.
5. Grabs.
6. Grinds, slides, manuals.
7. Vert, lips, reverts, wallrides.
8. Bails, get-on, step-off, kick-up, specials.
9. The life layers (F4).
10. Checks: every clip in the bench and in the game, the feet on the deck, the direction e2e, the page budget.

## Progress (2026-11-18, built)

**The footage and the tool.** 15 Pexels clips (`tools/art/skate-anim/sources.md`, ~50 MB, not committed) → MediaPipe
Pose (Apache-2.0, on the CPU, ~5 s a clip) → `poses/<id>.json` and contact sheets. Six track the whole skater well:
a push and a bail (5039768), a 60 fps ollie (9723989), an ollie onto a ledge and a 50-50 (5039465), a drop-in, a
quarter and a fall (7644974), pushing (7634653), a kick turn (5039488); the rest are feet close-ups (the foot angles).

**What one camera gives, and what it doesn't** (the change from the pipeline above). A frame-by-frame retarget was
built (`capture.py probe`) and dropped: from one camera the turn about the vertical (the board's heading, the hips' and
shoulders' yaw) swings by tens of degrees with the depth's guesses. What holds is measured (`capture.py measure`,
and `audit.py` measures our clips the same way): the hips over the lowest sole, the knees' bends, the knees' width
against the ankles', the trunk's lean, the arms' elevation and elbows, the feet off the ground, and timing.

| | real skaters | ours, plan 104 | ours now |
| --- | --- | --- | --- |
| stance: hips / knees / knees' width / lean / arms | 0.97–1.05 · 15–45° · 0.65–0.85 · 15–30° · 35–75° | 0.98 · 49° · 1.02 · 12° · 20° | 0.99 · 45° · 0.71 · 15° · 40° |
| crouch for the pop: hips / knees | ~0.8–0.87 · 70–85° | 0.64 · 110° (a squat) | 0.79 · 88° |
| the pop | legs straightened to ~1.1 | 0.75 | 1.05 |
| the air: knees' width | knees together | 1.23 (bowed) | 0.62 |

**Built.**
- The base poses from the numbers: the stance (knees over the toes, inside the ankles; the trunk over; the arms
  loose and out; a 3.2 s breath and weight shift), the crouch, the air, the tuck, the arms out (front high, back low),
  the grind's hips and lean.
- The push: the back foot stepped down flat beside the front truck, swept back along the ground, the heel peeling,
  lifted low and carried forward — not kicked up behind; the arms against the legs.
- The ollie and the landing timed off the 60 fps ollie (the pop's extension, the knees to the chest, the legs let
  down, the absorb and the rise back to the stance).
- The flips: the flick (the foot out to its side and up, its knee leading), the legs drawn up and apart over the
  turning board (never crossed), the catch front foot first and stamped, the arms thrown and floating. A half-turn
  board (shove-it, varial, hardflip, inward heel) lands with her feet on it as on any board (`sw`, in the builder and
  in the client's swap).
- The grabs' boards brought up to the hand; the lips' way out levels the board under her.
- The life (F4a, `pose.ts`): a breath and the weight drifting foot to foot at rates out of step with the loop, the head
  into a carve, the neck, head, shoulders and elbows on springs (a beat behind, a little overshoot; let go where a hand
  holds the board).
- **The bug behind the screenshot**: `mapPoint` (a spot on the street board onto each board's own) divided the span
  behind the rear bolts by `bolts + tail` with the tail negative, clamped to 0.01 — every spot behind the rear bolts
  was flung ~1.5 m past the tail, so the back foot's IK threw her leg out behind her, on every board, in every pose.
  Fixed, with a test.

**Checks.** The client's pose tests (7, the new mapping one too), tsc, biome; the direction e2e (nose 2.9°, body 3.8°,
camera 28°: ok); the budget (/page 490.9 of 491, the skate chunk 5.3 of 15 KB); the stills: Blender's
(`design/skate/anim106/*-side.png`, `roll-game.png`) and the game's from both sides (`anim106/game`, `game-front`).

**Not done.** The grinds' and slides' own keys, the lips, the vert airs, the specials and the bails weren't re-keyed
one by one: they take the new base poses and arms, not clip-by-clip work. The landing isn't scaled by the fall's speed.
There's no `/dev/skate-anim` bench (F2b: no sign-off).

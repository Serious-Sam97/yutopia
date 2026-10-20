# The move — a body that feels good to drive (plan — decided 2026-10-20)

> Comes before `30-the-dark.md` (the Grounds' co-op survival), which builds on
> it: aiming, the dodge, stamina. Workflow rule: mocks first (phase 0),
> approved before any code. And the car's gate again: **the feel is signed off
> in a sandbox (phase 1) before it goes into the world.**

Ask (2026-10-20): "I want to improve a lot the gameplay of my game … today we
only jump and a misery run that is bad, so let's improve and create mechanics
to add actions and improve the controls of the character."

## Where we are

- **No momentum.** `moveLocal` (`controller.ts` :1565) sets the position from
  the keys each frame: full speed in one frame, a dead stop on release, any
  turn at once. Only the drawn facing eases.
- **Speeds**: `WALK_SPEED` 4.2 and `RUN_SPEED` 7 tiles/s (`grid.ts` :411),
  Shift to run, `speedOn` per surface outdoors. A tile is about a metre, so
  the walk is already ~15 km/h.
- **The run is the walk** with a longer stride (`chars/motion.ts` :630, k ≈
  1.22): no flight phase, no lean. It isn't on the wire: the server keeps only
  walk or sit (`WorldRoom.ts` :505), and others guess a run from speed.
- **The jump** (`shared/jump.ts`): a hop, or a flip on the run. A 90–110 ms
  crouch before the feet leave the ground; pressing during it does nothing.
  A 220 ms buffer while falling, but no coyote time; the height is fixed; full
  air control.
- **The step**: a variable frame time capped at 0.1 s, gravity's at 0.05 s:
  falls are slower under 20 fps. The car has a fixed 1/120 step.
- **Keys** by `e.key` (`controller.ts` :3348), so WASD breaks on AZERTY; the
  3D view reads `e.code`, so E both uses things and turns the camera.
- **The pad**: the left stick is normalised (any tilt is full speed); A uses,
  B runs; no jump.
- **The camera** (`tp/view.ts` :1465): chase eases in behind your facing while
  you walk; on a diagonal (W+D) facing and camera chase each other in a slow
  spiral.
- **Others**: drawn 110 ms late by arrival time, no extrapolation; their pose
  and facing change the moment a patch lands, before their body moves; 3D
  facing in 8 steps.
- **The verbs**: walk, run, hop, flip, sit (a seat tile), use (X/E), the
  socials and emotes. Nothing to get over a bench, nothing to duck, nothing to
  dodge.

## The idea

**A body with weight that does what you mean.** It leans into a sprint and
plants its feet to stop; it skates on the pond and wades in the woods' deep
snow. A tap is a little hop, a hold a real jump; a step off a ledge still lets
you jump. Run at a bench and you vault it; at a wall to your chest and you
climb onto it. Crouch to go quiet. Roll out of the way. Aim over the shoulder
with the torch. Others see exactly that — their sprint, stop, strafe and
landing in step with where they are. On a pad it's analog all the way; on
any keyboard layout the keys are where your fingers expect them.

## The mechanics

### M0 — Where it lives: a pure core in shared

`packages/shared/src/move/` (subpath `@yutopia/shared/move`, like `car/`):

- `spec.ts` — every number as data (tuned in `/dev/move`).
- `surface.ts` — `footGrip(surface)`: accel, decel, turn and slide per
  ground. `Outdoors` gets `grip?` beside `speed?`; `Grid.gripAt()` beside
  `speedAt`.
- `step.ts` — `stepBody(state, input, env, dt)` on a **fixed 1/120 s step**;
  the view draws between steps. State: position, velocity, feet height and
  vz, yaw, gait, crouch, the coyote and buffer timers, the current verb.
  Input: a move vector with its magnitude (0..1), sprint, walk, crouch, aim,
  jump held and pressed, dodge, the look yaw. Collision stays `moveStep`
  (the wall slide), the feet stay `stepHeight` (`jump.ts`).
- `verbs.ts` — `probeVault`, the roll, each verb a curve in time: the same on
  both ends, replayable.
- `allow.ts` — the speed ceiling the server allows per gait and verb.

### M1 — Gaits

| Gait | Tiles/s | How | Notes |
|---|---|---|---|
| walk | 2.2 | Alt held · a light tilt | quiet |
| **jog** | 4.2 | the default on keys (today's walk) | indoors feels the same |
| sprint | 6.8 | Shift · L3 | up to 45° off ahead; stamina outdoors (plan 30) |
| crouch | 1.6 | C · B | quiet, low; half as easily seen (plan 30) |
| aim | 2.0 | RMB · LT | strafing, facing the camera |

On a pad the stick's tilt picks the speed between walk and jog; sprint on top.

### M2 — Feet on the ground: grip per surface

| Surface | Accel (t/s²) | Decel | Turn | Feel |
|---|---|---|---|---|
| floor · walk · asphalt | 30 | 38 | crisp | starts and stops in ~0.15 s |
| path | 24 | 26 | firm | |
| snow | 18 | 22 | soft | speed ×0.85 (`speedOn`, as now) |
| deep | 10 | 16 | heavy | ×0.6, wading |
| ice | 4 | 2.5 | keeps momentum | **you skate**: a stop is a slide |
| rock | 20 | 24 | firm | ×0.7 |

The facing turns at most 12 rad/s on the ground, 4 in the air. Velocity on a
wall keeps its slide along it.

### M3 — The jump

- **Take-off in 40 ms** (was 90–110): the crouch is drawn overlapping it.
- **Variable height**: let go while rising and vz × 0.45 — a tap ~0.55 tiles,
  a hold 0.8; the flip on a sprint 1.45, as now.
- **Coyote time** 110 ms after stepping off; a press 150 ms before landing
  (ground) or 220 ms (falling, as now) is kept.
- **In the air**: 30% of the ground's accel; momentum carries.

### M4 — The verbs

| Verb | Trigger | What | Server |
|---|---|---|---|
| **vault** | jump at something whose top is 0.3–0.75 above the feet, within 0.6 tiles, clear ground ≤ 1.4 beyond | over it in 0.45 s, a hand on top | re-probes on its grid (±0.3) |
| **mantle** | jump at a top 0.75–1.4 with room on it | climb up in 0.6 s | re-probes |
| **roll** | Q · LB | a 0.35 s burst (~8.5 t/s), i-frames 0.1–0.25 s, 0.25 s to recover | allowance for the window |
| **crouch** | C (a toggle; hold in settings) · B | lower, slower, quieter | `mv` bit |
| **slide** | crouch while sprinting | down on one hip, the lead leg out, ~3.5 tiles, slowing with the ground's grip (long on ice, short in deep snow); up into a run, or stays crouched | allowance for the window |
| **aim** | RMB · LT | over the shoulder; the torch focuses (plan 30) | `mv` bit + yaw/pitch |

The `jump` message carries them: `JUMPS` becomes `hop | flip | vault | mantle | slide
| roll`, and the server lifts its height cap for the window, as it does now.
Low things outdoors get heights as data (`Outdoors.top?`: benches, logs, low
walls, a car's bonnet) — today trees and rocks are only "not walkable".

### M5 — The camera

- **The spiral, fixed**: chase eases in behind your **velocity**, only when
  you've moved roughly ahead (within 25°) for 0.4 s; never while aiming,
  strafing, backing up, or on ice. The rate grows with speed.
- The look-at point follows on a damped spring with a little look-ahead.
- **Aim**: over the shoulder (0.45 right, 0.25 up, 2.3 back), the FOV 62° → 52°
  in 0.15 s, the body facing the camera; V / R3 swaps the shoulder; `camView`
  keeps it out of walls.
- **Sprint**: +4° FOV and a little bob, both off with reduced motion.
- **Iso**: aiming switches to 3D (as getting into a car does).

### M6 — The look: animation

`MotionIn` grows: the velocity in the body's frame (ahead, side), gait, turn
rate, acceleration, aim (yaw offset, pitch), how hard you landed, the verb and
how far into it.

New poses in `chars/motion.ts`:

- **run** — its own cycle: a flight phase, knees up, elbows at 90°, leaning
  0.15 rad into it; **sprint** further.
- **crouch**, **crouch-walk**; **strafe** (a side-step), **backpedal** (shorter,
  the walk reversed).
- **land** — a squash by the speed it came down at.
- **aim** — the torch in the left hand, the right free (a gun in plan 30); the
  spine takes up to ±60°, the head the rest.
- **vault**, **mantle**, **roll**.

Four directional cycles blend by the angle between velocity and facing; a lean
from turning and accelerating on top; the phase follows distance, so the feet
don't slide. Iso gets new bases: sprint, crouch, aim, roll (strafe draws as a
walk), within the sprite cache (`KEEP`).

### M7 — Together

- `Player` gains, **beside** `a` (which keeps its meaning for its ~55 readers):
  `mv` (gait · crouch · aim · down bits), `yaw` (uint8), `pitch` (int8), `mt`
  (the sender's clock, ms). `pos` carries them, at 20 Hz and at once on a
  change of `mv`.
- **Others are played back on their own clock**: an offset per person (the
  lowest arrival − `mt` over 2 s) + 110 ms. No jitter, no clock sync.
- Their pose, gait and jump are read **from the sample being drawn**, not when
  it arrives. No new sample: carry on up to 150 ms (Hermite, as the cars), then
  ease back.
- **The server's check** becomes a distance **allowance** per person: it grows
  by the ceiling for your gait or verb (`allow.ts`) × time, up to 1.2 tiles of
  slack; each `pos` spends it. Short → `snap`, as now. The fit and clear-way
  checks stay.

## Controls

| | Keyboard (by position: `e.code`) | Gamepad |
|---|---|---|
| Move | WASD · arrows | left stick (analog) |
| Walk · sprint | Alt · Shift | light tilt · L3 |
| Jump · vault · climb | Space | A / ✕ |
| Crouch (toggle) · slide (while sprinting) | C | B / ○ |
| Roll | Q | LB |
| Use | E · X | X / □ |
| Aim (focus the torch) | right mouse | LT |
| Torch | F | d-pad ↑ |
| Swap shoulder | V | R3 |
| Camera (3rd · free · 1st) | **Y** (was C) | Y / △ (hold) |
| Mouse look | Z | — (the right stick looks) |
| Emotes | 1–8 indoors; a wheel on B outdoors | d-pad ← → |
| Phone · view | P · T | View |

The fire, reload, flare and weapon keys come with plan 30. Bindings are
rebindable (settings, saved in prefs) and come in two sets: **world**
(indoors, as today) and **outside**. The hints show your own layout's labels
(`navigator.keyboard.getLayoutMap()` where there is one). Ctrl is never bound.

## Tooling

**`/dev/move`** — a test pad: strips of each surface (floor, path, snow, deep,
ice), a ladder of obstacles (0.3, 0.5, 0.75, 0.9, 1.2, 1.6), gaps 1–4 wide,
stairs, a 15% ramp, a narrow corridor, pillars to slide along, a ring to walk
the diagonal on. Graphs of speed and accel; the grounded / coyote / buffer
windows on a timeline; the input and the stick. The probe drawn in the world.
**A ghost**: a second body fed your input through the real remote pipeline,
with latency, jitter and loss sliders. A slider per number in `spec.ts`, "copy
as JSON". `?world=grounds&at=…` drops you on the real Grounds.

## Phases

| # | Phase | Exit test |
|---|---|---|
| 0 | **Spec + mocks**: the controls table, the feel numbers, a **pose sheet** (run, sprint, crouch, strafe, backpedal, land, aim, vault, mantle, roll — drawn by the pose code that stays, in 3D and iso), the camera diagrams | approved, in `design/screens/move/` |
| 1 | **The core + the sandbox**: `shared/move/*`, the input chunk with the pad, `/dev/move` | the numbers below; **you play it in `/dev/move` (keyboard and pad) and sign off the feel** |
| 2 | **Walking in the world**: the fixed step in `moveLocal`, the bindings and rebinding, the camera, the server's allowance and verbs, the new `pos` fields | the `walk-angles`, `jump`, `first-person`, `mouse-look`, `controllers` e2e green; a diagonal ring walked without the camera spinning; no honest snaps in 5 minutes of bots |
| 3 | **The look + others**: the new poses, iso bases, playback on the sender's clock | two browsers with jitter: B sees A sprint, stop, strafe and land in step; iso matches |
| 4 | **The verbs in the world**: vault, mantle, roll, crouch, aim (the torch); low outdoor things as data | vault the bench and a desk, climb a 1.2 block, roll through a gap; the server takes all of it; `move.spec` |
| 5 | **Checks**: budget, perf, Firefox, PROGRESS | page ≤ 554 KB; `yutopia-input` ≤ 15 KB |

### The numbers phase 1 must hit

| Test | Target |
|---|---|
| 0 → jog, floor | ~0.15 s |
| Jog → stop, floor | ≤ 0.15 tiles |
| Jog → stop, ice | 2.5–4 tiles |
| Jump take-off | 40 ms after the press |
| Hop: tap · hold | ~0.55 · 0.8 tiles |
| Coyote · buffer | 110 ms · 150 ms (ground) / 220 ms (falling) |
| Vault / mantle choice | right on the obstacle ladder, every height |
| Determinism | the same input → the same bits |
| Frame-rate | the same apex at 30, 60 and 144 fps |

## Engineering notes

- **The page's budget** has ~0.4 KB left. The input code and the core load as a
  lazy chunk (`yutopia-input`) while the room connects; the page keeps a
  ~300 B shim. Removing the old `moveLocal` walking, `gamepad()` and the
  `e.key` handling pays for it. Measure each phase.
- The pad: a radial deadzone (0.15) rescaled, analog triggers, edges for every
  button, rumble (`vibrationActuator`, as the car).
- The car keeps its own map (`car/controls.ts`) and only moves to `e.code`.

## Risks

| Risk | Answer |
|---|---|
| The feel isn't right | the sandbox gate; every number is data |
| The world page grows | lazy chunk; the old code goes |
| Sprite memory in iso | new bases only where they read; measure in `/dev/chars` |
| The allowance lets a cheat through | 1.15 × sprint + 1.2 tiles of slack in a friends' world; fit and clear-way still checked |
| Old e2e specs lean on instant speed | update them in phase 2 |

## Decided (2026-10-20)

| Topic | Decision |
|---|---|
| Inputs | **Keyboard + mouse and gamepad** from day one; touch later |
| Order | **Controls first**, signed off in `/dev/move`, then plan 30 |
| Default on keys | **jog** (today's speed); Alt walks, Shift sprints |
| Camera cycle | moves from C to **Y** (C crouches) |
| Crouch | **a toggle** by default (hold in settings) |
| Slide | **yes**: crouch while sprinting |

## Proposed (yours to overrule)

| Topic | Proposal |
|---|---|
| Emotes | 1–8 indoors; a wheel on B outdoors |
| Aiming in iso | switches to 3D |

## Still open

- Ledge hang and shimmy (outdoors: the ravine)?

## Phase 0 — delivered for review (2026-10-20)

The poses are drawn by code that stays: `apps/client/src/world/chars/moves.ts`
(in the lazy `yutopia-chars` chunk, so the page doesn't grow). Phase 3 wires
it into `Motion3`; phase 1 moves `verbRoot` into `shared/move/verbs.ts`.

- **Second pass (the user: "improve the poses and animations, I know you can
  do better")**: rebuilt as an animator would. Key poses on named channels
  (thigh, knee, foot pitch, spread; shoulder, elbow, wrist; the hips, spine,
  neck, head), eased between with time-aware Hermite splines, a cycle's second
  step its first mirrored. **The feet are planted by solving the leg chain**
  with the build's own lengths (hip joint 0.673, thigh and shin 0.306, the
  shoe 0.19 ahead of the ankle and 0.082 behind), so nothing floats or sinks;
  the head is kept level and looking ahead over whatever the trunk does.
- `runPose(phase, effort)`: one cycle for the **jog** (effort 0, today's 4.2
  speed — the old walk at that speed was a walk too fast), the run and the
  **sprint** (1): contact (heel strike), down (the knee gives), passing, push
  (off the toes, the other knee driven), flight. Effort lengthens the stride
  (`runStride` 1.7 → 2.35 tiles), folds the knee tighter, swings the arms
  harder and leans in. The true walk (2.2) stays `walkPose`.
- `crouchPose` (one knee down on its toes, the other foot flat, the head up),
  `crouchWalkPose` (heel to toe, low), `strafePose(phase, side)` (out, close,
  the weight following), `backpedalPose` (toes first, short), `landPose(impact)`
  (a hard one drops a hand).
- `aimPose(pitch, yaw, gun)`: the torch out at arm's length in the left hand,
  the right ready by the hip or out with a gun; the spine and head take the
  look. The torch is the phone (as now).
- `verbPose("vault" | "mantle" | "roll" | "slide", t)` and `verbRoot`: the
  vault is **a step onto the top and off** (arms out wide for balance — see
  below), the mantle a jump to the edge, a push-up with the hands on the top,
  a knee onto it, standing; the roll goes over the right shoulder; the slide
  leans back on one hip, the lead leg out, heel first. `VERB_LEN` their
  timings.

`/dev/chars?anim=move|jog|run|sprint|land|vault|mantle|roll|slide|verbs`
(with `&t=` to freeze; `verbs` plays each over and over); the vault and mantle
draw their block under the body (a treadmill). `e2e/move-shots.mts` saves them,
and `group~s` records a clip.

Sheets in `design/screens/move/`:

| | |
|---|---|
| `move` | walk, jog, run, sprint, crouch, sneak, strafe, back up, slide, aim · torch, aim · gun, aim · up |
| `move.webm` · `verbs.webm` | **playing**: every gait and aim live; the vault, mantle, roll, slide and landing over and over |
| `jog` · `run` · `sprint` | the cycles, eight moments each |
| `land` | soft to hard |
| `vault` | over a 0.6 block: the hand plants while the feet are still down, the legs tucked over, landing beyond |
| `mantle` | onto a 1.1 block: the hands up to the edge, pulled up, a knee onto the top, standing |
| `roll` | a dive into a tuck, once round, up onto the feet |
| `slide` | down from a sprint onto one hip, the lead leg out, and back up |
| `camera.svg` | today's spiral, the fix (follow the velocity, inside ±25° for 0.4 s), the over-the-shoulder aim |

Seen while making them:

- **Our people's hips are low** (0.61 tiles: short legs, big heads). A crouch
  is a −0.21 drop, not the −0.34 the leg angles suggest.
- **Their arms are short** (as the car found): hanging, the hands are at the
  hips. A hand can't be on a hip-high top while the feet are on it, so the
  vault is a step on and off (a hurdle step), arms out for balance; the mantle
  (a chest-high top) is where the hands go on the edge.
- The bindings and the feel numbers are the tables above (Controls, M1–M4,
  and "The numbers phase 1 must hit").
- The iso sprites of the new poses come with phase 3 (`chars/iso.ts` bakes
  them from the same 3D model).

## Phase 1 — the core and the sandbox: built (2026-10-20), awaiting the feel's sign-off

The user approved phase 0 ("approved, you can start").

- **`packages/shared/src/move/`** (subpath `@yutopia/shared/move`):
  - `spec.ts`: every number (`MOVE`), `STEP_DT` 1/120 s.
  - `surface.ts`: `GRIP` per footing (accel, decel, turn, a slide's friction).
    The footing comes from the caller (`MoveEnv.footing`: grounds.ts'
    `groundSurfaceAt` outdoors), not a new `Outdoors.grip` as first planned:
    the grid stays as it is. `MoveEnv.speed` overrides the grid's `speedAt`
    (the sandbox's strips aren't land).
  - `step.ts`: `stepBody` — acceleration and friction by the grip (skating on
    ice), a stick's tilt as its speed, the sprint only roughly ahead, the
    turn rate, the jump 40 ms after the press, coyote time, the ground and
    falling buffers, a tap's or a hold's height, 30% control in the air,
    hard landings costing speed, the verbs. `MoveClock` runs the fixed steps
    for a frame and says how far between the last two to draw.
  - **The ledge catch** (found while testing): a jump pressed early at
    something too high to clear grabs its edge on the way and climbs up (held
    jump, going at it, in the air) — otherwise you hop into its face.
  - `verbs.ts`: `probeVault` (the tops ahead, read off the grid; it looks
    further the faster you go — a run-up's press comes early), `verbPath`
    (each verb's shape, the poses' `verbRoot` now uses it: the vault's feet
    step onto the top, so the pose's hips are over them), `rollSpeed`.
  - `allow.ts`: `speedCap` and `Allowance`, for phase 2's server check.
  - `move.test.ts`: 15 tests, the numbers below.
- **`apps/client/src/world/input/`** (the `yutopia-input` chunk): bindings by
  `e.code`, rebindable and saved (`yutopia.bindings`), labels from the
  keyboard's own layout; the pad (round deadzone rescaled, analog triggers,
  presses and releases, rumble); `MoveControls` (the way turned from the
  camera's to the floor's, crouch a toggle — or held — with a sprint's crouch
  a slide, L3 sprinting until you stop).
- **`chars/locomotion.ts`**: `Locomotion` — one pose from the body: the walk
  into the jog into the run into the sprint by speed, crouch and sneak, aiming
  over legs that step ahead, aside or back, the jump's arc (a flip turns
  over), landings by how hard, verbs eased out of, leaning into turns and
  speed. `verbT` times a slide's pose by the speed it has lost. Phase 3 puts
  it into `Motion3`.
- **`/dev/move`** (`world/tp/move/sandbox.ts`): the pad (a ladder of walls
  0.3–1.6 to get over, a desk-high top, a platform with 1–4 tile gaps, steps of
  0.12 and 0.25, pillars, a one-tile corridor, the ring, strips of floor, path,
  snow, deep snow and ice); the camera's new rule (it follows where you go
  only going roughly ahead for 0.4 s, not aiming, not on ice); the
  over-the-shoulder aim (0.8 out — our heads are big — 0.35 up, 2.6 back, FOV
  52°, a crosshair); first person on Y; graphs of speed and the feet with
  what happened; a slider for every number and each footing's grip, "copy the
  numbers"; `window.__move` (place the body, point the camera) for tests.

| Test | Target | Got |
|---|---|---|
| 0 → jog, floor | ~0.15 s | 0.14 s |
| Jog → stop, floor | ≤ 0.3 tiles | 0.23 |
| Jog → stop, ice | 2.5–4.5 tiles | 3.5 |
| Take-off | 40 ms | 40 ms (± a step) |
| Hop: tap · held | 0.55 · 0.8 | 0.55 · 0.80 |
| Flip (sprinting), held | 1.45 | 1.45 |
| Coyote · buffers | 110 ms · 150 / 220 ms | jumps at 80 ms off a ledge, not at 160 (waits for the ground); a press 120 ms before landing jumps again, 320 ms doesn't |
| Vault / mantle | 0.3–0.7 vault, 0.9–1.2 mantle, 1.6 neither | ✓ |
| Roll | ~3 tiles, dodging 0.1–0.25 s | 2.5–3.3 ✓ |
| Slide | further on ice | ✓ |
| Frame rate | the same bits at 30 / 60 / 144 fps | ✓ |
| Allowance | an honest sprint passes, ×1.6 doesn't | ✓ |

Left for later phases: the ghost remote (phase 3, with the playback on the
sender's clock), `?world=grounds` (phase 2, with the world's own grid).

### Phase 1 — the first try (2026-10-20)

The user: "when you're moving normally the player model keeps trembling a
little" and "small stair steps we can only pass if we jump".

- **The tremble**: each cycle's hips were planted frame by frame on the
  lowest point of the feet, and that point jumps (heel to toe, one foot to
  the other) — corners in the height, five times a second at a jog. Now each
  cycle's height (and a run's flight) is worked out once round the loop,
  smoothed round it (a seventh of the cycle wide) and calmed: a jog bobs 35%
  of what the legs alone give, a sprint 60%. Measured on the model in
  `/dev/move`, the frame-to-frame jerk of the head fell from 0.020 to 0.005 at
  a jog (a walk's is 0.002) and from 0.039 to 0.009 sprinting.
- **Steps**: a body on the ground stopped by something knee-high (`stepUp`
  0.27) with room on top steps onto it, and walks down one as high without
  falling; the view eases the body up and down them. The grid's tops are
  float32, so a 0.12 step onto a 0.24 one was "too high" by a hair: the top
  check has a 1e-4 allowance. The vault starts above a step (`vault.low` 0.28).
  `move.test.ts`: flights of 0.12 and 0.25 risers walked up and down, never in
  the air; a 0.4 wall still stops you.
- **The pad's stairs** (the user: "we still can't walk on small stairs"): the
  core climbed them from every angle, but the pad's two flights faced west,
  three tiles deep, and you came at them from their side — a wall of risers
  past the second. Now two flights five wide stand straight ahead of the start
  (0.12 up and 0.24 down; 0.25 up to 1.0 and 0.12 down), and a stepped pyramid
  climbs from any side; all walked without a jump. The test hook goes with
  its sandbox (a hot reload had left tests talking to a stopped one).

## Phase 2 — walking in the world: delivered (2026-10-20)

The user: "it works now, start phase 2".

- **My body is the movement core** (`world/input/walker.ts`, in the lazy
  `yutopia-input` chunk): `moveLocal` hands it the grid, the footing (the
  Grounds' own tile surface outdoors, else a floor), a moving car as
  something in the way, the camera's way (iso: up the screen), first
  person's facing, whether a jump may start (not seated, busy, playing),
  the click-to-walk path and where everyone else thinks I am; it gives back
  where I am drawn between its fixed steps, how high, which way I face, the
  gait, a jump or a landing. A snap, a teleport or a ride moves the body
  with me; the stairs' floor change shifts it on (`shift`). It keeps real
  time — up to a quarter second a frame — so slow frames don't walk me in
  slow motion, and a key tapped between two frames still counts.
- **Click-to-walk** goes through the same body, step by step: a point passed
  counts as reached (no turning back for it), easing into the last.
- **The keys by position** (`e.code`, rebindable in `yutopia.bindings`):
  WASD and the arrows, Shift sprints, Alt walks, Space jumps. **The camera
  moved from C to Y** (C is crouch, phase 3). The rest of the world's keys are
  as they were. **The pad**: the left stick's tilt is the speed, L3 sprints,
  A jumps, X uses (was A), Y the camera, d-pad ↑ the torch. Crouch, the roll,
  aiming and climbing (vault, mantle, the ledge catch) are off in the world
  until their poses are in (phases 3–4).
- **The camera** (`tp/view.ts`): the chase camera eases in behind where you
  go only going roughly ahead (within 25° of where it looks, for 0.4 s); W+D
  holds it still now (it spiralled).
- **The server** (`WorldRoom.ts`): the distance **allowance** (`Allowance`,
  `speedCap`) in place of the per-message speed limit; a step up to
  `stepUp` (0.27) without a jump; a jump from the ground or just off it — the
  feet within 0.2 of what's under them, or on it in the last 350 ms (coyote
  time and a message's lag; the old "the last one's nearly over" check
  turned down a jump straight after a tap-hop). A jump's position goes
  first. `Player` has `mv`, `yaw`, `pitch`, `mt`; `pos` carries them.
- **Tests**: `move.test.ts` 20 (+ the wire's packing, facing the look, a car
  in the way); the server's `stepTo` walks at a jog's pace (it teleported at
  15 tiles/s). e2e green: `walk-angles`, `jump` (a short run-up before the
  hop onto the desk: the body takes a moment to get going), `first-person`
  (Y for the camera), `mouse-look`, `controllers`. Here `first-person` and
  `mouse-look` need the GPU flags: headless Chromium's software GL drew the
  3D view at 1.6–7 s a frame, and the look hint (3 s) was gone before the
  test could see it.
- **Bots**: 10 for a minute, every snap logged with its reason — none for
  speed; all "doesn't fit": the bots plan on the old studio map while the
  world is the building (or an e2e fixture). `bots.mts` reports its snaps.
- **Budget**: the page 553.5 KB (of 554; it was 553.6 — the old walking,
  jumping and pad code went); `yutopia-input` 7.1 KB; `yutopia-chars` 36.6.
  The sandbox imports the input chunk's parts, not its index, so only the
  world's chunk carries the marker.

## Phase 3 — the look and the others: delivered (2026-10-20)

The user: "start phase 3".

- **Everyone moves with `Locomotion`** (`chars/motion.ts`): `Motion3` takes
  `loco` — how they move — and hands its legs and the jump to it, standing on
  its own idle pose (the breathing, the glances, the weight shifts); what's
  in the hands, the phone, being busy, the socials and the emotes still go on
  top. The walk below 2.6 tiles/s, the jog, the run and the sprint by speed;
  crouched and aiming by `mv`; **going aside or backing up the legs step that
  way** (first person's A / D and S, aiming), not a forward walk slid
  sideways.
- `tp/person3d.ts` works out `loco` for each person from where they've been:
  the velocity in their own frame, the turn rate, the speed's change (the
  lean), the feet leaving and meeting the ground (a landing by how fast they
  came down) — the same for me and for everyone else.
- **Others are played on their own clock** (controller `Sample`, `sampleOf`):
  each sample is timed by the sender's `mt` put on mine by the lowest gap
  seen (creeping up 0.2% for drift), so a message that came late is played
  when it was sent; their facing, `a` and gait are read from the sample being
  drawn, not when a patch lands; past the last sample, someone walking goes
  on a moment (up to 150 ms). In 3D they **face as they turned** (the `yaw`
  byte), not 8 ways (senders without `mt` — the bots — still 8).
- **Iso**: new bases from the same poses — the jog and the sprint
  (`runPose`), crouched and sneaking — picked by an eased speed with a
  little hysteresis (2.6 / 3.0 to and from the walk, 5.2 / 5.6 the sprint).
- **e2e `move-others.spec.ts`** (YUTOPIA_GPU=1): Ana in first person
  sprints, stops, steps aside and jumps; Bia, in 3D, sees her at her speeds
  (the drawn sprint 5.8–8.4: it's from frame to frame), stopped, facing the
  same way stepping aside (within 0.15), up 0.4–1 in the jump, no stalls or
  catch-ups while she moves, and the server never puts Ana back. Ana's own
  position and Bia's picture of her stay within the playback's 0.1 s or so.
  Iso, checked: someone else's walk, jog and sprint each pick their base
  for the whole second, no flicker. With the GPU: `walk-angles`, `jump`,
  `first-person`, `mouse-look`, `controllers`, `people-3d`, `move-others` —
  9 passed.
- **Budget**: the page 553.7 KB (of 554: 0.3 left — phase 4's page code must
  pay for itself), `yutopia-chars` 37.1, `yutopia-input` 6.9.

## Phase 4 — the verbs in the world: delivered (2026-10-20)

The user: "start phase 4".

- **Vault** (Space running at something low): `probeVault` looks further
  ahead the faster I go and takes the highest top over the first stretch
  (a bench on the slope had a dead zone). The vault is now **driven by
  distance**: up by the near edge, across, and down past the far edge plus my
  radius, landing a little beyond when there's room. It used to be timed, and
  then it went through a deep desk and the server put me back. A test checks
  the body never stands inside what it vaults. The pose steps onto the top
  instead of tucking.
- **Mantle** (higher, up to `mantle.high` 1.5): it rises first, then goes
  over. It also catches a ledge from the air. **Roll** (Q), **crouch** (a C
  toggle) and the **slide** (C while sprinting) are the same core as in
  /dev/move.
- **Low outdoor things as data**: `Outdoors.top` and `topTile` in
  `grounds.ts` set bench tiles to 0.45 and town cars to 1.15. The lot's cars
  stand 1.43. `Grid.landTop` stands you on them.
- **The server takes them all**:
  - The `jump` message carries the verb (`vault`, `mantle`, `roll`, `slide`)
    and its top.
  - It's refused within 200 ms of the last one, and when you're off the
    ground (more than 0.2 up, and more than 350 ms since you were on it),
    except a mantle from the air.
  - The height cap opens to the top plus 0.2.
  - Vaulting or mantling counts as jumping for 2 s.
  - The distance allowance grows at the verb's speed while it lasts.
  - Others see it through `Player.jump` and play it from when it started
    (`verbAt`, in the lazy chunk).
- **Aim** (the right button, the pad's LT): only in 3D, and only outdoors
  (land, or the lot's asphalt).
  - An over-the-shoulder camera: 2.6 back, 0.8 aside, FOV 50 → 42.
  - The camera levels out as aim comes on.
  - The body faces the camera, so you strafe.
  - `mv` bit 16 and the aim's `pitch` go on the wire, and the pitch is
    re-sent when it changes even while standing still. The torch's beam
    following it is B3's.
- **e2e `move.spec.ts`** (YUTOPIA_GPU=1):
  - C crouches and stands, as seen in `Player.mv`.
  - Sprint plus C slides.
  - Running at a desk and jumping vaults it, landing beyond.
  - At an arcade cabinet (1.38) it climbs on; the server has me at > 1.3.
  - Q rolls.
  - The server never puts me back.
  - The real Grounds bench, the land tops and the stairs are in
    `move.test.ts`: 22 tests; shared 184/184, server 73/73.
  - With the GPU, every movement spec passes: `walk-angles`, `jump`,
    `first-person`, `mouse-look`, `controllers`, `people-3d`, `move-others`,
    `move`, `pool`. A probe on the lot, aiming while standing still: the
    server's pitch matched mine.
  - Not tested yet: rolling through a one-tile gap. The roll's distance
    and dodge window are tested in the open; phase 5 adds the gap.
- **Budget**: the page **554.0 KB, exactly at the 554 line**. The remotes'
  verb timing and the right button's handling moved into the lazy chunks to
  get back under. `yutopia-input` 7.4 KB.

## Phase 5 — checks: delivered (2026-10-20)

The user: "start phase 5".

- **Budget**: the world page 554.0 KB (≤ 554); `yutopia-input` 7.4 KB
  (≤ 15).
- **The server**: `pnpm perf` runs 60 bots for 5 minutes. They walk, jog and
  sprint (a third each, at `MOVE`'s speeds) and send the new `mv`, `yaw` and
  `mt`.
  - **0 put back**; tick 0.097 ms on average, 2 ms at most (the budget is
    4).
  - The bots now walk the world as the server has it: its floor, its grid
    for them, the areas they may enter. Before, they planned on the old
    studio map while the sandbox is the building, and that gave 268 false
    put-backs in 15 s.
  - perf now fails on any put-back as well as on the tick.
  - (`tools/bots.mts`, for the live server, still plans on the studio
    map: its snaps aren't the move's.)
- **The client**: `Locomotion.update` for 50 people (every gait, strafe,
  back, crouch, aim, jumps) costs 0.20 ms a frame (median; p95 0.31): about
  4 µs a person.
- **Rolling through a gap** (phase 4's open item), in `move.test.ts`:
  - a wall with a one-tile gap is rolled through from dead on and 0.1 off
    either side;
  - the roll goes as far as in the open;
  - the body is never in the wall;
  - the server's checks (a message every 50 ms: clear, within the roll's
    allowance) refuse nothing.
- **Fixed**: `iso.test.ts` walked at 3.6 tiles/s, which is now a jog. It now
  runs the walk, the jog and the sprint at their own speeds; each is 6–8
  frames.
- **Tests**: shared 185/185, world-server 73/73, client 20/20; typecheck
  everywhere; Biome on the touched files (two older lint errors in
  `pool.spec.ts`, on lines this didn't change, left as they were).
- **e2e on the GPU** (YUTOPIA_GPU=1), one run of all of them: 10 of 11 pass.
  - Passing: `walk-angles`, `jump` ×2, `first-person` ×2, `mouse-look`,
    `people-3d`, `move-others`, `move`, `pool`.
  - `first-person` and `mouse-look` now set the GPU launch flags as the
    other 3D specs do. Without them they ran on software GL, where the
    look hint (3 s) faded before it was checked.
  - **`controllers` is flaky** (2 failures in 4 runs; it passes on its own).
    After the console's Analog switch, the white square for pad 1's stick
    doesn't show. **The move's fault**, found in a side session:
    - Analog on sends the emulator a one-read combo (L1+R1+L3).
    - The walker's `PadState.poll` reads `activePad()` every frame, even
      while the pad is the console's. `activePad()` called
      `navigator.getGamepads()`, which during play returns the emulator's
      virtual pads, so it could take the combo first.
    - The fix: `activePad()` reads `realGamepads()`. With it, a new
      `games/vpad.test.ts` passes and the spec passed 5 of 5. The fix is on
      the side session's branch, merged into main; `yutopia-input` 8.2 KB
      (it now carries the virtual pads' reader), the page still 554.0.
- **Firefox: not checked here.** Playwright's Firefox (Nightly 1543) won't
  start on this Mac, headless or headed ("Could not find profile folder";
  headed, its helpers are killed). Read through for Firefox instead:
  - The keys are by `e.code`.
  - The labels fall back when `navigator.keyboard` is missing (Firefox has
    none).
  - Rumble is optional.
  - The right button's menu is stopped on the 3D canvas.
  - **The pad is the risk**: `input/pad.ts` reads the standard layout (the
    right stick on axes 2–3, the triggers as buttons 6–7). Firefox on macOS
    often reports a pad as non-standard, which can put aim (LT) and the
    camera stick elsewhere.
  - To check in Firefox (the user): walk, jog, Alt to walk and Shift to
    sprint; Space jumps and vaults a desk; C crouches; Q rolls; on the lot
    the right button aims; then the same on the pad.

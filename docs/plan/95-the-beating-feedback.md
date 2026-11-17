# Plan 95 — the beating, feedback

Asked 2026-11-17, after testing plan 94 (uncommitted). The user's seven points (in Portuguese, here in short):

1. the window drops all at once: make a nice animation;
2. changing the radio sometimes turns the car's lamps off or on;
3. the tyres' squeal still comes with the smallest movement of the car: it should be a skid, a very fast
   take-off, or a hard corner;
4. shots don't land where I aim on the car: no bullet mark stays on the bonnet; shooting the bonnet broke the
   glass; shooting the glass doesn't break it where I shot;
5. a shot tyre doesn't look flat or burst;
6. after the car blows up, the bullet marks are left floating;
7. let it burn longer before it blows: about 10 seconds.

Status: **PLAN 95 DONE 2026-11-17** (phases 0–7, uncommitted, with plan 94). Forks decided 2026-11-17, one by one,
all recommended:
- F1a: the glass slides into the door in about 1.5 s, with a motor's whine picked by ear.
- F2a: the drive-in dip goes; the lamps change only with L, or come on when getting in at night.
- F3a: a squeal only in a slide, a hard launch or a corner at the limit above ~30 km/h; nothing under ~10 km/h
  but a hard launch; snow's squeak stays, softer.
- F4a: the shooter's screen finds the spot on the model it sees; the server checks it's on that car.
- F5a: the windscreen stars at each hit (in after ~5); side and rear crack where struck, gone on the second.
- F6a: the tyre squashed at the bottom, the rim ~8 cm down, that corner sagging.
- F7a: at least 10 s of fire before it blows; left alone, 25 s.

## Where we are, from the code

- **1, the window** (`tp/car/glb.ts windowDown` → `showPanes`): winding it down only hides the pane. There's no
  movement and no sound.
- **2, the lamps and the radio.** This one isn't random. It's plan 93 S10's drive-in dip
  (`car/cars.ts dipped()`): stopped for more than 4 s, at night, with a station on, the headlamps go off.
  - So, parked at night, turning the radio on puts the lamps out, and turning it off puts them back.
  - The lamp switch (L) still reads "low", so it looks like the radio flipped them.
- **3, the squeal** (`car/sound.ts`, plan 94 P6). The corner skid is quiet now. What's left at low speed:
  - the **chirp**: any wheel's grip used rising past 0.85 quickly. It has no speed or throttle gate, so a gentle
    pull-away or a stab of the brakes at walking pace can chirp;
  - the **slide**: past the peak and slipping more than 1 m/s. It has no speed gate either, so a launch's
    wheelspin at 3 km/h squeals;
  - the **held squeal**: gated by speed only to 6 m/s (`going`). Full lock in a car park sits near the peak;
  - **packed snow's squeak**: loudest rolling at 1.5–3 m/s. On the campus's snow that's exactly "the smallest
    movement". It may be what the user heard as a squeal; phase 0 finds out.
- **4, where a shot lands** (`shared car/shot.ts carAlong`). The server takes each round through a car as **one
  box**: its length, width and full height.
  - **The bonnet is below the box's top.** A round aimed at the bonnet from a standing height meets the box's
    front face high up or its top face (the roof's plane) first, well above the metal.
    - On the front face above the belt line it's read as **glass**: shooting the bonnet broke the windscreen.
    - On the top face it's a roof hit; the hole is then searched for straight down only 0.9 m
      (`glb.ts setHoles`) and often misses the bonnet, so no mark.
  - **Holes are found along the face's normal, not along the round's path.** A mark lands on the skin straight
    in from where the round met the box, which isn't where the crosshair was.
  - **Glass breaks by the whole pane.** A crack is one picture laid over the pane (its middle), not where it was
    struck. The point struck isn't kept for glass (`addHole` only keeps panel and engine hits).
- **5, a flat** (`glb.ts setParts`, `rig.ts`, `cars.ts`): the wheel is moved 4 cm down, tyre and all. The tyre
  keeps its round shape and sinks into the road. Nothing looks flat, and the car's corner doesn't sag.
- **6, the marks after the blast.** The holes are added to the body group with their own positions.
  - Burnt out, the model is lowered (`setBurnt`, its tyres gone), but the holes aren't part of what moves.
  - A hole on a door or the bonnet that falls off stays where the part was.
- **7, the fire's time** (`world-server features/cars.ts fireUp`):
  - it catches at heat 5;
  - left alone, it blows 25 s later (`BURN_MS`);
  - any shot that takes the heat to 9 sets it to blow on the next tick. Four shots into the engine is
    smoke → fire → blast in under a second.

## Forks (decided 2026-11-17 — asked one by one)

- **F1 the window:**
  - (a) it slides down into the door in about 1.5 s, with a motor's whine (recorded, picked by ear);
  - (b) at a real power window's ~3 s;
  - (c) held N moves it, so it can stop at any height.
- **F2 the lamps and the radio:**
  - (a) drop the drive-in dip, so the lamps only change with L (or the auto-on when getting in);
  - (b) dip only at the drive-in's lot;
  - (c) keep it, with a toast "lamps dipped".
- **F3 the squeal: when it sounds.**
  - (a) Only in a slide (the tail out, the handbrake), a hard launch's wheelspin (full throttle), or a corner at
    the limit above about 30 km/h. Under about 10 km/h, only a hard launch. Snow's squeak stays, softer;
  - (b) like (a), and snow's squeak goes.
- **F4 where a shot lands:**
  - (a) the shooter's own screen finds the spot on the model they see (the same round, by its seed) and sends it;
    the server checks it's on that car and takes it. This fits "no anticheat for now";
  - (b) the server gets a real shape for each model, baked from the GLBs (a 10 cm grid of what's metal, glass,
    tyre, lamp), and keeps working it out alone.
- **F5 glass where it's struck:**
  - (a) the windscreen gets a star at each hit and stays in (it falls in after about 5). The side and rear
    windows crack from the point struck and go on the second hit, as now, but from where it was hit;
  - (b) like real tempered glass: the side and rear windows burst all at once on the first hit; the windscreen
    stars.
- **F6 the flat's look:**
  - (a) the tyre squashed flat at the bottom, its walls bulging; the rim about 8 cm down; that corner of the car
    sags;
  - (b) (a), and driven on for a while it shreds: strips flap, then it's down to the rim with sparks;
  - (c) a shot tyre is torn off, straight to the rim.
- **F7 the fire's time:**
  - (a) at least 10 s of fire before it blows: shots can't bring it sooner than that. Left alone, it's 25 s as
    now;
  - (b) always about 10 s after it catches, shot or not;
  - (c) shots never hurry it: always 25 s.

## Phases

0. **Measures.**
   - A probe logs every tyre sound's level through a gentle pull-away, a car-park turn at full lock, a cruise,
     an ordinary corner, a hard launch and a handbrake turn, on the road and on snow.
   - A probe shoots the bonnet, the windscreen, a door, a side window and a tyre from standing height, and logs
     the box's point against the mesh's point for each.
   - Stills of a flat now.
1. **The lamps, and the fire's time** (F2, F7). Small, and both server tests and a probe.
2. **The window** (F1): the pane moved down its door's line (clipped at the sill), both two-pass meshes alike;
   its sound; the shot glass of a pane that's down handled (a wound-down window can't be cracked).
3. **The tyres' voice** (F3), from phase 0's numbers.
4. **Shots land where they're aimed** (F4), and point 6:
   - the hit spot found on the real shape;
   - the mark along the round's own path;
   - each mark a child of the mesh it's on, so it falls with a door, drops with the burnt shell, and goes when
     a part's hidden.
5. **Glass where it's struck** (F5): the point kept for glass hits too, a crack or star drawn there, the shards
   from that point.
6. **The flat's look** (F6): the tyre bent in its shader at the bottom (the patch stays down while it spins),
   the rim and the body's corner lowered, for my car, others' and parked ones.
7. **Checks:** the probes again, the car specs, budgets and a Low drive.

## Risks

- F4a trusts the shooter: a hacked client could say it hit anywhere on a car. That's as the moves are now, and
  the server still checks the spot is on the box of the car it names.
- F4b: about 20 bodies and trims to bake, and the grid has to follow any change to a GLB.
- The flat's shader bend adds a material variant to each tyre. They're already their own per car, so no new
  programs beyond one.

## Phase 0 — built (2026-11-17): measures

### The tyres' voice (`e2e/car-squeal.mts`)

Main Street's first town car, put back on its start spot before each run. Every frame logs each tyre sound's
level against speed, grip used, slip and the ground. Peaks:

| run | top km/h | skid | held squeal | snow squeak | chirps |
|---|---|---|---|---|---|
| tap W 0.3 s ×3 | 12 | 0.01–0.18 at 1–3 km/h | 0.02 | 0 | 1 |
| car park, full lock, W pulses | 10 | 0.12 at 3 km/h | 0.03 | 0 | 5 |
| reverse taps | 11 | **0.25 at 3 km/h** | 0.05 | 0 | 2 |
| pull away, W 1.5 s | 22 | 0.20 at 3 km/h | 0.05 | 0 | 2 |
| straight cruise, W 4 s | 54 | 0.28 at 53 (off the kerb) | 0.34 | 0.07 | 2–3 |
| brake to a stop (S) | 53 | 0.30 at 47 | **0.41 at 39** | **0.35 at 7 km/h** | 2–6 |
| handbrake turn | 52 | 0.90 at 19–40 | 0.41 | 0.35 at 5–11 | 6 |

What it says:

- **Every start from a stop skids** (0.1–0.25 at 1–4 km/h). The keyboard's W is full throttle, so each pull-away
  or reverse spins the driven wheels about 2.5 m/s faster than the road. The sound reads that as a slide.
- **The grip used is meaningless at walking pace.** Jolt's longitudinal slip is divided by the ground speed, so
  under ~5 km/h `used` reads 10–100 (up to 100,000 against a wall) instead of 0–1.5. The chirp (grip used rising
  fast) fires on that: 2–9 chirps a run, mostly at low speed.
- **Every stop with S squeals:** the held squeal reaches 0.41 at 39 km/h. The keyboard's S is the full pedal.
- **The packed snow's squeak is loudest at 5–8 km/h** (0.35). That's slow, careful driving on the campus's snow:
  exactly "the smallest movement".
- The handbrake turn's skid (0.9) is right. That's the sound to keep.
- The straight cruise's squeal came when the car rode up onto the kerb at 53 km/h (wheels off the road for a
  moment). That's a real bump, but phase 3 should check it's not a whine on every kerb.

### Where a shot lands (`e2e/car-aim.mts`)

Points found on the parked car's real mesh, the revolver aimed at each from standing height:

| aimed at (the mesh there) | the server struck | its point from the aim | the mark |
|---|---|---|---|
| bonnet, from ahead (bonnet-paint) | **glass** (front face) | 0.91 m | none |
| bonnet, from the side (bonnet-paint) | **glass** (side face) | 0.63 m | none |
| windscreen, from ahead | glass (front face) | **1.96 m** (the box's front, at bumper line) | — |
| front door's skin (door_fr-paint) | panel | 0.02 m | 0.02 m off |
| front side window (door_fr-glass) | glass | 0.11 m | (a door hole drawn 0.42 m off) |
| roof, from the side (body-paint) | panel, side face | 0.73 m | 1.14 m off |
| front tyre (wheel_fr) | tyre | 0.10 m | — |
| boot lid, from behind (boot-paint) | **glass** (rear window) | 0.87 m | none |

- Only flat vertical skin (a door) is right. Everything set back from the box (the bonnet, the boot lid, the
  windscreen, the roof's curve) is met on the box's face first, at glass height, so it's read as glass. Bonnet
  and boot shots crack the windscreen and rear window and leave no mark.
- The windscreen's crack is one picture over the whole pane (`design/plan95/shots-front.png`).
- (The first run's last two shots hit nothing because the revolver was empty after six rounds.)

### A flat now

`design/plan95/flat-side.png`, `flat-ahead.png`: the shot front tyre is round, the car level. The 4 cm drop
reads as nothing.

### For the phases

- Phase 3 (tyres): judge the slide by the patch's speed over the ground with a low-speed floor, not by `used`.
  - Starts under ~10 km/h: silent unless W is held past ~0.6 s with real wheelspin (the hard launch).
  - The chirp: only above ~15 km/h.
  - Braking in a line: no held squeal unless the wheels lock (ABS-like).
  - The snow's squeak: about a third as loud, fading in rather than peaking at 5–8 km/h.
- Phase 4 (aim): the shooter's cast is against the full model the shooter sees. A parked car far off shows its
  mid or far model, so the cast falls back to the box there (as now).

## Phase 1 — built (2026-11-17): the lamps, and the fire's time

- **F2a, the lamps** (`car/cars.ts`): the drive-in dip is gone, with its `dipped()` and the still-time it
  counted. The lamps go out only with L (or the auto-on when getting in at night); the radio never touches them.
  - `e2e/car-lock.mts` now checks the other way: in her car at night, lamps on, radio on, stood still 4.5 s, the
    lamps stay lit (low and high both, as switched).
- **F7a, the fire** (`world-server features/cars.ts`):
  - each burning car has a `due` time: 25 s after it caught (`BURN_MS`);
  - shot on past the blast's heat, `due` comes sooner, but never before 10 s from catching (`BURN_MIN_MS`). Shot
    after those 10 s, it goes on the next tick, as before.
- **Checks:**
  - the server's fire test now shoots it twice more right after it catches, then checks it's still burning
    1.5 s later and not blown, then that it blew 9–13 s after catching. All 15 server car tests pass.
  - `e2e/car-fire.mts` times it in the page from catching to the blast: 11.7 s. (The probe turns the camera
    between shots, so by its fourth round the 10 s were already up: it blew on that round.)
  - The client and server type checks are clean.

## Phase 2 — built (2026-11-17): the window

- **The slide** (`tp/car/glb.ts`):
  - Each door's window has a place (`winK`, 0 up … 1 down), a target and a speed. `windowDown` sets the target.
    It takes `WIN_S` (1.5 s) all the way, at a motor's even pace eased a little at its ends.
  - The first time a car's window state is seen (a car just come into view), it's placed as it is, not
    moved.
  - The pane moves **straight down** into its door, by its own height (`slideOf`, worked out once on load). Its
    two-pass twin and its crack move with it (`winRest` shared). Fully down, it's hidden as before.
    - The first try moved it down the glass's own slope. A red-tinted check showed why that's wrong: glass
      leaning in at the top goes *out* along its slope, so it came through the door's skin below the window
      line. Straight down keeps it inside the door
      (`design/plan95/p2/red2/`: up, going down, going up).
  - `windowsTick(dt)` runs for every live car each frame (`car/cars.ts`).
  - A gun brought out of a seat winds it down in 0.5 s instead, so the barrel isn't through the glass for long.
- **The motor** (`car/sound.ts windowMotor`): heard once for each move.
  - A recorded take from the new `window` slot, fitted to the 1.5 s (played 0.85–1.25× faster), faded at its
    end.
  - With none loaded, a small motor's whine that slows as the glass meets its stop, then a soft knock.
- **A shot through a wound-down window** (`shared car/shot.ts panesOpen`, `world-server features/cars.ts`):
  - each seat's window bit maps to its pane by the seat's side and row;
  - a round struck on an open pane changes nothing on the car, and goes on through to whoever is behind it.
- **The sound's candidates:**
  - six CC0 recordings from Freesound (13 takes), cut to 2.4 s (`tools/sfx-cars-search.mjs` slot `window`,
    `sfx-weather.mjs` length);
  - on the bench as the group "The window" (`/dev/car-sound?group=window`);
  - **picked by ear 2026-11-17: a**, Gutek's "Car Power windows" (`chosen.json` slots `window: 0`, its
    `pick` in `tools/sfx-cars.json`).
- **Checks:**
  - `e2e/car-window.mts`: N at the wheel. The window reaches halfway at about 0.8 s and is down and hidden at
    about 1.6 s, 0.49 m lower. N again brings it back up the same way. The motor is heard once each way.
    Stills from beside her door (`FOV=22` for close ones; `RED=1` tints the glass to see the move).
  - server: the window-shot test is now a helper with a second case, the window wound down: the driver is
    hurt and the pane isn't cracked. That case fails with the fix switched off. All 16 server car tests pass.
    - Square on, the driver's head is behind the server's line between the front window and the rear one, so
      the test's round came in through the rear pane. The window-down case stands 0.6 m further forward.
      Phase 4 (the shooter's own hit on the model) replaces that line.
  - shared unit test for `panesOpen`. Unit tests: client 420, shared 705. Type checks clean.
  - `e2e/car-gunseat.mts`: the revolver still comes out of the window. `car.spec` 3/3.

## Phase 3 — built (2026-11-17): the tyres' voice

All in `car/sound.ts`. The physics' grip reading (`used`) is left as it is: it also feeds the steering assist
(`frontUsed`), and plan 93's feel was signed off.

- **Grip trusted only above walking pace.** A wheel's `used` counts fully from ~18 km/h and not at all under
  ~9 km/h; under that it's read as within its peak. Taps, car-park turns, reversing and pull-aways no longer
  slide.
- **The held squeal (a corner at the limit)** comes in from ~22 km/h and fully past ~32 km/h (was any speed over
  ~20).
- **Braking in a line:**
  - while the ABS is working (`helping & 1`), no held squeal and only 15% of the skid;
  - wheels really locked (no ABS: their patch sliding at the car's speed), all of it;
  - others' cars: braking read from their brake-lamp flag, taken as ABS at work.
- **Traction control holding a spin under power, going straight** (`helping & 2`): 30% of the squeal (more as
  the car goes sideways).
- **Launches:**
  - On the keys every start is full throttle. The wheels spin about 0.3 s, then traction control catches them,
    exactly as a tap does. So **no launch sound**.
    - Tried and dropped: a chirp if the throttle was still held at 0.35 s. Every ordinary start and reverse got
      one.
  - **A burnout** (the wheels still spinning over 3 m/s near a stop, throttle on, for 0.4 s or more: stuck,
    against something, no traction control) squeals, up to 0.7.
- **The chirp:** only from ~15 km/h, with the body taking a slip angle (a flick in), and neither ABS nor
  traction control working. Kerb jolts and brake stabs no longer chirp.
- **Easing:** the skid and the held squeal are heard after a short rise (0.12 s) and fall (0.08 s). A single
  frame's spike, like a wheel off a kerb, isn't a squeal.
- **The snow's squeak:** about a third as loud (0.12 of the bed, was 0.35). It comes in from walking pace and eases
  off past ~25 km/h instead of being loudest at 5–8 km/h.

### Checks

`e2e/car-squeal-pad.mts`, new: the sandbox's open asphalt pad (`/dev/car`, whose `__car` now also gives its
sound), so no kerbs or parked cars get in the way.

| move | before (phase 0, street) | now (pad) |
|---|---|---|
| taps, car-park turn, pull-away | skid 0.12–0.25, chirps | silent |
| stop with S | held 0.41, skid 0.30 | a trace (skid 0.04) |
| corner at the limit, ~55 km/h | — | held 0.30, skid 0.12 |
| a fast bend at 85 km/h | — | scrub 0.09 (the steer assist keeps it under the peak) |
| a gentle bend | — | scrub 0.08 |
| handbrake turn | skid 0.9 | skid 0.90, held 0.32 |

`e2e/car-squeal.mts` (the street):

- **out in the street** (new default: the car placed 3.5 m in from the kerb): taps, car park, reverse,
  pull-away, cruise and stop are silent or a trace. The handbrake turn gives skid 0.90. The long launch got
  0.13 somewhere between 19 and 32 km/h.
- **by the kerb** (`OUT_M=0`, half on the pavement):
  - the full-throttle cruise's spin is held squeal 0.14 (was 0.33);
  - the stop that ends sliding onto snow and pavement still gives a skid of 0.26 at 8 km/h.
- **snow squeak:** 0.12 at most (was 0.35).

Client unit tests 420 pass, type check clean.

## Phase 4 — built (2026-11-17): shots land where they're aimed, marks on their parts

- **The shooter's screen finds it** (`car/cars.ts shotAlong`). For each of a shot's rounds (by the seed, as the
  tracers are), the client ray-casts the car models it draws: live cars, parked near or mid models, the far
  outline. It skips the car it sits in.
  - The nearest hit becomes a claim (shared `CarClaim`):
    - the car's id;
    - the point in the car's own frame (u, w, h);
    - the face, from the skin's normal (a top-facing hit ahead of the cabin is the front's, behind it the
      back's);
    - what was struck: glass and its pane, from the mesh's `pane`/`crackOf`, and the windscreen's snow pane
      and crack marked `paneOf`; a lamp's lens; a tyre or rim, by the wheel it's in; otherwise the skin,
      which is the engine ahead of the front wheels and below a little over the glass line (`bodyStruck`),
      else a panel;
    - the skin's normal.
  - A round that met no drawn car sends 0. If a car by the round's line isn't drawn, it sends nothing, and the
    server uses its box.
  - The crosshair's aim distance also stops on a car's skin (`dark/arms.ts`), so the round from the hand goes
    to that spot.
- **The server takes it, checked** (shared `claimShot`, `world-server features/cars.ts along(…, claim)`,
  `arms.ts`). It rebuilds the point from its own pose of that car, then checks:
  - it's on the car's box, with 0.3 m spare;
  - it's within 0.45 m + 3 cm per metre of the server's own round (the client's spread is a guess of the
    server's);
  - it's within reach.

  Taken, it's that car's hit, with the struck part, pane, wheel, through, and where it comes out (the box's far
  side). A 0 means no car is struck. Not taken, the box decides as before.
- **The marks** (`tp/car/glb.ts setHoles`, shared `addHole`/`parseHoles`):
  - holes now keep the skin's normal (`u,w,h,face,nu,nw,nh`; the old 4-field ones still read);
  - each is found from just off the skin along that normal, taking the skin nearest the point, not a trim
    passed first;
  - each is laid on **the very mesh it's in**, one instanced pair per part: it swings, falls, drops and hides
    with its door, bonnet or body;
  - burning leaves them on the charred skin (`userData.hole` skipped by `setBurnt`);
  - merging still skips them (instanced meshes, and a mesh with children isn't merged).

### Checks

`e2e/car-aim.mts REAL=1`: the camera turned until the crosshair is on each point of the model, the right
button held, a click. The game's own shot, claims and all:

| aimed at | before (phase 0) | now |
|---|---|---|
| bonnet, from ahead | glass, 0.91 m off, no mark | **engine**, 0.01 m off, mark 0.01 m off |
| bonnet, from the side | glass, 0.63 m off, no mark | **engine**, 0.07 m off, mark 0.07 m off |
| windscreen | glass, 1.96 m off | glass, 0.03 m off |
| front door | panel, 0.02 m | panel, 0.01 m, mark 0.01 m |
| front side window | glass, 0.11 m | glass, 0.03 m |
| roof, from the side | panel, 0.73 m, mark 1.14 m | panel, 0.42 m, mark 0.43 m |
| front tyre | tyre, 0.10 m | tyre, 0.03 m |
| boot lid | **glass** (rear window), 0.87 m | **panel**, 0.03 m, mark 0.03 m |

The roof from standing beside the car is the one left off. The round leaves from the hand, lower than the
camera, so it meets the roof's near edge first: real parallax, not the box.

Also:

- `e2e/car-holes-follow.mts` (point 6): a hole on the front right door and one on the flank. With the door off
  and the car burnt out, the door's hole is hidden with its door and the flank's dropped 0.095 m with the
  charred shell (the wheel radius × 0.3).
- **Server:** a new car-shot test with the bonnet from ahead claimed (engine, its hole where it was struck,
  laid up), the same line claimed as no car (nothing struck), and a claim a metre off the line (not taken, the
  box's front).
  - The older "through its side windows" test had waited since plan 94 for the old whole-side bit. It now
    waits for that side's pane cracked.
  - car-shot 4/4, cars 16 + arms 16 pass.
- **Shared:** a unit test for `claimShot`, `faceOf` and `bodyStruck`.
- **Client:** unit tests 420. The car and arms specs pass (4/4). The seat gun still fires (rounds 6 → 5).

## Phase 5 — built (2026-11-17): glass where it's struck

- **Glass hits kept as points** (shared `addHole`/`parseHoles`; `world-server features/cars.ts starOf`).
  - A round into glass that's still there is kept in the car's holes with its pane:
    `u,w,h,face,nu,nw,nh,pane`, the normal `0,0,0` when the box decided.
  - Mending panels keeps the glass's points (`holesWithout` skips 8-field entries); new glass at the garage drops
    them (`glassless`).
- **The windscreen (laminated) stars and stays** (`shotDamage` with `stars`, the windscreen's earlier hits):
  cracked from the first, badly from the third (`STARS_BAD`), in at the fifth (`STARS_IN`). Crashes still crack it
  by `hitPane` as before.
- **Side and rear windows**: cracked by the first round, gone at the second, as in plan 94, now from where they
  were hit.
- **On the model** (`tp/car/glb.ts setStars`):
  - each windscreen round is a star: a spider of cracks and rings round a dark hole, about 35 cm across, its own
    way round, on the windscreen's own glass mesh (it goes with the glass);
  - the whole-windscreen crack picture now shows only for a crash's crack, when there are no stars;
  - a side or rear pane's crack is drawn from its first round's point, at twice the glass's size so it runs
    right across from there (`crackUV`, also for a crack first made by a crash: its middle);
  - stars aren't charred by the fire (`userData.hole`) and hide with their glass.
- **Shards** (`car/cars.ts glassOut`, `skinAt`): a pane that cracks or goes throws its bits from where its last
  round went in. The windscreen's fall back into the cabin.

### Checks

- `e2e/car-aim.mts GLASS=1 REAL=1`: the game's own shots, each within 2–5 cm of where it was aimed.
  - Four into the windscreen: stars, badly from the third, still in.
  - One into the front side window: cracked.
  - A fifth into the windscreen: in.
  - Stills in `design/plan95/p5`: four stars across the windscreen where the rounds went in; the side window's
    crack running out from its point; the windscreen gone after the fifth.
- **Server:** a new car-shot test with five rounds into a windscreen through claims. A star is kept where each
  went in, with its normal; it's still in after four and in at the fifth. car-shot 5/5; cars 16 and arms 16 pass.
  - The Daybreak arms test failed once when run alongside the cars tests, then passed twice on its own. That
    path isn't touched by this change.
- **Shared:** a unit test for the star count, the glass entries in holes and the mending of them. 13 pass.
- **Client:** unit tests 420, car-look spec 1/1, type checks clean.
- **The dev world server crashed** on a half-made edit (`shot.ts` importing `norm` a moment before `damage.ts`
  exported it). It was restarted with `docker restart yutopia-world` after checking no other session was using
  it.

## Phase 6 — built (2026-11-17): the flat's look

All in `tp/car/glb.ts`, the same for my car, others' and parked ones.

- **The sag** (`setFlats`, from the flat bits in `setParts`). The body tips to its flats:
  - a plane fitted through its four hubs, each flat one `FLAT_DROP` (8 cm) down and the others where they were;
  - for one flat, its corner comes down 6 cm, the two beside it 2 cm, the diagonal one up 2 cm;
  - it's combined with the jack's tilt (`liftCorner`) in `poseBody`.
- **The hubs:** each wheel's rise against the body (`flatY`) undoes the sag at the good wheels and puts the flat
  one's hub 8 cm down. The rig (my car), others' cars (`cars.ts`) and parked ones (`setParts`) use it in place of
  the old 4 cm drop.
- **The squash** (`flatTyre`, `FLAT_GLSL`):
  - each car's tyre material is its own, with a vertex shader step working in the world's frame;
  - for each flat wheel (hub, axle, the tyre's radius and half width as uniforms), points below the hub by more
    than the radius less the drop are pushed up onto that line, so it sits flat on the road whatever way the
    wheel has turned, with its walls bulging out there and a little above;
  - it works on merged parked models too, since it reads world positions, not the mesh's;
  - there's one program for every car's tyre (its key `|flat`), compiled with the car. Load time is unchanged:
    three loads of the world with it switched off took 11.2–12.3 s, with it on 10.6–11.1 s.
  - `flatsTick` puts the hubs where they are after each pose: once for a parked car, each frame for a driven one
    (rig, others' poses).

### Checks

- `e2e/car-aim.mts ONLY=tyre REAL=1 OUT=…`: the parked town car's front right tyre shot. Its flat state: hub
  dropped 0.08; body tipped (−0.026, 0.014 rad) and 2 cm down; wheels ±2 cm.
  - Close stills (`closeUp`, a narrow lens held each frame): `design/plan95/p6/flat-close-side.png`. The tyre is
    flat on the road at the bottom, its wall bulged, the corner lower.
- `e2e/car-burst.mts`: my own car's front right tyre out at 65 km/h. The same flat state on the driven model
  (`rig.flats` 2). The still from beside it shows the front right corner down (a smaller gap in its arch than at
  the rear) and the tyre squashed.
- **Client:** unit tests 420, type check clean. `car.spec` 3/3 and `car-look` 1/1.
  - The first runs after the edits had loads over the spec's 60 s, with a different test each time, while the
    dev server recompiled. Warm, they pass.

## Phase 7 — checks (2026-11-17)

- **Unit and server tests:** shared 707, client 420; world-server cars, car-shot and arms 37. Type checks clean in
  client, world-server and shared.
- **Size limits** (production build): all ok.
  - The world page is unchanged at 487.9 of 488 KB.
  - `yutopia-car` is 53.5 of 120 KB (52.1 before this plan), `yutopia-dark` 54.5 of 80 (54.3).
- **The plan's probes again** (one batch on the dev world, then two singly):
  - **tyres:** on the pad, silent for taps, car park, pull-away, launch and stops (a 0.04 trace); a corner at the
    limit gives held 0.34; the handbrake 0.90. In the street the same, the handbrake 0.90.
  - **window:** slides and comes back, the motor heard each way.
  - **lamps:** stay on with the radio, stopped at night.
  - **fire:** blew 11.5 s after catching.
  - **aim:** every target 2–16 cm from the aim; the bonnet an engine hit, the boot lid a panel. (The roof got no
    round: the revolver was out after five.)
  - **glass:** four stars, then in at the fifth; the side window cracks from its point.
  - **marks:** follow their parts.
  - **burst:** my car's flat shown.
  - **plan 94's** (tyre change, passenger shotgun, glass, wreck, the car UI): all as before.
  - `car-tyres` (plan 93's) now picked `town-car-1`, parked nose to tail behind another, so it drove straight
    into it. That's the probe's choice of car, not a change here. Its rows are taken after W is let go
    (throttle 0), so no burnout sound is right.
- **End-to-end specs:** car, car-look, pets-car, arms, inventory-pack: 7 tests, 6 passed the first time.
  - Car's "passes under a flier" stopped short once, then passed twice on its own: flaky.
- **A frame-time drive on Low** (`e2e/car-town-drive.mts`, the production build on :3107):

  | | fps (mean) | frames over 50 ms |
  |---|---|---|
  | plain, 2 runs | 95.9, 100.1 | 1 (54 ms) and 4 (78–114 ms) |
  | with the fire, 2 runs | 84.8, 94.3 | 0, 0 |

  - Plan 94's were 105.5 plain and 81–89 with the fire: in line.
  - The route ends at 43 m every run: the car meets what's parked ahead on Main Street.

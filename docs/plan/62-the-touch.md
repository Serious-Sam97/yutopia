# 62 — The touch

People sit on what they sit on, and their hands are on what they use. Since the character pass
(plan 59: the legs 14% longer, the crotch from 39% to 47% of the height, a shorter head), the
everyday acts of plan 58 phase 6 no longer meet the furniture. Feet go through the floor, people
sink into the sofa, hands type 18 cm above the keyboard, and the driver hunches over the wheel.
Planned 2026-10-31.

## Where we are

The stills are in `design/acts/before/` (91 of them, `e2e/acts-shots.mts`). Ana wore a suit and a
satchel, and the heights below are in metres. Standing on a bare floor, her ankle is at 0.06.

### Seats

- **The cause, for every seat.** `sit2` (`chars/anim/acts.ts`) solves the legs for a 0.34 m drop of
  the hips, the old body's (`motion.ts`: `m.seatDrop ?? -0.34`). Nothing in the world passes
  `seatDrop`, and it has never been passed since plan 58. Meanwhile `person3d.ts` lowers the hips
  by `sitDrop(seatY)`, which is the real drop for the seat and is 0.41–0.52 m with the new legs:

  | seat | real drop | feet under the floor |
  |---|---|---|
  | sofa | 0.41 | ~7 cm |
  | chair | 0.44 | ~10 cm |
  | armchair | 0.45 | ~12 cm |
  | bench | 0.51 | ~18 cm |
  | beanbag | 0.52 | ~18 cm |

  The hands on the lap are aimed from the same wrong hip height, so they float over the belly.
- **The sofa is the worst.** Her hips are 2 cm under the cushion top and her thighs are buried in
  it. Her shins come out through the front of the seat. She sits upright, ~25 cm off the back
  cushions, and the satchel pokes through the cushion.
- **The chair at rot 0 faces the wrong way.** She straddles it, with the backrest through her lap.
  The desk chairs at rot 2 are right, so it's one chair look or one rotation that's turned, not
  `seatFacing`.
- **Sitting down.** The root snaps to the seat's centre at once. Mid-sit-down she is upright with
  the seat cutting through her thighs, and on the park bench she stands on the bench top.
- **Stands (bleachers).** These read fine, but her shins go into the step below. The feet need the
  step's height, not the floor's.
- **The armchair and the park bench** are close to right. They only share the drop error.

### At a desk

- **Typing.** The hands go to a fixed spot in the body's own space, `hip + 0.31` up and 0.44 ahead
  (now 0.83–0.87 m off the floor). They don't go to the keyboard:
  - At a desk (top 0.64, keys 0.69), the fingertips are ~18 cm above the keys. They are ~10 cm in
    front of the desk's edge and over the floor, ~20 cm short of the keyboard.
  - At the reception desk (keys 0.79), they are 8 cm above the keys, still in front of the edge.
- **The hands** are curled fists, and the left drifts to the middle.
- **The chair isn't pulled in.** Her hips are 0.6 m from the desk's edge, so her knees stop 19 cm
  short of it instead of going under.
- **The computer used standing.** She types in the air 30 cm above the keys, 0.5 m back from the
  desk.
- `model.atWork` already finds the keyboard or the computer within 1.7 tiles, but only to say
  "typing". Its position never reaches the pose.

### Things used standing (`busy2`)

Every hand target is a fixed point in the body's space (the arcade's at 1.02, the piano's at 1.0,
the whiteboard's at 1.5, the machine button's at 1.18). None of them comes from the thing itself,
and the body changed under them:

- **Arcade:** the fists rest at the screen's lower edge, 25–30 cm above the stick and buttons.
- **Piano:** the hands are 12 cm in front of the keys and above them.
- **Whiteboard:** the fist stops 28 cm short of the board, and no marker is drawn.
- **Pool:** the head is thrown back to the ceiling with a hand on the chest, and the satchel flies.
  This was shot from the busy state, not a real game, so phase 0 checks it through the real flow
  first.
- **Coffee, water and vending:** the press is only the first 1.5 s of a 5 s loop, and the rest is
  arms hanging. No hand goes to the machine's own button, and no cup is taken.
- **The gamepad** on the sofa has the hands at the belly, and no pad is drawn.
- **Slot cars and pong** are fine.

### Drinks

- **The mug standing** is fine.
- **The mug mid-sip** goes into the beard at the jaw, below the mouth. The cup and the soda reach
  the mouth, but the rim cuts into the cheek. The `mouth` anchor (bake) and the tip of
  `keepUpright` are the old head's. The new head is 10% shorter, with a jaw, and a beard sits over
  it.
- **The mug sat on the sofa** has the sofa's sink, as above.

### Cars and karts

- **The car still uses the old fixed-angle `carPose`** (`motion.ts`). `car2`, the plan 58 one with
  breath and glances, is never called. The pose's angles were set for the old legs, and the person
  is scaled ×0.92 (`stage.ts` `SEATED`). The karts do the same at ×0.9 (`kart3d.ts`).
- **Driver:** the hands are on the rim. Her torso is 30–40 cm forward of the backrest, hunched over
  the wheel. Her legs disappear under the dash, and the pedals (`sedan.ts`) aren't used as foot
  targets.
- **Passenger:** the hands are raised over the glovebox, and the back is off the backrest.
- **Getting in:** a 0.7 s slide from the door (`ENTER_S`). By 0.22 s she's already on the seat, so
  it doesn't read.
- **Getting out:** there is none. She appears standing by the door.

## The idea

One rule for all of it: **the thing says where the body goes, and the body solves to it.** No more
heights in the body's own space that only fit one body.

1. **Seats get a profile.** Today there is only `SEAT_HIP`, one height per kind. Each seat kind
   gets:
   - the cushion's height and how far it gives;
   - where the back is, and how far it leans;
   - where the feet rest (the floor, a step below, a footrest);
   - an armrest height, if any.

   `sit2` takes the real hip height and the feet's floor from it. The legs are solved to the
   ground, so the feet are planted for any body. The trunk leans back until it meets the back (the
   sofa and the beanbag reclined, a desk chair upright), and the hands go to the real thighs.
2. **Sitting down travels.** The hips go from where she stands to the seat over the sit-down, with
   the turn in it. The seat stops cutting through her mid-way.
3. **A desk pulls its chair in.** The sitter's place moves toward the desk until her knees are
   under it, or as far as the chair allows. It's a shared rule the server applies, so everyone sees
   her there (decided, below).
4. **The hands go to the thing.** Each act that touches something gets a world target from the
   object: the keyboard's keys, the arcade's deck, the piano's keys, the board's face, the
   machine's button, the cloth. The act keeps its rhythm (the bursts, the strokes, the press) as an
   offset around that target. The model already reaches world points (`reachTo`), so what's
   missing is the target being passed through `Motion3`. When it's out of reach, she leans or steps
   in. When it's still too far, the hands rest (on the desk's edge, the lap) instead of typing in
   the air. The hands get their real shapes: flat and curved over keys, a pinch on a marker, not
   fists.
5. **The car is solved like a seat.** The hips go on the seat's hip, and the back goes against the
   seat's back at its angle. The feet go on the pedals (the driver) or the footwell's floor (the
   passenger), and the knees go under the dash. The hands go on the rim, or on the lap for a
   passenger. `car2`'s breath and glances come on top, and the karts get the same solve.

## Phases

0. **The bench.** Keep `e2e/acts-shots.mts` as the before/after tool, and make it print checks:
   - the feet's height off what's under them;
   - the hips against the cushion;
   - each hand to its target;
   - the rim of a drink to the mouth.

   Shoot pool, pong, the arcade and the machines through their real flows, not just the busy
   state, to tell a real bug from the shots' shortcut (the pool still).
1. **Seats.**
   - Seat profiles for the chair, armchair, sofa, beanbag, bench, park bench and stands, each with
     the right look's height and back.
   - Wire the real drop into `sit2`, and solve the feet to the floor or the step.
   - The back lean to meet the back, and the hands on the real lap.
   - The sit-down travelling from the standing spot.
   - The rot 0 chair's facing.
   - A unit test that every seat kind × body (slim, regular, broad) has its feet within 1 cm of the
     ground and its hips on the cushion.
2. **Desks.**
   - The keyboard's place (or the computer's) passed through to the pose, with typing on the keys.
   - The chair pulled in: the shared sit spot at a desk, set by the server and undone on getting
     up.
   - Open hands on the keys.
   - The reception desk, and a desk with no keyboard (the hands rest on the desk's edge or the
     lap).
   - The computer used standing: stepped in, typing on its keys.
   - A test: the fingertips within 2 cm of the keys' top.
3. **Things used standing.**
   - The arcade, piano, whiteboard (with a marker), machines (a press you see, then the drink
     taken into `held`), pool (after phase 0's check) and gamepad (a pad drawn), each to its
     thing's parts.
   - Where she stands for each (the approach distance) checked against the new reach.
4. **Drinks.**
   - The mouth anchor refit to the new head, with the rim at the lips over a beard.
   - The tip so a cup's rim doesn't cut the cheek.
   - The sit-and-sip together.
5. **Cars and karts.**
   - The solved seat: the hips, the back on the backrest, the feet on the pedals or the footwell,
     the hands on the rim or the lap.
   - `car2`'s life on top.
   - Getting in that reads (ducking in, the slide over the sill).
   - Getting out, the same played backward.
   - The karts with the same solve.
6. **Checks.**
   - The stills again into `design/acts/after/`, side by side with `before/`.
   - The anim census for new pops, and the yutopia-acts / yutopia-chars budgets.
   - `e2e/actions.spec`, `car.spec`, `computer.spec` and `games.spec`.
   - The sat and car poses on the `/dev/anim` bench with the real seats' numbers, not its own
     −0.34.

Phase 1 alone fixes the feet and the sinking everywhere, and it's the one most people see.
Phases 2–5 are independent of each other.

## Decided (2026-10-31)

1. **Full size in vehicles where it fits.** The solved pose is tried at ×1 in the cars and the
   karts. A shrink stays only for a vehicle where the head would meet the roof, and only as much as
   that needs (phase 5 says which).
2. **The coffee, water and vending machines end with the drink in your hand.** You see the press,
   then the wait, then you take the cup (a soda from the vending machine). It becomes the held drink
   (`Player.held`), ready to sip. This is a server change: using the machine sets `held` when it's
   done, as the queue's "get a coffee" does today if it does. Check `features/held.ts` so the sweep
   doesn't clear it (memory: the held sweep clears unknown kinds). Phase 3.
3. **Sitting at a desk really moves you in.** The seated position is moved toward the desk for
   everyone, on the server: the sit spot for a seat with `props.desk` is pulled toward its desk.
   - The pull is up to where the knees go under the top, or as far as the desk's front and the
     chair's footprint allow.
   - It is undone when you get up, so you stand back on the chair's tile.
   - `atWork`, the hearing and the computer's reach are checked against the new spot.
   - It moves from phase 2's drawn-only pull to a shared rule (`packages/shared`), so the client's
     drawing and the server agree.

## Phase 1, the seats (built 2026-10-31)

- **Each seat's shape** (`tp/seats3d.ts`), read off its drawing (`art/items`) as it looks sat on:

  | seat | cushion | front edge | back face | lean | other |
  |---|---|---|---|---|---|
  | chair | 0.357 | +0.30 | −0.32 | 0–0.15 | |
  | armchair | 0.344 | +0.40 | −0.21 | 0.1–0.3 | arms 0.485, solid front |
  | sofa | 0.424 | +0.42 | −0.10 | 0.2–0.3 | solid front |
  | bean bag | 0.281 | +0.36 | none | 0.4 | solid front |
  | bench | 0.286 | +0.32 | none | 0 | |

  - Heights and edges are in metres. The edges are measured along the way she faces, from the
    tile's middle.
  - The sofa's cushion was in the table 6 cm under its real top (0.388): that was its sinking.
- **Her place on it** (`seatFit`):
  - The hips go where the knees reach the front edge.
  - The trunk leans back (the pelvis, the head kept level) until it meets the back, as far as the
    seat lets her. The rest of the way, the hips go back.
  - A seat solid to the floor in front keeps the feet ahead of it.
  - The armchair has her hands on its arms.
- **The legs solved to the real floor** (`sit2` takes a `SitFit`):
  - The real drop (`sitDrop`), the model's own hips, the floor and the lean are passed in. The
    `seatDrop` the world never passed is gone.
  - Out on the land, the floor is the lowest of three rays ahead of the seat.
  - A stand's row is one block at the seat's height in the physics, so there the feet go a riser
    (0.45) down into the footwell, as it's drawn.
- **Sitting down goes back onto the seat:**
  - The Sit action walks you to just in front of the seat (its middle when a desk's there).
  - The hips travel from where you stood to their place as they go down, and back off it getting
    up.
  - The seat's snap now moves the walker's body with you. Before, it walked you straight back off
    for a frame, and the sit started over.
- **The facing:** sitting turns the walker's own yaw to the seat's way too. It used to keep the way
  you walked on, and turned you back round: the chair at rot 0 had you facing its back.
- **Checks:**
  - `tp/seats3d.test.ts`: every seat × slim, regular and broad, sat at five moments. The feet are
    never under the floor and one is on it, the thighs are on the cushion within 2 cm, the knees
    are at the front, the feet are clear of a solid front, and the back is to the back.
  - The stills in `design/acts/after/`: the heels are at 0.052–0.064 m on every seat, the park
    bench and the stands (0.063 stood). Before, they were −0.045 to −0.12 indoors and 0.26 over the
    footwell on the stands.
- **Left for later phases:** the satchel's swing still goes through a cushion (plan 61's dangle meets
  no furniture); the hands at a desk (phase 2).

## Phase 2, the desks (built 2026-10-31)

- **The chair pulled in, for everyone** (`packages/shared/src/grid.ts`):
  - When the grid is built, a chair with a desk's top on the tile in front of it gets
    `pull = DESK_PULL` (0.40 tiles). This applies to anything with a `surface` that isn't on one:
    a desk, the reception desk, tables.
  - `seatSpot(x, y)` is where a sitter goes: the seat's middle, pulled in that far toward its desk.
    It's still the chair's own tile, so `seatAt`, `atWork` and occupancy are unchanged.
  - The client's seat snap and the server's teleport onto a seat (`WorldRoom`) both put you there.
  - The chair is drawn pulled in with you on it (`props.pull`, the item's sketch offset).
  - Seated, the hips end 0.32 m from the desk's edge (they were 0.6) and the knees go under its top.
- **The hands on the keys:**
  - The view finds the keyboard ahead of each typist (`tp/view.ts` `keysFor`, cached by place and
    facing): a keyboard on a desk within 1.3 tiles. Failing that, the keys go just this side of the
    computer or the monitor they face.
  - It passes the keyboard's middle and its top's height (`PersonIn.keys`).
  - `person3d.ts` turns that into her own space for `sit2` and `busy2("computer")`.
  - Sat, she leans in only as far as the keys are off, the head held up to the screen.
  - Stood, she bows from the hips over the desk, the legs straight under her, until the keys are in
    reach.
  - Past reach, the hands rest on the desk toward the keys.
- **The hands themselves:**
  - New `Hand.level`: after the arm's IK, the model turns the wrist so the hand points a set pitch
    from level (two steps of its own bend).
  - On the keys it's 0.12 rad down, the fingers curved onto them: no fists, no fingers driven into
    the keys by a steep forearm.
  - The wrist sits 2 cm over the keys' top.
- **Stood at a thing on a desk** (a computer, a radio), you're walked to just clear of the desk's
  edge (0.23 out from its tile, about 0.29 m off the desk), not a whole tile back.
- **Checks:**
  - `packages/shared/src/build.test.ts`: a chair at a desk pulls in, and stays on its tile; one
    alone, or turned away, doesn't.
  - `tp/keys3d.test.ts`: slim, regular and broad, sat and stood, the keys near the edge, mid-desk,
    to one side, and at reception height. The knuckles are 0–3.5 cm over the keys, over the
    keyboard itself.
  - The stills (`design/acts/after/desk-*`, `reception-*`, `computer-standing-*`):
    - At the desk, the knuckles are 1.2 cm over the keys and the ray under every finger meets the
      keyboard. Before: 18 cm over, in front of the desk.
    - At reception, 0.8 cm.
    - Stood, 3.5 cm, over the keyboard (before: 30 cm over, 15 cm short).
- **Not done here:** sitting down at a desk starts from the chair's middle, since the desk is where
  its front would be. The chair is in its pulled place from the start of the sit, not slid in.

## Phase 3, what's used stood (built 2026-10-31)

- **The thing's own parts:**
  - The view finds what someone's busy at (`tp/view.ts` `partsFor`: the nearest of its kind
    within 2.5 tiles). It hands their parts to the pose (`PersonIn.parts`), read off each drawing at
    rot 0 and turned with it (`hostWorld`):
    - the water cooler's cold tap and its paper cups;
    - the vending machine's keypad and its flap;
    - the coffee machine's buttons and the cup under its spout, on whatever counter it's on;
    - the piano's keys, along where you stand;
    - the whiteboard's face, along where you stand.
  - `person3d.ts` puts them in the body's own space, and `busy2` reaches them.
- **Timed from when it began** (`MotionIn.busyT`, kept by `person3d.ts`): a machine's press comes
  first, not at a random point in a five-second loop.
- **The machines:**
  - The press you see, then the wait, then the drink taken. The server was already putting it in
    your hand (`item:take` into `Player.held`) as the machine finishes. The water's and the vending
    machine's times are lengthened to 1.4 and 1.5 s to fit.
    - Coffee: the button, then the cup from under the spout.
    - Water: a cup from the holder, held under the tap, the tap pressed.
    - Vending: keyed in, then down to the flap.
  - Down to a low part, the knees bend as far as it's low, the hips go back to keep the head off the
    machine, and the back leans over. It's not a stiff-legged fold; the free hand goes on the thigh
    right down at the flap.
- **The whiteboard:** the marker's tip is on its face along the lines, and the eyes are on the
  line. A marker is drawn in the hand.
- **A pad in both hands** for a game or the slot cars, drawn between them.
- **Pool:**
  - On a shot, the shooter is drawn at its cue, not at their spot holding nothing. The table hands
    over who's on the shot and its cue (`TableScene3.shooters`).
  - Drawn behind the shot, a little left of the cue's line, eased there and back in 0.35 s.
  - Bowed over it till the bridge hand reaches the cloth behind the tip, the left leg forward.
  - The back hand is on the cue where the table draws it back and through, so the stroke is the
    cue's own.
  - Waiting for the turn, they stand by and watch the table, rather than stroking a cue that isn't
    there.
- **Stood up close:** the Use menu walks you to 0.26 off a machine or the piano and 0.4 off a
  whiteboard. Before, it was a whole tile back, out of reach.
- **The hand laid level** moved to its own small module of the 3D view's (`tp/level3d.ts`), and the
  legs' measures are read off the bones (`seats3d.ts` `legOf`): the people's chunk is as it was.
- **Checks:**
  - `tp/uses3d.test.ts`: coffee pressed and the cup taken, water's cup and tap, vending's keypad
    and flap, the whiteboard, pool's bridge and grip. Each hand is within 9 cm of its part (most
    within 5).
  - Stills in `design/acts/after/` (`coffee-`, `water-`, `vending-use-*`, `whiteboard-*`,
    `slotcar-*`, `pool-*`).
  - Budgets: the page 420.9 of 430; yutopia-chars 58.0 of 58, 10 bytes under; yutopia-acts 6.2 of
    15.
- **Not done:**
  - The arcade cabinet is decor (nothing sets "arcade"), so it's left.
  - The pool shot is checked by the unit test; the stills have no game running.
  - The piano: done in the next section.

## The piano's stool (built 2026-10-31, the user's call: a stool, played sat)

- **The stool:** its keys are drawn 0.51 m up, sized for the old people. Stood, she folded over them
  and still didn't reach. So the piano now has a stool, drawn with it out in front of its keys:
  - four legs and a padded top in the case's wood, 0.6 × 0.3, its top 13.4 iso px (0.34 m);
  - its middle at the shared `PIANO_STOOL` (1, 1.27) in the piano's own tiles.
- **It's solid:** a second part of the piano's physics shape, so people bump into it rather than
  walk through it.
  - The shared shapes test allows the piano 0.45 m past its footprint (the lamp post had the only
    other exception).
  - The client's shapes test agrees with the drawing.
- **Playing it sits you on it** (`person3d.ts` `atPiano`): seated on a new `stool` seat at the
  stool's spot, facing the keys, typing on them.
  - Everything from phases 1–2 applies: the sit-down, the legs to the floor, the lean in, the hands
    laid level on the keys.
  - The hands go wide along the keys, apart and together (`Keys4`'s spread, 0.2 m).
  - A backless seat's `rear` keeps the hips on it.
- **The Use menu** walks you to just behind the stool; you're drawn sat on it from there.
- **Placed** so the knees stay in front of the key ledge (its underside is 14 iso px, lower than
  anyone's knees sat) while the hands still reach. The feet go under the ledge by the pedals.
- **Checks:**
  - `tp/keys3d.test.ts`: slim, regular and broad on the stool. The knuckles are 0–4.5 cm over the
    keys, over them, and the knees' fronts are clear of the ledge.
  - The stills `design/acts/after/piano-*`.


## Phase 4, the drinks (built 2026-10-31)

- **Measured first:** mid-sip, the drinking edge (the mug's rim, the cup lid's edge, the can's top)
  against the lips (the head's front at the mouth's height). Every drink was 1–2 cm inside the lip
  surface (in the jaw and beard), 1 cm to the right, toward the cheek. The cup's apparent 6 cm
  miss was its domed lid, not where it's drunk from.
- **The mouth's target refit to plan 59's head** (`build/index.ts` `anchors.mouth`, numbers only,
  the people's chunk the same size):
  - 0.9 cm toward the middle and 2.5 cm forward.
  - Each drink's edge now lands within 1 cm of the lips plus a moustache's width (1.2 cm),
    square in front of the mouth.
  - It also serves the sip emote, which reaches for the same mouth.
- **Sat with a drink:** between sips it's held at the waist. That height was stood's, measured from
  the floor, so sat it was up at the chest. `person3d.ts` now brings it down with the hips' drop:
  in the lap. The sip itself follows the chest and was already right sat.
- **Checks:**
  - `tp/drinks3d.test.ts`: slim, regular and broad, beard or none, a mug, a cup and a can. The
    rim is within 3 cm of the lips, never in the face, and within 1.5 cm of the mouth's middle.
  - The stills `design/acts/after/{mug,cup,soda}-*` and `sofa-mug-*`.
  - The budgets: the page 421.0 of 430; yutopia-chars 7 bytes under its 58 KB.

## Phase 5, cars and karts (built 2026-10-31)

- **Measured:**
  - The sedan's pedals were 0.97 m ahead of its front seats' hip point; the people's legs reach
    0.80, hip to ankle. The old fixed-angle pose never tried: the feet were lost under the dash.
  - Its seat backs lean 20°, while the old pose sat upright 30–40 cm off them, hunched at the wheel.
- **The front seats slid 0.12 forward on their runners** (`sedan.ts`; the cockpit's eye with them).
  Now the right foot reaches the throttle with the knee bent, and the arms hold the wheel bent.
  - The sedan hands out its pedals' faces and its footwell floor (`Sedan.pedals`, `floor`).
  - A kart hands out its two pedals.
  - The kit vehicles (the plough, the snowcat) have none: they keep the old guess and their ×0.92.
- **`car3`** (the acts chunk; the people's own chunk untouched):
  - Each leg is solved to its foot's place and the trunk reclines to the seat's back, the head
    kept level.
  - Passengers' hands go in the lap; car2's breath and glances are on top.
- **`tp/car/seatfit.ts` `carFit`** fits a person to their seat: the hips onto it and the back's
  lean, with each foot placed by seat:
  - the driver's right foot on the throttle and left on the floor by the clutch;
  - a passenger's on the footwell floor, the rear ones nearer;
  - a pickup bed's out flat;
  - a kart's on its two pedals.
- **Used by** the live cars (`car/cars.ts`), the car stage (`tp/car/stage.ts`) and the karts
  (`tp/kart/kart3d.ts`), where the lean into the corners and the dizzy slump are kept.
- **Full size** in the sedan, the off-roader and the pickup (all with pedals) and the karts. In
  the sedan the head tops out at 1.44–1.46 m under a 1.48 headliner.
- **Getting in and out by the door:**
  - Getting in (1.0 s): stood at the open door, sat on the sill with the feet on the ground
    outside, then swung in, turned to the wheel.
  - Getting out (0.8 s) is the same backwards, the model kept that long and the person drawn only
    after.
  - Getting in never played before: a parked car becoming a live one began knowing who was in it
    (`wasParked`), and the model remade as the camera went to the cockpit lost its start. Both are
    fixed.
- **Checks:**
  - `tp/car/seatfit.test.ts`: in the sedan, slim, regular and broad, the driver and the passenger.
    - The right ankle is on the throttle (within 6 cm) and the left on the floor; nothing is under
      the floor or through the firewall.
    - The head is under the headliner, the back is to the reclined seat back, and the hands are on
      the rim (3 cm).
    - In a kart, the feet are on its pedals (8 cm).
  - Stills `design/acts/after/car-*`.
  - Budgets: the page 421.0, yutopia-car 26.7 of 120, yutopia-karts 23.5 of 60, yutopia-acts 6.4.
  - `e2e/car.spec`: the passenger test is red on HEAD too, and "a parked car knocked" passes (red
    once, from the stills' runs leaving the lot moved).

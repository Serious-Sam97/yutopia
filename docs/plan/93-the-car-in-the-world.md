# Plan 93 — the car in the world

Asked 2026-11-16, after the user's second drive of plan 92's cars: the handling still isn't right, there's no tyre
squeal, getting in and out looks strange, the driver's hands don't turn the wheel — and a plan for how the car lives
in the world: the people in it and around it, the guns, the snow, the voices. Plus suggestions of my own ("six or
more, surprise me").

Status: **planned; forks decided 2026-11-16** (asked one by one, all the recommended ones, every suggestion in):
F1a planted · F2a squeak on snow · F3a full act, slide over · F4a hand-over-hand · F5 all of S1–S10 · F6a grounded,
never burns · F7 passengers and the driver's revolver under 30 km/h · F8 hurt only in a fight · F9a belts always on,
jolted only. **Phases 0–4 built 2026-11-16** (uncommitted): the feel signed off by the user ("feels right, go on"); their gates left: the tyre sounds by ear, the getting in and out seen. **S1–S10 built 2026-11-16.** Next: the stills of S7–S10 (waiting for the dev world), then the checks phase.

## Where we are, from the code

### What the user found

1. **"When I turn, the back wheels follow strangely, as if slipping a little."** In `/dev/car` at 71 km/h with D
   held, the front tyres were at α 11° and the rears at 4°. The fronts are well past their peak (`FEEL.peak`
   1.35 × the ground's α), so they push, and the arcade layer (`shared/car/assist.ts`) adds yaw on top:
   - **turn-in** (`turnIn` 4.2) twists the body round its centre toward the yaw the steering asks for;
   - **stability** (`damp` 2.2) damps what wasn't asked for.

   Both are torques on the body, not forces at the tyres. So the car turns about its middle and the tail swings out
   to meet it: the rear "follows" a turn its tyres didn't make. Three more things loosen the rear in ordinary
   driving:
   - lifting off while turning above 8 m/s drops the rear's side grip to 0.82 for 0.4 s (`liftGrip`);
   - past ~10° of body slip on throttle it drops to 0.78 (`driftGrip`);
   - the front is given 1.08 while "sliding".

   On keys, "steer limited by speed" lets the front run to 0.9 × peak plus a slip allowance, more than the tyre
   gives back.
2. **No tyre squeal.** It's there (`world/car/sound.ts`: a `skid` bed and a `squeal` shot from Freesound's Chrysler
   LHS recordings), but only plays when a tyre is past 85% of its grip *and* sliding over 1.5 m/s, *and* on hard
   ground: asphalt, walk, floor or rock. After plan 92's tuning a hard turn on asphalt rarely gets there. The winter
   town's roads are mostly packed snow, where the squeal is never used, only `snow-slide`. So on the user's drives
   it never sounds.
3. **Getting in and out looks strange** (`car/cars.ts` around line 1733). The person appears sat at the seat's
   level, beside the door, and is slid 0.85 m sideways and turned 90° into the seat over 1.0 s. Getting out is the
   reverse in 0.8 s. Nobody walks to the door or puts a hand on it. The door swings by itself on a timer
   (`doorUntil`, 1.1 s). An empty car from the passenger side puts you in the driver's seat by the driver's door,
   on the other side of the car.
4. **The driver's hands don't turn the wheel.** The hands are put on the rim at fixed points, ten to two
   (`l.model.rim(±1.0)`). `rim()` works in the wheel's rest frame, so the wheel turns under the hands and the hands
   stay put.

### How the car meets the world today

- **Guns:** a shot is checked on the server (`world-server/features/arms.ts`) against walls, the shadowed and
  people. A car is not in the ray at all: bullets pass through cars, glass and tyres, and a car is no cover.
- **People and pets hit by a car:** above `KNOCK_V` they're knocked down, never hurt (`features/cars.ts`). Pets the
  same.
- **Damage (plan 92 phase 9):** dents, a falling bumper, cracked glass, dead lamps and steam come only from knocks.
- **The bonnet and boot** are modelled on hinges (plan 92), but nothing in the game opens them. The boot holds
  nothing.
- **The cabin:** occupants get the radio. Voices are the world's proximity voice, the same inside a car as outside.
- **The snow:** the car's own snow on its roof and windscreen exists (wipers). Its tyres leave no tracks.

## The idea

Make the car a place, not just a vehicle: it drives with its tyres, sounds like rubber on the road, is got into
like a real one, is held by a person who steers it, and is part of the world's other rules. Bullets meet it,
people meet it, snow remembers it, and the people inside it are together.

## The four asked

### A. The handling: tyre-led, the rear planted (F1)

1. **Measure first.** Use a probe on the bench and a `car-feel.mts` drive in the game. Log each tyre's α and its
   share of grip used, the body's slip angle and where the yaw comes from (tyres or assist), in:
   - ordinary town turns at 30–60 km/h;
   - a lift mid-turn;
   - a lane change at 90 km/h.

   Before any change, record "the rear follows" as a number (rear α against front α, and the yaw the assist adds).
2. **Turn with the tyres.** Make the assists' yaw torques small in the grip range, and let them act only past the
   limit: catching a slide, holding a drift.
   - turn-in becomes a little front grip near peak, not a body twist;
   - the stability torque only works once the body's slip angle passes ~6°.
3. **A planted rear by default.** No grip cut on an ordinary lift. The lift slide only comes with a real flick:
   steering past 60% of lock above 50 km/h, then off the throttle. The drift grip only comes once a slide has
   really started (handbrake, or body slip past 15°).
4. **The keys' steering limit at the tyre's peak.** Each speed allows the lock that puts the front at its peak α,
   not past it, so the car turns as tight as the tyres can. Add a little understeer you can feel: the wheel lightens
   past the limit, and on a pad the rumble says so.
5. **The car's own bias.** Each body gets a front/rear grip balance and a yaw inertia that fits it: the sedan mild
   understeer, the hot hatch lift-happy, the van and 4x4 lazy.
6. **On `/dev/car`:** a graph of front and rear α over time, and an "assist yaw" trace, so the feel can be tuned by
   eye.

### B. The tyres' voice (F2)

- **Squeal from the slip, not a threshold:**
  - a scrub whisper from ~50% of grip used;
  - a chirp on a quick turn-in or a hard launch;
  - a full squeal near and past the peak;
  - a long skid when locked or sliding.

  Pitch and level follow the slip angle and slip speed. Each wheel is its own voice, mixed, so a corner squeals
  from the outside front first.
- **On snow:** a squeak and crunch instead of rubber on tarmac. Packed snow squeaks (it really does at −10°C); ice
  hisses (there today). On wet asphalt, a hiss with a little squeal.
- **The picks:**
  - more candidates on `/dev/car-sound` for `squeal`, `skid` and the new `scrub`, `chirp` and `snow-squeak`;
  - a looped squeal that crossfades rather than one-shots, so a long corner squeals steadily;
  - a CC0 search as plan 92's, with the user picking by ear.
- **Heard by others:** the sliding sent on the wire (the `wc` wheel compressions plus a slip byte per wheel), so
  someone on the pavement hears your car squeal by.

### C. Getting in and out (F3)

On foot, X by a car (`nearest()` picks the seat):

1. **Walk to the door:** the walker steers to that door's spot (its handle), facing it. It's short, under 1.5 m from
   where you pressed, and it's cut if you move.
2. **Open it by hand:** the near hand to the handle (`reachTo`), and the door swings *with* the hand (the door's
   angle follows the reach, not a timer). The click plays at the pull.
3. **In:** step in with the near leg, duck the head under the roof line, sit, swing the other leg in. Each body's
   seat, sill and roof height comes from the manifest's `seat_*` and door pivot, so the van climbs up and the hatch
   ducks.
4. **Close it:** reach across for the inside pull, swing it shut, the thud.
5. **Out:** the same backwards. The door opened from inside, a foot out, a hand on the pillar, up, the door shut
   behind with the outside hand.

Others see the same: the door's angle comes from the person's act. A passenger getting in at the back uses the
back door. An empty car got from the passenger side: you slide across into the driver's seat (F3b), or walk round
(F3c). The camera eases in over the act, as today's 1.0 s. A pad or keys can cut the act short: X again skips to
sat.

The animation joins plan 58's acts (`chars/anim/acts.ts`): `carIn`, `carOut`, `carSlide`. They are bench-tested on
`/dev/anim` with each body's door, like plan 62's seat fitting.

### D. The driver's hands (F4)

- The hands hold the rim *in the wheel's frame*: `rim(phi + wheelAngle)`.
- Small turns: the hands turn with the wheel, up to ±90° of rim.
- Bigger: hand-over-hand. One hand lets go and re-grips while the other turns, so the wheel's 1.5 turns lock to
  lock can be followed. A U-turn at a crawl reads as a real one.
- Shuffle steering instead (the hands sliding on the rim) is the alternative (F4b).
- The shoulders and head follow: the head looks into the turn a little, already there in the camera's `steerLook`.

## The car in the world — suggested (pick which, F5)

These are mine, as asked. Each is a phase of its own. Picked in F5, ordered in phases after A–D.

### S1. Bullets meet cars (F6)

- Each car's hull goes into the server's shot ray (the server knows every car's pose: the vehicles' wire).
- Its parts are split into zones by the model's manifest:
  - glass;
  - thin panels (doors, wings, boot);
  - hard parts (the engine block, the wheels' hubs);
  - tyres.
- What each round does:
  - Glass cracks at the first hit and is gone after two or three. The shards come from plan 92's crack effect.
  - A panel takes a hole (a decal at the hit, on the model). A pistol round may pass through a door into the
    cabin; the sniper's always does.
  - The engine block stops everything: the front of a car is real cover.
  - A tyre goes flat (F6). Its radius drops 4 cm, grip and pull go to that side, the rim sparks on asphalt; at
    30 km/h it's drivable and wobbly.
  - Enough hits on the front: steam, then the engine dies (plan 92's steam and `dead` path).
- Whether a car can burn is F6's question: grounded (it dies, never explodes) or a rare fire from a hit tank.
- Sound: rounds into steel, glass, the tyre's bang and hiss.

### S2. Shooting from a car (F7)

- A passenger can draw (plan 87's quick slots) and aim out of their window. The window winds down, the body turns
  in the seat, and the aim is limited to that side's arc.
- The driver gets one hand, F7: the revolver only, and only under 30 km/h; or never.
- Reloads in the car: the revolver's speedloader yes, the long guns not in the front seats.
- The shadowed and the Vortex fight (plan 88) come into it: a car can take a hit from them (its own dents) and is
  shelter for the person inside.

### S3. People, pets and the car's horn (F8)

- **Hit by a car:** a stagger at walking pace; knocked down and rolled by the car's speed (the ragdoll, plan 58)
  above it.
- Whether it hurts is F8:
  - never (today's, friendly);
  - only in a fight (the dark's rules);
  - above a speed, hp and the Down state.
- **The horn:** people and pets ahead look round at a tap. A long blast makes the walker AIs (park life) and
  people's idle bodies step aside: a glance and a hop back to the kerb, a dog barks back.
- **Walking at a car:** someone stood in front of it gets pushed slowly at a crawl, never run through. The car stops
  for them at the bumper below 3 km/h.

### S4. The boot, the bonnet and the glove box

- **The boot is storage** (plan 86's pack): a car's own pockets, kept on the car (server-side, like the pack). The
  boot opens on its hinge as you look in, and shuts.
- **The glove box:** a small one, the driver's or front passenger's from the seat (`G`).
- **The bonnet opens** (its hinge, already modelled) for the repair (S7).

### S5. The cabin: voices, windows, belts

- **Inside is a room for voices:**
  - the people in a car hear each other clearly at any speed;
  - the world outside comes in muffled, with the windows up;
  - a window down (its switch: each seat's own) lets it in, and lets you be heard outside.

  The proximity voice already exists (LiveKit); this is a per-car "room" over it.
- **Wind and the arm out:** a window down at speed is wind noise; an arm on the sill at a cruise.
- **Seat belts** (F9a): always on as you sit (today's `belt()` sound). In a big crash the body jolts in its belt,
  the screen blurs a moment and the ears ring (plan 88's hit feel); nobody leaves their seat.

### S6. The snow remembers

- **Tyre tracks:** each wheel lays a track in fresh snow (a decal strip on the land). Others see it, and it fades
  over the hour as the snow falls again, like footprints (`footprints.ts`).
- **Ruts:** deep snow gets ruts the next car follows (a little grip and a pull into them).
- **Snow on parked cars:** it builds while parked (exists) and slides off the roof in a slab as you pull away or
  brake hard.
- **Chains** (an item): fitted kneeling by a wheel, 6 s each; grip on snow and ice ×1.5, on asphalt a rattle and
  45 km/h at most.

### S7. Repair and wear

- Damage stays on a car (it does: `car:wear`) until it's mended.
- **At the gas station's bay:** pay or use a wrench item. Under the bonnet (S4), a few seconds per part:
  - panels;
  - glass;
  - lamps;
  - the radiator;
  - tyres (a spare in the boot: changed by the road, jack and all, 20 s).
- **A tow rope** (an item): one car pulls a dead one, a rope that stretches (Jolt distance constraint), the dead
  one's driver steering.

### S8. The driver's body lives

Beyond D:
- the head checks the mirror before a lane change (on the indicator) and looks over the shoulder in reverse;
- a hand to the gear lever on each manual change (F4a in plan 92);
- the palm on the horn's pad as it sounds;
- at a stop, a hand off the wheel to the thigh;
- the body leans with the car's g (the sway exists for the camera, not the body);
- passengers sway with the g and grab the handle over the door in a hard turn.

### S9. Lock, keys, alarm

- Lock it from outside (`L` by it): the indicators flash twice and a chirp plays.
- A locked car: its doors don't open for others. The owner's lent keys (plan 92's `mayDrive`) open it.
- Its alarm sounds (a whoop, the lamps flashing, 20 s) when it's shot, knocked hard while parked, or a stranger
  tries a door. The owner's phone gets a notice (the phone exists).

### S10. A drive-in / the car as a social spot (a wild one)

- Park facing the Kart Park's screen or the lake at night with the radio on: the car's headlamps off, the dash lit.
- Others parked near can tune to the same station (the radio's shared stream).
- A "flash your lights" emote, the horn's two-tone tap.
- A small one, but it's what people would *do* with cars in Yutopia.

## Forks (decided 2026-11-16 — the first option of each, S1–S10 all in)

- **F1, the handling's character:**
  - a) planted, mild understeer, slides only when asked (Forza Horizon's road car);
  - b) neutral, the rear rotates easily on a lift (a 90s rally game);
  - c) as today with the rear's lift cut softened only.
- **F2, the squeal on snow:**
  - a) squeak and crunch on snow, squeal on asphalt only (real);
  - b) a squeal on packed snow too (louder feedback, less real).
- **F3, getting in:**
  - a) the full act, walk-open-in-close, ~1.6 s, X again skips;
  - b) the same, but the passenger side of an empty car slides you across;
  - c) a short one, ~0.9 s, hand on the door, no walk.
- **F4, the hands:**
  - a) hand-over-hand;
  - b) shuffle (the hands slide);
  - c) hands follow ±90° and stay.
- **F5, which suggestions** (several): S1–S10.
- **F6, bullets and a car:**
  - a) grounded: holes, glass, flats, steam, it dies, never burns;
  - b) as a), plus a rare fire from a hit fuel tank (it burns out, no blast);
  - c) GTA: enough damage and it explodes.
- **F7, shooting from the car:**
  - a) passengers only;
  - b) passengers, and the driver with the revolver under 30 km/h;
  - c) nobody.
- **F8, a person hit by a car:**
  - a) knocked down, never hurt (today);
  - b) hurt only in a fight's rules (the dark);
  - c) hurt above ~25 km/h, Down above ~50.
- **F9, the unbelted crash:**
  - a) jolted only;
  - b) thrown against the dash;
  - c) out through the windscreen (ragdoll) above a crash speed.

## Phases (once the forks are decided)

- **0. Mocks and measures:**
  - the handling's numbers (A.1);
  - a get-in storyboard (stills of each step on the saloon, the van and the 4x4);
  - the hands' wheel range;
  - the sound candidates for B.
- **1. The handling** (A): tyre-led yaw, planted rear, steer limit at the peak, per-body balance, the `/dev/car`
  traces. The user's gate: the feel on `/dev/car` and in town.
- **2. The tyres' voice** (B): the slip-led squeal, the snow squeak, the wire's slip byte. The user's gate: the picks
  on `/dev/car-sound`.
- **3. The hands** (D), and the driver's body (S8 if picked).
- **4. Getting in and out** (C): the acts, the door on the hand, others seeing it. The user's gate: the stills and
  the feel.
- **5…** each picked suggestion in its own phase, in this order:
  - S1 (bullets);
  - S2 (shooting from it);
  - S3 (people and the horn);
  - S4 (the boot);
  - S5 (the cabin's voices);
  - S6 (snow);
  - S7 (repair);
  - S9 (lock);
  - S10.
- **Last, checks:** the specs near each phase (`car.spec`, `car-look.spec`, the arms specs), `car-fixes.mts` and
  `car-jerk.mts`, a frame-time drive on Low, the memcheck.

## Risks

- **Server ray cost:** cars in the server's shot ray means every shot tests every car near the line (a broad-phase
  by the vehicles' grid). Cars are few (tens), so it's cheap if it's culled.
- **Act fit:** getting in must fit six bodies and the shuttle. The acts are fitted from the manifest's numbers, not
  per car; the van's high step and the hatch's low roof are the tests.
- **Voices:** a per-car voice room over LiveKit must not cost a reconnect. It's done with each listener's gains (the
  `earshot` path), not new rooms.
- **The feel:** a handling rework undoes the user's sense of plan 92's. Phase 1 keeps today's numbers on a
  `?feel=92` switch for an A/B.

## Phase 0 — built (2026-11-16): the measures

- **The handling in numbers** (`shared/car/feel-probe.ts`; `tsx src/car/feel-probe.ts`, `SPEC=` and `SET=` to try):
  turns at 30 and 60 km/h, a lift mid-turn, a 90 km/h lane change, on dry asphalt and on packed snow. Each tyre's
  slip angle, the body's slip, the lateral g, the arcade layer's share of the yaw (its angular impulse over the
  yaw reached). With plan 92's layer:
  - the assist put in 0.9–3.1× all the yaw the car reached. It turned the car, the tyres didn't.
  - In a 30 km/h turn on dry asphalt the rear tyres slid at 12° and the body at 6°: the user's "rear following,
    slipping a little".
  - The rear's grip cuts (lift, drift) never fired in these: not the cause.
  - With the layer's yaw off, the rear stayed at 0.5° and the front ran past its peak (17°), the plain understeer
    the steering's limit should keep it short of.
- **In town** (`e2e/car-feel.mts`, `FEEL=92` for plan 92's): on the wet town road at 31 km/h, the rear's slip with
  plan 92's layer grew from 2° to 27° over two seconds of a held turn, the tail going out more and more.
- **The hands' range:** the cars' steering wheels turn about 3 turns lock to lock (±550°; the plough truck 3.8, the
  snowcat 1.9), an 80s car without power steering. Even a 60 km/h bend is ~90° of wheel, so hand-over-hand (F4a)
  will show in ordinary driving. The snowmobile and the toboggan are handlebars (±24°, ±10°): the hands just follow.
- **The tyres' sound candidates** (for phase 2), on `/dev/car-sound`'s "everything else" tab:
  - `squeal-loop` (a held corner, 4: three Chrysler LHS takes and "Distant car tire screeching", my pick);
  - `scrub` (the edge of the grip, 1);
  - `chirp` (a turn-in, a launch, 3);
  - `snow-squeak` (2: a snowball's squeak, my pick, and walking in snow).

  Freesound's CC0 shelf is thin for these. The tyres' real squeal will lean on the loops; the snow's squeak may be
  synthesised if neither fits. `tools/sfx-cars-mine.mjs` takes `ONLY=` now, so a new slot's ordering never moves
  the files of slots already picked from.
- **The get-in storyboard** is moved to phase 4's start: stills of the act need the act.

## Phase 1 — built (2026-11-16): the handling, tyre-led (F1a)

- **The tyres turn it** (`ASSIST.tyreLed`):
  - turn-in's yaw only acts while the front's pushing past its peak (`pushFrom` 0.9 of its grip used; 1.6, was
    4.2): a nudge, the understeer still felt;
  - the stability's yaw only damps an oversteer (more yaw than asked, the same way) once the body slips past
    ~6° (`stabFrom` 0.1 rad; `damp` 3), never in a slide asked for (the handbrake, and a second after);
  - the lift's slide needs a real flick: past 60% of the lock above 50 km/h (`liftSteer`, `liftV`);
  - the throttle's drift grip only past 15° of slip (`slideFrom`);
  - no extra front grip in a slide.
- **The steering stops at the tyre's peak** (`drive.ts`, `helps.steer`): the front's slip angle fed back. Past 95%
  of its peak the lock is capped where it was; under it, it opens again. Not at a crawl, not in a slide (the
  handbrake, or the body past ~12°: the front's angle there is the countersteer's).
- **Each body's balance** (`REAR_BIAS`, the rear's side grip ×): the saloon and estate 1.06, the hatch 1.0, the
  4x4 1.08, the pickup 1.05, the van 1.1.
- **Results** on the bench (saloon; the hatch, van and 4x4 alike):

  | | Plan 92 | Plan 93 |
  | --- | --- | --- |
  | Rear slip angle | up to 12.3° | ≤ 0.5° on asphalt, ≤ 3.1° on snow |
  | Lift on snow, body slip | 8.3° | 1.6° |
  | Assist's share of the yaw | 0.9–3.1 | 0–0.2 |
  | Lateral g | 1.04–1.17 | 0.95–1.15 |

  In town (wet road, 31 km/h, a held turn): the rear stays at 0.1–0.5° where plan 92's grew to 27°.
- **`?feel=92`** (the world and `/dev/car`) drives plan 92's layer as the user drove it today. `/dev/car`'s Feel panel
  has "93 · tyre-led" and "92 · as before" buttons, and knobs for `pushFrom` and `stabFrom`. Its telemetry has a
  new trace under the speed graph: each axle's slip angle (front orange, rear green) and the assist's own yaw (pink).
- Checks:
  - `car.test` 33/33: the handbrake turn and the held drift still pass.
  - Shared 684/685: the pool AI's timing test is red under the full suite's load and passes alone twice.
  - Client car and view tests 108/108; `car.spec` 3/3; typecheck clean; `/dev/car` without errors.

## Phase 2 — built (2026-11-16): the tyres' voice (F2a)

- **Led by the grip each tyre uses** (`world/car/sound.ts`). On asphalt, a floor, rock (and the wet at 45%):
  - the scrub from half its grip (`scrub`);
  - a squeal held round a corner near and past its peak (`squeal-loop`, a loop, so a long corner squeals
    steadily);
  - a chirp when grip's taken quickly (a flick in, a launch, a stab of the brake: `chirp`);
  - the long skid only in a real slide (`skid`, as before).

  The synthesised chatter stands in for the held squeal where no recording is in.
- **On snow** (packed or path, not deep): never the rubber's. A squeak under the weight (`snow-squeak`), loudest at a
  crawl and leaned on in a turn, fading by ~35 km/h; the snow's roll, slide and crunch as before.
- **Others hear it:** the wire carries `grip` (the most grip any touching tyre uses, ×100, a byte: `CarWire.grip`,
  the server's `Vehicle.grip`). Someone else's car's scrub and squeal rise and fall as its driver's do; before, any
  slip over 1 m/s was a full squeal.
- Checked in town (`e2e/car-tyres.mts`):
  - a hard right turn on the wet road at ~40 km/h, grip used ~1.0: the held squeal 0.13–0.18, the skid ~0.1, a
    chirp at the turn-in;
  - onto the snow: the rubber falls silent, the squeak comes in;
  - the wire's grip ~100.
- The picks are mine until the user's ear on `/dev/car-sound` ("everything else", the four plan 93 rows).

## Phase 3 — built (2026-11-16): the hands and the driver's body (F4a, S8)

- **Hand over hand** (`cars.ts driverHands`):
  - Each hand holds a point of the rim: a mark on the steering wheel's own group, carried round as it turns.
  - Carried ~70° from its place (ten to two), a hand lets go and reaches back up the rim against the turn (0.24 s,
    down to 0.12 as the wheel's wound faster, a little lifted toward the driver), and grips again.
  - One hand moves at a time; the other turns the wheel.
  - The right hand goes to the horn's pad while it sounds, and to the gear lever's knob a moment on a gear changed
    by hand (the model's new `leverAt`).
- **The wheel at a crawl:** the keys wind the lock in 0.6 s below ~5 km/h, as a person winds an 80s car's 1.5
  turns (`drive.ts lockT`; above ~20 km/h as phase 1). At 0.16 s no hands could follow 547° of wheel.
- **The body** (`acts.ts car3`: `look`, `lean`):
  - the driver's head looks into the turn (to ±26° on the road wheels' angle);
  - it looks at the indicator's side mirror for a moment as the indicator goes on;
  - everyone in the car leans with its g, up to ~7°.
- **Checked** (`e2e/car-hands.mts`, the cockpit's stills):
  - Standing, wound to full lock (547° of wheel): 4 re-grips, both hands on the rim at the end (wrist to its grip
    point 5–8 cm, its palm's length) and back again.
  - The head turns 35° right into a right turn.
  - In a right turn at speed, the head goes 3.8 cm to the driver's left: out, with the g.
  - The spine's roll channel turned out to be + to the right; the lean's sign was found by that measure.

## Phase 4 — built (2026-11-16): getting in and out by hand (F3a)

- **Walked to the door:** X by a car walks you (the walker's own way, `walkTo`) to the spot outside the door you'll
  use, beside its seat, then gets in. If you walk off, the way is let go and you don't get in.
- **In** (`ENTER_S` 1.5 s, `cars.ts carAct`):
  1. Stood at the door facing it, the near hand to its handle; the door opened with the hand.
  2. Turned round, down onto the seat sideways, the legs swung in.
  3. The inside pull reached by the other hand; the door shut with it, and its thud.
- **Out** (`EXIT_S` 1.35 s):
  1. The inside pull; the door opened.
  2. The legs out, up.
  3. Turned to the car, a step back; the near hand on the handle pushes it shut.
- **The door is the hand's:** `doorBy` holds a door's opening while someone's act has it, for everyone who sees them.
  The handle and pull are marks on the door's own group, so the hand stays on them as it swings. While a hand
  holds a door, the old timer opens none beside it.
- **Across to the wheel** (F3a): an empty car got from its passenger's side is entered by that door, onto that
  seat, the door shut, then across to the wheel (`SLIDE_S` 0.45 s). Getting out after, it's the driver's own door.
  - On my own screen, the side comes from where I walked to.
  - Others see the slide when the server still has me where I stood. It has me in the car by then, so they see a
    plain driver's-door entry, a known gap.
- **One of me:** my own walker stays hidden while the car still draws me climbing out (the controller asks the
  cars' `seatedIds`). A car parked as its last one gets out is kept (`linger`) till they're out, and its parked
  copy waits.
- **Checked:**
  - `e2e/car-getin.mts`: the driver's door from the driver's side; the passenger's door and then across from the
    other side; out by the driver's door both times; one Ana throughout. The exit's full 1.35 s was measured on
    the game's own clock: the stills' labels run long, each screenshot taking a few hundred ms.
  - Specs: `car.spec` 3/3, `car-look` 1/1, `pets-car` 1/1, `spot` 4/4.
  - Client car and chars tests 40/40; world-server car 11/11; typecheck clean.
- Not done, for later: the walk's own approach into a door's swing (a person stood where the door opens is walked
  round it by nobody); a person getting in a vehicle with no doors (the snowmobile, the toboggan) still gets the
  plain sit-down.

## S1 — built (2026-11-16): bullets meet cars (F6a grounded)

- **Where a round meets a car** (`shared/car/shot.ts carAlong`): its ray against the car's box (the spec's body
  round its centre of gravity, at its pose: a driven one's quaternion, a parked one level at its heading). What it
  struck there:
  - a tyre, by its wheel, under its top;
  - glass, between the belt (55% up the body) and the roof;
  - a lamp, at the front's or back's outer corners at the lamps' height;
  - the engine block, the front's low half ahead of the front wheels' middle;
  - else a panel.
- **What goes through:**
  - glass, always;
  - a panel, for the AK's and the sniper's rounds, and the revolver's through a door's skin;
  - nothing goes through the engine block or a wheel.
- **What it does** (`shotDamage`, only ever more):
  - a tyre flat (new parts `flatFL`…`flatRR`);
  - the windscreen cracked, then badly; a side's windows gone;
  - a lamp broken;
  - a panel a hole and a 0.025 dent on that face;
  - the engine block +0.07 on the front: steam past 0.8 as before, and a hit past 0.9 kills it (`engineDead`) —
    about 13 revolver rounds into the nose.
  - It never burns.
- **The holes** (`addHole`): the car's own frame in cm, the latest 32, on `Vehicle.holes` and a parked car's
  `props.holes`. They're mended with its damage: the tow, its home, `mod:cars`.
- **The server** (`features/cars.ts room.carShot`): the nearest car along each pellet's ray, driven or parked
  (culled by the ray's line), and `apply`: a driven car's `v.dmg` and holes; a parked one's object props, saved to
  the API 2.5 s after the last round (a burst is one save).
  - `features/arms.ts`: each pellet tries the cars first.
  - A wall before the car: not struck.
  - One of the shadowed nearer than the car takes it instead.
  - A round stopped in a car hits nothing behind it.
  - One gone through is seen from the car's far side for what's beyond: the server's sight counts a parked car as
    a wall.
  - Everyone near (and the shooter) gets `car:shot`, what each round struck, for the effects.
- **A car shot dead** counts as stranded, as a dry one: towed after 10 minutes.
- **The client** (`car/cars.ts`):
  - On `car:shot`: sparks off metal along the face it came in by; glass flying; the car bank's own `hit-post` (a
    steel tink, pitched up) and `hit-glass`, heard where it struck (HRTF, by distance); a tyre's synthesised bang
    and its air going.
  - The holes on the model (`glb.ts setHoles`): a dark round and its chipped ring, laid on the body's real skin by
    a ray from the box's face onto the paint. Live cars, and parked ones near you, updated as they're shot; a
    merged parked one is made again.
  - My own car takes in what the server put on it (`wearOn`), so its glass, flats and engine follow the shots.
- **On the car once shot:**
  - **A flat** (`Drive.flats`): half that tyre's grip, along and across; its rolling ×8; a flat front pulls the
    steering to its side (`steerPull`); the wheel drawn 4 cm down on its rim, parked or driven.
  - **The engine dead:** it stops, won't start again, and says so (`carShotDead`).
- **Checked:**
  - `shared car/shot.test.ts` 4/4: the windows let the round on and the door stops a pellet, not a rifle's; the
    front is cover; a tyre goes flat; the engine dies after 10–20 rounds; a miss; a shot from inside; the wire's
    pose; the holes kept.
  - `world-server car-shot.test.ts` 2/2:
    - struck low at its nose the round stops, the person behind is unhurt, the front damaged, everyone near told;
    - through its side windows the person behind is hit and that side's glass gone;
    - a tyre struck goes flat.
  - The person behind first stood inside a storefront: the test had put them through the wall.
  - In town (`e2e/car-shots.mts`): rounds into a front door, a back door, the front side window, the front tyre and
    the wing — panel, panel, glass, tyre, engine — left `0.07,0,0,0.06,0|10240` (the right side's glass gone, the
    front-right tyre flat) and three holes, seen on the car (`shot-car-side` still).
  - Arms, cars, dark and Vortex server tests 33/34; the one red is Vortex's "scaling with the shooters", 5/5 alone
    (timing under load). `car.spec` 3/3; client car tests 93/93; typecheck clean.
- Not done: the rear window shows nothing (it's on through; no part for it); bullet holes on glass; the tyre's own
  flapping; impact recordings of our own (the car bank's knocks stand in).

## S2 — built (2026-11-16): shooting from a car (F7)

- **The server's rules** (`features/arms.ts`, `room.carShot.seatOf`):
  - Sat in a car, a shot needs no aim flag (a seat sends none) but must go out of the shooter's own side: its way
    within ~80° of straight out of their window (`out ≥ 0.17`). Ahead through the windscreen, or across the car,
    isn't fired.
  - The driver: the revolver alone, slower than 30 km/h (`CAR_DRIVER_SHOT_V` 8.4 m/s).
  - A round never strikes the shooter's own car (`carShot.along`'s `skip`).
  - Reloading in a car: the revolver's speedloader anywhere; a long gun's not in the front seats.
  - The muzzle check is as on foot: within 1 m of where the server has them (their seat), at a height a hand
    could be.
- **The guns see the seat** (`dark/index.ts`): `Arms` is given the walker through a proxy that, sat in a car,
  answers from `cars.gunSeat()`:
  - `stepping`: a gun may be drawn there (a passenger; the driver slower than 30 km/h);
  - `aiming`: the right button held there with a gun the seat allows;
  - `where`: the window's muzzle point, less Arms' own on-foot offsets.

  Everything else of the guns (the rounds, the rate, the dry click, the sounds, the flash and tracers, the kick)
  is as on foot. In a car G is the car's (the siren), not a flare.
- **Aiming out of the window** (`car/cars.ts`):
  - The right button with a gun out takes the mouse into the aim, as far round as an arm reaches out of the
    window (±77°, −34°…+29°).
  - The camera sits at the window, past the head, eyes' height, looking out along the aim (fov 56; the guns'
    crosshair).
  - The window winds down (`glb.ts windowDown`); a shattered side stays gone.
- **The body:** the gun in the hand by the window (the left on the car's left, the driver's; the right on its
  right). Its life model is the view's (`view.seatedGun`, `person3d seatedGun`), held by the hand's own frame as a
  walker holds it. While aiming, the arm goes out of the window along the aim (a little under the line of sight)
  and the head turns out of it. Others see the same arm out, along their shot, for two seconds after each shot
  (`arms:shot`, listened to by the cars too).
- **Checked:**
  - `world-server car-shot.test.ts` 3/3, the new one: from the driver's seat the revolver out of their own window
    is fired (6 → 5); straight ahead isn't; the driver's shotgun isn't.
  - In the game (`e2e/car-gunseat.mts`): Ana at the wheel, the revolver drawn with 2 in the car, the right button —
    aiming, the view out of her window with the crosshair —, a click: fired (6 → 5); seen from outside, her left
    arm out of the driver's window (`gunseat-outside` still).
  - The left hand's gun: four ways of its frame tried, from the aim's own view (`gunseat-mirror-*`); the hand's
    frame as it is points the revolver along the aim, its sight up.
  - Arms and cars server tests 22/22; client car and guns tests 8/8; typecheck clean; `arms.spec` 1 + 1 skipped
    (by design).
  - `car.spec` red 2/3 when run straight after `arms.spec` in one go, 3/3 alone: the shared dev world carried
    between them (the known two-runs trap).
- Not done:
  - The Daybreak isn't fired from a seat (its charge needs the walker's aim).
  - A long gun out of a window is held as on foot, by its own long-gun hold; not checked by eye.
  - Others see the arm out only after a shot, not while someone's just aiming (no aim on the wire from a seat).
  - The driver's other hand stays on the wheel; their gun hand's grip on the rim is gone while they aim.
  - The `__aimCamOff` switch (the probe's outside view) is left in.

### S2 — the user's feedback (2026-11-16)

"The gun's in the wrong place in first and third person; and don't keep the crosshair on the screen — only when the
person equips the gun do the crosshair and gun mode come; otherwise the car works as before."

- **Gun mode is a gun drawn in the car.**
  - Getting in puts a drawn gun away, so the car's as ever.
  - The 2–5 keys draw one there (as on foot): the crosshair, the camera at the window, the mouse aiming out of it,
    the left button firing.
  - The same key puts it away, and the car's back: the mouse the car's camera again, no crosshair.
  - The right button no longer has anything to do with it.
  - The driver's gun mode is the revolver below 30 km/h; faster, the camera and the crosshair go back to the car's.
- **The gun in the hand** (`person3d seatedGun`):
  - The fingers close round its grip (the walker's own grip shape, `hold`), with the turn it's taken in the hand.
  - The wrist turns it toward the aim (`aimHand`); what a real wrist can't, the gun takes in the fist, turned
    about its grip (`point`).
  - The turn is taken through the hand's whole matrix: a left hand's frame is a mirror, and a quaternion
    couldn't say so.
  - The hand a little under the line of sight, the camera at the eyes.
- **Checked** (`e2e/car-gunseat.mts`):
  - In the car: no gun, no gun mode, no crosshair.
  - 2: the revolver, gun mode, the crosshair; the barrel along the aim (0.0°, by its sights), its front sight and
    muzzle on the screen nearer the crosshair than its rear; a shot (6 → 5).
  - 2 again: put away, no gun mode, no crosshair.
  - From outside: her left arm out of the driver's window, the revolver in her fist pointing out of it.
  - Client car and chars tests 40/40; `car-shot.test.ts` 3/3.

### S2 — the hands, again (2026-11-16): "the hands are holding wrong, the fingers are not right — I want quality"

- **Wrong:** the seated hand put the wrist somewhere and the gun was turned to fit it; then the gun was placed
  beyond what a seated arm reaches (0.8 m out by the window), so the hand fell short of it, empty, the index
  pointing.
- **Now, as a walker holds it** (plan 80's order, `person3d seatedGun().aimAt`):
  1. The gun's place first: out from the shooting shoulder along the aim, a walker's reach (0.52 m), a hair
     up and a little toward the car's front (before the eye, not off at its edge).
  2. The wrist where that puts it: the gun's place less its own under the wrist.
  3. The arm brought there (`gripTo`) and the gun set exactly there.
  4. The fingers closed round its grip (`hold`, the walker's grip shape) and the index on the trigger
     (`INDEX.aim`; along the frame when it's only held, `rest`).
- **The left hand:** the left's frame is the right's with its x flipped (the skeleton's mirror, measured), so a
  left hand's grip is the right's own reflected, and the gun reflected back across its own side: x′ = −x, the
  rotation's y and z flipped, then a half turn about its up. Eight ways of flipping the frame's vectors were tried
  first, from close by, and none closed the hand on the grip.
- **The aim's camera:** over the shooting shoulder, 0.16 up, 0.14 toward the car's front and 0.1 out (clear of the
  door's pillar — nearer the shoulder it saw the pillar, further out it sat on the gun).
- **Checked** (`e2e/car-gunseat.mts`, close looks by a probe's camera, `__camPeek`):
  - The driver's left hand and a front passenger's right hand each closed round the revolver's grip, the thumb
    along the frame, the index at the trigger.
  - The aim views: the gun under the crosshair's side, gripped, the street clear.
  - The barrel 2.1° off the aim; the shot taken (6 → 5).
  - Client tests 140/140; typecheck clean.
- Not done: long guns out of a window aren't looked at yet (their own hold, `longInHand`, reflected the same way
  for the left).

## S3 — built (2026-11-16): people, pets and the horn (F8a)

- **Struck by a car** (`world-server features/cars.ts car:knock`):
  - below ~15 km/h (`STAGGER_V` 4.2 m/s) a stagger: thrown off from where the car came, as a shot throws them
    (`Player.hitAt`, `hitYaw`), on their feet;
  - faster, knocked down (the fall, as before).
- **Hurt only in a fight** (F8a): they or the driver fired, were shot or were hurt in the last 45 s
  (`room.fightAt`, set by `arms:fire` and every `survival.hurt`). Then by how fast: (speed − 3 m/s) × 4, at most
  70 — 25 km/h takes ~16, 50 km/h ~44. Out of a fight, never.
- **The horn heard** (`car/cars.ts hornHeard`): a car's horn is the view's own heard sound at the car (`tp.heard`,
  a shot's): everyone near turns to it, close by they startle. Held, it's heard again every 0.8 s, so a long blast
  keeps them looking. Mine and others' alike (the wire's horn flag); not the honker's own body.
- **Dogs bark back** (`features/pets.ts`): a horn within 14 m of a pet outside (not its own car's) and it barks
  (a cat hisses), turned to it, not again for 4 s.
- **Crept up on** (`shared car/drive.ts soft`): a person or a pet met at under ~4 km/h stops the car at its
  bumper, all its speed into them taken and pushed out firmly. Faster, they're knocked as before, the car giving a
  little.
- Not done: the park's walkers (the Kart Park's folk) don't step aside for a horn (cars don't go there); a person
  isn't pushed along by a car (players move themselves; the car stops for them instead).
- **Checked:**
  - `world-server cars.test.ts`, the new one: knocked at 3 m/s a stagger, unhurt; the driver fires out of her
    window (a fight); at 10 m/s, down and hurt to 72.
  - `shared car.test.ts`, the new one: a person 7 m ahead, crept up on at a touch of throttle — the nose stops
    short of their middle (6.82 m), at a stop; without the change it creeps on (6.91 m).
  - In the game (`e2e/car-horn.mts`): H held 2 s — heard three times (0, 0.8, 1.6 s), at the car, from Ana.
  - Shared car and physics 134/134; client car 8/8; server cars, car-shot and arms 26/26; typecheck clean.
  - `survival.test.ts`'s "an admin gives someone a gun" times out alone, waiting for a player's pockets as they
    join; S3's line there is in `hurt`, which it never reaches. Not checked at the last commit.

## S4 — built (2026-11-16): the boot and the glove box

- **A car's own storage** (`shared car/store.ts`):
  - its boot (12 things) and its glove box (3), kept on the car's object (`props.boot`, `props.glove`): parked or
    driven, saved with it;
  - a thing as the pack has it — a stack to its own most, or a weapon with its rounds;
  - put in onto a stack of the same with room first (`putIn`).
- **The server** (`features/cars.ts car:put`, `car:take`): from a slot of the pack (`n` of a stack, or all) into
  it, and out (one place, or −1 everything, into a dragged-to slot if given; what doesn't fit stays put).
  - The boot: stood behind a parked car (the middle of its back and a step, 1.7 m), not in a car.
  - The glove box: sat in that car's front.
  - Saved a moment after (`saveLater`, as a shot car is).
- **The client:**
  - Behind a parked car on foot, the prompt "Open the boot"; X lifts its lid (to ~66°) and opens the pack.
  - Sat in a front seat, the pack (I) shows the glove box.
  - The pack shows what's in it in the ground's place, under its name ("In the boot", "In the glove box").
  - Taken with a click or a drag into a slot, Take all (T); what's dropped off the pack goes in it
    (`dark/index.ts` routes the pack's drop, pick and take-all to `car:put` and `car:take` while one's open).
  - The lid comes down as the pack's shut, or as I walk away (`cars.ts store`, `bootNear`, `lidsFrame`).
- **Checked:**
  - `world-server cars.test.ts`, the new one: from too far nothing goes in; behind it a stack goes in and all of it
    comes back; at the wheel the revolver into the glove box and back; what's left in the boot still in it after
    the car's driven and parked again.
  - In the game (`e2e/car-boot.mts`, `car-glove.mts`): the prompt behind the town car; X — its lid at 1.15 rad,
    the pack open on "In the boot · Nothing in it."; her pockets' eight things put in and shown there, all taken
    back; shut, the lid down. At the wheel, I: "In the glove box".
  - `inventory.spec` 1/1 (the pack spec skipped by its own flag); client 6/6, shared 32/32, server cars 11/11;
    typecheck clean.
  - The dev world server's file watcher had gone stale (its last restart was the pets' change); restarted
    (`docker restart yutopia-world`).
- Not done:
  - Others don't see the lid up (it's my own view's).
  - The bonnet opens with the repair (S7).
  - A driven car's boot isn't opened (stop and get out first).

## S5 — built (2026-11-16): the cabin's voices, windows and belts (F9a)

- **Each seat's window** (N; a 🪟 button on a phone, for the driver and passengers):
  - its own switch: `car:window` sets the seat's bit of `Vehicle.win` on the server (a seated person's only);
  - drawn down on that seat's door for everyone (`glb.ts windowDown`; `setParts` keeps a wound-down window down);
  - the motor's whir in the door, then the glass home (`sound.ts window`, made).
- **The car is a room for voices** (`controller.ts`, `media.ts`):
  - each voice now goes through a low-pass (`VoiceChain.muff`, `setVoice(…, muffle)`), from open air (20 kHz)
    to a shut car's glass (700 Hz);
  - `cars.cabinOf(sid)`: the car someone's in and how shut in they are — 1 behind glass all round, 0.55 with
    another window down, 0.15 their own down, 0.5 with a side's glass shot out (0.25 both), 0 with no door
    (the pickup's bed, the tractor);
  - two people in the same car hear each other at full volume at any speed; between in and out, the voice is
    muffled and down by both cabins' seals (`1 − (1 − a)(1 − b)`): a window down lets you hear out and be heard.
- **The world through the glass:** in the cockpit's view, the ambience (wind in the trees, rain, birds) goes
  through `mixer.cabin` (a low-pass to 900 Hz and half the level when shut), and other cars through my glass
  (`Hearing.through`). Gunshots and footsteps aren't muffled.
- **The wind and the arm out:**
  - my window down opens my own car's outside (its low-pass from 1.1 kHz to 6.5 kHz) and the wind's buffet,
    louder (`Hearing.open`);
  - at a cruise (past 25 km/h, kept down to 18, the wheel near straight, no horn, no gun) whoever has their
    window down puts their window-side arm on the sill: the forearm along the door's top, the hand over its
    outer edge. The driver's window-side hand leaves the wheel for it and comes back as a turn starts
    (`cars.ts armOut`; the sill is measured off the door's glass, `glb.ts sillOf`).
- **The belts** (F9a: always on):
  - a big crash (`crashOf`: the speed lost in about 0.1 s, past ~6 m/s) throws everyone in that car in their
    belt: forward by its front's, back into the seat when hit from behind (`CarFit.jolt`, `acts.ts car3`);
    nobody leaves their seat. Others see it too;
  - in that car myself: the camera knocked, the picture blurred (2–7 px, eased out over 1–2 s; not with
    reduced motion), the ears ring (a 3.4–4.3 kHz tone with a waver) and the world goes dull a few seconds
    (`mixer.stun`).
- **Checked:**
  - `world-server cars.test.ts`, the new one: all windows up as you get in, the driver's down by its switch, up
    again; server cars + car shots 12/12.
  - In the game (`e2e/car-cabin.mts`): N — the wire's bit set, the door's glass gone, my seal 0.15; at 30 km/h
    the arm out (the wrist over the door's outer face); stills from the side and the cockpit. A crash: caught in
    the drive itself (the parked taxi, k 0.47) and a forced one (k 1, the head 7 cm forward, the canvas
    blurred 7 px, then clear); N again — up, the glass back, seal 1.
  - Client car tests 8/8; typecheck and lint clean.
- Not done:
  - The voices between cars aren't heard with two people. That needs two live mics, and I had one browser. The
    gains are pure arithmetic on `cabinOf`, which was checked.
  - In the chase view the world isn't muffled: the ears follow the camera, as the engine already did.
  - Passengers hear their own car as from outside (unchanged from plan 92).

## S6 — built (2026-11-16): the snow remembers

- **Tyre tracks** (`car/fx.ts Tracks`; plan 92 had laid them flat, fading in four minutes):
  - each wheel's step is now tipped to the land's slope it climbed;
  - the tread is pressed in: a chevron texture across it, its two walls a shade darker;
  - they fill back in as the snow falls: over an hour when it isn't snowing, in about five minutes in a heavy
    fall (`wxNow.snowing`), and at once when the snow's gone;
  - every client lays them for every car it draws, so others see them.
- **Ruts** (`shared car/ruts.ts`, pure):
  - a wheel through deep snow (or mud: the grounds whose trace is "ruts") presses a rut; a second pass along
    it, either way, makes it a full rut, never a second one beside it;
  - they fill as the tracks do;
  - each rut is laid a step behind the wheel that pressed it, so a wheel never finds its own rut under itself.
    The back wheels follow the front ones' ruts, and the next car follows them all;
  - the sim reads them through `CarWorld.rut` (`groundsWorld({ ruts })`, the client's `cars.ruts`). A wheel in a
    rut has packed snow under it: +15% grip at a full rut and 60% less to plough;
  - a front wheel in a rut tugs the steering toward its middle (up to 0.08 rad), damped by how fast it's
    crossing. A body force was tried first; the stability assist cancelled the yaw, so the car drifted out at
    its first angle.
- **The roof's slab** (`car/fx.ts Slabs`):
  - when there's snow on the roof (`snowK` past 0.25), a slab slides off:
    - pulled away hard (past 2.6 m/s², under 32 km/h): off the back;
    - a hard stop (past 4.5 m/s²): forward over the windscreen;
    - held at speed: blown back off it;
  - it slides along the roof, goes over the edge tipping, falls, and bursts into powder on the ground;
  - the slab is a soft, lumpy box the size of the roof, its thickness by how much snow lies; about two thirds of
    the snow goes with it;
  - every car drawn does this, so others see it.
- **Chains** (an item, `chains`, four to a pocket):
  - found in the shed (2–4), the barn and the tractor; an admin's `mod:refill { chains }` gives a set;
  - by a parked car's wheel (its spot just out from the side, `shared car/store.ts chainSpot`), the prompt is
    "Fit a snow chain" (one in the pack) or "Take the snow chain off". E kneels you there, facing the wheel, a hand on it;
  - the server holds the job (`car:chain`, `busy = chain:…`): 6 s to fit, 4 s to take off, then the chain comes
    out of the pack and onto the car's `props.chains` (FL FR RL RR bits), or back;
  - walk off or press again, and nothing's done (`car:chain-stop`). Everyone sees you kneel (`tp.kneeling`);
  - driven, the car keeps them (`Vehicle.chains`), and they're kept when it parks;
  - they're drawn on the wheel (`glb.ts setChains`): a side chain round each tyre wall, ten cross chains over
    the tread, turning with it. The geometry is shared per tyre size;
  - in the drive (`Drive.chains`): ×1.5 grip on snow and ice, ×0.92 on the hard ground, and the throttle let off
    past 45 km/h;
  - heard: the links slap the road ten times a turn of the wheel, loud on asphalt and a muffled jingle on snow
    (`sound.ts rattle`);
  - not on the snowcat's tracks, skis or the toboggan.
- **Checked:**
  - Shared, 54/54 with the new ones:
    - chains: braking from 40 km/h, snow 11.9 m vs 15.3 bare, ice 24.7 vs 35.8;
    - floored on asphalt with chains: under 48 km/h;
    - a rut 25 cm over is taken and followed: the offroad settles 25 cm across and stays within ±3 cm, where bare it
      goes straight on;
    - the ruts store (found beside, deepened, filled).
  - Server, 13/13 (the new one): a chain fitted kneeling, out of the pack after 6 s, not before; walked off,
    nothing; driven, on the wire.
  - In the game (`e2e/car-snow.mts`):
    - the prompt at the back wheels; knelt facing the wheel, a hand on it ("Fitting the chain · 4 s"); fitted, the
      pack one fewer, "Chain on"; taken off again;
    - the chains drawn on the wheels;
    - pulled away: the slab off the roof (snow 0.84 → 0.29);
    - floored with a chain on: at most 43 km/h.
  - Item art for the chain rendered in Blender (`tools/art/items` → `public/life/items/chains.webp`), with an SVG
    fallback.
- Not done:
  - Ruts and tracks aren't shared over the network: each client lays its own from the cars it sees, so someone
    who arrives later doesn't see the old ones.
  - No ruts were seen in the game's own drive: Main Street is asphalt. The pull and grip are checked by the sim
    tests.

## S7 — built (2026-11-16): repair and the tow rope

- **There's no money in the world** (cars are free at MOTORS). So "pay" is the garage, free but no faster: a car at
  a pump (the gas station's bay) can have everything mended. Anywhere else it takes a wrench from the pack, and
  new glass waits for the garage.
- **The rules** (`shared car/repair.ts`, pure, `repair.test.ts`):
  - under the bonnet, in order, a part at a time:
    - the engine, 10 s: dead or steaming, it runs again (the radiator patched, the front's dent left to the
      panels);
    - the lamps, 4 s;
    - the panels, 6 s each: the worst side's dents knocked out, its bullet holes filled, a hanging bumper and
      the mirrors put back;
    - the glass, 8 s, at the garage only;
  - by a wheel, a flat changed for the spare, 20 s, knelt. Each car has one spare in its boot (`props.spare` 0
    once used); the garage fits a new tyre and the spare's back.
- **The server** (`car:mend`):
  - you stand at the nose (the bonnet) or the wheel's spot of a parked car;
  - only the next thing in order is done there, and only if it may be (refused with `car:no`: `wrench`,
    `garage`, `spare`);
  - `busy = mend:<car>:<what>`; walk off or press again and nothing's done (the same stop as the chains');
  - the damage string and holes are written back to the car's object and saved.
- **Items:** a wrench and a tow rope (one each, kept, not used up). They're found in the shed, the barn and the
  tractor, and an admin's `mod:refill { tools }` gives both. Each has a picture rendered in Blender and an SVG
  fallback.
- **The prompt by a parked car** (`cars.ts workSpot`) is now whichever of its spots you're nearest:
  - the boot;
  - a wheel: the flat ("Change the tyre (the spare)"), or a chain;
  - the bonnet: the next thing ("Mend the engine", "Knock the dents out"…), or what it needs ("· needs a
    wrench", "· at the garage only");
  - a tow eye (off the right of its back and its front).

  While you work, the prompt counts down ("Mending the engine · 8 s"), and when it's done you're told ("The
  engine runs again").
- **Seen by everyone:**
  - bent over the engine with the bonnet up: a new pose (`night.ts bonnet2`: bent at the hips, both hands in the
    bay, one working). The bonnet opens with `setPart("bonnet")` for whoever's at it;
  - knelt at a wheel (the chains' pose).
- **The tow rope:**
  - tie one end to a parked car's back eye, then the other end to another car's front eye; untie from either
    end and the rope goes back into the pack;
  - the server keeps it on both cars (`props.towing` / `props.towedBy`, `Vehicle.towing` / `towedBy` while
    driven); they must be within 9 m;
  - the rope is 4.5 m. Each driver's own car feels it (`Drive.ext`: a force at the eye, and its turn): stretched,
    a spring (14 kN/m) with damping, never a push, at most 26 kN, against where the other car's driver says it is;
  - so the towed car needs someone at its wheel to steer it. A parked other end holds like an anchor, and you're
    told so;
  - drawn for everyone (`fx.ts Ropes`): an orange strap from eye to eye, hanging slack, straight when taut.
- **A bug fixed on the way:** the API's own list of item kinds (`apps/api/app/Models/Survivor.php STACKS`) didn't
  have S6's chains. Saving the pack dropped them, so they vanished on the next load. Chains, the wrench and the
  tow rope are added there now.
- **Checked:**
  - shared repair 2/2 (and car 20/20);
  - server, the new one (35 s): no wrench refused; the lamps refused before the engine; the engine mended
    (no steam); the wrench kept; the spare fitted (`spare` 0); a rope tied and untied, back in the pack;
  - in the game (`e2e/car-mend.mts`):
    - the town car's wear told (the engine dead, a lamp, a flat): at its bonnet "Mend the engine", bent over it,
      then "Mend the lamps", then "Knock the dents out" offered;
    - at the back wheel, knelt, the spare on;
    - a second car driven up behind a third and left; "Tie a tow rope to its back", then "Tie the rope's other
      end here", tied on both, "Untie the tow rope" offered.
- Not done:
  - Towing two cars together with two drivers isn't checked in the game: it needs two browsers on the dev world.
    The rope's force is code-read only.
  - No jack or wheel animation for the tyre change: the kneel stands in for it.

## S8 — built (2026-11-16): the rest of the driver's body

Phase 3 had already done most of S8:
- hand over hand on the wheel;
- the head turning into turns and to a mirror with the indicator;
- the hand on the horn and on the lever;
- everyone leaning with the g.

The rest (`cars.ts bodyLife`, `acts.ts car3` `twist`):
- **Backing up:** the driver turns round in the seat, the head ~83° over the shoulder toward the car's middle,
  the trunk turned with it (`CarFit.twist`). The arm on that side goes over the passenger seat's back, the other
  hand stays on the wheel. Eased in over 0.5 s.
- **At a stop:** after two seconds still (not backing, not on the horn), the hand by the middle comes off the wheel
  onto the thigh. Back on the wheel in 0.2 s as it moves.
- **A passenger in a hard turn** (pushed toward their door past 3.5 m/s²): the hand by the door goes up to the grab
  handle over it (above the glass's top, measured off the door: `sillOf`).
- **Checked:** typecheck and lint. The stills (`e2e/car-body.mts`: at a stop, backing, a passenger with the g faked)
  wait for the dev world: another session had it.

## S9 — built (2026-11-16): lock, keys, alarm

- **Locking:** your own car (or one lent to you today: plan 92's `mayDrive`) is locked or unlocked from outside
  with **L**, within 8 m (`car:lock`, `props.locked`).
  - Only cars with an owner lock. The town's and the lot's are anyone's.
  - Its prompt says so: "Drive · L lock", "Drive · L unlock"; on someone else's car, "· locked".
- **Everyone near sees and hears it:** two flashes of the indicators and two chirps to lock, one of each to
  unlock (`cars.ts locksFrame`).
- **Locked:**
  - its doors and its boot open to its keys only. Its owner (or borrower) getting in unlocks it;
  - a stranger trying a door or the boot is refused ("It's locked") and sets its alarm off;
  - so does a shot into it, or a hard knock from another car (shoved more than 25 cm).
- **The alarm:** 20 s (`props.alarmAt`): its lamps flash and a whoop sounds for everyone within 80 m. It doesn't
  start again within 10 s.
- **The owner is told** if they're in the world (`car:alarm`): a phone ping and "📱 Your car <plate>: its alarm —
  someone tried a door / the boot / it's been shot / it's been hit". The phone's own notifications come from the
  API (texts), so this one is a toast.
- **Checked:** the server, the new test: a stranger can't lock it; its owner locks it from 4 m; the stranger's
  door refused, the alarm on, the owner told "door"; its owner gets in, unlocked. Server car, shot and spot tests
  20/20. Stills and the flash's look wait for the dev world.
- Not done: the alarm by a stranger getting into a driven car's empty seat (a driven car's unlocked); no key-fob
  animation (the L press is the fob).

## S10 — built (2026-11-16): the drive-in

- **The lamps down:** stopped four seconds at night with the radio on, the driver's car dims its headlamps (on the
  wire and its real light). The dash stays lit, the engine and radio on. Moving, they come back as they were set.
  It works anywhere: facing the Kart Park's screen, the lake.
- **Tune to theirs:** R, with another car within 25 m playing a different station, first tunes to that one ("Tuned
  to the car beside you"). Pressed again, it cycles the stations as before.
- **Flash your lights (U):** the high beams twice (0.22 s each), seen by everyone on the wire.
- **The toot (Y):** the horn's two quick taps, heard by everyone; dogs bark at it as at a horn.
- On a phone: two more buttons in the driver's row (✨ flash, 🎺 toot).
- **Checked:** typecheck and lint. In the game it waits for the dev world (another session had it).
- Not done: two cars' radios in sync to the second (each plays its station's stream from where it joined).

## Checks — 2026-11-16

- **Seen in the game** (stills; the dev world shared with the weapons session, which had it a while):
  - S7: bent over the engine with the bonnet up. It hadn't opened at first: a parked car is a still model, its
    matrices made once (`culling.stillModel`). `glb.ts setPart` now makes the hinge's matrices again, which fixes
    the S4 boot lid too (only its angle had been measured). The tow rope hangs slack between two cars on Main
    Street.
  - S8 (`e2e/car-body.mts`):
    - at a stop the hand onto the thigh (rest 1 after 5 s);
    - backing up, round in the seat with the arm over the passenger's seat back;
    - a passenger in a hard turn, the hand up at the handle. It went through the roof at first; it now goes
      inside, under the roof's edge.
  - S9, S10 (`e2e/car-lock.mts`):
    - L locks a bought car;
    - a shot into it sets its alarm off, and its owner's told "📱 Your car ANA: its alarm — it's been shot";
    - in it, unlocked;
    - at night with the radio on, stood still, the lamps down (beams set to high, none on the wire);
    - U flashes them.
- **Specs:**
  - `car.spec` 3/3, `pets-car.spec` 1/1;
  - `car-look.spec` red at first, then 1/1. Ana still carried a tow rope from the probes, and the MOTORS show
    car's tow eye took the dealer's prompt. Show and retired cars now offer none of the boot, wheel, bonnet or
    tow prompts;
  - `arms.spec`, `inventory*.spec`: 6 passed, 2 skipped by their own flags.
- **Plan 92's checks:**
  - `car-fixes.mts`: the driver's door, the wheels turned right, −4° of roll in a turn.
  - `car-jerk.mts` on Low (dev client), five drives: p50 8–10 ms, p90 10–13 ms; car against camera rms 0.8–6 cm.
    The only big jumps are on stall frames past 100 ms (27–120 cm, the camera's easing against the car on one long
    frame), as before.
  - The car's fixed step now catches up to 8 steps (133 ms) a frame, where 4 dropped the rest of a stall.
- **Audio:** a `setTargetAtTime … non-finite` was thrown once a frame in one run, while I sat as a passenger. It
  came back in no later run, and its source wasn't found (the weapons session was changing the gun sounds too).
  This plan's own audio params (the voices' muffle, the cabin, the daze, the rattle) skip a value that isn't a
  number.

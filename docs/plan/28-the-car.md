# The car — the lot's cars you can drive (plan — decided 2026-10-20; phases 0–7 delivered 2026-10-20)

> Follows `27-the-grounds.md` (the land to drive on, the shuttle and the
> visitor's car). Workflow rule: mocks first (phase 0), approved before any code.
> And one more gate this time: **the feel is signed off in a sandbox (phase 1)
> before the car goes into the world.**

Ask (2026-10-20): "Let's create a drivable car. It should be really awesome and
nice to drive — think the mechanics through, each part of the car. The interior
should be really awesome. For each terrain the car should behave differently."

## Where we are

- **Parked cars**: the 16 in the lot are world objects of kind `car` (5 × 2,
  solid, nine colours; `campusLot()` in shared `building.ts`), drawn by the item
  kit (`art/items/building.ts` `car()`); Main Street's are shared data
  (`TOWN_CARS`), drawn from `carGeometry()` (`tp/campus.ts`, an 80s sedan or
  wagon extruded from its side profile, its wheels merged into the body).
- **Moving vehicles**: the visitor's car and the shuttle, driven by the server
  along fixed routes (`features/grounds-life.ts`, schema `Vehicle`: x, z,
  heading, speed). The shuttle seats riders (`busy = "ride:shuttle"`, the sit
  pose), and the server ignores their `pos`. The clients ease them; the 3D
  camera keeps out of them. People walk through them (a known gap).
- **The land**: a heightfield (`heightAt`, `slopeAt`) and a surface for every
  spot (`groundSurfaceAt`: snow, deep, path, asphalt, walk, ice, rock, floor),
  shared by the server and both views. Wet patches and slush are paint only.
- **No physics engine**: movement is tile-grid kinematics. The server's move
  check caps a step at running speed (`isLegalMove`), so a car needs its own.
- **Sound**: WebAudio, mostly synthesized; a horn, a crunch, the lo-fi radio.
  No engine.
- **Budget**: the world page is at 552.5 of 553 KB.

## The idea

**Get into any free car in the lot and drive it anywhere on the Grounds.** An
80s rear-wheel-drive sedan with real mechanics under it. It is tail-happy on
packed snow, slides on the pond's ice, ploughs through the lawn, and bogs down in
the woods' deep snow until you rock it out. Its headlights are the brightest
thing in the dark woods. Inside, the cabin is in Yutopia's own hi-fi language:
walnut, cream cloth, an amber VFD dash glowing at night, the wipers fighting a
blizzard, the lo-fi radio on the cassette deck. Up to four people ride
together; when you get out, the car stays where you left it, for everyone.
Later a second car, an 80s 4x4, gets through what the sedan can't.

## The mechanics — each part of the car

A physical model, tuned for fun ("sim-lite"): every part below is simulated,
then light driving helps (on by default, off in settings) let a keyboard
driver hold a slide without spinning out.

### M0 — Where it lives: our own sim, in shared

- **No engine library.** Rapier/Cannon would be ~1–2 MB of WASM for one car on
  a heightfield we already sample analytically, and the server couldn't easily
  run the same thing. Our own rigid body + raycast wheels is ~2k lines and
  **deterministic**. The same code runs on the client to drive, on the server
  to check, and in the tests.
- `packages/shared/src/car/` (its own subpath export, so neither the page nor
  the Grounds chunk grows): `body.ts`, `suspension.ts`, `tyre.ts`,
  `drivetrain.ts`, `surfaces.ts`, `assists.ts`, `collide.ts`, `specs.ts`
  (each car's numbers as data).
- **Fixed step**: 120 Hz substeps (two per 60 fps frame), semi-implicit
  Euler, the render interpolated between steps. Sleeps when at rest.

### M1 — The body

- A 6-DOF rigid body: mass 1,280 kg, inertia from the box, centre of gravity
  0.52 m up, 52/48 front/rear.
- Gravity does the hills: the car rolls back on a slope, runs away downhill,
  and won't climb `rock` slopes.
- Aero drag (Cd·A 0.78) and lift ≈ 0. Top speed comes out of the numbers
  (~170 km/h), not a cap.

### M2 — The suspension (four corners)

- Each wheel casts down onto the heightfield (and onto bridges' decks,
  `deckAt`).
  - The contact patch is sampled at the tyre's own spot, so a wheel can hang off
    a kerb or a drift.
  - A spring (stiffer in front), a damper with separate bump and rebound, and
    travel limits: bump stops that thump, and full droop that lifts a wheel.
- **Anti-roll bars** front and rear: their balance is a tuning knob for the
  car's attitude (more rear bar = more tail-happy).
- What you see and feel from it:
  - squat under throttle, dive under braking, roll in corners;
  - the body bobbing over the lawn's rolls;
  - a wheel in the air over a crest.

### M3 — The tyres (where the feel comes from)

- Per wheel, every substep:
  - **slip ratio** (wheelspin and lock-up) from the wheel's own spin;
  - **slip angle** from the contact patch's velocity.
- Force from a simplified **Pacejka curve per surface**: peak grip, the slip at
  the peak, and how fast it falls off past it.
  - Asphalt peaks sharp: grip, then a squeal and a let-go.
  - Packed snow has a low, broad peak, so long slides you can hold.
  - Ice is low everywhere.
- **Combined slip** on a friction ellipse: brake or spin a wheel and it can't
  also turn. This gives handbrake turns, power oversteer, and trail-braking
  rotating the car.
- **Load sensitivity**: grip grows less than load (∝ load^0.9), so weight
  transfer matters.
- **Relaxation length** (forces build over ~0.3 m of rolling) and a low-speed
  slip formula: no jitter at walking pace, and a parked car stays parked.
- Rolling resistance and sinkage per surface (M7).

### M4 — The drivetrain

- **Engine**: a 2.3 L straight-four.
  - Its torque curve: 185 Nm at 2,750 rpm, 115 hp at 5,400, a soft rev limiter at
    6,200, idle 850 rpm, more when cold.
  - Engine inertia: revs rise and fall with weight.
  - Engine braking off throttle, and a pop from the exhaust on a high-rpm lift.
- **Cold start**: at night or in a storm the starter cranks longer.
  - The temperature bar climbs over the first minutes and the cold idle settles.
  - The heater only blows warm once it has.
- **Clutch**: a friction clutch, slipping from a standstill and on shifts.
- **Gearbox**: 5-speed + reverse (3.71 · 2.16 · 1.37 · 1.00 · 0.83, R 3.68),
  shifts take ~0.25 s with the torque cut.
  - **Auto** (default): the game shifts that same box by rpm and load, and the
    lever and clutch pedal move in the cabin.
  - **Manual**: Q/E or the bumpers; no stalling (sim-lite).
- **Final drive** 3.73 into an **open differential** at the rear. One wheel
  spins on ice while the other sits: that's what traction control is for, and
  part of why the 4x4 exists.
  - The 4x4 (phase 6): a centre diff with a lock and a low range.
- Wheels: 195/65 R15 winter tyres (radius 0.31 m), each with its own spin
  inertia.

### M5 — The brakes and the steering

- **Brakes**: discs in front, drums at the rear, bias 65/35.
  - The **handbrake** locks only the rears: the handbrake turn, the hairpin at the
    gatehouse, parking on a slope.
- **Steering**: a rack with Ackermann geometry, 34° at full lock, 1.5 turns lock
  to lock on the wheel in the cabin.
  - Self-aligning torque brings the wheel back.
  - Speed-sensitive for keys (M6).

### M6 — The helps (sim-lite)

All on by default, each off in the car's settings panel (Assistências), and the
sim underneath is the same.

- **Keyboard smoothing**:
  - the throttle ramps 0→1 in 0.18 s;
  - the steering rate and limit fall with speed, keeping the front tyres near
    their peak slip angle instead of past it;
  - a **countersteer helper**: when the rear lets go, the steering leans into
    the slide in proportion to its angle. This is what makes drifting on a
    keyboard possible.
- **ABS** (pulses a locking wheel), **traction control** (cuts torque on
  wheelspin), **stability** (a gentle yaw damper, off by default in "sport").
- A gamepad gets the raw analog inputs (with dead zones) and lighter helps.

### M7 — The terrain: each surface drives differently

From `groundSurfaceAt`, read under **each wheel separately**: one wheel on ice
and three on asphalt pulls the car.

| Surface | Where | Peak grip | Feel | Rolling resistance / sinkage | Sound · trace |
|---|---|---|---|---|---|
| **asphalt** | roads, the lot | 0.85, sharp falloff | precise, squeals then lets go | low | squeal, hum · none |
| **slush** *(new, on asphalt)* | patches on the roads | 0.55 | wanders, spray | medium | splash, hiss · spray |
| **black ice** *(new, on asphalt)* | the bridges, shaded bends, at night | 0.12 | it just goes | very low | silence, the dash warns · none |
| **walk** | pavements, the plaza | 0.70 | firm | low | rumble · none |
| **path** | packed-snow trails | 0.40, broad | long, holdable slides; the drifting surface | low–medium | creak, crunch · light tracks |
| **snow** | the lawn, open land | 0.32 | vague steering, the nose pushes | high, grows with speed; 8 cm sinkage | crunch, rooster tail · deep tracks |
| **deep** | the woods | 0.25 | heavy, wallowing | very high; 25 cm sinkage > the sedan's 16 cm clearance → it beaches; **wheelspin digs**, rock it out | muffled crunch, belly scrape · ruts |
| **ice** | the pond, the river | 0.10, tiny peak | skating; braking does almost nothing | very low | hiss, the ice creaks · faint scratches |
| **rock** | slopes past 0.85 | 0.60 | bumpy, and too steep: gravity wins | — | rattle · none |
| **floor** | inside buildings | — | not drivable: footprints are solid | — | — |

- **Slush and black ice become data**: a shared deterministic function over
  the roads' arc length. The asphalt painter in both views reads it, so you
  *see* the patch you're about to hit.
- **Weather changes the roads**:
  - while a storm blows (`stormAt`), the roads' grip slides toward packed snow's
    by its strength and duration;
  - it comes back over ~10 minutes after;
  - the night makes black ice likelier.
- **Ruts are real**: tracks in snow and deep snow are stored (as footprints
  are), and driving in an old rut has less resistance.
- **The world's rules**: the fence, the ridges and the river's banks hold the
  car in as they hold people.
  - Trees (their trunks), lamp posts, fences, rocks, buildings, parked cars and
    the shuttle are solid.
  - The gatehouse's way through is the road's.

### M8 — Hitting things

- The car is an oriented box (rounded corners) against circles (trunks, posts,
  people), boxes (buildings, parked cars, the shuttle) and segments (fences).
  - Impulse response with restitution and friction, and angular response: a
    clipped post spins you.
  - Snowbanks off the road are soft: they absorb.
- **People are never hurt.** A car can't run anyone over: the person stumbles a
  step aside (shown), and the car bumps and stops as against a soft bollard.
  People also can't walk through cars, moving or parked (this closes plan 27's
  gap).
- An impact gives a camera shake, a sound by impulse and material (a thud into
  snow, a clang off a lamp post), and a rumble on the gamepad.
- **No damage** for now (see "Still open").

## The car you see — the outside

- A new, **parted** model (`tp/car/`, lazy):
  - the shell from `carGeometry`'s profile, refined;
  - **doors, hood and boot that open** on hinges;
  - **four wheels**: tyre + steel rim + hubcap, each spinning, steering, and
    riding its suspension;
  - brake discs behind the spokes;
  - chrome bumpers, square sealed-beam headlamps, amber indicators, a red tail
    strip, a plate (made-up text), the exhaust pipe.
- Paint: the nine lot colours, clearcoat on High.
- Glass reflects the sky: an env map from `sky.ts`, renewed by the hour.
- **Snow on it**:
  - a car parked a while has snow on the roof and hood (as today, but grown by
    time and storms);
  - driving fast sheds it in chunks off the roof;
  - slush splashes build up on the sills and wheel arches.
- **Lights**:
  - low and high beams as real spot lights (as the flashlight), with a cone in
    fog and snow and a pool on the ground;
  - brake lights and reverse lights with bloom;
  - indicators and hazards blinking.
  - Headlights count against the tier's light budget. Far cars get the pool and
    the cone only, not the light.
- **Exhaust**: a condensation plume in the cold (the breath puffs' code), thick
  at idle, torn by speed.
- **Tracks and spray**:
  - tyre tracks on snow, path and deep snow, an instanced ribbon that fills in
    over minutes (the footprints' system, seen for others' cars too: drawn from
    their wheels' paths, nothing extra sent);
  - snow spray from slipping wheels;
  - a slush spray off the road.
- **Iso**: cars are drawn and move (a heading-turned sketch). Getting in
  switches you to 3D, and back to iso when you get out (decided).

## The interior — "really awesome"

An 1986 executive sedan done in our palette: walnut, cream, amber VFD, rust,
olive (`docs/art-style.md`).

- **The VFD dash**, amber on smoked glass, lit at night:
  - big speed digits (km/h);
  - a sweeping bar-graph rev counter that flickers at the limiter;
  - the gear (P R N D or 1–5);
  - fuel and temperature bars;
  - odometer and trip;
  - the clock (world time);
  - the outside temperature, with a ❄ warning flashing below −3 °C on black-ice
    nights;
  - tell-tales for the handbrake, the beams, the indicators and the helps
    acting.
- **The centre stack**:
  - a cassette radio with a VFD frequency display tuned to the lo-fi radio's
    stations (deterministic, so the passengers hear the same thing and people
    outside hear it faintly);
  - heater sliders and the fan's hum;
  - a hazard button.
- **Everything moves**:
  - the wheel turns ±540° with the steering;
  - the pedals go down with the inputs;
  - the 5-speed lever moves through its H to the gear (in auto too), and the
    clutch dips;
  - the handbrake lever rises;
  - the indicator stalk clicks and cancels itself after the turn;
  - the wiper stalk.
- **The windscreen**:
  - snow settles on the glass by the storm and your speed;
  - **the wipers** (3 speeds, auto in a storm) sweep their arcs clear;
  - at a cold start the glass is fogged and the defroster clears it up from the
    vents over ~40 s;
  - frost on a car parked all night.
- **The light inside**:
  - the dash's amber glow on the hands;
  - **the street lamps sweeping over the cabin** as you pass under them at night;
  - the headlights' bounce off the snow;
  - the dome light when a door opens.
- **Mirrors**: the rear-view mirror really renders behind you (High: 30 fps;
  Medium: 15 fps; Low: the sky). The side mirrors render on High only.
- **The people in it**:
  - the driver sits in a driving pose (a seated variant in `chars/motion.ts`),
    with hands on the rim by IK, hand over hand past ~120°;
  - on a shift the right hand goes to the lever;
  - the head looks into the corners;
  - passengers sit and sway with the car's g.
- **A pine-tree air freshener** hangs from the mirror and swings with the
  car's cornering (a pendulum).
- **Inside you feel the weight**: the first-person camera rides the body with
  a sprung head, so it leans in corners, nods under braking and lifts under
  throttle (subtle, and off with "reduce motion").
- Door cards with a window crank: **windows down** opens the cabin's sound to
  the outside.

## Cameras

- **Chase** (default), sprung behind the car:
  - it looks ahead with velocity;
  - its yaw lags, so you **see the drift angle**;
  - the FOV widens with speed (62° → 72°);
  - it shakes a little on rough ground;
  - it keeps out of walls with `camView`'s code.
- **Cockpit**: first person, mouse or right-stick free look, and it looks into
  corners on its own.
- **Hood**: from the bonnet.
- **C** cycles them, **B** looks back. Passengers get their own seat's first
  person plus the chase camera.

## Controls

| | Keyboard | Gamepad |
|---|---|---|
| Throttle / brake | W ↑ / S ↓ (S held at a stop: reverse) | RT / LT (analog) |
| Steer | A D ← → | left stick |
| Handbrake | Space | A / ✕ |
| Gear up / down (manual) | E / Q | RB / LB |
| Horn | H | left stick press |
| Lights (off · low · high) | L | d-pad ↑ |
| Indicators · hazards | , . · / | d-pad ← → · ↓ |
| Wipers · radio | V · R | — |
| Camera · look back | C · B | Y · right stick press |
| Get in / out | X (as everywhere) | X / □ |

- On the gamepad: rumble by surface, impacts and the limiter.
- Touch: later (there's no movement stick yet; see "Still open").
- Key hints sit on the HUD in PT through `tr()`.

## Sound

- **The engine**, the heart of "nice to drive":
  - recorded CC0 loops of a four-cylinder, on-load and off-load at four rpm
    points, crossfaded and pitched by rpm and throttle;
  - plus the limiter, the lift-off pop, the starter (longer when cold) and
    reverse's gear whine;
  - auditioned at phase 0 like the mocks. A synthesized fallback first, in the
    sandbox.
- **The tyres and the ground**, per surface:
  - squeal by slip on asphalt;
  - hiss on ice;
  - crunch rolling on snow (the Grounds' crunch);
  - slush splash;
  - a rumble by roughness;
  - suspension thunks at the bump stops;
  - impacts by material.
- **The car itself**: doors, the seatbelt chime, the indicator's tick, the
  wipers' motor and squeak, the heater's fan, the radio.
- **Inside vs. outside**: inside, the outside goes through a low-pass (doors
  shut, windows up), and the cabin and radio come forward.
- Others hear your engine and tyres by distance, panned, with a little Doppler
  as you pass.

## Together

- **Fleet, not owned** (decided): any free lot car is anyone's to drive.
  - **Entering**: X near a door takes that door's seat (driver, front, two
    rear). The server locks the seat, as computers and pool seats do.
  - A passenger can slide over if the driver gets out.
- **Who simulates**: the driver's client runs the sim and sends
  `car:state` at 20 Hz: position, orientation, velocity and spin, steer, rpm,
  gear, slip flags, lights, horn (~64 bytes).
- **The server checks it** (`plausibleCar`, as the slot cars), with the shared
  sim's own limits:
  - speed by surface;
  - acceleration within grip (plus impacts);
  - no passing through a solid;
  - on the Grounds, at the land's height ± suspension.
  
  A failed check snaps the car back (`car:snap`). While driving, your `pos` is
  the seat's (`busy = "drive:<id>"`, as the shuttle's).
- **Everyone else** draws the car 110 ms in the past as people are, with Hermite
  curves from position and velocity, extrapolating ≤ 250 ms on a late
  packet.
  - Wheels, suspension and body roll are re-simulated locally against the land,
    so a remote car rolls and bounces right.
- **Schema**: `Vehicle` grows y, pitch, roll, steer, rpm, gear, flags, the
  driver and a seats map. The server's AI cars stay in it.
- **Parking for real**: when the driver gets out, the car's pose is written to
  its `objects` row (whole tiles + `props` dx, dz, a free heading, y; plus
  fuel and odometer).
  - The walk grid rasterizes a turned car as solid tiles.
  - While it's driven, the object is hidden and the live vehicle takes over.
  - It survives a server restart.
- **Lost connection**: the car rolls to a stop on the server and parks there
  after 3 s.
- **Back to the lot**: a car left outside the lot for 2 hours with no one near is
  towed back to a free bay, when no one is looking. Otherwise the lot empties
  into the woods.
- **The AI cars**: the shuttle and the visitor brake and honk for player cars
  as they do for people, and they're solid to them.

## Tooling

- **`/dev/car`**: a sandbox.
  - A flat pad with surface strips, ramps, a skid-pan of ice, or any spot of the
    real Grounds.
  - Telemetry: per-wheel load, slip ratio and angle, grip used, rpm and gear, a
    g-meter and graphs.
  - Live tuning sliders that save a preset into `specs.ts`.
- **Replays**: record the inputs and replay them bit-for-bit (deterministic).
  A lap of the driveway becomes a regression test: it must end within a few
  centimetres of where it did.

## Phases

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mocks + feel spec**. Stills: the sedan in the lot by day; on the driveway at night in falling snow, headlights on; **the cabin from the driver's seat at night in a blizzard** (the VFD dash, the wipers, snow on the glass); the cabin by day; a car in iso. The engine sound shortlist | approved images in `design/screens/car/`; engine set chosen |
| 1 | **The sim + the sandbox**: body, suspension, tyres, drivetrain, helps, surfaces, collisions in shared; `/dev/car` with telemetry and tuning; a placeholder box car with the synth engine | the unit numbers below; **you drive it in `/dev/car` (keyboard and pad) and sign off the feel** |
| 2 | **Driving in the world (one person)**: the parted model, getting in and out of lot cars (into 3D and back), collisions with the Grounds, chase/hood cameras, lights, basic engine and tyre sound | get into a lot car, drive the driveway to the gate, skate the pond, into the woods until stuck, back, park in a bay; no frame > 50 ms |
| 3 | **Together**: schema, `car:state` + the server check, remote cars, passengers, parking that persists, people and cars solid to each other, the AI yielding, the tow back | two browsers: A drives B to the town square; both see the same; restart the server and the car is still where it was left |
| 4 | **The interior**: cabin, VFD dash, everything moving, the driver's hands, mirrors, windscreen snow and wipers, the radio, the cabin's sound and light, the cockpit camera | shots match the approved mocks; a blizzard night drive in cockpit view at ≥ 60 fps on High |
| 5 | **The terrain, deeper**: slush and black ice as data (and painted from it), storm roads, ruts, spray, per-surface sound, rumble, snow shedding, digging out | the surface table measured in the world (braking and cornering); A's tracks seen by B |
| 6 | **The 4x4**: an 80s off-roader, the same sim with a centre diff, lock and low range, more clearance; a new parted model and cabin; some lot bays get one | the lot to the pond through the woods in the 4x4, where the sedan beaches |
| 7 | **Checks**: e2e, perf, Firefox, shots, budget, PROGRESS | all green; the world page ≤ 553 KB |

Phases 4 and 5 are independent once 3 lands.

### The numbers phase 1 must hit (sedan, helps on, flat ground)

| Test | Target |
|---|---|
| 0–100 km/h, asphalt | 10–12 s |
| Top speed, asphalt | 165–175 km/h |
| 50 → 0 km/h, ABS | asphalt ~14 m · path ~28 m · snow ~34 m · ice ~95 m |
| Steady cornering (lateral g) | asphalt ~0.8 · path ~0.4 · ice ~0.1 |
| Deep snow from a standstill | the sedan can't get going without rocking; the 4x4 (phase 6) can |
| Handbrake on a 15 % slope | holds for 60 s, no creep |
| At rest | speed < 0.001 m/s after 10 s, no jitter |
| Determinism | same inputs → the same bits, client and server |

## Engineering notes

- **Budget**:
  - all of the car is a lazy chunk `yutopia-car` (the sim, the model, the
    sound), prefetched when you're near a car;
  - the page doesn't grow, and the Grounds' chunk doesn't either (177/180 KB);
  - the world-server imports the sim from shared.
- **Perf**:
  - the sim costs microseconds;
  - headlights take lamp-light slots by tier;
  - the mirrors' render targets only on Medium and up;
  - remote cars far off get no lights and no re-simulated suspension.
- **Shaders compile before first use** (the Grounds' `compileAsync` rule).
- **Tests**:
  - **shared**: the sim (the table above, replays);
  - **world-server**: enter, seats and leave; the check accepts real replays and
    rejects teleports and speed hacks; a disconnect parks; parking round-trips
    through the API; the tow;
  - **e2e** `car.spec`: two browsers, A drives with B in the passenger seat, an
    iso viewer sees it go by, the car is parked where left; worst frame and
    High's frame rate on a night drive.
  - Run e2e that swap the dev world only after checking it's safe to (memory:
    the dev DB).

## Risks

- **The feel**: the whole point, and the hardest. Hence the sim first, the
  sandbox, the telemetry, and your sign-off before anything else is built on it.
- **A custom sim's stability** at low speed and on stiff contacts: relaxation
  length, a low-speed slip formula, substeps, sleeping.
- **Fast things over the network**:
  - at 90 km/h a car moves 2.75 m in 110 ms; Hermite curves and extrapolation
    smooth it;
  - two drivers colliding each see the other as fixed, so their two bounces may
    disagree; soft bounces keep that minor;
  - the server's check must not snap honest drivers (tested with replays).
- **The engine's sound** decides whether it feels good: it needs a good CC0 set.
- **Perf at night**: headlights + lamps + mirrors + bloom on High.
- **Turned parked cars on a tile grid** (walk collision in both views).
- **The budget**: everything lazy, measured every phase.

## Decided (2026-10-20)

| Topic | Decision |
|---|---|
| Whose car | **The lot's cars are a fleet**: any free one, parked where left (saved) |
| Feel | **Sim-lite, helps on**: real physics, the helps can be turned off |
| Which car | **An 80s RWD sedan first, an 80s 4x4 later** (phase 6) |
| Iso | **Getting in switches to 3D**; cars still seen moving in iso |

## Proposed (yours to overrule)

| Topic | Proposal |
|---|---|
| Physics | Our own deterministic sim in shared, no engine library (M0) |
| People | Never hurt; the car bumps and stops; people can't walk through cars |
| Damage | None in v1 |
| Gearbox | Auto by default (a real box shifted for you), manual on Q/E |
| Abandoned cars | Towed back to the lot after 2 h with no one near |

## Still open

- **Fuel**: a working gauge, and filling up at the town's gas station (hold X at
  the pump)? It gives the gas station a use; it's also a chore.
- **Cosmetic damage** (dents per panel, a cracked lamp) later?
- **Touch** controls (a wheel and pedals on screen) for the phone layout.
- A **snow plough** on the roads after a storm (an AI truck, like the shuttle)?
- Driving on the pavements and the plaza: allowed (as now planned) or kept off?

## Phase 0 — delivered for review (2026-10-20)

The stills are drawn by code that stays: the model and the cabin are what phase 2 puts in the world.

- `apps/client/src/world/tp/car/sedan.ts`: **the sedan, in parts**.
  - The sprung body: the nose and boot solid, the cabin open.
  - Four doors on hinges, each with its glass, door card, crank, armrest and handle.
  - Four wheels that steer and spin (a lathed winter tyre, a slotted hubcap).
  - The steering wheel on its column (`rim(phi)` gives a point on it for the hands).
  - The wipers and the lamps, each set of lenses lit on its own (`setLights`).
  - Snow lying on it, plus the windscreen's own snow layer (`setScreenSnow`).
  - The cabin: dashboard, walnut fascia, binnacle and VFD cluster, centre stack with the radio-cassette and the heater's sliders, console, gear lever and handbrake, pedals, cloth buckets and the bench, parcel shelf, headliner, visors, dome lamp, rear-view mirror (`rearView`, its own mesh) and its pine tree.
- `tp/car/vfd.ts`: the cluster and the radio's window as real VFDs: seven-segment digits with their ghost segments, the bar-graph rev counter, the gear, fuel and temperature, the clock, the outside temperature with ICE below −3 °C, the tell-tales.
- `tp/car/textures.ts`: walnut, the seats' pleated cloth, carpet, the tread, the hubcap, the lenses, the plate, the heater's panel, the air freshener, and the windscreen's snow with the wipers' cleared fans.
- `tp/car/stage.ts`: a car on the Grounds for a still.
  - Placed and posed: steer, roll and pitch, sinking into deep snow, doors.
  - People in their seats: `carPose`, hands on the rim by IK with the new `PersonModel.reachTo`.
  - The headlamps as real spot lights, their beams in the air after dark.
  - The tail lamps' red on the snow, the cluster's amber on the hands.
  - Tracks: tread ruts, and dark arcs where the tyres wiped the pond's dusting of snow off the ice.
  - The snow thrown up by the wheels, the exhaust's plume.
  - In the cockpit, the rear-view mirror really renders the road behind.
- `tp/grounds-shots.ts`: the car's stills, plus a night blizzard (`storm`); no snow falls inside a car.

Shots in `design/screens/car/`:

| | |
|---|---|
| `01-lot-day` | The lot by day: the sedan in the aisle, the driver's door open, Ana about to get in |
| `02-driveway-night` | Chasing it up the driveway at night: the low beams on the snow and the trees, the tail lamps, the plate |
| `03-cabin-blizzard-night` | **The driver's seat in a night blizzard**: the VFD (48 km/h, 3rd, ICE lit), hands at ten to two, a wiper mid-sweep, snow settled on the glass, the lamp ahead, the pine tree, the mirror |
| `04-cabin-day` | From the passenger's seat by day: walnut and cream, the cluster, the radio-cassette, the heater, the gear lever, the driver at the wheel |
| `05-pond-drift` | Sideways on the pond's ice, countersteering: its arcs on the ice behind, snow off the rear wheel, the boathouse |
| `06-deep-snow-stuck` | Beached in the woods' deep snow: sunk to the hubs, ruts behind, the rear wheels spinning snow up, someone pushing |
| `07-iso-lot` | The iso view: the sedan pulling out of the west aisle |

Seen while making them, for phase 1 on:

- **Our people are big**: a seated person reaches 1.66 m (their heads are big), so the sedan's roof went from 1.415 m up to 1.53 m. That matches the lot's old cars (1.51 m) and gives tall, upright 80s glass. The seats are low, and people in a seat are drawn at 0.92 (`SEATED`), which is not noticeable.
- **Their arms are short** (0.52 m seated): the wheel sits 0.36 m from the driver's hip for the hands to reach ten to two. The cluster sits under the rim's top as the driver sees it.
- **Headlamps light a cabin from outside**: the tail lamps' light is a spot aimed back (a point light lit the headliner red). The cluster's glow is 0.03 cd, and anything brighter lit the whole cabin amber.
- **The snow on the windscreen needs to be double-sided**: seen from inside, the face is the back one.
- **Real wipers sweep most of the glass**: 0.66 m and 0.62 m arms on a 0.82 m tall windscreen.
- **The engine's sound** (the shortlist) was done after phase 7: see "The recorded engine" below.

## Phases 1–7 — delivered (2026-10-20)

The user approved the stills and said "do all phases". In order, each on the one before:

### Phase 1 — the sim and the sandbox

- **`packages/shared/src/car/`** (subpath `@yutopia/shared/car`):
  - `sim.ts`: the rigid body on four raycast wheels; springs, dampers and anti-roll bars; the tyres on a friction ellipse with a curve per ground and load sensitivity.
  - The wheel's spin is solved implicitly (a stiff tyre on a light wheel), and a parked tyre is held to its patch, so there's no creep on a slope.
  - The drivetrain: the engine with its torque curve, a cold start, an automatic clutch, a 5-speed box (auto or manual), the open diff, and the 4x4's centre lock and low range.
  - Brakes and the handbrake.
  - The helps: ABS; traction control that brakes the spinning wheel and eases the throttle, its combined-slip check included; stability control that brakes the outer front when the car turns faster than its wheels ask; speed-limited steering; the countersteer helper, which takes the wheel as the tail swings out.
  - Digging in, and rocking out.
  - Collisions: the footprint box against circles and boxes, with impulses.
  - `specs.ts` (the sedan, the 4x4), `grip.ts` (ten grounds).
  - `world.ts`: the Grounds as the sim sees them, the roads' slush and black ice (`patchAt`), the lot's snowbanks as soft solids, and the test pad.
  - `net.ts`: the wire format and the server's check. `park.ts`: a parked car as an object.
- **`src/car.test.ts`**, against the plan's numbers:
  - 0–100 km/h in 12.1 s; top speed 171 km/h.
  - Braking from 50 km/h: asphalt 15 m, packed snow 25 m, snow 26 m, ice 111 m.
  - Cornering: asphalt 0.78 g, packed snow 0.34 g, ice 0.09 g.
  - The handbrake holds on a 15 % slope.
  - Deep snow: floored without traction control it digs in; with it, it crawls.
  - A handbrake turn; a held drift.
  - A wall stops it; reverse works.
  - The same inputs give the same car, bit for bit.
  - The 4x4 goes where the sedan bogs down.
- **`/dev/car`**:
  - the pad (a band of each ground, the ice pan, a 15 % hill, bumps, posts, a wall) or the real Grounds (`?world=grounds&at=lot|pond|driveway|woods|town`);
  - every wheel's load, slip ratio, slip angle and grip used, a g-meter, speed and β graphs;
  - sliders for the car's numbers and each ground's grip, helps on or off, the sedan or the 4x4, night;
  - copy the numbers out as JSON.
- **Sound** (`car/sound.ts`), all synthesized:
  - the engine: firing pulses, load in the tone, intake, the limiter's stutter, pops on a lift, the starter;
  - tyres by ground: a squeal on asphalt, crunch on snow, hiss on ice, slush;
  - wind, knocks with a ring of metal, the lever's clunk, the indicator's tick, doors, the horn.
  - The outside goes through a low-pass when you're inside. The engine is recorded since (below); the synth stays as its fallback.

### Phase 2 — driving in the world

- **`car/cars.ts`** (lazy, `yutopia-car`):
  - Every lot car is drawn with the new model where it's parked: the whole car within 38 m, the old one-mesh car beyond.
  - **X at a door** takes that door's seat; an empty car gives you the driver's.
  - The driver's sim runs on the client against the Grounds. It also hits the parked cars, the other cars, the shuttle, the visitor's car, people (soft: no one is hurt) and the lot's snowbanks.
  - The view goes 3D in a car and back after.
  - The car's cameras: chase, cockpit, hood.
  - Hints for the keys, then out of the way; no prompt while moving.
  - The headlamps are real lights, more of them on higher tiers.
  - The pad's rumble.

### Phase 3 — together

- **`features/cars.ts`** (world-server):
  - Seats are locked per car.
  - The driver's state is checked (too fast, a jump, off the ground, in a building), and a state it can't believe is snapped back.
  - The people in the seats are carried with the car.
  - With no driver, or the line quiet, it rolls to a stop.
  - Left still and empty, it parks where it stopped, saved at its heading (`props.a`, `hy`).
  - A car left out of the lot for 2 h with nobody near is towed back to a bay.
  - `mod:cars` puts the whole lot back.
- The shuttle and the visitor's car stop for driven cars.
- The grid holds a parked car at any angle; nobody walks through a moving one.
- Everyone else sees each car 110 ms behind, on Hermite curves, with their people seated in it (and not drawn standing). Iso draws the cars that move in their colours and hides the parked one that's out.
- The API takes object coordinates out on the Grounds (−2000…2000: a car left on the lawn was refused).

### Phase 4 — the interior, live

- The cluster is redrawn ten times a second: speed, revs, gear, fuel, temperature, the clock, the outside temperature, ICE, tell-tales.
- The driver's hands stay on the rim as it turns. The pine tree swings with the car's g.
- The cockpit camera leans with the g and looks into corners.
- The wipers sweep (V: three speeds).
- **Snow settles on the windscreen** and the wipers clear their fans.
- **The rear-view mirror renders the road behind** (24 fps on High, 12 on Medium).
- **The street lamps sweep over the cabin** at night.
- Doors swing as people get in and out.
- The radio (R: three stations, the lo-fi radio's own; passengers hear the same).

### Phase 5 — the terrain, deeper

- **Tyre tracks**: ruts in snow and deep snow, light ones on packed snow, dark arcs on the pond's ice. They fill back in over four minutes, for everyone's car.
- Snow and slush are thrown up by the wheels.
- The exhaust's breath is thick when the engine's cold.
- At speed the roof's snow blows off.
- **Slush and black ice are painted on the roads where the sim has them**, with more black ice at night and in storms; storms lay fresh snow on the roads' grip.

### Phase 6 — the 4x4

- **The 80s 4x4**: short, tall, two doors. Round headlamps in a black grille, black bumpers and cladding, mud flaps, a roof rack, steel wheels, the tailgate.
- It shares the sedan's cabin, moved and narrowed to fit (`sedan.ts` builds both bodies from their own profiles).
- Its spec: 1.6 L, 4.3 final drive with a 2.13 low range (J), centre-diff lock (K), 24 cm of clearance.
- Two of the lot's cars (`car-3`, `car-11`) are 4x4s.

### Phase 7 — checks

- **Unit tests**: shared 154 (car 11), world-server 72 (cars: in, passenger, believed, snapped, parked where it stopped, the lot back), client 20.
- Typecheck everywhere; Biome on the touched files.
- **e2e `car.spec`**, on the GPU: Ana drives a lot car out of its bay with Bia beside her, with no frame over 100 ms; both get out; it's parked at its heading for both.
- **Seen in the game** (headless, the dev stack): the lot with the new cars, getting in, out onto the lawn, the bank stopping it, the cockpit with the mirror's real view, getting out.
- **Budget**: world page 553.6 KB, over its 553 KB by 0.6 KB (what stays on the page: the controller's hooks and the grid's turned cars); `yutopia-car` 13.6 KB. The user raised the budget to 554 KB.
- **Not done**:
  - touch controls;
  - a mouse free look in the cockpit (the right stick does it);
  - cosmetic damage;
  - fuel at the gas station (the gauge works, the tank never runs dry);
  - the plough;
  - a wagon body (the lot's wagons are drawn as sedans).
- **Not checked**: Firefox; the fixture-swapping e2e suites (they'd overwrite the dev world).

## The recorded engine (2026-10-20)

The user OK'd downloading engine sounds. The set: Chippy569's *The Dyno
Sessions: 190E* (CC0, Freesound pack 9658), a Mercedes-Benz 190E-16V on a
dyno. Its loops are at three revs at full load and with none, by the exhaust
and in the engine bay; there's also a start. Credits are in
`public/sfx/CREDITS.md`.

- **What's in `public/sfx/car/`**: `{ex,bay}-{on,off}-{lo,mid,hi}.mp3` and
  `start.mp3`, 400 KB in all. Each is cut from the HQ preview, levelled to
  −20 dB RMS (the code sets the mix: full load up to 4× no load) and saved mono
  at 96 kb/s. They're fetched the first time someone stands by a car (the
  prompt) or a car is heard, and are never on the page.
- **The revs are measured, not taken from the labels.** Each loop's firing
  frequency (rpm / 30 for a four) gives no load ≈ 1,030 / 2,430 / 6,300 and
  full load ≈ 1,290 / 2,560 / 6,210. The "500 rpm" full-load loop runs at
  about 1,290.
- **`car/sound.ts`**:
  - The seams are crossfaded as each loop is decoded (120 ms, the MP3's
    padding skipped).
  - Each loop plays at the car's revs over its own, and the two loops either
    side are crossfaded (equal power, by log revs).
  - Load (throttle, less with the clutch out) crossfades full against none.
  - Out by the car it's the exhaust mic (and a quarter of the bay). Inside, the
    bay leads, low-passed at 2.4 kHz (the firewall), with the exhaust under it.
  - The limiter's stutter and the pops still play on top.
  - The starter is the recording's crank and catch, and the loops come in under
    its end. If it hasn't loaded within half a second, the synth's starter
    plays.
  - Until the loops are in (or if one is missing), the synthesized engine
    plays. Someone else's car plays only the exhaust mic until it's heard
    from inside.
- **Checked** (headless Chromium on `/dev/car`, the output tapped): all 12
  loops and the start play.
  - The loudest pitch follows the revs: 190 Hz at 5,840 rpm, against 195 for a
    four.
  - The level is about 0.010 RMS at idle, 0.035–0.040 floored and 0.014 on a
    lift.
  - No errors.
- **Not used** (not part of the OK): the pack's horn, doors, window, trunk,
  handbrake and switches, which are the same car's. Our synthesized ones stay.

## Model fixes from the user's screenshots (2026-10-20)

- **The sedan's C-pillars showed tan from outside.** The inner lining was
  double-sided on the paint's very surface and won the depth tie. It's
  one-sided now.
- **The 4x4 had no side behind its door** (no rear doors, and nothing in their
  place): the seats and floor showed. It has a body panel there now, arch cut
  out, with a cream card inside above the tub.
- **The cabin showed through the rear arches** (both bodies): the rear bench,
  the sills, the floor and the sedan's rear-door cards reached into the wheel
  wells.
  - The rear tubs now close round their tyres (`TUB`, 0.15 m in from the
    track) and reach down to the floor pan. They're trimmed in vinyl on the
    cabin side.
  - The bench sits between them, wider ahead of them on the sedan.
  - The sills and floor stop short of them.
  - The rear doors' card, armrest, walnut strip and crank follow the arch.
  - The 4x4's front seats are narrower on the outside, where its rear tubs are
    beside their backs.
- **The rubbing strips and the 4x4's cladding ran across the wheels.** They
  stop at the arches (`clearOfArches`).
- Review stills in `/dev/grounds`: `car-check-{sedan,offroad}`, `-arch` and
  `-bench`.

## Trees, off-road, knocks (2026-10-20)

The user reported three problems: the car sticks under trees, it's very slow
off the road, and hits on other cars and things feel weird.

- **Stuck under trees.** The car's solids were built from the walking mask, so
  every tile people walk round became a 1 × 1 m wall for a car: a tree's tile
  (under its branches), a lamp's tile, any steep tile. That's about 16 % of the
  Grounds.
  - A car now stops only at what's really there (`carBlockedTile` in
    grounds.ts): trunks, posts, the fence, the tower, the statue, the world's
    edge, buildings, the town's cars, and the bench (a box of its own).
  - The blocked runs merge into rectangles, so there are no seams between rows
    to catch on.
  - Steep ground is left to the physics.
- **Slow off the road.** Several causes:
  - 78 % of the Grounds is "deep" snow (wherever the woods are thick), and its
    drag (crr 0.1, plough 0.012 / m/s) almost matched a two-wheel-drive car's
    grip: the sedan topped out at 8 km/h.
  - The automatic didn't shift up while the wheels slipped more than 0.3, but
    deep snow grips best at 0.3–0.4, so the 4x4 sat on the limiter in 1st.
  - The invisible tile walls above kept stopping it too.
  - Now: snow crr 0.028, plough 0.0016, μ 0.36; deep crr 0.05, plough 0.0035,
    sink 0.12, μ 0.3; the gearbox shifts up below 1.6 × the ground's peak slip.
  - In 20 s, floored: sedan 44 km/h in deep snow (was 8), 81 in snow (was
    57); 4x4 76 in deep snow (was 39, stuck in 1st).
  - Without traction control the sedan still digs itself in, and rocking still
    gets it out.
- **Knocks.**
  - Two boxes now touch where a corner of either is inside the other, averaged.
    Flat against flat hits at the middle (no spin); a corner hits at the corner.
    Before, it was always this car's corner, so square knocks spun it.
  - Something that moves (a car) has a mass: the impulse is shared by weight,
    and turning is counted for both.
  - The bounce depends on speed (none for a lean or a push), and car-on-car
    friction is higher.
  - The push-out leaves 5 mm of overlap, so resting contacts don't buzz.
  - Another driven car is hit where it is now (its newest state carried on by
    its velocity), not where it's drawn, 110 ms in the past.
  - Each car's box is its own size (the 4x4 had the sedan's).
  - **A parked car moves when knocked.** The driver's client slides it on its
    braked tyres (by the ground's grip) till it stops, against walls and other
    cars. Then `car:shove` tells the server where it ended up. The server checks
    it (the driver's own car within 12 m, no more than 6.5 m from where it
    stood, not in a building) and parks it there for everyone. Other clients
    slide it there; it isn't rebuilt.
- **Tests:**
  - shared: a tree is only its trunk (fails on the old tile walls), off-road
    speeds, a knock square on and on a corner;
  - world-server: a shove near is taken, a 40 m one isn't;
  - e2e `car.spec`: backing across the aisle into a parked car, which slides,
    stops, and is in the same place for both browsers.


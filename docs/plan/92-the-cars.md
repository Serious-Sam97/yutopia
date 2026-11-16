# 92 — The cars: on Jolt, made in Blender, heard for real

Ask (2026-11-15): "Redo car models and mechanics — apply Jolt, improve design, improve sound. Let's use Blender
for the models, create some variants, I want quality models with a lot of details. Let's improve car gameplay:
today is more simulation, let's keep it in between simulation and arcade."

Status: **every phase built overnight 2026-11-16 (0–11, the checks last), uncommitted. Waiting on the user**:
phase 0's look (the stills in `design/cars/`: `0-road.png`, `0-road-rear.png`, `0-saloon.png`, `0-roles.png`,
`0-work.png`, `check-*.png`), phase 2's feel (`/dev/car`, keys and pad — how in "Phase 2"), the sound picks
(`/dev/car-sound`, ★ then "copy chosen.json" over `public/sfx/cars/chosen.json` — "Phase 11 — wired"). Planned
2026-11-15; forks decided by the user 2026-11-16: the recommendations for F1–F9, F11 and
F12; **F10b**, a model per variant, **three per road body** (18 road models); **F13b**, a buy panel where
you choose the variant, the colour and two-tone, the extras and the wheels. Next: phase 0, the mocks.
**2026-11-16, the user away overnight**: build every phase in order, the sounds moved last; the human gates
(phase 0's mocks, phase 2's feel, the sound picks) are left for the user — the sounds' picks preselected by me,
changed by ear on `/dev/car-sound`. Follows plan 28 (the car: the sim, the cabin, the
surfaces), plan 34 (every town car drivable, the work vehicles), plan 50 (Jolt), plan 73 (the life look),
plan 79 (the guns: Blender scripted, picked by ear) and plan 91 (the big map: loaded by where you are).

## Where we are, from the code

### The mechanics
- **Our own sim, not Jolt.** `shared/car/sim.ts` (1,167 lines) is a deterministic rigid body with four raycast
  wheels at 120 Hz, on the land's analytic `heightAt`. Plan 28 M0 refused a physics library ("too much WASM;
  the server couldn't run it"). Plan 50 then brought Jolt in for everything else, but the cars never moved
  onto it. Today Jolt only knows a car as:
  - a kinematic box while it's parked (`setVehicle`, `physics/world.ts:990`), there to stop walkers;
  - nothing at all while it's driven. The walker is blocked by the walk grid instead (`physics/body.ts:78`).
- **What makes it a simulation** (the part you feel):
  - real springs, dampers, anti-roll bars and roll centres, so weight transfers;
  - slip tyres on a friction ellipse with a peaky fall-off (`grip.ts`: asphalt 0.86, snow 0.36, ice 0.1), and
    the surface read under each wheel, so one wheel on ice pulls the car;
  - an open rear diff, so one wheel spins away;
  - clutch slip, shift cuts, engine inertia, a cold engine, digging into deep snow.
- **The helps** (ABS, TCS, stability, speed-limited steering, countersteer 0.75) are always on. Their
  switches exist only on `/dev/car`. Manual gears are unreachable in the game (`cars.ts:363` always passes
  `HELPS`).
- **Hitting things is flat.** The car's footprint is a 2D box against circles, boxes and segments
  (`sim.ts:943–1153`). A hit never rolls or pitches the car. The yaw kick is clamped, and above 4 m/s the
  wheels are stopped. Bridges and floors exist for the car only through `heightAt`/`deckAt`.
- **Eight kinds** (`specs.ts`): sedan, offroad, pickup, snowmobile, snowcat, ploughtruck, tractor, toboggan.
  Police and taxi are roles on the sedan. Karts are a separate sim (`shared/kart`) and stay out of this plan.
- **The network: the driver decides.** The driver sends `car:state` at 20 Hz. The server takes it as sent
  ("no anticheat", 2026-10-28) and never runs a car. Others play it back on the sender's clock
  (`car/playback.ts`). Remote wheels only spin; their suspension isn't simulated.
- **Jolt is ready for it.** Our build, JoltPhysics.js 1.1.1 with double precision, already holds
  `VehicleConstraint`, `WheeledVehicleController`, `TrackedVehicleController`, anti-roll bars, differentials
  with limited slip, and `OnTireMaxImpulseCallback` (per-wheel grip from JS). The land is a Jolt heightfield.
  But it's built only **two 32 m chunks round you** (`tp/physics3d.ts:35`): at 170 km/h that's about 1.5 s of
  road ahead.

### The models
- **All drawn in code** at runtime from three.js primitives: `tp/car/sedan.ts` (2,026 lines; sedan, 4x4 and
  pickup), `kit.ts`, `tracked.ts`, `work.ts`. They're in plan 59's stylized look: flat facets, hand-made
  `MeshStandard` materials. **Plan 73 never reached them**, except for the far LOD and the AI vehicles. They're
  the last big things in the world in the old look, as the guns were before plan 79.
- **The good parts stay:** the `Sedan` interface (body, wheels with steer and spin, doors on hinges, steering
  wheel, wipers, the pine-tree freshener, pedals, seat hips, the eye, lamps, the mirror, the screen); the amber
  VFD cluster and the radio drawn on canvases; the wear shader (crumple dents, grime, the snow layer);
  windscreen snow and wipers; the cabin light from street lamps.
- **The far model** (beyond 38 m) is one sedan or wagon outline for every kind. There's no instancing. Parked
  cars become still models.

### The sound
- **Only the four is recorded**: a 190E dyno set, on/off load × 3 rpm × 2 mics, crossfaded on log rpm. The V8
  (pickup), the two-stroke (snowmobile) and the diesel (snowcat, plough, tractor) are synthesized, and so is
  every tyre, door, horn and impact.
- **Spatialisation** is distance gain plus a `StereoPannerNode`; there's no 3D panner.
- **Missing altogether:** a recorded horn, doors, impacts and scrapes; skids that sound like skids; gravel;
  the engine ticking as it cools; suspension thumps; the wiper motor; the handbrake ratchet; tyre smoke and
  sparks (the effects aren't there either).

## The idea

**A car you can throw around, that still knows it's on snow.** The feel moves from "drive it like a real 80s
saloon on winter tyres" to the open-world middle (think Forza Horizon or GTA V, not Burnout or Assetto):
- it grips more and forgives more;
- it turns in on the first touch;
- a slide is started on purpose (the handbrake, a lift, a flick) and held with one hand;
- it lands from a jump;
- it rolls only when you've really asked for it, and gets back on its wheels.

**The surfaces still matter**: snow is the drifting surface, ice still slides, the woods' deep snow still
beaches the saloon where the 4x4 goes. **Jolt carries it:** the car is a real body in the same world as the
walker, the floors, the bridges, the trees and other cars, so a hit can tip it onto two wheels. **Each vehicle
is a real model** made in Blender: the outside, the cabin, the moving parts, in the life look's materials, in
several bodies and trims. **It sounds recorded**, near and far, inside and out.

## Forks — decided 2026-11-16

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | Where the feel sits | **a)** the open-world middle (Forza Horizon / GTA V): grippy, quick to turn in, drifts started on purpose and held easily, light weight transfer you can see · **b)** nearer sim: today's car on Jolt, the helps a bit looser · **c)** arcade (Burnout): grip on rails, drift by a button | **a** |
| F2 | How it's built on Jolt | **a)** Jolt's `VehicleConstraint` + `WheeledVehicleController` (engine, gearbox, diffs, suspension, anti-roll bars are Jolt's), our grip per wheel and surface through `OnTireMaxImpulseCallback`, an **arcade layer** of forces on top (below) · **b)** a plain Jolt body with our own raycast wheels (today's tyres ported) | **a**; phase 1 proves it, **b** is the fallback if the callback is too slow or too stiff |
| F3 | One feel or a choice | **a)** one feel for everyone, tuned well; the pad and the keys differ only in their input smoothing · **b)** a setting: *Fácil* / *Sim* | **a** (the effort goes into one feel); **b** later if friends ask |
| F4 | The gearbox | **a)** automatic, and manual as a setting (Q/E, the bumpers): the code's there, the game never let you · **b)** automatic only | **a** |
| F5 | Rolling over | **a)** cars can roll (Jolt), held by a roll stabiliser that makes it rare on flat ground; upside down or on its side for 2 s, a hold of R rights it · **b)** never: an arcade stabiliser keeps it on four wheels | **a** |
| F6 | Damage | **a)** you see it and feel a little of it: panels dent by zone, the bumper hangs and can fall off, glass cracks, a lamp goes dark, steam from the bonnet, the steering pulls when the front's bad; never wrecked (water still drowns it); repaired at home or on a tow · **b)** cosmetic only, as today · **c)** full: a car can be wrecked and burn | **a** |
| F7 | Which vehicles | **a)** all of them, road cars first: six bodies (below), then the five work vehicles and the AI's shuttle and visitor · **b)** the road cars now, the work vehicles in a later plan · **c)** today's eight, remade, nothing new | **a** |
| F8 | The style | **a)** late 80s / early 90s, ours: the world's VFD-and-cassette character, real types (a saloon, an estate…) but no real makes, badges or copied designs · **b)** mixed eras, some modern | **a** |
| F9 | Detail and weight | **a)** hero detail near: a full cabin (switches, stitched seats, gauges), the engine under an opening bonnet, real lamp optics; three LODs so a town of parked cars stays light · **b)** medium: the outside detailed, the cabin as today's | **a** |
| F10 | Variants | **a)** one GLB per body, its trims as named parts switched per car (bumpers, wheels, roof rack, bull bar, spot lamps, mud flaps, ski box, two-tone, rust), seeded by the car's id · **b)** a GLB per variant | **b**, three variants per road body (the user, 2026-11-16) |
| F11 | The sound | **a)** recorded (CC0, CC-BY only with its credit) for every engine and every handling sound, layered; picked by your ear from 3–4 candidates on `/dev/car-sound`, as the guns and steps were · **b)** made in code (as the karts) · **c)** I pick, you veto | **a** |
| F12 | The old sim | **a)** deleted once every vehicle drives on Jolt (the karts keep theirs) · **b)** kept as a fallback | **a** |
| F13 | Choosing your car's look | **a)** not now: every car's colour and trim seeded from its id · **b)** buying a car (`own.ts`) opens a small panel: colour, trim, extras | **b**: the variant, colour + two-tone, extras, wheels (the user, 2026-11-16) |

Rules that don't change: **people are never hurt** (knocked down, as today); the driver decides and the server
takes it (no anticheat); fuel, the cold start, the radio, the wipers, the VFD, towing, homes, lending and
passengers all stay.

## The mechanics (F1–F5)

### On Jolt
- **One body.** Each car is a dynamic Jolt body: its hull as a convex shape from the model's collision mesh
  (rounded, not a box), its mass and centre of gravity from `specs.ts`.
- **The constraint.** A `VehicleConstraint` with four wheels (the suspension's travel, frequency and damping;
  the wheel's radius, width and inertia), Jolt's engine (our torque curves), gearbox (auto shift points, the
  clutch) and differentials (open, limited slip, the 4x4's centre lock and low range).
- **The wheels' cast** is a cylinder (`VehicleCollisionTesterCastCylinder`) against the land, the floors, the
  bridges and the kerbs: real geometry, so `heightAt`/`deckAt` aren't needed.
- **Grip per wheel** through `OnTireMaxImpulseCallback`: the surface under that wheel (`groundAt`, the weather's
  slush, black ice and storm cover, the plough's cleared cells) sets its longitudinal and lateral friction, as
  `grip.ts` does now.
- **The step.** The client world steps at 60 Hz. While I drive, the car gets two collision steps per frame
  (120 Hz, as today) and the rest of the world isn't stepped twice.
- **Only the driver's client simulates a car.** In everyone else's world and on the server, the car is a body
  moved to its playback pose:
  - kinematic for the walker;
  - **for my car, a heavy dynamic body pulled to the pose by a soft constraint**, so a hit pushes both cars by
    their masses (a kinematic one would be an immovable wall).
- **Parked cars** stay kinematic; a hard hit shoves them (today's `shove`, sent by the driver who did it).
- **The land ahead** is built by speed: the ring stretched along the velocity (about 3 s of road), so a car at
  full speed never meets a missing chunk. A frame budget for chunk builds while driving, measured on the M1.
- **Jolt's limits** (plan 50: the heap, the body count, "past it, refused, never aborted") get cars counted:
  each vehicle constraint's cost measured on `pnpm physics`, and the determinism bench gets a driving run.

### The arcade layer (the in-between, F1a)
Forces and torques on the body each step, all in `shared/car/assist.ts`, all numbers in `specs.ts`:
- **Turn-in**: a yaw torque toward the steering's intent at low and middle speed. The car answers the first
  touch, without the front tyres needing to be past their peak.
- **Stability**: a yaw damper that lets a slide happen but brings it back. The drift angle is capped about 35°
  on the keyboard (more with a pad and countersteer), and **held by throttle and steering** rather than caught.
- **Drift entry**: the handbrake, a lift, or a flick asks for it. The rear's grip falls to a slide curve,
  then comes back by angle and throttle (grip return), with no snap.
- **Grip** at least about 1.0 g on asphalt, broader curves on every surface (a long plateau, a gentle fall),
  and the same order as today: asphalt > walk > grass > path > snow > deep > ice.
- **Downforce-ish hold** with speed, so a crest at 120 km/h doesn't throw the car off the road.
- **In the air**: a little pitch and roll control, the nose levelled for landing, the suspension soaking it up.
- **The roll stabiliser**: anti-roll torque past a lean angle. Rolling needs a real kerb, a ramp or a hit at
  speed. Upside down for 2 s, R (or Y on the pad) rights it.
- **Speed-sensitive steering, smoothing and countersteer** are kept from today's helps; ABS and TCS are kept,
  invisible.
- **Deep snow still beaches the saloon**, but rocking it out takes three goes, not ten; the 4x4 goes through.

### The numbers phase 2 must hit (the saloon, flat ground)

| Test | Today | Target |
| --- | --- | --- |
| 0–100 km/h, asphalt | 10–13 s | **8–9 s** (quicker, still an 80s car) |
| Top speed | 165–175 km/h | 175–185 km/h |
| 50 → 0 km/h | asphalt ~14 m · snow ~34 m · ice ~95 m | asphalt ~12 m · snow ~24 m · ice ~55 m |
| Steady cornering | asphalt 0.8 g · path 0.4 · ice 0.1 | asphalt **1.0 g** · path 0.6 · snow 0.5 · ice 0.2 |
| A handbrake turn at 50 km/h on path | spins without the helper | 180° in about two car lengths, held on the keyboard |
| A drift held on the keyboard | hard | 20–35° for 5 s round the lot's ring |
| 2 m crest at 100 km/h | — | lands on four, no spin |
| Clipped post at 60 km/h | yaw kick, no roll | turns it, may lift two wheels, doesn't roll |
| At rest | no jitter | no jitter, no creep on a 15% slope with the handbrake |

### Each vehicle on Jolt
| | How |
| --- | --- |
| Saloon, estate, hatch, van, pickup | `WheeledVehicleController`; RWD with a limited-slip diff (the saloon and the pickup), FWD (the hatch, the van) |
| 4x4 | AWD, a centre diff with its lock (K) and low range (J), more travel and clearance |
| Snowmobile | front skis as two wide "wheels" with ski friction (no drive), the track as a rear pair; leans into turns (the arcade layer) |
| Snowcat | `TrackedVehicleController`, two tracks, turned by braking a side |
| Plough truck | 6×4, the blade a sensor clearing snow cells (as today), heavy |
| Tractor | big lugged rears, small fronts, slow, climbs |
| Toboggan | a plain dynamic body on runner friction, pushed (as today) |

## The vehicles and the models (F7–F10)

### The line-up (F7a, F8a)
| Body | Today | Doors | Drive | Engine (its voice) | Where |
| --- | --- | --- | --- | --- | --- |
| **The saloon** | the sedan | 4 | RWD | 2.3 L four | the lot, the town, the police, the taxis |
| **The estate** | the far LOD only | 5 | RWD | 2.3 L four | the town, Church Street |
| **The hatch** *(new)* | — | 3 | FWD | 1.6 L four, revvy | the town, the gas station's rental |
| **The 4x4** | offroad | 3 | AWD | 2.4 L four, diesel option | behind the boathouse, the lot |
| **The pickup** | pickup | 2 | RWD | 5.0 L V8 | the farm |
| **The van** *(new)* | — | 3 + slide | FWD | 2.0 L four | the town's deliveries, 2 + 6 seats |
| Snowmobile, snowcat, plough truck, tractor, toboggan | today's | — | — | two-stroke, diesels | their homes |
| The shuttle, the visitor's car | `vehicles3d.ts` | — | AI | — | the routes |

### The pipeline (F9a)
- `tools/art/cars/build_cars.py` (`blender -b --factory-startup -P … -- --car <body>-<variant>`), seeded, one command,
  as `tools/art/guns` and `tools/art/life`. It writes `public/life/cars/<body>-<variant>.glb` and
  `<body>-<variant>-mid.glb`, one `<body>-far.glb` per body (the variants share a silhouette that far), the
  shared add-ons (`extras/<id>.glb`, `wheels/<id>.glb`), and gets a `build_all.sh` entry. A variant's script
  is its body's with its own panels, bumpers, lamps, grille, cabin and badges: the body's shared parts (the
  hull's shape, the doors' hinges, the sockets) are made once. Meshopt geometry, KTX2 textures (`pack_glb.py`).
- **Materials**: the life library (`tools/art/life/materials.mts`) plus new ones:
  - **car paint**: a clear coat, metallic flake per colour, a solid option; the wear (grime, rust, dents,
    snow) layered on it as today's `wearable()` patch;
  - chrome, black trim, rubber (the tyres' sidewall text and tread as normal maps), tinted and clear glass,
    lamp lenses (with the reflector inside, for real optics), the plate;
  - the cabin's walnut, cloth, vinyl, carpet and leather.
- **Detail, near** (about 60–80k triangles with the cabin):
  - panel gaps, the door handles, the seals, the wipers, the badges as ours (the car's own name);
  - the grille, the lamps' insides, brake discs and callipers behind the rims, exhaust tips, mud flaps;
  - the cabin as today's but modelled: switches, stitched seats, the VFD's glass, the cassette deck, the
    pedals, the gear lever with its gaiter;
  - the engine under the bonnet, open in the garage.
- **Mid** (~12k) for the parked cars round you; **far** (~1.5k) its own silhouette per body, no longer the
  sedan's outline for everything.
- **Named nodes** the code needs (checked by `life-budget.test.ts`, as the guns are):
  - `body`, `wheel_fl…rr` (each a `steer` and a `spin`), `door_*`;
  - `bonnet`, `boot`, `wiper_*`, `steering`, `pedal_*`, `lever`, `handbrake`, `mirror`, `screen`;
  - `lamp_head/tail/brake/reverse/ind_*`;
  - sockets: `seat_*` hips, `eye`, `exhaust_*`, `headlight_*` (where the real spot lights sit);
  - sockets for the add-ons (`x_roof`, `x_front`, `x_spot_*`, `x_flap_*`, the wheels' hubs) and damage zones.
- **The `Sedan` interface stays** and becomes `CarModel`: the GLB is adopted into it, so the rig, the camera,
  the seats, the VFD, the windscreen snow and the playback keep working unchanged. `sedan.ts`, `kit.ts`,
  `tracked.ts`, `work.ts` and `textures.ts` go once every body is in.
- **Loading**: fetched (not in the chunk) through `life-assets.ts`, the materials compiled behind the loading
  screen. One GLB per variant, loaded only when one is near and shared by every car of it, never a copy per car (plan 91's caches that only grow).
- **`/dev/cars`** is the sheet: every body by side, three-quarter and open; every trim; by day on the snow, at
  night with the lamps, set beside reference photos of the type.

### Variants (F10b: a model each, three a body)
- **Three variants per road body, 18 road models**, each its own model: what changes is real shape, not a
  switched part. A first proposal, set in phase 0's mocks:

  | Body | Base | GL (luxury) | Sport / special |
  | --- | --- | --- | --- |
  | Saloon | steel wheels, black bumpers, a plain grille | chrome, a long grille, velour cabin | a kit, a spoiler, round fog lamps, bucket seats |
  | Estate | the plain wagon | wood-trimmed sides, rails | a high-roof utility (the plumber's) |
  | Hatch | 3-door base | 5-door GL | the hot hatch: arches, a bonnet scoop |
  | 4x4 | short, soft top | long, hard top, 5 doors | expedition: snorkel, raised, a ladder |
  | Pickup | single cab, work bed | crew cab, chrome | the farm's flatbed with a dropside |
  | Van | panel van | the minibus (windows, 8 seats) | the camper (a pop-top) |

- **The police** is on the saloon GL, **the taxi** on the saloon base: a livery and a roof part (the light bar,
  the sign), not their own models.
- **Shared by the variants** (their own small GLBs, on the variants' sockets): the **extras** (roof rack,
  ski box, bull bar, spot lamps, mud flaps, snow chains) and the **wheels** (steel, two alloys, winter,
  off-road), each with a fit per body.
- **The paint**: a period palette, two-tone where the variant has a line for it; wear from fresh to rusty.
- **A car nobody owns** (the fleet, the town) is seeded from its id: a variant its home suits, a colour, a
  few extras.

### Your car's look (F13b)
- **Buying a car** (`own.ts`) opens a panel in the HUD's walnut look: the car turning on a stand, rendered in
  3D, with:
  - the **variant** (the three of the body);
  - the **colour** and, where it has one, the **second colour**;
  - the **extras** (a toggle each, those that fit);
  - the **wheels**.
- The choice is the car's: saved on its world object (`props.look`: variant, colours, extras, wheels),
  sent with it and drawn the same for everyone; the server checks each value is one the body has.
- Changed later at its home (the same panel, "Repaint"), free for now.

### Damage (F6a)
- **Dents by zone** (front, rear, left, right, roof): baked morph targets in the GLB, mixed by the zone's
  damage. That beats today's vertex noise, and the lines stay clean.
- **Parts**:
  - the front bumper hangs then falls (a Jolt thing on the road, gone after a while);
  - a mirror folds;
  - a lamp breaks (its light out);
  - the glass cracks (a texture layer), then shatters (the side windows only).
- **Feel**: a bad front pulls the steering a little and dims the lamps; steam from the bonnet past 0.8. Never
  wrecked.
- **Repaired** at its home, or on a tow (`mod:cars`), as wear is now.

## The sound (F11a)

Recorded, layered, picked by your ear: plans 63, 65 and 79's way (`tools/sfx-cars-search.mjs` →
`tools/sfx-cars.json` → `sfx-weather.mjs` cuts → `/dev/car-sound` on `SoundBench`, ★ picks).

- **The engines.** A voice per engine: the four (kept or bettered), the revvy four, the V8, the diesel, the
  two-stroke.
  - Each from a dyno or ramp recording: on/off load at 4–5 rpm points (today has 3).
  - Three mics: the exhaust, the bay, **the cabin** (heard inside, instead of today's low-pass).
  - The starter, the idle, the cooling tick after it's switched off.
- **The layers on top**: intake on throttle, the gearbox's whine in low gears and reverse, the shift (the
  clutch, the lever), lift-off pops and a backfire, the limiter, a turbo nowhere (it's the 80s).
- **The tyres by surface and slip**: the asphalt squeal (a long skid sound, not a beep), the snow's crunch and
  its slide, the ice's hiss, gravel and slush spray, the rumble strips at the bridge.
- **The body**:
  - hits in three weights against metal, glass, a post, a tree, a snowbank;
  - a scrape loop (with sparks);
  - suspension thumps on landing and bumps;
  - a hanging bumper's rattle.
- **The cabin and the parts**: doors open and shut per body (a saloon's clunk, a van's slide, a pickup's tin),
  the boot, the bonnet, the handbrake's ratchet, the indicator's relay, the wiper motor, the seat belt, the
  horn per body, the police siren recorded.
- **In space**: a 3D panner (HRTF) for everyone's car; a far car's engine dulled and with a tail; the cabin
  muffles the world; the mix against the steps and the voices (plan 63's level rule).
- **Credits** go in `sources.json`.

**Questions for you before the sounds are made** (as plan 79's phase 9) — **answered by me as defaults while you
slept (2026-11-16), for you to confirm or change**:
- the character: **real and heavy**, as the guns (AW2's weight, not a cartoon's);
- how far a car is heard: **to ~120 m**, dulled with distance (today it fades by 70 m);
- the cabin: **moderately muffled**, with its own cabin-mic loops where a recording has them (the bay's and the
  exhaust's under a low-pass where not).

## The camera and the screen
- **The chase cam** retuned for the new feel: a little lower and closer; the FOV opens with speed (62 → 76);
  it looks into a drift (toward the velocity, more than today's 35%); it settles after a landing; a hit shakes
  it.
- Hood and cockpit stay. The cockpit gets the new cabin and its eye socket.
- **The HUD**: the speedometer stays on the dash (VFD). A small gear + speed readout outside the cockpit,
  walnut-framed (plan 66's HUD look), only while driving.
- **Effects** (`car/fx.ts`):
  - kept: tracks, spray, slush and ice patches, windscreen snow;
  - new: tyre smoke on asphalt, a snow rooster tail by slip, sparks from scrapes, the dropped bumper, steam,
    exhaust that shows the revs.

## Phases

0. **Mocks** — signed off before code:
   - Blender blockouts of the six road bodies and their three variants each, side by side (proportions, the
     period, ours: the variants table above confirmed or changed);
   - **the saloon at full detail** as the bar for the rest: outside by day on the snow, at night with its
     lamps, the cabin from the driver's seat, the engine under the bonnet;
   - stills beside today's car and reference photos of the type;
   - the feel spec: the targets above.
1. **Jolt drives a box** — `shared/physics`: `addCar(spec)` → a `VehicleConstraint` car.
   - Grip per wheel from the surface (`OnTireMaxImpulseCallback`), two collision steps while driving.
   - On `/dev/car` beside today's sim (A/B on one key), with telemetry (each wheel's load, slip and surface;
     yaw, drift angle, g).
   - Its cost per step measured; heap and determinism bench.
   - **F2's gate: a, or fall back to b.**
2. **The feel** — the arcade layer (`assist.ts`), every surface retuned, the roll stabiliser and righting,
   jumps, the pad, the keys, touch.
   - The numbers table hit (tests in `shared/car.test.ts`, rewritten for Jolt).
   - **You drive it on `/dev/car` and sign off the feel.**
3. **Into the world** — my car on Jolt in the client's world:
   - the land built ahead by speed;
   - bridges and floors as real geometry;
   - others' cars as pulled bodies (cars push each other by mass), the walker stopped by Jolt, not the grid;
   - parked cars shoved, people knocked (never hurt), the AI vehicles;
   - water and drowning, the plough, unstick and righting;
   - the wire as today plus the wheels' compression for others.
   - Two browsers; frame cost on the M1 on Low.
4. **The work vehicles on Jolt** — the snowmobile, the snowcat (tracks), the plough truck, the tractor, the
   toboggan. **The old sim deleted** (F12a).
5. **The Blender pipeline and the saloon** — `build_cars.py`, the materials (car paint), LODs, named nodes and
   sockets, `CarModel`, loading.
   - The saloon replaces `sedan.ts` everywhere: driven, parked, still, far, the police, the taxis.
   - Stills against phase 0.
6. **The road cars** — the saloon's other two variants, then the estate, the hatch, the 4x4, the pickup and
   the van, three each:
   - their specs and seats (the minibus's eight);
   - the extras and the wheels, fitted per body;
   - the fleet seeded (variant, colour, extras), which car lives where (`TOWN_CARS`, `homes.ts`, the lot).
7. **Your car's look** (F13b) — the buy panel and "Repaint": the 3D stand, variant, colours, extras, wheels;
   `props.look` saved, checked on the server, drawn for everyone. A server test, an e2e (buy, choose, a second
   browser sees it).
8. **The work vehicles' models** — the snowmobile, snowcat, plough truck, tractor, toboggan, the shuttle and the
   visitor's car (`vehicles3d.ts`) from the same pipeline. `kit.ts`, `tracked.ts` and `work.ts` go.
9. **Damage and effects** — the dents' morphs, the bumper, the mirrors, the glass, the lamps, the steam; tyre
   smoke, sparks, rooster tails; the camera's retune; the HUD readout.
10. **Checks**:
    - shared car tests, the world-server's (`cars.test.ts`, `pets-car`);
    - the e2e near cars (`car.spec`, `pets-car.spec`, `life-vehicles`);
    - frame cost on High and Low (a town of parked cars; the M1 on Low), heap and GPU memory;
    - the `yutopia-car` chunk and GLB budgets measured and noted;
    - the tuning pass in snow and at night;
    - stills.
11. **The sounds** (last: the user's call, 2026-11-16) — the questions first, then:
   - the candidates;
   - **your picks on `/dev/car-sound`**;
   - the engines, the layers, the tyres, the body, the parts, the 3D panner, the mix, the credits.

**Phases 1–4 (the mechanics) and 5–8 (the models, the look panel) don't touch the same files**, and can run side by side in
two sessions once phase 0 is signed off. They meet in phase 9.

## Risks
- **Jolt's tyre callback from JS** runs per wheel per step: 8 calls a frame for my car alone, and fine if only
  the driver simulates. Measured in phase 1. If it costs or feels wrong, F2b.
- **The land at speed**: the ring's chunks cost to build (plan 91's slow machines). It gets its own budget and
  a look-ahead, and is tested on the throttled probe (`e2e/zz-stall.mts`).
- **Two cars hitting**, each simulated on its own client, never agree exactly. The pulled body hides most of
  it; a hard hit may look different on the two screens (it does today too).
- **The weight**: a town of 30+ detailed cars, now from 18 road models (F10b): only the variants near you
  loaded, freed by distance (plan 91), the far one per body. Mid LOD and still models for parked ones, one GLB per body,
  shared materials. The friends' M1 on Low is the bar (plan 90).
- **The feel is taste**: phase 2's sign-off is the gate, as plan 28's was.

## Phase 1 — built (2026-11-16): Jolt drives a car

**F2a works: Jolt's own vehicle, our tyres through its callback.**

What's in it:
- `shared/physics/car.ts` `WorldCar`, made by `PhysicsWorld.addCar(def, …)` and dropped by `removeCar`. The
  world stays the one owner (plan 50, guardrail 3). It's built from:
  - a dynamic body (a rounded hull box, its centre of mass at the origin, `LinearCast`);
  - a `VehicleConstraint` with a cast-cylinder tester: four wheels on their springs, two anti-roll bars;
  - Jolt's engine, gearbox and limited-slip diffs. The snowcat gets `TrackedVehicleController`'s two tracks.
- **The tyres are ours.** Jolt's own curves are set flat, and `OnTireMaxImpulseCallback` asks us, every
  collision step and wheel, for the most grip the tyre has:
  - from the ground under that wheel (`groundAt`, the storm's cover, the plough's cells, a ski's or a track's
    take);
  - shaped by the friction ellipse;
  - scaled by the arcade layer's multipliers.
  - It writes straight into the wasm heap, so no wrapper is made per call.
- `shared/car/drive.ts` `Drive` is what used to be `stepCar`'s outside.
  - Before Jolt's step (`pre`): the hands and feet smoothed, the helps (TCS and ABS as input easing, the hold
    at a stop), the steering limits and countersteer, the arcade layer (`assist.ts`). Then what Jolt doesn't
    know: rolling resistance and ploughing per surface, the water's drag, the air's quadratic drag, the
    toboggan's push.
  - After the step (`post`): Jolt read back into `CarState`, so the rig, the sound, the VFD and the wire read
    what they always did. Also there: the deep-snow sink and the belly dragging on it, the knock found from
    the velocity's jump (and what it hit, from the world's solids), fuel, warmth, the odometer, drowning.
- Two collision steps a 60 Hz frame (120 Hz, as before).
- `shared/car/jolt-world.ts` is the tests' and the bench's world. It makes the land 32 m chunks at a time
  round the car, from any `CarWorld`, and the hard solids as statics.

Measured:
- **Cost:** 0.09–0.10 ms a frame for the world step with one car on the pad (`car/bench.ts`, Node, M4). The
  callback's eight calls a frame don't show.
- **Determinism:** a 60 s scripted drive hashes `5998757d` every run, now in `pnpm physics` ("cars: a drive,
  deterministic").
- **Heap:** 400 cars made and dropped leave Jolt's heap flat (+0.009 MB). Two leaks were found and fixed on the
  way: a `Quat.sIdentity()` per car, and the body's linear damping (0.02 /s at 100 km/h is a 700 N drag:
  0–100 took 12.5 s with it).
- `pnpm physics` with the default 20-minute soaks wasn't rerun tonight; the car lines pass. The two 0.2-minute
  soak lines fail only for being too short.
- **No A/B on `/dev/car`.** Phase 4 deletes the old sim, so a toggle would have lived a few hours. The old
  sim's numbers are below, beside the new ones, from the same tests.

## Phase 2 — built (2026-11-16): the feel

- `shared/car/assist.ts` is the arcade layer, all its numbers in `ASSIST`:
  - **turn-in:** yaw toward the steering's rate, as far as the grip allows;
  - **stability:** unasked yaw damped, a drift held under 35° on the keys (46° with a pad);
  - **drift entry:**
    - the handbrake takes the rear's side grip to 0.3 and helps the swing round;
    - a lift takes it to 0.82;
    - a slide held on the throttle keeps it at 0.78, then the grip comes back as it straightens, no snap;
  - **speed hold:** 0.28 of its weight down at 120 km/h;
  - **in the air:** levelled, a little steering;
  - **roll stabiliser:** past 18° on its wheels;
  - **R rights it** after 2 s on its roof or side, still.
- `FEEL` (`drive.ts`) holds the tyres' and the drivetrain's side of it:
  - grip `0.1 + 1.08 ×` the ground's, which lifts the low grounds most: ice can be driven, it still slides;
  - the peaks 1.35× wider and a fifth of the slide's loss given back;
  - springs 1.75 / 1.65 Hz;
  - torque ×1.42, brakes ×1.25, the handbrake ×2.2, a 1.5 limited slip.
- **The manual gearbox is real now (F4a):** with `helps.auto` off, Q/E shift and the gear holds. The in-game
  setting is wired in phase 3.
- **Keys, pad and touch** go through the same `Controls`. A pad gets less smoothing and a wider drift cap.
- `car.test.ts` is rewritten on Jolt: **33 tests, all pass** (8.7 s). The targets table, measured on the
  saloon, flat ground:

| Test | Old sim | Target | Jolt (tonight) |
| --- | --- | --- | --- |
| 0–100 km/h | 10–13 s | 8–9 s | **8.65 s** |
| Top speed | 165–175 | 175–185 | **183 km/h** |
| 50 → 0 asphalt / path / snow / ice | ~14 / 28 / 34 / 95 m | ~12 / — / 24 / 55 | **13.6 / 20.2 / 20.9 / 55.3 m** |
| Steady cornering asphalt / path / snow / ice | 0.8 / 0.4 / — / 0.1 g | 1.0 / 0.6 / 0.5 / 0.2 | **1.01 / 0.55 / 0.50 / 0.24 g** |
| Handbrake turn at 50 on path | spins without the helper | 180° in ~2 lengths | **173° in 28 m**, held 1.2 s |
| Drift held on the keyboard | hard | 20–35° for 5 s | **27° mean (16–46°)**, no spin |
| 2 m crest at ~90 km/h | — | lands on four, no spin | **1.0 s in the air, level, yaw < 0.03** |
| Post clipped at 60 km/h | yaw kick | turns, no roll | **turned 52°, stayed flat** |
| 15 % slope, handbrake, 60 s | holds | no creep | **8 mm** |
| Deep snow, floored 15 s | beaches | saloon beaches, 4x4 goes | **saloon 4 m, 4x4 233 m, snowmobile 156 km/h** |

**For you to check on waking: the feel, on `/dev/car`.**
- Open `/dev/car` (the pad), or `/dev/car?world=grounds&at=lot` for the real Grounds; `&car=offroad`,
  `pickup` and the rest for the others.
- Drive it on the keys, then on a pad:
  - the handbrake turn on the packed-snow band (Space plus full lock at ~50 km/h);
  - a drift held round the ice pan's packed ring;
  - the 15 % hill;
  - the bumps at the south end;
  - a post or the wall.
- The **Feel** knobs on the right change it live: grip ×/+, peak width, slide kept, turn-in, yaw damp, drift
  cap, handbrake grip and yaw, drift grip, grip back, speed hold. **"Copy feel"** puts the numbers on the
  clipboard; paste them to me and they become the defaults.
- R rights the car on its roof. `jolt N ms` on the left is the step's cost.

## Phase 0 — built (2026-11-16): the mocks (the art)

The user away overnight: the mocks made and **left for the user's sign-off on waking**. Every road variant and
work vehicle is a finished Blender model, not a blockout. The same script makes the stills and the game's
files (phase 5), so what's signed off is what ships.

**To look at, in `design/cars/`:**
- `0-road.png`: the 18 road variants three-quarter by day on snow (the line-up), and `0-road-rear.png` from
  behind;
- `0-work.png`: the work vehicles and the shuttle;
- `0-saloon.png`: the saloon's six stills on one sheet;
- the saloon (base), the bar for the rest:
  - `saloon-base-day.png`, `saloon-base-rear.png`, `saloon-base-side.png`;
  - `saloon-base-night.png`: its lamps lit, a street lamp off to the side;
  - `saloon-base-cabin.png`: from the driver's eye. The amber bar is the VFD's plane; the game draws the
    cluster on it;
  - `saloon-base-engine.png`: the bonnet open;
  - `saloon-base-doors.png`: the left doors and the boot open, the panels and door cards cut;
- every variant alone: `<variant>-day.png` and `<variant>-rear.png`.

**The variants table above: built as written.** Its names are ours. The make is **Esker** (ours, a glacial
ridge), on the boot or tailgate with the model's own badge:

| Body | Base | GL | Third |
| --- | --- | --- | --- |
| Saloon | 240 | 240 GL | 240 S |
| Estate | 240 Touring | 240 Touring GL | 240 Utility |
| Hatch | Pika | Pika GL | Pika RS |
| 4x4 | Ridge | Ridge 5 | Ridge Trek |
| Pickup | Haul | Haul Crew | Haul Flatbed |
| Van | Drover | Drover Bus | Drover Camper |

Two changes from the proposal:
- the taxi and the police are add-on roof parts (`extras/taxisign`, `extras/lightbar`), as planned, with their
  liveries on every saloon's doors (switched on by the game: the quality pass below);
- the visitor's car is a saloon GL (an alias, no model of its own).

## Phase 5 — the Blender part built (2026-11-16): the pipeline, the saloon

`tools/art/cars/`, one command: `blender -b --factory-startup -P tools/art/cars/build_cars.py` (all of it, about
2.5 min). `-- --car saloon-base,…` builds some; `--addons` the shared parts.

- **How a car is made:**
  - `bodies.py`: the lower body is a loft of sections (sill, bulge, a shoulder crease, rounded plan corners).
    The greenhouse is its side profile extruded, tumbled in to the roof and bevelled; at the windscreen and
    back light the glass wraps at the corners;
  - every opening is cut by a boolean: the arches, the windows, the doors, the bonnet, the boot, tailgate or
    twin doors. A panel is what's inside its cutter (shrunk half a gap); the body keeps what's outside (grown
    half a gap): **real panels with real 4.5 mm gaps**;
  - `kit.boolean` checks each cut: what's wholly outside the cutter must come through untouched, and the result
    must stay inside its source. Otherwise the next solver is tried (Exact, Manifold, Float); a cut no solver
    can make is logged and left. None are left in the current build.
- **Parts** (`parts.py`, `dress.py`, `extras.py`):
  - lamps, mouldings and lenses are placed by **casting rays at the finished panels**: a lamp wraps the corner
    of whatever body it's on;
  - outside:
    - headlamps: rectangular with flutes, quad round, or a 4x4's round; reflectors, bulbs;
    - ribbed tail lamps (tail and brake, indicator, reverse); the grille (slats or chrome bars) and its emblem;
    - 80s bumpers (black, chrome with a rubber strip, or painted with an air dam); plates;
    - the badge letters; side mouldings (with a chrome insert on GLs); door handles; mirrors on the front
      doors; repeaters;
    - drip rails, the filler flap, the aerial, wipers, window rubbers (chrome on GLs);
    - arch liners and the underbody; the exhaust;
  - the cabin:
    - the dashboard with its cluster hood and the VFD's plane, the radio-cassette, the heater's sliders, vents,
      the glovebox;
    - the steering wheel on its column with stalks; three pedals; the gear lever in its gaiter; the
      handbrake;
    - pleated seats (bucket seats on the sport ones); benches; door cards with armrests and pulls (walnut on
      GLs); the headliner, the visors, the inside mirror, the parcel shelf;
  - the engine bay: a four or a V8, the cam cover, plug leads, runners and manifold, the air filter, the
    radiator and fan, hoses, the battery, the reservoirs, the strut towers;
  - wheels: tread blocks and sidewalls, pressed steel, a plastic cover, lattice, turbine and five-spoke
    alloys; discs and callipers.
- **Materials**: PBR factors, with shared textures since the quality pass (below).
  - The paint has a clear coat (`KHR_materials_clearcoat`).
  - The cabin's materials are named after the life library's (`walnut`, `carpet`, `leather`, `tweed`,
    `velvet`), so the game can lay the library's maps on them.
  - The lamps' own light is emissive materials (`emit_head`, `emit_tail`, …) at 0. The game drives them.
- **The files** (`apps/client/public/life/cars/`, in git as the guns are):
  - `<variant>.glb`: near;
  - `<variant>-mid.glb`: built again by the same generators at lower detail (since the quality pass);
  - `<body>-far.glb`: one per body, about 2k, the cabin gone;
  - `extras/<id>.glb`, `wheels/<id>.glb`;
  - `manifest.json`: per car its file, body, variant, kind, name, dims, wheelbase, track, wheel, `hubs`,
    `seats`, `eye`, `points`, `pivots` (each `at`, `axis` and `parent`, plus `kind`, `side`, `ratio`, `w`
    and `h` where they apply), doors, triangles and bytes per level, materials and morphs. All in **glTF's
    frame** (x forward, y up, z right; the origin on the ground under the centre of gravity), so it is the
    game's car-local frame with no conversion.
- **The nodes** (the header of `build_cars.py` lists them):
  - the root `<variant>`, with `body` under it;
  - under the body:
    - `door_*` at each hinge (`mirror_l/r` under the front doors), `bonnet`, `boot` (or `boot_l/boot_r`),
      `bumper_f` (detachable, `plate_f` on it), `plate_r`;
    - `wiper_l/r`, `steering`, `pedal_0..2`, `lever`, `handbrake`, `screen`;
    - `lamp_head`, `lamp_tail`, `lamp_brake`, `lamp_reverse`, `lamp_ind_l/r`;
    - `collider` (the convex Jolt hull, never drawn);
    - the points: `seat_*`, `eye`, `exhaust_0`, `headlight_l/r`, `hub_*`, `x_roof`, `x_front`, `x_spot_l/r`,
      `x_flap_*`;
  - `wheel_fl › steer_fl › spin_fl` (and the other three) under the root.
- **Dents** (F6a): five morphs on every paint panel (body, doors, lids): `dent_front`, `dent_rear`,
  `dent_left`, `dent_right`, `dent_roof`, pushed in and a little crumpled.
- **Budgets** (`look/life-budget.test.ts`, driven by the manifest, 64 tests green):

  | Level | Size | Triangles |
  | --- | --- | --- |
  | near | ≤ 1.2 MB | ≤ 80k (the shuttle 90k) |
  | mid | ≤ 0.4 MB | ≤ 16k |
  | far | ≤ 0.08 MB | ≤ 2.6k |
  | an add-on | ≤ 0.05 MB | ≤ 2.5k |
  | a wheel | ≤ 0.08 MB | ≤ 6k |

  The road cars' required nodes are checked, and the dent morphs on the paint.

## Phase 6 — the models built (2026-11-16): the road cars

All 18, by the table above.

| Variant | Near | Mid |
| --- | --- | --- |
| Saloon base · GL · S | 70.0k / 0.97 MB · 71.9k / 1.00 · 75.8k / 1.01 | ~14–15k / ~0.31 MB |
| Estate base · GL · Utility | 70.2k / 0.99 · 74.6k / 1.06 · 64.2k / 0.92 | ~14k |
| Hatch base · GL · RS | 65.9k / 0.99 · 71.8k / 1.09 · 73.6k / 1.04 | ~14–15k |
| 4x4 short · long · Trek | 63.7k / 0.86 · 70.1k / 0.98 · 73.6k / 1.02 | ~14–15k |
| Pickup single · crew · flatbed | 62.3k / 0.86 · 72.0k / 0.99 · 56.4k / 0.84 | ~13–15k |
| Van panel · bus · camper | 63.2k / 0.92 · 76.1k / 1.09 · 71.8k / 1.04 | ~14–15k |

- Far: about 2.0–2.2k and 0.05 MB each.
- In all, about 24 MB of GLBs (18 near at about 1 MB each).
- **The add-ons** (F13b): `extras/` holds `roofrack`, `skibox`, `bullbar`, `spots`, `flaps`, `chains`,
  `lightbar` and `taxisign`, 0.1–2.2k triangles each. Each sits at its socket's origin; the manifest's
  `extras.<id>.socket` names the socket.
- **The wheels**: `wheels/` holds `steel`, `cover`, `lattice`, `turbine`, `sport`, `winter` and `offroad`,
  about 5k triangles each, at a reference size (r 0.317 m, width 0.195 m). The game scales them to each car's
  `wheel`.

## Phase 8 — the models built (2026-11-16): the work vehicles and the shuttle

`tools/art/cars/work.py`. Same frame and pipeline; each has its own moving parts:

| Vehicle | Near | Its parts |
| --- | --- | --- |
| Snowmobile | 5.9k | skis under `wheel_fl/fr › steer_fl/fr`; the track belt `track_l` and its bogies `roller_0..4`; the handlebar `steering` |
| Snowcat | 18.9k | `track_l/r` (belts with lugs), `roller_l0..4` and `roller_r0..4`, cab doors, a rear door `boot`, the `beacon` |
| Plough truck | 40.9k | the `blade` (pivot at its frame), the `bonnet`, cab doors, twin rear wheels, the spreader hopper, the beacon bar |
| Tractor | 27.2k | big lugged rears, cab doors, the beacon, the hitch |
| Toboggan | 1.0k | `runner_l/r` |
| Shuttle (`shuttle-bus`) | 86.6k | built on the road bodies' machinery; folding doors `door_sr`, `door_mr` on its right |

**Weaker than the road cars, said plainly** (as first built — the quality pass below answers most):
- the work vehicles are built from rounded boxes and lofts. They're readable and in proportion, but well short
  of the saloon's detail, and the snowmobile is the plainest;
- the textures are not made: no paint flake, no tyre sidewall lettering, no fabric weave. The game's library
  maps on the named cabin materials will help;
- the police's and the taxi's liveries are not modelled. The police's white doors need no model: each door's paint is its own mesh (`door_fl-paint`…), so the game tints it. The taxi's chequer band would be a decal;
- the rust and grime stay the game's shader (today's `wearable()`), not baked;
- the mid level is made by decimation: fine at its distance, ragged up close.

## Phase 3 — built (2026-11-16): into the world

- **My car drives on Jolt in the browser's own world** (`tp/physics3d.ts`: the same world as the walker, the
  floors, the land's heightfield and the Grounds' things). The car is a `Drive` made once the 3D view's physics
  is in (`cars.ts` `joltUp`). Each frame `cars.frame` reads the last step back (`post`) and gives the hands and
  feet (`pre`); the view steps the world after it. `BrowserPhysics.carsBusy` keeps it stepping while a car is
  on it, with two collision steps.
- **The land ahead by speed:** `drivingAt` builds the chunks along the next 3 s of road, a chunk either side,
  the nearest in time first, two per call, every 200 ms. Chunks ahead are kept as well as those round you. The
  chunk under the car or just ahead is built even before the view has made its land, so the car is never on
  none.
- **Getting in:** the parked car's kinematic box comes out of the world under the new Jolt car (`ownCar`).
  Without it the car was made inside its own box and thrown 8 m out of the bay.
- **Others' cars** (`PulledCar`) are dynamic bodies of their hull and weight in my world, pulled each frame to
  where their driver has them:
  - my car meets them by their masses, and so does the walker;
  - the walk grid's block for moving cars is gone wherever Jolt has the car (`blocks`);
  - the Grounds' shuttle, plough and visitor's car are the same, at 9 t, within 120 m.
- **Parked cars** are still kinematic boxes (walls), but a knock into one shoves it (the old `shove`: it
  slides, stops, the server's told), from the knock Jolt gave my car.
- **People and pets** are knocked, never hurt: the soft solids round the car, as before.
- **Unstick and snaps** put the Jolt car there too. **R rights a car** on its roof or side after 2 s, with a
  toast; R is still the radio otherwise. **The manual gearbox** is a setting: Settings → Controls, "Manual
  gearbox in cars (Q/E)".
- **The wire:** `CarWire.wc` (a uint32 on the schema's `Vehicle`) packs each wheel's travel from rest into a
  byte, so others' cars ride their bumps (`poseRemote`).
- **Checks, all passing:**
  - `e2e/car.spec.ts`, 3 of 3: driven out with a passenger and parked; a parked car knocked; under a flier.
    At first all three failed: the engine's revs were zeroed by the read-back, and the parked box was under
    the new car.
  - `e2e/pets-car.spec.ts` passes.
  - The world server's `cars.test.ts` and `pets-car.test.ts`: 7 of 7.
  - The world-server watcher restarted fine on every shared edit.
- **Not measured:** the frame cost in the world on High and Low, and the M1 on Low. Phase 10 (the checks)
  does those, with the `yutopia-car` chunk's budget.

## Phase 4 — built (2026-11-16): the work vehicles on Jolt; the old sim gone

- **Every kind drives on the same `Drive`:**
  - the **snowcat** on `TrackedVehicleController`, two tracks, turned by slowing a side;
  - the **snowmobile** with skis in front and a track behind, as wheels with their feet's grip;
  - the **plough truck** and the **tractor** (lugged rears);
  - the **toboggan:** no engine, pushed by the riders' feet to a walk.
  - The ski, track and runner grind on bare ground, so the snowmobile is slow on the roads, as plan 34 had it.
  - The 4x4's centre lock (K) and low range (J) set Jolt's diffs.
- **The tests (in `car.test.ts`, all passing):**
  - the snowmobile under 40 km/h on asphalt and over 100 through deep snow;
  - the snowcat at 25–45 km/h, and up a 50 % slope of deep snow where the saloon and the 4x4 aren't;
  - the plough truck over 75 km/h;
  - the tractor at 22–45 km/h on snow, through its gears;
  - the toboggan down a 15 % hill on its own, pushed at a walk on the flat.
- **The old sim is deleted:** `car/sim.ts`, 1,167 lines of integrator, tyres and 2D collisions.
  - What everything else read moved to `car/state.ts`: `CarState`, `createCar`, `settle`, `setEngine`,
    `mounts`, `readout`, the controls and helps types.
  - The karts keep their own sim.
  - `world.ts`'s `freeSpot`, `boxHits`, the pad and the plough cells stay: the server and the soft solids use
    them.

## Phase 11 — the candidates (2026-11-16)

Gathered while the user slept, **nothing wired into the game** (`world/car/sound.ts` is untouched: that's after the
picks). Every recording is CC0 on Freesound (no CC-BY needed, so nothing new in `sources.json`;
`public/sfx/CREDITS.md` notes the candidates, each kept sound gets its line once picked).

**The tools** (plan 79's way):
- `tools/sfx-cars-search.mjs` → `tools/sfx-cars.json`: 50 slots, each slot's searches (CC0, the most downloaded
  first, 4 s apart) with the recordings of car packs **pinned first**: the 190E pack's horn, door, boot and
  handbrake (Chippy569, the engine we already have), a Peugeot's doors and van door (Nox_Sound), an Elantra's
  switches, wipers, hazards, belt and handbrake (microman502), a Duster's boot, gearbox and handbrake
  (semenov_nick), a BMW's start and stop (GiocoSound).
- `tools/sfx-cars-engines.mjs` → `public/sfx/cars/engines/` + `engines.json`: **the engines, a set per car**, cut
  at each voice's five revs as `sound.ts` plays them (on load and off, by mic: exhaust, bay, cabin, far). The
  revs are read from the recording itself: YIN for the period, then of its multiples the one the spectrum is
  loudest at (an engine repeats every two turns, so YIN finds the cycle as often as the firing), a Viterbi path
  through them so the revs never jump an octave, a median of five. Checked on today's 190E loops: all eight
  within 1% of their measured revs. Each stretch's pitch is levelled along its own phase, so a loop has no wow.
  Held revs make the off-load points; a ramp's rising stretches the on-load ones.
- `tools/sfx-weather.mjs` (`LIST=tools/sfx-cars.json DIR=cars`; the cars' moment lengths `CAR_LEN`, their beds 8 s)
  cuts the rest into `public/sfx/cars/` + `manifest.json`.
- `tools/sfx-cars-mine.mjs`: **my picks**, put first (letter **a**) with `mine: 0` and a reason; `public/sfx/cars/picks.json`.

**The counts**: 50 slots, 149 candidates, 255 takes; 6 engine voices, 19 sets, 124 loops. **9.6 MB** in all (the
engines 2.0 MB) — pruned to the picks once they're made (`PICK=… node tools/sfx-weather.mjs`, the same for the
engines).

**My engine picks** (by what the cutter measured — revs and loads covered, mics, how steady, how sure — and by fit):

| Voice | For | My pick (a) | Others |
| --- | --- | --- | --- |
| four | saloon, estate, 4x4 petrol | the **190E-16V on a dyno** (today's): 17 loops, both loads, 3 mics | Peugeot 308 (a cabin mic), Ford Ranger, Elantra |
| revvy | hatch | a **70s Ford Cortina on a dyno**: a period four pulling | Mini Cooper S (contact mic), Renault Duster |
| v8 | pickup | a **1980 Chevrolet Impala**: the period, revs held at many points | hot-rod V8, F-350 + Crown Victoria |
| diesel-light | van, 4x4 diesel | a **BMW 120d**: idle to high, inside and out (off load only) | Ram 5.9 Cummins |
| diesel | snowcat, plough, tractor | **a tractor working at a landfill** | a truck, an engine-room diesel, the Cummins |
| two | snowmobile | a **Ski-Doo Skandik**: a working snowmobile | a snowmobile passing, a revved one |

**The rule for the other slots** (no ears, so evidence): a car pack's own recording of the very thing over a
search's; the title must say it's the slot's (a cartoon, a synth, a game sound, a locomotive, a bike kept out);
no clipping; how far it stands over its noise floor; its brightness (spectral centroid) against what the slot
wants (a horn mid, glass high, a thump low); a bed even; downloads a little. Each reason is by its name on the bench.

**Thin or not found** — the best of a poor lot is kept and marked "NOTHING FOUND FITS" on the bench:
`tick-cool` (an engine cooling), `gear-whine`, `limiter`, `ice-hiss`, `thump` (the suspension); `snow-slide` is
weak (a bike's tyre). For these the game can keep its made sounds (today's synth limiter, ice hiss, snow slide),
or I search wider / make them (as plan 79 made the shotgun's room) — **your call**. The single-candidate ones:
`limiter`, `snow-roll` (the Duster arriving on snow), `wind`, `hit-tree` (a heavy wooden door kicked), `thump`,
`runners`.

**The rev numbers are as read**: a set whose cylinders I guessed (the Ranger might be its V6; the truck and the
tractor's cylinders unknown) may sit an octave off on a sweep — it plays too low or too high for its revs. The
sweep shows it at once; tell me and I fix its count.

**On waking**: open **`/dev/car-sound`**:
1. **engines** (the tab at the bottom right): each set's ▶ sweep (idle → its top → idle, on load climbing, off
   falling), ▶ idle, ▶ drive-by, ▶ each loop; *outside* / *in the cabin*; ★ yours; "copy picks";
2. **everything else**: each slot's candidates (▶ its takes, a moment's takes one by one), ★ yours, ▶▶ a group in
   order; "copy picks";
3. back on engines, ▶▶ each body's moments (doors, belt, start, idle, rev, horn, stop) with your picks;
4. paste both "copy picks" to me: I prune to them, wire `sound.ts` and write the credits.



## The quality pass — built (2026-11-16)

Asked after the first stills: "quality models with a lot of details" — they read as clean blockouts.

**Textures** (`tools/art/cars/textures.py`, `texmap.py`, `link_tex.py`):
- Ours, made by code, **one copy shared by every car**: `public/life/cars/tex/*.ktx2`, 15 files, about 0.93 MB
  in all (normals in UASTC, text in UASTC, the rest ETC1S). Their PNG sources live in
  `yutopia-art-src/cars-tex`, not the repo:
  - the paint: metal flake and a soft orange peel in the normal, a roughness that varies;
  - the tyres: our own make, **NORDRIM VINTERGREP M+S 195/65 R15**, raised on the sidewalls, and the tread's
    blocks and sipes, on an atlas with its own UVs;
  - dash and plastic grain, the headlamps' square prisms, the tail lamps' ribs, the grille's mesh;
  - the windscreen's tinted sun band;
  - the number plate (white, a blue YUTOPIA band, **ESK 4E20**);
  - the cluster's printed face (fuel and temperature dials, warning lamps) round the VFD;
  - the switches' legends;
  - the police's and the taxi's liveries, and the TÁXI sign.
- The cabin wears **the life library's maps** (`../mat/<id>-albedo|normal|orm.ktx2`) by material name:
  - the seats: tweed, velvet, leather (vinyl as leather);
  - the carpet;
  - the headliner as linen;
  - walnut, the toboggan's pine, the soft top's twill.
- How a GLB carries them:
  - UVs in metres on every textured surface, `KHR_texture_transform` for each repeat;
  - no images inside the GLBs: URIs to the KTX2s, checked to exist by the budget test;
  - a car's materials and its slots are in `texmap.py`.
- **The game should cache textures by URI**, so all cars share one GPU copy (the integration pass).

**Detail** (`detail.py`, and in `dress.py`, `parts.py`):
- outside:
  - **dark panel gaps**: the faces of every cut wall, on the panel and round its opening, in a `gap`
    material;
  - door seals in each opening; handles in dark recesses; keyholes; washer jets;
  - springs on the wiper arms; a hinged fuel flap (`fuel_flap`); the exhaust's silencer, rubber hanger and
    bracket; a valance under the front bumper;
  - **a coil spring, damper and lower arm in every arch**, behind the discs and callipers;
  - the saloon's front indicators made compact (about 15 cm round the corner, the lamp's height);
- inside:
  - the cluster face with **fuel and temperature needles** (`needle_fuel`, `needle_temp` pivots);
  - eight switches with legends; door speakers; **seat belts** with anchors and buckles.

**The liveries** (F13b's roles), on every saloon. These are groups the game shows only for a car with the role:
- `livery_police_<door>`: white doors, **POLÍCIA · MUNICIPAL · YUTOPIA** in navy, our own star crest and a
  navy and gold stripe;
- `livery_taxi_<door>`: a black and white chequer band with **TÁXI** on the front doors;
- the roof parts: `extras/lightbar`, and `extras/taxisign` with its lit TÁXI faces.

The stills show them painted as plan 34 has them: a black police car, a yellow taxi.

**The mid level**: built again by the same generators, not decimated:
- the loft about 3.5× coarser and its sections half the points; turned parts half the segments;
- bevels one segment; no window rubbers, ribs, flutes, pleats, badges, engine or switches;
- an eight-point tyre and a one-dish wheel;
- 12.2–18.0k triangles, about 0.33–0.46 MB.

**The work vehicles**: a cab inside each (dash, printed cluster with needles, switch row, mat, door cards and
pulls); plus:

| Vehicle | Added |
| --- | --- |
| Plough truck | its blade's hydraulics (lift ram, two angle rams, hoses, A-frame), marker lamps, wipers |
| Snowcat | cleats on every track pad, a roof rack and a rear ladder, wipers |
| Tractor | head, injector lines, starter, air cleaner and its pre-cleaner bowl, battery box, front weights, steps and handrails, levers |
| Snowmobile | cowl vents and stripe, the headlight's bezel, the windshield's trim and bolts, the handlebar's pad, levers, switch pods and gauge, seat pleats, bumper and grab handle |
| Toboggan | its bolts, the curl's brace, the pine grain from the library |

**Before → after** (near triangles / MB; mid triangles):

| | First build | Quality pass |
| --- | --- | --- |
| Saloon base · GL · S | 70.0k, 71.9k, 75.8k / ~1.0 MB | 81.7k, 83.6k, 87.6k / 1.46–1.52 MB |
| Road cars, all | 56–76k / 0.84–1.09 MB; mid 13–15k decimated | 65.6–87.6k / 1.23–1.52 MB; mid 12.2–18.0k generated |
| Shuttle | 86.6k / 1.07 MB | 89.9k (four seat rows) / 1.52 MB; mid 19.4k |
| Snowmobile, snowcat, plough truck, tractor | 5.9k, 18.9k, 40.9k, 27.2k | 8.8k, 22.2k, 42.8k, 29.4k |
| Shared textures | none | 15 KTX2, ~0.93 MB, once for every car |

The budget test: near ≤ 1.6 MB and ≤ 90k; mid ≤ 0.6 MB and ≤ 18k (the shuttle 22k); every texture URI must
exist. 64 tests green.

**Fixed on the way:**
- the contact sheets came out black: the shell didn't split the names;
- **every panel's paint was in the root's frame under its pivot**, so it drew doubled in the game (found by the
  integration pass). The meshes with dent morphs were moved without their shape keys; now they move with them;
- the panel-gap test darkened a band down the panel van's and the utility estate's sides;
- the hatches' rear plates were buried in the tail; the plates now sit on the skin by a ray.

**Stills to look at**:
- `design/cars/0-saloon.png`: day, rear, night, cabin, engine, doors;
- `0-roles.png`: the police car and the taxi;
- `0-road.png`, `0-road-rear.png`, `0-work.png`;
- close up: `saloon-base-cabin.png` (the cluster, the switches, the belt) and `saloon-base-day.png` (the
  tyres' lettering, the plate, the gaps).

## Phases 5, 6, 8 — in the game (2026-11-16)

The Blender cars are the game's now. Every car code-drawn before (`tp/car/sedan.ts`, `kit.ts`, `tracked.ts`,
`work.ts`, `textures.ts`, `tp/vehicles3d.ts`, about 4,900 lines) is deleted.

### A car's model: `tp/car/glb.ts`
- **One `CarModel` for every vehicle** (`buildCar`), keeping plan 28's interface (`tp/car/model.ts`, the
  old `Sedan` by its new name), so the rig, the cameras, the seats, the dash, the windscreen's snow, the
  doors, the lamps and the mirror needed no change.
  - It's made **at once from the manifest**: its doors, wheels (steer, spin), steering wheel and wipers are
    groups at their pivots, there for the rig to turn.
  - Its geometry **comes a moment later** (`ready`, `loaded`) and is moved into those groups.
  - The file sits in the model turned half round: glTF's x ahead and z right become the model's nose −x and
    +z left.
- **The files**: one `AssetQueue` per renderer. Each file is loaded once (KTX2 and meshopt through
  `life-assets.ts`) and held while any car shows it; once nothing does, it's let go oldest-first past
  48 MB. Every car of a variant shares its geometry and its plain materials.
- **A car's own materials**:
  - **its paint**: its colour; the road's grime up its sides and the snow on it (`paintWear`, from the
    old `wearable`); its **dents as the file's morphs** (`dent_front/rear/left/right`);
  - its second colour (`paint2`, two-tone);
  - **the police's white doors** and its liveries (`livery_police_*`, `livery_taxi_*`, shown by role);
  - **its lamps** (head, tail, brake, reverse, each indicator, the light bar's red and blue, a work
    vehicle's beacon);
  - **its dash**: the VFD cluster drawn on the `screen` plane, the fuel and temperature needles turned;
  - its plate, with its own text.
- **The cabin's cloth and wood**: walnut, carpet, leather, tweed and velvet, wherever the file has no
  texture of its own, are the life library's (`libMaterial`, its maps).
- **Worked out from the file**:
  - **the windscreen** from its glass, giving the snow's and the rain's pane (and its size for their
    pictures);
  - **the wipers' fans**: which way each one lies, how long it is;
  - **the steering wheel's rim** (the driver's hands);
  - **the inside mirror** under the windscreen's top, and **a pine tree hung under it**.
- **Wheels and extras** (F10b and F13b's parts):
  - **wheels**: another style's wheel goes on each spin, sized to the car's tyre and mirrored on the
    right, the brake discs kept;
  - **extras** on their sockets: the roof's rack and ski box; the bull bar; the spot lamps both sides;
    mud flaps behind each wheel; chains on the tyres; the police's light bar; the taxi's sign.
- **Three levels**:
  - **near** (the whole car);
  - **mid** (a parked car round you);
  - **far** (`buildFar`: one outline a body, in its paint), its files fetched as the cars' chunk comes in
    (`preloadCars`).

### The seeded fleet: `shared/car/look.ts`
- **`CarLook`**: `{ variant, colour, colour2?, extras, wheels }`.
- **`lookFor(id, kind, props)`**: the chosen `props.look` (checked by `validLook`), or **seeded from the id**
  (`seededLook`). The seed:
  - takes the colour the server already knows the car by (`props.variant`, the lot's nine), so parked and
    driven agree;
  - gives each role and home its variant:
    - the town's wagons → estates;
    - the police → a saloon GL in black with white doors;
    - the taxis → yellow saloons;
    - the rental → a saloon;
    - the farm's pickup → the flatbed;
    - the boathouse 4x4 → the Trek;
  - otherwise base half the time, GL and the third the rest;
  - adds a few extras (flaps, a rack or ski box, a bull bar, spots, now and then chains);
  - gives wheels as made three times in four;
  - adds a second colour on some of the two-tone ones.
- **`variantSpec(kind, variant)`**: the kind's numbers in the variant's shape (its wheelbase, CoG, track,
  wheels and box, as its model has them). My car is made on it (`createCar`), so the Jolt car stands where
  its picture does: the long 4x4 on its long wheelbase, the crew cab on its own.
- **Three new kinds** (`specs.ts`):
  - **estate**: the saloon's chassis, 1,340 kg;
  - **hatch**: 920 kg, a revvy 1.6 L four to 7,000, **front-driven**;
  - **van**: 1,480 kg, a 2.0 L four, front-driven, **eight seats** (the minibus's three rows; in the panel
    van the back ones sit in its load space).
- **Front-wheel drive is new in `drive.ts`**: the front diff, TCS on the fronts.
- `CAR_BODY`, `SEATS_OF` and the voices have the three.
- **The server takes up to eight seats** (`features/cars.ts`: a car's seats sized by its kind).
- **Seats**: where the model has fewer than its kind (a pickup's bed, the panel van's back), the kind's
  `SEATS_OF` places are used (`pad`). **Doors open by seat** (`doorOf`): the nearest door on their side,
  the van's slide for its back rows, the 4x4's fronts for its back seats.

### In the world
- `cars.ts`:
  - parked cars are **near within 14 m, mid within 70 m, far past that**, with a few metres more to go back
    than to come;
  - one model made a frame;
  - the old model shows until the new one is in;
  - each made a still model once in (`stillModel`: its static parts merged; its paint, with its morphs,
    left as it is).
- Driven cars are near.
- The hood camera's eye is the model's own (`hood`).
- **The Grounds' own vehicles** (`tp/parts/vehicles.ts`): the shuttle (`shuttle-bus`), the plough (the
  plough truck) and the visitor's car (a saloon GL in one of six colours). Their GLB is fetched the first
  time one is out. Their wheels turn as they go, their lamps light by the night and the fog, the plough's
  beacon turns, their tail patch is the model's, and their head lamps feed `cars.ts`'s real lights.
- **`/dev/car`**: any variant (`?car=hatch&v=hatch-hot`, or the buttons), the Jolt car made on its
  variant's numbers.
- **`/dev/cars`, the sheet**:
  - every variant and work vehicle, near, mid or far;
  - paint and second colour, the role's livery, extras, wheels;
  - the doors, the bonnet and boot (or the van's back doors), dents;
  - night with its lamps;
  - URL presets: `?v=van-camper&doors=1&lids=1&night=1&role=police&x=roofrack,flaps&level=mid`.
- **The stills** (`tp/car/stage.ts`, `grounds-shots.ts`) build the Blender cars and wait for them.

### Checks
- Typecheck clean (client, shared, world server).
- The shared car tests: 33/33, and **`car/look.test.ts`** (new, 4/4):
  - every seeded look valid and the same twice;
  - the home cars' variants;
  - chosen looks kept or refused;
  - each variant's numbers inside its box.
- The world server's `cars.test` and `pets-car.test`: 7/7.
- `seatfit`, `life-budget` and `playback`: 72/72.
- **e2e, on the GPU**:
  - `car.spec`: 3/3. The flier test failed once on its first run: Ana was on floor 4 when it began, so its
    teleport hadn't taken. It passed alone on the rerun.
  - `pets-car.spec`: 1/1.
  - `life-vehicles.mts`: the shuttle and the visitor's car drawn.
- **Stills in the world**, in `design/cars/`:
  - `ingame-lot.png` and `ingame-lot-wide.png`: the lot's cars, saloons and estates in their colours, a
    roof box;
  - `ingame-town-night.png`;
  - `ingame-visitor.png`: the saloon GL, its bonnet frosted;
  - `ingame-shuttle.png`.
- **Two faults in the files, found here and fixed by the art track tonight**:
  - **the panels' paint (the meshes with the dent morphs) was in the car's frame, not its hinge's**: the
    doors drew out to the sides, the boot behind (`Mesh.transform` without `shape_keys=True`);
  - **the estate's red tail-lamp lens ran the length of the car**: red sheets lit across its tailgate at
    night.
- **Budgets** (a prod build, `tools/budget.mjs`):
  - the `yutopia-car` chunk is **30.3 of 120 KB gzip**: the drawn models are gone;
  - the Blender cars' loader (`glb.ts`) is a chunk of its own, **14.9 KB**, shared by the cars and the
    Grounds' vehicles;
  - **the world page measures 487.2 KB against its 481** and `yutopia-steps` 14.8 against 10. Neither is
    the cars': no car code is on the page, only the asset table's new entries for `life/cars/`. Left for the
    checks phase to find, by bisecting HEAD.
- **Fixed in the game's own code on the way**:
  - a frame before the manifest was in tried to build a car and failed;
  - a far outline asked for then never came, so parked cars past 70 m vanished;
  - a parked car gone far now keeps its model till its outline is in.

### Left / to look at on waking
- **On `/dev/cars`**: the saloon, the police car at night, the camper with its doors open, the Trek with its
  bull bar, spots and rack.
- **Left as they were**: the old flat car outlines in `tp/campus.ts` (`carGeometry`) for the scenery cars
  that were never objects (the classic campus lot drawn when not walkable, a lot in `grounds3d.ts`, the
  campus's visitor). They're outside the cars.
- **The radio's window**: the Blender cabin has no part for it, so `setRadio` draws nothing; the station
  plays as before.
- **The tracks don't animate**: the snowcat's and snowmobile's belts stand still, though their rollers turn
  with the wheels.

## Phase 7 — built (2026-11-16): your car's look

**Buying.** MOTORS' panel (`components/hud/DealerPanel.tsx`) now sells the three new bodies too: estate,
hatch, van (`BUYABLE`, and the admins' Spawn copy). For the vehicle you pick:
- **Version**: its body's three, as tabs. Changing it keeps what still fits (`lookTo`): the paint, the
  extras that fit, the wheels if allowed.
- **Colour**: the period palette's 16.
- **Second colour**: where the version has a line for one, or none.
- **Extras**: toggles for those that fit.
- **Wheels**: the styles it may have.
- **Plate**.

**The stand.** The car you're choosing turns on a turntable as it'll be in the world (`tp/car/stand.ts`):
- It has its own small renderer on the panel's canvas, drawn 30 times a second while the panel is open
  and visible. Nothing is read back from the world's GPU.
- Closing the panel lets go of everything it loaded: `forgetRenderer` in `glb.ts` and
  `AssetQueue.drain()`, with a test.
- `car:buy` carries the look. The server checks it with `buyLook`: a version of the kind's own body,
  palette colours only, a second colour only where there's a line for it, extras that fit, allowed
  wheels. Anything else is refused ("MOTORS can't do that one").
- It's saved as `props.look`, with `props.variant` set to the nearest of the lot's nine for the
  thumbnails and the wire.

**Repaint.** Your own car, parked at home — your bay of the lot, or MOTORS' forecourt (shared
`carAtHome`, used by both the server and the client).
- By it, the prompt reads "Drive · hold: repaint". Hold Use (350 ms) to open the same panel without the
  vehicle list or the plate; "Repaint" sends `car:look`.
- The server allows only the owner, only a parked car nobody's in, only at home; free for now.
- Everyone's world remakes the car from the new look, because the parked model's key is its look.
- The variant's numbers come with it: the next time it's driven, `variantSpec` reads them from the look.

**Tests.**
- Shared `look.test.ts`: 7 pass, among them MOTORS' variants per kind, `buyLook`'s refusals,
  `lookTo`, `nearestColour`.
- World server `spot.test.ts`: 5 pass, among them buying with a look, the refusal, another person's
  Repaint refused, the owner's taken and seen by the other, a colour off the palette refused.
  `cars.test.ts` also passes.
- `life-assets.test.ts`: 7 pass, `drain` among them. The admin cars copy test passes.
- **e2e `car-look.spec.ts`** passes on the GPU in 1.8 min:
  - Ana picks the hot hatch, navy, spot lamps, sport wheels; the stand draws; she takes it.
  - Bia, in her own browser, has the same look in her room's object and in the model her world made.
  - Ana, by it on the forecourt: the prompt offers Repaint; held, she picks the GL in signal red.
  - Bia sees the GL: the spot lamps dropped, because they don't fit a GL; the sport wheels kept.

**What to try on waking.**
- At MOTORS, open the panel, flip through the versions, colours, extras and wheels, and watch the stand.
- Take one. Then by it on the forecourt, hold Use (E, or the pad's A held): Repaint.
- Note: the list's small thumbnails are still the old item pictures (a sedan whatever the kind). The
  stand is the real car.

## Phase 9 — built (2026-11-16): damage, effects, the camera, the leftovers

### Damage (F6a): `shared/car/damage.ts`
- **Five zones** now, the roof the fifth (a roll: knocks on the ground while it's past ~70° over); each presses
  the model's own `dent_*` morph in.
- **Parts, a bit each** (`PART`), broken by the knocks that pass their mark (`knock(d, zone, k, across)`: where
  across the front or along a side it was struck):
  - the front bumper **hanging** (from 0.3 at the front: turned down about its right end, its left on the
    road), then **gone** (0.62, or 0.45 hit hard) — it falls off as a thing on the road
    (`fx.ts Debris`: a Jolt crate where there's a world, tumbling as it goes, gone after 45 s; six at most);
  - a **mirror folded** back (a side's knock toward its front);
  - a **lamp out** (the head or tail lamp on the side struck, both past 0.7): its own light off — the files'
    lamps split by side as they load (`splitLamps`) — and its real spot light out, a little glass thrown;
  - the **windscreen cracked** (a front past 0.5, the roof past 0.3), then badly (two more stars) — a crack
    pane over the glass, as the snow's;
  - a side's **windows shattered** (0.6, or 0.4 hard): its doors' glass gone, glass on the snow.
- **Felt a little**: a front past half **pulls the steering** toward the side that took more (up to 0.07 of
  the input); a front past 0.6 dims both lamps to 45%; **steam** from under the bonnet past 0.8.
- **Never wrecked**; mended as wear always was — at its home, on a tow, by `mod:cars` (the props' `dmg` gone).
- **On the wire**: the same `props.dmg` / `Vehicle.dmg` string, now `"f,r,l,r[,roof][|parts]"` — the old four
  still read and write the same; the server merges it (`mergeDamage`: a zone never less, not more than half
  at once; a part once broken stays). `car:wear` takes `parts`. Others see a bumper newly gone fall, a lamp
  newly broken throw its glass — not what was broken before they came.
- **Tests**: `shared/car/damage.test.ts` (3: the old string, the merge, what each knock breaks) and the world
  server's `cars.test` (the roof and the parts kept, never mended by the driver): 7/7.

### The effects (`world/car/fx.ts`)
- **`Smoke`** (one draw, ~260 puffs, sized and faded per puff; a puff at the camera fades so a chase camera in
  a burnout's cloud still sees): **tyre smoke** off the asphalt, the walk, rock and earth by how fast a tyre
  slides (a drift, a burnout, a lock-up); a **rooster tail of powder** off the snow; **steam** from a smashed
  front.
- **`Sparks`** (one draw, additive, white-hot to red as they fall): where the car strikes something hard
  above ~11 km/h, and **as it scrapes** — four short rays out of its corners against walls, posts and trunks a
  few times a second above ~13 km/h; on its roof, sliding, under it.
- **The exhaust shows the revs**: puffs quicker, bigger and pushed further out as the engine's worked.
- Kept: the tracks, the spray, the slush and black ice, the windscreen's snow.

### The camera and the readout
- **The chase camera** (`tp/car/camera.ts`): lower and closer (5.6 m back, 1.6 m up, plan 28's 6.4/2.0); the
  FOV 62 → 76 with speed; it **looks into a drift** (55% toward where the car's going, not 35%); **a landing
  dips it** by how long it flew and how hard it came down, sprung back; a hit shakes it harder.
- **The readout outside the cockpit**: a small walnut-framed window (the HUD's `.cabinet`, `.vfd-window`, the
  dash's amber): the speed, km/h, the gear in its own box, the tank. In the cockpit it's the dash's.

### The leftovers from the models' pass
- **The Jolt hull is the model's own** convex collider (`collider` → the manifest's `hull`, ~30 points a road
  car, 40–160 a work vehicle; `physics/car.ts hullShape`, its centre of mass moved to the car's), for my car
  and for others' pulled cars; the box where a file has none.
- **Textures shared on the GPU**: every GLB's copy of a texture takes the first's `source` by its URI (three
  uploads by source), so the 15 car textures and the library's maps are on the GPU once, whatever the cars.
- **The radio's window**: a `radio_screen` canvas in every road car's deck (the build: `dress.py`), drawn as
  the old cabin's was — the band, the station.
- **The windscreen found again**: the quality pass named its material `glass_ws`, and the game looked for
  `glass` — no snow pane, no rain, no wipers' fans on it since; both names now.
- **The estates' tail lamps**: fixed by the art track before this phase.
- **Not done**:
  - **the tracks' belts** still stand (their rollers turn): moving the lugs round the belt needs the belt's
    outline in the manifest and a vertex shader — a job of its own;
  - **the old outline cars** (`campus.ts`, `grounds3d.ts` `carGeometry`) are built into merged scenery
    geometry at load, synchronously: the Blender cars would have to come in async per car. Left as they are.
- **The cockpit**: each road body's driver's eye and the wheel turned right checked on stills
  (`design/cars/cockpit-*.png`).

### On `/dev/car` and `/dev/cars`
- **`/dev/car` counts damage as the game does**: knocks dent it and break its parts, a bad front pulls the
  wheel and dims a lamp, smoke off a sliding tyre, powder off the snow, steam, sparks where it strikes. **M
  mends it**; a reset (T) keeps it.
- **`/dev/cars`**: a **broken** row, a box a part (`?broken=bumperHang,headL,screen&dent=0.7`), and the roof's
  dent with the others.

### Checks
- Typecheck clean (client, shared, world server); biome clean on the files touched.
- Shared: `car.test` + `car/*.test` **45/45** (`damage.test` new). World server (`YUTOPIA_WEATHER=winter`):
  `cars.test` + `pets-car.test` **7/7**. `life-budget` **64/64** after the rebuild (the hulls, the radio
  window: +12 triangles a road car).
- e2e on the GPU: `car.spec` **3/3**, `pets-car.spec` **1/1**.
- `e2e/car-fx.mts` (new): drives `/dev/car` — a drift on the asphalt, a burnout, the posts at night, three
  runs at one post; then the cockpits and the damaged cars on the sheet. Frame times there: **61 fps with
  the smoke, the sparks and the damage as without** (vsync; worst frame 18–25 ms either way), +2 draws (the
  smoke, the sparks). `/dev/car` has no graphics tiers, so High and Low weren't told apart. In the world
  that's phase 10's check.
- **Stills** in `design/cars/`:
  - `fx-drift.png`, `fx-drift-2.png`: tyre smoke off a drift on the runway;
  - `fx-burnout.png`;
  - `fx-crash--230.png`: the saloon into a post at night;
  - `fx-damaged-day.png` (the saloon GL: the bumper hanging, the windscreen cracked, the left lamp out,
    its mirror folded, its left windows gone, dented) and `fx-damaged-day-2.png` (the hot hatch: the
    bumper gone, a bad windscreen, the right side's glass gone);
  - `cockpit-*.png`: each body's driver's eye, the wheel turned right.
- **Not seen on a still**: the sparks (a burst lasts a third of a second; the bench's runs end in the car's
  own shadow), and the scraping and the debris in the world (only `cars.ts` has them — the bench has no
  Jolt things). The wheel spinning against a post on the snow still throws a thick cloud of powder in the
  headlamps (`fx-sparks-*.png`), thinner since.

### To look at on waking
- `/dev/car`: drive into the posts beside the runway (x 24) and the wall at the south end; drift on the
  runway; M to mend.
- `/dev/cars?v=saloon-gl&dent=0.7&broken=bumperHang,headL,mirrorL,sideL,screen&yaw=-2.4`.

## Phase 11 — wired (2026-11-16)

The cars play the recordings now, **my picks** (every slot's and engine's "a") until the user's own replace them.
Nothing in code names a recording: the game reads the bench's files at run time.

**How a pick reaches the game** (`world/car/sound-bank.ts`):
- `public/sfx/cars/chosen.json` = `{"slots": {…}, "engines": {…}, "synth": […]}`. A slot's value is the bench's
  own "copy picks" value: a candidate (its takes gone round in turn) or `[candidate, take]` (that take alone); an
  engine voice's is its set. Missing: 0, my pick.
- `synth`: the slots the game makes itself because nothing recorded fitted — `tick-cool`, `gear-whine`,
  `limiter`, `ice-hiss`, `thump`. Take a name out of the list and its picked recording plays instead.
- It's resolved through `manifest.json` (each slot's candidates and takes) and `engines.json` (each voice's sets
  and loops) — the same files the bench plays. Only what a car needs is fetched, when it's first heard (its
  voice's loops, its kind's doors and horn, the shared tyres and knocks; the siren the first time it's on);
  nothing is in the `yutopia-car` chunk (30.0 KB gzip, was 30.3).

**On waking** — to change any sound, no code:
1. open `/dev/car-sound`; listen; ★ the ones you want, in both tabs (engines, everything else);
2. press **copy chosen.json** (bottom right, by the tabs): both tabs' ★ as the whole file;
3. paste it over `apps/client/public/sfx/cars/chosen.json`; reload the game.
(Each tab's own "copy picks" still gives just its half — `slots` or `engines` — for the tools' `PICK` when the
candidates are pruned to the picks.)

**Who sounds like what** (`voiceOf`, `hornSlot`, `doorSlots`, `kindBeds`):

| | Engine | Horn | Doors | Its own |
| --- | --- | --- | --- | --- |
| Saloon, estate | the four (the 190E) | saloon | open · shut | |
| Hatch | revvy (the Cortina) | small | open · shut | |
| 4x4 | the four; the expedition: diesel-light (the 120d) | saloon | open · shut | |
| Van | the four; the panel van: diesel-light | truck | the slider | |
| Pickup | the V8 (the Impala) | truck | open · the truck's | |
| Snowmobile | the two-stroke (the Skandik) | small | — | runners |
| Snowcat, plough truck, tractor | the diesel (the landfill tractor) | truck | open · the truck's | tracks · the blade + reversing beep |
| Toboggan | none (it has no sound object: still silent) | | | |

**What plays** (`world/car/sound.ts`):
- **The engine**: the voice's set, each mic's loops crossfaded on log revs, pitched by revs over their own
  (0.3–2.2×), on and off load by the throttle (a set with one load lends it to the other), levels by where the
  loop sits in the voice's range (the old 190E levels). Mics: outside the exhaust (the bay too within 20 m), the
  far mic taking over from 25 to 75 m where the set has one; inside the cabin mic (the BMW's), else the exhaust
  and the bay through a 2.4 kHz firewall as before. The synth only till the loops are in, and the limiter's
  stutter (on the recordings too).
- **Starting**: the picked starter (four, V8, diesel, two-stroke; the set's own if none), the loops coming in under
  its end; a short take (the V8's catch) plays as the synth's crank ends. The driver's **belt** clicks first.
  Getting out of the driver's seat: the **stop**, then the engine ticking as it cools (made), heard after the
  car's sound is gone.
- **Layers**: the intake under throttle; the shift (inside); one take of the backfires on a lift over 3,800 rpm;
  the gearbox's whine in first, second and reverse (made).
- **Tyres**: the road under them (louder inside), a long skid and a squeal take as it starts on asphalt, snow
  rolling and sliding, gravel on grass/earth/rock, slush on slush/wet/mud and a splash entering it, ice's hiss
  (made); the wind with speed. Each synth tyre sound stands in till its recording's in.
- **Body**: knocks by what was hit — a trunk, a post or fence, a snowbank, else metal by force (light < 0.25,
  mid < 0.6, heavy) — a person or a pet only a soft thud; a landing the suspension's thump (made); a scrape loop
  while the sparks scrape (kept up by each burst, falling off between); the hanging bumper's rattle with speed;
  glass when a lamp, the windscreen or a side gives; the bumper hitting the road.
- **Parts**: doors by kind, the handbrake's ratchet as it's pulled, the indicator's relay (a loop while
  indicating), the wiper motor (by speed setting), the horn (the blast's middle looped while held), the police
  siren recorded. `lid("boot"|"bonnet")` is there; nothing in the game opens them yet.
- **In space**: a `PannerNode` per car placed from the camera (HRTF within 30 m, equal-power past), heard to
  **120 m** (was 70), its level `(1 − (d−6)/114)^1.7` and its top falling (18 kHz·e^(−d/40), not under 900 Hz);
  in the cockpit no panner, the outside through the 1.1 kHz glass and the cabin's own sounds (indicator, shift,
  belt, handbrake, whine) straight in. The same effects bus as before; the engine loops are cut to the old
  loops' loudness (−20.4 dB mean), so the mix against steps and voices holds.

**Checks**: client typecheck clean; biome clean on `sound.ts`, `sound-bank.ts`, `cars.ts`, `sandbox.ts`,
`car-sound/page.tsx`. `/dev/car` in the browser: the hatch fetched the revvy set and the saloon's doors, the
panel van the diesel-light set (exhaust + cabin mics, its start) and the slider — no new console errors.
`car.spec` 3 of 3 pass (3.7 min). Prod build: `yutopia-car` 30.0 of 120 KB. (The world page's 487.3 of 481 and `yutopia-steps` 14.8 of 10 were
over before this phase — phase 10's to bisect.)

**Credits**: every pick is CC0 — nothing new in `sources.json`. `public/sfx/CREDITS.md` gets each kept sound's
line when the candidates are pruned to the user's picks.

**Left**: not heard by anyone yet (no ears here) — the levels are reasoned, not listened to; the toboggan stays
silent; boot/bonnet sounds wait for something that opens them; remote cars' handbrake, scrape and indicator
aren't on the wire (their doors, horn, siren, wipers, rattle, knocks of their own aren't either — only what
their state sends).

## Phase 10 — checks (2026-11-16)

Run last, over everything above (the sounds wired), on this machine (M4); "HEAD" is 5658892e built the same way
in a worktree, beside it.

**The gates**
- `pnpm -r typecheck` clean. `pnpm lint`: ours clean (the cars' `manifest.json` and `chosen.json` formatted); the 9
  errors left are older files', untouched here.
- Unit tests: shared **685/685**, client **420/420**. World server (`YUTOPIA_WEATHER=winter`): the car files
  (`cars`, `pets-car`, `spot`) **12/12**; the whole suite 220/228 — the 8 reds none of ours: `pets-attack` ×2,
  `rooms` the phone, `survival` the loot and the admin's give, `world` back after a reload are **red at HEAD the
  same**; the Daybreak, Vortex and stairs failed only in the all-files run and pass in their own files, and
  ping-pong (red once in `rooms`) passes alone — flaky.
- `pnpm physics` (MINUTES=5): the cars' lines ok — a drive deterministic (`5998757d`, 0.12 ms a frame), 400 cars
  made and dropped leave Jolt's heap flat (0.009 MB); behaviour 8/8; both soaks flat. **Three hash lines fail**
  (players `74fe631a`, area `96df0ac4`, full `655ac639`): pure Jolt on the bench's own scenes, nothing of plan 92
  in them — the Jolt build they run was committed on 11-15 (before this plan) without its hashes recorded again.
  Left: record them (RESULTS.md, `check.mjs`) or find what that build changed.

**Budgets** (`tools/budget.mjs`, fresh prod builds): HEAD's page was already **487.1** of 481 (plans 87–91, not
traced) and `yutopia-steps` 14.7 of 10. Plan 92 adds 0.2 to the page (the asset table's `life/cars` entries) →
487.3, steps 14.8; both raised (488, 15), measured and noted, by the standing call. `yutopia-car` 30.2 of 120;
`yutopia-grounds` **152.1 → 86.7** (the code-drawn cars gone).

**The e2e near cars** (one at a time, the GPU): `car.spec` 3/3 (twice, the second after this phase's fixes),
`pets-car.spec` 1/1, `car-look.spec` 1/1, `spot.spec` 4/4, `slotcar.spec` 1/1; `life-vehicles.mts` draws the
shuttle from its file; `car-fx.mts` 61 fps through the drift, the burnout, the posts and the crash (worst 19 ms);
`kart-drive.mts` (karts untouched) 61 fps warm, worst 32 ms (its first run's 200/263 ms were `next dev` compiling).

**Frames** (`e2e/weight.mts frames`, a prod build, uncapped; High at 2×, Low with the CPU slowed 2.5× — the
friends' M1; a `town` spot added: Main Street, its parked cars both sides). Runs apart move by tens of percent
(the world's draws differ by where the camera lands), so the cars' own cost is read **in the same page**, the
`cars` group hidden and shown (AB):

| Low, the town, walking | cars on | cars off | the cars' cost |
| --- | --- | --- | --- |
| HEAD | 52.1 fps | 51.2 | none |
| plan 92, as built | 33.5 | 43.3 | **−22.6%** |
| plan 92, after the fixes below | 52.3 | 53.0 | −1.3% |

High in the town: the cars −0.2% (HEAD −4.8%). Runs on their own after the fixes: Low town 65.6 fps (HEAD 45.8),
High town 66 (HEAD 54) — the new cars are lighter than the old ones once merged.

**Found and fixed here**
- **A parked car was ~113 draws** (a saloon GL in the town on Low): `mergeStill` merges only pieces at the model's
  origin and never one with morphs — and every Blender panel carries the five dents, every door, wheel, bonnet
  hangs under its pivot. Now a parked car's mid model is baked (`GlbCar.bakeStill`, `tp/car/glb.ts`): its dents
  pressed into its own copies of the panels as they stand, every piece merged in the car's frame one mesh per
  material (its glass and lenses too: a car's own see-through pieces blend among themselves — `mergeWith`'s
  `seeThrough`); the paint's wear reads the car's frame (`uCarInv`), so the pieces moved into it read the same. Its
  dents changed (knocked where it stands): made again, the old shown till the new is in. ~113 → ~50 meshes a car.
- **Near models churned**: every car within 14 m got its whole model (80k triangles, its cabin), so walking a
  row of parked cars made one a car, and driving by them linked their cabins' materials — 200–760 ms frames in 3
  of 8 drives on High. Now: near within 8 m on Low and Lowest (14 m above), **none while I drive faster than
  4 m/s**; a near model isn't merged (a car or two; merging one is itself a long frame).
- **Each parked car's look worked out every frame** (`lookFor`, its key's `JSON.stringify`): kept by its props.
- **The land ahead made two chunks a call** (~2 × 100 ms on the slowed CPU): one now — still three in the 0.6 s a
  chunk under the car must be in by.

**Driving** (`e2e/car-town-drive.mts`: Ana in Main Street's first town car, flat out west ~12 s, ~90 km/h,
~170 m; a prod build): **High: no frame over 50 ms** in the last runs (before the fixes: 200–760 ms stalls).
**Low, slowed 2.5×: 6–11 frames of 56–85 ms a drive, one of 201** — the profile (`PROF=1` on `next dev`) says
it's the land ahead: `drivingAt` → `groundChunk` → `landOf` → `groundsChunk` → `makeChunk` (`terrainAt`,
`nearLines`), ~90–120 ms a chunk on the main thread. Not new — the old car read its heights through the same
cache, made the same way — but a car at speed makes a chunk every second or so. **Left**: the heights made in a
worker (the view's land is: plan 91), the main thread only laying them into Jolt.

**Memory** (`weight.mts memory`, Low, the lot and the town twice, then collected): JS heap **516 MB** (HEAD 482:
+34 — the cars' files kept parsed, one per variant near), the renderer's RSS 1,504 (HEAD 1,343), the GPU process
990 (HEAD 984); the scene's geometry 195 MB (HEAD 222).

**Stills** (`design/cars/check-*.png`): the town by day and at night; the cockpit, the hood and the chase at dusk
in snow (wipers, falling snow, the beams); the hood at night. Looked at: the cars sit right, the parked ones
merged look as before (wheels, doors, plates, lamps where they were).

**Left (seen, not fixed)**
- the land ahead made on the main thread (above);
- the physics bench's three hashes (above);
- ~~in the cockpit still the amber VFD isn't seen lit behind the wheel~~ (fixed in the polish pass below);
- ~~the readout says N while coasting at 11–15 km/h~~ (fixed below);
- ~~the walnut readout sits under the "Down" banner when the dark takes you in a car~~ (fixed below);
- ~~once, in the drive probe, the car read 523 m away with a top speed of 4 km/h — the same car driven run after
  run, towed home between; not seen again in seven runs~~ (the probe's, below).

**The polish pass (2026-11-16, after the checks)** — the cockpit and the small things left above:
- **The hands were on the hub.** `glb.ts` took the steering wheel's grip radius as 0.47 × `boxOf`'s span — but the
  span is already a radius (the pivot to the rim's farthest point), so it fell to the 0.12 m clamp and the driver's
  wrists sat ±0.11 m from the hub. Now 0.9 × the span (0.13–0.21 m): the hands on the rim at ten to two, the amber
  cluster seen lit between them (it was there all along, behind the hands and under the key hints).
- **The cockpit's framing.** The file's eye is right — the seated body's head bone is 0.1 m behind it (measured in
  the world) — so it stays; moving it back put the camera behind the head, the arms filling the picture. The cockpit
  is framed by each body's own cluster instead (`camera.ts`, the model's new `clusterAt`): it looks down until the
  cluster sits ~17° under the picture's middle (6°–21° down; the hood stays at its 7°) — the road over the dash in
  the top two thirds, the wheel's top and the cluster above the key hints. The tall 4x4 is at the limit: its cluster
  still low in the picture.
- **The A-pillar "wood".** The shell's inside faces were the paint (the car's brown, in the town car), facing the
  cabin. The paint's shader now gives any of its faces turned toward the cabin's middle above the sills (or their
  backs) a dark trim colour, rough: the pillars, the roof's inside, the door frames.
- **The "slab" over the bonnet** in the dusk still was the Kart Park's gate down Main Street, seen through my own
  beams' glare in the snow. **The glare**: my own car's air beams, seen end on from the cockpit or the hood, stacked
  into a white wall; from inside they're at 0.3 of their opacity (others see them as before).
- **N while coasting**: Jolt's automatic box drops to neutral off the throttle; `drive.ts` keeps the last gear while
  it rolls (not in manual, not stopped), so the readout, the dash and the gearbox whine say the gear it's in.
- **The readout under "Down"**: down in a car, the car's hints and readout are hidden (the dark's banner and its
  first aid own that spot).
- **The 523 m "jump"** was the probe: the car's entry missing from the room's state when the drive started, read as
  (0, 0) — hypot(335, −400) ≈ 522 m from the town car's spot. `car-town-drive.mts` now waits for the entry and says
  so if it never comes; no jump in the game.
- Stills: `design/cars/check-cockpit-night.png`, `check-hood-night.png` (re-taken on a clear night, the world's
  weather then; the dusk-snow ones are the checks' before), and `cockpit-night-{saloon,van,4x4,pickup}.png` from
  `/dev/car` (`e2e/zz-cockpit.mts`; no driver there, the wheel unheld and dark against the dark dash).
- Checks: `car.test` 33/33; client and shared typecheck clean; biome clean on the files touched. `car.spec` twice,
  2/3 each time, a different test red each run, and each red passes alone: the flier test (its known flake: Ana's
  teleport), then the lot car (the 3D camera not ready in 20 s, on the first car load after the dev client recompiled).


## The user's first drive — fixed (2026-11-16)

Four things the user found driving, fixed and checked (the fifth, the models' quality, is its own pass below):

- **The front wheels turned the wrong way.** Jolt's `GetSteerAngle` is about up, + to the left; the state, the wire
  and the model all read the wheels' angle as + to the right. `physics/car.ts` now reads it back negated, so the
  wheels, the steering wheel and others' cars on the wire all agree. `glb.ts setSteer` takes + to the right as well
  (the showroom stand's `stage.ts` passes its left-positive angle negated, so the stand looks as before). Checked in
  the game (`e2e/car-fixes.mts`): D turns the front wheels to the right.
- **The wrong door opened.** `glb.ts doorOf` picked the door whose hinge was nearest the seat. A hinge is a door's
  front edge, so the front seats' nearest hinge was the back door's. Now it's the door on that side hinged nearest
  *ahead* of the seat, and a front seat takes a front door where its side has one (the van's slide is hinged just
  ahead of its passenger). Checked: the driver gets in by `door_fl`.
- **The hiccup and the backward flicks while driving.** Two causes:
  - *The car a frame behind the camera.* The car was read back from the world's last step, then posed and its
    camera moved, and only then did the view step the world by the frame's dt. On uneven frames the camera went on by
    this frame's time while the car showed the last frame's, so after a short frame the car fell back toward the
    camera. Now my car steps the world itself in the cars' frame at a fixed 1/60 s (two collision steps, the bench's)
    and is drawn between its last two steps; the view skips its own step that frame (`BrowserPhysics.carStep` and
    `carStepped`). `/dev/car` steps the same way. On the dev client (frames of 2–80 ms), the car against the camera
    went from ~40 cm jumps to a 1.6 cm rms, worst 7–16 cm (`e2e/car-jerk.mts`).
  - *The gear changes.* The engine kept the old gear's revs through the shift, then the clutch (strength 60) slammed
    them down as it bit: the push fell to a little backward, then surged past what it had been (3.7 → −0.2 → 6.0 m/s²,
    a 300 m/s³ jerk), and in a turn the surge kicked the tail (a 30% yaw wobble). Now `drive.ts` matches the revs to
    the new gear while the clutch is out (`car.revs`, Jolt's `SetCurrentRPM`), the clutch is softer (20, biting over
    0.3 s) and the shift half as long (`FEEL.shift` 0.5). Flat out the push comes back to what it was, not more
    (3.7 → 3.7); 0–100 km/h is 8.9 s.
- **Turning felt loose, not on the ground.** The car turned like a puck: at 1.1–1.2 g it leaned 0.2°, because Jolt's
  anti-roll bars at the spec's numbers all but locked the roll. And on keys the steering reached the lock the speed
  allows in 0.06 s, so the car flicked round. Now:
  - the bars are × 0.025 (`FEEL.arb`): the saloon leans ~2.7° in a hard turn, 3.8° seen in the game at 40 km/h;
  - the roll stabiliser is a bump stop from 4° (`ASSIST.lean` 0.07, `leanK` 400): the tall 4x4 and the van lean
    ~4.5° and stay on their wheels on the flat;
  - keys steer by a time to full lock, 0.16 s slow to 0.38 s fast, and come back 1.6× quicker;
  - with the shifts fixed, the mid-turn yaw wobble is gone (0.36 → 0.47 rad/s and held).
- **Crests.** `car.test`'s 2 m crest at ~105 km/h failed after this. Swept over approach speeds, it failed on 5 of 7
  with the old numbers as well: it had passed by luck at its one speed. The fallback box hull struck the rise (11°,
  steeper than its square nose) and was thrown nose-up past 60°. Now the box has a 20° chamfer under its nose and tail
  (`physics/car.ts chamfered`; the game's cars use their models' colliders), and the air levelling is stronger
  (`airLevel` 14, `airDamp` 7). 6 of 8 approach speeds land level, two at 0.84 upright.
- Checks: shared car and physics tests 129/129; client car and view tests 108/108; world-server car and spot 11/11;
  `car.spec` 3/3; typecheck clean.

## Quality pass 2 (2026-11-16, the user's feedback)

"I want you to improve the quality of the models." The first pass had read as clean blockouts: smooth but blocky,
the lamps and bumpers stuck on, the arches cut holes. All in `tools/art/cars/`; no game code changed.

**Body surfaces** (`bodies.py`, `kit.py`):
- **One smooth skin over every panel.** After the cuts, each shell piece takes its normals from the same shell built
  finer and uncut (`kit.Ref`, `kit.skin_normals`): however the booleans cut it, the paint shades as one surface; the
  cuts' walls stay crisp. This is most of the change in the stills.
- Crowned across: the bonnet and boot (`crown`, flat in the middle, falling to the shoulders), the roof (`crown_r`,
  its edges drawn down). The greenhouse's sides bow out (`gh_curve`), the side glass bent to match; the sills tuck
  under (`tuck`); a two-step shoulder.
- The nose bowed in plan (`bow_f`, the saloon's tail too, `bow_r`): the corners drawn back a few cm. The ends roll over
  in four rings, the caps fanned. The top line runs through a monotone cubic, not a smoothstep per point (which left
  ripples down the wings).
- The **arches** have rolled lips in the paint, turning in to the dark liners; on a door's corner the door's own. The
  hot hatch's and the expedition's flares are shaped round the arch (a flat face, a rolled edge), not tubes.
- The floor's underside is in the dark `under` coating, not paint.

**Bumpers** (`dress.bumper`): a shaped section swept round the plan's outline and its corners, rolled into the sides at
the ends; a rubber rub strip (broken for the plate); black end caps on the chrome ones; a valance under the front (body
colour under chrome); the painted ones with their dam's mouth, a lip and fog lamps set in.

**Lamps and grille** (`parts.headlamp`, `parts.grille`, `dress.nose_layout`): the nose has **recesses cut for them**.
The headlamps have a bezel, a housing, two reflector bowls with bulbs, shields and lit discs, and the lens (its prisms
in the lens map; the geometry flutes gone). Each is turned to follow the bow. The grille has a deep surround, a dark
well, angled louvres or chrome bars, and an emblem ring with an E. The tail lamps are framed and split by bars into
cells (their ribs in the map). The front indicators have black lips. The node names and `emit_*` materials are
unchanged.

**Glass and trim**: the B-pillars' black on the door frames; drip rails on the skin by rays; mirrors lofted (a neck, a
head, the glass behind a rim, a foot); pull handles with an escutcheon and a slot; the duplicate filler disc gone.

**Underside**: the down pipe and middle box, the tank, the rear axle and differential, the propshaft, a crossmember,
the sump. The springs are lighter (a fifth of the triangles).

**Cabin**: the binnacle curved round the dials; demister slots and a speaker on the dash top; a console between the
seats; door cards with a padded band, a pull cup, the opener, a window winder and a map pocket; seats with bolsters,
piping, pleats as tubes and a recline knob. The seat backs sit 1.5 cm further back; the hip points are unchanged.

**Materials**: the paint's peel normal 0.35 → 0.08 (at 0.35 it read as stucco up close); the tyres' lettering reads
the right way round.

**Size**: `build_cars.py` snaps the exporter's floats before meshopt packs them: UVs to 1/4096, positions to 1/8192 m,
and the normals' mantissas to 10 bits (`--normal-bits`). The smooth normals cost ~30% more bytes until this.

**The work vehicles** (`work.py`): the snowmobile's hood and seat lofted smoothly, a curved windshield, its lamps set
in the nose; every pane of the snowcat, plough truck and tractor has a rubber seal. The work vehicles' Jolt hulls are
carried over from the last manifest, so they are unchanged (the snowcat's lost two points that lay on its faces: the same shape).

**Unchanged**: every node name, the hierarchy, hubs, seats, eye, doors, the road cars' hulls, dims, morphs and the
mirrors' hinges. The bonnet's and the boot's hinges and the hull read the old top line (`zt_was`). Moved by a ray, as
before: `plate_r` (the saloons' 1.3 cm forward, the rest < 1 mm) and `fuel_flap` (1 mm). New material names: `gloss`
on three work vehicles, `rubber` on the tractor.

**Before → after** (near triangles / MB; mid triangles):

| | Before | After |
| --- | --- | --- |
| Saloon base · GL · S | 81.7k, 83.6k, 87.6k / 1.46–1.53 MB | 84.2k, 84.4k, 89.9k / 1.44–1.52 MB |
| Hatch hot · 4x4 long · van bus | 82.4k, 79.1k, 84.6k / 1.42–1.52 | 84.1k, 82.4k, 86.1k / 1.44–1.51 |
| Road cars, all near | 65.6–87.6k / 1.23–1.53 MB | 68.0–89.9k / 1.25–1.52 MB |
| Road cars, mid | 12.2–18.0k | 13.0–17.2k |
| Shuttle | 89.9k / 1.52 MB; mid 19.4k | 87.4k / 1.37 MB; mid 19.0k |
| Snowmobile · snowcat | 8.8k · 22.2k | 10.8k · 24.4k |
| Far | ~1.6k, ~0.054 MB | ~1.6k, ~0.048 MB |

The budgets are unchanged (near ≤ 1.6 MB and ≤ 90k; mid ≤ 0.6 MB and ≤ 18k, the shuttle 22k); 71 budget and asset
tests green.

**Stills** (`design/cars/quality2/`): `before/` and `after/` (day, rear, cabin, side; close, wheel and tail
close-ups after), a before/after sheet per car (`<car>.png`), the line-up `road.png` and `work.png`.

**Still weak**:
- the steel and cover wheels are still flat dishes;
- the plough truck's, snowcat's and tractor's cabs are rounded boxes;
- the cabin's dash face is a flat slab under the binnacle;
- the near level is at its triangle budget (the sport saloon at 89.9k), so more detail needs triangles taken elsewhere.

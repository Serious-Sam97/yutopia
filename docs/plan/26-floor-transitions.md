# Elevators, stairs and changing floors — done properly (plan — decided 2026-10-19, phase 0 delivered for review)

> Follows `25-building-floors.md`. The post-launch bugs 5, 6 and 9, and the
> user's verdict after the fixes (2026-10-19): "the elevator and stairs are
> too ugly, the transitions are still horrible with a lag, the elevator and
> stairs have a horrible design, the elevator has no animation and no sound —
> let's plan something better quality." A redesign: mocks and a sound/motion
> prototype first (phase 0), approved before any code.

## Where we are (measured)

| | Today | Why |
|---|---|---|
| **Lag on a floor change** | 3D: the page freezes **3–4 s** (headless, software GPU; on a real GPU less, same cause). Iso: 180–350 ms hitches | 3D throws the whole scene away and builds it again on every floor change: a new `World3` for my floor, the floors below rebuilt (which ones are "below" changed), and **the whole campus** (`surround()` → a new `Surroundings`: its canvases, textures, geometry). Iso re-bakes the floor, walls, light map and dressing and re-mounts every thing (`setMap` + `setObjects`) |
| **Elevator look** | a box sketch: two grey slabs for doors, a strip for an indicator, a dark square for the shaft | drawn with the item sketcher (`art/items/building.ts`), the same blocks as a bookcase |
| **Elevator motion** | none: the doors are two states (`props.door` open/closed) that swap; the ride is ~2 s of nothing, then a `snap` to the other floor | the server sends states, not movements; no car exists between floors |
| **Elevator sound** | none | — |
| **Stairs look** | grey boxes in a switchback, a plaster wall between flights, thin posts; the well is a hole | the same sketcher |
| **Stairs motion** | feet follow the treads, but the floor switches at a band mid-flight: the view jumps | `FLOOR_BAND`, re-basing (`offsetTo`) |
| **Clicking** | a click on the stairs doesn't climb; walking to someone on another floor doesn't route | wells aren't floor for A* |

## The quality bar (what "done" means)

1. **No hitch.** A floor change — stairs, elevator, teleport — drops no frame
   over 50 ms on High (an e2e perf check, the probe used for the table above).
2. **It looks like the building in the mocks** (`design/screens/building/06`,
   the *Ruptura* lobby): brushed steel, real proportions, lit, reflective —
   not boxes. Same quality in iso and 3D.
3. **Everything that moves, moves**: doors slide, the car travels, buttons
   light when pressed, the indicator counts, the stair door swings.
4. **Everything that moves, sounds**: positional, quieter through walls, only
   on your floor (or the shaft).
5. **Everyone sees the same thing at the same time**: motion comes from the
   server's timestamps, not from each browser.

## Part 1 — No more lag (the foundation; do it first)

- **3D: build the building once.** Every floor's `World3` is built at load
  (idle time, one per frame) and kept, placed at its height in building
  coords; the campus is built once and never again on a floor change. Changing
  floors only changes **what's shown** (floors above hidden — the Sims cut —
  and a clipping plane for the facade, as `cutAbove` does now) and where the
  camera is. Rebuilds happen only when a floor's layout or things change, for
  that floor, off the frame (`requestIdleCallback`, chunked).
- **No re-basing.** The scene stays in building coords; people, pets and the
  camera are placed by their floor's elevation. (Float precision is fine: the
  building is < 200 tiles.)
- **Iso: a cache per floor.** Each floor's baked floor, walls, light map and
  object views are kept (the floor I'm on and the ones next to it, prewarmed
  when I step onto the stairs or into the car); a change swaps containers.
- **Exit check**: the perf probe in CI (no frame > 50 ms through four floor
  changes, both views).

## Part 2 — The elevator, for real

**Look** (new 3D model built in code, same parts drawn for iso):

- *Landing*: a stainless portal set into a stone surround, recessed
  centre-opening doors with a brushed finish and a fine vertical grain, a slim
  hall lantern over each car (up / down arrows that light) and a dot-matrix
  floor display above, a call panel beside the doors (two round buttons with
  light rings).
- *Car*: brushed-steel side walls in panels, a smoked-mirror back wall, a
  walnut handrail on three sides, a stone floor, a backlit ceiling panel, the
  car's control panel (the HUD panel's design, as an object you can see), a
  threshold strip; its light spills out onto the landing when the doors open.
- *Shaft*: dark, with rails and a counterweight visible through a stairwell or
  an open door when the car is away; the car is seen passing.

**Motion** (server: a car has `phase`, `phaseAt`, `from`, `to`, `startedAt`;
clients animate from those, so everyone agrees):

- Doors: centre-opening, 2 s cycle — a short motor start, ease-out open
  (0.9 s), dwell, a "nudge" re-open if someone's in the doorway, ease-in close.
- The car travels: accelerate, cruise, decelerate (an S-curve; ~1.4 s a
  floor), its riders inside it, drawn at its height. **3D**: the camera rides
  with you; the landing doors of the floors you pass stay shut, a thin light
  line slides past at each floor; the destination floor is already there (Part
  1), so the doors simply open on it. **Iso**: the view follows the car up/down
  (a smooth vertical pan between floors, the floor above fading in, the one
  you leave fading out), the car's interior shown cut-away.
- Buttons light on press (call, panel); the hall lantern blinks on arrival;
  the floor display counts; the car settles with a tiny bounce.

**Sound** (recorded CC0 samples, lazy):

- button press (click + soft beep), door motor and the leaves' slide (open,
  close, the re-open), the arrival chime (one tone going up, two going down —
  the real convention), the car's hum and a soft whoosh while it travels, a
  tick per floor passed, a gentle settle on arrival. Positional; heard on the
  floor the car's at and by the riders.

## Part 3 — The stairs, for real

**Look**:

- A proper stairwell: precast concrete flights on stringers (the soffit seen
  from below), each tread with an anti-slip nosing strip, a half landing, a
  steel balustrade with a continuous handrail that turns at the landing,
  painted block walls, a wall light per landing, the floor's number stencilled
  at each landing ("4", "G"), a fire door at the entry that swings as you pass
  (and shuts behind you with a soft thud).
- The well open to the floors above and below: you see the flights going on
  up and down, people on them too.

**Motion**:

- The climb is continuous: you stay on the floor you started on until you
  step off the top tread onto the next landing; the view doesn't jump (3D: no
  re-basing, the floor above was always there; iso: a 250 ms vertical slide
  + fade at the landing).
- Feet step on the treads (cadence fitted to the tread depth, the body bobs a
  little), a hand on the rail.
- **Click to climb**: a click on the stairs, or a floor in the floor picker,
  walks you up or down; "walk to" someone on another floor takes the stairs
  or calls the elevator (whichever is quicker); pets follow on the stairs.

**Sound**: footsteps on concrete treads (a lighter tap than the floor, a
rhythm per step), the fire door's latch and swing, a faint echo in the well.

## Part 4 — The campus you can walk (bug 9; after the above)

As proposed before: one shared `campusLayout`, the ground floor grown to the
tree line (road, courtyard, the other blocks' footprints solid, trees and
banks solid, the edge deep snow), iso drawn in chunks, the visitor's car
server-driven (one car for everyone, it stops for people). Separate approval.

## Phases

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mocks + a motion/sound prototype**: stills of the landing (shut / open), the car inside, the ride, the stairwell (1P and 3P), iso of each; a small HTML/three.js page that plays the doors' cycle and the ride with its sounds | approved images in `design/screens/floors-2/` and the prototype page |
| 1 | No lag: floors built once and kept (3D), per-floor caches (iso), no re-basing | perf e2e: no frame > 50 ms through four floor changes, iso and 3D |
| 2 | The elevator's new model and animation from server timestamps | two browsers: B sees A's car arrive, the doors open in sync |
| 3 | The elevator's sounds | heard on the landing, the chimes right, silent on other floors |
| 4 | The stairwell's new model, one switch at the top, click to climb, pets on the stairs | e2e: click the stairs on 4 → 3's landing, no frame > 50 ms |
| 5 | The stairs' sounds and the fire door | — |
| 6 | Shots, budget, the e2e suite | visual baselines renewed; world page in budget |

## Decided (2026-10-19)

| Topic | Decision |
|---|---|
| Models | **Built in code**: three.js geometry and drawn textures (no new tooling); the same parts drawn for iso |
| Sounds | **Recorded CC0 samples** (~100 KB, lazy chunk), positional |
| The ride in 3D | **The camera rides in the car** |
| Budget | World page budget **raised to 550 KB** for the per-floor caches and the motion; models and sounds lazy |

## Phase 0 — delivered for review (2026-10-19)

The new models are code meant to stay (`world/tp/lift3d.ts`: `LiftLanding`,
`LiftCar`, `DotMatrix`, `doorEase`, `rideAt`; `world/tp/stairs3d.ts`:
`Stairwell`), shown in a scene of their own with the game's 3D people:
`/dev/lift?scene=landing|car|ride|stairs|iso|isostairs` (`&t=` a still,
`&from=` play from there; "▶ sound" plays the timeline's sounds — synthesised
stand-ins until the CC0 samples are chosen). Shots in `design/screens/floors-2/`:

| | |
|---|---|
| `01-landing` | The lobby's bank: stone surround, steel portals, centre-opening doors, dot-matrix display, the lantern lit ▲, the call plate; the car's light on the sill; the fire door to the stairs |
| `02-car` | The ride's camera, in the car behind you: steel panels, walnut rail, the panel with its display and buttons; the doors open on the lobby |
| `03-ride` | The doors shut, "4" lit, the display counting `2▲` (the car sways a hair as it goes) |
| `04-stairs` | The stairwell: concrete flights with dark nosings, the balustrade and its handrail round the turn, the wall rail, "3" stencilled at the landing, someone a floor up |
| `05-iso-elevator`, `06-iso-stairs` | The iso angle (from the south-east, walls towards the camera cut): the car seen from behind, cut away, people in it; the flights and the fire door |
| `07-motion-landing.webm`, `08-motion-ride.webm` | The motion: the car coming down (display, lantern), the doors' cycle, walking in; the ride and the arrival |

Seen while making them, for phases 1–4:

- **The iso sees the core from behind.** The iso camera is south-east and the
  doors face north, so in iso the cars are seen from the shaft side: the
  car's back and sides drawn cut low, as in `05`. (Turning the core so its doors
  face the camera would change the studio's lobby; not proposed.)
- Metal needs an environment map to read as metal (`scene.environment`, a
  PMREM of a room); `World3` gets one in phase 2.
- The people's 3D models stand at the right scale in a 2 × 2 car: two fit
  comfortably, four is the most.


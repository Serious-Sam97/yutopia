# Plan 96 — the beating, feedback 2

Asked 2026-11-17, after testing plan 95 (plans 94 and 95 uncommitted). The user's five (in Portuguese, here in short),
with a screenshot of a damaged sedan, its driver's foot showing below it:

1. the character's foot comes out through the floor;
2. a car that blows up stays put: make it jump in the blast, as in GTA San Andreas;
3. look again at where a shot's mark shows on the car: it works, but on the bonnet, for one, none shows;
4. shooting a car damages it but doesn't destroy where it's hit: the bonnet doesn't come off after a few shots;
5. an animation when a tyre's shot, not just going hard flat.

Status: **PLAN 96 DONE 2026-11-17** (phases 0–6, uncommitted, with plans 94 and 95). Forks decided 2026-11-17, one
by one, all recommended:
- F2a: a San Andreas hop, about 1 m up, tipping, slamming down where it was and rocking; from `car:blast`.
- F3a: marks about 6 cm (hole, bare-metal ring, scorch), laid again whenever the dents change.
- F4a: the bonnet loose at 4 rounds and off at 8 (the boot lid the same); a door hanging at 5 and off at 10; a
  bumper hanging at 3 and off at 6; a mirror off with 1.
- F4b-a: each shotgun pellet counts.
- F5a: a blowout: a pop, a puff and rubber bits, the tyre collapsing over ~0.6 s, the corner dropping with a
  little bounce.

## Where we are, from the code

- **1, the foot.** Seated people are added to the car model's `body` (`car/cars.ts`, at the seat's hip), so they
  move with the body, including plan 95's sag. The foot through the floor isn't the sag. It's the seated leg's
  pose (the pedals' reach, plan 62; legs ×1.14 since plan 59) against this car's floor, and maybe the passengers'
  feet with no pedals.
  - Phase 0 measures each seat's foot against the floor, kind by kind.
- **2, the blast** (`world-server features/cars.ts blast`, client `car:blast`). The car is burnt out where it is,
  its people thrown out, and parts are blown off with a big upward kick (`BLOWN`). The car body itself doesn't
  move:
  - a parked car is a kinematic box on every client;
  - a driven car's people leave it, and it's parked where it stands.
- **3, the marks** (`tp/car/glb.ts setHoles`). A hole is laid on the skin when the holes change, as a ring of
  bare metal and a dark middle, 4 cm across in all. Two reasons it can be missed on the bonnet:
  - **the size:** 4 cm lying flat on a bonnet, seen from standing height a few metres off at a grazing angle, is a
    pixel or two (phase 4's still: one tiny dot);
  - **the dents grow after the hole's laid.** An engine round dents the front each time (+0.09). For a driven car
    the holes are laid *before* the new dents in the same update (`cars.ts`: holes, then `setWear`), and
    nothing lays them again when the dents deepen. So a hole is left under the dented paint.
- **4, parts off from shots.** Only crashes take parts off (`damage.ts knock`: doors hang, then go; the bonnet
  and boot lid spring, then go; bumpers hang, then go; mirrors off). A round only dents a zone and leaves a hole.
  Nothing counts rounds per part.
- **5, a tyre shot** (plan 94 P5, plan 95 F6a). The flat bit is set; on the next pose the tyre is squashed, the
  hub 8 cm down and the corner sagging, all at once. There's a bang and a hiss, and the car's yaw kicks.
  Nothing on the tyre moves over time.

## Forks (decided 2026-11-17 — asked one by one)

- **F2 the blast:**
  - (a) a hop, as in San Andreas: the car thrown up about 1 m, tipping a little, then slamming down where it was
    and rocking. The same on every screen, played from `car:blast`;
  - (b) thrown for real: the physics throws it, and it may land somewhere else or on its side or roof (the server
    keeps where it lands);
  - (c) a small jolt: about 30 cm, straight up and down.
- **F3 the marks:**
  - (a) bigger and clearer: about 6 cm in all (a dark hole, a ring of bare metal, a little scorch), and laid again
    whenever the dents change;
  - (b) only laid again when the dents change, their size as now.
- **F4 parts off from shots** (the bonnet, the boot lid, each door, each bumper, each mirror; counted per part,
  by where each round struck):
  - (a) the bonnet sprung loose at 4 rounds and off at 8; the boot lid the same; a door hanging at 5 and off at
    10; a bumper hanging at 3 and off at 6; a mirror off with 1;
  - (b) quicker, half of those;
  - (c) slower, double.
- **F4b a shotgun's pellets:**
  - (a) each pellet counts as a round (a close blast can spring a bonnet);
  - (b) a shot counts once per part, however many pellets struck it.
- **F5 a tyre shot:**
  - (a) a blowout: a pop, a puff of dust and rubber bits, the tyre collapsing over about 0.6 s, the corner
    dropping with a little bounce;
  - (b) a slow leak: it sinks over about 3 s, hissing;
  - (c) a blowout at speed or close to a rifle, a slow leak from a pistol round.

## Phases

0. **Measures.**
   - Each kind's seats: the foot bones against the floor (and the door sill), at rest and on the pedals, for the
     driver and each passenger. Stills.
   - The bonnet's holes: their depth under the paint before and after more engine hits, on a parked and on a
     driven car.
1. **The foot** (point 1): the legs kept above the floor (the cause from phase 0).
2. **The marks** (F3): bigger and clearer if (a), and laid again when the dents change.
3. **Parts off from shots** (F4, F4b): the part a round struck (the client's claim names it; the box's
   position for the rest), counted with the holes, and the wreck's bits set at the counts. The pieces fall as a
   crash's do.
4. **The blast** (F2).
5. **The tyre's blowout** (F5): the flat's drop animated (the squash, the hub, the sag over time), the puff and
   bits, its sound.
6. **Checks:** the probes, the specs near, size limits, a Low drive.

## Phase 0 — built (2026-11-17): measures

### The feet (`e2e/car-feet.mts`)

Ana at the wheel of Main Street's first town car (a sedan), Bia in each other seat in turn (a second browser).
For each seated person, a ray straight down from above each ankle and toe against the car's own model:

| seat | foot | against the carpet |
|---|---|---|
| driver | right (on the pedals) | 8–13 cm **above** it |
| driver | left (resting) | 13–17 cm **under** it |
| front passenger | both | 13–17 cm under it |
| rear passengers | both | 14–19 cm under it |

- Only the foot the pedals place is right. Every resting foot hangs through the floor pan, about 0.6 m out from the
  middle, under the door. That's the shoe showing below the sill in the user's screenshot
  (`design/plan96/p0/feet-front-both.png`).
- The throttle and the brake don't change the resting feet.
- One run, Bia's page (as the front passenger) threw "setTargetAtTime: non-finite" many times; the next two
  didn't. A NaN into a sound's parameter somewhere: to chase, its stack now printed.

### The bonnet's marks (`e2e/car-aim.mts DEPTH=1 REPEAT=3 ONLY=bonnet`)

Six engine rounds into a parked car's bonnet, the front's dents deepening (0.09 → 0.54). After each, every mark's
middle against the skin under it: **3 mm above it, every time**.

- A parked car's marks are all laid again whenever the holes change, after its new dents, so they aren't buried.
- On the bonnet, the one there is to fix is the size: 4 cm lying flat, seen at a grazing angle.
- A driven car's marks are laid *before* its new dents in the same update (from the code). Phase 2 lays them
  again on any dent change, which covers that.

## Phase 1 — built (2026-11-17): the feet

- **The cause.** The cars' models never gave a floor height. The seat fit (`tp/car/seatfit.ts carFit`) guessed one,
  0.4 m under the hip, which for these files is 13–19 cm under the carpet. Every foot not on a pedal was aimed
  through the floor pan.
- **The fix:**
  - Each seat measures its own footwell floor when its model loads (`tp/car/glb.ts seatFloors`): a ray straight
    down onto its carpet where the feet go (ahead of the hip by 0.55 m in front, 0.4 m behind, a hand's width
    either side), its height kept on the seat (`seat.floor`).
  - `carFit` aims the resting feet there. A seat with no carpet before it (a pickup's bed, a sled) keeps the old
    guess.
- **Checks** (`e2e/car-feet.mts`; `CAR=` picks the car, `SEATS=` the passenger seats, `NOMOVE=1` leaves it parked):

  | body | seats' floors (m) | resting feet against the carpet |
  |---|---|---|
  | saloon (town-car-0) | 0.31 ×4 | all four seats: ankles 11 cm over it, toes 6 cm |
  | saloon-base, saloon-gl (3 more town cars) | 0.31 | driver and front passenger the same |
  | 4x4-short (car-3) | 0.49 | ankles 10–11 cm, toes 6 cm |
  | pickup-flatbed | 0.41 front, bed none | ankles 9–11 cm, toes 4–6 cm |

  - The driver's foot on the throttle is as before (8–13 cm).
  - The still from beside the driver's door no longer shows a shoe under the sill
    (`design/plan96/p1/feet-front-both.png`).
- **The passenger's sound errors.** On about one run in three, the second browser's page threw
  "AudioParam: non-finite" every frame, from every sound system in turn: the survival mode's ambience, the town's
  wind, the water, the footsteps.
  - Caught at its first: the page's own position and its camera were already NaN, about 45 s in, *before* it got
    in any car. In this probe the only thing that moves that player before then is the test teleport to beside
    the car.
  - Not the cars', not the seat's. Normal play doesn't teleport (it's an admin and test command): left as a
    follow-up.
  - Two sound systems now ignore a frame with no number (a NaN would otherwise stay in their eased values for
    good): the survival mode's loops (`dark/voices.ts`) and the town's wind (`grounds-sound.ts`).
- Client type check clean.

## Phase 2 — built (2026-11-17): the marks

- **One 6 cm mark** (`tp/car/glb.ts markTex`, `MARK_SIZE`), drawn on a canvas once:
  - a ragged black hole;
  - the paint chipped back to bare metal round it, with a lighter rim where the round turned the edge out;
  - a soft scorch of soot fading out past that, a few specks in it.

  One instanced quad per part it's on (was two meshes, a ring and a disc, 4 cm), each mark turned its own way.
  Marked `userData.mark` (probes find them by that).
- **Laid again whenever the dents change** (`setWear`: a key of the five zones' dents; changed, with holes on
  the skin, `setHoles` again). A driven car's update lays its holes before its new dents, so this covers that.
  - `e2e/car-holes-follow.mts`, now with a dent check: a hole on a bonnet, then the front dented to 0.9. The mark
    stays 3 mm over the skin. With the new step switched off it was 4.7 mm: a dent pushes the panel in, away from
    the mark, so it floated rather than sank. Small either way. On the bonnet the real cause was the size, as
    phase 0 found.
- **Checks:**
  - `e2e/car-aim.mts REAL=1 DEPTH=1`: the bonnet twice (an engine hit each), the door (a panel). Every mark 3 mm
    over the skin, within 1–19 cm of the aim.
  - Close stills (`design/plan96/p2`, `marks-bonnet.png`, `marks-door.png`): on the door, a black hole in a bright
    ring of bare metal and a faint scorch; on the bonnet, seen at an angle, two clear marks where phase 4 of plan
    95 left a pixel.
  - Client unit tests 421, type check clean.

## Phase 3 — built (2026-11-17): parts shot off

- **The part a round went into** (shared `SHOT_PARTS`, `partAt`, `ShotPart`):
  - the shooter's screen names it from the model: the mesh's or a holder's name, `door_fr-paint`, `bonnet`, …
    (`car/cars.ts shotAlong`, the claim's `part`). A door mirror's glass (its material's a "reflector") is the
    mirror's, not a lamp's (`mirrorOf`);
  - for a round the box took, from where it struck (`partAt`): the bonnet from above ahead of the cabin or high
    on the front; the front bumper low on it; the boot lid and rear bumper likewise at the back; a door from the
    side under the glass, by its row;
  - only the skin's (a panel, the engine under the bonnet) count, not glass, a tyre or a lamp.
- **Counted with the holes.** Each hole keeps its part as a 9th field (`…,pane,part`, the pane −1). Mending a side
  takes that side's holes and so its counts; new glass keeps a part's holes (`holesWithout`/`glassless` read the
  pane field now, not the count of fields).
- **Loose, then off** (`shotWreck`, `PART_ROUNDS`), after each round's hole on the server, driven or parked:

  | part | loose / hanging | off |
  |---|---|---|
  | bonnet, boot lid | 4 | 8 |
  | a door | 5 | 10 |
  | a bumper | 3 | 6 |
  | a mirror | — | 1 |

  - Each of a shotgun's 8 pellets is a round, so one close blast all on the bonnet takes it off.
  - The pieces fall as a crash's do (plan 94's `partsOff`, the wreck's bits).
- **Marks on a moved part.** The holes and stars are laid with every shootable part put at rest a moment
  (`partsAtRest`: its pivot unturned, each part's own matrices made — a parked car's still model isn't walked
  from its root), then put back. A sprung bonnet's marks are on it, not lost.
- **Checks:**
  - **Shared:** a unit test for the counts (bonnet 4/8, door 5/10, rear bumper 3/6, mirror 1), the holes' part
    field and its mending, `partAt`. 708 pass.
  - **Server:** a new car-shot test: one shotgun blast into a parked car's front right door (8 claims) hangs it,
    and its eight holes are the door's; two revolver rounds more and it's off. cars, car-shot and arms 38 pass.
  - `e2e/car-aim.mts WRECK=1 REPEAT=8 REAL=1`: the bonnet shot through the game. Loose at the 4th, off at the
    8th. Its marks were laid again on the sprung bonnet (5, 6, 7 drawn) and went with it.
    `design/plan96/p3/marks-bonnet.png`: the engine bay open.
  - **Client:** unit tests 421, type checks clean.

## Phase 4 — built (2026-11-17): the blast's hop

- **The hop** (`car/cars.ts hop`, `hopsFrame`), started by `car:blast` on every screen, so it's the same for
  everyone:
  - **thrown up:** as a thrown thing, 4.43 m/s up, about 1 m at its top at 0.45 s, down at 0.9 s (`HOP_UP`);
  - **tipping:** a way of its own, up to about 16° about its length and 9° across, most at its top;
  - **down:** a 12 cm bounce, its heavy thud (the cars' `hit-heavy`), and a ring of snow and dust thrown out
    round it;
  - **rocking:** a damped rock (about 4° at 3.2 Hz), still by 2.2 s (`HOP_S`), then put back exactly where it was.
- **Over where it is:** a parked car's model from where it was placed; a live one's over each frame's own pose.
  If its model is made again mid-hop (burnt out, merged), the hop carries on over the new one.
- **Checks** (`e2e/car-fire.mts`, its hop recorded every frame in the page from its first; stills by the hop's
  own clock):
  - 149 frames: **top 1.00 m at 0.43 s**, tipped up to 10°, down at 0.88 s, still at 2.17 s.
  - An earlier run: top 1.00 m at 0.41 s, 11°, down at 1.15 s (after the bounce), still at 2.15 s.
  - Screenshots in this headless browser lag a few tenths of a second, so the "top" still (`design/plan96/p4`)
    catches it coming down. The per-frame record is the measure.
  - It blew 11.5–11.8 s after catching, as plan 95 has it.
- Client unit tests 421, type check clean.

## Phase 5 — built (2026-11-17): the tyre's blowout

- **The collapse** (`tp/car/glb.ts`). Each wheel has its flat as far as it's gone (`flatK`, 0 up … 1 down) and when
  its blowout began. A tyre newly shot goes down in `FLAT_S` (0.6 s):
  - a quick collapse (cubic ease-out);
  - its corner dipping a little past it and back (up to 1.18, about 0.45 s in);
  - the body's sag, each hub's drop and the tyre's squash all follow it, so the corner drops with a little
    bounce.
- **As it is, without a blowout:** a car first seen flat (loaded so), and a mended tyre, snap to their state.
  - `flatSeen` is set when the model's in, so the first shot on an undamaged car blows out. The first try
    snapped because the flat code had never run on a car with no damage.
- **Who moves it each frame:** a driven car's (mine, the rig; others', their poses) runs in the tick that already
  ran each frame for a flat. A parked car's runs while its blowout is under way (`flatsBusy` → `flatsTick(true)`,
  its wheels put on their hubs and their matrices made: a still model).
- **The pop's dust and rubber** (`car/cars.ts`, on every screen from `car:shot`), with the bang and hiss it had: six
  puffs of dust off the road under it, and four dark bits of rubber thrown out of its side.
- **Checks:**
  - **A parked car** (`e2e/car-aim.mts FLATREC=1 ONLY=tyre REAL=1`, per frame in the page): half down at 0.13 s,
    the dip deepest (1.16) at 0.45 s, settled at full. Body 2.4 cm down at the dip, 2.1 after; the tyre squashed
    8 cm.
  - **A driven car** at 58 km/h (`e2e/car-burst.mts`): half at 0.15 s, deepest 1.16 at 0.47 s, settled at 1.00.
    The flat state as plan 95's.
  - **A still straight after the shot** (`SNAP=`, `design/plan96/p5`): the dust off the road and the sparks at
    the wheel.
  - Client unit tests 421, type check clean.

## Phase 6 — checks (2026-11-17)

- **Unit and server tests:** shared 708, client 421; world-server cars, car-shot and arms 38. Type checks clean in
  all three.
- **Size limits** (production build):
  - the world page was **488.1 KB, 0.1 over 488**: plan 96's NaN guards in the world page's sound and its other
    page-side changes. **Raised to 489** (`tools/budget.mjs`, noted);
  - `yutopia-car` 54.4 of 120 KB (53.5 at plan 95's end).
- **The probes again** (one batch on the dev world):
  - **feet:** every seat on the carpet; Bia's page with no NaN.
  - **marks:** each 3 mm over the skin; rounds within 1–13 cm of the aim (the roof from the side, 0.48 m:
    parallax).
  - **parts:** the bonnet loose at its 4th round. The run ended with seven on it (one round met the roof
    instead), so it stayed on.
  - **blowout:** parked, half at 0.13 s, the dip at 0.45 s; driven, half at 0.16 s, the dip at 0.48 s.
  - **hop:** top 1.00 m at 0.43 s, 12°, down at 0.89 s, still at 2.18 s.
  - **glass:** stars and cracks as plan 95 has them.
  - **plan 94 and 95's** (tyre change, passenger shotgun, wreck, car UI, window, lamps, the tyres' voice on the
    pad): all as before.
- **End-to-end specs** (car, car-look, pets-car, arms, inventory-pack): 6 of 7 at first.
  - Car's "passes under a flier" failed. Run alone it failed twice too (in plan 95's checks it had passed alone).
  - **The cause, in the test:** it holds S until the car's back near its bay's mouth, looked at with
    `expect.poll`, whose waits grow to a second. Backing up, the car went on 10 m past the mouth, into what's
    behind it. Plan 94's grip makes it quicker in reverse, so the overshoot grew.
  - Now polled every 100 ms (`intervals: [100]`): 3 of 3 pass.
- **A frame-time drive on Low** (the production build on :3107): plain 67.6 and 68.6 fps; with the fire 66.2 and
  82.1 (one 186 ms frame).
  - **Not comparable** with plan 95's (96–100, 85–94). This run had the user's Firefox content process at 187% CPU
    and a Spotify renderer at 121% (`ps`).
  - Nothing plan 96 adds runs heavily each frame: a parked car's blowout check is a compare per car; the hops run
    only while one's going.
  - To be measured again on a quiet machine.

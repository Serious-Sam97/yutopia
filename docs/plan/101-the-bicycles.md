# Plan 101 — the bicycles

Asked 2026-11-18:

> Lets work on two new additions! Bicycle and Skate! Lets do one at a time, starting with Bicycles. Lets use Blender
> for the models, and you can use GTA SA and 5 as a reference of animations and models.

Bicycles first; the skate is plan 102, after this one. Whatever the two share (the rider leaning with what they
stand on, falling off, tricks in the air, the camera on something small and quick) is built here so 102 picks it up.

Status: **planned 2026-11-18; forks decided 2026-11-18 one by one: the recommendations for F1–F3 and F5–F13;
**F4b**, GTA's tricks plus air tricks now (tailwhip, barspin, 360, no-hander/superman); **F14b**, no sign-off —
built straight through, you test at the end. Not built yet.**

## Where we are, from the code

- **There are no bicycles.** The only bike in the world is `bike_rack` (`shared/fam/outdoors.ts:53`): steel hoops,
  a wave rack and a timber block, buildable outdoors, and nothing to put in them.
- **Vehicles are cars.** Every ridden thing is a `CarKind` (`shared/car/specs.ts`: eleven, from the sedan to the
  toboggan) with a `CarSpec`, driven on Jolt's `VehicleConstraint` + `WheeledVehicleController` (plan 92,
  `shared/car/drive.ts`), the arcade layer in `assist.ts`, grip per wheel and surface in `grip.ts`. What a kind gets
  for free:
  - the wire: the driver decides, `car:state` at 20 Hz, others play it back (`car/playback.ts`); no new Player
    fields (the 64-field limit, [colyseus-64-fields]);
  - owning one: `own.ts` `BUYABLE` (MOTORS), plates, homes, parking (`park.ts`), lending;
  - the town's parked cars, the shove, damage by zone (`damage.ts`), shots (`shot.ts`), water drowning it;
  - getting on: `car/getin.ts` — plan 100's act for doors, and **`straddleAt`** (plan 98 phase 4) for a seat with no
    door: the snowmobile's and the toboggan's, the near leg swung over. The bike's get-on starts from this.
- **Jolt already has a bike.** Our JoltPhysics.js build carries `MotorcycleController` +
  `MotorcycleControllerSettings` (`packages/jolt/dist/types.d.ts:4246`): a two-wheeled `VehicleConstraint` held up by
  a lean controller that steers into the fall (max lean, spring, damping, smoothing). It's the right base: a real
  body in the same world as the walker, the cars, the floors and the kerbs.
- **The models' pipeline exists.** `tools/art/cars/` (plan 92): Blender scripted, a GLB per variant with near/mid/far
  LODs, parts hung under named pivots (`wheel_* › steer_* › spin_*`, `seat_*`, `collider`, points), and a
  `manifest.json` of the numbers so the game guesses nothing. The life look's materials (plan 73).
- **The body.** Plan 58's 29-joint rig with foot lock, plan 77's gait numbers, plan 78's five-finger hands and grip
  library, plan 58's ragdoll for falls. Plan 100's pose rules (contacts, clearances, knees and elbows where they
  should point).
- **Stamina** (`shared/vitals.ts`): drains when sprinting outside, winds you; the office's sprint is free.
- **The world is winter** (plan 65): a snow layer over a green base, cleared roads, slush, black ice, deep snow off
  the paths, storms; night and the dark (plan 30), fog (plan 64).

## The reference — GTA San Andreas and GTA V

**The bikes.** San Andreas has three: the **BMX** (the trick bike: the highest bunny hop), the plain **Bike** (the
middle) and the **Mountain Bike** (speed and hills, only a moderate hop). GTA V has seven: BMX, Cruiser (the beach
cruiser, slowest), Scorcher (hardtail mountain bike: jumps and wheelies), Fixter (fixed gear), and three road racers
(Endurex, Whippet, Tri-Cycles: the fastest, ≈75 km/h flat out in the game), sold at Pedal and Metal.

**The controls.**
- San Andreas: the gas pedals; the sprint key tapped pedals harder; the bunny hop is held to charge (the longer, the
  higher); wheelie on lean-back, stoppie on lean-forward with the brake. Its **cycling skill** grows as you ride: a
  more responsive bike, higher hops, fewer falls off after a bad landing.
- GTA V: pedal held, sprint tapped (on PC a key, Caps), the **front brake** apart from the back, lean forward/back
  (Shift/Ctrl) for wheelies, stoppies and the bike's pitch in the air; the rider tucks at speed. Bikes come off you in
  a crash, a hit from a car, a bad landing; the rider ragdolls and gets up.

**The animation — what makes it read as riding** (both games, and real riders):
- the feet go round with the cranks, the knees rise and fall in the bike's plane, never splayed;
- seated at a cruise; **standing on the pedals** to sprint or climb, the bike rocked side to side under her;
- the body leans into a turn with the bike, the head level and looking where it goes;
- at a stop, one foot down and the bike tipped toward it;
- coasting, the pedals level and the weight on them; hopping, the body crouches then pulls the bars up;
- getting on: from the left, the right leg swung back over the saddle (a step-through on the cruiser), a foot on the
  pedal, a push off; getting off at speed, a hop off and a few running steps; at a stop, the leg swung back.

## The idea

**A bike you pick up in a second and ride for fun.** Quicker than walking, slower than a car, nimble where a car
can't go (paths, through the campus, between the trees on a trail), at the GTA V middle: grippy on a cleared road,
leans you through the turn on its own, hops and wheelies on the BMX, throws you off when you really crash. **The
snow still counts**: packed snow is loose, ice is a fall waiting to happen, deep snow stops a road bike where the
mountain bike's studs keep going. **Made in Blender** at the cars' quality, late 80s / early 90s like everything in
the world (no real makes or badges). **The rider is the real body**: feet on the pedals, hands on the grips, leaning
with it.

## Forks — decided 2026-11-18 (asked one by one)

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | How it's built | **a)** a vehicle among the cars (a new family of `CarKind`s: the wire, owning, parking, playback, damage, shots for free), riding on Jolt's `MotorcycleController` (two wheels, the lean controller), our arcade layer on top · **b)** a separate system: the walker's capsule made fast with the bike drawn under it (lighter; what the skate might use) | **a** |
| F2 | Which bikes | **a)** four bodies, three variants each (12 GLBs): a town bike (step-through, basket, dynamo lamp), a BMX, a mountain bike (rigid steel, knobblies; a studded winter variant), a road racer (drop bars) · **b)** three, as San Andreas: BMX, town bike, mountain bike · **c)** GTA V's spread: BMX, cruiser, mountain, fixed-gear, road | **a** |
| F3 | Pedalling | **a)** hold W to pedal at a cruise, Shift to stand and sprint (draws stamina as running does), let go and it freewheels; S brakes (both), Space the hop · **b)** San Andreas: tap to pedal harder, the faster you tap the faster you go · **c)** GTA V's mix: hold to pedal, tap Shift to sprint | **a** |
| F4 | Tricks | **a)** GTA's set: bunny hop (hold to charge), wheelie (lean back), stoppie (lean forward + brake), pitch and lean in the air; BMX best, the racer barely; no score · **b)** plus air tricks on a key (tailwhip, barspin, 360), shared later with the skate · **c)** the bunny hop only | **b**: all four air tricks — tailwhip, barspin, 360, no-hander/superman (the user, 2026-11-18); the trick code shared with the skate, plan 102 |
| F5 | Falling off | **a)** GTA's: a hard hit, a car, a bad landing, a shot, a slide on ice → thrown off on the ragdoll, the bike falls and lies; at a stop a foot goes down; a gentle low-side on ice puts her on the ground, she gets up · **b)** only big crashes, never from slipping · **c)** never | **a** |
| F6 | A cycling skill | **a)** no stat: one feel for everyone · **b)** San Andreas' skill: rides make the hop higher, the bike quicker, falls rarer | **a** |
| F7 | Snow and the surfaces | **a)** ride anywhere, grip per wheel by the ground (`grip.ts`): cleared roads good, packed snow loose, ice slides, deep snow bogs a road bike, the studded mountain bike holds · **b)** bikes only in the green season (plan 65), parked in winter · **c)** the surfaces ignored | **a** |
| F8 | Where you get one | **a)** buy one at MOTORS (a bikes page, the cars' panel: variant, colour, extras) and own it like a car; and town bikes leaning in the bike racks that anyone can ride, that go back to a rack on their own · **b)** own only · **c)** free, everywhere | **a** |
| F9 | On foot with it | **a)** wheel it beside you (hands on the bars, the wheels roll), lean it on a rack or wall, or it stands on its kickstand · **b)** only ride it or let it fall | **a** |
| F10 | The rider's body | **a)** procedural on plans 58/77/78's body (feet locked to the pedals by the crank, hands gripping, knees in the bike's plane, standing sprint, lean, the head looking ahead, a foot down at a stop), the get-on/off from `straddleAt`, by plan 100's rules · **b)** clips keyed in Blender on our rig, fitted by IK | **a** |
| F11 | Guns on a bike | **a)** not now: hands on the bars, no drawing; a shot or a hit throws you off · **b)** one-handed from the saddle: the revolver (plan 80) and the torch, steering with the other hand, as GTA V's drive-by | **a** |
| F12 | Lamp, bell, extras | **a)** a bell (a key), a lamp (the town bike's dynamo: bright as you pedal, dim when you stop; a battery lamp on the others) and a rear reflector; basket and rack drawn, nothing carried in them yet · **b)** the bell only | **a** |
| F13 | The sound | **a)** recorded (CC0; CC-BY with its credit in `sources.json`) for every bike sound — freewheel tick, chain, gear click, brakes, tyres on asphalt/snow/gravel/ice, the bell, the crash — picked by your ear on `/dev/bike-sound` · **b)** I pick, you veto | **a** |
| F14 | Sign-offs | **a)** phase 0's Blender mocks signed off by you, then straight through, you test at the end · **b)** no sign-off, build straight · **c)** a sign-off after each phase | **b**: no sign-off, build straight (the user, 2026-11-18) |

Decided without asking (as GTA, and as the cars): **no passengers** on a bike; the camera is the car's chase camera
retuned (lower, closer, leaning a little with the bike; the mouse still looks around, plan 56); the driver decides and
the server takes it (no anticheat).

## Guardrails

- **People are never hurt** by a bike (knocked down, as by a car). A rider thrown off takes a fall's knock, as now.
- Late 80s / early 90s, ours: no real makes, badges or copied designs (plan 92 F8). No GTA models copied: types and
  proportions only.
- Every bike fits by its measures (the manifest): saddle, bars, pedal axis, crank length, wheelbase — no pose made for
  one bike.
- Jolt's limits (plan 50) counted: a bike constraint's cost measured on `pnpm physics`; `forget()`/`letGo()` for its
  wrappers ([jolt-wrapper-cache]).
- The page budget measured and raised when needed ([budgets-raise-freely]); new items go in `Survivor::STACKS` if any
  ([api-item-whitelist]).
- memcheck gets a bike's life (on, ride, fall, off, park) as plan 97 gave the car's ([car-memory-plan97]).
- Commit on main only; push when asked; no co-author line.

## The phases

0. **The mocks** (Blender, `tools/art/bikes/` on the cars' kit): each body and its variants as stills in
   `design/bikes/`, next to a person on it for scale; the rider's key poses (cruise, standing, lean, foot down, hop) as
   stills on the rig. No sign-off (F14b): they're my check on proportions before the models, and yours to look at.
1. **The models for the game**: `build_bikes.py` → `public/life/bikes/` GLBs (near/mid/far) + `manifest.json`: frame,
   fork › bars (steer), front and rear wheels (spin), cranks › pedals (spin, the pedals kept level), chain and
   freewheel, brakes' levers, the kickstand, the lamp, the bell; `collider`, `saddle`, `grip_l/r`, `pedal_l/r`, hubs.
2. **The ride on Jolt**: the bike `CarKind`s and specs; `MotorcycleController` with our lean; pedalling as torque
   through the rear wheel by cadence (the gears' ratio), the freewheel, front and back brakes; the arcade layer (turn-in,
   the lean held, never falling over by itself on a clean road); the `/dev/bike` bench for the feel.
3. **The rider**: the crank-driven legs, the grips, seated/standing, leaning, looking, the foot down; the get-on and
   get-off acts (from `straddleAt`), the hop off at speed.
4. **Tricks**: the hop (charged), wheelie, stoppie, pitch and lean in the air, landings; **the air tricks** (F4b):
   in the air, the trick key (E) with a direction picks one — tailwhip, barspin, 360, no-hander/superman — each a
   timed move of the bike's parts and the rider's body, landed clean or thrown off if it isn't finished. The
   trick's timing, its "finished?" test and the landing judge live in shared code for the skate (plan 102).
5. **Falls**: thrown off on the ragdoll by speed and angle of the hit or the landing, the bike falling as a body, the
   rider getting up; the low-side on ice.
6. **The surfaces and the weather**: grip per wheel from `grip.ts`, deep snow, studs, slush spray, tyre tracks in the
   snow (`ruts.ts`), wet and frozen.
7. **In the world**: the bike racks' town bikes, MOTORS' bikes page, owning and parking, wheeling it on foot, the
   kickstand, the lamp at night, the bell; the wire and playback for others; the AI and the cars seeing bikes.
8. **The sound**: recorded candidates, picked on `/dev/bike-sound`.
9. **Checks**: e2e (get on, ride, hop, fall, park, another browser seeing it), memcheck's bike life, the page budget,
   physics bench, stills.

## Progress

### Phase 2 — the ride on Jolt (shared, built 2026-11-18)
- **A bike is a car kind**: `bike_town`, `bike_bmx`, `bike_mtb`, `bike_road` (shared `bike/specs.ts`), each a `CarSpec`
  with `bike` (its legs' cruise and sprint, its force, gears as development, brakes, lean, caster, hop, trick skill,
  wheels, tread). The rider is in the mass and the centre of gravity. On MOTORS' list; three variants each in the look
  model (`BIKE_VARIANTS`: studs, a fixed gear, a gyro, pegs, its lamp), paint from `BIKE_PALETTE` or a car's.
- **On Jolt**: `physics/car.ts` takes two wheels on Jolt's `MotorcycleController` (`CarDef.bike`) and a raked fork
  (`WheelDef.caster`: the suspension and the steering along it). `bike/drive.ts` `BikeDrive` is the bike's `Drive`: its
  two wheels written into the car's four (FL = FR the front, RL = RR the back), so the wire, playback, sound and rig
  read it as a car.
- **What I found**: Jolt's own lean spring is too slow for a bicycle's light roll (20° after 2.5 s) or unstable when
  stiffened. So it's off, and the lean is ours. A balance controller about the tyres' contact, with gravity's tip
  undone, leans to the angle the rider asks for. The front wheel steers only as much as the lean she has carries round
  (an arcade countersteer); at a crawl the bars are turned directly. Result: 36° into a turn in under 0.5 s, held,
  flicked the other way as fast, no speed lost.
- **The legs** are a force along it (as the toboggan's feet): speed-seeking to the cruise or the sprint, capped by the
  rider's force and the back tyre's grip (past it, the wheel spins), × the ground's pace for its tread (`paceOn`:
  deep snow 0.18 on a road bike, 0.62 studded).
- **The brakes** are Jolt's, each wheel eased as it locks. The wheelie and the stoppie are balances about the back or
  front contact (gravity held). The hop charges for 0.4–0.45 s: 0.95 m on the BMX. In the air: the nose by Q/Z, the
  spin by A/D (7.6 rad/s on the BMX), kept level side to side. The tricks and the landing judge are in `bike/tricks.ts`
  (shared, for the skate).
- **The falls** (`bk.fell`):
  - a crash: the knocks of the last moment added up, since one frame was only 3.2 m/s at 25 km/h into a wall;
  - a bad landing: an unfinished trick, sideways, endo, loop, on its side, or a drop from about 4.5 m;
  - a sideways slide past the grip for 0.3 s;
  - over-leant, looped or endo'd on the ground.
  After a fall the bike's left to fall over.
- `bike/bike.test.ts`, 10 tests: cruise and sprint, the turn, the brakes and the foot down, the hop, wheelie and
  stoppie, a tailwhip (lands on a BMX; too slow on the town bike), a 360 (held round lands, let go is sideways), ice
  and studs, deep snow, a wall. `bike/probe.ts` prints a ride.

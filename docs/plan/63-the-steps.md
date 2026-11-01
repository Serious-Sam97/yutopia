# 63 — The steps

The first part of a sound pass for immersion. Ask (2026-11-01): "Lets work on sounds, we need
for immersion, lets start with the steps, do a check on every place that we use our feet, every
ground, item etc... Lets plan". This plan covers every place feet (and paws) meet something,
and the sound they make there. Planned 2026-11-01.

## Where we are

### How a step sounds today

- **A timer, not the feet.** `sound.step` (`world/sound.ts:167`) plays one step every 0.34 s, or
  every 0.22 s when sprinting. Walk (1.5 m/s), jog (5 m/s), crouch and aim all share the 0.34 s
  rate, so a jog's feet hit the ground about twice per step heard. The sound never lines up with
  a foot.
- **It's synthesized.** Each step is a burst of noise through a band-pass filter, one setting per
  floor (`sound.ts:177`). Snow adds a few grains of crunch (`grounds-sound.ts:40`). Every step on
  a floor has the same colour, with no heel and toe, no scuff, and no shoe. The stairs play four
  samples (`stairs/step-1..4`), but those are synthesized too (`tools/sfx-synth.mjs`). The only
  recorded sounds in the game are the car engine and the lift doors, both CC0.
- **Only for me.** It is called in one place (`controller.ts:1830`), for the local player, with
  no pan.
  - Other players make no footsteps. Their jumps and landings do make a sound, but only by
    straight-line distance (`JUMP_HEARD` 9 tiles): no pan and no rooms.
  - NPCs (Vortex, the guard, the Kart Park's folk, the Vortexes at the tables) and pets make no
    steps at all.
  - The shades in the dark are the only positional footsteps (`dark/voices.ts:316`).
- **It doesn't know you're in the air.** `moved` is only "the position changed", so steps keep
  ticking through jumps, wall runs, vaults, slides and grinds.
- **Walking off an edge is silent.** The walker's `out.landed` is never read; only a jump starts
  the landing sound.

### What the feet are on

`Floor` (`sound.ts:13`) has 12 kinds: wood, carpet, tile, felt, stage, grate, asphalt, concrete,
snow, deep, path, ice. Each one is chosen from (x, y) only (`controller.ts:1823`):

- **Indoors** it is the map tile (`FLOORS`, `shared/map.ts:9`). Every tile char has its own
  sound.
- **Out on the Grounds** it is `groundSurfaceAt` (`shared/grounds.ts:1244`), mapped through
  `GroundsLife.floorAt` (`grounds-life.ts:136`). That function folds three surfaces together:
  - `walk` (pavements, the plaza, the paddock, forecourts) becomes concrete;
  - `rock` becomes concrete;
  - `floor` (every town interior: the bar, the diner, the barn's earth, the farmhouse) becomes
    wood.
- **A landing on anything you stood on is always "wood"** (`controller.ts:2871`). That includes a
  car roof, an arcade machine or a boulder.

What is missed, by surface:

| Under the feet | Heard as today | Why |
|---|---|---|
| Rug, standup mat | the tile under it | objects aren't read, only tiles |
| Lift car (stone floor) | the shaft's tile | same |
| Desk, table, counter, piano, pool table, arcade, vending, server rack tops | the tile under them | height is ignored |
| Parked car roof or hood | the tile or ground under it | same |
| Town roofs, porches, kerbs, bleachers, the Kart Park's bowl and bridge, boulders, benches, planters | the ground under them | same, and Jolt can't say what you're on |
| Road bridge (steel) | asphalt | the way's surface, not the deck |
| Trail footbridge (timber) | path (snow) | same |
| River ice under a bridge | the bridge's surface | (x, y) only, so the deck wins |
| Pavement, plaza, rock | concrete | folded together |
| Bar, diner, farmhouse, barn earth, gatehouse, market | wood | folded together |
| Slush, black ice, fresh snow on a road in a storm | asphalt | weather only reaches the cars (`car/world.ts:29`) |
| Wall (wall run), rail (grind), pole, ledge | the floor below | Flowmotion plays ordinary floor steps |

**Jolt can't name what you're standing on.** Its layers are only solid, moving, land, floor,
door and wall. The Grounds' solids are merged into one compound per chunk, so their `GroundWhat`
tag (roof, porch, kart_stand…) is lost. `world.groundUnder` (`physics/world.ts:1108`) returns a
height and nothing else. The keys are there, though: `thing:<id>`, `car:<id>`, `lift:<id>`,
`grounds:`, `slab:`. A hit that keeps its body and sub-shape can name the thing.

### The feet in the body

- **There is no foot-contact event**, but the body knows exactly when a foot lands:
  - The gait phase (`Locomotion.gaitPh`, advanced by distance, `locomotion.ts:822`). The right
    heel strikes when it wraps past 0, and the left when it crosses `offL` (~0.5). `landF` says
    whether it's a heel strike (walk) or the ball of the foot (sprint).
  - `Stepper.update()` (`hero.ts:1569`) already returns which foot came down, for starting,
    stopping, turning in place and the skid's brace. Nothing listens to it.
  - FootLock (`hero.ts:1413`) plants per foot, but it is off in the air, in verbs and in skids.
- **When the body doesn't run**, the steps need another clock: with `?anim=old`, reduced motion,
  before the `yutopia-anim` chunk has loaded, and for people off screen (whose motion is stepped
  in batches every 0.5 s). The footprints already alternate left and right every 0.42 tiles per
  person (`footprints.ts:28`); a step by distance is that same idea.
- **Shoes are on the recipe.** `avatar.ts:118` lists 11: sneakers, hightops, boots, loafers,
  sandals, snowboots, runners, chelsea, flats, slipons, laceboots. Today a person's steps don't
  depend on them.

### Space

There is no PannerNode, no reverb and no occlusion. Voices use `hearingGain`
(`shared/hearing.ts:31`): 6 tiles in the same room, 3 through a doorway, private rooms sealed,
other floors silent except faintly in the stairwell. Their pan comes from the camera
(`tp.pan`). That is the right rule for the steps of others too. A step in the server room
should sound as close as one in the lounge, but the two rooms should sound different; today
they don't.

### Budget

`/page` is 422.0 of 430 KB. `yutopia-chars` (where locomotion lives) is 58.0 of 58, and
`yutopia-input` (the walker) is 15.0 of 15, both full. `yutopia-anim` (hero.ts) is 14.2 of 15.
The steps need their own lazy chunk (`yutopia-steps`, loaded like `jumps-load.ts`), with only a
few hundred bytes of hooks in the page and in chars. Even those hooks may not fit in chars;
raising its budget is the user's call (see the decisions).

## The choice: recorded steps

Noise through a filter can't sound like a boot on wood, however it's tuned. Footsteps are the
one sound heard all the time, and anything synthetic repeats fast. **Recorded CC0 samples** are
the plan, as the car engine and the lift doors already are:

- About 6 variations per surface, cut short (0.15–0.4 s), mono, levelled. At ~5 KB each that
  is ~0.5 MB for every surface, fetched on demand by `sfx.ts` (only the surfaces of the area
  you're in).
- Candidates: Kenney's *Impact Sounds* and *RPG Audio* (CC0, with concrete, grass, snow, wood,
  carpet and metal steps), Freesound's CC0 footstep packs (it was down when plan 26 looked), and
  OpenGameArt. Credits go in `public/sfx/CREDITS.md`.
- **The synth stays as the fallback.** A surface whose samples haven't loaded, or aren't there
  yet, plays today's sound. It's the same rule `sfx.ts` already has.

**Shoes as a modifier, not a sample set.** Three families, on top of the surface's samples:

- **hard soles** (boots, chelsea, laceboots, loafers, snowboots): a brighter heel and a little
  more weight;
- **soft soles** (sneakers, hightops, runners, slipons, flats): duller and softer (a low-pass
  and less gain), with a squeak now and then on tile and wet floors;
- **sandals**: a slap after the step.

This keeps the assets to one set per surface. If phase 0's listening shows a family needs its
own recordings (hard soles on tile, say), it gets them.

## The surfaces

Each surface is a sound family, and every place feet go maps to one of them. The `Floor` type
grows from 12 to these:

| Sound | Where |
|---|---|
| **wood** | indoor boards (`.`); the farmhouse, bar and diner floors; desk, table, counter, piano and bookcase tops |
| **hollow wood** | the stage (`~`); porches and porch steps; the trail's footbridge; the Kart Park's bleachers |
| **carpet** | carpet (`,`); the booths' felt (`:`); rugs; the standup mat |
| **tile** | tile (`_`); the lift car's stone floor |
| **concrete** | concrete (`c`); the stairs' treads; pavements, kerbs, the plaza and forecourts (`walk`); the HQ roof |
| **rock** | steep rock; boulders; the gatehouse floor |
| **asphalt** | roads, the lot (`a`), the Kart Park's circuit and bowl |
| **grate** | the server room (`x`); metal catwalks |
| **sheet metal** | car roofs and hoods; the road's steel bridge; arcade, vending and server-rack tops; the kart shed |
| **earth** | the barn's floor |
| **felt top** | the pool table |
| **snow** | fresh snow, the campus lawns, fields, the infield, snowy roofs |
| **deep snow** | the woods |
| **packed snow** | trails (`path`) |
| **ice** | the pond, the river |
| **slush** | roads and the lot in a storm, or while snow lies on them (`coverAt` / `patchAt`, as the cars feel it) |
| **black ice** | the cars' black-ice patches, read the same way |

Wet floors and puddles exist only in the shaders, so they're left out. If puddles ever become
real, they get a splash.

**Finding it at the feet: `underfoot(person)`.** One function, height-aware, used by the steps,
the landings and the walker's grip (which reads surfaces another way today):

1. **What's under the soles in Jolt.** `groundUnder` keeps its hit's body and sub-shape, and
   these map to a sound:
   - `thing:<id>` and `clutter:` → the catalog kind (a new `sound` field on the catalog's
     standable entries);
   - `car:<id>` → sheet metal;
   - `lift:<id>` → tile;
   - `grounds:` → its sub-shape's `GroundWhat` (kept in a small table beside the merged
     compound).
2. **Indoors:** the tile, then any flat thing lying on it (a rug or mat on that tile).
3. **Out on the Grounds:** `walk`, `rock` and `floor` are no longer folded together. `floor`
   is read per building (the barn's earth, the farmhouse's wood). A deck at the feet' height
   wins over the ground under it; ice under a bridge is ice.
4. **Weather on top:** asphalt becomes slush or black ice where the cars' grip says so.

## When a foot lands

- **Every person gets a footfall event**, `(side, strength, gait)`, from the body:
  - the gait phase crossing 0 (right) or `offL` (left), with `landF` choosing heel or ball;
  - the stepper's `landed`, for starts, stops, turns in place and the skid's brace.
  - The hook in locomotion is a single callback, which is what fits in chars.
- **When the body isn't running**, steps come by distance instead, alternating feet every
  stride length for the gait (the footprints' method). This covers `?anim=old`, reduced motion,
  before the anim chunk loads and people off screen.
- **Never in the air.** No step while airborne, in a Flowmotion move or in a verb. Those have
  their own sounds (below).
- **Loudness by gait.** Crouch is barely heard. Then walk, jog and sprint (sprint lands on the
  ball of the foot: shorter and sharper). A step backward is softer, and a hurt walk (`offL`
  shifted) limps in the sound too.

## Every other moment the feet meet something

| Moment | Sound | Today |
|---|---|---|
| Start and stop | a scuff on the surface (the stepper's first and last foot) | none |
| Turn in place, hop-turn | a pivot scuff; the hop-turn's two feet down at `ABOUT_DOWN` | none |
| Skid | the planted foot sliding (a short loop on the surface; it sprays on snow) | none |
| Jump takeoff | the push off the surface | yes |
| Landing (hop, flip, leap) | both feet on the surface found by `underfoot` (no longer "wood" on anything raised) | yes, wrong surface |
| Falling off an edge | the same landing, by fall height: absorb, hard (≥ 0.8 m), roll (≥ 2.2 m) | none |
| Ragdoll | thuds off the rig's speed on impact; cloth on the ground | none |
| Wall run | steps on the wall's material, with the kick off it | floor steps |
| Vault | a hand slap and the feet over | floor steps |
| Mantle and climb | a scramble: shoes on the face, hands on the edge | floor steps |
| Hang | the grip | none |
| Slide | friction on the surface, a loop for as long as it lasts | floor steps |
| Grind | metal on metal, a loop | floor steps |
| Swing and pole grip | the hands on the bar, the creak | none |
| Stairs | the same step player with the treads' concrete (the stair samples go) | separate synth samples |
| Lift | steps on the car's tile; the car's floor answers your landing | shaft tile |
| Kneel and crawl (the dark) | knees and hands on the surface | none |
| Emotes | the "tape" dance's side steps, the "fire" fist pump's stomp, the "wave" up onto the toes | none |
| Into and out of a car | the feet on the ground as you step out (the door clunk is there) | door only |
| Sitting and standing | the seat taking the weight (a creak per seat kind) | none |

Sitting is not feet, but it's the same body-meets-thing moment. It is listed so the next sound
plan can take it if it's left out here.

## Who

- **Me.** The full set.
- **Other players.** The same steps. Their gain comes from `hearingGain` (rooms, doorways,
  floors), their pan from `tp.pan`, and they're cut beyond 9 tiles. At most 12 nearest people
  step at once; past that, the farthest are dropped.
- **NPCs** (Vortex, the guard, the Kart Park's folk, the tables' Vortexes). They step like
  players, with shoes from their look.
- **Pets.** Paws are their own small sets: the dog's claws on hard floors and padding on soft;
  the cat silent except on snow; the rabbit's thumps; the capybara and platypus waddling; the
  parrot hopping. The dog already has a gait phase (`pets3d.ts:1861`); the others step by
  distance.
- **The shades** keep their own crunch. It's part of the dark's sound, not this plan's.

## Space

- **A room sound per area.** One shared reverb send, with a small impulse made in code for
  each kind of space:
  - a small room (offices, booths: short, damped);
  - a hall (the lobby, the tracking room: longer);
  - the stairwell and the lift shaft (hard, ringing);
  - the server room (metal);
  - out on the land (dry, apart from a slap off the near buildings in town);
  - the woods (dead).
  - The voices could share it later; this plan only sends steps and their moments to it.
- **Distance.** Far steps lose their top (a low-pass by distance) as well as their gain.
- **Through a doorway**, a step is muffled as well as quieter.

## The quality bar

1. **The sound lands with the foot.** Within one frame (17 ms) of the planted foot in the pose,
   for every gait. Checked in a test against the body's own phase.
2. **Never the same step twice in a row** on a surface, and pitch and gain vary a little each
   time.
3. **Every surface in the table above** has its own sound at the feet: a walk across each one
   (e2e, with a debug log of every step heard: surface, side, who) finds no gaps.
4. **No steps in the air**, and every landing (jump or edge) has one.
5. **Others are heard by the room rules**, the same as their voices.
6. **Budget:** the page and chars grow by hooks only (under 0.5 KB together). The steps are
   their own lazy chunk, and the samples are fetched only for the area you're in.
7. **Performance:** no frame cost you can measure with 12 people walking near you (the
   perf overlay), and no more than ~40 audio nodes alive at once for the steps.

## The phases

**0 — The listening bench.** `/dev/steps`: every surface × the three shoe families × walk, jog,
sprint and crouch, played side by side with today's synth and looped on a walking figure, so the
timing is heard against the feet. The candidate samples come from the CC0 sources above, with 2
or 3 choices per surface where they differ. **The user listens and picks before any game code.**

> Built 2026-11-01: `/dev/steps` (`app/dev/steps/page.tsx`). Space plays, 1–4 the gait (crouch,
> walk, jog and sprint at 2.4, 2.4, 3.8 and 4.6 steps/s: 2 × KH_MOVE's speed ÷ hero.ts's stride),
> Q W E the shoes, ↑ ↓ the surface, ← → the candidate; ★ picks, kept in the browser, and
> "copy picks" gives the JSON. 55 candidates, all CC0, were offered: 296 steps, 1–6 recordings per
> surface. 41 came from Freesound (its HQ previews, cut into single steps by onset and levelled)
> and 14 from OpenGameArt's packs (already single steps, trimmed and levelled). Freesound refused
> this machine for about an hour after the search (403 on every page), so its previews were
> fetched 3 s apart once it answered. The shoes and the gait are filters on one set of samples, as
> decided: hard soles a high shelf (+3 dB over 2.5 kHz), soft soles a low-pass (3.4 kHz) and −3 dB
> with a squeak now and then on tile and wood, sandals a slap 60–80 ms after the step; a crouch at
> −13 dB and dulled, a sprint's step cut to 0.24 s.
>
> **Signed off 2026-11-01: the user picked one recording for every surface.** They are in
> `public/sfx/steps/` as `<surface>-<n>.mp3` with a `manifest.json` (99 steps, 516 KB; credits in
> `public/sfx/CREDITS.md`), and the bench now plays them. The other candidates are gone.
>
> | Surface | Picked | Steps |
> |---|---|---|
> | wood | *Wood Steps*, Phil25 (Freesound 208104) | 6 |
> | hollow wood | *Footsteps on hollow wood*, florianreichelt (459970) | 6 |
> | carpet | *FootstepsCarpet*, MindlessTrails (509534) | 6 |
> | tile | *Footsteps on Tiles*, RutgerMuller (50725) | 6 |
> | concrete | *Footsteps on concrete*, florianreichelt (459964) | 6 |
> | rock | *Stone Steps*, Phil25 (208103) | 5 |
> | asphalt | *footsteps shoes walk road asphalt hard*, kyles (637556) | 6 |
> | grate | *Walking and running on a steel floor*, SoundsofTheMachine (809440) | 6 |
> | sheet metal | *Footsteps On Metal*, IENBA (834029) | 6 |
> | earth | *Footsteps_6_Dirt_shoe*, monte32 (353799) | 6 |
> | felt top | *FOLEY_Footsteps_Carpet_001*, conleec (148466), damped | 6 |
> | snow | *Hard Crunchy Snow*, mshahen (559459) | 6 |
> | deep snow | *Snow Shoes*, Corsica_S (OpenGameArt) | 8 |
> | packed snow | *Walking in Snow*, Corsica_S (OpenGameArt) | 8 |
> | ice | *Walking on Crunchy Ice*, courter (447822) | 6 |
> | slush | *Footsteps on slush*, xkeril (611278) | 6 |
> | black ice | ice's, damped | — |
>
> For phase 2: the levels are kept as they were heard on the bench (tile and earth ~8 dB under
> the rest), so the game's per-surface gain sets the balance; the cutting tool stayed in the
> scratchpad, so new cuts would need it written again (or taken from these files).

**1 — The surface under the feet.** `underfoot()`: Jolt's hit names its body; the catalog's
`sound` field; the Grounds' `GroundWhat` table; `walk`, `rock` and `floor` split; decks over
ice; weather on top. The walker's grip reads it too. Tests: a table of points (a desk top, a car
roof, the footbridge, the ice under the road bridge, a rug, the lift car) and the surface each
must give.

> Built 2026-11-01 (uncommitted).
>
> - **Jolt names what's stood on.** `PhysicsWorld` keeps each body's key (`underKey()`: the last
>   groundUnder's static key or car id), and `JoltCollider.underfoot(x, y, z)` gives the top and
>   what it is: "land", `slab:L:…`, `thing:id`, `car:id`, `lift:id`, `roof:L:…`. A Grounds chunk's
>   compound doesn't say which of its things was hit, so `physics/build.ts groundsThingAt` finds
>   it by where and how high (`shapes/grounds.ts groundSolidAt`, in the chunk of the thing's
>   middle). The client's `tp.underfoot` gives `grounds:roof`, `grounds:porch` and so on.
> - **The 17 footings** are in `shared/footing.ts` (the page's: tiles, rugs and mats, the things
>   stood on, `keyFooting`). Instead of a `sound` field in the catalog, it keeps a small table
>   by kind. The Grounds' side is in `grounds.ts` (lazy): `footingAt` (the surface; `walk` →
>   concrete and `rock` apart; a town building's floor by its kind; the roads' slush and black
>   ice from `patchAt`, moved here from car/world.ts; snow on a road under a storm's cover; with
>   `under`, the land under a bridge, so the river's ice), `whatFooting` (roofs snow, porches and
>   stands hollow, a bridge deck by its way: the footbridge hollow, the road's steel sheet).
> - **The controller's `footingAt(x, y, z)`** feeds my steps (looked again every 0.2 m or 0.1 m
>   up or down) and every landing (no longer "wood" on anything raised). The synth's tables
>   cover the 17 until phase 2's recordings.
> - **Not done:** the walker's grip still reads `surfaceTileAt`. Changing it would change how
>   movement feels on ice and snow, which isn't this plan's job. The lift car is its shaft's
>   tile (`_`, already tile), since its walls are its only body.
> - **The trap found:** `grounds.ts` importing values from `footing.ts`, a module the page also
>   has, put the Grounds chunk up 8.5 KB (its modules no longer merged: every export spelled
>   out). The Grounds now import only its type. Against HEAD: page 421.9 → 422.6 KB, Grounds
>   175.1 → 175.7, chars unchanged (58.0).
> - **Checked:** `shared/footing.test.ts` (the pond, a road and a storm's snow on it, a trail, the
>   woods, the road bridge's deck and the ice under it, the footbridge, five town floors, a roof),
>   `physics/underfoot.test.ts` (the floor, a desk, a car's roof, a key gone with its body, the
>   land over the floor, a desk in the HQ), and `e2e/footing.spec.ts` in the game as Bia (each
>   floor tile of her floor, a desk's top; read only). Shared 478, client 120, world-server 187;
>   types; Biome; build and budget.

**2 — The footfall.** The callback in locomotion (gait phase and stepper), the distance fallback,
and the air and verb gates. The steps chunk (`yutopia-steps`) with its sample bank, round-robin
variation, shoe modifiers and gait loudness. Me first, so the user can walk it.

> Built 2026-11-01 (uncommitted).
>
> - **The hook is FootLock's, not the gait phase's.** Plan 58's FootLock (`hero.ts`, the anim
>   chunk) already knows the moment each foot is put down. Its `down` lists this frame's feet
>   put down after they'd been lifted: a foot slid and pinned again isn't a step, and nothing
>   counts out of the air, a verb or a move, nor the first foot down after them (the landing has
>   its own sound). That covers the cycle's steps and the stepper's starts, stops and turns. The
>   3D person reads it after each frame and clears it (`seen.step`), only when it's on screen
>   and stepped every frame. `Motion3.loco` and `Locomotion.lock` lost `private`, which emits
>   no code, so `yutopia-chars` is unchanged (58.0). The anim chunk is 14.2 → 14.3.
> - **The distance fallback.** Where the body isn't stepping (first person, `?anim=old`, reduced
>   motion, before the chunk's in), a step comes every half a stride walked (walk 0.62 tiles,
>   crouch 0.66, jog 1.31, sprint 1.77), but only when the body hasn't stepped for 0.7 s.
> - **The player** is `world/steps.ts`, a chunk of its own (`yutopia-steps`, 1.7 KB). The
>   surface's recordings are fetched the first time it's under the feet. Each surface is
>   brought to −22 dB RMS (×0.5–×3), so tile and earth are no longer quiet. It never plays the
>   same step twice running, varies pitch ±4 % and level ±1.5 dB, and applies the bench's shoe
>   and gait filters. The shoe family comes from the avatar's shoes (boots, chelsea, loafers:
>   hard; sandals; the rest soft). The synth (`sound.stepSynth`, the old timer gone) plays
>   while a surface's recordings load. `/dev/steps` plays through the same player.
> - **Gates (the controller):** none in the air, a verb, a Flowmotion move or a jump. On the
>   stairs the stair samples play as before, until phase 4.
> - **Checked:** `world/steps.test.ts` (the shoes; the levelling; FootLock over a run gives two
>   steps a stride, the feet in turn, each near its landing, none off or just after; the whole
>   body walking at 1.5 m/s gives 2.40 steps/s, the stride says 2.43) and `e2e/steps.spec.ts`
>   in the game as Bia (R L R L R from the body as she walks, 0.25 s apart on wood, and none
>   once still). Shared 478, client 124; types; Biome; build and budget. Page 422.6 → 423.1 KB
>   (with phase 1, +1.2 over HEAD: over this plan's own under-0.5 KB target, inside the 430
>   budget).

**3 — Everyone else.** Other players, NPCs and pets, positional by the room rules, with the voice
cap.

> Built 2026-11-01 (uncommitted).
>
> - **`Footfalls`** (`world/steps.ts`, the steps chunk: now 3.0 KB) takes the controller's
>   bodies each frame: everyone drawn (players, the guard, the Kart Park's folk, Vortex, pets).
>   It keeps the 12 nearest within 9 tiles on my floor who are walking on their feet (not sat,
>   in the air, a verb or a move). It plays their body's footfalls (the view's `onStep` now
>   passes everyone's, when they're on screen). Otherwise it plays a step every half stride they
>   go, after 0.7 s without one from the body: off screen, Vortex (drawn flat), people far off.
>   The gait comes from their `mv` byte, or else from their speed. The shoes come from their
>   avatar.
> - **Positional, by the voices' rule.** The gain is `hearingGain` with its hysteresis (7 tiles
>   in the room, 4 through a doorway, a private room sealed, another floor silent); the pan is
>   the camera's (`tp.pan`); the footing is the controller's `footingAt` at their feet.
> - **Pets' paws:** no new recordings. The surface's own steps are played short, light and
>   higher by species (the dog every 0.22 tiles with its claws ticking on hard floors; the
>   rabbit's slow thumps; the capybara, the platypus, the parrot's hops). A cat is barely heard,
>   except in the snow.
> - **Checked:** `world/steps.test.ts` (8: someone walking by gives a step each half stride from
>   left to right; a jog by its byte; the body's steps alone when it's stepping; nobody heard
>   sat, in the air, on another floor or past 9 tiles; only the 12 nearest of 20; a dog's
>   claws; a cat in the snow 4× louder than indoors) and `e2e/steps-others.spec.ts` (Cai walks
>   past Bia: 4 steps heard on wood, at a jog, fading from 1.0 to 0.5 as Cai goes). Client 128;
>   types; Biome; build and budget (page 423.3 KB, +0.2).

**4 — The other moments.** Landings by surface and height, edge falls, starts and stops, pivots,
skids, Flowmotion (wall run, vault, mantle, slide, grind, swing), ragdoll, stairs on the step
player, the lift, kneel and crawl, emotes, stepping out of a car, sitting.

**5 — The space.** The reverb send per area, distance filtering, muffling through doorways.

**6 — The checks.** The quality bar above: the sync test, the e2e walk with its step log on
every surface, the budget, the perf with 12 walkers, and a last listening pass by the user in the
world.

## Decisions

Decided by the user, 2026-11-01:

1. **Recorded CC0 samples**, with the synth as a fallback.
2. **Shoes**: three families (hard, soft, sandals) as modifiers on one set of samples.
3. **The room reverb** is in this plan (phase 5).
4. **Pets' paws** are in this plan (phase 3).

Still open:

5. **The chars budget**: if the footfall hook doesn't fit in `yutopia-chars` (58.0/58), raise it
   by up to 0.5 KB, or move something out of chars to make room. To be asked in phase 2, once
   the hook is measured.

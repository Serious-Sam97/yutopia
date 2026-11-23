# Plan 121 — NPCs on the map

Asked 2026-11-23, after plan 120 (the cast):

> And how do we add a npc on the map?
>
> Then lets plan the next!

Plan 120 made the cast: every NPC, made and changed on `/admin/npcs`, with their look, name, lines and stored
behaviour. The ones made there wait off the map. This plan puts them on it, in God mode, and has the world play their
behaviour.

Status: **planned 2026-11-23; forks decided 2026-11-23, one by one; built 2026-11-23 (phases 1–11); the user tested it ("it's good") and it was pushed 2026-11-23.**
- **F1a** the draft;
- **F2a** one place each;
- **F3c** the town's people fully placeable:
  - **F3.1a** their own way of life swapped for the type while placed, and back once the placement's gone;
  - **F3.2a** Vortex stays his own, not placeable;
- **F4c** outdoors, inside the town's buildings and inside the studio:
  - **F4.1a** a building and a storey picked, the roof and the storeys above hidden;
- **F5a** the navmesh;
- **F6a** a circle;
- **F7a** answers aloud;
- **F8, the user's own answer: a home.** Each NPC can be given a house (a town building), and out of their hours
  they walk to it:
  - **F8.1a** they stay inside, on its ground storey, seen by whoever goes in;
  - **F8.2, the user's own:** without a home they keep on doing what they do, their hours aside;
  - **F8.3a** many to a house;
- **F9b** no cap (perf measured, not limited);
- **F10b** built straight through, the user tests at the end.

## Where we are, from the code

- **The cast** (plan 120):
  - shared `npc/cast.ts` `NpcDef`: name, role, look, voice, lines by moment, and the behaviour (type `stand`,
    `wander`, `route`, `counter` or `sit`; hours; pace; talk; greet, answer, shots);
  - kept by the API (`npcs`), pushed live to the world server (`room.cast`, the features' `cast` hook);
  - the town's people are made by their own features; anyone else is made by nothing yet.
- **God mode** (plans 53, 55, 102, 109) is admin-only, over the outdoor land.
  - Its edits are `GroundsEdits` sections (`add`, `change` and `remove` by key) in a named draft. Publishing makes a
    revision; a revision can be rolled back.
  - Vehicles (plan 102) are the nearest model:
    - each vehicle in the `vehicles` section is a *home*;
    - the server reconciles the world to `homesOf(edits)` on publish and on rollback (`land.ts onEditsLaid`);
    - the client draws the draft's vehicles for the admin alone (`vehicleSteps`, `Cars.setGodView`);
    - Select picks one: drag, R, Delete;
    - the Vehicles tool holds a ghost under the pointer, green where it can stand and red where it can't.
  - The God chunk is 26.8 of 27 KB, so a tool needs the budget raised (allowed, measured and noted).
- **Walking**: the server has a navmesh for every floor (`room.nav`, `wayFor`, and `wayThrough` through a town
  building's door, plan 112). The guard and the Kart Park's folk walk straight legs along fixed ways; Vortex walks the
  studio's navmesh.
- **What an NPC can show**: `Npc` has a place, a facing, a clip (`ANIM` idle, walk, sit), a mood, a line, a floor
  (`level`), and plan 120's name, role and look. The Strike Park's bots crouch and run through `mv` (`packMv`), drawn
  by the client's `folk()` path.
- **Time**: `room.state.hour` (0–24) and `nightness(hour)`.
- **Talking to someone**: the client's targets list Vortex (`npc:vortex`, act `poke`). Nobody else among the NPCs can
  be talked to.
- **People cost frames**: on friends' machines people are ~3.5 ms a frame (plan 90). The client draws people within
  the view distance.

## The idea

**God mode gets an NPCs tool.**
- It shows the cast: the ones made there, and who's already placed.
- Pick someone, and they're held under the pointer as themselves, turning with R, green where they can stand and red
  where they can't.
- A click puts them there. Then their type asks for what it needs:
  - **stand**: that spot, facing where you turned them;
  - **counter**: that spot, facing across the counter; they turn to whoever comes up;
  - **sit**: a seat (a bench, a chair), clicked;
  - **wander**: an area round that spot, its size dragged;
  - **route**: points clicked one after another, then Enter; a loop or there and back.
- Like everything in God mode, it's the draft's until you publish. Select picks a placed NPC to move, turn, change or
  take away.

**The world plays them.** The server walks each placed NPC by their type, on the navmesh, at their pace, in their
hours. They say their lines on their own as often as they talk, greet someone coming near, answer X, and duck or run
from shots, as the cast says. Changing them on the cast page changes them in the world at once, as the town's do now. Given a
home, they walk to it when their hours end and stay inside till morning. The town's people (all but Vortex) can be
placed too, their own ways set aside while they are. Insides count: a building's storey, or the studio's, picked in
God mode.

## Forks — decided 2026-11-23 (asked one by one)

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | Where a placement lives | **a)** in the draft, a new `npcs` section of the Grounds' edits, published with revisions and rollback, as the vehicles are · **b)** straight into the world as you click | **a** |
| F2 | One NPC, how many places | **a)** one (a crowd made with Copy on the cast page) · **b)** many: each placement the same person again | **a** |
| F3 | The town's people | **a)** not placeable · **b)** their posts movable · **c)** fully placeable, their own way of life swapped for a type | **c** |
| F3.1 | A town NPC placed | **a)** their own way of life stops, they do the type given; the placement gone, back to their own · **b)** chosen each time: their own with the post moved, or a type | **a** |
| F3.2 | Vortex | **a)** his own, not placeable · **b)** placeable, his fight and ways off while placed | **a** |
| F4 | Where they can be put | **a)** outdoors · **b)** also inside the town's buildings · **c)** b and the studio | **c** |
| F4.1 | How God mode shows an inside | **a)** a building (or the studio) and a storey picked: the camera goes down to it, the roof and the storeys above hidden · **b)** placed from inside, walking the draft | **a** |
| F5 | How they get about | **a)** the navmesh (round things, through doors, up stairs) · **b)** straight lines | **a** |
| F6 | A wanderer's area | **a)** a circle, its size dragged · **b)** a shape drawn | **a** |
| F7 | Talked to (X) | **a)** aloud, a bubble everyone near sees · **b)** to the one who asked only | **a** |
| F8 | Out of their hours | **a)** walk off out of sight · **b)** gone on the spot | **the user's: a home** — each NPC can be given a house; out of their hours they walk to it |
| F8.1 | At home | **a)** they stay inside on its ground storey (standing, or on a seat there), seen by whoever goes in; out of the door in the morning · **b)** in at the door and gone | **a** |
| F8.2 | No home | **a)** walk off out of sight · **b)** gone on the spot · **c)** a home required | **the user's: they keep on doing what they do** (hours only matter with a home) |
| F8.3 | Many to a house | **a)** yes (a family, the hotel's staff) · **b)** one to a house | **a** |
| F9 | How many | **a)** at most 60 · **b)** no cap | **b**: no cap; the cost measured (60 and 120 placed) and said |
| F10 | Sign-offs | **a)** stills first · **b)** built straight, tested at the end | **b** |

## Guardrails

- God mode stays admin-only on the server (plan 48): every new message refuses anyone else.
- No placements, no change: with an empty `npcs` section the world is exactly plan 120's.
- A placement whose NPC is deleted from the cast is left out of the world (and the draft says so), not an error.
- Vortex is never placed (F3.2a).
- A placed town NPC is back to their own way of life when the placement is taken away or rolled back.
- Placed NPCs never block players (no collision with people) and never take a seat someone's in.
- The navmesh as the server has it: a way that can't be found means they stand where they are, never a straight walk
  through walls.
- Perf: the server's NPC tick measured with 60 placed; the client draws them as people within the view distance; the
  memcheck counts them.
- Page budget measured; God mode's code stays lazy (its chunk raised if needed, noted).
- The shared dev world: the e2e publishes and rolls back its own draft, and never deletes a town NPC.
- Commit on main; push when asked; no co-author line.

## The phases

1. **The section** (shared):
   - `NpcPlaceDef` in `GroundsEdits.npcs`, keyed by the cast NPC (one place each, F2a). It holds the place (`x`, `z`,
     `a`, and `level`: 0 the land, a town building's storey, a studio floor) and what the type needs: a seat's id, a
     circle's radius, or a route (points with their floor, loop or there and back, a pause at each). Also `home`: a
     town building's key, or none.
   - `placesOf(edits)`.
   - The draft's checks: off the land, in water, inside a wall, a route or a home with no way to it, Vortex refused
     (F3.2a), an NPC no longer in the cast. Tests.
2. **The server makes them** (`features/npc-life.ts`):
   - On boot, publish and rollback, the placed NPCs are reconciled to `placesOf(edits)` and the cast: made, moved or
     taken away, dressed as plan 120 dresses the town's, and a cast change taken live.
   - A placed town NPC is let go by their own feature (park-life, strike-life, the guard: F3.1a) and taken up by this
     one. With the placement gone, they're back to their own. A kart visitor leaves their seat first.
   - Tests in an offline room.
3. **The brains**, one per type, on the navmesh (`room.wayFor`, and `wayThrough` through a town building's door,
   F5a):
   - **stand**: the spot, turning about now and then;
   - **counter**: the spot, turned to the nearest person within 4 m, else back across the counter;
   - **sit**: walks to the seat and sits (`ANIM.sit`, the seat's height); never on a seat someone's in, and up if a
     player wants it;
   - **wander**: a point in the circle (F6a) on their floor's navmesh, walked to, a while there;
   - **route**: the points in order, each leg on the navmesh (floors joined through doors and stairs), a pause at
     each, a loop or there and back.
   - Pace and talk as the cast says. No way found: they stand where they are, never walk through walls.
4. **Hours and homes** (F8):
   - with a home, out of their hours they walk to its door and in (`wayThrough`), then stay on its ground storey,
     standing or on a seat there (F8.1a); they come out of the door when it's time, back to their place;
   - many to a house (F8.3a), each their own spot inside;
   - without a home, their hours don't matter: they keep on (F8.2).
5. **Reactions**:
   - **greet**: a `greet` line and a wave to someone coming within 3 m, once a person every few minutes;
   - **answer**: X "Talk" on them, a line from `answer` said aloud (F7a);
   - **shots** near them (`arms.ts`): **duck** is crouched a few seconds, **flee** runs away from the shooter on the
     navmesh and comes back after.
6. **The client draws them** as the town's folk (plan 120's name, role and look), crouched and running through `mv`,
   with their bubble and the "Talk" target. A town NPC placed elsewhere is drawn there; nothing else changes.
7. **God mode, the NPCs tool** (outdoors):
   - the cast list: the made ones and the town's (not Vortex), placed or not, and where;
   - the held ghost as their own 3D person, green or red, R to turn, click to place;
   - then the type's step: a seat clicked, a circle dragged, route points clicked then Enter (loop or there and back),
     and a home: a building clicked, or none;
   - the draft's NPCs drawn for the admin alone; the publish dialog counts them.
8. **God mode, the insides** (F4.1a): a town building or the studio picked, and a storey. The camera goes down to it,
   the roof and the storeys above hidden. The NPCs tool and Select work there as on the land. A route can cross
   floors through doors and stairs.
9. **God mode, Select**:
   - a placed NPC picked (smaller than a vehicle, larger than a thing), dragged, R, Delete;
   - their panel: the type's step again (route, circle, seat), the home, "Open on the cast page";
   - their route and circle drawn while picked.
10. **The cast page**: each card says where they are ("placed · by the bakery · lives in house w2", "not on the map
    yet"); a placed town NPC's type is editable there while placed.
11. **Checks**:
    - shared and server tests;
    - an e2e spec: a stander, a router and a homed one placed and published; seen from a second player, walking; one
      talked to; the night sends the homed one in; rolled back, gone;
    - perf with 60 and 120 placed (the server's tick, the client's frame on Low), said, not capped (F9b);
    - memcheck and the page budget.

## Progress

- **Phase 1** (c1b923d8):
  - shared `npc/places.ts`: `NpcPlaceDef`, `placesOf`, `checkNpcPlaces`, `placedType`, `onDuty`;
  - `GroundsEdits.npcs`, counted by `editsCount`;
  - a placement's optional `type`, for what a placed town NPC does (their cast type is their own and stays fixed);
  - tests.
- **Phases 2–5** (the server):
  - `room.placed` is worked out before the town's features are made. `room.castFree(key)` is what park-life,
    strike-life and the guard now ask, so a placed one isn't theirs. `room.setPlaced` tells them through the `cast`
    hook when it changes.
  - `features/npc-life.ts` plays every placed NPC: `place:<key>`, kind folk, dressed from the cast and taken live.
    - stand, counter (turned to whoever's within 4 m), sit (the seat at their spot on its floor's grid; never one
      someone's in; up and aside 30 s for someone at it), wander (a point in the circle, on the navmesh), route (stops
      in order, legs on the navmesh, a pause, a loop or back);
    - walks are legs, one floor each, joined at a town building's door (land ↔ its ground storey, or one building to
      another). No way: they stay and try again in 20 s;
    - a home: out of their hours they walk to its door and in, then sit on a free seat there or stand. Back out when
      it's time. Without a home, hours are ignored;
    - talk (× their rate, someone within 10 m), greet (3 m, once a person every 3 min, a line and a wave);
    - `npc:talk` (X): an answer aloud, within 3 m;
    - shots: arms.ts calls the new `shot` hook. Within 25 m they duck (`mood` "duck", 4 s) or flee (14 m away on the
      navmesh, `mood` "run", back after 9 s).
  - Tests `npc-life.test.ts`, an offline room:
    - Maya (a kart visitor) placed: the Kart Park lets her go, back once she's off the map;
    - Dora wanders within her 4 m circle and answers X aloud, EN|PT;
    - Ned's shift over, he walks in at house-w0's door to its storey;
    - Vortex never placed;
    - a shot makes one duck and the other run away.
  - Neighbouring tests pass, run alone: run all at once, Daybreak and Vortex's scaling time out on a starved machine.
- **Phase 6** (c3e63285): placed NPCs are drawn as the town's folk.
  - `mood` "wave" is the wave emote, "duck" crouched, "run" jogging.
  - `Npc.talk` (they answer) puts a "Talk" target on them (`act_talk`). X or a click sends `npc:talk`; Vortex is
    still poked.
- **Phases 7–9** (God mode):
  - **The NPCs tool** (N, `world/god/npcs.ts`, the HUD's `NpcsPanel`):
    - the cast from the API (Vortex left out), searched, each marked placed or the town's;
    - one held: drawn as themselves under the pointer (`tp.godBodies`) with a green or red ring; R or the wheel turns
      them; a click puts them down (`putPlace` into the draft's `npcs`, kept whole in `add`);
    - the picked one's panel: what they do (the five types; a town NPC's own set aside), the circle (a slider),
      the route (clicked stops, Enter ends, Backspace takes one back, round again or back, a pause), a home (a town
      building with a ground storey clicked, or none), off the map, open on the cast page;
    - the draft's placed ones that differ from what's published are drawn for the admin; the picked one's circle
      and route as lines.
  - **Insides**: "Where" lists every town building's storeys (by their names) and the studio's floors above its
    ground.
    - Picking one shows that floor: `WorldController.viewLevel()` feeds the 3D view, the camera goes over its middle
      at 24 m, and the building's outside is cut (`tp.god.cut` → the Grounds' `cutFor`). The storey above isn't drawn
      either (`floorShown`, as in build mode).
    - The pointer meets the floor's plane (the scene's 0 there).
  - **Select** picks a placed NPC before anything else under the pointer, on the floor shown: drag, R, Delete; the
    same panel.
  - Fixed on the way: the NPCs panel ran under God mode's pointer readout at the bottom right (its height cut), and
    the tool bar says N.
  - e2e `godmode-npcs.spec.ts` (its own draft and NPC, both deleted after; no world fixture swapped, Ana's other
    drafts left alone):
    - one held from the list and placed by the houses, made a wanderer of 8 m with house-w0 as home, published (in
      the world as `place:<key>`), rolled back (gone);
    - the bakery's ground floor shown with its outside and the storey above cut away, one placed on it (its floor,
      inside its plot).
- **Phase 10** (0a9bd956): the cast page reads the published edits. Each card says "placed · outdoors", "placed ·
  indoors", the town's, or not on the map yet. The editor says where, which way they face, and where they live. The
  page opens on `?key=` (God mode's "Open on the cast page").
- **Phase 11, checks**:
  - **perf, the server**: an offline room, npc-life's own tick, 20 s each, wanderers and routes about the houses, all
    greeting and talking often, a player among them:
    - 0 placed: 0.005 ms;
    - 60 placed: 0.41 ms mean, 1.36 p95, 3.5 max;
    - 120 placed: 0.69 ms mean, 1.65 p95, 3.3 max;
    - (a 50 ms tick at 20 Hz.) The people near are now listed once a tick, not once an NPC.
  - **perf, the client**: Bia on Low, this Mac's GPU, standing among them by the houses, all of them in view: 0
    placed 60 fps, 60 placed 60 fps, 120 placed 50.5 fps. A weaker machine (friends' M1s, plan 90) will feel it
    sooner: people cost ~3.5 ms a frame there. No cap (F9b): said, not limited.
  - **budget**: /page 497.0 of 498 KB, grounds 182.7 of 205. God mode's chunk went 26.8 → 31.0 KB (the NPCs tool
    and its panel), over its 27, so it's raised to 32 (`tools/budget.mjs`, noted there).
  - **tests**: shared 871, client 478, world-server npc-life, cast and schema; e2e cast.spec and
    godmode-npcs.spec (2).
  - **Not run**: the older God mode specs (godmode*.spec) clear all of Ana's drafts and swap the world's fixture on
    the shared dev world. The memcheck isn't run either.

## Left for later

- **Routes and homes across floors** go through a town building's door only: the land and its ground storey, or
  one building to another. An upper storey or a studio floor above the ground has no way out (no stairs in the
  walk), so a home or a route stop there leaves them standing where they are.
- **Sit outdoors**: a seat is a world thing's (furniture). The Grounds' benches aren't seats, so a "sit" put on one
  stands by it.
- **The God mode draft's view** draws a placement that differs from what's published. One taken off the map in the
  draft still shows in the world till it's published.
- **The memcheck** with placed NPCs, and the older God mode specs, are to run when the shared world is free for it.


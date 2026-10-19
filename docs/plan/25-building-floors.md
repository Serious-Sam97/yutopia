# The building — real floors, stairs, elevators and the parking lot (plan — delivered 2026-10-19, see PROGRESS)

> Built on the `standalone` line (Yutopia's own server in `apps/api`, one
> world): where this plan says Yondra, read `apps/api`. Mocks approved:
> `design/screens/building/01–07`.

Ask (2026-10-19): "I want to create a space outside the office space we're in.
1 — make the building a real building with floors; 2 — add staircase and
elevators; 3 — for this first test, take the parking lot we created on the 3D
view (it's already based on *Ruptura*) and make it accessible."

## Short answer

Today a space is **one flat map**: one tile grid, one set of walls, one
ground plane at y = 0. Everything — the grid, A*, the server's move check,
hearing, areas, the light map, iso and 3D drawing — works in (x, y) only.
The four storeys under the studio, the entrance and the parking lot are
**scenery** in `tp/campus.ts`: no tiles, no collision, the main block hollow
behind a one-sided facade.

So this is a model change first and art second:

1. **Levels in the map.** A space gets `levels[]`; each level is today's map
   (tiles, walls, areas) with its own size, an origin in building
   coordinates and an elevation. Objects and players carry a `level`.
2. **One grid per level.** Collision, A*, jumps and the server's move check run
   on the player's level. A level change is a server-checked step through a
   **link**: a stair or an elevator.
3. **Stairs** you really walk up (a ramp in height, a hole in the floor above
   it); **elevators** you call, ride and step out of, with doors everyone sees.
4. **Ground level = lobby + parking lot**, outdoors and walkable: the lot's
   bays, cars, lamps and snow banks become tiles and objects, the entrance
   vestibule gets a real door into a lobby with the elevator bank and the
   stairwell.
5. **Drawing by level**: 3D stacks the levels at their elevation and cuts away
   what's above you (Sims-style); iso shows the level you're on.

No new service. The backend change is small but in two repos: Yutopia's
world-server and Yondra's `YutopiaInternalController` (whitelist + spawns).

## Locked decisions (2026-10-19)

| Topic | Decision |
|---|---|
| Middle floors (1–3) | **Blank and walkable** now: concrete, the curtain wall, the core; furnished later in build mode |
| Views | **Both**: iso shows the floor you're on (Sims-style) and draws the lot; 3D stacks the floors |
| Themes | **Removed.** The world is the snow campus, one real place — no clouds, no city, no theme picker |
| Cars | **Real objects**: solid, you can jump on the roof, builders can move them, iso art too |

## L0 — One world: no more themes

The world is going to be real, so the theme stops being a choice:

- `packages/shared/src/map.ts`: drop `THEMES` / `Theme` / `isTheme` and
  `MapDef.theme`; `map-edit.ts` `Layout.theme` read and ignored (old saves
  still load), never written.
- `protocol.ts` / `features/mapedit.ts` / `history.ts`: remove `map:theme`.
  `schema.ts` `SpaceState.theme` goes.
- Client: `art/themes/clouds.ts` and `city.ts` deleted, `snow.ts` becomes the
  iso backdrop (folded with `common.ts`, `themes-load.ts` simplified);
  `tp/sky.ts` always builds the `Campus`, the `shell()` / city / cloud branches
  go, `fogFor()` loses its argument. `MapPanel.tsx` loses the theme row;
  `StudioThumb`, `dev/3p` and `dev/shots` stop passing a theme.
- Yondra: the `theme` rule in `YutopiaInternalController::layout` accepts and
  drops the key (old clients), the column/JSON key is left to die.
- Tests: `rooms.test.ts`'s theme case goes; visual shots re-taken.

The phone's own UI theme (light/dark) is unrelated and stays.

## The building we're building (first test)

The *Ruptura* block as it stands outside the windows today, made real:

| Level | Elevation (tiles) | What's on it |
|---|---|---|
| G (0) | 0 | **Lobby** (reception desk, the long white corridor, elevator bank, stairwell) + the **parking lot** and the entrance path, outdoors |
| 1–3 | 3.5 / 7 / 10.5 | **Blank office floors**: concrete, the curtain wall, the core (elevator + stairs). Builders furnish them later with build mode |
| 4 — Studio | 14 | Today's map, unchanged: every object, wall and area keeps its coordinates |

`STOREY = 3.5` tiles (the campus already uses it; the studio's walls are
3.27, the rest is ceiling + slab). The studio stays the top floor, so the
view out of every window is the same as today.

## L1 — Levels in the data (shared)

- `packages/shared/src/map.ts`
  - `LevelDef = { key, name, width, height, ox, oy, elev, outdoor?, tiles,
    hWalls, vWalls, hBacks?, vBacks?, areas }` — `ox, oy` place the level in
    building coordinates (the studio is `0, 0`, so nothing in it moves; the
    ground level starts at a negative `ox` to take in the lot). Coordinates
    *inside* a level stay ≥ 0, so Yondra's 0..1000 object check holds.
  - `MapDef` keeps its fields as **the default level** and gains
    `levels?: LevelDef[]` and `home: number` (the level today's map is).
    A map with no `levels` is a one-level building — every existing space
    loads unchanged.
  - `levelOf(map, i)`, `areaAt(map, level, x, y)`, `tileAt(level, …)`.
- New outdoor floor chars: asphalt, painted bay line, kerb/sidewalk, snow
  (walkable, slower, footprints), deep snow bank (blocks). Footstep sounds
  per char as today.
- `map-edit.ts`: `Layout.levels`, `layoutFromMap` / `mapFromLayout` /
  `validLayout` per level; every edit op takes a level. `MAP_MAX 96` stays
  for indoor levels; outdoor levels go to 160 (the lot + lobby is ~110 wide).
- **Links**: stairs and elevators are catalog objects with a footprint and
  `props.levels` (which levels they serve). The shared `links(map, objects)`
  lists them per level for the grid, A* and the server.
- Objects: `props.level` (free JSON already survives the round trip to Yondra;
  no column). Missing = `home`.
- `history.ts` snapshots all levels.

## L2 — Movement and the server

- `grid.ts`: `Grid.from(map, objects, { uid, level })` — one grid per level,
  cached per level (and per uid for locked doors, as now).
- **Stairs**: the stair's tiles on the lower level have a `ramp` top that rises
  along the flight from 0 to `STOREY` (a half-landing turns the flight).
  `groundAt` reads it, so walking up raises `z` smoothly; jumps on stairs work
  as anywhere. The same tiles on the level above are a **hole** (void) with a
  half-wall railing (`h`, already a wall type) except at the top landing.
  Crossing the top edge with `z ≥ STOREY − STEP` moves you to `level + 1`,
  `z − STOREY`; going down is the reverse. The server allows the climb only on
  ramp tiles (the `STEP` cap stays everywhere else).
- **Elevators**: a 2×2 car per shaft, the same `x, y` on every level it serves,
  doors on one edge. Step in → the panel (G 1 2 3 4) → `lift:go {id, level}` →
  the server closes the doors, everyone standing in the car rides
  (`Player.level` set, x/y kept), ~1.5 s + 0.8 s a floor, the doors open.
  Call buttons on each landing; doors are shut walls while the car is
  elsewhere. One rider's choice at a time; a full car (4) refuses.
- `schema.ts`: `Player.level` (uint8), `WorldObject` level via props,
  `SpaceState.levels` (JSON string, like `areas`), `Npc.level`, pets' level.
- `SpaceRoom.ts`: `pos` checks on the player's level grid; `level` only changes
  through a stair crossing or a ride; `teleport` / `arrivalFor` / `rescue` /
  spawn carry a level; `gridFor(uid, level)`.
- `path.ts`: **A* across levels** through link nodes, so "walk to Ana" on
  another floor takes the stairs or calls the elevator; teleport-to-person
  works across floors.
- `hearing.ts`: **different level = can't hear** (one exception: the open
  stairwell carries voices one floor, faint). Every caller — server hearing
  pass, client volume/pan, media, games, phone — passes levels.
- Pets follow their owner up the stairs and into the elevator (they already
  "follow all the way, no teleport"); Vortex stays on his level for now.
- Presence to Yondra: the area name gains the floor ("Lobby · G").

## L3 — Drawing

**3D (`tp/build.ts`, `tp/view.ts`)**

- One `World3` per level, placed at `y = elev`. World y is rebased so the
  ground is 0 and the studio 14; the campus group drops its `GROUND = -14`
  offset to match.
- What's drawn: your level fully; the levels **below** as their floor slab +
  walls (seen through stair holes and from outside); the levels **above** cut
  away (their slabs hidden while the camera is under them) — the Sims rule.
  From outside (the lot) every level's interior shows through the curtain wall
  as today's lit offices do.
- The main block's facade becomes **per-storey glass with real openings**: the
  entrance door at G, the studio's own windows at 4. Inner faces of the glass
  are drawn (today it's one-sided and you'd see straight out).
- Camera: target height = `elev + z + EYE`; the chase camera's floor clamp is
  your level's floor, not y = 0; click-to-walk and `floorAt` intersect your
  level's plane; the sun's shadow camera follows your elevation (at the lot
  it's 14 tiles off today).
- Elevator: the car rides in 3D (doors, a light strip, a ding); stairs are real
  geometry with a rail.
- Snow falls on you outdoors (the flake mask is the building's footprint, not
  the studio's); breath in the cold, maybe.

**Iso (`engine.ts`, `art/scene.ts`)**

- Shows **the level you're on** only; the backdrop for an indoor level is
  today's; the ground level draws the lot as tiles + objects with the snow
  field beyond. A floor badge (G / 1 / … / 4) by the minimap.
- People on other levels are not drawn; the people list shows their floor.

**Build mode**

- A floor picker (PgUp / PgDn and a chip in the build bar). "Add floor" /
  "Remove floor" for builders, stairs and elevators placed like any object
  (the shaft/stair is checked free on every level it serves).

## L4 — The ground level: lobby and parking lot

- The lot's geometry moves out of `campus.ts`'s constructor into a shared
  `campusLayout(map)` (lot rect, columns, aisles, bays, road, gatehouse,
  entrance) so the server's grid and the 3D art read the same numbers.
- The **template** "Ruptura campus" writes level G from that layout:
  asphalt + painted bays, the sidewalk and path to the vestibule, snow banks
  as blocking edges, the lot's mouth closed by the gatehouse barrier (the
  driveway stays scenery — the world ends at the barrier for this test).
- **Cars become objects** (`car`, 80s sedan/wagon, colour): solid, standable
  (you can jump on the roof, as on desks), builders can move them. The 16
  scenery cars become 16 objects; their art is campus's car model; iso gets
  a car sprite. Lamp posts become objects too (solid pole, a real light at
  night in both views).
- The **visitor car** keeps driving in; it waits if someone stands in its way
  and honks once.
- **The lobby**: through the vestibule's door, a reception desk, a bench,
  the elevator bank (two cars), the stairwell door, the long white corridor
  *Ruptura* is known for. Areas: "Lobby", "Parking lot" (outdoor, open hearing
  but a bigger radius — the lot is wide).
- Spawn stays in the studio (you arrive at work); "Go outside" is a walk.

## Phases and exit tests

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mock images** (lobby, stairwell, elevator panel, ground-level lot with a person by a car) — workflow rule: image → approval → build. *Approved 2026-10-19:* `design/screens/building/01–07` (sources in `src/`) | approved images in `design/screens/building/` |
| 0b | L0 — themes removed, snow is the world | every space loads as the snow campus in iso and 3D; no theme picker; tests green |
| 1 | L1 + L2 data, one level: types, layout, Yondra whitelist + `yutopia_spawns.level`, schema, grids per level, hearing | every existing test green; a one-level space is byte-identical through save/load |
| 2 | Levels drawn (3D + iso), floor picker, add/remove a floor in build mode | a builder adds level 3, walks onto it by teleport, furnishes it, reload keeps it |
| 3 | Elevator | two browsers: A calls it on 4, rides to G, B on G sees the doors open and A step out; they hear each other only on the same floor |
| 4 | Stairs + A* across levels | walk 4 → G by the stairs; "walk to B" on another floor routes through the stairwell; a pet follows |
| 5 | Ground level: lobby, lot, cars, lamps, the campus template | walk out of the lobby to a car, jump on its roof, at night under a lamp; the visitor parks beside you |
| 6 | e2e + polish | `floors.spec`, `elevator.spec`, `stairs.spec`, `parking-lot.spec`; Firefox; perf ≥ 60 fps at the lot on High |

Phases 3 and 4 are independent once 2 lands and can run in parallel.

## Risks

- **Perf**: five levels + the campus in one scene. Mitigation: only your level
  and the one below are full detail; others are slabs + lit-window cards.
- **The model change touches everything** that calls `areaAt`, `hearingGain`,
  `Grid.from` (pets, games, media, phone, standup, furnish, vortex). Phase 1 is
  deliberately invisible so the rest builds on green tests.
- **Iso and outdoors**: a 110-tile-wide lot is big in iso; the minimap and the
  camera's bounds need to know the level's size.
- **Yondra lag**: until the controller whitelists `levels`, saves drop it.
  Ship the Yondra change first.

## The core (settled at the mock step)

Stairs and elevators are one **core, the same tiles on every floor**: x 6–13,
y 30–35, against the south facade, doors facing north. Two cars (2 × 2 each,
x 6–8 and 8–10) and a 4 × 6 stairwell (x 10–14): a switchback — up the east
half, a half landing at the far wall, back up the west half — so you arrive
by the same door one floor up. The floor above has a hole over the flights
with a rail.

In the studio this is **the south end of its own Lobby**; only the lobby lamp
(11, 31) and one plant (12, 34) are in the way. On G it opens off the lobby's
south side. (A first try put the core mid-building; it would have cut through
the Tracking Room and the War Room.)

## Still open

- Two elevator cars or one? (The mocks show two.)
- Does the world end at the gatehouse barrier, or does the driveway become
  walkable later (towards a "town" once the world is real)?

## As built (2026-10-19)

All of it, in one pass (details and checks in `PROGRESS.md`). Where it went
another way than above:

- **Data**: the world's map *is* the home floor (the studio, `floor: 4`) and
  carries the others in `levels` (shared `levels.ts`: `levelMap`, `withLevel`,
  `across`, `objLevel`, `onLevel`). A thing with no `props.level` is on the home
  floor, so nothing in the studio was rewritten. Room keys are the building's
  (one name a room, any floor).
- **The building** (shared `building.ts`, `campusBuilding`) is made once when a
  world with one floor loads: the ground floor (the lobby as mocked, the lot
  from the campus's own layout, 16 cars, 8 lamp posts, the path), three blank
  floors, the core on all five. In the studio only the lobby lamp and a plant
  moved out of the core's way.
- **Stairs** are a catalog thing (4 × 6, any turn); their treads are ramps in
  the grid (`stairs.ts`), the floor below's flights included, so you really walk
  them; the feet switch floors past a band (`floorChange`), the server checks
  the climb against the treads. **Elevators** are one `elevator` stop a floor
  per shaft (`props.shaft`; a builder's new one joins the shaft at its spot);
  `features/lifts.ts` runs the cars; shut doors are a wall.
- **Not done (later)**: "walk to someone on another floor" doesn't route
  through the stairs (teleport to them works across floors); pets come along
  with their owner between floors rather than walking the stairs themselves;
  thrown toys have no floor; Vortex stays on the home floor; the floors above
  yours aren't drawn in 3D (the Sims rule) and the stairwell on the top floor
  shows no flights below in iso; elevator cars aren't stored (a restart starts
  them shut); the lamp posts' light pools come from the campus.

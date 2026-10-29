# 54 — Spaces: a placed building's own floors (plan, 2026-10-29; from plan 53 phase 10)

> Plan 53 (god mode) left this as phase 10: "the investigation, then an inside of its own per placed
> building with build mode. May split out as plan 54." The investigation found it's a plan of its
> own: about 90–110 places assume one stored layout per world. Mock: `design/god/09-inside.png`
> (approved with plan 53's mocks).

Ask (plan 53, decision 4): "Structures: prefabs + enterable". A placed building can be walked into
with its kind's generated inside (plan 53 phase 9, done), **or have floors of its own**, built
inside with today's build mode, one stored map a storey.

## Where we are (the investigation, 2026-10-29)

- **One layout a world.** The API keeps one `world` row with one `layout` JSON (the HQ: its home
  floor and `levels`). Objects carry their floor in `props.level`. The world server saves the whole
  layout again after every edit (`WorldRoom.saveLayout`, debounced 1.2 s). The demo's is 11 KB; the
  campus's, its ground floor 160 × 94 and three office floors, is estimated at 60–120 KB (from its
  size; not measured).
- **The room's state** holds the home floor's tiles and walls, and every level as one JSON string
  (`schema.ts`, `syncMapState`). An edit sends every level again.
- **A walk-in building on the Grounds has no floor of its own.** You walk in on level 0: the HQ's
  stored ground floor, past its own tiles, where the grid reads the land (`setOutdoors`,
  `groundsOutdoors`). Its inside is code (`INSIDES`: `fitsOf` its furniture, `FIT_TILES`,
  `WALL_EDGES` its walls, `groundsAreaAt` its private room). The Grounds' coords and the HQ's are one
  frame.
- **The only stored inside out there is the HQ's own**: the east and south blocks are the ground
  floor widened (`BLOCKS`, `moveBlocks`, `upgradeGround`). That can't reach the town (x ≈ 440; a
  floor is 160 at most) and gets worse as it grows.
- **"On the Grounds" is `level === 0`**, in about 26 checks in the world server and the client's
  controller, and more in the view (cars, the dark, survival, pets, the karts).

What assumes the one map, by package (file and line in the investigation's notes, kept with this
plan's work):

| Where | What | How many |
|---|---|---|
| API | `world.layout`, `/internal/world` and `PUT /internal/world/layout` (the whole map), spawns and last spots by `level`, `WorldSnapshot`, `YondraImport` | ~10 |
| World server | `WorldRoom` (`map`, `levelMap`, `gridFor`, areas, hearing, moves, teleports, homes, spots, `commitMap`/`saveLayout`, `syncMapState`), map edits (`mapedit.ts`: 15 messages), `furnish.ts`, `history.ts`, `lifts.ts`, `physics.ts` | ~45 |
| Client | the controller (`map`, `building`, `level`, the floor from your height, stairs, lifts, `onMyFloor`), the 3D view's floors (`placeFloors`, `offsetTo`), `physics3d`, lights, build mode, the minimap, the floor picker | ~30 |
| Shared | `levels.ts` (the natural seam: it all takes one `MapDef` with `levels`), `map.ts`, `map-edit.ts`, `Grid.from`, `canPlace`, hearing, `buildingSolids`, the Grounds' `INSIDES` | ~15 |

**The risky ones:**
1. The physics: one Jolt world, one frame.
2. Syncing layouts as one string of every level.
3. The floor from your height falling back to level 0, and `across`/`offsetOf` mixing frames.
4. Changing space while carried: a lift, a car, a pet following.
5. A building moved, resized or taken away in a publish, and what becomes of its space.
6. Snapshots, last spots and spawns bringing someone back in the wrong space.

## The design

### A. A space

- A **space** is a stored layout of its own (`Layout`: its floors, their tiles, walls, rooms, doors,
  lights) for one placed building, by its key. The HQ's layout is the space `hq`, and nothing of it
  moves.
- **In the Grounds' frame.** A space's ground floor lies on the building's plot, at the land's
  height (its pad), so it is level 0 of the world, as the generated insides are today. Its upper
  floors are its own levels over it. So hearing, the physics' heights and the `level === 0` checks
  mostly keep working: a space's ground floor is "on the Grounds".
- **Objects** get `space` beside `level` (`props.space`; none means the HQ).
- **Owned by its building.** Its outline is the plot: tiles outside it are refused. The plot's
  walls and door are the building's own (its kind's builder draws the outside).

### B. Storage and sync

- API: a `spaces` table (building key, layout JSON, size, updated). `GET` with the world (placed
  buildings are few and small), `PUT /internal/spaces/{key}` with the layout's rules (the
  per-level checks moved to a helper), and `space` added to `spawns` and `last_spots`.
  `WorldSnapshot` carries them (its version bumped).
- World server: each space saved on its own timer, only the one edited.
- The room's state: spaces aren't in it. Each client fetches a space's layout once, then gets
  per-space messages (`space:layout`, edits as they're made). This avoids a second whole-string
  state, which is the risk above.

### C. Where you are

- A player is in a space when on level 0 inside its plot, or on one of its floors. `space` joins
  `level` on the player (schema), the grid's key (`space|level`), areas, hearing and spots.
- The floor from your height: in a space's plot, its floors; out of it, the HQ's or the land.
- Stairs and lifts inside a space are its own (build mode places them as in the HQ).

### D. Build mode inside

- "Go in and build" (the mock's), for admins (open question 3): build mode opens on the space's
  floor you're on, with the same tools, history and saves, edits tagged with `space`. "+ A floor"
  adds a level, up to the kind's floors.
- Only once published: a building in a draft has no space yet (the mock's note). Build mode works
  on the live world, as the HQ's does.

### E. The physics, both sides

- A space's solids join the one Jolt world as the HQ's do, keyed by space. In the Grounds' frame
  there's no second frame to keep. Its outside walls are the building's own (shapes/grounds.ts);
  the space adds its walls, furniture, stairs and floors.

### F. When the building changes (god mode)

- **Moved** in a publish: its space moves with it. Its tiles are relative to its plot, so nothing is
  rewritten.
- **Resized** smaller than what's built inside: refused by the rule book, with why.
- **Taken away**: its space is kept, out of the world (a rollback brings both back). Its objects go
  with it.
- A building with a space can't be turned to a side its inside's door isn't on (as phase 9's
  generated insides).

## Phases

0. **Decisions** (below) and any mocks beyond 09-inside (the floor picker inside a space; the
   panel's floors).
1. **Storage**: the `spaces` table and routes, spawns and spots, snapshots (API tests).
2. **Shared**: `levels.ts` taking a space (`objSpace`, `onSpace`), `Grid.from` for a space, the
   Grounds' `groundsOutdoors` and `INSIDES` deferring to a stored space where one exists.
3. **The world server**: loading spaces, `space` on players and in grids, areas, hearing and moves;
   per-space saves and messages.
4. **The client**: the space you're in, its floors drawn in the view, the floor from your height,
   the minimap, lights, the browser's physics.
5. **Build mode inside**, god mode's panel (its own floors, Go in and build, + A floor).
6. **God mode's publishes** moving, refusing or keeping spaces (F).
7. **Checks**: e2e (a house given floors, built in, walked in by a member, moved in a publish,
   rolled back), world-server tests (two players in two spaces: not heard, not in each other's
   rooms), the HQ unchanged (its layout byte for byte).

## Decisions (the user's, 2026-10-29)

The proposals taken:
1. **Admins only** build inside a placed building (members walk in).
2. **In the Grounds' frame**: a space's ground floor is level 0 over its plot, its floors its own.
3. **A building taken away keeps its space**, out of the world; a rollback brings both back.
4. **One or the other**: a building has its kind's generated inside or floors of its own, not both.

## Open questions (asked 2026-10-29, answered above)

1. **Who builds inside a placed building**: admins only, or a member given it as its owner (as a
   room's owner today)? (Plan 53's open question 3.)
2. **A space's frame**: its ground floor on the land's level 0 (as proposed: the cheapest, and the
   Grounds' checks keep working), or each space a world of its own you step into (cleaner, but every
   `level === 0` check changes and you'd load on entering)?
3. **A building taken away**: keep its space out of the world (proposed), or delete it with the
   building?
4. **Generated or its own**: may a building have both (its kind's furniture as a start you then
   edit), or one or the other (as the mock)?

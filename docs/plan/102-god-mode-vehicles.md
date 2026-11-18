# Plan 102 — vehicles in God mode

Asked 2026-11-18, after plan 101 (the bicycles):

> Vamos fazer uma melhoria no God Mode agora. 1- Veículos, bikes etc... selecionáveis pelo God Mode. 2- Opção de
> adicionar qualquer veículo pelo God Mode também.

The skate (once plan 102) moves to plan 103.

Status: **planned 2026-11-18; forks decided 2026-11-18 one by one, the recommendation for each: F1a in the draft,
F2a every parked one (a player's own moved only), F3a everything, F4a one in use not picked, F5a the full palette,
F6b no racks now, F7a not the AI's (the user will open its own ticket), F8b built straight, tested at the end. Built
2026-11-18, phases 1–7 (f154a09a, b3ec509d, 066b8f42, then the checks), page 488.9 of 489 KB, God chunk 22.8 of 24 KB; waiting on the user's test.**

## Where we are, from the code

- **God mode** (plans 53, 55, 69): an admin's editor of the outdoor world. Its tools are land, paint, roads, nature,
  things, buildings, grow and **select** (`world/god/controller.ts`, `components/hud/god/GodHud.tsx`).
  - Everything it does is a **Grounds edit** (`shared/grounds-edits.ts` `GroundsEdits`): heights, paint, trees,
    and `Section`s of ways, things, buildings and grown land, each with `add`, `change` by key and `remove` by key.
  - Edits sit in a named **draft** (plan 55). **Publish** makes them a revision that everyone's world takes on, and a
    revision can be **rolled back** (`world-server/features/godmode.ts`, the API's `publishGrounds`).
  - Select picks the smallest thing under the pointer (a thing, a building, a way): drag to move it, R to turn it,
    Delete to remove it.
- **Vehicles aren't Grounds edits.** They're world objects (`room.state.objects`, kind `car`, `props.model` its kind,
  saved by the API's `putObject`):
  - **The town's own** come from code: `shared/car/homes.ts` `HOME_CARS` lists the Main Street cars, the police car
    and taxis, the farm's pickup, the snowmobiles, the snowcat, the plough truck, the tractor, the toboggan, MOTORS'
    show cars, and since plan 101 the racks' bikes. The server seeds them (`makeHomes`), and the tow takes one left
    elsewhere back to its home after a while.
  - **The lot's cars** each have a bay of the lot.
  - **A player's own** (bought at MOTORS, `ownerId`) stays where it's left; their GPS finds it.
  - **An admin's spawns** (`mod:spawn-car`) are retired at the end of the day.
  - **AI vehicles** (the visitor's car, the shuttle bus, the plough on its rounds) aren't objects: they're the
    server's, on routes in code.
- Nothing in God mode sees vehicles today: Select's hit test is things, buildings and ways only.

## The idea

**Vehicles as part of the world you shape.** Picked like anything else in Select: dragged to a new spot, turned,
repainted, given another variant or role, or taken away. Added from a new **Vehicles** tool: every kind (the road
cars, the work vehicles, the toboggan, the four bikes), each of its variants with its picture, set down with a ghost
that shows where it can stand. What you place is **its home**: where it's parked, and where the tow brings it back.

## Forks — decided 2026-11-18 (asked one by one)

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | How vehicles go into the world | **a)** in the draft like the rest: a new `vehicles` section of the Grounds' edits (each vehicle's home: kind, look, place, heading, role), published with the draft, with revisions and rollback; the town's own (`HOME_CARS`) changed or removed by key the same way · **b)** straight into the world as you do it (like the admin panel's Spawn): no draft, no rollback | **a** |
| F2 | Which ones Select picks | **a)** every parked vehicle: the town's, the work vehicles, the racks' bikes, MOTORS' show, admin spawns; a player's own car moved only (never deleted or repainted: it's theirs) · **b)** everyone's, players' own included in full · **c)** only those God mode placed | **a** |
| F3 | What a picked vehicle can do | **a)** move (drag), turn (R), delete (Delete), its kind's variant, its colour (and a second one where it has it), its role (police, taxi, rental) and plate; "send home" for one left away · **b)** move, turn and delete only | **a** |
| F4 | One in use (someone driving it, a bike ridden, one still rolling) | **a)** shown, not pickable till it's parked · **b)** pickable: its driver put out first | **a** |
| F5 | The add tool | **a)** a Vehicles tool: every kind and each variant with its picture, a colour, a role; a ghost that snaps to the ground and shows red where it can't stand (water, a building, another vehicle) · **b)** kinds only, the look seeded | **a** |
| F6 | Bike racks | **a)** a rack from the Things tool that comes with its bikes (each a vehicle of the draft) · **b)** not now: bikes placed one by one | **b** |
| F7 | The AI's vehicles (the visitor's car, the shuttle, the plough's rounds) | **a)** not now: their routes are code · **b)** their routes' starting places movable | **a** — the user will open a ticket of its own for them |
| F8 | Sign-offs | **a)** stills of the Vehicles panel and Select's vehicle panel first, then built · **b)** built straight, you test at the end | **b** (as plan 101) |

## Guardrails

- God mode stays admin-only on the server (plan 48): every new message refused to anyone else.
- No edits, no change: with an empty `vehicles` section the world's vehicles are exactly today's.
- A published vehicle edit reaches everyone without a reload. A vehicle someone's in at that moment is left alone
  till it's parked.
- Players' own cars are never deleted or repainted by God mode.
- The page budget measured; God mode's code stays lazy (its chunk).
- Commit on main; push when asked; no co-author line.

## The phases

1. **The section** (shared): `VehicleDef` (key, kind, look, x, z, a, role, plate) and `Section<VehicleDef>` in
   `GroundsEdits`; the homes list made from `HOME_CARS` with the edits laid over it (`homesOf(edits)`); the draft's
   checks (a vehicle in water, on a building, off the world). Tests.
2. **The server**: on a publish (and a rollback) the town's vehicles reconciled to the homes — new ones made, moved
   ones moved (if parked and nobody's in them), removed ones taken away; the tow's homes refreshed. Tests in an offline
   room.
3. **Select picks vehicles**: the hit test (a parked vehicle's box under the pointer, smaller than a building, larger
   than a thing); its frame; drag, R, Delete; in use, shown, not picked.
4. **The picked vehicle's panel**: variant, colours, role, plate; "send home".
5. **The Vehicles tool**: the palette (kinds, variants with their pictures, colour, role), the ghost (the vehicle's
   own model, red where it can't stand), click to place.
6. **The draft's life**: walk it (the vehicles in the walked world), discard, publish, roll back; the drafts list
   counts vehicles.
7. **Checks**: shared and server tests, an e2e spec (place, publish, see it parked, roll back, gone), the page budget.

## Progress

- **Phase 1** (f154a09a): shared `VehicleDef`, the `vehicles` section, `homesOf`, `checkVehicles`, `newVehicleKey`.
- **Phase 2** (b3ec509d): the world server, on any edits laid (`land.ts onEditsLaid`, a publish or a rollback):
  - **homes** (the town's and the placed ones) made, put at their home as they are now, or taken away;
  - **any other** (a lot's car, a player's own, a spawn) moved or taken away **once**, when the edit is new: a rollback
    doesn't move them back (the lot's tow still takes its own cars back to their bays after a while);
  - one in use is left alone, and handled once it's parked and nobody's by it;
  - the tow's homes are `homesOf(edits)`; the boot pass drops removed homes and placed ones the edits no longer have;
  - `god:car-home` puts a home vehicle that was left away back at its home (Select's "send home", admins only);
  - the publish refuses a draft that takes away or repaints a player's own car.
- **Phases 3–6** (066b8f42):
  - **The draft's vehicles** are drawn for the admin alone. Shared `vehicleSteps(published, draft)` is the same diff
    the server reconciles by, laid over the room's objects (`Cars.setGodView`).
  - **Select** picks the smallest thing first: a thing, then a vehicle, then a building, then a way. A vehicle can be
    dragged, turned with R or the wheel, and taken away with Delete. One in use says so and isn't picked.
  - **The picked vehicle's panel**: model, colour, second colour, role, plate, "send home". A player's own car says
    "moved only".
  - **The Vehicles tool** (8):
    - every kind with its picture;
    - its models, colours and role;
    - the one held under the pointer as its own model, in a box: green where it can stand, red where it can't (off the
      land, in water, in a building, on another vehicle);
    - a click places it, R or the wheel turns it.
  - The publish dialog counts vehicles.
- **Phase 7**: shared tests (`car/homes-god.test.ts`), the server's (`god-vehicles.test.ts`, an offline room), and
  e2e `godmode-vehicles.spec.ts` (YUTOPIA_GPU=1). The e2e picks a taxi, drags and turns it, places a BMX, publishes,
  sees both in the room, then rolls back.

Fixed after: plan 101's boathouse rack stood inside the boathouse's west wall. It's now out front, west of the door (x −258, z −111), and the test leaves racked bikes a hand's width apart.

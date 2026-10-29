# The pet — it stays, it waits in the office, it gets in the car (plan — decided 2026-10-28; phases 0–5 delivered 2026-10-28)

> Follows `13-pets.md` … `17-pets-minds.md` (the pet, its needs, its mind), `28-the-car.md` /
> `43-the-spot.md` (the cars and their seats), `44-the-night.md` (the dark) and `50-the-volume.md`
> (one world in 3D). Workflow rule: mocks first (phase 0), approved before the rest.

Ask (2026-10-28):

1. The pet stays in the game even when its owner has left.
2. The owner can leave the pet in their office while they go out into the world.
3. The pet gets into the car — if the owner waits for it. If not, and the owner drives far
   away, it gets lost and starts wandering about, and it can die.

## Where we are

- **A pet lives only while its owner is here.** `features/pets.ts` `bring()` puts each of their
  pets in the room on `join`; `leave()` settles its needs, saves it and deletes it from
  `room.state.pets`. While they're away, `bring()` settles the gap next time as "asleep at home"
  at `OFFLINE_RATE` (0.25×) — a pet can already die of neglect that way.
- **Where it is isn't saved.** The `pets` table (API) keeps its needs, mind, tricks, bonds,
  `alive`, `seen_at` — no place, no mode. Each join puts it at the owner's side.
- **Modes** (shared `PetMode`): `follow`, `stay`, `explore`, `sleep`.
  - `stay` freezes it where it is (it still says what it wants);
  - `follow` runs after the owner "all the way, never a jump" (`CATCH_UP` = 1.05 × a run) and,
    with them on another floor for `AWAY_MS`, `comeAlong()` puts it beside them there.
- **Everything assumes an owner.** `behave()` returns at once without `owner(pet)` (by `pet.sid`);
  `mine()` checks the session. Anyone near may pet it; only the owner feeds and waters it.
- **Offices** are rooms (`AreaDef`, kind `private`) with an `ownerId`. Their doors are walls in
  everyone else's grid (`gridFor(uid, level)`, shared `grid.ts` `lockedRooms`), so a pet walking on
  its owner's grid can go in and nobody else can follow.
- **Cars carry people, not pets.** `features/cars.ts`: `car:enter` takes a seat (`l.seats`, the
  driver at 0, `SEATS_OF[kind]`); a rider's `busy` is `drive:`/`ride:`. Pets don't know about it:
  a following pet runs after a car at a run's pace and never stops trying.
- **The dangers exist for people**: the dark (`features/dark.ts`, 21:30–5:00, lamp pools),
  `car:knock` (a driver's client reports someone hit at speed: knocked down, never hurt), the
  Grounds' trees (`treeDensity`), the river (`RIVER`), the closed county road (`ROAD_CLOSED`).

## The design

The user chose, from the options put to them (2026-10-28):

- **When the owner logs off**: the pet **stays where it was**, in the mode it had.
- **The office** is the **owner's own room** (a `private` area with their `ownerId`). No room, no
  "wait in the office".
- **In the car**: **every species** gets in (dog, cat, rabbit, platypus, capybara, parrot).
- **A lost pet can die of**: **hunger and thirst**, **cold at night**, **being hit by a car**, and
  **wandering off the map** (deep woods, the river's ice, the county road past the closure).

### D1 — The pet stays

- On `leave`, nothing is deleted: the pet keeps its place, mode and act. `pet.sid` goes to `""`
  (no session), `pet.owner` keeps the name, so the tag still reads "Rex · Ana's".
- **A following pet with no owner** stops where it is and becomes `wait` (D2): it sits, sniffs
  around within a few metres, sleeps when tired. An `explore`ing pet keeps exploring; `stay` and
  `sleep` stay.
- **When the owner comes back** (`join`): the pet already in the room is theirs again (the
  existing `have.sid = p.sid`). It does **not** jump to them: it's where they left it. The panel
  says where ("Rex is waiting in the lobby" — `placeAt` / the area's name), and the GPS shows it
  (D5). A pet left on another floor or far away is fetched on foot.
- **Its needs while the owner is away**: the slow rate (`OFFLINE_RATE`) as today — **unless it is
  lost** (D4), when it's the full rate. Anyone near may now also feed and water a pet whose owner
  is away (with its own cooldowns; bonds go up as they do for the owner).
- **Saved**: its place goes into the record (`place`: `{ x, y, level, mode, home?, lost? }`) every
  save and on leave, so a server restart brings back every pet that's out in the world — the room
  loads them at start from a new API list (`GET /internal/pets/out`). Settled for the gap since
  `seen_at`.
- **Bounded**: a person has at most `PET_MAX` pets; ownerless pets think at a slower beat
  (`THINK_MS` × 3) and only path short legs, so a world full of them costs little.

### D2 — Waiting in the office (`home`)

- A new mode, **`home`**: the pet lives in its owner's room. It wanders the room in short legs
  (the existing `spotIn(area)`), sleeps on a bed there, eats and drinks from the room's bowls, plays
  with toys left there. It **never leaves the room** on its own: its legs are kept inside the area.
- **Given** from the pet panel, "Wait in my office", only when the owner is standing in their own
  room with the pet. (Phase 3 adds "Go to my office" from anywhere on the same floor: it walks
  there itself; across floors it takes the stairs as `comeAlong` does.)
- **Taken back** with "Follow" (or "Come", D5's call) when the owner is in the room.
- Visitors: the room is locked to others, so nobody but the owner gets in; someone the pet knows
  who knocks makes it go to the door and wag (a `greet` at the door, seen through the glass).
- Safe: no danger reaches a pet at `home` (no cold indoors, no cars, no way off the map). Its
  needs settle at the slow rate while the owner is away; bowls in the room are used.
- The room taken from the owner (build mode) while the pet is home: it becomes `wait` where it is.

### D3 — Into the car

- **The owner gets in** (`car:enter`, any seat) with a pet following within `BOARD_NEAR` (15 m) on
  the same level: the pet runs to the nearest free door (`SEATS_OF[kind].out`) and hops in, ~1–3 s.
  The HUD says so: "Waiting for Rex…" with a paw beside the speedometer, and "Rex is in" when it is.
- **Where it rides**: a free passenger seat (never the driver's); a pickup's bed when the cab is
  full. Pets don't stop people getting in: a person taking a pet's seat moves it to the back / the
  bed, or, with no room, it hops out beside the car and waits there (`wait`).
  - New on `Vehicle`: `pets` ("id|id…", the seats they sit in); on `Pet`: `ride` (the vehicle's
    id) — the server puts it at its seat every tick, the client draws it seated (dogs and
    capybaras looking out of the window, the parrot on the headrest).
- **Too late**: it only boards a car going slower than `OUT_V` (2.5 m/s), the same as a person.
  Driven off before it's in: it runs after the car (the `follow` it already has).
- **Getting out**: the owner gets out → their pets hop out beside them (the pet's door, or the
  owner's side) and follow. The driver of a pet's car not its owner (lent keys, a friend driving):
  it rides until its owner gets out.
- **Karts don't count**: a kart in the park isn't a car; a pet waits in the paddock (it can't be
  lost while its owner is inside the Kart Park's bounds). The shuttle carries pets like a car.

### D4 — Lost

- **How it gets lost**: its owner in a vehicle (`busy` `drive:`/`ride:`), the pet following and not
  aboard, and more than `LOST_FAR` (60 m) away for `LOST_MS` (20 s) — or no way to them at all for
  that long. Also: its owner left the room (logged off) while it was running after their car.
- **Lost** is a new mode, **`lost`**:
  - it wanders the land in legs of 10–40 m, picked at random but away from where it's just been
    (the `trail` it already keeps), with sniffs and whines (`sad`), a "?" over its head
    (`WANT_ICON`-style);
  - it ignores commands from strangers and is shy of them (`shyOf`); someone it knows
    (`greets(bond)`) can call it and it follows them;
  - it heads into a building or a lamp pool after dark if one is within reach (a small chance each
    leg — not always: it's lost).
- **Found**: its owner within `FOUND_NEAR` (8 m), seeing it (`reach.ts`, same level): it runs to them
  happy (`zoom`), bond up, back to `follow`. A friend it followed to its owner's office: `home`.
- **What can kill it** (all four, only while lost):
  - **Hunger and thirst**: its needs drain at the full rate (online or not) and there are no bowls
    out there. Water at zero hurts as today (`DECAY.hurt`). From full: ~1.5 days to die.
  - **Cold at night**: outside (`onLand`, not `inBuilt`), dark (`dark.ts`'s amount over 0.5) and
    not in a lamp pool: health −`COLD_HURT` (8) an hour. A night out costs ~60; two kill it.
  - **Hit by a car**: the driver's client reports it (`car:knock` with a pet id, the same speed and
    reach rules as a person). A lost pet takes `CAR_HURT` (60) and limps (half pace) for an hour;
    a second hit kills it. A pet with its owner near is only knocked aside, unhurt.
  - **Off the map**: legs into deep woods (`treeDensity` high), onto the river's ice (`RIVER`) or
    down the county road past `ROAD_CLOSED`: each hour there, a `GONE_CHANCE` (3%) it never comes
    back. Gone is dead: the record `alive = false`, `died` with a cause (`lost`), as neglect does
    today. The world doesn't show it any more.
- **Death** is the existing `die()`: the owner is told on their next join (`event("died")`) with
  the cause; the panel's memorial line says how.

### D5 — The owner's tools

- **The pet panel** says where each pet is and how it is: "With you", "Waiting in the lobby",
  "In your office", "In the car", "Lost — last seen near the boathouse, 2 h ago".
- **Last seen**: where the owner last had it (when it got lost) and every sighting since — anyone
  passing within 15 m of a lost pet updates it (no live position: you have to go and look).
- **The GPS** (the phone's): "Rex" as a destination — its place if it's waiting or home, its last
  sighting if it's lost (a circle, not a pin).
- **The call** ("Come", already a command): heard within 30 m; a lost pet that hears its owner
  comes running (found).
- **Toasts**: "Rex is waiting at the car" (the owner gets in), "You drove off without Rex" (at
  `LOST_FAR`), "Rex is lost" (at `LOST_MS`), "Someone saw Rex near Main Street" (a sighting while
  the owner's online).

## Where it lives

| Part | Where |
|---|---|
| `PetMode` `wait`, `home`, `lost`; `PetPlace` in `PetRecord`; `LOST_FAR`, `LOST_MS`, `FOUND_NEAR`, `COLD_HURT`, `CAR_HURT`, `GONE_CHANCE`; `coldAt(n, hours)`; the lost leg picker's rules | shared `pets.ts` (+ tests) |
| The office: the owner's room on any floor (`homeOf(map, uid)`) | shared `grid.ts` / `levels.ts` beside `lockedRooms` |
| The record's place and the list of pets out | API: a migration (`place` json nullable, `lost_since`, `last_seen` json), `InternalController::petsOut`, `savePet` takes `place`; Pest test (check its DB isolation first) |
| Ownerless pets, `wait`/`home`/`lost`, boot loading, care by anyone while away, dangers, sightings | world-server `features/pets.ts` (`behave()` split: with an owner / without) |
| Pets in cars: boarding, seats, out with the owner, the knock on a pet | world-server `features/cars.ts` (`Vehicle.pets`, a hook pets.ts registers) + `schema.ts` (`Pet.ride`, `Vehicle.pets`) |
| Drawn: pets seated in each car kind, the lost pet's "?", its limp | client `art/pets3d.ts`, `tp/car/` (seat poses), `tp/people3d.ts` riders' loop |
| The panel's lines, the office command, the HUD's "Waiting for Rex…", the toasts, the GPS destination | client `components/hud/PetPanel.tsx`, `PetOverlays.tsx`, the phone's GPS, `lib/i18n-pets.ts` |

## Phases

| # | Phase | Exit |
|---|---|---|
| 0 | **Mocks**: a pet in each car kind's seats (sedan, offroad, pickup's bed, the shuttle); a dog with its head out of the window; the "Waiting for Rex…" HUD; a lost pet (day, night, snow) with its "?"; the panel's where-lines; the GPS's lost circle; a pet at home in an office | the user approves `design/screens/pet/` |
| 1 | **It stays**: `place` in the record and the API, ownerless pets (`wait`), loaded at boot, care by anyone while away, back to its owner on join | Unit tests (shared, world-server offline: leave → still there; restart → back; join → theirs, not moved); Pest; seen by a second browser after the owner leaves |
| 2 | **The car**: boarding, seats, `Vehicle.pets`/`Pet.ride`, out with the owner, the HUD | Unit tests; a dog and a cat driven into town and out again in the game |
| 3 | **Lost and found**: `lost`, its wandering, found by the owner / led by a friend, sightings, the panel and the GPS, the four dangers | Unit tests for each danger (time run on in offline tests) and for found; a pet left at the lot, found in the woods in the game |
| 4 | **The office**: `home`, "Wait in my office", "Go to my office", knocks | Unit tests; left in the office, the owner drives to town and logs off, back next day and it's there |
| 5 | **Checks**: e2e (two browsers: A leaves, B sees and pets the dog; A drives off without it, it's lost, B sees it wander; A finds it), the 200-player world-server load with pets out, prod's world offline, budget (no new code on the page: the panel's parts lazy) | All green |

## Phase 0 — approved (2026-10-28)

- **Pets in the stills** (`tp/pet-stage.ts`, new): the game's own models (`art/pets3d.ts`) on the
  Grounds or in a car's seat, posed and settled, with where each one's head is for the HUD's tags.
  - A shot's `pets` (grounds-shots.ts); a car's `pets` (`car/stage.ts` `CarIn.pets`: a seat, a turn,
    a nudge), sat on the seat's hip in the car's body.
  - In a seat a pet is drawn at `SEAT_SCALE` (0.72), as people are drawn smaller there. At full
    size a capybara fills the back seat.
  - A pet facing the window sits 0.34 m in from the door. Its seat's middle is too near the door:
    its paws come through it.
- **Stills** (`/dev/grounds?shot=pet-…`, `design/screens/pet/`):
  - `pet-board`: Ana in her car, the rear door open, Rex running to it.
  - `pet-ride-sedan`: Rex in the back looking out, Mia on the passenger seat.
  - `pet-ride-pickup`: Capy and Perry in the bed, Bun in the cab.
  - `pet-ride-offroad`: Rex at the window, Kiwi on the back seat's top.
  - `pet-left`: the car going down the driveway at dusk, Rex running after it.
  - `pet-lost-day`: off the ravine trail in the woods, sniffing, sad.
  - `pet-lost-night`: under the driveway's lamp, scared.
  - `pet-found`: Cai on the trail at dusk, Rex running to him.
  - `pet-waiting`: Ana gone, Rex by her car, Bia stopped by him.
- **The HUD's mocks** (`e2e/pet-shots.spec.ts`): the stills with the HUD over them in the game's
  own classes, and the panel and the phone in the game itself.
  - `hud-board`: the chip "Waiting for Rex…".
  - `hud-left`: the toast "You drove off without Rex."
  - `hud-lost-day`, `hud-lost-night`: the lost pet's **?** (a want token in the emotes' hand)
    over its tag "Rex · Ana's"; the dangers in the notes.
  - `hud-found`: "You found Rex!"
  - `hud-waiting`: Bia's prompt "Feed Rex · Ana's away".
  - `hud-panel-office`: the panel's new row (where he is; **Wait in my office**, **Follow**) and
    the name plate's line "Happy · with you · Ana's office".
  - `hud-panel-list`: each pet's line in the list (in your office; lost, where and when; in your car).
  - `hud-office`: Rex at home in the office, the toast "Rex will wait for you in your office."
  - `hud-gps-list-phone`, `hud-gps-lost-phone`: "My pets" on the GPS; a lost one's last sighting
    as a dashed circle, not a pin.
- **For the mocks only**: the dev world has no room with an owner, so the War Room stands in for
  Ana's office (its name changed on the top bar). Rex was adopted for the shot and let go after.
  The dev world wasn't swapped.
- **Not drawn yet**: a pet's head out of an open window (the cars' side glass doesn't open); the
  shuttle with a pet aboard; the knock (a car hitting a lost pet).
- **Checked**: client types, Biome on the changed files. The page isn't touched: the stills'
  modules are dev only, and `car/stage.ts` only gains a type import.

## Phase 1 — it stays: delivered (2026-10-28)

- **Shared `pets.ts`**:
  - `PetMode` has `wait` (`PET_MODES`, `isPetMode`).
  - `WAIT_RADIUS` (3 tiles).
  - `PetRecord.place`: a `PetPlace` (`x`, `y`, `level`, `mode`, or `died`). `cleanPlace` cleans it.
  - `PetOut`: a record with its `uid` and `owner`.
- **API**:
  - the `place` column (migration `2026_10_28_000001`);
  - `savePet` takes and checks `place`;
  - `GET /internal/pets-out` lists every living pet with a place, its owner's id and name.
  - Pest: kept, listed, dead or taken home not listed, a bad place refused.
- **World server** (`features/pets.ts`):
  - **Its owner leaves**: the pet stays (its `sid` is ""). Following, it becomes `wait` about the
    spot it was at; `stay`, `explore` and `sleep` carry on. Its toys are dropped, the battles ended.
    A dead pet still goes with its owner.
  - **On its own** (`alone`): what it was doing, then `waitAbout`. That's the idle it does beside
    its owner, round the spot instead, back to the spot if it strayed past `WAIT_RADIUS`.
    Exploring, it keeps exploring. Its needs settle at the slow rate.
  - **Saved where it is**: every save writes `place`, alive or not. On `dispose` (the room
    shutting) every pet is saved.
  - **The room's start** (`putBack`): every pet out is put back where it was, ownerless. Its
    needs are settled, slowly, for the time the world was shut. A pet that died meanwhile gets
    the `died` place.
  - **Its owner back**: it's theirs again, where it is (not beside them). Far off (another
    floor, or over 8 tiles), a toast says where: "Rex is waiting where you left it: Live Room."
    (`whereOf`: the room's name, or the place on the Grounds.)
  - **Care**: anyone near may feed and water a pet whose owner is away, not only pet it.
  - **Died with its owner away**: out of the world at once. Its `place` says `died`, and at the
    owner's next login it's told (`pet:event` `died`), once.
  - **Floors**: only a following pet comes along up or down; a waiting one stays.
  - Offline (tests): the pets out are kept by sandbox (`WorldRoom.sandbox`), since several rooms
    run at once.
- **Client**:
  - an ownerless pet's tag reads "Rex · Ana's";
  - its ring offers anyone a snack and water;
  - "Call my pets" includes waiting ones;
  - the wait mode's words, in English and Portuguese.
- **Checked**:
  - shared 380/380;
  - Pest (the pet tests);
  - world-server `pets.test.ts` 10/10, two of them new: left, waiting, fed by a friend, hers
    again where it is with the toast, the room shut and opened with it back; and dead with its
    owner away, told at the next login;
  - e2e `pets-stay.spec.ts` (two browsers, the dev world): Ana leaves, Bia sees Rex waiting with
    the tag "Rex · Ana's" and feeds him, Ana comes back to him.
- **Not yet**: the panel's where-lines and the GPS (phase 3). A pet waiting alone doesn't look for
  bowls — its mind (`think`) needs its owner (phase 4, in the office). The "where" toast is
  English only, as the server's toasts are.

## Phase 2 — the car: delivered (2026-10-28)

- **Schema**: `Pet.ride` (the vehicle's id) and `Pet.seat`. No `Vehicle.pets`: a pet's seat is on
  the pet, and the cars feature doesn't change. The pets feature reads the vehicles and their
  people's seats from the room's state.
- **World server** (`features/pets.ts`):
  - **Boarding** (`board`): its owner in a car (their `busy`: `drive:` / `ride:car:`), it
    following, on the ground floor within 15 m, the car slower than 2.5 m/s, a free seat. It runs
    (×1.6) to that seat's door (shared `SEATS_OF` `out`) with the act `board`, and in.
    - The seats it takes are the back two, then the front passenger's — never the driver's, nor
      one a person or another pet sits in. In the pickup, the back two are its bed.
    - The event `boarded` tells its owner.
    - Too far, the car moving, or no seat free: it runs after the car as it always has.
  - **Riding** (`ride`): put in its seat every tick, turned with the car, sitting.
    - A person getting into its seat moves it to another; with none free, it hops out.
  - **Out** (`hopOut`): when its owner is no longer in that car (got out, or the car's put away).
    It goes out by its seat's door, else the other side's, else round the back, and follows them.
    Its owner leaving the world takes it out of the car to `wait` there.
- **Client**:
  - **The car view** (`car/cars.ts` `seatPets`) draws riding pets in its seats: the game's model
    at the seat's hip, at 0.72 the size, sitting. A dog is turned to its window, 0.34 m in from
    the door (as in the stills).
  - **Not drawn twice**: the controller leaves riding pets out of the world's bodies.
  - **The car's HUD** note line: "Waiting for Rex…" while my pets are on their way to a door.
    The toast "Rex is in." comes from the pet's event.
  - **Off the page**: the strings are in the car and pets chunks; the car chunk reaches the pets'
    models through `art/pets-load` (as it reaches the people's through `chars-load`).
- **Checked**:
  - world-server `pets-car.test.ts` (new): a dog and a cat in with their owner, a seat each,
    carried 10 m, a seat given up to a person, out with her following, and out to wait when she
    leaves the world;
  - e2e `pets-car.spec.ts` (the dev world, GPU): Ana's dog and cat get in, ride at 20 km/h on the
    back seat, and get out with her, all through the car's own prompt (it comes before anything
    else: a pet at her feet doesn't take it). Pictures: `design/screens/pet/game-board.png`, `game-in`,
    `game-driving`, `game-out`.
  - world-server 165/165; shared 380/380.
  - **Budget**: `/page` 414.6 / 415 (unchanged); `yutopia-pets` 24.7 / 40. Phase 0's stills had
    imported `art/pets3d` on their own, which copied the pets module into a third chunk:
    `yutopia-pets` read 52.1, over budget. They reach the models through the page's
    `loadPets()` now.
- **Not yet**:
  - Lost when left too far behind (phase 3). Left behind, it still runs after the car however
    far, as before.
  - The shuttle: it isn't one of the room's driven vehicles with seats; pets stay off it.
  - Karts: pets wait in the paddock.
  - A dog's head out of an open window.

## Phase 3 — lost and found: delivered (2026-10-28)

The user's call (2026-10-28): the dangers are for **lost** pets only — a pet left waiting outside
overnight is safe.

- **Shared `pets.ts`**:
  - `PetMode` has `lost`.
  - `LOST` holds the numbers: 60 m and 20 s to be lost; 8 m to be found, 30 m to be heard calling,
    15 m to be seen; cold 8 an hour; a car's hit 60; gone 3% an hour.
  - `coldHurt` and `goneChance`.
  - `PetSeen`: where its owner can look, in the Grounds' metres, the place's name, when, by whom,
    and `lost`.
  - `PetPlace` keeps a lost pet's `seen` and a death's `cause`.
- **Protocol**: `pet:hit` (a driver's car hit a pet). `pet:test` (offline only) can set a pet down,
  make it lost, and run hours on.
- **World server** (`features/pets.ts`):
  - **Lost** (`lose`): its owner in a car more than 60 m off for 20 s, it following and not
    aboard. At 60 m its owner gets "You drove off without Rex." Running after their car when
    they log off: lost too. Its owner gets the event `astray` (`lost` was a battle's).
  - **About the land** (`lostAbout`, `wanderLeg`): legs of 10–40 tiles somewhere it hasn't just
    been, a whine now and then. After dark, a quarter of the time, towards the nearest lamp.
  - **Found**: its owner within 8 m, on foot and on its floor; or "Come" heard within 30 m.
    It's overjoyed, following again, the bond up. From further, commands get `unheard`.
  - **A friend**: someone it knows (`greets`) within 8 m — it follows them, so they can bring it
    back.
  - **Sightings**: anyone else within 15 m updates its last sighting. Its owner gets a toast
    ("Bia saw Rex — Main Street."), at most every 10 minutes.
  - **The dangers, lost only**:
    - hunger and thirst at the full rate, its owner online or not;
    - the cold: outside (the land, not in a building), the night half dark or more (`nightness`),
      out of every lamp's pool (or a blackout): 8 an hour;
    - a car (`pet:hit`, the driver's car at speed beside it): 60 and a limp (half pace) for an
      hour, dead on a second hit; not lost, it's only knocked aside;
    - the wild (deep woods with density 0.9 or more — 0.8 was a quarter of the land —, the
      river's ice, past the road's closure): a 3% chance an hour it's gone for good, out of the
      world.
  - **Deaths** come with a cause: the events `died`, `died_cold`, `died_car`, `gone`. With its
    owner away, the cause waits in its place for their next login.
  - **Where to look** (`Pet.seen`, JSON): lost, its last sighting; left waiting, where it is
    (every 5 s); with its owner, empty. A lost pet keeps it through a restart.
- **Client**:
  - **The car**: pets are soft obstacles for the driver's car, as people are; hit at speed, it
    reports `pet:hit`.
  - **The pet panel**: each pet's row and its name plate say where it is — "Waiting · Lobby", or
    "Lost · last seen Parking lot, 2 h ago · by Bia" in rust.
  - **The GPS**: my pets in "Mine" — a waiting one as a paw pin, a lost one as a dashed circle
    40 m round its last sighting ("Rex (lost: last seen)").
  - **The minimap** leaves a lost pet's real place off.
  - **Strings** for the new events, in English and Portuguese.
  - The GPS and the panel read `seen` from the room's state, in their own chunks: nothing on the
    page but the minimap's line.
- **Checked**:
  - world-server `pets-lost.test.ts` (new, 3 tests):
    - left behind by the car, lost after 20 s, not heard from 80 m, seen by a friend (its owner
      told) and following her, found by its owner;
    - each danger: 40 h lost dead, 40 h waiting alive; 2 h at night out of the lamps −16, waiting
      there 0; a car hit −60 then dead, not lost only knocked aside; the deep woods gone;
    - lost through a restart, its sighting kept.
  - e2e `pets-lost.spec.ts` (the dev world, GPU), passed twice in a row: Rex left staying in the
    lot, Ana in a car at the far end of the world calls him, he's lost; the panel's line, the
    GPS's circle; she goes there and finds him (on the lawn by the lot: he wandered). Pictures:
    `design/screens/pet/game-lost-toast.png`, `game-lost-panel`, `game-lost-gps-list`,
    `game-lost-gps-map`, `game-found`.
  - world-server 168/168; shared 381/381; client unit 42/42. Run alongside other suites, the
    world-server's timing tests (a bench by the fire, Vortex's lines, the dangers) failed once
    each. Each passes on its own, and the whole suite passes run alone.
  - **Budget**: `/page` 414.6 / 415 (unchanged); `yutopia-pets` 25.0, `yutopia-phone` 17.0,
    `yutopia-car` 26.3.
- **Not yet**: a parrot lost on a roof; a lost pet's own icon over its head (its want shows as
  ever). Sightings by name are English only, as the server's toasts are.

## Phase 4 — the office: delivered (2026-10-28)

- **Shared `pets.ts`**: `PetMode` has `home`. `COMMANDS` has `home` (wait in my office) and
  `gohome` (go to my office).
- **The room's knock** goes to the features too (`Feature.knock`, called from `WorldRoom.knock`).
- **World server** (`features/pets.ts`):
  - **Its owner's office** (`homeOf`): the room with their `ownerId`, on any floor (not a booth).
    It's found in the server rather than in shared `grid.ts`: only the server asks.
  - **`home`**: only when its owner stands in their office with it (else `notInOffice`; no office:
    `noOffice`).
  - **`gohome`**: from anywhere. It walks to the office on its owner's grid, so its locked door
    lets it through. From another floor it starts at that floor's way in (`levelEntry`), as a pet
    following its owner does.
  - **At home** (`homeAbout`):
    - legs to spots in the room (`spotIn`), or its species' little things where it stands — never
      `idle()`'s sniff about, which stepped out of the open door;
    - hungry or thirsty, a bowl in the room;
    - tired, a bed in the room (`sleep`), and awake it's at home again (`wake`);
    - never out of the room on its own, and not out to greet someone joining the world (it did:
      the join's greeting now skips it).
    - Waiting, its `seen` names the room for its owner.
  - **A knock** on its office's door by its owner or someone it knows (`greets`): it goes to the
    spot inside nearest them, and wags.
  - **The room given to someone else** (or removed): it waits where it is.
  - "Come", "follow", "stay" and "explore" take it out of the office's life.
  - Kept through a restart, if the room's still theirs. Online the room's owner is saved with the
    world; offline (the tests) it isn't.
- **Client**: the panel's commands have **Wait in my office** and **Go to my office**. The mode's
  words, the events' toasts (`home`, `goHome`, `noOffice`, `notInOffice`), in English and
  Portuguese.
- **Checked**:
  - world-server `pets-home.test.ts` (new, 2 tests), four runs in a row, all green:
    - not from the lobby; left in the office; it keeps to it with her in the lobby, out of the
      world and back; "follow" takes it back;
    - sent home from the lobby, it walks in; hungry, the office's bowl; a friend's knock brings it
      to the door, inside; the room given away, it waits.
  - world-server 170/170; shared 381/381; client unit 42/42.
  - e2e `pets-home.spec.ts` (the dev world, GPU): the War Room Ana's for the run (given back
    after). "Wait in my office" in the panel; she drives off in a lot car and logs off; back, Rex
    is in her office, at home. Pictures: `design/screens/pet/game-home-panel.png`,
    `game-home-back.png`. (The lot car she drove is left on the road: the tow takes it back.)
  - **Budget**: `/page` 414.7 / 415 (+0.1: the new modes and commands in shared `pets.ts`);
    `yutopia-pets` 25.2.
- **Not yet**: a pet seen through an office's glass by someone knocking (it's drawn as any pet is);
  the panel offers both office commands always, and the server says when one doesn't apply.

## Phase 5 — the checks: delivered (2026-10-28)

- **Two browsers** (e2e, the dev world, GPU):
  - `pets-stay.spec.ts` (phase 1): Ana leaves, Bia sees Rex waiting with the tag "Rex · Ana's",
    and feeds him; Ana comes back to him.
  - `pets-lost-two.spec.ts` (new): Rex staying in the lot with Bia beside him; Ana calls him from
    a car at the far end of the world, and he's lost. Bia sees him wander off (he's 4 m on and
    more), Ana's told "Bia saw Rex — Parking lot.", and Ana finds him. Picture:
    `design/screens/pet/game-two-bia-sees.png`, Rex by the HQ's corner from Bia's screen.
  - The e2e say a command twice: online a pet may not mind the first call (`obeyChance`), and a
    second within a few seconds it always does. The toasts are collected as they come (a
    sighting is told once in ten minutes). A pet on the move is found by going to it again till
    near.
- **200 players with pets out** (`perf.mts`, new `PETS=n`): owners adopt three each and go; one
  of each three is lost out on the land, the rest wait where they were left.

  | Run | Tick avg | Tick max |
  |---|---|---|
  | `BOTS=200` | 0.69 ms | 2.0 ms |
  | `BOTS=200 PETS=60` (20 lost) | 1.07 ms | 5.8 ms |
  | `BOTS=200 PETS=150` (50 lost) | 1.76 ms | 8.8 ms |
  | the same on prod's world, `PETS=60` | 1.13 ms | 13.1 ms |

  About 7 µs a pet a tick: the 4 ms budget holds some 400 pets out. One run's longest stall
  (195 ms) was the cars' first tick (the fleet made), not pets. CI's 60 bots: 0.43 ms. Nobody put
  back.
- **Prod's world offline** (the copy of 2026-10-24, `YUTOPIA_WORLD_FILE`): 798 things on floor 4;
  the offices of uids 1 (the Serious Office), 3, 5 and 6. Sam's dog left in the Serious Office:
  it keeps to it with him in the lobby and with him logged off (`seen`: "Serious Office"); back,
  it's his, at home, in the office. (A scratch script, deleted.) The perf runs above too.
- **Budget**: `/page` 414.7 / 415 — the page's only pet code is the minimap's line (a lost pet's
  real place left off) and a riding pet left out of the bodies; the panel, the GPS and the car's
  parts are lazy. `yutopia-pets` 25.2, `yutopia-phone` 17.0, `yutopia-car` 26.3,
  `yutopia-grounds` 185.8.
- **The suites**: shared 381/381, client unit 42/42, client types. World-server 169/170: "a bench by
  the fire" (`park-life.test.ts`) found a seat taken by the park's own folk; it passed three times
  out of three on its own, and in the earlier full runs. It doesn't touch pets. Not checked on HEAD.

## Still open

- **How long lost lasts if nobody comes**: by the numbers above, about a day and a half from full
  needs — less in a cold night. Tunable after a play-through.
- **The parrot** flies: lost, it could perch out of reach on a roof. Left as a walker for now.

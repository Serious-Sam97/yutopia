# The spot — your own bay, your own car (plan — decided 2026-10-24; phases 0–3 delivered 2026-10-24)

> Follows `42-the-lot.md` (one layout, 64 bays), `28-the-car.md` (the cars driven)
> and `34-the-vehicles.md` (cars with a home). Workflow rule: mocks first (phase 0),
> approved before the rest.

Ask (2026-10-24): "Users can register a parking spot on the parking lot (a wooden
board appears with their name on the selected one). And a possibility to have their
own car."

## Where we are

- **The bays are data.** `lotLayout()` (shared `lot.ts`) lists 64 bays. Each has:
  - its row (`w`, `mid-w`, `mid-e`, `e`) and its slot (0..18);
  - which way it noses;
  - its kind (`plain`, `visitor`, `accessible`).

  Nothing else is known about a bay.
- **Every lot car is anyone's.** The 16 seeded `car-i` and the builders' `b-car-*`
  are world objects of kind `car`, saved through the API (`api.putObject`).
  - Any free one is taken with X at a door (`car:enter`).
  - Got out of, it parks where it stops.
  - Left off the lot two hours, it's towed to a free plain bay (`features/cars.ts`).
- **A car's props** already carry what it keeps:
  - `model` (sedan, offroad, pickup…), `variant` (its colour, one of
    `CAR_COLOURS`' nine) and `wagon`;
  - `fuel`, `grime`, `dmg` and `role`.

  The 3D kit already draws a plate from `o.plate` (made-up `YTP·1986` today).
- **Ownership has a precedent: desks.**
  - A builder sets a desk's `props.ownerId`/`ownerName` (`desk:assign`, build
    mode's Desks panel).
  - Iso labels the desk with the owner's first name.
  - Only the owner gets "work" and "focus" on it.
  - Rooms have an owner too (`ownerId` on the area: locks).
- **Players** have a `uid` (the API's user) and a `name`.
- **No money** in the game: nothing is bought, only taken.
- **Main Street** has a shut shop (`vacant`, x 486..500, south side) with nothing in
  it.

## The idea

**Walk to a free bay and claim it.** A little wooden board on a post goes up at
its head with your name burnt into it. Snow settles on its top, and at night the
lot's lamps light it.

**Then go into town and pick your own vehicle at the dealer.** Choose any of the
Grounds' vehicles, the colour and the plate. It's there beside you on the forecourt,
and you drive it home. From then on it's yours: only you drive it, unless you lend
someone the keys. Nobody tows it: it stays wherever you leave it, and your phone's
GPS shows where.

The lot reads like a real workplace's: the regulars' bays by name, the pool cars
in the rest.

## The design

The user chose, from the options put to them (2026-10-24):

- **Claiming a bay**: in the world, standing in it.
- **Getting a car**: a car dealer in town. The car appears next to you there, and
  you drive it home.
- **Driving it**: the owner, and whoever they lend the keys to.
- **The models**: every drivable vehicle.
- **No tow for your own car**: it stays where you left it, and the GPS shows it. Left
  in town, you go there to fetch it.

The rest is my recommendation, to settle in the mocks.

### D1 — The board

- **What**:
  - a pine plank (~1.1 × 0.35) on a single post, at head height (1.45–1.81): lower, a
    parked car's roof (1.5–1.7) hid it from the aisle (seen in the mocks);
  - the name burnt in, in caps;
  - a small snow cap on its top edge and on the post's cap;
  - the bay's label on a small enamel tag under it, the lot's blue (`D-07`: the rows lettered
    A–D west to east, A row W, B and C the pair, D row E; the number its slot, north to south).
- **Where it stands**: at the head of the bay, where its nose points.
  - **Row W**: on the dump's kerb.
  - **Row E**: on the pavement's kerb, a plank each side, so it reads from the
    pavement too.
  - **The back-to-back pair**: their heads meet on one line (x −31.4).
    - **One post for both bays, a board on each face**: a pair of facing bays
      shares a post.
    - The car sim gets the post as a thin solid.
    - A sedan is 4.9 long in a 5.6 bay: 0.35 to spare at each end. The post must
      fit in that, or stand just off the line. Measured in the mocks.
- **Iso**: the same board as an item-kit sketch. The name is a label on it (as a
  desk's plate is today), not baked into the sprite.
- **3D**: the name drawn to a small canvas texture (as the car's plate is), one per
  board. It's made again only when the owner's name changes.

### D2 — Claiming a bay, in the world

- **Which bays**: only `plain` ones, never a visitor's or an accessible one. **One
  bay per person.**
- **How**:
  1. Stand in a free plain bay, on foot. The HUD offers "Claim this bay · D-07".
  2. The board goes up, for everyone.
  3. In your own bay, "Give up this bay" takes it down.
  4. Claiming another bay moves your board. Your car stays where it is: you park it
     in the new bay yourself.
  - Your card in the side panel says which bay is yours.
- **A pool car in the bay you claim**: towed out, the next time no one is looking,
  to a free unclaimed plain bay.
  - The tow and the seeded cars' bays (`mod:cars`, `upgradeLot`) never use a
    claimed bay again.
  - A pool car someone leaves in your bay later is towed out the same way, after
    a while.
- **Admins** may free any bay, as with desks. They can't hand one out: people
  claim their own.

### D3 — The dealer

- **Where**: Main Street's **shut shop** opens again as the dealer, **"MOTORS"**.
  - A small showroom, with the vehicles on a forecourt beside it.
  - Bunting and a few flood lamps.
  - Its exact forecourt is measured in the mocks. If it doesn't fit there, another
    gap off Main Street.
- **What's on the forecourt**: one of each model, parked, to walk round and look
  at. Their colours change by the day. They're for show and can't be driven.
- **Buying** (no money in the game: it's free):
  1. X at the showroom's door, or at any forecourt car, opens the dealer's panel.
  2. Pick:
     - the model (no wagon: the drivable car has no wagon body, only the parked
       cars' old geometry does);
     - its colour (the nine lot colours);
     - its plate: up to 8 characters (letters, digits, `·`, `-`).
  3. Your new car **appears next to you**, fresh, with a full tank:
     - in a free spot on the forecourt or at the kerb, beside where you stand,
       facing the street (the server's `freeSpot`);
     - unlocked for you. Walk round to the driver's door, and drive it home.
  - With or without a bay: you park it wherever you like.
- **Changing it**: the same panel, and the new one appears next to you the same way.
  - **One vehicle per person**: the old one goes when the new one comes, wherever
    it was left, at the next moment no one is looking at it.
  - Your plate stays unless you change it.
- **The models**, every drivable vehicle:
  - sedan;
  - 4x4 (`offroad`);
  - pickup;
  - snowmobile;
  - snowcat;
  - tractor;
  - plough truck;
  - toboggan.

  More on them:
  - All fit a bay (2.8 × 5.6) except the **plough truck**: it's 6.6 long, so its
    nose hangs a metre over the bay's head. Recommended: it may only be parked in
    row W, nose over the dump's kerb, and the dealer says so. Or it's left out.
  - The farm's tractor, the town's plough and the shed's snowcat keep working as
    they do. Yours is your own copy.

### D4 — Your vehicle and its keys

- **It's an object as today**: kind `car`, id `own-<uid>-…`, with
  `ownerId`/`owner`/`plate` in its props (`owner`, not `ownerName`: iso labels those). Everything that already works for a
  car works for it: its tank, its grime, its dents, the pump, the tow.
- **Who drives it**: the owner, and whoever holds their keys.
  - Anyone may ride as a passenger.
  - X at the driver's door of someone else's says "It's Mary's".
- **Lending the keys**:
  1. In the owner's card on someone (`PersonCard`): "Lend my keys".
  2. They see "Mary's car keys" on their side panel.
  - One borrower at a time (props `lentTo`, `lentName`).
  - The keys come back:
    - when the owner takes them back (on their card again);
    - when the borrower leaves the car parked in the owner's bay;
    - at the end of the world's day.
  - If the keys are taken back while the borrower is driving, they finish the
    drive. They can't start again.
- **Left anywhere, it stays there.** No tow, however long, unlike the pool cars.
  Left on Main Street, in the woods, at the farm: you go there to fetch it.
- **The GPS shows it** (the phone's GPS, `37-the-gps.md`):
  - a **"My car"** pin on the map, in its colour, wherever it's parked or being
    driven;
  - a card on it: where it is ("Main Street", "The lot · D-07"), how far, and Go:
    the route on foot to it;
  - a borrower sees the lent car's pin too, while they have the keys.
  - The car objects already reach every client, so this is the client's own: no
    new message from the server.
- **The owner gone** (left the team, deleted): their board comes down and their
  car goes on the next start. The API's members are the check.

## Where it lives

| Part | Where |
|---|---|
| A bay's label (`D-07`) and id (`d-07`), the plain bays you may claim, the board's spot and facing | shared `lot.ts` (`bayLabel`, `bayId`, `bayById`, `claimable`, `boardOf`): done in phase 0 |
| The claims | world objects of kind `bayboard` (id `bay-d-07`, props `ownerId`, `ownerName`). Saved, synced and drawn like any other object; no new table |
| Claim, give up, free (admin), the one-per-person rule, the pool car moved off | world-server `features/spot.ts` (new): `spot:claim`, `spot:free` |
| Your vehicle: bought and spawned beside you, changed, the owner's and the borrower's check, the keys | world-server `features/cars.ts` (`car:buy`, `car:lend`, a check in `car:enter`). The tow leaves owned cars alone and reads the claims for pool cars |
| "My car" on the GPS | the phone's GPS (client): a pin from the car object, the route on foot |
| The dealer: the shut shop reopened, its forecourt and show cars | shared `grounds.ts` (`BUILDINGS` "motors"), `tp/grounds3d.ts` and iso's town items |
| The board drawn | iso: an `art/items/` `bayboard` sketch and the name label. 3D: `tp/lot3d.ts`, or its own small module |
| The plate | `tp/car/kit.ts` already reads `o.plate` |
| The panels | `components/hud/`: the claim hint, the dealer's panel (lazy), the keys on `PersonCard` and the side panel |

## Phases

| # | Phase | Exit |
|---|---|---|
| 0 | **Mocks**: the board in 3D (day, night, snow, the pair's shared post) and in iso; the claim hint; the dealer on Main Street (day, night), its panel and a new car beside you; the keys on a person's card; "My car" on the GPS | the user approves `design/screens/spot/` |
| 1 | **The bays**: `bayId`, `boardOf`, `bayboard` objects, `spot:claim`/`spot:free`, the board drawn in both views. The tow and the seeded cars kept out of claimed bays; a pool car moved off | Unit tests (shared and world-server); claimed and freed in the game |
| 2 | **The dealer**: the shut shop as MOTORS, its forecourt and show cars in both views, its panel, `car:buy`, the car spawned beside you, the plate | Unit tests; bought in town, driven home, parked in the game |
| 3 | **The keys and the GPS**: the driver check, `car:lend`, the keys back, no tow for owned cars, "My car" on the GPS | Unit tests; lent and taken back between two browsers; a car left in town found by the GPS |
| 4 | **Checks**: e2e (two browsers: one claims, the other sees the board; the other can't drive it until lent the keys), prod's world offline, budget (the dealer's panel lazy) | All green |

## Phase 0 — delivered for review (2026-10-24)

- **Shared `lot.ts`**: `bayLabel` (`D-03`), `bayId` (`d-03`), `bayById`, `claimable`
  (plain bays only) and `boardOf` (the post at the bay's head, its face into the bay; the
  pair's two on one post). `lot.test.ts`: a label each; every board at its bay's head, clear
  of the 4.9 a car takes, facing in, out of every other bay; the pair share a post.
- **Shared `grounds.ts`**: the shut shop is **MOTORS** now (`BUILDINGS` "motors", sign
  MOTORS: a shopfront in both views, a place on the GPS). `MOTORS` lays out its forecourt:
  - the yard x 501.5..526, z −395.4..−382;
  - its way in at the east end (x 522..526), the one gap in the kerb's parked cars and
    lamps;
  - the collection bay by it;
  - the pole sign;
  - one of each vehicle on show. The cars are nosed to the street, angled. The plough
    truck, snowcat, tractor and toboggan are side-on along the back.
  - The forecourt's surface, its trees, its solids, the GPS map and iso are phase 2:
    only the stills draw it.
- **3D** (`tp/spot3d.ts`, new): the board (pine, the name burnt in, a snow cap, the enamel
  tag); MOTORS' forecourt (concrete slabs, the kerb dropped at the way in, a white rail,
  the collection bay and its sign, the pole sign lit after dark, four flood lamps, bunting,
  snow heaped in the corners).
- **Stills** (`/dev/grounds?shot=…`, `design/screens/spot/`):
  - `spot-arrive`: walking to your car down aisle E.
  - `spot-board`: Ana's board, close, her car's nose behind it.
  - `spot-pair`: the pair's shared post, Duda's bay empty, Tomás's 4x4 nosed in behind.
  - `spot-night`: row D at dusk.
  - `spot-row`: the east half from above.
  - `spot-claim`: standing in a free bay.
  - `spot-iso`: the 3D view at the iso angle. The game's iso board is a Pixi sketch with
    the name as a label, as a desk's (phase 1).
  - `motors-day`, `motors-night`.
  - `motors-new`: a new car waiting in the collection bay, its door open.
- **The HUD's mocks** (`e2e/spot-shots.spec.ts`): the stills with the HUD laid over them in
  the game's own classes, and the GPS in the game itself.
  - `hud-claim`: the prompt, "Claim this bay · D-05".
  - `hud-dealer`: MOTORS' panel. The list with each vehicle, the colours, the plate, Take
    it.
  - `hud-keys`: someone's card with "Lend my car keys".
  - `hud-borrow`: the borrower's keys over the prompt, "Drive · Ana's car".
  - `hud-gps-list`, `hud-gps-card` (and `-phone` close-ups): "My car" in its own group,
    picked, its pin on the map.
- **Changed on the way**:
  - **The board went up to head height.** At ~1.0 a parked car's roof hid it from the
    aisle.
  - **Row D's boards have a plank each side**, so they read from the pavement.
  - **No wagon at the dealer**: the drivable car has no wagon body.
  - **The rows are lettered A–D** on the tags, not W/E.
- **Checked**:
  - shared 289 (tsx), client types, Biome on the changed files.
  - **Budget**:
    - The page is 558.3 / 558.5 (HEAD 558.2).
    - All the chunks together grew 1 KB on HEAD's.
    - The Grounds' marker reads 171.4 / 187 (HEAD 186.3). The stills went into a chunk
      without the marker, which tells nothing.
    - Importing `spot3d` lazily from the stills reshuffled the split: the lot's 3D got
      copied into the marked chunks (196.3). It's a static import now.

## Phase 1 — the bays: delivered (2026-10-24)

Phase 0 approved ("Approved — start phase 1 of the spot").

- **Shared `spot.ts`** (new, subpath `@yutopia/shared/spot`):
  - `boardObject`: the board, a world object of kind `bayboard`, id `bay-d-05`, on the ground
    floor. Its tile is the post's; `ox`/`oy` put the post exactly at its bay's head (`boardOf`),
    `face` turns it into the bay, `half` for the pair's, `back` for row D's.
  - `bayAt`, `boardsOf`, `boardOfOwner`, `postOf`, and `cantClaim` (why not: `gone`, `kind`,
    `far`, `taken`, `yours`).
  - The catalog has `bayboard` (solid on the tile like a lamp post, never built: build mode
    can't move or delete it).
- **The server** (`features/spot.ts`, new):
  - `spot:claim`: on foot (not driving or riding), on the ground floor, standing in a plain
    free bay. The board goes up, saved. Your old board comes down: one each.
  - `spot:free`: your own, or anyone's for an admin. `spot:no` says why not.
  - `teleport` "bay": back into your bay, by its aisle.
  - **The tow** (`features/cars.ts`): claimed bays are never free for it. A pool car left in
    someone's bay is moved to a free plain one the next time nobody's within 30 m, however long
    it's been there. Putting the lot back (`mod:cars`) moves a seeded car whose own bay is
    claimed.
  - The car sim's solids have the boards: a thin box along the bay's head, the plank's width (a
    tall vehicle can't drive its roof through the plank).
- **The client**:
  - **The prompt** (`car/spot.ts`, with the cars' chunk; the page is full). In a plain bay on
    foot: "Claim this bay · D-05"; in your own, "Give up this bay · D-05"; in someone else's,
    nothing. X sends it; a no is a toast.
  - It reads the boards a few times a second, not every frame, and keeps `myBay` in the HUD.
  - **The side panel**: a `P D-05` button by "My desk" (title "My bay") takes you there.
  - **The board drawn**: the item kit (`art/items/building.ts` `bayBoard`) in both views.
    - The name and the tag are painted on in 3D: `picture`, new in the kit. It's a decal on any
      face; the iso view leaves it out.
    - Iso has the name as its label, at the post (`engine.ts`, as a desk's owner's).
- **Checked**:
  - shared 291 (`spot.test.ts` 2), world-server 138 (`spot.test.ts` 2: claimed, someone else's,
    from afar, one each, a visitors' bay, given up; a seeded car moved out of its claimed bay),
    client 25, types, Biome.
  - **e2e on the GPU** (`e2e/spot.spec.ts`), in the dev world as Ana:
    - into D-05, the prompt, X, the board up with her name, the prompt now giving it up;
    - `myBay`, "My bay" taking her back;
    - in iso, then given up (the dev world as it was).
    - Shots: `design/screens/spot/built/`.
  - **Budget**: the page is 558.5 / 558.5 (the store's `myBay`, the side panel's button and its
    icon, the iso label at the post); the car's chunk 21.1 / 120; the Grounds 171.8 / 187.
- **Left**:
  - The board of someone who has left: the world server has no list of the members yet (phase
    3, with the car's).
  - **The page is full**: phase 3's keys on the person card need room. That raise is the
    user's call.

## Phase 2 — the dealer: delivered (2026-10-24)

- **Shared**:
  - **The forecourt** (`grounds.ts`): `MOTORS` has its sign's posts, the flood lamps' poles, the
    rail and the collection sign. `inMotors` says what's on it.
    - Its ground is concrete (`walk`), with no trees on it or round it.
    - Its posts and rail block walking (`motorsTiles`, in the land's chunks) and cars (the car
      world's solids; the rail in lengths of 3, each found from its own chunk).
  - **The vehicles on show** are home cars (`car/homes.ts`, role `show`), one of each, so every
    world makes them once. They're drawn, solid and towed home like the town's, and never
    driven.
  - **`car/own.ts`**: `BUYABLE` (every drivable vehicle), `cleanPlate`/`plateOf` (8 of A–Z 0–9
    · -, accents dropped; none: your first name).
  - The protocol has `car:buy` and `car:bought`.
- **The server** (`features/cars.ts`):
  - **`car:buy`**: on foot, on the ground floor, by MOTORS, a vehicle it sells, a colour, the
    plate cleaned. Your new one (`own-<uid>-…`, `ownerId`, `owner`, `plate`, a full tank) is in
    the collection bay, or the nearest free spot by you if that's taken. `car:bought` tells you.
    - **The owner's name is `owner`, not `ownerName`**: the iso view labels whatever has an
      `ownerName` (desks, the boards), and it hung over the car's corner.
  - **One each**: the old one is retired. No one gets into it, and the minute's sweep takes it
    away once nobody's within 30 m of it.
  - A vehicle on show says `show` to a driver; a retired one `gone`.
  - A driven car carries its plate (`Vehicle.plate`).
- **The client**:
  - **3D**: `Grounds3` builds the forecourt (`motors()`, from `spot3d.ts`), in the game and in
    the stills (theirs is gone). Its sign and lamp glass glow with the night; its four flood
    lamps are lights like the lamps, pools on the concrete.
  - **Iso**: the pole sign, the flood lamps, the rail. The concrete is the land's picture.
  - **The prompt** (`car/cars.ts`): within 2.6 of the showroom's door or 4 of a vehicle on show,
    "MOTORS · pick yours". The vehicles on show offer no seat.
  - **The panel** (`DealerPanel.tsx`), with the cars' chunk: it registers itself into the HUD's
    panels, so only a type changed on the page.
    - Each vehicle drawn by the item kit in the colour picked, the nine colours, the plate in
      the VFD, Take it.
    - It starts from the car you have.
    - "Bought" closes it with a toast.
  - **The plate** on your car, parked and driven.
- **Checked**:
  - shared 293 (`motors.test.ts` 2: the concrete, no trees, the posts and rail walked into;
    the vehicles on show one of each, clear of each other, the bay, the posts and the rail).
  - world-server 139 (`spot.test.ts`'s dealer test: from afar no, an unknown model no, in the
    collection bay with its plate, the second one by you and the first retired, a vehicle on
    show not driven). The nests test failed once under load, as before; it passes alone (4/4,
    twice).
  - client 25, types, Biome.
  - **e2e on the GPU** (`e2e/spot.spec.ts`, 2/2): the claim as in phase 1. Then Ana on the
    forecourt: the prompt, the panel, a green pickup "ana.86" taken, there in the collection
    bay as `ANA·86`.
    - Shots in 3D and iso: `design/screens/spot/built/game-motors-*`.
    - The retired ones went a minute after someone was in the world. A room with nobody in it
      has no tick.
  - **Budget**:
    - **The page is at 558.5 / 558.5, 10 bytes to spare.** The cars' chunk importing the HUD's
      panels re-split the page's chunks (+24 bytes); the bay icon's shorter path won them back.
    - The Grounds 179.5 / 187: the forecourt's 3D and the shared `MOTORS` copied into its
      chunks.
    - The car's chunk 23.7 / 120.
- **Not done here**:
  - The show vehicles' colours don't change by the day.
  - The bunting and the collection bay's paint aren't drawn in iso.
  - The forecourt isn't on the GPS map: phase 3, with "My car".
  - The panel's pictures are the iso drawings; the snowcat, tractor and plough look rough at that
    size.
- **The dev world** keeps Ana's green pickup (`ANA·86`) at MOTORS, the last one the e2e took.

## Phase 3 — the keys and the GPS: delivered (2026-10-24)

The user raised the page's budget ("Increase the limit and continue"): 559, from 558.5.

- **Who drives** (shared `car/own.ts` `mayDrive`, `keysDay`): a pool car, anyone; someone's
  own, its owner, and whoever holds its keys today. The day is the world's (São Paulo's, as the
  clock).
- **The server** (`features/cars.ts`):
  - The driver's seat of someone's own says `owned` (with whose) to anyone else, parked or
    stopped live. The other seats are anyone's.
  - **`car:lend`** `{ to: uid }` from the owner: one borrower at a time (`lentTo`, `lentName`,
    `lentDay`), told with `car:keys`. `{ to: null }` takes them back.
  - **The keys come back by themselves**: when the car's parked in the owner's own bay (`park`),
    and at the day's end (the minute's sweep). The borrower's told why (`taken`, `home`, `day`).
    Taken back mid-drive, they finish it: the wheel's only checked getting in.
  - **No tow for someone's own**: it stays where it's left.
    - That also fixed a phase-2 bug. A bought car had no `parkedAt`, so the tow thought it parked
      long ago and moved it to the lot at the next sweep (seen in the dev world: Ana's pickup in
      row A).
- **People gone** (their account deleted): their board and their own car come down, once a
  start. It's the room's first tick (features/spot.ts `sweep`), from the API's new
  `GET /internal/members` (`InternalController::members`, Pest: listed, gone when deleted).
  Nothing happens if the list is empty, nor to a car someone's driving.
- **The client**:
  - **The prompt**, by someone else's: "Get in · Ana's car" (a passenger's door), "Drive ·
    Ana's car" with their keys. The wheel's left out of the doors offered.
  - **Toasts**: "It's Ana's: get in beside"; "Ana lent you their car keys · ANA·86"; the keys
    back, and why.
  - **The person card** (page): "Lend my car keys" / "Take my keys back", your plate and whom
    the keys are with.
  - **The side panel** (page): the keys you hold, `🔑 ANA·86` (title: whose).
  - The car module works out, a few times a second, your car and the keys you hold. For each:
    where it is (the building's coords, live when driven) and what the place is called
    (`placeAt`, and the bay if it's in one): hud `myCar`, `keys`.
  - **The GPS** (phone chunk):
    - a "Mine" group: "My car · The lot · D-05", "Ana's car · Main Street";
    - their pins on the map (a car in a drop);
    - picked, the card with where it is, on foot or by car, Go: the route to it.
    - The forecourt's outlined on the site plan.
- **Checked**:
  - shared 295 (`car/own.test.ts` 2: the plate's rules; the wheel: pool, owner, lent today, not
    the next day, the day São Paulo's).
  - world-server 140 (`spot.test.ts`'s keys test: the wheel refused with whose, a passenger
    seat, lent and driven, taken back and refused again).
  - client 25, types, Biome; API (Pest) 19, the dev DB's users counted before and after (3, 3).
  - **e2e on the GPU** (`spot.spec.ts` 3/3):
    - the claim;
    - the dealer;
    - two browsers: Bia offered only beside in Ana's car; Ana lends from Bia's card, Bia drives
      it, has the keys in her side panel and the car on her GPS ("Ana's car"); Ana's GPS has My
      car; taken back, Bia's keys gone.
    - Shots in `design/screens/spot/built/game-keys-*`, `game-gps-*`.
  - `gps.spec` passes.
  - **`car.spec`'s frame check fails**: "no frame over 100 ms while driving", 133–150 ms. It
    fails the same way with HEAD's client (a worktree on :3107) against today's dev world, so
    it isn't this client. The world itself has 8 vehicles on show and a few of Ana's cars more
    than when it passed for the lot. The two-browser frame probe is known to be noisy
    (memory). Its knocked-car test passes.
  - **Prod's world offline** (its saved world, 806 objects; the dev world untouched): the 8
    vehicles on show made; D-03 claimed; a 4x4 bought (`SAM`), lent, driven by the other, the
    keys taken back; no refusals.
  - **Budget**: the page 558.8 / 559; the phone 17.0 / 60; the car's chunk 24.6 / 120; the
    Grounds 179.6 / 187.
- **Not done**:
  - The plough truck is sold like the rest (no row-A rule).
  - The vehicles on show keep their colours.
  - The bunting and the collection bay's paint aren't drawn in iso.

### After phase 3: the claim by the office (2026-10-24)

- **Reported**: "the option to claim the bay don't appear on the bays next to the office."
- **Measured**, row D's bays one by one in the game:
  - D-02, D-14 and D-15 showed "Drive": a parked car's door in the next bay is in reach from
    most of a bay, and the car's prompt always came first.
  - A bay with a pool car in it (D-01, D-13) can't be stood in, so it could never be claimed.
  - D-06–D-12 by the doors are the accessible pair, its hatching, the island and the visitors'
    three: never claimable, by design.
- **Now** (`car/cars.ts`, `car/spot.ts`):
  - In a bay, its claim comes first. A car's wins only when it's in that bay or you're at its
    door (within 2.2 of its middle).
  - A bay with a pool car in it offers its claim from its open end, a step into the aisle (up
    to 1.2). The server allows a claim from up to 1.4 off the bay's ends (shared
    `cantClaim`); the tow moves the pool car out as before.
- **Checked**: shared 295 (`spot.test.ts`: from the open end yes, two steps out no); e2e
  `spot.spec` 4/4, the new test standing in a free bay beside a pool car, then claiming and
  giving up a full one from its end.

## Still open

- **A second vehicle per person** (a car and a snowmobile)? One for now.
- **The plough truck's bay**: row W only, or not sold.
- **Stuck far away, with no tow**: a dry tank far from a pump, or beached in the
  woods' deep snow. A jerry can from the gas station? A shovel to dig it out? Or
  changing it at the dealer is the way out (the old one goes, wherever it is).
- **Snow on your car while you're away**: it could grow while you're offline. The
  regulars' cars would be under a foot of snow after a weekend.
- **Reserved bays**: a "reserved" sign for a bay held for a team, or a guest's bay
  for a day.

# More vehicles, more cars (plan — decided 2026-10-22; waves 1–3 delivered 2026-10-22, AI traffic left for later)

The suggestions and their reasoning are in the Claude doc "Yutopia — new vehicles
and more cars". Three waves: cars everywhere first, then the snowmobile, then
life on the roads.

## Decided (2026-10-22)

| Topic | Decision |
|---|---|
| Town cars | All of them drivable |
| Ownership | A shared fleet for now (anyone takes any free car) |
| Snowmobile | One rider; on snow and the roads, but slow on the roads |
| Police car | Looks and a siren only |
| Sounds | New ones for the new vehicles (synthesized for now) |

## Wave 1 — cars everywhere (delivered 2026-10-22)

- **Every car on Main Street is drivable.**
  - The town's parked cars were scenery: static boxes drawn by both views,
    walls to walk and drive round. Now each is a car object like the lot's
    (`town-car-i`), made once by the server and saved.
  - Each has a home spot it is towed back to (shared `car/homes.ts`
    `HOME_CARS`), not the lot. `mod:cars` puts each back at its own home.
- **Cars where people are:**
  - the farm's pickup (447, −268);
  - two on Church Street by the townhouses (one a wagon);
  - a 4x4 on the path behind the boathouse;
  - the gas station's white rental behind the kiosk.

  Every home is checked clear of everything and level (a shared test).
- **Roles.**
  - A police car by the town hall: black with white doors and a red and blue
    light bar. G sounds the siren (`CAR_FLAGS.siren`; the flags are 32-bit
    now) and flashes the bar, for everyone.
  - Two taxis near the hotel: yellow, the roof sign lit at night while free.
  - The roles are drawn in 3D (`buildSedan` `role`, `setBeacon`) and iso.
- **The pickup** (`PICKUP`, body kind `pickup`).
  - A 5.0 L V8 on four speeds, 1560 kg, light over its rear wheels.
  - A two-door cab with its back right behind the headrests, and an open bed:
    a ribbed floor, low walls with a rail, the wheel humps, a tailgate.
  - Its two back seats are in the bed, in the open (`SEATS_OF`: the seats, hip
    heights and ways out for each car kind).
  - Its sound is a synthesized V8 (`CarSound` voice `v8`): four firings a
    turn, a crossplane's beat at half that, deeper, and its own starter.
  - The automatic now shifts up short of each engine's limiter; the V8's is
    5000 rpm. The sedan's shift points are unchanged.
- **Checks.**
  - shared: every home clear and level, one police car and two taxis; the
    pickup climbs through its gears.
  - world-server: home cars made where they live with their roles; someone in
    the pickup's bed sits higher than its driver; a moved pickup put back home.
  - In game: the police car, a taxi, the pickup and the rental seen in 3D, the
    police car in iso.
- **Known:**
  - The town cars' glovebox loot spots stay at their home kerbs (shared
    `dark/loot.ts`), so a car driven away leaves its glovebox behind.
  - Far away (past 38 m), a pickup is drawn with the wagon's simple shape.

## Wave 2 — the snowmobile and the snowcat (delivered 2026-10-22)

- **Feet.**
  - A car stands on tyres, skis or a track, axle by axle (`CarSpec.feet`;
    grip.ts `footGrip`).
  - A ski glides on snow and carves into it, and scrapes on bare ground.
  - A track grips deep snow best of all, bites ice (studded), and grinds on a
    road.
  - Both sink and plough far less than a tyre.
- **The snowmobile** (`SNOWMOBILE`).
  - One rider. Skis in front (steered, never driven or braked) and a track
    behind.
  - A 600 cc two-stroke twin to 8600 rpm. Its clutch bites from 3800 rpm, as
    a belt drive holds its revs (`CarSpec.engage`).
  - About 140 km/h on snow and deep snow, over twice a car's through deep
    snow, and under 40 km/h on asphalt: slow on the roads, as decided.
  - On the pond's ice about 30 km/h in 5 s.
  - Model (tp/car/tracked.ts): a swept hood with its windshield and
    headlamp, the handlebars that turn (the rider's hands on them), the
    saddle, the running boards, the track under its tunnel, the skis on
    their legs.
  - Sound: a synthesized two-stroke (`CarSound` voice `two`).
  - Homes: two out on the pond's ice west of the boathouse's dock, one at the
    Grounds shed.
- **The snowcat** (`SNOWCAT`).
  - Four seats in a heated cab on two long tracks, a 3.2 t diesel crawler.
  - About 33 km/h flat out. The only vehicle up a 50 % slope of deep snow.
  - Model: the tracks and their road wheels, the cab's big windows, a blade
    in front, the tiller behind, roof lamps and an amber beacon, two doors,
    a steering wheel and four seats.
  - Sound: a synthesized diesel six (voice `diesel`).
  - Home: the Grounds shed.
- **Around them.**
  - Only the seats a vehicle has can be taken (the snowmobile's one; the
    server refuses the rest).
  - Both are always drawn whole: no far stand-in has their shape.
  - Iso drawings for both.
  - `/dev/car?car=snowmobile|snowcat` drives either in the sandbox.
- **Checks.**
  - shared: the snowmobile fast on snow, slow on a road; the snowcat up the
    50 % that nothing else climbs; every home clear and level.
  - world-server: a snowmobile takes its rider and refuses a second.
  - In game: both seen at their homes, a snowmobile ridden on the pond.

## Wave 3 — life on the roads (delivered 2026-10-22, without AI traffic)

AI traffic on the county road and Main Street was left for later (the user's
call, 2026-10-22). The rest:

- **Roads that stay ploughed.**
  - The road's fresh snow is now counted per place (`CarWorld.coverAt`), not
    only for the whole Grounds at once.
  - A blade clears the 4 m cells it passes over (car/world.ts `bladeCells`,
    `ploughCell`). The server keeps when each was cleared
    (`WorldState.ploughed`, features/ploughed.ts).
  - A cleared cell's snow comes back over ten minutes (`coverAfter`,
    `PLOUGHED_MS`). Every cell is forgotten once the storm is gone.
  - Both blades count: the AI plough's in a storm, and the plough truck's
    whenever it moves above 1 m/s.
  - A car stops shorter on a cleared road, for everyone (each client's sim
    reads the same cells).
- **The plough truck** (`PLOUGHTRUCK`).
  - 6.5 t, six gears, about 97 km/h on asphalt; two seats.
  - Model (tp/car/tracked.ts): an orange cab with its windows, a yellow
    blade on its arms, the salt hopper, the exhaust stack, and an amber
    beacon that flashes while someone drives it.
  - It throws the road's snow off its blade in a storm.
  - Home: the kerb on Main Street's south side.
- **The tractor** (`TRACTOR`).
  - The farm's tractor is a real vehicle now. It used to be a static
    obstacle (its tile in `walkable`/`topTile`); only its toolbox stays on
    the ground as the loot spot.
  - One seat. Lugged rear tyres (`Foot` "lug") and short shifts
    (`shiftAt` 2000): about 33 km/h on snow, 31 through deep snow.
  - Model: a narrow red hood and its stack, big back wheels under fenders,
    small front ones, the open seat, a roll bar, and a steering wheel on a
    leaning column.
  - Sound: diesel.
- **The toboggan** (`TOBOGGAN`).
  - No engine (`CarSpec.pushed`): wooden runners (`Foot` "runner"), three in
    a row.
  - Down a 15 % bank about 25 km/h in 12 s, and about 56 km/h on 30 %.
  - Holding W is a shove off the snow with your feet, on the body, not
    through the runners. It pushes up to walking pace (about 5 km/h) on
    snow, ice, deep snow or up a 10 % slope. S pushes back, and Space drags
    your feet.
  - Pushing never brakes it going downhill.
  - No fuel, no lamps, no windscreen, no sound. Its own controls hint, and
    no gear on the HUD.
  - Home: the pond's west bank, nosed down to the ice.
- **Around them.**
  - Iso drawings for all three, and `/dev/car?car=ploughtruck|tractor|toboggan`.
  - Homes may not overlap each other. A shared test checks this; it caught
    the truck's first spot, which sat on a town car.
- **Checks.**
  - shared: the truck's speed, the tractor shifting up on snow, the
    toboggan's run and push, a cleared road stopping a car shorter, homes
    clear of each other.
  - In game: all three seen at their homes. The truck was driven out in a
    storm, clearing its cells at 30 km/h. The toboggan was ridden down the
    bank toward the ice at 10 km/h.

## The look, rebuilt (2026-10-22)

The first models of waves 2 and 3 were flat boxes beside the sedan's detailed
bodies (the user: "really low budget"). They were rebuilt on a shared kit,
`tp/car/kit.ts`:

- **Shapes:** lofted cross-sections (`loft`, `sect`) for hoods, cowls and
  seats; side profiles and top outlines extruded and bevelled (`prof`,
  `plan`); rounded boxes; tubes for rails, roll bars and handlebars.
- **Running gear:** lathe-turned tyres with the sedan's tread and steel rims
  with their nuts. Duals and geometric chevron lugs where a vehicle has them.
  Track loops with cleats round their idlers.
- **Fittings:** round lamps with textured lenses, rubber window surrounds,
  text decals (doors, hoods, mud flaps), roof snow, checker-plate steps and a
  dash gauge texture (textures.ts `diamond`, `gauges`, `ash`).

What each one has now:

- **Snowmobile:** a lofted hood with its lamp, vents, stripe and name. A
  smoked windshield and a gauge pod. Handlebars with guards, a padded
  saddle and running boards. A grab rail, the tail lamp and the snow flap.
  The track with lugs, idlers and slide rails, the A-arms and shocks, and
  skis with spines and tip loops.
- **Snowcat:** two tracks with cleats, road wheels, idlers and toothed
  sprockets under swept fenders. A rounded cab with a white roof, a light
  bar, an amber beacon (lit while driven), mirrors, steps and a stripe. The
  louvred engine deck with its name and stack. A steel blade on rams, and
  the tiller with its comb.
- **Plough truck:** a conventional hood and chrome grille between fenders
  with round lamps. The curved moldboard with its cutting edge, ribs, hazard
  strip and markers, angled on its push frame. Plough lamps on posts. A day
  cab with its white roof, light bar, west-coast mirrors and the town's door
  crest. The fuel tank, steps and stack. A galvanized dump body full of salt
  with the spinner under its tailgate, mud flaps, and white steel rims with
  duals behind.
  - Its driving light shines from the plough lamps: from the fenders it only
    lit the back of the blade.
- **Tractor:** a rounded red hood over the grey engine, with a cream grille,
  lamps, the air cleaner's bowl and the stack's rain cap. Big back tyres with
  chevron lugs under arched fenders that carry lamps. Small front tyres on
  their beam with front weights. The pan seat on its spring, footplates, and
  a roll bar with the slow-vehicle sign. The hitch, drawbar and PTO.
- **Toboggan:** six ash slats on cross-bars, curled round a dowel. Side
  rails with the rope threaded along them, three seat pads in its colour,
  and the pull rope lying in front.

Also:

- The chase camera is sized to the vehicle (the sedan's unchanged): the
  truck's sits further back and higher, a sled's closer. The hood camera
  sits ahead of each vehicle's own driver's eyes.
- The Grounds stills have `veh-<kind>-f|r|s` shots of each vehicle by day,
  for comparing them.

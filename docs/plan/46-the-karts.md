# The karts — Smash Karts and Mario Kart in the snow (plan — decided 2026-10-26; phases 0–7 delivered 2026-10-26)

> Follows `28-the-car.md` (the sim, the netcode, the chase camera),
> `34-the-vehicles.md` (kinds of vehicle), the slot cars (PROGRESS "Slot-car
> track": lobby, lights, laps, places) and `20-sinuca-pingpong.md` (a game played
> in the world, for everyone; a Vortex for every game). Workflow rule: mocks
> first (phase 0), approved before any code; **the feel signed off in a sandbox
> (phase 1) before anything is built on it.**

Ask (2026-10-26): "Let's work on a funny feature now. SmashCarts / Mario Kart.
Let's create a kart game like it — first investigate and let's plan."

## What makes the two games fun

- **Mario Kart (racing).** Laps of a twisty circuit; the **drift-hop and the
  mini-turbo** (hold a drift, sparks go blue → orange → purple, let go for a
  boost) is the skill; boost pads, jumps and shortcuts; **item boxes** whose
  roll depends on your place (the leader gets bananas, the back gets the big
  stuff), so nobody is ever out of it; a hit spins you out for a second, never
  out of the race; fished back onto the track when you fall off.
- **Smash Karts (battle).** A small arena, **3-minute free-for-all**, up to 8;
  drive over a mystery box, get one random weapon (rockets ×3, a lobbed bomb,
  an oil slick, mines, a machine gun, a homing missile, a shield); **one hit
  smashes a kart** (a pop, a point to the hitter), back in two seconds; most
  smashes wins. Simple controls, short rounds, constant chaos.
- Both: instant pick-up-and-play, readable at a glance, loud and silly
  feedback, short rounds, rubber-banding so beginners still score.

## Where we are (measured 2026-10-26)

- **A car sim exists, and it is the wrong feel for this.** `shared/car/sim.ts`
  is a deterministic rigid body on four raycast wheels at 120 Hz, tyres on a
  friction ellipse, a real drivetrain and helps (`stepCar`). It is sim-lite on
  purpose: a sedan does 0–100 in 12 s and slides on ice. A kart needs
  scripted fun: an instant top speed, a drift you can hold through any corner,
  boosts. What we keep from it: `CarWorld` (height, ground, solids), `collide()`'s
  shapes, the surfaces.
- **The netcode pattern exists.** The driver's client simulates and sends its
  state at 20 Hz (`car:state`, `CarWire`); the server only checks it
  (`implausible()`) and snaps the cheater back; everyone else draws the car
  110 ms behind with Hermite curves (`poseRemote`). Car-vs-car bumps are each
  client's own (no server arbitration).
- **A race scaffold exists** in the slot cars (`features/slotcar.ts`,
  `state.slots`): lobby → five lights → race → results → lobby, laps, best lap
  and places counted by the server, `plausibleCar()`, the console under the
  picture.
- **Projectiles exist, but not against vehicles.** Thrown pool balls
  (`features/pballs.ts`) are flown by the server every tick and knock people
  down; the guns (`features/arms.ts`) are server hitscan with rewind trails.
  **Both skip anyone in a vehicle** (`pballs.ts:72`, `arms.ts:104`). No vehicle
  has health or a spin-out state.
- **Every game lives in the one `WorldRoom`** as a feature with a schema map
  per venue (`state.slots`, `state.pool`…), played in the world camera; there
  are no separate room instances.
- **The land** is code (`shared/grounds.ts`, `GROUNDS_VERSION` 2): a
  heightfield, surfaces, `WAYS` (roads as Catmull-Rom polylines), bridges
  (`deckAt`), `Route`/`along()` for arc-length progress. Treeless spots big
  enough for a venue: the HQ lawn, the farm's fields (~175 × 130 m), the pond's
  ice (96 × 68 m).
- **Models** are procedural three.js (`tp/car/kit.ts`), no GLBs; the iso view
  draws vehicles as item sprites in 4 rotations. Art direction: stylized
  facets with an ink line, like the people.
- **Budget**: world page 560.4 of 560.5 KB. Everything new must be lazy.

## The idea

**Yutopia Kart Park**: a real place on the Grounds, in a clearing cut out of
the woods north of the county road, between the gatehouse and the river. A
road winds ~280 m in off the county road, through the woods, to its gate: the
park set back out of sight and earshot of the road. It holds a ploughed
go-kart circuit with snow-bank walls
and an arena bowl in its infield, a grandstand, a VFD tower showing the order,
a car park for whoever drives out to watch. Walk up, take a kart from the rack, and you're on the
grid. Everyone in the world can see the races and the battles going on: from
the stands, from the road, from the town's windows. Two modes on the same
karts and the same items:

- **Grand Prix** (Mario Kart): 3 laps of the circuit, 2–8 karts, drift and
  mini-turbos, boost pads, a jump, item boxes by place.
- **Battle** (Smash Karts): the bowl, 3 minutes, 2–8 karts, one hit smashes,
  most smashes wins.

Empty grid slots can be filled with **Vortexes** (his kart glitches in, VHS
shimmer), at a level — so one person can always play.

## The mechanics

### K-M1 — The kart (`shared/kart/`, its own subpath export)

An **arcade** model, not the car sim: a body on the heightfield with a speed
along its heading and a grip that pulls the velocity onto the heading. ~600
lines, deterministic, 120 Hz, the same code on the client, the server (Vortex
karts and checks) and the tests.

- **Drive**: reaches top speed in ~2.5 s; brake/reverse; coasting slows it.
- **Steer**: sharp at low speed, still good at top speed (no speed-limited
  steering like the sedan's).
- **Drift-hop**: tap the hop key (Shift / R1 / B) while steering → a little
  hop, then a drift you hold through the corner, steering tightening or
  widening it. Sparks charge by time and how hard you hold it: **blue** (0.6 s),
  **amber** (1.2 s), **purple** (2.0 s); let go for a boost of 0.5 / 1.0 / 1.6 s.
  Colours from the house palette (amber VFD, not neon).
- **Boost**: a speed cap raised to ~1.35× for its time, a camera kick and FOV,
  flames out the back. Sources: mini-turbo, boost pads, the start boost (hold
  the throttle at the right light), the coffee item.
- **Air**: off a ramp the kart flies a ballistic arc; a hop at the lip gives a
  little trick boost on landing.
- **Surfaces** (the Grounds' own): asphalt full grip; packed snow slower and
  slidier; deep snow off the track slows hard (the "grass" of the track); a
  black-ice corner where the drift is long and free.
- **Bumps**: kart against kart is a light shove both ways (each client's own,
  as cars do); walls are soft snow banks (bounce off, keep most speed) and
  tyre stacks.
- **States**: `drive`, `spin` (hit: 1.1 s spinning, speed bled, items kept),
  `smash` (battle: the kart pops, the driver sits up in a cloud of confetti and
  snow, back on a spawn after 2 s with 1.5 s of blink-invincibility),
  `fished` (fell off / out of bounds / backwards too long: **Vortex** lowers a
  claw from his drone, drops you back on the line, 1.5 s).

### K-M2 — Items (proposed in the world's own flavour; names yours to change)

Item boxes are amber **cassette crates** floating over the track (8 rows of
4 on the circuit, 10 in the bowl). Drive through one: a 1 s roulette on the
HUD, then the item. One held at a time; some come in threes.

| Item | Does | Like |
|---|---|---|
| **Snowballs ×3** | fired straight ahead (or behind with ↓), bounce off walls once | Smash Karts' rockets / green shells |
| **Black ice** | dropped behind; whoever drives over it spins | banana / oil slick |
| **The stapler** | 2 s of rapid staples ahead; 3 staples = a hit | machine gun |
| **The fax bomb** | lobbed ahead, lands, beeps, blows a ring | lobbed bomb / bob-omb |
| **Vortex's drone** | homes on the kart ahead (race) / nearest (battle) | red shell / homing missile |
| **Coffee ×3** | three boosts | mushrooms |
| **The umbrella** | a shield for 8 s or one hit | shield |
| **The plough** (rare, race only, the back of the pack) | 6 s: a giant plough blade, fast, unhittable, flattens whoever it touches | star / bullet bill |

- **By place** (race): the leader rolls black ice, snowballs, umbrella; the
  middle the lot; the back coffee, drones, the plough. Battle: flat odds, no
  plough.
- **A hit** spins you out (race) or smashes you (battle). The umbrella eats one.

### K-M3 — Who decides (netcode)

- **Your kart is yours**, as the car is: your client drives it and sends
  `kart:state` 20×/s (position, heading, speed, drift and charge, boost,
  state, held item, ~32 bytes). The server checks it with the kart's own
  limits (`plausibleKart`: speed with boost, no teleports, on the track's
  surface, a spin or a smash really slows you) and snaps you back if not.
- **Items are the server's**, as the pool balls are: `kart:use` → the server
  makes the projectile and flies it every tick (substepped) against the karts'
  **rewound** positions (the arms' trails: now − 110 ms − half your ping), and
  on a hit sends `kart:hit {by, item}` to the victim, whose client plays the
  spin or the smash; the server keeps the score, so a client can't ignore one.
- **Boxes, laps, places, the clock and the score are the server's.** A box is
  taken by the first kart the server sees through it; the roll is the
  server's.
- Laps by checkpoints along the circuit's `Route` (`along()`), in order, so a
  short-cut across the infield doesn't count.
- **Vortex karts** are driven by the server with the same sim (a racing line
  with a lookahead, drifts in the long corners, items used with a level's
  aim) and are just karts to everyone else.

### K-M4 — In the world, for everyone

- **Where** (the user's pick on the site plan, 2026-10-26; it replaced the first proposal,
  fields east of the town past MOTORS): in the woods north of the county road, between the
  gatehouse and the river, set well back from the road (moved north three times on the
  user's word, "a little more far away", to ~270 m). The land there ended in the ridges at
  z −580. The plan:
  - **the Grounds grow north**: `GROUNDS.z0` −624 → −960. The ground opens north to
    z −890 over the park's width (`beyond()`), and the ridge rises past it as everywhere
    else; the river runs on north under the ridges beside it;
  - **a clearing**: the woods cut back to 8 m from the park's fence, the pad levelled under it
    and eased into the woods round it;
  - **the Kart Park road**: 9 m, asphalt, snow poles. It runs off the county road's north side
    by the river (x 219), then winds ~277 m north through the woods to the gate. The car park
    is beside it at the gate;
  - the circuit is laid mirrored (east ↔ west), so the paddock and the gate are on the
    south-east, by the road in.
- The venue is part of the Grounds: the circuit a new `Way` of kind `kart`
  (asphalt, ploughed, kerbs), a figure-eight with a **bridge** where it crosses
  (bridges already exist), banks and tyre walls as soft solids, the bowl in
  the infield, the stands, the rack of karts, the VFD tower. Drawn in both
  views. `GROUNDS_VERSION` 3. (Phase 0 keeps the circuit as the park's own geometry
  over a flat pad, not a `Way`: a way would get pavements, lamps and snow poles of its own.)
- **Watching**: from anywhere you see the karts run (iso sprites, 3D models),
  hear the engines from where they are; the tower shows the order live;
  standing at the stands, *Follow the race* lends you the leader's camera.
- **Getting in**: X at the rack → the lobby panel (mode, laps, Vortexes and
  their level, Start; anyone in can start, as the slot cars). Your kart in
  your colour, your avatar in the seat in a helmet over their look.
- **Practice**: with no race on, any kart drives free laps of the circuit,
  timed, with your best lap on the board.
- **The house record** on the tower: last 10 results, best lap, most wins
  (the object's `props.record`, as the pool table's). A real leaderboard in
  `apps/api` later if wanted.
- Cars and karts don't mix: the venue is fenced, cars stay out.

### K-M5 — The kart you see

- A little 80s go-kart: a tube frame, a fat-tyred wheel at each corner, a
  side-pod body in your colour with a racing number, a seat, a steering
  wheel your hands are on, an exhaust that flames on a boost. Stylized facets
  and the ink line. ~2 k triangles, one draw call for the body.
- The driver: your 3D person seated (the car's `drive` pose, lower), a helmet
  in your colour pulled over the hair.
- Iso: a sprite in 8 rotations made from the same model, plus the item
  effects as sprites.
- Effects: drift sparks by tier, boost flames, snow spray off the tyres, skid
  marks on the ploughed track, confetti on a smash, the drone and its claw.

### K-M6 — Cameras, controls, HUD

- **Camera**: a low chase cam (the car's `CarCamera` re-tuned: closer, lower,
  a wider FOV kick on a boost), a look-back (hold C), the 3D view forced as
  for cars. Iso watchers still see everything.
- **Keys**: W/↑ go, S/↓ brake and back, A/D steer, Shift hop/drift, Space
  item (↓+Space throws back), C look back; a gamepad (RT, LT, stick, R1, A);
  touch: the car's wheel and pedals plus hop and item buttons.
- **HUD** in the manuscript-in-wood look: place (big), lap, the lap clock,
  the item slot with its roulette, the mini-map of the circuit, the spark
  meter; battle: the 3:00 clock and the top three. Big call-outs: the lights,
  GO!, SMASHED, FINAL LAP, the flag.
- **Sound** (synthesized): a two-stroke buzz per kart (the snowmobile's voice,
  higher), drift squeal, spark ticks, the boost whoosh, each item's own, the
  start lights (the slot cars'), a little fanfare.

## Where it lives

| Piece | Where |
|---|---|
| The kart sim, items' flight, the circuit's geometry, place logic | `packages/shared/src/kart/` (`@yutopia/shared/kart`) |
| The venue on the land | `shared/grounds.ts` (+ a `kart.ts` layout, like `lot.ts`) |
| The game server | `apps/world-server/src/features/karts.ts`; `state.karts: Map<KartRace>` per venue, karts and projectiles in it |
| The client | lazy chunk `yutopia-karts` (`world/karts/`), the lobby `KartPanel.tsx` (lazy); only a dynamic import in the controller and a `panels.tsx` entry on the page |
| Tuning | `/dev/kart`: a sandbox, telemetry, sliders, a bot to race |

## Phases (each ends with something you can try)

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mocks**: the site plan of the new ground (the clearing, the road in, the park); the kart + driver in 3D and iso; a race moment in the chase cam (a purple drift, a snowball flying, the HUD); the bowl mid-battle; the lobby panel | approved images in `design/screens/karts/` |
| 1 | **The kart + the sandbox**: `shared/kart` sim (drive, drift-hop, mini-turbos, boost pads, air, surfaces, walls), `/dev/kart` with a test circuit, keyboard and pad | the numbers below; **you drive it and sign off the feel** |
| 2 | **The land and the venue**: the Grounds grown north, the clearing, the Kart Park road; the circuit, bridge, bowl, stands, tower in both views; take a kart from the rack and do practice laps with a lap clock | a timed lap in the world in 3D; others see you go round in iso and 3D; no frame > 50 ms |
| 3 | **Racing together**: lobby, lights, checkpoints, laps, places, results, the record, `plausibleKart`, remote karts, Follow the race | Ana vs Bia 3 laps to the flag; a third person watches from the stands |
| 4 | **Items**: boxes, roulette by place, all items, server projectiles with rewind, spins, the umbrella, FX and sounds | each item hits on both screens with 150 ms added latency; nothing hits through a wall |
| 5 | **Battle**: the bowl, 3 minutes, smash and respawn, the score | an 8-kart battle (people + Vortexes) to the end |
| 6 | **Vortex karts**: server-driven, three levels, race and battle | Easy beatable first try, Hard hard; 7 Vortexes cost < 2 ms a tick |
| 7 | **Checks**: e2e `karts.spec`, perf (8 karts + items at night on High), Firefox by you, budget, PROGRESS | all green, page ≤ 560.5 KB |


### The numbers phase 1 must hit (flat asphalt)

| Test | Target |
|---|---|
| Top speed | 80 km/h shown (the HUD's speed is "kart scale"); ×1.35 on a boost |
| 0 → top | ~2.5 s |
| A hairpin at top speed | driftable without braking; spins out only if you hop the wrong way |
| Mini-turbos | blue / amber / purple at 0.6 / 1.2 / 2.0 s, boost 0.5 / 1.0 / 1.6 s |
| A lap of the real circuit (794 m) | ~38 s clean, ~35 s with good drifts |
| Off the track (deep snow) | down to ~40 % speed in 1 s |
| Determinism | same inputs → the same bits, client and server |

## Risks

- **The feel** again: hence the sandbox and your sign-off first.
- **Hits over the network**: a snowball that visibly missed but hit (or the
  reverse). Rewind + 110 ms behind + generous hit radii, measured in phase 4
  with added latency before polishing.
- **Bumps** between two drivers are each client's own and can disagree; kept
  light so it doesn't matter.
- **Perf**: 8 karts + projectiles + sparks + a night race under lamps. Karts
  are cheap models; sparks are one points draw.
- **Budget**: all lazy; the page only gets the import hooks (~0.2 KB).
- **The land change**: a new `GROUNDS_VERSION` regenerates chunks for everyone
  and must not move anything else (the shared "every home clear and level"
  tests guard it). Growing the Grounds north (−624 → −960, ~40 % more
  chunks, most of them ridge and woods nobody reaches) costs the server's land worker and both views' streaming a little
  more; measured in phase 2 (the Grounds' own "worst frame while chunks
  stream" check). The minimap, GPS and iso read `GROUNDS` and must follow it.

## Decided (2026-10-26)

| Topic | Decision |
|---|---|
| Modes | **Both: the Grand Prix first, then Battle** on the same karts and items |
| Where | **In the woods north of the county road**, between the gatehouse and the river (the user's circle on the site plan, 2026-10-26; it replaced fields east of MOTORS); the Grounds grow north to fit it |
| Vortex karts | **Yes, with levels**, filling empty grid slots |
| Items | **The world's own** (snowballs, black ice, the stapler, the fax bomb, Vortex's drone, coffee, the umbrella, the plough) |

## Proposed (yours to overrule)

| Topic | Proposal |
|---|---|
| Physics | A new arcade kart sim in shared, not the sedan's sim-lite |
| Hits | Race: a spin-out; Battle: one hit smashes (a point) |
| Size | Up to 8 karts a race |
| Items | The eight above, in the world's own flavour |
| Karts | The venue's own, in your colour; not owned, not parked in the world |
| Fell off | Vortex's drone claws you back |
| Records | On the venue's tower (props), not the API, for now |

## Still open

- The park's name on the gate (proposed: "Yutopia Kart Park").
- Whether cars may drive out to it (proposed: yes, a car park by the gate;
  the circuit itself fenced off from cars).

## Phase 0 — delivered for review (2026-10-26)

The mocks are in `design/screens/karts/`. Everything in them is drawn from the park's real layout
in shared code, which phases 1–3 build on. The new land is **off in the game**: only
`/dev/karts` turns it on.

- **The layout in shared code** (`@yutopia/shared/kart`):
  - `kart/land.ts`: where the park is, the road in, the ground opened for it, the car park. These are the few
    numbers the Grounds read, kept on their own: `grounds.ts` is copied into five lazy chunks,
    and importing the whole circuit there put the Grounds over their budget (194 of 187 KB).
  - `kart/park.ts`: the circuit (`kartTrack()`), the bowl, the stands, the tower, the paddock,
    the rack, the floodlights (`kartFloods()`).
  - The circuit is a closed curve sampled every metre, 794 m a lap and 12 m wide. Each point
    has its height (the bridge), heading and curvature. It also lists the crossing, the jump,
    four rows of item crates, four boost pads, the 8-slot grid and six checkpoints.
- **The land** (`grounds.ts` `KART_LAND`, read once when the module loads from
  `globalThis.__yutopiaKartLand`):
  - The Grounds grow north to z −960. The ground opens north to z −890 over x −140..242. The
    park's fence runs z −834..−676, ~270 m north of the county road.
  - A clearing reaches 8 m out of the fence. The woods stay all round it.
  - The Kart Park road comes off the county road at x 219 and winds ~277 m north to the gate,
    with snow poles.
  - The park's pad is levelled flat at 2 m under the whole circuit, eased into the woods over
    40 m. The car park is asphalt.
  - With the flag off nothing changes: the shared tests all pass, and the Grounds measure
    185.4 / 187 KB.
- **Plans** (`world/kart-plan.ts`):
  - `plan`: the Grounds' site plan with the new land ringed and the park on it.
  - `park-plan`: the park close up. The circuit with its kerbs, the bridge and its shadow, the
    chequered line and the numbered grid, the jump, the boost chevrons, the crates. The bowl
    with its spawns and crates, the stands, the tower, the paddock and rack, the desk, the gate,
    the fence, the car park and the floodlights. Labels, the numbers and a key.
- **3D**:
  - `tp/kart/kart3d.ts`, the kart:
    - a tube frame and a floor pan;
    - fat tyres, the rear ones fatter, with cream rims;
    - a wedge nose and side pods in its colour, a cream stripe and its number on discs;
    - a bucket seat, the wheel on its column;
    - the engine with its fins and a chrome exhaust;
    - a little wing on struts, a whip flag on a pole, a lamp in the nose;
    - the people's ink line, welded smooth so it doesn't crack at the facets;
    - the driver in an open-faced helmet in the kart's colour, visor flipped up.
  - `tp/karts3d.ts`, the park:
    - the road, its centre line and kerbs;
    - the snow banks, the bridge (retaining walls on the ramps, the span open over the road
      under it, parapets, piers, its name board);
    - the jump, the boost pads, the crates;
    - the tyre wall on the far corner;
    - floodlight masts; the stands with roofs, bunting and an instanced crowd;
    - the tower's VFD board, the gate's arch and sign, the fence;
    - the paddock with a striped canopy, the rack, painted bays and the lobby's desk;
    - the bowl.
  - What flies about:
    - drift sparks in three tiers, the boost's flame, snow spray, skid marks;
    - held snowballs circling the kart, a snowball in flight;
    - black ice, the fax bomb and its blast;
    - Vortex's drone with its claw, staples;
    - a smash (confetti and a puff of snow), the umbrella;
    - dizzy stars.
  - Drivers are posed with their legs out ahead and their hands on the rim.
- **Stills** (`/dev/karts?shot=…`, `e2e/karts-shots.mts`):
  - `kart-close`: Ana on pole, Bia and Duda behind, a marshal.
  - `kart-race`: behind Ana into the last corner, purple sparks, a snowball off at Bia, Cai on a
    boost, Lu spun out, black ice; the stands and tower ahead.
  - `kart-battle`: the bowl from its terrace. The stapler, a smash, the fax bomb's blast, the
    drone, the umbrella, a kart up the bank, the crates.
  - `kart-rack`: the paddock's desk and the rack.
  - `kart-park`: the whole park in its clearing, from over the county road.
  - `kart-night`: the floodlit start straight, the stands lit, the tower's board.
  - `kart-gate`: arriving at dusk, the sign lit.
  - `kart-iso`: the 3D view at the iso angle. The game's iso view gets sprites made from these
    models in phase 2.
- **The HUD's mocks** (`e2e/karts-hud.mts`): the stills with the HUD laid over them in the game's
  own classes (ink in walnut frames, docs/plan/45), with numbered notes.
  - `hud-race`:
    - your place, big, in the book face;
    - lap, time and best lap;
    - the item slot;
    - the circuit with you ringed;
    - the spark meter and the speed;
    - a call-out.
  - `hud-start`: the five lights and the start boost's hint, your grid slot.
  - `hud-battle`: the clock, the score (the top three and you), the item, SMASH!.
  - `hud-lobby`: the paddock's desk.
    - mode (Grand Prix / Battle / Practice) and laps;
    - Vortex karts with their level;
    - your kart's colour and number;
    - the grid with who's ready;
    - Start and Leave;
    - the house record.
  - `hud-results`: your place, everyone's gap, Again or Back to the paddock.
- **Changed on the way**:
  - **The bowl is walled, not dug in.** Banked snow walls 3.2 m high round a flat floor
    (karts ride up them), with a terrace on the rim. The land needs no hole, and the walls
    read from anywhere in the park.
  - **The park moved** (the user's circle on the site plan): from new fields east of MOTORS to
    the woods north of the county road. The circuit is laid mirrored so its paddock and gate
    face the road in. The east land, its road off Main Street and the hedgerowed fields are
    gone. Then set further back from the road, three times on the user's word: the fence now
    starts ~270 m north of the county road.
  - **A lap is ~38 s**, not ~35: the circuit came out at 794 m.
  - **The circuit has no hairpin as such.** Its tightest corner, about 15 m in radius, has the
    tyre wall.
- **Checked**:
  - shared 298, including the new `kart.test.ts`:
    - the lap is 700–900 m with a point every metre, all inside the fence;
    - no corner is under 12 m radius;
    - one crossing, square enough, with the bridge over and the road under at 0;
    - nothing else in the lap comes within 20 m of itself;
    - the ramps are under 16 %;
    - the crates, pads and jump are on the flat;
    - the bowl, stands and paddock keep off the circuit;
    - with the land on: the road leaves the county road and reaches the gate, asphalt all the
      way;
    - the pad is level with no trees under the circuit, the woods round it;
    - the fence keeps 20 m off the county road.
  - Client and shared types; Biome on the touched files (one warning was already there).
  - **Budget**: the world page is 560.4 / 560.5 KB, unchanged. `yutopia-grounds` is
    185.4 / 187 KB.
- **Not in the game yet**: the land stays off, nothing is on the server, and nobody can drive a
  kart. That's phases 1–3.


## Phase 1 — the kart and the sandbox: built for your sign-off (2026-10-26)

The kart drives in **`/dev/kart`**: round the real circuit, in the park in its clearing, from the
grid. It is not in the game yet. The feel is yours to sign off here, and the numbers are tuned
live in the sandbox's panel.

- **The sim** (`@yutopia/shared/kart`, `kart/sim.ts`):
  - An arcade model at 120 Hz, deterministic: the client, the server and the tests run the same
    code. The kart has a speed along its heading. Grip swings its velocity back onto the
    heading, and a slide scrubs speed.
  - **Drive**: 24 m/s top (86 km/h on the HUD); 95 % of it in ~2.5 s; brakes; backs up.
  - **Steer**: full turn by ~7 m/s, fading a little at the top. Keys ease the wheel in; a stick
    is as it is.
  - **The drift-hop**: the hop key with a way held: a short hop, and you land drifting. The stick
    tightens or opens the arc (0.2–1.7 rad/s), so the long bends can be drifted whole.
  - **Sparks charge** with time, a little faster held into the bend: blue 0.6 s, amber 1.2 s,
    purple 2.0 s. Let go for a turbo of 0.5 / 1.0 / 1.6 s. A drift needs 7 m/s, and a hard hit
    on a bank cancels it.
  - **Boosts** raise the top to ×1.35, with a kick. The four boost pads give 1 s.
  - **The jump**: off the kicker on the north straight, about 0.9 s in the air. A hop just as
    you leave the lip earns a trick boost on landing.
  - **Surfaces**: asphalt, kerbs, snow, deep snow (down to ~40 % in a second), ice and black
    ice (a slide).
  - **Spin-out** (from a hit): 1.1 s, the speed bled away. **Walls**: the snow banks bounce you
    softly; the bridge's parapets are harder.
- **The circuit as a world** (`kart/world.ts`): the road's height under you (the bridge, or the
  road under it, by your height), the kerbs, the boost pads, the kicker, the banks and the
  parapets. It reads the circuit's own samples and needs nothing of the Grounds.
- **Laps** (`kart/lap.ts`): the checkpoints in order, so a cut doesn't count. The clock starts
  when you cross the line from the grid. The server will count with the same code.
- **`/dev/kart`** (`world/tp/kart/sandbox.ts`):
  - The park and the woods round it; your kart with you in it, in your helmet.
  - A chase camera that swings round after your path in a drift, widens on a boost, shakes on a
    knock; C looks back.
  - **The start lights (R)**. Hold the throttle as they go out for a start boost; too early
    and you bog.
  - **The HUD** in the game's look: lap, time, last, best; the spark meter; speed; call-outs.
  - **The ghost** of your best lap (G).
  - **The sound**: a synthesized two-stroke, the drift's squeal, a tick per spark tier, the
    turbo's whoosh, a thud off the banks.
  - Sparks off the rear tyres in the tier's colour; the boost's flame; a lamp at night
    (`?night=1`).
  - **The tuning panel (Tab)**: what it's doing (speed, slip, yaw, drift, charge, tier, boost,
    air, under you), every number on a slider, the whole circuit on one surface
    (`?surface=ice|snow|deep`), *Copy the numbers*.
  - Keys and a pad: W/S or RT/LT, A/D or the stick, Shift or RB/B to hop and drift.
- **Measured**:
  - Off the line: 95 % in 2.1–2.9 s; top 24 m/s (86 km/h on the HUD, where the plan said
    "80 shown").
  - **A lap is quicker than planned**: ~33 s driven carefully on grip, ~32 s by a drifting
    driver that lets go at purple and drifts again. The plan said ~38 and ~35; vmax 24 is what
    makes the circuit feel fast.
  - Drifting pays: 12 purple turbos in 3 laps for the drifting driver, and it beats grip
    driving.
  - The sandbox runs at 60 fps with 1.2–1.6 M triangles, day and night. Its worst frame over
    two laps is 35 ms; it was 213 ms before the sparks', flame's and ghost's shaders were
    compiled up front.
- **Checked**:
  - shared 308, including the new `kart-sim.test.ts`:
    - off the line and the top speed; a boost;
    - the drift and its three tiers at their times; no drift too slow or without a way held;
    - deep snow, ice, standing still, a spin-out;
    - a careful lap of the real circuit (33–48 s, over the bridge, off the jump, no hard
      knocks);
    - drifting fires purples and isn't slower;
    - the same inputs give the same bits.
  - The scripts:
    - `e2e/kart-drive.mts`: holds the keys, frame times and shots;
    - `e2e/kart-laps.mts`: the tests' driver at the wheel through `__kart.drive`, two laps,
      shots at the lights, the bridge, a purple drift, a boost, the ghost.
  - Client and shared types; Biome on the touched files.
- **Changed on the way**:
  - **The hop is a little bounce, steered**. A long hop flew you straight into the corner you
    meant to drift; only the jump's air loses the steering now.
  - **The drift opens wide**: its base and range were 1.15 ± 0.55 rad/s and are now
    0.95 ± 0.75. The circuit's bends are long sweeps, too gentle for a tight drift.
  - **The item crates are smaller and lower** (0.72 m at 0.85 m): the first ones filled the
    camera.
- **For you to try** (keyboard or pad):
  - a lap on the clock with R;
  - drifting the long bends to purple;
  - the bridge and the jump;
  - snaking (drift, let go at purple, drift again);
  - a start boost;
  - ice (`?surface=ice`).
  If a number feels off, move its slider, then *Copy the numbers* and send them: they become
  `KART`'s defaults.

## The land on in the game (2026-10-26, the user's call: phase 2's first step)

The Kart Park is in the world now: the ground opened north, the clearing, the road in off the
county road, and the park drawn in both views. The world server has the same land. There are no
karts to drive in the game yet; that's the rest of phase 2.

- **The land** (`grounds.ts`):
  - `KART_LAND` is on, no longer a switch read from `globalThis`. `GROUNDS_VERSION` is 3.
  - The dev pages and the tests no longer turn it on themselves.
- **The park on the land** (`kart/park.ts`):
  - What people walk round (`kartWalkBlocked`): the fence (not its gate), the stands, the tower,
    the desk, the rack's karts, the bowl's banked walls, the bridge's ramps. The road under the
    bridge's span is walkable.
  - The whole park is shut to cars (`kartCarBlocked`), gate too: the karts are the park's.
  - Underfoot (`kartSurfaceAt`): the circuit and the bowl's floor are asphalt; the paddock is
    concrete.
  - The HUD names it **Yutopia Kart Park**, and the car park outside "The Kart Park's car park".
- **3D** (the game's scenery, `grounds3d.ts`):
  - A step builds the park from `tp/karts3d.ts`, which is a chunk of its own. The step waits
    for the chunk to load.
  - The park has no drivers or crowd in the game; the karts sit on the rack.
  - The floodlights and the gate's lamps join the Grounds' lamps, with their pools on the
    ground. The lenses, the sign and the bulbs light up with the rest after dark.
  - `loadKarts()` is the one place that loads the park's 3D. The stills and the sandbox go
    through it too.
- **Iso**:
  - The land's picture (`art/kart-iso.ts`): the circuit with its banks, kerbs, centre line, the
    chequered line and grid, the boost pads, the kicker; the bridge's deck and its shadow; the
    bowl; the paddock; the car park's bays.
  - Things that stand up (`grounds-items.ts`): the stands, the tower, the gate's arch, the
    floodlights, the rack's eight karts, the desk, the park's rail fence.
- **Checked**:
  - shared 310. New tests:
    - walking: the fence but its gate, the stands, the tower, the desk, the bowl's wall, the
      ramps; the circuit and under the bridge walkable;
    - surfaces and cars: asphalt and concrete underfoot; cars kept out, gate included; the
      road in a car's;
    - the park's name.
  - world-server 139 of 140. The one failure, "vortex: … answers a poke privately", is
    flaky: it passes run alone twice, and is about who hears his lines in the building.
  - `e2e/kart-park.spec.ts` (the GPU, both views): the turn-off, the gate, the stands, the
    HUD's name; worst frame 33 ms in 3D and 17 ms in iso.
  - The phase 0 stills and the `/dev/kart` sandbox still draw (61 fps).
- **Budget**:
  - The world page measures **560.513 KB**, 13 bytes over 560.5.
    - None of the karts' code is on the page.
    - The page holds a list of the lazy chunks' file names for each of its lazy imports, and
      the Grounds' groups changed shape with the park. That is the same trap as before
      (memory: "Page budget traps").
    - **Raised to 561 by the user's call** (2026-10-26).
  - `yutopia-grounds` is 156.1 / 187 KB.
  - `yutopia-karts` (new) is 53.9 / 60 KB. That counts four copies of the same module, one for
    each group that reaches it (the game, /dev/karts, /dev/kart); a browser loads one,
    ~10–16 KB.

## Phases 2–7 — the karts in the game: delivered (2026-10-26, the user's call: "work on all the phases and finish")

You can race now. Walk to the paddock's desk (or the rack) and press X: you're in a kart on the
circuit, on free laps on the clock. Anyone in a kart sets up the next race in the lobby and
starts it. A Grand Prix (1, 3 or 5 laps) or a battle in the bowl (three minutes), empty slots
filled with Vortex karts at a level if you like. Phase 1's feel went in as it was: no numbers
came back from the sandbox.

- **Where it lives** (the world page grows by nothing: 560.5 KB as before):
  - `world/kart/karts.ts` (`yutopia-kart-play`, 22.3 KB) is loaded by the car chunk near the
    park. It rides the car chunk's hooks into the controller: the X prompt, the keys, the
    camera, the seat, the 3D view while you drive, the seated people hidden.
  - The HUD and the lobby are plain DOM in the game's look; no new React panel.
  - The server is `features/karts.ts`, with `state.karts` → "park" (`KartPark`: phase, mode,
    laps, Vortex fill and level, the karts, what's flying, the crates, results, the record).
  - Shared: `kart/net.ts` (the wire, the plausibility check, the numbers), `kart/items.ts`,
    `kart/bowl.ts` (the bowl as a world: karts ride its banks), `kart/vortex.ts` (his driving).
- **Phase 2, driving in the game**:
  - The kart, the sim and the chase camera are phase 1's. The HUD has the lap, the time, your
    best, the spark meter, the speed and call-outs. The sound is the two-stroke, the squeal,
    the ticks and the whoosh.
  - Others' karts are drawn 110 ms behind, eased. You hear their engines by how near they are.
  - Karts in iso are sprites of the rack's karts (`setKarts`), turned four ways.
  - Light bumps between karts: each side shoves its own away.
  - X gets out, once you've stopped.
- **Phase 3, racing together**:
  - The lobby: Grand Prix / Battle, laps, Vortex on or off with Easy / Medium / Hard, the grid
    with who's ready, Start, Ready, Out, and the house record (best lap, the last race).
  - The start: five lights a second apart, out at a random moment. A start boost if your
    throttle went down in the last 0.4 s; bogged if it was down too long. (Since "The start, as
    Mario Kart's" below: out a second after the fifth, always.)
  - On the server:
    - your reports checked (`implausibleKart`: speed, jumps) and snapped back if not;
    - held on the grid till GO;
    - laps by the checkpoints in order (the shared `LapCounter`), places each tick;
    - the flag: 25 s for the rest after the winner, the results (9 s), then the lobby.
  - The tower's VFD board shows the order live.
  - **Follow the race**: X at the stands lends you the leader's camera.
- **Phase 4, items**:
  - Crates on the circuit (four rows) and in the bowl (ten), back 4 s after they're taken.
  - A 1 s roulette, then the roll by place: the leader gets defence, the back the big stuff;
    the plough only at the back.
  - The server flies them all:
    - snowballs ×3 (a bounce off the banks; in the bowl they lean towards the nearest kart);
    - black ice behind you;
    - the stapler's burst (3 staples is a hit);
    - the fax bomb: lobbed, it trips or times out, then blasts;
    - Vortex's drone: homes on the kart a place ahead, the nearest in the bowl;
    - coffee ×3 (boosts);
    - the umbrella: eats one hit, or lasts 8 s;
    - the plough: 6 s, ×1.45 top, flattens whoever it touches.
  - A hit spins you out (race) or smashes you (battle).
  - Their shaders are compiled before they first show (that frame was 333 ms; it's 17 ms now).
- **Phase 5, battle**:
  - The bowl: spawns round the floor, three minutes, a smash is a point.
  - Back in 2 s on a spawn, blinking for 1.5 s.
  - The HUD has the clock and the top five's smashes. The results are by smashes.
- **Phase 6, Vortex karts**:
  - Driven on the server with the same sim, at three levels: pace, drifting skill, wobble.
  - He uses his items when it makes sense: snowballs and the stapler at someone ahead, ice when
    someone's behind, the rest at once. In the bowl he hunts the nearest kart.
- **Phase 7, checks**:
  - shared 310; world-server `karts.test.ts` 6:
    - a kart taken, a lap counted, the record, given back;
    - a teleport snapped back;
    - a Grand Prix with Vortex: the lights, places, the flag, the results, the record, back
      to the lobby;
    - a crate's item thrown;
    - a battle to its smashes.
  - e2e `kart-play.spec.ts` (the GPU), 4:
    - **A kart taken and driven off**: worst frame 17–33 ms. Bia follows the race from the
      stands; Cai sees the karts go by in iso. A Grand Prix started.
    - **A Grand Prix to the flag on the autopilot** (`__karts.autopilot`): items thrown, the
      results, worst frame 17 ms.
    - **A battle to its smashes.**
    - **A night race with eight karts on High**: 60 fps, worst frame 33 ms.
  - `kart-park.spec.ts` still green.
  - The whole world-server suite: 145 of 146. The one red is the flaky Vortex test from before,
    "answers a poke privately", which passes run alone.
  - `car.spec`: 1 of 3. The two red stop at the X by a lot car: the prompt there is "Claim this
    bay · C-03" (the spot's), not the car's, so it depends on which bays are free in the dev
    world. The karts' hooks in the car chunk only act once the karts module is loaded, and it
    isn't at the lot, ~800 m from the park. Not re-run on HEAD.
  - Budget: the page is 560.5 / 561, unchanged. `yutopia-kart-play` 22.3 / 40,
    `yutopia-karts` 57.1 / 60, `yutopia-grounds` 156.2 / 187.
- **Found and fixed on the way**:
  - The live world server needed a `docker restart` to pick up the new feature (memory:
    "world watch goes stale").
  - The floodlights lit nothing in the game: the game's lamp light comes from the shared
    `LAMPS`. They're there now as a "flood" kind: lit, pooled, safe; the park draws its own
    masts.
  - In iso the stands, tower and gate hid you when you stood in front of them; they fade now
    as buildings do.
  - The grid's seven Vortex karts built in one frame (133 ms): one a frame now.
  - Without kart-to-kart bumps, karts drove through each other.
- **Not done**:
  - Firefox: yours to check.
  - The record lives in the room: a server restart forgets it. It could be saved through the
    API later.
  - There are no touch controls for karts on a phone yet; the car's wheel and pedals aren't
    wired to them.

## After the user played it: Space to drift, and the rest of the phases (2026-10-26)

The user played it ("it's good") and asked for **Space** to hop and drift instead of Shift, and for
the rest of the phases.

- **Keys**:
  - Space (or K) hops and drifts. Shift or E uses your item, with ↓ held to throw it behind.
  - The pad is as it was: RB / B to hop, A for the item.
  - The HUD's hints, the sandbox's and the e2e scripts follow.
- **The lobby**:
  - **Your kart's colour**: the eight colours, a taken one greyed out (`kart:colour`, refused
    if someone has it).
  - **Ready starts it**: once someone's ready the race starts on its own after 20 s, or 3 s
    once everyone's ready (`KartPark.autoAt`, the lobby counting down). Start still starts
    it at once.
- **The race**:
  - **The circuit's map** on the HUD (bottom left), as in the mock: everyone a dot in their
    kart's colour, you ringed in the lamp's, the bridge drawn over.
  - **A fanfare at the flag** for the podium, a chime for the rest.
- **Vortex's drone fishes you out** (K-M1's `fished`): off the circuit, or 3 s the wrong way
  round, and his drone comes down with its cable, lifts your kart and puts it back on the road
  facing the right way (1.8 s). It replaces phase 2's plain put-back.
- **On a phone**: the kart's own buttons on the screen: ◀ ▶, GO, BRAKE, HOP, ITEM, OUT.
- **The park's record is saved**:
  - The API keeps it in the world's settings (`PUT /internal/world/karts`, back with
    `/internal/world`), the way it keeps the playlists.
  - The world server loads it on start and saves it at every new best lap and every race's
    end, so it outlives a restart.
- **The GPS**: "Yutopia Kart Park" is a place on it now, routed to the desk (~1.1 km from the
  lot). The road in was on it already.
- **Iso**: the karts' sprites have a driver in a helmet now.
- **Checked**:
  - shared 310; world-server `karts.test.ts` 7, new: a colour of my own, Ready's 20 s,
    everyone ready's 3 s.
  - Pest `WorldTest` 20, new: the record kept, a bad one refused, the playlists beside it.
    Run on the host with SQLite in memory; the container's run was refused, for the dev
    database's sake.
  - e2e `kart-play` 5 and `kart-park` 2, all on the GPU. New: the colour picked, Ready
    starting it, the map in the race, the drone fishing out a kart backing the wrong way.
    Worst frames 17–33 ms; the night race at 60 fps.
  - Budget: the page is 560.5 / 561. `yutopia-kart-play` is 14.5 / 40 (it was 22.3; the build
    now shares more of it with the car's chunk), `yutopia-karts` 57.1 / 60.
- **Still yours**: Firefox, and signing off the feel (the numbers are phase 1's, unchanged).

## The last of the plan (2026-10-26, "finish all the phases")

What the plan asked that wasn't built yet:

- **Lag-fair hits** (K-M3, phase 4's exit test):
  - Each kart keeps a trail of its last 1.2 s on the server.
  - A person's snowballs, staples and drone are judged against where the karts were on the
    thrower's screen: 110 ms (others drawn behind) plus half their ping (`kart:use` lag,
    measured with the guns' `arms:ping`, capped at 300 ms), or where they are now, whichever
    is nearer.
  - What lies there (black ice, the fax's blast) is judged by now. Vortex's throws are judged
    by now.
  - Tested:
    - a kart that drives off at 20 m/s just as you throw (with 150 ms of half-ping) is hit
      where you saw it; with the rewind off, the same throw misses;
    - a snowball thrown across the infield at a kart 70 m away never reaches it: the banks
      stop it.
  - `mod:kart-item`, an admin's: an item in your kart now, for testing.
- **The items' sounds** (K-M6), synthesized:
  - the throw's swish and a snowball's splat;
  - the stapler's clack, black ice's crackle;
  - the fax's handshake beeps and its boom;
  - the drone's rising buzz, a coffee's slurp, the umbrella's pop up and its pop when hit;
  - the plough's horn, a crate's clunk and its roulette's ticks;
  - spun out, smashed.
  
  They're heard by how near they are.
- **Effects**:
  - Vortex's karts glitch in: they flicker, tear sideways, for their first second (not with
    reduced motion).
  - Everyone's smash throws confetti and a crunch, not only your own.
  - Drifting karts lay skid marks on the road.
- **Vortex's levels measured** (phase 6's exit test), in `kart-sim.test.ts`:

  | Who | Best lap |
  |---|---|
  | Easy | 39.2 s |
  | Careful driver | 33.4 s |
  | Medium | 31.8–33.7 s |
  | Drifting driver | ~32 s |
  | Hard | 30.4 s |

  - Easy is beatable on a first try; Hard is hard.
  - Seven Vortex karts cost the server **0.11 ms** a tick (the target was under 2 ms).
- **Firefox**: `playwright.firefox.config.ts` runs the same e2e in Firefox:
  `YUTOPIA_FIREFOX=1 npx playwright test -c playwright.firefox.config.ts kart-play`. Here
  Playwright's Firefox wouldn't start ("Could not find profile folder", the command sandbox),
  so it's still yours to run.
- **Not done on purpose**: iso karts turn four ways, not the plan's eight. The iso view's item
  kit draws four turns; eight would mean a new kind of sprite for one thing.
- **Checked**:
  - shared 311; world-server `karts.test.ts` 9;
  - e2e on the GPU: `kart-play` 5 and `kart-park` 2. One `kart-park` run met a session left
    over from the world server's restart and passed on re-run;
  - types, Biome.
  - Budget: the page is 560.5 / 561. `yutopia-kart-play` 15.5 / 40, `yutopia-karts` 57.1 / 60.

## The quality pass (2026-10-26)

The user's word after playing it: "improve everything, from logic, to mechanics and assets".

- **The kart** (`tp/kart/kart3d.ts`), rebuilt:
  - a lofted wedge nose with a stripe, its number panel and a lamp in a chrome bezel;
  - lofted side pods with intakes and the park's decal; a chassis of tubes and a floor tray;
  - a bucket seat, a fuel tank, a butterfly wheel with grips and a dial;
  - the engine with fins, an air filter, a chain guard and a chrome exhaust to a silencer;
  - a moulded rear bumper with tail lenses, a ducktail wing on struts, a whip flag that waves;
  - treaded tyres with lettered sidewalls on five-spoke rims, kingpins, the rear axle's disc and sprocket.
- **The driver**: a helmet with the face open, a stripe over the crown and a smoked visor up.
  Long hair tucked in under it.
- **The items and crates** (`tp/kart/items3d.ts`):
  - an amber crate with a cassette spinning inside;
  - a lumpy snowball, a black-ice slick with white cracks;
  - a fax machine with its keypad, handset, paper and blinking light;
  - Vortex's drone with its eye ring, rotors and claw;
  - a striped umbrella; the plough's yellow blade with hazard stripes.
- **The particles** (`tp/kart/fx.ts`): billboards in one instanced draw per look (glow added,
  puffs, chips). Sparks stretch along their flight. The presets:
  - drift sparks by tier, a ring of light as each tier comes in;
  - the turbo's burst, the boost's flame, the two-stroke's smoke;
  - snow spray, the dust of a landing, a wall scrape;
  - a blast, a smash's confetti, a snowball's trail and splat, a crate shattering, the air past
    you in a wake.

  The stills run the same particles for ¾ s before they're taken.
- **The park**:
  - a start gantry over the line (posts, a truss, five pairs of lamps, the park's banner). Its
    lights follow the race: red one a second, all green for the go. The game finds it by name in
    the Grounds' scene.
  - The crowd bobs on its benches and a third of it waves; both happen in the vertex shader.
  - The boost pads' chevrons run forward.
- **Mechanics** (shared `kart/sim.ts`):
  - **Slipstream**: 1.1 s in another kart's wake (`kartInWake`: 2.5–14 m ahead, in line, the
    same way), near the top speed, pays a 0.8 s boost. Vortex drafts too.
  - **Tricks**: a hop off the jump's lip was already a trick. Now it shows: a barrel roll lifted
    clear, a whistle, "TRICK!", seen by everyone (the wire's `tk`, the slot's `trick`).
  - Landing squashes the kart.
- **Logic**:
  - a WRONG WAY warning after 0.8 s;
  - a podium in the results;
  - items: never the same twice running, one plough out at a time;
  - Vortex's rubber band by level (`vortexBand`: behind the leading driver, up to +4/7/10 % top
    speed; ahead, Easy −8 %, Medium −4 %, Hard never);
  - past the flag, Vortex drives your lap of honour;
  - speed lines on a boost, fainter in a wake.
- **Not done**: a grace period after the drone puts you back. The server only knows of it from the
  client's word, and a client's word for being unhittable is a cheat's.
- **Checked**:
  - shared 314 (new: the slipstream, item balance, the rubber band); world-server karts 9;
  - e2e on the GPU: `kart-play` 5 + `kart-park` 2. The night race ran at 59.5 fps, worst frame
    33 ms. The gantry's lights matched the HUD's, and the podium showed;
  - types, Biome.
  - Budget: the page is 560.5 / 561. `yutopia-karts` 51.7 / 60, `yutopia-kart-play` 16.9 / 40.

## The sounds, again (2026-10-26)

The user's word: "improve the kart sounds". Still all synthesized (`kart/sound.ts`), nothing to
download.

- **The engine**: a two-stroke's buzzy wave (every harmonic, the odd ones louder, a ragged phase).
  - An octave-up rasp and a sub for the chug, through a soft clip that bites harder under the
    throttle.
  - Two resonances: the exhaust's, at three times the firing rate; the expansion chamber's howl,
    climbing from 650 Hz to 2 kHz with the revs.
  - Off the throttle its loudness beats at half the firing rate: the two-stroke's "ring-ding-ding".
  - Lifting off at speed, the exhaust pops and crackles.
  - The revs run a little ahead of the speed off the line, and free-rev in the air. A spin-out
    wobbles them.
- **Under it** (your own kart only):
  - the intake's hiss;
  - the tyres by surface: a hum on asphalt, a crunch in snow (deeper in deep snow), the kerb's
    brrr at the stripes' rate, almost nothing on ice;
  - the wind by the square of the speed, more in the air and in a wake.
- **The drift**: a squeal of narrow-band noise and a screech with a vibrato, both rising with
  the tier. The sparks fizz, and a two-note chime marks each tier.
- **Once each**:
  - the turbo's fwoomp: a thump, a rush swept up, crackling, bigger by tier;
  - the slipstream's rising rush; a hop's spring;
  - a landing's thump and rattle (not a drift's hop);
  - a bank's thud with the bodywork's clack, and a scrape on a hard hit.
  - The start beeps are louder (low three times, then high for GO). The flag's jingle is
    harmonised with a bass and a drum on the podium.
- **Others' karts**: their engine and drift only, each detuned a little apart. They're placed
  left and right by the camera, fall off with the square of the distance, and drop in pitch as
  they pass (Doppler).
- **The items** are all redone and evened out:
  - a snowball's splat scatters, the stapler clacks, the ice crackles;
  - the fax plays a modem's handshake; the blast has a sub and debris coming down;
  - the drone's rotors beat; coffee slurps, then the power comes on;
  - the umbrella goes up with a whoomph, and a smash ends with the crowd's "ooh";
  - the crate's roulette ticks slow down; the plough sounds a diesel horn.
  - A level table keeps the peaks between −8 dB (the blast) and about −22 dB (the engine's level).
  - Items are placed in stereo too.
  - **New**: the stands cheer at the go and at your flag.
- **To listen**: `/dev/kart-sound` plays each scene (drive, items, race, flyby) or saves it as a
  WAV. `node --experimental-strip-types e2e/kart-sounds.mts <dir>` saves them all.
- **Checked**:
  - `kart-sound.spec.ts` renders every scene offline: something audible in each, nothing NaN,
    peaks −7 to −25 dB. Measured that way, the item levels were evened out, and the squeal, the
    beeps and the sub-40 Hz rumble were fixed.
  - `kart-play` 5 still passes.
  - Budget: the page is 560.5 / 561, `yutopia-kart-play` 17.2 / 40.


## The way in (2026-10-26)

The user's asks, after hearing the sounds: a sign at the road in's corner on the county road, for
people passing through to see the new attraction; a better car park; a better paddock (where you
press X to take a kart).

- **The billboard on the corner** (`KART_SIGN`, shared `kart/land.ts`): a V at the road in's
  north-east corner, its point to the county road.
  - Each wing's face is turned to the traffic coming one way. East's is seen from the town over
    the bridge, its arrow saying NEXT RIGHT; west's is seen from the campus, saying TURN LEFT.
  - The art is drawn on a canvas: dusk over the snow and the pines, a kart drifting in sparks,
    YUTOPIA KART PARK, "Grand Prix · Battle Bowl · Open daily".
  - Each wing stands on two steel posts with a catwalk and two lamps; its face glows after dark.
  - A fingerpost on the corner itself reads KART PARK and the road's length (260 m, measured off
    the road). A street lamp lights the corner.
  - The verge between the road in and the river is cleared of trees (`KART_VERGE`) so the
    billboard is seen down the road both ways.
- **The car park and the turning circle** (`KART_CARPARK`, `KART_TURN`):
  - The road in now ends in a turning circle short of the gate. Cars go round its island and
    back, or into the car park. Before, they came up to a shut gate.
  - The island holds kart No. 1 on a walnut plinth with its plaque, facing the way in, and the
    park's chequered flag.
  - The car park lies west of the circle: one aisle in off it, fourteen bays either side, the
    two by the gate blue for disabled drivers. It has painted arrows and wheel stops.
  - Kerbs with snow on them run round it, with kerbed islands at the rows' ends (a little spruce
    on the west ones), and the plough's heaps lie outside the south kerb.
  - A P sign stands at the way in, and lamps at the rows' ends and over the footway.
  - A paved footway runs along its north side to the gate, where the paving meets the gate.
  - All of it is one level pad in the Grounds (`KART_APRON`), with asphalt, paving and the
    circle's island as the Grounds' surfaces. The road's plough banks stop short of the circle.
- **The paddock** (`KART_PADDOCK` now reaches the gate; `KART_SHED`; `KART_THINGS`):
  - **The concrete is painted**: slab joints every 4 m, the karts' tyre marks out of the rack, a
    rust and cream kerb along the shed's front, each bay's line, and an amber walk from the gate
    to the desk with chevrons. PADDOCK is stencilled by the way in, and RACE CONTROL ↑ by the
    desk.
  - **The rack's shed** replaces the floating canopy. Its corrugated roof is under snow on posts
    every two bays, falling to a board wall at the back with the park's name painted inside. Its
    walnut fascia carries each bay's number, over a rust and cream scalloped valance. Lamps hang
    under the roof, and a helmet hangs on a hook over each bay.
  - **Race control** is a green clapboard hut behind the desk: a red roof under snow, its serving
    window lit over the desk, its sign on the eave, a stovepipe.
  - **Lap records**: a chalkboard on two posts by the desk (Vortex's times to beat).
  - **A fire barrel** with three benches round it; its flames flicker.
  - **The workshop corner**: a kart up on its red stand with a wheel off, the tool chest, and
    stacks of spare tyres.
  - **The podium** by the way in: three steps (2, 1, 3) and a chequered backdrop with the
    park's name.
  - **A hot cocoa cart** past the shed: green, on two wheels, with a striped awning and a string
    of bulbs.
  - The paddock's four lamps stand down its east edge by the fence, out of the walk from the gate (one in the middle stood between the camera and you). Bunting runs along them to the podium, and across the walk from the shed's front to each.
  - All of it is walked round (shared `kartWalkBlocked`), and the desk and the rack are still
    reached the same way.
- **Both views**: the 3D is `tp/kart/park3d.ts`, in the park's chunk. Most of it is batched into
  a few meshes by material. The iso has its land picture (`art/kart-iso.ts`) and sprites for
  each piece (`art/grounds-items.ts`). The iso's shed has no roof, so its karts can be seen; the
  billboard is a single face to the road there.
- **Stills**:
  - `kart-sign` (from the bridge) and `kart-sign-west` (dusk, from the campus side);
  - `kart-carpark`;
  - `kart-paddock`, `kart-paddock-mid` and `kart-paddock-night`;
  - `kart-iso-paddock` and `kart-iso-sign`.
  - `kart-rack`'s camera moved, since it now stood inside the records board.
- **Checked**:
  - Shared 316, with new tests for the car park, the circle, the billboard's posts and verge,
    and the paddock's things walked round with the desk and rack still reached.
  - World-server karts 9.
  - e2e on the GPU: `kart-park` 2, which now stops at the car park and the paddock in both views
    and takes wide iso shots of the paddock and the corner (worst frame 33 ms in 3D, 17–33 ms in
    iso); `kart-play` 5; `kart-sound` 1.
  - Budget: page 560.5 / 561 (unchanged), `yutopia-karts` 18.1 / 60, `yutopia-grounds`
    157.5 / 187. The build now makes one shared karts chunk instead of a copy per page.

## The park's people and seats (2026-10-26)

The user's asks: NPCs in the park, the park's seats sittable, and thinking about a track changer
(that's `47-the-track-changer.md`, a proposal).

- **The folk** (shared `KART_FOLK`; the server walks them: `features/park-life.ts`):
  - **Staff**: Rosa of race control stands by the desk; Joe the mechanic moves between two spots
    at the kart on its stand; Lia stands at the cocoa cart.
  - **Visitors**: Maya, Theo, Inês and Ben go between the cocoa cart, the fire's benches (they sit
    down), the rack, the nearer stand's two lowest rows (they sit, more often during a race) and
    the podium.
  - They walk straight legs off the paddock's walk from the gate, which is clear by the shared
    test.
  - Now and then each says a line in a bubble when someone is within 10 m.
  - They are server NPCs like the night guard: everyone sees the same people in the same places.
    Their looks and names (the staff's with what they do, in English and Portuguese) come from
    the client's Grounds life.
- **The stands' crowd in the game**: the painted crowd now fills 30% of the seats (it was empty
  in the game; `KART_CROWD`), in both views. The iso stands draw it too.
- **Sitting** (shared `kartSeats`): every stand seat the crowd leaves free, and three seats on each
  of the fire's three benches.
  - X by one says "Sit by the fire" or "Sit in the stands". From a stand's front or ends, X picks
    the free seat abreast of you, the lowest row first. X again says "Get up".
  - The server poses you on the seat's height, facing the fire or the track, and holds you there
    (busy `ride:park`); one sitter a seat. Getting up puts you in front of it. Leaving frees the
    seat. The seats taken travel in the park's state.
  - Sitting in the stands during a race gives you the leader's camera, as "Follow the race"
    does; getting up gives yours back.
- **The fire's benches as the office's** (the user's call, 2026-10-26: "too many invisible walls,
  … these chairs should be like the furniture we have on the office"):
  - The three benches are the office's own bench (catalog `bench`, art/items/seating.ts: teak
    slats on walnut trestles, the scarf), drawn by the item kit in both views: the iso draws the
    catalog kind; the 3D draws it through `MeshSketch` from the item art's chunk.
  - Three tiles each, a seat a tile (nine round the fire). Only the barrel's own tile is walked
    round; the benches are walked onto, as the office's seats are.
  - Walked onto and stood still on a moment, you sit (the server poses you, as X does); a way
    held, or a click somewhere, and you walk off it from where you sat (`park:stand {walk}`: no
    snap). X still sits and gets up.
  - **The straight dark edge across the ground** (it moved with the camera's angle): the lamps'
    light pools (grounds3d.ts `pools`: additive, 3 cm over the ground, no depth written) were hidden
    by the paint on the ground under them (the paddock's lines and lettering, 1 cm over the
    concrete, polygon offset factor −4). That offset grows with how glancing the look is: near the
    camera the pool won (lit), past a distance set by the camera's pitch the paint came in front
    and hid it (dark) — an edge at a fixed distance, so a straight line across the screen. Found by
    hiding the scene's meshes one at a time and reading the pixel either side of the edge. The
    pools now have the strongest offset of anything on the ground (factor −10, units −4): the
    light lies over any paint. Checked turning the camera through 8 directions in the paddock, the
    car park and the gate: no edge.
  - Before that was found, changes were made for the wrong cause (the lamp posts taken for the
    line): park lanterns, a near-camera dither, a glow on the posts. All undone by the user's call;
    the paddock's lamps are as they were (on its east edge, the bunting on them).
    - The benches' item art loads with the park (it was fetched after, and missed the Grounds'
      light).
- **What it took in the views**: sitters used to be drawn at height 0 (a floor's chairs). Now
  they're drawn at their own height in 3D, iso and the camera, which is still 0 indoors.
  - In iso, a sitter up off the floor is drawn over the seat under them.
  - In iso, the model drawing kept its own copy of the old rule, which put a sitter about 2 m
    low; fixed.
  - The ground under you, posed on a tile nobody walks on, is the land's (it used to fall back
    to the floor below), so the iso camera stays on you.
- **Checked**:
  - Shared 317 (the seats: stood up from onto open ground, the benches facing the fire, a third
    for the crowd).
  - Server: park-life 3 (a bench sat on and got up from, one sitter a seat, moves ignored while
    seated, walked off with no snap; the crowd's seats refused; a fourth row reached from the front; leaving frees it; the
    folk there and walking), karts 9.
  - Client unit 36.
  - e2e on the GPU: `park-life` 2 (both views: the folk drawn, a bench walked onto and sat on,
    walked off and not sat again, sit in the stands); the first-person seated camera still at a chair's height.

## The stands (2026-10-27, the user's call: "Bora melhorar as arquibancadas e as pessoas ali")

Looked at first, in the game, from the track, close, along, behind, from a seat, by day and after
dark (`design/screens/karts/stands-before/`):
- the crowd were capsules with a ball for a head: no face, no legs, no ink line, unlike the
  game's people; they bobbed the same whatever happened;
- the stands were plain brown blocks — sitters sat on a block a full row deep, their legs in it —
  under a roof that was one flat plane, with a post in the middle of the view;
- after dark, in the game, they were black: their lights were only built for the stills (the game
  stages the park with `night: 0`);
- and the crowd's bob never ran in the game: the Grounds' light (light3d.ts `patchGrounds`) takes
  every park material's shader hook.

All four asked for, built:
- **The structure** (`tp/kart/park3d.ts` `stands3d`, iso `art/grounds-items.ts` `kartStand`):
  - each row a footwell and a ledge with its plank seat, at the seats' own heights (shared
    `kartSeats`: a sitter's feet in the row's footwell);
  - two aisles a stand with stairs (a nosing on each step) and a rail up their middle — no seats on
    them (`standAisles`, `STAND_AISLE`);
  - a front wall of boards to the track (the park, MOTORS, hot cocoa, "beat Vortex"), inside the
    tiles walked round (`STAND_WALL`);
  - stepped side walls with a rail; the back wall with the name to the paddock; the posts behind it;
  - the roof a slab rising to the front, held from the back (no post in anyone's view), snow on it,
    its fascia with the park's name, bunting under it, lamp strips under it, floods on its front
    edge (`standRoof`).
- **The crowd** (`tp/kart/crowd3d.ts`): the game's look — faceted, a face, the ink line (as
  chars/ink.ts, its width in px); beanies, caps or hair, scarves, children; flags, signs ("GO GO
  GO!", "BEAT VORTEX", "♥ YUTOPIA", "FASTER!") and cups of cocoa. Instanced, a mesh a part (25
  draws for 175 people). The iso sees their backs: hair, hats, scarves, an arm or a flag up.
- **Reacting** (one shader poses every part from where its person sits; the kart module sets its
  uniforms a frame, `cheerStands`):
  - at rest: a bob, some looking about;
  - excited: up off the seat (the thighs swing up from the knees, the hips over the feet), arms
    up (one or both; the signs held overhead), bouncing;
  - the race's own: rising through the lights, all up at the go, again at the flag;
  - a wave along the stands as karts go by on the straight in front of them, the heads turned to
    the nearest.
  - The pose rides on the Grounds' light as an extension (`userData.grounds`), so it runs in the
    game, not only in the stills.
- **After dark**: the stands' lights (shared `standLights`: three lamps under each roof, two floods
  over the straight) are lights the game uses — the 3D view's lamps (`tp/view.ts`) and the dark's
  pools (`light.ts`) — not posts in `LAMPS` (those block a tile and are cars' obstacles).
- **Checked**:
  - shared 318 (the stands: no seat on an aisle, the front wall walked round, up from the first
    row onto open ground, five lights a stand);
  - server park-life 3, karts 9; client unit 36;
  - e2e `kart-stands` 2: 175 people drawn by day and lit after dark; a Grand Prix on the
    autopilot: the crowd at 1.00 at the go, a kart going by 1.00, the flag 0.87.

## The start, as Mario Kart's (2026-10-27, the user: "acelerar faz o motor acelerar parado igual no mario kart, ai acelerando certo tu sai com boost")

What there was: a start boost for the throttle down in the last 0.4 s before the lights went out,
bogged if down 0.9 s or more — but the lights went out at a random moment (0.2–1.0 s after the
fifth, F1's way), so the boost was luck, and the throttle did nothing on the grid (the engine
idling), so nothing told you it was down. The user's call: Mario Kart's way.

- **The lights** (shared `net.ts`): one a second, out a second after the fifth, always
  (`GO_MS`, 5 s from the first).
- **The rule** (`kartStart`, how long before they went out the throttle went down and stayed):
  on the fourth or fifth light (2.25 → 0.8 s before), a **rocket start** — the amber turbo's
  boost (1 s); after the fifth (0.8 → 0.25 s), a **good start** — the blue's (0.5 s); held from
  before the fourth, **flooded** — no throttle for 0.9 s off the line. Lifted, it starts over. The
  game times it against the lights as I saw them come on (the race's own word comes a moment
  later), and says ROCKET START! / GOOD START / FLOODED! / GO!.
- **Revving on the grid** (`gridRevs`): the throttle down, the engine revs where it stands — up
  near the limiter in ~0.6 s; held too long, hunting off it, missing (flooded). Heard (the
  engine's own revs, thicker; lifting off, the exhaust pops), seen (the body shudders on its
  springs, the two-stroke's smoke thick, thicker flooded), and told: the report carries the revs
  (`rv`), the slot (`KartSlot.rev`, minus flooded) has them for everyone else's ears and eyes.
- **Vortex** revs too and starts by his level: down on the fourth or fifth light four times in
  five on Hard, half the time on Medium, a quarter on Easy; a good start some of the rest.
- The sandbox (`/dev/kart`, R) the same.
- **Checked**: shared 338 (the rule, the revs, a rocket start 4 m+ ahead of a plain one after
  2 s); server 13 (Vortex revving by the fifth light, most of his Hard karts off on a boost, no
  revs once away); client unit 36; e2e `kart-play` "the start": the throttle down on the fourth
  light, the revs on the grid 0.89 (the server has them), ROCKET START! and 106 km/h half a second
  after the green.

## The road in, levelled to the car park (2026-10-27, the user: "The entry road is buggued")

The road in came up to the turning circle 1.6 m under it: a way's height is the land under it
smoothed along it, and the land was levelled to the park's 2 m only up to the fence — the car park
and the turning circle (23 m out, past the gate) had a pad of their own the road knew nothing of.
So the road's last stretch cut a 0.4 m hole into the circle (inside its own width a way beats a
pad) and dropped 2 m over the next 4 m, its verges stepping down the side.

- The park's level ground is its fence's rectangle **and** its apron (the car park, the footway,
  the circle: `grounds.ts` `kartPadDist`), the land eased out from both: the road climbs from ~0 to
  2 m over its last ~40 m, meets the circle within 7 cm, no hole.
- **Checked**: the heights across and along the road (2.00 m over the whole circle, 1.93 at its
  edge, rising evenly south of it); seen from above, from the south-east and down the road (3D) and
  in iso; shared 338; e2e `kart-park` both views (the road off the county road to the gate).
- **Then the mouth** (the user: "Still too ugly, make the road blend"): where the road met the circle
  the circle's flat asphalt ended in a straight cut (its decal stopped a metre short of the circle's
  south edge), a strip of it stood flat in the air over the falling road, its arc met the road's
  edges in a sharp notch, and the road's verges ran on to the circle in white bands. Now:
  - the circle drawn whole; its **mouth** (`tp/kart/park3d.ts` `carMouth`) flared out to the road's
    edges — a curve each side, tangent to the circle and to the road — and its asphalt fading down
    the road over 11 m into the road's ploughed surface, draped over the land;
  - the road's verges and spray taper away into the circle and its paint stops short of it
    (`tp/roads3d.ts` `intoTurn`); in iso the same mouth painted (`art/kart-iso.ts`) and the verge
    stopped short of the circle;
  - **Checked**: from above, from where the user stood, down the road and in iso; client unit 36;
    e2e `kart-park` both views (worst frames 50 ms 3D, 17 ms iso); page 560.6 KB, the karts' chunk
    23.5 KB.
- **Double-checked**: the start's timing and a flooded engine reset on leaving the kart; the apron's
  levelling reaches down the road, not across (it had pulled the frozen river beside the car park up
  to 0.45 m into a shelf: the river's back as it was, the road's climb unchanged).

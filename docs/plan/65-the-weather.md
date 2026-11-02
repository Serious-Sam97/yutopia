# 65 — The weather

Ask (2026-11-01): "Today we only have snow, we need to improve that … The base should be green
nature with no snow in it, and we will add snow days that will make slowly the snow to be on
top of the terrain, cars, buildings, tree etc.... Slowly in and slowly out when the snow stop
coming too. Days with no snow, days with rain, days with snow etc... We should be very careful
and with a lot of quality in this." Planned 2026-11-01. Follows `27-the-grounds.md` (the
weather, the surfaces), `33-the-look.md` (the roads worn, flat faces), `44-the-night.md` and
`64-the-fog.md` (the shared-uniform hook). Workflow rule: mocks first (phase 0), approved
before any game code.

**This changes what the world is.** Plan 27 began with "this snow, dark, mysterious thing is a
must". After this plan, snow is weather: it comes, it lies, it goes, and the land under it is
green. The night, the dark and the fog stay as they are. The snow keeps its look when it's
there.

## Where we are

### The weather today

- **One kind of weather: the snow.** `shared/weather.ts` has `stormAt(ms)` (a blizzard about
  every other hour, 6–14 min), `windAt(ms)`, and the morning fog (`fogAt`, `fogLift`, `rimeAt`).
  There is no rain, no temperature, no season, and nothing about what's lying on the ground.
- **The server** eases `state.storm` 0.02 a second (`WorldRoom.ts:437`), with `stormBy` /
  `stormTo` / `stormUntil` for an admin's call (`mod:storm`). The fog is next to it. `WorldState`
  is at **57 of Colyseus's 64 fields** (`schema.ts:547`). Only the steps' volume is kept across
  a restart (the world's settings, `PUT /internal/world/sound`).
- **It always snows a little.** Two of the three flake layers are always on
  (`campus.ts:1956`; only the storm's is gated). Snow builds on people in ~6 min with no storm
  (`view.ts:3970`). The windscreen snows up from a 0.25 baseline (`cars.ts:919`). The cold never
  goes under 0.35 (`grounds-life.ts:141`, `cars.ts:480`). The dash's outside temperature is
  always below zero, so its ICE lamp is always lit (`cars.ts:1722`).
- **One thing already comes and goes: the roads' snow.** `roads3d.ts:511` `roadSnow` is one
  `{ value }` shared by the road, driveway and lot shaders (`rdSnow`). It rises towards the
  storm over ~5 min and melts over an hour. A client coming in works out what the last two
  hours' storms left. This is the pattern for the whole plan. Under it, though, each kind of way
  keeps a permanent packed snow (`BASE`: street 0.1, driveway 0.38, road 0.5).

### The snow is baked in

- **The land.** `grounds-stream.ts:106` `landColour` gives each vertex its surface's colour
  (`grounds3d.ts:222` `SURF`): snow `0xf3f6f9`, deep `0xeef3f8`, path, asphalt, walk, ice, floor,
  rock. The colour is multiplied by `snowCanvas` (white and blue blotches). **There is no grass,
  no dirt and no green anywhere**, and the `Surface` type has none (`shared/grounds.ts:86`). The
  only natural ground that isn't white is `rock`. The surface rule (`groundSurfaceAt`,
  `grounds.ts:1253`) is: the ways, the lot and so on, then the pond and river as `ice`, steep
  ground as `rock`, else `deep` under trees or `snow`.
- **The textures**, all made on canvases: `snowCanvas` (`campus.ts:279`), `trailCanvas` (packed
  snow, `grounds3d.ts:245`), `walkCanvas` (concrete under a dusting, :269), `iceCanvas` (:296),
  `slabCanvas` (`roads3d.ts:99`), `lotPaintCanvas` (snow in the corners, `lot3d.ts:21`), the
  campus's lot, road and slush canvases (`campus.ts:317`, :390, :539), and the HQ's façade with
  white snow painted on every ledge (`campus.ts:225`).
- **The trees.** A pine is dark green tiers, each with a white snow cone **merged into the same
  geometry** (`grounds3d.ts:515`). Under every near tree is a snow mound (`grounds-stream.ts:263`).
  The bare tree and the birch have no snow, but they are winter trees: no leaves. The woods' floor
  (`woods3d.ts:29` `snowedOn`) paints every upward face white and throws away its real colour.
  The fog's rime finds "the snow" on the trees by its brightness (`grounds-stream.ts:205`), and
  so takes the birch's white bark for snow too.
- **The water is ice.** The pond, the river (its bed 2.6 m under the land) and the ravine's creek
  are flat ice sheets (`grounds3d.ts:1137`). There's no water body. The ice is ordinary ground,
  walked and driven on (`ice` footing and grip).
- **Snow things everywhere,** built by `tp/snow3d.ts`'s helpers (`ridge`, `driftAlong`,
  `bankAlong`, `icicles`, `slopeSnow`, `flatSnow`). They are used for the roofs of the Grounds'
  buildings, the drifts at walls, the ploughs' banks, the snow poles, the fence, the lamps, the
  street furniture (`town3d.ts`), the landmarks, the farm, the statue and the lot (`lot3d.ts`).
  **Almost all of it is merged into the same mesh as what it lies on** and shares its material
  (`grounds3d.ts:797` `lambert()`). It is told apart only by being white, and so are many trims.
- **The cars.** A sedan's roof, bonnet and boot snow are their own meshes, sized at build from
  `snowy` (`sedan.ts:1653`). 70–80% of parked cars are `snowy` (`shared/grounds.ts:313`,
  `lot.ts:220`). The far cars' merged geometry has `flatSnow` on top (`campus.ts:775`).
  There's a road-salt sill and a slush ring round every wheel arch even with no snow.
- **The Kart Park** is a snow park: its own `MeshStandardMaterial` snow (`kart/park3d.ts`),
  snow and ice track grips (`kart/sim.ts:11`), and "KART PARK · SNOW" on its signs.

### What reads the cold and the snow

- **The footing**: 6 of the 17 footings are snow or ice (snow, deep, packed, ice, slush,
  blackice). `footingAt` already takes a fresh `cover` and turns asphalt to snow over 0.35
  (`shared/grounds.ts:1381`). `speedOn` slows deep snow to 0.6. The feet's own surfaces
  (`shared/move/surface.ts`) and the cars' and karts' grips (`car/grip.ts`, `kart/sim.ts`) all
  have snow and ice.
- **The steps** (plan 63): sets for snow, deep, packed, ice and slush; none for grass, earth
  under rain, mud or puddles (`public/sfx/steps`).
- **The server**: the plough (`features/grounds-life.ts:288`, out above storm 0.45), the
  ploughed cells (`state.ploughed`), the drivable plough truck, warmth draining outside at night
  (doubled in a storm, `shared/vitals.ts:72`), the danger (+0.25 in a storm), pets scared in one.
- **The people**: snow settling on shoulders and crown (`person3d.ts:1236`), two breath systems
  (`view.ts:4453`, with no cold check, and `chars/anim/life.ts:331`, gated on `coldOf`), the cold
  body (hunch, hug, rub hands). The wardrobe already has the coat, parka, puffer and **the
  raincoat with a hood**, snow boots, beanies and mittens. Nothing is forced wintry.
- **The sky**: `SNOW_SKY` by the hour, the overcast's `cloudK`; the hemisphere's bounce off the
  ground is cold blue "because the snow throws it back" (`light3d.ts:107` `landBounce`).
- **The sound**: the wind, the crunch synth, crows, the river ice's ticks, the fog's drips.
- **The tests**: `grounds.spec` (deep snow slower, prints left), `kart-circuits` (snow brighter
  than the road), `snow-shots`, `look-shots` (`__roadSnow`), `night.spec` (the same storm for
  two). `e2e/helpers.ts` clears the fog for every spec.

### The hooks we have

- **Every Grounds material** goes through `patchGrounds` (`light3d.ts:113`), which calls the
  material's own `userData.grounds.patch(shader)` and keys the program by it. The roads use it.
  **The campus's materials** go through `patchOutdoors` (`light3d.ts:79`), which **replaces**
  `onBeforeCompile` instead of chaining it and gives everything one key.
- **The fog's global hook** (`tp/fog3d.ts`): accessors on `Material.prototype` give every fogged
  material the same uniform objects. It runs in `fog_fragment`, after the light, so it can tint
  the final colour but **can't change what a surface is** (the albedo) or see its normal.
- **The trees' shader** (`grounds-stream.ts:180`) has the rime as a shared `{ value }`, the
  per-instance tint and the wind. Same pattern.
- **A car's own uniforms**: `wear` (`uGrime`, `uDmg`) shared by its outer materials
  (`sedan.ts:759`), set by `setWear`. The far cars and the AI vehicles share materials.

### Budget

The page is 424.3 of 430 KB, the Grounds' chunk 176.0 of 187, the car chunk under its 120, the
characters 58.0 of 58 (plan 64). New art is mostly canvases and geometry code in the Grounds'
chunk. The weather's shader text has to be in place before the first outdoor material compiles
(as the fog's, plan 64's risk). Sounds are files in `public/`, not in the chunks.

## The idea

**An ordinary day is green.** The lawn runs down from the HQ to the water tower, short grass
with clover in it and a mown stripe. The woods are dark pines over a floor of needles and moss,
with birches in leaf, ferns and bracken. The trails are packed earth and gravel. The pond is
water, with reeds and the canoe tied at the dock. The river runs under the bridges. The roofs
are slate, tin and tar, and the lot is plain wet-looking asphalt with its paint. The look is
the same as today: flat faces, an ink line, the blue shade and warm light.

**Then a cold front comes in.** The sky goes white-grey. The first flakes melt as they land.
Twenty minutes in, the grass's tips are white and the car roofs and the benches are dusted.
After an hour the lawn is white with the green showing in patches, the paths dark where people
walk, and the roofs white to the eaves. By the second hour it's today's world: the drifts
against the walls, the snow cones on the pines, the banks the plough pushes up, the cars
humped white in their bays. The pond freezes over a cold night.

**And then it goes, slowly.** The roads clear first (the traffic and the plough), then the
paths, then the sunny side of the roofs, the open lawn in islands, the cars driven. The snow
under the pines, on the north side of things and in the drifts lasts longest, grey at the
end. For a while everything drips, the ground is dark and wet, and there's slush in the gutters.

**Rain days** are dark green and grey. The rain is streaks in the lamps' light. It rings in the
puddles on the lot and in the trail's ruts and drums on the car roof you're sitting under. The
asphalt shines, the lights double in it, and the windscreen beads until the wipers go. The
woods drip after it stops. When it's cold enough, the rain turns to sleet and then to snow, and
the snow starts to lie.

## The mechanics

### W1 — The sky's schedule

- **A front at a time, not a die per day.** The weather comes from two slow curves of the
  server's clock: `warmth(t)` (how cold the air is) and `wet(t)` (how much the sky holds), each
  a sum of slow sines seeded by the world, with periods of days. When `wet` is over a line, it's
  coming down. Whether that is snow or rain is down to the temperature. That gives:
  - spells that last (a snowy day is often two or three; a dry spell a week);
  - weather that turns: a rain that gets colder turns to sleet and then snow;
  - no history needed: the same function on the server and in every client, any time, with
    no state.
  The storm windows stay (`stormAt`), but they become the gusts within a front. A blizzard is a
  storm window on a snowy day; a downpour or a thunderstorm is one on a wet one. They come only
  when it's coming down.
- **The temperature** `tempAt(ms)` in °C: the front's warmth, plus the hour (coldest just before
  dawn, warmest at 15:00, less of a swing under cloud). It's what decides:
  - snow (under ~0.5 °C), sleet (0.5–2 °C) or rain;
  - melting (above 0 °C, faster in the sun and in rain);
  - the pond's ice (a cold night freezes it, a mild day thaws it);
  - the frost, the rime (plan 64's only when it's freezing), black ice (wet and freezing);
  - the breath, the cold body, the warmth drain and the car's dash.
- **What the day is**, for the panel, the phone and the tests: `skyAt(ms)` gives `{ kind:
  "clear" | "cloudy" | "rain" | "sleet" | "snow", fall: 0..1, temp, cloud: 0..1 }`. `fall` is how
  hard it's coming down; `storm` keeps meaning how wild it is (wind, whiteout).
- **The shares** (proposed, to set in phase 1 by thresholds and checked over 10,000 days): about
  35% of the time clear, 25% cloudy, 20% raining, 20% snowing. **How often it snows is the
  user's call** (see Decisions).
- **Plan 64's fog** stays as it is. It takes the day's temperature for its rime (none above
  freezing; a warm morning's fog leaves dew instead).

### W2 — What lies on the ground

Four numbers of the world, each 0..1, eased slowly:

| | Builds | Goes | Notes |
|---|---|---|---|
| `snow`: snow lying | with `fall` while it snows below freezing: white over ~2–3 h of steady snow, ~45 min in a blizzard | above freezing, faster in sun and rain: ~6–10 h | the speed is the user's call |
| `wet`: how wet things are | with rain or sleet, or snow melting: soaked in ~30 min | drying: ~1–3 h, faster in sun and wind | snow melting keeps it wet |
| `puddles` | after ~30 min of real rain | ~2–4 h after it stops | slower than `wet` |
| `ice`: the pond's and the river's | after ~6 h under −2 °C | after ~4 h over +2 °C | thin ice not walked on (W6) |

- **Worked out the same way by everyone.** `groundAt(ms)` in `shared/weather.ts` replays the
  schedule from 4 days back in 10-minute steps (~600 steps, under a millisecond) and returns all
  four. Past four days nothing is left. The server uses it at start and for its tests.
- **The server keeps the truth** in the room's state, stepping the same rule each second from
  where it is. So an admin's call (snow now, clear it, melt it) carries on naturally: snow called
  for an hour lies there and melts by the rule after. The four numbers and any call in force are
  saved with the world's settings every few minutes and on shutdown (as the steps' volume is), so
  a restart doesn't lose a snow an admin made. Without a saved one it's the replay.
- **Clients** ease towards the state as they do the storm. Coming in, they start at its value,
  with no ramp.

### W3 — The green under it

A new base for the land and everything on it, in today's look (flat faces, ink, the grade).

- **The surfaces keep their ids** (god mode saves edits as the `SURFACES` index): `snow` becomes
  the open ground and `deep` the woodland floor. Their names on the panel change, not their
  numbers. What they draw and how they sound comes from the base and the snow on them (W5).
- **The ground's colours** (`SURF`, `landColour`): grass in two or three greens by a world noise
  (no repeat), drier and yellower on the slopes and the edges of the ways, darker and mossier
  under trees. Earth and gravel on the trails. Bare earth and roots on the steep ground before it
  turns to rock. Reeds and mud at the pond's and the river's edges.
- **The textures rewritten** as canvases (made once, as today): grass (fine flecks of light and
  dark, clover, a few small flowers, kept quiet), the forest floor (needles, moss, small stones),
  the trail (packed earth, gravel, ruts), the pavement without its dusting, the lot paint without
  its corner snow, the slabs, the HQ's façade without its ledge snow, the roads without `BASE`'s
  packed snow (the asphalt's wear, the patching and the salt stay, as wet patches by `wet`).
- **The trees**: the pine as it is without its snow cones (they become the snow's, W4). The
  birch and the bare tree get **leaves**: faceted crowns in clumps, a per-instance tint as the
  pines have, swaying in the wind. A few bare snags stay in the woods. Shrubs, ferns and bracken
  on the woods' floor; boulders and stones keep their own colour on top (with moss).
- **The water** (W6): the pond and the river as water.
- **The rest**: the farm's crops green, the fence, the lamps, the street furniture, the statue,
  the plaza and the bridges without their caps (they become the snow's). The Kart Park follows
  the weather (the user's call): its tracks dirt and tarmac, its snow the layer's.
- **The light**: the ground's bounce (`landBounce`) from a warm green-grey on grass towards
  today's cold blue as the snow lies. The sky's palette by the hour **and** the weather: today's
  `SNOW_SKY` for a snowy day, a bluer one with clouds for a clear day, a low grey for rain. The
  night (plan 44) is checked on green: grass is far darker than snow under the same light, so
  the dark's numbers (`DARK_LEFT`, the lamps' pools) may need retuning.

### W4 — The snow on top of everything

The core of the plan. The snow is **one layer, drawn over the world in the shader**, with real
snow shapes that grow in when it's deep. Three parts, all from one shared `wxSnow` (the eased
`snow`):

- **The dusting (every outdoor surface).** In the shader, before the light: a surface facing up
  turns to snow by how much it faces up, the world's `snow`, and a world-space noise. As `snow`
  rises, the white comes in **from the noise's high points out**: first the grass's tips and the
  car roofs in specks, then patches, then whole. As it melts it goes the other way, so it leaves
  islands, not a fade. Each place's threshold is moved by:
  - **how much it faces the sky**: a roof, a bonnet, a bench's seat, the top of a wall and a
    branch catch it; a wall doesn't (a little on its ledges);
  - **where it is**: the roads and the paths last to whiten and first to clear (traffic, salt,
    the plough, warmth); under the trees later and patchier; in shade and on the north side last
    to melt; the drifts' places last of all;
  - **what it is**: a parked car's roof and a cold bench first; the HQ's warm roof slower;
    a car's bonnet that's been driven clears.
  The snow's colour and its blue shade are today's, with the sparkle. The material's own colour
  goes under it, so the light, the ink and the fog stay right.
- **The shapes (the snow's own geometry).** Every piece of snow geometry today (the caps, the
  slabs on the roofs, the drifts, the banks, the mounds under the trees, the pines' snow cones,
  the icicles) is **kept and tagged**: a vertex attribute saying it's snow, how far it stands
  above what it lies on, and when it comes in. The helpers in `snow3d.ts` set it, so everything
  made with them is tagged in one place. In the shader a tagged vertex is pressed down onto what
  it lies on by `(1 − grown)`, where `grown` comes from `wxSnow` and the piece's own threshold. So
  a roof's slab rises out of the dusting as the snow gets deep, a drift builds against a wall, a
  pine's cones fill out, and when it melts they sink back and go. Under 2% grown, a piece is
  dropped (discarded), so nothing flat fights with the roof. Icicles come last and hang only
  when it's been freezing after a thaw (`snow` high and the temperature crossing zero).
- **The ploughs' banks and the lot's heaps** grow with the ploughs' work: as today, only where
  and when a plough has been, so they belong to the snow too and go with it.

Where the shaders are:

- **The Grounds' materials** through `patchGrounds` (one change: every Grounds lambert gets the
  layer; the roads' `rdSnow` becomes `wxSnow`, with the roads' own rules as the "where").
- **The campus** through `patchOutdoors`, which first has to chain its hook as `patchGrounds`
  does, and key its programs by what it adds.
- **The trees and the woods' floor** in their instanced shader (`grounds-stream.ts`), next to the
  rime. The trees' "snow is the bright part" test goes; the tags replace it (and the birch's bark
  stops counting as snow).
- **The cars**: in `wearable` (`sedan.ts`), with a `uSnow` per car beside `uGrime`. A car's snow
  is what fell on it since it last moved (a parked car has the world's; one driven an hour has
  none). The far cars and the AI vehicles share materials, so they take the world's.
- **The Kart Park**, the karts, the vehicles, the people's shoulders and crowns (already their
  own meshes, now from the world's `snow` and `fall` with no baseline).
- **The shadows**: a shape's shadow has to follow its height. The tagged pieces cast no shadow,
  or their depth material takes the same press. Phase 3 picks.
- **Nothing indoors** takes any of it.

**Under a roof stays dry.** Snow doesn't lie under the bus shelter, the bridges, a car or the
canopy, and doesn't fall there. Today the flakes are hidden under a list of roof boxes. For the
layer: the same boxes as a small texture round the camera (what's over each spot, a cheap
top-down height map, made when you move), read by the snow, the wet and the falling rain and snow.
On Medium, the boxes alone.

### W5 — The footing, the grip, the prints

- **The surface under your feet** is the base and the snow on it: open ground is grass when
  `snow` is under ~0.3, snow over it, deep snow over ~0.75 (and under the trees). A trail is
  earth, then mud when `wet` is high, then packed snow. Asphalt is wet when `wet` is, slush while
  snow melts on it, black ice when it's wet and freezing. `footingAt` already takes a `cover`:
  it becomes the world's, and the place's own threshold from W4 (the same function on the
  server, the client and in the shader's noise, so you hear and slow on what you see).
- **New footings**: grass, earth, mud, gravel, puddle, wet asphalt (the step sets in W8).
  `speedOn`: mud a little slower, deep snow as today.
- **The grip**: the cars' and karts' `GRIP` tables gain grass, mud and wet asphalt. Today's
  ice and snow rules stay.
- **Prints**: footprints and tyre tracks in snow as today, only where the footing is snow. In
  mud, darker prints that last longer. Not on grass.

### W6 — The water

The pond and the river become water that can freeze (the user's call; see Decisions).

- **Drawn**: a water surface in the look (flat colour by depth, the sky's colour off it at a
  glancing angle, slow ripples, rings where rain falls, a darker edge on the shore). On it, ice
  by the world's `ice` with today's ice look, coming in from the shores.
- **Walked**: open water can't be walked onto. The shore stops you as a wall does, and the
  server's move check agrees. When `ice` is over ~0.8 it's walked as today, and the cars can't
  drive onto it unless it's thick. Thin ice cracks underfoot (a sound, no falling in).
- **The things on it**: the canoe floats at the dock, the dock's posts stand in the water,
  reeds at the edge.

### W7 — Rain

- **The rain itself**: streaks, not points. One instanced mesh of thin quads in a box round the
  camera, stretched along the wind and the fall, wrapped in the vertex shader (no work a frame
  on the CPU). Lit by the lamps and the headlamps: streaks show mostly in light, as they do.
  Not under roofs (the height map, W4). Sleet is short streaks with a few flakes. On Medium,
  fewer.
- **Splashes**: small rings and crowns on the ground near the camera (on the land's height),
  on car roofs and bonnets, and on the water. A few hundred, re-used.
- **Wet**: by `wet`, the outdoor surfaces darken (more on earth and asphalt, less on grass and
  metal), and the asphalt and the cars take a soft sheen: the lights stretch in it (a stylised
  highlight, not reflections). Puddles by `puddles`, on the lot, the ways and the trails' ruts,
  in a world noise and on low ground: dark, flat, with the sky's colour and rain rings.
- **Drips**: from roof edges and the trees for a while after rain (a few streaks and the
  sound).
- **The cars**: the windscreen beads (a texture of drops, as the screen's snow is today) and
  the wipers clear it. The wipers come on by themselves in rain, as they do in a storm. A car's
  roof drums when you sit under it.
- **The people** (the user's call: in): clothes and hair darken by how long you've been out in
  the rain, and dry off indoors or under cover over a few minutes (as the snow on shoulders
  goes). Their model has one shared material, so the wet is its own per-person value (an
  attribute or the shoulders' way), not a uniform. A raincoat's hood goes up in the rain. Nothing
  else is forced. Snow on shoulders only when it's snowing (no baseline).
- **Thunderstorms** (the user's call: in): a downpour storm window with lightning. A flash lights
  the sky and the land for a frame or two, and the thunder comes after by the distance.

### W8 — The sound

- **Rain**: a bed by how hard it's falling, in layers by where you are: in the open, under the
  trees (softer, then the drip), on a roof over you (indoors: muffled, on the windows), on the
  car's roof from inside, on water. Sleet hisses.
- **The steps**: new CC0 sets (plan 63's way: Freesound, checked by ear, in the last phase): grass,
  earth, gravel, mud, puddle, wet asphalt. Today's snow sets are used when there's snow.
- **The rest by the weather**: birds on clear warm days (morning loud, crows still), the wind
  as today, the river running (not the ice's ticks unless it's frozen), the drips after rain,
  thunder.

### W9 — The cold and the warm

Everything that assumed winter takes `tempAt` or the world's state instead:

- **The breath** only under ~8 °C (both systems, the `view.ts` one gaining the check).
- **The cold body** (`coldOf`) and **the warmth's drain** by the temperature (and wet), not only
  the night.
- **The cars**: the dash's temperature is the world's, the ICE lamp only near freezing, the cold
  start by the temperature, the screen's snow only when it's snowing (no baseline), mist on the
  screen in fog or when it's cold and wet, the salt and slush rings by `snow` and `wet`.
- **The plough**: out when snow lies on the roads, not only in a storm.
- **The falling snow** only when it's snowing. The near and far flake layers by `fall`.
- **Pets**: scared in thunder too.
- **The danger**: a storm's danger stays the storm's.

### W10 — Admins and the phone

- **The World panel's "The weather" card** (in place of today's Storm card): Clear, Cloudy, Rain,
  Snow, Storm (a blizzard or a downpour, by the temperature), Thunder if it's in, and As
  scheduled. It says what's coming down, the temperature, who called it and for how long, as
  the fog's card does.
- **"On the ground"**: the snow, the wet and the ice now, with **Melt it** (to 0 over ~2 min),
  **Snow it in** (to 1 over ~2 min) and **As the weather has it**. Gradual, as the fog's call is
  (the user's call in plan 64). These are also how phase 0 and the tests set the world up.
- **The console**: `weather clear|cloudy|rain|snow|storm|auto`, `ground snow|melt|auto`.
- **The log**: a `weather` kind (shared `LOG_KINDS` and the API's list), only when it changes.
- **All of it admin only** (plan 48), offline too. (Today's `mod:storm` is open to anyone offline.
  It goes with the card.)
- **The phone's forecast** (the user's call: in): the schedule is a function of the clock, so the
  phone can show the next days truly.

### W11 — The state

- **A child schema `Weather`** on `WorldState` (one field: 58 of 64), with its own room for: the
  sky's kind, `fall`, `temp`, `snow`, `wet`, `puddles`, `ice`, and the call (`by`, `to`,
  `until`). `storm`, `wind` and the fog stay where they are, so nothing that reads them changes.
- **The server's tick** (each second, as the storm's): the schedule or the call, W2's steps,
  `storm` only from a storm window when it's coming down (a front's gusts), the fog blown away by
  a storm as now.

## Risks

- **Every outdoor shader changes.** One mistake shows on the whole world, or recompiles every
  material mid-game (a hitch of seconds). The layer's text and uniforms go in before the first
  material compiles (as the fog's), and every program is keyed by what it adds. `patchOutdoors`
  must chain, not replace. The phases each check against stills.
- **Merged snow can't be found again by colour.** The tags have to go in where the snow is made.
  `snow3d.ts` covers most of it; every `color(SNOW)`, `0xf4f7fa`, `0xf2f5f8`, `0xf6f8fa` and
  `tinted(…, white)` in the inventory is checked by hand. A piece missed stays white on a green
  day. Phase 3's check is a still at `snow` 0 hunting for any white left, and one at `snow` 1 that
  has to match today.
- **The physics includes the drawn snow.** `ROOF_SNOW` and the "+ its snow" boxes
  (`shared/shapes/grounds.ts:215`) make roofs and walls their snowy height. On a green day those
  are a few cm too tall. Keep them (you stand a little in the snow; on a green roof a few cm
  over it), or take the bare heights. Phase 3 measures.
- **The night on green.** The dark (plan 44) was tuned on white snow. Grass under the same light
  is near black. The user's call (2026-11-01): leave it — a black night on green is fine; the
  dark isn't retuned.
- **The water changes the map's rules.** The pond and the river are walked today (and e2e uses
  the river; teleports to it are already flaky). Paths that cross them, the pets, the NPCs'
  routes and the cars all need a look. The bridges become the way over.
- **The budgets.** New canvases, leaves, rain and water are code in the Grounds' chunk (11 KB
  free) and the page (5.7 KB free). Watch the traps (`page-budget-traps`): no new value imports
  from the shared index in lazy chunks; the schedule's functions passed in where they must be.
  The user has said the budgets can be raised as this plan needs (2026-11-01); each raise is
  still measured and written down with its reason.
- **Frame time**: the layer is a noise and a few ALU a fragment on everything outdoors; the rain
  one draw plus the splashes; the height map one small draw when you move. Measured on High and
  Medium against today.
- **e2e**: every outdoor still changes. `enter` sets a fixed weather for the specs (clear, no
  snow, as the fog's "clear"), and the specs about snow set snow: `grounds.spec` (deep snow,
  prints), `kart-circuits`, `snow-shots`, `look-shots`, `night.spec`.
- **The schedule and the São Paulo clock**: the user's in São Paulo, so their days are the world's.
  Snow in São Paulo isn't real, but the world isn't São Paulo; only its clock is.

## The phases

### Phase 0 — the mocks

Dev stills, approved before any game code. The stills page (`/dev/grounds?shot=`, dev only)
gets a mock of W3 and W4: the green base patched over the surfaces' colours and canvases, and the
layer in the shader at a set `snow` (no tags yet: the mock's snow shapes are today's, faded by
`snow`). The spots: the lot from the lobby doors, the lawn looking back at the HQ, a woods trail,
the pond, Main Street, and a car close up. Each:
- green (`snow` 0), dry and after rain (`wet` 1, puddles);
- the snow coming in: `snow` 0.1, 0.3, 0.6, 1;
- melting: `snow` 0.5 and 0.2 (islands, the shade last);
- at noon, at dusk and at night (green at night is the risk);
- on High and Medium.
**The look, the speeds and the shares agreed here.** (No sounds here: they are all the last
phase's.)

Rendered 2026-11-01: `design/screens/weather/` (a contact sheet per spot, `sheet-*.png`, and
`sheet-medium.png`; the stills themselves left out of the repo, as the fog's — `weather-shots.mts`
makes them again), from `apps/client/e2e/weather-shots.mts`. In-game stills as Ana, the mock
patched into the live 3D view's materials from the test, so **no game code changed** (the fog's
way, plan 64). The mock:
- **The green**: each lit outdoor material gets a block before its light. The land's own colour
  says its surface (its snow and deep snow are cold whites, a trail's warm and pale), so the snow
  is drawn as grass in three greens by a world noise, drier on the slopes and by the ways, and as
  the woods' floor (needles and moss) by the trees. A map of the trees' density (spread 6 m),
  the slope and the ways near each spot is worked out in Node from `shared/grounds` and handed
  over as a texture. The trails are earth and gravel, the pavements bare, the roads plain asphalt
  (theirs has the winter's salt painted in), the slush strips, tracks and prints hidden. The birches
  and the bare trees get faceted crowns on their own pools' matrices. The woods' floor's upward
  faces (painted snow) get their own colours back. The far ridges are dark green hills, the pond
  and the river water, the ground's bounce green-grey, and a clear day's sky blue with its fog
  further out.
- **The snow**: one layer by how much a face looks up, a world noise and the place (the ways
  last, under the trees later coming and last going), today's snow colours and texture. Coming
  in, it starts as specks on the grass's light blades and a veil, thickening; going, it leaves
  islands a few metres across. On the trees only the tops of the needles frost. A car frosts
  evenly first. Today's snow shapes (no tags yet) are found by their cold white and shown only
  once it's deep (60%+); on the campus, whose stand-in blocks are wholly "roof under snow", they
  turn concrete grey instead.
- **The rain**: the wet darkens by the surface (earth and asphalt most), a sheen and puddles
  with the sky in them, streaks round the camera.

The spots: the lot from the lobby's doors, the lawn looking back at the HQ, the South woods
trail, the pond's shore, Main Street, and a police car parked on Main. Each green, in the rain,
snow coming in at 10 / 30 / 60 / 100%, and melting at 50 / 20%, at noon; green, rain, 30% and
100% at 19:15 and 22:00 too; on Medium at noon.

What they showed:
- **The green works in the look.** Flat faces and the ink hold up; the grass's three greens,
  the dry verges and the woods' floor read; the HQ's glass stands out more against it than
  against snow.
- **Full snow is today's world**, from today's own colours and texture: the lot, the lawn, the
  banks, the pines' caps, the cars.
- **Coming in, it reads in order**: specks on the grass and frost on the car roofs first (10%),
  the lawn patchy and the car white with the road still black (30%), white with the green showing
  through (60%). The paths and the roads stay dark longest.
- **Going, it leaves islands**: half the lawn green at 50%, a few patches and the ploughs' banks
  and the trail's berms still there at 20%; the old snow greyer.
- **The rain** is a darker world: the trail's earth dark, the asphalt with puddles and the sky in
  them, the streaks grey in the light.
- **The night on green is near black** (the risk): the lawn and the woods at 22:00 show only
  what the lamps light, where the snow used to show the land. The user's call: it stays so, the
  dark isn't retuned.
- **Medium** looks as High does, a little flatter (no bloom): it needs no fallback of its own.
- **The first snow, reworked** (the user asked for more quality, 2026-11-01): the first pass came
  in as sharp-edged blotches ~15 cm across, alike everywhere: a camouflage at 30%. Now it's a
  powder: a fine grain at two scales (~9 and ~4 cm) weighted most by the grass texture's own
  strokes (its dark strokes show through last), edges soft and as wide as a pixel's change
  (`fwidth`, taken outside the branches) so far off it averages to a pale veil and never
  shimmers, a pale frost over the green before it closes, and broad drifts (~20 m) so whole
  stretches are whiter or greener. At 10% a powdering, at 30% white with the green through in
  stretches, at 60% white with the blades poking through. Phase 5 takes this rule, not the old.
- **Found, for the real work:**
  - The campus's stand-in blocks are white boxes ("roof under snow" on every face): they need
    walls (phase 4).
  - The HQ's façade has snow painted on every ledge, and the lot's paint has it in its corners;
    the roads' asphalt has the winter's salt painted in, and the lot's cover its wet patches
    always on. All four are textures to redo (phase 4).
  - The roads' packed snow is laid by a broad noise even with no snow at all (`roadCover`'s
    `big`): it has to go with the snow.
  - The gutter slush, the spray strips and the packed verges are their own colours, not white:
    they need tagging with the snow (phase 3).
  - The tyre tracks fade to a snow colour, so on a green road they're dark bands: on snow only.
  - At full snow the trail shows bare earth in specks where today it's packed snow (phase 5's
    footing: a trail under snow is packed snow).
- **Not in the stills:** the shapes growing (no tags yet: phase 3), the splashes, the drips, the
  windscreen (phase 6), the water's ice coming and going (phase 7).

### Phase 1 — the schedule

`shared/weather.ts`: `warmth`, `wet`, `tempAt`, `skyAt`, the storm windows as a front's gusts,
`groundAt` (the replay), the step rule for the four ground numbers. Tests: the shares over
10,000 days, spells lasting (snowy days in a row), rain turning to snow as it cools, the
temperature's day, snow building and melting at the agreed speeds, the replay agreeing with
stepping, the same in any time zone.

**Built 2026-11-01** (`packages/shared/src/weather.ts`; nothing reads it yet, phase 2 wires it):
- **The two curves**: `warmthAt` (a smooth noise over the hours: spells of ~2 days, turning within
  ~11 h) and `wetAt` (~22 h and ~5 h), quintic-eased random heights seeded by fixed numbers, so
  any moment's sky is the same for the server and every client with no state. The front's air
  runs from −9.5 °C to +16.5 °C; `tempAt` adds São Paulo's hour (coldest 6:00, warmest 15:00,
  a cosine each way: ±4 °C clear, ±1.6 under cloud).
- **`skyAt(ms)`** → `{ kind, fall, temp, cloud, storm, thunder }`. Clouds over `WET_CLOUD` 0.4,
  coming down over `WET_FALL` 0.55; snow under +0.5 °C, sleet to +2, rain over. `fall` eases in
  over ~half an hour (never a jump). `storm` is `stormAt`'s window only while it's coming down (a
  front's gust: a blizzard or a downpour); `thunder` a storm window in rain over ~7–11 °C.
  `stormAt` itself is unchanged, so today's world still runs on it until phase 2.
- **Measured over 10,000 days** (hourly): clear 35%, cloudy 23%, rain 25%, sleet 4%, snowing 13%
  of the hours. **Snowy days (3 h of snow or more): 27.5%, one day in four**, the user's measure.
  (The decisions' "20% snow" was the time share I'd proposed; held to the days it's 13% of the
  hours, since a snowy day isn't snowing all day.) Spells: after a snowy day the next is snowy
  48% of the time (27.5% any day), snowy spells ~1.9 days on average, hundreds of dry spells of
  3+ days. Rain turns to snow through sleet within a front hundreds of times. Snow lying (over 5%)
  28% of the time, white (over 80%) 18%; the pond frozen 23%.
- **The ground**: `stepGround(g, sky, hour, dt)` is the one rule; `groundAt(ms)` replays it from
  bare four days back in 10-minute steps (0.07 ms). Measured: white in 2.5 h of steady snow
  (fall 0.8, −3 °C), 44 min in a blizzard, slower near 0 °C; melted in 7.9 h at +5 °C grey, 5.3 h
  in the sun, 13 h at +3, faster in rain, never below 0; a thaw keeps the ground wet (0.7) and
  runs off into puddles (to 0.5); soaked in 34 min of rain, puddles full in 1.4 h, dry in 2.8 h
  grey or 1.1 h sunny, puddles gone in 3.3 h; the water frozen in 5.9 h at −4 °C, thawed in
  4.0 h at +4, nothing between −2 and +2. Stepping every 10 s from a day before agrees with the
  replay within 0.05.
- **Tests** (`weather.test.ts`, 8 new): the shares, the spells, no jumps minute to minute (and
  rain never straight to snow), the turns, storms and thunder, the air's day, the speeds, the
  replay and its cost, any time zone. All 493 shared tests pass.

### Phase 2 — the server and the admins

The `Weather` child schema; the tick; `mod:weather` and `mod:ground` (admin only, logged on a
change); the saved state in the world's settings (the API's `PUT /internal/world/weather`,
returned with the world); the World panel's two cards, the console and the log. The server's
consumers: the plough by the snow on the roads, the warmth by the temperature, pets in thunder.
`e2e/helpers.ts` sets the specs' weather. Tests: the room (a member refused, a call and its
expiry, snow lying after a call and melting by the rule, a restart keeping it), the API's
endpoint (Pest only with the user's say: the dev database).

**Built 2026-11-01:**
- **The state**: `Weather` on `WorldState` (58 of 64 fields): `kind`, `fall`, `temp`, `cloud`,
  `thunder`, `snow`, `wet`, `puddles`, `ice`; the sky's call (`to`, `by`, `until`) and the
  ground's (`groundTo`, `groundBy`).
- **The tick** (`WorldRoom.weatherTick`, each second): the sky from `skyAt` or `calledSky`, its
  fall, cloud and air eased (0.02, 0.02, 0.05 °C a second); `storm` is now the sky's (a storm
  window only while it's coming down) unless `mod:storm` overrides; `thunder` from the eased storm
  in warm rain; the ground by `stepGround` from where it is, with the room's hour.
- **The calls**: `mod:weather` (clear, cloudy, rain, snow, storm, or null for the schedule; an
  hour, `WEATHER_CALL_MS`) and `mod:ground` (snow: snow and the water's ice to 1; melt: both to 0,
  the ground wet with it; null: back to the replay's), carried there over two minutes
  (`GROUND_CALL_MS`, smoothstep), the rule running on after. Admins only, offline too; a `weather`
  log kind (shared and the API's). `mod:storm` stays as it was (a storm alone, open offline):
  twenty-odd tests and specs use it, and the console keeps `storm`.
- **Saved** in the world's settings (`PUT /api/internal/world/weather`, returned with the world as
  `weather`): every 3 minutes, after a call and on dispose. At the start, `weatherFrom` brings the
  saved ground up to now by the rule under the schedule's sky (over four days apart, or nothing
  sound saved, the replay) and restores a call still running. Checked live: the dev world saved
  `{snow, wet, puddles, ice, at, call}` after Ana's calls.
- **The panel** (World): "The weather" in place of the Storm card (Clear, Cloudy, Rain, Snow,
  Storm, As scheduled; who called it and the minutes left; "Now: snow steady, −2.0 °C" with a
  storm and thunder said) and "On the ground" (snow, wet, puddles, the water's ice in %; Snow it
  in, Melt it, As the weather has it; who's doing it). The console: `weather …` and `ground …`.
- **The consumers**: the plough comes out to snow on the roads (snowing with more than 15% lying,
  and the fall or a snowstorm over 0.45 — never to a downpour); the ploughed cells by snow coming
  down, not any storm; the warmth's drain by the air (`chillOf`: 1 at freezing, so the night's as
  it was there; none by +12 °C; a bitter day bites at up to half the night's; rain on you colder);
  pets scared in thunder too.
- **e2e**: `helpers.ts` calls a grey sky with the snow lying (the specs' shots' world) for an hour.
- **Tests**: the room's (`weather.test.ts`: the start the schedule's; a member refused both; the
  calls for an hour, a snow cold, a rain warm, a storm wild, a bad call ignored, back to the
  schedule; snowed in at once then melting by the rule under rain; melting over two minutes; the
  replay's back), the plough's (comes out to a snowstorm with snow lying, not to a downpour), the
  shared ones (the calls, a restart keeping it, the chill, warmth by the air). The API's Pest test
  is written (`WorldTest.php`: kept, read back, bounds, the call's kinds, the steps beside it) and
  run 2026-11-02 with the user's say: `WorldTest.php` 23/23 (491 assertions), on `phpunit.xml`'s
  in-memory sqlite — the dev database's users, objects and admin log counted the same after.
- **Not yet in the game**: the client draws today's white world whatever the weather (phase 3 on);
  only the storm (now from the weather) and the plough show a change.

### Phase 3 — the snow as a layer (on today's white world)

The tags (`snow3d.ts`, `G`, every piece in the inventory), the press in the shader, the dusting,
the shared `wxSnow`, `patchOutdoors` chained, the trees' and the cars' shaders, the shadows, the
height map. **Still on today's white base**: at `snow` 1 the stills must match today's, and at
`snow` 0 every snow shape must be gone (the white that's left is the base, done in phase 4). The
roads' `roadSnow` folds into `wxSnow`.

Built 2026-11-02:
- **One module, `tp/wx3d.ts`.** The uniforms every shader shares (`wxSnow`, `wxMelt`, the Grounds'
  origin for the noise, the land's snow picture for its grain, the nearest roofs), the press, the
  dusting, the shadow pass's material, the view's easing (`WxEase`), and a tag-aware
  `mergeGeometries` that the outdoor files import in place of three's.
- **The tags.** A vertex attribute `wxTag` = (how far it's pressed down, −the snow it comes in at).
  A geometry without it reads 0, or a stale 1 left at that location by another program, and is never
  snow: the threshold is stored negated.
  - Two kinds of piece. One that comes in all at once (a roof's slab, a cap, a pine's cone, a
    mound) is pressed onto what it lies on and taken out of the clip under 2% grown, with no
    discard, so the outdoor shaders keep their early z.
  - One whose vertices come in at their own snow (the drifts, the banks, the verges, the fence's
    foot) has `BURIED` added to its threshold. It is pressed under the ground and never clipped, so
    no triangle is left half thrown out.
  - Where the tags are set: `G.snow(at, drop)`, `tinted(g, hex, at)`, `tagged(g, at, drop)`.
    - Every helper in `snow3d.ts` (`ridge`, `driftAlong`, `bankAlong`, `slopeSnow`, `flatSnow`,
      `icicles`, and a new `snowBox`).
    - By hand: ~30 sites in `grounds3d.ts`, the campus (the plant's caps, the lot's banks, the
      gatehouse, the canopy, the lamps' heads), the roads (the windrows, the bays, the heaps, the
      verges' and the buildings' painted strips, the poles' caps), the lot, the spots, the
      landmarks' chords, the town's furniture (by colour, in one wrapper), and the pine's cones
      (each pressed onto its tier's slope).
    - Instanced pieces (the trees' mounds) each get their own threshold from where they stand.
- **The kinds' ranges.**
  - caps 0.30–0.55, roofs 0.35–0.60, cones 0.35–0.62, banks 0.42–0.70, drifts 0.45–0.74, mounds
    0.50–0.74, icicles 0.76–0.78.
  - Each piece grows over 0.22 of snow, so all of it is grown by snow 1.
  - Going, the shapes see 0.28 more than lies: they outlast the dusting.
- **The dusting.** The approved mock's powder and islands (coming and going mixed by `wxMelt`),
  before the light, in `patchGrounds`, in `patchOutdoors` (which now chains the material's own
  hook), in the trees' shader and on the cars' paint (`wearable`).
  - Kinds by `userData.wx`:
    - `land`: the snow surfaces are the snow, so there's no dusting there till phase 4. Its ways
      get it, its rock gets it, its ice doesn't.
    - `way`: trails, pavements, slabs and the plaza. Their threshold is +0.55, so they stay
      patchy at snow 1, as the mock's were.
    - `tree`, `car`.
    - `none`: the roads (their own rules), the pond's ice (phase 7), the campus's snowfield, the
      people's snow, the Kart Park (its tarmac dusted read as the snow beside it; phase 4), and
      anything see-through.
  - Under a roof stays dry: the eight nearest buildings' boxes, to their eaves, as uniforms, on
    every quality. This replaces the plan's height map: the boxes are exact for the few roofs
    there are.
- **The roads.** The packed snow and the slush (the road's, the paint's and the lot's cover) are
  only as deep as the snow lying (`smoothstep(0.1, 0.75, wxSnow)`). Their fresh snow is how hard
  it's snowing, and never more than lies.
- **Cars.** Their own snow meshes are pressed by scale onto what they sit on, each car in at its
  own. Once blown off they stay off. The far cars' `flatSnow` is tagged.
- **Shadows.** Every mesh with snow in it (the Grounds' `add`, the campus's, the tree pools) casts
  through `wxDepth()`, a depth material with the same press.
- **The room's weather in the view.**
  - The controller hands the view `weather.snow` and how hard it's snowing. `WxEase` sets it at
    once the first time, then eases it.
  - `wxMelt` turns to "going" when the snow's fallen over half a minute, over two minutes.
  - The near and far flakes, the windscreen's snow and the snow on people's shoulders come only
    while it snows. Two flake layers were always on.
- **Stills** (`e2e/snow-layer-shots.mts`, `design/screens/snow-layer/`).
  - Phase 0's six spots at snow 0, 15, 30, 60, 100, melt 50 and melt 20 at noon, and at 22:00 for
    0 and 100.
  - Four more where the hand-made snow is (the barn, the church, the water tower, the statue) at
    0, 30, 60 and 100.
  - Snow 1 matches today's, but for what the approved mock added: the cars' paint and the trails
    dusted in patches.
  - Snow 0 leaves no snow shape: the trees' cones and mounds, the banks, the windrows, the bays,
    the verges, the caps, the lot's heaps and the canopies are all gone.
  - The white left is the base: the land, the woods' painted tops, the plaza's snowy slabs, the
    birches. All of that is phase 4's.
- **Frame time** (the whole frame stepped, the GPU waited on, 120 frames, median, ms):

  | | snow 0 | 0.6 | 1 | plan 64's clear |
  |---|---|---|---|---|
  | High, lot | 9.8 | 9.7 | 9.6 | 10.7 / 9.8 |
  | High, lawn | 9.1 | 9.4 | 8.9 | 7.2 / 6.2 |
  | Medium, lot | 8.9 | 8.8 | 8.9 | 9.4 / 9.3 |
  | Medium, lawn | 7.4 | 7.3 | 7.4 | 5.8 / 5.8 |

  The amount of snow costs nothing. The lawn is ~2 ms dearer than plan 64's: the dusting's noise
  over a whole screen of ground. It's still well inside 16 ms.
- **Budgets.** The page is 424.8 of 430 KB (HEAD 424.3). The Grounds' chunk is 186.2 of 187 (HEAD
  176.1: the layer and the schedule from phase 1). `yutopia-input` went 14.99 → 15.04 with none of
  this in it (the minifier's names), so its budget is 15.5. Phase 4 will need the Grounds' raised.
- **Unit tests.** `wx3d.test.ts`: the growth, the thresholds, the builder's and tinted's tags, the
  drift buried and the slab on its slope, the merge, the shaders, the easing (a call made now taken
  at once). Client 162 of 162.
- **e2e.**
  - Passing: `fog.spec`, `kart-circuits` (once the Kart Park was kept out of the dusting:
    "snow where the Figure Eight was" read 122 against the dusted Oval's 124; now 125 against 51),
    and `grounds.spec`'s High one.
  - Red: `grounds.spec`'s four `walkTo` ones, on the known list since 10-28.
- **Left for later.**
  - The ground floor's open tiles (the lot's asphalt and the pavements by the lobby) aren't
    Grounds materials, so they aren't dusted. The mock dusted them; phase 5.
  - The Kart Park keeps its own snow materials: W3 has it follow the weather in phase 4.
  - The car's snow since it last moved, the icicles after a thaw, and the plough's banks by its
    work are phase 5's.
- **The physics, measured.** The roofs' boxes are their snowy height: 0.20–0.34 m over the bare
  roof (`ROOF_SNOW` 0.2, the "+ its snow" boxes 0.22–0.34). The small things are 0.07–0.26 m over
  (the mailbox, the canopies). On a green roof you'd stand that far above it. **The user's call.**

### Phase 4 — the green

W3: the surfaces' colours, the new canvases, the leaves, the woods' floor, the façade, the
roads without their packed snow, the bounce and the sky's palettes (the night left as it
falls: the user's call). The redos phase 0 found, agreed with the user (2026-11-01): the campus's
stand-in blocks get walls, and the HQ façade's ledges, the lot's paint, the roads' asphalt and the
lot's cover are repainted without their winter. Stills
against phase 0's at every spot and hour.

Built 2026-11-02:
- **The physics at the bare heights** (the user's call on phase 3's measure: "sink a little, it's
  realistic"). `ROOF_SNOW` is 0. The "+ its snow" boxes, the canopy, the marquee, the mailbox, the
  statue and the hall's pediment stand at what's under their snow. `solids`' fingerprint moved;
  the roof tests are to the bare slopes.
- **The green**, in the layer's shader (`wx3d.ts`), the approved mock's:
  - The land (`WX_LAND`). Where its colour was the snow's (the snow and the deep snow) it's grass,
    by weight so a triangle between the grass and a path blends:
    - three greens by a world noise;
    - drier on the slopes (from the normal) and near the ways;
    - the woods' floor (needles and moss) under the trees.
  - The land carries a vertex attribute, `wxLand` (woods, a way near), made per block by
    `landAround`: the deep snow's spread ~6 m, and a chamfer distance to the hard surfaces.
  - The grass's detail is a grey canvas (`grassTexture`). The land keeps its own snow picture for
    the snow over it, so snow 1 is today's.
  - A path on the land is earth and gravel. The ice is untouched (phase 7).
  - The campus's open ground is the same grass (`WX_FIELD`).
- **The canvases without their winter.**
  - The trail: packed earth, gravel, two ruts.
  - The pavement and the slabs without their dusting or trodden snow.
  - The campus road's verges are a gravel shoulder; its slush is worn patches.
  - The lot's paint (the Grounds' and the campus's) without the snow in its corners, its patches
    toned down.
  - The asphalt's parking lanes without their salt band.
- **The rest of the painted-in winter, now the weather's.**
  - The HQ façade's ledge snow is its own mask, whitening as the snow lies (`ledgeShader`, both
    hooks).
  - The parapets' caps are stone.
  - The roads' salt and dark patches only with snow.
  - The streets' gutter slush is tagged (under the road when there's none).
  - The tyre tracks and the entrance's trodden snow show only in snow.
  - The plaza's snowy flags are a paler stone.
  - The campus conifers' snow is tagged.
- **The trees in leaf**: the birches, two of the three bare trees (one stays a snag), the far ones
  and the campus's. Each crown is faceted, in clumps, merged into the tree's geometry, so the
  instances' tints and the wind's sway are its (`crowned`). The woods' floor (shrubs, logs,
  stones, boulders) has its own tops back; the stump's cap and the log's snow are tagged.
- **The far ridges** are dark green hills without snow, snowy as it lies.
- **The light and the sky by the weather.**
  - The ground's bounce goes green-grey → today's cold blue with the snow lying.
  - A clear day's sky is bluer, its overcast thin, its fog further out (210–1150).
  - Rain's sky is low and grey, its fog closer (40–420).
  - A snowy or overcast day is today's.
  - Eased over ~20 s, or at once on an admin's call.
  - The night is left as it falls (the user's call): black on green.
- **The Kart Park follows the weather** (the user's call).
  - Its snow is tagged: the batch's snow pieces, the stands' cap, the track's snow walls (buried,
    per stretch).
  - Its jumps are packed earth. Its track and kerbs are kept clear of the dusting.
  - The rest takes the dusting.
- **Not done here.**
  - The campus's stand-in blocks: in the game the campus is walkable and the Grounds' own blocks
    stand there, so they're never drawn.
  - The reeds and mud at the water's edges (phase 7). No new ferns or bracken (the shrubs are as
    they were, green).
  - The farm's crops as they are.
- **Stills** (`design/screens/snow-layer/`, sheets).
  - Every spot green on a clear day, then grey, snow coming in at 15/30/60/100, melting at 50/20,
    and 22:00.
  - The Kart Park at 0/30/100.
  - They read as phase 0's mock did: the powder over the green, white at 1, islands going.
- **Frame time** (as phase 3's, ms):

  | | snow 0 | 0.6 | 1 |
  |---|---|---|---|
  | High, lot | 9.7 | 9.5 | 9.9 |
  | High, lawn | 8.4 | 8.3 | 8.8 |
  | Medium, lot | 8.9 | 9.0 | 8.7 |
  | Medium, lawn | 7.4 | 7.2 | 7.3 |

  The green costs nothing over phase 3's numbers; the lawn's a little cheaper.
- **Budgets.** The page is 424.8 of 430. The Grounds' chunk is 191.1, so its budget is raised to
  195 (the standing call; noted in `tools/budget.mjs`). The karts' chunk is 23.9 of 60.
- **Checks.**
  - Unit: client 162/162, shared 497/497 (the roof tests to the bare heights).
  - World server: 190/192 in the full run, with the fire bench's seat and Vortex's private lines
    red. Both pass on their own (3/3, 51/51): flaky under the full parallel run.
  - e2e: `kart-circuits` (snow 148 against the road's 58) and the Grounds on High pass;
    `fog.spec` skips itself.

### Phase 5 — the in-between

The look of the snow coming and going: the thresholds by place (the ways, under trees, the
shade, the drifts), the car's snow since it moved, slush and the wet as it melts, icicles after a
thaw, the plough by the snow lying. W5's footing, grip and prints. W9's cold. Stills of a whole
snow day, then a whole thaw, run fast.

Built 2026-11-02:
- **The thresholds by place.**
  - Coming in: the ways last, as before (+0.55; a woodland trail +0.35), and later under the trees.
  - Going: the ways soonest; the woods' shade and now the drifts' places (where it drifted deepest
    coming in) last.
  - The shade by the sun isn't counted: no shadow is known before the light, so the woods stand
    for it.
- **The ground floor's open tiles take the layer** (the lot's asphalt, the pavements by the
  doors). The floor's light patch gives it as a trodden way, gated by the light map's open sky, so
  indoors takes none.
- **A car's snow since it last moved** (`LiveView.snowK`). A car first seen has the world's.
  - Driving sheds it: most of it in a minute at speed, and all of it at once when it's blown off
    over 12 m/s.
  - It settles again on a car standing in a fall, never past what lies.
  - It drives the car's own shapes and its paint's frost (`setSnow` → `wxCarSnow`, per car).
  - Once blown off, the snow can now come back; before, it never did.
- **The icicles hang only when it's freezing after a thaw**: snow lying (> 0.4) with its meltwater
  about (wet > 0.2) under −0.5 °C. They grow over half an hour and drip away above +1 °C
  (`wxIcicle`, the shader's cap on the icicle range).
- **The wet as it melts.** Whatever isn't under snow darkens with the room's wet, by how much it
  soaks up: earth and grass most, the ways, things, the trees, a car's paint hardly. The roads'
  slush thickens all over while the snow goes. The sheen and the puddles are phase 6's.
- **W5, the footing by the weather.**
  - One state in the shared Grounds, `setUnderfoot` (snow, wet, freezing), set by the client
    each frame and by the server each second from the room's.
  - The land, by `weatheredFooting`, with each place's own ±0.1 (`placeShift`, a broad noise as
    the drawn drifts):
    - open ground: grass under 0.3 of snow (mud soaked), snow over it;
    - the woods' floor: earth under 0.35 (mud soaked), deep snow over it;
    - a trail: earth under 0.4 (mud soaked), packed snow over it;
    - a pavement: concrete till 0.85.
  - The roads: slush and black ice only with snow about, black ice only freezing; wet asphalt in
    the wet.
  - The tops of things: snow on them when it lies, else a roof's sheet or a building's concrete.
  - New footings: grass, mud and wet. They borrow earth's, slush's and asphalt's recordings till
    phase 9 picks their own; the synth, the bands and the jumps' soles have their numbers.
  - The pace (`speedOn`): deep snow 0.6 with it lying, 1 bare; mud 0.92.
  - The cars: new grounds grass, earth, mud and wet in `GRIP` and every foot's table (`groundAt`
    by the weather).
  - The karts: off the track it's grass or mud on a green day (new `KartGround`s), deep snow
    when it lies.
  - Footprints only where the footing's snow.
- **W9, the cold.**
  - A breath shows only under 8 °C, in both systems (`Person3D.airCold`, the view's own puffs).
  - The dash reads the air (`wxNow.temp`); its ICE lamp is lit at 3 °C and under.
  - Already from phase 2: the warmth's drain and so the cold body by the air, the plough by the
    snow lying while it snows, the falling snow and the windscreen by the fall, the pets in
    thunder.
  - Not done: the cold start and the screen's mist by cold and wet (phase 6, with the wipers).
- **Stills, a whole snow day and thaw** (`DAY=1`: the shared `stepGround` run here — 4 h of snow
  at −3 °C, 2 cold and clear, 10 of thaw at +6 in the sun; the lawn, the street, the trail).
  - Snow 0.40 at 1 h (a heavy powder), 0.80 at 2 h, white by 3 h.
  - The thaw: 0.79 at 1 h, 0.58 at 2 h (islands), 0.16 at 4 h, gone by 5 h, the wet 0.7 throughout,
    dry by 6 h. (+6 °C in the sun: the quick end of the agreed 6–10 h.)
- **Frame time** (ms, as phases 3–4):

  | | snow 0 | 0.6 | 1 |
  |---|---|---|---|
  | High, lot | 9.6 | 9.2 | 9.3 |
  | High, lawn | 8.4 | 8.2 | 8.3 |
  | Medium, lot | 8.7 | 8.1 | 8.2 |
  | Medium, lawn | 7.0 | 7.2 | 7.0 |

- **Budgets.**
  - The page is 424.9. The karts' chunk is 23.9; the chars' is 58.0.
  - The Grounds' chunk is 203.2, so its budget is now 210. `light3d.ts` (and with it `wx3d.ts`
    and three's BufferGeometryUtils) is copied into three of the 3D view's chunks, so all of the
    layer counts thrice. A split to fix, apart from this plan. Fixed the same day: the cars' chunk
    now loads through the game's view (`tp/game-view.ts`), so it uses the view's light3d and wx3d
    and doesn't carry its own. The Grounds' chunk is 173.1, its budget 176; the page 424.6.
  - Fixed the same day: the cars' chunk was loaded from the page beside the view and carried its
    own copy; now loaded through the game's view (`tp/game-view.ts`), it shares the view's. The
    Grounds' chunk is 173.1 (budget 176), every chunk together −20 KB, the page 424.6.
- **Checks.**
  - Unit: client 163/163 (the icicles), shared 498/498 (the footing's own test; the census on a
    green and a soaked day), world server 192/192.
  - e2e: `kart-circuits` (152 against 59) and the Grounds on High pass.
- **Not done here.**
  - The kart track's edge stays a wall where its snow banks are drawn, invisible on a green day.
  - The plough's banks by its own work.

### Phase 6 — the rain

W7: the streaks, the splashes, the wet and the sheen, the puddles, the drips, the windscreen and
the wipers, thunder (if it's in). Stills in the rain at noon and at night under the lamps.

Built 2026-11-02:
- **The rain** (`tp/rain3d.ts`, made the first time it rains, in the sky's root).
  - Streaks: 9000 thin quads (4000 on Lowest), each a seed, wrapped in a 34 × 22 × 34 m box round
    the camera in the vertex shader, along the fall and the wind. No work on the CPU a frame.
  - Fewer in a light rain (the first of them by their seed), short and wider in a sleet. None
    under the roofs the layer knows. Faded near the camera and far off.
  - Coloured by the sky low down and the land's light: dim at night.
  - Splashes: up to 260 small rings on the ground round the camera (the Grounds' height), none
    under a roof, a third of a second each.
  - Drips: short streaks falling from the nearest roofs' eaves while it rains and for ten minutes
    after, as the wet lasts.
- **The wet, the sheen and the puddles** in the layer's shader (`wx3d.ts`).
  - The wet darkens by how much a surface soaks up.
  - The hard and smooth take a soft sheen, the sky's colour towards a grazing look.
  - Puddles by the room's `puddles` on what's flat (the roads, the lot, the ways, the trails), in
    a world noise: dark water with the sky faint in it, and rings in them while it rains.
  - A road kind (`WX_ROAD`): the roads, their paint and the kart track keep their own snow but
    take the wet. They no longer declare the layer's uniforms themselves.
  - Toned down after the first stills (the puddles were pale blotches like snow, the rings
    large).
- **Lightning in a thunderstorm** (`strikeIn`). By the clock, in 7 s slots, the same strikes for
  everyone: a quarter of the slots to three in four, by the room's `thunder`. A double flicker of
  a fifth of a second lights the land's light and the sky's top and middle. The thunder itself is
  phase 9's.
- **The windscreen**: rain's beads (`windscreenRain`: beads with a dark rim and a highlight,
  trails running down, the wipers' fans wiped). They gather as it rains (faster at speed), are
  wiped to a few by the wipers, dry in four minutes after, and show while there's more rain than
  snow. The wipers come on by themselves in rain as in a storm. A storm's snow on the screen only
  while it snows.
- **Wet people**: each viewer keeps how wet each person is: soaked over ~3 minutes out in it,
  dried in 4 under cover or indoors, slowly out in the open after. It darkens their outdoor tint
  (clothes and hair) by up to a third.
- **The room's weather in the view**: `setGround` takes one object (snow, falling, cloud, rain,
  sleet, wet, puddles, temp, thunder). The stills hold the wet and the puddles too.
- **Stills**: `rain` (a downpour, soaked, puddles), `drizzle`, `after` (the morning after: wet
  and puddles, no rain) at the lot, Main Street, the car, the trail and the lawn, at noon, and the
  downpour at 22:00.
- **Frame time** (ms, as before): rain costs nothing measurable.

  | | dry | snow 1 | rain |
  |---|---|---|---|
  | High, lot | 9.3 | 9.0 | 9.6 |
  | High, Main St | 7.5 | 7.5 | 7.3 |
  | Medium, lot | 9.1 | 8.8 | 9.0 |
  | Medium, Main St | 7.1 | 7.0 | 7.1 |

- **Budgets**: the page is 424.7, the Grounds' chunk 173.1 of 176, the car's 27.6.
- **Checks**: client 164/164 (the lightning's: the same strike for everyone in a slot, more with
  more thunder).
- **Not done here.**
  - The raincoat's hood going up.
  - A car's roof drumming, the rain's beds, the thunder (all sound: phase 9).
  - The screen misting in cold and wet. The lamps' light in the streaks (they're lit by the sky
    and the land, so at night they're faint).
  - Splashes on cars and on the water (phase 7).

### Phase 7 — the water

W6: the water drawn, the ice coming and going, the shores as walls, the move check on the server,
the paths, NPCs, pets and cars that crossed the ice. Tests: walked when frozen, stopped when not,
on both sides.

Built 2026-11-02:
- **The water drawn**, under the ice: the pond, the river and the ravine's creek.
  - Dark by its depth (the middle deeper), the sky off it at a glancing look, slow ripples, rings
    where the rain falls, a darker band at the shore (`WX_WATER`).
  - The ice (`WX_ICE`, today's look) comes in from the shores as the room's `ice` grows and goes
    from the middle as it falls. Each vertex knows how far it is from its shore (`wxSide`: the
    pond's by its ellipse; a ribbon's signed across it, so its middle comes out between).
  - The land under the water and at its edge is wet mud (it was ice-coloured, and showed past the
    water's edge).
  - The view eases the ice as it does the wet.
- **Walked** (`ICE_WALK` 0.8).
  - Open water's shores are walls (`waterWalls`): round the pond at its edge, the dock's deck
    fenced on its three sides over the water, both sides of the river's bed at its foot.
  - The walls are low (to 2.2 over the water), so they stay under the bridges' decks and the
    banks' tops; only what goes down to the water is stopped.
  - The physics builder sets them and takes them away as the ice crosses 0.8
    (`WorldBuilder.water`): on the client from the room's weather each refresh, on the server
    each tick. So the server's move check, its bodies and the cars all agree.
  - Over 0.8 it's walked and driven as today.
- **The paths, the pets, the NPCs**: `walkableTile` closes the ice tiles while the water's open
  (the shared `underfoot().ice`, set by both sides), so every path keeps off it.
- **The server's tests**: the schedule's weather today is rain with the water open. The tests'
  spots are on the pond's ice (written in the winter), so 21 timed out. Their world starts snowed
  in and frozen (`YUTOPIA_WEATHER=winter` in the test script); the weather's own test file takes
  the schedule's.
- **Tests** (`physics/water.test.ts`): open, a walker from the north and one from the south are
  stopped at the pond's shore; frozen, both walk out on it. The walls leave the dock's way out
  open. The paths keep off open water and walk over it frozen.
  - Shared 501/501, client 164/164.
  - World server 191/192: the nests' test timed out under the full parallel run (43 s); alone it
    passes, in the winter world too (4/4).
- **Stills**: the pond open on a clear day, freezing in from the shores (ice 0.4), frozen under
  snow, and open in the rain with its rings.
- **Budgets**: the page is 424.7, the Grounds' chunk 173.1 of 176.
- **Not done here.**
  - Thin ice cracking underfoot (a sound: phase 9).
  - The canoe afloat and the reeds at the edge.
  - The pond's sleds an admin sets out stand on the water when it's open (nobody reaches them till
    it freezes).
  - Someone standing on the ice as it opens is inside the walls till it freezes again (it takes
    hours).
  - A car may cross the ice whatever its thickness over 0.8.

### Phase 8 — the checks

Unit tests per phase; e2e as two people (the same weather at the same moment; snow called lying
on the lot for both and melting; rain on, the puddles; the water stops one and the ice carries
her); frame time on High and Medium in each weather against today's; the page and chunk budgets;
the user's pass in the game.

Done 2026-11-02:
- **e2e as two** (`e2e/weather.spec.ts`, GPU: `YUTOPIA_GPU=1`). Ana calls the weather and Bia is
  out in it. Passes:
  - **The same in both views at once.** Snow called lying: both rooms' weather is equal and both
    views' layer is at 1.
  - **The lot white for Bia, then green.** Her view's ground reads 126 white and 75 once melted.
    The melt's two minutes go in both views together, the snow apart by < 0.03.
  - **The rain.** The streaks are round both, and each view's wet and puddles are as the room has
    them.
  - **The water.** Open, Bia walks from beside the pond (1.18 on its ellipse) to the shore and is
    stopped there (1.01). Frozen, she walks out to 0.40.
- **The other e2e touched**:
  - Passing: `fog`, `footing`, `kart-circuits`, `day`, `snow-shots`.
  - Red, all on the known list: `car.spec`'s three (the passenger, knocked, under a flier), and
    `grounds.spec`'s walkTo and town-frames ones.
  - `grounds.spec`'s High one is red at 41–43 fps on the lot (its bar is 55). It isn't the weather:
    - It's the same dry, white and in the rain.
    - Each frame's work there is 7–9 ms. The main thread has no long tasks.
    - The office indoors drops the same frames at first (42 fps, then 58).
    - The machine's browsers had WindowServer at 73–127 % meanwhile.
    - To run again on a quiet machine.
- **Frame time** (as phases 3–7: the whole frame stepped, the GPU waited on, 120 frames, median, ms;
  the machine busy as above, so ~0.5 ms high throughout):

  | | dry | snow 1 | thaw 0.5 | rain | after | water open | frozen |
  |---|---|---|---|---|---|---|---|
  | High, lot | 9.9 | 9.8 | 9.8 | 10.1 | 9.9 | 9.6 | 9.2 |
  | High, lawn | 8.6 | 8.5 | 8.6 | 8.5 | 8.4 | 8.3 | 8.0 |
  | High, Main St | 7.8 | 8.0 | 10.1 | 8.9 | 9.4 | 9.5 | 8.3 |
  | High, pond | 6.4 | 6.2 | 6.4 | 6.6 | 6.3 | 5.5 | 5.6 |
  | Medium, lot | 9.5 | 9.0 | 9.7 | 10.4 | 9.8 | 9.2 | 9.4 |
  | Medium, lawn | 8.1 | 8.7 | 8.1 | 8.2 | 8.5 | 7.9 | 8.2 |
  | Medium, Main St | 7.9 | 7.9 | 7.2 | 7.2 | 7.4 | 7.4 | 7.6 |
  | Medium, pond | 5.4 | 5.6 | 5.7 | 5.5 | 5.4 | 5.2 | 5.6 |

  - No weather costs more than another beyond the noise.
  - Against today's (plan 64's clear, phase 3's table): the lot is the same and the lawn ~2 ms
    dearer (the green's noise over a screen of ground). Every one is well inside 16 ms.
  - `FRAMES=all` in `e2e/snow-layer-shots.mts` times every weather.
- **Budgets**: the page is 424.7 of 430, the Grounds' chunk 173.1 of 176, the car's 27.6, the
  karts' 23.9, the chars' 58.0 of 58, `yutopia-input` 15.0 of 15.5.
- **Unit tests**: shared 501/501, client 164/164, world server 192/192 (in the winter world).
- **The user's pass in the game**: to come.

### Phase 9 — the sound (last)

The user's call (2026-11-01): the sound is rechecked as a whole, and only here, once everything
else is in. W8: the new step sets picked by ear (as plan 63's phase 0) and wired to the new
footings, the rain beds by where you are, sleet, thunder, the drips, birds, the river running and
its ice, the wind by the weather, and today's snow sounds checked against the snow now coming and
going. Then the footing's sound in the e2e, and the user's listening pass.

Built 2026-11-02 (the user listens to it all at the end):
- **The recordings.** All CC0 from Freesound, 41 candidates for 16 sounds (2–3 each), listed in
  `tools/sfx-weather.json`. `tools/sfx-weather.mjs` fetches them (3 s apart) and makes them:
  - **Steps** cut into single steps by onset, each ending before the next starts at the latest:
    grass, mud, a wet way, a puddle.
  - **Beds**, each its steadiest 30 s: rain light and heavy, under the trees, on the roof, on the
    car's roof, on water; sleet, birds, the river, the drips.
  - **Thunder's peals**, near and far.
  - The game plays each sound's first candidate; the thunder plays all of its candidates.
  - `PICK='{…}'` brings each sound down to the one picked. `/dev/weather-sound` plays every
    candidate alone at the game's level, and the game's own mix in twelve scenes. ★ keeps a pick;
    "copy picks" gives the JSON.
  - With every candidate in, the weather's sounds are 8.4 MB and the new steps 420 KB. Each is
    fetched only when it's first heard.
- **The steps.**
  - Grass, mud and wet play their own recordings; only black ice still borrows ice's.
  - On a wet way a step goes into a puddle now and then: 10 % of steps, up to 55 % with the
    puddles full.
  - The lot's asphalt (the ground floor's open tiles) is wet in the rain, as the roads are.
  - Thin ice under a step (the water's ice from 0.8 to 0.95: just frozen, or thawing) creaks now
    and then, and cracks the thinner it is.
- **The beds** (`world/weather-sound.ts`, in the Grounds' sound):
  - **The rain.** Light rain up to about half, the heavy over it, crossfaded. Under the trees the
    leaves' patter, and the open's quieter. Indoors the roof's rain, and the open's at a quarter,
    muffled to 1.6 kHz. In a car its roof's. On open water near the pond and the river (none on
    the ice).
  - **Sleet** in the rain's place, the rain at 0.4.
  - **The drips** once it's stopped and the ground's wet, more under the trees.
  - **The birds** on warm, dry, calm days: loudest round 6:30, none at night, under 4 °C or in
    the rain, hushed in the fog. The crows stay, as before.
  - **The river** runs where its ice is under 0.8. Its ice ticks only when it's frozen.
  - **The wind** is a little stronger on a grey day and in the rain.
  - Each bed is fetched the first time it's wanted, its seam crossfaded as it's decoded, faded by
    the weather and the place, and stopped after 8 s silent.
- **The thunder.**
  - The strike is shared now (`weather.ts` `strikeIn`, and `strikeFar` for its distance), so the
    sky's flash (dimmer the farther) and its thunder are the same for everyone.
  - The thunder comes 0.35–6.9 s after the flash: near ones a crack, far ones a duller rumble. It
    is muffled indoors and in a car.
  - A called-up storm only thunders in the warm, as phase 2 made it (`thunderOf`, over 7–11 °C).
    Today's 5.6 °C storm has none.
- **Today's snow sounds** follow the footing: the snow's crunch and spray only on snow. Some
  tyres had no sound on the new grounds:
  - The cars' tyres now spray on a wet road and in mud.
  - The karts' crunch is now on grass (softer) and mud (low).
- **Checks.**
  - Unit: `weather-sound.test.ts` (the beds by weather and place, the thunder by distance, the
    seam). The lightning's tests moved to shared, with the distance's.
  - Client 169/169, shared 503/503, the world server's weather tests 3/3.
  - e2e, `weather.spec`'s second test (the audio on):
    - Ana's steps are grass on a dry lawn and mud soaked, each from its own recordings. The lawn
      is held dry on the client for the grass, since a thaw leaves it soaked.
    - The downpour's beds round her (heavy 0.80, light 0.14). On the lot, the wet way's steps,
      with the puddles fetched.
    - Indoors the roof at 0.50 and the open's rain at a quarter.
    - The thunder's peals fetched and decoded. The test hands the sound a warm thunderstorm, since
      today is cold.
  - The steps' and the footing's specs pass (5).
- **Budgets.** The page is 425.2 of 430. The Grounds' chunk is 175.3 of 176 (+2.2, the weather's
  sound), so its next change raises the budget. The steps' chunk is 6.9.
- **The user's picks** (2026-11-02, on `/dev/weather-sound`), kept as `pick` in
  `tools/sfx-weather.json`:
  - Steps: grass `b` (drowsyprincess), mud `a` (Nox_Sound), a wet way `c` (sqeeeek), a puddle
    `c` (j1987).
  - Rain: light `b` (Ryding), heavy `a` (jmbphilmes), under the trees `a` (Borgory), the roof
    `c` (mmorgaine), the car `a` (Nox_Sound), open water `a` (Mjeno).
  - Sleet `a` (kvgarlic), birds `c` (Lord_Tarkus), the river `b` (sound368), the drips `a`
    (launemax).
  - Thunder: all six peals, none picked.
  - The rest are gone. The weather's sounds are 3.9 MB, and the in-game sound test passes on
    them.
  - The bench's "copy picks" had left out every row on its first candidate. It now gives every
    row.
- **The user's pass in the game**: to come.

### The quality pass (2026-11-02, before the user's test)

Four reviews in parallel (the server and the shared rules, the layer's shaders, the sky with the
rain and the cars, the sound), each finding checked in the code before it was fixed, and stills of
every weather at the lot, the lawn, the trail, Main Street and the pond looked at.

**Fixed:**
- **Off the dock onto open water.**
  - The dock's fence stood on its landward half, so the half over the water was open on both
    sides and at its end. The ring's gap for it was also wider than the deck.
  - Now its sides run from just inland of the shore to its end, with an end wall across, and the
    ring is cut to the deck's width.
  - Test: walkers off its end and off both sides.
- **The wet and the puddles indoors.**
  - Every lit floor, desk and table darkened and took puddles and rings in the rain. Only the
    snow's dusting had checked the open sky.
  - Now one "open to the sky" test (a floor's tile under the sky, no roof over it) gates both.
    Indoors reads the same dry and soaked: 102.6 against 102.5.
- **Rain inside the HQ.** The roofs that keep the rain off left the HQ out (the camera's own
  boxes skip it). They now always include it.
- **The weather sound frozen in a car**, on the shuttle, in a lift and in god mode. The listening
  sat after `moveLocal`'s early returns, so in a car the car's roof never played. It now runs
  every frame on its own.
- **The lot heard as indoors.** The sound now uses the view's open sky (the land, and the ground
  floor's asphalt and concrete). The roof's rain is full on the top floor and through the windows
  (0.45) below it.
- **The windscreen's rain beads.** The eased snowfall never reaches exactly 0, so the snow path
  cleared the beads every frame. Now whichever there's more of is shown. A car that stood in the
  rain starts with beads on it, and the wipers follow the rain through a drive till they're set
  by hand.
- **The thaw on a trail.** Going, its islands could cover a trodden trail whiter than full snow
  ever did. Now nothing holds more snow going than it had with all of it lying. Old snow has the
  snow's grain, not a flat paint.
- **The far woods white on a grey day.** The ridges skipped the haze, so the far trees in front
  of them came out paler than the hills. The ridges now take the air's haze at 700 m (none on a
  clear day, as before).
- **Hard sun shadows in a downpour.** The rain flattens the light, about half as much as the fog's
  wall does. Grey dry days keep their shadows, as the earlier plans' approved stills had them.
- **Seams on the land at block edges.** Each block worked out its woods and ways alone, so two
  neighbours differed by up to 0.71 at their shared edge. Now it's worked over a margin round the
  block. Test: two blocks agree.
- **Untagged white snow**: the cobra lamp's and the town lamp's caps, the bench's slab, the closed
  road's drift. They're tagged now, so they go with the snow.
- **Shader details.**
  - An integer hash: the float one went regular a few hundred metres out, the town and the karts.
  - The grass and map pictures read outside per-pixel branches (no mip sparkles).
  - The ice offset ahead of the water 2.5 cm under it (it z-fought far off).
  - Thin caps pressed a centimetre into what they sit on.
  - A car's own-snow shader keyed apart from the world's.
  - The façade's ledge mask no longer turned into a PNG on every campus build.
- **The sky.**
  - Its colour now follows the clear and the rain each, not their sum, which stalled as one
    replaced the other.
  - No 30 s of false snow on joining.
  - A late strike (back to a hidden tab, or arriving after it) is neither flashed nor thundered.
  - Medium draws the thinner rain, as W7 says.
  - The splashes and drips are kept in place with nothing allocated per frame. The screen's
    material is re-checked only when the picture comes or goes.
- **The server.**
  - A ground call is saved as where it's going, and the room waits for that save as it closes:
    a call made just before everyone left was lost.
  - "Snowed in" is logged and saved only when it changes the ground (every e2e spec calls it).
  - A sky called "now" no longer finishes a running ground call.
  - The kind stays what's falling till its fall has eased out. Before, "clear" over a downpour's
    fall stopped the rain at once.
  - The strike's hash is the integer one.
  - `ICE_WALK` is one number, in `grounds.ts`.
- **The sound.**
  - The beds are levelled with a look-ahead limiter, not turned down for their loudest tick.
    Sleet came up 13 dB, the trees 5.5, the drips 4.6, the car's roof 3.7. All ten are now within
    0.6 dB of −24, with no clipping.
  - The weather's sound goes through its own gentle compressor.
  - A pick or load in flight can't overwrite a later one.
  - Peals still to come are stopped on leaving, and the beds fade out rather than click.
  - Thin ice is capped at 1.
  - No puddle splash without puddles.
  - The cars' tyres brush on grass and grit on earth.
  - The bench no longer leaks loops, its scenes don't fight each other, and it stops on leaving.
- **Smaller ones.**
  - The far thunder peal is now 6.25 s, not 2.75.
  - The stills' green states have the water open.
  - The console's `weather` and `ground` take no argument as `auto`.
  - Stray comments fixed. The creek's is corrected: it's shallow and waded, not walled.

**Checks:**
- Shared 504/504, client 170/170, the water's 4/4.
- World server 191/192 twice, a different test each time (the bench by the fire, then the lamp's
  pool). Each passes alone, so it's load under the parallel run.
- e2e: the weather's two, fog, kart circuits, footing and steps-space pass. `steps.spec` passes 2
  of 5: it reads 4.3 steps/s against its 4 on the busy machine, and nothing changed touches when a
  step's taken.
- The page is 425.2 of 430 and the Grounds' chunk 174.7 of 176.
- Frame times are unchanged: the lot 9.5–10 ms, the lawn 8.4, Main Street 7.7–7.9.

**After the user's first listen (2026-11-02)**: drips heard on a clear day, and flying.
- **The drips** went on for as long as the ground was wet: about 2 h on a grey day, 50 min in
  the sun, all through a melt.
  - Now they follow the time since the rain stopped, as the roofs' drawn drops do: full as it
    stops, gone in ten minutes (`DRIPS_FOR`).
  - None after a melt that no rain made, nor on coming in after it stopped.
- **The ground's sounds didn't know height.** Flying, or god mode's camera, over the woods was
  heard as standing in them.
  - The ear is the camera, so its height over the land under it (`view.earUp`) fades the ground's
    sounds over the first 15 m: the drips, the river, the rain on the water and on the leaves,
    the birds most of the way.
  - The rain round you keeps about half (only its falling on the ground goes).
  - The wind is up to 1.6× stronger high up.
- **Checked in the game:**
  - The drips play right after rain and none while it's raining.
  - Up high, the rain on the pond goes from 0.51 to 0 and the downpour from 0.80 to 0.44.
  - Client 171/171, and the in-game sound test passes.

**The performance investigation (2026-11-02)**:
- **How it was measured.** Your saved world on an offline server, production builds of now and of
  d7dca35 (before the weather) side by side, measured by `e2e/perf-weather.mts`. The report:
  https://claude.ai/artifact/KJsvNTric2ha3xHDt4J86D.
- **The frame** costs the same as before (−0.6 to +0.15 ms a place), and walking is 60 fps in
  rain and snow.
- **Fixed after it:**
  - **The trees' crowns.** One triangle per face (they were doubled quads with an empty twin), and
    far trees get two lumps of 80 faces instead of five. A 20-face lump looked like a gem from the
    lot, so it was dropped. The lawn went 11.7 M → 5.3 M triangles a frame (3.7 M before the
    weather).
  - **The road patches.** They're drawn only while snow lies (shared `roadFooting`'s rule) and
    built only once there's snow. On a rebuild their materials are kept: they were remade, their
    shaders freed and compiled again, a 53–64 ms frame each time a storm ended.
  - **The rain** is built ahead, while the game is idle a few seconds in, and drawn once unseen. The
    first rain's frame went from 68–75 ms to under 7.
  - **The weather sounds** are let go after two minutes unwanted (`LET_GO_MS`): a bed is about
    11 MB decoded.
- **Left: the load is about 1 s longer** (7.0–7.9 s → 7.9–8.3 s, loaded alternately).
  - Shaders already compiled in parallel. The cost is the 20–45 more programs: the layer's
    per-kind variants (`-thing`, `-none`, `-way`, `-road`) of every Grounds and light-map material.
  - The fix is one shader per material, with the kind as a uniform: a refactor of `wx3d`, every
    still checked again. The user's call (2026-11-02): leave it for now.
- `snow-layer-shots.mts` takes `WORLD=ws://localhost:2667`, to render stills in an offline world
  as Bia, leaving the dev world and whoever's in it alone.

**Seen, left** (for later, or the user's say):
- People wet in the rain look dry once indoors: their light's the floor's map there, and a tint
  would replace it.
- The streaks show faintly inside a car's cabin in the cockpit view.
- Lightning is "the same for everyone" only as far as the clocks agree. There's no server time
  offset on the client.
- A restart catches the ground up under the schedule's sky, not a call that was in force.
- The air goes by the real hour while the sun goes by the room's (an admin's hour).
- The underfoot state is per process, not per room. It matters only to tests with two rooms.
- The world server's tests hold the ground wintry but not the sky, so a warm real day could
  thaw them.
- The layer's shader is the same on every quality; Lowest only thins the flakes.
- The Kart Park copies wx3d's thresholds by hand.
- With the integer hash, a trodden way under full snow is patchy, as its shader always meant;
  before, it came out bare. To look at in the game.

## Decisions

Decided with the user (2026-11-01):

| | |
|---|---|
| How often it snows | **About one day in four**, in spells of one to three days: ~35% clear, 25% cloudy, 20% rain, 20% snow. No seasons. (Built: 27.5% of days snowy; by the hour 35 clear / 23 cloudy / 25 rain / 4 sleet / 13 snow, phase 1's notes) |
| How fast | **Hours**: white after ~2–3 h of steady snow (a blizzard ~45 min), melted over ~6–10 h of thaw, the shade and the drifts last |
| The water | **Liquid**, frozen after a cold spell; walked only when frozen (W6) |
| Thunderstorms | **In** (W7): downpours with lightning, the thunder after by the distance |
| The phone's forecast | **In** (W10): the next days from the schedule |
| The Kart Park | **Follows the weather**: its tracks dirt or tarmac on a green day, snow and ice when it lies, the grips with them; its signs lose "SNOW" (phase 5) |
| Wet people | **In** (W7): clothes and hair darken in the rain, a raincoat's hood up |
| The budgets | **Raised as needed** (the page, the Grounds' chunk and the rest), measured and written down each time |
| The sound | **Its own last phase** (phase 9): all of it rechecked there, none before |
| The night on green | **Left black**: the dark isn't retuned for the grass |
| The first snow | **A soft, fine powder** with the grass through it and broad drifts (the blotches reworked) |
| The winter painted in | **Redone** in phase 4: the campus blocks' walls, the façade's ledges, the lot's paint, the asphalt's salt, the lot's wet patches |

Still open, for phase 0 and phase 3: the look of the green and of the snow coming and going (the
stills), the physics' snow heights (measured), and the new step sets (by ear, phase 9).

# The snow campus — what's outside the windows (plan, 2026-10-16)

Ask: "the external scenario for third and first person is so bad". The snow
theme was inspired by *Ruptura* (Severance); keep that as the goal: **a big
building far from everything; a large field; next to the building a parking
lot with some cars.** Evolve the idea.

## What's there today (3D)

The studio floor floats as a 3-tile-deep grey slab on an endless flat white
plane. Eighty bare trees are flat drawings turned to the camera, a few
snowflakes fall in a ring, grey fog eats everything past 40 tiles. There is no
building, no ground, nothing to look at out of a window.

## The idea, evolved

The Studio is **the top floor of a corporate headquarters alone in the snow** —
the *Ruptura* exterior is the Bell Labs Holmdel building: a long, low block of
mirrored glass in the middle of a vast lawn, reached by one driveway, with a
sea of parking beside it and a lone water tower as the only landmark. Nothing
else for miles. We take that whole picture, in the game's own hand (no
branding, no names from the show).

### 1. The headquarters

- The studio's footprint is the **north-west corner of the top floor**. The
  building is far bigger than the studio: four storeys below it, an **east wing**
  that runs north past the studio's windows, and a **south wing** behind the
  lobby. Seen from the north windows you look across a snowed lawn to the
  east wing's glass facade; from the west windows you look down on the parking
  lot, with the entrance below you to the left.
- **Curtain wall**: dark mirrored glass in a strict grid — bays four tiles wide,
  a concrete spandrel band at every floor with **snow on every ledge**, mullions,
  a parapet on top with snow on it. The glass takes the sky's colour by the hour.
  At night a few offices on every floor stay **lit cold white** (never the
  studio's own windows — those are real).
- The main block's top floor is the studio itself: its walls and windows *are*
  the facade there. The shell adds only the parapet above them and the storeys
  below, a hair outside the wall plane so nothing fights.
- The wings are closed boxes, their roofs snowed, with rooftop plant on them.
  Their faces point outward, so a chase camera that swings into a wing sees
  straight through it — the studio is never covered.
- **The entrance**: at the foot of the west facade, a glass vestibule under a
  flat canopy, lit warm at night, with the company's name in thin serif capitals
  on the canopy ("YUTOPIA" — our own, in the hi-fi palette), a cleared path from
  it to the parking lot, two flagpoles.

### 2. The parking lot

- West of the building, where the lobby's windows look: asphalt (ploughed,
  dark, wet-looking), **painted bays** in rows, islands, **snow banks** heaped
  along every edge where the plough pushed it, tyre tracks in the slush.
- **Cars**: a dozen or so 80s sedans and wagons, real 3D models (body from a
  side profile, cabin with dark glass, wheels, bumpers, mirrors, lights) in
  period colours (beige, burgundy, slate blue, white, black, brown), parked
  nose-in with **snow on their roofs and hoods**. One or two bays wiped clean
  where someone just left.
- **Lamp posts**: tall cobra-head poles over the lot and along the driveway;
  at night each one throws a cold pool of light on the snow.

### 3. The field

- An endless **snowfield** with soft drifts and a blue cast in the hollows,
  deeper and flatter the further out. No other buildings anywhere.
- One **driveway** leaves the lot and curves away north-west to the horizon
  with lamp posts at intervals — the only way in or out.
- A **water tower** on the lawn to the north-west: a tall stem and a round
  tank, white with a red light blinking on top at night. The one landmark.
- The horizon all round is a dark **line of conifers**, with bare winter trees
  scattered nearer (the theme's own tree drawing, as today, but fewer and
  placed along the driveway and the lawn's edge).
- **Weather**: overcast sky by the hour as today; snow falling everywhere you
  look (not only in a ring); the fog starts far out so the field reads as a
  field; everything far fades into the horizon's colour.

### 4. Day and night

- By day: white light, long soft shadows at golden hour, the glass a little
  warmer. The sky's colour is reflected in the glass.
- At night: the lot's lamps and the driveway's string of lights, scattered lit
  offices in the wings, the entrance glowing, the tower's red light, the snow
  going blue. Bloom on High picks the lights up.

## Where it goes

- `apps/client/src/world/tp/campus.ts` (new): the campus — ground, lot, cars,
  lamps, building shell, wings, tower, trees — built once per space from the
  map's footprint; `setDay` and `update` as the other surroundings.
- `apps/client/src/world/tp/sky.ts`: the snow branch hands over to the campus;
  dome and fog reach further for the snow theme.
- Everything procedural, as the rest of the art (canvas textures, extruded
  profiles, instanced meshes). A handful of draw calls; nothing per frame but
  the snow and the tower's light.

## Follow-ups (not in this pass)

- The **iso** backdrop painted to the same campus (parking lot, cars, tower).
- A **ceiling** for first person (the fluorescent grid), shown only when the
  camera is under it.
- A car arriving and parking now and then; footprints in the fresh snow.

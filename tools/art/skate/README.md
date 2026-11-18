# tools/art/skate — plan 103's skateboards

Nine late-80s / early-90s skateboards (three shapes × three variants), scripted in Blender on plan 92's car kit
(`tools/art/cars/kit.py` is imported, never edited: its materials, mesh helpers and patched glTF export; the bikes'
`tools/art/bikes/bkit.py` / `bexport.py` likewise). No real makes, logos or copied graphics: the makers and the
models are invented.

| shape | variants | |
| --- | --- | --- |
| `vert` (80s vert deck: wide ≈ 10", ≈ 30" long, shaped, a short nose, a long flat tail with a skid plate, plastic rails on the bottom, big soft wheels ≈ 64 mm, wide trucks) | `vert-classic` (rounded wide outline), `vert-fish` (fishtail tail, a nose guard), `vert-square` (squared-off nose and tail, a lapper on the back truck) | the 80s colours: bright, a big screen-printed graphic on the bottom |
| `street` (early-90s popsicle: ≈ 8" × 31.5", nose and tail both kicked, near-symmetrical, small hard wheels ≈ 50 mm, narrow trucks) | `street-pop` (plain, a graphic on the bottom), `street-slick` (a shiny plastic "slick" bottom), `street-tech` (narrower 7.75", 48 mm wheels, a longer nose) | |
| `cruiser` (a kicktail only, flat nose, ≈ 9" × 29", soft wheels ≈ 60 mm, risers under the trucks) | `cruiser-classic` (painted), `cruiser-wood` (natural wood, clear-coated, no grip at the nose), `cruiser-mini` (short ≈ 27", plastic-look deck) | |

## Running

```sh
# the GLBs (near, mid, one far a shape) and manifest.json → apps/client/public/life/skate/
blender -b --factory-startup -P tools/art/skate/build_boards.py -- [--board street-pop,vert-fish] [--no-mid] [--no-far]
# the contract checked (exits 1 on a failure)
blender -b --factory-startup -P tools/art/skate/check_glb.py -- [--board …]
# the stills → design/skate/ (top, bottom, side, 3/4 of each; scale with the 1.70 m mannequin standing on one;
# detail of a truck; check = the exported GLBs re-imported, the trucks turned)
blender -b --factory-startup -P tools/art/skate/mock_boards.py -- [--shots tiles,scale,detail,check] [--board …]
```

## The contract (what the game reads)

**Frame**: glTF y-up — **x forward (to the nose), y up, z to the board's right**; the origin **on the ground under
the middle between the two axles**; metres; the wheels' bottoms on y = 0. (Blender's frame while building: x
forward, y left, z up; the exporter turns (x, y, z) into (x, z, −y), as the bikes'.)

**Nodes** (each pivot an empty; its meshes its children, merged by material kind as the cars' are):

```
<variant>                 root
  deck                    origin at the deck's middle, on its top face (= points.deck). Everything fixed to the
                          deck: the plies, the grip, the graphic, rails, skid plate, the trucks' baseplates and
                          kingpins and bushings, the risers, the bolts. The game rolls this about local x to lean.
    hanger_f              origin at the front axle's middle; the hanger and the axle (the part that turns).
                          The game turns it about local y (the carve) and keeps it level as the deck leans.
      wheel_fl, wheel_fr  each at its wheel's middle; the wheel (and bearing, nut) spins about local z
    hanger_r              the same at the back axle
      wheel_rl, wheel_rr
  collider                a box round the board (never drawn)
```

**Points** (empties, names exact; each hung under the pivot it moves with; the manifest gives them at rest):
`deck` (the top face's middle) · `nose`, `tail` (each tip's top, on the centre line) · `bolts_f`, `bolts_r` (the
middle of each bolt pattern on the top face) · `foot_f`, `foot_r` (where a rider's front and back foot stand:
front over the front bolts, back on the tail's kick) · `axle_f`, `axle_r` (under hanger_f / hanger_r: the axle's
middle, where it sits on a rail for a 50-50 / 5-0) · grab spots on the deck's edge (under deck):
`grab_nose`, `grab_tail`, `grab_toe`, `grab_heel` (the middle of each side), `grab_toe_f`, `grab_heel_f`,
`grab_toe_r`, `grab_heel_r` (between the bolts and each tip) — **toe side is the rider's toes' side: +z for a
regular rider facing +z (the board's right)**.

**Materials** (one per kind, named as the kind): `deck_wood` (the plies' edge, the clear-coat; the maple's grain),
`grip` (black griptape, its grit as a normal or bump), `graphic` (the bottom's print: a texture of our own, drawn
in Blender — shapes, invented lettering), `paint` (tinted by the game: the deck's top colour where there's no grip,
painted plies), `paint2` (accents), `plastic` (rails, skid plate, nose guard, lapper, slick bottom), `alloy`
(hangers, baseplates), `steel` (axles, kingpins, bolts, nuts), `rubber` (bushings, risers), `urethane` (the wheels:
tinted by the game, slightly translucent-looking), `bearing` (the shields), `collider`. Textures linked by URI as
the bikes' are (`../cars/tex/*.ktx2`, `../mat/*`, `tex/` ours).

**Files** (`apps/client/public/life/skate/`): `<variant>.glb` (near, ≤ 12k triangles, ≤ 600 KB),
`<variant>-mid.glb` (≤ 1.5k: no bolts, bushings simplified; the same pivots and points), `<shape>-far.glb` (≤ 150:
a slab and four discs; one root node, no pivots), `manifest.json`:

```json
{ "version": 1, "frame": "glTF y-up: x forward (nose), y up, z right; origin on the ground under the axles' middle",
  "boards": { "<variant>": {
    "file", "mid", "far", "shape", "variant", "name" (maker + model, invented),
    "dims": {"length", "width", "height" (deck top over the ground), "thick"},
    "wheelbase" (axle to axle), "truck_width" (axle end to end), "wheel": {"r", "width"},
    "kick": {"nose": {"angle", "len"}, "tail": {"angle", "len"}} (rad, m; the cruiser's nose angle 0),
    "points": {name: [x, y, z]}, "materials", "tris": {"near", "mid", "far"}, "bytes",
    "colours" (three period colours for paint), "wheel_colours" (three), "mass" (kg, a guess by its size),
    "has": {"rails", "skid", "nose_guard", "lapper", "slick", "risers", "grip_nose"} } },
  "far": { "<shape>": {"file", "tris", "bytes", "from"} } }
```

Checks (`check_glb.py`): the pivots and points exist and sit where the manifest says (≤ 1 mm); the wheels'
bottoms at y = 0 (≤ 2 mm); the four wheels symmetric; `hanger_*` turned ±20° keeps the wheels on the ground within
2 mm of each other's height; the budgets; every material named in the list; no unnamed meshes.

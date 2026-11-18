# tools/art/bikes — plan 101's bicycles

Twelve late-80s / early-90s bikes (four bodies × three variants), scripted in Blender on plan 92's car kit
(`tools/art/cars/kit.py` is imported, never edited: its materials, mesh helpers and patched glTF export).
No real makes, badges or copied designs: the makers (Hollin, Rook, Tarn, Merrow) and the models are invented.

| body | variants | |
| --- | --- | --- |
| town | `town-classic` (Hollin Dame: twin laterals, wicker basket, full chain case, string dress guard, rack), `town-step` (Hollin Lage: low step tube, half guard, rack + double bag, cream walls), `town-post` (Hollin Bode: twin tubes, 26" front wheel, big frame-mounted front carrier, rack) | 28", 3-speed hub + rear drum, front caliper, dynamo lamp, bell, side stand |
| bmx | `bmx-free` (Rook Spinner: mag wheels, rotor `bars_spin`, four pegs, U-brake, pads), `bmx-race` (Rook Gate: number plate, pad), `bmx-street` (Rook Curb: chunky tyres, chrome rims, four pegs, bell) | 20", 44/16, calipers, reflectors |
| mtb | `mtb-trail` (Tarn Ridgeline: tan-wall knobblies), `mtb-winter` (Tarn Rime: studded tyres, guards, battery lamps), `mtb-tour` (Tarn Wayfarer: city slicks, rack, two bottles) | 26" rigid cro-mo, 3×7 thumb shifters, cantilevers, bar-ends, side stand |
| road | `road-race` (Merrow Sprint: gumwalls, pump, bottle), `road-tour` (Merrow Randonneur: chrome lugs, triple, cantis, guards, rack + panniers, lamps, bell, stand), `road-fixed` (Merrow Pista: track drops, 48/16 fixed) | 700c lugged steel, down-tube shifters, aero levers, quill pedals + toe clips |

## Running

```sh
# the GLBs (near, mid, one far a body) and manifest.json → apps/client/public/life/bikes/   (~10 s for all)
blender -b --factory-startup -P tools/art/bikes/build_bikes.py -- [--bike town-classic,road-race] [--no-mid] [--no-far]
# the contract checked (exits 1 on a failure)
blender -b --factory-startup -P tools/art/bikes/check_glb.py -- [--bike …]
# the stills → design/bikes/ (tiles: side + 3/4 of each; scale; detail; check = the exported GLBs re-imported and posed)
blender -b --factory-startup -P tools/art/bikes/mock_bikes.py -- [--shots tiles,scale,detail,check] [--bike …]
# the mid level's spokes texture (tex-src/spokes36.png → public/life/bikes/tex/spokes36.ktx2, basisu)
blender -b --factory-startup -P tools/art/bikes/btex.py
```

Files: `bkit.py` (the car kit + sweeps, Béziers, toothed rings, lofts, wrapped decals, helices, the chain's belt
line), `bwheel.py` (tyres with tread geometry, rims, 3-cross spokes, hubs, cogs), `bdrive.py` (cranks, rings,
pedals, chain, derailleurs, shifters), `bcockpit.py` (headset, stems, bars, tape, grips, levers, saddles, posts,
brakes, cables), `bacc.py` (guards, racks, cases, skirts, basket, stand, bottles, bags, BMX parts, bell, lamps,
reflectors), `bikes.py` (bodies, variants, frames, forks, assembly), `build_bikes.py`, `bexport.py` (the cars'
patched exporter), `btex.py` (textures and the GLBs' texture links), `mock_bikes.py`, `check_glb.py`.

## The contract (what the game reads)

**Frame**: glTF y-up — **x forward, y up, z to the bike's right**; the origin **on the ground under the bottom
bracket**; metres. (Blender's frame while building: x forward, y left, z up; the exporter turns (x, y, z) into
(x, z, −y).)

**Nodes** (each pivot an empty; its meshes its children, merged by material kind as the cars' are):

```
<variant>                       root
  frame                         everything fixed to the frame (saddle, post, racks, guards' rear, derailleurs, stand's mount…)
  steer                         origin ON the steering axis at the head tube's foot (= steer_bottom); local +y UP the
                                axis (tilted back by the head angle), local +z to the right → turn the bars about local y
    bars_spin                   (bmx-free only) the stem, bars, grips, lever bodies, pads, the rotor's upper plate;
                                same frame as steer (origin at steer_top) → spin it about its local y for a barspin
    wheel_f                     at the front hub, the bike's own orientation when steer is straight
      spin_f                    at the front hub; the wheel turns about local z (the axle)
    lever_l, lever_r            (under steer, or bars_spin) at each blade's hinge; rotate about local z; the full
                                pull in the manifest (`levers.<name>.pull`, signed radians); right = front brake
  wheel_r                       at the rear hub (under the root, not the frame: drop it for a flat)
    spin_r                      turns about local z (the cogs turn with it)
  crank                         at the BB; turns about local z; at 0 the right arm points forward (+x), the left back
    pedal_l, pedal_r            each at its pedal body's centre on the spindle; turn about local z (counter-turn
                                them by the crank's angle to keep them level)
  kickstand                     (town, mtb, road-tour) at its hinge; rotate about local x from 0 (stowed along the
                                left chain stay) to `kickstand.down` (rad) — its foot then at stand_foot; the bike
                                leans `kickstand.lean` (rad) onto it, to its left
  collider                      the convex hull round the wheels, bars, saddle and pedals (never drawn)
```

**Points** (empties, names exact; each hung under the pivot it moves with — grips, drops, bell under steer or
bars_spin, hub_f under wheel_f, hub_r under wheel_r, the rest under the root; the manifest gives them at rest):
`saddle` (the sit bones' spot: the saddle's top, behind its middle) · `grip_l`, `grip_r` (the hands' middles;
on the road bikes the hoods' tops) · `drop_l`, `drop_r` (road) · `bb` · `hub_f`, `hub_r` · `lamp_f` (the lens
centre, facing +x; when there's a lamp) · `lamp_r` (the rear lamp, or the red reflector) · `bell` (its thumb
lever) · `peg_fl`, `peg_fr`, `peg_rl`, `peg_rr` (the pegs' middles) · `stand_foot` · `steer_top`,
`steer_bottom` (the head tube's top and foot on the axis).

**Materials** (one per kind, named as the kind): the cars' — `paint` (tinted by the game), `paint2` (accents:
bands, the chain case, decal lines), `chrome`, `alloy`, `alloy_dark`, `steel`, `tyre`, `rubber`, `trim`,
`vinyl`/`leather` (the library's leather maps), `canvas`/`webbing` (twill), `lens`, `lens_red`, `lens_amber`,
`reflector`, `emit_head` (the front lamp's glow, behind its lens), `emit_tail` (the rear lamp's), `collider` — and
the bike's own: `decal` (the transfers, off-white), `chain`, `gumwall` (tan sidewalls, gum hoods), `tape`,
`wicker`, `nylon`, `foam`, `spokes` (mid only: an alpha-masked disc, `tex/spokes36.ktx2`). Textures are linked by
URI as the cars' are: `../cars/tex/*.ktx2` (paint, grain, lens, rib), `../mat/*` (leather, twill), `tex/` (ours).

**Files** (`apps/client/public/life/bikes/`): `<variant>.glb` (near, ≤ 45k triangles, ≤ 1.5 MB),
`<variant>-mid.glb` (≤ 8k: no cables, bolts or decals, spokes as the alpha disc, the chain a band; the same
pivots and points), `<body>-far.glb` (≤ 600: tubes as rods, wheels as discs; one root node, no pivots),
`manifest.json`:

```json
{ "version": 1, "frame": "glTF y-up: x forward, y up, z right; origin on the ground under the bottom bracket",
  "bikes": { "<variant>": {
    "file", "mid", "far", "body", "variant", "kind" (bike_town|bike_bmx|bike_mtb|bike_road), "name",
    "dims": {"length", "width" (the bars), "height", "front", "back"},
    "wheelbase", "wheel": {"f": {"r", "width"}, "r": {"r", "width"}}, "head_angle", "seat_angle", "rake",
    "crank", "crank_zero", "pedal": {"from_crank", "q"}, "teeth": [ring, cog] (the chain's), "rings", "cogs",
    "hub_ratios" (the town's 3-speed),
    "points": {name: [x, y, z]}, "steer": {"at", "axis"}, "levers": {"lever_l": {"pull", "brake"}, …},
    "kickstand": {"axis": "x", "down", "lean", "lean_side"} | null,
    "has": {"lamp": "dynamo|battery|none", "bell", "basket", "rack", "carrier", "pegs", "gyro", "studs", "guards",
            "gears", "hub_gears", "fixed", "kickstand", "chain_case"},
    "materials", "tris": {"near", "mid", "far"}, "bytes", "colours" (three period paints), "colour2",
    "hull" (the collider's points), "nodes", "measured": {"saddle_y", "grip_y", "bb_y", "drop_y"} } },
  "far": { "<body>": {"file", "tris", "bytes", "from"} } }
```

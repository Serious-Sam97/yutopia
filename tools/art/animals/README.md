# Animals (plan 126, phase 1)

The animal models: CC0 packs restyled to the life look, plus Blender scripting for the gaps.

```sh
# all models → apps/client/public/life/animals/<model>.glb + manifest.json   (~1.5 min)
/opt/homebrew/bin/blender -b --factory-startup -P tools/art/animals/build_animals.py
# some of them
/opt/homebrew/bin/blender -b --factory-startup -P tools/art/animals/build_animals.py -- --only deer,wolf
# stills, read back from the .glb files → design/screens/animals/
/opt/homebrew/bin/blender -b --factory-startup -P tools/art/animals/contact_sheet.py -- --what lineup --name lineup-big --only moose,horse,cow,bear,deer,wolf
/opt/homebrew/bin/blender -b --factory-startup -P tools/art/animals/contact_sheet.py -- --what poses --view three --name poses-birds --only crow,duck,owl --clips idle,walk,eat,lie,fly,glide
```

- **Sources** are read from `$ANIMAL_SRC`, by default `~/Developer/projects/yondra/yutopia-art-src/polypizza`
  (`list.txt` there holds the poly.pizza ids and licences). They stay out of git.
- **Credits.** Everything is Quaternius CC0 except the rabbit (hare, frog) and the hawk (all the birds, the
  chicken and the chick). Those two are CC BY 3.0 by Sherkiz, listed in `tools/art/life/sources.json` as
  `pprabbit` and `pphawk`. Each of their files also names its source in glTF `asset.copyright`.
- `species.py` holds the cast: source, size, morph, palette and painter, and clip choices.
  `build_animals.py` holds the pipeline and the clips it makes; it reads `species.py` with `exec`.

## The frame every file shares

- **Metres, true size.** Each model is scaled so one measurement matches the real animal (`measured` in
  `manifest.json`): `top` is shoulder or back height, `height` is the whole height, `length` is nose to tail.
- **Y up, standing on y = 0.** The origin is the middle of the feet's footprint. The bat and the fish
  are the exception: their origin is the middle of the body, and the client sets the height.
- **The nose points along +X** in glTF / three.js space (the left side is −Z). With `yaw = atan2(dz, dx)` the
  animal faces where it heads.
- **One skinned mesh.** One material, white, with roughness 0.85. The colour is `COLOR_0`: per species,
  countershaded (lighter underneath, a little darker on top) with a soft painted variation. There are no
  textures and no UVs.
- The mesh is Catmull-Clark subdivided once and shaded smooth, then decimated to its budget: 12k triangles for
  the big animals, 8k for medium, 6k or 4k for small ones and birds. There are at most 4 bones per vertex.
  meshopt compression is on (`EXT_meshopt_compression`, which needs three's `MeshoptDecoder`).
- **Clips** are named exactly: `idle idle2 look eat walk trot run jump attack kick hitL hitR die lie sit fly
  glide swim`. Any bone that any clip moves is keyed in every clip, so switching clips never leaves a bone
  where the last clip put it. Keys are thinned to what linear interpolation needs (0.15°, 0.1 % of the body).
  `idle`, `walk`, `trot`, `run`, `lie`, `sit`, `fly`, `glide` and `swim` loop. `die` ends on its last pose,
  and the rest play once. The client handles a missing clip with its own fallback.

## Where each clip comes from

| family | models | from the source | made here |
|---|---|---|---|
| Quaternius "Ultimate" rig | deer, deer_buck, elk, moose, wolf, bear, boar, lynx, fox, raccoon, squirrel, beaver, cat, cow, pig, sheep, horse, horse_white | idle←Idle, idle2←Idle_2, look←Idle_Headlow / Idle_2_HeadLow, eat←Eating, walk←Walk, run←Gallop, jump←Gallop_Jump, attack←Attack / Attack_Headbutt, kick←Attack_Kick, hitL / hitR←Idle_HitReact_Left / Right, die←Death | trot = the walk at 1.3–1.55×; lie (sternal for hoofed animals, sphinx for paws, with a breath); sit (paws only); swim = a slow walk with the head up (species that swim) |
| the hawk (birds) | crow, songbird, duck, goose, gull, owl, pigeon, chicken, chick | fly←Fly (the body flown level) | idle (wings folded), idle2 (a peck), look, eat (pecks), walk (waddle and head bob), run, jump (a hop), attack, hitL / hitR, die (on its side), lie (sat down), glide (the flattest wingbeat frame held, with a slow bank), swim (legs tucked, paddling) |
| the rabbit | hare, frog | idle←Bunny_idle, walk←Bunny_walk | trot / run / jump (the hop retimed), idle2 and sit (up on the haunches), eat, look, lie, die, hitL / hitR, swim |
| bat | bat | fly←Bat_Flying, attack←Bat_Attack, die←Bat_Death, hitL / hitR←Bat_Hit | idle (a slow flutter), glide |
| fish | fish | swim←Swim | idle (slow swim), run (fast swim), die (belly up), hitL / hitR |

Missing clips by model (also listed in `manifest.json`):

- Hoofed animals: `sit`, `fly`, `glide`. The cow, pig, sheep and boar also have no `swim`.
- Wolf, bear, lynx, fox, raccoon, squirrel, cat: `kick`, `fly`, `glide`. The beaver also has no `sit`.
- Hare: `attack`, `kick`, `fly`, `glide`. The frog also has no `sit`.
- Birds: `trot`, `kick`, `sit`. The chick also has no `fly`, `glide` or `jump`.
- Bat: everything except `idle`, `fly`, `glide`, `attack`, `hitL`, `hitR`, `die`.
- Fish: only `idle`, `run`, `swim`, `hitL`, `hitR`, `die`.

## How a species is made

1. **Load.** The source is turned so the nose is on +X and its armature is applied to metres; location keys are
   scaled to match. The rabbit, bat and fish are first re-rested on the pose their glTF nodes hold, which is
   what they were made to be seen in; their bind pose is not. The rabbit's flank vertices skinned to its IK
   controls are re-weighted.
2. **Morph** (`species.py` `morph=`). Each bone's own part is scaled, stretched or turned about its head in
   world axes. A child's head follows its parent, and the mesh follows by linear-blend skinning over the bone
   weights. The bones keep their orientation, so every source clip still plays: the lynx's long legs and stub
   tail, the bear's bulk, the goose's neck, the owl's head. Hooves on IK bones are carried by their lower legs.
3. **Extras.** Udders and horns are removed (pig, boar, sheep), the stag's antlers are reshaped (buck, elk),
   and the moose's palms are built after its morph.
4. **Finish.** Size and ground; merge, subdivide, decimate; paint; bind; clips; export.

## Not done here and known gaps

- The pack's farm animals (pig, sheep, cat_a, chicken_b, chick) and its old dog and wolf are blocky voxel toys
  that can't become the life look. The pig, boar and sheep are morphed from the cow instead, the cat from the
  fox, and the chicken and chick from the hawk.
- The pig and the boar are cow bodies made short-legged and barrel-shaped. They read as a pig and a boar at a
  distance but have no pig snout disc and no tusks.
- The cat and the squirrel keep something of the fox's long face.
- The birds' folded wing is posed from a rig that never folds; its feathers are slid back along the arm. It is
  tidy from the side and above, with a small stub at the shoulder.
- No young yet (fawn, cub, pup, piglet, foal, lynx kit), no saddle or bridle, no far LODs or baked vertex
  animation, and no `/dev/animals` bench.
- The files are about 0.2–0.7 MB each (about 17 MB for all 31), mostly glTF JSON: Blender's meshopt export gives
  every accessor its own buffer view. Gzipped they are about 0.1–0.25 MB.

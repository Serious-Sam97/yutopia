#!/bin/sh
# Plan 73 — every life-look asset built and packed for the web (docs/plan/73, "Rebuilding the assets"):
# Blender writes each .glb (meshopt geometry, PNG textures), pack_glb.py encodes the textures to KTX2.
#   sh tools/art/life/build_all.sh            (from the repo root)
# The people need the works by others (plan 75) extracted, in $HAIR_IMPORTS (default
# ../yutopia-art-src/sketchfab): `python3 tools/art/life/sources.py extract` and `… sheet`, once.
set -e
cd "$(dirname "$0")/../../.."
OUT=apps/client/public/life
B="blender -b --factory-startup"
TMP=$(mktemp -d)
# (the garments and hair made by script, plan 73 phase 5: "sample" the sign-off's handful)
WEAR=${WEAR:-sample}
for who in man woman; do
  # (the slim and broad bodies first, dumped; the regular build takes them as its morphs — plan 73 phase 4)
  for body in slim broad; do
    $B -P tools/art/life/build_person.py -- --who "$who" --body "$body" --wear "$WEAR" --dump "$TMP/$who-$body.npz" | grep dumped
  done
  $B -P tools/art/life/build_person.py -- --who "$who" --paint --wear "$WEAR" --morphs "slim=$TMP/$who-slim.npz,broad=$TMP/$who-broad.npz" | grep -E "wrote|shoulders"
  python3 -I tools/art/life/pack_glb.py "$OUT/person-$who-painted.glb" "$OUT/person-$who-painted.glb"
  # (its garments and hair, phase 5: a file each — 5.4, a person loads only what they wear)
  for g in "$OUT/wear-$who"/*.glb; do python3 -I tools/art/life/pack_glb.py "$g" "$g" > /dev/null; done
  # (its far person, plan 73 4.5: one coarse mesh, no textures)
  python3 -I tools/art/life/pack_glb.py "$OUT/person-$who-far.glb" "$OUT/person-$who-far.glb"
done
# the credits (plan 75): the works by others in what was built → public/credits.json, each file stamped
# with its own (after the packing: pack_glb rewrites the files)
python3 tools/credits.py
$B -P tools/art/life/build_plant.py | grep wrote
python3 -I tools/art/life/pack_glb.py "$OUT/plant-rubber.glb" "$OUT/plant-rubber.glb"
$B -P tools/art/life/build_tree.py | grep wrote
python3 -I tools/art/life/pack_glb.py "$OUT/tree-leafy.glb" "$OUT/tree-leafy.glb"
# the material library (phase 3): painted by code, KTX2 into public/life/mat
node --experimental-strip-types tools/art/life/materials.mts | tail -1

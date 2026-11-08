#!/bin/sh
# Plan 73 — every life-look asset built and packed for the web (docs/plan/73, "Rebuilding the assets"):
# Blender writes each .glb (meshopt geometry, PNG textures), pack_glb.py encodes the textures to KTX2.
#   sh tools/art/life/build_all.sh            (from the repo root)
set -e
cd "$(dirname "$0")/../../.."
OUT=apps/client/public/life
B="blender -b --factory-startup"
for who in man woman; do
  $B -P tools/art/life/build_person.py -- --who "$who" --paint | grep -E "wrote|shoulders"
  python3 -I tools/art/life/pack_glb.py "$OUT/person-$who-painted.glb" "$OUT/person-$who-painted.glb"
done
$B -P tools/art/life/build_plant.py | grep wrote
python3 -I tools/art/life/pack_glb.py "$OUT/plant-rubber.glb" "$OUT/plant-rubber.glb"
$B -P tools/art/life/build_tree.py | grep wrote
python3 -I tools/art/life/pack_glb.py "$OUT/tree-leafy.glb" "$OUT/tree-leafy.glb"

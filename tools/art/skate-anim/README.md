# tools/art/skate-anim — plan 104 F4a: the skater's clips

Keyed clips on our own rig with a board bone, authored in Blender, played by the client (`apps/client/src/world/skate/pose.ts`).
Tony Hawk's Pro Skater 1+2 is the reference for timing; nothing of its art is used.

```sh
# the clips → apps/client/public/life/skate/anim.json (and, with --blend, a .blend of the actions to look at)
blender -b --factory-startup -P tools/art/skate-anim/build.py -- [--only kickflip,indy] [--blend design/skate/anim104/clips.blend]
# the stills: the exported file posed on a life person with the street board → design/skate/anim104/<sheet>-<view>.png
blender -b --factory-startup -P tools/art/skate-anim/stills.py -- [--sheet flips] [--only indy] [--view side|game|both] [--res 300x340]
# the client's checks of the file (every trick has a clip, the feet on the deck, flips end level, the player whole)
cd apps/client && npx tsx --test src/world/skate/pose.test.ts
```

**Plan 106: measured against real skaters.** The footage (Pexels, `sources.md`) → MediaPipe Pose → the numbers our
clips are held to (`capture.py measure` beside `audit.py`):

```sh
# the pose tool, once (Apache-2.0, ~124 MB: mediapipe from PyPI, its heavy pose model from Google's storage)
uv venv tools/art/skate-anim/.venv && uv pip install --python tools/art/skate-anim/.venv/bin/python mediapipe==1.2.3
curl -L -o tools/art/skate-anim/models/pose_landmarker_heavy.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task
# each clip in footage/ → poses/<id>.json + a contact sheet with the skeleton drawn
tools/art/skate-anim/.venv/bin/python -I tools/art/skate-anim/pose_extract.py
# the real skaters' numbers (hips over the sole, knees, spread, knees' width, lean, arms) and ours, the same way
tools/art/skate-anim/.venv/bin/python -I tools/art/skate-anim/capture.py measure 9723989 180 290 3
blender -b --factory-startup -P tools/art/skate-anim/audit.py -- --only stance,push,ollie --every 6
```

- `rig.py` — the game's rig in mathutils: the joints and parents (chars/rig.ts), the legs' numbers read from
  chars/moves.ts, the trunk and arms from `public/life/person-man.glb` (arms straight down, as the client makes them),
  FK, the legs' and arms' IK, three.js Euler orders (joints `XYZ` = mathutils `ZYX`; the board `YXZ` = `ZXY`).
- `clips.py` — every clip as keys of channels (the file's header lists them: hips, trunk, arms by angle or IK to a
  board spot, each foot's spot on the board and its lock, the board's place and turn about a pivot, whole-body turns
  for inverts and slides), each key's ease one of Blender's interpolations. A regular rider on the street popsicle.
- `build.py` — each clip an Action on an empty (a custom property a channel; the arms two frames late and the head one
  for follow-through; a looped clip's curves cycle), evaluated at 60 fps, solved on the rig, written at 30 fps.
- `stills.py` — what the client reads, posed as the client poses it (a life leg fitted to the rig's as
  chars/model.ts fitLeg does), the board built from tools/art/skate/boards.py on its bone.

**The format** (`anim.json`, ~560 KB, ~60 KB gzipped): `clips.<id>` = `{dur, n, t[], kind, loop?, hold?: [a, b], out?,
space?, ch}`; each channel a number (constant) or `n` samples: `<joint>.x|y|z` (three.js XYZ Euler under its parent),
`lift.*` (the hips off their rest), `bc.*` (the board's middle, her space), `be.*` (its roll, yaw, pitch: three.js
YXZ), `fL|fR.lk|x|y|z|h|t` (each foot's lock to the deck, its sole's spot on the board — its own frame —, turned,
pointed), `hL|hR.w|x|y|z` (each hand's IK weight and spot: the board's frame, or hers where `space` says `root`).
Her space: x her left, y up, z ahead, the root on the ground under the board's middle. A goofy rider is the mirror;
another board's spots are mapped onto it by its manifest's points (pose.ts `mapPoint`).

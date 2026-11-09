# 73 — The life look

Ask (2026-11-08), after the mature-look study (four colour and light takes on the live game,
https://claude.ai/artifact/48wUvPTpm4u3or1FQroBZQ): "I'm thinking more of the mature look of The
Sims 3. Not only the colour, but the design and model of all."

Status: **phases 0–2 committed (98aee21, 7528023, 8ca77a1); phase 3 (the material library) signed off and
committed 2026-11-08.** The game draws as before unless `?look=life`; the library and the
mocks are dev pages so far.

Decided with the user (2026-11-08): F1 **authored base mesh** for people · F2 **upgrade the code
kit** for furniture and buildings (organic things from Blender scripts) · F4 **drop ink and cel**
· people **slightly idealised** (near-real proportions, a touch of polish, slightly larger eyes).
F3 (Standard materials) and F5 (tiers) go with the recommendation as technical defaults, to be
confirmed by phase 0's numbers.

Texture style decided 2026-11-08, after 0b's photo-vs-painted mock (`build_person.py --paint`, a
Kuwahara repaint of MakeHuman's textures): **painted**. Smooth, airbrushed skin; fabric as flat,
slightly rich patches of colour with clean patterns; no photo grain. Phase 3's library and phase 5's
clothes are made for this style, not filtered from photos (the filter was only the mock).

## What this changes

On 2026-10-22 the world went **stylized**: flat facets, an ink line, the cool cel shade, flat
colour, no textures. The reason then was that a realistic world made the ligne-claire people look
pasted on. That reason goes away here, because **the people change too**. This plan replaces the
stylized direction everywhere: people, furniture, buildings, the Grounds, pets and the pictures
of them in the UI.

The reference is a **quality**, not a source. We take what makes that era of life-sim art feel
grown-up and warm, and we make every model, texture and character ourselves. No assets, characters,
UI, logos or names come from the game.

## What the look is made of

Looking at that style, what it has and we don't:

1. **Soft, believable light.** A warm sun and a cool sky fill, soft shadows, darkening where
   things meet (ambient occlusion: under a sofa, in room corners, between fingers), a gentle
   bloom, and a tone curve that holds highlights. Skin, wood, glass and metal each catch light
   their own way. **No outlines and no cel bands.**
2. **Rounded forms.** Every edge is bevelled and cushions sag and bulge. Silhouettes are smooth.
   It's mid-poly with care spent where the eye goes.
3. **Painted surfaces.** Wood grain, fabric weave, leather, plaster, carpet, tile and brick, with
   colour variation and a little baked shading in the texture. Fabrics carry patterns. Our plan 60
   pattern system is the nearest thing we already have.
4. **People.** Believable, slightly idealised proportions. Smooth skin with soft shading, real
   eyes, brows, lashes and lips, hair as layered textured strands, and clothes with folds and
   seams in their texture.
5. **A warm, natural palette.** Rich but not loud: green lawns, warm wood interiors, a blue sky.
   Saturated where it's lit and calm in the shade.
6. **Living nature.** Leafy trees with real canopies, bushes, flowers and grass tufts on the
   lawn edges.

## Where we are (audit, 2026-11-08)

- **Everything is made by code.** No model or texture file is loaded anywhere: no GLTFLoader,
  KTX2 or Draco. People take ~7.9k lines (lathes, extrusions and swept tubes in
  `chars/shapes.ts`, a 29-joint rig, 133 wardrobe options in recipes). Furniture takes ~37k lines
  (`furn/`, 168+ pieces in `fam/` files). Buildings come from structure (plan 72) and the woods are
  instanced procedural trees. Textures are the ~75 canvas-drawn ones.
- **The look** is Lambert plus the `look/yulit.ts` family (light map, cel, fade), the fog over
  everything (`tp/fog3d.ts`), then the ink pass, bloom (High only) and the finish grade in
  `tp/post3d.ts`. There's no tone mapping in the game: linear goes straight to sRGB.
- **Tied to the body.** Animation (plan 58: 29 joints, foot lock, IK, ragdoll, Flowmotion), sway
  (61: worn things on Jolt), touch (62: seats, desks, drinks, cars), wardrobe (60), swim (66) and
  the hit/shadowed acts all read the body's params (`chars/params.ts`, `moves.ts` THIGH/SHIN).
- **Tools here:** Blender 5.2.3 is installed, so models, UVs and texture bakes can be scripted
  headless (`blender -b -P script.py`) and kept in the repo.
- **Budgets:** page 430 KB, chars chunk 58 KB. Budgets can be raised as needed. Model and texture
  files aren't code, so they don't count against these, but they need a download and GPU-memory
  budget of their own (new).

## The forks (the user's call)

| | Fork | Options | My recommendation |
|---|---|---|---|
| F1 | **How people are made** | (a) **Authored base mesh**: a CC0-licensed human base (the MakeHuman/MPFB lineage; licence verified in phase 0), reshaped in Blender into our own person. It's skinned to **our** 29-joint rig, with body and face sliders as morph targets, fitted clothing meshes, hair strand cards, and painted/baked textures. (b) **Push the procedural people further**: there's a ceiling, with no texture-quality skin, hair or cloth. | **(a)**. Keep the rig, animation, recipes and Jolt hooks, and replace the geometry. |
| F2 | **How things are made** | (a) **Keep the procedural builders and upgrade the kit**: bevels and rounds everywhere, real UVs, and a shared library of generated textures. The 168 pieces' forms already exist. (b) **Re-author in Blender**: no artist, and scripting 168 pieces there is the same work as code but worse to edit. | **(a)** for furniture and buildings; **Blender scripts** for organic things (plants, trees, food, cushions' sag). |
| F3 | **The light model** | (a) three's **Standard (PBR-lite)** materials with light from the sky (an environment map per hour). (b) Keep Lambert and add our own specular. | **(a)**: one model for skin, wood, glass and metal, measured per tier. |
| F4 | **What's left of the cartoon** | Ink and cel go entirely, as in the reference. The "game-ness" left is idealised proportions and the warm palette. | Drop ink and cel. Revisit only if the mocks feel too plain. |
| F5 | **The weakest machine** | Textures, AO and soft shadows cost GPU. Low could keep baked AO only, at reduced texture size. | Low: baked AO + half-size textures. Medium: + soft shadows. High: + screen-space AO + bloom. |

## Phases

### 0 — Mocks (image-first: nothing rolls out before sign-off)

- **0a The light alone.** In the live game with today's models: ink and cel off, Standard
  materials, a tone curve, soft shadows and AO. This shows how much is light and how much is
  models.
  **Built 2026-11-08, awaiting sign-off.** `src/world/look/life-probe.ts` (dev only, `window.__lifeProbe`
  from `WorldView.tsx` behind `NODE_ENV`), stills by `e2e/life-shots.mts` into `design/screens/life/0a/`
  (14 frames × today/life), page https://claude.ai/artifact/D29Vne4zjZRXCgZTAUCHAs. Learned:
  - The `yulit` pieces (light map, fade, fog, snow) only touch chunks Standard shares with Lambert:
    swapping 178 materials in place kept all of them. Phase 2 can change the material model without
    rewriting the lighting.
  - ACES's toe crushes the game's night (values near zero). A shoulder-only curve (Khronos PBR
    Neutral without its toe) plus a gentle S keeps today's darks.
  - The sky environment goes on lit materials only (as `scene.environment` it reached Basic ones:
    signs' clear parts went black) and is scaled by `lmSkyLeft` and the night, or the lot glows at
    midnight.
  - GTAO must read the frame's own depth (`setGBuffer` with the composer's depth texture); its own
    depth pass drew things the view hides and left a black square in the sky.
  - Not measured: frame time and GPU cost. Phase 2 measures them per tier.
- **0b One person.** The base mesh made into our person, one outfit and one hairstyle, skinned to
  the rig, idle and walk, on `/dev/chars` beside today's. Two body types and two skin tones.
  **Built 2026-11-08, awaiting sign-off.** Source data: MakeHuman's `makehuman/data` (sparse clone) and
  the system asset pack, both CC0 1.0 (repo LICENSE.md §C; every pack entry `license: CC0`), kept
  outside the repo in `../yutopia-art-src/`. `tools/art/life/build_person.py` (Blender 5.2, reads the
  data formats itself, no MakeHuman code): macro targets → fitted proxies (clothes, shoes, hair, brows,
  eyes, lashes; skin under clothes deleted) → arms down by LBS with MakeHuman's weights (6° left out,
  taken back at the shoulder by the loader: full rotation pushed the shoulders into pads) → legs
  straight → 163 bones folded onto our 31 → `apps/client/public/life/person-{man,woman}.glb` (6.9 / 6.1
  MB, 41k / 32k tris; untracked). `src/world/look/life-person.ts` rebuilds unturned bones from the
  file's joint places and renumbers skin joints, so Locomotion's poses drive it unchanged.
  `/dev/life` bench (today's people beside, one Locomotion for all, 0a light), stills + loops by
  `e2e/life-bench.mts` → `design/screens/life/0b/`; page https://claude.ai/artifact/6ZQqtecZgUyJr3NuEdgqe8.
  Open: faces stock MakeHuman (need our idealising), no blink/look-at, peaked shoulders, hairline
  edge, heavy lashes on the man, socks under all shoes, skirt not on its spring, size. Texture style:
  painted (decided 2026-11-08, see the top).
  **Faces pass (2026-11-08, the user's "faces first"):** `build_person.py` takes a face recipe of
  MakeHuman's face targets — `IDEAL` (eyes a little larger and more open, no bags, outer corners
  lifted; a finer nose; fuller lips, cupid's bow, corners up; higher cheekbones; oval head, less fat,
  younger; no double chin; smaller ears) plus `MAN_FACE` (firmer chin and jaw, less slimming: the
  shared slimming left him gaunt) and `WOMAN_FACE` (softer narrower chin, finer nose, fuller lips,
  arched brows; eyes back to 0.36 — larger they stared). Brows and lashes recoloured to each person
  (their files are near black) with their faint alpha lifted ×2.4; brows drawn truly see-through,
  lashes by alpha to coverage (see-through, they vanished). Man eyebrow004 + eyelashes01, woman
  eyebrow006 + eyelashes02. Stills `design/screens/life/0b-faces/` (before/after, front/profile).
  **People polish (2026-11-08, "polish the people, more life-sim inspired"; faces and builds kept as
  they are):** the face's shapes from MakeHuman's expression units by ethnic mix — blink (both lids;
  the lashes, fitted on the shaped body + delta, close with them), talk, smile — exported as glTF
  morphs; two eye bones (eyeL/eyeR under the head, life-person.ts EXTRA) turned by the gaze
  (setEyes ±0.38 rad across, ±0.22 up/down); the bench drives blink and look from Locomotion's
  gazeOut like today's people. Hair recoloured to the person (`hair_rgb`, the file's shading kept:
  the ponytail's light roots read pink); scalp and hairline in the hair's colour and a little cheek
  blush as body vertex colours; skin a MeshPhysical with a warm sheen, eyes wet (roughness 0.04),
  hair with a soft shine. Eyes: man bluegreen, woman brownlight; woman brows eyebrow002 (006 drew as
  an outline once its alpha was lifted). Stills `design/screens/life/0b-polish/`. Open: the man's
  boxy shoulders, socks under every shoe, the hair cap's cut edge, skirt spring.
  **His shoulders (2026-11-08, the user: "the shoulders of the man are too big"):** the full
  shoulder-width and deltoid targets, less upper arm; the arms left 9° out in the file (6° before:
  less of the lowering turn, less bunching; life-person.ts ARM_OUT follows), the turn shared further
  into the shoulder (0.7) and collarbone (0.32); his collarbones lowered 7° (`shoulder_slope`: a
  square, high line read broad); his head ~5% larger (head-scale targets 0.18), the life-sim
  proportion. The muscle slider alone barely moved him. Stills `design/screens/life/shoulders-*`.
- **0c Three things.** Sofa, desk + office chair and a potted plant, rebuilt with the upgraded
  kit and texture library v0, on the furniture bench at noon and at night.
  **Built 2026-11-08.** `src/world/look/life-kit.ts`: the painted texture library v0 drawn on
  canvases in code (wood, fabric, floorboards, plaster), every part a rounded box or a stuffed
  cushion (RoundedBoxGeometry, swollen and sagged) with UVs by the world (grain and weave at true
  size), fabric a MeshPhysical with sheen, wood with a light clearcoat; `lifeSofa` (2.1 m, rolled arms,
  three seat and back cushions, two throw pillows), `lifeDesk` (oak, a drawer pedestal, tapered legs,
  laptop, mug, notebook), `lifeChair` (padded, curved back, armrests, five-star base). The plant by
  `tools/art/life/build_plant.py` (a rubber tree: cream pot, three stems, ~33 glossy leaves shaped in
  the mesh, painted midrib; 222 KB). `/dev/life/room` (a corner room: floorboards, plaster, skirting,
  rug; the new woman seated on the sofa by the base motion's sit + `LifePerson.sitDrop`, the man by the
  desk; `?kit=today` the same room with today's models and people; `?hour=22` a floor lamp, a
  ceiling light and the laptop's glow). Stills `design/screens/life/0c/`. Fixed on the way: a negative
  fraction painted whole floorboards black. **Refined 2026-11-08** (the user's "refine the room
  first"): a coffee table (plan-rounded slab, tapered legs, book and mug), a low bookcase of seeded
  books, two painted landscapes in oak frames, a floor lamp standing by day and lit at night, the
  chair's back channel-stitched with a shell behind, a fuller rubber tree (four stems, ~56 leaves);
  the skirt's weights below the hips shared by both thighs and taken off the knees. Stills
  `design/screens/life/0c-refined/`. Open: sat, her thighs still poke through the skirt's hem (needs
  the cloth's collision — phase 5's skirt).
  **More (2026-11-08, "more on the room"):** a window over the desk (the back wall a ShapeGeometry with
  the hole, a thick reveal so the sun comes through a box; painted white frame, glazing bars, oak sill,
  faint glass), the sun moved behind the wall by day so a patch of it falls through the window onto
  the floor (the room in a warmer, stronger sky fill), a painted view outside (sky, treeline, lawn;
  night: deep blue and stars; set low, as the high camera's sight lines land), linen curtains on a rod,
  a round side table with a teal ceramic table lamp (lit at night), tulips in a glass vase on the
  coffee table; the floor lamp to the left corner. Stills `design/screens/life/0c-more/`.
- **0d A corner of the world.** The lobby, the lot, the lawn and one leafy tree, at noon, 17h and
  22h, from the same cameras as the mature study.
  **Built 2026-11-08.** `src/world/look/life-outdoor.ts` (painted asphalt, paving, lawn, plaster; the
  facade: banded plaster, stone plinth, cornice, framed windows with sills — at night some rooms lit —
  no window over the entrance where the name hangs, a glass front with frames under a canopy on two
  columns, the name on a dark board; the ground: lawn either side of the path, short tufts (tall read
  as a meadow) and a flower bed under the windows as instanced crossed cards, smooth bushes (an
  icosphere welded first, or faceted), pavement with joints, a kerb, the lot's bays; lamp posts lit at
  night with short-reach pools; a park bench; a painted sky dome by the hour — clouds, the sun's glow,
  stars). The tree by `tools/art/life/build_tree.py` (trunk, two levels of branches, ~330 leaf cards,
  266 KB). `/dev/life/outside` (`?hour=noon|dusk|night`, `?view=close`; the new man standing, the new
  woman on the bench). Compared with the mature study's `lot-*-today` stills. Stills
  `design/screens/life/0d/`.
- **Sign-off per mock**, then the numbers that set the budgets: download size, GPU memory, frame
  time on High/Medium/Low.

### 1 — The pipeline

`tools/art/` Blender scripts (build, UV, bake AO, export) kept in the repo. glTF with meshopt
geometry and KTX2 (Basis) textures. Loaders (GLTF + KTX2 + meshopt) in a lazy chunk. A cache, a
download budget, a GPU-memory budget, and a load order (near first). Tests that each asset loads,
fits its budget and has its skin weights on our joints.


**Built 2026-11-08.** KTX2 chosen by the user. The encoder is Basis Universal v2.50 (`basisu`, Apache-2.0),
built from source in `../yutopia-art-src/tools/basis_universal` (KTX-Software isn't in Homebrew; the
sandbox won't clone or build outside code, so the user ran that build). The pieces:
- Blender exports with meshopt geometry (`export_meshopt_compression_enable`, EXT_meshopt_compression)
  and PNG textures; `tools/art/life/pack_glb.py` (plain Python) encodes each texture to KTX2 — ETC1S
  for flat painted colour, UASTC (RDO) for the skin's gradients — marks KHR_texture_basisu and lays
  the binary chunk out again; `tools/art/life/build_all.sh` builds and packs everything.
- `tools/decoders.mjs` copies three's Basis transcoder into `public/decoders/basis/` (gitignored; run
  by the client's build, like the emulator cores); meshopt's decoder is bundled from three's addons.
- `src/world/look/life-assets.ts`: `lifeLoader(renderer)` (one GLTFLoader with KTX2 + meshopt, in a
  lazy chunk) and `AssetQueue` (priority — the nearest first — a few at a time, each url once, held
  while used, unheld freed oldest-first past a byte budget; `life-assets.test.ts`, 6 tests).
- `src/world/look/life-budget.test.ts`: every built asset against its budget — download, textures on the
  GPU (from the KTX2 headers, ~1 byte a pixel with mips), triangles, required extensions, a person's
  31 joints and four weights a vertex (skipped when not built).
Measured: a person 5.6 → 1.9 MB to download, textures ~7.7 MB on the GPU (~39 uncompressed), 41k /
32k triangles; the plant and the tree ~0.1 MB each. Budgets: person 2.2 MB / 9.5 MB GPU / 46k tris;
plant 0.3 / 1.5 / 12k; tree 0.4 / 2 / 12k. The benches load the packed files with no loss to see.
Left for the integration phases: the queue wired to the world's people (by distance), a lower level of
detail for far people, a CDN path.

### 2 — The renderer

A tone curve. Standard materials joining the `yulit` family (light map, fade and fog kept; cel
out). An environment map from the sky per hour, cached and disposed (the car PMREM leak from plan
72 is the warning). Soft shadows, AO per tier, bloom kept subtle by day. The ink pass and finish
grade are reworked: the grade stays, the ink goes. Night keeps the lamps' pools and lit windows.

**Steps (planned 2026-11-08, from the 0a probe's lessons):**
- **2.1 One switch, one factory.** `look/look-mode.ts`: the look (`classic` | `life`), read once at
  start from `?look=life` or `localStorage["yutopia:look"]` (no UI; a reload to change). `look/lit.ts`:
  `litMaterial(params)` — exactly today's MeshLambertMaterial in classic, a MeshStandardMaterial
  (rough, not metal; glass smooth) in life — replacing the 106 `new MeshLambertMaterial(` in the world's
  code in one mechanical pass. Classic must stay pixel-identical (A/B stills).
  **Built 2026-11-08:** `look/look-mode.ts`, `look/lit.ts` (`litMaterial`, `lifeMaterials`, `isLit`);
  90 constructors in 22 files replaced (the game's own: grounds3d, build, campus, spot3d, view,
  vehicles3d, tables3d, far3d, grounds-stream, games3d, build3d, arms3d, furn/kit, chessmen3d,
  stand3d, parts/vehicles, parts/mood, god/thing-ghost, furn/pictures, car/fx, car/cars, kart/park3d;
  the stills', sandboxes' and dev pads' left as they are). Classic builds the very same Lambert
  (identical by construction); the world loads in both looks with no page errors; 303/303 tests.
- **2.2 The sky's light.** An environment from the hour's sky (PMREM, made again as the hour moves,
  cached by the hour), on the life materials only (as `scene.environment` it reached unlit ones), its
  strength a shared uniform in the yulit family — lmSkyLeft × the night — so the dark keeps dark.
  **Built 2026-11-08:** `look/life-sky.ts` (LifeSky: a small gradient sky from `Surroundings.domeColours()`
  — the dome as drawn, by the hour, the weather and the fog — PMREM'd again when its colours move, at
  most twice a second; made with the renderer, before any material draws); `lit.ts setLifeEnv` puts it
  on every life material (made ones and those to come) with strength 0.35 × lmSkyLeft × (1 − 0.9·night).
  The view updates it each frame before its render. Noon picks up the sky's fill and sheen; 22h stays as
  dark as classic; unlit signs and windows untouched; no page errors.
- **2.3 The finish.** Post3 in life: the Neutral shoulder + a gentle S, the grade milder, no ink pass;
  GTAO on the frame's own depth on High; bloom as today at night. Medium: the curve, no AO. Low (no
  post): the renderer's own NeutralToneMapping.
  **Built 2026-11-08:** `tp/post3d.ts` in the life look: the ink pass off, `LIFE_FINISH` (the Neutral
  shoulder without its toe, an S of 0.22, colour 1.12, a milder grade and vignette, grain 0.006), and on
  High three's GTAO loaded on its own (`addAO`: the classic look never fetches it) and fed the frame's
  depth; the hands' overlay pass goes after the ink wherever it is. Low and Lowest (no post): the
  renderer's own NeutralToneMapping (set by the view in the life look). Stills on High and Low, no
  page errors. Found: the canopy's name board was only ever the ink's outline round the letters —
  without ink the letters stand alone; the board is phase 7's (buildings).
- **2.4 No cel, no ink on people.** The CEL piece and celShade skipped in life; the people's line meshes
  hidden; their bodies through the factory (today's people, until phase 4's).
  **2.4 built 2026-11-08:** in `view.ts chars()`, the life look's bodies (and the faded ones) are
  `litMaterial` Standard ones on the room's light, lit by the sun, the sky and the lamps; no far-leg
  darkening; `celShade(…, 0)` — the hook stays, as it draws the clothes' patterns, its bands and rim at
  nothing; the line materials (ink, inkAway, shadeInk) a hidden one. Stills of a person at noon and 22h.
- **2.5 Shadows.** The sun's soft (PCF radius) on High and Medium.
  **2.5 built 2026-11-08:** the sun's shadow radius 4 (12 samples) in the life look.
- **2.6 Warm-up and cost.** The warm-up compiles the life programs too; program count, link time and
  frame time per tier measured (tools/frame-cost.mjs), page budget.
  **2.6 measured 2026-11-08** (`e2e/life-cost.mts`, this machine's GPU, the frame stepped with the GPU
  waited on, median ms — run to run the same look varies ±1–2 ms and ±100 draws as people and land
  stream): High studio 9.7 classic / 9.4 life (8.8 without AO), lot 10.9 / 10.8 (10.2); Medium and Low
  within the noise of classic. Programs +2…+10 a tier. GTAO adds exactly 4 draws (its own passes; it
  never renders a depth pass of its own) and ~0.6 ms; its shaders now compile while it loads, already
  on the frame's depth (they were made again each frame the composer's targets swapped). Page 467.2 KB
  (469; unchanged): the life look's code is all in lazy chunks; the probe isn't in the production build.
  Open: the worst frame in the first 4 s after ready is ~30 ms longer in the life look — to trace in 2.7.
- **2.7 Checks.** Classic A/B identical; life stills of the 0a spots; e2e lighting / fog / weather under
  `?look=life`.
  **2.7 checked 2026-11-08.** The first-seconds hitch, traced: with the clock running, a Standard
  material works out GGX for every lamp on every pixel — ~19 lamps in an office put the life frame at
  ~40 ms against classic's ~25. `look/life-lamps.ts` (installed by the view in the life look, before
  anything compiles) has point and spot lamps light diffusely in the physical model (`RE_Direct_Lamp`;
  the sun and the sky keep their sheen; other models unchanged) → life ~20–28 ms against classic ~22–23;
  `life-lamps.test.ts` guards the chunk surgery against a three upgrade. Stills of the 0a spots in both
  looks (`design/screens/life/p2-classic`, `p2-life`, side by side in `p2-compare`): noon, dusk and the
  lobby and studio at night read as classic with the life light — no ink, softer shadows, AO, the
  finish. A trap for later checks: the lot at 22h after the script's jump from noon comes out
  lavender-lit in one run and dark with the lamps' pools in the next, in **either** look (the world's
  pitch-dark state) — compare looks within one run, never across runs. e2e in classic: lighting,
  weather, fog, night, people-3d green but fog.spec:87 (red on the pre-phase-2 code too) and
  night.spec:36 (flaky, green again). In the life look (`playwright.life.config.ts`: localStorage
  `yutopia:look`, on the Metal GPU — Chrome's software GPU stalled the walks past their timeouts): all
  green but fog.spec:87, after one fix — night.spec:144 found the torch's beam on the snow at 0.03 (≥ 0.06
  wanted): drawn straight to the screen, three's NeutralToneMapping put its toe back on the night. So on
  Low and Lowest (no post) too. `look/life-tone.ts`: the finish's toe-less shoulder is now also the
  renderer's (CustomToneMapping, `life-tone.test.ts`), one curve both ways to the screen. 305/305 tests.

### 3 — The material library

Generated, tiling, tintable textures, so furniture colour picks and wardrobe colours still work:
woods (×6), fabric weaves (×6), leather, metals, plaster, wallpaper, tile, carpet, brick,
concrete, asphalt, grass, dirt, bark and leaves. Each comes with a little colour variation and a
roughness map.

**Steps (planned 2026-11-08):**
- **3.1 The list.** `look/life-matlib-list.ts` (data only, shared by the game and the generator): 31
  materials — woods ×6 (oak, walnut, pine, cherry, birch, grey ash) and floorboards ×2, fabrics ×6
  (linen, twill, velvet, bouclé, tweed, herringbone), leather, metals ×3 (brushed, cast, polished),
  plaster, wallpaper ×2 (stripe, damask), tile ×2 (floor, wall), carpet, brick, concrete, asphalt,
  paving, grass, dirt, bark, foliage. Each: metres a repeat, pixels, tintable or not, its default
  colour, roughness, metalness, normal strength, sheen (fabrics) or clearcoat (varnish).
- **3.2 The generator.** `tools/art/life/materials.mts` (Node, no packages): painted, seamlessly
  tiling patterns from periodic noise, cells, bands and bricks — each gives a colour, a height and a
  roughness; from them three maps: **albedo** (sRGB; tintables painted near white so the colour pick
  multiplies through, as today's furniture and wardrobe colours do), **orm** (R crevice shade, G
  roughness, B metal; linear) and **normal** (from the height). PNG → `basisu` → KTX2 (albedo and orm
  ETC1S, normal UASTC), full size and half (Low), into `public/life/mat/` (gitignored; `build_all.sh`).
- **3.3 The runtime.** `look/life-matlib.ts`: `libMaterial(id, { color })` — a Standard material
  (Physical for sheen and clearcoat), its maps 1×1 stand-ins at first so the program never changes
  when the real ones arrive through the asset queue (each texture set loaded once, shared between
  materials; repeat per material from its metres). Tests: every id generated, budgets (download,
  GPU) per texture and for the library.
- **3.4 The swatch board.** `/dev/life/materials`: every material on a sphere, a rounded box and a
  floor tile under the life light, noon and night; a tint row (the tintables in four picked colours).
  Stills by `e2e/life-bench.mts`.
- **3.5 The room again.** `/dev/life/room` dressed from the library instead of phase 0c's canvases —
  the kit and the library together. Sign-off on 3.4–3.5.

**3.1–3.5 built and signed off 2026-11-08.** 32 materials (the list above plus `floor-walnut`).
- The generator paints the whole library in ~10 s and encodes it in ~35 s. It needs no packages:
  it writes its own PNGs and calls `basisu`.
- **Download:** 5.3 MB for the full set (albedo 1.5, orm 0.8, normal 3.1) and 1.5 MB for Low's
  half set.
- **GPU:** ~27 MB with everything loaded. A material loads only when used.
- The normal maps are half the albedo's size. At full size they were four fifths of the download
  (9.7 MB), and the painted relief is soft.
- `life-budget.test.ts` checks every file: built, KTX2, the right size, and within the library's
  budget (6 MB to download, 2 for Low, 64 MB on the GPU).
- `life-assets.ts lifeKTX2` is the one KTX2 loader, shared with the .glb files.
- `libMaterial(id, renderer, { color, half, priority })`: Standard, or Physical for sheen and clear
  coat. It starts on 1×1 stand-ins, so the textures swap in without a recompile. Each id's set loads
  once through the queue and is shared, with its repeat set from `metres`. `userData.loaded` resolves
  when the set is in.
- `/dev/life/materials` (`?family= ?id= ?tint=1 ?hour=22 ?half=1`) puts each material on a ball, a
  rounded block and a tile, with labels. Its stills are in `design/screens/life/p3/` (`e2e/life-bench.mts`,
  `mat-*`).
- The room now draws from the library by default: linen sofa, velvet cushions, tweed chair, oak and
  walnut, brushed steel, the oak floor, plaster and a carpet rug. `?lib=0` gives 0c's canvases.
  Comparisons are in `design/screens/life/p3-compare/`.
- The kit's fabric UVs are now in metres, with v0's cloth at repeat 2, so v0 is unchanged.
- **Tuned on the way:**
  - Woods: grain flatter and finer, pores in two octaves (one octave drew the lattice's blocks,
    embossed like stone), normals 0.2 and floors 0.3.
  - Velvet's sheen keeps more of its own colour; it looked dusty.
  - Leather and cast metal no longer look like camouflage, and tweed's flecks are softer.
  - Plaster's normal is 0.12; at 0.25 the walls looked blotchy from across the room.

### 4 — People I: body and face

Base mesh and morphs mapped from `params.ts` BODY/GENDER. A skin shader (soft wrap light, a hint
of subsurface warmth). Eyes with a wet highlight, brows, lashes, teeth and lips. A blink and the
look-at kept. The plan 58 rig retargeted, and foot lock, IK, ragdoll and Flowmotion grips checked
on the new proportions.

**Decided with the user (2026-11-08):**
- A **neutral** avatar is drawn as the man or the woman, chosen once from their name. There's no
  third, in-between model.
- Until phase 5's clothes, everyone wears their gender's base outfit (0b's) in **their own** top,
  bottom and shoe colours. Hats, glasses, beards and the rest wait for phase 5.

**Steps (planned 2026-11-08):**
- **4.1 The bodies.** `build_person.py --body slim|broad --dump` writes the posed parts and joints of
  each build. The regular build takes them as morph targets `slim` and `broad` on every part, and
  each joint's offset for them goes in the file's extras. Also in the extras: the skin texture's mean
  colour, so the avatar's skin colour can replace it. The outfit's texture is made near white, with a
  top/bottom mask as vertex colour (by what each vertex is weighted to), so their colours tint
  through.
  **4.1 built 2026-11-08.**
  - `build_person.py --body slim|broad --dump F.npz` writes another build's posed parts and joints.
    `--morphs slim=…,broad=…` adds them to the regular build as morph targets on every part.
    `build_all.sh` runs all three for each person.
  - MakeHuman's weight moves a figure little near the average, so the two ends are used: slim
    weight 0.08, broad 0.95, and muscle moved with it. The joints move only a few millimetres; the
    builds differ in girth.
  - The rig node's extras (`life`, JSON) hold `skin_mean` (the skin texture's mean where the body's
    UVs fall) and each body's joint offsets.
  - The outfit and shoes are whitened, their shading kept. The outfit's vertex colour is a top/bottom
    mask: R 1 for the top, by **texture island**. Each garment's pattern piece goes whole to the legs
    or not, even where the mesh is welded. Two other splits failed: weights vertex by vertex sent a
    shirt's tail to the legs, and the texture's brightness sent a dark shirt to the jeans.
  - Man 2.25 MB, woman 2.14 MB packed. The person budget is raised 2.2 → 2.6 MB for the morphs.
  - `/dev/life?bodies=1` shows each person slim, regular and broad (stills
    `design/screens/life/p4/bodies-*`).
- **4.2 The people.** `look/life-people.ts` loads the man and the woman once, through the asset
  queue. Per avatar it gives a ready body:
  - morph weights from `body`, and the rest joints with their offsets;
  - skin by `skin`, hair by `hairColor`;
  - the outfit's top, bottom and shoes in their colours (shared attributes, only the colour its own);
  - an arms-only cut for first person.
  **4.2 built 2026-11-08.**
  - `look/life-people.ts` has `lifeBase` (each file loaded once, its parts renumbered to our bones,
    materials finished), `lifeBody(base, avatar)`, `lifeGender` (neutral by a seed) and `lifeArms`.
    `LifePerson` (the benches) is built on it.
  - Geometry and textures are shared by everyone. Each avatar owns only its materials: skin, hair,
    brows, shoes, and the outfit with an `outfitPiece`. The piece takes the top's and bottom's
    colours by the mask in the shader, so the room's light can go on after it as yulit's `base`.
  - **Skin:** each file's skin texture is now evened out to grey (`build_person.py even_skin`): its
    brightness over its local average, counting the skin's own pixels only. Both people start from a
    light texture.
    - Dividing by the texture's colour mean had failed twice. The woman's dark texture needed ×6–16
      a channel and clamped wrong. Regional hue carried through: a face less red than the body read
      greenish once tinted.
    - The atlas's dark ground, blurred in, lifted the island edges to white.
    - The avatar's skin colour is darkened and saturated a little to read right under the life light
      (more so the lighter it is). Those colours were chosen for today's unlit people.
  - Hair and brows are recoloured by the file's own colours (`hair_rgb`, `brow_rgb` in the extras).
  - Without an avatar, each person keeps 0b's tone.
  - `/dev/life?crowd=8&seed=N` shows `avatarFromSeed` avatars as the game would draw them (stills
    `design/screens/life/p4/crowd-*`).
- **4.3 In the world.** In the life look, `PersonModel` shows a life body on its own bones, the eyes'
  two bones under the head:
  - height, crown, hip height, sit drop, the eye and ear points all from it;
  - `setFace` / `setEyes` drive its shapes and eyes;
  - the view's material states by role: its own when lit, its own faded when away, and one material
    over all of it when shadowed or burning;
  - lit by the room's light (`light.patch`), and neutral → man or woman by a seed from the name.
  **4.3 built 2026-11-09.**
  - `chars/life.ts`: the view sets a life host (`setLifeHost`: its renderer, and how people are lit —
    yulit's `base` the person's own piece, then the room's light) before it makes its `CharFactory`;
    every factory made after draws life people. The life half of the people (`look/life-people.ts`
    and its loaders) loads on first use, out of the chars chunk.
  - `PersonModel` shows a `LifeLook` in the life look: the body's rest joints, the two eye bones under
    the head, and what reaches, seats and first person read (as today's `Baked` gives them). Height,
    crown, hip height, sit drop and the eye are the body's own. The anchors (a hand to the ear, the
    mouth, the chest) are today's person's of the same gender and build, scaled to this one's height
    off the head or the chest: 4.6 checks them on the bench.
  - **The arms:** the file's hang 9° out. The bones are made with the arms turned straight down and the
    parts bound with the shoulders turned back out, so a shoulder at rest holds its arm straight down:
    the clips, the reaches' IK, the ragdoll and Flowmotion need no change (`chars/life.test.ts`).
  - **Materials by role:** each person's parts their own (the tint out on the land and the wading
    line a piece of theirs, as `Person3D.setTint`'s copies give today's people); away, their own
    faded; the shadowed and the burning one material over all, the hair cut by its alpha, the lashes
    and brows hidden. Faded (away, burning), the solid parts go to the depth first: the skin under
    the shirt showed through it.
  - People take no snow layer or a way's wet (the light's default for a solid material): the rain on
    them is the view's.
  - Fixed on the way: the man's hair was `hair_1` in the file (the exporter's duplicate name), so his
    hair colour never applied; the socks are cut off over the trousers' hem (they poked through at the
    shin in the shoes' colour); a skirt keeps them.
  - People in cars get the same name seed. Karts and the car stage's people still draw neutral as
    the man (seed 0): no name there yet.
  - Stills `design/screens/life/p4w/`: the lot, faces close, walking, seated, away, shadowed, burning.
- **4.4 Skin and face.** Skin with a soft wrap of light and a warm hint of light through it (a skin-only
  change to the physical model's light), wet eyes, teeth for talking and smiling, lips.
  **4.4 built 2026-11-09.**
  - **Skin light** (`look/life-people.ts` `SKIN_PIECE`): the skin's own direct light, its diffuse wrapped
    past where the light falls off, the red the farthest (0.46 / 0.22 / 0.15): the shadow side warm,
    not grey. The highlight and sheen are the physical model's; the lamps' diffuse-only light wraps
    too. A skin-only replacement of `RE_Direct` (and `RE_Direct_Lamp`) after three's physical chunk.
  - **Lips and cheeks:** the skin texture keeps its hue relative to its surroundings
    (`build_person.py even_skin`, `SKIN_HUE`): the lips redder than the face round them, no region's
    tone (the 4.2 trap) — the local hue average divided out as the light's is.
  - **Eyes:** a clear coat over a softer eye (wet, a sharp glint; the whole eye a mirror had read
    glassy). The irises are made grey at build time (`grey_iris`: found as the atlas's two dark discs,
    their place in the file's extras) and tinted each person's colour by the seed from their name
    (dark brown, brown, hazel, green, blue, grey, amber, as common as they are: the avatar has no eye
    colour). The bench's are brown.
  - **Teeth and tongue:** MakeHuman's, fitted to the base's own mouth helpers, moved by the mouth's
    shapes; ivory, little of the sky's light, darker the farther back (`mouthPiece`). No shadows cast;
    hidden under the one material (shadowed, burning). +7.6k triangles (the man 48.6k): the person
    budget 46k → 50k (`life-budget.test.ts`); the far level (4.5) has no mouth.
  - Stills `design/screens/life/p44/`.
- **4.5 Detail and cost.** A lighter level of detail per gender (decimated, one material) for far
  people. Draws and triangles for a crowd measured. Portraits (`picture.ts`) and the first-person
  hands.
  **4.5 built 2026-11-09.**
  - **The far person** (`build_person.py`, after the full one: `person-{man,woman}-far.glb`): the body,
    clothes, shoes and hair as one mesh, simplified by Blender (ratio 0.12): the man 4.6k
    triangles (the full one 48.6k), the woman 3.6k, ~140 KB, no textures. Each vertex's colour says
    what it is (R the clothes, 0.5 the bottom and 1 the top; G the shoes; B the hair, on the skin
    the hairline's share); `farPiece` colours it by the avatar. The slim and broad bodies carried
    over from the nearest full vertex. Shown at the game's coarsest level (past 11 m).
  - **Crowd cost** (`/dev/life/crowd`, the game's `PersonModel` path, walking, the sun's shadows; the
    render timed with the GPU waited for, this Mac):

    | people | all near | near to 11 m, far past |
    | --- | --- | --- |
    | 40 | 541 draws, 3.0M tris, 9.0 ms | 253 draws, 1.3M tris, 6.2–6.5 ms |
    | 80 | 1101 draws, 6.2M tris, 15.9 ms | 333 draws, 1.7M tris, 7.4 ms |

    (all far: 40 people 79 draws, 4.5–4.9 ms.) The frame stayed at 60 fps in every run.
  - **Fixed on the way:** the near hair's colour was capped channel by channel (×6), so ginger
    and blonde went grey (since 4.2); it's capped as a whole now (×16).
  - **Portraits:** the HUD's pictures draw the life person in the life look, through a host of
    their own (their renderer, a studio light: a sky, a key, the sky in the eyes) and framed on
    the eyes. The HUD's people hook waits for both person files, since a picture that failed is
    kept as "can't draw". `Face` passes the name, so a neutral avatar's portrait is the same man
    or woman as in the world.
  - **First-person hands:** their own picture had no lights (today's are flat, lit by the light
    map alone): in the life look it takes the room's sky light and its environment, and the sun
    only out on the land (no shadows in it: indoors it lit them through the ceiling).
  - `CharFactory` takes its life host (the view's by default). The life files can be read
    synchronously once in (`lifeBaseNow` / `lifeFarNow`).
  - The people's chunk 57.4 → 58.6 KB (budget 58.5 → 60). The page is 480.6 KB, over its 469 before
    this phase too (none of the life code is on it).
  - Stills `design/screens/life/p45/`.
- **4.6 The rig on the new proportions.** Foot lock, IK reaches, sit drops, the ragdoll, Flowmotion
  grips and the touch fits (seats, desks, drinks) checked: `/dev/anim`, and the people e2e under
  `playwright.life.config.ts`.
  **4.6 built 2026-11-09.**
  - **The legs.** The rig poses one leg (`moves.ts`): thigh = shin = 40.1 cm, the ankle 6.1 cm over the
    sole, the hips 86.3 cm up. Its crouches, steps, seat fits and foot plants are worked out for it.
    The life legs differ: the man's thigh 41.6, shin 43.1, ankle 9.3, hips 93.8 cm; the woman's
    37.3 / 42.8 / 9.2 / 89.1. Threading per-person lengths through the rig (107 uses in 11 files)
    was too wide, so `chars/model.ts fitLeg` fits each life leg after the pose: two-bone IK putting
    the life foot's ball (at the sole) where the rig's is, the foot turned as the rig's, the knee in
    the rig's plane (the knee's angle solved exactly: its joints sit a little off one plane).
    Anchoring under the ankle first sank and dragged the feet: the life ball is 3 cm further on, and
    rolled onto, it dipped. On the ball, flat is a fixed step and push-off the pivot itself; at heel
    strike the heels differ by under a centimetre. Off while limp on the ragdoll (its pose is read off
    the bones). `fitleg.test.ts`.
  - **Checked** on `/dev/anim?look=life` (the bench in the life look; for life people it measures the
    soles' contacts — their joints sit well over the sole, the toe's 4.5 cm) with
    `e2e/life-legs.mts`: over walk, jog, run, crouch, stairs down, sit and get up, kneeling, and
    a jump, for the man and the woman, the life ball is on the rig's in every frame. The only miss
    is 5 mm, mid-air in one of the woman's jump frames. The feet slide only where the rig's do.
  - **The arms** hang straight at rest as the rig's do, each measured: the upper arm turned down
    about the shoulder, the forearm about the elbow, bound back as the file has them. The fixed
    9° (`ARM_OUT`) had left them 7° in, and a phone held to the ear stopped 5 cm short of it.
  - **Reaches** off the face's own landmarks: the mouth and chin off the eyes, the ear off the life
    head's own ear (the widest point of the head on its right, a little under and behind the eyes:
    `lifeEar`). Off the head joint, a sip put the hand over the eye. The IK now lands the wrist on
    the anchor exactly, as today's does.
  - **The people e2e under `playwright.life.config.ts`** (down, first person, third person, use
    things, flowmotion, footing, phone, sway, people 3D): 14 passed and 7 skipped; one failure in the
    long run (sitting on a sofa by Use, `third-person.spec.ts:113`) passed alone, and its whole spec
    passed again (3/3). Classic, with the same Metal flags, passes it too.
  - The people's chunk 59.4 KB (60).
  - Stills `design/screens/life/p46/`: the reaches, the desk, the hang, the climb, kneeling, a fall.
- **4.7 Stills** of people in the world (lobby, studio, lot, faces at talking distance) for sign-off.
  **4.7 built 2026-11-09** — `e2e/life-people-shots.mts` (Bia in the life look, Ana and Cai joining from
  browsers of their own, stood as a three facing in): the lot, the lobby and upstairs (off the spawn:
  floor-4 coordinates are the old roof now) at noon and 22:00, and each face at talking distance (the
  game's renderer, a camera of our own). Stills `design/screens/life/p47/`. Known, for phase 5:
  everyone's in the base hair and outfit; the woman's socks show under her skirt; the hairline's cut
  is ragged at the forehead. The lot by night varies run to run (lit lavender, or dark with lamp pools)
  in both looks: the world's, not the people's.

### 5 — People II: hair and clothes

Hair card sets per style. Clothing meshes per wardrobe category (tops, bottoms, shoes, outerwear,
hats). Plan 60 patterns and second colours become texture overlays. Layering, sway (61), touch fits
(62), swim (66), and the wardrobe picture editor re-pointed.

### 6 — Things

The kit upgrade (bevel, UV, materials) rolled through `fam/` by family: seating, tables, storage,
screens, decor, play, chess, Christmas. Before/after stills for each family.

### 7 — Buildings

Walls with skirting and trim, window frames with depth and sills, doors with panels and handles,
plaster/brick/siding outside, roofs with tiles, and floors in wood/tile/carpet. The campus facade,
lifts and stairs too.

### 8 — Outdoors

Blended terrain textures (grass, dirt, the plan 65 snow layer kept), leafy trees and pines
remodelled, bushes, flowers, grass tufts, textured roads and sidewalks, cars and the plough/bus
remodelled, and the long road (plan 69).

### 9 — Pets

Plan 51's pets in the same look.

### 10 — Pictures

Furnish thumbnails, wardrobe and character pictures, and the minimap's art redrawn from the new
models.

### 11 — Checks

Frame times, draws, heap, GPU memory, load time and download size per tier. Memcheck nightly.
e2e. Before/after stills of every area.

## Rebuilding the assets

The `.glb` files in `apps/client/public/life/` are not in git; the scripts make them again.

1. The source data (CC0 1.0), outside the repo in `../yutopia-art-src/`:
   - `mh/` — a sparse clone of `github.com/makehumancommunity/makehuman`, `makehuman/data` only
     (`git clone --depth 1 --filter=blob:none --sparse …`, then `git sparse-checkout set --skip-checks
     makehuman/data LICENSE.md LICENSE.ASSETS.md`)
   - `sysassets/sys/` — the system asset pack, unzipped
     (`files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip`)
2. The KTX2 encoder: Basis Universal v2_50 built from source into
   `../yutopia-art-src/tools/basis_universal/bin/basisu` (`git clone --depth 1 --branch v2_50
   https://github.com/BinomialLLC/basis_universal.git …`, then `cmake -S … -B …/build -G Ninja
   -DCMAKE_BUILD_TYPE=Release && cmake --build …/build`).
3. Everything at once: `sh tools/art/life/build_all.sh` (builds, then packs with `pack_glb.py`). Or one by
   one, Blender 5.2, headless, from the repo root:
   - `blender -b --factory-startup -P tools/art/life/build_person.py -- --who man --paint` (and
     `--who woman`; without `--paint` the photo textures, `--preview DIR` flat renders)
   - `blender -b --factory-startup -P tools/art/life/build_plant.py`
   - `blender -b --factory-startup -P tools/art/life/build_tree.py`
4. `node tools/decoders.mjs` (the Basis transcoder into `public/decoders`; the client's build runs it).
5. The benches: `/dev/life` (people), `/dev/life/room`, `/dev/life/outside`; stills by
   `node --experimental-strip-types e2e/life-bench.mts [out]` (SHOTS=…); the 0a probe's by
   `e2e/life-shots.mts`, the colour study's by `e2e/mature-shots.mts`.

## Risks

- **The largest plan yet.** It touches nearly every visual file. The rig, animation, physics,
  recipes and data stay, so the game keeps working while the art changes area by area.
- **Download and memory.** Textures are the new cost. KTX2, shared tiling textures and per-tier
  sizes keep it in check; the budgets are set from phase 0's numbers.
- **Weak GPUs.** Low must stay playable: baked AO, no screen-space passes.
- **Program count and compile hitches** (plan 38/71): Standard materials are heavier programs.
  Keep them compiled ahead, as today.
- **Mixed looks during rollout.** A world half old and half new looks broken. Roll out behind a
  dev flag (`?look=life`) until people, things and buildings are all in.

## Open questions

1. Can the night stay as dark as today, now that there's no ink to hold shapes? (Answered by 0d.)
2. Does the HUD (plan 45, walnut and ink) stay as it is? It was made to sit over the stylized
   world.

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

Decided 2026-11-09 (the questions): garments **made by script, CC0 where it fits** (MakeHuman's shoes);
hair **a shell plus strand cards**; rollout **a sample first** (a handful mocked and signed off, then all
of them in batches).

- **5.0 The sample** (built 2026-11-09, for sign-off). Twelve garments — tee, shirt, sweater, tank,
  jeans, shorts, leggings, skirt, long skirt, dress, parka, beanie — the CC0 sneakers and boots, four
  hairs (crop, long, afro, bun) and a beard, the stripes and the plaid. Stills: `e2e/life-bench.mts`
  `SHOTS=w5-…` (`/dev/life?wear=tee,jeans,sneakers,hair-crop|…&pattern=plaid`).
  - **Garments** (`tools/art/life/wear.py`): cut out of MakeHuman's own clothing helpers in the base
    mesh — `helper-tights` (a body suit) and `helper-skirt` (a cone) — shaped by the same sliders,
    weighted to the same bones. A cut is by the body's landmarks: a sleeve's or a leg's length along
    the limb (0 the shoulder or hip, 1 the elbow or knee, 2 the wrist or ankle), a hem or a waistband by
    height, a neckline as a hole round the neck's axis (`neck` below the neck joint, `scoop` lower in
    front) — its edges snapped straight, the shell set off the body by `thick` (`loose` more down the
    legs). A top is thicker than a bottom, so it lies over the waistband; a skirt over a top's hem
    (tucked). A skirt hangs off the hips' own shape round the figure's axis (the tights' outer hull) and
    flares below their widest by `aline`. A hat is the scalp's shell pushed out past the hair.
  - **The skin under them** (`look/life-wear.ts`): the body comes whole; each vertex says what it is
    (`_wear`: kind, along its limb, height; +8 under the file's own outfit; `_neck`), the cut rules ride
    in the extras, and the body's index drops what a worn garment covers (a little inside its edges) —
    one index per outfit, shared. Without the made garments the file's own outfit hides its skin as
    MakeHuman's delete lists did.
  - **Hair, reworked 2026-11-09** (the user: the beard and the long hairs "damn ugly"): the strand cards
    read as planks and ribbons up close. Every style the CC0 pack has is now its authored mesh, fitted
    as the file's own hair is (`wear.py` `hair-long` long01, `hair-short01/03/04`, `hair-bob01/02`,
    `hair-braid`); its afro (a woven cap in the game) left out. The bun stays made — a shell and its
    sphere, no cards. **The beard** is painted, as a life-sim's are: a thin shell over the jaw with its
    own UVs round the face (the body's split the jaw across islands), its texture thousands of strokes
    combed down the face, solid inside, wisps to the edge, blended over the skin (cut out, its soft edge
    went hard without multisampling). Where it grows is a smooth density on the face, not a cut on the
    mesh (its stair-steps showed): under the cheek line, up the sideburn to the brow, back to just before
    the ear (measured round the ears' line — round the head's mean, "before the ear" fell mid-cheek and
    the beard didn't meet the sideburns), round the lips (the moustache over the upper lip), fading under
    the jaw. Lines measured off the man's profile: the lip line at the front teeth, the upper lip's skin
    to +0.085 dm, the nose 0.19 dm in front of the teeth.
  - **Hair, as first made** (`tools/art/life/hair.py`): the scalp above a hairline (by how far round the head) set
    off by the volume (a `dome` for the afro), its edge snapped to the line; strand cards rooted inside
    it, combed back and to the sides (none over the face), let fall, laid on the head and the back (not
    down the front); a bun's sphere pulled to. A beard: the jaw below the mouth's line, the lips left,
    eased to nothing at its edge. Both take the weights and the face's shapes of the skin they grow
    from. Two grey textures (shell streaks; strand clumps cut out by the alpha) the game colours.
  - **The files**: `person-<who>-wear.glb` beside the person (the rig and every `wear-*` part); the
    person's file has the whole body. The other bodies (slim, broad) of a made part are the body's own
    moves at each vertex's source (the dumps' cards would be rooted elsewhere). Exports by collection —
    Blender 5.2's took a rig's children along by selection or visibility alike.
  - **The game**: `lifeBody(base, avatar, worn)`; the garments in the avatar's top, bottom and shoes
    colours, the hair in theirs; a top's pattern (`patternPiece`: off its rest place, it has no UVs).
    Not yet from the avatar: the bench's `?wear=` only (the wardrobe's mapping is 5.5).
  - Known, for after sign-off: from behind a skirt's top is a hard shelf and a long skirt opens at the
    back; a sweater's hem lets the jeans' waistband through at the back; the cloth is flat (no weave yet); the hands
    sink into a flared skirt (the arms hang straight).
- **5.1** The garment pipeline from the sign-off's notes; a cloth weave (the material library's fabric).
  Built 2026-11-09: each garment is drawn in a library cloth (`fabric`: linen, twill for denim and the
  parka, boucle for the sweater and the beanie, tweed for the skirt) under the avatar's colour — its UVs
  made in metres at build time (`wear.py uv_metres`: round each limb by along it, round the body by
  height, a face across the wrap unwrapped), `lifeBody`'s `worn.renderer` taking `libMaterial`.
  Necklines a U (rising 0.6 dm from the neck's axis out to the collar, capped 0.1 dm under the neck
  joint — risen further, the cloth climbed the neck in spikes). A skirt's top off the body's own rows
  (carried up, the seat's bulge stood the waistband off the back); the long skirt flared more (its
  back opened walking). A bottom's waistband thin down past the seat (it came through the sweater at
  the back). Tried and put back: the dress's top to the hips with its skirt from there — slits opened
  at the back of the waist; its small step at the back stays. Left: the bun is a plain shell; two dots
  of the jeans through the shirt's back.
- **5.2** All the wardrobe's tops, bottoms, outerwear, shoes and hats, in batches (stills each).
  Keys by the wardrobe's slot (`top-`, `bottom-`, `outer-`, `shoes-`, `hat-`; the game's colour by it —
  the avatar's top, bottom, outer, shoes or accessory colour). Batch 1, the 19 tops, and batch 2, the 14
  bottoms, built 2026-11-09 (stills `design/screens/life/p52`, `SHOTS=w52-…`). A garment's own pieces
  after its shell, each new vertex going with the body's it grows from: a collar (standing, or standing
  then turned down — down a deep V lying flat on the chest as lapels; only near the neck: where a wide
  neckline crosses the shoulders, spikes), a hood lying on the back, a tie (its own part: the top's second
  colour), a puffer's quilting. V necks by the distance across (`vee`; the body file's `_neck` carries it
  for the skin). Bottoms: `loose`, `cuff`, `pockets`, an overall's `bib`, a skirt's `pleats`.
  **The cut is a slice**: each garment's edge one smooth function on the body (`wear.py signed`: hem,
  waistband, neckline with its hole, sleeves, legs, bib), its helper's faces sliced where it crosses 0, a
  new vertex on each crossing edge, on the surface. Snapping the old edge vertices up or down — then
  scaling them by the body's width — left a hem inside a widening hip (the jeans through the tee on the
  woman's hips), a waistband standing off a narrowing waist, and castellated teeth.
  Budget: the garment file 7 MB (4.81 MB with these; every garment in one file until 5.4 loads what's worn).
  Batch 3 built 2026-11-09: the 7 outer layers (over a top, thicker than any: the parka's hood, the
  coat's and raincoat's skirts to the knee, the puffer quilted, the vest sleeveless), the 11 shoes (the
  CC0 pack's six — lace-ups, casuals, boots, dress shoes, sneakers, runners — whitened for the avatar's
  colour; the others an `alias` of the nearest: high-tops the sneakers, flats and sandals the dress
  shoes, Chelsea and snow boots the boots), the 13 head items (the scalp's shell cut to a cap or a
  band, `strip` over the top, `flaps` over the ears; a `brim`, a `pom`, ear `cups`, a `clip`; `flat`,
  `puff`), kept over any of the hairs (the file's own and the pack's; a band over the top only the
  file's own — past the fullest it floated). Ears found over the neck (the skull's back is widest).
  Left: hats sit high (over the fullest hair); the clip doesn't show; the headphones' band mostly under
  the hair; the shoes' socks take the shoes' colour; sandals are closed shoes for now. 6.27 MB the file.
- **5.3** All the hairs and beards, in batches. Built 2026-11-09 (stills `design/screens/life/p53`,
  `SHOTS=w53-…`). The 25 hairs: nine the CC0 pack's authored ones under the wardrobe's names (short
  short02, long long01, bob bob01, wavy bob02, ponytail ponytail01, braids braid01, pixie short03, slick
  short04, spiky short01; curtain and swept aliases of bob and slick; its afro01 read as a woven cap),
  bald none, and twelve made by `hair.py` with no strand cards: shells whose volume differs over the
  crown and the sides (buzz, crew, fade, an undercut's sharp step), a mohawk's fin down a strip, cornrow
  ridges, curly's bumps, an afro rounded about the scalp's own middle (about the head's mean — low and
  forward — it bulged over the forehead; still a fold there, the hairline highest in front), a bun and a
  topknot's spheres, and tubes let fall — a high ponytail, pigtails (falling free: laid on the head they
  zigzagged), 44 locs combed back. The 7 beards are parts of the full beard's density (moustache,
  goatee — the chin and round the mouth —, chinstrap, muttonchops), boxed shorter, stubble faint.
- **5.4** The avatar's wardrobe (plan 60's options, second colours, patterns) → what's worn. Built
  2026-11-09. `life-wear.ts wornNames(avatar)`: a slot each — top, bottom (none under a dress but
  leggings), outer, shoes, the accessory if it's a hat, hair (bald: none, the file's own dropped), beard
  — the nearest when an option has no garment; `patternOf` the wardrobe's patterns (stripes, plaid,
  check, dots, tweed; trim plain for now) per slot in its second colour. **A file per garment**
  (`public/life/wear-<who>/<name>.glb`, 87 a person, the largest ~0.4 MB; all in one file it grew to
  8 MB): `lifeWornNow(base, avatar)` loads only those worn (once, shared), and PersonModel makes the
  life person once they're in (`base.wearFiles` empty: a file from before phase 5, its own outfit).
  **Layers**: a garment says what each vertex is too (its source's zones), and one under another is
  hidden where that covers it — a bottom under a top or a coat, a top under a coat — further inside the
  covering edge than the skin (0.7 dm: at the skin's 0.35 a gap opened at a tee's hem). The HUD's
  portraits and the editor's option thumbs wait for an avatar's clothes (`pictures().whenReady`) rather
  than keep a picture that couldn't draw.
- **5.5** Sway (61), touch (62), swim (66) with the garments; first person's sleeves. Built 2026-11-09
  (stills `design/screens/life/p55`). The file weights a skirt's hang (a share, the lower the more, up to
  0.4: the thighs keep the rest, so sat it still drapes over the lap) to the `skirt` joint and hair below
  the nape (up to 0.85: short hair has none) to the `hair` joint; a life person declares a spring on
  each its parts hang from (`hangsOn`) and PersonModel swings them as today's (out of the head and the
  chest). First person's sleeves come with no change: `lifeArms` cuts every part to its arm, and the
  body under a sleeve is hidden. Swimming: every garment takes the water line as the body does. Left: a
  long coat's skirt lets a raised knee through; a light spot at a tank's armhole; Jolt's hangs (61's bag
  and ponytail) are today's people's — the life look's swing on springs.
- **5.6** The wardrobe picture editor re-pointed; the far person in the outfit's colours. Built
  2026-11-09 (stills `design/screens/life/p56`). The editor needed only to wait: its turntable gave up
  for the flat drawing the first frame it couldn't draw — in the life look, before the clothes' files
  were in — and now keeps trying there (the drawing only without WebGL); its option thumbs and the HUD's
  portraits wait as 5.4 made them. The far person: a coat's colour over the top, a dress's for the legs
  too, a bald head the skin. Not made yet (not in phase 5's list): eyewear and the extras (scarf, bags,
  earrings, necklace, watch, tie, lanyard, mittens…) — their options change nothing in the life look.
- **5.6b** The glasses and the extras: all 7 eyewear and 14 extras, made by script
  (`tools/art/life/props.py`) and worn in the game by their own slots. Built 2026-11-09 (stills
  `design/screens/life/p57`). Each is tubes, flat straps and rounded boxes placed off the body's own
  landmarks (the eyes, the ears, the neck's base, the shoulders' tops, the wrists, the hands, the waist)
  and laid on its surface round the neck's axis where it rests on it (a strap across the chest, a
  necklace down it, the clothes' thickness under it). Each vertex goes with the body vertex nearest it, so
  a bag rides the back and a watch the wrist. The glasses and each earring go with one vertex whole (point
  by point, the face's moves bent a hoop). Glasses: their fronts bend back round the face. Aviators are
  a teardrop with a top bar; cat-eyes sweep up at the outer corner; half-rims have a top bar and a wire
  below; snow goggles are one wide lens with a band round the head. The lenses are their own `-lens` part
  and drawn dark and glossy. Colours: frames in `eyewearColor`, extras in `extraColor` (`roleOf` gained
  `eyewear` and `extra`); nothing of the skin is hidden under them. A file each in `wear-<who>/` (21 more,
  each well inside the per-garment budget). Fixed on the way: the bun hairstyle had no file since 5.4 —
  its name ends in `-bun`, as its bun piece's does, so the export skipped it; files are now keyed by
  style. Left: bags are rounded boxes (no seams or buckles beyond a flap), a tote's handles go through a
  hanging arm, mittens are smooth eggs (no thumb), and the far person doesn't draw any of them.
- **5.7** Checks: budgets, frame times of a crowd, e2e, stills. Built 2026-11-09 (stills
  `design/screens/life/p57w`).
  - **Budgets.** Every garment, hair and prop file within its own (life-budget.test.ts; 109 files a body,
    ~22 MB on disk for the whole wardrobe, a person loads only what they wear). The people's chunk
    59.4 → 59.8 KB (budget 60 → 62, the standing call). The page 480.7 KB, the same as before phase 5
    (none of the life code is on it; over its 469 since before this plan's phase 4).
  - **Crowd cost** (`/dev/life/crowd`, everyone dressed from `avatarFromSeed`, as 4.5 measured them):

    | people | all near | near to 11 m, far past |
    | --- | --- | --- |
    | 40 | 859 draws, 2.7M tris, 10.1 ms (4.5: 541, 3.0M, 9.0) | 364 draws, 1.2M tris, 6.2 ms (253, 1.3M, 6.2–6.5) |
    | 80 | 1766 draws, 5.5M tris, 17.9 ms (1101, 6.2M, 15.9) | 444 draws, 1.6M tris, 8.0 ms (333, 1.7M, 7.4) |

    (all far: 40 people 79 draws, 4.5 ms.) A garment is a draw of its own (and its shadow's), so draws
    are up ~45–60%; triangles are down (only what's worn). The game's path (near to 11 m) holds 60 fps
    at 80 people; 80 everyone near drops to ~52 fps (19.2 ms frames), past what the game draws.
  - **e2e** in the life look (`playwright.life.config.ts`, `YUTOPIA_GPU=1` for the ones that need it):
    avatar 2, down 1, first person 1, third person 3, use things 2, Flowmotion 3, footing 1, phone 7,
    sway 1, people 3D 1, water 2 — all passed (first person and phone skip one each, as in classic).
    Water's ice step failed once after a failed sway run and passed alone.
  - **Fixed on the way:**
    - Bags didn't swing in the life look. Its people aren't hung on Jolt, and 5.5's springs were hair
      and skirts only. A bag's body is now its own `-bag` piece with a share on the rig's `pack` joint
      (a backpack 0.35, a hip bag 0.75) and a spring on it (`life.ts`). `sway.spec` now expects that in
      the life look, the springs instead of Jolt's hangs, and it passes in both looks.
    - A backpack's or crossbody's straps came through a coat. The extras that lie on the clothes have a
      `coat` shape, the same made 0.45 dm off the tights instead of 0.2 (`props.py COAT`). The game
      weighs it by the thickest top or coat worn (`coatOf`: none to a sweater, a parka ~0.9, a puffer
      1.4).
  - **Stills.** `e2e/life-people-shots.mts DRESS=1` puts Ana, Bia and Cai in the wardrobe for the shots
    and gives them their own looks back after: a blazer in tweed, cat-eyes and a necklace; a parka over a
    hoodie, a beanie, glasses and a backpack; a coat over a long skirt, sunglasses and a crossbody. At the
    lot, the lobby and upstairs, at noon and 22:00, with each face up close.
  - **Left:** hats sit high (a beanie like a bowl); a parka's hood stands so far off at the shoulders
    that a backpack's straps go under it there; a long coat lets a raised knee through; the bags don't
    take the coat's swing; the near crowd's draws (merging a person's garments by material is the next
    lever).

### 6 — Things

The kit upgrade (bevel, UV, materials) rolled through `fam/` by family: seating, tables, storage,
screens, decor, play, chess, Christmas. Before/after stills for each family.

Decided 2026-11-09 (the questions): a part's material **from its paint** (each palette finish maps to a
library material: walnut → walnut, the weave → a fabric, steel → brushed metal), then refined per
family by hand; **rounded and smooth now** (bevelled boxes, smooth shading, cushions that puff and sag),
in the life look only — classic draws as today; **a sample across families first**.

Today every thing is one vertex-coloured, flat-faceted geometry (the kit's `Model`), drawn into the
floor's one triangle soup (`tp/kit3d.ts Out`) under one lit material, merged by area. In the life look
the kit keeps each shape's own smooth normals, rounds its boxes, gives every vertex UVs in metres and its
part's material, and the world draws one bucket a library material (merged by area as today: a room's
draws grow by the materials in it, not by its things).

**Steps (planned 2026-11-09):**
- **6.0 The sample.** The kit in the life look, the world's material buckets, and eight pieces across
  the families — sofa, armchair, task chair, dining table, desk, bookcase, floor lamp, a plant — on a
  new bench `/dev/life/things` (the life light; `?kit=old` today's models under it), noon and night,
  and in the game. Sign-off.
  **6.0 built 2026-11-09** (stills `design/screens/life/p6`: `p6-pair*` today's beside the new, close;
  `p6-sample*` the row by day, by night and turned; `world-*` the sample put on Floor 1 and drawn by the
  game, in the life look and the classic one).
  - **The kit** (`furn/kit.ts`): in the life look (`isLife()`, or `setLifeKit` on a bench) a part keeps
    its shape's own shading, creased at 0.9 rad (`toCreasedNormals`: a cylinder's sides round, a box's
    edges edges). Every box is rounded (8 mm where it asked for none, two segments where it asked for a
    chamfer). Every point has UVs in metres, projected along its face's most-facing axis with u along
    the part's longest way (a turned leg's grain up it, not round it). It also carries its part's
    material (`mat`, an index into `KIT_MATS`). Glows, glass and live parts draw as before.
  - **Materials from paint** (`furn/life-mats.ts`): each palette finish maps to a library material or a
    plain finish (gloss, matte, plain: plastic, ceramic, rubber, paper, leaves). A colour that's a finish
    made lighter or darker (`shade`) is that finish's; the look's picked colour (`Model.fabric`, from
    `Look.fabric`) is cloth (`Model.cloth`, linen by default). A wood carries its own colour, so its paint
    only lightens or darkens it; anything else takes its paint through the texture. A part says
    otherwise with `PartOpts.mat`.
  - **The world** (`tp/build.ts`, `tp/kit3d.ts`): the things' `Out` takes material buckets in the life
    look (`Out(textured)`, a Geo with UVs a material), and `nativeInto` puts each triangle in its own,
    its normals and UVs a corner. The floor makes one material a name (`tp/kit-mats.ts kitMaterial`: the
    library's, vertex colours through it, given the sky's light by `lit.ts adoptLife`), lit and faded
    as `lit` is, and the merge by area carries UVs. A room's draws grow by the materials in it (the
    sample: walnut, oak, cherry, twill, leather, three metals, three plain finishes), not by its things.
    Classic is unchanged (its stills identical by eye; the furniture and world tests pass, 159).
  - **Tuned on the way:**
    - A weave's sheen is a soft grey at 0.3 at most. Vertex colours don't reach it: white washed the
      sofa out.
    - The kit's metals are half metal. All metal, a brass lamp's pole went near black in a room's dim sky.
  - **The bench** `/dev/life/things` (`?kit=old`, `?set=`, `?kind=`, `?hour=22`, `?col=`, `?spin=`), its
    stills by `e2e/life-bench.mts` (`p6-…`). `e2e/life-things-world.mts` puts the sample on Floor 1 as
    Ana (life or classic), shoots it and takes it away.
  - **Size:** the page is unchanged (480.7 KB) and every lazy chunk is within its budget. Every chunk
    together is +22 KB gzip (5640.8 → 5663.2, 273 → 281 files, measured against the last commit in a
    worktree). The kit is already copied into ~15 chunks, and each copy now carries the life code
    (~1.5 KB); the bench page adds the rest. A page loads one or two of those copies.
  - **Left for the families:** books, a chair's mesh back and leaves stay plain (no texture fits); cushions
    puff but don't sag yet; turned and lathed parts keep their facets past the crease (a ball of 8);
    the bench's night lamps throw no shadows.
- **6.1 Seating.** Built 2026-11-09 (stills `design/screens/life/p61`: `pair-<kind>`, today's above the
  new, every look of the kind). 18 kinds, 40 looks: chair, armchair, sofa, loveseat, beanbag, bench, bar
  stool, counter stool, log seat, egg chair, rocking chair, hanging chair, gaming chair, window seat,
  corner sofa, floor cushions, bleachers and hammock.
  - **A family's own colours** (`life-mats.ts finishes`): plan 68's files paint from palettes of their
    own (a file's `C`), not the shared one, so they fell to plain. Each family now registers what its
    colours are. Seating: the egg's teal twill, its shell gloss, macramé's cord bouclé, the gaming chairs'
    red leather, galvanised steel brushed, planks pine, the window seat's cushions linen; the log seat's
    cut face pine.
  - **Cushions are cloth** (the kit's `cushion` marks its geometry): a cushion whose paint is no cloth
    or leather is the look's cloth (a rocker's red pad, a window seat's bolsters).
  - **Cushions sag** in the life look: the sat or leant-on face dips softly in the middle, a little toward
    the front, its rim full (four more cuts across, for the dip to be round).
  - **Moving parts** (a hanging chair, a hammock's cloth, a rocker) are smooth-shaded as the rest. The
    bench draws them now (`liveInto`).
  - Bark from the library, laid along a log seat, read as camouflage: its bark stays its paint.
  - **Left:** moving parts keep their paint (one lit material, no library textures); rattan and wicker
    have no material of their own (plain); books stay plain.
- **6.2 Tables and desks.** Built 2026-11-09 (stills `design/screens/life/p62`: `pair-<kind>`, today's
  above the new). 16 kinds, 31 looks: desk, corner desk, standing desk, meeting table, dining table,
  round table, coffee table, side table, bedside table, nesting tables, high table, folding table,
  drafting table, workbench, reception desk and counter.
  - **A model's own finishes** (`Model.finishes`, first among the paint's guesses, with a tone for a
    wood stained darker than its texture): the black-ash desks are ash stained dark (0.32 the top, 0.22
    the frame), and the cream desk's rust panel is laminate, not the velvet rust is elsewhere.
  - **The tables' colours** (`fam/tables2.ts finishes`): the drafting felt twill, birch, the marble
    gloss, the blueprint paper matte, the steel workbench's grey brushed, the folding table's oak and
    its frame's; the workbench's pegboard matte (in birch it took a grain).
  - **Grain up a face that runs the other way:** a face whose own triangle is three times longer
    across the part than along it takes its grain that way (one slat of a wide, merged slatted front).
  - **Left:** the counters' stone and the marble have no material of their own (gloss, plain); the
    sink's steel reads dark.
- **6.3 Storage.** Built 2026-11-09 (stills `design/screens/life/p63`: `pair-<kind>`, today's beside
  the new). 19 kinds, 31 looks: bookcase, library with its ladder, open shelving, wall shelf, cupboard,
  display cabinet, locker, filing cabinet, plan chest, safe, mail cubbies, tape shelf, cassette rack,
  cartridge shelf, disc tower, record crates, shoe rack, umbrella stand and coat rack. Storage paints
  from the shared palette almost wholly, so the paint mapped most of it as it was.
  - **Painted steel is paint:** the filing cabinet's and the cubbies' grey (`0x8d9296`) is plain. As
    brushed metal it went near black.
  - **The kit's metals are 0.4 metal** (from 0.55): brass reads gold, chrome its grey, in a room's dim
    sky. Every family's metal changes with it (the sample's lamp pole lighter).
  - **Cases are plastic:** a tape shelf's, a disc tower's and a cassette rack's spines are gloss. Their
    colours are cloth elsewhere (rust velvet, olive linen), and a weave on a CD case read wrong. Books
    keep the cloth their colours guess: book cloth.
  - **Left:** glass doors and shelves stay as they were (the kit's glass); a locker's and a safe's
    paint is plain, with no steel under it.
- **6.4 Screens and the desktop.** Built 2026-11-09 (stills `design/screens/life/p64`: `pair-<kind>`,
  today's above the new; `sheet-1…12`, three kinds a sheet). 37 kinds: the TVs (CRT, console, portable,
  wall, HD, giant), projectors, screens and the cinema's, the video wall, the security monitors, the
  outdoor cinema, the radio-TV cabinet, the four consoles, the computer, radio, turntable and coffee
  machine, and the desktop's fifteen (Newton's cradle, globe, fan, snow globe, aquarium, typewriter,
  headphone stand, film camera, walkman, rolodex, pencil cup, hourglass, bonsai, Rubik's cube, the
  Vortex figurine). Mostly plastic, glass and paint: the paint's guesses held, nothing to refine — the
  cabinets' walnut and oak, the turntable's plinth, the radio's case take their grain, the rest is
  smoothed and rounded. The bench's `?near=1` puts the camera low and close for the desktop's.
  - **Left:** the screens' faces are as they were (their pictures, glows); the ceiling projector hangs
    out of the bench's view.
- **6.5 Decor, lights and plants.** Built 2026-11-09 (stills `design/screens/life/p65`: `pair-<kind>`,
  today's above the new; `sheet-1…24`, three kinds a sheet). 70 kinds: plants and the indoor tree,
  dividers, columns, vases, sculpture, terrarium, trophies, books, the hanging plant and the moss wall,
  the aquarium, the stove, the fountains, the fireplace and the lava lamp; the lamps, the lamp post,
  the ceiling lights, fairy and festoon lights, the chandelier, lanterns, the Edison cluster, the
  banker's lamp, the salt lamp, candles, the uplighter, track lights, neon and the signs; the rugs,
  the cowhide, the puzzle mat, the welcome mat, the dance floor, the stage's riser and steps, floor tape
  and decals; the walls' boards, whiteboard, notice board, panels, clocks, posters, the switch,
  frames, the cuckoo clock, the world clocks, calendar, thermostat, the members' map, the pegboard,
  the skateboard, framed records, the tapestry, the mirror, the antlers, the exit sign, the fire alarm
  and the guitar hooks.
  - **A model of one material** (`Model.only`): the rugs and the welcome mat are carpet (the library's,
    tinted by their colours: added to the kit's list), the cowhide and the foam mats matte. The hide's
    brown had taken walnut.
  - **A model of paint** (`Model.paint`): a frame's picture, a poster, the members' map, the framed
    records, the world clocks — no part cloth by its colour (a painting's stripes had taken a weave).
  - The frosted-glass divider's panes are gloss: their pale grey read as brushed metal.
  - **Left:** the ceiling lights hang out of the bench's view; the plants' leaves stay plain (no leaf
    texture fits the kit's flat leaves); the lamp post's dark steel reads near black.
- **6.6 Kitchen, music, office.** Built 2026-11-09 (stills `design/screens/life/p66`: `pair-<kind>`,
  today's above the new; `sheet-1…13`). 39 kinds: the kitchen's island, stove, sink, dishwasher, café
  counter, ice-cream freezer, fridge, microwave, fruit bowl, toaster and kettle; music's drum kit, amp,
  DJ booth, synth, karaoke, gong, theremin, metronome, piano, mixing desk, speaker and mic stand; the
  office's mobile whiteboard, punch clock, tube station, shredder, plotter, drinks fridge, security
  desk, extinguisher, first-aid cabinet, sorting desk, printer, phone booth, water cooler, vending
  machine, server rack and terminal.
  - **The kitchen's colours** (`fam/kitchen.ts finishes`): the butcher block oak, steel brushed, copper
    polished, marble, enamel, ceramic, tile and the cabinets' glass gloss, terrazzo and bread matte, the
    shaker cabinets' paint plain.
  - Music and the office paint from the shared palette and held: the pianos' walnut and black ash, the
    speaker's veneer, the steel fridge's brushed front.
  - **Left:** the glass of the drinks fridges and the freezer's lids is the kit's glass as it was.
- **6.7 Play: games, chess, parkour, pets.** Built 2026-11-09 (stills `design/screens/life/p67`:
  `pair-<kind>`, today's above the new; `sheet-1…16`). 47 kinds: the game room's air hockey, foosball,
  dartboard, chess table, wizard chess, pinball, claw machine, jukebox, skee-ball, card table and
  cornhole; the pool and ping-pong tables, the arcade cabinet, the slot-car track; the parkour's rails,
  walls, poles, vault box, beam, monkey bars, climbing wall, trampoline, quarter pipe, zip line, cargo
  net and tyre run; the pets' bed, bowls, scratching post, house, toy box, cat tree, agility jump,
  tunnel and poles, ball launcher, litter box, pet door, feeder, bird cage, hamster wheel and sofa.
  - **The parkour's colours** (`fam/parkour2.ts finishes`): beech birch, the vault box's leather, the
    foam, concrete, mats, rope and rubber matte, galvanised steel brushed, the timbers oak, the ply
    birch, the climbing wall's grey panels paint (as brushed metal they went dark).
  - **The cat tree's carpet is carpet** (its sisal matte), and the pet house is paint (its orange roof
    and green walls had taken cloth).
  - **Left:** the pool table draws from its own model (`tp/pooltable3d.ts`), not the kit: its felt is as
    it was; the card tables' felt reads as velvet.
- **6.8 Christmas, seasons, outdoors.** Built 2026-11-09 (stills `design/screens/life/p68`:
  `pair-<kind>`, today's above the new; `sheet-1…13`). 37 kinds: the pumpkins, the jack-o'-lantern,
  the leaf garland, bunting and paper chains; the fire pit, log seat, picnic table, bike rack, bus
  shelter, mailbox, street sign, flag pole, ski rack, snowman, bird feeder and patio heater; the
  Christmas trees, presents, stockings, wreath, garland, mistletoe, cocoa station, gingerbread house,
  village, nutcracker, candle arch, poinsettia, advent calendar, wrapping table, candy cane, reindeer,
  sleigh, inflatable snowman and snow globe.
  - **Their colours** (`fam/seasons.ts`, `fam/outdoors.ts`, `xmas.ts` `finishes`): the gourds, leaves,
    flags and the sleighs' paint plain (their reds and oranges were velvet and linen elsewhere), straw,
    twine, snow, stone, ash, kraft paper and gingerbread matte, the baubles' gold and silver polished,
    galvanised steel brushed, the logs' bark its paint, their hearts oak; the stockings knitted
    (`only("boucle")`).
  - **A metal matches only its own colour** (a scale of 0.8–1.2 of it): snow, white paint and pale
    glass a little lighter than aluminium had read as brushed metal (the snowmen went grey).
  - **A wood is drawn as light as its paint** (`woodTone`: the paint's luminance over the texture's
    mean): a dark-brown part matched to a lighter wood came out lighter than it was painted (a log
    seat's bark through another family's timber). The signed-off families' woods are as they were, to
    the eye (the sample's desk and table checked side by side).
- **6.9 Checks.** Draws and triangles a room, frame times by tier, memory, budgets, e2e, stills.
  Built 2026-11-09 (stills `design/screens/life/p69`: the furnished room, life and classic, High and Low).
  - **A furnished room** (`e2e/life-things-room.mts`): 40 of the kit's things across every family put
    on Floor 1 as Ana, the scene's own render counted (its shadows in it), its frames timed over 240,
    then taken away; `EMPTY=1` the room as it is. The things' own share, High:

    | | classic | life (first) | life (now) |
    | --- | --- | --- | --- |
    | draws | +56 | +140 | +140 |
    | triangles | +0.30M | +0.92M | +0.34M |

    The whole view: life 2530 draws, 3.91M triangles, 16.7 ms frames (classic 2430, 3.75M, 16.7); Low
    2394 draws, 2.60M. Every run held 60 fps on this Mac (the frame is the display's, not the scene's).
    Memory: 512 textures (classic 441: the library's maps), 308 programs (259), the JS heap ~1.0 GB
    (classic ~0.9; the dev server's).
  - **Fixed: rounding by size.** Rounding every box (two segments, 300 triangles where a box is 12)
    made the room's things three times today's triangles; the 40 models 299k against classic's 122k (a
    fireplace's bricks 34k, a crate's record sleeves 34k, a bookcase's books 20k). Now a box that asked
    for no rounding is rounded only when it's 15 cm or more and 4 cm through (one segment to 30 cm, two
    past it); one that asked for a bevel takes two segments from 30 cm. The 40 models 182k (1.5× classic),
    the room's things +0.34M (classic +0.30M). Books and bricks stay crisp boxes; the sample unchanged to
    the eye.
  - **The draws:** a thing's parts are a draw a material in its area (merged), so a room of mixed
    things draws ~2.5× today's for its things (+140 against +56 here); the scene's total +4%.
  - **Budgets:** the page 480.7 KB (unchanged), every lazy chunk within its own, every chunk together
    5633 KB gzip in 278 files.
  - **e2e** in the life look (`playwright.life.config.ts`, `YUTOPIA_GPU=1`): use things 2, third person
    3, build 1 (+1 skipped, as classic), build tools 1, the wall sofa's menu 3, games 5 — all passed.
    `pets-home` fails in classic too (the pets' known flakiness: not this phase).
  - **Fixed: build mode's ghost** (`tp/build3d.ts`) drew only the lit bucket — empty in the life look,
    where the things are in their materials' — so nothing showed where a thing would go (third
    person's "build mode places, picks up and moves" failed): it draws every bucket now.
  - **Left:** the draws (merging a room's materials across areas, or an atlas, would bring them down);
    moving parts and the pool table keep their paint; the Kart Park's own pieces (`tp/kart/park3d.ts`, its own
    Out) draw smooth but untextured.

### 7 — Buildings

Walls with skirting and trim, window frames with depth and sills, doors with panels and handles,
plaster/brick/siding outside, roofs with tiles, and floors in wood/tile/carpet. The campus facade,
lifts and stairs too.

Decided 2026-11-09 (the questions): walls take the **library's textures on today's shapes, the trims
kept** (skirting, dado rail, cap as geometry; brick's modelled courses become the brick texture and its
relief map); floors are **the library's materials under today's baked shading** (the ambient occlusion,
thresholds and strips the bake paints, over oak and walnut boards, tile, carpet, concrete, asphalt);
**the first sample takes in the outside** (the campus facade's cladding, the pitched roofs' tiles). The
doors and windows are the kit's (`furn/openings.ts`): phase 6 gave them their materials already.

**Steps (planned 2026-11-09):**
- **7.0 The sample.** Walls of each material, the floors of each, the campus facade and a roof, in the
  game, the life look; `?build=old` the buildings as they were under the same light. Stills, sign-off.
  - **Built 2026-11-09** (`look-mode.ts isLifeBuild`: the life look and no `build=old`).
    - **Walls** (`furn/walls-native.ts`): walnut trims and panels → walnut, the creams and mortar → plaster,
      brick → brick (its courses no longer plates: the texture and its relief), foam and cork → matte; a
      wood's and a brick's paint only lightens or darkens the texture (`tone`), the others tint it. Faces
      into `Out.mat` buckets with UVs in metres (`Geo.quadUV`); a walnut face's grain along its longer side
      (a panel's boards stand up). `walls3d.ts turnOut` runs a piece's UVs on from where it sits along its
      line — drawn each from its own start, a plaster wall showed the same stain every piece, a seam
      between.
    - **Floors** (`build.ts bakeFloor`): oak `.`, walnut `~`, carpet `,` `:`, tile `_` the library's, under
      the bake: it bakes a flat fill (`FloorBake` `fill`) and the material multiplies it in through its own
      UVs (`kit-mats.ts floorMaterial`, a `bakeUv` piece); a chunk's runs split by material into groups.
      The lot's asphalt and concrete stay painted (their snow and wet), the grate `x` too.
    - **Roofs**: slate (`roof-slate`, new in the library: eight courses of four, half bond) on the slopes,
      plaster on the gables, concrete on a flat one; UVs along the eaves and up the slope.
    - **The campus facade**: the clad wall's painting kept, the concrete's relief and roughness over it
      (`kit-mats.ts libRelief`) once its textures are in.
    - **Found and fixed:** the snow's layer (`wx3d.ts`) took "facing up" from the normal-mapped normal — a
      plaster wall's relief turned pixels past it, a camouflage of frost on an outdoor wall; it reads the
      surface's own now (`nonPerturbedNormal`).
    - **Left:** the `_` floor's painted checker shows under the tile's grout; the plaster's own mottling
      reads as soft stains on a big plain wall; the facade's relief is faint past a few metres.
    - Stills: `e2e/life-shots.mts` (`LOOK=life` / `LOOK=life&build=old`, lobby, studio, corner) and
      `e2e/life-hut.mts` (a hut of brick, plaster and walnut under a gable on the lot, taken away after).
- **7.1 Walls.** Every kind across the world: plaster with its dado, walnut, foam, brick, cork, glass, a
  half wall, a bowed one, posts, the ceiling.
  - **Built 2026-11-09.** The walls' own materials were all mapped in 7.0 (foam and cork a matte finish:
    the library has neither); what was left painted was the **ceiling** — the library's plaster now
    (`kit-mats.ts surfaceMaterial`, its UVs in metres across the floor), tinted as it was.
    - **The plaster calmed** (`tools/art/life/materials.mts`): its mottle and trowel sweeps ±3% in tone
      read as stains over a whole wall and a ceiling; ±1% now, the sweeps' relief kept in the normal.
      (Not the compression: the source had the same shapes; not the roughness either — tried.)
    - **A walnut face's grain up it only when it's tall** (over 0.9 m): a bowed wall's narrow pieces of
      skirting and dado had turned theirs up.
    - Stills: `e2e/life-walls.mts` — a row of each kind on Floor 1 as Ana, by day and at 22:00, in the
      life look and `build=old`, taken away after; the lobby, studio and live room by `life-shots.mts`.
  - **Left:** a bowed wall's pieces show thin seams of light between them (as they did before); the `_`
    floor's checker under the tile's grout (7.2).
- **7.2 Floors, mezzanines, stairs, lifts.**
  - **Built 2026-11-09.**
    - **The cream tile `_`**: the bake paints its checker as two flat tones a tile each (`FloorBake`
      `fill` takes a pair), and the library's tile is a metre (its UVs × 0.6: `FLOOR_LIB`'s third), its
      grout on the checker's squares — the painted grout and veins under the library's had made a plaid.
    - **Mezzanines** (`build.ts buildDecks`): their floor's library material, tinted its fill, through the
      extrusion's own UVs (plan metres on the top, up the edge).
    - **The stairwell** (`stairs3d.ts`): its flights, landings and soffits the library's concrete; a box's
      UVs in metres, each face its own size — a tall step's side had stretched the painted concrete up it.
    - **The lifts** stay as they were: their veined stone, brushed steel and mirror are their own painted
      PBR (the library has no stone), their walnut a thin rail.
    - Stills: `e2e/life-decks.mts` (a mezzanine of each floor's material on Floor 1, taken away after);
      `life-shots.mts` spots `lifts` and `stairs`.
  - **Left:** the grate `x` floor and the lot's asphalt and concrete painted (7.3, 8); a tile mezzanine
    one tone (no checker); the lift cars untouched.
- **7.3 Outside: facades, roofs, the campus.** Decided 2026-11-09: the campus and the Grounds' town both;
  the town's paintings (siding, corrugated metal) kept, the library's relief and sheen over them, as the
  facade in 7.0.
  - **Built 2026-11-09.**
    - **The campus's stone** (`campus.ts`): the main block's and the blocks' caps, coping and window trims
      the library's concrete (`kit-mats.ts libDress`: albedo, relief, roughness; the colour a tone over
      the material's own mean, `tintOver`/`LIB_MEAN`), their quads' UVs in metres on their own plane
      (`G.metres`); the colour also the hour's base (`setDay` tints from `tinted`).
    - **The town's walls** (`grounds3d.ts relief`): siding the wood's relief (pine, a repeat a building's UV
      unit: 3 or 4 m), the shed's corrugated metal the brushed metal's. **Brick** the library's own in its
      painted colour a shade down (`libDress` with `tint`) — the painting's 19 cm courses and 50 cm bricks
      can't meet the library's relief (as 7.0's walls).
    - **The town's roofs** (`pitched`): their slopes the library's slate, a mesh of their own a building,
      UVs along the eave and up the slope; the roof's colour its tone (`tintOver`). Under the winter's
      snow (its pieces on the slopes) only the eaves show; bare, the slates.
    - Stills: `e2e/life-town.mts` (Main Street, the houses, the church, the barn, a brick front, the roofs;
      `BARE=1` holds the snow off — `__wxLayer.hold`); `life-shots.mts` lot and corner.
  - **Left:** the barn's gable ends' siding has 0–1 UVs (stretched relief, faint); the bridge, the
    canopy, gates and posts as they were; the siding's relief is faint by nature (its boards are painted).
- **7.4 Checks.** Draws, triangles and memory by floor, frame times, budgets, e2e, stills.
  - **Done 2026-11-09.**
    - **Cost** (`e2e/life-build-cost.mts`, High, noon, the camera held; life against `build=old`, both
      under the life light, a shower falling): draws +10 (lobby), +36 (Floor 1), +68 (studio), +61 (lot),
      +21 (town); triangles within ±5% (the studio 4.63M against 4.83M: brick's course plates gone);
      textures +15…19, geometries +190, programs +4. Frame times the same within the noise (both
      ~21–28 ms with the shower's; Floor 1 life 16.9 against 28.6 old in that run).
    - **Budgets:** the page 480.7 KB, unchanged (over its 469 since before phase 4). The Grounds' marker
      chunk went 92.1 → 214.0 KB (over 205) with phase 7: the campus (7.0), the stairwell (7.2) and the
      Grounds (7.3) importing `tp/kit-mats.ts` moved light3d out of its own 14 KB chunk into the two
      chunks the stairwell is in (the game's view's and the bench's), the land's blocks with it — every
      chunk together +53 KB. **Fixed:** they reach the library through hooks kit-mats fills as it loads
      (`tp/life-dress.ts`, its `on` the look) and import none of it: 196.2 KB, every chunk together +30 KB
      (light3d still in the stairwell's two chunks — the bundler's, whatever they import; one a page).
      Measured against `1dd3cab`'s build in a worktree.
    - **e2e** in the life look (`playwright.life.config.ts`, `YUTOPIA_GPU=1`): build 1 (+1 skipped),
      build tools 1, wall building 2, wall faces 3, doors and windows 1 (+3 skipped), map edit 1, one
      building 3, the town 1, the weather 2 — all passed. Client tests 197, tsc clean.
    - Stills after the hooks: the town's slate and brick, the stairwell's concrete, as signed off.

### 8 — Outdoors

Blended terrain textures (grass, dirt, the plan 65 snow layer kept), leafy trees and pines
remodelled, bushes, flowers, grass tufts, textured roads and sidewalks, cars and the plough/bus
remodelled, and the long road (plan 69).

Decided 2026-11-09 (the user: the whole phase without sign-offs; the calls mine, on the decisions
already made): the ground keeps its paintings (a road's verges and tracks, a pavement's joints, the
snow's layer and its green) with the library's relief and roughness under them, laid by where they are
(their own UVs are a quad each); the trees keep the woods' one material and pools — new shapes, their
leaves and needles cards from a small atlas on it; bushes, tufts and flowers the 0d mock's; the cars,
plough and bus smoothed in clearcoat paint, chrome and glass. `?out=old`: the outdoors as they were.

**Steps:** 8.0 the ground · 8.1 trees · 8.2 bushes, tufts, flowers · 8.3 cars, the plough, the bus ·
8.4 the long road · 8.5 checks.

- **8.0 The ground.** Built 2026-11-09 (`look-mode.ts isLifeOut`).
  - **Underfoot** (`kit-mats.ts groundRelief`, through the Grounds' per-material hook
    `userData.grounds`, after a road's cover): the library's normal and roughness by world position on
    up-facing faces (`nonPerturbedNormal`'s up: the snow's own test untouched). Each road's asphalt and
    the lanes' road the library's asphalt; pavements and flags the concrete's (the paving's joints made a
    second grid over the painted ones); trails the dirt's; the lot's `a` and `c` floors (World3's bake,
    their own groups now) asphalt and concrete.
  - **The green** (the snow's layer, `wx3d.ts`): its detail the library's grass (`wxGrass`), over its
    own mean (`wxGrassMean`, 0.12 for the library's; the canvas's 0.82).
  - **Left:** the land's own relief (under the snow most of the year); the lot's cover and the banks.
  - **Found in 8.1:** the snow's grain reads the green's detail — the library's blades, deeper than the
    canvas's, came through the snow as dark specks: their light and dark at 0.45 (`wxGrassK`); and at the
    canvas's 14 m a repeat they smeared into streaks: the library's own 2 m (`wxGrassM`).
- **8.1 Trees.** Built 2026-11-09 (`tp/life-trees.ts`).
  - **The woods' material keeps its pools, wind, fade, rime and snow**: an atlas on it (`treeAtlas`:
    its left half white, a leaf cluster, a needle spray, grey — their colour the vertices'), cut out by
    alpha, both sides; what isn't a card reads the white (`solidUV` on every pool's geometry but the
    cards'); the cards' shadows cut out too (`lifeTreeDepth`, the snow's press kept).
  - **A leafy tree** (`lifeLeafyGeometry`) in the birch's and the bare tree's places (one bare snag in
    three kept): a trunk curving up in five pieces, five to seven limbs, two twigs each, a dark core
    and 22 leaf cards round every tip, lit as the crown's outside (their normals out from its middle),
    lighter up top; ~1.3–1.7k triangles.
  - **A pine** (`lifePineGeometry`): today's tiers, cones and snow, with drooping boughs of needles
    round each tier's rim — the silhouette ragged.
  - **The campus's own woods** (its ring of conifers, the groves, the lawn's trees) the same, through
    the hooks (`lifeDress.trees`: life-trees registers as it loads, with the Grounds' stream).
  - Stills: `e2e/life-cam.mts` (a free camera held at given spots; `BARE=1` holds the snow off);
    `life-shots.mts` spots `woods`, `edge`.
  - **Left:** the far trees (the long road's hundred thousand) keep their cheap shapes; the woods'
    floor (shrubs, logs, stones) as it was.
- **8.2 Bushes, tufts, flowers.** Built 2026-11-09.
  - **The atlas** a grass sprite more (blades fanning up from the foot, no spine: the needles' spray
    made tufts read as little firs): white, leaves, needles, grass.
  - **The woods' floor**: its shrubs bushes (`lifeBushGeometry`: today's lumps under 46 leaf cards).
  - **The town's gardens** (`grounds3d.ts housePlants`, through the hooks): a flower bed of two rows
    along each side of every house in one of five colours, a bush at each front corner, tufts along the
    back and about the yard (`lifePlantsGeometry`: crossed cards, a ball of them for a bush). Their
    material (`plantMaterial`) the atlas's, no snow dusted on them: each vertex knows its plant's foot
    (`foot`) and they lie down into it as the snow comes (`wxSnow` 0.2–0.55) — gone under it in winter.
  - **Left:** the campus's lawns and the Grounds' wider meadows unplanted (their land is the layer's
    green); the shops' planters.
- **8.3 Cars, the plough, the bus.** Built 2026-11-09.
  - The drivable sedan (`tp/car/sedan.ts`) was already the look's: clearcoat paint, chrome, glass,
    cloth and carpet — kept.
  - **Paint** (`look/lit.ts paintMaterial`): the bus's, the plough's and the visitors' cars' one body
    material and the parked cars' far models' a clearcoat (0.6) over a satin base (0.42), the sky in it;
    smooth (the Grounds' faceting off for them).
  - **The bus and the plough** (`tp/vehicles3d.ts`): every panel a rounded box (`RoundedBoxGeometry`, its
    radius by its size); their wheels, hubs and the bus's rails round (28, 20, 16 sides).
  - Stills: `e2e/life-vehicles.mts` (the camera on each vehicle as it drives).
  - **Left:** the far cars' and the visitors' shapes (the campus's `carGeometry`, bevelled already) as
    they were.
- **8.4 The long road.** Checked 2026-11-09: its districts are the Grounds' (their ways, woods,
  buildings and gardens draw as 8.0–8.3 made them) — the shed by the road at x 4175 among leafy trees and
  bough pines, Silver Lake's boathouse in its slate. `e2e/life-cam.mts` takes its targets' heights over
  where I stand now (the road climbs to Hawk Pass). No code of its own.
  - **Left:** the far land (`tp/far3d.ts`: the hundred thousand far trees, the mountains' faces) as it was.
- **8.5 Checks.** Done 2026-11-09.
  - **Cost** (`e2e/life-build-cost.mts`, High, noon; life against `life&out=old`): outdoors the lot +176
    draws and +0.61M triangles (the trees' and the gardens' cards; the campus's woods ring it), the town
    +19 and +0.25M; frame times +2 ms (lot) and +4.5 ms (town) in that run, indoors the same within the
    noise. Geometries, textures and programs within the run-to-run spread.
  - **Budgets:** the page 480.7 KB, unchanged; every lazy chunk within its own (the Grounds' marker
    171.1 KB); every chunk together +30 KB on phase 7 (the trees, the plants, the ground's relief, the
    paint, RoundedBoxGeometry).
  - **e2e** in the life look: the Grounds 4 (+1 skipped), the town 1, the weather 2, the day 2, the water
    2 — passed; the car 1 of 3: "a lot car driven out" fails in the classic look too (known), "a parked car
    knocked" passed alone (flaky under the two browsers' load after the one before it). Client tests and
    tsc clean.

### 9 — Pets

Plan 51's pets in the same look.

Built 2026-11-09 (the whole phase without sign-offs; `look-mode.ts isLifePets`, `?pets=old` as they were).
- **No ink, no bands** (`art/pets3d.ts`): in the life look a pet's parts are a physical material —
  rough (0.86), a sheen a paler version of its colour along its edges (the coat's rim, in place of the
  toon ramp's and the rim light's); the dark of its eyes, nose and mouth wet (clearcoat 1, roughness
  0.28). No outlines (`outline` drawn nothing), no rim patch.
- **Fur** (`furPiece`): a fine bump and a little tone from noise in each part's own space (it moves with
  the pet: in the world's it slid across a walking one), stretched along the part; as furry as the
  species' outline fuzz was (a rabbit most, a platypus sleek, a parrot's feathers 0.35); gone where it's
  finer than a pixel (it glittered on a parrot's head). Kept through the room's light: `Light3.patch`
  puts a material's own piece (`userData.base`) first, as World3's floors do.
- **The HUD's pictures** (`art/pets-render.ts`) draw with a renderer of their own: the game's sky isn't
  theirs to sample — none there.
- Stills: `e2e/life-pets.mts` (every species adopted three at a time as Ana in the lobby, framed, let go).
- **Checks:** the pets' chunk 26.3 → 27.1 KB (budget 40); the page unchanged. e2e in the life look:
  pets-wheel, pets-stay, pets-explore, pets-car passed; pets passed on its second run (its first: the
  panel's element not found in time). Client tests 315, tsc clean.
- **Left:** their shapes (plan 14's soft primitives) as they were; the panel's turntable and the HUD's
  pictures redrawn in phase 10.

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

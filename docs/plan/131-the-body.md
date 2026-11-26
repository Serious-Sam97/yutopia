# Plan 131 — The body (the people's model itself)

Asked 2026-11-26:

> Novo ticket
>
> Melhorar modelo dos personagens
>
> Por agora nao vamos focar em cabelo ou roupas, somente no modelo dos chars
> Esse ticket vai ser misterioso pois eu quero que tu investigue o que temos para assim a gente saber como podemos melhorar

Not hair, not clothes: the body and face underneath them. This file is the investigation first; the proposal and
its forks follow from it.

Status: **investigated 2026-11-26; forks partly decided 2026-11-26:**
- **F1b — the Blender Studio mesh** (chosen 2026-11-26 after phase 0b's side-by-side: the white man, GTA V);
- **F2 — seed + editor + premade faces**: everyone different from their seed, editable in the editor, and a set of
  authored faces to start from, for both men and women;
- **F3a** young, middle-aged and old;
- **F4a** full surface maps (anatomy normal, pores, AO/cavity, roughness, a sharper face);
- **F5a** clavicles that follow the arm by themselves, upper-arm twists, and corrective shape keys (shoulder,
  elbow, knee, hip), with no clip changed;
- **F6b** the 0c sample signed off, then every phase built straight through with stills at each end;
- **F7a** MakeHuman as the hidden cage: its targets become shape keys; garments, hair and props are still made
  from it;
- **F8a** GTA V, grounded;
- **F9a** the base level (~21k body triangles, about today's), the sculpt baked into the normal map;
- **F10a** MakeHuman's photo skins projected through the cage;
- **F11b** the man first; the woman by the same path after his sign-off.

Next: **phase 0c**, one sample (the white man, GTA V) built the new way end to end.

 Stills: `design/screens/life/p131/` (bench line-ups in shorts,
faces, a walk) and `design/screens/life/p131/poses/` (stress poses on `/dev/anim?look=life`, tank top + shorts).
Scripts: `apps/client/e2e/zz-body131.mts`, `apps/client/e2e/zz-pose131.mts`.

## What there is today

The pipeline (plans 73, 74, 76, 78):

- `tools/art/life/build_person.py` (Blender headless) reads the **MakeHuman** data (CC0, in
  `../yutopia-art-src/mh` and `sysassets`): its base mesh, macro targets (gender, age, muscle, weight, height,
  proportions, a race mix), some face targets, the default skeleton's 163 bones and weights, and one skin texture.
- It bakes **one man and one woman**: `person-{man,woman}-painted.glb`, plus a far mesh each.
- Arms are brought down from MakeHuman's A-pose to our rest pose with linear blend skinning, legs hung
  straight, fingers closed.
- The 163 bones are **folded onto our 31 joints** (`chars/rig.ts`) plus 28 extras (eyes, finger knuckles,
  forearm twists) — 59 in the skin.
- In the game, `look/life-people.ts` + `chars/life.ts` build bones from the joint places, tint the grey skin
  texture to the avatar's skin colour, and drive everything with our own clips.

What one person is (measured from the files):

| | |
|---|---|
| body mesh | 14.5k vertices, **26.7k triangles** — MakeHuman's base as is, no subdivision |
| whole person in shorts | 39–48k triangles (teeth alone 7.1k, more than both hands) |
| skin textures | **one 1024² colour map** for the whole body (the face gets a small corner of it). **No normal, roughness, AO or cavity maps** |
| skin shading | `MeshPhysicalMaterial` with a constant roughness 0.52 + sheen, and a wrap-diffuse "skin" light |
| morphs | 5: `blink`, `talk`, `smile`, `slim`, `broad` |
| what the avatar can change in the body | gender (picks the man or the woman), body slim / regular / broad, skin colour, eye tint |

## What's wrong (from the stills)

### 1. There are only two people in the world

Every masculine avatar is **the same man**, every feminine avatar **the same woman**: the same face, the same
height (1.75 m, 1.70 m), the same proportions. The only differences are skin colour, eye tint, and a body preset.
Side by side the three presets barely differ, mostly for the man (`p131/man-front.png`).

MakeHuman has far more than we use: about 1,300 targets (42 nose, 44 mouth, 68 eyes, 27 head, 15 chin, 16 cheek,
44 ears, 140 arms/legs, 228 breast, 40 measures…), ages from young to old, and 18 age-and-ethnicity skins. We use
"young", one skin and about 30 face targets fixed into the two faces.

### 2. The surface reads as a mannequin

- With one 1024 colour map and no normal map, the skin is smooth plastic: no pores, no creases, no hint of the
  anatomy underneath (`p131/man-torso.png`). Up close the face is soft and blurry (`p131/man-face.png`).
- The mesh itself is low on form. Plan 74's "everyday" targets turned down muscle, V-shape, pectorals, tone and
  limb muscle all together, so the man's chest, back and arms are a soft tube. You can't see collarbones, a
  sternum, shoulder blades or ribs. The nipples are flat dots of paint.
- Lighting has no ambient occlusion on the person: no cavity dark in the ears, nostrils, eye sockets or armpits,
  or between the fingers.

### 3. Visible defects

- **A light stripe straight down the spine** on every body (`p131/man-back.png`): the skin texture's back seam,
  most likely from `even_skin`'s blur crossing the UV seam.
- **A reddish rim along the jaw and the neck** (`p131/man-face.png`), where the face's vertex colours or the neck
  zone meet the body.
- Plan 74 tuned the slim and broad bodies away from "bodybuilder", and that went too far: all three now read as
  one build.

### 4. The shoulders and joints fold badly

- The **clavicle and the breast are folded into the chest**, the upper-arm twist into the shoulder, and the pelvis
  into the hips. Skinning is plain linear blend, with no corrective shapes.
- With the arms raised (`poses/masculine-hang.png`), the shoulders flatten into pads, the armpit caves in, and the
  trapezius bunches by the neck. This happens in every overhead pose: hanging, climbing, reloading high, cheering.
- The rest pose's arms were themselves skinned down from the A-pose. The shoulder starts out already squeezed,
  which is why `ARM_OUT` is a 9° compromise.

### 5. Proportions and age

- The man reads as a teenager. The causes: the "young" macro, the head enlarged ×1.18 (`MAN_FACE`), the shoulder
  span cut twice (`measure-shoulder-dist-decr` 1.0 + 0.6), a 7° shoulder slope, and the eased muscle. The woman
  reads closer to an adult.
- No one is middle-aged or old, though MakeHuman has both targets and skins for them.

### 6. The face moves very little

Only blink, talk and smile exist. There's no brow raise, frown, squint, jaw shift, pout or surprise. MakeHuman has
34 expression units per ethnicity (`targets/expression/units/`).

## Where it could go

**A — push MakeHuman (keep the base, use far more of it).** Its topology and targets are what make variety
possible: every person a mix of morphs. Steps, roughly in order of value per effort:

1. **Fix the defects**: the spine stripe, the jaw rim, and the three bodies made distinct again.
2. **Surface maps**: a baked normal map for anatomy (bake from a once-subdivided body with muscle/definition
   targets on), a tiling micro-normal for pores, a baked AO/cavity map, a roughness map (oilier T-zone, lips), the
   face at 2048 or in its own atlas. That's the biggest "plastic → real" change for the cost: textures, not
   triangles.
3. **Variety as runtime morphs**: about 12–20 face shape morphs (jaw, chin, nose, cheeks, brows, eyes, lips,
   ears), age (young / middle / old, with their skins' detail), height by scaling the bones, and body as two axes
   (weight × muscle) instead of three presets. All of it comes from the avatar's seed, so everyone is different,
   and can later be edited in the wardrobe editor. Three's morph texture handles that many morphs on 15k vertices.
4. **Shoulders and joints**: clavicle bones put back and driven automatically from the arm's elevation (no clip
   changes), an upper-arm twist, and corrective shapes driven by joint angles for shoulder up, elbow, knee and
   hip flex.
5. **Proportions** retuned toward an adult (head size, shoulder span, slope, some muscle back on the man).
6. **More expressions** from MakeHuman's units (brows up/down, frown, squint, jaw, pout, surprise) for the face
   during acts and talk.
7. **Budget**: the teeth decimated (7.1k → ~1k). Optionally the near body subdivided once (~54k triangles) with
   the current mesh as the mid LOD, if the silhouette still reads blocky after the maps.

**B — a new base mesh** (e.g. Blender Studio's CC0 *Human Base Meshes*): better topology and form, but no rig,
weights, targets or skin. We would rebuild everything plans 73–78 made, and lose MakeHuman's variety unless we
transferred its targets across. That's a big job, and the risk is losing what works today (hands, legs fitted to
the rig, clothes, hair).

**C — licensed finished characters** (Sketchfab CC-BY and similar): each one is a fixed person with its own rig.
That means no variety, and the clothes and hair systems would have to be refitted to each one. Not recommended.

**A+B — MakeHuman for shape, a sculpt for detail.** MakeHuman stays the mesh the game skins and morphs, so
variety, the rig, the clothes and the hair stay as they are. Blender Studio's CC0 realistic body is fitted over
the MakeHuman mesh in Blender (shrinkwrap plus a multires sculpt pass), and its form is baked into our normal and
AO maps. We keep MakeHuman's variety and borrow the anatomy of a sculpted body as texture. The risk is that the
bake follows one build: on slim or broad bodies, the baked muscles may not match the morphed shape.
(Blender Studio's bundle: 17 meshes, CC0, quads, UVs, multires-ready, **no rig**:
https://wiki.blender.org/features/asset_system/asset_bundles/human_base_meshes/)

Recommendation: **A**, in the order above, with A+B's bake as a sample in phase 0 beside A's own bake (from a
subdivided MakeHuman body with its definition targets on). Mocked first on `/dev/life`.

## The forks

(Asked one by one: see Status once answered.)

- **F1 — the base.** a) push MakeHuman (A) · b) a new base mesh (B) · c) A now, B studied later.
- **F2 — variety.** a) every person different from their seed (face, age, height, two-axis body) and editable in
  the editor · b) from the seed only, no editor · c) a handful of authored faces per gender.
- **F3 — ages.** a) young, middle-aged and old · b) adults young to middle only · c) young only, as now.
- **F4 — surface.** a) baked normal + AO + roughness + pores, a sharper face · b) the defects fixed only.
- **F5 — shoulders and joints.** a) clavicles + twist + correctives · b) clavicles only · c) leave them.
- **F6 — how we work.** a) mocks of each phase with sign-off · b) one mock round, then built through with no
  sign-offs.

## Phase 0 — nine mocks: three bases × three looks (2026-11-26)

The user, after the investigation: "I think the quality of the models we have is really low". They asked for
nine examples: today's, MakeHuman pushed and the Blender Studio base, each aimed at Sims 4, inZOI and GTA V.

Sheets: `design/screens/life/p131/mocks/sheet-{body,face-man,face-woman}.png` (rows the bases, columns the
looks); the 27 stills beside them. Bench `/dev/life/p131?base=today|mh|bs&look=sims4|inzoi|gtav&view=body|face&who=`
(debug: `&debug=albedo|normal|std`, `&relief=`, `&pores=`, `&nmap=0`). Everyone is under the same light: the
bench's, which is the life look's. Hair is off and they wear shorts (and a top on the woman). The figures are
static and stand at rest.

| | how it was made | triangles (near) |
|---|---|---|
| **today** | the game's files as they are. Only the skin's finish changes by look (roughness, highlight, sheen, pores) | body ~27k |
| **MakeHuman pushed** | `build_person.py --look <l> --bare` (each look's macro sliders, face targets, age, and its MakeHuman skin of that age and ancestry at 2048, evened by region) → `mock131.py mh`: subdivided once, definition baked from a firmer twin (+0.3 muscle), AO baked into the skin | body ~107k |
| **Blender Studio** | `mock131.py bs`: the CC0 realistic body; UDIM tiles packed into one atlas; normal + AO baked from its level-3 sculpt onto level 1; arms brought down by weights along each arm; the skin, lips, brows and eyes painted by code per look; Sims 4 a 10% larger head, inZOI legs 4% longer | body ~87k |

What the mocks show:
- **Today:** changing only the skin finish barely moves it. The mesh and the 1024 texture are the ceiling.
- **MakeHuman pushed:** the photo skin at 2048 and the AO read better, and the looks' shapes differ clearly (the
  inZOI man tall and V-shaped, GTA V older). But the faces still read as generic MakeHuman, and the bald scalps
  show the skin texture's painted hairline.
- **Blender Studio:** clearly the best form: the face's bones, eyelids, nose, lips, ears and the body's anatomy.
  It wins even with a skin painted by code, and it has no lashes and no real brows yet. Its body is an
  athlete's, so everyday builds would come from MakeHuman's targets carried across.

Traps found:
- **A baked texture's colour space.** A normal map or AO baked into an sRGB image is bent by the bake; use
  Non-Color.
- **The glTF exporter and baked images.** It wrote a baked, unsaved image as plain white; save the image to PNG
  and load it back first (`on_disk`).
- **WebP drops colour under alpha 0.** Baked maps must be opaque.
- **Bone heat weighting** failed on the Blender Studio body; the arms are weighted by distance along each arm
  instead.
- **zsh doesn't word-split** `set -- $j`.

## Phase 0b — MakeHuman pushed vs Blender Studio: the white man, GTA V (2026-11-26)

The user narrowed the comparison to the white man and the GTA V look, MakeHuman pushed against Blender Studio.
They asked for face, body and detail comparisons, and for the Blender Studio bodies, which read as "really
strange", to be fixed.

Sheets: `design/screens/life/p131/pair/sheet-{rosto,corpo,detalhes}.png`. Stills `pair/{mh,bs}-<shot>.png`.
Script `e2e/zz-pair131.mts`. Bench `/dev/life/p131?base=…&look=gtav&who=man&shot=face|face3q|profile|body|body3q|side|back|torso|shoulders|hands|feet`.

Fixes to the Blender Studio body:
- **A real rig.** Trunk, clavicles, upper arms, forearms, hands, thighs, shins and feet, weighted by bone heat on
  the mesh scaled ×10 (at true size the heat solve fails). It is posed by linear blend in numpy:
  - the clavicle takes 18% of the arm's turn and the shoulder takes the rest, so no deltoid lumps;
  - the forearm runs along the upper arm, bent a little forward;
  - the legs hang from the hips with the feet under them.
- **The skin's tone.** Blender byte images hold their pixels sRGB-encoded, so the earlier "linear" tones came out
  dark and orange. The GTA V man now uses MakeHuman's middle-aged light skin's median (0.84, 0.68, 0.57), with
  the same iris colour as MakeHuman's.

The MakeHuman man's skin is now raw (`MOCK_RAW_SKIN=1`): `even_regions` left blocky patches across UV seams on
the back.

What the pair shows:
- **The Blender Studio sculpt is clearly better** in the face's bones, the ears, the back, the shoulders, the
  hands and the feet.
- **MakeHuman** still has its lashes and a photo skin, but its face is generic and its forms are soft.
- **Blender Studio still lacks** lashes and real brows (they are painted), and its skin is painted by code. Its
  build is an athlete's, so everyday builds would come from MakeHuman's targets carried across.

## The build on the Blender Studio mesh (after F1b)

### The idea: MakeHuman stays, hidden, as the cage

Everything plans 73–78 built keeps working off MakeHuman's topology:
- the targets (face, age, weight, muscle, height);
- the 163 bones' weights and the joint places;
- the helpers that `wear.py`, `hair.py` and `props.py` cut garments, hair and props from;
- the eyes', lashes', brows', teeth' and tongue's proxies.

So MakeHuman isn't thrown away. It's **wrapped onto the Blender Studio surface** and becomes an invisible cage:

1. **The wrap.** MakeHuman's base, in our rest pose, is fitted onto Blender Studio's body, which is posed the same
   way (phase 0b's rig):
   - landmarks pin it first: eye and mouth corners, nose tip, chin, ears, nipples, navel, joints, fingertips,
     toes;
   - a shrinkwrap with smoothing then closes it onto the surface;
   - helpers and proxies follow, as they already follow the body.
2. **The skin rides the cage.** The Blender Studio mesh is bound to the wrapped MakeHuman (surface deform: each
   vertex held in the cage's nearest faces). Each MakeHuman target, applied to the cage, becomes a **shape key on
   the Blender Studio mesh**: faces, age, weight × muscle, height, the slim/broad bodies, blink/talk/smile and
   more expressions.
3. **Weights and joints** come from the wrapped cage onto the Blender Studio vertices, folded to our joints as
   today (plus clavicles and twists: F5).
4. **The skin texture.** MakeHuman's photo skins for each age and ancestry (2048) are projected through the cage
   onto Blender Studio's UVs: real lips, nipples, knuckles and pores in colour. The sculpt's normal and AO maps,
   a pores detail and a roughness map go on top (F4a).
5. **Garments, hair and props** keep being made by `wear.py`/`hair.py`/`props.py` from the wrapped helpers. They
   fit the Blender Studio surface because the cage now has its shape. Whatever shows through gets a fitting
   pass.

### Phases (refined after the forks)

| # | phase | done when |
|---|---|---|
| 0c | **one sample**: the white man, GTA V, built the new way end to end (wrap, shape keys, projected skin, lashes and brows), in the game's rig, on `/dev/life` idle and walking | stills beside phase 0b's; signed off |
| 1 | the build tool `tools/art/life/build_bs.py`: both bodies, atlas (head given more texels), bakes, wrap, binding, weights | `person-*-bs.glb` loads in `/dev/life` |
| 2 | the rig: our joints plus clavicles, upper-arm twists and correctives (F5) | `/dev/anim?look=life` stress poses (hang, aim, crouch, sit) hold their shape |
| 3 | variety: the face and body shape keys, ages, height; the avatar's new fields, made from the seed; premade faces per gender (F2) | a crowd where no two people look alike |
| 4 | the skin: projected photo skins by age and ancestry, normal, AO, pores, roughness; eyes, lashes, brows | close-ups side by side with phase 0b |
| 5 | garments, hair, beards and props refitted on the new body | every outfit on the bench, no skin through cloth |
| 6 | the editor: face and body sliders, premade faces | edited in the wardrobe editor |
| 7 | the game: far person, LODs, budgets, memcheck, frame cost (M1 Low) | measured within the people's budget |
| 8 | checks: the e2e near people, the known reds | as plan 77's checks |

## Forks (the build)

- **F5 — shoulders and joints.** a) clavicles + upper-arm twist + correctives · b) clavicles only · c) as today.
- **F6 — how we work.** a) the 0c sample signed off, then each phase with stills and a sign-off · b) 0c signed
  off, then built straight through with no sign-offs, stills at the end.
- **F7 — variety.** a) MakeHuman as the hidden cage (its targets become shape keys) · b) shape keys sculpted by
  us from scratch.
- **F8 — the look aimed at.** a) GTA V (grounded, as tested) · b) inZOI (idealised) · c) Sims 4 (soft).
- **F9 — near detail.** a) Blender Studio's base level (~21k body triangles, about today's) with the sculpt
  baked into the normal map · b) one level up (~85k) for close views, the base level as the mid LOD.
- **F10 — skin texture.** a) MakeHuman's photo skins projected through the cage · b) painted by code (phase 0's)
  · c) CC0 photo-scanned skins downloaded.
- **F11 — both bodies.** a) the man and the woman together · b) the man first, the woman after his sign-off.

## Phase 0c — the sample: the white man, GTA V, built the new way (2026-11-26)

`tools/art/life/build_bs.py` (Blender, ~1 min) takes a MakeHuman look scene
(`build_person.py --look gtav --bare --tex 2048 --blend …`) and the Blender Studio bundle, and writes
`public/life/person-man-bs.glb`. That file is in the game's own format (the rig's 59 joints, the parts, the
blink/talk/smile shapes, the extras), so `LifePerson` loads it unchanged: `/dev/life?style=bs`. Stills are in
`design/screens/life/p131/0c/` (`sheet-0c.png`), made by `e2e/zz-bs131.mts` and `e2e/zz-sheet0c.mts`.

What the build does:
1. **The body.** UDIM tiles are packed into one atlas. The level-3 sculpt is baked as a normal map onto the base
   level (~10.6k quads, 21k triangles, F9a); texels tipped more than ~55° are flattened, because the bake runs
   wild between the fingers. AO comes from the base level alone, with every other mesh hidden from the render
   (the overlapping copies black out every ray). The body is scaled to the MakeHuman person's height.
2. **The pose.** A small rig (trunk, clavicles, arms, hands, legs) is weighted by bone heat at ×10. Each limb is
   turned onto MakeHuman's own limb line, with the clavicle taking 18% of the arm's turn. The feet go back onto
   the floor, and the eyes with them.
3. **The cage**, fitted in three passes:
   - per-joint moves blended by MakeHuman's weights;
   - the face by 11 landmarks (eyes, nose tip, lips, chin, crown, nape, ears, cheeks) with a biharmonic RBF;
   - six shrink-wrap steps toward the nearest surface facing the same way (a ray along the normal otherwise).
     A vertex with no fair target takes its neighbours' moves, filled in harmonically.
4. **Carried across** by each new vertex's nearest point on the wrapped cage:
   - **Weights.** Arm joints are kept off the trunk and leg/hip joints off the arms, using the new body's own
     rig, and each side's joints stay on its own side.
   - **Shapes.** The mouth's shapes are read lip by lip, across the slit found on the mesh (the deepest midline
     point between the lips).
   - **Parts and joints.** Teeth and tongue move with the cage. Brows and lashes sit relative to the eyes, the
     brows at the sculpt's brow height and snapped onto the skin. The eyes are Blender Studio's own, with a
     painted iris, on the eye joints. The rig's joints move with the cage.
5. **The skin.** Each texel finds its nearest same-facing point on the wrapped cage and reads MakeHuman's photo
   skin there, after the skin's regional tone is evened by its own wide neighbourhood. Holes are filled from
   around, thin specks (a lid's or the mouth's inside) are cleaned out, AO darkens it, and the shorts are painted
   on (no garment yet).

The person is 31k triangles in all (today's man: 48k).

Traps found:
- **A triangulated bmesh keeps stale face indices** until `faces.index_update()`. The BVH hands back
  `face.index`, so weights and UVs came from the wrong triangles.
- **A selected-to-active AO bake** onto a base level that sits centimetres off its sculpt leaves black holes.
  So does any bake with the sculpt's copies still in the render.
- **Nearest-point projection near a hanging hand** reads the hand. Check the normals, and fall back to a ray
  along them.

Left for the build (known in the sample):
- **The thumb** is posed differently from MakeHuman's (it isn't aligned before the wrap), so it folds wrongly
  when the hand closes. At the base level the hand also reads blocky. Phase 2: align each finger before the
  wrap; perhaps one subdivision level on the hands and head only.
- **Blink** closes the lids only half way (MakeHuman's lid move on another lid shape): the new lids need their
  own blink.
- **Talking** leaves the mouth corners a little jagged.
- **Painted brows** are heavy and dark, and the lower lashes are sparse.
- **The ears** show a few dark specks inside.
- **The shorts** are painted, with stepped edges (phase 5 fits real garments).

0c, the user's note (2026-11-26): "talking, the mouth looks really strange". MakeHuman's open mouth carried onto
another lip's shape never read right (the upper lip dragged down, or the two lips' insides swapped). Talking is
now **a jaw made on the new mesh** (`jaw_move` in build_bs.py):
- **The turn:** 10° at full talk, about a hinge just in front of and under the ears.
- **What goes with the jaw:** everything under the line from the hinge to the lips' slit (the slit is
  `BS_LM.mouth`: the lips meet ~8 mm behind their front, over a mouth bag), with a soft edge for the corners and
  the neck under the chin taking part.
- **Inside the bag:** a vertex whose normal meets the cavity's far wall within 6 cm is inside. The roof and the
  upper lip's inside face down and stay; the floor and the lower lip's inside face up and go.
- **The upper lip** lifts 1.8 mm.
- **The lower teeth and the tongue** turn with the jaw by the share MakeHuman's talk moved them (the tongue at
  55%). They are seated by this mouth: the upper incisors 11 mm behind the lips' front, their edge at the slit.

## Phase 1 — the build tool (2026-11-26, built straight through after 0c's sign-off)

- **The face's texels.** The head's UV islands are drawn ×1.6 before the atlas pack (`BS_HEAD_UV`).
- **Slim and broad.** MakeHuman's twin builds (`--body slim|broad` with the look) give their bodies' moves from
  the regular one, carried across through the cage as the `slim`/`broad` shapes (up to ~1.8 cm). Their joints'
  offsets go into the extras' `bodies` in glTF axes, as build_person.py's dumps did, so `LifePerson.setBody`
  works unchanged.
- **Blinking on this lid.** Each lid turns about the eyeball's centre: the margin moves all the way to where the
  lids meet (30% up from the lower margin's angle), fading over ~7.5 mm and to nothing at the eye's corners. The
  lashes ride the same turn. The brows lost MakeHuman's blink, which tore their cards.
- **Texture budget.** The skin's colour is 2048 and its relief 1024; the mouth's textures are 256, and the brows,
  lashes and eyes 512. Packed with pack_glb.py: 1.65 MB, within the person budget (the look tests: 86 pass).
- **build_all.sh** builds the man's three MakeHuman scenes and the new person when the bundle is there
  (`$BS_BUNDLE`).
- **The game:** `?body=bs` (development only, `look-mode.ts bodySuffix`) draws the men on the new body.
  `e2e/life-people-shots.mts` takes `BODY=bs`; stills are in `design/screens/life/p131/game/`.

Seen in the world (for later phases):
- The new file carries no wardrobe yet, so the men stand in the painted shorts (phase 5).
- A crawling man's arm smeared in streaks: extreme poses (phase 2's rig).

## Phase 2 — the rig (done, 2026-11-26)

2a built:
- **The cage's fingers aligned before the wrap.** The new hand's far end is clustered into five fingertips
  (k-means seeded by farthest points) and matched to MakeHuman's five by direction (the best of 120
  permutations). Each MakeHuman finger is turned and sized (0.8–1.25) about its base by its chain's weights.
  The thumb no longer folds through the palm at rest.
- **Carried weights smoothed** over the new body's own edges (three passes), the arm/leg masks applied again
  after. This removes lone spikes, such as the one at the wrist.

Left in phase 2:
- **The hand library.** Plan 78's thumb aims and curls are tuned to MakeHuman's thumb, and in the walk swing the
  far hand's thumb still crumples. Retune `chars/hands.ts` against the new rest pose, using
  `e2e/hand-report.mts` with `?body=bs`.
- **Clavicles.** These would be extra bones driven by the arm's elevation in LifeLook, with shoulder correctives
  baked as pose-space shapes in build_bs.py.
- **Upper-arm twists, and elbow, knee and hip correctives.**
- **Stress poses** on `/dev/anim` once it can take `?body=bs`.

2b–2d built:
- **Limb shares from the new body's own heat weights.** How much of each vertex is the left arm, the right arm,
  each leg or the trunk comes from bone heat on the Blender Studio body; within each limb, the joints follow the
  cage's proportions. Where the cage has none, the limb's main joint takes it. This replaced the masks. The
  flank under a raised arm no longer tears into spikes.
- **Correctives (F5a): `cShoulder`, `cElbow`, `cHip`, `cKnee` for each side.** Each joint is bent hard
  (shoulder raised 150°, elbow 130°, hip 100°, knee 130°) by linear blend skinning. A delta mush of that pose is
  the target: the deformed body smoothed, then the rest body's detail laid back on in each vertex's frame. The
  difference is stored back in the rest pose (each vertex's skinning matrix undone), within a radius of the
  joint. `chars/life.ts correctiveDriver` sets each weight from its joint's bend, measured in `onBeforeRender`,
  after every pose and reach. No clip changed and no bone was added (the "clavicle" is the shoulder
  corrective).
- **Stress poses on the game's own rig** (`/dev/anim?look=life&body=bs`, `e2e/zz-pose131.mts BODY=bs`,
  `design/screens/life/p131/poses-bs2/`): knees and the crouch hold their volume, the raised arms no longer tear,
  and walking hands, fists and texting are fine. The thumb that crumpled in the walk was the plain bench's
  (`/dev/life` poses without the hand library), not the game's.

Left over:
- AO baked at rest darkens the armpit's skin when an arm is raised.
- No upper-arm twist bone (the forearm's from plan 78 is kept).
- (fix) The correctives' inverse (each vertex's skinning matrix undone) was nearly singular half way round a
  150° turn and threw vertices tens of centimetres. It is now a damped least-squares inverse, each move capped
  at 3 cm. three's `computeBoundingBox` grows by every shape's reach, so `loadLifeBase` takes the person's top
  from the rest positions alone (it read 2.18 m).

## Phase 3 — variety (2026-11-26)

- **Face axes.** 22 shapes `f…`, each half MakeHuman's "incr" target less half its "decr", read straight from
  the .target files and carried through the cage: nose width, length, hump, tip, nostrils; jaw width; chin
  out and height; cheekbones; cheek fullness; eye size, tilt and openness; brow height and angle; mouth
  width; upper and lower lip; face fat; head length; ear size and ear out.
- **Age and firmness.** `old` (MakeHuman's old targets at 0.85 against the man's 0.18: `--look gtav-old`) and
  `muscle` (the firmer twin, +0.3). The old shape moves up to 5.7 cm (height loss included).
- **The shapes are smoothed** over the new mesh (four passes), because a vertex deep in a nostril tore.
- **Parts follow:**
  - the brows and lashes by their nearest skin vertex;
  - the eyes by their socket's ring (with size for `fEyeSize`), since an old face left the eyeballs out of the
    lids;
  - the teeth and tongue by the mouth's ring, since they came through the nose.
- **From the seed.** `life-people.ts faceGenes(seed)` gives each face axis a triangular −1.3…1.3, an age (62%
  young, 28% middle-aged, 10% old) and a firmness. `LifeLook` applies them on bind (the person's name seed, as
  the iris); `LifePerson.setGenes` does the same for the benches; `/dev/life?style=bs&faces=N&seed=`.
- **`PREMADE_FACES`:** classic, gentle, rugged, narrow, round, elder, for the editor (phase 6).
- Stills: `design/screens/life/p131/faces/sheet-faces.png` (`e2e/zz-faces131.mts`). Faces read apart, but age
  doesn't show yet: it needs the old skin (phase 4).
- **Height (F2) is left out.** The rig's legs are fitted to `moves.ts` constants, so a scaled person would
  break contacts and IK. That needs its own pass.

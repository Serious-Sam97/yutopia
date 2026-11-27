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

## Phase 4 — the skin by age (2026-11-26)

- **MakeHuman's old light-skinned male skin** is read through the cage at the same texels as the young one. Its
  light over the young skin's (each with its own region's tone divided out), with the contrast drawn out ×3, goes
  into the skin texture's **alpha** (÷1.5).
- **In the game**, `chars/life.ts ownPiece(…, age)` mixes it in by the person's `lifeOld` (their `faceGenes` age)
  after the map: `colour *= mix(1, a·1.5, old)`. The benches do the same through `LifePerson.setGenes`. The body
  is marked by the file's extras `base: "blender-studio"`, which also sets `LifeBase.kind = "bs"`.
- An old man now shows the lines round his eyes and mouth: `design/screens/life/p131/faces-age/`.
- **Skin colour** is the avatar's, as before: the texture ÷ its mean × the avatar's skin.

## Phase 5 — what's worn on the new body (2026-11-26)

- **The look's MakeHuman scene with every garment:** `build_person.py --look gtav --bare --wear all --blend
  …-wear.blend`. build_bs.py takes it, and finds the twins under the bare name.
- **Every piece moves with the cage:** 111 files, 144 pieces (garments, hairs, beards, eyewear, extras). Each
  takes the variety shapes of the skin it sits over (nearest body vertex), but only those that move it by more
  than 4 mm (each shape on every piece made the wardrobe 86 MB).
- **The body's zones and beard densities.** `_wear` and `_neck` are kinds, taken from the nearest cage vertex;
  `_beardA/B/C` are blended through the cage. The skin under clothes hides as it did.
- **Written to `public/life/wear-man-bs/`** (42 MB packed, against 24 MB for MakeHuman's). Garment textures are
  capped at 1024. `life-people.ts garment()` loads from `wear-<who>-bs` when the base is `kind: "bs"`. Budgets:
  hair and beard files ×2.2 for the new body (the full beard 1.5 MB, the afro 2.6 MB), with the budget test
  covering `wear-man-bs`.
- Stills: `0c/dressed*.png` (tee/jeans, hoodie/cargo/curly/full beard, coat/shirt/beanie) and
  `game2/lot-12.png` (`?body=bs` in the world): dressed, the skin hidden under clothes.
- **Known:** a beanie on a bald head stands off the scalp, because hats are cut to sit over the fullest hair, as
  before.

Left: phase 6 (the editor's face and age sliders, premade faces), 7 (the far person and LODs for the new body,
frame cost on M1 Low, memcheck), 8 (checks; the e2e near people, run with `?body=bs`), then the woman by the
same path (F11b), and making the new body the default (dropping `?body=bs`).

## Phase 6 — the editor (2026-11-26)

- **`AvatarLayers.face`** (shared `avatar.ts`, `FACE_RE`): "" means from their name's seed; otherwise 24 whole
  numbers −9…9 (the 22 face axes ×0.15, then age ÷9 and firmness ×0.1). The API validates the same, with
  `Avatars::DEFAULT face ''`. `faceOf(avatar, seed)` decodes it and `faceCode` encodes it. The faces' code
  (`FACE_AXES`, `faceGenes`, `PREMADE_FACES`) moved into `@yutopia/shared`, so the editor's page reads it
  without three; `life-people.ts` re-exports it.
- **The editor's new tab "Face/Rosto":**
  - "Start from": from my name, or one of six premade faces;
  - "Age and build": age and firmness;
  - the 22 face axes as sliders.
- Checked on `/avatar?body=bs` as Bia (`e2e/zz-face-editor131.mts`): Rugged set the sliders and was saved
  through the API (`0,0,5,…,3,0`); her own face was put back. Stills: `p131/editor-*.png`.

## Phase 7 — the cost (2026-11-26)

- **The still shapes are baked per person.** Face, age, firmness, slim/broad and the coat are added once into
  the person's own copy of each part's positions (`LifeLook.bakedOf`), and those shapes are dropped. Only the
  live ones stay: blink, talk, smile, the correctives. First person's arms are left as they are (they swap
  cuts).
  - Trap: a part left with no shapes must have no morph lists at all. An empty list turns three's morph code
    on without a count, the shader doesn't compile, and the piece isn't drawn.
- **`/dev/life/crowd`** (`e2e/zz-crowd131.mts`, 40 people, M1 Metal render ms with the GPU waited for):
  - all near: MakeHuman 13.8, new body (men) 14.4;
  - the game's mix (16 near, 24 far): 9.4 against 9.3, i.e. equal.

  Baking also made today's people cheaper: all near went from 14.1 to 13.8.
- **The far person** stays MakeHuman's coarse mesh (at that distance the bodies read the same). A far mesh made
  from the new body is a follow-up.

## Phase 8 — checks (2026-11-26)

- `playwright.bs.config.ts`: every spec's page with `localStorage["yutopia:body"] = "bs"` (dev only, on top of
  the life config).
- **The people specs on the new body:** avatar, people-3d, sway, third-person, first-person, emote-wheel,
  water, moves-seen. 6 passed and 5 skipped; 2 failed in the batch (third-person's two players at
  `page.goto("/")`, and emote-wheel). Rerun alone, both pass, with the new body and with today's: loading
  flakes, not regressions.
- **Left:**
  - the woman, by the same path once the man is signed off (F11b);
  - making the new body the default (dropping `?body=bs`);
  - a far person from the new body;
  - height (F2) against the rig's leg constants;
  - a beanie on a bald head stands off the scalp.

## The woman (F11b, after the man's sign-off — 2026-11-26)

- **The same path:** `mock131.py` gains `gtav-old` for the woman, and her GTA V look's photo skin is now
  MakeHuman's light one (the game tints it; a dark one lifted to a light skin ran out of range). Her age detail
  comes from `old_caucasian_female`. Six scenes: the look with every garment, slim, broad, firmer, old, plus
  the bare look. Then `build_bs.py … woman`. Files: `person-woman-bs.glb` (2.82 MB packed) and
  `wear-woman-bs/` (111 files, 36 MB).
- **Fixes found on her, which help the man too:**
  - Pink texels round the eyes (the MakeHuman lid's inside read where the cage's lid folds) are evened to
    their surroundings.
  - A garment's vertex that isn't on an arm now moves by the cage's own non-arm skin. A trouser's hip by the
    hanging hand had taken the hand's move and stood out in a flap.
- **`?body=bs` and `localStorage["yutopia:body"]` now switch both people.** `build_all.sh` builds both. The
  budget test covers `wear-woman-bs` (beards' triangles ×1.05: her full beard is 16.1k).
- Stills: `design/screens/life/p131/woman/` (body, face, blink, talking, bodies, dressed) and
  `woman-faces/sheet-faces.png` (six seeds: faces apart, the old one lined); `game4/lot-12.png` (the world).
- Tests: 124 look/chars tests pass. Trap: never `| head` a Blender pipe; it killed a build silently.

## Double check (2026-11-26, the user: "double check all")

Checked:
- **Correctives in the game's own rig** (`/dev/anim?body=bs`): read from the live meshes. Hanging gives
  cShoulder 1.0; the crouch gives cKnee 0.4–0.7 and cHip 0.5. Only the live shapes stay on the body (blink,
  talk, smile, the 8 correctives); the still ones are baked.
- **The face code end to end** (`e2e/zz-face-seen131.mts`): a bad code is refused (422); Bia's code is saved
  and Ana's world shows it on Bia; Bia's face is put back.
- **Typecheck:** client, world server, shared.
- **Unit tests:** client 493/494 (the one red is the HUD colours test, flagging plans 124, 125 and 130's
  `BuildTab`/`Lamp*`; not this plan's files); shared 965/965; world server's world/schema 16/16.
- **People e2e with both new bodies:** avatar, people-3d, sway, first-person, third-person and water: 7
  passed, 4 skipped. An earlier batch's avatar red passes alone. `actions.spec` fails with today's body too.

Found and fixed:
1. **NPC looks dropped `face`.** The admin NPC editor shows the Face tab, but `Npc::LOOK` didn't keep it. It
   is now validated as the player's is.
2. **The editor's preview and Face tab ignored the name's seed.** "From my name" showed a different face from
   the world's. `nameSeed` moved to shared; the turntable and `AvatarEditor` take `seedName` (the player's own
   name on /avatar, the NPC's on the cast page). The sliders now start from the face the name gives.
3. **The woman's lower lip folded talking.** Her lip's inside lay on the jaw line's soft edge. Inside the mouth
   bag, plain facing now decides (straight down stays, straight up goes, between by height); at the slit, each
   lip's own face goes with its jaw.
4. **The zones (`_wear`) came from the cage's nearest vertex.** A raised arm's skin took the trunk's kind and
   hid under a tank top. The kind is now decided by the new body's own weights, and the place along the limb
   from the cage's vertices of that kind.
5. **The painted sample shorts showed under real garments** (dark bands at the thighs). They are only painted
   on a bare build now.
6. **Garments' weights were the cage's**, so cloth and skin parted at the shoulders and hips: strips of shorts
   rose with the arms, and a tank's armhole tore. Each cloth vertex now takes the new skin's weights round it
   (8 nearest). Sleeves read the whole skin; the rest only the trunk's and the legs', with no more arm share
   than the garment's own. Swinging joints (skirt, hair, pack, scarf) keep their share.
7. **Cloth sunk into the sculpt's muscles.** Cloth within 2 cm inside the new skin is pushed out to 1.5 mm,
   against the trunk's skin only for what isn't a sleeve (pushed off the hanging arm, it spiked).
   - Tried and dropped: mapping each cloth vertex onto the cage's surface point under it. It made lumps and
     flaps by the armpits and elbows. Positions stay as in phase 5: moved by the cage's own non-arm skin.

Stills: `design/screens/life/p131/check/sheet-check.png` (both bodies: arms raised, crouch, sitting, the heart,
dressed, talking).

## The hands — 2026-11-27

The user: the new body's fingers are bizarre; compare every clip's fingers with today's body (plan 78 fixed
those). Tools: `e2e/zz-hands131.mts` (every clip of /dev/anim at 1.2 s, the hand-heavy ones at 2.4 s too, the
right hand from its back and from the person's side, today's body beside the new one; sheets of ten rows,
`--woman`, `--only="a|b"`), `e2e/zz-thumb131.mts` (one moment, six sides), `e2e/zz-spread131.mts` (the fan by
bones and by mesh), `e2e/zz-sheets-render.mts`, and `hand-report.mts --bs`. Dumps: `BS_HANDS=…npz` (after the
hand fit) and `BS_WEIGHTS=…npz` (after the weights) stop `build_bs.py` early.

What was wrong, each found on the sheets or by plotting both hands' points and joints:
1. **The cage's fingers went onto the wrong ones.** They were matched by direction alone: MakeHuman's thumb
   went onto the new index, its ring onto the new thumb. And **the rig's finger joints stayed MakeHuman's**,
   moved only with the wrist, so the fingers bent about points that weren't their knuckles (splayed, twisted,
   tips folded flat). New `tools/art/life/hand_fit.py`:
   - finds the five tips on each hand by persistence of the distance over the surface from the wrist (points
     under 4 mm apart joined: the new mesh's nails have doubled vertices);
   - labels them (the thumb is the farthest from the others; the four in order from its side);
   - finds the webs (the saddles where neighbouring fingers meet).
   The joints are placed on the new hand, and the cage's hand is moved onto them bone by bone before the
   shrink-wrap.
2. **The wrist joint sat 4.7 cm into the palm** (the landmark was a box mean; the palm's points are denser). It
   is now at the far end of the arm's narrowest stretch (`wrist_at`), as MakeHuman's is, before the bone heat
   and the posing. The new hand is 18.9 cm (the woman's 18.8); MakeHuman's was 20.4 (16.7).
3. **The joints zigzagged across the fingers** (rest bends +14° to −29°): each was centred in a slice of a
   coarse mesh (9 mm edges). They now lie on each finger's centre as a smooth curve (quadratics through its
   slices' middles, run back into the palm along its near half's chord). Rest bends now −9 to −22° at the
   knuckle, as MakeHuman's −17 to −25°.
4. **The fist closed as a claw.** The knuckles sat at the webs: MakeHuman's own knuckle row is at its deep webs,
   and taken over as it was, it landed on the new hand's shallow ones. The row is now 9% of the hand's length
   back from the webs (a real knuckle's joint is ~1.7 cm before its web), each finger off it as MakeHuman's are
   off one another. Each knuckle is kept in the middle 30–70% of the hand's thickness. The palm normal is
   turned toward the thumb's side (the SVD's sign had flipped the depth share).
5. **The thumb was a flap.** The cage's thumb lay on one face of the new one, and the far face read the palm
   (the wrist). Every finger and thumb vertex is now weighted on the new mesh: by its nearest finger's joints,
   shared over 5 mm (the thumb 12 mm) across each joint, the wrist's before the knuckle. These weights fade
   into the carried ones away from the fingers' lines, and over the thumb's first stretch.
6. **Open hands splayed.** The new hand rests with its fingers spread (the ring 7° and the little 4° wider). Each
   finger is turned in the palm's plane about its knuckle to MakeHuman's fan, and the thumb onto MakeHuman's
   line in the hand's frame. A wave's fan by the bones: 5/3/12° → 1/4/8° (today's 1/4/8°).
7. **The whole hand rested 17° off MakeHuman's** (its line and its palm's normal: it was posed by a landmark
   point), so every clip's hand came out turned. It is turned onto MakeHuman's frame about the wrist.

8. **The skin smeared on the hands** after the turns above (dark red marks across the knuckles): the skin is
   read off the cage by place, and the hands had been turned away from it. It is read with the hands where
   they were before the turns (`P_SKIN`).

One build in this round stopped silently right after opening its scene, and an hour of stills and a survey ran
on the previous file. The scratch build script now stops when Blender writes nothing; the results below are from
a rebuild.

Checks:
- **The sheets:** every clip, both bodies, man and woman: `design/screens/life/p131/hands/`.
- **The hand report survey** (every clip at 0.8, 2 and 3.2 s, both hands, 768 hands): out of range today 173,
  new 242. The wrist's side to side is better (47 → 31). "Thumb into its own hand" is up (61 → 137), but its
  depth matches today's (deepest 1.2 cm against 1.1; the line is 0.6): the thumb resting on a finger, which the
  report counts as entering the hand. "Into the other hand" is 20 → 30 at today's depths (2.0 against 2.1 cm;
  two-handed holds).
- The joint angles are the same on both rigs, as they should be (the fist: knuckles 87°, middles 98°).

Left: **the phone call on the man.** The new arm is proportioned differently: upper arm 31 cm against
MakeHuman's 24.5, forearm 22.6 against 25.7. To bring the phone to the ear, the arm solver lifts the elbow forward
and up (29 cm in front of the head, against today's 19), and the phone lies along the cheek instead of toward
the mouth. A pole far enough back to fix it (`CALL_POLE`) also moves today's signed-off call, so it stays as it
was. The woman's call looks like today's. The arm's reaches were all tuned on MakeHuman's arm: retuning them for
the new arm is its own step (with making the new body the default).

## The default — 2026-11-27

The user tried both people on :3100 and asked for the new body as the default: `bodySuffix` (look/look-mode.ts)
now gives `-bs` everywhere, prod included. Today's body stays one switch away in development — `?body=old`, or
`localStorage["yutopia:body"] = "old"` — and its files (person-*-painted.glb, wear-man/, wear-woman/) stay in
the tree. `playwright.bs.config.ts` went with the old switch: the e2e draw the new body as they are. Still open:
the man's phone call (the new arm's reaches, above).

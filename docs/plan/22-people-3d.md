# People in 3D — Ligne Claire (plan — 2026-10-17)

**Status:** P0–P8 delivered 2026-10-17 (see `PROGRESS.md`, one entry per step); open: the user's check in Firefox.

Ask (2026-10-17): "I don't like the people we have today… the app is mainly
used in three.js (third and first person), iso is not a priority but must keep
working (as we do with the item models)". The user saw five directions built
from one parametric model (`/dev/chars`, shots in `design/chars-3d/`), then picked
**Ligne Claire**: flat colour, one even black line, dot eyes, a button nose
and a quiff. They tuned the body together with us: a belly and seat, shorter
arms, a longer trunk and the shirt down to the hips. "The torso is right now."

Their rules for every model: no raw boxes or coarse cylinders — only lathes of
smooth profiles, bevelled `Shape` extrusions and tubes swept along splines;
smooth normals; parameters at the top of the file, changeable at runtime;
ES modules that dispose what they make.

Order of work: one style for everyone first (City Pop goes), then the 3D view
(third and first person), my own hands in first person, then iso sprites
rendered from the same models (as pets do), then the HUD.

## Where we start

- **The model**: `world/chars/` — `shapes.ts` (the geometry kit), `character.ts`
  (`STYLES.ligne`, `Character`: `set()`, `setPose()`, `dispose()`, a 16-joint
  rig), `finish.ts`, `ink.ts` (a constant-width line in screen space). It is
  dev-only and has a few problems:
  - about 140k triangles and ~80 draw calls per person (every part is its own
    mesh, each with its own ink hull);
  - it builds in ~60 ms;
  - it imports `pets3d.ts` (toon/outline) even for Ligne Claire.
- **People in 3D today**: `tp/people3d.ts` `Person3` is a canvas billboard
  of the 2D rig.
  - It is unlit; it gets `light.tintAt` instead.
  - It fakes depth with a "pull" towards the camera.
  - It has 8 facings and its own seat rules (`SEAT_*`).
  - Picking is an alpha test.
  - The view feeds it `PersonIn` (`avatar`, `a` 0/1/2, angle, `held`, phone
    state, `emote`, `act`, `busy`, `typing`, `speaking`, `status`, `seat`).
- **Motion vocabulary** (`art/avatar-motion.ts`; all of it needs a 3D
  counterpart):
  - idle life: breathing, weight shift, glances;
  - a walk synced to distance;
  - sit down and stand up; seated idle; typing;
  - 12 busy poses (`USES`);
  - 6 phone states plus 3 photo poses and the ring buzz;
  - holding and sipping;
  - 5 social acts with a contact moment;
  - 8 emotes, including the dance;
  - talk gestures, blinking, a talking mouth.
- **Iso today**: SVG rig parts as Pixi sprites (`engine.drawRig`), keyed by
  look, view, seated and day/night rim.
  - Name tag at −106, bubble at −120, emote at −126, all × `PERSON`.
  - Hit box 16 × 92.
- **The avatar** (`AvatarLayers`, 18 fields): 10 hairs, 11 tops, 7 bottoms,
  8 head things, 4 eyewear, 7 extras, 5 shoes, 3 bodies, 3 genders. The 3D
  model knows only 5 hairs, 2 tops and 3 bottoms so far.
  - Yondra does not whitelist option values, so new values need no Laravel
    change.
  - A new *field* does need one: a validate rule, `YutopiaSpaces::DEFAULT_AVATAR`
    and the shared `DEFAULT_AVATAR`.

## P0 — Only Ligne Claire: City Pop goes

The user's call (2026-10-17): City Pop is removed and everyone is Ligne Claire,
including people who picked City Pop. This step stands on its own: today's 2D
people already draw Ligne Claire, so it can ship before any 3D work.

- **Migration in Yondra**: `2026_10_17_000003_avatars_to_ligne_claire`.
  - It walks `yutopia_avatars` (`chunkById`, decode/encode in PHP so it works
    on sqlite and in production alike) and sets `layers.style = "ligne"` where
    the style is `citypop` or missing.
  - `down()` is a no-op: we can't know afterwards who had City Pop.
- **Yondra validation and defaults**:
  - `YutopiaController::updateAvatar` still accepts `citypop`, so an old
    browser tab doesn't get a 422, but saves it as `ligne`.
  - `YutopiaSpaces::DEFAULT_AVATAR` style becomes `ligne`.
  - Pest: `YutopiaTest` expects `ligne`, plus a test for the migration and the
    coercion.
- **Shared** (`packages/shared/src/avatar.ts`):
  - `AVATAR_OPTIONS.style` = `["ligne"]`, `DEFAULT_AVATAR.style` = `"ligne"`.
  - `parseAvatar` turns any style into `ligne`. That also covers world tokens
    issued before the migration (`YutopiaTokens` puts the avatar in the token)
    and avatars in an old browser's memory.
  - `avatarFromSeed` keeps its one random draw for the style, so bots and
    guests keep every other part of their look.
- **Client**:
  - The avatar editor loses its Style row; `style_citypop` goes from
    `lib/i18n.ts`.
  - `avatar-svg.ts` loses the City Pop drawing: shade shapes, hair gradient,
    the rim light. The rim's day/night variants go from every texture key
    (`textures.ts`, `engine.updateAvatar`, `people3d.ts`), which halves the
    people textures at night.
  - `/dev/shots` crowd and `/dev/sheet ?style` drop City Pop.
  - `e2e/avatar.spec.ts` switches another field instead of the style.
- **Not touched**: the phone ringtone called `citypop` (`phone.ts`, `schema.ts`
  `tone`, `YutopiaPhoneService`) — it is a sound, not the art style.
- **Docs**: `docs/art-style.md` People → Ligne Claire only.
- **Exit**:
  - after `php artisan migrate` on dev, no avatar row has `citypop`;
  - Pest, `pnpm test`, `pnpm typecheck` and `e2e/avatar.spec.ts` pass;
  - the Studio crowd by day and at night shows only Ligne Claire in iso and
    in 3P;
  - the user checks it in Firefox.

## P1 — A model fit for a crowd

The look stays exactly as approved; only how it is built changes.

- **One skinned mesh per person.** Build the parts as today, then:
  - write each part's flat colour into vertex colours;
  - merge everything (face decals included) into one `BufferGeometry`;
  - give every vertex a rigid weight to its joint's bone;
  - drive it with a `Skeleton` whose bones are the 16 joints.

  Result: **one `MeshBasicMaterial` (vertex colours) for the body and one
  ink hull — 2 draw calls per person**. The ink shader learns skinning (three's
  `skinning_vertex` chunks are already in Basic's vertex shader).
- **Levels of detail** from the same parameters (segments and bevel steps):

  | LOD | Triangles | Used for |
  |---|---|---|
  | L0 | ~25k | close-ups, the editor turntable, under 4 tiles |
  | L1 | ~8k | the room |
  | L2 | ~2k | far away |

  Same silhouette at every level. Switch levels with hysteresis.
- **Shared, cached geometry**: keyed by look + body + LOD, reference-counted
  and disposed at zero. Ten people in the same default look build once.
- **Builds off the critical path**: at most one build per frame (a queue,
  nearest people first). A person shows as a low-detail model, or the old
  billboard, until their model is ready.
- **Its own lazy chunk** `yutopia-chars`:
  - add a `tools/budget.mjs` entry (~60 KB gz to start);
  - give the entry module a kept marker;
  - move the toon/outline helpers it borrows from `pets3d.ts` into a small
    shared module (or leave them out of the chunk), so pets and chars don't
    bundle each other.
- **Exit**:
  - `/dev/chars?crowd=50` holds 60 fps on the M4 in Chrome;
  - one person is 2 draw calls;
  - a heap check after 200 build/dispose cycles shows no growth;
  - the user checks it in Firefox.

## P2 — The whole wardrobe

Everything in `AvatarLayers` gets a 3D part. All are lathes, extrusions or
swept tubes, each with its own parameters.

- **body** (regular / broad / slim) and **gender** (neutral / feminine /
  masculine) become parameter sets: shoulder, chest, waist, hip, belly,
  jaw, brows. No separate meshes.
- **hair**:

  | Kind | Built as |
  |---|---|
  | short, bob, long, bun | already done |
  | ponytail | already done (as pony) |
  | buzz | the cap only, thin |
  | bald | no cap |
  | curly | tight swept curls over a cap |
  | afro | a big soft mass with a lumpy edge, inked as one shape |
  | mohawk | one crest of swept locks |

- **tops**:

  | Kind | Built as |
  |---|---|
  | tee, sweater | already done |
  | tank | no sleeves, deep arm holes |
  | polo | collar plus a button placket |
  | shirt | collar, placket, cuffs |
  | turtleneck | rolled neck tube |
  | hoodie | hood lathe at the back, pouch pocket, strings |
  | cardigan | open front, two panels |
  | jacket | open front, lapels, hem band |
  | blazer | lapels, a button |
  | dress | top and skirt as one piece |

- **bottoms**:

  | Kind | Built as |
  |---|---|
  | jeans | pants plus seam lines and turn-ups |
  | trousers | crease line |
  | shorts, skirt | already done |
  | cargo | side pockets |
  | longskirt | to the ankle |
  | joggers | cuffed ankles |

- **head**: headphones, cap, beanie, beret, bucket hat, bandana, headband.
  Each sits on the hair cap's surface (`HeadShape.at`).
- **eyewear**: glasses, round, sunglasses. Frames are swept tubes; lenses are
  flat or tinted.
- **extras**: walkman, scarf, earrings, necklace, backpack, watch.
- **shoes**: sneakers, high-tops, boots, loafers, sandals. Each is an
  extruded side profile plus a sole.
- **Lines that a silhouette misses** are drawn as creases, the same way as the
  shirt hem: plackets, seams, pocket edges, hood rims.
- **No new avatar fields.** Ligne Claire eyes are black dots, and soles take
  a fixed light colour per shoe kind.
- **Exit**: a `/dev/chars?sheet=wardrobe` page shows every option on a
  turntable with the 2D drawing beside it. The user signs it off.

## P3 — Motion in 3D

A pose library and a small layered mixer in `world/chars/motion.ts`. It is the
same layer order as `Motion.update`, so behaviour matches the 2D people
one-for-one.

- **Poses are data**: joint → Euler, authored per pose (not per view, as the
  2D rig's were), with the times taken from the 2D code.
- **Layers, in this order**:
  1. still (stand, seated, seated typing);
  2. idle life;
  3. walk: phase from distance (`STRIDE` 1.9 tiles), feet planted, hip sway,
     arm swing;
  4. held and sip;
  5. busy (`atWork`, 12 uses);
  6. phone (states plus photo poses);
  7. sit-down and get-up settle;
  8. social (with `CONTACT` at 0.45);
  9. emotes, including the dance.
- **Blending** between poses uses quaternion slerp per joint with the same
  envelopes as 2D (0.2 s busy, 0.3/0.35 s social).
- **Face**:
  - blink is the dot eyes squashed to a line;
  - talking swaps the mouth line for a small open-mouth shape;
  - both are morph targets in the merged mesh (no extra draw calls).
- **Reduced motion** is respected, as today.
- **Exit**: `/dev/chars?anim=<pose>` plays every pose. A unit test checks that
  every pose × every body stays finite, and that no hand passes through the
  torso at the contact frames.

## P4 — Into the 3D and first-person view

- `tp/people3d.ts` gets `Person3D`, the same `PersonIn` → model. `view.ts`
  uses it for everyone as soon as it ships — no switch back to the old
  drawings (the user's call). The billboard stays only as the fallback when a
  model can't be built (no WebGL), so problems are fixed forward.
- **Light**: material → `light.patch` (the light map multiplies the flat
  colour, so people dim at night and warm under lamps, as the room does). The
  ink is not patched. Call `inkResolution` from the view's `resize()`.
  - Shadows: real cast shadows on Medium/High; the blob shadow on Low.
- **Sitting** on real seat heights (the `SEAT_HIP` table becomes metres); the
  hips go onto the cushion and the legs bend at the knee. The depth "pull"
  hack goes away.
- **Things in hand**, as small 3D models on the right wrist bone:
  - mug, cup, soda (with the level dropping) — new;
  - the toys — reused from `toyMesh`;
  - the phone — new: a lathe/extruded body, with a screen texture from the
    phone UI, the night glow and the recording dot.
  - `handOf()` (game pads, the cable) reads the wrist bone instead of fixed
    heights.
- **Picking**: raycast the skinned mesh, as pets are picked. The name-tag
  height is the model's head plus a margin.
- **First person**: my body is hidden, as today; my own hands come in P5.
- **Vortex** stays the 2D drawing: it must match Yondra exactly.
- **Off screen or far away**:
  - skip the motion (no `setPose`, no skeleton update);
  - update people far away every other frame;
  - use L2 beyond 12 tiles.
- **Exit**:
  - `third-person-shots` and `first-person` review shots in 3P and 1P, by
    day and at night;
  - `third-person.spec`, `first-person.spec` and the mouse-look e2e still
    pass;
  - 30 people in a room keep 60 fps on High;
  - the user checks it in Firefox.

## P5 — My own hands in first person

Added by the user (2026-10-17). In first person the camera is at my eyes and
my body is hidden. Now I see my own arms and hands come into view whenever
they are doing something, as in most first-person games. Other people still
see my whole body do the same thing (P4).

- **When the hands show**:
  - the phone: texting, a call at the ear, video, photo, selfie; the phone
    shows the real phone screen;
  - a mug, cup or soda: held low, raised to the camera on each sip;
  - typing at a desk;
  - the busy uses: pressing the coffee/vending button, arcade, piano, slot-car
    and gamepad controllers, the pool cue, ping-pong, the whiteboard;
  - social acts: wave, high five, fist bump, cheers, give and take;
  - emotes that use the arms: wave, clap, heart, fire, question;
  - toys: holding them, throwing them (the throw follows through), the laser.

  With nothing to do, the hands stay out of view so the picture is clean.
- **How it is drawn**:
  - Only my arms, shoulder to fingertips, plus whatever I hold. Same model,
    same look (my skin, my sleeves: a tee shows the forearm, a sweater its
    cuffs), same ink line.
  - It is drawn in its own pass after the room, with its own camera
    (fixed FOV, near plane close in) and the depth cleared. The hands never
    sink into a wall or a desk, even standing right against one.
  - Lit by the light map at my tile, so they dim at night like the rest.
- **Motion**:
  - Camera-framed versions of the P3 poses, driven by the same state that
    poses my body for everyone else, so both always agree.
  - A little bob while walking, and a lag behind fast mouse-look turns.
    Reduced motion turns both off.
- **Setting**: "Show my hands in first person" in Settings, on by default.
- **Cost**: one more person-sized draw (2 draw calls), at the highest detail.
- **Exit**:
  - first-person review shots of each case (phone, sip, typing, wave, a
    throw), by day and at night;
  - no hand clips into a wall or a desk;
  - `first-person.spec` and the mouse-look e2e still pass;
  - the user checks it in Firefox.

## P6 — Iso sprites from the models

- **`art/people-render.ts`**, following `pets-render.ts`:
  - one shared offscreen renderer and an ortho iso camera at 30°;
  - 8 facings;
  - frames per pose: walk 8, idle 4, the rest per act;
  - a sprite cache keyed by look, facing, pose and frame (FIFO), with models
    cached by look;
  - ink width set in sprite pixels.
  - No day/night in the key: the engine's light tint does that.
- **The engine** draws a person as one sprite instead of the SVG rig parts.
  - Anchors and offsets are kept: feet at 0.96, tag −106, bubble −120,
    emote −126, hit box from the sprite.
  - Held items and the phone are drawn into the sprite.
  - `avatarShown()` keeps working for `walk-angles.spec`.
- **Exit**: the `/dev/shots?crowd=50` budget test holds (textures ≤ 192 MB,
  render p95 ≤ 16.7 ms on a real GPU). `walk-angles.spec` and
  `walk.test.ts` pass (updated to the model).

## P7 — The HUD and the editor

- **`AvatarCanvas`** becomes a live turntable, like `PetTurntable`. It is used
  in the lobby, the avatar page, the in-world Avatar panel and `PersonCard`,
  and keeps the walk toggle.
- **`Face`** becomes a portrait rendered from the model's head (a cached data
  URL, as `PetFace` does). It is used in the top bar, side panel, people
  tab, actions and the phone.
- **The avatar editor** shows the live model. Every new P2 option already
  saves through the existing fields.

## P8 — Clean-up and docs

- The SVG rig (`avatar-svg.ts`, `avatar-rig.ts`, `wardrobe.ts`, the
  `yutopia-people` chunk) stays only as the fallback when WebGL is missing.
- Update `docs/art-style.md` (People → Ligne Claire 3D), `PROGRESS.md` and
  the `/dev/sheet` page (3D path).

## Decisions for the user

1. ~~Everyone in Ligne Claire?~~ Decided 2026-10-17: yes, City Pop is
   removed for everyone (P0).
2. ~~First person: see your own hands?~~ Decided 2026-10-17: yes, in this
   plan (P5).
3. ~~Rollout~~ Decided 2026-10-17: straight to default, no Settings switch.

All decisions are made.

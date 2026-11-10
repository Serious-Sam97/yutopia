# 74 — The people pass

Ask (2026-11-10), after the life look became the default (plan 73, daa2540): "It's a little good, so I
want to improve a lot":

- every model looks like a bodybuilder; they should look like normal people
- the clothes are very bad; improve how they sit on the body
- the hair is ugly
- the beard is damn ugly too

Status: **phases 0–5 built 2026-11-10**; hair and beards changed course (below, "Hair and beards:
the turn"); the credits they owe are plan 75. Planned 2026-11-10. Forks decided 2026-11-10 ("Let's go"): the recommendations, G1a
everyday bodies, G2a cloth simulation baked, G3a hair cards from curves, G4a beards on the skin plus
cards, G5 MSAA ×4 on High and Medium with two-pass hair on Low.

The reference stays a *quality*, as in plan 73: grown-up, warm, believable everyday people. We make
everything ourselves. The CC0 MakeHuman data is still the starting point, and Blender 5.2 headless is
still the tool.

## What's wrong, and why (audit, 2026-11-10)

From the stills (`design/screens/life/p4/bodies-*`, `p52/tops-*`, `p53/hair-*`, `p53/beards.png`,
`p57w/`) and the build scripts.

### 1. Bodybuilders

- **The sliders are set athletic.** `build_person.py PEOPLE`: muscle 0.62 for the man and 0.55 for
  the woman (0.5 is MakeHuman's average). `proportions: 1.0` adds the full `idealproportions` targets,
  which are an athletic V shape. The **broad** body is muscle 0.85, so it's a lifter, not a bigger
  person. The slim body is still muscle 0.38.
- **The skin texture has muscles painted on.** MakeHuman's young skins have pecs, abs and limb
  definition in their shading. `even_skin` keeps exactly that (the brightness over a wide local
  average), so it shows through even on a soft body.
- **The clothes show every muscle** (see 2). A tee over pecs and jeans over quads read as muscles, even
  where the body under them isn't extreme.
- Smaller things: a thick neck and trapezius on the man, a narrow waist under wide lats, thighs as wide
  as the hips.

### 2. Clothes

- **They're shells off the body.** `wear.py` cuts every garment out of `helper-tights` and pushes it
  out by a constant `thick` (0.06–0.3 dm). So a shirt is the body's shape, a little bigger. There's no
  ease, no hang from the chest or the seat, and no gap between the legs or under the arms. Jeans are
  leggings, and a sweater shows the abs.
- **No folds.** No wrinkles at the elbows, the backs of the knees, the waist or the armpits, and no
  drape. The only detail is the weave texture.
- **No construction.** Hems are one paper-thin edge, often ragged (the slice is clean, but the shell
  is a single layer). There are no seams, cuffs, waistbands, flies, plackets or buttons.
- **The weave is too coarse.** The knit on a tee reads as a sweater a metre away (`p52/tops-man`).
- Known from 5.x: a skirt's hard shelf at the back, hands sinking into a flared skirt, a long coat
  letting a raised knee through, hats sitting high (a beanie like a bowl).

### 3. Hair

- **No anti-aliasing where it needs it.** Hair, lashes and brows use alpha-to-coverage
  (`life-people.ts`), which needs MSAA. The game draws into the composer's own target
  (`tp/post3d.ts`: `new WebGLRenderTarget(… { type: HalfFloatType })`, no `samples`), so coverage
  falls back to a hard 1-bit cut. That causes the stair-stepped hairlines, jagged fringes and pixel
  noise in every hair still. It's the cheapest fix and the biggest one.
- **Helmets.** The twelve made styles (`hair.py`: buzz, crew, fade, undercut, afro, curly…) are smooth
  shells with no strands, so they read as plastic caps. The CC0 pack's nine are better but low-res,
  with blurry textures, few layers and no flyaways.
- **The hairline is a cut mesh edge** against the forehead. It isn't a soft, painted density.
- **The light is wrong for hair.** It uses the physical model's highlight (a blob). Hair needs a band
  along the strands: two shifted lobes, the second one tinted. There's also no darkening at the roots,
  no lighter tips, and no variation from strand to strand.

### 4. Beards

- **One painted shell, blended.** It's a dark mass with a hard silhouette, and pale patches of skin
  around the mouth (`p53/beards.png`). It reads as a mask stuck on, not hair that grows from the skin.
- **Stubble doesn't show.** It's a faint tint on the same shell.
- **The edge has no strands.** A real beard's silhouette is wispy along the jaw and the cheek line.
- It shares the hair's anti-aliasing problem (3) and its colour logic. It isn't darker or more varied
  than the hair the way real beards are.

## The forks (the user's call)

| | Fork | Options | My recommendation |
|---|---|---|---|
| G1 | **What "normal" means** | (a) **everyday**: average muscle, a little softness, real waists and bellies, slim and broad as real variety (a lean person and a heavier one). (b) **slightly fit**: today's bodies toned down a step. | **(a)**, with faces kept "slightly idealised" (plan 73's decision). |
| G2 | **How clothes get their shape** | (a) **Cloth simulation in Blender, baked**: each garment cut with ease, then dropped onto the body in the rest pose (gravity, body collision, pinned at shoulders or waist), once per body (slim, regular, broad). Folds baked into a normal map. (b) **Ease rules only**: a smoothed "dress form" and per-zone ease (chest, waist, hips, thighs), no simulation. | **(a)**. Real hang and folds are what make clothes look worn. (b) is the fallback for garments the simulation can't settle. |
| G3 | **How hair is made** | (a) **Strand cards from Blender hair curves**: guides per style, interpolated, clumped, curled and frizzed by geometry nodes, turned into layered cards on one shared strand atlas, with a hair shader. (b) Keep shells and the CC0 meshes, with better textures and the shader. | **(a)** for every style with length. Shells stay only for buzz and fade, on a painted scalp. |
| G4 | **How beards are made** | (a) **On the skin plus cards**: stubble and short beards are painted density in the skin shader (a shadow beard), and fuller beards add short cards along the jaw, chin and lip for the silhouette. (b) Keep the shell and improve its texture and edge. | **(a)**. This is how life-sim beards read as grown, not worn. |
| G5 | **Anti-aliasing cost** | MSAA ×4 on the composer target on High and Medium. On Low, either ×2 or none with a two-pass hair (an opaque cut at 0.5, then a blended edge pass). | **MSAA ×4 High/Medium, two-pass on Low**, measured in phase 1. *(Measured: MSAA cost 4.6 ms on High; two-pass hair on every tier instead — phase 1.)* |

## Phases

Image first, as plan 73: a fixed line-up of stills before anything rolls out, and sign-off on a
sample before every batch.

### 0 — The line-up

A bench that shows the four problems the same way every time, so before and after compare:

- `/dev/life?lineup=1`: the man and the woman, slim, regular and broad, in a tee and jeans, then a shirt
  and chinos, a sweater and a skirt, front, three-quarter and back.
- Faces at talking distance: six hairs each (short, side part, long, bob, ponytail, curly) and four
  beards (stubble, short, full, moustache), front and profile.
- Noon in the lobby and the lot, the game's own camera.
- `e2e/life-bench.mts SHOTS=p74-…` into `design/screens/life/p74/before/`.

### 1 — Edges (anti-aliasing)

- The composer's target multisampled (`samples: 4`) on High and Medium, so alpha-to-coverage works:
  hair, lashes, brows, beard edges, the leaves' cards too.
- Low: hair, lashes and brows in two passes (an opaque cut at 0.5 that writes depth, then the soft edge
  blended with no depth write).
- Measure the frame on High, Medium and Low (the GTAO pass reads the frame's depth: check it still does
  with a multisampled target, plan 73 0a's trap). Stills before and after.

**Phase 0 built 2026-11-10.** `/dev/life?wear=` takes a `body-slim` / `body-broad` token per outfit, and
`e2e/life-bench.mts SHOTS=p74-…` shoots the line-up (each outfit on the three bodies; six hairs; four
beards; faces front and in profile). Before: `design/screens/life/p74/before/` (36 frames). The world's
stills before are plan 73's `p57w/`.

**Phase 1 built 2026-11-10 — two-pass hair, not MSAA.**
- Low was never the problem: it draws straight to the canvas, made with `antialias`, so its alpha to
  coverage had samples all along. Lowest has no antialiasing anywhere by design. High and Medium draw
  the scene into the composer's single-sample target, where coverage fell back to a hard one-bit cut.
- **Tried: the scene multisampled** (a pass of its own with one ×4 target, resolved into the chain, the
  AO reading its resolved depth — the composer's two targets take turns, so both multisampled would
  have doubled the memory). It worked (the lashes fine strands), but **cost 4.6 ms of GPU in the lobby
  on High** at 1440×900 (13.1 → 17.7 ms, the median frame 16.7 → 33.3 ms). Taken out.
- **Built: hair and lashes drawn twice**, on every tier (`look/life-people.ts` `hasSoftEdge`,
  `softEdgeMaterial`, `softEdgeMesh`). The core is cut at half its alpha, opaque, writing depth; a
  sibling mesh (the same geometry, bones and face shapes' array) draws the same material blended with
  no depth write. On the core it lays the same colour over itself — no change, no custom shader; past
  it, the fringe fades into what's behind. No shadow of its own; with their own look only (away, or
  under the one material, the core alone). Eyes keep alpha to coverage, beards and brows were blended
  already. The game's `LifeLook` and the bench's `LifePerson` both make them.
- Stills `design/screens/life/p74/p1/`: the lashes are fine strands (a solid black wedge before), the
  hairline's fringe soft. The silhouettes' stair-steps are geometry (no MSAA), and the hair is still
  slabs: phase 4.

### 2 — Bodies: normal people

- **Sliders** (`build_person.py`): muscle to ~0.45 for the man and ~0.4 for the woman, `proportions` to
  ~0.4 (keeps a little polish without the V). A softer man's neck and trapezius, a real waist. The
  shoulder and arm targets from plan 73 0b re-checked, not stacked.
- **Bodies redefined**: slim = lean (weight ~0.2, muscle ~0.35); broad = heavier (weight ~0.85, muscle
  ~0.45, a belly and fuller hips). Not a lifter.
- **Skin shading**: `even_skin` takes the painted muscle out of the torso and the limbs (their
  islands' detail blurred or capped) and keeps the face, the hands and the knees.
- **Rig check**: joints move a few millimetres. Re-run `e2e/life-legs.mts`, the reaches and seats on
  `/dev/anim?look=life`, and `fitleg.test.ts`. The far person rebuilt from the new bodies.
- Stills of the line-up's bodies (no clothes change yet) for sign-off.

**Phase 2 built 2026-11-10, for sign-off.** `tools/art/life/build_person.py`:
- **Sliders**: muscle 0.62 → 0.47 (the man), 0.55 → 0.42 (the woman); weight 0.52 / 0.5; ideal
  proportions 1.0 → 0.4.
- **Everyday targets on every build** (`EVERYDAY`): less V shape, lats, pecs, leg and forearm muscle, a
  little softness at the stomach. The man also gets a slimmer neck and less of plan 73 0b's shoulder
  narrowing (`EVERYDAY_MAN`: 0b took the shoulders in off a muscled build — off an everyday one, all of
  it read narrow). His shoulders 46.7 cm across (joints 34.7 cm apart), hers 41.9 (30.3).
- **Bodies**: slim weight 0.18, muscle 0.4 / 0.36; broad weight 0.9, muscle 0.48 / 0.42 — a heavier
  person, not a lifter (muscle 0.85 before). Slim still reads close to regular: MakeHuman's weight moves
  a figure little near the average (plan 73 4.1).
- **Skin** (`even_skin`, `keep_mask`): the painted shading split into fine (pores, creases: over a
  small blur) and broad (the muscles' painted light and shade: between it and the wide one). The broad
  is taken to the power 0.3 (`SKIN_SOFT`) except where the body is weighted to the head, neck, ears, eyes
  and hands (a soft mask splatted at the UVs).
- **Checks**: `e2e/life-legs.mts` walk, run, crouch, jump — the life ball on the rig's in every frame,
  both people (0 frames over 5 mm). `fitleg.test.ts`, `life-budget.test.ts`, `life.test.ts` pass. The
  far person rebuilt. The files: the man 3.02 MB, the woman 2.89 MB packed; garments 109 files each.
- Stills `design/screens/life/p74/p2/` against `before/`.
- Seen for phase 3: on the woman's new hips a tee's hem (hip − 0.35) falls below the crotch at the
  inside of the thighs, a V down the front (a top keeps its leg vertices above its hem).

### 3 — Clothes: fit, drape and folds

Sample first: tee, shirt, sweater, jeans, chinos, skirt, the man and the woman, three bodies each.

- **A dress form, not the body.** Garments are cut from the tights helper smoothed hard (no muscle
  detail), with the gaps bridged (between the legs to a crotch line, under the arms), then given
  **ease** by zone (chest, waist, hips, seat, thighs, upper arm) per garment, in place of one `thick`.
  A tee hangs off the chest. Jeans stand off the calves.
- **Draped** (G2a): Blender cloth on the eased garment in the rest pose: gravity, collision with the
  body, pinned at the shoulders (tops) or the waistband (bottoms), a few seconds settled. Once per body.
  Slim and broad become morphs of the same vertices. The simulation is kept in the repo as a script
  (`tools/art/life/drape.py`), run by `build_all.sh`.
- **Folds**: the drape run at a higher resolution, baked to a **normal map and AO** on the game mesh.
  Plus folds where the body bends (elbows, knees, the waist, armpits, the crotch), painted by script
  into the same map.
- **Construction**: hems and cuffs with real thickness (a rolled edge, a solidify), waistbands, a fly, a
  placket with buttons, pocket edges, and seams with stitching in the normal map (side seams, shoulder
  seams, inseams).
- **Weights**: copied from the smoothed body, not the muscled one, and smoothed, so the cloth bends
  softly and doesn't crease like skin.
- **Fabric**: the weave scaled to true size (a tee's knit fine, denim's twill with light fades at the
  knees and the seat, wool fuzzy), roughness and sheen per cloth.
- Then every garment in batches (tops, bottoms, outer, hats: the beanie sits on the head), stills each.
  The known 5.x leftovers (skirt shelf, hands in a flared skirt, coat and knee) fixed on the way.
- Budgets: a normal and AO map per garment (shared size, KTX2 UASTC for normals). Measured against the
  per-garment budget, raised if needed (standing call).

**Phase 3 built 2026-11-10 (the clothes' shape, folds and weave; construction left).** Instead of the
cloth simulation (G2a), two cheaper steps did most of it — the simulation stays an option if these fall
short:
- **The hang** (`tools/art/life/wear.py hang`, a garment's `drape`: dm in per dm down; None skin-tight):
  before its thickness, each garment's vertices move out round an axis — the figure's for the torso,
  each limb's own for sleeves and legs — to the body's hull there, a ring at a time, made convex across
  the ring (90° on the torso: at the groin the thighs are two lobes; 60° on a limb), then hung down
  from the widest above. A tee falls from the chest or the bust, a back from the shoulder blades, a
  sleeve from the shoulder's cap, a trouser leg from mid-thigh. The moves are smoothed over the mesh.
  - **Bottoms fit at the seat and the hips** (only bridged there) and hang from mid-thigh: hung from
    the seat, jeans stood out past a tee's hem — a leotard over them.
  - **A top's hips hang with its torso** (the thighs' vertices above its hem, and the hull takes the
    thighs in), and unwrap with it (`build_person.py`): left on the body they creased a V at the groin.
    Not a coat's or a dress's: their skirt piece hangs from the hips.
  - Capped (`ease_max` 0.4 dm on a limb, 0.88 on a top's torso); below t 1.8 on a limb (the ankle,
    the wrist) tapered from above only — the heel's bulge flared a trouser's hem into a bell; below the
    knee and the elbow the taper is half again.
  - A coat's skirt piece is given room over trousers (`over` 0.3 dm, eased in down from the hips): near
    its hem, where the trousers aren't hidden under it, they came through.
  - A top's hem never under the crotch (+0.15 dm, measured on the body: LM's `crotch` is only the hips'
    joint less 0.9), the spec itself changed so the game hides the skin by the same hem.
  - Drapes: tops 0.12, tank 0.25, crop 0.2, outer 0.06, trousers 0.1; leggings none.
  - (A bug on the way: `~bottom` on a Python bool is −1, not False — the hull's mask became indices,
    two vertices. Each round looked like a hang that changed nothing.)
- **Folds** (`look/life-wear.ts foldPiece`, before the pattern's piece): a height field over the
  garment's UVs (in metres, round and along) and its `_wear` (kind, along the limb), laid into the
  normal through the UVs' tangent frame, a little shade in the creases. Short broken creases at the
  elbow and the back of the knee (in patches, a little diagonal: regular rings read as an accordion);
  long soft folds down a limb; a trouser's hem stacked over the shoe; on the torso, soft folds falling
  and faint creases across in patches (lit from above, creases across shade far more than folds down).
  Strength by fabric (`FOLD_BY_FABRIC`: linen 1, twill 0.85, herringbone 0.6, boucle and tweed 0.45).
  A top's or a coat's hips fold as its torso (`top`). (GLSL ES 3: `patch` is a reserved word.)
- **The weave finer** (`libMaterial` `scale`: copies of the textures, the same images, one upload):
  linen ×3, twill and herringbone ×2, tweed ×1.6, boucle ×1.4 — a tee's knit had read as a sweater's.
  The tweed pattern's flecks finer too (×90 → ×240 a metre: up close they read as blocks).
- Stills `design/screens/life/p74/p3a` (the hang's rounds), `p3b`/`p3c` (folds, weave), `p3d` (the
  wider wardrobe), `p3w` (the world: lot, lobby, upstairs, noon and 22:00, the faces).
- Checks: `avatar`, `people-3d`, `sway` e2e under `playwright.life.config.ts` pass (4/4);
  `life-budget`, `fitleg`, `life` and the look's unit tests pass.
- **Left:** hems and cuffs are still a single paper-thin edge, and no seams, waistbands or buttons
  (construction); a coat's waist shows the step between its top and its skirt piece; the parka's hood
  stands off the shoulders; the woman's socks show under a skirt; the bench puts jeans under a dress.

**Phase 3, the second pass (2026-11-10, the user: "we still need a lot of work on it").** Close-ups
(`e2e/life-bench.mts SHOTS=p74-close-…`: the chest, the hips, the hems and the back of six outfits)
showed the worst: collars of shards, paper-thin ragged hems, garments that didn't read as what they are
(no placket, opening, waistband or pockets), loud weaves. Built:
- **Finished edges** (`wear.py finish`): each open edge walked as an ordered loop, smoothed along itself,
  and turned back inside as a band (in 0.035 dm, back up 0.11). Stand and fold collars are swept along
  the smoothed neckline as one profile (`_collar_rows`), fading out down a V's front; lapels down a deep
  V. The hood keeps its old builder. A skirt piece's top (where it joins its top's hem) is left alone.
- **Details in the cloth's shader** (`life-wear.ts DETAILS`, `foldPiece`'s `lifeDetail`): a placket and
  its buttons (with holes), a short placket (polo, henley), an open front with its edge's shadow and
  buttons (coats, cardigans, blazers), a chest pocket, ribbed hems and cuffs (fading before the rib is
  smaller than a pixel), a waistband with belt loops, a fly's J-stitch, scooped or slanted front pockets,
  pointed back pockets, side seams, a leg's outseam and inseam, a sleeve's seam under the arm, and jeans'
  gold topstitching. All uniforms: one program for every garment. Placed off the UVs (the torso's u
  round it from the front, v its height — glTF flips v, unflipped in the shader) and the file's levels
  (`detailLevels`: a bottom's top, a top's hem, the neck, a sleeve's end).
- **The torso's folds periodic round the body** (by its angle, the noise off the circle): where its UVs
  wrap at the back the pattern jumped — a seam down the back.
- **Weaves calmer on clothes** (`WEAVE_DEPTH_BY_FABRIC`: herringbone 0.45, boucle 0.4, tweed 0.6, twill 0.8).
- **A limb's UVs round each bone** (shoulder to elbow, elbow to wrist): round one line from the shoulder
  to the wrist the bent forearm ran near it, and the weave smeared into streaks.
- **A top's hips weighted to the hips** (up to 0.75 below the hip joints): with the thighs' weights,
  straightening the legs into our rest pulled its hem into a notch between them. A top's rings wholly
  convex (a bottom's across 90°).
- **A dress's top fitted toward its hem** (`fit_hem`), where its skirt piece takes over; not a coat's —
  what's under it hangs and came through its waist. **A coat's skirt piece 0.45 dm over** what's under
  it all the way down (a sweater showed at its waist, trousers near its hem).
- **The helpers' seams welded** before the cut (vertices in one place made one).
- **A low shoe's sock cut** a little over the ankle (the pack's went up the shin).
- Stills `design/screens/life/p74/close-a…e` (the rounds), `p3e` (the set), `p3w2` (the world).
- Checks: lint, typecheck, unit tests (29) and the people e2e (`avatar`, `people-3d`, `sway`: 4/4) pass.
- **Left:** the dress's flared skirt passes through her hanging wrists (plan 73's); coats have no
  lapels when the V is shallow; the parka's hood still stands off the shoulders; a top's tucked hem under
  a skirt is plain; real drape (cloth simulation) still not done.

### 4 — Hair

Sample first: short, side part, long straight, bob, ponytail, curly. Then the rest of the 25.

- **The shader** (all hair, brows, lashes and beards): a band of light along the strands (two shifted
  lobes, the second tinted by the hair's colour), the tangent from the card's UVs, darker at the roots
  and lighter at the tips, a little variation from strand to strand from the atlas, and soft light
  through the edges.
- **The scalp**: every head gets a painted hairline in the skin shader (a soft density map in the
  hair's colour with fine strand noise) under every style. No more cut edge against the forehead. Bald
  is the skin, buzz and fade are this plus a short shell.
- **Cards from curves** (G3a, `tools/art/life/hair_cards.py`): guide curves per style off the scalp →
  Blender's hair-curve geometry nodes (interpolate, clump, curl, frizz) → cards in three layers (an
  inner volume, a middle and the outer wisps and flyaways) → UVs on **one shared strand atlas** drawn
  by script (strips of thousands of strands with alpha, root to tip, an id per strand for variation).
- **Curly and afro**: many small curled clumps, not one shell. Braids and locs: tubes with strand
  normals on the same atlas.
- **Fit**: on the new bodies' heads, with the hats' new fit (3), weighted to the `hair` joint as 5.5.
- Budget: 8–20k triangles a style, one atlas for all of them.

**Phase 4, the sample built 2026-11-10, for sign-off.** Six styles as strand cards (`hair.py CARDS`,
`make_card_hair`): short, slick (a side part), long (a centre part), bob (side part, a fringe over one
eye), ponytail (to a tie at the back of the crown, a tail of its own) and curly. The CC0 meshes for
short, long, bob, ponytail and slick and the curly shell are replaced (wear.py, hair.py `HAIR`);
curtain and swept stay aliases of bob and slick.
- **A style**: a cap (the scalp's shell, darker than the cards in fine strands of its own — in the
  hair's colour and smooth it read as skin, a bare forehead), and cards rooted on it by area. Each strand
  is combed (away from a part, back, to a tie, out for curls), lifted, pulled down, kept off the cap
  (its nearest point, along its normal) and laid on it by `hug` — the body's own surface the same way
  under the neck — and curled round its path for curls. A ribbon lies along it, flat to what's under it,
  nearly rectangular (tapered to points they read as shards), a column of the strand atlas. An outer
  layer of finer cards for volume; a cover of short cards over the top on long styles (the cap showed
  between the long ones); a ponytail's tail of 320 cards from its tie.
- **The atlas** (`textures`): 1024 px, four columns of ~260 fine strands each (width, length, sway and
  shade of their own, darker at the root, thinning to the tip), bunched to the card's middle — strands to
  its edges showed every card's outline, a plank.
- **Skinning**: a card's vertices under the neck go with the body vertex nearest them (the back, the
  shoulders), not their root's (the head) — rigid with the head, a long strand swung through the throat
  with every turn of it.
- **Traps found on the way**, each a stray strand somewhere: the body's hull (round a vertical axis) is
  as wide as the ears at their height and as the shoulders at theirs, and shoved strands out sideways —
  over the head the cap's surface, under it the body's, are what strands keep off; at the nape and under
  the ears the cap faces the comb's way, and the comb projected on it collapsed to a random direction
  (falls down and back there); behind the ears a projected comb leaned forward (never forward there); the
  head's kind runs down the neck under the skull (not rooted there — the forehead and temples kept);
  regular combing to the side left the forehead bare (framed: to the side and down).
- **The hair's light** (`life-people.ts HAIR_PIECE`): along the strands — two shifted lobes (Kajiya-Kay),
  a faint near-white one and a wider one in the hair's colour, broken up strand to strand, the strand's
  direction from the texture's v (the cards' and the cap's run along it); the diffuse wrapped a little.
  Every hair but beards.
- **Budget**: a hair file 22k triangles and 1.4 MB (`life-budget.test.ts HAIR_FILE`; 12k and 0.6 a
  garment): short ~11k, slick ~12k, bob ~19k, ponytail ~19k, long ~21.9k, curly ~21k.
- Stills `design/screens/life/p74/p4a` (the rounds), `p4b` (close, each style), `p4` (the line-up), `p4w`
  (the lobby). Tests: budgets, unit (29) and the people e2e (4/4) pass.
- **Left**: the other styles — the pack's wavy, braids, pixie and spiky, and the made shells (buzz, crew,
  fade, undercut, mohawk, cornrows, afro, bun, topknot, high ponytail, pigtails, locs) — still as they
  were; a stray strand or two on the long style; the cap's edge is the mesh's (soft-hairline on the skin
  not done); hats sit over hair that pokes out under them.

**Phase 4, the sample refined 2026-11-10 (the user: "refine these first").** Close stills of each style
from the front, three-quarter and back (`design/screens/life/p74/p4c`) showed rows of cards as shingles,
the cap shining through, flat "wet" long hair, kinked strays, the cap's hard edge, curls as zigzags and
pale grey streaks. Built:
- **The atlas**: strands fade in over the first tenth from the root — a card's start was a hard edge
  across it.
- **A card's normal bent across it** (`HAIR_PIECE`, its column a quarter of the atlas), round as a lock —
  flat, each caught one even highlight, a block.
- **The highlights warm**: the near lobe tinted by the hair's colour (white, it laid pale grey streaks
  over brown); no sheen, little of the sky (0.25, specular 0.35) — facing up and at grazing angles they
  were pale patches.
- **The cap** inset 0.14 dm from the hairline and lit plainly (rough, no strand light: `CARD_CAP`); **a
  hairline of fine strands rooted on the skin** between them — the forehead, the temples and the sides
  over the ears (round the back they hung on the neck as tufts).
- **Paths smoothed** along themselves (kinks where a strand met the head or the body).
- Long and bob fuller (cap 0.13 dm, lift 0.12, hug 0.45); short denser with a cover; curly's ringlets
  narrower and smoother (12 segments for 2.2 turns: fewer segments a turn read as zigzags), with a
  cover over the top (its dark cap showed).
- Budget: a hair file 28k triangles (curly ~26k).
- Checks: budgets and unit tests (29) pass; people e2e: people-3d and sway pass, avatar failed once in
  the combined run and passed alone (2/2) — the heavier hair files load slower; watch it.
- **Left**: a stray strand or two at a bob's ends; the remaining 16 styles; hats over hair.

**Phase 4, the rest of the wardrobe built 2026-11-10.** All 22 hairs now (stills
`design/screens/life/p74/p4d`, contact sheets `sheet-front|threeq|back.png` there):
- **Strand cards, ten more** (`CARDS`): the pack's pixie, spiky and wavy (their CC0 meshes dropped), and
  the made crew, undercut, mohawk, bun, topknot, high ponytail and pigtails (their shells dropped). The
  generator gained: `ties` (each strand to its nearest — pigtails' two, a tail from each, out to its
  side); `comb: up` (stood up off the head, out and up — spiky, a mohawk); `strip` (roots and the cap down
  the middle only — a mohawk's bare sides); `top_only` (roots only over the crown — an undercut's shaved
  sides under its dark cap); `bun` (a lumpy round over the tie in the cap's strands — bun, topknot).
  Tails spread at the tie and fanned as they fall (from one point a thin bundle).
- **Shells, five kept** (buzz, fade, cornrows, afro, locs' scalp): in the cap texture, matte (an afro's a
  fuzzy mottle) — in the old streaks and the strands' light they read as plastic helmets. The game draws
  every made style's main piece as a matte cap (`CARD_CAP`: all but the pack's braids).
- **The hairline soft on every cap and shell**: their UVs by height over the hairline (`_cap_uv`), the
  cap texture fading in over ~0.3 dm from it, broken strand by strand (`_cap_alpha`) — the mesh's edge
  stepped a row at a time.
- The pack's braids stay its own mesh.
- Checks: every hair within its budget (28k triangles, 1.4 MB); unit tests (29) and the people e2e
  (avatar, people-3d, sway: 4/4) pass. World stills `p74/p4w`.
- **Left**: locs are blocky tubes; cornrows' and fade's shapes are subtle beside buzz; hats over hair.

### 5 — Beards

- **On the skin** (G4a): a beard density and length map on the face's UVs per style (stubble, short,
  full, goatee, moustache, chinstrap, muttonchops). The skin shader darkens and tints by it, with fine
  strand noise in its normal. Stubble and short beards are only this.
- **Cards** for full beards, goatees and moustaches: short cards on the hair atlas and shader, rooted on
  the density map, combed down the face, with wisps at the jaw and the cheek line. They move with the
  talk and smile morphs.
- **Colour**: the hair's colour, a little darker and more varied, with optional grey.
- Stills at talking distance, talking and smiling, from the front and in profile.

### Hair and beards: the turn (2026-11-10)

After phase 4's 22 hairs and the first beards, the user: "This hair and beard is not looking good
man… Maybe we need to think on a alternative or a technic?" Four techniques were sampled side by side
(`design/screens/life/p74/samples/compare.png`):

- **Fur shells** (ours: layers over the skin, strands cut in the shader): good for beards, stubble,
  buzz and fade. Kept.
- **Sculpted masses**: failed (jagged shelves, a see-through helmet). Dropped.
- **Cards baked from real strands** (Cycles): a fine texture, but the card layout was the problem.
  Kept only as the strand sheet the shaggy cut is re-textured with (`bake_hair_atlas.py`, `SHEET=1`).
- **Others' work**: MakeHuman's CC0 hairs in the new light (crew, slick, pixie kept), then Sketchfab
  CC BY 4.0 hair. The user: "Only use complete hair" — only works that ship with their own textures
  (Vincent Page's free collections don't; dropped). 10 women's and unisex hairs, and for men (little
  hair-only on Sketchfab) the hair and a beard taken off four whole CC BY characters.

How the works are made ours (`hair.py make_imported`, `sf_extract.py`, the list in `sources.json`):
each one's head measured (its character's skin, or the band under the hair's top), fitted onto ours,
lifted off the scalp locally (a card moved whole, never more than 2.5 cm), our fur laid under it (a
buzz scalp, a fade for shaved sides), the heaviest trimmed at extraction. Rejected on the way: rips
(Capcom, game characters, DAZ and Reallusion content, re-uploads).

The beards ("optimize the beards"): every wardrobe style is our fur cut to its ground
(`beard_density`), with the Sketchfab beard's strands kept where the style grows and shortened for the
short ones (`make_beard_fur`). The fur sits on a decimated copy of the skin, with no texture: a full
beard 36k → 15k triangles, 1.9 → 0.77 MB. Stills: `p74/men/beards-before-after.png`,
`p74/complete/before-after.png`, `p74/men/before-after.png`; the wardrobe as shipped:
`design/screens/life/p75/wardrobe.png`.

### 6 — Checks

- Budgets (`life-budget.test.ts`), the people's chunk, the crowd's frame (`/dev/life/crowd`, 40 and 80,
  as 4.5 and 5.7 measured them).
- e2e under `playwright.life.config.ts` (the people set, as in 5.7).
- The line-up again into `design/screens/life/p74/after/`, then before and after on one page for
  sign-off.

## Risks

- **Cloth simulation headless** may not settle every garment the same way run to run. Fix its seed and
  frame count, and keep (b) for the stubborn ones.
- **Three bodies per garment** triples simulation time. `build_all.sh` already runs per body, so cache
  by input hash.
- **MSAA on a half-float target** costs memory and bandwidth on Medium. Measure before turning it on.
- **Rig fit**: new bodies move the joints a little. 4.6's checks catch it.
- **Download**: normal and AO maps per garment, and a hair atlas. Set a budget in phase 0.

## Open questions

- Faces and skin: the skin reads a little orange and plastic in the stills. Not in the ask; a phase of
  its own after this if wanted.
- Should a person's body be a slider (weight and muscle) in the avatar editor instead of three bodies?
  Out of scope here; morphs from phase 2 would allow it later.

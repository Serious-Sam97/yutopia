# 59 — The character

The person's design looked at again: a slimmer middle, a leaner face, and a more grown-up,
better-finished design. Planned 2026-10-31. Mocks are in `design/chars-3d/pass/`.

## Where we are

- **The belly.** It was asked for on 2026-10-17 and now reads as pot-bellied, worst from the side.
  - `torso.belly` 0.42 swells the front of the trunk 42% at its middle (`Body.swell`, a bell at
    0.5 T).
  - The waist (0.47) is nearly as wide as the chest and the hips (0.5): a tube.
  - Every top and bottom is laid over the same trunk, so the clothes bulge with it.
- **The face.** It reads chubby.
  - The head's outline (`HEAD_ROUND`) is widest at 0.42 of its height: the cheeks, just under
    the eyes. It stays wide down to a round jaw.
  - A button nose and big dot eyes.
- **No jaw, a double chin.** The head is a lathe: one outline turned round its axis, so its
  underside is a round bowl, as low behind as at the chin, with the neck stuck into its middle.
  From the side and three quarters nothing says jaw: chin, jaw and the back of the skull are one
  curve, and the shade under it reads as a double chin.
- **The design reads young and unfinished.**
  - About 5.5 heads tall, which is chibi, on a short neck with big shoes.
  - The quiff (`hair.tuft` 0.9) stands up on every hairstyle.
  - Flat colour: the body's material is unlit (`MeshBasicMaterial`). The world's light only
    tints it by where the person stands (a lightmap), so nothing shows a form's turn: no
    volume, paper cut-outs.

## The idea

**Serious means the design, not the face.** No frown: the face stays calm. What changes is
grown-up proportions and a finish with volume. The style stays ligne claire, ink and flat
colour (the art direction of 2026-10-22). The skin is never touched.

1. **Lean** (`LOOKS.lean`):
   - The body: the belly cut to a fifth, the waist −10%, the hips and the trunk's depth −7%, the
     chest +4%.
   - The face: the cheeks and jaw drawn in (`head.lean`, up to −13% at the jaw, the skull kept),
     the head 4% narrower.
2. **Mature** (`LOOKS.mature`, lean plus):
   - **A smaller head on the same body.** The head is 10% shorter, so about 6.1 heads tall. Every
     size measured in heads is rescaled to match, so the body itself doesn't change. The trunk
     gets the height the head gave up.
   - A longer neck, feet 10% smaller, shoulders 5% wider.
   - A finer face: a nose with a bridge and a calm mouth (half the smile).
   - Real eyes (`face.iris`), 35% bigger:
     - an almond white, an iris, a pupil and a glint on the light's side;
     - a heavy upper lid flicked out at the corner, and a fine lower one;
     - the white blinks with the eye; the iris, pupil and glint look about together, as far as
       the white lets them (`bake.ts` slides them by the eye's size, not each piece's own).
   - The eyes blink as eyes with lids do (`bake.ts`): the lids (tagged "lid") come down and up
     to the middle of their own eye's white, which with the iris squashes all the way away under
     them; as they meet, a shut line (its own decal and morph, "shut", kept to a point till then:
     `setFace` opens it over the blink's last third) draws the closed eye with the lid's weight.
     The look slides the iris less, so it stays in the white.
   - Hands with four fingers (`hand.fingers`), thinner to the tips. The index finger is kept clear
     of the thumb's weights, or it's dragged up the forearm.
   - Inked folds on tops (`folds`): creases fanning in from under each arm and pulled in at the
     waist, as ligne claire draws them.
   - The quiff gone, and the hair in fewer locks, 40% wider and flatter (`hair.flat`): long
     hair reads as four or five big locks from behind, not a fringe of strands.
   - A bob cut square (`hair.blunt`: its locks blunt, not pointed) and its cap down over the nape
     (`hair.nape`, long hair too): no skin between the locks' points behind.
   - The hair 30% closer to the head (`hair.thick`): less of a wig. Then the wider locks hung over
     the cheeks and the fringe over an eye, so the fringe keeps its old width (`hair.fringe`)
     and the locks round the sides start further back (`hair.side`, 1.2 rad from the front, not
     0.95). Hats, beanies and headphones sit on it as before (they read its height).
   - A jaw (`head.jawLine`, `jawLine()` in `build/head.ts`). Once everything is on the head (the
     face, ears, hair, a beard, glasses, a hat), its space is warped together, so nothing comes
     loose:
     - low on the head, the further back the higher (up to 0.17 hh, gone by 0.5 hh so a hat's
       brim stays level): the chin stays the lowest point and the underside rises behind it to
       the nape, where the neck meets the skull;
     - a corner to the jaw under the ear, out at the side (a square jaw most, a pointed one
       least);
     - the chin a little forward.
     The face's front hardly moves (the eyes, the mouth). Only points move: no more triangles.
   - The head shaped round it, not one outline turned (`head.form`, `headForm()`): the radius
     varies with the angle round the head too — the back of the skull out, a forehead narrower
     than the skull behind it, cheekbones and the hollow under them, the brow over the eyes.
     `HeadShape`'s `at`, `normal`, `front` and `R` all read it, so the face, the hair, beards,
     glasses and hats stand on the new surface; the sides keep the outline's width, where
     headphones, earrings and a cap's brim hang. Without a form the old formulas run, exactly
     (today's people, diffed: not a pixel moved).
   - The ears set back round the head and a touch lower (`face.earBack`), standing off it a
     little, out over the hairline, and 20% bigger.
   - The neck's front (with `anatomy`): its cords inked from under the ears down to the hollow
     between the collarbones (close up), and an Adam's apple on the masculine (`neck.apple`, set
     by the gender).
   - `nojaw` is mature without the jaw, the form and the ears set back, to compare:
     `/dev/chars?looks=nojaw+cel,mature+cel&head=1&y=1.5`. The sheets take a look too:
     `/dev/chars?sheet=hair&look=mature+cel`.
   - Shoes shaped as shoes (`foot.shape`), not a profile pushed straight across: round at the toe
     seen from above, the heel drawn in, the top narrower than the sole, a higher toe box. Only
     points moved: no more triangles.
   - The hands 12% bigger. The bend of a curl is spread down the fingers (their weights ramp from
     the knuckle to the tip), so a relaxed hand curves rather than folds into a hook.
   - The gaps between the fingers are round, not points: the extrusion's bevel shoots a point out
     into a long spike (it showed as ink marks up the forearm).
   - The seat drawn in (`torso.seat`): the bottom of the trunk is 24% shallower front to back
     near the bottom, so it sits between the thighs, not round below and behind them.
   - The bust's rounds taller and a little smaller (`torso.bustH`): no point in profile.
   - Folds on the sleeves and trousers too (`limbFold`): from the armpit down a short sleeve, in
     the crook of the elbow and bunched at the cuff on a long one; whiskers off the crotch (not on
     trousers, which have their crease), behind the knee, and where the hem breaks over the shoe.
     Every fold is a flat tapered strip (`ribbon`), fewer and curved: they read as strokes, not
     scratches. The waist's pull is on one side only.
   - A skirt's hem waved in and out between seven folds, more the lower, with a fold's line up
     from each hollow. The hollows fall on the nearest level's columns (28, every fourth), or the
     faces across a hollow bury its line.
   - Arms and legs shaped (`anatomy`, `Body.limb`): the deltoid's cap out at the side, the biceps
     in front and the triceps behind, in at the elbow; the forearm's muscle high on the outside,
     down to a wrist deeper than it's wide; the quads, in above the knee, the kneecap; the calf
     high behind and fuller on the inside, the shin flatter, a slim ankle. More rows down a limb
     and fewer to its round ends (mostly inside the next part), so it costs about what it did.
   - The clothes over them shaped too, less: trouser legs show the knee and calf (cargo least),
     sleeves the shoulder, biceps and forearm (loose tops least). The folds on them follow the
     shaped surface, or they'd sink into it.
   - Seams and stitching, as lines only (creases: in the ink, not the body's triangles), close
     up: down each side of a top a little behind it and on over the shoulder to the neck; a
     stitched line just above the hem of a top (not a knit's band) and of a short sleeve; jeans'
     back pockets.
   - A broad body kept broad (`LOOKS` take the body): it keeps half its belly (not a fifth), its
     waist and depth, and a stronger neck. Without it the three bodies came out nearly alike once
     the belly was gone.
   - A skirt hangs from the hips as deep as the trunk was before the seat was drawn in
     (`Body.squash(…, seat = false)`): drawn in with it, a seated thigh came through the skirt's
     front. Its hem's waves fade out in front, over the thighs.
   - Necklines sized to the neck's root (`tops.ts`, with `trap`): the neck spreads into the
     trapezius there, and a neckline sized to the neck itself sank inside it — the crew ring, a
     shirt's or polo's collar tabs (also set a little lower, off the steep, narrow top round the
     neck), a turtleneck's foot (it floated as a band mid-neck), the hood (drawn in with the
     trunk's top, it shrank to a lip). The neck 10% shorter than before.
   - The shoulders sloping down from the neck (`torso.trap`, the trapezius), the neck spread into
     it at its root. The slope is kept near the neck: lowered at the shoulder's point, the sleeve's
     top pokes out and shows as a ring.
3. **Cel shading** (`celShade`, `+cel` on the page):
   - The side of each form turned from a light over the viewer's left shoulder (a three-quarter
     key, so the shadow is on the far side, not down the middle) takes a cool shadow tone: two
     tones with a soft edge, soft enough that a garment's slow turn doesn't come out ragged.
   - A warm rim light on the lit side's edges.
   - A little darker toward the feet, standing in its own shade.
   - It gives faces, arms and folds volume, matching the world's faceted look. This is the
     biggest single step up in quality in the mocks.
4. **Muted clothes** (optional, `+muted`):
   - The clothes halfway to grey and a little darker.
   - In the world this would be the editor's swatches and the folk's seeded looks.

All of it works on top of the body types and genders. The feminine chin gets a point and the
masculine jaw stays square (`3-face-feminine.png`, `4-face-masculine.png`).

## The mocks

- `/dev/chars?looks=now,lean,mature,mature+cel&who=0` shows one person in each look, front and
  side.
  - `&head=1` comes in closer (use two looks); `&y=0.8` closer at that height (the hands, the
    seat); `&back=1` the back for the front; `&hair=short` shows the jaw.
  - `who=0..3` picks one of the cast.
- `/dev/chars?look=mature+cel` (or `mature+cel+muted`) shows the cast's row in one look.
- The new params default to today's look. Only the dev page asks for a look (a `look` key on the
  avatar, read by `paramsFor`) or the cel material, so the world is unchanged.
- Stills:
  - `0-before-after` the cast today, then in mature + cel
  - `0-now-turn` today
  - `1-body` the four looks
  - `2-face` the face
  - `3-face-feminine`, `4-face-masculine`
  - `5-cast-mature-cel`, `6-cast-mature-cel-muted`
  - `7-hands` today's hands and the new ones
  - `8-seat` today and mature, front and side, then from behind
  - `9-folds` the folds on a sweater and jeans
  - `10-hair` the hair today and mature
  - `11-limbs` bare arms and legs today and mature (a tee and shorts)
  - `12-skirt` a skirt today and mature
  - `13-neck` the neck and shoulders today and mature
  - `14-fitted` jeans and a tee today and mature
  - `15-hair-back` long hair from behind today and mature
  - `16-bob` the bob today and mature, front then behind
  - `17-seams` a tee and jeans from behind today and mature: the seams, the stitching, the pockets
  - `18-shoes` sneakers today and mature
  - `19-hair-faces` long hair and the bob today and mature, front and side
  - `20-jaw` the four of them today and mature, front and side: the jaw, the head's form, the
    ears, the neck
  - `21-jaw-beards` a full beard, a goatee and stubble with glasses, today and mature
  - `22-head-form` a bucket hat's brim level; without the jaw and form, then with them
  - `23-necklines` turtleneck, shirt, polo, hoodie, tee, jacket today and mature
  - `24-sheet-tops` every top in mature
  - `25-sitting` sitting and typing in a skirt, today then mature
  - `26-bodies` the three bodies in mature
  - `29-face-moving` open, half shut, nearly shut, shut, talking, looking (feminine, masculine):
    `/dev/chars?looks=mature+cel&head=1&blink=0.5` (`&talk=`, `&eyesX=`, `&eyesY=` too)
  - `30-lods`, `31-crowd` mature at each level of detail; thirty of them in a crowd
    (`?lods=1&look=mature+cel`, `?crowd=30&look=mature+cel`)
  - `27-motion-base`, `28-motion-social` mature moving: walk, run, talk, sit, type, a sip; a wave,
    a high five, a fist bump, cheers, a hand-over (`/dev/chars?anim=base&look=mature+cel`)

## More quality, next (not mocked yet)

- **Light from the world.** The shade's light keeps to the camera in the mock. In the world it
  could follow the sun and the lamps, and lean darker at night.
- **Clothes.** Hems and cuffs with real thickness (they're stitched lines now).

## The head, further (not mocked)

- The head's form is still bells laid on a turned outline. A head lofted between drawn outlines
  (the face from the front, from the side, the skull from above) would be the next step, if the
  bells run out.
- A bucket hat sits down over the eyes, today too.

## Fixed on the way (today's look too)

- A hoodie's strings ran straight from the collar to the chest, so a fuller chest swallowed
  their middle. They follow the chest's surface now. Today's hoodie looks the same, less the
  tips that poked out.
- The face's drawn parts (eyes, brows, mouth, a beard's edge) were whole bevelled slabs, back and
  walls included, though only their front is ever seen. Only the triangles facing out are kept
  now (`frontOnly`): the same to the pixel (a still of today's faces, diffed), about 3,600 fewer
  triangles near, 1,300 between, 400 far.

## The ceiling

Every person is built in code from lathes, capsules and extruded outlines (`build/`). That's
why any look can be made at runtime and why the chunk is small, but it caps the quality. Lathes
give no anatomy (no collarbones, shoulder blades, knees or wrists), clothes are shells over
tubes, and the face is decals on an egg.

The step past the ceiling is **authored models**: a base body and the wardrobe modelled and
sculpted (Blender), skinned to the same 29 joints, with clothes and hair as swappable meshes,
drawn with the same ink and cel shade. The animation (plan 58) carries over, since it drives
joints, not shapes. It costs a lot: the art itself, an asset pipeline (glTF, compression, lazy
loading) and a bigger download.

## Open questions (the user's call)

- Code-built people pushed further (chosen, round after round), or authored models later?

## In the game (2026-10-31)

The user chose mature with the cel shade, and no muted clothes (the clothes keep the colours people
pick).

- `params.ts`: mature folded into `BASE` (written as the arithmetic it was: `M`, the head 10%
  shorter, and the rest), broad's own in `BODY.broad`, the feminine bust in `GENDER`; `LOOKS` and
  the avatar's `look` key gone. A throwaway test checked the fold against the old base plus the
  old function for every body and gender: equal.
- The cel shade on the world's body materials (`tp/view.ts`, both the near and the see-through
  one, chained after the light and the far leg's shade: the light multiplies it, so the rim
  doesn't glow in the dark) and on `bodyMaterial()` (kart drivers, the dev pages).
- The neck shortened after (`neck.len` 0.1 / M of a head, from 0.21 / M): on the smaller head it read
  too long. Four lengths compared (`32-neck-lengths`: today's, 0.15, 0.1, 0.06); at 0.06 the neck
  was nearly gone. Collars, the turtleneck, the hood, a scarf, a necklace and a full beard checked
  on it.
- The arm set up into the shoulder (`arm.socket`, 0.5): the arm's joint was 0.15 of its radius
  below the trunk's shoulder corner, so from the side the arm hung below a round of trunk. Now
  it's raised (0.6 × the radius × socket) and a little out (0.12 ×), the trunk's top over it drawn
  in 5% × socket. At 1 the front came out with a hard corner and a pad-like sleeve top (robocop);
  0.5 keeps the front soft (`33-shoulder`: rows tank ×2 and tee; columns 0, 0.5, 1).
- The neck's root in the middle of the collar (`head.neckFwd`): it was set back 0.08 hh
  (`neckBack`), and from behind or above it cut out through the back of a tee's collar. Now it's on
  the trunk's axis, and the head goes forward with it (still `neckBack` ahead of the neck: the neck
  joins it behind the jaw). The hands' targets at the mouth, chin and ear follow the head
  (`build/index.ts`). `34-neck-centred`: before and after, side and behind.
- The legs longer and the crotch up, the height the same (the user: the crotch "absurdly big",
  2026-10-31). Measured as shares of the height: the hip joints were at 42% (a person's ~52%), the
  crotch at 39% (~47%), the knee at 23% (~28%) — short legs under a trunk whose bottom hung a whole
  thigh's radius below the hip joints, as a deep bowl between the thighs. Now:
  - the legs 14% longer (`params.ts LEG_X`), the trunk shorter by as much;
  - the trunk's bottom a third of the thigh's radius below the hip joints, not 0.95 (`torso.pelvis`);
  - its bowl between the thighs 40% as deep (`torso.bowl`).
  The crotch at about 47%, the knee 25.5%. The motion's legs (`moves.ts THIGH`, `SHIN`: every gait,
  the feet's lock, the hips' heights, the crawl's — `night.ts` read 0.765 for the hips, now `HIP_H`)
  follow them, and a test checks they agree with the body (it found the old 0.352 a hair off the
  body's 0.3519). The strides scale with the legs (`LEG_K`): 14% longer. `35-legs`: before and after,
  behind then in front; `36-bottoms-back`: every bottom from behind.
  Drivers checked (`37-drivers`, old then new): in a kart the new legs sit a little deeper, nothing
  through it; in the sedan the old shins left the feet hanging in front of the seat, the new ones
  reach the floor by the pedals (`car-cabin-day`'s still, the camera aimed into the footwell).
  Not looked at: the ragdoll, Flowmotion's climbs.
- `/dev/chars`: cel shaded by default; `flat` without it, `muted` the clothes muted
  (`?looks=,flat,muted`).
- Checked: typecheck and lint; the client's 87 unit tests (the chars' budgets for every look, the
  skeleton, motion, feel); the build — the page 420.2 of 430 KB, unchanged; Ana and Bia in the dev
  world (`world-shot.mjs` in the session's scratchpad: two logins, the camera aimed by hand).
- `yutopia-chars` is 48.8 KB gzip: the pass's code — the head's form and jaw, folds, seams, the
  limbs, the eyes and their blink, fingers, the shoes. Its budget raised from 45 to 50 by the
  user's call (`tools/budget.mjs`); every budget passes.
- Not run: the e2e suite (some of it red on HEAD already: the known-red list in memory).


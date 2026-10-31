# 60 — The wardrobe

Better clothes, hair and accessories, and more of them. Planned 2026-10-31, after the character
pass (plan 59) put the new body in the world.

## Where we are

Today there are 59 options:

| Slot | Options | Count |
| --- | --- | --- |
| hair | short, long, curly, bun, afro, bob, mohawk, bald, ponytail, buzz, crew, slick, spiky | 13 |
| beard | none, stubble, mustache, goatee, full | 5 |
| top | tee, hoodie, shirt, jacket, sweater, dress, polo, turtleneck, blazer, cardigan, tank | 11 |
| bottom | jeans, trousers, shorts, skirt, cargo, longskirt, joggers | 7 |
| shoes | sneakers, hightops, boots, loafers, sandals | 5 |
| accessory (head) | none, headphones, cap, beanie, beret, bucket, bandana, headband | 8 |
| eyewear | none, glasses, round, sunglasses | 4 |
| extra | none, walkman, scarf, earrings, necklace, backpack, watch | 7 |

Each slot holds one thing in one colour. The colours come from palettes: 12 for clothes, 8 for
hair, plus a few for frames and shoes. The current wardrobe is in `packages/shared/src/avatar.ts`
(`AVATAR_OPTIONS`) and the builders are in `apps/client/src/world/chars/build/`.

### What looks weak

From the sheets (`/dev/chars?sheet=…`), 2026-10-31.

- **Long sleeves** end in a balloon at the cuff: the sleeve's dome plus a cuff ring. This shows
  on the hoodie, sweater, jacket, blazer, cardigan, shirt and turtleneck.
- **The hood** is a flat lip. The hoodie's pocket is a square. The jacket's chest pockets are
  plain squares, and its collar doesn't stand.
- **The dress** is a plain cone, with no waist seam and no shape.
- **Boots and loafers** look like sneakers under trousers. The trouser leg covers the boot's
  shaft and doesn't stack on it. Loafers aren't low.
- **Glasses** have thick, blocky frames. **Sunglasses** are a black slab.
- **Hats:**
  - the bucket hat sits over the eyes (today too);
  - the headband and bandana are thin flat strips;
  - the headphones are thin.
- **Hair:**
  - long hair reads stringy, as many separate locks;
  - the bun is a small ball;
  - there is no parting or hairline.
- **Small extras** vanish at play distance: the watch, the earrings, the necklace and the walkman
  are a few pixels each.
- **A world of snow** has no winter clothes: no coat, puffer, snow boots, gloves or earmuffs.
  The campus is snow-covered (the world is real, no themes).

### The limits

- **Code size.** `yutopia-chars` is 48.8 of 50 KB gzip. Writing every new item as its own
  builder, as today, would blow it. Items have to be data on a few shared builders (below), or the
  wardrobe moves to a chunk of its own with its own budget.
- **Triangles.** The worst outfit is 57,461 of 60,000 near. Long coats, big hair and layers need
  room. Skin under clothes is skipped only for whole limbs (legs in trousers, arms in long
  sleeves). The trunk under a top is still built.
- **Saved data.** A slot's value is any short slug, so new options in the existing slots need no
  server change. New slots, such as an outer layer, a second colour or a pattern, need changes in
  four places: `WorldController::updateAvatar`'s rules, `Avatars::DEFAULT`, `parseAvatar` and
  `DEFAULT_AVATAR`.
- **The editor** shows options as text chips (`AvatarEditor.tsx`), named in English only
  (`NAMES`). At 100+ options, words stop working: it needs pictures.
- **The folk.** `avatarFromSeed` must keep every bot's look as it is. New items only reach the
  folk through new draws added after the old ones.

## The idea

1. **Garments as recipes, not builders.** One top builder reads a recipe:
   - the sleeve: none, short, three-quarter or long; fitted, regular or loose; cuffed or plain;
   - the hem's height and the fit;
   - the neckline: crew, V, collar, hood, zip, turtle or scoop;
   - the closure: none, buttons, zip or open;
   - pockets, and a hood.

   Bottoms and shoes work the same way: bottoms by leg width, length, rise, waistband and cuff;
   shoes by profile, shaft height, sole, toe and laces. A new item is then a few lines of data,
   not a hundred of code. Today's eleven tops become recipes first; they must come out the same
   or better.
2. **Quality first, on what's there.** Fix everything in "What looks weak" before adding items.
   It's what people already wear.
3. **More of everything, in batches that fit the world.** Winter first, then everyday and the
   office, then hair. For example:
   - **Winter:**
     - tops: a puffer, a parka (long), a fleece, a raincoat;
     - shoes: snow boots;
     - head: earmuffs, a pom-pom beanie, a trapper hat;
     - hands: mittens or gloves;
     - eyes: snow goggles.
   - **Everyday:**
     - tops: a long-sleeve tee, a flannel overshirt, a denim jacket, a sweatshirt, a henley, a vest;
     - bottoms: chinos, wide-leg trousers, overalls, leggings, a pleated skirt;
     - shoes: running shoes, Chelsea boots, flats, slip-ons.
   - **The office and the rest:**
     - tie, lanyard with a badge;
     - a crossbody bag, a tote, a belt, bracelets;
     - aviators, cat-eye glasses, half-rims;
     - a flat cap, a visor, a hair clip.
   - **Hair:** a pixie, braids, locs, a wavy shoulder cut, a top knot, an undercut, pigtails, a fade,
     cornrows, curtain bangs, a high ponytail.
   - **Beards:** a chinstrap, mutton chops.

   That's about 50 new options: from 59 to about 110.
4. **Detail that reads at play distance.** Small items scaled up a little, stylized the way the
   heads are: a bigger watch face, earrings that catch a highlight.
5. **Room for it.**
   - The trunk under a top is not built where the top covers it.
   - Feet are not built inside shoes.
   - Heavy items (long coats, big hair) get their own LOD steps.
   - Everything stays in the triangle budgets, checked by the existing test, which covers every
     option.
6. **Choosing it (the editor).** Each option is a small picture of itself, rendered by the same
   builder (a thumbnail per option and colour, cached). The editor gets:
   - tabs for head, top, bottom, feet and extras;
   - Portuguese and English names.

## Bigger changes

- **Layers.** An outer slot, so a coat, jacket or vest can go over any top (a hoodie under a
  parka). This needs a new saved slot and the server's rules. It is also what makes winter look
  right. Without it, a coat is just another top.
- **A second colour per garment.** Trims, a sole, a hat's band and a jacket's lining get their own
  colour. One more saved field per slot.
- **Patterns.** Stripes, plaid, checks and denim, drawn in the cel shader in each garment's own
  space (no textures). A pattern slot per garment. This is the biggest jump in variety for the
  least geometry, but it's new shader work and touches every garment.
- **A free colour picker** next to the palettes. The server already takes any colour.

## Phases

0. **Mocks.**
   - Quality fixes on today's items, before and after.
   - Five or six new items, one per slot (a puffer, snow boots, earmuffs, braids, aviators, a
     crossbody bag).
   - A layer (a parka over a hoodie) and a pattern (a plaid shirt).

   All on `/dev/chars`, for sign-off on the look.
1. **Foundations.**
   - The recipe builders, today's items rebuilt on them (diffed against today: the same or better).
   - The hidden-skin skip.
   - The chunk measured.
2. **Quality pass** on everything listed above.
3. **Winter batch.**
4. **Everyday and office batch.**
5. **Hair batch** (and the beards).
6. **Layers, second colour, patterns, the free colour picker.** New saved fields: `outer` and
   `outerColor`, a second colour and a pattern per garment. They go in the server's rules,
   `Avatars::DEFAULT`, `parseAvatar` and `DEFAULT_AVATAR`, plus the editor. Old saved looks read as
   no layer, no pattern and the main colour twice.
7. **The editor**: thumbnails, tabs, names.
8. **The folk.** New draws in `avatarFromSeed`, appended, so old bots keep their looks. The
   townsfolk dressed for the weather.

Each phase ends with:
- its sheets;
- the chars tests: every option at every LOD, finite and in budget;
- the awkward pairs: every hat on every hair, coats sitting and in cars, backpacks in seats, long
  hair with hoods;
- first-person arms, since the sleeves show there;
- the page budget.

## Phase 0: the mocks (2026-10-31)

Behind a switch, so the world is unchanged. The mocks only show when the avatar carries
`wear: 1` (`params.ts` `wear`), which only `/dev/chars` sets: the `new` variant, e.g.
`?looks=,new&who=1&top=sweater&y=1.05`. Every sheet of today's look was diffed against the
committed code, pixel for pixel: identical.

The mock slots are extra keys passed on the page's query, not saved anywhere yet:
- `outer=parka&outerColor=…` for the layer;
- `topPattern=plaid|stripes&topColor2=…` for the pattern;
- the new items as slugs in their slots: `top=puffer`, `shoes=snowboots`, `accessory=earmuffs`,
  `hair=braids`, `eyewear=aviators`, `extra=crossbody`.

### Fixes (`design/wardrobe/1-fixes.png`: today's pair, then the new one)

- **Long sleeves** tapered to the wrist, with a cuff: a ribbed band on knits, a turned cuff on
  shirts and jackets. No more balloon.
- **The hood** a hood: its bowl lies down the back from the neck, with a thicker roll round the
  neck. **The pocket** has curved openings and round corners.
- **Boots** read as boots. The trouser leg stops above the shaft and sits wider, stacked on it.
  Laces cross up the front.
- **Glasses** with finer frames. **Sunglasses** tinted, not black, with a glint across each lens.
- **The bucket hat** up off the eyes, its brim flatter. **The bandana** wider, with a fold line and
  a bigger knot. **The headband** a band you can see.
- **The bun** bigger and up on the crown's back.
- **The watch** with a bigger face and a pale dial. **The earrings, necklace and walkman** scaled
  up so they read at play distance.

### New (`design/wardrobe/2-new.png`)

- **Puffer:** a stand collar, a zip, bands of down round it.
- **Snow boots:** a rubber foot, a fur cuff, the trousers tucked into them.
- **Earmuffs:** fluffy muffs over the ears on a thin band.
- **Braids:** a middle part, two plaits down the back of the shoulders, tied, swinging on the hair's
  spring.
- **Aviators:** teardrop lenses, a wire frame, a double bridge, a brown tint.
- **Crossbody bag:** a strap across the chest and back, a small bag on the hip with its flap.

### The layer (`3-layer-parka.png`)

A parka over a hoodie:
- down to mid-thigh, open at the front so the hoodie shows;
- the zip's tapes along the opening, pockets with flaps;
- a hood down the back, fur round the neck;
- big sleeves over the top's sleeves.

Its lower half rides the thighs and swings on the skirt's spring, as a skirt does. Under it, the
hoodie's own hood and strings are left off, since they'd come through. The coat stands well off the
top (1.17 × the trunk), or the top's hem shows through at the waist.

### The pattern (`4-pattern-plaid.png`)

A plaid shirt, drawn by the cel shade:
- two sets of bands and a fine line, in the garment's own space at rest, so it moves with it;
- across a front- or back-facing surface by x, a side by z, up by y;
- stripes are the other kind.

Each vertex carries its pattern and the second colour (`bake.ts` `pat`, `col2`, made only when a
part has a pattern). There is no texture and no extra triangles.

### Measured

- **Triangles,** near / middle / far:

  | Outfit | Near | Middle | Far |
  | --- | --- | --- | --- |
  | parka over a hoodie, long hair, beanie, backpack | 55,388 | 20,354 | 7,778 |
  | puffer, earmuffs, snow boots, afro | 45,148 | 16,294 | 6,244 |
  | braids, crossbody bag, aviators | 50,398 | 18,382 | 7,710 |
  | plaid shirt | 41,602 | 15,644 | 5,990 |

  All are in budget.
- **Code size:** `yutopia-chars` is 52.2 KB gzip with the mocks, over its 50. That is expected: the
  mocks are written the old way, item by item. Phase 1's recipes are how it comes back under.
  Nothing can be committed until then, or until the budget changes.

### Not done in the mocks

- Long hair as masses.
- The dress.
- The jacket's pockets and collar.
- Loafers.
- Small items other than the watch.

These are still on phase 2's list.

## Built: phases 1–8 (2026-10-31)

The wardrobe went from 59 options to 133, and the mocks' switch is gone: everything is in the world.

**Phase 1: recipes.**
- Every top and layer is a `Garment` recipe in `TOPS` and `OUTERS` (`build/tops.ts`), built by one
  `garment()`: hem, sleeve, cuff, ring, collar, turtle, stand, placket, V and lapels, pockets,
  hood, down, the coat's front gap.
- Every bottom is a `Bottom` in `BOTTOMS` (`build/bottoms.ts`).
- Every shoe is a cut in `CUTS` (`build/shoes.ts`).
- A beard is one shell with its edges and a bare front (`build/beard.ts`).
- Hair tails share one `tail()` (ponytail, pigtails, high ponytail).
- The mocks' `wear` switch is folded in.

**Hidden skin.**
- The trunk isn't built under a top that covers it to the seat.
- Under a layer with sleeves, the top's own sleeves, folds and hood aren't built.
- Under a closed layer, the top's chest isn't built either.

**Phase 2: quality.**
- The fixes from the mocks are in.
- The jacket's and blazer's pockets are drawn by recipe.
- Loafers and flats are lower.
- The extras' sizes are increased.

**Phases 3–5: new options.**
- **Tops:** long-sleeve tee, henley, sweatshirt, flannel, crop top, fleece, puffer.
- **Over the top:** parka, coat, puffer, denim jacket, raincoat, vest.
- **Bottoms:** chinos, wide-leg trousers, leggings, overalls, pleated skirt, snow pants.
- **Shoes:** snow boots, runners, Chelsea boots, flats, slip-ons.
- **Head:** earmuffs, pom-pom beanie, trapper hat, flat cap, visor, hair clip.
- **Eyes:** aviators, cat-eye, half-rim, snow goggles.
- **Extras:** crossbody bag, mittens, bracelets, tie, lanyard, tote, fanny pack.
- **Hair:** braids, pixie, wavy, curtain bangs, locs, top knot, undercut, fade, pigtails, high
  ponytail, cornrows.
- **Beards:** chinstrap, mutton chops.

**Phase 6: layers, patterns, second colours, any colour.**
- New saved fields:
  - `outer` and `outerColor`;
  - `topPattern`, `bottomPattern`, `outerPattern`;
  - `topColor2`, `bottomColor2`, `outerColor2`;
  - `shoesColor2` (the sole).
- They are added to `AvatarLayers`, `DEFAULT_AVATAR`, `parseAvatar` (any field with "Color" is a
  colour), `Avatars::DEFAULT` and `WorldController::updateAvatar`'s rules.
- Old saved looks read as no layer, no pattern and the default second colours.
- Patterns are plaid, stripes, check, dots, and `trim` (the second colour on the trims).
- The world server passes the look through `parseAvatar` as JSON, so nothing else changes there.
- The API's tests were not run: they wipe the dev database.

**Phase 7: the editor (`AvatarEditor.tsx`).**
- Six tabs: body, hair, top, bottom, shoes, extras.
- Each option is a button with its picture: the look with it on, framed on what it's about,
  rendered by `IsoPeople.thumb()` two a frame and cached.
- Every option is named in English and Portuguese.
- The second colour and the layer's colour only show while worn.
- A free colour picker sits after every palette.
- The 2D drawing (the fallback without WebGL) doesn't draw the new items.

**Phase 8: the folk.**
- `avatarFromSeed` keeps every bot's look. The slots' option lists are frozen as they were (`SEED`)
  and only appended to: one last draw gives some bots a coat (`outer`), nothing else.
- A test checks bots keep their first slots, and that old saved looks parse.

**Checks.**
- The client's 88 unit tests and the shared package's 446 pass.
- `chars.test.ts` covers every option, plus every layer over a hooded top with big hair, a
  trapper hat, a pack, a beard, goggles and patterns on all three garments. All fit their triangle
  budgets at every level.
- Every sheet is in `design/wardrobe/5-sheet-*.png`, the editor in `6-editor-*.png`, a crowd of
  folk in `7-folk.png`.

**Code size.**
- `yutopia-chars` is 55.8 KB gzip, its budget 50. The recipes made each item cheap, but ~70 new
  options still cost ~7 KB, and most of the new hair, hats, glasses and extras are their own code.
- The user raised the budget to 58 KB (`tools/budget.mjs`); every budget passes.
- The page is 420.6 of 430 KB.

## Double check (2026-10-31)

Every option was looked at close up, front and back. These were fixed (`design/wardrobe/8-check-*`):
- **Afro:** it came out a flat mushroom, since the cap wasn't lifted over the crown. It's round
  now.
- **Stubble:** it was a blocky decal with a hard edge. It's now a thin shell on the head's own
  surface, chin to jaw to upper lip, a tone between skin and hair, under the mouth's line.
- **Flat cap:** its crown was squashed into the hair. It's lifted clear now, then pulled forward and
  down.
- **Long sleeves:** they stepped at the elbow, where the upper half's rolled hem met the forearm's.
  The upper half is closed and round at the elbow now, a continuous sleeve.
- **Locs** read as long hair; they're narrow round ropes now. **Wavy** hair's waves are twice as
  deep.
- **Wide-leg trousers** weren't wide. They're looser, flared to the hem.
- **Overalls:** the straps vanished behind. They cross into an X down the back now.
- **Hair clip** and **half-rims** were too small to read; they're bigger.

Checks: the 88 client tests pass (every option at every level of detail, in its triangle budget).
`yutopia-chars` is 55.7 of 58 KB, the page 420.6 of 430.

## A smart-casual set (2026-10-31)

Seven pieces, added as ordinary options under their own names (not as one character's costume):
- **Sport coat** (`outer: sportcoat`):
  - single-breasted, open in a V over what's under it (`Garment.vcut`: the chest built as a
    cover whose top edge comes down to the V);
  - notched lapels, flap pockets low, a welt on the chest;
  - suede elbow patches (close up only);
  - tweed unless another pattern is chosen.
- **Shirt and tie** (`top: shirttie`): the tie in the second colour. A shared `tie()` now draws the
  extra's tie too.
- **Suit trousers** (`bottom: suit`): a straight leg with a pressed crease, tweed by default.
- **Lace-up boots** (`shoes: laceboots`): a heavy sole, laces up the shaft.
- **Swept-back hair** (`hair: swept`): to the collar, back over the crown and ears, the ends
  turning out, one loose strand at the brow.
- **Boxed beard** (`beard: boxed`): short and full, up to the sideburns.
- **Leather satchel** (`extra: satchel`):
  - across the body from the right shoulder to the left hip;
  - a flap riveted in brass, two straps through brass buckles;
  - it sits over a coat if one is worn.
- **Tweed** (`pattern: tweed`): a herringbone with flecks, in the cel shade. A recipe can carry a
  default pattern (`Garment.pattern`, `Bottom.pattern`).

Double-checked close up, and three things fixed:
- **Tweed:** it shimmered at a distance; the weave is now coarser and softer.
- **Swept-back hair:** it stood off the head like a helmet; it lies closer now, with fewer, thinner
  locks.
- **Layer sleeves:** they flared at the cuff; a layer's sleeve now tapers to the wrist, loose at
  the elbow only.

Checks: the client's 88 tests and the shared package's 446 pass. `yutopia-chars` is within its
58 KB.

## Decided (2026-10-31)

- **All four bigger changes are in:** layers (an outer slot), patterns, a second colour per
  garment, and a free colour picker. Phase 6 builds all of them. The phase 0 mocks show a layer
  (a parka over a hoodie) and a pattern (a plaid shirt).
- **About 50 new options**, as listed: from 59 to about 110.
- **Code size:** rebuild the garments on recipes and keep `yutopia-chars` at 50 KB. Raise it only
  if it's still short after the recipes, and only on the user's say.

## Open questions (the user's call)

- Is everything open to everyone? Today it is: no item is tied to a gender. The plan keeps it so.

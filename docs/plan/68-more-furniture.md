# Plan 68 — More furniture: every category, made rich

Asked 2026-11-03: "plan new furniture for EVERY category, make that rich". Plan 67 gave us the kit
(world/furn: real 3D in metres, cel as the people, looks, story details, true scale, shapes from the
models, pictures from the models, room plans). This plan fills every category of the Furnish panel
with new pieces — and makes the best of them **do something** with what the world already has.

## Where we are

121 kinds in the catalog, 17 categories in the panel. The kit draws all but doors, windows, cars,
stairs, lifts and the name board. What a piece can already plug into, without new systems:

| System | What it gives a piece |
|---|---|
| Seats (SEAT_SPEC, seats3d) | sat on, with its height, front, back, arms, a footrest |
| Hands (HANDS_AT, partsOf, acts) | used standing: a tap, a keypad, keys (the piano) |
| Surfaces (SURFACE, tops) | things stand on it, quarter-tile cells |
| Lights (catalog `light`, art/light.ts) | a light in the room; the dark's lamp pools (survival `inLampPool`: safety) |
| Media (plan 10) | YouTube / Jellyfin on a glass, the room's radio music |
| Live pictures (tp/live.ts) | a canvas on a face: boards, whiteboards, the clock's hands |
| Games (plan 13, slotcar, pool, pong, consoles) | played in the world for everyone to see |
| Warmth (survival, the cold — plans 58/65/66) | a fire by the bench at the park; soaked and shivering |
| Pets (plans 51–52) | beds, bowls, toys (ball, frisbee, rope, feather, laser), play |
| Jolt (plan 50) | solids, things that roll and fall (`ball`, `crate`), Flowmotion grips, ragdolls |
| Switches (mapedit `isLamp`) | the room's switch turns its lamps |

## The design

- **Every piece from the kit**, Rich, cel, true scale, 2–4 looks where it makes sense, a story
  detail seeded by its id, its shape from its model (the column audit and `physics/furniture.test`
  hold it), its picture from its model. No cards.
- **Three tiers**, marked in the tables:
  - ★ **Made** — a model, its looks, sat on / stood on / lit where the kind says. Cheap.
  - ◆ **Hooked** — does something through a system we already have (above).
  - ● **New trick** — needs a small new mechanic (below); worth it for the ones that make the
    world feel alive.
- **New small mechanics** (shared by many pieces, built once):
  1. **Live parts** — a model's named part animated by the client each frame (a fan's blades, a
     cradle's balls, an aquarium's fish, a lava lamp's blobs, a split-flap's flaps, a record
     spinning, a rocking chair rocking under its sitter). Like the clock's hands (tp/live.ts) but
     geometry: a small per-floor group of moving meshes, not in World3's merged buffers; capped
     per room, still when far.
  2. **Words on things** — `props.text` set by its owner (a lightbox sign's letters, a VFD ticker,
     a split-flap board, a door's name plate), drawn as glyphs in the kit (or a live canvas).
  3. **Bounce and swing** — Jolt-side: a trampoline's spring, a hammock's and a swing's sway, a
     zip line's ride (Flowmotion has grips and poles to build on).
  4. **Small games** — new tables in the pool / pong mould (shared state, played in the world):
     air hockey, foosball, darts, chess. Each its own phase; any can be dropped.
- **New categories** (proposed): **Kitchen & café**, **Outdoors** (the snow campus's own), and
  **Seasonal** (put out by admins for a time: a tree, lights, pumpkins…).

## The pieces, by category

### Seating (6 today)
| Piece | Looks | Does |
|---|---|---|
| Egg chair (swivelling pod) | white/teal, wicker, leather | ★ seat; ● turns slowly with its sitter |
| Rocking chair | oak, white, walnut | ★ seat; ● rocks while sat in |
| Hanging swing chair (from the ceiling) | rattan, macramé | ★ seat; ● sways |
| Gaming chair | red, black, white | ★ seat, reclines |
| Window seat / banquette (2×1, built in) | cushions by paint | ★ seat for two, storage under |
| Loveseat (2×1) | velvet, leather, linen | ★ seat for two |
| Corner sofa piece (joins sofas into an L) | the sofas' looks | ★ seat |
| Floor cushions / poufs (cluster) | by paint | ★ seat, low |
| Bleachers (3 rows, 3×2) | timber, steel | ◆ tiered seats (the park stand's rows) |
| Hammock on a frame (3×1) | canvas, striped | ★ seat lying back; ● sways |

### Desks & tables (8)
| Piece | Looks | Does |
|---|---|---|
| L-shaped corner desk (2×2) | the desks' finishes | ◆ surface, two sitters |
| Drafting table (tilted top) | oak, steel | ◆ surface; a lamp clamped on |
| Workbench with pegboard (2×1) | birch, steel | ◆ surface, tools hung |
| Round conference table (3×3) | walnut, white | ◆ surface, six seats round it |
| Dining table (3×2) | farmhouse, mid-century | ◆ surface |
| Nesting tables (1×1) | walnut, brass | ◆ surfaces at two heights |
| Bedside table | oak, white | ◆ surface, a drawer |
| Folding table | white, wood | ◆ surface |

### Storage (8)
| Piece | Looks | Does |
|---|---|---|
| Record crates (flip-through bins) | wood, plastic | ★; ◆ pick a record → the radio plays it |
| Plan chest (wide shallow drawers) | oak, green steel | ◆ surface |
| Glass display cabinet | walnut, white | ★ lit inside; trophies by seed |
| Library ladder bookcase (3×1) | walnut, black | ★ the ladder slides along |
| Mail cubbies (pigeonholes) | oak | ◆ one slot a member, a letter shows when the phone has news |
| Safe | green, black | ★ a dial; ● opens for its owner |
| Shoe & boot rack (by the door) | wood | ★ snowy boots by the weather |
| Umbrella stand | brass, ceramic | ★ wet umbrellas when it rains (weather) |
| Cassette wall rack (wall) | walnut | ★ tapes seeded |

### Office (8)
| Piece | Looks | Does |
|---|---|---|
| Mobile whiteboard (on wheels) | white, glass | ◆ the whiteboard's own drawing, live |
| Punch clock | cream, green | ◆ clock in: your hours today on its card |
| Pneumatic tube station | brass, steel | ● send a held thing to another floor's station |
| Paper shredder, plotter | — | ★ |
| Glass-door drinks fridge | steel | ◆ the vending machine's use (a cold drink in hand) |
| Security desk with camera monitors | — | ◆ monitors show other rooms (live pictures) |
| Fire extinguisher, first-aid cabinet (wall) | red, white | ★; ◆ first aid in survival (heals) |
| Mailroom sorting desk | — | ◆ surface |

### On desks (17)
| Piece | Does |
|---|---|
| Lava lamp | ● blobs rise and fall; a soft light |
| Newton's cradle | ● clicks when someone at the desk is typing |
| Desk globe | ● spins slowly |
| Desk fan | ● spins; ★ papers flutter |
| Snow globe | ● shaken when used: snow inside |
| Small aquarium | ● fish swim; a glow |
| Typewriter | ◆ typed at like the keyboard |
| Headphones on a stand, film camera, walkman, rolodex, pencil cup, hourglass, bonsai, Rubik's cube, a little Vortex figurine | ★ story pieces, seeded |

### Screens & TVs (9)
| Piece | Does |
|---|---|
| Video wall (3×3 panels, wall 6) | ◆ media spread over all nine |
| Split-flap board (departures) | ● flips to show the rooms, who's in, the time, or its `text` |
| VFD ticker sign | ● scrolls its `text` |
| Ceiling projector | ◆ projects on a screen (the projector's media) |
| Security monitor bank | ◆ live pictures of other rooms |
| Outdoor cinema screen (on a frame) | ◆ media, outdoors |
| Radio-TV cabinet (1950s combo) | ◆ media + the radio |

### Game room (10)
| Piece | Does |
|---|---|
| Air hockey | ● a game for two (Jolt puck) |
| Foosball | ● a game for two to four |
| Dartboard (wall) | ● throw darts, the score on a board |
| Chess table (with two chairs) | ● a game for two |
| Pinball machine | ◆ played like the arcade (a pose, its lights flash) |
| Claw machine | ● wins a toy — a pet toy for your pet |
| Jukebox | ◆ picks the room's music (radio) |
| Skee-ball, card table, beanbag toss | ★ / ◆ posed play |

### Play & music (8)
| Piece | Does |
|---|---|
| Drum kit | ◆ played sat on its stool (the piano's way): sounds |
| Electric guitar on a stand + amp | ◆ picked up and played (held, a pose, sound) |
| DJ booth (two decks, mixer) | ◆ the room's music; ● the records spin |
| Synth keyboard on a stand | ◆ the piano's keys standing |
| Karaoke machine with a screen | ◆ media + the mic |
| Gong, theremin, metronome | ◆ / ● struck, waved, ticking |

### Lights (4)
| Piece | Does |
|---|---|
| String / fairy lights (wall, ceiling) | ◆ a soft light along a wall |
| Chandelier | ◆ a big light |
| Lightbox letters / marquee sign | ◆ light; ● spells its `text` |
| Paper lanterns (cluster), Edison bulb cluster, banker's lamp, salt lamp, candles | ◆ light (candles flicker) |
| Floor uplighter, track lights | ◆ light |
| Outdoor festoon lights (between posts) | ◆ light outdoors: a lamp pool in the dark |

### On the walls (10)
| Piece | Does |
|---|---|
| Cuckoo clock | ● the bird on the hour (the world's own clock) |
| World-time clocks (three) | ◆ live hands for three cities |
| Calendar | ◆ today's date, the weather's season |
| Thermostat | ◆ shows the weather; ● sets the room warm |
| Members' map with pins | ◆ a pin for each member (where they are in the world) |
| Pegboard with tools, mounted skateboard, framed records, tapestry, mirror, antlers | ★ |
| Exit sign, fire alarm | ◆ glow, ★ |
| Guitar wall hooks | ★ guitars by seed |

### Doors & windows (16)
| Piece | Does |
|---|---|
| **The 16 redrawn natively** (left from plan 67) | ★ the kit's look, their leaves still swinging |
| Automatic sliding glass doors | ● open as you come near |
| Revolving door | ● turns as you walk through |
| Garage roller door | ◆ open / shut |
| Bay window with a seat | ◆ a window and a seat in one |
| Skylight (roof) | ★ daylight in |

### Decor (6)
| Piece | Does |
|---|---|
| Big aquarium (2×1) | ● fish, bubbles, its light |
| Fireplace (wall) and wood stove | ◆ **warmth** (the cold), a light, ● flames |
| Indoor tree (2×2 fig, olive) | ★ (walked under, like plants) |
| Fountain | ● water, a sound |
| Sculpture / bust, vases, terrarium, trophy, stacked books, hanging plants (ceiling) | ★ |
| Moss wall (wall) | ★ |

### Rugs & floor (2)
| Piece | Does |
|---|---|
| Round rug, runner, cowhide, puzzle mat, welcome mat | ★ by paint |
| Dance floor (3×3 lit tiles) | ● tiles pulse to the room's music |
| Stage risers | ◆ stood on (steps) |
| Floor tape lanes / decals | ★ |

### Pets (6)
| Piece | Does |
|---|---|
| Cat tree tower | ◆ pets climb it, sleep at the top |
| Dog agility set (jumps, tunnel, weave poles) | ◆ pets run the course |
| Ball launcher | ◆ throws a ball (a Jolt ball) for the dog |
| Litter box, pet door, auto-feeder | ◆ the bowls' use |
| Bird cage, hamster wheel | ● a wheel that turns |
| Pet sofa | ◆ a pet bed |

### Parkour (6)
| Piece | Does |
|---|---|
| Vault box, balance beam | ◆ Flowmotion vaults and walks |
| Monkey bars | ◆ grips (Flowmotion) |
| Climbing wall | ◆ grips up a wall |
| Trampoline | ● bounce |
| Quarter pipe | ◆ run up and back down |
| Zip line (between two posts) | ● ride it |
| Cargo net, tyre run | ◆ |

### New: Kitchen & café
| Piece | Does |
|---|---|
| Kitchen island with stools | ◆ surface, seats |
| Range / stove, sink, dishwasher | ★; ● the stove's flame, a light |
| Fruit bowl, toaster, kettle | ◆ things on tops; the kettle like the coffee machine |
| Café counter with a pastry case | ◆ surface, lit case |
| Ice-cream freezer | ◆ the vending's use (an ice cream in hand) |

### New: Outdoors (the snow campus)
| Piece | Does |
|---|---|
| Fire pit with log seats | ◆ **warmth**, seats round it, a light |
| Picnic table (benches attached) | ◆ surface + seats |
| Bike rack with bikes | ★ |
| Bus shelter | ◆ seat, out of the snow |
| Mailbox, street sign, flag pole | ★; ● the flag in the wind (weather) |
| Sled & ski rack | ★ |
| Snowman | ★; ● melts by the weather's rule |
| Bird feeder | ● birds come |
| Outdoor heater (mushroom) | ◆ warmth, light |

### New: Seasonal — and Christmas, made big (the user: "Also Christmas Items!!!!!")
Christmas gets its own family (and goes early: it's November — ready for December).

| Piece | Looks | Does |
|---|---|---|
| Christmas tree (2×2) | classic fir, white flocked, tabletop tree (on a surface) | ◆ its lights (a light in the room, a lamp pool in the dark); ● the lights twinkle; ornaments and a star by seed |
| Presents (under the tree, anywhere) | papers and bows by seed, sizes | ● **a present for someone**: wrapped with a name tag, opened by them only (a little gift: a held thing, a pet toy, a tape) |
| Stockings (on a fireplace or a wall) | red, green, knitted | ◆ a name on each (words on things); full on the 25th |
| Wreath (wall, door) | fir, holly, gold | ★; ◆ on a door's face |
| Garland and Christmas lights (wall, along a counter, a window) | warm white, multicolour, candy | ◆ light; ● twinkling, chasing |
| Mistletoe (hung from the ceiling) | — | ● two people under it: a hug |
| Hot cocoa station | — | ◆ a cocoa in hand (the vending's use), **warmth** |
| Gingerbread house (on a surface) | — | ★ |
| Christmas village (lit, on a surface or a shelf) | — | ◆ tiny windows lit; ● a little train goes round |
| Nutcracker, candle arch, poinsettia | — | ★ / ◆ light |
| Candy-cane path markers (outdoor) | — | ★ along a path |
| Light-up reindeer and sleigh (outdoor) | — | ◆ light; ● a nodding head |
| Inflatable snowman, giant snow globe (outdoor) | — | ● the snow globe's flakes |
| Advent calendar (wall) | — | ◆ today's door open (the world's own date) |
| Gift-wrapping table | — | ◆ wrap a held thing into a present |
| Christmas music | — | ◆ the jukebox and radio's Christmas station in December |

**Other seasons**, smaller: pumpkins and jack-o'-lanterns (a candle light), autumn leaves garland,
bunting and paper chains, a New Year's countdown on the split-flap board.

**Put out for a time**: an admin's "Christmas" switch places a room plan's Christmas set (tree,
presents, lights, stockings by the fireplace) floor by floor — undone in January as any step.

**Count:** about 150 new pieces across 20 categories (17 today + 3 new), plus the 16 doors and
windows redrawn.

## Phases (a family a phase, as plan 67: bench → signed off → world → tests)

0. **Bench + mocks**: a hero of each tier (★ loveseat, ◆ fireplace, ● lava lamp) and the
   "live parts" mechanic proven on one piece; the user signs off the look.
   **Built 2026-11-03** (uncommitted), on the bench (`/dev/furniture?kind=loveseat|fireplace|lava_lamp`,
   `&t=` holds the live parts at a moment for stills):
   - **Live parts** (world/furn/kit.ts `Model.live`, `LiveAnim`: lava, flame, spin, still;
     liveparts.ts `liveGroup`, `animateLive`, `liveAt`): a model's moving parts kept out of its merged
     geometry (`userData.live`), each round its own origin, moved by the clock; a part may be glass
     (see-through, tinted: the lava lamp's vessel); turned with the model's `facing`. On the bench
     and in the panel's pictures (at a moment); not yet in the world (phase 1).
   - **Loveseat** (seating.ts; 2×1 seat for two, SEAT_SPEC.loveseat as the sofa's): velvet with a
     channel-tufted back on brass legs, tan leather with rolled arms, linen in an oak frame.
   - **Fireplace** (decor.ts; 2×1 against a wall, solid): a breast built round an open firebox (sooty
     back and sides), logs on a grate, embers glowing, live flames (teardrops and their hot cores,
     flickering and swaying), the mantel at SURFACE.fireplace 1.15 (things stand on it, top cells
     [1,2,7,3]), a stone hearth; brick (staggered joints), marble (fluted pilasters), modern (a slot
     over pebbles); lit unless `on` false (interact "lamp"), a warm light.
   - **Lava lamp** (desktop.ts; on a surface): metal base and cap, the glass rocket (live, glass),
     four wax blobs rising and sinking on their own clocks, stretched as they move; three colour pairs.
   - Kinds new since plan 67 are `fresh` (native.ts): the kit draws them even unsigned (nothing else
     can), kept out of the panel (not `buildable`) till signed off; the bench has no "Today" for them.
   - Checked: native.test (footprints, the loveseat's seat and the mantel at their spec, flames lit
     and out, the blobs moving, live parts apart from the merged model), shapes, physics/furniture
     (the Jolt walk-in and stand-on: a top narrower than a body — the mantel — isn't stood on);
     shared 534, client 198. Stills `design/furniture/p68/` and two videos of the live parts; review
     https://claude.ai/artifact/1P777MJxTfCwWAT2fcHmMw.
1. **Live parts + words on things** (the mechanics), with a few pieces that need them.
   Phase 0 signed off 2026-11-03 ("Sign off, phase 1"): the loveseat, the fireplace and the lava lamp
   `signed`, `buildable` and in the panel (Seating, Decor, Lights; NEW).
   **Built 2026-11-03** (uncommitted):
   - **Live parts in the world** (tp/build.ts World3 `syncLive`, `animateLive`; native.ts `liveInto`):
     each piece's live parts a group placed as its model is (`frameTurn`, shared with the buffers),
     in World3's own lit/glow materials (the cel mark in the colour's alpha) and a glass one; moved
     every frame within 18 m of the camera (LIVE_NEAR), at most 64 pieces (LIVE_MAX), every floor
     shown; a `blink` anim (a merged set of bulbs shown and hidden: one draw a set).
   - **Words on things** (shared glyphs.ts: one 5×7 dot face, `cleanText`; catalog `text` = the most
     letters; furniture.ts `TEXT_FACE`, `TEXT_DEFAULT`): `props.text`, cleaned by the server
     (`cleanProps`: capitals, what the face draws, cut to its length; dropped on kinds without words);
     edited in build mode — a Words field in the selection's look panel and on the held card (the
     split-flap's rows split by "/").
   - **Three signs** (walls.ts; on a wall): the **marquee** (3 wide, 10 letters: its words in lit
     bulbs sized to fit, a chrome frame, a border of bulbs chasing in three sets; a model per text),
     the **ticker** (2 wide, 48 letters: amber VFD dots scrolling on dark glass) and the
     **split-flap board** (3 wide, 36 letters in three rows of twelve: when its words change each
     flap turns through letters and settles, left to right) — the boards' faces live canvases on the
     wall (tp/live.ts `words`, drawn by furn/words.ts; the panel's pictures paint them too).
   - Checked: glyphs.test (the face, cleanText, every sign's default), world-server words.test, native
     (the marquee spells its words, its chase moves; live parts at every turn where the model's points
     go), shapes and the Jolt pass; shared 537, client 200, world-server 193/196 (the snow melt red on
     HEAD; the Vortex and fire-bench tests flaky under load, green alone). In the game as Bia (this
     client's copy only): flames and blobs moving, the three signs on a wall, the ticker scrolling, a
     split-flap flipping to new words, the Words field round-tripping. Page 429.5 → 431.0 KB (budget
     raised to 434). The ticker's two hanger rods dropped (they poked above its shape).
   Signed off 2026-11-03 ("Sign off, phase 2").
2. **Christmas** (first of the families: ready for December) — the tree, presents for someone,
   stockings, lights, mistletoe, cocoa, the village, the outdoor set, the admin's Christmas switch;
   the fireplace (decor) comes with it for the stockings.
   **Bench built 2026-11-03** (uncommitted; the looks awaiting sign-off, out of the panel till then:
   `fresh`, not `buildable`) — world/furn/xmas.ts, 20 kinds, `/dev/furniture?kind=…` (`&day=` opens
   the advent calendar to a December day, `&text=A~B~C` names the stockings a look each):
   - Indoors: **tree** (2×2, 2.4 m: classic fir with multicolour lights, flocked with cool white,
     silver tinsel with warm; baubles by its seed, a star, a skirt and stand), **tabletop tree** (on a
     surface, three pots), **presents** (1×1, two or three by seed; red and gold, green and red,
     kraft and twine with a sprig), **stocking** (wall; red, green, knitted; its name on the cuff —
     `props.text`, 8 letters), **wreath** (wall; fir and bow, holly, gold), **garland** (wall, 3
     wide, over heads: swagged from three hooks, lights warm, multicolour or candy-cane), **mistletoe**
     (from the ceiling to 2.25 m), **hot cocoa station** (2×1: an urn, mugs, jars, a chalk board),
     **gingerbread house** and **Christmas village** (on a surface; the village's windows lit and its
     train going round), **nutcracker** (1.3 m; red, blue, green), **candle arch** (on a surface;
     pine, white), **poinsettia** (red, cream, pink), **advent calendar** (wall; wooden, red and gold,
     a little house; the doors up to today open in December — the client's date — today's with its
     star), **gift-wrapping table** (2×1: the rolls' rack, a present half wrapped).
   - Out of doors (`outdoor`): **candy cane** (red, lit, green), **light-up reindeer** (2×1, a wire
     outline in bulbs; its head nods), **sleigh** (3×1: curled runners, a padded seat, presents
     piled), **inflatable snowman** (2 m), **giant snow globe** (2×2: a cottage and firs under the
     glass, its flakes drifting round).
   - Live parts: the lights twinkle (`lights()`: sets a colour, every other bulb, blinking out of
     step; none when off), new motions `nod` (the reindeer's head) and `swirl` (the globe's flakes);
     the shapes test now measures live parts at rest too (model-bounds.ts); `liveInto` asks only that
     the kit has the kind (the bench draws them all, the world asks isNative).
   - Checked: native.test (every look on its footprint, under the ceiling, under 8k tris; the
     lights twinkle and stop when off, the nod, the drift, the train, the stocking's name, the
     advent day), shapes (present, poinsettia, candy cane SOFT), the Jolt walk-in (tree, cocoa
     station, nutcracker, wrapping table, sleigh, snow globe); shared 537, client 201, world-server
     195/196 (the snow melt red on HEAD). In the game as Bia (this client's copy only): a Christmas
     corner by the fireplace, by day and night. Page 432.0 of 434 KB. Review
     https://claude.ai/artifact/3iog5QVQKCFamXVwEfWw6o.
   - Quality pass (the user: "Improve quality", 2026-11-03), every look re-rendered close:
     - The trees: tiers two layers deep with needle tips; snow lying on the flocked one's tips; a bead
       garland; capped baubles; the star on its spike.
     - Bows that stand up (`topBow`, `faceBow`); a name tag; twine knotted with a sprig.
     - Fuller wreaths: three rings of needles, pine cones, berries in threes.
     - Stockings with a heel, a toe, a fur cuff and a bell.
     - The candle arch an open stepped frame with a carved cottage and firs.
     - The candy cane's stripe a spiral (lit: the red glows, the white stays unlit).
     - The reindeer's wire carries bulbs, with a bow and bell at its neck.
     - The cocoa station: lights along its edge, candy-cane corners, the urn's lid and handles,
       cookies.
     - The sleigh: scrolls, a plaid blanket, a lantern on a post.
     - The nutcracker's hair and moustache; the gingerbread house iced; the village's pond and lamps.
     - Shapes refitted (wreath, sleigh); the flocked tree at 7.4k tris.
   - Looks signed off 2026-11-03 ("Sign off"). **Into the world 2026-11-03** (uncommitted):
     - **In the panel:** `signed`, `buildable`; the panel's **Seasonal** (15) and **Outdoors** (5)
       categories, badged NEW.
     - **Cocoa:** the hot cocoa station pours a **hot cocoa** (shared HELD `cocoa`, drawn as a red
       mug; the body's machine act at the urn's tap, HANDS_AT.cocoa_station). Holding one counts
       as warm, out in the cold too.
     - **Fire:** a lit fireplace warms three times as fast within 3 m of its hearth (vitals
       `hearth`, survival.ts).
     - **Lamp fixes:** anything switched like a lamp (the fireplace, the lava lamp, the trees, the
       garland, the village) now switches on the server and its light goes out on the client;
       before, only plain lamps did.
     - **Presents for someone** (world-server features/xmas.ts):
       - Opened by who they're for: the person picked at the wrapping table (`props.to`), else
         the name on the tag (`props.text`, 12 letters, the Words field), else anyone.
       - What's inside goes into their hand (`props.gift`, else one of shared GIFTS); a fanfare;
         the prompt says "A present for NAME".
       - The present goes when opened, whoever placed it.
     - **The gift-wrapping table** wraps what you're holding: the wrap picker lists the people here,
       or anyone, and the present is put down by the table.
     - **Mistletoe:** two people under it together get hearts and a toast, once a minute.
     - **Stockings** are full from Christmas Day (a candy cane, a present, a clementine).
     - **The admin's Christmas switch** (shared christmas.ts `deckBuilding`; "Put Christmas out"
       and "Put Christmas away" by Refurnish):
       - Every room on every floor dressed around what's there, nothing taken away. The pieces go
         as listed in christmas.ts: a tree in a back corner with presents and a nutcracker, a
         wreath, a garland, stockings by a fireplace, mistletoe, poinsettias, cocoa in a kitchen,
         small pieces on tables.
       - Ids `xmas-…`; put away takes only those; both are undoable (STEP_LABELS
         `build:christmas`).
     - Checked:
       - Shared 539 (christmas.test on the studio map, the hearth in vitals.test), client 201
         (stockings full), world-server 195/197 (the new Christmas test green; the snow melt red
         on HEAD; the fire bench flaky under load, green alone).
       - In the game as Bia, through the server, tidied after: the cocoa poured into her hand,
         her present opened, a present wrapped by the table, the Seasonal panel.
       - Page 433.3 KB (budget raised to 438).
     - Not yet: the Christmas music (the radio's December station), stockings hung on a mantel
       (they hang on the wall beside it), the outdoor set in the switch.
   **Phases 3–25 started 2026-11-03** ("go and do all phases"):
   - Each family has its own files (shared `fam/<family>.ts`: catalog, shapes, seats, surfaces,
     stands, hangs; client `world/furn/fam/<family>.ts`: looks and models), merged in `fam/index.ts`
     and spread into the shared tables (the iso px and shape parts moved to the leaf `fam/units.ts`:
     no cycle).
   - Eight agents model phases 3–12 and 14–20 in parallel (brief in the session's scratchpad); I
     integrate.
   - Every seat now marks itself sat in (controller `updateDoors`: a sitter anywhere on its
     footprint), so a rocking chair rocks and an egg chair turns while sat in.
3. Seating · 4. Desks & tables · 5. Storage · 6. Office · 7. On desks · 8. Screens & TVs ·
9. Game room (the made and hooked ones) · 10. Play & music · 11. Lights · 12. On the walls ·
13. Doors & windows (the 16 redrawn + the new) · 14. Decor · 15. Rugs & floor · 16. Pets ·
17. Parkour (bounce and swing) · 18. Kitchen & café · 19. Outdoors · 20. Other seasons.
13. **Doors & windows, built 2026-11-03:**
    - **Redrawn by the kit** (client world/furn/openings.ts, drawn in their walls by native
      `openingInto` — a west wall's turned a quarter):
      - The doors: the frame lined through the wall with casings on both faces; panelled or glazed
        leaves shut in the frame, or swung square when open or someone's passing; the studio door
        padded, with its ON AIR lamp; the barn door sliding on its rail; saloon louvres; a red lamp
        over a locked door.
      - The archway: spandrels with a stone casing and keystone.
      - The windows: lined and cased with sills; casements; the tall one under a transom; the round
        porthole in brass; arched with a fan; stained glass in lead; blinds let down; the studio's
        double glazing.
    - **The kit's glass** (Model.add `glass`: see-through, into the clear buffers — not a live part).
    - **New doors:**
      - Automatic glass doors (2 wide) slide apart as anyone comes within 1.6 tiles (shared
        `doorReach`).
      - The revolving door's wings turn (live) while someone's in it.
      - The garage roller door is rolled up when open.
    - **The skylight** (fam/doors2.ts): a lined well in the ceiling, the day through its glass.
    - Bay window: not built (the window seat, phase 3, sits under any window).
21–25. **Small games**, each its own: air hockey, foosball, darts, chess, the claw machine.
    - **Rules** (shared games68/, tested; chess checked by perft against the known counts):
      - Chess: legal moves (castling, en passant, promotion), check, mate, stalemate, the fifty
        moves, too little to mate.
      - Darts: a real board's scoring, three darts a turn.
      - The claw: nine prizes by the machine's id, a grip by how near the middle.
      - Air hockey: rails, mallet hits, goals, first to 7.
      - Foosball: four rods a side, men block, a kick, goals, first to 5.
    - **The server** (world-server features/games68.ts, by the piece's `interact`): chess moves
      taken from the side to move's player (the table keeps `props.fen`); darts thrown and scored
      (the board keeps its last three and its best); the claw dropped (a toy won, in hand); air
      hockey and foosball for two, stepped 25 times a second, the state sent to its players.
    - **The panels** (components/hud/Games68Panels.tsx, drawn by world/games68/draw.ts).
Last: the panel's new categories, room plans using the new pieces (a café, a games room, a library
lounge), checks (budgets, lag, the Jolt and column audits).

### Built: phases 3–25 and Last (2026-11-03, uncommitted)

- **The families** (shared fam/<family>.ts: catalog, shapes, seats, tops, stands, hangs; client
  world/furn/fam/<family>.ts: looks and models), 168 kinds: seating 9, tables 8, storage 9, office
  10, on desks 15, screens 5, game room 10, music 8, lights 10, walls 14, the skylight, decor 12,
  floor 10, pets 11, parkour 9, kitchen 10, outdoors 12, seasons 5 (+ the three new doors, phase 13).
  Each on the bench, its looks rendered and fixed, shapes from the models within 6 cm (the shapes
  test), every solid walked into and dropped onto (physics/furniture.test).
- **The Furnish panel**: every family in its category (shared `FAM_KINDS`), the new doors and the
  skylight with the doors and windows, a new **Kitchen & café** category (the kitchen with the
  fridge, drinks fridge, microwave and coffee machine), all of them NEW.
- **Hooked** (the families' asks):
  - the five small games on their pieces (the chess table draws the room's game, the dartboard the
    darts in it);
  - the cuckoo, world-time and punch clocks keep the real time (kit `clock` live part; the world
    clocks by their cities' zones); the wall calendar open at today;
  - the video wall, outdoor cinema and radio-TV cabinet show YouTube and Jellyfin (media GLASS;
    the planes a centimetre in front of their own pictures);
  - a tea from the kettle and an ice-cream tub from the freezer (held `tea`, `icecream`: the
    hands go to the kettle, the freezer's lid and the drinks fridge's handle); tea warms you;
  - the bigger desk pieces take their cells (tops `KIND_SIZE`, measured from the models);
  - the exit sign's green glow.
- **Room plans**: a café (the café counter with the espresso machine on its till's end, the drinks
  fridge and ice-cream freezer either side, tables for two under Edison lights, the jukebox), a
  games room (pinballs, the claw and the jukebox on the back wall; air hockey, foosball, chess and
  cards in the middle) and a library (ladder bookcases, a round rug with the egg and rocking chairs
  and a nest of tables, a reading desk with its green lamp, uplighters, a tree); a room named café,
  game/arcade or library/reading/study gets its own (a café no longer a kitchen).
- **Checks**: shared 546, client 254, world-server 195/198 (snow melt red on HEAD; nests and the
  park bench pass alone — load); the page 443.5 KB (budget raised to 446: ~150 kinds' tables on the
  page as every kind's are; models, games and panels lazy), chars 57.9 of 58.5; in the world as Bia
  (the lab world): placed, chess played through the server, the panels, no errors; frame time with
  the pieces in view as without (median 16.7 ms).
- **Quality and Jolt pass** (the user: "double check to assure quality and jolt collision"):
  - A column audit: every 10 cm over each new piece's footprint, every look, the model's surfaces
    (in entry/exit pairs) against the Jolt shapes in the band a body meets (0.45–1.7 m). It found
    the outdoor cinema's braces with no shape (now two low boxes) and the reindeer and the inflatable
    snowman walked through (now solid on their shapes). What's left is thin parts inside honest
    boxes (rods, strings, a ladder's rails, bikes in their rack), edges of a few centimetres, and
    deliberate blocks (round a fire, a fountain's water). Seats stay walk-through, as every seat is;
    the pumpkins too (a heap, as a present is).
  - Walked into in the game as Bia (the lab world): the kitchen island, aquarium, pinball, ladder
    bookcase, cat tree and air hockey stopped her at their edges; the egg chair let her through.
  - An independent review of the wiring, its fixes: the chess table and dartboard keep only their
    latest model (every move had stayed in memory); a builder's `obj:put` can't set a game's state
    (WorldRoom `GAME_KEYS`, kept from the piece as it was), and a position that won't read draws as
    the start; a chess side is free to take once its holder has walked off or left; the claw and
    darts one go at a time (2.5 s, 0.35 s), a refused drop answered; the table games drop a player
    who walks away and a table taken away; the games' reach by the piece's turn; the held chip's
    tea and ice-cream tub as the hand has them, one cocoa red; "Board Game Room" a games room and
    "Display Lab" not, by whole words. Tests for each (rooms.test small games, native.test, office.test).
  - Checks: shared 546, client 255, world-server 196/198 (snow melt red on HEAD; the park bench passes
    alone), page 443.6 of 446.
- **Not hooked yet** (the models are ready for them): thermostat reading, members' map pins,
  wet shoe rack and umbrella stand, the mobile whiteboard as a whiteboard, the safe, the tube
  station, first aid, record crates → radio, mail cubbies, the ceiling projector and karaoke as
  media, the security monitors' live views, the rocking chair rocking its sitter, the bleachers'
  rows and the chess table's chairs as seats, drums/guitar/synth/gong/theremin played,
  pinball/skee-ball/cornhole/cards played, the trampoline's bounce, the zip line and monkey bars,
  the pets' furniture (cat tree, litter box, feeder, ball launcher, agility, pet door, pet sofa),
  the dance floor to the music, the fountain's sound, words on the welcome mat and street sign,
  the flag in the wind, the snowman melting, the bus shelter keeping you dry, the bird feeder's
  birds; Christmas: the radio's December music, stockings on the mantel, the outdoor set in the
  switch.

## Guardrails

- Plan 67's: the kit only, no cards, true scale, shapes from the models (the Jolt test), pictures
  from the models, footprints and saved props never change meaning.
- Live parts: capped per room, frozen far away and off-screen, no extra draws for still pieces;
  frame time at the user's view not worse (A/B as Bia).
- Every hooked piece reuses its system's server rules (no new trust).
- Budgets: the furniture's chunk measured each phase (page 429.5 of 430: new models stay out of
  the page; raise budgets when needed, noted).

## Decisions (the user, 2026-11-03)

1. **All of it**, in phases (a family a phase, bench → world), the small games each their own phase.
2. **Every new mechanic**: live parts, words on things, bounce and swing, small games.
3. **The three new categories**: Kitchen & café, Outdoors, Seasonal.
4. **Doors and windows redrawn here**, with the new automatic, revolving and garage doors.
5. **Christmas, big** ("Also Christmas Items!!!!!"): its own family, done early for December.

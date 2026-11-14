# 84 — The Daybreak, held right

Ask (2026-11-13, the user, after plans 80–83 — one gun at a time, the Daybreak last), the same four as every
gun's:
1. The hands don't hold it right: a hand goes through it — horrible.
2. How she holds it should be like Leon in Resident Evil 4, or Saga in Alan Wake 2.
3. Aiming, the hands and arms are all wrong.
4. Reloading it is all broken; the animation is horrible.

References: Alan Wake 2, Resident Evil 4, 5 and 6 (images and videos).

Status: **planned 2026-11-13; forks decided by the user 2026-11-13, all as recommended**: **F1a the AK's low
ready in both hands**, **F4a the reload at the ready, turned on its side** (the spent cell dropped, fading),
**F5a a cell pouch on her belt's left front**, **F6a put away upright down her back, the lens down** (RE5's MGL),
over the three there; F2a (shouldered, her head upright behind the high sight), F3a (the charge braced) and F7a
(the torch against the fore-grip) as recommended, not asked. **Phase 0 (the mocks) rendered 2026-11-13** —
sheets `design/guns/p84/sheet-84-{hold,charge,reload,slung}.png`; the model changed for them (below); **signed off
2026-11-13** ("seguir assim"). **Phase 1 (the grip) built 2026-11-13** — `tp/daybreak-hold.ts` `DB_LONG`, the
bench's `gun=daybreak`; stills `design/guns/p84/bench-1-hold.png`; committed 22bc3da (with phase 0). **Phase 2 (put
away, drawn) built 2026-11-13** — stills `design/guns/p84/bench-2-carry.png`; committed 172090b. **Phase 3 (the aim,
the charge) built 2026-11-13** — stills `design/guns/p84/bench-3-aim.png`. Not committed.

## Where we are — read from the code and the bench

Stills of it now: `design/guns/p84/now.png` (the bench, `/dev/arms?gun=daybreak`, both bodies in a tee: carried,
aimed, reloading, put away — each from the side, the front or over the shoulder, and its hands close).

- **The Daybreak is the last gun on the old long-gun path** — the sniper's before plan 83 (`Person3D.gunHands`,
  the branch after the double-barrel's: `isLongGun`; the cue too). The gun hangs under the right wrist by a fixed
  frame and `aimGun` turns it *inside the hand*: the stills — the right hand behind the walnut grip, not round
  it; **the brace through her chest, carried and reloading**.
- **The right hand goes to a point** (`reachTo`, no turn) behind the grip; **the left to a point** under the
  gun's `fore` (`gripOnFore`): its fingers open under the cell, **not on the fore-grip** — the leather grip
  hanging under the lamp's body goes untouched.
- **Carried**: the double-barrel's old heavy carry — level at her belly, the brace's pad in her chest, the lens
  ahead.
- **Aimed**: held out at chest height along the look, the brace short of her shoulder, nothing at the sights.
- **The charge** (plan 79 phase 7; shared `ARMS.daybreak`: pressed, 1.0 s on the server's clock before the ball
  can go — `ARM.charge`, everyone sees the core swell and the gauge's needle swing): the body does nothing.
- **The reload** (`CELL_LOAD`, the AK's old `magHand`/`magFrame` by a load spec; shared: open 0.7 s, the cells
  0.9, shut 0.4): the cell slides out underneath and drops; both hands bunched at the grip; the left hand point
  to point between the cell's slot and the AK's pouch place at the left hip; no cell seen in her hand.
- **Put away**, it vanishes: no sling (the double-barrel and the AK cross on her back, the sniper over the AK's
  diagonal: `Player.sling`, `slingAk`, `slingSn`).
- **The model** (`tools/art/guns/guns.py` `daybreak`, plan 79 F7 — a lighthouse's lamp made a gun): **0.89 m**
  from the brace's leather pad (−0.358) to the lens's brass cage (0.535); its frame the grip point. A navy
  enamel body **12 cm across**, its axis 11.5 cm over the grip, brass bands and rivets; ahead a Fresnel lens
  round a glowing core in a brass cage; behind, cooling fins, a spine and a **brace** (a shoulder stock, open
  underneath, its pad 5 cm over the grip's line); a **walnut pistol grip** and a brass guard and trigger; a
  **leather vertical fore-grip** 10 cm down from the body's underside at 0.32–0.37 (`fore` 0.345); a
  **leather carry handle** on top (0.13–0.27, 21 cm up); a ring-and-post **sight** on the body's top (the line
  ~20 cm over the grip); a gauge; the **cell** under the body between the guard and the fore-grip (0.1–0.3,
  5 cm thick, a glass window and a glowing filament), copper lines from it to the lamp. Moving parts: `cell`
  (slides out), `core` (swells with the charge), `needle`, `trigger`.
- **The bench can't check it**: `/dev/arms?gun=daybreak` draws her, but its checks are the long hold's
  (`LONG[key]`), so `__revolver.ready` never comes.

So the Daybreak needs what plans 82–83 gave the AK and the sniper: **the gun the anchor, both hands at places
on it with their own turn and fingers** — the right round the pistol grip, the left round the vertical
fore-grip — carried and aimed as the others, the brace in her shoulder and her eye on the high sight, the
charge braced, the reload one timeline the hands and the cells play together, put away somewhere, then checked
by the strict audit on both bodies.

## What plans 80–83 taught (kept here)

- **Never turn her trunk for reach** — shoulders square; the left shoulder brought forward
  (`LongSpec.protract`), the hand's place solved by the wrist's exact reach.
- **Hand sockets, searched and looked at**: search small turns of a known-good hand (never any turn — it finds
  palms on top of a grip with good numbers) and look at stills; judge by the wrist's bend and side, the
  forearm's twist (≤53°, its sleeve pinched thin past ~50°), fingers and arms out of the gun.
- **The strict audit** (`e2e/sniper-bench.spec.ts`): every state on both bodies — each hand at its place, each
  wrist within its reach, each forearm ≤53°, no finger or arm in the gun, the stock out of her shirt, the gun
  over the floor through a roll; a hit played through frame by frame.
- **Struck, kept at the ready** (plan 83's feedback, `LongSpec.port.struck`): pulled across her chest and back
  out in a hit's 0.7 s, the forearms were wrung — her arm "thin, at random". The gun goes with her chest in the
  flinch instead.
- **Slung guns** lie flat on her back, resting on her (`SlingSpec.lean`, `slungGap`); three are on her back
  already — a fourth crowds them.
- **Mocks first** (Blender, `tools/art/guns/mock8x.py`): signed off before code; a pose the mocks can't make,
  the game can't either.
- Judged as the user sees it: the over-the-shoulder game camera, both bodies, a tee and a dark coat; and in the
  world, not only on the bench — traced every frame (plan 83's feedback was invisible on the bench).

## References (2026-11-13)

The Daybreak is ours — no game has it — so the references are the games' **heavy shouldered launchers** with
its layout (a pistol grip, a vertical fore-grip, a stock, a sight high over the bore) and how a vertical
fore-grip is held for real. From [IMFDb](https://www.imfdb.org/) (read in the browser: it refuses automated
fetches).

- **Resident Evil 5 — the Grenade Launcher**, a **Milkor MGL Mk 1L** (40 mm, six in a cylinder): a pistol
  grip, **a vertical fore-grip under the barrel**, a collapsing stock, a reflex sight raised over the
  cylinder — the Daybreak's layout ([the gun](https://www.imfdb.org/wiki/File:RE5MGL5.jpg),
  [in its case](https://www.imfdb.org/wiki/File:RE5MGL1.jpg)). Chris shoulders it as a rifle, the left hand on
  the fore-grip; **put away, it rides upright on his back** ("The MGL Mk 1L on Chris's back",
  [still](https://www.imfdb.org/wiki/File:RE5MGL3.jpg)).
- **Resident Evil 4 (2005) — the Mine Thrower** (fictional; a pistol grip, a front grip, a stock): **shouldered
  as a rifle**, both hands on ("Leon aims the Mine Thrower", [still](https://www.imfdb.org/wiki/File:Resident_Evil_4_Mine_Thrower_aim.jpg));
  **reloaded broken open before his chest**, the right hand on the grip, the left hand at the breach
  ("Leon reloads the Mine Thrower", [still](https://www.imfdb.org/wiki/File:Resident_Evil_4_Mine_Thrower_reload.jpg)).
  Its rocket launcher (an RPG-7) is over the shoulder — a tube, not the Daybreak.
- **Alan Wake 2 — Saga's Crossbow** (a pistol grip, a stock, the bow ahead): **carried low across her hips in
  both hands** — the right on the grip, the left under the front, the bow across to her left ("Saga holds the
  crossbow near Cauldron Lake", [still](https://www.imfdb.org/wiki/File:Alan_Wake_2_crossbow_idle.jpg));
  **aimed shouldered, her head down to it, the left hand forward under it**
  ([still](https://www.imfdb.org/wiki/File:Alan_Wake_2_crossbow_aim.jpg)); reloaded standing still, braced
  ([still](https://www.imfdb.org/wiki/File:Alan_Wake_2_crossbow_reload.jpg)). AW2's flare gun (an Orion) is its
  explosive launcher — one-handed, a pistol.
- **Resident Evil 6 — the Grenade Launcher** (a break-action): held as a shotgun
  ([IMFDb](https://www.imfdb.org/wiki/Resident_Evil_6)).
- **The vertical fore-grip, for real**: the **thumb-break** grip most settled on — four fingers round the
  grip, the thumb up over it against the handguard; the grip "drives" the gun forward (an angled one pulls
  it into the shoulder); a fist round it like a bat pulls the gun to the support side and twists the wrist
  ([Sandboxx](https://www.sandboxx.us/news/once-a-staple-of-the-gwot-vertical-grips-have-now-largely-faded-away/),
  [Wing Tactical](https://www.wingtactical.com/blog/how-to-properly-use-a-fore-grip)).
- **A sight high over the bore** (the MGL's raised reflex sight, the Daybreak's ring 20 cm over the grip): no
  cheek on the stock — the head upright behind the sight, the stock in the shoulder.

So: **shouldered as a rifle, the right hand on the pistol grip, the left round the vertical fore-grip
(thumb-break), the head upright behind the high sight**; carried low across her in both hands (the AK's low
ready, AW2's crossbow); the reload before her, the right hand keeping the grip, the left hand doing the work;
put away upright on her back (RE5's MGL), if anywhere.

## The idea

Plans 82–83's machinery for the Daybreak (`tp/daybreak-hold.ts`, `DB_LONG`):

- **The gun the anchor**: carried (F1) and aimed (F2) with the brace's pad in the shoulder's pocket, her head
  upright and her right eye on the sight's line (no cheek on it: the line is 20 cm over the grip).
- **The right hand round the walnut pistol grip** (the AK's and the sniper's kind: the web high, the fingers
  round its front), the index along the guard carried, on the trigger aimed.
- **The left hand round the vertical fore-grip** — thumb-break: four fingers round its front, the thumb up
  over its top against the body's underside, the wrist straight — reaching with her shoulder, never her trunk.
- **The charge braced** (F3): her weight onto her front foot, the left hand driving it forward, the core
  swelling; the shove back into her shoulder as the ball goes.
- **The reload one timeline** (F4–F5) in time with the server's steps (open 0.7, the cells 0.9, shut 0.4);
  everyone sees it.
- **Kept, struck and moving**: port arms for a roll, a vault, a slide; at the ready through a hit (plan 83).

## Forks

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| F1 | Carried (not aiming) | **a)** the AK's low ready in both hands (AW2's crossbow): the right on the grip, the left round the fore-grip, the brace's pad at the shoulder's front, the lens down and across to her left · **b)** by its carry handle in her left hand, hanging at her side like a lamp, the right hand free — up to the aim both hands change (0.3 s) · **c)** in the right hand alone at her right hip (AW2's side carry) | **a** |
| F2 | Aimed | **a)** shouldered: the pad in the pocket, her head upright, her right eye on the ring sight's line (no cheek on it), the left hand round the fore-grip; both elbows down (the MGL's, the Mine Thrower's) · **b)** her cheek on the spine — the sight lowered on the model · **c)** from the hip in both hands, no sights (a cannon's) | **a** |
| F3 | The charge (1 s) | **a)** braced: her weight onto her front foot, her left hand driving the fore-grip, the core swelling; the shove back into her shoulder · **b)** as aimed, nothing moves but the core | **a** |
| F4 | The reload | **a)** at the ready, turned on its side: the right hand keeps the grip and rolls it so the cell faces her; the left hand leaves the fore-grip, draws the spent cell out underneath and lets it fall (dark, it fades on the snow), takes a new one (F5), slides it in and palms it home, back to the fore-grip; her eyes on it · **b)** brought up before her chest, the lens up (the sniper's), the cell changed there by the left hand · **c)** the spent cell springs out and falls on its own; the left hand only brings the new one in | **a** |
| F5 | Where the cells come from | **a)** a cell pouch on her belt's left front (beside the AK's magazine pouch) · **b)** spare cells clipped along the gun (on the brace or the body's side), seen on it, near the left hand · **c)** from a pocket, none seen | **a** |
| F6 | Put away | **a)** on her back, upright down the middle, the lens down (RE5's MGL), over the three there · **b)** gone, as now (AW2: only in her hands) · **c)** hung by its carry handle at the back of her right hip | **a** |
| F7 | The torch with it | **a)** in her left fist against the fore-grip's front, its beam along the body under the lens (as the AK's and the sniper's along their fore-ends) · **b)** off while it's out (the ball burns the shields itself) | **a** |

The server's times stay (the charge 1.0 s, 2.5 s between; the reload 0.7 open, 0.9 the cells, 0.4 shut)
whatever F3–F4.

## Phases

0. **Mocks** (Blender, `tools/art/guns/mock84.py`; sheets in `design/guns/p84/`): the hold carried and aimed,
   both bodies, from the side, the front, over the shoulder and its hands close; the charge; the reload's keys;
   put away (F6). Signed off before code.
   Done in phase 0 (`tools/art/guns/mock84.py`, the life man; sheets `design/guns/p84/sheet-84-*.png`):
   - **The model had to change** (`guns.py` `daybreak`; the GLB rebuilt in phase 1): as built, **the left
     hand fell 9–13 cm short of the fore-grip** (0.70 m from the pad: the sniper's reach is ~0.59) and **the
     ring's line was 10 cm under his eye** with his head upright (the pad 6 cm under the lamp's axis, the
     sight 8.5 over it, his eye ~25 cm over his shoulder's pocket) — shouldered, the pad went up under his
     chin. Now: the brace **5 cm shorter** (its pad at −0.30), the **fore-grip 5.5 cm back** (0.267–0.315,
     `fore` 0.29), the **cell 15 cm** (was 20: 0.10–0.25, its mount and copper lines with it), and **the pad
     dropped 14 cm under the lamp's axis and cast 3.5 cm to its right** (the brace a bracket down from the
     spine; `butt` (−0.30, −0.035, AZ−0.14)).
   - **Carried** (F1a): the AK's low ready — the pad at the shoulder's front, the lens ~26° down and across
     to his left, his left shoulder forward; the left hand round the fore-grip 0.56 m from his shoulder (0.9
     cm short — the bench's searched socket will close it), the right round the walnut grip, the index along
     the guard.
   - **Aimed** (F2a): the pad in the pocket (9 cm from the joint), his head down 0.3 and over 0.1 — nearly
     upright, his cheek clear of the fins — his right eye on the ring's line (the gun moved 0 up, 2.2 cm
     over to it); the left hand round the fore-grip 0.53 m out (thumb-break: the palm on its left, the
     fingers round its front, the thumb over its top), both elbows down. With the torch (F7a): under the
     body ahead of the fore-grip, its tail in the same fist, its beam along the lamp.
   - **The charge** (F3a): his trunk leaning into it (~6°), the left shoulder further forward, the core
     swollen 1.55×; **the shot**: the gun shoved 1.8 cm back into his shoulder, its lens up ~4°.
   - **The reload** (F4a, F5a): at his chest over the belt (the pouch free under it), rolled ~66° top to his
     right so the cell faces his left hand and his eyes, his right hand keeping the grip, his head bowed to
     it: (1) the left hand round the cell, drawing it down out of the cradle; (2) let fall — dark, below —
     the hand on its way down; (3) at the pouch on his belt's left front (two cells standing in it, beside
     the AK's), a new one drawn up; (4) pressed up into the cradle, his palm under it.
   - **Put away** (F6a): upright down his back, the lens down at his hips, its side to him (the grip and the
     fore-grip to his left), the strap from the brace over his right shoulder, across to his left hip, round
     to the lens's collar. With the three there it stands ~25 cm off his back — a big pack (the risk named).
1. **The grip** — `tp/daybreak-hold.ts` `DB_LONG`: the right hand's place and turn on the walnut grip (the
   AK's searched small), the left hand's on the fore-grip (a new socket: thumb-break, searched small from
   the AK's), their fingers; carried per F1; `LONG` takes the Daybreak; the bench's `gun=daybreak` (its
   checks: the body, the fore-grip, the cell, the brace as rods and boxes, the brace's profile for "out of
   her shirt"). The strict audit on the bench, both bodies.
   Done in phase 1:
   - **The model rebuilt** (`daybreak.glb`, 25.3k triangles of its 26k): phase 0's changes, and **the brace a
     strut**, not a plate — a plate 14 cm tall hung under the lamp went into her chest aimed; now a 4 cm strut
     down and back from the spine to a pad 8 cm tall (was 11), its middle where it was (14 cm under the axis,
     3.5 to its right).
   - **`DB_LONG`** (`tp/daybreak-hold.ts`, in `LONG`): the right hand round the walnut grip — the sniper's turn
     9° further up the grip (searched: at the sniper's the right wrist went 4–10° past its reach aimed low and
     running); **the left hand round the vertical fore-grip, thumb-break** — its palm on the grip's left side,
     3.2 cm out from its middle and 2 cm up it, the fingers round its front, the index under the body, the
     thumb under the body's left side (searched by small turns: 4 rounds, both bodies, carried to aimed); one
     place on it, not a run along it. Carried at the AK's low ready (the pocket [0.03, −0.05, 0.08], down 0.45,
     across 0.3); aimed with the pad in the pocket and her eye on the ring's line by her neck (`cheek` at the
     sight's 20 cm: 9–31° of neck), the gun not moved for it.
   - **The long hold learnt a vertical fore-grip** (`long-hold.ts`): `fore.z` (the palm across), `fore.shape.axis`
     and `z` (what the fingers close round, upright); the checks' stock profile `cz` (a brace cast to one side).
   - **The checks**: the left fingers against the fore-grip (two boxes: 4.8 cm under the body, 3 at its foot),
     the cell and the lamp's body (each round as boxes across it); the forearms against the brace, the body,
     the fins, the cage, the cell. The bench's `stockIn(true)`: inside by most of six rays — **the old one ray
     ahead read the pad as 17–24 cm in her** when aimed (the skin under the shirt isn't drawn: a ray ahead
     through her forearm crossed it once); by six, the pad presses her shirt 0.2–1.5 cm, as the other guns'
     stocks. `check().whereGrip` names the box.
   - **Audited** (the bench, a tee, the low ready standing, walked, jogged, run, turned, with the torch; aimed
     at pitch −0.55, 0, 0.7 at two turns of her, with and without the torch): **the masculine body clean (0 of
     18)**; the feminine: her right wrist 3.1° past its reach at the lowest aim with the torch (0.1 over), and
     turned 1.3 rad aimed her pad 1.7–3.2 cm into the fuller chest (the pocket further ahead put her left hand
     out of reach) — both left for phase 3. Forearms turned ≤45°; her eye on the ring's line everywhere.
   - Not yet: its sling (phase 2: put away it still vanishes), the charge and the shove (3), the reload (4 — held
     at the ready meanwhile), port arms and struck (5).
2. **Put away, drawn** (F6) — its sling place, flat on her back over the others (their gaps), drawn off it and
   back in the gun's own times (shared `ARMS.daybreak.draw` 0.6), `Player` flag as `slingSn`.
   Done in phase 2:
   - **`Player.slingDb`** (the server's schema and `features/arms.ts`: a Daybreak in her things and not in her
     hands), the client's model, controller and `PersonIn`; `SlingFlag` takes it; the bench's `all=1` slings
     all four.
   - **Slung** (`DB_SLING`, `tp/daybreak-hold.ts`): upright down the middle of her back, the lens down at her
     hips, its side to her — the carry handle to her right, the grip and the fore-grip to her left — its strap
     from the brace over her right shoulder, across her chest to her left hip, round to the lens's collar.
     Alone, its lens lay on her lower back and its top stood 5 cm off a feminine back, 10 off a masculine one:
     tilted top in (`lean` alone 0.1 / 0.143) and brought nearer, **each body its own** (`SlingSpec.back`, new:
     3.5 / 8 cm) — **0.2–3.4 cm off her all its length**. Over the others (`over`: the sniper 2, the AK 2, the
     double-barrel 1 cm): resting on them where they cross under it, its foot tilted in a little (`lean` over
     −0.06 / −0.12); 0.2–1 cm off them at its closest. Its brace's top 0.6–1.2 cm into the bob's hair.
   - **Drawn by its carry handle** (`grab`, its keys): her right hand back to the handle upright at her right —
     round it from outside, a hand's way behind her (searched by small turns: its first turn put her wrist
     90° past its reach); off her back to her right, turning, the lens coming round forward; **at her right
     side carried as a lamp** — level, the lens ahead, the handle up in her hanging hand, the hand rolled round
     the bar to it by 0.6 of the draw (`grab.from`, new: a hand's hold rolled about what it holds); lifted level
     before her right hip, its top rolled a little to her right; her right on to the walnut grip round the
     gun's right side (`grab.arc`, new, 8 cm out — straight, her forearm went 9 cm through the lamp) as it comes
     up into the low ready, her left meeting the fore-grip at the end. Put away the same way back.
   - **Audited** (both bodies, the draw at 13 moments): **0–0.56 clean**; the change of hold, 0.62–0.85, her
     right hand up to 5.5 cm short of the handle and her wrist up to 11° past its reach (the gun rising out of
     her hanging hand), her right forearm 2.4–2.9 cm into the lamp at 0.85; her left fingers closing on the
     fore-grip at 0.9 (0.4–1.5 cm in), on at 0.95. **Left** for the checks to hold as known, as the sniper's
     mid-draw.
3. **The aim and the charge** (F2–F3) — the pad in the pocket, her head upright and her eye on the sight's
   line at the game's whole reach of pitch and turn, upright, on the look; the charge's brace and the shot's
   shove; others see it.
   Done in phase 3:
   - **The aim** (phase 1's hold): audited at pitch −0.55, −0.3, 0, 0.3, 0.7, turned 0, 1.3, −2.4, with and
     without the torch — **both hands on, each wrist within its reach, her right eye on the ring's line
     everywhere** (her neck 7–31°, the gun never moved for it), upright (cant 0), on the look. Phase 1's
     feminine edges gone (her right wrist 0.3–1.9° at the lowest aim with the torch). The pad presses her shirt
     1.6–2.6 cm at 1–3 of its 45 points in some turns (the sniper's stock was held to 1.5) — left.
   - **The charge** (F3a; `LongSpec.charge`, new — `gunFx.charge`, mine from Arms, the others' from `Player.arm`
     — eased): **leant into it ~4°**. At the mocks' 6° and her left shoulder 2 cm further forward, a
     masculine left wrist went 6° past its reach aimed high: now clean on both bodies at every pitch and turn.
     The core swells by its own (plan 79).
   - **The shot's shove** (`LongSpec.kick`, the mocks': the lens up ~4°, back 1.8 cm into her shoulder, her
     trunk rocked): at its peak her left wrist at most 6.1° past its reach (a masculine body aimed highest — the
     moving limit's 6).
   - The bench takes `charge` (0..1) as it takes `kick`.
4. **The reload** (F4–F5) — one timeline in the server's steps (`ARM.open` → the cells → `ARM.shut`): the cell
   out and dropped (it fades), the new one from F5's place, in, home; the pouch (F5a) modelled; others see it.
5. **Everything else** — port arms for a roll, a vault, a slide (its 0.89 m over the floor all through a
   roll); struck, kept at the ready (`port.struck: false`); sat, swimming, busy: let go; the far people's
   cheaper hold. **The old long-gun path goes** (the Daybreak was the last on it).
6. **Checks** — `e2e/daybreak-bench.spec.ts` (the strict audit, both bodies: carried, aimed at the game's
   whole reach, the charge, the reload's moments, drawn, kept, a hit frame by frame, sat),
   `e2e/daybreak-two.spec.ts` (the world, two of us: slung, drawn, aimed upright, charged and the ball away,
   reloaded, put away — on both screens), stills in the world; `daybreak.spec.ts` and all the guns' specs
   green.

## Risks

- **Its bulk**: 12 cm across and a lens 13 cm wide — the left forearm under it, the right forearm by the brace
  (open underneath) and the cell; the brace's pad in a fuller chest's shirt.
- **The high sight**: her eye 20 cm over the grip with the pad in her shoulder — her head upright may not reach
  the line on the smaller body without lifting her shoulder; the mocks will tell.
- **A fourth gun on her back** (F6a): over the AK, the sniper and the double-barrel — a 12 cm tube down the
  middle may stand them off her; its gaps checked as plan 82's.
- **The torch and the fore-grip** (F7a): the fist round both — the torch's beam along the body, the fingers
  round the grip.
- **The old path's last user**: removing it must leave the cue (`isLongGun || cue`) as it is.

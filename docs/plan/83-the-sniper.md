# 83 — The sniper, held right

Ask (2026-11-13, the user, after plans 80–82 — one gun at a time, the sniper next), the same four as the
revolver's, the double-barrel's and the AK's:
1. The hands don't hold it right: a hand goes through it — horrible.
2. How she holds it should be like Leon in Resident Evil 4, or Saga in Alan Wake 2.
3. Aiming, the hands and arms are all wrong.
4. Working it (the bolt, the reload) is all broken; the animation is horrible.

References: Alan Wake 2, Resident Evil 4, 5 and 6 (images and videos).

Status: **planned 2026-11-13; forks decided by the user 2026-11-13**: **F1a the AK's low ready in both hands**,
**F4a the reload raised nearly upright before her right chest** (AW2's, RE5's), **F5a a cartridge sleeve on the
stock's right side**, **F6a put away on her back, upright down the middle, muzzle down** (RE4R's), over the two
crossed ones; F2a (square, her eye at the scope), F3a (the bolt by the right hand, the rifle kept at her
shoulder) and F7a (the torch against the fore-end) as recommended, not asked. **Phase 0 (the mocks) rendered and
signed off 2026-11-13** ("seguir assim"); **F6 decided again: on the AK's diagonal, over it** (upright, the muzzle
down reached his calves). **Phase 1 (the grip) built 2026-11-13** — the sniper on the long hold (`tp/sniper-hold.ts`
`SN_LONG`), the bench's `gun=sniper`; its stills `design/guns/p83/bench-1-hold.png`; committed 5178a55. **Phase 2 (put
away, drawn) built 2026-11-13** — stills `design/guns/p83/bench-2-carry.png`; committed c9adbeb. **Phase 3 (the aim)
built 2026-11-13** — stills `design/guns/p83/bench-3-aim.png`; committed de08538. **Phase 4 (the bolt) built
2026-11-13** — stills `design/guns/p83/bench-4-bolt.png`; committed 4c1680b. **Phase 5 (the reload) built
2026-11-13** — stills `design/guns/p83/bench-5-reload.png`; committed 8ad433d. **Phase 6 (everything else) built
2026-11-13** — stills `design/guns/p83/bench-6-moves.png`; committed df3df6d. **Phase 7 (the checks) built
2026-11-13** — `e2e/sniper-bench.spec.ts`, `e2e/sniper-two.spec.ts`, stills `design/guns/p83/world/`. Not
committed.

## Where we are — read from the code and the bench

Stills of it now: `design/guns/p83/now.png` (the bench, `/dev/arms?gun=sniper`, the feminine body in a tee).

- **The sniper is still on the old long-gun path** — the AK's before plan 82 (`Person3D.gunHands`, the branch
  after the double-barrel's: `isLongGun` takes the sniper and the Daybreak; the cue too). The gun hangs under
  the right wrist by a fixed frame and `aimGun` turns it *inside the hand* to point where `gunHands` wants: the
  pistol grip and the stock pass through the fist and the forearm (the stills: aimed, the right forearm
  through the stock; carried and reloading, the butt in her chest).
- **The right hand goes to a point** (`reachTo`: where the grip is, no turn — under the pistol grip, its
  fingers not round it); **the left to a point** under the gun's `fore` (`gripOnFore`), no turn, its fingers
  open under the fore-end, not holding it.
- **Carried**: the double-barrel's old heavy carry (`gunWay`) — the butt against the right side of her chest,
  across her, the muzzle ahead and left.
- **Aimed**: shouldered along the look by the same numbers; over the shoulder at first, then — 0.3 s into the
  aim (shared `ARMS.sniper.aim`) — the camera goes down the scope (`tp.scope`, 4× or 8× by the wheel, its sway,
  Shift holds the breath; `world/dark/arms.ts` `scopeFrame`, `tp/view.ts`). Others see her body aim.
- **The bolt after a shot** (plan 79 phase 6; shared `ARMS.sniper`: from 0.2 s after the shot, 0.85 s; no
  shot till it's home — `ARM.bolt`; out of the scope meanwhile, RE5's S75): **worked by her left hand**
  (`boltHand`: off the fore-end over the top to the knob, with it, back) — the wrong hand for a right-handed
  bolt. The bolt part turns up 60° and runs back 7.5 cm (`poseGun`, `bolt` 0–1).
- **The reload** (`roundHand`; `ARMS.sniper`: the bolt back 0.35 s, a round at a time 0.5 s each, home 0.35 s —
  the server counts them in, its steps `ARM.open`, the rounds, `ARM.shut`): the gun kept up at the shoulder,
  the muzzle lowered and turned left (the AK's old numbers); the left hand point to point between the port and
  the AK's pouch place at the left hip (no pouch of its own seen, no round in the hand).
- **Put away**, it vanishes: no sling (the double-barrel's and the AK's are on her back: `Player.sling`,
  `slingAk`).
- **The model** (`tools/art/guns/guns.py` `sniper`, plan 79): a bolt-action in a synthetic stock with a
  **pistol grip** (its origin the grip point, its front under the action) and a cheek riser; the bore 6.6 cm
  over the grip, the scope's axis 11.2 cm over it, its eyecup at −0.124 (the eye ~8–9 cm behind it); the
  fore-end 0.16–0.62 m along (`fore` 0.36), a folded bipod under it; the bolt's knob on the right
  (−0.004, right 0.058, 4 cm under the bore); the butt pad at −0.39; the muzzle brake at 0.88 — **1.27 m long**,
  the double-barrel's length. Moving parts: the bolt (turn, run back), the trigger.
- **The bench can't check it**: `/dev/arms?gun=sniper` draws her, but its checks are the long hold's
  (`LONG[key]`), so `__revolver.ready` never comes.

So the sniper needs what plan 82 gave the AK: **the gun the anchor, both hands at places on it with their own
turn and fingers**, carried and aimed as she holds the AK, the cheek on the riser and the eye behind the
scope, the bolt worked by the right hand, and the reload one timeline the hands, the bolt and the rounds play
together — then checked by plan 82's strict audit on both bodies.

## What plans 80–82 taught (kept here)

- **Never turn her trunk for reach** — shoulders square; the left shoulder brought forward
  (`LongSpec.protract`), the hand's place solved by the wrist's exact reach.
- **Hand sockets, searched and looked at**: a search over any turn of a hand finds palms on top of a grip and
  the index away from the trigger with good numbers (plan 81's fourth feedback) — search small turns of a
  known-good hand and look at stills; judge by the wrist's bend and side, the forearm's twist (≤53°, pinched
  thin past ~50°), fingers and arms out of the gun.
- **The strict audit** (`e2e/ak-bench.spec.ts`): every state on both bodies — each hand at its place, each
  wrist within its reach, each forearm ≤53°, no finger or arm in the gun, the stock out of her shirt, the gun
  over the floor through a roll.
- **A long gun in a roll**: pulled in across her chest; a 1.24 m gun (the double-barrel) clips the floor in
  some moment of the roll whatever the pose (plan 81's fourth feedback) — the sniper is 1.27 m.
- **Slung guns**: flat on her back, resting on her (plan 82's last feedback: `slungGap`, `SlingSpec.lean`);
  a third long gun on her back crowds the two that are there.
- Judged as the user sees it: the over-the-shoulder game camera, both bodies, a tee and a coat.

## References (2026-11-13)

All three games' bolt-actions work the same way; the timings below are read frame by frame from video (marked
*frames*), the rest from [IMFDb](https://www.imfdb.org/) and the wikis.

- **RE4 Remake — the SR M1903** (a Springfield M1903A4, 5 rounds; [IMFDb](https://www.imfdb.org/wiki/Resident_Evil_4_(2023_VG)),
  [wiki](https://residentevil.fandom.com/wiki/SR_M1903)):
  - *the bolt*: after a shot the camera comes out of the sight to over the shoulder; the rifle stays at the
    shoulder, his head down on the stock, **the right hand up to the bolt**, back in the sight ~1 s after the
    shot (*frames*: [video 0:28–0:35](https://www.youtube.com/watch?v=U7uIdciWHLU&t=28s);
    [Ada at the bolt](https://www.imfdb.org/wiki/File:RE4R_Springfield_04sight.jpg);
    [from behind](https://www.youtube.com/shorts/6HtV2YeQWKU) 0:04–0:09);
  - *the reload*: **rounds one at a time** ("correctly loaded individually instead of using stripper clips");
    the right hand opens the bolt, the rifle raised and **canted across his body, the muzzle up to his left,
    the left hand on the fore-end, his head bowed to the action**; the right hand between his waist and the
    action ~5 times (0.6–0.9 s a round), the bolt home, back to the ready — ~6.5 s
    (*frames*: [video 2:13–2:20](https://www.youtube.com/watch?v=i9DGjdUjeFI&t=133s);
    [topping off](https://www.imfdb.org/wiki/File:RE4R_Springfield_05sight.jpg));
  - *carried*: always both hands — idle across his chest, the stock under his right forearm at the hip, the
    muzzle ahead and left ([still](https://www.imfdb.org/wiki/File:RE4R_Springfield_02irons.jpg)); moving,
    lower, the muzzle ahead and down;
  - *put away*: a long gun slung on his back, stock up, muzzle down
    ([still](https://www.imfdb.org/wiki/File:RE4R_m3_empty_bolt.jpg), [video 2:03](https://www.youtube.com/watch?v=Wl6ygbPBDCY&t=123s)).
- **RE4 (2005) — the Rifle** (the same M1903A4): out of the scope to third person to cycle it; reloaded by a
  stripper clip jammed in with the rifle stood nearly upright, the left hand high on the fore-end
  ([IMFDb](https://www.imfdb.org/wiki/Resident_Evil_4), [still](https://www.imfdb.org/wiki/File:RE4HDSpringfieldReload.jpg),
  *frames*: [video 1:57–2:02](https://www.youtube.com/watch?v=Wl6ygbPBDCY&t=117s)).
- **Alan Wake 2 — Saga's Hunting Rifle** (a Remington 700, 5 rounds, loaded round by round:
  [IMFDb](https://www.imfdb.org/wiki/Alan_Wake_2)):
  - *the bolt*: **the right hand, the rifle at her shoulder, her cheek kept on the stock**, ~1 s
    ([front view](https://www.imfdb.org/wiki/File:Alan_Wake_2_Remington_700_cycle.jpg); *frames*:
    [video 5:28–5:36](https://www.youtube.com/watch?v=d7jvO2FZryg&t=328s));
  - *the reload*: **swung up nearly upright, the muzzle up, before her right chest; the left hand high on the
    fore-end; the right hand feeding the action under the scope**, ~5.5–6 s
    ([still](https://www.imfdb.org/wiki/File:Alan_Wake_2_Remington_700_load.jpg); *frames*: same video 5:41–5:47);
  - *carried*: in the right hand at the wrist, at her right hip, the muzzle ahead and a little down (6:02–6:04)
    — the double-barrel's old side carry; no long gun seen on her back.
- **RE5 — the S75** (a Sako 75 bolt-action): out of the scope till the bolt's worked, the rifle shouldered,
  Chris's right hand on it ([still](https://www.imfdb.org/wiki/File:RE5Sako1.jpg)); reloaded stood muzzle up
  ([still](https://www.imfdb.org/wiki/File:RE5Sako2.jpg)); slung diagonally on his back, muzzle up behind his
  right shoulder ([still](https://www.imfdb.org/wiki/File:RE5Sako3.jpg)). The SVD and PSG1 are semi-autos
  with magazines.
- **RE6 — the Sniper Rifle** (bolt-action): loaded with single rounds (Sherry two a motion); the bolt handle
  flips sides with the shoulder view ([IMFDb](https://www.imfdb.org/wiki/Resident_Evil_6)).
- **The real technique** (a right-handed Remington 700):
  - the trigger hand works the bolt; the cheek stays on the comb, the eye in the scope, the support hand on the
    fore-end ([Ron Spomer](https://ronspomeroutdoors.com/blog/stay-riflescope-shoot-better),
    [AccurateShooter](https://bulletin.accurateshooter.com/?p=58717),
    [American Hunter](https://www.americanhunter.org/content/build-your-skills-the-fast-follow-up-shot/));
  - loaded with the bolt back, **cartridges pushed down one at a time into the magazine, the bullets toward
    the chamber**, the bolt run forward over them and turned down
    ([the Remington 700 manual](https://archive.org/stream/remington-models-700-seven-673-owners-manual-3509-rd-7055-rev-03-21/700%20Manual%20RD7055%20Final%20F3509_djvu.txt), p. 9);
  - ~1.1–1.4 s shot to shot (informal drills).

So: **the right hand works the bolt with the rifle kept at her shoulder, her cheek on it, her left hand on the
fore-end**, all three games and the real thing agreeing; **the reload with the rifle raised, the muzzle up,
the left hand high on the fore-end, the right hand bringing the rounds in one at a time**, her eyes on the
action. Ours is faster than the games' (the server's 0.35 s open, 0.5 s a round, 0.35 s shut: 3.2 s for five,
against their ~6 s) and ~1 s for the bolt, as theirs.

## The idea

Plan 82's machinery for the sniper (`tp/sniper-hold.ts`, `SN_LONG`):

- **The gun the anchor**: carried (F1), aimed with the butt in the shoulder's pocket, her cheek on the riser
  and her right eye on the scope's axis at its eye relief (plan 82's `cheekTo` with the scope's height) — so
  the scope view starts where her eye is.
- **The right hand on the pistol grip** (the AK's kind of grip: the web high, the fingers round its front),
  the index along the action carried, on the trigger aimed.
- **The left hand under the fore-end** at a socket on it, cupped, its fingers round it — reaching with her
  shoulder, never her trunk.
- **The bolt by the right hand** (F3): off the grip to the knob, up, back, forward, down, back to the grip —
  the cheek kept on the stock, the left hand where it is; the spent case thrown out to the right.
- **The reload one timeline** (F4): the bolt back, the rounds in (one at a time, the server's own steps), the
  bolt home; in time with the server; everyone sees it.

## Forks

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| F1 | Carried (not aiming) | **a)** the AK's low ready in both hands (the double-barrel's now too): the butt at the shoulder's front, the muzzle down and across to her left, her shoulders square, the left hand under the fore-end · **b)** RE4R's: both hands, the stock under her right forearm at the hip, the muzzle ahead and left · **c)** AW2's: in the right hand alone at her right hip, the muzzle ahead and down (the double-barrel's old side carry) | **a** |
| F2 | Aimed (before the scope view, and as others see her) | **a)** square: the butt in the pocket, her cheek on the riser, her right eye on the scope's axis at its eye relief — the scope view starting at her eye; both elbows down · **b)** bladed, the right elbow up | **a** |
| F3 | The bolt after a shot | **a)** the right hand: off the grip to the knob, up, back (the case thrown out to the right), forward, down, back to the grip — the rifle kept at her shoulder, her cheek on it, the left hand where it is (all three games, the real thing) · **b)** the rifle lowered off the shoulder to work it | **a** |
| F4 | The reload | **a)** AW2's and RE5's: the rifle swung up nearly upright before her right chest, the muzzle up, the left hand high on the fore-end; the right hand opens the bolt, brings the rounds one at a time (F5) and thumbs each down into the magazine, runs the bolt home; her head bowed to the action; back to the ready · **b)** RE4R's: kept low, canted across her body, the muzzle up to her left, the same hands · **c)** at the shoulder, only canted to the right (topping off) | **a** |
| F5 | Where the rounds come from | **a)** a cartridge sleeve on the stock's right side (off her cheek), five rounds in its loops — close to the right hand with the rifle upright, seen on the gun · **b)** a small pouch at her belt's right front (crowded: the revolver's holster and speedloader pouch, the double-barrel's shell carrier) · **c)** from a pocket, none seen | **a** |
| F6 | Put away | **a)** on her back too, upright down the middle, the muzzle down, the stock up between her shoulder blades (RE4R's slung long gun), over the two crossed ones · **b)** gone, as now (AW2: only in her hands) · **c)** by its sling over her right shoulder, the muzzle up, at her right side (RE5's S75, a hunter's carry) — **after phase 0** (upright it reached her calves): **d)** on the AK's diagonal, over it — the muzzle up past her left shoulder, the stock at her right hip, flat, its bolt out (chosen) | **a** → **d** |
| F7 | The torch with it | **a)** in the left fist against the fore-end, along the barrel (as the AK's and the double-barrel's) · **b)** off while it's out | **a** |

The server's times stay (the bolt 0.85 s from 0.2 s after the shot; the reload 0.35 open, 0.5 a round, 0.35
shut) whatever F3–F4.

## Phases

0. **Mocks** — Blender stills on the life man (`tools/art/guns/mock83.py`, as `mock82.py`): the carry (F1), the
   aim (her eye at the scope), the bolt's keys (the right hand at the knob: up, back, forward, down), the
   reload's keys (raised, the bolt back, a round from F5 thumbed in, the bolt home), the rounds' place (F5),
   put away (F6) with the other two; from the side, the front and the game's camera. **Signed off before code.**
   Rendered 2026-11-13: `tools/art/guns/mock83.py` → `design/guns/p83/sheet-83-hold.png`, `sheet-83-bolt.png`,
   `sheet-83-reload.png`, `sheet-83-slung.png` (and each still). Found in phase 0:
   - **The scope is above the eye**: with the butt in the AK's aimed pocket and his head down on the riser as
     far as a head goes on a stock (down 0.45, over 0.16 rad), his right eye is 7.6 cm under the scope's axis —
     so the rifle comes up 5.9 cm and 4.5 cm in to it (the game's `cheekTo` does the same: the head's share,
     then the gun's). His eye then on the axis at its relief (9 cm behind the eyecup).
   - **The left hand reaches the fore-end square** (his left shoulder 7 cm forward): 0.18–0.2 m out from the
     grip carried and aimed — behind the folded bipod (0.32–0.56), as the AK's magwell hold.
   - **The bolt**: his right hand from the grip to the knob — turned up it stands by the scope's eyepiece, so
     his hand comes up beside his face (as AW2's and RE4R's); his elbow out and down, his forearm along the
     stock. The case thrown out to his right as the bolt runs back.
   - **The reload** raised ~52° (between AW2's upright and RE4R's canted — upright, the muzzle stood 20 cm over
     his head and his left hand at his face): the muzzle up and a little left, its right side turned to him,
     his left hand on the fore-end at his chest, his head bowed to the action; his right hand: the bolt up
     and back, down to the sleeve at the butt (by his hip), a round up to the port, thumbed down, the bolt home.
   - **Put away (F6a) is too long**: 1.27 m upright down his back from his shoulder blades, the muzzle down
     reaches his calves (~25 cm off the ground — his legs would hit it walking). Rendered beside it: the
     other way up (the butt at the small of his back, the muzzle ~30 cm over his head) and on the AK's
     diagonal over it (the muzzle up past his left shoulder, the stock down at his right hip, flat, its bolt
     out — RE5's S75). **The user chose the diagonal over the AK** (2026-11-13).
1. **The grip** — `tp/sniper-hold.ts` `SN_LONG` on the long hold (`tp/long-hold.ts`): the right hand on the pistol
   grip, the left under the fore-end, each a socket with its own turn and fingers (searched as small turns of
   the AK's hands and looked at); the gun out of the old path (`isLongGun`'s branch keeps the Daybreak and the
   cue). The bench takes `gun=sniper` (its checks: the fore-end's box, the stock's and barrel's rods, the
   stock's profile; `ready`). The strict audit's carried and aimed states on both bodies.
   Done in phase 1:
   - `SN_LONG` (`tp/sniper-hold.ts`): the right hand on the pistol grip (the AK's turn — its grip raked as the
     AK's), the left cupped under the fore-end at 0.17–0.31 m (behind the bipod), the palm 2 mm inside its
     underside, the thumb out along its left side; carried at the AK's low ready with the butt 1.5 cm further
     ahead and the muzzle a little more across her (`pocket` [0, −0.03, 0.085], `across` 0.32); her left
     shoulder 12 cm forward (`protract` 0.12); aimed with her cheek on the riser, `cheek` at the scope's
     height (11.2 cm) — her right eye on its axis in every aim (y 11.2, z 0 to the millimetre).
   - Found: the AK's left palm (7 mm inside) put the smaller hand's index 9 mm into the wood, its thumb the
     bigger hand's 7 mm; the AK's pocket had the tall stock's toe 2.5–3.8 cm into the fuller chest's shirt; at
     the AK's shoulder reach, with the butt ahead, the left hand fell 1.1–1.3 cm short.
   - The strict audit (both bodies, a tee; carried still, walking, running, turned, with the torch; aimed at
     every turn × the game's whole pitch × the torch — 35 states each): feminine none flawed, masculine one
     (the right wrist 3° past its reach aimed sideways with the torch).
   - The eye's ~11–17 cm behind the eyepiece (a real scope's relief ~9): its place along the bore is the butt's
     in the pocket — phase 3 looks at it (or the scope moved back on the gun).
   - The person's long-hold branch keeps the AK's reload to the AK (`LS === AK_LONG`); the sniper's bolt and
     reload are held at the hold till phases 4–5 (the bolt part still moves).
2. **The carry and put away** — F1; drawn and put away (F6: its sling, its keys, its gap to her back — plan
   82's `slungGap`, crossed with the other two; or gone).
   Done in phase 2:
   - `Player.slingSn` (the server's schema and `features/arms.ts`: she carries a sniper; the client's model,
     controller and person-in), as the AK's `slingAk`.
   - `SN_SLING` (`tp/sniper-hold.ts`): the AK's place and turn (flat, its right side — the bolt — to her, its
     top up toward her right shoulder), its keys and its draw by the stock (`grab`), 0.6 s off and 0.5 back
     (shared `ARMS.sniper.draw` 0.5 → 0.6, as the AK's); its strap the AK's way 1.5 cm out over it; its studs.
   - Stacked (`SlingSpec.over` now a list of the flags under it, each its own way out): the AK 2.5 cm out over
     the double-barrel, the sniper 7 cm over the AK and 2.5 over the double-barrel (at 6 over the AK it touched
     the AK's receiver). Measured by `slungGap` (slim, regular, broad; both genders; a tee or a coat; alone, with
     the AK, with the double-barrel, all three): 0.2–2.8 cm to what's under it, nothing of it inside her.
     The bench's `all=1` slings all three.
   - Drawn, its wrist within its reach and its forearm ≤35° all the way (both bodies, alone and with all
     three). **Left**: hanging at her right side mid-draw (0.2–0.75 of it, ~0.3 s), her right forearm on the
     pistol grip lies along the tall stock and goes 3–6 cm into its belly — the grip's so near the belly that
     the forearm follows the stock whichever way the rifle hangs (tried: tilted out, rolled, further out and
     back, hanging forward; held by the stock longer bent her wrist 108–136° past its reach; the arm's
     `avoid` rod made no difference).
3. **The aim** — the butt in the pocket, her cheek on the riser and her right eye on the scope's axis at its
   relief (plan 82's `cheekTo`, the scope's height for the sights'); the scope view taken from her eye, so its
   first frame doesn't jump; the torch (F7); the kick.
   Done in phase 3:
   - **The scope 3 cm back on the gun** (`tools/art/guns/guns.py` `sniper()`: the scope, its rings, turrets
     and lenses, the `rear`/`front` points; the rail 1.5 cm longer behind; `sniper.glb` rebuilt — 154 KB,
     18k triangles, within the budget): aimed, her eye was 12–17 cm behind the eyepiece (her cheek on the
     riser, the butt in the pocket); now 9–14 (a real scope's ~9).
   - The strict audit again, aimed at every turn × the game's whole pitch × the torch, carried still,
     walking, running, turned: **none flawed on either body (35 states each)** — the masculine's 3° at one
     side aim gone with it.
   - **The kick** (`kick` flip 0.14, back 0.025, rock 0.06): the muzzle ~6° up 70 ms after the shot, back by
     0.35 s; both hands on throughout, the wrists within their reach, nothing in the gun.
   - **The scope's camera stays the view's own** (`tp/view.ts`: her head's place, ahead and right of it):
     looking down the scope her own body isn't drawn — nor posed (off screen) — so the camera can't follow
     her eye there; the glass's dark ring covers the few centimetres between.
4. **The bolt** — the right hand's timeline on `ARM.bolt` (0.85 s): to the knob, the bolt turned up, run back
   (the case thrown out to the right — falling, its sound on the floor or the snow), forward, down, back to the
   grip; her cheek kept; seen by others; the bench drives `ARM.bolt`.
   Done in phase 4:
   - **One timeline** (`tp/sniper-hold.ts` `SN_BOLT`, `snBoltAt`) on `ARM.bolt`'s 0.85 s: her right hand off the
     grip to the knob (0–0.13 s), the bolt turned up (–0.28), run back (–0.43), home (0.47–0.6), down (–0.7),
     her hand back on the grip (–0.85); the bolt part posed by it (`poseGun`'s `bolt`, the hand's place taken
     from the bolt's own frame as it turns and runs); played to its end if the server's step ends sooner. The
     rifle stays at her shoulder, her cheek on it, her left hand on the fore-end; others see the same.
   - **Her right hand on the knob** (`SN_KNOB_HAND`, in the bolt's frame): to its right, behind and under it,
     the palm to the gun, the knob in the curl of her index and thumb. The mocks' turn bent her wrist 11–43°
     past its reach through the cycle; a search of small turns of it (29° in, 29° up): within its reach at every
     moment on both bodies, her forearm turned ≤34°, her hand ≤2 mm off the knob, no finger or arm in the gun,
     her eye on the scope's axis throughout.
   - Its sounds on the hand's moments (`dark/arms.ts`): the bolt open at 0.14 s, the case out at 0.4, shut at
     0.56. The bench plays it: `act: "bolt"`, `actT` 0–1 of the 0.85 s.
5. **The reload** — one timeline on the server's steps (`ARM.open`, the rounds, `ARM.shut`): raised (F4), the
   bolt back by the right hand, each round from F5 to the action and down into the magazine, the bolt home,
   back down; let go mid-reload; others see it.
   Done in phase 5:
   - **The sleeve on the gun** (`tools/art/guns/guns.py`: a leather band on the stock's right side, five .308
     rounds standing in it — `round0–4`, shown by how many are left; `sniper.glb` 165 KB, 19k triangles, within
     its budget). Shown five, less the ones taken this reload.
   - **The server tells the closing** (`features/arms.ts`: `ARM.shut` for the sniper too, as the double-barrel's
     and the AK's; its test waits for it): everyone's screen runs the bolt home then.
   - **One timeline** (`tp/sniper-hold.ts` `SN_LOAD`, `snLoadAt`): her left hand over the fore-end's top (0–0.12
     s), the rifle raised before her right chest (–0.3; `SN_LOAD_GUN`, the mocks' ~52°); her right hand to the
     knob, the bolt up and back (–0.35); each round (0.5 s): down to the sleeve, one pinched out, up to the port,
     laid in along the bore and thumbed down; closing (0.35): to the knob, the bolt home and down; back (0.3):
     her hand to the grip, the rifle down, her left hand back under it. Her eyes on the port the while. The round
     in her hand goes with her wrist (its place taken at the sleeve). Seen mid-way: on from the opening or the
     closing.
   - **Each hand's places searched** (small turns of a start, as before): her left over the fore-end's top
     (`SN_LOAD_GUN.hand` — under it, raised, her forearm turned ~100°), her right on the knob raised
     (`SN_LOAD_KNOB` — the shoulder's bent her wrist 85° past), at the sleeve (`SN_SLEEVE_HAND`) and at the
     port (`SN_PORT_HAND`). From 0.3 s to 3.15 (all the loading): **none flawed on either body** — each wrist
     within its reach, each forearm ≤41°, each hand ≤1.2 cm off its place, nothing in the gun.
   - The bench plays it: `pose: "reload"`, `t` 0–1 of 3.5 s (opened, five rounds, closed at 2.85, back).
   - Found and fixed on the way: the timeline's "not closing yet" as Infinity made its weights NaN — the left
     arm's bones went NaN (nothing drawn of it).
   **Left** — the two changes of hold, ~0.15 s each (raising: 0.05–0.25 s; lowering: the last 0.25): her left
   wrist up to 38° past its reach as her hand turns from under the fore-end to over it, her left forearm 1.4–2
   cm through the scope's front and her right forearm 5–6 cm through the stock's belly as her hand leaves the
   grip for the knob, her left fingers 2 cm into the fore-end as it comes back under. Turning her left hand
   after the raise instead was worse (her forearm turned 70–96°).
6. **Everything else** — port arms in a roll, a vault, a slide, struck (1.27 m: the floor — plan 81's fourth
   feedback); sat, swimming, busy; the far people's cheaper hold. The Daybreak stays on the old path till its
   own plan.
   Done in phase 6:
   - **Its own port arms** (`SN_PORT_ARMS`, `LongSpec.port`): it had none — the double-barrel's (upright across
     her chest) put her right wrist 67–78° past its reach, her left forearm turned 68–79°, and the rifle 24–35 cm
     through the floor in a roll; the AK's (across her chest, the muzzle to her left) had the wrists within their
     reach but the rifle 6–10 cm through the floor and her right forearm 3–5 cm into the stock's belly.
     Searched about the AK's (72 tried): higher and nearer her, the muzzle down to her left ~21° and a little
     ahead, her left hand over its top (palm down, the AK's): **over the floor all through a roll (1.9 cm at its
     lowest on the feminine body, 8.7 on the masculine), the wrists within their reach, the forearms turned
     ≤50°, nothing in the gun** (her right forearm 4 mm off the stock's belly at the roll's deepest) — in a
     roll, a vault, a slide, struck.
   - Sat, swimming, busy, down: let go of (plan 81's), in her right hand; the far people's cheaper hold (plan
     81's).
7. **Checks** — `e2e/sniper-bench.spec.ts` (the strict audit, both bodies: carried, aimed at the game's whole
   reach, the bolt's and the reload's moments, drawn, kept, sat), `e2e/sniper-two.spec.ts` (the world, two of
   us: carried, aimed, a shot and its bolt, reloaded, put away — on both screens), stills in the world; all the
   guns' specs green.
   Done in phase 7:
   - **`e2e/sniper-bench.spec.ts`** — the strict audit (plan 82's limits: held 1 cm / 3° / 53° / −3 mm;
     moving 1.2 cm / 6° / 53° / −8 mm), both bodies: aimed at the game's whole reach (pitch −0.55…0.7, three
     turns of her, with and without the torch) — upright, the butt in, her eye on the scope's axis and its
     relief; the low ready standing, walked, jogged, run, turned, the torch on; up from it in the gun's 0.3 s;
     drawn (eight moments) and slung again; the bolt's eleven moments (her right hand on the knob, the rifle at her shoulder, the bolt fully
     back); the reload's ten (the bolt back from 0.35 s to the closing, a round in her hand, the sleeve's
     rounds taken, the bolt home); port arms in a roll, a vault, a slide, struck, over the floor all through a
     roll; let go of sat. Settled where the elbow's eased swing (plan 81) needs it: after the page's load, a
     half-turn of her, a redraw.
   - **What it found, fixed**: the low ready jogged put the masculine right forearm 3 mm into the stock and
     run turned a feminine forearm to 53° — `SN_LONG.carry` across 0.32 → 0.3, run 0.15 → 0.08; port arms
     had the feminine right forearm 4 mm into the stock's belly in every act — `SN_PORT_ARMS.at` 2 cm nearer
     her (z 0.3 → 0.28: 1 mm in on her, within the 3, 7.6 off on him; still over the floor all the roll).
   - **What it allows, named in it**: the lowest aim (pitch −0.55) turns the feminine left forearm to 54–55°
     (51–54 by the way she came to it: 55° there only); mid-draw (0.1–0.8) the arms may pass the gun by 7 cm —
     the right forearm through the stock's belly as it comes off her back (phase 2's "left").
   - **`e2e/sniper-two.spec.ts`** — the world, two of us (Bia beside Ana on the pond's shore): slung on her
     back on both screens; drawn into the low ready, both hands on; aimed — down the scope on hers, upright
     on Ana's (≤2°); a shot heard, the bolt worked (back past half) on both; a second; reloaded — the bolt back,
     a round in her hand, the closing, the bolt home, five in — on both; put away, slung again. Stills of each,
     hers and Ana's: `design/guns/p83/world/`.
   - Green with it: every gun's spec — the AK's, the double-barrel's and the revolver's benches, `arms-feel`,
     `guns-two`, `ak-two`, `shotgun-two` (8 of 8); the world server's arms tests (16), the life look's budgets
     (18), tsc, biome. **Plan 83 done.**

## Feedback, 2026-11-13: "braço direito fino aleatório"

In the game, now and then her right arm thin — the sleeve pinched to a point at the wrist (the user's own look:
a dark sportcoat over a shirt and tie, the neutral body, long hair, a beard).

- **Not the hold itself**: at the low ready her body in the world is the bench's — the same bones (to 0.01),
  the same meshes and morphs, the gun and the elbow within 1 cm — her right forearm turned 4–15°, and from
  the game's cameras 98–100% of it in view (rays from six places round her right and back to its sleeve; the
  tall stock hides none of it). In a red or white coat its sleeve is whole from the same camera; in the dark
  one its lower half, in the rifle's shadow, goes into the coat behind it.
- **Struck**: traced every frame in the world, she was hit (her health 60 → 45, at dusk) and the rifle went
  across her chest and back out in the flinch's 0.7 s (port arms, plan 81 phase 5): her right forearm turned
  48° all of it — its sleeve pinched thin — and her left spun from 105° one way to 137° the other as her hand
  went from under the fore-end to over it and back (her left hand 1.2–1.6 cm off the gun). Random: whenever
  something hits her.
- **Now** (`LongSpec.port.struck`, false for the sniper): struck, she keeps it at the ready through the
  flinch, and the gun goes as her chest goes (bent over ~12°, thrown aside ~16° — kept level, it wrung her
  right forearm 44–54°): through a whole hit her right forearm 20–31° (masculine; 48 the feminine, her rest
  36–41), her left 47–50 (her rest), both hands on, nothing through the gun. A roll, a vault, a slide still
  pull it across her chest. The bench spec plays a hit through and holds every frame of it to that. Stills:
  `design/guns/p83/golpe-antes.png`, `golpe-depois.png`.
- The AK and the double-barrel still pull in when struck (the same wrung forearms): theirs is the same flag —
  left as they are, the user's call ("só o sniper", 2026-11-13).
- Tools: the bench takes someone's own look (`hair=`, `beard=`, `extra=`, `outerColor=`), the world camera's
  distance for the body's detail (`far=`), and `__revolver.pin` (her state: `wm`, `st`, `hp`), `orbit()`,
  `camAt()` (a camera put where the world's was, in her frame).

## Risks

- **Its length** (1.27 m): through the floor in a roll whatever the port; the muzzle into walls carried; the
  far people's cheaper hold.
- **The scope view and her body**: the camera goes to her eye at the scope; others see her body aim — the two
  must agree, or the first frame down the scope jumps.
- **The bolt in the scope**: out of the scope while it's worked (plan 79) — the over-the-shoulder camera shows
  the right hand at it; it must read in 0.85 s.
- **Three long guns**: the double-barrel and the AK slung on her back already (F6).

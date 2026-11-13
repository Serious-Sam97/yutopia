# 82 — The AK-47, held right

Ask (2026-11-12, the user, after plan 81 — one gun at a time, the AK next), the same four as the revolver's
and the double-barrel's:
1. The hands don't hold it right: a hand goes through it.
2. How she holds it should be like Leon in Resident Evil 4, or Saga in Alan Wake 2.
3. Aiming, the hands and arms are all wrong.
4. The reload is all broken; its animation is horrible.

References: Alan Wake 2, Resident Evil 4, 5 and 6 (images and videos).

Status: **planned 2026-11-12; forks decided by the user 2026-11-12**: **F1b the low ready in both hands
before her** (not at her side as the double-barrel — her shoulders square all the same: her left shoulder
forward to the handguard, never her trunk turned), F4a rock and lock (the empty dropped; racked under the
rifle when dry; the server's times as now), F5a a pouch at her left hip's front, F6a slung on her back
mirrored to the double-barrel's; F2a (square) and F3a (the torch against the handguard) as recommended, not
asked. **Phase 0 (the mocks) rendered 2026-11-12**: `tools/art/guns/mock82.py` → `design/guns/p82/sheet-82-hold.png`,
`sheet-82-reload.png`, `sheet-82-sling.png` — signed off 2026-11-12. **Phase 1 (the grip) built 2026-11-12** —
plan 81's hold made per gun (`tp/long-hold.ts`), the AK on it (`tp/ak-hold.ts`); its stills
`design/guns/p82/bench-1-hold.png`; committed 6bf13fb. **Phase 2 (the carry, the sling) built 2026-11-12** — stills
`design/guns/p82/bench-2-carry.png`. Follows plan 81 (the double-barrel: the long gun the
anchor, carried at her side, the left shoulder brought forward to reach, the forearms' twist minded, the
stock kept out of her, port arms through whole-body moves, the reload as one timeline, `ARM.shut`), plan 80
(the revolver: `PersonModel.gripTo`, the hand sockets, the bench) and plan 79 phase 5 (the Blender AK, its
moving parts, the server's magazine reload).

## Where we are — read from the code

- **The AK is still on the old long-gun path** — the double-barrel's before plan 81 (`Person3D.gunHands`, the
  branch after the double-barrel's: `isLongGun` takes the AK, the sniper, the Daybreak and the cue). The gun
  hangs under the right wrist by a fixed frame (`GUN_IN_WRIST`) and `aimGun` turns it *inside the hand* to
  point where `gunHands` wants — the pistol grip and the stock pass through the fist and the forearm.
- **The right hand goes to a point** (`reachTo`: where the grip is, no turn); **the left to a point** under the
  gun's `fore` (`gripOnFore`), no turn, its fingers not closed on the handguard.
- **Carried**: the old heavy carry — the butt against the right side of her chest, the gun across her, the
  muzzle ahead and left (`gunWay`), the numbers the double-barrel had.
- **Aimed**: shouldered along the look by the same numbers; the right wrist turned onto it by `aimHand`.
- **The reload** (plan 79 phase 5, `magHand`, `AK_LOAD`): the gun kept up at the shoulder, the muzzle lowered
  and turned left; the left hand point to point — to the magazine, rocked out on its front lug, down to a
  pocket by the left hip, back with another, rocked in; run dry, over the top to the charging handle on the
  right and racked, back. The magazine follows the left hand while it's off the gun (`magFrame`). The server
  (shared `ARMS.ak47`): out 0.8 s (the rounds left in it back to the pockets), a new one in 1.0 s, shut 0.4 s
  — or the charging handle racked, 1.0 s, if it ran dry. Full auto, 0.1 s a round.
- **Put away**, it vanishes: no sling.
- **The model** (`tools/art/guns/guns.py` `ak47`, plan 79): the pistol grip (its origin), the lower handguard
  0.24–0.47 m along (the `fore` point 0.34), the magazine (it rocks on its lug, 0.124 along), the carrier with
  the charging handle on the right (it runs back), the selector on the right, the stock to its butt plate
  (−0.41). Moving parts: magazine, carrier, trigger, selector.
- **The Daybreak** (plan 79 phase 7) shares this path (its cell for the magazine, never racked): it stays on
  it until its own plan.

So the AK needs what plans 80–81 gave the revolver and the double-barrel: **the gun the anchor, both hands put
on it at places on it with their own turn and fingers**, carried as she's asked for the double-barrel, the
butt in the shoulder aimed, and the reload one timeline the hands, the magazines and the charging handle
play together.

## What plan 81 taught (kept here)

- **Never buy the left hand's reach by turning her trunk** — her shoulders square ("ugly as hell" side-on);
  her left shoulder comes forward instead (`SG_PROTRACT`), and the hand's place is solved by the wrist's
  exact reach.
- **Carried at her side** in the right hand, her left hand free till she aims (the user's call for the
  double-barrel). For the AK the user chose otherwise (F1b): the low ready in both hands before her — so the
  left hand must reach the handguard with her shoulders square (her left shoulder forward, the handguard
  nearer her than the double-barrel's fore-end); phase 0's mocks show it first.
- **The forearms never pinched thin**: `gripTo`'s twist minded (doubled past 50°, a wall past 86°), its swing
  smooth and a little held; measured each time (`e2e/arms-steady.mts`; the twist).
- **Nothing of the gun in her**: the stock out of her chest at every hold, the bust minded
  (`e2e/arms-stock.mts`, the bench's `stockIn()`).
- Judged as the user sees it: the over-the-shoulder game camera, both bodies, a t-shirt.

## References (2026-11-12)

- **Alan Wake 2** has no assault rifle: Saga's are a pistol, a sawed-off and a pump-action, a crossbow and a
  bolt-action hunting rifle ([Alan Wake Wiki](https://alanwake.fandom.com/wiki/Weapons_(Alan_Wake_2)),
  [GamesRadar](https://gamesradar.com/alan-wake-2-weapons-locations-how-to-find)). So: Saga's posture
  (trained, square, the long gun low between shots), as for the double-barrel.
- **Resident Evil 5** — the AK-74 is Chris's and Sheva's (a slow reload, a small magazine:
  [Rely on Horror](https://www.relyonhorror.com/in-depth/resident-evil-in-depth/resident-evil-5-in-depth/resident-evil-5-weapons),
  [IMFDb](https://www.imfdb.org/wiki/Resident_Evil_5)); **RE4 Remake** Leon's rifles and **RE6**'s assault
  rifles held the same way: square, the stock in the shoulder, the support hand out on the handguard. No
  written source on their animations — to be keyed from video in phase 0.
- **The real AK reload** ([Shooting Illustrated](https://www.shootingillustrated.com/articles/2020/2/10/tips-best-way-to-reload-an-ak/),
  [Shooting Illustrated, how to run your AK](https://shootingillustrated.com/content/how-to-run-your-ak),
  [Travis Haley via GunMag Warehouse](https://gunmagwarehouse.com/blog/travis-haley-ak-magazine-changes/)):
  1. the empty out — the catch pressed, the magazine rocked forward off its front lug;
  2. the new one's front lug hooked in the well, rocked back toward the trigger guard till it clicks
     ("rock and lock");
  3. no bolt hold-open on an AK: run dry, the charging handle (on the right) is racked — commonly the
     support hand **under** the rifle sweeps it back with its index finger and lets the spring drive it home
     (the right hand stays on the grip, the sights stay up).

## The idea

Plan 81's machinery, for the AK:

- **The gun the anchor**: carried (F1), aimed with the butt in the shoulder's pocket, the cheek on the stock.
- **The right hand on the pistol grip** by a frame of its own (as the revolver's grip: the web high on the
  backstrap, the fingers round its front), the index along the receiver carried, on the trigger aimed.
- **The left hand on the lower handguard** at a socket on it, its own turn, its fingers round it — never a
  point; reaching with her shoulder, never her trunk.
- **The reload one timeline** (plans 80–81's): the empty out, a new one from its pouch, rocked in; racked
  under the rifle if it ran dry; in time with the server's steps; everyone sees it.

## Forks — decided 2026-11-12

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| F1 | Carried (not aiming) | **a)** at her side as the double-barrel: in the right hand by the pistol grip, along her right leg, the muzzle ahead and down, her shoulders square, the left hand free till she aims · **b)** the low ready in both hands before her — the AK's handguard is nearer her than the double-barrel's fore-end, so maybe without turning her (her left shoulder forward) · **c)** muzzle up, the stock at the hip ("port" carry), both hands | **a** |
| F2 | Aimed | **a)** square: the butt in the pocket, the cheek on the stock, both elbows down · **b)** bladed, the right elbow up | **a** |
| F3 | The torch with it | **a)** held against the handguard in the left hand, along the barrel (as the double-barrel's) · **b)** off while the AK's out | **a** |
| F4 | The reload | **a)** rock and lock: the empty rocked out and dropped (it falls, lies a moment), a new one from the pouch hooked and rocked in; run dry, the left hand under the rifle racks the handle — the server's times as now (out 0.8, in 1.0, shut 0.4 / racked 1.0: 2.2 s, 2.8 dry) · **b)** the same, the empty kept — put back in the pouch first (a little slower: out 1.0) · **c)** the new magazine knocks the empty out (one move, the AK's fast change — out and in together, ~1.6 s) | **a** |
| F5 | Where the magazines are | **a)** a pouch on the belt at her left hip's front, two magazines seen in it (the left hand fetches; the right side has the revolver's pouch and the shells) · **b)** a chest rig, three pouches across her front · **c)** none seen — from the left hip's pocket, as now | **a** |
| F6 | Put away | **a)** slung on her back, mirrored to the double-barrel's (the muzzle up past her left shoulder) so both fit · **b)** slung muzzle down at her right side, the strap over her right shoulder · **c)** gone, as now | **a** |

## Phases

0. **Mocks** — Blender stills on the life man (`pose.py`, as `mock81.py`): the carry, the aim (and with the
   torch), the reload's keys (the empty out, the new one in, racked under), the sling and the pouch; from the
   side, the front and the game's camera. **Signed off before code.**
   Found in phase 0:
   - **Square, the left hand can't reach the handguard**: its back end is 0.68 m out from the butt (the
     double-barrel's fore-end 0.55) — with his shoulders square, 20 cm short at the ready, 13 aimed, even his
     left shoulder brought forward 5 cm. So **the left hand holds the AK in front of the magazine, under the
     receiver** (the "magwell" hold — the AK's own close hold), 0.16 m out from the grip: reached aimed and at the
     ready with his shoulders square (his left shoulder forward 7 cm), the ready brought in (the muzzle 26°
     down, across him a little more, the butt at the shoulder's front). The torch in that fist runs ahead
     along the barrel under the handguard.
   - **Reloading, the gun comes in close**: the butt tucked under his right arm, the gun across before him,
     the muzzle ahead, left and a little down, rolled so the well faces his left hand (kept up at the shoulder,
     the magazine was 12 cm out of the left hand's reach).
   - The rack under the rifle: the palm up under the receiver, the fingers up its right side, the index on the
     knob; the pouch at the left hip's front with two magazines, mouths up; slung, it crosses the
     double-barrel's on his back.
1. **The grip** — the AK's sockets (the pistol grip's frame, the handguard's, the butt's pocket point, the
   charging handle's, the magazine's lug); the AK onto the gun-as-anchor hold (plan 81's `longHands` made
   per gun); the bench `?gun=ak47` with the checks (no hand through the gun or the other, the gun along the
   look, each wrist at its place, the twist, the stock in her).
   Found in phase 1:
   - **One hold for every long gun**: `tp/long-hold.ts` `LongSpec` — the right hand's grip socket and what its
     fingers close round, the left's fore part (on a part of the gun — the double-barrel's barrels, they drop —
     or the gun itself), the torch in that fist, the butt, the carry (`side`: the double-barrel's; `ready`: the
     AK's low ready from the shoulder's pocket), the aim's pocket, the blades, the left shoulder's protraction,
     the kick, the bench's boxes and rods and the stock's profile. `SG_LONG` (tp/shotgun-hold.ts) the
     double-barrel's — the same numbers, its specs unchanged; `AK_LONG` (tp/ak-hold.ts) the AK's. The Daybreak
     stays on the old path.
   - **The right hand round the pistol grip aslant**: the mocks' fingers' way (52° down) bent the wrist 82°
     sideways in the game; square across the grip, as the revolver's, still 45°; turned 25° up from square
     (11° over the bore, the index side back from up the grip as much) it's 13–33°, the twist 0–52°.
   - **The left hand under the receiver, the fingers' way ahead and across** (not square across, palm flat up:
     her forearm turned past 60°, the wrist 45–60° sideways), the index side tipped up a little; its palm 7 mm
     inside the underside — tipped or lower more and the index's joints went into the receiver, the little finger
     into the magazine. Her left shoulder forward 9 cm (at 6.5 her hand fell 1–3 cm short). Measured: the twist
     33–46°, the wrist 26–41° sideways, ≤3 mm into the gun, the magazine clear, ≤5 mm short (both bodies).
   - **The low ready**: the butt at the shoulder's front, further out on a fuller chest (its toe touched her
     chest: now ≤1 cm of the pad on her shirt, both bodies); her trunk 0.08 rad bladed, aimed 0.25.
   - **The hold eased from her right shoulder**, not her root: running, the gun lagged the shoulder's bob and the
     near-straight left arm threw its elbow 3–3.8 cm a frame; now ≤1.5 at a sprint (the double-barrel's
     unchanged: its aim ≤0.9).
2. **The carry** (F1) — walking, running; the draw and the put-away (F6, the sling).
   Found in phase 2:
   - **Slung on her back** (`Player.slingAk`, the server's as `sling` is the double-barrel's — carried, it
     isn't in her hands): the double-barrel's mirrored — the muzzle up behind her left shoulder, the stock down to
     her right hip, its top to her back (the magazine out), the strap from the front swivel over her left
     shoulder, across her chest to her right hip, round to the stock's loop. Carrying both, the straps cross on
     her chest and the AK lies over the double-barrel (8.5 cm further out: their middles met in her back). The
     sling made per gun (`SlingSpec`: the place, the turn, the draw's keys, the times, the strap) — the
     double-barrel's the same numbers.
   - **Drawn off her back, down her right side**: her right hand to the grip low on her back, the gun turned
     down across her back (the muzzle past her left hip) to hang muzzle down at her right side, its top ahead,
     the stock up behind her arm, then swung up ahead to the low ready, her left hand meeting it at the end.
     Swung round her side upright first, its top to her, the grip was held fingers up — her wrist 57–97° past its
     reach; this way within it after the first tenth (both bodies). Put away, the same way back.
   - **The draw 0.6 s** (shared `ARMS.ak47.draw`, was 0.45 — the double-barrel's, off the back).
   - **The low ready walking, jogging, sprinting**: both hands on, her shoulders square, no hand or arm through
     it, its elbows ≤1.5 cm a frame (phase 1's).
   - Till phase 4 the AK's reload is held at the low ready (no magazine out — `e2e/guns-two.spec.ts` checks that
     she keeps it in her hands meanwhile).
3. **The aim** (F2, F3) — the butt in the pocket at every pitch (her trunk bent with it), the cheek on the
   stock; the torch's hold; full auto's kick round after round (the muzzle climbing, the hands held on);
   dry fire.
4. **The reload** (F4, F5) — one timeline; the magazines (the empty, the pouch); racked under when dry; a
   shot mid-way; the server's steps as decided; everyone sees it; the sounds on its moments.
5. **Everything else held** — plan 81's: kept across her chest in a roll, a vault, a slide, struck; let go
   sat, swimming, busy; the far people's cheaper hold.
6. **Checks** — the bench spec, the two-of-us world spec (slung, drawn, aimed, a burst, reloaded dry and not),
   the steadiness and the stock tools, stills in the world.

## Risks

- Full auto: ten rounds a second, each kicking the gun — the hands must ride it without the elbows
  flickering (`gripTo`'s swing is eased; checked firing).
- The Daybreak shares the old path: the new hold is the AK's only; the Daybreak's untouched till its plan.
- A crowded belt if she carries everything: the revolver's holster and pouch and the shell carrier on the
  right, so the AK's pouch on the left (F5a).
- Two slings if she carries both long guns (F6a mirrors them so they cross, not clash).

# 81 — The double-barrel, held right

Ask (2026-11-12, the user, after plan 80 — one gun at a time, the shotgun next):
1. The hands don't hold it right: a hand goes through it.
2. How she holds it should be like Leon in Resident Evil 4, or Saga in Alan Wake 2.
3. Aiming, the hands and arms are all wrong.
4. The reload is all broken; its animation is horrible.

References: Alan Wake 2, Resident Evil 4, 5 and 6 (images and videos).

Status: **planned 2026-11-12; forks decided by the user 2026-11-12**: F1a the low ready, F3a the torch
against the fore-end, **F4b the real reload a shell at a time** (~2.3 s for two: the server's open 0.45, a
shell 0.75, shut 0.35), F6a slung on her back; F2a (square), F5a (a carrier at the right hip) and F7a
(`/dev/arms`, one bench for every gun) as recommended, not asked. **Phase 0 (the mocks) rendered
2026-11-12**: `tools/art/guns/mock81.py` → `design/guns/p81/sheet-81-hold.png`, `sheet-81-reload.png`,
`sheet-81-sling.png` — signed off 2026-11-12 ("Start phase 1"). **Phase 1 built 2026-11-12** — stills
`design/guns/p81/sheet-81-phase1-hold.png`, `sheet-81-phase1-torch.png`; awaiting review. Follows plan 80 (the revolver: the
gun the anchor, `PersonModel.gripTo`, the hand sockets, the bench, the reload timeline), plan 79 (the
Blender double-barrel, F12a both shells out) and plans 58/77/78 (the body, its moves, its hands).

## Where we are — read from the code

The screenshot (2026-11-12: carried, from her front) shows what the code does:

- **The gun turns in the hand, not with it.** The long guns aren't plan 80's: the gun hangs under the right
  wrist by a fixed frame (`GUN_IN_WRIST`, plan 32's) and `aimGun` turns it *inside the hand* to point the way
  `gunHands` wants — so the stock and the grip pass through the fist and the forearm.
- **The right hand goes to a point**, the grip's (`reachTo`: a position and an elbow pole, no turn).
- **The left hand goes to a point** under the fore-end (`gripOnFore`), no turn, no fingers closed on it —
  the open hand hanging under the barrels in the screenshot.
- **Carried**, the butt is put "against the right side of the chest, the gun across the body, the muzzle
  ahead and left" by numbers (`gunWay`), not a held pose.
- **The reload**: the barrels drop (`poseGun`), the gun's turned under the arm muzzle down, the left hand goes
  point to point between the breech and a "pocket" by the left thigh with a shell (`loadHand`), one shell a
  0.45 s server step; the right hand's IK the same as carrying, nothing works the lever, nothing lifts the
  stock to close it. The server: open 0.3, a shell 0.45 each, shut 0.25 (1.45 s for two).
- **Put away**, it vanishes: there's no sling.

So the double-barrel needs what plan 80 gave the revolver: **the gun the anchor, both hands put on it at
places on it with their own turn and fingers**, the butt in the shoulder's pocket aimed, and the reload one
timeline the hands, the lever, the barrels, the shells and the stock play together.

## References (2026-11-12)

- **Alan Wake 2** — the double-barrel is *Alan's* (slow to reload, two shells); **Saga's** are a pump-action
  and a sawed-off ([Alan Wake Wiki](https://alanwake.fandom.com/wiki/Weapons_(Alan_Wake_2)),
  [Inverse](https://www.inverse.com/gaming/alan-wake-2-shotgun-locations-codes-sawed-off-double-barreled-pump-action)).
  So: Saga's carry and aim for the posture (a trained, square, two-handed hold, the gun low and close
  between shots), Alan's double for how the gun itself works.
- **RE4 Remake, Leon** — the shotguns held low between shots, both hands on, brought up only to aim; aimed
  square, the stock in the shoulder, the cheek on it. (No written source on its shotgun idle — to be keyed
  from video in phase 0.)
- **The real double-barrel reload** (side-by-side, ejectors —
  [Shooting Illustrated](https://www.shootingillustrated.com/articles/2017/3/6/tips-for-using-a-double-barrel-shotgun-for-home-defense),
  [Outdoor Life](https://outdoorlife.com/articles/guns/2014/12/rec-shooting-how-load-two-shotgun-shells)):
  1. the gun kept near the shoulder, the right thumb pushes the top lever across;
  2. the left hand on the fore-end lets the barrels drop — the ejectors throw the fired shells clear (both,
     plan 79 F12a);
  3. two shells from the carrier at once, between the fingers, dropped into both chambers together (one when
     one was fired);
  4. closed with leverage — the stock lifted up to the barrels, not the barrels slammed up — the grip retaken.
  A side-by-side opens less far than an over-and-under to reach both chambers: it's the quicker of the two.

## The idea

Plan 80's machinery, for a long gun:

- **The gun the anchor** — placed by what she's doing: carried (F1), aimed with **the butt in the shoulder's
  pocket**, the cheek on the comb, the rib under the eye (F2).
- **The right hand on the stock's wrist** (its semi-pistol grip) — the gun held in the fist by a frame of its
  own, the wrist put where the gun's place needs it (`gripTo`); the trigger finger along the guard at the
  carry, on the front trigger aimed.
- **The left hand under the fore-end** at a socket on it, palm up, the fingers round its side, its own turn
  and finger shape — never a point.
- **The reload one timeline** (plan 80's): the lever, the barrels dropping, the ejectors, two shells, the
  stock lifted to close it, in time with the server's steps (retimed, F4).

## Forks — decided 2026-11-12

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| F1 | Carried (not aiming) | **a)** low ready: the butt in the shoulder's pocket (or just under it), the muzzle ~35° down at the ground ahead, both hands on — up in a moment (Saga's, RE4 Remake's) · **b)** across the chest, port arms: the muzzle up and left, both hands on (a soldier's carry) · **c)** under the arm: the stock against the right hip under the forearm, the muzzle ahead and down, the left hand on the fore-end (a hunter's walk) | **a** |
| F2 | Aimed | **a)** square: the butt in the pocket, the cheek on the comb, both elbows down ~45°, the head down to the rib · **b)** bladed, the right elbow up (the old field stance) | **a** |
| F3 | The torch with it | **a)** held against the fore-end in the left hand, along the barrels (the thumb on its switch — the beam where the gun points) · **b)** the torch off while the shotgun's out (both hands the gun's) · **c)** as now (the left hand's, the fore-end hand placed beside it) | **a** |
| F4 | The reload | **a)** the real one above: the lever, the barrels dropped, both out, **two shells at once** (one when one was fired), the stock lifted to close — ~1.8 s for two (the server's: open 0.45, a shell 0.5, shut 0.35) · **b)** the same, a shell at a time (~2.3 s) · **c)** AW2-slow (~2.6 s), as Alan's | **a** |
| F5 | Where the shells are | **a)** a shell carrier on the belt at the right hip's front (beside the revolver's loader pouch) — the right hand fetches, the left holds the open gun by its fore-end · **b)** a sleeve on the stock (five shells, seen) — the left hand fetches · **c)** the coat's left pocket, the left hand (as now) | **a** |
| F6 | Put away | **a)** slung on her back (a leather strap), the gun seen there, drawn over the right shoulder · **b)** gone, as now | **a** |
| F7 | How it's made | **a)** plan 80's bench made one for every gun (`/dev/arms?gun=shotgun`), keyed and checked there · **b)** a bench of its own (`/dev/shotgun`) | **a** |

## Phases

0. **Mocks** — Blender stills on the life man (plan 80's `pose.py`): the carry, the aim (and with the torch),
   the reload's keys (the lever, open and ejecting, the shells in, closing), from the side, the front and the
   game's camera; the sling (F6). **Signed off before code.**
   Found in phase 0: with the shoulders square to the target the left hand fell 16 cm short of the fore-end
   (the butt in the right pocket, the gun straight ahead of it) — the trunk turned ~30° (the right shoulder
   back), the left hand reaches the fore-end's back third (0.2 m along from the grip; its back end at worst,
   reloading, 6 mm short); aimed, the butt's heel at the top of the shoulder (5 cm higher than the revolver's
   pocket) so the comb comes to the cheek; the carrier round on the hip's side (ahead of it, the stock under
   the arm hid the hand at it).
1. **The grip** — the double-barrel's sockets in its Blender file (the stock's wrist, the fore-end's
   underside and its turn, the butt's pocket point, the top lever, the comb), the lever and the ejectors as
   moving parts; the right hand's frame on the stock's wrist (not `GUN_IN_WRIST`); the long guns onto the
   gun-as-anchor hold (`gripTo` both hands — no turning in the hand); the bench made `/dev/arms` (F7) with the
   checks (no hand through the gun or the other hand, the gun along the look aimed, each wrist at its place).
   **Built 2026-11-12:**
   - **The gun the anchor** (`tp/shotgun-hold.ts`, `Person3D.longHands`): placed by its butt in the right
     shoulder's pocket — the low ready (muzzle 0.6 rad down) or aimed (the pocket 5 cm up: the comb to the
     cheek) — eased between them in the gun's own 0.26 s; her trunk turned `SG_BLADE` (0.5 rad) right of the
     gun's way (square, her left arm couldn't reach the fore-end). Upright and on the look at every pitch.
   - **The right hand** on the stock's wrist by a frame of its own (`longInHand`: the hand's frame met to the
     wrist's socket — no more `GUN_IN_WRIST` and turning the gun in the fist), its fingers closed round the
     wrist (`SG_WRIST_SHAPE`), the index along the guard carried, on the front trigger aimed. The mocks' hand
     (a pistol grip's, the knuckles 40° down) left the wrist bent 80° sideways: a shotgun's wrist is
     shallow, ~22°.
   - **The left palm up under the fore-end** (`SG_FORE`), as far out as the arm reaches (0.33 back to 0.16
     along), its own turn, its fingers closed round the fore-end as a box (a round one 5.4 cm across put the
     palm inside it: the fingers left open), the thumb laid along its left side (`thumbTo` — closed round it,
     it went into it); on the barrels' own frame, so it goes down with them breaking open.
   - **The checks** (`revolverCheck`, the shotgun's too): **the forearms against the stock and the barrels**
     (the screenshot's: through them) — 1.0–1.7 cm clear at every pitch; the left fingers against the
     fore-end's box; each wrist. The carry, walking and aimed level all within the limits.
   - **The bench is `/dev/arms?gun=`** (F7a; `/dev/revolver` its alias), its capture `GUN=shotgun`.
   - **Left for the next phases**: aimed steeply (±0.6 rad and past) the left hand falls 2.5–7 cm short of
     the fore-end and the right wrist goes 40–56° past its reach (phase 3, the aim at every pitch); the right
     wrist 22–28° past its reach level (the stock's place in the pocket fixes the elbow); the torch still
     the fist's own — through the fore-end (phase 3, F3a); the reload is the carry with the barrels dropped
     (phase 4); put away it still just goes (done in phase 2: the sling).
2. **The carry** (F1) — keyed whole; walking, running (tucked); the draw and the put-away (F6: from the sling
   over the right shoulder; the sling modelled).
   **Built 2026-11-12:**
   - **Slung on her back** (F6a; `slingFrame`): the gun under the chest bone (`SLUNG_AT`, `SLUNG_TURN`) — the
     stock up behind the right shoulder, its butt under the shoulder's top (level with it, the stock filled the
     game's camera beside her head), the barrels down to the left hip. Everyone's screen draws it from
     `Player.sling` (the server: a shotgun in her things and not in her hands — the holster's 500 ms check).
   - **The strap**: from the stock's swivel over the right shoulder, across the chest to the left hip and round
     to the barrels — flat leather, its points from her bones each frame (it rides the walk), a touch further
     out on a fuller chest (`STRAP_BUST`).
   - **The draw, 0.6 s** — **shared `ARMS.shotgun.draw` 0.35 → 0.6, the server's too** (the first shot waits
     for it; a game change — say if it's too slow): along five keys (`DRAW_KEYS`) — slung; lifted by the
     stock over the right shoulder (the barrels hanging behind her); over it (the barrels back); before her
     chest (the barrels up); the ready. The right hand on it from the start (reaching back to it the first
     12%), the left meeting the fore-end the last quarter, the trunk turning in with it. **Put away, 0.5 s**,
     the same way back.
   - **Running**: the muzzle only 0.08 rad steeper (0.2 put the fore-end past the left arm's reach — 3 cm
     short), the gun 4 cm further across her (her left shoulder swings back with the run).
   - **Checks**: the ready, walking and sprinting, with and without the torch, within the limits (the hands
     8–10 cm apart, the forearms 1.5–1.7 cm clear of the gun, each wrist at its place); the revolver's sweep
     and spec unchanged; arms-feel; the server's arms tests (16, the sling flag with them). Aimed steeply
     (±0.5 rad and past) still phase 3's.
   - Stills: `design/guns/p81/sheet-81-phase2-{draw,sling,carry}.png` (bench in `p81/bench`, slung on both
     bodies in `p81/p2`).
3. **The aim** (F2, F3) — the butt in the pocket at every pitch, the cheek on the comb, the head down; the
   torch's hold; the kick into the shoulder (the body rocked back, the muzzle up); dry fire on the front
   trigger; carry ↔ aim in the gun's own 0.26 s.
4. **The reload** (F4, F5) — the timeline: the lever, the barrels dropped by the left hand, the ejectors (the
   shells out as now), the right hand to the carrier and back with two (or one), in, the stock lifted to
   close, the grip retaken; a shot mid-way snaps it shut; the server's steps retimed; everyone sees it.
5. **Everything else held** — plan 80's: let go in a roll, a vault, sat, a hit's flinch; the far people's
   cheaper hold.
6. **Checks** — the bench spec (as plan 80's), the two-of-us world spec (holstered → slung, drawn, aimed,
   fired, reloaded), stills in the world.

## Risks

- The butt in the pocket at a steep pitch: the shoulder joint's reach on the life body (plan 77) — the bench
  shows where it gives; looking far down, the butt may leave the pocket, as a real shooter's does.
- The stock's length against her arm: the right hand on the wrist with the butt in the pocket fixes the
  elbow's place more than the revolver's grip did — the elbow search (plan 80) may find less room.
- The two shells between the fingers: two small props, the fingers' shape for them (plan 78's library).

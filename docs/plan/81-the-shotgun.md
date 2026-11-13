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
   **Built 2026-11-12:**
   - **The aim at every pitch: the trunk takes it** — a long gun's raised and lowered by the body bending at
     the waist, the gun, the shoulders and the head one piece: aimed, her spine and chest bend with the aim's
     pitch (`SG_AIM.trunk` 0.8 of it, on top of the aim pose's own). Aimed steeply the left hand had fallen
     2.5–7 cm short of the fore-end; now on it at every pitch, −0.9 … +0.9, with and without the torch.
   - **The torch under the fore-end** (F3a): along the barrels in the same left fist, its lens ahead, its
     body 6 mm under the fore-end's underside (its head clear of the wood where the fore-end rises at its
     front); the palm under it, the fingers round both (`SG_TORCH_HELD`: the fore-end's box and the torch's
     body), the thumb along the torch. It no longer goes through the fore-end. The beam is still the look's
     (the shared beam's — at the ready it's tipped at the ground ahead, a little above the muzzle's way).
   - **The kick into the shoulder**: a shot, aimed, turns the gun's muzzle up 0.22 rad about the butt, puts
     it 3.5 cm back into the shoulder, and rocks her trunk back 0.1 rad — the butt in the pocket throughout;
     at the arms' own kick curve (up in 35 ms, settling in ~0.1 s).
   - **Dry fire** as phase 1 left it: the trigger finger curls on in the guard as the triggers move (the arms'
     `trigger` — a shot, or pulled on empty); carry → aim in the gun's 0.26 s (22° off the look 50 ms in, on
     it by 320 ms).
   - **Checks** (`GUN=shotgun CHECK=1`): every pitch −0.9 … +0.9 with and without the torch, the ready,
     walking, sprinting, the torch's ready and walk, the kick — **none past the limits** (the hands 5–15 cm
     apart, the forearms 1.1–1.8 cm clear of the gun, each wrist at its place). The revolver's sweep and spec
     unchanged.
   - **Left as it was**: the right wrist turned past a real wrist's ease by 14° (aimed up) to 54° (aimed
     steeply down) — sideways toward the little finger, the forearm coming up to the stock's wrist. The
     mocks' hand on the stock was kept (tilting it, the thumb over the top, or the knuckles along the bore
     moved the numbers less than they spoiled the look); it isn't one of the checks' limits.
   - Stills: `design/guns/p81/sheet-81-phase3-{aim,torch,kick}.png`.
4. **The reload** (F4, F5) — the timeline: the lever, the barrels dropped by the left hand, the ejectors (the
   shells out as now), the right hand to the carrier and back with two (or one), in, the stock lifted to
   close, the grip retaken; a shot mid-way snaps it shut; the server's steps retimed; everyone sees it.
   **Built 2026-11-12:**
   - **The server's steps retimed** (F4b, shared `ARMS.shotgun`): broken open 0.45 s (was 0.3), a shell 0.75
     s (was 0.45), shut 0.35 s (was 0.25) — 2.3 s for two. **Its closing everyone's** (`ARM.shut`, Player.arm
     6 — the double-barrel's only, the others' as they were): the clients shut it when the server does, so a
     shot mid-way (it snaps shut) or a single shell left shuts it on time. Mine: a shot asked while it's
     shutting waits for it (queued, as while it's drawn).
   - **One timeline** (`tp/shotgun-hold.ts` `SG_LOAD*`, `Person3D.longHands` + `sgRight`), from the server's
     step opening it: the gun down under the right arm (the stock along the forearm against the ribs, her
     trunk turned less), the right thumb across the top lever, the left hand drops the barrels (it holds
     them the whole reload, under the fore-end by the hinge); the fired shells kicked out at 0.36 s (the
     sound and the brass with them — were at the break); then for each chamber, the left then the right, the
     right hand off the wrist down to the carrier, a shell drawn up by its brass, into the chamber and pushed
     home — the chamber's shell showing the moment the server counts it; then the right hand back on the wrist
     lifts **the stock up to the barrels** (they stay where the left hand has them) — shut — and up to the
     ready. Her eyes on the breech while loading.
   - **The shell carrier** (F5a): a leather strip on the belt at her right hip's side, four shells upright
     in its loops, their brass up — drawn whenever she carries the double-barrel (slung or out); the two she
     draws gone from it till the gun's shut. **The shell pinched** by its brass in the fingertips and the
     thumb, its hull out ahead of them, so it shows going in.
   - **The sounds in time**: the eject at 0.36 s; someone else's shells going in, one a step while it's still
     open; the close as the stock comes up (0.18 s into the shut).
   - The bench scrubs it (`/dev/arms?gun=shotgun`, pose reload: its 2.3 s); its capture keys the moments.
   - **Checks**: both hands on their places through it (the left on the barrels, the right at the carrier, the
     chamber, home); the shell into the chamber's mouth (under 1 cm off it pushing home); the server's
     arms tests (16 — the steps' times, ARM.shut, the snap).
5. **Everything else held** — plan 80's: let go in a roll, a vault, sat, a hit's flinch; the far people's
   cheaper hold.
   **Built 2026-11-12:**
   - **Let go, as the revolver's** (plan 80), in one hand, it hung from the fist along the fingers — a 1.1 m
     gun: thrown up by a hit's flinch it stood straight up before her face, in a vault it went through her
     leg and the floor, at the end of a roll it stood up through her knees. So **in a roll, a vault, a slide,
     Flowmotion, and struck, it's kept — pulled in across her chest** (port arms, `SG_PORT`): both hands on
     (the right on the stock's wrist by her right hip's front, the left up the fore-end), the barrels up past
     her left shoulder, its top in toward her — in her chest's own frame, so it goes round with her through
     a roll; eased in and out (0.08 s). Not mid-reload (the reload's hands have it).
   - **Let go as before** sat (on her lap, along her thighs), swimming, busy at something, a mantle (her
     hands on the ledge), the ragdoll — the gun in her right hand, eased back on after.
   - **The far people's cheaper hold** (plan 80's: past 11 m no elbow search, no fingers, thumb, trigger
     finger or head) holds for it, the reload's too: 0.22–0.35 ms a person near, 0.04–0.05 ms far (the
     revolver's 0.29 / 0.04).
   - The bench takes a vault, a slide and sat (`act`), and its capture keys them.
6. **Checks** — the bench spec (as plan 80's), the two-of-us world spec (holstered → slung, drawn, aimed,
   fired, reloaded), stills in the world.
   **Done 2026-11-12:**
   - **`e2e/shotgun-bench.spec.ts`** (the bench, GPU): aimed at four turns of her × four pitches (−0.9 …
     +0.9), with and without the torch — upright and on the look within 2°, no hand through the other nor
     the stock's wrist (3 mm), no arm through the gun (5 mm), each wrist within 1.5 cm of its place; the low
     ready at four turns, still, walking, running, with the torch; up from it in the gun's 0.26 s (off the
     look 50 ms in, on it by 420 ms); drawn from where it hangs slung (under 4 cm) out over her shoulder;
     the reload's seven moments (the barrels dropped or shut, a shell in the right hand or not, the gun off the
     right hand's grip, both hands at their places); kept across her chest through a roll, a vault, a slide,
     struck (both hands on, no arm through it); let go sat.
   - **`e2e/shotgun-two.spec.ts`** (the world, two of us): Bia given a double-barrel and twelve shells — on
     both screens slung on her back with the carrier on her hip; drawn over her shoulder into the ready, both
     hands on, her back empty; aimed upright; both barrels fired; the reload's timeline on both screens, a
     shell in her hand, two in after; put away, slung again. `YUTOPIA_SHOTS=<dir>`: stills from her own
     camera and from Ana's beside her (`design/guns/p81/sheet-81-phase6-world.png`).
   - Both passed first time; the revolver's spec, arms-feel, arms-empty, arms-fx and the server's 16 arms
     tests pass with them.
   - **Plan 81 done.** Left as they are, said in their phases: the right wrist turned past a wrist's ease
     aimed steeply down (phase 3); the beam the look's, not the torch's (phase 3); the reload's push a
     claw, not a pinch (phase 4).

## Feedback, 2026-11-12 (in the game)

Five things: the left hand folded away, a hole where it should be; walking aimed, she flickered; walking
carried, the right arm flicked; at the ready the stock's back end in her chest; loading, the stock in her chest
too.

- **The flicker** (both arms, walking — the revolver's too): measured frame to frame against her hips, the
  wrists moved smoothly and **the elbows jumped up to 3.5 cm a frame**, several times in three seconds.
  `gripTo` tried the elbow's swing round the shoulder→wrist line at 21 steps of 0.14 rad and took the best
  afresh each frame — a tie flipping between two steps threw the elbow a step. Now the best step is refined
  to the bottom of the parabola through it and its neighbours (the swing follows the pose smoothly), last
  frame's is preferred a little, and the swing moves at most 0.07 rad a call (`chars/model.ts`). The left
  had a second cause: its place on the fore-end was found a centimetre at a time, and walking it flicked
  between 16 and 17 cm with the arm nearly straight — now solved exactly (where the fore-end's line is the
  arm's reach from the shoulder) and eased. Walking, carried or aimed, and jogging: **no elbow moves more
  than 1.5 cm a frame**, the wrists' own pace. (Sprinting the left elbow still takes the odd 2–3 cm step,
  the hands themselves moving 1.5 cm a frame.)
- **The left hand**: at the mocks' trunk turn (0.5 rad) her left arm only got to the fore-end's back end —
  under the action, curled under it, from her right shoulder it looked folded away with the wood showing.
  Her trunk's turned further — 0.7 aimed, 1.0 at the ready (`SG_BLADE`, `SG_READY.blade`) — and the reach's
  slack trimmed (4.5 → 2.5 cm: the wrist fell short of where it was sent): **the left hand 4–11 cm out along
  the fore-end** (0.19–0.27 m from the grip; was 0.16), on its place in every pose.
- **The stock at the ready**: its butt sat 6 cm in from the shoulder toward her neck — on her chest by the
  collarbone; on a fuller chest its toe, turned in by the muzzle's drop, 3.5 cm inside. Now the ready's
  pocket is out at the shoulder and ahead (`SG_READY.pocket`), 3.5 cm further on a fuller chest
  (`SG_READY.bust`): the butt's edge at most 1.7 cm into the shirt (its pad pressed into the shoulder), the
  stock across her clear of it.
- **The stock loading**: the mocks' steep way had its butt up through her chest to the armpit (9–15 cm into
  the shirt). Now it lies back along her right side at the waist, between her arm and her ribs
  (`SG_LOAD_GUN`): **nothing of it in her**, both bodies, every moment; and the right arm's elbow is kept out
  of it (`gripTo`'s `avoid`: a rod the arm's search keeps out of) — the forearm now at most ~2 cm against the
  stock where the hand's on its wrist (it was 5).
- How it's measured (the bench's `stockIn()`): points through the stock's wood, each a ray along her chest's
  forward — an odd count of the shirt's own crossings, inside it (the body mesh is open under the clothes:
  only the shirt's count is trusted).

## Risks

- The butt in the pocket at a steep pitch: the shoulder joint's reach on the life body (plan 77) — the bench
  shows where it gives; looking far down, the butt may leave the pocket, as a real shooter's does.
- The stock's length against her arm: the right hand on the wrist with the butt in the pocket fixes the
  elbow's place more than the revolver's grip did — the elbow search (plan 80) may find less room.
- The two shells between the fingers: two small props, the fingers' shape for them (plan 78's library).

## Feedback, 2026-11-12 (second): it got worse

Three things: holding it, her shoulders side-on — ugly; aimed, her right arm absurdly thin; loading, now and
then her left arm thin.

- **Side-on**: the left hand's reach had been bought by turning her trunk (0.7 aimed, 1.0 at the ready) —
  undone, back to 0.5 both. **Her left shoulder brought forward instead** (`SG_PROTRACT`, 5 cm: the shoulder
  blade round her ribs, reaching — the bone moved, put back each frame). For it to count, the arm's IK
  (`reachTo`) now solves from the shoulder's place, not its rest's (identical but for this). And the hand's
  place on the fore-end is solved by **the wrist's** reach, exactly (the hand's turn there is the
  fore-end's, so the wrist is the palm less one offset) — a palm's reach plus a slack had the wrist 1–3 cm
  short. The left hand on its place in every pose, aimed 0.20–0.27 m out along the fore-end, her shoulders
  square.
- **Thin arms** (the forearm twisted, the skin pinched toward the wrist): measured, the right forearm aimed
  80–85° twisted on the feminine body; loading, the left one flipped to 133°. The first round's "keep last
  frame's swing" held arms where another pose had left them — dropped (the parabola and the 0.07 rad a
  frame still keep the flicker away). And `gripTo` minds the twist more: past 50° doubled (4 → 8), past 86°
  a wall (20) — the 133° flip came of her elbow kept out of her deeper chest at any price. Now the right aimed
  is twisted 46–56°, the left loading 67–70°; the wrist takes a little more side bend.


## Feedback, 2026-11-12 (third): at her side

"Her shoulders still side-on — just put the shotgun at her side instead of in front, then the arm needn't
stretch"; and walking sideways aimed, now and then the arm went very thin.

- **Carried at her side** (the user's call, replacing F1a's low ready across her front): in her right hand
  alone by the stock's wrist, down along her right side, the muzzle ahead and down (`SG_CARRY`; steeper
  running), the stock back past her hip; **her shoulders square** (`SG_READY.blade` 0) and **her left hand
  free**, swinging with her walk — it goes to the fore-end (eased, `lgLeftW`) only aimed, reloading, or with
  the gun pulled in across her chest; the shoulder brought forward only then. Coming up to aim the gun rises
  from her hip to her shoulder in the gun's 0.26 s, the left hand meeting it. Her right forearm barely
  twisted carried (1–36°).
- **Thin, sideways aimed**: in the game, walking sideways aimed, the right elbow's two best swings were near
  alike and it went back and forth between them every few frames, the forearm twisting 0–45° and back. A
  light preference for last frame's swing again (0.15 — the twist's wall now keeps it from holding an arm
  twisted, the first round's trouble): it follows her stride, no dithering.
- Settled: the muzzle ~19° down carried (steeper, her forearm lay along the stock's top — 1 cm into it);
  reloading, the left hand lets go as the gun goes back to her side (2.1 s on). Checks: the shotgun's sweep
  none past the limits; the bench spec (carried: upright, the right on the stock's wrist, the left free, no
  arm in the gun) and the two-of-us world spec pass; the revolver's spec and arms-feel too.

## Feedback, 2026-11-13 (fourth): held as the AK

"The way we hold the shotgun one-handed when not aiming — make the character hold it the way he holds the
AK-47, it turned out nice." After plan 82, the shotgun is carried at the AK's low ready, and its hands were
refitted on the AK's strict audit (both bodies in a tee, every state: each hand at its place, each wrist
within its reach, each forearm turned ≤53°, no finger or arm in the gun, the stock out of her shirt).

- **The low ready in both hands** (`SG_CARRY`, `kind: "ready"`; `leftCarried`): the butt at the right
  shoulder's front, out at the shoulder and 9 cm ahead (`pocket` [0, −0.03, 0.09] — the AK's 7 cm had the
  stock's toe 2–5 cm into the fuller chest's shirt), the muzzle 0.4 rad down and 0.4 across to her left, her
  shoulders near square (`SG_READY.blade` 0.08), the left shoulder forward (`SG_PROTRACT`). The third
  feedback's carry at her side came of the low ready then having her shoulders side-on to reach the fore-end;
  the AK showed that square shoulders reach it with the left hand cupped under its back end.
- **The right hand on the stock's wrist** (`SG_WRIST`): plan 81's (the knuckles along the gun ~22° down, as
  on a pistol grip) turned 43° left, 31° up and rolled 46° over the top. Plan 81's had the wrist bent
  66–78° sideways at the ready and aimed (18–52° past its reach); now 8–35°, within it, the forearm
  turned ≤35°. A search over any turn found lower numbers with the palm on the top of the wrist, the index
  away from the trigger, so the search was kept to turns of plan 81's hand (the palm on the wrist's right).
- **The left hand under the fore-end** (`SG_FORE`): cupped up under its left edge, the fingers forward along
  it and round its right, the palm 1.2 cm under its underside — as the AK's. Across its underside (plan 81's)
  her left forearm was turned 62–76° aimed and her wrist 16–23° past its reach; now ≤24° and ≤6°. Higher,
  the bigger hand's index tip went 4 mm into the wood.
- **Drawn** (`SlingSpec.grab` with `hold`): off her back and over the shoulder with plan 81's hand on the
  wrist, turned to the low ready's from 0.6 to 0.85 of the draw, the fingers kept round the wrist where it is
  on the gun. On the new hand all the way her forearm turned 63–84° lifting it.
- The bench's check now names the forearm and the rod it's in (`whereArms`).
- Stills: `design/guns/p81/feedback-4-low-ready.png` (both bodies: front, side, each hand, aimed).
- `e2e/shotgun-bench.spec.ts`: carried, both hands on, each wrist within its reach, each forearm ≤53°, no
  finger or arm in the gun; reloading, the left on throughout.

Measured, plan 81's hold → now (strict audit, 58 states a body): 53 → 42 flawed (feminine), 53 → 24
(masculine); every carried state clean on both.

Left as they were (not part of this ask; each about as before):
- **Port arms** (`SG_PORT`, the barrels up past her left shoulder): her right wrist 31–33° past its reach,
  her left forearm turned 54–65°, and in a roll the gun 20–31 cm through the floor. The AK's across-the-chest
  port was tried: with the muzzle ahead and the stock under her right arm both hands are clean, but the
  double-barrel is 1.24 m and some moment of the roll always has it 7–25 cm in the floor.
- **The reload**: the right wrist 8–24° past its reach and its forearm turned up to 68° fetching shells;
  the forearms 1–2 cm against the gun moving.
- **The draw's middle** (0.3–0.5): the right wrist 32–41° past its reach.
- **Aimed**: the feminine left wrist 3–6° past its reach; the stock's toe 2–4 cm into the shirt at a few aims.

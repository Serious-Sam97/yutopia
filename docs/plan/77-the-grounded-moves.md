# 77 — The grounded moves

Ask (2026-11-10), after plan 76 fixed the life body's trunk joints: "after that we will do 2 for
animations improvements in general" → "Animation improvements".

Status: **planned 2026-11-10**. Forks decided 2026-11-10: the recommendations (A1a grounded everywhere on
the ground, A2a the speeds kept, A3a keyed in code, A4a finger joints last; A5a one set of moves, not
asked: the default).

## Why

Plan 58 keyed every move for the old cartoon body: short legs (thigh = shin = 40 cm), Kingdom Hearts 3
for play, Alan Wake 2 for life, a tension dial between. The life look (plan 73) put a real-proportioned
body on those keys, and plan 76 made its trunk bend where the keys expect. What's left is the keys
themselves: on a realistic body their cartoon choices read as wrong.

Every clip rendered on the life body (the man and the woman, `/dev/anim?look=life`, 6 moments each), and
the gaits measured against published human gait numbers (Perry; Winter):

### Found

1. **Knees never straighten.** Standing, the old idle holds both knees at 20–28° (the standing leg too):
   every standing act inherits it (busy, emotes, the hands, together, the dark). On the cartoon it read
   as relaxed; on a real body it's a half-squat with the hips back, and from three-quarters the bent knees
   and full thighs read as knock-kneed (the joints are straight: measured).
2. **The walk is a shuffle-crouch.** One cycle on the life man:

   | | real walk | ours |
   | --- | --- | --- |
   | knee at heel strike | 0–5° | 24–28° |
   | knee mid-stance | ~5° | 17° |
   | knee peak in swing | 60–65° | 52° |
   | thigh forward / behind | +25° / −15° | +35° / −9° |
   | hips at their highest | ≈ standing | 2 cm under |
   | steps a minute at the speed | ~115 | ~145–170 |

   It reaches far forward, never pushes off behind, never straightens, and steps fast.
3. **Jog, run and sprint churn.** The game's speeds are Kingdom Hearts': walk 1.5 m/s, jog 5, sprint 8.2
   (`packages/shared/src/move/spec.ts KH_MOVE`). The strides were sized for the cartoon's short legs, so
   the legs turn over at ~265 steps a minute at the jog (a real runner at 5 m/s: ~175, 1.7 m steps) and
   ~320 at the sprint (~250). Short steps, high knees, quick feet: a prance on a real body.
4. **Sitting** is fitted for the old legs: the life person sits on the seat's front edge with the legs
   stretched far forward, the feet well ahead of the knees (`sit down, sit, get up`, `sat at a desk`).
5. **Arms flung out in the air.** Leaving a ledge, a hop's landing, a flip's landing: the arms go
   straight out to the sides, stiff, like a T (KH3 balance on a cartoon; robotic on a person).
6. **Stiff fingers.** The life hand has three bones (fingers, index, thumb) for fifteen finger joints:
   a curl bends only at the knuckles, so a relaxed hand reads as a claw or a paddle.

What carried over well: the reaches (phone, mug, hand to chest), the pair moves (high five, fist bump,
cheers, give), the climbs and vaults, the swim, the dark's hits, the ragdoll. The legs land exactly
where the keys put them (`e2e/life-legs.mts`).

## Forks

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| A1 | **The feel** | (a) **Grounded everywhere on the ground**: standing, walking, jogging, running and sprinting keyed to real human numbers; KH3's energy kept for what's already superhuman (Flowmotion, air dashes, wall runs, flips, the slide). (b) Grounded standing and walking only; jog, run and sprint keep the KH3 bounce, just with longer strides. (c) Fix the knees only. | **(a)**. The life look is a real person; a real person's run sells the speed better than a cartoon's churn. |
| A2 | **The game's speeds** | (a) **Keep them** (1.5 / 5 / 8.2 m/s): longer strides and a real cadence at the same speed, so a jog at 5 m/s looks like a fast run (long flight, big arms). (b) Slower, closer to real (walk 1.35, jog 3.5, sprint 7): the moves read calmer but play slower. | **(a)**. How it plays stays; only the bodies change. A2b is a gameplay change for its own plan. |
| A3 | **How they're made** | (a) **Keyed in code, as plan 58** (its foot lock, IK, the tension dial, the styles, the hurt leg all stay), re-keyed against the real numbers and checked by a gait report. (b) Motion capture (CC0/free libraries) retargeted onto our rig for the gaits. | **(a)**. Mocap brings its own retargeting and loses the dial and the styles, which every gait blends through. |
| A4 | **The fingers** | (a) **Finger joints for the life body**: each of the three hand bones split into its three knuckles (9 more bones, life look only), the curl shared down them. (b) Leave the hands. | **(a)**, as the last phase: small, and hands are close to the camera in first person and on the phone. |
| A5 | **The old body** | (a) **One set of moves** for both looks (the classic is the fallback now). (b) Keep the old keys for the classic look. | **(a)**: two sets is twice the upkeep for a look nobody picks. |

## Phases (with the recommendations)

0. **The gait report and a sample.** `e2e/anim-gait.mts`: for a clip on the life body, a cycle's knee,
   thigh and ankle angles, the hips' height against standing, step length and steps a minute, side by
   side with the real ranges (the table above, a jog's and a sprint's too). A sample first: the walk
   re-keyed, before/after strips and the report, **for sign-off** before the rest.
1. **Standing.** The idle's standing leg straight (0–5°), the free leg easy (10–20°), the hips over the
   standing foot at standing height; its variants, the styles (old, brisk, tired, bouncy, heavy), cold,
   winded and the dark's soft knees kept as moods on top. Every standing act inherits it; checked across
   busy, emotes, the hands, together.
2. **The walk** (from the sample): heel strike near straight, a real loading dip, straight over the
   foot, push-off behind, a higher swing knee, a longer step at a real cadence at 1.5 m/s. Its styles,
   the hurt leg, back up, aside, slopes and stairs, the cold walk, the torch walk.
3. **Jog, run, sprint.** Longer strides at real cadences for 5 and 8.2 m/s, the knee lift a runner's
   (not a drill's), arms at ~90° swinging from the shoulder, more flight. Starts, stops, turns, the skid,
   the jog-to-sprint blend, the crouch walk's cadence.
4. **Sitting.** Seat fits for the life legs: thighs on the seat, feet under the knees; desks, sofas,
   cars' seats (plan 62's fits re-checked on the life body).
5. **In the air.** Arms that balance without the T: forward and up as a person's do when they drop or
   land; the hop's and the flip's landings.
6. **The fingers** (A4a): the life file's hand bones split; `handPose` shares the curl down the knuckles;
   relaxed, fist, grip, point.
7. **The hands in every clip** (asked 2026-11-11: "the hands are a little weird … maybe add a phase in
   the end checking the hand in all"). On the new fingers, every clip on `/dev/anim` with the hands close
   (a sheet a group: standing, on the move, the hands, busy, together, emotes, the dark, Flowmotion,
   sitting, swim): how a relaxed hand hangs (the palm to the thigh, fingers softly curled, not splayed or
   a paddle), how the wrist carries it (no broken wrist on a swing or a reach), what it holds (the phone,
   the mug, the torch, a rail, a seat's edge) and where it meets the body or someone else's hand (no hand
   through the hip, the chest or a prop). Each wrong hand fixed in its clip's keys or the shared
   `handPose`; before/after sheets for sign-off.
8. **Checks.** The gait report in range for every gait; `e2e/life-legs.mts`; `/dev/anim` pops and foot
   slides; `anim-census`; the people e2e under `playwright.life.config.ts`; stills
   `design/screens/life/p77/`.

## Built

**Phase 0 (2026-11-10), for sign-off.**
- **The gait report** `e2e/anim-gait.mts` (`walk jog run sprint`, `--woman`, `--classic`, `--trace`,
  `RAW=1` for the bench's raw keys): knees counted from the body's own straight leg (a life leg's joints
  sit ~6° off one line straight), contacts found from the feet themselves (the bench's lanes split a
  walking stance as the life sole rolls), a flat foot's height over where it stands (floating or sunk).
- **The cause of the bent knees everywhere**: `reachTo` (`hero.ts`, the foot lock's and the idle's leg
  IK) eased into straight from 96% of the leg's length, so a leg reaching its whole length still bent
  ~16°. Now from 99.2%, as the gaits' own `reachLeg`.
- **The walk** (`WALK`): steps of 0.77 m at 125 a minute at 1.5 m/s (0.66 at 146), the hips' top at
  standing height with a 3.6 cm bob (`WALK_HIPS`, highest at 0.31), the push-off up onto the toes sooner
  and further (`rollAt` 0.5, `offF` 1.0), the swing knee to ~60°, the last swing target reachable (the
  knee had locked past straight and snapped at the landing).
- **Report, the life man (woman)**: heel strike 12.5° (4.1), straight over the foot, loading 14°, swing
  58°, thigh +33° / −16°, a flat foot on the floor, 125 steps a minute, 0.77 m. Out of range: the man's
  heel strike (real 0–8: his foot's ball sits further from the ankle — the fit anchors the ball) and the
  thigh forward a degree over.
- **Bench**, the life man, before → after: the walk's foot slides 6 → 5 frames, pops 14 → 22; turn on
  the spot 12 → 175 frames creeping ≤ 14 cm/s (the stricter IK at a near-straight standing leg — phase 1
  re-does standing); stairs down sinking 11 → 5.5 cm.
- **The back foot (the user, 11-11: "olha esse pé de trás que bizarro")**: the push-off's steep foot
  (`offF` 1.0) bent the toes 0.9 rad and the life shoe folded at the ankle; and just after the toes left,
  the swing held the foot near flat under a shin tipped far back — the ankle pointed 37° (real ~15–20°),
  the shoe's back creased. Now: the toes bend 0.6 at most, a shoe's flex (`moves.ts`: past it the tip
  leaves the ground), the push-off `offF` 0.6 from `rollAt` 0.42, and the swing's foot hangs steeper
  (`f` 0.9 at 0.68, 0.4 at 0.8): the ankle at most 15° pointed. The toe joint clears the floor by
  1.2–1.3 cm in the swing. Bench unchanged (walk pops 19). `feet-before-after.png`,
  `walk-feet-fixed.mp4` (half speed).
- Stills and a reel `design/screens/life/p77/` (`walk-before-after.mp4`: before | after, side, front, the
  woman's side; `walk-stills-*.png` one cycle each, before over after).

**Phase 1 (2026-11-11): standing.** The user signed off the walk ("Good, go to phase 1").
- **The idle** (`idle2Pose`): the hips 4 mm under standing, not 7 (with the foot lock's IK straight at
  last, 7 mm still held the standing knee at ~7°); the weight shift's dip 5 mm, not 8. The styles' stand
  takes half their drop (old, tired and heavy stood at 25–28°: a crouch). Measured from the body's own
  straight leg, the life man: the standing knee 3–5° and the free one 15° in the idle and every standing
  act (busy, the phone, give); the woman's the same. Old 17°, tired 16°, heavy 13° (were 25–28).
- **`reachTo`'s ease** is a parameter (`soft`, 0.992 by default); the stepper's own steps (`Stepper.lay`)
  keep 0.96: from 99.2% a turn's planted foot crept round with the hips (176 frames over 10 cm/s; now 52,
  most of it a foot leaving the ground at a step's end and the pivot foot turning: the original had 12).
- **The walk again** (`feel.test.ts` "the heel strikes and stays" failed: the raw walk's heel struck 1.1
  cm over the floor and the ball lifted 2.5 cm late in the stance — the foot lock had hidden both): the
  rig's leg (0.80 m, the woman's own) can't hold the hips at standing height through a 0.77 m step. Now
  a 0.73 m step at 131 a minute (stride 1.04·K, `landX` 0.24·K), the hips' top 1 cm under standing at
  0.295 of the cycle (over the planted foot; `WALK_HIPS` mid 0.835, rise 0.018), the push-off `offF`
  0.75 (the ball held down to the toes leaving). Every chars test passes (32). Report, the life man:
  straight over the foot, the heel strike's knee 22° (the hips low as the feet change: the loading's give
  starts at once), thigh +35° / −18°, a flat foot on the floor, ankle at most 15° pointed.
- **Checks**: `e2e/life-legs.mts` (idle, walk, turn, start/stop, phone, old, sit) — the life ball on the
  rig's in every frame; bench: idle 0 pops, the walk 2 slide frames and 16 pops (was 6 and 14 before plan
  77). Already there before plan 77 (not this phase's): `emote: clap`'s feet slide (~250 frames to 40
  cm/s), tired and old sink ~1.8 cm.
- Stills `design/screens/life/p77/`: `standing-before-after.png`, `walk-phase1.mp4`, `walk-phase1-strip.png`.

**Phase 2 (2026-11-11): the walk's styles and variants.**
- **Styles** (`STYLES`): each kept its character and lost its crouch. `walkHips` now dips from the top
  by `bob` (a bob under 1 had lowered the top too). Old: steps ×0.9 (0.82), hips −0.008·K (−0.03), a
  lower swing knee (−0.1); tired ×0.94, −0.004·K, swing −0.05; heavy −0.004·K (−0.025), bob 1.1 (2.2),
  landing flatter (`landF` +0.05); bouncy ×0.95, +0.004·K, bob 2 (3.4), swing knee +0.1 (0.25).
- **The dark** (`walkHips` −0.005·T, was −0.03·T; stride ×(1 − 0.08·T), was 0.15; the swing's `bend` 0.15,
  was 0.35): near a straight leg each centimetre under bends a knee ~15°, and the dark walked at 30°.
- **Report, the life man** (knee over the planted foot, from straight): calm −4°, brisk −4°, heavy −4°,
  tired 0°, bouncy 0°, old 10° (soft, kept), cold 2°, torch 7°, hurt 4°, aside 2°, backing up 14°.
  The heel strike stays ~20–28° (the hips low as the feet change, as in phase 1). Old's step 0.69 m
  at ~146 a minute, tired ~140: a style's shorter steps at the game's one speed are quicker (A2a).
- **Bench, original → now** (frames a foot slides over 10 cm/s): cold 77 → 21, torch 133 → 26, the
  ramp 17 → 7, stairs up 11 → 5, stairs down 22 → 11, aside 45 → 36, hurt 7 → 7, backing up 10 → 10
  (pops 33 → 51). Stairs down's deepest foot 11 → 13.5 cm (large already; a step's edge in the bench's
  ground — the stills look clean). The dark walks' feet ~1 cm under, as before plan 77.
- **Checks**: chars tests 32/32; `e2e/life-legs.mts` over the walk, cold, torch, hurt, back up, aside,
  stairs up and down, the ramp — the life ball on the rig's (at most 4.7 mm, hurt).
- The report's cadence and step for aside and backing up double-count contacts (their feet move off the
  facing): not trusted.
- Stills: `styles-before-after.png` (heavy, tired, old, torch: before over after), `styles-before-*.png`,
  `styles-after-*.png`, `stairs-slopes-after.png`.

**Phase 3 (2026-11-11): jog, run, sprint.**
- **The report** at running speeds: contacts found with limits that grow with the speed (a running ankle
  goes round the ball faster and higher); its real steps and cadence scaled to the rig's 0.80 m leg (a
  ~0.9 m leg's ×0.9 the step, ×1.1 the cadence — for every gait, the walk's too).
- **The jog** (`JOG_STRIDE` 2.3·K, was 2.0; `JOG_ON` 0.22, was 0.2; `JOG_LAND_X` 0.19·K, was 0.15;
  `JOG_OFF_F` 0.55, was 0.4): a 1.53 m step at 198 a minute at 5 m/s (1.33 at 229). A runner's bounce
  (`jogHips`: 5.8 cm, its top at standing; was 3.4 under a top 2 cm low).
- **The swing's landing** (`JOG_SWING`, the sprint's swing): the jog's last key straight to the landing
  at the longer stride's speed whipped the knee 52° past straight just before the foot came down; a key
  at 0.95 reaching for the landing foot (`foot`) joins it smoothly. The sprint takes the same key (the
  run blends the two key by key, so they've the same keys), placed where its own swing had the foot —
  17 cm out, sweeping back at the ground's speed — so the sprint is as it was. The late swing's knee 1.05
  (was 0.8): the foot 10 cm up, not 6.
- **Report, the life man**: jog, run and sprint in range on every count (knee at contact 16°/24°/28°,
  most in stance 38°/39°/41°, in the swing 100°/104°/112°; 198/242/277 a minute).
- **Bench, original → now**: foot slides the same or fewer (jog 80 → 64, aside 100 → 68, a steady turn
  180 → 164). Pops up in the jog's clips (jog 25 → 60, a steady turn 47 → 124): the bench's spike test
  can't tell a fast swing from a kink, and the jog's legs swing as far now in the same time; 120 Hz
  frames through a step show no jump (`e2e/anim-gait` traces; stills checked). The sprint 71 → 67.
- **Left**: stopping from a jog dips a toe into the floor for two frames at the stop (8.7 cm at the toe,
  was 2.2: the stepper's stop from the longer stride); turning back from a jog 7.3 (was 4.3).
- Checks: chars tests 32/32. Stills `runs-before-after.png` (jog, run, sprint: before over after),
  `jog-sprint-phase3.mp4` (half speed).
- **The toes in the air** (the user, 11-11: "o pé dobrar enquanto no chão tudo bem, mas no ar??"): the
  toes were bent in three places and only `body()` had the cap. `gaitPlant` bent them on the ground as far
  as the foot tipped (uncapped), `footTo` likewise, and `gaitToeLetGo` went on bending them after the toes
  left, as they'd been bending — 60–77° in the air after every push-off, the shoe folded over the ball.
  Now one cap, `TOE_FLEX` 0.6 (`moves.ts`), in all three; the let-go starts from the bend it left with and
  only straightens, in 0.08 of a cycle in every gait (was 0.15–0.2). In the air the toes are at most 34°
  as the foot leaves and straight by ~10 cm up (walk, jog, run, sprint, jumps, a vault). Tests 32/32.
  `toes-before-after.png` (run, sprint: before over after).
- **The ankle in the run's swing** (the user, 11-11: "o quadro 8 tem uma dobra bizarra ainda"): the jog's
  and the sprint's swing keys gave the foot's world pitch `f` as if the shin hung down; the ankle is
  `f − t − k`, so with the heel at the seat (knee 105–130°) the toes were pulled up to the shin 45–83° —
  the instep folded — and the sprint pointed them 35° just before landing. Each key's `f` now from the
  ankle a runner has there (early swing ~20° pointed, mid ~10°, the knee coming through neutral, landing
  near neutral on the ball). Ankles over the cycle: jog 30° pointed / 26° up at most, run 32 / 23,
  sprint 46 (the push-off) / 20 — in a runner's range. Tests 32/32.
  `sprint-pe-de-tras-antes-depois.png`, `tornozelo-antes-depois.png`.
- **Phase 3 signed off** by the user 2026-11-11 ("ok, approved") on `corrida-ciclo-depois.png` (a run's
  whole cycle, 16 frames) and `corrida-camera-lenta.mp4`.

**Phase 4 (2026-11-11): sitting.**
- **The cause**: every seat fit (`person3d.ts seatOf`, `furn/bench.ts`, `furn/chessbench.ts`,
  `tp/car/seatfit.ts`) took the hips' height stood from the bones (`legOf`). For a life body that's the
  life leg's (0.90–0.93 m), but `sit2`/`car3` solve the rig's legs and `fitLeg` fits the life ones from the
  rig's frame (HIP_H): the rig's feet were planned from hips 4–7 cm too high, so the life legs reached
  down and out for a floor under the floor — perched on the seat's edge, the legs slid out.
- **`PersonModel.leg()`**: the thigh is her own (where the knees meet a seat's front), the hips' height
  in the rig's frame (HIP_H for a life body; today's people's own bones). The four fits use it, and pass
  the thigh (`SitFit.thigh`): where the feet go sat is reckoned in her own thigh.
- **Where the feet sit** (`acts.ts FEET`): 1.0 / 1.3 / 1.42 / 0.92 thighs ahead (was 1.14–1.59, sized for the
  cartoon's legs). On the life man and woman: the thigh's underside on the seat to the mm, knees 58–98° by
  how she's sat, feet from 5 cm behind to 16 cm past the knees.
- **The bench** sits a body as the world does (`Ctx.sitFit`: the model's `sitDrop` and `leg()`, the chair's
  top `BENCH_SEAT` 0.45 m) and works its frames out again once the life body's in (its drop in the key):
  it used the old fixed drop and perched the life body 6 cm over the chair.
- **Cars** (`car3` through `seatfit.ts`, measured on the bench): a front seat's feet within 2–3 cm of the
  floor (were 1.6 cm into it, the man; 4.7 over, the woman). Left: the seat's recline tips the pelvis and
  lifts the life hip sockets (7 cm ahead of the hips' joint) more than the rig's — a `fitLeg` matter.
- Checks: chars, seats, keys, car and furniture tests 115/115; typecheck clean. Stills
  `sentar-antes-depois.png`.
- **Phase 4 signed off** by the user 2026-11-11 ("Looks good, go on") on `sentar-antes-depois.png`.

**Phase 5 (2026-11-11): in the air.**
- The arms in a drop's gather (`FALL`), its reach for the ground (`REACH`), a landing's absorb (`ABSORB`),
  the hop's apex, reach and impact (`HOP2`) and the flip's opening and impact (`FLIP2`): out 15–30° (was
  50–80°), a little more forward, the elbows bent 45–55° (were near straight) — the hands ahead of the chest,
  a person's balance, not a T. The flip's tuck and the hero landing (a hand down) kept (A1a: what's already
  superhuman keeps KH's energy); the leap's wide pump too.
- Checks: chars tests 32/32. Stills `air-before-after.png` (the 3 m drop, the 1.5 m ledge, the hop, the
  flip; BEFORE is the survey's from before plan 77).
- **Phase 5 signed off** by the user 2026-11-11 ("Looks good, go on") on `air-before-after.png`.

**Phase 6 (2026-11-11): the fingers.**
- **Build** (`build_person.py`): `KNUCKLES` — each hand bone's middle and tip (`fingers2/3`, `index2/3`,
  `thumb2/3`, both hands: 12 bones), MakeHuman's `finger<n>-2` and `-3` folded onto them, placed at their
  joints (the three fingers' together); `wear.py` counts them a hand's. People rebuilt (full wardrobe).
- **Game** (`life-people.ts` `KNUCKLES`/`knuckleParent`, after the eyes in `ALL_BONES`; a file or base
  without them has each at its parent, weighted nothing; `life.ts knuckleRest`, turned down with the arm;
  `model.ts` makes them on a life body and in `setPose` shares a finger's curl down its knuckles — the
  base, the middle and the tip 0.7, 0.9 and 0.6 of the rig's one bend (a fist ~190° along a finger; the
  thumb's swing kept at its base, its middle and tip 0.35 and 0.25 of it). First person's arms keep them.
- Checks: life, chars, seats, keys, cars, furniture tests 212/212 (the budget test now wants the knuckles in
  the near person's files). Stills `hands-before-after.png` (relaxed, phone, mug, fist bump, clap, gamepad).
- For phase 7: the phone hand at the ear is open and spread; the fist bump's hand wants its own shot.

**Phase 7, first pass (2026-11-11): the hands** (the user on phase 6's sheet: "need improvements in all of
them"). Seen close (`/dev/anim`'s `__anim.closeUp(bone, from)`: a still through a camera of its own):
- **The fingers closed at rest** (`build_person.py`, after the arms are turned down): MakeHuman's hand
  stands splayed, so every pose started from a claw. In the palm's plane the index, ring and little
  fingers turned to lie 4°, −4° and −9° off the middle one; the thumb half its angle off the index taken in.
  People rebuilt.
- **The curl down the knuckles** 0.8 / 1.1 / 0.8 (a fist ~230°, the tips in the palm); the thumb's middle
  and tip 0.6 and 0.5 of its swing (it wraps a fist). **The relaxed thumb** 0.7 (`HANDS.relaxed`, was
  0.25: it stood off the index, a C).
- **The phone call**: the reach takes an elbow's direction (`Reach.pole`); a call's down and a little
  forward (`motion.ts CALL_POLE`), the ear's anchor 4.5 cm lower, 2 ahead, 1 out (`life.ts`), the wrist
  stood up (`acts.ts WRIST_CALL`) — the hand along the side of the head over the ear (it was flat over the
  cheek and the eye, the forearm level from behind the head).
- **The clap**: the wrists 9 cm apart as the palms meet (were 4: the hands met through each other) and turned
  to face (`CLAP_WRIST`). **The gamepad**: the wrists 20 cm apart (14 had the hands over each other). **The
  fist bump**: each wrist 14 cm short of the middle (a fist's knuckles are that far on; 3 met through).
- Checks: tests 212/212. Stills `hands-close-before-after.png` (the fist bump's BEFORE is a later moment,
  the hand opened after the bump).
- Left for the rest of phase 7: every clip's hands on the sheet (holding the torch, the mug at the mouth,
  typing, the arcade, the piano, pool, Flowmotion's grips, the swim).
- **Phase 7 moves to its own plan**: the user found some hands worse after the first pass and asked for a
  closer look and a plan — `78-the-hands.md` (measured causes: the fingers curl about the forearm's axis, the
  three fingers one chain, no forearm twist; the clap's wrist twist and the call's wrist bend from this pass
  are wrong and get undone there). Plan 77's checks (phase 8) after it.

**Phase 8 (2026-11-11): checks** (after plan 78 closed phase 7).
- **The gait report** (`e2e/anim-gait.mts`, the life man and woman):
  - Jog and run are in range on both bodies. The sprint is in range on the man.
  - The woman's sprint is 1–3° out on three counts: knee at contact 16.6 (18–32), swing 107 (110–140),
    thigh forward 76 (≤75).
  - The walk keeps the misses it was signed off with in phases 1–2: knee at heel strike 18–22° (real
    0–8) and thigh forward 35–37° (20–32). The woman's thigh behind is −23.8 (−22). The rig's 0.80 m leg
    can't hold the hips at standing height through a real step (phase 1).
- **`e2e/life-legs.mts`**: the life ball on the rig's within 4.7 mm and no frame over 5 mm, on both bodies,
  over 31 clips. Covered: walk, jog, run, sprint, idle, turn, starts and stops, the turns back, cold,
  torch, hurt, back up, aside, stairs up and down, the ramp, sitting, typing at a desk, the phone call.
- **Bench pops and slides** (`anim-report`, `LOOK=life`): walk 26 → 16 after the toe fix below, jog 80,
  run 68, sprint 85. The rest are the faster swings phase 3 measured. The dips noted in phase 3 remain:
  start/jog/stop 8.9 cm, jog turn back 7.3 cm, stairs down 13.5 cm.
- **The toes' corner** (`moves.ts toeBend`): the toes' bend on the ground met `TOE_FLEX` with a hard
  `min`, so their speed broke at every push-off: a pop in every walking clip. Now it's eased in over its
  last 0.1 rad, and the let-go starts from that eased bend. The census: walk 8 → 0, cold 29 → 16, torch
  27 → 15, struck walking 29 → 20, lurching 13 → 8. The jogs are unchanged: their toes leave the ground
  still bending, under the cap.
- **`anim-census`**: 140 clips, no NaN anywhere. 37 clips were over the 11-05 baseline, all of them the
  re-keyed gaits (phase 3) and the swim clips (new since). The baseline was saved again (`SAVE=1`) as
  plan 77's: 0 worse.
- **The people e2e** under `playwright.life.config.ts` (avatar, down, first person, third person, use
  things, flowmotion, footing, phone, sway, people 3D): 15 passed, 7 skipped, 2 failed, both on the phone.
  - "a call of three" fails on HEAD (394e2a5) too: the call's voice line never comes on.
  - "texts arrive live" passed when run alone (it failed at a different point each time in the long run).
  - The dev world was exported before and imported back after each run: 546 objects, identical.
- **Stills**: `design/screens/life/p77/gaits-phase8.png` (one cycle each of walk, jog, run and sprint,
  side, the life man).
- Client tests 326/326, shared 657/657.

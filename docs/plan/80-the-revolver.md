# 80 — The revolver, held right

Ask (2026-11-12, the user, after plan 79): one gun at a time, a whole plan for each gun's handling —
the revolver first.
1. The hands don't hold it right: one hand goes through the other.
2. How she holds it should be like Leon in Resident Evil 4.
3. Aiming, the hands and arms are all wrong: the gun is on its side, not upright.
4. The reload is all broken; its animation is horrible.

References: Alan Wake 2, Resident Evil 4, 5 and 6 (images and videos).

Status: **planned 2026-11-12; every fork decided by the user 2026-11-12 — the recommended column**: F1a
RE4 Remake's low ready, F2a isosceles thumbs forward, F3a Harries only aiming (the torch hand out ahead at
the ready), F4a the real speedloader reload ~2.2 s (the server retimed), F5a the loaders on the right hip,
F6a keyed on a `/dev/revolver` bench, F7a third person only. Phase 0 (the mocks) rendered 2026-11-12:
`tools/art/guns/mock80.py` (Blender, the life man, the gun's support/shooting hands placed on it) →
`design/guns/p80/sheet-80-hold.png` and `sheet-80-reload.png` — signed off 2026-11-12 ("Start phase 1").
**Phase 1 built 2026-11-12** (below), committed 53c06b6. **Phase 2 built 2026-11-12** — stills
`design/guns/p80/sheet-80-phase2-move.png`, `sheet-80-phase2-draw.png`; awaiting the user's review. Follows plan 79 (the guns:
the shoulder camera, the Blender revolver, the speedloader rule F11a) and plans 58/77/78 (the body, its
moves, its hands).

## Where we are — read from the code

The two screenshots (2026-11-12: the low ready from the front, the aim from behind) show what the code
does:

- **The right hand** holds the gun well: `tp/person3d.ts` `gunInHand` puts the life revolver in the fist
  by the hand's own frame (`HandFrame`: mid, along, across, normal), raked 0.38 rad, the fingers closed
  round the grip's shape (`hold("R", GUN_GRIP_SHAPE)`).
- **The left hand has no grip at all.** `gunHands` only sends the left wrist to a point a few
  centimetres left of and under the right (`reachTo("L", point, w, pole)`): a position and an elbow
  direction, **no orientation** for the wrist and **no shape** for its fingers (`hold("L", …)` is the
  torch's or nothing). Its fingers stay as the body's clip left them — and pass through the right hand
  (screenshot 1).
- **Aiming turns the gun on its side.** `chars/model.ts` `aimHand` swings the wrist so the barrel points
  along the look by the **shortest arc** (`setFromUnitVectors`): the barrel's way is set, its roll isn't.
  Then the wrist's limits (twist ±80°, bend ±60°, side −25…+35°) clamp what's left. When the arm's IK
  brings the forearm palm-down, the clamp leaves the revolver canted ~90° (screenshot 2).
- **The arms are placed point by point**: the low ready is a target for the right wrist under the
  shoulder (`ready`: 0.34 forward, 0.12 in, 0.17 down) and the elbows by poles — not a held pose. Nothing
  keeps the forearms' twist, the shoulders' set or the head's line as a person aiming a handgun does.
- **The reload is three things not talking to each other**: the body's clip (`chars/anim/night.ts`
  `reload2`, once: the left hand's trip to the hip and back), the cylinder's crane swinging by itself
  (`poseGun` open), and the server's steps (open 0.45 s, the speedloader 0.8 s, shut 0.3 s). During it the
  hands' IK is off (`gunHands`' `want` is 0 for the revolver reloading): the arms go where the clip sends
  them, the cylinder opens wherever the gun happens to be, nothing pushes the ejector rod, there is no
  speedloader in the hand — the rounds just appear.

So the revolver needs what a real person's hands do: **the gun is the anchor, both hands hold it at
places on it, with their own orientation and finger shapes**; aiming keeps it upright; the reload is one
sequence the hands, the gun's parts and a speedloader play together, in time with the server.

## References (2026-11-12)

- **RE4 Remake (2023), Leon** — *low ready*: two hands, the gun down at his front, muzzle at the ground a
  metre or two ahead, trigger finger along the frame; it comes up only to aim (the remake's own term,
  "RE4R Low Ready", against the 2005 game's raised gun — modders ask for one or the other). Aiming:
  isosceles, arms nearly straight, the gun just under the eyes, upright. The flashlight is on his chest,
  not in a hand.
- **RE4 (2005)** — the handgun raised, muzzle up, when idle (the "high ready" the remake dropped). Its
  revolvers' reloads are flamboyant: the Broken Butterfly whipped open, tipped over the shoulder to dump,
  rounds jammed in, slammed shut.
- **Alan Wake 2** — the revolver (a Colt Python, .357) aimed **thumbs-forward**, and with the torch in the
  **Harries** hold: the light in the left hand crossed *under* the gun hand, the backs of the wrists
  pressed together, the beam along the barrel. Its reload: the cylinder out, the empties dumped, a
  speedloader; "fairly slow", a shot cuts it short.
- **RE5 / RE6** — one generic reload for every gun (RE5); RE6's big revolver a top-break. Little to take.
- **The real speedloader reload** (American Rifleman's "Universal Method", right-handed — the order to
  key from):
  1. gun in close, elbows back; the right thumb works the latch; the left hand comes up, fingers on the
     cylinder's right side, thumb on its left, and rolls it out (middle and ring fingers through the frame);
  2. **muzzle up**: one strike on the ejector rod with the flat right palm — the empties fall;
  3. **muzzle down**: the left hand brings the gun to the middle of the body, just above the belt; the
     right hand takes the speedloader from the right hip;
  4. two rounds started into their chambers, the loader squared, its knob turned, let go (it falls);
  5. the left thumb and fingers roll the cylinder shut as the right hand takes its grip again; both hands
     back on the gun.
  A good one is ~2 s, a casual one 6–8 s; "game slow" 3–4 s.
- Videos to key from: Miculek's slow reload (youtube.com/watch?v=0FbUMqoyjDw), PC Gamer's RE4 reload
  GIFs, RE4 Remake's reload compilations, AW2's revolver (80.lv's weapons article, ArtStation).

## The idea

**Hold it like a person does.** The gun is placed by the right hand as now; the **left hand is placed on
the gun** — at a support socket on its grip, its wrist turned so the palm lies on the grip's left side,
the fingers wrapped over the right hand's fingers under the trigger guard, the thumb forward along the
frame — with its own finger shape (the support grip). Aiming keeps the gun **upright**: the wrist's turn
sets the barrel's way *and* its top's (up), never only the shortest swing, and the arm's IK brings the
forearm thumb-up so the wrist isn't asked for what it can't do. The poses (ready, aim, the reload's
keys) are **keyed whole** — shoulders, elbows, forearm twist, head — with the hands then IK'd onto the gun
so they meet exactly, not points chased by poles. The reload is **one timeline**: the hands, the
cylinder, the ejector rod, the cases, a speedloader, in time with the server's steps.

## Forks — decided 2026-11-12 (the recommended column)

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| F1 | Not aiming (ready) | **a)** RE4 Remake's low ready: both hands, the gun at the lower belly, muzzle ~45° down at the ground ahead, trigger finger along the frame · **b)** AW2's: the gun in the right hand alone by the thigh, muzzle down; the left hand free (the torch out ahead when it's on) · **c)** RE4 2005's high ready: muzzle up by the shoulder | **a** (the user asked for Leon; the remake's is the grounded one) |
| F2 | Aiming | **a)** isosceles, thumbs forward (RE4 Remake, AW2): arms nearly straight, square to the target, the gun just under the eye line, upright · **b)** Weaver: bladed, the support elbow down, push-pull | **a** |
| F3 | The torch with the revolver | **a)** AW2's Harries when aiming (left wrist crossed under the right, backs pressed, the beam along the barrel); at the ready the torch hand out ahead, the gun low in the right · **b)** Harries at the ready too · **c)** the torch on the chest like Leon's (no hand) | **a** |
| F4 | The reload | **a)** the real speedloader reload above (open, muzzle up, rod struck, muzzle down, loader in, twist, closed), ~2.2 s · **b)** the same, AW2-slow ~3.2 s · **c)** RE4 2005's flourish (flicked open, tipped over the shoulder) | **a** — the server's steps retimed to it (open 0.7 s: out + the rod; load 1.1 s; shut 0.4 s) |
| F5 | Where the speedloaders are | **a)** a pouch on the right hip, the right hand fetches (the real way: the left hand holds the gun open) · **b)** the belt's front left (where the AK's magazine pouch is), the left hand fetches | **a** |
| F6 | How it's made | **a)** keyed poses on a new bench page (`/dev/revolver`: the person with the revolver, scrub the reload, turn round her, the references beside) — the hands IK'd to sockets on the gun · **b)** animated in Blender on the life rig, exported as clips (a new pipeline: the rig's joints in Blender, clips into the game) | **a** (the bench is also how you'll review it) |
| F7 | First person | **a)** guns stay third person (plan 79 F3a) · **b)** a first-person view of the revolver too | **a** |

## Phases

0. **Mocks** — stills on the bench before any of the game is touched: the low ready, the aim (with and
   without the torch: Harries), the reload's key poses (open, muzzle up and the rod struck, muzzle down
   and the loader in, closing), each from the side, the front and over the shoulder, set beside the
   references. **Signed off before code.**
1. **The grip** — the crane's hinge moved where a real one is (low and left of the cylinder: (0, 0.017,
   0.037) in the gun's frame, swung 1.5 rad — found in phase 0: on the bore's line the cylinder moved 2 cm
   and never left the frame window, in the game too); the revolver's sockets in its Blender file (the right hand's grip, the support hand's
   place and its palm's way, the thumb line, the ejector rod and the latch as named parts; a speedloader
   model with six rounds); a wrist IK that takes a position **and an orientation** (both hands); the
   support grip and the shooting grip as hand shapes (plan 78's library: the knuckles' angles), thumbs
   forward; a check that the hands don't pass through each other or the gun (the fingers' tips against
   the other hand's and the gun's volumes). `/dev/revolver`, the bench.
   **Built 2026-11-12:**
   - **The gun is the anchor** (`tp/revolver-hold.ts`): placed in front of her by what she's doing, in her
     shoulders' frame scaled by her arm against the mocks' man's (0.501 m). Aimed: isosceles, the grip at
     the shoulders' height (`AIM_HIGH`), out along the look till the gun arm's wrist is `AIM_ARM` (0.985)
     of its reach, or the support arm's 0.998 — whichever comes first; the chest turned square to the look
     (her feet keep AIM_BLADE, the world's rule). The low ready (F1a): **the same isosceles lowered**
     (`READY_PITCH` −0.8 rad, elbows softer: `READY_ARM` 0.93) — RE4 Remake's arms-out low ready, not the
     mocks' folded one (that left both wrists 24–26° past a wrist's reach).
   - **The right wrist** is put where the gun, held as it is in the hand (plan 79's `gunInHand`), comes
     to that place and turn — the gun's way and its top both set, so **never canted** (0.0° at every
     pitch, aimed or at the ready; the old `aimHand` shortest arc is skipped for it).
   - **The left hand on the gun** at a socket in the gun's frame (`SUPPORT`: the palm on the grip's left
     panel over the right's fingertips, the fingers forward and down round the fist, the index side up),
     its fingers closed round the right fist (`FIST`, a round shape along the grip's rake), the thumb laid
     along the frame (`SUPPORT_THUMB`, `PersonModel.thumbTo`). The mocks' socket moved 4 cm back and 0.8 cm
     out: the game's grip sits at the fingers' roots, not the palm's middle, so the right wrist is further
     back on the gun.
   - **`PersonModel.gripTo`**: a hand to a place *and* a turn — the two-bone IK, then the elbow swung round
     the shoulder→wrist line to where the wrist has least to do: past a real wrist's reach (twist ±80°,
     bend ±60°, side −25…+35°: `wristOver`, `wristParts`) first, then off the forearm's neutral and bent.
     Found on the way: the twist read off a quaternion with w < 0 came out near a whole turn (fixed in
     `wristOver`; `aimHand` keeps its own reading); bend and side must be read on the twisted hand.
   - **The crane's hinge** moved (0, 0.017, 0.037), swung 1.5 rad — the cylinder now clears the frame in
     the game. The ejector rod (in the cylinder) and the latch are their own pivots; **the speedloader** is
     exported (`public/life/guns/speedloader.glb`: its knob, its six rounds let go together; 2k triangles).
   - **The bench** `/dev/revolver` (F6a): the game's own `Person3D` with the life revolver — ready, aim
     (pitch), the torch, the reload scrubbed; seven views, drag to turn round her; the checks read out live
     (`Person3D.revolverCheck`). `e2e/revolver-bench.mts`: stills of every pose and view, and the checks
     (CHECK=1: every pitch, with and without the torch; fails past the limits).
   - **The checks, as built**: upright 0.0° and on the look 0.0° at every pitch; the left fingers 5 mm
     clear of the right hand and 9 mm of the grip; the right wrist 0.3–4.4° past its reach aimed, 3.8° at
     the ready; the left's 7–10° aimed, 13.6° at the ready (its side bend — the support hand's fingers
     down round the fist; phase 3 looks at the support hand's set again).
   - **Left for later phases**: the run tuck needs her moving (phase 2: the bench stands still); the torch
     at the ready has its wrist 11.6 cm short of its place (phase 2) and the Harries is the old wrist-under
     placement (phase 3); the reload is still the old clip (phase 4).
   - The `yutopia-chars` chunk 68.4 → 69.5 KB (budget raised 62 → 72, measured). `/page` is over (480.6
     of 469) as it was before this phase — the fix is on `claude/friendly-cerf-633790`, not merged.
2. **The ready** (F1) — the pose keyed whole, both hands on; the draw from the holster (the right hip) into
   it and the put-away back; walking and sprinting with it (tucked closer running).
   **Built 2026-11-12:**
   - **The draw** (the server's 0.35 s): the gun along a path from **a holster at her right hip**
     (`holsterHold`: the grip at the belt, muzzle down, its left side to the hip) — straight up out of it
     (`DRAW_LIFT`, 13 cm), then turned muzzle-forward and out to the hold; the right hand on it all the way,
     the left meeting it from `DRAW_MEET` (0.55). **The put-away** (0.25 s) is the same path back; the gun
     goes when it's in the holster. The hold has its own weight now (`revW`), not the hands' rise from the
     side. The holster first sat at the ribs (the elbow out at the shoulder's height): at the belt, the
     elbow bends back below it as a real hip draw's.
   - **Walking** keeps the low ready (the shoulders' frame rides the walk); **running** tucks it in from a
     jog on (2.8 → 4.8 m/s): 0.35 rad steeper, the elbows bent to 0.73 of the reach — close at the belly,
     muzzle down, both hands on.
   - **The bench** moves her (still, walk, jog, sprint — the views go with her) and scrubs the draw and the
     put-away (`draw`, `away`). The torch at the ready: its "11.6 cm short" was the check reading a left
     hand that wasn't gripping the gun — the check now reads the left only when it's on the gun.
   - **The checks**: every pose and pitch within the limits (CHECK=1); `e2e/arms-feel.spec.ts` passes.
     Mid-draw the wrists go 7–24° past a wrist's reach for the moment it lasts; sprinting 18–24° (the tuck
     bends them): phase 6 looks at both.
   - No holster is drawn on her yet (the gun comes out of where one would be) — a model for one is a
     question for the user.
3. **The aim** (F2, F3) — the pose keyed whole; the wrist's turn setting the barrel and its top (no cant,
   ever); the arms' reach; the head over the sights; the torch's Harries; the shot's recoil on the new
   hold (the muzzle's flip, the wrists giving); dry fire; the low ready ↔ aim in the gun's own 0.18 s.
4. **The reload** (F4, F5) — the timeline, both hands: the latch, the cylinder rolled out by the left
   fingers, muzzle up and the rod struck by the right palm (the cases falling as they do now), muzzle
   down, the right hand to the pouch and back with the loader, two rounds started, squared, twisted, the
   loader dropped, the cylinder rolled shut, the grip retaken; a shot mid-way snaps it shut as now; the
   server's steps retimed; everyone sees it (Player.arm).
5. **Everything else held** — dodge, hit, fall, sit-to-stand with it out; the far people's cheaper hold;
   the revolver's sounds (plan 79 phase 9) on the new timeline's moments.
6. **Checks** — the bench's checks (no hand through a hand or the gun, the gun upright aimed at any
   pitch and turn, the reload's every key), e2e (draw, aim, fire, reload, two of us seeing it), stills
   beside the references.

## Risks

- The life body's joints and limits (plan 77: the leg's 0.80 m, the wrist's) may not reach a textbook
  isosceles at every pitch: the bench will show where they give, the plan says what's kept.
- The forearm's twist share (plan 78 `shareTwist`) — a thumb-up forearm needs most of the turn there,
  not in the wrist.
- Others' bodies far off: the full two-handed IK only near (plan 79's people-far cheaper path).

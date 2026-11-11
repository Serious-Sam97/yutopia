# 78 — The hands

Ask (2026-11-11), on plan 77's hands pass: "need improvements in all of them" → after a first pass,
"Some of them is worse, please take a closer look, investigate the characteristics and plan". This plan
replaces plan 77's phase 7 (the hands in every clip); plan 77 goes on with its checks after it.

Status: **planned 2026-11-11**. Forks decided 2026-11-11: the recommendations (H1a five fingers, H2a a
forearm twist bone, H3a a hand library in joint angles, H4a props on the bench and grip targets; H5a undo
the two wrong changes first — not asked, the default). Nothing of it built yet.

## What's wrong — measured, not by eye

Each pose on the life man, the right hand, measured on its bones (`__anim.closeUp` for stills; a script
reading the knuckles: flexion at each knuckle, how far a bend goes sideways out of the finger's own
plane, the thumb, the wrist against the forearm):

| pose | fingers MCP / PIP | index MCP / PIP | index bends sideways | thumb | wrist bend / twist |
| --- | --- | --- | --- | --- | --- |
| relaxed | 40° / 35° | 35° / 34° | **25°** | 34° to the palm, 6.1 cm off the index | 13° / 0° |
| phone call | 67 / 72 | 60 / 72 | 8° | 39°, 4.8 cm | **53°** / 0° |
| mug | 72 / 78 | 64 / 78 | 6° | 35°, 6.0 cm | 17° / 0° |
| fist | 88 / 100 | 84 / 106 | 1° | 25°, 7.0 cm | 9° / 0° |
| clap | 22 / 10 | 25 / 15 | **42°** | 35°, 4.7 cm | 8° / **−69°** |
| gamepad | 72 / 78 (= mug) | 64 / 78 | 6° | 39°, 4.8 cm | 9° / 0° |
| typing | 45 / 41 | 32 / 27 | **29°** | 38°, 4.8 cm | 5° / 0° |

What a real hand does (references at the end):

- **Relaxed, hanging**: the knuckles (MCP) bent ~45–75°, the middle joints (PIP) little, ~10–20°, the tips
  (DIP) 0–10°; the fingers a little fanned and curling more from the index to the little finger (the
  cascade); the thumb's pad resting by the index's side.
- **Gripping a cylinder** (a mug's body, a gamepad's handles): MCP ~45°, PIP 30–45°, DIP 10–20° — the tip
  about ⅔ of the middle joint; the thumb **opposed**, across from the fingers.
- **A fist**: MCP ~90°, PIP ~100–110°, DIP ~70–90°, the thumb over the index's and middle's middle bones.
- **A clap, a high five**: the fingers near straight and together; the palms turned to each other by the
  **forearm** (pronation/supination) — a wrist can't twist.
- **A phone at the ear**: the wrist near straight (0–20°), the forearm half turned, the fingers round the
  phone's back, the thumb on its front edge.

## Why — the rig, not only the poses

1. **The fingers curl about the forearm's axis, not their own.** Each life finger bone is made unturned
   (its frame the forearm's) and a curl is a turn about that frame's z. The middle fingers lie along it, so
   they bend true (≤4° off); the index lies at an angle, so its curl swings it sideways 25–42° — the hook,
   the claw. The thumb's worse: its rig channels (`[0.3·t, −t, 0]`) were set for the cartoon thumb's axes.
2. **The three fingers are one chain** (middle, ring, little averaged): always identical, no cascade, no
   spread — a paddle.
3. **The curl's shared by fixed ratios** (0.8 / 1.1 / 0.8 down the knuckles): the relaxed hand bends its
   middle joints as much as its knuckles (40/35), the reverse of a real one (knuckles most).
4. **No forearm twist.** Turning a palm has only the wrist to do it: the clap's −69° is a twist at the
   wrist (the mesh wrings there). Plan 77's phase 7 added it; it's wrong.
5. **The phone's wrist bend** (53°, plan 77 phase 7) stood the hand up by breaking the wrist; the elbow's
   direction was the real fix and is kept.
6. **One grip for different things** (the mug and the gamepad share `HANDS.grip`): no pose knows what it
   holds. The bench draws no phone, mug or pad, so a grip is judged by the hand alone. A hand's target is
   its **wrist**, not the spot it holds.
7. **Hands meet through each other**: nothing checks a hand against the other hand, the head or the body.
8. **A lump on the back of the hand** in a fist and on the pad (the skin over the metacarpals), seen in
   the stills; its weights not yet looked into.

## Forks

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| H1 | **The fingers** | (a) **Five fingers**: the middle, ring and little split (each with its three bones; +6 bones a hand, the life body only), so each curls and spreads its own way. (b) Keep the three together, fix only the axes. | **(a)** — the cascade and the spread are most of what reads as a real hand. |
| H2 | **The forearm's twist** | (a) **A twist bone half way down the forearm** (MakeHuman's `lowerarm02`, folded into the elbow today): a palm turned by the forearm, shared along it. (b) Keep twisting at the wrist, capped small. | **(a)** — the clap, the high five, the keys and the phone all turn the palm. |
| H3 | **How the poses are made** | (a) **A hand library in a real hand's terms** — each pose as knuckle angles (MCP, PIP, DIP for each finger; the thumb's opposition, MCP, IP; the spread), applied about each joint's own axis, measured from the body file; the acts pick a pose by what they hold. (b) Motion-captured hand poses. | **(a)** — the same keyed-in-code way as plan 77, and the numbers above to check it by. |
| H4 | **Props on the bench** | (a) **A phone, a mug, a pad, a torch and keys drawn on `/dev/anim`** where the hand holds them, and a hand's target its grip (the palm's middle), not its wrist. (b) Judge grips by the hand alone. | **(a)** |
| H5 | **Plan 77's phase 7 changes now** | (a) **Undo the two wrong ones first** — the clap's wrist twist and the call's wrist bend — keep the rest (the fingers closed at rest, the call's elbow, the wider clap, pad and fist bump). (b) Leave them till the phases replace them. | **(a)** |

## Phases (with the recommendations)

0. **Undo and measure.** The clap's wrist twist and the call's 53° bend out. A **hand report**
   (`e2e/hand-report.mts`): for a clip and a moment, each finger's MCP/PIP/DIP, how far each bend goes
   sideways, the spread, the thumb's opposition and its pad's distance to the index, the wrist's bend,
   deviation and twist, the forearm's twist — against the real ranges above, as `anim-gait.mts` does for
   the legs. And a hand-against-hand/head/body check (each finger's bones as capsules).
1. **Each joint's own axis.** The life file's knuckles carry their hinge: in the build, each finger bone's
   flexion axis from the palm's plane and the finger's line, written into the file's extras; the game turns
   a curl about it (`model.ts`), never the forearm's z. The thumb's opposition, flexion and twist axes
   from MakeHuman's thumb. Measured: no bend more than ~5° sideways.
2. **Five fingers** (H1a). The build splits the middle, ring and little; their places, weights and axes. The
   rig's `fingers` channel drives all three, with a cascade (the little finger ~1.2× the middle's curl, the
   ring ~1.1×) and the spread closing as they curl.
3. **The forearm's twist** (H2a). A twist bone; a palm turned by the forearm (the elbow's own twist shared
   along it: 0 at the elbow, all at the wrist); the wrist keeps only its bend and its side-to-side.
4. **The hand library** (H3a). Relaxed (knuckles ~45°, middles ~15°, tips ~10°, the cascade, the thumb by the
   index), loose, open/flat, cylinder grip, a handle's hook grip (a mug), a phone hold, a pad hold (thumbs on
   top), fist, point, pinch, thumbs-up, peace, typing. `HandShape`'s three numbers map onto it (open ↔
   relaxed ↔ grip ↔ fist), so every clip gets the new hands at once; acts that hold a thing name their pose.
5. **Props and grips** (H4a). The bench draws what's held; a hand's target is where it holds (the palm's
   middle, or a handle), the wrist solved from it. The phone, the mug, the pad, the torch, the keys, a pool
   cue, a rail (Flowmotion), a steering wheel.
6. **Skin.** The lump on the back of the hand: the metacarpals' weights, checked in a fist and spread.
7. **Every clip's hands**, close (as plan 77's survey, framed on the hands), the report in range, no hand
   through a hand, the head or the body. Before/after sheets for sign-off.

## Phase 0 — done 2026-11-11

- Undone in `anim/acts.ts`: the call's wrist bend (`WRIST_CALL`) and the clap's wrist twist (`CLAP_WRIST`);
  the call's elbow, the wider clap, the pad and the fist bump kept.
- `apps/client/e2e/hand-report.mts "label|clip|t|R|kind" … [--woman]` (kinds: relaxed, grip, fist, flat,
  phone, any): MCP/PIP of the middle chain and the index, the most a bend goes sideways out of the palm's
  plane, the spread, the thumb turned toward the palm and its last joint's distance to the index's base, the
  wrist up/down and side to side (the forearm in the hand's frame) and its twist against the elbow; and
  each finger's bones as capsules (a tip on the last), the palm as one — how deep they go into the other
  hand, the head (a 9.5 cm sphere) or the trunk (a 12 cm capsule spine → chest). DIP waits for tip
  points (the file has none; phase 1–2), the forearm's twist for its bone (phase 3).
- Baseline, the man's right hand (39 out of range in 10 moments):

| moment | out of range |
| --- | --- |
| relaxed (idle 3 s) | index PIP 34°, the thumb 6.1 cm off the index |
| phone call | every MCP/PIP too curled (67–72°), sideways 8° — the wrist 0° now |
| mug | fingers 72/78, index PIP 78 (a fist's numbers for a cylinder) |
| fist bump | in range (the thumb 25° in, 7 cm off) |
| clap 0.6–1.8 s | MCP 22 (should be near flat: the file's rest hand is that curled), into the other hand **4.3 cm** at 1.2 s, ~1 cm at 0.9/1.8 s |
| gamepad | = mug, 0.8 cm hand into hand |
| phone text | PIP 72°, both hands **3.0 cm** into each other |
| torch | a fist's numbers for a grip; the thumb 25° in |

- Stills: `design/screens/life/p78-phase0.png` (before/after the undo; the two hand-through-hand finds).

**A correction (phase 1):** the "sideways" numbers above and in "What's wrong" (25–42°) were the measure's,
not the hand's. A bend was taken against the line from the wrist to a finger's base, and that line fans out
from the index (in the palm's plane): the fan counted as sideways, and as knuckle bend. The report now
measures in the hand's own frame — each finger's flexion plane its rest line laid in the palm's plane and
the palm's normal; a bend its angle in that plane, sideways how far it leaves it. Measured that way the old
curl went **1–8°** sideways (the fist 8°, the mug 6°), not 25–42°: finding 1 was small. The hook in the
stills is the rest hand's own curl and the fan, not the axis.

## Phase 1 — done 2026-11-11

- `chars/life.ts` `LifeLook.hinge`: each finger bone's hinge, worked out from the bones' rest places (every
  bone past the wrist is unturned at rest, so one frame): across the bone's line, in the palm's plane (the
  wrist, the middle fingers' base, the index's), its sign the old curl's. The thumb's middle and tip:
  across their line, toward the palm's middle. No rebuild: the file's places are enough (phase 2's split
  will give each of the five its own the same way).
- `chars/model.ts` setPose: the curl (the rig's z, the same 0.8 / 1.1 / 0.8 down the knuckles) turned
  about each hinge; the thumb's middle and tip fold 0.6 / 0.5 of the rig's thumb about theirs (no more
  than −0.2 back). The thumb's base keeps the rig's swing till the library (phase 4).
- The report: the hand's frame (above); the tips' joint (DIP) from its bone's own turn (no point past it);
  DIP ranges added.
- Measured, the man's right hand, old → new: sideways most 8° → 2° (fist), 6° → 1° (mug), 5° → 0° (call),
  every moment now 0–4°; the thumb 6.1 → 5.8 cm off the index relaxed, but turned in less (fist 25° → 20°,
  mug 35° → 32°). 36 out of range in 11 moments (the curls themselves — phases 2 and 4 — and the hands
  through hands — phase 7).
- Stills: `design/screens/life/p78-phase1.png` — near the same by eye, as the numbers say.

## Phase 2 — done 2026-11-11

- The build (`build_person.py`): "fingers" the middle finger alone (MakeHuman's finger3; the three averaged
  before), the ring (finger4) and the little (finger5) their own three bones each, off the wrist; the knuckle
  list, the parents, the fold, the painted shading's keep (`keep_mask`) and the wear zones (`wear.py`) with
  them. `life-people.ts` KNUCKLES the same order; a ring's or little's base's parent the wrist
  (`knuckleParent`, and model.ts makeSkeleton's copy). People rebuilt.
- `LifeLook`: their hinges as phase 1's; each finger's fan off the middle's line (`fan`) and the palm's normal.
- `model.ts` setPose: the rig's "fingers" curl the middle's; the ring 1.07× and the little 1.15× of it (the
  cascade, `CASCADE`); each finger's fan shut 0.8 of the way by a curl of 1.3 rad (`FAN_CLOSE`, `FAN_SHUT`)
  — a fist's fingers together.
- The report: the ring and the little; sideways now from each finger's own plane (its first two bones'; bent
  less than 20°, its base's line and the palm's normal) — twisted off the palm's normal, or leaned away from
  the middle; a fanned finger closing toward the middle's line is a real hand's, not counted.
- Measured, the man's right hand: relaxed knuckles middle 42° · ring 43° · little 49° (one curl before); fist
  91 · 94 · 104°; sideways 0–4° in every moment; the woman the same (relaxed 42 · 42 · 50, fist 90 · 93 ·
  106). 38 out of range in 11 moments (the curls — phase 4 — and hands through hands — phase 7).
- By eye (`design/screens/life/p78-phase2.png`): the fist's knuckles each their own and the lump on the back
  of the fist smaller; the mug's fingers apart. 325 client tests pass.

## Phase 3 — done 2026-11-11

- The build: MakeHuman's `lowerarm02` (half way down the forearm, folded into the elbow before) its own bone,
  `forearmL`/`forearmR`, off the elbow — in the knuckle list (the game's extra bones, the same plumbing:
  `life-people.ts` KNUCKLES, `extraParent`; model.ts makeSkeleton); the wear zones count it with the arm.
  People rebuilt.
- `model.ts` `shareTwist()`, after every pose and reach (idempotent): the elbow's twist about the forearm's
  line taken out and given to the wrist (the hand ends where it was), and the forearm bone turned
  `FORE_TWIST` = 0.55 of the wrist's twist. The elbow keeps only its bend, the wrist its bend and side to
  side; the palm's turn is the forearm's.
- Chosen by measure: at a 69° turn of the palm (a test turn), the forearm's girth kept along it — all at
  the wrist (before) 100 · 100 · 98 · 94 · **86%** (elbow → wrist); the bone at 0.4: 92% at the wrist;
  **0.55: 97 · 95 · 94 · 93 · 93%** (the evenest); 0.7: 91% mid-forearm; 0.85: 87%.
- The report: the forearm's twist (elbow to hand, about its line, ±95°), the twist left at the wrist
  itself (past the forearm bone, ±45°), the palm to the other hand (its normal against the line to it;
  a "clap" kind ≤35°).
- No clip turns the forearm today (the reaches take the elbow's twist out; the poses barely use one): the
  forearm reads 0–2° everywhere. The clap's palms 34–37° off facing; the phone, the keys, the high five
  get their turn from the library (phase 4) and the props (phase 5). 325 client tests pass.
- Stills: `design/screens/life/p78-phase3.png` (the 69° test turn, before/after; the girth table).

## Phase 4 — done 2026-11-11

- `chars/hands.ts`: the library in a real hand's joint angles — the fingers (MCP · PIP · DIP) along the rig's
  curl: open 4·4·2°, relaxed 30·25·12°, loose 42·40·22°, grip (a cylinder) 50·50·28°, fist 88·105·72° (and
  past it for the little finger's cascade, and back to −15° for a hand pressed flat); the thumb's MCP · IP
  along its fold (thumbs up −5·−12° … relaxed 20·18° … fist 40·50°). The rig's three numbers pick a place
  along it, so every clip's hands are these at once (blends stay blends).
- `LifeLook.restBend`: the file's own bend at rest, each finger (its hand is a little curled: the clap's
  fingers stood 22° bent); `model.ts` turns each knuckle to the library's angle less it.
- The thumb's base **aimed** once the fingers are posed (the rig's angles alone left it 4.2 cm off the
  index relaxed and 1.5 cm through the palm in a fist — seen as a knob out of the back of the fist): relaxed,
  its pad on the index's side at its middle bone; in a fist, over the outside of the index's and the middle's
  middle bones; blended by the curl and the fold. A grip's thumb is left to the held thing (phase 5).
- The report: the thumb's pad (half way along its last bone) to the nearest of the index's bones, less the
  two half-thicknesses; the thumb into its own hand (its last two bones against the palm and the fingers);
  sideways from the two-bone plane only past 40° of bend (below it a finger's small kink read 7–8°).
- Measured, the man's right hand, 11 moments: **38 → 6 out of range** — relaxed 30·25·12 (the thumb on the
  index's side), the mug, the gamepad and the call 47–50·47–50·26–28 (a fist's 74·77 before), the fist
  88·105·72 with the thumb over it, the clap's fingers straight (4°). Left: a grip's thumb 0.9 cm into its
  own fingers (the mug, the torch: phase 5), the hands through each other (the clap 4.3, texting 3.3, the
  pad 1.6 cm) and the clap's palms 37° off facing (phase 7). The woman the same (her mug's thumb 1.3).
- Named holds (a mug's hook, a pad's, a phone's) stay the rig's HandShape numbers (PHONE_HAND, the pad's
  thumbs) till the props give each a target (phase 5). 325 client tests pass.
- Stills: `design/screens/life/p78-phase4.png`.

## Phase 5 — done 2026-11-11

- **The bench draws what's held** (`/dev/anim`), as the game draws it: a drink or the phone in the right
  hand, the torch in the left, the pad between them; `&oldgrip=1` draws them the old way to compare.
  `__anim.held()` hands the report the thing and its shape. Drawn, the old places showed: the mug floating
  in front of the fingers, the phone behind the hand at the call and floating over the hands texting, the
  fingers through the pad, the torch along the forearm with the hand at its head.
- **The life hand's frame** (`LifeLook.grip`, `PersonModel.handFrame`): the middle knuckle from the wrist,
  along the palm, across it, out of it. `props.ts gripPlace` seats each thing in it (`inHand`,
  `keepUpright`, `pointAlong` take it; the mitten's places kept for any other body): a round thing across the
  palm at the fingers' roots out by its radius; the phone across the palm too, lying on it; **the mug by its
  handle** (the bar through the fingers, the body out beyond them), and stood upright about the handle.
- **The fingers close on it** (`model.ts closeHands`, after every pose and reach): the thing's shape
  (`HELD_SHAPE`: round, box, or parts — the mug's body and handle bar); each finger in a real hand's two
  steps — the knuckle bends till the first bone meets it, then the middle and the tip go on round it till
  they meet it too; a finger already in it open keeps the pose's curl; the thumb opened then folded along
  its own way till it meets it; the head an obstacle too (a hand at the ear).
- **A reach goes by the thing** (`heldReach`, `holdAt`): the phone's speaker to the ear, its screen to the
  head and its length on toward the mouth; a drink's top to the lips, the hand turned so the mug's body
  comes to the mouth (its top worked out from the hand as it is, as keepUpright will stand it — read back off
  the drawn mug it lagged a frame and swung).
- **The torch aimed by the hand** (`aimHand`): the wrist turned so the barrel, across the palm, points where
  it shines — within a real wrist's reach (the forearm's twist ±80°, the bend ±60°, side to side −25…+35°);
  the rest turned in the fist.
- The game (`person3d.ts holdFrame`) tells the model what each hand holds every frame; the torch aimed the
  same way.
- The report: a `held` kind (the contact, not the joint ranges); into the thing held, each finger's nearest
  bone off it; the palm 1.5 cm thick (2.2 read a palm face-on to a head or a palm as through it: the clap
  4.3 → 2.9 cm, texting 3.3 → 1.9); the head an ellipsoid (7.6 cm half-wide — a ball read the hand at the ear
  as in it).
- Measured (the man's right hand, `held`): the mug held and at the sip in range (its top 4 cm ahead of the
  lips, 1.2 low — the rim on them); left: the phone 1.5 cm into it (the thumb's and the little finger's
  roots), the call's fingers in the hair behind the ear (7.9 cm into the rough head shape — by eye they rest
  on it), the torch 2.1 (the aim past the wrist's reach turns it in the fist), the pad 0.9, and texting's
  phone on its edge (the pose holds the palms facing each other: phase 7 with the hands through hands).
  Not done: the pool cue, a rail, a steering wheel (each already put the wrist on its thing by IK). 325
  client tests pass.
- Stills: `design/screens/life/p78-phase5.png`.

### Phase 5, the user's notes (2026-11-11) — redone

Notes on the sheet: the mug's fingers not through the hole; at the sip the arm came out of the body; the
phone in the face; texting "totally wrong" (both hands on its sides, the thumbs on the screen); the pad wrong
(the ends held, the thumbs on the buttons); the torch through the hand and the wrist crooked ("look for
reference photos"). References looked up: a mug's hooked by its handle, the index (often the middle too)
through the loop, the thumb on top, the rest under it; a torch held to point ahead in a thumb-forward
("sword") grip — the light goes where the thumb points; texting in both hands, the fingers behind, the
thumbs on the screen; a pad's handles in the last three fingers from behind, the index on the trigger, the
thumbs on the sticks and buttons.

- **The mug**: a finger through a handle is between its bar (in the finger's crook, the palm's side) and the
  body (against the finger's back): `gripPlace` turns the handle's flat across the fingers, the body behind
  them; the bar on the first finger bones between the index and the middle finger (`gripAt`). The index and
  the middle finger go through the hole; at the sip the arm comes up from below in front.
- **The call**: the phone along the palm (its foot in the palm's heel, the fingers up its back, the speaker at
  the fingertips' end): across the palm, a wrist couldn't turn it to run from the ear to the mouth. Flat in
  the head's side plane, its corners pushed out of the head (`phoneInHead`).
- **Texting and the pad** (`PersonModel.holdTwo`, `bothHands`, `twoPlace`): in both hands in front of the
  chest, its face tilted to the eyes: the palms facing each other (a forearm's neutral turn — palms up was
  past the twist and crossed the hands), its sides in them, the fingers closing under its back, each thumb
  aimed onto its face near its own side, lifting by turns (`tap`). The game draws the phone (texting) and
  the pad where the hold puts them (`person3d.ts twoFrame`).
- **The torch**: a thumb-forward grip — the barrel on the palm's slant (0.6 rad off straight across, from the
  little finger's heel to the index's root), its head out past the thumb (`TORCH_SLANT`); the hand aims it
  (`gripLine`, `aimHand` within a wrist's reach) and it turns in the fist no more than 15° (`IN_HAND`).
- Left: the torch's index lies along the barrel (it starts in the barrel open, so keeps the pose's own);
  the woman not looked at with these; the game's wiring checked by the bench only. 325 client tests pass.
- Stills: `design/screens/life/p78-phase5b.png` (each row of the noted sheet, before and after).

### Phase 5, the user's second notes (2026-11-11) — redone

Notes: the mug's fingers weird, the mug should face the side; the sip weird because of it; the call's hand
too high on the phone; texting's phone higher in the hands and the arms out of the body; the controller still
wrong; the torch perfect. Photos looked at (the built-in browser): a mug held at the chest — the fist
upright, the thumb on the handle, the fingers curled through it pointing in, the mug's body in front of the
fist, the handle out to the side; controllers — each fist round a handle that angles down and back, the
thumbs over the top on the sticks.

- **The mug** back in front of the fist (`gripPlace`), the fist turned upright with the fingers pointing in
  (`heldRest`); a drink turns in the fingers up to 0.8 rad to stand up (`IN_DRINK`; the fingers close on it
  again each frame). The fingers: a thing the open fingers pass through but the curled ones clear (a handle,
  a barrel in the crook) is opened from closed till they meet it, a finger pressing it up to 4 mm (`SOFT`).
- **The sip**: the hand tips the mug (`aimHand` its up to the tipped up), the fist beside the mug pointing in
  across the face — the handle out to the side — and the elbow out (`sipPole`): its top worked out with the
  in-hand turn keepUpright adds.
- **The call**: the phone's middle at the hand's middle (`gripAt` 1.15 of the knuckle), its top past the
  fingers.
- **Texting**: further ahead (0.36 m), the hands holding its lower half (`lift`), the screen above all four
  fingers (`across` 0.034 — at 0.022 the index curled over it); the elbows out — a mirrored pole had turned
  the left one into the body (reachTo mirrors the right arm's own).
- **The controller**: a pad with handles (`buildPad`, `HELD_SHAPE.pad`: its body and two capsule handles down
  and back), in the game and on the bench; each fist round its handle (across the palm, the thumb's end up
  toward the body, the palm turned in), the pad where the two handles sit, the thumbs aimed at the sticks.
- Left: the controller's thumbs could sit squarer on the sticks; the woman not looked at; the game checked
  by the bench only. 325 client tests pass.
- Stills: `design/screens/life/p78-phase5c.png`.

### Phase 5, the third notes (2026-11-11)

Notes: the mug — two fingers through, not one; the sip — the wrist bent too far, the arm should come round to
the angle the hand has (the hand's place perfect); the call — perfect but one finger bent; texting perfect;
the controller "improve a little more"; the torch done.

- **The mug**: the handle taller (±3.6 cm, the bar's `hy` 0.034), as a mug's, for two fingers; the index and
  the middle finger at a fixed hook (`HOOK_CURL` 1.25) and the handle seated in their hook
  (`LifeLook.grip.hook`: the middle of the two fingers' curl, from each body's own bones — the solver,
  closing from open or opening from closed, kept stopping one finger outside the hole); the ring and the
  little tucked under it (`TUCK_CURL`). The fist stood up last (thumb up wins over the fingers pointing in:
  the wrist had bent 54° turning them in); and stood up again after `handsTo` — the bench's arm solved again
  after the pose turned the hand with it.
- **The sip**: the hand kept, the arm brought round in line with it — the elbow back along the hand's own
  line, tipped down `SIP_SLANT` (level, it went up to the shoulder): the wrist 5–32° side to side, inside its
  reach.
- **The call**: every finger at the straightest one's curl, flat up the phone's back.
- **The controller**: the index fingers to the curl that brings their tips nearest the triggers (the pad's
  front top edge over each handle). A small change by eye.
- 325 client tests pass. Stills: `design/screens/life/p78-phase5d.png`.

## Phase 6 — done 2026-11-11

- Looked at the back of the hand in every shape (fist, open, relaxed, grips; the man and the woman): no lump
  left. The one this plan saw (finding 8) was the thumb pushed through the fist — gone with phase 4's aimed
  thumb.
- Left: a sliver on top of the fist by the knuckles. Picked by a ray from the close camera through the skinned
  triangles: the index's own tip (index3, all its weight), curled on through the palm and out of the back of
  the hand — the library's fist (88 · 105 · 72°) curls a life finger, thicker than a real one, past its palm.
  The fist's tip eased to 50° and its middle to 100° (`hands.ts`; past it 95 · 108 · 58): the tips rest in the
  palm. The skin itself checked too: no point of the hand more than 2.5 cm off its bones in a fist (the palm's
  heel, as thick as it is) — the weights needed no change.
- The fist's thumb rests 6 mm further off the fingers (it had tested at 0.3 cm into them).
- The report's fist DIP range 40–95° (the life body's). 325 client tests pass.
- Stills: `design/screens/life/p78-phase6.png`.

## Phase 7 — done 2026-11-11

- **A survey**: the report on every clip on the bench (138 of them, the swims' long ones aside) at 0.8, 2 and
  3.2 s, both hands — 816 hands. Out of range before → after: **200 → 159**.
- **The clap**: a pose's hand can name where its palm faces and its fingers point (`Hand.palm`, `point`,
  the body's own space; `PersonModel.handsTo` turns a life hand so, within a wrist's reach); the clap's palms
  to each other, the fingers up and on, the wrists in till the palms just meet (`CLAP_MEET`): its palms 37°
  → 2° off facing, through each other 2.9 → 0 cm (1.4 at the beat itself).
- **The heart**: the fingers up and curling in to meet over the chest, the wrists apart (`HEART_W`): it had
  the hands crossed 2.9 cm (1.7 now, the fingertips meeting). Its palms meant to face the chest stay facing
  out: past a wrist's twist from there.
- **The phone photo**: in both hands by its sides (the two-handed hold, `holdTwo("photo")`, raised to the
  chin) — one arm had reached across the face. (Its turn on its side didn't take: held upright, as a photo
  often is.)
- **The thumb of a half-closed hand** (running, hanging, a grip with nothing in it) over the fingers too, as
  a fist's: it had sunk 1–1.4 cm into the palm. Thumb into its own hand 69 → 31.
- The report: the fingers off a held thing measured on the hand that holds it (it measured the free hand
  against the other's mug).
- Left, by the survey: hands meeting where real ones do (a gun's two-handed grip, hands clasped behind the
  back, swim strokes); the sprint's open hand's thumb 0.7–1 cm; the wrist's side to side on a bar, crawling,
  a ledge's catch, the shadowed's lunges (25–47°); the held things' contact (the mug's hook, the pad's
  handles — signed off as they look). The left wrist's side-to-side limit isn't mirrored (the left pad hand
  −50 to −63°): mirroring it moved the signed-off torch, so it stays.
- 325 client tests pass. Stills: `design/screens/life/p78-phase7.png`.

### Phase 7, against reference photos (2026-11-11)

The user asked for each phase-7 hand to be set beside a real photo of it (`design/screens/life/p78-phase7-ref.png`;
the phone photo from four sides: `p78-phase7-photo.png`). What changed:

- **The clap**: down to the lower chest, palms flat together, fingers up and forward (at the chin it read as
  a prayer).
- **The heart**: the user said "the heart is wrong". It had been steepled: fingers straight up, thumbs
  hidden, no hole. It's redone from close photos of one (`p78-phase7-heart.png`):
  - Each hand is a C, the two facing. The wrists sit low and apart, and each hand rises up and in, back
    out, palm to the chest and to the other hand (`palm` [∓0.9, −0.2, −0.3], `point` [∓0.3, 0.9, 0.3]).
  - The index arches over to meet the other's at the top's dip (curl 1.0). The others tuck a little
    tighter behind it (1.25). The thumbs are straight.
  - The heart sits at nipple height, 22 cm ahead (`HEART_Y` 1.3, `HEART_Z` 0.22, `HEART_W` 0.089). The
    elbows are low (`HEART_ELBOW`), so the forearms rise to the hands.
  - `Hand.thumb` is a point the thumb pad aims at (model.ts `thumbsMeet`). The hand moves by however far
    the thumb falls short, up to 3 cm: the woman's smaller hands had stopped 4 cm apart.
  - What didn't work:
    - Palms toward the chest made the fingers curl into the body, not round toward the other hand.
    - Leaning the hands forward foreshortened the fingers from the front: two fists.
    - A curl search on the index tip (nearest a point, or stopping at the middle) found the fist curl or
      the open one, never the arch: the arch is set by the hand's turn, not the curl.
    - Curling a crossing finger tighter folded it into a fist.
  - Left out of range: fingertips press 1.1–1.3 cm into each other (as real ones pressed together do).
    The wrist bends sideways 29°/39° (man), 20°/27° (woman): standing the hands up for a frontal heart takes
    it with forearms at this height.
- **The phone photo**: on its side, held out at eye height most of an arm away (`TWO.photo.at` 0.28 up,
  0.5 ahead of the chest; it had been under the chin, 24 cm off the face). A hand at each end, the palms
  facing, the fingers behind, the thumb on the screen near the end. Into the other hand 1.5 → 0.8 cm.
  One finger is still 1.2 cm off the phone, the little finger under its edge, as real ones often are.
- **The running hand**: a loose fist with the thumb along the index's side.
- **Hanging, the arcade**: already like the photos.
- The bench's `closeUp(bone, from, fov, "held")` looks from a bone toward the thing held (an eye's view).
- The heart also cleared three lint notes left from phase 5 (an unused import, two `??=` in expressions).
- 325 client tests pass, typecheck clean.

Phase 7 signed off by the user 2026-11-11 ("Approved"): plan 78 is done. Next: plan 77's phase 8 checks.

### After the sign-off (2026-11-11): the known issues

- **The heart's wrists**: a little forward lean (`point` [∓0.3, 0.8, 0.52]), wrists 3 mm wider apart
  (`HEART_W` 0.092), and no side lean of the chest (it turned one wrist 31°). The sideways bend is now
  19°/23° (man) and 8°/12° (woman), within a real wrist's −25…+35°. The index tips meet pressing 1.4–1.6
  cm in the report's capsules. Tucking the back fingers tighter (1.4) bunched them into a fist under the
  index, so 1.25 is kept. Stills `design/screens/life/p78-heart-wrists.png`.
- **The survey again** (816 hands): no wrist past its side-to-side range anywhere (the hang, crawling, the
  ledge catch, the shadowed's lunges were in phase 7's list).
  - The thumb "into its own hand" count rose to 61. The rest are contacts on the fingers, not the palm:
    a loose hand's thumb pad on the index's middle bone at a jog's start (0.9 cm), a grip's thumb on the
    ring finger round a bar (0.9), a fist's index tip against the thumb's side at a sprint (0.6–0.7).
  - A full pad-width offset for a half-aimed thumb and a fist thumb 4–12 mm further out both left these
    as they were (and would float the approved fist's thumb), so they're unchanged.


- Lee & Jung, resting hand posture (MCP ~45–90°, PIP 0–20°, DIP 0–10°; PIP the largest flexion of the
  fingers): [yadda.icm.edu.pl](https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-785f4b91-56ad-477b-8b98-36d5dc7e344c/c/Lee.pdf)
- Position of function (MCP 45–75°, PIP ~10°, DIP 0–10°, the wrist a little extended):
  [Taylor & Francis](https://www.taylorfrancis.com/books/9780429089152/chapters/10.1201/9781498713283-85)
- Neff & Seidel, the relaxed hand for animation (DIP ≈ ⅔ PIP):
  [cs.ucdavis.edu](https://www.cs.ucdavis.edu/~neff/papers/amdo_06_NeffSeidel.pdf)
- Cylinder grip (MP ~45°, PIP 30–45°, DIP 10–20°; the thumb opposed):
  [Thompson, OUHSC](https://ouhsc.edu/bserdac/dthompso/web/namics/hand.htm); measured by CT:
  [PMC6339738](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6339738/)

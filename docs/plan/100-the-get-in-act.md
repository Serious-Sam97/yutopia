# Plan 100 — the get-in act, at the quality of the big games

Asked 2026-11-18, after plans 98–99 and the blink fix (03768f77):

> The enter-the-car animation is a lot better, but it doesn't have the full quality I was expecting: the legs are
> weird, and the arms a little too. Compare with images and videos of the GTA saga for reference.

Only this one thing: the act of getting into a car (`car/getin.ts`, posed by `chars/acts.ts carStep`).

Status: **planned 2026-11-18; forks decided 2026-11-18 one by one: F1a procedural rebuilt, F2a GTA's way in, F3c
length by context, F4b out too, F5a every seat and vehicle, F6b no sign-off stills (build straight), F7a straight
through — you test at the end.**

## Where we are — stills of today's act (`e2e/car-act.mts`, Main Street's first town car, the driver's door)

The act is 2.8 s, planned in the car body's frame from what the car measures (plan 98 phases 0–3): hips on a keyed
path, each foot planted or swung (Hermite keys), the duck and the lean as two numbers, the hands as weights on grip
marks, the legs solved to the feet (two-bone, in the hip-to-foot plane), blended into the seat's pose at the end.

What's wrong, seen from behind, from the front and beside the door:

| t (s) | what she does | what's wrong |
|---|---|---|
| 0.3–0.8 | the near hand to the handle, the door pulled open on a half step back | fine; the hand is flat — no grip — and the door moves on its own clock, not with the hand |
| 1.2–1.55 | turned into the gap, the outside hand on the door frame's top, the inside hand on the roof's edge | **both hands over her head** ("hands up"): the marks are at 1.46–1.50 m and the duck drops her shoulders under them; the elbows go up and out |
| 1.55 | the inside foot over the sill | **the knee pulled up to her chest**: the foot goes over the sill (≈1.0 m with the clearance) while the hips are still at standing height |
| 1.7–1.85 | the hips moved into the car | **she dives in head first, sideways**; the outside leg left behind **straight, its foot off the ground** (the planted foot out of the leg's reach — the solver lets it go); the outside arm **stretched straight back** to the door's top |
| 2.0–2.15 | the outside leg swung in | **the knee pokes through the door** and the sill: the swing's path is keyed, not cleared against the door |
| 2.3–2.8 | sat; the door pulled shut | the reach for the pull is a straight-arm swing; the settle is a blend, no weight landing |

Seen in passing (not this plan): the door's inside face draws as a flat black panel in the stills.

## The reference — how the big games (and people) do it

GTA V and GTA IV (motion-captured), and how people are taught to get in (health guides: back to the seat, sit, then
the legs), share one shape. For a driver's door:

1. **Align and open (≈0.7 s):** the last steps of the walk land beside the handle, the body turned a little toward the
   car's back; the near hand **grips** the handle (fingers hooked under it), the door is pulled out on an arc **by the
   hand**, the body steps back and aside with it — the door ends ~60–70° open, the body in the gap.
2. **Turn and sit (≈0.8 s):** she turns her back half toward the seat; **the inside foot steps into the footwell while
   the hips go down and in onto the seat's edge in the same move** — the weight on the outside leg, still planted on
   the ground, its knee bending as she lowers. The head **ducks under the roof's line** as the hips go in (the head
   leads, a little forward). One hand takes something solid *at its own height*: the wheel, the seat, the door's top
   at chest height (the roof's edge only on a tall cab, with a grab handle). The other arm hangs and helps balance.
3. **Legs in (≈0.5 s):** sat on the edge, the outside knee lifts toward the chest and the foot clears the sill on a
   short arc, swung in as the hips turn to face the front; a little shuffle back into the seat.
4. **Close (≈0.5 s):** the outside hand reaches out (the shoulder turning with it, not a stiff arm), takes the pull, and
   draws the door in — the door slams on the sound.

What makes it read as real: the weight is always over a foot or the seat (never hung in the air), the knees point
where the feet go, the hands grip at believable heights, the head leads the body, and there's one continuous line of
motion (anticipation before the sit, a small landing as the hips meet the seat).

## Guardrails

- Every car still fits by its measures (`openingOf`, the seat, the floor, the sill) — no act made for one car only.
- The act's length stays a constant the walker, the camera, the server's `car:enter` and the probes all read
  (`ENTER_S`); the ways out of it (a move in the first 1.2 s, X skips to sat) stay.
- Plan 78's hands (five fingers, the hand library) for the grips; plan 58's body (29 joints, foot lock).
- Plan 99's hold (the walker held through the act) and 03768f77's spare model stay as they are.
- Commit on main only; push when asked; no co-author line.

## Forks (asked one by one)

- **F1 how it's made:** (a) the procedural act rebuilt to the reference's beats with pose rules (contacts, clearances,
  reach, knee and elbow directions) — fits every car by its measures, nothing to download · (b) a clip hand-keyed in
  Blender on our rig, then fitted to each car by IK · (c) a motion-capture clip (Mixamo — needs your Adobe account to
  download; one generic car) retargeted and fitted by IK. *Recommended: (a).*
- **F2 the way in:** (a) GTA's: the inside foot in while the hips go down onto the seat, then the outside leg swung in ·
  (b) sit first with the back to the seat, then both legs in (the health guides': slower, careful) · (c) today's
  climb (the foot in, then the hips), only cleaned up. *Recommended: (a).*
- **F3 how long:** (a) ≈2.4 s, open 0.7 · sit 0.8 · legs 0.5 · close 0.4 · (b) keep 2.8 s · (c) by context: 2.4 s
  walking up, ≈1.6 s hurried (ran up, under fire, being chased). *Recommended: (c).*
- **F4 the way out:** (a) only in now; out in its own plan after you've tested this · (b) out too, by the same rules
  (the reverse: the outside leg out, a hand on the frame, up, step out, close). *Recommended: (b), the same rules make
  it cheap and the two read alike.*
- **F5 which seats and cars:** (a) every seat and vehicle (the passenger's, the back seats, the van, the tall cabs with
  their step and grab handle, the small ones) · (b) the sedan's driver's door first, the rest later. *Recommended: (a).*
- **F6 key poses first:** (a) the beats' key poses shown as stills on a bench (`/dev/getin`) for you to sign off before
  the act's built · (b) build straight through. *Recommended: (a).*
- **F7 how it runs:** (a) every phase straight through, you test at the end · (b) a look at each phase.

## Phases

### Phase 0 — the bench (`/dev/getin`) (F6b: no key-pose sign-off; the bench is for building and the checks)

- A dev page: the town sedan (any car and seat from a list), the body in the act at a scrubbed time, play, speed
  (0.25×–1×), loop; views beside the door, front, back, top and the player's camera; the act's marks drawn (each
  foot's and hand's target, the grip marks, the sill and roof lines, the door's plane); old/new side by side.
- **Warnings drawn on the bench** and read by the checks: a planted foot off its mark (> 2 cm) or off the ground; a
  foot or knee through the door, the sill or the body's side; a hand above the head (outside a tall cab); a leg
  stretched past its reach; the head through the roof.
- (F6b) No key-pose stills to sign off: the beats are checked against the reference on the bench as they're built.

### Phase 1 — the beats rebuilt (the hips, the facing, the timing)

- The act's timeline re-keyed to the reference's four beats (F3's lengths); the hips on one continuous arc from the
  stance through the gap down onto the seat's edge (sit first, F2), then back into the seat as the legs come in.
- The facing: toward the handle, back half to the seat as she sits, round to the front as the legs come in — turned
  about the planted foot, not slid.
- Anticipation before the sit (a small dip and lean), a landing as the hips meet the seat (the seat's cushion pressed
  a little), a shuffle back.
- `ENTER_S` follows F3; a hurried act (F3c) when the walker came up running or was hit in the last few seconds.

### Phase 2 — the legs

- The planted feet stay planted: the hips' path limited by each planted leg's reach (no foot hung in the air); a foot
  lets go only by a step.
- Knees point where the feet go (each leg's bend plane from the foot's travel), never inward through each other.
- The steps over the sill on arcs cleared against the car: the sill's height and the door's plane measured, the
  foot's path lifted over them with a margin, the knee kept outside the door's swing.
- Heel and toe: a foot rolls off the ground (heel up, toes last) and lands toe or heel first as people do; the toes
  pointed on the swing.
- The weight shown: the hips over the supporting foot, the pelvis tilted to it, the free leg light.

### Phase 3 — the arms and hands

- Grips at believable heights: the handle (hooked fingers), the door's top **at chest height** (palm over it, not
  above the head), the wheel's rim (wrapped), the seat's bolster (palm down), the pull (hooked); the roof's edge or
  grab handle only on a tall cab.
- The elbows aimed down and out (pole targets from the shoulder to the grip), the shoulders' raise limited, the
  collarbone taking some of a high reach; a grip let go before the arm runs out of reach — never a straight arm
  dragged behind.
- The free arm relaxed, helping balance (out a little as she lowers).
- The close: the reach out with the shoulder turning, the pull drawn in, the hand let go as the door shuts.
- Fingers from plan 78's hand library; the grip's fingers closing as the hand arrives, opening as it leaves.

### Phase 4 — the back, the head, the eyes

- The duck worked out from the roof: how far the head must drop to pass under the roof's line on its path, shared
  by the hips (bent), the back (curved, not just tipped) and the neck.
- The head leads: it goes in first, a little ahead of the hips; she looks at the handle, then into the car, then out
  of the windscreen.
- The trunk's twist through the turn, spread down the spine.

### Phase 5 — the door in the hand

- The door's angle follows the gripping hand (the handle's arc; the pull's): opened as far as she pulls it, its
  inertia when let go, the slam on the hand's pull (the sound on the shut, plan 98's door takes).
- A door left open (by someone else, a wreck's) is gone round, not pulled again.

### Phase 6 — the way out (F4b)

- The same rules in reverse: the door pushed open by the pull, the outside leg out onto the ground, a hand on the
  door's top or frame at chest height, up out of the seat over the planted foot (the head ducked out), the inside leg
  out, a step back and the door pushed shut.
- Plan 99's hurry (a move brings its last 0.45 s) kept.

### Phase 7 — every seat and vehicle (F5a)

- The passenger's door (into the passenger's seat, and across to the wheel, plan 98 phase 24), the back doors, the
  van's sliding door, the small cars (the head lower), the tall cabs (a step, the grab handle, climbing up), the
  snowcat.

### Phase 8 — the checks

- The bench's warnings run over every car and seat, in and out, at every frame: none left.
- `e2e/car-act.mts` sheets, today's act beside the new; a video from the player's view
  (`e2e/car-act-video.mts`).
- The car specs (`car.spec`, `car-look`, `pets-car`), `e2e/car-hold.mts`, `e2e/car-blink.mts`; client car and chars
  unit tests; typecheck.

## Sources

- [How to get in and out of a car — HealthLinkBC](https://healthlinkbc.ca/node/1061)
- [Mobility problems: getting in and out of a car safely — Michigan Medicine](https://www.uofmhealth.org/health-library/aby3697)
- [Getting in and out of a car — Frimley Health NHS](https://www.fhft.nhs.uk/patients-and-visitors/patient-information-library/getting-and-out-car)
- [Development of Grand Theft Auto V (motion capture)](https://www.wikipedia.org/wiki/Development_of_Grand_Theft_Auto_V)
- [GTA IV's Niko Bellic animated — Game Developer](https://www.gamedeveloper.com/game-platforms/gamefest-how-i-gta-iv-i-s-niko-bellic-got-animated)
- The GTA V and GTA IV get-ins themselves, as played (the beats above).

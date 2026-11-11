# 76 — The trunk joints

Ask (2026-11-10): "on our new body is a little weird with the old animation so maybe we need to redo
some animations, check" → after the check, "do 1 with a plan and after that we will do 2 for animations
improvements in general". This plan is 1: the life body's skeleton made to fit the clips. 2 (the clips
themselves, the bent knees first) is a plan of its own, after this one.

Status: **built 2026-11-10** (uncommitted). See "Built" at the end.

## What the check found

The same clips on the old body and the life body, frame by frame (`/dev/anim` with and without
`look=life`; sheet `design/screens/life/p74/anim-classic-vs-life.png`):

- **The trunk bends at the belly.** `build_person.py` puts our `spine` on MakeHuman's `spine04` (7 cm over
  the hips) and our `chest` on `spine02` (the lower ribs). The rig's are at the waist (26 cm over the
  hips) and mid-chest. Every lean is split 40/35/25 across hips, spine and chest (`hero.ts LEAN`), so on
  the life body the bend happens low: a hunch in the run, the sprint and the dark's walks, the belly
  pushed out when the back arches (`trunk bend`).
- **The head drops forward.** The life neck joint is 10.6 cm under the head joint, the rig's 3.4 cm: the
  same neck angle moves the life head about three times as far.
- **Not this plan:** the old idle and walk stand on knees bent 15–28° (the stance leg never straightens
  past ~18°): the clips' own, carried over exactly by `fitLeg` — plan 2. The tee's belly is there at
  rest: the clothes' drape (plan 74).

## Where the joints go

Measured from the hip sockets to the head joint, on our built bodies (MakeHuman's joints, posed):

| joint | rig (old body) | life now | life, this plan |
| --- | --- | --- | --- |
| spine | 0.62 of the way hips → chest | `spine04`, 0.27 | **`spine02`** — the rig's 0.62 exactly (man 1.144 m, woman 1.113) |
| chest | 11 cm under the shoulders | `spine02`, 21 cm under | **`spine01`** — 8 cm under (man 1.274, woman 1.269) |
| neck | 3.4 cm under the head | `neck01`, 10.6 cm | **`neck02`** — 7 cm (man), 6 cm (woman) |

`neck03` would match the rig's neck exactly (3.6 cm) but bends only the top of a long neck; `neck02` is
halfway, the neck bending along more of its length.

The weights follow the joints (a vertex goes with the joint it sits over):

- **hips**: `root`, `spine05`, `pelvis`, `spine04`, `spine03`
- **spine**: `spine02`
- **chest**: `spine01`, `clavicle`, `breast`, `neck01`
- **neck**: `neck02`, `neck03`

Garments fold the body's weights (`OW = W @ fold`), so the clothes follow on the rebuild. The hips joint
stays where it is (6 cm behind the sockets: its turns move the sockets under a centimetre). The springs
that hang off the trunk stay where they were in the body: the scarf's and the pack's off `spine02` (the
old chest), the skirt's off the hips.

## Who reads them (all from the file; nothing to change)

- **Reaches** (`chars/life.ts`): the hand to the chest and the belly, off the old person's chest moved
  to this one's. The new chest sits where the old person's does: the targets get closer.
- **Spring collisions** (`life.ts`, the chest's ball 6 cm over the chest), **sway** stand-ins
  (`sway.ts`: spine → chest → neck), **the ragdoll** (`rag.ts`: hips → spine → chest → neck → head): all
  joint to joint, nearer the rig's lengths than before (hips → spine was 7 cm, now ~21).
- **The garments' cuts** use MakeHuman's own landmarks (`wear.py` LM), not our joints.

## Steps

1. `build_person.py`: the joints' places and the fold as above.
2. Rebuild the people (`build_all.sh`'s people loop, the full wardrobe) and pack.
3. Checks: the comparison sheet again (run, sprint, torch walk, trunk bend, idle, from the side and the
   front, the man and the woman); `e2e/life-legs.mts`; the reaches (phone at the ear, a sip, hand to
   chest) on `/dev/anim?look=life`; `life.test.ts`, `fitleg.test.ts`, `life-budget.test.ts`; the people
   e2e under `playwright.life.config.ts` (sway, people 3D, phone).
4. Stills before/after in `design/screens/life/p76/`.

## Built (2026-11-10)

- `build_person.py`: `ours_of` and the joints' places as above; the scarf's and pack's springs off
  `spine02`; `keep_mask` keeps the neck's base by MakeHuman's `neck01` (folded into the chest now).
- Rebuilt with the full wardrobe (the people loop of `build_all.sh`, ~5 min), packed, credits rewritten
  (unchanged). The game reads the new places (rest, the man): spine 1.144 m, chest 1.274, neck 1.501 —
  7 cm under the head (10.6 before).
- **Seen** (`design/screens/life/p76/`: `before-after-close.png` the man before over after; `strip-*` the
  old body, the life body before, after): an arched back bends in the upper back, not at the belly; a
  forward bend comes from the chest; in the run the shoulders round less and the head sits back a little.
  The dark's walks still carry the head low: that's the clip's (the old body's too).
- **Checks**: `e2e/life-legs.mts` over walk, jog, run, crouch, sit, jump and stairs down, the man and the
  woman — the life ball on the rig's in every frame (0 over 5 mm; at most 3.5 mm, mid-jump). Unit tests
  (`life`, `fitleg`, `chars`, `life-budget`, `life-assets`, `life-wear`, `life-credits`): 35 pass.
  People e2e under `playwright.life.config.ts` (`YUTOPIA_GPU=1`: sway, people 3D, phone, avatar, use
  things, flowmotion): 14 passed, 1 skipped, 2 failed. The three-way call failed in the long run and
  passed alone (7/7). `sway.spec.ts:35` fails the same on the files before this plan: its second browser
  has no `yutopia:look` key and is taken for classic, but the life look is the default since `daa2540`.
- **Left for plan 2** (the clips): the knees bent 15–28° standing and through the walk's stance; the
  tee's belly is the clothes' (plan 74).

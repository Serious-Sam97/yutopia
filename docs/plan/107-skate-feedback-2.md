# Plan 107 — the skate's feedback, round 2

Asked 2026-11-18 after plan 106 ("Much better!"):

> 1- Remar está bem estranho, ele da umas remadas mega curtas bem rapido diversas vezes, ta estranho, poderia colocar
> ele para remar só segurando o shift que ele começa a remar
> 2- Algumas vezes eu acabo caindo do mapa quando vou pousar com o skate apos um pulo com o mesmo

Status: **built 2026-11-18.**

## 1. Pushing: Shift held, whole strokes

**Why it was short and fast.** The push was a flag, not a stroke: it was on while the speed was under the target and
off above it, so round the top it flickered on and off each frame or two, and the pose's push restarted each time.
Under 1.3 m/s an auto-kick pushed by itself up to 3 m/s and stopped: a short push every second or so with no key held.

**Now** (`packages/shared/src/skate/step.ts`):
- Shift held on the flat pushes (a flat part of a piece too: the half-pipe's bottom, a deck). W no longer pushes.
- No auto-kick: let go, she glides and slows.
- A push is a whole stroke of 0.8 s (the push clip's own length), always finished. The speed comes while the foot is
  on the ground (the stroke's 15–65 %), never past the top (11 m/s). Another stroke follows while Shift's held and
  she's 0.6 m/s or more under the top, so at the top she rides and pushes again now and then, never flickering.
- Shift keeps its ramp jobs. A press on a ramp is the revert or break vert, as before. Shift held over from pushing
  on the flat isn't a break at the lip: press it again on the ramp for a spine transfer or to break vert.

Measured in the game: 0 → 4.6 m/s in the first stroke, ~10.5 m/s after three, each stroke 0.8 s; let go, a glide
(10.1 → 9.5 m/s over 1.2 s).

## 2. Falling through the map after a jump

**Why.** In the air, "over the park" (the step falling freely and landing only on a piece) was any point inside a
piece's plan box. A corner's, a hip's or a bowl's box holds bare ground outside its turn, and every box is 5 cm wider
than its piece. Coming down there, nothing caught her: she fell under the ground, and once under it the world's mover
can't lift her back.

**Now:** over the park means over a piece's riding surface itself (`SkatePark.over`); elsewhere the mover lands her
on the ground. A test lands an ollie on bare ground inside a corner's box (it fails on the old code).

## Checks

The skate's Node tests (35; the push test now checks whole strokes, W not pushing, no auto-kick), the shared suite
(767), tsc (shared, client, server), biome; in the game, a push probe (strokes, speeds, the glide) and the direction
e2e (nose 2.0°, body 1.5°, camera 28.8°). The e2e probes push with Shift now.

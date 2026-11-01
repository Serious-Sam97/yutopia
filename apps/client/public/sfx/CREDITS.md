# Sound credits

- `lift/door-open.mp3`, `lift/door-close.mp3` — *Elevator Door* by PagDev,
  https://opengameart.org/content/elevatordoor (CC0). Cut to 1.7 s, levelled,
  mono; the close is the opening reversed.
- `car/*.mp3` — the engine: *The Dyno Sessions: 190E* by Chippy569 (Track
  Time Audio), a Mercedes-Benz 190E-16V on a dynamometer,
  https://freesound.org/people/Chippy569/packs/9658/ (CC0). Loops at about
  1,000 / 2,500 / 6,300 rpm with no load (`*-off-lo|mid|hi`: Freesound
  162515, 162518, 162521 by the exhaust — `ex-` — and 162516, 162519, 162522
  in the engine bay — `bay-`) and at about 1,300 / 2,550 / 6,200 rpm at full
  load (`*-on-lo|mid|hi`: 162506, 162509, 162512 and 162507, 162510,
  162513); `start` is 162528 (23_StartISmall_D6). Cut from the HQ previews,
  levelled to −20 dB RMS each (the game sets their mix), mono 96 kb/s. The
  revs are measured from each loop's firing frequency, not taken from its
  label (the "500" full-load one runs at ~1,290). Their seams are crossfaded
  as they're decoded.
- Everything else (`lift/chime`, `lift/button`, `lift/ride.wav`,
  `stairs/step-1..4`, `stairs/door-open`, `stairs/door-close`) — made for
  Yutopia by `tools/sfx-synth.mjs` (`node tools/sfx-synth.mjs` makes them
  again). A recorded one dropped in under the same name replaces it.
- `steps/*` — the steps (docs/plan/63-the-steps.md), picked by ear on `/dev/steps` 2026-11-01 from
  55 candidates. All CC0: cut into single steps (Freesound's HQ previews, by onset) or trimmed
  (OpenGameArt's, already single steps), levelled to about −22 dB, mono 80 kb/s; black ice plays
  ice's. `wood-*` *Wood Steps* by Phil25 (Freesound 208104); `hollow-*` *Footsteps on hollow wood*
  by florianreichelt (Freesound 459970); `carpet-*` *FootstepsCarpet* by MindlessTrails (Freesound
  509534); `tile-*` *Footsteps on Tiles* by RutgerMuller (Freesound 50725); `concrete-*` *Footsteps
  on concrete* by florianreichelt (Freesound 459964); `rock-*` *Stone Steps* by Phil25 (Freesound
  208103); `asphalt-*` *footsteps shoes walk road asphalt hard* by kyles (Freesound 637556);
  `grate-*` *Walking_and_running_on_a_steel_floor (sound samples)* by SoundsofTheMachine (Freesound
  809440); `sheet-*` *Footsteps On Metal* by IENBA (Freesound 834029); `earth-*`
  *Footsteps_6_Dirt_shoe* by monte32 (Freesound 353799); `felt-*` *FOLEY_Footsteps_Carpet_001* by
  conleec (Freesound 148466); `snow-*` *Footsteps or Walking in Hard Crunchy Snow* by mshahen
  (Freesound 559459); `deep-*` *Snow shoe steps (41, via qubodup)* by Corsica_S (OpenGameArt,
  41-snow-shoe-steps); `packed-*` *Walking in snow (42 steps, via qubodup)* by Corsica_S
  (OpenGameArt, 42-snow-and-gravel-footsteps); `ice-*` *Walking on Crunchy Ice (01/30/2014)* by
  courter (Freesound 447822); `slush-*` *Footsteps on slush* by xkeril (Freesound 611278).

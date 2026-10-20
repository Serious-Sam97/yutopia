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

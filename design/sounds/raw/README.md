# Sound originals (CC0) — drop the downloads here

The elevator's and the stairs' recorded sounds (docs/plan/26-floor-transitions.md).
Put each file here **as downloaded** (any name is fine); they're cut, levelled
and encoded into `apps/client/public/sfx/` (small mono MP3s), and the originals
stay out of git.

In the meantime every one of these is synthesised (`node tools/sfx-synth.mjs`,
made 2026-10-19 while Freesound was down): a recorded original only needs to
replace the matching file in `public/sfx` when it's better.

From Freesound (needs a free account to download):

| For | Freesound page |
|---|---|
| Arrival chime | https://freesound.org/people/gristi/sounds/562188/ |
| Ride hum (a loop is cut from the travel) | https://freesound.org/people/Julien_Matthey/sounds/112354/ |
| Panel / call button | https://freesound.org/people/paulfabb/sounds/579078/ |
| Steps on concrete stairs | https://freesound.org/people/itinerantmonk108/sounds/553902/ |
| Fire door: push bar and opening | https://freesound.org/people/wlabarron/sounds/475312/ |
| Fire door: closing | https://freesound.org/people/wlabarron/sounds/475313/ |

Already in: the elevator doors — PagDev, *Elevator Door* (OpenGameArt, CC0):
`public/sfx/lift/door-open.mp3`, `door-close.mp3` (the opening reversed).

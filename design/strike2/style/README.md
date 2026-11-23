# The Strike Park — the style guide (plan 115 phase 59)

Our own look for a CS-inspired mode: the rules and readability of a competitive shooter, nothing of its art.

## Palette
| Use | Colour |
|---|---|
| Raiders (attack) | signal amber `#e8a33a` (dark `#8c6323`) |
| Wardens (defence) | steel blue `#6fa3c7` (dark `#3e5d72`) |
| Paper, ink on dark | manila `#e9dcc0`, cream `#f3ead8` |
| Iron (panels) | `#1e2321` → `#313834` |
| Walnut edge (the game's family) | `#5a3a24` |
| Health low, danger | `#e06a52` · money, good | `#9cc46a` |

## Type
Stencilled headings: a condensed heavy grotesque (Avenir Next Condensed / Arial Narrow), uppercase, tracked
0.12–0.24 em. Body: the game's own body face. Numbers in the HUD: the stencil face, large.

## UI
- Menus are the game's panels (`hud.panel`), full screen over a blurred, tinted world; iron panels with a walnut edge.
- Every control has rest, hover, focus, pressed and disabled states; a selected card carries an amber "SELECTED" tag.
- Paper tags (manila, slightly rotated) for notes on cards.
- The HUD's plates match the menus; nothing of the world's dock or quick bar shows in a match.

## Maps (arc H)
- Each map is a place with an identity (a mill town, a rail yard, a hotel, an office tower, a lakeside, a range)
  and its own climate (F3): two hot, two wet, two snowy.
- Readability first: buildings drawn by the Blender kits (the town's buildings kit, the park's prop kit), the
  floors the climate's ground, sites painted (a stencilled letter in a hazard border), callouts named on the radar.
- Cover pieces are real objects (containers, crates, logs, wagons, barricades), never bare boxes.
- One landmark per area (the covered bridge, the gantry, the lift station, the boathouse).

## Sound (arc J)
Recordings from the repo's CC0 library for blasts and fire; synthesized electronics (beeps, keypads); voices in our
own words by the browser's voice; positional, muffled through the map's walls.

## Never
CS's logos, icons, fonts, maps, layouts, models, textures, sounds or names. No screenshots of it in the repo.

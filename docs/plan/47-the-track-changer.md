# 47 — The track changer (planned 2026-10-27; decided)

The user's ask: "a sign of the map next to the karts that you interact with, you select a track,
and it changes the real world's track". This is the plan: what's there today, the sign, how the
park changes in the world, the phases, and what's the user's to decide. Nothing is built yet.

## What there is today

- **One circuit**: the Figure Eight (794 m), 18 control points in the park's frame
  (`packages/shared/src/kart/park.ts` `CONTROL`), memoised as `kartTrack()`. Its bridge, its jump,
  item rows, boost pads, the grid and the checkpoints are found on it by place (`sOf`).
- **Everything reads that one circuit**:
  - the server: the race, Vortex, the crates, the laps (`features/karts.ts`, `kartTrack()` once at
    start);
  - the client's kart module (`kart/karts.ts`), the 3D park (`tp/karts3d.ts`: asphalt, kerbs,
    barriers, banks, the bridge, the kicker, pads, the gantry), the iso land picture
    (`art/kart-iso.ts`), the plans (`kart-plan.ts`), the floodlights' places (`kartFloods`);
  - **the ground itself**: what's asphalt underfoot and what's walked round (the bridge's ramps) —
    `kartSurfaceAt` / `kartWalkBlocked`, cached in the Grounds' 16 m chunks (`groundsChunk`) on the
    server and every client.
- **The park's state** (`KartPark`: phase, mode, laps, Vortex's level, the record) has no layout.
- **What's built along the start straight**: the stands, the tower, the gantry, the grid. If
  every layout runs down the same start straight, none of them moves. That is the plan's first
  rule.

## The sign: "THE CIRCUITS" board in the paddock

- **Where**: in the paddock, against the shed's front by the rack of karts (the user's "next to
  the karts"), facing the walk from the gate. Both views.
- **What it is**: a walnut-framed map board, like the lap records' board:
  - the park's outline (the fence, the stands, the bowl, the bridge), the **current track** drawn
    on it in cream with its start line and direction arrows;
  - its name and length ("THE OVAL · 550 m"), and a strip "NEXT RACE: THE OVAL · 3 LAPS";
  - lit after dark (the paddock's glow).
- **Using it**: stood by it, the X prompt "Choose the track". It opens a panel in the HUD's skin
  (ink in walnut frames):
  - a card each layout: its map drawn from its data (the same drawing as the board), name,
    length, what it has (bridge, jump, hairpins), its lap record and who holds it;
  - a "Reverse" switch (phase 5);
  - "Set this track". Greyed out with the reason when it can't change now (a race on, a kart on
    the track).
- **Rosa** (race control) calls it out when it changes: "New circuit: the Oval!" — and the desk's
  board shows it.

## How the world changes ("the real world's track")

All of it reads one value, the park's layout, from the room's state:
1. **The server** (`kart:layout { key, reverse }`): checked (phase lobby; nobody on the track —
   karts back in the rack or free-lapping get put back on the new grid), then
   `park.layout = key`. The race, Vortex, crates and laps take `kartTrack(key)` from then on.
   Kept with the world, so a restart keeps it.
2. **The ground**: shared `setKartLayout(key)` swaps the circuit `kartSurfaceAt` and
   `kartWalkBlocked` read, and drops only the park's chunks from the Grounds' cache
   (`groundsChunk`): they're rebuilt with the new asphalt and ramps. The server does it as it
   sets the layout; each client as the change reaches it.
3. **The 3D park**: rebuilt for the new layout a little a frame (no hitch: as the park is
   streamed in today), the old one shown until the new is ready, then swapped.
4. **The iso**: the park's land picture repainted (its chunks only), the park's sprites placed
   again.
5. **The show** (optional, decision 5): the park closes for ~10 s — Rosa's call, the plough runs
   the new line clearing the snow (the plough from Vortex's items, `items3d.ts plough3d`), the old
   asphalt drifts over, the tyre walls hop to their new places. Without it: the swap is at once.

## The layouts

Every layout: the same start straight (the stands, tower, gantry and grid stay), inside the fence,
clear of the bowl, the stands, the tower and the paddock, a radius a kart can take, crossing itself
only at the bridge. Each a list of control points, its jump/items/pads placed on it, its
checkpoints and its own lap record.

| Layout | Length | What it is |
|---|---|---|
| **The Figure Eight** | 794 m | today's: the bridge, the jump on the north straight |
| **The Oval** | ~550 m | fast, slipstream racing: two long straights, past the stands and back along the north fence; no bridge |
| **The Switchback** | ~900 m | technical: a chicane after the start, two hairpins round the bowl's south side, under the bridge's span |
| **The Long Way** | ~1.1 km | round the park's edge: two jumps, over the bridge |

With "Reverse" on each: eight races. Sketches of each, from the data, in the plan's sheet before
any 3D (phase 1).

## The bridge (the hard part)

It stands in the middle with 60 m ramps; layouts that don't use it have to pass it.
- **(a) every layout uses it**: simplest, but every layout looks alike in the middle;
- **(b) it comes and goes with the layout**: the most freedom; the ground under it changes too
  (the riskiest part);
- **(c) it stays as scenery, a deck you can walk on** (like the river's bridges): layouts that
  don't use it pass beside it or under its span; the ground round it set once. **Recommended.**

## Phases

1. **The layouts as data** (shared): `KART_LAYOUTS` (key, name, control points, the jump/items/pads,
   bridge or not), `kartTrack(key)` memoised a key; tests a layout (closed, inside the fence, clear
   of the stands/bowl/tower/paddock, its tightest turn, its grid on the start straight, Vortex laps
   it at every level, lap times sensible). Plan sheets of each. *Playable in the sim already.*
2. **The park's layout in the world**: `KartPark.layout`, `kart:layout`, the server's race on it,
   kept with the world; `setKartLayout` and the park's chunks rebuilt (server and clients); the
   record a layout.
3. **The board and the panel**: the sign in the paddock (3D and iso), the X prompt, the panel's
   cards, Rosa's call, the desk's board.
4. **The park redrawn live**: the 3D stage rebuilt over frames and swapped, the iso repainted;
   floodlights placed for every layout (along the fence) or a set each.
5. **Reverse**, and the bridge as a deck (way c).
6. **The show** (if wanted), stills and plans of each layout, e2e: change it at the board in both
   views, a race on each, walking where the old asphalt was.

Rough size: phases 1–3 are about one of the karts' earlier phases each; 4 is the biggest. Phases
1–2 alone give a changeable track in the sim and on the server, before any art.

## Decided (the user, 2026-10-27)

1. **Who, when**: anyone at the board, when the park's quiet (no race, nobody on the track).
2. **The layouts**: the four (the Figure Eight, the Oval, the Switchback, the Long Way), each
   with Reverse: eight races.
3. **The bridge**: way (c) — it stays, a deck you walk on; layouts without it pass beside or
   under it. **Changed after phase 6** (the user, seeing the Oval run past a ramp to nowhere by
   the grid): way (b) — the bridge only for a layout over it (the Figure Eight, the Long Way).
4. **The change**: the ~10 s show (Rosa's call, the plough cutting the new line, the old asphalt
   drifting over, the tyre walls moving).
5. **Kept** (not asked; the plan's default): the chosen track stays until someone changes it, and
   survives a restart.

Next: phase 1 (the layouts as data, their tests and plan sheets), shown before anything in the
world changes.

## Phase 1 — the layouts as data (done 2026-10-27; nothing in the world changed)

- **The data** (`packages/shared/src/kart/park.ts`): `KART_LAYOUTS` (key, name, a line for the
  board, control points in the park's frame, the bridge taken `both` / `under` / `none`, the jumps,
  item rows and pads by place), `kartTrack(key, reverse)` memoised a layout and way round.
  `kartTrack()` is today's Figure Eight, unchanged to the byte (its test checks it).
  - Every layout runs down the Figure Eight's own start straight: one that doesn't take the
    bridge both ways goes through samples of it a few metres apart, so the line, the grid, the
    gantry and the stands' view are where they are. The Long Way, which takes the bridge both
    ways, shares the Figure Eight's own points round the bridge, so its road over and under is
    the bridge's road to the centimetre.
  - Reversed: the lap the other way round from the same line; over the bridge is decided by the
    bridge's own road, not by which crossing comes first.
  - `Track` gained `key`, `reverse` and `jumps` (every jump; `ramp` is still the first).
- **What the bridge means**: its ramps are a wall across the park's middle, from the start
  straight's east end (A) to the north (B). The Oval goes round both ends; the Switchback round A
  and once under the span; the Long Way, like the Figure Eight, over it and under it (a loop that
  goes over must come back under: there's no going over once and home round the ends).
- **The checks** (`kart/layout-check.ts`, `kart-layouts.test.ts`, 17 tests): each layout, either
  way round — inside the fence, clear of the bowl, the stands, the tower, the paddock, the bridge's
  walls (on its road, or under its span), nowhere within a road's width of itself (but over it), no
  turn under 9 m, on the start straight (the line within 1 m), a jump on the flat; and Vortex laps
  it twice at Easy and Hard, Hard the faster.
  - The first Switchback had a chicane right off the straight that Vortex flew into the bank at
    (68 s and 120 s laps): an S now. Its hairpins were opened up to ~10–15 m.

| Layout | Lap | Vortex Hard / Easy (s) | Reversed | Bridge |
|---|---|---|---|---|
| The Figure Eight | 794 m | 30.4 / 39.2 | 34.7 / 39.3 | over and under |
| The Oval | 722 m | 31.4 / 35.7 | 30.9 / 35.4 | round its ends |
| The Switchback | 828 m | 37.9 / 42.8 | 37.6 / 42.0 | under its span |
| The Long Way | 837 m | 33.7 / 40.5 | 35.5 / 40.5 | over and under |

- **The sheets**: the game's park plan (`kart-plan.ts` `drawParkPlan(c, layout, reverse)`), the
  bridge drawn whatever's raced; `/dev/karts?shot=park-plan&layout=oval&reverse=1`. In
  `design/screens/karts/layouts/`.
- **Found for later phases**:
  - The park's room is the Figure Eight's: the Long Way can only be ~840 m (not ~1.1 km), and it
    reads as the Figure Eight let out — the user's call whether to keep it.
  - Some floodlight masts stand at the new roads' edges (the Oval's north straight, the Long Way's
    east jump): phase 4 places them for every layout, as planned.

## Phase 2 — the layout in the world's state, the ground made for it (done 2026-10-27)

- **The park's state**: `KartPark.layout` and `reverse`. The server's race, Vortex, the crates, the
  laps and the grid take `kartTrack(layout, reverse)` (`features/karts.ts` `raceLayout`); karts out
  on free laps go back on the new grid.
- **Changing it**: `kart:layout { layout, reverse }` — only in the lobby with nobody in a kart (the
  user's rule), and **an admin's only until phase 4** (the park's still drawn as the Figure Eight:
  a race on the Oval now shows karts on the snow). The board (phase 3) will send it.
- **Kept**: in the park's record (the API keeps it in the world's settings as it is):
  `record.layout`, raced again after a restart. **A record a layout**: `record.best` stays the
  Figure Eight's; `record.bests["oval"]`, `["oval-r"]`… the others'. The lobby shows the raced
  layout's ("HOUSE RECORD · THE OVAL").
- **The ground**: shared `setKartLayout` / `kartTrackNow` (the layout raced, one a process: the one
  world), and the Grounds' `setParkLayout`, which drops the park's chunks and the tiles' surfaces
  kept for walking — made again with the new asphalt. What's walked round doesn't change: the
  bridge's ramps are the Figure Eight's, whatever's raced (way c). The server's land worker is told
  the layout, and a chunk it made for the one before isn't taken (`layoutVersion`). Clients follow
  the park's state (`car/cars.ts`, near the park or not; the kart module: my laps, my kart's world,
  the crates, the minimap).
- **Checked**:
  - shared: the ground follows the layout (the Oval's own stretch asphalt once raced, snow again
    after; what's walked round unchanged; an unknown key: the Figure Eight);
  - server: `karts` 10 (a member can't; an admin can, in the lobby; the record keeps it; the ground
    on the server; a kart taken goes on the Oval's grid; not with a kart out; back);
  - e2e `kart-layout`: Ana changes it to the Oval, a Grand Prix on the autopilot round it — 8 karts
    home — and back to the Figure Eight.

## Phase 3 — the board and the panel (done 2026-10-27)

- **The board** (shared `KART_THINGS` "circuits", by the rack's south end, its face to the way in
  from the gate; on a tile's middle, so its tile's walked round): walnut posts, a cap with its snow
  and a lamp; its face (`tp/kart/park3d.ts` `circuits`) the layout raced — its name and length, its
  map, "NEXT RACE: OVAL · GRAND PRIX · 3 LAPS" — lit after dark. The iso draws a board with a loop of
  road on it (`gr_k_circuits`; the layout raced since phase 4).
- **Painted live**: the kart module paints the board's face and the desk's strip ("NEXT: OVAL GP 3
  LAPS") again when the layout, the mode or the laps change (the stage's `kart-circuits` and
  `kart-desk-vfd`, their canvases in `userData`).
- **The map** (`kart/track-map.ts`): the park's fence, the bowl, the stands, the paddock, the bridge
  (on the road where it's raced, scenery where not), the circuit in cream, its start line and the
  way round. The board and the panel's cards draw it.
- **The panel**: stood in front of the board, X "Choose the track": a card each layout (its map,
  name, line, length, the bridge, its jumps, its record), Reverse, "Set this track" (greyed, saying
  why: a race on; someone out on the track; until phase 4, "the crew's still laying the other
  circuits" for anyone not an admin). Esc, Close or walking off closes it.
- **Rosa** calls it out: "New circuit: The Oval!".
- **Checked**: shared 336; server `karts` 10 (with Rosa's call); e2e `kart-circuits` 2 (both views:
  the prompt, the panel's four cards, their maps drawn, the Oval set from it, the board and the
  desk painted with it, Rosa; the Figure Eight set again).

## Phase 4 — the park redrawn live, open to everyone (done 2026-10-27)

- **3D**: the circuit is its own part of the park's stage (`tp/karts3d.ts` `buildCircuit`: the road,
  its centre line, kerbs, the start and the grid, the banks, the tyres, the jumps and the pads, a
  part a step). The Grounds build the layout raced a part a frame (their pending steps) and swap it
  in for the old one in one frame, nothing missing between (`grounds3d.ts` `kartCircuit`). The
  bridge stays the Figure Eight's whatever's raced — its own asphalt and line on it (way c).
- **Iso**: the park's chunks are painted again, one a frame, when the layout changes, their things
  shown again; the board of the circuits shows the layout raced (it was a loop of road).
- **The floodlights**: one set of 18 masts for every layout (`kartFloods`): ~10–15 m off the
  nearest of the layouts' roads, clear of all of them, the bridge's ramps, the bowl, the stands,
  the paddock and the tower; every stretch of every layout (the bridge's deck too) within ~36 m of
  one, the Figure Eight's ramp's foot ~40 m.
- **Anyone's**: the server takes `kart:layout` from anyone in the lobby with nobody in a kart; the
  panel no longer says "the crew's still laying the other circuits".
- **Measured** (GPU, Ana in the park, each layout set in turn): the swap's worst frame 50 ms in 3D,
  33 ms in iso. (A 350 ms frame in a first probe was the probe's own aerial picture.)
- **Checked**: shared 337 (the floodlights off every road and every layout lit); server `karts` +
  `park-life` 13 (a member sets it); client unit 36; e2e `kart-circuits`, `kart-layout`,
  `kart-park`, `kart-play`, `kart-stands`, `kart-sound`, `park-life` 15 (the night race's last wait,
  back to the lobby, timed out once in the full run and passed alone: 50 ms, 60 fps); page 560.6 KB
  ≤ 561.

## Phase 5 — the other way round, the bridge a deck (done 2026-10-27)

- **Reversed** (looked at in both views, the Figure Eight each way): the kicker, the pads' chevrons,
  the grid and the start line already follow the lap's way. What didn't:
  - the gantry over the line is the park's (built once): when the layout's swapped in, it's turned
    to the lap's way and put on its line (`grounds3d.ts` `kartCircuit`) — its lights face the grid;
  - reversed past the bridge (the Figure Eight, the Long Way), the grid's last row sits on its ramp's
    foot (0.14 m up): its lines are drawn on the road's height there, not under it;
  - where the circuit's road meets the bridge's (each ramp's foot) a strip of snow showed across
    the road — 1 m the usual way, up to 2 m reversed (the two roads' samples a metre apart, offset):
    the bridge's road runs 3 m on over the circuit's, the same asphalt.
- **The bridge a deck** (the user's choice: over it only). The land has one height a place, so
  over and under the span both would mean the walking grid knowing your height (its core,
  everywhere); instead:
  - shared `kartDeck` / `kartDeckAt` (`kart/park.ts`): the Figure Eight's raised stretch, whatever's
    raced — its ramps and span are a road at its height (the Grounds' `deckAt`, so `heightAt`, the
    walk, people's heights, both views);
  - its sides where it's up (over 0.3 m) a guard strip 1.6 m wide nobody walks (`DECK_RAIL`), as the
    river's bridges: whoever's on a tile of the deck stands on it, whoever's past the strip on the
    land. **Under the span is no longer walked** — the road under it is cut at its sides; the karts
    still race under it;
  - its asphalt underfoot whatever's raced.
- **Iso**: the bridge drawn up at its height (`grounds-iso.ts` `parkBridge`): a mesh piece every
  1.5 m — its road and centre line, the parapets, the walls down to the ground on the camera's side,
  under the span the deck's edge, open below, and the ramps' end walls —, each sorted with people and
  things by its far corner (whoever's on it over it, whoever's behind it under it; see-through when
  I'm behind it). The land's picture keeps its shadow; the circuit's road isn't painted under the
  raised stretch.
- **Walked** (GPU, both views): from the ramp's foot up to the span's top (2 → 7.65 m, smoothly),
  down the other ramp, and beside it on the land (2 m).
- **Checked**: shared 337 (the walk in the park: up a ramp, over and down, a step at a time, its
  height and asphalt; the guard strip; the land past it); server `karts` + `park-life` 13; client
  unit 36; e2e `kart-*` and `park-life` 15 (night race 33 ms, 60 fps); page 560.6 KB ≤ 561, the
  Grounds' chunk 161.1 KB.

## Phase 6 — the show, the sheets, the last e2e (done 2026-10-27)

- **The show** (shared `KART_SHOW`: 10 s): a change of layout shuts the park — no kart taken ("The
  ploughs are out: the new circuit's nearly there"), no race started, no other change; the board's
  panel says "The ploughs are out: a moment." Rosa: "New circuit: The Oval! Ploughs out!".
  - **Four ploughs** — the Grounds' own plough truck (`Vehicle` "plough": the 3D model with its
    beacon and spray, the iso's), one a quarter of the new circuit each, 0.6 s → 9 s in (~24 m/s),
    gone at 10 s; the server drives them (`features/karts.ts` `showTick`) and says how far they are
    (`KartPark.showing`, `show` 0..1).
  - **3D**: the new circuit drawn behind them — its sweeps' triangles in the order the ploughs get
    to them (`karts3d.ts` `makeSweep`, `userData.reveal`), drawn to their phase, every quarter
    that far; the rest (the start line, the grid, the kickers, pads, tyre walls) as a plough passes
    the nearest of the circuit —, lifted 2 cm over the old (no flicker where they're the same road).
    The old one whitens to the snow's colour, its lights out, and goes at the end
    (`grounds3d.ts` `showBegin` / `kartShow`).
  - **Iso**: the park's chunks painted again as a plough gets to each; the rest at the end.
  - **Found and fixed**: the 3D land under the circuit kept the old asphalt's grey once the old road
    was gone (its streamed blocks colour from the surface, made once). The land inside the park
    never takes the circuit's asphalt now — the circuit's own meshes are its road (`grounds-stream.ts`
    `landColour`) —, so a change leaves no trace and shows no new road ahead of the ploughs. (Phase
    4's swap left the same trace.)
- **Double-checked** (a review of the code, then fixed):
  - a swap with no show on (the first build after the show's over — a tab in the background through
    it —, or any later one) left the new circuit out of the Grounds' night light: the old one was
    removed in the same build step, so the step's "what's new" came back empty. The old one goes a
    step later now;
  - the ploughs' and the iso karts' heights: since the bridge is a deck, the land's height under its
    span is the deck's — a plough on the road under the span (the Figure Eight's, the Long Way's) was
    drawn on it, in 3D and iso, its spray too, and so was an iso kart. The server says the ploughs'
    height (`Vehicle.y`), the kart module the karts' (their pose); in iso whatever's under the span
    is sorted behind the bridge's pieces;
  - the show's one-off parts (the line, the grid, kickers, pads, tyres) found their place on the lap
    in the view's frame, not the circuit's (off by the floor's offset): the circuit's own now;
  - the old circuit's kerbs, chevrons and line (a texture or vertex colours: no whitening) go once the
    rest is white;
  - iso: the bridge's pieces destroyed with the iso Grounds (they were left behind when the floor's
    offset changed); no metre of snow at a ramp's foot (the flat road runs on under the pieces);
  - the same layout set again: no show, and Rosa says nothing.
  - **Checked**: a swap with no show forced (the page frozen through it): the new circuit's 13
    materials all lit (0 of 13 before the fix); the plough under the span drawn under it in both
    views; shared 337, server 13, client unit 36, e2e `kart-*` and `park-life` 14 of 15 — the night
    race's last wait (back to the lobby after X, its frames already measured) timed out in the full
    run as it did in phase 4's, and passed alone (33 ms, 60 fps); page 560.6 KB ≤ 561.
  - **Measured** (GPU, in the park): the show's worst frame 50 ms in 3D, 33 ms in iso.
- **The sheets**: the eight plans again (`design/screens/karts/layouts/park-plan-layout-*`, the
  Switchback's both ways new) and a still of a race on four of them from above
  (`kart-layout-*.png`).
- **e2e**:
  - `kart-circuits` (both views): the Oval set from the panel, the show — the park shut, four
    ploughs, the panel saying so, the new road part drawn (3D: 0.44 half way) —, then where the
    Figure Eight's asphalt was: snow underfoot, and to look at (3D, straight down: 152 against the
    Oval's road's 59); the Figure Eight set again.
  - `kart-layout`: a Grand Prix on the autopilot on the Oval, the Switchback reversed, the Long Way
    and the Figure Eight reversed — each changed to, its show waited out, eight karts home.
- **Checked**: shared 337; server `karts` (the show: shut, the ploughs on the Oval, gone after) +
  `park-life` 13; client unit 36; e2e `kart-*` and `park-life` 15; page 560.6 KB ≤ 561, the
  Grounds' chunk 161.3 KB, the karts' 23.1 KB.

## After phase 6 — the bridge only where it's raced over (done 2026-10-27)

The user, on the Oval: the bridge stayed on the track, its ramp a wall of ground nobody could walk
on, running beside the start straight to nowhere — confusing. Their call: the bridge only for a
layout that goes over it (way b of "The bridge"), not for the Oval or the Switchback.

- **Shared**: `KartLayout.bridge` is `both` or `none` (the Switchback's `under` gone: it crosses
  the park's middle where the span was, its blurb says so); `kartBridged()`; the bridge's deck
  (`kartDeck`, so the Grounds' `deckAt` and `heightAt`, the guard strips walked round, its asphalt)
  only while a layout over it is raced. The park's land is made again with the layout, so on the
  Oval or the Switchback the land where the ramps and span stood is walked on at its own height,
  snow. The layouts' check keeps a layout off the ramps only when it has them.
- **3D**: the bridge (its road, walls, parapets, underside, piers, name boards) one group,
  `kart-bridge`, shown for a layout over it; in the show it sinks 8 m under the snow as the ploughs go
  (or rises out of it), shown or not at once when there's no show (`grounds3d.ts`).
- **Iso**: the bridge's pieces shown for a layout over it, faded out or in through the show
  (`grounds-iso.ts`); its shadow painted on the land only then (`kart-iso.ts`).
- **The board and the sheets**: the cards say "over the bridge" or "no bridge"; the maps and the plan
  sheets draw the bridge only where it's raced (the four sheets of the Oval and the Switchback again).
- **Checked**: shared 337 (the Oval: no deck where the span stood, its height the land's, its guard
  strips walked, snow; the Figure Eight again: the span 5.6 m up, its strip not walked); server 13;
  client unit 36; e2e `kart-circuits` both views (half way through the show to the Oval the bridge at
  −3.5 m; after it none drawn, the land where the span was walked; back on the Figure Eight, up
  again); `kart-layout`, `kart-park`, `kart-play`, `kart-stands`, `park-life` 11 of 12 — the bowl's
  battle's last wait (back to the lobby after X, its smashes seen) timed out in the full run, as the
  night race's did before, and passed alone; page 560.6 KB ≤ 561.
- **Double-checked** (a review of today's three changes, then fixed): a circuit mid-swap (being
  built, or the old one waiting a step to go) freed if the 3D Grounds go with it; a change that
  comes before this client saw the last one's show out ends that show at once (it ran backwards
  for a moment); an iso Grounds made mid-show no longer fades out a bridge it never drew.
  **Checked**: typecheck everywhere; shared 338, the whole world-server 102, client unit 36; e2e
  `kart-circuits`, `kart-park`, `kart-play`, `park-life` 12 (the night race 59.5 fps: its earlier
  38 fps was a browser of the user's open on the machine); page 560.6 KB.

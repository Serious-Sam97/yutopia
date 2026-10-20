# The dark — phase 0 mocks (docs/plan/30-the-dark.md)

Four stills and a sound shortlist, for approval before any gameplay code.
The story/lore chapter is deferred, so nothing here shows pages, the reader or
objectives.

## The stills

Each one is a render of the real Grounds (`tp/grounds3d.ts`, the stills'
night preset from `tp/grounds-shots.ts`), with the game's own 3D people, lamps,
shadows, falling snow and the torch as a real spot light. Drawn on top, and
**not** engine art yet:

- **the shroud**: soft dark smoke particles on the body, streaming off it and
  pooling on the snow, with a hot edge and embers where a focused beam burns
  it. This stands in for D5's shroud shader (dissolve noise and smoke);
- **the poses**: aim (from plan 29's `aimPose`), crawl, kneel, lurch, windup,
  recoil and guard are set by hand for the still, not animated;
- **the HUD**: drawn in 2D over the frame (a paintover), not UI code. The
  layout, colours and Portuguese strings are the proposal.

They were drawn by a throwaway `/dev/dark` page, removed after rendering.

| | In-engine | Mock |
|---|---|---|
| `01-woods-burn` | **The woods at night**: on the ravine trail, Cai focuses his torch on one of the shadowed, a man in a blazer and glasses. Its long shadow falls on the snow behind it. | The shroud burning off on the beam's side (an orange-white edge, embers), the dark driven off its far side, tendrils on the snow. A recoil pose with an arm over its face |
| `02-hud-night` | The south woods' trail: Ana with the revolver and a focused torch on one already **exposed** (no shroud: his office shirt in the beam). Bia focuses one further off, which is burning. A flare burns red in the snow | **The HUD**: bottom right are the battery (FOCO, 46%, with what focusing is eating in amber), the revolver's cylinder (4 of 6 loaded, the next one marked, +9 .38), and the flares (1). Health is the dark-red vignette, stamina the arc by the body (55%), cold the frost at the edges. Bia's tag shows her distance and health. The beam's reticle is a small ring |
| `02-hud-night-clean` | The same frame without the HUD | — |
| `03-revive` | The clearing trail: Duda is down, crawling, her drag marks behind her. Bia kneels by her with her hand on Duda's back and her phone's torch on the snow. Cai stands guard, his focus on one in the trees | **"Segure X para levantar Duda"**, the ring 60% full of its 3 s. Above Duda is the downed sign: a red cross with what's left of her 30 s (0:19). Cai has a tag. Bia's HUD shows the shotgun's two shells (1 loaded, +3) and 2 flares |
| `04-lamp-standoff` | The clearing's lone lamp at night: three players inside its pool by the bench, back to back. Cai and Ana focus outwards, Bia crouches. Five shadowed wait at the pool's edge, one winding up | The shadowed's shrouds and their tendrils reaching for the light but stopping at it. The one Cai's beam is on is burning. HUD: "Na luz · seguro" said once at the top, battery low (21%, red), 6 loaded with +2 left, no flares |

## Seen while making them (for phases 3–4 and 8)

- **The shroud reads only against light.** Black smoke on a night forest is
  invisible. It shows when there is lit snow behind it: the focused beam's spot
  landing beyond the figure, or a lamp's pool. That suits the game, since you
  find them with the torch, but their **emerge** needs its sting and the
  whispers to be noticed at all.
- **The smoke must be drawn towards the eye**, a little in front of the body.
  Otherwise the body swallows the puffs inside it.
- **A beam's haze must stop at what it hits.** A cone drawn past the figure
  washed it out.
- **A focused beam shows as a hard round spot** on the trees behind its
  target. That's right, and it's a good tell of where a teammate is focusing.
- **Players need a little light of their own at night** to read as teammates
  (an emissive of ~#1a2130 on the lit body). In the over-the-shoulder hero shot
  that's too much, and the player should stay a silhouette.
- **Bloom's threshold goes up at night** (0.72 here): the snow under a focused
  beam bloomed over everything.
- **A flare's light**: a point light of ~6 over 11 tiles is enough. More
  than that turns the whole frame red.
- Trees crossing the view are left out of the stills. The game's camera fades
  them, as for the Grounds.

## Sound

See [sounds.md](sounds.md): 19 synthesised WAVs in `sounds/`, made by
`sounds/synth.mjs`. They cover the drone (calm and hunted), whispers, the
emerge sting, the focus on and its hum, the burn's sizzle, the shield breaking,
the dissolve, the heartbeat (70 and 120), the revolver (shot, load, dry), the
shotgun (shot, pump), the flare (strike, burn) and a strike landing.

## Approved (2026-10-20)

Phase 0 approved. The open questions, decided by the user:

| Question | Decision |
|---|---|
| Inventory when you wake at the office | **Kept**: you keep everything you carried (as the plan proposed) |
| Where the guns come from | **The gatehouse locker gives you a revolver**. The shotgun, and the ammo beyond what the plan allows, stay loot |
| Town interiors | **Not safe**: danger applies inside the town's buildings too (the plan had proposed danger 0 there). Inside the HQ is still always safe |

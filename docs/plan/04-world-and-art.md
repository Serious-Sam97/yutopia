# 04 — World & Art Direction

## Concept: "The Studio Building"

Yutopia is a recording-studio building from 1984 that's a little too big on the inside.
It keeps Yondra's language: Yondra is the cassette deck, Yutopia is the studio.

- **Palette:** walnut, cream, amber VFD, rust, olive. Warm lamp light, no neon, no green LCD.
- **Materials:** wood panelling, acoustic foam, brushed aluminium, felt, cork boards, tape reels.
- **Light:** each room has a few warm sources (desk lamps, VFD displays, a window). Day/night from local time.

## Rooms (first map)

| Room | Purpose | A/V rule |
|---|---|---|
| Lobby / reception | spawn, space picker, notice board | open |
| Main floor ("Tracking Room") | desks for everyone, board walls | open, proximity |
| War Room | meetings, big screen with the board | private area |
| Vocal booths ×3 | 1:1s / focus | private, knock to enter |
| Stage ("Live Room") | demos, all-hands, sprint review | stage = broadcast |
| Standup corner | daily standup ritual | private area |
| Lounge / arcade | casual, arcade cabinet, lo-fi radio | open |
| Server room | Vortex's lair. Don't. | ??? |

## Isometric spec

- 2:1 dimetric tiles (e.g. 64×32 base), objects on a separate sorted layer, sorted by foot position.
- Walls in front of the player fade (cutaway) so you're never hidden.
- Furniture as multi-tile objects with a collision footprint, defined in Tiled.

## Avatars

- 8 directions (or 4 mirrored to 8), animations: idle, walk, sit, talk (subtle bob), wave, emotes.
- Layers: body · skin tone · hair · top · bottom · accessory (headphones, cap, glasses) · colorways.
- **Production route (open decision):** model low-poly characters in Blender and render every
  direction/frame to sprite sheets → perfectly consistent 8-direction sprites, easy to add outfits.
  Hand-drawn is prettier but much slower to extend.

## Sound

- Room tone per area, footsteps on wood vs carpet, door thunks, tape-stop when you mute.
- Lo-fi radio object: synced playback, everyone nearby hears the same song.
- Everything goes through one mixer with master/voice/ambient sliders (this also closes MK-V's open "audio mixer" item).

## Image-first process

For every room and the avatar set: mock image → your approval → build → match the image.
Mocks go in `yutopia/design/`.

# The height — what's up there can't touch what's down there (done 2026-10-27)

Ask (2026-10-27, flying as an admin — docs/plan/48-the-admin.md): "When you fly high the camera
dont follow, also i can interact and take a hit with the things on the ground, the game dont
have layers?? Precisamos rever essa estrutura, a altura das coisas deve contar."

## Where we were

The world is layered in two ways, and only one of them counted:

- **Floors** are real layers. Each storey is its own map (`levels.ts`); people on another floor
  are out of reach, out of earshot (but for the stairwell) and out of view in iso.
- **Height within a floor** barely counted. A player has feet at `z` (tiles), the grid knows
  the height of what's under them (`grid.groundAt`: a floor, the land's rise, a table's top),
  and the move sim, the 3D view and the server's `pos` check all use it — but almost every
  *reach* was measured across the floor only: `Math.hypot(p.x - x, p.y - y) <= REACH` (a mug
  from the machine, a seat, a car's door, the lift's call, a pet, a shade's strike, a car's
  knock, a high-five…). Until flying, nobody could be more than a jump off the ground, so it
  never showed.
- The guns (`arms.ts`: the muzzle's height against the target's body) and the pool balls
  (`pballs.ts`: a body's box, crouched or standing) were already height-aware.
- The 3D chase camera rode 55% of the way up with a jump (to see yourself go up); flying high,
  that left you above the top of the screen. The iso camera didn't follow height at all.

## The rule

**Aloft**: feet more than `ALOFT` = 2 tiles over whatever is under them (shared
`move/spec.ts` `ALOFT`, `isAloft`). Above any jump's top (a hop 0.8, a flip, a vault onto a
box — standing on the box, the box is what's under you), so only flying puts anyone there.
Aloft, nothing down there is in reach of you, and you're out of reach of it.

Held in three places:

- **The world server** (`WorldRoom.on`): every message that's a hand on something in the world
  — taking a mug, sitting, a console, the lift, a door, a lamp, a computer, a pet, a toy, the
  shuttle, a bay, a car's door, a kart, the stands, the dark's loot and revives (`TOUCH`) — is
  dropped from someone aloft (`aloft_refused_total` in the metrics). One list, not a check in
  each feature: a new feature's message goes on it.
- **Harm from below**: a shade's strike (`dark.ts`), a car's knock (`cars.ts`) and every social
  act but a wave (`social.ts`: hands don't meet across it, either way) skip anyone aloft.
- **The client**: aloft, no prompt, no highlight, no queued action, no click on a thing
  (`controller.ts` `aloft()`; the same 2 tiles inline — the page carries no more of shared).

The cameras: the 3D chase camera rides a jump 55% of the way as before, and everything above
`ALOFT` all the way (`tp/view.ts`); the iso camera rises with whoever's more than 2 tiles up
(`engine.ts`).

## Checks

- `world-server/src/admin.test.ts`: a flier 6 tiles up can't high-five or be high-fived; a wave
  still reaches them; back on the ground, the high-five lands.
- Live, in 3D beside a parked car: "Drive" offered on the ground, gone 7.9 tiles up, back on
  landing; the camera keeps the flier in frame.
- The page: 574,419 B of 574,464 (the powers' HUD sync moved into the admins' chunk to make room).

## Not done

- Reaches are still flat *within* the ground band: from the floor you reach a mug on a table
  as before (the table's top is under 2 tiles). A real 3D reach per thing (a shelf's top, a
  lamp on a high wall) would need each feature's reach to name a height; nothing needs it yet.
- Flying up into the floors above doesn't put you on them (docs/plan/48-the-admin.md).

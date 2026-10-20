# The dark — the Grounds after dark, survived together (plan — decided 2026-10-20)

> Follows `27-the-grounds.md` (the land, dark nights, the torch, blizzards)
> and `29-the-move.md` (aim, roll, stamina's sprint). Workflow rule: mocks
> first (phase 0), approved before any code; **the fight's feel is signed off
> (phase 4)** before the guns and the mystery go on top.

Ask (2026-10-20): "Inside the building, the Sims-like mechanics continue. But
outside I want a survival mystery: Alan Wake + Ruptura (the Apple TV show) +
a zombie game."

## Where we are

- **The land**: the Grounds (`shared/grounds.ts`): a kilometre of snow, woods,
  the ravine, the pond, the town with its diner, market and bar. The outdoors
  is level 0 of the one map; outside = `level === 0 && grid.onLand(x, y)`.
- **The dark**: truly dark nights off the lit paths; lamps of four kinds
  (`LAMPS`); **the torch** (F, the phone) synced as `Player.torch`, a cone in
  both views. Whether a spot is lit is answered only on the client
  (`view.ts` `landTint` :2234, `grounds-iso.ts` `lightAt` :430).
- **The hour is each player's own clock** (`new Date()`, `controller.ts`
  :2659); the server's Vortex and pets read the server's clock (likely UTC).
  Night isn't the same for everyone.
- **Weather**: blizzards timed by the server (`shared/weather.ts`).
- **Life outside**: a night guard on a fixed loop, the visitor's car, the
  shuttle (`features/grounds-life.ts`). Nothing hostile.
- **No health, no damage, no inventory**: one thing carried (`held`: a mug), a
  full needs/XP/mind engine but for pets only (`shared/pets.ts`, `mind.ts`).
- **AI to build on**: the pets' walk, `goNear` and repath (`features/pets.ts`
  :318–360), Vortex's stalk (`features/vortex.ts` :109–190), `findPath` works
  outdoors.

## The idea

**By day the Grounds are uneasy; by night they're hunted.** People from the
company — still in their office clothes, wrapped in a dark that moves — come
out of the woods. The dark is their armour: hold your torch on one, focus it,
and the shroud burns off; then it can be hurt, and you have six rounds. Lamp
posts are islands nobody shadowed can enter; a flare makes one for twelve
seconds. You go out together. When one of you goes down, the others have
thirty seconds to get to you; if nobody does, you wake up at your desk —
"Você acordou no escritório". In the town, the woods and the boathouse there
are pages of a story about what the company did, and fuses for the broken
lamps: every lamp you fix stays lit, for everyone, for good. **Inside the
building it's always safe**: the Sims-like office life goes on there.

## The mechanics

### D1 — The hour and the danger

- **The São Paulo clock, held by the server**: `shared/clock.ts` `spHour(ms)`
  (UTC−3; no daylight saving since 2019; checked against `Intl` at boot).
  `state.hour` is set every second; `mod:hour` for admins, like `mod:storm`.
  Both views, Vortex and the pets read it.
- **`shared/danger.ts`** `dangerAt({hour, storm, x, z, lit, indoors})` → 0..1:

| | Danger |
|---|---|
| Day | ~0.2 (stragglers in the deep woods and in storms) |
| Dusk · dawn | a ramp |
| Night | 0.8 |
| Blizzard | + up to 0.25 |
| The woods | × up to 1.3 (`treeDensity`) |
| Near the HQ's doors | × 0.5 |
| **Inside the HQ · a lamp pool · a flare** | **0** (the town's buildings are not safe) |
| A blackout (rare, hashed, like storms) | every lamp on the Grounds out for a few minutes |

### D2 — Vitals

`shared/vitals.ts` — health, stamina, warmth, battery (0–100), settled by the
server from your gait and its tick. The decay helpers come out of the pets'
`settleNeeds`, so the office's needs can share them later.

| | Drains | Comes back |
|---|---|---|
| health | a strike: 25 | +1/s after 8 s unhurt, to 60; first aid to 100 |
| stamina | sprint 16/s, a roll 22 | +25/s after 0.7 s; at 0 the sprint is a jog |
| warmth | 0.6/min outside at night (×2 in a storm) | lamps, indoors, a car's heater; at 0 stamina comes back at half — **cold never kills** |
| battery | focusing 12/s | slowly to 40% unfocused; a battery fills it |

On `Player`, for the team's HUD: `hp`, `st`, `wm` (uint8).

### D3 — What you carry

`shared/inventory.ts`: **two weapons, six pockets**, stacks.

| Item | Use |
|---|---|
| revolver | 6 rounds, reloaded one at a time (0.35 s each, interruptible) |
| shotgun | 2 shells (0.6 s each), 8 pellets |
| .38 rounds · shells | scarce: a budget per night |
| flare | thrown on an arc; 12 s, 6 tiles: they can't come in, the ones inside burn and flee |
| battery | the torch to 100 |
| first aid | health to 100, or get yourself up when down (5 s) |
| fuse | fixes a broken lamp |
| pages | the story (kept, read in the reader) |

Sent only to you. Picking one up clears the mug. **Loot spots** by place
(town houses, the boathouse, the shed, glove boxes) refill on timers. Saved
through the API (`survivors`: inventory, vitals, pages), debounced as pets
are.

### D4 — Light is the weapon

- `shared/light.ts`: `beamAt(src, p)` — one cone test for both views and the
  server (replaces `landTint`'s and `lightAt`'s); `poolAt(x, z)` from `LAMPS`,
  live flares and fixed lamps; line of sight through `grid.clear` and the
  trunks.
- The torch points where you look: `yaw` and `pitch` (plan 29) go to everyone;
  others' beams no longer snap to 8 directions.
- **Focus** (aim): the beam narrows and reaches (14 tiles, half-angle 0.2),
  drains the battery, and burns.

### D5 — The shadowed

Server-run (`features/dark.ts`), their mind pure and tested
(`shared/dark/fsm.ts`).

1. **dormant** — not yet.
2. **emerge** — 1.2 s of the dark gathering into a shape: the warning.
3. **stalk** — closes, circles at 4–6 tiles, flanks.
4. **windup** — 0.55 s, plain to see: **roll** through it.
5. **strike** — lands if you're within 1.3 tiles and not mid-roll.
6. **recover**.
7. **burning** — under a focused beam: the shield falls 45/s, it slows by half.
8. **exposed** — shield gone for 4 s, then it grows back: only now do bullets
   hurt.
9. **flee** — from pools, flares, the dawn.
10. **dissolve** — dead: a burst of light.

- **They see** 20 tiles at night, 10 by day, with line of sight; crouching
  halves it; nobody in a pool is seen. **They hear** a sprint at 8 tiles, a shot
  at 40. They leave the downed, the away and the do-not-disturb alone.
- **The director**, per group of players near each other: up to
  `min(40, ⌈players × 3 × danger⌉)`; they come out of the dark 25–45 tiles
  away, behind your beam if it can, never in a pool, a building or near the
  HQ; one per 4 s at most; a **tension** meter builds waves and gives quiet
  after a fight. Far for 20 s, or dawn: they go.
- **Walking**: straight with two whiskers while they can see you (most of the
  open land); A* only when blocked, in a small box, **at most 3 a tick**, again
  every 1.5 s. Full mind at 20 Hz within 40 tiles of someone, 4 Hz beyond. The
  land only — never inside.
- **Sent** only to whoever is outside within 70 tiles (Colyseus **StateView**;
  a capped broadcast if that misbehaves).
- **Look** (`yutopia-dark`, lazy): the people model in office clothes, a
  shroud shader whose strength is the shield (dissolve noise, smoke), their own
  poses (a lurch, a twitch, the windup).

### D6 — Guns and flares

- **You aim, the server decides.** `fire {w, ox, oy, yaw, pitch, mt}`: the
  weapon, the ammo it counts, the rate, the muzzle within a tile of where it
  has you; it **rewinds** the shadowed to what you saw (a 1 s ring at 20 Hz,
  now − 110 ms − half the ping, ±0.5 tile) and casts the ray.
- Only an exposed one is hurt; a shielded one throws a spark and a ricochet.
  **No friendly fire.**
- The flash and the tracer show at once on your screen; the hit comes back
  (`hit {id, n}`).
- Flares: `Flare {id, x, y, until}`, lit on the land like a lamp.

### D7 — Down, up, awake

- **At 0**: down, crawling (0.6 t/s), 30 s to bleed out.
- **Up**: someone holds X by you (1.5 tiles) for 3 s — a hit stops it — and
  you're back at 35; or your own first aid in 5 s.
- **Awake**: no one came — the screen goes black and you're at the HQ lobby,
  50 health, warm. "Você acordou no escritório." You keep what you carried.
- Away or asleep outside at night: down once, then woken at the office.

### D8 — The mystery (later: the story's chapter comes after the rest, the user's call 2026-10-20)

- `shared/dark/lore.ts`: pages (`{id, chapter, place, night?, pt, en}`) and
  objectives as small graphs of steps. The company's story in our own words —
  no names from the shows.
- **Chapter 1**: pages in the woods, the ravine, the boathouse, the town; fuses
  for the driveway's broken lamps; the substation at the end. **A lamp you fix
  stays a safe island, for everyone, saved in the world.**
- The world's progress is shared (`state.story`, saved); your pages are yours.
- A reader on the phone (lazy): the pages like a manuscript.

### D9 — Sound and the screen

- Synthesized on `GroundsSound`'s scheduler: a drone that rises with danger
  and nearness, whispers (formant noise), a sting when one emerges, the focus
  hum and the burn's sizzle, a heartbeat under 30, the guns (synth first, a
  shortlist of CC0 to audition).
- **A quiet HUD**: battery, the cylinder or shells, flares — bottom right.
  Health as a vignette and a heartbeat; stamina an arc that shows only while
  it drains; cold as frost at the edges. The team: tags with distance, the
  downed sign, "segure X para levantar".

## Controls (outside, on top of plan 29)

| | Keyboard | Gamepad |
|---|---|---|
| Aim · focus | right mouse | LT |
| Fire | left mouse | RT |
| Reload | R | X (when nothing to use) |
| Flare | G | RB |
| Weapon | 1 · 2 · wheel while aiming | Y |
| First aid | — (from the pockets) | d-pad ↓ |
| Revive | hold E · X | hold X |
| Pages · objectives | J | View |

## Together

Everyone outside shares the same night, the same shadowed, the same lamps.
The server owns health, stamina, ammo, damage, the shadowed, down and up, and
the inventory; the client is trusted with its aim and, within the allowance,
its steps. An admin `mod:dark {peaceful | normal}` switches the threat off
fast.

## Phases

| # | Phase | Needs | Exit test |
|---|---|---|---|
| 0 | **Mocks**: the woods at night, one shadowed under a focused beam; the HUD; a downed player and a reviver; a standoff at a lamp's edge; the sound shortlist | — | approved, in `design/screens/dark/` |
| 1 | **The hour + danger** | — | `spHour` and `dangerAt` tests; two browsers in different time zones see the same light; `mod:hour` |
| 2 | **Vitals, pockets, loot, saving** | 1 | a sprint drains stamina and the allowance falls to a jog; loot taken once; pockets survive a restart (Pest) |
| 3 | **Light, shared**: one `beamAt`, the aimed torch, focus, battery | 29's phase 3 | A's focused beam on B the same on both screens |
| 4 | **The shadowed + damage** | 1, 3, 29's phase 2 | `dark.test.ts` (`YUTOPIA_DARK_FAST`): out of the dark, never in a pool; the windup rolled through; focus exposes; a flare holds them off; gone at dawn. **You fight them and sign off the feel.** 50 bots + 40 shadowed: tick ≤ 4 ms; ≤ 6 KB/s outside, ~0 inside |
| 5 | **Guns + flares** | 4, 29's phase 4 | the rewind: an honest late hit counts, a ray from elsewhere doesn't; A exposes, B shoots |
| 6 | **Down, up, awake** | 2, 4 | A goes down, B gets them up; alone, you wake in the lobby |
| 7 | **Chapter 1** — *later* | 1 | pages kept; a fixed lamp is safe for everyone after a restart |
| 8 | **Sound + HUD** | 4–6 | matches the mocks |
| 9 | **Checks** | all | page ≤ 554 KB, `yutopia-dark` ≤ 80 KB, ≥ 60 fps on High in the woods at night with 20 shadowed and 4 flares, Firefox, PROGRESS |

Phases 1 and 0 can go beside plan 29's phase 1; phase 2 beside 29's phases
2–3. Chapter 1 (the pages, the reader, the lamps to fix) waits until the rest
is in.

## Risks

| Risk | Answer |
|---|---|
| The page's budget (~0.4 KB) | all of it in `yutopia-dark`, loaded outside only |
| The server's tick (4 ms) | a spatial hash, distance before line of sight, 3 A* a tick, far ones at 4 Hz; `perf.mts` with bots outside at night |
| Bandwidth | the shadowed, loot and flares through StateView; `Player` grows ~7 bytes |
| StateView is new here | prove it first thing in phase 4; a capped broadcast behind it |
| The office is for working | inside is always safe; the day is calm; `mod:dark peaceful` |
| Iso | the fight is 3D first: a drawn gun switches to 3D; the shadowed drawn in iso from the same model |

## Decided (2026-10-20)

| Topic | Decision |
|---|---|
| Who | **Co-op, one shared world**: the server runs the shadowed |
| The hour | **The real São Paulo clock**, the server's; night is dangerous, the day less |
| The fight | **Light, then guns**: focus the torch to burn the shield, then shoot; scarce ammo; flares and lamps are safe |
| Dying | **Down, and the others get you up**; else you wake at the office |
| Ruptura | **Mood and mystery**: the company's lore, pages, the office's cheer against the dread — no split selves |
| Order | after plan 29's controls; **the story's chapter later**, after phases 1–6 and 8–9 |
| Waking at the office | **you keep what you carried** (phase 0's review) |
| The guns | **the gatehouse locker gives you a revolver**; the shotgun and more ammo are loot |
| Town interiors | **not safe**: the danger goes on inside the town's buildings; inside the HQ is always safe |

## Proposed (yours to overrule)

| Topic | Proposal |
|---|---|
| A drawn gun in iso | switches to 3D |
| The cold | never kills; it only slows stamina |

## Still open

- Shadowed animals (crows, dogs) as a second kind, later?

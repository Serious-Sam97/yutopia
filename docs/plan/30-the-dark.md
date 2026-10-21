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
| health | a strike: 15 (25 until 2026-10-21) | +1/s after 8 s unhurt, to 60; first aid to 100 |
| stamina | sprint 16/s, a roll 22 | +25/s after 0.7 s; at 0 the sprint is a jog |
| warmth | 0.6/min outside at night (×2 in a storm) | lamps, indoors, a car's heater; at 0 stamina comes back at half — **cold never kills** |
| battery | focusing 12/s | slowly to 40% unfocused; a battery fills it |

On `Player`, for the team's HUD: `hp`, `st`, `wm` (uint8).

### D3 — What you carry

`shared/inventory.ts`: **four quick slots, six pockets**, stacks. (It was two
weapon slots until the quick slots, below.)

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
4. **windup** — 0.8 s (0.55 until 2026-10-21), plain to see: **roll** through it.
5. **strike** — lands if you're within 1.3 tiles and not mid-roll.
6. **recover**.
7. **burning** — under a focused beam: the shield falls 60/s (45 until 2026-10-21), it slows by half.
8. **exposed** — shield gone for 12 s (4 until 2026-10-21), then it grows back slowly: only now do bullets
   hurt.
9. **flee** — from pools, flares, the dawn.
10. **dissolve** — dead: a burst of light.

- **They see** 20 tiles at night, 10 by day, with line of sight; crouching
  halves it; nobody in a pool is seen. **They hear** a sprint at 8 tiles, a shot
  at 40. They leave the downed, the away and the do-not-disturb alone.
- **The director**, per group of players near each other: up to
  `min(60, ⌈players × 5 × danger⌉)` (raised from 40 and × 3 on 2026-10-21;
  by day only those off the paths count — see "More of them, and the day"); they come out of the dark 25–45 tiles
  away, behind your beam if it can, never in a pool, a building or near the
  HQ; one per 4 s at most; a **tension** meter builds waves and gives quiet
  after a fight. Far for 20 s, or dawn: they go.
- **Walking**: straight with two whiskers while they can see you (most of the
  open land); A* only when blocked, in a small box, **at most 3 a tick**, again
  every 1.5 s. Full mind at 20 Hz within 40 tiles of someone, 4 Hz beyond. The
  land only — never inside.
- **Sent** only to whoever is within 70 tiles, indoors too, to be seen through
  the windows (Colyseus **StateView**; a capped broadcast if that misbehaves).
  Only those outside are their prey or struck.
- **Look** (`yutopia-dark`, lazy): the people model in office clothes, a
  shroud shader whose strength is the shield (dissolve noise, smoke), their own
  poses (a lurch, a twitch, the windup).

### D6 — Guns and flares

- **You aim, the server decides.** `fire {w, ox, oy, yaw, pitch, mt}`: the
  weapon, the ammo it counts, the rate, the muzzle within a tile of where it
  has you; it **rewinds** the shadowed to what you saw (a 1 s ring at 20 Hz,
  now − 110 ms − half the ping, ±0.5 tile) and casts the ray.
- Only an exposed one is hurt; a shielded one throws a spark and a ricochet.
  ~~No friendly fire.~~ One of us is a target too, at half the damage (see
  "The office armed").
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
| Quick slot (a weapon out, a use, a flare) | 1 · 2 · 3 · 4 | Y while aiming: the next weapon |
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
| The page's budget (~0.4 KB) | all of it in `yutopia-dark`, loaded outside, or a few seconds in when the page is idle |
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

## Phase 0 — mocks: delivered and approved (2026-10-20)

In `design/screens/dark/` (its README has the details):

- **Four stills**, each a render of the real Grounds at night with the game's
  own people, lamps, shadows, snow and the torch as a spot light. The shroud,
  the hand-set poses and the HUD are painted on top; they aren't engine art
  yet. A throwaway `/dev/dark` page drew them and was then removed.
  - `01-woods-burn`: a focused beam burning one's shroud on the ravine trail.
  - `02-hud-night` (and `-clean`, without the HUD): the HUD. Bottom right:
    the battery (FOCO), the revolver's cylinder with its spare rounds, the
    flares. Health is a vignette, stamina an arc by the body, cold a frost at
    the edges, and the team has tags.
  - `03-revive`: a downed player, a reviver, "Segure X para levantar".
  - `04-lamp-standoff`: three players in a lamp's pool, five shadowed at its
    edge.
- **The sound shortlist** (`sounds.md`): 19 synthesised WAVs made by
  `sounds/synth.mjs`. They cover the drones, whispers, the emerge sting, the
  focus, the burn, the shield breaking, the dissolve, the heartbeat, both guns,
  the flare and a strike. Notes on the mix for phase 8 are there too.
- **Seen while making them**, kept for phases 3, 4 and 8:
  - The shroud reads only against light, so the emerge needs its sting.
  - The smoke is drawn towards the eye.
  - A beam's haze stops at what it hits.
  - Players need a faint light of their own at night.
  - Bloom's threshold goes up at night.
  - A flare is a point light of about 6 over 11 tiles.
- **Approved**. The user's answers are in the Decided table: you keep what you
  carried when you wake at the office; the gatehouse locker gives a revolver;
  the town's interiors are not safe.

## Phase 1 — the hour and the danger: delivered (2026-10-20)

- **`shared/clock.ts`** `spHour(ms)`: São Paulo's hour by arithmetic (UTC−3,
  `SP_OFFSET_H`), defined before the epoch too.
  - The world-server checks it against `Intl`'s `America/Sao_Paulo` at boot
    and warns if they're more than a minute apart (`index.ts`), in case Brazil
    brings daylight saving back.
- **The server holds the hour**: `WorldState.hour` (float32) is set every
  second, from the same 1 s timer as the weather (`clockTick`).
  - `mod:hour {h}` (admins only, offline too) sets an hour. The clock runs on
    from it for six hours, then it's São Paulo's again; `{h: null}` returns at
    once.
- **Everyone reads the server's hour**:
  - **The client**: `controller.updateNight` follows `state.hour` once a second
    (before joining, `spHour` of its own clock). A jump, such as an admin's
    new hour, is taken at most an hour per second. The light, iso
    (`engine.setClock`) and 3D (`tp.setHour`) take it.
  - **The wall clocks** run on this machine's seconds, offset by however far
    it is from the world's hour.
  - **Vortex and the pets** read `room.state.hour` (they read the server
    machine's clock before).
- **`shared/danger.ts`** `dangerAt({hour, storm, x, z, lit, inHQ})` → 0..1, as
  D1's table:
  - `nightness(hour)` ramps over 5–7.5 h and 17.5–20.5 h, the same hours as
    the light's dawn and dusk.
  - The woods multiply by `treeDensity`. Near `HQ_DOORS` the danger is halved,
    easing back over 40–50 tiles.
  - It is 0 only in the HQ or in the light. The town's buildings count as
    outside, as decided.
  - **Blackouts**: `blackoutIn(window)` and `blackoutAt(ms, hour)`, hashed
    per two-hour window like the storms. One window in ten has one; it lasts
    3–6 minutes and happens only after dark.
  - **Nothing in the game reads it yet.** The director (phase 4) and the drone
    (phase 8) are its readers.
- **Tests**:
  - `clock.test.ts`: the offset, before the epoch, and a year against `Intl`
    (summer and winter).
  - `danger.test.ts`: day, the ramps, night, no step round the clock; storm,
    woods, the doors; zero in the HQ and the light, but not in the diner; the
    blackouts.
  - `world.test.ts`: two clients see the same hour; a member can't set it; an
    admin's hour reaches both, and `null` brings São Paulo's back.
- **Not done: the exit test's two browsers in different time zones.** There
  is no e2e with a Playwright `timezoneId` per context. The client takes its
  light only from `state.hour`, and `world.test` shows two clients get the
  same hour, so it should hold. The e2e should still be written.

## Phase 2 — vitals, pockets, loot, saving: the shapes (decided 2026-10-20)

The user's answers to the proposal:

| Question | Decision |
|---|---|
| The pockets strip | **mocked first** (`05-pockets`) |
| Stamina only outside | **yes**: the office's sprint stays free |
| Dropping weapons | **weapons can be dropped**, like everything else |
| Loot across a restart | **kept**: the spots, their timers, the night's budget and what lies on the ground are saved |

### `shared/vitals.ts`

```ts
export interface Vitals { hp: number; st: number; wm: number; bat: number } // 0..100, floats
export interface VitalsClock { sinceDrain: number; sinceHurt: number; winded: boolean } // s, s
export interface VitalsIn {
  gait: Gait;        // what the body did this tick (shared/move): sprint drains
  outside: boolean;  // level 0 on the land or the lot
  night: number;     // danger.ts nightness(hour), 0..1
  storm: number;     // 0..1
  warm: boolean;     // indoors (any building: the town's too), in a lamp's pool, in a car
  focus: boolean;    // phase 3; false until then
}
export const VITALS = {
  st: { sprint: 16, roll: 22, regen: 25, after: 0.7, unwind: 25 },
  hp: { regen: 1, after: 8, upTo: 60 },
  wm: { night: 0.6 / 60, storm: 2, warmUp: 20 / 60, coldRegen: 0.5 },
  bat: { focus: 12, regen: 0.25, upTo: 40 },
};
export function stepVitals(v: Vitals, c: VitalsClock, i: VitalsIn, dt: number): void;
export function spendRoll(v: Vitals, c: VitalsClock): boolean; // false when winded
```

- **Winded**: at 0 stamina you're winded until it's back to 25. While winded
  the sprint is a jog and the roll is refused. Without that, holding Shift at
  0 would flicker between sprint and jog every 0.7 s.
- **A roll** needs you not to be winded, and takes 22 (down to 0 if you have
  less).
- **Stamina drains only outside**, as plan 29's M1 says. Indoors the office's
  sprint stays free, and stamina comes back everywhere.
- **Warmth** drains 0.6/min × nightness outside (×2 in a blizzard). A warm
  place brings it back at 20/min. At 0, stamina comes back at half speed.
- **The lamp pool** is a plain distance to `LAMPS` until phase 3's `poolAt`,
  and it's out during a blackout.
- **Shared with the pets**: `shared/needs.ts` gets `clamp100`,
  `drain(v, rate, t)` and `fill(v, rate, t, upTo)`. `settleNeeds` uses them,
  and `pets.test` stays as it is. The shared part is small: three helpers.

### `shared/inventory.ts`

```ts
export const ITEMS = {
  revolver: { weapon: true, mag: 6, ammo: "r38" },
  shotgun:  { weapon: true, mag: 2, ammo: "shell" },
  r38: { stack: 24 }, shell: { stack: 12 }, flare: { stack: 3 },
  battery: { stack: 2 }, aid: { stack: 2 }, fuse: { stack: 4 },
} as const;
export type WeaponId = "revolver" | "shotgun";
export type StackId = "r38" | "shell" | "flare" | "battery" | "aid" | "fuse";
export interface Weapon { id: WeaponId; loaded: number }
export interface Stack { id: StackId; n: number }
export interface Inventory {
  weapons: [Weapon | null, Weapon | null];
  pockets: (Stack | null)[]; // 6
  pages: string[];           // lore ids (phase 7): kept outside the pockets
}
export function addItem(inv: Inventory, id: WeaponId | StackId, n: number): number; // how many fitted
export function useSlot(inv: Inventory, slot: number): StackId | null;
export function count(inv: Inventory, id: StackId): number;
export function cleanInventory(x: unknown): Inventory; // for what comes from the API or a client
```

- **Taking items**: stacks top up the ones you have first, then fill an empty
  pocket. What doesn't fit stays in the spot.
- **Weapons**: one of each kind. Finding a second one gives you its rounds
  instead.
- **Anything can be dropped** (`drop`), weapons too, loaded rounds and all.
  It lies on the snow where you stand (`state.drops`) for anyone to take,
  for two hours.
- **Taking anything clears the mug** (`held`).

### On the wire

| Way | What |
|---|---|
| `Player` | `hp`, `st`, `wm`: uint8, rounded by the server (the team's HUD). About 1 byte a patch while you sprint |
| server → you | `pockets {inv, bat}`: the whole inventory as JSON (under 300 B), on asking and on every change. The battery is private, so it rides here and not on `Player` |
| server → you | `found {spot, got: Stack[], full: boolean}`: what a search gave ("Vazio" when someone was first) |
| you → server | `loot {spot}` (within 1.5 tiles, outside, not busy) · `pick {drop}` · `use {slot}` (first aid, battery) · `drop {slot}` (a pocket 0–5, a weapon 6–7) · `pockets?` (sent by the chunk once it's listening, so nothing arrives before there's a handler) |

### Stamina gates the move (both sides)

- **The client**: the walker runs `stepVitals` for stamina from its own gait,
  so the gate answers at once. When the server's `Player.st` is more than 10
  off, it takes the server's value. Winded sets `MoveInput.tired`, which
  already stops the sprint in `stepBody`, and it blocks `dodgePressed`.
- **The server**: a `features/survival.ts` tick (20 Hz) settles everyone's
  vitals.
  - **The gait it counts** is the faster of what `mv` says and the speed it
    measures over the last 0.25 s. A client that reports a jog while
    sprinting still drains.
  - **The allowance**: `speedCap(verb, spec, winded)` drops to jog × 1.15
    while winded, after a 300 ms grace for the message lag.
  - **The `jump` handler** spends a roll's 22 and refuses one while winded.
- **The perf bots outside** sprint until they're winded, then jog, reading
  their own `st`. `pnpm perf` stays at 0 put back with stamina in play.

### Loot (`shared/dark/loot.ts`, `features/loot.ts`)

```ts
export type Place = "house" | "boathouse" | "shed" | "glovebox" | "diner" | "market" | "bar";
export interface LootSpot { id: string; place: Place; x: number; z: number; refillMin: number }
export const LOOT: LootSpot[];    // from BUILDINGS' doors, TOWN_CARS' driver doors, INSIDES' counters
export const LOCKER: { x: number; z: number }; // the gatehouse's, a new "locker" fit
export function rollLoot(place: Place, rng: () => number, ammoLeft: { r38: number; shell: number }): Stack[];
export function nightOf(ms: number): number;    // São Paulo's night, 18:00–06:00, by its evening's date
```

- **The spots**: the 14 townhouses' doors, the boathouse's and the shed's,
  the town cars' glove boxes, and a counter or shelf each in the diner, the
  market and the bar. All of them outside, so none is safe.
- **The locker** gives a revolver to anyone who carries none. The first one
  a person ever gets comes with 6 loaded; after that it comes empty, so
  dropping it and going back is no source of rounds (the survivor record
  keeps `issued`).
- **Each spot is full or empty.** What's in it is rolled when it's searched,
  so the night's budget is spent at that moment.
- **Refills**: on a timer by place (a glove box 30 min, the rest 15–20),
  jittered ±25%.
- **The ammo budget per night**: .38 rounds 24 + 8 × the people who went out
  that night; shells 6 + 3 × the same. When it's spent, a search finds
  everything but ammo.
- **Kept across a restart**: the spots' timers, the night's budget and the
  drops go to the API as the world's `settings.loot` (`PUT
  /api/internal/world/loot`, debounced; `GET /world` gives it back).
- **No spot state on the wire**: a search tells you. Drops are on the wire
  (`state.drops`: id, x, y, level, item, n), since they must be seen. `YUTOPIA_LOOT_FAST` gives
  the tests refills in seconds.

### Saving: `survivors` (apps/api)

- **Table**: `id`, `user_id` (unique, cascades), `inventory` json, `vitals`
  json (`{hp, wm, bat}`: stamina always comes back, so it isn't saved),
  `pages` json, timestamps.
- **Internal routes** (signed, like the pets):
  - `GET /api/internal/survivors/{userId}` → `{survivor: {...} | null}`
  - `PUT /api/internal/survivors/{userId}` → an upsert. It's validated: known
    ids, `n` within the stack caps, at most 2 weapons and 6 pockets, vitals
    0..100, at most 200 page ids.
- **The model** is `Survivor`, with casts. The world-server's `api.ts` gets
  `survivor(uid)` and `saveSurvivor(uid, s)`.
- **The client's `api.ts` needs nothing**: your pockets come from the room.
- **Saving is debounced like the pets**: a dirty flag, at most every 30 s,
  and once more on leave. Offline, an in-memory map stands in.
- **Loading**: on join, for people (not bots). Until the record arrives,
  `loot` and `use` are refused.
- **Pest** (`SurvivorTest`):
  - a PUT then a GET gives the same pockets back (they survive a restart);
  - an unknown item or an overfull stack is a 422;
  - an unsigned call is refused;
  - deleting the user deletes the survivor.
  - phpunit.xml already forces in-memory SQLite (`force="true"`, in env and
    server), so the dev Postgres is safe.

### The client: the `yutopia-dark` chunk

- **Loading**: the input chunk imports it the first time you're outside, so
  the page itself gains nothing. It registers its strings with `addStrings`
  (PT and EN), its own room messages, and asks `pockets?`.
- **The stamina arc** by the body (3D and iso), as in `02-hud-night`. It
  shows only while stamina isn't full, and it's amber while winded.
- **The search prompt** near a spot: "Revistar · E", then a toast with what
  you found.
- **The pockets strip**: the four quick slots and six pockets, bottom right.
  **It isn't in the mocks**: `02-hud-night` shows the battery, the cylinder
  and the flares, not the pockets. It needs a mock first: it shows for 3 s
  after a pickup and while Tab is held; click to use or throw away; the pad's
  d-pad ↓ uses first aid.

### Tests

- **`vitals.test`**: a sprint empties stamina in 6.25 s; regen starts after
  0.7 s; winded until 25; a roll costs 22; the cold halves regen; the warmth
  rates; health back to 60.
- **`inventory.test`**: stacking, the caps, a second revolver gives rounds,
  full pockets take only what fits, `cleanInventory`.
- **`loot.test`**: every spot stands on walkable ground within reach; the
  budget holds.
- **`survival.test`** (world-server, `YUTOPIA_OFFLINE`):
  - a sprint outside drains `st`;
  - while winded a sprint-speed `pos` is put back and a jog passes;
  - two clients search one spot and only the first gets anything;
  - a refill comes back.
- **Pest**: `SurvivorTest`.
- **`pnpm perf`**: 0 put back.
- **Budget**: the page stays at 554.0; `yutopia-dark` is well under 80.

## Phase 2 — vitals, pockets, loot, saving: delivered (2026-10-20)

The user approved the shapes ("approved go"), with weapons droppable and the
loot kept across a restart. Built as decided above, with these differences:

- **The mock first**: `05a-loot` and `05b-pockets` in `design/screens/dark/`
  (painted in HTML over `/dev/grounds?shot=town-glovebox` and
  `02-hud-night-clean`). The game's strip reuses the mock's icons
  (`hud/icons.js` → `world/dark/icons.ts`).
- **Shared** (subpath `@yutopia/shared/dark`; `vitals` and `inventory` have
  their own subpaths, so the input chunk doesn't pull in the Grounds):
  - `needs.ts`: `clamp100`, `drain` and `fill`. `settleNeeds` uses them, and
    `pets.test` passes unchanged.
  - `vitals.ts`: `stepVitals`, `spendRoll`, `hurt`, `vitalByte`.
  - `inventory.ts`: `addItem` / `addStack` / `addWeapon`, `takeStack`,
    `removeSlot`, `consume`, `cleanInventory`.
  - `dark/loot.ts`:
    - the spots: 14 townhouse doors, the boathouse, the shed, 32 glove boxes,
      the diner, the market and the bar;
    - `LOCKER`, which needed a new `locker` fit in the gatehouse, drawn in
      both views;
    - `rollLoot`, `nightBudget`, `nightOf`.
  - `light.ts` `inLampPool`: the lamps' pools for warmth until phase 3.
  - `MV_WINDED` (32) in `pos`'s `mv`. See below.
- **The messages** are named `dark:*`:
  - you → server: `dark:hello` (the chunk is listening), `dark:loot {spot}`
    (a spot id, or `"locker"`), `dark:pick {id}`, `dark:use {slot}`,
    `dark:drop {slot}`;
  - server → you: `dark:pockets {inv, bat}`, `dark:found {spot, got, full,
    gone?}` (`gone`: someone emptied it first).
- **`features/survival.ts`** is a single feature: vitals, pockets, loot,
  drops, the locker and saving. It gives the room `survival.winded`,
  `.roll` and `.breathless`.
  - **Drops** are `WorldState.drops` (`Drop`). They're allowed out on the land
    only, and last two hours.
  - **The loot is kept** in the world's `settings.loot` through `PUT
    /api/internal/world/loot`: the spots' timers and leftovers, the night's
    budget and who went out, the drops. It's saved at most every 30 s and
    once more when the room closes. `GET /world` gives it back.
- **Staying in step with the client** (found by the e2e):
  - The client stops sprinting at exactly 0. The server's copy ends within
    one tick's drain of that, about ±0.8, and at 0.5 it was never winded and
    began to regenerate: the two disagreed.
  - Now the client sends `MV_WINDED` while it's out of breath. The server
    takes it at its word, because it only holds the player back.
  - The server still keeps its own count: winded at its own 0, with 300 ms of
    grace before the allowance falls to a jog.
  - **Speed fallback**: a measured speed over a jog's counts as a sprint only
    after a full second of it. A sprint's momentum on the ice after letting
    go isn't one.
- **The API**:
  - `survivors` (migration, `Survivor`, `DarkController`);
  - `GET`/`PUT /api/internal/survivors/{userId}`, validated: known ids, stacks
    within caps, loaded rounds within the gun, vitals 0..100, page ids;
  - `PUT /api/internal/world/loot`.
  - The dev database is migrated (one new table).
- **The client** is the `yutopia-dark` chunk (14.8 KB). The walker imports it
  the first time you're on the land; the controller only hands the walker
  itself (`new m.Walker(this)`).
  - **The walker** runs stamina on its fixed step. Winded sets `tired` and
    blocks the roll. When the server's `st` is more than 10 away, it takes
    the server's value.
  - **The chunk** draws:
    - the arc, sized to the body as drawn;
    - the prompt beside you, with a ring that fills over the 0.8 s search;
    - the toast with the items' icons;
    - the strip above the dock: 3 s after a pickup with "+n", while Tab is
      held, click to use, right click to drop;
    - drops as their icons on the snow (DOM, not meshes yet: phase 8).
  - **Keys**: E (whatever "use" is bound to) near something searches; the
    pad's X does too, and d-pad ↓ uses first aid (a new `aid` action).
- **Budget**: the page **553.9 KB**. The pets' refactor cost 85 bytes there;
  paying for it:
  - First person's facing code (and `DIR_ANGLE`) moved into the walker
    (`face`).
  - **Trap**: the walker importing a *value* from `@yutopia/shared` (the
    index) re-split the page's chunks: +156 bytes. `dirFromDelta` is passed
    in instead.
- **Tests**:
  - **shared**: 198 (`vitals`, `inventory` and `loot` tests are new).
  - **world-server**: 76, with `survival.test.ts`:
    - a sprint across the pond drains `st`;
    - while winded a sprint is put back, a roll is refused, and a jog passes;
    - a spot's loot goes to the first to search it and comes back on its
      timer;
    - the locker's revolver comes loaded, is dropped, is picked up by
      someone else, and comes empty the second time;
    - pockets are kept across a rejoin.
    - Two older tests failed once each under the full suite's load and pass
      alone: rooms' Vortex "personal lines are private" (it fails on main
      without these changes too), and the pets' "its mind" (a timeout).
  - **Pest**: 71, with `SurvivorTest`: saved then read back as they were (a
    restart loses nothing), what nobody could carry is refused, unsigned
    calls are refused, deleting the user deletes the survivor, the loot is
    kept in the world. The dev database had the same users before and after.
  - **`pnpm perf`**: 60 bots, a sixth of them sprinting laps of the pond with
    stamina; they ran out of breath 80 times in 30 s. **0 put back**, tick
    0.19 ms.
  - **e2e** (`dark.spec.ts`, iso; 3D with `YUTOPIA_VIEW=3p YUTOPIA_GPU=1`):
    - Shift+W across the pond until out of breath: the walker and the server
      both reach 0, the sprint becomes a jog, and the arc says so. Never put
      back.
    - A search at a townhouse door gives a toast; Tab shows the 8 slots.
    - 6 of 6 runs green.
    - With the GPU, the movement specs pass alongside it: `walk-angles`,
      `jump`, `first-person`, `mouse-look`, `move`, `move-others`,
      `controllers`. 10 passed.
- **Not done**:
  - Health has nothing to take it away yet (strikes are phase 4), and the
    battery has nothing to drain it (focus is phase 3).
  - Warmth runs but isn't shown: frost is phase 8's.
  - The team's tags (`hp` on `Player`) are phase 8's.

## Phase 3 — light, shared: delivered (2026-10-21)

The user: "go".

- **`shared/beam.ts`** (subpath `@yutopia/shared/beam`, pure: no Grounds in it,
  so the views load it as is):
  - `BEAM` holds the numbers: wide (10 tiles, half-angle 0.36) and focused
    (14, 0.2). Not aiming, the beam tilts down 0.16 rad onto the snow ahead.
    The phone is held at 1.2 tiles, or out at 1.35 while aiming.
  - `beamOf(x, y, z, yaw, pitch | null, focus)` and `beamAt(beam, x, y, z?)`:
    one cone test. With a height it's tested in 3D: aimed up, it passes over
    the snow and lights a face. `beamReaches(grid, beam, x, y)` checks the line
    of sight for the server in phase 4.
  - `shared/light.ts` keeps the lamps' pools (`inLampPool`).
- **Focus** happens when the torch is on, you're aiming (the right button or
  LT, 3D, outdoors), you're out on the land and there's battery left.
  - **The server** works it out each tick into a new `Player.focused`. The name
    `focus` was taken: it's heads-down at a desk.
  - **The battery** drains 12/s while focused and comes back to 40 at 0.25/s
    otherwise (`stepVitals`). A full battery lasts about 8 s of focus.
  - **The walker** predicts my own focus and battery, so the beam narrows the
    moment I aim. The server's battery (through `dark:pockets`) wins when
    they're more than 4 apart.
- **Both views draw beams from the same numbers**:
  - **3D** (`tp/view.ts` `torches`): the spot light and the haze cone point
    by the person's `yaw` (as they turned, not 8 ways) and, while aiming, by
    their `pitch`.
    - Focused, the cone scales to 14 × 0.2. The spot narrows, gets a harder
      edge (a round spot where it lands, as the mocks found) and is brighter.
  - **Iso** (`art/grounds-iso.ts`): the beam sprite turns by the same angle.
    It took the 8-way `d` before; now the people's states carry `angle`. The
    sprite is longer and narrower when focused.
  - **Who's lit** (3D `landTint`, iso `lightAt`) is `beamAt`, and brighter
    for a focused beam.
- **The HUD**: the FOCO bar from `02-hud-night`, bottom right under the
  pockets, while the torch is on outside or the battery isn't full.
  - What focusing eats shows in amber, and the bar turns red under 25%.
- **`mod:refill`** (admins): your own vitals full again, for trying things
  out (and for the e2e: the battery is kept between visits).
- **The page**: `focused` and `angle` on the people's states. It stays at
  554.0 KB (−46 bytes).
- **Tests**:
  - **shared**: 203, with `beam.test.ts`:
    - the wide and focused cones' reach and width;
    - in 3D, aimed up it lights a face and not the snow;
    - it turns with yaw;
    - a wall stops it.
  - **world-server**: 77, with a new `survival.test.ts` case: aiming without
    the torch isn't focus; with it, `focused` and the battery runs down; let
    go, it stops.
  - **e2e `beam.spec.ts`** (the exit test, two browsers, YUTOPIA_GPU=1). Ana
    focuses on Bia, 6 tiles off at 0.3 rad (not one of the 8 ways).
    - **The same beam on both screens**: from the same place within 0.15, the
      same height, the same way within a byte (0.04), the same pitch, focused
      on both.
    - **Bia lit the same** on both: within 0.08, over 0.3.
    - **Bia's iso** draws the same beam, focused.
    - **The battery** runs flat: then no focus, wide again on both.
    - 4 of 4 runs green.
    - **Trap**: a real key press in one browser blurs the other, and a blur
      lets go of everything held there (Ana's aim). Bia's T is sent into her
      page instead.
  - **`pnpm perf`**: 0 put back, tick 0.21 ms.
  - **With the GPU, in one run: 21 passed.** That's `walk-angles`, `jump`,
    `first-person`, `mouse-look`, `move`, `move-others`, `controllers`,
    `people-3d`, `grounds`, `dark` and `beam`.
- **Seen, not changed**:
  - **The 3D chase view of the pond at night reads pale.** `nightLevel` is
    0.98, but the moon on open snow from above is bright, much lighter than
    iso. Over the shoulder (aiming) it reads as night. It's a tuning question
    for phase 8 or 9.
  - **Next to the phone the beam's start is a hard white blob** in 3D (the
    cone's narrow end, added on). Phase 8 can soften it.

## Phase 4 — the shadowed and damage: built (2026-10-21), awaiting the feel's sign-off

The user: "start phase 4".

- **The mind**, `shared/dark/fsm.ts` (pure): the ten states of D5, the numbers
  as data (`SHADE`), `think(shade, sense, dt)` and `perceive`.
  - **What it sees**: 20 tiles at night, 10 by day (×0.5 for someone
    crouching), with a line of sight. **What it hears**: a sprint within 8, no
    line needed.
  - **Who it leaves alone**: whoever is in a pool, down, away or
    do-not-disturb.
  - **Stalking**: it closes to a circle 4–6 tiles out, coming round from the
    side, and circles. Every 2.5–5 s it rushes in at 5 tiles/s, faster than a
    jog and slower than a sprint.
  - **The windup**: it starts at 1.2 tiles and lasts 0.55 s, a slow lunge (1.5
    t/s). It's committed: a beam doesn't stop it. Roll, or step out of reach.
  - **The strike**: 1.3 tiles reach, 25 health.
  - **Burning**: 45 shield/s under a focused beam, at half speed, an arm over
    its face. **Exposed** for 4 s: it backs off, then the shield grows back at
    25/s.
  - **The light**: inside a pool it flees out of it, burning.
  - **The dawn**, or nobody near for 20 s: it goes.
  - **Found by testing in the world**: one brought out 25–45 tiles away (past
    the 20 it sees) just stood there. Never having seen anyone, it's now
    **drawn to the living**: the nearest person within 70 tiles who isn't safe.
  - `fsm.test.ts`: 6 tests.
- **The server**, `features/dark.ts`:
  - **The director** works per group of people out on the land (within 30
    tiles of each other). It brings out up to `min(40, ⌈people × 3 ×
    danger⌉)`, at most one per 4 s, 25–45 tiles away, behind the facing where
    it can. Never in a pool, off the land, or within 45 tiles of the HQ's doors.
    - **By day** there are only stragglers, in the deep woods or a storm.
    - **The dawn** is 5:00–7:30: they go.
    - **Tension** grows with strikes and close calls; past 0.7 it holds off for
      25 s.
  - **Walking**: straight with whiskers (0, ±0.6, ±1.2 rad, 0.7 ahead); A*
    only when boxed in, at most 3 a tick, again after 1.5 s. Never into a pool
    unless fleeing it. They keep 0.75 tiles off people and 0.7 off each other
    (they walked through Ana). Full mind at 20 Hz within 40 tiles of someone,
    4 Hz beyond.
  - **Burning** comes from each focused torch (`Player.focused`,
    `beamOf`/`beamAt`, with a line of sight). It meets the body low, at the
    chest or the head: point-blank, the cone only meets it low.
  - **Strikes** land within reach unless they're 0–350 ms into a roll as the
    server heard it. The struck get `dark:hit`.
  - **Down to nothing**: for now you wake at the office (`dark:awake`, 50
    health, warm, your pockets kept). Phase 6 puts the others' 30 s before it.
  - **On the wire**: a `Shadow` (id, x, y, facing byte, state, since, shield,
    look) in `@view() shadows`. Each client gets a `StateView` at join, and
    the shadowed within 70 tiles are added to it twice a second, for
    everyone, indoors too (upstairs measured over the ground floor).
    Positions go out at 10 Hz, the state on change. StateView was proven
    first: only the client it's added to gets it.
  - **Admins**: `mod:dark {mode: "peaceful" | "normal", spawn}` and
    `mod:refill`.
- **The look** (`yutopia-dark` 18.0 KB; the 3D view's and the chars' chunks):
  - **The dark chunk** (`dark/shades.ts`) plays them back 150 ms late, as
    office people (shirts, blazers, trousers, loafers, by their `look` seed).
    In 3D they're the view's extra bodies; in iso, people drawn dark.
  - **3D** (`tp/person3d.ts`): near black while the shield holds; their office
    clothes, lit, when exposed.
  - **Their upper body** (`chars/moves.ts` `shadePose`): a slumped lurch with
    twitches, the arms going up through the windup and down in the strike, an
    arm over the face turned from the light when burning, hunched when
    exposed. The legs are the walk's.
  - **The shroud** (`tp/shroud3d.ts`), two point clouds for all of them:
    - smoke on the body, rising and thinning as the shield goes, drawn a
      little towards the eye;
    - it gathers in as one emerges and is blown out as one goes;
    - embers thrown off the side a beam burns.
  - **Iso**: dark people with no name tag; their own clothes when exposed.
  - **On screen**: a red edge when struck; black with "Você acordou no
    escritório" when you go down.
  - **Admins get a ☾ button** (top right, outside): night, day, the real
    hour, call 1, call 3, refill me, peaceful, normal.
- **The page** carries only two iso lines (no name tag without a name; drawn
  dark when `shaded`): 553.975 KB (−26 bytes).
  - **Trap**: the dark chunk newly importing `@yutopia/shared/move` re-split
    the page's chunks (+135 bytes). Three small helpers are copied in instead.
- **Tests**:
  - **shared**: 209.
  - **world-server**: 82, with `dark.test.ts` (YUTOPIA_DARK_FAST):
    - out of the dark 25–45 off, emerging, never in a pool or by the HQ, and
      nobody more than 70 tiles off sees them (indoors near them does since
      2026-10-21, never struck);
    - a strike lands on someone standing (25), and a roll through the windup
      makes it miss;
    - a focused beam burns the shield to exposed;
    - nobody comes into a lamp's pool or strikes whoever stands in it;
    - the dawn takes them, and peaceful keeps them away.
  - **Flares** (the exit test's "a flare holds them off") come with phase 5's
    throw. The pool test covers the light they share (`lit`, `light` in the
    mind's sense).
  - **`pnpm perf` with DARK=1**: 50 bots, 40 of them on the pond at night,
    with 40 shadowed.
    - Tick 0.76 ms average, 3 ms at most (budget 4), 0 put back.
    - An outside client gets 3.97 KB/s more than an inside one: the
      shadowed's share (budget 6). The inside one gets nothing of them. (Since
      2026-10-21 one indoors within 70 tiles of them gets the same share as
      outside; the perf's inside bots are far from the pond, so this holds.)
    - Before, the mind's lines of sight cost 19.6 ms a tick. Now perception
      checks the nearest first, stops at the first it sees, and keeps a line
      of sight for 0.2 s.
  - **e2e `shades.spec.ts`** (YUTOPIA_GPU=1): three called up at night on the
    pond:
    - they emerge, are drawn in 3D, wind up, and strike (health under 100);
    - under the focused torch one burns, then is exposed;
    - in iso they're drawn.
- **Sign-off (the user)**: go out at night (☾ → Night), call some up
  (☾ → Call 3) and fight them.
  - The shroud's look, the windup's tell, rolling through it, burning one
    off, and the speeds (stalk 3.2, rush 5, you jog 4.2 and sprint 6.8) are
    the numbers to tune (`SHADE`).
  - **Sound** (the emerge's sting, whispers, the burn's sizzle) is phase 8's.
    The mocks found the emerge hard to notice without it.

## Phase 5 — guns and flares: built (2026-10-21)

The user: "start phase 5" (phase 4's feel not signed off yet: both can be
tried together).

- **Shared** (`shared/dark/arms.ts`, pure):
  - `ARMS`, the guns:

    | | Between shots | Reload, a round | Damage | Range | Pellets | Spread |
    |---|---|---|---|---|---|---|
    | revolver | 0.42 s | 0.35 s | 50 | 40 | 1 | 0.006 |
    | shotgun | 0.95 s | 0.6 s | 18 a pellet | 14 | 8 | 0.09 |

  - `rayMeets`: a ray against a body's column (0.38 wide, 1.8 tall). It
    misses one beside, behind, past the range or over the head.
  - `pellets(gun, yaw, pitch, seed)`: the same spread on the server and in
    everyone's tracers.
  - `flareFlight`: an arc from the hand, stopped by walls.
  - `FLARE`: 6 tiles, 12 s. `REWIND`, `MUZZLE_REACH`.
  - The mind's `wound(shade, n)`: only an exposed one is hurt; a shielded one
    sparks. At 0 (`SHADE.hp` 100: two revolver rounds) it dissolves, killed.
- **The server** (`features/arms.ts`), **you aim, the server decides**:
  - `arms:draw {slot}` sets `Player.gun`, which everyone sees.
  - **A shot**, `arms:fire {ox, oy, oz, yaw, pitch, lag, seed}`, is checked:
    the gun in the hand and loaded; the rate; aiming, out on the land, free;
    the muzzle within a tile of where the server has you. A ray from
    elsewhere is refused, and no round is spent.
  - **The rewind**: each pellet is taken against the shadowed where you saw
    them. `features/dark.ts` keeps a second of where each was, and the test
    uses now − 150 ms (the playback) − your measured lag, ±60 ms and ±0.15
    tiles.
  - **A wall or trunk** on the way stops it.
  - **What it met** comes back to you (`arms:hit {kind}`). Everyone within 60
    tiles gets the shot (`arms:shot`) to draw.
  - ~~No friendly fire~~: players are targets now, at half (see "The office
    armed").
  - **A reload** (`arms:reload`) is a round at a time out of the pockets. A
    shot or a change of weapon stops it.
  - **A flare** (`arms:flare {yaw, pitch}`) takes one from the pockets. It flies
    its arc (`arms:throw` to those near), then is lit where it lands
    (`state.flares`, broadcast).
  - **In a flare's light** nobody can be had, and the shadowed don't come in;
    the ones inside burn and flee (it's `lit`, like a lamp's pool, day or
    night).
  - **Burning** (found by trying it): anywhere in a focused cone burns at
    least 27/s, up to 45 close in. Scaled by the beam's falloff, one 10 tiles
    off took 8 s.
  - **Admins**: `mod:refill {kit: true}` gives both guns loaded, 24 rounds, 12
    shells, 3 flares, first aid and a battery (☾ → "Me armar").
- **The client**:
  - **The dark chunk** (`dark/arms.ts`):
    - 1 · 2 take a weapon out (again: put it away). In iso, a gun out
      switches to 3D. Outside, they're not emotes.
    - Aiming, the **left button fires**. It listens to `mousedown`: with the
      right button held, a second button is no `pointerdown`.
    - **The shot goes through the crosshair**: what's under it (or 30 tiles
      out), from the gun in the right hand. Over the shoulder, the body's
      line isn't the crosshair's.
    - **R reloads, G throws a flare**. On the pad: RT fires, RB throws, Y
      while aiming is the other weapon, X with nothing to use reloads.
    - **The lag** is measured (`arms:ping` / `pong`) and sent with each shot.
    - **The HUD** is the mock's: the cylinder (or the shells) with the spare
      rounds, the flares, and a crosshair while aiming. The crosshair grows
      on a hit: blue on a spark, red on a kill.
  - **The 3D view's chunk** (`tp/arms3d.ts`):
    - the flash and the tracers at once (the same pellets from the seed);
    - sparks where one meets a shield;
    - the flare's arc, and its red stick spitting sparks.
    - **A flare's light** is the view's own ground lamp, red (6 over 11 tiles,
      flickering, nearest first, day or night). No new lights: they'd
      recompile every lit material.
  - **The body**: aiming with a gun, `aimPose(…, gun)` holds both arms out. A
    simple revolver or shotgun (a few boxes) is in the right hand.
  - **Iso**: flares are red pools, and they light whoever is in them.
  - **The page** carries only `gun` on the people's states: 553.983 KB (−17
    bytes).
- **Fixed on the way**:
  - **The 3D camera was clamped at height 0.25 in the floor's frame.** On the
    pond (1.7 down) it couldn't come down to look level or up, so the
    crosshair and the aim's pitch parted. Now it's clamped 0.25 over the
    ground under you.
  - **Admin call-ups** try spots until they have as many as asked for.
  - **The e2e** turns the dark off by default (`helpers.enter`: peaceful). At
    the real hour it may be night on the Grounds, and `grounds.spec`'s walks
    were struck down mid-way.
- **Tests**:
  - **shared**: 213, with `arms.test.ts`: rays, pellets, a flare's flight,
    wounds.
  - **world-server**: 86, with **`arms.test.ts`, the exit test**:
    - A's focused torch exposes one, B shoots it: a spark while it's
      shielded, then hurt, then killed.
    - **The rewind**: a shot at where B saw it 300 ms ago, with B's lag at
      150, hits though it had moved on. A muzzle 2.5 tiles from B is refused,
      and no round is spent.
    - A reload is a round each 0.35 s out of the pockets, and a shot stops it.
    - A flare thrown lands 4–10 tiles ahead, lit for 12 s. Nobody comes into
      it or strikes whoever stands in it.
  - **`pnpm perf`**: 0 put back. DARK=1 (40 shadowed): tick 0.79 ms, the
    shadowed's share 3.8 KB/s outside.
  - **e2e `arms.spec.ts`** (YUTOPIA_GPU=1), Ana armed at night: G's flare
    lands and burns; 1 takes the revolver out (the cylinder); aiming, the
    torch burns one to exposed and the left button puts it down. 3 of 3.
- **Left for phase 8**:
  - the guns' and flares' sounds (the synth shortlist is ready);
  - the shadowed's emerge sting and whispers;
  - softening the beam's start at the hand.

## Phase 6 — down, up, awake: built (2026-10-21)

The user: "start phase 6".

- **The numbers** (`shared/vitals.ts` `DOWN`):
  - you bleed out in 30 s, and the time waits while someone holds by you;
  - a teammate's hold is 3 s within 1.5 tiles, and you're up at 35;
  - your own first aid is 5 s held, and you're up at 100;
  - nobody came: the office, at 50;
  - a crawl is 0.6 tiles/s;
  - away outside at night for 30 s, and you go down.
- **The server** (`features/survival.ts`):
  - **At 0 health you go down**: `Player.downAt` (and `revBy`, `revAt`: who's
    getting you up, since when), seen by everyone. The gun is put away.
  - **While down**: the shadowed leave you alone (hp 0); the allowance is a
    crawl's (0.84 tiles/s); no jumps or verbs, no shots, no searching or
    dropping.
  - **`dark:revive {sid, on}`**: someone on their feet within reach holds for
    3 s and you're up at 35. Going out of reach, going down themselves, or
    being struck (a strike on the one holding) stops it.
  - **`dark:selfaid {on}`**: your own first aid, 5 s held. It uses a kit and
    leaves you at 100. It's checked on its own, even while someone holds by
    you (found by the tests: it was an `else`).
  - **Awake**: no one came, so `dark:awake`, the office (your arrival), 50
    health, warm, and what you carried, kept.
  - **Away outside at night** for 30 s (the shadowed leave the away alone):
    down, then the office. Peaceful (`mod:dark`) switches that off too: no
    threat at all.
  - **Admins**: `mod:down` puts you down (☾ → "Me derrubar"), and
    `mod:refill` gets you up.
- **The client**:
  - **The walker** crawls while you're down: crouched at a 0.225 tilt (the
    crouch's 1.6 there is 0.6), no sprint, aim, jump or roll.
  - **Poses** (`chars/moves.ts`): `crawlPose`, on hands and knees with the
    hands reaching in turn and paced by the distance, and `kneelPose` for
    whoever is getting someone up. The dark chunk tells the 3D view who's
    which (`tp.downed`), so the page doesn't grow.
  - **The dark chunk** (`dark/down.ts`), as in the mock `03-revive`:
    - over whoever's down within 40 tiles, a red cross with what's left of
      their 30 s, and a ring while someone holds;
    - by one, "Segure E para levantar {name}" (the pad's X), the ring filling
      over 3 s;
    - down yourself, red pulsing at the edges, "Caído · 0:28", and the first
      aid's hint (or "someone's getting you up", or "wait");
    - the use key (or the pad's button) held starts the hold, and letting go
      stops it.
  - **The page**: unchanged, 553.981 KB.
- **Tests**:
  - **world-server**: 91, with **`down.test.ts`, the exit test**:
    - A down, B holds by her: going out of reach after a second stops it;
      back, held the whole 3 s, A's up at 35, where she was.
    - Alone: woken at the office, 50, the revolver still carried.
    - Your own first aid: 5 s, up at 100, a kit used.
    - Down: a crawl passes, a jog is put back, no jump.
    - Away in the clearing lamp's pool at night: down, then the office.
  - **`pnpm perf` DARK=1**: 0 put back. The bots wait while down; they were
    put back 51 times crawling their laps.
  - **e2e `down.spec.ts`** (YUTOPIA_GPU=1, two browsers):
    - Ana down: her screen says so, she crawls (under 1.2 tiles in a second),
      and Bia sees the cross over her.
    - Bia by her holds E: Ana's up at ≥ 35, the red gone.
    - Alone, down again: after 30 s, the office at 50.
- **The GPU run** (every movement, Grounds and dark spec): 22 of 24 passed.
  - `dark.spec` matched the down prompt as well as the search's: narrowed,
    and it passes.
  - One `grounds.spec` iso walk timed out in the long run, but all 9 pass on
    their own. It has done this in long runs since phase 4 (twice when the
    dev world server restarted mid-run on an edit, which turns the dark back
    on). A flake to watch.
- **Not covered by a test**: a strike stopping a hold is in the code (`hurt`
  stops any hold the struck one has). There's no test that brings the
  shadowed onto a reviver on demand.

## Phase 8 — sound and the HUD: built (2026-10-21)

The user: "Go".

- **The sound** is the shortlist approved in phase 0, made in the game.
  - **`dark/synth.ts`** is a typed port of `design/screens/dark/sounds/synth.mjs`
    (the same DSP and the same 19 sounds). It renders at 22.05 kHz: the
    highest in them, crackles to 7 kHz, is under half that.
  - **Rendered in a Web Worker** (`dark/synth.worker.ts`), the drones first,
    and handed back as channels (transferred). Nothing ships as a file. Keep
    the two in step.
  - **Why a worker**: rendered on the main thread, one at a time while idle, a
    few of them (the whispers, the reverb tails) took longer than a frame.
    `grounds.spec`'s first walk out onto the land had a 67 ms frame against
    its 50 ms limit. In the worker it's 17 ms in both views.
  - **Turbopack bundles it** (`new Worker(new URL(…), { type: "module" })`):
    the synth is in the worker's chunk, not the dark chunk (18.0 KB).
- **`dark/voices.ts` (`DarkSound`)** plays them on the mixer's buses:
  - **Placed from where you look**: left or right of the 3D camera (iso: up the
    screen), and quieter with distance.
  - **The drone**: calm turning to hunted with the danger at your spot
    (`dangerAt`) and how near the nearest one is.
  - **Whispers** from the nearest stalking within 15 tiles, every 6.5–9.5 s.
  - **One-shots**: the emerge sting within 30 tiles; the shield breaking on
    exposed; the dissolve's burst when one is shot down.
  - **The focus**: its "on" and hum, the hum sagging under 20% battery. The
    burn's sizzle while one near burns.
  - **The heartbeat** under 30 health: 70 a minute, racing at 120 under 15,
    while down, or for 3 s after a strike.
  - **The guns and flares**: revolver and shotgun shots (yours, and others'
    out to 60 tiles), the dry click, a round's load, the shotgun's pump after
    a shot and as a shell goes in, a flare's strike and its burning sputter.
    A strike landing on you.
  - **Only outside**: indoors is always safe, so silent.
- **The HUD's rest** (`dark/vitals-hud.ts`), as `02-hud-night`:
  - **Health** is a dark red vignette deepening under 60 and beating under 30.
  - **The cold** is frost (branching hairlines, the same each time) growing in
    from the corners as warmth goes under 50.
  - **Both sit over the world and under the app's panels**: right after the
    canvas's host, so the top bar and minimap stay readable. Fixed on the body
    they covered them.
  - **Teammates out here**: their distance and a health bar under their name,
    within 60 tiles. Not your own other tab (an e2e left a ghost of Ana at
    "0 m").
- **Leftovers from phases 3 to 5**:
  - **Drops in 3D are objects on the snow** (a shape each, its colour, a
    glint). Iso keeps the icons.
  - **The beam's start**: the haze cone fades in from nothing at the phone
    (it was a hard white blob there).
- **The page**: 553.982 KB (−18 bytes).
  - **Trap**: the dark chunk importing `mixer` from `world/audio.ts`, a page
    module, re-split the page (+48 bytes). It now reaches it through the
    Grounds' sound, which already has it.
- **Admins**: `mod:refill {hp, wm}` sets health and warmth, to see the HUD at
  a level.
- **Tests**:
  - **shared**: 213. **world-server**: 91 (the rooms' Vortex "personal lines
    are private" failed once, as it does on main).
  - **`pnpm perf`**: 0 put back. DARK=1: tick 0.77–0.82 ms. A 10 ms worst
    tick once, 3–4 on reruns: a pause, not the dark.
  - **e2e `dark-hud.spec.ts`** (YUTOPIA_GPU=1, two browsers, 3 of 3): Ana at
    night on the pond, hurt (22) and cold (15), armed and focusing on one,
    Bia 4 tiles off.
    - The vignette and the frost are up; the battery, the cylinder and the
      crosshair are shown; Bia's tag gives her distance.
    - Every one of the 19 sounds is made; the drone and the focus's hum play.
    - Its shot matches the mock's layout.
  - **Trap**: a new spec first went into `e2e/hud.spec.ts`, an existing test
    (the main HUD's). It was put back from git, and this one is
    `dark-hud.spec.ts`.
- **The GPU run**: 23 of 25. The two that failed were the Grounds walk's
  worst frame, fixed by the worker above (both views pass, 17 ms).
- **Not checked by ear**: the e2e checks that each sound is made and the
  loops run, not how they sound in the mix. That's for the user, outside at
  night with sound on.

## Phase 9 — the checks (2026-10-21)

The user: "start phase 9".

- **The page**: 567,279 bytes gzip. That's 553.98 KB, 17 bytes under 554
  (`NEXT_DIST_DIR=.next-prod pnpm --filter @yutopia/client build`,
  `node tools/budget.mjs`). **`yutopia-dark`**: 18.0 KB of 80. The synth is
  in its worker's own chunk.
- **The frames**: new e2e `dark-perf.spec.ts` (YUTOPIA_GPU=1).
  - **The setup**: on High, in the third person, in the woods (−150, −6) at
    23h with the torch on. 20 shadowed are called up round Ana
    (`mod:dark spawn 10`, twice). 4 flares are thrown a quarter turn apart
    (the kit's 3, a refill, one more). Health is refilled each second so she
    stays up.
  - **Result**: 6 s of frames at **60.0 fps**, p95 16.7–16.8 ms, worst
    16.8 ms (two runs). That's the display's rate: no frame was missed. All
    20 were in her view and the 4 flares were burning when it ended.
  - The flares light through the ground lamps' pool (4 on High), so no new
    lights and no shader recompiles.
- **The server**:
  - **`pnpm perf`**: 60 bots, tick 0.30 ms, 0 put back.
  - **`DARK=1`**: 50 bots and up to 40 shadowed, tick 0.79 ms (max 4),
    0 put back. 18.9 KB/s outside, of which the shadowed are 3.6; inside
    15.3 (far from them: indoors near them gets their share too, since
    2026-10-21). The budget was ≤ 4 ms and ≤ 6 KB/s for the shadowed.
- **Firefox: not run**.
  - **Why**: neither Firefox will start on this Mac. Playwright's (1543,
    Firefox 155) and the installed Firefox 158 both exit at launch with
    "Could not find profile folder", even with a fresh profile and outside
    the sandbox.
  - **What was checked instead**: a read-through of what plans 30 and 29
    added. Module workers (Firefox 114+), `StereoPannerNode`, `copyToChannel`,
    22.05 kHz buffers, `setTargetAtTime`, `structuredClone`, the CSS (inset,
    gradients, a filter animation, inline SVG) and `KeyboardEvent.code`
    keys are all in current Firefox.
  - **The fire button**: it's on `mousedown`, not `pointerdown`, because a
    second button pressed while one is held fires no `pointerdown`. That's
    the same in both browsers. The canvas blocks the context menu, so the
    right button aims.
  - **The risk that stays** is plan 29's: a gamepad Firefox reports with a
    non-standard mapping. Its d-pad is often an axis there, so first aid
    (pad 13) and the d-pad have no button. Try it with a pad in Firefox.
- **Tests**:
  - **Unit**: shared 213, world-server 91 (the Vortex flake passed this
    time), client 21. Typecheck is clean in every package. Biome is clean on
    the new spec.
  - **Pest** wasn't run again: no API change since phase 2 (71).
- **The GPU run** (every dark spec and `grounds.spec`): 14 of 16.
  - **The two failures were mine**: `grounds` on High (a teleport timed out)
    and `shades` (the burn). Both ran while I was editing the world-server,
    and its dev container restarts on each edit.
  - **Re-run** with the day change in (`shades`, `dark-perf`, `arms`, `down`,
    `grounds` on High): 5 of 5. The Grounds on High was 59.9–60.2 fps at the
    lot, the square and the woods, by day and at night.
- **Still to do**:
  - **The fight's feel** (phase 4) needs the user's sign-off.
  - **Chapter 1** (phase 7) comes later.
  - **By ear**: the sound in the mix, outside at night with sound on.
  - **Firefox** on a machine where it starts.

## More of them, and the day (2026-10-21)

The user: "the day should have enemies too but less" — "yes, do it,
everywhere off the paths. Increase the number of zombies at day and night".

- **The numbers** (shared `danger.ts` `SHADOWED`, `shadowedWanted`): per
  group, `min(60, ⌈people × 5 × danger⌉)`. Before it was `min(40, ⌈people ×
  3 × danger⌉)`, and by day none outside the deep woods and storms.

  | One person | Before | Now |
  |---|---|---|
  | Night, open | 3 | 4 |
  | Night, woods | 3 | 5 |
  | Day, open | 0 | 1 |
  | Day, woods | 1 | 2 |
  | Day, on a path | 0 | 0 |

- **By day only those off the paths count** (`dayPrey`), and only 40 tiles
  or more from the HQ's doors.
  - **The paths**: the roads, trails, the town's pavements, the plaza, the
    lot, the buildings' floors (`onPathAt`).
  - **Where they come from**: by day, out of the snow and never a path.
  - **Still the same**: a blizzard counts as night. Dawn sends them away.
    They see 10 tiles by day, 20 at night.
- **The land, made ahead** (`apps/world-server/src/land.ts`, `land.worker.ts`):
  - **The problem**: a Grounds chunk takes ~6 ms to make the first time
    anything asks about it. The director's tries 25–45 tiles out kept
    reaching land nobody had walked, so with 60 the worst tick was 11–18 ms.
  - **The fix**: a worker thread makes the land within 49 tiles of everyone
    outside (once a second), and the main thread adopts it. The director
    only tries spots on land already made.
  - **Worst tick**: back to 3 ms. Players walking into new land gain from it
    too.
- **Admins**: `mod:dark {mode: "called"}` turns the director off, so only the
  ones you call up come. The server tests that need a calm day use it, since
  even the open ice by day now sends one.
- **Tests**:
  - **shared**: 215. New: the counts, and the paths by day (the pond trail,
    the ice, the lot, by the HQ).
  - **world-server**: new "by day, fewer": one comes out on the open ice,
    out of the snow; none for someone on the pond trail.
  - **`DARK=1 pnpm perf`**: up to 60 shadowed, tick 0.9 ms (max 3), 0 put
    back. The shadowed's share is 5.1 KB/s outside (≤ 6).

## Fixes: the focus at 0%, a faster recharge, one body a person (2026-10-21)

The user: "When focus is 0% the light don't turn off, it keep blinking very
fast" and "Make the focus recharge faster".

- **The blinking**: at 0% the focus went off, the battery recharged a hair,
  the focus came back on and drained it again, every step.
  - **The fix is a latch**: run out, and no focus until the battery is back
    to 25% (shared `vitals.ts`: `VitalsClock.drained`, `VITALS.bat.back`,
    `canFocus`). The walker and the server run the same rule.
  - While it's out the beam is the wide one, and the bar reads "RECHARGING"
    with a mark at 25%.
- **The recharge**: 4% a second up to 40% (it was 0.25: 160 s from empty,
  now 10). Empty to focusing again takes about 6 s. A battery from the
  pockets still fills it to 100.
- **Found on the way: one body a person**.
  - **The bug**: someone's vitals were settled once for each of their
    Players. Closing a page without leaving keeps the old Player a while in
    case they reconnect, so coming straight back made everything run at
    double speed: recharge, drains, health, the down timers.
  - **The fix**: now once a tick, through the newest Player; the others show
    the same numbers (`features/survival.ts`).
- **Tests**:
  - **shared**: 216 (the latch: no focus below 25%; a battery clears it).
  - **world-server**: a body kept for a reconnection, the battery recharging
    at 4/s and not twice that (it fails on the old code, at 7.7/s).
  - **e2e `beam.spec`**: a new test "run out", twice: off for 6.3 s, back at
    25%, the server's focus never back on meanwhile. The old test now
    expects the recharge under way.

## The inventory: built (2026-10-21)

The user approved the mock (`design/screens/dark/06a-inventory`,
`06b-inventory`): "approved go".

- **I opens it** (the pad's Menu), anywhere on foot: outside, and indoors
  too. The walker loads the dark's chunk for it if you haven't been out
  yet.
  - **It doesn't open**: driving, at an arcade, or typing in a field.
  - **It closes with**: I, Esc, the ✕, a click on the dimmed world, or the
    pad's B.
- **The world doesn't stop**. While it's open you stand still (the keys and
  the pad's moves are held back, click-to-walk too) and can't aim or shoot.
  When one of the shadowed is within 15 tiles, a red warning says so.
- **The panel** (`world/dark/inventory.ts`, its own layer over the 3D name
  tags), as the mock:
  - **You**: health, stamina, warmth and battery, with what brings each
    back ("comes back to 60 by itself", "cooling · outside at night",
    "Recharging"), and what's in your hand.
  - **Weapons**: loaded / magazine, the spare ammo, "IN HAND".
  - **Pockets**: 3 × 2, each count / stack.
  - **Picked**: its description and numbers (for a gun: damage and range
    from `ARMS`), and its buttons: Use (E), Hold / Put away (1 · 2),
    Reload (R, the gun in hand), Drop (right click; anywhere, the office
    too).
  - **On the ground · in reach**: what lies within 1.6 tiles. Take it (E,
    or drag it into a pocket).
- **The pointer**: a click picks, a right click drops, a drag moves.
  Pocket to pocket swaps, or tops up the same stack to its cap. Weapon slot
  to weapon slot swaps. From the snow, into the pocket it's dropped on.
- **The pad**: the d-pad moves through weapons, pockets and the snow. A uses
  or takes, X drops, B closes.
- **New on the server**:
  - **`dark:move {from, to}`**: shared `moveSlot`; pockets and weapon slots
    don't mix.
  - **`dark:pick {id, slot?}`**: shared `addItemTo`, the chosen pocket first
    and the rest where it fits.
- **The Tab strip** stays as the quick look; its hint now says "I
  everything".
- **The page**: 553.98 KB (19 bytes under). **`yutopia-dark`**: 24.5 KB.
  **`yutopia-input`**: 10.1 KB.
- **Tests**:
  - **shared**: the drag and the chosen pocket.
  - **world-server**: survival's "the inventory" test: a pocket dragged, the
    flares dropped and taken back into the pocket they were dragged to,
    weapons swapped.
  - **e2e `inventory.spec.ts`**: I opens it, W held does nothing, the first
    aid used with E (health 40 → 100), a drag between pockets, a right
    click drops, a drag from the snow into a chosen pocket, 2 takes the
    shotgun out, Esc and I close it, walking again after, and it opens
    indoors.
  - The test starts by dropping what Ana carried from earlier runs: her
    pockets are saved.
- **Not tested**: the pad's navigation in the panel (no pad in the e2e).

## Easier, a longer exposure, the cursor in the inventory (2026-10-21)

The user: "the enemies are too hard"; "when you burn the corruption off with
the torch, it comes back very fast, leave it much longer"; "if the mouse is
hidden with Z, opening the inventory doesn't show it: show it, and hide it
again after".

- **Easier** (shared `dark/fsm.ts` `SHADE`):

  | | Before | Now |
  |---|---|---|
  | A strike | 25 health | 15 (7 to put you down from full) |
  | The windup | 0.55 s | 0.8 s (more time to roll or step out) |
  | Between rushes | 2.5–5 s | 4–7 s |
  | The rush | 5 tiles/s | 4.2 |
  | A focused beam burns | 45/s | 60/s (exposed in under 2 s) |

- **The shield stays off longer**:
  - **Exposed**: 12 s, was 4.
  - **Grows back**: 6/s, was 25 (from nothing to whole in about 17 s, was
    4).
  - **Only once no beam has been on it for 2 s**: a burn you let go of for
    a moment isn't lost.
- **The rest is unchanged**: how many come (`SHADOWED`), their sight,
  their health (2 revolver rounds, 1 shotgun blast).
- **The cursor**: with mouse look on (Z), opening the inventory lets go of
  the pointer, and closing it locks it again.
  - **No click needed to re-lock**: the release was by code, not the
    player's Esc, so the browser allows it.
- **Tests**:
  - **shared**: the fsm's burn test reads the numbers, and a new one checks
    the shield holds for 2 s after the beam leaves.
  - **world-server**: the strike test uses `SHADE.strikeDamage`, and the
    roll comes 0.55 s into the 0.8 s windup.
  - **e2e `inventory.spec`**: mouse look on, I frees the pointer, I locks
    it again. Headless has no pointer lock, so the spec fakes one as
    `mouse-look.spec` does.

## The office armed (2026-10-21)

What you carry works anywhere now, the HQ's floors included: drop it, pick it
up, use it, take a gun out (1 · 2), reload, aim, fire, throw a flare. And
**the others are targets**, everywhere: PvP.

- **One of us shot** takes half what the shadowed would (shared
  `pvpDamage`):
  - the revolver 25 (four put someone down from full);
  - a shotgun pellet 9.
  - At nothing they go down, as from a strike (D7).
- **Who can be hit**: someone else on the shooter's floor, on their feet.
  - Not one who's down.
  - Not one riding or driving.
- **The rewind, for people**: `features/arms.ts` keeps a second or so of
  where everyone was (each tick: x, y, z, the floor, crouched).
  - A shot is taken against where its shooter saw them:
    `now − REWIND.people (110 ms, the world's INTERP_MS) − lag`, ±60 ms.
  - A crouched body is 1.25 tall.
  - On the land, one of the shadowed nearer along the ray takes it instead.
  - A wall on the shooter's floor stops it.
  - The shooter gets `arms:hit {kind: "person" | "downed"}`. The one hit
    gets `dark:hit {id: the shooter, n, shot: true}`: the red edge and the
    struck sound.
- **Indoors**:
  - Height is the floor's own (0); on the land, the terrain's. That applies
    to the muzzle check and to a flare's arc.
  - Shots and throws go to the others on the same floor.
  - The shadowed never come in (they're seen through the windows: below),
    and the torch doesn't focus.
- **Drops and flares** carry their floor (`Drop.level`, `Flare.level`).
  - They are drawn, lit, heard and picked up on that floor only.
  - A saved drop without one is the ground floor's.
  - A flare's light keeps the shadowed out on the ground floor only.
  - Loot spots stay the ground floor's.
- **The client**:
  - The dark's chunk loads on idle a few seconds in, indoors too.
  - **Aiming with a gun**: with a gun in your hand, the right button aims
    indoors, and doesn't open a thing's menu. In mouse look the left button
    fires and doesn't pick (`tp.armed`).
  - **Keys indoors**: 1 · 2 are taken only with a weapon in that slot (or
    one in the hand to put away), else they're the emotes. R needs a gun
    out, G a flare carried. None of them work in build mode.
  - **The crosshair** converges on a person along the look.
  - **The HUD**: indoors the ammo shows only with a gun out.
  - **The inventory**: the ground list is my floor's, and Drop is always on.
- **Tests**:
  - **shared**: `pvpDamage`, `pastAt`, a crouched body, a flare's floor.
  - **world-server**:
    - 25 a round in the lobby and on the studio's floor, four down, then
      nobody;
    - the shotgun's pellets, 9 each;
    - another floor missed, a wall in the way missed;
    - a flare indoors on its floor;
    - a drop on the studio's floor picked up there only, and no loot
      searched off the ground floor.
    - The shade tests wait till A is off B's line of fire.
  - **e2e `inventory.spec`**: flares dropped indoors, lying there, taken
    back.

## The supply locker (2026-10-21)

A green steel locker, built from the build menu (Tech, "Supply locker"):
anyone who builds puts it where they like, on any floor, as many as they
want. Nothing places one by itself.

- **A kit a day for anyone**: E in front of one on your floor, a search's
  ring, then what fits.
  - The kit (shared `LOCKER_KIT`):
    - 12 rounds of .38
    - a first aid
    - a battery
    - 2 flares
  - A revolver too, if you carry none. It follows the gatehouse's rule:
    loaded only the first time ever.
- **The day**: São Paulo's (`dayOf`), kept on the survivor (`kit_day`), across
  every locker: one kit a day, whichever you open.
  - It's taken as soon as anything went in, and saved at once.
  - With pockets that take nothing, it isn't spent.
  - Again the same day: "Taken today — come back tomorrow".
- **Searched as a spot**: `kit:<the object's id>`. The server checks it's a
  locker on your floor and that you're at its front.
- **Tests**:
  - **shared**: the kit fits a pocket each; a locker's front is out the way
    it faces.
  - **world-server**: one built on the studio's floor; the kit, then
    "tomorrow"; kept across a rejoin; what fits; the next day another
    (`kitClock`).
  - **Pest**: `kitDay` round-trips and is validated.

## The flashlight in the hand (2026-10-21)

With the torch on (F, the pad, the phone's button), everyone holds a real
flashlight. It's drawn only; it isn't an item.

- **Where it is**: in the left fist (`props.ts` `torch`), pointing the way
  a gun points.
- **The arm** (`torchPose`, a layer in `locomotion.ts`): not aiming, the left
  forearm is out ahead and a little down. Aiming, `aimPose` already holds it
  out along the look.
- **When it's hidden**: while the phone is in the hand (both hands are on
  it), and seated in iso.
- **The views**:
  - 3P and the others' bodies (`person3d.ts`).
  - The iso sprites (`IsoState.extra`).
  - First person: `handsDoing` learns `torch`, and `gun` too, so a drawn gun
    shows in 1P now.
- **The beam starts in the left hand**, where the model has the lens (measured
  on the model in `torchPose` and `aimPose`):
  - low in the hand: 0.9 up, 0.5 ahead, 0.2 left, tipped down 0.13;
  - aiming: 1.05 up, 0.72 ahead, 0.03 left.
  - It's one function, so the views and the server's burn agree.
- **The 3D view draws the light out of the lens** in the hand when that
  person is drawn (`Person3D.torchLens`). The flashlight is turned each
  frame to point along the beam (`pointAlong`), whatever the wrist is doing,
  so the light always comes out of it. The light was cast from 0.3 tiles
  above the hand before.
- **The light**:
  - The spot throws a texture: a hot core, the reflector's ring, the spill.
  - On High, the first flashlight (mine) casts shadows (512², off while it's
    off).
  - The beam in the air is a shader: brightest along its middle, its edges
    fading (no hard outline).
  - The lens glints, and glares when it looks at the camera.
- **The model**: tail cap and rubber switch, a knurled grip, the body flaring
  into the head, a chrome bezel, the reflector, the LED and the lens (lit),
  a side switch and a clip.
- **Also**: the breath's puff in the cold was a sprite with no picture (a grey
  square). It's a soft round puff now.
- **The right button with no gun: the flashlight**, anywhere in 3D:
  - Holding it raises the flashlight along the look and focuses it.
  - It's switched on for as long as it's held, if it was off, after a
    quarter second, so a quick right click on a thing is still its menu and
    lights nothing.
  - The focus works indoors too, on foot, draining the battery; nothing
    burns in there.
- **The light where the reticle is** (as in Alan Wake): aiming, the view finds
  what the crosshair is on (`aimFrame`), within 16 tiles, past me: the first
  standing wall, else the ground.
  - The body turns a little (`lookYaw`, at most 0.35 rad) and the aim's pitch
    is set (`aimPitch`) so the line from the lens in the hand goes there.
  - Both go out as the body's facing and pitch, so everyone's beam, the
    server's burn and the arms all follow it.
  - Before, the beam ran parallel to the camera's line: from the left hand,
    with the camera over the right shoulder and a 0.2 rad lift.
- **Bladed, as Alan Wake stands** (shared `AIM_BLADE`, 0.45 rad): aiming, the
  body turns that far right of the look. The shoulders and the arms twist
  back along it (`aimPose`'s yaw), and the gun and the flashlight point
  exactly along it.
  - Over the right shoulder they're out beside the body, seen at any
    distance. Before, far away, they pointed straight off behind the body.
  - A body's facing is the look plus the blade; `beamOf` takes it off
    aiming, so every view and the server's burn still beam along the look.
  - The walker sets the facing, and in first person the hands rig and the
    drawn facing follow too.
- **First person**: my hands are drawn in a picture of their own (their own
  lens), so the light can't simply come from the flashlight's place in the
  world.
  - `Hands1P.lensFor` puts the light's origin where the lens shows on the
    screen, at its depth.
  - Aiming, it goes from there onto what the crosshair is on.
  - The hands' framing: held low, the flashlight is raised into view;
    aiming, the forearm sits at the bottom, as before. The hands rig turns
    so the twisted shoulders face the look.
  - Fixed on the way: aiming in first person kept easing the look back to
    level whenever the mouse was still (third person's "come up into the
    aim").
- **Also fixed**: a person's gun was never disposed when they left the view.
- **Tests**:
  - **shared**: the beam's origin is on the left.
  - **client**:
    - The torch raises the left arm, and aiming holds it further out.
    - The iso state has the flashlight, but not with the phone out.

## Seen through the windows (2026-10-21)

Indoors is still safe, but no longer blind: the shadowed within 70 tiles are
sent to everyone, indoors too, and stand out there past the glass.

- **The server** (`features/dark.ts`): the visibility pass dropped its
  "outside" condition. Upstairs, where you stand is measured over the ground
  floor (`across`: each floor has its own corner), so the studio sees the
  ones round the HQ, not ones 60 tiles off.
- **Unchanged, outside only**: who they hunt (the prey list), strikes, the
  director's spawns, the HQ's 45 clear tiles, and where they walk. The
  sounds stay silent indoors, and the danger on the HUD reads outside only.
- **Shots** (unchanged): from the ground floor a shot still finds them, as
  before; from upstairs it doesn't, and the client aims at nobody there.
- **Fading** (`dark/shades.ts`): one come into range fades in over 0.5 s; one
  gone out of it (or gone) is drawn 0.4 s more, standing where it was last
  seen, fading out. It leaves the sounds, the danger and the aim at once.
  - 3D: the shroud's smoke thins and spreads with the fade, and the body is
    drawn from halfway in (`shade.fade`); iso: the person's alpha (`fade`).
  - Iso shows only my floor: upstairs, none are drawn there.
  - Their height upstairs comes from the ground floor's corner, not mine.
- **Bandwidth**: someone indoors near them now gets the same share as
  someone outside (≤ 6 KB/s); far off, nothing, as before.
- **Tests**: world-server `dark.test.ts`, "those indoors see them through the
  windows, and are never struck": one in the lobby, one in the studio
  (level 4), one called up by someone outside east of the HQ. Both indoors
  see it, nobody indoors can call one up, and only the one outside is struck.
||||||| Stash base

## They wait at the edge (2026-10-21)

Seeing them from indoors wasn't enough: with nobody out there to have, they gave
up after 20 s (`SHADE.leave`) and dissolved. That included the parking lot,
which counts as indoors: its asphalt is the ground floor's floor tiles.

- **The rule:** the lot stays safe. They don't hunt or strike there, and they
  can't step onto it. Everyone indoors, on any floor, is now in the shadowed's
  senses as a **watcher** (`Prey.watch`, hidden).
  - A watcher within 70 tiles keeps them from going, so they don't dissolve.
  - With nobody to have, one prowls round the nearest watcher at
    `SHADE.watch` (10 tiles), closing in as it circles.
  - Kept off the floor, it slides along the edge. It turns back now and
    then, and sooner when it's stuck.
- **Still outside only:** who they go after, strikes, the director's spawns,
  the day's nests waking, and the danger on the HUD.
- **Tests:**
  - **shared** `fsm.test`: someone safe is never had, the shadowed stays past
    40 s and paces round at 10, and once they're gone past 70 it goes.
  - **In the game:** spawned from the snow by the lot, then stepped onto it.
    After 40 s all three were still there, pacing the lot's edge 15 tiles off,
    and no hit landed.

## The quick slots (2026-10-21)

The two weapon slots became **four quick slots** that hold anything: a weapon
or a stack. Keys 1–4 fire them, and a small bar of them is always on screen,
bottom right.

- **The model** (`shared/inventory.ts`):
  - `Inventory.quick` (`QUICK = 4`) replaces `weapons`. Slots are pockets 0–5,
    then quick 6–9 (`QUICK_SLOT`).
  - A weapon lives only in a quick slot, and only one of each kind. A stack
    can go in either a pocket or a quick slot, with the same cap.
  - `moveSlot` merges two of the same stack, otherwise swaps, so long as a
    weapon never lands in a pocket.
  - `addStack` tops up matching stacks anywhere, then fills empty pockets, then
    empty quick slots. `count`, `takeStack`, `consume` and `hasWeapon` look at
    both.
  - One `USABLE` list (`aid`, `battery`) replaces the three copies.
  - `cleanInventory` reads an old save's `weapons` as the first two quick
    slots. The API (`DarkController`) validates `inventory.quick`. The column
    is JSON, so there's no migration.
- **The server**:
  - `arms:draw {slot}` takes 0–3. A stack there changes nothing, and -1 puts
    the gun away.
  - `dark:use`, `dark:move`, `dark:pick` and `dark:drop` take 0–9.
  - The admin kit puts the guns in quick 1 and 2, and moves aside what was
    there.
- **The keys**: once the dark is loaded, 1–4 always belong to the quick slots,
  on foot only (`Walker.stepping`). The emotes keep 5–8.
  - A weapon is taken out, or put away if it's already in hand.
  - First aid or a battery is used.
  - A flare is thrown.
  - Anything else, or an empty slot: the tile shakes.
  - In the inventory, 1–4 and E on a quick slot do the same. On the pad, Y
    while aiming switches to the next weapon in the quick slots.
- **The HUD**: a column bottom right (`.dk-col`), bottom up: the cylinder and
  flares, the quick bar (`.dk-quick`), the battery.
  - The quick bar shows four small tiles with the key, the icon and a count
    (rounds loaded for a gun). The gun in hand is outlined in amber, and a tile
    pops when its key does something.
  - The Tab strip, or the inventory being open, takes its place.
- **Tests**:
  - **shared**: moves between quick slots and pockets, the migration, ammo
    taken from a quick slot.
  - **world-server**: a stack's quick slot draws nothing, and a use from quick
    slot 4. The supply locker's flares now fit in a free quick slot.
  - **API**: validates quick slots; a gun in a pocket is refused.
  - **e2e** (`inventory.spec`): flares dragged into quick 3, the bar shown, and
    3 throws one.

# Pets with a mind — drives, personality, memory (plan — delivered 2026-10-16, see PROGRESS)

Ask: "let's think on how to make our pets more intelligent, with some wills".

## Where we are
A pet is a needs meter with a mode switch (`features/pets.ts`): it follows,
stays, roams or sleeps; it goes to a bowl when food or water drops under
`HUNGRY_AT`, sleeps under `SLEEP_AT`, runs an idle set now and then, fetches a
thrown toy. `feelingOf(needs)` names its mood from the lowest meter. Every pet
of a species behaves the same; nothing in it wants anything, remembers
anything, or has a say in a command.

## The idea
One small, pure module — `packages/shared/src/mind.ts` — gives each pet
**traits** (who it is), **drives** (what it wants right now), a **chooser**
(what it does about it) and a **memory** (what it learned). The server runs it
once a second per pet and turns the chosen intention into the modes, paths and
acts that already exist. The client shows what it wants (a thought bubble),
who it is (Personality on the Status tab) and how close you are (Bond).

```
needs + traits + memory + the room  ─►  drives (0..100 each)
                                        ─►  intention (the strongest, with commitment)
                                        ─►  plan: a target + an act  ─►  modes / go() / act()
```

## M1 — Drives and intentions (the core)
Eight drives, each a pressure 0..100 scored from the needs, the time since it
was last met and the traits (`drives(pet, ctx)`):

| drive | pressure from | met by |
| --- | --- | --- |
| hunger | 100 − food, ×greed | a bowl with portions, a snack |
| thirst | 100 − water | the water bowl |
| rest | 100 − energy, more at night | its bed (or a corner) |
| play | 100 − fun, ×energy trait, +minutes since last play | a toy, a chase with a friend, a game with you |
| attention | minutes since last petted or spoken to, ×affection | being petted, a word, you looking at it |
| curiosity | things placed since it last looked, rooms it hasn't seen, ×curiosity | walking over and sniffing a new thing, exploring |
| comfort | noise (a battle, a radio loud, many people), ×(1 − courage) | its bed or house, a quiet corner, you |
| company | minutes since it was near another pet, ×(1 − independence) | another pet: a nap together, a chase |

**Commitment.** The pet takes the strongest drive as its *intention* and keeps
it until the drive drops under 30 or another is 25 points stronger, so it never
flip-flops between the bowl and the ball. An intention has a plan: a target
(an object, a pet, a person, a tile) and the act at the end of the walk. Plans
reuse what exists: `go()`, `act()`, the bowl visit, `maybeFetch`, the idle sets.

**What it looks like:** a thought bubble over the pet with an icon of what it
wants (bone, drop, Z, ball, heart, a magnifier, a house, paw prints), sent as
`pet:want` and drawn in both views like the sounds are. When the want has no
way to be met it tells you so with its body: it stands at the empty bowl and
paws at it (`beg` pose); it brings the ball and drops it at your feet and
looks up; it nudges your leg for attention (`nudge` pose); it sits beside its
bed when the bed is taken.

- Exit: shared tests for the scoring (a hungry greedy dog goes to the bowl
  before the ball; a petted pet's attention drops; commitment holds), an
  integration test (a pet with an empty bowl walks to it and begs; filled, it
  eats), the bubbles in both views, `/dev/pets` shows the two new poses.

## M2 — Personality and a will of its own
Seven traits 0..1, rolled at adoption from the species base ± breed ± a seed
(`rollTraits(species, breed, seed)`), stored in the record (`traits`):

| trait | species lean | breed lean (examples) | it changes |
| --- | --- | --- | --- |
| energy | dog high, capybara low | husky, bengal, chihuahua ↑; persian, bulldog ↓ | play drive, gait tempo, zoomies |
| independence | cat high, dog low | siamese, sphynx ↑; golden, corgi ↓ | company and attention drives, how far it roams |
| courage | dog, parrot high; rabbit low | shepherd, mainecoon ↑; chihuahua ↓ | comfort drive, battles (it may bail), strangers |
| greed | dog, capybara high | beagle, pug ↑ | hunger drive, begging |
| curiosity | parrot, cat high | bengal, poodle ↑ | curiosity drive, new things |
| affection | dog high, platypus mid | golden, ragdoll ↑; bombay ↓ | attention drive, greetings, nudges |
| obedience | dog high, cat low | shepherd, golden ↑; siamese, husky ↓ | whether it does what you say |

**Shown** on the Status tab as three words from the strongest traits ("lazy,
clingy, brave") with a small bar each under a Personality fold.

**A will of its own.** A command is obeyed with chance
`obedience × (0.5 + bond/2) × moodK` where moodK is 1 when it's fine, 0.6 when
hungry, thirsty or bored, 0.3 when its intention is comfort (scared). A refusal
is visible: a head shake, a `?` bubble, and it carries on with its own
intention; a second call within 5 s always works (it heard you). A pet with a
high bond comes before you finish calling. A happy pet shows off a trick it
knows on its own. Learning speed scales with obedience and curiosity.

**Drift.** Traits move slowly with how it's raised (±0.01 a day, capped):
played with a lot → energy ↑; ignored → independence ↑; petted often →
affection ↑; battles won → courage ↑, lost → ↓.

- Exit: tests for the roll (deterministic by seed, inside each species' band),
  the obedience chance and the drift; in the Lab a cat with low obedience
  ignores "sit" once and the bubble shows it; the Personality fold.

## M3 — Memory and bonds
`memory` in the record, small and bounded:
- **favourite toy** (counts per toy; the one it brings you), **favourite
  spot** (where it napped most; where it goes to rest when the bed is taken),
  **the bowls** (where they were; it heads there when hunger rises, before
  `HUNGRY_AT`).
- **bond per person** (`bonds[uid]` 0..100: +petting, +feeding, +play, +time
  near; decays slowly): it greets friends at the door with a jump and a sound,
  is shy of strangers (keeps a tile away, more so with low courage), prefers
  whoever feeds it when two people call.
- **grudges**: a lost battle makes it avoid that pet for an hour; a won one
  makes it strut past.
- **friends**: pets with a high company drive and compatible temperaments
  (independence and energy within 0.4) play chase together and nap in a pile;
  cats and dogs get along by temperament, not species.

Shown as Bond on the Status tab (a ring per person it knows, yours first) and
in the pet card ("likes: the frisbee, the window seat").

- Exit: tests for the bond maths and the compatibility; in the Lab Bia's cat
  keeps away from Ana's dog once and plays with it once bonds allow; the
  greeting at the door.

## M4 — A day
- Night (the space's clock): it sleeps **in its bed** (or house), not where it
  stands; without a bed, its favourite spot. Morning: it stretches and comes to
  find you.
- **Zoomies** after a meal and at dusk for high-energy pets (a lap of the room
  at full speed, `zoom` pose), **window watching** and TV watching when bored
  and nobody is around (it sits facing the window or the TV).
- The parrot **repeats** the last pet sound heard in the room; a cat sits on the
  desk you're working at (a seat it's allowed on: `tabletop` free of items).
- Exit: a day in the Lab at 10× clock on `/dev/pets-day` (a timeline strip of
  what each pet did), the bed at night, zoomies, the parrot's echo.

## Where it lives
- `packages/shared/src/mind.ts` (pure, tested): `Traits`, `rollTraits`,
  `Drives`, `drives()`, `choose()` (commitment), `obeys()`, `drift()`,
  `Memory`, `bondK()`, `compatible()`. Nothing from the room: the server passes
  a small context (bowls with portions, toys, pets near, people near, noise,
  the hour, what's new since it last looked).
- `apps/world-server/src/features/pets.ts`: the tick calls the mind once a
  second per pet; intentions map to the existing effectors; new acts `beg`,
  `nudge`, `greet`, `zoom`, `watch`; `pet:want` outbound; `traits`, `memory`,
  `bonds` saved with the record (Yondra: one JSON column each on the pets
  table).
- Client: bubbles in `PetOverlays` / 3D tags, poses in `pets3d.ts`, the
  Personality fold and Bond rings in `PetPanel` Status, strings in
  `i18n-pets.ts`; budgets: shared code small, pets chunk +~3 KB.

## Order and gates
M1 → M2 → M3 → M4, each with shared tests, an integration test in
`pets.test.ts`, and a look in the Lab in both views before the next. M1 is the
big one (two sessions); the rest one each.

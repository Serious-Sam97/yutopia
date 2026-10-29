# The pet, part two — the lift, a smarter dog, new dogs, the panel, "get him" (plan — decided 2026-10-28; phases 0–8 delivered 2026-10-28)

> Follows `51-the-pet.md` (it stays, the office, the car, lost and found), `13-pets.md` …
> `17-pets-minds.md` (the pet, its models, its mind) and `45-the-ui.md` (ink in walnut frames).
> Workflow rule: mocks first (phase 0), approved before the rest.

Ask (2026-10-28):

4. Improve the dog's general intelligence.
5. Improve the dog models.
6. Improve the pets' UI.
7. The owner can command the pet to attack another user: the user falls to the ground while the dog
   bites them, until the owner calls it off.
8. When the dog is following you, it doesn't go down in the elevator — investigate.

## Item 8 — the lift: what's wrong (investigated 2026-10-28)

Reproduced in the game (Ana, the dev world, car A from floor 4 down to the lobby) and offline (the
server alone, the same ride). Three faults, one after the other:

1. **It never gets into the car.** Ana walks in; the dog, 4 m off, stays in the corridor. Its path
   into the car isn't found on the server's grid for it (`gridFor(uid, level)`). It whines where it
   stands (`r.lost`), and the doors shut on it.
2. **On the way down, it hops floor to floor in the corridors.** The lift moves its riders
   (`lifts.ts` `carry`), and their level changes at each floor they pass. Each change calls the pets'
   `levelChange` → `comeAlong`, which puts the dog on that floor beside where Ana is — outside the
   shaft (`nearestOpen` round her), out of her sight.
3. **On the ground floor it lands where it can't get out.** `comeAlong` takes the nearest open spot
   to Ana with no path check (`place()` checks one; `comeAlong` doesn't). It landed behind the lift
   (68.0, 44.7 to her 69.0, 40.6) and stayed there "following", unable to reach her, while she
   walked off.

So to the player it didn't come down. The fix is phase 1, below.

## The design

The user chose, from the options put to them (2026-10-28):

- **Smarter**: all four — **follow well**, **react to the world**, **learn your routine**, **moods
  you can see**.
- **Models**: **both** — the dog's body and breeds rebuilt, then its motion.
- **UI**: **the pet panel redone** and **a command wheel**.
- **"Get him"**: **anyone, anywhere** — down until the owner calls it off.

### D1 — Following well (and the lift)

- **In the lift with you**: the pet following its owner into a car goes in too. The car's floor is on
  its grid when the car is there, as it is for people.
  - It rides as a rider: carried with them (`lifts.ts`), its spot in the car kept, its height with
    the car's (new `Pet.z`, drawn by the client like a person's).
  - No floor-by-floor hops: while its owner's `carried`, `levelChange` leaves it alone.
- **Arriving anywhere** (the lift, the stairs, a teleport): beside its owner **on a spot it can walk
  to them from** (`comeAlong` takes `place()`'s path check). With the car's doors still shut there's
  none yet: it tries again each think, never into a pocket.
- **Stairs**: it walks up or down them with you; only out of sight does it catch up.
- **Doors**: a shut door between you, it waits at it and whines; a locked one it isn't let through,
  it sits there (not a path to nowhere).
- **Beside, not in the way**: it keeps to your side or just behind, never stops in a doorway or the
  lift's door, steps aside for people walking at it.
- **Never stuck**: no way to you for 5 s, it's put back at your side when nobody's looking at the
  spot (the server's rule as for a lost path today, but quicker and only out of sight).

### D2 — Reacting to the world

- **Strangers after dark**: someone it doesn't know near you outside at night — it barks, stands
  between you (`shyOf` and `bondOf` as now).
- **New things**: something new on its floor — over for a sniff (it does already, `seen`), now with
  a look back to you.
- **Things that move**: a car going by within 10 m — a bark and a few bounds after it, back to you
  (never into the road when its owner's in the car: that's D1). A thrown ball or snowball: its head
  follows it.
- **Other dogs**: one it's compatible with (`compatible`) — they play: chase, play-bow, roll; one
  it isn't — stiff, a growl, apart.
- **Weather**: a storm (`weather`) — it shelters (under a desk, by a wall, indoors), tail down, close
  to you.

### D3 — Your routine

- **It learns** (in its `memory`, saved): your desk (`ownerId` on a desk), your usual hours in (the
  last 20 arrivals), the rooms you're in most.
- **At home or waiting** (51 D1–D2): near your usual time it goes to your office's door or your desk
  and waits there; when you arrive, it greets you at the door.
- **When you're busy**: on a call or focused (`focused`, a booth), it lies down by you and keeps
  quiet (no sounds, no begging).
- **Bedtime**: late in the world's evening it settles on its bed if there is one.

### D4 — Moods you can see

- **Body language** from how it feels (`feelingOf`), its traits and its bond:
  - happy: tail high and wagging, ears up, a bounce in its walk;
  - bored: slow, sniffing, head low;
  - scared: tail tucked, ears back, low, close to you;
  - sulking: turns its back, walks off a step, slow to obey.
- **It remembers**: neglected (its needs low for long, little attention), it sulks for a while after
  — obeys less, doesn't greet. Spoiled (fed, played with, petted lately), eager and quick.
- The mood also on the panel (D6) and over its head now and then (the existing want token).

### D5 — The models, then the motion

**Bodies** (`art/pets3d.ts`, the same procedural, ink-outlined style as the people — `art-direction-stylized`):

- **The dog reads as a dog**: the stills show it as a lion cub. A longer muzzle and stop, a slimmer,
  deeper chest, a tucked belly, longer legs, paws, and an expressive tail set.
- **The 12 breeds** (shiba … shepherd) by silhouette, not only colour: the corgi's short legs and
  long back, the dachshund's longer still, the husky's thick coat and curled tail, the pug's flat
  face, the shepherd's long muzzle and upright ears, the poodle's puffs, the dalmatian's spots.
- **Heads**: ear sets (floppy, half-up, pricked), eyes with brows that move (D4), a mouth that pants
  and grins.
- Cats, rabbits, platypuses, capybaras and parrots: kept, proportions checked against the new dog.

**Motion**:

- **Gaits by speed**: walk, trot, run (a gallop for the big dogs), the stride and bob scaled to its
  size; turning, the body bends.
- **Poses and moves**: sit, lie down (sphinx and on its side, asleep), stretch, shake off snow, scratch,
  head tilt, nose to the ground, play-bow, the zoomies.
- **Transitions** between them (it doesn't snap from running to lying).
- In the iso renderer's sprites too? Iso is gone (50): 3D and the panel's turntable only.

### D6 — The pet panel, redone

In the HUD's look (45: ink in walnut frames, the tokens in `globals.css`, Cormorant titles, Special
Elite labels):

- **Top**: its portrait (the turntable), its name, where it is (51's line), its mood (D4) in words.
- **A command row** always there: Come, Follow, Stay, Wait in my office, Go to my office, Sleep — the
  ones that don't apply now greyed with why.
- **Tabs**: Care (needs, feed, water, pet), Play (toys), Tricks, Style, Battles, Mind (traits, bonds,
  what it remembers: your desk, your hours).
- **The list of pets** on the left with each one's where-line (51) and a light for how it is.

### D7 — The command wheel

- **Hold Q** (on a phone: long-press its face on the HUD, or the pet itself) — a radial menu round
  the pointer: Come, Stay, Follow, Home (wait in my office), Go home, Explore, Sleep, a trick, and
  **Get him** (D8). Release on one to say it.
- Pointing at a person while the wheel's up targets them (for Get him); at a spot, Come goes there.
- More than one pet: the wheel's for the one nearest (or the one you picked in the panel); a tap on
  its centre switches.

### D8 — "Get him"

- **Who**: anyone, anywhere — the user's call. Not someone in a car or riding a lift (they're not on
  their feet), nor a flier out of reach (shared `reach.ts`), nor your own self.
- **How**: on the wheel (D7) or on a person's card: **Get him**. Your pet must be following you
  and within 30 m of them. It may not mind you at first (`obeyChance`; a second call within a few
  seconds always works).
- **What happens**:
  - it runs to them (a run's pace);
  - at them, they're **down** — new `Player.bitBy` (the pet's id) and `fellAt` held while it lasts;
  - the dog bites: the battle's "attack" pose, growls and the bites' sounds, both heard near;
  - their screen says "Rex (Ana's dog) has you!";
  - their client won't walk while they're down. The server takes moves as sent (no anticheat:
    the rule is the client's, as the others are).
- **Until**: the owner calls it off ("Leave it" on the wheel, or Come / Follow / Stay). Also if:
  - the owner leaves the world or is more than 60 m off;
  - the victim leaves the world;
  - the dog's too tired (`energy` under `SLEEP_AT`: biting drains it).
- **Afterwards**: up again as from a car's knock. Never hurt: no vitals lost, as the car's knock
  (plan 28).
- **Its mind**: biting is a battle-like act for it — xp a little; the victim's bond with it drops
  hard, and their own pets hold a grudge (`holdGrudge`).

## Where it lives

| Part | Where |
|---|---|
| The lift's riders with pets, `Pet.z`, `comeAlong`'s path check, waiting at doors, unstuck | world-server `features/pets.ts`, `features/lifts.ts` (a hook for its riders), `schema.ts` |
| Reactions, routine, moods (drives, memory fields: desk, hours, rooms; sulking) | shared `mind.ts` (+ tests), world-server `features/pets.ts` (`think`) |
| Bodies, breeds, gaits, poses, transitions | client `art/pets3d.ts` (the dog's profile and its rig); the dev sheet `/dev/pets` |
| Drawing a pet's height (lift), its mood's body language | client `tp/view.ts` `petFrame`, `art/pets3d.ts` `rigOf` |
| The panel | client `components/hud/PetPanel.tsx` (lazy, the pets chunk) |
| The wheel | client: a new lazy component, the keys (`Q`), the phone's long-press |
| Get him: the command, `Player.bitBy`, the victim's client held down, the sounds | shared `pets.ts` (`attack` in `COMMANDS`), `protocol.ts`; world-server `features/pets.ts`; client controller (the walker held while down), `PersonCard` |

## Phases

| # | Phase | Exit |
|---|---|---|
| 0 | **Mocks**: the new dog (the 12 breeds side by side, old and new), the gaits as a strip, the moods' body language; the redone panel; the wheel (desktop, phone); "Get him" (the dog on someone, both screens); a pet in the lift | the user approves `design/screens/pet2/` |
| 1 | **The lift and following well** (D1): item 8's three faults fixed, stairs, doors, out of the way, never stuck | Unit tests (the lift down and up with a pet, arriving in a pocket, a shut door); e2e: Ana and her dog down the lift to the lobby and out, in the game |
| 2 | **The bodies** (D5, models): the dog and its 12 breeds | `/dev/pets` sheets; the stills; budget (the pets chunk) |
| 3 | **The motion** (D5): gaits, poses, transitions | the sheets as strips; frame time with 20 dogs about |
| 4 | **Moods and reactions** (D2, D4) | Unit tests (shared mind: each reaction's trigger, sulking); seen in the game |
| 5 | **The routine** (D3) | Unit tests (learning hours and the desk; waiting at the door before you come) |
| 6 | **The panel and the wheel** (D6, D7) | e2e: every command from the wheel; the panel's row; the phone |
| 7 | **Get him** (D8) | Unit tests (down, held, called off, every way it ends); e2e two browsers: Ana sets Rex on Bia, Bia's down and can't walk, Ana calls him off |
| 8 | **Checks**: the perf with dogs biting and riding lifts, prod's world offline, budget | All green |

## Phase 1 (first part) — the lift: delivered (2026-10-28)

Done first, before the mocks: the user's call.

- **In the car with its owner** (`features/pets.ts`):
  - When a lift's car leaves with its owner in it, a pet following them on that floor within 6
    tiles rides along: `Pet.ride` "lift", beside them in the car (0.6 tiles off).
  - Floor, place and height (`Pet.z`, new) are its owner's at every step. The room tells features
    the moment a car moves someone (`Feature.carried`, from `WorldRoom.moveTo`), so the pet is put
    there at once, not a tick behind (the pets tick before the lifts).
  - It doesn't have to walk in first: that's what failed (its idle pause outlasted the open doors).
- **No hops on the way**: while its owner's carried, `levelChange` leaves their pets alone.
- **Arriving**: out of the ride when its owner is (the doors open), standing in the car with them,
  and out with them.
- **Arriving anywhere** (stairs, a teleport, a pet left on another floor): `comeAlong` now takes a
  spot beside its owner that it can walk to them from (`nearBy`, as `place()` does). None yet: it's
  asked again a second later, never into a pocket. That's where it had landed: behind the lift.
- **Never stuck**: no way to its owner for 5 s, with them on foot within 20 tiles, it's put back at
  their side (`comeAlong`). Not with them in a car (left behind is lost: 51 D4), nor far off.
- **Client**: a pet's height is drawn (`Pet.z`, the controller's state, `tp/view.ts` `petFrame`). A
  pet riding a lift is drawn as ever; only a car's riders are left to the car.
- **Checked**:
  - world-server `pets-lift.test.ts` (new, 2 tests), three runs in a row:
    - in car A down from floor 4 to the lobby: in the car beside her, on her floor, at the car's
      height, every sample of the way; out with a way to her; it follows her into the lobby; and
      back up the same;
    - shut in a parked car's body, it's put back at her side.
  - e2e `pets-lift.spec.ts` (the dev world, GPU): Ana's dog rides car A down with her, drawn at the
    car's height on every floor it passes, and follows her out into the lobby.
  - world-server 172/172. The next full run had two timing tests fail ("a bench by the fire", a
    nest's sleepers), each passing on its own. Tried and dropped: installing lifts before pets.
    The shuttle's test then failed in full runs; the `carried` hook does the job instead.
  - **Budget**: `/page` 414.7 / 415.

## Phases 0–8 — delivered (2026-10-28)

The user's call (2026-10-28): "Finish all phases". So no stop for the mocks' approval. The pictures
were made as each part was built: `design/screens/pet2/`.

### Following well (phase 1, the rest of D1)

- **On foot up or down** (the stairs): it goes first to where its owner left its floor (`ownerAt`,
  their last spot there; `via`, at most 6 s), then comes along beside them.
  - Only when they walked there: their new spot within 6 tiles of the old one, in one frame
    (`across`). A teleport is a jump, and it comes along at once. Walking first after a teleport
    held dogs up for 6 s, and `pets-car.spec` caught it.
- **Out of the way** (looked at every 0.7 s, not every tick: a floor's things are many):
  - in a doorway (a door's opening, a lift's doorway), right in front of its owner where they
    face, or someone walking into it — a step to their side.
- **Shut doors**: a pet goes by its owner's grid, so a door that's shut to it is shut to them. The
  "never stuck" rule (5 s with no way to them, on foot within 20 tiles) covers a pet shut in.
- **Boarding a car, better**: it tries every way into its seat (the door, the other side, round the
  back: `SEATS_OF` `out`), nearest first. A parked car beside the door had it walking round the row.

### The bodies and the motion (phases 2–3, D5) — `art/pets3d.ts`

- **The dog reads as a dog**: a smaller head on a longer, slimmer body, a deep chest, a tucked
  belly, longer legs, a longer muzzle with a stop, the tail set higher.
- **The 12 breeds by silhouette**:
  - shiba: a fox face;
  - poodle: puffs and a topknot;
  - husky: a ruff;
  - golden: feathering;
  - bulldog: low and wide;
  - chihuahua: an apple head, big ears;
  - shepherd: bigger, a sloping back;
  - corgi, dachshund, beagle and pug adjusted too.
- **Fixes on the way**:
  - short legs used to float the body: it drops by their difference;
  - a longer body now carries its head, legs and tail with it;
  - the swept body's winding is found from the whole outline (the bulldog had drawn inside out).
- **Gaits for dogs by speed**: a walk under 1.8 tiles/s, a trot to 5.4, a gallop above. The legs
  keep to the ground, and the body bends into turns. Other species keep their walks.
- **New poses**: `lie` (sphinx), `playbow`, `tilt`, `sniffground` (and `shake`). Into and out of
  lying it blends over 0.5 s (no snap from a run).
- **The server's moves**: `move:<kind>` acts (`lie`, `playbow`, `shake`, `tilt`, `sniffground`;
  `chase` a gallop), each with its length (`MOVE_MS`).
- **`/dev/pets`**: the 12 dogs side on, the gaits as strips, the moods walking and standing, the
  new poses (`e2e/pets-sheet-shots.mts`).
- Pictures: `breeds-new.png`, `gaits.png`, `moods.png`, `poses-new.png`.
- The art was done by a forked agent in parallel (its own files only).

### Moods and its world (phase 4, D2, D4)

- **`Pet.mood`** (shared `mind.ts` `moodOf`): alert (a stranger, a growl), scared (a storm, out
  there), sulk, bored (fun under 30), happy, or "".
  - The client's body language: `RigIn.mood` — the tail high or tucked, the ears, the head, the
    bounce. The view passes it.
  - The panel's name plate says it in words.
- **Sulking**: two hours of no one's attention and fun under 40, a sulk for 20 minutes. It obeys at
  0.6× and greets no one.
- **Its world** (`react`, beside its owner, not when they're busy):
  - **A stranger after dark**: someone it doesn't know (`bondOf` under 10) within 6 tiles of its
    owner, outside, half dark or more — a bark ("angry"), alert, and a step between them.
  - **A car going by**: faster than 3 m/s within 10 tiles, not its owner's — a bark and a few
    bounds after it (`move:chase`), every 20 s at most.
  - **Another dog** within 3 tiles: one it gets on with (`compatible`, no grudge), a play-bow; one
    it doesn't, a growl and a step back. Every 30 s at most.
  - **A storm** (`storm` over 0.5) out there: scared, close by, no wandering for a sniff.
- **"Outside"** is now on the ground floor in no building. The lot is on the ground floor's map,
  not its land, and the old rule had it indoors: the cold, the wild and these reactions use it.

### The routine (phase 5, D3)

- **`memory.arrivals`** (the world's hour each login, the last 20) and **`memory.rooms`** (the
  rooms its owner's in, a minute at a time, the top 8). Kept in the saved memory.
  - `usualHour` averages them round the clock (23 and 1 make 0); `dueSoon` is true within
    0.75 h before it.
- **Before its owner's usual time**, at home with them away: to the office's door, inside, and it
  waits there.
  - The door is the one made with the room, or one in its walls. With none (the studio's War
    Room), it's the side they come in from: the floor's lifts.
- **They come into the office**: over to them, happy (once a visit).
- **They're busy** (on a call, heads down at their desk, "do not disturb", in a booth): it lies
  down by them (`move:lie`) and keeps quiet (`say` is silent).
- **Bedtime**: from 22:00 to 6:00 in the world, at home or waiting, it goes to bed (its office's
  bed at home).
- **`Pet.routine`** for the panel: the usual hour, the rooms by name, their desk's room.

### Get him (phase 7, D8)

- **Shared**: `COMMANDS` has `attack` (with `target`, a session) and `leave`. `ATTACK`: 30 tiles to
  be sent, 60 off its owner to keep at it, 1 tile to bite.
- **`Player.bitBy`** (the pet's id) while it holds them. `fellAt` is kept as long as it lasts
  (pballs' clearing skips them). The victim's own client won't walk while they're down (no
  anticheat: the client's rule).
- **Who it can go for**: not its owner, nor someone in a car or a lift, or out of its reach (a
  flier: `near()`, shared `reach.ts`), or further than 30 tiles. Else `attackNo`.
- **At them**:
  - they're down;
  - the victim's toast: "Rex (Ana's dog) has you! Only Ana can call it off.";
  - it bites (the battle's `attack` pose), growls every 2 s and tires (energy −1).
  - Their bond with it goes to 0, and their own pets hold a grudge against it.
- **It ends with**:
  - its owner's "leave" or any other word;
  - its owner gone from the world, or over 60 tiles off;
  - the victim gone, or in a car or lift;
  - it too tired.
  - Then they're up at once. Never hurt (as a car's knock).
- **Its act `attack` is also the battle's move**: the behaviour returned early on battle moves
  before getting to it. It's checked first now.
- **The client holds a bitten person lying down**: the fall's time stops at 1.4 s while
  `pinned`.

### The panel and the wheel (phase 6, D6–D7)

- **The panel** (`PetPanel.tsx`, the pets chunk):
  - a **command row** over the tabs, always there: Come, Follow, Stay, Explore, Sleep, Speak,
    Wait in my office, Go to my office — and **Leave it**, lit while it's on someone;
  - the tabs **Care** (was Status), **Mind** (new: on its mind, personality, bonds, **Your days**
    — the usual hour, the desk, the rooms), Play, Tricks, Style, Battles;
  - the mood on the name plate.
- **The wheel** (`PetWheel.tsx`, in the panel's chunk — the pets panel opened with `objectId`
  "wheel"):
  - **hold T** (input `pets`, `DEFAULT_KEYS`: P is the phone's, and it opened the phone too);
  - nine words round the screen's middle: the pointer's angle picks one, letting go of T says it
    (or a click);
  - "Get him!" goes for the person nearest the pointer on screen, else the nearest one;
  - it waits for the pets' chunk (its words come with it).
- **Not done**: the phone's long-press on its face (the panel's command row is there on a phone).
  "Get him" isn't on a person's card: it's on the wheel only.

### Checks (phase 8)

- **world-server**: the pet test files all green — `pets` 10, `pets-lift` 3 (the lift down and
  up; shut in; the stairs and stepping aside), `pets-home` 2, `pets-lost` 3, `pets-car` 1,
  `pets-mind2` 2 (new: sulk, quiet, a stranger, two dogs, waiting at the office before the usual
  hour, bedtime), `pets-attack` 2 (new: down past a knock's time, only the owner calls it off,
  ending with the owner gone or the victim gone, not out of reach).
- **The whole suite**: 176/177. The shuttle's test also fails on the last commit (run in a
  worktree), not ours. "A bench by the fire" and Vortex's private lines failed now and then in
  full runs; each passes on its own.
- **shared** 383/383; **client** unit 42/42, types.
- **e2e** (the dev world, GPU), all green:
  - `pets-stay`, `pets-lost`, `pets-lost-two`, `pets-home`, `pets-lift`;
  - `pets-car` 3/3 after the two fixes above;
  - `pets-wheel` (new, two browsers): the wheel's Stay, the row's Follow, the Mind tab, Get him on
    Bia (down, can't walk off) and Leave it.
  - Pictures: `game-wheel.png`, `game-panel-care.png`, `game-panel-mind.png`,
    `game-gethim-ana.png`, `game-gethim-bia.png`.
- **perf** (`BOTS=200 PETS=60`): tick 1.30 ms (1.07 before plan 52), max 5.2 ms. Prod's world
  offline: 1.45 ms (1.13), max 14.0 ms. Budget 4.
- **Budget**: `/page` 414.7 / 415 (unchanged from plan 51); `yutopia-pets` 27.2, `yutopia-input`
  11.6, `yutopia-car` 26.3.

## Still open

- **Get him, anywhere**: the user chose no limits. In a workplace it can be used to pin someone
  down for as long as the owner likes. The victim has no way out but logging off. Worth watching
  once it's live; a cooldown or a "shake it off" key are ready ideas if it's needed.
- **Hurt?** Down but never hurt (as a car's knock) — unless the user wants the bites to cost
  vitals (the dark's survival).
- **Breeds beyond the dog** (cats' breeds by silhouette too) — not asked; after phase 2 if wanted.

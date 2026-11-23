# Plan 120 — NPCs in God mode

Asked 2026-11-23:

> Criação de NPC pelo God Mode (Lista no God Mode de todos os NPC)
>
> Bem, no god mode vamos ter um local onde vamos gerenciar todos os npcs que vamos adicionar ao mapa, nesse ticket nós
> vamos só fazer a parte de criar eles e gerenciar via god mode

So this ticket covers **making NPCs and managing them**. Putting new ones on the map, and making their behaviour play
out there, is the next ticket's job.

Status: **planned, forks decided and built 2026-11-23 (phases 1–7); waiting on the user's test.** The forks, one by one:
- **F1c**: everyone in the cast. The NPCs that are code today move into it (the user: "todos vão estar no God mode, se
  já existem hoje vamos migrar pra lá").
- **F2a**: the cast is the API's own, saved on every change, outside the drafts.
- **F3c**: the full NPC, its behaviour stored too: type, hours, pace and talk, and reactions.
- **F4b**: an admin page of its own, opened from God mode.
- **F5b**: built straight through, with the user's test at the end.
- **Follow-ups**:
  - **Vortex**: his name and lines are editable; his mascot look and fight stay his.
  - **The Strike Park's bots and hostages** stay code. Its named folk move into the cast.
  - **A change goes live on save**, for everyone, without a reload.
  - **A town NPC can be deleted** like any other, and is then gone for good.

## Where we are, from the code

- **The world's people today are all code.** The server's `Npc` schema (`world-server/src/schema.ts`, `state.npcs`)
  carries a place, a facing, a clip, a mood and a line, but no name or look. The client works out who someone is from
  their `kind` and `id`:
  - **the night guard** (`features/grounds-life.ts`, kind `guard`, id `guard`): his look is the client's `GUARD_LOOK`
    (`world/grounds-life.ts`). By day he's at his post in the gatehouse; after dark he walks the fence;
  - **the Kart Park's folk** (`features/park-life.ts`, kind `folk`, ids `folk-<id>`):
    - Rosa at race control, Joe at the kart stand and Lia at the cocoa cart, each with their spots;
    - four visitors going round the stops;
    - their names and looks are in shared `kart/park.ts KART_FOLK`, their lines in `FOLK_LINES`, their pace in `PACE`
      by gait;
  - **Vortex** (`features/vortex.ts`, id `vortex`): the mascot, with his own face (`vortexMood`), the plan 88 fight,
    and a Vortex at every game table. His look is the client's `ctl/common.ts VORTEX_LOOK`;
  - **the Strike Park**:
    - named folk in `strike/folk.ts STRIKE_FOLK` (Marta the quartermaster, Dimas the instructor, Nell the cook, Otto
      the keeper, Inês the officer), with their lines and stops, walked by `features/strike-life.ts`;
    - recruits, the bots and the hostages, which are made per match.
- **A person's look** is `AvatarLayers` (shared `avatar.ts`, about 30 fields). `parseAvatar` cleans one up and
  `avatarFromSeed` makes a random one. The player's editor is `components/AvatarEditor.tsx`, with the 3D person in
  `AvatarCanvas`.
- **God mode** (plans 53, 55, 102, 109) is admin-only. Its tools are on the bottom bar (`store.ts GOD_TOOLS`), and its
  edits go in drafts (`/api/admin/grounds/drafts`).
- **Admin pages** (`app/admin/perf`) don't join the world, so Ana's token is safe there.
- **The API** (Laravel, `apps/api`) keeps the drafts and revisions, and the players' avatars (`Avatar.layers`, JSON).

## The idea

**The world gets a cast list.** A new admin page, `/admin/npcs`, holds every person the world has:
- the town's, moved out of the code: the guard, Rosa, Joe, Lia, the Kart Park's four visitors, Vortex, and the Strike
  Park's five;
- the ones you make: from scratch, at random, or as a copy of another.

Each one has a card with their picture, name and role, and the list can be searched and filtered. Open one to change:
- their look, with the same editor players use;
- their name, role, voice and lines;
- their behaviour (type, hours, pace, talk, reactions).

Saved, a change reaches the world at once: Rosa in her new jacket, saying her new lines, for everyone. Delete one and
they're gone from the world and the cast. The ones you make wait off the map for the next ticket, which gives them a
place.

## Forks — decided 2026-11-23 (asked one by one)

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | Which people the cast holds | **a)** God mode's own, plus the world's named people shown read-only · **b)** only God mode's own · **c)** everyone: the world's named people moved into the cast and editable | **c** |
| F1.1 | Vortex | **a)** his name, lines and notes editable; his mascot look and fight stay his · **b)** his look editable too (he'd become a plain person) | **a** |
| F1.2 | The Strike Park's bots and hostages | **a)** as templates: a pool of looks and names each · **b)** one fixed NPC per bot slot · **c)** left out: they stay code (the named folk move in) | **c** |
| F1.3 | A change to a town NPC | **a)** live on save, for everyone, no reload · **b)** waiting till a Publish | **a** |
| F1.4 | Deleting a town NPC | **a)** they can only be turned off and back on · **b)** deleted like any, gone for good | **b** |
| F2 | Where the cast is kept | **a)** the API's own cast, saved as you go (admins only), outside the drafts; placing them later goes in the draft · **b)** in the draft, as an `npcs` section | **a** |
| F3 | What an NPC has | **a)** name, role, look, voice, lines (EN + PT), notes · **b)** name and look · **c)** a, plus their behaviour stored now | **c**: type, hours, pace and talk, and reactions (all four) |
| F4 | Where it's done | **a)** an NPCs tool on God mode's bar · **b)** an admin page of its own (`/admin/npcs`), opened from God mode | **b** |
| F5 | Sign-offs | **a)** a still of the page first · **b)** built straight, tested at the end | **b** |

## What an NPC is

`NpcDef` (shared `npc/cast.ts`; the town's first entries are `npc/town.ts townCast()`):

| Field | What |
| --- | --- |
| `key` | Its id. A town NPC keeps the id the world gives them today (`guard`, `vortex`, `folk-<id>` for the Kart Park's 7, `strike-<id>` for the Strike Park's 11: its 5 staff and 6 named recruits); a new one gets `npc-<8 letters>` |
| `name`, `role` | Shown above them and on the card; `role` is free text in EN and PT ("Race control" / "Direção de prova"). Either may be empty (the guard has only his role), not both |
| `look` | `AvatarLayers` (gait included), always through `parseAvatar`. Vortex: none (his mascot look) |
| `voice` | `man` or `woman` (the sounds that already split by voice: gasps, breath, hurt) |
| `lines` | Up to 120 of `{ when, en, pt }`, each up to 140 characters; PT empty falls back to EN. `when` is `ambient`, `greet` or `answer`; Vortex's are his public moments (`radio`, `hit`, `dark`…) |
| `notes` | Up to 1000 characters, for admins only |
| `behaviour.type` | `stand` (at a spot), `wander` (an area), `route` (along a way), `counter` (keeps a shop or desk), `sit`, or a town NPC's **own** (`guard-rounds`, `kart-control`, `kart-stand`, `kart-cocoa`, `kart-visitor`, `vortex`, `strike-<role>`), which is shown as its own and can't be swapped for another |
| `behaviour.hours` | `always`, `day`, `night`, or a shift `{ from, to }` (the world's hours) |
| `behaviour.pace` | Walking pace, 0.5–1.5× (it defaults from the gait, as `PACE` does) |
| `behaviour.talk` | How often they say a line on their own: `never`, `rarely`, `sometimes`, `often` |
| `behaviour.reactions` | `greet` (says hello to someone coming near), `answer` (X to talk gets a line), `shots` (`ignore`, `duck`, `flee`) |
| `town` | `true` for those moved from code: the card shows "the town's" |
| `made`, `changed` | When |

The places a behaviour needs (the spot, the area, the route) are the next ticket's. This one stores none.

## Live for the town's people

- **Applied on save:** name, look, voice and lines. The `Npc` schema gets a `name` and a `look` (its `AvatarLayers` as
  a compact string), so every client draws what the cast says. `GUARD_LOOK`, `KART_FOLK`'s looks and `STRIKE_FOLK`'s
  aren't read by the world any more.
- **Pace and talk** apply to the town NPCs whose code already has them: the Kart Park's and the Strike Park's folk walk
  at a pace and speak now and then, and the guard walks at one.
- **Hours and reactions** are stored for the next ticket. The town NPCs keep their own hours (the guard's day and
  night) and reactions.
- **Deleted:** their feature goes on without them.
  - Without the guard, the gatehouse is empty.
  - Without Rosa, Joe or Lia, the desk, the stand or the cart has nobody at it.
  - Without a visitor, the walk has one fewer.
  - Without Vortex, the studio has no Vortex and no fight, and the game tables have no Vortex in the chair (the
    computer opponent still plays).
- **Seeded once:** the cast's first entries come from today's code. After that the cast never re-seeds, so a deleted
  NPC stays deleted when the server restarts.

## Guardrails

- Admins only, checked on the server (plan 48): every new route and message refuses anyone else.
- With the cast as seeded, the world is exactly today's: the same names, looks, lines and pace.
- A look always goes through `parseAvatar`, on the client, the API and the world server. Names, lines and notes have
  length limits, checked on every side.
- If the world server can't reach the API, it keeps the last cast it had. At the very first boot, it uses the code's
  seed. It never starts with no people.
- `Npc` stays well under Colyseus's 64 fields (it has 15; adding `name` and `look` makes 17), and `schema.test.ts`
  guards it.
- The cards' pictures are drawn from 3D one per frame, after React's frame (the WebGL read-back hitch).
- The admin page doesn't join the world. God mode only gains a button that opens it, so its chunk barely grows. The
  page budget is measured.
- Pest runs against its own database, never the dev Postgres. Check isolation before the first run.
- Commit on main; push when asked; no co-author line.

## The phases

1. **The shape** (shared `npc/cast.ts`):
   - `NpcDef`, its behaviour types, and `parseNpc` with its limits.
   - `TOWN_CAST`, the seed built from today's code: `KART_FOLK`, `FOLK_LINES`, `STRIKE_FOLK` and its lines, and the
     guard's and Vortex's looks moved into shared.
   - A test that the seed draws exactly what the world draws today.
2. **The API**:
   - An `npcs` table, seeded once from `TOWN_CAST` (a migration, with a "seeded" mark so it never seeds again).
   - An `Npc` model, and admin routes `GET/POST/PUT/DELETE /api/admin/npcs`, cleaned as `parseNpc` does.
   - An internal `GET /internal/npcs` for the world server.
   - On every change, a notice to the world server (`POST` to its internal admin hook, as the publish does).
   - Pest tests on their own database.
3. **The world server**:
   - `features/cast.ts` loads the cast at boot, keeps the last one if the API is down, and takes the API's notice.
   - Each town feature reads its people from the cast: their name, look, lines and pace by key. A deleted one isn't
     made, and is taken out live if they were in the world.
   - `Npc.name` and `Npc.look` are set and changed live.
   - Tests in an offline room: Rosa's look changes live, Joe deleted leaves the stand empty, the seed is today's world.
4. **The client draws the cast**: an NPC's name and look come from `Npc.name` and `Npc.look`. The look strings are
   parsed and cached by the string. Vortex keeps his mascot path, with his name from the cast. Lines come as they do
   now.
5. **The admin page `/admin/npcs`**:
   - The list: cards with the 3D picture, name, role, and a "the town's" badge. A search box, a filter (all / the
     town's / made), and a count.
   - New, Random (`avatarFromSeed`), Copy, and Delete, which asks first and says what happens in the world ("the cocoa
     cart will have nobody at it").
   - A button on God mode's bar opens the page in a new tab.
6. **The editor** (on the page):
   - `AvatarEditor` with its 3D person (Vortex: his picture, and no look editor).
   - Name, role and voice.
   - The lines, in EN and PT side by side: add, remove, reorder.
   - The behaviour, in five parts:
     - type (a town NPC's own is shown fixed);
     - hours (always, day, night or a shift);
     - pace (a slider);
     - talk;
     - reactions.
   - Notes.
   - It saves as you go, debounced, says when the save is done or has failed, and warns about unsaved changes on
     leave.
7. **Checks**:
   - Shared, API and world-server tests.
   - An e2e spec: open the page as Ana; change Lia's top and a line and see it in the world from a second player;
     make one, copy it, delete the copy; delete a visitor and see one fewer on the walk; then restore the cast.
   - The specs near the change and the known reds (not the full suite).
   - The page budget and the God chunk measured.

## Progress

- **Phase 1**: shared `npc/cast.ts` (`NpcDef`, `parseNpc`, `parseCast`, `packLook`, `biOf`/`biIn` for EN|PT in one
  string, `paceOf`, `TALK_EVERY`) and `npc/town.ts townCast()`: the guard, Vortex, the Kart Park's 7 and the Strike
  Park's 11 (its 5 staff and its 6 named recruits: they're lobby folk, not bots), with the Kart Park's lines moved from
  park-life.ts and the guard's look from the client. Vortex's public lines are seeded by the API from Vortex::PUBLIC
  (they're PHP). Tests: the seed is what the world drew (names, labels, looks, lines, pace).
- **Phase 2**: the API's `npcs` table (key, def JSON, town, position) and `Npc` model, whose `clean()` follows
  parseNpc's rules in PHP: a look's slots and values, the types, the limits, a town NPC's type and town flag kept as
  stored.
  - The admin routes are `GET/POST /api/admin/npcs` and `PUT/DELETE /api/admin/npcs/{key}`. Every change is logged
    (`npc-new`, `npc`, `npc-delete`) and the whole cast is pushed to the world server (`Cast` service, `POST
    /internal/cast`, signed, once per request).
  - `POST /internal/npcs/seed` puts the town's people in once. The world's settings mark it seeded (`npcsSeeded`).
    After that it answers 409 with the cast, so a deleted one stays deleted. A snapshot import keeps the mark as it was.
  - `/internal/world` carries `npcs` (null till seeded).
  - Vortex's public lines are seeded from `Vortex::PUBLIC` by moment. Once seeded, `Vortex::line()` says the cast's,
    as EN, or EN and PT joined by \x1f: the moment's lines, else his ambient ones. If he's deleted, he says nothing.
  - Pest `NpcsTest` runs on in-memory SQLite; the dev DB is untouched (counted before and after). WorldTest's 3 reds
    were already red on HEAD.
- **Phase 3**: the world server's cast (`src/cast.ts`).
  - The room loads it before its features: the API's cast, or, never seeded, it seeds the town's first
    (`api.seedNpcs`). Offline it's the town's, or the world file's `npcs`.
  - A signed `POST /internal/cast` hands the whole cast to every open room (`room.setCast`, the features' `cast`
    hook).
  - `Npc` gains `name`, `role` (EN, or EN\x1fPT) and `look` (packLook), set by `dress()`.
  - park-life and strike-life make their folk from the cast by key, and take a change live: their look, name, lines,
    pace (by gait unless set) and talk (× their own interval; `never` says nothing). Someone deleted is taken out (a
    kart visitor off their seat), and comes back if the cast has them again.
  - The guard keeps his rounds and is in the world only while the cast has him. His pace is × his own, and he says a
    line now and then if the cast gives him any (he has none: he says nothing, as before).
  - Vortex: deleted, he isn't in the world, can't be shot (`room.vortex` null) and ignores pokes and the admin's
    moves. His pace and chatter follow the cast.
  - **A trap found**: @colyseus/schema 3.0.76 writes a str 8's length as `length % 255`, so a string of exactly 255
    UTF-8 bytes arrives as "" and what follows it is misread. Lia's look was 255 bytes. `wire()` adds a space to any
    NPC string (name, role, look, line) of exactly 255 bytes. The bug is the library's, for every string in the
    state.
  - Tests: `cast.test.ts`, an offline room: the town as it was, a change live, deleted and back, nobody at all,
    unsigned refused. park-life, grounds-life, vortex-fight, schema and karts pass. rooms.test's Vortex "personal
    lines" is timing-flaky on HEAD too (known).
  - The dev world seeded its cast on its first room: 20 people, Vortex with his 62 public lines.
- **Phase 4**: the client draws the folk and the guard from `Npc.name`, `role` and `look`: "Name · Role" in my
  language, the look parsed once by its string. Lines and the HUD's Vortex line are said in my language (`biIn`).
  Vortex's name is the cast's, the tables' Vortexes too, and once the cast has no Vortex the tables have none. The
  helpers are local copies (`world/npc-words.ts`, tested against shared) so the world page doesn't take in the cast's
  module. The role strings it no longer needs are gone.
- **Phases 5–6** (built together): `/admin/npcs` (`app/admin/npcs/`: page, editor, face, words).
  - The list: cards with the 3D head (one picture a frame, after React's: `face.tsx`; flat without WebGL; Vortex his
    V), name, role or what they do, and a "the town's" or "not on the map yet" badge. A search box (name, role, notes,
    key), All / The town's / Made here, the count of the 500, New (the default look) and Random (`avatarFromSeed` and
    a first name).
  - The editor:
    - name, role in EN and PT, voice, Copy (a town NPC's copy stands: their own way isn't the copy's) and Delete;
    - tabs: Look (the players' `AvatarEditor`, now with an optional live `onChange` and `title`, no Save button
      then; Vortex has none), Lines (moment, EN, PT, up/down/remove, add), Behaviour (a town NPC's own shown fixed with
      what applies now; anyone else's five types; hours with a shift; pace by gait or a slider; talk; greet, answer,
      shots) and Notes.
  - Saved as you go, 0.7 s after the last change; says Saving… / Saved / Not saved, and retries in 3 s. Leaving with
    a save pending asks first.
  - Delete asks first and says what happens in the world (the cocoa cart with nobody at it; Vortex's studio, fight
    and tables), and that a town NPC doesn't come back.
  - God mode's plate has an NPCs link (desktop) that opens the page in a new tab.
  - Checked on the dev stack: as Bia the page says only admins. As Ana (headless, the page never joins the world) it
    lists 20, opens Lia's look, lines and behaviour and Vortex's, and makes one at random. Named, given a line and the
    counter type, it was saved (read back from the API), then deleted with the confirm. No page errors.
- **Phase 7, checks**:
  - shared `npc/cast.test.ts`, the API's `NpcsTest`, the world server's `cast.test.ts` and its neighbours, and the
    client's `npc-words.test.ts`;
  - e2e `cast.spec.ts` on the dev stack: Bia refused; as Ana the page lists the API's cast; Lia renamed on it is
    renamed in Bia's room at once, then put back; one made, copied, both deleted with the confirm; the cast as before.
    It deletes none of the town's on the shared world: that can't be undone, so the offline tests have it;
  - in the world as Bia by the Kart Park's desk, the model draws Rosa, Lia (her 255-byte look whole) and the guard
    with the cast's names and looks;
  - budget (prod build): /page 496.8 of 498 KB, God 26.8 of 27, grounds 182.7 of 205; all in.

## Double check (2026-11-23)

An independent review of the whole diff, plus my own pass and runs on the dev stack. Fixed:

1. **Saves landing out of order** (the page): two PUTs for one NPC in flight could commit the older last. Now each NPC
   has one save in flight, sent again if they changed meanwhile. The API stamps each cast push with when it read it
   (`at`), and the world server lets an older push go (`server.ts castAt`).
2. **A look stored empty came back as `[]`** (a copy of Vortex): `Npc::toDef` sends `{}`. The page runs every NPC from
   the API through the shared `parseNpc`, and a copy of Vortex is a person in the default look.
3. **The page's statuses**:
   - a deleted NPC's status is dropped (it left "leave anyway?" behind for good);
   - a delete is sent before their unsaved changes are let go (a refused delete lost them);
   - no name and no role says "give them a name or a role" and isn't sent, nor retried every 3 s.
4. **Vortex deleted mid-fight**: the fight's end is told, else the clients thought it went on.
5. **A cast pushed while the room loaded** is kept, not overwritten by the older one the room loaded.
6. **PHP and TS cut alike**: by characters (code points, never mid-surrogate), and an hour that isn't a number falls
   back to the default.
7. **Leftovers**:
   - Vortex's clones are named as the cast says;
   - the VortexOS line goes through `wire()`;
   - the fight's babble uses the EN line only.
8. **The cards' pictures**: drawn once a look rests (0.35 s), dropped from the queue if it changed first, and the
   last 200 kept.

Checked fine:
- the live `onChange` of the look editor (not on mount, not on `initial`; the player's own page unchanged);
- the editor reset per NPC, PHP's look slots against `parseAvatar`, the town flag and type rules;
- seeding (one online room, the snapshot import, null till seeded) and `Vortex::line`;
- seats freed, the guard's and Vortex's add and remove, `room.vortex` null everywhere, talk `never`;
- the hostages and bots drawn as before.

Runs after:
- all shared (866) and client (478) unit tests;
- Pest: everything but the 3 WorldTest reds on HEAD and a photos test that needs PHP's GD (the container has none);
- the world server's cast, park-life, grounds-life, vortex-fight and schema tests, with a new one for the older push
  let go;
- e2e `cast.spec.ts`;
- headless: nameless said and not saved, then named and saved; Vortex copied with a look; both deleted; the cast back
  to 20.

## Left for later

- **Placing the made NPCs on the map, and playing their behaviour** (hours, reactions, the five types): the next
  ticket.
- **The Colyseus 255-byte bug** is guarded for NPC strings only. Every other state string is exposed until the library
  is patched or upgraded.
- **A town NPC deleted can't come back as the town's**: the cast never re-seeds. Bringing one back would need an admin
  "restore the town's" action.
- The look editor's labels say "you" ("How you walk"), as they do on the player's page.


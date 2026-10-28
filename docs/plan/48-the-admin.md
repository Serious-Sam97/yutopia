# The admin — one place to run the town from (done 2026-10-27, admins only)

> Workflow rule: mocks first (phase 0), approved before any code.
> Mocks: `design/admin/*.png`; source `design/admin/mock/admin.html`
> (`?s=menu|people|person|powers|spawn|flying|invites|world|dark|perf|log|mobile`), drawn in the chosen look
> (`45-the-ui.md`: ink in walnut frames).

Ask (2026-10-27): "Lets improve Admin menu that admin users has. Lets plan." Then: "Yes — go
with your defaults. Write docs/plan/48-the-admin.md and draw the mocks for me to review."
Then, on the first mocks: "good, lets improve also on the admin powers, like fly, spawn
things etc...." (see "The powers" below). Approved with all of it: "Approved, remember only for ADMIN" — every page,
power and spawn is for admins alone, refused by the server to anyone else, not only hidden.

## Where we are

There is no admin menu. What an admin can do is spread over six places, and some of it
has no way in at all:

| Power | Where it is today |
|---|---|
| Invites; a link to `/admin/perf` | Settings → **Team** (`SettingsPanel.tsx` `TeamPage`); the list shows the last 8 |
| Mute, remove for 10 min | The person card, once you've clicked them in the world (`PersonCard.tsx`) |
| Lock a room | The top bar, only standing in one of six rooms named in `TopBar.tsx` (`LOCKABLE`) |
| Lock a door, the media | Their own panels (`DoorPanel.tsx`, `MediaPanel.tsx`) |
| The hour, the dark's tools | The ☾ pop-up, built by hand outside the skin (`world/dark/index.ts` `tools()`) |
| The weather (`mod:storm`) | **Nowhere.** Only the e2e suite sends it |
| Park every car home (`mod:cars`), call the shuttle (`mod:shuttle`) | **Nowhere** |
| Lift a removal early | **Nowhere.** `removedUntil` runs out after 10 min, kept in the room's memory |
| Make or revoke an admin | **Nowhere** in the game: `YUTOPIA_ADMINS` or `artisan yutopia:admin --revoke` |
| See every lock, every member, who did what | **Nowhere** |

What the pieces know:

- The API: `users.is_admin` (`EnsureAdmin` guards `/api/admin/*`), invites, perf reports.
  No `seen_at` on users; `/api/members` gives id and name only.
- The world server: `Player.admin` from the JWT's roles; `state.locks` (area → who locked);
  `Player.muted` (for this stay only); `removedUntil` (in memory); `hourSet`, `stormSet`.
- Ana is the only admin today (`admin-pages-as-ana`).

## What we're making

**"Run the place"**: an admin-only item in my face's menu (top bar, between Settings and
Sign out) opening one framed panel with a rail of pages, the same layout as Settings.
Settings loses its Team page. The panel is a lazy chunk, so the page budget doesn't move
for anyone.

The pages:

1. **People**: who's in now (live from the room) above every member (the API).
   - A row: face, name, email, where they are or when they were last seen, and the tags
     *admin*, *muted*, *removed · 6 min*.
   - A search box and filters: *In now*, *Everyone*, *Admins*, *Removed*.
   - A row opens the person: go to, **bring here** (the teleport a world arrival uses),
     follow, mute / unmute, remove for 10 min / **let back in**, **make admin / revoke**
     (never yourself: the button says why), their last perf report (fps, device, version).
   - The person card in the world keeps its quick mute / remove.
2. **Invites**: today's, plus the whole list with *Open / Used / Expired* filters and who
   used each one. The sign-up mode (`YUTOPIA_SIGNUP`) is shown at the top.
3. **The world**: what the whole town feels, every row live.
   - **The hour**: the clock as it runs, a slider to set it, *Back to São Paulo's*.
   - **The weather**: *Clear*, *Storm*, *As scheduled*; how long a call lasts (20 min today).
   - **Locks**: every locked room, door and screen, who locked it, *Unlock*, from anywhere.
   - **Vehicles**: *Park every car home*, *Call the shuttle to HQ*.
   - **The Kart Park**: the layout on the board, set from here too.
   - **A notice to everyone**: one line, its tone, sent as a toast to everyone in.
4. **The dark**: the ☾ tools moved here in the skin: peaceful / normal, call 1 / 3 near me,
   refill, arm me, down me. The floating ☾ goes.
5. **Performance**: a summary (players this week, the worst fps, the versions still about)
   and *Open the full page*: `/admin/perf` stays as it is.
6. **The log**: who muted, removed, let back in, locked, unlocked, changed an admin, set
   the hour or the weather, sent a notice, and when. Newest first, filterable by kind.

Mobile: the rail becomes a row of chips over the page, the same as Settings.

## The powers

What an admin can do *as themselves* in the world, and what they can put into it. None of it
is there today apart from the dark's refill / arm / down. Two more pages on the rail, after
People: **Powers** and **Spawn**.

How the world server checks movement matters here: `pos` (`WorldRoom.ts`) caps the feet's
height (no higher than a jump or a step), checks every move fits and the way is clear
(`grid.fitsAt`, `grid.clear`), and spends a speed allowance (`ud.allow`). So fly, through
walls and fast are switches **the server** holds on the player, not tricks on the client.

### Powers (on me)

Each is a switch. They last until switched off or until I leave; nothing is saved.

| Power | What it does | Underneath |
|---|---|---|
| **Fly** | No gravity. Space rises, C / Ctrl sinks, the run key goes ×3. Outdoors up to 60 m; indoors up to the ceiling. Double-tap Space toggles it while the power is on. Drawn a little up off the floor with a shadow on it (both views). | A `fly` bit in `Player.powers`; `pos` skips the height cap for it and spends a bigger allowance. The shared move sim (`shared/move`) gets a fly mode: no fall, vertical input. |
| **Through walls** | Walk or fly through walls, furniture and locked doors. Indoors, flying up through the ceiling goes to the floor above (and down through the floor to the one below). | `clip` bit; `pos` skips `fitsAt` / `clear` and `mayEnter`; a storey's worth of height changes `level`. |
| **Fast** | Every pace ×2 (walking, running, flying). | `fast` bit; `speedCap` ×2 for the allowance. |
| **Invisible** | Nobody sees me, my name, my emotes or my footprints, or hears my steps or voice. Other admins see me faded, with "invisible". | `hidden` bit; the room's `StateView` leaves me out for non-admins (as the dark does now); voice: not published while on. |
| **Unhurt** | The shades and falls don't hurt me, and I never run out of breath or torch battery. | `unhurt` bit; `survival.hurt` / `winded` / the battery skip me. |
| **Heal me** (a button) | Full health, breath and battery; up again if I'm down. | Today's `mod:refill`, with getting up. |
| **Go anywhere** (a button) | Click a spot on the minimap or the GPS map, or pick a place from a list (the GPS's places), and land there. | Today's `teleport` with `{x, y, level}` (builders only now) opened to admins anywhere, plus the GPS's named places. |

On the HUD: while any power is on, a small framed strip by the place's name shows which
(*Flying · Invisible*), each one a click to switch it off. Everyone else sees nothing.

### Spawn (into the world, near me)

| What | How | Lasts |
|---|---|---|
| **A vehicle**: any of the eight (`CarKind`), colour, plate | Dropped on the ground a few metres in front of me, facing my way; outdoors only. I can drive it straight off. | Until I *Clear what I spawned*, or the day's end. Never saved, never towed into a bay. |
| **In my hand**: coffee, water, soda, a ball, a frisbee, a rope, a feather, the laser | Straight into my hand, as if from the machine or the toy box. | As any held thing. |
| **In my pockets**: revolver, shotgun, rounds, shells, flares, batteries, aid, fuses (with how many) | Into my quick slots and pockets; or *Drop here* puts them on the ground as loot for anyone. | As any loot. |
| **Shades** | Moved here from The dark: 1 or 3 near me. | As today. |
| **A kart item** (in a kart) | The item box's roll, chosen: today's `mod:kart-item`. | One use. |
| **Furniture** | Not here: build mode already places anything. The page has a link to it. | — |

*Clear what I spawned* takes away every vehicle I spawned (dropped things go by themselves).

### Powers on someone (People → a person)

Added to the person page: **Freeze** (can't move for 1 / 5 / 10 min, a typed slip tells
them why), **Send home** (to the arrival point), **Out of the car** (today's car seat
leave, for one person), **Heal / get up**, and **Give** (any item from Spawn into their
pockets or hand).

### The quick box

The backquote key (`` ` ``) opens a one-line box over the HUD, admins only, for doing
things without the panel: `fly`, `clip`, `fast`, `hide`, `heal`, `tp Bia`, `bring Bia`,
`spawn snowmobile red`, `give revolver`, `hour 23`, `storm`, `notice …`. It suggests as you
type and shows what Enter will do. Everything in it is the same message the panel sends.

### Rules for all of it

- Every power and every spawn is checked against `Player.admin` on the server, and goes in
  the log (switching a power on and off is one line: *Ana flew for 6 min*).
- Leaving drops every power. Powers aren't saved; spawned things aren't saved.
- Nobody else's game changes because an admin flies: the others just see where they are.
- The dark's own page keeps what's out there (normal / peaceful, call shades); its *Me*
  buttons (refill, arm, down) move to Powers and Spawn.

## What changes underneath

**API** (`apps/api`):
- `users.seen_at`: stamped when a world session is issued and when the world server says
  someone left (the internal API it already calls).
- `GET /api/admin/members`: id, name, email, admin, seen, face; paged, searchable.
- `PATCH /api/admin/members/{id}` `{ admin: bool }`: refuses revoking yourself and the
  last admin. The world server picks it up on that person's next join (the JWT's roles).
- `admin_actions` table + `GET /api/admin/log`; `POST /internal/admin-log` for the
  world server's actions.

**World server** (`apps/world-server`):
- `mod:unremove { userId }`: drops `removedUntil`.
- `mod:notice { text, tone }`: a toast to every client (text clipped to 140).
- `mod:unlock` for any lock by key, from anywhere (today `mod:lock` with `locked: false`
  works only for areas; doors and screens get the same).
- Every `mod:*` writes to the log through the internal API, offline skipped.
- The weather's and the hour's override (`stormSet`, `hourSet`) shared in the state, so
  the panel shows "Storm, called by Ana, 14 min left" rather than guessing.

**Client** (`apps/client`):
- `components/hud/admin/`: `AdminPanel.tsx` (the rail), one file per page; words in the
  panel's own table (EN / PT-BR), like Settings.
- The face menu's item; `hud.panel.kind = "admin"`; Settings' Team page removed;
  `Invites.tsx` moved in.
- `world/dark/index.ts` `tools()` deleted; its sends move to the Dark page.

## Phases

0. **Mocks** (this): `design/admin/*.png`, for the user's review.
1. **The shell — done (2026-10-27)**: "Run the place" in my face's menu for admins only
   (`TopBar.tsx`), the panel and its rail (`components/hud/admin/AdminPanel.tsx`, a lazy
   chunk, `hud.panel.kind = "admin"`), Invites (the sign-up mode, the whole list with
   filters, who used each link: the API's `usedBy` and `signup`) and Performance (the
   week in brief, from `lib/admin.ts`, shared with `/admin/perf`); Team gone from
   Settings. The page 560.7 KB (budget 561). Tried live: Bia sees no item, no panel, and
   the API answers her 403; Ana sees both pages. The pages still to come join the rail
   with their phases.
2–8. **Done (2026-10-27)**, all of it in one go ("Finish the rest of the phases, go"):
   - **People**: `users.seen_at` (stamped on a world session and each minute's saved spot),
     `GET /api/admin/members`, `PATCH /api/admin/members/{id}` (never yourself, never the last
     admin), the list (in now / everyone / admins / removed, search) and the person (go to,
     bring here, follow, mute, remove 10 min / 1 h / a day, let back in, hold still 1 / 5 / 10
     min, send home, out of the car, heal, give, the admin switch, their last perf report).
     The world server tells admins who's removed (`admin:removed`).
   - **The world**: the hour (who set it, when), the weather (`stormBy`, `stormTo`,
     `stormUntil` in the state), every room lock and locked door with Unlock from anywhere
     (`mod:door`: a door no one owns — an owner's lock stays theirs alone, as before), park
     every car home, the shuttle, the Kart Park's layout, a notice to everyone (a toast).
   - **The dark**: its page; the floating ☾ and its strings gone.
   - **The log**: `admin_actions` (90 days), `POST /api/internal/admin-log` from the world
     server (every `mod:*`, the powers with how long they were on, spawns), `GET /api/admin/log`
     by kind; invites and roles logged by the API itself.
   - **Powers**: `Player.powers` (shared `admin.ts`), fly / through walls / fast in the walker
     (`world/input/walker.ts`, the numbers copied in `world/input/powers.ts`, a test keeps them
     in step) and in `pos` / `teleport` / `mayEnter`; held still (`Player.frozenUntil`);
     unhurt (no harm, topped up every 5 s); invisible; heal me; go anywhere (every room on
     every floor); the strip on the HUD; the iso camera rises with a flier.
   - **Spawn**: a vehicle in front of me (`mod:spawn-car`: `spawnedBy`, `spawnDay`; retired by
     *Clear what I spawned* or at the day's end, gone once nobody's near — the sold cars'
     way), held things, pockets or dropped loot (`survival.give`), shades, arm me, build mode.
   - **The quick box**: `` ` `` (admins only): fly, clip, fast, hide, unhurt, heal, tp, bring,
     home, freeze, unfreeze, mute, unmute, spawn, give, clear, hour, storm, notice, cars,
     shuttle, panel — with hints for the words, names, vehicles and items.
   - **Checks**: API (`AdminTest`: members, roles, the log, seen; 84 pass), world server
     (`admin.test.ts`: a member refused, a flier taken up and a walker put back, held still,
     a notice, bring / remove an hour / let back in; the whole suite passes), client units
     (the copies agree), `e2e/admin.spec.ts` (Bia refused everywhere; Ana's panel, flying,
     invisible to Bia and back, the log) — run live against the dev stack.
   - **The page**: 561.0 KB, at its budget. Spawn imports nothing of shared: the vehicles and
     colours are copied (`admin/cars.ts`, a test keeps them in step) — importing them split
     the Grounds' chunks (+7 KB to `yutopia-grounds`).

### Decided while building

- **Invisible is drawn, not withheld**: a hidden admin stays in everyone's room state, and
  members' games don't draw, list or hear them (and their voice is cut at LiveKit). Truly
  withholding them would put every player behind `StateView` — a deep change to the room for
  everyone; not done.
- **Fly has one ceiling, the sky's (60)**: there's no "under a roof" test the server trusts
  (the car park is a named area on the ground floor too), so indoors a flier can rise into the
  floors above's space without going to those floors. Flying up through a ceiling to the next
  floor (the plan's) is not done.
- **Removals and mutes still don't outlive a world-server restart** (kept in memory, as before).
- A vehicle can't be spawned where no car fits (the Kart Park's paddock): "full".

## Open questions (answered by default, 2026-10-27)

Built with the defaults: remove offers 10 min / 1 h / a day; removals and mutes stay in memory;
a notice is a toast; invisible leaves you off the people list and the count; spawned vehicles
go at the day's end (or when cleared); fly is Space / C, a double-tap of Space to land.

- Remove: keep 10 min, or offer 10 min / 1 h / a day?
- Should a removal (or a mute) outlast a world-server restart? Today both are forgotten.
- A notice: a toast as today's, or a typed slip that stays until it's read?
- Invisible: should it also leave me off the people list and the "here" count for members?
  (The mocks say yes.)
- Spawned vehicles: gone at the day's end, or kept as town cars until cleared?
- Fly's keys: Space / C, double-tap Space to toggle — or one key of its own?

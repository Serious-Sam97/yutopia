# The UI — the base HUD made clear (done 2026-10-26: ink in wood frames, phases 0–8)

> Workflow rule: mocks first (phase 0), approved before any code.
> **The chosen look**: `design/ui/final-{dusk,night,settings,mobile}.png`; source
> `design/ui/mock/final.html` (`?s=dusk|night|settings|mobile`).
> Today's UI, for comparison: `design/ui/now/01…10.png`. Every round explored on the way
> is in `design/ui/` too (see "How we got there").

Ask (2026-10-25): "Lets improve the overall base UI. Lets plan then suggest some images
for me to review."

## Where we are

The HUD is a "warm 80s hi-fi": walnut cabinets, cream deck keys, amber VFD lettering
(`app/globals.css` `.cabinet`, `.deck-btn`, `.vfd-window`, `.lcd`). That suited the
golden-hour studio it was drawn for. The world has since become a cold, snowy campus
in flat colour with an ink line (`art-style.md`, the ligne-claire people), and the
brown-and-orange chrome now sits on top of grey-blue snow as something from another game.

What the shots in `design/ui/now` show:

1. **Three fonts, mostly tiny caps.** VT323, Share Tech Mono and Inter. Most labels are
   11 px tracked uppercase mono in `--cream-dim` on walnut, which is hard to read
   (TopBar's area line, the people list's places, Settings' slider names).
2. **The top left says YUTOPIA twice**: the brand, then the world's name. The room
   ("Studio · 1 here") is the smallest text in the bar, though it's what changes.
3. **Sign out is one click from the HUD**, top right, styled as a danger button.
4. **The bottom row doesn't line up.** Minimap (left), dock (centre) and hand slots
   1–4 (right) each have their own height, baseline and style. The slots are faint
   dashed squares that barely show.
5. **The phone's badge reads "113"** and sits over the key.
6. **Settings is one long scroll** with no sections. "Allow mic & camera" is plain
   text, not a button. Labels are small mono, while the toggles' names are big Inter.
7. **Layering:** the phone stays drawn over the Pets modal (`now/08-pets.png`).
8. **Mobile is broken**: the dock overflows the screen, and the hand slots sit on top of
   the dock's keys (`now/10-mobile.png`).
9. **The login and avatar pages** are a card on flat brown. The avatar editor is a
   wall of 60+ pills, and its preview is small.
10. **Colours are hard-coded**: 826 hex literals in 56 `.tsx` files, next to 419
    `var(--…)` uses. Restyling anything means touching every panel by hand today.

## The fixes (under any look)

These layout changes come with the new look (they're in every mock):

- **Top left — where and when**: a mark, then the **room as the title** ("Courtyard"),
  then building · floor under it. The clock and the weather follow. The brand isn't
  repeated.
- **Top right — who's in**: faces, count, connection, then **my own face as a menu**
  (status, my look, settings, sign out). Sign out leaves the bar.
- **One bottom row**: minimap · dock · hands, all bottom-aligned at 16 px with 48 px
  keys. **The minimap shows only in the parking lot and inside the office building**
  (any floor); out on the rest of the grounds it's gone (the user, 2026-10-26). The hand slots look like the dock's keys: filled when they hold something, a
  ring on the one in hand, numbers small in the corner.
- **Dock groups**: talk (mic, cam, share) · social (emote, phone, people) · status ·
  make (build, pets, settings). Badges cap at "9+". Hover tips name the key ("Phone P").
- **The prompt** ("E Open the lobby door") is one chip above the dock, with its key drawn
  as a key.
- **Type**: Inter for everything you read, at 12.5 px or more. One display face for
  titles and the clock. Caps labels only as section headers (11 px, semibold, higher
  contrast).
- **Settings**: a modal with a left rail (Me & my look · Sound & voice · Camera ·
  Graphics · Controls · Language · Sign out at the bottom). Each page has a title, a
  one-line explanation, grouped cards, real switches, sliders with readable names, and
  permission asks as a banner with a button.
- **Mobile**: a compact top (room + clock, count + me). Six dock keys (mic, cam, emote,
  phone, people, more ⋯). The hand slots go in a row above the dock (the map key beside
  them only in the lot and the office). Nothing overlaps at 390 px.

**Not in this work** (the user, 2026-10-26): no new people features — no "People
nearby" panel, no who-can-hear-you lists on the HUD; and **the phone is left as it is**
(its shell, screens and layering). The dock's **People key and the side panel it opens
stay as they work today**, only in the new look. And **no objective line** under the
place (the user, 2026-10-26).

## The look — ink in wood frames (chosen 2026-10-26)

A small-town mystery in the spirit of Alan Wake and Twin Peaks, kept quiet: "nothing
loud, but nothing too plain either" (the user). Motifs and mood only — no names, titles
or logos from either.

- **Panels**: dark ink (`#17181d`) inside a **5 px walnut frame** (a wood-grain texture,
  one static image). The small chip (the prompt) stays ink with a thin edge.
- **Type**: Cormorant Garamond, spaced caps, for titles (the place, Settings' pages);
  Special Elite (a typewriter) for small labels and values; Inter for everything you
  read.
- **Light**: one accent, the lamp's warm cream (`#f1d79a`), with a soft glow on what's
  on (a lit key, switches, the torch in hand). Danger is a muted coral.
- **Alan Wake**: the place as a **title card** ("THE COURTYARD", just the place's name —
  no episode number, the user, 2026-10-26); the **torch's battery** as a ring round its slot ("torch 68%"); the screen's edges
  darkening as the light goes.
- **Twin Peaks**: the **zigzag floor** as a thin rule under Settings' titles; the lamps
  on the minimap as pools of warm light.
- **Dusk** (`final-dusk.png`): the Courtyard, out on the grounds, so no minimap.
- **Night** (`final-night.png`): the same frames over the pitch dark of the parking lot,
  so the minimap is there ("The parking lot", lamps lit).
- **Notices** (arrivals, news, everything that's a toast today): **plain** — a small ink
  chip at the top centre with the person's face and one line ("**Cai** walked into the
  Courtyard"). No manuscript pages (the user, 2026-10-26).
- **Settings** (`final-settings.png`): a framed modal; a rail with a lit bar on the
  current page; the permission ask on a typed slip with a lamp button; brass-knob
  sliders; lamp switches; Sign out at the rail's foot.
- **Mobile** (`final-mobile.png`): the place's name + clock, count + me, the notice,
  "TAP · Open the lobby door", the four slots in one framed row, six framed
  keys at the foot (the Courtyard: no map key).

### How we got there

Seven rounds, all in `design/ui/`: `a/b/c-*` (hi-fi tuned, ink & paper, frost);
`d…i-*` (cozy, pixel, no chrome, team app, classic desktop, neon); `h1…h6-*` (desktop
OS eras); `w1…w6-*` (signs, stationery, Swiss, blueprint, broadcast, ski); `m1…m5-*`
(manuscript, red room, diner, case board, opening titles — the theme landed, too loud);
`c1…c5-*` (the same theme, toned down); `s1…s4-*` (with the two shows' motifs) →
**s2**, then `s2-wood-{1,2,3}` → **2, frames**. Then, cut: the people panel and the
phone's restyle, the episode number, the objective line, the manuscript pages (notices
stay plain); the minimap limited to the lot and the office.

## Phases

0. **Mocks**: done — the look above. Still to mock in it before their phase: login,
   avatar editor, emote menu, room tab, a game panel.
1. **Tokens — done (2026-10-26).** The HUD's colours are tokens in `globals.css`
   (`:root`, after the hi-fi palette: panels, edges, wells, pits, scrims, the lit key's
   amber, signals good/warn/bad/hot, errors and dangers — 46 new, by role), with today's
   values. In scope: `components/` and `app/` minus the phone, `/dev` pages and icons —
   522 hex there; 216 moved onto tokens in 30 files (and 28 in the shared classes),
   48 are plain black/white, and the 258 left are **art** (pool balls, the lift's steel, the CRT monitor, the piano, wall and
   floor swatches, avatar and desk palettes, the minimap's canvas, the console's pads).
   Black and white don't count. A few near-identical colours were merged into one token
   (≤ 4/255 apart, and the key LEDs' `#ff5a2a` → `--hot` `#ff5a36`). Checked: the UI's
   screens shot before and after with the 3D view hidden (login, HUD, emote, status,
   people, room, settings, pets, dealer, slot cars, pool, pong, console, avatar) are
   pixel-identical but for the clock's digit, the avatar's idle animation and the LED
   shift. **The check**: `src/components/colours.test.ts` (in `pnpm test`) counts hex
   per file against `colours-baseline.json` and fails if a file gains one — a HUD colour
   belongs in `globals.css`; new art goes into the baseline on purpose.
2. **The skin — done (2026-10-26).** The tokens hold the look's values (ink `#17181d`,
   text `#ece6da`, the lamp `#f1d79a` as `--amber`/`--vfd`, coral `--rust`, warm
   hairlines); signals (good/bad/hot…) kept. Fonts (`layout.tsx`, `next/font`):
   Cormorant Garamond 600 as `--font-title`, Special Elite as `--font-mono` and
   `--font-lcd`; Inter stays the body. The classes: `.cabinet` = ink in a 5 px walnut
   frame (`--wood`, one SVG-noise texture), `.cabinet.rounded-full` (the pills) = ink
   with a hairline; `.deck-btn` = an ink key with a lamp hairline, lit = the lamp;
   `.ghost-btn`, `.vfd-window`, `.lcd`, `.faceplate` (paper) restyled; new `.title`
   (spaced caps) and `.zigzag`. `Panel.tsx`: the title in `.title`, the zigzag under
   it, "esc". The amber `rgba(255,166,48,…)` glows became lamp mixes (the three on
   the page as short tokens `--lamp-tint/-glow/-ring`). **The phone** reads a few house
   tokens (`.seg`, `.grp`, its type): `phone.module.css`'s `.layer` now pins their old
   values — checked pixel-identical (its region, before/after). **Budget**: HEAD
   559.468, HEAD + this work 559.479 KB (under 559.5); the whole tree, with another
   session's uncommitted `controller.ts`, reads 559.507 — that change is +29 B.
   Unchanged here, left for their phase: TopBar's layout, the dock's groups, the hand
   slots, the minimap's canvas (art), login/avatar pages, toasts.
3. **The frame — done (2026-10-26).**
   - **TopBar**: left, a lamp mark, the room's name as the title, "world · Floor N ·
     n here" under it (`FloorChip` is now that inline "· Floor N", still
     `data-testid="floor-chip"`), the clock (and the radio) after a hairline. No
     weather: the HUD has none. Right: faces, "n online", the connection, and **me** —
     my face opens a menu: name and status, My look, Settings, Sign out (out of the
     bar). On a phone the right shows "● n" and me only.
   - **Dock**: the groups it had (talk · social · status · make), each key named under
     it from `sm` up ("Muted"/"Mic", "Camera", "Share", "Emote", "Phone", "People",
     "Status", "Build", "Pets", "Settings"); the phone's badge caps at "9+"; the status
     pill is a key. The chips above the dock went up 24 px with it (88→112, 136→160,
     184→208).
   - **Prompt**: its key drawn as a key in the lamp.
   - **Hand slots** (the dark's quick slots, `world/dark/index.ts`'s CSS): ink keys in a
     framed strip, the one in hand ringed in the lamp; the FOCO battery bar framed, in
     the lamp. The battery ring of the mocks isn't there: the torch isn't in the quick
     slots (it's the phone's light), so the bar stays the battery.
   - **Minimap**: shown in the lot (`me.area === "lot"`) or off the land (inside the
     building, any floor: `grid.onLand` false), and while building; gone elsewhere on
     the grounds. Its label in the lamp, typed.
   - Checked: `hud.spec`'s flow (a copy as Cai + Bia, no world swap) passes with the
     new top bar; shots inside, in the lot, on the lawn (no map), the me menu, a phone.
   - **Budget**: HEAD + phases 1–3 = **560.1 KB** on the page: the frame is +0.6 KB
     (the me menu, the named keys, the place card). Raised to 560.5 by the user's call.
4. **Settings — done (2026-10-26).** `SettingsPanel.tsx` in pages: a rail (tabs; on a
   phone a row on top) — Me & my look · Sound & voice · Camera · View · Graphics ·
   Controls · (admins) Team — and Sign out at its foot. Each page: its title, a line on
   what it's for, its rows in `.card`s; switches are `.sw` (an `aria-pressed` button,
   lit in the lamp), sliders `.slider` (a brass knob, the fill from `--v`), choices the
   keys they were; the device ask a typed slip (`.faceplate`) with the lamp's button
   (`data-devices-access` / `-allow` kept). Me & my look opens on "Change my look" (as
   `avatar.spec` expects); `first-person.spec` and `controllers.spec` now click the View
   / Controls tab first. Its own words live in the panel (it loads on demand), not
   in `i18n.ts`: the page stays at 560.1 KB. The account button's label became "Your
   account" ("Me: … settings …" matched specs' "Settings" by substring). Checked as Bia:
   the specs' lookups (Change my look → My look; the three views, Camera follows me,
   the hands switch; Controls → Controllers), shots of every page and a phone.
5. **Toasts — done (2026-10-26).** Plain chips (`.toast` in `globals.css`): ink, a
   hairline, a dot in the tone — the lamp (info), coral (warn), Vortex's pink (`--vortex`,
   with the edge and lamp text it had). The same texts as today: a toast carries no
   person, so no face. The dark's own `.dk-toast` (loot) is its HUD's, left. Page:
   560.1 KB (the chip's style moved to CSS).
6. **Mobile and the night — done (2026-10-26).**
   - **Phone (< 640 px)**: the dock spans the width, six keys spread (mic, camera,
     emote, phone, people, more ⋯); "More" opens the status choices, then Pets and
     Settings. The dark's quick slots sit in a row above the dock (`.dk-col` at 92 px);
     the chips above the dock go up 64 px more on a phone (112→176, 160→224, 208→272);
     the dock's menus layer over the slots (z 41 > the dark's 40). The top bar on a
     phone: the place card, "● n" and me (phase 3). `mobile.spec`'s flow (as Bia, no
     world swap) passes: no sideways scroll, the controls nav, tap to walk.
   - **Night**: the look is dark ink already, so no separate palette: checked in the lot
     at 22:00 (the frames, the lamp text read on the pitch dark). The one bright thing,
     the minimap's paper, is dimmed (`brightness(.5)`) while it's dark out.
   - Page: **560.4 KB** (budget 560.5).
7. **Login and avatar — done (2026-10-26)**, as the mocks `design/ui/p7-*.png`
   (`mock/pages.html`), approved. The signed-out pages (`AuthCard`, `.auth`): the
   framed card over the campus — `public/login-bg.webp` (the courtyard still, 40 KB),
   darkened at the edges — the brand (`Brand.tsx`: a street lamp and YUTOPIA in the
   title face), the tagline in italics, the zigzag, the label typed in the lamp, the
   submit lit, the links in a row, "Snow Campus" at the foot. The look's editor
   (`AvatarEditor.tsx`, the /avatar page and the panel in the world): a bigger stage
   (300 px on the page), Save lit, the options in tabs — Body (gender, body, skin) ·
   Hair (hair, its colour, beard) · Clothes (top, bottom, shoes, their colours) ·
   Extras (accessory, eyewear, extra) — the tabs' words in the editor (out of the world
   page). `avatar.spec`'s lookups (Feminine/Masculine, Save in the My look dialog) found
   as Bia, not saved. Pages: world 560.4, login 131.3 KB.
8. **Checks — done (2026-10-26).** The affected specs run for real (Ana + Bia, the
   demo fixture; the dev world backed up and put back after with `WorldSnapshot`, 182
   objects, layout and desks the same): `avatar` (both), `controllers`, `mobile`,
   `first-person` "hands" **pass**. Two fail, **the same with HEAD's client** (my files
   put back to HEAD, the other session's work left in): `hud.spec` times out in
   `walkTo` (Bia walking up to Ana, before any HUD check), and `first-person` "in my
   head" reads the facing off by π/2 — neither is the UI. Final shots, real game, day
   (13:00) and night (22:00): `design/ui/final-live/` (desk: studio, lot, lawn; phone:
   studio, lot). Pages: world 560.4 / 560.5, login 131.3 / 160 KB.

## Risks

- e2e specs find elements by title and label ("People", "Status", "Sign out"). Moving
  Sign out into the me menu changes `hud.spec` and any spec that signs out.
- The phone isn't touched: its shell, screens and how it layers stay as they are.
- Two web fonts join the first load (Cormorant Garamond, Special Elite) and the wood
  is one texture: weigh both against the page budget (`next/font`, subsetted).

# VortexOS on the studio's computers (plan, 2026-10-16)

> **Status: delivered (2026-10-16), M0–M5** — see PROGRESS.md → "VortexOS on the
> computers" for what shipped, how it was checked and the deviations. The user's
> calls: build against the live VortexOS (`vortex.serious-sam.dev`), all
> recommended decisions, VortexOS changes made in `~/Developer/projects/vortex`
> for the user to deploy.

Ask: "Add VortexOS on Computer inside Yutopia! I already have a live VortexOS
running on https://vortex.serious-sam.dev/ — I wanted the computer items to be
interactive and a VortexOS page that inits like a real OS."

## Short answer

Yes, and most of the plumbing exists on both sides. The shape:

- **A `computer` item** (a CRT on a desk, with a keyboard) that you *use* like
  the arcade or the piano: walk up, sit, press X. It is a **display** (an entry
  in `GLASS`), so the world already knows how to put a live picture on its glass
  in iso and in 3D.
- **The real OS runs in a panel**, embedded from `vortex.serious-sam.dev` the
  way the arcade embeds Yondra's `/arcade` (`YondraFrame`). It boots the way
  VortexOS boots today — **POST → wordmark + boot chord → "Enter Network
  Password" → desktop** — minus the "Are you ready?" splash, which is only there
  to get a click for the AudioContext (the click on the computer in the world is
  that click). VortexOS cannot be drawn into the world's canvas (it is a DOM app,
  like YouTube's player), so:
- **Everyone else sees a drawn picture on the monitor**: the power-on, the POST
  text, the logo bar, the login clouds, the desktop in that person's era with a
  taskbar and the window of the app they have in front (Paint, Doom, Messenger…),
  a screensaver when they idle, "It's now safe to turn off your computer" when
  they stand up. A handful of `postMessage` events from the OS drive it; the
  world-server relays them so the picture is the same on every client, with the
  same timeline logic the TVs use.
- **Sign-in:** VortexOS has its own accounts (username + password, Spring
  Security JWT). M1 uses them as they are (the frame keeps its session in its
  own storage, so you log in once per browser — and a password prompt *is* what a
  1998 network PC does). M4 adds **sign-in with Yondra**: a one-time code minted
  by Yondra (the same mechanism as the Yondra → Yutopia handoff), exchanged by
  the VortexOS backend against Yondra, auto-provisioning a VortexOS account
  linked to the Yondra user. After that the computer boots straight to *your*
  desktop.

Three repos are touched: this one (the item, the drawn screen, the panel, the
server feature), **`vortexos-frontend`** (a host mode + the bridge, a header in
nginx) and, for M4 only, **`vortexos`** (the backend exchange) and Yondra (the
handoff endpoint). The VortexOS repos are not cloned on this Mac yet
(`github.com/Serious-Sam97/vortexos-frontend`, `…/vortexos`).

## What is there today

| Side | What exists | Where |
|---|---|---|
| Yutopia | Things you use with a body pose for everyone (`use` → `busy`: arcade, piano, whiteboard, gamepad…) | `world-server/features/play.ts`, `shared/protocol.ts` `USES`, `controller.syncBusy` |
| Yutopia | Displays: a canvas per glass, mounted on the item's face in iso and as a quad in 3D; CRT warm-up / collapse, floor glow at night; `tv_portable` is already a *top* display on desks | `shared/media.ts` `GLASS`, `world/media/room.ts`, `tp/live.ts` |
| Yutopia | Embedding another app in a panel with a token handshake over `postMessage` (origin-checked both ways, Esc closes from inside) | `hud/YondraFrame.tsx`, `hud/ArcadePanel.tsx`, Yondra `/embed/yutopia` |
| Yutopia | "Typing" pose: seated at a desk seat with a monitor or keyboard top within 1.7 tiles | `engine.atWork`, `people3d` `typing` |
| Yutopia | Desks are bare; monitors and keyboards are `tabletop` decor (`props.d`), placed by the dressing presets | `shared/tops.ts`, `shared/dressing.ts`, `art/items/clutter.ts` |
| Yutopia | Vortex's 1989 terminal (`crt_terminal`) — a text UI talking to his Yondra chat; the lore says Yondra was "ported from VortexOS" | `hud/VortexTerminal.tsx`, `design/vortex-mk5/01-lore-biblia.md` §2.1 |
| VortexOS | React + Vite + react95 SPA; routes `/` (Intro: ready → POST → logo), `/vortex` (login gate → desktop), `/shutdown`; eras 95/98/NT4/2000/XP/Vista/7/Vortex; tablet mode; a CRT overlay; PWA + service worker | `src/pages/Intro.tsx`, `src/pages/Vortex.tsx`, `src/system/eras.ts` |
| VortexOS | Accounts: `POST /auth/login` / `register` → `{ token, username }`; session in `localStorage["vortex.session"]`; login/logout **hard-reload** `/vortex`; profile + open windows synced to the backend (`/profile`), so a desktop restores on any machine | `src/system/session.ts`, `src/contexts/AuthContext.tsx`, `src/system/profile.ts` |
| VortexOS | Presence: the focused app's name + active/idle/away, every 4 s, over its WebSocket | `src/components/PresenceReporter.tsx` |
| VortexOS | nginx proxies `/auth`, `/files`… and `/ws` to `vortex-backend.serious-sam.dev`; **no `X-Frame-Options` / `frame-ancestors`** → anyone can frame it today; the backend's CORS allow-list is `vortex.serious-sam.dev` + localhost | `nginx.conf`, `SecurityConfig.java` |
| VortexOS | An iframe app bridge already exists *inside* the OS (`__vortex` call/reply over `postMessage`, for sandboxed apps) — the same idea, pointed the other way | `src/components/Apps/SandboxApp.tsx` |

## Decisions to take

| Topic | Options | Recommendation |
|---|---|---|
| Which items are computers | (a) a new `computer` item only · (b) also turn today's desk `monitor` decor into computers | **(b)**: `computer` in the catalog (Screens & TVs) and a one-time conversion of `tabletop/monitor` → `computer` when a space loads (written back on its first edit, like the v1 → v2 map conversion). Off, it draws exactly like the monitor, so no room changes its look; every desk in the studio becomes usable at once. |
| Sign-in | (a) VortexOS's own login · (b) sign in with Yondra | **(a) for M1–M3, (b) as M4.** (a) needs no backend work and the frame remembers you; (b) is the real-OS feel ("boots to *your* desktop") and keeps one identity across the three apps. |
| Standing up | (a) the OS keeps running on the monitor, unattended · (b) log off + shutdown | **(b)**: closing the panel posts `yutopia:bye`; the OS saves (its profile sync already races a 1.5 s timeout), shows "Windows is shutting down…", the monitor in the world shows the orange "It's now safe to turn off your computer" and goes dark. Your open windows come back on the next boot (VortexOS restores the process table from the profile). Nobody has to watch a lit screen with no one at it. |
| One or many | one person per computer | **One.** Someone already there → "Sam is using it"; the picture on the glass is theirs. |
| The picture others see | (a) a static "on" glass · (b) a drawn desktop that follows what the person does | **(b)**, it is the whole point: the boot, the era's chrome, the focused app's window title, the screensaver. ~10 KB of canvas drawing in a lazy chunk. |
| Lore | nothing · a fragment + Vortex lines | **A small M5**: he wrote that OS. |

## The experience

1. **A computer on a desk.** Builders place it from Screens & TVs (a beige 14"
   CRT, a black 17", each with a keyboard; a mini-tower under the desk is a
   variant). Existing desks already have one after the conversion. Off, it is a
   dark glass with a reflection and a tiny amber standby LED.
2. **Walk up and press X** (or click → *Use*). If a desk seat is in reach you
   sit and face it; with no seat you stand at it (reach 1.6 tiles, like the
   arcade). In the world the monitor **powers on**: the CRT warm-up line,
   then white POST text line by line, the era's wordmark with its progress bar,
   the clouds with the login box. For everyone, including you, in iso and 3D.
3. **The panel** opens on the warm-up: a CRT monitor bezel (beige plastic,
   a power LED, "VORTEX MultiSync 1489" badge, a *Stand up* button and a
   fullscreen toggle), the OS inside. It boots for real — POST, wordmark, boot
   chord — then the Win9x "Enter Network Password" dialog. You sign in (M1) or
   it signs you in with Yondra (M4). Your own desktop appears, with the windows
   you left open last time.
4. **Use it.** Everything VortexOS does: Explorer, Notepad, Paint, Terminal,
   Messenger with the other VortexOS users, Doom, the pet… Keys go to the OS
   while the panel is focused (WASD does not walk you). Voice chat continues;
   people see you *typing* (hands on the keyboard) and your name tag says
   "on VortexOS · Paint". The monitor in the world shows the era's desktop with
   a window titled with the app you have in front, and the taskbar clock.
5. **Idle** for a minute in the OS → its screensaver (VortexOS has one) and the
   world's glass shows one too (flying windows / starfield / pipes, drawn, by
   era). Move the mouse: back to the desktop.
6. **Stand up** (the bezel button, click outside, or walk away in build mode)
   → shutdown on both sides, the monitor collapses to a dot, the standby LED.
   The next person who sits down boots it again.
7. **First person / third person:** the same panel; the glass in 3D shows the
   same picture (it is the same canvas the iso view maps). On phones the panel is
   full screen and VortexOS runs in its tablet mode.
8. **Sound:** a soft click + fan hum from the computer while it is on, heard by
   people nearby (synthesized, like everything); the OS's own sounds (boot chord,
   ding, Doom) play from the panel, for you only.

## What gets built — Yutopia (this repo)

### The item (`packages/shared/src/catalog.ts`, art in `art/items/tech.ts`)

- `computer: { label: "Computer", w: 1, h: 1, solid: false, onSurface: true, interact: "computer", buildable: true, variants: 3, light: amber 1.5 }` — a *top* item 2×2 cells (`tops.ts` `KIND_SIZE`), like `tv_portable`.
  Variants: beige 14" CRT + beige keyboard · black 17" + black keyboard ·
  beige with a mini-tower that draws beside the desk's pedestal (`props.tower`).
  `props.era` is not stored — the picture takes the era from whoever is using it.
- `GLASS.computer = { x0, x1, y, z0, z1, aspect: 4/3, look: "crt", top: true }`
  so `glassCorners` / `displaySpot` / `isDisplay` work; `showsMedia` stays false
  for it (it never plays YouTube; the screen module owns its glass).
- `engine.atWork` also counts a `computer` within 1.7 tiles of the seat.
- Conversion (`shared/convert.ts`): `tabletop` with `props.d === "monitor"` →
  `computer` (variant by the old seed; a keyboard top right next to it is
  removed since the computer draws its own). The built-in Studio map and the
  dressing rules (`dressing.ts` desk presets) place `computer` instead of
  `monitor` + `keyboard` from now on. Screenshot baselines re-checked: off, the
  drawing is pixel-identical by construction (same `monitor()` sketch).

### The picture on the glass (`apps/client/src/world/os/`, lazy chunk `yutopia-os`)

A canvas per computer, like `media/room.ts` makes one per TV (the two share the
mount / warm-up / collapse / glow code — pull those into `world/glass.ts` so a
display is "media" or "os" by kind). Drawn from a small **state** (below), not
from a video:

| Phase | What is drawn (320 × 240) |
|---|---|
| `off` | the dark glass + reflection, amber standby dot |
| `post` | black, white Courier lines appearing one per 200 ms (the same lines the OS prints: memory check, drives, "VortexOS BIOS — <era> Edition"), a blinking cursor |
| `logo` | black, the era's wordmark colours (95 clouds / 98 blue bar / XP green bar / Vista aurora…) and a filling bar; `logo` lasts the same 2.4 s as the OS's |
| `login` | the clouds bitmap (drawn: a soft blue sky with two cloud blobs) and a grey dialog |
| `desktop` | the era's desktop colour or a drawn stand-in for the wallpaper, a taskbar in the era's chrome with a Start button and a clock (real time), one window with the focused app's title in the era's title bar (centred, 60 % of the glass), a cursor that drifts a little |
| `saver` | by era: flying windows · starfield · 3D pipes (2D-faked) · mystify lines |
| `shutdown` | "Windows is shutting down…" then the orange "It's now safe to turn off your computer" on black, 2 s, then the CRT collapse → `off` |

Tints and scanlines come from the existing CRT look. At night the glass lights
the desk and the sitter's face (the display glow that TVs already have). The
chunk also lights the amber LED when `off`. Budget line: `yutopia-os` ≤ 15 KB.

### Server (`apps/world-server/src/features/computer.ts`, shared `shared/computer.ts`)

- Schema: `computers: MapSchema<ComputerState>` keyed by object id:
  `{ sid, uid, name, phase, app, era, since }` (`phase` as above, `app` the
  focused app's name, `era` the user's era id). Nothing is persisted; a space
  restart turns every computer off.
- Messages (`shared/protocol.ts`):
  - `computer:use { id }` → checks reach (seat with the computer in 1.7, or
    standing within 1.6), refuses when someone else has it (`computer:busy`
    toast). Sets `phase: "post"`, `busy: "computer"` on the player (`USES` +
    `computer`), starts the timeline.
  - `computer:phase { id, phase, app?, era? }` — only from its user, rate-limited
    (≤ 4/s), phases validated as a state machine (`post → logo → login →
    desktop ⇄ saver → shutdown → off`); the server stamps `since` so late
    joiners draw the right frame (the POST lines advance by the clock, like the
    media timeline does).
  - `computer:leave { id }` (and on `leave`, on standing up, on walking out of
    reach, on the object being removed in build mode) → `shutdown`, then `off`
    after 2.5 s by the server's own timer.
- Tests (`rooms.test.ts` style): use from reach, refused out of reach / when
  taken, phases from the wrong client dropped, leave → off, removal in build
  mode turns it off, a tampered phase order refused.

### The panel (`components/hud/ComputerPanel.tsx`, lazy like the others)

- `Panel` with its own `size` (a 4:3 bezel, up to 1024 × 768 + the frame; full
  screen on phones). The bezel is drawn with the HUD's CSS (beige, the LED, the
  badge), the OS inside an `<iframe>`:
  `https://vortex.serious-sam.dev/vortex?host=yutopia` with
  `allow="autoplay; fullscreen; gamepad; clipboard-write; pointer-lock"` and
  `allowfullscreen`. Origin from `NEXT_PUBLIC_VORTEXOS_URL` (dev: a local Vite
  on `:5173`).
- Phases on the Yutopia side while the frame loads: `power` (the CRT warm-up as
  CSS, 0.5 s) → the frame's own POST takes over. If the frame never says hello
  (6 s), "NO SIGNAL" and a *Try again* button (same pattern as the Yondra
  bootstrap's failure line).
- The bridge (`world/os/bridge.ts`), both directions **origin-checked and
  `source`-checked** like `YondraFrame`:

  | From | Message | Meaning |
  |---|---|---|
  | OS → world | `vortexos:hello` | the frame is up; the world answers `yutopia:hello { name, lang, era? }` (the name only pre-fills the user-name field) |
  | OS → world | `vortexos:phase { phase }` | `post` / `logo` / `login` / `desktop` / `saver` / `shutdown` |
  | OS → world | `vortexos:user { username, era }` | after sign-in (and when the era changes in the Time Machine) |
  | OS → world | `vortexos:app { name }` | the focused window's app (PresenceReporter already knows it); `""` for none |
  | OS → world | `vortexos:bye` | saved; safe to unmount |
  | world → OS | `yutopia:bye` | the person is standing up; save and show the shutdown screen |
  | world → OS | `yutopia:auth { code }` | M4: sign in with Yondra |

  The panel forwards phase / user / app to the server as `computer:phase`
  (deduplicated, so it is ~1 message per change, not per tick).
- `syncBusy`: panel kind `computer` → `use: "computer"` (hands on the keyboard);
  the name tag gets "on VortexOS · <app>" from the computer state (`people` rows
  already carry `busy`).
- Esc belongs to the OS (its menus use it); the panel closes from the bezel
  button, the backdrop, or `vortexos:phase: shutdown` (Start ▸ Shut down inside
  the OS).
- Mouse look (Z) is released when the panel opens, as for every panel.

### Sound (`world/foley.ts`)

Power click + a short CRT degauss *thunk*, then a low fan hum while `phase !==
off`, spatialised from `displaySpot` with `hearingGain` (quiet; the lounge's
room tone is louder). The OS's sounds stay inside the frame.

### 3D (`tp/live.ts`)

Nothing new: the computer's canvas is one more `Live` (glow on, `fit` 4:3).
First person at the desk looks straight at it; pressing X while seated opens
the panel.

### i18n, build mode, e2e

- PT strings through `tr()`: "Computer", "Use", "Stand up", "Someone is using
  it", "on VortexOS", "No signal".
- Catalog card with the real art; the Furnish thumb from the lazy item chunk.
- `e2e/computer.spec.ts`: place a computer on a desk in the Lab, sit, X → the
  panel opens and the frame loads (a local VortexOS build in CI, or the live
  site behind an env flag), the computer state goes `post → … → desktop` for a
  second browser (Bia sees Ana's glass phase and "on VortexOS"), Bia's X is
  refused, Ana stands up → `off`. `media-shots`-style shots of the glass phases
  from its canvas (deterministic: frozen clock).

## What gets built — VortexOS (`vortexos-frontend`)

- **Host mode:** `/vortex?host=yutopia` (kept in `sessionStorage["vortex.host"]`
  across the hard reloads login / logout do, like Yondra's `yd:yutopia-embed`).
  In host mode:
  - the Intro's `ready` phase is skipped: `/vortex` with no session runs POST →
    logo itself before the login screen (today those live in `Intro` at `/`;
    move the two phases into a `Boot` component both routes use). The boot chord
    waits for the first pointer / key inside the frame (autoplay policy), and
    the POST lines are the real ones.
  - Start ▸ Shut down shows the shutdown screen *inside* the frame and posts
    `vortexos:phase: shutdown` instead of navigating to `/shutdown`.
  - the bridge above: `postMessage` to the allow-listed parent origins only
    (`VITE_HOST_ORIGINS`, default `http://localhost:3100,http://localhost:3101`),
    `e.origin` checked on every message in; `vortexos:app` from
    `PresenceReporter`'s existing `focused` (throttled to changes).
  - `yutopia:bye` → `pushProfile(true)` raced with 1.5 s (what `logout()` does),
    then `vortexos:bye`.
  - the PWA install prompt and the "installable" banner stay quiet in a frame.
- **nginx:** `add_header Content-Security-Policy "frame-ancestors 'self' https://<yutopia origin> http://localhost:3100 http://localhost:3101" always;` on `location /` — today anyone can frame the OS.
- **Storage:** the frame's `localStorage` is partitioned by the top-level site
  in every current browser, so the VortexOS *inside Yutopia* has its own local
  `C:` and session — fitting (it is another machine) and harmless: the cloud
  drive, profile, era and open windows are per account on the backend and
  follow you.

## What gets built — M4, sign in with Yondra (`vortexos` backend + Yondra)

- Yondra: `POST /api/vortexos/handoff` → a 48-char code in cache for 60 s bound
  to the user (`YutopiaController::handoff` is the template), and a signed
  internal `GET /internal/vortexos/handoff/{code}` (HMAC with a shared secret
  `VORTEXOS_SHARED_SECRET`, like `YutopiaInternalController`) that *pulls* the
  code and returns `{ id, name, email }`.
- VortexOS backend: `POST /auth/yondra { code }` → calls Yondra with the HMAC,
  finds the `app_user` with `yondraUserId = id` or creates one (username from
  the Yondra name, de-duplicated; `password` null → `/auth/login` refuses it
  until the person sets one in Control Panel ▸ Users), issues its own JWT, same
  `{ token, username }` shape. `User` gains `yondraUserId` (nullable, unique).
  Existing VortexOS users can **link** from Control Panel (sign in normally once
  inside Yutopia → "Link this account to Yondra" → the next boot is automatic).
- Frontend: `yutopia:auth { code }` on the login screen → `/auth/yondra` →
  `setSession` → the usual reload into the desktop. The Yutopia panel asks
  Yondra for a code when the frame says hello without a session.
- Tests: Yondra (code minted, pulled once, expired), VortexOS
  (`AuthControllerTest`: a stubbed Yondra, provision, link, password-less login
  refused), e2e: Ana boots a computer → her desktop with no dialog.

## Milestones

| | What | Exit test |
|---|---|---|
| **M0 — spike (½ day)** | The live OS in an iframe inside the dev client: does it boot, sign in, keep its session across its own reloads, run Doom / Messenger / the Terminal; pointer-lock and gamepad in a cross-origin frame; a SharedArrayBuffer-needing game (xash3d CS) in a frame with no COOP/COEP on the parent; the frame's `postMessage` reaching the parent through Cloudflare's injected beacon. Clone the two VortexOS repos next to `yondra/`. | A written list of what works in the frame as-is and what needs host mode. |
| **M1 — the look (image-first)** | Mock images: the computer on a desk (3 variants, day / night, off / booting / desktop, iso + 3D), the panel bezel with the OS inside, the glass phases strip. | Approved images. |
| **M2 — the item + the picture** | `computer` in catalog / tops / art / GLASS, the conversion, `world/os` drawing every phase from a dev page (`/dev/os`: every phase × era, frozen clock), the server feature + tests, the body pose, the name tag, the sound. No OS yet: X plays the phases from a fake timeline. | Two browsers: Ana's X boots the glass for Bia; Bia refused; Ana leaves → off. Shots match M1. |
| **M3 — the OS** | VortexOS host mode + bridge + nginx header (deployed), the panel with the frame, phases driven by the real OS, "on VortexOS · app", Stand up → bye → shutdown. | e2e `computer.spec`: boot → login → desktop → Paint focused shows on Bia's glass → stand up → off. Works in iso, 3P, 1P and on a phone (tablet mode). |
| **M4 — sign in with Yondra** | Handoff + exchange + linking. | Ana sits down → her VortexOS desktop with no dialog; a linked existing account keeps its files. |
| **M5 — lore + polish** | Vortex (the NPC) reacts to a boot chord nearby ("*kkzzt* i wrote that chord. 1989. nobody paid me."), a fragment **Y04** for the first VortexOS sign-in from inside the studio (allow-listed in `vortex_fragments.php`, like Y01–Y03), the server-room terminal's `help` mentions the desks; screensavers by era; Low quality tier draws the desktop phase only (no saver animation); budgets. | Fragment granted once; Vortex suites green; `pnpm budget` (world page ≤ 520 KB, `yutopia-os` ≤ 15 KB). |

## Risks

- **Frames and games.** Pointer lock, gamepad and fullscreen work in a
  cross-origin frame only with `allow=…`; **SharedArrayBuffer does not** unless
  the *top-level* page (Yutopia) sends COOP/COEP, which would break YouTube
  embeds and Jellyfin streams → games that need it (xash3d) will not run inside
  the studio's computers; js-dos (Doom) runs without it. M0 lists which.
- **Autoplay.** The boot chord needs a gesture *inside the frame's document*
  (activation does not cross origins). Host mode plays it on the first click /
  key in the OS; the world's own power-on sound covers the gap.
- **Cloudflare.** The HTML is `no-store` and dynamic through Cloudflare; the
  `frame-ancestors` header must be added in nginx (Cloudflare passes it). Rocket
  Loader / email obfuscation, if ever enabled on that zone, would rewrite the
  bundle — keep them off.
- **Two identities until M4.** A person is "Ana" in the studio and "neo" in the
  OS; Messenger inside the OS shows VortexOS names. Fine for M1–M3, solved by
  linking.
- **Storage partitioning** makes the in-studio OS a separate local machine
  (see above). A person who never signs in loses nothing; a person with local
  files at `vortex.serious-sam.dev` will not see them inside Yutopia unless they
  are in `/mnt/cloud`. Say so once in the Welcome Center when `host=yutopia`.
- **Hard reloads** inside the frame (login / logout / register) drop the
  `?host` query — hence `sessionStorage`. A reload also re-registers the
  service worker; harmless.
- **Key capture.** While the frame has focus every key is the OS's — including
  Esc and the studio's T / Z / X. The bezel button is the way out, and the HUD's
  chat input stays reachable by clicking it (focus leaves the frame).
- **Load on the OS backend** is one WebSocket + presence per person at a
  computer; nothing new.

## Not in this plan

- Drawing the real OS pixels into the world (impossible for a DOM app; the
  drawn stand-in is the design).
- Two people on one computer, or a shared "network" between the studio's
  computers (Messenger inside the OS already is that).
- Yondra inside VortexOS (a "Yondra" app in the OS's Start menu is a one-line
  Browser shortcut later, not now).

## Open questions (for you)

1. The two VortexOS repos: clone them beside `yondra/` so the host-mode work
   happens here, and how is `vortex.serious-sam.dev` deployed today (the
   Dockerfile + nginx image on the same box, or Vercel)? M3 needs a deploy of
   the frontend and M4 of the backend.
2. Yutopia's production origin for the `frame-ancestors` list and
   `VITE_HOST_ORIGINS`.
3. M4's account policy: auto-create `ana` from the Yondra name, or always ask
   on first boot ("Create a VortexOS account for Ana?" with a link option)?

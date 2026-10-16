# Fita 14 — The cellphone, running Vortex Mobile (plan, 2026-10-16)

> **Status: delivered (2026-10-16), P0–P6** — see PROGRESS.md → "Fita 14 — The
> cellphone" for what shipped, how it was checked and the deviations. Decisions:
> Vortex-era look, P + a phone key in the dock, a #space thread, video calls in v1.
> Mocks: `design/screens/phone/`; built: `design/screens/phone/built/`.

Ask: "Add Cellphone with Vortex (New OS for mobile). Remove the chat, add the
cellphone. Can send messages, can call, GPS (future), camera (take pictures),
customise the phone (wallpaper, ringtones), a Vortex Store to install apps (we
will create later). Cellphone usage similar to GTA 5. I want quality on this,
let's plan first."

Bar (the pets lesson, `yutopia-quality-bar`): the phone is **a real object in
the world** — your character takes it out of a pocket, holds it, raises it to
the ear, lifts it for a photo, and everyone around sees that. It rings out loud
from where you stand. The OS is designed, not a form. Checked in iso, 3D and
first person, day and night, before it is called done.

---

## 0. The GTA 5 feel, translated

| GTA 5 | Yutopia |
|---|---|
| ↑ pulls the phone out; it slides up bottom-right; you keep walking | **P** or the **phone icon in the dock** (where the Chat button was) pulls it out (arrows walk here, see § 9). It slides up bottom-right, about 1/3 of the screen height; **WASD keeps walking**, the camera keeps following |
| Arrow keys move over a 3×3 app grid, Enter opens, Backspace goes back, ↓ puts it away | While the phone is out the **arrow keys drive the phone** (WASD still walks), Enter opens, Backspace / right-click goes back, **P** or Esc puts it away. The mouse and wheel work on it too; on a touch screen it's a full-height bottom sheet |
| The character holds the phone in front, head down; at the ear during calls | Same, for everyone, in both views: *texting* (phone low, both hands, head tilted), *on a call* (phone at the ear, free hand gestures while walking), *photo* (phone raised in front), *selfie* (arm out, phone facing you) |
| Incoming call: the phone pops up by itself and rings | Same. The ringtone plays **from your body** for people nearby (positional, like your voice), and plain for you. Vibrate-only = a buzz people near you hear faintly |
| Texts arrive with a tone and a little peek of the phone | Same: a banner peeks from the bottom-right with the sender's face and first line; P opens straight into that thread |
| Camera: the view goes through the lens, selfie flips to your face, filters, flash | Same: the screen *becomes* the viewfinder (iso or 3D), selfie turns a camera to your face in 3D, a few film filters, the shutter flash is seen by people around you |
| Sleep mode, ringtones, wallpapers, themes in Settings | Same, plus the **case colour**, which everyone sees |
| Contacts you can call (incl. story characters) | Your team + **Vortex** as a contact: he texts back in character and **answers calls in his voice** |
| Internet app, Snapmatic, etc. | **Vortex Store** (installs apps later), **Maps** slot for GPS (later) |

## 1. What we remove — the chat

From the chat map (2026-10-16): the chat is space/area/nearby text with no
history, no persistence and no DMs. Removing it:

- **Client:** SidePanel's Chat tab (`ChatTab`, `Message`, scope chips, composer,
  reactions), `chat` / `chatUnread` in `world/store.ts`, `controller.chat()` /
  `react()`, the `chat` / `chat:react` handlers, the dock's Chat button (becomes the Phone button, same badge),
  Enter-to-chat, chat-only i18n keys (`chat`, `area`, `space`, `say*`,
  `noMessages`, `send`, `react`, `sayTo`; `controlsHelp` and `avOffline` reworded).
- **Shared / server:** `ChatScope`, `MAX_CHAT`, the `chat` / `chat:react`
  messages, `SpaceRoom` `chatLog` / buckets / `takeChatToken`, the unused
  `Feature.chat` hook; tests `world.test.ts` "chat reaches people…", `rooms.test.ts`
  chat reactions; e2e `hud.spec.ts` chat part, `third-person.spec.ts` chat bubble,
  `mouse-look.spec.ts` "Enter lets go".

What **stays**:

- **Speech bubbles** (`engine.say`, `tp/view.ts say`): Vortex's lines and pet
  sounds use them. Only the chat stops feeding them.
- The side panel keeps **People** and **Room**; the **"who can hear you"** strip
  (`Earshot`, it reads voice hearing, not chat) moves to the top of People.
- **Vortex's lines** that used to land in the chat feed (`vortexLog`): public
  lines stay as bubbles; **personal lines arrive as texts** in his thread on the
  phone (so they aren't lost, and it's funnier).
- The person action menu and `PersonCard` gain **Message** and **Call**.

## 2. The object — hardware

- **One phone model, drawn as a real 3D model** (three.js, like the pets and
  tables) and rendered into the iso prop sprite from the same model, so both
  views match. ~6 × 12 cm: slab with rounded corners, a camera bump, a side
  button, a speaker slit. Small in the world (the hand is ~1 tile scale), so the
  story is in the silhouette, the **case colour** and the **lit screen**.
- **Case colours** (your pick, everyone sees it): the house palette — walnut,
  cream, rust, olive, graphite, brass — plus a clear "Vortex" case with a faint
  glow. Stored in your avatar (`AvatarLayers.phone`, Yondra validates it).
- **The screen is emissive** (an allowed glow, like VFDs): at night in a dark
  room your face is lit by it in 3D; in iso a small glow under the hand.
- **The on-screen phone** (the UI you use) is the same object, big: a drawn
  frame in your case colour around the OS, with the side button and a subtle
  reflection — not a flat rectangle.

## 3. The OS — Vortex Mobile

A new OS, sister of VortexOS (`vortex.serious-sam.dev`). VortexOS's own
"Vortex OS" era is "the one place the OS stops imitating and becomes itself"
(holographic glass, the portal orb, the retrowave grid, the Vortex boot chord) —
Vortex Mobile is that era on a phone. Lives **inside Yutopia** (React, lazy
chunk), not an iframe: it has to be instant, drive the avatar and the world
camera, and work offline-first. (Look options in § 9.)

- **Boot** the first time each session: the portal orb opens, the boot chord
  (short), "Vortex Mobile" wordmark; later pull-outs wake straight to the lock
  glance (time, date, unread) → home with a swipe/Enter.
- **Status bar:** time (the world's clock), signal bars (full; *fewer bars in
  booths* as a joke), battery that never drains (Vortex comments if you look at
  it too much), DND moon.
- **Home:** 3×3 grid like GTA, two pages: **Phone · Messages · Camera ·
  Gallery · Contacts · Settings · Vortex Store · Maps (soon) · Vortex**. A dock
  of four on the bottom of the home page. Badges on Phone / Messages.
- **App framework** (`phone/apps.ts`): every app is a manifest `{ id, name,
  icon, chunk, permissions }` + a lazy component, so the Store can install more
  later without touching the shell. Installed apps per person (Yondra), the
  built-ins pinned.
- **Motion:** apps zoom out of their icon, back slides, the phone itself slides
  up with a little overshoot. Reduced motion → fades.
- **Sounds** (all synthesized like the rest of Yutopia, `foley.ts` /
  `pianoNote`): unlock, keypress, send whoosh, receive tone, shutter, ringtones.

## 4. Messages

- **Threads:** 1:1 and groups (name, members, up to 50). Plus one automatic
  **group per space** ("#Studio") so a space-wide note is still possible after the
  chat goes.
- **Contacts = your team**: everyone who's a member of a space you're in
  (Yondra), online or not, with their face portrait (`Face.tsx`) and where they
  are right now (space, room, "on a call", "offline"). Vortex is always there.
- **Messages:** text (up to 1000 chars), photos from the gallery/camera,
  reactions (the 8 drawn emotes), replies, *typing…*, delivered/read ticks,
  the time. Links clickable. Search inside a thread.
- **Persistence: Yondra owns it** (it owns users): `yutopia_threads`,
  `yutopia_thread_members` (last read, muted), `yutopia_messages`. The
  world-server relays live to online members **in any space** (one small Redis /
  HTTP fan-out through Yondra's existing private channel `App.Models.User.{id}`,
  which Yutopia already can listen to via `lib/echo.ts`); offline members see it
  next time. Optional: a Yondra notification if unread for 10 min (the existing
  `Notifier`, honouring their preferences).
- **Peek:** banner bottom-right with the face, name, first line; text tone;
  phone badge on the dock. DND/sleep: silent, badge only.

## 5. Calls

- **Dial** from Contacts, Phone (recents, favourites, keypad for fun: dialling a
  few secret numbers does things — lore), a thread, or a person in the world.
- **Ringing:** caller hears the ring-back tone; callee's phone pops up with the
  caller's face, **rings out loud from their body** for people nearby,
  vibrates. Accept / Decline / "Text instead" (quick replies). 30 s → missed
  call (+ a voicemail? — later).
- **The line:** every call is its own LiveKit room `call-{id}` (token minted by
  Yondra, like the space token). That makes calls work **across spaces, inside
  booths and private rooms**, and needs no change to the hearing rules: the
  space room still carries your voice to people near you (they hear *your* side
  of the call — very GTA), the call room carries the other side only to you.
  The far voice gets a light **phone filter** (band-pass + a touch of
  saturation; "Speaker" turns it off and lets people near you hear the other
  side too — positional, through your body).
- **In call:** timer, mute, speaker, **video** (switches to a FaceTime-style
  view with their camera, your camera PiP — uses the camera you already have),
  add someone (group call, up to 8), hang up. You keep walking; the phone stays
  at your ear; P/Esc puts the UI down but the call goes on (a pill at the top:
  "On a call with Bia · 03:12 · end").
- **Status:** "on a call" on name tags (a small handset icon) and in Contacts;
  calling someone already on a call → busy tone.
- **Calling Vortex:** he answers (sometimes he doesn't, sometimes he calls
  back at a bad time), speaks his line with **his Yondra voice** (`vortex/voice/
  tts.ts`, worn microcassette), and you can talk back by text. In character always.

## 6. Camera and Gallery

- **Modes:** *Photo* (what you see, through the lens) and *Selfie*.
  - **3D (third/first person):** Photo = first-person lens from your head,
    mouse/arrows aim, wheel zooms (FOV). Selfie = the `gameCam` override puts a
    camera at arm's length in front of your face looking back (your body stays
    drawn — new exception to the "hide me under gameCam" rule), you can turn
    left/right to frame the background, your face does the pose you pick.
  - **Iso:** Photo = a frame over the world you can drag/zoom (pinCamera),
    Selfie = a tight portrait of your character in the iso view with the
    background, the pose you pick.
- **Poses for the shot:** smile, peace sign, wink, point, thumbs-up, the 8
  emotes; friends in frame can join (they see "Sam is taking a photo").
- **Filters:** none, *Film 84* (warm grain), *VHS* (chroma bleed + scanline),
  *B&W*, *Polaroid* (frame + caption). Drawn on a 2D canvas after capture.
- **Capture:** iso `renderer.extract.canvas(stage, frame)`; 3D render once and
  `drawImage(gl.domElement)` in the same task (as pet portraits do) → JPEG
  1600 px max, ~200 KB.
- **The world sees it:** your arm raises the phone, a **flash** on people
  near you, the shutter click (positional).
- **Gallery:** grid, viewer with swipe, delete, **set as wallpaper**, **send**
  (to a thread). Stored in Yondra: `yutopia_photos` + private disk,
  signed URLs (the `ImageUploadController` pattern, Yutopia-scoped), quota 300
  photos/person.

## 7. Customise (Settings)

- **Wallpaper:** 12 designed ones (the portal orb, retrowave grid, the studio
  at golden hour, the snow campus, a cassette, Vortex being Vortex…) + any of
  your photos; lock screen and home separately.
- **Ringtone / text tone:** ~10 ringtones and 6 text tones, synthesized
  (sequencer like the lo-fi radio's): "Vortex Chord", "Cassette Rewind",
  "Hi-Fi Bleep", "City Pop", "Synth Bass", "Old Bell", "Arcade", "Rotary",
  "Silent" … each previewable; per-contact ringtone.
- **Case colour** (seen by everyone), **theme** (light/dark glass),
  **text size**, **vibrate**, **Sleep mode / DND** (ties into your existing
  `dnd` status so calls don't ring), **volume** (effects bus).
- Saved in Yondra (avatar/profile JSON) so your phone is the same on any
  machine; the local cache is `prefs`.

## 8. Vortex Store and Maps (shells only now)

- **Store:** the designed storefront (featured banner, categories, "Install"
  buttons) showing the built-ins as installed and a few "Coming soon" cards
  from Vortex. The install mechanism (manifest list per person) exists from P1.
- **Maps:** the icon is there with "GPS coming soon" (or the minimap of the
  space as a placeholder — § 9).

---

## 9. Decisions to take

| Topic | Options | Recommendation |
|---|---|---|
| Look of Vortex Mobile — **chosen (a)** | (a) VortexOS's **Vortex era** on a phone — holographic neon glass, portal orb, retrowave · (b) Yutopia's **warm 80s hi-fi** (walnut, cream, amber VFD) · (c) **1989 concept phone** — what a 1989 designer thought a smartphone would be (chunky, amber/phosphor screen) | **(a)**: the user named it Vortex OS; screens may glow; it contrasts nicely with the warm world and ties the two OSes together. The *hardware* (case) stays in the house palette |
| Phone key | (a) **P** toggles, arrows drive the phone while it's out · (b) **↑** like GTA (arrows stop walking; WASD only) · (c) Tab | **Chosen: P + a phone icon in the dock** (it takes the Chat button's place, with the unread badge) |
| Space-wide text after the chat goes — **chosen (a)** | (a) an automatic **#space group** in Messages · (b) nothing — DMs and groups only | **(a)** |
| Calls across spaces | (a) anyone online in Yutopia, any space (call rooms) · (b) same space only | **(a)** — call rooms make it free |
| Video calls — **chosen (a)** | (a) in v1 (P3) · (b) later | **(a)** — the cameras already exist |
| Offline messages → Yondra notification | (a) yes, after 10 min unread, honouring preferences · (b) no | **(a)** |
| Maps placeholder | (a) "coming soon" · (b) show the space's minimap now | **(a)** — you said GPS is future |
| Vortex's personal lines | (a) arrive as texts in his thread · (b) bubbles only | **(a)** |

## 10. Milestones

| Milestone | What | Exit test |
|---|---|---|
| **P0 — Mocks** | Mock images (HTML → PNG): the phone in hand in iso + 3D, home screen, lock, Messages thread, incoming call, in call, camera (selfie), Settings → wallpapers, Store. Case colours sheet. | User approves the images (house rule: image-first) |
| **P1 — Shell + chat out** | Remove the chat (§ 1). Lazy chunk `yutopia-phone` (budget marker, `budget.mjs`), overlay that slides up while you walk, input routing (P, arrows, Enter, Backspace, mouse, touch), lock/home/app framework, status bar, sounds. **The object:** 3D phone model + iso sprite, schema `Player.phone` (`""|"text"|"call"|"photo"|"selfie"`) + `phoneCase`, poses in `avatar-motion.ts` (texting / ear / photo / selfie), seen in both views; screen glow at night. Person menu + PersonCard: Message / Call. | e2e: P opens, walk with WASD while open, arrows move the grid, others see the pose; chat gone, all old e2e green; budgets green; shots iso + 3D day/night |
| **P2 — Messages** | Yondra tables + API + policies, world-server/Yondra live relay, threads (1:1, group, #space), contacts with presence, text/photo/reactions/replies/typing/read, peek banner + tones + dock badge, Vortex personal lines as texts, offline notification. | e2e: Ana texts Bia in another space, Bia gets the peek live; offline delivery; Pest tests for policies |
| **P3 — Calls** | Call rooms (Yondra token), ring flow (ringing, accept, decline, text instead, busy, missed, recents), positional ringtone, phone filter, speaker, mute, video, group up to 8, "on a call" tag, the call pill. | e2e two accounts: call across spaces, both hear (LiveKit test pattern), decline → missed; people near the callee hear the ring |
| **P4 — Camera + Gallery** | Photo + selfie in iso, 3D, first person; poses; filters; flash seen by others; upload, gallery, wallpaper, send in a thread. | e2e: selfie in 3D has my face, upload + gallery + send; visual review |
| **P5 — Customise** | Wallpapers (12), ringtones (10) + text tones (6), per-contact ringtone, case colour in the avatar, theme, text size, vibrate, sleep mode ↔ dnd, synced to Yondra. | Visual sheet `/dev/phone` (cases × views, every screen light/dark); e2e settings survive a reload on another context |
| **P6 — Vortex + polish** | Vortex as a contact (texts in character, calls in his voice, secret numbers), Store + Maps shells, lore fragment, phone layout for touch screens, Low quality / reduced motion, i18n PT/EN, contrast, perf (idle cost with the phone out), full e2e, PROGRESS. Firefox check by the user. | Visual review both views day + night; budgets, contrast, perf green |

Order: P0 → P1 → (P2 ∥ P4) → P3 → P5 → P6. P2 and P4 touch different
files and can run in parallel sessions once P1 lands.

## 11. Where it goes (code map)

- **Shared:** `phone.ts` (subpath `@yutopia/shared/phone`): phone states, poses,
  app manifests, ringtone ids, limits, message shapes; protocol: `phone:state`,
  `call:*`, `msg:*` (live relay only).
- **Server:** `features/phone.ts` (state, ring routing, call signalling, live
  message relay; Yondra calls through `yondra.ts`), schema `Player.phone`,
  `phoneAt`, `phoneCase`, `onCall`.
- **Client:** `world/phone/` (chunk: OS shell, apps, sounds, capture, call
  room), `art/phone3d.ts` (model + iso sprite), poses in `avatar-motion.ts`,
  props in `art/held.ts` / `people3d.ts`, overlay `components/hud/Phone.tsx`
  (dynamic, `PetOverlays` pattern — not a modal panel, so keys keep walking),
  strings in `lib/i18n-phone.ts` (page budget).
- **Yondra:** migrations threads/members/messages/photos (+ phone settings
  in the avatar JSON), `YutopiaPhoneController`, `YutopiaPhotosController`,
  policies, call-room tokens in `YutopiaTokens`, notifications.

## 12. Risks

- **Page budget** (world page already tight): everything phone-side lazy; only
  the P key handler and the pose fields live in the page.
- **Two LiveKit rooms at once** (space + call): publish the same mic track to
  both; measure CPU on a laptop and the phone. Fallback: the call as a forced
  pair in `hearingPass` (same space only).
- **Selfie camera in iso** is a 2D picture of a 2.5D world — the framing has to
  be designed, not just cropped (P0 mocks cover it).
- **Photo storage** grows: quota + JPEG cap; delete really deletes the file.
- **Privacy:** photos of other people are visible to whoever you send them to;
  no public feed in v1.

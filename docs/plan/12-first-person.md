# First person — a third way to see the room (plan — delivered 2026-10-15, see PROGRESS)

Ask (2026-10-15): "Lets plan a First Person mode, today we have isometric and
third person options, maybe we could use the third person logic to apply the
first person mode as a third choice."

## Short answer

Yes: first person is the third-person view with the camera moved into your
head. Everything hard is already there — the three.js room (`world/tp`), the
people drawn as upright cards, mouse look with pointer lock (Z), the crosshair
pick, camera-relative WASD, the light map, live pictures, build mode fed the 3D
pointer. None of it needs a new backend. What changes is small and all on the
client:

1. a third **camera mode** of `ThirdPersonView` (`"first"`, beside `chase` and
   `free`) — the camera sits at eye height on your own position and looks
   along yaw / pitch instead of orbiting a target;
2. your own drawing (card, shadow, ring, tag, bubbles) is not drawn, because
   the camera is inside it;
3. your **facing follows the camera**: looking around turns your character for
   everyone else (today your facing follows where you walk);
4. a third choice in Settings → View; **T** still goes iso ↔ 3D and a new
   **C** swaps the camera, third ↔ first, while in 3D;
5. the handful of places that put HTML "over my head" need somewhere else to
   go when my head is the camera.

Server data and the world protocol are untouched (as with third person: the
view is per player and client-only; others still receive x, y, d of 8, a).

## Decision: a camera mode, shown as a view

Two ways to wire it:

| | third `view` ("iso" / "3p" / "1p") | third `cam3p` ("chase" / "free" / "first") |
| --- | --- | --- |
| what the user sees | three equal buttons in Settings | hidden under "Third person" |
| what the code does | same `openTp()`, mode forced to `first` | same |
| keys | T = iso ↔ 3D (the last 3D kind), C = third ↔ first | the same |
| future per-view prefs (FOV, head bob) | natural | mixed with chase/free |

Take the **first**: `prefs.view: "iso" | "3p" | "1p"`. The controller's
`syncView` opens the same 3D view for both `3p` and `1p` (`viewNow` becomes
`"iso" | "3d"`) and only the mode differs: `tp.setMode(view === "1p" ? "first"
: prefs().cam3p)`. Switching 3p ↔ 1p never rebuilds the room — it is one
`setMode` call, so it is instant and keeps the lamp pool, fades, live canvases.

## F1 — The camera (view.ts)

- `CamMode = "chase" | "free" | "first"`, `LIMITS.first = { pitch: [-1.25, 1.25], dist: [0, 0] }`.
- In `frame()`, the branch for `first`:
  - **no target lerp**: the camera is exactly on `me` every frame (the chase
    camera eases its target with `exp(-dt·12)`; from inside your head that
    reads as floating and makes you seasick). Position = `(me.x, eyeH, me.y)`.
  - **eye height**: standing ≈ 1.7 tiles, seated ≈ 1.2 (the tag sits at 2.0 /
    1.45 — line ~826 — so the eyes are ~0.3 below). Ease only the *height*
    (sit / stand) with `exp(-dt·8)`, never the plan position.
  - **look direction** = `(cos yaw · cos pitch, −sin pitch, sin yaw · cos pitch)`;
    `camera.lookAt(position + dir)` instead of `lookAt(target)`. Positive pitch
    = looking down, so the chase maths, mouse look and `lookInvert` keep their
    sign.
  - the "chase swings in behind you" block is `mode === "chase"` only already;
    `clampCam()` works unchanged with `dist` clamped to 0.
  - `fadeWalls`: skip in `first` (camera = target, `segBox` never hits); the
    build-mode walls up / down override still applies.
  - `lean`: at eye level it is ~0 anyway; force 0 in `first` so people near you
    don't tip when you look down at them.
- **Keep `target` meaningful** for everything that reads it (`placeSun`,
  `assignLamps`, `earshotRing`, cues): in `first` it is the eye point itself.
- **+/−** in first person nudge the **FOV** (45–80°, default 50 — the same
  `camera.fov`, `updateProjectionMatrix`) instead of `dist`; pref `fov1p`
  later if people care, not now.
- `near` stays 0.1 tile (the z-fight rule from PROGRESS "flickering joins").
  At eye level you are 0.5 tile from any wall you can walk against, fine.
- The **crosshair** shows in first person whenever the pointer is locked
  (as now); unlocked, the cursor picks as in third person.

## F2 — Me, from the inside (view.ts + people3d.ts)

- `frame(dt, bodies, meId)`: in `first`, my `Person3` is updated (so the rig
  keeps its state for the instant switch back) but `root.visible = false`.
  Skip my redraw entirely (`redraw = false`) — one canvas less per frame.
- My **name tag / emote / chat bubble** in the view's HTML overlay: not drawn
  for `meId` in `first`.
- My **speaking ring** and **earshot ring** on the floor: keep the earshot
  ring (it is round your feet, you see it on the floor when looking down —
  useful); hide the speaking ring (it would be a disc at your feet).
- **Held things** (mug, cup): nothing in hand is visible in first person for
  now. A hand holding the mug in the bottom-right corner is a nice later
  touch, not in this pass.
- **Others** need nothing: their cards already face back along the camera.
  Up close (< 1 tile) a 2 m tall card fills the screen — that's correct and
  reads like the iso drawings do when zoomed. Check once with shots.

## F3 — Facing follows the look (controller.ts)

Today `meAngle` turns towards where you walk (`turnTowards` in `move`), and
`me.d` (the 8-way facing others see) comes from the movement delta. In first
person:

- every frame in `1p`: `meAngle = tp.yaw` (no easing — the camera *is* the
  head), and `me.d = dirFromDelta(cos yaw, sin yaw, me.d)` with a little
  hysteresis (change only when the yaw is > 5° past a 45° boundary) so turning
  the mouse slowly doesn't flip d back and forth at a boundary and spam the
  server.
- `move()`: in `1p` do **not** `turnTowards(dir)` — S walks backwards, A / D
  strafe, the body keeps looking where the camera looks. (The iso players see
  a person walking backwards; that is what the 8-view sprite does for free.)
- the "turned some other way (a seat, a high-five)" snap at the end of
  `move()`: in `1p` it's the other way round — when something sets `me.d`
  (sitting down), set `tp.yaw` to that direction, so sitting on a sofa turns
  your view to face the room, like the seat does to your character.
- path walking (click the floor): the body turns along the path today; in
  `1p` keep the view where the user looks and just walk (the character walks
  sideways / backwards as seen by others). Simpler and never yanks the camera.
- `clientAt(x, y, z)` for `me`: see F5.

## F4 — Settings, keys, prefs

- `prefs.view: "iso" | "3p" | "1p"` (+ the sanitiser at `prefs.ts:76`:
  anything else → `iso`).
- Settings → View: three buttons **Isometric / Third person / First person**;
  "Camera follows me / Free camera" only under Third person; the Mouse look
  block (speed, invert) under both 3D views. Strings EN/PT: `view1p`,
  `view1pHelp` ("Z locks the mouse to look around; T switches views").
- **T** keeps its meaning, iso ↔ 3D: from iso it opens the 3D view you used
  last (`3p` or `1p`, pref `last3d`); from either 3D view it goes to iso. The
  e2e specs that press T twice (`third-person`, `wall-faces`, the shots) stay
  as they are. **C** (free today; the dev page already uses it for cameras)
  swaps `3p ↔ 1p` and does nothing in iso. Controls help lists both.
- Entering `1p` from a key press (C) **asks for the pointer lock at once**
  (a keydown is a user gesture, so `requestPointerLock` is allowed): first
  person without mouse look is half a mode. If it is refused (touch screen,
  the browser's post-Esc cooldown) you get the toast we have and drag-to-look
  works like the free camera. From the Settings button it also asks (a click
  is a gesture) — but the panel closes first, else `watchLook` lets go again.
- Z keeps toggling the lock; Esc lets go; everything in `watchLook`
  (menu, panel, build, side panel, chat) keeps releasing it.
- Dev page `/dev/3p`: **C** there cycles chase → free → first (today it
  toggles chase ↔ free; V stays iso ↔ 3D), so first person can be shot offline.

## F5 — HTML that follows my head

Things placed by `controller.clientAt(x, y, z)` for *me* project to the
camera's own position → `project()` returns null → `{-9999,-9999}`, which just
hides them. Decide each:

| what | iso / 3p today | in 1p |
| --- | --- | --- |
| my video bubble (`Overlays.tsx:255`) | over my head | hidden (I can't see my own face from inside; the HUD's mic / cam state is enough) — or pinned bottom-left as a small self-view; start hidden |
| my chat bubble (`controller.say`) | over my head | not drawn (the chat panel has it) |
| my emote drawing | over my head | not drawn |
| the walk marker, the "X to use" outline | on the floor | unchanged — they are world things |
| the LookHint chip, the crosshair | as mouse look | unchanged |

## F6 — Build mode in first person

Build mode works in 3D by feeding the iso `BuildController` the 3D pointer. At
eye level it still works (floor under the pointer, wall items by ray) but
placing furniture from 1.7 tiles up looking down is awkward. Keep it simple:
**build mode steps the camera back out** — on `setBuild(look)` in `first` the
view temporarily uses `chase` (dist 4, pitch 0.8, same yaw), and goes back to
`first` when build mode closes. One line in `setBuild`, no new UI. The
pointer lock is released by `watchLook` already.

## F7 — Sound and the rest

- `pan()` is by the camera's right: unchanged, and in first person the ear is
  exactly where the camera is — the best case.
- Idle frame rate (30 fps after 3 s), `activeAt`, quality auto-step: unchanged.
- Head bob: **no** (nausea, and the people are drawn cards — a bobbing camera
  makes them swim). The step sounds already give the rhythm.
- Gamepad: right stick already drives yaw / pitch.
- Touch: drag turns, the on-screen stick walks (as free camera). Fine.

## Checks

- typecheck, Biome on touched files only.
- e2e **`first-person.spec.ts`** (Lab, two browsers, Pointer Lock stubbed as in
  `mouse-look.spec.ts`):
  1. Ana → T, then C → `prefs.view === "1p"`, the 3D view mounted, the iso
     ticker stopped, the camera within 0.05 tile of Ana's position;
  2. Ana's own card is not visible (`__yutopia.tp.people.get(sid).root.visible === false`);
  3. Z locks; mouse movement of +90° yaw → Bia's iso view shows Ana's `d`
     turned (facing follows the look — the one thing others can observe);
  4. W → Ana moves away from where the camera looks; S → back, without turning;
  5. click the floor → walks there, the camera stays level;
  6. sits on the sofa (E) → eye drops, yaw snaps to the seat's facing;
  7. T → iso, ticker running; Ana's prefs left on iso (other specs assume it).
- `third-person.spec.ts`, `mouse-look.spec.ts`, `wall-faces.spec.ts`, world,
  hud, video, build specs stay green (T unchanged; they never see `1p` because
  Ana's `last3d` is `3p` unless a spec set it — `first-person.spec.ts` puts it
  back).
- Opt-in shots: `third-person-shots.spec.ts` gets a `first person` case
  (Lab + Demo space, standing in a doorway, looking at someone 1 tile away,
  seated on the sofa, at night under a lamp). Review page with the pairs.
- Hands-on: the real pointer lock in Chrome and Firefox is the user's test
  (headless never grants one).
- Budgets: world page ≤ 520 KB — the setting + the controller branch are a
  few hundred bytes; the 3D view is lazy and gains ~1 KB.

## Order of work (one session, ~half a day)

1. F1 + F2 in `view.ts` / `people3d.ts`, tried on `/dev/3p` with shots.
2. F3 + F4 + F5 in `controller.ts`, `prefs.ts`, `SettingsPanel.tsx`, `i18n.ts`.
3. F6 (`setBuild` step-out), F7 is nothing to do.
4. e2e + shots, PROGRESS entry.

## Later, if wanted
- a hand holding the mug / cup at the bottom of the screen;
- a tiny self-view tile when my cam is on;
- FOV pref; a "look at" ease when someone starts talking to me;
- the name tag of the person the crosshair is on, bigger and nearer (a
  first-person reading of "who is this").

# GPS — the phone's first app (and photos in a chat, and calls of three) (plan — decided 2026-10-23; delivered 2026-10-23)

Three things on the phone: sending a photo from a chat takes you out of it;
a call with a third person goes silent for someone; and the Maps tile on the
home screen has said "soon" since the phone came (docs/plan/21-cellphone.md).

## Decided (2026-10-23)

| Topic | Decision |
|---|---|
| A photo in a chat | A tray of recent photos slides up over the composer; tap one to send. Camera and All photos at its ends. You never leave the chat |
| Calls of three | A bug: reproduce it with three people first (who goes silent isn't known: both ways, or one) |
| GPS, first version | All of it: the map with me and places, routes with turn-by-turn, a guide in the world, friends on the map |
| Who sees where I am | Nobody, unless I turn on "Share my location" (off by default). Then only my contacts |
| The app | The Maps tile becomes **GPS** (the id stays `maps`); its "soon" badge goes |

## How it is now

- **Photos.** The composer's camera button (`screens/messages.tsx`) goes to
  `gallery/send` with `arg: "thread:<id>"` (`screens/photos.tsx` `SendTo`),
  a separate screen; Back returns to the thread.
- **Calls.** `features/phone.ts` (world-server) rings, keeps the members and
  sends each one who's in a `call:join` with a LiveKit token for
  `call-<id>`. On the first answer the caller (and anyone already in) is
  joined too; every later answer joins only that person. `world/phone/call.ts`
  connects to that room, publishes a copy of the world mic (or a new one when
  the world's line is asleep), and runs each far voice through a phone filter
  (`setWebAudioPlugins`, `webAudioMix`). `CALL_MAX` is 8. Nothing tests more
  than two: `rooms.test.ts` and `e2e/phone.spec.ts` are one-to-one.
- **Maps.** `Maps()` (`screens/settings.tsx`) is a placeholder.
  `world/grounds-plan.ts` `drawSitePlan` already draws the Grounds as a survey
  (land, woods, ways, water, buildings, names), "the same drawing becomes the
  phone's Maps", used today only by `/dev/grounds`. The shared Grounds have
  what a route needs: `WAYS` (driveway / road / street / trail / walk, each
  with a name, a width and a dense `line`), `BUILDINGS` (name, door side
  `face`, `enter`), `ROAD_CLOSED`, `placeAt(x, z)`.

## Steps

### 1. Calls of three (first: it's a bug)

1. **Reproduce.**
   - World-server (`rooms.test.ts`): Ana calls Bia and Cal at once, both
     answer: all three get a `call:join` with a token for the same room, and
     every `call:update` lists three `in`. Again with Cal **added** mid-call
     (`call:add`) and with Cal answering before Bia.
   - Client e2e (`phone.spec.ts`, three browsers): the same two ways in. Each
     page reports, through `__yutopia.phone.calls`, the far voices it has
     subscribed (`chains`) and whether its mic is published. Each must have
     two far voices, and a level above zero when the others play a tone
     (a fake mic: Chromium's `--use-file-for-fake-audio-capture`).
2. **Find it.** Things to check, in order:
   - does every member get `call:join` (the first-answer loop joins only
     who's `in`; a member added while ringing can fall between);
   - does `onJoin` drop it (`c.id !== m.id` while the id is still `""`, or a
     second `call:join` racing `hangupLocal()` and tearing down the room the
     first one just made);
   - the mic: the copied world track when the world's mic is off or asleep
     (a stopped clone publishes silence);
   - playback: `el.muted = false` on an element LiveKit plays through Web
     Audio, the AudioContext suspended for the one who answered with a key;
   - a third **device** in dev: `livekit.local.yaml` hands out `127.0.0.1`,
     which only reaches browsers on this machine.
3. **Fix it** where it is, and keep both tests.
4. **On the call screen** with three or more: each face lights up while that
   person speaks (a level per far voice, not only the loudest).

### 2. A photo in a chat: the tray

1. The composer's camera button becomes a **+**. It slides a tray up from the
   composer (the thread stays above it): the latest photos in a row of
   squares, scrolled sideways, newest first, loaded from `phone.photos` (the
   API's, already in the store when the Gallery has been opened, else fetched
   then).
2. Tap a photo: it is sent (`ph.send(thread, "", { photoId })`, as `SendTo`
   does), the tray closes, the bubble shows in the thread.
3. At the ends: **Camera** (opens the camera, and Back comes back to the
   thread) and **All photos** (the existing `SendTo` for that thread).
4. Empty gallery: the tray says so, with only Camera.
5. Works with the phone's keys/pad (`data-nav`): ← → along the tray, Enter
   sends, Esc or Backspace closes it.

### 3. GPS: the map, me, places

1. **The map.** The `Maps` screen becomes `screens/gps.tsx`. The site plan is
   drawn once into a canvas (`drawSitePlan` at a size the phone can hold, kept
   for the session) and shown under a pan/zoom view: drag, wheel, pinch, the
   pad's stick; a **recenter** button (follow me, the map turning with me or
   north up, a toggle).
2. **Me.** An arrow where I am, pointing where I face, from the HUD's
   position. Inside a building: the building ringed, "Floor N". In a space off
   the Grounds (a private room, a booth): the map at its door, "In <space>".
3. **Places.** A search box and a list: the buildings you can go to, the
   streets and paths by name, the landmarks (the lot, the plaza, the pond,
   the statue, the tower, the farm). Each with its distance from me. Tap one:
   the map goes there, a card with its name, the distance, **Go** (on foot /
   by car).

### 4. GPS: routes and directions

1. **The graph** (`packages/shared/src/route.ts`, shared so the server and
   tests can use it): nodes along every way's `line`, joined where two ways
   meet (closer than their half-widths); a building's door joins its nearest
   way on the side it faces. On foot every way; by car only driveway, road
   and street, never `ROAD_CLOSED`. A* over it.
2. **Start and end off the ways**: a straight leg to the nearest point of a
   way (on foot), or of a road (by car).
3. **Distance and time**: walking speed on foot, a street speed by car.
4. **Directions**: from the turns along the route, merged into steps: "Turn
   left onto Main Street", "Keep right on the trail", "Arrive: the Library,
   on your right" (its door side). Each with the distance to it.
5. **Off the route** by more than ~15 m: a new route from where I am.
6. **Unit tests**: routes between known places, that a car route never uses a
   trail, that the directions read right at a few junctions.

### 5. GPS: the guide in the world

1. **While navigating**, the GPS screen shows the next step big, the
   distance to it, the time left, and **End**.
2. **In 3D**: a ribbon on the ground ahead along the route (~60 m, with
   chevrons, following the terrain), in the stylized look
   (docs/plan/33-the-look.md). **In iso**: a dotted line on the ground.
3. **Phone away**: a small map in a HUD corner (turning with me) and the next
   step as a banner; bigger while driving.
4. **Arriving**: a chime, "You've arrived", navigation ends.

### 6. GPS: friends on the map

1. **The setting**: Settings → Location → "Share my location" (in
   `PhoneSettings`, off by default). When on, a small dot on the status bar.
2. **The server** (`features/phone.ts` or a new `features/gps.ts`): who's
   sharing, and with whom. The contacts come from the API (an internal
   endpoint like `last-spot`'s), fetched when someone turns sharing on and
   when they join, so the world-server only ever gives a position to the
   people who have them as a contact.
3. **The client asks** (`gps:friends`, about once a second, only while the GPS
   is open or I'm navigating to a friend) and gets each sharing contact who's
   in Yutopia: where (x, z, facing) on the Grounds, or the space they're in.
4. **On the map**: their face in a ring; in a space off the Grounds, at its
   door with the space's name. Tap: a card with **Go**; the route follows them
   as they move.

### 7. Tests and shots

- World-server: three on a call (step 1); location given only to contacts,
  and nothing once sharing is off.
- Shared: `route.test.ts` (step 4).
- Client e2e: the tray sends a photo without leaving the chat; three on a
  call all hear each other; the GPS opens, finds a place, routes to it, the
  ribbon shows in 3D, arriving ends it; a friend who shares shows, one who
  doesn't doesn't.
- Shots: the tray, the GPS map, a route with its steps, the ribbon in 3D and
  iso, the corner map.

## Order

Calls first (a bug in something that's there), then the tray (small), then
the GPS in its steps 3 → 6, each step usable on its own.

## Delivered (2026-10-23)

- **Calls of three — what it was.** Ana calls Bia and Cai; Bia answers first
  and the server tells everyone on the call it's live — Cai too, still
  ringing. Cai's phone took that for its own: the ringing stopped, the call
  screen went to "live" with a timer, and Answer did nothing any more (it
  only answers an incoming call), so Cai never got on the line — nobody heard
  Cai, Cai heard nobody. The same for anyone added mid-call. Two people never
  hit it (nobody's left ringing). `call.ts` `onUpdate`: still ringing here, it
  stays ringing (only who's on it changes).
- Found on the way, fixed too:
  - A muted world mic is a disabled track (never stopped on mute) and the
    call's copy of it started disabled — silence on the call. The copy is on.
  - Two answers at the same moment could hand the same person two lines
    (LiveKit drops one of them): the server gives each member the line once
    (`Call.lined`), the client ignores a second `call:join` for its line.
  - A ring that ran out while the call went on rang on forever on that phone:
    the server tells it (`missed`).
  - The far voices' Web Audio is resumed on Answer / Call.
  - The call screen with three or more: a row of faces, each lit while that
    person speaks (`CallView.talk`, a level per far voice).
- **The photo tray.** `+` in a chat (`PhotoTray`, `messages.tsx`): the latest
  30 photos over the composer, Camera first, All photos last; a tap sends.
  Back closes the tray, not the chat (`Phone.interceptBack`).
- **The GPS.**
  - `shared/route.ts`: the graph over `WAYS` (a node every 4 m, joined where
    ways meet and where a way stops short of another — the farm lane at the
    square), A* on foot / by car (the driveway, the road and the streets
    only), legs over the snow on and off (≤ 80 m; slow, so a route keeps to
    the ways), the steps (start · turns onto each way · arrival on the left /
    right / ahead), `offRoute`, `pointAt`, the places (buildings, ways,
    landmarks). The Grounds are handed in (`routeOver`): the client's bundler
    copies a module into every chunk that imports it, and the Grounds are
    big — a first try that imported them grew the Grounds' chunks 167 → 234
    KB; handed in, 167.
  - `world/phone/gps.ts`: going somewhere, following (≥ 14 m off on foot,
    22 by car: a new route), arriving (7 / 14 m), a friend's route following
    them; asks for the friends once a second while the map's up or I'm on my
    way to one; says whether I share (and again every 20 s: the world forgets
    me when I leave).
  - `world/phone/gps-guide.ts`: the ribbon in 3D (chevrons, on the land,
    110 m ahead) and dots in iso (the ground floor: the land is only there;
    `engine.groundDrawing()`).
  - `screens/gps.tsx`: the site plan (`grounds-plan.ts`, drawn once, and a
    quarter-size copy for zoomed out and the corner) turning with me or north
    up, recenter, search (friends, places, streets & paths, landmarks — by
    distance), a card with on foot / by car and Go, the next turn and the
    time and distance left, End. Away from the phone: the next turn on top
    (bigger driving) and a round map at the top right.
  - Friends: Settings → Share my location (`PhoneSettings.shareLocation`,
    off). The server (`features/gps.ts`) fetches the sharer's phone book from
    the API (`GET /internal/phone/contacts/{id}`) and gives their position
    only to the people in it — and to nobody while they're in a booth or in
    focus mode.
  - `controller.gpsWhere()`: me on the Grounds' coords (my floor's `ox/oy`).
- **Checks:** shared 273 (route 8); world-server 127 (the call of three,
  the GPS's friends; "vortex: lives in the building" failed once in the full
  run and passed on its own); API PhoneTest 11 of 12 (the photos test needs
  GD, missing in the container); e2e on the real GPU (`YUTOPIA_GPU=1`): gps 3
  of 3, phone 6 of 7 (the grid by keyboard, failing before this); budget:
  the page 556.2 KB ≤ 557 (+0.1), `yutopia-phone` 16.9 KB, `yutopia-grounds`
  167.1 KB (as before).
- **Not done / known:**
  - A third demo account for the e2e: `cai@yutopia.test` (DemoSeeder).
  - Headless software GL with the machine loaded (load average 30–70 during
    this work): the e2e timed out all over (other specs too); the GPU runs
    are the ones above.
  - The route is over the Grounds only: inside a building it starts from
    where I stand, straight to the nearest way (no stairs or doors).

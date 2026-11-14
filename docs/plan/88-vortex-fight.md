# 88 — The fight with Vortex

Ask (2026-11-14, the user): "Fight vs Vortex, the mascot." Vortex hangs around the office; friends asked for a way
to shoot him. What they don't know: **Vortex shoots back, or does something crazy.** Talked first, ideas suggested,
then asked.

Status: **talked through and decided by the user 2026-11-14** (all as recommended): **F1** comedy that turns dark;
**F2** he can down people — co-op (a friend gets you up); **F3** anyone, any time — shoot him and it's on, only those
who shot him get hit; **F4** all four kinds of moves — tape tricks, pranks, the dark, mind games; **F5** beaten: a
cassette trophy, back later with a grudge; **F6** the grudge lasts a day; **F7** his health scales with the group;
**F8** a plan and mocks first. **Phase 0 (the mocks) signed off 2026-11-14**, committed 3ac94702; **phase 1 (the rules) built 2026-11-14**.

## What there is now

- **Vortex** (`apps/world-server/src/features/vortex.ts`, an `Npc`): lives in the building's studio, wanders between
  its places, stalks someone now and then, dances when the radio's on, sleeps in the server room at night; a poke
  gets a line — personal lines only to that person, public ones never name anyone (his voice rules). His lines come
  from the API by event (`POST /vortex`, curated); offline, three of his own.
- **His look** (`art/vortex/vortexArt.ts`, synced from Yondra; drawn in 3D as his drawing, floating, turned to the
  camera — `tp/stand3d.ts`): 35 faces (smug, judging, possessed, dizzy…), and already **the dark transformation**
  (`dark` 0–1: past ⅔ his eyes become holes), **tape tears** and **scars**.
- **The guns** (plans 79–84): every shot a ray (pellets each their own) the server checks against people
  (`personAlong`) and, out on the land, the shadowed (`room.dark.shoot`); the Daybreak's balls; flares.
- **Downed and got up** (`features/survival.ts`): hurt to 0, down — crawling, bleeding out — till a friend holds
  use on you (or your own first aid).
- **What else is there to use**: the emote "tape" (a little dance); teleports; drops anywhere (`putDrop`); the
  dark's blackout of the Grounds' lamps by the hour (outdoors only — **nothing turns the building's lights off
  today**); the torch in the left hand (plan 87).

## The fight

**Act 1 — the joke** (his health 100–70%): shot, he complains — "ow. that's workplace harassment." — side-steps,
judges you, his tape starts to fray (the tears). He looks like a harmless target.
**Act 2 — rewinding** (70–35%): he fights back with his tape tricks and pranks (below), still funny, sharper.
**Act 3 — the dark** (35–0%): the transformation — his eyes holes, the studio's lights go out, the music turns, the
shadowed get in; he's fast, and now he downs people. The friends have to get each other up.
**The end**: his tape unspools, he drops — "*kkzzt*" — and a **cassette** lies where he fell (the trophy, for the one
who hit him last; a notice to the building: Vortex is down). He's back in the server room later, scarred for the
day, and **holds a grudge** (below).

**His moves** (F4, all four kinds — which in which act, phase 0's mocks show):
- **Tape tricks**: the *tape whip* — a lash of tape that binds you a few seconds (a friend cuts you free, holding
  use); **REW** — the one who shot him pulled back to where they stood 5 s ago; **PAUSE** — the shots stop in the air
  and fly back at whoever fired them.
- **Pranks**: the *confiscation* — the gun snatched from your hand and left somewhere ridiculous in the building (or,
  now and then, a rubber duck in its place); the *radio at full blast* — everyone near made to dance (the tape emote)
  for three seconds; *HR* — sent to the reception's corner with a personal line ("reported to HR").
- **The dark** (act 3): the studio's lights out (the torch in the left hand is what you have); *clones* — three of him,
  one real (a shot clone pops); the shadowed inside.
- **Mind games**: *possession* — the one who shot him most loses their controls a few seconds (they walk to him, the
  camera turns); *glitch* — the screen hisses, the HUD shuffles, the controls invert a few seconds.

**The rules**:
- **Anyone, any time** (F3): a shot that hits him starts it; **only those who've shot him** are his targets — whoever's
  just working in the office is left out (his own rule, personal lines only to that person). Out of the fight a
  while (no shots), he heals and calms down.
- **Downs, co-op** (F2): his hits hurt as the dark's do — to the ground, crawling; a friend holds use to get you up.
- **Scales with the group** (F7): his health is set by how many are shooting him (counted over the last half
  minute) — a fight of 2–4 minutes whether it's one of you or six.
- **The grudge** (F6): for a day he remembers who shot him and how much — personal lines about it, he stalks the one
  who shot most, small pranks (their chair taken, followed round); public lines still name no one.

## Forks — decided

| # | Question | Decided |
|---|---|---|
| F1 | The tone | **Comedy, then dark** — a silly target that turns into a real fight (over pure chaos comedy) |
| F2 | What his attacks do | **They can down you — co-op** (over pranks only, or downing only in the dark act) |
| F3 | Who starts it, when | **Anyone, any time; only those who shot him are hit** (over an admin's event, or after hours only) |
| F4 | His moves | **All four kinds**: tape tricks, pranks, the dark, mind games |
| F5 | Beaten | **A cassette trophy; back later, with a grudge** (over just respawning, or loot) |
| F6 | The grudge | **A day** (over forever, or none) |
| F7 | How hard | **Scales with the group** (over fixed and hard, or fixed and short) |
| F8 | How we start | **A plan and mocks first** |

## Phases

0. **Mocks** (signed off first): his three acts' looks (the faces and the transformation as they ramp; the tears,
   the scars after), each move pictured (the whip binding someone, REW's pull back, PAUSE's frozen shots, the duck,
   the forced dance, HR's corner, the lights out with a torch, the clones, possession, the glitch), the HUD in the
   fight (his health across the top in the HUD's look, the act's name, who's in it), the end (the tape unspooling,
   the cassette — its picture rendered like the items'), the grudge's lines. What the trophy is (an item in the pack,
   a count of wins) settled here.
   Done in phase 0 (2026-11-14), to be signed off — `design/vortex-fight/mock/fight.html` (`?s=act1|act2|pranks|
   act3|mind|end|grudge`) over the studio as the game draws it (`bg/`, Ana with the revolver out, by day and with the
   lights out), his own drawing (`art/`, from `vortexArt.ts`: his faces, the dark transformation, tears, scars):
   - **The HUD in the fight**: his name in Cormorant, the act typed, his health **as a cassette** — the tape wound off
     its left reel as he's hurt, his pink (dark red in act III), ticks at the acts; who's in it and their hits.
   - **Act I** (`0-act1.png`): judging, "ow. that's workplace harassment.", a hit marker, a slip — "He's not
     fighting back. Yet."
   - **Act II** (`0-act2.png`): malicious, his tears; the tape whip from him to Ana, taped up (4 s) and Bia's prompt
     to cut her free; PAUSE — the shots stopped in the air; the VHS's ◀◀ REW 0:05.
   - **The pranks** (`0-pranks.png`): the revolver gone ("it's on the roof"), a duck in her hand; the radio's blast —
     everyone near dancing 3 s; HR's slip — "sit in reception and think about what you did. 2 minutes."
   - **Act III** (`0-act3.png`): the lights out, a torch's pool, him fully dark (hollow eyes) and two clones, the
     shadowed at the edges, "the lights were never yours.", a friend down — hold E.
   - **The mind games** (`0-mind.png`): possession ("VORTEX HAS YOUR LEGS · 3", a magenta vignette); the glitch
     (scanlines, the picture split, controls inverted · 4).
   - **The end** (`0-end.png`): dead, his tape unspooled across the floor, the cassette glowing — take it; the
     building's slip: "VORTEX IS DOWN. Last hit: Bia. 2:41. He'll be back. He remembers."
   - **The grudge** (`0-grudge.png`): next day, scarred (splice, stitch), "you. the .38. i remember all fourteen."
   - **The trophy** (proposed): **Vortex's tape** — an item in the pack, one for each fight you land the last hit in
     (a stack: its count your wins); its picture rendered (`render_items.py` `vxtape`, a black cassette with his pink
     label and its tape pulled out) — `design/inventory/items/vxtape.png`.
1. **The fight's rules** (the server): Vortex a target — every gun's shots (each pellet), the Daybreak's balls, hit
   on his body; his health, scaled by the shooters of the last 30 s; the acts by health; who's in it and how much
   (only they're targets); calming down and healing out of it; beaten → the cassette dropped, his return timer; an
   admin's controls for trying it (start, set an act, beat, reset); tests.
   Done in phase 1 (2026-11-14):
   - **Shared** (`packages/shared/src/vortex-fight.ts`, `@yutopia/shared/vortex-fight`): `VORTEX_FIGHT` — 1500 a
     shooter (as the shadowed take damage), shooters counted over 30 s, the acts under 70% and 35%, calm after 40 s,
     on the floor 8 s, away 10 min, his body a column 0.55 m round, 1.15 m tall; `actOf` (never back up in a
     fight), `shooters`, `hurtBy` (a hit takes `damage ÷ (1500 × shooters)` of him); tests.
   - **The server** (`features/vortex.ts`): his fight — health left (`Npc.vk`), its act (`vact`, his face with it:
     judging, fury, possessed), who's in it by user and their hits (told to everyone, `vortex:fight`, four a second
     at most); out of it 40 s — calmed down, healed; beaten — his face dead, **his tape dropped where he fell**,
     everyone told who finished him and how long it took (`vortex:down`), 8 s on the floor, then away to the server
     room (`vgone`) for 10 min, back seething; nothing hits him down or away. **An admin's `mod:vortex`**: an act or
     his health set, beaten, reset, put somewhere and held (for trying it). `room.vortex` the hooks.
   - **The guns** (`features/arms.ts`): each pellet's line meets him (the nearest of the shadowed, a person and him
     takes it; a wall on the way stops it) — damage as the shadowed's; the Daybreak's balls burst on him and catch
     him in their blast; the shooter told (`arms:hit` kind `vortex`).
   - **The trophy**: `vxtape` a stack of 99 (shared, the API), its words in both languages, its drawing, its picture
     (`public/life/items/vxtape.webp`) and lying on the floor (`tp/items3d.ts`).
   - Checked: `vortex-fight.test.ts` (new: shot — his health, act I, who's in it on both screens; act II set; two
     shooting; beaten — both told, his tape where he fell, no hits while down; reset); shared 492 (the fight's two);
     `arms` 16 green; `rooms` and `survival` red only where they were before (slot cars' timing, Vortex's greeting,
     a spot's loot, the admin's give); the API's 8.
2. **Acts 1–2 — the joke and the rewinding**: side-steps and taunts (new line events for the API, both languages);
   the tape whip (a lash he throws; bound, and freed by a friend), REW, PAUSE; the confiscation (and the duck), the
   radio blast's dance, HR's corner — each on both screens; tests.
   Done in phase 2 (2026-11-14):
   - **His lines** (`apps/api` `Vortex`): new events — `hit`, `dodge`, `whip`, `rew`, `pause`, `steal`, `blast`
     public (never naming anyone; judging when shot, malicious for his moves), `hr` personal (only to the one he
     sends, by their first name). His lines stay his own English, as all of them are; what the screen says around
     them (slips, prompts, the HUD) is in both languages. Offline the world server has one of each. In the fight
     his face is the act's whatever the line's mood.
   - **The server** (`features/vortex.ts`): shot in act I or later, now and then (30%) **a side-step** out of the
     line, and a taunt (one every 5 s at most). **Act II**: a move every 6–9 s on one of those in the fight (on his
     floor, within 16 m, up, not taped up, not in HR's timeout), whichever of the six can be:
     - **the tape whip** — a lash (0.5 s in flight; out of reach by then: missed), then **taped up 4 s**: no shots
       (`arms` asks `room.vortex.bound`), and the client stands still; **a friend beside them (1.8 m) holds use
       0.8 s** and cuts them free (`vortex:free`). (Kept off the Player schema: it's at Colyseus's 64 fields.)
     - **REW** — pulled back to where they stood 5 s ago (each fighter's last 6 s kept, four a second).
     - **PAUSE** — 2.5 s in which shots that meet him are held, not counted; then **PLAY**: a fifth of each one's
       held damage back at whoever fired it (40 at most), hurting, never downing (`survival.hurt(…, spare)`).
     - **the confiscation** — the drawn gun out of their hand and quick slots, left lying (with its rounds) at the
       far end of the building from them, by one of his places; three times in ten a duck in its place (on the
       slip).
     - **the radio's blast** — everyone in it near him (6 m) made to dance (the tape emote) 3 s, standing still.
     - **HR** — sent to the lobby's far corner past reception, their shots not counted for 20 s, his personal line.
     In a fight he goes after one of its people, not his rounds; no greetings. An admin's `mod:vortex` `move`
     (on `to`, else on them) for trying each; held, he makes none by himself.
   - **The client** (`world/dark/vortex.ts`, in the dark's chunk): **his cassette** at the top for everyone in it
     or near — the tape wound off its reel as he's hurt (pink; dark red in act III), ticks at the acts, the act
     typed, who's in it and their hits; act I's slip the first time I hit him ("He's not fighting back. Yet.");
     the hit marker pink on him. His moves as everyone near sees them: the lash (a tape-brown curve flying from
     him) and the tape round whoever's taped up, "taped up · 3s" at their feet and, by them, **hold E · cut them
     free** with its ring; me taped up — my line, standing still; ◀◀ REW (mine: the tape's lines over the screen;
     theirs: at their feet); ▮▮ PAUSE and ▶ PLAY for everyone near, my shots hanging where they met him till then,
     and "Your shots came back. −n"; the confiscation's slip (mine with where it is, and the duck; theirs: whose);
     the notes over the dancers; HR's slip (mine typed like the mock, theirs who); beaten — the building's slip
     at the top ("VORTEX IS DOWN. Last hit: … He'll be back. He remembers.") and his cassette gone.
     `controller.homeFloor()` so the chunk takes no values from the shared index.
   - Checked: `vortex-fight.test.ts` (new second test: the whip on both, no shots while taped, a friend's knife;
     REW back; PAUSE held then back at her — hurt, not down; the confiscation — gun gone, lying far off; the radio's
     dance; HR's corner, her shots not counted; unheld in act II, a move by himself) — 2/2; the API's
     `VortexFightTest` (the fight's pools, HR personal) with `VortexOSTest`, dev DB untouched (4 users); `arms` 16;
     shared 492; **e2e `vortex-fight.spec.ts`** (YUTOPIA_GPU=1): Ana aims and fires at him in the lobby, his cassette
     and act on both screens, her slip; act II and each move on her as both screens show it (the tape and Bia's
     prompt, Bia holding E frees her, REW, PAUSE and her shot back, the revolver taken, the dance, HR), beaten —
     both told. Stills `vx-*-{anas,bias}.png`. (A page behind the other draws no frames — the spec reads each
     screen from the front.)
3. **Act 3 — the dark**: the transformation on screen; **the studio's lights out** (new: a room-wide dark for the
   building's lights, eased in and out — the torch and flares what's left); the clones; the shadowed inside; fast;
   downs; possession and the glitch (the client's controls and screen, briefly); tests.
4. **The end and the grudge**: the unspooling, the cassette (its picture, in the pack), the building's notice; back in
   the server room after a while, scarred for the day; the grudge kept for a day (who, how much — saved with the
   world), its lines, stalking the top shooter, the small pranks.
5. **The sound**: his voice for each moment, the hits on him (tape, plastic), the music's turn in act 3, the
   unspooling — picked by ear like the guns' and the steps' (the user picks).
6. **Checks**: the server's tests (scaling, only shooters targeted, the acts, beaten and back, the grudge); a
   two-of-us fight in the browser (both screens: the acts, each move landing on the shooter, a friend getting the
   downed one up, the end); stills.

## Risks

- **The building's lights out is new** (act 3): today only the Grounds' lamps black out; the studio's lamps and the
  building's light need a dark of their own, for everyone in it — and back after.
- **Bullets in the office**: shots at him can hit people standing near (today's rules: a ray hits whoever's first
  along it) — part of the chaos, but someone at a desk may get caught. To watch in the mocks.
- **Mind games feel unfair** if long: possession and the glitch kept to a few seconds, never stacked.
- **The shadowed indoors**: they live out on the land; brought into the studio they need its floor's way round —
  maybe a lighter stand-in if it's heavy.
- **His hit box**: he's a floating drawing — a body-sized shape the server agrees with.
- **His lines** come from the API's curated pools: new events (shot, each act, each move, beaten, the grudge) need
  lines in both languages, in his voice.

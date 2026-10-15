# Pets v2 — real models, real play (plan — delivered 2026-10-15, see PROGRESS)

Ask (2026-10-15, after Fita 12): "the pets models are shit, make them 3D with
GOOD models · the interactions are dumb, our characters should interact with
the items and throw the ball where we want, like real interactions · the items
are invisible and go through walls · the pet menu UI is ugly · improve all".

What was wrong, concretely: the pets were flat SVG cut-outs (a billboard in
3D); "play" was a scripted run with nothing drawn — the ball never existed;
a pet's spot beside you was checked for fit but not for reachability, so it
could stand on the far side of a thin wall; the panel was a plain form.

## 1. Pets are 3D models now
- `apps/client/src/world/art/pets3d.ts`: every species built from three.js
  primitives (ellipsoid body, sphere head, capsule legs, tube tail, cones for
  ears, a flat bill for the platypus, wings and tail feathers for the parrot),
  smooth-shaded Lambert materials that take the room's baked light and cast
  shadows, with the pet's colour, marking and clothes as geometry (hats,
  collars, coats). ~2–4k triangles each.
- A procedural rig: breathing, blinking, a wagging tail, ears that twitch, a
  head that looks at its owner; a walk cycle from the distance covered; sit,
  sleep (curled, with Z's), jump, roll, spin, play dead, dance, high five,
  pounce, hop, dive, chill, eat, drink, being petted; battle stance, lunge,
  guard, rest, hurt (recoil + flash), knocked out. Faces: open / closed /
  happy / angry / sad.
- **The iso view draws the same model**: `art/pets-render.ts` renders it from
  the iso camera (30° down, 8 facings) into sprites on demand, cached per look
  × facing × pose frame. One model, both views, always the same pet.
- The panel's preview is the live model on a turntable.

## 2. Real play: things you hold, throw and the pet brings back
- **Toys are things** (shared `held.ts`: ball, frisbee, rope, feather, laser)
  you take from a **toy box** (new item) or straight from the Pets panel; they
  sit in your hand like a mug (drawn in the hand in both views).
- **Throw:** with a ball or frisbee in hand, right-click (or Shift-click) the
  floor, or press the Throw button on the held chip and click: it flies in an
  arc to where you pointed (up to 8 tiles, never through a wall), bounces and
  rolls to a stop. The toy is a world entity everyone sees (`state.toys`).
- **Fetch:** your pets see it land, race to it, pick it up in their mouth and
  bring it back to your feet. Pick it up (click it, or it's handed to you)
  and throw again. Fun and XP each time; the fastest one gets it.
- **Rope:** hold it near a pet → "Tug of war": it grabs the other end, both
  pull and lean, it wins or you do. **Feather:** wiggle it, the pet pounces at
  it. **Laser:** click the floor to move the dot; the pet chases it.
- Pets never cross a wall: beside-you spots must be reachable in a couple of
  steps, never across an edge; a thrown toy stops at a wall.

## 3. The Pets panel, redesigned
- A cabinet with the pet on a **turntable** (the live 3D model), a VFD name
  plate, level badge and how it feels; tabs on cassette-deck keys: **Status**
  (LED meters for food / water / energy / fun / health, four dials for the
  stats), **Play** (toy cards you take into your hand, the toy box), **Tricks**
  (cards with progress rings, Teach / Do), **Style** (colour, marking, hat,
  collar, coat — the turntable updates live), **Battles** (record, rules).
- Adopting: six species on turntables, pick a colour, name it.

## 4. The rest
- Pet AI: a pet near you sniffs about, sits down after a while, lies down,
  looks at you; cats go to the scratching post; a happy pet shows off a trick
  it knows now and then.
- Toys in the world are drawn in both views (iso sprites from the same models).

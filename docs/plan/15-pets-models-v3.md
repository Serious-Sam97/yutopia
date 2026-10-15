# Pet models v3 — plan (delivered 2026-10-15, see PROGRESS)

Ask: "how can we improve the pets models even more? I like what we have now
but I want something even better, let's plan."

## Where we are
`art/pets3d.ts` builds each species from stacked primitives (ellipsoids,
capsules, tubes, cones) with Lambert shading and an ink outline; a procedural
rig poses the hierarchy (walk cycle, tricks, battles, faces with lids and
pupils). The iso view renders the same model into sprites; the panel spins it
on a turntable. It reads well as a chunky toy. What keeps it from "even
better": visible seams where parts meet, flat lighting with no fur or feather
feel, motion without weight (parts move, nothing lags or lands), one
expression language for all species, and one look per species.

## M1 — One-piece bodies and a drawn-looking surface (the biggest leap)
- **Spine meshes.** A small generator: a Catmull-Rom spine with per-station
  radius and squash (`stations: {t, r, sx, sy}`) swept into one smooth mesh —
  the body flows from chest to rump, the neck into the head, legs taper into
  paws. No seams, real silhouettes (a dog's tuck, a cat's arch, a rabbit's
  haunches, the platypus' flat sweep, a capybara's slab, a parrot's egg).
- **Ramp shading.** Patch the Lambert shader into a three-step ramp (light,
  mid, shadow — the art style's three tones) plus a warm rim light from the
  upper left, so the models read like the illustrated people.
- **Fuzzy outlines.** The outline mesh gets a vertex-shader wobble driven by
  noise: fluffy on the rabbit and cat, smooth on the platypus, feathery on
  the parrot. Thickness scales with the camera distance so the iso sprites
  keep a crisp line.
- Exit: every species on `/dev/pets` next to the current one, day and night,
  both views.

## M2 — Weight and gait
- **Secondary motion:** ears, tail, crest and hanging clothes lag the body
  with a spring (position + damping), a landing squash after jumps, a
  breathing chest, head bob tied to the steps.
- **Gaits per species:** trot (dog), slink with a low body and high tail
  (cat), hops (rabbit), waddle with a rolling body (platypus), a heavy plod
  (capybara), a bob and the odd wing flap (parrot); speed from the distance
  covered, as now.
- **Pose cross-fades:** poses blend over ~250 ms instead of snapping between
  acts (a sit flows into a lie-down, a jump into a landing).
- Exit: a walk-sit-sleep-jump sequence looks continuous in both views.

## M3 — Expression and species behaviour
- Expressions: surprised (wide eyes, raised brows), sleepy (half lids,
  slow blink), excited (dilated pupils, fast wag), scared (ears back, tail
  low), smug (one lid lower). Ears and tail carry the mood (ears forward when
  alert, back when angry or scared; tail up, tucked, bristled).
- Species idle sets: the dog scratches an ear and pants when tired; the cat
  grooms a paw, stretches and arches; the rabbit twitches its nose and does a
  binky; the platypus belly-slides and shakes dry; the capybara yawns and
  lies flat; the parrot preens, stretches a wing and bobs to the radio.
- Exit: each species shows three things of its own on `/dev/pets` and in the room.

## M4 — Breeds, details and things that move with the pet
- **Breeds:** three looks per species chosen at adoption (dog: shiba, beagle,
  poodle — ears, tail, fur density; cat: tabby, siamese, persian; rabbit: lop,
  dwarf, hare; platypus: young, old, mottled; capybara: plain, marked,
  shaggy; parrot: macaw, cockatoo, budgie), with the marking colours.
- Details: paw pads seen when it sits or rolls, claws, teeth in an open
  mouth, nostrils, inner-ear colour, tail-tip colour, a name tag on the collar.
- Clothes with life: a cape that flaps while running, a party hat that tilts
  with the head, a scarf that lags.
- Exit: the adoption screen shows the breeds on turntables; a dressed pet
  running looks dressed.

## M5 — Sharper in iso
- Sprites rendered at 3× and mipmapped (crisper lines at small sizes), a
  contact shadow that follows jumps and the throw arc, a dust puff on landing.
- Exit: the iso sheet matches the 3D look side by side.

## Order and gates
M1 → M2 → M3 → M4 → M5, each with before/after shots in
`design/screens/pets/` for approval before the next starts (image-first). M1
is two to three sessions of work; the rest one each.

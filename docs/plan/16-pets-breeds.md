# Pets — more breeds, part colours (plan — delivered 2026-10-15, see PROGRESS)

Ask: "let's add more races of dogs and cats! let's plan" and, for a cousin,
"make the platypus customisation able to reproduce the colour, colour of the
tail, feet…" of a teal platypus in a fedora.

## Where we are
Breeds (`BREEDS` in shared/pets.ts, `breedProfile` in art/pets3d.ts) are
three per species and shape ears, tail, fuzz, size, legs and body; markings
are one of spots / stripes / eye patch / socks in one colour; the coat is
one colour; eyes are ink; hats, collars and coats are fixed lists.

## 1. Breeds: twelve dogs, twelve cats
The breed table grows new axes so each breed is more than ears and a tail:
`muzzle` (long / short / flat), `earSize`, `ears` gains **fold** (a Scottish
fold) and **big** (a chihuahua, a sphynx), `bodyLen` / `legLen` / `size`,
`fuzz`, a **preset marking** that paints itself (a husky's mask, a tuxedo's
white chest and paws, a dalmatian's spots, a bengal's rosettes, a calico's
three patches), and an **eye colour** (amber, green, blue, brown) drawn as
an iris ring round the pupil.

| Dogs | what makes it |
| --- | --- |
| shiba, beagle, poodle | as now |
| corgi | long body, short legs, big upright ears, no tail |
| dachshund | very long body, very short legs, floppy ears |
| husky | pointy ears, curled tail, mask marking, blue eyes |
| golden | floppy ears, long fluffy tail, fuzz, honey coat |
| pug | flat muzzle, curled tail, small, round |
| bulldog | wide chest, short legs, flat muzzle, jowls |
| dalmatian | spots marking, floppy ears, slim |
| chihuahua | tiny, big ears, big eyes |
| shepherd | pointy ears, sloped back, long tail, saddle marking |

| Cats | what makes it |
| --- | --- |
| tabby, siamese, persian | as now |
| maine coon | big, fluffy, tufted ears, long bushy tail |
| sphynx | no fur (fuzz 0), big ears, skin tones, wrinkles on the brow |
| scottish fold | folded ears, round face |
| calico | three-colour patches (coat + white + orange) |
| tuxedo | black with a white chest, muzzle and paws |
| bengal | rosette marking, slim, long |
| ragdoll | fluffy, siamese points, blue eyes |
| bombay | sleek black, copper eyes |
| british shorthair | round, chunky, grey, orange eyes |

Adoption and Style show breeds as chips with a portrait each; the species
colour palettes gain the breeds' natural coats (husky grey, golden honey,
sphynx pink, british blue-grey).

## 2. Part colours (every species, the platypus first)
- `look.parts` — optional colours for the parts that aren't the coat:
  **bill / muzzle, feet, tail, belly, ears (inner)**. Unset parts keep
  today's derived tones. The platypus palette gains a teal and the part
  pickers default to its browns, so a teal body with an orange bill, feet
  and tail is a few clicks.
- Eye colour as above, pickable too.
- Style tab: a small part picker (a swatch row per part) under the coat colour.

## 3. One more hat
- **Fedora** (a brim with a pinched crown and a band) joins the hats; a
  platypus wears it low over the eyes.

## Order
1 (breeds, dogs then cats) → 2 (part colours + eye colour) → 3 (the fedora).
Each on `/dev/pets` with before/after shots; the shared rules get tests for
the new breed and part validation.

# 75 — The credits

Ask (2026-11-10), after plan 74 brought in artist-made hair from Sketchfab: "if we like then we plan on
the credits" → "Ok now the credit, let's plan".

Status: **built 2026-11-10** (all phases). Forks decided 2026-11-10 ("Go"): the recommendations, C1a
Settings plus a public `/credits`, C2a everything from others, C3a a change line per work.

## Why we need them

Every Sketchfab hair and beard we kept is **CC BY 4.0**. The licence lets us use, change and ship them,
commercially too, on these conditions:

- **Credit**, reasonable for the medium: the work's **title**, its **author** (with a link to them), a
  link to the **source**, and the **licence** with a link to it.
- **Say we changed it.** All of ours are changed: fitted to our people, re-coloured, re-lit, with our
  fur added under them.
- **No endorsement.** Nothing may suggest the authors back Yutopia.
- **No extra restrictions.** We may not stop anyone from doing what the licence allows with the
  original. Serving the GLBs to the game is fine.

A file in the repo isn't enough: players never see it. The credits must be **where players can find
them**.

## What needs crediting (as of 2026-11-10)

Each download's own `license.txt` gives these lines (`yutopia-art-src/sketchfab/<dir>/x/license.txt`).
Names are as the licence gives them, not the shop names. Digital Witch's bob is by **OksanaSun**.

| In the game | Title | Author | Source |
|---|---|---|---|
| `hair-sfcurly` | Curly Hair 1 (Beatrice) - Character Hair (Free) | CT Reed | sketchfab.com/3d-models/…89ed2c07 |
| `hair-sfcurly2` | Curly Hair 2 (Angel) - Character Hair (Free) | CT Reed | …a0f33a63 |
| `hair-sflong1` | Long Black Hair for Character | Marc Sawyer | …6c06611c |
| `hair-sfpony` | Ponytail Hair for Character | Marc Sawyer | …8ddc5c1c |
| `hair-sfwavy` | Long reddish hair for game | CarlosTorresVFX | …0664c544 |
| `hair-sfbun` | Messy Low Bun Female Hairstyle | CliffUnderside | …db7a61ea |
| `hair-sfbob2` | Bobhair | OksanaSun | …2149a717 |
| `hair-sfshort2` | Female Short Hairt Cards | ebadraza225 | …2daf1e54 |
| `hair-sfcorn` | Cornrow Braids Hairstyle | OCBacon | …c8052613 |
| `hair-sflong2` | Pocolov Hair 03 | pocolov | …db01a208 |
| `hair-sfmshort` | Businessman (Rigged), its hair | jungle_jim | …8933d61f |
| `hair-sfmshag` | "Robert", citizen of a future dystopia, his hair | Automatrio | …01966360 |
| `hair-sfmbraid` | Free Mesh - Big Guy [High Poly], his hair | jérémy paladini | …baf39894 |
| **every** `beard-*` but stubble | Bearded Man, his beard | kand8998 | …60947a18 |

That's 14 works by 12 authors. The licence is CC BY 4.0 for all of them.

Also used from others, where credit isn't required but is courteous:
- **MakeHuman** (CC0): the bodies, the nine system hairs and the clothes helpers.
- **The sounds**: CC0, listed in `public/sfx/CREDITS.md`.
- **Open-source code** (three.js, Jolt, Colyseus…): MIT and similar licences, which ask that their
  notice ship with copies. A web build is a copy.

## The forks (the user's call)

| | Fork | Options | My recommendation |
|---|---|---|---|
| C1 | **Where** | (a) a **Credits** page in Settings plus a public `/credits` page (no sign-in), linked from the sign-in screen's footer. (b) Settings only. (c) `/credits` only. | **(a)**. Settings is where a player looks. A public page lets anyone, the authors included, check without an account. |
| C2 | **What it lists** | (a) **everything from others**: the CC-BY works (required), the CC0 art and sounds (courtesy), and the code licences. (b) the CC-BY works only. | **(a)**, with the code notices generated from `package.json` licences. It costs little once the page exists. |
| C3 | **The change line** | (a) one line per work ("fitted to Yutopia's people, re-coloured, with our fur under it"). (b) one shared line for all. | **(a)**. Each work's changes differ: some re-textured, a beard cut into seven styles. |

## A dependency: what ships

The credits list only **what the game actually serves**. Today the kept hairs are bench-only
(`hair-sf*` names, outside the wardrobe), and the wardrobe's 22 hair names still use plan 74's card
styles. So phase 1 wires the keepers into the wardrobe first. Otherwise we'd credit things nobody can
wear, or ship things nobody credits.

## Phases

### 0 — The sources in the repo

- Move the Sketchfab extract scripts (`sf_extract.py`, `sf_extract_one.py`, today in a session
  scratchpad) into `tools/art/life/`. Then the hairs can be rebuilt from the downloads by anyone.
- Add **`tools/art/life/sources.json`**: one entry per imported work, keyed as in `hair.py IMPORTED`.
  Each entry holds the title, author, author URL, source URL, licence, licence URL, the change line,
  and how it was extracted (materials, flip, stand, head). A small script fills it from each
  `license.txt`, so nothing is typed by hand.
- Copy each `license.txt` into `tools/art/life/licenses/<key>.txt`. The downloads themselves stay out
  of git in `yutopia-art-src`, like MakeHuman's sources.
- `hair.py IMPORTED` reads its file paths and options from `sources.json`: one list, so a work can't
  ship uncredited or stay credited after it's removed.

### 1 — What ships

- Map the wardrobe's 22 hair names onto the keepers (women's and men's), the fur cuts and MakeHuman's
  CC0 hairs. Retire the plan 74 card styles that nobody kept.
- Per the user: women's are the 10 kept plus the curly. Men's are the fur buzz and fade, MakeHuman
  short 1, 2 and 4, the Businessman cut, the shaggy cut and the braid, plus the unisex ones (cornrows,
  long black, bun, curly).
- Before shipping, bring the files within budget. Most imports and the full and boxed beards are over
  `life-budget.test.ts`'s 0.6 MB per garment and 28k triangles per hair.

### 2 — The credits data

- The people build writes **`apps/client/public/credits.json`**. It lists every built file with an
  imported part, with its `sources.json` credit, plus the courtesy groups: MakeHuman, the sounds (from
  `public/sfx/CREDITS.md`, moved into the same JSON) and the code licences (generated at build time
  from the client's dependencies).
- Each GLB also carries its credit in glTF's own `asset.copyright` field, so a file passed around
  alone still names its author.
- **A test** (beside `life-budget.test.ts`): every `hair-*` and `beard-*` file built from an import
  has an entry in `credits.json`, and every entry points at a file that exists.

### 3 — The page

- **Settings → Credits**: a new page on the rail, with its own words in the panel's `W` table (EN and
  PT-BR). It loads with the panel, so the world page's budget doesn't change. Cards by kind:
  "Hair & beards", "People", "Sounds", "Code".
- Each line reads: *Title*, by **Author** (link) · CC BY 4.0 (link) · the change line. Links open in a
  new tab. Credits only, with no "thanks to our partners" wording that could read as endorsement.
- **`/credits`**: a public route rendering the same JSON, static, no sign-in. It's linked from the
  Settings page and from the sign-in screen's footer.

### 4 — Checks

- An e2e: open Settings → Credits, every work listed, every link well-formed. `/credits` loads signed
  out.
- The world page's budget is unchanged (the page is lazy).
- A takedown drill on paper: removing one work from `sources.json` drops it from the wardrobe, the
  build and the credits together.

## Risks

- **Authors rename or leave Sketchfab.** We credit as each licence was given at download time and keep
  the author link. `license.txt` is the record.
- **A takedown request.** One list (`sources.json`) drives the build and the credits, so removal is
  one edit and a rebuild.
- **Re-uploads.** Each work was checked for signs of a rip (game names, "credits to…", duplicates).
  Anything new goes through the same check before it enters `sources.json`.

## Open questions

- C1–C3 above.
- Do the CC0 MakeHuman hairs that ship get a courtesy line each, or one line for MakeHuman as a whole?
  The recommendation is one line.

## Done (2026-11-10)

- **0.** `tools/art/life/sf_extract.py` (rewritten, its settings documented), `sources.json` (the one
  list: each work's folder, extraction settings, build options, change line and credit),
  `sources.py credits | extract | sheet` (credits filled from each `license.txt`; licences copied to
  `tools/art/life/licenses/`), `bake_hair_atlas.py` back in the repo (the strand sheet the shaggy cut is
  re-textured with). `hair.py IMPORTED` reads `sources.json`.
- **1.** `hair.py WARDROBE_HAIR`: the wardrobe's names made from the works, our fur (buzz, fade) and
  MakeHuman's CC0 hairs (crew, slick, pixie, braids). The other wardrobe hairs (locs, topknot, undercut,
  pigtails, high pony) are still plan 74's own; they need no credit. Budgets: the fur now sits on a
  decimated copy of the skin (`COARSE` 0.35: a full beard 36k → 15k triangles), three layers under
  another's hair, and the five heaviest works are trimmed at extraction (`DECIMATE`). Beard files got
  their own budget (16k triangles, 0.8 MB, measured: full 15.6k). Stills: `design/screens/life/p75/`.
- **2.** `tools/credits.py` (run by `build_all.sh` after the packing) writes
  `apps/client/public/credits.json`: 14 works, MakeHuman, 62 sounds parsed from
  `public/sfx/CREDITS.md`, 9 libraries with their licence texts. It also stamps each file's glTF
  `asset.copyright`. `life-credits.test.ts` checks it against what's built.
- **3.** `components/Credits.tsx` (EN/PT words of its own), in **Settings → Credits** (a heart on the
  rail, lazy with the panel) and on the public **`/credits`**, linked from the sign-in screens' footer.
- **4.** `e2e/credits.spec.ts`: signed out from the sign-in screen, and in the world. Both pass.

Left: the change lines are in English only (they're the licence record). The emulator cores the
arcade loads are credited in its own panel, not here.

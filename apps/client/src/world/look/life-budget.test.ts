// Plan 73, phase 1 — the life look's assets against their budgets: every .glb that
// tools/art/life/build_all.sh made (apps/client/public/life, not in git: skipped when not built).
// Read by hand (the GLB container, the KTX2 headers): no three, no GPU.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { JOINTS } from "../chars/rig";
import { KNUCKLES } from "./life-people";

const DIR = join(import.meta.dirname, "../../../public/life");

/** What each kind may cost: the download, its textures on the GPU (transcoded at ~1 byte a pixel, BC7 /
 *  ASTC 4×4, with their mips), its triangles. */
const BUDGETS: Record<string, { mb: number; gpuMb: number; tris: number }> = {
  // (2.2 → 2.6 MB with the slim and broad bodies as morph targets on every part: phase 4, +0.3 MB)
  // (46k → 50k tris with the teeth and the tongue: phase 4.4, +7.6k — the teeth are MakeHuman's, 3.6k quads,
  // and a part with the mouth's shapes can't be decimated in Blender; the far level, 4.5, has no mouth)
  // (2.6 → 3.2 MB with the body whole and what each vertex is on it — the skin under what's worn hidden by
  // the game: phase 5, 2.96 MB measured; person-<who>-wear.glb, every made garment and hair, is 1.33 MB)
  // (50k → 62k tris in the file, the same phase: its whole body — drawn, the skin under the clothes is
  // dropped from the index: 36–42k measured on the bench in the sample's outfits, 60.0k the man's file)
  person: { mb: 3.2, gpuMb: 9.5, tris: 62000 },
  // (phase 5: a person's made garments and hair, every one in the wardrobe in one file — only the worn
  // ones reach the GPU; 3.1 MB and ~13.3 MB of textures if all were, with the CC0 pack's seven hairs)
  // (3.6 → 7 MB with the wardrobe's tops and bottoms, 5.2: 4.81 MB the man's — every one in one file; 5.4
  // loads only what's worn)
  // (16 → 24 MB of textures with the CC0 pack's six shoes, batch 3: ~18.9 MB were all of them on the GPU —
  // only what's worn is)
  // (7 → 9 MB and 240k tris in the file with every hair and beard, 5.3: 7.96 MB, 207.9k the man's — one
  // person draws only what they wear)
  wear: { mb: 9, gpuMb: 24, tris: 240000 },
  plant: { mb: 0.3, gpuMb: 1.5, tris: 12000 },
  tree: { mb: 0.4, gpuMb: 2, tris: 12000 },
};
const kindOf = (f: string) => (f.endsWith("-wear.glb") ? "wear" : f.split("-")[0]);
// (the extensions the life loader reads: life-assets.ts lifeLoader)
const SUPPORTED = new Set(["KHR_texture_basisu", "EXT_meshopt_compression", "KHR_materials_emissive_strength"]);

interface Glb {
  json: {
    images?: { bufferView?: number; mimeType?: string }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
    accessors: { count: number }[];
    meshes: { name?: string; primitives: { indices?: number; attributes: Record<string, number> }[] }[];
    skins?: { joints: number[] }[];
    nodes: { name?: string }[];
    extensionsRequired?: string[];
  };
  bin: Buffer;
}

function readGlb(path: string): Glb {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, `${path}: not a GLB`);
  let off = 12;
  let json: Glb["json"] | null = null;
  let bin = Buffer.alloc(0);
  while (off < b.length) {
    const len = b.readUInt32LE(off);
    const kind = b.readUInt32LE(off + 4);
    const body = b.subarray(off + 8, off + 8 + len);
    if (kind === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    if (kind === 0x004e4942) bin = body;
    off += 8 + len;
  }
  assert.ok(json, `${path}: no JSON chunk`);
  return { json, bin };
}

/** A KTX2 image's GPU bytes once transcoded (~1 byte a pixel, its mips a third more). */
function ktx2Bytes(img: Buffer): number {
  // (the KTX2 header: the identifier, then vkFormat, typeSize, pixelWidth, pixelHeight…)
  const w = img.readUInt32LE(20);
  const h = img.readUInt32LE(24);
  return w * h * (4 / 3);
}

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".glb") && BUDGETS[kindOf(f)]) : [];
// (the photo-textured bench people of phase 0b aren't packed: the painted ones are what ships)
const shipped = files.filter((f) => !/^person-(man|woman)\.glb$/.test(f));

test(
  "life assets: built (or skipped)",
  { skip: shipped.length === 0 && "not built (tools/art/life/build_all.sh)" },
  () => {
    assert.ok(shipped.length > 0);
  },
);

for (const f of shipped) {
  const budget = BUDGETS[kindOf(f)];
  test(`life asset ${f}: within its budget, packed, readable`, () => {
    const path = join(DIR, f);
    const size = readFileSync(path).length;
    const { json, bin } = readGlb(path);
    assert.ok(size <= budget.mb * 1e6, `${f}: ${(size / 1e6).toFixed(2)} MB > ${budget.mb} MB`);
    // every texture KTX2, and its GPU cost
    let gpu = 0;
    for (const img of json.images ?? []) {
      assert.equal(img.mimeType, "image/ktx2", `${f}: an image not packed (pack_glb.py)`);
      const v = json.bufferViews[img.bufferView as number];
      gpu += ktx2Bytes(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
    }
    assert.ok(gpu <= budget.gpuMb * 1e6, `${f}: textures ~${(gpu / 1e6).toFixed(1)} MB on the GPU > ${budget.gpuMb}`);
    // triangles
    let tris = 0;
    for (const m of json.meshes)
      for (const p of m.primitives)
        tris +=
          p.indices !== undefined
            ? json.accessors[p.indices].count / 3
            : json.accessors[p.attributes.POSITION].count / 3;
    assert.ok(tris <= budget.tris, `${f}: ${tris} triangles > ${budget.tris}`);
    // nothing the loader can't read
    for (const e of json.extensionsRequired ?? []) assert.ok(SUPPORTED.has(e), `${f}: needs ${e}`);
    // a person: our joints, all of them, and four weights a vertex at most (no JOINTS_1)
    if (kindOf(f) === "person") {
      const names = new Set((json.skins?.[0]?.joints ?? []).map((j) => json.nodes[j].name));
      for (const j of JOINTS) assert.ok(names.has(j), `${f}: no joint ${j}`);
      // (plan 77 phase 6: and the knuckles — the near person's; the far one's hands are one lump)
      if (!f.includes("-far")) for (const k of KNUCKLES) assert.ok(names.has(k), `${f}: no knuckle ${k}`);
      for (const m of json.meshes)
        for (const p of m.primitives) assert.ok(!("JOINTS_1" in p.attributes), `${f}: ${m.name} has a fifth weight`);
    }
  });
}

// ── the garments (phase 5.4: a file each, public/life/wear-<who>/<name>.glb — a person loads only what
// they wear: an outfit ~7 of them) ─────────────────────────────────────────────────────────────────

/** A garment's file: small (the largest, the CC0 pack's hairs, ~0.4 MB), packed, readable, our rig. */
const GARMENT = { mb: 0.6, gpuMb: 3, tris: 12000 };
/** (plan 74 phase 4) a strand-card hair's: its cap and many fine cards — 12k → 28k triangles (curly's
 *  ringlets ~26k), 0.6 → 1.4 MB */
const HAIR_FILE = { ...GARMENT, mb: 1.4, tris: 28000 };
/** (plan 75) a beard's: a fur of ours, layers on a coarse skin (~10k triangles a full beard), and the
 *  Sketchfab strands over it (~4.7k) — measured 2026-11-10: full 15.6k, 0.77 MB → 16k, 0.8 MB */
const BEARD_FILE = { ...GARMENT, mb: 0.8, tris: 16000 };
const fileBudget = (f: string) => (f.startsWith("hair-") ? HAIR_FILE : f.startsWith("beard-") ? BEARD_FILE : GARMENT);
for (const who of ["man", "woman"]) {
  const dir = join(DIR, `wear-${who}`);
  const glbs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".glb")) : [];
  test(
    `life garments wear-${who}: each within its budget, packed, readable`,
    { skip: !glbs.length && "not built" },
    () => {
      for (const f of glbs) {
        const path = join(dir, f);
        const size = readFileSync(path).length;
        const { json, bin } = readGlb(path);
        const mb = fileBudget(f).mb;
        assert.ok(size <= mb * 1e6, `${who}/${f}: ${(size / 1e6).toFixed(2)} MB > ${mb} MB`);
        let gpu = 0;
        for (const img of json.images ?? []) {
          assert.equal(img.mimeType, "image/ktx2", `${who}/${f}: an image not packed (pack_glb.py)`);
          const v = json.bufferViews[img.bufferView as number];
          gpu += ktx2Bytes(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
        }
        assert.ok(gpu <= GARMENT.gpuMb * 1e6, `${who}/${f}: textures ~${(gpu / 1e6).toFixed(1)} MB > ${GARMENT.gpuMb}`);
        let tris = 0;
        for (const m of json.meshes)
          for (const p of m.primitives)
            tris +=
              p.indices !== undefined
                ? json.accessors[p.indices].count / 3
                : json.accessors[p.attributes.POSITION].count / 3;
        const cap = fileBudget(f).tris;
        assert.ok(tris <= cap, `${who}/${f}: ${tris} triangles > ${cap}`);
        for (const e of json.extensionsRequired ?? []) assert.ok(SUPPORTED.has(e), `${who}/${f}: needs ${e}`);
        const names = new Set((json.skins?.[0]?.joints ?? []).map((j) => json.nodes[j].name));
        for (const j of JOINTS) assert.ok(names.has(j), `${who}/${f}: no joint ${j}`);
      }
    },
  );
}

// ── the guns (plan 79 phase 3: tools/art/guns/build_guns.py → public/life/guns/<kind>.glb) ─────────

/** A gun's file: no textures (plain materials till they're baked), meshopt geometry. Measured
 *  2026-11-11: the revolver 0.14 MB, 15.1k triangles; the double-barrel 0.10 MB, 10.5k; 2026-11-12
 *  the AK 0.11 MB, 11.2k; the sniper 0.15 MB, 17.8k; the Daybreak 0.22 MB, 25.4k (its lens, cage, fins and
 *  filament — raised for it alone, 2026-11-12). */
const GUN = { mb: 0.25, tris: 20000 };
const GUN_TRIS: Record<string, number> = { daybreak: 26000 };
/** What the game looks for in each (tp/guns3d.ts lifeGunModel, poseGun): the pivots, the rounds, the points. */
const GUN_NODES: Record<string, string[]> = {
  revolver: ["hammer", "trigger", "crane", "cylinder", "rod", "latch", "round0", "round5"],
  // (plan 80) the revolver's speedloader
  speedloader: ["knob", "rounds", "round0", "round5", "pt_grip", "pt_front"],
  // (plan 80) the revolver's holster
  holster: ["pt_grip"],
  pouch: ["pt_top"],
  shotgun: ["barrels", "lever", "triggers", "round0", "round1"],
  ak47: ["magazine", "carrier", "trigger", "selector", "round0", "pt_fore", "pt_butt"],
  sniper: ["bolt", "trigger", "pt_fore", "pt_butt"],
  daybreak: ["cell", "core", "needle", "trigger", "pt_fore", "pt_butt"],
};
const GUN_DIR = join(DIR, "guns");
for (const kind of Object.keys(GUN_NODES)) {
  const path = join(GUN_DIR, `${kind}.glb`);
  test(
    `life gun ${kind}: within its budget, readable, its parts and points named`,
    { skip: !existsSync(path) && "not built" },
    () => {
      const size = readFileSync(path).length;
      assert.ok(size <= GUN.mb * 1e6, `${kind}: ${(size / 1e6).toFixed(2)} MB > ${GUN.mb} MB`);
      const { json } = readGlb(path);
      let tris = 0;
      for (const m of json.meshes)
        for (const p of m.primitives)
          tris +=
            p.indices !== undefined
              ? json.accessors[p.indices].count / 3
              : json.accessors[p.attributes.POSITION].count / 3;
      const most = GUN_TRIS[kind] ?? GUN.tris;
      assert.ok(tris <= most, `${kind}: ${tris} triangles > ${most}`);
      for (const e of json.extensionsRequired ?? []) assert.ok(SUPPORTED.has(e), `${kind}: needs ${e}`);
      const names = new Set(json.nodes.map((n) => n.name));
      // (a gun's sights and muzzle; the speedloader's only its own)
      const sights =
        kind === "speedloader" || kind === "holster" || kind === "pouch"
          ? []
          : ["pt_grip", "pt_muzzle", "pt_rear", "pt_front"];
      for (const n of [kind, ...GUN_NODES[kind], ...sights]) assert.ok(names.has(n), `${kind}: no node ${n}`);
    },
  );
}

// ── the material library (phase 3: tools/art/life/materials.mts → public/life/mat) ──────────────

const MAT_DIR = join(DIR, "mat");
/** The whole library's budget: what it costs to download all of it (each material loads only when
 *  used), and on the GPU with everything in. Low's half-size set a quarter of it. (6.5 MB: plan 110's ten building
 *  skins and roofs took it to 6.2 — each loads only where a building wears it; measured 2026-11-20.) */
// (8.5 MB on 2026-11-26, the user's standing call on budgets: plan 130's quality pass — 15 CC0 photo materials for
// the house build's floors, walls and roofs; 7.8 MB measured; each material is fetched only when it's drawn)
const LIB_BUDGET = { mb: 8.5, gpuMb: 72 }; // (gpu 72: the same pass, ~69 MB if every material were drawn at once)

test(
  "material library: every material's three maps, full and half, within budget",
  {
    skip: !existsSync(MAT_DIR) && "not built (tools/art/life/materials.mts)",
  },
  async () => {
    const { LIBRARY, MAPS, MAT_IDS, matFile } = await import("./life-matlib-list");
    let mb = 0;
    let gpu = 0;
    let halfMb = 0;
    for (const id of MAT_IDS)
      for (const m of MAPS)
        for (const half of [false, true]) {
          const f = join(MAT_DIR, matFile(id, m, half));
          assert.ok(existsSync(f), `${matFile(id, m, half)} not built`);
          const b = readFileSync(f);
          assert.equal(b.subarray(1, 7).toString("latin1"), "KTX 20", `${f}: not KTX2`);
          const w = b.readUInt32LE(20);
          // (the albedo and orm at the library's size, the normal at half of it; Low's all half again)
          const want = LIBRARY[id].px / (m === "normal" ? 2 : 1) / (half ? 2 : 1);
          assert.equal(w, want, `${matFile(id, m, half)}: ${w} px, not ${want}`);
          if (half) halfMb += b.length / 1e6;
          else {
            mb += b.length / 1e6;
            gpu += ktx2Bytes(b) / 1e6;
          }
        }
    assert.ok(mb <= LIB_BUDGET.mb, `the library: ${mb.toFixed(1)} MB to download > ${LIB_BUDGET.mb}`);
    assert.ok(halfMb <= LIB_BUDGET.mb / 3, `Low's library: ${halfMb.toFixed(1)} MB > ${LIB_BUDGET.mb / 3}`);
    assert.ok(gpu <= LIB_BUDGET.gpuMb, `the library: ~${gpu.toFixed(0)} MB on the GPU > ${LIB_BUDGET.gpuMb}`);
  },
);

// ── the cars (plan 92: tools/art/cars/build_cars.py → public/life/cars, manifest.json) ────────────────────

const CAR_DIR = join(DIR, "cars");
/** A car's files: meshopt geometry, the paint's dent morphs, and no images of their own — every texture a
 *  URI to a shared KTX2 (tex/ beside the cars, or the life library's ../mat/), checked to exist. Measured
 *  2026-11-16 (the quality pass): the road cars' near 66–89k triangles, 1.23–1.53 MB; mid 13.6–20k from the
 *  generators (no decimation), ~0.4–0.5 MB; far ~1.7k; the shuttle 95.9k → trimmed to its budget. */
const CAR = {
  near: { mb: 1.6, tris: 90000 },
  mid: { mb: 0.6, tris: 18000 },
  far: { mb: 0.12, tris: 2600 },
  extra: { mb: 0.05, tris: 2600 },
  wheel: { mb: 0.12, tris: 6000 },
};
const MID_TRIS: Record<string, number> = { "shuttle-bus": 22000 };
const CAR_TRIS: Record<string, number> = {};
/** What the game looks for in a road car (and, fewer, in a work vehicle): the pivots, the lamps, the points. */
const ROAD_NODES = [
  "body",
  "wheel_fl",
  "steer_fl",
  "spin_fl",
  "wheel_rr",
  "spin_rr",
  "steering",
  "screen",
  "lamp_head",
  "lamp_tail",
  "lamp_brake",
  "lamp_reverse",
  "lamp_ind_l",
  "lamp_ind_r",
  "plate_r",
  "collider",
  "seat_0",
  "eye",
  "hub_fl",
  "headlight_l",
  "exhaust_0",
  "x_roof",
];
const WORK_NODES = ["body", "collider", "seat_0", "hub_fl"];

function trisOf(json: Glb["json"]): number {
  let tris = 0;
  for (const m of json.meshes)
    for (const p of m.primitives)
      tris +=
        p.indices !== undefined ? json.accessors[p.indices].count / 3 : json.accessors[p.attributes.POSITION].count / 3;
  return tris;
}

const MANIFEST_PATH = join(CAR_DIR, "manifest.json");
const carManifest = existsSync(MANIFEST_PATH)
  ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      cars: Record<string, { file: string; variant: string; tris: Record<string, number> }>;
      far: Record<string, { file: string }>;
      extras?: Record<string, { file: string }>;
      wheels?: Record<string, { file: string }>;
    })
  : null;

for (const [id, car] of Object.entries(carManifest?.cars ?? {})) {
  test(`life car ${id}: near, mid within budget, its nodes named`, () => {
    const work = car.variant === "work";
    for (const [lod, file] of [
      ["near", car.file],
      ["mid", car.file.replace(".glb", "-mid.glb")],
    ] as const) {
      const path = join(CAR_DIR, file);
      if (work && lod === "mid" && !existsSync(path)) continue;
      const size = readFileSync(path).length;
      const budget = CAR[lod];
      assert.ok(size <= budget.mb * 1e6, `${file}: ${(size / 1e6).toFixed(2)} MB > ${budget.mb} MB`);
      const { json } = readGlb(path);
      for (const e of json.extensionsRequired ?? []) assert.ok(SUPPORTED.has(e), `${file}: needs ${e}`);
      const most = lod === "near" ? (CAR_TRIS[id] ?? budget.tris) : (MID_TRIS[id] ?? budget.tris);
      const tris = trisOf(json);
      assert.ok(tris <= most, `${file}: ${tris} triangles > ${most}`);
      // (its textures: URIs, every one there; no embedded images)
      for (const img of (json as { images?: { uri?: string; bufferView?: number }[] }).images ?? []) {
        assert.ok(img.uri && img.bufferView === undefined, `${file}: an embedded image`);
        assert.ok(existsSync(join(CAR_DIR, img.uri)), `${file}: ${img.uri} missing`);
      }
      if (lod === "near") {
        const names = new Set(json.nodes.map((n) => n.name));
        for (const n of work ? WORK_NODES : ROAD_NODES) assert.ok(names.has(n), `${file}: no node ${n}`);
        // (a door at least: the bus's are on its right only)
        if (!work)
          assert.ok(
            [...names].some((n) => n?.startsWith("door_")),
            `${file}: no door`,
          );
        // (the dents: on the paint, road cars only)
        if (!work)
          assert.ok(
            json.meshes.some((m) => m.name === "body-paint" && m.primitives.some((p) => "targets" in p)),
            `${file}: no dent morphs`,
          );
      }
    }
  });
}
for (const [body, far] of Object.entries(carManifest?.far ?? {})) {
  test(`life car far ${body}: within budget`, () => {
    const path = join(CAR_DIR, far.file);
    assert.ok(readFileSync(path).length <= CAR.far.mb * 1e6, `${far.file}: over ${CAR.far.mb} MB`);
    assert.ok(trisOf(readGlb(path).json) <= CAR.far.tris, `${far.file}: over ${CAR.far.tris} triangles`);
  });
}
for (const [group, budget] of [
  ["extras", CAR.extra],
  ["wheels", CAR.wheel],
] as const) {
  for (const [id, x] of Object.entries(carManifest?.[group] ?? {})) {
    test(`life car ${group} ${id}: within budget`, () => {
      const path = join(CAR_DIR, x.file);
      assert.ok(readFileSync(path).length <= budget.mb * 1e6, `${x.file}: over ${budget.mb} MB`);
      assert.ok(trisOf(readGlb(path).json) <= budget.tris, `${x.file}: over ${budget.tris} triangles`);
    });
  }
}

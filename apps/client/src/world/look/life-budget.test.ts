// Plan 73, phase 1 — the life look's assets against their budgets: every .glb that
// tools/art/life/build_all.sh made (apps/client/public/life, not in git: skipped when not built).
// Read by hand (the GLB container, the KTX2 headers): no three, no GPU.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { JOINTS } from "../chars/rig";

const DIR = join(import.meta.dirname, "../../../public/life");

/** What each kind may cost: the download, its textures on the GPU (transcoded at ~1 byte a pixel, BC7 /
 *  ASTC 4×4, with their mips), its triangles. */
const BUDGETS: Record<string, { mb: number; gpuMb: number; tris: number }> = {
  // (2.2 → 2.6 MB with the slim and broad bodies as morph targets on every part: phase 4, +0.3 MB)
  // (46k → 50k tris with the teeth and the tongue: phase 4.4, +7.6k — the teeth are MakeHuman's, 3.6k quads,
  // and a part with the mouth's shapes can't be decimated in Blender; the far level, 4.5, has no mouth)
  person: { mb: 2.6, gpuMb: 9.5, tris: 50000 },
  plant: { mb: 0.3, gpuMb: 1.5, tris: 12000 },
  tree: { mb: 0.4, gpuMb: 2, tris: 12000 },
};
const kindOf = (f: string) => f.split("-")[0];
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
      for (const m of json.meshes)
        for (const p of m.primitives) assert.ok(!("JOINTS_1" in p.attributes), `${f}: ${m.name} has a fifth weight`);
    }
  });
}

// ── the material library (phase 3: tools/art/life/materials.mts → public/life/mat) ──────────────

const MAT_DIR = join(DIR, "mat");
/** The whole library's budget: what it costs to download all of it (each material loads only when
 *  used), and on the GPU with everything in. Low's half-size set a quarter of it. */
const LIB_BUDGET = { mb: 6, gpuMb: 64 };

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

// The life look's photo materials (docs/plan/130-the-house-build.md, the quality pass): CC0 sets from ambientCG,
// downloaded (with the user's OK, 2026-11-26) into yutopia-art-src/textures/ambientcg/<id>/, made into the library's
// three maps — albedo (sRGB), orm (R ambient occlusion, G roughness, B metal; linear), normal (OpenGL's, as three) —
// full and half (Low), KTX2 by basisu, as tools/art/life/materials.mts makes the painted ones.
//   node --experimental-strip-types tools/art/life/photo-materials.mts [--only terrazzo,roof-clay]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { LIBRARY, MAT_IDS, type MatDef, matFile } from "../../../apps/client/src/world/look/life-matlib-list.ts";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const only = opt("--only")?.split(",");
const HOME = process.env.HOME ?? "";
const SRC = opt("--src") ?? join(HOME, "Developer/projects/yondra/yutopia-art-src/textures/ambientcg");
const BASISU = opt("--basisu") ?? join(HOME, "Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu");
const OUT = new URL("../../../apps/client/public/life/mat/", import.meta.url).pathname;
const PNG = join(tmpdir(), "yutopia-photo-mat");

/** A map of a set (`Color`, `Roughness`, …) decoded to `n`×`n` RGB, or null when the set hasn't one. */
function read(dir: string, id: string, map: string, n: number): Uint8Array | null {
  const f = readdirSync(dir).find((x) => x.startsWith(`${id}_1K-JPG_${map}.`));
  if (!f) return null;
  const buf = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", join(dir, f), "-vf", `scale=${n}:${n}:flags=lanczos`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: n * n * 3 + 1024 },
  );
  return new Uint8Array(buf.buffer, buf.byteOffset, n * n * 3);
}

// (a PNG, RGB 8-bit — as materials.mts writes them)
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(new Uint8Array(out.subarray(4, 8 + data.length))), 8 + data.length);
  return out;
};
function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function encode(id: string, kind: "albedo" | "orm" | "normal", half: boolean, n: number, data: Uint8Array) {
  const file = matFile(id as never, kind, half);
  const p = join(PNG, file.replace(".ktx2", ".png"));
  writeFileSync(p, png(n, n, data));
  const flags =
    kind === "orm"
      ? ["-linear"]
      : kind === "normal"
        ? ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "1.5", "-normal_map", "-mip_renorm"]
        : [];
  execFileSync(BASISU, ["-ktx2", "-mipmap", "-quiet", ...flags, p, "-output_file", join(OUT, file)], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

mkdirSync(PNG, { recursive: true });
for (const id of MAT_IDS) {
  const def = LIBRARY[id] as MatDef;
  if (!def.photo || (only && !only.includes(id))) continue;
  const dir = join(SRC, def.photo);
  if (!existsSync(dir)) {
    console.warn(`${id}: ${dir} not downloaded`);
    continue;
  }
  for (const half of [false, true]) {
    const n = def.px / (half ? 2 : 1);
    const nn = n / 2; // (the normal at half the library's size, as the painted ones)
    const color = read(dir, def.photo, "Color", n);
    if (!color) throw new Error(`${id}: no Color map`);
    const ao = read(dir, def.photo, "AmbientOcclusion", n);
    const rough = read(dir, def.photo, "Roughness", n);
    const metal = read(dir, def.photo, "Metalness", n);
    const orm = new Uint8Array(n * n * 3);
    for (let i = 0; i < n * n; i++) {
      orm[i * 3] = ao ? ao[i * 3] : 255;
      orm[i * 3 + 1] = rough ? rough[i * 3] : 200;
      orm[i * 3 + 2] = metal ? metal[i * 3] : 0;
    }
    const normal = read(dir, def.photo, "NormalGL", nn) ?? new Uint8Array(nn * nn * 3).fill(128).map((v, i) => (i % 3 === 2 ? 255 : v));
    encode(id, "albedo", half, n, color);
    encode(id, "orm", half, n, orm);
    encode(id, "normal", half, nn, normal);
  }
  console.log(`${id}: ${def.photo}, ${def.px}px`);
}

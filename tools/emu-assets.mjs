// The game room's emulator cores and built-in cartridges (docs/plan/09-game-room.md):
// each one pinned by sha256 in tools/emu-cores.json / tools/emu-games.json,
// fetched once, unpacked into apps/client/public/emu/{cores,games} (served as
// static files, not in git).
//   node tools/emu-assets.mjs          fetch what's missing (cached in node_modules/.cache)
//   node tools/emu-assets.mjs --check  fail if something is missing
// The 2600 core comes from EmulatorJS (a 7z inside an npm tarball): its loader is
// renamed so Nostalgist loads it like the others.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const { cores, frontend } = JSON.parse(readFileSync(join(root, "tools/emu-cores.json"), "utf8"));
const { games } = JSON.parse(readFileSync(join(root, "tools/emu-games.json"), "utf8"));
const out = join(root, "apps/client/public/emu/cores");
const gamesOut = join(root, "apps/client/public/emu/games");
const cache = join(root, "node_modules/.cache/yutopia-emu");
const files = (c) => [`${c.core}_libretro.js`, `${c.core}_libretro.wasm`].map((f) => join(out, f));

if (process.argv.includes("--check")) {
  const missing = [
    ...cores.filter((c) => !files(c).every(existsSync)).map((c) => c.core),
    ...games.filter((g) => !existsSync(join(gamesOut, g.file))).map((g) => g.file),
  ];
  if (missing.length) {
    console.error(`[emu] missing: ${missing.join(", ")} — run: node tools/emu-assets.mjs`);
    process.exit(1);
  }
  console.log(`[emu] ${cores.length} cores, ${games.length} cartridges in place`);
  process.exit(0);
}

mkdirSync(out, { recursive: true });
mkdirSync(gamesOut, { recursive: true });
mkdirSync(cache, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function fetchPinned(c) {
  const file = join(cache, `${c.core ?? c.file}-${c.sha256.slice(0, 12)}`);
  let buf = existsSync(file) ? readFileSync(file) : null;
  if (!buf) {
    const res = await fetch(c.url);
    if (!res.ok) throw new Error(`${c.core}: HTTP ${res.status} for ${c.url}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const got = sha256(buf);
  if (got !== c.sha256) throw new Error(`${c.core ?? c.file}: sha256 ${got} ≠ pinned ${c.sha256} — refusing it`);
  writeFileSync(file, buf);
  return buf;
}

// A zip's files (stored or deflated), by name.
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const found = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (!name.endsWith("/")) found[name.split("/").pop()] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return found;
}

// One file out of a .tgz.
function untgz(buf, wanted) {
  const tar = gunzipSync(buf);
  for (let p = 0; p + 512 <= tar.length; ) {
    const name = tar
      .subarray(p, p + 100)
      .toString("utf8")
      .replace(/\0.*$/s, "");
    if (!name) break;
    const size = Number.parseInt(
      tar
        .subarray(p + 124, p + 136)
        .toString("utf8")
        .trim() || "0",
      8,
    );
    if (name === wanted) return tar.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} not in the tarball`);
}

// A 7z archive's files, with whichever 7z reader this machine has.
function un7z(buf) {
  const dir = mkdtempSync(join(tmpdir(), "yutopia-emu-"));
  try {
    const arc = join(dir, "core.7z");
    writeFileSync(arc, buf);
    const x = join(dir, "x");
    mkdirSync(x);
    try {
      execFileSync("bsdtar", ["-xf", arc, "-C", x], { stdio: "ignore" });
    } catch {
      execFileSync("7z", ["x", "-y", `-o${x}`, arc], { stdio: "ignore" });
    }
    const found = {};
    for (const f of execFileSync("ls", [x]).toString().split("\n").filter(Boolean)) found[f] = readFileSync(join(x, f));
    return found;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// EmulatorJS names its loader EJS_Runtime and exports it CommonJS-style;
// Nostalgist wants an ES-module-style libretro_<core> factory.
function asNostalgistCore(js, core) {
  const text = js.toString("utf8");
  if (!text.includes("var EJS_Runtime = ")) throw new Error(`${core}: unexpected loader`);
  const body = text.replace("var EJS_Runtime = ", `var libretro_${core} = `);
  const cut = body.lastIndexOf("if (typeof exports === 'object' && typeof module === 'object')");
  return `// import.meta.url — an ES-module core for Nostalgist (renamed from EmulatorJS's EJS_Runtime)\n${cut > 0 ? body.slice(0, cut) : body}\n`;
}

for (const c of cores) {
  const [jsOut, wasmOut] = files(c);
  if (existsSync(jsOut) && existsSync(wasmOut) && !process.argv.includes("--force")) {
    console.log(`[emu] ${c.core}: in place`);
    continue;
  }
  const buf = await fetchPinned(c);
  let parts;
  if (c.from === "zip") parts = unzip(buf);
  else if (c.from === "npm") parts = un7z(untgz(buf, c.entry));
  else throw new Error(`${c.core}: unknown source ${c.from}`);
  const js = parts[`${c.core}_libretro.js`];
  const wasm = parts[`${c.core}_libretro.wasm`];
  if (!js || !wasm) throw new Error(`${c.core}: js/wasm not found in ${Object.keys(parts).join(", ")}`);
  writeFileSync(jsOut, c.from === "npm" ? asNostalgistCore(js, c.core) : js);
  writeFileSync(wasmOut, wasm);
  console.log(`[emu] ${c.core}: ${(wasm.length / 1e6).toFixed(1)} MB wasm`);
}

// The built-in cartridges: a ROM, or the ROM inside the author's zip.
for (const g of games) {
  const dst = join(gamesOut, g.file);
  if (existsSync(dst) && !process.argv.includes("--force")) continue;
  const buf = await fetchPinned(g);
  const rom = g.entry ? unzip(buf)[g.entry] : buf;
  if (!rom) throw new Error(`${g.file}: ${g.entry} not in the zip`);
  writeFileSync(dst, rom);
  console.log(`[emu] ${g.file}: ${(rom.length / 1024).toFixed(0)} KB`);
}

// What's served and where its source is (GPL: the source is offered with it).
const lines = [
  "# Emulator cores served by Yutopia",
  "",
  "| Core | Systems | Licence | Source |",
  "|---|---|---|---|",
  ...cores.map((c) => `| ${c.core} | ${c.systems.join(", ")} | ${c.license} | ${c.source} |`),
  "",
  `Frontend: ${frontend.name} — ${frontend.license} — ${frontend.source} (builds: ${frontend.build})`,
  "",
];
writeFileSync(join(out, "SOURCES.md"), lines.join("\n"));

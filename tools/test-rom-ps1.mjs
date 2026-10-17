// A tiny disc-console program of our own for tests (and the dev page): colour
// bars; red while player 1 holds ✕, green while player 2 does; a square that
// follows each pad's left stick while it's in analog mode (white: player 1, cyan:
// player 2).
// Hand-assembled MIPS (R3000), a PS-X EXE loaded at 0x80010000 — the core boots
// an .exe straight, no disc needed. Pads through the BIOS (InitPad / StartPad).
// Written to apps/client/public/emu/test/colors.exe, and colors-stress.exe (the
// same plus a thousand shaded triangles a frame, for measuring what a 3D game
// costs the host). And the same program on a disc, as discs are dumped (an
// ISO 9660 filesystem in raw 2352-byte Mode 2 sectors, a .cue naming the .bin):
// colors.cue + colors.bin — a disc in two files, like the ones members bring.
//   node tools/test-rom-ps1.mjs
//   node tools/test-rom-ps1.mjs --pad 640 --out <dir>   only the disc, with 640 MB
//                                                       of filler (size / memory tests)
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";

const ORG = 0x80010000;
const R = {
  zero: 0,
  at: 1,
  v0: 2,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  t0: 8,
  t1: 9,
  t2: 10,
  s0: 16,
  s1: 17,
  s2: 18,
  s3: 19,
  ra: 31,
};

// A two-pass assembler for the few instructions we need: each line is a
// function of the label table (pass 1 sees zeros) returning words.
let lines = [];
let labels = {};
const at = (name) => lines.push({ label: name });
const op = (f) => lines.push({ f });
const rtype = (rs, rt, rd, sa, fn) => ((rs << 21) | (rt << 16) | (rd << 11) | (sa << 6) | fn) >>> 0;
const itype = (o, rs, rt, imm) => ((o << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const I = {
  nop: () => op(() => [0]),
  sll: (rd, rt, sa) => op(() => [rtype(0, R[rt], R[rd], sa, 0)]),
  srl: (rd, rt, sa) => op(() => [rtype(0, R[rt], R[rd], sa, 2)]),
  jr: (rs) => op(() => [rtype(R[rs], 0, 0, 0, 8)]),
  jalr: (rs) => op(() => [rtype(R[rs], 0, 31, 0, 9)]),
  syscall: () => op(() => [0x0c]),
  addu: (rd, rs, rt) => op(() => [rtype(R[rs], R[rt], R[rd], 0, 0x21)]),
  and: (rd, rs, rt) => op(() => [rtype(R[rs], R[rt], R[rd], 0, 0x24)]),
  or: (rd, rs, rt) => op(() => [rtype(R[rs], R[rt], R[rd], 0, 0x25)]),
  addiu: (rt, rs, imm) => op(() => [itype(9, R[rs], R[rt], imm)]),
  slti: (rt, rs, imm) => op(() => [itype(10, R[rs], R[rt], imm)]),
  andi: (rt, rs, imm) => op(() => [itype(12, R[rs], R[rt], imm)]),
  ori: (rt, rs, imm) => op(() => [itype(13, R[rs], R[rt], imm)]),
  lui: (rt, imm) => op(() => [itype(15, 0, R[rt], imm)]),
  // loads: the R3000's next instruction still sees the old value (a load delay
  // slot, which the core emulates), so each one comes with a nop
  lw: (rt, off, rs) => op(() => [itype(0x23, R[rs], R[rt], off), 0]),
  lbu: (rt, off, rs) => op(() => [itype(0x24, R[rs], R[rt], off), 0]),
  sw: (rt, off, rs) => op(() => [itype(0x2b, R[rs], R[rt], off)]),
  // branches and jumps by label (the delay slot is the next line)
  beq: (rs, rt, l) => op((pc) => [itype(4, R[rs], R[rt], ((labels[l] ?? pc + 4) - (pc + 4)) >> 2)]),
  bne: (rs, rt, l) => op((pc) => [itype(5, R[rs], R[rt], ((labels[l] ?? pc + 4) - (pc + 4)) >> 2)]),
  j: (l) => op(() => [((2 << 26) | (((labels[l] ?? ORG) >>> 2) & 0x3ffffff)) >>> 0]),
  jal: (l) => op(() => [((3 << 26) | (((labels[l] ?? ORG) >>> 2) & 0x3ffffff)) >>> 0]),
  // li: always two words (lui + ori), so pass 1 and 2 agree on sizes
  li: (rt, v) => op(() => [itype(15, 0, R[rt], (v >>> 16) & 0xffff), itype(13, R[rt], R[rt], v & 0xffff)]),
  la: (rt, l) =>
    op(() => [
      itype(15, 0, R[rt], ((labels[l] ?? 0) >>> 16) & 0xffff),
      itype(13, R[rt], R[rt], (labels[l] ?? 0) & 0xffff),
    ]),
  word: (v) => op(() => [v >>> 0]),
};

const GP0 = 0x1810; // off s0 = 0x1F800000
const GP1 = 0x1814;
const BUF = 0x80100000; // pad buffers: player 1 here, player 2 at +0x40

// wait until the GPU takes a command (GPUSTAT bit 26)
let waits = 0;
const ready = () => {
  const l = `ready${waits++}`;
  at(l);
  I.lw("t0", GP1, "s0");
  I.lui("t1", 0x0400);
  I.and("t0", "t0", "t1");
  I.beq("t0", "zero", l);
  I.nop();
};
const gp = (port, v) => {
  I.li("t2", v);
  I.sw("t2", port, "s0");
};
const bios = (table, fn) => {
  I.li("t2", table);
  I.jalr("t2");
  I.addiu("t1", "zero", fn); // (delay slot: the function number)
  I.nop();
};

function program(stress) {
  at("start");
  I.lui("s0", 0x1f80);
  // the display: 320 × 240, 15-bit, NTSC ranges, on
  for (const v of [0x00000000, 0x08000001, 0x06c60260, 0x07040010, 0x05000000, 0x03000000]) gp(GP1, v);
  // drawing: to the displayed area, clip 0,0–319,239, no offset
  for (const v of [0xe1000400, 0xe3000000, 0xe403bd3f, 0xe5000000]) {
    ready();
    gp(GP0, v);
  }
  // pads: buffers marked "nothing", then the BIOS fills them every frame
  I.li("s1", BUF);
  I.addiu("t0", "zero", -1);
  for (const off of [0, 4, 0x40, 0x44]) I.sw("t0", off, "s1");
  I.addiu("a0", "s1", 0);
  I.addiu("a1", "zero", 34);
  I.addiu("a2", "s1", 0x40);
  I.addiu("a3", "zero", 34);
  bios(0xb0, 0x12); // InitPad
  bios(0xb0, 0x13); // StartPad
  // (no ChangeClearPad(0): that leaves acknowledging vblank to a handler of our
  // own, and without one the interrupt never stops)
  I.addiu("a0", "zero", 2);
  I.syscall(); // ExitCriticalSection (interrupts on)

  at("loop");
  // a loop counter at BUF + 0x80 (tests read it to see the program run)
  I.lw("t0", 0x80, "s1");
  I.addiu("t0", "t0", 1);
  I.sw("t0", 0x80, "s1");
  I.addiu("s4", "t0", 0);
  // player 1 holds ✕ (byte 3, bit 6, low = pressed) → red
  I.lbu("t0", 0, "s1");
  I.bne("t0", "zero", "p2");
  I.nop();
  I.lbu("t0", 3, "s1");
  I.andi("t0", "t0", 0x40);
  I.bne("t0", "zero", "p2");
  I.nop();
  I.li("a0", 0x020000ff);
  I.jal("fill");
  I.nop();
  I.j("square");
  I.nop();
  at("p2");
  I.lbu("t0", 0x40, "s1");
  I.bne("t0", "zero", "bars");
  I.nop();
  I.lbu("t0", 0x43, "s1");
  I.andi("t0", "t0", 0x40);
  I.bne("t0", "zero", "bars");
  I.nop();
  I.li("a0", 0x0200ff00);
  I.jal("fill");
  I.nop();
  I.j("square");
  I.nop();
  // ten bars, 32 px each (fills go in steps of 16 px)
  at("bars");
  I.addiu("s2", "zero", 0);
  I.la("s3", "table");
  at("barloop");
  ready();
  I.lw("t0", 0, "s3");
  I.sw("t0", GP0, "s0");
  I.sll("t1", "s2", 5);
  I.sw("t1", GP0, "s0");
  I.li("t2", (240 << 16) | 32);
  I.sw("t2", GP0, "s0");
  I.addiu("s2", "s2", 1);
  I.addiu("s3", "s3", 4);
  I.slti("t0", "s2", 10);
  I.bne("t0", "zero", "barloop");
  I.nop();
  // the stress card: a thousand shaded triangles a frame (a 3D game's GPU load),
  // drifting with the loop counter
  if (stress) {
    I.addiu("s2", "zero", 0);
    at("tri");
    I.sll("a2", "s2", 3);
    I.addu("a2", "a2", "s4");
    I.andi("a2", "a2", 0xff); // x 0..255
    I.sll("a3", "s2", 2);
    I.andi("a3", "a3", 0x7f);
    I.addiu("a3", "a3", 40); // y 40..167
    I.sll("a3", "a3", 16);
    I.or("v0", "a3", "a2"); // first corner
    ready();
    gp(GP0, 0x300000ff); // gouraud triangle: red…
    I.sw("v0", GP0, "s0");
    gp(GP0, 0x0000ff00); // …green…
    I.addiu("v1", "v0", 48);
    I.sw("v1", GP0, "s0");
    gp(GP0, 0x00ff0000); // …blue
    I.lui("v1", 40);
    I.addu("v1", "v1", "v0");
    I.addiu("v1", "v1", 24);
    I.sw("v1", GP0, "s0");
    I.addiu("s2", "s2", 1);
    I.slti("t0", "s2", 1000);
    I.bne("t0", "zero", "tri");
    I.nop();
  }
  // the squares: each pad's left stick, while the pad answers in analog (id
  // 0x?3) — white for player 1, cyan for player 2
  at("square");
  for (const [pad, color] of [
    [0, 0x02ffffff],
    [0x40, 0x02ffff00],
  ]) {
    const skip = `nosquare${pad}`;
    I.lbu("t0", pad + 1, "s1");
    I.andi("t0", "t0", 0x0f);
    I.addiu("t1", "zero", 3);
    I.bne("t0", "t1", skip);
    I.nop();
    I.lbu("t0", pad + 6, "s1"); // left x 0..255
    I.andi("t0", "t0", 0xf0);
    I.addiu("t0", "t0", 32);
    I.lbu("a1", pad + 7, "s1"); // left y 0..255
    I.srl("a1", "a1", 1);
    I.addiu("a1", "a1", 56);
    I.sll("a1", "a1", 16);
    I.or("a1", "a1", "t0"); // (a1: ready() uses t0 / t1)
    ready();
    gp(GP0, color);
    I.sw("a1", GP0, "s0");
    gp(GP0, (32 << 16) | 32);
    at(skip);
  }
  // about a frame's worth of spinning, then again
  at("delay");
  I.li("t0", 150000);
  at("spin");
  I.addiu("t0", "t0", -1);
  I.bne("t0", "zero", "spin");
  I.nop();
  I.j("loop");
  I.nop();

  // fill(a0 = 0x02BBGGRR): the whole screen
  at("fill");
  ready();
  I.sw("a0", GP0, "s0");
  I.sw("zero", GP0, "s0");
  I.li("t2", (240 << 16) | 320);
  I.sw("t2", GP0, "s0");
  I.jr("ra");
  I.nop();

  // the bars' colours (fill commands, 0x02BBGGRR)
  at("table");
  for (const c of [0xc0c0c0, 0x00c0c0, 0xc0c000, 0x00c000, 0xc000c0, 0x0000c0, 0xc00000, 0x101010, 0xffffff, 0x804020])
    I.word((0x02 << 24) | c);
}

function assemble() {
  const out = [];
  let pc = ORG;
  for (const l of lines) {
    if (l.label) labels[l.label] = pc;
    else {
      const w = l.f(pc);
      out.push(...w);
      pc += 4 * w.length;
    }
  }
  return out;
}
function build(stress) {
  lines = [];
  labels = {};
  program(stress);
  assemble(); // pass 1: labels
  const words = assemble();
  const size = Math.ceil((words.length * 4) / 2048) * 2048;
  const exe = Buffer.alloc(2048 + size);
  exe.write("PS-X EXE", 0, "latin1");
  exe.writeUInt32LE(ORG, 0x10); // pc
  exe.writeUInt32LE(ORG, 0x18); // where it loads
  exe.writeUInt32LE(size, 0x1c);
  exe.writeUInt32LE(0x801ffff0, 0x30); // stack
  exe.write("Sony Computer Entertainment Inc. for North America area", 0x4c, "latin1");
  for (const [i, w] of words.entries()) exe.writeUInt32LE(w, 2048 + i * 4);
  return { exe, count: words.length };
}

// A disc: SYSTEM.CNF (BOOT = cdrom:\PSX.EXE;1), PSX.EXE and PAD.BIN (filler).
// Sector 4 holds the licence text's region, 16 the volume descriptor, 18 the
// root directory; files from 22. Written straight to `<base>.bin` / `.cue`.
function disc(base, exe, padBytes) {
  const cnf = Buffer.from("BOOT = cdrom:\\PSX.EXE;1\r\nTCB = 4\r\nEVENT = 16\r\nSTACK = 801FFFF0\r\n", "latin1");
  const files = [
    { name: "PAD.BIN;1", size: padBytes },
    { name: "PSX.EXE;1", data: exe },
    { name: "SYSTEM.CNF;1", data: cnf },
  ];
  let lba = 22;
  for (const f of files) {
    f.size ??= f.data.length;
    f.lba = lba;
    lba += Math.max(1, Math.ceil(f.size / 2048));
  }
  const total = lba;
  const both32 = (b, at, v) => {
    b.writeUInt32LE(v, at);
    b.writeUInt32BE(v, at + 4);
  };
  const both16 = (b, at, v) => {
    b.writeUInt16LE(v, at);
    b.writeUInt16BE(v, at + 2);
  };
  const record = (name, at, size, dir) => {
    const id = typeof name === "string" ? Buffer.from(name, "latin1") : name;
    const len = 33 + id.length + ((33 + id.length) % 2);
    const r = Buffer.alloc(len);
    r[0] = len;
    both32(r, 2, at);
    both32(r, 10, size);
    r.set([126, 1, 1, 0, 0, 0, 0], 18); // 2026-01-01
    r[25] = dir ? 2 : 0;
    both16(r, 28, 1);
    r[32] = id.length;
    id.copy(r, 33);
    return r;
  };
  const sectors = new Map(); // lba → 2048 bytes of data
  const lic = Buffer.alloc(2048);
  lic.write("          Licensed  by          Sony Computer Entertainment Amer  ica ", 0, "latin1");
  sectors.set(4, lic);
  const root = Buffer.concat([
    record(Buffer.from([0]), 18, 2048, true),
    record(Buffer.from([1]), 18, 2048, true),
    ...files.map((f) => record(f.name, f.lba, f.size, false)),
  ]);
  const pvd = Buffer.alloc(2048, 0x20);
  pvd.fill(0, 0, 8);
  pvd[0] = 1;
  pvd.write("CD001", 1, "latin1");
  pvd[6] = 1;
  pvd.write("PLAYSTATION", 8, "latin1");
  pvd.write("YUTOPIA_TEST_CARD", 40, "latin1");
  pvd.fill(0, 72, 156);
  both32(pvd, 80, total);
  both16(pvd, 120, 1);
  both16(pvd, 124, 1);
  both16(pvd, 128, 2048);
  both32(pvd, 132, 10);
  pvd.writeUInt32LE(19, 140);
  pvd.writeUInt32BE(20, 148);
  record(Buffer.from([0]), 18, 2048, true).copy(pvd, 156);
  pvd.fill(0x30, 813, 880);
  pvd[881] = 1;
  pvd.fill(0, 882);
  sectors.set(16, pvd);
  const term = Buffer.alloc(2048);
  term[0] = 255;
  term.write("CD001", 1, "latin1");
  term[6] = 1;
  sectors.set(17, term);
  const dir = Buffer.alloc(2048);
  root.copy(dir);
  sectors.set(18, dir);
  const pt = (be) => {
    const b = Buffer.alloc(2048);
    b[0] = 1;
    if (be) b.writeUInt32BE(18, 2);
    else b.writeUInt32LE(18, 2);
    if (be) b.writeUInt16BE(1, 6);
    else b.writeUInt16LE(1, 6);
    return b;
  };
  sectors.set(19, pt(false));
  sectors.set(20, pt(true));
  for (const f of files.filter((x) => x.data))
    for (let i = 0; i * 2048 < f.data.length; i++) {
      const b = Buffer.alloc(2048);
      f.data.copy(b, 0, i * 2048, (i + 1) * 2048);
      sectors.set(f.lba + i, b);
    }

  const bcd = (v) => ((v / 10) << 4) | (v % 10);
  let seed = 0x9e3779b9;
  const noise = (b) => {
    for (let j = 0; j < b.length; j += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      b.writeInt32LE(seed | 0, j);
    }
  };
  const fd = openSync(`${base}.bin`, "w");
  const BATCH = 512;
  const raw = Buffer.alloc(2352 * BATCH);
  let k = 0;
  for (let i = 0; i < total; i++) {
    const s = raw.subarray(k * 2352, (k + 1) * 2352);
    s.fill(0);
    s.fill(0xff, 1, 11); // sync
    const at = i + 150;
    s[12] = bcd(Math.floor(at / 4500));
    s[13] = bcd(Math.floor(at / 75) % 60);
    s[14] = bcd(at % 75);
    s[15] = 2; // mode 2, form 1
    s[18] = s[22] = 0x08; // subheader: data
    const data = sectors.get(i);
    if (data) data.copy(s, 24);
    else if (i >= files[0].lba && i < files[1].lba) noise(s.subarray(24, 24 + 2048)); // the filler: incompressible, like real data
    if (++k === BATCH || i === total - 1) {
      writeSync(fd, raw, 0, k * 2352);
      k = 0;
    }
  }
  closeSync(fd);
  const name = base.split("/").pop();
  writeFileSync(`${base}.cue`, `FILE "${name}.bin" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n`);
  console.log(`[test-rom] ${base}.cue + .bin (${total} sectors, ${((total * 2352) / 1e6).toFixed(1)} MB)`);
}

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const pad = Number(arg("--pad") ?? 0) * 1024 * 1024;
const card = build(false);
if (arg("--out")) {
  mkdirSync(arg("--out"), { recursive: true });
  disc(`${arg("--out")}/testcard`, card.exe, pad);
} else {
  const out = new URL("../apps/client/public/emu/test/", import.meta.url);
  mkdirSync(out, { recursive: true });
  for (const [name, b] of [
    ["colors.exe", card],
    ["colors-stress.exe", build(true)],
  ]) {
    writeFileSync(new URL(name, out), b.exe);
    console.log(`[test-rom] apps/client/public/emu/test/${name} (${b.count} instructions, ${b.exe.length} bytes)`);
  }
  disc(new URL("colors", out).pathname, card.exe, pad);
}

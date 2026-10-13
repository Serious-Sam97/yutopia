// A tiny NES cartridge of our own for tests (and the dev page): a light blue
// screen and a test tone; red while player 1 holds A, green while player 2 does.
// Hand-assembled 6502 (NROM, 16 KB PRG + 8 KB empty CHR), written to
// apps/client/public/emu/test/colors.nes.   node tools/test-rom-nes.mjs
import { mkdirSync, writeFileSync } from "node:fs";

// biome-ignore format: hand-assembled, one instruction a line
const code = [
  0x78,                   // C000 sei
  0xd8,                   // C001 cld
  0xa2, 0x40,             // C002 ldx #$40
  0x8e, 0x17, 0x40,       // C004 stx $4017   (no APU frame IRQ)
  0xa2, 0xff,             // C007 ldx #$ff
  0x9a,                   // C009 txs
  0xe8,                   // C00A inx         (x = 0)
  0x8e, 0x00, 0x20,       // C00B stx $2000   (no NMI)
  0x8e, 0x01, 0x20,       // C00E stx $2001   (rendering off: the backdrop shows)
  0x8e, 0x10, 0x40,       // C011 stx $4010
  0x2c, 0x02, 0x20,       // C014 vw1: bit $2002
  0x10, 0xfb,             // C017 bpl vw1
  0x2c, 0x02, 0x20,       // C019 vw2: bit $2002
  0x10, 0xfb,             // C01C bpl vw2
  0xa9, 0x01,             // C01E lda #1      (a test tone: pulse 1 on…)
  0x8d, 0x15, 0x40,       // C020 sta $4015
  0xa9, 0xbf,             // C023 lda #$bf    (…half duty, held, full volume…)
  0x8d, 0x00, 0x40,       // C025 sta $4000
  0xa9, 0xfd,             // C028 lda #$fd    (…about 440 Hz)
  0x8d, 0x02, 0x40,       // C02A sta $4002
  0xa9, 0x00,             // C02D lda #0
  0x8d, 0x03, 0x40,       // C02F sta $4003
  0xa9, 0x01,             // C032 loop: lda #1
  0x8d, 0x16, 0x40,       // C034 sta $4016   (strobe the pads)
  0xa9, 0x00,             // C037 lda #0
  0x8d, 0x16, 0x40,       // C039 sta $4016
  0xad, 0x16, 0x40,       // C03C lda $4016   (player 1: A first)
  0x29, 0x01,             // C03F and #1
  0xf0, 0x05,             // C041 beq p2
  0xa2, 0x16,             // C043 ldx #$16    (red)
  0x4c, 0x56, 0xc0,       // C045 jmp set
  0xad, 0x17, 0x40,       // C048 p2: lda $4017
  0x29, 0x01,             // C04B and #1
  0xf0, 0x05,             // C04D beq none
  0xa2, 0x1a,             // C04F ldx #$1a    (green)
  0x4c, 0x56, 0xc0,       // C051 jmp set
  0xa2, 0x21,             // C054 none: ldx #$21 (light blue)
  0xad, 0x02, 0x20,       // C056 set: lda $2002
  0xa9, 0x3f,             // C059 lda #$3f
  0x8d, 0x06, 0x20,       // C05B sta $2006
  0xa9, 0x00,             // C05E lda #0
  0x8d, 0x06, 0x20,       // C060 sta $2006
  0x8e, 0x07, 0x20,       // C063 stx $2007   (the backdrop colour)
  0xa9, 0x00,             // C066 lda #0
  0x8d, 0x06, 0x20,       // C068 sta $2006   (point away from the palette)
  0x8d, 0x06, 0x20,       // C06B sta $2006
  0x4c, 0x32, 0xc0,       // C06E jmp loop
  0x40,                   // C071 irq: rti
];

const header = [0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const prg = new Uint8Array(16384).fill(0xea);
prg.set(code, 0);
prg.set([0x71, 0xc0, 0x00, 0xc0, 0x71, 0xc0], 0x3ffa); // NMI, RESET, IRQ
const rom = new Uint8Array(16 + 16384 + 8192);
rom.set(header, 0);
rom.set(prg, 16);
const out = new URL("../apps/client/public/emu/test/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("colors.nes", out), rom);
console.log("[test-rom] apps/client/public/emu/test/colors.nes (24 KB)");

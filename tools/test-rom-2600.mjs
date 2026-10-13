// A tiny Atari 2600 cartridge of our own for tests (and the dev page): rainbow
// bands that scroll every frame; while player 1 holds fire the screen goes red,
// player 2's fire turns it green.
// Hand-assembled 6502, 4 KB, written to apps/client/public/emu/test/colors.a26.
//   node tools/test-rom-2600.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const VSYNC = 0x00;
const VBLANK = 0x01;
const WSYNC = 0x02;
const COLUBK = 0x09;
const INPT4 = 0x0c; // player 1 fire: bit 7 clear while pressed
const INPT5 = 0x0d; // player 2 fire
const FRAME = 0x80; // RAM: frame counter

// biome-ignore format: hand-assembled, one instruction a line
const code = [
  0x78,                   // F000 sei
  0xd8,                   // F001 cld
  0xa2, 0x00,             // F002 ldx #0
  0x8a,                   // F004 txa
  0x95, 0x00,             // F005 clear: sta $00,x
  0xca,                   // F007 dex
  0xd0, 0xfb,             // F008 bne clear
  0xa2, 0xff,             // F00A ldx #$ff
  0x9a,                   // F00C txs
  0xa9, 0x02,             // F00D frame: lda #2
  0x85, VBLANK,           // F00F sta VBLANK
  0x85, VSYNC,            // F011 sta VSYNC
  0x85, WSYNC,            // F013 sta WSYNC ×3
  0x85, WSYNC,
  0x85, WSYNC,
  0xa9, 0x00,             // F019 lda #0
  0x85, VSYNC,            // F01B sta VSYNC
  0xa2, 37,               // F01D ldx #37
  0x85, WSYNC,            // F01F vb: sta WSYNC
  0xca,                   // F021 dex
  0xd0, 0xfb,             // F022 bne vb
  0xa9, 0x00,             // F024 lda #0
  0x85, VBLANK,           // F026 sta VBLANK
  0xe6, FRAME,            // F028 inc FRAME
  0xa2, 192,              // F02A ldx #192
  0x8a,                   // F02C lines: txa
  0x18,                   // F02D clc
  0x65, FRAME,            // F02E adc FRAME
  0x24, INPT4,            // F030 bit INPT4
  0x30, 0x02,             // F032 bmi +2 (not pressed)
  0xa9, 0x42,             // F034 lda #$42 (red)
  0x24, INPT5,            // F036 bit INPT5
  0x30, 0x02,             // F038 bmi +2 (not pressed)
  0xa9, 0xc4,             // F03A lda #$c4 (green)
  0x85, COLUBK,           // F03C sta COLUBK
  0x85, WSYNC,            // F03E sta WSYNC
  0xca,                   // F040 dex
  0xd0, 0xe9,             // F041 bne lines
  0xa9, 0x02,             // F043 lda #2
  0x85, VBLANK,           // F045 sta VBLANK
  0xa2, 30,               // F047 ldx #30
  0x85, WSYNC,            // F049 os: sta WSYNC
  0xca,                   // F04B dex
  0xd0, 0xfb,             // F04C bne os
  0x4c, 0x0d, 0xf0,       // F04E jmp frame
];

const rom = new Uint8Array(4096).fill(0xea); // nop
rom.set(code, 0);
rom.set([0x00, 0xf0, 0x00, 0xf0], 0xffc); // reset + irq vectors → F000
const out = new URL("../apps/client/public/emu/test/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("colors.a26", out), rom);
console.log("[test-rom] apps/client/public/emu/test/colors.a26 (4 KB)");

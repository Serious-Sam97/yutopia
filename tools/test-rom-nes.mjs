// A tiny NES cartridge of our own for tests (and the dev page): a light blue
// screen that turns red while player 1 holds A and green while player 2 does.
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
  0xa9, 0x01,             // C01E loop: lda #1
  0x8d, 0x16, 0x40,       // C020 sta $4016   (strobe the pads)
  0xa9, 0x00,             // C023 lda #0
  0x8d, 0x16, 0x40,       // C025 sta $4016
  0xad, 0x16, 0x40,       // C028 lda $4016   (player 1: A first)
  0x29, 0x01,             // C02B and #1
  0xf0, 0x05,             // C02D beq p2
  0xa2, 0x16,             // C02F ldx #$16    (red)
  0x4c, 0x42, 0xc0,       // C031 jmp set
  0xad, 0x17, 0x40,       // C034 p2: lda $4017
  0x29, 0x01,             // C037 and #1
  0xf0, 0x05,             // C039 beq none
  0xa2, 0x1a,             // C03B ldx #$1a    (green)
  0x4c, 0x42, 0xc0,       // C03D jmp set
  0xa2, 0x21,             // C040 none: ldx #$21 (light blue)
  0xad, 0x02, 0x20,       // C042 set: lda $2002
  0xa9, 0x3f,             // C045 lda #$3f
  0x8d, 0x06, 0x20,       // C047 sta $2006
  0xa9, 0x00,             // C04A lda #0
  0x8d, 0x06, 0x20,       // C04C sta $2006
  0x8e, 0x07, 0x20,       // C04F stx $2007   (the backdrop colour)
  0xa9, 0x00,             // C052 lda #0
  0x8d, 0x06, 0x20,       // C054 sta $2006   (point away from the palette)
  0x8d, 0x06, 0x20,       // C057 sta $2006
  0x4c, 0x1e, 0xc0,       // C05A jmp loop
  0x40,                   // C05D irq: rti
];

const header = [0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const prg = new Uint8Array(16384).fill(0xea);
prg.set(code, 0);
prg.set([0x5d, 0xc0, 0x00, 0xc0, 0x5d, 0xc0], 0x3ffa); // NMI, RESET, IRQ
const rom = new Uint8Array(16 + 16384 + 8192);
rom.set(header, 0);
rom.set(prg, 16);
const out = new URL("../apps/client/public/emu/test/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("colors.nes", out), rom);
console.log("[test-rom] apps/client/public/emu/test/colors.nes (24 KB)");

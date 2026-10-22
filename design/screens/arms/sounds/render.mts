// The guns' sounds as WAVs to listen to (docs/plan/32-the-arms.md): rendered from the game's own
// synth (apps/client/src/world/dark/synth.ts) — one source, nothing to keep in step.
//   node --experimental-strip-types design/screens/arms/sounds/render.mts [name …]
import { writeFileSync } from "node:fs";
import { SOUNDS, SR } from "../../../../apps/client/src/world/dark/synth.ts";

const GUNS = [
  "revolver-shot",
  "revolver-shot-in",
  "revolver-shot-far",
  "revolver-cock",
  "revolver-gate",
  "revolver-load",
  "revolver-dry",
  "shotgun-shot",
  "shotgun-shot-in",
  "shotgun-shot-far",
  "shotgun-dry",
  "shotgun-break",
  "shotgun-eject",
  "shotgun-shell",
  "shotgun-shut",
  "gun-draw",
  "gun-holster",
  "brass",
  "shell-drop",
  "hit-tick",
  "hit-head",
  "hit-kill",
];
const dir = new URL(".", import.meta.url).pathname;
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : GUNS) {
  const s = SOUNDS[name]();
  const ch = Array.isArray(s) ? s : [s];
  const n = ch[0].length;
  const out = Buffer.alloc(44 + n * ch.length * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * ch.length * 2, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(ch.length, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * ch.length * 2, 28);
  out.writeUInt16LE(ch.length * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * ch.length * 2, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch.length; c++)
      out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i])) * 32767), 44 + (i * ch.length + c) * 2);
  writeFileSync(`${dir}${name}.wav`, out);
  let pk = 0;
  for (const v of ch[0]) pk = Math.max(pk, Math.abs(v));
  console.log(`${name}: ${(n / SR).toFixed(2)} s, peak ${pk.toFixed(2)}`);
}

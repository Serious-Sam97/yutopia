import { BufferGeometry, Color, Float32BufferAttribute, Shape } from "three";
import type { Kit } from "../kit";
import { band, oval } from "../shapes";
import { lerp, smooth } from "./body";

// Facial hair, in the hair's colour (AvatarLayers.beard): a shadow of stubble
// over the jaw, a moustache, a goatee, a full beard. Flat pieces are bent onto
// the face like the brows (outlined, but for the stubble's shadow); the full
// beard is a shell on the head's own surface, chin to cheeks, its edge tucked
// back in so no gap shows.

const mix = (a: string, b: string, t: number) => `#${new Color(a).lerp(new Color(b), t).getHexString()}`;

export function buildBeard(k: Kit, kind: string, color: string, skin: string) {
  if (!kind || kind === "none") return;
  const hs = k.head;
  const hh = k.hh;
  const f = k.p.face;
  const my = f.mouthY * hh;
  const mw = f.mouthW * hh;
  const ny = (f.eyeY + f.mouthY) * 0.5 * hh; // the nose
  const thin = hh * 0.0035;
  const strokes = Math.max(6, k.seg.curve * 2);
  // a decal with an outline (the ink hull draws round it)
  const outlined = (shape: Shape | Shape[], depth: number, lift: number) => {
    k.decal(shape, depth, depth * 0.4, lift, color);
    k.parts[k.parts.length - 1].ink = 1;
  };
  const moustache = (full: boolean) =>
    outlined(
      band(
        [
          [-mw * (full ? 0.78 : 0.66), my + 0.012 * hh],
          [-mw * 0.32, lerp(my, ny, 0.42)],
          [0, lerp(my, ny, 0.36)],
          [mw * 0.32, lerp(my, ny, 0.42)],
          [mw * (full ? 0.78 : 0.66), my + 0.012 * hh],
        ],
        (u) => 0.05 * hh * (0.45 + 0.55 * Math.sin(Math.PI * u)),
        strokes,
      ),
      thin * 2.2,
      thin * 0.4,
    );

  switch (kind) {
    case "stubble": {
      // a shadow: jaw, chin and upper lip, a tone between skin and hair, no line
      const R = (y: number) => hs.R(y) * k.p.head.width * 0.9;
      const s = new Shape();
      const side = [0.3, 0.22, 0.14, 0.07, 0.025].map((t) => t * hh);
      s.moveTo(-R(side[0]), side[0]);
      for (const y of side.slice(1)) s.lineTo(-R(y) * (y < 0.06 * hh ? 0.7 : 1), y);
      s.lineTo(0, 0.004 * hh);
      for (const y of [...side.slice(1)].reverse()) s.lineTo(R(y) * (y < 0.06 * hh ? 0.7 : 1), y);
      s.lineTo(R(side[0]), side[0]);
      // over the upper lip, under the nose
      s.lineTo(mw * 0.9, lerp(my, ny, 0.3));
      s.quadraticCurveTo(0, lerp(my, ny, 0.62), -mw * 0.9, lerp(my, ny, 0.3));
      s.closePath();
      // (well off the skin, or the two flicker; under the mouth's line)
      k.decal(s, thin * 0.15, thin * 0.05, thin * 0.6, mix(skin, color, 0.42));
      return;
    }
    case "mustache":
      moustache(false);
      return;
    case "goatee":
      moustache(false);
      // the chin: a rounded patch under the lip, down to the point of the chin
      outlined(oval(0, my * 0.5, mw * 0.34, my * 0.27), thin * 2.2, thin * 0.4);
      return;
    default: {
      // full: a shell over the jaw and chin, up the cheeks to sideburns at the ears
      const rows = k.seg.capRows;
      const cols = k.seg.radial + 8;
      const span = 1.72; // round from the front, each way (rad)
      const th = 0.05 * hh;
      const pos: number[] = [];
      const idx: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const u = r / rows; // 0 its upper edge … 1 the chin's underside
        for (let c = 0; c <= cols; c++) {
          const phi = lerp(-span, span, c / cols);
          const a = Math.abs(phi) / span; // 0 the front … 1 the ears
          // the upper edge: just under the lip in front, up the cheek to the ear
          const edge = lerp(0.16, 0.5, smooth(0.15, 0.85, a));
          const t = edge * (1 - u);
          // thick on the chin, thinning up the cheeks; tucked in at its edges
          const out = th * lerp(1.3, 0.55, a) * smooth(0, 0.22, u) * (1 - smooth(0.88, 1, a));
          const q = hs.at(t, phi, out);
          // a little length below the chin, in front
          q.y -= 0.05 * hh * Math.max(0, 1 - a * 1.6) * smooth(0.5, 1, u);
          pos.push(q.x, q.y, q.z);
        }
      }
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const a = r * (cols + 1) + c;
          const b = a + cols + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      k.add("head", geo, color);
      moustache(true);
    }
  }
}

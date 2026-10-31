import { BufferGeometry, Color, Float32BufferAttribute, type Shape } from "three";
import type { Kit } from "../kit";
import { band, oval } from "../shapes";
import { lerp, smooth } from "./body";

// Facial hair, in the hair's colour (AvatarLayers.beard): a shadow of stubble
// over the jaw, a moustache, a goatee, a full beard, a chinstrap, mutton chops, a boxed beard. Flat pieces are bent onto
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

  // a shell on the head's own surface from the chin round to the ears: its upper edge `edgeF` up in
  // front … `edgeS` at the ears (× the head), `th` thick on the chin, thinning up the cheeks, its
  // edges tucked in; none in front of `bare` (0 … 1 round toward the ears)
  const shell = (edgeF: number, edgeS: number, th0: number, bare: number) => {
    const rows = k.seg.capRows;
    const cols = k.seg.radial + 8;
    const span = 1.72; // round from the front, each way (rad)
    const th = th0 * hh;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const u = r / rows; // 0 its upper edge … 1 the chin's underside
      for (let c = 0; c <= cols; c++) {
        const phi = lerp(-span, span, c / cols);
        const a = Math.abs(phi) / span; // 0 the front … 1 the ears
        const edge = lerp(edgeF, edgeS, smooth(0.15, 0.85, a));
        const t = edge * (1 - u);
        const out =
          th *
          lerp(1.3, 0.55, a) *
          smooth(0, 0.22, u) *
          (1 - smooth(0.88, 1, a)) *
          (bare ? smooth(bare - 0.12, bare, a) : 1);
        const q = hs.at(t, phi, out);
        // a little length below the chin, in front
        if (!bare) q.y -= th0 * hh * Math.max(0, 1 - a * 1.6) * smooth(0.5, 1, u);
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
  };

  switch (kind) {
    case "stubble": {
      // a shadow on the head's own surface, chin, jaw and upper lip: a thin shell a tone between skin
      // and hair, no line; its edges feathered back into the skin
      const rows = Math.max(4, k.seg.capRows / 2);
      const cols = k.seg.radial + 8;
      const span = 1.6;
      const pos: number[] = [];
      const idx: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const u = r / rows;
        for (let c = 0; c <= cols; c++) {
          const phi = lerp(-span, span, c / cols);
          const a = Math.abs(phi) / span;
          const edge = lerp(0.3, 0.42, smooth(0.25, 0.9, a));
          // (just off the skin, under the mouth's line: head.ts lifts that over stubble)
          const out = 0.0022 * hh * smooth(0, 0.15, u) * (1 - smooth(0.85, 1, a));
          const q = hs.at(edge * (1 - u), phi, out);
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
      k.add("head", geo, mix(skin, color, 0.32), { ink: 0 });
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
      // full: a shell over the jaw and chin, up the cheeks to sideburns at the ears; a chinstrap
      // only its edge along the jaw; mutton chops the cheeks and the moustache, the chin bare
      if (kind === "chinstrap") shell(0.07, 0.3, 0.02, 0);
      // boxed: short and full, kept, up the cheeks to the sideburns, the moustache into it
      else if (kind === "boxed") {
        shell(0.18, 0.52, 0.03, 0);
        moustache(true);
      } else if (kind === "muttonchops") {
        shell(0.16, 0.5, 0.045, 0.42);
        moustache(true);
      } else {
        shell(0.16, 0.5, 0.05, 0);
        moustache(true);
      }
    }
  }
}

import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import type { Kit } from "../kit";
import { arc, ellipsoid, lathe, sweepTube } from "../shapes";
import { lerp, smooth } from "./body";

// Hair: a cap (the head's own surface lifted, its edge rolled back in to the
// scalp) and locks — tubes swept along splines that lie on the head, flat
// across it, pointed at the tip. Every AvatarLayers hair style:
// short, buzz, bald, mohawk, bob, long, curly, afro, bun, ponytail, and the
// men's cuts — crew, slick (combed back), spiky.

interface Opts {
  backZ: number; // how far behind the head the shoulders' back is (long hair clears it)
  tieColor: string;
  hat: boolean; // a hat on: nothing sticks up through it (the quiff, a mohawk's crest)
  hatLine?: ((phi: number) => number) | null; // its rim: loose hair hangs from under it
}

/** How far the hair stands off the top of the head (a hat sits on that). */
export function hairCrown(k: Kit, kind: string): number {
  const th = k.p.hair.thick * k.hh;
  switch (kind) {
    case "bald":
      return 0;
    case "buzz":
    case "mohawk":
      return th * 0.4;
    case "crew":
      return th * 0.9;
    case "slick":
      return th * 1.6;
    case "curly":
      return th * 1.4 + 0.12 * k.hh;
    case "afro":
      return th + 0.34 * k.hh;
    default:
      return th * 1.3;
  }
}

/** How far the hair stands off the head at the ears (headphones sit on that). */
export function hairSide(k: Kit, kind: string): number {
  const th = k.p.hair.thick * k.hh;
  const lw = k.p.hair.lockW * k.hh;
  switch (kind) {
    case "bob":
    case "long":
      return th * 1.5 + lw * 0.55;
    case "curly":
      return th * 1.4 + 0.16 * k.hh;
    case "afro":
      // (the mass stands ~0.3 off at the ears, its bumps a little more)
      return th + 0.32 * k.hh;
    default:
      return hairCrown(k, kind);
  }
}

export function buildHair(k: Kit, kind: string, color: string, o: Opts) {
  if (kind === "bald") return;
  const p = k.p;
  const hs = k.head;
  const hh = k.hh;
  const th = p.hair.thick * hh;
  const lw = p.hair.lockW * hh;
  const centre = new Vector3(0, hh * 0.48, 0);
  const up = (q: Vector3) => q.clone().sub(centre).normalize();
  const tube = (ctrl: Vector3[], radius: (u: number) => [number, number], radial = k.seg.tubeRadial) =>
    sweepTube(ctrl, radius, { segs: k.seg.tube, radial, up });
  // a lock: round at the root (hidden in the cap), pointed at the tip (`tip` lower: blunter, cut)
  const lock = (ctrl: Vector3[], w: number, flat = 0.4, root = 0.08, tip = 0.85) =>
    k.add(
      "head",
      tube(ctrl, (u) => {
        const s = Math.sqrt(Math.min(1, u / root)) * (1 - u) ** tip;
        return [w * s, w * flat * p.hair.flat * s];
      }),
      color,
      { keepNormals: true },
    );
  // the cap between the crown and `edge(phi)` (0 chin … 1 crown), lifted by `out(u)` (0 crown … 1 edge)
  const cap = (edge: (phi: number) => number, out: (u: number, phi: number) => number) => {
    const rows = k.seg.capRows;
    const cols = k.seg.radial + 8;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const u = r / rows;
      for (let c = 0; c <= cols; c++) {
        const phi = (c / cols) * Math.PI * 2;
        const q = hs.at(1 - u * (1 - edge(phi)), phi, out(u, phi));
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
  // the usual cap: thick, swelling a little, its edge rolled back to the scalp
  const rolled = (t: number) => (u: number) =>
    t * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.4))) * (1 - 0.94 * smooth(0.8, 1, u));
  // a hairline: front, over the ears, nape — the parting a little to one side
  const part = 0.35;
  // the parts built since `from` hang on the hair's spring: none above `top`, all of it (× `most`)
  // by `full` (heights in the head's space)
  const hang = (from: number, top: number, full: number, most: number) => {
    for (const q of k.parts.slice(from)) q.skin = (_x, y) => ["hair", most * smooth(top, full, y)];
  };
  const line =
    (tf: number, ts: number, tb: number, parted = true) =>
    (phi: number) => {
      const c = Math.cos(phi - (parted ? part * 0.3 : 0));
      return c >= 0 ? lerp(ts, tf, c ** 1.3) : lerp(ts, tb, (-c) ** 1.1);
    };
  const bangs = (n: number, spread: number, tipT: number, sweep: number, shortCut: boolean) => {
    const count = Math.max(3, Math.round(n * p.hair.count));
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const phi = f * spread;
      const sw = sweep * (1 - Math.abs(f) * 0.5);
      const tip = tipT + (i % 2) * 0.035 + Math.abs(f) * (shortCut ? 0.02 : -0.08);
      const rim = o.hatLine?.(phi);
      lock(
        rim !== undefined && rim > tip
          ? // under a hat: a short fringe from its rim
            [
              hs.at(rim + 0.05, phi * 0.95, th * 0.2),
              hs.at(lerp(rim, tip, 0.5), phi * 0.97 + sw * 0.5, th * 0.6),
              hs.at(tip, phi + sw, th * 0.35),
            ]
          : [
              hs.at(0.99, part + phi * 0.15, th * 0.5),
              hs.at(0.9, part * 0.5 + phi * 0.55, th * 1.05),
              hs.at(lerp(0.9, tip, 0.55), phi * 0.92 + sw * 0.5, th * 1.0),
              hs.at(tip, phi + sw, th * 0.35),
            ],
        lw * p.hair.fringe * (1 - Math.abs(f) * 0.15),
        0.42,
      );
    }
  };
  // the quiff: one lock springing up off the crown and curling forward
  const quiff = (size = p.hair.tuft) => {
    if (size <= 0 || o.hat) return;
    lock(
      [
        hs.at(0.97, Math.PI * 0.85, th * 0.5),
        hs.at(0.99, Math.PI * 0.6, th * (1 + 2.5 * size)),
        hs.at(1, 0.2, th * (1.5 + 4 * size)),
        hs.at(0.97, 0.45, th * (1.2 + 3.2 * size)),
      ],
      lw * 0.45,
      0.5,
      0.15,
    );
  };
  // locks all round the sides and back, to the chin (bob) or the shoulder blades (long)
  const around = (long: boolean, width: number, tip = 0.85) => {
    const n = Math.max(6, Math.round(16 * p.hair.count));
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const phi = lerp(p.hair.side, Math.PI * 2 - p.hair.side, f);
      const back = -Math.cos(phi); // 1 at the back
      const rim = o.hatLine?.(phi);
      // (under a hat they start at its rim)
      const pts =
        rim !== undefined
          ? [hs.at(rim + 0.05, phi, th * 0.3), hs.at(Math.min(rim - 0.04, 0.42), phi, th * 1.4)]
          : [hs.at(0.97, phi, th * 0.6), hs.at(0.72, phi, th * 1.25), hs.at(0.42, phi, th * 1.5)];
      if (long) {
        const a = hs.at(0.2, phi, th * 1.6);
        const out = new Vector3(a.x, 0, a.z).normalize();
        const drop = (kk: number, push: number) => {
          const q = a
            .clone()
            .addScaledVector(out, push)
            .add(new Vector3(0, -kk * hh, 0));
          if (back > 0.2) q.z = Math.min(q.z, -o.backZ - th * 2); // clear of the back
          q.x *= 1 + 0.05 * kk * (1 - back);
          return q;
        };
        pts.push(a, drop(0.45, th * 1.4), drop(0.9, th * 1.1), drop(1.15, th * 0.6));
      } else {
        pts.push(hs.at(0.14, phi, th * 1.55), hs.at(0.07, phi * 0.98 + Math.sign(Math.sin(phi)) * -0.05, th * 0.7));
      }
      lock(pts, width, 0.38, 0.05, tip);
    }
  };
  const ring = (r: number, tube: number) =>
    lathe(arc(r, 0, tube, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), k.seg.radial);

  switch (kind) {
    case "crew": {
      // short and neat: the sides taken in close, a little more on top, the
      // front brushed up and a touch to one side
      cap(line(0.76, 0.55, 0.3), (u) => th * lerp(1.05, 0.55, smooth(0.25, 0.75, u)) * (1 - 0.94 * smooth(0.8, 1, u)));
      if (o.hat) return;
      const n = Math.max(5, Math.round(9 * p.hair.count));
      for (let i = 0; i < n; i++) {
        const f = (i / (n - 1)) * 2 - 1;
        const phi = f * 0.95;
        const h = th * (2.2 - 0.9 * Math.abs(f));
        lock(
          [hs.at(0.79, phi, th * 0.5), hs.at(0.84, phi + 0.04, h), hs.at(0.9, phi + 0.1 + 0.05 * f, h * 1.05)],
          lw * 0.75,
          0.45,
          0.12,
        );
      }
      return;
    }
    case "slick": {
      // combed straight back: a full cap, the locks lying back over the crown
      // from a front that stands up a little
      cap(line(0.78, 0.52, 0.28), rolled(th * 1.1));
      if (o.hat) return;
      const n = Math.max(5, Math.round(10 * p.hair.count));
      for (let i = 0; i < n; i++) {
        const f = (i / (n - 1)) * 2 - 1;
        const phi = f * 0.85;
        lock(
          [
            hs.at(0.8, phi, th * 0.7),
            hs.at(0.9, phi * 0.95, th * 2.4),
            hs.at(0.99, phi * 0.6, th * 2.0),
            hs.at(0.86, Math.PI - phi * 0.5, th * 1.4),
            hs.at(0.66, Math.PI - phi * 0.45, th * 0.6),
          ],
          lw * 1.05,
          0.3,
          0.06,
        );
      }
      return;
    }
    case "spiky": {
      // short spikes all over the top, pointing up and out (none under a hat)
      cap(line(0.76, 0.52, 0.28), rolled(th * 0.85));
      if (o.hat) return;
      const rows: [number, number, number][] = [
        [0.985, 1, 0], // [t, how many × count, twist]
        [0.9, 2.2, 0.3],
        [0.8, 3, 0.15],
      ];
      for (const [t, many, tw] of rows) {
        const n = Math.max(3, Math.round(many * 5 * p.hair.count));
        for (let i = 0; i < n; i++) {
          const phi = (i / n) * Math.PI * 2 + tw;
          // (not down over the face or the nape)
          if (t < 0.85 && Math.cos(phi) < -0.4) continue;
          const a = hs.at(t, phi, -th * 0.2);
          const nr = hs.normal(a.x, a.y, a.z);
          const len = (0.16 + 0.04 * ((i * 7) % 3)) * hh * (t > 0.95 ? 1 : 0.85);
          const tip = a
            .clone()
            .addScaledVector(nr, len)
            .add(new Vector3(0, len * 0.35, Math.cos(phi) * len * 0.15));
          lock(
            [
              a,
              a
                .clone()
                .lerp(tip, 0.5)
                .addScaledVector(nr, len * 0.05),
              tip,
            ],
            lw * 0.62,
            0.55,
            0.14,
          );
        }
      }
      return;
    }
    case "buzz":
      // clipped close: a thin cap, nothing loose
      cap(line(0.78, 0.5, 0.28), rolled(th * 0.32));
      return;
    case "short":
      cap(line(0.74, 0.5, 0.26), rolled(th));
      bangs(6, 0.95, 0.66, 0.32, true);
      quiff();
      return;
    case "mohawk": {
      // shaved sides; a crest of locks standing up along the middle, front to nape
      // (under a hat it's only the shaved strip)
      const n = o.hat ? 0 : Math.max(5, Math.round(9 * Math.max(0.7, p.hair.count)));
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        // along the middle line: forehead (t .82, front) over the crown to the nape (t .35, back)
        const a = f < 0.5 ? hs.at(lerp(0.82, 1, f * 2), 0, 0) : hs.at(lerp(1, 0.35, (f - 0.5) * 2), Math.PI, 0);
        const n0 = hs.normal(a.x, a.y, a.z);
        const lean = new Vector3(0, 0, -1).multiplyScalar(0.35 * hh * (0.4 + 0.6 * f));
        const tall = (0.32 + 0.12 * Math.sin(Math.PI * f)) * hh;
        lock(
          [
            a.clone().addScaledVector(n0, -th * 0.5),
            a.clone().addScaledVector(n0, tall * 0.55),
            a.clone().addScaledVector(n0, tall).add(lean),
          ],
          lw * 0.85,
          0.32,
          0.12,
        );
      }
      // the shaved strip it grows from
      const strip: Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const f = i / 10;
        const a =
          f < 0.5 ? hs.at(lerp(0.82, 1, f * 2), 0, th * 0.15) : hs.at(lerp(1, 0.35, (f - 0.5) * 2), Math.PI, th * 0.15);
        strip.push(a);
      }
      k.add(
        "head",
        tube(strip, (u) => {
          const s = Math.sqrt(Math.min(1, u / 0.05, (1 - u) / 0.05));
          return [lw * 0.55 * s, th * 0.4 * s];
        }),
        color,
        { keepNormals: true },
      );
      return;
    }
    case "bob": {
      // (`nape`: the cap down over the nape, no skin between the locks' points behind)
      cap(line(0.8, 0.42, lerp(0.2, 0.06, p.hair.nape)), rolled(th));
      bangs(8, 1.15, 0.56, 0.18, false);
      quiff(p.hair.tuft * 0.6);
      // (the locks swing a little on the hair's spring, below the ears: plan 58 phase 2d)
      const from = k.parts.length;
      around(false, lw * 1.15, lerp(0.85, 0.22, p.hair.blunt));
      hang(from, 0.45 * hh, -0.15 * hh, 0.55);
      k.spring("hair", [0, 0.45 * hh, -0.05 * hh], [0, -0.75 * hh, -0.1 * hh], { hz: 3.2, damp: 0.45, limit: 0.4 });
      return;
    }
    case "long": {
      // (`nape`: the cap down over the nape, no skin between the locks' points behind)
      cap(line(0.8, 0.42, lerp(0.2, 0.06, p.hair.nape)), rolled(th));
      bangs(8, 1.15, 0.56, 0.18, false);
      quiff(p.hair.tuft * 0.6);
      // (the locks hang on the hair's spring, more the lower: they swing and trail, then settle)
      const from = k.parts.length;
      around(true, lw * 1.4);
      hang(from, 0.3 * hh, -0.6 * hh, 1);
      k.spring("hair", [0, 0.45 * hh, -0.05 * hh], [0, -1.35 * hh, -0.15 * hh], { hz: 2.4, damp: 0.35, limit: 0.65 });
      return;
    }
    case "curly": {
      // a full head of tight curls: a thick cap and round curls over it, out to the jaw
      cap(line(0.8, 0.36, 0.18, false), rolled(th * 1.4));
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        const t = lerp(0.96, 0.3, r / (rows - 1));
        const n = Math.round(lerp(6, 16, r / (rows - 1)) * Math.max(0.7, p.hair.count) * 1.4);
        for (let i = 0; i < n; i++) {
          const phi = (i / n) * Math.PI * 2 + (r % 2) * (Math.PI / n);
          // keep the face clear
          if (Math.cos(phi) > 0.35 && t < 0.78) continue;
          const s = (0.07 + 0.015 * ((i * 7 + r * 3) % 3)) * hh;
          const at = hs.at(t, phi, th * 1.4 + s * 0.35);
          k.add("head", ellipsoid(s, s * 0.92, s, Math.max(8, k.seg.radial / 3), Math.max(3, k.seg.ring)), color, {
            at,
          });
        }
      }
      return;
    }
    case "afro": {
      // a big round mass: the cap lifted far out at the crown and sides, rolled
      // back to the hairline; bumps round its outline
      // round all over: it comes down to the jaw at the sides and back, and
      // only thins where it meets the forehead
      const big = 0.3 * hh;
      const hair = line(0.8, 0.3, 0.16, false);
      cap(hair, (u, phi) => {
        const front = Math.max(0, Math.cos(phi));
        const max = big * (1 - 0.5 * front ** 2);
        const rise = Math.sin(Math.PI * 0.5 * Math.min(1, u * 1.7));
        const roll = Math.sqrt(Math.max(0, 1 - smooth(0.78, 1, u) ** 2));
        // (its edge tucks right in to the scalp: no gap to see into)
        return th * (1 - 0.9 * smooth(0.85, 1, u)) + max * rise * roll;
      });
      const n = Math.round(22 * Math.max(0.7, p.hair.count));
      for (let i = 0; i < n; i++) {
        const phi = (i / n) * Math.PI * 2;
        const front = Math.max(0, Math.cos(phi));
        if (front > 0.8) continue;
        // half sunk in the mass: they only roughen its outline
        const t = lerp(0.45, 0.85, (i * 0.37) % 1);
        const s = (0.07 + 0.015 * (i % 3)) * hh;
        const at = hs.at(t, phi, th + big * (1 - 0.5 * front ** 2) * 0.78);
        k.add("head", ellipsoid(s, s, s, Math.max(8, k.seg.radial / 3), Math.max(3, k.seg.ring)), color, { at });
      }
      return;
    }
    case "bun": {
      cap(line(0.8, 0.48, 0.3), rolled(th));
      bangs(8, 1.15, 0.56, 0.18, false);
      const c = hs.at(0.86, Math.PI, 0.16 * hh);
      k.add("head", ellipsoid(0.2 * hh, 0.18 * hh, 0.19 * hh, k.seg.radial, k.seg.ring * 2), color, { at: c });
      const tie = ring(0.13 * hh, 0.025 * hh);
      tie.rotateX(Math.PI / 2 - 0.6);
      k.add("head", tie, o.tieColor, { at: hs.at(0.8, Math.PI, 0.06 * hh) });
      return;
    }
    default: {
      // ponytail
      cap(line(0.8, 0.48, 0.3), rolled(th));
      bangs(8, 1.15, 0.56, 0.18, false);
      quiff(p.hair.tuft * 0.6);
      const a = hs.at(0.62, Math.PI, th * 1.2);
      const clear = (d: number) => -Math.max(d * hh, o.backZ + 0.05 * hh - Math.abs(a.z) + d * hh * 0.3);
      const tail = [
        a,
        a.clone().add(new Vector3(0, 0.05 * hh, -0.16 * hh)),
        a.clone().add(new Vector3(0.01 * hh, -0.22 * hh, clear(0.24))),
        a.clone().add(new Vector3(0.02 * hh, -0.6 * hh, clear(0.17))),
        a.clone().add(new Vector3(-0.01 * hh, -0.92 * hh, clear(0.14))),
      ];
      const W = 0.19 * hh;
      k.add(
        "head",
        sweepTube(
          tail,
          (u) => {
            // full near the tie, swelling, then pointed
            const s =
              Math.sqrt(Math.min(1, u / 0.04)) *
              (0.7 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.3))) *
              (1 - u) ** 0.7;
            return [W * s, W * 0.8 * s];
          },
          { segs: k.seg.tube, radial: k.seg.tubeRadial + 4 },
        ),
        color,
        { keepNormals: true },
      );
      // (the tail on the hair's spring, from its tie: it swings and bounces)
      const end = k.parts[k.parts.length - 1];
      end.skin = (_x, y) => ["hair", smooth(a.y + 0.03 * hh, a.y - 0.4 * hh, y)];
      const tip = tail[tail.length - 1];
      k.spring("hair", [a.x, a.y, a.z], [tip.x - a.x, tip.y - a.y, tip.z - a.z], { hz: 1.9, damp: 0.3, limit: 1 });
      const tie = ring(0.07 * hh, 0.022 * hh);
      tie.rotateX(Math.PI / 2 - 0.25);
      k.add("head", tie, o.tieColor, { at: a.clone().add(new Vector3(0, 0.01 * hh, -0.05 * hh)) });
    }
  }
}

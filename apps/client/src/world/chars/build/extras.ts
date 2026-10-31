import { Shape, Vector3 } from "three";
import type { Kit } from "../kit";
import { arc, ellipsoid, extrude, lathe, type Prof, sweepTube } from "../shapes";
import { type Body, lerp, smooth } from "./body";
import { chestBand, chestDot, OUTERS, shade, tie } from "./tops";

// One more thing — every AvatarLayers extra: walkman, scarf, earrings, necklace, backpack, watch,
// a crossbody bag, mittens, bracelets, a tie, a lanyard, a tote, a fanny pack, a leather satchel.

/** A rounded box (w × h, d deep) facing +z. */
function box(w: number, h: number, d: number, r: number, k: Kit) {
  const s = new Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const bev = Math.min(r, d * 0.4);
  const g = extrude(s, Math.max(1e-4, d - 2 * bev), bev, k.seg.curve, k.seg.bevel);
  g.translate(0, 0, -d / 2);
  return g;
}

export function buildExtra(
  k: Kit,
  b: Body,
  kind: string,
  color: string,
  o: { earsShow: boolean; skin: string; outer?: string },
) {
  if (kind === "none") return;
  const hh = b.hh;
  const T = b.T;
  const R = k.seg.radial;
  const toSpine = (g: ReturnType<typeof box>) => g.translate(0, -b.spineY, 0);
  // (it swings on Jolt near, docs/plan/61: the bag's joint at its middle `at` (the trunk's), hung from
  // `from`, a box of half sides `half` turned `yaw`; the parts since `p0` on it)
  const hang = (kind: string, p0: number, at: Vector3, from: Vector3, half: [number, number, number], yaw = 0) => {
    k.joint("pack", at.x, at.y - b.chestY, at.z);
    k.hangs.push({ joint: "pack", kind, from: [from.x, from.y - b.chestY, from.z], c: [0, 0, 0], box: half, yaw });
    for (const q of k.parts.slice(p0)) q.skin = () => ["pack", 1];
  };
  switch (kind) {
    case "walkman": {
      // on the waistband at the right hip, its lead up to the collar
      const y = 0.4 * T;
      const x = -b.trunk.r(y) * 0.62;
      const at = b.surf(x, y, 1.08);
      const n = b.surfNormal(x, y, 1.08);
      // (big enough to read at play distance)
      const z = 1.35;
      const g = box(0.13 * hh * z, 0.17 * hh * z, 0.05 * hh * z, 0.02 * hh, k);
      g.lookAt(n);
      k.add("hips", g, color, { at: at.addScaledVector(n, 0.02 * hh) });
      const lead: Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        lead.push(b.surf(lerp(x * 0.9, -b.hh * 0.05, u), lerp(y + 0.08 * hh, 0.95 * T, u), 1.07));
      }
      k.add("spine", toSpine(sweepTube(lead, () => [0.005 * hh, 0.005 * hh], { segs: 12, radial: 4 })), "#151515", {
        keepNormals: true,
      });
      return;
    }
    case "scarf": {
      // wound round the neck, the two ends hanging down the front
      // a fat round roll on the neck (it rides the neck), the ends hanging in front
      const nr = k.p.neck.r * hh;
      const ring = lathe(arc(nr * 1.75, 0.04 * hh, 0.09 * hh, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R);
      k.add("neck", ring, color);
      const x0 = nr * 0.6;
      const from = k.parts.length;
      k.add(
        "spine",
        toSpine(
          chestBand(
            b,
            [
              [x0, T * 0.96],
              [x0 * 1.2, T * 0.76],
              [x0 * 1.1, T * 0.52],
            ],
            0.13 * hh,
            1.1,
          ),
        ),
        color,
      );
      k.add(
        "spine",
        toSpine(
          chestBand(
            b,
            [
              [x0 * 0.2, T * 0.95],
              [-x0 * 0.4, T * 0.78],
              [-x0 * 0.6, T * 0.62],
            ],
            0.12 * hh,
            1.13,
          ),
        ),
        shade(color, 0.88),
      );
      // (the ends hang from under the knot on the scarf's spring, swinging off the chest: plan 58
      // phase 2d; spine space here, the spring's in the chest's)
      const knot = 0.93 * T;
      for (const q of k.parts.slice(from))
        q.skin = (_x, y) => ["scarf", smooth(knot - b.spineY, 0.55 * T - b.spineY, y)];
      const front = b.surf(0, knot, 1.1);
      k.spring("scarf", [0, knot - b.chestY, front.z], [0, -0.42 * T, 0.03 * hh], { hz: 2.6, damp: 0.35, limit: 0.6 });
      k.hangs.push({ joint: "scarf", kind: "scarf", c: [0, -0.21 * T, 0.015 * hh], r: 0.05 * hh });
      return;
    }
    case "earrings": {
      if (!o.earsShow) return;
      const hs = k.head;
      const f = k.p.face;
      const y = (f.eyeY - 0.04) * hh - f.ears * hh * 0.55;
      for (const side of [1, -1]) {
        const x = hs.R(y) * k.p.head.width * 0.97;
        const z = 1.5; // (a hoop that reads at play distance)
        const hoop = lathe(
          arc(0.05 * hh * z, 0, 0.012 * hh * z, -Math.PI / 2, Math.PI * 1.5, Math.max(2, k.seg.ring)),
          Math.max(8, R / 2),
        );
        hoop.rotateX(Math.PI / 2);
        hoop.rotateY(Math.PI / 2);
        // (each swings from the lobe on its own joint, near: docs/plan/61)
        const ear = side > 0 ? "earL" : "earR";
        k.joint(ear, side * (x + 0.012 * hh * z), y, -0.01 * hh);
        k.add(ear, hoop.translate(0, -0.05 * hh * z, 0), color);
        k.hangs.push({ joint: ear, kind: "earring", c: [0, -0.05 * hh * z, 0], r: 0.02 * hh });
      }
      return;
    }
    case "necklace": {
      // a fine chain lying round the base of the neck, dipping in front, a pendant
      const pts: Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const phi = (i / 24) * Math.PI * 2;
        const front = Math.max(0, Math.cos(phi));
        const y = T * (0.975 - 0.1 * front ** 2);
        const x = Math.sin(phi) * b.trunk.r(y) * 1.05;
        pts.push(b.surf(x, y, 1.05, Math.cos(phi) >= 0 ? 1 : -1));
      }
      const z = 1.6; // (a chain and a pendant that read at play distance)
      k.add("spine", toSpine(sweepTube(pts, () => [0.006 * hh * z, 0.006 * hh * z], { segs: 32, radial: 4 })), color, {
        keepNormals: true,
      });
      k.add("spine", toSpine(chestDot(b, 0, T * (z > 1 ? 0.85 : 0.86), 0.026 * hh * z, 1.06)), color);
      return;
    }
    case "backpack": {
      // a pack on the back, two straps over the shoulders
      const y = 0.62 * T;
      const at = b.surf(0, y, 1.08, -1);
      const g = box(0.6 * hh, 0.75 * hh, 0.22 * hh, 0.08 * hh, k);
      k.add("spine", toSpine(g.translate(at.x, at.y, at.z - 0.11 * hh)), color);
      const flap = box(0.5 * hh, 0.26 * hh, 0.05 * hh, 0.06 * hh, k);
      k.add("spine", toSpine(flap.translate(at.x, at.y + 0.2 * hh, at.z - 0.24 * hh)), shade(color, 0.85));
      // (the pack bounces on its spring from its top, the straps stay: plan 58 phase 2d)
      const top = at.y + 0.37 * hh;
      for (const q of k.parts.slice(-2))
        q.skin = (_x, y) => ["pack", 0.85 * smooth(top - b.spineY, top - 0.3 * hh - b.spineY, y)];
      k.spring("pack", [0, top - b.chestY, at.z - 0.11 * hh], [0, -0.75 * hh, -0.02 * hh], {
        hz: 4.5,
        damp: 0.4,
        limit: 0.12,
      });
      k.hangs.push({
        joint: "pack",
        kind: "backpack",
        c: [0, -0.375 * hh, -0.01 * hh],
        box: [0.3 * hh, 0.375 * hh, 0.11 * hh],
      });
      for (const sx of [1, -1]) {
        const x = sx * b.trunk.r(0.85 * T) * 0.45;
        let yTop = 0.85 * T;
        while (yTop < T && b.trunk.r(yTop) > Math.abs(x)) yTop += T * 0.01;
        const strap = [
          b.surf(x * 1.1, 0.75 * T, 1.1, -1),
          b.surf(x, 0.9 * T, 1.08, -1),
          new Vector3(x, yTop + 0.02 * hh, 0),
          b.surf(x, 0.88 * T, 1.08, 1),
          b.surf(x * 1.15, 0.55 * T, 1.07, 1),
        ];
        k.add(
          "spine",
          toSpine(
            sweepTube(strap, () => [0.05 * hh, 0.014 * hh], {
              segs: k.seg.tube,
              radial: Math.max(4, k.seg.tubeRadial - 2),
              up: (q) => new Vector3(q.x, 0, q.z).normalize(),
            }),
          ),
          shade(color, 0.75),
          { keepNormals: true },
        );
      }
      return;
    }
    case "watch": {
      // on the left wrist: a strap round it and a round face on the outside
      const y = -b.fore + b.wR * 1.4;
      const strap = lathe(arc(b.wR * 1.08, y, b.wR * 0.32, -Math.PI / 2, Math.PI * 1.5, Math.max(2, k.seg.ring)), R);
      k.add("elbowL", strap, shade(color, 0.7));
      const face: Prof[] = [
        [0, -0.02 * hh],
        ...arc(0.04 * hh, -0.01 * hh, 0.01 * hh, -Math.PI / 2, Math.PI / 2, Math.max(2, k.seg.ring)),
        [0, 0],
      ];
      const g = lathe(face, Math.max(10, R / 2));
      g.rotateZ(-Math.PI / 2);
      // (a face that reads: big, a pale dial in the case's ring)
      g.scale(1.5, 1.6, 1.6);
      k.add("elbowL", g, color, { at: new Vector3(b.wR * 1.25, y, 0) });
      const dial = lathe(face, Math.max(10, R / 2));
      dial.rotateZ(-Math.PI / 2);
      dial.scale(0.6, 1.15, 1.15);
      k.add("elbowL", dial, "#efe4cc", { at: new Vector3(b.wR * 1.25 + 0.022 * hh, y, 0), ink: 0 });
      return;
    }
    case "mittens": {
      // knitted mittens over the hands (they curl with the fingers: the hand's own weights), a cuff
      const was = k.p.hand.fingers;
      k.p.hand.fingers = 0;
      for (const side of ["L", "R"] as const) {
        const m = b.mitten();
        m.scale(1.3, 1.12, 1.3);
        k.add(`wrist${side}`, m, color, { skin: b.handSkin(side) });
        k.add(
          `elbow${side}`,
          lathe(arc(b.wR * 1.35, -b.fore + 0.02 * hh, 0.035 * hh, -Math.PI / 2, Math.PI * 1.5, k.seg.ring * 2), R),
          shade(color, 0.85),
        );
      }
      k.p.hand.fingers = was;
      return;
    }
    case "bracelets": {
      // three thin bangles on the left wrist
      for (let i = 0; i < 3; i++)
        k.add(
          "elbowL",
          lathe(
            arc(
              b.wR * (1.18 + 0.04 * i),
              -b.fore + b.wR * (0.9 + 0.55 * i),
              b.wR * 0.13,
              -Math.PI / 2,
              Math.PI * 1.5,
              Math.max(2, k.seg.ring),
            ),
            R,
          ),
          i === 1 ? shade(color, 1.25) : color,
        );
      return;
    }
    case "tie":
      tie(k, b, color, 1.07);
      return;
    case "lanyard": {
      // a cord round the neck down to a badge on the chest
      const pts: Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const phi = (i / 24) * Math.PI * 2;
        const front = Math.max(0, Math.cos(phi));
        const y = T * (0.975 - 0.3 * front ** 3);
        pts.push(
          b.surf(Math.sin(phi) * b.trunk.r(y) * 1.08 * (1 - 0.6 * front ** 4), y, 1.08, Math.cos(phi) >= 0 ? 1 : -1),
        );
      }
      k.add("spine", toSpine(sweepTube(pts, () => [0.012 * hh, 0.004 * hh], { segs: 40, radial: 4 })), color, {
        keepNormals: true,
      });
      // (the cord's front low on the badge: it swings from high on the chest)
      k.parts[k.parts.length - 1].skin = (_x, y, z) => [
        "pack",
        z > 0 ? smooth(0.86 * T - b.spineY, 0.7 * T - b.spineY, y) : 0,
      ];
      const p0 = k.parts.length;
      // (stood off the shirt a little: as the trunk twists under the chest it swings from, the card
      // stays clear of it)
      const at = b.surf(0, T * 0.6, 1.1).add(new Vector3(0, 0, 0.02 * hh));
      const card = box(0.17 * hh, 0.22 * hh, 0.012 * hh, 0.015 * hh, k);
      k.add("spine", toSpine(card.translate(at.x, at.y, at.z + 0.01 * hh)), "#f4efe6");
      k.add(
        "spine",
        toSpine(
          box(0.17 * hh, 0.05 * hh, 0.014 * hh, 0.01 * hh, k).translate(at.x, at.y + 0.08 * hh, at.z + 0.012 * hh),
        ),
        color,
      );
      hang("badge", p0, at.clone().add(new Vector3(0, 0, 0.01 * hh)), b.surf(0, T * 0.86, 1.08), [
        0.085 * hh,
        0.12 * hh,
        0.008 * hh,
      ]);
      return;
    }
    case "tote": {
      // a tote on the right shoulder, hanging at the hip behind the arm
      const y = 0.28 * T;
      const x = -b.trunk.r(y) * 1.12;
      const at = b.surf(x * 0.9, y, 1.15, -1).add(new Vector3(-0.06 * hh, 0, 0));
      const p0 = k.parts.length;
      const bag = box(0.12 * hh, 0.5 * hh, 0.42 * hh, 0.03 * hh, k);
      k.add("spine", toSpine(bag.translate(at.x - 0.04 * hh, at.y, at.z * 0.3)), color);
      for (const dz of [1, -1]) {
        const strap = [
          new Vector3(at.x - 0.04 * hh, at.y + 0.24 * hh, at.z * 0.3 + dz * 0.12 * hh),
          b.surf(-b.trunk.r(0.8 * T) * 0.85, 0.8 * T, 1.15, dz > 0 ? 1 : -1),
          new Vector3(-b.shX * 0.9, b.shY + 0.05 * hh, 0),
        ];
        k.add(
          "spine",
          toSpine(
            sweepTube(strap, () => [0.03 * hh, 0.008 * hh], {
              segs: 12,
              radial: 4,
              up: (q) => new Vector3(q.x, 0, q.z).normalize(),
            }),
          ),
          shade(color, 0.8),
          { keepNormals: true },
        );
      }
      // (on its straps from the shoulder, near: the straps on it the lower they are)
      const mid = new Vector3(at.x - 0.04 * hh, at.y, at.z * 0.3);
      const sh = new Vector3(-b.shX * 0.9, b.shY + 0.05 * hh, 0);
      hang("tote", p0, mid, sh, [0.06 * hh, 0.25 * hh, 0.21 * hh]);
      for (const q of k.parts.slice(p0 + 1))
        q.skin = (_x, y) => ["pack", smooth(sh.y - b.spineY, mid.y + 0.24 * hh - b.spineY, y)];
      return;
    }
    case "fannypack": {
      // a pouch at the front of the waist on a belt round it
      const y = 0.36 * T;
      k.add("spine", toSpine(b.ring(y, 1.12, 0.018 * hh)), shade(color, 0.7));
      const at = b.surf(0, y, 1.14).add(new Vector3(0, 0, 0.05 * hh));
      const p0 = k.parts.length;
      k.add("spine", toSpine(box(0.38 * hh, 0.2 * hh, 0.12 * hh, 0.06 * hh, k).translate(at.x, at.y, at.z)), color);
      k.crease(
        "spine",
        toSpine(
          sweepTube(
            [
              at.clone().add(new Vector3(-0.17 * hh, 0.04 * hh, 0.061 * hh)),
              at.clone().add(new Vector3(0.17 * hh, 0.04 * hh, 0.061 * hh)),
            ],
            () => [1e-4, 1e-4],
            { segs: 2, radial: 4 },
          ),
        ),
      );
      // (the pouch bobs on the belt, near)
      hang("fannypack", p0, at, b.surf(0, y + 0.03 * hh, 1.12), [0.19 * hh, 0.1 * hh, 0.06 * hh]);
      return;
    }
    case "satchel": {
      // a satchel: worn leather on a long strap from the right shoulder across the body, the bag low
      // and behind the left hip — a flap over its top half riveted in brass, two straps down the front through
      // brass buckles; over a coat if there is one
      const off = OUTERS[o.outer ?? "none"] ? 0.13 : 0;
      const kk = 1.1 + off;
      // (a long strap: from over the right shoulder across the chest to the left side, low, and back
      // up across the back — round the trunk by angle, phi 0 the front, + its left)
      const strap: Vector3[] = [];
      const run = (p0: number, p1: number, y0: number, y1: number, n: number) => {
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          strap.push(b.around3(lerp(y0, y1, u), lerp(p0, p1, u), kk + 0.01));
        }
      };
      run(-0.35, 2.3, 0.97 * T, 0.12 * T, 12);
      run(3.25, 3.55, 0.12 * T, 0.97 * T, 12);
      run(3.55, 2 * Math.PI - 0.35, 0.985 * T, 0.985 * T, 4);
      const leather = shade(color, 0.82);
      const p0 = k.parts.length;
      k.add(
        "spine",
        toSpine(
          sweepTube(strap, () => [0.04 * hh, 0.009 * hh], {
            segs: Math.max(32, k.seg.tube * 2),
            radial: Math.max(4, k.seg.tubeRadial - 2),
            up: (q) => new Vector3(q.x, 0, q.z).normalize(),
          }),
        ),
        leather,
        { keepNormals: true },
      );
      // the bag low behind the left hip, hanging from the strap's two ends, its front turned to the back
      // (placed by the trunk where it's widest, at the hip, then hung lower: the trunk narrows to a point
      // at its bottom)
      const phi = 2.78;
      const on = b.around3(0.16 * T, phi, kk);
      const n = new Vector3(on.x, 0, on.z).normalize();
      const at = on.addScaledVector(n, 0.08 * hh).add(new Vector3(0, -0.2 * hh, 0));
      // (it swings from the strap on Jolt near, docs/plan/61: its joint at the bag's middle, hung from
      // where the strap leaves the body above it; low on it, the strap goes with it)
      const hung = b.around3(0.45 * T, phi, kk);
      // (over a long stretch of it: a short one kinked where the strap meets the bag)
      k.parts[p0].skin = (_x, y) => ["pack", smooth(0.62 * T - b.spineY, 0.14 * T - b.spineY, y)];
      const p1 = k.parts.length;
      // a messenger bag: wide and deep, a flap over the top and down past the middle — its lower corners
      // round, stitched round its edge — two straps from the flap down the front through buckles, two
      // rivets over each strap
      const W = 1.0 * hh;
      const H = 0.66 * hh;
      const D = 0.22 * hh;
      const fine = k.seg.radial > 9;
      const place = (g: ReturnType<typeof box>, dx: number, dy: number, dz: number) => {
        g.translate(dx, dy, dz);
        g.lookAt(n);
        return g;
      };
      const flat2 = (sh: Shape, depth: number, bevel: number, z: number) => {
        const g = extrude(sh, depth, bevel, k.seg.curve, Math.max(1, k.seg.bevel));
        return place(g, 0, 0, z);
      };
      k.add("hips", place(box(W, H, D, 0.05 * hh, k), 0, 0, 0), color, { at: at.clone() });
      // the flap: from over the top, down the front to below the middle
      const fb = -H * 0.12; // (its lower edge)
      const fr = 0.09 * hh;
      const hw = W * 0.51;
      const top = H * 0.5 + 0.01 * hh;
      const flapShape = (inset: number) => {
        const f = new Shape();
        const w = hw - inset;
        const b2 = fb + inset;
        f.moveTo(-w, top - inset);
        f.lineTo(w, top - inset);
        f.lineTo(w, b2 + fr);
        f.quadraticCurveTo(w, b2, w - fr, b2);
        f.lineTo(-w + fr, b2);
        f.quadraticCurveTo(-w, b2, -w, b2 + fr);
        f.closePath();
        return f;
      };
      k.add("hips", flat2(flapShape(0), 0.012 * hh, 0.008 * hh, D / 2 + 0.004 * hh), leather, { at: at.clone() });
      // (over the top, to the back)
      k.add("hips", place(box(W * 1.02, 0.03 * hh, D * 1.06, 0.012 * hh, k), 0, H / 2 + 0.008 * hh, 0), leather, {
        at: at.clone(),
      });
      if (k.seg.radial > 16) {
        // the stitching round the flap's edge, a little in
        const pts = flapShape(0.025 * hh)
          .getPoints(k.seg.curve)
          .map((q) => new Vector3(q.x, q.y, D / 2 + 0.03 * hh));
        pts.push(pts[0].clone());
        const st = sweepTube(pts, () => [1e-4, 1e-4], { segs: pts.length * 2, radial: 4 });
        st.lookAt(n);
        k.crease("hips", st.translate(at.x, at.y, at.z));
      }
      for (const sx of [1, -1]) {
        const x = sx * W * 0.3;
        // a strap from the flap down over the front, its tip cut to a point
        const sw = 0.042 * hh;
        const s0 = H * 0.16;
        const s1 = -H * 0.44;
        const strap2 = new Shape();
        strap2.moveTo(x - sw, s0);
        strap2.lineTo(x + sw, s0);
        strap2.lineTo(x + sw, s1 + sw);
        strap2.lineTo(x, s1);
        strap2.lineTo(x - sw, s1 + sw);
        strap2.closePath();
        k.add("hips", flat2(strap2, 0.008 * hh, 0.004 * hh, D / 2 + 0.034 * hh), leather, { at: at.clone() });
        if (!fine) continue;
        // its buckle: a brass frame over the strap a little below the flap, its tongue across
        const by = -H * 0.2;
        const fw = sw * 1.5;
        const fh = 0.055 * hh;
        const frame = new Shape();
        frame.moveTo(x - fw, by - fh);
        frame.lineTo(x + fw, by - fh);
        frame.lineTo(x + fw, by + fh);
        frame.lineTo(x - fw, by + fh);
        frame.closePath();
        const hole = new Shape();
        const t = 0.014 * hh;
        hole.moveTo(x - fw + t, by - fh + t);
        hole.lineTo(x - fw + t, by + fh - t);
        hole.lineTo(x + fw - t, by + fh - t);
        hole.lineTo(x + fw - t, by - fh + t);
        hole.closePath();
        frame.holes.push(hole);
        k.add("hips", flat2(frame, 0.008 * hh, 0.003 * hh, D / 2 + 0.046 * hh), "#b8913f", { at: at.clone() });
        // (the strap's end caught back through it: a keeper below)
        k.add(
          "hips",
          place(box(sw * 2.4, 0.02 * hh, 0.014 * hh, 0.005 * hh, k), x, by - fh - 0.04 * hh, D / 2 + 0.05 * hh),
          leather,
          {
            at: at.clone(),
          },
        );
        // two rivets on the flap over the strap
        for (const ry of [0.24, 0.32])
          k.add(
            "hips",
            place(ellipsoid(0.02 * hh, 0.02 * hh, 0.01 * hh, 8, 3), x, H * ry, D / 2 + 0.026 * hh),
            "#d8d2c4",
            {
              at: at.clone(),
              ink: 0,
            },
          );
      }
      hang("satchel", p1, at, hung, [0.5 * hh, 0.33 * hh, 0.11 * hh], Math.atan2(n.x, n.z));
      return;
    }
    case "crossbody": {
      // a strap from the left shoulder across the chest and back, a small bag on
      // the right hip with its flap
      const strap: Vector3[] = [];
      const s0 = b.surf(b.trunk.r(0.92 * T) * 0.5, 0.92 * T, 1.08, 1);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const y = lerp(0.95 * T, 0.36 * T, u);
        strap.push(b.surf(lerp(b.trunk.r(0.92 * T) * 0.5, -b.trunk.r(y) * 0.7, u), y, 1.09, 1));
      }
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const y = lerp(0.36 * T, 0.95 * T, u);
        strap.push(b.surf(lerp(-b.trunk.r(y) * 0.7, b.trunk.r(0.92 * T) * 0.5, u), y, 1.09, -1));
      }
      strap.push(s0);
      k.add(
        "spine",
        toSpine(
          sweepTube(strap, () => [0.03 * hh, 0.008 * hh], {
            segs: Math.max(24, k.seg.tube * 2),
            radial: Math.max(4, k.seg.tubeRadial - 2),
            up: (q) => new Vector3(q.x, 0, q.z).normalize(),
          }),
        ),
        shade(color, 0.7),
        { keepNormals: true },
      );
      const y = 0.32 * T;
      const x = -b.trunk.r(y) * 0.82;
      const n = b.surfNormal(x, y, 1.1);
      const at = b.surf(x, y, 1.1).addScaledVector(n, 0.05 * hh);
      const bag = box(0.3 * hh, 0.24 * hh, 0.1 * hh, 0.05 * hh, k);
      bag.lookAt(n);
      // (its strap on it low down, near: docs/plan/61)
      k.parts[k.parts.length - 1].skin = (_x, y) => ["pack", smooth(0.55 * T - b.spineY, 0.38 * T - b.spineY, y)];
      const p0 = k.parts.length;
      k.add("hips", bag, color, { at });
      const flap = box(0.31 * hh, 0.13 * hh, 0.03 * hh, 0.04 * hh, k);
      flap.lookAt(n);
      k.add("hips", flap, shade(color, 0.85), {
        at: at
          .clone()
          .add(new Vector3(0, 0.06 * hh, 0))
          .addScaledVector(n, 0.05 * hh),
      });
      hang("crossbody", p0, at, b.surf(x, 0.5 * T, 1.1), [0.15 * hh, 0.12 * hh, 0.05 * hh], Math.atan2(n.x, n.z));
      return;
    }
  }
}

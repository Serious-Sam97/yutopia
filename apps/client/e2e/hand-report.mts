/* biome-ignore-all lint/suspicious/noExplicitAny: reads the bench's window hooks */
// Plan 78 phase 0 — the hand report: a hand at a moment of a clip on /dev/anim (the dev client on :3100, the
// GPU), on the life body, measured off its bones against a real hand's ranges for the kind of pose it is
// (docs/plan/78-the-hands.md, "What's wrong" and the references): each finger's knuckle (MCP) and middle
// joint (PIP), how far a bend goes sideways out of the finger's own plane, the spread, the thumb (how far it
// turns in toward the palm, its tip's distance to the index's base), the wrist's bend (up and down, side to
// side) and its twist against the forearm; and the hand against the other hand, the head and the trunk
// (each finger's bones as capsules), the deepest it goes into any.
//   node --experimental-strip-types e2e/hand-report.mts "label|clip|t|R|kind" … [--woman]
// (the tips' joint, DIP, read off its bone's own turn: no point past it)
//   kinds: relaxed, clap, held (on what it holds: the contact, not the joints), grip, fist, flat, phone, any
import { chromium } from "@playwright/test";

type Range = [number, number];
/** A real hand's ranges by the kind of pose (degrees, cm) */
const REAL: Record<string, Record<string, Range>> = {
  relaxed: {
    "fingers MCP": [25, 60],
    "fingers PIP": [10, 35],
    "index MCP": [20, 55],
    "index PIP": [5, 30],
    "fingers DIP": [0, 20],
    "index DIP": [0, 20],
    "thumb pad to the index cm": [0, 2.5],
  },
  grip: {
    "fingers MCP": [35, 70],
    "fingers PIP": [30, 65],
    "index MCP": [30, 65],
    "index PIP": [25, 60],
    "fingers DIP": [10, 40],
    "index DIP": [10, 40],
    "thumb in °": [35, 90],
  },
  fist: {
    "thumb pad to the index cm": [0, 2.5],
    "fingers MCP": [80, 100],
    "fingers PIP": [95, 120],
    "index MCP": [80, 100],
    "index PIP": [95, 120],
    // (the life body's thicker fingers meet the palm sooner: its tips at ~50°, plan 78 phase 6)
    "fingers DIP": [40, 95],
    "index DIP": [40, 95],
  },
  clap: {
    "fingers MCP": [0, 25],
    "fingers PIP": [0, 15],
    "index MCP": [0, 25],
    "index PIP": [0, 15],
    "palm to the other hand °": [0, 35],
  },
  flat: {
    "fingers MCP": [0, 20],
    "fingers PIP": [0, 15],
    "index MCP": [0, 20],
    "index PIP": [0, 15],
    "spread °": [0, 12],
  },
  phone: {
    "fingers MCP": [30, 65],
    "fingers PIP": [30, 65],
    "index MCP": [25, 60],
    "index PIP": [25, 60],
    "wrist up/down °": [-25, 25],
  },
  any: {},
  // (a hand on what it holds: its joints are the thing's — the contact's measured instead)
  held: {},
};
// (every kind: no bend more than 6° sideways, the wrist within a real one's range, no twist at the wrist,
// no hand more than 1 cm into the other hand, the head or the trunk)
const ALWAYS: Record<string, Range> = {
  "sideways most °": [0, 6],
  "wrist up/down °": [-60, 70],
  "wrist side to side °": [-25, 35],
  "forearm twist °": [-95, 95],
  "twist at the wrist °": [-45, 45],
  "into the other hand cm": [0, 1],
  "into the head cm": [0, 1],
  "into the trunk cm": [0, 1],
  "thumb into its own hand cm": [0, 0.6],
  "into the thing held cm": [0, 0.7],
  "fingers off the thing held cm": [0, 1.1],
};

const args = process.argv.slice(2);
const woman = args.includes("--woman");
const items = args.filter((a) => !a.startsWith("--"));
const b = await chromium.launch({
  channel: "chromium",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
p.on("pageerror", (e) => console.log("  error:", e.message));
let last = "";
let out = 0;
for (const it of items) {
  const [label, clip, t, S = "R", kind = "any"] = it.split("|");
  if (clip !== last) {
    await p.goto(
      `http://localhost:3100/dev/anim?clip=${encodeURIComponent(clip)}&live=1&compare=0&trail=0&play=0&view=side` +
        (woman ? "&gender=feminine" : "&gender=masculine&hair=short") +
        "&look=life",
    );
    await p.waitForFunction(() => (window as any).__anim?.ready === true, null, { timeout: 180_000 });
    await p.waitForTimeout(4500);
    last = clip;
  }
  await p.evaluate((x) => (window as any).__anim.seek(x), +t);
  await p.waitForTimeout(200);
  const got = (await p.evaluate((S) => {
    const m = (window as any).__anim.sway().after;
    const V = m.bones.hips.position.constructor;
    const Q = m.bones.hips.quaternion.constructor;
    m.root.updateMatrixWorld(true);
    const kn = (m as any).knuckles as Record<string, any> | null;
    if (!kn) return { error: 1 } as Record<string, number>;
    const W = (j: string) => (m.bones[j] ?? kn[j]).getWorldPosition(new V());
    const deg = (a: any, c: any) => (Math.acos(Math.max(-1, Math.min(1, a.dot(c)))) * 180) / Math.PI;
    const dir = (a: any, c: any) => c.clone().sub(a).normalize();
    const hand = (H: string) => {
      const el = W(`elbow${H}`);
      const wr = W(`wrist${H}`);
      const fi = W(`fingers${H}`);
      const ix = W(`index${H}`);
      const meta = dir(wr, fi);
      const across = dir(fi, ix);
      const n = meta.clone().cross(across).normalize();
      const prox = dir(fi, W(`fingers2${H}`));
      if (prox.dot(n) < 0) n.negate();
      return { el, wr, fi, ix, meta, across, n };
    };
    const h = hand(S);
    // the fingers in the hand's own frame (the wrist's; every bone past it unturned at rest, so a child's
    // place is its rest line): each finger's flexion plane is its rest line laid in the palm's plane and the
    // palm's normal — a bend is its angle in that plane, sideways how far it leaves it
    const inv = m.bones[`wrist${S}`].getWorldQuaternion(new Q()).invert();
    const local = (a: any, c: any) => dir(a, c).applyQuaternion(inv);
    const sg = S === "R" ? 1 : -1;
    const fi0 = m.bones[`fingers${S}`].position.clone();
    const ix0 = m.bones[`index${S}`].position.clone();
    const nh = fi0.clone().cross(ix0.clone().sub(fi0)).normalize();
    if (nh.dot(new V(0, 0, sg).cross(kn[`fingers2${S}`].position)) < 0) nh.negate();
    const lineOf = (j: string) => {
      const r = kn[`${j}2${S}`].position.clone().normalize();
      return r.sub(nh.clone().multiplyScalar(r.dot(nh))).normalize();
    };
    const middle = lineOf("fingers");
    const chain = (j: string) => {
      const a = W(`${j}${S}`);
      const b2 = W(`${j}2${S}`);
      const c = W(`${j}3${S}`);
      const ml = lineOf(j);
      const hg = ml.clone().cross(nh);
      // (a fanned finger closing toward the middle's line as it curls is a real hand's: not sideways —
      // only a bend away from it, or past it, counts)
      const toMid = middle.clone().sub(ml).dot(hg);
      const room = j === "fingers" ? 0 : (Math.asin(Math.min(1, Math.abs(toMid))) * 180) / Math.PI;
      const prox = local(a, b2);
      const mid = local(b2, c);
      const elev = (d: any) => (Math.atan2(d.dot(nh), d.dot(ml)) * 180) / Math.PI;
      // the finger's plane now: its first two bones' (bent less than 40°: its base's line and the
      // palm's normal). Sideways: that plane twisted off the palm's normal, or swung about it away from
      // the middle (or past it: a fanned finger closing toward the middle's line as it curls is a real
      // hand's)
      let pn = prox.clone().cross(mid);
      if (pn.length() < 0.64) {
        const flat = prox.clone().sub(nh.clone().multiplyScalar(prox.dot(nh)));
        pn = (flat.length() > 0.3 ? flat : ml.clone()).cross(nh);
      }
      pn.normalize();
      if (pn.dot(hg) < 0) pn.negate();
      const twist = (Math.asin(Math.min(1, Math.abs(pn.dot(nh)))) * 180) / Math.PI;
      const swing = (Math.atan2(hg.clone().cross(pn).dot(nh), hg.dot(pn)) * 180) / Math.PI;
      // (+ toward the middle: the plane swung about +nh takes the finger toward −hg)
      const toward = -Math.sign(toMid || 1) * swing;
      const lean = toward > 0 ? Math.max(0, toward - room) : -toward;
      // (the tip has no point past it: its joint's own turn)
      const q = kn[`${j}3${S}`].quaternion;
      const dip = (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI;
      return {
        mcp: elev(prox),
        pip: ((elev(mid) - elev(prox) + 540) % 360) - 180,
        dip,
        side: Math.max(twist, lean),
        swing,
        prox: dir(a, b2),
      };
    };
    const f = chain("fingers");
    const ix = chain("index");
    // (plan 78 phase 2: the ring and the little their own, when the file has them)
    const five = !!kn[`ring${S}`] && kn[`ring2${S}`].position.lengthSq() > 1e-8;
    const rg = five ? chain("ring") : null;
    const lt = five ? chain("little") : null;
    const t1 = W(`thumb${S}`);
    const t3 = W(`thumb3${S}`);
    // the thumb's pad (its last bone's middle: the bone runs on ~2.6 cm from its joint, the way the one
    // before it points) to the nearest of the index's bones — less the two fingers' half-thicknesses (a
    // pad resting on the index's side reads 0)
    const tipDir = dir(W(`thumb2${S}`), t3);
    const padAt = t3.clone().add(tipDir.multiplyScalar(0.013));
    const segPt = (p0: any, a: any, b: any) => {
      const ab = b.clone().sub(a);
      const u = Math.max(0, Math.min(1, p0.clone().sub(a).dot(ab) / ab.lengthSq()));
      return a.clone().add(ab.multiplyScalar(u)).distanceTo(p0);
    };
    const i1 = W(`index${S}`);
    const i2 = W(`index2${S}`);
    const i3 = W(`index3${S}`);
    const i4 = i3.clone().add(dir(i2, i3).multiplyScalar(0.022));
    const pad = Math.max(0, (Math.min(segPt(padAt, i1, i2), segPt(padAt, i2, i3), segPt(padAt, i3, i4)) - 0.018) * 100);
    const tdir = dir(t1, t3);
    // the wrist: the forearm against the back of the hand, in the palm's frame
    const fore = dir(h.el, h.wr);
    const lat = h.across.clone().cross(h.meta).normalize(); // (≈ the palm's normal, the hand's own)
    const upDown = (Math.asin(Math.max(-1, Math.min(1, fore.dot(h.n)))) * 180) / Math.PI;
    const sideToSide = (Math.asin(Math.max(-1, Math.min(1, fore.dot(h.across)))) * 180) / Math.PI;
    void lat;
    const eq = m.bones[`elbow${S}`].getWorldQuaternion(new Q());
    const wq = m.bones[`wrist${S}`].getWorldQuaternion(new Q());
    const rel = eq.clone().invert().multiply(wq);
    // (plan 78 phase 3) the forearm's twist, elbow to hand, about its line; and how much of it is wrung at
    // the wrist itself — past the forearm's own twist bone, when the file has one
    const axis = m.bones[`wrist${S}`].position.clone().normalize();
    const tw = (q: any) => {
      const d = (2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w) * 180) / Math.PI;
      return ((d + 540) % 360) - 180;
    };
    const twist = tw(rel);
    const fb = kn[`forearm${S}`];
    const atWrist = fb && fb.position.lengthSq() > 1e-8 ? ((twist - tw(fb.quaternion) + 540) % 360) - 180 : twist;
    // the palm: which way it faces (its normal, out of the palm) — against the line to the other hand
    const oh = hand(S === "R" ? "L" : "R");
    const toOther = dir(h.wr.clone().lerp(h.fi, 0.5), oh.wr.clone().lerp(oh.fi, 0.5));
    // (the palm's side as the curl knows it, at rest in the hand's frame: straight fingers can't tell it)
    const palmOf = (H: string) => {
      const f0 = m.bones[`fingers${H}`].position.clone();
      const i0 = m.bones[`index${H}`].position.clone();
      const n0 = f0.clone().cross(i0.clone().sub(f0)).normalize();
      if (n0.dot(new V(0, 0, H === "R" ? 1 : -1).cross(kn[`fingers2${H}`].position)) < 0) n0.negate();
      return n0.applyQuaternion(m.bones[`wrist${H}`].getWorldQuaternion(new Q()));
    };
    const facing = deg(palmOf(S), toOther);
    // capsules: each finger's bones (and a tip on from its last), the palm
    const caps = (H: string) => {
      const out: [any, any, number][] = [];
      const hh = hand(H);
      out.push([hh.wr, hh.fi.clone().lerp(hh.ix, 0.5), 0.015]); // (the palm as thick as it is: it meets a head, a palm, face on)
      for (const j of ["fingers", "index", "thumb", ...(five ? ["ring", "little"] : [])]) {
        const a = W(`${j}${H}`);
        const b2 = W(`${j}2${H}`);
        const c = W(`${j}3${H}`);
        const tip = c.clone().add(dir(b2, c).multiplyScalar(0.022));
        out.push([a, b2, 0.009], [b2, c, 0.008], [c, tip, 0.007]);
      }
      return out;
    };
    const segDist = (p1: any, q1: any, p2: any, q2: any) => {
      // the closest points of two segments (Ericson)
      const d1 = q1.clone().sub(p1);
      const d2 = q2.clone().sub(p2);
      const r = p1.clone().sub(p2);
      const a = d1.dot(d1);
      const e = d2.dot(d2);
      const f2 = d2.dot(r);
      let s = 0;
      let tt = 0;
      const c = d1.dot(r);
      const bb = d1.dot(d2);
      const den = a * e - bb * bb;
      if (e < 1e-9) {
        // (the second a point: the head's middle)
        s = a < 1e-9 ? 0 : Math.max(0, Math.min(1, -c / a));
        return p1.clone().add(d1.multiplyScalar(s)).distanceTo(p2);
      }
      s = den > 1e-9 ? Math.max(0, Math.min(1, (bb * f2 - c * e) / den)) : 0;
      tt = (bb * s + f2) / e;
      if (tt < 0) {
        tt = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (tt > 1) {
        tt = 1;
        s = Math.max(0, Math.min(1, (bb - c) / a));
      }
      return p1
        .clone()
        .add(d1.multiplyScalar(s))
        .distanceTo(p2.clone().add(d2.multiplyScalar(tt)));
    };
    const mine = caps(S);
    // the thumb against its own hand: its last two bones (past the first's root, which meets the palm)
    // against the palm (wrist to each finger's base, and across the knuckles) and the other fingers' bones
    const t2w = W(`thumb2${S}`);
    const t3w = W(`thumb3${S}`);
    const tTip = t3w.clone().add(dir(t2w, t3w).multiplyScalar(0.026));
    const thumbCaps: [any, any, number][] = [
      [t2w.clone().lerp(t3w, 0.35), t3w, 0.009],
      [t3w, tTip, 0.008],
    ];
    const lastBase =
      kn[`little${S}`] && kn[`little2${S}`].position.lengthSq() > 1e-8 ? W(`little${S}`) : W(`fingers${S}`);
    const wrW = W(`wrist${S}`);
    const palmCaps: [any, any, number][] = [
      [wrW, W(`index${S}`), 0.013],
      [wrW, W(`fingers${S}`), 0.013],
      [wrW, lastBase, 0.012],
      [W(`index${S}`), lastBase, 0.012],
    ];
    for (const j of ["fingers", "index", ...(kn[`ring2${S}`]?.position.lengthSq() > 1e-8 ? ["ring", "little"] : [])]) {
      const a = W(`${j}${S}`);
      const b2 = W(`${j}2${S}`);
      const c = W(`${j}3${S}`);
      palmCaps.push([a, b2, 0.009], [b2, c, 0.008], [c, c.clone().add(dir(b2, c).multiplyScalar(0.022)), 0.007]);
    }
    // (plan 78 phase 5) the thing held, as the bench draws it: how deep the hand's bones go into it, and how
    // far the fingertips (and the thumb's pad) stand off its surface — a grip closes on its thing
    const heldNow = (window as any).__anim.held?.();
    let intoHeld = Number.NaN;
    let tipsOff = Number.NaN;
    if (heldNow && heldNow.key !== "bud") {
      const k = heldNow.key as string;
      // (its shape as the hands close on it: the bench's, chars/props.ts HELD_SHAPE)
      const sdf = (pw: any) => heldNow.gap(pw);
      const hands = k === "pad" || k === "phone2" || k === "photo2" ? ["L", "R"] : [k === "torch" ? "L" : "R"];
      intoHeld = 0;
      const offs: number[] = [];
      for (const H of hands) {
        // (the fingers' and the thumb's bones: the palm's stand-in is a hand-against-hand's, 2.2 cm round)
        for (const [a1, b1, r1] of caps(H).slice(1))
          for (let u = 0; u <= 1; u += 0.25) intoHeld = Math.max(intoHeld, r1 - sdf(a1.clone().lerp(b1, u)));
        // (each finger's nearest bone to it: a grip's fingers on its thing somewhere along them)
        for (const j of [
          "fingers",
          "index",
          ...(kn[`ring2${H}`]?.position.lengthSq() > 1e-8 ? ["ring", "little"] : []),
        ]) {
          const a = W(`${j}${H}`);
          const b2 = W(`${j}2${H}`);
          const c = W(`${j}3${H}`);
          const tip = c.clone().add(dir(b2, c).multiplyScalar(0.022));
          let mm = Number.POSITIVE_INFINITY;
          for (const [p0, p1, r] of [
            [a, b2, 0.009],
            [b2, c, 0.008],
            [c, tip, 0.007],
          ] as [any, any, number][])
            for (let u = 0; u <= 1; u += 0.25) mm = Math.min(mm, sdf(p0.clone().lerp(p1, u)) - r);
          offs.push(mm);
        }
      }
      tipsOff = offs.reduce((a, b) => a + Math.max(0, b), 0) / offs.length;
    }
    let thumbIn = 0;
    for (const [a1, b1, r1] of thumbCaps)
      for (const [a2, b2, r2] of palmCaps) thumbIn = Math.max(thumbIn, r1 + r2 - segDist(a1, b1, a2, b2));
    const other = caps(S === "R" ? "L" : "R");
    let intoHand = 0;
    for (const [a1, b1, r1] of mine)
      for (const [a2, b2, r2] of other) intoHand = Math.max(intoHand, r1 + r2 - segDist(a1, b1, a2, b2));
    // (the head as a head: narrower across than deep — 7.6 cm half-wide, 10 deep, 11.5 high — its middle 9 cm
    // over the head joint; a point's depth into it, along the way to its middle)
    const hq = m.bones.head.getWorldQuaternion(new Q());
    const head = W("head").add(new V(0, 0.09, 0.02).applyQuaternion(hq));
    const hqi = hq.clone().invert();
    const intoEll = (pt: any) => {
      const d = pt.clone().sub(head).applyQuaternion(hqi);
      const k = Math.hypot(d.x / 0.076, d.y / 0.115, d.z / 0.1);
      return k < 1e-6 ? 0.1 : (1 - k) * (d.length() / k);
    };
    let intoHead = 0;
    for (const [a1, b1, r1] of mine)
      for (let u = 0; u <= 1; u += 0.25) intoHead = Math.max(intoHead, intoEll(a1.clone().lerp(b1, u)) + r1);
    intoHead = Math.max(0, intoHead - 0.01);
    let intoTrunk = 0;
    const sp = W("spine");
    const ch = W("chest").add(new V(0, 0.08, 0));
    for (const [a1, b1, r1] of mine) intoTrunk = Math.max(intoTrunk, r1 + 0.12 - segDist(a1, b1, sp, ch));
    return {
      "fingers MCP": f.mcp,
      "fingers PIP": f.pip,
      "fingers DIP": f.dip,
      "index MCP": ix.mcp,
      "index PIP": ix.pip,
      "index DIP": ix.dip,
      ...(rg && lt ? { "ring MCP": rg.mcp, "ring PIP": rg.pip, "little MCP": lt.mcp, "little PIP": lt.pip } : {}),
      "sideways most °": Math.max(f.side, ix.side, rg?.side ?? 0, lt?.side ?? 0),
      "spread °": deg(f.prox, ix.prox),
      "thumb in °": (Math.asin(Math.max(-1, Math.min(1, tdir.dot(h.n)))) * 180) / Math.PI,
      "thumb pad to the index cm": pad,
      "wrist up/down °": upDown,
      "wrist side to side °": sideToSide,
      "forearm twist °": twist,
      "twist at the wrist °": atWrist,
      "palm to the other hand °": facing,
      "into the other hand cm": intoHand * 100,
      "into the head cm": intoHead * 100,
      "into the trunk cm": intoTrunk * 100,
      "thumb into its own hand cm": thumbIn * 100,
      "into the thing held cm": intoHeld * 100,
      "fingers off the thing held cm": tipsOff * 100,
    } as Record<string, number>;
  }, S)) as Record<string, number>;
  if (got.error) {
    console.log(`${label}: no knuckles (not the life body?)`);
    continue;
  }
  const real = { ...ALWAYS, ...(REAL[kind] ?? {}) };
  const bad: string[] = [];
  const line = Object.entries(got).map(([k, v]) => {
    const r = real[k];
    const ok = !r || Number.isNaN(v) || (v >= r[0] && v <= r[1]);
    if (!ok) bad.push(k);
    return `${k} ${v.toFixed(k.includes("cm") ? 1 : 0)}${ok ? "" : "✗"}`;
  });
  out += bad.length;
  console.log(
    `\n${label} (${clip} @${t}s, ${S}, ${kind}) — ${bad.length ? `${bad.length} out of range` : "all in range"}`,
  );
  console.log(`  ${line.join(" · ")}`);
}
console.log(`\n${out} out of range in all`);
await b.close();

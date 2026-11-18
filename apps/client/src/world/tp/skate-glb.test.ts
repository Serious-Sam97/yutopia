import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parkPieces, piecesOfThings, SKATE_FITS, TOWN_PARKS } from "@yutopia/shared/skate/parks";
import { PIECES, SkatePark } from "@yutopia/shared/skate/pieces";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Plan 104 (docs/plan/104-the-skate-again.md F6a): what's drawn is what's ridden — the parks' GLBs (built in Blender
// from the board's own profiles: tools/art/skate-parks, public/life/skate-parks/) read here as the game reads them
// (meshopt decoded, their nodes' transforms), and looked at straight down all over: the drawn riding face where the
// board's profile is (shared skate/pieces.ts SkatePark.topAt), to 6 mm; the build menu's kinds too.

const PUB = join(fileURLToPath(new URL(".", import.meta.url)), "../../../public/life/skate-parks");
const MAN = JSON.parse(readFileSync(join(PUB, "manifest.json"), "utf8"));
/** The riding faces' materials (the rest — sides, steel, framing — stands proud or under). */
const FACES = new Set(["masonite", "mastop", "deck", "plate", "conc", "conctop"]);

interface GltfJson {
  nodes: {
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    name?: string;
  }[];
  scenes: { nodes: number[] }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  materials: { name: string }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
    extensions?: {
      EXT_meshopt_compression?: {
        buffer: number;
        byteOffset?: number;
        byteLength: number;
        byteStride: number;
        count: number;
        mode: string;
        filter?: string;
      };
    };
  }[];
}

/** A GLB's meshes by material, in its own frame (its nodes' transforms applied), as one geometry each. */
async function readGlb(file: string): Promise<Map<string, BufferGeometry>> {
  await MeshoptDecoder.ready;
  const data = readFileSync(join(PUB, file));
  const jsonLen = data.readUInt32LE(12);
  const js = JSON.parse(data.subarray(20, 20 + jsonLen).toString("utf8")) as GltfJson;
  const binStart = 20 + jsonLen + 8;
  const bin = data.subarray(binStart, binStart + data.readUInt32LE(20 + jsonLen));
  const views = js.bufferViews.map((v) => {
    const mo = v.extensions?.EXT_meshopt_compression;
    if (!mo) return new Uint8Array(bin.buffer, bin.byteOffset + (v.byteOffset ?? 0), v.byteLength);
    const out = new Uint8Array(mo.count * mo.byteStride);
    const src = new Uint8Array(bin.buffer, bin.byteOffset + (mo.byteOffset ?? 0), mo.byteLength);
    MeshoptDecoder.decodeGltfBuffer(out, mo.count, mo.byteStride, src, mo.mode, mo.filter ?? "NONE");
    return out;
  });
  const acc = (i: number): Float32Array | Uint32Array => {
    const a = js.accessors[i];
    const v = views[a.bufferView];
    const n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const off = v.byteOffset + (a.byteOffset ?? 0);
    const buf = v.buffer.slice(off, off + n * (a.componentType === 5123 ? 2 : 4));
    if (a.componentType === 5126) return new Float32Array(buf);
    if (a.componentType === 5125) return new Uint32Array(buf);
    return Uint32Array.from(new Uint16Array(buf));
  };
  const out = new Map<string, { pos: number[]; idx: number[] }>();
  const walk = (ni: number, parent: Matrix4) => {
    const n = js.nodes[ni];
    const m = new Matrix4().compose(
      new Vector3(...((n.translation ?? [0, 0, 0]) as [number, number, number])),
      new Quaternion(...((n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
      new Vector3(...((n.scale ?? [1, 1, 1]) as [number, number, number])),
    );
    const w = parent.clone().multiply(m);
    if (n.mesh !== undefined)
      for (const p of js.meshes[n.mesh].primitives) {
        const name = js.materials[p.material ?? 0].name.split(".")[0];
        const pos = acc(p.attributes.POSITION) as Float32Array;
        const idx = p.indices !== undefined ? acc(p.indices) : Uint32Array.from(pos.keys()).slice(0, pos.length / 3);
        const o = out.get(name) ?? { pos: [], idx: [] };
        const base = o.pos.length / 3;
        const v = new Vector3();
        for (let i = 0; i < pos.length; i += 3) {
          v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(w);
          o.pos.push(v.x, v.y, v.z);
        }
        for (const k of idx) o.idx.push(base + k);
        out.set(name, o);
      }
    for (const c of n.children ?? []) walk(c, w);
  };
  for (const r of js.scenes[0].nodes) walk(r, new Matrix4());
  const geos = new Map<string, BufferGeometry>();
  for (const [k, o] of out) {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(o.pos), 3));
    g.setIndex(o.idx);
    geos.set(k, g);
  }
  return geos;
}

/** The riding faces of a GLB as one mesh, and what's hit straight down from `from` at (x, z). */
function faceMesh(geos: Map<string, BufferGeometry>): Mesh[] {
  return [...geos]
    .filter(([k]) => FACES.has(k))
    .map(([, g]) => new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })));
}
const ray = new Raycaster();
function hitAt(meshes: Mesh[], x: number, z: number, from: number): number | null {
  ray.set(new Vector3(x, from, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : null;
}

/** Points over a park's pieces, off their edges and copings (the steel stands proud there). */
function samples(park: SkatePark, x0: number, z0: number, x1: number, z1: number, step: number) {
  const out: { x: number; z: number; top: number }[] = [];
  for (let x = x0 + 0.013; x < x1; x += step)
    for (let z = z0 + 0.029; z < z1; z += step) {
      const t = park.topAt(x, z, 99);
      if (!t) continue;
      const pr = t.p.s.prof;
      const near = (l: number) => Math.abs(t.on.l - l) < 0.12;
      if (pr.copings.some(near) || pr.edges.some(near) || t.on.l < 0.02 || t.on.l > pr.total - 0.05) continue;
      if (Math.abs(pr.at(t.on.l).tz) > 0.97) continue;
      const s = t.p.s;
      const w = t.on.w;
      if (s.sweep === "line" && (w - s.w0 < 0.05 || s.w1 - w < 0.05)) continue;
      if (s.sweep === "turn" && (w - s.w0 < 0.01 || s.w1 - w < 0.01)) continue;
      // (off the ledges' and boxes' steel edges, the rails over a face)
      const ln = park.line(x, z, t.z, 0.1);
      if (ln) continue;
      out.push({ x, z, top: t.z });
    }
  return out;
}

test("the parks' GLBs: the drawn riding faces are the ridden profiles, to 6 mm", async () => {
  for (const p of TOWN_PARKS) {
    const entry = MAN.parks[p.key];
    assert.ok(entry, `${p.key}: in the manifest`);
    const [ox, oy, oz] = entry.origin as [number, number, number];
    assert.deepEqual([ox, oy, oz], [p.x0, p.h, p.z0], `${p.key}: its origin its plot's corner on its floor`);
    const meshes = faceMesh(await readGlb(entry.near.file));
    for (const m of meshes) m.position.set(ox, oy, oz);
    for (const m of meshes) m.updateMatrixWorld(true);
    const park = new SkatePark(parkPieces(p));
    const pts = samples(park, p.x0, p.z0, p.x1, p.z1, 0.37);
    assert.ok(pts.length > 300, `${p.key}: ${pts.length} points`);
    let bad = 0;
    let worst = 0;
    for (const q of pts) {
      const h = hitAt(meshes, q.x, q.z, q.top + 0.3);
      const want = q.top - p.h < 1e-6 ? q.top + 0.004 : q.top;
      const d = h === null ? Infinity : Math.abs(h - want);
      worst = Math.max(worst, d === Infinity ? 0 : d);
      if (d > 0.006) {
        bad++;
        if (bad < 6) console.log(p.key, q.x.toFixed(2), q.z.toFixed(2), h, want);
      }
    }
    console.log(`[skate glb] ${p.key}: ${pts.length} points, worst ${(worst * 1000).toFixed(2)} mm`);
    assert.equal(bad, 0, `${p.key}: ${bad} of ${pts.length} points off the profile`);
  }
});

test("the build menu's GLBs: each kind's riding face its piece's profile, in its footprint's frame", async () => {
  for (const [kind, f] of Object.entries(SKATE_FITS)) {
    const styles = MAN.kinds?.[kind];
    assert.ok(styles, `${kind}: in the manifest`);
    if (!PIECES[f.piece].surfaces.length) continue;
    const park = new SkatePark(piecesOfThings([{ kind, x: 0, y: 0, yaw: 0 }]));
    const pts = samples(park, 0, 0, f.w, f.h, 0.21);
    assert.ok(pts.length > 10, `${kind}: ${pts.length} points`);
    for (const style of Object.keys(styles)) {
      const meshes = faceMesh(await readGlb(styles[style].near.file));
      for (const q of pts) {
        const h = hitAt(meshes, q.x, q.z, q.top + 0.3);
        const want = q.top < 1e-6 ? 0.004 : q.top;
        assert.ok(
          h !== null && Math.abs(h - want) < 0.006,
          `${kind} ${style} at ${q.x}, ${q.z}: drawn ${h}, ridden ${q.top}`,
        );
      }
    }
  }
});

test("the parks' GLBs: in their budgets", () => {
  for (const [k, p] of Object.entries(MAN.parks) as [
    string,
    { near: { tris: number; bytes: number }; mid: { tris: number } },
  ][]) {
    assert.ok(p.near.tris < 160_000 && p.mid.tris < 30_000, `${k}: ${p.near.tris} / ${p.mid.tris} tris`);
    assert.ok(p.near.bytes < 3_000_000, `${k}: ${p.near.bytes} bytes`);
  }
  for (const w of ["in", "out"]) assert.ok(MAN.hall[w].near.tris < 60_000, `hall ${w}: ${MAN.hall[w].near.tris}`);
  assert.ok(MAN.hall.lights.length >= 12, "the hall's fittings");
});

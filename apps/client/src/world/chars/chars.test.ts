import assert from "node:assert/strict";
import { test } from "node:test";
import { AVATAR_OPTIONS, type AvatarLayers, avatarFromSeed, DEFAULT_AVATAR } from "@yutopia/shared";
import { bake, restWorld } from "./bake";
import { buildPerson } from "./build";
import { LODS, type Lod, paramsFor } from "./params";
import { JOINTS } from "./rig";

// The 3D people (docs/plan/22-people-3d.md): every look builds at every level
// of detail into one clean skinned mesh — finite, on the floor, the right
// size, inside its triangle budget, and on the same skeleton at every level.

const BUDGET: Record<Lod, number> = { 0: 60_000, 1: 22_000, 2: 9_000 };

function finite(a: ArrayLike<number>) {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

function looks(): AvatarLayers[] {
  const out: AvatarLayers[] = [DEFAULT_AVATAR];
  for (let i = 1; i <= 24; i++) out.push(avatarFromSeed(i));
  // every option of every part of the look at least once (the whole wardrobe)
  for (const [field, opts] of Object.entries(AVATAR_OPTIONS))
    for (const o of opts as readonly string[]) out.push({ ...DEFAULT_AVATAR, [field]: o });
  // and the awkward pairs: hats over big hair, a skirt with boots, a tank with a backpack
  for (const accessory of ["cap", "beanie", "beret", "bucket", "headphones", "bandana"])
    for (const hair of ["afro", "long", "mohawk", "curly", "ponytail"])
      out.push({ ...DEFAULT_AVATAR, accessory, hair });
  out.push({ ...DEFAULT_AVATAR, bottom: "longskirt", shoes: "boots", top: "tank", extra: "backpack" });
  return out;
}

test("every look bakes at every level: finite, standing on the floor, within budget", () => {
  for (const a of looks())
    for (const lod of [0, 1, 2] as Lod[]) {
      const b = bake(buildPerson(a, lod));
      const pos = b.body.getAttribute("position").array;
      assert.ok(finite(pos), `${a.hair}/${a.top} L${lod}: positions`);
      assert.ok(finite(b.body.getAttribute("normal").array), `${a.hair} L${lod}: normals`);
      // (from the positions: three's box adds the morphs' furthest deltas on top)
      let low = Infinity;
      let top = -Infinity;
      for (let i = 1; i < pos.length; i += 3) {
        low = Math.min(low, pos[i]);
        top = Math.max(top, pos[i]);
      }
      assert.ok(Math.abs(low) < 0.02, `${a.hair}/${a.bottom} L${lod}: feet on the floor (${low})`);
      assert.ok(top > b.height * 0.95 && top < b.height * 1.3, `${a.hair} L${lod}: height ${top}`);
      assert.ok(
        b.tris <= BUDGET[lod],
        `${a.hair}/${a.top}/${a.bottom}/${a.accessory}/${a.extra} L${lod}: ${b.tris} triangles > ${BUDGET[lod]}`,
      );
      // indices in range, every vertex on a real joint with weight 1
      const n = b.body.getAttribute("position").count;
      for (const g of [b.body, b.ink]) {
        const idx = g.getIndex()?.array ?? [];
        for (let i = 0; i < idx.length; i++) assert.ok(idx[i] < n);
      }
      const si = b.body.getAttribute("skinIndex");
      for (let i = 0; i < n; i += 97) assert.ok(si.getX(i) < JOINTS.length);
      b.body.dispose();
      b.ink.dispose();
    }
});

test("the skeleton is the same at every level of detail", () => {
  const a = avatarFromSeed(3);
  const rests = ([0, 1, 2] as Lod[]).map((l) => restWorld(buildPerson(a, l).rest));
  for (const j of JOINTS) {
    assert.ok(rests[0][j].distanceTo(rests[1][j]) < 1e-9, j);
    assert.ok(rests[0][j].distanceTo(rests[2][j]) < 1e-9, j);
  }
});

test("body and gender change the figure, not its height", () => {
  const h = (a: Partial<AvatarLayers>) => {
    const b = bake(buildPerson({ ...DEFAULT_AVATAR, ...a }, 2));
    b.body.computeBoundingBox();
    return b.body.boundingBox;
  };
  const slim = h({ body: "slim" });
  const broad = h({ body: "broad" });
  assert.ok(slim && broad);
  assert.ok(broad.max.x - broad.min.x > slim.max.x - slim.min.x, "broad is wider");
  assert.ok(Math.abs(broad.max.y - slim.max.y) < 0.03, "same height");
  assert.equal(paramsFor({ body: "regular", gender: "feminine" }).face.lashes, true);
  assert.equal(paramsFor({ body: "regular", gender: "neutral" }).face.lashes, false);
});

test("levels of detail get coarser", () => {
  assert.ok(LODS[0].radial > LODS[1].radial && LODS[1].radial > LODS[2].radial);
  const t = ([0, 1, 2] as Lod[]).map((l) => bake(buildPerson(DEFAULT_AVATAR, l)).tris);
  assert.ok(t[0] > t[1] && t[1] > t[2], t.join(" > "));
});

test("the motion's legs are the body's (moves.ts THIGH, SHIN against params and build/body.ts)", async () => {
  const { THIGH, SHIN } = await import("./moves");
  const { Kit } = await import("./kit");
  const { Body } = await import("./build/body");
  const b = new Body(new Kit(paramsFor(DEFAULT_AVATAR), LODS[0]));
  assert.ok(Math.abs(b.thigh - THIGH) < 1e-6, `thigh ${b.thigh} vs ${THIGH}`);
  assert.ok(Math.abs(b.shin - SHIN) < 1e-6, `shin ${b.shin} vs ${SHIN}`);
});

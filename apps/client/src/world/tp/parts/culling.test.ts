import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Frustum, Group, LOD, Matrix4, Mesh, PerspectiveCamera } from "three";
import { Culling, type CullingHost } from "./culling";

// Plan 111 — a piece made again in place (a kit cell a building joined) is boxed again: its old box was its first
// building's, and the whole cell went whenever that one was out of the camera's sight.

function cellWith(...xs: number[]): Group {
  const g = new Group();
  for (const x of xs) {
    const m = new Mesh(new BoxGeometry(4, 4, 4));
    m.position.set(x, 2, 0);
    g.add(m);
  }
  return g;
}

test("a kit cell grown after it was first boxed is boxed again", () => {
  const c = new Culling({} as CullingHost);
  c.matricesMade = false;
  const lod = new LOD();
  lod.addLevel(cellWith(0), 0);
  lod.updateMatrixWorld(true);
  const first = c.stillBox(lod);
  assert.ok(first);
  assert.ok(first.max.x < 3);
  // (a building joins far along it: its levels made again, the LOD where it was)
  for (const l of [...lod.levels]) lod.removeLevel(l.distance);
  lod.addLevel(cellWith(0, 40), 0);
  lod.updateMatrixWorld(true);
  // unbumped: the stale box (what made the cell vanish)
  assert.ok((c.stillBox(lod) as NonNullable<typeof first>).max.x < 3);
  lod.userData.cullV = 1;
  const again = c.stillBox(lod);
  assert.ok(again && again.max.x > 40);
  // (and a camera looking only at the new building sees the cell)
  const cam = new PerspectiveCamera(40, 1, 0.1, 500);
  cam.position.set(40, 2, 20);
  cam.lookAt(40, 2, 0);
  cam.updateMatrixWorld();
  const f = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
  );
  assert.ok(f.intersectsBox(again));
  assert.ok(!f.intersectsBox(first));
});

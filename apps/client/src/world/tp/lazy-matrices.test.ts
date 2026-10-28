import assert from "node:assert/strict";
import { test } from "node:test";
import { Box3, BoxGeometry, Group, Mesh, type Object3D, PerspectiveCamera, Scene } from "three";
import { type Gather, lazyMatrices, seal } from "./lazy-matrices";

// The lazy pass (Low and Lowest) makes the same world matrices as three's own, whatever moved:
// each frame of a run of moves, its matrices against a twin scene's, updated three's way.

function world(): { scene: Scene; all: Object3D[] } {
  const scene = new Scene();
  const all: Object3D[] = [];
  const geo = new BoxGeometry(1, 1, 1);
  const add = (parent: Object3D, o: Object3D) => {
    parent.add(o);
    all.push(o);
    return o;
  };
  for (let i = 0; i < 3; i++) {
    const g = add(scene, new Group());
    g.position.set(i * 5, 0, -i);
    for (let j = 0; j < 3; j++) {
      const m = add(g, new Mesh(geo));
      m.position.set(j, j * 0.5, 0);
      add(m, new Mesh(geo)).position.set(0, 1, 0);
    }
  }
  // a still one (its parts' matrices made once, by hand), and a camera (its own pass)
  const still = add(scene, new Group());
  still.position.set(-4, 0, 2);
  for (let j = 0; j < 2; j++) {
    const p = add(still, new Mesh(geo));
    p.position.set(j, 0, 1);
    p.updateMatrix();
    p.matrixAutoUpdate = false;
  }
  add(all[0], new PerspectiveCamera()).position.set(0, 2, 3);
  return { scene, all };
}

function close(a: Object3D, b: Object3D, what: string) {
  const x = a.matrixWorld.elements;
  const y = b.matrixWorld.elements;
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(x[i] - y[i]) < 1e-9, `${what}: element ${i}, ${x[i]} ≠ ${y[i]}`);
}

test("the lazy pass makes three's matrices, frame after frame", () => {
  const lazy = world();
  const ref = world();
  seal(lazy.all[lazy.all.length - 4]); // (the still group: nothing under it moves)
  const moves: ((w: { all: Object3D[] }) => void)[] = [
    () => {},
    (w) => w.all[0].position.set(1, 2, 3), // a group: everything under it
    (w) => {
      w.all[2].rotation.y = 0.7; // a leaf
    },
    (w) => w.all[4].scale.set(2, 1, 1),
    () => {}, // (nothing: all as it was)
    (w) => w.all[8].add(w.all[2]), // moved to another parent, the same place in it
    (w) => {
      // set by hand, not auto
      const o = w.all[5];
      o.matrixAutoUpdate = false;
      o.matrix.makeTranslation(3, 3, 3);
    },
    (w) => w.all[w.all.length - 4].position.set(0, 1, 0), // the still group moved: its parts with it
    (w) => w.all[1].removeFromParent(),
  ];
  for (const [i, move] of moves.entries()) {
    move(lazy);
    move(ref);
    lazyMatrices(lazy.scene);
    ref.scene.updateMatrixWorld();
    for (const [k, o] of lazy.all.entries()) close(o, ref.all[k], `move ${i}, object ${k}`);
  }
});

test("it gathers what's low enough under the root, shown", () => {
  const { scene, all } = world();
  const g: Gather = { root: all[0], below: 1.6, out: [] };
  lazyMatrices(scene, g);
  const got = g.out.filter((x) => !(x instanceof Box3));
  // (a mesh's box takes in its children: the first mesh, to 1.5 with its child, and that child;
  // the next tops out at 2. By identity — a failed deep compare prints three's whole scene)
  assert.equal(got.length, 2);
  assert.ok(got[0] === all[1] && got[1] === all[2]);
  all[1].visible = false;
  g.out.length = 0;
  lazyMatrices(scene, g);
  assert.equal(g.out.length, 0);
});

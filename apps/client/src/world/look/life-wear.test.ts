// Plan 73 phase 5 — the skin under what's worn: the cut rules as wear.py has them (its sample's numbers).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BufferAttribute, BufferGeometry } from "three";
import { bodyIndex, covers, roleOf, type WearLm, type WearSpec } from "./life-wear";

// (MakeHuman's decimetres: a man's landmarks, near enough)
const LM: WearLm = {
  hip: [0, 9.6, 0],
  waist: [0, 11.2, 0],
  crotch: [0, 8.7, 0],
  neck: [0, 14.6, -0.1],
  knee: [0, 5.1, 0.2],
  ankle: [0, 0.9, -0.2],
  brow: [0, 16.4, 0.7],
};
const TEE: WearSpec = { helper: "tights", sleeve: 0.42, hem: ["hip", -0.35], neck: 0.45, scoop: 0.35 };
const JEANS: WearSpec = { helper: "tights", legs: 1.96, top: ["waist", -0.25] };
const SKIRT: WearSpec = { helper: "skirt", hem: ["knee", 0.6], top: ["waist", -0.25] };
const SNEAKERS: WearSpec = { below: ["ankle", 0.15] };
const [TORSO, ARM, LEG, HEAD] = [0, 1, 3, 5];

describe("covers", () => {
  it("a tee: the chest and the upper arm, not the forearm, the neck or the head", () => {
    assert.equal(covers(TEE, TORSO, 0, 12, 0.5, 1.6, LM), true);
    assert.equal(covers(TEE, ARM, 0.1, 13, 0, 3, LM), true);
    assert.equal(covers(TEE, ARM, 0.8, 11, 0, 4, LM), false);
    // (in the neck's hole — high and near its axis — and its front scoop)
    assert.equal(covers(TEE, TORSO, 0, 14.4, 0, 0.6, LM), false);
    assert.equal(covers(TEE, TORSO, 0, 13.6, 1, 0.8, LM), false);
    // (out on the shoulders, as high: covered)
    assert.equal(covers(TEE, TORSO, 0, 14.4, 0, 1.8, LM), true);
    assert.equal(covers(TEE, HEAD, 0, 16, 0, 0.5, LM), false);
  });
  it("jeans: the legs to the ankle, the hips under the waistband; not the chest", () => {
    assert.equal(covers(JEANS, LEG, 1.5, 3, 0, 2, LM), true);
    assert.equal(covers(JEANS, LEG, 1.9, 1.1, 0, 2, LM), false);
    assert.equal(covers(JEANS, TORSO, 0, 10, 0, 1.5, LM), true);
    assert.equal(covers(JEANS, TORSO, 0, 12, 0, 1.5, LM), false);
  });
  it("a skirt hides the hips, not the legs; shoes the feet", () => {
    assert.equal(covers(SKIRT, TORSO, 0, 9.5, 0, 1.5, LM), true);
    assert.equal(covers(SKIRT, LEG, 0.5, 7, 0, 2, LM), false);
    assert.equal(covers(SNEAKERS, LEG, 2.1, 0.3, 0, 2, LM), true);
    assert.equal(covers(SNEAKERS, LEG, 1.6, 2.5, 0, 2, LM), false);
  });
  it("a dress's skirt counts", () => {
    const dress: WearSpec = {
      ...TEE,
      hem: ["hip", 0.25],
      skirt: { helper: "skirt", top: ["hip", 0.5], hem: ["knee", 0.35] },
    };
    assert.equal(covers(dress, TORSO, 0, 9.0, 0, 1.5, LM), true);
  });
});

describe("bodyIndex", () => {
  it("drops the triangles with any vertex covered; under the own outfit when asked", () => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(15), 3));
    // two triangles: one on the chest (covered by the tee), one on the face (a vertex of it under the
    // file's own outfit, +8)
    const w = [TORSO, 0, 12, TORSO, 0, 12.2, HEAD, 0, 16, HEAD, 0, 16.2, HEAD + 8, 0, 16.1];
    g.setAttribute("_wear", new BufferAttribute(new Float32Array(w), 3));
    g.setAttribute("_neck", new BufferAttribute(new Float32Array([0, 1.5, 0, 1.5, 0, 0.3, 0, 0.3, 0, 0.3]), 2));
    g.setIndex([0, 1, 2, 2, 3, 4]);
    assert.deepEqual(bodyIndex(g, [TEE], LM, false), [2, 3, 4]);
    assert.deepEqual(bodyIndex(g, [], LM, true), [0, 1, 2]);
    assert.equal(bodyIndex(new BufferGeometry(), [TEE], LM, false), null);
  });
});

describe("roleOf", () => {
  it("names what a piece is coloured as", () => {
    assert.equal(roleOf("wear-tee"), "top");
    assert.equal(roleOf("wear-jeans"), "bottom");
    assert.equal(roleOf("wear-skirt"), "bottom");
    assert.equal(roleOf("wear-boots"), "shoes");
    assert.equal(roleOf("wear-hair-long-cards"), "hair");
    assert.equal(roleOf("wear-beard-beard"), "hair");
    assert.equal(roleOf("beanie"), "hat");
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { AVATAR_OPTIONS, avatarFromSeed, DEFAULT_AVATAR, parseAvatar } from "./avatar.ts";

test("looks: new slots default, old glasses and walkmans move to their own slots", () => {
  const plain = parseAvatar({ hair: "curly" });
  assert.equal(plain.shoes, "sneakers");
  assert.equal(plain.eyewear, "none");
  assert.equal(plain.extra, "none");
  // saved before eyewear / extra had slots
  const glasses = parseAvatar({ ...DEFAULT_AVATAR, accessory: "glasses", accessoryColor: "#3d4a5c" });
  assert.equal(glasses.accessory, "none");
  assert.equal(glasses.eyewear, "glasses");
  assert.equal(glasses.eyewearColor, "#3d4a5c");
  const walkman = parseAvatar(JSON.stringify({ accessory: "walkman", accessoryColor: "#e8a33d" }));
  assert.equal(walkman.accessory, "none");
  assert.equal(walkman.extra, "walkman");
  // a look that already chose its eyewear keeps it
  const both = parseAvatar({ accessory: "glasses", eyewear: "sunglasses" });
  assert.equal(both.eyewear, "sunglasses");
  // bad values fall back
  assert.equal(parseAvatar({ shoesColor: "brown", shoes: "<boots>" }).shoesColor, DEFAULT_AVATAR.shoesColor);
  assert.equal(parseAvatar({ shoes: "<boots>" }).shoes, "sneakers");
});

test("seeded looks use every slot and stay the same for the same seed", () => {
  const a = avatarFromSeed(42);
  assert.deepEqual(a, avatarFromSeed(42));
  for (const k of ["shoes", "eyewear", "extra", "accessory", "top", "bottom", "hair"] as const)
    assert.ok((AVATAR_OPTIONS[k] as readonly string[]).includes(a[k]), `${k}: ${a[k]}`);
});

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

test("one style: City-pop looks (old tokens, old tabs) come out Ligne claire", () => {
  assert.deepEqual(AVATAR_OPTIONS.style, ["ligne"]);
  assert.equal(DEFAULT_AVATAR.style, "ligne");
  assert.equal(parseAvatar({ style: "citypop", hair: "bob" }).style, "ligne");
  assert.equal(parseAvatar({ style: "citypop", hair: "bob" }).hair, "bob");
  assert.equal(parseAvatar({}).style, "ligne");
  // bots keep the rest of the look they had before City-pop went (pinned seed)
  const bot = avatarFromSeed(7);
  assert.equal(bot.style, "ligne");
  assert.deepEqual(
    { hair: bot.hair, top: bot.top, gender: bot.gender, eyewear: bot.eyewear, shoes: bot.shoes },
    { hair: "curly", top: "dress", gender: "feminine", eyewear: "none", shoes: "sneakers" },
  );
});

test("facial hair: its own slot, none for looks saved before it; bots keep their looks", () => {
  assert.deepEqual(AVATAR_OPTIONS.beard, ["none", "stubble", "mustache", "goatee", "full"]);
  assert.equal(parseAvatar({ hair: "crew" }).beard, "none");
  assert.equal(parseAvatar({ beard: "goatee", hair: "crew" }).beard, "goatee");
  assert.equal(parseAvatar({ beard: "<b>" }).beard, "none");
  for (const h of ["crew", "slick", "spiky"]) assert.ok((AVATAR_OPTIONS.hair as readonly string[]).includes(h));
  // every bot: a beard only on a masculine figure, and the hair drawn from the styles bots always had
  for (let s = 1; s <= 200; s++) {
    const a = avatarFromSeed(s);
    if (a.gender !== "masculine") assert.equal(a.beard, "none");
    assert.ok(!["crew", "slick", "spiky"].includes(a.hair));
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CAR_COLOURS } from "../lot.ts";
import { HOME_CARS } from "./homes.ts";
import {
  bodyVariants,
  buyLook,
  extrasOf,
  lookFor,
  lookTo,
  nearestColour,
  PALETTE,
  seededLook,
  startLook,
  VARIANTS,
  validLook,
  variantSpec,
  variantsOf,
  wheelsOf,
} from "./look.ts";
import { BUYABLE } from "./own.ts";
import { type CarKind, SEATS_OF, SPECS } from "./specs.ts";

// docs/plan/92-the-cars.md (F10b, F13b): every car's look — a variant of its body, its paint, extras and
// wheels — seeded from its id when nobody chose one, and a chosen one checked.

test("every seeded look is one its kind may have, the same for the same car", () => {
  for (const kind of Object.keys(SPECS) as CarKind[])
    for (let i = 0; i < 60; i++) {
      const id = `car-${kind}-${i}`;
      const a = seededLook(id, kind, { variant: i % 9 });
      assert.deepEqual(seededLook(id, kind, { variant: i % 9 }), a, "deterministic");
      assert.ok(validLook(kind, a), `${kind} ${JSON.stringify(a)} valid`);
    }
});

test("the home cars: the police a GL in black and white, the taxis yellow, the farm's pickup a flatbed", () => {
  for (const h of HOME_CARS) {
    const l = lookFor(h.id, h.model, { variant: h.colour, wagon: h.wagon, role: h.role });
    assert.ok(variantsOf(h.model).includes(l.variant), `${h.id}: ${l.variant}`);
    if (h.wagon) assert.ok(l.variant.startsWith("estate"), `${h.id} a wagon: an estate`);
    if (h.role === "police") assert.equal(l.variant, "saloon-gl");
    if (h.role === "taxi") assert.equal(l.colour, 0xe2b42a);
  }
  assert.equal(lookFor("farm-pickup", "pickup").variant, "pickup-flatbed");
});

test("a chosen look: kept when it fits, refused when it doesn't", () => {
  const ok = { variant: "hatch-hot", colour: 0x22385e, extras: ["spots"], wheels: "sport" };
  assert.deepEqual(validLook("hatch", ok), ok);
  assert.deepEqual(lookFor("x", "hatch", { look: ok }), ok);
  assert.equal(validLook("hatch", { ...ok, variant: "saloon-gl" }), null, "another body's variant");
  assert.equal(validLook("hatch", { ...ok, extras: ["bullbar"] }), null, "an extra that doesn't fit");
  assert.equal(validLook("hatch", { ...ok, wheels: "offroad" }), null, "off-road wheels on a hatch");
  assert.equal(validLook("hatch", { ...ok, colour: -1 }), null);
  assert.equal(validLook("hatch", { ...ok, colour2: 0xffffff }), null, "a second colour where it has no line");
  assert.ok(validLook("offroad", { variant: "4x4-long", colour: 1, colour2: 2, extras: [], wheels: "offroad" }));
});

test("each variant's numbers stand the car where its model is", () => {
  for (const [v, d] of Object.entries(VARIANTS)) {
    const s = variantSpec(d.kind, v);
    assert.equal(s.front, d.geom.front, v);
    assert.equal(s.wheel.r, d.geom.r, v);
    assert.ok(s.front > 0 && s.front < s.wheelbase, `${v}: its CoG between its axles`);
    assert.ok(s.body.ahead > s.front && s.body.behind > s.wheelbase - s.front, `${v}: its wheels inside its box`);
    for (const e of extrasOf(v)) assert.ok(["roofrack", "skibox", "bullbar", "spots", "flaps", "chains"].includes(e));
    assert.ok(wheelsOf(v).includes(d.wheels), `${v}: its own wheels allowed`);
  }
  assert.equal(SEATS_OF.van.at.length, 8, "the minibus's eight");
});

test("MOTORS: each buyable kind offers its own body's variants, and a look from the panel is checked", () => {
  for (const kind of BUYABLE) {
    const vs = bodyVariants(kind);
    assert.ok(vs.length === 1 || vs.length === 3, `${kind}: ${vs}`);
    for (const v of vs) {
      const look = startLook(kind, { variant: v, colour: PALETTE[3], extras: [], wheels: wheelsOf(v)[0] });
      assert.equal(look.variant, v);
      assert.deepEqual(buyLook(kind, look), look, `${kind} ${v}`);
    }
  }
  assert.deepEqual(bodyVariants("sedan"), ["saloon-base", "saloon-gl", "saloon-sport"], "a saloon's: no estates");
  const ok = { variant: "van-camper", colour: PALETTE[4], colour2: PALETTE[0], extras: ["flaps"], wheels: "turbine" };
  assert.deepEqual(buyLook("van", ok), ok);
  assert.equal(buyLook("van", { ...ok, colour: 0x123456 }), null, "a colour off the palette");
  assert.equal(buyLook("van", { ...ok, colour2: 0x123456 }), null, "a second colour off the palette");
  assert.equal(buyLook("sedan", { ...ok, variant: "estate-gl" }), null, "another body's (an estate isn't a saloon)");
  assert.equal(buyLook("van", { ...ok, extras: ["skibox"] }), null, "an extra that doesn't fit the camper");
  assert.equal(buyLook("van", "nonsense"), null);
  assert.equal(
    buyLook("toboggan", { variant: "toboggan", colour: PALETTE[2], extras: [], wheels: "steel" })?.variant,
    "toboggan",
  );
});

test("a look carried to another variant keeps what fits", () => {
  const a = { variant: "hatch-hot", colour: PALETTE[5], extras: ["spots", "flaps"], wheels: "sport" };
  const b = lookTo(a, "hatch-gl");
  assert.equal(b.variant, "hatch-gl");
  assert.equal(b.colour, a.colour);
  assert.deepEqual(b.extras, ["flaps"], "the spots don't fit a GL");
  assert.ok(buyLook("hatch", b), "still one the panel may send");
  const c = lookTo({ ...b, colour2: PALETTE[0] }, "hatch-base");
  assert.equal(c.colour2, undefined, "no second colour's line on the base");
});

test("a paint's nearest lot colour is its own when it's one of the nine", () => {
  for (const [i, c] of CAR_COLOURS.entries()) assert.equal(nearestColour(c), i);
});

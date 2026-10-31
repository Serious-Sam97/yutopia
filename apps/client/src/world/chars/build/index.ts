import type { AvatarLayers } from "@yutopia/shared";
import { Vector3 } from "three";
import { Kit } from "../kit";
import { LODS, type Lod, type Params, paramsFor } from "../params";
import { buildBeard } from "./beard";
import { Body } from "./body";
import { buildBottom } from "./bottoms";
import { buildExtra } from "./extras";
import { buildEyewear } from "./eyewear";
import { buildHair, hairCrown, hairSide } from "./hair";
import { buildHead, jawLine } from "./head";
import { buildHeadwear, HATS, hatLine } from "./headwear";
import { buildShoes } from "./shoes";
import { buildTop, LONG_SLEEVES } from "./tops";

/** Build one person's parts (not yet merged: `bake.ts` does that). */
export function buildPerson(a: AvatarLayers, lod: Lod, params?: Params): Kit {
  const k = new Kit(params ?? paramsFor(a), LODS[lod]);
  const b = new Body(k);
  // skin that clothes cover all of isn't built (legs in trousers, arms in long sleeves)
  const trousers = a.top !== "dress" && ["jeans", "trousers", "cargo", "joggers"].includes(a.bottom);
  b.build(a.skin, { legs: trousers && a.shoes !== "sandals", arms: LONG_SLEEVES.has(a.top) });
  const hat = HATS.has(a.accessory);
  // ears hide under long hair, a big afro, a beanie and headphones
  const earsShow =
    !(a.hair === "bob" || a.hair === "long" || a.hair === "curly" || a.hair === "afro") &&
    a.accessory !== "beanie" &&
    a.accessory !== "headphones";
  buildHead(k, a.skin, earsShow);
  buildBeard(k, a.beard ?? "none", a.hairColor, a.skin);
  const backY = 0.85 * b.T;
  buildHair(k, a.hair, a.hairColor, {
    backZ: b.trunk.r(backY) * b.depthAt(backY),
    tieColor: a.accessoryColor,
    hat,
    hatLine: hatLine(a.accessory),
  });
  buildHeadwear(k, a.accessory, a.accessoryColor, hairCrown(k, a.hair), hairSide(k, a.hair));
  buildEyewear(k, a.eyewear, a.eyewearColor);
  buildBottom(k, b, a);
  // (the top rides the trunk as the body under it does, by height: bake.ts's skin weights)
  buildTop(k, b, a);
  buildShoes(k, b, a);
  buildExtra(k, b, a.extra, a.extraColor, { earsShow, skin: a.skin });
  jawLine(k);
  // (the phone at the ear sits on whatever covers it: long hair, an afro, headphones)
  const cover = Math.max(
    earsShow ? 0 : hairSide(k, a.hair),
    a.accessory === "headphones" ? 0.1 * k.hh : a.accessory === "beanie" ? 0.03 * k.hh : 0,
  );
  anchors(k, b, cover);
  return k;
}

// The wrist targets for the right hand (the left one mirrors them): the
// phone at the ear, a mug at the mouth, a hand to the chin, on the chest, on
// the belly. Model space, standing at rest.
function anchors(k: Kit, b: Body, cover: number) {
  const hh = b.hh;
  // (the head joint: at the chin, forward of the trunk's axis as far as the neck's root is: body.ts)
  const head = new Vector3(0, b.chinY, k.p.head.neckBack * hh * k.p.head.neckFwd);
  const hs = k.head;
  const f = k.p.face;
  const at = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];
  const earY = (f.eyeY - 0.04) * hh;
  const ear = new Vector3(-(hs.R(earY) * k.p.head.width + 0.03 * hh + cover), earY - 0.24 * hh, 0.04 * hh);
  k.anchors.ear = at(ear.add(head));
  const mouth = hs.front(0, f.mouthY * hh);
  k.anchors.mouth = at(new Vector3(-0.05 * hh, f.mouthY * hh - 0.26 * hh, mouth.p.z + 0.16 * hh).add(head));
  const chin = hs.front(0, 0.04 * hh);
  k.anchors.chin = at(new Vector3(-0.02 * hh, -0.2 * hh, chin.p.z + 0.06 * hh).add(head));
  const eyeY = f.eyeY * hh;
  k.eye = [0, eyeY, hs.front(0, eyeY).p.z - 0.02];
  // (the right ear, −x, as the earrings sit: a little above the lobe, on whatever covers it)
  const budY = (f.eyeY - 0.04) * hh - f.ears * hh * 0.3;
  k.ear = [-(hs.R(budY) * k.p.head.width * 0.97 + 0.004 * hh + cover * 0.6), budY, 0];
  const chest = b.surf(0, 0.74 * b.T, 1.05);
  k.anchors.chest = at(new Vector3(-0.06 * hh, b.torsoBot + 0.74 * b.T - 0.1 * hh, chest.z + 0.12 * hh));
  const belly = b.surf(0, 0.45 * b.T, 1.05);
  k.anchors.belly = at(new Vector3(-0.1 * hh, b.torsoBot + 0.45 * b.T - 0.08 * hh, belly.z + 0.08 * hh));
}

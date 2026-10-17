import { type HeldKind, heldState, isHeld } from "@yutopia/shared";
import { Container, Graphics, Matrix, Sprite } from "pixi.js";
import type { Motion } from "./art/avatar-motion";
import type { Aff, PartName, Pose } from "./art/avatar-rig";
import type { AvatarRig } from "./art/avatar-svg";
import { HELD_BOX, MUG_COLORS } from "./art/held";
import type * as PeopleChunk from "./art/people";
import { heldTexture, phoneTexture, RIG_PX, rigPartTexture } from "./art/textures";
import type { viewFor } from "./art/views";
import type { AvatarState } from "./engine";

// People drawn as the vector rig in iso (avatar-svg.ts / avatar-rig.ts): one
// sprite per part, posed every frame by the 2D Motion, with what's in the
// hand. Since the 3D people (world/chars) this is the fallback where WebGL
// can't draw them, so it rides the people chunk instead of the world page.

type People = typeof PeopleChunk;

/** What the engine knows that the rig needs this frame. */
export interface RigAt {
  reduced: boolean;
  time: number;
  night: number;
  low: boolean; // Low quality
  act: { what: string; t: number; len: number } | null;
  typing: boolean;
}

/** The engine's person as the rig sees it. */
export interface RigPerson {
  state: AvatarState;
  rig?: RigView;
  rigNext?: RigView;
  motion?: Motion;
  local: boolean;
  root: Container;
  sprite: Sprite;
}

// A person drawn as a rig: one sprite per part, posed every frame.
export interface RigView {
  key: string;
  def: AvatarRig;
  root: Container;
  sprites: Map<PartName, Sprite>;
  held?: Sprite; // what's in the right hand
  steam?: Graphics; // …and the steam off it
  phone?: Sprite; // the phone, when it's out
  glow?: Graphics; // its screen's light at night
}

const RIG_M = new Matrix(); // scratch for posing rig parts

// A steady 0..1 from a string (who someone is → their own rhythm).
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// A person as a rig: the parts for this look, view and seat (a new view
// waits for its parts to decode while the last one keeps moving), posed by
// their Motion. False while nothing's ready to draw.
export function drawRig(
  e: RigAt,
  v: RigPerson,
  view: ReturnType<typeof viewFor>["view"],
  mirror: boolean,
  sitting: boolean,
  look: string,
  dt: number,
  dist: number,
  walking: boolean,
  lift: number,
  P: People,
): boolean {
  const s = v.state;
  const key = `${look}|${view}|${sitting ? 1 : 0}`;
  let want = v.rig?.key === key ? v.rig : v.rigNext?.key === key ? v.rigNext : undefined;
  if (!want) {
    if (v.rigNext) dropRig(v.rigNext);
    want = makeRig(v, key, P.avatarRig(s.avatar, view, sitting));
    v.rigNext = want;
  }
  if (want !== v.rig && rigReady(want)) {
    if (v.rig) dropRig(v.rig);
    v.rig = want;
    v.rigNext = undefined;
  }
  const r = v.rig;
  v.motion ??= new P.Motion(seedOf(s.name + (v.local ? "me" : "")));
  const held = isHeld(s.held) && s.heldAt && !s.phone ? { kind: s.held, since: Date.now() - s.heldAt } : null;
  const pose = v.motion.update(r?.def ?? want.def, dt, {
    held,
    phone: s.phone || s.ringing ? { state: s.phone ?? "", pose: s.phonePose ?? "", ringing: !!s.ringing } : null,
    busy: s.busy ?? "",
    act: e.act,
    dist,
    walking,
    speed: dt > 0 ? dist / dt : 0,
    typing: e.typing,
    speaking: s.speaking,
    emote: s.emote,
    reduced: e.reduced,
  });
  if (!r) return false;
  const def = r.def;
  const b = P.bones(def, pose);
  P.drawOrder(def, pose).forEach((part, i) => {
    const sp = r.sprites.get(part.name);
    if (!sp) return;
    sp.zIndex = i;
    const head = part.name === "head";
    const face = head && !def.back ? pose.face : undefined;
    const tex = head
      ? (rigPartTexture(r.key, part, face, face ? def.heads[face] : def.heads.open) ??
        rigPartTexture(r.key, part, def.back ? undefined : "open", def.heads.open))
      : rigPartTexture(r.key, part);
    if (tex) sp.texture = tex;
    sp.visible = !!tex;
    // the part's box, at RIG_PX texture px per board unit, moved by its bone
    const m: Aff = P.mul(b[part.name], [1 / RIG_PX, 0, 0, 1 / RIG_PX, part.box[0], part.box[1]]);
    sp.setFromMatrix(RIG_M.set(m[0], m[1], m[2], m[3], m[4], m[5]));
  });
  drawHeld(e, P, r, s, pose, b, held);
  drawPhone(e, P, r, s, b);
  r.root.visible = true;
  r.root.pivot.set(60, 168);
  r.root.scale.set((mirror ? -1 : 1) * P.FIT * def.squash, P.FIT);
  r.root.position.set(0, lift + 2 + (sitting ? P.SIT_DROP * P.FIT : 0));
  return true;
}

// The thing in the right hand: at the hand, upright (tipped towards the mouth
// while sipping), in front of the body (behind it, seen from the back), with
// a little steam while it's hot.
function drawHeld(
  e: RigAt,
  P: People,
  r: RigView,
  s: AvatarState,
  _pose: Pose,
  b: Record<PartName, Aff>,
  held: { kind: HeldKind; since: number } | null,
) {
  if (!held) {
    if (r.held) r.held.visible = false;
    r.steam?.clear();
    return;
  }
  const st = heldState(held.kind, held.since);
  const color = MUG_COLORS[Math.floor(seedOf(s.name) * MUG_COLORS.length)];
  const tex = heldTexture(held.kind, color, Math.round(st.level * 4));
  if (!r.held || !r.steam) {
    r.held = new Sprite();
    r.steam = new Graphics();
    r.root.addChild(r.held, r.steam);
  }
  const sp = r.held;
  if (tex) sp.texture = tex;
  sp.visible = !!tex;
  const def = r.def;
  const hand = P.apply(b.armRf, def.joints.hand);
  const up = P.sipEnv(st.sip);
  const tip = (def.side ? -38 : -22) * up;
  const k = 1 / RIG_PX;
  const rad = (tip * Math.PI) / 180;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  // the grip (0, 0) of the drawing at the hand; its box, scaled to board units
  const m: Aff = [c * k, sn * k, -sn * k, c * k, 0, 0];
  const at = P.apply(m, [HELD_BOX[0] * RIG_PX, HELD_BOX[1] * RIG_PX]);
  sp.setFromMatrix(RIG_M.set(m[0], m[1], m[2], m[3], hand[0] + at[0], hand[1] + at[1]));
  const armZ = r.sprites.get("armRf")?.zIndex ?? 50;
  const torsoZ = r.sprites.get("torso")?.zIndex ?? 40;
  sp.zIndex = def.back ? torsoZ - 0.5 : armZ + 0.5;
  sp.tint = r.sprites.get("torso")?.tint ?? 0xffffff;
  // steam: two wisps rising off a hot mug (not mid-sip, not from behind)
  const g = r.steam;
  g.clear();
  g.zIndex = sp.zIndex + 0.1;
  if (st.level > 0.4 && up === 0 && !def.back && !e.reduced) {
    const t = e.time;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.7 + i * 0.5) % 1;
      const x0 = hand[0] - 2.5 + i * 2;
      const y0 = hand[1] - 12 - ph * 9;
      const sway = Math.sin(t * 3 + i * 2) * 1.6;
      g.moveTo(x0, y0)
        .quadraticCurveTo(x0 + sway, y0 - 3, x0 - sway * 0.5, y0 - 6)
        .stroke({ width: 1.1, color: 0xffffff, alpha: 0.42 * (1 - ph) });
    }
  }
}

// The phone in the hand (shared/phone.ts): which face this view sees, tilted
// as the pose holds it; its lit screen glows a little once it's dark.
function drawPhone(e: RigAt, P: People, r: RigView, s: AvatarState, b: Record<PartName, Aff>) {
  if (!s.phone) {
    if (r.phone) r.phone.visible = false;
    if (r.glow) r.glow.visible = false;
    return;
  }
  const def = r.def;
  const grip = P.phoneGrip(def, s.phone);
  const col = P.phoneColors(s.phoneCase);
  const tex = phoneTexture(`${col[0]}|${grip.face}`, () => P.phoneSvg(col, grip.face), P.PHONE_BOX);
  if (!r.phone || !r.glow) {
    r.phone = new Sprite();
    r.glow = new Graphics();
    r.glow.blendMode = "add";
    r.root.addChild(r.glow, r.phone);
  }
  const sp = r.phone;
  if (tex) sp.texture = tex;
  sp.visible = !!tex;
  const hand = P.apply(b.armRf, def.joints.hand);
  const k = (1 / (RIG_PX * 2)) * grip.scale;
  const rad = (grip.tilt * Math.PI) / 180;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  const m: Aff = [c * k, sn * k, -sn * k, c * k, 0, 0];
  const at = P.apply(m, [P.PHONE_BOX[0] * RIG_PX * 2, P.PHONE_BOX[1] * RIG_PX * 2]);
  sp.setFromMatrix(RIG_M.set(m[0], m[1], m[2], m[3], hand[0] + at[0], hand[1] + at[1]));
  const armZ = r.sprites.get("armRf")?.zIndex ?? 50;
  const torsoZ = r.sprites.get("torso")?.zIndex ?? 40;
  // at the ear, from behind: behind the head; held out in front: over the arm
  sp.zIndex = def.back && s.phone !== "selfie" ? torsoZ - 0.5 : armZ + 0.5;
  sp.tint = grip.face === "screen" ? 0xffffff : (r.sprites.get("torso")?.tint ?? 0xffffff);
  const g = r.glow;
  g.clear();
  const lit = e.night > 0.15 && s.phone !== "call" && !e.low;
  const rec = !!s.recording && Math.floor(e.time * 2) % 2 === 0;
  g.visible = lit || rec;
  if (rec) {
    // recording: a red light on the phone, blinking
    g.circle(hand[0] - 1.5, hand[1] - 13, 2.2).fill({ color: 0xff2030, alpha: 1 });
    g.circle(hand[0] - 1.5, hand[1] - 13, 5).fill({ color: 0xff2030, alpha: 0.35 });
    g.zIndex = sp.zIndex + 0.2;
  }
  if (lit) {
    // the screen's light: on the face (front views) or round the hand
    const a = Math.min(0.5, e.night * 0.6);
    const cx = grip.face === "back" ? hand[0] + 2 : hand[0];
    const cy = hand[1] - 8;
    g.circle(cx, cy, 16).fill({ color: 0xff5ab0, alpha: a * 0.25 });
    g.circle(cx, cy, 9).fill({ color: 0xc89bff, alpha: a * 0.35 });
    if (!def.back) {
      const head = P.apply(b.head, def.joints.mouth);
      g.ellipse(head[0], head[1] - 6, 11, 9).fill({ color: 0xd890ff, alpha: a * 0.3 });
    }
    g.zIndex = sp.zIndex + 0.2;
  }
}

function makeRig(v: RigPerson, key: string, def: AvatarRig): RigView {
  const root = new Container();
  root.sortableChildren = true;
  root.visible = false;
  const sprites = new Map<PartName, Sprite>();
  for (const p of def.parts) {
    const sp = new Sprite();
    sp.visible = false;
    root.addChild(sp);
    sprites.set(p.name, sp);
  }
  v.root.addChildAt(root, v.root.getChildIndex(v.sprite));
  return { key, def, root, sprites };
}

// all of a rig's parts decoded (and the faces it blinks and talks with asked for)
function rigReady(r: RigView): boolean {
  let ok = true;
  for (const p of r.def.parts) {
    if (p.name === "head") {
      if (!rigPartTexture(r.key, p, r.def.back ? undefined : "open", r.def.heads.open)) ok = false;
      if (!r.def.back) {
        rigPartTexture(r.key, p, "blink", r.def.heads.blink);
        rigPartTexture(r.key, p, "talk", r.def.heads.talk);
      }
    } else if (!rigPartTexture(r.key, p)) ok = false;
  }
  return ok;
}

function dropRig(r: RigView) {
  r.root.destroy({ children: true }); // the textures belong to the cache
}

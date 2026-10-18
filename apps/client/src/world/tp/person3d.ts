import { type HeldKind, heldState, isHeld, isSocial, SOCIAL_MS } from "@yutopia/shared";
import {
  CircleGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Ray,
  RingGeometry,
  type Vector3,
} from "three";
import type { chars } from "../art/chars-load";
import { MUG_COLORS } from "../art/held";
import { phoneColors } from "../art/phone-art";
import { ZPX } from "./kit3d";
import type { PersonIn } from "./people3d";

type Chars = NonNullable<ReturnType<typeof chars>>;
type Model = InstanceType<Chars["PersonModel"]>;
type Prop = ReturnType<Chars["buildProp"]>;
type MotionOut = ReturnType<InstanceType<Chars["Motion3"]>["update"]>;

// A person in 3D (docs/plan/22-people-3d.md, P4): their Ligne claire model
// (world/chars), posed every frame by the same motion layers as the 2D people,
// lit by the room's light map, sitting on real seat heights, holding real
// things. Vortex stays his drawing (people3d.ts): he must look exactly like
// Yondra's.

// Where a sitter's hips rest, iso px of height (as people3d.ts): each seat's
// cushion top less what it gives.
const SEAT_HIP: Record<string, number> = { chair: 14, armchair: 13.5, sofa: 15.2, beanbag: 11, bench: 11.2 };
const SIT_IN = 0.3; // s: sitting down / getting up
const SEAT_BACK = 0.06; // tiles: the hips sit this far back of the seat's middle (the knees reach its front)
const PICK_R = 0.26; // tiles: how wide a person is to a click

export interface Mats {
  body: Material;
  bodyAway: Material;
  ink: Material;
  inkAway: Material;
  /** a held thing's flat colours, lit by the room */
  prop: (color: string) => Material;
  /** a pet toy in the hand (the pets chunk makes those), when it's loaded */
  toy?: (kind: string) => Object3D | null;
}

export interface Seen {
  camX: number;
  camZ: number;
  onScreen: boolean;
  lowQuality: boolean;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class Person3D {
  readonly root = new Group();
  readonly model: Model;
  private motion: InstanceType<Chars["Motion3"]>;
  private turned: number | null = null;
  private last: { x: number; y: number } | null = null;
  private sitW: number | null = null;
  private ring: Mesh;
  private shadow: Mesh;
  private held: { key: string; kind: string; prop: Prop | null; toy: Object3D | null } | null = null;
  private phone: { key: string; prop: Prop } | null = null;
  private actKey = "";
  private actSeen = 0;
  private due = 0; // motion time not stepped yet (off screen, far away)
  private away = false;
  private jumpH = 0; // off the floor (a jump), tiles
  private jumpOn = false;
  private headUp = 0; // the head's height standing as they last stood (the tag stays over it through a flip)
  /** what posed them last (first person's hands take mine from here) */
  motionOut: MotionOut | null = null;

  constructor(
    readonly id: string,
    private C: Chars,
    factory: InstanceType<Chars["CharFactory"]>,
    private mats: Mats,
    p: PersonIn,
    /** "arms": only shoulder to fingertips — my own, in front of my eyes (hands1p.ts) */
    readonly part: "all" | "arms" = "all",
  ) {
    this.model = new C.PersonModel(
      factory,
      p.avatar,
      part === "arms" ? 0 : 1,
      { body: mats.body, ink: mats.ink },
      part,
    );
    this.motion = new C.Motion3(hashSeed(p.name || id));
    this.root.add(this.model.root);
    this.shadow = new Mesh(
      new CircleGeometry(0.26, 24),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.root.add(this.shadow);
    this.ring = new Mesh(
      new RingGeometry(0.3, 0.36, 40),
      new MeshBasicMaterial({ color: 0xffb43c, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.006;
    this.root.add(this.ring);
  }

  get ready() {
    return this.model.ready;
  }

  /** Step and pose them; `given` poses them with someone else's motion (my hands with my body's). */
  update(p: PersonIn, dt: number, seen: Seen, given?: MotionOut) {
    const sitting = p.a === 2;
    // detail by distance (low quality never builds the closest level)
    const d = Math.hypot(seen.camX - p.x, seen.camZ - p.y);
    let lod: 0 | 1 | 2 = d < 3.5 ? 0 : d < 11 ? 1 : 2;
    if (seen.lowQuality && lod === 0) lod = 1;
    if (this.model.avatar !== p.avatar || this.model.lod !== lod) this.model.set(p.avatar, lod);
    this.model.update(d);

    // the facing turns smoothly (others only send 8 directions)
    if (this.turned === null) this.turned = p.angle;
    let dA = p.angle - this.turned;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    this.turned += dA * Math.min(1, dt * 14);
    // (my hands in first person are placed by hands1p.ts)
    if (this.part === "all") this.root.rotation.y = Math.PI / 2 - this.turned;

    // sitting down / getting up eases the hips onto the cushion
    if (this.sitW === null || p.reduced) this.sitW = sitting ? 1 : 0;
    else this.sitW = Math.max(0, Math.min(1, this.sitW + (sitting ? dt : -dt) / SIT_IN));
    const w = this.sitW * this.sitW * (3 - 2 * this.sitW);
    const back = -SEAT_BACK * w;
    // off the floor (in a jump, up on something): the shadow and the ring stay on what's under them
    const jump = !sitting ? (p.jump ?? null) : null;
    const h = sitting ? 0 : (p.z ?? 0);
    const ground = Math.min(h, sitting ? 0 : (p.ground ?? 0));
    if (this.part === "all")
      this.root.position.set(p.x + Math.cos(this.turned) * back, h, p.y + Math.sin(this.turned) * back);
    this.jumpH = h;
    this.jumpOn = !!jump;
    this.shadow.position.y = 0.004 + ground - h;
    this.shadow.scale.setScalar(1 / (1 + (h - ground) * 1.6));
    this.ring.position.y = 0.006 + ground - h;

    // the motion: stepped every frame on screen, caught up when it comes back
    let dist = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;
    if (dist > 1.5) dist = 0;
    this.last = { x: p.x, y: p.y };
    this.due += dt;
    if (!given && !seen.onScreen && this.due < 0.5) return;
    const step = Math.min(this.due, 0.1);
    this.due = 0;
    const held =
      isHeld(p.held) && p.heldAt && !p.phone ? { kind: p.held as HeldKind, since: Date.now() - p.heldAt } : null;
    const mo =
      given ??
      this.motion.update(step, {
        dist,
        walking: p.a === 1,
        speed: step > 0 ? dist / step : 0,
        sit: sitting,
        typing: !!p.typing && sitting,
        speaking: !!p.speaking,
        emote: p.emote ?? "",
        reduced: !!p.reduced,
        held,
        busy: p.busy ?? "",
        act: this.actOf(p),
        phone: p.phone || p.ringing ? { state: p.phone ?? "", pose: p.phonePose ?? "", ringing: !!p.ringing } : null,
        jump,
      });
    this.motionOut = mo;
    const seatY = (SEAT_HIP[p.seat ?? ""] ?? 14) / ZPX;
    const drop = this.model.sitDrop(seatY) * w;
    this.model.setPose(mo.pose, [mo.lift[0], mo.lift[1] + drop, mo.lift[2]], mo.reach);
    this.model.setFace(mo.blink, mo.talk);

    this.props(p, held, mo.sip);
    // away: faded, like iso
    const away = p.status === "away";
    if (away !== this.away) {
      this.away = away;
      this.model.setMaterials(away ? this.mats.bodyAway : this.mats.body, away ? this.mats.inkAway : this.mats.ink);
    }
    // the blob shadow when the sun casts none; the speaking ring pulses
    this.shadow.visible = seen.lowQuality && !sitting && this.part === "all";
    this.ring.visible = !!p.speaking && this.part === "all";
    if (this.ring.visible)
      (this.ring.material as MeshBasicMaterial).opacity = p.reduced
        ? 0.7
        : 0.55 + Math.sin(performance.now() / 83) * 0.25;
  }

  // what's in the right hand: a drink (its level going down sip by sip), a toy, the phone
  private props(p: PersonIn, held: { kind: HeldKind; since: number } | null, sip: number) {
    const hand = this.model.bone("wristR");
    // the drink or toy
    const key = held ? `${held.kind}` : "";
    if ((this.held?.key ?? "") !== key) {
      this.dropHeld();
      if (held && hand) {
        const kind = held.kind as string;
        if (kind === "mug" || kind === "cup" || kind === "soda") {
          const color =
            kind === "mug"
              ? MUG_COLORS[Math.floor(hashSeed(p.name) * MUG_COLORS.length)]
              : kind === "soda"
                ? "#c4402b"
                : "#efe4cc";
          const prop = this.C.buildProp(kind, color, this.mats.prop);
          this.C.inHand(prop.root, kind);
          hand.add(prop.root);
          this.held = { key, kind, prop, toy: null };
        } else {
          const toy = this.mats.toy?.(kind) ?? null;
          if (toy) {
            this.C.inHand(toy as Group, "toy");
            hand.add(toy);
          }
          this.held = { key, kind, prop: null, toy };
        }
      }
    }
    if (held && this.held?.prop) {
      this.held.prop.setLevel?.(heldState(held.kind, held.since).level);
      // upright, however the wrist turns; tipped to the mouth for a sip
      this.C.keepUpright(this.held.prop.root, this.held.kind as "mug", this.root, sip * 1.05);
    }
    // the phone in its case
    const phoneKey = p.phone ? `${p.phoneCase ?? "walnut"}` : "";
    if ((this.phone?.key ?? "") !== phoneKey) {
      this.dropPhone();
      if (phoneKey && hand) {
        const prop = this.C.buildProp("phone", phoneColors(p.phoneCase)[0], this.mats.prop);
        this.C.inHand(prop.root, "phone");
        hand.add(prop.root);
        this.phone = { key: phoneKey, prop };
      }
    }
    if (this.phone?.prop.rec)
      this.phone.prop.rec.visible = !!p.recording && Math.floor(performance.now() / 500) % 2 === 0;
  }

  private dropHeld() {
    if (!this.held) return;
    this.held.prop?.root.removeFromParent();
    this.held.prop?.dispose();
    this.held.toy?.removeFromParent();
    this.held = null;
  }
  private dropPhone() {
    if (!this.phone) return;
    this.phone.prop.root.removeFromParent();
    this.phone.prop.dispose();
    this.phone = null;
  }

  // A move with someone (shared SOCIAL): what, and how far into it.
  private actOf(p: PersonIn): { what: string; t: number; len: number } | null {
    if (!p.act) {
      this.actKey = "";
      return null;
    }
    const key = `${p.act}|${p.actAt}`;
    if (this.actKey !== key) {
      this.actKey = key;
      this.actSeen = performance.now();
    }
    const kind = p.act === "take" ? "give" : p.act;
    const len = (isSocial(kind) ? SOCIAL_MS[kind] : 1500) / 1000;
    return { what: p.act, t: (performance.now() - this.actSeen) / 1000, len };
  }

  /** How far along `ray` it meets this person (a standing capsule), or null. */
  hitDistance(ray: Ray): number | null {
    if (!this.root.visible || !this.model.ready) return null;
    const x = this.root.position.x;
    const z = this.root.position.z;
    const h = this.tagY() - 0.25;
    // closest approach between the ray and the person's upright axis
    const o = ray.origin;
    const d = ray.direction;
    const wx = o.x - x;
    const wz = o.z - z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) {
      return Math.hypot(wx, wz) < PICK_R && o.y > 0 ? Math.max(0, o.y - h) : null;
    }
    const t = -(wx * d.x + wz * d.z) / a;
    if (t < 0) return null;
    const px = wx + d.x * t;
    const pz = wz + d.z * t;
    const y = o.y + d.y * t;
    if (Math.hypot(px, pz) > PICK_R || y < 0 || y > h) return null;
    return t;
  }

  /** The name tag's height: over the head (seated too; in a jump, up with them — over where the head
   *  was standing, as a flip turns them over). */
  tagY(): number {
    if (!this.model.ready) return 2.0;
    const head = this.model.jointPosition("head").y;
    if (!this.jumpOn) this.headUp = head;
    return this.jumpH + Math.max(head, this.jumpOn ? this.headUp : 0) + 0.46;
  }

  /** A hand, in the world (game pads, the photo flash). */
  hand(side: "L" | "R" = "R"): Vector3 {
    const v = this.model.jointPosition(`wrist${side}`);
    return this.root.localToWorld(v);
  }

  dispose() {
    this.dropHeld();
    this.dropPhone();
    this.model.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as Material).dispose();
    this.root.removeFromParent();
  }
}

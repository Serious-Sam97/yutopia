import { type HeldKind, heldState, isHeld, isSocial, SOCIAL_MS } from "@yutopia/shared";
import {
  BoxGeometry,
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
  /** the shadowed, wrapped in the dark (docs/plan/30-the-dark.md D5) */
  shade?: Material;
  shadeInk?: Material;
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
  // how they've been moving (smoothed): the velocity, the speed and its change, the feet
  private vx = 0;
  private vy = 0;
  private spd = 0;
  private acc = 0;
  private turnRate = 0;
  private lastH = 0;
  private vz = 0;
  private wasUp = false;
  private sitW: number | null = null;
  private ring: Mesh;
  private shadow: Mesh;
  private held: { key: string; kind: string; prop: Prop | null; toy: Object3D | null } | null = null;
  private phone: { key: string; prop: Prop } | null = null;
  private actKey = "";
  private actSeen = 0;
  private due = 0; // motion time not stepped yet (off screen, far away)
  private away = false;
  private dark = false;
  private crawlPh = 0;
  private downW = 0;
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
    const turnBy = dA * Math.min(1, dt * 14);
    this.turned += turnBy;
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
    let dx = this.last ? p.x - this.last.x : 0;
    let dy = this.last ? p.y - this.last.y : 0;
    let dist = Math.hypot(dx, dy);
    if (dist > 1.5) dist = dx = dy = 0;
    this.last = { x: p.x, y: p.y };
    // how they move (docs/plan/29-the-move.md M6), from where they've been: the velocity in
    // their own frame, the turn, the speed's change, the feet leaving and meeting the ground
    if (dt > 0) {
      const a = 1 - Math.exp(-dt * 12);
      this.vx += (dx / dt - this.vx) * a;
      this.vy += (dy / dt - this.vy) * a;
      const spd = Math.hypot(this.vx, this.vy);
      this.acc += ((spd - this.spd) / dt - this.acc) * a;
      this.spd = spd;
      this.turnRate += (turnBy / dt - this.turnRate) * a;
      this.vz += ((h - this.lastH) / dt - this.vz) * Math.min(1, dt * 20);
    }
    this.lastH = h;
    const up = !!jump || h > ground + 0.03;
    const landed = this.wasUp && !up ? Math.min(1, Math.max(0, -this.vz) / 10.5) : undefined;
    this.wasUp = up;
    this.due += dt;
    if (!given && !seen.onScreen && this.due < 0.5) return;
    const step = Math.min(this.due, 0.1);
    this.due = 0;
    const fc = Math.cos(this.turned);
    const fs = Math.sin(this.turned);
    const mv = p.mv ?? 0;
    const held =
      isHeld(p.held) && p.heldAt && !p.phone ? { kind: p.held as HeldKind, since: Date.now() - p.heldAt } : null;
    const mo =
      given ??
      this.motion.update(step, {
        dist,
        walking: p.a === 1,
        speed: this.spd,
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
        loco: {
          ahead: this.vx * fc + this.vy * fs,
          left: this.vx * fs - this.vy * fc,
          crouch: (mv & 8) !== 0,
          aim: (mv & 16) !== 0,
          gun: !!p.gun,
          pitch: p.pitch ?? 0,
          yaw: 0,
          turn: this.turnRate,
          accel: this.acc,
          up,
          landed,
          verb: this.C.verbAt(p.verb, performance.now()),
        },
      });
    this.motionOut = mo;
    // one of the shadowed: its own arms, back and head over the walk
    let pose = p.shade ? this.C.blend(mo.pose, this.C.shadePose(p.shade.pose, p.shade.t, p.shade.seed), 1) : mo.pose;
    let lift = mo.lift;
    // one of the day's, asleep in its nest: squatting, folded over its knees (docs/plan/31-the-day.md)
    if (p.shade?.pose === "lurk") {
      const m = this.C.lurkPose(p.shade.t, p.shade.seed);
      pose = this.C.blend(pose, m.pose, 1);
      lift = m.lift;
    }
    // down: on hands and knees, crawling as they go; by someone down, kneeling (D7)
    if (p.down) {
      this.crawlPh = (this.crawlPh + dist / 0.45) % 1;
      const m = p.down === "down" ? this.C.crawlPose(this.crawlPh) : this.C.kneelPose();
      this.downW = Math.min(1, this.downW + step * 4);
      pose = this.C.blend(pose, m.pose, this.downW);
      lift = [lift[0] + (m.lift[0] - lift[0]) * this.downW, lift[1] + (m.lift[1] - lift[1]) * this.downW, lift[2]];
    } else this.downW = 0;
    const seatY = (SEAT_HIP[p.seat ?? ""] ?? 14) / ZPX;
    const drop = this.model.sitDrop(seatY) * w;
    this.model.setPose(pose, [lift[0], lift[1] + drop, lift[2]], mo.reach);
    this.model.setFace(mo.blink, mo.talk);

    this.props(p, held, mo.sip);
    // away: faded, like iso
    const away = p.status === "away";
    // (the shadowed: dark while their shield holds; bare — their office clothes — exposed)
    const dark = !!p.shade && p.shade.dark > 0.5 && !!this.mats.shade;
    if (away !== this.away || dark !== this.dark) {
      this.away = away;
      this.dark = dark;
      if (dark) this.model.setMaterials(this.mats.shade as Material, this.mats.shadeInk ?? this.mats.ink);
      else
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
    this.gunFrame(p, hand);
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
  // the gun in the right hand (docs/plan/30-the-dark.md D6): a few boxes along the hand's
  // way out of the fist (−y in the wrist's frame), the sights on its back
  private gun: { key: string; root: Group } | null = null;
  private gunFrame(p: PersonIn, hand: Object3D | null) {
    const key = p.gun ?? "";
    if ((this.gun?.key ?? "") === key) return;
    if (this.gun) {
      this.gun.root.removeFromParent();
      for (const m of this.gun.root.children) (m as Mesh).geometry.dispose();
      this.gun = null;
    }
    if (!key || !hand) return;
    const root = new Group();
    const metal = this.mats.prop("#2e3238");
    const wood = this.mats.prop("#5b3a26");
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material) => {
      const b = new Mesh(new BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      root.add(b);
    };
    if (key === "shotgun") {
      box(0.035, 0.62, 0.035, 0, -0.26, 0.05, metal); // the barrels
      box(0.05, 0.2, 0.05, 0, -0.02, 0.045, wood); // the fore-end
      box(0.05, 0.28, 0.07, 0, 0.16, 0.02, wood); // the stock, back along the arm
    } else {
      box(0.026, 0.16, 0.026, 0, -0.13, 0.05, metal); // the barrel
      box(0.05, 0.055, 0.05, 0, -0.04, 0.05, metal); // the cylinder
      box(0.03, 0.03, 0.09, 0, 0.0, 0.01, wood); // the grip, in the fist
    }
    root.position.set(0, -0.05, 0);
    hand.add(root);
    this.gun = { key, root };
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

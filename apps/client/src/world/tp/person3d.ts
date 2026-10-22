import { type HeldKind, heldState, isHeld, isSocial, SOCIAL_MS } from "@yutopia/shared";
import { AIM_BLADE, BEAM } from "@yutopia/shared/beam";
import {
  CircleGeometry,
  Color,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  type Ray,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { chars } from "../art/chars-load";
import { MUG_COLORS } from "../art/held";
import { phoneColors } from "../art/phone-art";
import { type GunFx, type GunKind, type GunModel, gunModel, poseGun, shellGeometry } from "./guns3d";
import { ZPX } from "./kit3d";
import type { PersonIn } from "./people3d";

type Chars = NonNullable<ReturnType<typeof chars>>;
type Model = InstanceType<Chars["PersonModel"]>;
const snowA = new Vector3();
const snowB = new Vector3();
const snowC = new Vector3();
const snowQ = new Quaternion();
const snowQ2 = new Quaternion();
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

const gq = new Quaternion();
const hu = new Vector3();
const hs = new Vector3();
const hp = new Vector3();
const ht = new Vector3();
const hb = new Vector3();
const hq = new Vector3();
const hv = new Vector3();
const hx = new Vector3();
const hw = new Vector3();
const hf = new Vector3();
const gx = new Vector3();
const gy = new Vector3();
const gz = new Vector3();
const gm = new Matrix4();
// the gun's frame (x along the barrel, y up, z right) into the wrist's (the barrel −y, up +z)
const GUN_IN_WRIST = new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0));

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// shot down, burning away (deathPose): the outline gone, the body lit from within
const NO_INK = new MeshBasicMaterial({ visible: false });
const DARK = new Color(0x0c0d10);
const HOT = new Color(3, 2.9, 2.6); // the shot's flash, through it
const BURN = new Color(1.3, 0.94, 0.54); // pale gold
const ASH = new Color(0.62, 0.58, 0.54);
const ramp = (x: number, a: number, b: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const tq = new Quaternion();
const tv = new Vector3();
const tv2 = new Vector3();

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
  private burning: MeshBasicMaterial | null = null;
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
          reload: (this.gunFx?.reload ?? 0) > 0.3,
          torch: !!p.torch && !p.phone && !p.shade,
          pitch: p.pitch ?? 0,
          // (aiming, bladed: the shoulders and the arms twist back along the look, left of the body)
          yaw: (mv & 16) !== 0 ? AIM_BLADE : 0,
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
    // shot down: it dies (staggers, drops to its knees, folds over onto the snow)
    const dying = p.shade?.state === "dissolve" && p.shade.killed ? p.shade.t : -1;
    if (p.shade && dying >= 0) {
      const m = this.C.deathPose(dying, p.shade.seed);
      pose = this.C.blend(mo.pose, m.pose, 1);
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
    this.gunHands(p, step);
    this.model.setFace(mo.blink, mo.talk);

    this.props(p, held, mo.sip);
    // away: faded, like iso
    const away = p.status === "away";
    // (the shadowed: dark while their shield holds; bare — their office clothes — exposed)
    const dark = !!p.shade && p.shade.dark > 0.5 && !!this.mats.shade;
    const burnt = dying >= 0 && !!this.mats.shade;
    if (!burnt && this.burning) {
      this.burning.dispose();
      this.burning = null;
      this.dark = !dark; // (its own materials back)
    }
    if (burnt) this.burn(dying);
    else if (away !== this.away || dark !== this.dark) {
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

  // dying: white-hot as the shot goes through, dark again as it staggers, then lit from
  // within, pale gold, as it goes down — and burning out to nothing on the snow
  private burn(t: number) {
    if (!this.burning) {
      // (one colour all over, not the clothes': a figure of light, not someone lit)
      const m = new MeshBasicMaterial({ transparent: true });
      this.burning = m;
    }
    const m = this.burning;
    const base = DARK;
    const flash = 1 - ramp(t, 0, 0.18);
    const glow = ramp(t, 0.45, 1.25);
    const out = ramp(t, 1.15, 1.95);
    m.color.copy(base).lerp(BURN, glow).lerp(ASH, out).lerp(HOT, flash);
    m.opacity = 1 - out;
    this.model.setMaterials(m, NO_INK);
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
    // aiming: the gun along the look too, whatever the wrist is doing (its barrel's −y)
    // (held in both hands — the hands placed by gunHands: the gun along the way it set)
    if (this.gun && this.gunDirOn && this.gunHandsW > 0.3) this.aimGun(this.gun.root, this.gunDir);
    else if (this.gun && ((p.mv ?? 0) & 16) !== 0) this.aimGun(this.gun.root, this.lookDir(p, tv2));
    else this.gun?.root.quaternion.identity();
    if (this.gun) this.gunMoves(this.gun);
    this.gripOnFore();
    this.budFrame(p);
    this.torchFrame(p);
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
  // the gun in the right hand (docs/plan/32-the-arms.md): its model (tp/guns3d.ts) turned into the
  // wrist's frame — the barrel along the hand's way out of the fist (−y), its top to the back of
  // the hand (+z) — the grip in the fist
  private gun: { key: string; root: Group; model: GunModel } | null = null;
  private gunFrame(p: PersonIn, hand: Object3D | null) {
    const key = p.gun ?? "";
    if ((this.gun?.key ?? "") === key) return;
    this.dropGun();
    if (!key || !hand) return;
    const root = new Group();
    const kind: GunKind = key === "shotgun" ? "shotgun" : "revolver";
    // (in front of my eyes: every bevel; anyone else's, a few thousand triangles)
    const model = gunModel(kind, this.mats.prop("vertex"), this.part === "arms" ? "near" : "far");
    poseGun(model, kind, { cock: 1 });
    const inner = model.root;
    inner.quaternion.setFromRotationMatrix(GUN_IN_WRIST);
    inner.position
      .set(...model.grip.at)
      .applyQuaternion(inner.quaternion)
      .negate();
    inner.position.z += 0.01;
    root.add(inner);
    root.position.set(0, -0.05, 0);
    // (a little larger than life, as our people's hands are)
    root.scale.setScalar(kind === "shotgun" ? 1.2 : 1.4);
    hand.add(root);
    this.gun = { key, root, model };
  }

  /** What the gun's doing (docs/plan/32-the-arms.md), mine as Arms says (`gunFx`): the hammer,
   *  the cylinder, the gate or the barrels, the rounds; a shot's kick back along the arm and up;
   *  reloading, tipped up and turned in. Without it, at rest — cocked while aiming. */
  gunFx: GunFx | null = null;
  private gunMoves(gun: { key: string; root: Group; model: GunModel }) {
    const kind: GunKind = gun.key === "shotgun" ? "shotgun" : "revolver";
    const fx = this.gunFx;
    poseGun(gun.model, kind, fx ?? { cock: 1 });
    gun.root.position.set(0, -0.05, 0);
    if (!fx) return;
    if (fx.kick > 0) {
      // (back: the root's +y; up: the barrel's −y turned toward its top, +z)
      gun.root.position.add(
        tv2.set(0, fx.kick * (kind === "shotgun" ? 0.06 : 0.035), 0).applyQuaternion(gun.root.quaternion),
      );
      gun.root.rotateX(-fx.kick * (kind === "shotgun" ? 0.22 : 0.3));
    }
    // reloading: the muzzle up and the gun rolled in, its side (the gate, the breech) to me
    // (the double-barrel's reload is the hands' — gunHands)
    if (fx.reload > 0 && kind === "revolver") gun.root.rotateX(-fx.reload * 0.7).rotateY(-fx.reload * 0.9);
  }

  // The hands where the gun's held (docs/plan/32-the-arms.md), after the body's pose — by the arms'
  // IK, so they stay on it walking and running:
  // - the revolver aimed: the left hand cupped round the right on the grip (the torch on: its wrist
  //   under the right instead, back to back, the beam along the barrel);
  // - the double-barrel, heavy, always in both hands: the right on the grip, the left under the
  //   fore-end (with the torch there too). Aimed: shouldered, along the look. Carried (heavy): the butt
  //   against the right side of the chest, the gun across the body, the muzzle ahead and left, a little
  //   down — walking and running too (running, a touch closer in).
  //   Reloading: under the right arm, the muzzle at the ground, broken open — the left hand to the
  //   pocket for a shell and back to the breech, one after another.
  // The gun's way (`L` rad left of the body's facing, `P` up) and the butt's drop below the right
  // shoulder are eased between them.
  private gunHandsW = 0;
  private gunWay = { L: 0, P: 0, drop: 0, fwd: 0, in: 0, turn: 0 };
  private gunDir = new Vector3();
  private gunDirOn = false;
  private loadT = 0; // s into a double-barrel's reload
  private foreW = 0; // the left hand under the double-barrel's fore-end (gripOnFore), this much
  private shellInHand: Mesh | null = null;
  private gunHands(p: PersonIn, dt: number) {
    const gun = this.gun;
    const aiming = !!p.gun && ((p.mv ?? 0) & 16) !== 0;
    const shotgun = p.gun === "shotgun";
    const loading = shotgun && !aiming && (this.gunFx?.reload ?? 0) > 0.3;
    const want = gun && (shotgun || aiming) && !p.down ? 1 : 0;
    this.gunHandsW += (want - this.gunHandsW) * (1 - Math.exp(-dt * 14));
    const w = this.gunHandsW;
    this.loadT = loading ? this.loadT + dt : 0;
    if (this.shellInHand) this.shellInHand.visible = false;
    this.gunDirOn = false;
    this.foreW = 0;
    if (w < 0.01 || !gun) return;
    // the gun's way and the butt's drop, by what's being done
    const run = Math.max(0, Math.min(1, (this.spd - 3.6) / 1.4));
    // (`fwd`, `in`: the butt that far ahead of the shoulder, and in toward the chest)
    const to = aiming
      ? { L: AIM_BLADE, P: p.pitch ?? 0, drop: 0, fwd: 0, in: 0 }
      : loading
        ? { L: 0.45, P: -0.3, drop: 0.22, fwd: 0, in: 0 }
        : shotgun
          ? // carried, heavy: the butt against the right side of the chest, the gun across the body —
            // the muzzle ahead and to the left, a little down (and the gun turned further left in the
            // hands: gunWay.turn); running, a touch closer in
            { L: 0.7 - 0.1 * run, P: -0.22 + 0.06 * run, drop: 0.13 - 0.03 * run, fwd: -0.05, in: 0.03 }
          : { L: 0, P: 0, drop: 0, fwd: 0, in: 0 };
    const k = 1 - Math.exp(-dt * 10);
    const gw = this.gunWay;
    gw.L += (to.L - gw.L) * k;
    gw.P += (to.P - gw.P) * k;
    gw.drop += (to.drop - gw.drop) * k;
    gw.fwd += (to.fwd - gw.fwd) * k;
    gw.in += (to.in - gw.in) * k;
    gw.turn += ((aiming || loading || !shotgun ? 0 : 0.4) - gw.turn) * k;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(tq);
    // the way the hands hold it (`d`); the gun itself turned `turn` further left in them (carried:
    // across the body, the hands where they were)
    const c = Math.cos(gw.P);
    const d = hw.set(Math.sin(gw.L) * c, Math.sin(gw.P), Math.cos(gw.L) * c).applyQuaternion(tq);
    const gl = gw.L + gw.turn;
    this.gunDir.set(Math.sin(gl) * c, Math.sin(gw.P), Math.cos(gl) * c).applyQuaternion(tq);
    this.gunDirOn = true;
    const up = hu.set(0, 1, 0).addScaledVector(d, -d.y);
    if (up.lengthSq() < 1e-6) up.set(0, 0, 1).applyQuaternion(tq);
    up.normalize();
    // (sizes: the gun's model metres times the hand's scale; the body's, the person's own)
    const gs = gun.root.getWorldScale(hs).x;
    const body = gs / (shotgun ? 1.2 : 1.4);
    if (shotgun) {
      // the butt: in the right shoulder's pocket, dropped below it as carried
      this.model.bone("shoulderR")?.getWorldPosition(hp);
      hp
        .addScaledVector(d, 0.02 * gs)
        .addScaledVector(hv.set(0, 0, 1).applyQuaternion(tq), gw.fwd * body)
        .addScaledVector(hv.set(1, 0, 0).applyQuaternion(tq), gw.in * body).y -= gw.drop * body;
      // from the butt: the grip 0.30 along and 0.045 up, the fore-end's underside 0.535 along, 0.07 up
      ht.copy(hp)
        .addScaledVector(d, (0.301 - 0.05) * gs)
        .addScaledVector(up, 0.045 * gs);
      this.model.reachTo("R", ht, w, [-1, -0.25, -0.15]);
      // the left: reloading, to the pocket and the breech; else under the fore-end — of the gun as
      // it ends up turned in the hand, so once it's turned (gripOnFore, after aimGun)
      if (this.loadT > 0) {
        this.loadHand(hp, d, up, gs, body, tq);
        this.model.reachTo("L", ht, w, [-0.5, -1, 0.2]);
      } else this.foreW = w;
      return;
    }
    const wrist = this.model.bone("wristR");
    if (!wrist) return;
    wrist.getWorldPosition(hp);
    if (p.torch && !p.phone) {
      // (the left wrist under the right, back to back)
      ht.copy(hp)
        .addScaledVector(up, -0.05 * gs)
        .addScaledVector(d, -0.015 * gs);
      this.model.reachTo("L", ht, w, [-0.5, -1, 0.3]);
    } else {
      // (the left hand round the right on the grip: just left of it, a little under)
      hx.crossVectors(d, up); // (the gun's right)
      ht.copy(hp)
        .addScaledVector(hx, -0.03 * gs)
        .addScaledVector(up, -0.025 * gs)
        .addScaledVector(d, -0.01 * gs);
      this.model.reachTo("L", ht, w, [-0.3, -1, 0.1]);
    }
  }

  // The left hand under the double-barrel's fore-end, where the gun really is (turned in the right
  // hand, kicked): its underside, a third of the way along it, in the gun's own frame.
  private gripOnFore() {
    const g = this.gun?.model;
    if (this.foreW < 0.01 || !g) return;
    g.root.updateWorldMatrix(true, false);
    hf.set(0.15, -0.045, 0).applyMatrix4(g.root.matrixWorld);
    this.model.reachTo("L", hf, this.foreW, [-0.5, -1, 0.2]);
  }

  // Reloading the double-barrel: the left hand's way (into `ht`) from the breech down to the pocket
  // at the left hip and back with a shell — a shell every ARMS.shotgun.reload, after the opening.
  private loadHand(butt: Vector3, d: Vector3, up: Vector3, gs: number, body: number, q: Quaternion) {
    const OPEN = 0.3;
    const EACH = 0.45;
    // the breech, open: just above the chambers' mouths (0.39 along from the butt, 0.12 up)
    hb.copy(butt)
      .addScaledVector(d, 0.37 * gs)
      .addScaledVector(up, 0.14 * gs);
    if (this.loadT < OPEN) {
      // (opening it: the left hand comes off the fore-end to the breech)
      ht.lerp(hb, this.loadT / OPEN);
      return;
    }
    const ph = ((this.loadT - OPEN) / EACH) % 1;
    // the pocket: down the left thigh, out to its side, a little ahead
    const thigh = this.model.bone("thighL");
    if (thigh) thigh.getWorldPosition(hq);
    else hq.copy(butt);
    hq
      .addScaledVector(hv.set(0, 0, 1).applyQuaternion(q), 0.06 * body)
      .addScaledVector(hv.set(1, 0, 0).applyQuaternion(q), 0.08 * body).y -= 0.2 * body;
    // down to it (0–0.35), a moment there (–0.5), up with a shell (–0.88), pushed in (–1)
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (ph < 0.35) ht.copy(hb).lerp(hq, ease(ph / 0.35));
    else if (ph < 0.5) ht.copy(hq);
    else if (ph < 0.88) ht.copy(hq).lerp(hb, ease((ph - 0.5) / 0.38));
    else ht.copy(hb).addScaledVector(d, -0.02 * gs * Math.sin(((ph - 0.88) / 0.12) * Math.PI));
    // the shell in the hand on the way back
    if (ph > 0.42 && ph < 0.95) {
      const hand = this.model.bone("wristL");
      if (!hand) return;
      if (!this.shellInHand) {
        this.shellInHand = new Mesh(shellGeometry(), this.mats.prop("vertex"));
        this.shellInHand.position.set(0, -0.07, 0.015);
        this.shellInHand.rotation.set(0, 0, Math.PI / 2);
        this.shellInHand.scale.setScalar(1.2);
      }
      if (this.shellInHand.parent !== hand) hand.add(this.shellInHand);
      this.shellInHand.visible = true;
    }
  }

  /** Aiming: the barrel (the root's −y) along `dir` (world, unit), its top (+z) up — level, not
   *  rolled however the wrist turns. */
  private aimGun(root: Object3D, dir: Vector3) {
    const hand = root.parent;
    if (!hand) return;
    hand.updateWorldMatrix(true, false);
    hand.getWorldQuaternion(gq);
    gy.copy(dir).negate();
    gz.set(0, 1, 0).addScaledVector(dir, -dir.y);
    if (gz.lengthSq() < 1e-6) gz.set(0, 0, 1);
    gz.normalize();
    gx.crossVectors(gy, gz);
    gm.makeBasis(gx, gy, gz);
    root.quaternion.setFromRotationMatrix(gm).premultiply(gq.invert());
  }

  /** The gun's muzzle in the world (the view's coords); false: no gun in the hand. */
  gunMuzzle(out: Vector3): boolean {
    const g = this.gun?.model;
    if (!g || !this.root.visible) return false;
    g.root.updateWorldMatrix(true, false);
    out.set(...g.muzzle).applyMatrix4(g.root.matrixWorld);
    return true;
  }

  /** The gun's sights in the world (the rear notch or the rib's end, the front blade or bead); false:
   *  no gun in the hand. */
  gunSights(rear: Vector3, front: Vector3, up?: Vector3): boolean {
    const g = this.gun?.model;
    if (!g) return false;
    g.root.updateWorldMatrix(true, false);
    rear.set(...g.sight.rear).applyMatrix4(g.root.matrixWorld);
    front.set(...g.sight.front).applyMatrix4(g.root.matrixWorld);
    // (its top's way, in the world)
    up?.set(0, 1, 0).transformDirection(g.root.matrixWorld);
    return true;
  }

  private dropGun() {
    this.shellInHand?.removeFromParent();
    this.shellInHand?.geometry.dispose();
    this.shellInHand = null;
    if (!this.gun) return;
    this.gun.root.removeFromParent();
    this.gun.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.gun = null;
  }

  // on a call with the phone put away: an earbud in the right ear (the head's own space)
  private bud: Prop | null = null;
  private budFrame(p: PersonIn) {
    const at = p.bud ? this.model.earPoint() : null;
    const head = this.model.bone("head");
    if (!!this.bud === !!(at && head)) return;
    this.dropBud();
    if (!at || !head) return;
    this.bud = this.C.buildProp("bud", "#f4f2ec", this.mats.prop);
    this.bud.root.position.set(at[0], at[1], at[2]);
    head.add(this.bud.root);
  }
  private dropBud() {
    if (!this.bud) return;
    this.bud.root.removeFromParent();
    this.bud.dispose();
    this.bud = null;
  }

  // the torch on: a flashlight in the left hand (docs/plan/30-the-dark.md) — not while the
  // phone's out (both hands on it)
  private torch: Prop | null = null;
  private torchFrame(p: PersonIn) {
    const hand = this.model.bone("wristL");
    const on = !!p.torch && !p.phone && !!hand;
    if (!!this.torch !== on) {
      this.dropTorch();
      if (on && hand) {
        this.torch = this.C.buildProp("torch", "#2b2e33", this.mats.prop);
        this.C.inHand(this.torch.root, "torch");
        // (no shadow of its own: the light comes out of it)
        this.torch.root.traverse((o) => {
          o.castShadow = false;
        });
        hand.add(this.torch.root);
      }
    }
    if (!this.torch) return;
    // along the beam (shared beam.ts): ahead, tipped at the ground — or up as they aim — whatever
    // the wrist is doing, so the light comes out of it where it points
    this.C.pointAlong(this.torch.root, this.lookDir(p, tv));
  }
  /** Where the beam goes, in the world (unit): ahead and tipped at the ground — or, aiming, along the
   *  look (bladed: AIM_BLADE left of the body's facing) and up as they aim. */
  private lookDir(p: PersonIn, out: Vector3): Vector3 {
    const aiming = ((p.mv ?? 0) & 16) !== 0;
    const pitch = aiming ? (p.pitch ?? 0) : BEAM.tilt;
    const b = aiming ? AIM_BLADE : 0;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(tq);
    const c = Math.cos(pitch);
    return out.set(Math.sin(b) * c, Math.sin(pitch), Math.cos(b) * c).applyQuaternion(tq);
  }
  /** The flashlight's lens, in the world (the light comes out of it), or null: none in the hand. */
  // ── snow settling on them outside (docs/plan/33-the-look.md): on the shoulders and the top of
  // the head, as deep as `snowK` (0..1; the view keeps it, by how long they've been out) ──
  static snowMat: Material | null = null;
  snowK = 0;
  private snow: { pad: Mesh; cap: Mesh } | null = null;
  updateSnow() {
    const k = this.snowK;
    const m = this.model;
    if (k < 0.03 || !m.ready || !Person3D.snowMat || this.part !== "all") {
      if (this.snow) this.snow.pad.visible = this.snow.cap.visible = false;
      return;
    }
    if (!this.snow) {
      const dome = new SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      const pad = new Mesh(dome, Person3D.snowMat);
      const cap = new Mesh(dome, Person3D.snowMat);
      this.root.add(pad, cap);
      this.snow = { pad, cap };
    }
    const sL = m.bone("shoulderL");
    const sR = m.bone("shoulderR");
    const head = m.bone("head");
    const spine = m.bone("spine");
    if (!sL || !sR || !head || !spine) return;
    this.root.updateWorldMatrix(true, true);
    const a = sL.getWorldPosition(snowA);
    const b = sR.getWorldPosition(snowB);
    const { pad, cap } = this.snow;
    // across the shoulders: a low drift over them and the yoke between
    pad.visible = true;
    pad.position.copy(this.root.worldToLocal(snowC.copy(a).add(b).multiplyScalar(0.5)));
    pad.position.y += 0.07;
    this.root.getWorldQuaternion(snowQ).invert();
    pad.quaternion.copy(snowQ).multiply(spine.getWorldQuaternion(snowQ2));
    pad.scale.set(a.distanceTo(b) / 2 + 0.08, 0.02 + 0.06 * k, 0.1);
    // a cap on the crown, tilting with the head
    cap.visible = true;
    cap.position.copy(this.root.worldToLocal(head.localToWorld(snowC.set(0, m.crown - 0.04, 0))));
    this.root.getWorldQuaternion(snowQ).invert();
    cap.quaternion.copy(snowQ).multiply(head.getWorldQuaternion(snowQ2));
    cap.scale.set(0.1 + 0.05 * k, 0.015 + 0.045 * k, 0.1 + 0.05 * k);
  }
  torchLens(out: Vector3): Vector3 | null {
    if (!this.torch || !this.root.visible) return null;
    this.torch.root.updateWorldMatrix(true, false);
    return this.torch.root.localToWorld(out.set(0, 0.1, 0));
  }
  private dropTorch() {
    if (!this.torch) return;
    this.torch.root.removeFromParent();
    this.torch.dispose();
    this.torch = null;
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
    this.burning?.dispose();
    this.dropHeld();
    this.dropPhone();
    this.dropGun();
    this.dropBud();
    this.dropTorch();
    this.model.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as Material).dispose();
    this.root.removeFromParent();
  }
}

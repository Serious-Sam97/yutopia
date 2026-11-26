// The animals on my screen (docs/plan/126-animal-life.md, phase 4): the server sends those near me (StateView) —
// where they are, what they're doing, how fast —; played back a moment late and smooth, each drawn from its
// species' model (models.ts) on the land's height (or the water's, or the air over it), its clip by what it's doing
// and its pace, the young smaller with a bigger head. Its acts (feed, stroke, skin, collect, ride) go in the action
// menu; what came of them, and a bite, come back as toasts.
import { addStrings, lang, tr, trMaybe } from "@/lib/i18n";
import { type Doing, doingOf, type Pace, paceOf } from "@yutopia/shared/animals/mind";
import {
  ANIMALS,
  activeAt,
  type AnimalKind,
  CRATE_FOODS,
  CRATE_REACH,
  FEED_CRATES,
  isAnimalKind,
  takes,
  YOUNG,
} from "@yutopia/shared/animals/species";
import { BoxGeometry, type BufferGeometry, Group, type Material, Mesh, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { litMaterial } from "../look/lit";
import { byteFace } from "@yutopia/shared/facing";
import { KH_FEEL, type MoveSpec } from "@yutopia/shared/move";
import { type AnimalPlaceDef, animalPlacesOf, penRect } from "@yutopia/shared/animals/habitat";
import { editsNow, heightAt, waterAt } from "@yutopia/shared/grounds";
import type { ServerMessages } from "@yutopia/shared";
import type { WorldController } from "../controller";
import { toast } from "../store";
import { type AnimalBody, AnimalModels, gaitOf, modelOf, ownYoung } from "./models";
import { ANIMAL_STRINGS } from "./strings";
import { ALARM_HEARD, CALL_HEARD, CALL_NEAR } from "@yutopia/shared/animals/traits";
import { clipOf, onTheMove, STRIKE_MS } from "./clips";
import { AnimalDebug, debugAsked } from "./debug";
import { AnimalSound } from "./sound";
import { TinyLife } from "./tiny";

addStrings(ANIMAL_STRINGS, "animals");

const DELAY = 120; // ms behind: they're sent with the patches
/** Drawn within this of the camera (m); their clips stepped every frame within NEAR_ANIM, every third past it. */
const DRAW = 150;
const NEAR_ANIM = 45;
const GONE_MS = 400;
/** m: the hips' seat over a sitter's feet when there's no seat under her (tp/seats3d SEAT_LAND.top) — a rider's
 *  feet are put this far under the horse's back, so the seat of her trousers is on it */
const SIT_TOP = 0.357;

interface Sample {
  t: number;
  x: number;
  y: number;
  h: number;
  yaw: number;
}
interface Seen {
  id: string;
  kind: AnimalKind;
  young: boolean;
  v: number;
  buf: Sample[];
  x: number;
  y: number;
  h: number;
  yaw: number;
  doing: Doing;
  pace: Pace;
  at: number;
  t: string;
  hp: number;
  n: number;
  name: string;
  hitAt: number;
  flinchUntil: number;
  /** struck me: its attack played till then (performance.now ms), from its start — `strikeShown` the one started */
  strikeUntil: number;
  strikeShown: number;
  body: AnimalBody | null;
  model: string;
  gone: number | null;
  tick: number;
  /** its sounds: what it was doing last frame, when it calls next (performance.now ms) */
  was: Doing;
  /** how fast it really goes (m/s), how fast it's turning (rad/s): smoothed from its samples (plan 128 F11) */
  spd: number;
  turn: number;
  walking: boolean;
  /** struck since last frame: its cry */
  cry: boolean;
}

/** An animal as the menu and the prompt see it. */
export interface AnimalAt {
  id: string;
  kind: AnimalKind;
  x: number;
  y: number;
  doing: Doing;
  young: boolean;
  name: string;
  /** bits: 1 skinned, 2 the farm's ready, 4 befriended */
  n: number;
  /** its rider's session */
  t: string;
}

export class AnimalLife {
  private seen = new Map<string, Seen>();
  private models: AnimalModels | null = null;
  private last = 0;
  private frameNo = 0;
  /** what's in my left hand (the dark's pockets: food held out) */
  private hand: string | undefined;
  private crates: Group | null = null;
  private fences: Group | null = null;
  private fencedOf: unknown = null;
  private tiny: TinyLife | null = null;
  private sound = new AnimalSound();
  private dir = new Vector3();
  private here = new Set<string>();
  private printAt = { x: 0, y: 0, z: 0, ground: 0 };
  /** this frame's ridden ones, by their rider's session */
  private riders = new Map<string, Seen>();
  /** (plan 128 F10a: the minds shown — an admin's `?animals=debug`) */
  private debugOn = debugAsked();
  /** the room its calls and the overlay's feed are heard from (hooked once it's there) */
  private hooked: unknown = null;
  /** the overlay's feed: last heard, last asked (asked again till it comes — the first ask may be before I'm known) */
  private debugHeard = 0;
  private debugAsked = 0;
  private debugTries = 0;
  private debug: AnimalDebug | null = null;

  constructor(private readonly ctl: WorldController) {}

  dispose() {
    this.debug?.dispose();
    this.debug = null;
    dropGroup(this.crates);
    dropGroup(this.fences);
    this.crates = this.fences = null;
    this.tiny?.dispose();
    for (const s of this.seen.values()) s.body?.dispose();
    this.seen.clear();
    this.riders.clear();
  }

  /** What's in my left hand: the dark's pockets as they are (its message may have come before this chunk did). */
  private handNow(): string | undefined {
    return this.ctl.walker?.inHand() ?? this.hand;
  }

  /** Every frame: read the room, play them back, draw them. */
  frame(_dt: number) {
    const ctl = this.ctl;
    const tp = ctl.tp;
    const room = ctl.room;
    // (the room's messages — what came of an act, a strike, my pockets, a call heard far off, the overlay's feed:
    // hooked to the room once it's there, and again to a new one after a reconnect)
    if (room && this.hooked !== room) {
      this.hooked = room;
      room.onMessage("animal:did", (m: ServerMessages["animal:did"]) => this.did(m));
      room.onMessage("animal:strike", (m: ServerMessages["animal:strike"]) => this.struck(m));

      room.onMessage("dark:pockets", (m: { inv?: { hand?: { id: string } | null } }) => {
        this.hand = m.inv?.hand?.id;
      });
      room.onMessage("animal:call", (m: ServerMessages["animal:call"]) => this.called(m));
      // (the far callers' takes loaded ahead: a howl heard the first time)
      this.sound.warmAll(["wolf", "owl", "elk", "moose", "crow", "songbird", "goose", "fox", "bear", "frog", "deer"]);
      room.onMessage("animal:debug", (m: ServerMessages["animal:debug"]) => {
        this.debugHeard = performance.now();
        this.debug?.told(m);
      });
    }
    const now = performance.now();
    const dt = Math.max(0.001, Math.min(0.25, (now - (this.last || now - 16)) / 1000));
    this.last = now;
    this.frameNo++;
    if (tp && !this.models) this.models = new AnimalModels(tp.renderer, (m) => tp.light.patch(m));
    const here = this.here;
    here.clear();
    this.riders.clear();
    // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
    room?.state.animals?.forEach((w: any) => {
      if (!isAnimalKind(w.k)) return;
      here.add(w.id);
      let s = this.seen.get(w.id);
      const yaw = byteFace(w.yaw);
      if (!s) {
        s = {
          id: w.id,
          kind: w.k,
          young: !!w.young,
          v: w.v,
          buf: [],
          x: w.x,
          y: w.y,
          h: w.h,
          yaw,
          doing: doingOf(w.d),
          pace: paceOf(w.p),
          at: w.at,
          t: w.t,
          hp: w.hp,
          n: w.n,
          name: w.name,
          hitAt: w.hitAt,
          flinchUntil: 0,
          strikeUntil: 0,
          strikeShown: 0,
          body: null,
          model: modelOf(w.k, w.v, !!w.young),
          gone: null,
          tick: 0,
          was: doingOf(w.d),
          cry: false,
          spd: 0,
          turn: 0,
          walking: false,
        };
        this.seen.set(w.id, s);
      }
      // (grown up, or another look: its model made again)
      if (!!w.young !== s.young || w.v !== s.v) {
        s.young = !!w.young;
        s.v = w.v;
        s.model = modelOf(s.kind, s.v, s.young);
        s.body?.dispose();
        s.body = null;
      }
      s.gone = null;
      s.doing = doingOf(w.d);
      s.pace = paceOf(w.p);
      s.at = w.at;
      s.t = w.t;
      s.hp = w.hp;
      s.n = w.n;
      s.name = w.name;
      if (w.hitAt && w.hitAt !== s.hitAt) {
        s.hitAt = w.hitAt;
        s.flinchUntil = now + 350;
        s.cry = true;
      }
      const lb = s.buf[s.buf.length - 1];
      if (!lb || lb.x !== w.x || lb.y !== w.y || lb.yaw !== yaw || lb.h !== w.h)
        s.buf.push({ t: now, x: w.x, y: w.y, h: w.h, yaw });
      while (s.buf.length > 2 && s.buf[1].t < now - DELAY - 400) s.buf.shift();
    });
    for (const [id, s] of this.seen)
      if (!here.has(id)) {
        s.gone ??= now;
        if (now - s.gone >= GONE_MS) {
          s.body?.dispose();
          this.seen.delete(id);
          ctl.life?.prints.forget(`animal:${id}`);
        }
      }
    // (ridden: drawn under the rider, where the rider's drawn — riderSeat, later this frame)
    for (const s of this.seen.values()) if (s.doing === "ridden" && s.t && s.gone === null) this.riders.set(s.t, s);
    if (!tp) return;
    // the pens' fences and the feed crates, as the published edits have them (made again when they change: the
    // land's height under them too)
    const eds = editsNow();
    if (eds !== this.fencedOf) {
      this.fencedOf = eds;
      dropGroup(this.fences);
      dropGroup(this.crates);
      this.fences = makeFences(tp.scene, animalPlacesOf(eds), (m) => tp.light.patch(m));
      this.crates = makeCrates(tp.scene, (m) => tp.light.patch(m));
    }
    const cam = tp.camera.position;
    tp.camera.getWorldDirection(this.dir);
    const camYaw = Math.atan2(this.dir.z, this.dir.x);
    if (this.debugOn) {
      const t = performance.now();
      // (asked a few times, not for ever: a non-admin's never answered)
      if (t - this.debugHeard > 3000 && t - this.debugAsked > 3000 && (this.debugHeard > 0 || this.debugTries < 6)) {
        this.debugAsked = t;
        this.debugTries++;
        room?.send("animal:debug", { on: true });
      }
      this.debug ??= new AnimalDebug(tp.scene);
      this.debug.frame(tp.camera, (id) => {
        const q = this.seen.get(id);
        return q && q.gone === null ? { x: q.x, y: q.y, h: q.h } : null;
      });
    }
    // the tiny life round me, out on the land (seeded by the wall clock: everyone's the same)
    if (!this.tiny) {
      this.tiny = new TinyLife();
      tp.scene.add(this.tiny.root);
    }
    this.tiny.root.visible = ctl.level === 0;
    const wx = room?.state.weather;
    if (ctl.level === 0 && wx)
      this.tiny.frame({ x: cam.x, z: cam.z }, Date.now() / 1000, {
        hour: Number(room?.state.hour ?? 12),
        temp: Number(wx.temp ?? 0),
        snow: Number(wx.snow ?? 0),
        fall: Number(wx.fall ?? 0),
      });
    const at = now - DELAY;
    for (const s of this.seen.values()) {
      // played back DELAY late, between the two samples round then
      const b = s.buf;
      if (b.length) {
        let i = b.length - 1;
        while (i > 0 && b[i].t > at) i--;
        const p = b[i];
        const q = b[Math.min(b.length - 1, i + 1)];
        const k = q.t > p.t ? Math.max(0, Math.min(1, (at - p.t) / (q.t - p.t))) : 1;
        s.x = p.x + (q.x - p.x) * k;
        s.y = p.y + (q.y - p.y) * k;
        s.h = p.h + (q.h - p.h) * k;
        const da = q.yaw - p.yaw;
        s.yaw = p.yaw + Math.atan2(Math.sin(da), Math.cos(da)) * k;
        // (how fast it really goes and turns, between those two samples: its clip's pace, not the wire's word)
        const span = (q.t - p.t) / 1000;
        // (only a fresh pair says how fast: past the near ring they're stepped twice a second — kept between)
        if (span > 0.01) {
          s.spd += (Math.hypot(q.x - p.x, q.y - p.y) / span - s.spd) * 0.25;
          s.turn += (Math.atan2(Math.sin(da), Math.cos(da)) / span - s.turn) * 0.25;
        } else if (at - p.t > 1200) {
          // (no sample for over a second: stood still)
          s.spd *= 0.8;
          s.turn *= 0.8;
        }
      }
      const dist = Math.hypot(s.x - cam.x, s.y - cam.z);
      if (dist > DRAW || s.gone !== null) {
        if (s.body) s.body.root.visible = false;
        continue;
      }
      if (!s.body && this.models) {
        s.body = this.models.body(s.model, s.young);
        if (s.body) {
          if (s.young && !ownYoung(s.model)) s.body.root.scale.setScalar(YOUNG.scale);
          tp.scene.add(s.body.root);
        }
      }
      const body = s.body;
      if (!body) continue;
      body.root.visible = true;
      const d = ANIMALS[s.kind];
      // where it is: the land, the water's top (a swimmer half in it), the air
      let y = heightAt(s.x, s.y);
      // (a swimmer on the water, half in it — not under the bed in the shallows; one that doesn't swim wades the
      // shallows on the bed — the server keeps it out of the deep)
      const w = d.swims ? waterAt(s.x, s.y) : null;
      if (w && w.level > y) y = Math.max(y, w.level - d.height * (s.young ? YOUNG.scale : 1) * 0.55);
      body.root.position.set(s.x, y + s.h, s.y);
      // (all of it: a pitch the land's slope gave it — plant() — not kept once it's lying, swimming, far)
      body.root.rotation.set(0, -s.yaw, 0);
      // what it plays: its doing, its pace — the clip's speed by how fast it really goes (plan 128 F11: no walking on
      // the spot; stood still and turning, it steps round)
      let clip = clipOf(s.doing, s.pace, !!d.flies, s.h);
      const aloft = !!d.flies && s.h > 0.6;
      // (walking from 0.12 m/s, still under 0.06: a little give, no flicker between)
      s.walking = s.spd > (s.walking ? 0.06 : 0.12);
      // (going somewhere on its legs, whatever it's doing — coming at you to attack, grazing on — its legs go: a clip
      // made standing still (the attack, eating, looking) played while it moves slides it along the ground. The
      // attack when it strikes, or stood in reach.)
      const striking = now < s.strikeUntil;
      clip = onTheMove(clip, { walking: s.walking, striking, aloft, h: s.h });
      const moves = clip === "walk" || clip === "trot" || clip === "run";
      if (moves && !aloft && !s.walking) clip = Math.abs(s.turn) > 0.7 ? "walk" : "idle";
      else if (clip === "idle" && !aloft && Math.abs(s.turn) > 0.9) clip = "walk";
      // (on the ground, its gait by how fast it really goes, each clip at its own speed: shared with the bench —
      // models.ts gaitOf, plan 129 F5)
      let rate = 1;
      const drawn = s.young && !ownYoung(s.model) ? YOUNG.scale : 1;
      if (moves && !aloft && s.walking && s.pace !== "swim") {
        const g = gaitOf(s.kind, s.spd, s.young, body.speeds, body.clip, drawn);
        clip = g.clip;
        rate = g.rate;
      } else if (clip === "swim" && body.speeds.swim)
        // (its strokes at its own speed: how fast it really goes in the water, else its pace's)
        rate = Math.max(0.35, Math.min(2.4, (s.walking ? s.spd : paceSpeed(s.kind, s.pace, s.young)) / (body.speeds.swim * drawn)));
      else if (clip === "walk") rate = Math.max(0.45, Math.min(2, (d.walk * 0.6) / Math.max(0.2, d.walk)));
      else if (clip === "run" || clip === "trot" || clip === "swim")
        rate = gaitOf(s.kind, paceSpeed(s.kind, s.pace, s.young), s.young, body.speeds, body.clip, drawn).rate;
      if (now < s.flinchUntil && s.doing !== "dead") body.play(s.hitAt % 2 ? "hitL" : "hitR", 1, 0.1);
      else if (striking && s.strikeShown !== s.strikeUntil) {
        // (a new strike: its attack from the start, however it was)
        s.strikeShown = s.strikeUntil;
        body.play("attack", 1, 0.1, true);
      } else body.play(clip, rate);
      // (phase 13, F10a) its tracks in the snow: on the ground, walking or running (the footprints' own stride)
      // (the prints' z is the feet's: the land's height there)
      if (dist < 45 && s.h < 0.05 && d.print !== "none" && s.pace !== "still" && s.pace !== "swim" && s.pace !== "fly") {
        this.printAt.x = s.x;
        this.printAt.y = s.y;
        this.printAt.z = this.printAt.ground = y;
        ctl.life?.print(`animal:${s.id}`, this.printAt, now, ctl.map, true);
      }
      // its sounds: a call now and then while it's about, an alarm (or its wings) as it bolts, a growl, a cry, a thud
      this.sounds(s, cam, camYaw);
      // its clip stepped: every frame near, every third farther
      s.tick += dt;
      if (dist < NEAR_ANIM || (this.frameNo + hashNo(s.id)) % 3 === 0) {
        body.update(s.tick);
        s.tick = 0;
      }
      // (plan 129 F5: near, on the ground — its body along the slope, its feet on the land under them; a swimmer, a
      // bird aloft, one lying or ridden as they are)
      if (dist < 40 && s.h < 0.05 && !w && s.doing !== "ridden" && s.doing !== "dead" && s.doing !== "rest" && s.doing !== "sleep")
        body.plant(heightAt, s.yaw, drawn);
    }
  }

  private sounds(s: Seen, cam: Vector3, yaw: number) {
    const d = ANIMALS[s.kind];
    const dx = s.x - cam.x;
    const dz = s.y - cam.z;
    const was = s.was;
    s.was = s.doing;
    const kind = s.kind;
    if (s.doing !== was) {
      if (s.doing === "fly" && was !== "fly") {
        this.sound.play("wings", "", dx, dz, yaw, 0.8, d.len < 0.3 ? "small" : d.len < 0.6 ? "medium" : "large");
        if (Math.random() < 0.5) this.sound.play(kind, "alarm", dx, dz, yaw, 0.8);
      } else if (s.doing === "warn" || s.doing === "attack") this.sound.play(kind, "angry", dx, dz, yaw, 1);
      else if (s.doing === "dead") {
        this.sound.play(kind, "hurt", dx, dz, yaw, 0.9);
        this.sound.play("thud", "", dx, dz, yaw, Math.min(1, d.len / 1.5));
      }
      if (was === "fly" && d.swims && waterAt(s.x, s.y)) this.sound.play("splash", "", dx, dz, yaw, 0.6);
    }
    if (s.cry) {
      s.cry = false;
      if (s.doing !== "dead") this.sound.play(kind, "hurt", dx, dz, yaw, 0.9);
    }
    // (its calls and its alarms: the server's, heard far off — animal:call, plan 128 F8a)
  }

  /** A call heard (a howl over the woods, an owl, the dawn's birds), an alarm (a snort, a crow's caw): from where it
   *  is, however far — the server sends it to those near enough to hear it. */
  private called(m: ServerMessages["animal:call"]) {
    const tp = this.ctl.tp;
    if (!tp || this.ctl.level !== 0) return;
    const cam = tp.camera.position;
    tp.camera.getWorldDirection(this.dir);
    const yaw = Math.atan2(this.dir.z, this.dir.x);
    const s = this.seen.get(m.id);
    const kind = m.k as AnimalKind;
    if (!ANIMALS[kind]) return;
    const dist = Math.hypot(m.x - cam.x, m.y - cam.z);
    // (far off: quieter; the land's own fall-off is the sound's)
    // (heard as far as the server sent it: its species' call's reach, an alarm's)
    const far = (m.c === "alarm" ? ALARM_HEARD : (CALL_HEARD[kind] ?? CALL_NEAR)) * 1.05;
    if (dist > far) return;
    this.sound.play(kind, m.c, m.x - cam.x, m.y - cam.z, yaw, (m.c === "alarm" ? 0.9 : 1) * (s?.young ? 0.6 : 1), undefined, far);
  }

  /** Those near (x, y), nearest first (the prompt, the menu). */
  near(x: number, y: number, r: number): AnimalAt[] {
    const out: (AnimalAt & { d: number })[] = [];
    // (the feed crates: food into the left hand)
    for (const c of FEED_CRATES) {
      const d = Math.hypot(c.x - x, c.z - y);
      if (d <= Math.max(r, CRATE_REACH))
        out.push({ id: `crate:${c.key}`, kind: "pigeon", x: c.x, y: c.z, doing: "idle", young: false, name: "", n: 0, t: "", d });
    }
    for (const s of this.seen.values()) {
      if (s.gone !== null) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > r + ANIMALS[s.kind].len / 2) continue;
      out.push({ id: s.id, kind: s.kind, x: s.x, y: s.y, doing: s.doing, young: s.young, name: s.name, n: s.n, t: s.t, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  /** The horse `sid` rides (how far over the rider's feet its back is, its gaits for the walker), or null. Given
   *  where the rider's drawn (x, y, facing `angle` — the floor's atan2), the horse is drawn there under them: its own
   *  play-back is late (DELAY, and the rider's way to the server and back), so it would trail behind the saddle. */
  riderSeat(sid: string, at?: { x: number; y: number; angle?: number }): { seat: number; spec: MoveSpec } | null {
    const s = this.riders.get(sid);
    if (!s || s.doing !== "ridden" || s.t !== sid || s.gone !== null) return null;
    const d = ANIMALS[s.kind];
    if (at && s.body?.root.visible) {
      s.x = at.x;
      s.y = at.y;
      if (at.angle !== undefined && Number.isFinite(at.angle)) s.yaw = at.angle;
      s.body.root.position.set(at.x, heightAt(at.x, at.y) + s.h, at.y);
      s.body.root.rotation.set(0, -s.yaw, 0);
    }
    const back = d.height * (s.young ? YOUNG.scale : 1) * 0.95;
    return { seat: Math.max(0, back - SIT_TOP), spec: rideSpec(s.kind) };
  }
  get(id: string): AnimalAt | null {
    const s = this.seen.get(id);
    if (!s) return null;
    return { id, kind: s.kind, x: s.x, y: s.y, doing: s.doing, young: s.young, name: s.name, n: s.n, t: s.t };
  }

  /** The action menu for one: what I can do with it now (what's in my left hand, what it's doing). */
  menuFor(id: string, mySid: string): { title: string; subtitle?: string; items: { act: string; ok: boolean }[] } | null {
    if (id.startsWith("crate:"))
      return { title: tr("animalFeedCrate" as never), items: CRATE_FOODS.map((f) => ({ act: `animalTake_${f}`, ok: true })) };
    const a = this.get(id);
    if (!a) return null;
    const d = ANIMALS[a.kind];
    const l = lang() === "pt" ? 1 : 0;
    const label = a.young ? d.young.label[l] : d.label[l];
    const items: { act: string; ok: boolean }[] = [];
    if (a.doing === "dead") items.push({ act: "animalSkin", ok: (a.n & 1) === 0 });
    else {
      const hand = this.handNow();
      const food = !!hand && takes(a.kind, hand);
      if (d.feed.length) items.push({ act: "animalFeed", ok: food });
      items.push({ act: "animalStroke", ok: true });
      if (d.gives && !a.young) items.push({ act: `animalCollect_${d.gives}`, ok: (a.n & 2) !== 0 });
      if (d.ride && !a.young) {
        if (a.doing === "ridden" && a.t === mySid) items.push({ act: "animalDismount", ok: true });
        else items.push({ act: "animalMount", ok: a.doing !== "ridden" });
      }
      if (a.n & 4) items.push({ act: "animalName", ok: true });
    }
    const friend = a.n & 4 ? tr("animalFriend" as never) : "";
    return { title: a.name && a.n & 4 ? a.name : label, subtitle: friend || undefined, items };
  }

  /** An act picked from its menu. */
  act(id: string, act: string) {
    if (act.startsWith("animalTake_")) return this.ctl.send("animal:take", { food: act.slice(11) });
    const send = (a: string, name?: string) => this.ctl.send("animal:act", { id, act: a, ...(name ? { name } : {}) });
    if (act === "animalFeed") return send("feed");
    if (act === "animalSkin") return send("skin");
    if (act === "animalStroke") return send("stroke");
    if (act.startsWith("animalCollect")) return send("collect");
    if (act === "animalMount") return send("mount");
    if (act === "animalDismount") return send("dismount");
    if (act === "animalName") {
      const name = window.prompt(tr("animalNameAsk" as never))?.trim();
      if (name) send("name", name);
    }
  }

  private did(m: ServerMessages["animal:did"]) {
    const a = this.get(m.id);
    const l = lang() === "pt" ? 1 : 0;
    const what = a ? (a.young ? ANIMALS[a.kind].young.label[l] : ANIMALS[a.kind].label[l]) : "";
    if (!m.ok) {
      const why = m.why ? tr(`animalWhy_${m.why}` as never) : "";
      if (why && !why.startsWith("animalWhy_")) toast(why, "warn", 2500);
      return;
    }
    if (m.got?.length) {
      // (the items' names are the dark's: dark/strings.ts)
      const items = m.got.map((g) => `${g.n} × ${trMaybe(`dark_item_${g.id}`) ?? g.id}`).join(", ");
      toast(tr("animalGot" as never).replace("{items}", items), "info", 3500);
    }
    if (m.act === "feed") {
      if (m.friend) toast(tr("animalFriendNow" as never).replace("{what}", what), "info", 6000);
      else if (m.trust !== undefined) toast(tr("animalTrust" as never).replace("{what}", what).replace("{n}", String(Math.round(m.trust * 100))), "info", 2500);
    }
  }

  private struck(m: ServerMessages["animal:strike"]) {
    // (its attack shown as it strikes — running at me, it lunges, then runs on)
    const s = this.seen.get(m.id);
    if (s) s.strikeUntil = performance.now() + STRIKE_MS;
    const kind = isAnimalKind(m.kind) ? m.kind : null;
    const l = lang() === "pt" ? 1 : 0;
    if (kind) toast(tr("animalStruck" as never).replace("{what}", ANIMALS[kind].label[l]), "warn", 2500);
  }
}

function paceSpeed(kind: AnimalKind, pace: Pace, young: boolean): number {
  const d = ANIMALS[kind];
  const k = young ? 0.75 : 1;
  switch (pace) {
    case "walk":
      return d.walk * k;
    case "trot":
      return Math.min(d.run, d.walk * 2.4) * k;
    case "run":
      return d.run * k;
    case "fly":
      return (d.flies?.speed ?? d.run) * k;
    case "swim":
      return Math.max(0.5, d.walk * 0.7) * k;
    default:
      return 0;
  }
}

function hashNo(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h & 0xffff;
}

/** A group of ours taken out of the scene, its geometry and materials let go. */
function dropGroup(g: Group | null) {
  if (!g) return;
  g.removeFromParent();
  const mats = new Set<Material>();
  g.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
  });
  for (const m of mats) m.dispose();
}

/** Pieces of one material as one mesh (one draw): each geometry moved where it goes, merged, the pieces let go. */
function merged(parts: BufferGeometry[], mat: Material): Mesh | null {
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) return null;
  const m = new Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** The feed crates (FEED_CRATES): a slatted wooden crate each, apples and carrots heaped in it. */
function makeCrates(scene: { add(o: Group): unknown }, patch: (m: Material) => void): Group {
  const root = new Group();
  const wood = litMaterial({ color: 0x8a6440, roughness: 0.9 });
  const apple = litMaterial({ color: 0xb8322c, roughness: 0.6 });
  const carrot = litMaterial({ color: 0xe0782a, roughness: 0.7 });
  const bread = litMaterial({ color: 0xc78a45, roughness: 0.85 });
  for (const m of [wood, apple, carrot, bread]) patch(m);
  // (each piece moved to where it lies in the world, then all of a material merged: four draws for every crate)
  const woods: BufferGeometry[] = [];
  const apples: BufferGeometry[] = [];
  const carrots: BufferGeometry[] = [];
  const breads: BufferGeometry[] = [];
  for (const c of FEED_CRATES) {
    const y = heightAt(c.x, c.z);
    const at = (g: BufferGeometry, x: number, py: number, z: number) => g.translate(c.x + x, y + py, c.z + z);
    for (let i = 0; i < 4; i++) {
      const sy = 0.08 + i * 0.12;
      woods.push(at(new BoxGeometry(0.9, 0.08, 0.04), 0, sy, 0.3), at(new BoxGeometry(0.9, 0.08, 0.04), 0, sy, -0.3));
      woods.push(at(new BoxGeometry(0.04, 0.08, 0.6), 0.45, sy, 0), at(new BoxGeometry(0.04, 0.08, 0.6), -0.45, sy, 0));
    }
    woods.push(at(new BoxGeometry(0.9, 0.04, 0.6), 0, 0.04, 0));
    for (let i = 0; i < 9; i++)
      (i % 3 ? apples : carrots).push(
        at(new SphereGeometry(0.045, 10, 8), -0.3 + (i % 3) * 0.12, 0.47, -0.12 + Math.floor(i / 3) * 0.1),
      );
    breads.push(at(new SphereGeometry(0.12, 12, 8).scale(1.4, 0.6, 0.8), 0.22, 0.48, 0));
  }
  for (const m of [merged(woods, wood), merged(apples, apple), merged(carrots, carrot), merged(breads, bread)])
    if (m) root.add(m);
  scene.add(root);
  return root;
}

const rideSpecs = new Map<string, MoveSpec>();
/** A ridden animal's gaits as the walker's: its walk, a trot for the jog, its gallop for the sprint; no air tricks. */
function rideSpec(kind: AnimalKind): MoveSpec {
  const had = rideSpecs.get(kind);
  if (had) return had;
  const d = ANIMALS[kind];
  const s: MoveSpec = {
    ...KH_FEEL,
    walk: d.walk,
    jog: Math.min(d.run, d.walk * 3),
    sprint: d.run,
    crouch: d.walk,
    aim: d.walk,
    airJumps: 0,
    airDash: undefined,
    flow: undefined,
  };
  rideSpecs.set(kind, s);
  return s;
}

/** The pens' fences (phase 11): posts every 2.5 m round each pen, two rails between, a gap for a gate on its west side
 *  (all of them one mesh: one draw). */
function makeFences(scene: { add(o: Group): unknown }, places: AnimalPlaceDef[], patch: (m: Material) => void): Group {
  const root = new Group();
  const wood = litMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  patch(wood);
  const parts: BufferGeometry[] = [];
  for (const p of places) {
    if (p.kind !== "pen") continue;
    const r = penRect(p);
    const sides: [number, number, number, number][] = [
      [r.x0, r.z0, r.x1, r.z0],
      [r.x1, r.z0, r.x1, r.z1],
      [r.x1, r.z1, r.x0, r.z1],
      [r.x0, r.z1, r.x0, r.z0],
    ];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.5));
      const gateAt = ax === bx && ax === r.x0 ? Math.floor(n / 2) : -1;
      for (let i = 0; i <= n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const z = az + ((bz - az) * i) / n;
        const h0 = heightAt(x, z);
        parts.push(new BoxGeometry(0.12, 1.2, 0.12).translate(x, h0 + 0.6, z));
        if (i === n || i === gateAt) continue;
        const x2 = ax + ((bx - ax) * (i + 1)) / n;
        const z2 = az + ((bz - az) * (i + 1)) / n;
        const seg = Math.hypot(x2 - x, z2 - z);
        const h1 = heightAt(x2, z2);
        for (const y of [0.55, 1.0]) {
          // (turned along the side, tilted with the land: as a mesh's rotation (y, then z) would)
          const rail = new BoxGeometry(seg, 0.08, 0.05);
          rail.rotateZ(Math.atan2(h1 - h0, seg));
          rail.rotateY(-Math.atan2(z2 - z, x2 - x));
          rail.translate((x + x2) / 2, (h0 + h1) / 2 + y, (z + z2) / 2);
          parts.push(rail);
        }
      }
    }
  }
  const m = merged(parts, wood);
  if (m) root.add(m);
  else wood.dispose();
  scene.add(root);
  return root;
}

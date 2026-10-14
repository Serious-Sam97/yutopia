import {
  type AvatarLayers,
  avatarFromSeed,
  DEFAULT_AVATAR,
  dirFromDelta,
  findPath,
  Grid,
  type MapDef,
  moveStep,
  type Point,
  RUN_SPEED,
  WALK_SPEED,
  type WorldObjectDef,
} from "@yutopia/shared";
import { dirAngle } from "./people3d";

// A tiny offline world for the third-person demo: you and a few people who
// wander, sit and get up again, moved by the same shared rules the server
// checks (Grid, moveStep, findPath). Each body is exactly what the server
// sends for a person (x, y, d = one of 8 facings, a = idle / walk / sit), so
// either view — iso or third person — can draw the same people.

export interface Body {
  id: string;
  name: string;
  avatar: AvatarLayers;
  x: number;
  y: number;
  d: number; // 8 facings (shared/iso.ts)
  a: number; // 0 idle, 1 walk, 2 sit
  angle: number; // you only: your facing in world radians (third person turns freely)
  // a little life, as the server would send it
  status: string;
  speaking: boolean;
  emote: string;
  mic: boolean;
  held?: string;
  heldAt?: number;
}

interface Bot extends Body {
  path: Point[] | null;
  wait: number;
  seated: number; // seconds left on a seat
  next: number; // seconds to the next bit of life (talk, emote…)
}

const EMOTES = ["wave", "heart", "laugh", "clap", "fire", "question", "coffee", "tape"];
const LINES = [
  "anyone up for coffee?",
  "pushing the fix now",
  "the board wall is so pretty today",
  "standup in 5!",
  "lol",
  "brb",
];

const SEAT_DIR = [1, 3, 5, 7]; // seat rot → facing, away from the seat's back (as the controller does)
const NAMES = ["Ana", "Bia", "Caio", "Duda", "Enzo", "Flora", "Gui", "Helô", "Iara", "João", "Kika", "Lia"];

export class DemoWorld {
  readonly grid: Grid;
  readonly me: Body;
  readonly bots: Bot[] = [];
  private seats: Point[] = [];
  private rnd: () => number;

  constructor(
    readonly map: MapDef,
    objects: WorldObjectDef[],
    crowd: number,
    me: AvatarLayers = DEFAULT_AVATAR,
  ) {
    this.grid = Grid.from(map, objects);
    let a = 7;
    this.rnd = () => {
      a = (a * 1103515245 + 12345) >>> 0;
      return ((a >>> 8) & 0xffff) / 0x10000;
    };
    for (const idx of this.grid.seats.keys())
      this.seats.push({ x: (idx % map.width) + 0.5, y: Math.floor(idx / map.width) + 0.5 });
    const s = map.spawn;
    this.me = {
      id: "me",
      name: "You",
      avatar: me,
      x: s.x,
      y: s.y,
      d: 0,
      a: 0,
      angle: Math.PI / 4,
      status: "available",
      speaking: false,
      emote: "",
      mic: true,
    };
    for (let i = 0; i < crowd; i++) {
      const at = this.randomSpot() ?? { x: s.x, y: s.y };
      this.bots.push({
        id: `p${i}`,
        name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""),
        avatar: avatarFromSeed(i * 7.31 + 3),
        x: at.x,
        y: at.y,
        d: i % 8,
        a: 0,
        angle: 0,
        path: null,
        wait: this.rnd() * 3,
        seated: 0,
        next: this.rnd() * 4,
        status: i === 3 ? "away" : i === 5 ? "dnd" : "available",
        speaking: false,
        emote: "",
        mic: i % 4 !== 2,
        held: i % 3 === 0 ? ["mug", "cup", "soda"][(i / 3) % 3] : undefined,
        heldAt: i % 3 === 0 ? Date.now() - i * 4000 : undefined,
      });
    }
  }

  all(): Body[] {
    return [this.me, ...this.bots];
  }

  private randomSpot(): Point | null {
    for (let k = 0; k < 200; k++) {
      const x = Math.floor(this.rnd() * this.map.width);
      const y = Math.floor(this.rnd() * this.map.height);
      if (this.grid.ok(x, y) && !this.grid.seatAt(x + 0.5, y + 0.5) && this.grid.fits(x + 0.5, y + 0.5))
        return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }

  // `move`: your input as a world direction (length ≤ 1), `run`: Shift.
  // `face`: third person turns you smoothly to where you go (radians).
  step(dt: number, move: Point, run: boolean) {
    const me = this.me;
    const len = Math.hypot(move.x, move.y);
    if (len > 0.05) {
      const dir = { x: move.x / Math.max(1, len), y: move.y / Math.max(1, len) };
      const next = moveStep(this.grid, me, dir, (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, len), dt);
      const moved = Math.hypot(next.x - me.x, next.y - me.y) > 1e-4;
      me.x = next.x;
      me.y = next.y;
      // face where you're trying to go (even against a wall)
      const want = Math.atan2(dir.y, dir.x);
      let d = want - me.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.angle += d * Math.min(1, dt * 12);
      me.d = dirFromDelta(Math.cos(me.angle), Math.sin(me.angle), me.d as 0);
      me.a = moved ? 1 : 0;
    } else {
      const seat = this.grid.seatAt(me.x, me.y);
      if (seat) {
        if (me.a !== 2) {
          me.x = Math.floor(me.x) + 0.5;
          me.y = Math.floor(me.y) + 0.5;
          me.d = SEAT_DIR[seat.rot % 4];
          me.angle = dirAngle(me.d);
        }
        me.a = 2;
      } else me.a = 0;
    }
    for (const b of this.bots) this.stepBot(b, dt);
  }

  // what someone says now and then (the page shows it as a bubble)
  said: { id: string; text: string }[] = [];

  private life(b: Bot, dt: number) {
    b.next -= dt;
    if (b.next > 0) return;
    b.next = 3 + this.rnd() * 6;
    b.speaking = false;
    b.emote = "";
    const r = this.rnd();
    if (r < 0.3) b.speaking = true;
    else if (r < 0.55) b.emote = EMOTES[Math.floor(this.rnd() * EMOTES.length)];
    else if (r < 0.7) this.said.push({ id: b.id, text: LINES[Math.floor(this.rnd() * LINES.length)] });
  }

  private stepBot(b: Bot, dt: number) {
    this.life(b, dt);
    if (b.seated > 0) {
      b.seated -= dt;
      if (b.seated <= 0) b.wait = 0.5;
      return;
    }
    if (!b.path) {
      b.a = 0;
      b.wait -= dt;
      if (b.wait > 0) return;
      // somewhere near (a seat now and then)
      const sit = this.rnd() < 0.35 && this.seats.length > 0;
      let goal: Point | null = null;
      for (let k = 0; k < 12 && !goal; k++) {
        const c = sit ? this.seats[Math.floor(this.rnd() * this.seats.length)] : this.randomSpot();
        if (c && Math.hypot(c.x - b.x, c.y - b.y) < 14) goal = c;
      }
      if (!goal) {
        b.wait = 1;
        return;
      }
      b.path = findPath(this.grid, b, goal);
      if (!b.path?.length) {
        b.path = null;
        b.wait = 1;
      }
      return;
    }
    let left = WALK_SPEED * dt;
    while (left > 0 && b.path.length) {
      const t = b.path[0];
      const dx = t.x - b.x;
      const dy = t.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d <= left) {
        b.x = t.x;
        b.y = t.y;
        b.path.shift();
        left -= d;
      } else {
        b.x += (dx / d) * left;
        b.y += (dy / d) * left;
        left = 0;
      }
      if (d > 0.001) b.d = dirFromDelta(dx, dy, b.d as 0);
    }
    b.a = 1;
    if (!b.path.length) {
      b.path = null;
      const seat = this.grid.seatAt(b.x, b.y);
      if (seat) {
        b.x = Math.floor(b.x) + 0.5;
        b.y = Math.floor(b.y) + 0.5;
        b.d = SEAT_DIR[seat.rot % 4];
        b.a = 2;
        b.seated = 8 + this.rnd() * 20;
      } else {
        b.a = 0;
        b.wait = 1 + this.rnd() * 5;
      }
    }
  }
}

import {
  footprint,
  hearingGain,
  type ServerMessages,
  stereoPan,
  TILE_H,
  TILE_W,
  toScreen,
  variantOf,
  type WorldObjectDef,
} from "@yutopia/shared";
import {
  CABLE_REACH,
  CONSOLES,
  GAME_ASPECT,
  type GameSystem,
  gap,
  hasSticks,
  isConsole,
  isDiscSystem,
  isGameTv,
  PAD_BUTTONS,
  PAD_REACH,
  SYSTEMS,
  turnLocal,
} from "@yutopia/shared/games";
import { displaySpot, GLASS, glassCorners, glassFacing, tvInput, tvVolume } from "@yutopia/shared/media";
import { Container, Graphics, Matrix, Sprite, Text, Texture } from "pixi.js";
import { prefs } from "@/lib/prefs";
import { glowSprite, placeGlow } from "../art/glow";
import type { WorldController } from "../controller";
import { type GameView, hud, toast } from "../store";
import type { GameScene3 } from "../tp/games3d";
import { biosFiles, library, listBios, loadSave, putSave, romOf } from "./api";
import { type Emu, startEmu } from "./emu";
import * as sound from "./foley";
import { myGamepad, readPad } from "./input";
import { biosFits, discRegion, hasBootLogo, ntsc, REGION_BIOS, REGION_NAMES, type Region, relicense } from "./region";
import { TvStream } from "./tv";

// The game room, live (lazy chunk with the emulator, loaded once a space has a
// TV, a console or the shelf; docs/plan/09-game-room.md):
//  · on every TV, the picture of the console it shows — the emulator's canvas
//    for whoever runs it, the TV's LiveKit video for everyone else — with a CRT
//    look, "NO SIGNAL" while paused, and its glow on the floor at night;
//  · the cables from consoles to TVs, the pads (in players' hands, their cords
//    back to the console, or lying by it), the power LEDs;
//  · hosting: when the server makes you a console's host, the cartridge's ROM
//    comes down, the emulator starts (from the last save when carrying on), the
//    TV goes out (tv.ts), other players' pads come in, and it saves as it goes;
//  · your pad: keyboard / gamepad while the console's panel is open;
//  · the TV's sound for viewers, from where the TV is.

// biome-ignore lint/suspicious/noExplicitAny: colyseus schema instances
type S = any;

const AUTOSAVE_MS = 45_000;
const MIN_HOLD_MS = 80;
// The slim disc console's flip-up screen (its variant 1): where its glass is
// (rot-0 local tiles on its front face, height in px; art/items/games.ts)
const LCD = { x0: 0.29, x1: 0.65, y: 0.336, z0: 5.8, z1: 16.8 };
// (the art's seed for an id: kit.ts's seedOf, here so the item art's chunk isn't pulled in)
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
const hasLcd = (o: WorldObjectDef) => o.kind === "console_ps1_slim" && variantOf(o, seedOf(o.id)) === 1;
type Corners = { tl: [number, number]; tr: [number, number]; zTop: number; zBot: number };
interface LcdView {
  root: Container;
  pic: Sprite;
  frame: HTMLCanvasElement;
  source: HTMLVideoElement | HTMLCanvasElement | null;
  at: Corners | null; // (shown: where, for the 3D view)
} // a remote press lasts at least this (a few emulator frames)
const PAD_Z_STAND = 30; // px: where hands are, standing / sitting
const PAD_Z_SIT = 21;
const INK = 0x2a1a12;
const SKIP_KEYS = new Set(["Escape", "Tab"]);
// Where a console's power LED is (rot-0 local tiles, height in px) and its
// colour: on the front of the cartridge consoles, on the top of the disc ones
// (where their drawings put it, art/items/games.ts).
const LED: Record<string, { at: [number, number]; z: number; color: number }> = {
  console_ps1: { at: [0.7, 0.545], z: 4.5, color: 0x7dff7a },
  console_ps1_slim: { at: [0.71, 0.67], z: 3.7, color: 0x7dff7a },
};
const LED_FRONT = { at: [0.3, 0.74] as [number, number], z: 2, color: 0xff6a3a };
// iso px of height → tiles, as tp/kit3d's zt (not imported: that's three.js's chunk)
const zt = (z: number) => z / (45.25 * Math.cos(Math.PI / 6));
const ledOf = (o: WorldObjectDef) => {
  const l = LED[o.kind] ?? LED_FRONT;
  const [x, y] = turnLocal(l.at[0], l.at[1], o.rot ?? 0, 1, 1);
  return { x: o.x + x, y: o.y + y, z: l.z, color: l.color };
};

interface Hosting {
  id: string;
  game: string;
  system: GameSystem;
  canvas: HTMLCanvasElement;
  emu: Emu | null;
  tv: TvStream;
  stream: MediaStream | null;
  view: HTMLVideoElement | null; // the host's own big picture (the canvas's stream)
  remote: Map<number, number>; // port → the buttons it holds (bits)
  local: number;
  localSticks: string; // (what my sticks last were, to only pass changes on)
  analog: [boolean, boolean]; // each pad's analog mode in the core (they start digital)
  saveAt: number;
  stopped: boolean;
}

interface TvView {
  def: WorldObjectDef;
  root: Container; // the picture, the CRT overlay, the static
  glow: Sprite; // on the floor in front, at night (one soft sprite)
  pic: Sprite;
  noise: Graphics;
  scan: Graphics;
  label: Text;
  source: HTMLVideoElement | HTMLCanvasElement | null;
  // a TV's picture is copied into this canvas each frame (Pixi's video textures
  // don't refresh on the engine's own loop; the 3D view reads only this one)
  frame: HTMLCanvasElement;
  avg: number; // the picture's average colour (for the glow)
  avgAt: number;
}

export class GameRoom {
  private tvs = new Map<string, TvView>();
  private cables = new Graphics();
  private live = new Map<string, Graphics>(); // console → its pads, LED (sorted with the room)
  private holder: HTMLDivElement; // off-screen: the emulator canvas
  private videoHolder: HTMLDivElement; // tiny, on screen: TV videos (LiveKit plays what's visible)
  private videoCss = document.createElement("style");
  private hosting: Hosting | null = null;
  private loading: [string, number, number] | null = null; // my disc coming down: console, bytes, of
  private keys = new Set<string>();
  private sentBits = 0;
  private focus: string | null = null; // the console / TV whose panel is open
  private zoomBack = 0;
  private viewSig = "";
  private sample = document.createElement("canvas");

  constructor(private w: WorldController) {
    // The emulator draws into a canvas kept off screen on purpose: once a
    // WebGL canvas is composited, Chrome clears its drawing buffer after each
    // frame and reading it back (the TV's picture, the glow's colour) gives
    // black; a canvas that's never composited stays readable, and its stream
    // (captureStream, for the TV) is taken from the drawing itself.
    this.holder = document.createElement("div");
    Object.assign(this.holder.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "640px",
      height: "480px",
      pointerEvents: "none",
    });
    this.videoHolder = document.createElement("div");
    Object.assign(this.videoHolder.style, {
      position: "fixed",
      left: "0",
      bottom: "0",
      width: "4px",
      height: "3px",
      overflow: "hidden",
      opacity: "0.01",
      pointerEvents: "none",
    });
    // every TV's video on the same few pixels: one laid out below another is off
    // screen, and LiveKit stops sending what isn't seen (a second TV went black)
    this.videoHolder.className = "yt-tv-videos";
    this.videoCss.textContent = ".yt-tv-videos>video{position:absolute;left:0;top:0;width:100%;height:100%}";
    document.head.append(this.videoCss);
    document.body.append(this.holder, this.videoHolder);
    this.cables.zIndex = -0.5;
    this.w.engine?.mountLive(this.cables);
    this.sample.width = 8;
    this.sample.height = 6;
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
  }

  private get engine() {
    return this.w.engine;
  }
  private get state(): S {
    return this.w.room?.state;
  }
  private get mySid(): string {
    return this.w.room?.sessionId ?? "";
  }
  private obj(id: string): WorldObjectDef | undefined {
    return this.engine?.getObject(id);
  }
  private rect(o: WorldObjectDef) {
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    return { x: o.x, y: o.y, w, h };
  }
  private consoleOf(id: string): S | undefined {
    return this.state?.consoles?.get(id);
  }

  // ── the room's things changed ────────────────────────────────────────────
  refresh() {
    const engine = this.engine;
    if (!engine) return;
    const tvs = engine.allObjects().filter((o) => isGameTv(o.kind));
    const keep = new Set(tvs.map((o) => o.id));
    for (const [id, v] of this.tvs)
      if (
        !keep.has(id) ||
        v.def.x !== this.obj(id)?.x ||
        v.def.y !== this.obj(id)?.y ||
        v.def.rot !== this.obj(id)?.rot
      ) {
        v.root.destroy({ children: true });
        v.glow.destroy();
        this.tvs.delete(id);
      }
    for (const def of tvs) {
      const old = this.tvs.get(def.id);
      if (old) {
        old.def = def;
        continue;
      }
      this.tvs.set(def.id, this.mountTv(def));
    }
    for (const [id, g] of this.live)
      if (!this.obj(id)) {
        g.destroy();
        this.live.delete(id);
      }
  }

  // A TV's picture: a sprite mapped onto the glass (whichever way the TV turns).
  private mountTv(def: WorldObjectDef): TvView {
    const root = new Container();
    const pic = new Sprite(Texture.EMPTY);
    const noise = new Graphics();
    const scan = new Graphics();
    // scanlines and a soft vignette, in the picture's own 640 × 480
    for (let y = 0; y < 480; y += 4) scan.rect(0, y, 640, 1.6).fill({ color: 0x000000, alpha: 0.22 });
    for (let i = 0; i < 6; i++)
      scan.roundRect(i * 6, i * 6, 640 - i * 12, 480 - i * 12, 40).stroke({ width: 12, color: 0x000000, alpha: 0.12 });
    scan.roundRect(30, 22, 260, 70, 30).fill({ color: 0xffffff, alpha: 0.05 });
    const label = new Text({
      text: "NO SIGNAL",
      style: { fontFamily: "monospace", fontSize: 56, fill: 0xf2e8d2, letterSpacing: 6 },
    });
    label.anchor.set(0.5);
    label.position.set(320, 240);
    root.addChild(pic, noise, label, scan);
    root.visible = false;
    const glow = glowSprite();
    glow.zIndex = -0.4;
    // just above the TV's front slice (scene.ts: a 2-tile item sorts per tile)
    root.zIndex = def.x + def.y + 2 + 0.003;
    this.engine?.mountLive(glow);
    this.engine?.mountLive(root);
    const frame = document.createElement("canvas");
    frame.width = 320;
    frame.height = 240;
    return { def, root, glow, pic, noise, scan, label, source: null, frame, avg: 0x6080a0, avgAt: 0 };
  }

  // ── every frame ──────────────────────────────────────────────────────────
  frame(_dt: number, me: { x: number; y: number }) {
    if (!this.state?.consoles) return;
    const pk = hud.get().panel;
    const focus =
      (pk.kind === "console" || pk.kind === "tv") && pk.objectId && this.obj(pk.objectId) ? pk.objectId : null;
    this.lean(focus);
    this.syncHosting();
    this.pad();
    this.hostVolume(me);
    this.drawTvs(me);
    this.drawLcds();
    this.foley(me);
    this.drawConsoles();
    this.publish(pk.kind === "console" || pk.kind === "tv" ? (pk.objectId ?? null) : null, me);
  }

  // What I hear of the console I run: the core plays straight to my speakers,
  // so its volume is set here — the TV's knob, my TV & video setting and how
  // far I stand, the same as everyone else hears it from the TV.
  private hostVolume(me: { x: number; y: number }) {
    const h = this.hosting;
    if (!h?.emu) return;
    const o = this.obj(h.id);
    const tv = o && typeof o.props?.tv === "string" ? this.obj(o.props.tv) : undefined;
    let gain = prefs().vol.tv;
    if (tv) {
      const spot = { ...displaySpot(tv), dnd: false };
      const ear = { x: me.x, y: me.y, dnd: false };
      gain = hearingGain(this.w.map, ear, spot, true) * 0.9 * prefs().vol.tv * tvVolume(tv);
    }
    h.emu.volume(gain);
  }

  // I hold a pad somewhere (shown with it in my hands).
  // My pad's in use: I hold one and its console's panel is open (the keyboard
  // and the gamepad play the game, not the world).
  playing(): boolean {
    return !!this.myPad();
  }

  atPad(): boolean {
    const sid = this.mySid;
    for (const c of this.state?.consoles?.values() ?? []) if (c.p1 === sid || c.p2 === sid) return true;
    return false;
  }

  // ── leaning in over the TV (a console's or a TV's panel open) ──────────
  private lean(focus: string | null) {
    if (focus === this.focus) return;
    const engine = this.engine;
    if (!engine) return;
    const o = focus ? this.obj(focus) : undefined;
    const tv = o && (isGameTv(o.kind) ? o : typeof o.props?.tv === "string" ? this.obj(o.props.tv) : undefined);
    if (tv) {
      const { w, h } = footprint(tv.kind, tv.rot ?? 0);
      if (!this.focus) this.zoomBack = engine.getZoom();
      engine.pinCamera({ x: tv.x + w / 2, y: tv.y + h / 2 + 0.6, z: 34, zoom: 2.6, ease: true });
      engine.seeThrough = { x: tv.x, y: tv.y, w, h };
    } else if (this.focus) {
      engine.pinCamera(null);
      engine.seeThrough = null;
      if (this.zoomBack) engine.setZoom(this.zoomBack);
    }
    this.focus = focus;
  }

  // ── hosting: the server says I run a console ───────────────────────────
  // One emulator at a time, and one after the other: the last one's let go of
  // (saved — so whoever carries it on starts from there — and exited) before
  // the next one boots.
  private switching: Promise<void> | null = null;
  private syncHosting() {
    if (this.switching) return;
    const sid = this.mySid;
    let mine: [string, S] | null = null;
    for (const [id, c] of this.state.consoles as Map<string, S>) if (c.host === sid) mine = [id, c];
    const h = this.hosting;
    const stop = !!h && (!mine || mine[0] !== h.id);
    const next = mine && (!h || stop) ? mine : null;
    if (!stop && !next) return;
    this.switching = (async () => {
      if (stop) await this.stopHosting();
      // (a launch that never finishes doesn't hold everything up)
      if (next) await Promise.race([this.startHosting(next[0], next[1]), new Promise((r) => setTimeout(r, 30_000))]);
    })().finally(() => {
      this.switching = null;
    });
  }

  private async startHosting(id: string, c: S) {
    const system = c.system as GameSystem;
    const canvas = document.createElement("canvas");
    this.holder.append(canvas);
    const h: Hosting = {
      id,
      game: c.game,
      system,
      canvas,
      emu: null,
      tv: this.streamFor(id),
      stream: null,
      view: null,
      remote: new Map(),
      local: 0,
      localSticks: "",
      analog: [false, false],
      saveAt: performance.now() + AUTOSAVE_MS,
      stopped: false,
    };
    this.hosting = h;
    const spaceId = hud.get().spaceId;
    try {
      // the disc console needs the team's BIOS (the panel says so before it's
      // turned on; this is for whoever carries on). The dev stack's test BIOS
      // isn't one a core can run: with it, the core's stand-in (HLE) boots.
      const all = isDiscSystem(system) ? await listBios(spaceId).catch(() => []) : [];
      if (isDiscSystem(system) && !all.length) {
        toast("This console needs its BIOS: bring one to the disc rack.", "warn");
        this.w.send("game:power", { id, on: false });
        return;
      }
      // (an uploaded disc: its files and hash, from the library; it comes down
      // once per computer, the panel shows how far)
      const game = c.game.startsWith("u:") ? (await library(spaceId)).find((g) => g.id === c.game) : undefined;
      const [{ blob: rom, name, more: tracks }, sram, state] = await Promise.all([
        romOf(spaceId, c.game, system, {
          game,
          onProgress: (done, total) => {
            this.loading = total > 32 * 1024 * 1024 && done < total ? [id, done, total] : null;
          },
        }),
        loadSave(spaceId, c.game, "sram"),
        c.resumes > 0 ? loadSave(spaceId, c.game, "state") : Promise.resolve(null),
      ]).finally(() => {
        this.loading = null;
      });
      // Through the BIOS (its start-up logo) with one of the disc's region: a
      // BIOS of another region shows its own menu instead, as the console
      // would — so for a USA / Japan disc and a BIOS of the other one, the core
      // gets the disc as a modded console reads it (region.ts relicense). Else
      // (a European disc and no European BIOS, or a disc without the logo's
      // data, like our test card) the core starts the disc itself.
      let bios: File[] | undefined;
      let logo = false;
      let blob: Blob = rom;
      let more = tracks;
      if (isDiscSystem(system)) {
        const real = all.filter((b) => b.model !== "Test BIOS");
        const files = [{ name, blob: rom }, ...tracks.map((f) => ({ name: f.name, blob: f as Blob }))];
        const [region, drawn] = await Promise.all([
          discRegion(files).catch(() => null),
          hasBootLogo(files).catch(() => false),
        ]);
        const fits = drawn ? real.find((b) => biosFits(b.region, region)) : undefined;
        const other = drawn && !fits && ntsc(region) ? real.find((b) => ntsc(b.region)) : undefined;
        if (other) {
          const moved = await relicense(files, other.region as Region).catch(() => files);
          blob = moved[0].blob;
          more = moved.slice(1).map((f) => f.blob as File);
        }
        logo = !!(fits ?? other);
        if (!logo && drawn && region && real.length)
          toast(
            `No ${REGION_NAMES[region]} BIOS in this space: the game starts without the PlayStation logo. Bring one (${REGION_BIOS[region]}) to the disc rack for it.`,
          );
        bios = await biosFiles(spaceId, fits ? [fits] : other ? [other] : real);
      }
      if (h.stopped) return;
      h.emu = await startEmu({
        system,
        rom: blob,
        romName: name,
        more,
        bios,
        ...(isDiscSystem(system)
          ? { coreConfig: { pcsx_rearmed_show_bios_bootlogo: logo ? "enabled" : "disabled" } }
          : {}),
        canvas,
        sram,
        state,
        worldAudio: this.w.media.audioContext(),
      });
      if (h.stopped) return h.emu.exit();
      h.emu.onRumble(this.rumble);
      h.stream = canvas.captureStream(30);
      this.w.send("game:tv", { id });
    } catch (e) {
      console.warn("[games] couldn't start", e);
      toast("The console wouldn't start.", "warn");
      this.w.send("game:power", { id, on: false });
    }
  }

  // a TV stream that already knows who may watch it
  private streamFor(id: string): TvStream {
    const tv = new TvStream();
    const a = this.audiences.get(id);
    if (a) tv.setAudience(a.video, a.audio);
    return tv;
  }

  private async stopHosting() {
    const h = this.hosting;
    if (!h) return;
    h.stopped = true;
    this.hosting = null;
    await this.save(h);
    h.emu?.exit();
    await h.tv.stop();
    h.canvas.remove();
    h.view?.remove();
  }

  // Where it is now, for whoever carries on (and a battery save for next time).
  private async save(h: Hosting) {
    if (!h.emu) return;
    try {
      const [state, sram] = await Promise.all([h.emu.saveState().catch(() => null), h.emu.saveSRAM()]);
      await putSave(hud.get().spaceId, h.game, { state, sram });
    } catch {
      // nothing to save yet
    }
  }

  async saveNow(): Promise<boolean> {
    if (!this.hosting?.emu) return false;
    await this.save(this.hosting);
    return true;
  }

  onTvToken(m: ServerMessages["game:tv"]) {
    const h = this.hosting;
    if (!h || h.id !== m.id || !h.emu) return;
    const url = this.w.session?.livekitUrl ?? "";
    void h.tv.start(url, m.token, h.canvas, h.emu.audio()).then((ok) => {
      if (!h.stopped) this.w.send("game:live", { id: h.id, live: ok });
      // its sound may only start once the game makes some: look for it a while
      let tries = 0;
      const look = setInterval(() => {
        const sound = h.emu?.audio();
        if (h.stopped || h.tv.hasSound || ++tries > 40) return clearInterval(look);
        if (sound) void h.tv.addSound(sound);
      }, 500);
    });
  }

  // (kept for every console: it can arrive before the state saying I host it)
  private audiences = new Map<string, ServerMessages["game:audience"]>();
  onAudience(m: ServerMessages["game:audience"]) {
    this.audiences.set(m.id, m);
    if (this.hosting?.id === m.id) this.hosting.tv.setAudience(m.video, m.audio);
  }

  // Another player's pad: what changed goes into the emulator.
  // (a press and its release can arrive together — a quick tap, a busy
  // line: the press is held a few frames first, or the core never sees it)
  private pressedAt = new Map<number, number[]>(); // port → when each button went down
  onPad(m: ServerMessages["game:pad"]) {
    const h = this.hosting;
    if (!h?.emu || h.id !== m.id) return;
    const before = h.remote.get(m.port) ?? 0;
    const now = performance.now();
    const at = this.pressedAt.get(m.port) ?? [];
    this.pressedAt.set(m.port, at);
    let early = 0;
    PAD_BUTTONS.forEach((_, i) => {
      const b = 1 << i;
      if (m.bits & b && !(before & b)) at[i] = now;
      else if (before & b && !(m.bits & b) && now - (at[i] ?? 0) < MIN_HOLD_MS) early |= b;
    });
    const bits = m.bits | early;
    this.apply(h, m.port, before, bits);
    h.remote.set(m.port, bits);
    this.holding.set(m.port, m.bits);
    if (early)
      setTimeout(() => {
        if (this.hosting !== h || !h.emu) return;
        // the held-on ones go now, unless the player's pressed them again since
        const cur = h.remote.get(m.port) ?? 0;
        const next = cur & ~(early & ~(this.holding.get(m.port) ?? 0));
        this.apply(h, m.port, cur, next);
        h.remote.set(m.port, next);
      }, MIN_HOLD_MS);
    if (m.sticks) h.emu.sticks(m.port, m.sticks);
  }
  private holding = new Map<number, number>(); // port → what its player really holds now

  private apply(h: Hosting, port: number, before: number, after: number) {
    const changed = before ^ after;
    if (!changed || !h.emu) return;
    PAD_BUTTONS.forEach((b, i) => {
      if (changed & (1 << i)) h.emu?.press(port, b, !!(after & (1 << i)));
    });
  }

  // ── my pad ───────────────────────────────────────────────────────────────
  private onKey = (e: KeyboardEvent) => {
    if (e.type === "keydown") {
      if (SKIP_KEYS.has(e.code) || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!this.myPad()) return;
      this.keys.add(e.code);
      e.preventDefault();
    } else this.keys.delete(e.code);
  };
  private onBlur = () => this.keys.clear();

  // the console I hold a pad of, with its panel open (where my keys go)
  private myPad(): { id: string; port: number; system: GameSystem } | null {
    const pk = hud.get().panel;
    if (pk.kind !== "console" || !pk.objectId) return null;
    const c = this.consoleOf(pk.objectId);
    if (!c) return null;
    const port = c.p1 === this.mySid ? 1 : c.p2 === this.mySid ? 2 : 0;
    return port ? { id: pk.objectId, port, system: c.system as GameSystem } : null;
  }

  // the panel's on-screen pad (phones)
  private touchBits = 0;
  private touchSticks: [number, number, number, number] = [0, 0, 0, 0];
  touch(bits: number, sticks?: [number, number, number, number]) {
    this.touchBits = bits;
    if (sticks) this.touchSticks = sticks;
  }

  // The disc console's analog mode, for my pad: the server's told (the pad's
  // LED, for everyone); whoever runs it switches the core's pad to match.
  analog(id: string) {
    const p = this.myPad();
    const c = this.consoleOf(id);
    if (!p || p.id !== id || !c || !hasSticks(p.system)) return;
    this.w.send("game:analog", { id, on: !(p.port === 1 ? c.a1 : c.a2) });
  }
  // (hosting: each pad's mode in the core, as the console's state says)
  private syncAnalog(h: Hosting) {
    const c = this.consoleOf(h.id);
    if (!c || !h.emu || !hasSticks(h.system)) return;
    for (const [i, want] of [!!c.a1, !!c.a2].entries()) {
      if (h.analog[i] === want) continue;
      h.analog[i] = want;
      h.emu.analog(i + 1);
    }
  }

  private sentSticks = "";
  private pad() {
    const p = this.myPad();
    const read = p ? readPad(p.system, this.keys, this.touchBits) : null;
    const bits = read?.bits ?? 0;
    const sticks = read?.sticks ?? [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) sticks[i] = Math.max(-127, Math.min(127, sticks[i] + this.touchSticks[i]));
    const sticky = !!p && hasSticks(p.system);
    const h = this.hosting;
    if (h) this.syncAnalog(h);
    if (p && h && h.id === p.id) {
      this.apply(h, p.port, h.local, bits);
      h.local = bits;
      const sig = sticky ? sticks.join(",") : "";
      if (sig !== h.localSticks) {
        h.localSticks = sig;
        h.emu?.sticks(p.port, sticks);
      }
      return;
    }
    if (h?.local) {
      this.apply(h, 1, h.local, 0);
      h.local = 0;
    }
    // to whoever runs it: on a change (sticks: past a small step, so a stick
    // resting a hair off centre doesn't keep sending)
    const near = (a: string, b: number[]) => {
      const was = a ? a.split(",").map(Number) : [0, 0, 0, 0];
      return b.every((v, i) => Math.abs(v - was[i]) < 4 && (v === 0) === (was[i] === 0));
    };
    const moved = sticky && !near(this.sentSticks, sticks);
    if (bits !== this.sentBits || moved) {
      this.sentBits = bits;
      if (moved) this.sentSticks = sticks.join(",");
      if (p) this.w.send("game:pad", { id: p.id, bits, ...(sticky ? { sticks } : {}) });
    }
  }

  // The core's rumble, on my own pad when it's mine (port 1 at the host).
  private rumble = (port: number, r: { strong: number; weak: number; ms: number }) => {
    const h = this.hosting;
    const mine = this.myPad();
    if (!h || !mine || mine.id !== h.id || mine.port !== port) return;
    const gp = myGamepad() as
      | (Gamepad & { vibrationActuator?: { playEffect(t: string, p: object): Promise<unknown> } })
      | null;
    void gp?.vibrationActuator
      ?.playEffect("dual-rumble", { duration: r.ms || 200, strongMagnitude: r.strong, weakMagnitude: r.weak })
      .catch(() => {});
  };

  // ── drawing ──────────────────────────────────────────────────────────────
  // what a TV shows: the console on its input, if that's on
  private tvShows(tv: WorldObjectDef): { id: string; c: S } | null {
    const input = tvInput(tv);
    // (only while its cable's still in this TV: an older TV may still name it)
    const c = input && this.obj(input)?.props?.tv === tv.id ? this.consoleOf(input) : undefined;
    return input && c ? { id: input, c } : null;
  }

  private drawTvs(me: { x: number; y: number }) {
    const engine = this.engine;
    if (!engine) return;
    const now = performance.now();
    const night = engine.nightLevel();
    for (const v of this.tvs.values()) {
      const tv = v.def;
      const shows = this.tvShows(tv);
      const facing = glassFacing(tv); // the glass faces the room
      // the picture's source: my emulator, or the TV's video
      let src: HTMLVideoElement | HTMLCanvasElement | null = null;
      if (shows) {
        if (this.hosting?.id === shows.id && this.hosting.emu) src = this.hosting.canvas;
        else {
          const el = this.w.tvVideos.get(`tv-${shows.id}`) ?? null;
          if (el && !el.isConnected) this.videoHolder.append(el);
          src = el;
        }
        // its sound, from where the TV is (the host hears the console itself)
        const spot = { ...displaySpot(tv), dnd: false };
        const ear = { x: me.x, y: me.y, dnd: false };
        this.w.media.setVoice(
          `tv-${shows.id}`,
          hearingGain(this.w.map, ear, spot, true) * 0.9 * prefs().vol.tv * tvVolume(tv),
          stereoPan(ear, spot),
        );
      }
      if (src !== v.source) {
        v.source = src;
        v.pic.texture = !src ? Texture.EMPTY : Texture.from(src instanceof HTMLVideoElement ? v.frame : src);
      }
      // (my emulator's picture too: the 3D view takes the 2D copy, never the
      // emulator's WebGL canvas itself — Firefox showed nothing on a 3D TV from that)
      if (src && (!(src instanceof HTMLVideoElement) || src.readyState >= 2))
        v.frame.getContext("2d")?.drawImage(src, 0, 0, v.frame.width, v.frame.height);
      // the engine draws on its own loop (not Pixi's ticker): push each new frame up
      if (src) v.pic.texture.source.update();
      const on = !!shows;
      v.root.visible = on && facing;
      v.glow.visible = false;
      if (!on) continue;
      // map the 640 × 480 picture onto its glass (letterboxed on a wide one)
      const g = glassCorners(tv);
      if (!g) continue;
      const f = Math.min(1, GAME_ASPECT / (GLASS[tv.kind]?.aspect ?? GAME_ASPECT));
      const along = (t: number) => toScreen(g.tl[0] + (g.tr[0] - g.tl[0]) * t, g.tl[1] + (g.tr[1] - g.tl[1]) * t);
      const tl = along((1 - f) / 2);
      const tr = along((1 + f) / 2);
      const { zTop, zBot } = g;
      const front = engine.frontKey(tv.id);
      if (front != null) v.root.zIndex = front + 0.004;
      const m = new Matrix((tr.x - tl.x) / 640, (tr.y - tl.y) / 640, 0, (zTop - zBot) / 480, tl.x, tl.y - zTop);
      v.root.setFromMatrix(m);
      const picture = !!src && !!shows.c.host;
      v.pic.visible = picture;
      v.pic.width = 640;
      v.pic.height = 480;
      v.label.visible = !picture;
      v.scan.visible = GLASS[tv.kind]?.look === "crt"; // scanlines on a tube, not a flat panel
      v.noise.clear();
      if (!picture) {
        // a blue "no signal" screen with a little snow
        v.noise.rect(0, 0, 640, 480).fill(0x1d3f8a);
        for (let i = 0; i < 90; i++)
          v.noise.rect(Math.random() * 640, Math.random() * 480, 6, 3).fill({ color: 0xffffff, alpha: 0.18 });
      }
      v.root.alpha = engine.partAlpha(tv.id); // (cut-away walls, a builder's hand)
      // the glow on the floor in front of it, coloured like the picture
      if (night > 0.05) {
        if (picture && src && now - v.avgAt > 300) {
          v.avgAt = now;
          v.avg = this.average(src, v.avg);
        }
        const at = displaySpot(tv);
        const c = toScreen(at.x, at.y);
        placeGlow(v.glow, c.x, c.y, TILE_W * 3, TILE_H * 3, picture ? v.avg : 0x2a55c0, 0.32 * night);
      }
    }
  }

  // The disc consoles' sounds as their state changes (the lid up / down, on /
  // off and the disc spinning), from where each one is. What's there when we
  // first look is taken as it is (no sounds for a space just joined).
  private heard = new Map<string, { lid: string; on: boolean }>();
  private foley(me: { x: number; y: number }) {
    const engine = this.engine;
    if (!engine) return;
    for (const o of engine.allObjects()) {
      if (!isConsole(o.kind) || !isDiscSystem(CONSOLES[o.kind])) continue;
      const now = { lid: String(o.props?.lid ?? ""), on: !!this.consoleOf(o.id) };
      const was = this.heard.get(o.id);
      this.heard.set(o.id, now);
      if (!was) continue;
      const g = hearingGain(
        this.w.map,
        { x: me.x, y: me.y, dnd: false },
        { x: o.x + 0.5, y: o.y + 0.5, dnd: false },
        true,
      );
      if (now.lid !== was.lid && (now.lid === "open" || was.lid === "open")) sound.lid(now.lid === "open", g);
      if (now.on !== was.on) {
        sound.power(g);
        setTimeout(() => sound.spin(now.on, g), now.on ? 250 : 80);
      }
    }
  }

  // The slim console's own screen, flipped up: the game it's running — my
  // emulator's picture, or the TV's video for everyone else — on its glass.
  private lcds = new Map<string, LcdView>();
  private drawLcds() {
    const engine = this.engine;
    if (!engine) return;
    const seen = new Set<string>();
    for (const o of engine.allObjects()) {
      if (!hasLcd(o)) continue;
      const c = this.consoleOf(o.id);
      let src: HTMLVideoElement | HTMLCanvasElement | null = null;
      if (c?.host) {
        if (this.hosting?.id === o.id && this.hosting.emu) src = this.hosting.canvas;
        else {
          const el = this.w.tvVideos.get(`tv-${o.id}`) ?? null;
          if (el && !el.isConnected) this.videoHolder.append(el);
          src = el && el.readyState >= 2 ? el : null;
        }
      }
      if (!src) continue;
      seen.add(o.id);
      let v = this.lcds.get(o.id);
      if (!v) {
        const root = new Container();
        const pic = new Sprite(Texture.EMPTY);
        root.addChild(pic);
        engine.mountLive(root);
        const frame = document.createElement("canvas");
        frame.width = 320;
        frame.height = 240;
        v = { root, pic, frame, source: null, at: null };
        this.lcds.set(o.id, v);
      }
      if (src !== v.source) {
        v.source = src;
        v.pic.texture = Texture.from(v.frame);
      }
      v.frame.getContext("2d")?.drawImage(src, 0, 0, v.frame.width, v.frame.height);
      v.pic.texture.source.update();
      // its glass, turned with the console
      const rot = o.rot ?? 0;
      const a = turnLocal(LCD.x0, LCD.y, rot, 1, 1);
      const b = turnLocal(LCD.x1, LCD.y, rot, 1, 1);
      v.at = { tl: [o.x + a[0], o.y + a[1]], tr: [o.x + b[0], o.y + b[1]], zTop: LCD.z1, zBot: LCD.z0 };
      // iso: only when its glass faces the room (as the TVs')
      const r = rot & 3;
      v.root.visible = r === 0 || r === 3;
      const tl = toScreen(v.at.tl[0], v.at.tl[1]);
      const tr = toScreen(v.at.tr[0], v.at.tr[1]);
      v.root.zIndex = (engine.frontKey(o.id) ?? o.x + o.y + 1) + 0.004;
      v.root.setFromMatrix(
        new Matrix((tr.x - tl.x) / 320, (tr.y - tl.y) / 320, 0, (LCD.z1 - LCD.z0) / 240, tl.x, tl.y - LCD.z1),
      );
      v.pic.width = 320;
      v.pic.height = 240;
      v.root.alpha = engine.partAlpha(o.id);
    }
    for (const [id, v] of this.lcds)
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.lcds.delete(id);
      }
  }

  // the picture's average colour (8 × 6 pixels), a little brighter
  private average(src: HTMLVideoElement | HTMLCanvasElement, fallback: number): number {
    try {
      const g = this.sample.getContext("2d", { willReadFrequently: true });
      if (!g) return fallback;
      g.drawImage(src, 0, 0, 8, 6);
      const d = g.getImageData(0, 0, 8, 6).data;
      let r = 0;
      let gg = 0;
      let b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        gg += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      const lift = (v: number) => Math.min(255, Math.round((v / n) * 1.3 + 30));
      return (lift(r) << 16) | (lift(gg) << 8) | lift(b);
    } catch {
      return fallback;
    }
  }

  // Cables, pads (in hands or lying by the console), power LEDs.
  private drawConsoles() {
    const engine = this.engine;
    if (!engine) return;
    this.cables.clear();
    for (const o of engine.allObjects()) {
      if (!isConsole(o.kind)) continue;
      const system = CONSOLES[o.kind];
      const c = this.consoleOf(o.id);
      let g = this.live.get(o.id);
      if (!g) {
        g = new Graphics();
        engine.mountLive(g);
        this.live.set(o.id, g);
      }
      g.clear();
      g.zIndex = o.x + o.y + 1.02;
      const base = toScreen(o.x + 0.5, o.y + 0.72); // its front, on the floor
      // the cable to its TV: along the floor, sagging a little
      const tv = typeof o.props?.tv === "string" ? this.obj(o.props.tv) : undefined;
      // …or in my hands, on the way to one (rising from the floor to them)
      const me = !tv && hud.get().cable?.consoleId === o.id ? engine.avatarAt(this.mySid) : null;
      if (me) {
        const back = toScreen(o.x + 0.5, o.y + 0.3);
        const feet = toScreen(me.x, me.y);
        const hand = { x: feet.x - 4, y: feet.y - (me.sitting ? PAD_Z_SIT : PAD_Z_STAND) };
        const mid = { x: (back.x + feet.x) / 2, y: Math.max(back.y, feet.y) + 4 };
        g.moveTo(back.x, back.y - 1)
          .quadraticCurveTo(mid.x, mid.y, feet.x - 2, feet.y - 1)
          .quadraticCurveTo(feet.x - 7, feet.y - 10, hand.x, hand.y)
          .stroke({ width: 1.6, color: 0x15120f, alpha: 0.9 });
        g.rect(hand.x - 1.5, hand.y - 3.5, 3, 4).fill(0x2a2622); // the plug
        g.zIndex = Math.max(g.zIndex, me.x + me.y + 0.03);
      }
      if (tv) {
        const { w, h } = footprint(tv.kind, tv.rot ?? 0);
        const back = toScreen(o.x + 0.5, o.y + 0.3);
        const end = toScreen(tv.x + w / 2, tv.y + h / 2);
        const mid = { x: (back.x + end.x) / 2 + 6, y: (back.y + end.y) / 2 + 5 };
        this.cables
          .moveTo(back.x, back.y - 1)
          .quadraticCurveTo(mid.x, mid.y, end.x, end.y)
          .stroke({ width: 1.6, color: 0x15120f, alpha: 0.85 })
          .moveTo(back.x, back.y - 1.4)
          .quadraticCurveTo(mid.x, mid.y - 0.4, end.x, end.y - 0.4)
          .stroke({ width: 0.5, color: 0x5a5650, alpha: 0.7 });
      }
      // the power LED
      if (c) {
        const l = ledOf(o);
        const led = toScreen(l.x, l.y);
        g.circle(led.x, led.y - l.z, 1.6).fill({ color: l.color, alpha: 0.35 });
        g.circle(led.x, led.y - l.z, 0.8).fill(l.color);
      }
      // the pads: a held one at its player's hands, cord back to the console
      const ports = SYSTEMS[system].ports;
      for (let port = 1; port <= ports; port++) {
        const sid = c ? (port === 1 ? c.p1 : c.p2) : "";
        const at = sid ? engine.avatarAt(sid) : null;
        let px: number;
        let py: number;
        if (at) {
          const s = toScreen(at.x, at.y);
          px = s.x + (port === 1 ? -3 : 3);
          py = s.y - (at.sitting ? PAD_Z_SIT : PAD_Z_STAND);
        } else {
          const s = toScreen(o.x + (port === 1 ? 0.22 : 0.78), o.y + 0.86);
          px = s.x;
          py = s.y - 0.6;
        }
        g.moveTo(base.x + (port === 1 ? -3 : 3), base.y - 1)
          .quadraticCurveTo((base.x + px) / 2, Math.max(base.y, py) + 6, px, py)
          .stroke({ width: 0.7, color: 0x15120f, alpha: 0.85 });
        this.drawPad(g, system, px, py, !!at);
      }
      if (c) {
        // held pads sort with their players
        const holders = [c.p1, c.p2].map((sid: string) => (sid ? engine.avatarAt(sid) : null)).filter(Boolean);
        for (const a of holders) if (a) g.zIndex = Math.max(g.zIndex, a.x + a.y + 0.03);
      }
    }
  }

  // A pad, about 9 × 5 px, in its console's style.
  private drawPad(g: Graphics, system: GameSystem, x: number, y: number, held: boolean) {
    const s = held ? 1 : 0.85;
    switch (system) {
      case "ps1":
        // the twin-grip pad: the grips hanging down, two sticks, the shape buttons
        for (const dx of [-3.1, 3.1])
          g.ellipse(x + dx * s, y + 1.3 * s, 1.7 * s, 2 * s)
            .fill(0xb9b6af)
            .stroke({ width: 0.4, color: INK });
        g.roundRect(x - 4.8 * s, y - 2.3 * s, 9.6 * s, 3.4 * s, 1.6 * s)
          .fill(0xb9b6af)
          .stroke({ width: 0.4, color: INK });
        for (const dx of [-1.2, 1.2]) g.circle(x + dx * s, y + 0.5 * s, 0.75 * s).fill(0x2a2826);
        g.rect(x - 3.6 * s, y - 1.25 * s, 1.6 * s, 0.5 * s).fill(0x2a2826);
        g.rect(x - 3.05 * s, y - 1.8 * s, 0.5 * s, 1.6 * s).fill(0x2a2826);
        for (const [i, col] of [0x5fae8a, 0xd0524a, 0x6f8fd0, 0xd889b8].entries())
          g.circle(x + (2.9 + [0, 0.7, 0, -0.7][i]) * s, y + (-1 + [-0.6, 0, 0.6, 0][i]) * s, 0.42 * s).fill(col);
        break;
      case "2600":
        g.roundRect(x - 3.5 * s, y - 2 * s, 7 * s, 4 * s, 1)
          .fill(0x1c1a18)
          .stroke({ width: 0.4, color: INK });
        g.moveTo(x, y - 1)
          .lineTo(x, y - 5 * s)
          .stroke({ width: 1.2, color: 0x1c1a18 });
        g.circle(x + 2.2 * s, y - 1.6 * s, 0.9 * s).fill(0xc4402b);
        break;
      case "md":
        g.ellipse(x, y, 5 * s, 2.6 * s)
          .fill(0x1c1b1a)
          .stroke({ width: 0.4, color: INK });
        g.circle(x + 2 * s, y - 0.4, 0.6 * s).fill(0x6a6864);
        g.circle(x - 2.2 * s, y - 0.2, 0.9 * s).fill(0x3a3836);
        break;
      case "snes":
        g.roundRect(x - 5 * s, y - 2.2 * s, 10 * s, 4.4 * s, 2.2 * s)
          .fill(0xc7c3bb)
          .stroke({ width: 0.4, color: INK });
        for (const [i, col] of [0xc4402b, 0xf0a12c, 0x7fa34a, 0x4f86c6].entries())
          g.circle(x + 2 * s + (i % 2) * 1.4 * s, y - 0.8 * s + Math.floor(i / 2) * 1.4 * s, 0.55 * s).fill(col);
        break;
      default:
        g.rect(x - 4.5 * s, y - 2 * s, 9 * s, 4 * s)
          .fill(system === "nes" ? 0xbdb8ae : 0x8d877a)
          .stroke({ width: 0.4, color: INK });
        g.rect(x - 4.5 * s, y - 0.6 * s, 9 * s, 1.4 * s).fill(0x2b2a28);
        g.circle(x + 2 * s, y + 0.1, 0.6 * s).fill(0xc4402b);
        g.circle(x + 3.4 * s, y + 0.1, 0.6 * s).fill(0xc4402b);
    }
  }

  // ── the panel's view ────────────────────────────────────────────────────
  private publish(id: string | null, me: { x: number; y: number }) {
    const o = id ? this.obj(id) : undefined;
    if (!o) {
      if (this.viewSig) {
        this.viewSig = "";
        hud.set({ game: null });
      }
      return;
    }
    const near = gap({ x: me.x, y: me.y, w: 0, h: 0 }, this.rect(o)) <= PAD_REACH;
    let view: GameView;
    if (isGameTv(o.kind)) {
      const inputs = (this.engine?.allObjects() ?? [])
        .filter((x) => isConsole(x.kind) && x.props?.tv === o.id)
        .map((x, i) => ({
          id: x.id,
          label: `AV${i + 1}`,
          title: this.consoleOf(x.id)?.title || String(x.props?.cartTitle ?? ""),
          on: !!this.consoleOf(x.id),
        }));
      const showing = tvInput(o);
      const c = showing ? this.consoleOf(showing) : undefined;
      view = {
        id: o.id,
        kind: o.kind,
        system: c?.system ?? "",
        tv: o.id,
        tvs: [],
        cart: null,
        on: !!c,
        host: c?.hostName ?? "",
        hostMe: !!c && c.host === this.mySid,
        live: !!c?.live,
        ports: [],
        myPort: 0,
        near,
        inputs,
        input: showing,
      };
    } else {
      const c = this.consoleOf(o.id);
      const system = CONSOLES[o.kind];
      // the TVs its cable reaches, nearest first
      const tvs = (this.engine?.allObjects() ?? [])
        .map((x) => ({ id: x.id, kind: x.kind, d: gap(this.rect(o), this.rect(x)) }))
        .filter((x) => isGameTv(x.kind) && x.d <= CABLE_REACH)
        .sort((a, b) => a.d - b.d)
        .map((x) => `${x.id}|${x.d.toFixed(1)}`);
      const ports = Array.from({ length: SYSTEMS[system].ports }, (_, i) => {
        const sid = c ? (i === 0 ? c.p1 : c.p2) : "";
        return {
          name: sid ? (i === 0 ? c.p1Name : c.p2Name) : "",
          me: !!sid && sid === this.mySid,
          analog: !!c && !!(i === 0 ? c.a1 : c.a2),
        };
      });
      view = {
        id: o.id,
        kind: o.kind,
        system,
        tv: typeof o.props?.tv === "string" && this.obj(o.props.tv) ? o.props.tv : null,
        tvs,
        cart:
          typeof o.props?.cart === "string"
            ? {
                id: o.props.cart,
                title: String(o.props.cartTitle ?? ""),
                color: String(o.props.cartColor ?? "#efe4cc"),
              }
            : null,
        on: !!c,
        host: c?.hostName ?? "",
        hostMe: !!c && c.host === this.mySid,
        live: !!c?.live,
        ports,
        myPort: ports.findIndex((p) => p.me) + 1,
        near,
        // (in steps of 1 %: the view's re-published only when it changes)
        loading:
          this.loading?.[0] === o.id
            ? [Math.floor((this.loading[1] / this.loading[2]) * 100) * (this.loading[2] / 100), this.loading[2]]
            : null,
      };
    }
    const sig = JSON.stringify(view);
    if (sig === this.viewSig) return;
    this.viewSig = sig;
    hud.set({ game: view });
  }

  // The big picture for a panel: my own game (its stream), or the TV's video.
  screen(consoleId: string): HTMLVideoElement | null {
    const h = this.hosting;
    if (h && h.id === consoleId && h.stream) {
      if (!h.view) {
        h.view = document.createElement("video");
        h.view.muted = true;
        h.view.autoplay = true;
        h.view.playsInline = true;
        h.view.srcObject = h.stream;
      }
      return h.view;
    }
    return this.w.tvVideos.get(`tv-${consoleId}`) ?? null;
  }
  // a panel is done with a picture: TV videos go back to where LiveKit plays them small
  release(el: HTMLVideoElement) {
    if (this.hosting?.view === el) return el.remove();
    this.videoHolder.append(el);
  }

  // for the third-person view: the cables, the pads (by their console or in
  // someone's hands, cord back to it), the power LEDs — as iso draws them
  scene3d(): GameScene3 {
    const out: GameScene3 = { cables: [], pads: [], leds: [] };
    for (const o of this.engine?.allObjects() ?? []) {
      if (!isConsole(o.kind)) continue;
      const c = this.consoleOf(o.id);
      const tv = typeof o.props?.tv === "string" ? this.obj(o.props.tv) : undefined;
      if (tv) {
        const from = { x: o.x + 0.5, y: o.y + 0.3 };
        const g = GLASS[tv.kind]?.wall ? glassCorners(tv) : null;
        if (g) {
          // up the wall to the bottom of the screen
          const at = { x: (g.tl[0] + g.tr[0]) / 2, y: (g.tl[1] + g.tr[1]) / 2 };
          out.cables.push({ from, to: at, up: g.zBot });
        } else {
          const { w, h } = footprint(tv.kind, tv.rot ?? 0);
          out.cables.push({ from, to: { x: tv.x + w / 2, y: tv.y + h / 2 }, up: 0 });
        }
      }
      if (c) {
        const l = ledOf(o);
        // (the front LED a touch out of the face; the disc ones' on their tops)
        out.leds.push(LED[o.kind] ? { x: l.x, y: l.y, h: zt(l.z), color: l.color } : { x: o.x + 0.3, y: o.y + 0.8 });
      }
      const system = CONSOLES[o.kind];
      for (let port = 1; port <= SYSTEMS[system].ports; port++) {
        const sid: string = c ? (port === 1 ? c.p1 : c.p2) : "";
        out.pads.push({
          key: `${o.id}|${port}`,
          system,
          port,
          cord: { x: o.x + (port === 1 ? 0.4 : 0.6), y: o.y + 0.72 },
          rest: { x: o.x + (port === 1 ? 0.22 : 0.78), y: o.y + 0.86 },
          holder: sid || null,
          sitting: !!(sid && this.engine?.avatarAt(sid)?.sitting),
          analog: !!c && !!(port === 1 ? c.a1 : c.a2),
        });
      }
    }
    return out;
  }

  // for the third-person view: what each TV shows now (the console's picture)
  pictures(): { def: WorldObjectDef; canvas: HTMLCanvasElement; at?: Corners }[] {
    const out: { def: WorldObjectDef; canvas: HTMLCanvasElement; at?: Corners }[] = [];
    for (const v of this.tvs.values()) if (v.source) out.push({ def: v.def, canvas: v.frame });
    // the slim consoles' own screens (their glass isn't a TV's: its corners come along)
    for (const [id, v] of this.lcds) {
      const def = this.obj(id);
      if (def && v.at) out.push({ def, canvas: v.frame, at: v.at });
    }
    return out;
  }

  dispose() {
    for (const v of this.lcds.values()) v.root.destroy({ children: true });
    this.lcds.clear();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    void this.stopHosting();
    this.lean(null);
    for (const v of this.tvs.values()) {
      v.root.destroy({ children: true });
      v.glow.destroy();
    }
    for (const g of this.live.values()) g.destroy();
    this.cables.destroy();
    this.holder.remove();
    this.videoHolder.remove();
    this.videoCss.remove();
  }
}

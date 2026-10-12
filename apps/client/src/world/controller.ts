"use client";

import {
  ANIM,
  areaAt,
  type ChatScope,
  type ClientMessages,
  canPlace,
  dirFromDelta,
  doorCentre,
  doorEdge,
  type Edge,
  EMOTES,
  type Emote,
  edgeAt,
  edgeBlocker,
  entry,
  FLOORS,
  findPath,
  footprint,
  Grid,
  getMap,
  HEAR_RADIUS,
  hearingGain,
  isPrivate,
  isTheme,
  isWallEdge,
  type MapDef,
  moveStep,
  nearestEdge,
  type Point,
  parseAvatar,
  ROOM_NAME,
  RUN_SPEED,
  type ServerMessages,
  STEP_LABELS,
  screenInputToWorld,
  stereoPan,
  TICK_HZ,
  tileAt,
  VOID,
  WALK_SPEED,
  type WbItem,
  type WorldObjectDef,
} from "@yutopia/shared";
import { Client, getStateCallbacks, type Room } from "colyseus.js";
import { ApiError, type Session, yutopia } from "@/lib/api";
import { disconnectEcho, getEcho } from "@/lib/echo";
import { tr } from "@/lib/i18n";
import { deviceQuality, prefs, type Quality, resolveQuality, subscribePrefs } from "@/lib/prefs";
import { mixer } from "./audio";
import { type AvatarState, WorldEngine } from "./engine";
import { Media } from "./media";
import { radio, sound } from "./sound";
import { hud, type Person, toast } from "./store";

// biome-ignore lint/suspicious/noExplicitAny: decoded Colyseus schema objects
type S = any;

interface Remote {
  buf: { t: number; x: number; y: number }[];
  d: number;
  a: number;
}

const INTERP_MS = 110;
const INTERACT_RANGE = 1.7;

export class WorldController {
  engine: WorldEngine | null = null;
  room: Room<S> | null = null;
  media: Media;
  session: Session | null = null;
  map!: MapDef;
  grid!: Grid;
  private host: HTMLElement;
  private spaceId: number;
  private keys = new Set<string>();
  private path: Point[] | null = null;
  private pathTarget: { objectId?: string } | null = null;
  private me = { x: 0, y: 0, d: 0, a: 0 as number };
  private lastSent = { x: 0, y: 0, d: 0, a: 0, t: 0 };
  private seq = 0;
  private remotes = new Map<string, Remote>();
  private npcBuf = new Map<string, { t: number; x: number; y: number }[]>();
  private hear = new Set<string>();
  private raf = 0;
  private lastFrame = 0;
  private stopped = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private offPrefs: (() => void) | null = null;
  private boardChannels: string[] = [];
  private reconnecting = false;
  private peopleAt = 0;
  private followAt = 0;
  private uidToSid = new Map<number, string>();
  onOpenPanel: (kind: string, objectId?: string) => void = () => {};

  constructor(host: HTMLElement, spaceId: number) {
    this.host = host;
    this.spaceId = spaceId;
    this.media = new Media({
      onTracksChanged: (m) => {
        hud.set((s) => ({ media: { ...s.media, mic: m.mic, cam: m.cam, screen: m.screen } }));
        this.send("media", m);
      },
      onVideo: (uid, el, kind) => {
        hud.set((s) => {
          const key = kind === "screen" ? "screens" : "videos";
          const next = { ...s[key] };
          if (el) next[uid] = el;
          else delete next[uid];
          return { [key]: next } as Partial<typeof s>;
        });
        this.syncStageScreen();
      },
      onSpeaking: (on) => this.send("speaking", { on }),
      onQuality: (quality) => hud.set((s) => ({ media: { ...s.media, quality } })),
      onState: (st) => hud.set((s) => ({ media: { ...s.media, ready: st.ready, offline: st.offline } })),
    });
  }

  send<K extends keyof ClientMessages>(type: K, msg: ClientMessages[K]) {
    try {
      this.room?.send(type, msg);
    } catch {}
    if (Object.hasOwn(STEP_LABELS, type) && hud.get().build.on)
      hud.set((s) => ({ build: { ...s.build, save: { state: "saving", at: Date.now() } } }));
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  async start() {
    hud.reset();
    hud.set({ phase: "loading", spaceId: this.spaceId });
    try {
      this.session = await yutopia.session(this.spaceId);
    } catch (e) {
      if (this.stopped) return;
      hud.set({ phase: "failed", error: e instanceof ApiError && e.status === 404 ? "404" : tr("failed") });
      return;
    }
    // A discarded mount (React StrictMode) must not touch the shared HUD.
    if (this.stopped) return;
    const s = this.session;
    hud.set({ spaceName: s.space.name, projectId: s.space.projectId, canBuild: s.space.canBuild, phase: "connecting" });
    this.map = getMap(s.space.mapKey);
    this.grid = Grid.from(this.map, this.map.objects);

    const engine = new WorldEngine(this.map);
    this.engine = engine;
    this.autoTier = deviceQuality();
    await engine.init(this.host, { quality: this.qualityNow(), reducedMotion: prefs().reducedMotion });
    if (this.stopped) return engine.destroy();
    engine.events = {
      onTileClick: (x, y) => (hud.get().build.on ? this.buildClick(x, y) : this.walkTo({ x, y })),
      onAvatarClick: (sid) => {
        if (sid.startsWith("npc:")) return this.send("vortex:poke", {});
        // click yourself to change your look; anyone else to see who they are
        if (sid === this.room?.sessionId) return hud.set({ panel: { kind: "avatar" } });
        const p = this.room?.state.players.get(sid);
        if (p && !p.bot) hud.set({ inspect: p.uid });
      },
      onObjectClick: (id) => {
        const o = this.engine?.getObject(id);
        const b = hud.get().build;
        // the door brush removes a door you click on
        if (b.on && b.tool === "walls" && b.brush.startsWith("door") && o?.kind === "door")
          return this.send("obj:remove", { id: o.id });
        if (b.on && o && b.tool === "walls") return; // walls/floors paint by dragging
        if (b.on && o) return this.buildClick(o.x + 0.5, o.y + 0.5);
        this.activateObject(id, true);
      },
      onHoverObject: () => {},
      onPointerWorld: (x, y) => this.buildHover(x, y),
      onPointerDown: (x, y) => this.buildDown(x, y),
      onPointerUp: (x, y) => this.buildUp(x, y),
    };
    this.offPrefs = subscribePrefs(() => this.engine?.setQuality(this.qualityNow(), prefs().reducedMotion));
    // Auto quality: step down a tier when this device can't keep up
    this.timers.push(setInterval(() => this.watchFrameRate(), 1000));
    this.updateNight();

    await this.join();
    if (this.stopped) return;
    this.bindInput();
    this.lastFrame = performance.now();
    const loop = (t: number) => {
      if (this.stopped) return;
      const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
      this.lastFrame = t;
      this.frame(dt, t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // rAF stops in hidden tabs: keep walking, hearing and voice panning alive
    // with a slow timer until frames come back.
    this.timers.push(
      setInterval(() => {
        const t = performance.now();
        if (t - this.lastFrame < 250 || this.stopped) return;
        const dt = Math.min(0.25, (t - this.lastFrame) / 1000);
        this.lastFrame = t;
        this.frame(dt, t);
      }, 100),
    );

    void this.media.connect(s.livekitUrl, s.livekitToken, s.iceServers);
    void this.loadBoards();
    void this.loadStatus();
    this.timers.push(setInterval(() => void this.loadStatus(), 60_000));
    this.timers.push(setInterval(() => this.updateNight(), 60_000));
  }

  private async join(reconnectToken?: string) {
    const s = this.session as Session;
    const client = new Client(s.worldUrl);
    try {
      const room: Room<S> = reconnectToken
        ? await client.reconnect(reconnectToken)
        : await client.joinOrCreate(ROOM_NAME, { spaceId: s.space.id, token: s.worldToken });
      if (this.stopped) {
        void room.leave(true);
        return;
      }
      this.room = room;
      this.wireMessages(room);
      // nested schema callbacks need the first full state
      if (!room.state?.players) await new Promise<void>((res) => room.onStateChange.once(() => res()));
      if (this.stopped) return;
      this.wireRoom(room);
      hud.set({ phase: "ready" });
      void this.syncLook();
    } catch (e) {
      if (reconnectToken) throw e;
      console.warn("[world] join failed", e);
      if (!this.stopped) hud.set({ phase: "failed", error: tr("failed") });
    }
  }

  private wireRoom(room: Room<S>) {
    const $ = getStateCallbacks(room);
    const engine = this.engine as WorldEngine;
    this.remotes.clear();
    // a fresh session (not a resume) has new session ids: drop old avatars
    engine.clearAvatars();
    this.uidToSid.clear();

    $(room.state).players.onAdd((p: S, sid: string) => {
      const local = sid === room.sessionId;
      this.uidToSid.set(p.uid, sid);
      if (local) {
        this.me = { x: p.x, y: p.y, d: p.d, a: p.a };
        this.lastSent = { ...this.me, t: 0 };
        engine.localId = sid;
      } else {
        this.remotes.set(sid, { buf: [{ t: performance.now(), x: p.x, y: p.y }], d: p.d, a: p.a });
        if (hud.get().phase === "ready" && !p.bot) mixer.blip("join");
      }
      engine.upsertAvatar(sid, this.avatarState(p, local), local);
      $(p).onChange(() => {
        if (sid === room.sessionId) return;
        const r = this.remotes.get(sid);
        if (!r) return;
        const last = r.buf[r.buf.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y) {
          r.buf.push({ t: performance.now(), x: p.x, y: p.y });
          if (r.buf.length > 12) r.buf.shift();
        }
        r.d = p.d;
        r.a = p.a;
      });
    });
    $(room.state).players.onRemove((p: S, sid: string) => {
      engine.removeAvatar(sid);
      this.remotes.delete(sid);
      if (this.uidToSid.get(p.uid) === sid) this.uidToSid.delete(p.uid);
      if (!p.bot) mixer.blip("leave");
    });

    this.applyMapFromState();
    $(room.state).listen("mapVersion", () => {
      this.mapDirty = true;
    });
    engine.setObjects([]);
    $(room.state).objects.onAdd((o: S) => {
      engine.upsertObject(objFromState(o), false);
      this.objectsDirty = true;
      $(o).onChange(() => {
        engine.upsertObject(objFromState(o), false);
        this.objectsDirty = true;
      });
    });
    $(room.state).objects.onRemove((o: S) => {
      engine.removeObject(o.id, false);
      this.objectsDirty = true;
    });

    $(room.state).npcs.onAdd((n: S, id: string) => {
      engine.upsertAvatar(`npc:${id}`, this.npcState(n));
      let lastSay = n.sayAt;
      this.npcBuf.set(id, [{ t: performance.now(), x: n.x, y: n.y }]);
      $(n).onChange(() => {
        const buf = this.npcBuf.get(id);
        const last = buf?.[buf.length - 1];
        if (buf && (!last || last.x !== n.x || last.y !== n.y)) {
          buf.push({ t: performance.now(), x: n.x, y: n.y });
          if (buf.length > 12) buf.shift();
        }
        // public lines: only people near him hear them
        if (n.sayAt === lastSay || !n.say) return;
        lastSay = n.sayAt;
        if (Math.hypot(n.x - this.me.x, n.y - this.me.y) > 8) return;
        engine.say(`npc:${id}`, n.say, 7000);
        this.vortexLog(n.say);
      });
    });
    $(room.state).npcs.onRemove((_n: S, id: string) => engine.removeAvatar(`npc:${id}`));

    const mirror = () => {
      const st = room.state;
      hud.set({
        radio: { playing: st.radio.playing, station: st.radio.station, startedAt: st.radio.startedAt, by: st.radio.by },
        standup: {
          active: st.standup.active,
          order: [...st.standup.order],
          turn: st.standup.turn,
          turnStartedAt: st.standup.turnStartedAt,
          turnSeconds: st.standup.turnSeconds,
        },
        poker: {
          open: st.poker.open,
          cardId: st.poker.cardId,
          boardId: st.poker.boardId,
          title: st.poker.title,
          by: st.poker.by,
        },
      });
    };
    $(room.state).radio.onChange(mirror);
    $(room.state).standup.onChange(mirror);
    $(room.state).standup.order.onAdd(mirror);
    $(room.state).standup.order.onRemove(mirror);
    $(room.state).poker.onChange(mirror);
    const mirrorLocks = () => {
      const locks: Record<string, string> = {};
      room.state.locks.forEach((by: string, area: string) => {
        locks[area] = by;
      });
      hud.set({ locks });
    };
    $(room.state).locks.onAdd(mirrorLocks);
    $(room.state).locks.onRemove(mirrorLocks);
    mirror();
    mirrorLocks();
  }

  private wireMessages(room: Room<S>) {
    const engine = this.engine as WorldEngine;
    room.onMessage("snap", (m: ServerMessages["snap"]) => {
      this.me.x = m.x;
      this.me.y = m.y;
      this.path = null;
    });
    room.onMessage("hear", (m: ServerMessages["hear"]) => {
      this.hear = new Set(m.ids);
      const uids = new Set<string>();
      for (const sid of m.ids) {
        const p = room.state.players?.get(sid);
        if (p) uids.add(String(p.uid));
      }
      this.media.setHearing(uids, m.heardBy ?? []);
      const heardBy = (m.heardBy ?? []).map(Number).filter((u) => u !== this.myUid());
      if (heardBy.join() !== hud.get().heardBy.join()) hud.set({ heardBy });
    });
    room.onMessage("chat:react", (m: ServerMessages["chat:react"]) =>
      hud.set((s) => ({ chat: s.chat.map((c) => (c.id === m.id ? { ...c, reactions: m.reactions } : c)) })),
    );
    room.onMessage("chat", (m: ServerMessages["chat"]) => {
      const mine = m.from === room.sessionId;
      hud.set((s) => ({
        chat: [...s.chat.slice(-199), { ...m, mine }],
        chatUnread: s.side === "chat" || mine ? s.chatUnread : s.chatUnread + 1,
      }));
      engine.say(m.from, m.text);
      if (!mine) mixer.blip("pop");
    });
    room.onMessage("knock", (m: ServerMessages["knock"]) => {
      mixer.blip("knock");
      hud.set((s) => ({ knocks: [...s.knocks.filter((k) => k.from !== m.from), { ...m, at: Date.now() }] }));
    });
    room.onMessage("admitted", (m: ServerMessages["admitted"]) => {
      const area = this.map.areas.find((a) => a.key === m.area);
      toast(`${tr("letIn")} — ${area?.name ?? m.area}`);
      if (area) this.walkTo({ x: area.x + area.w / 2, y: area.y + area.h / 2 });
    });
    room.onMessage("toast", (m: ServerMessages["toast"]) => toast(m.text, m.tone ?? "info"));
    room.onMessage("build:history", (m: ServerMessages["build:history"]) =>
      hud.set((s) => ({ build: { ...s.build, history: m } })),
    );
    room.onMessage("build:saved", (m: ServerMessages["build:saved"]) =>
      hud.set((s) => ({ build: { ...s.build, save: { state: m.ok ? "saved" : "failed", at: m.at } } })),
    );
    room.onMessage("vortex:say", (m: ServerMessages["vortex:say"]) => {
      engine.say("npc:vortex", m.text, 7000);
      this.vortexLog(m.text);
      for (const f of this.vortexListeners) f(m.text);
    });
    room.onMessage("wb:scene", (m: ServerMessages["wb:scene"]) => {
      this.wbScenes.set(m.objectId, m.items);
      this.emitWb(m.objectId);
    });
    room.onMessage("wb:op", (m: ServerMessages["wb:op"]) => {
      const items = this.wbScenes.get(m.objectId) ?? this.persistedScene(m.objectId);
      if (m.op.t === "add") items.push(m.op.item);
      else if (m.op.t === "del")
        items.splice(0, items.length, ...items.filter((x) => x.id !== (m.op as { id: string }).id));
      else items.splice(0, items.length);
      this.wbScenes.set(m.objectId, items);
      this.emitWb(m.objectId);
    });
    room.onMessage("arcade:scores", () => {});
    room.onMessage("kicked", (m: ServerMessages["kicked"]) =>
      hud.set({ phase: m.reason === "removed" ? "removed" : "kicked" }),
    );
    room.onLeave((code: number) => {
      if (this.stopped) return;
      if (code === 4002 || hud.get().phase === "removed") return hud.set({ phase: "removed" });
      if (code === 4001 || hud.get().phase === "kicked") return hud.set({ phase: "kicked" });
      void this.reconnect(room.reconnectionToken);
    });
  }

  private async reconnect(token: string) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    hud.set({ phase: "reconnecting" });
    const started = Date.now();
    let delay = 500;
    while (!this.stopped && Date.now() - started < 18_000) {
      try {
        await this.join(token);
        this.reconnecting = false;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(4000, delay * 1.6);
      }
    }
    // seat expired: fresh session + join
    try {
      this.session = await yutopia.session(this.spaceId);
      this.engine?.setObjects([]);
      for (const sid of [...this.remotes.keys()]) this.engine?.removeAvatar(sid);
      await this.join();
    } catch {
      hud.set({ phase: "failed", error: tr("failed") });
    }
    this.reconnecting = false;
  }

  // The room learns your look from the join token, minted when the page loaded:
  // after a rejoin (world restart, network) or a change saved elsewhere (the
  // lobby's editor in another tab), tell it the look saved in Yondra.
  async syncLook() {
    try {
      const { avatar } = await yutopia.avatar();
      const room = this.room;
      const me = room?.state.players.get(room.sessionId);
      if (me && JSON.stringify(parseAvatar(me.avatar)) !== JSON.stringify(parseAvatar(avatar)))
        this.send("avatar", { avatar });
    } catch {
      // offline or signed out: the room keeps what it has
    }
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearInterval(t);
    this.unbindInput();
    this.offPrefs?.();
    for (const ch of this.boardChannels) getEcho()?.leave(ch);
    disconnectEcho();
    void this.room?.leave(true).catch(() => {});
    void this.media.disconnect();
    sound.stopAll();
    this.engine?.destroy();
    this.engine = null;
  }

  // ── per frame ────────────────────────────────────────────────────────────
  private frame(dt: number, now: number) {
    const engine = this.engine;
    const room = this.room;
    if (!engine || !room?.state?.players) return;
    if (this.mapDirty) {
      this.mapDirty = false;
      this.applyMapFromState();
    }
    this.updateDoors();
    if (this.objectsDirty) {
      // batched: hundreds of objects arrive in the first patch
      this.objectsDirty = false;
      engine.refreshFlat();
      this.rebuildGrid();
      this.applyBoards();
      hud.set((h) => ({ objectsVersion: h.objectsVersion + 1 }));
    }
    this.moveLocal(dt);
    // my voice's reach on open floor while the mic is on (rooms and the stage
    // don't go by distance)
    const here = areaAt(this.map, this.me.x, this.me.y);
    const open = !isPrivate(here) && here?.kind !== "stage";
    engine.earshot = hud.get().media.mic && open && hud.get().me?.status !== "dnd" ? HEAR_RADIUS : 0;
    const localSid = room.sessionId;
    const lp = room.state.players.get(localSid);
    if (lp)
      engine.upsertAvatar(
        localSid,
        { ...this.avatarState(lp, true), x: this.me.x, y: this.me.y, d: this.me.d, a: this.me.a },
        true,
      );

    const renderAt = now - INTERP_MS;
    for (const [sid, r] of this.remotes) {
      const p = room.state.players.get(sid);
      if (!p) continue;
      const pos = interpolate(r.buf, renderAt);
      engine.upsertAvatar(sid, { ...this.avatarState(p, false), x: pos.x, y: pos.y, d: r.d, a: r.a });
      // voice: volume + stereo from where they are relative to me
      if (this.hear.has(sid)) {
        const ear = { x: this.me.x, y: this.me.y, dnd: lp?.status === "dnd" };
        const src = { x: pos.x, y: pos.y, dnd: p.status === "dnd" };
        this.media.setVoice(String(p.uid), Math.max(0.05, hearingGain(this.map, ear, src, true)), stereoPan(ear, src));
      } else this.media.setVoice(String(p.uid), 0, 0);
    }
    room.state.npcs.forEach((n: S, id: string) => {
      const pos = interpolate(this.npcBuf.get(id) ?? [{ t: 0, x: n.x, y: n.y }], renderAt);
      engine.upsertAvatar(`npc:${id}`, { ...this.npcState(n), x: pos.x, y: pos.y });
    });
    engine.update(dt);
    this.updatePrompt();
    if (now - this.peopleAt > 250) {
      this.peopleAt = now;
      this.publishPeople();
    }
    this.follow(now);
    this.updateAudioScene();
  }

  // Room tone follows my area; the radio is loud in the lounge, faint at the door.
  private updateAudioScene() {
    const area = areaAt(this.map, this.me.x, this.me.y);
    sound.setArea(area?.key ?? "", area?.kind ?? "open");
    const r = hud.get().radio;
    if (!r.playing) return radio.stop();
    radio.play(r.station, r.startedAt);
    const box = this.engine?.allObjects().find((o) => o.kind === "radio");
    if (!box) return radio.setLevel(0);
    const d = Math.hypot(this.me.x - (box.x + 0.5), this.me.y - (box.y + 0.5));
    const boxArea = areaAt(this.map, box.x + 0.5, box.y + 0.5);
    const same = area?.key === boxArea?.key;
    radio.setLevel(same ? Math.max(0.2, Math.min(1, 1 - (d - 2) / 10)) : d < 5 ? 0.12 : 0);
  }

  private objectsDirty = false;

  private moveLocal(dt: number) {
    const k = this.keys;
    const ix = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const iy = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const pad = this.gamepad();
    const speed = k.has("shift") || pad.run ? RUN_SPEED : WALK_SPEED;
    const start = { x: this.me.x, y: this.me.y };
    let moved = false;
    if (ix || iy || pad.x || pad.y) {
      this.path = null;
      this.pathTarget = null;
      hud.set({ following: null });
      const dir = screenInputToWorld(ix || pad.x, iy || pad.y);
      const next = moveStep(this.grid, this.me, dir, speed, dt);
      this.me.x = next.x;
      this.me.y = next.y;
      this.me.d = dirFromDelta(dir.x, dir.y, this.me.d as 0);
      moved = next.x !== start.x || next.y !== start.y;
    } else if (this.path?.length) {
      let budget = speed * dt;
      while (budget > 0 && this.path.length) {
        const wp = this.path[0];
        const dx = wp.x - this.me.x;
        const dy = wp.y - this.me.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) {
          this.me.x = wp.x;
          this.me.y = wp.y;
          budget -= d;
          this.path.shift();
        } else {
          this.me.x += (dx / d) * budget;
          this.me.y += (dy / d) * budget;
          budget = 0;
        }
        if (d > 0.001) this.me.d = dirFromDelta(dx, dy, this.me.d as 0);
      }
      moved = true;
      if (!this.path.length) {
        this.path = null;
        const target = this.pathTarget;
        this.pathTarget = null;
        if (target?.objectId) this.activateObject(target.objectId, false);
      }
    }
    const seat = this.grid.seatAt(this.me.x, this.me.y);
    const floor =
      FLOORS[tileAt(this.map, Math.floor(this.me.x), Math.floor(this.me.y)) as keyof typeof FLOORS] ?? "wood";
    sound.step(dt, moved, speed === RUN_SPEED, floor);
    if (moved) this.me.a = ANIM.walk;
    else if (seat) {
      this.me.a = ANIM.sit;
      if (this.me.a !== this.lastSent.a) {
        // snap onto the seat and face its direction
        this.me.x = Math.floor(this.me.x) + 0.5;
        this.me.y = Math.floor(this.me.y) + 0.5;
        this.me.d = [1, 7, 5, 3][seat.rot % 4];
      }
    } else this.me.a = ANIM.idle;

    const now = performance.now();
    const changed =
      Math.abs(this.me.x - this.lastSent.x) > 0.01 ||
      Math.abs(this.me.y - this.lastSent.y) > 0.01 ||
      this.me.d !== this.lastSent.d ||
      this.me.a !== this.lastSent.a;
    if (changed && now - this.lastSent.t >= 1000 / TICK_HZ) {
      this.send("pos", { x: this.me.x, y: this.me.y, d: this.me.d, a: this.me.a, seq: ++this.seq });
      this.lastSent = { ...this.me, t: now };
    }
  }

  private gamepad(): { x: number; y: number; run: boolean } {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const x = Math.abs(p.axes[0]) > 0.25 ? p.axes[0] : 0;
      const y = Math.abs(p.axes[1]) > 0.25 ? p.axes[1] : 0;
      if (p.buttons[0]?.pressed && !this.padA) {
        this.padA = true;
        this.interact();
      } else if (!p.buttons[0]?.pressed) this.padA = false;
      return { x, y, run: !!p.buttons[1]?.pressed };
    }
    return { x: 0, y: 0, run: false };
  }
  private padA = false;

  walkTo(target: Point, objectId?: string) {
    if (hud.get().build.on) return;
    const path = findPath(this.grid, this.me, target);
    if (!path) {
      this.engine?.showMarker(target.x, target.y);
      return;
    }
    this.path = path;
    this.pathTarget = objectId ? { objectId } : null;
    const end = path[path.length - 1] ?? target;
    this.engine?.showMarker(end.x, end.y);
  }

  private follow(now: number) {
    const uid = hud.get().following;
    if (uid == null || now - this.followAt < 600) return;
    this.followAt = now;
    const sid = this.uidToSid.get(uid);
    const p = sid ? this.room?.state.players.get(sid) : undefined;
    if (!p) return hud.set({ following: null });
    if (Math.hypot(p.x - this.me.x, p.y - this.me.y) > 1.8) this.walkTo({ x: p.x, y: p.y + 1 });
  }

  // ── interactions ─────────────────────────────────────────────────────────
  private nearestInteractable(): WorldObjectDef | null {
    if (!this.engine) return null;
    let best: WorldObjectDef | null = null;
    let bestD = INTERACT_RANGE;
    for (const o of this.engine.allObjects()) {
      const e = entry(o.kind);
      if (!e.interact) continue;
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      const cx = Math.max(o.x, Math.min(this.me.x, o.x + w));
      const cy = Math.max(o.y, Math.min(this.me.y, o.y + h));
      const d = Math.hypot(this.me.x - cx, this.me.y - cy);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  private updatePrompt() {
    const o = this.nearestInteractable();
    const cur = hud.get().prompt;
    if ((o?.id ?? null) === (cur?.objectId ?? null)) return;
    this.engine?.setHighlight(o?.id ?? null);
    hud.set({
      prompt: o ? { objectId: o.id, kind: entry(o.kind).interact as string, label: entry(o.kind).label } : null,
    });
  }

  interact() {
    const p = hud.get().prompt;
    if (p) this.activateObject(p.objectId, false);
  }

  activateObject(id: string, walkIfFar: boolean) {
    const o = this.engine?.getObject(id);
    if (!o) return;
    const e = entry(o.kind);
    if (!e.interact) return;
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    const cx = Math.max(o.x, Math.min(this.me.x, o.x + w));
    const cy = Math.max(o.y, Math.min(this.me.y, o.y + h));
    if (Math.hypot(this.me.x - cx, this.me.y - cy) > INTERACT_RANGE + 0.3) {
      if (!walkIfFar) return;
      // walk to the nearest open tile in front of it, then open
      const front =
        this.grid.nearestOpen(o.x + w / 2, o.y + h + 0.5, 4) ?? this.grid.nearestOpen(o.x + w / 2, o.y + h / 2, 4);
      if (front) this.walkTo(front, id);
      return;
    }
    if (e.interact === "coffee") {
      this.send("emote", { e: "coffee" });
      toast(tr("coffeeMade"));
      return;
    }
    if (e.interact === "lamp") {
      mixer.blip("click");
      this.send("lamp:set", { id, on: o.props?.on === false });
      return;
    }
    if (e.interact === "terminal") this.send("vortex:poke", {});
    this.onOpenPanel(e.interact, id);
  }

  // ── people / HUD ─────────────────────────────────────────────────────────
  private publishPeople() {
    const room = this.room;
    if (!room) return;
    const people: Person[] = [];
    let me: Person | null = null;
    room.state.players.forEach((p: S, sid: string) => {
      const local = sid === room.sessionId;
      const x = local ? this.me.x : p.x;
      const y = local ? this.me.y : p.y;
      const area = areaAt(this.map, x, y);
      const row: Person = {
        sid,
        uid: p.uid,
        name: p.name,
        avatar: p.avatar ?? "",
        area: area?.key ?? "",
        areaName: area?.name ?? "",
        status: p.status,
        mic: p.mic,
        cam: p.cam,
        screen: p.screen,
        speaking: p.speaking,
        bot: p.bot,
        muted: p.muted,
        hearing: this.hear.has(sid),
        x,
        y,
      };
      if (local) me = row;
      else people.push(row);
    });
    people.sort((a, b) => Number(b.hearing) - Number(a.hearing) || a.name.localeCompare(b.name));
    const st = this.engine?.stats();
    hud.set({ me, people, fps: Math.round(st?.fps ?? 0) });
    const vx = room.state.npcs.get("vortex");
    hud.set({ vortex: vx ? { x: vx.x, y: vx.y, say: vx.say, sayAt: vx.sayAt, mood: vx.mood } : null });
  }

  setStatus(status: "online" | "away" | "dnd") {
    this.send("status", { status });
  }

  chat(text: string, scope: ChatScope) {
    this.send("chat", { text, scope });
  }

  react(id: string, e: Emote) {
    this.send("chat:react", { id, e });
  }

  emote(i: number) {
    const e = EMOTES[i];
    if (e) this.send("emote", { e });
  }

  teleport(to: ClientMessages["teleport"]["to"]) {
    this.path = null;
    this.send("teleport", { to });
  }

  admit(k: { from: string; area: string }) {
    const p = this.room?.state.players.get(k.from);
    if (p) this.send("admit", { userId: p.uid, area: k.area });
    hud.set((s) => ({ knocks: s.knocks.filter((x) => x.from !== k.from) }));
  }

  dismissKnock(from: string) {
    hud.set((s) => ({ knocks: s.knocks.filter((x) => x.from !== from) }));
  }

  async toggleMic() {
    const on = !hud.get().media.mic;
    const err = await this.media.setMic(on);
    if (err === "blocked") toast(tr("micBlocked"), "warn");
    else if (err === "offline") toast(tr("avOffline"), "warn");
    else mixer.blip(on ? "pop" : "tape");
  }

  async toggleCam() {
    const err = await this.media.setCam(!hud.get().media.cam);
    if (err === "blocked") toast(tr("camBlocked"), "warn");
    else if (err === "offline") toast(tr("avOffline"), "warn");
  }

  async toggleScreen() {
    const err = await this.media.setScreen(!hud.get().media.screen);
    if (err === "offline") toast(tr("avOffline"), "warn");
  }

  myUid(): number {
    return this.session?.user.id ?? 0;
  }

  personByUid(uid: number) {
    const sid = this.uidToSid.get(uid);
    return sid ? this.room?.state.players.get(sid) : undefined;
  }

  // The stage screen shows whoever is sharing from the stage (if I can hear them).
  private syncStageScreen() {
    const engine = this.engine;
    const room = this.room;
    if (!engine || !room) return;
    const screens = hud.get().screens;
    let video: HTMLVideoElement | null = null;
    room.state.players.forEach((p: S) => {
      const a = areaAt(this.map, p.x, p.y);
      if (a?.kind === "stage" && screens[String(p.uid)]) video = screens[String(p.uid)];
    });
    const stageScreen = engine.allObjects().find((o) => o.kind === "screen_wall" && o.props?.source === "stage");
    if (stageScreen) engine.setScreenVideo(stageScreen.id, video);
  }

  private vortexListeners = new Set<(text: string) => void>();

  onVortexSay(fn: (text: string) => void) {
    this.vortexListeners.add(fn);
    return () => {
      this.vortexListeners.delete(fn);
    };
  }

  private vortexLog(text: string) {
    hud.set((s) => ({
      chat: [
        ...s.chat.slice(-199),
        {
          id: `vx-${Date.now()}`,
          from: "vortex",
          fromName: "VORTEX",
          text,
          scope: "nearby",
          at: Date.now(),
          mine: false,
          vortex: true,
        },
      ],
      chatUnread: s.side === "chat" ? s.chatUnread : s.chatUnread + 1,
    }));
  }

  // ── Yondra sync ──────────────────────────────────────────────────────────
  private boardsTimer: ReturnType<typeof setTimeout> | null = null;
  private boardListeners = new Set<(boardId: number, e: { type: string; payload: unknown }) => void>();

  // Panels (planning poker) listen to Yondra board events without opening
  // their own Echo subscriptions.
  onBoardEvent(fn: (boardId: number, e: { type: string; payload: unknown }) => void) {
    this.boardListeners.add(fn);
    return () => {
      this.boardListeners.delete(fn);
    };
  }

  // ── whiteboards ──────────────────────────────────────────────────────────
  private wbScenes = new Map<string, WbItem[]>();
  private wbListeners = new Set<(objectId: string, items: WbItem[]) => void>();

  onWhiteboard(fn: (objectId: string, items: WbItem[]) => void) {
    this.wbListeners.add(fn);
    return () => {
      this.wbListeners.delete(fn);
    };
  }

  whiteboardItems(objectId: string): WbItem[] {
    return this.wbScenes.get(objectId) ?? this.persistedScene(objectId);
  }

  private persistedScene(objectId: string): WbItem[] {
    const scene = this.engine?.getObject(objectId)?.props?.scene;
    return Array.isArray(scene) ? [...(scene as WbItem[])] : [];
  }

  private emitWb(objectId: string) {
    const items = this.whiteboardItems(objectId);
    this.engine?.setWhiteboard(objectId, items);
    for (const f of this.wbListeners) f(objectId, items);
  }

  async loadBoards() {
    try {
      const { boards } = await yutopia.boards(this.spaceId);
      hud.set({ boards });
      this.applyBoards();
      const echo = getEcho();
      if (!echo) return;
      for (const ch of this.boardChannels) echo.leave(ch);
      this.boardChannels = [];
      for (const b of boards) {
        const name = `board.${b.id}`;
        echo.private(name).listen(".board.event", (e: { type: string; payload: unknown }) => {
          this.scheduleBoards();
          for (const f of this.boardListeners) f(b.id, e);
        });
        this.boardChannels.push(name);
      }
    } catch (e) {
      console.warn("[world] boards", e);
    }
  }

  private scheduleBoards() {
    if (this.boardsTimer) clearTimeout(this.boardsTimer);
    this.boardsTimer = setTimeout(async () => {
      try {
        const { boards } = await yutopia.boards(this.spaceId);
        hud.set({ boards });
        this.applyBoards();
      } catch {}
    }, 400);
  }

  private applyBoards() {
    const engine = this.engine;
    if (!engine) return;
    const boards = hud.get().boards;
    for (const o of engine.allObjects()) {
      if (o.kind === "board_wall" || (o.kind === "screen_wall" && o.props?.source === "board")) {
        const b =
          (o.refId && boards.find((x) => x.id === o.refId)) || (o.kind === "screen_wall" ? boards[0] : undefined);
        engine.setBoardContent(o.id, b ? { name: b.name, sections: b.sections } : null);
      }
    }
  }

  boardFor(objectId: string) {
    const o = this.engine?.getObject(objectId);
    const boards = hud.get().boards;
    if (!o) return undefined;
    return (o.refId && boards.find((b) => b.id === o.refId)) || (o.kind === "screen_wall" ? boards[0] : undefined);
  }

  private async loadStatus() {
    try {
      const { status } = await yutopia.status(this.spaceId);
      const map: Record<number, (typeof status)[number]["doing"]> = {};
      for (const s of status) map[s.userId] = s.doing;
      hud.set({ status: map });
    } catch {}
  }

  // The light follows the local clock (art/daylight.ts: day, golden hour, dusk, night).
  private updateNight() {
    const now = new Date();
    this.engine?.setClock(now.getHours() + now.getMinutes() / 60);
  }

  // ── build mode ───────────────────────────────────────────────────────────
  private hoverTile = { x: -1, y: -1 };

  private ghostDef(tx: number, ty: number): WorldObjectDef {
    const b = hud.get().build;
    const held = b.holding ? this.engine?.getObject(b.holding) : undefined;
    return held
      ? { ...held, x: tx, y: ty, rot: b.rot }
      : {
          id: "ghost",
          kind: b.kind,
          x: tx,
          y: ty,
          rot: b.rot,
          props: b.props ?? (b.kind === "chair" ? { desk: true } : undefined),
        };
  }

  buildHover(x: number, y: number) {
    if (!hud.get().build.on || !this.engine) return;
    const bb = hud.get().build;
    const br = this.brushNow();
    if (bb.tool === "walls" && this.boxing()) {
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
      this.hoverTile = { x: tx, y: ty };
      if (this.dragFrom) this.engine.setRectGhost({ ...this.dragRect(tx, ty), ok: true });
      return;
    }
    if (bb.tool === "walls" && (br.startsWith("w:") || br.startsWith("door"))) {
      const e = this.edgeAtPointer(x, y);
      if (this.hoverEdge && e.x === this.hoverEdge.x && e.y === this.hoverEdge.y && e.dir === this.hoverEdge.dir)
        return;
      this.hoverEdge = e;
      if (this.painting) this.paintEdge(e);
      this.refreshGhost();
      return;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx === this.hoverTile.x && ty === this.hoverTile.y) return;
    this.hoverTile = { x: tx, y: ty };
    const b = hud.get().build;
    if (b.tool === "walls" && this.painting) this.paintAt(tx, ty);
    if (b.tool === "rooms" && this.dragFrom) this.engine.setRectGhost({ ...this.dragRect(tx, ty), ok: true });
    this.refreshGhost();
  }

  // ── walls / rooms tools ──
  private painting = false;
  private paintQueue = new Map<string, { x: number; y: number; ch: string }>();
  private paintTimer: ReturnType<typeof setTimeout> | null = null;
  private dragFrom: { x: number; y: number } | null = null;

  private hoverEdge: Edge | null = null;
  private dragDir: "h" | "v" | null = null; // a wall drag stays on one line direction

  // The edge under the pointer; while dragging a wall, along the drag's direction
  // only (so passing over a corner never paints a stray wall across the line).
  private edgeAtPointer(x: number, y: number): Edge {
    if (this.painting && this.dragDir === "v") return { x: Math.round(x), y: Math.floor(y), dir: "v" };
    if (this.painting && this.dragDir === "h") return { x: Math.floor(x), y: Math.round(y), dir: "h" };
    return nearestEdge(x, y);
  }
  private edgeQueue = new Map<string, Edge & { ch: string }>();

  // What a wall brush puts on an edge: a material, a window in the wall that's
  // there (plaster if none), or no wall.
  private edgeChar(e: Edge): string {
    const brush = this.brushNow();
    if (brush !== "w:window") return brush.slice(2);
    const cur = edgeAt(this.map, e);
    return isWallEdge(cur) && /^[pwfbk]$/.test(cur) ? cur.toUpperCase() : "P";
  }

  private paintEdge(e: Edge) {
    this.edgeQueue.set(`${e.dir}${e.x},${e.y}`, { ...e, ch: this.edgeChar(e) });
    if (!this.paintTimer) this.paintTimer = setTimeout(() => this.flushPaint(), 80);
  }

  private paintAt(tx: number, ty: number) {
    const br = this.brushNow();
    if (br.startsWith("door") || br.startsWith("w:")) return;
    this.paintQueue.set(`${tx},${ty}`, { x: tx, y: ty, ch: br });
    if (!this.paintTimer) this.paintTimer = setTimeout(() => this.flushPaint(), 80);
  }

  private flushPaint() {
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = null;
    if (this.edgeQueue.size) {
      this.send("map:walls", { edges: [...this.edgeQueue.values()] });
      this.edgeQueue.clear();
    }
    if (!this.paintQueue.size) return;
    this.send("map:paint", { cells: [...this.paintQueue.values()] });
    this.paintQueue.clear();
  }

  private dragRect(tx: number, ty: number) {
    const a = this.dragFrom ?? { x: tx, y: ty };
    return { x: Math.min(a.x, tx), y: Math.min(a.y, ty), w: Math.abs(tx - a.x) + 1, h: Math.abs(ty - a.y) + 1 };
  }

  buildDown(x: number, y: number) {
    const b = hud.get().build;
    if (!b.on) return;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const br = this.brushNow();
    if (b.tool === "walls" && this.boxing()) {
      this.dragFrom = { x: tx, y: ty };
      this.engine?.setRectGhost({ x: tx, y: ty, w: 1, h: 1, ok: true });
    } else if (b.tool === "walls" && b.paintMode === "fill") {
      // a click (buildClick) fills
    } else if (b.tool === "walls" && br.startsWith("w:")) {
      const e = nearestEdge(x, y);
      this.painting = true;
      this.dragDir = e.dir;
      this.paintEdge(e);
    } else if (b.tool === "walls" && !br.startsWith("door")) {
      this.painting = true;
      this.paintAt(tx, ty);
    } else if (b.tool === "rooms") {
      this.dragFrom = { x: tx, y: ty };
      this.engine?.setRectGhost({ x: tx, y: ty, w: 1, h: 1, ok: true });
    }
  }

  buildUp(x: number, y: number) {
    const b = hud.get().build;
    if (this.painting) {
      this.painting = false;
      this.dragDir = null;
      this.flushPaint();
    }
    if (b.tool === "walls" && this.dragFrom) {
      const r = this.dragRect(Math.floor(x), Math.floor(y));
      this.dragFrom = null;
      this.engine?.setRectGhost(null);
      this.paintBox(r);
    }
    if (b.tool === "rooms" && this.dragFrom) {
      const r = this.dragRect(Math.floor(x), Math.floor(y));
      this.dragFrom = null;
      if (r.w >= 2 && r.h >= 2) hud.set({ build: { ...hud.get().build, roomDraft: r } });
      else this.engine?.setRectGhost(null);
    }
  }

  clearRoomGhost() {
    this.engine?.setRectGhost(null);
  }

  refreshGhost() {
    const engine = this.engine;
    if (!engine) return;
    const bt = hud.get().build;
    engine.passAvatars = bt.on;
    if (!bt.on) return engine.setGhost(null, false);
    if (bt.tool === "walls") {
      const e = this.hoverEdge;
      const br = this.brushNow();
      if (this.boxing() || (bt.paintMode === "fill" && !br.startsWith("door"))) {
        engine.setEdgeGhost(null, false);
        return engine.setGhost(null, false);
      }
      if (br.startsWith("door") && e) {
        engine.setEdgeGhost(null, false);
        const d = {
          id: "ghost-door",
          kind: "door",
          x: e.x,
          y: e.y,
          rot: e.dir === "h" ? 0 : 1,
          props: { state: "closed", glass: br === "door:glass" },
        };
        return engine.setGhost(d, canPlace(this.map, engine.allObjects(), d));
      }
      engine.setGhost(null, false);
      if (br.startsWith("w:") && e)
        return engine.setEdgeGhost(e, edgeBlocker(this.map, engine.allObjects(), e, this.edgeChar(e)) === null);
      return engine.setEdgeGhost(null, false);
    }
    engine.setEdgeGhost(null, false);
    if (bt.tool !== "furniture") return engine.setGhost(null, false);
    const def = this.ghostDef(this.hoverTile.x, this.hoverTile.y);
    const others = engine.allObjects().filter((o) => o.id !== def.id);
    const bodies = this.room ? [...this.room.state.players.values()].map((p: S) => ({ x: p.x, y: p.y })) : [];
    const fits = canPlace(this.map, others, def, bodies);
    engine.setGhost(def, fits);
    if (bt.fits !== fits) hud.set((s) => ({ build: { ...s.build, fits } }));
  }

  buildClick(x: number, y: number) {
    const b = hud.get().build;
    if (b.pickSpawn) {
      this.send("map:spawn", { x: Math.floor(x), y: Math.floor(y) });
      hud.set({ build: { ...b, pickSpawn: false } });
      return;
    }
    if (b.tool === "walls") {
      if (b.paintMode === "fill" && !b.brush.startsWith("door")) return this.fillAt(Math.floor(x), Math.floor(y));
      if (b.brush.startsWith("door")) {
        // a door on the edge you clicked next to (click a door to remove it)
        const e = nearestEdge(x, y);
        const hit = this.engine?.allObjects().find((o) => {
          if (o.kind !== "door") return false;
          const d = doorEdge(o);
          return d.dir === e.dir && d.x === e.x && d.y === e.y;
        });
        if (hit) this.send("obj:remove", { id: hit.id });
        else
          this.send("obj:put", {
            kind: "door",
            x: e.x,
            y: e.y,
            rot: e.dir === "h" ? 0 : 1,
            ...(b.brush === "door:glass" ? { props: { glass: true } } : {}),
          });
      }
      return;
    }
    if (b.tool === "rooms") return;
    if (b.tool === "desks") {
      const hit = this.engine?.objectAtTile(Math.floor(x), Math.floor(y));
      if (hit && entry(hit.kind).seat) hud.set({ build: { ...b, deskDraft: hit.id } });
      return;
    }
    if (b.tool === "map") return;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (b.holding) {
      const def = this.ghostDef(tx, ty);
      this.send("obj:put", {
        id: def.id,
        kind: def.kind,
        x: tx,
        y: ty,
        rot: b.rot,
        refId: def.refId ?? null,
        props: def.props,
      });
      hud.set({ build: { ...b, holding: null } });
    } else {
      const hit = this.engine?.objectAtTile(tx, ty);
      if (hit && entry(hit.kind).buildable) {
        hud.set({ build: { ...b, holding: hit.id, rot: hit.rot ?? 0 } });
      } else {
        const def = this.ghostDef(tx, ty);
        this.send("obj:put", { kind: def.kind, x: tx, y: ty, rot: b.rot, props: def.props });
      }
    }
    setTimeout(() => this.refreshGhost(), 60);
  }

  buildKey(key: string): boolean {
    const b = hud.get().build;
    if (!b.on) return false;
    if (key === "r") hud.set({ build: { ...b, rot: (b.rot + 1) % 4 } });
    else if ((key === "delete" || key === "backspace") && b.holding) {
      this.send("obj:remove", { id: b.holding });
      hud.set({ build: { ...b, holding: null } });
    } else if (key === "c" && b.tool === "furniture") this.copyItem();
    else if (key === "escape") hud.set({ build: { ...b, on: !!b.holding || !!b.props, holding: null, props: null } });
    else return false;
    this.refreshGhost();
    return true;
  }

  // The brush a paint stroke uses: Erase takes walls or floors away, whichever
  // the picked brush paints.
  private brushNow(): string {
    const b = hud.get().build;
    if (b.paintMode !== "erase") return b.brush;
    return b.brush.startsWith("w:") || b.brush.startsWith("door") ? "w:." : VOID;
  }
  private boxing(): boolean {
    const b = hud.get().build;
    return b.paintMode === "box" && !b.brush.startsWith("door");
  }

  // Box: floors fill the rectangle, walls run around it.
  private paintBox(r: { x: number; y: number; w: number; h: number }) {
    const br = this.brushNow();
    if (br.startsWith("w:")) {
      const edges: Edge[] = [];
      for (let x = r.x; x < r.x + r.w; x++) edges.push({ x, y: r.y, dir: "h" }, { x, y: r.y + r.h, dir: "h" });
      for (let y = r.y; y < r.y + r.h; y++) edges.push({ x: r.x, y, dir: "v" }, { x: r.x + r.w, y, dir: "v" });
      // windows check the walls painted before them: walls first
      const all = edges.map((e) => ({ ...e, ch: this.edgeChar(e) }));
      for (let i = 0; i < all.length; i += 600) this.send("map:walls", { edges: all.slice(i, i + 600) });
      return;
    }
    const cells: { x: number; y: number; ch: string }[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y, ch: br });
    for (let i = 0; i < cells.length; i += 600) this.send("map:paint", { cells: cells.slice(i, i + 600) });
  }

  // Fill room: floors flood the same floor up to walls and doors; walls repaint
  // the room you click in.
  private fillAt(tx: number, ty: number) {
    const br = this.brushNow();
    if (br.startsWith("w:")) {
      const area = areaAt(this.map, tx + 0.5, ty + 0.5);
      const mat = br.slice(2);
      if (!area) return toast(tr("buildFillOutside"), "warn");
      if (!/^[pwfbkg]$/.test(mat)) return toast(tr("buildFillMaterial"), "warn");
      this.send("map:room:walls", { key: area.key, wall: mat });
      return;
    }
    const start = tileAt(this.map, tx, ty);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height || start === br) return;
    const doors = new Set(
      (this.engine?.allObjects() ?? [])
        .filter((o) => o.kind === "door")
        .map((o) => {
          const d = doorEdge(o);
          return `${d.dir}${d.x},${d.y}`;
        }),
    );
    const blocked = (e: Edge) => doors.has(`${e.dir}${e.x},${e.y}`) || isWallEdge(edgeAt(this.map, e));
    const seen = new Set([`${tx},${ty}`]);
    const queue = [{ x: tx, y: ty }];
    const cells: { x: number; y: number; ch: string }[] = [];
    while (queue.length && cells.length < 2400) {
      const c = queue.shift() as Point;
      cells.push({ x: c.x, y: c.y, ch: br });
      const next: [number, number, Edge][] = [
        [c.x + 1, c.y, { x: c.x + 1, y: c.y, dir: "v" }],
        [c.x - 1, c.y, { x: c.x, y: c.y, dir: "v" }],
        [c.x, c.y + 1, { x: c.x, y: c.y + 1, dir: "h" }],
        [c.x, c.y - 1, { x: c.x, y: c.y, dir: "h" }],
      ];
      for (const [nx, ny, e] of next) {
        const k = `${nx},${ny}`;
        if (seen.has(k) || nx < 0 || ny < 0 || nx >= this.map.width || ny >= this.map.height) continue;
        if (tileAt(this.map, nx, ny) !== start || blocked(e)) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    for (let i = 0; i < cells.length; i += 600) this.send("map:paint", { cells: cells.slice(i, i + 600) });
  }

  // C: place copies of what you hold, or of the item under the pointer.
  private copyItem() {
    const b = hud.get().build;
    const src = b.holding
      ? this.engine?.getObject(b.holding)
      : this.engine?.objectAtTile(this.hoverTile.x, this.hoverTile.y);
    if (!src || !entry(src.kind).buildable) return;
    const { ownerId: _o, ownerName: _n, roomKey: _r, ...props } = src.props ?? {};
    hud.set({ build: { ...b, kind: src.kind, rot: src.rot ?? 0, props, holding: null } });
    toast(tr("buildCopying").replace("{item}", entry(src.kind).label));
  }

  undo() {
    this.send("build:undo", {});
  }
  redo() {
    this.send("build:redo", {});
  }

  // Desks tool: drag a person from the panel onto a seat.
  seatAt(clientX: number, clientY: number): WorldObjectDef | null {
    const w = this.engine?.screenToWorld(clientX, clientY);
    if (!w) return null;
    const o = this.engine?.objectAtTile(Math.floor(w.x), Math.floor(w.y));
    return o && entry(o.kind).seat ? o : null;
  }
  showSeatDrop(at: { x: number; y: number } | null) {
    if (!at) return this.engine?.setRectGhost(null);
    const w = this.engine?.screenToWorld(at.x, at.y);
    if (!w) return;
    const seat = this.seatAt(at.x, at.y);
    const t = seat ?? { x: Math.floor(w.x), y: Math.floor(w.y) };
    this.engine?.setRectGhost({ x: t.x, y: t.y, w: 1, h: 1, ok: !!seat });
  }

  // ── build mode support ───────────────────────────────────────────────────
  // My walk grid: locked doors of my own rooms let me through.
  rebuildGrid() {
    if (!this.engine) return;
    this.grid = Grid.from(this.map, this.engine.allObjects(), { uid: this.myUid() || null });
  }

  // The map lives in room state (per-space layout): rebuild walls/floors on change.
  private applyMapFromState() {
    const st = this.room?.state;
    if (!st?.tiles || !this.engine || !st.width) return;
    let areas = [];
    try {
      areas = JSON.parse(st.areas || "[]");
    } catch {}
    const base = getMap(st.mapKey);
    this.map = {
      ...base,
      width: st.width,
      height: st.height,
      tiles: [...st.tiles],
      theme: isTheme(st.theme) ? st.theme : "clouds",
      hWalls: [...(st.hWalls ?? [])],
      vWalls: [...(st.vWalls ?? [])],
      areas,
      spawn: { x: st.spawnX, y: st.spawnY },
      objects: [],
    };
    this.engine.setMap(this.map);
    this.rebuildGrid();
    hud.set((h) => ({ mapVersion: h.mapVersion + 1 }));
  }
  private mapDirty = false;

  // Doors swing open while someone walks through them; chairs show who sits
  // in them; the radio's display lights while it plays.
  private passing = new Map<string, boolean>();
  private updateDoors() {
    const engine = this.engine;
    const room = this.room;
    if (!engine || !room) return;
    const sitting = new Set<string>();
    if (this.me.a === ANIM.sit) sitting.add(`${Math.floor(this.me.x)},${Math.floor(this.me.y)}`);
    room.state.players.forEach((p: S, sid: string) => {
      if (sid !== room.sessionId && p.a === ANIM.sit) sitting.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);
    });
    const playing = hud.get().radio.playing;
    for (const o of engine.allObjects()) {
      if (o.kind === "chair" || o.kind === "armchair") {
        const occupied = sitting.has(`${o.x},${o.y}`);
        if (!!o.props?.occupied !== occupied) engine.upsertObject({ ...o, props: { ...(o.props ?? {}), occupied } });
        continue;
      }
      if (o.kind === "radio") {
        if (!!o.props?.on !== playing) engine.upsertObject({ ...o, props: { ...(o.props ?? {}), on: playing } });
        continue;
      }
      if (o.kind !== "door") continue;
      // someone in the doorway: close to the middle of the door's edge
      const c = doorCentre(o);
      const on = (x: number, y: number) =>
        (o.rot ?? 0) % 2 === 0
          ? Math.abs(x - c.x) < 0.5 && Math.abs(y - c.y) < 0.55
          : Math.abs(y - c.y) < 0.5 && Math.abs(x - c.x) < 0.55;
      let occupied = on(this.me.x, this.me.y);
      room.state.players.forEach((p: S, sid: string) => {
        if (sid !== room.sessionId && on(p.x, p.y)) occupied = true;
      });
      room.state.npcs.forEach((n: S) => {
        if (on(n.x, n.y)) occupied = true;
      });
      if ((this.passing.get(o.id) ?? false) !== occupied) {
        this.passing.set(o.id, occupied);
        engine.upsertObject({ ...o, props: { ...(o.props ?? {}), passing: occupied } });
      }
    }
  }

  // ── quality ──────────────────────────────────────────────────────────────
  private autoTier: Quality = "high";
  private slowFor = 0;
  private startedAt = Date.now();

  qualityNow(): Quality {
    return prefs().quality === "auto" ? this.autoTier : resolveQuality(prefs().quality);
  }

  private watchFrameRate() {
    const e = this.engine;
    if (!e || prefs().quality !== "auto" || Date.now() - this.startedAt < 8000 || document.hidden) return;
    const fps = e.stats().fps;
    this.slowFor = fps > 0 && fps < 40 ? this.slowFor + 1 : 0;
    if (this.slowFor < 6 || this.autoTier === "low") return;
    this.slowFor = 0;
    this.autoTier = this.autoTier === "high" ? "medium" : "low";
    e.setQuality(this.autoTier, prefs().reducedMotion);
  }

  meTile() {
    return { x: this.me.x, y: this.me.y };
  }

  // ── input ────────────────────────────────────────────────────────────────
  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
      return;
    if (hud.get().panel.kind && e.key !== "Escape") return;
    const key = e.key.toLowerCase();
    if (hud.get().build.on && (e.metaKey || e.ctrlKey) && (key === "z" || key === "y")) {
      e.preventDefault();
      if (key === "y" || e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (e.metaKey || e.ctrlKey) return;
    if (this.buildKey(key)) {
      e.preventDefault();
      return;
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
      this.keys.add(key);
      if (key.startsWith("arrow")) e.preventDefault();
      void mixer.resume();
      return;
    }
    if (e.repeat) return;
    if (key === "x" || key === "e") this.interact();
    else if (key === "m") void this.toggleMic();
    else if (key === "v") void this.toggleCam();
    else if (key === "enter") {
      e.preventDefault();
      hud.set({ side: "chat", chatUnread: 0 });
    } else if (key >= "1" && key <= "8") this.emote(Number(key) - 1);
    else if (key === "+" || key === "=") this.engine?.setZoom((this.engine?.getZoom() ?? 1) * 1.15);
    else if (key === "-") this.engine?.setZoom((this.engine?.getZoom() ?? 1) / 1.15);
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onBlur = () => this.keys.clear();
  private onFirstGesture = () => void mixer.resume();

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onFirstGesture);
    window.addEventListener("focus", this.onFocus);
  }

  private unbindInput() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onFirstGesture);
    window.removeEventListener("focus", this.onFocus);
  }

  // back from another tab (maybe the lobby's avatar editor): pick up a saved look
  private onFocus = () => {
    if (this.room && hud.get().phase === "ready") void this.syncLook();
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  private avatarState(p: S, _local: boolean): AvatarState {
    return {
      name: p.name,
      avatar: parseAvatar(p.avatar),
      x: p.x,
      y: p.y,
      d: p.d,
      a: p.a,
      status: p.status,
      speaking: p.speaking,
      emote: p.emote,
      mic: p.mic,
      bot: p.bot,
    };
  }

  private npcState(n: S): AvatarState {
    return {
      name: "VORTEX",
      avatar: VORTEX_LOOK,
      x: n.x,
      y: n.y,
      d: n.d,
      a: n.a,
      status: "online",
      speaking: false,
      emote: n.mood === "glitch" ? "fire" : "",
      vortexMood: n.mood,
      mic: false,
      npc: true,
    };
  }
}

const VORTEX_LOOK = parseAvatar({
  body: "slim",
  skin: "#9aa67e",
  hair: "mohawk",
  hairColor: "#c4402b",
  top: "jacket",
  topColor: "#2a2420",
  bottom: "trousers",
  bottomColor: "#1c1410",
  accessory: "glasses",
  accessoryColor: "#ffa630",
});

function objFromState(o: S): WorldObjectDef {
  let props: Record<string, unknown> = {};
  try {
    props = JSON.parse(o.props || "{}");
  } catch {}
  return { id: o.id, kind: o.kind, x: o.x, y: o.y, rot: o.rot, refId: o.refId || null, props };
}

function interpolate(buf: { t: number; x: number; y: number }[], at: number): Point {
  if (buf.length === 0) return { x: 0, y: 0 };
  if (at <= buf[0].t) return buf[0];
  for (let i = buf.length - 1; i >= 0; i--) {
    const a = buf[i];
    if (a.t <= at) {
      const b = buf[i + 1];
      if (!b) return a;
      const k = (at - a.t) / Math.max(1, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return buf[buf.length - 1];
}

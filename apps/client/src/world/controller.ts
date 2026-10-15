"use client";

import {
  ANIM,
  areaAt,
  type ChatScope,
  type ClientMessages,
  CONTACT,
  dirFromDelta,
  doorCentre,
  doorRoom,
  EMOTES,
  type Emote,
  entry,
  FLOORS,
  findPath,
  Grid,
  getMap,
  HEAR_RADIUS,
  hangSpot,
  hangStrip,
  hearingGain,
  isPrivate,
  isSocial,
  isTheme,
  type MapDef,
  moveStep,
  objectActions,
  type Point,
  parseAvatar,
  placedFootprint,
  ROOM_NAME,
  RUN_SPEED,
  reachOf,
  type ServerMessages,
  SOCIAL,
  SOCIAL_MS,
  STEP_LABELS,
  screenInputToWorld,
  socialFor,
  stereoPan,
  TICK_HZ,
  tileAt,
  WALK_SPEED,
  type WbItem,
  type WorldObjectDef,
} from "@yutopia/shared";
import { CABLE_REACH, gap, isConsole, isGameTv } from "@yutopia/shared/games";
import { isRadio, type RadioState, radioOf, showsBoards } from "@yutopia/shared/media";
import { Client, getStateCallbacks, type Room } from "colyseus.js";
import { ApiError, type Session, YONDRA_APP, yutopia } from "@/lib/api";
import { currentEcho, disconnectEcho, getEcho } from "@/lib/echo";
import { tr } from "@/lib/i18n";
import { deviceQuality, prefs, type Quality, resolveQuality, setPrefs, subscribePrefs } from "@/lib/prefs";
import { ActionQueue } from "./actions";
import { loadPeople } from "./art/people-load";
import { loadItemArt } from "./art/scene";
import { loadThemes } from "./art/themes-load";
import { mixer } from "./audio";
import type { BuildController } from "./build/controller";
import { type AvatarState, WorldEngine } from "./engine";
import { fanfare, machineSound, pianoNote, socialSound } from "./foley";
import type { GameRoom } from "./games/room";
import { Media } from "./media";
import type { MediaRoom } from "./media/room";
import type { SlotTracks } from "./slots";
import { radio, sound } from "./sound";
import { type ActTarget, hud, type Person, toast } from "./store";
import type { Body3, ThirdPersonView } from "./tp/view";

// biome-ignore lint/suspicious/noExplicitAny: decoded Colyseus schema objects
type S = any;

interface Remote {
  buf: { t: number; x: number; y: number }[];
  d: number;
  a: number;
}

const INTERP_MS = 110;
const IDLE_MS = 3000; // nothing moved for this long: frames at 30/s
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
  private lastTick = 0;
  private tick = 0;
  private rafGap = 1000 / 60; // how often the screen asks for a frame (ms, smoothed)
  private activeAt = 0;
  private hudFrames = new Set<() => void>();
  private stopped = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private offPrefs: (() => void) | null = null;
  private offLook: (() => void) | null = null;
  private boardChannels: string[] = [];
  private reconnecting = false;
  private peopleAt = 0;
  private followAt = 0;
  private uidToSid = new Map<number, string>();
  onOpenPanel: (kind: string, objectId?: string) => void = () => {};
  readonly actions: ActionQueue;

  constructor(host: HTMLElement, spaceId: number) {
    this.host = host;
    this.spaceId = spaceId;
    this.actions = new ActionQueue({
      me: () => this.me,
      setFacing: (d) => {
        this.me.d = d;
      },
      grid: () => this.grid,
      object: (id) => this.engine?.getObject(id),
      person: (sid) => {
        const p = this.room?.state.players.get(sid);
        if (!p) return undefined;
        const r = this.remotes.get(sid);
        const at = r ? interpolate(r.buf, performance.now() - INTERP_MS) : { x: p.x, y: p.y };
        return { x: at.x, y: at.y, uid: p.uid, name: p.name };
      },
      walk: (to) => this.walkTo(to, undefined, true),
      walking: () => !!this.path?.length,
      stopWalking: () => {
        this.path = null;
        this.pathTarget = null;
      },
      send: (type, msg) => this.send(type, msg),
      activate: (id) => this.activateObject(id, false),
      machineBusy: () => performance.now() < this.usingUntil,
      busyFor: (what, ms) => {
        this.usingWhat = what;
        this.usingUntil = performance.now() + ms;
      },
      playNote: (id, n) => this.playPiano(id, n),
      openPanel: (kind, objectId) => this.onOpenPanel(kind, objectId),
      putDown: () => this.putDown(),
      myTask: () => {
        const c = hud.get().status[this.myUid()]?.[0];
        return c ? { id: c.id, boardId: c.boardId } : null;
      },
    });
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
      onTv: (identity, el) => {
        if (el) this.tvVideos.set(identity, el);
        else this.tvVideos.delete(identity);
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
    await engine.init(this.host, {
      quality: this.qualityNow(),
      reducedMotion: prefs().reducedMotion,
      autoStart: false,
    });
    if (this.stopped) return engine.destroy();
    engine.events = {
      onTileClick: (x, y) => {
        if (hud.get().build.on) return this.buildClick(x, y);
        if (hud.get().pickArrival) return this.setArrival({ x, y });
        // a click on the floor: go there (dropping whatever was queued)
        if (hud.get().menu) return hud.set({ menu: null });
        this.actions.clear();
        this.walkTo({ x, y });
      },
      onAvatarClick: (sid, at) => {
        if (sid.startsWith("npc:")) return this.send("vortex:poke", {});
        // yourself: your look, your drink…; anyone else: what to do with them
        if (sid === this.room?.sessionId) return this.openMenu({ type: "self" }, at);
        const p = this.room?.state.players.get(sid);
        if (p && !p.bot) this.openMenu({ type: "person", sid }, at);
      },
      onObjectClick: (id, at) => {
        const o = this.engine?.getObject(id);
        const b = hud.get().build;
        // the door brush removes a door you click on
        if (b.on && b.tool === "walls" && b.brush.startsWith("door") && o?.kind === "door")
          return this.send("obj:remove", { id: o.id });
        if (b.on && o && b.tool === "walls") return; // walls/floors paint by dragging
        if (b.on && o) return this.buildClick(o.x + 0.5, o.y + 0.5);
        // carrying a cable: a TV clicked is where it goes
        if (hud.get().cable && o && isGameTv(o.kind)) return this.activateObject(id, true);
        if (!this.openMenu({ type: "object", id }, at)) this.activateObject(id, true);
      },
      onHoverObject: () => {},
      onPointerWorld: (x, y) => (hud.get().pickArrival ? this.hoverArrival(x, y) : this.buildHover(x, y)),
      onPointerDown: (x, y) => this.buildDown(x, y),
      onPointerUp: (x, y) => this.buildUp(x, y),
      onWheel: (dy) => this.build?.wheel(dy) ?? false,
    };
    this.offLook = hud.subscribe(this.watchLook);
    this.offPrefs = subscribePrefs(() => {
      this.engine?.setQuality(this.qualityNow(), prefs().reducedMotion);
      if (this.tp && this.tp.quality !== this.qualityNow()) this.tp.setQuality(this.qualityNow());
      this.syncView();
    });
    // Auto quality: step down a tier when this device can't keep up
    this.timers.push(setInterval(() => this.watchFrameRate(), 1000));
    this.updateNight();

    await this.join();
    if (this.stopped) return;
    this.bindInput();
    this.lastFrame = performance.now();
    this.lastTick = this.lastFrame;
    this.activeAt = this.lastFrame;
    const loop = (t: number) => {
      if (this.stopped) return;
      // asked first: a frame that throws mustn't end the loop
      this.raf = requestAnimationFrame(loop);
      // Frames are drawn every n-th screen frame so they stay evenly spaced
      // (a 144 Hz screen capped at 60 draws every 2nd: 72/s), from the
      // screen's own rate, smoothed.
      const gap = t - this.lastTick;
      this.lastTick = t;
      if (gap > 0 && gap < 100) this.rafGap += (gap - this.rafGap) * 0.1;
      const cap = this.fpsCap(t);
      const every = cap ? Math.max(1, Math.round(1000 / this.rafGap / cap)) : 1;
      if (++this.tick % every) return;
      const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
      this.lastFrame = t;
      this.frame(dt, t);
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
        this.say(`npc:${id}`, n.say, 7000);
        this.vortexLog(n.say);
      });
    });
    $(room.state).npcs.onRemove((_n: S, id: string) => engine.removeAvatar(`npc:${id}`));

    const mirror = () => {
      const st = room.state;
      hud.set({
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
      this.say(m.from, m.text);
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
    room.onMessage("spawn:mine", (m: ServerMessages["spawn:mine"]) => {
      const was = hud.get().mySpawn;
      hud.set({ mySpawn: m.at });
      if (hud.get().pickArrival) return this.engine?.showMine(m.at);
      // just set: show where for a moment
      if (m.at && (m.at.x !== was?.x || m.at.y !== was?.y) && this.arrivalAsked) this.flashArrival();
    });
    // someone's playing the piano: from where they are (fades over ~10 tiles)
    room.onMessage("piano:note", (m: ServerMessages["piano:note"]) => {
      const d = Math.hypot(m.x - this.me.x, m.y - this.me.y);
      pianoNote(m.n, Math.max(0, 1 - d / 10), (m.x - m.y - (this.me.x - this.me.y)) / 8);
    });
    room.onMessage("build:history", (m: ServerMessages["build:history"]) =>
      hud.set((s) => ({ build: { ...s.build, history: m } })),
    );
    room.onMessage("build:saved", (m: ServerMessages["build:saved"]) =>
      hud.set((s) => ({
        build: { ...s.build, save: { state: m.ok ? "saved" : m.rejected ? "rejected" : "failed", at: m.at } },
      })),
    );
    room.onMessage("vortex:say", (m: ServerMessages["vortex:say"]) => {
      this.say("npc:vortex", m.text, 7000);
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
    room.onMessage("game:tv", (m: ServerMessages["game:tv"]) => this.games?.onTvToken(m));
    room.onMessage("media:key", (m: ServerMessages["media:key"]) => {
      this.mediaKey = m;
    });
    room.onMessage("game:pad", (m: ServerMessages["game:pad"]) => this.games?.onPad(m));
    room.onMessage("game:audience", (m: ServerMessages["game:audience"]) => this.games?.onAudience(m));
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
    this.build?.dispose();
    this.slots?.dispose();
    this.games?.dispose();
    this.screens?.dispose();
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearInterval(t);
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    if (hud.get().pickArrival) hud.set({ pickArrival: false });
    this.unbindInput();
    this.closeTp();
    this.offPrefs?.();
    this.offLook?.();
    for (const ch of this.boardChannels) currentEcho()?.leave(ch);
    disconnectEcho();
    void this.room?.leave(true).catch(() => {});
    void this.media.disconnect();
    sound.stopAll();
    this.engine?.destroy();
    this.engine = null;
  }

  private heldShown = "";
  putDown() {
    this.send("item:drop", {});
  }

  // ── a console's cable: taken from its panel, plugged in at a TV ─────────
  grabCable(consoleId: string) {
    mixer.blip("click");
    hud.set({ cable: { consoleId }, panel: { kind: null } });
  }

  dropCable(why?: string) {
    if (!hud.get().cable) return;
    hud.set({ cable: null });
    if (why) toast(why, "warn");
  }

  // still in hand: the console's there, not plugged in yet, and I haven't
  // walked further off than the cable goes
  private checkCable() {
    const c = hud.get().cable;
    if (!c) return;
    const o = this.engine?.getObject(c.consoleId);
    if (!o) return this.dropCable();
    if (typeof o.props?.tv === "string") {
      mixer.blip("pop");
      return this.dropCable();
    }
    const { w, h } = placedFootprint(o);
    const me = { x: this.me.x, y: this.me.y, w: 0, h: 0 };
    if (gap({ x: o.x, y: o.y, w, h }, me) > CABLE_REACH + 2) this.dropCable(tr("cableTooFar"));
  }

  // the cable from the console to my hands (for the 3D view; iso draws its own)
  private cableEnds(): { from: Point; to: Point } | null {
    const c = hud.get().cable;
    const o = c ? this.engine?.getObject(c.consoleId) : undefined;
    if (!o) return null;
    return { from: { x: o.x + 0.5, y: o.y + 0.3 }, to: { x: this.me.x, y: this.me.y } };
  }

  // What I'm busy with (shown on my body for everyone): a machine for a moment,
  // or the arcade / piano / whiteboard while its panel is open.
  private usingWhat = "";
  private usingUntil = 0;
  private busySent = "";
  private syncBusy() {
    const pk = hud.get().panel.kind;
    const want =
      pk === "arcade" || pk === "piano" || pk === "whiteboard"
        ? pk
        : pk === "slotcar" && this.slots?.atControls()
          ? "slotcar"
          : this.games?.atPad()
            ? "gamepad"
            : performance.now() < this.usingUntil
              ? this.usingWhat
              : "";
    if (want !== this.busySent) {
      this.busySent = want;
      this.send("use", { what: want });
    }
  }

  // A note on the piano I'm at: heard here at once, sent to everyone else.
  playPiano(id: string, n: number) {
    pianoNote(n, 1, 0);
    this.send("piano:note", { id, n });
  }

  // ── the game room: its own chunk (world/games), loaded once a TV or console is here ──
  games: GameRoom | null = null;
  private gamesLoading: Promise<void> | null = null;
  tvVideos = new Map<string, HTMLVideoElement>(); // "tv-<console id>" → its picture
  private gamesChanged() {
    if (this.games) return this.games.refresh();
    const kinds = new Set([
      "crt_tv",
      "cart_shelf",
      "console_2600",
      "console_nes",
      "console_snes",
      "console_md",
      "console_gb",
    ]);
    if (this.gamesLoading || !this.engine?.allObjects().some((o) => kinds.has(o.kind))) return;
    this.gamesLoading = import("./games/room").then((m) => {
      if (this.stopped || !this.engine || !this.room) return;
      this.games = new m.GameRoom(this);
      this.games.refresh();
    });
  }

  // ── media on TVs and the radio: its own chunk (world/media), loaded once
  // something plays, a projector is here, or a remote opens ──
  screens: MediaRoom | null = null;
  private screensLoading: Promise<void> | null = null;
  mediaKey: ServerMessages["media:key"] | null = null;
  get worldHttp(): string {
    return (this.session?.worldUrl ?? "").replace(/^ws(s?):/, "http$1:").replace(/\/$/, "");
  }
  private screensChanged() {
    if (this.screens) return this.screens.refresh();
    const on = !!this.engine
      ?.allObjects()
      .some(
        (o) =>
          o.kind === "projector" ||
          !!o.props?.media ||
          (isRadio(o.kind) && (o.props?.radio as { source?: string } | undefined)?.source === "yt"),
      );
    if (on) void this.ensureScreens();
  }
  ensureScreens(): Promise<void> {
    this.screensLoading ??= import("./media/room").then((m) => {
      if (this.stopped || !this.engine || !this.room) return;
      this.screens = new m.MediaRoom(this);
      this.screens.refresh();
    });
    return this.screensLoading;
  }

  // ── slot-car tracks: their own chunk (world/slots.ts), loaded once a track is here ──
  slots: SlotTracks | null = null;
  private slotsLoading: Promise<void> | null = null;
  private slotsChanged() {
    if (this.slots) return this.slots.refresh();
    if (this.slotsLoading || !this.engine?.allObjects().some((o) => o.kind === "slot_track")) return;
    this.slotsLoading = import("./slots").then((m) => {
      const room = this.room;
      if (this.stopped || !this.engine || !room) return;
      this.slots = new m.SlotTracks(this.engine, room, (type, msg) => this.send(type as never, msg as never));
      this.slots.refresh();
    });
  }

  // ── per frame ────────────────────────────────────────────────────────────
  // A feature's frame (games, slot cars) that throws: logged once, and the
  // world carries on without it instead of freezing.
  private failed = new Set<string>();
  private isolated(name: string, fn: () => void) {
    try {
      fn();
    } catch (e) {
      if (this.failed.has(name)) return;
      this.failed.add(name);
      console.error(`[${name}] frame failed`, e);
    }
  }

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
      this.build?.checkPending();
      this.slotsChanged();
      this.gamesChanged();
      this.screensChanged();
      hud.set((h) => ({ objectsVersion: h.objectsVersion + 1 }));
    }
    this.syncView();
    this.moveLocal(dt);
    if (hud.get().build.on) {
      this.actions.clear();
      if (hud.get().menu) hud.set({ menu: null });
    } else this.actions.tick(now);
    // my voice's reach on open floor while the mic is on (rooms and the stage
    // don't go by distance)
    const here = areaAt(this.map, this.me.x, this.me.y);
    const open = !isPrivate(here) && here?.kind !== "stage";
    engine.earshot = hud.get().media.mic && open && hud.get().me?.status !== "dnd" ? HEAR_RADIUS : 0;
    if (this.tp) this.tp.earshot = engine.earshot;
    this.isolated("slots", () => this.slots?.frame(dt, this.me));
    this.isolated("games", () => this.games?.frame(dt, this.me));
    this.isolated("media", () => this.screens?.frame(dt, this.me));
    this.syncBusy();
    const localSid = room.sessionId;
    const lp = room.state.players.get(localSid);
    // what I carry, for the HUD
    const heldNow = lp?.held ? `${lp.held}|${lp.heldAt}` : "";
    if (heldNow !== this.heldShown) {
      this.heldShown = heldNow;
      hud.set({ held: lp?.held ? { kind: lp.held, at: lp.heldAt } : null });
    }
    if (!!lp?.focus !== hud.get().focus) hud.set({ focus: !!lp?.focus });
    // someone high-fives me, hands me something…: turn to them
    if (lp?.act && lp.actAt !== this.facedAct) {
      this.facedAct = lp.actAt;
      const other = room.state.players.get(lp.actWith);
      if (other && !this.path) this.me.d = dirFromDelta(other.x - this.me.x, other.y - this.me.y, this.me.d as 0);
    }
    const tp = this.tp;
    const bodies: Body3[] = [];
    const reduced = prefs().reducedMotion;
    if (lp) {
      const st = { ...this.avatarState(lp, true), x: this.me.x, y: this.me.y, d: this.me.d, a: this.me.a };
      engine.upsertAvatar(localSid, st, true);
      if (tp)
        bodies.push({
          ...st,
          id: localSid,
          angle: this.meAngle,
          typing: st.a === 2 && engine.atWork(st.x, st.y),
          reduced,
        });
    }

    const renderAt = now - INTERP_MS;
    for (const [sid, r] of this.remotes) {
      const p = room.state.players.get(sid);
      if (!p) continue;
      const pos = interpolate(r.buf, renderAt);
      const st = { ...this.avatarState(p, false), x: pos.x, y: pos.y, d: r.d, a: r.a };
      engine.upsertAvatar(sid, st);
      if (tp) bodies.push({ ...st, id: sid, typing: st.a === 2 && engine.atWork(st.x, st.y), reduced });
      // voice: volume + stereo from where they are relative to me
      if (this.hear.has(sid)) {
        const ear = { x: this.me.x, y: this.me.y, dnd: lp?.status === "dnd" };
        const src = { x: pos.x, y: pos.y, dnd: p.status === "dnd" };
        // focusing: the room's chatter turned down (whoever's right beside me still heard)
        const duck = lp?.focus && Math.hypot(pos.x - this.me.x, pos.y - this.me.y) > 2 ? 0.25 : 1;
        this.media.setVoice(
          String(p.uid),
          Math.max(0.05, hearingGain(this.map, ear, src, true) * duck),
          tp ? tp.pan(ear, src) : stereoPan(ear, src),
        );
      } else this.media.setVoice(String(p.uid), 0, 0);
    }
    room.state.npcs.forEach((n: S, id: string) => {
      const pos = interpolate(this.npcBuf.get(id) ?? [{ t: 0, x: n.x, y: n.y }], renderAt);
      const st = { ...this.npcState(n), x: pos.x, y: pos.y };
      engine.upsertAvatar(`npc:${id}`, st);
      if (tp) bodies.push({ ...st, id: `npc:${id}`, reduced });
    });
    this.watchActs();
    engine.update(dt);
    if (tp) {
      // the room as it is (doors swinging, seats taken, edits): only what changed is redrawn
      // build mode: what it shows (ghosts, previews, outlines); things in hand are left out of the room
      const look = hud.get().build.on ? engine.buildLook() : null;
      tp.setBuild(look);
      if (now >= this.tpDue || (look && look.hidden.size !== this.tpHidden)) {
        this.tpDue = now + 200;
        this.tpHidden = look?.hidden.size ?? 0;
        const all = engine.allObjects();
        tp.update(this.map, look?.hidden.size ? all.filter((o) => !look.hidden.has(o.id)) : all);
      }
      tp.setLiveFrom({ engine, screens: this.screens, games: this.games });
      tp.setCars(this.slots?.cars() ?? []);
      tp.setCable(this.cableEnds());
      tp.setGames(this.games?.scene3d() ?? null);
      // (a hidden tab: nothing to draw for)
      if (!document.hidden) tp.frame(dt, bodies, localSid);
    } else if (!document.hidden) engine.render();
    for (const cb of this.hudFrames) cb();
    this.checkCable();
    this.updatePrompt();
    if (now - this.peopleAt > 250) {
      this.peopleAt = now;
      this.publishPeople();
    }
    this.follow(now);
    this.updateAudioScene();
  }

  // Room tone follows my area. Each radio and record player plays its own
  // music: loud in its room, faint by the door. The lo-fi I hear is the
  // loudest one's where I stand (and from its side); YouTube on a radio plays
  // in the media chunk's card. The top bar shows the one I hear (or the
  // nearest that plays).
  private updateAudioScene() {
    const area = areaAt(this.map, this.me.x, this.me.y);
    sound.setArea(area?.key ?? "", area?.kind ?? "open");
    let level = 0;
    let pan = 0;
    let loud: { o: WorldObjectDef; r: RadioState } | null = null;
    let near: { o: WorldObjectDef; r: RadioState; d: number } | null = null;
    for (const box of this.engine?.allObjects() ?? []) {
      if (!isRadio(box.kind)) continue;
      const r = radioOf(box);
      if (!r.playing) continue;
      const d = Math.hypot(this.me.x - (box.x + 0.5), this.me.y - (box.y + 0.5));
      if (!near || d < near.d) near = { o: box, r, d };
      if (r.source !== "lofi") continue;
      const same = area?.key === areaAt(this.map, box.x + 0.5, box.y + 0.5)?.key;
      // its own knob too: a radio turned down is quieter, and loses to a louder one
      const l = (same ? Math.max(0.2, Math.min(1, 1 - (d - 2) / 10)) : d < 5 ? 0.12 : 0) * r.volume;
      if (l > level) {
        level = l;
        loud = { o: box, r };
        pan = this.tp
          ? this.tp.pan(this.me, { x: box.x + 0.5, y: box.y + 0.5 })
          : stereoPan(this.me, { x: box.x + 0.5, y: box.y + 0.5 });
      }
    }
    if (loud) {
      radio.play(loud.r.station, loud.r.startedAt);
      radio.setLevel(level, prefs().spatial ? pan * 0.6 : 0);
    } else radio.stop();
    const shown = loud ?? near;
    const was = hud.get().radio;
    const now = shown
      ? {
          id: shown.o.id,
          playing: true,
          station: shown.r.station,
          startedAt: shown.r.startedAt,
          by: shown.r.by,
          source: shown.r.source,
          title: shown.r.source === "yt" ? (shown.r.media?.item?.title ?? "") : "",
        }
      : { id: "", playing: false, station: 0, startedAt: 0, by: "", source: "lofi" as const, title: "" };
    if (JSON.stringify(now) !== JSON.stringify(was)) hud.set({ radio: now });
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
      this.actions.clear();
      this.path = null;
      this.pathTarget = null;
      hud.set({ following: null });
      // third person: relative to where the camera looks (W = away from it)
      const dir = this.tp
        ? unit(this.tp.relative(-(iy || pad.y), ix || pad.x))
        : screenInputToWorld(ix || pad.x, iy || pad.y);
      const next = moveStep(this.grid, this.me, dir, speed, dt);
      this.turnTowards(Math.atan2(dir.y, dir.x), dt);
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
        if (d > 0.001) {
          this.me.d = dirFromDelta(dx, dy, this.me.d as 0);
          this.turnTowards(Math.atan2(dy, dx), dt);
        }
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
        this.me.d = [1, 3, 5, 7][seat.rot % 4]; // away from the seat's back (server `seatFacing`)
      }
    } else this.me.a = ANIM.idle;
    // turned some other way (a seat, someone high-fiving me…): face it in 3D too
    if (!moved && dirFromDelta(Math.cos(this.meAngle), Math.sin(this.meAngle), this.me.d as 0) !== this.me.d)
      this.meAngle = DIR_ANGLE[this.me.d] ?? this.meAngle;

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

  walkTo(target: Point, objectId?: string, quiet = false): boolean {
    if (hud.get().build.on) return false;
    const path = findPath(this.grid, this.me, target);
    if (!path) {
      if (!quiet) {
        this.engine?.showMarker(target.x, target.y);
        this.tp?.showMarker(target.x, target.y);
      }
      return false;
    }
    this.path = path;
    this.pathTarget = objectId ? { objectId } : null;
    const end = path[path.length - 1] ?? target;
    this.engine?.showMarker(end.x, end.y);
    this.tp?.showMarker(end.x, end.y);
    return true;
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
    const cable = !!hud.get().cable; // a cable in hand: only what it plugs into
    for (const o of this.engine.allObjects()) {
      const e = entry(o.kind);
      if (!e.interact || (cable && !isGameTv(o.kind))) continue;
      const d = reachOf(o, this.me);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // Mouse look (Z, 3D only): the pointer locked, the mouse turns the camera.
  // It lets go by itself when something wants the pointer: a menu, a panel,
  // build mode, a side panel opening, chat.
  private aimId: string | null = null; // the usable thing under the crosshair
  private lookWas = { menu: false, panel: false, build: false, side: null as string | null, pick: false };
  private toggleLook() {
    const v = this.tp;
    if (!v || hud.get().build.on || window.matchMedia?.("(pointer: coarse)").matches) return;
    v.setLook(!v.looking);
  }
  private watchLook = () => {
    const h = hud.get();
    const now = { menu: !!h.menu, panel: !!h.panel.kind, build: h.build.on, side: h.side, pick: h.pickArrival };
    const was = this.lookWas;
    this.lookWas = now;
    if (!this.tp?.looking) return;
    const opened =
      (now.menu && !was.menu) ||
      (now.panel && !was.panel) ||
      (now.build && !was.build) ||
      (now.pick && !was.pick) ||
      (now.side !== null && now.side !== was.side);
    if (opened) this.tp.setLook(false);
  };
  // what E / X uses: in mouse look the thing under the crosshair (when it's
  // something to use), else the nearest
  private aimedObject(): WorldObjectDef | null {
    if (!this.aimId || !this.tp?.looking || hud.get().cable) return null;
    const o = this.engine?.getObject(this.aimId);
    return o && entry(o.kind).interact ? o : null;
  }

  private updatePrompt() {
    const o = this.aimedObject() ?? this.nearestInteractable();
    const cur = hud.get().prompt;
    const kind = !o ? "" : hud.get().cable ? "plug" : (entry(o.kind).interact as string);
    if ((o?.id ?? null) === (cur?.objectId ?? null) && kind === (cur?.kind ?? "")) return;
    this.engine?.setHighlight(o?.id ?? null);
    this.tp?.setHighlight(this.footprintOf(o?.id));
    hud.set({
      prompt: o ? { objectId: o.id, kind, label: kind === "plug" ? tr("cablePlug") : entry(o.kind).label } : null,
    });
  }

  interact() {
    const p = hud.get().prompt;
    if (p) this.activateObject(p.objectId, false);
  }

  // Moves between people: a spark and its sound where the hands meet (one of
  // the two shows it), heard by whoever's near.
  private actsSeen = new Map<string, string>();
  private watchActs() {
    const room = this.room;
    if (!room) return;
    room.state.players.forEach((p: S, sid: string) => {
      const key = p.act ? `${p.act}|${p.actAt}` : "";
      if (this.actsSeen.get(sid) === key) return;
      this.actsSeen.set(sid, key);
      const act = p.act as string;
      if (!isSocial(act) || act === "wave" || act === "give") return;
      const other = room.state.players.get(p.actWith);
      if (other?.act === act && sid > p.actWith) return;
      setTimeout(() => {
        const a = this.whereIs(sid);
        const b = this.whereIs(p.actWith);
        if (!a || !b) return;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const d = Math.hypot(mid.x - this.me.x, mid.y - this.me.y);
        this.engine?.puff(mid.x, mid.y, "spark", act === "highfive" ? 66 : 44);
        socialSound(act, Math.max(0, 1 - d / 9));
      }, SOCIAL_MS[act] * CONTACT);
    });
  }

  // Where someone is drawn right now (me: where I am).
  private whereIs(sid: string): Point | null {
    if (sid === this.room?.sessionId) return { x: this.me.x, y: this.me.y };
    const r = this.remotes.get(sid);
    return r ? interpolate(r.buf, performance.now() - INTERP_MS) : null;
  }

  // ── the action menu ──────────────────────────────────────────────────────
  private facedAct = 0;

  // What can be done with it, with a title (and a line about it): null when
  // there's nothing to do.
  menuFor(target: ActTarget): { title: string; subtitle?: string; items: { act: string; ok: boolean }[] } | null {
    const room = this.room;
    const me = room?.state.players.get(room.sessionId);
    if (!room || !me) return null;
    if (target.type === "self") {
      const items = [{ act: "look", ok: true }];
      if (me.held) items.push({ act: "putDown", ok: true });
      if (me.focus) items.push({ act: "unfocus", ok: true });
      items.push({ act: "arriveHere", ok: true });
      if (hud.get().mySpawn) items.push({ act: "arriveUsual", ok: true });
      return { title: me.name, items };
    }
    if (target.type === "person") {
      const p = room.state.players.get(target.sid);
      if (!p) return null;
      const can = socialFor({ held: me.held, status: me.status }, { held: p.held, status: p.status });
      const items: { act: string; ok: boolean }[] = SOCIAL.map((act) => ({ act, ok: can.includes(act) }))
        // cheers and give only make sense with drinks about
        .filter((i) => i.ok || (i.act !== "cheers" && i.act !== "give"));
      items.push({ act: "follow", ok: true }, { act: "profile", ok: true });
      const card = hud.get().status[p.uid]?.[0];
      const subtitle = p.focus ? tr("focusing") : card ? `${card.ticket} · ${card.name}` : undefined;
      return { title: p.name, subtitle, items };
    }
    const o = this.engine?.getObject(target.id);
    if (!o) return null;
    const task = hud.get().status[this.myUid()]?.[0] ?? null;
    // someone else's desk: whose, what they're on
    const owner = Number(o.props?.ownerId);
    if (o.kind === "desk" && owner && owner !== this.myUid()) {
      const card = hud.get().status[owner]?.[0];
      const items = [];
      if (card) items.push({ act: "theirCard", ok: true });
      if (this.uidToSid.has(owner)) items.push({ act: "profile", ok: true });
      if (!items.length) return null;
      return {
        title: `${String(o.props?.ownerName ?? "").split(" ")[0]} · ${entry(o.kind).label}`,
        subtitle: card ? `${card.ticket} · ${card.name}` : undefined,
        items,
      };
    }
    const acts = objectActions(o, {
      uid: this.myUid(),
      focus: !!me.focus,
      radioOn: radioOf(o).playing,
      task,
      mayLock: (d) => me.builder || doorRoom(this.map, d)?.ownerId === this.myUid(),
    });
    if (!acts.length) return null;
    const e = entry(o.kind);
    const title = o.kind === "tabletop" && o.props?.d === "desklamp" ? tr("deskLamp") : e.label;
    const subtitle =
      o.kind === "desk" && task && o.props?.ownerId === this.myUid() ? `${task.ticket} · ${task.name}` : undefined;
    return { title, subtitle, items: acts.map((act) => ({ act, ok: true })) };
  }

  openMenu(target: ActTarget, at: { x: number; y: number }): boolean {
    const m = this.menuFor(target);
    if (!m) return false;
    mixer.blip("click");
    hud.set({ menu: { x: at.x, y: at.y, target, ...m } });
    return true;
  }

  closeMenu() {
    if (hud.get().menu) hud.set({ menu: null });
  }

  // Picked from the menu: queued (walk there, then do it).
  pickAction(act: string) {
    const m = hud.get().menu;
    if (!m) return;
    hud.set({ menu: null });
    // looking things up happens at once (no need to walk over)
    const t = m.target;
    const desk = t.type === "object" ? this.engine?.getObject(t.id) : undefined;
    const owner = Number(desk?.props?.ownerId);
    if (act === "openCard" || act === "theirCard") {
      const card = hud.get().status[act === "openCard" ? this.myUid() : owner]?.[0];
      if (card) window.open(`${YONDRA_APP}/boards/${card.boardId}?card=${card.id}`, "_blank", "noopener");
      return;
    }
    if (act === "profile" && desk) return hud.set({ inspect: owner });
    if (act === "profile" && t.type === "person") {
      const p = this.room?.state.players.get(t.sid);
      if (p) hud.set({ inspect: p.uid });
      return;
    }
    if (act === "look") return hud.set({ panel: { kind: "avatar" } });
    if (act === "arriveHere") return this.setArrival({ x: this.me.x, y: this.me.y });
    if (act === "arriveUsual") return this.setArrival(null);
    this.actions.add(act, m.target, m.title);
  }

  activateObject(id: string, walkIfFar: boolean) {
    const o = this.engine?.getObject(id);
    if (!o) return;
    const e = entry(o.kind);
    if (!e.interact) return;
    const { w, h } = placedFootprint(o);
    if (reachOf(o, this.me) > INTERACT_RANGE + 0.3) {
      if (!walkIfFar) return;
      // walk to the nearest open tile in front of it (a wall item: its side of the wall), then open
      const spot = e.wall ? hangSpot(o, 0.7) : null;
      const front = spot
        ? this.grid.nearestOpen(spot.x, spot.y, 4)
        : (this.grid.nearestOpen(o.x + w / 2, o.y + h + 0.5, 4) ?? this.grid.nearestOpen(o.x + w / 2, o.y + h / 2, 4));
      if (front) this.walkTo(front, id);
      return;
    }
    // turn to face it
    const ox = o.x + w / 2;
    const oy = o.y + h / 2;
    if (Math.hypot(ox - this.me.x, oy - this.me.y) > 0.2)
      this.me.d = dirFromDelta(ox - this.me.x, oy - this.me.y, this.me.d as 0);
    // a console's cable in hand: into this TV (the server says if it reaches)
    const cable = hud.get().cable;
    if (cable) {
      if (isGameTv(o.kind)) this.send("game:plug", { id: cable.consoleId, tv: id });
      else toast(tr("cableNotHere"), "warn");
      return;
    }
    if (e.interact === "coffee" || e.interact === "water" || e.interact === "vending") {
      // the machine does its thing (a moment, its sound), then hands you a
      // drink, sipped little by little (shared/held.ts)
      if (performance.now() < this.usingUntil) return;
      const how = {
        coffee: ["brew", 1600, "coffeeMade"],
        water: ["pour", 1000, "waterPoured"],
        vending: ["clunk", 900, "sodaBought"],
      } as const;
      const [snd, ms, msg] = how[e.interact];
      this.usingWhat = e.interact;
      this.usingUntil = performance.now() + ms;
      machineSound(snd);
      setTimeout(() => {
        this.send("item:take", { id });
        toast(tr(msg));
      }, ms);
      return;
    }
    if (e.interact === "piano") {
      this.onOpenPanel("piano", id);
      return;
    }
    if (e.interact === "lamp") {
      mixer.blip("click");
      this.send("lamp:set", { id, on: o.props?.on === false });
      return;
    }
    // (no panel for a switch: one opened anyway would swallow the keys)
    if (e.interact === "switch") {
      mixer.blip("click");
      this.send("lights:room", { id, on: o.props?.on === false });
      return;
    }
    if (e.interact === "terminal") this.send("vortex:poke", {});
    // a media TV with a console plugged in: the TV's own panel (its inputs, the remote among them)
    const plugged =
      e.interact === "media" &&
      isGameTv(o.kind) &&
      !!this.engine?.allObjects().some((x) => isConsole(x.kind) && x.props?.tv === id);
    this.onOpenPanel(plugged ? "tv" : e.interact, id);
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

  // ── my own arrival point (features/arrival.ts on the server) ─────────────
  private arrivalAsked = false; // I changed it this session (so the pin flashes)
  private arrivalFlash: ReturnType<typeof setTimeout> | null = null;

  // choose it on the map: the next floor click sets it (Esc cancels)
  pickArrival(on: boolean) {
    hud.set({ pickArrival: on, menu: null });
    if (on) this.actions.clear();
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    this.engine?.showMine(on ? hud.get().mySpawn : null);
  }

  // here (a tile), or null: back to the space's arrival point
  setArrival(at: Point | null) {
    this.arrivalAsked = true;
    this.send("spawn:mine", { at: at && { x: Math.floor(at.x), y: Math.floor(at.y) } });
    if (hud.get().pickArrival) this.pickArrival(false);
  }

  private hoverArrival(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const ok = this.grid.ok(tx, ty) && this.grid.fits(tx + 0.5, ty + 0.5);
    this.engine?.showMine(hud.get().mySpawn, { x: tx, y: ty, ok });
  }

  private flashArrival() {
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    this.engine?.showMine(hud.get().mySpawn);
    this.arrivalFlash = setTimeout(() => {
      if (!hud.get().pickArrival) this.engine?.showMine(null);
    }, 2500);
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
    // anything else (no device, the call's media link not up…): say so
    else if (err) toast(`${tr("micFailed")} (${err})`, "warn", 8000);
    else mixer.blip(on ? "pop" : "tape");
  }

  async toggleCam() {
    const err = await this.media.setCam(!hud.get().media.cam);
    if (err === "blocked") toast(tr("camBlocked"), "warn");
    else if (err === "offline") toast(tr("avOffline"), "warn");
    else if (err) toast(`${tr("camFailed")} (${err})`, "warn", 8000);
  }

  async toggleScreen() {
    const on = !hud.get().media.screen;
    const err = await this.media.setScreen(on);
    if (err === "offline") toast(tr("avOffline"), "warn");
    else if (err === "system") toast(tr("screenBlocked"), "warn", 9000);
    else if (err) toast(`${tr("screenFailed")} (${err})`, "warn");
    else if (on && hud.get().media.screen) mixer.blip("pop");
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
      const echo = await getEcho();
      if (!echo || this.stopped) return;
      for (const ch of this.boardChannels) echo.leave(ch);
      this.boardChannels = [];
      for (const b of boards) {
        const name = `board.${b.id}`;
        echo.private(name).listen(".board.event", (e: { type: string; payload: unknown }) => {
          this.scheduleBoards();
          this.celebrate(e);
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
      if (showsBoards(o)) {
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

  // Put a board on a board wall (or a big screen showing boards): its refId,
  // everything else as stored. Builders only (the server says no otherwise).
  setBoard(objectId: string, boardId: number) {
    const s = this.room?.state.objects.get(objectId);
    if (!s || !hud.get().canBuild) return;
    let props: Record<string, unknown> = {};
    try {
      props = JSON.parse(s.props || "{}");
    } catch {}
    this.send("obj:put", { id: s.id, kind: s.kind, x: s.x, y: s.y, rot: s.rot, refId: boardId, props });
  }

  // How many board walls show each board (the picker says where it's up already).
  boardsOnShow(): Map<number, number> {
    const n = new Map<number, number>();
    for (const o of this.engine?.allObjects() ?? [])
      if (o.refId && showsBoards(o)) n.set(o.refId, (n.get(o.refId) ?? 0) + 1);
    return n;
  }

  // A new board in the space's project, straight from a board wall.
  async createBoard(name: string, type: "kanban" | "scrum"): Promise<number | null> {
    const projectId = hud.get().projectId;
    if (!projectId) return null;
    const board = await yutopia.createBoard(projectId, name, type);
    await this.loadBoards();
    return board.id;
  }

  // A card someone was working on is done: confetti over them (whoever's in
  // the room sees it, each from their own copy of the board's events), a
  // fanfare for whoever's near, and a word in the corner.
  private celebrated = new Set<number>();
  private celebrate(e: { type: string; payload: unknown }) {
    const pl = e.payload as Record<string, unknown> | null;
    const cards: Record<string, unknown>[] =
      e.type === "cards.reordered" && Array.isArray(pl?.cards)
        ? (pl.cards as Record<string, unknown>[])
        : e.type === "card.updated" && pl
          ? [pl]
          : [];
    const status = hud.get().status;
    let any = false;
    for (const c of cards) {
      const id = Number(c.id);
      if (!(c.done_at || c.is_done === true) || this.celebrated.has(id)) continue;
      // whose card it was (what they were doing a moment ago)
      for (const [uid, doing] of Object.entries(status)) {
        const card = doing.find((d) => d.id === id);
        if (!card) continue;
        this.celebrated.add(id);
        any = true;
        const sid = this.uidToSid.get(Number(uid));
        const at = sid ? this.whereIs(sid) : null;
        const who = sid ? this.room?.state.players.get(sid)?.name : null;
        if (at) {
          this.engine?.puff(at.x, at.y, "confetti", 70);
          fanfare(Math.max(0, 1 - Math.hypot(at.x - this.me.x, at.y - this.me.y) / 12));
        }
        if (who) toast(`🎉 ${who} ${tr("taskDone")} ${card.ticket} · ${card.name}`);
      }
    }
    // their list moves on
    if (any) setTimeout(() => void this.loadStatus(), 1200);
  }

  private async loadStatus() {
    try {
      const { status } = await yutopia.status(this.spaceId);
      const map: Record<number, (typeof status)[number]["doing"]> = {};
      for (const s of status) map[s.userId] = s.doing;
      hud.set({ status: map });
      // their desks show it
      this.engine?.setDeskTasks(new Map(status.flatMap((s) => (s.doing[0] ? [[s.userId, s.doing[0].ticket]] : []))));
    } catch {}
  }

  // The light follows the local clock (art/daylight.ts: day, golden hour, dusk, night).
  private updateNight() {
    const now = new Date();
    this.hour = now.getHours() + now.getMinutes() / 60;
    this.engine?.setClock(this.hour);
    this.tp?.setHour(this.hour);
  }
  private hour = 12;

  // ── third person (world/tp, its own chunk) ─────────────────────────────────
  // A per-player way of seeing the same world: the iso engine keeps running
  // (it's what everything else asks about the room) but stops drawing, and a
  // three.js view behind you draws the same people and things. Build mode
  // always opens in iso.
  tp: ThirdPersonView | null = null;
  private tpHost: HTMLDivElement | null = null;
  private tpLoading = false;
  private tpDue = 0;
  private tpHidden = 0;
  private meAngle = 0; // my facing in 3D (free; others see the nearest of 8)
  private viewNow: "iso" | "3p" = "iso";

  private syncView() {
    if (!this.engine || !this.room) return;
    const want = prefs().view === "3p" ? "3p" : "iso";
    this.tp?.setMode(prefs().cam3p);
    if (this.tp) {
      this.tp.lookSens = prefs().lookSens;
      this.tp.lookInvert = prefs().lookInvert;
    }
    if (want === this.viewNow) return;
    this.viewNow = want;
    if (want === "3p") void this.openTp();
    else this.closeTp();
  }

  private async openTp() {
    if (this.tp || this.tpLoading) return;
    this.tpLoading = true;
    try {
      const [{ ThirdPersonView }, P, items, themes] = await Promise.all([
        import("./tp/view"),
        loadPeople(),
        loadItemArt() as Promise<typeof import("./art/items")>,
        loadThemes(),
      ]);
      const engine = this.engine;
      if (this.stopped || this.viewNow !== "3p" || !engine) return;
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0";
      this.host.appendChild(host);
      const v = new ThirdPersonView(this.map, engine.allObjects(), P, items, { keys: false, themes });
      v.events = {
        floor: (x, y) => engine.events.onTileClick?.(x, y),
        person: (id, at) => engine.events.onAvatarClick?.(id, at),
        object: (id, at) => engine.events.onObjectClick?.(id, at),
        // build mode: the iso build controller, fed the floor under the 3D pointer
        buildMove: (x, y, at) => {
          // (canvas px, as the iso engine keeps it: drags measure by it)
          const r = engine.app.canvas.getBoundingClientRect();
          engine.pointerAt = { gx: at.x - r.left, gy: at.y - r.top };
          engine.events.onPointerWorld?.(x, y);
        },
        buildDown: (x, y) => engine.events.onPointerDown?.(x, y),
        buildUp: (x, y) => engine.events.onPointerUp?.(x, y),
        wheel: (dy) => engine.events.onWheel?.(dy) ?? false,
        look: (on) => {
          hud.set({ look: on });
          if (!on) this.aimId = null;
        },
        lookRefused: () => toast(tr("lookRefused")),
        aim: (at) => {
          this.aimId = at?.object ?? null;
          this.updatePrompt();
        },
      };
      // what's under the pointer and where things are on screen: as this camera sees them
      engine.picksOverride = (filter) =>
        v
          .picksAtPointer()
          .filter((p) => {
            if (p.dress) return true;
            const o = engine.getObject(p.id);
            return !!o && !!entry(o.kind).buildable && (!filter || filter(o));
          })
          .map((p) =>
            p.dress ? { id: p.id, dress: true as const, kind: p.kind ?? "" } : { id: p.id, dress: false as const },
          );
      engine.clientOverride = (x, y, z) => v.project(x, y, z / 39.19) ?? { x: -9999, y: -9999 };
      engine.floorOverride = (cx, cy, z) => v.floorAt(cx, cy, z / 39.19) ?? { x: -1, y: -1 };
      engine.rayOverride = (cx, cy) => v.rayAt(cx, cy);
      engine.throughOverride = () => v.lookedThrough();
      v.mount(host);
      v.setQuality(this.qualityNow());
      v.setMode(prefs().cam3p);
      v.lookSens = prefs().lookSens;
      v.lookInvert = prefs().lookInvert;
      v.setHour(this.hour);
      v.yaw = this.meAngle; // start behind me
      engine.app.canvas.style.visibility = "hidden";
      engine.onPuff = (x, y, kind, lift) => v.puff(x, y, kind, lift);
      this.tp = v;
      this.tpHost = host;
      v.setHighlight(this.footprintOf(hud.get().prompt?.objectId));
    } catch (e) {
      console.error("third person", e);
      toast(tr("failed"));
      setPrefs({ view: "iso" });
    } finally {
      this.tpLoading = false;
    }
  }

  private closeTp() {
    this.tp?.destroy();
    this.aimId = null;
    if (hud.get().look) hud.set({ look: false });
    this.tp = null;
    this.tpHost?.remove();
    this.tpHost = null;
    const e = this.engine;
    if (e) {
      e.onPuff = null;
      e.picksOverride = null;
      e.clientOverride = null;
      e.floorOverride = null;
      e.rayOverride = null;
      e.throughOverride = null;
      e.app.canvas.style.visibility = "";
    }
  }

  // ease my 3D facing towards an angle (radians)
  private turnTowards(a: number, dt: number) {
    let d = a - this.meAngle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.meAngle += d * Math.min(1, dt * 12);
  }

  // the floor outline of a thing (wall items: just in front of their wall)
  private footprintOf(id: string | undefined): { x: number; y: number; w: number; h: number } | null {
    const o = id ? this.engine?.getObject(id) : undefined;
    if (!o) return null;
    if (entry(o.kind).wall) {
      const r = hangStrip(o, 0.6);
      return { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 };
    }
    const { w, h } = placedFootprint(o);
    return { x: o.x - 0.08, y: o.y - 0.08, w: w + 0.16, h: h + 0.16 };
  }

  // A chat bubble over someone, in both views (switching keeps it).
  private say(id: string, text: string, ms?: number) {
    this.engine?.say(id, text, ms);
    this.tp?.say(id, text, ms);
  }

  // Where a world point is on screen (canvas px), in whichever view is showing.
  // `z`: iso px above the floor (as the iso engine measures).
  clientAt(x: number, y: number, z: number): { x: number; y: number } {
    if (this.tp) return this.tp.project(x, y, z / 39.19) ?? { x: -9999, y: -9999 };
    return this.engine?.worldToClient(x, y, z) ?? { x: -9999, y: -9999 };
  }

  // ── build mode: its own chunk (world/build), loaded when an owner opens it ──
  build: BuildController | null = null;
  private buildLoading: Promise<void> | null = null;
  loadBuild(): Promise<void> {
    if (this.build) return Promise.resolve();
    this.buildLoading ??= import("./build/controller").then((m) => {
      if (this.stopped) return;
      this.build = new m.BuildController(this);
      this.build.refresh();
    });
    return this.buildLoading;
  }
  buildHover(x: number, y: number) {
    this.build?.hover(x, y);
  }
  buildDown(x: number, y: number) {
    this.build?.down(x, y);
  }
  buildUp(x: number, y: number) {
    this.build?.up(x, y);
  }
  buildClick(x: number, y: number) {
    this.build?.click(x, y);
  }
  buildKey(key: string): boolean {
    return this.build?.key(key) ?? false;
  }
  refreshGhost() {
    this.build?.refresh();
  }
  clearRoomGhost() {
    this.build?.clearRoomGhost();
  }
  seatAt(clientX: number, clientY: number): WorldObjectDef | null {
    return this.build?.seatAt(clientX, clientY) ?? null;
  }
  showSeatDrop(at: { x: number; y: number } | null) {
    this.build?.showSeatDrop(at);
  }
  undo() {
    this.send("build:undo", {});
  }
  redo() {
    this.send("build:redo", {});
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
      hBacks: st.hBacks?.length ? [...st.hBacks] : undefined,
      vBacks: st.vBacks?.length ? [...st.vBacks] : undefined,
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
    for (const o of engine.allObjects()) {
      if (o.kind === "chair" || o.kind === "armchair" || o.kind === "beanbag") {
        const occupied = sitting.has(`${o.x},${o.y}`);
        if (!!o.props?.occupied !== occupied) engine.upsertObject({ ...o, props: { ...(o.props ?? {}), occupied } });
        continue;
      }
      if (isRadio(o.kind)) {
        // its display lights while it plays (its own state)
        const playing = radioOf(o).playing;
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

  // Frames per second, at most, right now: the setting — or 30 once nothing
  // has moved for a while (ambient life alone doesn't need more). 0 = no cap.
  private fpsCap(now: number): number {
    const cap = prefs().maxFps;
    if (!cap) return 0;
    const e = this.engine;
    const last = Math.max(this.activeAt, e?.activeAt ?? 0, this.tp?.activeAt ?? 0);
    const h = hud.get();
    const idle = now - last > IDLE_MS && !h.build.on && !h.menu && !this.path && !e?.busy();
    return idle ? Math.min(30, cap) : cap;
  }

  // HUD pieces that follow the picture (tags, meters): run once per drawn frame
  onFrame(cb: () => void): () => void {
    this.hudFrames.add(cb);
    return () => void this.hudFrames.delete(cb);
  }

  private watchFrameRate() {
    const e = this.engine;
    if (!e || prefs().quality !== "auto" || Date.now() - this.startedAt < 8000 || document.hidden) return;
    // (third person: its own frame rate — the iso engine isn't drawing)
    const fps = this.tp ? this.tp.fps : e.stats().fps;
    // (under the cap, or 30 when idle: slow is well under what's asked for)
    const cap = this.fpsCap(performance.now());
    const floor = cap ? Math.min(40, cap * 0.7) : 40;
    this.slowFor = fps > 0 && fps < floor ? this.slowFor + 1 : 0;
    if (this.slowFor < 6 || this.autoTier === "low") return;
    this.slowFor = 0;
    this.autoTier = this.autoTier === "high" ? "medium" : "low";
    e.setQuality(this.autoTier, prefs().reducedMotion);
    this.tp?.setQuality(this.autoTier);
  }

  meTile() {
    return { x: this.me.x, y: this.me.y };
  }

  // ── input ────────────────────────────────────────────────────────────────
  private onKeyDown = (e: KeyboardEvent) => {
    this.activeAt = performance.now();
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
      return;
    if (hud.get().pickArrival && e.key === "Escape") {
      e.preventDefault();
      return this.pickArrival(false);
    }
    // the action menu: a number picks, Esc closes
    const menu = hud.get().menu;
    if (menu) {
      const i = Number(e.key) - 1;
      if (e.key === "Escape") this.closeMenu();
      else if (Number.isInteger(i) && i >= 0 && menu.items[i]?.ok) this.pickAction(menu.items[i].act);
      else return;
      e.preventDefault();
      return;
    }
    if (hud.get().cable && e.key === "Escape" && !hud.get().panel.kind) {
      e.preventDefault();
      return this.dropCable();
    }
    if (hud.get().panel.kind && e.key !== "Escape") return;
    const key = e.key.toLowerCase();
    if (hud.get().build.on && (e.metaKey || e.ctrlKey) && key === "d") {
      e.preventDefault();
      this.build?.duplicate();
      return;
    }
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
    else if (key === "t") setPrefs({ view: prefs().view === "3p" ? "iso" : "3p" });
    else if (key === "z") this.toggleLook();
    else if (key === "enter") {
      e.preventDefault();
      this.tp?.setLook(false);
      hud.set({ side: "chat", chatUnread: 0 });
    } else if (key >= "1" && key <= "8") this.emote(Number(key) - 1);
    else if ((key === "+" || key === "=") && this.tp) this.tp.zoomBy(1 / 1.15);
    else if (key === "-" && this.tp) this.tp.zoomBy(1.15);
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
    const look = parseAvatar(p.avatar);
    return {
      name: p.name,
      // focusing: headphones on
      avatar: p.focus ? { ...look, accessory: "headphones" } : look,
      x: p.x,
      y: p.y,
      d: p.d,
      a: p.a,
      status: p.status,
      speaking: p.speaking,
      emote: p.emote,
      mic: p.mic,
      bot: p.bot,
      held: p.held,
      heldAt: p.heldAt,
      busy: p.busy,
      act: p.act,
      actAt: p.actAt,
      actWith: p.actWith,
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

// the 8 facings (shared/iso.ts) as world angles, for my 3D facing
const DIR_ANGLE = [
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
].map(([x, y]) => Math.atan2(y, x));

function unit(p: Point): Point {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / l, y: p.y / l };
}

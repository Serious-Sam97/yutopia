import { type AuthContext, type Client, Room } from "@colyseus/core";
import {
  ANIM,
  across,
  areaAt,
  atLevel,
  avatarFromSeed,
  CATALOG,
  type ClientMessages,
  campusBuilding,
  canPlace,
  carried,
  clampLift,
  clearCoreFronts,
  convertV1,
  DECOR,
  dirFromDelta,
  doorStartState,
  EMOTES,
  edgeAt,
  edgeKey,
  entry,
  findPath,
  floorsOf,
  Grid,
  getMap,
  HEARING_HZ,
  hearingGain,
  homeOf,
  hostOf,
  hungOnEdge,
  isFloor,
  isJump,
  isKind,
  isLegalMove,
  isOpening,
  isV2,
  jumpReady,
  jumpTimes,
  layoutFromMap,
  levelMap,
  liftFront,
  lockedRooms,
  type MapDef,
  mapFromLayout,
  objLevel,
  onLevel,
  openingBlocker,
  openingEdges,
  openingsIntoWalls,
  parseAvatar,
  replacedByTemplate,
  ringOf,
  type ServerMessages,
  SPLIT_KINDS,
  STEP,
  STOREY,
  type Status,
  setAreasBeyond,
  setOutdoors,
  splitAll,
  stormAt,
  studioV1,
  TEMPLATES,
  TICK_HZ,
  tileAt,
  topCell,
  upgradeCore,
  upgradeGround,
  validLayout,
  type WorldObjectDef,
  windAt,
} from "@yutopia/shared";
import { monitorsToComputers } from "@yutopia/shared/computer";
import { groundsAreaAt, groundsOutdoors } from "@yutopia/shared/grounds";
import { cleanPlaylists, keepPlaying } from "@yutopia/shared/media";
import { ApiError, api, type PresenceEntry } from "./api.ts";
import { verifyWorldToken, type WorldClaims } from "./auth.ts";
import { config } from "./config.ts";
import { type Feature, installFeatures } from "./features/index.ts";
import { removeParticipant, setCanPublish } from "./livekit.ts";
import { metrics } from "./metrics.ts";
import { Player, WorldObject, WorldState } from "./schema.ts";

// The ground floor stands on the Grounds (docs/plan/27-the-grounds.md): its
// grids know the land round it (its tiles beyond the stored ones).
setOutdoors(groundsOutdoors);
setAreasBeyond(groundsAreaAt);

// a jump lets a body up for this long (the longest one, falling to the floor from up high)
const JUMP_AIR_MS = 3000;

// A spot in the building: a floor (shared levels.ts) and where on it.
export interface Spot {
  x: number;
  y: number;
  level: number;
}

interface ClientData {
  claims: WorldClaims;
  lastPosAt: number;
  zMax?: number; // how high their jump can take them (tiles)
  avatarAt?: number; // last look change (rate limit)
  hears: Set<string>; // sids this client can hear
  heardByKey: string; // last "heard by" list sent, to skip no-op updates
  kicked?: boolean; // replaced by a newer tab
}

export type WorldClient = Client<ClientData, WorldClaims>;

const STATUSES: Status[] = ["online", "away", "dnd"];

// The one world everybody walks in: a single room for the whole process (never a
// second copy writing the same world), its voice in one LiveKit room.
export class WorldRoom extends Room<WorldState> {
  // the most people in at once; past it a join is refused (Colyseus would
  // otherwise open a second copy of the world at maxClients)
  static CAPACITY = 500;
  maxClients = WorldRoom.CAPACITY + 50;
  // Reconnects (network blips, laptop sleep) keep your avatar for this long.
  static RECONNECT_SECONDS = 20;
  // the live world (the API's pushes reach people through it, server.ts)
  static current: WorldRoom | null = null;
  // the API is replacing the world's data (server.ts /internal/hold): no opening it meanwhile
  static held = false;

  map!: MapDef;
  grid!: Grid;
  readonly livekitRoom = "world";
  private features: Feature[] = [];
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private removedUntil = new Map<number, number>();
  // the arrival points people picked for themselves (user id → tile centre, its floor)
  readonly mySpawns = new Map<number, { x: number; y: number; level?: number }>();
  private lastPresence = "";
  // features that watch every message before it's handled (build history)
  readonly messageTaps: ((client: WorldClient, type: string) => void)[] = [];

  send<K extends keyof ServerMessages>(client: Client, type: K, msg: ServerMessages[K]): void {
    client.send(type, msg);
  }

  broadcastMsg<K extends keyof ServerMessages>(type: K, msg: ServerMessages[K], except?: Client): void {
    this.broadcast(type, msg, except ? { except } : undefined);
  }

  on<K extends keyof ClientMessages>(type: K, fn: (client: WorldClient, msg: ClientMessages[K]) => void): void {
    this.onMessage(type, (client: WorldClient, msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      metrics.inc("messages_total");
      try {
        for (const tap of this.messageTaps) tap(client, type as string);
        fn(client, msg as ClientMessages[K]);
      } catch (e) {
        metrics.inc("message_errors_total");
        console.warn(`[world] ${String(type)} failed:`, (e as Error).message);
      }
    });
  }

  async onCreate() {
    // (offline sandboxes, server.ts, may be several: the newest is "current")
    if (WorldRoom.held) throw new Error("The world is being reset — try again in a moment");
    if (WorldRoom.current && !config.offline) throw new Error("The world is already open");
    WorldRoom.current = this;
    this.setState(new WorldState());
    this.autoDispose = true;

    const info = config.offline
      ? null
      : await api.world().catch((e) => {
          WorldRoom.current = null;
          throw e;
        });
    const base = getMap(info?.mapKey ?? "studio");
    const layout = info?.layout && validLayout(info.layout) ? info.layout : null;
    let objects: WorldObjectDef[] = info?.objects ?? base.objects;
    if (layout && isV2(layout)) this.map = mapFromLayout(base.key, base.name, layout);
    else if (layout) {
      // saved before map v2 (walls were tiles): convert, boards and doors included
      const v1 = { ...mapFromLayout(base.key, base.name, layout), tiles: [...layout.tiles], hWalls: [], vWalls: [] };
      const c = convertV1(v1, objects);
      this.map = c.map;
      objects = c.objects;
      this.migrated = c.changed;
    } else {
      this.map = base;
      // the built-in Studio, seeded before map v2: move its boards and doors too
      if (info?.seeded) {
        const c = convertV1(studioV1, objects);
        objects = c.objects;
        this.migrated = c.changed;
      }
    }
    if (this.migrated) console.log(`[map v2] the world: converted (${this.migrated.length} objects moved)`);
    // doors and windows set into walls (openings.ts): doors in a gap get their
    // wall, windows painted on become windows — once, stored right away
    const into = openingsIntoWalls(this.map, objects);
    if (into.mapChanged) {
      // (a world seeded from now, or offline: its seed carries the windows too)
      this.map = info?.seeded ? into.map : { ...into.map, objects: [...into.map.objects, ...into.added] };
      objects = into.objects;
      console.log(`[openings] the world: into the walls (${into.added.length} windows)`);
      if (!config.offline && info?.seeded) {
        await saveAll(into.added, (o) => api.putObject(o));
        if (this.migrated) this.saveMigration();
        else await api.putLayout(layoutFromMap(this.map)).catch((e) => console.warn("[openings] layout", e.message));
      }
    }
    this.state.mapKey = this.map.key;
    this.syncMapState();
    this.state.name = info?.name ?? "Offline studio";
    if (info && !info.seeded) {
      objects = (await api.seed(this.map.objects)).objects;
      // a fresh world starts on map v2: store its layout so it's never taken for an old one
      if (!layout) void api.putLayout(layoutFromMap(this.map)).catch(() => {});
    }
    // furniture from before bare desks: what was drawn on it becomes real
    // things, once, stored before anyone can move them
    const bare = splitAll(objects);
    objects = bare.objects;
    if (bare.changed.length) {
      console.log(`[bare] the world: ${bare.changed.length} things set out on their own`);
      if (!config.offline) await saveAll(bare.changed, (o) => api.putObject(o));
    }
    // monitors from before the computers (shared/computer.ts): each becomes one, once
    const pcs = monitorsToComputers(objects);
    objects = pcs.objects;
    if (pcs.changed.length) {
      console.log(`[computers] the world: ${pcs.changed.length} monitors are computers now`);
      if (!config.offline) await saveAll(pcs.changed, (o) => api.putObject(o));
    }
    // the building (docs/plan/25-building-floors.md): a world from before floors
    // becomes the top of five — the lobby and the lot below, the core — once,
    // stored right away
    const building = config.building ? campusBuilding(this.map, objects) : null;
    if (building) {
      this.map = building.map;
      const moved = new Map(building.moved.map((o) => [o.id, o]));
      objects = [...objects.map((o) => moved.get(o.id) ?? o), ...building.add];
      this.syncMapState();
      console.log(
        `[building] the world: ${floorsOf(this.map).length} floors (${building.add.length} new things, ${building.moved.length} moved)`,
      );
      if (!config.offline) {
        await saveAll([...building.moved, ...building.add], (o) => api.putObject(o));
        await api.putLayout(layoutFromMap(this.map)).catch((e) => console.warn("[building] layout", e.message));
      }
    }
    // a building with the first core (the stairs' landing one tile deep): today's
    const upgraded = config.building ? upgradeCore(this.map, objects) : null;
    if (upgraded) {
      this.map = upgraded.map;
      objects = upgraded.objects;
      this.syncMapState();
      console.log(`[building] the core: a row deeper (${upgraded.moved.length} things moved)`);
      if (!config.offline) {
        await saveAll(upgraded.moved, (o) => api.putObject(o));
        await api.putLayout(layoutFromMap(this.map)).catch((e) => console.warn("[building] layout", e.message));
      }
    }
    // the Grounds (docs/plan/27): the courtyard's blocks' ground floors become
    // the ground floor's own (it grows to take them in; nothing on it moves)
    const grown = config.building ? upgradeGround(this.map) : null;
    if (grown) {
      this.map = grown;
      this.syncMapState();
      console.log("[building] the ground floor: the courtyard's blocks in it");
      if (!config.offline)
        await api.putLayout(layoutFromMap(this.map)).catch((e) => console.warn("[building] layout", e.message));
    }
    // nothing standing in front of the elevators' and the stairs' doors
    const fronts = clearCoreFronts(this.map, objects);
    if (fronts.length) {
      const moved = new Map(fronts.map((o) => [o.id, o]));
      objects = objects.map((o) => moved.get(o.id) ?? o);
      console.log(`[building] the core's doors: ${fronts.length} things moved out of the way`);
      if (!config.offline) await saveAll(fronts, (o) => api.putObject(o));
    }
    for (const o of objects) this.state.objects.set(o.id, toSchema(o));
    this.rebuildGrid();
    if (this.migrated && config.saveMigrations) this.saveMigration();

    this.state.playlists = JSON.stringify(cleanPlaylists(info?.playlists ?? []));
    this.registerMessages();
    this.features = installFeatures(this);

    this.setPatchRate(1000 / TICK_HZ);
    let last = Date.now();
    this.setSimulationInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      for (const f of this.features) f.tick?.(dt, now);
      for (const p of this.state.players.values()) if (p.emote && now - p.emoteAt > 3500) p.emote = "";
      metrics.tick(Date.now() - now);
    }, 1000 / TICK_HZ);
    this.clock.setInterval(() => this.hearingPass(), 1000 / HEARING_HZ);
    this.clock.setInterval(() => this.pushPresence(true), 60_000);
    this.clock.setInterval(() => this.weather(), 1000);
    this.weather();
  }

  // the storm over the Grounds, from the schedule (shared weather.ts) unless an
  // admin called one up or sent it off (until the schedule's next change)
  private stormSet: { to: number; until: number } | null = null;
  private weather(now = Date.now()) {
    if (this.stormSet && now > this.stormSet.until) this.stormSet = null;
    const want = this.stormSet?.to ?? stormAt(now);
    // (a called-up storm comes up as a scheduled one does, over a minute or so)
    const s = this.state.storm;
    this.state.storm = Math.abs(want - s) < 0.02 ? want : s + Math.sign(want - s) * Math.min(Math.abs(want - s), 0.02);
    this.state.wind = windAt(now);
  }

  async onAuth(_client: Client, options: { token?: string }, _ctx: AuthContext): Promise<WorldClaims> {
    const claims = await this.claimsFor(options);
    if ((this.removedUntil.get(claims.userId) ?? 0) > Date.now()) throw new Error("Removed by an admin for a while");
    // (someone already in, opening a new tab, takes their own place)
    const here = this.clients.some((c) => c.auth?.userId === claims.userId);
    if (!here && this.clients.length >= WorldRoom.CAPACITY) throw new Error("The world is full right now");
    return claims;
  }

  private async claimsFor(options: { token?: string }): Promise<WorldClaims> {
    const token = String(options?.token ?? "");
    if (config.offline && token.startsWith("dev:")) {
      // offline tests only: a real (non-bot) person without the API
      const [, id, name, roles] = token.split(":");
      return {
        userId: Number(id),
        name: name || `Dev ${id}`,
        avatar: avatarFromSeed(Number(id)),
        roles: (roles || "member").split(","),
      };
    }
    if (config.allowBots && token.startsWith("bot:")) {
      const [, id, name] = token.split(":");
      return {
        userId: Number(id),
        name: name || `Bot ${id}`,
        avatar: avatarFromSeed(Number(id)),
        roles: ["member", "bot"],
      };
    }
    return verifyWorldToken(token);
  }

  async onJoin(client: WorldClient, _options: unknown, claims: WorldClaims) {
    // One avatar per person: a second tab takes over from the first.
    for (const other of this.clients) {
      if (other !== client && other.auth?.userId === claims.userId) {
        if (other.userData) (other.userData as ClientData).kicked = true;
        this.send(other, "kicked", { reason: "Opened in another tab" });
        other.leave(4001);
      }
    }
    client.userData = {
      claims,
      lastPosAt: Date.now(),
      hears: new Set(),
      heardByKey: "",
    };
    const p = new Player();
    p.sid = client.sessionId;
    p.uid = claims.userId;
    p.name = claims.name;
    p.avatar = JSON.stringify(claims.avatar);
    p.builder = claims.roles.includes("builder");
    p.admin = claims.roles.includes("admin");
    p.bot = claims.roles.includes("bot");

    // Everyone arrives at the arrival point (set in build mode → Map), or at
    // the spot they picked for themselves (features/arrival.ts).
    // Your desk is still yours — "My desk" takes you there — but entering
    // doesn't hand one out: someone assigns it in build mode, or you kept it from before.
    if (!p.bot && !config.offline) {
      const seats = [...this.state.objects.values()].filter((o) => entry(o.kind).seat && safeJson(o.props).desk);
      const owned = seats.find((o) => safeJson(o.props).ownerId === claims.userId);
      const free = seats.filter((o) => safeJson(o.props).ownerId == null).map((o) => o.id);
      const [desk, mine] = await Promise.all([
        owned ? { desk: owned.id } : api.desk(claims.userId, free, false).catch(() => ({ desk: null })),
        api.spawn(claims.userId).catch(() => ({ spawn: undefined })),
      ]);
      if (desk.desk && this.state.objects.get(desk.desk)) p.desk = desk.desk;
      if (mine.spawn) this.mySpawns.set(claims.userId, { ...mine.spawn, level: mine.spawn.level ?? undefined });
      else if (mine.spawn === null) this.mySpawns.delete(claims.userId);
    }
    const at = p.bot ? this.homeSpot() : this.arrivalFor(p);
    const g = this.gridFor(p.uid, at.level);
    const open = g.fits(at.x, at.y) ? at : (g.nearestOpen(at.x, at.y) ?? this.map.spawn);
    p.level = at.level;
    p.x = open.x;
    p.y = open.y;
    p.area = this.areaOf(p)?.key ?? "";
    this.state.players.set(client.sessionId, p);
    metrics.inc("joins_total");
    for (const f of this.features) f.join?.(client, p);
    this.pushPresence();
  }

  async onLeave(client: WorldClient, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    const replaced =
      client.userData?.kicked || this.clients.some((c) => c !== client && c.auth?.userId === client.auth?.userId);
    if (p && !consented && !replaced) {
      p.status = "away";
      for (const f of this.features) f.drop?.(client, p);
      try {
        const again = (await this.allowReconnection(client, WorldRoom.RECONNECT_SECONDS)) as WorldClient;
        p.status = "online";
        for (const f of this.features) f.back?.(again, p);
        return;
      } catch {
        // timed out — fall through and remove
      }
    }
    if (p) for (const f of this.features) f.leave?.(client, p);
    this.state.players.delete(client.sessionId);
    // Only drop the LiveKit identity if this person has no other live session.
    const stillHere = [...this.state.players.values()].some((q) => q.uid === p?.uid);
    if (p && !p.bot && !stillHere) void removeParticipant(this.livekitRoom, String(p.uid));
    this.cleanBooths();
    this.pushPresence();
  }

  async onDispose() {
    if (WorldRoom.current === this) WorldRoom.current = null;
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    // an edit still waiting on its debounce (e.g. a deploy right after a resize)
    if (this.layoutTimer) {
      clearTimeout(this.layoutTimer);
      await this.saveLayout();
    }
    if (!config.offline) await api.presence([]).catch(() => {});
    for (const f of this.features) f.dispose?.();
  }

  // ── messages ───────────────────────────────────────────────────────────────
  private registerMessages() {
    this.on("pos", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
      // (on the shuttle: it carries them — features/grounds-life.ts)
      if (p.busy === "ride:shuttle") return;
      const now = Date.now();
      const dt = (now - data(client).lastPosAt) / 1000;
      data(client).lastPosAt = now;
      const to = { x: m.x, y: m.y };
      // the feet's height: up only in a jump (as high as it goes from where it
      // started), a step, or the stairs (as high as the tread under them; below
      // the floor going down them)
      // (outdoors the ground itself goes down into the ravine and up the hills)
      const z = Math.max(-30, Math.min(60, Number(m.z) || 0));
      const ud = data(client);
      const snap = () => this.send(client, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
      // another floor: only up or down the stairs, one at a time (the frame moves a storey)
      const level = Number.isInteger(m.l) ? (m.l as number) : p.level;
      let from: { x: number; y: number } = p;
      let zFrom = p.z;
      if (level !== p.level) {
        if (Math.abs(level - p.level) !== 1 || !levelMap(this.map, level)) return snap();
        from = across(this.map, p.level, level, p);
        zFrom = p.z + (level > p.level ? -STOREY : STOREY);
        if (!this.gridFor(p.uid, level).onRamp(to.x, to.y)) return snap();
        if (ud.zMax !== undefined) ud.zMax += level > p.level ? -STOREY : STOREY;
      }
      const grid = this.gridFor(p.uid, level);
      const jumping = isJump(p.jump) && now - p.jumpAt < JUMP_AIR_MS;
      let cap = jumping ? (ud.zMax ?? 0) : zFrom + STEP + 0.05;
      if (grid.onRamp(to.x, to.y)) cap = Math.max(cap, grid.groundAt(to.x, to.y, z) + 0.05);
      // outdoors: up the slope as far as the ground goes (a message carries a few frames' climb)
      else if (grid.onLand(to.x, to.y)) cap = Math.max(cap, grid.groundAt(to.x, to.y, z) + 0.3);
      if (z > cap || !isLegalMove(grid, from, to, dt, z, zFrom)) return snap();
      const nextArea = areaAt(this.levelMap(level), to.x, to.y);
      if (nextArea && nextArea.key !== p.area && !this.mayEnter(p, nextArea.key)) {
        snap();
        this.knock(client, p, nextArea.key);
        return;
      }
      if (level !== p.level) {
        const was = p.level;
        p.level = level;
        for (const f of this.features) f.levelChange?.(client, p, was, level);
      }
      p.x = to.x;
      p.y = to.y;
      p.z = z;
      p.d = (Math.max(0, Math.min(7, m.d | 0)) as number) ?? 0;
      p.a = m.a === ANIM.walk || m.a === ANIM.sit ? m.a : ANIM.idle;
      const area = nextArea?.key ?? "";
      if (area !== p.area) {
        const prev = p.area;
        p.area = area;
        for (const f of this.features) f.areaChange?.(client, p, prev, area);
        this.cleanBooths();
        this.pushPresence();
      }
    });

    this.on("emote", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !EMOTES.includes(m.e)) return;
      p.emote = m.e;
      p.emoteAt = Date.now();
    });

    // a jump: standing on the floor (not seated, not at something), once the last one is coming down
    this.on("jump", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !isJump(m?.k) || p.a === ANIM.sit || p.busy || p.act) return;
      const now = Date.now();
      if (isJump(p.jump) && !jumpReady(p.jump, (now - p.jumpAt) / 1000 + 0.1)) return;
      p.jump = m.k;
      p.jumpAt = now;
      // (how high it can take them: from where they stand)
      data(client).zMax = p.z + jumpTimes(m.k).h + 0.2;
    });

    // a new look, saved in the API by the editor: validated, at most every 2 s
    this.on("avatar", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      const ud = data(client);
      const now = Date.now();
      if (!p || now - (ud.avatarAt ?? 0) < 2000) return;
      ud.avatarAt = now;
      p.avatar = JSON.stringify(parseAvatar(m?.avatar));
    });

    this.on("status", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !STATUSES.includes(m.status)) return;
      p.status = m.status;
      this.pushPresence();
    });

    this.on("media", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.mic = !!m.mic && !p.muted;
      p.cam = !!m.cam;
      p.screen = !!m.screen;
      // muted by an admin: their voice line may have reconnected (it sleeps
      // when they're alone, a fresh connection can publish): say no again
      if (p.muted) void setCanPublish(this.livekitRoom, String(p.uid), false);
    });

    this.on("speaking", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.speaking = !!m.on && p.mic;
    });

    this.on("knock", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof m.area === "string") this.knock(client, p, m.area);
    });

    this.on("admit", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.area !== m.area) return;
      this.state.boothGuests.set(`${m.area}:${m.userId}`, "1");
      const guest = this.clients.find((c) => c.auth?.userId === m.userId);
      if (guest) this.send(guest, "admitted", { area: m.area });
    });

    this.on("teleport", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      let target: Spot | null = null;
      if (m.to === "spawn") target = this.arrivalFor(p);
      else if (m.to === "desk") {
        const seat = p.desk ? this.state.objects.get(p.desk) : undefined;
        target = seat ? { x: seat.x + 0.5, y: seat.y + 0.5, level: objLevel(fromSchema(seat), this.map) } : null;
      } else if (typeof m.to === "object" && m.to && "userId" in m.to) {
        const userId = m.to.userId;
        const other = [...this.state.players.values()].find((q) => q.uid === userId);
        if (other) {
          // beside them, somewhere they could walk to (not the far side of a
          // wall, not inside a shut elevator car)
          const og = this.gridFor(p.uid, other.level);
          const near =
            [
              [1, 1],
              [-1, 1],
              [1, -1],
              [-1, -1],
              [0, 1.4],
              [1.4, 0],
              [-1.4, 0],
              [0, -1.4],
            ]
              .map(([dx, dy]) => ({ x: other.x + dx, y: other.y + dy }))
              .find((c) => {
                if (!og.fits(c.x, c.y)) return false;
                const way = findPath(og, other, c);
                return !!way && way.length <= 4;
              }) ??
            og.nearestOpen(other.x + 1, other.y + 1) ??
            ({ x: other.x, y: other.y } as { x: number; y: number });
          target = { ...near, level: other.level };
        }
      } else if (typeof m.to === "object" && m.to && "x" in m.to && p.builder) {
        // a spot on a floor ("Go there" in build mode)
        const x = Number(m.to.x);
        const y = Number(m.to.y);
        const level = Number.isInteger(m.to.level) ? (m.to.level as number) : p.level;
        const lm = levelMap(this.map, level);
        // (or out on the land round the ground floor)
        const inside = x >= 0 && y >= 0 && lm && x < lm.width && y < lm.height;
        const land = lm && !inside && this.gridFor(p.uid, level).ok(Math.floor(x), Math.floor(y));
        if (lm && Number.isFinite(x) && Number.isFinite(y) && (inside || land)) target = { x, y, level };
      }
      if (!target) return;
      // never into a room you can't walk into (locked doors, sealed rooms): from
      // your floor's way up (an elevator, the stairs) when it's another floor
      const mine = this.gridFor(p.uid, target.level);
      const landing = mine.fits(target.x, target.y) ? target : mine.nearestOpen(target.x, target.y);
      const startAt: { x: number; y: number } =
        target.level === p.level ? p : (this.levelEntry(target.level, p.uid) ?? landing ?? p);
      if (
        !landing ||
        // (the land outdoors is all one place: no need to find the way there)
        (!mine.onLand(landing.x, landing.y) &&
          !findPath(mine, startAt, landing)?.length &&
          Math.hypot(landing.x - startAt.x, landing.y - startAt.y) > 0.5)
      ) {
        this.send(client, "toast", { text: "Can't get there — the door is locked.", tone: "warn" });
        return;
      }
      const lm = this.levelMap(target.level);
      const area = areaAt(lm, landing.x, landing.y);
      if (area && !this.mayEnter(p, area.key)) {
        // Land at the door instead and knock.
        this.knock(client, p, area.key);
        return;
      }
      const seat = mine.seatAt(landing.x, landing.y);
      const was = p.level;
      p.level = target.level;
      p.x = landing.x;
      p.y = landing.y;
      p.z = mine.onLand(landing.x, landing.y) ? mine.groundAt(landing.x, landing.y, 0) : 0;
      p.a = seat ? ANIM.sit : ANIM.idle;
      if (seat) p.d = seatFacing(seat.rot);
      p.area = area?.key ?? "";
      this.send(client, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
      if (was !== p.level) for (const f of this.features) f.levelChange?.(client, p, was, p.level);
      this.pushPresence();
    });

    this.on("obj:put", (client, m) => void this.putObject(client, m));
    this.on("obj:remove", (client, m) => void this.removeObject(client, m.id));
    this.on("build:template", (client, m) => void this.applyTemplate(client, String(m.template)));

    // ── moderation (admins) ──
    const owner = (client: WorldClient) => this.state.players.get(client.sessionId)?.admin === true;
    // the weather: a storm called up (1), sent off (0), or back to the schedule (null)
    this.on("mod:storm", (client, m) => {
      if (!owner(client) && !config.offline) return;
      const to = m.storm === null || m.storm === undefined ? null : Math.max(0, Math.min(1, Number(m.storm) || 0));
      this.stormSet = to === null ? null : { to, until: Date.now() + 20 * 60_000 };
      if (m.now) this.state.storm = to ?? stormAt(Date.now());
    });
    const byUid = (uid: number) => [...this.state.players.values()].find((q) => q.uid === uid);
    this.on("mod:mute", (client, m) => {
      const target = byUid(Number(m.userId));
      if (!owner(client) || !target || target.bot) return;
      target.muted = !!m.muted;
      if (target.muted) target.mic = false;
      void setCanPublish(this.livekitRoom, String(target.uid), !target.muted);
      const c = this.clients.getById(target.sid);
      if (c)
        this.send(c, "toast", {
          text: target.muted ? "An admin muted you." : "You can talk again.",
          tone: "warn",
        });
    });
    this.on("mod:kick", (client, m) => {
      const target = byUid(Number(m.userId));
      const me = this.state.players.get(client.sessionId);
      if (!owner(client) || !target || target.uid === me?.uid) return;
      this.removedUntil.set(target.uid, Date.now() + 10 * 60_000);
      const c = this.clients.getById(target.sid) as WorldClient | undefined;
      if (c) {
        if (c.userData) c.userData.kicked = true;
        this.send(c, "kicked", { reason: "removed" });
        c.leave(4002);
      }
      void removeParticipant(this.livekitRoom, String(target.uid));
    });
    this.on("mod:lock", (client, m) => {
      const p = this.state.players.get(client.sessionId);
      const area = this.areaByKey(m.area);
      if (!owner(client) || !p || !area || area.kind === "open" || area.kind === "stage") return;
      if (m.locked) this.state.locks.set(area.key, p.name);
      else this.state.locks.delete(area.key);
    });
  }

  // Where this person arrives: their own spot while they can still get there
  // from the world's arrival point (doors, rooms and furniture change) and may
  // walk in (a booth someone's talking in, a room locked right now), else the world's.
  arrivalFor(p: Player): Spot {
    const m = this.mySpawns.get(p.uid);
    const mine = m ? { x: m.x, y: m.y, level: m.level ?? this.home } : null;
    return mine && !this.arrivalProblem(p, mine, this.homeSpot()) ? mine : this.homeSpot();
  }

  /** The world's arrival point (on the home floor). */
  homeSpot(): Spot {
    return { ...this.map.spawn, level: this.home };
  }

  get home(): number {
    return homeOf(this.map);
  }

  // Why someone can't arrive at `at` (a tile centre), walking from `from`; null: they can.
  arrivalProblem(p: Player, at: Spot, from: Spot): string | null {
    const g = this.gridFor(p.uid, at.level);
    if (!levelMap(this.map, at.level)) return "That floor isn't there any more.";
    if (!g.inBounds(Math.floor(at.x), Math.floor(at.y))) return "That's off the map.";
    if (!g.ok(Math.floor(at.x), Math.floor(at.y)) || !g.fits(at.x, at.y)) return "Pick an open floor tile.";
    // from another floor: from where the elevators stop on this one
    if (from.level !== at.level) from = { ...(this.levelEntry(at.level, p.uid) ?? at), level: at.level };
    const area = areaAt(this.levelMap(at.level), at.x, at.y);
    if (area && area.key !== p.area && !this.mayEnter(p, area.key))
      return `Someone's in ${area.name} with the door shut — try again when it's free.`;
    const start = g.fits(from.x, from.y) ? from : g.nearestOpen(from.x, from.y);
    if (!start) return "Can't get there from here.";
    if (Math.hypot(start.x - at.x, start.y - at.y) < 0.5 || findPath(g, start, at, g.width * g.height)?.length)
      return null;
    return "Can't get there — the door is locked.";
  }

  // ── booths ────────────────────────────────────────────────────────────────
  mayEnter(p: Player, areaKey: string): boolean {
    const area = this.areaByKey(areaKey);
    // booths, and rooms an owner locked: knock to get in
    if (area?.kind !== "booth" && !this.state.locks.has(areaKey)) return true;
    // your own booth is yours: walk in whoever's talking in it (a project
    // owner's lock still holds)
    if (area?.kind === "booth" && area.ownerId === p.uid && !this.state.locks.has(areaKey)) return true;
    // "someone" never means you: your last session may still be in there
    // (a reload keeps it for RECONNECT_SECONDS) — arrivals checked it before
    // the new one was seated and bounced you to the world's arrival point.
    const inside = [...this.state.players.values()].filter((q) => q.uid !== p.uid && q.area === areaKey && !q.bot);
    return inside.length === 0 || this.state.boothGuests.has(`${areaKey}:${p.uid}`);
  }

  private knock(client: WorldClient, p: Player, areaKey: string) {
    const area = this.areaByKey(areaKey);
    if (!area) return;
    const lastKey = `knock:${areaKey}`;
    const ud = client.userData as ClientData & Record<string, number>;
    if (Date.now() - (ud[lastKey] ?? 0) < 4000) return;
    ud[lastKey] = Date.now();
    for (const c of this.clients) {
      const q = this.state.players.get(c.sessionId);
      if (q && q.area === areaKey) this.send(c, "knock", { from: client.sessionId, fromName: p.name, area: areaKey });
    }
    this.send(client, "toast", { text: `Knocked on ${area.name}. Waiting for someone to let you in…` });
  }

  private cleanBooths() {
    for (const key of [...this.state.locks.keys()]) {
      if (![...this.state.players.values()].some((q) => q.area === key)) this.state.locks.delete(key);
    }
    for (const key of [...this.state.boothGuests.keys()]) {
      const area = key.split(":")[0];
      const someone = [...this.state.players.values()].some((q) => q.area === area);
      if (!someone) this.state.boothGuests.delete(key);
    }
  }

  // ── hearing ────────────────────────────────────────────────────────────────
  // Hearing isn't symmetric (the stage reaches everyone), so each client gets
  // both lists: whom to subscribe to, and whom its own tracks are allowed for.
  // LiveKit enforces the second one at the SFU (publisher track permissions).
  private hearingPass() {
    const players = [...this.state.players.entries()];
    const heardBy = new Map<string, Set<string>>(); // speaker sid → listener uids
    const next = new Map<string, Set<string>>();
    for (const client of this.clients) {
      const ud = client.userData as ClientData | undefined;
      const me = this.state.players.get(client.sessionId);
      if (!ud || !me || me.bot) continue;
      const hears = new Set<string>();
      const ear = this.earOf(me);
      for (const [sid, other] of players) {
        if (sid === client.sessionId || other.bot) continue;
        const g = hearingGain(this.map, ear, this.earOf(other), ud.hears.has(sid));
        if (g > 0) {
          hears.add(sid);
          if (!heardBy.has(sid)) heardBy.set(sid, new Set());
          heardBy.get(sid)?.add(String(me.uid));
        }
      }
      next.set(client.sessionId, hears);
    }
    for (const client of this.clients) {
      const ud = client.userData as ClientData | undefined;
      const hears = next.get(client.sessionId);
      if (!ud || !hears) continue;
      const by = [...(heardBy.get(client.sessionId) ?? [])].sort();
      const byKey = by.join(",");
      if (!sameSet(hears, ud.hears) || byKey !== ud.heardByKey) {
        ud.hears = hears;
        ud.heardByKey = byKey;
        this.send(client, "hear", { ids: [...hears], heardBy: by });
      }
    }
  }

  // Where someone is, as the phone tells others: their room's name, or the
  // world's in the open, in a booth or in focus mode (those stay discreet).
  whereIs(p: Player): string {
    const area = this.areaByKey(p.area);
    if (!area || area.kind === "booth" || p.status === "dnd") return this.state.name;
    return area.name;
  }

  // ── presence → the API (the phone's contacts show where people are) ───────────
  pushPresence(force = false) {
    if (config.offline) return;
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.presenceTimer = setTimeout(() => {
      const people: PresenceEntry[] = [...this.state.players.values()]
        .filter((p) => !p.bot)
        .map((p) => {
          const area = this.areaByKey(p.area);
          // Booths and focus mode stay discreet.
          const discreet = area?.kind === "booth" || p.status === "dnd";
          return {
            user_id: p.uid,
            name: p.name,
            area: discreet ? null : p.area || null,
            area_name: discreet ? null : (area?.name ?? null),
            status: p.status,
          };
        });
      const key = JSON.stringify(people);
      if (!force && key === this.lastPresence) return;
      this.lastPresence = key;
      api.presence(people).catch((e) => console.warn("[presence]", e.message));
    }, 500);
  }

  // ── build mode ──────────────────────────────────────────────────────────────
  // ── the map ─────────────────────────────────────────────────────────────────
  private personalGrids = new Map<string, Grid>();
  private layoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Each person's walk grid on a floor: locked doors are walls unless it's their room.
  gridFor(uid: number, level = this.home): Grid {
    const key = `${uid}|${level}`;
    let g = this.personalGrids.get(key);
    if (!g) {
      g = Grid.from(this.levelMap(level), [...this.state.objects.values()].map(fromSchema), { uid });
      this.personalGrids.set(key, g);
    }
    return g;
  }

  // ── the building (shared levels.ts) ─────────────────────────────────────
  /** One floor as a map (the home floor for one that isn't there). */
  levelMap(level: number): MapDef {
    return levelMap(this.map, level) ?? this.map;
  }

  /** The room with this key, on whichever floor it is (keys are the building's). */
  areaByKey(key: string) {
    for (const level of floorsOf(this.map)) {
      const a = this.levelMap(level).areas.find((x) => x.key === key);
      if (a) return a;
    }
    return undefined;
  }

  /** The room someone's in. */
  areaOf(p: { x: number; y: number; level: number }) {
    return areaAt(this.levelMap(p.level), p.x, p.y);
  }

  /** How someone hears and is heard: their floor, and whether they're in a stairwell. */
  earOf(p: Player) {
    return {
      x: p.x,
      y: p.y,
      dnd: p.status === "dnd",
      level: p.level,
      stairs: this.gridFor(p.uid, p.level).onRamp(p.x, p.y),
    };
  }

  /** Someone put somewhere in the building by the server (an elevator ride):
   *  their client snaps there, and the features hear of a floor change. */
  moveTo(client: WorldClient, p: Player, to: Spot) {
    const was = p.level;
    p.level = to.level;
    p.x = to.x;
    p.y = to.y;
    p.z = 0;
    p.area = this.areaOf(p)?.key ?? "";
    this.send(client, "snap", { x: p.x, y: p.y, z: 0, level: p.level });
    if (was !== p.level) for (const f of this.features) f.levelChange?.(client, p, was, p.level);
    this.pushPresence();
  }

  /** Where you come out on a floor from another one: in front of its elevators. */
  levelEntry(level: number, uid: number): { x: number; y: number } | null {
    const g = this.gridFor(uid, level);
    for (const o of this.state.objects.values()) {
      const def = fromSchema(o);
      if (o.kind !== "elevator" || objLevel(def, this.map) !== level) continue;
      const front = liftFront(def, 0.5);
      const at = g.nearestOpen(front.x, front.y, 3);
      if (at) return at;
    }
    const lm = this.levelMap(level);
    return g.fits(lm.spawn.x, lm.spawn.y) ? lm.spawn : g.nearestOpen(lm.spawn.x, lm.spawn.y);
  }

  // Objects moved by a v1 → v2 conversion that isn't stored yet.
  private migrated: WorldObjectDef[] | null = null;

  // Write a conversion back: the v2 layout and the boards/doors it moved.
  private saveMigration() {
    const moved = this.migrated;
    this.migrated = null;
    if (config.offline || !moved) return;
    void api.putLayout(layoutFromMap(this.map)).catch((e) => console.warn("[map v2] layout", e.message));
    for (const o of moved) void api.putObject(o).catch((e) => console.warn("[map v2] object", e.message));
    console.log("[map v2] the world: saved");
  }

  syncMapState() {
    const m = this.map;
    this.state.floor = m.floor ?? 0;
    this.state.levels = JSON.stringify(m.levels ?? []);
    this.state.width = m.width;
    this.state.height = m.height;
    this.state.tiles.clear();
    for (const row of m.tiles) this.state.tiles.push(row);
    this.state.hWalls.clear();
    for (const row of m.hWalls) this.state.hWalls.push(row);
    this.state.vWalls.clear();
    for (const row of m.vWalls) this.state.vWalls.push(row);
    this.state.hBacks.clear();
    for (const row of m.hBacks ?? []) this.state.hBacks.push(row);
    this.state.vBacks.clear();
    for (const row of m.vBacks ?? []) this.state.vBacks.push(row);
    this.state.areas = JSON.stringify(m.areas);
    this.state.spawnX = m.spawn.x;
    this.state.spawnY = m.spawn.y;
    this.state.mapVersion += 1;
  }

  // Apply a new map: state, grids, and (debounced) storage in the API.
  commitMap(next: MapDef) {
    this.map = next;
    this.syncMapState();
    this.rebuildGrid();
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (p) p.area = this.areaOf(p)?.key ?? "";
    }
    if (config.offline) return;
    // the first edit of a converted map saves the whole conversion with it
    if (this.migrated) this.saveMigration();
    if (this.layoutTimer) clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => void this.saveLayout(), 1200);
  }

  private saveLayout() {
    this.layoutTimer = null;
    return api
      .putLayout(layoutFromMap(this.map))
      .then(() => this.toBuilders("build:saved", { ok: true, at: Date.now() }))
      .catch((e) => {
        console.warn("[layout] save failed", e.message);
        const rejected = e instanceof ApiError && e.status >= 400 && e.status < 500;
        this.toBuilders("build:saved", { ok: false, at: Date.now(), rejected });
      });
  }

  toBuilders<K extends keyof ServerMessages>(type: K, msg: ServerMessages[K]) {
    for (const c of this.clients) if (this.state.players.get(c.sessionId)?.builder) this.send(c, type, msg);
  }

  // People standing somewhere that's no longer floor (or now inside a wall or
  // furniture) step to the nearest open spot, or go back to the arrival point.
  rescue() {
    const all = [...this.state.objects.values()].map(fromSchema);
    const grids = new Map<number, Grid>();
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (!p) continue;
      // their floor gone: the world's arrival point
      if (!levelMap(this.map, p.level)) {
        Object.assign(p, this.homeSpot(), { z: 0 });
        this.send(c, "snap", { x: p.x, y: p.y, z: 0, level: p.level });
        continue;
      }
      const lm = this.levelMap(p.level);
      let g = grids.get(p.level);
      if (!g) {
        g = Grid.from(lm, all);
        grids.set(p.level, g);
      }
      // (up on something that's still there, or on the stairs: they stay)
      // (outdoors on the land: they stay too)
      if (
        (isFloor(tileAt(lm, Math.floor(p.x), Math.floor(p.y))) || g.onRamp(p.x, p.y) || g.onLand(p.x, p.y)) &&
        g.fitsAt(p.x, p.y, p.z)
      )
        continue;
      const to = g.nearestOpen(p.x, p.y, 2) ?? (p.level === this.home ? this.map.spawn : lm.spawn);
      p.x = to.x;
      p.y = to.y;
      p.z = g.onLand(to.x, to.y) ? g.groundAt(to.x, to.y, 0) : 0;
      this.send(c, "snap", { x: p.x, y: p.y, z: p.z, level: p.level });
    }
  }

  rebuildGrid() {
    this.personalGrids.clear();
    this.grid = Grid.from(this.map, [...this.state.objects.values()].map(fromSchema));
  }

  private async putObject(client: WorldClient, m: ClientMessages["obj:put"]) {
    const p = this.state.players.get(client.sessionId);
    if (!p?.builder || !isKind(m.kind) || !CATALOG[m.kind as keyof typeof CATALOG]) return;
    const e = entry(m.kind);
    if (!e.buildable) return;
    const rot = ((m.rot | 0) + 4) % 4;
    const x = m.x | 0;
    const y = m.y | 0;
    const id = typeof m.id === "string" && m.id ? m.id.slice(0, 64) : `b-${m.kind}-${Date.now().toString(36)}`;
    const existing = this.state.objects.get(id);
    if (existing && existing.kind !== m.kind) return;
    const others = [...this.state.objects.values()].filter((o) => o.id !== id).map(fromSchema);
    if (this.heldByOther(id, p.uid)) {
      this.send(client, "toast", { text: `${this.holderName(id)} is moving that.`, tone: "warn" });
      return;
    }
    // which floor (props.level; none: the home floor), one that's there
    const props0 = m.props ?? safeJson(existing?.props ?? "{}");
    const level = Number.isInteger(props0.level) ? (props0.level as number) : this.home;
    if (!levelMap(this.map, level)) return;
    const lm = this.levelMap(level);
    const sameFloor = onLevel(others, lm);
    let def: WorldObjectDef = {
      id,
      kind: m.kind,
      x,
      y,
      rot,
      refId: m.refId ?? existing?.refId ?? null,
      props: cleanProps(m.kind, props0, sameFloor, x, y, rot),
    };
    def = atLevel(def, level, this.map);
    // an elevator's stop joins the shaft of the stops at the same spot on the
    // other floors (or starts one of its own)
    if (def.kind === "elevator" && !def.props?.shaft) {
      const here = across(this.map, level, this.home, def);
      const same = [...this.state.objects.values()].map(fromSchema).find((o) => {
        if (o.kind !== "elevator" || o.id === def.id) return false;
        const at = across(this.map, objLevel(o, this.map), this.home, o);
        return at.x === here.x && at.y === here.y;
      });
      def.props = { ...(def.props ?? {}), shaft: String(same?.props?.shaft ?? def.id), door: "closed" };
    }
    if (isOpening(def.kind)) {
      // doors and windows sit in a wall, on edges (rot even: from the north
      // edge of x, y; odd: from the west edge); never into someone's locked room
      def.rot = rot % 2;
      const why =
        this.lockBreak(p, null, existing ? [fromSchema(existing), def] : [def], level) ??
        openingBlocker(lm, sameFloor, def, hungOnEdge(sameFloor));
      if (why) {
        this.send(client, "toast", { text: `Can't put it there: ${why}.`, tone: "warn" });
        return;
      }
      // a door keeps its state (a new one, or a copy, starts open: nobody locks by placing)
      const start = doorStartState(def.kind);
      if (start)
        def.props = { ...(def.props ?? {}), state: existing ? (safeJson(existing.props).state ?? start) : start };
      else if (def.props) delete def.props.state;
    }
    // what it plays stays the server's (a stale copy from the builder's hand, or a copy's)
    def.props = keepPlaying(def.props, existing ? safeJson(existing.props) : null);
    if (!this.placementOk(def, others)) {
      this.send(client, "toast", { text: "That doesn't fit there.", tone: "warn" });
      return;
    }
    const before = existing ? fromSchema(existing) : null;
    const saved = config.offline ? def : (await api.putObject(def)).object;
    this.state.objects.set(id, toSchema(saved));
    if (before) await this.carryTabletops(before, saved);
    this.state.holds.delete(id);
    this.rebuildGrid();
  }

  // Mugs and papers on a desk go where the desk goes.
  async carryTabletops(before: WorldObjectDef, after: WorldObjectDef, skip: Set<string> = new Set()) {
    const all = [...this.state.objects.values()].map(fromSchema);
    for (const t of carried(before, after, all)) {
      if (skip.has(t.id)) continue;
      this.state.objects.set(t.id, toSchema(t));
      if (!config.offline) await api.putObject(t).catch(() => {});
    }
  }

  // ── holding (build mode): one builder's hand at a time ──
  heldByOther(id: string, uid: number): boolean {
    const h = this.state.holds.get(id);
    return !!h && Number(h.split("|")[0]) !== uid;
  }
  holderName(id: string): string {
    return this.state.holds.get(id)?.split("|").slice(1).join("|") || "Someone";
  }

  private async removeObject(client: WorldClient, id: string) {
    const p = this.state.players.get(client.sessionId);
    const o = this.state.objects.get(id);
    if (!p?.builder || !o || !entry(o.kind).buildable) return;
    if (this.heldByOther(id, p.uid)) {
      this.send(client, "toast", { text: `${this.holderName(id)} is moving that.`, tone: "warn" });
      return;
    }
    const locked = this.lockBreak(p, null, [fromSchema(o)]);
    if (locked) {
      this.send(client, "toast", { text: `${locked}.`, tone: "warn" });
      return;
    }
    // what sits on it goes with it
    const riders = surfaceRiders(fromSchema(o), [...this.state.objects.values()].map(fromSchema));
    for (const rid of [id, ...riders]) {
      if (!config.offline) await api.deleteObject(rid);
      this.state.objects.delete(rid);
      this.state.holds.delete(rid);
    }
    this.rebuildGrid();
  }

  // Why `p` can't make this change (null: they can): it would open a way into
  // someone else's locked room — its walls, its doors and windows, the room
  // itself. Only its owner holds that key (admins too: an owner's lock is
  // theirs). `next`: the map after; `objs`: things moved, added or taken
  // away (where they were and where they'd go).
  lockBreak(p: { uid: number }, next: MapDef | null, objs: WorldObjectDef[] = [], level = this.home): string | null {
    const lm = this.levelMap(level);
    const all = onLevel([...this.state.objects.values()].map(fromSchema), lm);
    for (const { area, ownerId } of lockedRooms(lm, all)) {
      if (ownerId === p.uid) continue;
      const why = `${area.ownerName ?? "Its owner"} locked ${area.name}`;
      const ring = ringOf(area);
      if (next) {
        const a = next.areas.find((x) => x.key === area.key);
        if (!a || a.ownerId !== area.ownerId || a.x !== area.x || a.y !== area.y || a.w !== area.w || a.h !== area.h)
          return why;
        if (ring.some((e) => edgeAt(lm, e) !== edgeAt(next, e))) return why;
      }
      const keys = new Set(ring.map(edgeKey));
      for (const o of objs) if (isOpening(o.kind) && openingEdges(o).some((e) => keys.has(edgeKey(e)))) return why;
    }
    return null;
  }

  placementOk(o: WorldObjectDef, others: WorldObjectDef[]): boolean {
    const level = objLevel(o, this.map);
    const bodies = [...this.state.players.values()].filter((q) => q.level === level);
    return canPlace(this.levelMap(level), others, o, bodies);
  }

  // Swap a room's furniture for a template (builders). Persisted object by object.
  private async applyTemplate(client: WorldClient, key: string) {
    const p = this.state.players.get(client.sessionId);
    const t = TEMPLATES.find((x) => x.key === key);
    if (!p?.builder || !t) return;
    const inArea = (o: { x: number; y: number }) => areaAt(this.map, o.x + 0.5, o.y + 0.5)?.key === t.area;
    const remove = [...this.state.objects.values()].filter((o) => replacedByTemplate(o.kind) && inArea(o));
    const keep = [...this.state.objects.values()].filter((o) => !remove.includes(o)).map(fromSchema);
    const bodies = [...this.state.players.values()].filter((q) => areaAt(this.map, q.x, q.y)?.key === t.area);
    if (bodies.some((b) => !this.grid.fits(b.x, b.y))) return;
    const add: WorldObjectDef[] = [];
    for (const o of t.objects) {
      if (!canPlace(this.map, [...keep, ...add], o, bodies)) {
        this.send(client, "toast", {
          text: "Someone's standing where the new furniture goes. Try again in a sec.",
          tone: "warn",
        });
        return;
      }
      add.push(o);
    }
    for (const o of remove) {
      this.state.objects.delete(o.id);
      if (!config.offline) await api.deleteObject(o.id).catch(() => {});
    }
    for (const o of add) {
      const saved = config.offline ? o : (await api.putObject(o).catch(() => ({ object: o }))).object;
      this.state.objects.set(saved.id, toSchema(saved));
    }
    this.rebuildGrid();
    this.broadcastMsg("toast", { text: `${p.name} switched the room to "${t.name}".` });
  }

  // A live phone event from the API (a text, a read, typing…) for whoever of
  // that person's sessions is here; nobody here: dropped (they fetch on open).
  relay(uid: number, event: Record<string, unknown>): boolean {
    let sent = false;
    for (const c of this.clients) {
      if (c.auth?.userId !== uid) continue;
      this.send(c, "phone:live", { event });
      sent = true;
    }
    return sent;
  }

  facing(from: { x: number; y: number }, to: { x: number; y: number }) {
    return dirFromDelta(to.x - from.x, to.y - from.y);
  }
}

export function toSchema(o: WorldObjectDef): WorldObject {
  const w = new WorldObject();
  w.id = o.id;
  w.kind = o.kind;
  w.x = o.x;
  w.y = o.y;
  w.rot = o.rot ?? 0;
  w.refId = o.refId ?? 0;
  w.props = JSON.stringify(o.props ?? {});
  return w;
}

// Tabletops sitting on a thing with a surface.
export function surfaceRiders(host: WorldObjectDef, all: WorldObjectDef[]): string[] {
  return carried(host, host, all).map((t) => t.id);
}

// Props from a client, made safe: a valid look (variant), decor that is what it
// says, things on a surface in a real cell at their surface's height, and
// furniture placed now is bare (never split again); the rest passes as before.
export function cleanProps(
  kind: string,
  props: Record<string, unknown>,
  others: WorldObjectDef[],
  x: number,
  y: number,
  rot = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props };
  const n = entry(kind).variants ?? 1;
  if (
    out.variant !== undefined &&
    !(Number.isInteger(out.variant) && (out.variant as number) >= 0 && (out.variant as number) < n)
  )
    delete out.variant;
  if (kind === "decor" || kind === "tabletop" || kind === "frame") {
    const allowed = DECOR[kind] as readonly string[];
    if (!allowed.includes(String(out.d))) out.d = allowed[0];
    const seed = Number(out.seed);
    out.seed = Number.isFinite(seed) && seed >= 0 && seed < 1 ? seed : 0.5;
  }
  // a fabric / paint colour: a hex, on things that take one
  if (
    out.color !== undefined &&
    !(entry(kind).paint && typeof out.color === "string" && /^#[0-9a-f]{6}$/i.test(out.color))
  )
    delete out.color;
  if (entry(kind).onSurface) {
    const def: WorldObjectDef = { id: "", kind, x, y, rot, props: out };
    out.c = topCell(def);
    out.z = entry(hostOf(others, def)?.kind ?? "").surface ?? 0;
  }
  if ((SPLIT_KINDS as readonly string[]).includes(kind)) out.split = 1;
  // on a wall: where along it (a quarter-tile shift, 0..3) and how high (steps
  // that keep it on the wall); without wu it's an older save's spot
  if (entry(kind).wall) {
    if (out.wu !== undefined) out.wu = Number.isInteger(out.wu) ? Math.max(0, Math.min(3, out.wu as number)) : 0;
    if (out.wz !== undefined) {
      if (Number.isInteger(out.wz)) out.wz = clampLift(kind, out.wz as number);
      else delete out.wz;
    }
  }
  return out;
}

// Store many objects, a few at a time (a failed one is logged, not fatal).
async function saveAll(list: WorldObjectDef[], put: (o: WorldObjectDef) => Promise<unknown>) {
  for (let i = 0; i < list.length; i += 8)
    await Promise.all(list.slice(i, i + 8).map((o) => put(o).catch((e) => console.warn("[bare]", o.id, e.message))));
}

export function fromSchema(o: WorldObject): WorldObjectDef {
  return { id: o.id, kind: o.kind, x: o.x, y: o.y, rot: o.rot, refId: o.refId || null, props: safeJson(o.props) };
}

export function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// Seat rotation → which way you face when sitting: away from the seat's back.
// A seat is drawn with its back on −y and turned like everything else (90°
// clockwise steps, `Sketch.rp`): rot 0 faces +y (screen down-left = SW),
// 1 faces −x (NW), 2 faces −y (NE), 3 faces +x (SE) — the same turn as wall
// items (rot 3 = on the west wall, facing east).
export function seatFacing(rot: number): number {
  return [1, 3, 5, 7][rot % 4];
}

// Messages only arrive after onJoin has filled userData.
export function data(client: WorldClient): ClientData {
  if (!client.userData) throw new Error("client not joined");
  return client.userData;
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

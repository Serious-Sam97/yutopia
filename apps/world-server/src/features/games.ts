import { footprint, hearingGain, type WorldObjectDef } from "@yutopia/shared";
import {
  CABLE_REACH,
  CONSOLES,
  GAME_ID,
  gap,
  isConsole,
  MAX_LIVE_TVS,
  PAD_REACH,
  SYSTEMS,
  TV_INPUTS,
} from "@yutopia/shared/games";
import { builtinGame } from "@yutopia/shared/library";
import { AccessToken } from "livekit-server-sdk";
import { config } from "../config.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { GameConsole } from "../schema.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// The game room (docs/plan/09-game-room.md). Consoles are plugged into a TV by
// a cable (props.tv, a few tiles long at most), a cartridge sits in them
// (props.cart …). Turning one on makes you its host: the game runs in your
// browser and your TV goes out to everyone (a LiveKit participant of its own,
// with a token minted here: picture for the whole space, sound for whoever's in
// earshot of the TV). Others take pad 2; their buttons come through here to
// the host. If the host goes, the game pauses until someone at it carries on.
const WALK_AWAY = PAD_REACH + 1.5;
const PADS_PER_SECOND = 90;

registerFeature((room: SpaceRoom) => {
  const consoles = room.state.consoles;
  const obj = (id: string) => {
    const o = room.state.objects.get(id);
    return o ? fromSchema(o) : undefined;
  };
  const rect = (o: WorldObjectDef) => {
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    return { x: o.x, y: o.y, w, h };
  };
  // how far someone is from a thing's footprint
  const away = (sid: string, o: WorldObjectDef) => {
    const p = room.state.players.get(sid);
    if (!p) return Number.POSITIVE_INFINITY;
    return gap({ x: p.x, y: p.y, w: 0, h: 0 }, rect(o));
  };
  const warn = (c: SpaceClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const save = async (o: WorldObjectDef) => {
    const saved = config.offline ? o : (await yondra.putObject(room.spaceId, o).catch(() => ({ object: o }))).object;
    room.state.objects.set(saved.id, toSchema(saved));
  };
  const nameOf = (sid: string) => room.state.players.get(sid)?.name ?? "";
  const clientOf = (sid: string) => room.clients.find((c) => c.sessionId === sid);
  const consoleAt = (c: SpaceClient, id: unknown) => {
    const o = obj(String(id ?? ""));
    if (!o || !isConsole(o.kind)) return null;
    if (away(c.sessionId, o) > PAD_REACH) {
      warn(c, "Get closer to the console.");
      return null;
    }
    return o;
  };
  const tvOf = (o: WorldObjectDef) => {
    const tv = typeof o.props?.tv === "string" ? obj(o.props.tv) : undefined;
    return tv?.kind === "crt_tv" ? tv : undefined;
  };
  const off = (id: string) => {
    consoles.delete(id);
    lastAudience.delete(id);
  };

  // ── plugging in ───────────────────────────────────────────────────────────
  room.on("game:plug", async (client, m) => {
    const o = consoleAt(client, m?.id);
    if (!o) return;
    if (m.tv === null) {
      const { tv: _, ...rest } = o.props ?? {};
      off(o.id);
      return save({ ...o, props: rest });
    }
    const tv = obj(String(m.tv ?? ""));
    if (!tv || tv.kind !== "crt_tv") return;
    if (gap(rect(o), rect(tv)) > CABLE_REACH) return warn(client, "The cable doesn't reach that TV.");
    const plugged = [...room.state.objects.values()].filter(
      (x) => x.id !== o.id && isConsole(x.kind) && fromSchema(x).props?.tv === tv.id,
    );
    if (plugged.length >= TV_INPUTS) return warn(client, "That TV has no free input.");
    await save({ ...o, props: { ...(o.props ?? {}), tv: tv.id } });
    if (!tv.props?.input || !obj(String(tv.props.input)))
      await save({ ...tv, props: { ...(tv.props ?? {}), input: o.id } });
  });

  // a TV shows one of the consoles plugged into it
  room.on("game:input", async (client, m) => {
    const tv = obj(String(m?.tv ?? ""));
    const o = obj(String(m?.console ?? ""));
    if (!tv || tv.kind !== "crt_tv" || !o || o.props?.tv !== tv.id) return;
    if (away(client.sessionId, tv) > PAD_REACH) return;
    await save({ ...tv, props: { ...(tv.props ?? {}), input: o.id } });
  });

  // ── cartridges ────────────────────────────────────────────────────────────
  room.on("game:cart", async (client, m) => {
    const o = consoleAt(client, m?.id);
    if (!o) return;
    if (consoles.has(o.id)) return warn(client, "Turn it off first.");
    const { cart: _a, cartColor: _b, cartTitle: _c, ...rest } = o.props ?? {};
    if (m.game === null) return save({ ...o, props: rest });
    const id = String(m.game ?? "");
    if (!GAME_ID.test(id)) return;
    let game: { system: string; title: string; color: string } | undefined = builtinGame(id);
    if (!game && id.startsWith("u:") && !config.offline)
      game = (await yondra.game(room.spaceId, Number(id.slice(2))).catch(() => null))?.game;
    if (!game) return warn(client, "That cartridge isn't on the shelf.");
    if (game.system !== CONSOLES[o.kind]) return warn(client, "That cartridge doesn't fit this console.");
    await save({ ...o, props: { ...rest, cart: id, cartColor: game.color, cartTitle: game.title.slice(0, 60) } });
  });

  // ── power ─────────────────────────────────────────────────────────────────
  room.on("game:power", async (client, m) => {
    const o = consoleAt(client, m?.id);
    if (!o) return;
    if (!m.on) return off(o.id);
    if (consoles.has(o.id)) return;
    const tv = tvOf(o);
    if (!tv || gap(rect(o), rect(tv)) > CABLE_REACH) return warn(client, "Plug it into a TV first.");
    if (typeof o.props?.cart !== "string") return warn(client, "Put a cartridge in first.");
    if ([...consoles.values()].filter((c) => c.host).length >= MAX_LIVE_TVS)
      return warn(client, "Too many TVs are on in this space right now.");
    const c = new GameConsole();
    c.game = o.props.cart;
    c.title = String(o.props.cartTitle ?? "");
    c.system = CONSOLES[o.kind];
    c.host = client.sessionId;
    c.hostName = nameOf(client.sessionId);
    c.p1 = client.sessionId;
    c.p1Name = c.hostName;
    c.since = Date.now();
    if (m.resume) c.resumes = 1; // where it was left (the host loads the last save state)
    consoles.set(o.id, c);
    // the TV switches to it
    if (tv.props?.input !== o.id) await save({ ...tv, props: { ...(tv.props ?? {}), input: o.id } });
  });

  // pads: take one (1, 2) or put it down (0)
  room.on("game:port", (client, m) => {
    const o = consoleAt(client, m?.id);
    const c = o && consoles.get(o.id);
    if (!o || !c) return;
    const sid = client.sessionId;
    const port = Number(m.port);
    if (port === 0) {
      if (c.p1 === sid && c.host !== sid) c.p1 = c.p1Name = "";
      if (c.p2 === sid) c.p2 = c.p2Name = "";
      return;
    }
    if (port !== 1 && port !== 2) return;
    if (port > SYSTEMS[c.system as keyof typeof SYSTEMS].ports) return warn(client, "This console has one pad.");
    const taken = port === 1 ? c.p1 : c.p2;
    if (taken && taken !== sid) return warn(client, `${nameOf(taken)} has that pad.`);
    if (c.p1 === sid || c.p2 === sid) return; // one pad each
    if (port === 1) {
      c.p1 = sid;
      c.p1Name = nameOf(sid);
    } else {
      c.p2 = sid;
      c.p2Name = nameOf(sid);
    }
  });

  // another player's buttons, for the host's emulator
  const budget = new Map<string, { n: number; at: number }>();
  room.on("game:pad", (client, m) => {
    const c = consoles.get(String(m?.id ?? ""));
    const sid = client.sessionId;
    if (!c?.host || c.host === sid) return;
    const port = c.p1 === sid ? 1 : c.p2 === sid ? 2 : 0;
    const bits = Number(m.bits);
    if (!port || !Number.isInteger(bits) || bits < 0 || bits > 0xfff) return;
    const now = Date.now();
    const b = budget.get(sid) ?? { n: 0, at: now };
    if (now - b.at > 1000) {
      b.n = 0;
      b.at = now;
    }
    if (++b.n > PADS_PER_SECOND) return;
    budget.set(sid, b);
    const host = clientOf(c.host);
    if (host) room.send(host, "game:pad", { id: String(m.id), port, bits });
  });

  room.on("game:live", (client, m) => {
    const c = consoles.get(String(m?.id ?? ""));
    if (c && c.host === client.sessionId) c.live = !!m.live;
  });

  // a paused game (its host gone): someone at it carries on, from the last save
  room.on("game:continue", (client, m) => {
    const o = consoleAt(client, m?.id);
    const c = o && consoles.get(o.id);
    if (!o || !c || c.host) return;
    const sid = client.sessionId;
    c.host = sid;
    c.hostName = nameOf(sid);
    if (c.p2 === sid) c.p2 = c.p2Name = "";
    c.p1 = sid;
    c.p1Name = c.hostName;
    c.live = false;
    c.resumes = Math.min(255, c.resumes + 1);
  });

  // the TV's own LiveKit token (only for its host)
  room.on("game:tv", async (client, m) => {
    const id = String(m?.id ?? "");
    const c = consoles.get(id);
    if (!c || c.host !== client.sessionId) return;
    const identity = `tv-${id}`;
    let token = "";
    if (config.livekit.key && config.livekit.secret) {
      const at = new AccessToken(config.livekit.key, config.livekit.secret, { identity, name: "TV", ttl: "6h" });
      at.addGrant({
        room: room.livekitRoom,
        roomJoin: true,
        canPublish: true,
        canSubscribe: false,
        canPublishData: false,
      });
      token = await at.toJwt();
    }
    room.send(client, "game:tv", { id, token, identity });
  });

  // ── every tick: cables, who's still here, who sees and hears each TV ──────
  const lastAudience = new Map<string, string>();
  let acc = 0;
  return {
    tick(dt) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      for (const [id, c] of consoles) {
        const o = obj(id);
        const tv = o && tvOf(o);
        // the console or its TV removed, or moved out of the cable's reach
        if (!o || !tv || gap(rect(o), rect(tv)) > CABLE_REACH) {
          off(id);
          // (its TV gone or too far: the cable's out)
          if (o?.props?.tv) {
            const { tv: _, ...rest } = o.props;
            void save({ ...o, props: rest });
          }
          continue;
        }
        // players who walked away (or left) put their pad down; the host pauses it
        if (c.p1 && c.p1 !== c.host && (!room.state.players.has(c.p1) || away(c.p1, o) > WALK_AWAY))
          c.p1 = c.p1Name = "";
        if (c.p2 && c.p2 !== c.host && (!room.state.players.has(c.p2) || away(c.p2, o) > WALK_AWAY))
          c.p2 = c.p2Name = "";
        // (a host whose connection dropped is gone too: their emulator went with their tab)
        if (c.host && (!room.state.players.has(c.host) || !clientOf(c.host) || away(c.host, o) > WALK_AWAY)) {
          if (c.p1 === c.host) c.p1 = c.p1Name = "";
          c.host = "";
          c.hostName = "";
          c.live = false;
        }
        if (!c.host && !c.p1 && !c.p2) {
          // nobody at it any more: it goes off after a while (a paused game keeps its save)
          if (Date.now() - c.since > 60_000) off(id);
          continue;
        }
        if (!c.host) continue;
        c.since = Date.now();
        // the picture for everyone in the space, the sound for whoever's in earshot of the TV
        const { w, h } = footprint(tv.kind, tv.rot ?? 0);
        const speaker = { x: tv.x + w / 2, y: tv.y + h / 2, dnd: false };
        const video: string[] = [];
        const audio: string[] = [];
        for (const [sid, p] of room.state.players) {
          if (sid === c.host || p.bot) continue;
          video.push(String(p.uid));
          if (hearingGain(room.map, { x: p.x, y: p.y, dnd: p.status === "dnd" }, speaker, true) > 0)
            audio.push(String(p.uid));
        }
        const key = `${video.join(",")}|${audio.join(",")}`;
        if (lastAudience.get(id) === key) continue;
        lastAudience.set(id, key);
        const host = clientOf(c.host);
        if (host) room.send(host, "game:audience", { id, video, audio });
      }
    },
    leave(client) {
      budget.delete(client.sessionId);
    },
  };
});

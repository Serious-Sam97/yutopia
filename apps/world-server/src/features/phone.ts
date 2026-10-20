import type { ServerMessages } from "@yutopia/shared";
import {
  CALL_DROP_MS,
  CALL_MAX,
  type CallEnd,
  type CallInfo,
  isCase,
  isPhoneState,
  isRingtone,
  PHOTO_POSES,
  RING_MS,
} from "@yutopia/shared/phone";
import { AccessToken } from "livekit-server-sdk";
import { api } from "../api.ts";
import { config } from "../config.ts";
import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The phone (docs/plan/21-cellphone.md), the world's half of it: what a phone
// is doing in someone's hand (everyone sees it), its case and ringtone, a
// photo's flash — and calls. A call is its own LiveKit room ("call-<id>"), so it
// reaches anyone in the world, through booths and private rooms; this process
// rings people, keeps who's on the line and mints their tokens. Texts don't come
// through here: the API keeps them and pushes them through us (server.ts → phone:live).

// Everyone in Yutopia right now.
interface Line {
  room: WorldRoom;
  client: WorldClient;
}
const hub = new Map<number, Line>();

interface Member {
  uid: number;
  name: string;
  avatar: string;
  space: string;
  state: "ringing" | "in" | "left";
}
interface Call {
  id: string;
  from: number;
  video: boolean;
  members: Map<number, Member>;
  startedAt: number; // answered (server ms), 0 while ringing
  ringUntil: Map<number, number>; // who's ringing, until when
  ended: boolean;
}
const calls = new Map<string, Call>();
const callOf = new Map<number, string>(); // user id → the call they're on (or ringing for)
let nextId = 1;
// Lines that dropped (a closed tab, the network) — the room keeps the player a
// while in case they come back, but a call can't wait that long: off it after
// dropMs. And what they missed meanwhile, for when the line's up again.
const dropped = new Map<number, { room: WorldRoom; sid: string; until: number }>();
const missed = new Map<number, ServerMessages["call:update"]>();

function playerOf(uid: number): { line: Line; p: Player } | null {
  const line = hub.get(uid);
  const p = line ? line.room.state.players.get(line.client.sessionId) : undefined;
  return line && p ? { line, p } : null;
}

function info(c: Call): CallInfo {
  return {
    id: c.id,
    from: c.from,
    video: c.video,
    startedAt: c.startedAt,
    members: [...c.members.values()].map((m) => ({ ...m })),
  };
}

function tell<K extends keyof ServerMessages>(uid: number, type: K, msg: ServerMessages[K]) {
  const line = hub.get(uid);
  if (line) line.room.send(line.client, type, msg);
}

function update(c: Call, phase: "ringing" | "live" | "ended", end?: CallEnd) {
  const msg = { ...info(c), phase, ...(end ? { end } : {}) };
  for (const m of c.members.values()) if (m.state !== "left" || phase === "ended") tell(m.uid, "call:update", msg);
}

function setRinging(uid: number, on: boolean) {
  const x = playerOf(uid);
  if (x) x.p.ringing = on;
}
function setPose(uid: number, pose: string) {
  const x = playerOf(uid);
  if (x) x.p.phone = pose;
}

async function token(c: Call, uid: number): Promise<string> {
  if (!config.livekit.key || !config.livekit.secret) return "";
  const m = c.members.get(uid);
  const at = new AccessToken(config.livekit.key, config.livekit.secret, {
    identity: String(uid),
    name: m?.name ?? "",
    ttl: "4h",
  });
  at.addGrant({ room: `call-${c.id}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return at.toJwt();
}
async function join(c: Call, uid: number) {
  tell(uid, "call:join", { id: c.id, url: "", token: await token(c, uid), room: `call-${c.id}` });
}

function inCount(c: Call) {
  return [...c.members.values()].filter((m) => m.state === "in").length;
}
function ringingCount(c: Call) {
  return [...c.members.values()].filter((m) => m.state === "ringing").length;
}

// The call is over: everyone's phone goes back to the pocket, and the thread
// gets a line about it (the API: Recents and "Missed call").
function end(c: Call, why: CallEnd) {
  if (c.ended) return;
  c.ended = true;
  const secs = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
  for (const m of c.members.values()) {
    if (callOf.get(m.uid) === c.id) callOf.delete(m.uid);
    setRinging(m.uid, false);
    const x = playerOf(m.uid);
    if (x && (x.p.phone === "call" || x.p.phone === "video")) x.p.phone = "";
  }
  update(c, "ended", why);
  calls.delete(c.id);
  if (!config.offline)
    void api
      .phoneCall({
        from: c.from,
        to: [...c.members.keys()].filter((u) => u !== c.from),
        end: why,
        secs,
        video: c.video,
        answered: [...c.members.values()].filter((m) => m.state !== "ringing").map((m) => m.uid),
      })
      .catch((e) => console.warn("[phone] call log", (e as Error).message));
}

function leave(c: Call, uid: number, why: "left" | "declined" | "missed") {
  const m = c.members.get(uid);
  if (!m || m.state === "left") return;
  m.state = "left";
  c.ringUntil.delete(uid);
  if (callOf.get(uid) === c.id) callOf.delete(uid);
  setRinging(uid, false);
  const x = playerOf(uid);
  if (x && (x.p.phone === "call" || x.p.phone === "video")) x.p.phone = "";
  const live = inCount(c);
  const ringing = ringingCount(c);
  if (c.startedAt) return live >= 2 || (live === 1 && ringing > 0) ? update(c, "live") : end(c, "answered");
  // not answered yet: the caller gave up, or the last one to ring didn't pick up
  if (uid === c.from) return end(c, "cancelled");
  if (ringing > 0) return update(c, "ringing");
  end(c, why === "declined" ? "declined" : "missed");
}

// Off the call they're on, from a line that's gone (dropped, or an older tab):
// the others go on without them, and this person hears it's over when they're back.
function hangUpFor(uid: number) {
  const id = callOf.get(uid);
  const c = id ? calls.get(id) : undefined;
  if (!c) return;
  const ringing = c.members.get(uid)?.state === "ringing";
  leave(c, uid, ringing ? "missed" : "left");
  const end: CallEnd = ringing ? "missed" : c.startedAt ? "answered" : "cancelled";
  missed.set(uid, { ...info(c), phase: "ended", end });
}
function flush(uid: number) {
  const m = missed.get(uid);
  missed.delete(uid);
  if (m) tell(uid, "call:update", m);
}

function ring(c: Call, uid: number) {
  const x = playerOf(uid);
  if (!x) return;
  c.members.set(uid, {
    uid,
    name: x.p.name,
    avatar: x.p.avatar,
    space: x.line.room.whereIs(x.p), // where they are (the field keeps its old name)
    state: "ringing",
  });
  c.ringUntil.set(uid, Date.now() + RING_MS);
  callOf.set(uid, c.id);
  x.p.ringing = true;
  tell(uid, "call:ring", info(c));
}

registerFeature((room: WorldRoom) => {
  const me = (client: WorldClient) => room.state.players.get(client.sessionId);

  room.on("phone:state", (client, m) => {
    const p = me(client);
    const s = m?.state;
    if (!p || !isPhoneState(s) || s === "ring") return;
    const onCall = callOf.has(p.uid) && calls.get(callOf.get(p.uid) as string)?.members.get(p.uid)?.state === "in";
    // at the ear / held up only while on a call; in the pocket or looking at it any time
    if ((s === "call" || s === "video") && !onCall) return;
    p.phone = s;
    if (s !== "photo" && s !== "selfie") {
      p.phonePose = "";
      p.recording = false;
    }
  });
  room.on("phone:rec", (client, m) => {
    const p = me(client);
    if (p) p.recording = !!m?.on && (p.phone === "photo" || p.phone === "selfie");
  });
  room.on("phone:pose", (client, m) => {
    const p = me(client);
    if (p && (PHOTO_POSES as readonly unknown[]).includes(m?.pose)) p.phonePose = m.pose;
  });
  // the flashlight (the Grounds at night): on or off, seen by everyone
  room.on("phone:torch", (client, m) => {
    const p = me(client);
    if (p) p.torch = !!m?.on;
  });
  room.on("phone:prefs", (client, m) => {
    const p = me(client);
    if (!p) return;
    if (isCase(m?.case)) p.phoneCase = m.case;
    if (isRingtone(m?.ringtone)) p.tone = m.ringtone;
  });
  let lastShot = new Map<string, number>();
  room.on("phone:shot", (client) => {
    const p = me(client);
    const now = Date.now();
    if (!p || now - (lastShot.get(client.sessionId) ?? 0) < 700) return;
    lastShot.set(client.sessionId, now);
    p.shotAt = now;
  });

  room.on("call:start", (client, m) => {
    const p = me(client);
    if (!p || p.bot || callOf.has(p.uid)) return;
    const to = [...new Set((Array.isArray(m?.to) ? m.to : []).map(Number))]
      .filter((u) => Number.isInteger(u) && u > 0 && u !== p.uid)
      .slice(0, CALL_MAX - 1);
    if (!to.length) return;
    const c: Call = {
      id: `${Date.now().toString(36)}${(nextId++).toString(36)}`,
      from: p.uid,
      video: !!m?.video,
      members: new Map([
        [p.uid, { uid: p.uid, name: p.name, avatar: p.avatar, space: room.whereIs(p), state: "in" as const }],
      ]),
      startedAt: 0,
      ringUntil: new Map(),
      ended: false,
    };
    calls.set(c.id, c);
    callOf.set(p.uid, c.id);
    const reachable = to.filter((u) => hub.has(u) && !callOf.has(u));
    for (const u of reachable) ring(c, u);
    if (!reachable.length) {
      // a one-to-one call: say why it didn't ring
      const busy = to.some((u) => hub.has(u));
      for (const u of to) c.members.set(u, { uid: u, name: "", avatar: "", space: "", state: "left" });
      return end(c, busy ? "busy" : "unreachable");
    }
    update(c, "ringing");
  });

  room.on("call:answer", async (client, m) => {
    const p = me(client);
    const c = calls.get(String(m?.id ?? ""));
    const mem = p && c?.members.get(p.uid);
    if (!p || !c || !mem || mem.state !== "ringing") return;
    mem.state = "in";
    c.ringUntil.delete(p.uid);
    p.ringing = false;
    p.phone = c.video ? "video" : "call";
    const first = !c.startedAt;
    if (first) c.startedAt = Date.now();
    update(c, "live");
    await join(c, p.uid);
    // the caller (and anyone already on) get the line with the first answer
    if (first)
      for (const o of c.members.values())
        if (o.uid !== p.uid && o.state === "in") {
          setPose(o.uid, c.video ? "video" : "call");
          await join(c, o.uid);
        }
  });

  room.on("call:decline", (client, m) => {
    const p = me(client);
    const c = calls.get(String(m?.id ?? ""));
    if (p && c) leave(c, p.uid, "declined");
  });
  room.on("call:end", (client, m) => {
    const p = me(client);
    const c = calls.get(String(m?.id ?? ""));
    if (p && c) leave(c, p.uid, "left");
  });
  room.on("call:add", (client, m) => {
    const p = me(client);
    const c = calls.get(String(m?.id ?? ""));
    const uid = Number(m?.uid);
    if (!p || !c || c.members.get(p.uid)?.state !== "in" || !Number.isInteger(uid)) return;
    if (c.members.size >= CALL_MAX || c.members.get(uid)?.state === "in" || callOf.has(uid) || !hub.has(uid)) return;
    ring(c, uid);
    update(c, c.startedAt ? "live" : "ringing");
  });
  room.on("call:video", (client, m) => {
    const p = me(client);
    const c = calls.get(String(m?.id ?? ""));
    if (!p || !c || c.members.get(p.uid)?.state !== "in") return;
    p.phone = m?.on ? "video" : "call";
  });

  let at = 0;
  return {
    join(client, p) {
      if (p.bot) return;
      hub.set(p.uid, { room, client });
      dropped.delete(p.uid);
      // a new tab (or back after the room gave up on the old one): whatever call
      // the old one was on, this one isn't
      hangUpFor(p.uid);
      flush(p.uid);
    },
    // (by session: after a reconnect the room hands us a new client object)
    drop(client, p) {
      if (hub.get(p.uid)?.client.sessionId === client.sessionId)
        dropped.set(p.uid, { room, sid: client.sessionId, until: Date.now() + phoneHub.dropMs });
    },
    back(client, p) {
      if (hub.get(p.uid)?.client.sessionId !== client.sessionId) return;
      hub.set(p.uid, { room, client });
      dropped.delete(p.uid);
      flush(p.uid);
    },
    leave(client, p) {
      if (hub.get(p.uid)?.client.sessionId !== client.sessionId) return;
      hub.delete(p.uid);
      dropped.delete(p.uid);
      missed.delete(p.uid);
      const id = callOf.get(p.uid);
      const c = id ? calls.get(id) : undefined;
      if (c) leave(c, p.uid, c.members.get(p.uid)?.state === "ringing" ? "missed" : "left");
    },
    // unanswered rings run out, dropped lines come off their calls (checked twice a second)
    tick(_dt, now) {
      if (now - at < 500) return;
      at = now;
      for (const [uid, d] of dropped) if (d.room === room && now > d.until && callOf.has(uid)) hangUpFor(uid);
      for (const c of calls.values())
        for (const [uid, until] of c.ringUntil) if (now > until && hub.get(uid)?.room === room) leave(c, uid, "missed");
      if (lastShot.size > 200) lastShot = new Map();
    },
  };
});

// for tests
export const phoneHub = { hub, calls, callOf, dropMs: CALL_DROP_MS };

import { HELD, isHeld } from "@yutopia/shared";
import { FREEZE_MINUTES, isPower, NOTICE_MAX, POWERS, type PowerName } from "@yutopia/shared/admin";
import { setCanPublish } from "../livekit.ts";
import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Run the place (docs/plan/48-the-admin.md): an admin's powers on themselves — fly, through
// walls, fast, hidden, unhurt — and on someone else — brought here, sent home, held still,
// healed, handed something — and a notice to everyone. Admins only: every message from anyone
// else is dropped. The moves the powers allow are WorldRoom's (pos, teleport, mayEnter); the
// cars' (spawn, clear, out of the car) are features/cars.ts's; any door, features/mapedit.ts's.

const UNHURT_EVERY = 5000; // ms: an unhurt admin's health, breath and battery topped up

registerFeature((room: WorldRoom) => {
  const admin = (client: WorldClient): Player | null => {
    const p = room.state.players.get(client.sessionId);
    return p?.admin ? p : null;
  };
  const byUid = (uid: unknown) => [...room.state.players.values()].find((q) => q.uid === Number(uid) && !q.bot);
  const clientOf = (p: Player) => room.clients.getById(p.sid) as WorldClient | undefined;
  // when each power went on (uid:power → ms): the log says for how long
  const since = new Map<string, number>();
  const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;

  const setPower = (p: Player, power: PowerName, on: boolean) => {
    const bit = POWERS[power];
    if (!!(p.powers & bit) === on) return;
    p.powers = on ? p.powers | bit : p.powers & ~bit;
    const key = `${p.uid}:${power}`;
    if (on) since.set(key, Date.now());
    else {
      room.adminLog(p, "power", null, `${power}, ${minutes(Date.now() - (since.get(key) ?? Date.now()))}`);
      since.delete(key);
    }
    // hidden: not heard either (back on as they were, unless an admin muted them)
    if (power === "hidden") {
      if (on) p.mic = false;
      void setCanPublish(room.livekitRoom, String(p.uid), !on && !p.muted);
    }
  };

  room.on("mod:power", (client, m) => {
    const p = admin(client);
    if (!p || !isPower(m?.power)) return;
    setPower(p, m.power, !!m.on);
  });

  room.on("mod:heal", (client, m) => {
    const p = admin(client);
    const target = m?.userId === undefined ? p : byUid(m.userId);
    if (!p || !target) return;
    room.survival?.heal(target.sid);
    if (target !== p) room.adminLog(p, "heal", target);
  });

  // beside me: a free spot they could stand on, on my floor
  room.on("mod:bring", (client, m) => {
    const p = admin(client);
    const target = byUid(m?.userId);
    const c = target && clientOf(target);
    if (!p || !target || !c || target === p) return;
    if (/^(drive|ride):/.test(target.busy)) {
      room.send(client, "toast", { text: `${target.name} is in a car: take them out of it first.`, tone: "warn" });
      return;
    }
    const g = room.gridFor(target.uid, p.level);
    const near = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]
      .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
      .find((s) => g.fits(s.x, s.y));
    const at = near ?? g.nearestOpen(p.x + 1, p.y + 1) ?? { x: p.x, y: p.y };
    room.moveTo(c, target, { ...at, level: p.level });
    room.send(c, "toast", { text: `${p.name} brought you here.` });
    room.adminLog(p, "bring", target);
  });

  room.on("mod:home", (client, m) => {
    const p = admin(client);
    const target = byUid(m?.userId);
    const c = target && clientOf(target);
    if (!p || !target || !c || /^(drive|ride):/.test(target.busy)) return;
    room.moveTo(c, target, room.homeSpot());
    room.send(c, "toast", { text: "An admin sent you to the arrival point." });
    room.adminLog(p, "home", target);
  });

  room.on("mod:freeze", (client, m) => {
    const p = admin(client);
    const target = byUid(m?.userId);
    if (!p || !target || target === p) return;
    const mins = Number(m?.minutes);
    if (mins !== 0 && !(FREEZE_MINUTES as readonly number[]).includes(mins)) return;
    target.frozenUntil = mins ? Date.now() + mins * 60_000 : 0;
    const c = clientOf(target);
    if (c)
      room.send(c, "toast", {
        text: mins ? `An admin is holding you still for ${mins} min.` : "You can move again.",
        tone: mins ? "warn" : "info",
      });
    room.adminLog(p, "freeze", target, mins ? `for ${mins} min` : "let go");
  });

  room.on("mod:notice", (client, m) => {
    const p = admin(client);
    const text = String(m?.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, NOTICE_MAX);
    if (!p || !text) return;
    room.broadcastMsg("toast", { text, tone: m?.tone === "warn" ? "warn" : "info" });
    room.adminLog(p, "notice", null, text);
  });

  // in a hand (shared held.ts) or the pockets (survival's): mine, or someone's
  room.on("mod:give", (client, m) => {
    const p = admin(client);
    const target = m?.userId === undefined ? p : byUid(m.userId);
    const item = String(m?.item ?? "");
    if (!p || !target) return;
    let ok = false;
    if (isHeld(item)) {
      if (/^(drive|ride):/.test(target.busy)) return;
      target.held = item;
      target.heldAt = Date.now();
      ok = true;
    } else ok = !!room.survival?.give(target.sid, item, Number(m?.n ?? 1), !!m?.drop);
    if (!ok) {
      room.send(client, "toast", { text: "That didn't go: no room for it, or not out there yet.", tone: "warn" });
      return;
    }
    const what = isHeld(item) ? HELD[item].label.toLowerCase() : item;
    const n = Number(m?.n ?? 1);
    if (target !== p) room.adminLog(p, "give", target, `${n > 1 ? `${n} ` : ""}${what}`);
    else if (m?.drop) room.adminLog(p, "spawn", null, `${n > 1 ? `${n} ` : ""}${what}, dropped`);
  });

  let healAt = 0;
  return {
    tick(_dt, now) {
      if (now - healAt < UNHURT_EVERY) return;
      healAt = now;
      for (const p of room.state.players.values())
        if (p.admin && p.powers & POWERS.unhurt && (p.hp < 100 || p.st < 100 || p.downAt)) room.survival?.heal(p.sid);
    },
    leave(_client, p) {
      // (their powers go with them: the log says how long each was on)
      for (const k of Object.keys(POWERS) as PowerName[]) if (p.powers & POWERS[k]) setPower(p, k, false);
    },
  };
});

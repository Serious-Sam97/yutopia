import type { ClientMessages } from "@yutopia/shared";
import {
  COMPUTER_LEAVE,
  COMPUTER_REACH,
  cleanLabel,
  computerAway,
  DEFAULT_ERA,
  isComputer,
  isEra,
  isPhase,
  nextPhaseOk,
  SHUTDOWN_MS,
} from "@yutopia/shared/computer";
import { config } from "../config.ts";
import { fromSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { Computer } from "../schema.ts";
import { api } from "../api.ts";
import { registerFeature } from "./index.ts";

// The studio's computers (docs/plan/19-vortexos.md, shared/computer.ts). One
// person at a time: sitting down boots it, the OS runs in their panel and
// tells us what it shows (the phase, the era, the app in front), everyone
// draws that on the glass. Standing up, walking off, leaving or the computer
// being taken away shuts it down; it goes dark a moment later. Nothing is
// stored: a restart finds every computer off.
const PHASES_PER_SECOND = 4;
// Vortex wrote VortexOS (the lore): a boot near him gets a public remark, now and then
const VORTEX_HEARS = 7;
const VORTEX_EVERY_MS = 90_000;
registerFeature((room: WorldRoom) => {
  const computers = room.state.computers;
  const obj = (id: unknown) => {
    const o = room.state.objects.get(String(id ?? ""));
    return o && isComputer(o.kind) ? fromSchema(o) : undefined;
  };
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const clientOf = (sid: string) => room.clients.find((c) => c.sessionId === sid);
  const offAt = new Map<string, number>(); // shut down: dark at
  const budget = new Map<string, { n: number; at: number }>();
  let vortexSaidAt = 0;

  // Vortex near a computer that boots: one of his VortexOS lines, for everyone near
  const vortexHears = (o: { x: number; y: number }) => {
    const npc = room.state.npcs.get("vortex");
    const now = Date.now();
    if (!npc || config.offline || now - vortexSaidAt < VORTEX_EVERY_MS) return;
    if (Math.hypot(npc.x - o.x, npc.y - o.y) > VORTEX_HEARS) return;
    vortexSaidAt = now;
    void api
      .vortexLine({ event: "vortexos", user_id: null })
      .then((res) => {
        if (!res?.line) return;
        npc.mood = res.mood ?? "smug";
        npc.say = res.line;
        npc.sayAt = Date.now();
      })
      .catch(() => {});
  };
  const shutDown = (id: string) => {
    const c = computers.get(id);
    if (!c || c.phase === "shutdown") return;
    c.phase = "shutdown";
    c.since = Date.now();
    offAt.set(id, c.since + SHUTDOWN_MS);
    const user = clientOf(c.sid);
    if (user) room.send(user, "computer:off", { id });
  };
  const off = (id: string) => {
    computers.delete(id);
    offAt.delete(id);
  };
  // the one I'm at (one at a time)
  const mine = (sid: string) => {
    for (const [id, c] of computers) if (c.sid === sid && c.phase !== "shutdown") return id;
    return null;
  };

  room.on("computer:use", (client, m: ClientMessages["computer:use"]) => {
    const p = room.state.players.get(client.sessionId);
    const o = obj(m?.id);
    if (!p || !o) return;
    if (computerAway(o, p) > COMPUTER_REACH) return warn(client, "Get closer to the computer.");
    const c = computers.get(o.id);
    if (c && c.sid !== client.sessionId && c.phase !== "shutdown")
      return warn(client, `${c.name} is using this computer.`);
    if (c?.sid === client.sessionId && c.phase !== "shutdown") return room.send(client, "computer:ok", { id: o.id });
    // at another one already: that one goes off
    const other = mine(client.sessionId);
    if (other) shutDown(other);
    offAt.delete(o.id);
    computers.set(
      o.id,
      new Computer().assign({
        sid: client.sessionId,
        uid: p.uid,
        name: p.name,
        phase: "boot",
        era: DEFAULT_ERA,
        app: "",
        user: "",
        since: Date.now(),
      }),
    );
    room.send(client, "computer:ok", { id: o.id });
    vortexHears(o);
  });

  room.on("computer:phase", (client, m: ClientMessages["computer:phase"]) => {
    const c = computers.get(String(m?.id ?? ""));
    if (!c || c.sid !== client.sessionId || c.phase === "shutdown") return;
    const now = Date.now();
    const b = budget.get(client.sessionId) ?? { n: 0, at: now };
    if (now - b.at > 1000) {
      b.n = 0;
      b.at = now;
    }
    if (++b.n > PHASES_PER_SECOND) return;
    budget.set(client.sessionId, b);
    if (m.phase === "shutdown") return shutDown(String(m.id));
    if (!isPhase(m.phase) || !nextPhaseOk(c.phase as never, m.phase)) return;
    if (m.phase !== c.phase) {
      c.phase = m.phase;
      c.since = now;
    }
    if (isEra(m.era)) c.era = m.era;
    if (m.app !== undefined) c.app = cleanLabel(m.app);
    if (m.user !== undefined) c.user = cleanLabel(m.user, 24);
  });

  room.on("computer:leave", (client, m: ClientMessages["computer:leave"]) => {
    const id = String(m?.id ?? "");
    if (computers.get(id)?.sid === client.sessionId) shutDown(id);
  });

  let acc = 0;
  return {
    tick(dt) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      const now = Date.now();
      for (const [id, c] of computers) {
        if (c.phase === "shutdown") {
          if (now >= (offAt.get(id) ?? 0)) off(id);
          continue;
        }
        const o = obj(id);
        if (!o) {
          off(id); // taken away in build mode: nothing left to shut down
          continue;
        }
        // its user left, lost their connection, or walked off
        const p = room.state.players.get(c.sid);
        if (!p || !clientOf(c.sid) || computerAway(o, p) > COMPUTER_LEAVE) shutDown(id);
      }
    },
    leave(client) {
      budget.delete(client.sessionId);
      const id = mine(client.sessionId);
      if (id) shutDown(id);
    },
  };
});

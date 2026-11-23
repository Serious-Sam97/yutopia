import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { MV_AIM, packMv, yawToByte } from "@yutopia/shared/move";
import { type NpcDef, parseNpc } from "@yutopia/shared/npc";
import { townCast } from "@yutopia/shared/npc/town";
import { Client, type Room } from "colyseus.js";

// NPCs on the map (docs/plan/121-npcs-on-the-map.md) in an offline room: a town NPC placed is let go by their own
// feature and played here, back to their own once taken off the map; a made one dressed from the cast, wandering in
// their circle, answering X aloud; one out of their hours walks home and in at the door; Vortex never placed.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 31800 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
let lay: (e: GroundsEdits) => unknown;
let sign: (ts: string, method: string, path: string, raw: string) => string;
const rooms: Room[] = [];
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  lay = (await import("./land.ts")).landEdits;
  sign = (await import("./api.ts")).signInternal;
  server = await startWorldServer(PORT);
});
after(async () => {
  lay({ rev: 0 });
  for (const r of rooms) await r.leave(true).catch(() => {});
  await server.gracefullyShutdown(false);
});
async function waitFor(fn: () => boolean, ms = 10_000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(25);
  }
}
async function join(uid: number, s: number) {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: s,
    token: `dev:${uid}:P${uid}:member,builder,admin`,
  });
  rooms.push(r);
  r.onMessage("snap", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.npcs?.size > 0);
  return r;
}
async function sendCast(npcs: NpcDef[]) {
  const raw = JSON.stringify({ npcs });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`http://localhost:${PORT}/internal/cast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Yutopia-Timestamp": ts,
      "X-Yutopia-Signature": sign(ts, "POST", "/internal/cast", raw),
    },
    body: raw,
  });
  assert.equal(res.status, 200);
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const npc = (r: Room, id: string): any => r.state.npcs.get(id);

test("placed NPCs: the town's let go and played here, a made one wanders and answers, one goes home, Vortex never", async () => {
  const r = await join(91, 911);
  await waitFor(() => !!npc(r, "folk-maya"));
  // the cast: the town's, and Dora, made on the cast page — she answers, wanders; Ned has a shift that's over now
  const hour = Number(r.state.hour);
  const dora = parseNpc({
    key: "npc-dora",
    name: "Dora",
    lines: [{ when: "answer", en: "Fresh bread!", pt: "Pão fresquinho!" }],
    behaviour: { type: "wander", answer: true, talk: "never" },
  }) as NpcDef;
  const ned = parseNpc({
    key: "npc-ned",
    name: "Ned",
    behaviour: { type: "stand", hours: "shift", from: (Math.floor(hour) + 3) % 24, to: (Math.floor(hour) + 4) % 24 },
  }) as NpcDef;
  await sendCast([...townCast(), dora, ned]);

  // placed: Maya (a town visitor) stood by the houses, Dora wandering a 4 m circle, Ned going home to house-w0;
  // Vortex too — never placed
  lay({
    rev: 901,
    npcs: {
      add: [
        { key: "folk-maya", x: 418, z: -436, a: 0, level: 0 },
        { key: "npc-dora", x: 420, z: -452, a: 0, level: 0, r: 4 },
        { key: "npc-ned", x: 417, z: -444, a: Math.PI, level: 0, home: "house-w0" },
        { key: "vortex", x: 419, z: -440, a: 0, level: 0 },
      ],
    },
  });
  await waitFor(() => !!npc(r, "place:folk-maya") && !npc(r, "folk-maya"));
  assert.equal(npc(r, "place:folk-maya").name, "Maya");
  assert.equal(npc(r, "place:folk-maya").kind, "folk");
  assert.ok(Math.hypot(npc(r, "place:folk-maya").x - 418, npc(r, "place:folk-maya").y + 436) < 1);
  assert.equal(npc(r, "place:vortex"), undefined);
  assert.ok(npc(r, "vortex"), "Vortex still his own");
  assert.equal(npc(r, "place:npc-dora").name, "Dora");
  // (she answers: the client offers "Talk"; Maya doesn't)
  assert.equal(npc(r, "place:npc-dora").talk, true);
  assert.equal(npc(r, "place:folk-maya").talk, false);

  // Dora wanders, within her circle
  const d0 = { x: npc(r, "place:npc-dora").x, y: npc(r, "place:npc-dora").y };
  await waitFor(() => Math.hypot(npc(r, "place:npc-dora").x - d0.x, npc(r, "place:npc-dora").y - d0.y) > 0.5, 30_000);
  assert.ok(Math.hypot(npc(r, "place:npc-dora").x - 420, npc(r, "place:npc-dora").y + 452) <= 4.6);

  // Ned's shift is over: he walks to house-w0's door (x 412) and in — its ground storey, a floor of its own
  const ned0 = npc(r, "place:npc-ned");
  await waitFor(() => ned0.level !== 0, 30_000);
  assert.ok(ned0.level >= 32, `in house-w0's storey (${ned0.level})`);
  assert.ok(ned0.x < 412, "inside, past the door");

  // talked to: Dora answers aloud
  // (she keeps wandering: followed, asked again)
  const dn = npc(r, "place:npc-dora");
  for (let i = 0; i < 20 && !String(dn.say).startsWith("Fresh bread!"); i++) {
    r.send("teleport", { to: { x: dn.x + 1.2, y: dn.y, level: 0 } });
    await sleep(400);
    r.send("npc:talk", { id: "place:npc-dora" });
    await sleep(400);
  }
  assert.ok(String(dn.say).startsWith("Fresh bread!"), `she answered (${dn.say})`);
  // (aloud, both languages on the wire: the client says the one it's in)
  assert.equal(dn.say, "Fresh bread!\u001fPão fresquinho!");

  // taken off the map: Maya back to her own (the Kart Park's walk), the others gone
  lay({ rev: 902 });
  await waitFor(() => !npc(r, "place:folk-maya") && !!npc(r, "folk-maya") && !npc(r, "place:npc-dora"));
  assert.equal(npc(r, "place:npc-ned"), undefined);
});

test("placed NPCs and a shot: one ducks, one runs away from the shooter", async () => {
  const r = await join(92, 912);
  const duck = parseNpc({ key: "npc-duck", name: "Duck", behaviour: { type: "stand", shots: "duck" } }) as NpcDef;
  const run = parseNpc({ key: "npc-run", name: "Run", behaviour: { type: "stand", shots: "flee" } }) as NpcDef;
  await sendCast([...townCast(), duck, run]);
  lay({
    rev: 903,
    npcs: {
      add: [
        { key: "npc-duck", x: 420, z: -500, a: 0, level: 0 },
        { key: "npc-run", x: 424, z: -500, a: 0, level: 0 },
      ],
    },
  });
  await waitFor(() => !!npc(r, "place:npc-duck") && !!npc(r, "place:npc-run"));
  // armed (the kit), stood 8 m off, firing away from them
  const seen = { inv: false };
  r.onMessage("dark:pockets", () => {
    seen.inv = true;
  });
  r.onMessage("*", () => {});
  r.send("dark:hello", {});
  await waitFor(() => seen.inv);
  r.send("mod:refill", { kit: true });
  await sleep(300);
  r.send("arms:draw", { slot: 0 });
  r.send("teleport", { to: { x: 422, y: -508, level: 0 } });
  await waitFor(
    () => Math.hypot(r.state.players.get(r.sessionId).x - 422, r.state.players.get(r.sessionId).y + 508) < 0.6,
  );
  await sleep(600);
  const m = r.state.players.get(r.sessionId);
  const yaw = Math.PI / 2 + Math.PI; // (south: away from them, north of here)
  r.send("pos", { x: m.x, y: m.y, z: m.z, a: 0, seq: 0, mv: packMv("still") | MV_AIM, yaw: yawToByte(yaw), pitch: 0 });
  await sleep(300);
  const run0 = { x: npc(r, "place:npc-run").x, y: npc(r, "place:npc-run").y };
  r.send("arms:fire", {
    ox: m.x,
    oy: m.y,
    oz: heightAt(m.x, m.y) + 1.35,
    yaw: -Math.PI / 2,
    pitch: 0,
    lag: 0,
    seed: 7,
  });
  await waitFor(() => npc(r, "place:npc-duck").mood === "duck", 5000);
  await waitFor(() => npc(r, "place:npc-run").mood === "run", 5000);
  // (away from the shooter: further from them than they stood)
  await waitFor(() => {
    const n = npc(r, "place:npc-run");
    return Math.hypot(n.x - m.x, n.y - m.y) > Math.hypot(run0.x - m.x, run0.y - m.y) + 2;
  }, 10_000);
  // the duck's over in a few seconds
  await waitFor(() => npc(r, "place:npc-duck").mood === "", 8000);
  lay({ rev: 904 });
});

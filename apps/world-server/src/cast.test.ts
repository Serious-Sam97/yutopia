import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOM_NAME } from "@yutopia/shared";
import { biOf, type NpcDef, packLook } from "@yutopia/shared/npc";
import { townCast } from "@yutopia/shared/npc/town";
import { Client, type Room } from "colyseus.js";

// The world's cast in the room (docs/plan/120-god-mode-npcs.md): the town's people made from it, as the code had them;
// an admin's change (the API's POST /internal/cast) taken live — a new look, a new name; someone deleted gone from the
// world, Vortex too (not shot, not poked); back when the cast has them again. Unsigned: refused.
process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";

const PORT = 31700 + Math.floor(Math.random() * 100);
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
let sign: (ts: string, method: string, path: string, raw: string) => string;
before(async () => {
  const { startWorldServer } = await import("./server.ts");
  sign = (await import("./api.ts")).signInternal;
  server = await startWorldServer(PORT);
});
after(async () => {
  for (const r of rooms) await r.leave(true).catch(() => {});
  await server.gracefullyShutdown(false);
});
async function waitFor(fn: () => boolean, ms = 8000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
async function join(uid: number, s: number) {
  const r = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    sandbox: s,
    token: `dev:${uid}:P${uid}:member`,
  });
  rooms.push(r);
  r.onMessage("snap", () => {});
  await waitFor(() => r.state.players?.size > 0 && r.state.npcs?.size > 0);
  return r;
}
async function sendCast(npcs: unknown, secret = true, at?: number) {
  const raw = JSON.stringify(at ? { npcs, at } : { npcs });
  const ts = String(Math.floor(Date.now() / 1000));
  return fetch(`http://localhost:${PORT}/internal/cast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Yutopia-Timestamp": ts,
      "X-Yutopia-Signature": secret ? sign(ts, "POST", "/internal/cast", raw) : "nope",
    },
    body: raw,
  });
}
// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
const npc = (r: Room, id: string): any => r.state.npcs.get(id);

test("the town's people come from the cast, as the code had them; a change is live; deleted, gone; back again", async () => {
  const r = await join(81, 901);
  const cast = townCast();
  // everyone the cast has, dressed as it says
  await waitFor(() => cast.every((d) => !!npc(r, d.key)));
  for (const d of cast) {
    const n = npc(r, d.key);
    assert.equal(n.name, d.name, d.key);
    assert.equal(n.role, biOf(d.role), d.key);
    // (Lia's look is 255 bytes: sent with a space after, else the wire drops it — cast.ts wire)
    assert.equal(n.look.trim(), packLook(d.look), d.key);
  }
  assert.equal(Buffer.byteLength(packLook(cast.find((d) => d.key === "folk-lia")?.look ?? null)), 255);
  assert.equal(npc(r, "guard").role, "Night guard\u001fVigia");
  assert.equal(npc(r, "vortex").look, "");

  // an admin's change: Rosa in a hoodie, renamed; Joe and Vortex deleted; the guard with a line of his own
  const changed: NpcDef[] = cast
    .filter((d) => d.key !== "folk-joe" && d.key !== "vortex")
    .map((d) =>
      d.key === "folk-rosa"
        ? { ...d, name: "Rosana", look: d.look && { ...d.look, top: "hoodie" } }
        : d.key === "guard"
          ? { ...d, lines: [{ when: "ambient", en: "Evening.", pt: "Boa noite." }] }
          : d,
    );
  assert.equal((await sendCast(changed, false)).status, 401);
  assert.equal(npc(r, "folk-rosa").name, "Rosa");
  const res = await sendCast(changed);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { npcs: number }).npcs, cast.length - 2);
  await waitFor(() => npc(r, "folk-rosa").name === "Rosana" && !npc(r, "folk-joe") && !npc(r, "vortex"));
  assert.match(npc(r, "folk-rosa").look, /"top":"hoodie"/);
  // (the others as they were)
  assert.equal(npc(r, "folk-lia").name, "Lia");
  assert.equal(npc(r, "strike-marta").name, "Marta");

  // all of them back
  assert.equal((await sendCast(cast)).status, 200);
  await waitFor(() => !!npc(r, "folk-joe") && !!npc(r, "vortex") && npc(r, "folk-rosa").name === "Rosa");
  assert.equal(npc(r, "folk-joe").name, "Joe");
  assert.equal(npc(r, "vortex").name, "VORTEX");

  // nobody: no town people at all (and nothing thrown — the room still ticks)
  assert.equal((await sendCast([])).status, 200);
  await waitFor(() => cast.every((d) => !npc(r, d.key)));
  assert.equal((await sendCast("nope")).status, 422);
  assert.equal((await sendCast(cast)).status, 200);
  await waitFor(() => cast.every((d) => !!npc(r, d.key)));
});

test("pushes that arrive the other way round: the older is let go", async () => {
  const r = await join(82, 902);
  const cast = townCast();
  await waitFor(() => !!npc(r, "folk-rosa"));
  const t = Date.now() + 60_000; // (later than any push before it in this file)
  const named = (name: string) => cast.map((d) => (d.key === "folk-rosa" ? { ...d, name } : d));
  assert.equal((await sendCast(named("Rosa B"), true, t + 2)).status, 200);
  await waitFor(() => npc(r, "folk-rosa").name === "Rosa B");
  // (read before it, sent after it: older)
  const res = await sendCast(named("Rosa A"), true, t + 1);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { older?: boolean }).older, true);
  await sleep(300);
  assert.equal(npc(r, "folk-rosa").name, "Rosa B");
  assert.equal((await sendCast(cast, true, t + 3)).status, 200);
  await waitFor(() => npc(r, "folk-rosa").name === "Rosa");
});

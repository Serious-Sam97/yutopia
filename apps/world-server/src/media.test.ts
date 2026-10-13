import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { canPlace, ROOM_NAME, studio } from "@yutopia/shared";
import type { MediaState } from "@yutopia/shared/media";
import { Client, type Room } from "colyseus.js";

// Media on TVs and the radio (features/media.ts, media/*): the timeline and the
// queue, locks, lengths from players, the radio's YouTube source, the media
// key, and the Jellyfin relay against a fake Jellyfin — one session per TV
// however many watch, and its key never in anything a browser gets.

process.env.YUTOPIA_OFFLINE = "1";
process.env.YUTOPIA_WORLD_SECRET = "test";
process.env.YUTOPIA_INTERNAL_SECRET = "test";
const KEY = "jf-secret-key-123";
const ITEM = "0123456789abcdef0123456789abcdef";
const PORT = 26780 + Math.floor(Math.random() * 100);
const JF_PORT = PORT + 200;
process.env.YUTOPIA_JELLYFIN_URL = `http://localhost:${JF_PORT}`;
process.env.YUTOPIA_JELLYFIN_KEY = KEY;

// ── a fake Jellyfin ──
const seen: string[] = []; // what it was asked (path + query)
let fake: Server;
function startFake() {
  fake = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    seen.push(req.method === "DELETE" ? `DELETE ${u.pathname}` : u.pathname + u.search);
    const auth = String(req.headers.authorization ?? "");
    const okKey = auth.includes(`Token="${KEY}"`) || u.searchParams.get("ApiKey") === KEY;
    if (!okKey) return res.writeHead(401).end();
    const json = (v: unknown) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(v));
    const q = `DeviceId=tv&PlaySessionId=ps1&ApiKey=${KEY}`;
    if (u.pathname === "/Users") return json([{ Id: "u1", Name: "admin", Policy: { IsAdministrator: true } }]);
    if (u.pathname === `/Users/u1/Items/${ITEM}`)
      return json({
        Id: ITEM,
        Name: "Pilot",
        Type: "Episode",
        SeriesName: "Show",
        ParentIndexNumber: 1,
        IndexNumber: 1,
        RunTimeTicks: 1200 * 1e7,
      });
    if (u.pathname === `/Items/${ITEM}/PlaybackInfo`)
      return json({ PlaySessionId: "ps1", MediaSources: [{ TranscodingUrl: `/videos/${ITEM}/master.m3u8?${q}` }] });
    if (u.pathname === `/videos/${ITEM}/master.m3u8`)
      return res
        .writeHead(200)
        .end(
          `#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="${ITEM}/Subtitles/0/subtitles.m3u8?SegmentLength=30&${q}"\n#EXT-X-STREAM-INF:BANDWIDTH=1,SUBTITLES="subs"\nmain.m3u8?${q}\n`,
        );
    if (u.pathname === `/videos/${ITEM}/main.m3u8`)
      return res
        .writeHead(200)
        .end(
          `#EXTM3U\n#EXT-X-TARGETDURATION:3\n${[0, 1, 2, 3].map((i) => `#EXTINF:3,\nhls1/main/${i}.ts?${q}&runtimeTicks=${i * 3e7}`).join("\n")}\n#EXT-X-ENDLIST\n`,
        );
    const seg = u.pathname.match(/hls1\/main\/(\d+)\.ts$/);
    if (seg) return res.writeHead(200, { "Content-Type": "video/mp2t" }).end(Buffer.alloc(1000, Number(seg[1])));
    if (u.pathname === "/Videos/ActiveEncodings") return res.writeHead(204).end();
    if (u.pathname.startsWith(`/Items/${ITEM}/Images/`))
      return res.writeHead(200, { "Content-Type": "image/jpeg" }).end("jpg");
    res.writeHead(404).end();
  });
  return new Promise<void>((r) => fake.listen(JF_PORT, r));
}

let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };
const rooms: Room[] = [];
before(async () => {
  await startFake();
  const { startWorldServer } = await import("./server.ts");
  server = await startWorldServer(PORT);
});
after(async () => {
  const bounded = <T>(p: Promise<T>) => Promise.race([p, sleep(1000)]);
  await Promise.all(rooms.map((r) => bounded(r.leave(true).catch(() => {}))));
  await bounded(server.gracefullyShutdown(false));
  fake.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
});

interface Person {
  room: Room;
  msgs: Record<string, unknown[]>;
}
async function person(id: number, spaceId: number, roles = "member"): Promise<Person> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
    spaceId,
    token: `dev:${id}:P${id}:${roles}`,
  });
  rooms.push(room);
  const p: Person = { room, msgs: {} };
  for (const t of ["toast", "media:key"])
    room.onMessage(t, (m) => {
      if (!p.msgs[t]) p.msgs[t] = [];
      p.msgs[t].push(m);
    });
  await waitFor(() => !!room.state?.players?.get(room.sessionId));
  return p;
}
async function waitFor(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error("timeout");
    await sleep(20);
  }
}
const mediaOf = (p: Person, id: string): MediaState | null => {
  const o = p.room.state.objects.get(id);
  return o ? (JSON.parse(o.props || "{}").media ?? null) : null;
};
// a TV on the floor somewhere free
async function placeTv(b: Person, id: string, kind = "tv_console", props?: Record<string, unknown>) {
  const objects = [...b.room.state.objects.values()].map(
    (o: { id: string; kind: string; x: number; y: number; rot: number; props: string }) => ({
      ...o,
      props: JSON.parse(o.props || "{}"),
    }),
  );
  for (let y = 4; y < studio.height - 2; y++)
    for (let x = 4; x < studio.width - 3; x++)
      if (canPlace(studio, objects, { id, kind, x, y, rot: 0 }, [])) {
        b.room.send("obj:put", { id, kind, x, y, rot: 0, props });
        await waitFor(() => !!b.room.state.objects.get(id));
        return;
      }
  throw new Error("no room for a TV");
}
const yt = (ref: string, dur = 0) => ({ src: "yt" as const, ref, title: ref, dur });

test("media: a TV's timeline — play, everyone sees it, pause / seek / queue / repeat, lock", async () => {
  const space = 501;
  const ana = await person(1, space, "member,builder");
  const bia = await person(2, space);
  await placeTv(ana, "tv-a");
  ana.room.send("media:play", { id: "tv-a", items: [yt("aaaaaaaaaaa", 2), yt("bbbbbbbbbbb", 100)], mode: "now" });
  await waitFor(() => mediaOf(bia, "tv-a")?.item?.ref === "aaaaaaaaaaa");
  let m = mediaOf(bia, "tv-a") as MediaState;
  assert.equal(m.by, "P1");
  assert.deepEqual(
    m.queue.map((x) => x.ref),
    ["bbbbbbbbbbb"],
  );
  assert.ok(Math.abs(Date.now() - m.at) < 1500, "starts now");
  // the 2 s video ends by itself: the next one starts where it ended, the
  // first goes to the back (repeat is on by default)
  await waitFor(() => mediaOf(bia, "tv-a")?.item?.ref === "bbbbbbbbbbb", 5000);
  m = mediaOf(bia, "tv-a") as MediaState;
  assert.deepEqual(
    m.queue.map((x) => x.ref),
    ["aaaaaaaaaaa"],
  );
  // Bia pauses, seeks, resumes — anyone may
  bia.room.send("media:ctl", { id: "tv-a", op: "pause" });
  await waitFor(() => mediaOf(ana, "tv-a")?.paused === true);
  bia.room.send("media:ctl", { id: "tv-a", op: "seek", pos: 42 });
  await waitFor(() => mediaOf(ana, "tv-a")?.pos === 42);
  bia.room.send("media:ctl", { id: "tv-a", op: "resume" });
  await waitFor(() => mediaOf(ana, "tv-a")?.paused === false);
  m = mediaOf(ana, "tv-a") as MediaState;
  assert.ok(Math.abs((Date.now() - m.at) / 1000 - 42) < 1.5, "resumes at 42 s");
  // queue: add at the end, move, remove
  bia.room.send("media:play", { id: "tv-a", items: [yt("ccccccccccc", 10)], mode: "end" });
  await waitFor(() => mediaOf(ana, "tv-a")?.queue.length === 2);
  bia.room.send("media:ctl", { id: "tv-a", op: "move", index: 1, to: 0 });
  await waitFor(() => mediaOf(ana, "tv-a")?.queue[0].ref === "ccccccccccc");
  bia.room.send("media:ctl", { id: "tv-a", op: "remove", index: 1 });
  await waitFor(() => mediaOf(ana, "tv-a")?.queue.length === 1);
  // only builders lock; then only builders change it
  bia.room.send("media:ctl", { id: "tv-a", op: "lock", on: true });
  await sleep(200);
  assert.equal(mediaOf(ana, "tv-a")?.lock, false);
  ana.room.send("media:ctl", { id: "tv-a", op: "lock", on: true });
  await waitFor(() => mediaOf(bia, "tv-a")?.lock === true);
  bia.room.send("media:ctl", { id: "tv-a", op: "skip" });
  await waitFor(() => (bia.msgs.toast ?? []).some((t) => String((t as { text: string }).text).includes("locked")));
  assert.equal(mediaOf(ana, "tv-a")?.item?.ref, "bbbbbbbbbbb");
  // stop clears it
  ana.room.send("media:ctl", { id: "tv-a", op: "stop" });
  await waitFor(() => !mediaOf(bia, "tv-a")?.item);
});

test("media: lengths from players, bad items refused", async () => {
  const space = 502;
  const ana = await person(1, space, "member,builder");
  await placeTv(ana, "tv-b", "tv_wall");
  ana.room.send("media:play", { id: "tv-b", items: [{ src: "yt", ref: "nope" }], mode: "now" });
  await waitFor(() => (ana.msgs.toast ?? []).length > 0);
  ana.room.send("media:play", { id: "tv-b", items: [yt("ddddddddddd")], mode: "now" });
  await waitFor(() => mediaOf(ana, "tv-b")?.item?.ref === "ddddddddddd");
  assert.equal(mediaOf(ana, "tv-b")?.item?.dur, 0);
  ana.room.send("media:dur", { id: "tv-b", ref: "ddddddddddd", dur: 212.34 });
  await waitFor(() => mediaOf(ana, "tv-b")?.item?.dur === 212.3);
  // a second report doesn't change it
  ana.room.send("media:dur", { id: "tv-b", ref: "ddddddddddd", dur: 5 });
  await sleep(200);
  assert.equal(mediaOf(ana, "tv-b")?.item?.dur, 212.3);
});

test("media: each radio its own YouTube queue, and back to lo-fi", async () => {
  const space = 503;
  const ana = await person(1, space);
  const bia = await person(2, space);
  const radio = (p: Person, id: string) => JSON.parse(p.room.state.objects.get(id).props || "{}").radio ?? {};
  ana.room.send("media:play", { id: "lounge-radio", items: [yt("eeeeeeeeeee", 200)], mode: "now" });
  await waitFor(() => radio(bia, "lounge-radio").source === "yt" && radio(bia, "lounge-radio").playing === true);
  assert.equal(radio(bia, "lounge-radio").media.item.ref, "eeeeeeeeeee");
  // the record player next to it: its own (another video), the radio's untouched
  bia.room.send("media:play", { id: "lounge-turntable", items: [yt("fffffffffff", 100)], mode: "now" });
  await waitFor(() => radio(ana, "lounge-turntable").media?.item?.ref === "fffffffffff");
  assert.equal(radio(ana, "lounge-radio").media.item.ref, "eeeeeeeeeee");
  assert.equal(radio(ana, "lounge-radio").media.queue.length, 0);
  // Jellyfin isn't for radios
  ana.room.send("media:play", {
    id: "lounge-radio",
    items: [{ src: "jf", ref: ITEM, title: "x", dur: 0 }],
    mode: "end",
  });
  await sleep(300);
  assert.equal(radio(bia, "lounge-radio").media.queue.length, 0);
  // a lo-fi station takes over the radio (its YouTube goes); the record player plays on
  bia.room.send("radio:set", { id: "lounge-radio", playing: true, station: 1 });
  await waitFor(() => radio(ana, "lounge-radio").source === "lofi" && radio(ana, "lounge-radio").station === 1);
  assert.equal(radio(ana, "lounge-radio").media, null, "YouTube's queue goes when lo-fi takes over");
  assert.equal(radio(ana, "lounge-turntable").media.item.ref, "fffffffffff");
  ana.room.send("media:ctl", { id: "lounge-turntable", op: "stop" });
  await waitFor(() => radio(ana, "lounge-turntable").playing === false);
  assert.equal(radio(ana, "lounge-radio").playing, true);
});

test("media: every TV its own; a copy starts with nothing on, a move keeps what plays", async () => {
  const space = 505;
  const ana = await person(1, space, "member,builder");
  await placeTv(ana, "tv-one");
  await placeTv(ana, "tv-two", "tv_wall");
  ana.room.send("media:play", { id: "tv-one", items: [yt("aaaaaaaaaaa", 100)], mode: "now" });
  ana.room.send("media:play", { id: "tv-two", items: [yt("bbbbbbbbbbb", 100)], mode: "now" });
  await waitFor(
    () => mediaOf(ana, "tv-one")?.item?.ref === "aaaaaaaaaaa" && mediaOf(ana, "tv-two")?.item?.ref === "bbbbbbbbbbb",
  );
  ana.room.send("media:ctl", { id: "tv-one", op: "pause" });
  await waitFor(() => mediaOf(ana, "tv-one")?.paused === true);
  assert.equal(mediaOf(ana, "tv-two")?.paused, false, "the other TV plays on");
  // a copy of tv-one (with its props, as the build hand sends them): nothing on
  const one = ana.room.state.objects.get("tv-one");
  const props = JSON.parse(one.props);
  await placeTv(ana, "tv-copy", "tv_console", props);
  assert.equal(mediaOf(ana, "tv-copy"), null);
  // moving tv-one with a stale copy of its props keeps what plays now
  ana.room.send("media:ctl", { id: "tv-one", op: "skip" });
  await waitFor(
    () =>
      !mediaOf(ana, "tv-one")?.item ||
      mediaOf(ana, "tv-one")?.item?.ref !== "aaaaaaaaaaa" ||
      mediaOf(ana, "tv-one")?.paused === false,
  );
  const live = JSON.stringify(mediaOf(ana, "tv-one"));
  ana.room.send("obj:put", { id: "tv-one", kind: one.kind, x: one.x, y: one.y, rot: 0, props });
  await sleep(400);
  assert.equal(JSON.stringify(mediaOf(ana, "tv-one")), live);
});

test("media: the media key, and Jellyfin through the relay — one session for everyone, no key out", async () => {
  const space = 504;
  const ana = await person(1, space, "member,builder");
  const bia = await person(2, space);
  await waitFor(() => (ana.msgs["media:key"] ?? []).length > 0);
  const { key, jf } = ana.msgs["media:key"][0] as { key: string; jf: boolean };
  const { key: biaKey } = bia.msgs["media:key"][0] as { key: string };
  assert.equal(jf, true);
  const base = `http://localhost:${PORT}/media/jf`;
  // browsing and a bad key
  assert.equal((await fetch(`${base}/api/nope/browse`)).status, 401);
  const lib = await fetch(`${base}/img/${key}/${ITEM}?w=200`);
  assert.equal(lib.status, 200);
  // nothing on the TV: no stream
  await placeTv(ana, "tv-j");
  assert.equal((await fetch(`${base}/s/${key}/tv-j/${ITEM}/master.m3u8`)).status, 410);
  // an episode on it: title and length come from Jellyfin
  ana.room.send("media:play", { id: "tv-j", items: [{ src: "jf", ref: ITEM, title: "?", dur: 0 }], mode: "now" });
  await waitFor(() => mediaOf(bia, "tv-j")?.item?.src === "jf");
  const it = mediaOf(bia, "tv-j")?.item;
  assert.equal(it?.title, "Pilot");
  assert.equal(it?.sub, "Show · S1E1");
  assert.equal(it?.dur, 1200);
  // two people watch: the same playlists and segments, Jellyfin asked once
  const get = async (k: string, rest: string) => {
    const r = await fetch(`${base}/s/${k}/tv-j/${ITEM}/${rest}`);
    assert.equal(r.status, 200, rest);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    return Buffer.from(await r.arrayBuffer());
  };
  const before = seen.length;
  const masters = await Promise.all([get(key, "master.m3u8"), get(biaKey, "master.m3u8")]);
  for (const m of masters) assert.ok(!m.toString().includes(KEY), "no key in the master playlist");
  // the subtitles' URI keeps its closing quote once the key is out
  assert.match(masters[0].toString(), /URI="[^"]*subtitles\.m3u8\?SegmentLength=30&DeviceId=tv&PlaySessionId=ps1"/);
  const variant = masters[0]
    .toString()
    .split("\n")
    .find((l) => l && !l.startsWith("#")) as string;
  assert.ok(!variant.includes("ApiKey"));
  const pls = await Promise.all([get(key, variant), get(biaKey, variant)]);
  const segs = pls[0]
    .toString()
    .split("\n")
    .filter((l) => l && !l.startsWith("#"));
  assert.equal(segs.length, 4);
  for (const s of segs) assert.ok(!s.includes(KEY) && !s.includes("ApiKey"), "no key in segment lines");
  const [s0a, s0b] = await Promise.all([get(key, segs[0]), get(biaKey, segs[0])]);
  assert.equal(s0a.length, 1000);
  assert.equal(s0a[0], 0);
  assert.deepEqual(s0a, s0b);
  await sleep(300); // the next two were fetched ahead
  const asked = seen.slice(before);
  assert.equal(asked.filter((p) => p.includes("/PlaybackInfo")).length, 1, "one Jellyfin session");
  assert.equal(asked.filter((p) => p.includes("/hls1/main/0.ts")).length, 1, "segment 0 fetched once");
  assert.ok(
    asked.some((p) => p.includes("/hls1/main/1.ts")) && asked.some((p) => p.includes("/hls1/main/2.ts")),
    "read ahead",
  );
  const s1 = await get(biaKey, segs[1]);
  assert.equal(s1[0], 1);
  assert.equal(seen.filter((p) => p.includes("/hls1/main/1.ts")).length, 1, "served from the cache");
  // the TV goes off: the session is closed and the stream is gone
  ana.room.send("media:ctl", { id: "tv-j", op: "stop" });
  await waitFor(() => seen.some((p) => p === "DELETE /Videos/ActiveEncodings"));
  assert.equal((await fetch(`${base}/s/${key}/tv-j/${ITEM}/master.m3u8`)).status, 410);
});

test("media: playlists played anywhere go on the space's quick list; again to the top; forget", async () => {
  const space = 506;
  const ana = await person(1, space, "member,builder");
  const bia = await person(2, space);
  const lists = (p: Person) =>
    JSON.parse(p.room.state.playlists || "[]") as { list: string; uses: number; items: unknown[]; by: string }[];
  ana.room.send("media:play", {
    id: "lounge-radio",
    items: [yt("aaaaaaaaaaa", 10), yt("bbbbbbbbbbb", 20)],
    mode: "now",
    list: "PLradio00001",
  });
  await waitFor(() => lists(bia).length === 1);
  assert.equal(lists(bia)[0].list, "PLradio00001");
  assert.equal(lists(bia)[0].items.length, 2);
  assert.equal(lists(bia)[0].by, "P1");
  // on a TV, another one; then the first again: to the top, counted
  await placeTv(ana, "tv-pl");
  bia.room.send("media:play", { id: "tv-pl", items: [yt("ccccccccccc", 10)], mode: "now", list: "PLtv00000002" });
  await waitFor(() => lists(ana)[0]?.list === "PLtv00000002");
  bia.room.send("media:play", {
    id: "lounge-turntable",
    items: [yt("aaaaaaaaaaa", 10)],
    mode: "end",
    list: "PLradio00001",
  });
  await waitFor(() => lists(ana)[0]?.list === "PLradio00001" && lists(ana)[0]?.uses === 2);
  // a bad playlist id isn't kept; a plain video isn't a playlist
  ana.room.send("media:play", { id: "tv-pl", items: [yt("ddddddddddd", 10)], mode: "end", list: "x" });
  ana.room.send("media:play", { id: "tv-pl", items: [yt("eeeeeeeeeee", 10)], mode: "end" });
  await sleep(300);
  assert.equal(lists(ana).length, 2);
  bia.room.send("playlist:forget", { list: "PLtv00000002" });
  await waitFor(() => lists(ana).length === 1);
});

test("media: playlists — rename, pin, my star", async () => {
  const space = 507;
  const ana = await person(1, space);
  const bia = await person(2, space);
  const lists = (p: Person) =>
    JSON.parse(p.room.state.playlists || "[]") as {
      list: string;
      title: string;
      pinned?: boolean;
      stars?: number[];
      byUid?: number;
    }[];
  ana.room.send("media:play", {
    id: "lounge-radio",
    items: [yt("aaaaaaaaaaa", 10)],
    mode: "now",
    list: "PLedit000001",
  });
  await waitFor(() => lists(bia).length === 1);
  assert.equal(lists(bia)[0].byUid, 1);
  bia.room.send("playlist:edit", { list: "PLedit000001", title: "Friday mix", pinned: true, star: true });
  await waitFor(() => lists(ana)[0]?.title === "Friday mix");
  assert.equal(lists(ana)[0].pinned, true);
  assert.deepEqual(lists(ana)[0].stars, [2], "Bia's star, not Ana's");
  bia.room.send("playlist:edit", { list: "PLedit000001", star: false, pinned: false });
  await waitFor(() => !lists(ana)[0]?.pinned);
  assert.equal(lists(ana)[0].stars, undefined);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, entry } from "./catalog.ts";
import {
  advance,
  cleanItem,
  cleanState,
  DISPLAY_KINDS,
  emptyMedia,
  GLASS,
  glassCorners,
  type MediaItem,
  parseYouTube,
  pause,
  positionAt,
  resume,
  seek,
  showsBoards,
  showsMedia,
  skip,
  startItem,
} from "./media.ts";

const yt = (ref: string, dur: number): MediaItem => ({ src: "yt", ref, title: ref, dur });

test("media: YouTube links → video / playlist", () => {
  assert.deepEqual(parseYouTube("https://www.youtube.com/watch?v=M7lc1UVf-VE"), { video: "M7lc1UVf-VE" });
  assert.deepEqual(parseYouTube("youtu.be/M7lc1UVf-VE?t=10"), { video: "M7lc1UVf-VE" });
  assert.deepEqual(parseYouTube("https://music.youtube.com/watch?v=M7lc1UVf-VE&list=PLabcdefghij"), {
    video: "M7lc1UVf-VE",
    list: "PLabcdefghij",
  });
  assert.deepEqual(parseYouTube("https://youtube.com/shorts/M7lc1UVf-VE"), { video: "M7lc1UVf-VE" });
  assert.deepEqual(parseYouTube("https://www.youtube.com/playlist?list=PLabcdefghij"), { list: "PLabcdefghij" });
  assert.deepEqual(parseYouTube("M7lc1UVf-VE"), { video: "M7lc1UVf-VE" });
  assert.equal(parseYouTube("https://vimeo.com/123"), null);
  assert.equal(parseYouTube("https://youtube.com/watch?v=short"), null);
  assert.equal(parseYouTube("not a link at all"), null);
});

test("media: items and stored states are checked", () => {
  assert.equal(cleanItem({ src: "yt", ref: "bad", title: "x" }), null);
  assert.equal(cleanItem({ src: "xx", ref: "M7lc1UVf-VE" }), null);
  assert.deepEqual(cleanItem({ src: "jf", ref: "a".repeat(32), title: "  Ep  ", dur: -3 }), {
    src: "jf",
    ref: "a".repeat(32),
    title: "Ep",
    dur: 0,
  });
  // what Yondra hands back (nulls for empty strings) comes back into shape
  const s = cleanState({ item: null, by: null, queue: [yt("M7lc1UVf-VE", 10), { src: "yt" }], lock: null });
  assert.equal(s.queue.length, 1);
  assert.equal(s.by, "");
  assert.equal(s.loop, true);
  assert.equal(s.lock, false);
});

test("media: the timeline — position, pause, resume, seek", () => {
  let m = startItem(emptyMedia(), yt("M7lc1UVf-VE", 100), 1000, "Ana");
  assert.equal(positionAt(m, 11_000), 10);
  assert.equal(positionAt(m, 500_000), 100, "clamped to its length");
  m = pause(m, 21_000);
  assert.equal(positionAt(m, 99_000), 20);
  m = resume(m, 50_000);
  assert.equal(positionAt(m, 55_000), 25);
  m = seek(m, 80, 60_000);
  assert.equal(positionAt(m, 61_000), 81);
  assert.equal(positionAt(seek(m, 999, 60_000), 60_000), 100);
});

test("media: the queue moves on by itself, repeat keeps it going", () => {
  const a = yt("aaaaaaaaaaa", 10);
  const b = yt("bbbbbbbbbbb", 20);
  let m = { ...startItem(emptyMedia(), a, 0, "Ana"), queue: [b] };
  assert.equal(advance(m, 5_000), m, "nothing finished: the same object");
  // a finished at 10 s, b runs 10 → 30 s; nobody watched: it's still exact
  m = advance(m, 25_000);
  assert.equal(m.item?.ref, b.ref);
  assert.equal(m.at, 10_000);
  assert.deepEqual(
    m.queue.map((x) => x.ref),
    [a.ref],
  );
  // a day later, on repeat: still on the 30 s cycle
  // a day later, on repeat: still exact — the round (b 20 s, a 10 s) starts at
  // 10 s, and 86 403 s is 23 s into one: a, 3 s in
  const later = advance(m, 86_403_000);
  assert.equal(later.item?.ref, a.ref);
  assert.equal(positionAt(later, 86_403_000), 3);
  // without repeat it stops at the end
  const once = advance({ ...m, loop: false, queue: [] }, 40_000);
  assert.equal(once.item, null);
  // an item of unknown length starts now instead of in the past
  const u = advance({ ...startItem(emptyMedia(), a, 0, "A"), queue: [yt("ccccccccccc", 0)], loop: false }, 99_000);
  assert.equal(u.item?.ref, "ccccccccccc");
  assert.equal(u.at, 98_000);
  // skip
  const s = skip({ ...startItem(emptyMedia(), a, 0, "A"), queue: [b] }, 3_000, "Bia");
  assert.equal(s.item?.ref, b.ref);
  assert.equal(s.at, 3_000);
  assert.equal(s.by, "Bia");
});

test("media: every display kind is in the catalog, glass inside its footprint", () => {
  for (const k of DISPLAY_KINDS) {
    assert.ok(Object.hasOwn(CATALOG, k), k);
    const g = GLASS[k];
    const e = entry(k);
    const w = g.top ? 1 : e.w;
    assert.ok(g.x0 >= 0 && g.x1 <= w && g.x1 > g.x0, `${k}: x within the item`);
    assert.ok(g.z1 > g.z0, `${k}: z`);
    assert.equal(!!g.wall, !!e.wall, `${k}: wall`);
    const c = glassCorners({ id: "x", kind: k, x: 5, y: 5, rot: 0, props: { z: 25 } });
    assert.ok(c);
  }
  // the CRT shows media only on its TV input; the big screen unless set to a board / stage
  assert.equal(showsMedia({ id: "t", kind: "crt_tv", x: 0, y: 0 }), false);
  assert.equal(showsMedia({ id: "t", kind: "crt_tv", x: 0, y: 0, props: { input: "media" } }), true);
  assert.equal(showsMedia({ id: "s", kind: "screen_wall", x: 0, y: 0, props: { source: "board" } }), false);
  assert.equal(showsMedia({ id: "w", kind: "tv_wall", x: 0, y: 0 }), true);
  // what can show a Yondra board (and take a pick of which)
  assert.equal(showsBoards({ id: "b", kind: "board_wall", x: 0, y: 0 }), true);
  assert.equal(showsBoards({ id: "s", kind: "screen_wall", x: 0, y: 0, props: { source: "board" } }), true);
  assert.equal(showsBoards({ id: "s", kind: "screen_wall", x: 0, y: 0, props: { source: "stage" } }), false);
  assert.equal(showsBoards({ id: "s", kind: "screen_wall", x: 0, y: 0 }), false);
  assert.equal(showsBoards({ id: "p", kind: "projector_screen", x: 0, y: 0 }), false);
});

test("media: the space's playlists — remembered with their name, used again to the top, capped", async () => {
  const { cleanPlaylists, rememberPlaylist, MAX_PLAYLISTS } = await import("./media.ts");
  const a = [yt("aaaaaaaaaaa", 10), yt("bbbbbbbbbbb", 20)];
  let all = rememberPlaylist(
    [],
    { list: "PLfirst00001", title: "Lo-fi beats", channel: "Chill", items: a, by: "Ana" },
    1000,
  );
  all = rememberPlaylist(all, { list: "PLsecond0002", title: "Rock", items: a, by: "Bia" }, 2000);
  assert.deepEqual(
    all.map((p) => p.list),
    ["PLsecond0002", "PLfirst00001"],
  );
  // played again (by someone else, under another name): to the top, counted, its first name kept
  all = rememberPlaylist(all, { list: "PLfirst00001", title: "?", items: [yt("ccccccccccc", 5)], by: "Bia" }, 3000);
  assert.equal(all[0].list, "PLfirst00001");
  assert.equal(all[0].title, "Lo-fi beats");
  assert.equal(all[0].by, "Ana");
  assert.equal(all[0].uses, 2);
  assert.equal(all[0].items[0].ref, "ccccccccccc", "the videos as played now");
  // what Yondra hands back comes back into shape; junk out; capped
  const many = Array.from({ length: 40 }, (_, i) => ({
    list: `PLmany${String(i).padStart(6, "0")}`,
    title: `p${i}`,
    items: a,
    usedAt: i,
  }));
  const clean = cleanPlaylists([...many, { list: "bad" }, { list: "PLnovideos01", items: [] }, null]);
  assert.equal(clean.length, MAX_PLAYLISTS);
  assert.equal(clean[0].title, "p39", "most recent first");
});

test("media: playlists — rename, pin (on top, never pushed off), stars for Mine", async () => {
  const { editPlaylist, rememberPlaylist, isMine, MAX_PLAYLISTS } = await import("./media.ts");
  const a = [yt("aaaaaaaaaaa", 10)];
  let all = rememberPlaylist([], { list: "PLpinned0001", title: "Old name", items: a, by: "Ana", byUid: 1 }, 1);
  all = editPlaylist(all, "PLpinned0001", { title: "  Friday mix  ", pinned: true });
  assert.equal(all[0].title, "Friday mix");
  assert.equal(all[0].pinned, true);
  assert.equal(
    editPlaylist(all, "PLpinned0001", { title: "   " })[0].title,
    "Friday mix",
    "an empty name keeps the old",
  );
  // 35 newer playlists: the pinned one stays on top, the unpinned capped
  for (let i = 0; i < 35; i++)
    all = rememberPlaylist(
      all,
      { list: `PLmore${String(i).padStart(6, "0")}`, title: `p${i}`, items: a, by: "Bia", byUid: 2 },
      10 + i,
    );
  assert.equal(all[0].list, "PLpinned0001");
  assert.equal(all.length, 1 + MAX_PLAYLISTS);
  // stars: Mine for whoever starred it (and whoever brought it)
  all = editPlaylist(all, "PLmore000034", { star: { uid: 1, on: true } });
  const ana = all.filter((p) => isMine(p, 1)).map((p) => p.list);
  assert.deepEqual(ana.sort(), ["PLmore000034", "PLpinned0001"].sort());
  all = editPlaylist(all, "PLmore000034", { star: { uid: 1, on: false } });
  assert.equal(all.filter((p) => isMine(p, 1)).length, 1);
  // played again keeps its name, pin and stars
  all = rememberPlaylist(all, { list: "PLpinned0001", title: "?", items: a, by: "Bia" }, 999);
  assert.equal(all[0].title, "Friday mix");
  assert.equal(all[0].pinned, true);
});

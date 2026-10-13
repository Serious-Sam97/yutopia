#!/usr/bin/env node
// Fita 10 M0: what a Jellyfin server can give Yutopia. Reads YUTOPIA_JELLYFIN_URL
// and YUTOPIA_JELLYFIN_KEY (yutopia/.env), prints the version, the libraries
// (and whether trickplay is on for each), how much of a sample of the videos a
// browser could play as-is (direct), after a remux, or only transcoded, whether
// trickplay images exist, and the first bytes of a stream with a Range request.
// The key is sent only to that server and never printed.
//   node --env-file=.env tools/jellyfin-probe.mjs [sample size]

const base = (process.env.YUTOPIA_JELLYFIN_URL ?? "").replace(/\/$/, "");
const key = process.env.YUTOPIA_JELLYFIN_KEY ?? "";
if (!base || !key) {
  console.error("Set YUTOPIA_JELLYFIN_URL and YUTOPIA_JELLYFIN_KEY in yutopia/.env");
  process.exit(1);
}
const auth = {
  Authorization: `MediaBrowser Client="Yutopia", Device="probe", DeviceId="yutopia-probe", Version="0", Token="${key}"`,
};
const get = async (path, init = {}) => {
  const r = await fetch(base + path, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r;
};
const json = async (path) => (await get(path)).json();

// What Chrome / Firefox / Safari all play in a <video> without help.
const DIRECT = {
  containers: ["mp4", "m4v", "mov", "webm"],
  video: ["h264", "vp8", "vp9", "av1"],
  audio: ["aac", "mp3", "opus", "vorbis", "flac"],
};

function verdict(src) {
  const v = src.MediaStreams?.find((s) => s.Type === "Video");
  const a =
    src.MediaStreams?.find((s) => s.Type === "Audio" && s.IsDefault) ??
    src.MediaStreams?.find((s) => s.Type === "Audio");
  const codecsOk =
    (!v || DIRECT.video.includes(v.Codec?.toLowerCase())) && (!a || DIRECT.audio.includes(a.Codec?.toLowerCase()));
  const containers = (src.Container ?? "").toLowerCase().split(",");
  if (codecsOk && containers.some((c) => DIRECT.containers.includes(c))) return "direct";
  if (codecsOk) return "remux";
  return "transcode";
}

const sampleSize = Number(process.argv[2] ?? 40);
const info = await json("/System/Info");
console.log(`Jellyfin ${info.Version} · ${info.OperatingSystemDisplayName ?? info.OperatingSystem ?? "?"}`);

const enc = await json("/System/Configuration/encoding").catch(() => null);
if (enc)
  console.log(`encoder: ${enc.HardwareAccelerationType || "none (software)"} · threads ${enc.EncodingThreadCount}`);

const folders = await json("/Library/VirtualFolders");
console.log("\nLibraries:");
for (const f of folders) {
  const o = f.LibraryOptions ?? {};
  console.log(
    `  ${f.Name} (${f.CollectionType ?? "mixed"}) · trickplay extraction: ${o.EnableTrickplayImageExtraction ? "on" : "off"}${o.ExtractTrickplayImagesDuringLibraryScan ? " (during scan)" : ""}`,
  );
}

const items = await json(
  `/Items?Recursive=true&IncludeItemTypes=Movie,Episode,Video&Fields=MediaSources,Trickplay&SortBy=Random&Limit=${sampleSize}`,
);
const counts = { direct: 0, remux: 0, transcode: 0 };
let withTrickplay = 0;
const rows = [];
for (const it of items.Items ?? []) {
  const src = it.MediaSources?.[0];
  if (!src) continue;
  const v = src.MediaStreams?.find((s) => s.Type === "Video");
  const a = src.MediaStreams?.find((s) => s.Type === "Audio");
  const vd = verdict(src);
  counts[vd]++;
  const tp = it.Trickplay && Object.keys(it.Trickplay).length > 0;
  if (tp) withTrickplay++;
  rows.push(
    `  ${vd.padEnd(9)} ${(src.Container ?? "?").padEnd(14)} ${(v?.Codec ?? "-").padEnd(5)} ${String(v?.Height ?? "-").padStart(4)}p ${(a?.Codec ?? "-").padEnd(6)} ${String(Math.round((src.Bitrate ?? 0) / 1e6)).padStart(3)} Mbps ${tp ? "TP" : "  "} ${it.Type}`,
  );
}
const total = (items.Items ?? []).length;
console.log(`\nSample of ${total} of ${items.TotalRecordCount} videos:`);
for (const r of rows) console.log(r);
console.log(
  `\ndirect ${counts.direct} · remux ${counts.remux} · transcode ${counts.transcode} · trickplay ${withTrickplay}/${total}`,
);

// One stream, first 64 KB with a Range request, and the time to first byte.
const first = (items.Items ?? []).find((i) => i.MediaSources?.[0]);
if (first) {
  const t0 = performance.now();
  const r = await get(`/Videos/${first.Id}/stream?static=true`, { headers: { Range: "bytes=0-65535" } });
  const buf = await r.arrayBuffer();
  console.log(
    `\nRange stream: ${r.status} ${r.headers.get("content-type")} · ${buf.byteLength} bytes · accept-ranges ${r.headers.get("accept-ranges")} · ${Math.round(performance.now() - t0)} ms`,
  );
  if (first.Trickplay && Object.keys(first.Trickplay).length) {
    const [msid, widths] = Object.entries(first.Trickplay)[0];
    const [w, tinfo] = Object.entries(widths)[0];
    const tile = await get(`/Videos/${first.Id}/Trickplay/${w}/0.jpg?mediaSourceId=${msid}`);
    console.log(
      `Trickplay: ${w}px wide, every ${tinfo.Interval / 1000}s, ${tinfo.TileWidth}×${tinfo.TileHeight} per sheet · sheet 0 ${(await tile.arrayBuffer()).byteLength} bytes`,
    );
  }
}

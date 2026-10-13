import { MAX_DUR, MAX_QUEUE, type MediaItem, YT_ID } from "@yutopia/shared/media";
import { config } from "../config.ts";

// YouTube on the server side: titles for what people paste (oEmbed, no key),
// and — only with a Data API key — search, lengths, playlists. Without the key
// the players tell us a video's length once one loads it.

const titles = new Map<string, Promise<{ title: string; sub?: string } | null>>();

export function ytTitle(id: string): Promise<{ title: string; sub?: string } | null> {
  if (!YT_ID.test(id)) return Promise.resolve(null);
  let p = titles.get(id);
  if (!p) {
    p = fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: AbortSignal.timeout(8000) },
    )
      .then(async (r) => {
        if (!r.ok) return null; // private, removed, or not allowed to embed
        const j = (await r.json()) as { title?: string; author_name?: string };
        return j.title ? { title: j.title.slice(0, 120), sub: j.author_name?.slice(0, 120) } : null;
      })
      .catch(() => null);
    titles.set(id, p);
    if (titles.size > 2000) titles.delete(titles.keys().next().value as string);
  }
  return p;
}

export const ytSearchOn = () => !!config.youtubeKey;

const api = async <T>(path: string): Promise<T> => {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(config.youtubeKey)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`YouTube API ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
};

// PT1H2M3S → 3723
export function isoDuration(s: string): number {
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [d, h, mi, se] = m.slice(1).map((x) => Number(x ?? 0));
  return Math.min(MAX_DUR, d * 86400 + h * 3600 + mi * 60 + se);
}

interface VideoRow {
  id: string;
  snippet?: { title: string; channelTitle: string };
  contentDetails?: { duration: string };
  status?: { embeddable: boolean; privacyStatus: string };
}

// Videos by id, as queue items (the ones that can't be embedded left out).
export async function ytVideos(ids: string[]): Promise<MediaItem[]> {
  const out: MediaItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await api<{ items: VideoRow[] }>(
      `videos?part=snippet,contentDetails,status&id=${ids.slice(i, i + 50).join(",")}`,
    );
    for (const v of r.items)
      if (v.status?.embeddable !== false && v.status?.privacyStatus !== "private")
        out.push({
          src: "yt",
          ref: v.id,
          title: v.snippet?.title.slice(0, 120) ?? "YouTube",
          sub: v.snippet?.channelTitle.slice(0, 120),
          dur: isoDuration(v.contentDetails?.duration ?? ""),
        });
  }
  return out;
}

export async function ytSearch(q: string): Promise<MediaItem[]> {
  const r = await api<{ items: { id: { videoId?: string } }[] }>(
    `search?part=id&type=video&videoEmbeddable=true&maxResults=20&q=${encodeURIComponent(q.slice(0, 100))}`,
  );
  return ytVideos(r.items.map((x) => x.id.videoId).filter((x): x is string => !!x && YT_ID.test(x)));
}

export async function ytPlaylist(list: string): Promise<MediaItem[]> {
  const ids: string[] = [];
  let page = "";
  while (ids.length < MAX_QUEUE) {
    const r = await api<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
      `playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(list)}${page ? `&pageToken=${page}` : ""}`,
    );
    ids.push(...r.items.map((x) => x.contentDetails.videoId).filter((x) => YT_ID.test(x)));
    if (!r.nextPageToken) break;
    page = r.nextPageToken;
  }
  return ytVideos(ids.slice(0, MAX_QUEUE));
}

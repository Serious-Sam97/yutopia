import { serverNow } from "./clock";

// A YouTube player kept in step with a shared timeline: it should be at
// (serverNow − at) seconds, wrapping by the duration when it repeats. YouTube's
// picture can't be drawn into the world (cross-origin iframe) and its rules
// want a visible player ≥ 200×200, so this always lives in a real, visible
// iframe (the "On TV" card or Watch).

export interface Timeline {
  at: number; // server ms when position 0 played
  dur: number; // s (0 = unknown yet)
  loop: boolean;
  paused?: boolean;
  pos?: number; // s, while paused
}

export function expectedPosition(t: Timeline, now = serverNow()): number {
  if (t.paused) return t.pos ?? 0;
  const p = Math.max(0, (now - t.at) / 1000);
  if (t.loop && t.dur > 0) return p % t.dur;
  return t.dur > 0 ? Math.min(p, t.dur) : p;
}

// ── the IFrame API (a runtime script from youtube.com; YouTube requires it) ──

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setPlaybackRate(r: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    o: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: Record<string, (e: { data: number; target: YTPlayer }) => void>;
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

let api: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (api) return api;
  api = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      api = null;
      reject(new Error("YouTube API failed to load"));
    };
    document.head.appendChild(s);
  });
  return api;
}

// ── keeping it in step ──

const SEEK_ABOVE = 1.0; // s of drift → seek
const NUDGE_ABOVE = 0.12; // s of drift → play a little faster / slower
const TICK_MS = 250;

export interface SyncStats {
  state: number;
  drift: number; // s, player − expected (+ = ahead)
  driftLog: number[]; // recent drifts while playing and settled
  seeks: number;
  lead: number; // s added to seeks (learned: how far behind a seek lands)
  rate: number;
  nudges: boolean; // whether the player takes rates like 1.05
  muted: boolean;
  error: number | null;
  startedMs: number | null; // first PLAYING after creation, ms
  // the browser's autoplay rule: with sound, or muted until the next click / key
  autoplay: "pending" | "sound" | "muted";
}

export class SyncedYouTube {
  private player: YTPlayer | null = null;
  private timer = 0;
  private seekAt = 0; // performance.now() of the last seek, 0 = settled
  private created = performance.now();
  private volume = 100;
  stats: SyncStats = {
    state: YT_STATE.UNSTARTED,
    drift: 0,
    driftLog: [],
    seeks: 0,
    lead: 0.4,
    rate: 1,
    nudges: false,
    muted: false,
    error: null,
    startedMs: null,
    autoplay: "pending",
  };
  private blockedSince = 0;
  private unarm: (() => void) | null = null;

  constructor(
    private host: HTMLElement,
    private videoId: string,
    private timeline: Timeline,
  ) {}

  async start(): Promise<void> {
    const YT = await loadYouTubeApi();
    const el = document.createElement("div");
    this.host.appendChild(el);
    await new Promise<void>((resolve) => {
      this.player = new YT.Player(el, {
        videoId: this.videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          start: Math.floor(expectedPosition(this.timeline)),
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: location.origin,
        },
        events: {
          onReady: (e) => {
            const p = e.target;
            const d = p.getDuration();
            if (d > 0 && !this.timeline.dur) this.timeline.dur = d;
            p.setVolume(this.volume);
            this.seek(expectedPosition(this.timeline));
            p.playVideo();
            resolve();
          },
          onStateChange: (e) => {
            this.stats.state = e.data;
            if (e.data === YT_STATE.PLAYING && this.stats.startedMs === null)
              this.stats.startedMs = performance.now() - this.created;
          },
          onError: (e) => {
            this.stats.error = e.data; // 2 bad id, 5 html5, 100 gone, 101/150 not embeddable
          },
        },
      });
    });
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  setTimeline(t: Timeline) {
    const jumped =
      Math.abs(expectedPosition(t) - expectedPosition(this.timeline)) > 1.5 || t.paused !== this.timeline.paused;
    this.timeline = t;
    if (jumped) this.seekAt = 0;
  }

  // another video in the same player (the queue moved on)
  load(videoId: string, t: Timeline) {
    this.videoId = videoId;
    this.timeline = t;
    this.seekAt = performance.now();
    this.stats.driftLog = [];
    this.player?.loadVideoById({ videoId, startSeconds: expectedPosition(t) + this.stats.lead });
  }
  get video(): string {
    return this.videoId;
  }
  // how long it is, once the player knows (0 before)
  duration(): number {
    try {
      return this.player?.getDuration() ?? 0;
    } catch {
      return 0;
    }
  }
  // play muted until the next click (phones: the card's own tap)
  get mutedByBrowser(): boolean {
    return this.stats.autoplay === "muted" || (this.stats.autoplay === "pending" && !!this.unarm);
  }
  unmute() {
    this.unarm?.();
    this.player?.unMute();
    this.player?.setVolume(this.volume);
    this.stats.autoplay = "sound";
  }

  // 0..1 (hearing gain × my music volume)
  setVolume(v: number) {
    this.volume = Math.round(Math.max(0, Math.min(1, v)) * 100);
    this.player?.setVolume(this.volume);
  }

  get iframe(): HTMLIFrameElement | null {
    return this.host.querySelector("iframe");
  }

  private seek(target: number) {
    const p = this.player;
    if (!p) return;
    const dur = this.timeline.dur || p.getDuration();
    let to = target + this.stats.lead;
    if (dur > 0 && to >= dur) to = this.timeline.loop ? to % dur : dur - 0.1;
    p.seekTo(to, true);
    this.seekAt = performance.now();
    this.stats.seeks++;
  }

  private setRate(r: number) {
    const p = this.player;
    if (!p || this.stats.rate === r) return;
    p.setPlaybackRate(r);
    const got = p.getPlaybackRate();
    if (r !== 1) this.stats.nudges = Math.abs(got - r) < 0.01;
    this.stats.rate = got;
  }

  private tick() {
    const p = this.player;
    if (!p) return;
    const state = p.getPlayerState();
    this.stats.state = state;
    this.stats.muted = p.isMuted();
    if (this.timeline.paused) {
      if (state === YT_STATE.PLAYING) p.pauseVideo();
      return;
    }
    if (state === YT_STATE.PLAYING) {
      this.blockedSince = 0;
      if (this.stats.autoplay === "pending") this.stats.autoplay = p.isMuted() ? "muted" : "sound";
    } else if (state !== YT_STATE.BUFFERING) {
      // not started (autoplay blocked), cued, paused from inside the iframe, or ended
      const now = performance.now();
      if (!this.blockedSince) this.blockedSince = now;
      if (state === YT_STATE.ENDED) this.seek(expectedPosition(this.timeline));
      // still not going after a while: the browser wants a gesture for sound,
      // so play muted (always allowed) and unmute on the next click or key
      if (now - this.blockedSince > 1500 && !p.isMuted()) {
        p.mute();
        this.armUnmute();
      }
      p.playVideo();
      return;
    }
    if (state !== YT_STATE.PLAYING) return;
    const exp = expectedPosition(this.timeline);
    const cur = p.getCurrentTime();
    let drift = cur - exp;
    const dur = this.timeline.dur;
    if (this.timeline.loop && dur > 0) {
      // across the wrap, the short way round
      if (drift > dur / 2) drift -= dur;
      if (drift < -dur / 2) drift += dur;
    }
    this.stats.drift = drift;
    // after a seek, wait for playback to settle, then learn how far off it landed
    if (this.seekAt) {
      if (performance.now() - this.seekAt < 1200) return;
      this.seekAt = 0;
      if (Math.abs(drift) < 3) this.stats.lead = Math.max(0, Math.min(3, this.stats.lead - drift * 0.7));
    }
    this.stats.driftLog.push(drift);
    if (this.stats.driftLog.length > 240) this.stats.driftLog.shift();
    if (Math.abs(drift) > SEEK_ABOVE) {
      this.setRate(1);
      this.seek(exp);
      return;
    }
    if (Math.abs(drift) > NUDGE_ABOVE) this.setRate(drift > 0 ? 0.95 : 1.05);
    else if (Math.abs(drift) < 0.04) this.setRate(1);
  }

  private armUnmute() {
    if (this.unarm) return;
    const go = () => {
      this.unarm?.();
      const p = this.player;
      if (!p) return;
      p.unMute();
      p.setVolume(this.volume);
      this.stats.autoplay = "sound";
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
    this.unarm = () => {
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
      this.unarm = null;
    };
  }

  destroy() {
    this.unarm?.();
    clearInterval(this.timer);
    this.player?.destroy();
    this.player = null;
  }
}

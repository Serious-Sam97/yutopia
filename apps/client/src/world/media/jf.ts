import type Hls from "hls.js";
import { serverNow } from "./clock";
import { expectedPosition, type Timeline } from "./youtube";

// A Jellyfin TV's stream, kept to the shared timeline: HLS through the
// world-server's relay (one Jellyfin session per TV, shared by everyone), via
// hls.js (Safari plays HLS itself). Under a second off it plays a touch faster
// or slower; more than that, it seeks. Its picture is copied onto the TV's
// glass each frame (world/media/room.ts); its volume follows hearing.

const SEEK_ABOVE = 1.0;
const NUDGE_ABOVE = 0.15;

export class SyncedVideo {
  readonly video: HTMLVideoElement;
  private hls: Hls | null = null;
  private timer = 0;
  private settleUntil = 0;
  private seeked = false; // a seek of ours is settling: learn how far off it lands
  lead = 0.5; // s to aim ahead when seeking (learned: how long the stream takes to start)
  drift = 0;
  failed = false;

  constructor(
    readonly url: string, // master playlist
    private timeline: Timeline,
    holder: HTMLElement,
  ) {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; // drawn into WebGL
    v.playsInline = true;
    v.preload = "auto";
    v.volume = 0;
    this.video = v;
    holder.append(v);
  }

  async start() {
    const v = this.video;
    // hls.js wherever Media Source Extensions exist (newer Chrome also says it
    // plays HLS itself, but stalls on these streams); native HLS otherwise (iPhone)
    const { default: H } = await import("hls.js");
    if (H.isSupported()) {
      const hls = new H({ maxBufferLength: 30, backBufferLength: 30, startPosition: expectedPosition(this.timeline) });
      this.hls = hls;
      // a fatal error: retry a few times (a cold transcode can stall the first
      // segment), then give up — the glass keeps the item's picture
      let retries = 0;
      hls.on(H.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (++retries > 4) {
          this.failed = true;
          hls.destroy();
          this.hls = null;
          return;
        }
        if (d.type === H.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === H.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.failed = true;
      });
      hls.loadSource(this.url);
      hls.attachMedia(v);
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) v.src = this.url;
    else {
      this.failed = true;
      return;
    }
    v.currentTime = expectedPosition(this.timeline);
    this.settleUntil = performance.now() + 4000;
    void v.play().catch(() => {});
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  setTimeline(t: Timeline) {
    const jumped =
      Math.abs(expectedPosition(t) - expectedPosition(this.timeline)) > 2 || t.paused !== this.timeline.paused;
    this.timeline = t;
    if (jumped) this.settleUntil = 0;
  }

  setVolume(v: number) {
    this.video.volume = Math.max(0, Math.min(1, v));
  }

  get ready(): boolean {
    return this.video.readyState >= 2 && !this.failed;
  }

  // subtitles, when the stream has them
  setSubtitles(on: boolean) {
    if (this.hls) this.hls.subtitleTrack = on ? 0 : -1;
    for (const t of Array.from(this.video.textTracks))
      t.mode = on && t === this.video.textTracks[0] ? "showing" : "hidden";
  }
  get hasSubtitles(): boolean {
    return (this.hls?.subtitleTracks.length ?? 0) > 0 || this.video.textTracks.length > 0;
  }

  private tick() {
    const v = this.video;
    if (this.timeline.paused) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - (this.timeline.pos ?? 0)) > 0.5) v.currentTime = this.timeline.pos ?? 0;
      return;
    }
    if (v.paused) void v.play().catch(() => {});
    if (v.readyState < 3) return; // buffering (a cold transcode takes a few seconds)
    const exp = expectedPosition(this.timeline, serverNow());
    const drift = v.currentTime - exp;
    this.drift = drift;
    if (performance.now() < this.settleUntil) return;
    if (this.seeked) {
      // where our last seek really landed: aim that much further next time
      this.seeked = false;
      if (Math.abs(drift) < 6) this.lead = Math.max(0, Math.min(6, this.lead - drift * 0.8));
    }
    if (Math.abs(drift) > SEEK_ABOVE) {
      v.playbackRate = 1;
      v.currentTime = exp + this.lead;
      this.seeked = true;
      this.settleUntil = performance.now() + 2500;
      return;
    }
    v.playbackRate =
      Math.abs(drift) > NUDGE_ABOVE ? (drift > 0 ? 0.97 : 1.03) : Math.abs(drift) < 0.05 ? 1 : v.playbackRate;
  }

  destroy() {
    clearInterval(this.timer);
    this.hls?.destroy();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
  }
}

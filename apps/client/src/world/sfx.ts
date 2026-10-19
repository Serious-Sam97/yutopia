// Recorded sound effects (CC0 samples, docs/plan/26-floor-transitions.md):
// small MP3s in public/sfx, fetched and decoded the first time they're
// wanted, kept after. A sample that isn't there (not added yet, offline) is
// null, and whoever asked plays its stand-in instead.

const cache = new Map<string, Promise<AudioBuffer | null>>();

/** A sample by its path under /sfx (e.g. "lift/door-open": an MP3; a loop
 *  names its file, "lift/ride.wav"), decoded for `ctx`. */
export function sample(ctx: BaseAudioContext, name: string): Promise<AudioBuffer | null> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}${/\.\w+$/.test(name) ? "" : ".mp3"}`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
    cache.set(name, p);
  }
  return p;
}

export interface PlayOpts {
  gain?: number;
  rate?: number; // playback rate (pitch)
  loop?: boolean;
  at?: number; // ctx time to start (default now)
  fadeIn?: number; // seconds
  out?: AudioNode; // where it goes (default ctx.destination)
}

/** Play a decoded sample; returns how to stop it (with a short fade). */
export function playSample(ctx: BaseAudioContext, buf: AudioBuffer, o: PlayOpts = {}): (fade?: number) => void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = !!o.loop;
  src.playbackRate.value = o.rate ?? 1;
  const g = ctx.createGain();
  const at = o.at ?? ctx.currentTime;
  const level = o.gain ?? 1;
  if (o.fadeIn) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + o.fadeIn);
  } else g.gain.value = level;
  src.connect(g).connect(o.out ?? ctx.destination);
  src.start(at);
  let stopped = false;
  return (fade = 0.15) => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + fade);
    src.stop(t + fade + 0.02);
  };
}

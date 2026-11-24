// Build mode's and God mode's music (docs/plan/124-the-build-view.md, follow-up): light jazz and bossa in The Sims 3's
// build mode's spirit — Kevin MacLeod's, CC BY 4.0 (public/sfx/build, credited in Settings → Credits). The picked
// tracks (chosen.json; on this machine, /dev/build-music's picks first) shuffled into a playlist: it fades in while
// build mode or God mode is up (each says so: `want`) and out when neither is, the world's ambience dipped under it,
// and goes on where it stopped the next time. Its level is an admin's, for everyone (WorldState.buildMusicVol), under
// each player's own Music volume. One for the page: the build chunk and God mode's share it.
import { mixer } from "../audio";

const DIR = "/sfx/build";
/** /dev/build-music's picks on this machine (file names): heard in the game before chosen.json has them */
export const BUILD_MUSIC_KEY = "yutopia:build-music";
const FADE_IN = 1.6;
const FADE_OUT = 0.9;

export interface BuildTrack {
  file: string;
  title: string;
  author: string;
  page: string;
  license: string;
}

let list: Promise<string[]> | null = null;
/** The playlist's files: this machine's picks, else chosen.json's, else every candidate. */
function playlist(): Promise<string[]> {
  list ??= (async () => {
    const man = (await fetch(`${DIR}/manifest.json`)
      .then((r) => (r.ok ? r.json() : { music: [] }))
      .catch(() => ({ music: [] }))) as { music: BuildTrack[] };
    const all = man.music.map((t) => t.file);
    let mine: string[] = [];
    try {
      mine = JSON.parse(localStorage.getItem(BUILD_MUSIC_KEY) ?? "[]");
    } catch {}
    const chosen = (await fetch(`${DIR}/chosen.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { music?: string[] } | null;
    const pick = (mine.length ? mine : (chosen?.music ?? [])).filter((f) => all.includes(f));
    return pick.length ? pick : all;
  })();
  return list;
}

const shuffle = <T>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export class BuildMusic {
  private el: HTMLAudioElement | null = null;
  private g: GainNode | null = null;
  /** the admin's level (0 … 2), after the fades */
  private lv: GainNode | null = null;
  private levelOf: () => number = () => 1;
  private levelTimer = 0;
  private wants = new Set<string>();

  /** Build mode ("build") or God mode ("god") up or down: the music plays while any wants it. `level`: the admin's
   *  volume for everyone, read while it plays. */
  want(who: string, on: boolean, level?: () => number) {
    if (level) this.levelOf = level;
    const was = this.wants.size > 0;
    if (on) this.wants.add(who);
    else this.wants.delete(who);
    const now = this.wants.size > 0;
    if (!was && now) void this.start();
    else if (was && !now) this.stop();
  }
  private order: string[] = [];
  private i = 0;
  private on = false;
  private stopTimer = 0;

  /** The music fades in (where it stopped, or a new shuffle). */
  private async start() {
    this.on = true;
    clearTimeout(this.stopTimer);
    const files = await playlist();
    if (!this.on || !files.length) return;
    const ctx = mixer.ensure();
    void mixer.resume();
    if (!this.el || !this.g) {
      const el = new Audio();
      el.preload = "auto";
      el.addEventListener("ended", () => this.next());
      const g = ctx.createGain();
      g.gain.value = 0;
      const lv = ctx.createGain();
      lv.gain.value = this.level();
      ctx.createMediaElementSource(el).connect(g).connect(lv).connect(mixer.buses.music);
      this.el = el;
      this.g = g;
      this.lv = lv;
    }
    // (the admin's level, followed while it plays)
    clearInterval(this.levelTimer);
    this.levelTimer = window.setInterval(() => {
      const c = mixer.ctx;
      if (c && this.lv) this.lv.gain.setTargetAtTime(this.level(), c.currentTime, 0.25);
    }, 400);
    if (!this.order.length || this.order.some((f) => !files.includes(f)) || this.order.length !== files.length) {
      this.order = shuffle(files);
      this.i = 0;
      this.el.src = `${DIR}/${this.order[0]}`;
    }
    const t = ctx.currentTime;
    this.g.gain.cancelScheduledValues(t);
    this.g.gain.setValueAtTime(this.g.gain.value, t);
    this.g.gain.linearRampToValueAtTime(1, t + FADE_IN);
    mixer.duck(1);
    await this.el.play().catch(() => {});
  }

  private level(): number {
    const v = Number(this.levelOf());
    return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
  }

  /** Neither mode up: it fades out and pauses (kept where it was). */
  private stop() {
    this.on = false;
    mixer.duck(0);
    const ctx = mixer.ctx;
    if (!ctx || !this.g || !this.el) return;
    const t = ctx.currentTime;
    this.g.gain.cancelScheduledValues(t);
    this.g.gain.setValueAtTime(this.g.gain.value, t);
    this.g.gain.linearRampToValueAtTime(0, t + FADE_OUT);
    clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(
      () => {
        if (!this.on) this.el?.pause();
      },
      FADE_OUT * 1000 + 50,
    );
  }

  /** The next track (a fresh shuffle once round, never the same one twice in a row). */
  private next() {
    if (!this.el || !this.order.length) return;
    this.i++;
    if (this.i >= this.order.length) {
      const last = this.order[this.order.length - 1];
      this.order = shuffle(this.order);
      if (this.order.length > 1 && this.order[0] === last) this.order.push(this.order.shift() as string);
      this.i = 0;
    }
    this.el.src = `${DIR}/${this.order[this.i]}`;
    if (this.on) void this.el.play().catch(() => {});
  }

  /** (the bench, a test) what's playing */
  now(): { file: string; at: number; playing: boolean } | null {
    if (!this.el || !this.order.length) return null;
    return { file: this.order[this.i], at: this.el.currentTime, playing: !this.el.paused };
  }

  dispose() {
    this.wants.clear();
    this.on = false;
    clearTimeout(this.stopTimer);
    clearInterval(this.levelTimer);
    this.el?.pause();
    mixer.duck(0);
  }
}

/** The page's one: build mode and God mode ask it. */
export const buildMusic = new BuildMusic();

"use client";

import { tr } from "@/lib/i18n";
import { mixer } from "../audio";
import { noiseBuffer, ready } from "../foley";
import type { Phone } from ".";
import { phoneApi } from "./data";
import { LineTone, Ringer, textTone, ui } from "./sounds";
import { type Msg, phone } from "./store";

// Vortex, on the phone (docs/plan/21-cellphone.md § 5–6): always in Contacts,
// "somewhere in the walls". Text him and he texts back (Yondra's curated,
// in-character lines with your real data — the same voice as in the world);
// what he says to you in the world lands in his thread. Call him and he
// answers — or doesn't — in his own voice: the browser's speech, pitched
// down, over a bed of tape hiss (Yondra's vortex/voice/tts.ts, in small).
// Sometimes he calls back. At the worst time.

export class VortexLine {
  private speaking = false;
  private stopCall: (() => void) | null = null;
  private callbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ph: Phone) {}

  // ── texts ────────────────────────────────────────────────────────────────
  async text(thread: number, text: string) {
    const me = phone.get().me.uid;
    const local: Msg = {
      id: -Date.now(),
      thread,
      from: me,
      kind: "text",
      body: text,
      photo: null,
      call: null,
      reactions: {},
      replyTo: null,
      at: Date.now(),
      pending: true,
    };
    this.ph.addMsg(local);
    ui("send", 0.7);
    phone.set({ vortexTyping: true });
    try {
      const r = await phoneApi.vortexText(text);
      phone.set((s) => ({
        msgs: { ...s.msgs, [thread]: (s.msgs[thread] ?? []).filter((m) => m.id !== local.id) },
      }));
      this.ph.addMsg(r.message);
      if (r.reply) {
        const reply = r.reply;
        // he takes his time (he's typing; he wants you to see him typing)
        setTimeout(
          () => {
            phone.set({ vortexTyping: false });
            this.ph.addMsg(reply);
            textTone(phone.get().settings.textTone, 0.8);
            if (!onThread(thread)) this.ph.arrived(reply);
            else this.ph.markRead(thread);
          },
          900 + Math.min(2600, reply.body.length * 22),
        );
      } else phone.set({ vortexTyping: false });
    } catch {
      phone.set((s) => ({
        vortexTyping: false,
        msgs: {
          ...s.msgs,
          [thread]: (s.msgs[thread] ?? []).map((m) => (m.id === local.id ? { ...m, pending: false, failed: true } : m)),
        },
      }));
    }
  }

  // something he said to me in the world: kept in his thread
  async line(text: string) {
    try {
      const m = await phoneApi.vortexLine(text);
      this.ph.addMsg(m);
      if (!onThread(m.thread))
        phone.set((s) => ({ threads: s.threads.map((t) => (t.id === m.thread ? { ...t, unread: t.unread + 1 } : t)) }));
    } catch {}
  }

  // ── calls ────────────────────────────────────────────────────────────────
  call() {
    if (phone.get().call) return;
    phone.set({
      call: {
        id: "vortex",
        phase: "ringing",
        outgoing: true,
        video: false,
        from: phone.get().me.uid,
        peers: [{ uid: 0, name: "Vortex", avatar: "vortex", space: "", state: "ringing" }],
        startedAt: 0,
        muted: false,
        speaker: false,
        camOn: false,
        level: 0,
        vortex: { line: "", mood: "smug" },
      },
    });
    this.show();
    const tone = new LineTone("ringback");
    // one ring, two… or he lets it ring out
    const picks = Math.random() > 0.22;
    const t = setTimeout(
      () => {
        tone.stop();
        if (!picks) {
          this.end("missed");
          this.ph.note(tr("phVortexNoAnswer"), 3000);
          this.maybeCallBack();
          return;
        }
        void this.converse();
      },
      picks ? 3200 + Math.random() * 3500 : 12000,
    );
    this.stopCall = () => {
      clearTimeout(t);
      tone.stop();
    };
  }

  // he calls me (after I called and he let it ring, sometimes)
  private maybeCallBack() {
    if (this.callbackTimer || Math.random() > 0.45) return;
    this.callbackTimer = setTimeout(
      () => {
        this.callbackTimer = null;
        if (phone.get().call) return;
        phone.set({
          call: {
            id: "vortex",
            phase: "incoming",
            outgoing: false,
            video: false,
            from: 0,
            peers: [{ uid: 0, name: "Vortex", avatar: "vortex", space: "", state: "in" }],
            startedAt: 0,
            muted: false,
            speaker: false,
            camOn: false,
            level: 0,
            vortex: { line: "", mood: "malicious" },
          },
        });
        const r = this.ph.sleeping() ? null : new Ringer("vortex", 0.9, 0, true);
        this.show();
        const t = setTimeout(() => {
          r?.stop();
          if (phone.get().call?.phase === "incoming") this.end("missed");
        }, 20_000);
        this.stopCall = () => {
          clearTimeout(t);
          r?.stop();
        };
      },
      30_000 + Math.random() * 60_000,
    );
  }

  answer() {
    this.stopCall?.();
    void this.converse();
  }
  decline() {
    this.stopCall?.();
    this.end("declined");
    // he takes it well
    setTimeout(() => void this.line("you declined me. noted. *kkzzt* filed under 'later'."), 2500);
  }

  // he talks: a few lines, with pauses, then he hangs up on you
  private async converse() {
    const c = phone.get().call;
    if (!c?.vortex) return;
    phone.set({
      call: { ...c, phase: "live", startedAt: Date.now(), peers: c.peers.map((p) => ({ ...p, state: "in" })) },
    });
    this.ph.pose();
    ui("connect", 0.6);
    const bed = tapeBed();
    let alive = true;
    this.stopCall = () => {
      alive = false;
      bed?.();
      window.speechSynthesis?.cancel();
    };
    const said: string[] = [];
    for (let i = 0; i < 4 && alive; i++) {
      let r: { line: string; mood: string; hangup: boolean };
      try {
        r = await phoneApi.vortexCall(said);
      } catch {
        r = { line: "the line's bad. *kkzzt* the line's always bad. call me never.", mood: "dizzy", hangup: true };
      }
      if (!alive || !phone.get().call?.vortex) return;
      said.push(r.line);
      const cur = phone.get().call;
      if (cur) phone.set({ call: { ...cur, vortex: { line: r.line, mood: r.mood }, level: 0.7 } });
      await this.say(r.line);
      if (!alive) return;
      const now = phone.get().call;
      if (now) phone.set({ call: { ...now, level: 0 } });
      if (r.hangup) break;
      await sleep(1600 + Math.random() * 1400);
    }
    if (!alive) return;
    bed?.();
    // *click*
    this.stopCall = null;
    this.end("answered");
  }

  private say(text: string): Promise<void> {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    const words = text.replace(/\*[^*]+\*/g, " ").trim();
    if (!synth || !words) return sleep(Math.min(6000, 1200 + text.length * 45));
    return new Promise((done) => {
      const u = new SpeechSynthesisUtterance(words);
      u.lang = "en-US";
      u.pitch = 0.55;
      u.rate = 0.98;
      u.volume = Math.min(1, mixer.voiceLevel() + 0.1);
      const v = synth.getVoices().find((x) => /en[-_]US/i.test(x.lang) && /male|daniel|fred|alex/i.test(x.name));
      if (v) u.voice = v;
      this.speaking = true;
      const fin = () => {
        this.speaking = false;
        done();
      };
      u.onend = fin;
      u.onerror = fin;
      synth.speak(u);
      // some browsers never fire onend
      setTimeout(fin, Math.min(14_000, 2000 + words.length * 90));
    });
  }

  // The keypad's secret numbers (shared SECRET_NUMBERS).
  secret(kind: string) {
    if (phone.get().call) return;
    if (kind === "vortex") return this.call();
    if (kind === "jenny") {
      const tone = new LineTone("busy");
      setTimeout(() => tone.stop(), 2600);
      setTimeout(() => void this.line("jenny changed her number in 1982. let it go. *kkzzt* i did."), 6000);
      return;
    }
    const scripts: Record<string, { who: string; mood: string; lines: string[]; noise: boolean }> = {
      vex: {
        who: "M. Vex",
        mood: "empty",
        noise: true,
        lines: [
          "this is m. vex. if you can hear this, the tape survived.",
          "the mascot is not what he says he is. *kkzzt* he is exactly what he says he is. that's worse.",
        ],
      },
      static: { who: "???", mood: "dead", noise: true, lines: [] },
      tape: {
        who: "Voicemail",
        mood: "sleepy",
        noise: true,
        lines: [
          "you have. one. new message. from. nineteen eighty nine.",
          "*click* ...hello? is this thing on? ...never mind.",
        ],
      },
    };
    const sc = scripts[kind];
    if (!sc) return;
    phone.set({
      call: {
        id: "vortex",
        phase: "ringing",
        outgoing: true,
        video: false,
        from: phone.get().me.uid,
        peers: [{ uid: 0, name: sc.who, avatar: "vortex", space: "", state: "ringing" }],
        startedAt: 0,
        muted: false,
        speaker: false,
        camOn: false,
        level: 0,
        vortex: { line: "", mood: sc.mood },
      },
    });
    this.show();
    let alive = true;
    const hiss = sc.noise ? new LineTone("static") : null;
    this.stopCall = () => {
      alive = false;
      hiss?.stop();
      window.speechSynthesis?.cancel();
    };
    void (async () => {
      await sleep(1800);
      if (!alive) return;
      const c = phone.get().call;
      if (c) phone.set({ call: { ...c, phase: "live", startedAt: Date.now() } });
      for (const l of sc.lines) {
        if (!alive) return;
        const cur = phone.get().call;
        if (cur?.vortex) phone.set({ call: { ...cur, vortex: { line: l, mood: sc.mood }, level: 0.6 } });
        await this.say(l);
        await sleep(900);
      }
      if (!sc.lines.length) await sleep(5000);
      if (!alive) return;
      hiss?.stop();
      this.stopCall = null;
      this.end("answered");
    })();
  }

  hangup() {
    this.stopCall?.();
    this.stopCall = null;
    if (this.speaking) window.speechSynthesis?.cancel();
    this.end(phone.get().call?.phase === "live" ? "answered" : "cancelled");
  }

  private end(why: string) {
    const c = phone.get().call;
    if (!c?.vortex) return;
    phone.set({ call: { ...c, phase: "ended", end: why } });
    this.ph.pose();
    ui("end", 0.7);
    setTimeout(() => {
      if (phone.get().call?.phase !== "ended") return;
      const p = phone.get();
      phone.set({ call: null, stack: p.stack.filter((s) => s.app !== "call"), sel: 0 });
      if (phone.get().stack.length === 0) phone.set({ stack: [{ app: "home" }] });
      this.ph.pose();
    }, 2000);
  }

  private show() {
    const p = phone.get();
    phone.set({
      stack: [...p.stack.filter((s) => s.app !== "call" && s.app !== "boot"), { app: "call" }],
      sel: 0,
      booted: true,
    });
    if (!p.open) this.ph.setOpen(true);
    else this.ph.pose();
  }
}

function onThread(thread: number) {
  const p = phone.get();
  const t = p.stack[p.stack.length - 1];
  return p.open && t?.view === "thread" && Number(t.arg) === thread;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// a quiet tape hiss under his voice while he's on the line
function tapeBed(): (() => void) | null {
  const ctx = ready();
  if (!ctx) return null;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4200;
  bp.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(0.018, ctx.currentTime, 0.4);
  s.connect(bp).connect(g).connect(mixer.buses.effects);
  s.start();
  return () => {
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    setTimeout(() => {
      try {
        s.stop();
      } catch {}
    }, 500);
  };
}

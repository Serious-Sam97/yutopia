"use client";

import { hearingGain, stereoPan } from "@yutopia/shared";
import { type PhoneSettings, type PhoneState, parsePhoneSettings, type Ringtone } from "@yutopia/shared/phone";
import { addStrings, tr } from "@/lib/i18n";
import { PHONE_STRINGS } from "@/lib/i18n-phone";
import type { WorldController } from "../controller";
import { hud } from "../store";
import { Calls } from "./call";
import { Camera } from "./camera";
import { liveOf, phoneApi } from "./data";
import { Gps } from "./gps";
import { Ringer, textTone, ui } from "./sounds";
import { type AppId, type Msg, type PhotoRef, phone, type Screen, type Thread, top } from "./store";
import { VortexLine } from "./vortex";

// The phone's chunk (docs/plan/21-cellphone.md): Vortex Mobile. It loads soon
// after arriving — texts and calls reach it in the pocket — and holds the
// phone's state (phone/store.ts), the line to the API (texts, photos,
// settings), calls (call.ts), the camera (camera.ts), Vortex (vortex.ts), and
// everything the world hears of phones: other people's ringtones near you.
export const PHONE_CHUNK = "yutopia-phone";
addStrings(PHONE_STRINGS, PHONE_CHUNK);

export { phone, usePhone } from "./store";

type Nav = "up" | "down" | "left" | "right" | "enter" | "back";

export class Phone {
  readonly calls: Calls;
  readonly camera: Camera;
  readonly vortex: VortexLine;
  readonly gps: Gps;
  private ringers = new Map<string, Ringer>(); // other people's phones ringing near me
  private shots = new Map<string, number>(); // sid → the last flash seen
  private navs = new Set<(n: Nav) => void>();
  private offs: (() => void)[] = [];
  private peekTimer: ReturnType<typeof setTimeout> | null = null;
  private typingSent = new Map<number, number>();
  private contactsTimer: ReturnType<typeof setInterval> | null = null;
  private nextLocal = -1;

  constructor(readonly ctl: WorldController) {
    const s = ctl.session;
    phone.set({ me: { uid: s?.user.id ?? 0, name: s?.user.name ?? "", avatar: JSON.stringify(s?.avatar ?? {}) } });
    this.calls = new Calls(this);
    this.camera = new Camera(this);
    this.vortex = new VortexLine(this);
    this.gps = new Gps(this);
    // the HUD's summary of it (the dock's key, the badge)
    this.offs.push(
      phone.subscribe(() => {
        const p = phone.get();
        const badge = p.threads.reduce((n, t) => n + (t.muted ? 0 : t.unread), 0);
        const h = hud.get().phone;
        const ringing = p.call?.phase === "incoming";
        const onCall = !!p.call && p.call.phase !== "ended";
        if (h.open !== p.open || h.badge !== badge || h.ringing !== ringing || h.onCall !== onCall)
          hud.set({ phone: { ...h, open: p.open, badge, ringing, onCall } });
      }),
    );
    this.offs.push(ctl.onFrame(() => this.frame()));
    void this.loadSettings();
    void this.loadThreads();
    this.contactsTimer = setInterval(() => {
      if (phone.get().open) void this.loadContacts();
    }, 20_000);
  }

  destroy() {
    for (const o of this.offs) o();
    for (const r of this.ringers.values()) r.stop();
    this.ringers.clear();
    this.calls.destroy();
    this.gps.destroy();
    this.camera.close();
    if (this.contactsTimer) clearInterval(this.contactsTimer);
  }

  // ── out of the pocket and back ───────────────────────────────────────────
  setOpen(open: boolean) {
    const p = phone.get();
    if (p.open === open) return;
    if (open) {
      // (mouse look on: the pointer shown while it's out — and locked again when it's put away)
      this.relook = !!this.ctl.tp?.looking;
      this.ctl.tp?.setLook(false);
      void this.loadContacts();
      // an incoming call or a peeked text opens straight to it
      const peek = p.peek;
      const stack: Screen[] = p.call
        ? [{ app: "home" }, { app: "call" }]
        : peek?.thread
          ? [{ app: "home" }, { app: "messages" }, { app: "messages", view: "thread", arg: String(peek.thread) }]
          : p.stack;
      if (peek?.thread) void this.loadMessages(peek.thread);
      if (!p.booted) {
        // the first time this session: the portal opens first
        phone.set({ open: true, booted: true, stack: [{ app: "boot" }], sel: 0, peek: null });
        ui("boot", 0.8);
        setTimeout(() => {
          const now = phone.get();
          if (top(now).app === "boot")
            phone.set({ stack: now.call ? [{ app: "home" }, { app: "call" }] : stack, sel: 0 });
        }, 1900);
      } else {
        phone.set({ open: true, stack, sel: 0, peek: null });
        ui("open", 0.7);
      }
    } else {
      phone.set({ open: false, peek: null });
      ui("close", 0.6);
      if (p.camera) this.camera.close();
      const h = hud.get();
      if (this.relook && !h.menu && !h.panel.kind && !h.build.on) this.ctl.tp?.resumeLook();
      this.relook = false;
    }
    this.pose();
  }

  // what my body does with it (others see it): on a voice call with it put away, an earbud
  pose() {
    const p = phone.get();
    const c = p.call;
    let s: PhoneState = "";
    if (p.camera) s = p.camera.mode === "selfie" ? "selfie" : "photo";
    else if (c && c.phase === "live" && !c.vortex)
      s = c.camOn || c.video ? "video" : !p.open ? "bud" : c.speaker ? "text" : "call";
    else if (c && c.phase === "live") s = p.open ? "call" : "bud";
    else if (p.open) s = "text";
    if (this.lastPose === s) return;
    this.lastPose = s;
    this.ctl.send("phone:state", { state: s });
  }
  private lastPose: PhoneState | "?" = "?";
  private relook = false; // mouse look was on when it came out

  // ── screens ──────────────────────────────────────────────────────────────
  go(s: Screen) {
    const p = phone.get();
    if (s.app === "camera") return void this.camera.open();
    phone.set({ stack: [...p.stack, s], sel: 0 });
    ui("tap", 0.6);
  }
  home() {
    phone.set({ stack: [{ app: "home" }], sel: 0 });
  }
  open(app: AppId) {
    if (app === "home") return this.home();
    this.go({ app });
  }
  // something on the screen that Back closes first (a chat's photo tray)
  private backFirst: (() => boolean) | null = null;
  interceptBack(f: () => boolean) {
    this.backFirst = f;
    return () => {
      if (this.backFirst === f) this.backFirst = null;
    };
  }
  back() {
    const p = phone.get();
    if (p.camera) return this.camera.close();
    if (this.backFirst?.()) return;
    if (p.stack.length <= 1 || top(p).app === "boot") return this.setOpen(false);
    if (top(p).app === "call" && p.call && p.call.phase !== "ended") {
      // the call goes on behind; back to where I was
      phone.set({ stack: p.stack.slice(0, -1), sel: 0 });
      return;
    }
    phone.set({ stack: p.stack.slice(0, -1), sel: 0 });
    ui("back", 0.6);
  }

  // The keyboard, while the phone is out (the controller asks first): true
  // when the phone took the key.
  key(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const k = e.key;
    if (phone.get().camera) return this.camera.key(e);
    if (k === "Escape") {
      this.setOpen(false);
      return true;
    }
    const nav: Record<string, Nav> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "enter",
      Backspace: "back",
    };
    const n = nav[k];
    if (!n) return false;
    if (e.repeat && (n === "enter" || n === "back")) return true;
    for (const f of this.navs) f(n);
    return true;
  }
  onNav(f: (n: Nav) => void) {
    this.navs.add(f);
    return () => {
      this.navs.delete(f);
    };
  }

  // ── settings ─────────────────────────────────────────────────────────────
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;
  async loadSettings() {
    try {
      const r = await phoneApi.me();
      phone.set({ settings: parsePhoneSettings(r.settings), settingsLoaded: true });
    } catch {
      phone.set({ settingsLoaded: true });
    }
    this.sendPrefs();
  }
  setSettings(patch: Partial<PhoneSettings>) {
    const settings = parsePhoneSettings({ ...phone.get().settings, ...patch });
    phone.set({ settings });
    this.sendPrefs();
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.settingsTimer = setTimeout(() => {
      phoneApi.saveSettings(settings).catch(() => this.note(tr("phOffline")));
    }, 600);
  }
  private sendPrefs() {
    const s = phone.get().settings;
    this.ctl.send("phone:prefs", { case: s.case, ringtone: s.ringtone });
  }
  settingsNow(): PhoneSettings {
    return phone.get().settings;
  }
  ringtoneFor(uid: number): Ringtone {
    const s = phone.get().settings;
    return s.tones[String(uid)] ?? s.ringtone;
  }
  sleeping(): boolean {
    return hud.get().me?.status === "dnd";
  }

  note(text: string, ms = 2600) {
    phone.set({ note: text });
    setTimeout(() => {
      if (phone.get().note === text) phone.set({ note: "" });
    }, ms);
  }

  // ── the team ─────────────────────────────────────────────────────────────
  async loadContacts(force = false) {
    const p = phone.get();
    if (!force && Date.now() - p.contactsAt < 8000) return;
    phone.set({ contactsAt: Date.now() });
    try {
      const contacts = await phoneApi.contacts();
      phone.set({ contacts });
    } catch {
      // keep what we had; the people in this room still show from the world
    }
  }
  contact(uid: number) {
    return phone.get().contacts.find((c) => c.uid === uid) ?? null;
  }
  nameOf(uid: number | null): string {
    if (uid === null || uid === 0) return "Vortex";
    if (uid === phone.get().me.uid) return tr("phYou");
    return this.contact(uid)?.name ?? this.ctl.personByUid(uid)?.name ?? this.known(uid)?.name ?? "…";
  }
  avatarOf(uid: number | null): string {
    if (uid === null || uid === 0) return "vortex";
    if (uid === phone.get().me.uid) return phone.get().me.avatar;
    return this.ctl.personByUid(uid)?.avatar ?? this.contact(uid)?.avatar ?? this.known(uid)?.avatar ?? "{}";
  }
  // someone I'm in a thread with (maybe not in my contacts)
  private known(uid: number) {
    for (const t of phone.get().threads) {
      const w = t.who[String(uid)];
      if (w) return w;
    }
    return null;
  }

  // ── my phone book: people I added by their user id ───────────────────────
  isContact(uid: number): boolean {
    return phone.get().contacts.some((c) => c.uid === uid);
  }
  lookup(uid: number) {
    return phoneApi.lookup(uid);
  }
  async addContact(uid: number): Promise<boolean> {
    try {
      const c = await phoneApi.addContact(uid);
      phone.set((s) => ({ contacts: [...s.contacts.filter((x) => x.uid !== c.uid), c] }));
      this.gps.contactsChanged();
      ui("connect", 0.5);
      return true;
    } catch {
      this.note(tr("phOffline"));
      return false;
    }
  }
  async removeContact(uid: number) {
    phone.set((s) => ({ contacts: s.contacts.filter((x) => x.uid !== uid) }));
    phoneApi
      .removeContact(uid)
      .then(() => this.gps.contactsChanged())
      .catch(() => this.note(tr("phOffline")));
  }

  // ── threads and texts ────────────────────────────────────────────────────
  async loadThreads() {
    try {
      const threads = await phoneApi.threads();
      phone.set({ threads: sortThreads(threads), threadsLoaded: true });
    } catch {
      phone.set({ threadsLoaded: true });
    }
  }
  thread(id: number): Thread | null {
    return phone.get().threads.find((t) => t.id === id) ?? null;
  }
  threadName(t: Thread): string {
    if (t.kind === "vortex") return "Vortex";
    if (t.kind === "direct") return this.nameOf(t.members[0] ?? 0);
    return t.name;
  }
  async loadMessages(thread: number, older = false) {
    const have = phone.get().msgs[thread] ?? [];
    const before = older ? have.find((m) => m.id > 0)?.id : undefined;
    try {
      const r = await phoneApi.messages(thread, before);
      phone.set((s) => {
        const prev = older ? (s.msgs[thread] ?? []) : (s.msgs[thread] ?? []).filter((m) => m.id < 0);
        const merged = mergeMsgs([...r.messages, ...prev]);
        return { msgs: { ...s.msgs, [thread]: merged }, more: { ...s.more, [thread]: r.more } };
      });
    } catch {
      this.note(tr("phOffline"));
    }
  }
  // a thread with these people (made if new), then open it
  async openThreadWith(members: number[], name?: string) {
    if (members.length === 1 && members[0] === 0) return this.openThread(await this.vortexThread());
    try {
      const t = await phoneApi.open(members, name);
      phone.set((s) => ({ threads: sortThreads([t, ...s.threads.filter((x) => x.id !== t.id)]) }));
      this.openThread(t.id);
    } catch {
      this.note(tr("phOffline"));
    }
  }
  openThread(id: number) {
    const p = phone.get();
    const rest = p.stack.filter((s) => !(s.app === "messages" && s.view === "thread"));
    const base = rest.some((s) => s.app === "messages") ? rest : [...rest, { app: "messages" as const }];
    phone.set({ stack: [...base, { app: "messages", view: "thread", arg: String(id) }], sel: 0 });
    if (!p.open) this.setOpen(true);
    void this.loadMessages(id);
  }
  async vortexThread(): Promise<number> {
    const t = phone.get().threads.find((x) => x.kind === "vortex");
    if (t) return t.id;
    const v = await phoneApi.open([0]);
    phone.set((s) => ({ threads: sortThreads([v, ...s.threads.filter((x) => x.id !== v.id)]) }));
    return v.id;
  }

  async send(thread: number, body: string, opts: { photoId?: number; replyTo?: number | null } = {}) {
    const text = body.trim();
    if (!text && !opts.photoId) return;
    const t = this.thread(thread);
    if (t?.kind === "vortex") return this.vortex.text(thread, text);
    const local: Msg = {
      id: this.nextLocal--,
      thread,
      from: phone.get().me.uid,
      kind: opts.photoId ? "photo" : "text",
      body: text,
      photo: opts.photoId ? (phone.get().photos.find((p) => p.id === opts.photoId) ?? null) : null,
      call: null,
      reactions: {},
      replyTo: opts.replyTo ?? null,
      at: Date.now(),
      pending: true,
    };
    this.addMsg(local);
    ui("send", 0.7);
    try {
      const m = await phoneApi.send(thread, {
        body: text || undefined,
        photo_id: opts.photoId,
        reply_to: opts.replyTo,
      });
      this.replaceMsg(thread, local.id, m);
    } catch {
      phone.set((s) => ({
        msgs: {
          ...s.msgs,
          [thread]: (s.msgs[thread] ?? []).map((x) => (x.id === local.id ? { ...x, pending: false, failed: true } : x)),
        },
      }));
      ui("error", 0.6);
    }
  }
  retry(m: Msg) {
    phone.set((s) => ({ msgs: { ...s.msgs, [m.thread]: (s.msgs[m.thread] ?? []).filter((x) => x.id !== m.id) } }));
    void this.send(m.thread, m.body, { photoId: m.photo?.id, replyTo: m.replyTo });
  }
  addMsg(m: Msg) {
    phone.set((s) => {
      const list = mergeMsgs([...(s.msgs[m.thread] ?? []), m]);
      const threads = s.threads.map((t) => (t.id === m.thread ? { ...t, last: m } : t));
      return { msgs: { ...s.msgs, [m.thread]: list }, threads: sortThreads(threads) };
    });
  }
  private replaceMsg(thread: number, localId: number, m: Msg) {
    phone.set((s) => {
      const list = mergeMsgs([...(s.msgs[thread] ?? []).filter((x) => x.id !== localId && x.id !== m.id), m]);
      const threads = s.threads.map((t) => (t.id === thread ? { ...t, last: m } : t));
      return { msgs: { ...s.msgs, [thread]: list }, threads: sortThreads(threads) };
    });
  }
  // the thread on screen: everything in it is read
  markRead(thread: number) {
    const list = phone.get().msgs[thread] ?? [];
    const last = [...list].reverse().find((m) => m.id > 0);
    const t = this.thread(thread);
    if (!t || !last || (t.unread === 0 && (t.readAt[String(phone.get().me.uid)] ?? 0) >= last.id)) return;
    phone.set((s) => ({
      threads: s.threads.map((x) =>
        x.id === thread ? { ...x, unread: 0, readAt: { ...x.readAt, [String(s.me.uid)]: last.id } } : x,
      ),
    }));
    phoneApi.read(thread, last.id).catch(() => {});
  }
  typing(thread: number) {
    const now = Date.now();
    if (now - (this.typingSent.get(thread) ?? 0) < 3000 || this.thread(thread)?.kind === "vortex") return;
    this.typingSent.set(thread, now);
    phoneApi.typing(thread).catch(() => {});
  }
  async react(m: Msg, e: string) {
    const me = phone.get().me.uid;
    const had = (m.reactions[e] ?? []).includes(me);
    const local = {
      ...m.reactions,
      [e]: had ? (m.reactions[e] ?? []).filter((u) => u !== me) : [...(m.reactions[e] ?? []), me],
    };
    this.setReactions(m.thread, m.id, local);
    ui("toggle", 0.5);
    try {
      const r = await phoneApi.react(m.id, e);
      this.setReactions(m.thread, m.id, r.reactions);
    } catch {
      this.setReactions(m.thread, m.id, m.reactions);
    }
  }
  private setReactions(thread: number, id: number, reactions: Record<string, number[]>) {
    phone.set((s) => ({
      msgs: { ...s.msgs, [thread]: (s.msgs[thread] ?? []).map((x) => (x.id === id ? { ...x, reactions } : x)) },
    }));
  }

  // ── live, from the API through the world-server (phone:live) ─────────────
  onLive(raw: Record<string, unknown>) {
    const e = typeof raw?.type === "string" ? liveOf(raw as { type: string } & Record<string, unknown>) : null;
    if (e) this.live(e);
  }
  private live(e: NonNullable<ReturnType<typeof liveOf>>) {
    const me = phone.get().me.uid;
    if (e.type === "message") {
      const m = e.message;
      if (e.thread)
        phone.set((s) => ({
          threads: sortThreads([e.thread as Thread, ...s.threads.filter((t) => t.id !== m.thread)]),
        }));
      else if (!this.thread(m.thread)) void this.loadThreads();
      if (m.from === me && m.kind !== "call") return this.replaceMsg(m.thread, 0, m);
      const onScreen = this.onScreen(m.thread);
      this.addMsg(m);
      phone.set((s) => ({
        typing: { ...s.typing, [m.thread]: { uid: 0, until: 0 } },
        threads: s.threads.map((t) =>
          t.id === m.thread && !onScreen && m.from !== me ? { ...t, unread: t.unread + 1 } : t,
        ),
      }));
      if (onScreen) this.markRead(m.thread);
      else if (m.from !== me) this.arrived(m);
    } else if (e.type === "typing") {
      if (e.uid !== me)
        phone.set((s) => ({ typing: { ...s.typing, [e.thread]: { uid: e.uid, until: Date.now() + 5000 } } }));
    } else if (e.type === "read") {
      phone.set((s) => ({
        threads: s.threads.map((t) =>
          t.id === e.thread ? { ...t, readAt: { ...t.readAt, [String(e.uid)]: e.upto } } : t,
        ),
      }));
    } else if (e.type === "react") {
      this.setReactions(e.thread, e.message, e.reactions);
    } else if (e.type === "thread") {
      phone.set((s) => ({ threads: sortThreads([e.thread, ...s.threads.filter((t) => t.id !== e.thread.id)]) }));
    }
  }
  private onScreen(thread: number): boolean {
    const p = phone.get();
    const t = top(p);
    return p.open && t.app === "messages" && t.view === "thread" && Number(t.arg) === thread;
  }
  // a text came in: the tone, and the phone peeks up if it's away
  arrived(m: Msg) {
    const t = this.thread(m.thread);
    if (t?.muted) return;
    const sleeping = this.sleeping();
    if (!sleeping) textTone(phone.get().settings.textTone, 0.9);
    const missed = m.kind === "call";
    const body =
      m.kind === "photo" ? tr("phPhoto") : missed ? tr(m.call?.video ? "phMissedVideo" : "phMissed") : m.body;
    const title =
      t && t.kind !== "direct" && t.kind !== "vortex"
        ? `${this.nameOf(m.from)} · ${this.threadName(t)}`
        : this.nameOf(m.from);
    this.peek({
      kind: m.from === null ? "vortex" : missed ? "missed" : "text",
      title,
      body,
      avatar: this.avatarOf(m.from),
      thread: m.thread,
    });
  }
  peek(p: Omit<NonNullable<ReturnType<typeof phone.get>["peek"]>, "key" | "at">) {
    if (phone.get().open) return;
    phone.set({ peek: { ...p, key: Date.now(), at: Date.now() } });
    if (this.peekTimer) clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => phone.set({ peek: null }), 4200);
  }

  async setMuted(thread: number, muted: boolean) {
    phone.set((s) => ({ threads: s.threads.map((t) => (t.id === thread ? { ...t, muted } : t)) }));
    phoneApi.editThread(thread, { muted }).catch(() => {});
  }

  // ── calls I made, missed, took (Recents) ─────────────────────────────────
  async loadRecents() {
    try {
      const list = await phoneApi.calls();
      phone.set({
        recents: list
          .filter((c) => c.message.call)
          .map((c) => ({
            id: c.message.id,
            at: c.message.at,
            peers: c.peers,
            call: c.message.call as NonNullable<Msg["call"]>,
          })),
      });
    } catch {}
  }
  // "Remind me": call them back in 10 minutes
  remind(uid: number, name: string) {
    this.note(tr("phRemindSet"));
    setTimeout(() => {
      this.peek({ kind: "info", title: tr("phRemind").replace("{name}", name), body: "☎", avatar: this.avatarOf(uid) });
      textTone(phone.get().settings.textTone, 0.8);
    }, 10 * 60_000);
  }
  // the keypad's secret numbers (shared SECRET_NUMBERS): the lore
  secretNumber(kind: string) {
    this.vortex.secret(kind);
  }

  // ── photos ───────────────────────────────────────────────────────────────
  async loadPhotos(force = false) {
    if (phone.get().photosLoaded && !force) return;
    try {
      const photos = await phoneApi.photos();
      phone.set((s) => ({ photos: [...photos, ...s.photos.filter((p) => p.id < 0)], photosLoaded: true }));
    } catch {
      phone.set({ photosLoaded: true });
    }
  }
  async deletePhoto(id: number) {
    try {
      await phoneApi.deletePhoto(id);
      phone.set((s) => ({ photos: s.photos.filter((p) => p.id !== id) }));
      const st = phone.get().settings;
      if (st.wallpaper === `photo:${id}`) this.setSettings({ wallpaper: "portal" });
      if (st.lockWallpaper === `photo:${id}`) this.setSettings({ lockWallpaper: "portal" });
    } catch {
      this.note(tr("phOffline"));
    }
  }
  // a photo / video from a thread: open it (it may be someone else's)
  viewPhoto(p: PhotoRef) {
    phone.set({ viewing: p });
    this.go({ app: "gallery", view: "photo", arg: String(p.id) });
  }
  // someone else's: a copy in my own Gallery
  async keepPhoto(p: PhotoRef) {
    try {
      const mine = await phoneApi.keep(p.id);
      phone.set((s) => ({ photos: [mine, ...s.photos.filter((x) => x.id !== mine.id)] }));
      this.note(tr("phSaved"), 1600);
      return mine;
    } catch {
      this.note(tr("phSaveFailed"));
      return null;
    }
  }
  markSent(id: number) {
    phone.set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, sent: true } : p)) }));
    phoneApi.markSent(id).catch(() => {});
  }

  // Vortex said something to me in the world: it lands in his thread too
  vortexLine(text: string) {
    void this.vortex.line(text);
  }

  // ── the world: other phones ringing near me, photo flashes ───────────────
  private frame() {
    const room = this.ctl.room;
    const players = room?.state?.players;
    if (!players || !this.ctl.map) return;
    const meSid = room?.sessionId;
    const meP = meSid ? players.get(meSid) : null;
    const seen = new Set<string>();
    players.forEach(
      (
        p: { ringing: boolean; tone: string; x: number; y: number; shotAt: number; area: string; status: string },
        sid: string,
      ) => {
        if (sid !== meSid && p.ringing && meP) {
          seen.add(sid);
          const g = hearingGain(this.ctl.map, meP, p);
          const d = Math.hypot(p.x - meP.x, p.y - meP.y);
          const gain = Math.max(g, d < 2 ? 0.6 : 0) * 0.55;
          let r = this.ringers.get(sid);
          if (!r || r.tone !== p.tone) {
            r?.stop();
            r = new Ringer(p.tone as Ringtone, gain, stereoPan(meP, p));
            this.ringers.set(sid, r);
          } else r.set(gain, stereoPan(meP, p));
        }
        // someone took a photo near me: the flash and the shutter
        const last = this.shots.get(sid);
        if (p.shotAt && last !== p.shotAt) {
          this.shots.set(sid, p.shotAt);
          if (last !== undefined && Date.now() - p.shotAt < 3000) {
            this.ctl.flashPerson(sid);
            if (sid !== meSid && meP) {
              const g = hearingGain(this.ctl.map, meP, p);
              if (g > 0.05) ui("shutter", g * 0.6);
            }
          }
        }
      },
    );
    for (const [sid, r] of this.ringers)
      if (!seen.has(sid)) {
        r.stop();
        this.ringers.delete(sid);
      }
    this.calls.frame();
    this.gps.frame();
  }
}

function sortThreads(ts: Thread[]): Thread[] {
  const byId = new Map<number, Thread>();
  for (const t of ts) if (!byId.has(t.id)) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => {
    // the newest conversation first (Messages pins the space's thread on top)
    const ka = a.last?.at ?? 0;
    const kb = b.last?.at ?? 0;
    return kb - ka;
  });
}
function mergeMsgs(list: Msg[]): Msg[] {
  const by = new Map<number, Msg>();
  for (const m of list) by.set(m.id, m);
  return [...by.values()].sort((a, b) => (a.id < 0 || b.id < 0 ? a.at - b.at : a.id - b.id)).slice(-400);
}

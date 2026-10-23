"use client";

import type { ServerMessages } from "@yutopia/shared";
import type { GpsFriend } from "@yutopia/shared/phone";
import { offRoute, type Place, type RouteMode, route, routeOver } from "@yutopia/shared/route";
import { grounds, loadGrounds } from "../grounds-load";
import type { Phone } from ".";
import { ui } from "./sounds";
import { type GpsTarget, type GpsView, phone } from "./store";

// The GPS (docs/plan/37-the-gps.md): where I'm going and the route there,
// followed as I go (off it by more than a little: a new one), arriving; the
// contacts sharing where they are (asked for while the map's open or I'm on my
// way to one of them); and whether I share (my phone's setting, told to the world).

const OFF = { foot: 14, car: 22 }; // m off the route: route again
const THERE = { foot: 7, car: 14 }; // m from the end: arrived
const TICK_MS = 250;
const ASK_MS = 1000; // the friends' positions, while they're wanted
const SHARE_MS = 20_000; // my sharing, said again (the world forgets it when I leave)

export class Gps {
  private tickAt = 0;
  private askAt = 0;
  private shareAt = 0;
  private routedAt = 0;
  private shared: boolean | null = null;
  private friendAt: [number, number] | null = null; // where the friend I'm going to was when I last routed
  private guide: import("./gps-guide").Guide | null = null;
  private guideLoading = false;

  constructor(private readonly ph: Phone) {}

  destroy() {
    this.guide?.destroy();
    this.guide = null;
  }

  private set(patch: Partial<GpsView>) {
    phone.set((s) => ({ gps: { ...s.gps, ...patch } }));
  }
  private where(): [number, number] {
    const w = this.ph.ctl.gpsWhere();
    return [w.x, w.z];
  }

  // ── going somewhere ──────────────────────────────────────────────────────
  go(target: GpsTarget, mode: RouteMode = phone.get().gps.mode) {
    this.set({ target, mode, arrived: 0, at: 0, next: 1 });
    this.friendAt = target.friend ? target.p : null;
    ui("tap", 0.5);
    // (the Grounds, loaded for the world: the routes go over them)
    void loadGrounds().then(() => this.reroute());
  }
  goPlace(p: Place, mode?: RouteMode) {
    this.go({ key: p.key, name: p.name, p: p.p }, mode);
  }
  goFriend(f: GpsFriend, mode?: RouteMode) {
    this.go({ key: `f:${f.uid}`, name: f.name, p: [f.x, f.z], friend: f.uid }, mode);
  }
  setMode(mode: RouteMode) {
    if (phone.get().gps.mode === mode) return;
    this.set({ mode });
    if (phone.get().gps.target) this.reroute();
  }
  end() {
    this.set({ target: null, route: null, at: 0, next: 1, rerouting: false, noRoute: false });
  }
  toggleNorth() {
    this.set({ northUp: !phone.get().gps.northUp });
  }

  private reroute() {
    const g = phone.get().gps;
    const G = grounds();
    if (!g.target || !G) return;
    routeOver(G);
    this.routedAt = Date.now();
    const r = route(this.where(), g.target.p, g.mode);
    this.set({ route: r, at: 0, next: 1, rerouting: false, noRoute: !r });
  }

  // ── every frame (a few times a second) ───────────────────────────────────
  frame() {
    const now = Date.now();
    if (now - this.tickAt < TICK_MS) return;
    this.tickAt = now;
    this.share(now);
    this.ask(now);
    this.follow(now);
    this.drawGuide();
  }

  private follow(now: number) {
    const g = phone.get().gps;
    if (g.arrived && now - g.arrived > 4000) {
      this.set({ arrived: 0 });
      if (g.target && !g.route) this.set({ target: null });
    }
    if (!g.target) return;
    // a friend moves: the route follows them (now and then)
    if (g.target.friend) {
      const f = g.friends.find((x) => x.uid === g.target?.friend);
      if (
        f &&
        this.friendAt &&
        Math.hypot(f.x - this.friendAt[0], f.z - this.friendAt[1]) > 10 &&
        now - this.routedAt > 3000
      ) {
        this.friendAt = [f.x, f.z];
        this.set({ target: { ...g.target, p: [f.x, f.z] } });
        return this.reroute();
      }
    }
    const r = g.route;
    const me = this.where();
    if (!r) {
      // no way there yet (a car where no road goes): try again now and then
      if (now - this.routedAt > 5000) this.reroute();
      return;
    }
    const end = r.pts[r.pts.length - 1];
    if (Math.hypot(me[0] - end[0], me[1] - end[1]) < THERE[g.mode]) {
      this.set({ arrived: now, route: null, target: null, rerouting: false });
      ui("connect", 0.7);
      return;
    }
    const o = offRoute(r, me);
    if (o.d > OFF[g.mode]) {
      if (!g.rerouting) this.set({ rerouting: true });
      if (now - this.routedAt > 1500) this.reroute();
      return;
    }
    const at = Math.max(g.at, o.at);
    let next = 1;
    while (next < r.steps.length - 1 && r.steps[next].at < at + 2) next++;
    if (Math.abs(at - g.at) > 0.5 || next !== g.next || g.rerouting) this.set({ at, next, rerouting: false });
  }

  // ── friends ──────────────────────────────────────────────────────────────
  // (wanted while the GPS is on screen, or I'm on my way to one)
  private ask(now: number) {
    const p = phone.get();
    const top = p.stack[p.stack.length - 1];
    const want = (p.open && top?.app === "maps") || !!p.gps.target?.friend;
    if (!want || now - this.askAt < ASK_MS) return;
    this.askAt = now;
    this.ph.ctl.send("gps:friends", {});
  }
  onFriends(m: ServerMessages["gps:friends"]) {
    this.set({ friends: m.friends });
  }

  // my sharing: told to the world when it changes, and now and then (it forgets me when I leave)
  private share(now: number) {
    const p = phone.get();
    if (!p.settingsLoaded) return;
    const on = p.settings.shareLocation;
    if (on === this.shared && (!on || now - this.shareAt < SHARE_MS)) return;
    this.shared = on;
    this.shareAt = now;
    this.ph.ctl.send("gps:share", { on });
  }
  /** My phone book changed: the world reads it again (if I share). */
  contactsChanged() {
    if (phone.get().settings.shareLocation) this.shareAt = 0;
  }

  // ── the guide in the world (the route on the ground, 3D or iso) ──────────
  private drawGuide() {
    const g = phone.get().gps;
    if (!g.route) {
      this.guide?.clear();
      return;
    }
    if (!this.guide) {
      if (this.guideLoading) return;
      this.guideLoading = true;
      void import("./gps-guide").then(({ Guide }) => {
        this.guide = new Guide(this.ph.ctl);
        this.guideLoading = false;
      });
      return;
    }
    this.guide.draw(g.route, g.at);
  }
}

import { lampWanted } from "@/lib/lamp";
import { mixer } from "../audio";
import type { WorldController } from "../controller";
import { hud } from "../store";
import { strikeKeys } from "../strike/flag";

/** What Input reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type InputHost = Pick<
  WorldController,
  | "skateRide"
  | "activeAt"
  | "arrival"
  | "build"
  | "buildKey"
  | "cable"
  | "cars"
  | "emote"
  | "focus"
  | "god"
  | "loadPlay"
  | "menu"
  | "phone"
  | "redo"
  | "room"
  | "session"
  | "stopped"
  | "syncLook"
  | "toggleCam"
  | "toggleGod"
  | "toggleMic"
  | "togglePhone"
  | "tp"
  | "undo"
  | "walker"
>;

export class Input {
  constructor(private readonly c: InputHost) {}

  // ── input ────────────────────────────────────────────────────────────────
  onKeyDown = (e: KeyboardEvent) => {
    this.c.activeAt = performance.now();
    // (the world's still being built behind the loading screen: nothing to do yet)
    if (hud.get().loading.on) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
      return;
    if (hud.get().pickArrival && e.key === "Escape") {
      e.preventDefault();
      return this.c.arrival.pickArrival(false);
    }
    // the action menu: a number picks, Esc closes; W S / A D / the arrows move the choice, E,
    // Enter or Space does it (docs/plan/56-the-controls.md C)
    const menu = hud.get().menu;
    if (menu) {
      const i = Number(e.key) - 1;
      const step = MENU_STEP[e.code] ?? 0;
      if (e.key === "Escape") this.c.menu.closeMenu();
      else if (Number.isInteger(i) && i >= 0 && menu.items[i]?.ok) this.c.menu.pickAction(menu.items[i].act);
      else if (step) this.c.menu.menuStep(step);
      else if ((e.code === "KeyE" || e.code === "Enter" || e.code === "Space") && !e.repeat) {
        if (menu.sel !== undefined) this.c.menu.menuPick();
      } else return;
      e.preventDefault();
      return;
    }
    // [ ] (LB and the pad's ↑ ↓: the walker's): the next in the prompt's stack is the focus (build mode's
    // [ ] are its own: the walls' view)
    if (
      (e.code === "BracketLeft" || e.code === "BracketRight") &&
      !hud.get().build.on &&
      this.c.walker?.targets?.list.length
    ) {
      this.c.focus.cycleFocus(e.code === "BracketRight" ? 1 : -1);
      e.preventDefault();
      return;
    }
    // Tab tapped, the same (Shift+Tab: back), on its release; held, the dark's look at the pockets
    // (build mode's Tab is its own)
    // (plan 114) the Strike Park's match: Tab held is its scoreboard (before the focus's own Tab)
    if (e.code === "Tab" && !hud.get().build.on && this.c.cars?.strikeKey(e)) {
      e.preventDefault();
      return;
    }
    if (e.code === "Tab" && !hud.get().build.on && !hud.get().panel.kind && !this.c.god?.on) {
      e.preventDefault();
      if (!e.repeat) {
        this.tabDown = { at: e.timeStamp, back: e.shiftKey };
        // (plan 125 F4a) held: GTA's wheel — on the desktop, on foot
        const down = this.tabDown;
        if (lampWanted())
          setTimeout(() => {
            if (this.tabDown !== down || !this.c.walker?.stepping || hud.get().menu || this.c.cars?.inCar()) return;
            // (it opens on what's drawn — let go without pointing elsewhere, nothing changes: GTA's)
            const g = hud.get().lamp.gun?.id ?? "";
            const at = WHEEL_OF[g] ?? 7;
            this.wheelFrom = at;
            hud.set((s) => ({ lamp: { ...s.lamp, wheel: true, wheelSel: at } }));
          }, TAB_TAP_MS);
      }
      return;
    }
    if (hud.get().cable && e.key === "Escape" && !hud.get().panel.kind) {
      e.preventDefault();
      return this.c.cable.dropCable();
    }
    // the phone: while it's out it takes the arrows, Enter, Backspace and Esc (WASD still walks)
    if (hud.get().phone.open && !hud.get().panel.kind && !hud.get().build.on && this.c.phone?.key(e)) {
      e.preventDefault();
      return;
    }
    if (hud.get().panel.kind && e.key !== "Escape") return;
    // (plan 125 phase 6) the new UI: Esc with nothing open is the pause menu (GTA's); the pointer's let go first
    if (
      e.key === "Escape" &&
      !e.repeat &&
      !hud.get().panel.kind &&
      hud.get().side === null &&
      !hud.get().build.on &&
      !this.c.god?.on &&
      !hud.get().strike?.me &&
      lampWanted()
    ) {
      e.preventDefault();
      // (the wheel open under it: let go, nothing taken)
      this.tabDown = null;
      hud.set((s) => ({ panel: { kind: "pause" }, lamp: { ...s.lamp, tab: "map", wheel: false } }));
      return;
    }
    // god mode: its camera's keys, its own (on foot in the draft: Esc goes back up)
    if (!hud.get().panel.kind && this.c.god?.key(e, true)) {
      e.preventDefault();
      return;
    }
    // on a board: its keys (docs/plan/103-the-skate.md F3a — E, R, F, Q, X are its own; W A S D and Space the
    // walker's too)
    if (this.c.skateRide && !e.metaKey && !e.ctrlKey) {
      const ate = this.c.skateRide.key(e, true);
      if (ate && this.c.skateRide.riding()) {
        e.preventDefault();
        return;
      }
    }
    // in a car: its controls (docs/plan/28-the-car.md, car/controls.ts)
    if (this.c.cars?.inCar() && !e.metaKey && !e.ctrlKey && this.c.cars.key(e, true)) {
      e.preventDefault();
      return;
    }
    // (plan 114) in the Strike Park's match: B buys, Tab the scoreboard, E held plants/defuses, G drops the charge
    if (!e.metaKey && !e.ctrlKey && !hud.get().build.on && this.c.cars?.strikeKey(e)) {
      e.preventDefault();
      return;
    }
    // (plan 93 S9) on foot by my own car: L locks it, or unlocks
    if (e.code === "KeyL" && !e.repeat && !e.metaKey && !e.ctrlKey && !hud.get().build.on && this.c.cars?.lockKey()) {
      e.preventDefault();
      return;
    }
    const key = e.key.toLowerCase();
    if (hud.get().build.on && (e.metaKey || e.ctrlKey) && key === "d") {
      e.preventDefault();
      this.c.build?.duplicate();
      return;
    }
    if (hud.get().build.on && (e.metaKey || e.ctrlKey) && (key === "z" || key === "y")) {
      e.preventDefault();
      if (key === "y" || e.shiftKey) this.c.redo();
      else this.c.undo();
      return;
    }
    // (Ctrl's the walk: held, the moving keys still move — Ctrl's other keys stay the browser's)
    const walking = e.ctrlKey && !e.metaKey && !e.altKey && !!this.c.walker?.controls.movesMe(e.code);
    if ((e.metaKey || e.ctrlKey) && !walking) return;
    if (this.c.buildKey(key)) {
      e.preventDefault();
      return;
    }
    // building: every other key is build mode's — the camera's, the mic, the zoom; nothing reaches the
    // body (it stands idle where it was: docs/plan/124-the-build-view.md, point 1)
    if (hud.get().build.on) {
      if (this.c.build?.camKey(e.code, true, e.shiftKey, e.repeat)) {
        e.preventDefault();
        return;
      }
      // (Space's default would press the last button clicked)
      if (e.code === "Space") e.preventDefault();
      if (e.repeat) return;
      else if (key === "m") void this.c.toggleMic();
      else if (key === "v") void this.c.toggleCam();
      else if (key === "+" || key === "=") this.c.tp?.lensPart.zoomBy(1 / 1.15);
      else if (key === "-") this.c.tp?.lensPart.zoomBy(1.15);
      // B again: Done (plan 124 — B opens it)
      else if (key === "b") hud.set((s) => ({ build: { ...s.build, on: false, mode: "hand", props: null } }));
      return;
    }
    // moving and jumping: the keys by where they are on the keyboard (input/bindings.ts)
    if (this.c.walker?.controls.world(e.code)) {
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") e.preventDefault();
      void mixer.resume();
      return;
    }
    if (e.repeat) return;
    if (key === "e") {
      // a tap on its release, the menu held (holdFrame)
      if (!this.c.focus.use) this.c.focus.use = { src: "key", at: performance.now(), done: false };
    } else if (key === "m") void this.c.toggleMic();
    else if (key === "v") void this.c.toggleCam();
    else if (key === "y") this.c.focus.swapCamera();
    else if (key === "p" && !hud.get().build.on) void this.c.togglePhone();
    else if (key === "o" && hud.get().isAdmin && !hud.get().build.on) void this.c.toggleGod();
    // B: build mode (plan 124; the battery is N now) — where I may build, not in God mode, not driving or in a match
    else if (key === "b" && hud.get().canBuild && !this.c.god?.on && !hud.get().build.on)
      hud.set((s) => ({ build: { ...s.build, on: true, mode: "hand" } }));
    // (plan 87: 1 the left hand, 2–5 the quick slots — the dark's, loaded for them; the emotes on 6–9: the four that
    // were on 5–8, the rest on the wheel)
    // (plan 125 F4a: the new UI's keys 1–8 are GTA's kinds; the emotes on its X wheel)
    // (not in a Strike Park match — CS's keys there; not over an action menu — its numbers pick)
    else if (key >= "1" && key <= "8" && lampWanted() && !strikeKeys.playing) {
      if (hud.get().lamp.wheel) hud.set((s) => ({ lamp: { ...s.lamp, wheelSel: Number(key) - 1 } }));
      else if (!hud.get().menu && !hud.get().panel.kind) this.c.walker?.kindKey(Number(key));
    } else if (key >= "1" && key <= "5") this.c.walker?.slotKey(Number(key) - 1);
    else if (key >= "6" && key <= "9") this.c.emote(Number(key) - 2);
    else if (key === "+" || key === "=") this.c.tp?.lensPart.zoomBy(1 / 1.15);
    else if (key === "-") this.c.tp?.lensPart.zoomBy(1.15);
  };

  tabDown: { at: number; back: boolean } | null = null;
  /** (plan 125) the wheel's kind when it opened: what was drawn */
  wheelFrom = -1;

  onKeyUp = (e: KeyboardEvent) => {
    // (the build camera's keys let go — always, so one held as build mode closes doesn't stick)
    this.c.build?.camKey(e.code, false, e.shiftKey);
    // (a board's keys let go: plan 103)
    this.c.skateRide?.key(e, false);
    if (e.key.toLowerCase() === "e" && this.c.focus.use?.src === "key") {
      const u = this.c.focus.use;
      this.c.focus.use = null;
      if (!u.done) this.c.focus.interact();
    }
    if (e.code === "Tab" && hud.get().lamp.wheel) {
      // (plan 125 F4a) the wheel let go: what it points at, taken
      this.tabDown = null;
      const sel = hud.get().lamp.wheelSel;
      hud.set((s) => ({ lamp: { ...s.lamp, wheel: false } }));
      if (sel !== this.wheelFrom && !hud.get().panel.kind) this.c.walker?.kindKey(sel + 1);
    } else if (e.code === "Tab" && this.tabDown) {
      const t = this.tabDown;
      this.tabDown = null;
      // (by the events' own times: a long frame between the two is no hold)
      if (e.timeStamp - t.at < TAB_TAP_MS) this.c.focus.cycleFocus(t.back ? -1 : 1);
    }
    if (this.c.god?.key(e, false)) return;
    this.c.walker?.controls.up(e.code);
    this.c.cars?.key(e, false);
  };

  onBlur = () => {
    this.tabDown = null;
    if (hud.get().lamp.wheel) hud.set((s) => ({ lamp: { ...s.lamp, wheel: false } }));
    this.c.walker?.clear();
    this.c.cars?.blur();
  };

  onFirstGesture = () => void mixer.resume();

  bindInput() {
    this.c.loadPlay();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onFirstGesture);
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("pagehide", this.onPage);
    window.addEventListener("pageshow", this.onPage);
  }

  // On the way out (a reload, the tab closed, another page): a goodbye, so the room
  // lets me go at once — without one it keeps a faded me for a reconnection, a ghost
  // (docs/plan/36-the-ghost.md). Twice, as neither always gets out before the page is
  // gone: a beacon (the room cuts my line as a leave, or gives up the seat kept for it)
  // and the socket's own consented close; my voice goes with it. Stopped with it;
  // back from the back/forward cache (pageshow): gone from the room, so in again anew.
  onPage = (e: PageTransitionEvent) => {
    if (e.type === "pageshow") return e.persisted && location.reload();
    this.c.stopped = true;
    const r = this.c.room;
    if (!r) return;
    navigator.sendBeacon(`${this.c.session?.worldUrl.replace(/^ws/, "http")}/bye`, r.reconnectionToken);
    r.connection.close(4000); // (and the socket's own: a consented leave — whichever gets there)
  };

  unbindInput() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onFirstGesture);
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("pagehide", this.onPage);
    window.removeEventListener("pageshow", this.onPage);
  }

  // back from another tab (maybe the lobby's avatar editor): pick up a saved look
  onFocus = () => {
    if (this.c.room && hud.get().phase === "ready") void this.c.syncLook();
  };
}

/** (plan 125 F4a) the wheel's kind (0-based: key − 1) of what's drawn — dark/index.ts KIND_IDS */
const WHEEL_OF: Record<string, number> = { revolver: 1, shotgun: 2, ak47: 3, sniper: 3, daybreak: 4 };
const TAB_TAP_MS = 250; // Tab let go sooner: a tap, the next in reach (the dark's TAB_PEEK_MS)

const MENU_STEP: Record<string, number> = {
  KeyW: -1,
  ArrowUp: -1,
  KeyA: -1,
  ArrowLeft: -1,
  KeyS: 1,
  ArrowDown: 1,
  KeyD: 1,
  ArrowRight: 1,
};

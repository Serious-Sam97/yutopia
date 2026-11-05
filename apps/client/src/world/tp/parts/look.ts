import type { ThirdPersonView } from "../view";

/** What MouseLook reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type MouseLookHost = Pick<
  ThirdPersonView,
  "buildPick" | "drag" | "events" | "mode" | "pointerPart" | "renderer"
>;

export class MouseLook {
  constructor(private readonly c: MouseLookHost) {}

  // ── mouse look ─────────────────────────────────────────────────────────────
  // The browser owns the lock: Esc, another window or tab let it go, and right
  // after Esc it refuses to lock again for a moment. `looking` follows it.
  looking = false;

  /** the pointer may be locked to the camera now (the controller's: nothing on screen wants it) */
  canLock: () => boolean = () => true;

  lookSens = 1; // × the base speed

  lookInvert = false;

  crosshair: HTMLDivElement | null = null;

  aimKey = "";

  aimDue = 0;

  setLook(on: boolean, quiet = false) {
    const c = this.c.renderer.domElement;
    if (!on) {
      if (document.pointerLockElement === c) document.exitPointerLock();
      return;
    }
    if (this.looking || this.c.buildPick.buildMode || !c.requestPointerLock || !this.canLock()) return;
    // raw mouse movement where there is (Chrome); a plain lock elsewhere (Firefox)
    const lock = c.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined;
    // a refusal: the promise says so (Chrome), or the error event (Firefox: no promise)
    const refused = () => {
      if (!quiet) this.c.events.lookRefused?.();
    };
    this.lockAsked = 0;
    try {
      const p = lock.call(c, { unadjustedMovement: true });
      if (!p?.catch) this.lockAsked = quiet ? 0 : 1;
      else
        p.catch(() => {
          if (document.pointerLockElement === c) return;
          const q = lock.call(c);
          if (q?.catch) q.catch(refused);
          else this.lockAsked = quiet ? 0 : 1;
        });
    } catch {
      this.lockAsked = quiet ? 0 : 1;
      lock.call(c);
    }
  }

  // Back to mouse look after something borrowed the pointer (the phone, the bag).
  // Chrome locks again without a click after letting go from code; where the
  // browser says no, the pointer just stays out (no toast: nobody asked).
  resumeLook() {
    this.setLook(true, true);
  }

  onLockChange = () => {
    const on = document.pointerLockElement === this.c.renderer.domElement;
    if (on === this.looking) return;
    this.looking = on;
    this.c.drag = null;
    this.c.renderer.domElement.style.cursor = "";
    this.showCrosshair();
    this.aimKey = "";
    if (!on) this.c.events.aim?.(null);
    this.c.events.look?.(on);
  };

  // the aim's dot: in first person only (in third person you see where you look)
  showCrosshair() {
    if (this.crosshair) this.crosshair.style.display = this.looking && this.c.mode === "first" ? "block" : "none";
  }

  lockAsked = 0;

  onLockError = () => {
    if (!this.lockAsked) return;
    this.lockAsked = 0;
    this.c.events.lookRefused?.();
  };

  // what the crosshair is on (a few times a second)
  aimAt() {
    const now = performance.now();
    if (now - this.aimDue < 80) return;
    this.aimDue = now;
    const r = this.c.renderer.domElement.getBoundingClientRect();
    this.c.pointerPart.setRay(r.left + r.width / 2, r.top + r.height / 2);
    const person = this.c.pointerPart.personAt();
    const object = person ? null : this.c.pointerPart.pickObject();
    const key = person ? `p${person}` : object ? `o${object}` : "";
    if (key === this.aimKey) return;
    this.aimKey = key;
    const x = this.crosshair;
    if (x) {
      x.style.background = key ? "#ffa630" : "#f6eedb";
      x.style.transform = key ? "scale(1.6)" : "";
    }
    this.c.events.aim?.(person ? { person } : object ? { object } : null);
  }
}

import type { WorldObjectDef } from "@yutopia/shared";
import { keysDay, parkedPose } from "@yutopia/shared/car";
import { bayById, bayId, bayLabel, claimable, type LotBay, lotLayout } from "@yutopia/shared/lot";
import { bayAt, boardsOf, postOf } from "@yutopia/shared/spot";
import { addStrings, trMaybe } from "@/lib/i18n";
import { type HudState, hud } from "../store";

// Someone's own bay (docs/plan/43-the-spot.md): standing in a plain bay of the lot, on foot, the
// prompt offers to claim it, or, in your own, to give it up (the server's features/spot.ts). In
// someone else's, nothing. With the cars (car/cars.ts asks it when there's no car to get into).

addStrings(
  {
    spotClaim: ["Claim this bay", "Reservar esta vaga"],
    spotFree: ["Give up this bay", "Liberar esta vaga"],
    spotNo_taken: ["It's someone else's bay", "Essa vaga é de outra pessoa"],
    spotNo_kind: ["That bay isn't for keeps", "Essa vaga não pode ser reservada"],
    spotNo_far: ["Stand in the bay first", "Fique dentro da vaga primeiro"],
    spotNo_busy: ["Get out of the car first", "Saia do carro primeiro"],
    spotNo_gone: ["There's no such bay", "Essa vaga não existe"],
  },
  "yutopia-car",
);
const t = (k: string) => trMaybe(k) ?? k;

export interface SpotPrompt {
  objectId: string;
  kind: "spot:claim" | "spot:free";
  label: string;
}

/** The lot's claimed bays as I go (read again a few times a second, not every frame), my own
 *  for the side panel (hud `myBay`). */
export class Spots {
  private lot = lotLayout();
  private boards = new Map<string, WorldObjectDef>();
  private at = -1e9;
  private mine: string | null = null;
  private carKey = "";

  /** The boards' posts (the building's coords): solids for the cars. */
  posts: { x: number; z: number }[] = [];
  /** where the pool cars stand (the building's coords): a bay with one in it is claimed from its end */
  private pool: { x: number; z: number }[] = [];

  /** Read the boards again (a few times a second at most). `off`: the ground floor's corner. */
  refresh(
    objects: () => Iterable<WorldObjectDef>,
    uid: number,
    off: { x: number; y: number },
    now: number,
    locate: (o: WorldObjectDef) => { x: number; z: number; where: string },
  ) {
    if (now - this.at < 300) return;
    this.at = now;
    this.boards = boardsOf(objects());
    this.posts = [...this.boards.values()].map((o) => postOf(o, off));
    this.pool = [];
    for (const o of objects()) {
      const p = o.props;
      if (o.kind !== "car" || p?.ownerId || p?.driven || p?.role === "show" || Number(p?.level ?? 0) !== 0) continue;
      const q = parkedPose(o);
      this.pool.push({ x: q.x + off.x, z: q.y + off.y });
    }
    let mine: string | null = null;
    for (const [id, o] of this.boards) if (Number(o.props?.ownerId) === uid) mine = id;
    if (mine !== this.mine) {
      this.mine = mine;
      const b = mine ? bayById(this.lot, mine) : null;
      hud.set({ myBay: b ? bayLabel(b) : null });
    }
    // my own car, and someone's keys I hold today (the side panel, someone's card: hud)
    let car: HudState["myCar"] = null;
    let keys: HudState["keys"] = null;
    const today = keysDay(Date.now());
    for (const o of objects()) {
      if (o.kind !== "car" || o.props?.retire || !o.props?.ownerId) continue;
      const p = o.props;
      const mine = Number(p.ownerId) === uid;
      const held = !mine && Number(p.lentTo) === uid && Number(p.lentDay) === today;
      if (!mine && !held) continue;
      // (where: in a bay of the lot, its label too)
      const at = locate(o);
      const bay = bayAt(this.lot, at.x, at.z);
      const where = bay ? `${at.where} · ${bayLabel(bay)}` : at.where;
      const loc = { id: o.id, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, where };
      if (mine)
        car = {
          ...loc,
          plate: String(p.plate ?? ""),
          model: String(p.model ?? "sedan"),
          lentTo: Number(p.lentTo) || 0,
          lentName: String(p.lentName ?? ""),
        };
      else keys = { ...loc, from: String(p.owner ?? ""), plate: String(p.plate ?? "") };
    }
    const key = JSON.stringify([car, keys]);
    if (key !== this.carKey) {
      this.carKey = key;
      hud.set({ myCar: car, keys });
    }
  }

  /** The bay with a pool car in it whose open end (x, z) is just out of: up to 1.2 into the aisle. */
  private mouthOf(x: number, z: number): LotBay | null {
    const l = this.lot;
    for (const b of l.bays) {
      const out = (x - (b.x + (b.dir * l.bayL) / 2)) * b.dir;
      if (out <= 0 || out > 1.2 || Math.abs(z - b.z) > l.bayW / 2 - 0.25) continue;
      if (this.pool.some((p) => Math.abs(p.x - b.x) < l.bayL / 2 && Math.abs(p.z - b.z) < l.bayW / 2)) return b;
    }
    return null;
  }

  /** Are these two points (the building's coords) in the same bay of the lot? */
  sameBay(ax: number, az: number, bx: number, bz: number): boolean {
    const a = bayAt(this.lot, ax, az);
    return !!a && a === bayAt(this.lot, bx, bz);
  }

  /** The prompt where I stand (`x`, `z`: the building's coords), or null. */
  prompt(x: number, z: number, uid: number): SpotPrompt | null {
    // (a little in from its lines: walking past along the aisle doesn't offer it; a bay with a pool
    // car in it — no standing in it — from its open end, a step out into the aisle)
    const b = bayAt(this.lot, x, z, 0.25) ?? this.mouthOf(x, z);
    if (!b || !claimable(b)) return null;
    const id = bayId(b);
    const o = this.boards.get(id);
    const label = `${t(o ? "spotFree" : "spotClaim")} · ${bayLabel(b)}`;
    if (!o) return { objectId: `bay-${id}`, kind: "spot:claim", label };
    return Number(o.props?.ownerId) === uid ? { objectId: o.id, kind: "spot:free", label } : null;
  }
}

/** Why the server said no, as a toast. */
export const spotNo = (why: string) => t(`spotNo_${why}`);

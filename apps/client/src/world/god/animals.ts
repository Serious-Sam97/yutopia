// God mode's animals (docs/plan/126-animal-life.md, F9c; docs/plan/127-default-nests.md): the draft's `animals`
// section drawn for the admin — each place a ring on the land (a herd's spot, a den's territory, a nest, a place kept
// empty, a pen's fence line) in its colour —, the land's own groups round the camera (dimmed: what the land makes
// there, F2a), and the dark's day nests round it (today's, God mode's own, the places kept clear: the `nests`
// section, F3b). The Animals tool: what's chosen in its panel held under the pointer, a click to put it down; a click
// on one picks it — the land's own too —, Delete takes it away, Move puts it where the next click is, the panel
// changes its species or how many (F5a: the land's one by its key, its trust kept).
import {
  type AnimalPlaceDef,
  animalPlacesOf,
  canBeAt,
  changedDefaults,
  FARM_PENS,
  isGeneratedKey,
  penRect,
  placeOfGroup,
} from "@yutopia/shared/animals/habitat";
import { ANIMALS, type AnimalKind } from "@yutopia/shared/animals/species";
import { dayOf, keptClear, type NestPlaceDef, nestPlacesOf } from "@yutopia/shared/dark/nests";
import { heightAt, landReady } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop, type Scene } from "three";
import { hud, toast } from "../store";

export interface AnimalsHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
  /** where the camera is over the land (the defaults and the day's nests are drawn round it) */
  focus(): { x: number; z: number } | null;
  /** ask the server what's round (x, z): `god:wild` (its answer comes to `told`) */
  ask(x: number, z: number): void;
}

type Kind = AnimalPlaceDef["kind"] | "land" | "dark" | "dnest" | "dclear";
const COLOUR: Record<Kind, number> = {
  herd: 0x7ad17a,
  den: 0xe0603a,
  nest: 0xe8c64a,
  empty: 0x9aa0a8,
  pen: 0xc9a06a,
  // (the land's own: dimmed — what it makes there, F2a)
  land: 0x4f7f62,
  // (the dark's: the day's, God mode's own, its places kept clear)
  dark: 0x8a2a3a,
  dnest: 0xd0304f,
  dclear: 0x6c5a8a,
};
/** How far round the camera the land's own and the day's nests are drawn (m), F6a. */
const NEAR = 500;

/** A ring (or a pen's rectangle) lying on the land. */
function ring(p: { x: number; z: number }, r: number, rect?: { x0: number; z0: number; x1: number; z1: number }): BufferGeometry {
  const pts: number[] = [];
  if (rect) {
    const c = [
      [rect.x0, rect.z0],
      [rect.x1, rect.z0],
      [rect.x1, rect.z1],
      [rect.x0, rect.z1],
    ];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i];
      const [bx, bz] = c[(i + 1) % 4];
      for (let k = 0; k < 12; k++) {
        const x = ax + ((bx - ax) * k) / 12;
        const z = az + ((bz - az) * k) / 12;
        pts.push(x, heightAt(x, z) + 0.25, z);
      }
    }
  } else {
    const n = Math.max(16, Math.min(96, Math.round(r * 2)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      pts.push(x, heightAt(x, z) + 0.25, z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return g;
}
const radiusOf = (p: AnimalPlaceDef) =>
  p.kind === "empty" ? (p.r ?? 60) : p.kind === "den" ? (p.r ?? ANIMALS[p.species ?? "wolf"].danger?.territory ?? 30) : 6;
/** A den's territory is drawn, but it's picked by its middle. */
const pickR = (p: AnimalPlaceDef) => Math.max(4, Math.min(12, radiusOf(p) * 0.2));
const nestR = (n: number) => 2 + n;

/** What's picked: one of the animals' places (the land's own, God mode's, a pen), or one of the dark's. */
type Picked = { of: "animal"; p: AnimalPlaceDef; land: boolean } | { of: "nest"; p: NestPlaceDef };

export class AnimalsTool {
  private root = new Group();
  private ghost: LineLoop | null = null;
  private drawnOf: GroundsEdits | null = null;
  private drawnSel: string | null = null;
  private drawnAt: { x: number; z: number } | null = null;
  private drawnLayers = "";
  private drawnVer = -1;
  /** what the ghost was drawn for (its kind, radius, spot): made again only when that changes */
  private ghostOf = "";
  private mats = new Map<number, LineBasicMaterial>();
  /** the land's own groups round the camera, as places (the server's answer to `god:wild`), by key */
  private land = new Map<string, AnimalPlaceDef>();
  /** today's dark nests round it (the server's), by id */
  private nests = new Map<string, { id: string; x: number; z: number; n: number }>();
  private nestsDay = -1;
  /** asked where, when; squares still being made there */
  private asked: { x: number; z: number; at: number; pending: number } | null = null;
  /** bumped when the server's told more: drawn again */
  private ver = 0;
  /** what's drawn now (for picking): the land's own shown, the day's nests shown */
  private shownLand: AnimalPlaceDef[] = [];

  constructor(
    private readonly h: AnimalsHost,
    scene: Scene,
  ) {
    scene.add(this.root);
  }

  dispose() {
    this.root.removeFromParent();
    this.clear();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
  hide() {
    this.root.visible = false;
    // (the Animals tool put away: a Move under way isn't waiting for a click any more)
    if (hud.get().god.animals.moving) hud.set({ god: { ...hud.get().god, animals: { ...hud.get().god.animals, moving: false } } });
  }

  private mat(c: number) {
    let m = this.mats.get(c);
    if (!m) {
      m = new LineBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 });
      this.mats.set(c, m);
    }
    return m;
  }
  private clear() {
    for (const c of [...this.root.children]) {
      (c as LineLoop).geometry.dispose();
      this.root.remove(c);
    }
    this.ghost = null;
    this.ghostOf = "";
  }
  private add(geo: BufferGeometry, colour: number, order = 5) {
    const l = new LineLoop(geo, this.mat(colour));
    l.renderOrder = order;
    this.root.add(l);
  }

  /** Ask the server what's round `at` (moved a way off since, or squares there still being made): it has the land's
   *  worker, the client's main thread doesn't make land chunks. */
  private askNear(at: { x: number; z: number }) {
    const now = performance.now();
    const a = this.asked;
    const far = !a || Math.hypot(at.x - a.x, at.z - a.z) > 120;
    if (a && now - a.at < (far ? 400 : 1500)) return;
    // (all told there: asked again only now and then — a publish changes the land, a new day the nests)
    if (!far && a && a.pending === 0 && now - a.at < 15_000 && dayOf(Date.now()) === this.nestsDay) return;
    this.asked = { x: at.x, z: at.z, at: now, pending: a?.pending ?? 1 };
    this.h.ask(at.x, at.z);
  }
  /** The server's answer: kept (round where it was asked), drawn again. */
  told(m: { x: number; z: number; land: AnimalPlaceDef[]; nests: { id: string; x: number; z: number; n: number }[]; pending: number }) {
    const day = dayOf(Date.now());
    if (day !== this.nestsDay) {
      this.nestsDay = day;
      this.nests.clear();
    }
    // (what's far from this answer let go; what's in its round and not in it, gone since — when it's whole)
    const inRound = (q: { x: number; z: number }) => Math.hypot(q.x - m.x, q.z - m.z) <= NEAR;
    const keys = new Set(m.land.map((p) => p.key));
    const ids = new Set(m.nests.map((n) => n.id));
    for (const [k, p] of this.land)
      if (Math.hypot(p.x - m.x, p.z - m.z) > NEAR * 2 || (m.pending === 0 && inRound(p) && !keys.has(k))) this.land.delete(k);
    for (const [k, n] of this.nests)
      if (Math.hypot(n.x - m.x, n.z - m.z) > NEAR * 2 || (m.pending === 0 && inRound(n) && !ids.has(k))) this.nests.delete(k);
    for (const p of m.land) this.land.set(p.key, p);
    for (const n of m.nests) this.nests.set(n.id, n);
    if (this.asked) this.asked.pending = m.pending;
    this.ver++;
  }

  /** Each frame: the draft's places drawn (made again when the draft changes); the one held at `under`. */
  frame(under: { x: number; z: number } | null, active: boolean) {
    this.root.visible = true;
    const d = this.h.draft();
    const a = hud.get().god.animals;
    const sel = a.sel;
    const at = this.h.focus() ?? under;
    if (at) this.askNear(at);
    const layers = `${a.layers.animals ? 1 : 0}${a.layers.dark ? 1 : 0}`;
    const moved = !this.drawnAt || !at || Math.hypot(at.x - this.drawnAt.x, at.z - this.drawnAt.z) > 40;
    if (d !== this.drawnOf || sel !== this.drawnSel || layers !== this.drawnLayers || this.ver !== this.drawnVer || moved) {
      this.drawnOf = d;
      this.drawnSel = sel;
      this.drawnLayers = layers;
      this.drawnVer = this.ver;
      this.drawnAt = at ? { ...at } : null;
      this.clear();
      const count = this.draw(d, sel, at, a.layers);
      const v = hud.get().god.animals.inView;
      if (v.land !== count.land || v.placed !== count.placed || v.dark !== count.dark)
        hud.set({ god: { ...hud.get().god, animals: { ...hud.get().god.animals, inView: count } } });
    }
    // (the one held: its ring made again only when it moves a step, or its kind or size changes)
    const r = a.kind === "empty" || a.kind === "den" || a.kind === "dclear" ? a.r : a.kind === "dnest" ? nestR(Math.max(1, Math.min(4, a.n))) : 6;
    const of = active && under ? `${a.kind}|${r}|${a.moving}|${round(under.x)}|${round(under.z)}` : "";
    if (of !== this.ghostOf) {
      this.ghostOf = of;
      if (this.ghost) {
        this.ghost.geometry.dispose();
        this.root.remove(this.ghost);
        this.ghost = null;
      }
      if (of && under) {
        this.ghost = new LineLoop(ring(under, a.moving ? 3 : r), this.mat(a.moving ? 0xffffff : COLOUR[a.kind]));
        this.ghost.renderOrder = 6;
        this.root.add(this.ghost);
      }
    }
  }

  /** The land's own as the draft leaves them, round `at`: those taken away, moved or changed, or in an empty place
   *  left out (the moved and changed are drawn where they are now, as God mode's). */
  private landNear(d: GroundsEdits, at: { x: number; z: number } | null): AnimalPlaceDef[] {
    if (!at) return [];
    const s = d.animals;
    const off = new Set([...(s?.remove ?? []), ...Object.keys(s?.change ?? {})]);
    const empties = animalPlacesOf(d).filter((p) => p.kind === "empty");
    const out: AnimalPlaceDef[] = [];
    for (const p of this.land.values()) {
      if (off.has(p.key) || Math.hypot(p.x - at.x, p.z - at.z) > NEAR) continue;
      if (empties.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < (e.r ?? 0))) continue;
      out.push(p);
    }
    return out;
  }
  private changedNear(d: GroundsEdits): AnimalPlaceDef[] {
    return changedDefaults(d).map(placeOfGroup);
  }
  /** Today's dark nests round `at` (the campus's, the far land's: the server's), those in a place kept clear left out. */
  private nestsNear(d: GroundsEdits, at: { x: number; z: number } | null): { x: number; z: number; n: number }[] {
    if (!at) return [];
    const places = nestPlacesOf(d);
    const out: { x: number; z: number; n: number }[] = [];
    for (const n of this.nests.values())
      if (Math.hypot(n.x - at.x, n.z - at.z) <= NEAR && !keptClear(places, n.x, n.z)) out.push(n);
    return out;
  }

  private draw(d: GroundsEdits, sel: string | null, at: { x: number; z: number } | null, layers: { animals: boolean; dark: boolean }) {
    const count = { land: 0, placed: 0, dark: 0 };
    this.shownLand = [];
    if (layers.animals) {
      const near = (q: { x: number; z: number }) => !!at && Math.hypot(q.x - at.x, q.z - at.z) <= NEAR;
      for (const p of animalPlacesOf(d)) {
        this.add(ring(p, radiusOf(p), p.kind === "pen" ? penRect(p) : undefined), p.key === sel ? 0xffffff : COLOUR[p.kind]);
        if (near(p)) count.placed++;
      }
      for (const p of this.changedNear(d)) {
        this.add(ring(p, radiusOf(p)), p.key === sel ? 0xffffff : COLOUR[p.kind]);
        if (near(p)) count.placed++;
      }
      this.shownLand = this.landNear(d, at);
      for (const p of this.shownLand) {
        this.add(ring(p, p.kind === "den" ? radiusOf(p) : 4), p.key === sel ? 0xffffff : COLOUR.land, 4);
        count.land++;
      }
    }
    if (layers.dark) {
      for (const n of this.nestsNear(d, at)) {
        this.add(ring(n, nestR(n.n)), COLOUR.dark, 4);
        count.dark++;
      }
      for (const p of nestPlacesOf(d)) {
        this.add(ring(p, p.kind === "clear" ? (p.r ?? 60) : nestR(p.n ?? 2)), p.key === sel ? 0xffffff : p.kind === "clear" ? COLOUR.dclear : COLOUR.dnest);
        if (p.kind === "nest" && !!at && Math.hypot(p.x - at.x, p.z - at.z) <= NEAR) count.dark++;
      }
    }
    return count;
  }

  /** The place at `at`, if there's one (God mode's first, then the land's own drawn). */
  private pickAt(at: { x: number; z: number }): Picked | null {
    const d = this.h.draft();
    const a = hud.get().god.animals;
    if (a.layers.dark)
      for (const p of nestPlacesOf(d)) {
        const r = p.kind === "clear" ? Math.max(4, Math.min(12, (p.r ?? 60) * 0.2)) : nestR(p.n ?? 2);
        if (Math.hypot(p.x - at.x, p.z - at.z) < r) return { of: "nest", p };
      }
    if (!a.layers.animals) return null;
    for (const p of [...animalPlacesOf(d), ...this.changedNear(d)]) {
      const hit =
        p.kind === "pen"
          ? at.x >= penRect(p).x0 && at.x <= penRect(p).x1 && at.z >= penRect(p).z0 && at.z <= penRect(p).z1
          : Math.hypot(p.x - at.x, p.z - at.z) < pickR(p);
      if (hit) return { of: "animal", p, land: isGeneratedKey(p.key) };
    }
    let best: AnimalPlaceDef | null = null;
    let bd = 6;
    for (const p of this.shownLand) {
      const q = Math.hypot(p.x - at.x, p.z - at.z);
      if (q < bd) {
        bd = q;
        best = p;
      }
    }
    return best ? { of: "animal", p: best, land: true } : null;
  }
  /** The picked one, as the draft has it now. */
  private picked(): Picked | null {
    const key = hud.get().god.animals.sel;
    if (!key) return null;
    const d = this.h.draft();
    const n = nestPlacesOf(d).find((p) => p.key === key);
    if (n) return { of: "nest", p: n };
    const p =
      animalPlacesOf(d).find((q) => q.key === key) ??
      this.changedNear(d).find((q) => q.key === key) ??
      (d.animals?.remove?.includes(key) ? undefined : this.land.get(key));
    return p ? { of: "animal", p, land: isGeneratedKey(p.key) } : null;
  }
  /** What's picked, for the panel: its kind, species, how many, young; whether it's the land's own. */
  pickedInfo(): { key: string; kind: Kind; species?: AnimalKind; n?: number; young?: number; land: boolean } | null {
    const p = this.picked();
    if (!p) return null;
    if (p.of === "nest") return { key: p.p.key, kind: p.p.kind === "clear" ? "dclear" : "dnest", n: p.p.n, land: false };
    return { key: p.p.key, kind: p.p.kind, species: p.p.species, n: p.p.n, young: p.p.young, land: p.land };
  }

  private setSel(key: string | null, moving = false) {
    const g = hud.get().god;
    hud.set({ god: { ...g, animals: { ...g.animals, sel: key, moving } } });
    this.drawnOf = null;
  }

  /** A click: moving the picked there; else one there picked; else the held kind put down. */
  click(at: { x: number; z: number } | null) {
    if (!at) return;
    const g = hud.get().god;
    if (g.animals.moving && g.animals.sel) {
      this.moveTo(at);
      return;
    }
    const hit = this.pickAt(at);
    if (hit) {
      this.setSel(hit.p.key);
      return;
    }
    const a = g.animals;
    const d = this.h.draft();
    if (a.kind === "dnest" || a.kind === "dclear") {
      const key = `nk:${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      const p: NestPlaceDef =
        a.kind === "dnest"
          ? { key, kind: "nest", x: round(at.x), z: round(at.z), n: Math.max(1, Math.min(4, a.n)) }
          : { key, kind: "clear", x: round(at.x), z: round(at.z), r: a.r };
      const s = d.nests ?? {};
      this.h.change({ ...d, nests: { ...s, add: [...(s.add ?? []), p] } });
      this.setSel(key);
      return;
    }
    const key = `an:${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    const p: AnimalPlaceDef =
      a.kind === "empty"
        ? { key, kind: "empty", x: round(at.x), z: round(at.z), r: a.r }
        : {
            key,
            kind: a.kind,
            species: a.species,
            x: round(at.x),
            z: round(at.z),
            n: a.n,
            ...(a.kind === "den" ? { r: a.r, young: a.young } : a.kind === "nest" ? { young: a.young } : {}),
          };
    const s = d.animals ?? {};
    this.h.change({ ...d, animals: { ...s, add: [...(s.add ?? []), p] } });
    this.setSel(key);
  }

  /** The picked one's next click puts it there (F5a). */
  startMove() {
    if (!this.picked()) return;
    this.setSel(hud.get().god.animals.sel, true);
  }

  /** Change the picked one: where it is, its species, how many, its young (the land's own: kept whole in the
   *  draft's `change` by its key — it stays its own if the land changes under it, F7a). */
  changePicked(o: { x?: number; z?: number; species?: AnimalKind; n?: number; young?: number }) {
    const p = this.picked();
    if (!p) return;
    const d = this.h.draft();
    if (p.of === "nest") {
      const s = d.nests ?? {};
      const next: NestPlaceDef = {
        ...p.p,
        ...(o.x !== undefined ? { x: round(o.x) } : {}),
        ...(o.z !== undefined ? { z: round(o.z) } : {}),
        ...(o.n !== undefined && p.p.kind === "nest" ? { n: Math.max(1, Math.min(4, o.n)) } : {}),
      };
      this.h.change({ ...d, nests: { ...s, add: (s.add ?? []).map((q) => (q.key === p.p.key ? next : q)) } });
      return;
    }
    const s = d.animals ?? {};
    const key = p.p.key;
    const fields: Partial<AnimalPlaceDef> = {
      ...(o.x !== undefined ? { x: round(o.x) } : {}),
      ...(o.z !== undefined ? { z: round(o.z) } : {}),
      ...(o.species ? { species: o.species } : {}),
      ...(o.n !== undefined ? { n: o.n } : {}),
      ...(o.young !== undefined ? { young: o.young } : {}),
    };
    if (p.land) {
      // (another species where it is: one that can be there — a swimmer's water isn't a deer's)
      if (o.species && o.species !== p.p.species && !canStand(o.species, o.x ?? p.p.x, o.z ?? p.p.z)) {
        toast(`A ${ANIMALS[o.species].label[0].toLowerCase()} can't be there`, "info", 2000);
        return;
      }
      // (whole: species, where, how many, young — so it stands on its own)
      const was = s.change?.[key] ?? {};
      const whole: Partial<AnimalPlaceDef> = { species: p.p.species, x: p.p.x, z: p.p.z, n: p.p.n, young: p.p.young, ...was, ...fields };
      if (p.p.kind === "den" && whole.r === undefined && p.p.r !== undefined && !fields.species) whole.r = p.p.r;
      if (fields.species && fields.species !== p.p.species) whole.r = undefined;
      this.h.change({ ...d, animals: { ...s, change: { ...(s.change ?? {}), [key]: whole } } });
      return;
    }
    if (p.p.kind === "pen") {
      // (a pen: moved by its near corner, its size kept)
      if (o.x === undefined || o.z === undefined) return;
      const r = penRect(p.p);
      const dx = round(o.x) - (r.x0 + r.x1) / 2;
      const dz = round(o.z) - (r.z0 + r.z1) / 2;
      const c = { ...(s.change?.[key] ?? {}), x: p.p.x + dx, z: p.p.z + dz, x1: (p.p.x1 ?? p.p.x) + dx, z1: (p.p.z1 ?? p.p.z) + dz };
      this.h.change({ ...d, animals: { ...s, change: { ...(s.change ?? {}), [key]: c } } });
      return;
    }
    // (one placed in a draft: changed where it's added)
    const added = (s.add ?? []).some((q) => q.key === key);
    if (added) this.h.change({ ...d, animals: { ...s, add: (s.add ?? []).map((q) => (q.key === key ? { ...q, ...fields } : q)) } });
    else this.h.change({ ...d, animals: { ...s, change: { ...(s.change ?? {}), [key]: { ...(s.change?.[key] ?? {}), ...fields } } } });
  }

  private moveTo(at: { x: number; z: number }) {
    const p = this.picked();
    // (the picked one gone meanwhile — undone, taken away —: not moving any more)
    if (!p) {
      this.setSel(null);
      return;
    }
    if (p.of === "animal" && p.land && p.p.species && !canStand(p.p.species, at.x, at.z)) {
      toast(`A ${ANIMALS[p.p.species].label[0].toLowerCase()} can't be there`, "info", 2000);
      return;
    }
    this.changePicked({ x: at.x, z: at.z });
    this.setSel(hud.get().god.animals.sel, false);
    toast("Moved", "info", 1200);
  }

  /** The picked one taken away. */
  removePicked() {
    const p = this.picked();
    if (!p) {
      this.setSel(null);
      return;
    }
    const d = this.h.draft();
    const key = p.p.key;
    if (p.of === "nest") {
      const s = d.nests ?? {};
      this.h.change({ ...d, nests: { ...s, add: (s.add ?? []).filter((q) => q.key !== key) } });
      this.setSel(null);
      toast(p.p.kind === "clear" ? "Clear place taken away" : "Nest taken away", "info", 1800);
      return;
    }
    const s = d.animals ?? {};
    const theLands = p.land || FARM_PENS.some((q) => q.key === key);
    const change = { ...(s.change ?? {}) };
    delete change[key];
    const next = theLands
      ? { ...s, change, remove: [...new Set([...(s.remove ?? []), key])] }
      : { ...s, change, add: (s.add ?? []).filter((q) => q.key !== key) };
    this.h.change({ ...d, animals: next });
    // (re-read: change() wrote the draft's counts, its undo, the first change's naming into the hud)
    this.setSel(null);
    toast(p.land ? "The land's own taken away" : p.p.kind === "pen" ? "Pen taken away" : "Place taken away", "info", 1800);
  }
}
const round = (v: number) => Math.round(v * 10) / 10;
/** Can `kind` be at (x, z), as far as this side knows: asked only where its land's made here (reading land that isn't
 *  makes its chunk on this thread, ~6 ms); not made, yes — the server checks again when the draft's published. */
const canStand = (kind: AnimalKind, x: number, z: number) => !landReady(x, z) || canBeAt(kind, x, z);

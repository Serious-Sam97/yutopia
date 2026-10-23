"use client";

import { pointAt, type Route } from "@yutopia/shared/route";
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import type { WorldController } from "../controller";
import { grounds } from "../grounds-load";

// the land's height (the Grounds the world loaded; flat until they're here)
const heightAt = (x: number, z: number) => grounds()?.heightAt(x, z) ?? 0;

// The GPS's guide in the world (docs/plan/37-the-gps.md § 5): the route ahead
// on the ground. In 3D a ribbon with chevrons, lying on the land; in iso a
// dotted line on the ground floor's land. Only the next stretch of it (and a
// little behind), drawn again as I go.

const AHEAD = 110; // m of the route ahead
const BEHIND = 4;
const STEP = 2; // m between the ribbon's samples
const LIFT = 0.12; // m over the land (no fighting the snow)
const CHEVRON_M = 3; // m a chevron
const CYAN = 0x00e5d0;
// the iso projection (shared iso.ts TILE_W / TILE_H, grid.ts ZPX_TILE — copied: a
// value from the shared index in a lazy chunk grows the world page)
const HW = 32;
const HH = 16;
const ZPX_TILE = 39.19;

export class Guide {
  private root: Group | null = null;
  private mesh: Mesh | null = null;
  private tpOf: unknown = null;
  private iso: ReturnType<NonNullable<WorldController["engine"]>["groundDrawing"]> | null = null;
  private isoOf: unknown = null;
  private drawn: { r: Route | null; at: number; level: number; ox: number } = { r: null, at: -1, level: -1, ox: 0 };
  isoDots = 0; // (the dots drawn in iso last time: e2e)

  constructor(private readonly ctl: WorldController) {}

  draw(r: Route, at: number) {
    const tp = this.ctl.tp;
    // the 3D view comes and goes (iso ↔ 3D): a new one, a new ribbon
    if (tp !== this.tpOf) {
      this.drop3d();
      this.tpOf = tp;
      this.drawn.r = null;
    }
    const engine = this.ctl.engine;
    if (engine !== this.isoOf) {
      this.iso?.destroy();
      this.iso = null;
      this.isoOf = engine;
      this.drawn.r = null;
    }
    // where the ground floor is from mine, every frame (the 3D view is in my floor's coords)
    if (tp && this.root) {
      const f = tp.groundsFrame();
      this.root.position.set(-f.x, f.y, -f.z);
      this.root.visible = f.visible;
    }
    const d = this.drawn;
    const ox = this.ctl.map?.ox ?? 0;
    if (d.r === r && Math.abs(d.at - at) < 2 && d.level === this.ctl.level && d.ox === ox) return;
    this.drawn = { r, at, level: this.ctl.level, ox };
    const pts: [number, number][] = [];
    const from = Math.max(0, at - BEHIND);
    const to = Math.min(r.dist, at + AHEAD);
    for (let m = from; m < to; m += STEP) pts.push(pointAt(r, m));
    pts.push(pointAt(r, to));
    if (tp) this.ribbon(pts, r.mode === "car" ? 2.6 : 1.3, from);
    if (engine) this.dots(pts);
  }

  clear() {
    if (this.mesh) this.mesh.visible = false;
    this.iso?.clear();
    this.isoDots = 0;
    this.drawn.r = null;
  }

  destroy() {
    this.drop3d();
    this.iso?.destroy();
    this.iso = null;
  }

  // ── 3D: a ribbon on the land, chevrons along it ──────────────────────────
  private ribbon(pts: [number, number][], w: number, from: number) {
    const tp = this.ctl.tp;
    if (!tp || pts.length < 2) return;
    if (!this.root) {
      this.root = new Group();
      this.root.name = "gps-guide";
      tp.scene.add(this.root);
      const f = tp.groundsFrame();
      this.root.position.set(-f.x, f.y, -f.z);
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let along = from;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      // across the way: left and right of the direction of travel
      const nx = (-dz / l) * (w / 2);
      const nz = (dx / l) * (w / 2);
      if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      for (const s of [-1, 1]) {
        const px = x + nx * s;
        const pz = z + nz * s;
        pos.push(px, heightAt(px, pz) + LIFT, pz);
        uv.push(s < 0 ? 0 : 1, along / CHEVRON_M);
      }
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    if (!this.mesh) {
      const mat = new MeshBasicMaterial({
        map: chevrons(),
        color: CYAN,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: 2, // (DoubleSide: seen from under a bridge's deck too)
      });
      this.mesh = new Mesh(geo, mat);
      this.mesh.renderOrder = 5;
      this.mesh.frustumCulled = false;
      this.root.add(this.mesh);
    } else {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    }
    this.mesh.visible = true;
  }

  private drop3d() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as MeshBasicMaterial).map?.dispose();
      (this.mesh.material as MeshBasicMaterial).dispose();
    }
    this.root?.removeFromParent();
    this.root = null;
    this.mesh = null;
  }

  // ── iso: dots on the ground floor's land ─────────────────────────────────
  private dots(pts: [number, number][]) {
    const engine = this.ctl.engine;
    if (!engine) return;
    this.iso ??= engine.groundDrawing();
    const g = this.iso;
    g.clear();
    this.isoDots = 0;
    // (only the ground floor has the land under it)
    if (this.ctl.level !== 0) return;
    const ox = this.ctl.map?.ox ?? 0;
    const oy = this.ctl.map?.oy ?? 0;
    for (let i = 0; i < pts.length; i++) {
      const [gx, gz] = pts[i];
      const x = gx - ox;
      const y = gz - oy;
      const sx = (x - y) * HW;
      const sy = (x + y) * HH - heightAt(gx, gz) * ZPX_TILE;
      g.ellipse(sx, sy, 7, 3.5).fill({ color: CYAN, alpha: i < 2 ? 0.35 : 0.85 });
    }
    this.isoDots = pts.length;
  }
}

// a chevron (pointing along +v: the way of travel) on a clear ground, repeated
let tex: CanvasTexture | null = null;
function chevrons(): CanvasTexture {
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const x = c.getContext("2d") as CanvasRenderingContext2D;
  x.fillStyle = "rgba(255,255,255,0.35)";
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = "#fff";
  x.lineWidth = 9;
  x.lineJoin = "round";
  x.beginPath();
  // (canvas y runs down; v runs up the texture: the point at the top)
  x.moveTo(10, 46);
  x.lineTo(32, 20);
  x.lineTo(54, 46);
  x.stroke();
  tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

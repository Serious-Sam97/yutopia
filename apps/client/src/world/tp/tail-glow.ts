import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";

// The tail lamps' red on the snow behind (docs/plan/44-the-night.md N2), brighter braking: a
// soft red patch on the ground, added light. `rear`: how far back the vehicle's tail is (its
// nose −x, the ground y 0); shown at its material's opacity.
let tailTex: CanvasTexture | null = null;
export function tailPatch(rear: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  if (!tailTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    tailTex = new CanvasTexture(c);
  }
  const mat = new MeshBasicMaterial({
    color: 0xff2a14,
    map: tailTex,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const patch = new Mesh(new PlaneGeometry(3.4, 2.8).rotateX(-Math.PI / 2), mat);
  patch.position.set(rear + 1.3, 0.04, 0);
  patch.renderOrder = 1;
  patch.visible = false;
  return patch;
}

/** (plan 98 phase 17) A lamp's light on the ground: a soft patch `w` × `l` (m) centred `x` along the vehicle (its nose
 *  −x), of `color`, added light; shown at its material's opacity. The headlamps' pool ahead of another car (only mine
 *  throws a real light), its reversing lamps' white behind. */
export function lampPatch(x: number, w: number, l: number, color: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const p = tailPatch(0);
  p.material.color.setHex(color);
  p.geometry.dispose();
  p.geometry = new PlaneGeometry(l, w).rotateX(-Math.PI / 2);
  p.position.set(x, 0.045, 0);
  return p;
}

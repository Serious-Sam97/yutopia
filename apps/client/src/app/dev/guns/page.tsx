"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The guns' review stills (docs/plan/32-the-arms.md, phase 0): the models from
// tp/guns3d.ts under a light like the world's. Dev only.
//   /dev/guns?shot=sheet          both guns: side on, closed; three-quarter, open
//   /dev/guns?shot=snow           lying on the snow by day, as dropped
//   /dev/guns?shot=ads-revolver   first person, down the sights (no arms yet: the sight picture)
//   /dev/guns?shot=ads-shotgun
//   /dev/guns?shot=hip-revolver   first person, at the hip
// window.__gunsReady once drawn.

export default function GunsSheet() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    let dispose = () => {};
    void (async () => {
      const T = await import("three");
      const { gunModel, poseGun } = await import("@/world/tp/guns3d");
      if (stop || !host.current) return;
      const shot = new URLSearchParams(location.search).get("shot") ?? "sheet";
      const W = window.innerWidth;
      const H = window.innerHeight;
      const r = new T.WebGLRenderer({ antialias: true });
      r.outputColorSpace = T.SRGBColorSpace;
      r.setPixelRatio(Math.min(2, window.devicePixelRatio));
      r.setSize(W, H);
      host.current.append(r.domElement);
      const mat = new T.MeshLambertMaterial({ vertexColors: true });
      const light = (s: InstanceType<typeof T.Scene>, sun = 2.4, sky = 1.5) => {
        s.add(new T.HemisphereLight(0xe4ecf7, 0x6f6658, sky));
        const d = new T.DirectionalLight(0xfff2e0, sun);
        d.position.set(-2, 4, 3);
        s.add(d);
        const rim = new T.DirectionalLight(0xbcd2ff, 0.9);
        rim.position.set(3, 1.5, -3);
        s.add(rim);
      };

      if (shot === "sheet") {
        // four views, one canvas: [revolver side, revolver 3/4 open, shotgun side, shotgun 3/4 open]
        r.setScissorTest(true);
        const views: {
          kind: "revolver" | "shotgun";
          open: number;
          cam: [number, number, number];
          at: [number, number, number];
          fov: number;
        }[] = [
          { kind: "revolver", open: 0, cam: [0.05, -0.02, 0.5], at: [0.05, -0.035, 0], fov: 30 },
          { kind: "revolver", open: 1, cam: [0.3, 0.1, 0.3], at: [0.04, -0.035, 0], fov: 32 },
          { kind: "shotgun", open: 0, cam: [0.15, -0.04, 1.3], at: [0.15, -0.05, 0], fov: 30 },
          { kind: "shotgun", open: 1, cam: [-0.5, 0.22, 0.55], at: [0.08, -0.06, 0], fov: 34 },
        ];
        const cell = [
          [0, H / 2, W / 2, H / 2],
          [W / 2, H / 2, W / 2, H / 2],
          [0, 0, W / 2, H / 2],
          [W / 2, 0, W / 2, H / 2],
        ];
        views.forEach((v, i) => {
          const s = new T.Scene();
          s.background = new T.Color((i + (i >> 1)) % 2 ? 0x8d939b : 0x9aa0a8);
          light(s);
          const g = gunModel(v.kind, mat, "near");
          poseGun(g, v.kind, {
            cock: v.kind === "revolver" ? 1 : 0,
            open: v.open,
            turn: v.open ? 0.5 : 0,
            loaded: v.open ? 4 : 6,
          });
          s.add(g.root);
          const [x, y, w, h] = cell[i];
          const cam = new T.PerspectiveCamera(v.fov, w / h, 0.01, 20);
          cam.position.set(...v.cam);
          cam.lookAt(...v.at);
          r.setViewport(x, y, w, h);
          r.setScissor(x, y, w, h);
          r.render(s, cam);
        });
      } else if (shot === "snow") {
        const s = new T.Scene();
        s.background = new T.Color(0xc9d6e4);
        s.fog = new T.Fog(0xc9d6e4, 6, 30);
        light(s, 2.2, 1.7);
        const snow = new T.Mesh(new T.PlaneGeometry(60, 60, 40, 40), new T.MeshLambertMaterial({ color: 0xeef2f7 }));
        const pos = snow.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++)
          pos.setZ(i, 0.01 * Math.sin(pos.getX(i) * 3.1) * Math.cos(pos.getY(i) * 2.7));
        snow.geometry.computeVertexNormals();
        snow.rotation.x = -Math.PI / 2;
        s.add(snow);
        // lying on their right side as dropped, a little larger than life (items3d.ts: 1.8, 1.4)
        const lay = (kind: "revolver" | "shotgun", sc: number, x: number, z: number, yaw: number) => {
          const g = gunModel(kind, mat, "far");
          poseGun(g, kind, {});
          const o = new T.Group();
          g.root.rotation.x = -Math.PI / 2;
          g.root.position.y = (kind === "revolver" ? 0.017 : 0.024) * sc;
          o.add(g.root);
          o.scale.setScalar(sc);
          o.position.set(x, 0, z);
          o.rotation.y = yaw;
          s.add(o);
        };
        lay("revolver", 1.8, -0.45, 0.15, 0.5);
        lay("shotgun", 1.4, 0.35, -0.25, -0.35);
        const cam = new T.PerspectiveCamera(50, W / H, 0.05, 80);
        cam.position.set(0, 1.25, 1.3);
        cam.lookAt(0, 0, -0.1);
        r.render(s, cam);
      } else {
        // first person: a dusk on the snow, trees, one of the shadowed out ahead
        const kind = shot.endsWith("shotgun") ? "shotgun" : "revolver";
        const s = new T.Scene();
        s.background = new T.Color(0x5d6a80);
        s.fog = new T.Fog(0x5d6a80, 8, 45);
        light(s, 1.4, 1.2);
        const snow = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshLambertMaterial({ color: 0xd9e0ea }));
        snow.rotation.x = -Math.PI / 2;
        s.add(snow);
        const bark = new T.MeshLambertMaterial({ color: 0x3a2e26 });
        const pine = new T.MeshLambertMaterial({ color: 0x24362c });
        let k = 7;
        const rnd = () => {
          k = (k * 16807) % 2147483647;
          return k / 2147483647;
        };
        for (let i = 0; i < 60; i++) {
          const x = (rnd() - 0.5) * 50;
          const z = -6 - rnd() * 35;
          if (Math.abs(x) < 1.5 && z > -14) continue;
          const t = new T.Mesh(new T.CylinderGeometry(0.12, 0.18, 3, 7), bark);
          t.position.set(x, 1.5, z);
          const c = new T.Mesh(new T.ConeGeometry(1.3, 4.5, 8), pine);
          c.position.set(x, 4.2, z);
          s.add(t, c);
        }
        const shade = new T.Mesh(
          new T.CapsuleGeometry(0.34, 1.1, 4, 10),
          new T.MeshLambertMaterial({ color: 0x14161c }),
        );
        shade.position.set(0.15, 0.9, -11);
        s.add(shade);
        const cam = new T.PerspectiveCamera(shot.startsWith("ads") ? 50 : 62, W / H, 0.01, 200);
        cam.position.set(0, 1.62, 0);
        cam.lookAt(0.15, 1.35, -11);
        s.add(cam);
        const g = gunModel(kind, mat, "near");
        poseGun(g, kind, { cock: 1 });
        const holder = new T.Group();
        // the gun's x along the camera's −z (its y up)
        holder.rotation.y = Math.PI / 2;
        holder.add(g.root);
        cam.add(holder);
        if (shot.startsWith("ads")) {
          // the sights on the camera's axis: the rear notch this far from the eye
          const rear = kind === "shotgun" ? 0.28 : 0.42;
          g.root.position.set(-g.sight.rear[0] + rear, -g.sight.rear[1] - 0.0008, 0);
          // (tilted so the front sight drops onto the same line)
          const [rx, ry] = g.sight.rear;
          const [fx, fy] = g.sight.front;
          holder.rotation.z = 0;
          g.root.rotation.z = -Math.atan2(fy - ry, fx - rx);
          g.root.position.set(rear, 0, 0);
          g.root.position.sub(new T.Vector3(...g.sight.rear).applyEuler(g.root.rotation));
        } else {
          g.root.position.set(0.3, -0.2, 0.14);
          g.root.rotation.set(0.05, -0.06, 0.04);
        }
        // the crosshair's point, for the check
        r.render(s, cam);
        const ctx = document.createElement("canvas");
        ctx.width = W;
        ctx.height = H;
        Object.assign(ctx.style, { position: "absolute", inset: "0", pointerEvents: "none" });
        const c2 = ctx.getContext("2d") as CanvasRenderingContext2D;
        if (!shot.startsWith("ads")) {
          c2.strokeStyle = "rgba(255,255,255,.8)";
          c2.lineWidth = 2;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            c2.beginPath();
            c2.moveTo(W / 2 + dx * 7, H / 2 + dy * 7);
            c2.lineTo(W / 2 + dx * 15, H / 2 + dy * 15);
            c2.stroke();
          }
        }
        host.current.append(ctx);
      }
      // (their weight: triangles, near and far)
      const tris = (k: "revolver" | "shotgun", d: "near" | "far") => {
        let n = 0;
        gunModel(k, mat, d).root.traverse((o) => {
          const g = (o as InstanceType<typeof T.Mesh>).geometry;
          if (g) n += (g.index?.count ?? g.attributes.position.count) / 3;
        });
        return n;
      };
      Object.assign(window, {
        __gunTris: {
          revolver: [tris("revolver", "near"), tris("revolver", "far")],
          shotgun: [tris("shotgun", "near"), tris("shotgun", "far")],
        },
      });
      (window as unknown as { __gunsReady: boolean }).__gunsReady = true;
      dispose = () => {
        r.dispose();
        r.domElement.remove();
      };
    })();
    return () => {
      stop = true;
      dispose();
    };
  }, []);

  return <main ref={host} className="fixed inset-0 overflow-hidden bg-[#202329]" />;
}

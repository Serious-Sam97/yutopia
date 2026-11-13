"use client";

import { DEFAULT_AVATAR } from "@yutopia/shared";
import { AIM_BLADE } from "@yutopia/shared/beam";
import { packMv } from "@yutopia/shared/move";
import { notFound } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Dev only: the guns' bench (docs/plan/80-the-revolver.md F6a; one for every gun since plan 81 F7a). The game's
// own person (tp/person3d.ts, the life look) with a life gun in her hands (`gun=`: the revolver, the double-
// barrel…), as the world draws her: the ready, the aim (its pitch), the torch, running; the reload scrubbed. Turn round her (drag, the wheel), or a view by key. The
// hold's checks read out each frame (Person3D.revolverCheck): the gun's lean off upright, the barrel off
// the look, the left fingers against the right hand and the grip, each wrist short of its place or past
// its reach.
//   /dev/arms?gun=shotgun&pose=aim&pitch=0.3&torch=1&view=side&move=0&draw=1&t=0.5&gender=masculine
//   (/dev/revolver: the same, the revolver)
// Keys: 1–7 the views (side, left, front, back, shoulder, hands, hands-left) · A aim · T the torch
// window.__revolver = { ready, check(), set({...}) } for the checks (e2e/revolver-bench.mts).

const VIEWS = ["side", "left", "front", "back", "shoulder", "hands", "hands-left", "over"] as const;
type View = (typeof VIEWS)[number];
type Pose = "ready" | "aim" | "reload";
interface State {
  pose: Pose;
  pitch: number;
  torch: boolean;
  /** walking: 0 still, 1 walking, 2 jogging, 3 sprinting (she goes along, the views with her) */
  move: number;
  /** the draw scrubbed: 0 in the holster … 1 drawn (`away`: put away — the same path back) */
  draw: number;
  away: boolean;
  /** a shot's kick (0..1, as it goes off and fades) and the trigger's pull, held where they are */
  kick: number;
  trigger: number;
  /** (phase 5) a hit taken (`actT` s since) or a roll (`actT` of the way through it) — the hold lets go */
  act: "" | "hit" | "roll" | "heard" | "vault" | "slide" | "sit";
  actT: number;
  /** (phase 6) her facing turned from +z (rad): the hold at any turn */
  yaw: number;
  /** the reload scrubbed, 0..1 (the server's three steps: open, load, shut) */
  t: number;
  /** (plan 82) the AK's reload run dry — racked at its end; `play`: the reload run live from this moment
   *  (performance.now, ms; 0: scrubbed by `t`) */
  dry: boolean;
  play: number;
  view: View;
}

// (references to key from — linked, not copied: docs/plan/80-the-revolver.md)
const REFS: [string, string][] = [
  ["Miculek's slow speedloader reload", "https://www.youtube.com/watch?v=0FbUMqoyjDw"],
  ["AW2's weapons (80.lv)", "https://80.lv/articles/"],
  ["RE4 Remake: the low ready", "https://www.google.com/search?q=re4+remake+leon+low+ready&tbm=isch"],
];

export default function RevolverPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(window.location.search)), []);
  return q ? <Bench q={q} /> : null;
}

function Bench({ q }: { q: URLSearchParams }) {
  const host = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<State>({
    pose: (q.get("pose") as Pose) ?? "ready",
    pitch: Number(q.get("pitch") ?? 0),
    torch: q.get("torch") === "1",
    move: Number(q.get("move") ?? 0),
    draw: Number(q.get("draw") ?? 1),
    away: q.get("away") === "1",
    kick: Number(q.get("kick") ?? 0),
    trigger: Number(q.get("trigger") ?? 0),
    act: (q.get("act") as State["act"]) ?? "",
    actT: Number(q.get("actT") ?? 0),
    yaw: Number(q.get("yaw") ?? 0),
    t: Number(q.get("t") ?? 0.5),
    dry: q.get("dry") === "1",
    play: 0,
    view: (q.get("view") as View) ?? "side",
  });
  const live = useRef(st);
  live.current = st;
  const orbit = useRef<{ yaw: number; pitch: number; dist: number } | null>(null);
  const fire = useRef<() => void>(() => {});
  const [check, setCheck] = useState<string>("loading…");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const T = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { loadChars } = await import("@/world/art/chars-load");
      const { litMaterial, setLifeEnv, adoptLife } = await import("@/world/look/lit");
      const { yuLit } = await import("@/world/look/yulit");
      const { setLifeTone } = await import("@/world/look/life-tone");
      const { loadLifeGLTF } = await import("@/world/look/life-assets");
      const { Person3D } = await import("@/world/tp/person3d");
      // (plans 81–82: each long gun's own numbers — its stock's profile for what of it is inside her)
      const { SG_LONG } = await import("@/world/tp/shotgun-hold");
      const akHold = await import("@/world/tp/ak-hold");
      const { AK_LONG } = akHold;
      const { lineAt, longInHand } = await import("@/world/tp/long-hold");
      const C = await loadChars();
      // (which gun: the revolver, plan 80's; the double-barrel, plan 81's…)
      const GUN = q.get("gun") ?? "revolver";
      if (stop) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      el.appendChild(renderer.domElement);
      setLifeTone(renderer);
      C.setLifeHost({ renderer, lit: (m, base) => yuLit(m, { base }) });
      const scene = new T.Scene();
      scene.background = new T.Color("#9aa0a8");
      const pm = new T.PMREMGenerator(renderer);
      const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      setLifeEnv(env, 0.6);
      scene.add(new T.HemisphereLight("#dfe8f5", "#8a7563", 1.3));
      const sun = new T.DirectionalLight("#fff4e6", 2.2);
      sun.position.set(-2, 5, 3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
      scene.add(sun, sun.target);
      const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshLambertMaterial({ color: "#b9bcc0" }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const grid = new T.GridHelper(10, 20, "#8d9096", "#a6a9ae");
      grid.position.y = 0.001;
      scene.add(grid);

      // the person's materials, as the view makes them (tp/view.ts chars())
      const body = litMaterial({ vertexColors: true });
      const NO = new T.MeshBasicMaterial({ visible: false });
      const props = new Map<string, InstanceType<typeof T.Material>>();
      const guns = new Map<string, InstanceType<typeof T.Object3D> | "loading">();
      const mats = {
        body,
        bodyAway: body,
        ink: NO,
        inkAway: NO,
        prop: (color: string) => {
          let m = props.get(color);
          if (!m) {
            m = new T.MeshLambertMaterial(color === "vertex" ? { vertexColors: true } : { color });
            props.set(color, m);
          }
          return m;
        },
        gun: (kind: string) => {
          const have = guns.get(kind);
          if (have === undefined) {
            guns.set(kind, "loading");
            void loadLifeGLTF(renderer, `/life/guns/${kind}.glb`).then((g) => {
              g.scene.traverse((o) => {
                const m = (o as InstanceType<typeof T.Mesh>).material as InstanceType<typeof T.MeshStandardMaterial>;
                if (m?.isMeshStandardMaterial) adoptLife(m);
              });
              guns.set(kind, g.scene);
            });
            return null;
          }
          return have === "loading" ? null : have;
        },
      };
      const gender = q.get("gender") ?? "feminine";
      const avatar = {
        ...DEFAULT_AVATAR,
        gender,
        hair: gender === "masculine" ? "short" : "bob",
        top: q.get("top") ?? "coat",
        topColor: "#3d4a5c",
        bottom: "jeans",
        bottomColor: "#2a2f3a",
      } as typeof DEFAULT_AVATAR;
      const p = {
        name: "Ana",
        avatar,
        x: 0,
        y: 0,
        angle: Math.PI / 2, // (facing +z)
        a: 0,
        gun: GUN,
        holster: GUN === "revolver",
        // (`both=1`: carrying both long guns — their slings crossed on her back)
        sling: GUN === "shotgun" || q.get("both") === "1",
        slingAk: GUN === "ak47" || q.get("both") === "1",
        mv: packMv("still"),
        pitch: 0,
        torch: false,
      };
      const person = new Person3D("bench", C, new C.CharFactory(), mats, p as never);
      scene.add(person.root);
      const cam = new T.PerspectiveCamera(35, W / H, 0.02, 60);

      // the views: [yaw about her (0: from her front; π/2: from her right), pitch, distance, look-at height]
      const VIEW: Record<View, [number, number, number, number]> = {
        side: [-Math.PI / 2, 0.08, 2.6, 1.15],
        left: [Math.PI / 2, 0.08, 2.6, 1.15],
        front: [0, 0.1, 2.6, 1.15],
        back: [Math.PI, 0.1, 2.6, 1.15],
        shoulder: [Math.PI, 0.18, 1.6, 1.5],
        hands: [-0.9, 0.25, 0.75, 0],
        "hands-left": [0.9, 0.25, 0.75, 0],
        // (close behind her right shoulder, as the aimed game camera has her: her forearms)
        over: [Math.PI + 0.35, 0.12, 0.85, 1.35],
      };
      const gunAt = new T.Vector3();
      let lastView: View | null = null;
      const place = () => {
        const s = live.current;
        if (s.view !== lastView) {
          lastView = s.view;
          const [yaw, pitch, dist] = VIEW[s.view];
          orbit.current = { yaw, pitch, dist };
        }
        const o = orbit.current ?? { yaw: 0, pitch: 0.1, dist: 2.6 };
        const [, , , h] = VIEW[s.view];
        // (the close views look at the gun; the rest at her chest)
        const g = (person as unknown as { gun: { model: { root: InstanceType<typeof T.Object3D> } } | null }).gun;
        const at =
          h === 0 && g
            ? g.model.root.getWorldPosition(gunAt)
            : s.view === "shoulder"
              ? gunAt
              : gunAt.set(person.root.position.x, h, person.root.position.z);
        // (the game's: over her right shoulder, looking ahead, its wider lens)
        const fov = s.view === "shoulder" || s.view === "over" ? 55 : 35;
        if (cam.fov !== fov) {
          cam.fov = fov;
          cam.updateProjectionMatrix();
        }
        if (s.view === "shoulder" || s.view === "over") {
          // (it turns with her look: aiming, AIM_BLADE left of the way her feet face; "over": closer in, as
          // the aimed camera)
          const yaw = s.pose === "aim" ? AIM_BLADE : 0;
          const ax = Math.sin(yaw);
          const az = Math.cos(yaw);
          // (her right: −x turned with it)
          const r = person.root.position;
          const [side, back, up] = s.view === "over" ? [0.42, 0.75, 1.62] : [0.62, 1.5, 1.72];
          cam.position.set(r.x - az * side - ax * back, up, r.z + ax * side - az * back);
          cam.lookAt(cam.position.x + ax * 5, 1.45, cam.position.z + az * 5);
          return;
        }
        cam.position.set(
          at.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
          at.y + Math.sin(o.pitch) * o.dist,
          at.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
        );
        cam.lookAt(at);
      };

      // the person as the state has her: aiming, its pitch, the torch, running, the reload scrubbed
      const fx = { kick: 0, cock: 1, turn: 0, open: 0, loaded: 6, trigger: 0, reload: 0 };
      const seen = { camX: 0, camZ: 2, onScreen: true, lowQuality: false, mood: 0 };
      let fired = -1e9;
      fire.current = () => {
        fired = performance.now();
      };
      const GAIT = ["still", "walk", "jog", "sprint"] as const;
      const SPEED = [0, 1.4, 3.2, 5.4];
      const P3 = person as unknown as {
        drawT: number;
        holsterT: number;
        revLoadT: number;
        sgLoadT: number;
        akLoadT: number;
      };
      const apply = (dt: number) => {
        const s = live.current;
        const aim = s.pose === "aim";
        const mv = Math.max(0, Math.min(3, Math.round(s.move)));
        p.mv = packMv(mv ? GAIT[mv] : aim ? "aim" : "still", false, aim);
        // (along the way she faces, +z; back round after 12 m)
        p.y += SPEED[mv] * dt;
        if (p.y > 12) p.y = -12;
        seen.camX = p.x;
        seen.camZ = p.y + 2;
        // (the draw: its clock set where the slider has it — the put-away's, the gun gone from her state)
        p.gun = s.away ? "" : GUN;
        p.angle = Math.PI / 2 + s.yaw;
        const P = p as { hit?: { t: number; yaw: number }; verb?: { kind: string; t: number } };
        P.hit = s.act === "hit" ? { t: s.actT, yaw: 0.6 } : undefined;
        P.verb = s.act === "roll" || s.act === "vault" || s.act === "slide" ? { kind: s.act, t: s.actT } : undefined;
        // (sat on a chair — plan 81 phase 5: the hold let go of, the gun in the hand)
        (p as { a?: number; seat?: string }).a = s.act === "sit" ? 2 : 0;
        (p as { a?: number; seat?: string }).seat = s.act === "sit" ? "chair" : undefined;
        // (a shot heard 4 m off, 30° to her left of the way she faces, `actT` s ago)
        const ha = p.angle + 1.2;
        (p as { heard?: unknown }).heard =
          s.act === "heard"
            ? { t: s.actT, x: p.x + Math.cos(ha) * 4, y: p.y + Math.sin(ha) * 4, loud: true }
            : undefined;
        // (put all the way away: in the holster, the hand let go)
        // (each gun's own times: the revolver's 0.35 s out of the holster, 0.25 back; the double-barrel's 0.6 off
        // her back, 0.5 onto it — person3d's)
        // (the AK's 0.6 off her back round her right side, 0.5 back — plan 82)
        const SL = (GUN === "ak47" ? AK_LONG : GUN === "shotgun" ? SG_LONG : null)?.sling;
        const [DRAW, AWAY] = SL ? [SL.draw, SL.away] : [0.35, 0.25];
        if (s.away) P3.holsterT = s.draw <= 0 ? 1 : Math.max(0, (1 - s.draw) * AWAY - dt);
        else if (s.draw < 1) P3.drawT = Math.max(0, s.draw * DRAW - dt);
        p.pitch = aim ? s.pitch : 0;
        p.torch = s.torch;
        // (the reload: the server's step open — Player.arm — its timeline scrubbed through its 2.2 s; the
        // double-barrel's 2.3, its shutting its own: ARM.shut — plan 81)
        // (the AK's 2.2 s, racked 2.8 — its closing its own: ARM.shut, ARM.rack — plan 82)
        const akLen = s.dry ? 2.8 : 2.2;
        const t = s.play > 0 ? Math.min(1, (performance.now() - s.play) / 1000 / (GUN === "ak47" ? akLen : 2.3)) : s.t;
        const reload = s.pose === "reload";
        const sgT = t * 2.3;
        const akT = t * akLen;
        (p as { arm?: number }).arm = !reload
          ? 0
          : GUN === "shotgun" && sgT >= 1.95
            ? 6
            : GUN === "ak47" && akT >= 1.8
              ? s.dry
                ? 7
                : 6
              : 3;
        if (reload && GUN === "shotgun") P3.sgLoadT = Math.max(0, sgT - dt);
        else if (reload && GUN === "ak47") {
          // (live: its own clock — the empty let fall as it passes; scrubbed: set)
          if (s.play <= 0 || P3.akLoadT < 0) P3.akLoadT = Math.max(0, akT - dt);
        } else if (reload) P3.revLoadT = Math.max(0, t * 2.2 - dt);
        fx.reload = reload ? 1 : 0;
        fx.open = reload ? (t < 0.3 ? t / 0.3 : t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2) : 0;
        fx.loaded = GUN === "shotgun" ? 2 : reload && t < 0.55 ? 0 : 6;
        // (a shot: fired by the button, its kick fading as Arms fades it — or held where the sliders are)
        const since = (performance.now() - fired) / 1000;
        // (as Arms has a shot's kick fade — dark/arms.ts: up in 35 ms, then away at the gun's own rate)
        const fade = GUN === "shotgun" ? 9 : GUN === "ak47" ? 18 : GUN === "sniper" ? 7 : 13;
        const shot = since < 0 ? 0 : since < 0.035 ? since / 0.035 : Math.exp(-(since - 0.035) * fade);
        fx.kick = Math.max(s.kick, shot);
        fx.trigger = Math.max(s.trigger, since < 0.12 ? 1 : 0);
        (person as unknown as { gunFx: typeof fx | null }).gunFx = fx;
      };

      let raf = 0;
      let last = performance.now();
      let n = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        apply(dt);
        person.update(p as never, dt, seen);
        place();
        renderer.render(scene, cam);
        if (++n % 10 === 0) {
          const c = person.revolverCheck(p as never);
          setCheck(
            c
              ? [
                  `upright: ${deg(c.cant)}° off · barrel off the look: ${deg(c.off)}°`,
                  `left fingers to the right hand: ${cm(c.hands)} · to the ${GUN === "shotgun" ? "fore-end" : GUN === "ak47" ? "receiver" : "grip"}: ${cm(c.grip)}`,
                  ...(c.arms !== null ? [`the forearms to the gun: ${cm(c.arms)}`] : []),
                  `right wrist: ${cm(c.R.short)} short, ${deg(c.R.over)}° past · left: ${c.L ? `${cm(c.L.short)} short, ${deg(c.L.over)}° past` : "not on the gun"}`,
                  c.held ? "the hold: plan 80" : "the hold: off (the old hands)",
                ].join("\n")
              : person.ready
                ? "no life revolver in hand yet…"
                : "loading her…",
          );
        }
      };
      tick();
      (window as unknown as Record<string, unknown>).__revolver = {
        get ready() {
          return person.ready && !!person.revolverCheck(p as never);
        },
        check: () => person.revolverCheck(p as never),
        // (a shot, as the button: its kick and the trigger — a burst is one every ARMS' rate)
        fire: () => fire.current(),
        // (plan 81: how much of the double-barrel's stock is inside her — points through its wood, each a ray
        // ahead of her: an odd count of a mesh's own crossings, inside it; how far behind its front)
        stockIn: () => {
          const g = (person as unknown as { gun: { model: { root: import("three").Object3D } } | null }).gun;
          if (!g) return null;
          const root = g.model.root;
          root.updateWorldMatrix(true, true);
          const meshes: import("three").Mesh[] = [];
          person.root.traverse((o) => {
            const m = o as import("three").SkinnedMesh;
            if (m.isSkinnedMesh && m.visible) meshes.push(m);
          });
          // (the way her chest faces — her trunk's turned with the gun: the root's way crossed her side)
          const chest = person.model.bone("chest");
          const ahead = new T.Vector3(0, 0, 1).applyQuaternion(
            (chest ?? person.root).getWorldQuaternion(new T.Quaternion()),
          );
          const rc = new T.Raycaster();
          // (the stock's side profile, its top and bottom lines by x — tools/art/guns/guns.py)
          const S = (GUN === "ak47" ? AK_LONG : SG_LONG).check.stock;
          const top = (x: number) => lineAt(S.top, x);
          const bot = (x: number) => lineAt(S.bot, x);
          let n = 0;
          let inside = 0;
          let deep = 0;
          const where: Record<string, number> = {};
          const pts: string[] = [];
          for (let x = S.x[0]; x <= S.x[1]; x += 0.03)
            for (const k of [0.15, 0.5, 0.85])
              for (const z of [-S.z, 0, S.z]) {
                const pt = new T.Vector3(x, bot(x) + (top(x) - bot(x)) * k, z).applyMatrix4(root.matrixWorld);
                n++;
                rc.set(pt, ahead);
                for (const m of meshes) {
                  const hits = rc.intersectObject(m, false);
                  if (hits.length % 2 === 1) {
                    inside++;
                    deep = Math.max(deep, hits[0].distance);
                    where[m.name || "body"] = (where[m.name || "body"] ?? 0) + 1;
                    pts.push(
                      `${(m.name || "body").slice(-4)} x${x.toFixed(2)} k${k} z${z} d${(hits[0].distance * 100).toFixed(1)}`,
                    );
                    break;
                  }
                }
              }
          return { n, inside, deep, where, pts };
        },
        person,
        p,
        // (plan 82: how much of a slung gun is inside her — points through its body, each a ray back out of her
        // chest: an odd count of a mesh's own crossings, inside it)
        slungIn: (key: string) => {
          const S = (
            person as unknown as { slings: Map<string, { gun: { root: import("three").Object3D } }> }
          ).slings.get(key);
          if (!S) return null;
          const root = S.gun.root;
          root.updateWorldMatrix(true, true);
          const meshes: import("three").Mesh[] = [];
          person.root.traverse((o) => {
            const m = o as import("three").SkinnedMesh;
            if (m.isSkinnedMesh && m.visible) meshes.push(m);
          });
          const chest = person.model.bone("chest");
          const back = new T.Vector3(0, 0, -1).applyQuaternion(
            (chest ?? person.root).getWorldQuaternion(new T.Quaternion()),
          );
          const rc = new T.Raycaster();
          let n = 0;
          let inside = 0;
          let deep = 0;
          const pts: string[] = [];
          for (let x = -0.38; x <= 0.62; x += 0.05)
            for (const y of [0, 0.04, 0.08])
              for (const z of [-0.015, 0.015]) {
                const pt = new T.Vector3(x, y, z).applyMatrix4(root.matrixWorld);
                n++;
                rc.set(pt, back);
                for (const m of meshes) {
                  const hits = rc.intersectObject(m, false);
                  if (hits.length % 2 === 1) {
                    inside++;
                    deep = Math.max(deep, hits[0].distance);
                    pts.push(
                      `${(m.name || "body").slice(-4)} x${x.toFixed(2)} y${y} d${(hits[0].distance * 100).toFixed(1)}`,
                    );
                    break;
                  }
                }
              }
          return { n, inside, deep, pts };
        },
        // (the long guns' numbers, to try others live — refit() puts the gun in the hand by them again)
        long: { SG_LONG, AK_LONG, akHold },
        refit: () => {
          const g = (person as unknown as { gun: { key: string; model: { root: import("three").Object3D } } | null })
            .gun;
          const F = person.model.handFrame("R");
          const LS = g?.key === "ak47" ? AK_LONG : g?.key === "shotgun" ? SG_LONG : null;
          if (g && F && LS) longInHand(LS, F, g.model.root.quaternion, g.model.root.position);
        },
        set: (s: Partial<State>) => {
          live.current = { ...live.current, ...s };
          setSt(live.current);
        },
      };

      // turn round her: drag, the wheel
      let drag: { x: number; y: number } | null = null;
      const down = (e: PointerEvent) => {
        drag = { x: e.clientX, y: e.clientY };
      };
      const move = (e: PointerEvent) => {
        if (!drag || !orbit.current) return;
        orbit.current.yaw -= (e.clientX - drag.x) * 0.008;
        orbit.current.pitch = Math.max(-0.6, Math.min(1.3, orbit.current.pitch + (e.clientY - drag.y) * 0.006));
        drag = { x: e.clientX, y: e.clientY };
      };
      const up = () => {
        drag = null;
      };
      const wheel = (e: WheelEvent) => {
        if (orbit.current) orbit.current.dist = Math.max(0.3, Math.min(8, orbit.current.dist * (1 + e.deltaY * 0.001)));
      };
      const cv = renderer.domElement;
      cv.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      cv.addEventListener("wheel", wheel, { passive: true });
      cleanup = () => {
        cancelAnimationFrame(raf);
        cv.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        cv.removeEventListener("wheel", wheel);
        renderer.dispose();
        cv.remove();
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, [q]);

  // keys
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < VIEWS.length) setSt((s) => ({ ...s, view: VIEWS[i] }));
      else if (e.key === "a") setSt((s) => ({ ...s, pose: s.pose === "aim" ? "ready" : "aim" }));
      else if (e.key === "t") setSt((s) => ({ ...s, torch: !s.torch }));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const set = (s: Partial<State>) => setSt((o) => ({ ...o, ...s }));
  const row: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", font: "13px system-ui", color: "#1d2026" }}>
      <div ref={host} style={{ flex: 1, position: "relative" }} />
      <div
        style={{
          width: 300,
          padding: 12,
          background: "#eef0f2",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        <b>{q.get("gun") ?? "revolver"} — plans 80–81</b>
        <div style={row}>
          {(["ready", "aim", "reload"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ pose: k })}
              style={{ fontWeight: st.pose === k ? 700 : 400 }}
            >
              {k}
            </button>
          ))}
        </div>
        <label style={row}>
          <input type="checkbox" checked={st.torch} onChange={(e) => set({ torch: e.target.checked })} /> the torch
        </label>
        <label style={row}>
          aim pitch {st.pitch.toFixed(2)}
          <input
            type="range"
            min={-0.9}
            max={0.9}
            step={0.01}
            value={st.pitch}
            onChange={(e) => set({ pitch: Number(e.target.value) })}
          />
        </label>
        <div style={row}>
          {["still", "walk", "jog", "sprint"].map((g, i) => (
            <button
              key={g}
              type="button"
              onClick={() => set({ move: i })}
              style={{ fontWeight: st.move === i ? 700 : 400 }}
            >
              {g}
            </button>
          ))}
        </div>
        <label style={row}>
          {st.away ? "put away" : "drawn"} {st.draw.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={st.draw}
            onChange={(e) => set({ draw: Number(e.target.value) })}
          />
        </label>
        <div style={row}>
          <button type="button" onClick={() => fire.current()}>
            fire
          </button>
          kick
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={st.kick}
            onChange={(e) => set({ kick: Number(e.target.value) })}
          />
          trigger
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={st.trigger}
            onChange={(e) => set({ trigger: Number(e.target.value) })}
          />
        </div>
        <label style={row}>
          <input type="checkbox" checked={st.away} onChange={(e) => set({ away: e.target.checked })} /> putting it away
        </label>
        <label style={row}>
          reload {st.t.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={st.t}
            onChange={(e) => set({ t: Number(e.target.value) })}
          />
        </label>
        <div style={row}>
          {VIEWS.map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => set({ view: v })}
              style={{ fontWeight: st.view === v ? 700 : 400 }}
            >
              {i + 1} {v}
            </button>
          ))}
        </div>
        <pre id="check" style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12, background: "#fff", padding: 8 }}>
          {check}
        </pre>
        <div>
          <b>References</b>
          {REFS.map(([t, u]) => (
            <div key={u}>
              <a href={u} target="_blank" rel="noreferrer">
                {t}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
const cm = (m: number | null) => (m === null ? "–" : `${(m * 100).toFixed(1)} cm`);

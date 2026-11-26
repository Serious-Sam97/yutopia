// Plan 130 phase 0: the mock house, drawn into the game's own scene with a three copy (window.MOCK3) — a lot on the
// meadow at (130, −40) by the path, a house at every stage of building it, the tools' ghosts and handles. Materials
// are drawn here on canvases (the real ones will be CC0 photo textures, F8). window.HOUSE.shot(name) → anchors.
(() => {
  const T = window.MOCK3;
  const c = window.__yutopia;
  const tp = c.tp;
  const X0 = 130;
  const Z0 = -40;
  // the lot's ground: the highest of its land under the house, so the foundation stands on it everywhere
  let G = -Infinity;
  for (let x = -7; x <= 6; x += 1) for (let z = -11; z <= 3; z += 1) G = Math.max(G, c.G.terrainAt(X0 + x, Z0 + z));
  const land = (x, z) => c.G.terrainAt(X0 + x, Z0 + z);
  const F = G + 0.75; // the foundation's top
  const ST = 3.0; // a storey's walls
  const SLAB = 0.25;
  const F2 = F + ST + SLAB; // the upper storey's floor
  const EAVE = F2 + ST;

  // ── textures ────────────────────────────────────────────────────────────────────────────────────────────────
  const TEX = {};
  const rnd = (() => {
    let s = 12345;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const shade = (hex, k) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  const noise = (g, w, h, a, n = 2200) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a * rnd()})` : `rgba(255,255,255,${a * rnd()})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
    }
  };
  // a texture: `m` metres across its 512 px, drawn by `draw(g, px per metre)`
  const canvasTex = (name, m, draw) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const g = cv.getContext("2d");
    draw(g, 512 / m);
    TEX[name] = { url: cv.toDataURL("image/jpeg", 0.88), m };
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    t.userData = { m };
    return t;
  };
  const siding = (name, col, board = 0.2) =>
    canvasTex(name, 2, (g, p) => {
      const n = Math.round(2 / board);
      const bh = 512 / n;
      for (let i = 0; i < n; i++) {
        const y = i * bh;
        const gr = g.createLinearGradient(0, y, 0, y + bh);
        gr.addColorStop(0, shade(col, 1.06));
        gr.addColorStop(0.85, shade(col, 0.94));
        gr.addColorStop(1, shade(col, 0.7));
        g.fillStyle = gr;
        g.fillRect(0, y, 512, bh);
      }
      noise(g, 512, 512, 0.05, 1500);
      void p;
    });
  const batten = (name, col) =>
    canvasTex(name, 2, (g) => {
      g.fillStyle = col;
      g.fillRect(0, 0, 512, 512);
      noise(g, 512, 512, 0.05, 1200);
      for (let x = 0; x < 512; x += 128) {
        g.fillStyle = shade(col, 1.08);
        g.fillRect(x, 0, 20, 512);
        g.fillStyle = shade(col, 0.72);
        g.fillRect(x + 20, 0, 5, 512);
      }
    });
  const brick = (name, col, mortar = "#d8d2c6") =>
    canvasTex(name, 1.5, (g, p) => {
      g.fillStyle = mortar;
      g.fillRect(0, 0, 512, 512);
      const bw = 0.215 * p;
      const bh = 0.065 * p;
      const j = 0.01 * p;
      for (let r = 0, y = 0; y < 512; r++, y += bh + j) {
        for (let x = r % 2 ? -bw / 2 : 0; x < 512; x += bw + j) {
          g.fillStyle = shade(col, 0.82 + rnd() * 0.3);
          g.fillRect(x, y, bw, bh);
        }
      }
      noise(g, 512, 512, 0.08, 3000);
    });
  const stone = (name, col) =>
    canvasTex(name, 2, (g) => {
      g.fillStyle = shade(col, 0.55);
      g.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 540; y += 46) {
        for (let x = (y / 46) % 2 ? -30 : 0; x < 540; ) {
          const w = 50 + rnd() * 60;
          g.fillStyle = shade(col, 0.8 + rnd() * 0.4);
          g.beginPath();
          g.roundRect(x + 3, y + 3, w - 6, 40, 10);
          g.fill();
          x += w;
        }
      }
      noise(g, 512, 512, 0.1, 3000);
    });
  const shingles = (name, col) =>
    canvasTex(name, 2, (g) => {
      for (let y = 0, r = 0; y < 512; y += 40, r++) {
        for (let x = r % 2 ? -26 : 0; x < 540; ) {
          const w = 34 + rnd() * 30;
          const k = 0.78 + rnd() * 0.32;
          const gr = g.createLinearGradient(0, y, 0, y + 40);
          gr.addColorStop(0, shade(col, k * 0.8));
          gr.addColorStop(1, shade(col, k));
          g.fillStyle = gr;
          g.fillRect(x, y, w - 2, 40);
          g.fillStyle = "rgba(0,0,0,.35)";
          g.fillRect(x, y + 37, w, 3);
          x += w;
        }
      }
      noise(g, 512, 512, 0.06, 2000);
    });
  const planks = (name, col, w = 0.15) =>
    canvasTex(name, 2, (g, p) => {
      const pw = w * p;
      for (let x = 0; x < 512; x += pw) {
        for (let y = -rnd() * 300; y < 512; ) {
          const l = 150 + rnd() * 260;
          g.fillStyle = shade(col, 0.85 + rnd() * 0.25);
          g.fillRect(x, y, pw - 2, l - 2);
          for (let k = 0; k < 6; k++) {
            g.strokeStyle = `rgba(60,30,10,${0.08 + rnd() * 0.08})`;
            g.beginPath();
            const xx = x + rnd() * pw;
            g.moveTo(xx, y);
            g.bezierCurveTo(xx + 4, y + l / 3, xx - 4, y + (2 * l) / 3, xx + 2, y + l);
            g.stroke();
          }
          y += l;
        }
        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect(x + pw - 2, 0, 2, 512);
      }
    });
  const checker = (name, a, b, s = 0.3) =>
    canvasTex(name, 1.2, (g, p) => {
      const q = s * p;
      for (let i = 0; i * q < 512; i++)
        for (let j = 0; j * q < 512; j++) {
          g.fillStyle = (i + j) % 2 ? a : b;
          g.fillRect(i * q, j * q, q, q);
        }
      g.strokeStyle = "rgba(120,120,120,.6)";
      g.lineWidth = 2;
      for (let i = 0; i * q <= 512; i++) {
        g.beginPath();
        g.moveTo(i * q, 0);
        g.lineTo(i * q, 512);
        g.moveTo(0, i * q);
        g.lineTo(512, i * q);
        g.stroke();
      }
      noise(g, 512, 512, 0.04);
    });
  const tiles = (name, col, s, grout, m = 1) =>
    canvasTex(name, m, (g, p) => {
      const q = s * p;
      g.fillStyle = grout;
      g.fillRect(0, 0, 512, 512);
      for (let y = 0, r = 0; y < 512; y += q, r++)
        for (let x = 0; x < 512; x += q) {
          g.fillStyle = shade(col, 0.9 + rnd() * 0.2);
          g.fillRect(x + 1.5, y + 1.5, q - 3, q - 3);
        }
    });
  const subway = (name) =>
    canvasTex(name, 1, (g, p) => {
      g.fillStyle = "#c9c4bb";
      g.fillRect(0, 0, 512, 512);
      const bw = 0.15 * p;
      const bh = 0.075 * p;
      for (let r = 0, y = 0; y < 512; r++, y += bh)
        for (let x = r % 2 ? -bw / 2 : 0; x < 512; x += bw) {
          g.fillStyle = shade("#f4f2ee", 0.95 + rnd() * 0.06);
          g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        }
    });
  const flat = (name, col, a = 0.06, m = 2) =>
    canvasTex(name, m, (g) => {
      g.fillStyle = col;
      g.fillRect(0, 0, 512, 512);
      noise(g, 512, 512, a, 6000);
    });
  const stripes = (name, a, b) =>
    canvasTex(name, 1, (g) => {
      for (let x = 0; x < 512; x += 64) {
        g.fillStyle = a;
        g.fillRect(x, 0, 40, 512);
        g.fillStyle = b;
        g.fillRect(x + 40, 0, 24, 512);
      }
      noise(g, 512, 512, 0.03);
    });
  const floral = (name, bg, fg) =>
    canvasTex(name, 1, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 512);
      for (let y = 0, r = 0; y < 560; y += 64, r++)
        for (let x = r % 2 ? 32 : 0; x < 560; x += 64) {
          g.fillStyle = fg;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            g.beginPath();
            g.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, 4, a, 0, 7);
            g.fill();
          }
          g.fillStyle = "#e8c35a";
          g.beginPath();
          g.arc(x, y, 3.5, 0, 7);
          g.fill();
        }
    });
  const logs = (name, col) =>
    canvasTex(name, 2, (g) => {
      for (let y = 0; y < 512; y += 64) {
        const gr = g.createLinearGradient(0, y, 0, y + 64);
        gr.addColorStop(0, shade(col, 0.6));
        gr.addColorStop(0.3, shade(col, 1.05));
        gr.addColorStop(0.75, shade(col, 0.95));
        gr.addColorStop(1, shade(col, 0.5));
        g.fillStyle = gr;
        g.fillRect(0, y, 512, 64);
      }
      noise(g, 512, 512, 0.07, 3000);
    });
  const panel = (name, col) =>
    canvasTex(name, 1, (g) => {
      g.fillStyle = shade(col, 0.9);
      g.fillRect(0, 0, 512, 512);
      for (let x = 0; x < 512; x += 128) {
        g.fillStyle = shade(col, 1.05);
        g.fillRect(x + 14, 30, 100, 452);
        g.strokeStyle = shade(col, 0.6);
        g.lineWidth = 3;
        g.strokeRect(x + 14, 30, 100, 452);
      }
    });
  const mosaic = (name) =>
    canvasTex(name, 0.5, (g) => {
      for (let y = 0; y < 512; y += 25.6)
        for (let x = 0; x < 512; x += 25.6) {
          g.fillStyle = `hsl(${195 + rnd() * 14},${55 + rnd() * 20}%,${48 + rnd() * 16}%)`;
          g.fillRect(x + 1, y + 1, 23.6, 23.6);
        }
    });
  const ground = (name) =>
    canvasTex(name, 4, (g) => {
      g.fillStyle = "#c9d2c9";
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = rnd() < 0.55 ? `rgba(90,120,60,${0.25 + rnd() * 0.4})` : `rgba(240,246,250,${0.4 * rnd()})`;
        g.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 5, 2 + rnd() * 4);
      }
    });
  const dirt = (name) =>
    canvasTex(name, 2, (g) => {
      g.fillStyle = "#6e5039";
      g.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 512; y += 60 + rnd() * 50) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? "40,25,15" : "150,110,80"},.25)`;
        g.fillRect(0, y, 512, 18 + rnd() * 30);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = shade("#9a8f84", 0.6 + rnd() * 0.6);
        g.beginPath();
        g.ellipse(rnd() * 512, rnd() * 512, 2 + rnd() * 7, 2 + rnd() * 5, rnd() * 3, 0, 7);
        g.fill();
      }
      noise(g, 512, 512, 0.12, 5000);
    });

  // the walls' coverings (the strip's 24 in the coverings shot) — drawn first, so the swatches come out in order
  const COVER = [
    ["Lap siding · white", siding("sid-white", "#eef0ee")],
    ["Lap siding · sage", siding("sid-sage", "#9fb29a")],
    ["Lap siding · slate", siding("sid-blue", "#7d93a8")],
    ["Lap siding · butter", siding("sid-butter", "#ecd9a2")],
    ["Board & batten", batten("batten", "#d9d4c8")],
    ["Cedar shakes", shingles("shakes", "#a7774c")],
    ["Red brick", brick("brick", "#9a4a35")],
    ["Whitewash brick", brick("brick-white", "#e6e1d8", "#bdb7ac")],
    ["Fieldstone", stone("fieldstone", "#a59e92")],
    ["Stucco", flat("stucco", "#e8dcc4", 0.12)],
    ["Logs", logs("logs", "#9a6a40")],
    ["Concrete", flat("concrete", "#b7b4ad", 0.1)],
    ["Plaster", flat("plaster", "#efe9dd", 0.04)],
    ["Ticking stripe", stripes("stripe", "#efe6cf", "#9fb6c9")],
    ["Prairie floral", floral("floral", "#f1e9d6", "#c87a6b")],
    ["Sea floral", floral("floral2", "#24384f", "#d8e4ef")],
    ["Wainscot oak", panel("panel", "#a77a4b")],
    ["Subway tile", subway("subway")],
    ["Sea glass", tiles("seaglass", "#8fc7c0", 0.1, "#e9efed", 1)],
    ["Terracotta", tiles("terracotta", "#b9673f", 0.25, "#d9c7b0", 1.5)],
    ["Shiplap · navy", siding("shiplap-navy", "#2f4060", 0.15)],
    ["Shiplap · cream", siding("shiplap", "#efe7d3", 0.15)],
    ["Mint", flat("mint", "#a9cdbb", 0.04)],
    ["Night blue", flat("night", "#2d3c55", 0.04)],
  ];
  const FLOORS = [
    ["Oak planks", planks("oak", "#b9884f")],
    ["Walnut planks", planks("walnut", "#6f4628")],
    ["Grey oak", planks("greyoak", "#a39b8f")],
    ["Chessboard", checker("checker", "#1f1f22", "#efece4")],
    ["Slate", tiles("slate", "#5b6066", 0.4, "#3a3d40", 2)],
    ["Hex marble", tiles("marble", "#e9e8e4", 0.2, "#bdbab3", 1)],
    ["Deck boards", planks("deck", "#8f7d68", 0.14)],
  ];
  const ROOFS = [
    ["Slate", shingles("roof-slate", "#4d545c")],
    ["Red clay", shingles("roof-clay", "#a4503a")],
    ["Moss green", shingles("roof-green", "#5f7458")],
  ];
  void FLOORS;
  void ROOFS;
  const tx = {
    sidWhite: COVER[0][1],
    sidSage: COVER[1][1],
    brick: COVER[6][1],
    field: COVER[8][1],
    plaster: COVER[12][1],
    concrete: COVER[11][1],
    stripe: COVER[13][1],
    floral: COVER[14][1],
    subway: COVER[17][1],
    oak: FLOORS[0][1],
    walnut: FLOORS[1][1],
    greyoak: FLOORS[2][1],
    checker: FLOORS[3][1],
    deck: FLOORS[6][1],
    slate: ROOFS[0][1],
    mosaic: mosaic("mosaic"),
    ground: ground("ground"),
    dirt: dirt("dirt"),
    paving: tiles("paving", "#b9b2a6", 0.5, "#8d867c", 2),
  };

  // ── materials ───────────────────────────────────────────────────────────────────────────────────────────────
  const mats = new Map();
  const mat = (t, o = {}) => {
    const k = `${t?.uuid ?? "-"}|${JSON.stringify(o)}`;
    if (!mats.has(k))
      mats.set(
        k,
        new T.MeshStandardMaterial({ map: t ?? null, roughness: 0.86, metalness: 0, side: T.FrontSide, ...o }),
      );
    return mats.get(k);
  };
  const col = (hex, o = {}) => mat(null, { color: hex, ...o });
  const TRIM = col(0xf3f1ec);
  const GLASS = new T.MeshStandardMaterial({
    color: 0x9cc3d6,
    roughness: 0.06,
    metalness: 0.2,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const BLUE = 0x3aa8ff;
  const GREEN = 0x52d24a;
  const ghostMat = (hex = BLUE, op = 0.32) =>
    new T.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false, side: T.DoubleSide });
  const lineMat = (hex = BLUE) => new T.MeshBasicMaterial({ color: hex, depthTest: false, transparent: true });

  // ── geometry helpers (local frame: x east, z south, y up — the lot's middle at x 0 z 0) ────────────────────
  let root;
  const add = (m, parent = root) => {
    m.castShadow = m.receiveShadow = !m.material?.transparent;
    parent.add(m);
    return m;
  };
  /** a box from its min corner to its max, its faces' UVs in metres (+ offsets) so a texture tiles at its scale */
  const box = (x0, y0, z0, x1, y1, z1, m, o = {}) => {
    const [w, h, d] = [x1 - x0, y1 - y0, z1 - z0];
    const g = new T.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [
      [d, h, z0, y0],
      [d, h, z0, y0],
      [w, d, x0, z0],
      [w, d, x0, z0],
      [w, h, x0, y0],
      [w, h, x0, y0],
    ];
    for (let f = 0; f < 6; f++) {
      const [du, dv, ou, ov] = dims[f];
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * du + (o.u ?? ou), uv.getY(k) * dv + (o.v ?? ov));
      }
    }
    // the texture's own size: scale the metres down
    const mm = Array.isArray(m) ? m : [m];
    for (const q of mm) if (q.map && !q.userData.scaled) scaleMap(q);
    const mesh = new T.Mesh(g, m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return add(mesh, o.parent);
  };
  const scaleMap = (q) => {
    const s = q.map.userData.m ?? 2;
    q.map = q.map.clone();
    q.map.repeat.set(1 / s, 1 / s);
    q.map.needsUpdate = true;
    q.userData.scaled = true;
  };
  /** a wall from a to b (axis-aligned), `out` the outward side's sign of the left normal, openings cut along it */
  const wall = (a, b, y0, h, o = {}) => {
    const t = o.t ?? 0.2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    const g = new T.Group();
    g.position.set(a[0], 0, a[1]);
    g.rotation.y = -Math.atan2(dz, dx);
    (o.parent ?? root).add(g);
    const outM = o.outM ?? mat(tx.sidWhite);
    const inM = o.inM ?? mat(tx.plaster);
    const edge = o.edgeM ?? TRIM;
    // BoxGeometry's faces: px nx py ny pz nz — pz is the left normal's side
    const faces = o.out > 0 ? [edge, edge, edge, edge, outM, inM] : [edge, edge, edge, edge, inM, outM];
    const ops = [...(o.open ?? [])].sort((p, q) => p.at - q.at);
    let u = 0;
    const piece = (u0, u1, v0, v1) => {
      if (u1 - u0 < 0.01 || v1 - v0 < 0.01) return;
      box(u0, y0 + v0, -t / 2, u1, y0 + v1, t / 2, faces, { parent: g });
    };
    for (const p of ops) {
      piece(u, p.at, 0, h);
      piece(p.at, p.at + p.w, 0, p.sill);
      piece(p.at, p.at + p.w, p.top, h);
      opening(g, p, y0, t, o.out);
      u = p.at + p.w;
    }
    piece(u, L, 0, h);
    return g;
  };
  /** a window or a door in a wall's group (its frame along x from p.at, over the wall's base y0) */
  const opening = (g, p, y0, t, out) => {
    const s = out > 0 ? 1 : -1;
    const [x0, x1, b, top] = [p.at, p.at + p.w, y0 + p.sill, y0 + p.top];
    const fr = 0.07;
    const tm = p.trim ?? TRIM;
    // the frame in the wall's thickness
    box(x0, b, -t / 2, x0 + fr, top, t / 2, tm, { parent: g });
    box(x1 - fr, b, -t / 2, x1, top, t / 2, tm, { parent: g });
    box(x0, top - fr, -t / 2, x1, top, t / 2, tm, { parent: g });
    if (p.kind !== "door" && p.kind !== "arch") box(x0, b, -t / 2, x1, b + fr, t / 2, tm, { parent: g });
    // the casing on the outside face, and a sill
    const zf = (s * t) / 2;
    const zc = zf + s * 0.03;
    const cas = 0.1;
    const zz = (a, b2) => (a < b2 ? [a, b2] : [b2, a]);
    const [c0, c1] = zz(zf, zc);
    box(x0 - cas, b, c0, x0, top + cas, c1, tm, { parent: g });
    box(x1, b, c0, x1 + cas, top + cas, c1, tm, { parent: g });
    box(x0 - cas, top, c0, x1 + cas, top + cas + 0.02, c1, tm, { parent: g });
    if (p.kind !== "door" && p.kind !== "arch") {
      const [s0, s1] = zz(zf, zf + s * 0.08);
      box(x0 - cas - 0.04, b - 0.05, s0, x1 + cas + 0.04, b + 0.01, s1, tm, { parent: g });
    }
    if (p.kind === "arch") return;
    if (p.kind === "door") {
      const dm = p.door ?? col(0x2f5a46);
      const zd = zz(-0.025, 0.025);
      const n = p.w > 1.6 ? 2 : 1;
      const dw = (p.w - 2 * fr) / n;
      for (let i = 0; i < n; i++) {
        const a0 = x0 + fr + i * dw;
        if (p.glassDoor) {
          box(a0, b, zd[0], a0 + dw, top - fr, zd[1], GLASS, { parent: g });
          box(a0, b, zd[0] - 0.01, a0 + 0.06, top - fr, zd[1] + 0.01, tm, { parent: g });
          box(a0 + dw - 0.06, b, zd[0] - 0.01, a0 + dw, top - fr, zd[1] + 0.01, tm, { parent: g });
          box(a0, b, zd[0] - 0.01, a0 + dw, b + 0.12, zd[1] + 0.01, tm, { parent: g });
          continue;
        }
        box(a0, b, zd[0], a0 + dw, top - fr, zd[1], dm, { parent: g });
        // raised panels and a glass light at the top
        const zp = zz(s * 0.025, s * 0.045);
        box(a0 + 0.12, b + 0.2, zp[0], a0 + dw - 0.12, b + 0.9, zp[1], dm, { parent: g });
        box(a0 + 0.12, b + 1.45, zp[0] - 0.005, a0 + dw - 0.12, top - fr - 0.15, zp[1] + 0.005, GLASS, { parent: g });
        box(a0 + dw - 0.2, b + 0.98, zp[0], a0 + dw - 0.14, b + 1.06, zp[1] + s * 0.04, col(0xc9a54a, { metalness: 0.8, roughness: 0.3 }), { parent: g });
      }
      return;
    }
    // a window: the glass, its bars (six over six), shutters
    box(x0 + fr, b + fr, -0.01, x1 - fr, top - fr, 0.01, GLASS, { parent: g });
    const panes = p.panes ?? Math.max(1, Math.round(p.w / 0.9));
    const bar = 0.035;
    for (let i = 1; i < panes; i++) {
      const xx = x0 + (i * p.w) / panes;
      box(xx - 0.05, b, -0.03, xx + 0.05, top, 0.03, tm, { parent: g });
    }
    const mid = (b + top) / 2;
    box(x0 + fr, mid - 0.03, -0.03, x1 - fr, mid + 0.03, 0.03, tm, { parent: g });
    if (p.bars !== false) {
      for (let i = 0; i < panes; i++) {
        const xa = x0 + (i * p.w) / panes;
        const xb = x0 + ((i + 1) * p.w) / panes;
        box((xa + xb) / 2 - bar / 2, b + fr, -0.02, (xa + xb) / 2 + bar / 2, top - fr, 0.02, tm, { parent: g });
        for (const f of [1 / 4, 3 / 4]) {
          const yy = b + (top - b) * f;
          box(xa + 0.05, yy - bar / 2, -0.02, xb - 0.05, yy + bar / 2, 0.02, tm, { parent: g });
        }
      }
    }
    if (p.shutters) {
      const sm = col(p.shutters);
      const [h0, h1] = zz(zc, zc + s * 0.04);
      const sw = Math.min(0.45, p.w / 2);
      for (const [a0, a1] of [
        [x0 - cas - sw - 0.02, x0 - cas - 0.02],
        [x1 + cas + 0.02, x1 + cas + sw + 0.02],
      ]) {
        box(a0, b, h0, a1, top, h1, sm, { parent: g });
        for (let yy = b + 0.08; yy < top - 0.05; yy += 0.09)
          box(a0 + 0.04, yy, h1 - s * 0.005 - 0.01, a1 - 0.04, yy + 0.03, h1 + 0.012, col(0x000000, { opacity: 0.25, transparent: true }), { parent: g });
      }
    }
  };
  /** a floor slab over a ring (local x, z) with holes, its top at y, `d` thick */
  const slab = (ring, holes, y, d, m, o = {}) => {
    const sh = new T.Shape(ring.map(([x, z]) => new T.Vector2(x, -z)));
    for (const h of holes ?? []) sh.holes.push(new T.Path(h.map(([x, z]) => new T.Vector2(x, -z))));
    const g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y - d, 0);
    const mm = [m, o.side ?? TRIM];
    for (const q of mm) if (q.map && !q.userData.scaled) scaleMap(q);
    return add(new T.Mesh(g, mm), o.parent);
  };
  const rect = (x0, z0, x1, z1) => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  /** triangles and quads of one material, UVs from a plane (origin, u axis, v axis) in metres */
  const surf = (m, polys, o = {}) => {
    const pos = [];
    const uvs = [];
    for (const { pts, u, v, o: or } of polys) {
      const tri = (a, b2, cc) => {
        for (const p of [a, b2, cc]) {
          pos.push(p[0], p[1], p[2]);
          const d = [p[0] - or[0], p[1] - or[1], p[2] - or[2]];
          uvs.push(d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]);
        }
      };
      for (let i = 1; i + 1 < pts.length; i++) tri(pts[0], pts[i], pts[i + 1]);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    if (m.map && !m.userData.scaled) scaleMap(m);
    const q = m.side === T.DoubleSide ? m : m.clone();
    q.side = T.DoubleSide;
    return add(new T.Mesh(g, q), o.parent);
  };
  const sub = (a, b2) => [a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]];
  const unit = (a) => {
    const l = Math.hypot(...a);
    return a.map((q) => q / l);
  };
  /** a sloped face: its UV u along its eave (p0→p1), v up the slope */
  const slope = (pts) => {
    const u = unit(sub(pts[1], pts[0]));
    const n = unit([
      u[1] * 0 - u[2] * 1,
      u[2] * 0 - u[0] * 0,
      u[0] * 1 - u[1] * 0,
    ]);
    // v: from the eave towards the face's far points, in its plane
    const far = pts[pts.length - 1];
    const w = sub(far, pts[0]);
    const k = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
    const v = unit([w[0] - k * u[0], w[1] - k * u[1], w[2] - k * u[2]]);
    void n;
    return { pts, u, v, o: pts[0] };
  };
  /** a hip roof over a rectangle (eaves at y, pitch°, overhang): its faces and fascia */
  const hipRoof = (x0, z0, x1, z1, y, pitch, ov, m, o = {}) => {
    [x0, z0, x1, z1] = [x0 - ov, z0 - ov, x1 + ov, z1 + ov];
    const t = Math.tan((pitch * Math.PI) / 180);
    const along = x1 - x0 >= z1 - z0;
    const half = (along ? z1 - z0 : x1 - x0) / 2;
    const r = y + half * t;
    const yE = y - ov * t;
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const A = [x0, yE, z0];
    const B = [x1, yE, z0];
    const C = [x1, yE, z1];
    const D = [x0, yE, z1];
    const R0 = along ? [x0 + half, r, cz] : [cx, r, z0 + half];
    const R1 = along ? [x1 - half, r, cz] : [cx, r, z1 - half];
    const faces = along
      ? [slope([A, B, R1, R0]), slope([C, D, R0, R1]), slope([D, A, R0]), slope([B, C, R1])]
      : [slope([A, B, R0]), slope([C, D, R1]), slope([D, A, R0, R1]), slope([B, C, R1, R0])];
    const mesh = surf(m, faces, o);
    fascia([A, B, C, D], o);
    return { mesh, ridge: [R0, R1], eaves: [A, B, C, D], top: r };
  };
  const fascia = (ring, o = {}) => {
    for (let i = 0; i < ring.length; i++) {
      const [p, q] = [ring[i], ring[(i + 1) % ring.length]];
      surf(TRIM, [{ pts: [p, q, [q[0], q[1] - 0.18, q[2]], [p[0], p[1] - 0.18, p[2]]], u: [1, 0, 0], v: [0, 1, 0], o: p }], o);
    }
  };
  /** a gable roof over a rectangle, its ridge along z (dir "z") or x; its gable ends' triangles in `gm` */
  const gableRoof = (x0, z0, x1, z1, y, pitch, ov, dir, m, gm, o = {}) => {
    const t = Math.tan((pitch * Math.PI) / 180);
    const out = [];
    if (dir === "z") {
      const half = (x1 - x0) / 2;
      const r = y + half * t;
      const cx = (x0 + x1) / 2;
      const yE = y - ov * t;
      const [za, zb] = [z0 - (o.front ?? ov), z1 + (o.back ?? 0)];
      const L0 = [x0 - ov, yE, za];
      const L1 = [x0 - ov, yE, zb];
      const R0 = [cx, r, za];
      const R1 = [cx, r, zb];
      const Q0 = [x1 + ov, yE, za];
      const Q1 = [x1 + ov, yE, zb];
      out.push(surf(m, [slope([L1, L0, R0, R1]), slope([Q0, Q1, R1, R0])], o));
      fascia([L0, R0, Q0], o);
      for (const zz of o.ends ?? [z0]) surf(gm, [{ pts: [[x0, y, zz], [x1, y, zz], [cx, r, zz]], u: [1, 0, 0], v: [0, 1, 0], o: [x0, y, zz] }], o);
      return { ridge: [R0, R1], top: r };
    }
    const half = (z1 - z0) / 2;
    const r = y + half * t;
    const cz = (z0 + z1) / 2;
    const yE = y - ov * t;
    const [xa, xb] = [x0 - ov, x1 + ov];
    const A0 = [xa, yE, z0 - ov];
    const A1 = [xb, yE, z0 - ov];
    const R0 = [xa, r, cz];
    const R1 = [xb, r, cz];
    const B0 = [xa, yE, z1 + ov];
    const B1 = [xb, yE, z1 + ov];
    out.push(surf(m, [slope([A0, A1, R1, R0]), slope([B1, B0, R0, R1])], o));
    for (const xx of o.ends ?? [x0, x1]) surf(gm, [{ pts: [[xx, y, z0], [xx, y, z1], [xx, r, cz]], u: [0, 0, 1], v: [0, 1, 0], o: [xx, y, z0] }], o);
    return { ridge: [R0, R1], top: r };
  };

  // ── ghosts, lines, handles ──────────────────────────────────────────────────────────────────────────────────
  const ribbon = (a, b2, hex = BLUE, w = 0.07, o = {}) => {
    const len = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
    const m = new T.Mesh(new T.BoxGeometry(len, w, w), o.mat ?? lineMat(hex));
    m.position.set((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2);
    m.lookAt(new T.Vector3(b2[0], b2[1], b2[2]).add(new T.Vector3(...[0, 0, 0])));
    m.rotateY(Math.PI / 2);
    m.renderOrder = 20;
    (o.parent ?? root).add(m);
    return m;
  };
  const dashed = (a, b2, hex, dash = 0.6, w = 0.08, mat2) => {
    const len = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]);
    const n = Math.floor(len / dash);
    for (let i = 0; i < n; i += 2) {
      const f0 = i / n;
      const f1 = Math.min(1, (i + 1) / n);
      const p = (f) => [a[0] + (b2[0] - a[0]) * f, a[1] + (b2[1] - a[1]) * f, a[2] + (b2[2] - a[2]) * f];
      ribbon(p(f0), p(f1), hex, w, { mat: mat2 });
    }
  };
  const ball = (p, r = 0.16, hex = 0xffffff, ring = BLUE) => {
    const g = new T.Group();
    const s = new T.Mesh(new T.SphereGeometry(r, 20, 14), new T.MeshBasicMaterial({ color: hex, depthTest: false, transparent: true }));
    const s2 = new T.Mesh(new T.SphereGeometry(r * 1.35, 20, 14), new T.MeshBasicMaterial({ color: ring, depthTest: false, transparent: true }));
    s.renderOrder = 22;
    s2.renderOrder = 21;
    g.add(s2, s);
    g.position.set(...p);
    root.add(g);
    return g;
  };
  /** an arrow handle: a shaft and a head from p along dir (unit), `len` m */
  const arrow = (p, dir, len = 1.1, hex = BLUE, both = false) => {
    const g = new T.Group();
    const m = new T.MeshBasicMaterial({ color: hex, depthTest: false, transparent: true });
    const wm = new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
    const shaft = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, len, 10), m);
    shaft.position.y = len / 2;
    const head = new T.Mesh(new T.ConeGeometry(0.17, 0.38, 16), m);
    head.position.y = len + 0.19;
    const rim = new T.Mesh(new T.ConeGeometry(0.22, 0.48, 16), wm);
    rim.position.y = len + 0.17;
    g.add(rim, shaft, head);
    if (both) {
      const h2 = head.clone();
      h2.position.y = -0.19;
      h2.rotation.z = Math.PI;
      const r2 = rim.clone();
      r2.position.y = -0.17;
      r2.rotation.z = Math.PI;
      g.add(r2, h2);
    }
    for (const q of g.children) q.renderOrder = 23;
    g.position.set(...p);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...dir).normalize());
    root.add(g);
    return g;
  };
  const ghostBox = (x0, y0, z0, x1, y1, z1, hex = BLUE, op = 0.3) => {
    const m = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), ghostMat(hex, op));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.renderOrder = 15;
    root.add(m);
    const e = new T.LineSegments(new T.EdgesGeometry(m.geometry), new T.LineBasicMaterial({ color: hex, transparent: true, depthTest: false }));
    e.position.copy(m.position);
    e.renderOrder = 16;
    root.add(e);
    outlineBox(x0, y0, z0, x1, y1, z1, hex);
    return m;
  };
  const outlineBox = (x0, y0, z0, x1, y1, z1, hex) => {
    const P = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]])
      ribbon(P[i], P[j], hex, 0.05);
  };
  const outlineRing = (ring, y, hex = BLUE, w = 0.08) => {
    for (let i = 0; i < ring.length; i++) {
      const [p, q] = [ring[i], ring[(i + 1) % ring.length]];
      ribbon([p[0], y, p[1]], [q[0], y, q[1]], hex, w);
    }
  };
  const fillRing = (ring, y, hex = BLUE, op = 0.22) => {
    const sh = new T.Shape(ring.map(([x, z]) => new T.Vector2(x, -z)));
    const g = new T.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const m = new T.Mesh(g, ghostMat(hex, op));
    m.renderOrder = 14;
    root.add(m);
    return m;
  };

  // ── the house's parts ──────────────────────────────────────────────────────────────────────────────────────
  // main block x −6..5, z −6..2 (two storeys); the wing (dining) x −6..−1, z −10..−6 (one); the porch x −1..5,
  // z −9.5..−6; the lot x −11..11, z −13..15, its front on the path (north, −z)
  const MAIN = [-6, -6, 5, 2];
  const WING = [-6, -10, -1, -6];
  const PORCH = [-1, -9.5, 5, -6];
  const LOT = [-11, -13, 11, 15];
  const STAIR = { x: -5.85, z: 1.0, w: 1.0 };

  const lot = (o = {}) => {
    const [x0, z0, x1, z1] = LOT;
    const ring = rect(x0, z0, x1, z1);
    for (let i = 0; i < 4; i++) {
      const [p, q] = [ring[i], ring[(i + 1) % 4]];
      const y = (x, z) => land(x, z) + 0.06;
      const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.8);
      for (let k = 0; k < n; k += 2) {
        const f0 = k / n;
        const f1 = (k + 1) / n;
        const a = [p[0] + (q[0] - p[0]) * f0, 0, p[1] + (q[1] - p[1]) * f0];
        const b2 = [p[0] + (q[0] - p[0]) * f1, 0, p[1] + (q[1] - p[1]) * f1];
        a[1] = y(a[0], a[2]);
        b2[1] = y(b2[0], b2[2]);
        ribbon(a, b2, o.hex ?? 0xffffff, 0.12, { mat: new T.MeshBasicMaterial({ color: o.hex ?? 0xffffff }) });
      }
    }
    // corner pegs
    for (const [x, z] of ring) {
      box(x - 0.06, land(x, z) - 0.1, z - 0.06, x + 0.06, land(x, z) + 0.55, z + 0.06, col(0xf2f2f2));
      box(x - 0.07, land(x, z) + 0.42, z - 0.07, x + 0.07, land(x, z) + 0.55, z + 0.07, col(0x2a84dc));
    }
  };
  const sign = () => {
    const [x, z] = [-8.2, -13.6];
    const y = land(x, z);
    const post = col(0xf3f1ec);
    box(x - 0.06, y - 0.2, z - 0.06, x + 0.06, y + 1.9, z + 0.06, post);
    box(x - 0.06, y + 1.75, z - 0.06, x + 1.05, y + 1.85, z + 0.06, post);
    // the board, hung from the arm
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 320;
    const g = cv.getContext("2d");
    g.fillStyle = "#fdfbf6";
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = "#1f74cf";
    g.fillRect(0, 0, 512, 86);
    g.fillStyle = "#fff";
    g.font = "900 58px Nunito, sans-serif";
    g.textAlign = "center";
    g.fillText("FOR SALE", 256, 64);
    g.fillStyle = "#123e6a";
    g.font = "900 54px Nunito, sans-serif";
    g.fillText("Lot 7", 256, 170);
    g.font = "800 34px Nunito, sans-serif";
    g.fillText("Pine Meadow · 24 × 28 m", 256, 230);
    g.fillStyle = "#3fae3a";
    g.font = "900 34px Nunito, sans-serif";
    g.fillText("FREE · CLAIM IT", 256, 292);
    const t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    const face = new T.MeshStandardMaterial({ map: t, roughness: 0.7 });
    const bm = [TRIM, TRIM, TRIM, TRIM, face, face];
    const b = new T.Mesh(new T.BoxGeometry(0.95, 0.6, 0.04), bm);
    b.position.set(x + 0.55, y + 1.38, z);
    b.rotation.y = Math.PI;
    add(b);
    box(x + 0.15, y + 1.68, z - 0.01, x + 0.17, y + 1.76, z + 0.01, col(0x555555));
    box(x + 0.93, y + 1.68, z - 0.01, x + 0.95, y + 1.76, z + 0.01, col(0x555555));
    return [x + 0.55, y + 1.38, z];
  };
  const foundation = (rings, o = {}) => {
    for (const r of rings) {
      const [x0, z0, x1, z1] = r;
      // its sides in fieldstone down into the land, its top a concrete deck under the floors
      box(x0, G - 0.8, z0, x1, F, z1, [mat(tx.field), mat(tx.field), mat(tx.concrete), mat(tx.field), mat(tx.field), mat(tx.field)]);
      box(x0 - 0.05, F - 0.04, z0 - 0.05, x1 + 0.05, F + 0.02, z1 + 0.05, col(0xd9d4ca));
      void o;
    }
  };
  const porchSteps = (x0, x1, z, n = 3) => steps(x0, x1, z, n, [mat(tx.field), mat(tx.field), mat(tx.deck), mat(tx.deck), mat(tx.field), mat(tx.field)]);
  const steps = (x0, x1, z, n = 3, m) => {
    const h = (F - G) / (n + 1);
    for (let i = 0; i < n; i++) {
      const top = F - (i + 1) * h;
      box(x0, G - 0.3, z - (i + 1) * 0.3, x1, top, z - i * 0.3, m ?? mat(tx.concrete));
    }
  };
  const floorsGround = () => {
    // living (oak), kitchen (checker), dining (walnut)
    slab(rect(-6, -6, 0, 2), [], F + 0.03, 0.03, mat(tx.oak));
    slab(rect(0, -6, 5, 2), [], F + 0.03, 0.03, mat(tx.oak));
    slab(rect(...WING), [], F + 0.03, 0.03, mat(tx.walnut));
    slab(rect(...PORCH), [], F + 0.03, 0.03, mat(tx.deck));
  };
  const OUT = { sid: () => mat(tx.sidWhite) };
  // the ground storey's walls; `cut`: the walls facing the camera stand low (the cutaway)
  const wallsGround = (o = {}) => {
    const h = (front) => (o.cut && front ? 0.6 : ST);
    const outM = o.outM ?? mat(tx.sidWhite);
    const W = (a, b, out, op, front, extra = {}) =>
      wall(a, b, F, h(front), { out, open: o.cut && front ? [] : op, outM, ...extra });
    const win = (at, w = 1.0, extra = {}) => ({ at, w, sill: 0.9, top: 2.3, ...extra });
    // the wing: its bay of three joined windows on the front, one each side
    W([-6, -10], [-1, -10], -1, [win(1.05, 2.9, { panes: 3 })], true);
    W([-6, -6], [-6, -10], -1, [win(1.5, 1.0, { shutters: o.shutters ? 0x2f4060 : null })], true);
    W([-1, -10], [-1, -6], -1, [win(1.5, 1.0)], false);
    // the main block: the front door under the porch, the arch to the wing
    W([-1, -6], [5, -6], -1, [{ at: 2.6, w: 1.1, sill: 0, top: 2.25, kind: "door" }, win(4.3, 1.0)], true, { inM: mat(tx.plaster) });
    W([5, -6], [5, 2], -1, [win(1.5), win(5.0)], false);
    W([5, 2], [-6, 2], -1, [{ at: 2.0, w: 1.8, sill: 0, top: 2.25, kind: "door", glassDoor: true }, win(6.5, 1.6, { panes: 2 })], false);
    W([-6, 2], [-6, -6], -1, [win(2.0), win(5.4)], true);
    // inside: the kitchen's wall with a door, the arch into the dining room
    wall([0, -6], [0, 2], F, o.cut ? 0.6 : ST, { out: 1, outM: mat(tx.plaster), inM: mat(tx.plaster), open: o.cut ? [] : [{ at: 3.6, w: 0.9, sill: 0, top: 2.2, kind: "arch" }], t: 0.12 });
    wall([-6, -6], [-1, -6], F, o.cut ? 0.6 : ST, { out: 1, outM: mat(tx.plaster), inM: mat(tx.stripe), open: o.cut ? [] : [{ at: 1.2, w: 2.4, sill: 0, top: 2.4, kind: "arch" }], t: 0.12 });
  };
  const floorUp = (o = {}) => {
    const hole = [
      [-4.6, 1.0],
      [-3.45, 1.0],
      [-3.45, -1.5],
      [-2.45, -1.5],
      [-2.45, 2.0],
      [-4.6, 2.0],
    ];
    slab(rect(-6.1, -6.1, 5.1, 2.1), o.hole === false ? [] : [hole.slice().reverse()], F2, SLAB, mat(tx.greyoak), { side: mat(tx.sidWhite) });
    return hole;
  };
  const wallsUp = (o = {}) => {
    const h = (front) => (o.cut && front ? 0.6 : ST);
    const outM = o.outM ?? mat(tx.sidWhite);
    const W = (a, b, out, op, front) => wall(a, b, F2, h(front), { out, open: o.cut && front ? [] : op, outM, inM: mat(tx.floral) });
    const win = (at, w = 1.0, extra = {}) => ({ at, w, sill: 0.9, top: 2.2, ...extra });
    W([-6, -6], [5, -6], -1, [win(0.7, 0.9, { shutters: o.shutters ? 0x2f4060 : null }), win(6.1, 1.0, { shutters: o.shutters ? 0x2f4060 : null }), win(9.0, 1.0, { shutters: o.shutters ? 0x2f4060 : null })], true);
    W([5, -6], [5, 2], -1, [win(1.5), win(5.0)], false);
    W([5, 2], [-6, 2], -1, [win(2.0), win(7.0)], false);
    W([-6, 2], [-6, -6], -1, [win(1.6), win(5.6)], true);
  };
  /** the L stairs: run one up the left wall (towards the back), a landing in the corner, run two along the back wall */
  const XA = -5.9;
  const XB = -4.9;
  const ZF = -1.5;
  const stairs = () => {
    const n1 = 8;
    const n2 = 8;
    const h = (F2 - F) / (n1 + n2);
    const tread = mat(tx.oak);
    const side = col(0xf3f1ec);
    const T3 = [side, side, tread, side, side, side];
    for (let i = 0; i < n1; i++) {
      const za = ZF + i * 0.3;
      const top = F + (i + 1) * h;
      box(XA, top - 0.05, za - 0.02, XB, top, za + 0.3, T3);
      box(XA + 0.03, top - h, za, XB - 0.03, top - 0.05, za + 0.025, side);
    }
    const zl = ZF + n1 * 0.3; // 0.9: the landing
    const yl = F + n1 * h;
    box(XA, yl - 0.12, zl, XB + 0.1, yl, 1.9, T3);
    for (const [px, pz] of [[XB + 0.05, zl + 0.05], [XB + 0.05, 1.85]]) box(px - 0.05, F, pz - 0.05, px + 0.05, yl - 0.12, pz + 0.05, side);
    for (let i = 0; i < n2; i++) {
      const xa = XB + 0.1 + i * 0.3;
      const top = yl + (i + 1) * h;
      box(xa - 0.02, top - 0.05, zl, xa + 0.3, top, 1.9, T3);
      box(xa, top - h, zl + 0.03, xa + 0.025, top - 0.05, 1.87, side);
    }
    const xe = XB + 0.1 + n2 * 0.3;
    const board = (a, b, hh, t) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const m = new T.Mesh(new T.BoxGeometry(len, hh, t), side);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      m.lookAt(b[0], b[1], b[2]);
      m.rotateY(Math.PI / 2);
      add(m);
    };
    for (const xx of [XA + 0.02, XB - 0.02]) board([xx, F + 0.02, ZF], [xx, yl - 0.1, zl], 0.26, 0.04);
    for (const zz of [zl + 0.02, 1.88]) board([XB + 0.1, yl - 0.1, zz], [xe, F2 - 0.1, zz], 0.26, 0.04);
    // the rail on the open sides: balusters and a handrail
    const rail = col(0x3a2a1e);
    for (let i = 0; i < n1; i++) {
      const z = ZF + i * 0.3 + 0.15;
      const top = F + (i + 1) * h;
      box(XB - 0.06, top, z - 0.02, XB - 0.02, top + 0.9, z + 0.02, side);
    }
    ribbon([XB - 0.04, F + h + 0.92, ZF + 0.15], [XB - 0.04, yl + 0.92, zl], 0, 0.06, { mat: rail });
    for (let i = 0; i < n2; i++) {
      const x = XB + 0.1 + i * 0.3 + 0.15;
      const top = yl + (i + 1) * h;
      box(x - 0.02, top, zl + 0.02, x + 0.02, top + 0.9, zl + 0.06, side);
    }
    ribbon([XB - 0.04, yl + 0.92, zl + 0.04], [xe, F2 + 0.92, zl + 0.04], 0, 0.06, { mat: rail });
    box(XB - 0.08, F, ZF - 0.04, XB, F + h + 1.0, ZF + 0.04, side);
    return { zl, yl, xe };
  };
  const holeRail = () => {
    const side = col(0xf3f1ec);
    const rail = col(0x3a2a1e);
    // along the hole's open edges on the upper floor: x −4.3..−2.8 at z 1.0, and z −2.2..1.0 at x −2.8
    const runs = [
      [[-4.6, 1.9], [-4.6, 1.0]],
      [[-4.6, 1.0], [-3.45, 1.0]],
      [[-3.45, 1.0], [-3.45, -1.5]],
      [[-2.45, -1.5], [-2.45, 1.9]],
    ];
    for (const [a, b] of runs) {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12);
      for (let i = 0; i <= n; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / n;
        const z = a[1] + ((b[1] - a[1]) * i) / n;
        box(x - 0.02, F2, z - 0.02, x + 0.02, F2 + 0.95, z + 0.02, side);
      }
      ribbon([a[0], F2 + 0.97, a[1]], [b[0], F2 + 0.97, b[1]], 0, 0.07, { mat: rail });
    }
  };
  const porch = (o = {}) => {
    const [x0, z0, x1, z1] = PORCH;
    // columns: round, white, on square plinths
    const cm = col(0xf3f1ec);
    const cols = [
      [x0 + 0.2, z0 + 0.2],
      [x1 - 0.2, z0 + 0.2],
    ];
    for (const [x, z] of cols) {
      box(x - 0.17, F, z - 0.17, x + 0.17, F + 0.25, z + 0.17, cm);
      const cy = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, ST - 0.4, 20), cm);
      cy.position.set(x, F + 0.25 + (ST - 0.4) / 2, z);
      add(cy);
      box(x - 0.16, F + ST - 0.15, z - 0.16, x + 0.16, F + ST, z + 0.16, cm);
    }
    // the beam over the columns
    box(x0 + 0.02, F + ST - 0.02, z0 + 0.05, x1 - 0.02, F + ST + 0.25, z0 + 0.35, cm);
    // the railing, either side of the steps (x 1.6..2.7 open)
    const rail = (xa, xb) => {
      box(xa, F + 0.85, z0 + 0.15, xb, F + 0.92, z0 + 0.25, cm);
      box(xa, F + 0.06, z0 + 0.15, xb, F + 0.12, z0 + 0.25, cm);
      for (let x = xa + 0.08; x < xb; x += 0.13) box(x - 0.02, F + 0.12, z0 + 0.18, x + 0.02, F + 0.85, z0 + 0.22, cm);
    };
    rail(x0 + 0.37, 1.55);
    rail(2.75, x1 - 0.37);
    if (o.roof !== false) {
      // the porch's shed roof, down from the main wall
      const yA = F + ST + 0.95;
      const yB = F + ST + 0.27;
      const za = z1;
      const zb = z0 - 0.35;
      surf(mat(tx.slate), [slope([[x1 + 0.3, yB, zb], [x0, yB, zb], [x0, yA, za], [x1 + 0.3, yA, za]])]);
      fascia([[x0, yB, zb], [x1 + 0.3, yB, zb]]);
    }
  };
  const fence = (o = {}) => {
    // a white picket fence along the lot's front, a gate at the walk (x 1.5..2.7)
    const fm = col(0xf4f3ef);
    const z = LOT[1] + 0.6;
    const run = (xa, xb) => {
      for (let x = xa; x <= xb + 1e-6; x += 2) {
        const y = land(x, z);
        box(x - 0.05, y - 0.2, z - 0.05, x + 0.05, y + 1.05, z + 0.05, fm);
      }
      for (let x = xa + 0.06; x < xb; x += 0.14) {
        const y = land(x, z);
        box(x - 0.035, y + 0.05, z + 0.04, x + 0.035, y + 0.92, z + 0.06, fm);
      }
      const ya = land(xa, z);
      const yb = land(xb, z);
      ribbon([xa, ya + 0.3, z + 0.01], [xb, yb + 0.3, z + 0.01], 0, 0.06, { mat: fm });
      ribbon([xa, ya + 0.78, z + 0.01], [xb, yb + 0.78, z + 0.01], 0, 0.06, { mat: fm });
    };
    run(LOT[0] + 0.6, o.upTo ?? 1.5);
    if (o.gate !== false && (o.upTo ?? 99) > 2.7) {
      const y = land(2.1, z);
      // the gate: an arch of pickets between two posts
      box(1.45, y - 0.2, z - 0.07, 1.6, y + 1.25, z + 0.07, fm);
      box(2.6, y - 0.2, z - 0.07, 2.75, y + 1.25, z + 0.07, fm);
      for (let x = 1.68; x < 2.58; x += 0.12) {
        const hh = 0.95 + 0.15 * Math.sin(((x - 1.6) / 1.0) * Math.PI);
        box(x - 0.035, y + 0.08, z - 0.01, x + 0.035, y + hh, z + 0.01, fm);
      }
      run(2.75, LOT[2] - 0.6);
    }
  };
  const walk = () => {
    // pavers from the gate to the porch steps, and on to the path
    for (let z = LOT[1] - 3.5; z < PORCH[1] - 1.0; z += 0.62) {
      const y = land(2.1, z);
      box(1.55, y - 0.1, z, 2.65, y + 0.05, z + 0.56, mat(tx.paving));
    }
  };
  const chimney = () => {
    const [x0, x1, z0, z1] = [-6.75, -5.95, -2.6, -1.4];
    box(x0, G - 0.4, z0, x1, EAVE + 2.6, z1, mat(tx.brick));
    box(x0 - 0.08, EAVE + 2.5, z0 - 0.08, x1 + 0.08, EAVE + 2.65, z1 + 0.08, mat(tx.concrete));
  };
  const roofs = (o = {}) => {
    const sl = o.roofM ?? mat(tx.slate);
    const main = hipRoof(-6, -6, 5, 2, EAVE, 30, 0.45, sl);
    const wing = gableRoof(-6, -10, -1, -6, F + ST, 35, 0.4, "z", sl, o.outM ?? mat(tx.sidWhite), { back: 0, ends: [-10] });
    // the wing's gable trim: a frieze board along its rakes
    return { main, wing };
  };
  const dormer = (o = {}) => {
    // on the main roof's front slope, over the porch: x 1.0..2.6
    const t = Math.tan((30 * Math.PI) / 180);
    const zf = -5.2; // its front face
    const yb = EAVE + (zf - -6) * t; // the slope's height there (z grows from the eave)
    const g = new T.Group();
    root.add(g);
    const gm = ghostMat(BLUE, 0.4);
    const m = o.ghost ? gm : mat(tx.sidWhite);
    const tm = o.ghost ? gm : TRIM;
    const [x0, x1] = [0.9, 2.7];
    const top = yb + 1.35;
    box(x0, yb - 0.4, zf, x1, top, -3.2, [tm, tm, tm, tm, m, m]);
    box(x0 + 0.3, yb + 0.15, zf - 0.04, x1 - 0.3, top - 0.18, zf + 0.01, tm);
    if (!o.ghost) box(x0 + 0.38, yb + 0.23, zf - 0.06, x1 - 0.38, top - 0.26, zf - 0.03, GLASS);
    box((x0 + x1) / 2 - 0.025, yb + 0.23, zf - 0.07, (x0 + x1) / 2 + 0.025, top - 0.26, zf - 0.05, tm);
    gableRoof(x0, zf, x1, -2.6, top, 40, 0.15, "z", o.ghost ? gm : mat(tx.slate), m, { back: 0, ends: [zf] });
    if (o.ghost) {
      for (const [p, q] of [[[x0, yb, zf], [x1, yb, zf]], [[x1, yb, zf], [x1, top, zf]], [[x1, top, zf], [(x0 + x1) / 2, top + 0.75, zf]], [[(x0 + x1) / 2, top + 0.75, zf], [x0, top, zf]], [[x0, top, zf], [x0, yb, zf]]]) ribbon(p, q, BLUE, 0.05);
    }
    return [(x0 + x1) / 2, top, zf];
  };
  const pool = (o = {}) => {
    // in the back garden: a patio of pavers, the pool x −3..3.5, z 5..11, 1.6 m deep
    const [px0, pz0, px1, pz1] = [-3, 5, 3.5, 11];
    let top = -Infinity;
    for (let x = -5.5; x <= 6.5; x += 1) for (let z = 2.2; z <= 13.2; z += 1) top = Math.max(top, land(x, z));
    top += 0.02;
    const deep = 1.6;
    // the patio round it (in four strips round the hole)
    const pav = mat(tx.paving);
    const pt = top + 0.04;
    box(-5.5, top - 0.3, 2.2, 6.5, pt, pz0 - 0.35, pav);
    box(-5.5, top - 0.3, pz1 + 0.35, 6.5, pt, 13.2, pav);
    box(-5.5, top - 0.3, pz0 - 0.35, px0 - 0.35, pt, pz1 + 0.35, pav);
    box(px1 + 0.35, top - 0.3, pz0 - 0.35, 6.5, pt, pz1 + 0.35, pav);
    // coping, a stone lip round the water
    const cp = col(0xe9e4da);
    box(px0 - 0.35, pt - 0.02, pz0 - 0.35, px1 + 0.35, pt + 0.05, pz0, cp);
    box(px0 - 0.35, pt - 0.02, pz1, px1 + 0.35, pt + 0.05, pz1 + 0.35, cp);
    box(px0 - 0.35, pt - 0.02, pz0, px0, pt + 0.05, pz1, cp);
    box(px1, pt - 0.02, pz0, px1 + 0.35, pt + 0.05, pz1, cp);
    // the shell: mosaic sides and floor
    const mo = mat(tx.mosaic);
    const b = top - deep;
    box(px0, b - 0.2, pz0, px1, b, pz1, mo);
    box(px0 - 0.1, b, pz0 - 0.1, px0, pt - 0.02, pz1 + 0.1, mo);
    box(px1, b, pz0 - 0.1, px1 + 0.1, pt - 0.02, pz1 + 0.1, mo);
    box(px0, b, pz0 - 0.1, px1, pt - 0.02, pz0, mo);
    box(px0, b, pz1, px1, pt - 0.02, pz1 + 0.1, mo);
    // the water
    const wg = new T.PlaneGeometry(px1 - px0, pz1 - pz0);
    wg.rotateX(-Math.PI / 2);
    const water = new T.Mesh(
      wg,
      new T.MeshStandardMaterial({ color: 0x4fb7d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    water.position.set((px0 + px1) / 2, pt - 0.18, (pz0 + pz1) / 2);
    water.renderOrder = 5;
    root.add(water);
    // a ladder at the deep end
    const steel = col(0xd8dde2, { metalness: 0.9, roughness: 0.25 });
    for (const x of [1.6, 2.15]) {
      const cy = new T.Mesh(new T.TorusGeometry(0.35, 0.025, 8, 20, Math.PI), steel);
      cy.position.set(x, pt + 0.0, pz1 - 0.05);
      cy.rotation.y = Math.PI / 2;
      add(cy);
      box(x - 0.025, b + 0.4, pz1 - 0.42, x + 0.025, pt, pz1 - 0.37, steel);
    }
    for (let y = b + 0.6; y < pt - 0.2; y += 0.3) box(1.6, y, pz1 - 0.5, 2.15, y + 0.03, pz1 - 0.37, steel);
    // two loungers on the patio
    for (const x of [-4.6, -3.4]) {
      box(x - 0.35, pt, 3.0, x + 0.35, pt + 0.35, 4.9, col(0xf3f1ec));
      surf(col(0xf3f1ec), [{ pts: [[x - 0.35, pt + 0.35, 3.0], [x + 0.35, pt + 0.35, 3.0], [x + 0.35, pt + 1.0, 3.5], [x - 0.35, pt + 1.0, 3.5]], u: [1, 0, 0], v: [0, 1, 0], o: [x, pt, 3] }]);
    }
    return { px0, pz0, px1, pz1, pt, b };
  };

  // ── land and the game's things ─────────────────────────────────────────────────────────────────────────────
  const hidden = [];
  const clipped = [];
  /** cut the land out over a rectangle (local) — clipping planes on the land's materials, their inside taken */
  const cutLand = (x0, z0, x1, z1) => {
    tp.renderer.localClippingEnabled = true;
    const planes = [
      new T.Plane(new T.Vector3(-1, 0, 0), X0 + x0),
      new T.Plane(new T.Vector3(1, 0, 0), -(X0 + x1)),
      new T.Plane(new T.Vector3(0, 0, -1), Z0 + z0),
      new T.Plane(new T.Vector3(0, 0, 1), -(Z0 + z1)),
    ];
    const box3 = new T.Box3();
    tp.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.isInstancedMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (!o.geometry.boundingBox) return;
      box3.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (box3.max.x - box3.min.x < 30 || box3.max.y - box3.min.y > 60) return;
      if (!(box3.min.x < X0 && box3.max.x > X0 && box3.min.z < Z0 && box3.max.z > Z0)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || clipped.some((q) => q[0] === m)) continue;
        clipped.push([m, m.clippingPlanes, m.clipIntersection]);
        m.clippingPlanes = planes.map((p) => p.clone());
        m.clipIntersection = true;
        m.needsUpdate = true;
      }
    });
  };
  /** the game's world out of the picture (the basement's level view) */
  const hideWorld = () => {
    tp.scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !o.userData.mock) {
        hidden.push(o);
        o.visible = false;
      }
    });
  };
  const restore = () => {
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    for (const [m, p, i] of clipped) {
      m.clippingPlanes = p;
      m.clipIntersection = i;
      m.needsUpdate = true;
    }
    clipped.length = 0;
  };

  /** the basement: two storeys under the main block, the land cut away in front (a section), the house above gone */
  const basement = () => {
    const [x0, z0, x1, z1] = MAIN;
    const b1 = G - 3.1;
    const b2 = b1 - 3.25;
    const cut = -2.4; // the section's plane (z): in front of it, nothing
    const dm = mat(tx.dirt);
    const gm = mat(tx.ground);
    const E = [-13, cut, 12, 15];
    const deep = b2 - 0.6;
    // the earth round the basement, its section face at z = cut showing the dirt
    const earth = (ex0, ez0, ex1, ez1) => box(ex0, deep, ez0, ex1, G, ez1, [dm, dm, gm, dm, dm, dm]);
    earth(E[0], E[1], x0 - 0.3, E[3]);
    earth(x1 + 0.3, E[1], E[2], E[3]);
    earth(x0 - 0.3, z1 + 0.3, x1 + 0.3, E[3]);
    // the retaining walls (concrete), floors, the slab between
    const cm = mat(tx.concrete);
    box(x0 - 0.3, deep, cut, x0, G, z1 + 0.3, cm);
    box(x1, deep, cut, x1 + 0.3, G, z1 + 0.3, cm);
    box(x0, deep, z1, x1, G, z1 + 0.3, cm);
    box(x0 - 0.3, deep, cut, x1 + 0.3, b2, z1 + 0.3, cm);
    slab(rect(x0, cut, x1, z1), [], b2 + 0.03, 0.03, mat(tx.greyoak));
    // B1's floor, with its stairwell
    slab(rect(x0, cut, x1, z1), [rect(1.0, 0.8, 4.6, 2.0).reverse()], b1 + 0.03, 0.28, mat(tx.oak), { side: cm });
    // the ground floor's slab over it, the house's floor (its edge at the cut)
    slab(rect(x0 - 0.3, cut, x1 + 0.3, z1 + 0.3), [rect(1.0, 0.8, 4.6, 2.0).reverse()], G + 0.05, 0.3, mat(tx.oak), { side: cm });
    // B1: a rec room (stripe paper), B2: a wine cellar (brick)
    for (const [y, inner] of [
      [b1, mat(tx.stripe)],
      [b2, mat(tx.brick)],
    ]) {
      box(x0, y, z1 - 0.02, x1, y + 2.95, z1, inner);
      box(x0, y, cut, x0 + 0.02, y + 2.95, z1, inner);
      box(x1 - 0.02, y, cut, x1, y + 2.95, z1, inner);
      wall([-0.5, cut], [-0.5, z1], y, 2.95, { out: 1, outM: inner, inM: inner, t: 0.12, open: [{ at: 1.2, w: 0.9, sill: 0, top: 2.1, kind: "door" }] });
    }
    // the straight flights down: ground → B1 → B2, along the back wall
    const tread = mat(tx.oak);
    const side = col(0xe9e4da);
    for (const [ya, yb] of [
      [G + 0.05, b1 + 0.03],
      [b1 + 0.03, b2 + 0.03],
    ]) {
      const n = 15;
      const h = (ya - yb) / n;
      for (let i = 0; i < n; i++) box(1.0 + i * 0.24, yb, 0.85, 1.0 + (i + 1) * 0.24, yb + (n - i) * h, 1.95, [side, side, tread, side, side, side]);
    }
    // some life: a sofa and a rug in B1, racks of bottles in B2 (simple shapes)
    box(-5.2, b1 + 0.03, 0.6, -2.6, b1 + 0.45, 1.6, col(0x3e5f7a));
    box(-5.2, b1 + 0.03, 1.4, -2.6, b1 + 0.9, 1.75, col(0x3e5f7a));
    slab(rect(-5.3, -2.3, -2.2, 0.3), [], b1 + 0.045, 0.01, col(0xa8503a));
    for (let x = 0.2; x < 4.8; x += 0.9) box(x, b2 + 0.03, -2.4, x + 0.7, b2 + 2.0, -2.0, col(0x5a3a24));
    for (let x = -5.6; x < -1; x += 0.9) box(x, b2 + 0.03, 1.5, x + 0.7, b2 + 2.0, 1.9, col(0x5a3a24));
    // the cut's edge drawn: the section line
    ribbon([E[0], G + 0.02, cut], [E[2], G + 0.02, cut], 0xffffff, 0.05);
    return { b1, b2, cut };
  };

  // ── the shots ──────────────────────────────────────────────────────────────────────────────────────────────
  const W = 1440;
  const H = 900;
  const proj = (cam, p) => {
    const v = new T.Vector3(X0 + p[0], p[1], Z0 + p[2]).project(cam);
    return [Math.round(((v.x + 1) / 2) * W), Math.round(((1 - v.y) / 2) * H)];
  };
  const camera = (eye, at, fov = 38, lift = 150) => {
    const cam = tp.camera.clone();
    cam.fov = fov;
    cam.near = 0.1;
    cam.far = 900;
    cam.aspect = W / H;
    cam.position.set(X0 + eye[0], eye[1], Z0 + eye[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(X0 + at[0], at[1], Z0 + at[2]);
    cam.setViewOffset(W, H, 0, lift, W, H);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return cam;
  };
  const SHOTS = {};
  const front = (h = 0, d = 1) => camera([-17 * d, 11 * d + h, -22 * d], [0, G + 1.5, -3]);

  SHOTS.lot = () => {
    lot();
    const s = sign();
    const cam = camera([-12, G + 6.5, -25], [-1, G + 0.5, -4], 42, 90);
    return { cam, a: { sign: s, mid: [0, G, 1] } };
  };
  SHOTS.foundation = () => {
    lot();
    foundation([MAIN]);
    // the wing's being drawn: a ghost box, its height handle, its steps where the porch's door will be
    ghostBox(WING[0], G, WING[1], WING[2], F, WING[3], BLUE, 0.35);
    ghostBox(PORCH[0], G, PORCH[1], PORCH[2], F, PORCH[3], BLUE, 0.2);
    arrow([-3.5, F + 0.15, -10], [0, 1, 0], 1.1, BLUE, true);
    ball([-1, F, -10], 0.14);
    ball([-6, F, -10], 0.14);
    steps(1.6, 2.7, PORCH[1], 3, ghostMat(GREEN, 0.5));
    const cam = front(-1, 0.85);
    return { cam, a: { h: [-3.5, F + 1.6, -10], corner: [-1, F, -10], steps: [2.15, F, -10.4], main: [-0.5, F, -2] } };
  };
  SHOTS.basement = () => {
    hideWorld();
    dark = true;
    const r = basement();
    for (const [p, q] of [[[-6.3, -2.4], [-6.3, 2.3]], [[5.3, -2.4], [5.3, 2.3]], [[-6.3, 2.3], [5.3, 2.3]]]) dashed([p[0], G + 0.04, p[1]], [q[0], G + 0.04, q[1]], 0xffffff, 0.5, 0.07);
    const cam = camera([-11.5, G + 5.5, -16.5], [-0.5, G - 3.4, 0.5], 46, 120);
    return { cam, a: { b1: [-3.8, r.b1 + 2.2, -2.4], b2: [2.6, r.b2 + 2.2, -2.4], g: [-9, G, -2.4], stairs: [2.8, r.b1 + 1, 1.4] } };
  };
  SHOTS.walls = () => {
    lot();
    foundation([MAIN, WING, PORCH]);
    porchSteps(1.6, 2.7, PORCH[1]);
    floorsGround();
    wallsGround({});
    porch({ roof: false });
    fence({ upTo: 2.7, gate: false });
    // the fence still being drawn on from the gate's post
    const z = LOT[1] + 0.6;
    const ya = land(2.75, z);
    ribbon([2.75, ya + 0.5, z], [7.5, land(7.5, z) + 0.5, z], BLUE, 0.07);
    ghostBox(2.75, ya, z - 0.05, 7.5, ya + 1.05, z + 0.05, BLUE, 0.25);
    ball([7.5, land(7.5, z) + 0.5, z], 0.16);
    // the wing selected whole: its outline, the move cross and turn ring, a wall's push handle
    outlineRing(rect(...WING), F + 0.05, BLUE, 0.09);
    fillRing(rect(...WING), F + 0.06, BLUE, 0.18);
    arrow([-3.5, F + ST + 0.4, -8], [1, 0, 0], 1.2);
    arrow([-3.5, F + ST + 0.4, -8], [-1, 0, 0], 1.2);
    arrow([-3.5, F + ST + 0.4, -8], [0, 0, -1], 1.2);
    arrow([-3.5, F + ST + 0.4, -8], [0, 0, 1], 1.2);
    const ring = new T.Mesh(new T.TorusGeometry(1.9, 0.045, 8, 64), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-3.5, F + ST + 0.4, -8);
    ring.renderOrder = 22;
    root.add(ring);
    arrow([-6, F + 1.5, -8], [-1, 0, 0], 0.9, 0xffb020, true);
    const cam = front(1.5, 1.0);
    return { cam, a: { room: [-3.5, F + ST + 0.4, -8], push: [-7.3, F + 1.5, -8], fence: [7.5, land(7.5, z) + 0.5, z], col: [-0.8, F + 2.0, -9.3] } };
  };
  SHOTS.floors = () => {
    lot();
    foundation([MAIN, WING, PORCH]);
    porchSteps(1.6, 2.7, PORCH[1]);
    slab(rect(-6, -6, 0, 2), [], F + 0.03, 0.03, mat(tx.oak));
    slab(rect(0, -6, 5, 2), [], F + 0.03, 0.03, mat(tx.greyoak));
    slab(rect(...WING), [], F + 0.03, 0.03, mat(tx.walnut));
    slab(rect(...PORCH), [], F + 0.03, 0.03, mat(tx.deck));
    wallsGround({ cut: true });
    porch({ roof: false });
    // the kitchen: chessboard tiles painted one tile at a time, a triangle at the corner, the brush on the next tile
    const done = [];
    for (let x = 0; x < 5; x++) for (let z = -6; z < 2; z++) if (x + (z + 6) * 0.9 < 8.4 && !(x === 4 && z === -3)) done.push([x, z]);
    const cm = mat(tx.checker);
    for (const [x, z] of done) slab(rect(x + 0.06 * 0, z, x + 1, z + 1), [], F + 0.045, 0.01, cm);
    // half a tile, the triangle
    surf(cm, [{ pts: [[4, F + 0.046, -3], [5, F + 0.046, -3], [4, F + 0.046, -2]], u: [1 / 1.2, 0, 0], v: [0, 0, 1 / 1.2], o: [0, 0, 0] }]);
    // the brush: a tile's ghost (green) and its quarters
    const bx = 3;
    const bz = -2;
    fillRing(rect(bx, bz, bx + 1, bz + 1), F + 0.06, GREEN, 0.45);
    outlineRing(rect(bx, bz, bx + 1, bz + 1), F + 0.06, 0xffffff, 0.05);
    ribbon([bx + 0.5, F + 0.065, bz], [bx + 0.5, F + 0.065, bz + 1], 0xffffff, 0.025);
    ribbon([bx, F + 0.065, bz + 0.5], [bx + 1, F + 0.065, bz + 0.5], 0xffffff, 0.025);
    // the grid over the storey
    for (let x = -6; x <= 5; x++) ribbon([x, F + 0.05, -6], [x, F + 0.05, 2], 0xffffff, 0.012, { mat: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthTest: true }) });
    for (let z = -6; z <= 2; z++) ribbon([-6, F + 0.05, z], [5, F + 0.05, z], 0xffffff, 0.012, { mat: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthTest: true }) });
    const cam = camera([-7, F + 13, -15], [0.5, F, -1.5], 42, 120);
    return { cam, a: { brush: [bx + 0.5, F + 0.1, bz + 0.5], tri: [4.4, F, -2.6], kitchen: [2.5, F, -5.6] } };
  };
  SHOTS.stairs = () => {
    lot();
    foundation([MAIN, WING, PORCH]);
    porchSteps(1.6, 2.7, PORCH[1]);
    floorsGround();
    wallsGround({ cut: true });
    porch({ roof: false });
    const s = stairs();
    // the floor above, ghosted (you're on the ground floor): the hole the stairs cut in it, lit
    const hole = [
      [XA, -0.3],
      [XB, -0.3],
      [XB, s.zl],
      [s.xe, s.zl],
      [s.xe, 1.9],
      [XA, 1.9],
    ];
    const up = slab(rect(-6, -6, 5, 1.9), [hole.slice().reverse()], F2, 0.02, ghostMat(0xffffff, 0.14), { side: ghostMat(0xffffff, 0.14) });
    up.renderOrder = 12;
    up.castShadow = false;
    for (let i = 0; i < hole.length; i++) {
      const [p, q] = [hole[i], hole[(i + 1) % hole.length]];
      dashed([p[0], F2 + 0.02, p[1]], [q[0], F2 + 0.02, q[1]], 0xffb020, 0.25, 0.06);
    }
    // the stair tool's handles: its foot and top, its width, a landing's corner; its footprint lit
    outlineRing([[XA, ZF], [XB, ZF], [XB, s.zl], [s.xe, s.zl], [s.xe, 1.9], [XA, 1.9]], F + 0.06, BLUE, 0.06);
    ball([(XA + XB) / 2, F + 0.1, ZF], 0.15);
    ball([s.xe, F2 + 0.1, 1.4], 0.15);
    arrow([XB + 0.25, F + 0.5, -0.6], [1, 0, 0], 0.55, 0xffb020, true);
    ball([XB + 0.1, s.yl + 0.05, s.zl], 0.12, 0xffffff, 0xffb020);
    const cam = camera([-10.5, F + 7.2, -9.5], [-4.0, F + 1.3, 0.2], 46, 140);
    return { cam, a: { foot: [(XA + XB) / 2, F + 0.1, ZF], top: [s.xe, F2 + 0.1, 1.4], width: [XB + 1.0, F + 0.5, -0.6], landing: [XB + 0.1, s.yl + 0.05, s.zl], hole: [s.xe, F2, 0.9] } };
  };
  const wholeHouse = (o = {}) => {
    lot();
    foundation([MAIN, WING, PORCH]);
    porchSteps(1.6, 2.7, PORCH[1]);
    floorsGround();
    wallsGround({ outM: o.outM, shutters: o.shutters });
    porch();
    floorUp({ hole: false });
    wallsUp({ outM: o.outM, shutters: o.shutters });
    chimney();
    fence();
    walk();
    const h = (F - G) / 3;
    for (let i = 0; i < 2; i++) box(1.1, G - 0.3, 2.1 + i * 0.3, 3.1, F - (i + 1) * h, 2.1 + (i + 1) * 0.3, mat(tx.concrete));
  };
  SHOTS.roof = () => {
    wholeHouse({ shutters: true });
    const r = roofs();
    const d = dormer({ ghost: true });
    // the main roof selected: its eaves lit, a handle at each eave's middle, the pitch handle on the ridge
    const [A, B, C, D] = r.main.eaves;
    for (const [p, q] of [[A, B], [B, C], [C, D], [D, A]]) ribbon(p, q, BLUE, 0.09);
    const mid = (p, q) => [(p[0] + q[0]) / 2, p[1], (p[2] + q[2]) / 2];
    arrow(mid(A, B), [0, 0, -1], 0.8);
    arrow(mid(B, C), [1, 0, 0], 0.8);
    arrow(mid(D, A), [-1, 0, 0], 0.8);
    const [R0, R1] = r.main.ridge;
    ribbon(R0, R1, BLUE, 0.1);
    arrow(mid(R0, R1).map((v, i) => (i === 1 ? R0[1] + 0.1 : v)), [0, 1, 0], 0.9, 0xffb020);
    const cam = camera([-19, G + 14, -24], [-0.5, G + 3.4, -2], 40, 60);
    return { cam, a: { pitch: [(R0[0] + R1[0]) / 2, R0[1] + 1.3, (R0[2] + R1[2]) / 2], eave: mid(A, B), dormer: d, wing: [-3.5, F + ST + 1.2, -10.4] } };
  };
  SHOTS.openings = () => {
    wholeHouse({ shutters: true });
    roofs();
    dormer();
    // the wing's bay window selected: its outline, up/down and its sides' handles
    const z = -10.12;
    const [x0, x1, b, t] = [-4.95, -2.05, F + 0.9, F + 2.3];
    for (const [p, q] of [
      [[x0, b, z], [x1, b, z]],
      [[x1, b, z], [x1, t, z]],
      [[x1, t, z], [x0, t, z]],
      [[x0, t, z], [x0, b, z]],
    ])
      ribbon(p, q, BLUE, 0.06);
    arrow([(x0 + x1) / 2, t + 0.25, z], [0, 1, 0], 0.5, 0xffb020, true);
    ball([x0, (b + t) / 2, z], 0.13);
    ball([x1, (b + t) / 2, z], 0.13);
    // a joining ghost: one more pane being added to its right
    ghostBox(x1, b, z - 0.08, x1 + 0.95, t, z + 0.08, GREEN, 0.35);
    const cam = camera([-7.5, F + 3.4, -16.2], [-2.6, F + 1.5, -8.5], 44, 150);
    return { cam, a: { win: [(x0 + x1) / 2, t + 1.1, z], side: [x1 + 0.95, (b + t) / 2, z], door: [2.15, F + 1.2, -6.1], shut: [-6.1, F + 1.6, -8.0] } };
  };
  SHOTS.coverings = () => {
    wholeHouse({ outM: mat(tx.sidSage), shutters: true });
    roofs({ outM: mat(tx.sidSage) });
    dormer();
    // the Design tool on the main block's left wall: lit
    const x = -6.13;
    for (const [p, q] of [
      [[x, F, -6], [x, F, 2]],
      [[x, F, 2], [x, EAVE, 2]],
      [[x, EAVE, 2], [x, EAVE, -6]],
      [[x, EAVE, -6], [x, F, -6]],
    ])
      ribbon(p, q, BLUE, 0.08);
    const cam = camera([-21, G + 9, -12], [-2, G + 3.2, -3], 40, 120);
    return { cam, a: { wall: [-6.2, F + 3.6, -2], roof: [0, EAVE + 2.6, -2] } };
  };
  SHOTS.pool = () => {
    cutLand(-3.4, 4.6, 3.9, 11.4);
    wholeHouse({ shutters: true });
    roofs();
    dormer();
    const p = pool();
    // the pool tool: the pool's edge lit, a ghost stretching it to the right, its depth handle
    outlineRing(rect(p.px0, p.pz0, p.px1, p.pz1), p.pt + 0.08, BLUE, 0.08);
    ghostBox(p.px1, p.b, 7.5, 5.8, p.pt, p.pz1, BLUE, 0.22);
    ball([5.8, p.pt + 0.1, 9.25], 0.16);
    arrow([0.25, p.pt + 0.15, 8.0], [0, -1, 0], 0.9, 0xffb020);
    const cam = camera([15, G + 11, 23], [0.5, G + 0.6, 4.5], 42, 110);
    return { cam, a: { pool: [0.25, p.pt, 8], depth: [0.25, p.pt + 1.2, 8.0], grow: [5.8, p.pt + 0.1, 9.25], ladder: [1.9, p.pt + 0.4, 10.9] } };
  };
  SHOTS.blueprint = () => {
    cutLand(-3.4, 4.6, 3.9, 11.4);
    wholeHouse({ shutters: true });
    roofs();
    dormer();
    pool();
    // a saved sunroom going down against the house's right side: green, it fits
    const [x0, z0, x1, z1] = [5, -4.5, 8.6, 0.5];
    ghostBox(x0, G, z0, x1, F, z1, GREEN, 0.3);
    ghostBox(x0, F, z0, x1, F + 2.6, z1, GREEN, 0.22);
    const t = Math.tan((25 * Math.PI) / 180);
    surf(ghostMat(GREEN, 0.3), [
      slope([[x1 + 0.3, F + 2.6 - 0.3 * t, z0 - 0.3], [x1 + 0.3, F + 2.6 - 0.3 * t, z1 + 0.3], [x0, F + 2.6 + (x1 - x0) * t, z1 + 0.3], [x0, F + 2.6 + (x1 - x0) * t, z0 - 0.3]]),
    ]);
    for (let z = z0 + 0.9; z < z1; z += 0.9) ribbon([x1, F, z], [x1, F + 2.6, z], GREEN, 0.04);
    const cam = camera([20, G + 10, 15], [2.5, G + 2.6, -1.2], 40, 130);
    return { cam, a: { ghost: [6.8, F + 3.4, -2] } };
  };
  // the blueprints' own pictures: a saved room or house alone, small

  let dark = false;
  const run = (name) => {
    root = new T.Group();
    root.position.set(X0, 0, Z0);
    root.userData.mock = true;
    tp.scene.add(root);
    const r = SHOTS[name]();
    const bg = tp.scene.background;
    const cc = tp.renderer.getClearColor(new T.Color()).getHex();
    if (dark) {
      tp.scene.background = null;
      tp.renderer.setClearColor(0x1b2838, 1);
    }
    tp.renderer.render(tp.scene, r.cam);
    tp.scene.background = bg;
    tp.renderer.setClearColor(cc);
    dark = false;
    const url = tp.renderer.domElement.toDataURL("image/jpeg", 0.9);
    const anchors = {};
    for (const [k, p] of Object.entries(r.a)) anchors[k] = proj(r.cam, p);
    tp.scene.remove(root);
    restore();
    return { url, anchors };
  };
  window.HOUSE = { run, TEX, shots: Object.keys(SHOTS).filter((k) => SHOTS[k]), G, F };
})();

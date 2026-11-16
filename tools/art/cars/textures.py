# Plan 92 (quality pass) — the cars' own textures, made by code: shared by every car, each a tile or an atlas,
# written as PNG into the art sources (SRC, outside the repo) and encoded to KTX2 into
# apps/client/public/life/cars/tex/ (`--encode`). The GLBs reference them by URI (link_tex.py); the cabin's
# fabrics use the life library's own maps (../mat/*.ktx2) instead.
#
#   blender -b --factory-startup -P tools/art/cars/textures.py [-- --only paint_n,tyre_a] [--encode]
#
# Text is real text: Blender's own font, laid out in a little orthographic scene and rendered (EEVEE,
# Standard view: the colours as given).
import math
import os
import subprocess
import sys

import bpy
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
SRC = os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/cars-tex")
OUT = os.path.join(ROOT, "apps/client/public/life/cars/tex")
BASISU = os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
RNG = np.random.default_rng(92)

# what each is: (kind for the encoder: albedo | linear | normal), its metres a repeat (UVs are in tiles of it;
# None: an atlas laid out by the model's own UVs)
TEX = {
    "paint_n": ("normal", 0.35),
    "paint_orm": ("linear", 0.35),
    "tyre_a": ("albedo", None),
    "tyre_n": ("normal", None),
    "grain_n": ("normal", 0.12),
    "lens_n": ("normal", 0.04),
    "rib_n": ("normal", 0.025),
    "grille_n": ("normal", 0.05),
    "glass_ws": ("albedo", None),
    "plate_a": ("albedo", None),
    "cluster_a": ("albedo", None),
    "switch_a": ("albedo", None),
    "police_a": ("albedo", None),
    "taxi_a": ("albedo", None),
    "sign_a": ("albedo", None),
    # (for Blender's stills only: the game lays the library's on these)
    "fabric_n": ("normal", 0.06),
    "carpet_n": ("normal", 0.1),
    "wood_a": ("albedo", 0.8),
}


def path(name):
    return os.path.join(SRC, name + ".png")


# ── numpy helpers ──────────────────────────────────────────────────────────────────────────────────────────


def vnoise(n, cells, seed=0):
    """Tileable value noise n × n with `cells` lattice cells across, 0..1 (smooth)."""
    r = np.random.default_rng(seed).random((cells, cells))
    x = np.arange(n) * cells / n
    i0 = np.floor(x).astype(int) % cells
    i1 = (i0 + 1) % cells
    t = x - np.floor(x)
    t = t * t * (3 - 2 * t)
    a = r[i0][:, i0] * (1 - t)[None, :] + r[i0][:, i1] * t[None, :]
    b = r[i1][:, i0] * (1 - t)[None, :] + r[i1][:, i1] * t[None, :]
    return a * (1 - t)[:, None] + b * t[:, None]


def fbm(n, cells, octaves=4, seed=0):
    out = np.zeros((n, n))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += amp * vnoise(n, cells * 2**o, seed + o)
        tot += amp
        amp *= 0.5
    return out / tot


def normal_from(h, strength):
    """A tangent-space normal map (RGB 0..1) from a height map (wrapping)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    nrm = np.stack([-dx, -dy, nz], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return nrm * 0.5 + 0.5


def save(name, rgb, alpha=None):
    """rgb: H × W × 3 (0..1), row 0 the top."""
    os.makedirs(SRC, exist_ok=True)
    h, w = rgb.shape[:2]
    a = np.ones((h, w)) if alpha is None else alpha
    px = np.concatenate([rgb, a[..., None]], -1)[::-1].astype(np.float32)
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.colorspace_settings.name = "sRGB" if TEX[name][0] == "albedo" else "Non-Color"
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = path(name)
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    print("made", name, w, h)


def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    return px


# ── text, rendered ─────────────────────────────────────────────────────────────────────────────────────────


def draw(w, h, items, bg=None, transparent=False):
    """A W × H px picture: rectangles and text. items: ("rect", x, y, rw, rh, colour) and
    ("text", str, x, y, size_px, colour, align, bold) — x, y from the top-left, in px. → H × W × 4 (top row 0)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = transparent
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*(bg or (0, 0, 0)), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    sc.world = world
    cam = bpy.data.cameras.new("c")
    cam.type = "ORTHO"
    cam.ortho_scale = w / 100.0  # (1 unit = 100 px)
    co = bpy.data.objects.new("c", cam)
    co.location = (w / 200.0, -h / 200.0, 10)
    sc.collection.objects.link(co)
    sc.camera = co

    def emit(colour):
        m = bpy.data.materials.new("e")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        e = nt.nodes.new("ShaderNodeEmission")
        e.inputs["Color"].default_value = (*colour, 1)
        e.inputs["Strength"].default_value = 1.0
        nt.links.new(e.outputs[0], o.inputs[0])
        return m

    z = 0.0
    for it in items:
        z += 0.001
        if it[0] == "rect":
            _, x, y, rw, rh, col = it
            bpy.ops.mesh.primitive_plane_add(size=1, location=((x + rw / 2) / 100, -(y + rh / 2) / 100, z))
            p = bpy.context.object
            p.scale = (rw / 100, rh / 100, 1)
            p.data.materials.append(emit(col))
        elif it[0] == "circle":
            _, x, y, r, col = it
            bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r / 100, fill_type="NGON", location=(x / 100, -y / 100, z))
            bpy.context.object.data.materials.append(emit(col))
        elif it[0] == "ring":
            _, x, y, r, t, col = it
            bpy.ops.mesh.primitive_circle_add(vertices=64, radius=r / 100, fill_type="NOTHING", location=(x / 100, -y / 100, z))
            o = bpy.context.object
            m = o.modifiers.new("s", "SKIN")
            for v in o.data.skin_vertices[0].data:
                v.radius = (t / 200, t / 200)
            o.data.materials.append(emit(col))
        elif it[0] == "line":
            _, x0, y0, x1, y1, t, col = it
            L = math.hypot(x1 - x0, y1 - y0)
            bpy.ops.mesh.primitive_plane_add(size=1, location=((x0 + x1) / 200, -(y0 + y1) / 200, z))
            p = bpy.context.object
            p.scale = (L / 100, t / 100, 1)
            p.rotation_euler = (0, 0, -math.atan2(y1 - y0, x1 - x0))
            p.data.materials.append(emit(col))
        else:
            _, s, x, y, size, col, align, bold = it
            cu = bpy.data.curves.new("t", "FONT")
            cu.body = s
            cu.size = size / 100
            cu.align_x = align
            cu.align_y = "CENTER"
            cu.offset = bold * size / 100 * 0.007
            o = bpy.data.objects.new("t", cu)
            o.location = (x / 100, -y / 100, z)
            sc.collection.objects.link(o)
            cu.materials.append(emit(col))
    out = os.path.join(SRC, "_draw.png")
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return load(out)


# ── the textures ───────────────────────────────────────────────────────────────────────────────────────────


def make_paint():
    n = 512
    flake = RNG.random((n, n))
    flake = (flake > 0.82) * RNG.random((n, n))  # (sparse flakes, each its own tilt)
    peel = fbm(n, 24, 3, 3)  # (orange peel: soft bumps ~1.5 cm across)
    h = peel * 1.0 + flake * 0.35
    nrm = normal_from(h, 0.9)
    # (each flake its own tilt: a random normal where there's a flake)
    tilt = RNG.normal(0, 0.25, (n, n, 2)) * (flake[..., None] > 0)
    nrm[..., :2] = np.clip(nrm[..., :2] + tilt * 0.5, 0, 1)
    save("paint_n", nrm)
    rough = 0.82 + 0.18 * fbm(n, 16, 3, 5) - flake * 0.25
    save("paint_orm", np.stack([np.ones((n, n)), np.clip(rough, 0, 1), np.ones((n, n))], -1))


def make_tyre():
    """The tyre's atlas, 2048 × 256: u round the tyre (the brand twice), v across it — the outer sidewall
    v 0..0.42, the tread 0.42..0.58, the inner sidewall 0.58..1."""
    w, h = 2048, 256
    items = [("rect", 0, 0, w, h, (0, 0, 0))]
    for k in range(2):
        x0 = k * w / 2
        items += [
            ("text", "NORDRIM", x0 + 260, 46, 54, (1, 1, 1), "CENTER", 2),
            ("text", "VINTERGREP  M+S", x0 + 640, 50, 30, (1, 1, 1), "CENTER", 1),
            ("text", "195/65 R15 91T", x0 + 900, 52, 26, (1, 1, 1), "CENTER", 1),
            ("text", "TUBELESS RADIAL", x0 + 260, 88, 18, (0.8, 0.8, 0.8), "CENTER", 0),
            ("text", "❄", x0 + 1000, 48, 34, (1, 1, 1), "CENTER", 0),
        ]
    letters = draw(w, h, items)[..., 0]
    # (the outer sidewall's band runs rim → shoulder as v grows: the letters' tops toward the tread)
    letters[:108] = letters[:108][::-1].copy()
    # (the inner sidewall: plain, a ring of small print)
    hgt = np.zeros((h, w))
    side = letters[:108]
    hgt[:108] = side * 0.7
    # the rim protector rib and the sidewall's rings
    for v in (6, 100):
        hgt[v : v + 3] = 0.5
    # the tread: v 108..148 — blocks with sipes, staggered, four ribs
    tr = np.zeros((40, w))
    for rib in range(4):
        r0 = rib * 10
        off = (rib % 2) * 16
        for u in range(w):
            block = ((u + off) // 32) % 1 == 0
            inb = (u + off) % 32
            val = 1.0 if 3 < inb < 29 else 0.0
            # (zig-zag sipes across each block)
            if val and (inb - 3) % 9 == 0:
                val = 0.4
            tr[r0 + 1 : r0 + 9, u] = val
    hgt[108:148] = tr * 0.9
    hgt[148:] = hgt[:108][::-1][: h - 148] * 0.3
    nrm = normal_from(hgt, 2.5)
    save("tyre_n", nrm)
    alb = np.full((h, w, 3), 0.022)
    alb[:108] += side[..., None] * 0.035  # (the lettering a touch lighter: worn rubber)
    alb[108:148] *= 0.85
    save("tyre_a", alb)


def make_grain():
    n = 256
    cells = fbm(n, 40, 2, 7)
    pebble = np.abs(np.sin(cells * 30))
    save("grain_n", normal_from(pebble * 0.3 + fbm(n, 64, 2, 9) * 0.2, 1.2))


def make_lens():
    n = 256
    u = np.arange(n) / n
    # square prisms (a headlamp's), 8 across a tile
    a = np.abs((u * 8) % 1 - 0.5)
    h = np.minimum(a[None, :], a[:, None])
    save("lens_n", normal_from(h, 6.0))
    # horizontal ribs (a tail lamp's) with tiny cube-corner dimples
    rib = np.abs(np.sin(u * math.pi * 6))[:, None] * np.ones((1, n))
    dim = (np.abs(((u * 24) % 1) - 0.5)[None, :] + np.abs(((u * 24) % 1) - 0.5)[:, None]) * 0.15
    save("rib_n", normal_from(rib + dim, 5.0))


def make_grille():
    n = 256
    u = np.arange(n) / n
    x, y = np.meshgrid(u, u)
    # a honeycomb-ish mesh: two crossing diagonal ridges
    a = np.abs(((x * 6 + y * 6) % 1) - 0.5)
    b = np.abs(((x * 6 - y * 6) % 1) - 0.5)
    h = np.minimum(a, b)
    save("grille_n", normal_from(h, 8.0))


def make_glass():
    """The windscreen: clear, a blue-green sun band across its top fading in (alpha in A)."""
    w, h = 16, 256
    v = (np.arange(h) / h)[:, None] * np.ones((1, w))  # (row 0 the top)
    band = np.clip((0.2 - v) / 0.12, 0, 1)
    rgb = np.stack([0.06 + 0.0 * v, 0.1 + 0.05 * band, 0.11 + 0.12 * band], -1)
    alpha = 0.3 + 0.55 * band
    save("glass_ws", rgb, alpha)


def make_plate():
    """Our plate: white, a blue band with the town's name, the registration in black (the game may write its
    own over it)."""
    w, h = 1024, 320
    items = [
        ("rect", 0, 0, w, h, (0.08, 0.08, 0.08)),
        ("rect", 10, 10, w - 20, h - 20, (0.93, 0.93, 0.9)),
        ("rect", 10, 10, w - 20, 70, (0.05, 0.18, 0.55)),
        ("text", "YUTOPIA", w / 2, 45, 44, (1, 1, 1), "CENTER", 1),
        ("circle", 60, 45, 22, (0.95, 0.8, 0.2)),
        ("text", "ESK 4E20", w / 2, 195, 150, (0.03, 0.03, 0.03), "CENTER", 3),
    ]
    px = draw(w, h, items)
    save("plate_a", px[..., :3])


def make_cluster():
    """The cluster's face round the VFD (1024 × 256): a fuel and a temperature dial each side (ticks, letters;
    their needles are geometry), the warning lamps' icons in a row under the screen, the make."""
    w, h = 1024, 256
    items = [("rect", 0, 0, w, h, (0.025, 0.025, 0.028))]
    for cx, label, lo, hi in ((110, "FUEL", "E", "F"), (914, "TEMP", "C", "H")):
        items.append(("ring", cx, 128, 92, 4, (0.6, 0.6, 0.6)))
        for k in range(9):
            a = math.radians(210 - k * 30)
            r0, r1 = (70 if k % 2 == 0 else 78), 88
            items.append(("line", cx + math.cos(a) * r0, 128 - math.sin(a) * r0, cx + math.cos(a) * r1, 128 - math.sin(a) * r1, 4 if k % 2 == 0 else 2, (0.9, 0.9, 0.88)))
        items.append(("line", cx + math.cos(math.radians(-30)) * 70, 128 - math.sin(math.radians(-30)) * 70, cx + math.cos(math.radians(-30)) * 88, 128 - math.sin(math.radians(-30)) * 88, 5, (0.9, 0.15, 0.1)))
        items.append(("text", lo, cx - 50, 175, 26, (0.9, 0.9, 0.88), "CENTER", 1))
        items.append(("text", hi, cx + 50, 175, 26, (0.9, 0.9, 0.88), "CENTER", 1))
        items.append(("text", label, cx, 92, 20, (0.7, 0.7, 0.68), "CENTER", 0))
    # the warning lamps: little coloured icons in a row (unlit: dim)
    icons = [((0.6, 0.1, 0.05), "!"), ((0.6, 0.45, 0.05), "⛽"), ((0.05, 0.4, 0.1), "◀"), ((0.05, 0.4, 0.1), "▶"), ((0.05, 0.2, 0.6), "≡D"), ((0.6, 0.1, 0.05), "( P )"), ((0.6, 0.45, 0.05), "≈")]
    for i, (col, ch) in enumerate(icons):
        x = 300 + i * 70
        items.append(("rect", x - 26, 210, 52, 34, (0.06, 0.06, 0.065)))
        items.append(("text", ch, x, 227, 22, col, "CENTER", 1))
    items.append(("text", "ESKER", w / 2, 22, 18, (0.55, 0.55, 0.55), "CENTER", 1))
    px = draw(w, h, items)
    save("cluster_a", px[..., :3])


def make_switches():
    """The switches' caps (8 across, 512 × 64): their legends — lights, fog, rear fog, hazard, heated rear
    window, wipers, washer, interior light."""
    w, h = 512, 64
    legends = ["☼D", "F≡", "R≡", "△", "⊞", "⌒", "⋰", "◊"]
    items = [("rect", 0, 0, w, h, (0.03, 0.03, 0.032))]
    for i, s in enumerate(legends):
        x = i * 64 + 32
        items.append(("rect", i * 64 + 4, 4, 56, 56, (0.045, 0.045, 0.048)))
        items.append(("text", s, x, 32, 26, (0.85, 0.85, 0.8) if i != 3 else (0.9, 0.2, 0.15), "CENTER", 1))
    px = draw(w, h, items)
    save("switch_a", px[..., :3])


def make_police():
    """The police's livery, on the doors (1024 × 256, alpha): white over the door, a navy stripe, POLÍCIA in
    navy, the town's crest (a star in a shield — ours)."""
    w, h = 1024, 256
    navy = (0.03, 0.06, 0.2)
    items = [
        ("rect", 0, 0, w, h, (0.95, 0.95, 0.94)),
        ("rect", 0, 168, w, 30, navy),
        ("rect", 0, 204, w, 8, (0.75, 0.62, 0.15)),
        ("text", "POLÍCIA", 560, 105, 96, navy, "CENTER", 3),
        ("text", "MUNICIPAL · YUTOPIA", 560, 150, 26, navy, "CENTER", 1),
        ("circle", 140, 110, 62, navy),
        ("circle", 140, 110, 54, (0.95, 0.95, 0.94)),
        ("text", "★", 140, 108, 72, (0.75, 0.62, 0.15), "CENTER", 0),
    ]
    px = draw(w, h, items)
    save("police_a", px[..., :3], np.ones((h, w)))


def make_taxi():
    """The taxi's band (1024 × 128, alpha): two rows of black and white chequers, TÁXI over it in black."""
    w, h = 1024, 128
    items = [("rect", 0, 0, w, h, (0, 0, 0))]
    sq = 32
    for r in range(2):
        for c in range(w // sq):
            if (r + c) % 2 == 0:
                items.append(("rect", c * sq, 64 + r * sq, sq, sq, (0.95, 0.95, 0.94)))
    items.append(("rect", 360, 2, 300, 58, (0.98, 0.78, 0.08)))
    items.append(("text", "TÁXI", 510, 30, 52, (0.02, 0.02, 0.02), "CENTER", 3))
    px = draw(w, h, items, transparent=True)
    alpha = px[..., 3]
    # (the band's own alpha: the chequers' rows and the label solid, the rest clear)
    a = np.zeros((h, w))
    a[64:] = 1.0
    a[2:60, 360:660] = 1.0
    save("taxi_a", px[..., :3], a)


def make_sign():
    w, h = 512, 128
    items = [("rect", 0, 0, w, h, (0.98, 0.8, 0.12)), ("rect", 6, 6, w - 12, h - 12, (0.99, 0.86, 0.3)), ("text", "TÁXI", w / 2, 64, 90, (0.03, 0.03, 0.03), "CENTER", 3)]
    px = draw(w, h, items)
    save("sign_a", px[..., :3])


def make_fabric():
    n = 256
    u = np.arange(n) / n
    x, y = np.meshgrid(u, u)
    weave = (np.sin(x * math.pi * 64) * np.sin(y * math.pi * 64)) * 0.5 + 0.5
    save("fabric_n", normal_from(weave * 0.4 + fbm(n, 32, 2, 11) * 0.3, 2.0))
    loops = RNG.random((n, n))
    save("carpet_n", normal_from(loops * 0.6 + fbm(n, 16, 2, 12) * 0.4, 1.5))


def make_wood():
    n = 512
    u = np.arange(n) / n
    x, y = np.meshgrid(u, u)
    rings = np.sin((y * 14 + fbm(n, 6, 3, 13) * 2.5) * math.pi * 2) * 0.5 + 0.5
    base = np.array([0.42, 0.25, 0.12])
    dark = np.array([0.25, 0.13, 0.06])
    alb = base * (1 - rings[..., None] * 0.6) + dark * rings[..., None] * 0.6
    alb *= (0.9 + 0.1 * fbm(n, 64, 2, 14))[..., None]
    save("wood_a", alb)


MAKERS = {
    "paint_n": make_paint,
    "paint_orm": make_paint,
    "tyre_a": make_tyre,
    "tyre_n": make_tyre,
    "grain_n": make_grain,
    "lens_n": make_lens,
    "rib_n": make_lens,
    "grille_n": make_grille,
    "glass_ws": make_glass,
    "plate_a": make_plate,
    "cluster_a": make_cluster,
    "switch_a": make_switches,
    "police_a": make_police,
    "taxi_a": make_taxi,
    "sign_a": make_sign,
    "fabric_n": make_fabric,
    "carpet_n": make_fabric,
    "wood_a": make_wood,
}
# (the game's own: the ones not only for Blender's stills)
SHIPPED = [k for k in TEX if k not in ("fabric_n", "carpet_n", "wood_a")]


def encode():
    os.makedirs(OUT, exist_ok=True)
    for name in SHIPPED:
        kind = TEX[name][0]
        flags = {"albedo": [], "linear": ["-linear"], "normal": ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "1.5", "-normal_map", "-mip_renorm"]}[kind]
        if name in ("plate_a", "cluster_a", "switch_a", "police_a", "taxi_a", "sign_a", "tyre_a"):
            flags = ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "1.0"]  # (text: crisp, not ETC1S's blocks)
        out = os.path.join(OUT, name + ".ktx2")
        subprocess.run([BASISU, "-ktx2", "-mipmap", "-quiet", *flags, path(name), "-output_file", out], check=True, stdout=subprocess.DEVNULL)
        print("encoded", name, os.path.getsize(out))


if __name__ == "__main__":
    only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else list(TEX)
    done = set()
    for name in only:
        fn = MAKERS[name]
        if fn in done:
            continue
        fn()
        done.add(fn)
    if "--encode" in argv:
        encode()

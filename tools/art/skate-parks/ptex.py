# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the parks' textures, drawn by code (numpy, Blender's own Python;
# the lettering through Blender's text, rendered flat): every one tileable where it tiles, sized in metres —
# written as PNG into tools/art/skate-parks/tex-src and as KTX2 (basisu) into apps/client/public/life/skate-parks/tex.
#
#   blender -b --factory-startup -P tools/art/skate-parks/ptex.py -- [--only masonite,concrete,...] [--encode]
#
# What each is (its tile in metres in pkit.MATS):
#   masonite_*     the riding face: tempered hardboard sheets 4 × 8 ft laid across, seams every 4 ft up the ramp and
#                  8 ft across (staggered), countersunk screws down the ribs and round the seams, wheel paths
#   mastop_*       the top row under a coping: the same sheets waxed, scuffed black, chipped by the trucks
#   deck_*         a ramp's deck: painted ply with grit, footprints, the seams
#   ply_*          the sides: pine ply sheets, screws on the framing, knots and patches
#   lumber_a       2 × 4 framing (spruce)
#   galv_*         galvanised steel (spangle, scratches); tube_*: a pipe's round (u along, v round: its top worn
#                  bright); paintpipe_a a painted coping's round, chipped down to the steel on top
#   plate_*        steel plate (the feet's transition plates, deck plates)
#   conc_*         poured concrete: trowel swirls, aggregate, expansion joints every 10 ft, wheel marks
#   conctop_*      the band under a concrete coping: waxed dark, smooth
#   concside_*     board-formed concrete sides, tie holes, efflorescence
#   floor_*        the hall's floor: power-floated concrete, saw cuts every 20 ft, old paint lines, stains
#   brick_*        common brick, raked mortar, soot from the old works
#   block_a        concrete block (the plinth)
#   cladding_*     corrugated steel (the roof)
#   steelpaint_a   painted structural steel (the frames, the trusses)
#   mural_*        the hall's murals on its brick (our own words, made up)
#   tags_a         sprayed tags (an atlas, cut out by alpha)
#   signs_a        the signs (SKATE HALL, PRO SHOP, the shop's window)
import math
import os
import subprocess
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "../../..")
SRC = os.path.join(HERE, "tex-src")
OUT = os.path.join(ROOT, "apps/client/public/life/skate-parks/tex")
BASISU = os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


# ── numpy helpers ────────────────────────────────────────────────────────────────────────────────────────────


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def lin(h):
    h = h.lstrip("#")
    return np.array([(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)]) ** 2.2


def png(name, rgb, linear_in=True, alpha=None):
    """rgb: H × W × 3 (row 0 the top), linear (→ sRGB) or as is (normals, ORM)."""
    import struct
    import zlib

    os.makedirs(SRC, exist_ok=True)
    path = os.path.join(SRC, name + ".png")
    v = srgb(rgb) if linear_in else np.clip(rgb, 0, 1)
    h, w, _ = v.shape
    a = np.ones((h, w)) if alpha is None else np.clip(alpha, 0, 1)
    px = (np.concatenate([v, a[..., None]], -1) * 255 + 0.5).astype(np.uint8)
    raw = b"".join(b"\x00" + px[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))
    print("made", name, w, h, flush=True)
    MADE.append(name)


MADE = []


def blur(a, sigma):
    """A Gaussian blur that wraps (FFT): tiles stay tiles. sigma in pixels (x, y may differ)."""
    sy, sx = (sigma, sigma) if np.isscalar(sigma) else sigma
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi**2) * ((sx * fx) ** 2 + (sy * fy) ** 2))
    if a.ndim == 3:
        return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., k]) * g)) for k in range(a.shape[2])], -1)
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def noise(h, w, sigma, seed):
    """Tileable smooth noise, unit spread."""
    r = np.random.default_rng(seed).random((h, w)) - 0.5
    n = blur(r, sigma)
    return (n - n.mean()) / (n.std() + 1e-9)


def fbm(h, w, sigmas, seed, gain=0.55):
    out = np.zeros((h, w))
    a = 1.0
    t = 0.0
    for i, s in enumerate(sigmas):
        out += a * noise(h, w, s, seed + i * 31)
        t += a
        a *= gain
    return out / t


def normal_from(hm, strength):
    dx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) * strength
    dy = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(hm)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def orm(ao, rough, metal):
    return np.stack([np.clip(ao, 0, 1), np.clip(rough, 0, 1), np.clip(metal, 0, 1)], -1)


def grid(h, w, mx, my):
    """Each pixel's centre in metres (x across the width, y down the height) for a tile mx × my."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    return (x + 0.5) * mx / w, (y + 0.5) * my / h


def tile_dist(c, period):
    """Distance (m) from c to the nearest multiple of `period`."""
    m = np.mod(c, period)
    return np.minimum(m, period - m)


def stamp(dst, cx, cy, kern, mode="max"):
    """A small kernel added (or maxed) into dst at pixel (cx, cy), wrapping."""
    h, w = dst.shape[:2]
    kh, kw = kern.shape[:2]
    ys = (np.arange(kh) + int(round(cy)) - kh // 2) % h
    xs = (np.arange(kw) + int(round(cx)) - kw // 2) % w
    sub = dst[np.ix_(ys, xs)]
    if mode == "max":
        dst[np.ix_(ys, xs)] = np.maximum(sub, kern)
    elif mode == "min":
        dst[np.ix_(ys, xs)] = np.minimum(sub, kern)
    else:
        dst[np.ix_(ys, xs)] = sub + kern


def disc(r_px, soft=1.0):
    n = int(math.ceil(r_px + soft + 1)) * 2 + 1
    y, x = np.mgrid[0:n, 0:n] - n // 2
    d = np.sqrt(x * x + y * y)
    return np.clip((r_px + soft - d) / (2 * soft), 0, 1), d


def strokes(h, w, n, length, width, seed, angle=None, spread=0.4, curve=0.0, region=None):
    """Soft line strokes (wheel marks, scuffs): a mask 0..1, tileable. length, width in pixels."""
    rng = np.random.default_rng(seed)
    m = np.zeros((h, w))
    for _ in range(n):
        if region is not None:
            y0 = rng.uniform(*region[1]) * h
            x0 = rng.uniform(*region[0]) * w
        else:
            x0, y0 = rng.random() * w, rng.random() * h
        a = (angle if angle is not None else rng.random() * math.pi) + rng.normal(0, spread)
        L = length * rng.uniform(0.4, 1.3)
        wd = width * rng.uniform(0.5, 1.4)
        k = int(L / 2 + wd * 3)
        ys, xs = np.mgrid[-k : k + 1, -k : k + 1].astype(np.float64)
        ca, sa = math.cos(a), math.sin(a)
        along = xs * ca + ys * sa
        across = -xs * sa + ys * ca + curve * (along / max(L, 1)) ** 2 * L
        t = np.clip(along / (L / 2), -1, 1)
        d = np.abs(across) / wd
        val = np.exp(-d * d) * (1 - t * t) * rng.uniform(0.4, 1.0) * (np.abs(along) <= L / 2)
        stamp(m, x0, y0, val, "add")
    return np.clip(m, 0, 1.5)


def cells(h, w, n, seed):
    """Voronoi cells (tileable): each pixel's cell id and its distance to the cell's edge (px)."""
    rng = np.random.default_rng(seed)
    pts = rng.random((n, 2)) * [w, h]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d1 = np.full((h, w), 1e9, np.float32)
    d2 = np.full((h, w), 1e9, np.float32)
    idx = np.zeros((h, w), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px)
        dx = np.minimum(dx, w - dx)
        dy = np.abs(yy - py)
        dy = np.minimum(dy, h - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        idx = np.where(closer, i, idx)
        d1 = np.where(closer, d, d1)
    return idx, (d2 - d1) / 2


# ── text through Blender (flat, orthographic): the murals' lettering, the signs ───────────────────────────────


def text_layer(w, h, items, bg=None):
    """Render text objects flat into an RGBA array (h × w × 4, linear). items: dicts with text, x, y (0..1 of the
    picture, the text's centre), size (of the height), colour (hex), rot (deg), extrude/outline in size units,
    font 'bold'. Each item's own colour; later items over earlier."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.image_settings.color_mode = "RGBA"
    try:
        sc.eevee.taa_render_samples = 8
    except AttributeError:
        pass
    world = bpy.data.worlds.new("w")
    sc.world = world
    cam = bpy.data.cameras.new("c")
    cam.type = "ORTHO"
    aspect = w / h
    cam.ortho_scale = aspect if aspect >= 1 else 1.0
    co = bpy.data.objects.new("c", cam)
    co.location = (aspect / 2, 0.5, 10)
    sc.collection.objects.link(co)
    sc.camera = co
    fonts = {}
    for k, it in enumerate(items):
        cu = bpy.data.curves.new(f"t{k}", "FONT")
        cu.body = it["text"]
        cu.align_x = "CENTER"
        cu.align_y = "CENTER"
        cu.size = it["size"]
        cu.space_character = it.get("spacing", 1.0)
        if it.get("bold"):
            cu.offset = it["bold"] * it["size"]
        if it.get("font"):
            p = it["font"]
            fonts.setdefault(p, bpy.data.fonts.load(p) if os.path.exists(p) else None)
            if fonts[p]:
                cu.font = fonts[p]
        ob = bpy.data.objects.new(f"t{k}", cu)
        ob.location = (it["x"] * aspect, it["y"], k * 0.001)
        ob.rotation_euler = (0, 0, math.radians(it.get("rot", 0)))
        ob.scale = (it.get("sx", 1.0), it.get("sy", 1.0), 1)
        if it.get("shear"):
            cu.shear = it["shear"]
        m = bpy.data.materials.new(f"m{k}")
        m.use_nodes = True
        nt = m.node_tree
        for nd in list(nt.nodes):
            nt.nodes.remove(nd)
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*lin(it["colour"]), 1)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(em.outputs[0], out.inputs[0])
        cu.materials.append(m)
        sc.collection.objects.link(ob)
    path = os.path.join(SRC, "_text.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(im)
    os.remove(path)
    # (back to linear: the render saved sRGB)
    rgb = px[..., :3] ** 2.2
    return np.concatenate([rgb, px[..., 3:4]], -1)


def text_mask(w, h, items):
    """Text as a coverage mask 0..1."""
    return text_layer(w, h, [dict(it, colour="#ffffff") for it in items])[..., 3]


def dilate(mask, px):
    """A mask grown by px (soft, by blur and threshold)."""
    b = blur(mask.astype(np.float64), px * 0.6)
    return np.clip((b - 0.08) * 6, 0, 1)


def spray(mask, seed, soft=1.2, over=0.0):
    """A hard-edged mask made sprayed: a soft halo of overspray, speckle at its edge."""
    h, w = mask.shape
    s = blur(mask, soft)
    halo = blur(mask, soft * 4) * 0.35
    speck = (np.random.default_rng(seed).random((h, w)) < 0.06) * blur(mask, soft * 6)
    return np.clip(np.maximum(s, halo * (1 + over)) + speck * 0.4, 0, 1)


def drips(mask, seed, n=40, length=60):
    """Paint run down from a mask's lower edges."""
    h, w = mask.shape
    rng = np.random.default_rng(seed)
    out = mask.copy()
    ys, xs = np.nonzero(mask > 0.9)
    if len(xs) == 0:
        return out
    for _ in range(n):
        i = rng.integers(len(xs))
        x, y = xs[i], ys[i]
        L = int(length * rng.uniform(0.3, 1.0))
        wd = rng.uniform(1.0, 2.6)
        y1 = min(h - 1, y + L)
        col = np.arange(y, y1)
        for dx in range(-3, 4):
            xx = (x + dx) % w
            k = np.exp(-(dx / wd) ** 2) * (1 - (col - y) / max(1, L)) ** 0.5
            out[col, xx] = np.maximum(out[col, xx], k)
    return out


# ── the riding faces ─────────────────────────────────────────────────────────────────────────────────────────

SHEET_U, SHEET_V = 2.44, 1.22  # a sheet laid across: 8 ft along the coping, 4 ft up the ramp


def sheet_layout(x, y, u_tile):
    """For metres (x across, y up from the coping down the ramp): which sheet, distance to its seams. Rows of
    1.22, each row's seams across every 2.44 offset by 1.22 from the row above."""
    row = np.floor(y / SHEET_V)
    xo = x + (row % 2) * (SHEET_U / 2)
    col = np.floor(xo / SHEET_U)
    sx = np.mod(xo, SHEET_U)
    sy = np.mod(y, SHEET_V)
    dseam = np.minimum(np.minimum(sx, SHEET_U - sx), np.minimum(sy, SHEET_V - sy))
    sid = (row * 7 + np.mod(col, u_tile / SHEET_U) * 3).astype(int)
    return sid, sx, sy, dseam


def screws(h, w, mx, my, pts, r_m=0.0045):
    """Screw heads (countersunk Phillips) at the points (metres): height map dimple, a metal mask."""
    hm = np.zeros((h, w))
    metal = np.zeros((h, w))
    r = r_m * w / mx
    k, d = disc(r, 0.6)
    cross = ((np.abs(np.mgrid[0 : k.shape[0], 0 : k.shape[1]][0] - k.shape[0] // 2) < 0.7) | (np.abs(np.mgrid[0 : k.shape[0], 0 : k.shape[1]][1] - k.shape[1] // 2) < 0.7)) & (d < r * 0.6)
    for px, py in pts:
        cx, cy = px * w / mx, py * h / my
        stamp(metal, cx, cy, k * (1 - 0.6 * cross))
        stamp(hm, cx, cy, -(k * 0.4 + cross * 0.6), "min")
    return hm, metal


def masonite_screw_pts(mx, my, rng):
    """Screws in a sheet: round its edges 2 cm in every 15 cm, and down the ribs (every 16 in across) every 20 cm."""
    pts = []
    for row in range(int(round(my / SHEET_V))):
        y0 = row * SHEET_V
        off = (row % 2) * (SHEET_U / 2)
        for col in range(-1, int(round(mx / SHEET_U)) + 1):
            x0 = col * SHEET_U - off
            # (its edges)
            for t in np.arange(0.08, SHEET_U, 0.15):
                for yy in (y0 + 0.02, y0 + SHEET_V - 0.02):
                    pts.append((x0 + t + rng.normal(0, 0.003), yy + rng.normal(0, 0.002)))
            for t in np.arange(0.08, SHEET_V, 0.15):
                for xx in (x0 + 0.02, x0 + SHEET_U - 0.02):
                    pts.append((xx + rng.normal(0, 0.002), y0 + t + rng.normal(0, 0.003)))
            # (the ribs under it: 16 in apart, a screw each 20 cm)
            for rx in np.arange(0.406, SHEET_U - 0.1, 0.406):
                for t in np.arange(0.11, SHEET_V - 0.05, 0.2):
                    pts.append((x0 + rx + rng.normal(0, 0.004), y0 + t + rng.normal(0, 0.004)))
    return [((x % mx), (y % my)) for x, y in pts]


def make_masonite(top=False, n=2048):
    """The riding face: 2.44 × 2.44 m (or the top row: 2.44 × 1.22, waxed, scuffed)."""
    mx, my = SHEET_U, (SHEET_V if top else 2 * SHEET_V)
    h, w = (n // 2, n) if top else (n, n)
    seed = 104 if not top else 207
    rng = np.random.default_rng(seed)
    x, y = grid(h, w, mx, my)
    sid, sx, sy, dseam = sheet_layout(x, y, mx)
    # the hardboard: a warm brown, each sheet its own tone, the fibre's fine mottle, a sheen down the rides
    base = lin("#5e4734")
    tone = 1 + 0.07 * np.sin(sid * 12.9898) + 0.04 * np.cos(sid * 4.1414)
    fib = fbm(h, w, [1.2, 3, 9], seed) * 0.05 + noise(h, w, 0.6, seed + 5) * 0.035
    blot = fbm(h, w, [40, 90], seed + 9) * 0.06
    # wheel paths: long soft streaks down the ramp (along y), darker rubber, smoother
    paths = strokes(h, w, 160 if not top else 220, h * 0.7, w * 0.004, seed + 11, angle=math.pi / 2, spread=0.08)
    rubber = strokes(h, w, 90 if not top else 260, h * 0.25, w * 0.0018, seed + 12, angle=math.pi / 2, spread=0.5)
    scuffs = strokes(h, w, 120 if not top else 420, w * 0.03, w * 0.0012, seed + 13, spread=1.5)
    v = tone * (1 + fib + blot) - 0.10 * paths - 0.22 * rubber - 0.12 * scuffs
    if top:
        # the wax: dark glossy smears thickest at the coping (v = 0, the top), the trucks' chips along it
        fall = np.exp(-y / 0.35)
        wax = np.clip(fbm(h, w, [6, 20], seed + 21) * 0.5 + 0.55, 0, 1) * fall
        chips = strokes(h, w, 500, w * 0.012, w * 0.0025, seed + 22, angle=0, spread=0.3, region=((0, 1), (0, 0.12)))
        v = v * (1 - 0.35 * wax) - 0.2 * chips * (y < 0.25)
    # the seams: a dark hairline, the sheets' edges a hair rounded
    seam = np.clip(1 - dseam / 0.0018, 0, 1)
    edge = np.clip(1 - dseam / 0.006, 0, 1)
    v = v * (1 - 0.55 * seam) * (1 - 0.08 * edge)
    rgb = base[None, None, :] * v[..., None]
    # (the face's fibre a touch warmer in its light flecks)
    rgb[..., 0] *= 1 + 0.03 * fib
    pts = masonite_screw_pts(mx, my, rng)
    shm, smetal = screws(h, w, mx, my, pts)
    steel = lin("#5f6266") * (0.75 + 0.25 * noise(h, w, 0.8, seed + 31))[..., None]
    rust = lin("#6b4a30")
    sc = np.clip(smetal, 0, 1)[..., None]
    rgb = rgb * (1 - sc) + (steel * 0.7 + rust * 0.3 * (fib[..., None] > 0.5)) * sc
    hm = fib * 0.15 - 0.6 * seam - 0.25 * edge + shm * 0.8 - 0.12 * scuffs
    if top:
        hm = hm - 0.3 * chips * (y < 0.25)
    nrm = normal_from(blur(hm, 0.5), 2.2)
    rough = 0.58 + 0.06 * fib - 0.12 * paths - 0.05 * rubber - (0.28 * wax if top else 0)
    rough = np.where(smetal > 0.5, 0.35, rough)
    ao = 1 - 0.35 * seam - 0.12 * edge
    name = "mastop" if top else "masonite"
    png(f"{name}_a", rgb)
    png(f"{name}_n", nrm, linear_in=False)
    png(f"{name}_orm", orm(ao, rough, smetal * 0.9), linear_in=False)


def make_deck(n=1024):
    """A ramp's deck: grey painted ply under black grit paint, 2.44 × 2.44, its sheets 1.22 × 2.44 laid across."""
    mx = my = 2.44
    h = w = n
    seed = 301
    x, y = grid(h, w, mx, my)
    sid, sx, sy, dseam = sheet_layout(x, y, mx)
    grit = noise(h, w, 0.5, seed)
    grit2 = (np.random.default_rng(seed).random((h, w)) < 0.12) * 1.0
    worn = np.clip(fbm(h, w, [20, 60], seed + 3) * 0.5 + 0.3, 0, 1)
    v = 0.16 * (1 + 0.05 * np.sin(sid * 7.1)) + 0.03 * grit + 0.06 * worn
    feet = strokes(h, w, 120, w * 0.05, w * 0.012, seed + 5, spread=2.0)
    v = v - 0.04 * feet
    seam = np.clip(1 - dseam / 0.002, 0, 1)
    v = v * (1 - 0.6 * seam)
    rgb = np.stack([v * 0.98, v * 0.99, v * 1.02], -1)
    # (paint worn through to the ply at the sheets' edges)
    wear = np.clip((np.clip(1 - dseam / 0.03, 0, 1) * (fbm(h, w, [3, 8], seed + 7) > 0.6)), 0, 1)
    ply = lin("#9c7a52")
    rgb = rgb * (1 - wear[..., None]) + ply * wear[..., None]
    rng = np.random.default_rng(seed)
    pts = masonite_screw_pts(mx, my, rng)
    shm, smetal = screws(h, w, mx, my, pts, 0.005)
    rgb = rgb * (1 - smetal[..., None]) + lin("#7c8083") * smetal[..., None]
    hm = 0.6 * grit + 0.8 * grit2 * 0.3 - 0.8 * seam + shm
    png("deck_a", rgb)
    png("deck_n", normal_from(blur(hm, 0.4), 1.6), linear_in=False)
    png("deck_orm", orm(1 - 0.3 * seam, 0.88 - 0.1 * worn - 0.15 * wear, smetal * 0.8), linear_in=False)


def make_ply(n=2048):
    """The sides: pine ply sheets 2.44 × 1.22 (8 × 4 ft, upright), screws on the framing (16 in) and the edges."""
    mx, my = 2.44, 1.22
    h, w = n // 2, n
    seed = 401
    x, y = grid(h, w, mx, my)
    # the grain: long and wavy along the sheet, its rings' figure, the odd knot and patch
    warp = noise(h, w, (6, 60), seed) * 0.02 + 0.03 * np.sin(x * 2.1 + noise(h, w, 30, seed + 1) * 0.6)
    rings = 0.5 + 0.5 * np.sin((y + warp) * 2 * math.pi * 22 + noise(h, w, (3, 40), seed + 2) * 2.2)
    rings = rings**3
    base = lin("#c9a477")
    v = 0.92 + 0.10 * rings * 0.5 - 0.06 * fbm(h, w, [2, 8], seed + 3)
    rgb = base * v[..., None]
    rng = np.random.default_rng(seed)
    for _ in range(9):
        kx, ky = rng.random() * w, rng.random() * h
        k, d = disc(rng.uniform(6, 13), 3)
        stamp(rgb[..., 0], kx, ky, -k * 0.35, "add")
        stamp(rgb[..., 1], kx, ky, -k * 0.45, "add")
        stamp(rgb[..., 2], kx, ky, -k * 0.5, "add")
    # (a patch: the football-shaped plugs of a ply face)
    for _ in range(4):
        px, py = rng.random() * w, rng.random() * h
        yy, xx = np.mgrid[-30:31, -60:61]
        m = ((xx / 60.0) ** 2 + (yy / 26.0) ** 2) < 1
        for c in range(3):
            stamp(rgb[..., c], px, py, m * 0.03, "add")
    # the edges, the framing behind (screws in lines 16 in apart and round the edges)
    d = np.minimum(np.minimum(x, mx - x), np.minimum(y, my - y))
    seam = np.clip(1 - d / 0.002, 0, 1)
    rgb = rgb * (1 - 0.5 * seam[..., None])
    pts = []
    for sx_ in np.arange(0, mx + 0.01, 0.406):
        for t in np.arange(0.05, my, 0.2):
            pts.append((min(mx - 0.02, max(0.02, sx_)), t))
    for t in np.arange(0.1, mx, 0.2):
        pts += [(t, 0.02), (t, my - 0.02)]
    shm, smetal = screws(h, w, mx, my, pts, 0.004)
    rgb = rgb * (1 - smetal[..., None]) + lin("#8c8f91") * smetal[..., None]
    # (dirt up from the floor, kicked boards' marks)
    dirt = np.clip((y / my) ** 4, 0, 1) * 0.0
    kicks = strokes(h, w, 60, w * 0.03, w * 0.003, seed + 7, spread=2.0, region=((0, 1), (0.6, 1)))
    rgb = rgb * (1 - 0.35 * kicks[..., None] - dirt[..., None])
    hm = rings * 0.12 - seam + shm
    png("ply_a", rgb)
    png("ply_n", normal_from(blur(hm, 0.5), 1.4), linear_in=False)
    png("ply_orm", orm(1 - 0.3 * seam, 0.72 + 0.05 * rings, smetal), linear_in=False)


def make_lumber(n=512):
    """2 × 4 framing: spruce grain along u (0.5 m tile)."""
    h = w = n
    seed = 451
    x, y = grid(h, w, 0.5, 0.5)
    rings = 0.5 + 0.5 * np.sin((y * 60 + noise(h, w, (4, 50), seed) * 1.5) * 2 * math.pi)
    v = 0.9 + 0.12 * rings**2 - 0.08 * fbm(h, w, [2, 10], seed + 1)
    rgb = lin("#d6bb8a") * v[..., None]
    stamp_ink = strokes(h, w, 3, w * 0.5, 2, seed + 3, angle=0, spread=0.02)
    rgb = rgb * (1 - 0.6 * stamp_ink[..., None])
    png("lumber_a", rgb)


# ── steel ────────────────────────────────────────────────────────────────────────────────────────────────────


def make_galv(n=512):
    """Galvanised steel: zinc spangle cells, a dull grey, scratches (0.3 m tile)."""
    h = w = n
    seed = 501
    idx, edge = cells(h, w, 220, seed)
    tone = 0.85 + 0.12 * np.sin(idx * 3.7)
    sc = strokes(h, w, 160, w * 0.2, 0.8, seed + 2, spread=1.5)
    v = tone * (0.95 + 0.05 * noise(h, w, 1.0, seed + 3)) + 0.15 * sc
    rgb = lin("#a7adb2") * v[..., None]
    rgb = rgb * (1 - 0.04 * (edge < 1.2)[..., None])
    png("galv_a", rgb)
    png("galv_orm", orm(np.ones((h, w)), 0.42 + 0.08 * np.sin(idx * 1.3) - 0.15 * sc, np.ones((h, w)) * 0.95), linear_in=False)


def make_tube(painted=False, n=512):
    """A pipe's round: u along it (0.5 m), v round it from the top (0) — its top ground bright (and a painted one's
    paint chipped down to the steel there), its underside dull with grime."""
    h, w = n // 2, n
    seed = 551 if not painted else 571
    x, y = grid(h, w, 0.5, 1.0)
    up = np.cos(y * 2 * math.pi)  # 1 at the top
    top = np.clip((up - 0.55) / 0.45, 0, 1)
    polish = strokes(h, w, 260, w * 0.35, 1.2, seed, angle=0, spread=0.03) * (top[..., None] if False else top)
    idx, _ = cells(h, w, 120, seed + 1)
    zinc = lin("#a3a9ae") * (0.86 + 0.1 * np.sin(idx * 3.1))[..., None]
    bright = lin("#d9dde0")
    grime = np.clip(-up, 0, 1) ** 2 * 0.4
    if painted:
        paint = lin("#b0291e") * (0.92 + 0.08 * noise(h, w, 2, seed + 2))[..., None]
        chip = np.clip(top * 1.3 + fbm(h, w, [2, 6], seed + 3) * 0.35 - 0.55, 0, 1) > 0.25
        rgb = np.where(chip[..., None], bright * 0.8 + zinc * 0.2, paint)
        rough = np.where(chip, 0.28, 0.45)
        metal = np.where(chip, 0.95, 0.0)
    else:
        rgb = zinc * (1 - top[..., None] * 0.2) + bright * (top[..., None] * 0.55)
        rgb = rgb + polish[..., None] * 0.05
        rough = 0.42 - 0.22 * top
        metal = np.ones((h, w)) * 0.95
    rgb = rgb * (1 - grime[..., None])
    png("paintpipe_a" if painted else "tube_a", rgb)
    png("paintpipe_orm" if painted else "tube_orm", orm(np.ones((h, w)), rough, metal), linear_in=False)


def make_plate(n=512):
    """Steel plate (1.22 m tile): mill scale, scuffs bright, rust in the pits, a few welds' heat tint."""
    h = w = n
    seed = 601
    m = fbm(h, w, [2, 8, 30], seed)
    sc = strokes(h, w, 300, w * 0.15, 0.9, seed + 2, angle=math.pi / 2, spread=0.4)
    rust = np.clip(fbm(h, w, [3, 10], seed + 4) - 1.0, 0, 1)
    rgb = lin("#54585b") * (1 + 0.12 * m)[..., None] + lin("#b8bcbe") * sc[..., None] * 0.6
    rgb = rgb * (1 - rust[..., None]) + lin("#6e3f22") * rust[..., None]
    png("plate_a", rgb)
    png("plate_orm", orm(np.ones((h, w)), 0.5 - 0.2 * sc + 0.3 * rust, 0.9 - 0.6 * rust), linear_in=False)
    png("plate_n", normal_from(m * 0.3 - rust * 0.5, 1.0), linear_in=False)


# ── concrete ─────────────────────────────────────────────────────────────────────────────────────────────────


def make_concrete(top=False, n=2048):
    """Poured concrete (3.05 m tile: an expansion joint at each edge) — steel-trowelled swirls, aggregate, wheel
    marks; `top`: the band under a coping (3.05 × 1.525, v from the coping), waxed and dark."""
    mx, my = 3.05, (1.525 if top else 3.05)
    h, w = (n // 2, n) if top else (n, n)
    seed = 701 if not top else 731
    rng = np.random.default_rng(seed)
    x, y = grid(h, w, mx, my)
    v = 0.56 + 0.07 * fbm(h, w, [4, 16, 64], seed) + 0.035 * noise(h, w, 0.7, seed + 40) + 0.02 * noise(h, w, 2.0, seed + 41)
    # trowel swirls: overlapping arcs, the finish's sheen and its faint ridges
    sw = np.zeros((h, w))
    for _ in range(140):
        cx, cy = rng.random() * w, rng.random() * h
        R = rng.uniform(0.25, 0.6) * w / mx
        a0 = rng.random() * 2 * math.pi
        k = int(R + 8)
        yy, xx = np.mgrid[-k : k + 1, -k : k + 1].astype(np.float64)
        d = np.abs(np.sqrt(xx * xx + yy * yy) - R)
        ang = np.mod(np.arctan2(yy, xx) - a0, 2 * math.pi)
        arc = (ang < rng.uniform(0.8, 2.2)) * np.exp(-((d / rng.uniform(2, 6)) ** 2))
        stamp(sw, cx, cy, arc * rng.uniform(0.3, 1.0), "add")
    sw = np.clip(sw, 0, 2)
    agg = (np.random.default_rng(seed + 1).random((h, w)) < 0.02) * np.random.default_rng(seed + 2).random((h, w))
    agg = blur(agg, 0.7) * 3
    stains = np.clip(fbm(h, w, [30, 90], seed + 3) - 0.4, 0, 1)
    marks = strokes(h, w, 260, w * 0.4, 1.8, seed + 5, spread=0.6, curve=0.2)
    rubber = strokes(h, w, 120, w * 0.12, 3.0, seed + 6, spread=1.2, curve=0.4)
    v = v + 0.04 * sw - 0.07 * agg - 0.10 * stains - 0.07 * marks - 0.05 * rubber
    # the joints: a sawn groove at the tile's edges (top: only across)
    dj = np.minimum(x, mx - x) if top else np.minimum(np.minimum(x, mx - x), np.minimum(y, my - y))
    joint = np.clip(1 - dj / 0.004, 0, 1)
    jlip = np.clip(1 - dj / 0.012, 0, 1)
    v = v * (1 - 0.7 * joint) * (1 - 0.05 * jlip)
    if top:
        fall = np.exp(-y / 0.25)
        wax = np.clip(fbm(h, w, [5, 18], seed + 7) * 0.5 + 0.6, 0, 1) * fall
        black = strokes(h, w, 400, w * 0.02, 1.4, seed + 8, angle=0, spread=0.4, region=((0, 1), (0, 0.2)))
        v = v * (1 - 0.45 * wax) - 0.25 * black
    rgb = lin("#aaa398") * v[..., None]
    rgb[..., 2] *= 1 - 0.05 * stains
    # (rust bleeding from the joints' dowels, a warm stain or two)
    warm = np.clip(fbm(h, w, [10, 40], seed + 12) - 1.2, 0, 1) * 0.6
    rgb = rgb * (1 - warm[..., None]) + lin("#8a6a4c") * v[..., None] * warm[..., None]
    hm = 0.08 * sw + 0.25 * agg - 1.0 * joint - 0.2 * jlip + 0.05 * fbm(h, w, [1.0, 3], seed + 9)
    rough = 0.78 - 0.1 * np.clip(sw, 0, 1) - 0.15 * marks - (0.35 * wax if top else 0)
    name = "conctop" if top else "conc"
    png(f"{name}_a", rgb)
    png(f"{name}_n", normal_from(blur(hm, 0.6), 1.5), linear_in=False)
    png(f"{name}_orm", orm(1 - 0.4 * joint, rough, np.zeros((h, w))), linear_in=False)


def make_concside(n=1024):
    """Board-formed concrete (2.44 × 1.22): the boards' prints in courses 15 cm high, tie holes, efflorescence."""
    mx, my = 2.44, 1.22
    h, w = n // 2, n
    seed = 801
    x, y = grid(h, w, mx, my)
    board = np.floor(y / 0.1525)
    grain = noise(h, w, (1, 30), seed) * 0.5
    tone = 0.58 + 0.04 * np.sin(board * 5.3) + 0.03 * grain + 0.04 * fbm(h, w, [6, 30], seed + 1)
    db = tile_dist(y, 0.1525)
    line = np.clip(1 - db / 0.002, 0, 1)
    tone = tone * (1 - 0.25 * line)
    rng = np.random.default_rng(seed)
    holes = np.zeros((h, w))
    for hx in (0.3, 1.52):
        for hy in (0.3, 0.92):
            k, _ = disc(0.012 * w / mx, 1)
            stamp(holes, (hx + rng.normal(0, 0.01)) * w / mx, hy * h / my, k)
    efflo = np.clip(fbm(h, w, [8, 30], seed + 3) - 0.9, 0, 1) * np.clip(1 - y / my, 0, 1)
    tone = tone * (1 - 0.5 * holes) + 0.15 * efflo
    rgb = lin("#a8a398") * tone[..., None]
    hm = grain * 0.2 - line - holes * 1.5
    png("concside_a", rgb)
    png("concside_n", normal_from(blur(hm, 0.5), 1.4), linear_in=False)


def make_floor(n=2048):
    """The hall's floor: power-floated concrete (6.1 m tile, a saw cut each edge), tyre marks of the old works,
    oil, an old painted aisle line, scuffs."""
    mx = my = 6.1
    h = w = n
    seed = 901
    x, y = grid(h, w, mx, my)
    v = 0.5 + 0.06 * fbm(h, w, [6, 24, 90], seed)
    float_ = blur(np.random.default_rng(seed + 1).random((h, w)) - 0.5, 14) * 8
    tyres = strokes(h, w, 30, w * 0.8, 6, seed + 2, angle=0.1, spread=0.3, curve=0.3)
    oil = np.clip(fbm(h, w, [20, 60], seed + 3) - 1.1, 0, 1)
    marks = strokes(h, w, 250, w * 0.06, 1.2, seed + 4, spread=2.0)
    dj = np.minimum(np.minimum(x, mx - x), np.minimum(y, my - y))
    cut = np.clip(1 - dj / 0.003, 0, 1)
    # an old yellow aisle line, mostly worn
    aisle = (np.abs(x - 1.2) < 0.05) * np.clip(fbm(h, w, [2, 8], seed + 5) + 0.4, 0, 1)
    v = v + 0.03 * float_ - 0.07 * tyres - 0.12 * oil - 0.05 * marks
    v = v * (1 - 0.6 * cut)
    rgb = lin("#9a968e") * v[..., None]
    yel = lin("#c9a23a")
    rgb = rgb * (1 - aisle[..., None] * 0.7) + yel * 0.6 * aisle[..., None] * 0.7
    hm = float_ * 0.05 - cut + 0.05 * noise(h, w, 0.8, seed + 6)
    png("floor_a", rgb)
    png("floor_n", normal_from(blur(hm, 0.6), 1.2), linear_in=False)
    png("floor_orm", orm(1 - 0.3 * cut, 0.55 - 0.15 * float_ * 0.1 - 0.2 * oil, np.zeros((h, w))), linear_in=False)


# ── the hall ─────────────────────────────────────────────────────────────────────────────────────────────────

BRICK_W, BRICK_H, MORTAR = 0.225, 0.075, 0.01  # (a course 75 mm with its joint; a brick 215 + 10 mm)


def brick_field(h, w, mx, my, seed, paint=None):
    """Common brick in stretcher bond over mx × my m: its colour, its height map."""
    x, y = grid(h, w, mx, my)
    row = np.floor(y / BRICK_H)
    xo = x + (row % 2) * BRICK_W / 2
    col = np.floor(xo / BRICK_W)
    bx = np.mod(xo, BRICK_W)
    by = np.mod(y, BRICK_H)
    dm = np.minimum(np.minimum(bx, BRICK_W - bx), np.minimum(by, BRICK_H - by))
    mortar = np.clip(1 - (dm - MORTAR / 2) / 0.0015, 0, 1)
    bid = (row * 131 + col * 17).astype(np.int64)
    rnd = (np.sin(bid * 12.9898) * 43758.5453) % 1.0
    rnd2 = (np.sin(bid * 78.233) * 12543.23) % 1.0
    reds = np.stack([0.42 + 0.12 * rnd, 0.16 + 0.05 * rnd2, 0.10 + 0.03 * rnd], -1) ** 1.6
    dark = (rnd2 > 0.85)[..., None]
    reds = np.where(dark, reds * 0.55, reds)
    tex = fbm(h, w, [0.8, 3], seed) * 0.08
    rgb = reds * (1 + tex)[..., None]
    mort = lin("#8c857a") * (0.9 + 0.1 * noise(h, w, 1, seed + 1))[..., None]
    rgb = rgb * (1 - mortar[..., None]) + mort * mortar[..., None]
    # soot and the old works' grime down from the top; damp from the floor
    soot = np.clip(fbm(h, w, [20, 80], seed + 2) * 0.4 + 0.3, 0, 1)
    rgb = rgb * (1 - 0.35 * soot[..., None])
    hm = -mortar * 1.0 + tex * 0.5 + 0.1 * noise(h, w, 2, seed + 3)
    return rgb, hm, mortar


def make_brick(n=2048):
    mx, my = 2.7, 2.7  # (12 bricks, 36 courses: the bond repeats)
    h = w = n
    rgb, hm, mortar = brick_field(h, w, mx, my, 1001)
    png("brick_a", rgb)
    png("brick_n", normal_from(blur(hm, 0.6), 2.0), linear_in=False)
    png("brick_orm", orm(1 - 0.35 * mortar, 0.85 + 0.05 * mortar, np.zeros((h, w))), linear_in=False)


def make_block(n=1024):
    """Concrete block (0.4 × 0.2 m, 1.6 × 1.6 tile)."""
    mx = my = 1.6
    h = w = n
    seed = 1101
    x, y = grid(h, w, mx, my)
    row = np.floor(y / 0.2)
    xo = x + (row % 2) * 0.2
    bx = np.mod(xo, 0.4)
    by = np.mod(y, 0.2)
    dm = np.minimum(np.minimum(bx, 0.4 - bx), np.minimum(by, 0.2 - by))
    mortar = np.clip(1 - (dm - 0.005) / 0.0015, 0, 1)
    bid = (row * 31 + np.floor(xo / 0.4) * 7).astype(int)
    tone = 0.55 + 0.05 * np.sin(bid * 9.7) + 0.06 * fbm(h, w, [0.7, 2, 6], seed)
    rgb = lin("#9e9a92") * tone[..., None] * (1 - 0.3 * mortar[..., None])
    png("block_a", rgb)
    png("block_n", normal_from(blur(-mortar + 0.1 * noise(h, w, 0.8, seed + 1), 0.6), 1.5), linear_in=False)


def make_cladding(n=1024):
    """Corrugated steel (1 m tile): the corrugation 76 mm a wave in the normal, streaks of rust from the laps."""
    h = w = n
    seed = 1201
    x, y = grid(h, w, 1.0, 1.0)
    wave = np.sin(x / 0.0762 * 2 * math.pi)
    streak = np.clip(noise(h, w, (60, 1.5), seed) * 0.6, 0, 1)
    rgb = lin("#7f878c") * (0.9 + 0.08 * wave[..., None] - 0.18 * streak[..., None])
    rust = np.clip(fbm(h, w, [3, 12], seed + 1) - 1.0, 0, 1)
    rgb = rgb * (1 - rust[..., None]) + lin("#7a4628") * rust[..., None]
    png("cladding_a", rgb)
    png("cladding_n", normal_from(wave * 3.0, 0.6), linear_in=False)
    png("cladding_orm", orm(0.9 + 0.1 * wave, 0.5 + 0.3 * rust, 0.85 - 0.6 * rust), linear_in=False)


def make_steelpaint(n=512):
    """Painted structural steel, grey-blue, chipped at its edges (1 m tile)."""
    h = w = n
    seed = 1301
    v = 0.9 + 0.06 * fbm(h, w, [2, 10, 40], seed)
    chips = np.clip(fbm(h, w, [1.5, 4], seed + 1) - 1.4, 0, 1) > 0
    rgb = lin("#4a5866") * v[..., None]
    rgb = np.where(chips[..., None], lin("#5c4a3a"), rgb)
    png("steelpaint_a", rgb)
    png("steelpaint_orm", orm(np.ones((h, w)), np.where(chips, 0.8, 0.5), np.where(chips, 0.6, 0.15)), linear_in=False)


# ── the murals and the tags (our own words) ─────────────────────────────────────────────────────────────────

FONT_BOLD = "/System/Library/Fonts/Supplemental/Impact.ttf"
FONT_ROUND = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"
FONT_MARK = "/System/Library/Fonts/MarkerFelt.ttc"


def piece(w, h, words, fill, outline, shadow, seed, font=FONT_BOLD, size=0.6, rot=-4, sx=1.15, y=0.5, extra=()):
    """A graffiti 'piece': letters filled with a fade, a fat outline, a 3D shadow, highlights, overspray — RGBA."""
    items = [dict(text=words, x=0.5, y=y, size=size, rot=rot, sx=sx, font=font, spacing=0.92)]
    m = text_mask(w, h, items)
    out = dilate(m, w * 0.006)
    shad = np.roll(np.roll(dilate(m, w * 0.006), int(w * 0.012), 1), int(h * 0.025), 0)
    rgb = np.zeros((h, w, 3))
    a = np.zeros((h, w))
    yy = np.linspace(0, 1, h)[:, None]
    c0, c1 = lin(fill[0]), lin(fill[1])
    grad = c0[None, None, :] * (1 - yy[..., None]) + c1[None, None, :] * yy[..., None]
    # (back to front: shadow, outline, fill, a shine)
    for mask, col in ((spray(shad, seed), lin(shadow)), (spray(out, seed + 1), lin(outline))):
        rgb = rgb * (1 - mask[..., None]) + col * mask[..., None]
        a = np.maximum(a, mask)
    fm = spray(m, seed + 2, 0.8)
    rgb = rgb * (1 - fm[..., None]) + grad * fm[..., None]
    shine = strokes(h, w, 18, w * 0.03, h * 0.004, seed + 3, angle=-0.6, spread=0.2) * m
    rgb = rgb + np.clip(shine, 0, 1)[..., None] * 0.6
    for it in extra:
        mm = spray(text_mask(w, h, [it]), seed + 9)
        rgb = rgb * (1 - mm[..., None]) + lin(it["colour"]) * mm[..., None]
        a = np.maximum(a, mm)
    dr = drips(fm, seed + 4, n=30, length=int(h * 0.08)) - fm
    rgb = rgb * (1 - np.clip(dr, 0, 1)[..., None]) + grad * np.clip(dr, 0, 1)[..., None]
    a = np.maximum(a, np.clip(dr, 0, 1))
    return rgb, a


def mural(name, words, fill, outline, shadow, ground, seed, mx=12.0, my=4.0, font=FONT_BOLD, extra=(), backdrop=None, n=2048):
    """A mural on the hall's brick (mx × my m): a painted ground (a sprayed field of colour with soft edges), the
    piece on it, the brick's mortar showing through the paint."""
    w = n
    h = int(n * my / mx)
    rgb_b, hm, mortar = brick_field(h, w, mx, my, seed)
    # the ground: a sprayed blob behind the letters
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    blob = np.clip(1.2 - ((xx - 0.5) / 0.47) ** 2 - ((yy - 0.5) / 0.44) ** 2 + fbm(h, w, [20, 60], seed) * 0.15, 0, 1)
    blob = np.clip(blob * 3, 0, 1)
    g0, g1 = lin(ground[0]), lin(ground[1])
    gcol = g0 * (1 - yy[..., None]) + g1 * yy[..., None]
    rgb = rgb_b * (1 - blob[..., None]) + gcol * blob[..., None]
    if backdrop:
        rgb = backdrop(rgb, h, w, seed)
    p_rgb, p_a = piece(w, h, words, fill, outline, shadow, seed + 7, font=font, extra=extra)
    rgb = rgb * (1 - p_a[..., None]) + p_rgb * p_a[..., None]
    # (the mortar through the paint, the paint's sheen worn)
    paint = np.maximum(blob, p_a)
    rgb = rgb * (1 - 0.35 * mortar[..., None] * paint[..., None])
    png(name + "_a", rgb)
    return name


def peaks(rgb, h, w, seed):
    """A backdrop of pines and snowy peaks (the town's)."""
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    rng = np.random.default_rng(seed)
    ridge = 0.55 + 0.12 * np.sin(xx * 9 + 1) + 0.06 * np.sin(xx * 23 + 2) + fbm(1, w, [6, 20], seed)[0] * 0.04
    mtn = yy > ridge
    snow = mtn & (yy < ridge + 0.06 + 0.03 * np.sin(xx * 40))
    out = rgb.copy()
    out = np.where(mtn[..., None], lin("#3a4a6e") * 0.9, out)
    out = np.where(snow[..., None], lin("#e8eef5"), out)
    for _ in range(22):
        px = rng.random()
        base = 0.85 + rng.random() * 0.1
        ht = rng.uniform(0.18, 0.32)
        tri = (yy < base) & (yy > base - ht) & (np.abs(xx - px) < (yy - (base - ht)) / ht * 0.03)
        out = np.where(tri[..., None], lin("#1d3b2c"), out)
    return out


def sunset(rgb, h, w, seed):
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    d = np.sqrt(((xx - 0.78) / 0.5) ** 2 + ((yy - 0.45) / 1.0) ** 2)
    sun = d < 0.18
    bands = (np.mod(yy * 18, 1) < 0.35) & (yy > 0.45)
    out = np.where((sun & ~bands)[..., None], lin("#ffcf3f"), rgb)
    return out


def make_murals():
    mural("mural_west", "SNOWBOUND", ("#7fe3ff", "#2a6bff"), "#0d1022", "#14234d", ("#f45d9c", "#7a2bd8"), 1401, backdrop=peaks)
    mural(
        "mural_north",
        "GRIND TIL THAW",
        ("#ffe14d", "#ff6a1a"),
        "#151515",
        "#5a1a00",
        ("#1fb6a6", "#0f5b78"),
        1402,
        mx=16.0,
        my=3.5,
        extra=[dict(text="HALL CREW '89", x=0.82, y=0.12, size=0.09, font=FONT_MARK, colour="#ffffff", rot=-2)],
    )
    mural("mural_east", "VARLOW", ("#ff5fd1", "#ff2a2a"), "#0a0a0a", "#2a0a3a", ("#ffd23f", "#ff8c1a"), 1403, font=FONT_ROUND, backdrop=sunset)
    mural(
        "mural_south",
        "SKATE HALL",
        ("#ffffff", "#bfe0ff"),
        "#c2185b",
        "#2a0010",
        ("#263238", "#111111"),
        1404,
        mx=10.0,
        my=3.0,
        extra=[dict(text="EST. 1989 · NO SKATING ON THE SNOW", x=0.5, y=0.12, size=0.08, font=FONT_MARK, colour="#ffd54f")],
    )


def make_tags(n=1024):
    """Sprayed tags on a 4 × 4 atlas (each cell 256 px): our own names, black, silver, colour; cut out by alpha."""
    words = ["KRVR", "SLUSH", "ZEPH", "LRCH", "MOX", "DUSK", "PLOW", "VRLW", "ICE9", "BONK", "OLLIE", "RIME", "FROST", "KINK", "DROP", "WAX"]
    cols = ["#111111", "#d0d4d8", "#e53935", "#1e88e5", "#fdd835", "#111111", "#8e24aa", "#00acc1", "#111111", "#43a047", "#f4511e", "#d0d4d8", "#3949ab", "#111111", "#ffb300", "#c62828"]
    rgb = np.zeros((n, n, 3))
    a = np.zeros((n, n))
    cell = n // 4
    for i, wd in enumerate(words):
        r, c = divmod(i, 4)
        layer = text_layer(cell, cell, [dict(text=wd, x=0.5, y=0.5, size=0.34 if len(wd) <= 4 else 0.25, rot=(-8 + 16 * ((i * 7) % 5) / 4), font=FONT_MARK if i % 2 else FONT_BOLD, sx=1.1, colour=cols[i])])
        m = spray(layer[..., 3], 1500 + i, 0.7)
        m = drips(m, 1600 + i, n=8, length=30)
        ys, xs = slice(r * cell, (r + 1) * cell), slice(c * cell, (c + 1) * cell)
        rgb[ys, xs] = lin(cols[i])
        a[ys, xs] = m
    png("tags_a", rgb, alpha=a)


def make_signs(n=1024):
    """The signs' atlas (1024 × 1024, rows of 256): SKATE HALL (enamel on steel), PRO SHOP (a lightbox), the shop's
    window (boards on its wall behind the glass), the rules board."""
    h = w = n
    rgb = np.zeros((h, w, 3))
    # row 0: SKATE HALL — white letters on red enamel, a border
    r0 = text_layer(w, 256, [dict(text="SKATE HALL", x=0.5, y=0.52, size=0.62, font=FONT_BOLD, sx=1.25, colour="#ffffff")])
    bg = np.ones((256, w, 3)) * lin("#b3261e")
    yy, xx = np.mgrid[0:256, 0:w]
    border = (np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, 255 - yy)) < 10) & (np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, 255 - yy)) > 4)
    bg[border] = lin("#ffffff")
    rgb[0:256] = bg * (1 - r0[..., 3:4]) + r0[..., :3] * r0[..., 3:4]
    rgb[0:256] *= (0.9 + 0.1 * noise(256, w, 3, 1701))[..., None]
    # row 1: PRO SHOP — a lightbox, black with yellow letters
    r1 = text_layer(w, 256, [dict(text="PRO SHOP · BOARDS · WAX · BEARINGS", x=0.5, y=0.5, size=0.38, font=FONT_BOLD, colour="#ffd23f")])
    rgb[256:512] = lin("#111111") * (1 - r1[..., 3:4]) + r1[..., :3] * r1[..., 3:4]
    # row 2: the shop's window: a dim shop behind glass, boards in a row on the wall, a sticker sheet
    win = np.ones((256, w, 3)) * lin("#2a2620")
    rng = np.random.default_rng(1702)
    for k in range(22):
        x0 = 20 + k * 44 + rng.integers(-3, 4)
        colr = lin(["#e53935", "#1e88e5", "#fdd835", "#43a047", "#8e24aa", "#ff7043", "#ffffff", "#00acc1"][k % 8])
        yy2, xx2 = np.mgrid[0:256, 0:w]
        deck = ((xx2 - x0 - 15) / 15.0) ** 2 + ((yy2 - 128) / 100.0) ** 2 < 1
        win[deck] = colr * 0.6
    win = win + np.linspace(0.12, 0.0, w)[None, :, None] * 0.6
    rgb[512:768] = win
    # row 3: the rules board
    r3 = text_layer(
        w,
        256,
        [
            dict(text="HALL RULES", x=0.5, y=0.82, size=0.18, font=FONT_BOLD, colour="#111111"),
            dict(text="PADS UNDER 16  -  NO BIKES ON THE VERT  -  SNOW OFF YOUR WHEELS  -  BE NICE", x=0.5, y=0.45, size=0.085, font=FONT_ROUND, colour="#222222"),
            dict(text="SKATE AT YOUR OWN RISK", x=0.5, y=0.17, size=0.12, font=FONT_BOLD, colour="#b3261e"),
        ],
    )
    rgb[768:1024] = lin("#efe9d8") * (1 - r3[..., 3:4]) + r3[..., :3] * r3[..., 3:4]
    png("signs_a", rgb)


# ── the rack, the shop ───────────────────────────────────────────────────────────────────────────────────────


def make_wood(n=512):
    """A varnished hardwood (the counter, the rack), 1 m tile."""
    h = w = n
    seed = 1801
    x, y = grid(h, w, 1.0, 1.0)
    rings = 0.5 + 0.5 * np.sin((y * 30 + noise(h, w, (3, 60), seed) * 2) * 2 * math.pi)
    v = 0.85 + 0.15 * rings**2 + 0.05 * fbm(h, w, [2, 8], seed + 1)
    rgb = lin("#8a5a32") * v[..., None]
    png("wood_a", rgb)


# ── KTX2 ─────────────────────────────────────────────────────────────────────────────────────────────────────


def encode(names):
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        src = os.path.join(SRC, name + ".png")
        out = os.path.join(OUT, name + ".ktx2")
        if name.endswith("_n"):
            flags = ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "2.0", "-normal_map", "-mip_renorm"]
        elif name.endswith("_orm"):
            flags = ["-linear", "-q", "160"]
        elif name.startswith(("mural", "signs", "tags")):
            flags = ["-q", "255"]
        else:
            flags = ["-q", "190"]
        # (the normals and ORMs at half their drawn size past 1024: a quarter the bytes, the detail in the albedo)
        import struct

        w, h = struct.unpack(">II", open(src, "rb").read()[16:24])
        if name.endswith(("_n", "_orm")) and (w > 1024 or name.startswith(("deck", "block"))):
            flags += ["-resample", str(w // 2), str(h // 2)]
        if name.endswith("_n"):
            flags[flags.index("-uastc_rdo_l") + 1] = "5.0" if name.startswith(("deck", "brick", "block", "floor", "conc_")) else "3.0"
        subprocess.run([BASISU, "-ktx2", "-mipmap", "-quiet", *flags, src, "-output_file", out], check=True, stdout=subprocess.DEVNULL)
        print("encoded", name, os.path.getsize(out), flush=True)


ALL = {
    "masonite": lambda: make_masonite(False),
    "mastop": lambda: make_masonite(True),
    "deck": make_deck,
    "ply": make_ply,
    "lumber": make_lumber,
    "galv": make_galv,
    "tube": lambda: make_tube(False),
    "paintpipe": lambda: make_tube(True),
    "plate": make_plate,
    "conc": lambda: make_concrete(False),
    "conctop": lambda: make_concrete(True),
    "concside": make_concside,
    "floor": make_floor,
    "brick": make_brick,
    "block": make_block,
    "cladding": make_cladding,
    "steelpaint": make_steelpaint,
    "murals": make_murals,
    "tags": make_tags,
    "signs": make_signs,
    "wood": make_wood,
}

if __name__ == "__main__":
    only = (argv[argv.index("--only") + 1] if "--only" in argv else ",".join(ALL)).split(",")
    for k in only:
        ALL[k]()
    if "--encode" in argv:
        encode(MADE)

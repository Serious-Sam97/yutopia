# Plan 103 — the skateboards' own textures, made by code: the griptape's grit (albedo + normal, a 4 cm tile), the
# maple's atlas (the grain for a clear-coated top or bottom, the 7-ply stack for the edge) and each variant's
# bottom print, drawn here (shapes and invented lettering in an orthographic scene, Blender's own font) — written
# as PNG into tools/art/skate/tex-src and as KTX2 (basisu) into apps/client/public/life/skate/tex/.
#
#   blender -b --factory-startup -P tools/art/skate/stex.py -- [--only grip,maple,graphics] [--board vert-fish]
#                                                              [--encode]
#
# The print's UVs (boards.py): u along the deck from the tail's tip (0) to the nose's (1); v across, up the picture
# = the board's right (toe) side — so it reads the right way round on the bottom with the nose to the right.
import math
import os
import subprocess
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import boards  # noqa: E402
import skit as sk  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
SRC = sk.SRC
OUT = sk.TEX_OUT
BASISU = os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu")
RNG = np.random.default_rng(103)
GW, GH = 2048, 512  # the print's size (u × v)


# ── numpy helpers ────────────────────────────────────────────────────────────────────────────────────────────


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def lin(h):
    h = h.lstrip("#")
    return np.array([(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)]) ** 2.2


def png(path, rgb, linear_in=True, alpha=None):
    """rgb: H × W × 3 (row 0 the top), linear (→ sRGB) or as is (normals)."""
    import struct
    import zlib

    os.makedirs(os.path.dirname(path), exist_ok=True)
    v = srgb(rgb) if linear_in else np.clip(rgb, 0, 1)
    h, w, _ = v.shape
    a = np.ones((h, w)) if alpha is None else alpha
    px = (np.concatenate([v, a[..., None]], -1) * 255 + 0.5).astype(np.uint8)
    raw = b"".join(b"\x00" + px[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    print("made", os.path.basename(path), w, h)


def blur_wrap(a, sigma):
    """A Gaussian blur that wraps (FFT): tiles stay tiles."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def normal_from(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nrm = np.stack([-dx, dy, np.ones_like(h)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return nrm * 0.5 + 0.5


def noise1(n, cells, seed):
    r = np.random.default_rng(seed).random(cells + 1)
    x = np.arange(n) * cells / n
    i = np.floor(x).astype(int)
    t = x - i
    t = t * t * (3 - 2 * t)
    return r[i] * (1 - t) + r[np.minimum(i + 1, cells)] * t


# ── the grip ─────────────────────────────────────────────────────────────────────────────────────────────────


def make_grip(n=512):
    """Silicon-carbide grit on black tape: 4 cm a tile (0.08 mm a pixel), grains ~0.3–0.5 mm."""
    g = RNG.random((n, n))
    h1 = blur_wrap(g - 0.5, 1.6)
    h1 = (h1 - h1.mean()) / h1.std()
    grains = np.clip((h1 - 0.35) * 0.9, 0, None) ** 0.8
    h2 = blur_wrap(RNG.random((n, n)) - 0.5, 0.9)
    h2 = (h2 - h2.mean()) / h2.std()
    h = grains + 0.25 * np.clip(h2, 0, None)
    png(os.path.join(SRC, "grip_n.png"), normal_from(h, 1.4), linear_in=False)
    sp = RNG.random((n, n))
    base = 0.014 + 0.008 * np.tanh(grains) + 0.003 * (h2 * 0.2)
    base = base + np.where(sp > 0.9985, 0.05, 0.0) * (grains > 0.3)
    rgb = np.stack([base * 0.98, base * 0.99, base * 1.03], -1)
    png(os.path.join(SRC, "grip_a.png"), rgb)


# ── the maple ────────────────────────────────────────────────────────────────────────────────────────────────


def maple(w, h, seed, tone=(0.70, 0.50, 0.30), stretch=1.0):
    """Hard maple's grain along the picture's width (x): pale, close, a little wavy, a fleck of figure."""
    rng = np.random.default_rng(seed)
    yy = np.arange(h)[:, None] / h
    xx = np.arange(w)[None, :] / w
    warp = 0.012 * np.sin(xx * 6.3 * 3 + rng.random() * 6) + 0.006 * (noise1(w, 9, seed)[None, :] - 0.5)
    rings = np.zeros((h, w))
    for k, (f, a) in enumerate(((85, 0.5), (190, 0.3), (420, 0.2))):
        ph = noise1(h, 40, seed + k)[:, None] * 6
        rings += a * (0.5 + 0.5 * np.sin((yy + warp * (k + 1)) * f * stretch * 2 * math.pi + ph))
    streak = noise1(h, 300, seed + 7)[:, None]
    fleck = blur_wrap(rng.random((h, w)) - 0.5, 1.2)
    v = 0.86 + 0.08 * rings - 0.06 * (streak - 0.5) + 0.25 * fleck
    v = v * (0.97 + 0.03 * noise1(w, 5, seed + 3)[None, :])
    t = np.array(tone)
    return v[..., None] * t[None, None, :]


def make_maple(n=1024):
    """The atlas: rows 0..76% (from the bottom) the face grain; 81..99% the seven plies, the top ply at the top."""
    img = np.zeros((n, n, 3))
    face = maple(n, int(n * 0.78), 5)
    img[n - face.shape[0] :] = face
    h = int(n * 0.2)
    plies = np.zeros((h, n, 3))
    edges = np.linspace(0, h, 8).astype(int)
    for k in range(7):
        a, b = edges[k], edges[k + 1]
        if k % 2 == 0:  # long grain: streaks along
            p = maple(n, b - a, 30 + k, stretch=0.4)
        else:  # cross grain (end grain): speckled, a shade darker and warmer
            sp = blur_wrap(RNG.random((b - a, n)) - 0.5, 0.7)
            v = 0.72 + 0.5 * sp + 0.05 * noise1(n, 60, 40 + k)[None, :]
            p = v[..., None] * np.array([0.64, 0.42, 0.24])[None, None, :]
        plies[a:b] = p
        plies[max(a, b - 3) : b] *= 0.42  # the glue line (≈0.2 mm on an 11.5 mm edge)
    img[: h + int(n * 0.0)] = img[: h + int(n * 0.0)]
    top = int(n * 0.01)
    img[top : top + h] = plies[::-1]  # (row 0 the top: the top ply at the top)
    img[:top] = plies[-1:].repeat(top, 0)
    png(os.path.join(SRC, "maple_a.png"), img)


# ── the prints ───────────────────────────────────────────────────────────────────────────────────────────────


class Canvas:
    """An orthographic scene over the deck's bottom: x along the deck (metres, the tail's tip to the nose's), y up the
    picture (the board's right), drawn back to front; rendered to GW × GH."""

    def __init__(self, vid, bg=None, transparent=False):
        s = boards.spec(vid)
        self.s = s
        self.x0, self.x1, self.wm = s["x_t"], s["x_n"], s["wm"]
        self.L = self.x1 - self.x0
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        self.sc = sc
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = GW, GH
        sc.render.resolution_percentage = 100
        sc.render.film_transparent = transparent
        sc.view_settings.view_transform = "Standard"
        sc.view_settings.look = "None"
        sc.render.image_settings.color_mode = "RGBA"
        try:
            sc.eevee.taa_render_samples = 16
        except AttributeError:
            pass
        w = bpy.data.worlds.new("w")
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs["Color"].default_value = (*(lin(bg) if bg else (0, 0, 0)), 1)
        sc.world = w
        cam = bpy.data.cameras.new("c")
        cam.type = "ORTHO"
        cam.ortho_scale = self.L
        co = bpy.data.objects.new("c", cam)
        co.location = ((self.x0 + self.x1) / 2, 0, 10)
        sc.collection.objects.link(co)
        sc.camera = co
        self.root = bpy.data.objects.new("root", None)
        sc.collection.objects.link(self.root)
        self.root.scale = (1, (self.L / 4) / self.wm, 1)
        self.z = 0.0
        self.mats = {}

    def mat(self, col):
        if col in self.mats:
            return self.mats[col]
        m = bpy.data.materials.new(col)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        e = nt.nodes.new("ShaderNodeEmission")
        e.inputs["Color"].default_value = (*lin(col), 1)
        nt.links.new(e.outputs[0], o.inputs[0])
        self.mats[col] = m
        return m

    def _link(self, o, col):
        self.z += 0.0005
        o.parent = self.root
        o.location.z += self.z
        if o.type == "MESH":
            o.data.materials.append(self.mat(col))
        else:
            o.data.materials.append(self.mat(col))
        return o

    def poly(self, pts, col):
        me = bpy.data.meshes.new("p")
        me.from_pydata([(x, y, 0) for x, y in pts], [], [tuple(range(len(pts)))])
        me.update()
        o = bpy.data.objects.new("p", me)
        self.sc.collection.objects.link(o)
        return self._link(o, col)

    def tri_fan(self, pts, col):
        """A polygon that may be concave (triangulated by Blender's own fill)."""
        import bmesh

        me = bpy.data.meshes.new("p")
        bm = bmesh.new()
        vs = [bm.verts.new((x, y, 0)) for x, y in pts]
        for i in range(len(vs)):
            bm.edges.new((vs[i], vs[(i + 1) % len(vs)]))
        bmesh.ops.triangle_fill(bm, edges=bm.edges[:], use_beauty=True)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new("p", me)
        self.sc.collection.objects.link(o)
        return self._link(o, col)

    def circle(self, cx, cy, r, col, n=96, ry=None):
        ry = r if ry is None else ry
        return self.poly([(cx + r * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)], col)

    def ring(self, cx, cy, r0, r1, col, n=128, a0=0.0, a1=2 * math.pi):
        me = bpy.data.meshes.new("r")
        vs, fs = [], []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            vs += [(cx + r0 * math.cos(a), cy + r0 * math.sin(a), 0), (cx + r1 * math.cos(a), cy + r1 * math.sin(a), 0)]
        for i in range(n):
            fs.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
        me.from_pydata(vs, [], fs)
        o = bpy.data.objects.new("r", me)
        self.sc.collection.objects.link(o)
        return self._link(o, col)

    def rect(self, x0, y0, x1, y1, col, rot=0.0):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        c, s_ = math.cos(rot), math.sin(rot)
        return self.poly([(cx + (x - cx) * c - (y - cy) * s_, cy + (x - cx) * s_ + (y - cy) * c) for x, y in pts], col)

    def star(self, cx, cy, r0, r1, k, col, rot=0.0):
        pts = []
        for i in range(2 * k):
            r = r1 if i % 2 == 0 else r0
            a = rot + math.pi * i / k
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return self.tri_fan(pts, col)

    def text(self, s, x, y, size, col, rot=0.0, align="CENTER", bold=0.0, shear=0.0, sx=1.0, sy=1.0, outline=None, shadow=None):
        """Text centred at (x, y) (metres), its cap height ~0.7 size; bold grows its outline (a share of size);
        outline (colour, width as a share of size) and shadow (colour, dx, dy) drawn behind it."""
        layers = []
        if shadow:
            layers.append((shadow[0], bold + (outline[1] if outline else 0), shadow[1], shadow[2]))
        if outline:
            layers.append((outline[0], bold + outline[1], 0, 0))
        layers.append((col, bold, 0, 0))
        for c, b, dx, dy in layers:
            # (bold and outlines as copies stamped round a circle: Blender's own offset leaves specks in some glyphs)
            k = 0 if b <= 0 else 28
            stamps = [(0.0, 0.0)] + [(b * size * math.cos(2 * math.pi * i / k), b * size * math.sin(2 * math.pi * i / k)) for i in range(k)]
            z0 = None
            for ox, oy in stamps:
                cu = bpy.data.curves.new("t", "FONT")
                cu.body = s
                cu.size = size
                cu.align_x = align
                cu.align_y = "CENTER"
                cu.shear = shear
                cu.space_character = 1.04
                o = bpy.data.objects.new("t", cu)
                self.sc.collection.objects.link(o)
                o.location = (x + dx + ox, (y + dy + oy), 0)
                o.rotation_euler = (0, 0, rot)
                o.scale = (sx, sy, 1)
                self._link(o, c)
                if z0 is None:
                    z0 = o.location.z
                else:
                    o.location.z = z0  # (one layer: the stamps at one depth)
            self.z = z0

    def arc_text(self, s, cx, cy, r, a_mid, size, col, inward=False, bold=0.0, spread=None):
        """Letters set round a circle, centred at angle a_mid, reading clockwise along the top (or along the bottom
        reading left to right if inward)."""
        n = len(s)
        step = spread if spread else size * 0.62 / r
        for i, ch in enumerate(s):
            k = i - (n - 1) / 2
            if not inward:
                a = a_mid - k * step
                rot = a - math.pi / 2
            else:
                a = a_mid + k * step
                rot = a + math.pi / 2
            self.text(ch, cx + r * math.cos(a), cy + r * math.sin(a), size, col, rot=rot, bold=bold)

    def render(self):
        out = os.path.join(SRC, "_draw.png")
        self.sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(out)
        w, h = im.size
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
        bpy.data.images.remove(im)
        os.remove(out)
        return px  # (sRGB values as rendered, Standard view)


def finish(px, vid, wood=None, wear=0.0):
    """The print as a screen print: over a wood ground where it's transparent, a whisper of ink grain."""
    rgb = px[..., :3] ** 2.2
    a = px[..., 3]
    if wood is not None:
        rgb = rgb * a[..., None] + wood * (1 - a[..., None])
    g = blur_wrap(RNG.random(a.shape) - 0.5, 0.8)
    rgb = rgb * (1 + 0.05 * g[..., None])
    png(os.path.join(SRC, f"graphic-{vid}.png"), rgb)


def wood_ground(tone=(0.70, 0.50, 0.30), seed=11):
    return maple(GW, GH, seed, tone=tone, stretch=GH / 1024 * 1.4)


# each print in deck metres: X from the tail's tip (s.x_t) to the nose's, Y ± half the width (Y up = the toe side)


def g_vert_classic(vid):
    c = Canvas(vid, bg="#14002A")
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    # the night: bands of deep colour, a scatter of stars
    for i, col in enumerate(("#1E0638", "#2A0A4A", "#3A0B57")):
        c.rect(x0, -hw + i * 0.03, x1, -hw + (i + 1) * 0.03, col)
    rng = np.random.default_rng(3)
    for _ in range(46):
        sx, sy = x0 + rng.random() * (x1 - x0), (rng.random() - 0.5) * 2 * hw
        r = 0.002 + rng.random() * 0.004
        c.star(sx, sy, r * 0.35, r, 4, "#FFF6D8", rot=rng.random())
    # the comet's tail: streaks fanning back to the tail end
    hx, hy = 0.12, 0.012
    for k, (col, wdt) in enumerate((("#00A3AD", 0.105), ("#E4007C", 0.075), ("#FF7A00", 0.05), ("#FFD400", 0.028))):
        c.tri_fan([(hx - 0.01, hy + wdt * 0.55), (x0 + 0.03 + k * 0.035, hy + wdt * 1.25 - 0.02 * k), (x0 + 0.01 + k * 0.05, hy - wdt * 0.15), (x0 + 0.04 + k * 0.035, hy - wdt * 1.15 + 0.012 * k), (hx - 0.01, hy - wdt * 0.55)], col)
    for k in range(9):
        y = hy + (k - 4) * 0.02
        c.rect(x0 + 0.06 + 0.02 * (k % 3), y - 0.0016, hx - 0.06 - 0.012 * abs(k - 4), y + 0.0016, "#FFF6D8")
    # the head: a burning ball, its rays
    c.star(hx, hy, 0.06, 0.098, 14, "#E4007C", rot=0.1)
    c.star(hx, hy, 0.05, 0.08, 14, "#FF7A00", rot=0.32)
    c.circle(hx, hy, 0.058, "#FFD400")
    c.circle(hx + 0.012, hy + 0.014, 0.024, "#FFF4A8")
    # the checkerboard band across the tail's end
    sq = 0.0127
    for i in range(3):
        for j in range(int(2 * hw / sq) + 1):
            if (i + j) % 2 == 0:
                c.rect(x0 + 0.004 + i * sq, -hw + j * sq, x0 + 0.004 + (i + 1) * sq, -hw + (j + 1) * sq, "#F2F2F2")
    # the lettering
    c.text("VARLOW", -0.02, -0.042, 0.058, "#FFD400", bold=0.035, shear=0.28, sx=1.25, outline=("#000000", 0.05), shadow=("#E4007C", 0.005, -0.005))
    c.text("COMET", 0.262, -0.07, 0.036, "#00E1EE", bold=0.03, shear=0.28, outline=("#000000", 0.05))
    c.text("PRO VERT  ·  10\"", 0.262, 0.085, 0.016, "#F2F2F2", bold=0.01)
    finish(c.render(), vid)


def g_vert_fish(vid):
    c = Canvas(vid, bg="#003B46")
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    # the sea: bands, then waves cut along its lower edge
    c.rect(x0, -hw, x1, 0.0, "#005F6B")
    c.rect(x0, 0.0, x1, hw, "#00A6A6")
    for row, (yb, col) in enumerate(((-0.05, "#003B46"), (-0.085, "#012A33"))):
        pts = [(x0, -hw)]
        n = 26
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            pts.append((x, yb + 0.012 * math.sin(i * math.pi * 0.95 + row)))
        pts.append((x1, -hw))
        c.tri_fan(pts, col)
    # the marlin: body, bill to the nose, a sail fin of rays, the forked tail toward the fish end
    bx, by = 0.0, 0.03
    body = [(bx + 0.17 * math.cos(a), by + 0.045 * math.sin(a) * (1 - 0.35 * math.cos(a))) for a in np.linspace(0, 2 * math.pi, 60, endpoint=False)]
    sail = [(bx - 0.13, by + 0.03), (bx - 0.09, by + 0.105), (bx - 0.02, by + 0.112), (bx + 0.05, by + 0.095), (bx + 0.1, by + 0.04)]
    c.tri_fan(sail, "#FF6A13")
    for k in range(6):
        xk = bx - 0.11 + k * 0.038
        c.rect(xk - 0.0016, by + 0.03, xk + 0.0016, by + 0.1 - abs(k - 2.4) * 0.008, "#7A2A00")
    c.tri_fan([(bx - 0.14, by), (bx - 0.25, by + 0.075), (bx - 0.215, by), (bx - 0.25, by - 0.07)], "#1A2A6C")
    c.tri_fan(body, "#1A2A6C")
    c.tri_fan([(bx + 0.15, by + 0.012), (bx + 0.31, by + 0.004), (bx + 0.31, by - 0.001), (bx + 0.15, by - 0.006)], "#1A2A6C")
    c.tri_fan([(x - 0.004 if y > by else x, by + (y - by) * 0.55 - 0.012) for x, y in body if x < bx + 0.15], "#E8EEF5")
    c.circle(bx + 0.125, by + 0.012, 0.009, "#FFFFFF")
    c.circle(bx + 0.127, by + 0.012, 0.0045, "#000000")
    for k in range(5):
        c.rect(bx - 0.07 + k * 0.035, by - 0.03, bx - 0.062 + k * 0.035, by + 0.03, "#3248A8")
    # bubbles
    for k, (x, y, r) in enumerate(((0.22, 0.06, 0.008), (0.25, 0.085, 0.005), (0.27, 0.05, 0.004), (-0.3, 0.07, 0.006))):
        c.ring(x, y, r * 0.7, r, "#E8F8F8")
    c.text("MARLIN", 0.0, -0.047, 0.05, "#FF6A13", bold=0.04, shear=0.22, sx=1.2, outline=("#000000", 0.05), shadow=("#FFD34D", 0.004, -0.004))
    c.text("VARLOW", 0.272, -0.04, 0.024, "#FFFFFF", bold=0.03, shear=0.2)
    finish(c.render(), vid)


def g_vert_square(vid):
    c = Canvas(vid, bg="#E10600")
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    # a sunburst behind: rays from the shield
    sx, sy = 0.03, 0.0
    for k in range(18):
        a0 = 2 * math.pi * k / 18
        a1 = a0 + math.pi / 18
        c.tri_fan([(sx, sy), (sx + 0.6 * math.cos(a0), sy + 0.6 * math.sin(a0)), (sx + 0.6 * math.cos(a1), sy + 0.6 * math.sin(a1))], "#B00400")
    # the shield
    sh = [(sx - 0.085, sy + 0.095), (sx + 0.085, sy + 0.095), (sx + 0.085, sy + 0.01), (sx + 0.05, sy - 0.07), (sx, sy - 0.105), (sx - 0.05, sy - 0.07), (sx - 0.085, sy + 0.01)]
    c.tri_fan([(x + (x - sx) * 0.12, y + (y - sy) * 0.12) for x, y in sh], "#000000")
    c.tri_fan([(x + (x - sx) * 0.06, y + (y - sy) * 0.06) for x, y in sh], "#2B3BFF")
    c.tri_fan(sh, "#F5F5F0")
    # a bolt across it
    c.tri_fan([(sx - 0.03, sy + 0.09), (sx + 0.03, sy + 0.09), (sx + 0.004, sy + 0.012), (sx + 0.04, sy + 0.012), (sx - 0.02, sy - 0.098), (sx - 0.004, sy - 0.018), (sx - 0.04, sy - 0.018)], "#2B3BFF")
    # stripes on the nose and the tail
    for x_, d in ((x0, 1), (x1, -1)):
        for k in range(4):
            xa = x_ + d * (0.012 + k * 0.022)
            c.rect(min(xa, xa + d * 0.012), -hw, max(xa, xa + d * 0.012), hw, "#F5F5F0" if k % 2 == 0 else "#2B3BFF")
    c.text("BULWARK", -0.22, 0.0, 0.05, "#F5F5F0", rot=math.pi / 2, bold=0.05, sx=1.0, outline=("#000000", 0.05))
    c.text("BULWARK", 0.25, 0.0, 0.05, "#F5F5F0", rot=-math.pi / 2, bold=0.05, outline=("#000000", 0.05))
    c.text("VARLOW", 0.03, -0.112, 0.02, "#000000", bold=0.04)
    finish(c.render(), vid)


def g_street_pop(vid):
    c = Canvas(vid, transparent=True)
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    sx, sy = -0.02, 0.008
    # the seal: rings, the maker round it, a larch in the middle, a kerb's edge under it
    c.circle(sx, sy, 0.084, "#1C1C1C")
    c.circle(sx, sy, 0.079, "#E9DFC8")
    c.ring(sx, sy, 0.056, 0.059, "#1C1C1C")
    c.arc_text("LARCH BOARD CO.", sx, sy, 0.0675, math.pi / 2, 0.016, "#1C1C1C", bold=0.03)
    c.arc_text("EST. 1989", sx, sy, 0.0675, -math.pi / 2, 0.014, "#1C1C1C", inward=True, bold=0.03)
    c.star(sx - 0.068, sy, 0.002, 0.005, 5, "#1C1C1C")
    c.star(sx + 0.068, sy, 0.002, 0.005, 5, "#1C1C1C")
    c.circle(sx, sy, 0.055, "#2F5D3A")
    for k in range(5):
        w = 0.012 + k * 0.007
        yb = sy + 0.035 - k * 0.013
        c.tri_fan([(sx - w, yb - 0.012), (sx, yb + 0.012), (sx + w, yb - 0.012)], "#E9DFC8")
    c.rect(sx - 0.003, sy - 0.04, sx + 0.003, sy - 0.022, "#E9DFC8")
    c.rect(sx - 0.05, sy - 0.044, sx + 0.05, sy - 0.04, "#E9DFC8")
    # the model's name, long and condensed, toward the tail; small print toward the nose
    c.text("KERB", -0.24, -0.002, 0.11, "#1E5AA8", bold=0.03, sx=0.62, sy=1.0, rot=math.pi / 2, outline=("#1C1C1C", 0.03))
    c.text("KERB", 0.23, -0.002, 0.11, "#1E5AA8", bold=0.03, sx=0.62, sy=1.0, rot=-math.pi / 2, outline=("#1C1C1C", 0.03))
    c.text("HARD ROCK MAPLE  ·  7 PLY  ·  8 x 31.5", sx, -0.088, 0.0105, "#1C1C1C", bold=0.02)
    finish(c.render(), vid, wood=wood_ground((0.62, 0.42, 0.25), 13))


def g_street_slick(vid):
    c = Canvas(vid, bg="#121212")
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    # diagonal bars down the length, a target in the middle
    for k in range(-14, 16):
        x = k * 0.03
        c.tri_fan([(x, -hw), (x + 0.012, -hw), (x + 0.012 + 0.12, hw), (x + 0.12, hw)], "#B22222" if k % 3 else "#E8E8E8")
    c.rect(-0.2, -hw, 0.2, hw, "#121212")
    for r, col in ((0.09, "#E8E8E8"), (0.075, "#B22222"), (0.06, "#121212"), (0.045, "#E8E8E8"), (0.03, "#B22222"), (0.015, "#121212")):
        c.circle(0.0, 0.0, r, col)
    c.text("SLICK", -0.135, 0.0, 0.07, "#E8E8E8", rot=math.pi / 2, bold=0.05, sx=0.75, outline=("#B22222", 0.04))
    c.text("LARCH", 0.135, 0.0, 0.05, "#E8E8E8", rot=-math.pi / 2, bold=0.05, sx=0.8)
    finish(c.render(), vid)


def g_street_tech(vid):
    c = Canvas(vid, bg="#1F3A27")
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    # a ruler down each edge
    for side in (-1, 1):
        y_e = side * (hw - 0.004)
        c.rect(x0, y_e - side * 0.0015, x1, y_e + side * 0.0015 * 0, "#C9D6C1")
        n = int((x1 - x0) / 0.005)
        for i in range(n + 1):
            x = x0 + i * 0.005
            ln = 0.014 if i % 10 == 0 else (0.009 if i % 2 == 0 else 0.005)
            c.rect(x - 0.0005, y_e - side * ln, x + 0.0005, y_e, "#C9D6C1")
    # the needle and its compass rose
    c.star(0.0, 0.0, 0.016, 0.075, 4, "#7A3E9D", rot=math.pi / 4)
    c.star(0.0, 0.0, 0.012, 0.06, 4, "#C9D6C1", rot=0.0)
    c.ring(0.0, 0.0, 0.052, 0.056, "#C9D6C1")
    c.tri_fan([(0.33, 0.0), (0.0, 0.009), (-0.3, 0.0), (0.0, -0.009)], "#E2E2E2")
    c.tri_fan([(0.33, 0.0), (0.0, 0.009), (0.0, 0.0)], "#9A9A9A")
    c.tri_fan([(-0.3, 0.0), (0.0, -0.009), (0.0, 0.0)], "#9A9A9A")
    c.circle(0.0, 0.0, 0.007, "#7A3E9D")
    c.text("NEEDLE", 0.17, -0.05, 0.03, "#C9D6C1", bold=0.02, sx=1.3)
    c.text("LARCH", -0.17, 0.05, 0.03, "#7A3E9D", bold=0.05, sx=1.2, outline=("#C9D6C1", 0.03))
    c.text("7.75", -0.17, -0.05, 0.022, "#C9D6C1", bold=0.02)
    finish(c.render(), vid)


def g_cruiser_classic(vid):
    c = Canvas(vid, bg="#2B1055")
    x0, x1, hw = c.x0, c.x1, c.wm / 2
    # a sunset: the sky in bands across the length, the sun at the nose cut by lines, palms at the tail
    for i, col in enumerate(("#2B1055", "#5B1A73", "#9B2C7A", "#E2477B", "#FF7F50", "#FFB347")):
        xa = x0 + (x1 - x0) * i / 6
        c.rect(xa, -hw, xa + (x1 - x0) / 6 + 0.002, hw, col)
    sx = x1 - 0.13
    c.circle(sx, 0.0, 0.085, "#F7E26B")
    for k in range(6):
        x = sx - 0.07 + k * 0.016
        c.rect(x, -0.09, x + 0.004 + k * 0.0012, 0.09, "#FFB347")
    for px, py, sc in ((x0 + 0.07, -0.04, 1.0), (x0 + 0.12, 0.05, 0.8)):
        c.tri_fan([(px, py - 0.06 * sc), (px + 0.004, py - 0.06 * sc), (px + 0.11 * sc, py + 0.004), (px + 0.105 * sc, py + 0.008)], "#1A0A2E")
        for a in (-1.1, -0.5, 0.2, 0.8, 1.4, 2.2, 2.8):
            tx, ty = px + 0.11 * sc, py + 0.006
            ex, ey = tx + 0.06 * sc * math.cos(a), ty + 0.06 * sc * math.sin(a)
            nx, ny = -(ey - ty) * 0.18, (ex - tx) * 0.18
            c.tri_fan([(tx, ty), ((tx + ex) / 2 + nx, (ty + ey) / 2 + ny), (ex, ey), ((tx + ex) / 2 - nx * 0.3, (ty + ey) / 2 - ny * 0.3)], "#1A0A2E")
    c.text("Sandell", 0.0, 0.01, 0.07, "#FFFFFF", bold=0.03, shear=0.3, sx=1.15, outline=("#1A0A2E", 0.05), shadow=("#40E0D0", 0.004, -0.004))
    c.text("COASTER", 0.0, -0.06, 0.022, "#1A0A2E", bold=0.04, sx=1.6)
    finish(c.render(), vid)


def g_cruiser_wood(vid):
    c = Canvas(vid, transparent=True)
    ink = "#3A2414"
    sx, sy = 0.02, 0.0
    c.ring(sx, sy, 0.052, 0.055, ink, n=96)
    for k, (dx, h) in enumerate(((-0.022, 0.03), (0.0, 0.04), (0.022, 0.03))):
        x = sx + dx
        c.tri_fan([(x - 0.012, sy - 0.01), (x, sy - 0.01 + h), (x + 0.012, sy - 0.01)], ink)
        c.rect(x - 0.0018, sy - 0.018, x + 0.0018, sy - 0.01, ink)
    c.rect(sx - 0.04, sy - 0.0205, sx + 0.04, sy - 0.0185, ink)
    c.arc_text("SANDELL", sx, sy, 0.041, math.pi / 2, 0.012, ink, bold=0.03)
    c.arc_text("GROVE", sx, sy, 0.041, -math.pi / 2, 0.012, ink, inward=True, bold=0.03)
    c.text("SANDELL CRUISER  ·  9 x 29  ·  HARD MAPLE", sx, -0.075, 0.0085, ink, bold=0.01)
    finish(c.render(), vid, wood=wood_ground((0.66, 0.46, 0.27), 17))


GRAPHICS = {
    "vert-classic": g_vert_classic,
    "vert-fish": g_vert_fish,
    "vert-square": g_vert_square,
    "street-pop": g_street_pop,
    "street-slick": g_street_slick,
    "street-tech": g_street_tech,
    "cruiser-classic": g_cruiser_classic,
    "cruiser-wood": g_cruiser_wood,
}


def encode(names):
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        src = os.path.join(SRC, name + ".png")
        out = os.path.join(OUT, name + ".ktx2")
        if name.endswith("_n"):
            flags = ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "1.5", "-normal_map", "-mip_renorm"]
        elif name.startswith("graphic"):
            flags = ["-q", "255"]  # (ETC1S at its best: ~90 KB a print, its flat colours hold; UASTC was ~500 KB)
        else:
            flags = []
        subprocess.run([BASISU, "-ktx2", "-mipmap", "-quiet", *flags, src, "-output_file", out], check=True, stdout=subprocess.DEVNULL)
        print("encoded", name, os.path.getsize(out))


if __name__ == "__main__":
    only = (argv[argv.index("--only") + 1] if "--only" in argv else "grip,maple,graphics").split(",")
    names = []
    if "grip" in only:
        make_grip()
        names += ["grip_a", "grip_n"]
    if "maple" in only:
        make_maple()
        names += ["maple_a"]
    if "graphics" in only:
        sel = argv[argv.index("--board") + 1].split(",") if "--board" in argv else list(GRAPHICS)
        for vid in sel:
            if vid in GRAPHICS:
                GRAPHICS[vid](vid)
                names.append(f"graphic-{vid}")
    if "--encode" in argv:
        encode(names)

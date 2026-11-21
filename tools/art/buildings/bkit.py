# Plan 110 (docs/plan/110-the-buildings.md, phase 0) — the buildings' kit: the helpers its parts are made with.
#
# A part is a small model at its own origin, in the PART FRAME (three's, so the GLB needs no turn): x along the
# wall, y up, z out of the wall (the wall's face at z = 0). Its mesh is kept by role (trim, sash, door, glass, …),
# not by colour: a building's colours reach the parts through their roles (F6). UVs are planar, in metres.
#
# Blender's frame is (x, −z, y) of the part's: glTF's y-up export turns it back.
import math
import os
import sys
from collections import defaultdict

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../bikes"))

# ── the roles: what each piece of a part is; its look in the sheet (the game maps a role to the material library
# and the building's colours) ───────────────────────────────────────────────────────────────────────────────────
ROLES = {
    "skin": dict(col=(0.47, 0.55, 0.60), rough=0.8),  # the wall's own (siding, brick…: the building's)
    "trim": dict(col=(0.86, 0.85, 0.80), rough=0.55),
    "sash": dict(col=(0.92, 0.91, 0.87), rough=0.5),
    "door": dict(col=(0.20, 0.27, 0.22), rough=0.45),
    "glass": dict(col=(0.10, 0.13, 0.15), rough=0.05, spec=0.9),
    "canvas": dict(col=(0.55, 0.12, 0.11), rough=0.9),
    "canvas2": dict(col=(0.88, 0.85, 0.78), rough=0.9),
    "metal": dict(col=(0.08, 0.085, 0.09), rough=0.55, metal=0.6),
    "chrome": dict(col=(0.8, 0.8, 0.8), rough=0.15, metal=1.0),
    "galv": dict(col=(0.55, 0.56, 0.56), rough=0.45, metal=0.9),
    "stone": dict(col=(0.70, 0.67, 0.60), rough=0.85),
    "brick": dict(col=(0.47, 0.20, 0.15), rough=0.9),
    "concrete": dict(col=(0.62, 0.61, 0.58), rough=0.9),
    "roof": dict(col=(0.20, 0.21, 0.23), rough=0.85),
    "copper": dict(col=(0.36, 0.58, 0.50), rough=0.6, metal=0.3),
    "wood": dict(col=(0.42, 0.30, 0.19), rough=0.75),
    "lamp": dict(col=(1.0, 0.86, 0.6), rough=0.4, emit=(1.0, 0.82, 0.55), es=2.0),
    "neon": dict(col=(1.0, 0.25, 0.3), rough=0.3, emit=(1.0, 0.2, 0.28), es=6.0),
    "sign": dict(col=(0.12, 0.16, 0.22), rough=0.5),
    "gold": dict(col=(0.85, 0.66, 0.28), rough=0.35, metal=1.0),
    "red": dict(col=(0.62, 0.08, 0.07), rough=0.45),
    "rubber": dict(col=(0.03, 0.03, 0.03), rough=0.9),
}
_MATS = {}


def material(role):
    if role in _MATS:
        return _MATS[role]
    d = ROLES[role]
    m = bpy.data.materials.new(role)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*d["col"], 1)
    b.inputs["Roughness"].default_value = d["rough"]
    b.inputs["Metallic"].default_value = d.get("metal", 0.0)
    if "spec" in d:
        b.inputs["Specular IOR Level"].default_value = d["spec"]
    if d.get("emit"):
        b.inputs["Emission Color"].default_value = (*d["emit"], 1)
        b.inputs["Emission Strength"].default_value = d["es"]
    _MATS[role] = m
    return m


# ── the buffers: by (part, role) ─────────────────────────────────────────────────────────────────────────────


class Buf:
    def __init__(self):
        self.v = []
        self.f = []
        self.uv = []
        self.smooth = []


BUFS = defaultdict(Buf)
CUR = ["part"]
# where the next faces go: an offset and a quarter-turn about y (for a bay's sides, a porch's corners)
XF = [dict(o=(0.0, 0.0, 0.0), turn=0.0)]


def begin(name):
    CUR[0] = name


def at(o=(0, 0, 0), turn=0.0):
    """Faces after this are moved by `o` and turned `turn` radians about y (the part's own up), then `o`."""
    XF[0] = dict(o=o, turn=turn)


def _xf(p):
    t = XF[0]["turn"]
    x, y, z = p
    if t:
        c, s = math.cos(t), math.sin(t)
        x, z = x * c + z * s, -x * s + z * c
    o = XF[0]["o"]
    return (x + o[0], y + o[1], z + o[2])


def _xfn(n):
    t = XF[0]["turn"]
    x, y, z = n
    if t:
        c, s = math.cos(t), math.sin(t)
        x, z = x * c + z * s, -x * s + z * c
    return (x, y, z)


def _newell(pts):
    nx = ny = nz = 0.0
    for i in range(len(pts)):
        a, c = pts[i], pts[(i + 1) % len(pts)]
        nx += (a[1] - c[1]) * (a[2] + c[2])
        ny += (a[2] - c[2]) * (a[0] + c[0])
        nz += (a[0] - c[0]) * (a[1] + c[1])
    return (nx, ny, nz)


def face(role, pts, n=None, smooth=False):
    """A polygon (part-frame points), wound to face `n` (part frame) when given; planar UVs in metres."""
    pts = [_xf(p) for p in pts]
    if n is not None:
        n = _xfn(n)
        g = _newell(pts)
        if g[0] * n[0] + g[1] * n[1] + g[2] * n[2] < 0:
            pts = pts[::-1]
    g = _newell(pts)
    ax = max(range(3), key=lambda i: abs(g[i]))
    if ax == 0:
        uvs = [(p[2] * (1 if g[0] < 0 else -1), p[1]) for p in pts]
    elif ax == 1:
        uvs = [(p[0], p[2]) for p in pts]
    else:
        uvs = [(p[0] * (1 if g[2] > 0 else -1), p[1]) for p in pts]
    b = BUFS[(CUR[0], role)]
    base = len(b.v)
    b.v.extend((p[0], -p[2], p[1]) for p in pts)
    b.f.append(list(range(base, base + len(pts))))
    b.uv.append(uvs)
    b.smooth.append(smooth)


def quad(role, a, b, c, d, n, smooth=False):
    face(role, [a, b, c, d], n, smooth)


def box(role, x0, x1, y0, y1, z0, z1, skip=()):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    if z1 < z0:
        z0, z1 = z1, z0
    if "front" not in skip:
        quad(role, (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (0, 0, 1))
    if "back" not in skip:
        quad(role, (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (0, 0, -1))
    if "top" not in skip:
        quad(role, (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1), (0, 1, 0))
    if "bottom" not in skip:
        quad(role, (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (0, -1, 0))
    if "left" not in skip:
        quad(role, (x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1), (-1, 0, 0))
    if "right" not in skip:
        quad(role, (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (1, 0, 0))


def cbox(role, cx, cy, cz, w, h, d, skip=()):
    """A box by its centre and size."""
    box(role, cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, cz - d / 2, cz + d / 2, skip)


def _area(prof):
    return sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1] for i in range(len(prof))) / 2


def prism_x(role, prof, x0, x1, caps=True):
    """A closed profile [(z, y)] (a moulding's section: out, up) run along x from x0 to x1."""
    s = 1 if _area(prof) > 0 else -1
    k = len(prof)
    for i in range(k):
        (za, ya), (zb, yb) = prof[i], prof[(i + 1) % k]
        dz, dy = zb - za, yb - ya
        nz, ny = dy * s, -dz * s
        quad(role, (x0, ya, za), (x1, ya, za), (x1, yb, zb), (x0, yb, zb), (0, ny, nz))
    if caps:
        face(role, [(x0, y, z) for z, y in prof], (-1, 0, 0))
        face(role, [(x1, y, z) for z, y in prof], (1, 0, 0))


def prism_y(role, prof, y0, y1, caps=True):
    """A closed plan [(x, z)] stood from y0 to y1."""
    s = 1 if _area(prof) > 0 else -1
    k = len(prof)
    for i in range(k):
        (xa, za), (xb, zb) = prof[i], prof[(i + 1) % k]
        dx, dz = xb - xa, zb - za
        nx, nz = dz * s, -dx * s
        quad(role, (xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za), (nx, 0, nz))
    if caps:
        face(role, [(x, y1, z) for x, z in prof], (0, 1, 0))
        face(role, [(x, y0, z) for x, z in prof], (0, -1, 0))


def prism_z(role, prof, z0, z1, caps=True):
    """A closed outline [(x, y)] on the wall, pushed out from z0 to z1 (a pediment, a sign)."""
    s = 1 if _area(prof) > 0 else -1
    k = len(prof)
    for i in range(k):
        (xa, ya), (xb, yb) = prof[i], prof[(i + 1) % k]
        dx, dy = xb - xa, yb - ya
        nx, ny = dy * s, -dx * s
        quad(role, (xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1), (nx, ny, 0))
    if caps:
        face(role, [(x, y, z1) for x, y in prof], (0, 0, 1))
        face(role, [(x, y, z0) for x, y in prof], (0, 0, -1))


def lathe(role, prof, n=16, cx=0.0, cz=0.0, smooth=True, caps=True, phase=None):
    """A turned thing: a profile [(r, y)] from bottom to top, round y through (cx, cz). With n = 4 it's square to
    the axes (a pyramid's, a tapered post's: r is then the corner's)."""
    if phase is None:
        phase = math.pi / 4 if n == 4 else 0.0
    ring = [(math.cos(phase + 2 * math.pi * i / n), math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]
    for j in range(len(prof) - 1):
        (ra, ya), (rb, yb) = prof[j], prof[j + 1]
        for i in range(n):
            c0, s0 = ring[i]
            c1, s1 = ring[(i + 1) % n]
            cm, sm = (c0 + c1) / 2, (s0 + s1) / 2
            dr, dy = rb - ra, yb - ya
            quad(role, (cx + ra * c0, ya, cz + ra * s0), (cx + ra * c1, ya, cz + ra * s1), (cx + rb * c1, yb, cz + rb * s1), (cx + rb * c0, yb, cz + rb * s0), (cm * dy, -dr, sm * dy), smooth)
    if caps:
        r0, y0 = prof[0]
        r1, y1 = prof[-1]
        if r0 > 1e-4:
            face(role, [(cx + r0 * c, y0, cz + r0 * s) for c, s in ring], (0, -1, 0))
        if r1 > 1e-4:
            face(role, [(cx + r1 * c, y1, cz + r1 * s) for c, s in ring], (0, 1, 0))


def cyl(role, r, y0, y1, n=12, cx=0.0, cz=0.0, smooth=True):
    lathe(role, [(r, y0), (r, y1)], n, cx, cz, smooth)


def beam(role, a, b, w, h):
    """A straight member from a to b (its centreline, part frame), w wide, h deep."""
    d = [b[i] - a[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in d)) or 1
    t = [c / L for c in d]
    up = (0, 1, 0) if abs(t[1]) < 0.9 else (0, 0, 1)
    s = (t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0])
    sl = math.sqrt(sum(c * c for c in s))
    s = [c / sl for c in s]
    v = (s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0])
    cs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

    def P(p, i):
        x, y = cs[i]
        return tuple(p[k] + s[k] * x * w / 2 + v[k] * y * h / 2 for k in range(3))

    for i in range(4):
        j = (i + 1) % 4
        n = tuple(s[k] * (cs[i][0] + cs[j][0]) + v[k] * (cs[i][1] + cs[j][1]) for k in range(3))
        quad(role, P(a, i), P(b, i), P(b, j), P(a, j), n)
    face(role, [P(a, i) for i in range(4)], tuple(-c for c in t))
    face(role, [P(b, i) for i in range(4)], tuple(t))


def arc_band(role, cx, cy, r0, r1, z0, z1, a0=0.0, a1=math.pi, seg=12, caps=True):
    """A ring's sector on the wall (an arched casing, voussoirs, a fanlight's frame): radii r0–r1 round (cx, cy),
    angles a0–a1 (0 = +x, π/2 = up), out from z0 to z1."""
    pts = [(a0 + (a1 - a0) * i / seg) for i in range(seg + 1)]
    for i in range(seg):
        A, B = pts[i], pts[i + 1]
        ca, sa, cb, sb = math.cos(A), math.sin(A), math.cos(B), math.sin(B)
        quad(role, (cx + r0 * ca, cy + r0 * sa, z1), (cx + r1 * ca, cy + r1 * sa, z1), (cx + r1 * cb, cy + r1 * sb, z1), (cx + r0 * cb, cy + r0 * sb, z1), (0, 0, 1))
        quad(role, (cx + r1 * ca, cy + r1 * sa, z0), (cx + r1 * cb, cy + r1 * sb, z0), (cx + r1 * cb, cy + r1 * sb, z1), (cx + r1 * ca, cy + r1 * sa, z1), ((ca + cb) / 2, (sa + sb) / 2, 0))
        quad(role, (cx + r0 * ca, cy + r0 * sa, z0), (cx + r0 * cb, cy + r0 * sb, z0), (cx + r0 * cb, cy + r0 * sb, z1), (cx + r0 * ca, cy + r0 * sa, z1), (-(ca + cb) / 2, -(sa + sb) / 2, 0))
    if caps:
        for A, sg in ((a0, -1), (a1, 1)):
            c, s = math.cos(A), math.sin(A)
            quad(role, (cx + r0 * c, cy + r0 * s, z0), (cx + r1 * c, cy + r1 * s, z0), (cx + r1 * c, cy + r1 * s, z1), (cx + r0 * c, cy + r0 * s, z1), (-s * sg, c * sg, 0))


def disc(role, cx, cy, r, z, a0=0.0, a1=2 * math.pi, seg=16, n=(0, 0, 1)):
    """A flat fan on the wall (a fanlight's glass, a round window's pane)."""
    pts = [(cx, cy, z)] + [(cx + r * math.cos(a0 + (a1 - a0) * i / seg), cy + r * math.sin(a0 + (a1 - a0) * i / seg), z) for i in range(seg + 1)]
    for i in range(1, seg + 1):
        face(role, [pts[0], pts[i], pts[i + 1]], n)


def pane(role, x0, x1, y0, y1, z):
    quad(role, (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), (0, 0, 1))


# ── into Blender ─────────────────────────────────────────────────────────────────────────────────────────────


def objects():
    """Every part as an Empty holding its meshes (one a role), named `part` and `part|role`."""
    out = {}
    for (part, role), b in BUFS.items():
        if not b.f:
            continue
        me = bpy.data.meshes.new(f"{part}|{role}")
        me.from_pydata(b.v, [], b.f)
        me.update()
        uvl = me.uv_layers.new(name="UVMap")
        for p, uvs, sm in zip(me.polygons, b.uv, b.smooth):
            p.use_smooth = sm
            for li, uv in zip(p.loop_indices, uvs):
                uvl.data[li].uv = uv
        me.materials.append(material(role))
        o = bpy.data.objects.new(f"{part}|{role}", me)
        bpy.context.scene.collection.objects.link(o)
        if part not in out:
            e = bpy.data.objects.new(part, None)
            bpy.context.scene.collection.objects.link(e)
            out[part] = e
        o.parent = out[part]
    return out


def tris(empty):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in empty.children)


def bounds(empty):
    """The part's box in its own frame: (x0, x1, y0, y1, z0, z1)."""
    xs, ys, zs = [], [], []
    for o in empty.children:
        for v in o.data.vertices:
            xs.append(v.co.x)
            zs.append(-v.co.y)
            ys.append(v.co.z)
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def export(path, parts):
    """Every part under one root, one node a part (its meshes its children), as a GLB (phase 1 reads it)."""
    import bexport

    root = bpy.data.objects.new("kit", None)
    bpy.context.scene.collection.objects.link(root)
    for e in parts.values():
        e.parent = root
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # (no UVs: the game lays its own, in metres, on what takes a picture — kit-buildings.ts)
    bexport.export(path, root, uvs=False)
    return os.path.getsize(path)

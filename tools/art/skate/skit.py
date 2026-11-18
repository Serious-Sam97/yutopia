# Plan 103 — the skateboards' kit: the cars' kit (tools/art/cars/kit.py: materials, mesh helpers) and the bikes'
# (tools/art/bikes/bkit.py: sweeps, lofts, lathes about any axis) imported as they are, never edited — only extended
# in memory with the kinds a board adds and its own textures wired for Blender's stills. Here: the deck's surface
# (a Coons patch over its outline, lifted by the kicks and the concave, given its plies' thickness and its rounded
# edge), plates conformed to it (the skid plate, the slick, grip pads), hex nuts, and the GLB's texture links.
#
# Frames: Blender's z-up metres. A board's frame: +x forward (to the nose), +z up, +y its LEFT (the heel side of a
# regular rider); the origin on the ground under the middle between the axles (glTF's export_yup turns Blender
# (x, y, z) into (x, z, −y): x forward, y up, z the board's right).
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../cars"))
sys.path.insert(0, os.path.join(HERE, "../bikes"))
sys.path.insert(0, HERE)
import kit  # noqa: E402  (the cars' kit)
import bkit as bk  # noqa: E402  (the bikes' kit: sweeps, lofts, lathes about an axis)

ROOT = os.path.join(HERE, "../../..")
SRC = os.path.join(HERE, "tex-src")
TEX_OUT = os.path.join(ROOT, "apps/client/public/life/skate/tex")

# the kinds a board adds (base colour, metallic, roughness, extra) — the cars' own (paint, paint2, alloy, steel,
# rubber, collider) kept as they are
kit.MAT.update(
    {
        "deck_wood": ((1.0, 1.0, 1.0), 0.0, 0.42, {"coat": 0.5}),  # × tex/maple_a (the grain, the plies' edge)
        "grip": ((1.0, 1.0, 1.0), 0.0, 0.93, {}),  # × tex/grip_a, its grit in tex/grip_n
        "graphic": ((1.0, 1.0, 1.0), 0.0, 0.42, {"coat": 0.3}),  # × tex/graphic-<variant> (the bottom's print)
        "plastic": ((0.045, 0.045, 0.05), 0.0, 0.36, {}),  # rails, skid plate, nose guard, lapper, slick's edge
        "urethane": ((0.9, 0.88, 0.8), 0.0, 0.4, {"sss": 0.35}),  # the wheels (tinted by the game)
        "bearing": ((0.3, 0.31, 0.33), 0.85, 0.3, {}),  # the bearings' shields
    }
)
KINDS = ["deck_wood", "grip", "graphic", "paint", "paint2", "plastic", "alloy", "steel", "rubber", "urethane", "bearing", "collider"]

# our textures: (the stills wire them from tex-src/*.png; the GLBs link tex/*.ktx2 by URI)
OWN = {
    "grip": dict(base="grip_a", normal="grip_n", tile=0.04, ns=1.0),
    "deck_wood": dict(base="maple_a", tile=None),
    "graphic": dict(base=None, tile=None),  # (per variant: tex/graphic-<variant>)
    "paint": dict(normal="../cars/tex/paint_n", orm="../cars/tex/paint_orm", tile=0.35, ns=0.08),
    "paint2": dict(normal="../cars/tex/paint_n", orm="../cars/tex/paint_orm", tile=0.35, ns=0.08),
    "plastic": dict(normal="../cars/tex/grain_n", tile=0.12, ns=0.3),
}
METRIC_UV = ("paint", "paint2", "plastic")  # (box UVs in metres before the merge)

LOD = "near"  # near | mid | far
N = {  # segment counts a level
    "near": dict(ns=0.026, bend=0.0065, nt=19, wheel=20, bear=16, hang=12, cyl=14, bolt=10, sweep=10),
    "mid": dict(ns=0.06, bend=0.03, nt=5, wheel=8, bear=0, hang=8, cyl=6, bolt=0, sweep=4),
    "far": dict(ns=0.2, bend=1.0, nt=3, wheel=6, bear=0, hang=4, cyl=4, bolt=0, sweep=4),
}


def n(key):
    return N[LOD][key]


def near():
    return LOD == "near"


V = bk.V
mk = kit.mk
move = kit.move
rot = kit.rot
join = kit.join
kill = kit.kill
tris = kit.tris
sweep = bk.sweep
lathe_ax = bk.lathe_ax
fix_normals = bk._fix_normals


# ── materials: our textures in Blender's nodes (stills only) ─────────────────────────────────────────────────

_kit_mat = kit.mat
GRAPHIC = {"image": None}  # the graphic's picture for this build (a tex-src PNG)


def _image(name):
    p = os.path.join(SRC, name + ".png")
    if not os.path.exists(p):
        return None
    im = bpy.data.images.get(name) or bpy.data.images.load(p)
    im.name = name
    if name.endswith("_n"):
        im.colorspace_settings.name = "Non-Color"
    return im


def wire(m, t, image=None):
    """Our texture on a material's nodes: the base × the colour, the normal; UVs scaled by the tile."""
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    src = uv.outputs["UV"]
    if t.get("tile"):
        mp = nt.nodes.new("ShaderNodeMapping")
        s_ = 1.0 / t["tile"]
        mp.inputs["Scale"].default_value = (s_, s_, s_)
        nt.links.new(src, mp.inputs["Vector"])
        src = mp.outputs["Vector"]
    im = image or (_image(t["base"]) if t.get("base") else None)
    if im is not None:
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = im
        tx.name = "base"
        nt.links.new(src, tx.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = tuple(b.inputs["Base Color"].default_value)
        nt.links.new(tx.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    if t.get("normal") and not t["normal"].startswith("..") and _image(t["normal"]):
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = _image(t["normal"])
        nt.links.new(src, tx.inputs["Vector"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = t.get("ns", 1.0)
        nt.links.new(tx.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])


def mat(kind):
    fresh = kind not in kit.MATS
    m = _kit_mat(kind)
    if fresh:
        x = kit.MAT[kind][3]
        b = m.node_tree.nodes["Principled BSDF"]
        if x.get("sss"):
            try:
                b.inputs["Subsurface Weight"].default_value = x["sss"]
                b.inputs["Subsurface Radius"].default_value = (0.004, 0.003, 0.002)
                b.inputs["Subsurface Scale"].default_value = 1.0
            except KeyError:
                pass
        t = OWN.get(kind)
        if t and kind not in ("paint", "paint2", "plastic") and kit.TEXTURED:
            if kind == "graphic":
                im = bpy.data.images.load(GRAPHIC["image"]) if GRAPHIC["image"] and os.path.exists(GRAPHIC["image"]) else None
                wire(m, t, im)
            else:
                wire(m, t)
    return m


kit.mat = mat  # (kit.obj looks its `mat` up at call time: our kinds get our textures)


def set_graphic(path, rough=None, coat=None):
    """The graphic's picture (and its finish) for what's built next."""
    GRAPHIC["image"] = path
    m = kit.MATS.get("graphic")
    if m is not None:
        kit.MATS.pop("graphic")
    if rough is not None or coat is not None:
        c, me, r, x = kit.MAT["graphic"]
        x = dict(x)
        if coat is not None:
            x["coat"] = coat
        kit.MAT["graphic"] = (c, me, rough if rough is not None else r, x)


def uv_metric():
    for o in kit.coll().objects:
        if o.type == "MESH" and len(o.data.polygons) and o.get("kind") in METRIC_UV:
            kit.uv_box(o)


def set_uv(o, fn):
    """UVs from a function of each loop's vertex index (and its position)."""
    me = o.data
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            uv.data[li].uv = fn(vi, me.vertices[vi].co)


# ── curves in the plan ───────────────────────────────────────────────────────────────────────────────────────


def pchip(xs, ys):
    """A smooth monotone cubic through (x, y) control points (Fritsch–Carlson); flat beyond the ends."""
    m = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(m - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(m - 1)]
    t = [0.0] * m
    for i in range(1, m - 1):
        if d[i - 1] * d[i] <= 0:
            t[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            t[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    t[0], t[-1] = 0.0, 0.0

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = max(k for k in range(m - 1) if xs[k] <= x)
        s = (x - xs[i]) / h[i]
        h00, h10, h01, h11 = 2 * s**3 - 3 * s**2 + 1, s**3 - 2 * s**2 + s, -2 * s**3 + 3 * s**2, s**3 - s**2
        return h00 * ys[i] + h10 * h[i] * t[i] + h01 * ys[i + 1] + h11 * h[i] * t[i + 1]

    return f


def arc_resample(pts, k):
    """A 2D polyline resampled to k points evenly by length."""
    pts = [Vector((p[0], p[1], 0)) for p in pts]
    L = bk.length(pts)
    return [(p.x, p.y) for p in bk.along(pts, [L * i / (k - 1) for i in range(k)])]


def interp_y(poly, x):
    """y on a polyline monotone in x, at x."""
    for i in range(len(poly) - 1):
        (x0, y0), (x1, y1) = poly[i], poly[i + 1]
        if (x0 - x) * (x1 - x) <= 0 and abs(x1 - x0) > 1e-12:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return poly[0][1] if abs(poly[0][0] - x) < abs(poly[-1][0] - x) else poly[-1][1]


def coons(tail, nose, side_l, xs, fade=0.12):
    """A structured grid over an outline: `tail` and `nose` the end curves (each from the right corner, y < 0, to
    the left, resampled to the same count), `side_l` the left side (y > 0, monotone in x) from the tail's corner to
    the nose's, its mirror the right; xs the rows' x along the sides. Rows are bent to the end curves near each end
    and straight across between (a Coons patch with blends that fade over `fade` metres). → rows of (x, y)."""
    nt = len(tail)
    xa, xb = xs[0], xs[-1]
    out = []
    for x in xs:
        yl = interp_y(side_l, x)
        c0, c1 = Vector((x, -yl)), Vector((x, yl))
        a0 = max(0.0, 1 - (x - xa) / fade) ** 2
        a1 = max(0.0, 1 - (xb - x) / fade) ** 2
        row = []
        for j in range(nt):
            t = j / (nt - 1)
            p = c0.lerp(c1, t)
            if a0 > 0:
                d0 = Vector(tail[j])
                p += a0 * (d0 - Vector(tail[0]).lerp(Vector(tail[-1]), t))
            if a1 > 0:
                d1 = Vector(nose[j])
                p += a1 * (d1 - Vector(nose[0]).lerp(Vector(nose[-1]), t))
            row.append((p.x, p.y))
        out.append(row)
    return out


def ring_of(grid):
    """The grid's boundary, once round (counter-clockwise seen from above): the tail's row, up the left side, the
    nose's row back, down the right side → [(i, j)]."""
    ns, nt = len(grid), len(grid[0])
    r = [(0, j) for j in range(nt)]
    r += [(i, nt - 1) for i in range(1, ns)]
    r += [(ns - 1, j) for j in range(nt - 2, -1, -1)]
    r += [(i, 0) for i in range(ns - 2, 0, -1)]
    return r


# ── the deck's surface ───────────────────────────────────────────────────────────────────────────────────────


class Surface:
    """The deck's top as a height field z(x, y) (kicks along x, the concave across) and its normal."""

    def __init__(self, H, kicks, concave, hw0):
        self.H = H
        self.kicks = kicks  # [(x_start, sign, angle, radius)] sign +1: rises toward +x (the nose)
        self.C = concave
        self.hw0 = hw0

    def lift(self, x):
        z = 0.0
        for x0, s, ang, R in self.kicks:
            d = (x - x0) * s
            if d <= 0 or ang <= 0:
                continue
            da = R * math.sin(ang)
            if d < da:
                z += R - math.sqrt(max(0.0, R * R - d * d))
            else:
                z += R * (1 - math.cos(ang)) + (d - da) * math.tan(ang)
        return z

    def z(self, x, y):
        k = 1.0
        for x0, s, ang, R in self.kicks:
            d = (x - x0) * s
            if d > 0 and ang > 0:
                k = min(k, max(0.45, 1 - d / 0.25))
        return self.H + self.lift(x) + self.C * k * (y / self.hw0) ** 2

    def normal(self, x, y):
        e = 0.0005
        dx = (self.z(x + e, y) - self.z(x - e, y)) / (2 * e)
        dy = (self.z(x, y + e) - self.z(x, y - e)) / (2 * e)
        return Vector((-dx, -dy, 1)).normalized()

    def at(self, x, y):
        return Vector((x, y, self.z(x, y)))


def grid_faces(ns, nt, off=0, flip=False):
    f = []
    for i in range(ns - 1):
        for j in range(nt - 1):
            a, b, c, d = off + i * nt + j, off + (i + 1) * nt + j, off + (i + 1) * nt + j + 1, off + i * nt + j + 1
            f.append((a, d, c, b) if flip else (a, b, c, d))
    return f


def orient_up(o, up=True):
    """A sheet's faces turned to face up (+z) — or down."""
    me = o.data
    for p in me.polygons:
        if (p.normal.z < 0) == up:
            p.flip()
    me.update()


# ── small parts ──────────────────────────────────────────────────────────────────────────────────────────────


def hexagon(af, k=6):
    """A hexagon's outline (across flats af) — `k` points round (12: each side halved)."""
    R = af / 2 / math.cos(math.pi / 6)
    out = []
    for i in range(6):
        a0 = math.radians(30 + 60 * i)
        a1 = math.radians(30 + 60 * (i + 1))
        p0 = (R * math.cos(a0), R * math.sin(a0))
        p1 = (R * math.cos(a1), R * math.sin(a1))
        out.append(p0)
        if k == 12:
            out.append(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2))
    return out


def hex_nut(name, c, axis, af, h, kind, grp, hole=0.0, chamfer=True):
    """A hex nut centred at c along an axis (its faces flat, its corners chamfered by a ring)."""
    ax = Vector(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(ax).to_matrix().to_4x4()
    pts = hexagon(af)
    k = len(pts)
    verts, faces = [], []
    ch = 0.12 * h if chamfer else 0.0
    rings = [(-h / 2, 0.92), (-h / 2 + ch, 1.0), (h / 2 - ch, 1.0), (h / 2, 0.92)] if chamfer else [(-h / 2, 1.0), (h / 2, 1.0)]
    for z, s in rings:
        verts += [(x * s, y * s, z) for x, y in pts]
    for r in range(len(rings) - 1):
        for i in range(k):
            j = (i + 1) % k
            faces.append((r * k + i, r * k + j, (r + 1) * k + j, (r + 1) * k + i))
    if hole > 0:
        # (the faces round a hole: the bolt's end shows through)
        base = len(verts)
        for z in (-h / 2, h / 2):
            verts += [(hole * math.cos(2 * math.pi * i / k + math.pi / 6), hole * math.sin(2 * math.pi * i / k + math.pi / 6), z) for i in range(k)]
        top = (len(rings) - 1) * k
        for i in range(k):
            j = (i + 1) % k
            faces.append((base + j, base + i, i, j))
            faces.append((top + i, top + j, base + k + j, base + k + i))
    else:
        faces.append(tuple(range(k))[::-1])
        top = (len(rings) - 1) * k
        faces.append(tuple(range(top, top + k)))
    o = mk(name, verts, faces, kind, grp, smooth=False)
    o.data.transform(Matrix.Translation(Vector(c)) @ q)
    fix_normals(o)
    return o


def disc(name, c, axis, r0, r1, h, kind, grp, nseg=16, dome=0.0):
    """A ring (or a disc if r0 = 0) along an axis: a washer, a shield, a cap."""
    prof = [(r0, -h / 2), (r1, -h / 2), (r1, h / 2), (r1 * 0.6 + r0 * 0.4, h / 2 + dome), (r0, h / 2)] if dome else [(r0, -h / 2), (r1, -h / 2), (r1, h / 2), (r0, h / 2)]
    if r0 > 0:
        prof = prof + [prof[0]]
    o = lathe_ax(name, prof, c, axis, nseg, kind, grp, cap=r0 <= 0, angle=35)
    fix_normals(o)
    return o


def bolt_head(name, c, normal, r, kind, grp):
    """A countersunk deck bolt's head, flush with the grip, its hex socket sunk in it (12 round)."""
    k = 12
    ax = Vector(normal).normalized()
    q = Vector((0, 0, 1)).rotation_difference(ax).to_matrix().to_4x4()
    hx = hexagon(r * 0.62, 12)
    verts = []
    # the rim (just proud of the grip), the dome, the socket's top and its floor
    for rr, z in ((r, 0.0001), (r * 0.82, 0.0006)):
        verts += [(rr * math.cos(2 * math.pi * i / k + math.pi / 6), rr * math.sin(2 * math.pi * i / k + math.pi / 6), z) for i in range(k)]
    verts += [(x, y, 0.0006) for x, y in hx]
    verts += [(x, y, -0.0022) for x, y in hx]
    faces = []
    for rgi in range(3):
        for i in range(k):
            j = (i + 1) % k
            a, b = rgi * k, (rgi + 1) * k
            faces.append((a + i, a + j, b + j, b + i))  # (counter-clockwise rings: the faces out and up)
    faces.append(tuple(range(3 * k, 4 * k)))
    o = mk(name, verts, faces, kind, grp, smooth=True, angle=50)
    o.data.transform(Matrix.Translation(Vector(c)) @ q)
    return o


# ── the GLB's texture links ──────────────────────────────────────────────────────────────────────────────────


def link(path, graphic=None):
    """A board's GLB pointed at its textures by URI (as the bikes' btex.link): ours in tex/, the cars' in
    ../cars/tex/; `graphic` the variant's print (tex/graphic-<variant>)."""
    import link_tex

    js, binc = link_tex._read(path)
    binc = link_tex._drop_images(js, binc)
    images, textures = [], []
    js["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]

    def tex(uri, tile):
        if uri not in [im["uri"] for im in images]:
            images.append({"uri": uri, "mimeType": "image/ktx2"})
        src = [im["uri"] for im in images].index(uri)
        textures.append({"sampler": 0, "extensions": {"KHR_texture_basisu": {"source": src}}})
        ref = {"index": len(textures) - 1}
        if tile:
            s = 1.0 / tile
            ref["extensions"] = {"KHR_texture_transform": {"scale": [s, s]}}
        return ref

    used_transform = False
    for m in js.get("materials", []):
        name = m.get("name", "").split(".")[0]
        pbr = m.setdefault("pbrMetallicRoughness", {})
        t = OWN.get(name)
        if not t:
            continue
        tile = t.get("tile")
        used_transform |= bool(tile)
        base = t.get("base")
        if name == "graphic":
            base = graphic
        if base:
            uri = base if base.startswith("..") else f"tex/{base}"
            pbr["baseColorTexture"] = tex(f"{uri}.ktx2", tile)
        if t.get("normal"):
            uri = t["normal"] if t["normal"].startswith("..") else f"tex/{t['normal']}"
            m["normalTexture"] = dict(tex(f"{uri}.ktx2", tile), scale=t.get("ns", 1.0))
        if t.get("orm"):
            pbr["metallicRoughnessTexture"] = tex(f"{t['orm']}.ktx2", tile)
    if images:
        js["images"] = images
        js["textures"] = textures
        used = js.setdefault("extensionsUsed", [])
        req = js.setdefault("extensionsRequired", [])
        for e in ("KHR_texture_basisu",) + (("KHR_texture_transform",) if used_transform else ()):
            if e not in used:
                used.append(e)
        if "KHR_texture_basisu" not in req:
            req.append("KHR_texture_basisu")
    else:
        js.pop("samplers", None)
    link_tex._write(path, js, binc)
    return [im["uri"] for im in images]

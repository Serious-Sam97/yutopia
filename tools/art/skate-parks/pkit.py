# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the parks' kit: the board's own profiles (pieces.json, dumped
# from shared skate/pieces.ts by dump.mts) read back and placed exactly as SkatePark places them (a port of its
# frames, its topAt), mesh buffers by material with UVs in tiles (the tile baked in: no texture transform), the
# materials (named as the textures they carry), the GLB export (the bikes' bexport, plan 92's quantised exporter)
# and the textures linked by URI (the cars' link_tex helpers).
#
# Frames: the floor's (x east, y south = the Grounds' z, z up) for everything here; a build's TO maps it into
# Blender's (x, −y, z) about its origin, so glTF's y-up export gives three's (x east, y up, z south).
import json
import math
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "../../..")
sys.path.insert(0, os.path.join(HERE, "../cars"))
sys.path.insert(0, os.path.join(HERE, "../bikes"))
import bexport  # noqa: E402  (the bikes' exporter: quantised, meshopt)
import link_tex  # noqa: E402  (the cars' GLB read/write, images dropped)

DATA = json.load(open(os.path.join(HERE, "pieces.json")))
SRC = os.path.join(HERE, "tex-src")
OUT = os.path.join(ROOT, "apps/client/public/life/skate-parks")
FLOOR_LIFT = 0.004  # what lies on the floor itself (a pipe's flat) drawn this much over it

LOD = "near"
STEPS = {"near": dict(arc=math.radians(2.0), turn=math.radians(2.0), w=0.61, tube=12), "mid": dict(arc=math.radians(7.5), turn=math.radians(7.5), w=3.05, tube=6)}


def st(k):
    return STEPS[LOD][k]


def near():
    return LOD == "near"


# ── materials: name → factors, its textures (tex-src/<name>.png → tex/<name>.ktx2), its tile (m) ────────────────
# a: albedo, n: normal, orm: occlusion-roughness-metal; tile: (u, v) m of one repeat (baked into the UVs)
MATS = {
    "masonite": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="masonite_a", n="masonite_n", orm="masonite_orm", tile=(2.44, 2.44), ns=0.6),
    "mastop": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="mastop_a", n="mastop_n", orm="mastop_orm", tile=(2.44, 1.22), ns=0.6),
    "deck": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="deck_a", n="deck_n", orm="deck_orm", tile=(2.44, 2.44), ns=0.8),
    "ply": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="ply_a", n="ply_n", orm="ply_orm", tile=(2.44, 1.22), ns=0.5),
    "lumber": dict(col=(1, 1, 1), rough=0.8, metal=0.0, a="lumber_a", tile=(0.5, 0.5)),
    "void": dict(col=(0.012, 0.011, 0.01), rough=1.0, metal=0.0),
    "galv": dict(col=(1, 1, 1), rough=1.0, metal=1.0, a="galv_a", orm="galv_orm", tile=(0.3, 0.3)),
    "tube": dict(col=(1, 1, 1), rough=1.0, metal=1.0, a="tube_a", orm="tube_orm", tile=(0.5, 1.0)),
    "paintpipe": dict(col=(1, 1, 1), rough=1.0, metal=1.0, a="paintpipe_a", orm="paintpipe_orm", tile=(0.5, 1.0)),
    "plate": dict(col=(1, 1, 1), rough=1.0, metal=1.0, a="plate_a", n="plate_n", orm="plate_orm", tile=(1.22, 1.22), ns=0.5),
    "conc": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="conc_a", n="conc_n", orm="conc_orm", tile=(3.05, 3.05), ns=0.7),
    "conctop": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="conctop_a", n="conctop_n", orm="conctop_orm", tile=(3.05, 1.525), ns=0.7),
    "concside": dict(col=(1, 1, 1), rough=0.9, metal=0.0, a="concside_a", n="concside_n", tile=(2.44, 1.22), ns=0.8),
    "floor": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="floor_a", n="floor_n", orm="floor_orm", tile=(6.1, 6.1), ns=0.5),
    "brick": dict(col=(1, 1, 1), rough=1.0, metal=0.0, a="brick_a", n="brick_n", orm="brick_orm", tile=(2.7, 2.7), ns=1.0),
    "block": dict(col=(1, 1, 1), rough=0.9, metal=0.0, a="block_a", n="block_n", tile=(1.6, 1.6), ns=0.8),
    "cladding": dict(col=(1, 1, 1), rough=1.0, metal=1.0, a="cladding_a", n="cladding_n", orm="cladding_orm", tile=(1.0, 1.0), ns=1.0),
    "steelpaint": dict(col=(1, 1, 1), rough=1.0, metal=1.0, a="steelpaint_a", orm="steelpaint_orm", tile=(1.0, 1.0)),
    "wood": dict(col=(1, 1, 1), rough=0.35, metal=0.0, a="wood_a", tile=(1.0, 1.0)),
    "tags": dict(col=(1, 1, 1), rough=0.6, metal=0.0, a="tags_a", tile=(1.0, 1.0), clip=0.5),
    "signs": dict(col=(1, 1, 1), rough=0.5, metal=0.0, a="signs_a", tile=(1.0, 1.0)),
    "signlit": dict(col=(1, 1, 1), rough=0.5, metal=0.0, a="signs_a", tile=(1.0, 1.0), emit=(1.0, 1.0, 1.0), es=1.5, emap=True),
    "mural_west": dict(col=(1, 1, 1), rough=0.8, metal=0.0, a="mural_west_a", tile=(1.0, 1.0)),
    "mural_north": dict(col=(1, 1, 1), rough=0.8, metal=0.0, a="mural_north_a", tile=(1.0, 1.0)),
    "mural_east": dict(col=(1, 1, 1), rough=0.8, metal=0.0, a="mural_east_a", tile=(1.0, 1.0)),
    "mural_south": dict(col=(1, 1, 1), rough=0.8, metal=0.0, a="mural_south_a", tile=(1.0, 1.0)),
    "tube_lit": dict(col=(0.95, 0.97, 1.0), rough=0.3, metal=0.0, emit=(0.92, 0.96, 1.0), es=4.0),
    "fixture": dict(col=(0.82, 0.82, 0.8), rough=0.45, metal=0.3),
    "diffuser": dict(col=(0.9, 0.92, 0.95), rough=0.3, metal=0.0, emit=(0.9, 0.95, 1.0), es=1.2, alpha=0.85),
    "skylight": dict(col=(0.85, 0.9, 0.92), rough=0.4, metal=0.0, emit=(0.75, 0.85, 0.95), es=1.6),
    "winglow": dict(col=(0.05, 0.055, 0.06), rough=0.08, metal=0.0, emit=(1.0, 0.82, 0.55), es=0.6),
    "glass": dict(col=(0.25, 0.3, 0.32), rough=0.05, metal=0.0, alpha=0.35),
    "paint_yellow": dict(col=(0.85, 0.62, 0.06), rough=0.5, metal=0.0),
    "paint_black": dict(col=(0.02, 0.02, 0.02), rough=0.55, metal=0.0),
    "paint_white": dict(col=(0.78, 0.78, 0.75), rough=0.7, metal=0.0),
    "paint_door": dict(col=(0.09, 0.2, 0.32), rough=0.5, metal=0.4),
    "rubber": dict(col=(0.03, 0.03, 0.03), rough=0.9, metal=0.0),
    "chrome": dict(col=(0.8, 0.8, 0.8), rough=0.15, metal=1.0),
}
TEXTURED = True  # (the stills: PNGs in Blender's nodes; the GLBs: none — link() names the KTX2s)
_BL = {}


def _image(name):
    p = os.path.join(SRC, name + ".png")
    if not os.path.exists(p):
        return None
    im = bpy.data.images.get(name) or bpy.data.images.load(p)
    im.name = name
    if not name.endswith("_a"):
        im.colorspace_settings.name = "Non-Color"
    return im


def material(name):
    if name in _BL:
        return _BL[name]
    d = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*d["col"], 1)
    b.inputs["Roughness"].default_value = d["rough"] if not d.get("orm") else 1.0
    b.inputs["Metallic"].default_value = d["metal"] if not d.get("orm") else 1.0
    if d.get("emit"):
        b.inputs["Emission Color"].default_value = (*d["emit"], 1)
        b.inputs["Emission Strength"].default_value = d["es"]
    if d.get("alpha"):
        b.inputs["Alpha"].default_value = d["alpha"]
        try:
            m.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            pass
    if TEXTURED:
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = "UVMap"
        if d.get("a") and _image(d["a"]):
            tx = nt.nodes.new("ShaderNodeTexImage")
            tx.image = _image(d["a"])
            nt.links.new(uv.outputs["UV"], tx.inputs["Vector"])
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            mix.inputs[6].default_value = (*d["col"], 1)
            nt.links.new(tx.outputs["Color"], mix.inputs[7])
            nt.links.new(mix.outputs[2], b.inputs["Base Color"])
            if d.get("emap"):
                nt.links.new(mix.outputs[2], b.inputs["Emission Color"])
            if d.get("clip"):
                nt.links.new(tx.outputs["Alpha"], b.inputs["Alpha"])
                try:
                    m.surface_render_method = "DITHERED"
                except (AttributeError, TypeError):
                    pass
        if d.get("n") and _image(d["n"]):
            tx = nt.nodes.new("ShaderNodeTexImage")
            tx.image = _image(d["n"])
            nt.links.new(uv.outputs["UV"], tx.inputs["Vector"])
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = d.get("ns", 1.0)
            nt.links.new(tx.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        if d.get("orm") and _image(d["orm"]):
            tx = nt.nodes.new("ShaderNodeTexImage")
            tx.image = _image(d["orm"])
            nt.links.new(uv.outputs["UV"], tx.inputs["Vector"])
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(tx.outputs["Color"], sep.inputs["Color"])
            nt.links.new(sep.outputs[1], b.inputs["Roughness"])
            nt.links.new(sep.outputs[2], b.inputs["Metallic"])
    _BL[name] = m
    return m


# ── mesh buffers: by (group, material); UVs per corner, in the material's tiles ─────────────────────────────


class Buf:
    def __init__(self):
        self.v = []
        self.f = []
        self.uv = []
        self.smooth = []
        self.index = {}

    def vert(self, p, key=None):
        if key is not None and key in self.index:
            return self.index[key]
        self.v.append(tuple(p))
        i = len(self.v) - 1
        if key is not None:
            self.index[key] = i
        return i


BUFS = defaultdict(Buf)
TO = [lambda p: p]  # the floor's frame → Blender's (set by a build)


def reset_bufs():
    BUFS.clear()


def to_bl(p):
    return TO[0](p)


def frame(origin):
    """Builds about `origin` (floor x, y, z): Blender (x − ox, −(y − oy), z − oz)."""
    ox, oy, oz = origin
    TO[0] = lambda p: (p[0] - ox, -(p[1] - oy), p[2] - oz)


def face(mat, pts, uvs, smooth=False, grp="main", keys=None, n=None):
    """A polygon (floor-frame points, uvs in metres — the material's tile divides them), wound to face `n` (the
    floor's frame) when given."""
    b = BUFS[(grp, mat)]
    tu, tv = MATS[mat]["tile"] if "tile" in MATS[mat] else (1.0, 1.0)
    bl = [to_bl(p) for p in pts]
    if n is not None:
        # (Newell's normal of the polygon as Blender has it, against the hint turned into Blender's frame)
        nx = ny = nz = 0.0
        for i in range(len(bl)):
            a, c = bl[i], bl[(i + 1) % len(bl)]
            nx += (a[1] - c[1]) * (a[2] + c[2])
            ny += (a[2] - c[2]) * (a[0] + c[0])
            nz += (a[0] - c[0]) * (a[1] + c[1])
        if nx * n[0] - ny * n[1] + nz * n[2] < 0:
            bl, uvs = bl[::-1], uvs[::-1]
            pts = pts[::-1]
            if keys:
                keys = keys[::-1]
    idx = [b.vert(q, (keys[i] if keys else None)) for i, q in enumerate(bl)]
    if len(set(idx)) < 3:
        return
    b.f.append(idx)
    b.uv.append([(u / tu, v / tv) for u, v in uvs])
    b.smooth.append(smooth)


def quad(mat, a, b_, c, d, uv, smooth=False, grp="main"):
    face(mat, [a, b_, c, d], uv, smooth, grp)


def objects(prefix=""):
    """The buffers as Blender objects (one a group and material), returned by group."""
    out = defaultdict(list)
    for (grp, mat), b in BUFS.items():
        if not b.f:
            continue
        me = bpy.data.meshes.new(f"{prefix}{grp}-{mat}")
        me.from_pydata(b.v, [], b.f)
        me.update()
        uvl = me.uv_layers.new(name="UVMap")
        k = 0
        for p, uvs, sm in zip(me.polygons, b.uv, b.smooth):
            p.use_smooth = sm
            for li, uv in zip(p.loop_indices, uvs):
                uvl.data[li].uv = uv
            k += 1
        try:
            me.set_sharp_from_angle(angle=math.radians(35))
        except AttributeError:
            pass
        me.materials.append(material(mat))
        o = bpy.data.objects.new(f"{prefix}{grp}-{mat}", me)
        bpy.context.scene.collection.objects.link(o)
        out[grp].append(o)
    return out


def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


# ── the profiles (a port of pieces.ts Profile) ──────────────────────────────────────────────────────────────


def seg_at(s, k):
    if s["k"] == "line":
        (au, az), (bu, bz) = s["a"], s["b"]
        du, dz = bu - au, bz - az
        n = math.hypot(du, dz) or 1
        return au + du * k, az + dz * k, du / n, dz / n
    a = s["a0"] + (s["a1"] - s["a0"]) * k
    sg = 1 if s["a1"] >= s["a0"] else -1
    return s["c"][0] + s["r"] * math.cos(a), s["c"][1] + s["r"] * math.sin(a), -math.sin(a) * sg, math.cos(a) * sg


def seg_at_u(s, u):
    if s["k"] == "line":
        du = s["b"][0] - s["a"][0]
        if abs(du) < 1e-6:
            return None
        k = (u - s["a"][0]) / du
        if k < -1e-9 or k > 1 + 1e-9:
            return None
        return s["a"][1] + (s["b"][1] - s["a"][1]) * k, max(0, min(1, k))
    c = (u - s["c"][0]) / s["r"]
    if c < -1 or c > 1:
        return None
    base = math.acos(c)
    lo, hi = min(s["a0"], s["a1"]), max(s["a0"], s["a1"])
    out = None
    for a0 in (base, -base, base - 2 * math.pi, -base + 2 * math.pi, base + 2 * math.pi, -base - 2 * math.pi):
        if a0 < lo - 1e-9 or a0 > hi + 1e-9:
            continue
        if abs(math.sin(a0)) > 0.9995:
            continue
        z = s["c"][1] + s["r"] * math.sin(a0)
        if out is None or z > out[0]:
            out = (z, (a0 - s["a0"]) / (s["a1"] - s["a0"]))
    return out


class Prof:
    def __init__(self, s):
        self.segs = s["segs"]
        self.lens = s["lens"]
        self.total = s["total"]
        self.copings = s["copings"]
        self.uMin, self.uMax = s["uMin"], s["uMax"]

    def at(self, l):
        rest = max(0.0, min(self.total, l))
        for i, s in enumerate(self.segs):
            ln = self.lens[i]
            if rest <= ln or i == len(self.segs) - 1:
                return seg_at(s, rest / ln if ln > 0 else 0)
            rest -= ln
        return 0, 0, 1, 0

    def top_at(self, u):
        best = None
        l0 = 0.0
        for s, ln in zip(self.segs, self.lens):
            h = seg_at_u(s, u)
            if h and (best is None or h[0] > best[0]):
                best = (h[0], l0 + h[1] * ln)
            l0 += ln
        return best

    def samples(self, extra=()):
        """ℓ values along it: each segment's ends, its arcs in steps, the extra breaks."""
        ls = set()
        l0 = 0.0
        for s, ln in zip(self.segs, self.lens):
            ls.add(round(l0, 9))
            if s["k"] == "arc" and ln > 0:
                n = max(1, math.ceil(abs(s["a1"] - s["a0"]) / st("arc") - 1e-9))
                for i in range(1, n):
                    ls.add(round(l0 + ln * i / n, 9))
            l0 += ln
        ls.add(round(self.total, 9))
        for e in extra:
            if 0 < e < self.total:
                ls.add(round(e, 9))
        return sorted(ls)


# ── a park placed (a port of pieces.ts SkatePark: its surfaces' frames, topAt) ─────────────────────────────


class Placed:
    def __init__(self, idx, piece, surf, s, pc, kind):
        self.idx, self.piece, self.surf, self.kind = idx, piece, surf, kind
        self.prof = Prof(s)
        self.s = s
        d = DATA["pieces"][kind]
        line = s["sweep"] == "line"
        W = (pc.get("width") or d["size"][1]) / d["size"][1]
        self.w0 = s["w0"] * W if line else s["w0"]
        self.w1 = s["w1"] * W if line else s["w1"]
        c, sn = math.cos(pc["yaw"]), math.sin(pc["yaw"])
        du, dw = s["du"], s["dw"]
        self.ox = pc["x"] + du * c - dw * sn
        self.oy = pc["y"] + du * sn + dw * c
        self.oz = pc["zw"]
        self.a0 = pc["yaw"] + s["turn"]
        self.ux, self.uy = math.cos(self.a0), math.sin(self.a0)
        self.line = line
        self.rIn = s["rIn"]
        self.inward = s["inward"]
        self.pc = pc

    def radius(self, u):
        return self.rIn - u if self.inward else u + self.rIn

    def world(self, u, w):
        """(x, y) of (u, w), and the plan ways of +u and +w there."""
        if self.line:
            return (self.ox + u * self.ux - w * self.uy, self.oy + u * self.uy + w * self.ux), (self.ux, self.uy), (-self.uy, self.ux)
        a = self.a0 + w
        r = self.radius(u)
        cx, cy = math.cos(a), math.sin(a)
        k = -1 if self.inward else 1
        return (self.ox + r * cx, self.oy + r * cy), (k * cx, k * cy), (-cy, cx)

    def local(self, x, y):
        dx, dy = x - self.ox, y - self.oy
        if self.line:
            return dx * self.ux + dy * self.uy, -dx * self.uy + dy * self.ux
        r = math.hypot(dx, dy) or 1e-9
        a = math.atan2(dy, dx) - self.a0
        a = math.atan2(math.sin(a), math.cos(a))
        return (self.rIn - r if self.inward else r - self.rIn), a

    def inside(self, u, w, pad=1e-6):
        if u < self.prof.uMin - pad or u > self.prof.uMax + pad or w < self.w0 - pad or w > self.w1 + pad:
            return False
        return self.line or self.radius(u) >= 0

    def wscale(self, u):
        return 1.0 if self.line else max(0.0, self.radius(u))


class Park:
    def __init__(self, pieces, h, what):
        self.pieces = pieces
        self.h = h
        self.what = what  # "wood" | "concrete"
        self.placed = []
        self.lines = []
        for i, pc in enumerate(pieces):
            pc = dict(pc)
            pc["zw"] = h + pc.get("z", 0)
            pieces[i] = pc
            d = DATA["pieces"][pc["kind"]]
            for j, s in enumerate(d["surfaces"]):
                self.placed.append(Placed(len(self.placed), i, j, s, pc, pc["kind"]))
            W = (pc.get("width") or d["size"][1]) / d["size"][1]
            c, sn = math.cos(pc["yaw"]), math.sin(pc["yaw"])
            turn = bool(d["surfaces"]) and d["surfaces"][0]["sweep"] == "turn"
            for ln in d["lines"]:
                k = W if (ln["what"] != "rail" and not turn) else 1.0
                pts = [(pc["x"] + u * c - w * k * sn, pc["y"] + u * sn + w * k * c, pc["zw"] + z) for u, w, z in ln["pts"]]
                self.lines.append(dict(what=ln["what"], pts=pts, piece=i))

    def top_at(self, x, y, z=99.0, up=0.05, skip=None):
        best = None
        for p in self.placed:
            if skip is not None and p.idx == skip:
                continue
            u, w = p.local(x, y)
            if not p.inside(u, w):
                continue
            t = p.prof.top_at(u)
            if not t:
                continue
            tz = p.oz + t[0]
            if tz > z + up:
                continue
            if best is None or tz > best[0]:
                best = (tz, p, t[1])
        return best


def pieces_of(key):
    p = next(q for q in DATA["parks"] if q["key"] == key)
    return [dict(pc) for pc in p["pieces"]], p


# ── export ──────────────────────────────────────────────────────────────────────────────────────────────────


def export(path, groups, root_name, at=(0, 0, 0)):
    """The objects under one root (at `at`, Blender's), written as a GLB and its textures linked; its size."""
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    root.location = at
    for g, obs in groups.items():
        for o in obs:
            o.parent = root
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _fine_positions()
    size = bexport.export(path, root)
    link(path)
    return os.path.getsize(path)


def _fine_positions():
    """(after the bikes' exporter patch) Positions through meshopt's exponential filter at 20 bits, not 12: its
    exponent is shared over each vector, so a park 44 m across kept y to 8 mm — 20 bits keep it to 0.1 mm (the
    exporter's own snap, 1/8192 m, stays the finer limit)."""
    bexport._quantize_exporter()
    try:
        from io_scene_gltf2.io.exp import meshopt as mo
    except ImportError:
        import importlib

        mo = importlib.import_module("addons_core.io_scene_gltf2.io.exp.meshopt")
    enc = mo.MeshoptEncoder.encode_attribute
    if getattr(enc, "_fine", False):
        return

    def encode_attribute(attribute_name, data, byteStride, export_settings):
        was = mo.EXP_FILTER_BITS
        if attribute_name in ("POSITION", "SK_POSITION"):
            mo.EXP_FILTER_BITS = 20
        try:
            return enc(attribute_name, data, byteStride, export_settings)
        finally:
            mo.EXP_FILTER_BITS = was

    encode_attribute._fine = True
    mo.MeshoptEncoder.encode_attribute = staticmethod(encode_attribute)


def link(path):
    """Our materials' factors and textures (tex/<name>.ktx2 beside the GLB) written into it by name."""
    js, binc = link_tex._read(path)
    binc = link_tex._drop_images(js, binc)
    images, textures = [], []
    js["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]

    def tex(name):
        uri = f"tex/{name}.ktx2"
        if uri not in [im["uri"] for im in images]:
            images.append({"uri": uri, "mimeType": "image/ktx2"})
        src = [im["uri"] for im in images].index(uri)
        for i, t in enumerate(textures):
            if t["extensions"]["KHR_texture_basisu"]["source"] == src:
                return {"index": i}
        textures.append({"sampler": 0, "extensions": {"KHR_texture_basisu": {"source": src}}})
        return {"index": len(textures) - 1}

    used = set()
    for m in js.get("materials", []):
        name = m.get("name", "").split(".")[0]
        d = MATS.get(name)
        if not d:
            continue
        pbr = {"baseColorFactor": [*d["col"], d.get("alpha", 1.0)]}
        pbr["metallicFactor"] = d["metal"] if not d.get("orm") else 1.0
        pbr["roughnessFactor"] = d["rough"] if not d.get("orm") else 1.0
        if d.get("a"):
            pbr["baseColorTexture"] = tex(d["a"])
        if d.get("orm"):
            pbr["metallicRoughnessTexture"] = tex(d["orm"])
        keep = {"name": m["name"], "pbrMetallicRoughness": pbr}
        if d.get("n"):
            keep["normalTexture"] = dict(tex(d["n"]), scale=d.get("ns", 1.0))
        if d.get("emit"):
            es = d["es"]
            keep["emissiveFactor"] = [min(1.0, c) for c in d["emit"]]
            if d.get("emap") and d.get("a"):
                keep["emissiveTexture"] = tex(d["a"])
            if es != 1.0:
                keep["extensions"] = {"KHR_materials_emissive_strength": {"emissiveStrength": es}}
                used.add("KHR_materials_emissive_strength")
        if d.get("alpha"):
            keep["alphaMode"] = "BLEND"
        if d.get("clip"):
            keep["alphaMode"] = "MASK"
            keep["alphaCutoff"] = d["clip"]
            keep["doubleSided"] = False
        m.clear()
        m.update(keep)
    if images:
        js["images"] = images
        js["textures"] = textures
        used.add("KHR_texture_basisu")
        js.setdefault("extensionsRequired", [])
        if "KHR_texture_basisu" not in js["extensionsRequired"]:
            js["extensionsRequired"].append("KHR_texture_basisu")
    else:
        js.pop("samplers", None)
    eu = js.setdefault("extensionsUsed", [])
    for e in used:
        if e not in eu:
            eu.append(e)
    link_tex._write(path, js, binc)

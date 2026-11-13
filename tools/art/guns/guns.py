# Plan 79, phase 0 — the guns, detailed (docs/plan/79-the-guns.md F4a): the five and the torch, life size,
# built in Blender by script — real parts (a fluted cylinder, chamber mouths, screws, sights, rivets, a
# rail, a scope, a swept magazine), outlines smoothed and edges rounded, and the materials drawn by
# nodes (wood grain, checkering, colour-case hardening, worn bluing, stippled polymer). The nodes are for
# these renders; the game's (phase 3) bakes them to the life look's textures.
#
# Imported by the other scripts here (`import guns`). Each gun is built in its own frame, Blender's z-up
# metres: +x along the barrel, +z up, +y the gun's left; the origin where the right fist holds it (the
# middle of the grip). Its points are empties under it:
#   grip    the right fist's middle          fore   the left hand (or the torch) on the fore-end
#   muzzle  where the bore leaves it          rear / front  the sight line (the eye's end, the far end)
#   butt    the stock's middle at the shoulder (long guns)
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# ── materials ────────────────────────────────────────────────────────────────────────────────────
MATS = {}


def _nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    return nt, nt.nodes["Principled BSDF"]


def _coord(nt, scale=(1, 1, 1), rot=(0, 0, 0)):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = scale
    mp.inputs["Rotation"].default_value = rot
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def _ramp(nt, src, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = els.new(p)
        e.color = (*c, 1)
    nt.links.new(src, r.inputs["Fac"])
    return r.outputs["Color"]


def _noise(nt, scale, detail=4.0, dist=0.0, vec=None):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Distortion"].default_value = dist
    if vec is not None:
        nt.links.new(vec, n.inputs["Vector"])
    return n.outputs["Fac"]


def _wave(nt, scale, direction="X", dist=0.0, vec=None, kind="BANDS", profile="SIN"):
    w = nt.nodes.new("ShaderNodeTexWave")
    w.wave_type = kind
    if kind == "BANDS":
        w.bands_direction = direction
    else:
        w.rings_direction = direction
    w.wave_profile = profile
    w.inputs["Scale"].default_value = scale
    w.inputs["Distortion"].default_value = dist
    w.inputs["Detail"].default_value = 3
    if vec is not None:
        nt.links.new(vec, w.inputs["Vector"])
    return w.outputs["Fac"]


def _math(nt, op, a, b=None, clamp=False):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = op
    m.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[0]


def _bump(nt, b, height, strength, dist=0.001):
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = strength
    bp.inputs["Distance"].default_value = dist
    nt.links.new(height, bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def _region(nt, box):
    """1 inside the box (x0, x1, z0, z1) in the part's own coords, else 0."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    x, z = sep.outputs["X"], sep.outputs["Z"]
    x0, x1, z0, z1 = box
    m = _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", x, x0), _math(nt, "LESS_THAN", x, x1))
    m = _math(nt, "MULTIPLY", m, _math(nt, "GREATER_THAN", z, z0))
    return _math(nt, "MULTIPLY", m, _math(nt, "LESS_THAN", z, z1))


def _checker(nt, pitch=0.0024):
    """Checkering (or knurling): two sets of grooves crossing at ±45° on the side (x, z)."""
    s = 2 * math.pi / (20 * pitch)
    a = _wave(nt, s, "X", vec=_coord(nt, rot=(0, math.radians(45), 0)), profile="SAW")
    b = _wave(nt, s, "X", vec=_coord(nt, rot=(0, math.radians(-45), 0)), profile="SAW")
    return _math(nt, "MINIMUM", a, b)


def mat(kind, check=None):
    """A material by kind; `check` a box (x0, x1, z0, z1) on a wooden or polymer part to checker."""
    key = (kind, check)
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(f"{kind}{'-check' if check else ''}")
    nt, b = _nodes(m)
    if kind in ("blued", "parker", "steel", "torch"):
        base = {"blued": (0.025, 0.03, 0.04), "parker": (0.055, 0.056, 0.054), "steel": (0.32, 0.33, 0.34), "torch": (0.04, 0.04, 0.042)}[kind]
        rough = {"blued": (0.22, 0.42), "parker": (0.55, 0.72), "steel": (0.25, 0.4), "torch": (0.4, 0.6)}[kind]
        b.inputs["Metallic"].default_value = 1.0 if kind != "parker" else 0.75
        n = _noise(nt, 90, 6)
        b.inputs["Base Color"].default_value = (*base, 1)
        nt.links.new(_ramp(nt, n, [(0.35, (rough[0],) * 3), (0.7, (rough[1],) * 3)]), b.inputs["Roughness"])
        # (the wear: lighter where it's rubbed, in patches)
        wear = _ramp(nt, _noise(nt, 14, 3, 1.5), [(0.62, base), (0.8, tuple(min(1, c * 1.7 + 0.02) for c in base))])
        nt.links.new(wear, b.inputs["Base Color"])
        _bump(nt, b, _noise(nt, 400, 2), 0.04 if kind != "parker" else 0.12)
    elif kind == "case":  # colour-case hardened: blues, straw, grey and purple, mottled
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.28
        n = _noise(nt, 26, 4, 3.0)
        nt.links.new(_ramp(nt, n, [(0.3, (0.05, 0.07, 0.15)), (0.43, (0.22, 0.2, 0.22)), (0.52, (0.4, 0.28, 0.12)), (0.62, (0.16, 0.08, 0.16)), (0.72, (0.3, 0.3, 0.32))]), b.inputs["Base Color"])
    elif kind in ("walnut", "birch"):
        dark, light = ((0.05, 0.02, 0.008), (0.1, 0.042, 0.017)) if kind == "walnut" else ((0.13, 0.05, 0.016), (0.21, 0.085, 0.03))
        # (fine grain along the length, wandering; a slow figure over it)
        grain = _wave(nt, 2 * math.pi / (20 * 0.0028), "Z", dist=4, vec=_coord(nt, scale=(0.12, 1, 1)))
        fig = _noise(nt, 9, 4, 1.5)
        g = _math(nt, "ADD", _math(nt, "MULTIPLY", grain, 0.35), _math(nt, "MULTIPLY", fig, 0.65))
        nt.links.new(_ramp(nt, g, [(0.3, dark), (0.7, light)]), b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.38 if kind == "walnut" else 0.5
        b.inputs["Coat Weight"].default_value = 0.35 if kind == "walnut" else 0.0
        h = _math(nt, "MULTIPLY", grain, 0.05)
        if check:
            h = _math(nt, "ADD", h, _math(nt, "MULTIPLY", _checker(nt), _region(nt, check)))
        _bump(nt, b, h, 0.35)
    elif kind == "polymer":
        b.inputs["Base Color"].default_value = (0.03, 0.032, 0.03, 1)
        b.inputs["Roughness"].default_value = 0.68
        h = _math(nt, "MULTIPLY", _noise(nt, 600, 2), 0.3)
        if check:
            h = _math(nt, "ADD", h, _math(nt, "MULTIPLY", _noise(nt, 1400, 1), _region(nt, check)))
        _bump(nt, b, h, 0.6)
    elif kind == "rubber":
        b.inputs["Base Color"].default_value = (0.012, 0.012, 0.012, 1)
        b.inputs["Roughness"].default_value = 0.9
        _bump(nt, b, _wave(nt, 2 * math.pi / (20 * 0.005), "Z"), 0.5)
    elif kind == "leather":
        b.inputs["Base Color"].default_value = (0.09, 0.045, 0.02, 1)
        b.inputs["Roughness"].default_value = 0.6
        _bump(nt, b, _noise(nt, 300, 6, 1), 0.4)
    elif kind in ("brass", "copper"):
        c = (0.7, 0.5, 0.2) if kind == "brass" else (0.7, 0.3, 0.17)
        b.inputs["Metallic"].default_value = 1.0
        nt.links.new(_ramp(nt, _noise(nt, 18, 4, 1), [(0.4, tuple(x * 0.55 for x in c)), (0.62, c)]), b.inputs["Base Color"])
        nt.links.new(_ramp(nt, _noise(nt, 60, 3), [(0.3, (0.22,) * 3), (0.7, (0.38,) * 3)]), b.inputs["Roughness"])
    elif kind == "nickel":  # bright nickel, worn: duller where handled, the odd scratch
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Base Color"].default_value = (0.66, 0.65, 0.62, 1)
        nt.links.new(_ramp(nt, _noise(nt, 16, 4, 1.2), [(0.4, (0.7, 0.69, 0.66)), (0.75, (0.5, 0.48, 0.44))]), b.inputs["Base Color"])
        nt.links.new(_ramp(nt, _noise(nt, 70, 5), [(0.35, (0.1,) * 3), (0.75, (0.3,) * 3)]), b.inputs["Roughness"])
        _bump(nt, b, _wave(nt, 2 * math.pi / (20 * 0.0006), "X", dist=30, vec=_coord(nt, rot=(0.3, 0.7, 0.2))), 0.02)
    elif kind == "engraved":  # silver, engraved in scrolls, the cuts dark
        b.inputs["Metallic"].default_value = 1.0
        f = _wave(nt, 2 * math.pi / (20 * 0.0045), "X", dist=14, vec=_coord(nt, rot=(0.0, 0.6, 0.0)))
        cut = _math(nt, "LESS_THAN", _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", f, 0.5)), 0.06)
        nt.links.new(_ramp(nt, cut, [(0.0, (0.6, 0.58, 0.55)), (1.0, (0.08, 0.075, 0.07))]), b.inputs["Base Color"])
        nt.links.new(_ramp(nt, _noise(nt, 60, 4), [(0.3, (0.16,) * 3), (0.7, (0.3,) * 3)]), b.inputs["Roughness"])
        _bump(nt, b, _math(nt, "SUBTRACT", 1.0, cut), 0.35)
    elif kind == "insert":
        b.inputs["Base Color"].default_value = (0.8, 0.06, 0.03, 1)
        b.inputs["Emission Color"].default_value = (0.8, 0.06, 0.03, 1)
        b.inputs["Emission Strength"].default_value = 0.6
    elif kind == "lead":
        b.inputs["Base Color"].default_value = (0.42, 0.43, 0.45, 1)
        b.inputs["Metallic"].default_value = 0.8
        b.inputs["Roughness"].default_value = 0.55
    elif kind == "enamel":
        b.inputs["Base Color"].default_value = (0.012, 0.03, 0.055, 1)
        b.inputs["Roughness"].default_value = 0.22
        b.inputs["Coat Weight"].default_value = 0.6
        _bump(nt, b, _noise(nt, 220, 2), 0.05)
    elif kind == "glass":
        b.inputs["Base Color"].default_value = (0.92, 0.96, 1.0, 1)
        b.inputs["Roughness"].default_value = 0.02
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["IOR"].default_value = 1.5
    elif kind == "coated":  # a scope's lens: dark, a violet-green bloom
        b.inputs["Base Color"].default_value = (0.01, 0.015, 0.02, 1)
        b.inputs["Roughness"].default_value = 0.02
        b.inputs["Metallic"].default_value = 0.6
        b.inputs["Coat Weight"].default_value = 1.0
        b.inputs["Coat Tint"].default_value = (0.5, 0.3, 0.9, 1)
    elif kind in ("glow", "lens"):
        c = (1.0, 0.84, 0.58) if kind == "glow" else (1.0, 0.95, 0.85)
        b.inputs["Base Color"].default_value = (*c, 1)
        b.inputs["Emission Color"].default_value = (*c, 1)
        b.inputs["Emission Strength"].default_value = 5.0 if kind == "glow" else 3.0
    elif kind == "dark":
        b.inputs["Base Color"].default_value = (0.004, 0.004, 0.004, 1)
        b.inputs["Roughness"].default_value = 0.9
    elif kind == "dial":
        b.inputs["Base Color"].default_value = (0.85, 0.8, 0.66, 1)
        b.inputs["Roughness"].default_value = 0.5
    MATS[key] = m
    return m


# ── shapes into a bmesh, in the gun's frame ──────────────────────────────────────────────────────
def _to(bm, verts, M):
    bmesh.ops.transform(bm, matrix=M, verts=verts)


def _axis_frame(p0, d):
    return Matrix.Translation(p0) @ Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()


def lathe(bm, prof, p0, d, seg=32, cap=True, a0=0.0, arc=math.tau):
    """Turned: `prof` (t along d, r) round the axis from p0 along d."""
    p0, d = Vector(p0), Vector(d)
    full = arc >= math.tau - 1e-6
    n = seg if full else seg + 1
    rows = []
    for t, r in prof:
        row = []
        for i in range(n):
            a = a0 + arc * i / seg
            row.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, t)))
        rows.append(row)
    for j in range(len(rows) - 1):
        for i in range(seg):
            a, b = rows[j], rows[j + 1]
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap and full:
        for row, flip in ((rows[0], True), (rows[-1], False)):
            if prof[0 if flip else -1][1] > 1e-6:
                bm.faces.new(row[::-1] if flip else row)
    _to(bm, [v for r in rows for v in r], _axis_frame(p0, d))


def tube(bm, p0, p1, r0, r1=None, seg=24):
    p0, p1 = Vector(p0), Vector(p1)
    lathe(bm, [(0, r0), ((p1 - p0).length, r0 if r1 is None else r1)], p0, p1 - p0, seg)


def box(bm, x0, x1, z0, z1, w, y=0.0, M=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r["verts"]
    bmesh.ops.scale(bm, vec=(x1 - x0, w, z1 - z0), verts=vs)
    bmesh.ops.translate(bm, vec=((x0 + x1) / 2, y, (z0 + z1) / 2), verts=vs)
    if M is not None:
        _to(bm, vs, M)
    return vs


def sphere(bm, at, r, seg=16):
    v = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)["verts"]
    bmesh.ops.translate(bm, vec=Vector(at), verts=v)


def smooth(pts, it=3):
    """A closed outline rounded (Chaikin), the points marked (x, z, 1) kept sharp."""
    P = [(Vector((p[0], p[1])), len(p) > 2) for p in pts]
    for _ in range(it):
        out = []
        for i in range(len(P)):
            (a, sa), (b, sb) = P[i], P[(i + 1) % len(P)]
            out.append((a, True) if sa else (a * 0.75 + b * 0.25, False))
            if not sb:
                out.append((a * 0.25 + b * 0.75, False))
        P = out
    return [(p.x, p.y) for p, _ in P]


def prism(bm, pts, w, y=0.0, M=None):
    """A side outline (x, z, counter-clockwise) extruded `w` across y."""
    vs = [bm.verts.new((p[0], y - w / 2, p[1])) for p in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, w, 0), verts=top)
    if M is not None:
        _to(bm, vs + top, M)
    return vs + top


def sweep(bm, spine, section, up=(0, 1, 0), cap=True):
    """A section (a function of the spine's index → [(s, u)]) swept along the spine's points; s across
    (perpendicular to the spine and to `up`), u along up."""
    up = Vector(up)
    rings = []
    n = len(spine)
    for i, p in enumerate(spine):
        t = (Vector(spine[min(i + 1, n - 1)]) - Vector(spine[max(i - 1, 0)])).normalized()
        s = up.cross(t).normalized()
        u = t.cross(s)
        rings.append([bm.verts.new(Vector(p) + s * a + u * b) for a, b in section(i)])
    m = len(rings[0])
    for j in range(n - 1):
        for i in range(m):
            a, b = rings[j], rings[j + 1]
            bm.faces.new((a[i], a[(i + 1) % m], b[(i + 1) % m], b[i]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])


def spline(ctrl, n=24):
    """Points along a Catmull-Rom through the control points."""
    c = [Vector(p) for p in ctrl]
    c = [c[0] * 2 - c[1], *c, c[-1] * 2 - c[-2]]
    out = []
    for k in range(1, len(c) - 2):
        p0, p1, p2, p3 = c[k - 1], c[k], c[k + 1], c[k + 2]
        for i in range(n):
            t = i / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(c[-2])
    return out


def ring_section(r, n=10):
    return lambda i: [(math.cos(a) * r, math.sin(a) * r) for a in (j / n * math.tau for j in range(n))]


def rect_section(w, h, ch=0.0015):
    """A rectangle w across, h along up, its corners chamfered."""
    a, b = w / 2, h / 2
    return [(-a + ch, -b), (a - ch, -b), (a, -b + ch), (a, b - ch), (a - ch, b), (-a + ch, b), (-a, b - ch), (-a, -b + ch)]


ROT_X90 = Matrix.Rotation(math.pi / 2, 4, "X")


# ── a gun: its parts ─────────────────────────────────────────────────────────────────────────────
class Gun:
    def __init__(self, gid):
        self.id = gid
        self.root = bpy.data.objects.new(gid, None)
        bpy.context.collection.objects.link(self.root)
        self.points = {}

    def part(self, name, build, m, bevel=0.0, seg=2, cut=None, smooth_=True, check=None, angle=35):
        """A part: `build(bm)` fills it; `cut(bm)` (if any) is taken out of it (a boolean); its edges
        bevelled `bevel` wide (rounded with more `seg`)."""
        bm = bmesh.new()
        build(bm)
        me = bpy.data.meshes.new(f"{self.id}.{name}")
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = smooth_
        ob = bpy.data.objects.new(f"{self.id}.{name}", me)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(mat(m, check) if isinstance(m, str) else m)
        ob.parent = self.root
        if cut is not None:
            cb = bmesh.new()
            cut(cb)
            cm = bpy.data.meshes.new(f"{self.id}.{name}.cut")
            bmesh.ops.recalc_face_normals(cb, faces=cb.faces)
            cb.to_mesh(cm)
            cb.free()
            co = bpy.data.objects.new(f"{self.id}.{name}.cut", cm)
            bpy.context.collection.objects.link(co)
            co.parent = self.root
            co.hide_render = True
            co.display_type = "WIRE"
            mod = ob.modifiers.new("cut", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = co
        if bevel > 0:
            mod = ob.modifiers.new("bevel", "BEVEL")
            mod.width = bevel
            mod.segments = seg
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(angle)
            mod.harden_normals = True
            mod.use_clamp_overlap = True
        return ob

    def point(self, name, at):
        e = bpy.data.objects.new(f"{self.id}@{name}", None)
        e.empty_display_size = 0.02
        e.location = at
        e.parent = self.root
        bpy.context.collection.objects.link(e)
        self.points[name] = Vector(at)


def screw(g, name, at, r=0.0024, axis=(0, 1, 0), m="blued"):
    """A screw head flush on a side: a dome, a slot across it."""
    a = Vector(axis).normalized()
    at = Vector(at)
    g.part(name, lambda bm: lathe(bm, [(0, r), (0.0006, r), (0.0009, r * 0.6), (0.0011, 0)], at, a, 14), m,
           cut=lambda bm: box(bm, -r * 1.3, r * 1.3, -0.00035, 0.00035, 0.002, M=_axis_frame(at + a * 0.0011, a) @ ROT_X90))


# ── the revolver (redesigned 2026-11-11, after Alan Wake 2's): a double-action .357, 4-inch barrel —
# a ventilated rib and a full-length underlug, a swing-out cylinder, an adjustable rear sight and a
# ramp front sight with a red insert; nickel, worn; walnut target grips, checkered ──────────────────
def revolver():
    g = Gun("revolver")
    BZ = 0.072  # the bore
    CZ = BZ - 0.0135  # the cylinder's axis
    X = Vector((1, 0, 0))
    MZ = 0.168  # the muzzle
    g.part("barrel", lambda bm: lathe(bm, [(0, 0), (0, 0.0098), (MZ - 0.064 - 0.002, 0.0098), (MZ - 0.064, 0.0088), (MZ - 0.064, 0)], (0.064, 0, BZ), X, 36), "nickel",
           cut=lambda bm: tube(bm, (MZ - 0.03, 0, BZ), (MZ + 0.01, 0, BZ), 0.0046, seg=20))
    lug = smooth([(0.064, BZ, 1), (MZ, BZ, 1), (MZ, BZ - 0.019), (MZ - 0.004, BZ - 0.0255), (0.072, BZ - 0.0255), (0.064, BZ - 0.022, 1)], 3)
    g.part("underlug", lambda bm: prism(bm, lug, 0.0205), "nickel", 0.005, 4)
    g.part("rib", lambda bm: prism(bm, [(0.064, BZ + 0.004), (MZ, BZ + 0.004), (MZ, BZ + 0.0155), (0.064, BZ + 0.0165)], 0.0098), "nickel", 0.0015, 2,
           cut=lambda bm: [box(bm, 0.074 + i * 0.019, 0.086 + i * 0.019, BZ + 0.0085, BZ + 0.013, 0.03) for i in range(5)])
    g.part("rib-top", lambda bm: box(bm, 0.068, MZ - 0.003, BZ + 0.0155, BZ + 0.0165, 0.0075), "parker")
    g.part("ramp", lambda bm: prism(bm, smooth([(0.138, BZ + 0.0165, 1), (MZ - 0.004, BZ + 0.0165, 1), (MZ - 0.005, BZ + 0.027, 1), (MZ - 0.012, BZ + 0.027), (0.138, BZ + 0.018, 1)], 1), 0.0034), "nickel", 0.0004)
    g.part("insert", lambda bm: box(bm, MZ - 0.011, MZ - 0.007, BZ + 0.021, BZ + 0.026, 0.0036), "insert")
    # the frame: round the cylinder (its window), the top strap, the recoil shield, the guard in one
    frame = smooth([(0.074, BZ - 0.026, 1), (0.074, BZ + 0.011), (0.066, BZ + 0.016), (0.006, BZ + 0.017), (-0.008, BZ + 0.014), (-0.016, 0.062), (-0.02, 0.044), (-0.012, 0.03, 1),
                    (0.0, 0.03), (0.006, 0.014), (0.02, 0.004), (0.036, 0.004), (0.046, 0.014), (0.05, 0.03), (0.06, 0.034, 1)], 3)
    guard = smooth([(0.006, 0.031, 1), (0.011, 0.017), (0.022, 0.0105), (0.034, 0.0105), (0.041, 0.018), (0.043, 0.031, 1)], 2)
    window = smooth([(0.017, 0.037, 1), (0.062, 0.037, 1), (0.062, BZ + 0.009, 1), (0.017, BZ + 0.009, 1)], 1)
    g.part("frame", lambda bm: prism(bm, frame, 0.03), "nickel", 0.004, 4, cut=lambda bm: (prism(bm, guard, 0.06), prism(bm, window, 0.06)))
    # the cylinder: fluted, its six chambers loaded (the rounds' noses at the front); the crane
    def cyl(bm):
        lathe(bm, [(0, 0), (0, 0.019), (0.0015, 0.0205), (0.042, 0.0205), (0.0435, 0.019), (0.0435, 0)], (0.0175, 0, CZ), X, 48)

    def flutes_chambers(bm):
        for i in range(6):
            a = (i + 0.5) / 6 * math.tau
            c = Vector((0, math.cos(a) * 0.0228, CZ + math.sin(a) * 0.0228))
            tube(bm, c + Vector((0.026, 0, 0)), c + Vector((0.052, 0, 0)), 0.0042, seg=14)
            sphere(bm, c + Vector((0.026, 0, 0)), 0.0042, 12)
            sphere(bm, c + Vector((0.052, 0, 0)), 0.0042, 12)
            b = i / 6 * math.tau
            tube(bm, (0.054, math.cos(b) * 0.0133, CZ + math.sin(b) * 0.0133), (0.07, math.cos(b) * 0.0133, CZ + math.sin(b) * 0.0133), 0.0049, seg=16)

    g.part("cylinder", cyl, "nickel", 0.0006, cut=flutes_chambers)
    for i in range(6):
        g.part(f"round{i}", lambda bm, i=i: sphere(bm, (0.0555, math.cos(i / 6 * math.tau) * 0.0133, CZ + math.sin(i / 6 * math.tau) * 0.0133), 0.0044, 12), "lead")
    g.part("crane", lambda bm: (box(bm, 0.061, 0.068, 0.038, 0.05, 0.022), tube(bm, (0.061, 0, CZ), (0.068, 0, CZ), 0.006, seg=16)), "nickel", 0.0008)
    # the ejector rod along the cylinder's axis under the barrel — in the underlug shut, out with the
    # cylinder, struck to dump the empties (plan 80); its head knurled
    g.part("rod", lambda bm: (tube(bm, (0.0625, 0, CZ), (0.123, 0, CZ), 0.0024, seg=12),
                              lathe(bm, [(0, 0), (0, 0.0034), (0.0062, 0.0034), (0.007, 0)], (0.123, 0, CZ), Vector((1, 0, 0)), 16)), "nickel")
    g.part("latch", lambda bm: prism(bm, smooth([(0.0, 0.056, 1), (0.014, 0.057, 1), (0.016, 0.063), (0.002, 0.065, 1)], 1), 0.004, y=0.0165), "nickel", 0.0007, check=(-1, 1, -1, 1))
    # the rear sight on the top strap (a notched blade, its screws); the hammer, its spur checkered;
    # the trigger, smooth and wide
    g.part("rear-sight", lambda bm: prism(bm, smooth([(-0.005, BZ + 0.0155, 1), (0.014, BZ + 0.0165, 1), (0.012, BZ + 0.0195), (-0.003, BZ + 0.0215), (-0.006, BZ + 0.0195, 1)], 1), 0.009), "parker", 0.0005,
           cut=lambda bm: box(bm, -0.012, -0.001, BZ + 0.0185, BZ + 0.03, 0.003))
    screw(g, "sight-screw", (0.009, 0, BZ + 0.0175), 0.0014, (0, 0, 1), "parker")
    g.part("hammer", lambda bm: prism(bm, smooth([(-0.013, 0.056, 1), (-0.004, 0.06), (-0.006, 0.08), (-0.016, 0.091), (-0.032, 0.095), (-0.036, 0.089, 1), (-0.024, 0.083), (-0.019, 0.066)], 2), 0.0075), "nickel", 0.0006)
    g.part("spur", lambda bm: [box(bm, -0.035 + i * 0.003, -0.0335 + i * 0.003, 0.091 - i * 0.0006, 0.0955 - i * 0.0006, 0.0078) for i in range(5)], "nickel")
    g.part("trigger", lambda bm: prism(bm, smooth([(0.02, 0.031, 1), (0.027, 0.031, 1), (0.026, 0.02), (0.021, 0.012, 1), (0.017, 0.014), (0.019, 0.022)], 2), 0.0075), "nickel", 0.0012)
    for i, (x, z) in enumerate(((0.04, 0.042), (0.002, 0.04), (-0.008, 0.066))):
        screw(g, f"screw{i}", (x, -0.0151, z), 0.0021, (0, -1, 0), "nickel")
    # the target grips: walnut, filled behind the guard, a finger rest; checkered; a plain medallion
    # each side; the grip screw
    grip = [(0.004, 0.032, 1), (0.009, 0.004), (0.006, -0.03), (-0.002, -0.058), (-0.014, -0.074), (-0.04, -0.078), (-0.056, -0.066), (-0.052, -0.03), (-0.04, 0.004), (-0.03, 0.03), (-0.02, 0.046, 1), (-0.012, 0.031, 1)]
    g.part("grips", lambda bm: prism(bm, smooth(grip, 3), 0.036), "walnut", 0.008, 5, check=(-0.05, 0.004, -0.07, 0.01))
    for s in (1, -1):
        g.part(f"medallion{s}", lambda bm, s=s: lathe(bm, [(0, 0), (0, 0.0055), (0.0008, 0.005), (0.001, 0)], (-0.024, s * 0.0175, 0.012), (0, s, 0), 24), "brass")
    screw(g, "grip-screw", (-0.026, -0.0182, -0.03), 0.0022, (0, -1, 0), "nickel")
    g.point("grip", (0, 0, 0))
    g.point("muzzle", (MZ, 0, BZ))
    g.point("rear", (-0.006, 0, BZ + 0.02))
    g.point("front", (MZ - 0.009, 0, BZ + 0.026))
    g.point("fore", (0.0, 0, -0.03))
    return g


# ── the double-barrel (redesigned 2026-11-11, after Alan Wake 2's): a hammerless side-by-side boxlock,
# 12 gauge, 28-inch barrels — a round-bodied action, silver and engraved; a matted rib and a bead;
# a semi-beavertail fore-end and a semi-pistol stock, walnut, checkered; a thick rubber pad ──────────
def shotgun():
    g = Gun("shotgun")
    BZ = 0.066
    X = Vector((1, 0, 0))
    B0 = 0.142  # the barrels' breech
    for s, nm in ((1, "L"), (-1, "R")):
        g.part(f"barrel{nm}", lambda bm, s=s: lathe(bm, [(0, 0), (0, 0.0136), (0.07, 0.0128), (0.7, 0.0107), (0.7, 0.0111), (0.71, 0.0111), (0.712, 0.0)], (B0, s * 0.0118, BZ), X, 40), "blued",
               cut=lambda bm, s=s: tube(bm, (B0 + 0.68, s * 0.0118, BZ), (B0 + 0.75, s * 0.0118, BZ), 0.0092, seg=24))
    g.part("rib", lambda bm: (prism(bm, [(B0, BZ + 0.007), (B0 + 0.708, BZ + 0.005), (B0 + 0.708, BZ + 0.0125), (B0, BZ + 0.0145)], 0.0095), box(bm, B0 + 0.01, B0 + 0.7, BZ - 0.013, BZ - 0.006, 0.011)), "parker", 0.0006)
    g.part("bead", lambda bm: sphere(bm, (B0 + 0.702, 0, BZ + 0.0148), 0.0021, 12), "brass")
    # (the shells in the chambers: their brass heads at the breech, seen when it's broken open)
    for i, s in enumerate((1, -1)):
        g.part(f"round{i}", lambda bm, s=s: lathe(bm, [(0, 0), (0, 0.0108), (0.0016, 0.0108), (0.0016, 0.0094), (0.012, 0.0094), (0.012, 0)], (B0 + 0.0005, s * 0.0118, BZ), X, 20), "brass")
    # the action: round-bodied, its bottom rounded into the guard's tang; the fences scalloped
    act = smooth([(0.018, 0.024, 1), (0.1, 0.022), (B0 - 0.004, 0.03), (B0 + 0.001, 0.042, 1), (B0 + 0.001, BZ + 0.013, 1), (B0 - 0.012, BZ + 0.019), (0.03, BZ + 0.012), (-0.012, 0.074), (-0.022, 0.066, 1)], 3)
    g.part("action", lambda bm: prism(bm, act, 0.05), "engraved", 0.007, 4)
    g.part("fences", lambda bm: [lathe(bm, [(0, 0.0178), (0.007, 0.0174), (0.013, 0.0148), (0.017, 0.0)], (B0 - 0.016, s * 0.0118, BZ), X, 28) for s in (1, -1)], "engraved")
    g.part("hinge", lambda bm: tube(bm, (B0 + 0.002, -0.0255, 0.033), (B0 + 0.002, 0.0255, 0.033), 0.0062, seg=20), "engraved")
    g.part("lever", lambda bm: prism(bm, smooth([(-0.004, -0.008, 1), (0.03, -0.006), (0.034, 0.0), (0.03, 0.006), (-0.004, 0.008, 1), (-0.03, 0.012), (-0.034, 0.004), (-0.03, -0.004)], 2), 0.004,
                                     M=Matrix.Translation((0.02, 0, BZ + 0.013)) @ Matrix.Rotation(math.radians(12), 4, "Z") @ ROT_X90), "blued", 0.0012)
    g.part("safety", lambda bm: box(bm, -0.018, -0.007, BZ + 0.007, BZ + 0.0125, 0.007), "engraved", 0.0008)
    for s in (1, -1):
        screw(g, f"pin-screw{s}", (0.075, s * 0.0256, 0.046), 0.0026, (0, s, 0), "engraved")
    for i, x in enumerate((0.046, 0.058)):
        g.part(f"trigger{i}", lambda bm, x=x: prism(bm, smooth([(x, 0.026, 1), (x + 0.005, 0.026, 1), (x + 0.001, 0.012), (x - 0.006, 0.004, 1), (x - 0.007, 0.007), (x - 0.002, 0.015)], 2), 0.0045), "blued", 0.0004)
    go = smooth([(0.076, 0.026, 1), (0.075, 0.012), (0.06, 0.0), (0.03, -0.003), (0.012, 0.003), (-0.004, 0.006), (-0.07, -0.026), (-0.074, -0.019), (-0.006, 0.02, 1)], 2)
    gi = smooth([(0.068, 0.031, 1), (0.067, 0.014), (0.056, 0.006), (0.032, 0.0035), (0.016, 0.009), (0.009, 0.031, 1)], 2)
    g.part("guard", lambda bm: prism(bm, go, 0.01), "engraved", 0.0014, 2, cut=lambda bm: prism(bm, gi, 0.03))
    # the fore-end: a semi-beavertail, wrapping the barrels' sides, checkered; its iron; the latch
    fe = smooth([(B0 + 0.012, BZ - 0.006, 1), (B0 + 0.012, 0.03), (B0 + 0.04, 0.024), (B0 + 0.22, 0.026), (B0 + 0.27, 0.036), (B0 + 0.275, BZ - 0.006, 1)], 3)
    g.part("fore-end", lambda bm: prism(bm, fe, 0.054), "walnut", 0.012, 5, check=(B0 + 0.06, B0 + 0.24, 0.0, 0.1),
           cut=lambda bm: [tube(bm, (B0, s * 0.0118, BZ), (B0 + 0.4, s * 0.0118, BZ), 0.0128, seg=24) for s in (1, -1)])
    g.part("fore-iron", lambda bm: prism(bm, smooth([(B0 + 0.001, 0.034, 1), (B0 + 0.02, 0.03), (B0 + 0.024, 0.04), (B0 + 0.024, BZ - 0.014, 1), (B0 + 0.001, BZ - 0.014, 1)], 2), 0.046), "engraved", 0.004, 3)
    g.part("latch", lambda bm: prism(bm, smooth([(B0 + 0.235, 0.024, 1), (B0 + 0.26, 0.026, 1), (B0 + 0.262, 0.03), (B0 + 0.235, 0.029, 1)], 1), 0.012), "blued", 0.0008)
    # the stock: semi-pistol, the comb low; the wrist and grip checkered; a grip cap; the pad, a white
    # spacer before it; a sling swivel
    stock = [(0.02, 0.028, 1), (-0.022, 0.07), (-0.09, 0.064), (-0.365, 0.036), (-0.37, 0.031, 1), (-0.37, -0.1, 1), (-0.33, -0.104), (-0.14, -0.042), (-0.09, -0.034), (-0.066, -0.05), (-0.042, -0.057), (-0.02, -0.048), (-0.004, -0.024), (0.01, -0.006)]
    g.part("stock", lambda bm: prism(bm, smooth(stock, 3), 0.042), "walnut", 0.017, 5, check=(-0.07, 0.015, -0.06, 0.06))
    g.part("grip-cap", lambda bm: lathe(bm, [(0, 0), (0, 0.011), (0.002, 0.0105), (0.0025, 0)], (-0.054, 0, -0.051), Vector((-0.3, 0, -1)), 24), "rubber")
    g.part("spacer", lambda bm: prism(bm, [(-0.37, 0.031), (-0.373, 0.031), (-0.373, -0.1), (-0.37, -0.1)], 0.042), "dial", 0.0008)
    g.part("pad", lambda bm: prism(bm, smooth([(-0.373, 0.033, 1), (-0.396, 0.034), (-0.399, -0.1), (-0.373, -0.102, 1)], 2), 0.044), "rubber", 0.006, 3)
    for z in (0.01, -0.07):
        screw(g, f"pad-screw{z}", (-0.399, 0, z), 0.0026, (-1, 0, 0), "steel")
    g.part("swivel", lambda bm: (tube(bm, (-0.26, 0, -0.072), (-0.26, 0, -0.084), 0.003, seg=10), lathe(bm, [(0, 0.008), (0.004, 0.008)], (-0.26, -0.002, -0.09), (0, 1, 0), 16, cap=False)), "steel")
    g.point("grip", (0, 0, 0))
    g.point("muzzle", (B0 + 0.71, 0, BZ))
    g.point("rear", (0.12, 0, BZ + 0.03))
    g.point("front", (B0 + 0.702, 0, BZ + 0.017))
    g.point("fore", (B0 + 0.14, 0, 0.032))
    g.point("butt", (-0.385, 0, -0.035))
    return g


# ── the AK-47: a stamped receiver and its rivets, birch furniture, a ribbed curved magazine ───────
def ak47():
    g = Gun("ak47")
    BZ = 0.064
    X = Vector((1, 0, 0))
    rec = smooth([(-0.045, 0.02, 1), (0.245, 0.02, 1), (0.245, 0.081, 1), (-0.02, 0.081, 1), (-0.045, 0.072, 1)], 1)

    def rec_cut(bm):
        box(bm, 0.11, 0.205, 0.066, 0.08, 0.02, y=-0.022)  # the ejection port (right)
        box(bm, 0.07, 0.125, 0.0, 0.03, 0.033)  # the magazine well
        sphere(bm, (0.098, 0.031, 0.05), 0.012)  # the magazine's dimples (an AKM's)
        sphere(bm, (0.098, -0.031, 0.05), 0.012)

    g.part("receiver", lambda bm: prism(bm, rec, 0.043), "parker", 0.002, 2, cut=rec_cut)
    g.part("carrier", lambda bm: (box(bm, 0.1, 0.24, 0.066, 0.08, 0.03), tube(bm, (0.19, -0.014, 0.073), (0.19, -0.042, 0.073), 0.0035, seg=12), sphere(bm, (0.19, -0.044, 0.073), 0.0055, 12)), "blued", 0.0008)
    rivets = [(0.225, 0.03), (0.235, 0.03), (0.225, 0.07), (0.235, 0.07), (0.2, 0.026), (0.03, 0.028), (0.055, 0.028), (-0.02, 0.03), (-0.035, 0.045), (-0.02, 0.06)]
    g.part("rivets", lambda bm: [sphere(bm, (x, s * 0.0215, z), 0.0023, 10) for x, z in rivets for s in (1, -1)], "parker")
    # the dust cover, ribbed, its catch behind; the rear sight on the trunnion
    def cover(bm):
        lathe(bm, [(0, 0), (0, 0.0208), (0.27, 0.0208), (0.27, 0)], (-0.04, 0, 0.074), X, 32, a0=math.pi / 2, arc=math.pi)
        for x in (0.02, 0.09, 0.16):
            lathe(bm, [(0, 0.0212), (0.012, 0.0222), (0.024, 0.0212)], (x, 0, 0.074), X, 32, cap=False, a0=math.pi / 2, arc=math.pi)

    g.part("cover", cover, "parker", 0.0006)
    g.part("catch", lambda bm: tube(bm, (-0.044, 0, 0.074), (-0.054, 0, 0.074), 0.005, seg=16), "blued", 0.0006)
    g.part("rear-sight", lambda bm: (prism(bm, smooth([(0.236, 0.081, 1), (0.29, 0.081, 1), (0.29, 0.094), (0.25, 0.1), (0.236, 0.098, 1)], 1), 0.024), box(bm, 0.25, 0.3, 0.097, 0.102, 0.014), box(bm, 0.27, 0.28, 0.096, 0.104, 0.018)), "blued", 0.0006)
    # the barrel, the gas block and tube, the front sight and its hood, the slant brake, the
    # cleaning rod, the bayonet lug
    g.part("barrel", lambda bm: lathe(bm, [(0, 0), (0, 0.0115), (0.03, 0.0102), (0.06, 0.0092), (0.41, 0.0082), (0.41, 0)], (0.245, 0, BZ), X, 28), "blued")
    g.part("gas-block", lambda bm: (prism(bm, smooth([(0.465, BZ - 0.012, 1), (0.505, BZ - 0.012, 1), (0.505, BZ + 0.04, 1), (0.48, BZ + 0.042), (0.465, BZ + 0.03, 1)], 1), 0.022), tube(bm, (0.43, 0, BZ + 0.03), (0.47, 0, BZ + 0.03), 0.0095, seg=20)), "blued", 0.001)
    g.part("gas-tube", lambda bm: lathe(bm, [(0, 0.0098), (0.18, 0.0098)], (0.25, 0, BZ + 0.03), X, 24), "parker")
    def front(bm):
        prism(bm, smooth([(0.598, BZ - 0.016, 1), (0.63, BZ - 0.016, 1), (0.63, BZ + 0.016, 1), (0.6, BZ + 0.016, 1)], 1), 0.024)
        lathe(bm, [(0, 0.0105), (0.016, 0.0105)], (0.605, 0, BZ + 0.031), (1, 0, 0), 20, cap=False, a0=math.pi / 2 - 0.25, arc=math.pi + 0.5)
        tube(bm, (0.614, 0, BZ + 0.012), (0.614, 0, BZ + 0.038), 0.0016, seg=8)
        box(bm, 0.61, 0.626, BZ - 0.024, BZ - 0.014, 0.012)  # the lug

    g.part("front-sight", front, "blued", 0.0006)
    g.part("brake", lambda bm: lathe(bm, [(0, 0), (0, 0.0098), (0.004, 0.011), (0.034, 0.011), (0.036, 0.0)], (0.655, 0, BZ), X, 24), "blued",
           cut=lambda bm: (box(bm, 0.67, 0.72, BZ - 0.003, BZ + 0.04, 0.03, M=Matrix.Translation((0.69, 0, BZ)) @ Matrix.Rotation(math.radians(30), 4, "Y") @ Matrix.Translation((-0.69, 0, -BZ))), tube(bm, (0.65, 0, BZ), (0.7, 0, BZ), 0.0045, seg=16)))
    g.part("rod", lambda bm: (tube(bm, (0.28, 0, BZ - 0.0165), (0.635, 0, BZ - 0.0165), 0.0028, seg=10), sphere(bm, (0.636, 0, BZ - 0.0165), 0.0038, 10)), "steel")
    # the handguards: the lower's finger swells, the upper over the gas tube; their retainer bands
    lower = smooth([(0.25, 0.026, 1), (0.31, 0.022), (0.37, 0.026), (0.43, 0.03), (0.452, 0.036, 1), (0.452, 0.07, 1), (0.25, 0.072, 1)], 2)
    g.part("handguard", lambda bm: prism(bm, lower, 0.055), "birch", 0.009, 4, cut=lambda bm: box(bm, 0.24, 0.47, 0.055, 0.09, 0.03))
    g.part("upper", lambda bm: (prism(bm, smooth([(0.262, BZ + 0.016, 1), (0.43, BZ + 0.018, 1), (0.43, BZ + 0.045, 1), (0.262, BZ + 0.046, 1)], 1), 0.036)), "birch", 0.01, 4)
    g.part("bands", lambda bm: (box(bm, 0.244, 0.258, 0.022, BZ + 0.05, 0.058), box(bm, 0.452, 0.462, 0.03, 0.074, 0.056)), "blued", 0.0012)
    # the pistol grip, grooved; the guard; the selector on the right; the magazine catch
    pg = smooth([(-0.008, 0.022, 1), (0.034, 0.022, 1), (0.02, -0.04), (0.008, -0.086), (-0.02, -0.092), (-0.034, -0.086), (-0.026, -0.04)], 2)
    g.part("grip", lambda bm: prism(bm, pg, 0.031), "birch", 0.008, 4, check=(-0.05, 0.05, -0.08, 0.0))
    g.part("guard", lambda bm: prism(bm, smooth([(0.0, 0.02, 1), (0.075, 0.02, 1), (0.074, 0.004), (0.06, -0.002), (0.004, -0.002), (-0.002, 0.004)], 1), 0.012), "blued", 0.001, cut=lambda bm: prism(bm, smooth([(0.006, 0.021, 1), (0.066, 0.021, 1), (0.064, 0.004), (0.008, 0.004)], 1), 0.03))
    g.part("trigger", lambda bm: prism(bm, smooth([(0.022, 0.02, 1), (0.028, 0.02, 1), (0.026, 0.01), (0.02, 0.003, 1), (0.019, 0.006)], 1), 0.005), "blued", 0.0004)
    g.part("selector", lambda bm: prism(bm, smooth([(0.04, 0.062, 1), (0.2, 0.068, 1), (0.205, 0.074), (0.2, 0.076, 1), (0.05, 0.072), (0.035, 0.07, 1)], 1), 0.003, y=-0.024), "blued", 0.0006)
    screw(g, "selector-pivot", (0.045, -0.0258, 0.066), 0.004, (0, -1, 0))
    g.part("catch", lambda bm: prism(bm, [(0.065, 0.02), (0.07, 0.02), (0.068, 0.004), (0.06, 0.0)], 0.014), "blued", 0.0005)
    # the magazine: thirty rounds, curved forward going down; its ribs, its floor plate, the top round
    spine = []
    a, x, z = 0.0, 0.098, 0.03
    for i in range(18):
        spine.append(Vector((x, 0, z)))
        L = 0.0125
        x, z, a = x + math.sin(a) * L, z - math.cos(a) * L, a + 0.036
    g.part("magazine", lambda bm: sweep(bm, spine, lambda i: rect_section(0.052 + 0.01 * i / 17, 0.026, 0.004), up=(0, 1, 0)), "parker", 0.0008)
    g.part("mag-ribs", lambda bm: [sweep(bm, spine[2:-1], lambda i, s=s: [(-0.014 + u, s * 0.0137 + v) for u, v in rect_section(0.006, 0.002, 0.0006)], up=(0, 1, 0)) for s in (1, -1)], "parker")
    end = spine[-1]
    g.part("floor", lambda bm: box(bm, end.x - 0.036, end.x + 0.036, end.z - 0.006, end.z + 0.003, 0.03, M=Matrix.Translation(end) @ Matrix.Rotation(-0.6, 4, "Y") @ Matrix.Translation(-end)), "parker", 0.0015)
    g.part("round0", lambda bm: (tube(bm, (0.08, 0, 0.024), (0.12, 0, 0.024), 0.0055, seg=12)), "brass")
    # the stock: birch, its butt plate (steel, the trap door), a sling loop
    stk = smooth([(-0.04, 0.028, 1), (-0.04, 0.078, 1), (-0.1, 0.07), (-0.4, 0.046, 1), (-0.405, -0.075, 1), (-0.36, -0.072), (-0.1, 0.012)], 2)
    g.part("stock", lambda bm: prism(bm, stk, 0.038), "birch", 0.012, 5)
    g.part("buttplate", lambda bm: prism(bm, smooth([(-0.403, 0.049, 1), (-0.416, 0.05), (-0.418, -0.077), (-0.405, -0.078, 1)], 1), 0.04), "blued", 0.003, 2, cut=lambda bm: box(bm, -0.42, -0.41, -0.04, 0.02, 0.02, y=-0.0))
    g.part("sling", lambda bm: lathe(bm, [(0, 0.009), (0.004, 0.009)], (-0.35, 0.021, 0.0), (0, 1, 0), 16, cap=False), "steel")
    g.point("grip", (0, 0, 0))
    g.point("muzzle", (0.69, 0, BZ))
    g.point("rear", (0.27, 0, 0.104))
    g.point("front", (0.614, 0, BZ + 0.038))
    g.point("fore", (0.34, 0, 0.03))
    g.point("butt", (-0.41, 0, -0.01))
    return g


# ── the sniper: a bolt-action in a stippled synthetic stock, a fluted barrel, a 3–12× scope ───────
def sniper():
    g = Gun("sniper")
    BZ = 0.066
    SZ = 0.112  # the scope's axis
    # (the scope 3 cm back on its rail, the rail 1.5 cm longer behind: at the eye's place on the stock, aimed,
    # its eyepiece was 12–17 cm ahead of it — a real one's ~9 — plan 83 phase 3)
    DX = -0.03
    X = Vector((1, 0, 0))
    g.part("receiver", lambda bm: lathe(bm, [(0, 0), (0, 0.016), (0.003, 0.0175), (0.226, 0.0175), (0.23, 0.016), (0.23, 0)], (-0.01, 0, BZ), X, 40), "blued", 0.0,
           cut=lambda bm: box(bm, 0.03, 0.1, BZ - 0.004, BZ + 0.024, 0.03, y=-0.015))
    g.part("bolt", lambda bm: (lathe(bm, [(0, 0), (0, 0.009), (0.08, 0.009), (0.08, 0)], (-0.03, 0, BZ), X, 24),
                               lathe(bm, [(0, 0), (0, 0.006), (0.004, 0.0125), (0.03, 0.0135), (0.034, 0.0125), (0.034, 0)], (-0.066, 0, BZ), X, 28)), "steel", 0.0004)
    g.part("bolt-arm", lambda bm: tube(bm, (0.005, -0.008, BZ), (-0.004, -0.058, BZ - 0.026), 0.0042, 0.0036, seg=14), "steel")
    g.part("bolt-knob", lambda bm: lathe(bm, [(0, 0), (0, 0.006), (0.004, 0.0105), (0.016, 0.0105), (0.02, 0.006), (0.02, 0)], (-0.004, -0.058, BZ - 0.026), Vector((-0.2, -0.6, -0.5)), 24), "polymer", check=(-1, 1, -1, 1))
    # the rail, slotted
    g.part("rail", lambda bm: prism(bm, [(-0.035, BZ + 0.016), (0.225, BZ + 0.016), (0.225, BZ + 0.026), (-0.035, BZ + 0.026)], 0.021), "parker", 0.0008, cut=lambda bm: [box(bm, x, x + 0.0052, BZ + 0.021, BZ + 0.03, 0.03) for x in [-0.027 + 0.01 * i for i in range(24)]])
    # the barrel: heavy, fluted; the brake, ported
    def flutes(bm):
        for i in range(6):
            a = i / 6 * math.tau
            c = Vector((0, math.cos(a) * 0.0138, BZ + math.sin(a) * 0.0138))
            tube(bm, c + Vector((0.32, 0, 0)), c + Vector((0.72, 0, 0)), 0.0032, seg=10)
            sphere(bm, c + Vector((0.32, 0, 0)), 0.0032, 10)
            sphere(bm, c + Vector((0.72, 0, 0)), 0.0032, 10)

    g.part("barrel", lambda bm: lathe(bm, [(0, 0), (0, 0.0145), (0.06, 0.0145), (0.1, 0.0128), (0.6, 0.0118), (0.6, 0)], (0.22, 0, BZ), X, 36), "blued", cut=flutes)
    g.part("brake", lambda bm: lathe(bm, [(0, 0), (0, 0.0128), (0.004, 0.014), (0.056, 0.014), (0.06, 0.0125), (0.06, 0)], (0.82, 0, BZ), X, 32), "blued", 0.0003,
           cut=lambda bm: ([box(bm, x, x + 0.009, BZ - 0.0055, BZ + 0.0055, 0.05) for x in (0.832, 0.846, 0.86)], tube(bm, (0.87, 0, BZ), (0.89, 0, BZ), 0.006, seg=16)))
    # the stock: stippled at the grip and the fore-end; the cheek riser on its posts; the pad
    stk = [(0.62, 0.032, 1), (0.62, 0.052, 1), (0.03, 0.054), (-0.04, 0.058), (-0.11, 0.066), (-0.37, 0.07, 1), (-0.375, -0.09, 1), (-0.33, -0.1), (-0.12, -0.04), (-0.07, -0.032), (-0.05, -0.078), (-0.03, -0.092), (-0.012, -0.088), (0.0, -0.05), (0.018, -0.002), (0.16, 0.012), (0.5, 0.022)]
    g.part("stock", lambda bm: prism(bm, smooth(stk, 3), 0.05), "polymer", 0.014, 5, check=(-0.07, 0.02, -0.1, 0.03))
    g.part("riser", lambda bm: (prism(bm, smooth([(-0.3, 0.068, 1), (-0.13, 0.066, 1), (-0.11, 0.074), (-0.13, 0.083), (-0.3, 0.085, 1)], 2), 0.034)), "polymer", 0.006, 3)
    g.part("pad", lambda bm: prism(bm, smooth([(-0.372, 0.072, 1), (-0.398, 0.07), (-0.4, -0.094), (-0.374, -0.096, 1)], 1), 0.052), "rubber", 0.007, 3)
    g.part("magazine", lambda bm: (box(bm, 0.07, 0.15, -0.004, 0.034, 0.032), box(bm, 0.066, 0.154, -0.009, -0.003, 0.036)), "parker", 0.0015)
    g.part("guard", lambda bm: prism(bm, smooth([(0.0, 0.006, 1), (0.068, 0.006, 1), (0.066, -0.008), (0.05, -0.016), (0.012, -0.016), (0.0, -0.006)], 1), 0.012), "parker", 0.0012,
           cut=lambda bm: prism(bm, smooth([(0.008, 0.007, 1), (0.06, 0.007, 1), (0.058, -0.004), (0.046, -0.01), (0.014, -0.01), (0.008, -0.002)], 1), 0.03))
    g.part("trigger", lambda bm: prism(bm, smooth([(0.03, 0.006, 1), (0.036, 0.006, 1), (0.034, -0.004), (0.028, -0.01, 1), (0.026, -0.006)], 1), 0.005), "steel", 0.0004)
    g.part("bipod", lambda bm: (box(bm, 0.52, 0.56, 0.018, 0.032, 0.03), [tube(bm, (0.54, s * 0.012, 0.016), (0.32, s * 0.012, 0.012), 0.0045, seg=12) for s in (1, -1)], [sphere(bm, (0.32, s * 0.012, 0.012), 0.006, 10) for s in (1, -1)]), "parker", 0.001)
    g.part("studs", lambda bm: [lathe(bm, [(0, 0.008), (0.004, 0.008)], (x, -0.002, z), (0, 1, 0), 16, cap=False) for x, z in ((-0.28, -0.098), (0.59, 0.02))], "steel")
    # the scope: the eyepiece's rubber, the power ring (knurled), the tube, the saddle and its
    # turrets, the objective bell and the sunshade; the lenses; the rings on the rail
    def scope(bm):
        lathe(bm, [(0, 0), (0, 0.0175), (0.004, 0.0195), (0.028, 0.0195), (0.034, 0.0172), (0.04, 0.0135), (0.29, 0.0127), (0.33, 0.016), (0.36, 0.0255), (0.44, 0.0255), (0.44, 0.0)], (-0.12 + DX, 0, SZ), X, 48)

    g.part("scope", scope, "blued", 0.0004)
    g.part("eyecup", lambda bm: lathe(bm, [(0, 0.0185), (0, 0.021), (0.022, 0.021), (0.022, 0.0185)], (-0.124 + DX, 0, SZ), X, 40, cap=False), "rubber")
    g.part("power", lambda bm: lathe(bm, [(0, 0.0165), (0, 0.0182), (0.02, 0.0182), (0.02, 0.0165)], (-0.09 + DX, 0, SZ), X, 40, cap=False), "parker", check=(-1, 1, -1, 1))
    g.part("saddle", lambda bm: (prism(bm, smooth([(0.07 + DX, SZ - 0.016, 1), (0.13 + DX, SZ - 0.016, 1), (0.135 + DX, SZ), (0.13 + DX, SZ + 0.016, 1), (0.07 + DX, SZ + 0.016, 1), (0.065 + DX, SZ)], 1), 0.03)), "blued", 0.003)
    for nm, at, d in (("turret-top", (0.1 + DX, 0, SZ + 0.014), (0, 0, 1)), ("turret-side", (0.1 + DX, -0.014, SZ), (0, -1, 0)), ("turret-left", (0.1 + DX, 0.014, SZ), (0, 1, 0))):
        g.part(nm, lambda bm, at=at, d=d: lathe(bm, [(0, 0), (0, 0.0105), (0.008, 0.0105), (0.009, 0.0128), (0.022, 0.0128), (0.024, 0.0115), (0.024, 0)], at, d, 32), "parker", 0.0004, check=(-1, 1, -1, 1))
    g.part("lens-front", lambda bm: lathe(bm, [(0, 0.0), (0.002, 0.0235), (0.0, 0.0235)], (0.317 + DX, 0, SZ), X, 40), "coated")
    g.part("lens-rear", lambda bm: lathe(bm, [(0, 0.0), (-0.001, 0.0165), (0.0, 0.0165)], (-0.118 + DX, 0, SZ), X, 32), "coated")
    for x in (0.0 + DX, 0.18 + DX):
        g.part(f"ring{x}", lambda bm, x=x: (lathe(bm, [(0, 0.0127), (0, 0.017), (0.018, 0.017), (0.018, 0.0127)], (x, 0, SZ), X, 36, cap=False), box(bm, x, x + 0.018, BZ + 0.026, SZ - 0.012, 0.016)), "blued", 0.0008)
        for s in (1, -1):
            screw(g, f"ring-screw{x}{s}", (x + 0.009, s * 0.0085, SZ + 0.0115), 0.0018, (0, s * 0.5, 1))
    g.point("grip", (0, 0, 0))
    g.point("muzzle", (0.88, 0, BZ))
    g.point("rear", (-0.124 + DX, 0, SZ))
    g.point("front", (0.32 + DX, 0, SZ))
    g.point("fore", (0.36, 0, 0.03))
    g.point("butt", (-0.39, 0, -0.005))
    return g


# ── the Daybreak (F7): ours — a lighthouse's lamp made a gun. Navy enamel and brass; a Fresnel lens
# of stepped glass round a warm core, in a brass cage; cooling fins behind; a cell of light slotted in
# underneath, its filament showing, copper lines running from it to the lamp; a gauge; a carry handle.
# (Nothing of Doom's BFG: no green, no plasma rifle's muzzle, no ball-then-rays.) ──────────────────
def daybreak():
    g = Gun("daybreak")
    AZ = 0.115
    X = Vector((1, 0, 0))
    g.part("body", lambda bm: lathe(bm, [(0, 0), (0, 0.05), (0.01, 0.055), (0.41, 0.055), (0.42, 0.058), (0.42, 0)], (-0.02, 0, AZ), X, 48), "enamel",
           cut=lambda bm: [box(bm, 0.03 + i * 0.022, 0.042 + i * 0.022, AZ + 0.045, AZ + 0.07, 0.03, y=s * 0.03) for i in range(5) for s in (1, -1)])
    def bands(bm):
        for x in (0.0, 0.13, 0.27, 0.39):
            lathe(bm, [(0, 0.055), (0, 0.06), (0.012, 0.06), (0.012, 0.055)], (x - 0.006, 0, AZ), X, 48, cap=False)

    g.part("bands", bands, "brass", 0.0008)
    g.part("rivets", lambda bm: [sphere(bm, (x, math.cos(a) * 0.0605, AZ + math.sin(a) * 0.0605), 0.0018, 8) for x in (0.0, 0.13, 0.27, 0.39) for a in (i / 12 * math.tau for i in range(12))], "brass")
    g.part("collar", lambda bm: lathe(bm, [(0, 0.056), (0, 0.062), (0.03, 0.075), (0.042, 0.077), (0.045, 0.071), (0.045, 0.06)], (0.4, 0, AZ), X, 48, cap=False), "brass", 0.0008)
    # the Fresnel lens: flat behind, stepped rings in front
    rad = [0.066, 0.053, 0.04, 0.027, 0.014, 0.0]
    prof = [(0.0, 0.0), (0.0, 0.066)]
    for k in range(5):
        prof += [(0.006, rad[k]), (0.012 + 0.003 * k, rad[k + 1] + 0.0004)]
    prof.append((0.024, 0.0))
    g.part("lens", lambda bm: lathe(bm, prof, (0.445, 0, AZ), X, 48), "glass")
    g.part("core", lambda bm: sphere(bm, (0.45, 0, AZ), 0.026, 24), "glow")
    g.part("cage", lambda bm: ([tube(bm, (0.445, math.cos(a) * 0.072, AZ + math.sin(a) * 0.072), (0.53, math.cos(a) * 0.062, AZ + math.sin(a) * 0.062), 0.0032, seg=8) for a in (i / 8 * math.tau for i in range(8))],
                               lathe(bm, [(0, 0.058), (0, 0.066), (0.008, 0.066), (0.008, 0.058)], (0.53, 0, AZ), X, 48, cap=False)), "brass", 0.0006)
    # the fins, the spine behind them; the brace and its leather pad
    g.part("fins", lambda bm: [lathe(bm, [(0, 0.03), (0, 0.072), (0.0035, 0.072), (0.0035, 0.03)], (-0.03 - i * 0.016, 0, AZ), X, 40, cap=False) for i in range(7)], "brass", 0.0006)
    g.part("spine", lambda bm: tube(bm, (-0.16, 0, AZ), (-0.02, 0, AZ), 0.03, seg=32), "enamel")
    brace = smooth([(-0.16, AZ - 0.03, 1), (-0.16, AZ + 0.03, 1), (-0.3, AZ + 0.012), (-0.335, AZ - 0.01, 1), (-0.335, AZ - 0.115, 1), (-0.3, AZ - 0.12), (-0.21, AZ - 0.075)], 2)
    g.part("brace", lambda bm: prism(bm, brace, 0.044), "enamel", 0.008, 4)
    g.part("brace-pad", lambda bm: prism(bm, smooth([(-0.334, AZ - 0.008, 1), (-0.356, AZ - 0.012), (-0.358, AZ - 0.114), (-0.334, AZ - 0.118, 1)], 2), 0.054), "leather", 0.008, 4)
    # the cell: brass, a glass window round its middle, the filament coil inside, knurled ends
    g.part("cell", lambda bm: (lathe(bm, [(0, 0), (0, 0.02), (0.004, 0.024), (0.07, 0.024), (0.07, 0.0)], (0.1, 0, 0.04), X, 32), lathe(bm, [(0, 0), (0, 0.024), (0.066, 0.024), (0.07, 0.02), (0.07, 0)], (0.23, 0, 0.04), X, 32)), "brass", 0.0006)
    g.part("cell-glass", lambda bm: lathe(bm, [(0, 0.022), (0.06, 0.022)], (0.17, 0, 0.04), X, 32, cap=False), "glass")
    g.part("filament", lambda bm: sweep(bm, [Vector((0.172 + 0.056 * t / 160, math.cos(t / 10) * 0.012, 0.04 + math.sin(t / 10) * 0.012)) for t in range(161)], ring_section(0.0012, 6), up=(1, 0, 0)), "glow")
    g.part("cell-mount", lambda bm: prism(bm, smooth([(0.095, 0.05, 1), (0.305, 0.05, 1), (0.29, AZ - 0.045), (0.11, AZ - 0.045)], 1), 0.03), "enamel", 0.003)
    # the copper lines, from the cell's ends to the collar
    for s in (1, -1):
        g.part(f"line{s}", lambda bm, s=s: sweep(bm, spline([(0.3, s * 0.02, 0.05), (0.34, s * 0.04, 0.07), (0.38, s * 0.058, AZ - 0.02), (0.405, s * 0.06, AZ - 0.0)], 10), ring_section(0.0035), up=(0, 0, 1)), "copper")
    # the gauge on top: its bezel, its face, its needle, its glass
    gz = AZ + 0.055
    g.part("gauge", lambda bm: lathe(bm, [(0, 0), (0, 0.02), (0.012, 0.021), (0.014, 0.018), (0.014, 0)], (0.31, 0, gz - 0.002), (0, 0, 1), 32), "brass", 0.0004)
    g.part("dial", lambda bm: lathe(bm, [(0, 0), (0, 0.0175), (0.0004, 0.0175), (0.0004, 0)], (0.31, 0, gz + 0.0115), (0, 0, 1), 32), "dial")
    g.part("needle", lambda bm: box(bm, 0.3, 0.318, gz + 0.012, gz + 0.0128, 0.0016, M=Matrix.Translation((0.31, 0, 0)) @ Matrix.Rotation(0.6, 4, "Z") @ Matrix.Translation((-0.31, 0, 0))), "dark")
    # the grips (walnut, the front one leather-wrapped), the guard, the trigger; the handle; the sight
    g.part("grip", lambda bm: prism(bm, smooth([(-0.012, 0.042, 1), (0.03, 0.042, 1), (0.02, -0.03), (0.012, -0.075), (-0.016, -0.08), (-0.03, -0.072), (-0.022, -0.03)], 2), 0.032), "walnut", 0.008, 4, check=(-0.04, 0.04, -0.08, 0.02))
    g.part("grip-mount", lambda bm: box(bm, -0.022, 0.044, 0.035, AZ - 0.045, 0.03), "enamel", 0.003)
    g.part("fore-grip", lambda bm: prism(bm, smooth([(0.322, 0.062, 1), (0.37, 0.062, 1), (0.366, 0.0), (0.36, -0.032), (0.33, -0.034), (0.324, 0.0)], 2), 0.032), "leather", 0.009, 4)
    g.part("guard", lambda bm: prism(bm, smooth([(0.06, 0.04, 1), (0.06, 0.018), (0.046, 0.004), (0.016, 0.002), (0.0, 0.012), (-0.004, 0.04, 1)], 1), 0.01), "brass", 0.0012, cut=lambda bm: prism(bm, smooth([(0.053, 0.043, 1), (0.053, 0.02), (0.042, 0.01), (0.018, 0.008), (0.006, 0.016), (0.004, 0.043, 1)], 1), 0.03))
    g.part("trigger", lambda bm: prism(bm, smooth([(0.028, 0.04, 1), (0.034, 0.04, 1), (0.032, 0.026), (0.025, 0.016, 1), (0.024, 0.02)], 1), 0.006), "brass", 0.0005)
    g.part("handle", lambda bm: sweep(bm, spline([(0.13, 0, AZ + 0.05), (0.15, 0, AZ + 0.1), (0.25, 0, AZ + 0.1), (0.27, 0, AZ + 0.05)], 10), ring_section(0.0075, 12), up=(0, 1, 0)), "leather", 0.0)
    g.part("sight", lambda bm: (lathe(bm, [(0, 0.012), (0, 0.016), (0.003, 0.016), (0.003, 0.012)], (0.04, 0, AZ + 0.083), X, 32, cap=False), tube(bm, (0.04, 0, AZ + 0.055), (0.04, 0, AZ + 0.068), 0.0035, seg=10),
                                tube(bm, (0.12, 0, AZ + 0.055), (0.12, 0, AZ + 0.088), 0.0018, seg=8), sphere(bm, (0.12, 0, AZ + 0.088), 0.0025, 10)), "brass", 0.0004)
    g.point("grip", (0, 0, 0))
    g.point("muzzle", (0.535, 0, AZ))
    g.point("rear", (0.04, 0, AZ + 0.083))
    g.point("front", (0.12, 0, AZ + 0.088))
    g.point("fore", (0.345, 0, 0.02))
    g.point("butt", (-0.35, 0, AZ - 0.065))
    return g


# ── a speedloader (plan 80: the revolver's reload): six rounds held in a black body by their rims, a
# knurled knob behind it — turned, it lets them go. Along +x (the rounds' noses), its knob at −x ───────
def speedloader():
    g = Gun("speedloader")
    X = Vector((1, 0, 0))
    g.part("body", lambda bm: lathe(bm, [(0, 0), (0, 0.0205), (0.002, 0.0215), (0.016, 0.0215), (0.018, 0.0195), (0.018, 0)], (-0.018, 0, 0), X, 36), "polymer", 0.0008)
    g.part("knob", lambda bm: lathe(bm, [(0, 0), (0, 0.0085), (0.011, 0.0085), (0.0125, 0.006), (0.0125, 0)], (-0.0305, 0, 0), X, 24), "steel", check=(-1, 1, -1, 1))
    g.part("stem", lambda bm: tube(bm, (-0.031, 0, 0), (-0.017, 0, 0), 0.0035, seg=12), "steel")
    for i in range(6):
        a = i / 6 * math.tau
        c = (0.0, math.cos(a) * 0.0133, math.sin(a) * 0.0133)
        g.part(f"round{i}", lambda bm, c=c: lathe(bm, [(0, 0), (0, 0.0048), (0.001, 0.0048), (0.001, 0.0045), (0.033, 0.0045), (0.033, 0)], Vector(c), X, 14), "brass")
        g.part(f"nose{i}", lambda bm, c=c: lathe(bm, [(0, 0.0044), (0.004, 0.0043), (0.009, 0.0025), (0.011, 0)], Vector(c) + Vector((0.033, 0, 0)), X, 14, cap=False), "lead")
    g.point("grip", (-0.024, 0, 0))
    g.point("front", (0.044, 0, 0))
    return g


# ── the revolver's holster (plan 80 phase 2): an open-top leather pouch for the right hip, moulded to the
# 4-inch .357 — its barrel, underlug, cylinder and trigger guard inside, the grip and the hammer out —, a
# backing panel against the hip with a belt loop over the top, a seam along its edge. In the revolver's
# own frame (+x the barrel, +y its left, +z up): the gun sits in it as it is, its grip point at the
# origin ─────────────────────────────────────────────────────────────────────────────────────────────
def holster():
    g = Gun("holster")
    # moulded to it: round the cylinder and the guard (5 cm across: the mouth, cut down at the back for the
    # grip), then the barrel's section (3.4 cm), past the muzzle and over the front sight
    cyl = smooth([(-0.004, 0.044, 1), (0.004, 0.012, 1), (0.05, 0.01), (0.082, 0.03, 1), (0.082, 0.097, 1), (0.024, 0.098), (0.006, 0.084, 1)], 2)
    g.part("pouch", lambda bm: prism(bm, cyl, 0.05), "leather", 0.008, 4)
    bar = smooth([(0.07, 0.034, 1), (0.182, 0.036, 1), (0.19, 0.06), (0.184, 0.104, 1), (0.13, 0.102), (0.07, 0.099, 1)], 2)
    g.part("sleeve", lambda bm: prism(bm, bar, 0.034), "leather", 0.007, 4)
    # the seam's welt along the bottom edge
    welt = smooth([(0.006, 0.013, 1), (0.05, 0.011), (0.08, 0.03), (0.18, 0.036, 1), (0.186, 0.042, 1), (0.08, 0.036), (0.05, 0.018), (0.01, 0.02, 1)], 1)
    g.part("welt", lambda bm: prism(bm, welt, 0.03, y=0.006), "leather", 0.002, 2)
    # the backing panel against the hip, up past the mouth to the belt, and the loop the belt runs through
    back = smooth([(-0.03, 0.03, 1), (0.12, 0.03, 1), (0.12, 0.112, 1), (0.03, 0.15, 1), (-0.03, 0.15, 1)], 2)
    g.part("back", lambda bm: prism(bm, back, 0.006, y=0.03), "leather", 0.002, 2)
    g.part("loop", lambda bm: (box(bm, -0.025, 0.035, 0.1, 0.152, 0.006, y=0.039), box(bm, -0.025, 0.035, 0.146, 0.152, 0.018, y=0.033)), "leather", 0.0015, 2)
    g.point("grip", (0, 0, 0))
    return g


# ── the speedloader's pouch (plan 80 F5a): on the belt at the right hip's front, a leather box a loader fits
# upright in, its flap over the top snapped down at the front, a backing panel and a belt loop against her
# (+y). `top` where the hand goes in for it ──────────────────────────────────────────────────────────
def pouch():
    g = Gun("pouch")
    body = smooth([(-0.031, 0.0, 1), (0.031, 0.0, 1), (0.033, 0.058, 1), (-0.033, 0.058, 1)], 2)
    g.part("body", lambda bm: prism(bm, body, 0.05), "leather", 0.006, 3)
    g.part("flap", lambda bm: (box(bm, -0.034, 0.034, 0.057, 0.064, 0.056, y=0.001), box(bm, -0.03, 0.03, 0.036, 0.064, 0.005, y=-0.0265)), "leather", 0.002, 2)
    g.part("snap", lambda bm: lathe(bm, [(0, 0), (0, 0.004), (0.0015, 0.0035), (0.002, 0)], (0, -0.029, 0.044), Vector((0, -1, 0)), 14), "nickel")
    back = smooth([(-0.036, -0.004, 1), (0.036, -0.004, 1), (0.036, 0.085, 1), (-0.036, 0.085, 1)], 1)
    g.part("back", lambda bm: prism(bm, back, 0.005, y=0.0275), "leather", 0.0015, 2)
    g.point("top", (0, 0, 0.066))
    return g


# ── the torch (the left hand's, F6): an aluminium flashlight, knurled ────────────────────────────
def torch():
    g = Gun("torch")
    X = Vector((1, 0, 0))
    g.part("body", lambda bm: lathe(bm, [(0, 0), (0, 0.012), (0.004, 0.0135), (0.012, 0.0135), (0.014, 0.0128), (0.11, 0.0128), (0.125, 0.0195), (0.16, 0.0205), (0.162, 0.0185), (0.162, 0)], (-0.06, 0, 0), X, 32), "torch", 0.0004, check=(-0.04, 0.04, -1, 1))
    g.part("lens", lambda bm: lathe(bm, [(0, 0), (0.0, 0.0175), (0.002, 0.0175), (0.002, 0)], (0.1, 0, 0), X, 32), "lens")
    g.part("clip", lambda bm: box(bm, -0.04, 0.02, 0.0125, 0.0145, 0.006), "steel", 0.0006)
    g.point("grip", (0, 0, 0))
    g.point("muzzle", (0.102, 0, 0))
    return g


BUILD = {"revolver": revolver, "shotgun": shotgun, "ak47": ak47, "sniper": sniper, "daybreak": daybreak, "speedloader": speedloader, "holster": holster, "pouch": pouch}
LONG = {"shotgun", "ak47", "sniper", "daybreak"}

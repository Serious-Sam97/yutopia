# Plan 92 — a road car dressed: its shell (bodies.py) with glass, lamps, grille, bumpers, trims, mirrors,
# wipers, plates and badges outside; the cabin and the engine bay inside; the wheels; and the points the game
# needs (seats, the eye, the lamps, the exhausts, the add-ons' sockets). `dress(spec, variant)` → a Car.
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import bodies
import kit
import parts
from bodies import dedupe, dlo, eroded_top

S = 1  # (the left: +y)


class Car:
    def __init__(self, b, v):
        self.b = b
        self.v = v
        self.points = {}  # name → (x, y, z)
        self.pivots = {}  # group → {"at": (x,y,z), "axis": (x,y,z), "in": parent group}
        self.objs = []

    def pt(self, name, p):
        self.points[name] = tuple(round(c, 4) for c in p)

    def pivot(self, grp, at, axis=(0, 0, 1), parent="body", **extra):
        self.pivots[grp] = dict(at=tuple(round(c, 4) for c in at), axis=tuple(round(c, 4) for c in axis), parent=parent, **extra)


def sweep(name, path, prof, kind, grp="body", closed=False):
    """A profile (u out, v up) swept along a plan path [(x, y, z)…]: the u axis along the path's outward
    normal (to the left of travel for a path drawn round the car clockwise seen from above)."""
    path = [Vector(p) for p in path]
    n = len(prof)
    verts, faces = [], []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)])
        t.z = 0
        t.normalize()
        nrm = Vector((t.y, -t.x, 0))
        for u, v in prof:
            verts.append(p + nrm * u + Vector((0, 0, v)))
    m = len(path)
    for i in range(m - 1):
        for k in range(n):
            a, c = i * n + k, i * n + (k + 1) % n
            faces.append((a, c, c + n, a + n))
    faces.append(tuple(range(n)))
    faces.append(tuple(range((m - 1) * n + n - 1, (m - 1) * n - 1, -1)))
    o = kit.mk(name, verts, faces, kind, grp, smooth=True, angle=45)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def end_path(b, front, wrap, out, z, n=24):
    """A plan path round the nose (or the tail): from the left side `wrap` m back from the end, round the
    corner, across, round the other corner — `out` m off the skin, at height z."""
    pts = []
    L = b.L
    s_end = 0.0 if front else L
    sgn = 1 if front else -1
    # along the left side → corner → across → right
    ss = [s_end + (wrap - wrap * i / 8) * sgn for i in range(8)]
    left = [(b.x(s), b.hw(s) + out, z) for s in ss]
    ys = [b.hw(s_end) * (1 - 2 * i / n) for i in range(n + 1)]
    across = [(b.x(s_end) + sgn * (0.02 + out), y, z) for y in ys]
    right = [(x, -y, z) for x, y, z in reversed(left)]
    pts = left + across + right
    # (drawn left → right round the nose, the outward normal is to the left of travel: flip for the tail)
    return pts if front else pts[::-1]


def plan_path(b, front, wrap, n_side=10, n_across=16, across_out=0.012):
    """The plan's outline round an end at the bumper (its round corners and its bow): from the left side `wrap`
    m back, round the corner, across, to the right — [(x, y)…] and each point's outward normal."""
    sgn = 1 if front else -1
    s_end = 0.0 if front else b.L
    side = []
    for i in range(n_side + 1):
        t = i / n_side
        s = s_end + sgn * wrap * (1 - t) ** 1.7  # (closer into the corner)
        y = b.hw(s)
        side.append((b.x(s) + b.bow(s, y), y))
    hw0 = b.hw(s_end)
    across = []
    for i in range(1, n_across + 1):
        y = hw0 * (1 - i / n_across)
        e = min(1.0, (hw0 - y) / 0.12)
        across.append((b.x(s_end) + sgn * across_out * e * e * (3 - 2 * e) + b.bow(s_end, y), y))
    left = side + across
    pts = left + [(x, -y) for x, y in reversed(left[:-1])]
    # the outward normals: square to the path, away from a point well inside the car
    inside = Vector((b.x(s_end) - sgn * 1.2, 0.0))
    nrms = []
    for i in range(len(pts)):
        a, c = Vector(pts[max(0, i - 1)]), Vector(pts[min(len(pts) - 1, i + 1)])
        t = (c - a).normalized()
        n = Vector((t.y, -t.x))
        if n.dot(Vector(pts[i]) - inside) < 0:
            n = -n
        nrms.append(n)
    return pts, nrms


def sweep_plan(name, pts, nrms, prof, z0, kind, grp="body", taper=0, smooth_angle=50):
    """A closed profile (u out along the plan's normal, v up from z0) swept along a plan path; with `taper`, its
    last points at each end drawn in toward the skin and narrowed (a bumper's end rolled into the body)."""
    m, k = len(pts), len(prof)
    vc = sum(v for _, v in prof) / k
    verts, faces = [], []
    for i, ((x, y), n) in enumerate(zip(pts, nrms)):
        f = 1.0
        if taper:
            e = min(i, m - 1 - i)
            if e < taper:
                f = 0.3 + 0.7 * math.sin(math.pi / 2 * (e + 0.5) / taper)
        for u, v in prof:
            uu = u * f if u > 0 else u
            vv = vc + (v - vc) * (0.55 + 0.45 * f)
            verts.append((x + n.x * uu, y + n.y * uu, z0 + vv))
    for i in range(m - 1):
        for j in range(k):
            a, c = i * k + j, i * k + (j + 1) % k
            faces.append((a, c, c + k, a + k))
    faces.append(tuple(range(k)))
    faces.append(tuple(range((m - 1) * k + k - 1, (m - 1) * k - 1, -1)))
    o = kit.mk(name, verts, faces, kind, grp, smooth=True, angle=smooth_angle)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def _cut(pts, nrms, keep):
    """The runs of a path whose points pass keep(i, (x, y)) — each run its own (pts, nrms)."""
    runs, cur = [], []
    for i, p in enumerate(pts):
        if keep(i, p):
            cur.append(i)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [([pts[i] for i in r], [nrms[i] for i in r]) for r in runs if len(r) >= 2]


BUMPER_FACE = 0.086  # (the bumper's face off the plan's outline: the front plate sits on it)


def bumper_wrap(b, front, want):
    """How far a bumper may wrap down a side: short of the arch."""
    if front:
        room = b.arches[0][0] - b.arches[0][1]
    else:
        room = b.L - (b.arches[-1][0] + b.arches[-1][1])
    return max(0.08, min(want, room - 0.05))


def bumper(c, b, front, style, grp):
    """An 80s bumper (quality pass 2): a shaped beam wrapping round the corners and rolling into the sides, a
    rubber rub strip along its face, end caps (black on a chrome one); a painted one with its air dam, its
    mouth, its lip. Under the front, a valance."""
    near = parts.NEAR
    paint = style == "paint"
    z0 = b.bumper_z - (0.05 if paint and front else 0.0)
    h = 0.21 if paint else 0.16
    wrap = bumper_wrap(b, front, 0.42 if paint else 0.32)
    pts, nrms = plan_path(b, front, wrap, n_side=10 if near else 4, n_across=16 if near else 6)
    F = BUMPER_FACE
    if near:
        prof = [(-0.04, 0.012), (0.0, 0.0), (0.05, 0.004), (0.072, 0.022), (F - 0.004, 0.05), (F, 0.085 * h / 0.16), (F - 0.002, 0.118 * h / 0.16), (F - 0.01, 0.142 * h / 0.16), (0.055, h - 0.003), (0.0, h + 0.002), (-0.04, h - 0.005)]
    else:
        prof = [(-0.04, 0.01), (0.04, 0.0), (F - 0.004, 0.04), (F, h * 0.7), (0.05, h), (-0.04, h - 0.005)]
    kind = {"black": "trim", "chrome": "chrome", "paint": "paint"}[style]
    obs = []
    hw0 = b.hw(0.0 if front else b.L)
    if style == "chrome":
        # (the chrome blade across; its ends black caps)
        cap_y = hw0 - 0.1
        for run in _cut(pts, nrms, lambda i, p: abs(p[1]) <= cap_y + 0.02 and i > 0 and i < len(pts) - 1):
            obs.append(sweep_plan(f"bumper.{front}", run[0], run[1], prof, z0, "chrome", grp))
        for run in _cut(pts, nrms, lambda i, p: abs(p[1]) >= cap_y):
            obs.append(sweep_plan(f"bumper.cap.{front}", run[0], run[1], [(u + 0.002, v) for u, v in prof], z0, "trim", grp, taper=3 if near else 1))
    else:
        obs.append(sweep_plan(f"bumper.{front}", pts, nrms, prof, z0, kind, grp, taper=3 if near else 1))
    # the rub strip along its face (interrupted by the front plate)
    vs = 0.072 if not paint else 0.135  # (a painted one's strip over its fog lamps)
    strip = [(F - 0.003, vs), (F + 0.008, vs + 0.004), (F + 0.011, vs + 0.017), (F + 0.008, vs + 0.03), (F - 0.003, vs + 0.034)]
    sk = "rubber" if style != "paint" else "trim"
    if near:
        for run in _cut(pts, nrms, lambda i, p: (not front or abs(p[1]) > 0.235) and 2 <= i <= len(pts) - 3):
            obs.append(sweep_plan(f"bstrip.{front}", run[0], run[1], strip, z0, sk, grp, taper=2 if near else 0))
    if paint and front:
        # the air dam: its mouth (a dark slot across), a lip under it
        mouth = [(F - 0.03, 0.04), (F + 0.001, 0.038), (F + 0.002, 0.075), (F - 0.03, 0.077)]
        for run in _cut(pts, nrms, lambda i, p: abs(p[1]) < min(0.32, hw0 - 0.3)):
            obs.append(sweep_plan("dam.mouth", run[0], run[1], mouth, z0, "gloss", grp))
        lip = [(0.02, -0.002), (F - 0.012, -0.01), (F - 0.004, 0.006), (0.04, 0.012)]
        for run in _cut(pts, nrms, lambda i, p: abs(p[1]) < hw0 - 0.05):
            obs.append(sweep_plan("dam.lip", run[0], run[1], lip, z0, "trim", grp))
    if front and not paint:
        # the valance under it: the body's colour under chrome, black under black
        val = [(-0.1, 0.012), (-0.03, 0.006), (-0.006, -0.026), (-0.016, -0.05), (-0.1, -0.045)] if near else [(-0.1, 0.01), (-0.006, -0.026), (-0.1, -0.045)]
        for run in _cut(pts, nrms, lambda i, p: abs(p[1]) < hw0 - 0.08):
            obs.append(sweep_plan("valance", run[0], run[1], val, z0, "paint" if style == "chrome" else "trim", "body", taper=2 if near else 0))
    return obs


def bumper_face_x(b, y, front=True):
    """Where a bumper's face is at y (across its middle): for the plate, the fog lamps."""
    s_end = 0.0 if front else b.L
    sgn = 1 if front else -1
    hw0 = b.hw(s_end)
    e = min(1.0, max(0.0, (hw0 - abs(y)) / 0.12))
    return b.x(s_end) + sgn * (0.012 * e * e * (3 - 2 * e) + BUMPER_FACE) + b.bow(s_end, y)


def side_glass(car, s0, s1, side, grp, kind="glass", inset=0.06):
    """A side window's glass between s0 and s1 (on the greenhouse's tumbled side) and its surround."""
    b = car.b
    poly = dlo(b, s0, s1, inset=inset)
    pane = [(b.x(s), side * (b.gh_hw(z) - 0.012), z) for s, z in poly]
    g = parts.glass_pane(f"glass.{grp}.{s0:.2f}", pane, kind, grp)
    if not parts.NEAR:
        return [g]
    trim_kind = "chrome" if car.v.get("chrome") else "rubber"
    edge = [(b.x(s), side * (b.gh_hw(z) - 0.004), z) for s, z in kit.offset_poly(poly, 0.006)]
    t = parts.outline_tube(f"wtrim.{grp}.{s0:.2f}", edge, 0.0055, trim_kind, grp, n=4)
    return [g, t]


def slope_glass(car, quad, name, kind="glass", grp="body"):
    """The windscreen (or a back light): its pane bent as the greenhouse's corners were, its rubber round it."""
    b = car.b
    c = sum((Vector(p) for p in quad), Vector()) / 4
    nrm = (Vector(quad[1]) - Vector(quad[0])).cross(Vector(quad[2]) - Vector(quad[0])).normalized()
    if nrm.dot(Vector((c.x, 0, 0)).normalized() if abs(c.x) > 1e-3 else Vector((1, 0, 0))) < 0:
        nrm = -nrm
    grown = []
    for p in quad:
        d = Vector(p) - c
        grown.append(Vector(p) + d.normalized() * 0.018 - nrm * 0.008)
    rounded = round3(grown, 0.05)
    pane = parts.glass_pane(name, rounded, kind, grp)
    if not parts.NEAR:
        rounded = None
    if kind == "glass_ws":
        # (its UVs by height: the sun band's across the top)
        me = pane.data
        zs = [v.co.z for v in me.vertices]
        z0, z1 = min(zs), max(zs)
        uv = me.uv_layers.new(name="UVMap")
        for p in me.polygons:
            for li in p.loop_indices:
                z = me.vertices[me.loops[li].vertex_index].co.z
                uv.data[li].uv = (0.5, (z - z0) / max(1e-4, z1 - z0))
    if rounded is None:
        return [pane]
    rub = parts.outline_tube(name + ".rubber", [Vector(p) + (Vector(p) - c).normalized() * 0.006 + nrm * 0.002 for p in rounded], 0.009, "chrome" if car.v.get("chrome") else "rubber", grp)
    return [pane, rub]


def round3(pts, r, n=3):
    """A 3D loop's corners rounded."""
    out = []
    m = len(pts)
    for i in range(m):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % m])
        a, bb = (p0 - p1).normalized(), (p2 - p1).normalized()
        k = min(r, (p0 - p1).length * 0.4, (p2 - p1).length * 0.4)
        s0, s1 = p1 + a * k, p1 + bb * k
        for j in range(n + 1):
            t = j / n
            out.append(s0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + s1 * t * t)
    return out


def badge(name, text, at, size, normal, grp="body", kind="chrome"):
    """A badge's letters at `at`, facing `normal` (+x the nose, −x the tail, ±y a side)."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = text
    cu.size = size
    cu.extrude = 0.0025
    cu.resolution_u = 3  # (quality pass 2: the letters' curves coarser — a third of the triangles, the same at a metre)
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    o = bpy.data.objects.new(name, cu)
    kit.coll().objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    bpy.data.curves.remove(cu)
    # letters lie in x–y facing +z: stand them up to face `normal`
    R = {
        "x": Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Rotation(math.pi / 2, 4, "Z"),
        "-x": Matrix.Rotation(-math.pi / 2, 4, "Y") @ Matrix.Rotation(-math.pi / 2, 4, "Z"),
    }[normal]
    me.transform(Matrix.Translation(Vector(at)) @ R)
    return kit.obj(name, me, kind, grp, smooth=False)


def clear_spans(b, s0, s1, zlo, margin=0.035):
    """[s0, s1] with the wheel arches' openings at height zlo taken out: the spans a side strip can run on."""
    spans = [(s0, s1)]
    for sa, ra in b.arches:
        dz = zlo - b.arch_z
        if dz >= ra + margin:
            continue
        half = math.sqrt(max(0.0, (ra + margin) ** 2 - dz * dz))
        a0, a1 = sa - half, sa + half
        nxt = []
        for p0, p1 in spans:
            if a1 <= p0 or a0 >= p1:
                nxt.append((p0, p1))
                continue
            if a0 > p0:
                nxt.append((p0, a0))
            if a1 < p1:
                nxt.append((a1, p1))
        spans = nxt
    return [(p0, p1) for p0, p1 in spans if p1 - p0 > 0.06]


def retint(o, pred, kind):
    """The faces of `o` whose centres pass `pred` split off into a new object of another material."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    take = [f for f in bm.faces if pred(f.calc_center_median())]
    if not take:
        bm.free()
        return None
    keep = [f for f in bm.faces if f not in set(take)]
    bm2 = bm.copy()
    bmesh.ops.delete(bm, geom=take, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    dead = [f for f in bm2.faces if not pred(f.calc_center_median())]
    bmesh.ops.delete(bm2, geom=dead, context="FACES")
    me = bpy.data.meshes.new(o.name + "." + kind)
    bm2.to_mesh(me)
    bm2.free()
    n = kit.obj(o.name + "." + kind, me, kind, o["grp"], smooth=False)
    return n


def nose_layout(b, v):
    """Where the lamps and the grille sit on the nose (quality pass 2): [(kind, y, z, w, h, r, yaw)] — each a
    recess cut in the shell (bodies.cut_panels: `holes`) with its part set in it; `yaw` turns a lamp to follow
    the nose's bow."""
    lz = b.lamp_z
    hw0 = b.hw(0.0)
    ly = hw0 - 0.19

    def yaw(y, w):
        y0, y1 = y - w / 2, y + w / 2
        return -math.atan2(b.bow(0.0, y1) - b.bow(0.0, y0), y1 - y0)

    out = []
    head = v["head"]
    for side in (1, -1):
        y = side * ly
        if head == "rect":
            out.append(("head", y, lz, 0.28, 0.14, 0.012, yaw(y, 0.28)))
        elif head == "quad":
            out.append(("quad", y, lz, 0.4, 0.19, 0.02, yaw(y, 0.4)))
        else:
            out.append(("round", y, lz, 0.19, 0.19, 0.095, yaw(y, 0.19)))
    gw = max(0.18, ly - {"rect": 0.175, "quad": 0.245, "round": 0.14}[head])
    gz0, gz1 = lz - 0.09, lz + 0.08
    out.append(("grille", 0.0, (gz0 + gz1) / 2, gw * 2, gz1 - gz0, 0.01, 0.0))
    return out


# ── the car ────────────────────────────────────────────────────────────────────────────────────────────────


def dress(spec, v, lod="near"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.MATS.clear()
    near = lod == "near"
    kit.SEG = 1.0 if near else (0.5 if lod == "mid" else 0.35)
    bodies.STEP = 1.0 if near else 3.5
    bodies.RES = 1.0 if near else 0.5
    parts.NEAR = near
    spec = dict(spec, holes=[(y, z, w, h, r, yaw) for k, y, z, w, h, r, yaw in nose_layout(bodies.Road(spec), v)])
    b, made = bodies.build_shell(spec)
    car = Car(b, v)
    ap = car.objs.extend
    for grp, obs in made.items():
        ap(obs)
    skin = parts.Skin([o for obs in made.values() for o in obs])
    import detail as _detail

    _detail.gaps(car, made)
    # (quality pass 2) the floor's underside in its dark coating, not the paint
    for o in list(made.get("body", [])):
        if o["kind"] == "paint" and o.name.endswith("lower"):
            n = _detail._split(o, lambda f: f.normal.z < -0.6 and f.calc_center_median().z < b.zb(b.ahead - f.calc_center_median().x) + 0.03, "under")
            if n is not None:
                made["body"].append(n)
    # a soft top (canvas behind a point), a second colour under the mouldings
    if v.get("canvas_from"):
        xc = b.x(v["canvas_from"])
        for grp, obs in made.items():
            for o in list(obs):
                if o.name.endswith("greenhouse"):
                    n = retint(o, lambda c, xc=xc: c.x < xc and c.z > b.belt + 0.015, "canvas")
                    if n is not None:
                        obs.append(n)
    if v.get("two_tone"):
        for grp, obs in made.items():
            for o in list(obs):
                if o["kind"] == "paint" and not o.name.endswith("greenhouse"):
                    n = retint(o, lambda c: c.z < b.moulding_z + 0.02, "paint2")
                    if n is not None:
                        obs.append(n)
    xn, xt = b.x(0) + 0.02, b.x(b.L) - 0.02  # the nose's and tail's faces
    chrome = v.get("chrome", False)
    trimk = "chrome" if chrome else "trim"

    # ── the arches' liners, the underbody ──
    for i, (s, r) in enumerate(b.arches):
        verts, faces = [], []
        n = 20
        y0, y1 = b.hw(s) - 0.28, b.hw(s) + 0.01
        for side in (1, -1):
            base = len(verts)
            for k in range(n + 1):
                a = math.pi * k / n
                for y in (y0, y1):
                    verts.append((b.x(s) + math.cos(a) * (r - 0.01), side * y, b.arch_z + math.sin(a) * (r - 0.01)))
            for k in range(n):
                a = base + 2 * k
                faces.append((a, a + 1, a + 3, a + 2) if side > 0 else (a, a + 2, a + 3, a + 1))
            # the inner wall closing the well (a half disc at its inner end)
            faces.append(tuple(base + 2 * k for k in range(n + 1)))
        ap([kit.mk(f"liner{i}", verts, faces, "under", smooth=True)])
    if len(b.arches) >= 2:
        f0 = b.arches[0][0] + b.arches[0][1] + 0.02
        f1 = b.arches[1][0] - b.arches[1][1] - 0.02
        ap([kit.box("floorpan", (b.x((f0 + f1) / 2), 0, b.zb((f0 + f1) / 2) - 0.004), (f1 - f0, b.W - 0.12, 0.008), "under")])

    # ── glass ──
    for name, quad, grp in b.glass_holes():
        ap(slope_glass(car, quad, name, v.get("rear_glass", "glass") if name.startswith("back") else "glass_ws", grp))
    for d in b.door_list():
        if d.get("frame", True) and d.get("window", True):
            ap(side_glass(car, d["s0"], d["s1"], d["side"], d["grp"], v.get("side_glass", "glass")))
    for s0, s1, side in b.quarter_list():
        ap(side_glass(car, s0, s1, side, "body", v.get("rear_glass", "glass"), inset=0.05))

    # ── the nose: lamps, grille, badge, bumper ──
    lamp_z = b.lamp_z
    nose_hw = b.hw(0.0)
    ly = nose_hw - 0.19  # a lamp's middle off the centre line
    ic = (b.x(0.28), nose_hw - 0.13)  # the indicators' fan centre
    lay = nose_layout(b, v)
    for k, y, z, w, h, r, yaw in lay:
        side = 1 if y > 0 else -1
        tag = "l" if side > 0 else "r"
        xs = b.x(0) + 0.02 + b.bow(0.0, y)
        if k == "head":
            ap(parts.headlamp(f"head{side}", (xs, y, z), w, h, "lamp_head", bezel=trimk, yaw=yaw))
        elif k == "quad":
            obs = []
            for j, dy in enumerate((-0.1, 0.1)):
                obs += parts.headlamp(f"head{side}{j}", (xs - 0.014, y + dy, z), 0.16, 0.16, "lamp_head", round_=True, bezel="chrome")
            if near:
                obs.append(kit.frame_x(f"headpanel.f{side}", (xs + 0.008, y, z), kit.rrect(w + 0.034, h + 0.034, 0.024, 3), kit.rrect(w - 0.004, h - 0.004, 0.018, 3), 0.03, trimk, "body", slope=0.006))
            obs.append(kit.box(f"headpanel{side}", (xs - 0.06, y, z), (0.01, w, h), "gloss", "body"))
            for o in obs:
                kit.rot(o, "Z", yaw, (xs, y, z))
            ap(obs)
        elif k == "round":
            ap(parts.headlamp(f"head{side}", (xs, y, z), w, h, "lamp_head", round_=True, bezel=trimk if chrome else "chrome", yaw=yaw))
        elif k == "grille":
            ap(parts.grille("grille", (xs, 0.0, z), w, h, v["grille"], trimk if v["grille"] != "body" else "paint"))
            if near:
                ap([badge("emblem.e", "E", (xs + 0.019, 0.0, z), 0.05, "x", kind="chrome")])
            continue
        if k in ("head", "quad", "round"):
            car.pt(f"headlight_{tag}", (xn + 0.01, side * ly, lamp_z))
        # the indicator: round the corner (rect, quad), under the lamp (round)
        if k == "round":
            ix = b.x(0) + 0.02 + b.bow(0.0, y)
            ind = kit.xprism(f"indf{side}", [(y + a_, lamp_z - 0.16 + b_) for a_, b_ in kit.rrect(0.12, 0.05, 0.012, 3)], ix - 0.01, ix + 0.012, "lens_amber", "body", smooth=True)
            ap([ind, kit.frame_x(f"indf.bez{side}", (ix + 0.014, y, lamp_z - 0.16), kit.rrect(0.14, 0.07, 0.02, 3), kit.rrect(0.118, 0.048, 0.012, 3), 0.026, "trim", "body")])
            ap([kit.box(f"indfe{side}", (ix - 0.003, y, lamp_z - 0.16), (0.01, 0.1, 0.035), "emit_ind", "lamp_ind_" + tag)])
            continue
        a0, a1 = ((0.32, 0.9) if side > 0 else (-0.9, -0.32)) if k == "head" else ((0.36, 1.2) if side > 0 else (-1.2, -0.36))
        hz = 0.06 if k == "head" else 0.05
        ind = parts.end_patch(f"ind_f{side}", skin, a0, a1, lamp_z - hz, lamp_z + hz, 1, "lens_amber", "body", ny=7 if near else 4, nz=3, wrap=(ic[0], side * ic[1]), out=0.006)
        ap([ind])
        em = kit.copy(ind, f"ind_fe{side}", "emit_ind", "lamp_ind_" + tag)
        ap([em])
        if near:
            # its surround: a black lip proud round it
            for z0_, z1_ in ((lamp_z + hz, lamp_z + hz + 0.01), (lamp_z - hz - 0.01, lamp_z - hz)):
                ap([parts.end_patch(f"ind_fs{side}{z0_:.3f}", skin, a0 - 0.02 * side, a1 + 0.02 * side, z0_, z1_, 1, "trim", "body", ny=7, nz=2, wrap=(ic[0], side * ic[1]), out=0.009, depth=0.01)])
    ap(bumper(car, b, True, v["bumper"], "bumper_f"))
    car.pivot("bumper_f", (b.x(0) + 0.05, 0, b.bumper_z + 0.07), (0, 1, 0), detach=True)
    pf = kit.plate("plate_f", (b.x(0) + 0.105, 0, b.bumper_z + 0.075), 0.4, 0.13, "plate", "plate_f", normal="x")
    ap([pf])
    car.pivot("plate_f", (b.x(0) + 0.105, 0, b.bumper_z + 0.075), (1, 0, 0), parent="bumper_f", w=0.4, h=0.13)
    if v.get("fogs"):
        for side in (1, -1):
            fy = side * min(0.55, b.hw(0.0) - 0.16)
            fx = bumper_face_x(b, fy) - 0.002
            fz = b.bumper_z - (0.05 if v["bumper"] == "paint" else 0.0) + (0.075 if v["bumper"] == "paint" else 0.02)
            ap(parts.headlamp(f"fog{side}", (fx, fy, fz), 0.1, 0.1, "bumper_f", round_=True, lens="lens_amber", depth=0.045, bezel="trim"))
            ap([kit.cyl(f"fog.well{side}", (fx - 0.02, fy, fz), 0.07, 0.03, "gloss", "bumper_f", axis="x", n=20)])

    # ── the tail: lamps, plate, badges, bumper, exhaust ──
    if not v.get("flatbed"):
        tz0, tz1 = b.tail_z
        for side in (1, -1):
            tag = "l" if side > 0 else "r"
            a0, a1 = (math.pi - 1.25, math.pi - 0.05) if side > 0 else (-math.pi + 0.05, -math.pi + 1.25)
            # (the cluster: the tail/brake red over the full height, the amber indicator and the white reverse in
            # bands below — ribbed)
            hgt = tz1 - tz0
            bands = [("lens_red", tz0 + hgt * 0.42, tz1, f"lamp_tail"), ("lens_amber", tz0 + hgt * 0.2, tz0 + hgt * 0.4, f"lamp_ind_{tag}"), ("lens", tz0, tz0 + hgt * 0.18, "lamp_reverse")]
            wrapc = (b.x(b.L - 0.3), side * b.tail_wrap)
            for lens, z0, z1, egrp in bands:
                p = parts.end_patch(f"tl.{lens}{side}", skin, a0, a1, z0, z1, -1, lens, "body", ny=10 if near else 5, nz=3 if near else 2, wrap=wrapc)
                ap([p])
                ek = {"lamp_tail": "emit_tail", "lamp_reverse": "emit_reverse"}.get(egrp, "emit_ind")
                e = parts.end_patch(f"tle.{lens}{side}", skin, a0 + (0.04 if side > 0 else 0), a1 - (0 if side > 0 else 0.04), z0 + 0.008, z1 - 0.008, -1, ek, egrp, ny=6 if near else 3, nz=2, wrap=wrapc, out=-0.006, depth=0.004)
                ap([e])
                if lens == "lens_red":
                    e2 = parts.end_patch(f"tlb{side}", skin, a0 + 0.1, a1 - 0.1, z0 + 0.02, z1 - 0.02, -1, "emit_brake", "lamp_brake", ny=4, nz=2, wrap=wrapc, out=-0.005, depth=0.003)
                    ap([e2])
                # (its ribs: the lens's own map since quality pass 2)
            ap([parts.end_patch(f"tl.surr{side}", skin, a0 - 0.03, a1 + 0.03, tz0 - 0.012, tz1 + 0.012, -1, "gloss", "body", ny=10 if near else 5, nz=3 if near else 2, wrap=wrapc, out=0.002, depth=0.01)])
            if near:
                # (quality pass 2) the cluster segmented: a frame proud round it, bars between its bands and across
                fk = "chrome" if chrome else "trim"
                sg = 1 if side > 0 else -1
                strips = [(a0 - 0.03, a1 + 0.03, tz1, tz1 + 0.013, fk), (a0 - 0.03, a1 + 0.03, tz0 - 0.013, tz0, fk)]
                strips += [(a0 - 0.03, a0 + 0.004, tz0, tz1, fk), (a1 - 0.004, a1 + 0.03, tz0, tz1, fk)]
                for zz in (tz0 + hgt * 0.19, tz0 + hgt * 0.41):
                    strips.append((a0, a1, zz - 0.004, zz + 0.004, "trim"))
                for f in (0.36, 0.68):
                    aa = a0 + (a1 - a0) * f
                    strips.append((aa - 0.011, aa + 0.011, tz0, tz1, "trim"))
                for j, (b0, b1, z0, z1, k) in enumerate(strips):
                    ap([parts.end_patch(f"tl.bar{side}{j}", skin, b0, b1, z0, z1, -1, k, "body", ny=8 if b1 - b0 > 0.2 else 2, nz=2 if z1 - z0 < 0.03 else 4, wrap=wrapc, out=0.0085, depth=0.004)])
        # the plate on the boot lid, its lamps' bar
        bk = b.boot
        plate_z = bk.get("plate_z", (tz0 + tz1) / 2)
        plate_y = bk.get("plate_y", 0.0)
        lidg = {"deck": "boot", "tailgate": "boot", "side": "boot", "twin": "boot_l", "drop": "boot"}.get(bk["kind"], "body")
        plate_g = "body" if bk.get("plate_on") == "body" or lidg == "body" else lidg
        # (on the tail's own skin, wherever its curve puts it)
        loc, _n = skin.front(plate_y, plate_z, -1)
        px = (loc.x if loc is not None else xt) - 0.007
        pr = kit.plate("plate_r", (px, plate_y, plate_z), 0.4, 0.13, "plate", "plate_r", normal="-x")
        ap([pr])
        car.pivot("plate_r", (px, plate_y, plate_z), (-1, 0, 0), parent=plate_g, w=0.4, h=0.13)
        ap([kit.box("plate_recess", (px + 0.006, plate_y, plate_z), (0.008, 0.44, 0.16), "gloss", plate_g, r=0.003)])
        bz = plate_z + (0.16 if bk["kind"] == "deck" else 0.12)
        if bk["kind"] == "drop":
            bz = (bk["z_low"] + bk["z_top"]) / 2 + 0.1
        if bk["kind"] == "twin":
            near and ap([badge("badge_r", "ESKER", (xt - 0.004, -0.4, bz + 0.25), 0.06, "-x", "boot_r")])
            near and ap([badge("badge_m", v["badge"], (xt - 0.004, 0.4, bz + 0.25), 0.045, "-x", "boot_l")])
        elif bk["kind"] == "drop":
            near and ap([badge("badge_r", "E S K E R", (xt - 0.004, 0.0, bz), 0.11, "-x", lidg)])
        else:
            near and ap([badge("badge_r", "ESKER", (xt - 0.004, -0.5 * min(1, b.lid_hw() / 0.66), bz), 0.05, "-x", lidg)])
            near and ap([badge("badge_m", v["badge"], (xt - 0.004, 0.5 * min(1, b.lid_hw() / 0.66), bz), 0.042, "-x", lidg)])
        ap(bumper(car, b, False, v["bumper"], "body"))
        ex = (b.x(b.L) - 0.02, -0.45, b.bumper_z - 0.04)
        ap([kit.tube("exhaust", [(b.x(b.L - 0.9), -0.4, b.zb(b.L - 0.9) - 0.02), (ex[0] + 0.12, -0.44, ex[2]), (ex[0] - 0.03, -0.45, ex[2])], 0.025, "steel", n=12)])
        ap([kit.cyl("exhaust.tip", (ex[0] - 0.02, -0.45, ex[2]), 0.032, 0.08, "chrome", axis="x", n=16)])
        car.pt("exhaust_0", (ex[0] - 0.06, -0.45, ex[2]))


    else:
        fb = b.bed
        xr = b.x(fb["s1"]) - 0.02
        for side in (1, -1):
            tag = "l" if side > 0 else "r"
            for k, (lens, ek, eg) in enumerate((("lens_red", "emit_tail", "lamp_tail"), ("lens_amber", "emit_ind", f"lamp_ind_{tag}"), ("lens", "emit_reverse", "lamp_reverse"))):
                y = side * (0.82 - k * 0.1)
                ap([kit.box(f"fbl{side}{k}", (xr, y, fb["floor"] - 0.1), (0.04, 0.09, 0.07), lens, r=0.008)])
                ap([kit.box(f"fble{side}{k}", (xr - 0.005, y, fb["floor"] - 0.1), (0.03, 0.07, 0.05), ek, eg)])
            ap([kit.box(f"fbl.brake{side}", (xr - 0.004, side * 0.82, fb["floor"] - 0.1), (0.03, 0.07, 0.05), "emit_brake", "lamp_brake")])
        pr = kit.plate("plate_r", (xr - 0.012, 0.0, fb["floor"] - 0.12), 0.4, 0.13, "plate", "plate_r", normal="-x")
        ap([pr])
        car.pivot("plate_r", (xr - 0.012, 0.0, fb["floor"] - 0.12), (-1, 0, 0), parent="body", w=0.4, h=0.13)
        ap([kit.box("fb.bumper", (xr, 0, fb["floor"] - 0.22), (0.08, b.W, 0.08), "trim", r=0.01)])
        ex = (b.x(b.axle_r) - 0.5, -0.45, 0.32)
        ap([kit.tube("exhaust", [(b.x(2.6), -0.4, 0.3), ex], 0.025, "steel", n=12)])
        car.pt("exhaust_0", ex)
    # ── the sides: mouldings, handles, mirrors, repeaters, drip rails, the filler, the aerial ──
    for side in (1, -1):
        tag = "l" if side > 0 else "r"
        zm0, zm1 = b.moulding_z, b.moulding_z + 0.045
        cuts = [0.5]
        doors = [d for d in b.door_list() if d["side"] == side]
        segs = []
        prev = 0.62
        for d in doors:
            segs.append((prev, d["s0"] - 0.006, "body"))
            segs.append((d["s0"] + 0.006, d["s1"] - 0.006, d["grp"]))
            prev = d["s1"] + 0.006
        segs.append((prev, min(b.L, b.axle_r) - 0.55, "body"))
        for s0, s1, grp in segs:
            if s1 - s0 < 0.05:
                continue
            # (skip what's over an arch)
            for (sa, ra) in b.arches:
                pass
            for p0, p1 in clear_spans(b, s0, s1, zm0):
                ap([parts.side_patch(f"mould.{grp}.{p0:.2f}", skin, b.x(p1), b.x(p0), zm0, zm1, side, "trim", grp, nx=10 if near else 4, nz=3 if near else 2, out=0.008, depth=0.002)])
                if chrome and near:
                    ap([parts.side_patch(f"mouldc.{grp}.{p0:.2f}", skin, b.x(p1), b.x(p0), zm0 + 0.016, zm0 + 0.026, side, "chrome", grp, nx=10, nz=2, out=0.0095, depth=0.0)])
        if v.get("wood"):
            for s0, s1, grp in segs:
                if s1 - s0 < 0.05:
                    continue
                for p0, p1 in clear_spans(b, s0, s1, zm1 + 0.01):
                    ap([parts.side_patch(f"wood.{grp}.{p0:.2f}", skin, b.x(p1), b.x(p0), zm1 + 0.01, b.belt - 0.08, side, "woodgrain", grp, nx=12 if near else 4, nz=4 if near else 2, out=0.003, depth=0.001)])
        for d in doors:
            hs = d["s1"] - 0.14
            loc, n = skin.side(b.x(hs), b.belt - 0.06, side)
            if loc is not None:
                ap(parts.door_handle(f"handle.{d['grp']}", loc, n, trimk, d["grp"]))
            if d["grp"].startswith("door_f"):
                # the mirror: on the front door's window corner
                ms = d["s0"] + 0.12
                mz = b.belt + 0.06
                # (its hinge where it was measured: on the straight tumble — the curved skin bows out ~1 cm there)
                base = Vector((b.x(ms), side * (b.gh_hw_lin(mz) + 0.01), mz))
                mg = f"mirror_{tag}"
                ap(parts.mirror(f"mirror.{tag}", base, side, v.get("mirror_kind", "trim"), mg, yaw=side * 0.12))
                car.pivot(mg, tuple(base), (0, 0, 1), parent=d["grp"])
        # the repeater on the front wing
        loc, n = skin.side(b.x(1.25), b.moulding_z + 0.12, side)
        if loc is not None:
            ap([kit.box(f"rep.{tag}", loc + n * 0.004, (0.06, 0.012, 0.022), "lens_amber", r=0.006)])
            ap([kit.box(f"repe.{tag}", loc + n * 0.001, (0.05, 0.008, 0.016), "emit_ind", f"lamp_ind_{tag}")])
        # the drip rail over the doors: on the skin (a ray), just over the doors' tops
        rail = []
        for i in range(22):
            s = b.gh[1][0] + 0.07 + (b.gh[-2][0] - b.gh[1][0] - 0.14) * i / 21
            zt_ = eroded_top(b, s, 0.065, 0.028)
            if zt_ is None:
                continue
            loc, n = skin.side(b.x(s), zt_ + 0.012, side)
            if loc is not None:
                rail.append(loc + n * 0.003)
        near and len(rail) > 2 and ap([kit.tube(f"drip.{tag}", rail, 0.0055, trimk if chrome else "trim", n=6)])
    # the aerial (left front wing)
    near and ap([kit.tube("aerial", [(b.x(0.9), 0.78, b.zt(0.9)), (b.x(0.95), 0.78, b.zt(0.9) + 0.75)], 0.0025, "chrome", n=5)])

    # ── what the variant adds ──
    import extras

    ap(extras.variant_extras(car, skin))

    # ── wipers ──
    sc, zc = b.gh[0]
    for k, (yy, tag) in enumerate(((-0.36, "r"), (0.14, "l"))):
        piv = Vector((b.x(sc + 0.06), yy, b.belt + 0.025))
        grp = f"wiper_{tag}"
        along = Vector((0, 1, 0))
        up = Vector((b.x(b.gh[1][0]) - b.x(sc), 0, b.gh[1][1] - zc)).normalized()
        nrm = along.cross(up).normalized()
        arm_end = piv + along * 0.5 + up * 0.03
        ap([kit.tube(f"wiper.arm{k}", [piv, piv + along * 0.06 + nrm * 0.02, arm_end + nrm * 0.02], 0.006, "trim", grp, n=6)])
        blade = kit.box(f"wiper.blade{k}", (0, 0, 0), (0.012, 0.48, 0.01), "rubber", grp)
        kit.move(blade, piv + along * 0.27 + up * 0.035 + nrm * 0.01)
        ap([blade, kit.cyl(f"wiper.piv{k}", piv, 0.018, 0.02, "trim", grp, axis="z", n=12)])
        car.pivot(grp, tuple(piv), tuple(nrm))

    # ── the cabin ──
    cab = b.cabin
    hw_in = b.HB - 0.06
    floor_z = cab["floor"]
    s_fw = b.gh[0][0] + 0.02  # the firewall
    s_back = cab["back"]
    ap([kit.box("carpet", (b.x((s_fw + s_back) / 2), 0, floor_z), (s_back - s_fw, hw_in * 2, 0.02), "carpet")])
    ap([kit.box("tunnel", (b.x((s_fw + s_back) / 2 - 0.2), 0, floor_z + 0.08), (s_back - s_fw - 0.4, 0.26, 0.16), "carpet", r=0.05)])
    ap([kit.box("firewall", (b.x(s_fw), 0, (floor_z + b.belt) / 2), (0.02, hw_in * 2, b.belt - floor_z), "dash")])
    # the dashboard: its profile across the car
    d0 = s_fw
    dprof = [(d0, b.belt + 0.02), (d0 + 0.28, b.belt + 0.01), (d0 + 0.42, b.belt - 0.05), (d0 + 0.45, b.belt - 0.24), (d0 + 0.36, b.belt - 0.36), (d0, b.belt - 0.36)]
    dash = kit.prism("dash", [(b.x(s), z) for s, z in dprof], -hw_in, hw_in, "dash")
    kit.bevel(dash, 0.025, 3, angle=30)
    ap([dash])
    if near:
        # (quality pass 2) the demister's slots along the dash's top, the speaker grille in its middle
        for sg in (1, -1):
            ap([kit.box(f"demist{sg}", (b.x(d0 + 0.08), sg * 0.36, b.belt + 0.021), (0.035, 0.5, 0.004), "grille_mesh", r=0.0015)])
        ap([kit.box("dash.spk", (b.x(d0 + 0.17), 0.0, b.belt + 0.017), (0.09, 0.2, 0.004), "grille_mesh", r=0.0015)])
    # the cluster's hood and its screen (the VFD: its canvas is the game's)
    hood = [(d0 + 0.26, b.belt + 0.01), (d0 + 0.3, b.belt + 0.075), (d0 + 0.44, b.belt + 0.075), (d0 + 0.47, b.belt - 0.02)]
    h = kit.prism("cluster", [(b.x(s), z) for s, z in hood], 0.18, 0.66, "dash")
    # (quality pass 2) the binnacle curved round the dials in plan, its ends drawn back and down, then rounded
    bm = bmesh.new()
    bm.from_mesh(h.data)
    for k in range(1, 10 if near else 3):
        yy = 0.18 + 0.48 * k / (10 if near else 3)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, yy, 0), plane_no=(0, 1, 0))
    for vv in bm.verts:
        u = (vv.co.y - 0.42) / 0.24
        vv.co.x += 0.04 * u * u
        top = max(0.0, (vv.co.z - (b.belt + 0.01)) / 0.065)
        vv.co.z -= 0.018 * u * u * top
    bm.to_mesh(h.data)
    bm.free()
    kit.bevel(h, 0.018 if near else 0.012, 3 if near else 1, angle=35)
    ap([h])
    scr_s = d0 + 0.43
    # (the VFD — the game's canvas — in the middle of the printed cluster face: its fuel and temperature dials
    # either side, their needles, the warning lamps' row under it)
    ap([kit.plate("screen", (b.x(scr_s) - 0.003, 0.42, b.belt - 0.022), 0.3, 0.075, "screen", "screen", normal="-x", t=0.002)])
    car.pivot("screen", (b.x(scr_s) - 0.003, 0.42, b.belt - 0.022), (-1, 0, 0), w=0.3, h=0.075)
    if near:
        ap([kit.plate("cluster.face", (b.x(scr_s) + 0.002, 0.42, b.belt - 0.03), 0.52, 0.13, "cluster", normal="-x", t=0.002)])
        for tag, dy in (("fuel", 0.204), ("temp", -0.204)):
            c = (b.x(scr_s) - 0.004, 0.42 + dy, b.belt - 0.03)
            nd = kit.box(f"needle.{tag}", (0, 0, 0.018), (0.003, 0.003, 0.036), "needle", f"needle_{tag}")
            kit.rot(nd, "X", 0.6 if tag == "fuel" else -0.6)
            kit.move(nd, c)
            ap([nd, kit.cyl(f"needle.cap.{tag}", c, 0.006, 0.006, "trim", f"needle_{tag}", axis="x", n=10)])
            car.pivot(f"needle_{tag}", c, (-1, 0, 0))
    else:
        ap([kit.box("gaugeback", (b.x(scr_s - 0.006), 0.42, b.belt - 0.03), (0.004, 0.5, 0.13), "gauge")])
    # the centre: the radio-cassette, the heater's sliders, the vents
    cs = d0 + 0.44
    ap([kit.box("console", (b.x(cs - 0.04), 0, b.belt - 0.26), (0.16, 0.3, 0.28), "dash", r=0.02)])
    near and ap([kit.box("radio", (b.x(cs + 0.02), 0, b.belt - 0.17), (0.02, 0.19, 0.055), "gauge", r=0.004)])
    near and ap([kit.box("tape", (b.x(cs + 0.034), 0.02, b.belt - 0.165), (0.004, 0.1, 0.012), "trim")])
    # (the radio's window: its own canvas in the game — the band, the station; docs/plan/92 phase 9)
    if near:
        rx = b.x(cs + 0.02) - 0.0115
        ap([kit.plate("radio.window", (rx, -0.05, b.belt - 0.151), 0.07, 0.018, "screen", "radio_screen", normal="-x", t=0.0015)])
        car.pivot("radio_screen", (rx, -0.05, b.belt - 0.151), (-1, 0, 0), w=0.07, h=0.018)
    for k in (-0.075, 0.075):
        near and ap([kit.cyl(f"knob{k}", (b.x(cs + 0.04), k, b.belt - 0.17), 0.011, 0.02, "chrome", axis="x", n=12)])
    for i in range(3):
        near and ap([kit.box(f"slider{i}", (b.x(cs + 0.025), -0.05 + i * 0.05, b.belt - 0.26), (0.008, 0.008, 0.07), "chrome")])
    for side_y in (-0.55, -0.12, 0.12, 0.62) if near else ():
        for i in range(4):
            ap([kit.box(f"vent{side_y}{i}", (b.x(d0 + 0.415), side_y, b.belt - 0.08 + i * 0.016), (0.01, 0.12, 0.004), "trim")])
    if v.get("walnut"):
        ap([kit.box("walnut.strip", (b.x(d0 + 0.43), -0.38, b.belt - 0.12), (0.006, 0.5, 0.05), "walnut", r=0.004)])
    ap([kit.box("glovebox", (b.x(d0 + 0.42), -0.42, b.belt - 0.2), (0.006, 0.36, 0.13), "dash", r=0.008)])
    # the steering wheel and its column
    hub = Vector((b.x(cab["wheel_s"]), 0.42, cab["wheel_z"]))
    tilt = math.radians(25)
    ap(parts.steering_wheel(tuple(hub), tilt, sport=v.get("sport", False)))
    dirv = Vector((math.cos(tilt), 0, -math.sin(tilt)))
    car.pivot("steering", tuple(hub), tuple(dirv), ratio=15.9)
    ap([kit.tube("column", [hub + dirv * 0.03, hub + dirv * 0.42], 0.03, "dash", n=12)])
    ap([kit.box("stalkL", hub + dirv * 0.12 + Vector((0, 0.08, 0)), (0.02, 0.12, 0.015), "trim", r=0.005)])
    ap([kit.box("stalkR", hub + dirv * 0.12 + Vector((0, -0.08, 0)), (0.02, 0.12, 0.015), "trim", r=0.005)])
    # the pedals (the clutch, the brake, the throttle)
    for i, yy in enumerate((0.56, 0.44, 0.3) if near else ()):
        top = Vector((b.x(s_fw + 0.16), yy, b.belt - 0.33))
        pad = top + Vector((0.08, 0, -0.27))
        grp = f"pedal_{i}"
        ap([kit.tube(f"pedal.arm{i}", [top, pad], 0.008, "steel", grp, n=6)])
        ap([kit.box(f"pedal.pad{i}", pad, (0.02, 0.07 if i < 2 else 0.05, 0.07 if i < 2 else 0.12), "rubber", grp, r=0.005)])
        car.pivot(grp, tuple(top), (0, 1, 0))
    car.pt("pedal_throttle", tuple(Vector((b.x(s_fw + 0.16), 0.3, b.belt - 0.33)) + Vector((0.08, 0, -0.27))))
    # the gear lever and the handbrake
    gl = Vector((b.x(cab["lever_s"]), 0, floor_z + 0.16))
    ap([kit.lathe("gaiter", [(0.07, 0.0), (0.05, 0.05), (0.02, 0.1)], 16, "vinyl", "lever", axis="z")])
    kit.move(car.objs[-1], gl)
    ap([kit.tube("lever.rod", [gl, gl + Vector((-0.03, 0, 0.24))], 0.008, "chrome", "lever", n=8)])
    ap([kit.cyl("lever.knob", gl + Vector((-0.03, 0, 0.26)), 0.022, 0.04, "walnut" if v.get("walnut") else "dash", "lever", axis="z", n=16, bevel_r=0.012)])
    car.pivot("lever", tuple(gl), (0, 1, 0))
    if near and b.kind not in ("shuttle",):
        # (quality pass 2) the console down the tunnel between the seats: its tray, its oddments bin
        c0, c1 = cab["lever_s"] - 0.06, cab["front_s"] + 0.08
        ap([kit.box("console.low", (b.x((c0 + c1) / 2), 0.0, floor_z + 0.14), (c1 - c0, 0.2, 0.1), "dash", r=0.025)])
        ap([kit.box("console.tray", (b.x(c0 + 0.1), 0.0, floor_z + 0.19), (0.12, 0.15, 0.012), "gloss", r=0.008)])
    hb = Vector((b.x(cab["lever_s"] + 0.32), 0.0, floor_z + 0.16))
    ap([kit.box("handbrake", hb + Vector((0.12, 0, 0.03)), (0.26, 0.035, 0.035), "dash", "handbrake", r=0.012)])
    ap([kit.box("hb.button", hb + Vector((0.26, 0, 0.035)), (0.015, 0.016, 0.016), "chrome", "handbrake")])
    car.pivot("handbrake", tuple(hb), (0, 1, 0))
    # the seats
    seatk = v.get("seat", "tweed")
    for i, side in enumerate((1, -1)):
        hip = Vector((b.x(cab["front_s"]), side * 0.42, cab["hip"]))
        ap(parts.seat(f"seat{i}", tuple(hip), 0.5, seatk, bucket=v.get("sport", False)))
        car.pt(f"seat_{i}", tuple(hip))
    rows = v.get("rows", cab.get("rows", [(cab.get("rear_s", 0), cab["hip"] - 0.01, (0.45, -0.45))]))
    n_seat = 2
    for k, (s_r, hip_z, sides) in enumerate(rows):
        x = b.x(s_r)
        ap(parts.bench(f"bench{k}", (x, 0, hip_z), hw_in * 2 - 0.08, seatk))
        for j, yy in enumerate(sides):
            car.pt(f"seat_{n_seat:02d}" if False else f"seat_{n_seat}", (x, yy, hip_z))
            n_seat += 1
    car.pt("eye", (b.x(cab["front_s"] + 0.06), 0.42, cab["hip"] + 0.8))
    # the door cards: the inside of each door
    for d in b.door_list():
        side = d["side"]
        y = side * (b.hw((d["s0"] + d["s1"]) / 2) - 0.05)
        prof = [(d["s0"] + 0.03, d["bottom"] + 0.06), (d["s1"] - 0.03, d["bottom"] + 0.06), (d["s1"] - 0.03, b.belt + 0.01), (d["s0"] + 0.03, b.belt + 0.01)]
        card = kit.prism(f"card.{d['grp']}", [(b.x(s), z) for s, z in prof], y - side * 0.015 if side > 0 else y, y if side > 0 else y + 0.015, "vinyl", d["grp"])
        ap([card])
        al = 0.3 if d["s1"] - d["s0"] > 0.6 else 0.2
        am = (d["s0"] + d["s1"]) / 2
        ap([kit.box(f"arm.{d['grp']}", (b.x(am), y - side * 0.04, b.belt - 0.2), (al, 0.06, 0.05), "vinyl", d["grp"], r=0.02)])
        if near:
            g = d["grp"]
            # (quality pass 2) the card's padded upper band, the armrest's pull cup, the opener in its recess, the
            # window winder, the map pocket
            ap([kit.box(f"band.{g}", (b.x(am), y - side * 0.019, b.belt - 0.06), (d["s1"] - d["s0"] - 0.1, 0.012, 0.07), "vinyl", g, r=0.005)])
            ap([kit.box(f"cup.{g}", (b.x(am - al * 0.25), y - side * 0.05, b.belt - 0.176), (0.09, 0.03, 0.012), "gloss", g, r=0.006)])
            ap([kit.box(f"opener.r.{g}", (b.x(d["s0"] + 0.16), y - side * 0.017, b.belt - 0.11), (0.1, 0.006, 0.035), "trim", g, r=0.006)])
            ap([kit.box(f"pull.{g}", (b.x(d["s0"] + 0.16), y - side * 0.022, b.belt - 0.11), (0.075, 0.008, 0.016), "chrome", g, r=0.004)])
            wc = Vector((b.x(d["s0"] + 0.34), y - side * 0.02, b.belt - 0.13))
            ap([kit.cyl(f"winder.{g}", tuple(wc), 0.022, 0.012, "chrome", g, axis="y", n=14)])
            ap([kit.tube(f"winder.arm.{g}", [wc - Vector((0, side * 0.01, 0)), wc - Vector((0.07, side * 0.014, 0.03))], 0.006, "chrome", g, n=6)])
            ap([kit.cyl(f"winder.knob.{g}", tuple(wc - Vector((0.07, side * 0.03, 0.03))), 0.011, 0.035, "trim", g, axis="y", n=10)])
            pz = d["bottom"] + 0.12
            ap([kit.box(f"pocket.{g}", (b.x(am + 0.03), y - side * 0.035, pz), (d["s1"] - d["s0"] - 0.26, 0.03, 0.11), "vinyl", g, r=0.01)])
            ap([kit.box(f"pocket.lip.{g}", (b.x(am + 0.03), y - side * 0.05, pz + 0.05), (d["s1"] - d["s0"] - 0.26, 0.012, 0.016), "trim", g, r=0.005)])
        if v.get("walnut"):
            ap([kit.box(f"cardw.{d['grp']}", (b.x((d["s0"] + d["s1"]) / 2), y - side * 0.017, b.belt - 0.04), (d["s1"] - d["s0"] - 0.12, 0.004, 0.035), "walnut", d["grp"])])
        car.pivot(d["grp"], (b.x(d["s0"]), side * b.hw(d["s0"]), 0.6), (0, 0, 1), side=side, kind=d.get("kind", "hinge"))
    # the headliner, the visors, the inside mirror, the parcel shelf
    s_a, s_r = b.gh[1][0], b.gh[-2][0]
    ap([kit.box("headliner", (b.x((s_a + s_r) / 2), 0, b.roof - 0.045), (s_r - s_a + 0.05, b.HR * 2 - 0.08, 0.012), "headliner", r=0.005)])
    for side in (1, -1):
        near and ap([kit.box(f"visor{side}", (b.x(s_a + 0.12), side * 0.38, b.roof - 0.065), (0.17, 0.36, 0.018), "headliner", r=0.008)])
    ap([kit.box("rvm", (b.x(s_a + 0.06), 0, b.roof - 0.11), (0.03, 0.22, 0.06), "dash", r=0.012)])
    ap([kit.box("rvm.glass", (b.x(s_a + 0.045), 0, b.roof - 0.11), (0.003, 0.2, 0.05), "reflector", r=0.008)])
    if b.boot["kind"] == "deck":
        sh = b.gh[-1][0]
        ap([kit.box("shelf", (b.x(sh - 0.12), 0, b.belt + 0.005), (0.28, hw_in * 2, 0.015), "carpet")])
        for side in (1, -1):
            near and ap([kit.box(f"speaker{side}", (b.x(sh - 0.12), side * 0.5, b.belt + 0.015), (0.12, 0.18, 0.01), "trim", r=0.01)])
    # the boot's floor
    ap([kit.box("bootfloor", (b.x((s_back + b.L) / 2), 0, cab["boot_floor"]), (b.L - s_back - 0.15, hw_in * 2, 0.015), "carpet")])

    # ── the engine bay ──
    if b.hood and near:
        ap(parts.engine(b, b.x(0.1), b.x(s_fw), b.zb(0.8), vee=v.get("vee", False)))

    # ── the details (the quality pass) ──
    import detail

    ap(detail.outside(car, skin, near))
    ap(detail.arch_lips(car, skin, near))
    ap(detail.inside(car, near))
    if b.id == "saloon":
        ap(detail.liveries(car, skin))

    # ── the wheels ──
    r, w = b.wheel_r, b.wheel_w
    for tag, s, side in (("fl", b.axle_f, 1), ("fr", b.axle_f, -1), ("rl", b.axle_r, 1), ("rr", b.axle_r, -1)):
        at = (b.x(s), side * b.track, r)
        obs = parts.wheel(tag, v["wheels"], r, w, aggressive=v.get("aggressive", False))
        parts.place_wheel(obs, at, side)
        ap(obs)
        car.pivot(f"wheel_{tag}", at, (0, 1, 0), parent="root")
        car.pivot(f"steer_{tag}", at, (0, 0, 1), parent=f"wheel_{tag}")
        car.pivot(f"spin_{tag}", at, (0, 1, 0), parent=f"steer_{tag}")
        car.pt(f"hub_{tag}", at)

    # ── the add-ons' sockets ──
    car.pt("x_roof", (b.x((s_a + s_r) / 2), 0, b.roof + 0.005))
    car.pt("x_front", (b.x(0) + 0.1, 0, b.bumper_z + 0.07))
    for side in (1, -1):
        tag = "l" if side > 0 else "r"
        car.pt(f"x_spot_{tag}", (b.x(0) + 0.14, side * 0.4, b.bumper_z + 0.16))
        car.pt(f"x_flap_f{tag}", (b.x(b.axle_f) - r - 0.06, side * (b.hw(b.axle_f) - 0.06), b.zb(b.axle_f)))
        car.pt(f"x_flap_r{tag}", (b.x(b.axle_r) - r - 0.06, side * (b.hw(b.axle_r) - 0.06), b.zb(b.axle_r)))
    # the lids' and doors' hinges
    h = b.hood
    if h:
        car.pivot("bonnet", (b.x(h["s1"]), 0, b.zt_was(h["s1"])), (0, 1, 0))
    k = b.boot["kind"]
    lhw = b.lid_hw()
    if k == "deck":
        car.pivot("boot", (b.x(b.boot["s0"]), 0, b.zt_was(b.boot["s0"])), (0, 1, 0), kind="hinge")
    elif k == "tailgate":
        hs = b.boot["hinge_s"]
        car.pivot("boot", (b.x(hs), 0, b.gh_top(hs) or b.roof), (0, 1, 0), kind="hinge")
    elif k == "side":
        car.pivot("boot", (b.x(b.L), -lhw, (b.boot["z_low"] + b.roof) / 2), (0, 0, 1), kind="hinge")
    elif k == "twin":
        car.pivot("boot_l", (b.x(b.L), lhw, (b.boot["z_low"] + b.roof) / 2), (0, 0, 1), kind="hinge")
        car.pivot("boot_r", (b.x(b.L), -lhw, (b.boot["z_low"] + b.roof) / 2), (0, 0, 1), kind="hinge")
    elif k == "drop":
        car.pivot("boot", (b.x(b.L), 0, b.boot["z_low"]), (0, 1, 0), kind="hinge")
    kit.uv_all()
    return car


def collider(car):
    """The Jolt hull: a low convex box round the lower body and the greenhouse (12 points a side)."""
    b = car.b
    pts = []
    for s in (0.05, 0.35, b.L * 0.5, b.L - 0.35, b.L - 0.05):
        hw = b.hw(s) - 0.01
        for y in (hw, -hw):
            pts.append((b.x(s), y, b.zb(s) + 0.02))
            pts.append((b.x(s), y, b.zt_was(s) - 0.02))
    for s, z in b.gh:
        hw = b.gh_hw_lin(z) - 0.01
        for y in (hw, -hw):
            pts.append((b.x(s), y, z))
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    me = bpy.data.meshes.new("collider")
    bm.to_mesh(me)
    bm.free()
    o = kit.obj("collider", me, "collider", "collider", smooth=False)
    return o

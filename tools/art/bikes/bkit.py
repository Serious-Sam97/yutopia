# Plan 101 — the bicycles' kit: the cars' kit (tools/art/cars/kit.py: materials, mesh helpers) imported as it is,
# with the few kinds a bike adds and the helpers a bike needs — swept tubes of any profile, Béziers, filleted
# polylines, toothed rings, lofts, decals as real text, helices, a belt round pulleys (the chain's line).
#
# Frames: Blender's z-up metres. A bike's frame: +x forward, +z up, +y its LEFT; the origin on the ground under the
# bottom bracket (glTF's export_yup turns Blender (x, y, z) into (x, z, −y): x forward, y up, z the bike's right).
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../cars"))
sys.path.insert(0, HERE)
import kit  # noqa: E402  (the cars' kit: never edited from here, only extended in memory)

# the kinds a bike adds (base colour, metallic, roughness, extra) — the cars' own kept as they are
kit.MAT.update(
    {
        "decal": ((0.9, 0.88, 0.82), 0.0, 0.35, {"coat": 1.0}),  # transfers on the tubes (off-white)
        "chain": ((0.2, 0.2, 0.21), 1.0, 0.4, {}),  # an oiled chain, its plates
        "gumwall": ((0.42, 0.27, 0.13), 0.0, 0.75, {}),  # tan sidewalls, gum hoods
        "tape": ((0.035, 0.035, 0.04), 0.0, 0.85, {}),  # cloth bar tape
        "wicker": ((0.5, 0.34, 0.17), 0.0, 0.8, {}),  # the basket's cane
        "nylon": ((0.88, 0.88, 0.86), 0.0, 0.45, {}),  # moulded plastic (mag wheels, number plate, bottle)
        "spokes": ((0.72, 0.72, 0.74), 1.0, 0.3, {}),  # (mid: the spokes as an alpha disc, tex/spokes36)
        "foam": ((0.06, 0.06, 0.07), 0.0, 0.9, {}),  # the BMX's pads
    }
)

mat = kit.mat
mk = kit.mk
move = kit.move
rot = kit.rot
join = kit.join
kill = kit.kill
tris = kit.tris
lathe = kit.lathe
box = kit.box

LOD = "near"  # near | mid | far


def near():
    return LOD == "near"


def V(*a):
    return Vector(a[0]) if len(a) == 1 else Vector(a)


def segs(n, lo=3):
    return max(lo, int(round(n * kit.SEG)))


# ── curves ───────────────────────────────────────────────────────────────────────────────────────────────────


def bez(p0, p1, p2, p3, n=12, end=True):
    p0, p1, p2, p3 = (Vector(p) for p in (p0, p1, p2, p3))
    out = []
    m = n + 1 if end else n
    for i in range(m):
        t = i / n
        u = 1 - t
        out.append(p0 * u**3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t**3)
    return out


def lerp(a, b, t):
    return Vector(a) * (1 - t) + Vector(b) * t


def fillet(pts, r, n=4):
    """A 3D polyline's inner corners rounded (r each, or a list), as a bent tube would be."""
    pts = [Vector(p) for p in pts]
    rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        a, b = (p0 - p1), (p2 - p1)
        la, lb = a.length, b.length
        if la < 1e-6 or lb < 1e-6:
            continue
        a.normalize()
        b.normalize()
        ang = math.acos(max(-1, min(1, a.dot(b))))
        if ang > math.pi - 1e-3 or rs[i] <= 0:
            out.append(p1)
            continue
        k = min(rs[i] / math.tan(ang / 2), la * 0.48, lb * 0.48)
        s0, s1 = p1 + a * k, p1 + b * k
        nn = max(2, segs(n, 2))
        for j in range(nn + 1):
            t = j / nn
            out.append(s0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + s1 * t * t)
    out.append(pts[-1])
    return out


def resample(pts, step):
    """A polyline resampled at a (roughly) even step."""
    pts = [Vector(p) for p in pts]
    L = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
    n = max(1, int(round(L / step)))
    return along(pts, [L * i / n for i in range(n + 1)])


def along(pts, dists):
    out = []
    acc = [0.0]
    for i in range(len(pts) - 1):
        acc.append(acc[-1] + (pts[i + 1] - pts[i]).length)
    j = 0
    for d in dists:
        while j < len(pts) - 2 and acc[j + 1] < d:
            j += 1
        seg = acc[j + 1] - acc[j]
        t = 0 if seg < 1e-9 else (d - acc[j]) / seg
        out.append(pts[j].lerp(pts[j + 1], max(0, min(1, t))))
    return out


def length(pts):
    return sum((Vector(pts[i + 1]) - Vector(pts[i])).length for i in range(len(pts) - 1))


# ── sweeps ───────────────────────────────────────────────────────────────────────────────────────────────────


def sweep(name, pts, rad, kind, grp, n=16, up=None, cap=(True, True), smooth=True, rfun=None, closed=False, angle=50):
    """A profile swept along points. rad: a radius, a list (one a point), or (a, b) pairs — an ellipse, its a
    across `up` (the side) and its b along it. rfun(i, k, angle) → a radius multiplier (tape wraps, grip ribs).
    up: a hint vector (an oval's long axis lies along it); else the frame is carried along (parallel transport)."""
    pts = [Vector(p) for p in pts]
    m = len(pts)
    n = segs(n)
    if not isinstance(rad, (list, tuple)) or (len(rad) == 2 and not isinstance(rad[0], (list, tuple)) and m != 2):
        rad = [rad] * m
    rs = [(r, r) if not isinstance(r, (list, tuple)) else r for r in rad]
    verts, faces = [], []
    prev = None
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % m] - pts[(i - 1) % m]).normalized()
        else:
            t = (pts[min(i + 1, m - 1)] - pts[max(i - 1, 0)]).normalized()
        if up is not None:
            h = Vector(up)
            w = (h - t * t.dot(h))
            if w.length < 1e-6:
                w = Vector((0, 0, 1)) - t * t.z
            w.normalize()
            u = w.cross(t).normalized()
        else:
            if prev is None:
                hint = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                u = t.cross(hint).normalized()
            else:
                u = (prev - t * t.dot(prev)).normalized()
            prev = u
            w = t.cross(u).normalized()
        ra, rb = rs[i]
        for k in range(n):
            a = 2 * math.pi * k / n
            f = rfun(i, k, a) if rfun else 1.0
            verts.append(p + (u * math.cos(a) * ra + w * math.sin(a) * rb) * f)
    last = m if closed else m - 1
    for i in range(last):
        i2 = (i + 1) % m
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            c, d = i2 * n + (k + 1) % n, i2 * n + k
            faces.append((a, b, c, d))
    if not closed:
        if cap[0]:
            faces.append(tuple(range(n))[::-1])
        if cap[1]:
            s = (m - 1) * n
            faces.append(tuple(range(s, s + n)))
    o = mk(name, verts, faces, kind, grp, smooth, angle)
    _fix_normals(o)
    return o


def _fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def rod(name, a, b, r, kind, grp, n=12, cap=True):
    return sweep(name, [a, b], r, kind, grp, n=n, cap=(cap, cap))


def cyl_ax(name, c, axis, r, L, kind, grp, n=16, r2=None):
    """A cylinder centred at c along an arbitrary axis."""
    ax = Vector(axis).normalized()
    c = Vector(c)
    return sweep(name, [c - ax * L / 2, c + ax * L / 2], [r, r if r2 is None else r2], kind, grp, n=n)


def lathe_ax(name, prof, c, axis, n, kind, grp, smooth=True, cap=True, angle=40):
    """kit.lathe's profile (r, h) turned about an arbitrary axis through c (h along the axis)."""
    o = lathe(name, prof, n, kind, grp, axis="z", cap=cap, smooth=smooth, angle=angle)
    ax = Vector(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(ax)
    o.data.transform(Matrix.Translation(Vector(c)) @ q.to_matrix().to_4x4())
    return o


def tube_y(name, prof, c, n, kind, grp, **kw):
    """A lathe about the bike's y (an axle) through c."""
    return lathe_ax(name, prof, c, (0, 1, 0), n, kind, grp, **kw)


def ring_prism(name, outer, inner, y0, y1, kind, grp, walls=(True, False)):
    """A flat ring in the x-z plane (outer and inner outlines, each [(x, z)] of the same count) between y0 and y1:
    a chainring, a cog, a cage plate — its outer wall and, if asked, its inner one."""
    n = len(outer)
    assert len(inner) == n
    verts = []
    for y in (y0, y1):
        verts += [(x, y, z) for x, z in outer]
        verts += [(x, y, z) for x, z in inner]
    faces = []
    o0, i0, o1, i1 = 0, n, 2 * n, 3 * n
    for k in range(n):
        j = (k + 1) % n
        faces.append((o0 + k, o0 + j, i0 + j, i0 + k))
        faces.append((o1 + k, i1 + k, i1 + j, o1 + j))
        if walls[0]:
            faces.append((o0 + k, o1 + k, o1 + j, o0 + j))
        if walls[1]:
            faces.append((i0 + k, i0 + j, i1 + j, i1 + k))
    o = mk(name, verts, faces, kind, grp, smooth=False)
    _fix_normals(o)
    return o


def teeth(T, r_pitch, depth, per=4, phase=0.0, cx=0.0, cz=0.0):
    """A sprocket's outline (x, z): T teeth round a pitch circle (each `per` points: root, flank, tip, flank)."""
    out = []
    rt = r_pitch + depth * 0.45
    rr = r_pitch - depth * 0.55
    for i in range(T):
        a0 = phase + 2 * math.pi * i / T
        st = 2 * math.pi / T
        if per >= 4:
            prof = [(0.0, rr), (0.3, r_pitch - depth * 0.1), (0.42, rt), (0.58, rt), (0.7, r_pitch - depth * 0.1)][: per + 1]
            prof = [(0.0, rr), (0.32, r_pitch), (0.5, rt), (0.68, r_pitch)] if per == 4 else prof
        elif per == 3:
            prof = [(0.0, rr), (0.4, rt), (0.6, rt)]
        else:
            prof = [(0.0, rr), (0.5, rt)]
        for f, r in prof:
            a = a0 + st * f
            out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return out


def circle2(r, n, cx=0.0, cz=0.0, phase=0.0):
    return [(cx + r * math.cos(phase + 2 * math.pi * i / n), cz + r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


def loft(name, sections, kind, grp, cap=(True, True), smooth=True, closed_sec=True, angle=50):
    """Sections (each a list of points, all the same count) joined in order."""
    m = len(sections)
    n = len(sections[0])
    verts = [tuple(p) for s in sections for p in s]
    faces = []
    kk = n if closed_sec else n - 1
    for i in range(m - 1):
        for k in range(kk):
            j = (k + 1) % n
            faces.append((i * n + k, i * n + j, (i + 1) * n + j, (i + 1) * n + k))
    if closed_sec:
        if cap[0]:
            faces.append(tuple(range(n))[::-1])
        if cap[1]:
            s = (m - 1) * n
            faces.append(tuple(range(s, s + n)))
    o = mk(name, verts, faces, kind, grp, smooth, angle)
    _fix_normals(o)
    return o


def plate_xz(name, outline, y0, y1, kind, grp, smooth=False):
    """A flat outline in x-z extruded between y0 and y1 (a dropout, a cage plate, a crank's spider)."""
    return kit.prism(name, outline, y0, y1, kind, grp, smooth)


def helix(name, c, axis, r, pitch, turns, wire, kind, grp, n_per=14, ends=0):
    """A coil spring about an axis through c (its first coil at c)."""
    ax = Vector(axis).normalized()
    q = Vector((0, 0, 1)).rotation_difference(ax).to_matrix()
    pts = []
    N = max(8, int(turns * segs(n_per, 6)))
    for i in range(N + 1):
        t = i / N
        a = 2 * math.pi * turns * t
        h = pitch * turns * t
        pts.append(Vector(c) + q @ Vector((r * math.cos(a), r * math.sin(a), h)))
    return sweep(name, pts, wire, kind, grp, n=5)


# ── the belt: a chain's line round its sprockets ───────────────────────────────────────────────────────────────


def belt(circles, n_arc=24):
    """A closed path (x, z) round circles [(cx, cz, r, s)] in order, s = +1 wrapped anticlockwise (seen from the
    bike's right, x to the right, z up), −1 clockwise. Returns the polyline (closed: last ≠ first)."""
    m = len(circles)
    tang = []
    for i in range(m):
        ax, az, ra, sa = circles[i]
        bx, bz, rb, sb = circles[(i + 1) % m]
        dx, dz = bx - ax, bz - az
        D = math.hypot(dx, dz)
        k = sb * rb - sa * ra
        phi = math.atan2(dz, dx)
        th = phi - math.asin(max(-1, min(1, k / D)))
        tx, tz = math.cos(th), math.sin(th)
        lx, lz = -tz, tx
        pa = (ax - sa * ra * lx, az - sa * ra * lz)
        pb = (bx - sb * rb * lx, bz - sb * rb * lz)
        tang.append((pa, pb))
    out = []
    for i in range(m):
        cx, cz, r, s = circles[i]
        pin = tang[i - 1][1]
        pout = tang[i][0]
        a0 = math.atan2(pin[1] - cz, pin[0] - cx)
        a1 = math.atan2(pout[1] - cz, pout[0] - cx)
        if s > 0:
            d = (a1 - a0) % (2 * math.pi)
        else:
            d = -((a0 - a1) % (2 * math.pi))
        k = max(2, int(abs(d) / (2 * math.pi) * n_arc * 2))
        for j in range(k + 1):
            a = a0 + d * j / k
            out.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return out


# ── decals: real text on a tube ────────────────────────────────────────────────────────────────────────────────


def text_mesh(text, size, bold=False):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = text
    cu.size = size
    cu.resolution_u = 2 if near() else 1
    cu.extrude = 0.0
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    if bold:
        cu.offset = size * 0.012
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    return me


def decal_tube(name, text, size, a, b, r, side, kind, grp, at=0.5, stretch=1.0, rise=0.0, bold=False):
    """Text laid on a tube's side (side +1: the left, read front to back; −1: the right, read back to front),
    centred `at` along a→b, wrapped round its radius r."""
    me = text_mesh(text, size, bold)
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    s = Vector((0, side, 0))
    s = (s - d * d.dot(s)).normalized()
    q = d.cross(s).normalized()
    if q.z < 0:
        q = -q
    # reading direction: on the left (+y) the text's +x runs toward −x of the bike (front to back as seen)
    rd = d if (d.x < 0) == (side > 0) else -d
    c = a.lerp(b, at)
    rr = r + 0.00035
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # (long triangles would cut through the tube's curve as chords: split until no edge spans much of the arc)
    lim = max(0.0035, r * 0.36)
    for _ in range(4):
        long_ = [e for e in bm.edges if abs(e.verts[0].co.y - e.verts[1].co.y) > lim]
        if not long_:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for v in bm.verts:
        u, w = v.co.x * stretch, v.co.y + rise
        ang = w / rr
        v.co = c + rd * u + (s * math.cos(ang) + q * math.sin(ang)) * rr
    bm.to_mesh(me)
    bm.free()
    o = kit.obj(name, me, kind, grp, smooth=False)
    # (faces outward)
    me.update()
    for p in me.polygons:
        if p.normal.dot(p.center - (c + d * d.dot(p.center - c))) < 0:
            p.flip()
    return o


def decal_flat(name, text, size, c, right, up, kind, grp, depth=0.0006, bold=False):
    """Text on a flat face: centred c, its reading direction `right`, its up `up` (a number plate)."""
    me = text_mesh(text, size, bold)
    R, U = Vector(right).normalized(), Vector(up).normalized()
    N = R.cross(U)
    for v in me.vertices:
        v.co = Vector(c) + R * v.co.x + U * v.co.y + N * depth
    o = kit.obj(name, me, kind, grp, smooth=False)
    for p in me.polygons:
        if p.normal.dot(N) < 0:
            p.flip()
    return o


# ── frames for pivots ─────────────────────────────────────────────────────────────────────────────────────────


def basis(y_dir, z_dir, at):
    """A Blender world matrix for a pivot whose glTF local y points along y_dir and local z along z_dir (both in
    Blender's world). (glTF's local y is Blender's local z; glTF's local z is Blender's local −y.)"""
    U = Vector(y_dir).normalized()
    W = Vector(z_dir)
    W = (W - U * U.dot(W)).normalized()
    X = U.cross(W).normalized()
    M = Matrix((X, -W, U)).transposed()  # columns: local x, local y, local z
    m4 = M.to_4x4()
    m4.translation = Vector(at)
    return m4


def ident(at):
    m = Matrix.Identity(4)
    m.translation = Vector(at)
    return m

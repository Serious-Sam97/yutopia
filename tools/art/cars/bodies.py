# Plan 92 — the road cars' bodies: a lofted lower body (sections along the car, its sides, shoulder crease and
# rounded plan corners) and a greenhouse (its side profile extruded, tumbled in toward the roof, its edges
# rounded); the wheel arches, the window openings, the doors, the bonnet and the boot cut out of them by
# booleans — real panels with real gaps, each in its own group (`door_fl`…) to be hung on its hinge.
#
# A body is described nose to tail by `s`, metres back from the nose (the old sedan.ts's measure); the car's
# frame x = ahead − s (forward from the centre of gravity), y its left, z up (kit.py).
import math

from mathutils import Vector

import kit

GAP = 0.0045  # a panel's gap
STEP = 1.0  # (the loft's spacing: the mid level's coarser)
RES = 1.0  # (the sections' points: the mid level's fewer)


def lerp_table(tab, s):
    """A piecewise-linear table [(s, v)…] at s (clamped)."""
    if s <= tab[0][0]:
        return tab[0][1]
    for (s0, v0), (s1, v1) in zip(tab, tab[1:]):
        if s <= s1:
            t = (s - s0) / (s1 - s0) if s1 > s0 else 0
            return v0 + (v1 - v0) * t
    return tab[-1][1]


def smooth_table(tab, s):
    """The same with a smoothstep between points (curved hoods)."""
    if s <= tab[0][0]:
        return tab[0][1]
    for (s0, v0), (s1, v1) in zip(tab, tab[1:]):
        if s <= s1:
            t = (s - s0) / (s1 - s0) if s1 > s0 else 0
            t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return tab[-1][1]


def pchip_table(tab, s):
    """A table [(s, v)…] at s through a monotone cubic (quality pass 2: smooth through its points — the old
    smoothstep stopped flat at each one, a ripple down the wings)."""
    n = len(tab)
    if s <= tab[0][0]:
        return tab[0][1]
    if s >= tab[-1][0]:
        return tab[-1][1]
    xs = [p[0] for p in tab]
    ys = [p[1] for p in tab]
    d = [(ys[i + 1] - ys[i]) / max(1e-9, xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1])
            w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1])
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    for i in range(n - 1):
        if s <= xs[i + 1]:
            h = xs[i + 1] - xs[i]
            t = (s - xs[i]) / h
            h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
            return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]
    return ys[-1]


class Body:
    """A road body's numbers (see SALOON for each field's meaning) and what's been made of it."""

    def __init__(self, d):
        self.__dict__.update(d)
        self.parts = []
        self.refs = []

    def on_skin(self, p, n, tol=0.004):
        """Whether a face (its centre p, its normal n) lies on the shell's outer skin (not a cut's wall)."""
        for r in self.refs:
            d, rn = r.at(p, 0.02)
            if d is not None and d < tol and abs(n.dot(rn)) > 0.6:
                return True
        return False

    def x(self, s):
        return self.ahead - s

    # the lower body's width at s (its plan's rounded corners)
    def hw(self, s):
        w = self.W / 2
        rf, rr = self.plan_r
        if s < rf:
            w -= rf - math.sqrt(max(0.0, rf * rf - (rf - s) ** 2))
        elif s > self.L - rr:
            d = s - (self.L - rr)
            w -= rr - math.sqrt(max(0.0, rr * rr - d * d))
        return w

    def zt(self, s):
        return pchip_table(self.top, s)

    def zt_was(self, s):
        """The top line as it was measured for the hull and the lids' hinges (kept: they mustn't move)."""
        return smooth_table(self.top, s)

    def zb(self, s):
        return lerp_table(self.bottom, s)

    # the greenhouse's top line at s (its windscreen, roof and back light) — none outside it
    def gh_top(self, s):
        c = self.gh
        if s < c[0][0] or s > c[-1][0]:
            return None
        return lerp_table(c, s)

    def gh_hw(self, z):
        """The greenhouse's half-width at height z (tumbled in from the belt to the roof — curved since quality
        pass 2: the side glass bows out, `gh_curve` its power)."""
        t = max(0.0, min(1.0, (z - self.belt) / max(1e-3, self.roof - self.belt)))
        return self.HB + (self.HR - self.HB) * t ** getattr(self, "gh_curve", 1.0)

    def gh_hw_lin(self, z):
        """The straight tumble the Jolt hull was measured on (dress.collider: kept as it was)."""
        t = (z - self.belt) / max(1e-3, self.roof - self.belt)
        return self.HB + (self.HR - self.HB) * max(0.0, min(1.0, t))

    def bow(self, s, y):
        """The plan's bowed ends (quality pass 2): how far a point of the lower body at (s, y) moves along x —
        the nose's corners drawn back (−), the tail's forward (+); the middle of each end where it was."""
        u = min(1.0, (y / (self.W / 2)) ** 2)
        df = max(0.0, min(1.0, 1 - s / 0.6))
        dr = max(0.0, min(1.0, 1 - (self.L - s) / 0.6))
        return -getattr(self, "bow_f", 0.0) * u * df * df + getattr(self, "bow_r", 0.0) * u * dr * dr


# ── the lower body: a loft ─────────────────────────────────────────────────────────────────────────────────


def section(b, s, inset=0.0):
    """The lower body's cross-section at s: (y, z) round it, from the bottom's middle, up the left side,
    over the top and down the right, as a closed loop (counter-clockwise seen from ahead)."""
    hw = b.hw(s) - inset
    zb = b.zb(s) + inset
    zt = b.zt(s) - inset
    rb = min(b.r_bottom, (zt - zb) * 0.3)
    rt = min(b.r_top, (zt - zb) * 0.3)
    crease = zt - b.crease  # the shoulder's crease line
    tin = b.tumble_top  # how far the band above the crease leans in
    left = []
    q = RES  # (the mid level: fewer points round each section)
    nc, ns, nt = (int(5 * q), int(6 * q), int(7 * q)) if q >= 1 else (2, 3, 2)
    # the bottom, to its corner
    left += [(0.0, zb), (hw * 0.45, zb), (hw - rb, zb)]
    for i in range(1, nc):
        a = math.pi / 2 * i / nc
        left.append((hw - rb + rb * math.sin(a), zb + rb - rb * math.cos(a)))
    # the side: a slight bulge between the sill and the crease
    z0, z1 = zb + rb, crease
    for i in range(ns):
        t = i / (ns - 1)
        z = z0 + (z1 - z0) * t
        left.append((hw + b.bulge * math.sin(math.pi * t) - getattr(b, "tuck", 0.012) * (1 - t) ** 2.2, z))
    # above the crease: leaning in to the top corner, then round onto the top
    left.append((hw - tin * 0.3, crease + (zt - rt - crease) * 0.35))
    left.append((hw - tin * 0.62, crease + (zt - rt - crease) * 0.72))
    cy, cz = hw - tin - rt, zt - rt
    for i in range(0, nc + 1):
        a = math.pi / 2 * i / nc
        left.append((cy + rt * math.cos(a), cz + rt * math.sin(a)))
    # the top, crowned to the middle
    top_w = cy
    for i in range(1, nt + 1):
        t = i / nt
        y = top_w * (1 - t)
        # (a crown that's flat in the middle and falls to the shoulders: the bonnet's, the boot's)
        u = y / max(top_w, 1e-3)
        left.append((y, zt + b.crown * (1 - 0.6 * u * u - 0.4 * u ** 4)))
    # left: bottom middle → top middle; the right is its mirror (top middle excluded, bottom middle shared)
    right = [(-y, z) for y, z in reversed(left[1:-1])]
    return left + right


def loft_lower(b):
    """The lower body as one closed mesh: a section every ~5 cm (closer at the ends), the nose and tail rounded
    over by two shrinking rings and capped."""
    ss = []
    s = 0.0
    while s < b.L:
        ss.append(s)
        near_end = s < 0.35 or s > b.L - 0.35
        s += (0.033 if near_end else 0.08) * STEP
    ss.append(b.L)
    rings = [(s, b.x(s), section(b, s)) for s in ss]
    # the round-over at each end: three rings shrinking in (a rolled edge, not a flat face)
    # (a last ring a little further in, all but flat: the cap's long fan then shades flat, not in streaks)
    over = ((0.007, 0.008), (0.014, 0.022), (0.0195, 0.045), (0.0205, 0.075))
    nose = [(0.0, b.x(-dx), section(b, 0.0, ins)) for dx, ins in over]
    tail = [(b.L, b.x(b.L + dx), section(b, b.L, ins)) for dx, ins in over]
    rings = nose[::-1] + rings + tail
    n = len(rings[0][2])
    verts, faces = [], []
    for s, x, sec in rings:
        for y, z in sec:
            verts.append((x + b.bow(s, y), y, z))
    for i in range(len(rings) - 1):
        for k in range(n):
            a, c = i * n + k, i * n + (k + 1) % n
            faces.append((a, c, c + n, a + n))
    # caps (rings go nose → tail, x decreasing): fans to their middles (the bowed rings aren't flat)
    last = (len(rings) - 1) * n
    for ring0, rev in ((0, False), (last, True)):
        cv = [sum(verts[ring0 + k][a] for k in range(n)) / n for a in range(3)]
        ci = len(verts)
        verts.append(tuple(cv))
        for k in range(n):
            a, c = ring0 + k, ring0 + (k + 1) % n
            faces.append((a, c, ci) if not rev else (c, a, ci))
    o = kit.mk("lower", verts, faces, "paint", "body", smooth=True, angle=50)
    # the faces' winding: outward (the loft's direction as drawn may be inward)
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def open_cabin(b, o):
    """The lower body's top taken off over the cabin (and a pickup's bed): what the greenhouse sits on."""
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(o.data)
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        s = b.ahead - c.x
        for s0, s1, hw in b.openings:
            if s0 < s < s1 and abs(c.y) < hw and c.z > b.zt(s) - 0.03 and f.normal.z > 0.5:
                dead.append(f)
                break
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


# ── the greenhouse ─────────────────────────────────────────────────────────────────────────────────────────


def greenhouse(b, fine=1):
    """The cabin above the belt: its side profile (the windscreen, the roof, the back) extruded across, the
    upper part tumbled in to the roof's width, the roof crowned, its edges rounded; open underneath. (`fine`:
    more cuts — the reference the normals are taken from.)"""
    chain = b.gh  # [(s, z)…] cowl → … → back, both ends on the belt
    poly = [(b.x(s), z) for s, z in chain]
    o = kit.prism("greenhouse", poly, -b.HB, b.HB, "paint", "body")
    # (finer: the roof and pillars bend smoothly once rounded)
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(o.data)
    # the bottom face off (it sits on the lower body)
    dead = [f for f in bm.faces if f.normal.z < -0.9]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    # cut across the roof and sides so the tumble bends them
    nz_, ny_ = (6 * fine, 10 * fine) if RES >= 1 else (3, 4)
    for i in range(1, nz_):
        z = b.belt + (b.roof - b.belt) * i / nz_
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    for k in range(1, ny_):
        y = -b.HB + 2 * b.HB * k / ny_
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, y, 0), plane_no=(0, 1, 0))
    for v in bm.verts:
        k = b.gh_hw(v.co.z) / b.HB
        v.co.y *= k
    # the roof crowned: its edges drawn down (its middle stays at `roof`)
    cr = getattr(b, "crown_r", 0.0)
    if cr:
        for v in bm.verts:
            w = max(0.0, min(1.0, (v.co.z - (b.roof - 0.06)) / 0.05))
            v.co.z -= cr * w * (v.co.y / max(b.HR, 1e-3)) ** 2
    # the plan: the windscreen's and back light's corners pulled back a little (the glass wraps) — each end its
    # own (a near-vertical tailgate none: it would fold into its own corner)
    xs = [b.x(s) for s, _ in chain]
    xf, xr = max(xs), min(xs)
    wf, wr = getattr(b, "wrap_f", b.wrap), getattr(b, "wrap_r", b.wrap)
    for v in bm.verts:
        u = abs(v.co.y) / max(b.HB, 1e-3)
        if v.co.x > (xf + xr) / 2:
            v.co.x -= wf * u * u * max(0.0, 1 - (xf - v.co.x) / 0.6)
        else:
            v.co.x += wr * u * u * max(0.0, 1 - (v.co.x - xr) / 0.6)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    kit.bevel(o, b.gh_round, 5, angle=25)
    return o


# ── openings: arches, windows, panels ──────────────────────────────────────────────────────────────────────


def arch_cutter(b, s, r, name):
    o = kit.cyl(name, (b.x(s), 0, b.arch_z), r, b.W + 0.4, "collider", n=48)
    return o


def window_cutter(name, quad, depth=0.25):
    """A cutter through a window: its outline's 4+ corners (3D, on the surface) pushed both ways along the
    outline's normal."""
    pts = [Vector(p) for p in quad]
    c = sum(pts, Vector()) / len(pts)
    nrm = (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized()
    if nrm.dot(c - Vector((c.x * 0.0, 0, 1.0))) < 0:
        pass
    n = len(pts)
    verts = [p + nrm * depth for p in pts] + [p - nrm * depth for p in pts]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    o = kit.mk(name, verts, faces, "collider", smooth=False)
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def side_prism(name, poly_sz, y0, y1, b):
    """A cutter: a side outline (s, z) through y0..y1."""
    poly = [(b.x(s), z) for s, z in poly_sz]
    return kit.prism(name, poly, min(y0, y1), max(y0, y1), "collider")


def eroded_top(b, s, e, drop):
    """The greenhouse's top line at s, eroded e along the car either way and dropped `drop`: a door frame's or
    a window's top."""
    vals = [b.gh_top(s + d) for d in (-e, 0.0, e)]
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    return min(vals) - drop


def door_outline(b, s0, s1, bottom, frame=True, gap=0.0):
    """A door's side outline (s, z): from its bottom up to its frame's top along the greenhouse (eroded so the
    pillars stay on the body), grown by `gap`."""
    pts = [(s0, bottom), (s1, bottom)]
    if frame:
        top = []
        n = 14
        for i in range(n + 1):
            s = s1 + (s0 - s1) * i / n
            z = eroded_top(b, s, 0.065, 0.028)
            if z is None or z < b.belt:
                z = b.belt + 0.005
            top.append((s, z))
        pts += [(s1, b.belt)] + top + [(s0, b.belt)]
    else:
        pts += [(s1, b.belt + 0.002), (s0, b.belt + 0.002)]
    pts = dedupe(pts)
    if gap:
        pts = kit.offset_poly(pts, gap)
    return pts


def dlo(b, s0, s1, inset=0.06, drop=0.075, bottom=0.03):
    """A side window's outline (s, z) between s0 and s1: under the eroded top line, over the belt."""
    pts = []
    n = 16
    for i in range(n + 1):
        s = s0 + inset + (s1 - s0 - 2 * inset) * i / n
        z = eroded_top(b, s, 0.1, drop)
        if z is None:
            continue
        pts.append((s, max(z, b.belt + bottom + 0.02)))
    pts = [(pts[-1][0], b.belt + bottom), (pts[0][0], b.belt + bottom)] + pts
    return kit.round_poly(dedupe(pts), 0.035, 3)


def dedupe(pts, eps=1e-4):
    out = []
    for p in pts:
        if not out or (abs(out[-1][0] - p[0]) > eps or abs(out[-1][1] - p[1]) > eps):
            out.append(p)
    if len(out) > 2 and abs(out[0][0] - out[-1][0]) < eps and abs(out[0][1] - out[-1][1]) < eps:
        out.pop()
    return out


def on_side(b, s, z, side=1, out=0.0):
    """A point on the car's side at (s, z): on the greenhouse above the belt, the lower body below."""
    if z > b.belt:
        y = b.gh_hw(z)
    else:
        y = b.hw(s) + b.bulge * 0.6
    return Vector((b.x(s), side * (y + out), z))


def cut_panels(b, lower, gh):
    """The arches, the windows and the opening panels cut; returns {group: [objects]} of the cut panels and the
    body's own pieces."""
    made = {"body": []}
    # (quality pass 2) the nose's openings for the lamps and the grille: they sit in recesses, not on the skin
    for i, (yc, zc, w, h, r, yaw) in enumerate(getattr(b, "holes", [])):
        poly = kit.rrect(w, h, r, 4 if r < min(w, h) / 2 - 1e-4 else 10)
        xs = b.x(0) + 0.02 + b.bow(0.0, yc)
        c = kit.xprism(f"cut.hole{i}", [(yc + y, zc + z) for y, z in poly], xs - 0.16, xs + 0.12, "collider")
        kit.rot(c, "Z", yaw, (xs, yc, zc))
        kit.boolean(lower, c)
        kit.kill(c)
    # the arches (through the lower body only)
    for i, (s, r) in enumerate(b.arches):
        c = arch_cutter(b, s, r, f"arch{i}")
        kit.boolean(lower, c)
        kit.kill(c)
    # the windscreen and the back light(s): cut through the greenhouse
    for name, quad, _grp in b.glass_holes():
        c = window_cutter("cut." + name, quad)
        kit.boolean(gh, c)
        kit.kill(c)
    # the fixed side windows (quarter lights): cut, glazed on the body
    for s0, s1, side in b.quarter_list():
        poly = dlo(b, s0, s1, inset=0.05)
        c = side_prism("cut.q", poly, side * 0.3, side * 1.4, b)
        kit.boolean(gh, c)
        kit.kill(c)
    # the doors and lids: each a cutter; the panel = what's inside it (shrunk half a gap), the body = what's
    # outside it (grown half a gap)
    for d in b.door_list():
        grp, side = d["grp"], d["side"]
        y0, y1 = (side * 0.42, side * 1.5)
        inner = door_outline(b, d["s0"], d["s1"], d["bottom"], d.get("frame", True), -GAP * 0.35)
        outer = door_outline(b, d["s0"], d["s1"], d["bottom"], d.get("frame", True), GAP * 0.65)
        panels = take(b, (lower, gh), grp, inner, outer, (y0, y1), (y0, y1))
        if d.get("frame", True) and d.get("window", True):
            for p in panels:
                if p.name.endswith("greenhouse"):
                    poly = dlo(b, d["s0"], d["s1"])
                    c = side_prism("cut.dlo", poly, side * 0.3, side * 1.4, b)
                    kit.boolean(p, c)
                    kit.kill(c)
        made[grp] = panels
    for lid in b.lids():
        grp = lid["grp"]
        inner, outer = lid["outline"](b, -GAP * 0.35), lid["outline"](b, GAP * 0.65)
        y0, y1 = lid["y"]
        srcs = (lower,) if lid.get("lower_only") else (lower, gh)
        made[grp] = take(b, srcs, grp, inner, outer, (y0 + GAP * 0.35, y1 - GAP * 0.35), (y0 - GAP * 0.65, y1 + GAP * 0.65))
    made["body"] += [lower, gh]
    return made


def take(b, srcs, grp, inner, outer, yin, yout):
    """A panel taken out of the sources: its piece (what's inside `inner`) and the hole left (`outer`)."""
    panels = []
    for src in srcs:
        ci = side_prism("cut.in", inner, yin[0], yin[1], b)
        piece = kit.copy(src, f"{grp}.{src.name}", grp=grp)
        kit.boolean(piece, ci, "INTERSECT")
        kit.kill(ci)
        if len(piece.data.polygons):
            panels.append(piece)
        else:
            kit.kill(piece)
        co = side_prism("cut.out", outer, yout[0], yout[1], b)
        kit.boolean(src, co)
        kit.kill(co)
    return panels


def slope_quad(b, s0, z0, s1, z1, side_in, bot_in, top_in, ymax=None, ymin=None):
    """A window on a sloped face (the windscreen: from its foot (s0, z0) up to its top (s1, z1)): its four
    corners inset from the pillars and the roof, on the skin. `ymax` caps its half-width (a tailgate's glass),
    `ymin` starts it off the middle (a twin door's: then y runs ymin..ymax on the left)."""
    L = math.hypot(s1 - s0, z1 - z0)
    ta, tb = bot_in / L, 1 - top_in / L
    pts = []
    for t, which in ((ta, 0), (tb, 0), (tb, 1), (ta, 1)):
        s = s0 + (s1 - s0) * t
        z = z0 + (z1 - z0) * t
        hw = b.gh_hw(z) - side_in
        if ymax is not None:
            hw = min(hw, ymax)
        if ymin is None:
            y = hw if which == 0 else -hw
        else:
            y = hw if which == 0 else ymin
        pts.append((b.x(s), y, z))
    return pts


# ── the bodies ─────────────────────────────────────────────────────────────────────────────────────────────


class Road(Body):
    """A road car: its doors both sides, its lids by its boot's kind:
    deck      a saloon's boot lid (hinged at its front, on the deck)
    tailgate  hinged on the roof's back edge, the back light in it (an estate, a hatch)
    side      one rear door hinged on its right (a 4x4)
    twin      two rear doors hinged at the sides (a van)
    drop      a pickup's tailgate, hinged at the bottom
    none      no opening at the back (a flatbed's: its own)"""

    def door_list(self):
        out = []
        for d in self.doors:
            sides = d.get("sides", (1, -1))
            for side in sides:
                tag = "l" if side > 0 else "r"
                out.append(dict(d, grp=d["grp"] + tag, side=side))
        return out

    def quarter_list(self):
        out = []
        for q in self.quarters:
            if len(q) == 3:
                out.append(q)
            else:
                out += [(q[0], q[1], 1), (q[0], q[1], -1)]
        return out

    def lid_hw(self):
        return self.boot.get("hw", self.HR - 0.07)

    def glass_holes(self):
        """(name, quad, group) for the windscreen and the back light(s)."""
        b = self
        out = []
        (sc, zc), (sa, za) = b.gh[0], b.gh[1]
        out.append(("windscreen", slope_quad(b, sc, zc, sa, za, 0.075, 0.035, 0.05), "body"))
        if not b.back_glass:
            return out
        (sr, zr), (sk, zk) = b.gh[-2], b.gh[-1]
        k = b.boot["kind"]
        if k == "deck" or k == "drop" or k == "none":
            out.append(("backlight", slope_quad(b, sk, zk, sr, zr, 0.085, 0.04 if k == "deck" else 0.06, 0.05), "body"))
        elif k in ("tailgate", "side"):
            out.append(("backlight", slope_quad(b, sk, zk, sr, zr, 0.085, b.boot.get("glass_bot", 0.06), 0.06, ymax=b.lid_hw() - 0.06), "boot"))
        elif k == "twin":
            hw = b.lid_hw() - 0.06
            out.append(("backlight_l", slope_quad(b, sk, zk, sr, zr, 0.085, b.boot.get("glass_bot", 0.06), 0.06, ymax=hw, ymin=0.05), "boot_l"))
            q = slope_quad(b, sk, zk, sr, zr, 0.085, b.boot.get("glass_bot", 0.06), 0.06, ymax=hw, ymin=0.05)
            out.append(("backlight_r", [(x, -y, z) for x, y, z in q], "boot_r"))
        return out

    def lids(self):
        b = self
        out = []
        h = b.hood
        top = b.roof + 0.5

        def hood_outline(b, g):
            chain = [(h["s0"] + (h["s1"] - h["s0"]) * i / 20, 0.0) for i in range(21)]
            chain = [(s, b.zt(s) - 0.05) for s, _ in chain]
            pts = dedupe([(-0.3, top), (-0.3, chain[0][1])] + chain + [(h["s1"], top)])
            return kit.offset_poly(pts, g) if g else pts

        if h:
            out.append(dict(grp="bonnet", outline=hood_outline, y=(-(b.W / 2 - 0.075), b.W / 2 - 0.075), lower_only=True))
        k = b.boot
        hw = b.lid_hw()
        if k["kind"] == "deck":

            def deck(b, g):
                e = b.L - 0.06
                chain = [(k["s0"] + (e - k["s0"]) * i / 14, 0.0) for i in range(15)]
                chain = [(s, b.zt(s) - 0.05) for s, _ in chain]
                pts = dedupe([(k["s0"], top)] + chain + [(e, k["z_low"]), (b.L + 0.3, k["z_low"]), (b.L + 0.3, top)])
                return kit.offset_poly(pts, g) if g else pts

            out.append(dict(grp="boot", outline=deck, y=(-hw, hw), lower_only=True))
        elif k["kind"] in ("tailgate", "side", "twin", "drop"):
            s_cut = k.get("hinge_s", b.L - 0.05)
            z_top = k.get("z_top", top)

            def rect(b, g):
                pts = [(s_cut, z_top), (s_cut, k["z_low"]), (b.L + 0.3, k["z_low"]), (b.L + 0.3, z_top)]
                return kit.offset_poly(pts, g) if g else pts

            lower_only = k["kind"] == "drop"
            if k["kind"] == "twin":
                out.append(dict(grp="boot_l", outline=rect, y=(0.0 + GAP, hw), lower_only=False))
                out.append(dict(grp="boot_r", outline=rect, y=(-hw, -GAP), lower_only=False))
            else:
                out.append(dict(grp="boot", outline=rect, y=(-hw, hw), lower_only=lower_only))
        return out


Saloon = Road


def build_shell(spec):
    global STEP, RES
    b = Road(spec)
    lower = loft_lower(b)
    open_cabin(b, lower)
    kit.solidify(lower, 0.022)
    gh = greenhouse(b)
    kit.solidify(gh, 0.02)
    made = cut_panels(b, lower, gh)
    # (quality pass 2) the shell's normals from itself made finer and uncut: one smooth skin over every panel
    st, rs = STEP, RES
    STEP, RES = 0.5, 2.0
    refs = [loft_lower(b), greenhouse(b, fine=2)]
    STEP, RES = st, rs
    b.refs = []
    for r, keep in zip(refs, ("lower", "greenhouse")):
        ref = kit.Ref([r])
        b.refs.append(ref)
        for grp, obs in made.items():
            for o in obs:
                if o.name == keep or o.name.endswith("." + keep):
                    kit.skin_normals(o, ref)
        kit.kill(r)
    return b, made


# ── the bodies' numbers (s back from the nose; z up from the ground) ───────────────────────────────────────

SALOON = dict(
    id="saloon",
    bow_f=0.06,
    bow_r=0.045,
    crown_r=0.022,
    gh_curve=1.5,
    tuck=0.022,
    kind="sedan",
    L=4.9,
    W=1.84,
    ahead=2.32,  # the centre of gravity's distance back from the nose (shared car/body.ts)
    axle_f=0.95,
    axle_r=3.8,
    wheel_r=0.317,
    wheel_w=0.195,
    track=0.76,  # a wheel centre's distance off the middle
    cog=0.52,
    arch_z=0.317,
    arches=[(0.95, 0.4), (3.8, 0.4)],
    plan_r=(0.24, 0.2),
    r_bottom=0.06,
    r_top=0.05,
    crease=0.075,
    tumble_top=0.035,
    bulge=0.016,
    crown=0.032,
    bottom=[(0.0, 0.42), (0.2, 0.36), (0.55, 0.3), (1.0, 0.27), (3.4, 0.26), (4.3, 0.3), (4.7, 0.36), (4.9, 0.4)],
    top=[(0.0, 0.73), (0.06, 0.8), (0.16, 0.845), (0.45, 0.872), (1.2, 0.925), (1.64, 0.955), (3.0, 0.965), (3.95, 0.975), (4.82, 0.968), (4.9, 0.92)],
    belt=0.965,
    roof=1.53,
    HB=0.875,
    HR=0.72,
    wrap=0.1,
    gh_round=0.06,
    gh=[(1.66, 0.958), (2.33, 1.5), (2.48, 1.53), (3.25, 1.535), (3.45, 1.515), (3.97, 0.973)],
    back_glass=True,
    openings=[(1.6, 3.98, 0.86)],
    quarters=[],
    doors=[
        dict(grp="door_f", s0=1.71, s1=2.82, bottom=0.28),
        dict(grp="door_r", s0=2.825, s1=3.68, bottom=0.28),
    ],
    hood=dict(s0=0.05, s1=1.635),
    boot=dict(kind="deck", s0=3.99, z_low=0.62, plate_z=0.735, hw=0.65),
    bumper_z=0.31,
    lamp_z=0.6,
    tail_z=(0.67, 0.87),
    tail_wrap=0.66,
    moulding_z=0.49,
    cabin=dict(floor=0.3, back=3.97, wheel_s=2.27, wheel_z=0.92, lever_s=2.36, front_s=2.68, rear_s=3.47, hip=0.47, boot_floor=0.5),
)

ESTATE = dict(
    SALOON,
    id="estate",
    kind="estate",
    gh=[(1.66, 0.958), (2.33, 1.5), (2.48, 1.53), (4.58, 1.535), (4.74, 1.49), (4.86, 0.97)],
    openings=[(1.6, 4.86, 0.86)],
    quarters=[(3.72, 4.74)],
    boot=dict(kind="tailgate", hinge_s=4.66, z_low=0.5, plate_z=0.74, hw=0.66),
    wrap_r=0.0,
    bow_r=0.0,
    tail_z=(0.6, 0.95),
    tail_wrap=0.7,
    cabin=dict(SALOON["cabin"], back=4.8, boot_floor=0.5),
)

HATCH = dict(
    id="hatch",
    bow_f=0.05,
    bow_r=0.0,
    crown_r=0.018,
    gh_curve=1.45,
    tuck=0.02,
    kind="hatch",
    L=3.95,
    W=1.66,
    ahead=1.74,
    axle_f=0.78,
    axle_r=3.18,
    wheel_r=0.29,
    wheel_w=0.175,
    track=0.7,
    cog=0.5,
    arch_z=0.29,
    arches=[(0.78, 0.37), (3.18, 0.37)],
    plan_r=(0.2, 0.16),
    r_bottom=0.05,
    r_top=0.045,
    crease=0.07,
    tumble_top=0.03,
    bulge=0.014,
    crown=0.028,
    bottom=[(0.0, 0.38), (0.2, 0.32), (0.5, 0.27), (1.0, 0.25), (2.9, 0.25), (3.6, 0.3), (3.95, 0.36)],
    top=[(0.0, 0.68), (0.05, 0.74), (0.14, 0.785), (0.4, 0.81), (0.9, 0.86), (1.24, 0.895), (3.0, 0.91), (3.88, 0.91), (3.95, 0.87)],
    belt=0.905,
    roof=1.39,
    HB=0.785,
    HR=0.655,
    wrap=0.08,
    gh_round=0.055,
    gh=[(1.25, 0.9), (1.9, 1.37), (2.04, 1.39), (3.05, 1.39), (3.5, 1.29), (3.86, 0.91)],
    back_glass=True,
    openings=[(1.2, 3.86, 0.76)],
    quarters=[(2.47, 3.45)],
    doors=[dict(grp="door_f", s0=1.3, s1=2.45, bottom=0.27)],
    hood=dict(s0=0.05, s1=1.22),
    boot=dict(kind="tailgate", hinge_s=3.07, z_low=0.5, plate_z=0.66, hw=0.6, glass_bot=0.05),
    bumper_z=0.28,
    lamp_z=0.57,
    tail_z=(0.6, 0.83),
    tail_wrap=0.62,
    moulding_z=0.45,
    cabin=dict(floor=0.28, back=3.5, wheel_s=1.85, wheel_z=0.86, lever_s=1.95, front_s=2.25, rear_s=3.0, hip=0.44, boot_floor=0.48),
)

OFFROAD = dict(
    id="4x4",
    bow_f=0.025,
    bow_r=0.0,
    crown_r=0.012,
    gh_curve=1.2,
    tuck=0.012,
    kind="offroad",
    L=3.8,
    W=1.7,
    ahead=1.9,
    axle_f=0.75,
    axle_r=2.95,
    wheel_r=0.36,
    wheel_w=0.205,
    track=0.71,
    cog=0.62,
    arch_z=0.36,
    arches=[(0.75, 0.47), (2.95, 0.47)],
    plan_r=(0.12, 0.1),
    r_bottom=0.04,
    r_top=0.03,
    crease=0.06,
    tumble_top=0.02,
    bulge=0.008,
    crown=0.016,
    bottom=[(0.0, 0.5), (0.3, 0.46), (1.2, 0.42), (2.45, 0.42), (3.5, 0.46), (3.8, 0.5)],
    top=[(0.0, 0.95), (0.03, 1.0), (0.1, 1.04), (0.3, 1.06), (1.1, 1.1), (1.2, 1.12), (3.7, 1.12), (3.8, 1.1)],
    belt=1.12,
    roof=1.73,
    HB=0.8,
    HR=0.74,
    wrap=0.03,
    wrap_r=0.0,
    gh_round=0.04,
    gh=[(1.22, 1.115), (1.56, 1.69), (1.66, 1.73), (3.66, 1.735), (3.76, 1.12)],
    back_glass=True,
    openings=[(1.18, 3.76, 0.77)],
    quarters=[(2.5, 3.66)],
    doors=[dict(grp="door_f", s0=1.24, s1=2.46, bottom=0.43)],
    hood=dict(s0=0.04, s1=1.18),
    boot=dict(kind="side", hinge_s=3.74, z_low=0.5, plate_z=0.72, hw=0.72, glass_bot=0.07),
    bumper_z=0.38,
    lamp_z=0.86,
    tail_z=(0.6, 0.86),
    tail_wrap=0.74,
    moulding_z=0.62,
    cabin=dict(floor=0.48, back=3.7, wheel_s=1.62, wheel_z=1.15, lever_s=1.75, front_s=2.08, rear_s=2.95, hip=0.68, boot_floor=0.6),
)

PICKUP = dict(
    id="pickup",
    bow_f=0.055,
    bow_r=0.0,
    crown_r=0.018,
    gh_curve=1.4,
    tuck=0.02,
    kind="pickup",
    L=5.2,
    W=1.88,
    ahead=2.36,
    axle_f=0.95,
    axle_r=4.1,
    wheel_r=0.34,
    wheel_w=0.215,
    track=0.77,
    cog=0.6,
    arch_z=0.34,
    arches=[(0.95, 0.45), (4.1, 0.45)],
    plan_r=(0.2, 0.06),
    r_bottom=0.05,
    r_top=0.04,
    crease=0.07,
    tumble_top=0.03,
    bulge=0.014,
    crown=0.028,
    bottom=[(0.0, 0.48), (0.5, 0.34), (1.42, 0.32), (3.63, 0.32), (4.6, 0.36), (5.2, 0.44)],
    top=[(0.0, 0.8), (0.04, 0.86), (0.12, 0.9), (0.4, 0.93), (1.2, 0.99), (1.62, 1.015), (5.15, 1.02), (5.2, 1.0)],
    belt=1.02,
    roof=1.62,
    HB=0.88,
    HR=0.76,
    wrap=0.08,
    gh_round=0.05,
    gh=[(1.66, 1.012), (2.22, 1.58), (2.34, 1.62), (3.2, 1.625), (3.3, 1.6), (3.33, 1.02)],
    back_glass=True,
    openings=[(1.6, 3.33, 0.86), (3.42, 5.13, 0.86)],
    quarters=[],
    doors=[dict(grp="door_f", s0=1.71, s1=2.86, bottom=0.33)],
    hood=dict(s0=0.04, s1=1.62),
    boot=dict(kind="drop", hinge_s=5.15, z_low=0.62, z_top=1.04, plate_z=0.55, hw=0.8, plate_on="body"),
    bed=dict(s0=3.4, s1=5.14, floor=0.62),
    bumper_z=0.36,
    lamp_z=0.74,
    tail_z=(0.62, 0.92),
    tail_wrap=0.88,
    moulding_z=0.58,
    cabin=dict(floor=0.4, back=3.33, wheel_s=2.3, wheel_z=1.0, lever_s=2.42, front_s=2.72, rows=[], hip=0.55, boot_floor=0.62),
)

VAN = dict(
    id="van",
    bow_f=0.05,
    bow_r=0.0,
    crown_r=0.016,
    gh_curve=1.25,
    tuck=0.016,
    kind="van",
    L=4.6,
    W=1.86,
    ahead=2.0,
    axle_f=0.72,
    axle_r=3.6,
    wheel_r=0.31,
    wheel_w=0.185,
    track=0.78,
    cog=0.75,
    arch_z=0.31,
    arches=[(0.72, 0.4), (3.6, 0.4)],
    plan_r=(0.22, 0.08),
    r_bottom=0.05,
    r_top=0.05,
    crease=0.06,
    tumble_top=0.03,
    bulge=0.012,
    crown=0.026,
    bottom=[(0.0, 0.42), (0.3, 0.34), (0.7, 0.3), (3.9, 0.3), (4.6, 0.36)],
    top=[(0.0, 0.78), (0.05, 0.86), (0.15, 0.92), (0.5, 0.97), (0.85, 1.03), (4.55, 1.05), (4.6, 1.0)],
    belt=1.04,
    roof=1.98,
    HB=0.9,
    HR=0.84,
    wrap=0.06,
    wrap_f=0.04,
    wrap_r=0.0,
    gh_round=0.07,
    gh=[(0.87, 1.03), (1.4, 1.88), (1.56, 1.97), (4.45, 1.98), (4.56, 1.9), (4.6, 1.04)],
    back_glass=True,
    openings=[(0.82, 4.58, 0.87)],
    quarters=[],
    doors=[
        dict(grp="door_f", s0=0.93, s1=1.82, bottom=0.31),
        dict(grp="door_s", s0=1.9, s1=3.0, bottom=0.31, sides=(-1,), kind="slide", window=False),
    ],
    hood=dict(s0=0.04, s1=0.84),
    boot=dict(kind="twin", hinge_s=4.57, z_low=0.4, plate_z=0.66, hw=0.8, glass_bot=0.35, plate_y=0.32),
    bumper_z=0.3,
    lamp_z=0.72,
    tail_z=(0.5, 0.95),
    tail_wrap=0.86,
    moulding_z=0.55,
    cabin=dict(floor=0.38, back=4.5, wheel_s=1.45, wheel_z=1.12, lever_s=1.62, front_s=1.95, rows=[], hip=0.68, boot_floor=0.4),
)

# the shuttle (plan 27's bus, the AI's): 10 m, a flat front, the engine at the back, doors on its right
_bus_left = [(0.62 + 1.32 * k, 1.86 + 1.32 * k, 1) for k in range(7)]
_bus_right = [(1.75, 2.95, -1), (3.0, 4.3, -1), (6.15, 7.4, -1), (7.45, 8.7, -1)]
BUS = dict(
    id="shuttle",
    bow_f=0.0,
    bow_r=0.0,
    crown_r=0.012,
    gh_curve=1.15,
    tuck=0.012,
    kind="shuttle",
    L=10.0,
    W=2.42,
    ahead=5.0,
    axle_f=2.1,
    axle_r=7.8,
    wheel_r=0.48,
    wheel_w=0.26,
    track=1.0,
    cog=1.1,
    arch_z=0.48,
    arches=[(2.1, 0.58), (7.8, 0.58)],
    plan_r=(0.12, 0.1),
    r_bottom=0.05,
    r_top=0.04,
    crease=0.06,
    tumble_top=0.02,
    bulge=0.006,
    crown=0.008,
    bottom=[(0.0, 0.4), (0.3, 0.36), (9.7, 0.36), (10.0, 0.4)],
    top=[(0.0, 1.0), (0.05, 1.04), (0.15, 1.06), (9.9, 1.06), (10.0, 1.03)],
    belt=1.06,
    roof=2.85,
    HB=1.2,
    HR=1.14,
    wrap=0.04,
    wrap_r=0.0,
    gh_round=0.09,
    gh=[(0.08, 1.06), (0.22, 2.55), (0.45, 2.85), (9.75, 2.85), (9.92, 2.6), (9.97, 1.06)],
    back_glass=True,
    openings=[(0.05, 9.96, 1.17)],
    quarters=_bus_left + _bus_right,
    doors=[
        dict(grp="door_s", s0=0.5, s1=1.68, bottom=0.37, sides=(-1,), kind="fold"),
        dict(grp="door_m", s0=4.95, s1=6.08, bottom=0.37, sides=(-1,), kind="fold"),
    ],
    hood=None,
    boot=dict(kind="none", z_low=0.6, plate_z=0.75, hw=1.0),
    bumper_z=0.38,
    lamp_z=0.78,
    tail_z=(0.8, 1.3),
    tail_wrap=1.0,
    moulding_z=0.62,
    cabin=dict(floor=0.42, back=9.9, wheel_s=0.62, wheel_z=1.25, lever_s=0.9, front_s=1.05, hip=0.85, boot_floor=0.42),
)

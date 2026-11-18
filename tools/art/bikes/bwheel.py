# Plan 101 — a bicycle's wheel: tyre (its casing and its tread as geometry near: knobs, blocks, studs), rim (its
# profile, braking track, nipples, valve), spokes laced three-cross from the hub's flanges, the hub (shell,
# flanges, cones and locknuts, quick release or axle nuts, drum or hub gear), the rear's cogs. Built about its hub
# (the axle along y); `spin` the group that turns, `fixed` the one that doesn't (axle, nuts, QR).
import math

from mathutils import Matrix, Vector

import bkit as bk
import kit


def _accum():
    return {"v": [], "f": []}


def _add_box(acc, c, R, T, Y, sr, st, sy, top_shrink=0.75):
    """A knob: a block standing on the tread at c, its height along R (radial), length along T, width along Y;
    its top a little smaller than its foot (no bottom face)."""
    v0 = len(acc["v"])
    for h, s in ((0.0, 1.0), (sr, top_shrink)):
        for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            acc["v"].append(c + R * (h - 0.0012) + T * (a * st * s / 2) + Y * (b * sy * s / 2))
    f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    for q in f[1:]:
        acc["f"].append(tuple(v0 + i for i in q))


def _flush(acc, name, kind, grp):
    if not acc["v"]:
        return None
    o = bk.mk(name, acc["v"], acc["f"], kind, grp, smooth=False)
    bk._fix_normals(o)
    return o


def tyre(c, w, spin):
    """The tyre: a casing lathe (tread band + sidewalls) and its tread."""
    r = w["r"]
    bead = w["bead"]
    tw = w["tw"]
    tread = w.get("tread", "slick")
    kh = {"knobby": 0.0042, "studded": 0.0042, "block": 0.0022, "bmx": 0.0032, "city": 0.0015, "slick": 0.0, "file": 0.0}[tread]
    if not bk.near():
        kh = 0.0
    rc = r - kh
    rimw = w.get("rim_w", 0.02)
    hw = tw / 2
    # the casing's section: a superellipse from the rim's hook on one side over the crown to the other
    rm = bead + (rc - bead) * 0.42
    hh = rc - rm
    P, Q = 0.8, 0.75
    n_sec = 9 if bk.near() else 4
    sb = max(-0.95, min(0.95, (rm - bead - 0.0035) / hh))
    beta = math.asin(sb)
    prof = [(bead + 0.002, -rimw / 2 * 0.92)]
    for i in range(n_sec + 1):
        ph = -beta + (math.pi + 2 * beta) * i / n_sec
        s, cph = math.sin(ph), math.cos(ph)
        rad = rm + hh * math.copysign(abs(s) ** P, s)
        y = -hw * math.copysign(abs(cph) ** Q, cph)
        prof.append((rad, y))
    prof.append((bead + 0.002, rimw / 2 * 0.92))
    n = (60 if kh > 0.002 else 66) if bk.near() else int((36 if bk.LOD == "mid" else 14) / kit.SEG)
    split = w.get("gum", False)
    if split:
        # the sidewalls tan (gumwall), the tread band black
        k0 = int(len(prof) * 0.3)
        k1 = len(prof) - k0
        band = prof[k0 - 1 : k1 + 1]
        o1 = kit.lathe("tyre_band", band, n, "tyre", spin, axis="y", cap=False)
        o2 = kit.lathe("tyre_sw_a", prof[:k0], n, "gumwall", spin, axis="y", cap=False)
        o3 = kit.lathe("tyre_sw_b", prof[k1:], n, "gumwall", spin, axis="y", cap=False)
        obs = [o1, o2, o3]
    else:
        obs = [kit.lathe("tyre", prof, n, "tyre", spin, axis="y", cap=False)]
    for o in obs:
        bk._fix_normals(o)
        o.data.transform(Matrix.Translation(c))
    if not bk.near() or kh == 0.0:
        if bk.near() and tread in ("slick", "file") and w.get("rib", True):
            # a file tread: a fine rib round the crown
            for k, y in enumerate((0.0,)):
                g = kit.lathe("tread_rib", [(rc + 0.0004, y * hw - 0.0008), (rc + 0.0006, y * hw), (rc + 0.0004, y * hw + 0.0008)], n, "tyre", spin, axis="y", cap=False)
                g.data.transform(Matrix.Translation(c))
                obs.append(g)
        return obs
    # the tread: knobs round the circumference, rows alternating
    acc = _accum()
    studs = _accum()
    circ = 2 * math.pi * rc
    pitch = {"knobby": 0.026, "studded": 0.026, "block": 0.024, "bmx": 0.021, "city": 0.02}[tread]
    rows = int(circ / pitch)
    rows -= rows % 2

    def place(phi, y, ln, wd, hgt, tilt=0.0, stud=False):
        # on the casing at angle phi (about y), across at y (its surface radius by the section)
        yy = max(-hw * 0.98, min(hw * 0.98, y))
        cc = min(1.0, (abs(yy) / hw) ** (1 / 0.75))
        rad = rm + hh * (math.sqrt(max(0.0, 1 - cc * cc)) ** 0.8)
        Rv = Vector((math.cos(phi), 0, math.sin(phi)))
        T = Vector((-math.sin(phi), 0, math.cos(phi)))
        Y = Vector((0, 1, 0))
        # the shoulder knobs lean out with the casing
        if tilt:
            Rv2 = (Rv * math.cos(tilt) + Y * math.sin(tilt) * (1 if y > 0 else -1)).normalized()
            Y2 = (Y * math.cos(tilt) - Rv * math.sin(tilt) * (1 if y > 0 else -1)).normalized()
        else:
            Rv2, Y2 = Rv, Y
        p = c + Rv * rad + Y * yy
        _add_box(acc, p, Rv2, T, Y2, hgt + 0.0012, ln, wd)
        if stud and bk.near():
            # a carbide stud in the knob: a steel collar narrowing to its pin, standing proud
            v0 = len(studs["v"])
            m = 6
            top = p + Rv2 * (hgt + 0.0012)
            for rr, hh_ in ((0.0018, -0.0003), (0.0011, 0.0012)):
                for j in range(m):
                    a = 2 * math.pi * j / m
                    studs["v"].append(top + T * math.cos(a) * rr + Y2 * math.sin(a) * rr + Rv2 * hh_)
            for j in range(m):
                jj = (j + 1) % m
                studs["f"].append((v0 + j, v0 + jj, v0 + m + jj, v0 + m + j))
            studs["f"].append(tuple(v0 + m + j for j in range(m)))

    for i in range(rows):
        phi = 2 * math.pi * i / rows
        if tread in ("knobby", "studded"):
            if i % 2 == 0:
                place(phi, -hw * 0.18, 0.0085, 0.0085, kh)
                place(phi, hw * 0.18, 0.0085, 0.0085, kh)
            else:
                place(phi, 0.0, 0.0075, 0.011, kh)
                st = tread == "studded" and i % 4 == 1
                place(phi, -hw * 0.66, 0.0085, 0.0075, kh * 0.95, 0.5, stud=st)
                place(phi, hw * 0.66, 0.0085, 0.0075, kh * 0.95, 0.5, stud=st)
        elif tread == "bmx":
            if i % 2 == 0:
                place(phi, 0.0, 0.009, 0.012, kh)
            else:
                place(phi, -hw * 0.42, 0.008, 0.009, kh)
                place(phi, hw * 0.42, 0.008, 0.009, kh)
            place(phi + math.pi / rows, (-1 if i % 2 else 1) * hw * 0.78, 0.007, 0.006, kh * 0.9, 0.55)
        elif tread == "block":
            place(phi, (-1 if i % 2 else 1) * hw * 0.15, 0.010, 0.010, kh)
            place(phi, (1 if i % 2 else -1) * hw * 0.55, 0.008, 0.007, kh * 0.9, 0.35)
        elif tread == "city":
            # a smooth crown and small side diamonds, staggered
            place(phi, (-1 if i % 2 else 1) * hw * 0.58, 0.008, 0.0055, kh, 0.3)
    obs.append(_flush(acc, "knobs", "tyre", spin))
    if False:
        g = kit.lathe("tread_ridge", [(rc - 0.0002, -0.006), (rc + 0.0013, -0.004), (rc + 0.0013, 0.004), (rc - 0.0002, 0.006)], n, "tyre", spin, axis="y", cap=False)
        g.data.transform(Matrix.Translation(c))
        obs.append(g)
    if studs["v"]:
        obs.append(_flush(studs, "studs", "steel", spin))
    return obs


RIMS = {
    # (r, y) sections, relative: r from the bead seat, y from the centre; closed loops
    # (the bed under the tyre is never seen: closed straight across)
    "box": [(0.004, 0.0098), (-0.002, 0.0101), (-0.0105, 0.0099), (-0.0138, 0.0068), (-0.0145, 0.0), (-0.0138, -0.0068), (-0.0105, -0.0099), (-0.002, -0.0101), (0.004, -0.0098), (0.0042, -0.0082), (0.0042, 0.0082)],
    "westwood": [(0.0035, 0.011), (-0.002, 0.012), (-0.009, 0.0105), (-0.0125, 0.006), (-0.0135, 0.0), (-0.0125, -0.006), (-0.009, -0.0105), (-0.002, -0.012), (0.0035, -0.011), (0.0038, -0.0095), (0.0038, 0.0095)],
}


def rim(c, w, spin):
    bead = w["bead"]
    rw = w.get("rim_w", 0.02) / 0.0202
    sec = RIMS["westwood" if w.get("rim") == "westwood" else "box"]
    if not bk.near():
        sec = [(0.004, 0.0098), (-0.002, 0.0101), (-0.012, 0.0085), (-0.0145, 0.0), (-0.012, -0.0085), (-0.002, -0.0101), (0.004, -0.0098)]
    prof = [(bead + dr, y * rw) for dr, y in sec]
    prof.append(prof[0])
    n = 66 if bk.near() else int((36 if bk.LOD == "mid" else 14) / kit.SEG)
    o = kit.lathe("rim", prof, n, w.get("rim_kind", "alloy"), spin, axis="y", cap=False, angle=30)
    bk._fix_normals(o)
    o.data.transform(Matrix.Translation(c))
    obs = [o]
    if bk.near() and w.get("rim") != "westwood":
        # the braking track: a machined band on each flank (its own steel's sheen) and the rim's joint
        for s in (1, -1):
            g = kit.lathe("track", [(bead - 0.0095, s * 0.01025 * rw), (bead - 0.0025, s * 0.01035 * rw)], n, "steel", spin, axis="y", cap=False)
            g.data.transform(Matrix.Translation(c))
            bk._fix_normals(g)
            obs.append(g)
    return obs


def spoke_ends(w, side_sign, k, n_sp, rim_r, hub_y, fr):
    """Where the k-th spoke of a flange starts (hub) and ends (rim), three-cross."""
    per = n_sp // 2
    step = 2 * math.pi / n_sp
    ri = 2 * k + (0 if side_sign > 0 else 1)
    a_rim = ri * step
    cross = w.get("cross", 3)
    lead = 1 if k % 2 == 0 else -1
    a_hub = a_rim + lead * cross * 2 * step
    rim_y = side_sign * 0.0016
    return (Vector((fr * math.cos(a_hub), hub_y, fr * math.sin(a_hub))), Vector((rim_r * math.cos(a_rim), rim_y, rim_r * math.sin(a_rim))))


def spokes(c, w, spin):
    obs = []
    n_sp = w.get("spokes", 36)
    rim_r = w["bead"] - 0.012
    fl, frr = w["flanges"]  # y of the left flange, the right
    fr = w.get("flange_r", 0.022)
    if w.get("rim") == "mag":
        return obs
    if not bk.near():
        # (mid, far: the spokes an alpha disc — tex/spokes36)
        if bk.LOD == "mid":
            obs.append(spoke_disc(c, rim_r + 0.002, spin))
        return obs
    acc = _accum()
    nip = _accum()
    m = 6
    for side, hy in ((1, fl), (-1, frr)):
        for k in range(n_sp // 2):
            a, b = spoke_ends(w, side, k, n_sp, rim_r, hy, fr)
            # the spoke: its J-bend's head at the flange, straight to the nipple
            d = (b - a).normalized()
            pts = [a + Vector((0, side * 0.0022, 0)), a + d * 0.004, b - d * 0.012]
            v0 = len(acc["v"])
            u = d.cross(Vector((0, 1, 0)))
            if u.length < 1e-6:
                u = Vector((1, 0, 0))
            u.normalize()
            ww = d.cross(u).normalized()
            for p in pts:
                for j in range(m):
                    an = 2 * math.pi * j / m
                    acc["v"].append(c + p + (u * math.cos(an) + ww * math.sin(an)) * 0.00095)
            for i in range(len(pts) - 1):
                for j in range(m):
                    jj = (j + 1) % m
                    acc["f"].append((v0 + i * m + j, v0 + i * m + jj, v0 + (i + 1) * m + jj, v0 + (i + 1) * m + j))
            # the nipple: a little hex barrel from the rim's bed inward
            v1 = len(nip["v"])
            for rr, t in ((0.0019, 0.0), (0.0015, 0.011)):
                for j in range(5):
                    an = 2 * math.pi * j / 5
                    nip["v"].append(c + b - d * t + (u * math.cos(an) + ww * math.sin(an)) * rr + d * 0.001)
            for j in range(5):
                jj = (j + 1) % 5
                nip["f"].append((v1 + j, v1 + jj, v1 + 5 + jj, v1 + 5 + j))
            # (a round head at the flange)
    obs.append(_flush(acc, "spokes", "steel", spin))
    obs.append(_flush(nip, "nipples", "chrome", spin))
    # the valve: between two spokes, through the rim's bed
    a = math.pi / n_sp * 1.0 + 2 * math.pi * 7 / n_sp
    R = Vector((math.cos(a), 0, math.sin(a)))
    presta = w.get("valve", "schrader") == "presta"
    base = c + R * (rim_r + 0.001)
    if presta:
        obs.append(bk.rod("valve", base, base - R * 0.032, 0.003, "steel", spin, n=8))
        obs.append(bk.rod("valve_nut", base - R * 0.002, base - R * 0.006, 0.0045, "steel", spin, n=6))
        obs.append(bk.rod("valve_tip", base - R * 0.032, base - R * 0.04, 0.0012, "steel", spin, n=6))
    else:
        obs.append(bk.rod("valve", base, base - R * 0.026, 0.0041, "steel", spin, n=8))
        obs.append(bk.rod("valve_cap", base - R * 0.024, base - R * 0.036, 0.0046, "trim", spin, n=8))
    return obs


def spoke_disc(c, r, spin):
    """The mid's spokes: an annulus textured with 36 spokes laced three-cross (UV 0..1 across the wheel)."""
    n = 24
    verts = [tuple(c + Vector((0, 0, 0)))]
    for i in range(n):
        a = 2 * math.pi * i / n
        verts.append(tuple(c + Vector((r * math.cos(a), 0, r * math.sin(a)))))
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    o = bk.mk("spokedisc", verts, faces, "spokes", spin, smooth=False)
    me = o.data
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co - c
            uv.data[li].uv = (0.5 + v.x / (2 * r), 0.5 + v.z / (2 * r))
    return o


def mag(c, w, spin):
    """A moulded six-spoke mag wheel (nylon), its rim of a piece."""
    obs = []
    bead = w["bead"]
    n = 72 if bk.near() else int(36 / kit.SEG)
    prof = [(bead + 0.004, 0.0125), (bead - 0.002, 0.0135), (bead - 0.016, 0.0125), (bead - 0.019, 0.006), (bead - 0.019, -0.006), (bead - 0.016, -0.0125), (bead - 0.002, -0.0135), (bead + 0.004, -0.0125), (bead + 0.0042, -0.011), (bead - 0.001, -0.009), (bead - 0.002, 0.0), (bead - 0.001, 0.009), (bead + 0.0042, 0.011)]
    prof.append(prof[0])
    o = kit.lathe("magrim", prof, n, "nylon", spin, axis="y", cap=False, angle=30)
    bk._fix_normals(o)
    o.data.transform(Matrix.Translation(c))
    obs.append(o)
    # six spokes: each a tapered blade from the hub's barrel to the rim, its section a rounded rectangle
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.2
        R = Vector((math.cos(a), 0, math.sin(a)))
        pts = [c + R * 0.03, c + R * 0.09, c + R * (bead - 0.017)]
        obs.append(bk.sweep("magspoke", pts, [(0.009, 0.016), (0.0075, 0.012), (0.0085, 0.011)], "nylon", spin, n=10, up=(0, 1, 0)))
    # the hub's barrel moulded with them
    obs.append(bk.tube_y("magbarrel", [(0.012, -0.03), (0.032, -0.026), (0.034, 0.0), (0.032, 0.026), (0.012, 0.03)], c, 32 if bk.near() else 12, "nylon", spin))
    return obs


def hub(c, w, spin, fixed):
    """The hub: its shell and flanges (spin), the axle, cones and locknuts, its QR or its nuts (fixed)."""
    obs = []
    ol = w["ol"]
    fl, frr = w["flanges"]
    fr = w.get("flange_r", 0.022)
    body = w.get("hub_body", 0.0135)
    kind = w.get("hub_kind", "alloy")
    n = 20 if bk.near() else 12
    style = w.get("hub", "std")
    if w.get("rim") == "mag":
        pass
    elif style in ("drum", "gear3"):
        # a hub gear's shell (the 3-speed) and, on the left, the drum brake's big shell and its plate
        if style == "drum":
            prof = [(0.016, frr - 0.004), (fr, frr - 0.0015), (fr, frr + 0.0015), (0.022, frr + 0.006), (0.024, 0.0), (0.024, fl - 0.016), (0.05, fl - 0.012), (0.052, fl - 0.004), (fr + 0.03, fl - 0.0015), (fr + 0.03, fl + 0.0015), (0.046, fl + 0.003)]
        else:
            prof = [(0.016, frr - 0.004), (fr, frr - 0.0015), (fr, frr + 0.0015), (0.022, frr + 0.006), (0.026, 0.0), (0.022, fl - 0.006), (fr, fl - 0.0015), (fr, fl + 0.0015), (0.016, fl + 0.004)]
        obs.append(bk.tube_y("hubshell", prof, c, n, "chrome", spin))
    else:
        prof = [(0.0105, frr - 0.008), (body * 0.92, frr - 0.004), (fr, frr - 0.0016), (fr, frr + 0.0016), (body * 1.08, frr + 0.004), (body, frr + 0.012), (body * 0.86, (fl + frr) / 2), (body, fl - 0.012), (body * 1.08, fl - 0.004), (fr, fl - 0.0016), (fr, fl + 0.0016), (body * 0.92, fl + 0.004), (0.0105, fl + 0.008)]
        obs.append(bk.tube_y("hubshell", prof, c, n, kind, spin))
        if bk.near():
            # the flanges' spoke holes' heads: a ring of little bosses on each flange face
            pass
    # the axle, cones and locknuts (fixed): hex locknuts at the dropouts' inner faces
    if bk.near():
        for s in (1, -1):
            y = s * ol / 2
            obs.append(bk.tube_y("locknut", [(0.0045, y - s * 0.004), (0.0105, y - s * 0.004), (0.0105, y), (0.0045, y)], c, 6, "steel", fixed, smooth=False))
            obs.append(bk.tube_y("cone", [(0.0045, y - s * 0.004), (0.0095, y - s * 0.0045), (0.0085, y - s * 0.009)], c, 16, "steel", fixed))
    qr = w.get("qr", False)
    ax_out = 0.009
    obs.append(bk.tube_y("axle", [(0.0045, -ol / 2 - ax_out), (0.0045, ol / 2 + ax_out)], c, 10, "steel", fixed))
    if qr:
        # the quick release: the lever on the left (non-drive) side, its nut on the right
        yl = ol / 2 + 0.0045 + 0.0035
        obs.append(bk.tube_y("qr_cam", [(0.0035, yl - 0.004), (0.0105, yl - 0.003), (0.0115, yl + 0.004), (0.006, yl + 0.009)], c, 18, "alloy", fixed))
        lev = [c + Vector((0, yl + 0.007, 0)), c + Vector((-0.015, yl + 0.012, 0.004)), c + Vector((-0.04, yl + 0.012, 0.012)), c + Vector((-0.058, yl + 0.009, 0.016))]
        obs.append(bk.sweep("qr_lever", lev, [(0.004, 0.006), (0.0035, 0.0055), (0.003, 0.0055), (0.0028, 0.006)], "alloy", fixed, n=10, up=(0, 1, 0)))
        yr = -ol / 2 - 0.0045 - 0.003
        obs.append(bk.tube_y("qr_nut", [(0.0035, yr + 0.003), (0.0095, yr + 0.003), (0.0095, yr - 0.008), (0.003, yr - 0.009)], c, 12, "alloy", fixed))
        obs.append(bk.rod("qr_rod", c + Vector((0, -ol / 2 - 0.012, 0)), c + Vector((0, ol / 2 + 0.012, 0)), 0.0022, "steel", fixed, n=6))
    else:
        for s in (1, -1):
            y = s * (ol / 2 + 0.0045)
            obs.append(bk.tube_y("washer", [(0.0045, y), (0.0105, y), (0.0105, y + s * 0.0015), (0.0045, y + s * 0.0015)], c, 10, "chrome", fixed, smooth=False))
            obs.append(bk.tube_y("axlenut", [(0.0045, y + s * 0.0015), (0.0086, y + s * 0.0015), (0.0086, y + s * 0.0095), (0.0045, y + s * 0.0095)], c, 6, "chrome", fixed, smooth=False))
    return obs


def pitch_r_(T):
    return 0.0127 / (2 * math.sin(math.pi / T))


def cogs(c, w, spin):
    """The rear's sprockets (spin with the wheel): a freewheel block's cogs, or a single cog."""
    obs = []
    teeth = w.get("cogs", [])
    if not teeth:
        return obs, None
    y0 = w["cog_y0"]  # the innermost cog's y (the biggest), the rest outward (more negative)
    pitch = 0.0127
    sp = w.get("cog_step", 0.005)
    th = w.get("cog_th", 0.0019)
    per = 2
    ys = []
    if not bk.near() and len(teeth) > 1:
        # (mid: the block as one stepped lathe)
        prof = [(0.012, y0 + 0.003)]
        for i, T in enumerate(teeth):
            rp = pitch_r_(T)
            y = y0 - i * sp
            ys.append(y)
            prof += [(rp + 0.002, y + th / 2), (rp + 0.002, y - th / 2)]
        prof.append((0.012, ys[-1] - 0.003))
        return [bk.tube_y("cogblock", prof, c, 16, "steel", spin, smooth=False)], ys
    for i, T in enumerate(teeth):
        rp = pitch / (2 * math.sin(math.pi / T))
        y = y0 - i * sp
        ys.append(y)
        out = bk.teeth(T, rp, 0.0062, per=per)
        inn = bk.circle2(rp - 0.009 if len(teeth) > 1 else 0.017, len(out))
        o = bk.ring_prism("cog", out, inn, y - th / 2, y + th / 2, "steel" if len(teeth) > 1 else "chrome", spin)
        o.data.transform(Matrix.Translation(c))
        obs.append(o)
    # the freewheel's body behind them
    if len(teeth) > 1:
        r_small = pitch / (2 * math.sin(math.pi / teeth[-1])) - 0.009
        obs.append(bk.tube_y("fwbody", [(0.012, ys[-1] - 0.004), (r_small, ys[-1] - 0.0035), (r_small, ys[0] + 0.004), (0.016, ys[0] + 0.006)], c, 24 if bk.near() else 10, "alloy_dark", spin))
    else:
        obs.append(bk.tube_y("lockring", [(0.012, ys[0] - 0.006), (0.0175, ys[0] - 0.006), (0.0175, ys[0] - 0.0015), (0.012, ys[0] - 0.0015)], c, 12, "steel", spin, smooth=False))
    return obs, ys


def wheel(c, w, spin, fixed):
    """Everything of a wheel at hub c. Returns the objects."""
    c = Vector(c)
    obs = []
    obs += tyre(c, w, spin)
    if w.get("rim") == "mag":
        obs += mag(c, w, spin)
    else:
        obs += rim(c, w, spin)
        obs += spokes(c, w, spin)
    obs += hub(c, w, spin, fixed)
    return [o for o in obs if o is not None]


def spoke_reflector(c, w, spin, kind="lens_amber", side=1):
    """A spoke reflector clipped across two spokes (the 80s' amber, or white)."""
    if not (bk.near() or bk.LOD == "mid"):
        return []
    rim_r = w["bead"] - 0.012
    a = 2 * math.pi * 0.62
    R = Vector((math.cos(a), 0, math.sin(a)))
    T = Vector((-math.sin(a), 0, math.cos(a)))
    p = c + R * (rim_r * 0.62) + Vector((0, side * 0.012, 0))
    out = []
    # a rounded oblong: the lens on a grey plastic back
    sec = [(T * math.cos(t) * 0.032 + R * math.sin(t) * 0.014) for t in [2 * math.pi * i / 14 for i in range(14)]]
    body = bk.loft("sprefl", [[p + v + Vector((0, -side * 0.004, 0)) for v in sec], [p + v * 0.98 for v in sec], [p + v * 0.9 + Vector((0, side * 0.0025, 0)) for v in sec]], kind, spin)
    out.append(body)
    out.append(bk.loft("sprefl_back", [[p + v * 1.03 + Vector((0, -side * 0.0055, 0)) for v in sec], [p + v * 1.03 + Vector((0, -side * 0.0035, 0)) for v in sec]], "trim", spin))
    return out

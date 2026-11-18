# Plan 101 — the cockpit and the brakes: headset, stems (road quill, swan neck, MTB, BMX four-bolt), bars (drops,
# flat with bar-ends, swept town bars, BMX risers with a crossbar), tape and grips, brake levers (aero road hoods,
# flat-bar levers — their blades each a pivot), the saddles (road, padded MTB, sprung town with its coils, BMX) on
# their posts, the brakes (sidepull calipers, cantilevers with their straddle, a U-brake, a drum's arm), cables.
import math

from mathutils import Matrix, Vector

import bkit as bk
import kit

BAR_R = 0.0119  # (a 23.8 mm bar; its centre bulge 13 mm)


def headset(sb, st, a, grp="frame", kind="chrome", top_kind="chrome", quill=True):
    """The headset's cups at the head tube's ends (sb, st on the axis a, up), the locknut over the top (on the
    fork's steerer — the steer group's), the crown race below."""
    sb, st, a = Vector(sb), Vector(st), Vector(a).normalized()
    obs = []
    n = 28 if bk.near() else 12
    obs.append(bk.lathe_ax("cup_top", [(0.0155, -0.002), (0.0185, 0.0), (0.0185, 0.009), (0.0165, 0.011)], st, a, n, kind, grp))
    obs.append(bk.lathe_ax("cup_bot", [(0.0165, -0.011), (0.0185, -0.009), (0.0185, 0.0), (0.0155, 0.002)], sb, a, n, kind, grp))
    return obs


def headset_top(st, a, grp, kind="chrome"):
    """The steerer's locknut, its spacer and its keyed washer (turning with the bars)."""
    st, a = Vector(st), Vector(a).normalized()
    n = 24 if bk.near() else 10
    obs = [bk.lathe_ax("ht_washer", [(0.0125, 0.011), (0.0175, 0.011), (0.0175, 0.0135), (0.0125, 0.0135)], st, a, n, kind, grp, smooth=False)]
    # (a knurled locknut: ribbed when near)
    if bk.near():
        prof = [(0.0125, 0.0135), (0.0182, 0.0135), (0.0182, 0.0215), (0.0125, 0.0215)]
        o = bk.lathe_ax("ht_lock", prof, st, a, 36, kind, grp, smooth=False)
        obs.append(o)
    else:
        obs.append(bk.lathe_ax("ht_lock", [(0.0125, 0.0135), (0.018, 0.0135), (0.018, 0.0215), (0.0125, 0.0215)], st, a, 10, kind, grp))
    return obs


def crown_race(sb, a, grp, kind="chrome"):
    return [bk.lathe_ax("crownrace", [(0.0135, -0.006), (0.0185, -0.005), (0.018, -0.0015), (0.0135, -0.001)], Vector(sb), Vector(a), 24 if bk.near() else 10, kind, grp)]


# ── stems ─────────────────────────────────────────────────────────────────────────────────────────────────────


def stem(st, a, style, clamp, grp, kind="alloy"):
    """A quill stem from inside the steerer (st: the head tube's top on the axis a) up to the bar's clamp at
    `clamp` (the bar's centre). Returns its objects."""
    st, a, C = Vector(st), Vector(a).normalized(), Vector(clamp)
    obs = []
    q0 = st + a * 0.022  # (out of the locknut)
    if style == "bmx":
        # a short quill under a forged four-bolt body: the body forward to the clamp, its cap plate
        top = st + a * 0.05
        obs.append(bk.sweep("quill", [q0 - a * 0.01, top], 0.0111, kind, grp, n=16))
        body = [top, C + Vector((-0.012, 0, -0.016))]
        obs.append(bk.sweep("stembody", body, [(0.018, 0.016), (0.02, 0.016)], kind, grp, n=14, up=(0, 1, 0)))
        obs.append(bk.cyl_ax("clampbody", C, (0, 1, 0), 0.018, 0.05, kind, grp, n=20))
        obs.append(bk.box("capplate", C + Vector((0.012, 0, 0.004)), (0.012, 0.052, 0.034), kind, grp, r=0.004))
        if bk.near():
            for dy in (-0.017, 0.017):
                for dz in (-0.011, 0.015):
                    obs.append(bk.rod("capbolt", C + Vector((0.017, dy, dz)), C + Vector((0.024, dy, dz)), 0.0035, "steel", grp, n=6))
        obs.append(bk.lathe_ax("expander", [(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.008), (0.0, 0.008)], top, a, 6, "steel", grp, smooth=False))
        return obs, top
    # the quill: up along the axis
    if style == "swan":
        h = (C - st).dot(a) * 0.6
        qt = st + a * h
        obs.append(bk.sweep("quill", [q0 - a * 0.01, qt], 0.0111, kind, grp, n=16))
        # the swan's neck: forward and up in one curve to the clamp
        pts = bk.bez(qt, qt + a * 0.06, C + Vector((-0.06, 0, -0.01)), C + Vector((-0.012, 0, 0.0)), 12)
        obs.append(bk.sweep("neck", pts, [0.0105] * len(pts), kind, grp, n=14))
        obs.append(bk.cyl_ax("clamp", C, (0, 1, 0), 0.0155, 0.03, kind, grp, n=18))
        obs.append(bk.cyl_ax("binder", C + Vector((-0.016, 0, -0.012)), (0, 1, 0), 0.0045, 0.03, "steel", grp, n=6))
        obs.append(bk.lathe_ax("expander", [(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.008), (0.0, 0.008)], qt + a * 0.01, a, 6, "steel", grp, smooth=False))
        return obs, qt
    # road / mtb / track: the quill up, the extension forward to the clamp
    ext_dir = (C - st)
    # the quill's top: where a line from the clamp back along the extension's direction meets the axis
    rise = math.radians({"road": -2, "mtb": 12, "track": -8}.get(style, 0))
    e = Vector((math.cos(rise), 0, math.sin(rise)))
    # solve st + a*h + e*L = C (in x-z)
    A = Matrix(((a.x, e.x), (a.z, e.z)))
    rhs = Vector((C.x - st.x, C.z - st.z))
    try:
        h, L = A.inverted() @ rhs
    except ValueError:
        h, L = 0.06, 0.1
    qt = st + a * h
    obs.append(bk.sweep("quill", [q0 - a * 0.01, qt + a * 0.004], 0.0111, kind, grp, n=18))
    # the forged extension: a little thicker at its root, a fillet into the quill
    obs.append(bk.sweep("ext", [qt - e * 0.004, qt + e * (L * 0.5), C - e * 0.014], [(0.0115, 0.0135), (0.0105, 0.012), (0.011, 0.0125)], kind, grp, n=16, up=(0, 0, 1)))
    obs.append(bk.lathe_ax("quilltop", [(0.0, 0.004), (0.0128, 0.0), (0.013, -0.02), (0.0115, -0.03)], qt + a * 0.004, a, 18, kind, grp))
    obs.append(bk.cyl_ax("clamp", C, (0, 1, 0), 0.0165, 0.034, kind, grp, n=20))
    obs.append(bk.cyl_ax("binder", C + e * 0.006 + Vector((0, 0, -0.019)), (0, 1, 0), 0.0045, 0.034, "steel", grp, n=6))
    obs.append(bk.lathe_ax("expander", [(0.0, 0.0), (0.0055, 0.0), (0.0055, 0.006), (0.0, 0.006)], qt + a * 0.004, a, 6, "steel", grp, smooth=False))
    return obs, qt


# ── bars ──────────────────────────────────────────────────────────────────────────────────────────────────────


def bar_paths(style, C, w):
    """Each side's path (left +y; the right is its mirror) from the clamp's centre C. Returns (pts_left, info)."""
    C = Vector(C)
    hw = w / 2
    if style == "drop":
        P = [(0, 0, 0), (0.0, 0.05, 0.0), (0.0, hw - 0.02, 0.0), (0.012, hw, 0.0), (0.07, hw + 0.002, -0.012), (0.092, hw + 0.004, -0.05), (0.088, hw + 0.005, -0.095), (0.06, hw + 0.006, -0.128), (0.02, hw + 0.007, -0.14), (-0.07, hw + 0.008, -0.14)]
        pts = bk.resample(bk.fillet([C + Vector(p) for p in P], [0, 0, 0.02, 0.03, 0.035, 0.035, 0.035, 0.03, 0.03, 0], 5), 0.012)
        info = dict(hood=C + Vector((0.088, hw + 0.004, -0.028)), grip=C + Vector((0.112, hw + 0.004, 0.006)), drop=C + Vector((-0.035, hw + 0.008, -0.14)), tape_from=0.06)
    elif style == "track":
        P = [(0, 0, 0), (0.0, 0.05, 0.0), (0.0, hw - 0.02, 0.0), (0.012, hw, 0.0), (0.07, hw + 0.002, -0.006), (0.105, hw + 0.004, -0.045), (0.1, hw + 0.005, -0.11), (0.06, hw + 0.006, -0.15), (0.01, hw + 0.007, -0.16), (-0.06, hw + 0.008, -0.16)]
        pts = bk.resample(bk.fillet([C + Vector(p) for p in P], [0, 0, 0.02, 0.03, 0.045, 0.045, 0.045, 0.035, 0.03, 0], 5), 0.012)
        info = dict(hood=C + Vector((0.098, hw + 0.004, -0.026)), grip=C + Vector((0.122, hw + 0.004, 0.01)), drop=C + Vector((-0.03, hw + 0.008, -0.16)), tape_from=0.06)
    elif style == "flat":
        sw = math.radians(5)
        P = [(0, 0, 0), (0.0, 0.05, 0.0), (-math.sin(sw) * (hw - 0.05), hw, 0.0)]
        pts = [C + Vector(p) for p in P]
        pts = bk.resample(pts, 0.03)
        end = C + Vector(P[-1])
        info = dict(grip=end + Vector((math.sin(sw) * 0.06, -0.06, 0.0)), end=end, dir=(Vector(P[-1]) - Vector(P[1])).normalized(), grip_len=0.115)
    elif style == "town":
        P = [(0, 0, 0), (0.0, 0.06, 0.0), (-0.01, 0.15, 0.015), (-0.085, 0.255, 0.055), (-0.17, hw, 0.065), (-0.30, hw, 0.055)]
        pts = bk.fillet([C + Vector(p) for p in P], [0, 0, 0.06, 0.08, 0.07, 0], 6)
        end = C + Vector(P[-1])
        d = (Vector(P[-1]) - Vector(P[-2])).normalized()
        info = dict(grip=end - d * 0.062, end=end, dir=d, grip_len=0.125)
    elif style == "bmx":
        P = [(0, 0, 0), (0.0, 0.075, 0.0), (-0.02, 0.13, 0.15), (-0.035, 0.155, 0.18), (-0.06, 0.205, 0.19), (-0.09, hw, 0.195)]
        pts = bk.fillet([C + Vector(p) for p in P], [0, 0, 0.04, 0.04, 0.05, 0], 6)
        end = C + Vector(P[-1])
        d = (Vector(P[-1]) - Vector(P[-2])).normalized()
        info = dict(grip=end - d * 0.06, end=end, dir=d, grip_len=0.125, cross=(C + Vector((-0.012, 0.115, 0.1)), C + Vector((-0.012, -0.115, 0.1))))
    return pts, info


def mirror(pts):
    return [Vector((p.x, -p.y, p.z)) for p in pts]


def bars(style, C, w, grp, kind="alloy", tape=None):
    """The bar, both sides; drops taped from the clamp's shoulders to the ends (with plugs). Returns
    (objects, info per side {"l": …, "r": …})."""
    obs = []
    left, info = bar_paths(style, C, w)
    full = mirror(left)[::-1][:-1] + left
    if style in ("drop", "track"):
        # the centre's bulge (26 mm), the rest 23.8 mm
        rs = []
        for p in full:
            dy = abs(p.y - Vector(C).y)
            rs.append(0.013 if dy < 0.04 else (BAR_R if dy > 0.055 else 0.013 - (dy - 0.04) / 0.015 * (0.013 - BAR_R)))
        if tape:
            # (under the tape the bar is hidden: only its bare middle drawn)
            keep = [i for i, p in enumerate(full) if abs(p.y - Vector(C).y) < 0.064]
            obs.append(bk.sweep("bar", [full[i] for i in keep], [rs[i] for i in keep], kind, grp, n=16))
        else:
            obs.append(bk.sweep("bar", full, rs, kind, grp, n=16))
        if tape:
            for side_pts in (left, mirror(left)):
                tp = [p for p in side_pts if abs(p.y - Vector(C).y) > 0.055]
                tp = bk.resample(tp, 0.0075 if bk.near() else 0.03)
                L = bk.length(tp)

                def wrap(i, k, a, n_=len(tp), L=L):
                    # (the tape's overlapping turns: a ridge every 22 mm, spiralling)
                    s = L * i / max(1, n_ - 1)
                    ph = (s / 0.022 + a / (2 * math.pi)) % 1.0
                    return 1.0 + 0.06 * (ph ** 3)

                obs.append(bk.sweep("tape", tp, BAR_R + 0.0016, tape, grp, n=10, rfun=wrap if bk.near() else None))
                end = side_pts[-1]
                d = (side_pts[-1] - side_pts[-2]).normalized()
                obs.append(bk.cyl_ax("plug", end + d * 0.002, d, BAR_R + 0.0019, 0.005, "rubber", grp, n=14))
    elif style == "bmx":
        obs.append(bk.sweep("bar", full, 0.011, kind, grp, n=16))
        a, b = info["cross"]
        obs.append(bk.rod("crossbar", a, b, 0.0095, kind, grp, n=14))
    else:
        rs = [0.0127 if abs(p.y - Vector(C).y) < 0.04 else (0.0111 if style == "flat" else BAR_R) for p in full]
        obs.append(bk.sweep("bar", full, rs, kind, grp, n=12))
    sides = {}
    for s, nm in ((1, "l"), (-1, "r")):
        d = {}
        for k, v in info.items():
            if isinstance(v, Vector):
                d[k] = Vector((v.x, v.y if s > 0 else 2 * Vector(C).y - v.y, v.z))
            elif k == "dir":
                d[k] = Vector((v.x, v.y * s, v.z))
            else:
                d[k] = v
        sides[nm] = d
    return obs, sides, left


def grip(end, d, L, grp, style="rib", kind="rubber"):
    """A grip on a bar's end (its axis d pointing out): ribbed rubber, a flange inboard, an end cap."""
    end, d = Vector(end), Vector(d).normalized()
    a = end - d * L
    obs = []
    pts = bk.resample([a, end], 0.006 if bk.near() else 0.03)
    n_ = len(pts)
    if style == "mushroom":
        def f(i, k, an):
            return 1.0 + 0.18 * (1 if (i % 3) == 0 else 0)
        obs.append(bk.sweep("grip", pts, 0.0155, kind, grp, n=12, rfun=f if bk.near() else None))
        obs.append(bk.cyl_ax("flange", a + d * 0.003, d, 0.024, 0.006, kind, grp, n=18))
    else:
        def f(i, k, an):
            return 1.0 + 0.06 * (i % 2) if 1 < i < n_ - 2 else 1.0
        obs.append(bk.sweep("grip", pts, 0.0158, kind, grp, n=12, rfun=f if bk.near() else None))
        obs.append(bk.cyl_ax("flange", a + d * 0.002, d, 0.0185, 0.004, kind, grp, n=16))
    obs.append(bk.cyl_ax("gripcap", end + d * 0.002, d, 0.0158, 0.004, kind, grp, n=14))
    return obs


# ── levers ────────────────────────────────────────────────────────────────────────────────────────────────────


def road_lever(hood, side, grp_body, grp_blade, gum=True):
    """An aero road lever on the drop's curve: its body under a rubber hood (the hands rest on it), the blade
    down in front of the drop (its pivot at the hood's top front). Returns (body objs, blade objs, pivot, axis,
    tip)."""
    h = Vector(hood)
    s = side
    body, blade = [], []
    # the hood: a lofted body from the bar's front face forward, nearly level, its top a little over the bar's
    # tops, a rounded horn at its nose
    secs = []
    n = 12
    for dx, dz, w_, hh in ((-0.004, -0.002, 0.026, 0.036), (0.012, 0.004, 0.028, 0.038), (0.03, 0.008, 0.027, 0.034), (0.045, 0.011, 0.024, 0.028), (0.056, 0.015, 0.019, 0.02), (0.062, 0.019, 0.011, 0.011), (0.064, 0.021, 0.004, 0.004)):
        c = h + Vector((dx, 0, dz))
        sec = []
        for k in range(n):
            an = 2 * math.pi * k / n
            cy, sz = math.cos(an), math.sin(an)
            sec.append(c + Vector((0, (w_ / 2) * math.copysign(abs(cy) ** 0.7, cy), (hh / 2) * math.copysign(abs(sz) ** 0.8, sz))))
        secs.append(sec)
    body.append(bk.loft("hood", secs, "gumwall" if gum else "rubber", grp_body))
    # the blade: from its pivot under the hood's nose, down in front of the drop and back under it
    piv = h + Vector((0.042, 0, 0.002))
    pts = bk.bez(piv, piv + Vector((0.012, 0, -0.055)), piv + Vector((0.0, 0, -0.1)), piv + Vector((-0.032, 0, -0.118)), 10)
    blade.append(bk.sweep("blade", pts, [(0.0055 - 0.002 * i / 10, 0.0085 - 0.003 * i / 10) for i in range(len(pts))], "alloy", grp_blade, n=10, up=(1, 0, 0)))
    tip = pts[-1]
    return body, blade, piv, Vector((0, -1, 0)), tip


def flat_lever(at, bar_dir, side, grp_body, grp_blade, style="mtb", tilt=32):
    """A flat-bar lever clamped at `at` (on the bar), its blade out along the bar in front of it, tilted down."""
    at = Vector(at)
    b = Vector(bar_dir).normalized()
    f = Vector((1, 0, 0))
    f = (f - b * b.dot(f)).normalized()
    u = b.cross(f) if b.cross(f).z > 0 else -b.cross(f)
    t = math.radians(tilt)
    f2 = f * math.cos(t) - u * math.sin(t)
    u2 = (u * math.cos(t) + f * math.sin(t)).normalized()
    body, blade = [], []
    kind = {"mtb": "alloy", "town": "chrome", "bmx": "alloy_dark"}[style]
    body.append(bk.sweep("lv_clamp", [at - b * 0.008, at + b * 0.008], 0.0145, kind, grp_body, n=14))
    bd = at + f2 * 0.02 - b * 0.004
    body.append(bk.sweep("lv_body", [at + f2 * 0.008, bd + f2 * 0.012], [(0.011, 0.013), (0.009, 0.011)], kind, grp_body, n=12, up=u2))
    # the barrel adjuster pointing in and forward, the cable's way out
    adj = bd + f2 * 0.006 - b * 0.012
    body.append(bk.cyl_ax("lv_adj", adj, (f2 * 0.3 - b).normalized(), 0.0045, 0.014, "alloy", grp_body, n=10))
    piv = bd + f2 * 0.012 + b * 0.002
    Lb = {"mtb": 0.095, "town": 0.105, "bmx": 0.1}[style]
    pts = [piv, piv + b * 0.02 + f2 * 0.006, piv + b * (Lb * 0.6) + f2 * 0.004, piv + b * Lb - f2 * 0.004]
    pts = bk.fillet(pts, 0.015, 3)
    blade.append(bk.sweep("lv_blade", pts, [(0.0045, 0.0075)] * len(pts), kind, grp_blade, n=10, up=u2))
    blade.append(bk.cyl_ax("lv_tipball", pts[-1], b, 0.005, 0.008, kind, grp_blade, n=10))
    blade.append(bk.cyl_ax("lv_pivot", piv, u2, 0.004, 0.024, "steel", grp_blade, n=8))
    return body, blade, piv, u2, pts[-1], adj


def pull_sign(piv, axis, tip, bar_pt, amount=0.3):
    """Which way about the axis pulls the blade toward the bar (radians, signed)."""
    best = None
    for sgn in (1, -1):
        R = Matrix.Rotation(sgn * amount, 3, Vector(axis))
        p = Vector(piv) + R @ (Vector(tip) - Vector(piv))
        d = (p - Vector(bar_pt)).length
        if best is None or d < best[0]:
            best = (d, sgn)
    return best[1] * amount


# ── saddles and posts ─────────────────────────────────────────────────────────────────────────────────────────


SADDLES = {
    # length, rear width, nose width, crown, skirt, top's rise at the rear, kind
    "road": (0.27, 0.132, 0.034, 0.012, 0.02, 0.008, "leather"),
    "mtb": (0.27, 0.152, 0.042, 0.016, 0.024, 0.01, "vinyl"),
    "town": (0.265, 0.215, 0.07, 0.022, 0.03, 0.006, "leather"),
    "bmx": (0.25, 0.135, 0.05, 0.02, 0.026, 0.014, "vinyl"),
}


def saddle(sit, style, grp="frame", kind=None, rail_kind="steel"):
    """A saddle whose sit point (top, a little behind its middle) is `sit`. Returns (objs, clamp point)."""
    sit = Vector(sit)
    L, W, wn, crown, skirt, rise, k0 = SADDLES[style]
    kind = kind or k0
    obs = []
    # its middle: the sit point is 0.3 of the way from the back
    x_rear = sit.x - L * 0.3
    m = 20 if bk.near() else 8
    secs = []
    st = 16 if bk.near() else 6
    for i in range(st + 1):
        t = i / st
        # the width: full at the back, narrowing through the middle to the nose
        sm = min(1, max(0, (t - 0.2) / 0.55))
        sm = sm * sm * (3 - 2 * sm)
        w = W * (1 - sm) + wn * sm
        if t > 0.92:
            w *= 0.55 + 0.45 * (1 - (t - 0.92) / 0.08)
        if t < 0.05:
            w *= 0.8 + 0.2 * (t / 0.05)
        ztop = sit.z + rise * max(0, 1 - t / 0.3) ** 2 - 0.003 * math.sin(math.pi * min(1, t / 0.8)) + (0.004 * ((t - 0.75) / 0.25) if t > 0.75 else 0)
        sk = skirt * (0.6 + 0.4 * (1 - sm))
        cr = crown * (0.5 + 0.5 * (1 - sm))
        zc = ztop - cr
        x = x_rear + L * t
        sec = []
        for k in range(m):
            an = 2 * math.pi * k / m
            cy, sz = math.cos(an), math.sin(an)
            y = (w / 2) * math.copysign(abs(cy) ** 0.55, cy)
            if sz >= 0:
                z = zc + cr * (abs(sz) ** 0.9)
            else:
                z = zc - sk * (abs(sz) ** 0.35)
            sec.append(Vector((x, y, z)))
        secs.append(sec)
    obs.append(bk.loft("saddle", secs, kind, grp, cap=(True, True)))
    # the underside's shell (the base: black plastic under the skirt), following the skirt's own depth
    zb = sit.z - crown - skirt * 0.95
    base = []
    for i in range(0, st + 1, 2):
        t = min(i / st, 0.97)
        sm = min(1, max(0, (t - 0.2) / 0.55))
        sm = sm * sm * (3 - 2 * sm)
        w = (W * (1 - sm) + wn * sm) * 0.84
        if t > 0.92:
            w *= 0.55 + 0.45 * (1 - (t - 0.92) / 0.08)
        ztop = sit.z + rise * max(0, 1 - t / 0.3) ** 2 - 0.003 * math.sin(math.pi * min(1, t / 0.8)) + (0.004 * ((t - 0.75) / 0.25) if t > 0.75 else 0)
        zl = ztop - crown * (0.5 + 0.5 * (1 - sm)) - skirt * (0.6 + 0.4 * (1 - sm)) * 0.9
        base.append([Vector((x_rear + L * t + 0.004, (w / 2) * math.cos(2 * math.pi * k / 8), zl + 0.004 * math.sin(2 * math.pi * k / 8))) for k in range(8)])
    obs.append(bk.loft("saddlebase", base, "trim", grp))
    # the rails: under the shell from the back to the nose's cup
    zr = zb - 0.022
    clamp = Vector((x_rear + L * 0.45, 0, zr))
    if style == "town":
        # the sprung saddle's frame: wire loops, two big coils at the back, its clamp below the middle
        for s in (1, -1):
            pts = [Vector((x_rear + 0.015, s * 0.075, zb - 0.002)), Vector((x_rear + 0.03, s * 0.07, zr - 0.035)), Vector((x_rear + L * 0.45, s * 0.03, zr - 0.012)), Vector((x_rear + L * 0.9, s * 0.012, zb - 0.002))]
            obs.append(bk.sweep("sframe", bk.fillet(pts, 0.03, 4), 0.0035, "chrome", grp, n=8))
            obs.append(bk.helix("coil", Vector((x_rear + 0.03, s * 0.072, zr - 0.035)), (0, 0, 1), 0.013, 0.0085, 4.0, 0.0028, "chrome", grp, n_per=10))
        clamp = Vector((x_rear + L * 0.45, 0, zr - 0.012))
        obs.append(bk.box("sclamp", clamp + Vector((0, 0, 0.004)), (0.03, 0.07, 0.012), "chrome", grp, r=0.003))
    else:
        for s in (1, -1):
            pts = [Vector((x_rear + 0.02, s * 0.05, zb + 0.002)), Vector((x_rear + 0.05, s * 0.034, zr)), Vector((x_rear + L * 0.7, s * 0.022, zr)), Vector((x_rear + L * 0.9, s * 0.008, zb + 0.004))]
            obs.append(bk.sweep("rail", bk.fillet(pts, 0.025, 4), 0.0035, rail_kind, grp, n=8))
        if style == "bmx":
            obs.append(bk.box("bumper", Vector((x_rear + 0.006, 0, zb + 0.006)), (0.014, W * 0.7, 0.018), "trim", grp, r=0.005))
    return obs, clamp


def seatpost(top_lug, st_dir, clamp, style, grp="frame", kind="alloy"):
    """The seatpost from inside the seat tube up to the saddle's clamp; its head. Returns its objects."""
    d = Vector(st_dir).normalized()
    C = Vector(clamp)
    lug = Vector(top_lug)
    obs = []
    r = 0.0136 if style in ("road", "mtb") else 0.0127
    if style == "bmx":
        # a laid-back post: up the tube, then bent back to its clamp
        bend = lug + d * 0.05
        pts = bk.fillet([lug - d * 0.05, bend, C + Vector((0.01, 0, -0.012))], 0.035, 5)
        obs.append(bk.sweep("post", pts, 0.0111, "chrome", grp, n=16))
        obs.append(bk.box("postclamp", C + Vector((0, 0, -0.004)), (0.04, 0.024, 0.014), "chrome", grp, r=0.003))
        obs.append(bk.rod("clampbolt", C + Vector((0, -0.016, -0.004)), C + Vector((0, 0.016, -0.004)), 0.0045, "steel", grp, n=6))
        return obs
    # the post's top: where the post's axis passes under the clamp
    t = (C.z - lug.z) / d.z
    top = lug + d * t
    obs.append(bk.sweep("post", [lug - d * 0.06, top - d * 0.012], r, kind if style != "town" else "chrome", grp, n=18))
    if style == "town":
        # a plain pillar under a separate saddle clamp
        obs.append(bk.cyl_ax("pillarclamp", top - d * 0.006, (0, 1, 0), 0.011, 0.036, "chrome", grp, n=14))
        obs.append(bk.rod("pillarbolt", top + Vector((0, -0.025, -0.006)), top + Vector((0, 0.025, -0.006)), 0.004, "steel", grp, n=6))
        return obs
    # a micro-adjust head: a cradle under the rails, the top plate, two bolts
    obs.append(bk.box("posthead", C + Vector((0, 0, -0.008)), (0.05, 0.03, 0.012), kind, grp, r=0.004))
    obs.append(bk.box("postplate", C + Vector((0, 0, 0.005)), (0.04, 0.05, 0.004), kind, grp, r=0.0015))
    if bk.near():
        for dx in (-0.016, 0.016):
            obs.append(bk.rod("postbolt", C + Vector((dx, 0, -0.016)), C + Vector((dx, 0, 0.008)), 0.0028, "steel", grp, n=6))
    return obs


# ── brakes ───────────────────────────────────────────────────────────────────────────────────────────────────


def pad(c, tdir, side, grp, L=0.04):
    """A brake shoe and its pad, its face toward the rim (−side along y)."""
    c = Vector(c)
    t = Vector(tdir).normalized()
    obs = [bk.sweep("pad", [c - t * L / 2, c + t * L / 2], (0.0045, 0.0075), "rubber", grp, n=8, up=t.cross(Vector((0, 1, 0))))]
    obs.append(bk.sweep("shoe", [c - t * L * 0.48 + Vector((0, side * 0.005, 0)), c + t * L * 0.48 + Vector((0, side * 0.005, 0))], (0.003, 0.0085), "alloy", grp, n=8, up=t.cross(Vector((0, 1, 0)))))
    obs.append(bk.rod("padbolt", c + Vector((0, side * 0.006, 0)), c + Vector((0, side * 0.014, 0)), 0.0035, "steel", grp, n=6))
    return obs


def sidepull(hub, D, tyre_r, rim, facing, grp, kind="alloy", long_reach=False):
    """A sidepull caliper above a tyre: hung on its centre bolt at the crown or the bridge (along D from the
    hub), its two arms round the tyre to the pads at the rim's track. facing: +1 its face forward (the front),
    −1 back. Returns (objs, the cable's anchor: where the housing ends)."""
    H, D = Vector(hub), Vector(D).normalized()
    Y = Vector((0, 1, 0))
    T = Y.cross(D).normalized()  # (in the wheel's plane, perpendicular to D)
    if T.x * facing < 0:
        T = -T
    obs = []
    bolt = H + D * (tyre_r + 0.016) + T * 0.012
    pad_r = rim["bead"] - 0.0065
    half = rim.get("rim_w", 0.02) / 2
    for s in (1, -1):
        padc = H + D * pad_r + T * 0.012 + Y * s * (half + 0.0055)
        # the arm: from the bolt, out over the tyre, down to the pad (its section flat across T)
        w_out = max(half, rim.get("tw", 0.025) / 2) + 0.012
        top = bolt + Y * s * 0.012 + D * 0.004
        out = H + D * (tyre_r + 0.006) + T * 0.012 + Y * s * w_out
        pts = bk.fillet([bolt + Y * s * 0.002, top, out, padc + Y * s * 0.008 + D * 0.004, padc + Y * s * 0.008 - D * 0.008], [0, 0.01, 0.015, 0.01, 0], 4)
        obs.append(bk.sweep("cal_arm", pts, (0.0055, 0.0035), kind, grp, n=8, up=T))
        obs += pad(padc, T, s, grp)
    obs.append(bk.cyl_ax("cal_bolt", bolt, T, 0.004, 0.03, "steel", grp, n=8))
    obs.append(bk.cyl_ax("cal_nut", bolt + T * 0.012, T, 0.0055, 0.006, "steel", grp, n=6))
    # the spring over the top, the cable's anchor on the right arm, the barrel adjuster on the left
    if bk.near():
        spr = bk.bez(bolt + Y * 0.016 + D * 0.002, bolt + Y * 0.006 + D * 0.014, bolt - Y * 0.006 + D * 0.014, bolt - Y * 0.016 + D * 0.002, 8)
        obs.append(bk.sweep("cal_spring", spr, 0.0011, "steel", grp, n=5))
    anchor = bolt + Y * 0.022 + D * 0.016
    obs.append(bk.cyl_ax("cal_barrel", anchor, D, 0.0045, 0.014, kind, grp, n=10))
    obs.append(bk.cyl_ax("cal_anchor", bolt - Y * 0.024 + D * 0.006, T, 0.005, 0.008, "steel", grp, n=6))
    return obs, anchor + D * 0.007


def cantilevers(hub, D, rim, blade_y, grp, wide=True, kind="alloy", u_brake=False):
    """A pair of cantilevers on their bosses (on the blades or the stays, at y = ±blade_y), the pads into the
    rim's track, the straddle cable to the yoke, the main cable up to its hanger. Returns (objs, the yoke)."""
    H, D = Vector(hub), Vector(D).normalized()
    Y = Vector((0, 1, 0))
    T = Y.cross(D).normalized()
    obs = []
    pad_r = rim["bead"] - 0.0065
    boss_r = pad_r - 0.012
    tips = []
    for s in (1, -1):
        boss = H + D * boss_r + Y * s * blade_y
        obs.append(bk.cyl_ax("canti_boss", boss + Y * s * 0.004, Y, 0.0055, 0.016, "steel", grp, n=10))
        if u_brake:
            tip = boss + D * 0.065 - Y * s * (blade_y - 0.02)
            arm = [boss + Y * s * 0.008, boss + D * 0.03 + Y * s * 0.006, tip]
        else:
            out = 0.06 if wide else 0.035
            tip = boss + D * 0.035 + Y * s * out
            arm = [boss + Y * s * 0.008, boss + D * 0.012 + Y * s * (out * 0.55), tip]
        obs.append(bk.sweep("canti_arm", bk.fillet(arm, 0.01, 3), (0.006, 0.0045), kind, grp, n=8, up=T))
        obs.append(bk.cyl_ax("canti_spring", boss + Y * s * 0.017, Y, 0.0075, 0.006, "steel", grp, n=10))
        padc = H + D * pad_r + Y * s * (rim.get("rim_w", 0.02) / 2 + 0.0055)
        obs += pad(padc, T, s, grp)
        obs.append(bk.rod("canti_post", padc + Y * s * 0.012, boss + D * 0.012 + Y * s * 0.01, 0.003, "steel", grp, n=6))
        tips.append(tip)
    yoke = (tips[0] + tips[1]) / 2 + D * (0.045 if not u_brake else 0.03)
    if bk.near() or bk.LOD == "mid":
        for tp in tips:
            obs.append(bk.rod("straddle", tp, yoke, 0.0009, "steel", grp, n=5))
        tri = [yoke + Y * 0.01 - D * 0.004, yoke - Y * 0.01 - D * 0.004, yoke + D * 0.012]
        obs.append(bk.sweep("yoke", tri, 0.0022, "alloy", grp, n=6, closed=True))
    return obs, yoke + D * 0.012


def cable(pts, grp, kind="trim", r=0.0024, smooth=0.03):
    """A cable's housing (or a bare cable: kind steel, r 0.0008) along points, its bends rounded."""
    if not bk.near() and r < 0.002:
        return []
    if bk.LOD == "far":
        return []
    p = bk.fillet([Vector(x) for x in pts], smooth, 5) if smooth > 0 else [Vector(x) for x in pts]
    p = bk.resample(p, 0.03 if bk.near() else 0.06)
    if len(p) < 2:
        return []
    return [bk.sweep("cable", p, r, kind, grp, n=6 if r >= 0.002 else 4, cap=(r >= 0.002, r >= 0.002))]


def ferrule(at, d, grp):
    return [bk.cyl_ax("ferrule", at, d, 0.0032, 0.008, "chrome", grp, n=8)]

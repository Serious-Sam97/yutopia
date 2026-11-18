# Plan 101 — what hangs on a bike: mudguards and their stays, racks (rear, the post bike's big front carrier),
# the chain's case and guard, skirt guards (strings or panels), the wicker basket, the kickstand, bottle cages
# and bottles, the frame pump, panniers and the rack's bag, the BMX's number plate, pads, gyro and pegs, the
# bell, the lamps (dynamo headlamp and its bottle dynamo, battery lamps, the mudguard's rear lamp) and the
# reflectors.
import math

from mathutils import Matrix, Vector

import bkit as bk
import kit

Y = Vector((0, 1, 0))


def polar(H, r, deg, y=0.0):
    a = math.radians(deg)
    return Vector((H.x + r * math.cos(a), y, H.z + r * math.sin(a)))


# ── mudguards ─────────────────────────────────────────────────────────────────────────────────────────────────


def mudguard(H, R, a0, a1, wg, grp, kind="paint", tip=None, stays=(), ol=0.1, flap=False):
    """A guard round a wheel (hub H): an arc of radius R from angle a0 to a1 (degrees, from +x toward +z, seen
    from the right), its section a crowned channel wg wide; its stays from the given angles to the dropouts'
    eyelets; a white tail tip (the Dutch one) if `tip` (degrees from a1 back)."""
    H = Vector(H)
    obs = []
    n_a = max(6, int(abs(a1 - a0) / (6 if bk.near() else 14)))
    m = 6 if bk.near() else 4
    secs = []
    for i in range(n_a + 1):
        a = math.radians(a0 + (a1 - a0) * i / n_a)
        Rv = Vector((math.cos(a), 0, math.sin(a)))
        sec = []
        # outer surface left→right, then the inner back
        for k in range(m):
            u = -1 + 2 * k / (m - 1)
            ro = R + 0.007 * (1 - u * u) - (0.004 if abs(u) > 0.95 else 0.0)
            sec.append(H + Rv * ro + Y * (u * wg / 2))
        for k in range(m - 1, -1, -1):
            u = -1 + 2 * k / (m - 1)
            ro = R + 0.007 * (1 - u * u) - 0.0012 - (0.004 if abs(u) > 0.95 else 0.0)
            sec.append(H + Rv * ro + Y * (u * wg / 2 * 0.97))
        secs.append(sec)
    split = None
    if tip:
        split = int(n_a * (1 - tip / abs(a1 - a0)))
        obs.append(bk.loft("guard", secs[: split + 1], kind, grp, smooth=True))
        obs.append(bk.loft("guardtip", secs[split:], "decal", grp, smooth=True))
    else:
        obs.append(bk.loft("guard", secs, kind, grp, smooth=True))
    # the stays: a wire each side from the guard's edge to the eyelet by the axle
    for sa in stays:
        a = math.radians(sa)
        Rv = Vector((math.cos(a), 0, math.sin(a)))
        for s in (1, -1):
            p0 = H + Rv * (R + 0.002) + Y * s * (wg / 2 - 0.004)
            p1 = H + Rv * 0.012 + Y * s * (ol / 2 + 0.006) + Vector((0, 0, -0.012))
            obs.append(bk.rod("guardstay", p0, p1, 0.0022, "steel" if kind != "paint" else "chrome", grp, n=6))
            obs.append(bk.cyl_ax("staybolt", p1, Y, 0.0045, 0.005, "steel", grp, n=6))
    if flap:
        a = math.radians(a1)
        Rv = Vector((math.cos(a), 0, math.sin(a)))
        Tv = Vector((-math.sin(a), 0, math.cos(a))) * (1 if a1 > a0 else -1)
        base = H + Rv * (R + 0.004)
        obs.append(bk.box("flap", base + Tv * 0.04 - Rv * 0.004, (0.003, wg * 0.95, 0.07), "rubber", grp))
        # (laid along the guard's end, hanging)
        o = obs[-1]
        o.data.transform(Matrix.Translation(base) @ Matrix.Rotation(-a + math.pi / 2, 4, "Y") @ Matrix.Translation(-base))
    return obs


# ── racks ─────────────────────────────────────────────────────────────────────────────────────────────────────


def rear_rack(H, top_z, x0, x1, w, ss_pt, ol, grp, kind="steel", r=0.0048, clamp=False, plate=True):
    """A tubular rear rack: its platform from x0 (front) to x1 (back) at top_z, w wide; its legs to the dropouts'
    eyelets, its front stays to the seat stays at ss_pt. Returns (objs, the platform's back centre)."""
    H = Vector(H)
    obs = []
    hw = w / 2
    # the outer loop (a U from the front round the back), the middle rail, the cross bars
    loop = [Vector((x0, hw, top_z)), Vector((x1, hw, top_z)), Vector((x1, -hw, top_z)), Vector((x0, -hw, top_z))]
    obs.append(bk.sweep("rack_loop", bk.fillet(loop, 0.03, 4), r, kind, grp, n=10))
    obs.append(bk.rod("rack_mid", Vector((x0 - 0.01, 0, top_z)), Vector((x1, 0, top_z)), r * 0.85, kind, grp, n=8))
    for t in (0.0, 0.33, 0.66):
        x = x0 + (x1 - x0) * t
        obs.append(bk.rod("rack_cross", Vector((x, -hw, top_z - 0.001)), Vector((x, hw, top_z - 0.001)), r * 0.8, kind, grp, n=8))
    # the legs: each side two, down to the eyelet
    for s in (1, -1):
        eye = Vector((H.x - 0.012, s * (ol / 2 + 0.008), H.z - 0.016))
        for xa in (x1 + 0.03, (x0 + x1) / 2 - 0.02):
            obs.append(bk.sweep("rack_leg", bk.fillet([Vector((xa, s * hw, top_z)), Vector((xa + 0.01, s * (hw + 0.004), top_z - 0.06)), eye], 0.04, 4), r * 0.95, kind, grp, n=8))
        obs.append(bk.cyl_ax("rack_eye", eye, Y, 0.006, 0.006, "steel", grp, n=8))
        # the front stays: flat straps to the seat stays
        sp = Vector(ss_pt) + Vector((0, s * 0.02, 0))
        obs.append(bk.sweep("rack_stay", [Vector((x0, s * hw * 0.6, top_z - 0.002)), sp], (0.0015, 0.006), "steel", grp, n=6, up=(0, 0, 1)))
    back = Vector((x1, 0, top_z))
    if plate:
        obs.append(bk.box("rack_plate", Vector((x1 - 0.002, 0, top_z - 0.035)), (0.003, 0.08, 0.06), kind if kind != "steel" else "trim", grp, r=0.002))
    if clamp:
        # the spring clamp: a wire loop hinged at the front, lying on the platform
        cl = [Vector((x0 + 0.02, 0.07, top_z + 0.012)), Vector((x1 - 0.03, 0.07, top_z + 0.012)), Vector((x1 - 0.03, -0.07, top_z + 0.012)), Vector((x0 + 0.02, -0.07, top_z + 0.012))]
        obs.append(bk.sweep("rack_clamp", bk.fillet(cl, 0.03, 4), 0.0032, "chrome", grp, n=8))
        obs.append(bk.helix("rack_spring", Vector((x0 + 0.015, 0.075, top_z + 0.006)), (0, -1, 0), 0.007, 0.0055, 2.5, 0.0016, "chrome", grp, n_per=8))
        obs.append(bk.helix("rack_spring", Vector((x0 + 0.015, -0.06, top_z + 0.006)), (0, -1, 0), 0.007, 0.0055, 2.5, 0.0016, "chrome", grp, n_per=8))
    return obs, back


def front_carrier(HB, HT, a, top_z, x0, x1, w, grp, kind="paint"):
    """The post bike's big front carrier, fixed to the head tube (the bars turn above it, the wheel under it):
    a tubular frame with flat slats, its struts to the head tube."""
    obs = []
    hw = w / 2
    loop = [Vector((x0, hw, top_z)), Vector((x1, hw, top_z)), Vector((x1, -hw, top_z)), Vector((x0, -hw, top_z))]
    obs.append(bk.sweep("carrier_loop", bk.fillet(loop + [loop[0]], 0.04, 4), 0.008, kind, grp, n=10))
    for i in range(1, 7):
        x = x0 + (x1 - x0) * i / 7
        obs.append(bk.sweep("carrier_slat", [Vector((x, -hw, top_z + 0.001)), Vector((x, hw, top_z + 0.001))], (0.0025, 0.012), kind, grp, n=6, up=(1, 0, 0)))
    obs.append(bk.rod("carrier_mid", Vector((x0, 0, top_z + 0.002)), Vector((x1, 0, top_z + 0.002)), 0.006, kind, grp, n=8))
    # the struts: from the head tube's lugs out to the frame's back corners and down the front to a brace
    HB, HT = Vector(HB), Vector(HT)
    for s in (1, -1):
        obs.append(bk.sweep("carrier_strut", bk.fillet([HT - Vector(a) * 0.02 + Vector((0.01, s * 0.012, 0)), Vector((x0 + 0.04, s * hw * 0.7, top_z - 0.01))], 0.02, 3), 0.0075, kind, grp, n=10))
        obs.append(bk.sweep("carrier_strut", bk.fillet([HB + Vector((0.015, s * 0.014, 0.01)), Vector((x0 + 0.12, s * hw * 0.85, top_z - 0.06)), Vector((x0 + 0.18, s * hw * 0.95, top_z - 0.004))], 0.03, 3), 0.0075, kind, grp, n=10))
    obs.append(bk.sweep("carrier_lug", [HT - Vector(a) * 0.035, HT - Vector(a) * 0.005], 0.0205, kind, grp, n=16))
    obs.append(bk.sweep("carrier_lug", [HB + Vector(a) * 0.005, HB + Vector(a) * 0.03], 0.0205, kind, grp, n=16))
    return obs, Vector((x1, 0, top_z))


# ── the chain's case and guard ───────────────────────────────────────────────────────────────────────────────


def chain_case(bb, R1, hub, R2, y_in, y_out, grp, kind="paint2", full=True):
    """A full chain case (the stadium round both sprockets) or a half guard over the top run."""
    bb, hub = Vector(bb), Vector(hub)
    obs = []
    if full:
        circles = [(bb.x, bb.z, R1 + 0.028, 1), (hub.x, hub.z, R2 + 0.032, 1)]
        outline = bk.belt(circles, 28 if bk.near() else 10)
        # (the side's skin a little crowned: built as two plates and a rim band, bevelled)
        o = kit.prism("case", outline, y_out, y_in, kind, grp, smooth=False)
        kit.bevel(o, 0.006, 3 if bk.near() else 1, angle=30)
        obs.append(o)
        # the case's seam line round its middle and the inspection cap over the hub's nut
        if bk.near():
            seam = [Vector((x, y_out - 0.0005, z)) for x, z in bk.belt([(bb.x, bb.z, R1 + 0.012, 1), (hub.x, hub.z, R2 + 0.016, 1)], 28)]
            obs.append(bk.sweep("case_seam", bk.resample(seam + [seam[0]], 0.02)[:-1], 0.0012, "trim", grp, n=3, closed=True))
        obs.append(bk.cyl_ax("case_cap", Vector((hub.x, y_out - 0.002, hub.z)), Y, 0.022, 0.004, "chrome", grp, n=20))
    else:
        # a half guard: a plate over the ring's top and the top run, its lip folded in over the chain
        a0, a1 = 30, 150
        top = []
        for i in range(12):
            a = math.radians(a0 + (a1 - a0) * i / 11)
            top.append((bb.x + (R1 + 0.02) * math.cos(a), bb.z + (R1 + 0.02) * math.sin(a)))
        # back along the top run toward the cog
        d = (hub - bb)
        back = (hub.x + 0.04, hub.z + R2 + 0.03)
        outl = top[::-1] + [(back[0] + 0.03, back[1] - 0.005), (back[0] + 0.03, back[1] - 0.04), (bb.x - R1 * 0.4, bb.z + R1 * 0.55)]
        o = kit.prism("guard", outl, y_out, y_out + 0.002, kind, grp, smooth=False)
        obs.append(o)
        lip = [Vector((x, y_out + 0.006, z)) for x, z in top[::-1]] + [Vector((back[0] + 0.03, y_out + 0.006, back[1] - 0.005))]
        obs.append(bk.sweep("guardlip", lip, (0.0045, 0.0015), kind, grp, n=6, up=(0, 0, 1)))
    return obs


def skirt_strings(H, R, y_side, grp, n=13, a0=70, a1=175, kind="paint2"):
    """The dress guard's elastic strings, from the mudguard's edge to a little plate by the axle, both sides."""
    H = Vector(H)
    obs = []
    for s in (1, -1):
        for i in range(n):
            a = a0 + (a1 - a0) * i / (n - 1)
            p0 = polar(H, R - 0.004, a, s * y_side)
            p1 = polar(H, 0.075, a0 + 20 + (a1 - a0 - 30) * i / (n - 1), s * 0.052)
            obs.append(bk.rod("skirt_string", p0, p1, 0.0012, kind, grp, n=4, cap=False))
        # the plate by the hub
        out = [(H.x + r * math.cos(math.radians(a)), H.z + r * math.sin(math.radians(a))) for a in range(a0 + 15, a1 - 5, 10) for r in (0.08,)]
        inn = [(H.x + 0.06 * math.cos(math.radians(a)), H.z + 0.06 * math.sin(math.radians(a))) for a in range(a1 - 5 - 10, a0 + 15 - 10, -10)]
        if len(out) >= 3:
            o = kit.prism("skirt_plate", out + inn, s * 0.05 - 0.001, s * 0.05 + 0.001, "steel", grp)
            obs.append(o)
    return obs


def skirt_panels(H, R, y_side, grp, a0=72, a1=172, kind="trim"):
    """A moulded dress guard each side: a quarter disc from the hub's ring out to the mudguard."""
    H = Vector(H)
    obs = []
    for s in (1, -1):
        out = [(H.x + (R - 0.006) * math.cos(math.radians(a)), H.z + (R - 0.006) * math.sin(math.radians(a))) for a in range(a0, a1 + 1, 5)]
        inn = [(H.x + 0.21 * math.cos(math.radians(a)), H.z + 0.21 * math.sin(math.radians(a))) for a in range(a1, a0 - 1, -5)]
        o = kit.prism("skirt_panel", out + inn, s * y_side - 0.0012, s * y_side + 0.0012, kind, grp)
        obs.append(o)
        # its ribs (the moulding's slots)
        if bk.near():
            for a in range(a0 + 15, a1 - 5, 20):
                p0 = polar(H, 0.225, a, s * (y_side + 0.0015))
                p1 = polar(H, R - 0.03, a, s * (y_side + 0.0015))
                obs.append(bk.rod("skirt_rib", p0, p1, 0.0018, kind, grp, n=4))
    return obs


# ── the basket ────────────────────────────────────────────────────────────────────────────────────────────────


def basket(c, w, d, h, grp, kind="wicker"):
    """A wicker basket: bottom centre c, top w × d, h deep, its sides tapering in to the base; woven strands round
    upright stakes, a thick rolled rim, a woven base."""
    c = Vector(c)
    obs = []
    stakes = 22 if bk.near() else 12

    def contour(t, k_off=0.0, n=stakes):
        # a rounded rectangle at height t (0 base, 1 rim), its points at the stakes
        s = 0.86 + 0.14 * t
        ww, dd = w * s / 2, d * s / 2
        pts = []
        for i in range(n):
            a = 2 * math.pi * (i + k_off) / n
            ca, sa = math.cos(a), math.sin(a)
            # a superellipse: x the depth (forward), y the width
            x = dd * math.copysign(abs(ca) ** 0.4, ca)
            y = ww * math.copysign(abs(sa) ** 0.4, sa)
            pts.append(Vector((x, y, 0)))
        return pts

    rows = 8 if bk.near() else 3
    for j in range(rows):
        t = (j + 0.5) / rows
        n_pts = stakes * 2
        base = contour(t, 0.0, n_pts)
        pts = []
        for i, p in enumerate(base):
            nrm = Vector((p.x, p.y, 0)).normalized()
            wav = 0.0028 * (1 if (i + j) % 2 == 0 else -1)
            pts.append(c + p + nrm * wav + Vector((0, 0, t * h)))
        if bk.near():
            obs.append(bk.sweep("weave", pts, (0.0022, h / rows * 0.48), kind, grp, n=4, closed=True, up=(0, 0, 1)))
        else:
            obs.append(bk.sweep("weave", pts, (0.002, h / rows * 0.5), kind, grp, n=4, closed=True, up=(0, 0, 1)))
    for i, p in enumerate(contour(0.0)):
        top = contour(1.0)[i]
        obs.append(bk.rod("stake", c + p, c + top + Vector((0, 0, h + 0.004)), 0.0026, kind, grp, n=5))
    rim = [c + p + Vector((0, 0, h + 0.006)) for p in contour(1.0, 0.0, 48 if bk.near() else 16)]
    obs.append(bk.sweep("rim", rim, 0.0085, kind, grp, n=8, closed=True))
    base = contour(0.0, 0.0, 24)
    obs.append(kit.prism("base", [(p.x + c.x, p.y + c.y) for p in base], c.z - 0.006, c.z + 0.002, kind, grp, axis="z"))
    return obs


# ── the kickstand ─────────────────────────────────────────────────────────────────────────────────────────────


def kickstand(K, ds, dd, L, grp_mount, grp_leg, mount_y=0.035, ground_lean=0.0):
    """A side stand hinged at K: its leg modelled stowed along ds (back along the left chain stay), turning to dd.
    Returns (objs, axis, angle, the foot when down)."""
    K, ds, dd = Vector(K), Vector(ds).normalized(), Vector(dd).normalized()
    obs = []
    # the mount: a clamp plate across both stays behind the bottom bracket, its bolt
    obs.append(bk.box("ks_plate", K + Vector((0.0, -mount_y, 0.012)), (0.05, mount_y * 2 + 0.03, 0.006), "alloy_dark", grp_mount, r=0.002))
    obs.append(bk.box("ks_clamp", K + Vector((0.0, -mount_y, -0.012)), (0.04, mount_y * 2 + 0.02, 0.006), "alloy_dark", grp_mount, r=0.002))
    obs.append(bk.rod("ks_bolt", K + Vector((0.0, -mount_y, 0.02)), K + Vector((0.0, -mount_y, -0.02)), 0.004, "steel", grp_mount, n=6))
    obs.append(bk.box("ks_knuckle", K, (0.03, 0.022, 0.03), "alloy_dark", grp_mount, r=0.004))
    # the leg: a tapered alloy tube, its rubber foot
    foot_s = K + ds * L
    obs.append(bk.sweep("ks_leg", [K + ds * 0.01, K + ds * (L * 0.5), foot_s - ds * 0.02], [0.0085, 0.0075, 0.0062], "alloy_dark", grp_leg, n=10))
    obs.append(bk.cyl_ax("ks_foot", foot_s - ds * 0.012, ds, 0.0095, 0.03, "rubber", grp_leg, n=10))
    axis = ds.cross(dd).normalized()
    ang = math.acos(max(-1, min(1, ds.dot(dd))))
    return obs, axis, ang, K + dd * L


# ── bottles, pump ─────────────────────────────────────────────────────────────────────────────────────────────


def bottle_cage(c, d, side_n, grp, bottle=True, cage_kind="alloy", bottle_kind="nylon"):
    """A cage on a tube's bosses (c: the cage's foot on the tube, d up the tube, side_n: away from the tube)
    and its bottle."""
    c, d, nrm = Vector(c), Vector(d).normalized(), Vector(side_n).normalized()
    obs = []
    ax = c + nrm * 0.042  # (the bottle's axis)
    yv = d.cross(nrm).normalized()
    cage_kind = cage_kind if bk.near() else None
    # the cage's wires: two hoops round the bottle, a spine up the tube, the foot hook
    for t in ((0.05, 0.15) if cage_kind else ()):
        hoop = []
        for i in range(12):
            a = math.pi * (0.15 + 1.7 * i / 11)
            hoop.append(ax + d * t + (-nrm * math.cos(a) + yv * math.sin(a)) * 0.039)
        obs.append(bk.sweep("cage", hoop, 0.002, cage_kind, grp, n=5))
    for s in ((1, -1) if cage_kind else ()):
        obs.append(bk.sweep("cage", bk.fillet([c + d * 0.0 + yv * s * 0.008, c + nrm * 0.004 + d * 0.16 + yv * s * 0.01, ax + d * 0.17 - nrm * 0.02 + yv * s * 0.028], 0.02, 3), 0.002, cage_kind, grp, n=5))
    if cage_kind:
        obs.append(bk.sweep("cage", bk.fillet([c + d * 0.01, ax - d * 0.012 - nrm * 0.03, ax - d * 0.012 + nrm * 0.02, ax + d * 0.02 + nrm * 0.035], 0.012, 3), 0.002, cage_kind, grp, n=5))
    for t in ((0.03, 0.1) if cage_kind else ()):
        obs.append(bk.cyl_ax("cagebolt", c + d * t + nrm * 0.002, nrm, 0.0045, 0.004, "steel", grp, n=6))
    if bottle:
        prof = [(0.0, -0.002), (0.032, -0.002), (0.037, 0.01), (0.037, 0.05), (0.034, 0.075), (0.037, 0.1), (0.037, 0.16), (0.03, 0.185), (0.014, 0.195), (0.014, 0.205)]
        obs.append(bk.lathe_ax("bottle", prof, ax - d * 0.005, d, 18 if bk.near() else 10, bottle_kind, grp))
        obs.append(bk.lathe_ax("bottlecap", [(0.0, 0.205), (0.016, 0.205), (0.016, 0.218), (0.006, 0.222), (0.004, 0.235), (0.0, 0.235)], ax - d * 0.005, d, 16 if bk.near() else 8, "trim", grp))
    return obs


def pump(a, b, grp, kind="nylon"):
    """A frame pump under the top tube (or along the seat tube): its barrel, its handle and head."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    obs = [bk.sweep("pump", [a + d * 0.03, b - d * 0.035], 0.0125, kind, grp, n=14)]
    obs.append(bk.sweep("pump_head", [a, a + d * 0.03], [0.0115, 0.013], "trim", grp, n=12))
    obs.append(bk.sweep("pump_handle", [b - d * 0.035, b], [0.014, 0.012], "trim", grp, n=12))
    return obs


# ── bags ──────────────────────────────────────────────────────────────────────────────────────────────────────


def pannier(c, L, H, W, side, grp, kind="canvas", strap="webbing"):
    """A pannier hanging off a rack's side: its body (c: its top's middle at the rack), its flap, straps and
    hooks."""
    c = Vector(c)
    obs = []
    body = bk.box("pannier", c + Vector((0, side * W / 2, -H / 2)), (L, W, H), kind, grp, r=0.025, segs=3)
    obs.append(body)
    obs.append(bk.box("pannier_flap", c + Vector((0, side * W / 2, -0.04)), (L * 1.02, W * 1.06, 0.09), kind, grp, r=0.02, segs=2))
    for dx in (-L * 0.28, L * 0.28):
        obs.append(bk.box("pannier_strap", c + Vector((dx, side * (W + 0.002), -0.09)), (0.022, 0.004, 0.12), strap, grp))
        obs.append(bk.box("pannier_buckle", c + Vector((dx, side * (W + 0.005), -0.14)), (0.026, 0.005, 0.02), "trim", grp))
        obs.append(bk.box("pannier_hook", c + Vector((dx, side * 0.004, 0.006)), (0.03, 0.012, 0.018), "trim", grp))
    if bk.near():
        # the pocket on its outside
        obs.append(bk.box("pannier_pocket", c + Vector((0, side * (W + 0.012), -H * 0.62)), (L * 0.6, 0.03, H * 0.42), kind, grp, r=0.012, segs=2))
    return obs


# ── BMX ───────────────────────────────────────────────────────────────────────────────────────────────────────


def peg(c, side, grp, L=0.105, r=0.019):
    """A stunt peg on an axle: a knurled steel tube outward from the dropout."""
    c = Vector(c)
    a = c + Y * side * 0.0
    b = c + Y * side * L
    pts = bk.resample([a, b], 0.006 if bk.near() else 0.05)

    def knurl(i, k, an):
        return 1.0 + (0.04 if (i % 2 == 0 and 1 < i < len(pts) - 2) else 0.0)

    obs = [bk.sweep("peg", pts, r, "steel", grp, n=16, rfun=knurl if bk.near() else None)]
    obs.append(bk.cyl_ax("pegcap", b, Y, r * 0.75, 0.004, "steel", grp, n=12))
    return obs


def number_plate(c, grp, number="27"):
    """A race number plate on the bars' crossbar, facing forward."""
    c = Vector(c)
    obs = []
    out = kit.rrect(0.19, 0.16, 0.035, 4)
    o = kit.xprism("numberplate", out, -0.0015, 0.0015, "nylon", grp, smooth=False)
    kit.move(o, c)
    obs.append(o)
    obs.append(bk.decal_flat("number", number, 0.1, c + Vector((0.0016, 0, -0.008)), (0, -1, 0), (0, 0, 1), "trim", grp, depth=0.0004, bold=True))
    for dy in (-0.05, 0.05):
        obs.append(bk.box("ziptie", c + Vector((-0.012, dy, 0.065)), (0.024, 0.004, 0.006), "trim", grp))
    return obs


def pad_on(a, b, r, grp, kind="foam"):
    a, b = Vector(a), Vector(b)
    return [bk.sweep("pad", [a, b], r, kind, grp, n=14), bk.cyl_ax("padend", a, (b - a), r * 0.96, 0.004, kind, grp, n=14), bk.cyl_ax("padend", b, (b - a), r * 0.96, 0.004, kind, grp, n=14)]


def gyro(ST, a, grp_low, grp_up):
    """The rotor (detangler) under the stem: a lower plate (the frame's), a bearing, an upper plate (the bars'),
    each with two ears for its cables. Returns (objs, lower ears, upper ears)."""
    ST, a = Vector(ST), Vector(a).normalized()
    obs = []
    lo = ST + a * 0.03
    up = ST + a * 0.042
    obs.append(bk.lathe_ax("gyro_low", [(0.014, -0.003), (0.034, -0.003), (0.034, 0.003), (0.014, 0.003)], lo, a, 32 if bk.near() else 12, "alloy", grp_low, smooth=False))
    obs.append(bk.lathe_ax("gyro_bearing", [(0.013, 0.003), (0.028, 0.003), (0.028, 0.009), (0.013, 0.009)], lo, a, 24 if bk.near() else 10, "steel", grp_up))
    obs.append(bk.lathe_ax("gyro_up", [(0.013, -0.003), (0.032, -0.003), (0.032, 0.003), (0.013, 0.003)], up, a, 32 if bk.near() else 12, "alloy", grp_up, smooth=False))
    ears_lo, ears_up = [], []
    for s in (1, -1):
        e1 = lo + Vector((0.0, s * 0.04, 0.0))
        obs.append(bk.cyl_ax("gyro_ear", e1, a, 0.006, 0.006, "alloy", grp_low, n=10))
        ears_lo.append(e1)
        e2 = up + Vector((0.0, s * 0.038, 0.0))
        obs.append(bk.cyl_ax("gyro_ear", e2, a, 0.006, 0.006, "alloy", grp_up, n=10))
        ears_up.append(e2)
    return obs, ears_lo, ears_up


# ── the bell, lamps, reflectors ──────────────────────────────────────────────────────────────────────────────


def bell(at, bar_dir, grp, kind="chrome", r=0.027):
    """A ding-dong bell clamped to the bar: its dome over the bar, its striker's thumb lever toward the grip.
    Returns (objs, the thumb lever's tip)."""
    at = Vector(at)
    b = Vector(bar_dir).normalized()
    obs = [bk.sweep("bell_clamp", [at - b * 0.006, at + b * 0.006], 0.0135, "chrome", grp, n=12)]
    c = at + Vector((0.006, 0, 0.034))
    obs.append(bk.lathe_ax("bell_dome", [(0.0, 0.016), (r * 0.45, 0.0145), (r * 0.82, 0.01), (r, 0.002), (r * 1.02, -0.002), (r * 0.96, -0.002), (r * 0.8, 0.007), (r * 0.4, 0.011), (0.0, 0.012)], c, (0, 0, 1), 22 if bk.near() else 12, kind, grp))
    obs.append(bk.rod("bell_post", at + Vector((0, 0, 0.012)), c + Vector((0, 0, 0.004)), 0.004, "chrome", grp, n=8))
    obs.append(bk.cyl_ax("bell_cap", c + Vector((0, 0, 0.018)), (0, 0, 1), 0.0055, 0.005, kind, grp, n=10))
    tip = c + b * 0.035 + Vector((-0.004, 0, -0.012))
    obs.append(bk.sweep("bell_lever", [c + Vector((0, 0, -0.006)), c + b * 0.02 + Vector((0, 0, -0.01)), tip], (0.0014, 0.0045), "chrome", grp, n=6, up=(0, 0, 1)))
    obs.append(bk.cyl_ax("bell_thumb", tip, (0, 0, 1), 0.006, 0.003, "chrome", grp, n=10))
    return obs, tip


def headlamp(c, grp, kind="chrome", r=0.034, depth=0.06):
    """A round headlamp facing +x (its lens centre at c): the shell, the chromed rim, the lens, the bulb's
    glow behind it (emit_head), the reflector's bowl."""
    c = Vector(c)
    X = Vector((1, 0, 0))
    obs = []
    n = 32 if bk.near() else 12
    obs.append(bk.lathe_ax("lamp_shell", [(0.0, -depth), (r * 0.45, -depth + 0.004), (r * 0.82, -depth * 0.6), (r * 0.98, -0.012), (r, -0.004)], c, X, n, kind, grp))
    obs.append(bk.lathe_ax("lamp_rim", [(r * 0.86, -0.003), (r * 1.04, -0.004), (r * 1.06, 0.002), (r * 0.9, 0.005)], c, X, n, "chrome", grp))
    obs.append(bk.lathe_ax("lamp_glow", [(0.0, -0.012), (r * 0.86, -0.009)], c, X, n, "emit_head", grp))
    obs.append(bk.lathe_ax("lamp_bowl", [(r * 0.2, -0.03), (r * 0.86, -0.0095)], c, X, n, "reflector", grp, cap=False))
    obs.append(bk.lathe_ax("lamp_lens", [(0.0, 0.004), (r * 0.6, 0.0035), (r * 0.88, 0.0015)], c, X, n, "lens", grp))
    return obs


def battery_lamp(c, grp, w=0.06, h=0.045, depth=0.07, kind="trim"):
    """A boxy battery lamp facing +x (lens centre c): a rounded body, its lens and glow, the switch."""
    c = Vector(c)
    obs = [bk.box("blamp_body", c + Vector((-depth / 2, 0, 0)), (depth, w, h), kind, grp, r=0.01, segs=3)]
    obs.append(bk.box("blamp_glow", c + Vector((-0.004, 0, 0)), (0.002, w * 0.78, h * 0.72), "emit_head", grp, r=0.006))
    obs.append(bk.box("blamp_lens", c + Vector((0.0, 0, 0)), (0.004, w * 0.84, h * 0.78), "lens", grp, r=0.007))
    obs.append(bk.box("blamp_switch", c + Vector((-depth * 0.6, 0, h / 2 + 0.002)), (0.014, 0.01, 0.006), "rubber", grp, r=0.002))
    return obs


def bottle_dynamo(at, toward, roller, grp):
    """A bottle dynamo on its bracket (at), its body leaning to the tyre, its knurled roller on the sidewall."""
    at, roller = Vector(at), Vector(roller)
    d = (roller - at).normalized()
    obs = [bk.sweep("dyn_body", [at, roller - d * 0.012], [0.0165, 0.0145], "chrome", grp, n=18)]
    obs.append(bk.cyl_ax("dyn_roller", roller - d * 0.004, d, 0.0095, 0.014, "rubber", grp, n=14))
    obs.append(bk.box("dyn_bracket", at - d * 0.012 + Vector((0, 0, 0)), (0.03, 0.012, 0.012), "steel", grp, r=0.002))
    obs.append(bk.cyl_ax("dyn_cap", at - d * 0.002, d, 0.0168, 0.006, "trim", grp, n=18))
    return obs


def rear_lamp(c, grp, kind="trim", guard=True):
    """A rear lamp facing −x (its lens centre c): a body, a red lens over its glow (emit_tail), a reflector
    below."""
    c = Vector(c)
    obs = [bk.box("rlamp_body", c + Vector((0.016, 0, 0)), (0.032, 0.052, 0.038), kind, grp, r=0.008)]
    obs.append(bk.box("rlamp_glow", c + Vector((0.004, 0, 0.002)), (0.002, 0.04, 0.026), "emit_tail", grp, r=0.005))
    obs.append(bk.box("rlamp_lens", c + Vector((0.0, 0, 0.002)), (0.006, 0.046, 0.03), "lens_red", grp, r=0.006))
    if guard:
        obs.append(bk.box("rlamp_refl", c + Vector((0.004, 0, -0.03)), (0.006, 0.05, 0.022), "lens_red", grp, r=0.004))
    return obs


def reflector(c, facing, grp, kind="lens_red", w=0.06, h=0.03):
    """A plastic reflector facing ±x (c its face's centre): its lens and its holder."""
    c = Vector(c)
    f = 1 if facing > 0 else -1
    obs = [bk.box("refl", c + Vector((-f * 0.003, 0, 0)), (0.006, w, h), kind, grp, r=0.004)]
    obs.append(bk.box("refl_holder", c + Vector((-f * 0.008, 0, 0)), (0.006, w * 1.04, h * 1.1), "trim", grp, r=0.004))
    return obs

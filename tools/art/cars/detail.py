# Plan 92 (quality pass) — the details where the eye goes, added to a dressed road car (dress.py calls these):
# the panel gaps' dark walls, the door seals, handle recesses and keyholes, washer jets, the wipers' springs,
# the fuel flap, the exhaust's hanger, the valance under the bumper, the suspension in the arches, the switch
# panel with its legends, the door cards' speakers, the seat belts; and the police's and taxi's liveries
# (groups `livery_police_*`, `livery_taxi_*`: hidden by the game unless the car has the role).
import math

import bmesh
import bpy
from mathutils import Vector

import kit
import parts
from bodies import door_outline, eroded_top

# ── the gaps ───────────────────────────────────────────────────────────────────────────────────────────────


def _split(o, pred, kind):
    """Faces of o passing pred(face) → a new object of `kind` (same group)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    take = [f for f in bm.faces if pred(f)]
    if not take:
        bm.free()
        return None
    ids = {f.index for f in take}
    bm2 = bm.copy()
    bmesh.ops.delete(bm, geom=take, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    bm2.faces.ensure_lookup_table()
    dead = [f for f in bm2.faces if f.index not in ids]
    bmesh.ops.delete(bm2, geom=dead, context="FACES")
    me = bpy.data.meshes.new(o.name + ".gap")
    bm2.to_mesh(me)
    bm2.free()
    return kit.obj(o.name + "." + kind, me, kind, o["grp"], smooth=False)


def gaps(car, made):
    """The walls of every panel gap darkened: the faces square to the skin that lie on a door's or a lid's
    outline — on the panel and on the body round it."""
    b = car.b
    outlines = []
    for d in b.door_list():
        poly = door_outline(b, d["s0"], d["s1"], d["bottom"], d.get("frame", True))
        outlines.append(([(b.x(s), z) for s, z in poly], d["side"]))

    def near_outline(c, side, tol=0.012):
        for poly, sd in outlines:
            if sd != side:
                continue
            for i in range(len(poly)):
                (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % len(poly)]
                dx, dz = x1 - x0, z1 - z0
                L2 = dx * dx + dz * dz or 1e-9
                t = max(0.0, min(1.0, ((c.x - x0) * dx + (c.z - z0) * dz) / L2))
                if math.hypot(c.x - (x0 + dx * t), c.z - (z0 + dz * t)) < tol:
                    return True
        return False

    def door_gap(f):
        c = f.calc_center_median()
        side = 1 if c.y > 0 else -1
        return abs(f.normal.y) < 0.35 and abs(c.y) > 0.5 and near_outline(c, side) and not b.on_skin(c, f.normal)

    lids = {}
    if b.hood:
        lids["bonnet"] = (b.W / 2 - 0.075, b.x(b.hood["s1"]), None, 1)
    k = b.boot
    if k["kind"] == "deck":
        lids["boot"] = (b.lid_hw(), b.x(k["s0"]), k["z_low"], -1)
    elif k["kind"] in ("tailgate", "side", "drop"):
        lids["boot"] = (b.lid_hw(), b.x(k.get("hinge_s", b.L)), k["z_low"], -1)
    elif k["kind"] == "twin":
        lids["boot_l"] = lids["boot_r"] = (b.lid_hw(), b.x(k.get("hinge_s", b.L)), k["z_low"], -1)

    def lid_gap(f, hw, x_edge, z_low, sgn):
        c, n = f.calc_center_median(), f.normal
        if b.on_skin(c, n):
            return False
        # (a side wall only within the lid's own run along the car: ahead of the bonnet's back edge, behind
        # the boot's front one)
        inside = (c.x - x_edge) * sgn > -0.02
        if inside and abs(abs(c.y) - hw) < 0.012 and abs(n.y) > 0.7 and (z_low is None or c.z > z_low - 0.005):
            return True
        if abs(c.x - x_edge) < 0.012 and abs(n.x) > 0.7:
            return True
        return z_low is not None and abs(c.z - z_low) < 0.012 and abs(n.z) > 0.7

    out = []
    for grp, obs in made.items():
        for o in list(obs):
            if o["kind"] != "paint":
                continue
            if grp.startswith("door_") or grp == "body":
                n = _split(o, door_gap, "gap")
            elif grp in lids:
                hw, xe, zl, sg = lids[grp]
                n = _split(o, lambda f, hw=hw, xe=xe, zl=zl, sg=sg: lid_gap(f, hw, xe, zl, sg), "gap")
            else:
                n = None
            if n is not None:
                out.append(n)
    if "body" in made:
        for o in list(made["body"]):
            if o["kind"] != "paint":
                continue
            for grp, (hw, xe, zl, sg) in lids.items():
                n = _split(o, lambda f, hw=hw, xe=xe, zl=zl, sg=sg: lid_gap(f, hw + 0.005, xe, zl, sg), "gap")
                if n is not None:
                    out.append(n)
    return out


# ── outside ────────────────────────────────────────────────────────────────────────────────────────────────


def helix(name, base, r, h, turns, wire, kind, grp="body", n=10, per_turn=12):
    pts = []
    steps = int(turns * per_turn)
    for i in range(steps + 1):
        a = 2 * math.pi * turns * i / steps
        pts.append(Vector(base) + Vector((math.cos(a) * r, math.sin(a) * r, h * i / steps)))
    return kit.tube(name, pts, wire, kind, grp, n=n)


def outside(car, skin, near):
    b, v = car.b, car.v
    obs = []
    trimk = "chrome" if v.get("chrome") else "trim"
    # the door seals round each opening (seen with the door open)
    for d in b.door_list():
        side = d["side"]
        poly = kit.offset_poly(door_outline(b, d["s0"], d["s1"], d["bottom"], d.get("frame", True)), -0.014)
        pts = []
        for s, z in poly:
            y = (b.gh_hw(z) if z > b.belt else b.hw(s)) - 0.03
            pts.append(Vector((b.x(s), side * y, z)))
        if near:
            obs.append(parts.outline_tube(f"seal.{d['grp']}", pts, 0.009, "rubber", "body", n=6))
        # the handle's recess behind it, the keyhole (front doors)
        hs = d["s1"] - 0.14
        loc, nrm = skin.side(b.x(hs), b.belt - 0.06, side)
        if loc is not None:
            obs.append(kit.box(f"recess.{d['grp']}", loc - nrm * 0.002 - Vector((0, 0, 0.004)), (0.105, 0.006, 0.03), "gap", d["grp"], r=0.01 if near else 0.0))
            if d["grp"].startswith("door_f") and near:
                obs.append(kit.cyl(f"key.{d['grp']}", loc + nrm * 0.004 + Vector((0.085, 0, 0)), 0.008, 0.008, "chrome", d["grp"], axis="y", n=12))
                obs.append(kit.box(f"keyslot.{d['grp']}", loc + nrm * 0.008 + Vector((0.085, 0, 0)), (0.0015, 0.002, 0.008), "gap", d["grp"]))
        # (quality pass 2) the B-pillar's black: the door frames' uprights between the windows
        if near and d.get("frame", True) and d.get("window", True):
            ends = []
            if any(e["side"] == side and abs(e["s0"] - d["s1"]) < 0.02 for e in b.door_list()) or d["grp"].startswith("door_f"):
                ends.append((d["s1"] - 0.047, d["s1"] - 0.004))
            if d["grp"].startswith("door_r"):
                ends.append((d["s0"] + 0.004, d["s0"] + 0.047))
            for s0_, s1_ in ends:
                top = lambda x, s0_=s0_: (b.belt + 0.012, (eroded_top(b, b.ahead - x, 0.065, 0.028) or b.belt + 0.3) - 0.008)
                obs.append(parts.side_patch(f"bpillar.{d['grp']}{s0_:.2f}", skin, b.x(s1_), b.x(s0_), 0, 0, side, "gloss", d["grp"], nx=3, nz=8, out=0.0016, depth=0.001, zfun=top))
    if b.hood and near:
        # the washer jets on the bonnet's back edge
        s = b.hood["s1"] - 0.08
        for y in (0.3, -0.3):
            loc, nrm = skin.top(b.x(s), y)
            if loc is not None:
                obs.append(kit.box(f"jet{y}", loc + Vector((0, 0, 0.008)), (0.025, 0.014, 0.014), "trim", "bonnet", r=0.006))
    # the fuel flap: a rounded square, its gap round it, the push latch
    loc, nrm = skin.side(b.x(min(b.L, b.axle_r + 0.6) - 0.85), b.belt - 0.12, -1)
    if loc is not None:
        obs.append(kit.box("flap.gap", loc - nrm * 0.001, (0.13, 0.004, 0.13), "gap", r=0.025))
        obs.append(kit.box("flap", loc + nrm * 0.0015, (0.12, 0.004, 0.12), "paint", "fuel_flap", r=0.022))
        car.pivot("fuel_flap", tuple(loc + Vector((0.06, 0, 0))), (0, 0, 1))
    # the exhaust's rubber hanger and its bracket
    if not v.get("flatbed"):
        ex = Vector(car.points["exhaust_0"])
        h = ex + Vector((0.4, 0.0, 0.0))
        obs.append(kit.tube("hanger", [h + Vector((0, 0, 0.03)), h + Vector((0, 0, 0.1))], 0.012, "rubber", n=8))
        obs.append(kit.box("hanger.br", h + Vector((0, 0, 0.12)), (0.05, 0.04, 0.012), "under"))
        obs.append(kit.cyl("silencer", (ex.x + 0.75, ex.y, ex.z + 0.02), 0.08, 0.5, "steel", axis="x", n=16))
    # (quality pass 2) the underside from a low camera: the exhaust's front pipe and middle box, the tank, the
    # rear axle and its differential, the propshaft, the front crossmember
    zb_mid = b.zb(b.L * 0.5)
    if not v.get("flatbed"):
        ex = Vector(car.points["exhaust_0"])
        s_f = (b.hood["s1"] - 0.25) if b.hood else b.axle_f + 0.4
        s_m = (b.axle_f + b.axle_r) / 2
        pipe = [(b.x(s_f), -0.22, zb_mid + 0.12), (b.x(s_f + 0.35), -0.25, zb_mid - 0.025), (b.x(s_m - 0.3), -0.27, zb_mid - 0.03), (b.x(s_m + 0.3), -0.3, zb_mid - 0.03), (b.x(b.L - 0.9), -0.4, b.zb(b.L - 0.9) - 0.02)]
        obs.append(kit.tube("downpipe", pipe, 0.022, "steel", n=8 if near else 5))
        obs.append(kit.cyl("midbox", (b.x(s_m), -0.285, zb_mid - 0.035), 0.055, 0.4, "steel", axis="x", n=12 if near else 6))
    if b.kind not in ("shuttle",):
        st = b.axle_r + 0.3 if b.L - b.axle_r > 0.75 else b.axle_r - 0.45
        obs.append(kit.box("tank", (b.x(st), 0.12, b.zb(st) - 0.05), (0.42, 0.72, 0.14), "under", r=0.025 if near else 0.0))
        axle = [(b.x(b.axle_r), side * (b.track - 0.12), b.wheel_r) for side in (1, -1)]
        obs.append(kit.tube("axle", axle, 0.035, "cast", n=10 if near else 6))
        obs.append(kit.cyl("diff", (b.x(b.axle_r) + 0.03, 0.0, b.wheel_r), 0.11, 0.2, "cast", axis="x", n=16 if near else 8))
        if b.hood:
            prop = [(b.x(b.hood["s1"] + 0.35), 0.0, zb_mid + 0.06), (b.x(b.axle_r) + 0.15, 0.0, b.wheel_r)]
            obs.append(kit.tube("prop", prop, 0.03, "steel", n=8 if near else 5))
            obs.append(kit.box("xmember", (b.x(b.axle_f) - 0.05, 0.0, b.wheel_r - 0.02), (0.12, b.track * 2 - 0.3, 0.07), "under", r=0.012 if near else 0.0))
            obs.append(kit.box("sump", (b.x(b.axle_f) + 0.25, 0.04, b.zb(b.axle_f) - 0.01), (0.4, 0.3, 0.1), "cast", r=0.02 if near else 0.0))
    # the suspension in each arch: a coil spring round a damper, the lower arm
    for s_ax in (b.axle_f, b.axle_r):
        for side in (1, -1):
            y = side * (b.track - 0.2)
            base = Vector((b.x(s_ax) + 0.08, y, b.wheel_r + 0.06))
            if near:
                # (quality pass 2: lighter — 8 points a turn, a 6-sided wire: a fifth of the triangles, seen in the arch)
                obs.append(helix(f"spring{s_ax}{side}", base, 0.055, 0.26, 5.0, 0.009, "steel_paint", n=5, per_turn=8))
            obs.append(kit.cyl(f"damper{s_ax}{side}", tuple(base + Vector((0, 0, 0.14))), 0.022, 0.34, "steel", axis="z", n=10))
            obs.append(kit.tube(f"arm{s_ax}{side}", [(b.x(s_ax), side * (b.track - 0.08), b.wheel_r - 0.04), (b.x(s_ax) + 0.05, side * 0.3, b.wheel_r - 0.02)], 0.02, "under", n=8))
    # the wipers' springs (on each arm, by its pivot)
    for tag in ("l", "r"):
        d = car.pivots.get(f"wiper_{tag}")
        if d and near:
            p = Vector(d["at"])
            obs.append(kit.cyl(f"wspring{tag}", tuple(p + Vector((0.0, 0.05, 0.012))), 0.006, 0.04, "steel", f"wiper_{tag}", axis="y", n=8))
    return obs


# ── inside ─────────────────────────────────────────────────────────────────────────────────────────────────


def inside(car, near):
    b, v = car.b, car.v
    if not near:
        return []
    obs = []
    s_fw = b.gh[0][0] + 0.02
    belt = b.belt
    # the switch panel left of the column: eight caps, each its legend (the atlas's cell)
    for i in range(8):
        y = 0.69 - i * 0.032 if i < 4 else 0.2 - (i - 4) * 0.032
        c = (b.x(s_fw + 0.418), y, belt - 0.11)
        cap = kit.plate(f"switch{i}", c, 0.026, 0.026, "switch", normal="-x", t=0.008)
        uv = cap.data.uv_layers[0]
        for li, (u0, v0) in zip(cap.data.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
            uv.data[li].uv = ((i + u0) / 8.0, v0)
        obs.append(cap)
    obs.append(kit.box("switch.bezel.l", (b.x(s_fw + 0.42), 0.64, belt - 0.11), (0.006, 0.14, 0.04), "trim", r=0.004))
    obs.append(kit.box("switch.bezel.r", (b.x(s_fw + 0.42), 0.15, belt - 0.11), (0.006, 0.14, 0.04), "trim", r=0.004))
    # the door cards' speakers
    for d in b.door_list():
        side = d["side"]
        y = side * (b.hw((d["s0"] + d["s1"]) / 2) - 0.07)
        c = (b.x(d["s0"] + 0.22), y, d["bottom"] + 0.2)
        obs.append(kit.cyl(f"spk.{d['grp']}", c, 0.065, 0.012, "grille_mesh", d["grp"], axis="y", n=24))
        obs.append(kit.cyl(f"spkr.{d['grp']}", c, 0.072, 0.008, "trim", d["grp"], axis="y", n=24))
    # the seat belts: webbing from the B-pillar's top to the seat's outer side, the buckle on the tunnel side
    for side in (1, -1):
        hip = Vector(car.points["seat_0" if side > 0 else "seat_1"])
        top = Vector((hip.x - 0.12, side * (b.gh_hw(belt + 0.45) - 0.05), belt + 0.42))
        low = Vector((hip.x - 0.05, side * (b.HB - 0.12), hip.z + 0.02))
        web = kit.tube(f"belt{side}", [top, top + (low - top) * 0.5 + Vector((0, -side * 0.01, 0)), low], 0.012, "webbing", n=4)
        kit.scale(web, (1.0, 0.35, 1.0), tuple((top + low) / 2))
        obs.append(web)
        obs.append(kit.box(f"belt.anchor{side}", top, (0.03, 0.02, 0.05), "trim", r=0.006))
        obs.append(kit.box(f"buckle{side}", (hip.x + 0.02, side * 0.18, hip.z + 0.04), (0.05, 0.025, 0.03), "chrome", r=0.006))
    return obs


# ── the liveries ───────────────────────────────────────────────────────────────────────────────────────────


def _uv_patch(o, cols, rows, u0, u1, v0=0.0, v1=1.0):
    """A ray patch's UVs (parts.patch: rows × cols front then back): its front face across u0..u1, v0..v1."""
    me = o.data
    uv = me.uv_layers.new(name="UVMap")
    N = rows * cols
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index % N
            r, c = divmod(vi, cols)
            uv.data[li].uv = (u0 + (u1 - u0) * c / (cols - 1), v0 + (v1 - v0) * r / (rows - 1))


def liveries(car, skin):
    """The police's white doors with POLÍCIA on the front ones; the taxi's chequer band down the side."""
    b = car.b
    obs = []
    for d in b.door_list():
        side = d["side"]
        grp = d["grp"]
        x0, x1 = b.x(d["s1"]) + 0.01, b.x(d["s0"]) - 0.01
        z0, z1 = d["bottom"] + 0.04, b.belt - 0.02
        cols, rows = (10, 5) if parts.NEAR else (5, 3)
        p = parts.side_patch(f"pol.{grp}", skin, x0, x1, z0, z1, side, "livery_police", f"livery_police_{grp}", nx=cols, nz=rows, out=0.0015, depth=0.0005)
        front = grp.startswith("door_f")
        # (the text reads forward on each side: the right side's u runs the other way)
        u0, u1 = (0.06, 0.98) if front else (0.0, 0.05)
        # (the rays run rear → front; seen from the left the front is to the left: the text runs the other way)
        if side > 0:
            u0, u1 = u1, u0
        _uv_patch(p, cols, rows, u0, u1, 0.0, 1.0)
        obs.append(p)
        car.pivot(f"livery_police_{grp}", car.pivots[grp]["at"], (0, 0, 1), parent=grp)
        # the taxi's band: under the belt, along the door
        tz0, tz1 = b.belt - 0.2, b.belt - 0.11
        t = parts.side_patch(f"taxi.{grp}", skin, x0, x1, tz0, tz1, side, "livery_taxi", f"livery_taxi_{grp}", nx=cols, nz=3 if parts.NEAR else 2, out=0.0016, depth=0.0005)
        L = abs(x1 - x0)
        uu = (L / 1.6, 0.0) if side > 0 else (0.0, L / 1.6)
        _uv_patch(t, cols, 3 if parts.NEAR else 2, uu[0], uu[1], 0.0, 0.5 if not front else 1.0)
        obs.append(t)
        car.pivot(f"livery_taxi_{grp}", car.pivots[grp]["at"], (0, 0, 1), parent=grp)
    return obs


# ── quality pass 2: the arches' rolled lips ─────────────────────────────────────────────────────────────────


def _ring_sweep(name, frames, prof, kind, grp):
    """A closed profile (radial, normal) swept along frames [(base, er, en)…] (an arch's lip)."""
    k = len(prof)
    verts, faces = [], []
    for base, er, en in frames:
        for dr, dn in prof:
            verts.append(base + er * dr + en * dn)
    m = len(frames)
    for i in range(m - 1):
        for j in range(k):
            a, c = i * k + j, i * k + (j + 1) % k
            faces.append((a, c, c + k, a + k))
    faces.append(tuple(range(k)))
    faces.append(tuple(range((m - 1) * k + k - 1, (m - 1) * k - 1, -1)))
    o = kit.mk(name, verts, faces, kind, grp, smooth=True, angle=60)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def arch_lips(car, skin, near):
    """Each wheel arch's edge rolled under (a lip in the paint over the cut, turning in to the liner): no more
    plain holes. On a door's corner, the door's own; under a two-tone's line, the second colour."""
    b, v = car.b, car.v
    obs = []
    doors = b.door_list()
    flare = v.get("flares")
    if flare:
        # (the hot hatch's, the expedition's: a flare standing out round the arch, its face flat, its edge
        # rolled, its foot blended into the skin)
        o_ = 0.045
        prof = [(0.075, -0.003), (0.06, 0.012), (0.035, o_ - 0.006), (0.012, o_), (-0.004, o_ - 0.008), (-0.008, o_ - 0.03), (-0.004, -0.02), (0.02, -0.012)]
        if not near:
            prof = [(0.075, -0.003), (0.03, o_), (-0.008, o_ - 0.02), (0.02, -0.012)]
    elif near:
        prof = [(0.03, -0.0015), (0.017, 0.0032), (0.006, 0.0042), (-0.003, -0.001), (-0.004, -0.016), (0.002, -0.026), (0.012, -0.012)]
    else:
        prof = [(0.03, -0.001), (0.004, 0.004), (-0.004, -0.016), (0.012, -0.012)]
    for i, (s_a, r) in enumerate(b.arches):
        c = Vector((b.x(s_a), 0.0, b.arch_z))
        zlo = b.zb(s_a) + 0.025
        a_lo = math.asin(max(-0.95, min(0.0, (zlo - b.arch_z) / r)))
        N = 30 if near else 10
        for side in (1, -1):
            runs, cur, cur_key = [], [], None
            for k in range(N + 1):
                a = a_lo + (math.pi - 2 * a_lo) * k / N
                er = Vector((math.cos(a), 0.0, math.sin(a)))
                p = c + er * r
                loc, n = skin.side(p.x + er.x * 0.022, p.z + er.z * 0.022, side)
                key = None
                if loc is not None and abs(loc.y) > b.hw(s_a) - 0.12:
                    s = b.ahead - p.x
                    grp = "body"
                    edge = False
                    for d in doors:
                        if d["side"] != side or p.z < d["bottom"] - 0.01:
                            continue
                        if d["s0"] - 0.006 < s < d["s0"] + 0.006 or d["s1"] - 0.006 < s < d["s1"] + 0.006:
                            edge = True
                        elif d["s0"] < s < d["s1"]:
                            grp = d["grp"]
                    kind = "paint2" if v.get("two_tone") and p.z < b.moulding_z + 0.02 else "paint"
                    if flare and v.get("flare_kind") == "trim":
                        kind = "trim"
                    if not edge:
                        key = (grp, kind)
                        en = Vector((0.0, side * 1.0, 0.0))
                        nn = (n - er * n.dot(er))
                        if nn.length > 1e-3 and nn.normalized().dot(en) > 0.5:
                            en = nn.normalized()
                        frame = (Vector((p.x, loc.y, p.z)), er, en)
                if key != cur_key and cur:
                    runs.append((cur_key, cur))
                    cur = []
                cur_key = key
                if key is not None:
                    cur.append(frame)
            if cur:
                runs.append((cur_key, cur))
            for j, (key, frames) in enumerate(runs):
                if key is None or len(frames) < 2:
                    continue
                obs.append(_ring_sweep(f"lip{i}{side}{j}", frames, prof, key[1], key[0]))
    return obs

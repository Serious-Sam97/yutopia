# Plan 101 — the drivetrain: cranks and chainrings (teeth, spider, bolts), the pedals (quill + toe clips, bear
# trap, block with reflectors, BMX platform), the chain (links and rollers along its real line, ring → cog →
# derailleur's pulleys), the rear and front derailleurs, the shifters (down tube, thumb, trigger).
import math

from mathutils import Matrix, Vector

import bkit as bk
import kit

PITCH = 0.0127


def pitch_r(T):
    return PITCH / (2 * math.sin(math.pi / T))


# ── the crankset (group "crank": everything that turns with the cranks) ─────────────────────────────────────


def crankset(bb, d, grp="crank"):
    """Both arms (the right forward along +x, the left back), the chainrings on the right (−y), the spider and
    the bolts, the dust caps. d: rings [T…], ring_y [y…], arm (length), q (the arm's face at the eye, |y|),
    style (road | mtb | town | bmx), bcd (the bolt circle's radius)."""
    bb = Vector(bb)
    obs = []
    L = d.get("arm", 0.17)
    q = d.get("q", 0.072)
    style = d.get("style", "road")
    kind = {"road": "alloy", "mtb": "alloy", "town": "chrome", "bmx": "chrome"}[style]
    per = 3 if bk.near() else 2
    # the rings
    rings = d["rings"]
    bcd = d.get("bcd", 0.065)
    ys = d["ring_y"]
    for i, (T, y) in enumerate(zip(rings, ys)):
        rp = pitch_r(T)
        out = bk.teeth(T, rp, 0.0068, per=per if i == 0 else 2) if bk.near() else bk.circle2(rp + 0.002, 28)
        n = len(out)
        if T < 32 and len(rings) == 3:
            r_in = 0.032  # (the granny on its own little circle)
            bolts = [2 * math.pi * k / 5 + math.pi / 2 for k in range(5)]
        else:
            r_in = rp - 0.017 if style != "town" else rp - 0.02
            bolts = [2 * math.pi * k / 5 + math.pi / 2 for k in range(5)]
        tab = bcd + 0.0
        inn = []
        for (x, z) in out:
            a = math.atan2(z, x)
            bump = max(max(0.0, math.cos((a - b) * 5.0)) ** 6 for b in bolts) if (T >= 32 or len(rings) < 3) and style != "town" else 0.0
            r = r_in - (r_in - (tab - 0.007)) * bump
            inn.append((r * math.cos(a), r * math.sin(a)))
        if style == "town":
            # a steel ring of a piece with its spokes: five pierced windows left as solid web (pressed steel)
            inn = bk.circle2(0.03, n)
        th = 0.0028 if style not in ("bmx", "town") else 0.0034
        o = bk.ring_prism("ring", out, inn, y - th / 2, y + th / 2, "alloy" if style != "town" else "chrome", grp, walls=(True, True))
        o.data.transform(Matrix.Translation(bb))
        obs.append(o)
        if bk.near() and style != "town" and not (T < 32 and len(rings) == 3):
            for b in bolts:
                p = bb + Vector((bcd * math.cos(b), 0, bcd * math.sin(b)))
                obs.append(bk.tube_y("ringbolt", [(0.0, y - 0.0035), (0.0048, y - 0.0035), (0.0048, y + 0.0035), (0.0, y + 0.0035)], p, 6, "steel", grp))
    # the spider (five arms from the right arm's boss to the bolt circle)
    if style in ("road", "mtb"):
        yo = max(ys) + 0.002  # (inboard face)
        yi = min(ys) - 0.003
        for k in range(5):
            b = 2 * math.pi * k / 5 + math.pi / 2
            R = Vector((math.cos(b), 0, math.sin(b)))
            T = Vector((-math.sin(b), 0, math.cos(b)))
            pts = [bb + R * 0.02, bb + R * (bcd - 0.004), bb + R * (bcd + 0.002)]
            obs.append(bk.sweep("spider", pts, [(0.0045, 0.009), (0.0035, 0.0055), (0.003, 0.005)], kind, grp, n=8, up=(0, 1, 0)))
    elif style == "bmx":
        # a single-ring BMX spider: a star of four
        y = ys[0] + 0.003
        for k in range(5):
            b = 2 * math.pi * k / 5 + math.pi / 2
            R = Vector((math.cos(b), 0, math.sin(b)))
            pts = [bb + R * 0.02 + Vector((0, y - ys[0], 0)), bb + R * (bcd + 0.002) + Vector((0, y - ys[0], 0))]
            obs.append(bk.sweep("spider", pts, [(0.004, 0.007), (0.003, 0.005)], kind, grp, n=8, up=(0, 1, 0)))
    # the arms
    for side in (-1, 1):
        sgn_x = 1 if side == -1 else -1  # the right arm forward, the left back
        y_eye = side * q
        y_root = side * (q - 0.012)
        p0 = bb + Vector((0, y_root, 0))
        p1 = bb + Vector((sgn_x * L, y_eye, 0))
        if style == "bmx":
            # a tubular chromoly arm
            obs.append(bk.sweep("arm", [p0 + Vector((sgn_x * 0.012, 0, 0)), p1 - Vector((sgn_x * 0.012, 0, 0))], [(0.0085, 0.0105), (0.0085, 0.0105)], kind, grp, n=10, up=(0, 0, 1)))
            obs.append(bk.cyl_ax("boss", p0, (0, 1, 0), 0.016, 0.018, kind, grp, n=18))
            obs.append(bk.cyl_ax("eye", p1, (0, 1, 0), 0.0125, 0.016, kind, grp, n=14))
        elif style == "town":
            # a cottered steel arm: its cotter pin through the boss, its nut
            obs.append(bk.sweep("arm", [p0 + Vector((sgn_x * 0.01, 0, 0)), p1 - Vector((sgn_x * 0.008, 0, 0))], [(0.0055, 0.011), (0.0045, 0.0085)], kind, grp, n=10, up=(0, 0, 1)))
            obs.append(bk.cyl_ax("boss", p0, (0, 1, 0), 0.0175, 0.02, kind, grp, n=18))
            obs.append(bk.cyl_ax("eye", p1, (0, 1, 0), 0.011, 0.012, kind, grp, n=14))
            if bk.near():
                cp = p0 + Vector((0, 0, 0.0))
                obs.append(bk.rod("cotter", cp + Vector((-0.004 * sgn_x, side * 0.002, -0.022)), cp + Vector((0.004 * sgn_x, side * 0.002, 0.024)), 0.0045, "steel", grp, n=8))
                obs.append(bk.cyl_ax("cotter_nut", cp + Vector((0.004 * sgn_x, side * 0.002, 0.026)), (0, 0, 1), 0.006, 0.006, "steel", grp, n=6))
        else:
            # a forged alloy arm: its section a rounded rectangle narrowing to the eye, a fillet into the bosses
            mid = p0.lerp(p1, 0.5)
            obs.append(bk.sweep("arm", [p0 + Vector((sgn_x * 0.012, 0, 0)), mid, p1 - Vector((sgn_x * 0.006, 0, 0))], [(0.0065, 0.0125), (0.0058, 0.0105), (0.0052, 0.0095)], kind, grp, n=14, up=(0, 0, 1)))
            obs.append(bk.tube_y("boss", [(0.0, -0.009), (0.019, -0.009), (0.0205, -0.004), (0.0205, 0.004), (0.019, 0.009), (0.0, 0.009)], p0, 16, kind, grp))
            obs.append(bk.tube_y("eye", [(0.0, -0.0065), (0.0115, -0.0065), (0.0125, 0.0), (0.0115, 0.0065), (0.0, 0.0065)], p1, 16, kind, grp))
        # the dust cap (and its crank bolt's cap)
        if bk.near() or bk.LOD == "mid":
            yc = side * (q - 0.012 + (0.0095 if style not in ("bmx", "town") else 0.011))
            obs.append(bk.tube_y("dustcap", [(0.0, yc), (0.0125, yc), (0.0125, yc + side * 0.0015), (0.011, yc + side * 0.0025), (0.0, yc + side * 0.0025)][:: (1 if side > 0 else -1)], bb, 18, "alloy" if style != "town" else "chrome", grp))
    return obs


# ── pedals: each built about its own origin (the spindle's axis at the body's centre), level ─────────────────


def pedal(c, side, style, grp):
    """side: +1 left (+y), −1 right. The pedal's body centred on c, the spindle back to the crank."""
    c = Vector(c)
    obs = []
    s = side
    sp = Vector((0, s, 0))
    # the spindle from the crank's eye into the body
    obs.append(bk.rod("spindle", c - sp * 0.06, c - sp * 0.035, 0.0065, "steel", grp, n=10))
    if style == "quill":
        # a road quill pedal: the barrel, two cage plates (front with the quill's tongue), the toe clip and strap
        obs.append(bk.tube_y("barrel", [(0.0, -0.036), (0.0105, -0.036), (0.0115, -0.03), (0.0095, 0.0), (0.0095, 0.03), (0.007, 0.036), (0.0, 0.037)], c, 16, "alloy", grp) if s > 0 else bk.tube_y("barrel", [(0.0, -0.037), (0.007, -0.036), (0.0095, -0.03), (0.0095, 0.0), (0.0115, 0.03), (0.0105, 0.036), (0.0, 0.036)], c, 16, "alloy", grp))
        for fx in (1, -1):
            out = [(-0.006, -0.012), (0.006, -0.012), (0.009, 0.004), (0.004, 0.016 if fx > 0 else 0.008), (-0.004, 0.016 if fx > 0 else 0.008), (-0.009, 0.004)]
            # (the plate: across y, its outline in x-z — teeth along its top)
            pl = bk.plate_xz("cage", [(x * 0.6 + fx * 0.032, z) for x, z in out], -0.034, 0.034, "alloy", grp)
            kit.move(pl, c)
            obs.append(pl)
        if bk.near():
            # the toe clip: a chromed strip from the front plate curving up and back round the toe
            pts = bk.bez(c + Vector((0.035, 0, 0.012)), c + Vector((0.075, 0, 0.02)), c + Vector((0.085, 0, 0.065)), c + Vector((0.04, 0, 0.075)), 10)
            obs.append(bk.sweep("toeclip", pts, (0.0012, 0.006), "chrome", grp, n=8, up=(0, 1, 0)))
            # the strap: a leather loop through the cage, round the clip
            loop = []
            for i in range(17):
                a = 2 * math.pi * i / 16
                loop.append(c + Vector((0.0 + 0.045 * math.cos(a) * 0.6, 0.042 * math.sin(a), 0.032 + 0.045 * math.cos(a) * 0.75)))
            obs.append(bk.sweep("strap", loop[:-1], (0.0012, 0.008), "leather", grp, n=6, up=(1, 0, 0.6), closed=True))
            obs.append(bk.box("buckle", c + Vector((0.0, s * 0.043, 0.06)), (0.016, 0.003, 0.012), "chrome", grp))
    elif style == "trap":
        # a bear-trap pedal: the alloy barrel, two steel cage plates with teeth, side plates
        obs.append(bk.tube_y("barrel", [(0.0, -0.045), (0.011, -0.044), (0.0115, 0.0), (0.011, 0.044), (0.0, 0.045)], c, 14, "alloy", grp))
        for fx in (1, -1):
            n_t = 7
            out = [(-0.003, -0.012)]
            for k in range(n_t):
                y0 = -0.045 + 0.09 * k / n_t
                out += [(0.0, y0 + 0.002)]
            # the plate's outline in y-z: teeth on its top and bottom edges, across x
            prof = []
            for k in range(n_t + 1):
                y = -0.046 + 0.092 * k / n_t
                prof.append((y, 0.013 if k % 2 == 0 else 0.009))
            prof += [(0.046, -0.009)] + [(-0.046 + 0.092 * k / n_t, -0.013 if k % 2 == 0 else -0.009) for k in range(n_t, -1, -1)]
            pl = kit.xprism("trapplate", [(y, z) for y, z in prof], -0.0012, 0.0012, "steel", grp)
            kit.move(pl, c + Vector((fx * 0.04, 0, 0)))
            obs.append(pl)
        for fy in (1, -1):
            obs.append(bk.box("sideplate", c + Vector((0, fy * 0.046, 0)), (0.084, 0.003, 0.016), "alloy", grp))
        if style == "trap" and bk.near():
            pass
    elif style == "block":
        # a block pedal: a steel frame, two rubber blocks, the amber reflectors fore and aft
        obs.append(bk.tube_y("barrel", [(0.0, -0.05), (0.008, -0.05), (0.008, 0.05), (0.0, 0.05)], c, 10, "steel", grp))
        for fy in (1, -1):
            obs.append(bk.box("frameplate", c + Vector((0, fy * 0.051, 0)), (0.072, 0.003, 0.016), "chrome", grp, r=0.0015))
        for fx in (1, -1):
            obs.append(bk.box("block", c + Vector((fx * 0.022, 0, 0)), (0.026, 0.1, 0.022), "rubber", grp, r=0.003))
            if bk.near():
                for k in range(-3, 4):
                    obs.append(bk.box("rib", c + Vector((fx * 0.022, k * 0.013, 0.0115)), (0.024, 0.004, 0.002), "rubber", grp))
            obs.append(bk.box("refl", c + Vector((fx * 0.0365, 0, 0)), (0.004, 0.06, 0.014), "lens_amber", grp, r=0.0012))
            obs.append(bk.box("refl_back", c + Vector((fx * 0.0345, 0, 0)), (0.002, 0.064, 0.017), "trim", grp))
    elif style == "bmx":
        # a BMX platform: a wide alloy body with pins round its edge
        out = []
        for i in range(16):
            a = 2 * math.pi * i / 16
            out.append((0.048 * math.cos(a) * (1 if abs(math.cos(a)) < 0.9 else 0.95), 0.008 * math.sin(a)))
        obs.append(bk.box("platform", c, (0.09, 0.1, 0.014), "alloy_dark", grp, r=0.004))
        obs.append(bk.tube_y("barrel", [(0.0, -0.052), (0.012, -0.052), (0.012, 0.052), (0.0, 0.052)], c, 14, "alloy_dark", grp))
        if bk.near():
            for fx in (1, -1):
                for k in range(-2, 3):
                    for fz in (1, -1):
                        obs.append(bk.rod("pin", c + Vector((fx * 0.04, k * 0.02, fz * 0.006)), c + Vector((fx * 0.04, k * 0.02, fz * 0.0115)), 0.0016, "steel", grp, n=6))
    # (the reflectors on the bear traps and the quill pedals' backs: none — period race pedals bare)
    return obs


# ── the chain ─────────────────────────────────────────────────────────────────────────────────────────────────


def chain(circles, y_of_x, grp="frame"):
    """The chain round its circles (bk.belt), y by x (the chain line); near: links and rollers; else a band."""
    path = [Vector((x, 0, z)) for x, z in bk.belt(circles, 40)]
    path.append(path[0])
    L = bk.length(path)
    N = int(round(L / PITCH))
    N += N % 2
    pins = bk.along(path, [L * i / N for i in range(N)])
    for p in pins:
        p.y = y_of_x(p.x)
    if not bk.near():
        # a band: two thin strips (each side's plates) along the line
        obs = []
        for s in (1, -1):
            pts = [p + Vector((0, s * 0.0042, 0)) for p in pins]
            verts, faces = [], []
            m = len(pts)
            for i, p in enumerate(pts):
                t = (pts[(i + 1) % m] - pts[i - 1]).normalized()
                nrm = t.cross(Vector((0, 1, 0))).normalized()
                verts.append(p + nrm * 0.0042)
                verts.append(p - nrm * 0.0042)
            for i in range(m):
                j = (i + 1) % m
                faces.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
            if bk.LOD == "mid" or s == 1:
                obs.append(bk.mk("chainband", verts, faces, "chain", grp, smooth=False))
        return obs, len(pins)
    v, f = [], []
    rv, rf = [], []

    def plate(a, b, yc, th, h, ext):
        t = (b - a)
        ln = t.length
        t.normalize()
        Y = Vector((0, 1, 0))
        Z = t.cross(Y).normalized()
        mid = (a + b) / 2
        mid.y = yc
        e = ln / 2
        out = [(-e - ext * 0.6, h * 0.32), (e + ext * 0.6, h * 0.32), (e + ext * 0.6, -h * 0.32), (-e - ext * 0.6, -h * 0.32)]
        v0 = len(v)
        for dy in (-th / 2, th / 2):
            for u, w in out:
                v.append(mid + t * u + Z * w + Y * dy)
        n = 4
        f.append(tuple(v0 + i for i in range(n))[::-1])
        f.append(tuple(v0 + n + i for i in range(n)))
        for i in range(n):
            j = (i + 1) % n
            f.append((v0 + i, v0 + j, v0 + n + j, v0 + n + i))

    for i in range(N):
        a, b = pins[i], pins[(i + 1) % N]
        yc = (a.y + b.y) / 2
        outer = i % 2 == 0
        off = 0.0049 if outer else 0.0037
        for s in (1, -1):
            plate(a, b, yc + s * off, 0.0009, 0.0092 if outer else 0.0098, 0.0036)
        # the roller at a
        v0 = len(rv)
        t = (b - a).normalized()
        Z = t.cross(Vector((0, 1, 0))).normalized()
        for dy in (-0.0033, 0.0033):
            for k in range(5):
                an = 2 * math.pi * k / 5
                rv.append(a + Vector((0, dy, 0)) + (t * math.cos(an) + Z * math.sin(an)) * 0.0039)
        for k in range(5):
            kk = (k + 1) % 5
            rf.append((v0 + k, v0 + kk, v0 + 5 + kk, v0 + 5 + k))
    o = bk.mk("chainplates", v, f, "chain", grp, smooth=False)
    r = bk.mk("chainrollers", rv, rf, "chain", grp, smooth=True)
    bk._fix_normals(o)
    bk._fix_normals(r)
    return [o, r], N


# ── derailleurs ───────────────────────────────────────────────────────────────────────────────────────────────


def jockey(c, y, grp, kind="trim"):
    out = bk.teeth(11, pitch_r(11), 0.006, per=3) if bk.near() else bk.circle2(pitch_r(11) + 0.002, 10)
    inn = bk.circle2(0.009, len(out))
    o = bk.ring_prism("jockey", out, inn, y - 0.0012, y + 0.0012, kind, grp)
    kit.move(o, c)
    return [o, bk.tube_y("jockey_hub", [(0.0, y - 0.004), (0.009, y - 0.004), (0.009, y + 0.004), (0.0, y + 0.004)], c, 14, "alloy", grp)]


def rear_derailleur(hub, ol, up_j, lo_j, y, grp="frame", long_cage=False):
    """A parallelogram rear derailleur: hung on the dropout's hanger, its body down and back to the cage's
    pivot, the cage's plates round the two jockey wheels (up_j, lo_j: their centres in x, z; y the chain's)."""
    hub = Vector(hub)
    obs = []
    yo = -ol / 2 - 0.007  # (outside the right dropout)
    b_piv = Vector((hub.x - 0.006, yo, hub.z - 0.024))
    obs.append(bk.cyl_ax("rd_bolt", b_piv, (0, 1, 0), 0.0085, 0.014, "alloy", grp, n=16))
    # the B-knuckle and the parallelogram's two plates, out and down to the P-knuckle
    p_piv = Vector((up_j[0] - 0.004, y - 0.022, up_j[1] + 0.012))
    k1 = b_piv + Vector((-0.012, -0.006, -0.012))
    obs.append(bk.sweep("rd_knuckle", [b_piv + Vector((0, -0.006, 0)), k1], [(0.009, 0.011), (0.009, 0.011)], "alloy", grp, n=10))
    for dz in (0.006, -0.006):
        a = k1 + Vector((0.0, 0.0, dz))
        b = p_piv + Vector((0.0, 0, dz + 0.008))
        obs.append(bk.sweep("rd_link", [a, b], [(0.0035, 0.0075), (0.0035, 0.0075)], "alloy", grp, n=8, up=(0, 0, 1)))
    obs.append(bk.box("rd_pknuckle", p_piv + Vector((0, 0, 0.006)), (0.022, 0.016, 0.026), "alloy", grp, r=0.005))
    # the cable's anchor and its barrel adjuster
    obs.append(bk.cyl_ax("rd_barrel", k1 + Vector((0.004, -0.004, 0.016)), (1, 0, 0.3), 0.004, 0.012, "alloy", grp, n=10))
    # the cage: outer and inner plates round both jockeys
    u, l = Vector((up_j[0], 0, up_j[1])), Vector((lo_j[0], 0, lo_j[1]))
    for py, r_ in ((y - 0.0065, 0.015), (y + 0.0065, 0.013)):
        out = []
        n = 20
        dirv = (l - u).normalized()
        perp = Vector((dirv.z, 0, -dirv.x))
        for i in range(n):
            a = math.pi * i / (n - 1)
            pv = u + (-dirv * math.sin(a) + perp * math.cos(a)) * r_
            out.append((pv.x, pv.z))
        for i in range(n):
            a = math.pi * i / (n - 1)
            pv = l + (dirv * math.sin(a) - perp * math.cos(a)) * r_
            out.append((pv.x, pv.z))
        pl = bk.plate_xz("rd_cage", out, py - 0.001, py + 0.001, "alloy", grp)
        obs.append(pl)
    obs += jockey(Vector((up_j[0], 0, up_j[1])), y, grp)
    obs += jockey(Vector((lo_j[0], 0, lo_j[1])), y, grp)
    obs.append(bk.rod("rd_cagebolt", Vector((up_j[0], y - 0.009, up_j[1])), Vector((up_j[0], y + 0.008, up_j[1])), 0.0035, "steel", grp, n=6))
    obs.append(bk.rod("rd_cagebolt", Vector((lo_j[0], y - 0.009, lo_j[1])), Vector((lo_j[0], y + 0.008, lo_j[1])), 0.0035, "steel", grp, n=6))
    return obs, k1 + Vector((0.004, -0.004, 0.022))


def front_derailleur(bb, st_dir, ring_r, y_out, y_in, grp="frame", st_r=0.0143):
    """A front derailleur: its band clamped round the seat tube just above the big ring, its cage over it."""
    bb = Vector(bb)
    d = Vector(st_dir).normalized()
    obs = []
    zc = ring_r + 0.004
    # where on the seat tube: the point whose distance from the BB puts the cage's bottom 2 mm over the teeth
    t = (ring_r + 0.03)
    c = bb + d * t
    obs.append(bk.sweep("fd_band", [c - d * 0.009, c + d * 0.009], st_r + 0.0025, "alloy", grp, n=16))
    obs.append(bk.box("fd_body", c + Vector((0.004, (y_out + y_in) / 2 - 0.006, 0.0)) + Vector((0.012, 0, -0.004)), (0.02, 0.018, 0.016), "alloy", grp, r=0.003))
    # the cage: two plates following the ring's arc behind and above it
    for py, h in ((y_out - 0.0045, 0.018), (y_in + 0.0045, 0.013)):
        out, inn = [], []
        a0, a1 = math.radians(84), math.radians(122)
        n = 12
        for i in range(n):
            a = a0 + (a1 - a0) * i / (n - 1)
            out.append(((zc + h) * math.cos(a), (zc + h) * math.sin(a)))
        for i in range(n - 1, -1, -1):
            a = a0 + (a1 - a0) * i / (n - 1)
            out.append((zc * math.cos(a), zc * math.sin(a)))
        pl = bk.plate_xz("fd_cage", out, py - 0.0009, py + 0.0009, "alloy", grp)
        kit.move(pl, Vector((bb.x, 0, bb.z)))
        obs.append(pl)
    return obs, c


def downtube_shifters(c, d, r_tube, grp="frame"):
    """Friction levers on the down tube's bosses: a lever each side, a D-ring on each."""
    obs = []
    c = Vector(c)
    d = Vector(d).normalized()
    obs.append(bk.sweep("dt_band", [c - d * 0.008, c + d * 0.008], r_tube + 0.0015, "alloy", grp, n=16))
    for s in (1, -1):
        piv = c + Vector((0, s * (r_tube + 0.006), 0))
        obs.append(bk.cyl_ax("dt_drum", piv, (0, 1, 0), 0.011, 0.01, "alloy", grp, n=16))
        up = Vector((0.25, 0, 1)).normalized()
        tip = piv + up * 0.062 + Vector((0, s * 0.006, 0))
        obs.append(bk.sweep("dt_lever", [piv + Vector((0, s * 0.004, 0)), piv + up * 0.03 + Vector((0, s * 0.006, 0)), tip], [(0.003, 0.007), (0.0028, 0.0055), (0.0035, 0.0065)], "alloy", grp, n=10, up=(1, 0, 0)))
        if bk.near():
            obs.append(bk.sweep("dt_ring", [piv + Vector((0, s * 0.0065, 0)) + Vector((math.cos(a) * 0.006, 0, math.sin(a) * 0.006)) for a in [2 * math.pi * k / 10 for k in range(10)]], 0.001, "steel", grp, n=5, closed=True))
    return obs


def thumb_shifter(c, bar_dir, side, grp):
    """A thumb shifter on the bar's top inboard of the lever: its clamp, its body, its paddle up and out."""
    c = Vector(c)
    obs = []
    b = Vector(bar_dir).normalized()
    obs.append(bk.sweep("ts_clamp", [c - b * 0.007, c + b * 0.007], 0.0135, "alloy_dark", grp, n=14))
    body = c + Vector((0.004, 0, 0.018))
    obs.append(bk.cyl_ax("ts_body", body, Vector((0.25, 0, 1)), 0.014, 0.012, "alloy_dark", grp, n=16))
    tip = body + Vector((-0.012, side * 0.0, 0.006)) + b * (-0.045)
    obs.append(bk.sweep("ts_paddle", [body + Vector((0, 0, 0.004)), body.lerp(tip, 0.5) + Vector((0, 0, 0.004)), tip], [(0.008, 0.002), (0.007, 0.002), (0.009, 0.0025)], "alloy_dark", grp, n=8, up=(0, 0, 1)))
    obs.append(bk.cyl_ax("ts_bolt", body + Vector((0, 0, 0.0075)), (0, 0, 1), 0.006, 0.003, "alloy", grp, n=12))
    return obs, body + Vector((0.01, 0, -0.004))


def trigger_shifter(c, bar_dir, grp):
    """A hub gear's trigger: a chromed clamp and a little lever under the bar."""
    c = Vector(c)
    b = Vector(bar_dir).normalized()
    obs = [bk.sweep("tr_clamp", [c - b * 0.008, c + b * 0.008], 0.0125, "chrome", grp, n=14)]
    body = c + Vector((0.0, 0, -0.016))
    obs.append(bk.box("tr_body", body, (0.03, 0.016, 0.014), "chrome", grp, r=0.004))
    obs.append(bk.sweep("tr_lever", [body + Vector((-0.012, 0, -0.002)), body + Vector((-0.028, 0, -0.012)), body + Vector((-0.032, 0, -0.026))], (0.003, 0.007), "trim", grp, n=8, up=(0, 1, 0)))
    return obs, body + Vector((0.016, 0, 0))

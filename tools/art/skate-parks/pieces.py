# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the ramps built from the board's own profiles (pkit's port of
# SkatePark): every riding face swept exactly along its profile (its arcs in 2° steps near: the chord's sag under
# half a millimetre on the 3.2 m vert), then what a real ramp is made of round it —
#
#   wood (the hall): masonite sheets on the transitions (seams every 4 ft up, 8 ft across, staggered; the top row
#   under the coping waxed and scuffed), a 1 ft steel transition plate at the foot, a steel deck plate behind the
#   coping, the decks painted ply with grit; pine ply sides; open backs (2 × 4 studs at 16 in, top and bottom
#   plates, the dark inside); galvanised 60 mm coping with its bolts down through the deck; ledges' and boxes'
#   edges in steel angle; rails round bar on square posts, base plates bolted down; sprayed tags on the sides.
#
#   concrete (the yard): poured faces (trowelled, joints every 10 ft), the band under the coping waxed dark,
#   board-formed sides, painted steel coping (chipped to the steel on top), the same angle, rails and posts.
#
# Each side or end of a face is drawn only where no other surface stands as high beside it (a neighbour's top
# found by the park's own topAt): the extension's walls above the low coping, a stair's risers, nothing between
# two halves of a piece.
import math
import random

import pkit as K

TOP_BAND = {"wood": 1.22, "concrete": 1.525 * 0.6}
FRAMED = {"qp4", "qp8", "quarter", "vert", "halfext", "half", "mini", "bank", "kicker", "qp4corner", "bowlcorner", "spine", "spine4"}
STUD = (0.038, 0.089)  # a 2 × 4 (m)


def faces_of(park, p, rng, uoff):
    """A placed surface's riding face: a grid over its profile's samples and across, a material each stretch."""
    prof = p.prof
    wood = park.what == "wood"
    cops = prof.copings
    band = TOP_BAND[park.what]
    z0 = prof.at(0)[1]
    sloped_foot = z0 < 0.01 and prof.total > 0.3 and abs(prof.at(0.01)[3]) > 0.05
    extra = []
    for c in cops:
        extra += [c - band, c, c + 0.15]
    if wood and sloped_foot:
        extra.append(0.3)
    ls = prof.samples(extra)

    def mat_at(lm):
        u, z, tu, tz = prof.at(lm)
        if cops:
            c = cops[0]
            if lm < c - band:
                m = "face"
            elif lm < c:
                m = "top"
            elif lm < c + 0.15 and wood:
                m = "plate"
            else:
                m = "deck"
        elif abs(tz) < 0.02:
            m = "deck" if z > 0.01 else "face"
        else:
            m = "face"
        if m == "face" and wood and sloped_foot and lm < 0.3:
            m = "plate"
        return {"face": "masonite" if wood else "conc", "top": "mastop" if wood else "conctop", "plate": "plate", "deck": "deck" if wood else "conc"}[m]

    if p.line:
        n = max(1, math.ceil((p.w1 - p.w0) / K.st("w") - 1e-9))
    else:
        n = max(1, math.ceil((p.w1 - p.w0) / K.st("turn") - 1e-9))
    ws = [p.w0 + (p.w1 - p.w0) * j / n for j in range(n + 1)]
    c0 = cops[0] if cops else prof.total
    grp = "main"
    for i in range(len(ls) - 1):
        la, lb = ls[i], ls[i + 1]
        if lb - la < 1e-6:
            continue
        mat = mat_at((la + lb) / 2)
        pa, pb = prof.at(la), prof.at(lb)
        for j in range(n):
            wa, wb = ws[j], ws[j + 1]
            pts, uvs, keys = [], [], []
            for (l, pt), w in ((( la, pa), wa), ((lb, pb), wa), ((lb, pb), wb), ((la, pa), wb)):
                (x, y), _, _ = p.world(pt[0], w)
                z = p.oz + (pt[1] if pt[1] > 1e-6 else K.FLOOR_LIFT)
                pts.append((x, y, z))
                v = (c0 - l) if cops else (prof.total - l)
                uu = w * (p.wscale(pt[0]) if not p.line else 1.0) + uoff
                uvs.append((uu, v))
                keys.append((p.idx, round(l, 7), round(w, 7)))
            # (its normal: the tangent turned up)
            tu, tz = (pa[2] + pb[2]) / 2, (pa[3] + pb[3]) / 2
            _, (ux, uy), _ = p.world((pa[0] + pb[0]) / 2, (wa + wb) / 2)
            K.face(mat, pts, uvs, smooth=True, grp=grp, keys=keys, n=(-tz * ux, -tz * uy, tu))


def neighbour_lo(park, p, x, y, base):
    t = park.top_at(x, y, 99.0, skip=p.idx)
    return max(base, t[0]) if t else base


def sides_of(park, p, rng, tags):
    """The surface's sides (at w0 and w1, wherever nothing stands as high beside them)."""
    prof = p.prof
    mat = "ply" if park.what == "wood" else "concside"
    us = sorted({round(prof.at(l)[0], 7) for l in prof.samples()})
    base = p.oz
    for w_side, out in ((p.w0, -1), (p.w1, 1)):
        runs = []
        for a, b in zip(us, us[1:]):
            if b - a < 1e-5:
                continue
            row = []
            for u in (a + 1e-5, b - 1e-5):
                t = prof.top_at(u)
                hi = p.oz + (t[0] if t else 0)
                (x, y), _, (wx, wy) = p.world(u, w_side)
                off = 0.03 if p.line else 0.03 / max(0.05, p.wscale(u))
                (xo, yo), _, _ = p.world(u, w_side + out * off)
                lo = neighbour_lo(park, p, xo, yo, base)
                row.append((u, x, y, lo, hi, wx * out, wy * out))
            (ua, xa, ya, loa, hia, nx, ny), (ub, xb, yb, lob, hib, _, _) = row
            if hia - loa < 0.002 and hib - lob < 0.002:
                continue
            loa, lob = min(loa, hia), min(lob, hib)
            ra, rb = (ua if p.line else p.radius(ua)), (ub if p.line else p.radius(ub))
            K.face(mat, [(xa, ya, loa), (xb, yb, lob), (xb, yb, hib), (xa, ya, hia)], [(ra, loa - base), (rb, lob - base), (rb, hib - base), (ra, hia - base)], n=(nx, ny, 0))
            runs.append((ua, ub, max(loa, lob), min(hia, hib), nx, ny))
        if tags is not None and K.near():
            tag_side(p, w_side, out, runs, rng, tags)


def tag_side(p, w_side, out, runs, rng, tags):
    """Now and then a sprayed tag on a side, where it's tall enough."""
    if not runs or rng.random() > 0.45 or tags[0] <= 0:
        return
    good = [r for r in runs if r[3] - r[2] > 0.9]
    if not good:
        return
    ua = min(r[0] for r in good)
    ub = max(r[1] for r in good)
    if ub - ua < 1.0:
        return
    size = rng.uniform(0.6, 0.95)
    u0 = rng.uniform(ua, max(ua, ub - size))
    u1 = u0 + size
    # (its bottom over the highest of what's under it there, its top under the face)
    lo = max(r[2] for r in good if r[1] > u0 and r[0] < u1)
    hi = min(r[3] for r in good if r[1] > u0 and r[0] < u1)
    if hi - lo < size + 0.1:
        return
    z0 = lo + rng.uniform(0.05, hi - lo - size - 0.05)
    cell = rng.randrange(16)
    c, r_ = cell % 4, cell // 4
    cu0, cu1 = c / 4, (c + 1) / 4
    cv0, cv1 = 1 - (r_ + 1) / 4, 1 - r_ / 4
    pts = []
    for u in (u0, u1):
        (x, y), _, (wx, wy) = p.world(u, w_side)
        pts.append((x + wx * out * 0.004, y + wy * out * 0.004))
    (xa, ya), (xb, yb) = pts
    nx, ny = (pts[0][0] - p.world(u0, w_side)[0][0]), (pts[0][1] - p.world(u0, w_side)[0][1])
    # (read the right way from outside: flipped on the −w side)
    uvA, uvB = (cu0, cu1) if out > 0 else (cu1, cu0)
    K.face("tags", [(xa, ya, z0), (xb, yb, z0), (xb, yb, z0 + size), (xa, ya, z0 + size)], [(uvA, cv0), (uvB, cv0), (uvB, cv1), (uvA, cv1)], n=(nx, ny, 0))
    tags[0] -= 1


def ends_of(park, p, rng):
    """The profile's ends standing off the floor (a deck's back, a kicker's, a tread's riser), where nothing stands
    as high beyond them; a ramp's back open on its framing (wood, near)."""
    prof = p.prof
    wood = park.what == "wood"
    base = p.oz
    if p.line:
        n = max(1, math.ceil((p.w1 - p.w0) / K.st("w") - 1e-9))
    else:
        n = max(1, math.ceil((p.w1 - p.w0) / K.st("turn") - 1e-9))
    ws = [p.w0 + (p.w1 - p.w0) * j / n for j in range(n + 1)]
    for l, sgn in ((prof.total, 1), (0.0, -1)):
        u, z, tu, tz = prof.at(l)
        if z < 0.01:
            continue
        sgn = 1 if u >= prof.uMax - 1e-6 else -1
        top = p.oz + z
        framed = wood and p.kind in FRAMED and sgn > 0 and K.near() and z > 0.3
        row = []
        for w in ws:
            (x, y), (ux, uy), _ = p.world(u, w)
            off = 0.03
            xo, yo = x + ux * sgn * off, y + uy * sgn * off
            lo = neighbour_lo(park, p, xo, yo, base)
            row.append((w, x, y, lo, ux * sgn, uy * sgn))
        exposed = [r for r in row if top - r[3] > 0.002]
        if not exposed:
            continue
        for (wa, xa, ya, loa, nx, ny), (wb, xb, yb, lob, _, _) in zip(row, row[1:]):
            if top - loa < 0.002 and top - lob < 0.002:
                continue
            ra = wa * (p.wscale(u) if not p.line else 1)
            rb = wb * (p.wscale(u) if not p.line else 1)
            if framed and loa - base < 0.05 and lob - base < 0.05:
                back_framing(p, u, wa, wb, base, top, sgn)
                continue
            m = "ply" if wood else "concside"
            K.face(m, [(xa, ya, loa), (xb, yb, lob), (xb, yb, top), (xa, ya, top)], [(ra, loa - base), (rb, lob - base), (rb, top - base), (ra, top - base)], n=(nx, ny, 0))


def back_framing(p, u, wa, wb, base, top, sgn):
    """An open back between wa and wb: the dark inside 12 cm in, studs at 16 in, plates top and bottom, the deck's
    ply edge along its top."""
    rec = 0.12

    def at(uu, w, z):
        (x, y), _, _ = p.world(uu, w)
        return (x, y, z)

    (_, _), (ux, uy), _ = p.world(u, (wa + wb) / 2)
    n = (ux * sgn, uy * sgn, 0)
    ui = u - sgn * rec
    sa = wa * (p.wscale(u) if not p.line else 1)
    sb = wb * (p.wscale(u) if not p.line else 1)
    K.face("void", [at(ui, wa, base), at(ui, wb, base), at(ui, wb, top - 0.03), at(ui, wa, top - 0.03)], [(sa, 0), (sb, 0), (sb, 1), (sa, 1)], n=n)
    # (the deck's edge: 3/4 in ply over the top plate)
    K.face("ply", [at(u, wa, top - 0.03), at(u, wb, top - 0.03), at(u, wb, top), at(u, wa, top)], [(sa, 0), (sb, 0), (sb, 0.03), (sa, 0.03)], n=n)
    # (the plates and studs: boxes in the back's frame)
    d = STUD[1]

    def box(w0, w1, z0, z1):
        cs = [at(u - sgn * d, w0, z0), at(u, w0, z0), at(u, w1, z0), at(u - sgn * d, w1, z0)]
        ct = [(x, y, z1) for x, y, _ in cs]
        L = abs(w1 - w0) * (p.wscale(u) if not p.line else 1)
        K.face("lumber", [cs[1], cs[2], ct[2], ct[1]], [(0, 0), (L, 0), (L, z1 - z0), (0, z1 - z0)], n=n)
        (x0, y0), _, (wx, wy) = p.world(u, w0)
        K.face("lumber", [cs[0], cs[1], ct[1], ct[0]], [(0, 0), (d, 0), (d, z1 - z0), (0, z1 - z0)], n=(-wx, -wy, 0))
        K.face("lumber", [cs[2], cs[3], ct[3], ct[2]], [(0, 0), (d, 0), (d, z1 - z0), (0, z1 - z0)], n=(wx, wy, 0))
        K.face("lumber", [ct[0], ct[1], ct[2], ct[3]], [(0, 0), (d, 0), (d, L), (0, L)], n=(0, 0, 1))

    t = STUD[0]
    span = (wb - wa) * (p.wscale(u) if not p.line else 1)
    scale = 1 / (p.wscale(u) if not p.line else 1)
    box(wa, wb, base, base + t)
    box(wa, wb, top - 0.03 - t, top - 0.03)
    k = 0.0
    while k <= span + 1e-6:
        w = wa + k * scale
        w0 = max(wa, w - t / 2 * scale)
        w1 = min(wb, w + t / 2 * scale)
        if w1 - w0 > 1e-4:
            box(w0, w1, base + t, top - 0.03 - t)
        k += 0.406


# ── the lines: copings, edges, rails ─────────────────────────────────────────────────────────────────────────


def tube(mat, pts, r, n, cap=True, grp="main", start_len=0.0):
    """A round bar along a polyline (floor frame): its round's v from its top (0) round (1), u along it."""
    if len(pts) < 2:
        return
    L = [0.0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + math.dist(a, b))
    frames = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        T = [b[k] - a[k] for k in range(3)]
        tl = math.sqrt(sum(c * c for c in T)) or 1
        T = [c / tl for c in T]
        up = (0, 0, 1) if abs(T[2]) < 0.95 else (1, 0, 0)
        S = (T[1] * up[2] - T[2] * up[1], T[2] * up[0] - T[0] * up[2], T[0] * up[1] - T[1] * up[0])
        sl = math.sqrt(sum(c * c for c in S)) or 1
        S = [c / sl for c in S]
        Z = (S[1] * T[2] - S[2] * T[1], S[2] * T[0] - S[0] * T[2], S[0] * T[1] - S[1] * T[0])
        frames.append((S, Z))
    ring = []
    for i, p in enumerate(pts):
        S, Z = frames[i]
        row = []
        for k in range(n + 1):
            th = 2 * math.pi * k / n
            c, s = math.cos(th), math.sin(th)
            row.append((p[0] + r * (c * Z[0] + s * S[0]), p[1] + r * (c * Z[1] + s * S[1]), p[2] + r * (c * Z[2] + s * S[2]), c * Z[0] + s * S[0], c * Z[1] + s * S[1], c * Z[2] + s * S[2]))
        ring.append(row)
    key0 = random.random()
    for i in range(len(pts) - 1):
        for k in range(n):
            a, b, c, d = ring[i][k], ring[i + 1][k], ring[i + 1][k + 1], ring[i][k + 1]
            nn = tuple((a[j + 3] + c[j + 3]) / 2 for j in range(3))
            K.face(
                mat,
                [a[:3], b[:3], c[:3], d[:3]],
                [(start_len + L[i], k / n), (start_len + L[i + 1], k / n), (start_len + L[i + 1], (k + 1) / n), (start_len + L[i], (k + 1) / n)],
                smooth=True,
                grp=grp,
                keys=[(key0, i, k % n), (key0, i + 1, k % n), (key0, i + 1, (k + 1) % n), (key0, i, (k + 1) % n)],
                n=nn,
            )
    if cap:
        for i, sgn in ((0, -1), (len(pts) - 1, 1)):
            p = pts[i]
            a = pts[max(0, i - 1)] if sgn > 0 else pts[1]
            T = [(p[k] - a[k]) * sgn if sgn > 0 else (p[k] - a[k]) for k in range(3)]
            K.face(mat, [x[:3] for x in ring[i][:n]], [(0.5 + 0.5 * math.cos(2 * math.pi * k / n), 0.5 + 0.5 * math.sin(2 * math.pi * k / n)) for k in range(n)], grp=grp, n=tuple(T))


def boxy(mat, c, half, yaw, z0, z1, grp="main"):
    """An upright box (centre c, half-sizes along its own x, y turned yaw) from z0 to z1."""
    ca, sa = math.cos(yaw), math.sin(yaw)
    hx, hy = half
    cs = [(c[0] + ca * x - sa * y, c[1] + sa * x + ca * y) for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
    for i in range(4):
        a, b = cs[i], cs[(i + 1) % 4]
        L = math.dist(a, b)
        nx, ny = (b[1] - a[1]) / L, -(b[0] - a[0]) / L
        mx, my = (a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]
        if nx * mx + ny * my < 0:
            nx, ny = -nx, -ny
        K.face(mat, [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], [(0, z0), (L, z0), (L, z1), (0, z1)], grp=grp, n=(nx, ny, 0))
    K.face(mat, [(x, y, z1) for x, y in cs], [(x, y) for x, y in cs], grp=grp, n=(0, 0, 1))


def plan_perp(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1
    return (-dy / L, dx / L), (dx / L, dy / L)


def coping(park, ln, rng):
    """A coping: a 60 mm pipe along the lip, 1 cm proud of the face, 3 mm over the deck; its bolts down through
    the deck behind every 2 ft (near)."""
    r = 0.03
    pts = ln["pts"]
    out = []
    backs = []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        (nx, ny), _ = plan_perp(a, b)
        zp = park.top_at(p[0] + nx * 0.12, p[1] + ny * 0.12, p[2] + 0.02)
        zm = park.top_at(p[0] - nx * 0.12, p[1] - ny * 0.12, p[2] + 0.02)
        dp = zp is not None and abs(zp[0] - p[2]) < 0.01
        dm = zm is not None and abs(zm[0] - p[2]) < 0.01
        k = 1 if dp and not dm else -1 if dm and not dp else 0
        back = (nx * k, ny * k)
        backs.append(back)
        out.append((p[0] + back[0] * 0.02, p[1] + back[1] * 0.02, p[2] - r + 0.003))
    mat = "tube" if park.what == "wood" else "paintpipe"
    tube(mat, out, r, K.st("tube"))
    if not K.near():
        return
    # the bolts behind it
    acc = 0.3
    for (a, ba), (b, _) in zip(zip(pts, backs), zip(pts[1:], backs[1:])):
        L = math.dist(a[:2], b[:2])
        while acc < L:
            t = acc / L
            x = a[0] + (b[0] - a[0]) * t + ba[0] * 0.11
            y = a[1] + (b[1] - a[1]) * t + ba[1] * 0.11
            z = a[2] + (b[2] - a[2]) * t
            boxy("galv", (x, y), (0.011, 0.011), rng.random(), z, z + 0.004)
            acc += 0.61
        acc -= L


def angle_iron(park, ln):
    """A box's or a ledge's edge: 50 × 50 mm steel angle, its top leg on the top (1.5 mm proud), its side leg down
    the side."""
    a, b = ln["pts"][0], ln["pts"][-1]
    (nx, ny), (tx, ty) = plan_perp(a, b)
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    zp = park.top_at(mid[0] + nx * 0.1, mid[1] + ny * 0.1, a[2] + 0.02)
    if zp is not None and abs(zp[0] - a[2]) < 0.01:
        nx, ny = -nx, -ny  # (out: where it falls away)
    z = a[2]
    L = math.dist(a[:2], b[:2])
    e = 0.0015
    pa = (a[0], a[1])
    pb = (b[0], b[1])
    ia = (a[0] - nx * 0.05, a[1] - ny * 0.05)
    ib = (b[0] - nx * 0.05, b[1] - ny * 0.05)
    oa = (a[0] + nx * e, a[1] + ny * e)
    ob = (b[0] + nx * e, b[1] + ny * e)
    K.face("galv", [(ia[0], ia[1], z + e), (ib[0], ib[1], z + e), (ob[0], ob[1], z + e), (oa[0], oa[1], z + e)], [(0, 0), (L, 0), (L, 0.05), (0, 0.05)], n=(0, 0, 1))
    K.face("galv", [(oa[0], oa[1], z - 0.05), (ob[0], ob[1], z - 0.05), (ob[0], ob[1], z + e), (oa[0], oa[1], z + e)], [(0, 0), (L, 0), (L, 0.05), (0, 0.05)], n=(nx, ny, 0))
    _ = (pa, pb, tx, ty)


def rail(park, ln, rng, kind):
    """A rail: a round bar (its top the line) on posts — square tube on a flat rail, round on a handrail — at 0.3 m
    from its ends, at its kinks, no more than 1.8 m apart; each post on a plate bolted to what's under it."""
    hand = kind in ("stairs", "stairs8")
    r = 0.021 if hand else 0.025
    pts = ln["pts"]
    bar = [(x, y, z - r) for x, y, z in pts]
    tube("tube", bar, r, K.st("tube"))
    L = [0.0]
    for a, b in zip(pts, pts[1:]):
        L.append(L[-1] + math.dist(a[:2], b[:2]))
    stops = {0.3, L[-1] - 0.3, *L[1:-1]}
    srt = sorted(stops)
    for a, b in zip(srt, srt[1:]):
        k = math.ceil((b - a) / 1.8 - 1e-9)
        for j in range(1, k):
            stops.add(a + (b - a) * j / k)
    for t in sorted(stops):
        i = max(0, min(len(pts) - 2, next((k for k in range(len(L) - 1) if L[k] <= t <= L[k + 1]), len(pts) - 2)))
        a, b = pts[i], pts[i + 1]
        k = (t - L[i]) / max(1e-9, L[i + 1] - L[i])
        x, y, z = (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)
        under = park.top_at(x, y, z - 0.1)
        foot = under[0] if under else park.h
        top = z - 2 * r
        if top - foot < 0.03:
            continue
        yaw = math.atan2(b[1] - a[1], b[0] - a[0])
        if hand:
            tube("tube", [(x, y, foot), (x, y, top + r)], 0.019, max(6, K.st("tube") - 2), cap=False)
        else:
            boxy("tube", (x, y), (0.025, 0.025), yaw, foot, top + r * 0.5)
        boxy("galv", (x, y), (0.075, 0.075), yaw, foot, foot + 0.008)
        if K.near():
            for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                c, s = math.cos(yaw), math.sin(yaw)
                bx, by = x + (dx * c - dy * s) * 0.055, y + (dx * s + dy * c) * 0.055
                boxy("galv", (bx, by), (0.008, 0.008), yaw, foot + 0.008, foot + 0.016)


def build_park(park, seed=104, tags=26):
    rng = random.Random(seed)
    random.seed(seed)
    tagsleft = [tags]
    offs = {}
    for p in park.placed:
        uoff = offs.setdefault(p.piece, rng.choice([0.0, 1.22]) + rng.random() * 0.0)
        faces_of(park, p, rng, uoff)
        sides_of(park, p, rng, tagsleft)
        ends_of(park, p, rng)
    for ln in park.lines:
        kind = park.pieces[ln["piece"]]["kind"]
        if ln["what"] == "coping":
            coping(park, ln, rng)
        elif ln["what"] == "ledge":
            angle_iron(park, ln)
        else:
            rail(park, ln, rng, kind)

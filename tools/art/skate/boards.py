# Plan 103 — the skateboards: three shapes (vert, street, cruiser) × three variants, each a deck (its outline, kicks,
# concave and 7-ply edge), two trucks (baseplate, kingpin, bushings, hanger, axle), four wheels (a rounded profile,
# bearings, nuts) and the deck's bolts — real measures of late-80s / early-90s boards. Invented makers and models.
#
# build(vid) → (B, objects): every object carries `grp` (its pivot: deck, hanger_f, hanger_r, wheel_fl…, collider)
# and `kind` (its material). B.pivots {name: (at, None, parent)}, B.points {name: (at, grp)}, B.info (measures).
import math

from mathutils import Matrix, Vector

import skit as sk
from skit import V, kit

IN = 0.0254
ORDER = ["vert-classic", "vert-fish", "vert-square", "street-pop", "street-slick", "street-tech", "cruiser-classic", "cruiser-wood", "cruiser-mini"]

# ── the shapes and their variants ─────────────────────────────────────────────────────────────────────────────
# x_t, x_n: the tail's and nose's tips (the origin under the axles' middle); hw: the side's half-width (x, hw);
# tail / nose: ("round", rx) | ("square", rc) | ("fish", lobe_y, notch, join); kick_*: (angle °, bend radius);
# hole: the bolt pattern's long spacing (old school 2.5", new school 2.125"); th: axle to baseplate top; tw: axle
# end to end; wheel: (r, width, lip as a share of the width).
SHAPES = {
    "vert": dict(
        wb=0.394, x_t=-0.412, x_n=0.347, wm=10 * IN, thick=0.0125, e=0.0026, concave=0.0035,
        hw=[(-0.357, 0.108), (-0.28, 0.113), (-0.15, 0.121), (0.0, 0.126), (0.10, 0.127), (0.2, 0.122), (0.257, 0.113)],
        tail=("round", 0.055), nose=("round", 0.09), kick_t=(15, 0.11), kick_n=(10, 0.10),
        hole=2.5 * IN, th=0.058, tw=0.248, riser=0.0, wheel=(0.032, 0.042, 0.3),
        edge="paint", bottom="graphic", grip="full", rails=True, skid=True, ts=1.1,
    ),
    "street": dict(
        wb=0.356, x_t=-0.396, x_n=0.404, wm=8 * IN, thick=0.0115, e=0.0022, concave=0.0055,
        hw=[(-0.301, 0.1016), (0.0, 0.1016), (0.309, 0.1016)],
        tail=("round", 0.095), nose=("round", 0.095), kick_t=(20, 0.07), kick_n=(19, 0.07),
        hole=2.125 * IN, th=0.052, tw=0.198, riser=0.0, wheel=(0.025, 0.031, 0.2),
        edge="deck_wood", bottom="graphic", grip="full", ts=1.0,
    ),
    "cruiser": dict(
        wb=0.38, x_t=-0.38, x_n=0.357, wm=9 * IN, thick=0.012, e=0.0026, concave=0.003,
        hw=[(-0.32, 0.098), (-0.2, 0.108), (0.0, 0.114), (0.18, 0.113), (0.27, 0.106)],
        tail=("round", 0.06), nose=("round", 0.087), kick_t=(17, 0.09), kick_n=(0, 0.1),
        hole=2.5 * IN, th=0.054, tw=0.22, riser=0.006, wheel=(0.030, 0.043, 0.33),
        edge="paint", bottom="graphic", grip="full", risers=True, ts=1.05,
    ),
}
VARIANTS = {
    "vert-classic": dict(
        name="Varlow Comet", colours=["#E4007C", "#FFD400", "#00A3AD"], wheel_colours=["#F2EFE4", "#FF5FA2", "#FFE14D"],
    ),
    "vert-fish": dict(
        name="Varlow Marlin", tail=("fish", 0.07, 0.05, 0.088), nose_guard=True,
        hw=[(-0.324, 0.103), (-0.25, 0.11), (-0.15, 0.12), (0.0, 0.126), (0.10, 0.127), (0.2, 0.122), (0.257, 0.113)],
        colours=["#00A6A6", "#FF6A13", "#1A1A1A"], wheel_colours=["#F4F1E6", "#3DDC84", "#FF8C1A"],
    ),
    "vert-square": dict(
        name="Varlow Bulwark", tail=("square", 0.03), nose=("square", 0.034), lapper=True,
        hw=[(-0.382, 0.11), (-0.28, 0.114), (-0.15, 0.121), (0.0, 0.126), (0.10, 0.127), (0.22, 0.122), (0.313, 0.114)],
        colours=["#2B3BFF", "#E10600", "#F5F5F0"], wheel_colours=["#FFFFFF", "#E8E000", "#FF2D55"],
    ),
    "street-pop": dict(
        name="Larch Kerb", colours=["#C8A27A", "#1E5AA8", "#2E2E2E"], wheel_colours=["#F3F0E8", "#E9E4D4", "#DCD6C8"],
    ),
    "street-slick": dict(
        name="Larch Slick", slick=True, colours=["#1A1A1A", "#B22222", "#2F4F4F"], wheel_colours=["#F3F0E8", "#FFFFFF", "#F2D16B"],
    ),
    "street-tech": dict(
        name="Larch Needle", x_t=-0.382, x_n=0.418, wm=7.75 * IN, concave=0.0062, hw=[(-0.292, 0.0984), (0.0, 0.0984), (0.326, 0.0984)],
        tail=("round", 0.09), nose=("round", 0.092), kick_t=(20, 0.07), kick_n=(21, 0.07), tw=0.19, wheel=(0.024, 0.030, 0.2),
        colours=["#3C6E47", "#7A3E9D", "#B8B8B8"], wheel_colours=["#F3F0E8", "#EDEDED", "#9AD0EC"],
    ),
    "cruiser-classic": dict(
        name="Sandell Coaster", colours=["#FF7F50", "#40E0D0", "#F7E26B"], wheel_colours=["#FF8A3D", "#58D68D", "#5DADE2"],
    ),
    "cruiser-wood": dict(
        name="Sandell Grove", edge="deck_wood", grip="no_nose", colours=["#B98B5E", "#8B5A2B", "#D2B48C"],
        wheel_colours=["#F0E68C", "#E74C3C", "#F5F5DC"],
    ),
    "cruiser-mini": dict(
        name="Sandell Pip", wb=0.34, x_t=-0.351, x_n=0.335, wm=7.5 * IN, thick=0.0105, concave=0.002,
        hw=[(-0.296, 0.082), (-0.2, 0.090), (0.0, 0.095), (0.15, 0.095), (0.255, 0.09)],
        tail=("round", 0.055), nose=("round", 0.08), kick_t=(18, 0.08), tw=0.19, riser=0.004, th=0.052,
        edge="paint", bottom="paint", grip="pads", ribs=True, colours=["#FF4F79", "#2EC4B6", "#FFD23F"],
        wheel_colours=["#FFFFFF", "#FF9F1C", "#7B61FF"],
    ),
}


def spec(vid):
    s = dict(SHAPES[vid.split("-")[0]])
    s.update(VARIANTS[vid])
    s["shape"] = vid.split("-")[0]
    s["variant"] = vid
    return s


class Board:
    def __init__(self):
        self.pivots = {}
        self.points = {}
        self.info = {}


# ── the outline ──────────────────────────────────────────────────────────────────────────────────────────────


def cap(kind, x_tip, dirn, he):
    """An end of the outline from its tip on the centre line out to where it meets the side (y > 0); → (points,
    the index of its Coons corner)."""
    pts = []
    if kind[0] == "round":
        rx = kind[1]
        K = 24
        for i in range(K + 1):
            f = math.radians(90 * i / K)
            pts.append((x_tip + dirn * rx * (1 - math.cos(f)), he * math.sin(f)))
        return pts, 21  # (the corner near the curve's end: the rounding stays in the end's dense row, not the side's)
    if kind[0] == "square":
        rc = kind[1]
        for i in range(6):
            pts.append((x_tip, (he - rc) * i / 6))
        for i in range(9):
            f = math.radians(90 * i / 8)
            pts.append((x_tip + dirn * rc * (1 - math.cos(f)), he - rc + rc * math.sin(f)))
        return pts, 6 + 7
    # the fishtail: the notch on the centre line, the V out to each lobe's rounded point, its outer edge on to the side
    _, ly, notch, jn = kind
    a = V((x_tip + dirn * notch, 0, 0))
    b = V((x_tip + dirn * 0.004, ly - 0.006, 0))
    for p in sk.bk.bez(a, a + V((-dirn * 0.012, 0.022, 0)), b + V((dirn * 0.008, -0.016, 0)), b, 7):
        pts.append((p.x, p.y))
    # the lobe's point rounded
    c = V((x_tip + dirn * 0.006, ly, 0))
    for f in (-60, -20, 20, 60):
        r = math.radians(f)
        pts.append((c.x - dirn * 0.006 * math.cos(r), c.y + 0.006 * math.sin(r)))
    p0 = V(pts[-1] + (0,))
    p3 = V((x_tip + dirn * jn, he, 0))
    for p in sk.bk.bez(p0, p0 + V((dirn * 0.01, 0.022, 0)), p3 - V((dirn * 0.035, 0, 0)), p3, 9)[1:]:
        pts.append((p.x, p.y))
    return pts, len(pts) - 1


def outline(s):
    """The half outline (y ≥ 0) from the tail's tip to the nose's, and its two Coons corners' indices."""
    hwx = [p[0] for p in s["hw"]]
    hwf = sk.pchip(hwx, [p[1] for p in s["hw"]])
    tail, ct = cap(s["tail"], s["x_t"], 1, hwf(hwx[0]))
    nose, cn = cap(s["nose"], s["x_n"], -1, hwf(hwx[-1]))
    side = []
    x0, x1 = tail[-1][0], nose[-1][0]
    k = max(4, int((x1 - x0) / 0.01))
    for i in range(1, k):
        x = x0 + (x1 - x0) * i / k
        side.append((x, hwf(x)))
    half = tail + side + nose[::-1]
    i_nc = len(tail) + len(side) + (len(nose) - 1 - cn)
    return half, ct, i_nc, hwf


def full_of(half):
    return half + [(x, -y) for x, y in half[-2:0:-1]]


def half_width(half, x):
    """The outline's half-width at x (the widest crossing)."""
    best = 0.0
    for i in range(len(half) - 1):
        (x0, y0), (x1, y1) = half[i], half[i + 1]
        if (x0 - x) * (x1 - x) <= 0 and abs(x1 - x0) > 1e-12:
            best = max(best, y0 + (y1 - y0) * (x - x0) / (x1 - x0))
    return best


# ── the deck ─────────────────────────────────────────────────────────────────────────────────────────────────


def deck_frame(s):
    """The deck's numbers: the height, the kicks, the surface."""
    r = s["wheel"][0]
    H = r + s["th"] + s["riser"] + s["thick"]
    ax_f, ax_r = s["wb"] / 2, -s["wb"] / 2
    off = 0.006 * s["ts"] + s["hole"] / 2 + 0.022
    xk_n, xk_t = ax_f + off, ax_r - off
    kicks = [(xk_t, -1, math.radians(s["kick_t"][0]), s["kick_t"][1]), (xk_n, 1, math.radians(s["kick_n"][0]), s["kick_n"][1])]
    S = sk.Surface(H, kicks, s["concave"], s["wm"] / 2)
    return H, S, xk_t, xk_n


def bottom_at(S, thick, x, y):
    """The deck's bottom under a plan point: (the point, its outward normal — down)."""
    p = V((x, y, 0))
    q = p.copy()
    for _ in range(4):
        nn = S.normal(q.x, q.y)
        q = V((x + nn.x * thick, y + nn.y * thick, 0))
    nn = S.normal(q.x, q.y)
    return S.at(q.x, q.y) - nn * thick, -nn


def make_deck(s, S, half, ct, cn):
    """The deck: its top (grip, or paint / wood where there's none), its bottom (the graphic), its edge (the plies
    or the dip) — one Coons grid lifted onto the surface, given its thickness along the normal."""
    lod = sk.LOD
    e, thick = s["e"], s["thick"]
    full = full_of(half)
    inset = kit.offset_poly(full, -e)
    ih = inset[: len(half)]
    ih[0] = (ih[0][0], 0.0)
    ih[-1] = (ih[-1][0], 0.0)
    nt = sk.n("nt")
    tail_h = ih[: ct + 1]
    nose_h = ih[cn:]
    D0 = sk.arc_resample([(x, -y) for x, y in tail_h[::-1]] + tail_h[1:], nt)
    D1 = sk.arc_resample([(x, -y) for x, y in nose_h] + [(x, y) for x, y in nose_h[::-1]][1:], nt)
    side_l = ih[ct : cn + 1]
    xa, xb = side_l[0][0], side_l[-1][0]
    # rows: even along, closer through the kicks' bends
    xs = [xa + (xb - xa) * i / max(2, int((xb - xa) / sk.n("ns"))) for i in range(max(2, int((xb - xa) / sk.n("ns"))) + 1)]
    for x0, sg, ang, R in S.kicks:
        if ang <= 0 or lod == "far":
            continue
        L = R * math.sin(ang)
        k = max(1, int(L / sk.n("bend")))
        xs += [x0 + sg * L * (i / k) for i in range(k + 1)]
    xs = sorted(x for x in xs if xa <= x <= xb)
    clean = [xs[0]]
    for x in xs[1:]:
        if x - clean[-1] > (0.004 if lod == "near" else 0.012):
            clean.append(x)
    if clean[-1] != xb:
        clean[-1] = xb
    G = sk.coons(D0, D1, side_l, clean, fade=0.13 if lod != "far" else 0.3)
    ns = len(G)
    T = [S.at(x, y) for row in G for (x, y) in row]
    Nn = [S.normal(x, y) for row in G for (x, y) in row]
    B = [t - nn * thick for t, nn in zip(T, Nn)]
    plan = [(x, y) for row in G for (x, y) in row]
    faces = sk.grid_faces(ns, nt)
    L, wm, x_t = s["x_n"] - s["x_t"], s["wm"], s["x_t"]
    obs = []

    def sheet(name, verts, fs, kind, uv, up=True):
        used = sorted({i for f in fs for i in f})
        idx = {v: k for k, v in enumerate(used)}
        o = sk.mk(name, [verts[i] for i in used], [tuple(idx[i] for i in f) for f in fs], kind, "deck", smooth=True, angle=40)
        sk.orient_up(o, up)
        if uv:
            sk.set_uv(o, lambda vi, co, used=used: uv(used[vi]))
        obs.append(o)
        return o

    uv_grip = lambda i: (plan[i][0], plan[i][1])  # noqa: E731  (metres: the grit's tile)
    uv_wood = lambda i: ((plan[i][0] - x_t) / L, 0.02 + 0.74 * (plan[i][1] + wm / 2) / wm)  # noqa: E731
    uv_print = lambda i: ((plan[i][0] - x_t) / L, (-plan[i][1] + wm / 2) / wm)  # noqa: E731
    # the top
    grip = s["grip"]
    if lod == "far":
        sheet("deck_top", T, faces, "grip", uv_grip)
    elif grip == "full":
        sheet("deck_top", T, faces, "grip", uv_grip)
    elif grip == "no_nose":
        xg = s["wb"] / 2 + 0.006 * s["ts"] + s["hole"] / 2 + 0.035
        # (cut along a row of the grid, the one nearest xg: the grip's edge one clean line, bent as the rows are)
        ig = min(range(ns), key=lambda i: abs(clean[i] - xg))
        row = lambda f: min(f) // nt  # noqa: E731
        sheet("deck_top", T, [f for f in faces if row(f) < ig], "grip", uv_grip)
        sheet("deck_top_wood", T, [f for f in faces if row(f) >= ig], "deck_wood", uv_wood)
    else:
        sheet("deck_top", T, faces, "paint", None)
    # the bottom
    bk_kind = s["bottom"]
    if s.get("slick"):
        bk_kind = "deck_wood"  # (hidden under the slick)
    if lod == "far" and bk_kind != "paint":
        bk_kind = "graphic"
    sheet("deck_bottom", B, faces, bk_kind, uv_print if bk_kind == "graphic" else (uv_wood if bk_kind == "deck_wood" else None), up=False)
    # the edge: loops from the top's boundary round the rounded edge to the bottom's
    ring = sk.ring_of(G)
    rp = [G[i][j] for i, j in ring]
    rid = [i * nt + j for i, j in ring]
    m = len(ring)
    area = sum(rp[k][0] * rp[(k + 1) % m][1] - rp[(k + 1) % m][0] * rp[k][1] for k in range(m))
    sg = 1 if area > 0 else -1
    outs = []
    for k in range(m):
        a, b = V(rp[k - 1] + (0,)), V(rp[(k + 1) % m] + (0,))
        t = (b - a).normalized()
        o = V((t.y, -t.x, 0)) * sg
        nn = Nn[rid[k]]
        o = (o - nn * o.dot(nn)).normalized()
        outs.append(o)
    if lod == "near":
        prof = [(0, 0), (math.sin(math.radians(45)), 1 - math.cos(math.radians(45))), (1, 1), None, None, None]
        prof = [(0.0, 0.0), (0.707 * e, 0.293 * e), (e, e), (e, thick - e), (0.707 * e, thick - 0.293 * e), (0.0, thick)]
    elif lod == "mid":
        prof = [(0.0, 0.0), (0.0, thick)]
    else:
        prof = [(0.0, 0.0), (0.0, thick)]
    verts, fs, uvs = [], [], []
    per = [0.0]
    for k in range(1, m + 1):
        per.append(per[-1] + (V(rp[k % m] + (0,)) - V(rp[k - 1] + (0,))).length)
    P = per[-1]
    for li, (bulge, depth) in enumerate(prof):
        for k in range(m + 1):  # (the seam's column doubled: the plies' u runs once round)
            kk = k % m
            tt = T[rid[kk]]
            verts.append(tt + outs[kk] * bulge - Nn[rid[kk]] * depth)
            uvs.append((per[k] / P, 0.81 + 0.18 * (1 - depth / thick)))
    w = m + 1
    for li in range(len(prof) - 1):
        for k in range(m):
            a, b = li * w + k, li * w + k + 1
            fs.append((a, b, b + w, a + w))
    edge = sk.mk("deck_edge", verts, fs, s["edge"] if lod != "far" else "grip", "deck", smooth=True, angle=60)
    me = edge.data
    # faces out
    flip = 0
    for p in me.polygons[: m]:
        c = p.center
        k = min(range(m), key=lambda q: (V(rp[q] + (0,)) - V((c.x, c.y, 0))).length)
        flip += 1 if p.normal.dot(outs[k]) < 0 else -1
    if flip > 0:
        for p in me.polygons:
            p.flip()
    if s["edge"] == "deck_wood" and lod != "far":
        uv = me.uv_layers.new(name="UVMap")
        for p in me.polygons:
            for li_ in p.loop_indices:
                uv.data[li_].uv = uvs[me.loops[li_].vertex_index]
    obs.append(edge)
    info = dict(G=G, T=T, N=Nn, ring=ring, outs=outs, inset_half=ih)
    return obs, info


def strip_plate(name, xs, wfun, lift, thick, kind, grp, nt, side_kind=None, uv=None, embed=0.0006):
    """A thin plate laid on a surface: rows across at xs, each ±wfun(x) wide; lift(x, y) → (the surface's point,
    its outward normal). Its outer face and a rounded edge down into the surface (its inner face never seen)."""
    rows = [(x, wfun(x)) for x in xs if wfun(x) > 0.002]
    ns = len(rows)
    outer, base, ring_n = [], [], []
    for x, w in rows:
        for j in range(nt):
            y = -w + 2 * w * j / (nt - 1)
            p, nn = lift(x, y)
            outer.append(p + nn * thick)
            base.append((p, nn, x, y))
    faces = sk.grid_faces(ns, nt)
    o = sk.mk(name, outer, faces, kind, grp, smooth=True, angle=40)
    # faces away from the surface
    flip = sum(1 if p.normal.dot(base[p.vertices[0]][1]) < 0 else -1 for p in o.data.polygons)
    if flip > 0:
        for p in o.data.polygons:
            p.flip()
    if uv:
        sk.set_uv(o, lambda vi, co: uv(base[vi][2], base[vi][3]))
    G = [[0] * nt for _ in range(ns)]
    ring = sk.ring_of(G)
    m = len(ring)
    rp = [base[i * nt + j] for i, j in ring]
    verts = []
    for k in range(m):
        p, nn, x, y = rp[k]
        a = V((rp[k - 1][2], rp[k - 1][3], 0))
        b = V((rp[(k + 1) % m][2], rp[(k + 1) % m][3], 0))
        t = (b - a)
        if t.length < 1e-9:
            t = V((1, 0, 0))
        t.normalize()
        out = V((t.y, -t.x, 0))
        cxy = V((x, y, 0)) - V((sum(r[0] for r in rows) / ns, 0, 0))
        if out.dot(cxy) < 0:
            out = -out
        out = (out - nn * out.dot(nn)).normalized()
        verts.append((p + nn * thick, p + nn * thick * 0.45 + out * thick * 0.55, p - nn * embed + out * thick * 0.6))
    vs = [v[0] for v in verts] + [v[1] for v in verts] + [v[2] for v in verts]
    fs = []
    for li in range(2):
        for k in range(m):
            j = (k + 1) % m
            fs.append((li * m + k, li * m + j, (li + 1) * m + j, (li + 1) * m + k))
    e = sk.mk(name + "_edge", vs, fs, side_kind or kind, grp, smooth=True, angle=60)
    cx = sum(r[0] for r in rows) / ns
    flip = 0
    for p in e.data.polygons:
        c = p.center
        flip += 1 if p.normal.dot(V((c.x - cx, c.y, 0))) < 0 else -1
    if flip > 0:
        for p in e.data.polygons:
            p.flip()
    return [o, e]


# ── the trucks ───────────────────────────────────────────────────────────────────────────────────────────────


def hull2(c1, r1, c2, r2, n):
    """The outline round two circles (x, z) — n points, the same layout whatever their sizes."""
    d = c2 - c1
    D = max(d.length, 1e-5)
    al = math.atan2(d.y, d.x)
    be = math.acos(max(-1, min(1, (r1 - r2) / D)))
    n2 = n // 2
    n1 = n - n2
    out = []
    for i in range(n2):
        a = al - be + 2 * be * i / (n2 - 1)
        out.append(c2 + V((math.cos(a), math.sin(a))) * r2)
    for i in range(n1):
        a = al + be + (2 * math.pi - 2 * be) * (i + 1) / (n1 + 1)
        out.append(c1 + V((math.cos(a), math.sin(a))) * r1)
    return out


def truck(s, xa, sgn, tag, H, S):
    """A truck at axle x = xa (sgn +1 the front: its kingpin faces −x, the board's middle). → objects."""
    r = s["wheel"][0]
    sc = s["ts"]
    th, tw = s["th"], s["tw"]
    lod = sk.LOD
    ob = []
    grp_h = f"hanger_{tag}"

    def P(u, v, y=0.0):
        return V((xa - sgn * u * sc, y, r + v * sc))

    ka = math.radians(40)
    d = V((-sgn * math.sin(ka), 0, -math.cos(ka)))
    R = P(0.013, 0.019)
    vtop = th / sc  # (the plate's top in profile units)

    def K(t):
        return R + d * t * sc

    # the hanger: a loft across of hulls round the axle and (toward the middle) the kingpin's ring
    ww = s["wheel"][1]
    yh = tw / 2 - 0.0075 - ww - 0.0016
    r1 = 0.0098 * sc
    rr = 0.0108 * sc
    w0, w1 = 0.011 * sc, 0.042 * sc
    nh = sk.n("hang")
    c1 = V((xa, r))
    c2f = V((R.x, R.z))
    if lod == "near":
        pos = [0.0, w0, (w0 + w1) / 2, w1, w1 + (yh - 0.006 - w1) / 2, yh - 0.006, yh - 0.0018, yh]
    else:
        pos = [0.0, w1, yh]
    ys = [-p for p in pos[::-1]][:-1] + pos
    secs = []
    for y in ys:
        a = abs(y)
        g = 1.0 if a <= w0 else (0.0 if a >= w1 else 0.5 + 0.5 * math.cos(math.pi * (a - w0) / (w1 - w0)))
        k = 0.82 if a >= yh - 1e-6 else (0.97 if a >= yh - 0.002 else 1.0)
        c2 = c1.lerp(c2f, g)
        if (c2 - c1).length < 1e-5:
            c2 = c1 + (c2f - c1).normalized() * 1e-5
        pts = hull2(c1, r1 * k, c2, (r1 + (rr - r1) * g) * k, nh)
        secs.append([V((p.x, y, p.y)) for p in pts])
    ob.append(sk.bk.loft(f"hanger_{tag}", secs, "alloy", grp_h, angle=50))
    # its ring round the kingpin, and the pivot arm up into the baseplate's cup
    if lod == "near":
        ob.append(sk.bk.cyl_ax(f"ring_{tag}", R, d, 0.0112 * sc, 0.0104 * sc, "alloy", grp_h, n=sk.n("cyl")))
    Pb, Pt = P(-0.002, 0.017), P(-0.027, 0.041)
    pv = (Pt - Pb).normalized()
    ob.append(sk.sweep(f"pivot_{tag}", [Pb, Pb.lerp(Pt, 0.6), Pt + pv * 0.001 * sc], [0.0064 * sc, 0.0056 * sc, 0.0049 * sc], "alloy", grp_h, n=sk.n("cyl")))
    # the axle, the speed washers by the hanger
    ob.append(sk.bk.cyl_ax(f"axle_{tag}", V((xa, 0, r)), (0, 1, 0), 0.004, tw, "steel", grp_h, n=max(6, sk.n("cyl") // 2)))
    # the baseplate: its plate (rounded, on the deck's bottom or the riser), the web under it, the kingpin's boss,
    # the pivot's boss and its cup
    zt = r + th
    hole = s["hole"]
    xb = xa + sgn * 0.006 * sc
    Lp, Wp = hole + 0.017, 1.625 * 0.0254 + 0.017
    pl = kit.round_poly([(xb - Lp / 2, -Wp / 2), (xb + Lp / 2, -Wp / 2), (xb + Lp / 2, Wp / 2), (xb - Lp / 2, Wp / 2)], 0.0095, 3 if lod == "near" else 1)
    plate = kit.prism(f"plate_{tag}", pl, zt - 0.0052, zt, "alloy", "deck", axis="z")
    if lod == "near":
        kit.bevel(plate, 0.0016, 1, angle=60)
    ob.append(plate)
    web = [(-0.040, vtop - 0.004), (-0.040, 0.041), (-0.034, 0.0335), (-0.020, 0.0312), (-0.004, 0.0300), (0.006, 0.0300), (0.0135, 0.036), (0.016, vtop - 0.004)]
    wp = [(xa - sgn * u * sc, r + v * sc) for u, v in web]
    wb_ = kit.prism(f"web_{tag}", wp, -0.0102 * sc, 0.0102 * sc, "alloy", "deck")
    if lod == "near":
        kit.bevel(wb_, 0.0022, 2, angle=40)
    ob.append(wb_)
    if lod == "near":
        ob.append(sk.bk.cyl_ax(f"kboss_{tag}", K(-0.03), d, 0.0104 * sc, 0.027 * sc, "alloy", "deck", n=sk.n("cyl")))
        ob.append(sk.bk.cyl_ax(f"pboss_{tag}", Pt + pv * 0.004 * sc, pv, 0.0088 * sc, 0.019 * sc, "alloy", "deck", n=sk.n("cyl")))
        ob.append(sk.bk.cyl_ax(f"pcup_{tag}", Pt - pv * 0.0062 * sc, pv, 0.0079 * sc, 0.0032 * sc, "rubber", "deck", n=sk.n("cyl")))
    # the kingpin, the bushings, the cup washer and the nut
    kp = sk.n("cyl")
    ob.append(sk.bk.cyl_ax(f"kingpin_{tag}", K(-0.009), d, 0.0047, 0.068 * sc, "steel", "deck", n=max(6, kp // 2)))
    if lod == "near":
        tb = [(0.0094, -0.0055), (0.0101, -0.0047), (0.0104, 0.004), (0.0098, 0.0053)]
        ob.append(sk.lathe_ax(f"bush_t_{tag}", [(0.0049, tb[0][1])] + tb + [(0.0049, tb[-1][1])], K(-0.0112), -d, kp, "rubber", "deck", angle=50))
        bb = [(0.0098, -0.0048), (0.0108, -0.0036), (0.0110, 0.0036), (0.0104, 0.0048)]
        ob.append(sk.lathe_ax(f"bush_b_{tag}", [(0.0049, bb[0][1])] + bb + [(0.0049, bb[-1][1])], K(0.0105), d, kp, "rubber", "deck", angle=50))
        ob.append(sk.lathe_ax(f"cup_{tag}", [(0.0049, -0.0008), (0.0124, -0.0014), (0.0128, 0.0002), (0.0118, 0.0008), (0.0049, 0.0008)], K(0.016), d, kp, "steel", "deck", angle=40))
        ob.append(sk.hex_nut(f"knut_{tag}", K(0.0202), d, 0.0143, 0.0068 * sc, "steel", "deck"))
        ob.append(sk.lathe_ax(f"cup_t_{tag}", [(0.0049, -0.0007), (0.0118, -0.0007), (0.0122, 0.0007), (0.0049, 0.0007)], K(-0.0172), d, kp, "steel", "deck", angle=40))
    else:
        ob.append(sk.bk.cyl_ax(f"bush_{tag}", K(0.0), d, 0.0106 * sc, 0.034 * sc, "rubber", "deck", n=max(6, kp)))
    # the riser
    if s["riser"] > 0:
        rp = kit.round_poly([(xb - Lp / 2 - 0.001, -Wp / 2 - 0.001), (xb + Lp / 2 + 0.001, -Wp / 2 - 0.001), (xb + Lp / 2 + 0.001, Wp / 2 + 0.001), (xb - Lp / 2 - 0.001, Wp / 2 + 0.001)], 0.01, 3 if lod == "near" else 1)
        ob.append(kit.prism(f"riser_{tag}", rp, zt, zt + s["riser"] + 0.0004, "rubber", "deck", axis="z"))
    # the bolts: heads on top through the grip, nuts under the plate
    bolts = [(xb + a * hole / 2, b * 0.8125 * 0.0254) for a in (-1, 1) for b in (-1, 1)]
    if lod == "near":
        for bx, by in bolts:
            top = S.at(bx, by)
            nn = S.normal(bx, by)
            ob.append(sk.bolt_head(f"bolt_{tag}", top, nn, 0.0047, "steel", "deck"))
            ob.append(sk.hex_nut(f"nut_{tag}", V((bx, by, zt - 0.0052 - 0.0034)), (0, 0, 1), 0.0095, 0.0066, "steel", "deck"))
    return ob, dict(xb=xb, R=R, d=d, K=K, P=P, yh=yh, bolts=bolts, Lp=Lp, Wp=Wp)


def wheel(s, c, sy, tag):
    """A wheel at c on its axle (sy +1: the left one): the urethane's rounded profile, the bearings' shields and
    races, the outer speed washer and the axle nut."""
    R, W, lip = s["wheel"]
    lod = sk.LOD
    grp = f"wheel_{tag}"
    ob = []
    rb = 0.0111
    if lod == "near":
        rh, rr_ = W * lip, W * lip * 0.85
        hf = W / 2 - 0.0009
        side = [(rb, -(W / 2 - 0.0019)), (rb + 0.0017, -hf)]
        lipp = []
        for f in (0, 30, 60, 90):
            a = math.radians(f)
            lipp.append((R - 0.0004 - rr_ + rr_ * math.sin(a), -W / 2 + rh * (1 - math.cos(a))))
        # (the crown: the contact patch's middle exactly r)
        prof = side + lipp + [(R, 0.0)] + [(x, -h) for x, h in lipp[::-1]] + [(x, -h) for x, h in side[::-1]]
        prof.append(prof[0])
        nseg = sk.n("wheel")
    else:
        prof = [(rb, -W / 2 + 0.002), (R - W * lip * 0.8, -W / 2), (R, -W / 2 + W * lip * 0.7), (R, W / 2 - W * lip * 0.7), (R - W * lip * 0.8, W / 2), (rb, W / 2 - 0.002)]
        nseg = sk.n("wheel")
    o = sk.lathe_ax(f"wheel_{tag}", prof, c, (0, 1, 0), nseg, "urethane", grp, cap=False, angle=38)
    sk.fix_normals(o)
    ob.append(o)
    if lod == "near":
        nb = sk.n("bear")
        for face in (1, -1):
            hs = face * (W / 2 - 0.0021)
            ob.append(annulus(f"shield_{tag}", c + V((0, hs, 0)), face, 0.0058, rb + 0.0002, nb, "bearing", grp))
            ob.append(annulus(f"race_{tag}", c + V((0, hs + face * 0.0005, 0)), face, 0.0041, 0.0059, 12, "steel", grp))
        # outside: a speed washer and the axle nut
        ob.append(annulus(f"wash_out_{tag}", c + V((0, sy * (W / 2 + 0.0012), 0)), sy, 0.0041, 0.0065, 14, "steel", grp))
        ob.append(sk.hex_nut(f"axnut_{tag}", c + V((0, sy * (W / 2 + 0.0013 + 0.0032), 0)), (0, 1, 0), 0.0127, 0.0062, "steel", grp, hole=0.0036))
    return ob


def annulus(name, c, face, r0, r1, nseg, kind, grp):
    """A flat ring across the axle (in x-z) at c, facing ±y."""
    verts, faces = [], []
    for i in range(nseg):
        a = 2 * math.pi * i / nseg
        for r in (r0, r1):
            verts.append(V((c.x + r * math.cos(a), c.y, c.z + r * math.sin(a))))
    for i in range(nseg):
        j = (i + 1) % nseg
        faces.append((2 * i, 2 * i + 1, 2 * j + 1, 2 * j))
    o = sk.mk(name, verts, faces, kind, grp, smooth=False)
    for p in o.data.polygons:
        if p.normal.y * face < 0:
            p.flip()
    return o


# ── the board ────────────────────────────────────────────────────────────────────────────────────────────────


def build(vid):
    s = spec(vid)
    B = Board()
    H, S, xk_t, xk_n = deck_frame(s)
    half, ct, cn, hwf = outline(s)
    obs, dinfo = make_deck(s, S, half, ct, cn)
    r, W = s["wheel"][0], s["wheel"][1]
    ax_f, ax_r = s["wb"] / 2, -s["wb"] / 2
    thick = s["thick"]
    lod = sk.LOD
    wdeck = lambda x: half_width(half, x)  # noqa: E731
    bot = lambda x, y: bottom_at(S, thick, x, y)  # noqa: E731
    topl = lambda x, y: (S.at(x, y), S.normal(x, y))  # noqa: E731
    L, wm, x_t = s["x_n"] - s["x_t"], s["wm"], s["x_t"]
    uv_print = lambda x, y: ((x - x_t) / L, (-y + wm / 2) / wm)  # noqa: E731
    yw = s["tw"] / 2 - 0.0075 - W / 2
    tinfo = {}
    if lod != "far":
        for xa, sgn, tag in ((ax_f, 1, "f"), (ax_r, -1, "r")):
            o, ti = truck(s, xa, sgn, tag, H, S)
            obs += o
            tinfo[tag] = ti
            for sy, side in ((1, "l"), (-1, "r")):
                obs += wheel(s, V((xa, sy * yw, r)), sy, tag + side)
    else:
        for xa in (ax_f, ax_r):
            for sy in (1, -1):
                obs.append(sk.bk.cyl_ax("far_wheel", V((xa, sy * yw, r)), (0, 1, 0), r, W, "urethane", "deck", n=6))
            obs.append(sk.bk.cyl_ax("far_truck", V((xa, 0, r + 0.012)), (0, 1, 0), 0.008, 2 * yw - W, "alloy", "deck", n=4))
    # the extras
    nst = sk.n("nt")
    if lod != "far":
        if s.get("skid"):
            xs0 = s["x_t"] + (s["tail"][2] + 0.008 if s["tail"][0] == "fish" else 0.004)
            xe = s["x_t"] + 0.165
            ins = 0.0075

            def wsk(x):
                w = wdeck(x) - ins - s["e"]
                rr_ = 0.022
                if x > xe - rr_:
                    w = min(w, (w - 0.0) * math.sqrt(max(0.0, 1 - ((x - (xe - rr_)) / rr_) ** 2)) + 0.0)
                    w = max(0.0, w)
                return w

            xs = dense_rows(xs0, xe, wsk, 0.012 if lod == "near" else 0.04)
            obs += strip_plate("skid", xs, wsk, bot, 0.0032, "plastic", "deck", 9 if lod == "near" else 4, uv=None)
        if s.get("slick"):
            xs = dense_rows(s["x_t"] + 0.003, s["x_n"] - 0.003, lambda x: wdeck(x) - s["e"] - 0.0012, 0.03 if lod == "near" else 0.06)
            obs += strip_plate("slick", xs, lambda x: wdeck(x) - s["e"] - 0.0012, bot, 0.0016, "graphic", "deck", 9 if lod == "near" else nst, side_kind="plastic", uv=uv_print)
        if s.get("rails"):
            for sy in (1, -1):
                yr = sy * 0.079
                xs = [-0.158 + 0.316 * i / (10 if lod == "near" else 3) for i in range((10 if lod == "near" else 3) + 1)]
                pts, rad = [], []
                for i, x in enumerate(xs):
                    p, nn = bot(x, yr)
                    end = i in (0, len(xs) - 1)
                    b = 0.0042
                    pts.append(p + nn * (b - 0.0012))
                    rad.append((0.0078 * (0.75 if end else 1.0), b * (0.8 if end else 1.0)))
                # (rounded ends)
                p0, p1 = pts[0], pts[-1]
                t0 = (pts[1] - pts[0]).normalized()
                pts = [p0 - t0 * 0.004] + pts + [p1 + t0 * 0.004]
                rad = [(0.004, 0.0022)] + rad + [(0.004, 0.0022)]
                obs.append(sk.sweep("rail", pts, rad, "plastic", "deck", n=sk.n("sweep"), up=(0, 0, 1)))
                if lod == "near":
                    for x in (-0.13, 0.0, 0.13):
                        p, nn = bot(x, yr)
                        o = annulus("rail_screw", V((0, 0, 0)), 1, 0.0006, 0.0026, 8, "steel", "deck")
                        o.data.transform(Matrix.Translation(p + nn * (2 * 0.0042 - 0.0012 + 0.0003)) @ Matrix.Rotation(-math.pi / 2, 4, "X"))
        if s.get("ribs"):
            for yr in (-0.062, -0.025, 0.025, 0.062):
                xs = [-0.13 + 0.26 * i / (8 if lod == "near" else 2) for i in range((8 if lod == "near" else 2) + 1)]
                pts = [bot(x, yr)[0] + bot(x, yr)[1] * 0.0022 for x in xs]
                obs.append(sk.sweep("rib", pts, (0.0022, 0.0034), "paint", "deck", n=max(4, sk.n("sweep") // 2), up=(0, 0, 1)))
        if s.get("nose_guard"):
            obs.append(nose_guard(s, S, dinfo))
        if s.get("lapper"):
            obs.append(lapper(s, tinfo["r"], ax_r))
        if s["grip"] == "pads":
            uvg = lambda x, y: (x, y)  # noqa: E731
            for x0, x1 in ((ax_f - 0.075, ax_f + 0.07), (xk_t - 0.08, ax_r + 0.04)):
                wpad = s["wm"] / 2 - 0.022

                def wp(x, x0=x0, x1=x1, w=wpad):
                    rr_ = 0.014
                    ww = min(w, wdeck(x) - 0.02)
                    d = max(x0 + rr_ - x, x - (x1 - rr_), 0.0)
                    return ww - rr_ + rr_ * math.sqrt(max(0.0, 1 - (d / rr_) ** 2)) if d > 0 else ww

                xs = dense_rows(x0, x1, wp, 0.012 if lod == "near" else 0.06)

                obs += strip_plate("pad", xs, wp, topl, 0.0009, "grip", "deck", 7 if lod == "near" else 3, uv=uvg)
    # the pivots and points
    B.pivots = {
        "deck": (V((0, 0, H)), None, "root"),
        "hanger_f": (V((ax_f, 0, r)), None, "deck"),
        "hanger_r": (V((ax_r, 0, r)), None, "deck"),
        "wheel_fl": (V((ax_f, yw, r)), None, "hanger_f"),
        "wheel_fr": (V((ax_f, -yw, r)), None, "hanger_f"),
        "wheel_rl": (V((ax_r, yw, r)), None, "hanger_r"),
        "wheel_rr": (V((ax_r, -yw, r)), None, "hanger_r"),
    }
    ih = dinfo["inset_half"]
    e = s["e"]
    x_tail_c = s["x_t"] + (s["tail"][2] if s["tail"][0] == "fish" else 0.0)
    xb_f = ax_f + 0.006 * s["ts"]
    xb_r = ax_r - 0.006 * s["ts"]

    def top(x, y=0.0):
        return S.at(x, y)

    def edge(x, side):
        """The middle of the deck's edge (its thickness) at x on a side (+1 left / heel, −1 right / toe)."""
        w = half_width(ih, x)
        p = S.at(x, side * w)
        nn = S.normal(x, side * w)
        o = V((0, side, 0))
        o = (o - nn * o.dot(nn)).normalized()
        return p + o * e - nn * thick / 2

    def tip(x, dirn):
        p = S.at(x, 0)
        nn = S.normal(x, 0)
        o = V((dirn, 0, 0))
        o = (o - nn * o.dot(nn)).normalized()
        return p + o * e - nn * thick / 2

    x_nt = s["x_n"] - e
    x_tt = x_tail_c + e
    pts = {
        "deck": (top(0.0), "deck"),
        "nose": (top(x_nt), "deck"),
        "tail": (top(x_tt), "deck"),
        "bolts_f": (top(xb_f), "deck"),
        "bolts_r": (top(xb_r), "deck"),
        "foot_f": (top(xb_f), "deck"),
        "foot_r": (top(xk_t - 0.032), "deck"),
        "axle_f": (V((ax_f, 0, r)), "hanger_f"),
        "axle_r": (V((ax_r, 0, r)), "hanger_r"),
        "grab_nose": (tip(x_nt, 1), "deck"),
        "grab_tail": (tip(x_tt, -1), "deck"),
        "grab_toe": (edge(0.0, -1), "deck"),
        "grab_heel": (edge(0.0, 1), "deck"),
        "grab_toe_f": (edge((xb_f + s["x_n"]) / 2, -1), "deck"),
        "grab_heel_f": (edge((xb_f + s["x_n"]) / 2, 1), "deck"),
        "grab_toe_r": (edge((xb_r + s["x_t"]) / 2, -1), "deck"),
        "grab_heel_r": (edge((xb_r + s["x_t"]) / 2, 1), "deck"),
    }
    B.points = pts
    # the measures
    full = full_of(half)
    area = abs(sum(full[i][0] * full[(i + 1) % len(full)][1] - full[(i + 1) % len(full)][0] * full[i][1] for i in range(len(full)))) / 2
    m_deck = area * thick * (720 if s["bottom"] != "paint" else 980)
    m_trucks = 2 * (0.36 if s["shape"] == "street" else 0.42)
    m_wheels = 4 * (math.pi * r * r * W * 0.85 * 1150 + 0.024)
    B.info = dict(
        H=H, S=S, half=half, xk_t=xk_t, xk_n=xk_n, yw=yw, area=area,
        mass=round(m_deck + m_trucks + m_wheels + (0.12 if s.get("rails") else 0) + (0.08 if s.get("skid") else 0), 2),
        kick={
            "nose": {"angle": round(math.radians(s["kick_n"][0]), 4), "len": round(s["x_n"] - xk_n, 3)},
            "tail": {"angle": round(math.radians(s["kick_t"][0]), 4), "len": round(xk_t - s["x_t"], 3)},
        },
        trucks=tinfo, deck=dinfo,
    )
    return B, obs


def dense_rows(x0, x1, wfun, step):
    """Rows from x0 to x1 at `step`, closer where the width changes fast (a plate's rounded ends)."""
    xs = [x0]
    x = x0
    while x < x1 - 1e-6:
        st = step
        for _ in range(6):
            if abs(wfun(min(x1, x + st)) - wfun(x)) > step * 0.6:
                st *= 0.5
        x = min(x1, x + max(st, 0.0015))
        xs.append(x)
    return xs


def nose_guard(s, S, dinfo):
    """The nose guard: a plastic bumper wrapped round the nose's edge (a swept oval over the plies)."""
    T, Nn, ring, outs, G = dinfo["T"], dinfo["N"], dinfo["ring"], dinfo["outs"], dinfo["G"]
    nt = len(G[0])
    x_from = s["x_n"] - 0.058
    sel = [(k, ring[k]) for k in range(len(ring)) if G[ring[k][0]][ring[k][1]][0] > x_from]
    # (in order round the nose: the ring runs up the left side and back down the right — sorted by angle)
    cx = s["x_n"] - 0.08
    sel.sort(key=lambda kij: math.atan2(G[kij[1][0]][kij[1][1]][1], G[kij[1][0]][kij[1][1]][0] - cx))
    pts, rad = [], []
    th = s["thick"]
    for q, (k, (i, j)) in enumerate(sel):
        idx = i * nt + j
        p = T[idx] + outs[k] * (s["e"] + 0.0012) - Nn[idx] * th / 2
        pts.append(p)
        endk = min(q, len(sel) - 1 - q)
        f = min(1.0, 0.55 + 0.15 * endk)
        rad.append((0.0055 * f, (th / 2 + 0.0026) * f))
    tip = (s["x_n"], 0)
    up = S.normal(*tip)
    return sk.sweep("nose_guard", pts, rad, "plastic", "deck", n=sk.n("sweep") + 2, up=up)


def lapper(s, ti, ax_r):
    """The lapper: a plastic cam on the back truck, from the deck's bottom down over the kingpin's nut, on the
    board's middle side — it slides the truck over coping."""
    K, P = ti["K"], ti["P"]
    sc = s["ts"]
    a = P(0.046, s["th"] / sc - 0.002)
    b = P(0.044, s["th"] / sc * 0.55)
    c = K(0.02) + V((0.004 * sc, 0, 0.004))  # (the back truck: its middle side is +x)
    dd = K(0.026) + V((0.0, 0, 0.004))
    pts = sk.bk.bez(a, b, c, dd, 8 if sk.near() else 3)
    n_ = len(pts)
    rad = []
    for i in range(n_):
        t = i / (n_ - 1)
        w = 0.016 * (1 - 0.35 * t) * (0.6 + 0.4 * math.sin(math.pi * min(1, t * 1.6 + 0.2)))
        rad.append((max(0.004, w), max(0.003, 0.009 * math.sin(math.pi * (0.15 + 0.85 * t)))))
    return sk.sweep("lapper", pts, rad, "plastic", "deck", n=sk.n("sweep"), up=(1, 0, 0))


def collider(B, s):
    """A box round the board (never drawn)."""
    H = B.info["H"]
    hw = max(p[1] for p in B.info["half"]) + 0.002
    zt = max(B.points["nose"][0].z, B.points["tail"][0].z) + 0.002
    return kit.box("collider", ((s["x_n"] + s["x_t"]) / 2, 0, zt / 2), (s["x_n"] - s["x_t"], 2 * max(hw, s["tw"] / 2), zt), "collider", "collider")

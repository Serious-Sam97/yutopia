# Plan 73 phase 5 (after 5.6) — the life look's glasses and extras, made by script: small worn things put
# together from tubes (a glasses' rims and arms, straps, a scarf), rounded boxes (bags, a watch's face, a
# walkman) and rings, placed off the body's own landmarks — the eyes, the ears, the neck, the wrists, the
# chest, the back, the waist — and laid onto its surface where they lie on it (a strap across the chest,
# a necklace down it). Each vertex goes with the body vertex nearest it (its weights, the other bodies'
# moves): a bag rides the back, a watch the wrist; the glasses ride the head whole.
#
# Units are MakeHuman's (decimetres, y up, facing +z, the person's left +x).
import numpy as np

from wear import ARM_L, ARM_R, HEAD, TORSO, ears

# the glasses: their rims' half width and height, the frame's thickness, a cat-eye's lift at the outer
# top, an aviator's drop toward the nose below, `half` only the rim's top, `lens` dark lenses, `strap` a
# goggles' band round the head instead of arms
EYEWEAR = {
    "glasses": {"w": 0.25, "h": 0.17, "t": 0.019, "k": 3.4},
    "round": {"w": 0.22, "h": 0.22, "t": 0.017},
    "sunglasses": {"w": 0.27, "h": 0.19, "t": 0.028, "k": 3.0, "lens": True},
    "aviators": {"w": 0.28, "h": 0.17, "t": 0.012, "drop": 0.13, "lens": True},
    "cateye": {"w": 0.26, "h": 0.16, "t": 0.028, "k": 3.0, "lift": 0.11},
    "halfrim": {"w": 0.25, "h": 0.16, "t": 0.022, "k": 3.4, "half": True},
    # (snow goggles: one wide lens across both eyes, a padded frame, a band round the head)
    "goggles": {"w": 0.7, "h": 0.23, "t": 0.045, "k": 3.0, "lens": True, "strap": True, "one": True, "out": 0.1},
}
WRAP = 0.28  # how much the front bends back round the face toward the temples (dm per dm²)
EXTRAS = [
    "walkman", "scarf", "earrings", "necklace", "backpack", "watch", "crossbody",
    "mittens", "bracelets", "tie", "lanyard", "tote", "fannypack", "satchel",
]  # fmt: skip
OVER = 0.2  # how far off the tights a thing lies over the clothes (a sweater's 0.15)
COAT = 0.45  # …and over a coat: the build's `coat` shape (the game sets it by what's worn's thickness)


def _tube(pts, radii, sides=6, closed=False):
    """A tube along a polyline (closed: a loop): (positions, quads), its ends capped."""
    pts = np.asarray(pts, float)
    n = len(pts)
    P, F = [], []
    prev = None
    for i in range(n):
        if closed:
            d = pts[(i + 1) % n] - pts[(i - 1) % n]
        else:
            d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        d /= max(np.linalg.norm(d), 1e-9)
        # (the frame carried along — parallel transport — so the tube doesn't twist)
        ref = prev if prev is not None else (np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0]))
        e1 = ref - d * (ref @ d)
        if np.linalg.norm(e1) < 1e-6:
            e1 = np.cross(d, [1.0, 0, 0])
        e1 /= np.linalg.norm(e1)
        prev = e1
        e2 = np.cross(d, e1)
        for k in range(sides):
            a = 2 * np.pi * k / sides
            P.append(pts[i] + (np.cos(a) * e1 + np.sin(a) * e2) * radii[i])
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for k in range(sides):
            k2 = (k + 1) % sides
            F.append([i * sides + k, i * sides + k2, j * sides + k2, j * sides + k])
    if not closed:
        for end, i in ((0, 0), (1, n - 1)):
            tip = len(P)
            P.append(pts[i])
            ring = [i * sides + k for k in range(sides)]
            for k in range(sides):
                a, b = ring[k], ring[(k + 1) % sides]
                F.append([b, a, tip] if end == 0 else [a, b, tip])
    return np.array(P), F


def _band(pts, normals, width, thick):
    """A flat strap along `pts`: `width` across, `thick` through, lying on the surface whose outward
    normal at each point is `normals`' — its ends closed."""
    pts = np.asarray(pts, float)
    n = len(pts)
    P, F = [], []
    for i in range(n):
        d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        d /= max(np.linalg.norm(d), 1e-9)
        nn = np.asarray(normals[i], float)
        nn = nn - d * (nn @ d)
        nn /= max(np.linalg.norm(nn), 1e-9)
        ew = np.cross(d, nn)
        for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P.append(pts[i] + ew * a * width / 2 + nn * b * thick / 2)
    for i in range(n - 1):
        for k in range(4):
            k2 = (k + 1) % 4
            F.append([i * 4 + k, i * 4 + k2, (i + 1) * 4 + k2, (i + 1) * 4 + k])
    F.append([3, 2, 1, 0])
    e = (n - 1) * 4
    F.append([e, e + 1, e + 2, e + 3])
    return np.array(P), F


def _box(c, half, ex=(1, 0, 0), ey=(0, 1, 0), round_=0.3, n=6, taper=0.0):
    """A box of half sides `half` along `ex`, `ey` and their cross, its edges rounded — `round_` of its
    smallest half side — and narrower at its top by `taper` (a bag's): one welded, smooth surface."""
    ex, ey = np.asarray(ex, float), np.asarray(ey, float)
    ex = ex / np.linalg.norm(ex)
    ey = ey - ex * (ey @ ex)
    ey /= np.linalg.norm(ey)
    ez = np.cross(ex, ey)
    half = np.asarray(half, float)
    rr = min(half) * min(round_, 0.98)
    X, Y, Z = np.eye(3)
    # (the grid closer together toward the edges, where it bends)
    g = np.sign(np.linspace(-1, 1, n + 1)) * np.abs(np.linspace(-1, 1, n + 1)) ** 0.7
    P, F, key = [], [], {}
    for u, v, w in ((X, Y, Z), (-X, Y, -Z), (Z, Y, -X), (-Z, Y, X), (X, -Z, Y), (X, Z, -Y)):
        ids = np.zeros((n + 1, n + 1), dtype=int)
        for i in range(n + 1):
            for j in range(n + 1):
                q = (u * g[i] + v * g[j] + w) * half
                k = tuple(np.round(q, 6))
                if k not in key:
                    inner = np.clip(q, -(half - rr), half - rr)
                    d = q - inner
                    p = inner + d / max(np.linalg.norm(d), 1e-9) * rr if rr > 0 else q
                    p[0] *= 1 - taper * (p[1] / half[1] + 1) / 2
                    key[k] = len(P)
                    P.append(c + ex * p[0] + ey * p[1] + ez * p[2])
                ids[i, j] = key[k]
        for i in range(n):
            for j in range(n):
                F.append([ids[i, j], ids[i + 1, j], ids[i + 1, j + 1], ids[i, j + 1]])
    return np.array(P), F


def _ring(c, rx, ry, tube, ax=(1, 0, 0), ay=(0, 1, 0), seg=28, sides=6, start=0.0, end=1.0, shape=None):
    """A ring round `c` in the plane of `ax`, `ay` (radii rx, ry; `shape(θ)` scales them) — whole, or
    the arc from `start` to `end` (turns)."""
    ax, ay = np.asarray(ax, float), np.asarray(ay, float)
    whole = end - start >= 1.0
    pts = []
    for k in range(seg if whole else seg + 1):
        th = 2 * np.pi * (start + (end - start) * k / seg)
        sx, sy = shape(th) if shape else (1.0, 1.0)
        pts.append(c + ax * np.cos(th) * rx * sx + ay * np.sin(th) * ry * sy)
    return _tube(pts, [tube] * len(pts), sides, closed=whole)


def _merge(pieces):
    P, F = [], []
    for p, f in pieces:
        b = sum(len(x) for x in P)
        P.append(np.asarray(p))
        F += [[b + i for i in face] for face in f]
    return np.vstack(P), F


def make_prop(kind, name, V, F0, Z, J, over=OVER):
    """A prop's pieces: [(suffix, positions, faces, each vertex's source on the body, dark)] — `dark` a
    glasses' lenses (the game draws them dark, not in the wearer's colour). `over`: how far off the tights
    what lies on the clothes sits (OVER; the build's `coat` shape, the same made over a coat — COAT)."""
    kind_v, t = Z[0], Z[1]
    body = np.zeros(len(V), dtype=bool)
    body[sorted({v for f in F0 if f[2] == "body" for v in f[0]})] = True
    tights = np.zeros(len(V), dtype=bool)
    tights[sorted({v for f in F0 if f[2] == "helper-tights" for v in f[0]})] = True
    head = np.where(body & (kind_v == HEAD))[0]
    trunk = np.where(tights & (kind_v == TORSO))[0]
    # (the neck and the trunk round the neck's axis: the tights, the head's own skin above them)
    round_ = np.where((tights & (kind_v == TORSO)) | (body & (kind_v == HEAD)))[0]
    x0, z0 = J["neck"][0], J["neck"][2]
    ang = np.arctan2(V[round_, 0] - x0, V[round_, 2] - z0)  # 0 the front, +π/2 the left
    rad = np.hypot(V[round_, 0] - x0, V[round_, 2] - z0)
    out = []

    def radius_at(th, y, dy=0.1, da=0.18):
        """How far the body's surface is off the neck's axis at the angle `th` round it, at height y."""
        m = (np.abs(V[round_, 1] - y) < dy) & (np.abs(np.angle(np.exp(1j * (ang - th)))) < da)
        if not m.any():
            return radius_at(th, y, dy * 2, da * 1.5)
        return np.percentile(rad[m], 90)

    def on(th, y, gap):
        r = radius_at(th, y) + gap
        return np.array([x0 + np.sin(th) * r, y, z0 + np.cos(th) * r])

    def nearest(p, among):
        return among[np.argmin(np.linalg.norm(V[among] - p, axis=1))]

    def piece(suffix, P, F, src_of=None, among=None, dark=False):
        among = trunk if among is None else among
        if src_of is not None:
            src = np.full(len(P), src_of)
        else:
            src = np.array([nearest(p, among) for p in P])
        out.append((suffix, np.asarray(P), F, src, dark))

    eL, eR = (np.asarray(e) for e in ears(V, Z, J))
    if kind == "eyewear":
        s = EYEWEAR[name]
        w, h, th_ = s["w"], s["h"], s["t"]
        ey = (J["eyeL"][1] + J["eyeR"][1]) / 2 + 0.02
        mx = (J["eyeL"][0] + J["eyeR"][0]) / 2
        # (in front of the face's front at the eyes — the nose's bridge — and of the eyes)
        near = head[(np.abs(V[head, 1] - ey) < 0.1) & (np.abs(V[head, 0] - mx) < 0.3)]
        z = max(V[near, 2].max() + 0.02, max(J["eyeL"][2], J["eyeR"][2]) + 0.24) + s.get("out", 0.0)
        top = head[np.argmax(V[head, 1])]  # (the head's crown: still under the face's own moves)
        gap = 0.085

        def shape(th, side):
            # (the right's mirrored: its outer side is −x)
            c, sn = np.cos(th) * side, np.sin(th)
            sy, sx = 1.0, 1.0
            if s.get("lift"):
                # (the top edge rising toward the outer corner, swept up there — a lift added in height)
                if sn > 0:
                    sy += s["lift"] / h * np.clip((c + 0.3) / 1.3, 0, 1) ** 2.5 * min(1.0, sn * 3) / max(sn, 1e-3)
            if s.get("drop"):
                # (an aviator: flat along its top, deep below toward the nose — a teardrop)
                sy = 0.8 if sn > 0 else 1.0 + s["drop"] / h * (0.5 + 0.5 * max(0.0, -c)) * min(1.0, -sn * 1.6)
                sx = 1.0 + 0.06 * max(0.0, sn)
            if s.get("k"):
                # (soft rectangles: a superellipse)
                k = s["k"]
                ca, sa = abs(np.cos(th)), abs(np.sin(th))
                r = (ca**k + sa**k) ** (-1 / k)
                return sx * r, sy * r
            return sx, sy

        def wrap(P):
            P = np.array(P, float)
            P[:, 2] -= WRAP * (P[:, 0] - mx) ** 2
            return P

        parts = []
        lens = []
        rims = [(mx, 1)] if s.get("one") else [(mx + side * (gap + w), side) for side in (1, -1)]
        for cx, side in rims:
            c = np.array([cx, ey, z])
            sh = lambda a, side=side: shape(a, side)  # noqa: E731
            if s.get("half"):
                RP, RF = _ring(c, w, h, th_, start=0.0, end=0.5, shape=sh, sides=5, seg=40)
                # (a half-rim's lens held below by a fine wire)
                WP, WF = _ring(c, w * 0.99, h * 0.99, 0.006, start=0.5, end=1.0, shape=sh, sides=4, seg=40)
                parts.append((wrap(WP), WF))
            else:
                RP, RF = _ring(c, w, h, th_, shape=sh, sides=6 if s.get("one") else 5, seg=56)
            parts.append((wrap(RP), RF))
            if s.get("lens"):
                ring = []
                for a in np.linspace(0, 2 * np.pi, 48, endpoint=False):
                    sx, sy = sh(a)
                    ring.append(c + np.array([np.cos(a) * w * sx * 0.97, np.sin(a) * h * sy * 0.97, -0.006]))
                LP = wrap(np.vstack([[c + np.array([0, 0, 0.004])], ring]))
                LF = [[0, 1 + k, 1 + (k + 1) % 48] for k in range(48)] + [[0, 1 + (k + 1) % 48, 1 + k] for k in range(48)]
                lens.append((LP, LF))
        # the arms (the goggles' band's sides) from the rims' outer edges back along the head's sides to
        # over the ears, and down behind them
        for side in (1, -1):
            ear = eL if side > 0 else eR
            edge = mx + side * (w * 0.97 if s.get("one") else gap + 2 * w * 0.985)
            start = wrap([[edge, ey + (0.0 if s.get("one") else 0.03), z - 0.01]])[0]
            pts = [start]
            for u in np.linspace(0.15, 1.0, 6):
                zz = start[2] + (ear[2] - 0.05 - start[2]) * u
                band = head[(np.abs(V[head, 1] - ey) < 0.1) & (np.abs(V[head, 2] - zz) < 0.1) & ((V[head, 0] - mx) * side > 0)]
                xx = np.abs(V[band, 0] - mx).max() if len(band) else abs(start[0] - mx)
                xx = max(xx + (0.1 if s.get("strap") else 0.035), abs(pts[-1][0] - mx) - 0.02 * u)
                pts.append(np.array([mx + side * xx, start[1] - 0.03 * u, zz]))
            if s.get("strap"):
                continue
            pts.append(pts[-1] + np.array([-side * 0.02, -0.22, -0.12]))
            parts.append(_tube(pts, [th_ * 0.75] * len(pts), 5))
        if not s.get("one"):
            # the bridge over the nose (an aviator's a second bar above it)
            for dy, sag, reach in ((h * 0.25, 0.035, 0.005),) + (((h * 0.62, -0.005, w * 0.32),) if s.get("drop") else ()):
                b0 = np.array([mx + gap + reach, ey + dy, z])
                b1 = np.array([mx - gap - reach, ey + dy, z])
                BP, BF = _tube([b0, (b0 + b1) / 2 + np.array([0, sag, 0.005]), b1], [th_ * 0.7] * 3, 5)
                parts.append((wrap(BP), BF))
        if s.get("strap"):
            # (a goggles' band: from the frame's sides round the back of the head, over the hair — flat)
            pts, nrm = [], []
            th0 = np.arctan2(w * 0.97, z - z0)
            for k in range(25):
                a = th0 + (2 * np.pi - 2 * th0) * k / 24
                p = on(a, ey, 0.11)
                pts.append(p)
                nrm.append(np.array([np.sin(a), 0, np.cos(a)]))
            # (its ends onto the frame's sides)
            pts[0] = wrap([[mx + w * 0.97, ey, z - 0.02]])[0]
            pts[-1] = wrap([[mx - w * 0.97, ey, z - 0.02]])[0]
            parts.append(_band(pts, nrm, 0.25, 0.03))
        P, F = _merge(parts)
        piece("", P, F, src_of=top)
        if lens:
            P, F = _merge(lens)
            piece("lens", P, F, src_of=top, dark=True)
        return out

    # ---- the extras
    neck_y = J["neck"][1]
    chest_y = (neck_y + J["waist"][1]) / 2
    waist_y = J["waist"][1] - 0.7
    # (the chin, by the head's proportions off the eyes — the head's weights reach down the neck — and
    # the neck's base: its joint)
    chin_y = (J["eyeL"][1] + J["eyeR"][1]) / 2 - 1.15
    hand = {S: np.where(body & (kind_v == (ARM_L if S == "L" else ARM_R)) & (t > 2.0))[0] for S in "LR"}
    arm = {S: np.where(body & (kind_v == (ARM_L if S == "L" else ARM_R)))[0] for S in "LR"}
    # (the shoulders' tops: the tights' highest three quarters out to the shoulder's joint)
    shoulder = {}
    for S in "LR":
        sx = x0 + (J[f"shoulder{S}"][0] - x0) * 0.6
        # (the tights whatever their kind: the shoulder's top is the arm's)
        tt = np.where(tights)[0]
        m = tt[np.abs(V[tt, 0] - sx) < 0.06]
        top = m[np.argmax(V[m, 1])]
        shoulder[S] = np.array([sx, V[top, 1] + over, V[top, 2]])
    import os

    if os.environ.get("PROPS_DEBUG") and name == "scarf":
        print("PD eyes", J["eyeL"][1], "neck", neck_y, "chin", chin_y, "chest", chest_y, "waist", J["waist"][1], "hip", J["hip"][1], "shoulders", shoulder["L"], shoulder["R"], "trunk top", V[trunk, 1].max())

    def normal(p):
        """Out of the body at p: round the neck's axis, turning up over the shoulders."""
        q = np.array([p[0] - x0, 0.0, p[2] - z0])
        q /= max(np.linalg.norm(q), 1e-9)
        k = np.clip((p[1] - (shoulder["L"][1] - 0.9)) / 0.6, 0, 1)
        q = q * (1 - k) + np.array([0, 1.0, 0]) * k
        return q / max(np.linalg.norm(q), 1e-9)

    def strap(pts, width=0.36, thick=0.04):
        return _band(pts, [normal(p) for p in pts], width, thick)

    def wrist(S, back):
        """The forearm's axis at `back` up from the wrist, across it, and its radius there."""
        e, wj = J[f"elbow{S}"], J[f"wrist{S}"]
        ax = (wj - e) / np.linalg.norm(wj - e)
        c = wj - ax * back
        d = V[arm[S]] - c
        along = d @ ax
        m = np.abs(along) < 0.08
        r = np.percentile(np.linalg.norm(d[m] - np.outer(along[m], ax), axis=1), 85) if m.any() else 0.3
        # (the arm's outer side across it: a watch's face, on the back of the wrist)
        sg = 1 if S == "L" else -1
        u = np.array([sg, 0, 0.0]) - ax * ax[0] * sg
        u /= np.linalg.norm(u)
        return c, ax, u, np.cross(ax, u), r

    def bagged(parts, n):
        """A bag's own piece (its first `n` parts, `-bag`: it swings on the pack's joint) and its straps."""
        P, F = _merge(parts[n:])
        piece("", P, F)
        P, F = _merge(parts[:n])
        piece("bag", P, F)

    def ring_band(c, r, u, v, ax, width, thick, seg=20):
        """A flat band round a limb (a watch's strap, a mitten's cuff)."""
        pts = [c + (u * np.cos(a) + v * np.sin(a)) * r for a in np.linspace(0, 2 * np.pi, seg + 1)]
        nrm = [u * np.cos(a) + v * np.sin(a) for a in np.linspace(0, 2 * np.pi, seg + 1)]
        return _band(pts, nrm, width, thick)

    if name in ("watch", "bracelets"):
        S = "L" if name == "watch" else "R"
        parts = []
        if name == "watch":
            c, ax, u, v, r = wrist(S, 0.25)
            parts.append(ring_band(c, r + 0.03, u, v, ax, 0.2, 0.035))
            parts.append(_box(c + u * (r + 0.09), (0.05, 0.21, 0.19), ex=u, ey=ax, round_=0.55, n=3))
        else:
            for k in range(3):
                c, ax, u, v, r = wrist(S, 0.15 + 0.12 * k)
                parts.append(_ring(c, r + 0.06 + 0.03 * k, r + 0.06 + 0.03 * k, 0.03, ax=u, ay=v, seg=22, sides=5))
        P, F = _merge(parts)
        piece("", P, F, among=arm[S])
    elif name == "mittens":
        parts = []
        for S in "LR":
            c, ax, u, v, r = wrist(S, 0.1)
            H = V[hand[S]]
            m = H.mean(0)
            # (round the hand along its own axes: an egg a little bigger than it)
            _, _, axes = np.linalg.svd(H - m, full_matrices=False)
            proj = (H - m) @ axes.T
            half = (proj.max(0) - proj.min(0)) / 2 + np.array([0.08, 0.1, 0.12])
            mid = m + axes.T @ ((proj.max(0) + proj.min(0)) / 2)
            th, ph = np.meshgrid(np.linspace(0, np.pi, 11), np.linspace(0, 2 * np.pi, 18, endpoint=False), indexing="ij")
            E = np.stack([np.cos(th), np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph)], -1).reshape(-1, 3)
            # (squarer than an egg: a mitten's)
            E = np.sign(E) * np.abs(E) ** 0.8
            MP = mid + (E * half[None]) @ axes
            MF = [[i * 18 + j, (i + 1) * 18 + j, (i + 1) * 18 + (j + 1) % 18, i * 18 + (j + 1) % 18] for i in range(10) for j in range(18)]
            parts.append((MP, MF))
            # a knitted cuff at the wrist
            parts.append(ring_band(c, r + 0.1, u, v, ax, 0.4, 0.12))
        P, F = _merge(parts)
        piece("", P, F, among=np.concatenate([hand["L"], hand["R"]]))
    elif name == "earrings":
        # (each hoop with its ear's lobe whole: point by point, the face's moves bent it)
        for e, sg in ((eL, 1), (eR, -1)):
            lobe = e + np.array([-sg * 0.03, -0.3, 0.07])
            P, F = _ring(lobe + np.array([0, -0.13, 0]), 0.13, 0.13, 0.016, ax=(0, 0, 1), ay=(0, 1, 0), seg=20, sides=5)
            piece("L" if sg > 0 else "R", P, F, src_of=nearest(lobe, head))
    elif name in ("necklace", "lanyard"):
        # a loop round the neck's base, falling on the chest, a pendant (the lanyard: a card) at its low
        y0 = neck_y + 0.15
        drop = 1.1 if name == "necklace" else 2.4
        gap = 0.08 if name == "necklace" else over
        pts = []
        for k in range(48):
            th = 2 * np.pi * k / 48 - np.pi  # (from the back round)
            f = max(0.0, np.cos(th))  # (1 at the front)
            pts.append(on(th * (1 - 0.3 * f), y0 - drop * f**2.5 - 0.05 * f, gap))
        if name == "necklace":
            P, F = _tube(pts, [0.02] * len(pts), 4, closed=True)
        else:
            pts.append(pts[0])
            P, F = _band(pts, [normal(p) for p in pts], 0.18, 0.02)
        low = on(0.0, y0 - drop - 0.12, gap + 0.03)
        if name == "necklace":
            BP, BF = _box(low + np.array([0, -0.09, 0]), (0.09, 0.12, 0.03), round_=0.8, n=3)
        else:
            BP, BF = _box(low + np.array([0, -0.45, 0.01]), (0.28, 0.44, 0.015), round_=0.15, n=2)
        P, F = _merge([(P, F), (BP, BF)])
        piece("", P, F)
    elif name == "scarf":
        # two wraps under the chin, both ends down the chest
        parts = []
        for k, (y, g) in enumerate(((chin_y - 0.3, 0.17), (chin_y - 0.66, 0.2))):
            pts = [on(2 * np.pi * i / 32, y - 0.08 * np.cos(2 * np.pi * i / 32) * k, g) for i in range(32)]
            parts.append(_tube(pts, [0.2] * 32, 8, closed=True))
        for th0, ln, dx in ((0.4, 3.4, 0.0), (0.18, 2.7, 0.0)):
            n_ = int(ln / 0.35) + 1
            pts = [on(th0 - 0.04 * i, chin_y - 0.75 - 0.35 * i, over + 0.12) for i in range(n_)]
            # (flat on the chest: a band)
            parts.append(_band(pts, [normal(p) for p in pts], 0.62, 0.12))
        P, F = _merge(parts)
        piece("", P, F, among=round_)
    elif name == "tie":
        top = neck_y - 0.05
        P, F = [], []
        rows = 15
        for i in range(rows):
            p = on(0.0, top - 0.12 - i * 0.3, 0.17)
            wd = 0.16 + 0.22 * i / (rows - 1)
            P += [p + np.array([-wd, 0, -0.015]), p + np.array([wd, 0, -0.015]), p + np.array([0, 0, 0.03])]
            if i:
                a = 3 * (i - 1)
                F += [[a, a + 2, a + 5, a + 3], [a + 2, a + 1, a + 4, a + 5], [a + 1, a, a + 3, a + 4]]
        tip = len(P)
        P.append(on(0.0, top - 0.12 - rows * 0.3 + 0.02, 0.18))
        a = 3 * (rows - 1)
        F += [[a, a + 2, tip], [a + 2, a + 1, tip], [a + 1, a, tip]]
        KP, KF = _box(on(0.0, top + 0.05, 0.2), (0.17, 0.14, 0.08), round_=0.6, n=3)
        P, F = _merge([(np.array(P), F), (KP, KF)])
        piece("", P, F)
    elif name == "backpack":
        yc = chest_y - 0.35
        bz = on(np.pi, yc, over)[2]
        half = (1.35, 1.9, 0.6)
        c = np.array([x0, yc, bz - half[2] + 0.05])
        parts = [_box(c, half, round_=0.7, taper=0.12)]
        parts.append(_box(c + np.array([0, -0.75, -half[2] + 0.02]), (0.95, 0.75, 0.22), round_=0.8, n=4))  # (its pocket)
        parts.append(_tube([c + np.array([-0.3, half[1] + 0.02, 0]), c + np.array([0, half[1] + 0.25, -0.05]), c + np.array([0.3, half[1] + 0.02, 0])], [0.05] * 3, 5))  # (its handle)
        for S, sg in (("L", 1), ("R", -1)):
            top = shoulder[S]
            pts = [c + np.array([sg * 0.6, half[1] * 0.8, half[2] * 0.95]), top + np.array([0, -0.05, -0.38]), top + np.array([0, 0.03, 0]), top + np.array([0, -0.05, 0.38])]
            for y, a in ((neck_y - 1.0, 0.5), (chest_y, 0.62), (chest_y - 0.7, 0.95)):
                pts.append(on(sg * a, y, over))
            pts.append(on(sg * 1.45, yc - half[1] * 0.75, over))
            pts.append(c + np.array([sg * half[0] * 0.9, -half[1] * 0.8, half[2] * 0.8]))
            parts.append(strap(pts, 0.42, 0.06))
        bagged(parts, 3)
    elif name in ("crossbody", "satchel"):
        # a strap from one shoulder (the crossbody the right, the satchel the left) across the chest to a
        # bag at the other hip, and round the back from the shoulder to it
        half = {"crossbody": (0.95, 0.72, 0.28), "satchel": (1.45, 1.1, 0.38)}[name]
        S, sg = ("R", -1) if name == "crossbody" else ("L", 1)
        hip_y = J["hip"][1] + (0.35 if name == "crossbody" else 0.0)
        th_bag = -sg * (1.2 if name == "crossbody" else 1.5)
        c = on(th_bag, hip_y, over + half[2])
        tb = np.array([np.cos(th_bag), 0, -np.sin(th_bag)])  # (along the bag, round the body)
        nb = np.array([np.sin(th_bag), 0, np.cos(th_bag)])  # (out of it)
        parts = [_box(c, half, ex=tb, ey=(0, 1, 0), round_=0.3)]
        # (its flap over the top half, and a buckle)
        parts.append(_box(c + nb * (half[2] + 0.02) + np.array([0, half[1] * 0.3, 0]), (half[0] * 1.02, half[1] * 0.72, 0.025), ex=tb, ey=(0, 1, 0), round_=0.2, n=3))
        parts.append(_box(c + nb * (half[2] + 0.06) - np.array([0, half[1] * 0.35, 0]), (0.12, 0.09, 0.02), ex=tb, ey=(0, 1, 0), round_=0.3, n=2))
        sy = shoulder[S][1] - 0.9
        # (front: from the bag's top corner nearer the shoulder up to it)
        fwd = tb * np.sign(tb[2])  # (along the bag toward the front)
        near_end = c + np.array([0, half[1], 0]) + fwd * half[0] * 0.85
        far_end = c + np.array([0, half[1], 0]) - fwd * half[0] * 0.85
        pts = [near_end]
        for u in np.linspace(0.2, 0.85, 5):
            pts.append(on(th_bag + (sg * 0.55 - th_bag) * u, hip_y + half[1] + (sy - hip_y - half[1]) * u, over))
        pts += [shoulder[S] + np.array([0, -0.02, 0.3]), shoulder[S] + np.array([0, 0.02, 0]), shoulder[S] + np.array([0, -0.02, -0.3])]
        # (round the back: from behind the shoulder across it to the bag's back side)
        a0, a1 = sg * (np.pi - 0.55), th_bag - sg * 0.5
        a1 += 2 * np.pi * sg
        for u in np.linspace(0.15, 0.85, 7):
            pts.append(on(a0 + (a1 - a0) * u, sy + (hip_y + half[1] - sy) * u, over))
        pts.append(far_end)
        parts.append(strap(pts, 0.3, 0.045))
        bagged(parts, 3)
    elif name == "tote":
        # on the right shoulder, hung at that side
        half = (1.7, 1.85, 0.4)
        th = -np.pi * 0.6
        nb = np.array([np.sin(th), 0, np.cos(th)])
        tb = np.array([np.cos(th), 0, -np.sin(th)])
        c = on(th, J["waist"][1] - 0.9, over + half[2] + 0.15)
        parts = [_box(c, half, ex=tb, ey=(0, 1, 0), round_=0.15)]
        for dz in (-0.75, 0.75):
            for side in (-1, 1):
                a = c + tb * dz + nb * side * half[2] * 0.9 + np.array([0, half[1] - 0.05, 0])
                top = shoulder["R"] + tb * dz * 0.25 + np.array([0, 0.02, 0])
                mid = (a + top) / 2 + nb * 0.08
                parts.append(_band([a, mid, top] if side < 0 else [a, mid, top], [nb, nb, np.array([0, 1.0, 0])], 0.24, 0.04))
        bagged(parts, 1)
    elif name == "fannypack":
        y = waist_y
        pts = [on(2 * np.pi * i / 36, y, over - 0.02) for i in range(37)]
        parts = [_band(pts, [normal(p) for p in pts], 0.3, 0.04)]
        parts.append(_box(on(0.0, y - 0.1, over + 0.34), (1.2, 0.55, 0.32), round_=0.9, taper=-0.1))
        parts.append(_tube([on(-0.3, y - 0.02, over + 0.76), on(0.0, y + 0.05, over + 0.75), on(0.3, y - 0.02, over + 0.76)], [0.025] * 3, 4))  # (its zip)
        P, F = _merge(parts)
        piece("", P, F)
    elif name == "walkman":
        th = np.pi * 0.42
        y = waist_y - 0.1
        n_ = np.array([np.sin(th), 0, np.cos(th)])
        t_ = np.array([np.cos(th), 0, -np.sin(th)])
        c = on(th, y, over + 0.18)
        parts = [_box(c, (0.42, 0.58, 0.15), ex=t_, ey=(0, 1, 0), round_=0.25)]
        parts.append(_box(c + n_ * 0.15 + np.array([0, 0.1, 0]), (0.3, 0.2, 0.02), ex=t_, ey=(0, 1, 0), round_=0.2, n=2))  # (its window)
        # its wire up the chest to under the chin, forked to the earphones
        wire = [c + np.array([0, 0.58, 0])]
        for u in np.linspace(0.2, 1.0, 6):
            wire.append(on(th * (1 - u) + 0.15 * u, y + 0.6 + (chin_y - 1.0 - y - 0.6) * u, over + 0.02))
        fork = on(0.12, chin_y - 0.55, 0.06)
        wire.append(fork)
        parts.append(_tube(wire, [0.018] * len(wire), 4))
        for e, sg in ((eL, 1), (eR, -1)):
            bud = e + np.array([sg * 0.0, -0.05, 0.1])
            parts.append(_tube([fork, (fork + bud) / 2 + np.array([sg * 0.15, -0.1, 0]), bud], [0.016] * 3, 4))
            parts.append(_box(bud, (0.07, 0.08, 0.08), round_=0.9, n=3))
        P, F = _merge(parts)
        piece("", P, F, among=round_)
    return out

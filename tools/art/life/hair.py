# Plan 73 phase 5 — the life look's hair, made by script (decided 2026-11-09: "shell plus strand
# cards"). A style is a shell grown off the scalp — the body's own head above a hairline, set off by the
# hair's volume — and strand cards rooted in it, combed from the crown and let fall (or out, or back to
# a bun), kept off the head and the body as they go. A beard is the same off the jaw. Both take the
# weights and the face's shapes of the skin they grow from, so they follow the jaw and the brows.
#
# Units are MakeHuman's (decimetres, y up, facing +z, the person's left +x).
import os

import numpy as np

from wear import HEAD, TORSO, boundary, normals

# `line`: the hairline over the brow (dm) by how far round from the front (radians: 0 the forehead, π/2
# over the ear, π the nape); `vol` the shell off the scalp; `curl` its bumps; cards: how many, how long,
# `fall` how hard they're pulled down, `out` how much they stand off the scalp, `seg` their segments
LINE = [(0, 0.5), (0.9, 0.35), (1.35, 0.12), (1.8, 0.05), (2.4, -0.55), (np.pi, -0.85)]
# The made styles (5.3: the wardrobe's hairs the CC0 pack hasn't — wear.py has its ten). No strand cards
# (they read as planks): a shell off the scalp, its `vol` — `top` more over the crown (a crew, a fade,
# an undercut's sharp: `sharp`); `strip` only down the middle (a mohawk, `fin` its height); `rows`
# (period, depth) cornrows; `sphere` (up, back, radius) an afro's round; a `bun` (x, over the brow, back,
# radius); `tails` hanging tubes [(x, over the brow, back, length, radius)]; `locs` (count, length, radius)
HAIR = {
    "buzz": {"line": LINE, "vol": 0.02},
    "fade": {"line": LINE, "vol": 0.01, "top": 0.08},
    "cornrows": {"line": LINE, "vol": 0.02, "rows": (0.3, 0.08)},
    "afro": {"line": LINE, "vol": 0.1, "curl": 0.015, "sphere": (0.15, -0.1, 1.75)},
    "locs": {"line": LINE, "vol": 0.1, "locs": (44, 3.0, 0.075)},
}
FULL_TOP = [(0, 0.105), (0.2, 0.12), (0.4, 0.2), (0.7, 0.3), (1.0, 0.44), (1.2, 0.6), (1.45, 0.75)]
BEARD = {
    # the beard's upper edge by how far round (0 the chin, 1.45 the sideburn), over the mouth; `only` a
    # part of the full beard's ground (the moustache, the chin, the jaw's line, the cheeks); `faint` its
    # most (stubble). (Its fur and strands: BEARD_FUR_SPEC, make_beard_fur.)
    "full": {"top": FULL_TOP, "back": 1.42},
    "boxed": {"top": FULL_TOP, "back": 1.42},
    "stubble": {"top": FULL_TOP, "back": 1.42, "faint": 0.3},  # (11-10: 0.5 read as a short beard)
    "mustache": {"top": FULL_TOP, "back": 1.42, "only": "mustache"},
    "goatee": {"top": FULL_TOP, "back": 1.42, "only": "goatee"},
    "chinstrap": {"top": FULL_TOP, "back": 1.42, "only": "chinstrap"},
    "muttonchops": {"top": FULL_TOP, "back": 1.42, "only": "muttonchops"},
}  # fmt: skip


def _rng(seed):
    return np.random.default_rng(seed)


def _interp(knots, x):
    xs, ys = zip(*knots, strict=True)
    return np.interp(x, xs, ys)


class Hull:
    """The body's outer surface round a vertical axis (angle × height bins): what cards are kept off."""

    def __init__(self, P, c, nb=72, dy=0.12):
        self.c, self.nb, self.dy = c, nb, dy
        self.y0 = P[:, 1].min()
        self.ny = int((P[:, 1].max() - self.y0) / dy) + 2
        h = np.zeros((nb, self.ny))
        ab, yb = self._bins(P)
        np.maximum.at(h, (ab, yb), self._r(P))
        for _ in range(2):
            h = np.maximum(h, np.maximum(np.roll(h, 1, 0), np.roll(h, -1, 0)) * 0.985)
        self.h = h

    def _r(self, P):
        return np.hypot(P[:, 0] - self.c[0], P[:, 2] - self.c[2])

    def _bins(self, P):
        a = np.arctan2(P[:, 0] - self.c[0], P[:, 2] - self.c[2])
        ab = ((a + np.pi) / (2 * np.pi) * self.nb).astype(int) % self.nb
        yb = np.clip(((P[:, 1] - self.y0) / self.dy).astype(int), 0, self.ny - 1)
        return ab, yb

    def push(self, p, gap, hug=0.0):
        """`p` (one point) moved out round the axis to the hull plus `gap`, if it's inside (and `hug` of
        the way in to it, if it's outside: hair lies on what's under it)."""
        P = p[None]
        if p[1] < self.y0 or p[1] > self.y0 + self.ny * self.dy:
            return p
        ab, yb = self._bins(P)
        r = self._r(P)[0]
        want = self.h[ab[0], yb[0]] + gap
        if r < 1e-6 or (r >= want and not hug):
            return p
        if r >= want:
            want = r - (r - want) * hug
        q = p.copy()
        q[0] = self.c[0] + (p[0] - self.c[0]) * want / r
        q[2] = self.c[2] + (p[2] - self.c[2]) * want / r
        return q


def _rings(faces, used, n):
    """Each vertex's distance in edges from the open edge, as 0…1 over `n` rings."""
    d = np.full(int(max(used)) + 1, n, dtype=float)
    nb = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            nb.setdefault(a, set()).add(b)
            nb.setdefault(b, set()).add(a)
    front = list(boundary(faces))
    for v in front:
        d[v] = 0
    k = 0
    while front and k < n:
        k += 1
        nxt = []
        for v in front:
            for w in nb[v]:
                if d[w] > k:
                    d[w] = k
                    nxt.append(w)
        front = nxt
    return d / n


def _shell(V, F0, keep, vol, edge_y, curl=0.0, seed=1, dome=0.0, soft=0):
    """The faces of the body all of whose vertices are kept, set off by `vol` (eased to nothing over its
    last 0.3 dm above `edge_y`, its edge snapped to it), bumped by `curl`; `soft`: eased to nothing over
    that many rings of its edge instead (a beard's)."""
    faces = [f[0] for f in F0 if f[2] == "body" and all(keep[v] for v in f[0])]
    used = np.array(sorted({v for f in faces for v in f}))
    V = V.copy()
    if not soft and np.ndim(edge_y):
        # (the hairline straight: its vertices onto it — the mesh's own lines left it in steps)
        for v in boundary(faces):
            V[v, 1] = max(V[v, 1], edge_y[v])
    Q = V.copy()
    N = normals(V, faces)
    # (the body's winding faces out: a sanity flip if most point in)
    c = V[used].mean(0)
    if np.sum(np.einsum("ij,ij->i", N[used], V[used] - c)) < 0:
        N = -N
    if soft:
        up = np.zeros(len(V))
        up[: int(max(used)) + 1] = _rings(faces, used, soft)
    else:
        up = np.clip((V[:, 1] - edge_y) / max(0.3, vol * 1.3), 0, 1)
    ease = up * up * (3 - 2 * up)
    bump = np.ones(len(V))
    if curl:
        r = _rng(seed)
        k = r.normal(size=(6, 3)) * 2.2
        ph = r.uniform(0, 6.3, 6)
        bump = 1 + curl / vol * np.sum(np.sin(V @ k.T + ph), 1) / 3
    # (`dome`: the volume grows over this much height above the edge — round, not a bowl)
    grow = np.clip((V[:, 1] - edge_y) / dome, 0.3, 1) if dome else 1.0
    Q = V + N * (vol * ease * bump * grow + 0.015)[:, None]
    return Q, N, faces, used


def _grow(roots, dirs, normals_, spec, hull, rng, pull=None):
    """Strand cards: from each root along its direction, pulled down by `fall` (or to `pull`), kept off
    the hull. → positions, uvs, quads (vertex index lists), each vertex's root."""
    n = spec["seg"]
    step = spec["len"] / n
    P, UV, F, src = [], [], [], []
    for i, (p0, d0, nm) in enumerate(zip(roots, dirs, normals_, strict=True)):
        col = rng.integers(0, 4)
        w0 = spec["width"] * rng.uniform(0.75, 1.15)
        L = rng.uniform(0.8, 1.1)
        pts = [p0]
        d = d0 / max(np.linalg.norm(d0), 1e-9)
        p = p0.copy()
        for k in range(n):
            # (gravity takes them more the farther out: first along the head, then down)
            d = d + np.array([0, -spec["fall"], 0]) * 0.6 * min(1.0, (k + 1) / 3)
            if pull is not None:
                d = d + (pull - p) / max(np.linalg.norm(pull - p), 1e-6) * spec.get("to_bun", 0)
            d /= max(np.linalg.norm(d), 1e-9)
            # (they lie on the head and the back; down the front they hang free — hugged there, they
            # crossed over the chest)
            nxt = p + d * step * L
            hug = spec.get("hug", 0.0) if (nxt[1] > hull.neck or nxt[2] < hull.c[2]) else 0.0
            q = hull.push(nxt, 0.04, hug)
            d = (q - p) / max(np.linalg.norm(q - p), 1e-9)
            p = q
            pts.append(p)
        base = len(P)
        for k, p in enumerate(pts):
            t = k / n
            dd = pts[min(k + 1, n)] - pts[max(k - 1, 0)]
            side = np.cross(dd, nm)
            side /= max(np.linalg.norm(side), 1e-9)
            w = w0 * (1 - 0.45 * t)
            P += [p - side * w / 2, p + side * w / 2]
            UV += [((col + 0.02) / 4, 1 - t * 0.98), ((col + 0.98) / 4, 1 - t * 0.98)]
            src += [i, i]
        for k in range(n):
            a = base + 2 * k
            F.append([a, a + 1, a + 3, a + 2])
    return np.array(P), np.array(UV), F, np.array(src)


def landmarks_head(V, Z, J, F0):
    kind = Z[0]
    head = kind == HEAD
    c = V[head].mean(0)
    teeth = np.array(sorted({v for f in F0 if f[2] == "helper-upper-teeth" for v in f[0]}))
    mouth = V[teeth][np.argmax(V[teeth][:, 2])]
    return c, mouth


def _cap_uv(V, c, edge_y):
    """A cap's or a shell's UVs: round the head by its height over the hairline (0 at the line, 1 at
    0.8 dm over it, held there) — its texture fades in from the line (cap_texture's alpha), soft."""
    u = (np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]) + np.pi) / (2 * np.pi) * 6
    v = np.clip((V[:, 1] - edge_y) / 0.8, 0.0, 0.98)
    return np.stack([u, v], 1)


def _shell_uv(V, c):
    """The shell's streaks: round the head (six tiles) by height — they run down."""
    u = (np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]) + np.pi) / (2 * np.pi) * 6
    return np.stack([u, V[:, 1] / 0.8], 1)


def _tube(pts, radii, sides=7):
    """A tube along a polyline: (positions, uvs, quads), capped at its end."""
    pts = np.asarray(pts)
    P, UV, F = [], [], []
    up = np.array([0, 1.0, 0])
    for i, (p, r) in enumerate(zip(pts, radii, strict=True)):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        d /= max(np.linalg.norm(d), 1e-9)
        e1 = np.cross(d, up if abs(d @ up) < 0.9 else np.array([1.0, 0, 0]))
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(d, e1)
        for k in range(sides):
            a = 2 * np.pi * k / sides
            P.append(p + (np.cos(a) * e1 + np.sin(a) * e2) * r)
            UV.append((k / sides, i * 0.6))
    for i in range(len(pts) - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            F.append([a, b, b + sides, a + sides])
    tip = len(P)
    P.append(pts[-1] + (pts[-1] - pts[-2]) / max(np.linalg.norm(pts[-1] - pts[-2]), 1e-9) * radii[-1] * 0.5)
    UV.append((0.5, len(pts) * 0.6))
    base = (len(pts) - 1) * sides
    F += [[base + k, base + (k + 1) % sides, tip] for k in range(sides)]
    return np.array(P), np.array(UV), F


def _hang(p0, d0, length, n, hull, fall=0.8, hug=0.4):
    """A line let fall from `p0` along `d0`, kept off the hull (laid on the head and the back)."""
    pts = [p0]
    d = d0 / np.linalg.norm(d0)
    p = p0.copy()
    for k in range(n):
        d = d + np.array([0, -fall, 0]) * 0.6 * min(1.0, (k + 1) / 2)
        d /= np.linalg.norm(d)
        q = hull.push(p + d * length / n, 0.06, hug if p[2] < hull.c[2] or p[1] > hull.neck else 0.0)
        d = (q - p) / max(np.linalg.norm(q - p), 1e-9)
        p = q
        pts.append(p)
    return pts


def make_hair(name, V, F0, Z, J, seed=7):
    """A made hairstyle's pieces: [(suffix, positions, uvs, faces as vertex lists, each vertex's source on
    the body, alpha)] — the shell, and its bun, its tails or its locs."""
    spec = HAIR[name]
    kind, y = Z[0], Z[2]
    c, _ = landmarks_head(V, Z, J, F0)
    az = np.abs(np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]))
    dxc = np.abs(V[:, 0] - c[0])
    line = J["brow"][1] + _interp(spec["line"], az)
    keep = (kind == HEAD) & (y >= line)
    if spec.get("strip"):
        keep &= dxc < spec["strip"]
    Q, N, faces, used = _shell(V, F0, keep, spec["vol"], line, spec.get("curl", 0.0), seed)
    over_brow = y - J["brow"][1]
    if spec.get("top"):
        # (more over the crown than at the sides: a crew, a fade — an undercut's step sharp)
        k = np.clip((over_brow - 0.55) / (0.08 if spec.get("sharp") else 0.6), 0, 1)
        Q += N * ((spec["top"] - spec["vol"]) * k)[:, None]
    if spec.get("fin"):
        # (a mohawk: tallest down the middle, risen from the forehead)
        k = np.clip(1 - (dxc / spec["strip"]) ** 2, 0, 1) * np.clip((over_brow - 0.2) / 0.5, 0, 1)
        Q += N * (spec["fin"] * k)[:, None]
    if spec.get("rows"):
        # (cornrows: ridges front to back)
        period, depth = spec["rows"]
        Q += N * (depth * (0.5 + 0.5 * np.cos(2 * np.pi * dxc / period)))[:, None]
    if spec.get("sphere"):
        # (an afro: out to a round about the scalp's own middle — the head's mean sat low and forward —
        # eased from the hairline, less over the forehead than round the sides and back)
        upb, back, R = spec["sphere"]
        cc = V[used].mean(0) + np.array([0, upb, back])
        d = V - cc
        r = np.linalg.norm(d, axis=1)
        u = d / np.maximum(r[:, None], 1e-9)
        target = cc + u * (R * np.where(u[:, 1] < 0, 0.9, 1.0))[:, None]
        ease = np.clip((y - line) / 0.7, 0, 1) * (0.75 + 0.25 * np.clip(az / 1.3, 0, 1))
        farther = np.linalg.norm(target - cc, axis=1) > np.linalg.norm(Q - cc, axis=1)
        k = np.where(farther, ease, 0.0)
        Q = Q + (target - Q) * k[:, None]
    # (plan 74: in the card styles' cap texture, matte — in the old streaks and the strands' light they
    # read as plastic helmets; an afro's fuzzy)
    tex = cap_texture(kind="fuzz") if spec.get("sphere") else cap_texture()
    out = [("", Q, _cap_uv(V, c, line), [(f, f) for f in faces], np.arange(len(V)), False, tex)]
    rng = _rng(seed)
    body = (kind == HEAD) | (kind == TORSO)
    hull = Hull(np.concatenate([V[body], Q[used]]), np.array([c[0], 0, c[2]]))
    hull.neck = J["neck"][1]
    if "bun" in spec:
        bx, by, bz, br = spec["bun"]
        pull = np.array([bx, J["brow"][1] + by, J["brow"][2] + bz])
        BP, BF = _sphere(pull, br, rng)
        near = used[np.argmin(np.linalg.norm(V[used] - pull, axis=1))]
        out.append(("bun", BP, _shell_uv(BP, pull), BF, np.full(len(BP), near), False))
    tubes = []
    for tx, ty, tz, length, r in spec.get("tails", []):
        p0 = np.array([c[0] + tx, J["brow"][1] + ty, J["brow"][2] + tz])
        d0 = np.array([np.sign(tx) * 0.6, -0.2, -1.0])
        # (falling free — laid on the head they zigzagged)
        pts = _hang(p0, d0, length, 9, hull, 1.0, 0.0)
        tubes.append((pts, [r * (1.0 - 0.55 * k / 9) for k in range(10)], p0))
    if spec.get("locs"):
        count, length, r = spec["locs"]
        rootable = used[(y[used] > line[used] + 0.25) | (az[used] > 1.3)]
        pick = rng.choice(rootable, size=min(count, len(rootable)), replace=False)
        for v in pick:
            p0 = Q[v] - N[v] * 0.03
            flow = np.array([(Q[v, 0] - c[0]) * 0.6, 0, min(Q[v, 2] - c[2], 0) - 0.6])
            if np.linalg.norm(flow) < 0.2:
                flow = np.array([rng.choice([-1.0, 1.0]), 0, -0.3])
            pts = _hang(p0, flow / np.linalg.norm(flow) + N[v] * 0.3, length * rng.uniform(0.85, 1.1), 8, hull, 0.9, 0.6)
            tubes.append((pts, [r * (1.0 - 0.25 * k / 8) for k in range(9)], p0))
    if tubes:
        TP, TUV, TF, TS = [], [], [], []
        for pts, radii, p0 in tubes:
            P, UV, F = _tube(pts, radii)
            base = sum(len(x) for x in TP)
            TF += [[base + i for i in f] for f in F]
            TP.append(P)
            TUV.append(UV)
            near = used[np.argmin(np.linalg.norm(V[used] - p0, axis=1))]
            TS.append(np.full(len(P), near))
        out.append(("tails", np.vstack(TP), np.vstack(TUV), TF, np.concatenate(TS), False))
    return out


def _sphere(c, r, rng, n=10):
    """A bun: a squashed, lumpy sphere."""
    th = np.linspace(0, np.pi, n)
    ph = np.linspace(0, 2 * np.pi, 2 * n, endpoint=False)
    P = []
    for t in th:
        for p in ph:
            P.append([np.sin(t) * np.cos(p), np.cos(t) * 0.85, np.sin(t) * np.sin(p)])
    P = np.array(P) * r * (1 + 0.06 * rng.normal(size=(len(P), 1))) + c
    F = []
    m = 2 * n
    for i in range(n - 1):
        for j in range(m):
            a, b = i * m + j, i * m + (j + 1) % m
            F.append([a, a + m, b + m, b])
    return P, F


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def beard_density(name, V, F0, Z, J):
    """Where a beard grows, 0…1 a body vertex: a smooth density on the face — under the cheek line, before
    the ear, round the lips, fading down the neck — each style a part of the full beard's.
    → (density, the head's middle, the mouth, the ears' z)"""
    spec = BEARD[name]
    kind, y = Z[0], Z[2]
    c, mouth = landmarks_head(V, Z, J, F0)
    # (how far round, about the ears' line: round the head's mean, the face's many vertices drew it
    # forward and "before the ear" fell mid-cheek — the beard stopped short of the sideburns)
    hd = np.where((kind == HEAD) & (y > mouth[1]) & (y < mouth[1] + 0.5))[0]
    ears = hd[np.argsort(-np.abs(V[hd, 0] - c[0]))[:40]]
    zear = np.median(V[ears, 2])
    az = np.abs(np.arctan2(V[:, 0] - c[0], V[:, 2] - zear))
    dy = y - mouth[1]
    # under the cheek line (sharp over the lip, softer up the cheek), up the sideburn to the brow
    top = _interp(spec["top"], az)
    fw = _interp([(0, 0.03), (0.5, 0.07), (1.0, 0.12)], az)
    d = _smooth(top + fw * 0.4, top - fw * 0.6, dy)
    d *= _smooth(J["brow"][1] + 0.12, J["brow"][1] - 0.02, y)
    # before the ear
    d *= _smooth(spec["back"], spec["back"] - 0.18, az)
    # round the lips: an oval, a narrow fade (its top at the lip line: a moustache hangs over the lip)
    oval = ((V[:, 0] - mouth[0]) / 0.25) ** 2 + ((dy + 0.085) / 0.08) ** 2
    d *= np.where(az < 0.7, _smooth(1.0, 1.25, oval), 1.0)
    # not the nose
    d *= np.where((dy > 0.1) & (V[:, 2] > mouth[2] + 0.19), 0.0, 1.0)
    # down the neck, fading out
    d *= _smooth(-0.78, -0.58, dy)
    only = spec.get("only")
    xm = np.abs(V[:, 0] - mouth[0])
    if only == "mustache":
        d *= _smooth(0.4, 0.3, xm) * _smooth(-0.05, 0.0, dy) * _smooth(0.16, 0.11, dy)
    elif only == "goatee":
        # (the moustache, round the mouth's corners and the chin)
        d *= _smooth(0.36, 0.26, xm) * _smooth(0.16, 0.11, dy)
    elif only == "chinstrap":
        # (the jaw's line: under the chin and up the sides, the cheeks and the moustache bare)
        d *= np.maximum(_smooth(-0.32, -0.45, dy), _smooth(0.95, 1.1, az) * _smooth(0.2, 0.1, dy))
    elif only == "muttonchops":
        # (the sideburns down the cheeks, the chin bare)
        d *= _smooth(0.65, 0.85, az) * _smooth(-0.6, -0.45, dy)
    if spec.get("faint"):
        d = np.minimum(d, spec["faint"])
    near = ((kind == HEAD) | (kind == TORSO)) & (az < spec["back"] + 0.1) & (dy > -1.0)
    return np.where(near, d, 0.0), c, mouth, zear


def textures(size=512, seed=3):
    """The hair's two textures, grey (the game colours them): the shell's, streaks that tile; the cards',
    four columns of strand clumps with their tips cut out by the alpha."""
    rng = _rng(seed)
    x = np.arange(size) / size
    # shell: many fine streaks across u, a slow wobble down v
    s = np.zeros(size)
    for f in rng.integers(8, 90, 40):
        s += np.sin(2 * np.pi * (f * x + rng.uniform())) * rng.uniform(0.2, 1) / np.sqrt(f)
    s = (s - s.min()) / (s.max() - s.min())
    v = np.arange(size)[:, None] / size
    shell = 0.5 + 0.35 * s[None, :] + 0.05 * np.sin(2 * np.pi * (3 * v + 0.3 * s[None, :]))
    shell = np.clip(shell, 0, 1)
    sh = np.dstack([shell, shell, shell, np.ones_like(shell)])
    # cards (plan 74): four columns of fine strands, each its own width, length, sway and shade, darker
    # at the root, thinning to the tip — at twice the old size (its 70 strands a column read as planks)
    cs = size * 2
    cw = cs // 4
    alpha = np.zeros((cs, cs))
    lum = np.zeros((cs, cs))
    rows = np.arange(cs) / cs  # 0 the root (image top: v 1 is the root)
    win = np.arange(-4, 5)
    for col in range(4):
        for _ in range(260):
            # (bunched to the card's middle, none at its edges: its edges vanish — strands to the edges
            # showed every card's outline, a plank)
            cx = col * cw + (0.5 + np.clip(rng.normal(scale=0.17), -0.4, 0.4)) * cw
            wd = rng.uniform(0.45, 1.25)
            ln = rng.uniform(0.5, 1.0)
            sway = rng.uniform(-6, 6) * rows**1.5 + rng.uniform(0.5, 2.0) * np.sin(2 * np.pi * (rows * rng.uniform(1, 3) + rng.uniform()))
            xs = cx + sway  # its centre, row by row
            shade = rng.uniform(0.62, 1.0)
            # (fading in over the first tenth from the root too: a card's start was a hard edge across it,
            # and rows of them read as shingles)
            fade = np.clip((ln - rows) / 0.18, 0, 1) * np.clip(rows / 0.1, 0, 1) ** 0.7
            for dx in win:
                xi = np.clip(np.floor(xs).astype(int) + dx, col * cw, (col + 1) * cw - 1)
                a = np.exp(-((xi + 0.5 - xs) ** 2) / (2 * wd * wd)) * fade * rng.uniform(0.85, 1.0)
                r_ = np.arange(cs)
                old = alpha[r_, xi]
                alpha[r_, xi] = np.maximum(old, a)
                lum[r_, xi] = np.where(a > old, shade, lum[r_, xi])
    lum = lum * (0.62 + 0.38 * np.clip(rows / 0.35, 0, 1))
    cards = np.dstack([lum, lum, lum, np.clip(alpha * 1.6, 0, 1)])
    return sh, cards


# ---- plan 74 phase 4: hair as strand cards off a cap
#
# The made styles were shells (helmets) and the pack's meshes few, wide slabs. A card style is:
#   - a cap: the scalp's shell (`_shell`), coloured as the hair, so no skin shows between the cards;
#   - strand cards: roots scattered over the cap by area, each grown along the style's comb — away from
#     a part, back, or gathered to a ponytail's tie — lifted off the head by `lift`, pulled down by
#     `fall`, kept outside the cap (its nearest point, along its normal) and the body's hull, laid on the
#     head and the back (`hug`); curled round its path by `curl`. A ribbon a centimetre or two wide lies
#     along it, flat to what's under it, textured with a column of the strand atlas (`textures`: many fine
#     strands, darker at the root, thinning to the tip);
#   - an outer layer, a share of the roots again — finer, a little farther out, wispier: the volume.
# Lengths by where on the head (dm): `front` over the forehead, `side`, `back`, blended by the angle round.

CARDS = {
    "short": {"n": 1250, "front": 0.5, "side": 0.3, "back": 0.36, "top": 0.55, "comb": "back", "lift": 0.12,
              "fall": 0.35, "hug": 0.85, "width": 0.12, "seg": 4, "vol": 0.07, "outer": 0.4, "cover": (300, 0.35)},
    "slick": {"n": 900, "front": 0.95, "side": 0.38, "back": 0.4, "top": 0.85, "comb": "side", "part": 0.38,
              "lift": 0.08, "fall": 0.3, "hug": 0.85, "width": 0.13, "seg": 5, "vol": 0.06, "outer": 0.35},
    "long": {"n": 520, "front": 3.0, "side": 3.3, "back": 3.7, "top": 3.4, "comb": "center", "lift": 0.12,
             "fall": 1.0, "hug": 0.45, "width": 0.17, "seg": 10, "vol": 0.13, "outer": 0.5, "cover": (550, 0.7)},
    "bob": {"n": 620, "front": 1.55, "side": 1.6, "back": 1.45, "top": 1.7, "comb": "side", "part": 0.3,
            "lift": 0.12, "fall": 1.0, "hug": 0.45, "width": 0.15, "seg": 7, "vol": 0.13, "outer": 0.45,
            "tuck": 0.22, "cover": (600, 0.6)},
    "ponytail": {"n": 800, "front": 1.4, "side": 1.4, "back": 1.4, "top": 1.4, "comb": "tie",
                 "ties": [(0.0, 0.75, -1.1)], "tail": (320, 2.6), "lift": 0.05, "fall": 0.2, "hug": 0.9,
                 "width": 0.17, "seg": 6, "vol": 0.05, "outer": 0.2, "cover": (350, 0.6)},
    "curly": {"n": 560, "front": 0.6, "side": 0.95, "back": 0.95, "top": 0.9, "comb": "out", "lift": 0.5,
              "fall": 0.35, "hug": 0.2, "width": 0.08, "seg": 12, "vol": 0.16, "outer": 0.45,
              "curl": (0.065, 2.2), "hairline": 120, "cover": (250, 0.4)},
    # (the rest of the wardrobe's, plan 74 phase 4: the pack's pixie, spiky and wavy, and the made crew,
    # undercut, mohawk, bun, topknot, high ponytail and pigtails)
    "pixie": {"n": 1000, "front": 0.6, "side": 0.22, "back": 0.24, "top": 0.5, "comb": "side", "part": 0.3,
              "lift": 0.1, "fall": 0.35, "hug": 0.85, "width": 0.11, "seg": 4, "vol": 0.06, "outer": 0.4,
              "cover": (250, 0.3)},
    "spiky": {"n": 1100, "front": 0.42, "side": 0.2, "back": 0.24, "top": 0.48, "comb": "up", "lift": 0.0,
              "fall": 0.04, "hug": 0.0, "width": 0.1, "seg": 3, "vol": 0.07, "outer": 0.4, "hairline": 160},
    "wavy": {"n": 600, "front": 1.7, "side": 1.8, "back": 1.7, "top": 1.9, "comb": "center", "lift": 0.12,
             "fall": 1.0, "hug": 0.45, "width": 0.15, "seg": 9, "vol": 0.13, "outer": 0.45, "cover": (500, 0.6),
             "curl": (0.05, 1.3)},
    "crew": {"n": 1100, "front": 0.32, "side": 0.13, "back": 0.15, "top": 0.36, "comb": "back", "lift": 0.2,
             "fall": 0.2, "hug": 0.8, "width": 0.1, "seg": 3, "vol": 0.05, "outer": 0.3},
    "undercut": {"n": 800, "front": 0.9, "side": 0.9, "back": 0.75, "top": 0.95, "comb": "side", "part": 0.35,
                 "lift": 0.15, "fall": 0.3, "hug": 0.8, "width": 0.13, "seg": 5, "vol": 0.03, "outer": 0.4,
                 "top_only": 0.65},
    "mohawk": {"n": 600, "front": 0.6, "side": 0.7, "back": 0.7, "top": 0.85, "comb": "up", "strip": 0.28,
               "lift": 0.0, "fall": 0.0, "hug": 0.0, "width": 0.13, "seg": 4, "vol": 0.03, "outer": 0.5,
               "hairline": 0},
    "bun": {"n": 650, "front": 1.3, "side": 1.3, "back": 1.3, "top": 1.3, "comb": "tie",
            "ties": [(0.0, 1.05, -0.95)], "lift": 0.05, "fall": 0.2, "hug": 0.9, "width": 0.16, "seg": 5,
            "vol": 0.05, "outer": 0.2, "cover": (300, 0.5), "bun": (0.0, 1.05, -0.95, 0.42)},
    "topknot": {"n": 650, "front": 1.4, "side": 1.4, "back": 1.4, "top": 1.4, "comb": "tie",
                "ties": [(0.0, 1.5, -0.45)], "lift": 0.05, "fall": 0.2, "hug": 0.9, "width": 0.16, "seg": 5,
                "vol": 0.05, "outer": 0.2, "cover": (300, 0.5), "bun": (0.0, 1.5, -0.45, 0.36)},
    "highpony": {"n": 750, "front": 1.4, "side": 1.4, "back": 1.4, "top": 1.4, "comb": "tie",
                 "ties": [(0.0, 1.05, -1.15)], "tail": (320, 3.0), "lift": 0.05, "fall": 0.2, "hug": 0.9,
                 "width": 0.17, "seg": 6, "vol": 0.05, "outer": 0.2, "cover": (300, 0.6)},
    "pigtails": {"n": 700, "front": 1.4, "side": 1.4, "back": 1.4, "top": 1.4, "comb": "tie",
                 "ties": [(0.95, 0.15, -0.55), (-0.95, 0.15, -0.55)], "tail": (170, 2.0), "lift": 0.05,
                 "fall": 0.2, "hug": 0.9, "width": 0.16, "seg": 6, "vol": 0.05, "outer": 0.2, "part": 0.0,
                 "cover": (300, 0.6)},
}  # fmt: skip


def _sample_tris(Q, N, faces, n, rng):
    """`n` points on the faces by area: (points, normals, each one's nearest corner)."""
    tris = [(f[0], f[i], f[i + 1]) for f in faces for i in range(1, len(f) - 1)]
    T = np.array(tris)
    a, b, c = Q[T[:, 0]], Q[T[:, 1]], Q[T[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
    pick = rng.choice(len(T), size=n, p=area / area.sum())
    r1, r2 = rng.uniform(size=n), rng.uniform(size=n)
    s = np.sqrt(r1)
    w = np.stack([1 - s, s * (1 - r2), s * r2], 1)
    P = a[pick] * w[:, :1] + b[pick] * w[:, 1:2] + c[pick] * w[:, 2:]
    Nn = N[T[pick, 0]] * w[:, :1] + N[T[pick, 1]] * w[:, 1:2] + N[T[pick, 2]] * w[:, 2:]
    Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
    near = T[pick, np.argmax(w, 1)]
    return P, Nn, near


class _Cap:
    """Keeps points outside the cap: the nearest cap point, out along its normal by `gap`."""

    def __init__(self, Q, N):
        self.Q, self.N = Q, N

    def push(self, p, gap, hug=0.0):
        """Out to `gap` off the cap if it's nearer; `hug` of the way in to it if it's farther (it lies on
        the head)."""
        d = np.einsum("ij,ij->i", self.Q - p, self.Q - p)
        i = int(np.argmin(d))
        off = (p - self.Q[i]) @ self.N[i]
        if off < gap:
            return p + self.N[i] * (gap - off)
        # (pulled in only over the cap: below it, its nearest point is the sideburn, and drew strands in
        # under the jaw)
        lateral = np.linalg.norm(p - self.Q[i] - self.N[i] * off)
        return p - self.N[i] * (off - gap) * hug if lateral < 0.12 else p


def _comb(spec, p, n, c, part_x, tie):
    """The direction a strand rooted at `p` (normal `n`) is combed, on the head's surface."""
    side = np.sign(p[0] - part_x) or 1.0
    back = np.array([0, 0, -1.0])
    if spec["comb"] == "up":
        # (stood up off the head: out along it and up, a little back — not laid on it)
        d = n * 0.7 + np.array([0, 0.9, 0]) + back * 0.25
        return d / np.linalg.norm(d)
    if spec["comb"] == "back":
        d = back * 1.0 + np.array([0, -0.4, 0]) + np.array([(p[0] - c[0]) * 0.6, 0, 0])
    elif spec["comb"] in ("side", "center"):
        # away from the part across the top, then down the sides; behind, down the back; over the
        # forehead, back to the side — combed straight to the side, they fell over the face
        d = np.array([side * 0.9, -0.15, -0.6])
        if p[2] > c[2] + 0.5:
            # (over the forehead: to the side and down a little, framing it — combed straight back, the
            # forehead read bare, a receding line)
            d = np.array([side * 1.0, -0.25, -0.3])
        if p[2] < c[2] - 0.2:
            d = np.array([side * 0.25, -0.6, -0.7])
    elif spec["comb"] == "tie":
        d = tie - p
    else:  # out: curls stand off the head every way — over the forehead up and back, off the face
        d = n * 1.0 + np.array([0, -0.3, 0])
        if p[2] > c[2] + 0.45:
            d = n * 0.6 + np.array([0, 0.5, -0.8])
    full = np.linalg.norm(d)
    d = d - n * (d @ n)
    if spec["comb"] in ("side", "center", "back") and p[2] < c[2] + 0.1:
        # (behind the ears never forward: projected on the tilted cap, combs there gained a forward lean
        # and the strands came round to the throat)
        d[2] = min(d[2], -0.15 * full)
    if np.linalg.norm(d) < 0.35 * full:
        # (at the nape and under the ears the cap faces down and back, the comb's way: on it, the comb
        # was almost nothing — what was left pointed anywhere, and strands went forward under the chin)
        d = np.array([0, -1.0, -0.35]) if spec["comb"] != "tie" else tie - p
    return d / max(np.linalg.norm(d), 1e-9)


def _strand(spec, p0, n0, d0, length, cap, hull, rng, tie=None):
    """One strand's path from its root: lifted, combed, pulled down, kept off the cap and the body."""
    seg = spec["seg"]
    step = length / seg
    pts = [p0]
    p = p0.copy()
    d = d0 + n0 * spec["lift"]
    d /= np.linalg.norm(d)
    for k in range(seg):
        g = spec["fall"] * min(1.0, (k + 1) / 2.5)
        d = d + np.array([0, -g * 0.7, 0])
        if p[1] < hull.neck + 0.8 and tie is None:
            # (past the head its sideways comb dies out and it falls: carried on, it wrapped round the
            # front of the neck)
            d[0] *= 0.6
            d[2] *= 0.8
        if tie is not None and k < seg - 1:
            d = d + (tie - p) / max(np.linalg.norm(tie - p), 1e-6) * 1.5
        d /= max(np.linalg.norm(d), 1e-9)
        q = p + d * step
        # (over the head, on the cap — laid on it by `hug`; the body's hull only under the neck: its
        # bins at the ears' height reach out to the ears, and pushed strands out sideways in spikes)
        q = cap.push(q, 0.03 + 0.008 * k, spec["hug"] if q[1] > hull.neck else 0.0)
        if q[1] < hull.neck + 0.2:
            # (lying on the shoulders, the chest and the back: off the body's own surface, along its
            # normal — the hull round a vertical axis is as wide as the shoulders' tips at their height,
            # and pushed strands by the neck out sideways)
            q = hull.body.push(q, 0.05, spec["hug"])
        d = (q - p) / max(np.linalg.norm(q - p), 1e-9)
        p = q
        pts.append(p)
    pts = np.array(pts)
    # (smoothed along itself, its root kept: where it met the head or the body it kinked)
    for _ in range(3):
        pts[1:-1] = 0.5 * pts[1:-1] + 0.25 * (pts[:-2] + pts[2:])
        pts[-1] = 0.5 * pts[-1] + 0.5 * (2 * pts[-2] - pts[-3]) if len(pts) > 2 else pts[-1]
    if spec.get("curl"):
        amp, turns = spec["curl"]
        ph = rng.uniform(0, 2 * np.pi)
        t = np.linspace(0, 1, len(pts))
        for i in range(1, len(pts)):
            dd = pts[min(i + 1, len(pts) - 1)] - pts[i - 1]
            dd /= max(np.linalg.norm(dd), 1e-9)
            e1 = np.cross(dd, [0, 1.0, 0])
            if np.linalg.norm(e1) < 1e-3:
                e1 = np.cross(dd, [1.0, 0, 0])
            e1 /= np.linalg.norm(e1)
            e2 = np.cross(dd, e1)
            a = ph + 2 * np.pi * turns * t[i] * rng.uniform(0.85, 1.15)
            pts[i] = pts[i] + (np.cos(a) * e1 + np.sin(a) * e2) * amp * min(1.0, t[i] * 3)
    return pts


def _ribbon(pts, width, flat, col, rng, P, UV, F):
    """A card along `pts`, `width` wide (narrowing to the tip), lying flat to `flat` (a function of a
    point: the outward direction there), its UVs one column of the atlas — v 1 at the root."""
    n = len(pts) - 1
    base = len(P)
    for k, p in enumerate(pts):
        t = k / n
        dd = pts[min(k + 1, n)] - pts[max(k - 1, 0)]
        side = np.cross(dd, flat(p))
        side /= max(np.linalg.norm(side), 1e-9)
        w = width * (1 - 0.2 * t)  # (the strands taper in the texture: a card narrowed to a point, a shard)
        P += [p - side * w / 2, p + side * w / 2]
        UV += [((col + 0.03) / 4, 1 - t * 0.985), ((col + 0.97) / 4, 1 - t * 0.985)]
    for k in range(n):
        a = base + 2 * k
        F.append([a, a + 1, a + 3, a + 2])


def cap_texture(size=256, seed=5, kind="strands"):
    """A card style's cap: dark, fine strands running down (its v), the cards over it; `fuzz`: an afro's
    tight coils, a fuzzy mottle."""
    rng = _rng(seed)
    if kind == "fuzz":
        coarse = rng.uniform(size=(size // 8, size // 8))
        field = np.kron(coarse, np.ones((8, 8)))
        k = np.ones(9) / 9
        for ax in (0, 1):
            field = np.apply_along_axis(lambda r: np.convolve(np.pad(r, 4, mode="wrap"), k, "valid"), ax, field)
        lum = np.clip(0.28 + 0.22 * field + 0.08 * rng.normal(size=(size, size)), 0, 1)
        return np.dstack([lum, lum, lum, _cap_alpha(size, rng)])
    x = np.arange(size) / size
    st = np.zeros(size)
    for f in rng.integers(20, 120, 50):
        st += np.sin(2 * np.pi * (f * x + rng.uniform())) * rng.uniform(0.2, 1) / np.sqrt(f)
    st = (st - st.min()) / (st.max() - st.min())
    lum = np.clip(0.34 + 0.16 * st[None, :] + 0.03 * rng.normal(size=(size, size)), 0, 1)
    return np.dstack([lum, lum, lum, _cap_alpha(size, rng)])


def _cap_alpha(size, rng):
    """The cap's alpha: none at the hairline (v 0: the image's bottom rows), whole by ~0.3 dm over it, the
    edge broken strand by strand — the mesh's stair-stepped edge gone soft."""
    rows = (size - 1 - np.arange(size))[:, None] / size  # v of each row
    jitter = rng.uniform(0.0, 0.12, size)[None, :]
    # (over ~0.2 dm: the mesh's edge steps a row at a time, and a narrow fade kept their shape)
    return np.clip((rows - jitter) / 0.24, 0, 1) ** 1.3


def make_card_hair(name, V, F0, Z, J, seed=7):
    """A card style's pieces (as make_hair's): the cap, and its cards (alpha) — each vertex with the body
    vertex it grows from (its weights, its other bodies' moves)."""
    spec = CARDS[name]
    rng = _rng(seed)
    kind, y = Z[0], Z[2]
    c, _ = landmarks_head(V, Z, J, F0)
    az = np.abs(np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]))
    line = J["brow"][1] + _interp(LINE, az)
    # (not under the skull: there the head's kind runs down the neck, and strands grew from under the jaw;
    # the forehead and the temples, as near the head's axis, kept)
    rad = np.hypot(V[:, 0] - c[0], V[:, 2] - c[2])
    keep = (kind == HEAD) & (y >= line) & ~((rad < 0.62) & (y < J["brow"][1] - 0.2))
    # (the cap a little inside the hairline: its edge is the mesh's, hard — fine strands rooted on the skin
    # between them make the line, soft)
    capline = line + 0.14
    capkeep = keep & (y >= capline)
    if spec.get("strip"):
        capkeep &= np.abs(V[:, 0] - c[0]) < spec["strip"] + 0.08
    Q, N, faces, used = _shell(V, F0, capkeep, spec["vol"], capline, spec.get("curl", (0, 0))[0] * 0.3, seed)
    # (the cap darker than the cards, in fine strands of its own: in the hair's colour and smooth it
    # read as skin, a bare forehead between the cards)
    out = [("", Q, _cap_uv(V, c, capline), [(f, f) for f in faces], np.arange(len(V)), False, cap_texture())]
    body = (kind == HEAD) | (kind == TORSO)
    hull = Hull(np.concatenate([V[body], Q[used]]), np.array([c[0], 0, c[2]]))
    hull.neck = J["neck"][1]
    cap = _Cap(Q[used], N[used])
    bf = [f[0] for f in F0 if f[2] == "body" and all(kind[v] == TORSO for v in f[0])]
    bu = np.array(sorted({v for f in bf for v in f}))
    BN = normals(V, bf)
    if np.sum(np.einsum("ij,ij->i", BN[bu], V[bu] - V[bu].mean(0))) < 0:
        BN = -BN
    hull.body = _Cap(V[bu], BN[bu])
    part_x = c[0] + spec.get("part", 0.0)
    # ties (a ponytail's one, pigtails' two): each strand to its nearest
    ties = [np.array([c[0] + tx, J["brow"][1] + ty, J["brow"][2] + tz]) for tx, ty, tz in spec.get("ties", [])]

    def tie_of(p):
        return min(ties, key=lambda t: np.linalg.norm(t - p)) if ties else None

    # (where strands root: `strip` a band down the middle — a mohawk's; `top_only` over this much above
    # the brow — an undercut's; the cap the strip's too, its sides the bare skin)
    def rooted(f, P_):
        m = P_[f].mean(0)
        if spec.get("strip") and abs(m[0] - c[0]) > spec["strip"]:
            return False
        return not (spec.get("top_only") and m[1] - J["brow"][1] < spec["top_only"])

    def flat(p):
        # (lying on what's under it: out from the head's middle above the neck, out from the body's
        # axis below)
        o = p - c if p[1] > hull.neck else np.array([p[0] - c[0], 0, p[2] - c[2]])
        return o / max(np.linalg.norm(o), 1e-9)

    P, UV, F, src = [], [], [], []
    roots, nr, near = _sample_tris(Q, N, [f for f in faces if rooted(f, Q)], spec["n"], rng)
    for i in range(len(roots)):
        p0, n0 = roots[i] - nr[i] * 0.02, nr[i]
        a = abs(np.arctan2(p0[0] - c[0], p0[2] - c[2]))
        over = p0[1] - J["brow"][1]
        # its length: the front's over the forehead, the side's round to the back's; the crown's on top
        ln = np.interp(a, [0, 1.2, 2.2, np.pi], [spec["front"], spec["side"], spec["back"], spec["back"]])
        ln = ln * (1 - np.clip((over - 0.9) / 0.6, 0, 1)) + spec["top"] * np.clip((over - 0.9) / 0.6, 0, 1)
        # (near the hairline shorter and finer: no hard edge)
        edge = np.clip((p0[1] - line[near[i]]) / 0.25, 0, 1)
        ln *= rng.uniform(0.85, 1.1) * (0.8 + 0.2 * edge)
        tie = tie_of(p0)
        d0 = _comb(spec, p0, n0, c, part_x, tie)
        if spec.get("tuck") and a > 1.0:
            # (a bob's sides tucked in toward the jaw at the ends)
            d0 = d0 + np.array([0, -spec["tuck"], 0])
        for layer in (0, 1):
            if layer and rng.uniform() > spec["outer"]:
                continue
            q0 = p0 + n0 * (0.035 * layer)
            pts = _strand(spec, q0, n0, d0 + rng.normal(scale=0.03, size=3), ln * (0.95 if layer else 1), cap,
                          hull, rng, tie)  # fmt: skip
            b = len(P)
            w = spec["width"] * rng.uniform(0.8, 1.15) * (0.75 if layer else 1) * (0.6 + 0.4 * edge)
            _ribbon(pts, w, flat, int(rng.integers(0, 4)), rng, P, UV, F)
            src += [near[i]] * (len(P) - b)
    # the hairline: fine strands rooted on the skin between the hairline and the cap, combed as the rest —
    # the line soft, no cap's edge
    # (the forehead, the temples and the sides over the ears: under them, round the back, they hung on the
    # neck as tufts)
    bandf = [f[0] for f in F0 if f[2] == "body" and all(keep[v] for v in f[0]) and np.mean([y[v] - capline[v] for v in f[0]]) < 0.04
             and np.mean([az[v] for v in f[0]]) < 1.9 and rooted(f[0], V)]  # fmt: skip
    if bandf:
        BNb = normals(V, bandf)
        bu2 = np.array(sorted({v for f in bandf for v in f}))
        if np.sum(np.einsum("ij,ij->i", BNb[bu2], V[bu2] - c)) < 0:
            BNb = -BNb
        hroots, hn, hnear = _sample_tris(V, BNb, bandf, spec.get("hairline", 260), rng)
        for i in range(len(hroots)):
            p0, n0 = hroots[i], hn[i]
            a = abs(np.arctan2(p0[0] - c[0], p0[2] - c[2]))
            ln = np.interp(a, [0, 1.2, 2.2, np.pi], [spec["front"], spec["side"], spec["back"], spec["back"]])
            # (the line's own: finer, a little shorter at its very edge)
            edge = np.clip((p0[1] - line[hnear[i]]) / 0.14, 0, 1)
            tie = tie_of(p0)
            d0 = _comb(spec, p0, n0, c, part_x, tie) + rng.normal(scale=0.03, size=3)
            pts = _strand(spec, p0 + n0 * 0.01, n0, d0, ln * rng.uniform(0.75, 1.0) * (0.7 + 0.3 * edge), cap, hull, rng, tie)
            b = len(P)
            _ribbon(pts, spec["width"] * rng.uniform(0.45, 0.65), flat, int(rng.integers(0, 4)), rng, P, UV, F)
            src += [hnear[i]] * (len(P) - b)
    if spec.get("cover"):
        # a cover of short cards over the top of the head: the long ones are few there, and the cap
        # showed between them, a shiny band
        count, length = spec["cover"]
        top = [f for f in faces if np.mean([y[v] - line[v] for v in f]) > 0.25 and rooted(f, Q)]
        croots, cn, cnear = _sample_tris(Q, N, top, count, rng)
        cspec = {**spec, "seg": 3, "fall": 0.3, "lift": 0.04, "hug": 0.9}
        for i in range(len(croots)):
            p0, n0 = croots[i] - cn[i] * 0.015, cn[i]
            tie = tie_of(p0)
            d0 = _comb(spec, p0, n0, c, part_x, tie) + rng.normal(scale=0.03, size=3)
            pts = _strand(cspec, p0, n0, d0, length * rng.uniform(0.8, 1.15), cap, hull, rng, tie)
            b = len(P)
            _ribbon(pts, spec["width"] * 0.9, flat, int(rng.integers(0, 4)), rng, P, UV, F)
            src += [cnear[i]] * (len(P) - b)
    for tie in ties if spec.get("tail") else []:
        # a tail: cards from the tie, gathered, falling (out to its side, a pigtail's)
        count, length = spec["tail"]
        nb = used[np.argmin(np.linalg.norm(V[used] - tie, axis=1))]
        tspec = {**spec, "seg": 10, "fall": 1.0, "lift": 0.0, "hug": 0.5, "curl": spec.get("tail_curl")}
        out_x = np.sign(tie[0] - c[0]) * 0.8 if abs(tie[0] - c[0]) > 0.3 else 0.0
        for _ in range(count):
            # (spread at the tie and fanned as it falls: from one point the tail was a thin bundle)
            off = rng.normal(scale=0.13, size=3) * np.array([1.0, 0.6, 0.5])
            p0 = tie + off
            d0 = np.array([out_x, -0.3, -1.0 + abs(out_x) * 0.6]) + rng.normal(scale=0.25, size=3)
            pts = _strand(tspec, p0, np.array([0, 0, -1.0]), d0 / np.linalg.norm(d0), length * rng.uniform(0.8, 1.05),
                          cap, hull, rng)  # fmt: skip
            b = len(P)
            _ribbon(pts, spec["width"] * rng.uniform(0.9, 1.3), flat, int(rng.integers(0, 4)), rng, P, UV, F)
            src += [nb] * (len(P) - b)
    # each card vertex goes with the body vertex nearest it — the head's on the head, the back's and the
    # shoulders' down them: with its root's (the head's) all the way down, a long strand swung with every
    # turn of the head, through the throat and the shoulders
    P = np.array(P)
    near_body = np.where((kind == HEAD) | (kind == TORSO))[0]
    B = V[near_body]
    src = np.array(src)
    for i0 in range(0, len(P), 1500):
        chunk = P[i0 : i0 + 1500]
        d = ((chunk[:, None, :] - B[None, :, :]) ** 2).sum(-1)
        far = chunk[:, 1] < J["neck"][1] + 0.4
        src[i0 : i0 + 1500] = np.where(far, near_body[np.argmin(d, 1)], src[i0 : i0 + 1500])
    out.append(("cards", P, np.array(UV), F, src, True))
    if spec.get("bun"):
        # a bun (a topknot's) over its tie: a lumpy round in the cap's fine strands
        bx, by, bz, br = spec["bun"]
        pull = np.array([c[0] + bx, J["brow"][1] + by, J["brow"][2] + bz])
        BP, BF = _sphere(pull, br, rng)
        nb = used[np.argmin(np.linalg.norm(V[used] - pull, axis=1))]
        out.append(("bun", BP, _shell_uv(BP, pull), [(f, f) for f in BF], np.full(len(BP), nb), False, cap_texture(seed=9)))
    return out


# ---- plan 74, the technique samples (2026-11-10, the user: "maybe we need an alternative?")
#
# fur shells — layers of the skin over a beard or a scalp, each a little farther out; the game's shader
# cuts round strand sections out of each (thinner and fewer the higher), so short hair has volume and a
# soft, broken edge. Each vertex carries `_shell`: (its layer 0…1, the density there, 0).

FUR = {
    "buzzfur": {"kind": "shell", "on": "scalp", "layers": 7, "height": 0.05},
    # (a fade: the buzz's, its height and density falling away down the sides and the nape)
    "fadefur": {"kind": "shell", "on": "scalp", "layers": 7, "height": 0.07, "fade": True},
}
BEARD_FUR = set()  # (the beards' fur is every BEARD style's now: make_beard_fur)


def make_fur(name, V, F0, Z, J, seed=13, layers=None):
    """A fur's pieces (as make_hair's, an 8th: attributes of its own); `layers` fewer, as one under
    another's hair (only the scalp to cover)."""
    spec = FUR[name] if layers is None else {**FUR[name], "layers": layers}
    return _make_shells(name, spec, V, F0, Z, J, seed)


COARSE = 0.35  # (the fur's skin: this share of its triangles)


def _coarse(P, faces, ratio):
    """The mesh (P, faces) decimated to `ratio` of its triangles (Blender's collapse) → (P', faces')."""
    import bpy

    me = bpy.data.meshes.new("coarse")
    me.from_pydata(P.tolist(), [], faces)
    ob = bpy.data.objects.new("coarse", me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new("decimate", "DECIMATE")
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m2 = ev.to_mesh()
    Q = np.array([v.co[:] for v in m2.vertices])
    F = [list(p.vertices) for p in m2.polygons]
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return Q, F


def _nearest(P, Q):
    """For each point of Q, the index of its nearest in P."""
    from mathutils import kdtree

    kd = kdtree.KDTree(len(P))
    for i, p in enumerate(P):
        kd.insert(p, i)
    kd.balance()
    return np.array([kd.find(q)[1] for q in Q])


def _make_shells(name, spec, V, F0, Z, J, seed):
    kind, y = Z[0], Z[2]
    if spec["on"] == "beard":
        d, c, mouth, zear = beard_density(spec["beard"], V, F0, Z, J)
        dy = y - mouth[1]
        r = 0.9
        u = np.arctan2(V[:, 0] - c[0], V[:, 2] - zear) * r
        # (down the face, then under the chin taken as further down: one sheet round the jaw)
        v = y + 0.8 * np.minimum(V[:, 2] - mouth[2], 0) * (dy < -0.2)
        hf = np.ones(len(V))
    else:
        c, _ = landmarks_head(V, Z, J, F0)
        az = np.abs(np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]))
        line = J["brow"][1] + _interp(LINE, az)
        rad = np.hypot(V[:, 0] - c[0], V[:, 2] - c[2])
        keep = (kind == HEAD) & ~((rad < 0.62) & (y < J["brow"][1] - 0.2))
        # (not the ears: far out at the side, under the crown)
        ear = (np.abs(V[:, 0] - c[0]) > 0.76) & (y < J["brow"][1] + 0.4)
        d = np.where(keep & ~ear, np.clip((y - line) / 0.25, 0, 1), 0.0)
        hf = np.ones(len(V))
        if spec.get("fade"):
            # short and thin from the ears' top down, full from the temples up
            up = np.clip((y - (J["brow"][1] + 0.1)) / 0.55, 0, 1)
            hf = 0.12 + 0.88 * up
            d = d * (0.55 + 0.45 * up)
        u = np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]) * 0.85
        v = y
    # (a face where it grows — the faintest fringe down the neck only cost triangles)
    faces = [f[0] for f in F0 if f[2] == "body" and max(d[x] for x in f[0]) > 0.08]
    used = np.array(sorted({x for f in faces for x in f}))
    N = normals(V, faces)
    if np.sum(np.einsum("ij,ij->i", N[used], V[used] - c)) < 0:
        N = -N
    K, h = spec["layers"], spec["height"]
    n = len(V)
    P, UV, F, src, attr = [], [], [], [], []
    # (each layer only the vertices its faces use — it copied the whole body's every layer: 2 MB a
    # full beard, ~14k vertices × 16 for ~1k on the face)
    loc = -np.ones(n, int)
    loc[used] = np.arange(len(used))
    lf = [[int(loc[x]) for x in f] for f in faces]
    # (plan 75: laid on a coarse copy of the skin — the shader cuts the strands, the face's fine mesh only
    # cost triangles: a full beard's 10 layers were 30k. Each coarse vertex takes its nearest skin
    # vertex's lean, density and weights)
    base, cf = _coarse(V[used], lf, spec.get("coarse", COARSE))
    near = used[_nearest(V[used], base)]
    m = len(base)
    for k in range(1, K + 1):
        t = k / K
        P.append(base + N[near] * (0.003 + h * hf[near] * t * (0.35 + 0.65 * d[near]))[:, None])
        UV.append(np.stack([u[near], v[near]], 1))
        F += [[x + (k - 1) * m for x in f] for f in cf]
        src.append(near)
        attr.append(np.stack([np.full(m, t), d[near], hf[near]], 1))
    return [("shell", np.vstack(P), np.vstack(UV), [(f, f) for f in F], np.concatenate(src), True, None,
             {"_shell": np.vstack(attr)})]  # fmt: skip



# ---- plan 74, the Sketchfab sample (2026-11-10, the user: "get like 5 and give me a sample") — CC-BY
# card hair made by others for their own heads, fitted to ours: each one's head (its base mesh's top
# decimetre, or set by hand for a hair alone) scaled and moved onto ours, then kept off the scalp and the
# shoulders. Vincent Page's come without their textures: each card is laid on our own strand atlas
# instead (the root end — the end nearest the head — at the column's top). The files: `$HAIR_IMPORTS`
# (yutopia-art-src/sketchfab), made by the sf_extract scripts.

def _sources():
    """The works by others (plan 75): sources.json — each one's file and build options; its credit too."""
    import json

    S = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources.json")))
    return {k: {**e["build"], "file": f"{e['dir']}/{e['out']}"} for k, e in S.items()}


# (11-10: the user — "only use complete hair": each with its own texture. `under` a fur of ours beneath —
# a scalp's or a beard's gaps filled, a shaved side stubbled; a buzz unless said (None: none); `tex:
# atlas` our strand sheet laid on its own UVs; `fit: beard` placed by our beard; `source` not a style of
# its own — sources.json)
IMPORTED = _sources()
IMPORTS_DIR = os.environ.get("HAIR_IMPORTS", os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/sketchfab"))

# The wardrobe's hairs (shared/avatar.ts) as made (plan 75 phase 1): a work above, our fur ("fur:"), or
# MakeHuman's CC0 hair (wear.py GARMENTS, under the same name) — the rest stay as plan 74 made them
WARDROBE_HAIR = {
    "short": "sfmshort", "long": "sflong1", "curly": "sfcurly", "bun": "sfbun", "afro": "sfcurly2",
    "bob": "sfshort2", "mohawk": "sfmbraid", "ponytail": "sfpony", "spiky": "sfmshag", "wavy": "sfwavy",
    "cornrows": "sfcorn", "swept": "sflong2", "curtain": "sfbob2",
    "buzz": "fur:buzzfur", "fade": "fur:fadefur",
    "crew": "mh", "slick": "mh", "pixie": "mh",
}  # fmt: skip


def _cranium(V, kind):
    H = V[kind == HEAD]
    top = H[:, 1].max()
    C = H[H[:, 1] > top - 1.0]
    return np.array([(C[:, 0].min() + C[:, 0].max()) / 2, (C[:, 2].min() + C[:, 2].max()) / 2,
                     np.ptp(C[:, 0]), np.ptp(C[:, 2]), top])  # fmt: skip


def make_imported(name, V, F0, Z, J, under=True):
    from mathutils import kdtree

    spec = IMPORTED[name]
    d = np.load(os.path.join(IMPORTS_DIR, spec["file"]))
    P, UV, F = d["P"].astype(float), d["UV"].astype(float), d["F"]
    theirs = np.array(spec.get("cranium", d["cranium"]) if "cranium" in spec else d["cranium"], dtype=float)
    ours = _cranium(V, np.asarray(Z[0]))
    if spec.get("fit") == "beard":
        # (a beard by our beard's box: its width and height onto ours, its front onto our chin's)
        bd = beard_density("full", V, F0, Z, J)[0]
        B = V[bd > 0.3]
        lo, hi = P.min(0), P.max(0)
        sx = np.ptp(B[:, 0]) / max(hi[0] - lo[0], 1e-9)
        sy = np.ptp(B[:, 1]) / max(hi[1] - lo[1], 1e-9)
        Q = np.stack([(P[:, 0] - (lo[0] + hi[0]) / 2) * sx + (B[:, 0].min() + B[:, 0].max()) / 2,
                      (P[:, 1] - lo[1]) * sy + B[:, 1].min(),
                      (P[:, 2] - hi[2]) * sx + B[:, 2].max()], 1)  # fmt: skip
    else:
        sx, sz = ours[2] / theirs[2], ours[3] / theirs[3]
        s = np.array([sx, (sx + sz) / 2, sz])
        Q = np.stack([(P[:, 0] - theirs[0]) * s[0] + ours[0], (P[:, 1] - theirs[4]) * s[1] + ours[4],
                      (P[:, 2] - theirs[1]) * s[2] + ours[1]], 1)  # fmt: skip
    if "card" in d.files:
        card = d["card"]
    else:
        # (each loose part a card: joined by the faces)
        par = np.arange(len(P))

        def root(i):
            while par[i] != i:
                par[i] = par[par[i]]
                i = par[i]
            return i

        for f in F:
            a = root(f[0])
            for x in f[1:]:
                b = root(x)
                if a != b:
                    par[b] = a
        card = np.array([root(i) for i in range(len(P))])
    if spec.get("fit") != "beard":
        # (11-10 "it's all strange": placed by a guessed head, the hair's cap went into our scalp here
        # and there — each point then pushed out alone, the layers crushed to a shell)
        kind = np.asarray(Z[0])
        hv = np.where(kind == HEAD)[0]
        hN = normals(V, [f[0] for f in F0 if f[2] == "body"])
        if np.sum(np.einsum("ij,ij->i", hN[hv], V[hv] - V[hv].mean(0))) < 0:
            hN = -hN  # (the mesh's normals point in: out, as the fur's are made)
        kh = kdtree.KDTree(len(hv))
        for i, v in enumerate(hv):
            kh.insert(V[v], i)
        kh.balance()
        hcen = V[hv].mean(0)
        # (a uniform scale to clear the scalp blew each style up — its cap sat in our head at a few
        # places only. Lifted locally instead: how far out the hair must come over each scalp vertex
        # (its innermost there to 6 mm off), spread smoothly over the head, then each hair point out by
        # its scalp vertex's lift — fully at the scalp, a third of it 1.5 dm out — the style's size kept)
        hidx = {v: k for k, v in enumerate(hv)}
        nbr = [set() for _ in hv]
        for f in F0:
            if f[2] != "body":
                continue
            ks = [hidx[v] for v in f[0] if v in hidx]
            for x in ks:
                nbr[x].update(ks)
        nbl = [np.fromiter(n - {k}, int) if len(n) > 1 else np.array([k]) for k, n in enumerate(nbr)]
        near = np.zeros(len(Q), int)
        off = np.zeros(len(Q))
        for i in range(len(Q)):
            _, j, _ = kh.find(Q[i])
            near[i] = j
            off[i] = (Q[i] - V[hv[j]]) @ hN[hv[j]]
        need0 = np.zeros(len(hv))
        # (the scalp only — above the ears' tops: a card behind the face or down the neck asked 2–3 dm,
        # and tore its style into spikes — and never more than 2.5 cm)
        scalp = V[hv[near], 1] > J["brow"][1] - 0.3
        close = (off < 1.2) & scalp
        np.maximum.at(need0, near[close], np.minimum(0.06 - off[close], 0.25))
        need = need0.copy()
        for _ in range(12):
            need = np.maximum(need0, np.array([need[n].mean() for n in nbl]))
        w = np.clip(1.2 - off / 1.5, 0.33, 1.0)
        D = hN[hv[near]] * (need[near] * w)[:, None]
        # (a card moved whole, by its points' mean lift — lifted point by point, its points went
        # different ways and it tore into spikes; a big joined mesh keeps its smooth field)
        for c in np.unique(card):
            m = card == c
            if m.sum() <= 3000:
                D[m] = D[m].mean(0)
        Q = Q + D
        print(f"  {name}: on the scalp (lifted up to {need.max():.3f} dm, mean {need[need > 0].mean() if (need > 0).any() else 0:.3f})")
    # (strays: cards of a neighbour's hair given to this head — their top far round from it)
    keepv = np.ones(len(Q), bool)
    for c in np.unique(card):
        m = card == c
        t = Q[m][np.argmax(Q[m][:, 1])]
        if np.hypot(t[0] - ours[0], t[2] - ours[1]) > 1.6:
            keepv[m] = False
    # kept off the body: each point out along its nearest body vertex's normal to 0.03 dm at least
    bf = [f[0] for f in F0 if f[2] == "body"]
    bv = np.array(sorted({v for f in bf for v in f}))
    N = normals(V, bf)
    if np.sum(np.einsum("ij,ij->i", N[bv], V[bv] - V[bv].mean(0))) < 0:
        N = -N  # (out: pointing in, the push off the body drove hair into it)
    kd = kdtree.KDTree(len(bv))
    for i, v in enumerate(bv):
        kd.insert(V[v], i)
    kd.balance()
    src = np.zeros(len(Q), int)
    for i in range(len(Q)):
        _, j, _ = kd.find(Q[i])
        v = bv[j]
        src[i] = v
        off = (Q[i] - V[v]) @ N[v]
        if off < 0.03:
            Q[i] = Q[i] + N[v] * (0.03 - off)
        elif spec.get("fit") == "beard" and off > 0.22:
            Q[i] = Q[i] - N[v] * (off - 0.22)  # (a beard on the skin: no more than 2 cm off it)
    if spec.get("tex") == "atlas":
        # (a sheet of strands a column wide — the clump atlas left their wide cards near empty; its
        # sides feathered, raggedly, or each card's straight edge showed)
        tex = np.load(os.environ.get("HAIR_SHEET", os.path.join(IMPORTS_DIR, "hair-sheet.npy"))).copy()
        h, w = tex.shape[:2]
        u = (np.arange(w) % (w // 4)) / (w // 4)
        rag = 0.06 * np.sin(np.arange(h)[:, None] * 0.37 + np.arange(4).repeat(w // 4)[None] * 1.7) ** 2
        edge = np.clip(np.minimum(u[None] - 0.04, 0.9 - u[None]) / (0.14 + rag), 0, 1)
        tex[..., 3] *= edge
        # each card on a column of ours: its strand axis (the UV axis its distance from the head follows)
        # along v, root end up
        hc = np.array([ours[0], ours[4] - 0.9, ours[1]])
        dist = np.linalg.norm(Q - hc, axis=1)
        NUV = UV.copy()
        for k, c in enumerate(np.unique(card)):
            m = np.where(card == c)[0]
            u, v = UV[m, 0], UV[m, 1]
            if max(np.ptp(u), np.ptp(v)) < 1e-4 and len(m) >= 3:
                # (no UVs in the file — w02's: the card's own shape, its long axis and the one across)
                X = Q[m] - Q[m].mean(0)
                _, _, ax = np.linalg.svd(X, full_matrices=False)
                v, u = X @ ax[0], X @ ax[1]
            a = [abs(np.corrcoef(x, dist[m])[0, 1]) if np.ptp(x) > 1e-6 and np.ptp(dist[m]) > 1e-6 else 0 for x in (u, v)]
            along, across = (v, u) if a[1] >= a[0] else (u, v)
            t = (along - along.min()) / max(np.ptp(along), 1e-6)
            if np.ptp(dist[m]) > 1e-6 and np.corrcoef(t, dist[m])[0, 1] > 0:
                t = 1 - t  # (the root end — nearest the head — at 1: the column's top)
            w = (across - across.min()) / max(np.ptp(across), 1e-6)
            col = k % 4
            NUV[m, 0] = (col + 0.04 + 0.92 * w) / 4
            NUV[m, 1] = 0.02 + 0.96 * t
        UV = NUV
    else:
        tex = d["tex"].copy()
        if "flat" in spec:
            # (its own light and dark kept only so much — its bands read as wood grain; ours lights it)
            m = tex[..., 3] > 0.5
            mean = tex[..., :3][m].mean(0) if m.any() else 0.5
            tex[..., :3] = mean + (tex[..., :3] - mean) * spec["flat"]
    fk = [f for f in F.tolist() if keepv[f].all()]
    used = np.array(sorted({v for f in fk for v in f}))
    remap = -np.ones(len(Q), int)
    remap[used] = np.arange(len(used))
    fk = [[int(remap[v]) for v in f] for f in fk]
    out = [("cards", Q[used], UV[used], [(f, f) for f in fk], src[used], True, tex)]
    under = spec.get("under", "buzzfur") if under else None
    if under:
        # (our fur beneath, named for its kind — the game's shell light reads it off the name)
        for pc in make_fur(under, V, F0, Z, J, layers=3):
            out.append((f"{under}-{pc[0]}",) + tuple(pc[1:]))
    return out


# ---- plan 74, 11-10: the beards optimized (the user: "lets optimize the beards") — every style a fur of
# ours cut to its ground (beard_density), and over it the Sketchfab beard's strands kept where the style
# grows, shortened for the short styles; stubble fur alone. In place of the strand cards of phase 5.
BEARD_FUR_SPEC = {  # fur: layers, height (dm); strands: how much of their length kept (None: none)
    # (layers cut 11-10 for the cost — 16 drew 51k triangles a full beard, each its own pass)
    "full": (10, 0.2, 1.0),
    "boxed": (8, 0.12, 0.6),
    "stubble": (3, 0.012, None),
    "mustache": (6, 0.1, 0.75),
    "goatee": (8, 0.15, 0.9),
    "chinstrap": (6, 0.08, 0.5),
    "muttonchops": (8, 0.13, 0.8),
}


def make_beard_fur(style, V, F0, Z, J):
    layers, height, keep = BEARD_FUR_SPEC[style]
    fur = _make_shells(style, {"on": "beard", "beard": style, "layers": layers, "height": height}, V, F0, Z, J, 13)
    out = [("fur-" + pc[0],) + tuple(pc[1:]) for pc in fur]
    if keep is None or not os.path.exists(os.path.join(IMPORTS_DIR, IMPORTED["sfbeard"]["file"])):
        return out
    d = beard_density(style, V, F0, Z, J)[0]
    for pc in make_imported("sfbeard", V, F0, Z, J, under=False):
        suffix, P, UV, F, src, alpha, tex = pc[:7]
        # (where the style grows: a strand's every point over its ground; drawn in toward the skin by
        # what of its length the style keeps)
        P = V[src] + (P - V[src]) * keep
        fk = [f for f in F if (d[src[list(f[0])]] > 0.3).all()]
        if not fk:
            continue
        used = np.array(sorted({v for f in fk for v in f[0]}))
        remap = -np.ones(len(P), int)
        remap[used] = np.arange(len(used))
        fk = [([int(remap[v]) for v in f[0]],) * 2 for f in fk]
        out.append((suffix, P[used], UV[used], fk, src[used], alpha, tex))
    return out


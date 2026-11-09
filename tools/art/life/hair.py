# Plan 73 phase 5 — the life look's hair, made by script (decided 2026-11-09: "shell plus strand
# cards"). A style is a shell grown off the scalp — the body's own head above a hairline, set off by the
# hair's volume — and strand cards rooted in it, combed from the crown and let fall (or out, or back to
# a bun), kept off the head and the body as they go. A beard is the same off the jaw. Both take the
# weights and the face's shapes of the skin they grow from, so they follow the jaw and the brows.
#
# Units are MakeHuman's (decimetres, y up, facing +z, the person's left +x).
import numpy as np

from wear import HEAD, TORSO, boundary, normals

# `line`: the hairline over the brow (dm) by how far round from the front (radians: 0 the forehead, π/2
# over the ear, π the nape); `vol` the shell off the scalp; `curl` its bumps; cards: how many, how long,
# `fall` how hard they're pulled down, `out` how much they stand off the scalp, `seg` their segments
HAIR = {
    "bun": {"line": [(0, 0.5), (0.9, 0.35), (1.35, 0.12), (1.8, 0.05), (2.4, -0.55), (np.pi, -0.85)],
            "vol": 0.08, "cards": 0, "len": 0.7, "fall": 0.0, "to_bun": 1.0, "out": 0.02, "seg": 4, "width": 0.3,
            "bare": 0.3,
            "bun": (0.0, 1.05, -0.95, 0.42)},  # (x, over the brow, back of the brow, radius)
}  # fmt: skip
BEARD = {
    # the beard's upper edge by how far round (0 the chin, 1.45 the sideburn), over the mouth
    "beard": {"top": [(0, 0.105), (0.2, 0.12), (0.4, 0.2), (0.7, 0.3), (1.0, 0.44), (1.2, 0.6), (1.45, 0.75)],
              "back": 1.42, "vol": 0.035, "soft": 3,
              "strokes": 16000, "stroke_px": (10, 22)},
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


def _shell_uv(V, c):
    """The shell's streaks: round the head (six tiles) by height — they run down."""
    u = (np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]) + np.pi) / (2 * np.pi) * 6
    return np.stack([u, V[:, 1] / 0.8], 1)


def make_hair(name, V, F0, Z, J, seed=7):
    """A hairstyle's pieces: [(suffix, positions, uvs, faces as vertex lists, each vertex's source on the
    body, alpha)] — the shell, the cards (and a bun)."""
    spec = HAIR[name]
    kind, y = Z[0], Z[2]
    c, _ = landmarks_head(V, Z, J, F0)
    az = np.abs(np.arctan2(V[:, 0] - c[0], V[:, 2] - c[2]))
    line = J["brow"][1] + _interp(spec["line"], az)
    keep = (kind == HEAD) & (y >= line)
    # (the edge of the scalp: snapped straight, as a garment's)
    Q, N, faces, used = _shell(V, F0, keep, spec["vol"], line, spec.get("curl", 0.0), seed, spec.get("dome", 0.0))
    out = [("", Q, _shell_uv(V, c), faces, np.arange(len(V)), False)]
    # cards: rooted a little inside the shell (their roots hidden), combed from the crown
    rng = _rng(seed)
    if not spec["cards"]:
        # (no cards: the shell alone — and a bun's sphere — the cards read as planks up close)
        if "bun" in spec:
            bx, by, bz, br = spec["bun"]
            pull = np.array([bx, J["brow"][1] + by, J["brow"][2] + bz])
            BP, BF = _sphere(pull, br, rng)
            near = used[np.argmin(np.linalg.norm(V[used] - pull, axis=1))]
            out.append(("bun", BP, _shell_uv(BP, pull), BF, np.full(len(BP), near), False))
        return out
    # (none rooted just over the hairline in front: they hung over the face)
    near_line = y[used] < line[used] + spec.get("bare", 0)
    rootable = used[~(near_line & ((az[used] < 1.3) | spec.get("bare_all", False)))]
    # (`face`: none rooted round the front at all — long hair hung over the face; the shell's combed back)
    if "face" in spec:
        rootable = rootable[az[rootable] >= spec["face"]]
    pick = rng.choice(rootable, size=min(spec["cards"], len(rootable)), replace=False)
    roots = Q[pick] - N[pick] * spec["vol"] * 0.4
    # combed away from the face: out round the head (its forward part dropped: to the sides), back, down
    flow = roots - c
    flow[:, 1] = 0
    flow[:, 2] = np.minimum(flow[:, 2], 0)
    zero = np.linalg.norm(flow, axis=1) < 0.2
    flow[zero, 0] = np.where(np.arange(len(pick))[zero] % 2 == 0, 1.0, -1.0)
    flow /= np.linalg.norm(flow, axis=1)[:, None]
    # (a parting: those over the face's front swept harder to the sides)
    front = az[pick] < 1.0
    flow[front, 0] *= spec.get("part", 1.0)
    flow += np.array([0, -spec["fall"] * 0.3, -spec.get("back", 0)])
    flow -= N[pick] * np.einsum("ij,ij->i", flow, N[pick])[:, None]
    dirs = flow + N[pick] * spec.get("out", 0.15)
    pull = None
    if "bun" in spec:
        bx, by, bz, _ = spec["bun"]
        pull = np.array([bx, J["brow"][1] + by, J["brow"][2] + bz])
    body = (kind == HEAD) | (kind == TORSO)
    shell_pts = Q[used]
    hull = Hull(np.concatenate([V[body], shell_pts]), np.array([c[0], 0, c[2]]))
    hull.neck = J["neck"][1]
    CP, CUV, CF, csrc = _grow(roots, dirs, N[pick], spec, hull, rng, pull)
    out.append(("cards", CP, CUV, CF, pick[csrc], True))
    if "bun" in spec:
        BP, BF = _sphere(pull, spec["bun"][3], rng)
        near = used[np.argmin(np.linalg.norm(V[used] - pull, axis=1))]
        out.append(("bun", BP, _shell_uv(BP, pull), BF, np.full(len(BP), near), False))
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


def make_beard(name, V, F0, VT, Z, J, size=512, seed=11):
    """A beard as a game's life-sim does one: painted hair on a thin shell over the jaw. Where it grows is
    a smooth density on the face — under the cheek line, before the ear, round the lips, fading down
    the neck — so it thins out before the mesh's own edge (cut on the mesh, its stair-steps showed).
    The shell takes the faces it touches, its own UVs (round the face, wrapping under the chin); its
    texture is strokes of hair combed down, solid where the density is, wisps where it fades.
    → [(suffix, positions, uvs, faces as (vertices, uvs, group), source, alpha, rgba)]"""
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
    # round the lips: an oval, a narrow fade
    # (its top at the lip line: a full moustache hangs over the upper lip)
    oval = ((V[:, 0] - mouth[0]) / 0.25) ** 2 + ((dy + 0.085) / 0.08) ** 2
    d *= np.where(az < 0.7, _smooth(1.0, 1.25, oval), 1.0)
    # not the nose
    d *= np.where((dy > 0.1) & (V[:, 2] > mouth[2] + 0.19), 0.0, 1.0)
    # down the neck, fading out
    d *= _smooth(-0.78, -0.58, dy)
    near = ((kind == HEAD) | (kind == TORSO)) & (az < spec["back"] + 0.1) & (dy > -1.0)
    d = np.where(near, d, 0.0)
    faces = [f[0] for f in F0 if f[2] == "body" and all(near[v] for v in f[0]) and max(d[v] for v in f[0]) > 0.02]
    used = np.array(sorted({v for f in faces for v in f}))
    N = normals(V, faces)
    if np.sum(np.einsum("ij,ij->i", N[used], V[used] - c)) < 0:
        N = -N
    Q = V + N * (0.008 + spec["vol"] * d)[:, None]
    # its UVs: round the face (the arc's length) by height, the depth going back under the chin taken
    # as further down
    r = np.hypot(V[used, 0] - c[0], V[used, 2] - zear).mean()
    arc = np.arctan2(V[:, 0] - c[0], V[:, 2] - zear) * r
    UV = np.stack([arc, y + 0.8 * np.minimum(V[:, 2] - mouth[2], 0) * (dy < -0.2)], 1)
    lo, hi = UV[used].min(0) - 0.05, UV[used].max(0) + 0.05
    span = (hi - lo).max()
    UV = (UV - lo) / span
    tri = [(f, f, "body") for f in faces]
    img = _beard_texture(tri, V, UV, d, size, _rng(seed), spec)
    return [("", Q, UV, tri, np.arange(len(V)), True, img)]


def _tri_raster(size, P, vals):
    """A triangle `P` (3×2 pixels) filled with `vals` (3×k) interpolated: (rows, cols, values)."""
    x0, y0 = np.floor(P.min(0)).astype(int)
    x1, y1 = np.ceil(P.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, size - 1), min(y1, size - 1)
    if x1 < x0 or y1 < y0:
        return None
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    a, b, c = P
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-9:
        return None
    l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
    l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
    l3 = 1 - l1 - l2
    m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    if not m.any():
        return None
    v = l1[m, None] * vals[0] + l2[m, None] * vals[1] + l3[m, None] * vals[2]
    return (ys[m] - 0.5).astype(int), (xs[m] - 0.5).astype(int), v


def _beard_texture(faces, V, UV, w, size, rng, spec):
    """The beard's RGBA: its density (in from the edge) and which way is down, drawn into the UV square;
    strokes of hair along that, many; grey (the game colours it)."""
    dens = np.zeros((size, size))
    down = np.zeros((size, size, 2))
    for vs, ts, _ in faces:
        for tri in ((0, 1, 2), (0, 2, 3)) if len(vs) == 4 else ((0, 1, 2),):
            iv = [vs[k] for k in tri]
            it = [ts[k] for k in tri]
            Pp = UV[it] * [size, -size] + [0, size]  # (pixels: rows down from v 1)
            # down the face in this triangle's pixels: where the height falls fastest
            A = np.stack([Pp[1] - Pp[0], Pp[2] - Pp[0]])
            dy = np.array([V[iv[1], 1] - V[iv[0], 1], V[iv[2], 1] - V[iv[0], 1]])
            try:
                g = np.linalg.solve(A, dy)
            except np.linalg.LinAlgError:
                continue
            dn = -g / max(np.linalg.norm(g), 1e-9)
            r = _tri_raster(size, Pp, np.stack([np.r_[w[iv[k]], dn] for k in range(3)]))
            if r is None:
                continue
            ys, xs, vals = r
            dens[ys, xs] = np.maximum(dens[ys, xs], vals[:, 0])
            down[ys, xs] = vals[:, 1:3]
    # strokes: rooted where there's beard, combed down the UV square (it runs down the face and on
    # under the chin), fanning out to the sides a little
    n = int(spec.get("strokes", 14000))
    cand = np.argwhere(dens > 0.02)
    pick = cand[rng.integers(0, len(cand), n * 3)]
    keep = rng.uniform(size=len(pick)) < dens[pick[:, 0], pick[:, 1]] ** 0.6
    pick = pick[keep][:n]
    d = np.stack([(pick[:, 1] / size - 0.5) * 0.5, np.ones(len(pick))], 1)
    d += rng.normal(scale=0.18, size=d.shape)
    d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-6)
    side = np.stack([-d[:, 1], d[:, 0]], 1)
    L = rng.uniform(*spec.get("stroke_px", (10, 22)), size=len(pick))
    bend = rng.normal(scale=0.25, size=len(pick))
    tone = rng.uniform(0.35, 1.0, size=len(pick))
    t = np.linspace(0, 1, 24)
    pts = (pick[:, None, ::-1].astype(float) + 0.5) + d[:, None] * (L[:, None] * t)[..., None] + side[:, None] * (
        bend[:, None] * L[:, None] * t**2
    )[..., None]
    fade = 1 - t**2  # (thinner to its tip)
    xi = np.clip(pts[..., 0].round().astype(int), 0, size - 1).ravel()
    yi = np.clip(pts[..., 1].round().astype(int), 0, size - 1).ravel()
    acc = np.zeros((size, size))
    lum = np.zeros((size, size))
    wgt = np.broadcast_to(fade, pts.shape[:2]).ravel()
    np.add.at(acc, (yi, xi), wgt)
    np.add.at(lum, (yi, xi), wgt * np.repeat(tone, len(t)))
    # (a hair's width: a touch of blur)
    k = np.array([0.25, 0.5, 0.25])
    for arr in (acc, lum):
        arr[:] = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, arr)
        arr[:] = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 0, arr)
    strands = np.clip(acc * 0.9, 0, 1)
    # solid where it's dense; where it fades, strands alone, thinning
    core = np.clip((dens - 0.6) / 0.3, 0, 1)
    edge = np.clip(dens / 0.8, 0, 1) ** 1.3
    alpha = np.clip(strands * edge + core * 0.9, 0, 1)
    # the colour: its own strokes, fewer, each light or dark — the hair's grain over its mean
    m = len(pick) // 3
    grain = np.zeros((size, size))
    sign = np.where(rng.uniform(size=m) < 0.5, 1.0, -1.0)
    gx = xi.reshape(len(pick), -1)[:m].ravel()
    gy = yi.reshape(len(pick), -1)[:m].ravel()
    np.add.at(grain, (gy, gx), np.repeat(sign, len(t)) * np.tile(fade, m))
    grain = np.clip(grain, -1, 1)
    l = np.clip(0.5 + 0.28 * grain - 0.06 * core, 0, 1)
    return np.dstack([l, l, l, alpha])


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
    # cards: strands as thin lines (gaussian across), each its own length; the clump's root darker
    cw = size // 4
    alpha = np.zeros((size, size))
    lum = np.full((size, size), 0.6)
    rows = np.arange(size)[:, None] / size  # 0 the root (image top: v 1 is the root)
    for col in range(4):
        for _ in range(70):
            cx = col * cw + rng.uniform(0.08, 0.92) * cw
            wd = rng.uniform(0.6, 1.8)
            ln = rng.uniform(0.55, 1.0)
            xs = np.arange(size)[None, :]
            prof = np.exp(-((xs - cx) ** 2) / (2 * wd * wd))
            prof[:, : col * cw] = 0
            prof[:, (col + 1) * cw :] = 0
            fade = np.clip((ln - rows) / 0.12, 0, 1)
            a = prof * fade
            alpha = np.maximum(alpha, a)
            lum = lum * (1 - a * 0.5) + a * 0.5 * rng.uniform(0.45, 0.85)
    lum = lum * (0.75 + 0.25 * rows)
    cards = np.dstack([lum, lum, lum, np.clip(alpha * 1.4, 0, 1)])
    return sh, cards

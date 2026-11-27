# Plan 131 — the hands of the new body found on its own mesh (numpy and the standard library alone: run in
# Blender by build_bs.py, and outside it on a dump to check). The fingers had been carried from MakeHuman's by
# matching its five tips by direction alone: the thumb went onto the index, the ring onto the thumb, the rig's
# finger joints stayed where MakeHuman's were — the fingers bent about points that weren't their knuckles.
#   wrist_at   the wrist where the arm is narrowest before the hand widens (a landmark's box mean sat 3.4 cm in
#              the palm: the palm's vertices are denser)
#   five       the five fingers: tips by persistence, labelled, each one's own vertices
#   similarity the turn, size and shift taking points onto points (Umeyama)
#   chain      a finger's joints on the new finger: MakeHuman's lengths' shares along the new one's centre line
import heapq

import numpy as np

FINGERS = ("thumb", "index", "fingers", "ring", "little")


def wrist_at(X, wrist, elbow, near=0.07):
    """The wrist on the line elbow → wrist: the far end of the arm's narrowest stretch, where the slices are still
    within 10% of the narrowest before the hand widens (MakeHuman's own joint sits so on its arm)."""
    ax = wrist - elbow
    L = float(np.linalg.norm(ax))
    ax = ax / L
    rel = X - wrist
    along = rel @ ax
    radial = np.linalg.norm(rel - np.outer(along, ax), axis=1)
    rows = []
    for s in np.arange(-near, near * 0.6, 0.005):
        m = (np.abs(along - s) < 0.007) & (radial < 0.07)
        if m.sum() < 6:
            continue
        P_ = X[m] - (wrist + s * ax)
        P_ -= np.outer(P_ @ ax, ax)
        # (the slice's widest extent across the arm)
        w = max(np.ptp(P_ @ v) for v in _across(ax))
        rows.append((s, w, X[m].mean(0)))
    if not rows:
        return wrist
    wmin = min(w for _, w, _ in rows)
    s_min = next(s for s, w, _ in rows if w == wmin)
    # (the run of narrow slices from the narrowest on, till one is 10% wider)
    run = []
    for r in sorted((r for r in rows if r[0] >= s_min), key=lambda r: r[0]):
        if r[1] > 1.1 * wmin:
            break
        run.append(r)
    s_, _, c = run[-1]
    # (on the arm's line, at that slice's centre)
    return c


def _across(ax):
    a = np.cross(ax, [0, 0, 1.0])
    if np.linalg.norm(a) < 1e-6:
        a = np.cross(ax, [1.0, 0, 0])
    a /= np.linalg.norm(a)
    b = np.cross(ax, a)
    return [a, b, (a + b) / np.sqrt(2), (a - b) / np.sqrt(2)]


def _graph(X, E, m, join=0.004):
    """The mesh's edges among the vertices in m (local indices), points closer than `join` joined too (the
    nails' seams: two vertices a hair apart, far round by the edges)."""
    ids = np.where(m)[0]
    loc = -np.ones(len(X), int)
    loc[ids] = np.arange(len(ids))
    e = E[m[E[:, 0]] & m[E[:, 1]]]
    pairs = [(int(loc[a]), int(loc[b])) for a, b in e]
    Y = X[ids]
    # (close pairs by a grid of `join` cells)
    cell = np.floor(Y / join).astype(int)
    buckets = {}
    for i, c in enumerate(map(tuple, cell)):
        buckets.setdefault(c, []).append(i)
    for c, items in buckets.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    other = buckets.get((c[0] + dx, c[1] + dy, c[2] + dz))
                    if not other:
                        continue
                    for i in items:
                        for j in other:
                            if i < j and np.linalg.norm(Y[i] - Y[j]) < join:
                                pairs.append((i, j))
    nb = [[] for _ in range(len(ids))]
    for a, b in pairs:
        if a == b:
            continue
        w = float(np.linalg.norm(Y[a] - Y[b]))
        nb[a].append((b, w))
        nb[b].append((a, w))
    return ids, nb


def _dijkstra(nb, src):
    d = np.full(len(nb), np.inf)
    d[src] = 0.0
    h = [(0.0, src)]
    while h:
        dd, a = heapq.heappop(h)
        if dd > d[a]:
            continue
        for b, w in nb[a]:
            nd = dd + w
            if nd < d[b]:
                d[b] = nd
                heapq.heappush(h, (nd, b))
    return d


def five(X, E, m, wrist, ahead, own_len=0.06):
    """The five fingers of a hand: the five tips that stand out longest from the wrist (the persistence of the
    distance over the surface from it — a bump's tip merges into the hand soon, a finger's late); labelled — the
    thumb the farthest from the others, the four in order from the thumb's side; each finger's own vertices (nearer
    its tip than any other's, within `own_len` of it). {name: {tip, verts}}"""
    ids, nb = _graph(X, E, m)
    gw = _dijkstra(nb, int(np.argmin(np.linalg.norm(X[ids] - wrist, axis=1))))
    par = -np.ones(len(ids), int)
    peak = {}

    def root(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a

    pers = []
    for k in np.argsort(-gw):
        if not np.isfinite(gw[k]):
            continue
        par[k] = k
        peak[k] = k
        for j, _ in nb[k]:
            if par[j] < 0:
                continue
            ra, rb = root(k), root(j)
            if ra == rb:
                continue
            if gw[peak[ra]] < gw[peak[rb]]:
                ra, rb = rb, ra
            pers.append((gw[peak[rb]] - gw[k], peak[rb]))
            par[rb] = ra
    top = int(np.argmax(np.where(np.isfinite(gw), gw, -1)))
    cand = [peak[root(top)]] + [p for _, p in sorted(pers, reverse=True)]
    tips_i = []
    for c in cand:
        if ahead[ids[c]] and c not in tips_i:
            tips_i.append(c)
        if len(tips_i) == 5:
            break
    stand = sorted((d_ for d_, p in pers if ahead[ids[p]]), reverse=True)[:6]
    # (each tip's web: where, going down from the tips, its piece first meets another tip's)
    par[:] = -1
    has = {}
    web = {}
    saddles = []
    for k in np.argsort(-gw):
        if not np.isfinite(gw[k]):
            continue
        par[k] = k
        has[k] = {k} & set(tips_i)
        for j, _ in nb[k]:
            if par[j] < 0:
                continue
            ra, rb = root(k), root(j)
            if ra == rb:
                continue
            if has[ra] and has[rb]:
                for q in has[ra] | has[rb]:
                    web.setdefault(q, gw[k])
                saddles.append((set(has[ra]), set(has[rb]), X[ids[k]].copy()))
            par[rb] = ra
            has[ra] = has[ra] | has[rb]
    T = X[ids[tips_i]]
    far = [np.linalg.norm(T - T[i], axis=1).sum() for i in range(5)]
    th = int(np.argmax(far))
    four = [i for i in range(5) if i != th]
    mean4 = T[four].mean(0)
    ax = (mean4 - wrist) / np.linalg.norm(mean4 - wrist)
    u = T[th] - mean4
    u -= ax * (u @ ax)
    u /= np.linalg.norm(u)
    four.sort(key=lambda i: -(T[i] @ u))
    order = [th] + four
    gt = np.stack([_dijkstra(nb, int(tips_i[i])) for i in order])
    own = np.argmin(gt, axis=0)
    out = {
        f: {"tip": T[i], "verts": ids[(own == q) & (gt[q] < own_len)], "out": float(gw[tips_i[i]] - web.get(tips_i[i], 0.0)),
            "near": ids[(own == q) & (gt[q] < float(gw[tips_i[i]] - web.get(tips_i[i], 0.0)) + 0.02)]}
        for q, (f, i) in enumerate(zip(FINGERS, order, strict=True))
    }
    # (the webs between the four fingers: the saddles where pieces holding only those meet)
    name = {tips_i[i]: f for f, i in zip(FINGERS, order, strict=True)}
    # (each join's web between the nearest two tips across it — a thumb joined early leaves the others' webs)
    out["webs"] = []
    for a_, b_, p in saddles:
        qa, qb = min(((qa, qb) for qa in a_ for qb in b_), key=lambda t: np.linalg.norm(X[ids[t[0]]] - X[ids[t[1]]]))
        if "thumb" not in (name[qa], name[qb]):
            out["webs"].append(p)
    return out, stand


def similarity(A, B, w):
    """The turn R, size s and shift t taking points A onto B (Umeyama, weighted): B ≈ s R A + t."""
    w = np.asarray(w, float) / np.sum(w)
    ma, mb = w @ A, w @ B
    A0, B0 = A - ma, B - mb
    U, sv, Vt = np.linalg.svd((B0 * w[:, None]).T @ A0)
    Dg = np.diag([1.0, 1.0, np.sign(np.linalg.det(U @ Vt))])
    R = U @ Dg @ Vt
    s = float((sv * np.diag(Dg)).sum() / (w @ (A0**2).sum(1)))
    return R, s, mb - s * R @ ma


def centre_line(V, base, tip, step=0.004):
    """A finger's centre line from its base to its tip: the centres of its slices across the base → tip line
    (each slice's own axis from the last two centres), the base and the tip at its ends."""
    pts = [tip]
    d = base - tip
    L = float(np.linalg.norm(d))
    d /= L
    c = tip.copy()
    s = step
    while s < L - step:
        p = c + d * step
        m = (np.abs((V - p) @ d) < step * 0.75) & (np.linalg.norm(V - p, axis=1) < 0.02)
        if m.sum() >= 3:
            q = V[m].mean(0)
            # (moved across only: along, it stays at its step)
            off = q - p
            off -= d * (off @ d)
            p = p + off
        pts.append(p)
        nd = base - p
        if np.linalg.norm(nd) < step:
            break
        d = 0.7 * d + 0.3 * nd / np.linalg.norm(nd)
        d /= np.linalg.norm(d)
        c = p
        s += step
    pts.append(base)
    return np.array(pts[::-1])


def along(line, frac):
    """The point at a share of a polyline's length."""
    seg = np.linalg.norm(np.diff(line, axis=0), axis=1)
    cum = np.r_[0, np.cumsum(seg)]
    t = frac * cum[-1]
    k = int(np.clip(np.searchsorted(cum, t) - 1, 0, len(seg) - 1))
    u = (t - cum[k]) / max(seg[k], 1e-9)
    return line[k] + u * (line[k + 1] - line[k])


def chain(mh_joints, mh_tip, base, tip, V):
    """A finger's joints on the new finger: the first (its base, already placed) kept; the others at MakeHuman's
    shares of its base → tip length, along the new finger's centre line."""
    pts = np.vstack([mh_joints, mh_tip])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.cumsum(seg) / seg.sum()
    line = centre_line(V, base, tip)
    out = [base]
    for f in cum[:-1]:
        out.append(along(line, f))
    return np.array(out), line


def palm_normal(X, wrist, mid_tip):
    """The hand's thickness direction: its points' least spread across the wrist → middle tip line."""
    a = (mid_tip - wrist) / np.linalg.norm(mid_tip - wrist)
    Y = X - X.mean(0)
    Y -= np.outer(Y @ a, a)
    _, _, Vt = np.linalg.svd(Y, full_matrices=False)
    # (with the line taken out its own spread is none: the thickness is the middle of the three)
    n = Vt[1] - a * (Vt[1] @ a)
    return n / np.linalg.norm(n), a


def profile(X, tip, toward, n, half=0.009, step=0.003, reach=0.14):
    """A finger's slices from its tip toward the wrist: for each, its distance from the tip, its thickness (along n),
    and its middle (the box's — the points are few). Only points within `half` of the line across."""
    a = toward - tip
    a /= np.linalg.norm(a)
    side = np.cross(n, a)
    side /= np.linalg.norm(side)
    rel = X - tip
    al, sd, th = rel @ a, rel @ side, rel @ n
    rows = []
    c_side = 0.0
    for s in np.arange(0.004, reach, step):
        m = (np.abs(al - s) < 0.005) & (np.abs(sd - c_side) < half)
        if m.sum() < 3:
            continue
        rows.append((s, float(np.ptp(th[m])), tip + a * s + side * c_side + n * (0.5 * (th[m].max() + th[m].min()))))
        # (the line follows the finger's middle across)
        c_side = 0.7 * c_side + 0.3 * 0.5 * (sd[m].max() + sd[m].min())
    return rows, a, side


def drop(rows, rise=1.35):
    """Where a finger's slices thicken into the palm: the first slice from the tip past `rise` × the finger's own
    thickness (its middle slices'), with the next one too."""
    own = np.median([t for s, t, _ in rows if 0.012 < s < 0.035] or [rows[0][1]])
    for k in range(len(rows) - 1):
        if rows[k][0] > 0.02 and rows[k][1] > rise * own and rows[k + 1][1] > rise * own:
            return rows[k][0], own
    return rows[-1][0], own


def knuckle_row(X, wrist, a, n, length):
    """Where the hand's thickness (along n) falls from the palm's to a finger's — the knuckle row's web, as a
    distance from the wrist along a (the palm's middle slices' thickness, the first slice past 40% of the hand's
    length under 72% of it, the next one too). X: the hand without its thumb."""
    rel = X - wrist
    al, th = rel @ a, rel @ n
    rows = []
    for s in np.arange(0.0, length, 0.004):
        m = np.abs(al - s) < 0.005
        if m.sum() >= 6:
            rows.append((s, float(np.ptp(th[m]))))
    palm = np.median([t for s, t in rows if 0.3 * length < s < 0.5 * length])
    for k in range(len(rows) - 1):
        if rows[k][0] > 0.4 * length and rows[k][1] < 0.72 * palm and rows[k + 1][1] < 0.72 * palm:
            return rows[k][0], palm
    return 0.55 * length, palm


def finger_line(V, tip, a, n, near=0.02):
    """A finger's own line: through its slices' middles (the box's: few points), from `near` off its tip back;
    a point on it and its direction (tipward)."""
    side = np.cross(n, a)
    rel = V - tip
    al = rel @ -a
    mids = []
    for s in np.arange(near, al.max(), 0.004):
        m = np.abs(al - s) < 0.005
        if m.sum() >= 3:
            Y = V[m]
            c = tip.copy()
            for v in (n, side):
                c = c + v * (0.5 * ((Y - tip) @ v).max() + 0.5 * ((Y - tip) @ v).min())
            mids.append(c - a * (c - tip) @ a + a * ((Y - tip) @ a).mean())
    if len(mids) < 2:
        return tip, a
    M = np.array(mids)
    c = M.mean(0)
    _, _, Vt = np.linalg.svd(M - c)
    d = Vt[0] if Vt[0] @ (tip - c) > 0 else -Vt[0]
    return c, d


def slice_middle(V, p, d, half=0.006, r=0.02):
    """The middle of a finger's slice at p across d (the box's), moved across only; p itself if too few points."""
    rel = V - p
    m = (np.abs(rel @ d) < half) & (np.linalg.norm(rel, axis=1) < r)
    if m.sum() < 4:
        return p
    Y = rel[m] - np.outer(rel[m] @ d, d)
    u = np.cross(d, [0, 0, 1.0])
    if np.linalg.norm(u) < 1e-6:
        u = np.cross(d, [1.0, 0, 0])
    u /= np.linalg.norm(u)
    w = np.cross(d, u)
    off = u * 0.5 * ((Y @ u).max() + (Y @ u).min()) + w * 0.5 * ((Y @ w).max() + (Y @ w).min())
    return p + off


def finger_curve(V, tip, a, n, near=0.006):
    """A finger's centre as a smooth curve: its slices' middles (the box's) every 3 mm back from the tip along -a,
    the two across-offsets fitted as quadratics of the distance (the coarse mesh's slices are noisy, a finger rests
    curled); run on past its last slice along the curve's own direction there. Returns pos(s), s the distance from
    the tip along -a, and the last slice's s."""
    side = np.cross(n, a)
    side /= np.linalg.norm(side)
    rel = V - tip
    al = rel @ -a
    S_, U_, W_ = [], [], []
    for s in np.arange(near, al.max() - 0.002, 0.003):
        m = np.abs(al - s) < 0.004
        if m.sum() >= 3:
            Y = rel[m]
            S_.append(s)
            U_.append(0.5 * ((Y @ n).max() + (Y @ n).min()))
            W_.append(0.5 * ((Y @ side).max() + (Y @ side).min()))
    S_, U_, W_ = map(np.array, (S_, U_, W_))
    deg = 2 if len(S_) >= 6 else 1
    cu, cw = np.polyfit(S_, U_, deg), np.polyfit(S_, W_, deg)
    s_end = float(S_.max())

    # (past the last slice: straight on along its near half's chord — a quadratic's slope at its end overshoots)
    du = (np.polyval(cu, s_end) - np.polyval(cu, 0.5 * s_end)) / (0.5 * s_end)
    dw = (np.polyval(cw, s_end) - np.polyval(cw, 0.5 * s_end)) / (0.5 * s_end)

    def pos(s):
        s = np.atleast_1d(np.asarray(s, float))
        sc = np.minimum(s, s_end)
        u = np.polyval(cu, sc) + du * (s - sc)
        w = np.polyval(cw, sc) + dw * (s - sc)
        return tip - np.outer(s, a) + np.outer(u, n) + np.outer(w, side)

    return pos, s_end

# Plan 73 phase 5 — the life look's garments, made by script from the body itself (decided 2026-11-09:
# "script-made, CC0 where it fits"). MakeHuman's base mesh carries shells meant for clothes, shaped by the
# same sliders and weighted to the same bones as the body: `helper-tights` (a body suit: the torso, the
# arms to the wrists, the legs to the ankles) and `helper-skirt` (a cone from the waist to the ankles). A
# garment is cut out of one of them by the body's own landmarks — a sleeve's length along the arm, a
# leg's along the leg, a hem and a neckline by height —, its cut edges snapped straight, and set off the
# body by its thickness. So it fits the man and the woman, and their slim and broad bodies (the same cut
# off the same helper in each build: the same vertices, so the bodies are its morph targets too).
#
# Units are MakeHuman's (decimetres, y up, facing +z, the person's left +x), before the arms are brought
# down: build_person.py poses a garment as it poses any part.
import numpy as np

# the garments of the sample (phase 5.0); `sleeve` / `legs` along the limb: 0 the shoulder or the hip
# joint, 1 the elbow or the knee, 2 the wrist or the ankle (None: none of it); `hem` / `top` by height
# (landmarks: "hip", "waist", "crotch", "neck", "knee", "ankle"; plus an offset, dm); `neck` how far
# below the neck joint the neckline sits at the back, `scoop` how much lower in front; `thick` off the
# body (dm) — a top thicker than the bottoms it's worn over, so it lies over their waistband; a skirt
# (`helper: skirt`) hangs off the hips' own shape, flared by `aline` (dm out per dm down); `fabric` the
# material library's cloth it's drawn in (look/life-matlib-list.ts), its UVs in metres round the body
GARMENTS = {
    # tops
    "tee": {"fabric": "linen", "helper": "tights", "sleeve": 0.42, "hem": ("hip", -0.35), "neck": 0.45, "scoop": 0.35, "thick": 0.09},
    "shirt": {"fabric": "linen", "helper": "tights", "sleeve": 1.93, "hem": ("hip", -0.45), "neck": 0.3, "scoop": 0.55, "thick": 0.1},
    "sweater": {"fabric": "boucle", "helper": "tights", "sleeve": 1.95, "hem": ("hip", -0.15), "neck": 0.3, "scoop": 0.2, "thick": 0.14},
    "tank": {"fabric": "linen", "helper": "tights", "sleeve": 0.02, "hem": ("hip", -0.3), "neck": 0.55, "scoop": 0.6, "thick": 0.08},
    # bottoms
    "jeans": {"fabric": "twill", "helper": "tights", "legs": 1.96, "top": ("waist", -0.25), "thick": 0.06, "loose": 0.12},
    "shorts": {"fabric": "twill", "helper": "tights", "legs": 0.55, "top": ("waist", -0.25), "thick": 0.07},
    "leggings": {"fabric": "linen", "helper": "tights", "legs": 1.98, "top": ("waist", -0.15), "thick": 0.03},
    # skirts: off the hips, flared below them; over a top's hem (a top's tucked in: its thickness under)
    "skirt": {"fabric": "tweed", "helper": "skirt", "hem": ("knee", 0.6), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.12},
    "longskirt": {"fabric": "linen", "helper": "skirt", "hem": ("ankle", 1.2), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.16},
    # a dress: a top, and a skirt from the hips (`skirt`: a second piece off the skirt's cone)
    "dress": {"fabric": "linen", "helper": "tights", "sleeve": 0.22, "hem": ("hip", 0.25), "neck": 0.5, "scoop": 0.4, "thick": 0.08,
              "skirt": {"helper": "skirt", "top": ("hip", 0.5), "hem": ("knee", 0.35), "thick": 0.12, "aline": 0.14}},
    # the outer layer: over a top, thicker, its skirt to mid-thigh
    "parka": {"fabric": "twill", "helper": "tights", "sleeve": 1.98, "hem": ("hip", -0.1), "neck": 0.05, "scoop": 0.15, "thick": 0.28,
              "skirt": {"helper": "skirt", "top": ("hip", 0.5), "hem": ("knee", 1.4), "thick": 0.3, "aline": 0.2}},
    # on the head: the scalp's shell (the body's own head, above the brows), over the hair
    "beanie": {"fabric": "boucle", "helper": "head", "above": 0.35, "thick": 0.1},
    # the CC0 shoes (MakeHuman's own, fitted as any part): only what they hide
    "sneakers": {"cc0": "clothes/shoes05/shoes05", "below": ("ankle", 0.15)},
    "boots": {"cc0": "clothes/shoes03/shoes03", "below": ("ankle", 1.5)},
    # the CC0 pack's authored hairs, where a script's fell short (decided 2026-11-09: the script's long
    # hair read as ribbons)
    "hair-long": {"cc0": "hair/long01/long01", "hair": True},
    "hair-short01": {"cc0": "hair/short01/short01", "hair": True},
    "hair-short03": {"cc0": "hair/short03/short03", "hair": True},
    "hair-short04": {"cc0": "hair/short04/short04", "hair": True},
    "hair-bob01": {"cc0": "hair/bob01/bob01", "hair": True},
    "hair-bob02": {"cc0": "hair/bob02/bob02", "hair": True},
    "hair-braid": {"cc0": "hair/braid01/braid01", "hair": True},
}  # fmt: skip

# what each body vertex is, for hiding the skin under what's worn — the build writes it on the body
# (`_wear`: kind, along the limb, height; `_neck`: how far in front of the neck, how far from its axis),
# the game hides by the same rules (look/life-wear.ts)
TORSO, ARM_L, ARM_R, LEG_L, LEG_R, HEAD = range(6)
M_T, M_Y = 0.15, 0.35  # the skin hidden this far inside a garment's edge (along a limb; dm)


def normals(V, faces):
    """Vertex normals (Newell's, summed over the faces round each vertex)."""
    N = np.zeros_like(V)
    for f in faces:
        p = V[f]
        n = np.cross(p, np.roll(p, -1, 0)).sum(0)
        N[f] += n
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


def chain_t(P, a, b, c):
    """Where points lie along a limb: 0 at `a`, 1 at `b`, 2 at `c` (projected onto each segment)."""
    ab, bc = b - a, c - b
    u = ((P - a) @ ab) / (ab @ ab)
    v = ((P - b) @ bc) / (bc @ bc)
    return np.where(u <= 1, u, 1 + v)


def boundary(faces):
    """The vertices on the open edges of a set of faces."""
    count = {}
    for f in faces:
        for i in range(len(f)):
            e = tuple(sorted((f[i], f[(i + 1) % len(f)])))
            count[e] = count.get(e, 0) + 1
    out = set()
    for e, n in count.items():
        if n == 1:
            out.update(e)
    return out


def zones(V, ow, ALL, J):
    """Each vertex's (kind, t along its limb, height, front, off the neck's axis): kind by the joints
    that hold it."""
    W = {j: ow[:, ALL.index(j)] for j in ALL}
    side = lambda names: sum(W[n] for n in names)  # noqa: E731
    kind = np.full(len(V), TORSO)
    t = np.zeros(len(V))
    for k, S in ((ARM_L, "L"), (ARM_R, "R")):
        m = (side([f"shoulder{S}", f"elbow{S}", f"wrist{S}", f"fingers{S}", f"index{S}", f"thumb{S}"]) > 0.5) & (kind == TORSO)
        kind[m] = k
        t[m] = chain_t(V[m], J[f"shoulder{S}"], J[f"elbow{S}"], J[f"wrist{S}"])
    for k, S in ((LEG_L, "L"), (LEG_R, "R")):
        m = (side([f"thigh{S}", f"knee{S}", f"ankle{S}", f"toe{S}"]) > 0.5) & (kind == TORSO)
        kind[m] = k
        t[m] = chain_t(V[m], J[f"hip{S}"], J[f"knee{S}"], J[f"ankle{S}"])
    kind[(W["head"] > 0.5) & (kind == TORSO)] = HEAD
    front = np.clip((V[:, 2] - J["neck"][2]) / 0.8, -1, 1)
    rad = np.hypot(V[:, 0] - J["neck"][0], V[:, 2] - J["neck"][2])
    return kind, t, V[:, 1].copy(), front, rad


def level(J, name):
    key, off = name
    return J[key][1] + off


COLLAR = 1.0  # the neck's hole: this far round the neck's axis (dm) at most — the shoulders stay
NECK_RISE = 0.6  # how far the neckline rises (dm) from the neck's axis out to the collar: a U


def neckline(spec, J, front, rad):
    """The neckline's height at each vertex: `neck` below the neck joint, `scoop` lower in front, rising
    in a curve away from the neck's axis (a U, not a square hole cut round the neck)."""
    k = np.clip((rad - 0.55) / (spec.get("collar", COLLAR) - 0.55), 0, 1)
    line = J["neck"][1] - spec.get("neck", 0) - spec.get("scoop", 0) * np.clip(front, 0, 1) + NECK_RISE * k * k
    # (never up the neck itself: risen further, the cloth climbed its sides in spikes)
    return np.minimum(line, J["neck"][1] - 0.1)


def covers(spec, Z, J, m_t=M_T, m_y=M_Y):
    """Which vertices a garment covers (m_t, m_y in from its edges: the skin it hides; 0: its cut)."""
    kind, t, y, front, rad = Z
    if "cc0" in spec and "below" not in spec:
        return np.zeros(len(kind), dtype=bool)
    if "skirt" in spec:
        # (a dress's, a coat's skirt: what it covers too)
        return covers({k: v for k, v in spec.items() if k != "skirt"}, Z, J, m_t, m_y) | covers(spec["skirt"], Z, J, m_t, m_y)
    arm = (kind == ARM_L) | (kind == ARM_R)
    leg = (kind == LEG_L) | (kind == LEG_R)
    torso = kind == TORSO
    if "below" in spec:
        return leg & (y <= level(J, spec["below"]) - m_y)
    if spec["helper"] == "head":
        return (kind == HEAD) & (y >= J["brow"][1] + spec["above"] + m_y)
    hem = level(J, spec["hem"]) if "hem" in spec else -1e9
    top = level(J, spec["top"]) if "top" in spec else 1e9
    if spec["helper"] == "skirt":
        return torso & (y >= hem + m_y) & (y <= top - m_y)
    out = torso & (y >= hem + m_y) & (y <= top - m_y)
    if "neck" in spec:
        out &= ~((y > neckline(spec, J, front, rad) - m_y) & (rad < spec.get("collar", COLLAR) + m_y))
    sleeve = spec.get("sleeve")
    if sleeve is not None:
        out |= arm & (t <= sleeve - m_t)
    legs_to = spec.get("legs")
    if legs_to is not None:
        out |= leg & (t <= legs_to - m_t) & (y <= top - m_y)
    elif "hem" in spec:
        out |= leg & (y >= hem + m_y)
    return out


def make(spec, V, F0, ow, ALL, J, outward, Z, hair=None):
    """A garment: (positions, the faces kept as vertex lists) off the shaped body `V` — `F0` the base
    mesh's faces (vertices, uvs, group), `ow` each vertex's weights over our joints (ALL), `J` the
    landmarks (MakeHuman space), `Z` the vertices' zones. `outward(P, N)`: the normals turned to face
    out. `hair`: the hair's vertices (a hat goes over them)."""
    group = {"tights": "helper-tights", "skirt": "helper-skirt", "head": "body"}[spec["helper"]]
    faces = [f[0] for f in F0 if f[2] == group]
    idx = np.array(sorted({v for f in faces for v in f}))
    kind, t, y, front, rad = Z
    keep = np.zeros(len(V), dtype=bool)
    if spec["helper"] == "skirt":
        # (the skirt's cone by height alone: below the hips its vertices go with the legs)
        keep[idx] = (y[idx] >= level(J, spec["hem"])) & (y[idx] <= level(J, spec["top"]))
    else:
        keep[idx] = covers(spec, Z, J, 0, 0)[idx]
    kept = [f for f in faces if all(keep[v] for v in f)]
    # the cut edges snapped straight: each open edge's vertices moved onto their cut (along the limb, or
    # up and down) — the helper's own lines left them ragged
    Q = V.copy()
    hem = level(J, spec["hem"]) if "hem" in spec else None
    top = level(J, spec["top"]) if "top" in spec else None
    neck = neckline(spec, J, front, rad) if "neck" in spec else None
    for v in boundary(kept):
        k = kind[v]
        if spec["helper"] == "head":
            Q[v, 1] = J["brow"][1] + spec["above"]
            continue
        lim = None
        if k in (ARM_L, ARM_R) and spec.get("sleeve") is not None and abs(t[v] - spec["sleeve"]) < 0.4:
            lim = ("arm", "L" if k == ARM_L else "R", spec["sleeve"])
        elif k in (LEG_L, LEG_R) and spec.get("legs") is not None and abs(t[v] - spec["legs"]) < 0.4:
            lim = ("leg", "L" if k == LEG_L else "R", spec["legs"])
        if lim:
            kd, S, t_to = lim
            a, b, c = (J[f"shoulder{S}"], J[f"elbow{S}"], J[f"wrist{S}"]) if kd == "arm" else (J[f"hip{S}"], J[f"knee{S}"], J[f"ankle{S}"])
            tv = float(chain_t(Q[v : v + 1], a, b, c)[0])
            Q[v] += ((b - a) if t_to <= 1 else (c - b)) * (t_to - tv)
            continue
        # by height: the nearest of the garment's horizontal cuts
        at_neck = neck is not None and rad[v] < spec.get("collar", COLLAR) + 0.2
        cuts = [c for c in (hem, top, neck[v] if at_neck else None) if c is not None]
        if cuts:
            Q[v, 1] = min(cuts, key=lambda c: abs(y[v] - c))
    used = np.array(sorted({v for f in kept for v in f}))
    if spec["helper"] == "skirt":
        Q[used] = aline(spec, Q[used], V, F0, Z, J, [[int(np.searchsorted(used, v)) for v in f] for f in kept])
        return Q, kept
    # set off the body: along the shell's normals, by the thickness (`loose`: more down the legs — jeans
    # aren't tights; most at the knee and below)
    N = outward(Q, normals(Q, kept))
    th = np.full(len(V), float(spec["thick"]))
    # (a bottom's waistband thin: a top's hem lies over it — at the back it came through a sweater)
    if spec.get("legs") is not None and "top" in spec:
        # (down past the seat: a top's hem falls to it)
        band = np.clip((level(J, spec["top"]) - y - 1.6) / 0.8, 0, 1)
        th = np.minimum(th, 0.03 + (th - 0.03) * band)
    if spec.get("loose"):
        legv = (kind == LEG_L) | (kind == LEG_R)
        # (none at the hips: there a top's hem lies over it)
        th[legv] += spec["loose"] * np.clip((t[legv] - 0.4) / 0.8, 0, 1)
    Q = Q + N * th[:, None]
    if spec["helper"] == "head" and hair is not None:
        Q[used] = over(Q[used], hair)
    return Q, kept


def aline(spec, S, V, F0, Z, J, faces):
    """A skirt's vertices hung off the hips: round the figure's axis, each at the body's own radius
    (the tights' torso and legs, their outer hull) plus the thickness down to the hips' widest, then
    flared from there by `aline` — never inside the hull (the legs)."""
    kind = Z[0]
    tights = sorted({v for f in F0 if f[2] == "helper-tights" for v in f[0]})
    tights = np.array([v for v in tights if kind[v] not in (ARM_L, ARM_R)])
    T = V[tights]
    cx, cz = (J["hipL"][0] + J["hipR"][0]) / 2, (J["hipL"][2] + J["hipR"][2]) / 2
    NB, DY = 48, 0.2
    ang = lambda P: np.arctan2(P[:, 0] - cx, P[:, 2] - cz)  # noqa: E731
    rad = lambda P: np.hypot(P[:, 0] - cx, P[:, 2] - cz)  # noqa: E731
    y0 = T[:, 1].min()
    nyb = int((T[:, 1].max() - y0) / DY) + 2
    hull = np.zeros((NB, nyb))
    ab = ((ang(T) + np.pi) / (2 * np.pi) * NB).astype(int) % NB
    yb = ((T[:, 1] - y0) / DY).astype(int)
    np.maximum.at(hull, (ab, yb), rad(T))
    # (neighbouring angles too: a bin the mesh's lines missed)
    hull = np.maximum(hull, np.maximum(np.roll(hull, 1, 0), np.roll(hull, -1, 0)) * 0.97)
    raw = hull.copy()
    # (and heights: a row the mesh's lines missed let a top's hem through the skirt)
    for _ in range(2):
        up, down = np.roll(hull, 1, 1), np.roll(hull, -1, 1)
        up[:, 0] = 0
        down[:, -1] = 0
        hull = np.maximum(hull, np.maximum(up, down))
    a = ang(S)
    sb = ((a + np.pi) / (2 * np.pi) * NB).astype(int) % NB
    syb = np.clip(((S[:, 1] - y0) / DY).astype(int), 0, nyb - 1)
    # (near its top the body's own rows: carried up, the seat's bulge stood the waistband off the back)
    near_top = np.clip((S[:, 1].max() - S[:, 1]) / 0.5, 0, 1)
    r_body = raw[sb, syb] * (1 - near_top) + hull[sb, syb] * near_top
    # the hips' widest: the bin row (from the skirt's top down to the crotch) of the largest mean radius
    lo = int((J["crotch"][1] - y0) / DY)
    hi = int((S[:, 1].max() - y0) / DY)
    rows = range(max(lo, 0), min(hi, nyb - 1) + 1)
    yh = max(rows, key=lambda r: hull[:, r].mean()) if rows else lo
    r_hip = hull[sb, yh]
    drop = np.maximum(0, (yh * DY + y0) - S[:, 1])
    # (above the hips' widest: the body's own; below: flared off the hips, never inside the legs)
    r = np.where(drop > 0, np.maximum(r_body, r_hip + spec.get("aline", 0.1) * drop), r_body) + spec["thick"]
    # (smoothed outward over its neighbours: a bin the hull missed left a notch)
    nb = [set() for _ in range(len(S))]
    for f in faces:
        for i in range(len(f)):
            nb[f[i]].add(f[i - 1])
            nb[f[i]].add(f[(i + 1) % len(f)])
    for _ in range(6):
        m = np.array([r[list(n)].mean() if n else r[i] for i, n in enumerate(nb)])
        r = np.maximum(r, 0.5 * r + 0.5 * m)
    out = S.copy()
    out[:, 0] = cx + np.sin(a) * r
    out[:, 2] = cz + np.cos(a) * r
    return out


def over(S, hair, gap=0.06):
    """A hat's vertices pushed out past the hair (round the head's centre: each as far as the hair
    within a few degrees of it, plus a gap)."""
    c = S.mean(0)
    c[1] -= 0.4
    d = S - c
    rs = np.linalg.norm(d, axis=1)
    u = d / rs[:, None]
    H = hair - c
    rh = np.linalg.norm(H, axis=1)
    uh = H / np.maximum(rh[:, None], 1e-9)
    cos = u @ uh.T
    near = np.where(cos > np.cos(np.radians(12)), rh[None, :], 0).max(1)
    r = np.maximum(rs, near + gap)
    return c + u * r[:, None]


def uv_metres(Q, faces, Z, J):
    """A garment's UVs in metres (its cloth's weave the same size everywhere): round each limb by along
    it, or round the body by height; per corner, a face across the wrap round unwrapped.
    → (uvs, each face's uv indices)"""
    kind = Z[0]
    cx = (J["hipL"][0] + J["hipR"][0]) / 2
    cz = (J["hipL"][2] + J["hipR"][2]) / 2
    axes = {}
    for k, (a, b) in {1: ("shoulderL", "wristL"), 2: ("shoulderR", "wristR"), 3: ("hipL", "ankleL"), 4: ("hipR", "ankleR")}.items():
        A, B = np.asarray(J[a]), np.asarray(J[b])
        ax = (B - A) / np.linalg.norm(B - A)
        e1 = np.cross(ax, [0, 0, 1.0])
        e1 /= np.linalg.norm(e1)
        axes[k] = (A, ax, e1, np.cross(ax, e1), 0.45 if k <= 2 else 0.7)
    uvs, fts = [], []
    for f in faces:
        ks = [int(kind[v]) for v in f]
        k = max(set(ks), key=ks.count)
        if k in axes:
            A, ax, e1, e2, r = axes[k]
            d = Q[f] - A
            ang, v = np.arctan2(d @ e2, d @ e1), -(d @ ax)
        else:
            ang, v, r = np.arctan2(Q[f, 0] - cx, Q[f, 2] - cz), Q[f, 1], 1.4
        u = np.unwrap(ang) * r
        base = len(uvs)
        uvs += [(u[i] * 0.1, v[i] * 0.1) for i in range(len(f))]
        fts.append(list(range(base, base + len(f))))
    return np.array(uvs), fts

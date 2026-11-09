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
# Keys by the wardrobe's slot (shared/avatar.ts AVATAR_OPTIONS): top-, bottom-, outer-, shoes-, hat-.
# Pieces of a garment's own (made after its shell, each new vertex going with the body's it grows from):
# `collar` ("stand" | "fold", height dm) round its neckline — a fold lies out over the shoulders, a
# lapel down a deep V; `tie` a strip down the front; `hood` a hood lying on the back (its thickness, dm);
# `ribs` (period, depth dm) a puffer's quilting; `hole` how far round the neck its neckline reaches
TOP = {"helper": "tights", "fabric": "linen"}
LONG = {**TOP, "sleeve": 1.95}
TEE = {**TOP, "sleeve": 0.42, "hem": ("hip", -0.35), "neck": 0.45, "scoop": 0.35, "thick": 0.09}
SHIRT = {**LONG, "sleeve": 1.93, "hem": ("hip", -0.45), "neck": 0.3, "scoop": 0.7, "vee": 0.6, "thick": 0.1, "collar": ("fold", 0.32)}
SWEAT = {**LONG, "hem": ("hip", -0.2), "neck": 0.35, "scoop": 0.15, "thick": 0.15}
OUTER = {"helper": "tights", "fabric": "twill", "sleeve": 1.98, "hem": ("hip", -0.1)}
HAT = {"helper": "head", "fabric": "boucle"}
PANTS = {"helper": "tights", "fabric": "twill", "legs": 1.96, "top": ("waist", -0.25), "thick": 0.06}
GARMENTS = {
    # tops (batch 1, 5.2)
    "top-tee": TEE,
    "top-longtee": {**TEE, "sleeve": 1.9},
    "top-henley": {**TEE, "sleeve": 1.9, "scoop": 0.7, "vee": 0.5},
    "top-crop": {**TEE, "hem": ("waist", 0.35), "thick": 0.08},
    "top-polo": {**TEE, "sleeve": 0.45, "neck": 0.25, "scoop": 0.3, "collar": ("fold", 0.28)},
    "top-tank": {**TOP, "sleeve": 0.02, "hem": ("hip", -0.3), "neck": 0.55, "scoop": 0.6, "thick": 0.08},
    "top-shirt": SHIRT,
    "top-flannel": {**SHIRT, "fabric": "twill", "thick": 0.12},
    "top-shirttie": {**SHIRT, "tie": True},
    "top-sweater": {**SWEAT, "fabric": "boucle", "hem": ("hip", -0.15), "neck": 0.3, "scoop": 0.2, "thick": 0.14},
    "top-turtleneck": {**SWEAT, "fabric": "boucle", "neck": 0.05, "scoop": 0.0, "thick": 0.12, "collar": ("stand", 0.7)},
    "top-sweatshirt": SWEAT,
    "top-hoodie": {**SWEAT, "thick": 0.16, "collar": ("hood", 1.6)},
    "top-fleece": {**SWEAT, "fabric": "boucle", "thick": 0.18, "neck": 0.15, "collar": ("stand", 0.45)},
    "top-cardigan": {**LONG, "fabric": "boucle", "hem": ("hip", -0.4), "neck": 0.3, "scoop": 1.6, "vee": 0.75, "hole": 1.5, "thick": 0.13},
    "top-blazer": {**LONG, "fabric": "herringbone", "hem": ("hip", -0.55), "neck": 0.3, "scoop": 1.9, "vee": 0.8, "hole": 1.6, "thick": 0.18,
                   "collar": ("fold", 0.4)},
    "top-jacket": {**LONG, "fabric": "twill", "hem": ("hip", -0.05), "neck": 0.2, "scoop": 0.45, "thick": 0.22, "collar": ("stand", 0.4)},
    "top-puffer": {**LONG, "hem": ("hip", -0.1), "neck": 0.1, "scoop": 0.1, "thick": 0.3, "ribs": (0.9, 0.12), "collar": ("stand", 0.5)},
    # a dress: a top, and a skirt from the hips (`skirt`: a second piece off the skirt's cone)
    "top-dress": {**TOP, "sleeve": 0.22, "hem": ("hip", 0.25), "neck": 0.5, "scoop": 0.4, "thick": 0.08,
                  "skirt": {"helper": "skirt", "top": ("hip", 0.5), "hem": ("knee", 0.35), "thick": 0.12, "aline": 0.14}},
    # bottoms
    # bottoms (batch 2, 5.2): `loose` wider down the leg; `cuff` gathered at the ankle; `pockets` on the
    # thighs' outsides (dm proud); `bib` an overall's front, back and straps
    "bottom-jeans": {**PANTS, "loose": 0.12},
    "bottom-trousers": {**PANTS, "thick": 0.07, "loose": 0.16},
    "bottom-chinos": {**PANTS, "thick": 0.07, "loose": 0.1},
    "bottom-suit": {**PANTS, "fabric": "herringbone", "thick": 0.07, "loose": 0.13},
    "bottom-cargo": {**PANTS, "thick": 0.08, "loose": 0.2, "pockets": 0.12},
    "bottom-joggers": {**PANTS, "fabric": "linen", "thick": 0.08, "loose": 0.15, "cuff": True},
    "bottom-wide": {**PANTS, "fabric": "linen", "thick": 0.07, "loose": 0.45},
    "bottom-snowpants": {**PANTS, "thick": 0.18, "loose": 0.2, "ribs": (1.4, 0.05)},
    "bottom-overalls": {**PANTS, "thick": 0.08, "loose": 0.15, "bib": True},
    "bottom-shorts": {**PANTS, "legs": 0.55, "thick": 0.07},
    "bottom-leggings": {**PANTS, "fabric": "linen", "legs": 1.98, "top": ("waist", -0.15), "thick": 0.03},
    # skirts: off the hips, flared below them; over a top's hem (a top's tucked in: its thickness under)
    "bottom-skirt": {"fabric": "tweed", "helper": "skirt", "hem": ("knee", 0.6), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.12},
    "bottom-pleated": {"fabric": "tweed", "helper": "skirt", "hem": ("knee", 0.3), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.18,
                       "pleats": (18, 0.07)},
    "bottom-longskirt": {"fabric": "linen", "helper": "skirt", "hem": ("ankle", 1.2), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.16},
    # outer layers (batch 3, 5.2): over a top — thicker than any top
    "outer-parka": {**OUTER, "neck": 0.05, "scoop": 0.15, "thick": 0.28, "collar": ("hood", 1.5),
                    "skirt": {"helper": "skirt", "top": ("hip", 0.5), "hem": ("knee", 1.4), "thick": 0.3, "aline": 0.2}},
    "outer-coat": {**OUTER, "fabric": "tweed", "neck": 0.3, "scoop": 1.3, "vee": 0.8, "hole": 1.4, "thick": 0.26, "collar": ("fold", 0.5),
                   "skirt": {"helper": "skirt", "top": ("hip", 0.5), "hem": ("knee", 0.3), "thick": 0.3, "aline": 0.12}},
    "outer-raincoat": {**OUTER, "fabric": "linen", "neck": 0.2, "scoop": 0.9, "vee": 0.6, "hole": 1.3, "thick": 0.25, "collar": ("fold", 0.45),
                       "skirt": {"helper": "skirt", "top": ("hip", 0.5), "hem": ("knee", 0.6), "thick": 0.28, "aline": 0.16}},
    "outer-puffer": {**OUTER, "hem": ("hip", -0.15), "neck": 0.1, "scoop": 0.1, "thick": 0.36, "ribs": (0.8, 0.14), "collar": ("stand", 0.55)},
    "outer-denim": {**OUTER, "hem": ("hip", 0.15), "neck": 0.25, "scoop": 0.9, "vee": 0.6, "hole": 1.3, "thick": 0.24, "collar": ("fold", 0.35)},
    "outer-sportcoat": {**OUTER, "fabric": "tweed", "hem": ("hip", -0.5), "neck": 0.3, "scoop": 1.8, "vee": 0.8, "hole": 1.6, "thick": 0.25,
                        "collar": ("fold", 0.4)},
    "outer-vest": {**OUTER, "sleeve": None, "hem": ("hip", -0.1), "neck": 0.1, "scoop": 0.2, "thick": 0.32, "ribs": (0.8, 0.12),
                   "collar": ("stand", 0.4)},
    # on the head (batch 3): the scalp's shell above the brows (`above`; `upto` a band; `strip` across the
    # top ear to ear; `flaps` over the ears), over the hair — with a `brim` (width, droop, in front only),
    # a `pom`, ear `cups`, a `clip`; `flat` a flat cap's crown, `puff` a beret's
    "hat-beanie": {**HAT, "above": 0.35, "thick": 0.1},
    "hat-pompom": {**HAT, "above": 0.35, "thick": 0.1, "pom": 0.32},
    "hat-trapper": {**HAT, "fabric": "tweed", "above": 0.3, "thick": 0.16, "flaps": True},
    "hat-cap": {**HAT, "fabric": "twill", "above": 0.45, "thick": 0.07, "brim": (0.75, 0.12, True)},
    "hat-visor": {**HAT, "fabric": "twill", "above": 0.4, "upto": 0.75, "thick": 0.06, "brim": (0.75, 0.12, True)},
    "hat-bucket": {**HAT, "fabric": "twill", "above": 0.35, "thick": 0.1, "brim": (0.45, 0.3, False)},
    "hat-flatcap": {**HAT, "fabric": "tweed", "above": 0.45, "thick": 0.1, "flat": 0.35, "brim": (0.4, 0.06, True)},
    "hat-beret": {**HAT, "fabric": "boucle", "above": 0.6, "thick": 0.1, "puff": 0.35},
    "hat-bandana": {**HAT, "fabric": "linen", "above": 0.25, "upto": 0.75, "thick": 0.05},
    "hat-headband": {**HAT, "fabric": "linen", "above": 0.45, "upto": 0.75, "thick": 0.06},
    "hat-earmuffs": {**HAT, "fabric": "boucle", "above": -0.3, "strip": 0.12, "thick": 0.05, "cups": 0.32},
    "hat-headphones": {**HAT, "fabric": "linen", "above": -0.3, "strip": 0.12, "thick": 0.06, "cups": 0.36},
    "hat-hairclip": {**HAT, "above": 9.0, "thick": 0.05, "clip": True},
    # the CC0 shoes (MakeHuman's own, fitted as any part): only what they hide; the wardrobe's other
    # shoes the nearest of them (`alias`: drawn as that one, in their own colour)
    "shoes-sneakers": {"cc0": "clothes/shoes05/shoes05", "below": ("ankle", 0.15)},
    "shoes-runners": {"cc0": "clothes/shoes06/shoes06", "below": ("ankle", 0.15)},
    "shoes-slipons": {"cc0": "clothes/shoes02/shoes02", "below": ("ankle", 0.15)},
    "shoes-loafers": {"cc0": "clothes/shoes04/shoes04", "below": ("ankle", 0.15)},
    "shoes-laceboots": {"cc0": "clothes/shoes01/shoes01", "below": ("ankle", 0.15)},
    "shoes-boots": {"cc0": "clothes/shoes03/shoes03", "below": ("ankle", 1.5)},
    "shoes-hightops": {"alias": "shoes-sneakers", "below": ("ankle", 0.15)},
    "shoes-flats": {"alias": "shoes-loafers", "below": ("ankle", 0.15)},
    "shoes-sandals": {"alias": "shoes-loafers", "below": ("ankle", 0.15)},
    "shoes-chelsea": {"alias": "shoes-boots", "below": ("ankle", 1.5)},
    "shoes-snowboots": {"alias": "shoes-boots", "below": ("ankle", 1.5)},
    # the hairs (5.3): the CC0 pack's ten authored ones under the wardrobe's names (hair.py makes the
    # rest); curtain and swept the nearest of them
    "hair-short": {"cc0": "hair/short02/short02", "hair": True},
    "hair-long": {"cc0": "hair/long01/long01", "hair": True},
    "hair-bob": {"cc0": "hair/bob01/bob01", "hair": True},
    "hair-wavy": {"cc0": "hair/bob02/bob02", "hair": True},
    "hair-ponytail": {"cc0": "hair/ponytail01/ponytail01", "hair": True},
    "hair-braids": {"cc0": "hair/braid01/braid01", "hair": True},
    "hair-pixie": {"cc0": "hair/short03/short03", "hair": True},
    "hair-slick": {"cc0": "hair/short04/short04", "hair": True},
    "hair-spiky": {"cc0": "hair/short01/short01", "hair": True},
    "hair-curtain": {"alias": "hair-bob", "hair": True},
    "hair-swept": {"alias": "hair-slick", "hair": True},
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
    dx = np.abs(V[:, 0] - J["neck"][0])
    return kind, t, V[:, 1].copy(), front, rad, dx


def level(J, name):
    key, off = name
    return J[key][1] + off


COLLAR = 1.0  # the neck's hole: this far round the neck's axis (dm) at most (`hole`) — the shoulders stay
NECK_RISE = 0.6  # how far the neckline rises (dm) from the neck's axis out to the collar: a U


def neckline(spec, J, front, rad, dx):
    """The neckline's height at each vertex: `neck` below the neck joint, `scoop` lower in front, rising
    in a curve away from the neck's axis (a U, not a square hole cut round the neck)."""
    k = np.clip((rad - 0.55) / (spec.get("hole", COLLAR) - 0.55), 0, 1)
    dip = np.clip(front, 0, 1)
    if spec.get("vee"):
        # (a V: as deep as the scoop at the middle, straight up its sides to `vee` across)
        dip = dip * np.clip(1 - dx / spec["vee"], 0, 1)
    line = J["neck"][1] - spec.get("neck", 0) - spec.get("scoop", 0) * dip + NECK_RISE * k * k
    # (never up the neck itself: risen further, the cloth climbed its sides in spikes)
    return np.minimum(line, J["neck"][1] - 0.1)


def covers(spec, Z, J, m_t=M_T, m_y=M_Y):
    """Which vertices a garment covers (m_t, m_y in from its edges: the skin it hides; 0: its cut)."""
    kind, t, y, front, rad, dx = Z
    if ("cc0" in spec or "alias" in spec) and "below" not in spec:
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
        out &= ~((y > neckline(spec, J, front, rad, dx) - m_y) & (rad < spec.get("hole", COLLAR) + m_y))
    sleeve = spec.get("sleeve")
    if sleeve is not None:
        out |= arm & (t <= sleeve - m_t)
    if spec.get("bib"):
        # an overall's bib in front, a panel behind, the straps over the shoulders
        ny = J["neck"][1]
        bib = (front > 0.3) & (dx < 0.75 - m_y) & (y <= ny - 1.3 - m_y)
        back = (front < -0.3) & (dx < 0.6 - m_y) & (y <= J["waist"][1] + 0.7 - m_y)
        straps = (np.abs(dx - 0.62) < 0.13 - m_y * 0.3) & (y <= ny - 0.3 - m_y)
        out |= torso & (bib | back | straps)
    legs_to = spec.get("legs")
    if legs_to is not None:
        out |= leg & (t <= legs_to - m_t) & (y <= top - m_y)
    elif "hem" in spec:
        out |= leg & (y >= hem + m_y)
    return out


def ears(V, Z, J):
    """The ears' middles (MakeHuman space): the head's widest each side, from the eyes' height down."""
    kind, y = Z[0], Z[2]
    # (over the neck, not the skull's back — widest there, it put the cups behind the ears)
    hd = np.where((kind == HEAD) & (y < J["brow"][1] - 0.1) & (y > J["brow"][1] - 0.7) & (np.abs(V[:, 2] - J["neck"][2]) < 0.45))[0]
    out = []
    for sgn in (1, -1):
        side = hd[(V[hd, 0] - J["neck"][0]) * sgn > 0]
        far = side[np.argsort(-np.abs(V[side, 0] - J["neck"][0]))[:30]]
        out.append(V[far].mean(0))
    return out


def signed(spec, Z, J, V=None):
    """How far inside the garment's cut each vertex is (dm; along a limb, its t × 3): ≥ 0 kept. One
    smooth function per garment — hem, waistband, neckline (a hole round the neck), sleeves and legs,
    a bib — so its edge is sliced where it crosses 0 (as `covers` with no margin)."""
    kind, t, y, front, rad, dx = Z
    n = len(kind)
    BIG = 9.0
    arm = (kind == ARM_L) | (kind == ARM_R)
    leg = (kind == LEG_L) | (kind == LEG_R)
    torso = kind == TORSO
    if spec["helper"] == "head":
        gh = y - (J["brow"][1] + spec["above"])
        if "upto" in spec:
            gh = np.minimum(gh, J["brow"][1] + spec["upto"] - y)
        if V is not None and (spec.get("strip") or spec.get("flaps")):
            eL, eR = ears(V, Z, J)
            zc = (eL[2] + eR[2]) / 2
            if spec.get("strip"):
                # (a band over the top, ear to ear)
                gh = np.minimum(gh, spec["strip"] - np.abs(V[:, 2] - zc))
            if spec.get("flaps"):
                # (flaps down over the ears, to the jaw)
                flap = np.minimum.reduce([dx - 0.5, 0.4 - np.abs(V[:, 2] - zc), y - (eL[1] - 0.55)])
                gh = np.maximum(gh, flap)
        return np.where(kind == HEAD, gh, -BIG)
    hem = level(J, spec["hem"]) if "hem" in spec else -1e9
    top = level(J, spec["top"]) if "top" in spec else 1e9
    if spec["helper"] == "skirt":
        return np.minimum(y - hem, top - y)
    g = np.full(n, -BIG)
    gt = np.minimum(y - hem, top - y)
    if "neck" in spec:
        gt = np.minimum(gt, np.maximum(neckline(spec, J, front, rad, dx) - y, rad - spec.get("hole", COLLAR)))
    if spec.get("bib"):
        ny = J["neck"][1]
        bib = np.minimum.reduce([front - 0.3, 0.75 - dx, ny - 1.3 - y])
        back = np.minimum.reduce([-0.3 - front, 0.6 - dx, J["waist"][1] + 0.7 - y])
        straps = np.minimum(0.13 - np.abs(dx - 0.62), ny - 0.3 - y)
        gt = np.maximum(gt, np.maximum.reduce([bib, back, straps]))
    g = np.where(torso, gt, g)
    if spec.get("sleeve") is not None:
        g = np.where(arm, (spec["sleeve"] - t) * 3.0, g)
    if spec.get("legs") is not None:
        g = np.where(leg, np.minimum((spec["legs"] - t) * 3.0, top - y), g)
    elif "hem" in spec:
        g = np.where(leg, y - hem, g)
    return g


def make(spec, V, F0, ow, ALL, J, outward, Z, hair=None):
    """A garment: (positions, the faces kept as vertex lists, each vertex's source on the body) off the
    shaped body `V` — `F0` the base mesh's faces (vertices, uvs, group), `J` the landmarks (MakeHuman
    space), `Z` the vertices' zones. Its helper's faces are sliced where its cut (`signed`) crosses 0:
    a new vertex on each crossing edge, on the surface (snapping the old ones up or down a sloping hip
    pushed cloth into it and stood a waistband off the waist). `outward(P, N)`: the normals turned to
    face out. `hair`: the hair's vertices (a hat goes over them)."""
    group = {"tights": "helper-tights", "skirt": "helper-skirt", "head": "body"}[spec["helper"]]
    faces = [f[0] for f in F0 if f[2] == group]
    g = signed(spec, Z, J, V)
    newpos, newsrc, at = [], [], {}

    def cut(a, b):
        key = (min(a, b), max(a, b))
        if key not in at:
            s = g[a] / (g[a] - g[b])
            at[key] = len(V) + len(newpos)
            newpos.append(V[a] + s * (V[b] - V[a]))
            newsrc.append(a if s < 0.5 else b)
        return at[key]

    kept = []
    for f in faces:
        inside = [g[v] >= 0 for v in f]
        if all(inside):
            kept.append(list(f))
            continue
        if not any(inside):
            continue
        poly = []
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            if g[a] >= 0:
                poly.append(a)
            if (g[a] >= 0) != (g[b] >= 0):
                poly.append(cut(a, b))
        if len(poly) >= 3:
            kept.append(poly)
    src = np.concatenate([np.arange(len(V)), np.array(newsrc, dtype=int)])
    Q = np.vstack([V, np.array(newpos).reshape(-1, 3)])
    # (the zones over every vertex, the new ones their source's — their own height)
    kind, t, _, front, rad, dx = (np.asarray(a)[src] for a in Z)
    y = Q[:, 1].copy()
    Z2 = (kind, t, y, front, rad, dx)
    # the neckline's own edge (a collar's): the new vertices on it, where the neck's cut is the one met
    on_neck = set()
    if "neck" in spec:
        line = neckline(spec, J, front, rad, dx)
        on_neck = {len(V) + i for i in range(len(newpos)) if kind[len(V) + i] == TORSO and abs(y[len(V) + i] - line[len(V) + i]) < 0.03}
    used = np.array(sorted({v for f in kept for v in f}))
    if spec["helper"] == "skirt":
        Q[used] = aline(spec, Q[used], V, F0, Z, J, [[int(np.searchsorted(used, v)) for v in f] for f in kept])
        return Q, kept, src
    # set off the body: along the shell's normals, by the thickness (`loose`: more down the legs — jeans
    # aren't tights; most at the knee and below)
    N = outward(Q, normals(Q, kept))
    th = np.full(len(Q), float(spec["thick"]))
    # (a bottom's waistband thin: a top's hem lies over it — at the back it came through a sweater)
    if spec.get("legs") is not None and "top" in spec:
        # (down past the seat: a top's hem falls to it)
        band = np.clip((level(J, spec["top"]) - y - 1.6) / 0.8, 0, 1)
        th = np.minimum(th, 0.03 + (th - 0.03) * band)
    legv = (kind == LEG_L) | (kind == LEG_R)
    if spec.get("loose"):
        # (none at the hips: there a top's hem lies over it)
        th[legv] += spec["loose"] * np.clip((t[legv] - 0.4) / 0.8, 0, 1)
    if spec.get("cuff"):
        # (gathered at the ankle: back to the leg over its last stretch)
        th[legv] = np.where(t[legv] > 1.75, spec["thick"], th[legv])
    if spec.get("pockets"):
        # (a pocket on each thigh's outside)
        cx = (J["hipL"][0] + J["hipR"][0]) / 2
        side = legv & (np.abs(Q[:, 0] - cx) > np.abs(J["hipL"][0] - cx) + 0.35) & (t > 0.5) & (t < 0.95)
        th[side] += spec["pockets"]
    # a hood lying on the back: thicker in a band under the neckline behind
    if spec.get("hood"):
        back = (kind == TORSO) & (front < -0.15) & (rad < 1.7)
        bump = np.exp(-(((y - (J["neck"][1] - 1.0)) / 0.55) ** 2))
        th[back] += spec["hood"] * bump[back]
    if spec.get("puff"):
        # (a beret's crown: fuller over the top)
        th += spec["puff"] * np.clip((y - (J["brow"][1] + 0.8)) / 0.6, 0, 1)
    # a puffer's quilting: thicker and thinner by height
    if spec.get("ribs"):
        period, depth = spec["ribs"]
        th += depth * (0.5 + 0.5 * np.cos(2 * np.pi * y / period))
    Q = Q + N * th[:, None]
    if spec["helper"] == "head" and hair is not None and len(used):
        Q[used] = over(Q[used], hair)
    if spec["helper"] == "head":
        Q, kept, src = _hat(Q, kept, src, spec, V, Z, J, hair)
    if spec.get("collar"):
        Q, kept, src = _collar(Q, kept, src, spec["collar"], on_neck, J)
    return Q, kept, src


def _open_edges(faces):
    """The open edges of a set of faces, each as its face has it (its winding)."""
    seen = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            seen.setdefault((min(a, b), max(a, b)), []).append((a, b))
    return [e[0] for e in seen.values() if len(e) == 1]


def _both(faces):
    """Faces and the same turned over (a thin piece seen from both sides)."""
    return faces + [list(reversed(f)) for f in faces]


def _collar(Q, kept, src, collar, on_neck, J):
    """A collar round the neckline: a band standing up from its edge — a fold's then turned down and out
    over it (a shirt's; laid flat on the chest down a deep V: lapels)."""
    style, h = collar
    nx, nz = J["neck"][0], J["neck"][2]
    # (near the neck, and down a deep V — not where a wide neckline runs out over the shoulders: spikes)
    near = {v for v in on_neck if np.hypot(Q[v, 0] - nx, Q[v, 2] - nz) < 0.95 or (Q[v, 2] - nz) > 0.6}
    if style == "hood":
        near = {v for v in on_neck if (Q[v, 2] - nz) < 0.35}
    edges = [(a, b) for a, b in _open_edges(kept) if a in near and b in near]
    loop = sorted({v for e in edges for v in e})
    if not loop:
        return Q, kept, src
    up = np.array([0, 1.0, 0])
    nrows = 5 if style == "hood" else 2
    rows = [{} for _ in range(nrows)]
    new, srcs = [], []
    for v in loop:
        out = np.array([Q[v, 0] - nx, 0, Q[v, 2] - nz])
        out /= max(np.linalg.norm(out), 1e-6)
        lapel = (Q[v, 2] - nz) > 0.6 and Q[v, 1] < J["neck"][1] - 0.6
        if style == "hood":
            # a hood down: up from the neckline behind, over and folded down the back — nothing at the
            # sides, where it meets the front
            w = float(np.clip((nz + 0.2 - Q[v, 2]) / 0.7, 0, 1)) ** 0.7
            p1 = Q[v] + (up * 0.3 + out * 0.2) * h * w
            p2 = p1 + (out * 0.55 + up * 0.1) * h * w
            p3 = p2 + (out * 0.2 - up * 0.9) * h * w
            p4 = p3 + (-out * 0.3 - up * 0.45) * h * w
            pts = [p1, p2, p3, p4, Q[v] + (-up * 0.6 + out * 0.08) * h * w]
        elif style == "stand":
            pts = [Q[v] + up * h * 0.55 + out * h * 0.06, Q[v] + up * h * 0.95 + out * h * 0.14]
        elif lapel:
            # (down a deep V: lying on the chest, out to the side)
            side = np.array([np.sign(Q[v, 0] - nx) or 1.0, 0, 0.15])
            pts = [Q[v] + side * h * 0.45 + np.array([0, 0, 0.04]), Q[v] + side * h * 0.9 + np.array([0, -0.05, 0.05])]
        else:
            # (up round the neck, then turned down and out over its own band)
            stand = Q[v] + up * h * 0.55 + out * h * 0.05
            pts = [stand, stand + out * h * 0.55 - up * h * 0.45]
        for r, p in enumerate(pts):
            rows[r][v] = len(Q) + len(new)
            new.append(p)
            srcs.append(v)
    faces = [[a, b, rows[0][b], rows[0][a]] for a, b in edges]
    for r in range(nrows - 1):
        faces += [[rows[r][a], rows[r][b], rows[r + 1][b], rows[r + 1][a]] for a, b in edges]
    # (each new vertex goes with its edge vertex's source on the body — itself perhaps a sliced one)
    return np.vstack([Q, new]), kept + _both(faces), np.concatenate([src, src[np.array(srcs, dtype=int)]])


def tie(Q, kept, Z, J):
    """A tie down the front, from the collar to the belt: a strip over the shirt, wider down — its own
    piece (in the top's second colour). → (positions, faces, each vertex's source on the body)"""
    kind, _, y, front, _, _ = Z
    used = np.array(sorted({v for f in kept for v in f if v < len(kind)}))
    mid = used[(kind[used] == TORSO) & (np.abs(Q[used, 0] - J["neck"][0]) < 0.08) & (front[used] > 0.4)]
    top = J["neck"][1] - 0.45
    bottom = J["waist"][1] - 0.4
    chain = mid[(Q[mid, 1] < top) & (Q[mid, 1] > bottom)]
    if len(chain) < 3:
        return None
    # (one point a height: the front-most)
    rows = {}
    for v in chain:
        k = round(float(Q[v, 1]) / 0.25)
        if k not in rows or Q[v, 2] > Q[rows[k], 2]:
            rows[k] = v
    chain = [rows[k] for k in sorted(rows, reverse=True)]
    new, faces, srcs = [], [], []
    # (a knot under the collar, then the blade: narrow, widening down to its point)
    for i, v in enumerate(chain):
        k = i / max(1, len(chain) - 1)
        w = 0.2 if i == 0 else 0.13 + 0.25 * k
        p = Q[v] + np.array([0, 0, 0.06 if i == 0 else 0.04])
        new += [p + np.array([-w / 2, 0, 0]), p + np.array([w / 2, 0, 0])]
        srcs += [v, v]
        if i:
            a = 2 * (i - 1)
            faces.append([a, a + 1, a + 3, a + 2])
    tip = Q[chain[-1]] + np.array([0, -0.25, 0.04])
    new.append(tip)
    srcs.append(chain[-1])
    n = len(new) - 1
    faces.append([n - 2, n - 1, n])
    return np.array(new), _both(faces), np.array(srcs)


def _onto_hull(S, S0, V, F0, Z, J):
    """Points snapped up or down (from `S0`) scaled round the figure's axis by the body's own width there
    over its width where they were — on a slope they stayed as wide as they'd been: a waistband stood
    off a narrowing waist, a hem sank into a widening hip. The width read smoothly (bins interpolated)."""
    kind = Z[0]
    tights = sorted({v for f in F0 if f[2] == "helper-tights" for v in f[0]})
    T = V[np.array([v for v in tights if kind[v] not in (ARM_L, ARM_R)])]
    cx, cz = (J["hipL"][0] + J["hipR"][0]) / 2, (J["hipL"][2] + J["hipR"][2]) / 2
    NB, DY = 72, 0.15
    y0 = T[:, 1].min()
    ny = int((T[:, 1].max() - y0) / DY) + 2
    hull = np.zeros((NB, ny))
    a = np.arctan2(T[:, 0] - cx, T[:, 2] - cz)
    ab = ((a + np.pi) / (2 * np.pi) * NB).astype(int) % NB
    np.maximum.at(hull, (ab, np.clip(((T[:, 1] - y0) / DY).astype(int), 0, ny - 1)), np.hypot(T[:, 0] - cx, T[:, 2] - cz))
    hull = np.maximum(hull, np.maximum(np.roll(hull, 1, 0), np.roll(hull, -1, 0)) * 0.985)

    def width(P):
        fa = (np.arctan2(P[:, 0] - cx, P[:, 2] - cz) + np.pi) / (2 * np.pi) * NB - 0.5
        fy = np.clip((P[:, 1] - y0) / DY - 0.5, 0, ny - 1.001)
        a0 = np.floor(fa).astype(int)
        y_0 = np.floor(fy).astype(int)
        ta, ty = fa - a0, fy - y_0
        h = lambda i, j: hull[i % NB, np.minimum(j, ny - 1)]  # noqa: E731
        return (h(a0, y_0) * (1 - ta) + h(a0 + 1, y_0) * ta) * (1 - ty) + (h(a0, y_0 + 1) * (1 - ta) + h(a0 + 1, y_0 + 1) * ta) * ty

    k = width(S) / np.maximum(width(S0), 1e-6)
    k = np.clip(k, 0.8, 1.25)
    out = S.copy()
    out[:, 0] = cx + (S[:, 0] - cx) * k
    out[:, 2] = cz + (S[:, 2] - cz) * k
    return out


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
    if spec.get("pleats"):
        # (folds round it, deeper down)
        n, depth = spec["pleats"]
        r += depth * np.abs(np.sin(n * a / 2)) * np.clip(drop / 1.5, 0.15, 1)
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


def uv_metres(Q, faces, kind, J):
    """A garment's UVs in metres (its cloth's weave the same size everywhere): round each limb by along
    it, or round the body by height; per corner, a face across the wrap round unwrapped.
    → (uvs, each face's uv indices)"""
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


def _hat(Q, kept, src, spec, V, Z, J, hair=None):
    """A hat's own pieces round its shell: a flat cap's crown pressed down, a brim off its lower edge
    (all round, or in front), a pompom on top, cups over the ears, a clip in the hair."""
    from hair import _sphere  # (a lumpy sphere: the bun's)

    rng = np.random.default_rng(5)
    eL, eR = ears(V, Z, J)
    ax, az_ = (eL[0] + eR[0]) / 2, (eL[2] + eR[2]) / 2
    used = np.array(sorted({v for f in kept for v in f}), dtype=int)
    up = np.array([0, 1.0, 0])
    if spec.get("flat") and len(used):
        # (its crown pressed down: a flat cap's top)
        cut = J["brow"][1] + 0.9
        yy = Q[used, 1]
        Q[used, 1] = np.where(yy > cut, cut + (yy - cut) * (1 - spec["flat"]), yy)
    pieces = []
    if spec.get("brim") and len(used):
        w, droop, front_only = spec["brim"]
        edges = _open_edges(kept)
        low = min(Q[used, 1]) + 0.25
        edges = [(a, b) for a, b in edges if Q[a, 1] < low and Q[b, 1] < low]
        loop = sorted({v for e in edges for v in e})
        at = [{}, {}]
        new, srcs = [], []
        r = np.mean([np.hypot(Q[v, 0] - ax, Q[v, 2] - az_) for v in loop]) if loop else 1
        for v in loop:
            out = np.array([Q[v, 0] - ax, 0, Q[v, 2] - az_])
            out /= max(np.linalg.norm(out), 1e-6)
            k = np.clip(((Q[v, 2] - az_) / r) * 1.6 - 0.1, 0, 1) if front_only else 1.0
            for i, f in enumerate((0.5, 1.0)):
                at[i][v] = len(Q) + len(new)
                new.append(Q[v] + out * w * k * f - up * droop * k * f)
                srcs.append(v)
        faces = [[a, b, at[0][b], at[0][a]] for a, b in edges] + [[at[0][a], at[0][b], at[1][b], at[1][a]] for a, b in edges]
        Q = np.vstack([Q, np.array(new).reshape(-1, 3)])
        kept = kept + _both(faces)
        src = np.concatenate([src, src[np.array(srcs, dtype=int)]]) if srcs else src
    head = np.where(Z[0] == HEAD)[0]
    top = head[np.argmax(V[head, 1])]
    if spec.get("pom") and len(used):
        c = Q[used][np.argmax(Q[used, 1])] + up * spec["pom"] * 0.7
        pieces.append((c, spec["pom"], top, 1.0))
    for e in (eL, eR) if spec.get("cups") else ():
        out = np.sign(e[0] - ax) * np.array([1.0, 0, 0])
        near = head[np.argmin(np.linalg.norm(V[head] - e, axis=1))]
        pieces.append((e + out * 0.25, spec["cups"], near, 0.55))
    if spec.get("clip"):
        e = eL + np.array([-0.25, 0.75, 0.1])
        near = head[np.argmin(np.linalg.norm(V[head] - e, axis=1))]
        if hair is not None:
            # (on the hair's surface, not in it: out from the head's middle past the hair that way)
            ch = V[head].mean(0)
            d = e - ch
            u = d / np.linalg.norm(d)
            H = hair - ch
            rh = np.linalg.norm(H, axis=1)
            near_h = (H / np.maximum(rh[:, None], 1e-9)) @ u > np.cos(np.radians(10))
            if near_h.any():
                e = ch + u * max(np.linalg.norm(d), rh[near_h].max() + 0.08)
        pieces.append((e, 0.2, near, "clip"))
    for c, rr, near, squash in pieces:
        P, F = _sphere(c, rr, rng, 8)
        if squash == "clip":
            # (a barrette: long front to back, thin)
            P[:, 0] = c[0] + (P[:, 0] - c[0]) * 0.4
            P[:, 1] = c[1] + (P[:, 1] - c[1]) * 0.45
            P[:, 2] = c[2] + (P[:, 2] - c[2]) * 2.0
        elif squash != 1.0:
            # (flattened across: a cup over the ear)
            P[:, 0] = c[0] + (P[:, 0] - c[0]) * squash
        base = len(Q)
        Q = np.vstack([Q, P])
        kept = kept + [[base + i for i in f] for f in F]
        src = np.concatenate([src, np.full(len(P), near)])
    return Q, kept, src

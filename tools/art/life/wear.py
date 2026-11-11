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
import math

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
# `ribs` (period, depth dm) a puffer's quilting; `hole` how far round the neck its neckline reaches;
# `drape` (plan 74) how the cloth hangs off the body's widest — dm in per dm down it (None: skin-tight)
TOP = {"helper": "tights", "fabric": "linen", "drape": 0.12}
LONG = {**TOP, "sleeve": 1.95}
TEE = {**TOP, "sleeve": 0.42, "hem": ("hip", -0.35), "neck": 0.45, "scoop": 0.35, "thick": 0.09}
SHIRT = {**LONG, "sleeve": 1.93, "hem": ("hip", -0.45), "neck": 0.3, "scoop": 0.7, "vee": 0.6, "thick": 0.1, "collar": ("fold", 0.32)}
SWEAT = {**LONG, "hem": ("hip", -0.2), "neck": 0.35, "scoop": 0.15, "thick": 0.15}
OUTER = {"helper": "tights", "fabric": "twill", "sleeve": 1.98, "hem": ("hip", -0.1), "drape": 0.06}
HAT = {"helper": "head", "fabric": "boucle"}
PANTS = {"helper": "tights", "fabric": "twill", "legs": 1.96, "top": ("waist", -0.25), "thick": 0.06, "drape": 0.1}
GARMENTS = {
    # tops (batch 1, 5.2)
    "top-tee": TEE,
    "top-longtee": {**TEE, "sleeve": 1.9},
    "top-henley": {**TEE, "sleeve": 1.9, "scoop": 0.7, "vee": 0.5},
    "top-crop": {**TEE, "hem": ("waist", 0.35), "thick": 0.08, "drape": 0.2},
    "top-polo": {**TEE, "sleeve": 0.45, "neck": 0.25, "scoop": 0.3, "collar": ("fold", 0.28)},
    "top-tank": {**TOP, "drape": 0.25, "sleeve": 0.02, "hem": ("hip", -0.3), "neck": 0.55, "scoop": 0.6, "thick": 0.08},
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
    "top-dress": {**TOP, "fit_hem": True, "sleeve": 0.22, "hem": ("hip", 0.25), "neck": 0.5, "scoop": 0.4, "thick": 0.08,
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
    "bottom-leggings": {**PANTS, "fabric": "linen", "legs": 1.98, "top": ("waist", -0.15), "thick": 0.03, "drape": None},
    # skirts: off the hips, flared below them; over a top's hem (a top's tucked in: its thickness under)
    "bottom-skirt": {"fabric": "tweed", "helper": "skirt", "hem": ("knee", 0.6), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.12},
    "bottom-pleated": {"fabric": "tweed", "helper": "skirt", "hem": ("knee", 0.3), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.18,
                       "pleats": (18, 0.07)},
    "bottom-longskirt": {"fabric": "linen", "helper": "skirt", "hem": ("ankle", 1.2), "top": ("waist", -0.25), "thick": 0.14, "aline": 0.16},
    # outer layers (batch 3, 5.2): over a top — thicker than any top
    "outer-parka": {**OUTER, "neck": 0.05, "scoop": 0.15, "thick": 0.28, "collar": ("hood", 1.5),
                    "skirt": {"helper": "skirt", "over": 0.45, "top": ("hip", 0.5), "hem": ("knee", 1.4), "thick": 0.3, "aline": 0.2}},
    "outer-coat": {**OUTER, "fabric": "tweed", "neck": 0.3, "scoop": 1.3, "vee": 0.8, "hole": 1.4, "thick": 0.26, "collar": ("fold", 0.5),
                   "skirt": {"helper": "skirt", "over": 0.45, "top": ("hip", 0.5), "hem": ("knee", 0.3), "thick": 0.3, "aline": 0.12}},
    "outer-raincoat": {**OUTER, "fabric": "linen", "neck": 0.2, "scoop": 0.9, "vee": 0.6, "hole": 1.3, "thick": 0.25, "collar": ("fold", 0.45),
                       "skirt": {"helper": "skirt", "over": 0.45, "top": ("hip", 0.5), "hem": ("knee", 0.6), "thick": 0.28, "aline": 0.16}},
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
    # the hairs (5.3): the CC0 pack's under the wardrobe's names — plan 75: braids, and the short ones the
    # user kept (crew, slick, pixie); hair.py makes the rest, by WARDROBE_HAIR (works by others, our fur)
    "hair-braids": {"cc0": "hair/braid01/braid01", "hair": True},
    "hair-crew": {"cc0": "hair/short01/short01", "hair": True},
    "hair-slick": {"cc0": "hair/short04/short04", "hair": True},
    "hair-pixie": {"cc0": "hair/short03/short03", "hair": True},
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
        hand = [f"{j}{n}{S}" for j in ("fingers", "index", "thumb", "ring", "little") for n in ("", "2", "3") if f"{j}{n}{S}" in W]
        fore = [f"forearm{S}"] if f"forearm{S}" in W else []
        m = (side([f"shoulder{S}", f"elbow{S}", *fore, f"wrist{S}", *hand]) > 0.5) & (kind == TORSO)
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
    # (plan 74: a helper's seams welded — vertices in the same place made one: the skirt's cone is open
    # down one side, and flared its two edges parted in a slit)
    seen, weld = {}, {}
    for v in sorted({v for f in faces for v in f}):
        weld[v] = seen.setdefault(tuple(np.round(V[v] * 2e3).astype(int)), v)
    faces = [w for w in ([weld[v] for v in f] for f in faces) if len(set(w)) >= 3]
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
        # (plan 74: its hem turned back; its top too when it's a skirt of its own — a coat's or a dress's
        # piece joins the top's hem there)
        return finish(spec, Q, kept, src, J, outward, skirt_top="fabric" not in spec)
    # set off the body: along the shell's normals, by the thickness (`loose`: more down the legs — jeans
    # aren't tights; most at the knee and below)
    # (plan 74 phase 3: hung off the body's widest first — see `hang`)
    if spec.get("drape") is not None:
        Q = hang({**spec, "_kind": kind, "_t": t}, Q, used, kept, V, F0, Z, J)
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
    # (plan 74) the open edges finished: hems, cuffs, neckbands turned back; stand and fold collars swept
    # along the neckline (a hood as before)
    if spec["helper"] != "head":
        Q, kept, src = finish(spec, Q, kept, src, J, outward)
    if spec.get("collar") and spec["collar"][0] == "hood":
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
    # (plan 74: a coat's skirt over what hangs under it — trousers from mid-thigh, a top from the chest:
    # off the body alone, the trousers came through near its hem and a sweater at its waist)
    if spec.get("over"):
        r += spec["over"]
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
    # (plan 74: each limb round its two bones' own axes — shoulder to elbow, elbow to wrist: round the one
    # line from the shoulder to the wrist, the bent forearm ran near it and its angle hardly turned there,
    # the weave smeared into streaks)
    def seg(A, B):
        ax = (B - A) / np.linalg.norm(B - A)
        e1 = np.cross(ax, [0, 0, 1.0])
        e1 /= np.linalg.norm(e1)
        return A, ax, e1, np.cross(ax, e1), float(np.linalg.norm(B - A))

    axes = {}
    for k, (a, m, b) in {1: ("shoulderL", "elbowL", "wristL"), 2: ("shoulderR", "elbowR", "wristR"),
                         3: ("hipL", "kneeL", "ankleL"), 4: ("hipR", "kneeR", "ankleR")}.items():  # fmt: skip
        A, M, B = (np.asarray(J[n], dtype=float) for n in (a, m, b))
        axes[k] = (seg(A, M), seg(M, B), 0.45 if k <= 2 else 0.7)
    uvs, fts = [], []
    for f in faces:
        ks = [int(kind[v]) for v in f]
        k = max(set(ks), key=ks.count)
        if k in axes:
            s1, s2, r = axes[k]
            angs, vs = [], []
            for p in Q[f]:
                A, ax, e1, e2, L = s1
                along = (p - A) @ ax
                if along > L:
                    A, ax, e1, e2, _ = s2
                    along = L + (p - A) @ ax
                d = p - A
                angs.append(np.arctan2(d @ e2, d @ e1))
                vs.append(-along)
            ang, v = np.array(angs), np.array(vs)
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


# ---- plan 74 phase 3: the cloth hangs off the body's widest, not round every muscle
#
# A garment was the tights helper set off by its thickness: the body's own shape a little bigger, every
# pec, ab and quad in it, nothing hanging. `hang` moves its vertices out first, round an axis — the
# figure's for the torso, each limb's own for sleeves and legs:
#   1. the body's outer hull round that axis, a ring at a time (the most any of the tights reaches out
#      at each angle), made convex across a ring — cloth spans the hollows (between the pecs, the spine's
#      groove, the abs, the inside of the thigh);
#   2. then hung down from the widest above: going down (along the limb), never narrower than the ring
#      above less `drape` (dm in per dm down) — a tee falls from the chest past the waist, a sleeve
#      from the deltoid, a trouser leg from the thigh past the knee, a back from the shoulder blades;
#   3. each vertex out to that radius at its angle and height, blended in below where the garment hangs
#      from (a sleeve's top, the armpits, a waistband stay on the body); the moves smoothed over the
#      mesh's neighbours.
# The thickness is then laid on as before, along the new surface's normals.

HANG_NB = 64  # angle bins round an axis
HANG_DY = 0.12  # the torso's rings (dm)
HANG_NT = 48  # a limb's rings, over t 0…2


def _convex_rings(r, span):
    """Each ring made convex-ish: at each angle, at least what the chord to a neighbour within `span`
    bins reaches (r·cos of the angle between)."""
    nb = r.shape[0]
    out = r.copy()
    for j in range(1, span + 1):
        c = math.cos(2 * math.pi * j / nb)
        out = np.maximum(out, np.maximum(np.roll(r, j, 0), np.roll(r, -j, 0)) * c)
    return out


def _fill(r):
    """Bins no vertex fell in, from their neighbours round the ring and along."""
    out = r.copy()
    for _ in range(4):
        m = np.maximum(np.maximum(np.roll(out, 1, 0), np.roll(out, -1, 0)) * 0.97, out)
        up, dn = np.roll(m, 1, 1), np.roll(m, -1, 1)
        up[:, 0] = 0
        dn[:, -1] = 0
        out = np.where(out > 0, out, np.maximum(m, np.maximum(up, dn) * 0.97))
    return out


def _bilinear(grid, fa, fy):
    nb, ny = grid.shape
    a0 = np.floor(fa).astype(int)
    y0 = np.clip(np.floor(fy).astype(int), 0, ny - 1)
    y1 = np.clip(y0 + 1, 0, ny - 1)
    ta, ty = fa - np.floor(fa), np.clip(fy - y0, 0, 1)
    g = lambda i, j: grid[i % nb, j]  # noqa: E731
    return (g(a0, y0) * (1 - ta) + g(a0 + 1, y0) * ta) * (1 - ty) + (g(a0, y1) * (1 - ta) + g(a0 + 1, y1) * ta) * ty


def _limb_frame(P, a, b, c, t):
    """Each point's place round its limb: (the axis point, the radial direction's angle, its radius).
    The angle measured from the limb's front (the world's +z made square to the segment)."""
    seg_a = np.where((t <= 1)[:, None], a, b)
    seg_b = np.where((t <= 1)[:, None], b, c)
    d = seg_b - seg_a
    L = np.linalg.norm(d, axis=1, keepdims=True)
    d = d / np.maximum(L, 1e-9)
    u = np.clip(((P - seg_a) * d).sum(1, keepdims=True), 0, L)
    A = seg_a + d * u
    R = P - A
    fwd = np.array([0.0, 0.0, 1.0])
    ref = fwd - (d @ fwd)[:, None] * d
    ref /= np.maximum(np.linalg.norm(ref, axis=1, keepdims=True), 1e-9)
    ref2 = np.cross(d, ref)
    ang = np.arctan2((R * ref2).sum(1), (R * ref).sum(1))
    return A, ang, np.linalg.norm(R, axis=1), R


def hang(spec, Q, used, faces, V, F0, Z, J):
    """Garment vertices `Q[used]` moved out to hang off the body (see above). `faces` the kept faces
    (indices into Q)."""
    drape = spec.get("drape")
    if drape is None or spec["helper"] != "tights":
        return Q
    kind = np.asarray(Z[0])
    tights = np.array(sorted({v for f in F0 if f[2] == "helper-tights" for v in f[0]}))
    T, Tk, Tt = V[tights], kind[tights], np.asarray(Z[1])[tights]
    out = Q.copy()
    U = np.asarray(used)
    P = Q[U]
    # the garment's own vertices' kinds and places along limbs: new (cut) ones are their source's — the
    # caller passes `kinds`/`ts` over all of Q
    gk, gt = spec["_kind"][U], spec["_t"][U]
    # (the most it stands off the body anywhere, dm: past it a hem ballooned)
    ease_max = spec.get("ease_max", 0.4)
    move = np.zeros_like(P)
    # -- the torso, round the figure's axis (a top's hips too — the thighs' vertices above its hem: on the
    # body while the torso hung forward, they creased a V at the groin; the hull takes the thighs in, so
    # it spans the front flat)
    bottom = spec.get("legs") is not None
    legk = (gk == LEG_L) | (gk == LEG_R)
    # (not a coat's or a dress's: their skirt piece hangs from the hips, and the top's hips hung forward
    # no longer met it — a hole at the side)
    with_hips = not bottom and "skirt" not in spec
    tm = (gk == TORSO) | (legk if with_hips else False)
    if tm.any():
        tlo = T[Tk == TORSO][:, 1].min()
        hips = ((Tk == LEG_L) | (Tk == LEG_R)) & (T[:, 1] >= tlo) if with_hips else np.zeros(len(T), dtype=bool)
        TT = T[(Tk == TORSO) | hips]
        y0 = TT[:, 1].min()
        ny = int((TT[:, 1].max() - y0) / HANG_DY) + 2
        yb = np.clip(((TT[:, 1] - y0) / HANG_DY).astype(int), 0, ny - 1)
        # the axis by height: each ring's middle (its extremes' midpoint), smoothed
        cx = np.full(ny, np.nan)
        cz = np.full(ny, np.nan)
        for i in range(ny):
            s = TT[yb == i]
            if len(s):
                cx[i] = (s[:, 0].min() + s[:, 0].max()) / 2
                cz[i] = (s[:, 2].min() + s[:, 2].max()) / 2
        ok = ~np.isnan(cx)
        idx = np.arange(ny)
        cx = np.interp(idx, idx[ok], cx[ok])
        cz = np.interp(idx, idx[ok], cz[ok])
        k = np.array([1, 2, 3, 2, 1], dtype=float)
        k /= k.sum()
        cx = np.convolve(np.pad(cx, 2, mode="edge"), k, "valid")
        cz = np.convolve(np.pad(cz, 2, mode="edge"), k, "valid")
        ang = lambda X, i: np.arctan2(X[:, 0] - cx[i], X[:, 2] - cz[i])  # noqa: E731
        rad = lambda X, i: np.hypot(X[:, 0] - cx[i], X[:, 2] - cz[i])  # noqa: E731
        hull = np.zeros((HANG_NB, ny))
        ab = ((ang(TT, yb) + np.pi) / (2 * np.pi) * HANG_NB).astype(int) % HANG_NB
        np.maximum.at(hull, (ab, yb), rad(TT, yb))
        # (a top's rings wholly convex: near the crotch the thighs are two lobes too far apart for 90° — its
        # hem lifted in a notch between them; a bottom's only bridged across 90°)
        hull = _convex_rings(_fill(hull), HANG_NB // 4 if bottom else HANG_NB // 2)
        # hung from the armpits down (a top); a bottom only bridged at the hips — jeans fit the seat and the
        # hips (hung from the seat they stood out past a tee's hem: a leotard over them)
        top = J["shoulderL"][1] - 0.9 if not bottom else -1e9
        hung = hull.copy()
        for i in range(ny - 2, -1, -1):
            if y0 + (i + 1) * HANG_DY > top:
                continue
            hung[:, i] = np.maximum(hull[:, i], hung[:, i + 1] - drape * HANG_DY)
        Pt = P[tm]
        fy = np.clip((Pt[:, 1] - y0) / HANG_DY - 0.5, 0, ny - 1.001)
        iy = np.clip(np.round(fy).astype(int), 0, ny - 1)
        a = ang(Pt, iy)
        fa = (a + np.pi) / (2 * np.pi) * HANG_NB - 0.5
        want = _bilinear(hung, fa, fy)
        have = rad(Pt, iy)
        # (blended in under where it hangs from; a bottom's waistband on the body)
        w = np.clip((top + 0.3 - Pt[:, 1]) / 0.6, 0, 1)
        if bottom:
            w = np.clip((level(J, spec["top"]) - Pt[:, 1] - 0.2) / 0.4, 0, 1) if "top" in spec else np.ones(len(Pt))
        elif spec.get("fit_hem") and "hem" in spec:
            # (a dress's top fitted toward its hem, where its skirt piece — off the body's hips — takes over:
            # hung from the bust it stood out past the skirt. Not a coat's: what's under it hangs, and came
            # through its pinched waist)
            w = w * np.clip((Pt[:, 1] - level(J, spec["hem"]) - 0.2) / 1.0, 0, 1)
        # (a top's front falls straight off the belly and the chest: more room than a limb's — capped at a
        # limb's, a tee's hem wrapped into the lower belly, a leotard)
        grow = np.minimum(np.maximum(want - have, 0), ease_max * (1 if bottom else 2.2)) * w
        dirn = np.stack([np.sin(a), np.zeros_like(a), np.cos(a)], 1)
        move[tm] = dirn * grow[:, None]
    # -- the limbs, round each one's own axis
    for kk, names in ((ARM_L, ("shoulderL", "elbowL", "wristL")), (ARM_R, ("shoulderR", "elbowR", "wristR")),
                      (LEG_L, ("hipL", "kneeL", "ankleL")), (LEG_R, ("hipR", "kneeR", "ankleR"))):  # fmt: skip
        lm = gk == kk
        # (a top's hips — the legs' vertices above its hem — on the body: only a bottom's legs hang)
        if not lm.any() or (kk in (LEG_L, LEG_R) and spec.get("legs") is None):
            continue
        a, b, c = (np.asarray(J[n], dtype=float) for n in names)
        sel = Tk == kk
        TL, tl = T[sel], Tt[sel]
        n = len(TL)
        _, tang, trad, _ = _limb_frame(TL, np.tile(a, (n, 1)), np.tile(b, (n, 1)), np.tile(c, (n, 1)), tl)
        tb = np.clip((tl / 2 * HANG_NT).astype(int), 0, HANG_NT - 1)
        ab = ((tang + np.pi) / (2 * np.pi) * HANG_NB).astype(int) % HANG_NB
        hull = np.zeros((HANG_NB, HANG_NT))
        np.maximum.at(hull, (ab, tb), trad)
        hull = _convex_rings(_fill(hull), HANG_NB // 6)
        # hung along the limb from where the garment starts hanging: past the shoulder's cap; a trouser leg
        # from mid-thigh (above, it fits). Below the elbow or the knee it tapers in faster (the drape's
        # half again): hung straight from the thigh, the hem stood out over the shoe in a bell
        start = 0.25 if kk in (ARM_L, ARM_R) else 0.5
        lower = np.arange(HANG_NT) >= HANG_NT / 2
        lens = np.where(lower, np.linalg.norm(c - b) * 1.5, np.linalg.norm(b - a)) * (2 / HANG_NT)
        hung = hull.copy()
        for i in range(1, HANG_NT):
            if (i + 0.5) * 2 / HANG_NT < start:
                continue
            # (past t 1.8 — the ankle, the wrist — tapering on from above only: its bones' bulge, the
            # heel's, flared a trouser's hem out over the shoe)
            if (i + 0.5) * 2 / HANG_NT > 1.8:
                hung[:, i] = hung[:, i - 1] - drape * lens[i]
            else:
                hung[:, i] = np.maximum(hull[:, i], hung[:, i - 1] - drape * lens[i])
        Pl, tlg = P[lm], gt[lm]
        m = len(Pl)
        _, pang, prad, R = _limb_frame(Pl, np.tile(a, (m, 1)), np.tile(b, (m, 1)), np.tile(c, (m, 1)), tlg)
        want = _bilinear(hung, (pang + np.pi) / (2 * np.pi) * HANG_NB - 0.5, np.clip(tlg / 2 * HANG_NT - 0.5, 0, HANG_NT - 1.001))
        w = np.clip((tlg - start) / 0.25, 0, 1)
        if spec.get("cuff"):
            w *= np.clip((1.85 - tlg) / 0.15, 0, 1)
        grow = np.minimum(np.maximum(want - prad, 0), ease_max) * w
        move[lm] = R / np.maximum(prad, 1e-9)[:, None] * grow[:, None]
    # the moves smoothed over the garment's own neighbours (the bins' steps)
    pos = {v: i for i, v in enumerate(U)}
    nbr = [set() for _ in range(len(U))]
    for f in faces:
        for i in range(len(f)):
            p, q = pos[f[i]], pos[f[(i + 1) % len(f)]]
            nbr[p].add(q)
            nbr[q].add(p)
    nbl = [np.fromiter(s, int) if s else np.array([i]) for i, s in enumerate(nbr)]
    for _ in range(spec.get("hang_smooth", 6)):
        move = np.array([0.5 * move[i] + 0.5 * move[n].mean(0) for i, n in enumerate(nbl)])
    out[U] = P + move
    return out


# ---- plan 74: the garments' edges finished
#
# A garment's open edges were a single paper-thin layer, ragged where the helper's faces were sliced,
# and its collars were built a vertex at a time off an unordered edge — spikes. `finish` walks each open
# edge as an ordered loop and
#   - smooths it along itself (the slicing's notches out);
#   - turns it back inside as a band (a hem, a cuff, a waistband, a neckband): from the edge in toward
#     the body by the cloth's thickness and back up the garment — the cloth has a thickness at its edge;
#   - round a neckline with a collar, sweeps the collar's profile along the smoothed loop: standing, or
#     standing then folded down and out over itself; down a deep V, lapels lying out on the chest. Each
#     fades to nothing where it ends (the front of a V), so there are no ends to spike.

HEM_IN = 0.035  # the turned-back band: this far in toward the body (dm) …
HEM_UP = 0.11  # … and this far back up the garment


def _loops(faces):
    """The open edges as ordered loops of vertices (each closed loop once), in their faces' winding."""
    nxt = {}
    for a, b in _open_edges(faces):
        nxt.setdefault(a, []).append(b)
    seen = set()
    out = []
    for start in list(nxt):
        if start in seen:
            continue
        loop, v = [], start
        while v is not None and v not in seen:
            seen.add(v)
            loop.append(v)
            succ = [w for w in nxt.get(v, []) if w not in seen]
            v = succ[0] if succ else None
        if len(loop) >= 3:
            out.append(loop)
    return out


def _smooth_loop(P, loop, it=6):
    """A closed loop's points smoothed along it (moves only those points)."""
    L = np.array(loop)
    for _ in range(it):
        p = P[L]
        P[L] = 0.5 * p + 0.25 * (np.roll(p, 1, 0) + np.roll(p, -1, 0))
    return P


def _into(P, faces, loop):
    """At each loop vertex, the direction from the edge back into the garment, along its surface: toward
    its neighbours off the edge."""
    on = set(loop)
    nb = {v: [] for v in loop}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            if a in on and b not in on:
                nb[a].append(b)
            if b in on and a not in on:
                nb[b].append(a)
    d = np.zeros((len(loop), 3))
    for i, v in enumerate(loop):
        if nb[v]:
            d[i] = P[nb[v]].mean(0) - P[v]
    n = np.linalg.norm(d, axis=1, keepdims=True)
    # (a vertex with no inner neighbour: its loop neighbours')
    d = np.where(n > 1e-9, d / np.maximum(n, 1e-9), 0)
    for _ in range(2):
        d = np.where(np.linalg.norm(d, axis=1, keepdims=True) > 1e-9, d, 0.5 * (np.roll(d, 1, 0) + np.roll(d, -1, 0)))
    return d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)


def _strip(rows, closed=True):
    """Quads between consecutive rows of vertex indices (each row along the loop)."""
    faces = []
    n = len(rows[0])
    for r in range(len(rows) - 1):
        a, b = rows[r], rows[r + 1]
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            faces.append([a[i], a[j], b[j], b[i]])
    return faces


def _collar_rows(spec, P, loop, N, J):
    """A collar's rows along the neckline loop (positions), and each loop vertex's weight (0: none)."""
    style, h = spec["collar"]
    nx, ny, nz = J["neck"]
    up = np.array([0, 1.0, 0])
    p = P[loop]
    n = N[loop]
    out = n * np.array([1, 0, 1])
    out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)
    drop = ny - p[:, 1]  # how far under the neck joint
    front = p[:, 2] - nz
    # (round the neck and down a little; it fades out down a V's front — the lapels take over there)
    w = np.clip((1.3 - drop) / 0.45, 0, 1)
    deep = spec.get("hole", 0) >= 1.3
    lap = np.clip((drop - 0.7) / 0.5, 0, 1) * (front > 0.25) * (1 if deep and style == "fold" else 0)
    # (the lapels taper to nothing at the V's bottom)
    vbottom = drop.max()
    lap *= np.clip((vbottom - drop) / 1.0, 0, 1) ** 0.8
    side = np.stack([np.sign(p[:, 0] - nx + 1e-9), np.zeros(len(p)), np.full(len(p), 0.12)], 1)
    side /= np.linalg.norm(side, axis=1, keepdims=True)
    W = w[:, None]
    L = lap[:, None]
    if style == "stand":
        rows = [p + (up * 0.55 * h + out * 0.05 * h) * W, p + (up * 0.95 * h + out * 0.12 * h) * W]
    else:
        stand = p + (up * 0.5 * h + out * 0.05 * h) * W
        rows = [
            stand,
            stand + (up * 0.06 * h + out * 0.2 * h) * W,
            stand + (-up * 0.4 * h + out * 0.55 * h) * W,
        ]
        # (lapels: lying out on the chest from the V's edge, a little proud of it)
        if lap.any():
            lrows = [p + side * 0.45 * h + n * 0.05, p + side * 0.95 * h + n * 0.07 - up * 0.08 * h, p + side * 1.05 * h + n * 0.06 - up * 0.3 * h]
            rows = [r * (1 - L) + lr * L for r, lr in zip(rows, lrows, strict=True)]
    return rows, np.maximum(w, lap)


def finish(spec, Q, kept, src, J, outward, skirt_top=False):
    """A garment's open edges finished (see above). `skirt_top`: a skirt piece's top joins its top's hem —
    left as it is. → (Q, faces, src)"""
    loops = _loops(kept)
    if not loops:
        return Q, kept, src
    P = Q.copy()
    ny = J["neck"][1]
    new, srcs, faces = [], [], []
    # (the loop's own points smoothed first — then the normals of the smoothed surface)
    kinds = []
    for loop in loops:
        ys = P[loop, 1]
        # (round the neck's axis: a short sleeve's end is as high, but out at the shoulder)
        rad = np.hypot(P[loop, 0] - J["neck"][0], P[loop, 2] - J["neck"][2]).mean()
        is_neck = spec["helper"] == "tights" and spec.get("legs") is None and ys.max() > ny - 1.6 and rad < 1.9
        top_of_skirt = spec["helper"] == "skirt" and ys.mean() > J["hip"][1] - 0.2
        kinds.append("neck" if is_neck else "top" if top_of_skirt else "edge")
        if not (top_of_skirt and skirt_top):
            P = _smooth_loop(P, loop)
    N = outward(P, normals(P, kept))

    def add(pts, base):
        idx = list(range(len(P) + len(new), len(P) + len(new) + len(pts)))
        new.extend(pts)
        srcs.extend(src[base])
        return idx

    for loop, k in zip(loops, kinds, strict=True):
        if k == "top" and skirt_top:
            continue
        L = np.array(loop)
        d = _into(P, kept, loop)
        n = N[L]
        # the turned-back band: the edge rolled a touch, then in and back up inside
        roll = add(P[L] - n * HEM_IN * 0.5 - d * 0.012, L)
        inner = add(P[L] - n * HEM_IN + d * HEM_UP, L)
        faces += _both(_strip([list(L), roll, inner]))
        if k == "neck" and spec.get("collar") and spec["collar"][0] in ("stand", "fold"):
            rows, w = _collar_rows(spec, P, list(L), N, J)
            if w.max() > 0.05:
                rr = [add(r, L) for r in rows]
                faces += _both(_strip([list(L)] + rr))
    return np.vstack([P, np.array(new).reshape(-1, 3)]), kept + faces, np.concatenate([src, np.array(srcs, dtype=int)])

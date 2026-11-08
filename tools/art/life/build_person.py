# Plan 73, phase 0b — one person for the life look, built in Blender from the MakeHuman data (CC0:
# the base mesh, its targets, the default skeleton's joints and weights, the system assets' clothes,
# hair, eyes, brows, lashes and skins; none of MakeHuman's program code is used — this file reads
# their data formats itself).
#
#   blender -b --factory-startup -P tools/art/life/build_person.py -- --who man [--src DIR] [--out DIR]
#
# What it does:
#   1. the base mesh shaped by MakeHuman's macro targets (gender, a young adult, muscle, weight,
#      height, ideal proportions, an ethnic mix) — the "slightly idealised" person of plan 73
#   2. the clothes, hair, eyes, brows and lashes fitted to it (each proxy vertex a blend of three body
#      vertices and a scaled offset), the body's skin hidden under the clothes taken out
#   3. the arms brought down to hang straight at the sides (linear blend skinning with MakeHuman's own
#      weights): our rig's rest has no joint turned, arms hanging, facing +z (chars/rig.ts)
#   4. MakeHuman's 163 bones' weights folded onto our 31 joints (chars/rig.ts JOINTS), their places
#      from MakeHuman's joint markers
#   5. written as one .glb: a mesh per part, an armature of our joints (only their places matter: the
#      client builds its own bones from them, unturned, as chars/model.ts does), textures at 1024 px
import json
import math
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


WHO = arg("--who", "man")
MUSCLE = arg("--muscle", "")
# --paint: the textures repainted (an edge-preserving Kuwahara pass: the photo's grain and pores
# become flat patches of colour with clean edges, like brushwork; a little more colour), written as
# person-<who>-painted.glb — the "painted" style asked about after phase 0b
PAINT = "--paint" in argv
SRC = arg("--src", os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src"))
OUT = arg("--out", os.path.join(os.path.dirname(__file__), "../../../apps/client/public/life"))
TEX = int(arg("--tex", "1024"))
MH = os.path.join(SRC, "mh/makehuman/data")
SYS = os.path.join(SRC, "sysassets/sys")

# The face, "slightly idealised" (plan 73): MakeHuman's face targets (targets/<dir>/<name>.target), a
# weight each; "{s}" for both sides (l-, r-). Shared first, then each person's own on top.
IDEAL = {
    "eyes/{s}-eye-scale-incr": 0.3,  # eyes a little larger
    "eyes/{s}-eye-height2-incr": 0.2,  # a touch more open
    "eyes/{s}-eye-bag-decr": 0.7,  # no tired bags
    "eyes/{s}-eye-corner2-up": 0.15,  # the outer corners lifted a little
    "nose/nose-volume-decr": 0.25,
    "nose/nose-scale-horiz-decr": 0.12,
    "nose/nose-nostrils-width-decr": 0.25,
    "nose/nose-point-up": 0.15,
    "mouth/mouth-upperlip-volume-incr": 0.25,
    "mouth/mouth-lowerlip-volume-incr": 0.25,
    "mouth/mouth-cupidsbow-incr": 0.3,
    "mouth/mouth-angles-up": 0.25,  # resting, not glum
    "mouth/mouth-laugh-lines-in": 0.4,
    "cheek/{s}-cheek-bones-incr": 0.3,
    "cheek/{s}-cheek-volume-decr": 0.15,
    "head/head-oval": 0.35,
    "head/head-fat-decr": 0.3,
    "head/head-age-decr": 0.4,  # smoother, younger skin over the bone
    "neck/neck-double-decr": 0.6,
    "ears/{s}-ear-scale-decr": 0.2,
    "ears/{s}-ear-flap-decr": 0.3,
}
MAN_FACE = {
    # (his shoulders read too big — the user, 2026-11-08: a narrower span, less deltoid and upper arm)
    "measure/measure-shoulder-dist-decr": 1.0,
    # (and his head a touch larger: the life-sim proportion, the shoulders read in scale beside it)
    "head/head-scale-vert-incr": 0.18,
    "head/head-scale-horiz-incr": 0.18,
    "head/head-scale-depth-incr": 0.18,
    "armslegs/{s}-upperarm-shoulder-muscle-decr": 1.0,
    "armslegs/{s}-upperarm-muscle-decr": 0.5,
    "head/head-fat-decr": 0.12,  # (the shared 0.3 left him gaunt)
    "cheek/{s}-cheek-volume-decr": 0.0,
    "chin/chin-width-incr": 0.12,
    "chin/chin-prominent-incr": 0.15,
    "chin/chin-bones-incr": 0.1,
    "eyebrows/eyebrows-trans-up": 0.1,
}
WOMAN_FACE = {
    "head/head-fat-decr": 0.12,  # (the shared 0.3 left him gaunt)
    "cheek/{s}-cheek-volume-decr": 0.0,
    "eyes/{s}-eye-scale-incr": 0.45,
    "mouth/mouth-upperlip-volume-incr": 0.4,
    "mouth/mouth-lowerlip-volume-incr": 0.4,
    "nose/nose-volume-decr": 0.4,
    "nose/nose-point-width-decr": 0.3,
    "chin/chin-width-decr": 0.3,
    "chin/chin-bones-decr": 0.3,
    "head/head-oval": 0.5,
    "cheek/{s}-cheek-bones-incr": 0.4,
    "eyebrows/eyebrows-angle-up": 0.3,
    "eyebrows/eyebrows-trans-up": 0.15,
}

# Who: the macro sliders (MakeHuman's 0…1, 0.5 the average) and what they wear.
PEOPLE = {
    "man": {
        "gender": 1.0,
        "muscle": 0.62,
        "weight": 0.48,
        "height": 0.45,
        "proportions": 1.0,
        "race": {"caucasian": 0.7, "african": 0.1, "asian": 0.2},
        "skin": "skins/young_caucasian_male/young_lightskinned_male_diffuse.png",
        "parts": [
            ("clothes", "clothes/male_casualsuit01/male_casualsuit01"),
            ("shoes", "clothes/shoes05/shoes05"),
            ("hair", "hair/short02/short02"),
            ("brows", "eyebrows/eyebrow004/eyebrow004"),
            ("lashes", "eyelashes/eyelashes01/eyelashes01"),
        ],
        "brow_rgb": (0.22, 0.15, 0.1),
        "hair_rgb": (0.2, 0.13, 0.08),
        "shoulder_slope": 7,
        "eye_tex": "eyes/materials/bluegreen_eye.png",
        "lash_alpha": 0.55,
        "face": {**IDEAL, **MAN_FACE},
    },
    "woman": {
        "gender": 0.0,
        "muscle": 0.55,
        "weight": 0.45,
        "height": 0.5,
        "proportions": 1.0,
        "race": {"african": 0.75, "caucasian": 0.15, "asian": 0.1},
        "skin": "skins/young_african_female/young_darkskinned_female_diffuse.png",
        "parts": [
            ("clothes", "clothes/female_elegantsuit01/female_elegantsuit01"),
            ("shoes", "clothes/shoes04/shoes04"),
            ("hair", "hair/ponytail01/ponytail01"),
            ("brows", "eyebrows/eyebrow002/eyebrow002"),
            ("lashes", "eyelashes/eyelashes02/eyelashes02"),
        ],
        "brow_rgb": (0.13, 0.08, 0.05),
        "hair_rgb": (0.09, 0.06, 0.045),
        "skirt": True,
        "eye_tex": "eyes/materials/brownlight_eye.png",
        "lash_alpha": 0.85,
        "face": {**IDEAL, **WOMAN_FACE},
    },
}
P = PEOPLE[WHO]
if MUSCLE:
    P["muscle"] = float(MUSCLE)
COMMON = [("eyes", "eyes/high-poly/high-poly")]
EYE_TEX = "eyes/materials/brown_eye.png"

# Two more of ours beyond chars/rig.ts's: the eyes, each its own bone under the head (the gaze turns
# them; life-person.ts EXTRA)
EYES = ["eyeL", "eyeR"]

# MakeHuman's bones onto ours (chars/rig.ts JOINTS). The face's own bones all go with the head.
OURS = [
    "hips", "spine", "chest", "neck", "head",
    "shoulderL", "elbowL", "wristL", "fingersL", "indexL", "thumbL",
    "shoulderR", "elbowR", "wristR", "fingersR", "indexR", "thumbR",
    "thighL", "kneeL", "ankleL", "toeL", "thighR", "kneeR", "ankleR", "toeR",
    "hair", "skirt", "scarf", "pack", "earL", "earR",
]  # fmt: skip
PARENT = {
    "hips": None, "spine": "hips", "chest": "spine", "neck": "chest", "head": "neck",
    "shoulderL": "chest", "elbowL": "shoulderL", "wristL": "elbowL", "fingersL": "wristL",
    "indexL": "wristL", "thumbL": "wristL",
    "shoulderR": "chest", "elbowR": "shoulderR", "wristR": "elbowR", "fingersR": "wristR",
    "indexR": "wristR", "thumbR": "wristR",
    "thighL": "hips", "kneeL": "thighL", "ankleL": "kneeL", "toeL": "ankleL",
    "thighR": "hips", "kneeR": "thighR", "ankleR": "kneeR", "toeR": "ankleR",
    "hair": "head", "skirt": "hips", "scarf": "chest", "pack": "chest", "earL": "head", "earR": "head",
    "eyeL": "head", "eyeR": "head",
}  # fmt: skip


def ours_of(bone):
    s = "L" if bone.endswith(".L") else "R" if bone.endswith(".R") else ""
    b = bone[:-2] if s else bone
    if b == "eye":
        return "eye" + s
    if b in ("root", "spine05", "pelvis"):
        return "hips"
    if b in ("spine04", "spine03"):
        return "spine"
    if b in ("spine02", "spine01", "clavicle", "breast"):
        return "chest"
    if b in ("neck01", "neck02", "neck03"):
        return "neck"
    if b in ("shoulder01", "upperarm01", "upperarm02"):
        return "shoulder" + s
    if b in ("lowerarm01", "lowerarm02"):
        return "elbow" + s
    if b == "wrist" or b.startswith("metacarpal"):
        return "wrist" + s
    if b.startswith("finger1-"):
        return "thumb" + s
    if b.startswith("finger2-"):
        return "index" + s
    if b.startswith("finger"):
        return "fingers" + s
    if b in ("upperleg01", "upperleg02"):
        return "thigh" + s
    if b in ("lowerleg01", "lowerleg02"):
        return "knee" + s
    if b == "foot":
        return "ankle" + s
    if b.startswith("toe"):
        return "toe" + s
    return "head"  # head, jaw, eyes, tongue, the face's muscles, special*


# ---- reading MakeHuman's data


def read_obj(path):
    V, VT, F = [], [], []
    group = None
    for line in open(path):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            group = line.split()[1]
        elif line.startswith("f "):
            vs, ts = [], []
            for t in line.split()[1:]:
                p = t.split("/")
                vs.append(int(p[0]) - 1)
                ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
            F.append((vs, ts, group))
    return np.array(V, dtype=np.float64), np.array(VT, dtype=np.float64), F


def read_target(path):
    idx, d = [], []
    for line in open(path):
        if not line.strip() or line[0] == "#":
            continue
        p = line.split()
        idx.append(int(p[0]))
        d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3)


def three(v):
    """A 0…1 slider over MakeHuman's min / average / max targets."""
    return {"min": max(0.0, 1 - 2 * v), "average": 1 - abs(2 * v - 1), "max": max(0.0, 2 * v - 1)}


def shape(V):
    T = os.path.join(MH, "targets/macrodetails")
    gw = {"female": 1 - P["gender"], "male": P["gender"]}
    mw = three(P["muscle"])
    ww = three(P["weight"])
    h = P["height"]
    hw = {"max": max(0.0, (h - 0.5) * 2), "min": max(0.0, (0.5 - h) * 2)}
    out = V.copy()
    used = []

    def add(rel, k):
        if k < 1e-4:
            return
        path = os.path.join(T, rel)
        if not os.path.exists(path):
            print("  (no target)", rel)
            return
        i, d = read_target(path)
        out[i] += k * d
        used.append((rel, round(k, 3)))

    for g, a in gw.items():
        for race, r in P["race"].items():
            add(f"{race}-{g}-young.target", a * r)
        for m, b in mw.items():
            for w, c in ww.items():
                base = f"{g}-young-{m}muscle-{w}weight"
                add(f"universal-{base}.target", a * b * c)
                for x, e in hw.items():
                    add(f"height/{base}-{x}height.target", a * b * c * e)
                add(f"proportions/{base}-idealproportions.target", a * b * c * P["proportions"])
    # the face's own targets, on top
    TT = os.path.join(MH, "targets")
    for rel, k in P.get("face", {}).items():
        for side in ("l", "r") if "{s}" in rel else ("",):
            path = os.path.join(TT, rel.replace("{s}", side) + ".target")
            if not os.path.exists(path):
                print("  (no face target)", rel.replace("{s}", side))
                continue
            i, d = read_target(path)
            out[i] += k * d
            used.append((rel, k))
    print("  targets:", len(used))
    return out


def read_mhclo(path):
    d = {"scale": {}, "refs": [], "delete": []}
    sec = None
    for line in open(path):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        p = s.split()
        if p[0] in ("x_scale", "y_scale", "z_scale"):
            d["scale"][p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
        elif p[0] == "obj_file":
            d["obj"] = p[1]
        elif p[0] == "verts":
            sec = "verts"
        elif p[0] == "delete_verts":
            sec = "delete"
        elif p[0] in ("weights", "offset"):
            sec = None
        elif sec == "verts" and p[0][0].isdigit():
            if len(p) == 1:
                d["refs"].append(((int(p[0]), int(p[0]), int(p[0])), (1.0, 0.0, 0.0), (0.0, 0.0, 0.0)))
            else:
                d["refs"].append(
                    (
                        (int(p[0]), int(p[1]), int(p[2])),
                        (float(p[3]), float(p[4]), float(p[5])),
                        (float(p[6]), float(p[7]), float(p[8])),
                    )
                )
        elif sec == "delete":
            # (ranges written "a - b", across lines; carried over a line's end)
            for t in p:
                if t == "-":
                    d["_range"] = True
                elif t.isdigit():
                    if d.pop("_range", False) and d["delete"]:
                        d["delete"].extend(range(d["delete"][-1] + 1, int(t) + 1))
                    else:
                        d["delete"].append(int(t))
    return d


def fit(clo, V):
    """A proxy's vertices on the shaped body; and which body vertices each blends (for its weights)."""
    sc = np.ones(3)
    for ax, k in (("x", 0), ("y", 1), ("z", 2)):
        if ax in clo["scale"]:
            a, b, den = clo["scale"][ax]
            sc[k] = abs(V[a][k] - V[b][k]) / den
    refs = np.array([r[0] for r in clo["refs"]], dtype=np.int64)
    w = np.array([r[1] for r in clo["refs"]])
    off = np.array([r[2] for r in clo["refs"]])
    pos = (V[refs] * w[:, :, None]).sum(1) + off * sc
    return pos, refs, w


# ---- the shaped body, its joints and weights

print(f"building {WHO}")
V0, VT0, F0 = read_obj(os.path.join(MH, "3dobjs/base.obj"))
V = shape(V0)

# The face's shapes (MakeHuman's expression units, by the person's ethnic mix): a blink (both lids
# shut), talking (the mouth open), a smile (the corners pulled up). Each a delta on the shaped body;
# the proxies are fitted on body + delta too, so the lashes close with the lids.
SHAPES = {
    "blink": [("eye-left-closure", 1.0), ("eye-right-closure", 1.0)],
    "talk": [("mouth-open", 0.55)],
    "smile": [("mouth-corner-puller", 0.8), ("eye-left-slit", 0.2), ("eye-right-slit", 0.2)],
}
DV = {}
for shp, units in SHAPES.items():
    d = np.zeros_like(V)
    for unit, k in units:
        for race, r in P["race"].items():
            path = os.path.join(MH, f"targets/expression/units/{race}/{unit}.target")
            if os.path.exists(path):
                i, dd = read_target(path)
                d[i] += k * r * dd
    DV[shp] = d
    print(f"  shape {shp}: {np.abs(d).max():.3f} dm at most")
skel = json.load(open(os.path.join(MH, "rigs/default.mhskel")))
J = {k: V[np.array(v)].mean(0) for k, v in skel["joints"].items()}
mhw = json.load(open(os.path.join(MH, "rigs/default_weights.mhw")))["weights"]
NV = len(V)
# per vertex, MakeHuman's weights (dense: 163 bones is small)
BONES = sorted(skel["bones"])
bi = {b: i for i, b in enumerate(BONES)}
W = np.zeros((NV, len(BONES)))
for b, lst in mhw.items():
    if b not in bi:
        continue
    for v, x in lst:
        W[v, bi[b]] += x
s = W.sum(1, keepdims=True)
W = np.where(s > 0, W / np.maximum(s, 1e-9), 0)
W[s[:, 0] == 0, bi["root"]] = 1


def head(b):
    return J[f"{b}____head"]


# ---- the parts fitted, on the unposed shaped body

parts = []  # (name, positions, uvs, faces, weights over BONES, texture)
part_shapes = {}  # name → {shape: positions}
skin_tex = os.path.join(SYS, P["skin"])
deleted = set()
for name, rel in P["parts"] + COMMON:
    clo = read_mhclo(os.path.join(SYS, rel + ".mhclo"))
    base_dir = os.path.dirname(os.path.join(SYS, rel))
    pv, pt, pf = read_obj(os.path.join(base_dir, clo["obj"]))
    pos, refs, w = fit(clo, V)
    shapes = {k: fit(clo, V + d)[0] for k, d in DV.items()}
    if len(pos) != len(pv):
        print(f"  ({name}: {len(pos)} refs for {len(pv)} vertices)")
    pw = (W[refs] * w[:, :, None]).sum(1)
    deleted.update(clo["delete"])
    # its texture: the mhmat's diffuse
    tex = None
    for f in os.listdir(base_dir):
        if f.endswith(".mhmat"):
            for line in open(os.path.join(base_dir, f)):
                if line.startswith("diffuseTexture"):
                    tex = os.path.join(base_dir, line.split()[1])
    if name == "eyes":
        tex = os.path.join(SYS, P.get("eye_tex", EYE_TEX))
    parts.append((name, pos, pt, pf, pw, tex))
    part_shapes[name] = shapes
    print(f"  {name}: {len(pos)} verts, {len(pf)} faces, tex {tex and os.path.basename(tex)}")

# the body: only its own faces, less what the clothes cover
body_faces = [f for f in F0 if f[2] == "body" and not any(v in deleted for v in f[0])]
print(f"  body: {len(body_faces)} faces ({len(deleted)} vertices under clothes)")
parts.insert(0, ("body", V, VT0, body_faces, W, skin_tex))
part_shapes["body"] = {k: V + d for k, d in DV.items()}

# ---- the arms brought down (MakeHuman stands in an A-pose; ours hang straight)


def rot_between(a, b):
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))


def sub(root):
    out = {root}
    grow = True
    while grow:
        grow = False
        for b, d in skel["bones"].items():
            if d["parent"] in out and b not in out:
                out.add(b)
                grow = True
    return out


DOWN = np.array([0.0, -1.0, 0.0])
# keep transforms as (M, t): x' = M x + t
xf = {b: (np.eye(3), np.zeros(3)) for b in BONES}


def turn(bones, R, p, k=1.0):
    if k < 1:
        ang = math.acos(max(-1.0, min(1.0, (np.trace(R) - 1) / 2)))
        if ang > 1e-6:
            axis = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(ang))
            a = ang * k
            K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
            R = np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K
    for b in bones:
        M, t = xf[b]
        xf[b] = (R @ M, R @ (t - p) + p)


def apply_pt(b, x):
    M, t = xf[b]
    return M @ x + t


# (all the way down pushed the shoulders up into pads: the arm stops a few degrees out — chars/rig.ts's
# REST lifts it 0.13 rad anyway — and the turn is shared with the shoulder and the collarbone)
ARM_OUT = math.radians(9)
for S, sx in (("L", 1), ("R", -1)):
    sh, el, wr = head(f"upperarm01.{S}"), head(f"lowerarm01.{S}"), head(f"wrist.{S}")
    aim = np.array([sx * math.sin(ARM_OUT), -math.cos(ARM_OUT), 0.0])
    R1 = rot_between(el - sh, aim)
    turn(sub(f"upperarm01.{S}"), R1, sh)
    # (shared further into the shoulder and the collarbone: less of the turn bunches up on top)
    turn({f"shoulder01.{S}"}, R1, sh, 0.7)
    turn({f"clavicle.{S}"}, R1, sh, 0.32)
    el2, wr2 = apply_pt(f"lowerarm01.{S}", el), apply_pt(f"wrist.{S}", wr)
    R2 = rot_between(wr2 - el2, aim)
    turn(sub(f"lowerarm01.{S}"), R2, el2)
    print(
        f"  arm {S}: {math.degrees(math.acos(np.dot((el - sh) / np.linalg.norm(el - sh), DOWN))):.0f}° down, "
        f"forearm {math.degrees(math.acos(min(1, np.dot((wr2 - el2) / np.linalg.norm(wr2 - el2), DOWN)))):.0f}°"
    )

# the shoulders sloped: each collarbone (and all below it) lowered a few degrees at its root — a
# square, high shoulder line read as too broad (the user, 2026-11-08)
for S, sx in (("L", 1), ("R", -1)):
    root = apply_pt(f"clavicle.{S}", head(f"clavicle.{S}"))
    a = -sx * math.radians(P.get("shoulder_slope", 0))
    Rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    turn(sub(f"clavicle.{S}"), Rz, root)

# the legs hung straight from the hips (MakeHuman stands them a little apart)
for S in ("L", "R"):
    hip, ank = head(f"upperleg01.{S}"), head(f"foot.{S}")
    R = rot_between(ank - hip, DOWN)
    turn(sub(f"upperleg01.{S}"), R, hip)
    turn({f"pelvis.{S}"}, R, hip, 0.3)
    print(f"  leg {S}: {math.degrees(math.acos(np.dot((ank - hip) / np.linalg.norm(ank - hip), DOWN))):.1f}° in")

Ms = np.stack([xf[b][0] for b in BONES])  # (B,3,3)
Ts = np.stack([xf[b][1] for b in BONES])  # (B,3)


def skin(pos, w):
    # x' = Σ w_b (M_b x + t_b)
    Mx = np.einsum("bij,nj->nbi", Ms, pos)
    return np.einsum("nb,nbi->ni", w, Mx + Ts[None])


# the joints, posed with the bones they head
JP = {b: apply_pt(b, head(b)) for b in BONES}
JPt = {b: apply_pt(b, J[f"{b}____tail"]) for b in BONES}


def mean(*bs):
    return np.mean([JP[b] for b in bs], 0)


ours = {
    "hips": JP["root"],
    "spine": JP["spine04"],
    "chest": JP["spine02"],
    "neck": JP["neck01"],
    "head": JP["head"],
}
for S in ("L", "R"):
    ours["shoulder" + S] = JP[f"upperarm01.{S}"]
    ours["elbow" + S] = JP[f"lowerarm01.{S}"]
    ours["wrist" + S] = JP[f"wrist.{S}"]
    ours["fingers" + S] = mean(f"finger3-1.{S}", f"finger4-1.{S}", f"finger5-1.{S}")
    ours["index" + S] = JP[f"finger2-1.{S}"]
    ours["thumb" + S] = JP[f"finger1-1.{S}"]
    ours["thigh" + S] = JP[f"upperleg01.{S}"]
    ours["knee" + S] = JP[f"lowerleg01.{S}"]
    ours["ankle" + S] = JP[f"foot.{S}"]
    ours["toe" + S] = mean(*[f"toe{i}-1.{S}" for i in range(1, 6)])
headtop = JPt["head"]
ours["hair"] = ours["head"] + (headtop - ours["head"]) * 0.6
ours["skirt"] = ours["hips"].copy()
ours["scarf"] = ours["chest"] + np.array([0, 0.6, 0.6])
ours["pack"] = ours["chest"] + np.array([0, 0.3, -1.2])
for S, sx in (("L", 1), ("R", -1)):
    ours["ear" + S] = ours["head"] + np.array([sx * 0.72, 0.05, 0.05])
    ours["eye" + S] = JP[f"eye.{S}"]
ALL = OURS + EYES

# fold MakeHuman's bones onto ours
fold = np.zeros((len(BONES), len(ALL)))
for b in BONES:
    fold[bi[b], ALL.index(ours_of(b))] = 1

# ---- into Blender

bpy.ops.wm.read_factory_settings(use_empty=True)
UNIT = 0.1  # MakeHuman's decimetres to metres


def to_bl(p):
    # MakeHuman: y up, facing +z, the person's left +x → Blender: z up, facing −y (glTF's export turns
    # it back to y up, facing +z)
    p = np.asarray(p) * UNIT
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


posed = {}
posed_shapes = {}
for name, pos, uv, faces, w, tex in parts:
    posed[name] = skin(pos, w)
    posed_shapes[name] = {k: skin(p, w) for k, p in part_shapes[name].items()}
lowest = min(posed[n][:, 1].min() for n in posed if n in ("body", "shoes"))
shift = np.array([0.0, -lowest, 0.0])  # feet on the ground (y 0)

arm_data = bpy.data.armatures.new("rig")
arm = bpy.data.objects.new("rig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
for j in ALL:
    b = arm_data.edit_bones.new(j)
    h = to_bl(ours[j] + shift)
    b.head = h.tolist()
    b.tail = (h + np.array([0, 0, 0.04])).tolist()
    eb[j] = b
for j in ALL:
    if PARENT[j]:
        eb[j].parent = eb[PARENT[j]]
bpy.ops.object.mode_set(mode="OBJECT")


# ---- the painted style (--paint)

# how hard each part is repainted: Kuwahara radius (px at 1024), passes, extra saturation, how much of
# the photo's finest detail is let back in, and a soft blur over it (sigma px, share). Skin is
# airbrushed (small passes and a blur: one big radius broke it into blotches); a patterned top is
# repainted gently, or its stripes go to mud
PAINT_K = {
    "skin": (2, 3, 1.06, 0.0, 2.2, 0.65),
    "clothes": (5, 2, 1.1, 0.08, 0.0, 0.0),
    "shoes": (4, 1, 1.08, 0.15, 0.0, 0.0),
    "hair": (3, 1, 1.05, 0.2, 0.0, 0.0),
}
if WHO == "woman":
    PAINT_K["clothes"] = (2, 2, 1.1, 0.1, 0.0, 0.0)


def blur(img, sigma):
    """A separable gaussian over the colour (edges held)."""
    k = int(math.ceil(sigma * 3))
    x = np.arange(-k, k + 1)
    g = np.exp(-(x * x) / (2 * sigma * sigma))
    g /= g.sum()
    out = img.copy()
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (k, k)
        p = np.pad(out[..., :3], pad, mode="edge")
        acc = np.zeros_like(out[..., :3])
        n = out.shape[axis]
        for i, w in enumerate(g):
            acc += w * (p[i : i + n] if axis == 0 else p[:, i : i + n])
        out[..., :3] = acc
    return out


def kuwahara(img, r):
    """Each pixel takes the mean colour of the least varied of the four r×r squares it is a corner of."""
    H, W = img.shape[:2]
    lum = img[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
    pad = np.pad(img[..., :3], ((r, r), (r, r), (0, 0)), mode="edge")
    lp = np.pad(lum, r, mode="edge")
    ic = np.pad(pad.cumsum(0).cumsum(1), ((1, 0), (1, 0), (0, 0)))
    il = np.pad(lp.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    il2 = np.pad((lp * lp).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    n = float((r + 1) * (r + 1))
    best_v = np.full((H, W), np.inf)
    out = np.zeros((H, W, 3))
    ys, xs = np.mgrid[0:H, 0:W]
    for dy in (0, r):
        for dx in (0, r):
            y0, x0 = ys + dy, xs + dx  # the square's top-left in the padded image
            y1, x1 = y0 + r + 1, x0 + r + 1

            def box(I):
                return I[y1, x1] - I[y0, x1] - I[y1, x0] + I[y0, x0]

            m = box(il) / n
            v = box(il2) / n - m * m
            c = box(ic) / n
            take = v < best_v
            best_v = np.where(take, v, best_v)
            out = np.where(take[..., None], c, out)
    res = img.copy()
    res[..., :3] = out
    return res


def paint_image(img, kind):
    if kind not in PAINT_K:
        return
    r, passes, sat, keep, sigma, mix = PAINT_K[kind]
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4).astype(np.float64)
    out = a
    for _ in range(passes):
        out = kuwahara(out, r)
    if sigma > 0:
        out[..., :3] = out[..., :3] * (1 - mix) + blur(out, sigma)[..., :3] * mix
    if keep > 0:
        out[..., :3] = out[..., :3] * (1 - keep) + a[..., :3] * keep
    lum = (out[..., :3] @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    out[..., :3] = np.clip(lum + (out[..., :3] - lum) * sat, 0, 1)
    out[..., 3] = a[..., 3]
    img.pixels.foreach_set(out.astype(np.float32).ravel())
    # (written out and read back: the exporter takes a file's own bytes over edited pixels)
    tmp = os.path.join(bpy.app.tempdir or "/tmp", f"painted-{WHO}-{kind}.png")
    img.filepath_raw = tmp
    img.file_format = "PNG"
    img.save()
    print(f"  painted {kind}")


def tint(img, rgb, alpha_k):
    """Brows and lashes in the person's own colour (their files are near black: drawn black and solid,
    they read as painted-on blocks), their alpha scaled."""
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4)
    a[..., 0], a[..., 1], a[..., 2] = rgb
    # (their own alpha is faint, made for a blend over the skin's texture: lifted, then scaled)
    a[..., 3] = np.clip(a[..., 3] * 2.4, 0, 1) * alpha_k
    img.pixels.foreach_set(a.ravel())
    tmp = os.path.join(bpy.app.tempdir or "/tmp", f"tint-{WHO}-{len(img.name)}-{id(img)}.png")
    img.filepath_raw = tmp
    img.file_format = "PNG"
    img.save()


def recolour(img, rgb):
    """Hair in the person's own colour: the file's shading kept (its brightness), its hue the person's —
    the ponytail's light roots read as pink on dark skin."""
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4).astype(np.float64)
    lum = a[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
    k = lum / max(1e-6, float(np.average(lum, weights=a[..., 3] + 1e-6)))
    a[..., :3] = np.clip(np.array(rgb)[None, None] * (0.45 + 0.75 * k[..., None]), 0, 1)
    img.pixels.foreach_set(a.astype(np.float32).ravel())
    tmp = os.path.join(bpy.app.tempdir or "/tmp", f"hair-{WHO}.png")
    img.filepath_raw = tmp
    img.file_format = "PNG"
    img.save()


def skin_colours(posed_body, posed_hair, used):
    """The body's colour over its skin texture (multiplied in): the scalp and the hairline in the hair's
    colour, fading out onto the forehead (no hard edge where the hair's cut-out ends); a little blush on
    the cheeks."""
    P0 = posed_body[used]
    col = np.ones((len(used), 3))
    # the hairline: how near the hair each skin vertex is (the head's only)
    H = posed_hair
    head_y = ours["neck"][1]
    near = np.full(len(used), np.inf)
    on = np.where(P0[:, 1] > head_y)[0]
    for c in range(0, len(on), 512):
        idx = on[c : c + 512]
        d = np.linalg.norm(P0[idx, None, :] - H[None, ::2, :], axis=2).min(1)
        near[idx] = d
    t = np.clip((0.45 - near) / (0.45 - 0.12), 0, 1)
    t = t * t * (3 - 2 * t)
    hair = np.array(P["hair_rgb"]) / np.array(P.get("skin_mean", (0.55, 0.4, 0.33)))
    col = col * (1 - 0.9 * t[:, None]) + np.clip(hair, 0, 1)[None] * 0.9 * t[:, None]
    # blush: on each cheek, below and out from the eye
    for S in ("L", "R"):
        e = ours["eye" + S]
        cheek = e + np.array([0.15 if S == "L" else -0.15, -0.42, 0.05])
        d = np.linalg.norm(P0 - cheek, axis=1)
        b = np.clip(1 - d / 0.38, 0, 1) ** 2 * (P0[:, 2] > e[2] - 0.5)
        col *= 1 - b[:, None] * np.array([0.0, 0.1, 0.09]) * P.get("blush", 1.0)
    return col


def skirt_weights(ow, unposed):
    """A skirt over both legs: below the hips, what each thigh (and knee) holds is shared by both, half
    and half — or, sat down, its left and right halves went each with its own thigh and the cloth tore
    open between them. It drapes across the lap instead (plan 73 0c; the skirt spring is phase 5's)."""
    ow = ow.copy()
    top = head("upperleg01.L")[1] + 0.25  # a little above the hip joints: the cloth eases in
    k = np.clip((top - unposed[:, 1]) / 0.6, 0, 1)
    # (the hem goes with the thighs, never the shins: sat, the knees bend down and dragged it into
    # notches between the legs)
    for kn, th in (("kneeL", "thighL"), ("kneeR", "thighR")):
        ik, it = ALL.index(kn), ALL.index(th)
        ow[:, it] += ow[:, ik] * k
        ow[:, ik] *= 1 - k
    ia, ib = ALL.index("thighL"), ALL.index("thighR")
    mean = (ow[:, ia] + ow[:, ib]) / 2
    ow[:, ia] = ow[:, ia] * (1 - k) + mean * k
    ow[:, ib] = ow[:, ib] * (1 - k) + mean * k
    return ow


def material(name, tex, alpha):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55 if name == "skin" else 0.8
    if tex and os.path.exists(tex):
        img = bpy.data.images.load(tex)
        if max(img.size) > TEX:
            img.scale(TEX, TEX)
        if PAINT:
            paint_image(img, name)
        if name in ("brows", "lashes"):
            tint(img, P["brow_rgb"], 1.0 if name == "brows" else P["lash_alpha"])
        if name == "hair":
            recolour(img, P["hair_rgb"])
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha:
            nt.links.new(n.outputs["Alpha"], bsdf.inputs["Alpha"])
    if alpha and hasattr(m, "blend_method"):
        m.blend_method = "HASHED"
    return m


ALPHA = {"hair", "brows", "lashes", "eyes"}  # (the eyes: the cornea is cut out by the alpha)
for name, pos, uv, faces, w, tex in parts:
    P3 = to_bl(posed[name] + shift)
    used = sorted({v for f in faces for v in f[0]})
    remap = {v: i for i, v in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata(P3[used].tolist(), [], [[remap[v] for v in f[0]] for f in faces])
    if len(uv):
        lay = me.uv_layers.new(name="UVMap")
        li = 0
        for f in faces:
            for t in f[1]:
                lay.data[li].uv = uv[t].tolist() if t >= 0 else (0, 0)
                li += 1
    for p in me.polygons:
        p.use_smooth = True
    if name == "body":
        cols = skin_colours(posed["body"] + shift, posed["hair"] + shift, used)
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        rgba = np.concatenate([cols, np.ones((len(used), 1))], 1).astype(np.float32)
        ca.data.foreach_set("color", rgba.ravel())
        me.color_attributes.active_color = ca
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material("skin" if name == "body" else name, tex, name in ALPHA))
    # weights onto ours: the top four
    ow = (w @ fold)[used]
    if name == "clothes" and P.get("skirt"):
        ow = skirt_weights(ow, pos[used])
    groups = {j: ob.vertex_groups.new(name=j) for j in ALL}
    top = np.argsort(-ow, 1)[:, :4]
    for i in range(len(used)):
        ws = ow[i, top[i]]
        tot = ws.sum()
        for k in range(4):
            if ws[k] > 1e-4:
                groups[ALL[top[i, k]]].add([i], float(ws[k] / tot), "REPLACE")
    # the face's shapes, where they move this part
    keys = 0
    for shp, sp in posed_shapes[name].items():
        d = (sp - posed[name])[used]
        if np.abs(d).max() < 1e-4:
            continue
        if not me.shape_keys:
            ob.shape_key_add(name="Basis")
        k = ob.shape_key_add(name=shp)
        k.data.foreach_set("co", to_bl(sp[used] + shift).astype(np.float32).ravel())
        keys += 1
    ob.parent = arm
    mod = ob.modifiers.new("rig", "ARMATURE")
    mod.object = arm
    print(f"  mesh {name}: {len(used)} verts, {keys} shapes")

os.makedirs(OUT, exist_ok=True)
path = os.path.abspath(os.path.join(OUT, f"person-{WHO}{'-painted' if PAINT else ''}.glb"))
bpy.ops.export_scene.gltf(
    filepath=path,
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_animations=False,
    export_morph=True,
    export_morph_normal=False,
    export_vertex_color="ACTIVE",
    export_image_format="AUTO",
    export_meshopt_compression_enable=True,
    export_apply=False,
)
h = (max(posed["body"][:, 1]) - lowest) * UNIT
# (how broad: the clothes' widest at the shoulders' height, and the shoulder joints apart)
_sy = ours["shoulderL"][1]
_band = posed["clothes" if "clothes" in posed else "body"]
_band = _band[np.abs(_band[:, 1] - _sy) < 0.3]
print(f"  shoulders: {(_band[:, 0].max() - _band[:, 0].min()) * UNIT * 100:.1f} cm across, joints {np.linalg.norm(ours['shoulderL'] - ours['shoulderR']) * UNIT * 100:.1f} cm apart")
print(f"wrote {path} ({os.path.getsize(path) / 1e6:.1f} MB), {h:.2f} m tall")

# ---- a quick look (--preview DIR): front, side and the face, flat-lit with the textures
PREVIEW = arg("--preview", "")
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x, sc.render.resolution_y = 600, 900
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new("w") if not sc.world else sc.world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    for tag, loc, rot, ortho in (
        ("front", (0, -6, h / 2), (math.pi / 2, 0, 0), h * 1.1),
        ("side", (6, 0, h / 2), (math.pi / 2, 0, math.pi / 2), h * 1.1),
        ("face", (0, -6, h - 0.13), (math.pi / 2, 0, 0), 0.38),
    ):
        cam.location = loc
        cam.rotation_euler = rot
        cam.data.ortho_scale = ortho
        sc.render.filepath = os.path.join(PREVIEW, f"{WHO}-{tag}.png")
        bpy.ops.render.render(write_still=True)
    print("preview in", PREVIEW)

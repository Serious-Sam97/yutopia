# Plan 131 phase 0c — a person on Blender Studio's CC0 body (the Human Base Meshes bundle), MakeHuman kept
# underneath as an invisible cage (F7a): its targets, weights, joints and proxies ride across to the new
# skin, its photo skin is projected onto the new UVs.
#
#   blender -b --factory-startup -P tools/art/life/build_person.py -- --who man --look gtav --bare --tex 2048 \
#     --blend /tmp/mh-gtav-man.blend
#   blender -b --factory-startup -P tools/art/life/build_bs.py -- /tmp/mh-gtav-man.blend BUNDLE.blend man OUT
#
# What it does:
#   1. the Blender Studio body appended, its UDIM tiles packed into one atlas, normal + AO baked from its
#      level-3 sculpt onto its base level (F9a), scaled to the MakeHuman person's height
#   2. posed into MakeHuman's rest (our rig's): a small rig weighted by bone heat; the arms, forearms, hands
#      and legs turned onto MakeHuman's own limb lines (the clavicle sharing the arm's turn)
#   3. the cage: MakeHuman's body moved onto the Blender Studio surface — by joints (its own weights), by the
#      face's landmarks (eyes, nose, mouth, chin, ears, crown), then shrink-wrapped with smoothing
#   4. carried across through the cage (each new vertex at its nearest point on the wrapped cage): the 59
#      joints' weights, the face's shapes (blink, talk, smile); the eyes, brows, lashes, teeth and tongue
#      moved with the cage, the rig's joints too
#   5. MakeHuman's photo skin baked from the wrapped cage onto the new UVs, darkened by the AO; the shorts
#      painted on (phase 0c has no garment fitted yet)
#   6. written as person-<who>-bs.glb, as build_person.py writes its people (the same exporter, the extras)
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock131 as M  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :]
MH_BLEND, BUNDLE, WHO, OUT = argv[:4]
DEBUG = os.environ.get("BS_DEBUG")
GENDER = {"man": "male", "woman": "female"}[WHO]

bpy.ops.wm.open_mainfile(filepath=os.path.abspath(MH_BLEND))
sc = M.cycles()
rig = bpy.data.objects["rig"]
cage = bpy.data.objects["body"]
PARTS = [bpy.data.objects[n] for n in ("brows", "lashes", "eyes", "teeth", "tongue")]


def coords(ob):
    P = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", P)
    return P.reshape(-1, 3)


def set_coords(ob, P):
    ob.data.vertices.foreach_set("co", np.asarray(P, dtype=np.float64).ravel())
    ob.data.update()


def joint(n):
    return np.array(rig.matrix_world @ rig.data.bones[n].head_local)


C0 = coords(cage)
H_MH = float(C0[:, 2].max() - C0[:, 2].min())
JOINT_NAMES = [b.name for b in rig.data.bones]
JM = {n: joint(n) for n in JOINT_NAMES}

# ---- 1. the Blender Studio body
with bpy.data.libraries.load(os.path.abspath(BUNDLE)) as (src, dst):
    dst.objects = [f"GEO-body_{GENDER}_realistic", f"GEO-body_{GENDER}_realistic.eye.L", f"GEO-body_{GENDER}_realistic.eye.R"]
bs, eyeL, eyeR = dst.objects
for o in (bs, eyeL, eyeR):
    sc.collection.objects.link(o)
bpy.context.view_layer.update()
for e in (eyeL, eyeR):
    mw = e.matrix_world.copy()
    e.parent = None
    e.matrix_world = mw
dx = bs.location.x
bs.location.x = 0
for e in (eyeL, eyeR):
    e.location.x -= dx
bpy.context.view_layer.update()
for o in (bs, eyeL, eyeR):
    o.data.materials.clear()
    for p in o.data.polygons:
        p.use_smooth = True
# one atlas
for o in bpy.data.objects:
    o.select_set(o == bs)
bpy.context.view_layer.objects.active = bs
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.object.mode_set(mode="OBJECT")
# (the head's islands drawn bigger before the pack: the face gets the texels — F4a's sharper face)
from bpy_extras import mesh_utils  # noqa: E402

HEAD_UV = float(os.environ.get("BS_HEAD_UV", "1.6"))
uvd = bs.data.uv_layers[0].data
zmax = max(v.co.z for v in bs.data.vertices)
for isl in mesh_utils.mesh_linked_uv_islands(bs.data):
    zc = np.mean([bs.data.polygons[f].center.z for f in isl])
    if zc > zmax * 0.84:
        loops = [li for f in isl for li in bs.data.polygons[f].loop_indices]
        uvs = np.array([tuple(uvd[li].uv) for li in loops])
        c = uvs.mean(0)
        for li, uv in zip(loops, uvs, strict=True):
            uvd[li].uv = tuple(c + (uv - c) * HEAD_UV)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=False, margin=0.002)
bpy.ops.object.mode_set(mode="OBJECT")


def level(n, name):
    o = bs.copy()
    o.data = bs.data.copy()
    o.name = name
    sc.collection.objects.link(o)
    mr = next(m for m in o.modifiers if m.type == "MULTIRES")
    mr.levels = n
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=mr.name)
    return o


low = level(0, "bs-low")
hi = level(3, "bs-hi")
nrm = M.image("nrm", data=True)
M.bake("NORMAL", low, nrm, high=hi, extrusion=0.03, ray=0.06)
bpy.data.objects.remove(hi)
bpy.data.objects.remove(bs)
# (the AO from the base level alone, everything else hidden: the sculpt's copies over it shut every ray —
# black holes; the cage and the parts too)
hidden = [o for o in bpy.data.objects if o != low and o.type == "MESH"]
for o in hidden:
    o.hide_render = True
ao = M.image("ao", data=True)
sc.cycles.samples = 128
M.bake("AO", low, ao)
for o in hidden:
    o.hide_render = False
# (between the fingers and toes the sculpt's bake went wild — rainbow streaks that shade a hand black: a
# texel tipped more than ~55° off the surface is made flat)
NM = M.pixels(nrm)
nz = NM[..., 2] * 2 - 1
wild = nz < 0.57
NM[wild, :3] = (0.5, 0.5, 1.0)
M.put(nrm, NM)
print(f"  normal map: {int(wild.sum())} wild texels flattened")
if DEBUG:
    M.save_png(nrm, os.path.join(DEBUG, "nrm.png"))
nrm = M.on_disk(nrm)
A = np.clip(M.pixels(ao)[..., 0], 0, 1)
if DEBUG:
    M.save_png(ao, os.path.join(DEBUG, "ao.png"))
print(f"  base level: {len(low.data.polygons)} faces")

# scaled to the MakeHuman person's height, feet on the floor
P = coords(low)
zmin = float(P[:, 2].min())
ZMIN0 = zmin
k = H_MH / float(P[:, 2].max() - zmin)
P = (P - np.array([0, 0, zmin])) * k + np.array([0, 0, C0[:, 2].min()])
set_coords(low, P)
for e in (eyeL, eyeR):
    E = np.array([e.matrix_world @ v.co for v in e.data.vertices])
    E = (E - np.array([0, 0, zmin])) * k + np.array([0, 0, C0[:, 2].min()])
    e.matrix_world = e.matrix_world.Identity(4)
    set_coords(e, E)
print(f"  scaled ×{k:.3f} to {H_MH:.3f} m")

# ---- 2. posed into MakeHuman's rest
zmin = float(P[:, 2].min())
H = float(P[:, 2].max() - zmin)
LM = {key: (v * k if isinstance(v, float) else v) for key, v in M.BS_LM[WHO].items()}


def at(x, z, r=0.035):
    m = (np.abs(P[:, 0] - x) < r) & (np.abs(P[:, 2] - z) < r)
    near = P[m]
    return near.mean(0) if len(near) else np.array([x, 0.0, z])


def ring(z, sx):
    m = (np.abs(P[:, 2] - z) < 0.015) & (P[:, 0] * sx > 0.012) & (np.abs(P[:, 0]) < 0.26 * k)
    return P[m].mean(0)


def rot(axis, ang):
    axis = axis / np.linalg.norm(axis)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K


def between(u, v, s=1.0):
    u = u / np.linalg.norm(u)
    v = v / np.linalg.norm(v)
    ax = np.cross(u, v)
    if np.linalg.norm(ax) < 1e-9:
        return np.eye(3)
    return rot(ax, s * math.acos(float(np.clip(np.dot(u, v), -1, 1))))


# (the landmarks were read on the bundle's body at x 0 before scaling: its arm's joints in metres)
J = {}
for S, sx in (("L", 1), ("R", -1)):
    Sj, Ej, Wj, Tj = (at(sx * x * k, zmin + (z - 0.0) * k) for x, z in M.BS_LM[WHO]["arm"])
    J[f"clav.{S}"] = (np.array([sx * 0.02, Sj[1] - 0.01, Sj[2] - 0.015]), Sj)
    J[f"upper.{S}"] = (Sj, Ej)
    J[f"fore.{S}"] = (Ej, Wj)
    J[f"hand.{S}"] = (Wj, Tj)
    hip = ring(zmin + 0.47 * H, sx)
    hip[2] = zmin + 0.52 * H
    knee = ring(zmin + 0.285 * H, sx)
    ank = ring(zmin + 0.055 * H, sx)
    J[f"thigh.{S}"] = (hip, knee)
    J[f"shin.{S}"] = (knee, ank)
    J[f"foot.{S}"] = (ank, ank + np.array([0, -0.12, -0.03]))
J["trunk"] = (np.array([0, 0, zmin + 0.52 * H]), np.array([0, 0, zmin + 0.8 * H]))
J["head"] = (np.array([0, 0, zmin + 0.8 * H]), np.array([0, 0, zmin + H]))
PARENT = {"trunk": None, "head": "trunk"}
for S in "LR":
    PARENT.update({f"clav.{S}": "trunk", f"upper.{S}": f"clav.{S}", f"fore.{S}": f"upper.{S}", f"hand.{S}": f"fore.{S}",
                   f"thigh.{S}": "trunk", f"shin.{S}": f"thigh.{S}", f"foot.{S}": f"shin.{S}"})
SCALE = 10.0
ad = bpy.data.armatures.new("bsrig")
brig = bpy.data.objects.new("bsrig", ad)
sc.collection.objects.link(brig)
bpy.context.view_layer.objects.active = brig
bpy.ops.object.mode_set(mode="EDIT")
for n, (h, t) in J.items():
    eb = ad.edit_bones.new(n)
    eb.head = Vector(h * SCALE)
    eb.tail = Vector(t * SCALE)
for n, par in PARENT.items():
    if par:
        ad.edit_bones[n].parent = ad.edit_bones[par]
bpy.ops.object.mode_set(mode="OBJECT")
set_coords(low, P * SCALE)
for o in bpy.data.objects:
    o.select_set(o in (low, brig))
bpy.context.view_layer.objects.active = brig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
set_coords(low, P)
for m in list(low.modifiers):
    low.modifiers.remove(m)
low.parent = None
names = list(J)
Wt = np.zeros((len(P), len(names)))
for v in low.data.vertices:
    for g in v.groups:
        gn = low.vertex_groups[g.group].name
        if gn in names:
            Wt[v.index, names.index(gn)] = g.weight
sw = Wt.sum(1)
print(f"  heat weights: {int((sw > 0).sum())} of {len(P)}")
Wt[sw == 0, names.index("trunk")] = 1
Wt /= Wt.sum(1, keepdims=True)
bpy.data.objects.remove(brig)
for g in list(low.vertex_groups):
    low.vertex_groups.remove(g)

X = {"trunk": (np.eye(3), np.zeros(3))}
X["head"] = X["trunk"]


def turned(parent, R, pivot_rest):
    """A bone's transform: its parent's, then R about where the parent left the pivot."""
    Mp, tp = X[parent]
    piv = Mp @ pivot_rest + tp
    return R @ Mp, R @ (tp - piv) + piv


for S, sx in (("L", 1), ("R", -1)):
    Cj = J[f"clav.{S}"][0]
    Sj, Ej = J[f"upper.{S}"]
    Wj, Tj = J[f"hand.{S}"]
    # MakeHuman's own lines: upper arm, forearm, hand; thigh, shin
    up = JM[f"elbow{S}"] - JM[f"shoulder{S}"]
    fo = JM[f"wrist{S}"] - JM[f"elbow{S}"]
    ha = JM[f"fingers{S}"] - JM[f"wrist{S}"]
    X[f"clav.{S}"] = turned("trunk", between(Ej - Sj, up, 0.18), Cj)
    Mc, _ = X[f"clav.{S}"]
    X[f"upper.{S}"] = turned(f"clav.{S}", between(Mc @ (Ej - Sj), up), Sj)
    Mu, _ = X[f"upper.{S}"]
    X[f"fore.{S}"] = turned(f"upper.{S}", between(Mu @ (Wj - Ej), fo), Ej)
    Mf, _ = X[f"fore.{S}"]
    X[f"hand.{S}"] = turned(f"fore.{S}", between(Mf @ (Tj - Wj), ha), Wj)
    hip, knee = J[f"thigh.{S}"]
    ank = J[f"shin.{S}"][1]
    th = JM[f"knee{S}"] - JM[f"thigh{S}"]
    sh = JM[f"ankle{S}"] - JM[f"knee{S}"]
    X[f"thigh.{S}"] = turned("trunk", between(knee - hip, th), hip)
    Mt, _ = X[f"thigh.{S}"]
    X[f"shin.{S}"] = turned(f"thigh.{S}", between(Mt @ (ank - knee), sh), knee)
    X[f"foot.{S}"] = X[f"shin.{S}"]
Q = np.zeros_like(P)
for i, n in enumerate(names):
    Mx, t = X[n]
    Q += Wt[:, i : i + 1] * (P @ Mx.T + t)
P = Q
set_coords(low, P)


def posed_joint(n, which=0):
    Mx, t = X[n]
    return Mx @ J[n][which] + t


BJ = {}
for S in "LR":
    BJ[f"shoulder{S}"] = posed_joint(f"upper.{S}")
    BJ[f"elbow{S}"] = posed_joint(f"fore.{S}")
    BJ[f"wrist{S}"] = posed_joint(f"hand.{S}")
    BJ[f"thigh{S}"] = posed_joint(f"thigh.{S}")
    BJ[f"knee{S}"] = posed_joint(f"shin.{S}")
    BJ[f"ankle{S}"] = posed_joint(f"foot.{S}")
# the feet down to the floor again (the legs' turn lifted or sank them a little)
zfix = float(P[:, 2].min()) - float(C0[:, 2].min())
P[:, 2] -= zfix
set_coords(low, P)
for n in BJ:
    BJ[n][2] -= zfix
for e in (eyeL, eyeR):
    E = coords(e)
    E[:, 2] -= zfix
    set_coords(e, E)
print(f"  posed onto MakeHuman's rest (feet {zfix * 100:+.1f} cm)")


# ---- 3. the cage onto the surface
def slice_centre(Pts, z, half=0.12):
    m = (np.abs(Pts[:, 2] - z) < 0.01) & (np.abs(Pts[:, 0]) < half)
    return Pts[m].mean(0) if m.any() else np.array([0, 0, z])


# a translation per joint, blended by MakeHuman's own weights: its trunk to the new trunk's middle at each
# joint's height, its limbs' joints onto the new ones
D = {}
for n in ("hips", "spine", "chest", "neck", "head"):
    z = JM[n][2]
    D[n] = slice_centre(P, z) - slice_centre(C0, z)
    D[n][2] = 0
eye_c = {S: np.array([e.matrix_world @ v.co for v in e.data.vertices]).mean(0) for S, e in (("L", eyeL), ("R", eyeR))}
mh_eyes = coords(bpy.data.objects["eyes"])
mh_eye_c = {"L": mh_eyes[mh_eyes[:, 0] > 0].mean(0), "R": mh_eyes[mh_eyes[:, 0] < 0].mean(0)}
D["head"] = (eye_c["L"] + eye_c["R"]) / 2 - (mh_eye_c["L"] + mh_eye_c["R"]) / 2
for n in BJ:
    D[n] = BJ[n] - JM[n]
for S in "LR":
    D[f"toe{S}"] = D[f"ankle{S}"]
    D[f"eye{S}"] = eye_c[S] - mh_eye_c[S]


def parent_of(n):
    b = rig.data.bones[n]
    return b.parent.name if b.parent else None


for n in JOINT_NAMES:
    m = n
    while m not in D:
        m = parent_of(m)
    D[n] = D[m]
CW = np.zeros((len(C0), len(JOINT_NAMES)))
gi = {g.index: JOINT_NAMES.index(g.name) for g in cage.vertex_groups if g.name in JOINT_NAMES}
for v in cage.data.vertices:
    for g in v.groups:
        if g.group in gi:
            CW[v.index, gi[g.group]] += g.weight
CW /= np.maximum(CW.sum(1, keepdims=True), 1e-9)
Dm = np.stack([D[n] for n in JOINT_NAMES])
C1 = C0 + CW @ Dm


# the face by its landmarks: the eyes, the nose's tip, the lips, the chin, the ears, the crown, the nape
def face_points(Pts, eyes_c, head_mask):
    ez = (eyes_c["L"][2] + eyes_c["R"][2]) / 2
    ey = (eyes_c["L"][1] + eyes_c["R"][1]) / 2
    hm = head_mask
    mid = hm & (np.abs(Pts[:, 0]) < 0.006)
    out = {"eyeL": eyes_c["L"], "eyeR": eyes_c["R"]}
    nose = mid & (Pts[:, 2] < ez - 0.015) & (Pts[:, 2] > ez - 0.07)
    print(f"    face: head {int(hm.sum())}, mid {int(mid.sum())}, nose {int(nose.sum())}, eye z {ez:.3f}, head z {Pts[hm][:, 2].min() if hm.any() else 0:.3f}…{Pts[hm][:, 2].max() if hm.any() else 0:.3f}")
    out["nose"] = Pts[nose][np.argmin(Pts[nose][:, 1])]
    lips = mid & (Pts[:, 2] < out["nose"][2] - 0.02) & (Pts[:, 2] > out["nose"][2] - 0.06)
    out["lips"] = Pts[lips][np.argmin(Pts[lips][:, 1])]
    chin = mid & (Pts[:, 2] < out["lips"][2] - 0.02) & (Pts[:, 2] > out["lips"][2] - 0.08) & (Pts[:, 1] < ey + 0.02)
    out["chin"] = Pts[chin][np.argmin(Pts[chin][:, 1] * 0.3 + Pts[chin][:, 2])]
    top = hm & (np.abs(Pts[:, 0]) < 0.02)
    out["crown"] = Pts[top][np.argmax(Pts[top][:, 2])]
    nape = mid & (np.abs(Pts[:, 2] - ez) < 0.02)
    out["back"] = Pts[nape][np.argmax(Pts[nape][:, 1])]
    for S, sx in (("L", 1), ("R", -1)):
        ear = hm & (np.abs(Pts[:, 2] - (ez - 0.015)) < 0.02) & (Pts[:, 0] * sx > 0)
        out[f"ear{S}"] = Pts[ear][np.argmax(Pts[ear][:, 0] * sx)]
        # (the cheek: the face's side at the nose's height)
        cheek = hm & (np.abs(Pts[:, 2] - out["nose"][2]) < 0.008) & (Pts[:, 0] * sx > 0) & (Pts[:, 1] < ey + 0.03)
        out[f"cheek{S}"] = Pts[cheek][np.argmax(Pts[cheek][:, 0] * sx)]
    return out


hg = JOINT_NAMES.index("head")
head_w = CW[:, hg]
mh_lm = face_points(C1, {S: mh_eye_c[S] + D[f"eye{S}"] for S in "LR"}, head_w > 0.5)
bs_head = P[:, 2] > (eye_c["L"][2] - 0.16)
bs_lm = face_points(P, eye_c, bs_head & (np.abs(P[:, 0]) < 0.12))
keys = list(mh_lm)
src_l = np.stack([mh_lm[q] for q in keys])
dst_l = np.stack([bs_lm[q] for q in keys])
for q in keys:
    print(f"  landmark {q}: {np.linalg.norm(dst_l[keys.index(q)] - src_l[keys.index(q)]) * 100:.1f} cm")


def rbf(src_pts, disp, x):
    """Biharmonic (r) radial basis + an affine part: exact at the landmarks, smooth between."""
    n = len(src_pts)
    r = np.linalg.norm(src_pts[:, None] - src_pts[None], axis=-1)
    Pm = np.hstack([np.ones((n, 1)), src_pts])
    A_ = np.block([[r, Pm], [Pm.T, np.zeros((4, 4))]])
    b = np.vstack([disp, np.zeros((4, 3))])
    sol = np.linalg.solve(A_ + 1e-9 * np.eye(n + 4), b)
    rx = np.linalg.norm(x[:, None] - src_pts[None], axis=-1)
    return rx @ sol[:n] + np.hstack([np.ones((len(x), 1)), x]) @ sol[n:]


face_k = np.clip(head_w + 0.5 * CW[:, JOINT_NAMES.index("neck")], 0, 1)
C2 = C1 + face_k[:, None] * rbf(src_l, dst_l - src_l, C1)

# the fingers: each of MakeHuman's turned (and sized) about its base to point where Blender Studio's does —
# its five fingertips found by clustering the hand's far end, matched by direction (left as they were, the
# cage's fingers wrapped onto the wrong ones and the thumb folded the wrong way)
import itertools  # noqa: E402

FINGERS = ("thumb", "index", "fingers", "ring", "little")
for S in "LR":
    hb = names.index(f"hand.{S}")
    hand = np.where(Wt[:, hb] > 0.5)[0]
    Wj = BJ[f"wrist{S}"]
    r = np.linalg.norm(P[hand] - Wj, axis=1)
    far = hand[r > 0.55 * r.max()]
    X_ = P[far]
    # (k-means, 5, seeded by farthest-point picks)
    cent = [X_[np.argmax(np.linalg.norm(X_ - Wj, axis=1))]]
    for _ in range(4):
        dmin = np.min([np.linalg.norm(X_ - c, axis=1) for c in cent], axis=0)
        cent.append(X_[np.argmax(dmin)])
    cent = np.array(cent)
    for _ in range(20):
        lab = np.argmin(np.linalg.norm(X_[:, None] - cent[None], axis=2), axis=1)
        cent = np.array([X_[lab == q].mean(0) if (lab == q).any() else cent[q] for q in range(5)])
    tips_bs = np.array([X_[lab == q][np.argmax(np.linalg.norm(X_[lab == q] - Wj, axis=1))] if (lab == q).any() else cent[q] for q in range(5)])
    mw = JM[f"wrist{S}"] + D[f"wrist{S}"]
    base = {}
    tip_mh = {}
    fw = {}
    for f in FINGERS:
        chain = [g for g in (f"{f}{S}", f"{f}2{S}", f"{f}3{S}") if g in JOINT_NAMES]
        fw[f] = CW[:, [JOINT_NAMES.index(g) for g in chain]].sum(1)
        base[f] = JM[f"{f}{S}"] + D[f"{f}{S}"]
        m = fw[f] > 0.5
        tip_mh[f] = C2[m][np.argmax(np.linalg.norm(C2[m] - mw, axis=1))]
    best, best_cost = None, 1e9
    for perm in itertools.permutations(range(5)):
        cost = 0.0
        for f, q in zip(FINGERS, perm, strict=True):
            a = tip_mh[f] - mw
            b = tips_bs[q] - Wj
            cost += 1 - a @ b / (np.linalg.norm(a) * np.linalg.norm(b))
        if cost < best_cost:
            best, best_cost = perm, cost
    for f, q in zip(FINGERS, best, strict=True):
        a = tip_mh[f] - base[f]
        b = tips_bs[q] - base[f]
        R = between(a, b)
        sc_ = float(np.clip(np.linalg.norm(b) / np.linalg.norm(a), 0.8, 1.25))
        w = fw[f][:, None]
        C2 = C2 + w * (((C2 - base[f]) @ R.T) * sc_ + base[f] - C2)
        print(f"  finger {f}{S}: turned {math.degrees(math.acos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1))):.0f}°, ×{sc_:.2f}")

# shrink-wrapped: each step every vertex to its nearest point on the new surface, the moves smoothed over
# the cage (its edges), a share taken; the last step whole
bm = bmesh.new()
bm.from_mesh(low.data)
bm.verts.ensure_lookup_table()
for i, v in enumerate(bm.verts):
    v.co = Vector(P[i])
bm.normal_update()
tree = BVHTree.FromBMesh(bm)
nb = [[] for _ in range(len(C0))]
for e in cage.data.edges:
    a, b = e.vertices
    nb[a].append(b)
    nb[b].append(a)
deg = np.array([max(1, len(x)) for x in nb])
ei = np.array([(a, b) for a, lst in enumerate(nb) for b in lst])


def smooth(Dv, it):
    for _ in range(it):
        acc = np.zeros_like(Dv)
        np.add.at(acc, ei[:, 0], Dv[ei[:, 1]])
        Dv = 0.5 * Dv + 0.5 * acc / deg[:, None]
    return Dv


# (only the skin's own vertices: those on the body's faces — the cage file holds helpers' too)
on_body = np.zeros(len(C0), dtype=bool)
for p in cage.data.polygons:
    on_body[list(p.vertices)] = True
cur = C2.copy()
cfaces = [list(p.vertices) for p in cage.data.polygons]


def cage_normals(Pts):
    """Each cage vertex's normal on the shape it has now (its faces' normals, area-weighted)."""
    N = np.zeros_like(Pts)
    for f in cfaces:
        a, b, c = Pts[f[0]], Pts[f[1]], Pts[f[2]]
        n = np.cross(b - a, c - a)
        if len(f) == 4:
            n = n + np.cross(c - a, Pts[f[3]] - a)
        N[f] += n
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


for step, (share, it) in enumerate(((0.4, 6), (0.5, 6), (0.6, 4), (0.7, 4), (0.85, 2), (1.0, 0))):
    Nc = cage_normals(cur)
    near = cur.copy()
    found = np.zeros(len(cur), dtype=bool)
    for i in np.where(on_body)[0]:
        c, n = Vector(cur[i]), Vector(Nc[i])
        loc, fn, _, _ = tree.find_nearest(c)
        if loc is not None and fn.dot(n) > 0.3:
            near[i] = loc
            found[i] = True
            continue
        # (the nearest is another limb's, or faces away: along the vertex's own normal instead)
        best = None
        for sgn in (1, -1):
            hit, hn, _, d = tree.ray_cast(c + n * 0.04 * sgn, -n * sgn, 0.08)
            if hit is not None and hn.dot(n) > 0.3 and (best is None or d < best[1]):
                best = (hit, d)
        if best is not None:
            near[i] = best[0]
            found[i] = True
    Dv = (near - cur) * found[:, None]
    # (a vertex with no fair target takes its neighbours' moves: filled in from the found ones, harmonically —
    # left behind, the cage folded and a stretch of the new skin read one point of MakeHuman's)
    known = found.copy()
    for _ in range(60):
        acc = np.zeros_like(Dv)
        cnt = np.zeros(len(Dv))
        np.add.at(acc, ei[:, 0], Dv[ei[:, 1]] * known[ei[:, 1], None])
        np.add.at(cnt, ei[:, 0], known[ei[:, 1]].astype(float))
        fill = (~found) & (cnt > 0)
        Dv[fill] = acc[fill] / cnt[fill, None]
        known = known | fill
    if it:
        Dv = smooth(Dv, it)
    cur = cur + share * Dv
    print(f"  wrap step {step}: {int(found.sum())} of {int(on_body.sum())} found, mean gap {np.linalg.norm(near - cur, axis=1)[found].mean() * 1000:.1f} mm")
C3 = cur
FIELD = C3 - C0  # each cage vertex's move

# ---- 4. carried across
set_coords(cage, C3)
cage_bm = bmesh.new()
cage_bm.from_mesh(cage.data)
bmesh.ops.triangulate(cage_bm, faces=cage_bm.faces)
# (the new triangles' indices: stale until updated — the tree hands back face.index)
cage_bm.verts.index_update()
cage_bm.faces.index_update()
cage_bm.verts.ensure_lookup_table()
cage_bm.faces.ensure_lookup_table()
ctree = BVHTree.FromBMesh(cage_bm)
tri = np.array([[v.index for v in f.verts] for f in cage_bm.faces])
bary_i = np.zeros((len(P), 3), dtype=np.int64)
bary_w = np.zeros((len(P), 3))
for i, p in enumerate(P):
    loc, _, fi, _ = ctree.find_nearest(Vector(p))
    a, b, c = (C3[j] for j in tri[fi])
    v0, v1, v2 = b - a, c - a, np.array(loc) - a
    d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01 or 1e-12
    wv = (d11 * d20 - d01 * d21) / den
    ww = (d00 * d21 - d01 * d20) / den
    bary_i[i] = tri[fi]
    bary_w[i] = np.clip([1 - wv - ww, wv, ww], 0, 1)
bary_w /= bary_w.sum(1, keepdims=True)


def carry(per_cage):
    return np.einsum("nk,nkd->nd", bary_w, per_cage[bary_i])


BW = carry(CW)
# (a hip by the hanging hand took the hand's weights, a forearm the thigh's: the new body's own rig says
# which is arm — no arm joint off the arm, no leg or hip joint on it)
bs_arm = sum(Wt[:, names.index(f"{b}.{S_}")] for b in ("upper", "fore", "hand") for S_ in "LR")
ARMJ = [i for i, n in enumerate(JOINT_NAMES) if n.startswith(("elbow", "forearm", "wrist", "fingers", "index", "thumb", "ring", "little"))]
LEGJ = [i for i, n in enumerate(JOINT_NAMES) if n.startswith(("thigh", "knee", "ankle", "toe", "hips", "skirt"))]
off_arm = bs_arm < 0.35
BW[np.ix_(off_arm, ARMJ)] = 0
on_arm = bs_arm > 0.75
BW[np.ix_(on_arm, LEGJ)] = 0
# (and each side's own: no left joint on the right)
for i, n in enumerate(JOINT_NAMES):
    if n.endswith("L"):
        BW[P[:, 0] < -0.01, i] = 0
    elif n.endswith("R") and n not in ("chestR",):
        BW[P[:, 0] > 0.01, i] = 0
empty = BW.sum(1) < 1e-6
BW[empty, JOINT_NAMES.index("chest")] = 1
BW /= np.maximum(BW.sum(1, keepdims=True), 1e-9)
# (smoothed over the new body's own edges: a lone vertex that read a far bone — a spike at the wrist, a sliver
# on the thumb — takes its neighbours' weights; the masks above hold after)
be_ = np.array([(e.vertices[0], e.vertices[1]) for e in low.data.edges])
bdeg = np.bincount(be_.ravel(), minlength=len(P)).astype(float)
for _ in range(3):
    acc = np.zeros_like(BW)
    np.add.at(acc, be_[:, 0], BW[be_[:, 1]])
    np.add.at(acc, be_[:, 1], BW[be_[:, 0]])
    BW = 0.5 * BW + 0.5 * acc / np.maximum(bdeg, 1)[:, None]
BW[np.ix_(off_arm, ARMJ)] = 0
BW[np.ix_(on_arm, LEGJ)] = 0
BW /= np.maximum(BW.sum(1, keepdims=True), 1e-9)
shapes = {}
ks = cage.data.shape_keys.key_blocks
basis = np.array([v.co for v in ks["Basis"].data])
for kb in ks[1:]:
    shapes[kb.name] = carry(np.array([v.co for v in kb.data]) - basis)
# the mouth's shapes by lip: MakeHuman's lower lip is what talk moves down; each new vertex round the mouth
# takes the moves of the cage's vertices on its own side of the lip line (else an upper lip read the lower's
# move and tore down the middle)
if "talk" in shapes:
    tdel = np.array([v.co for v in ks["talk"].data]) - basis
    lower_c = (tdel[:, 2] < -0.0015) & on_body
    mouth_c = (np.linalg.norm(C3 - bs_lm["lips"], axis=1) < 0.06) & on_body
    # (the mouth's slit, read off the bundle's body: M.BS_LM)
    # (the slit, found on the mesh: the deepest point between the lips on the midline)
    ln = bs_lm["lips"]
    mid_m = (np.abs(P[:, 0]) < 0.004) & (np.abs(P[:, 2] - ln[2]) < 0.02) & (P[:, 1] < ln[1] + 0.009)
    cand = P[mid_m]
    # (the slit where the lips meet, read off the bundle's body — a search on the mesh found the lower lip's
    # inside: the lips meet ~8 mm behind their front, over a mouth bag)
    slit = (M.BS_LM[WHO]["mouth"] - ZMIN0) * k + float(C0[:, 2].min()) - zfix
    print(f"  mouth slit at {slit:.4f} (lips {ln[2]:.4f})")
    lw = M.BS_LM[WHO]["lip_w"] * k
    near_m = np.linalg.norm(P - bs_lm["lips"], axis=1)
    region = near_m < 0.05
    upper_b = P[:, 2] > slit + 0.002 * np.clip((P[:, 0] / lw) ** 2, 0, 1)
    for cls, cmask in ((True, mouth_c & ~lower_c), (False, mouth_c & lower_c)):
        tree_c = KDTree(int(cmask.sum()))
        ids = np.where(cmask)[0]
        for j, i in enumerate(ids):
            tree_c.insert(Vector(C3[i]), j)
        tree_c.balance()
        sel = np.where(region & (upper_b == cls))[0]
        for nm in shapes:
            full = np.array([v.co for v in ks[nm].data]) - basis
            for i in sel:
                hits = tree_c.find_n(Vector(P[i]), 6)
                w = np.array([1 / max(d, 1e-4) ** 2 for _, _, d in hits])
                dd = (w[:, None] * full[ids[[h[1] for h in hits]]]).sum(0) / w.sum()
                blend = M.sstep(0.05, 0.03, near_m[i])
                shapes[nm][i] = shapes[nm][i] * (1 - blend) + dd * blend
# talking is a jaw, made on the new mesh (MakeHuman's open mouth on another lip's shape looked wrong): the
# lower face turned down about a hinge just before the ears, everything under the line from the hinge to the
# lips' slit — the lower lip, the chin, the jaw's line — the corners stretched softly, the neck under the chin
# taking part of it, the upper lip lifted a hair
ears = (bs_lm["earL"] + bs_lm["earR"]) / 2
HINGE = np.array([0.0, ears[1] - 0.012, ears[2] - 0.022])
front = bs_lm["lips"].copy()
front[2] = slit
JAW_DEG = 10.0


VN = np.array([tuple(v.normal) for v in bm.verts])  # (the new body's normals, at rest)


def jaw_move(Pts, amount=1.0, whole=False, normals=None):
    """Each point's move for the jaw open by `amount` (whole: every point goes with the jaw — lower teeth)."""
    t = math.radians(JAW_DEG * amount)
    rel = Pts - HINGE
    R = np.array([[1, 0, 0], [0, math.cos(t), -math.sin(t)], [0, math.sin(t), math.cos(t)]])
    turned = rel @ R.T + HINGE
    if whole:
        return turned - Pts
    zl = HINGE[2] + (slit - HINGE[2]) * (Pts[:, 1] - HINGE[1]) / (front[1] - HINGE[1])
    w = M.sstep(zl + 0.002, zl - 0.007, Pts[:, 2])
    w *= M.sstep(HINGE[1] + 0.03, HINGE[1] - 0.005, Pts[:, 1])
    w *= M.sstep(bs_lm["chin"][2] - 0.075, bs_lm["chin"][2] - 0.025, Pts[:, 2])
    if normals is not None:
        # (inside the mouth's bag — a vertex whose normal looks into the cavity and meets its far wall: the
        # roof and the upper lip's inside face down and stay, the floor and the lower lip's inside face up
        # and go with the jaw)
        inside = np.zeros(len(Pts), dtype=bool)
        near_mouth = np.where(np.linalg.norm((Pts - front) * np.array([1, 0.6, 1]), axis=1) < 0.07)[0]
        for i in near_mouth:
            o_ = Vector(Pts[i]) + Vector(normals[i]) * 0.0006
            hit, _, _, d = tree.ray_cast(o_, Vector(normals[i]), 0.06)
            inside[i] = hit is not None
        by_facing = M.sstep(-0.3, 0.3, normals[:, 2])
        w = np.where(inside, by_facing, w)
        print(f"  mouth bag: {int(inside.sum())} vertices")
    move = (turned - Pts) * w[:, None]
    # (the upper lip: lifted a hair over the mouth's width)
    lw_ = M.BS_LM[WHO]["lip_w"] * k * 1.1
    up = M.sstep(zl + 0.014, zl + 0.004, Pts[:, 2]) * M.sstep(zl - 0.0, zl + 0.003, Pts[:, 2])
    up *= np.clip(1 - (Pts[:, 0] / lw_) ** 2, 0, 1) * (Pts[:, 1] < front[1] + 0.012)
    move[:, 2] += 0.0018 * amount * up
    return move


if "talk" in shapes:
    shapes["talk"] = jaw_move(P, normals=VN)
    print(f"  talk: a jaw of {JAW_DEG:.0f}° about ({HINGE[1]:.3f}, {HINGE[2]:.3f}); chin moves {np.linalg.norm(shapes['talk'], axis=1).max() * 100:.1f} cm")
# the other bodies (the avatar's slim and broad): MakeHuman's twin builds, their bodies' moves from the regular
# one carried across as shapes, their joints' offsets as the extras say (build_person.py's dumps did)
BODY_JOINTS = {}
for bname in ("slim", "broad"):
    twin = MH_BLEND.replace(".blend", f"-{bname}.blend")
    if not os.path.exists(twin):
        continue
    with bpy.data.libraries.load(twin) as (src, dst):
        dst.objects = ["body", "rig"]
    tb, trig = dst.objects
    TB = np.array([v.co for v in tb.data.vertices])
    shapes[bname] = carry(TB - C0)
    BODY_JOINTS[bname] = {b.name: np.array(trig.matrix_world @ b.head_local) - JM[b.name] for b in trig.data.bones}
    bpy.data.objects.remove(tb)
    bpy.data.objects.remove(trig)
    print(f"  body {bname}: moves up to {np.linalg.norm(shapes[bname], axis=1).max() * 100:.1f} cm")

# blinking on this lid (MakeHuman's lid move on another lid's shape closed it half way): each lid turned
# about the eyeball's centre, the margin all the way to where the lids meet, fading out over a centimetre
EYE_R = {}


def lid_turn(Pts, S, amount=1.0, root_f=None):
    c = eye_c[S]
    r = EYE_R[S]
    rel = Pts - c
    d = np.linalg.norm(rel, axis=1)
    phi = np.arctan2(rel[:, 2], -rel[:, 1])
    up = rel[:, 2] > 0
    near = (d < r + 0.009) & (rel[:, 1] < 0.35 * r) & (np.abs(rel[:, 0]) < r * 1.6)
    f = M.sstep(0.0075, 0.0012, d - r) if root_f is None else root_f
    # (the corners stay: the lids meet across the eye, their ends don't turn)
    g = np.clip(1 - (rel[:, 0] / (1.45 * r)) ** 2, 0, 1)
    ang = np.where(up, -(LID[S][0] - LID[S][2]), (LID[S][2] - LID[S][1])) * f * g * near * amount
    cos_, sin_ = np.cos(ang), np.sin(ang)
    # (about the eye's own x: forward −y, up +z)
    y2 = rel[:, 1] * cos_ + rel[:, 2] * sin_
    z2 = -rel[:, 1] * sin_ + rel[:, 2] * cos_
    out = Pts.copy()
    out[:, 1] = c[1] + y2
    out[:, 2] = c[2] + z2
    return out - Pts


LID = {}
for S, e in (("L", eyeL), ("R", eyeR)):
    be = np.array([e.matrix_world @ v.co for v in e.data.vertices])
    EYE_R[S] = float(np.linalg.norm(be - be.mean(0), axis=1).max())
    rel = P - eye_c[S]
    d = np.linalg.norm(rel, axis=1)
    margin = (d < EYE_R[S] + 0.0022) & (rel[:, 1] < 0) & (np.abs(rel[:, 0]) < EYE_R[S] * 0.6)
    phi = np.arctan2(rel[:, 2], -rel[:, 1])
    pu = float(np.median(phi[margin & (rel[:, 2] > 0)])) if (margin & (rel[:, 2] > 0)).any() else 0.4
    pl = float(np.median(phi[margin & (rel[:, 2] < 0)])) if (margin & (rel[:, 2] < 0)).any() else -0.3
    pc = pl + 0.3 * (pu - pl)
    LID[S] = (pu, pl, pc)
    print(f"  lids {S}: upper {math.degrees(pu):.0f}°, lower {math.degrees(pl):.0f}°, meet at {math.degrees(pc):.0f}°")
if "blink" in shapes:
    bl = np.zeros_like(P)
    for S, sx in (("L", 1), ("R", -1)):
        m = P[:, 0] * sx > 0
        bl[m] = lid_turn(P[m], S)[:]
    shapes["blink"] = bl
print(f"  carried: {len(JOINT_NAMES)} joints' weights, shapes {list(shapes)}")

# the parts and the joints moved with the cage (each by its nearest cage vertices' moves)
kd = KDTree(len(C0))
for i, c in enumerate(C0):
    if on_body[i]:
        kd.insert(Vector(c), i)
kd.balance()


def field_at(x, n=8):
    hits = kd.find_n(Vector(x), n)
    w = np.array([1 / max(d, 1e-4) ** 2 for _, _, d in hits])
    return (w[:, None] * FIELD[[i for _, i, _ in hits]]).sum(0) / w.sum()


# (eye-relative: MakeHuman's eye centres onto Blender Studio's, scaled by the eyes' spacing)
spread = np.linalg.norm(eye_c["L"] - eye_c["R"]) / np.linalg.norm(mh_eye_c["L"] - mh_eye_c["R"])


def by_eyes(Pp):
    out = Pp.copy()
    for S, sx in (("L", 1), ("R", -1)):
        m = Pp[:, 0] * sx >= 0
        out[m] = eye_c[S] + (Pp[m] - mh_eye_c[S]) * spread
    return out


# (the teeth and the tongue placed by this mouth: the upper incisors' front a few millimetres behind the lips'
# front, their edge at the slit — moved by the cage they sat forward and the tongue came out over the lip)
TEETH0 = coords(bpy.data.objects["teeth"])
tf = TEETH0 + np.stack([field_at(x) for x in TEETH0])
mid_t = np.abs(tf[:, 0]) < 0.008
upper_t = tf[mid_t]
upper_t = upper_t[upper_t[:, 2] > np.median(upper_t[:, 2])]
inc_front = upper_t[np.argmin(upper_t[:, 1])]
MOUTH_SHIFT = np.array([0.0, (front[1] + 0.011) - inc_front[1], (slit - 0.001) - upper_t[:, 2].min()])
print(f"  teeth and tongue moved {MOUTH_SHIFT[1] * 1000:+.1f} mm back, {MOUTH_SHIFT[2] * 1000:+.1f} mm up")

for part in PARTS:
    if part.name == "eyes":
        continue
    Pp = coords(part)
    if part.name in ("brows", "lashes"):
        moved = by_eyes(Pp)
        if part.name == "brows":
            # (at Blender Studio's brow height over its eyes — MakeHuman's sat on the lid's fold)
            for S, sx in (("L", 1), ("R", -1)):
                m = moved[:, 0] * sx >= 0
                want = eye_c[S][2] + (M.BS_LM[WHO]["brow"] - M.BS_LM[WHO]["eye"]) * k + 0.002
                moved[m, 2] += want - moved[m, 2].mean()
            # (onto the brow ridge: each card's point to the skin, a hair off it)
            for j, x in enumerate(moved):
                loc, n, _, _ = tree.find_nearest(Vector(x))
                if loc is not None:
                    moved[j] = np.array(loc) + np.array(n) * 0.0008
    else:
        moved = Pp + np.stack([field_at(x) for x in Pp])
        if part.name in ("teeth", "tongue"):
            moved = moved + MOUTH_SHIFT
    if part.data.shape_keys:
        d = moved - Pp
        kbs = part.data.shape_keys.key_blocks
        old_talk = np.array([v.co for v in kbs["talk"].data]) - Pp if "talk" in kbs else None
        for kb in kbs:
            K = np.array([v.co for v in kb.data])
            for j, v in enumerate(kb.data):
                v.co = Vector(K[j] + d[j])
        if part.name == "brows" and "blink" in kbs:
            # (no blink on the brows: MakeHuman's brow move tore the cards on this brow)
            for j, v in enumerate(kbs["blink"].data):
                v.co = Vector(moved[j])
        if part.name == "lashes" and "blink" in kbs:
            # (the lashes ride the lids' own blink, each with its lid: a full turn at their roots)
            bl = np.zeros_like(moved)
            for S, sx in (("L", 1), ("R", -1)):
                m = moved[:, 0] * sx > 0
                bl[m] = lid_turn(moved[m], S, root_f=np.ones(int(m.sum())))
            for j, v in enumerate(kbs["blink"].data):
                v.co = Vector(moved[j] + bl[j])
        if old_talk is not None and part.name in ("teeth", "tongue"):
            # (with the jaw: what MakeHuman's talk moved — the lower teeth, the tongue — by the share it moved)
            share = np.clip(np.linalg.norm(old_talk, axis=1) / max(np.linalg.norm(old_talk, axis=1).max(), 1e-6) * 1.6, 0, 1)
            if part.name == "tongue":
                share *= 0.55
            jm = jaw_move(moved, whole=True) * share[:, None]
            for j, v in enumerate(kbs["talk"].data):
                v.co = Vector(moved[j] + jm[j])
    set_coords(part, moved)

# the eyes: Blender Studio's own (they fit its sockets), one mesh, each on its eye's joint; the iris painted
# by the angle off the eye's forward
old_eyes = bpy.data.objects["eyes"]
bpy.data.objects.remove(old_eyes)
ev, ef, euv, eg = [], [], [], []
for S, e in (("L", eyeL), ("R", eyeR)):
    base_i = len(ev)
    ev += [list(e.matrix_world @ v.co) for v in e.data.vertices]
    uvl = e.data.uv_layers[0].data
    for poly in e.data.polygons:
        ef.append([base_i + i for i in poly.vertices])
        euv.append([tuple(uvl[li].uv) for li in poly.loop_indices])
    eg += [S] * len(e.data.vertices)
me = bpy.data.meshes.new("eyes")
me.from_pydata(ev, [], ef)
lay = me.uv_layers.new(name="UVMap")
li = 0
for f in euv:
    for uv in f:
        lay.data[li].uv = uv
        li += 1
for p_ in me.polygons:
    p_.use_smooth = True
eyes = bpy.data.objects.new("eyes", me)
bpy.data.collections["person"].objects.link(eyes)
for n in JOINT_NAMES:
    eyes.vertex_groups.new(name=n)
for i, S in enumerate(eg):
    eyes.vertex_groups[f"eye{S}"].add([i], 1.0, "REPLACE")
eyes.parent = rig
eyes.modifiers.new("rig", "ARMATURE").object = rig
epos = M.emit_position(eyeL, M.image("pos-eye", float_buffer=True, size=512))
ec = eye_c["L"]
ev_ = epos[..., :3] - ec
ev_ /= np.maximum(np.linalg.norm(ev_, axis=-1, keepdims=True), 1e-6)
ang = np.degrees(np.arccos(np.clip(-ev_[..., 1], -1, 1)))
iris_c = np.array([0.32, 0.5, 0.48])
ring_n = M.noise3(epos[..., :3] * 1.0, 900, 8)
sclera = np.array([0.86, 0.82, 0.78]) * (1 - 0.18 * M.sstep(50, 85, ang))[..., None]
ir = iris_c * (0.7 + 0.6 * ring_n)[..., None] * (1 - 0.55 * M.sstep(22, 28.5, ang))[..., None]
ir = ir * (1 + 0.25 * M.sstep(14, 9, ang))[..., None]
col = np.where((ang < 29)[..., None], ir, sclera)
col = np.where((ang < 9.5)[..., None], 0.015, col)
eimg = M.image("eye-iris", size=512)
M.put(eimg, np.concatenate([col, np.ones(ang.shape)[..., None]], -1))
eyes.data.materials.append(M.mat("eyes", img=M.on_disk(eimg), rough=0.3))
bpy.data.objects.remove(eyeL)
bpy.data.objects.remove(eyeR)
if os.environ.get("BS_NO_TONGUE"):
    bpy.data.objects.remove(bpy.data.objects["tongue"])
bpy.data.objects.remove(bpy.data.objects["hair"])
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for eb in rig.data.edit_bones:
    h = np.array(eb.head)
    if eb.name in ("eyeL", "eyeR"):
        nh = eye_c[eb.name[-1]]
    elif eb.name in BJ:
        nh = BJ[eb.name]
    else:
        nh = h + field_at(h, 16)
    t = np.array(eb.tail) - h
    eb.head = Vector(nh)
    eb.tail = Vector(nh + t)
bpy.ops.object.mode_set(mode="OBJECT")

# ---- 5. the skin: MakeHuman's photo skin from the wrapped cage onto the new UVs
for p in cage.data.polygons:
    p.use_smooth = True
skin_src = cage.data.materials[0]
# (MakeHuman's photo skin is painted in regions of different tone — the face paler than the body: its light
# divided by its own wide neighbourhood's, the whole's kept; hue left as painted)
src_img = next(n.image for n in skin_src.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
SI = M.pixels(src_img)
lum = SI[..., :3] @ np.array([0.2126, 0.7152, 0.0722])


def wide(a, f=16, passes=4):
    h_, w_ = a.shape
    sm = a.reshape(h_ // f, f, w_ // f, f).mean((1, 3))
    for _ in range(passes):
        sm = (sm * 4 + np.roll(sm, 1, 0) + np.roll(sm, -1, 0) + np.roll(sm, 1, 1) + np.roll(sm, -1, 1)) / 8
    # (back up, bilinear: no blocks)
    yy = (np.arange(h_) + 0.5) / f - 0.5
    xx = (np.arange(w_) + 0.5) / f - 0.5
    y0 = np.clip(np.floor(yy).astype(int), 0, sm.shape[0] - 1)
    x0 = np.clip(np.floor(xx).astype(int), 0, sm.shape[1] - 1)
    y1 = np.clip(y0 + 1, 0, sm.shape[0] - 1)
    x1 = np.clip(x0 + 1, 0, sm.shape[1] - 1)
    fy = np.clip(yy - y0, 0, 1)[:, None]
    fx = np.clip(xx - x0, 0, 1)[None]
    return (sm[y0][:, x0] * (1 - fy) * (1 - fx) + sm[y1][:, x0] * fy * (1 - fx) + sm[y0][:, x1] * (1 - fy) * fx + sm[y1][:, x1] * fy * fx)


loc_l = wide(lum)
ratio = np.clip(np.median(lum) / np.maximum(loc_l, 1e-3), 0.75, 1.35)
SI[..., :3] *= ratio[..., None]
M.put(src_img, SI)
# each texel of the new skin: its place on the body (baked), the nearest point of the wrapped cage that
# faces the same way, the cage's UV there, MakeHuman's skin read at it (no ray to miss)
tpos = M.emit_position(low, M.image("tpos", float_buffer=True))
gm = bpy.data.materials.new("nrm-m")
gm.use_nodes = True
nt = gm.node_tree
for n_ in list(nt.nodes):
    nt.nodes.remove(n_)
gn = nt.nodes.new("ShaderNodeNewGeometry")
emn = nt.nodes.new("ShaderNodeEmission")
on_ = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(gn.outputs["Normal"], emn.inputs["Color"])
nt.links.new(emn.outputs["Emission"], on_.inputs["Surface"])
low.data.materials.clear()
low.data.materials.append(gm)
tn_img = M.image("tnrm", float_buffer=True)
M.bake("EMIT", low, tn_img)
tnrm = M.pixels(tn_img)[..., :3]
low.data.materials.clear()
uvl = cage_bm.loops.layers.uv.active
tri_uv = np.array([[tuple(l[uvl].uv) for l in f.loops] for f in cage_bm.faces])
ih, iw = tpos.shape[:2]
flat_p = tpos[..., :3].reshape(-1, 3)
flat_n = tnrm.reshape(-1, 3)
valid = np.linalg.norm(flat_n, axis=1) > 0.5
idx = np.where(valid)[0]
locs = np.zeros((len(idx), 3))
fis = np.zeros(len(idx), dtype=np.int64)
case = np.zeros(len(idx), dtype=np.int8)
for j, t in enumerate(idx):
    c = Vector(flat_p[t])
    n = Vector(flat_n[t])
    loc, fn, fi, _ = ctree.find_nearest(c)
    if loc is not None and fn.dot(n) < 0.2:
        case[j] = 2
        best = None
        for sgn in (1, -1):
            hit, hn, hfi, d = ctree.ray_cast(c + n * 0.05 * sgn, -n * sgn, 0.12)
            if hit is not None and hn.dot(n) > 0.2 and (best is None or d < best[1]):
                best = (hit, d, hfi)
        if best is not None:
            loc, fi = best[0], best[2]
            case[j] = 1
    locs[j] = loc
    fis[j] = fi
A_, B_, C_ = (C3[tri[fis, q]] for q in range(3))
v0, v1, v2 = B_ - A_, C_ - A_, locs - A_
d00 = (v0 * v0).sum(1)
d01 = (v0 * v1).sum(1)
d11 = (v1 * v1).sum(1)
d20 = (v2 * v0).sum(1)
d21 = (v2 * v1).sum(1)
den = np.where(np.abs(d00 * d11 - d01 * d01) < 1e-14, 1e-14, d00 * d11 - d01 * d01)
bv = (d11 * d20 - d01 * d21) / den
bw_ = (d00 * d21 - d01 * d20) / den
bu = 1 - bv - bw_
bary = np.clip(np.stack([bu, bv, bw_], 1), 0, 1)
bary /= bary.sum(1, keepdims=True)
uv = (bary[:, :, None] * tri_uv[fis]).sum(1)
sh_, sw_ = SI.shape[:2]
x = np.clip(uv[:, 0] * sw_ - 0.5, 0, sw_ - 1.001)
y = np.clip(uv[:, 1] * sh_ - 0.5, 0, sh_ - 1.001)
x0, y0 = x.astype(int), y.astype(int)
fx, fy = (x - x0)[:, None], (y - y0)[:, None]
samp = SI[y0, x0, :3] * (1 - fx) * (1 - fy) + SI[y0, x0 + 1, :3] * fx * (1 - fy) + SI[y0 + 1, x0, :3] * (1 - fx) * fy + SI[y0 + 1, x0 + 1, :3] * fx * fy
S_ = np.zeros((ih * iw, 4), dtype=np.float32)
S_[idx, :3] = samp
S_[:, 3] = 1
S_ = S_.reshape(ih, iw, 4)
print(f"  skin read through the cage: {len(idx)} texels; nearest {int((case == 0).sum())}, by ray {int((case == 1).sum())}, failed {int((case == 2).sum())}")
if DEBUG:
    cm = np.zeros((ih * iw, 4), dtype=np.float32)
    cm[:, 3] = 1
    cm[idx, :3] = np.array([[0.2, 0.8, 0.2], [0.2, 0.4, 1.0], [1.0, 0.1, 0.1]])[case]
    ci = M.image("cases")
    M.put(ci, cm.reshape(ih, iw, 4))
    M.save_png(ci, os.path.join(DEBUG, "cases.png"))
    nn = np.zeros((ih * iw, 4), dtype=np.float32)
    nn[:, 3] = 1
    nn[:, :3] = flat_n * 0.5 + 0.5
    ni = M.image("nn")
    M.put(ni, nn.reshape(ih, iw, 4))
    M.save_png(ni, os.path.join(DEBUG, "tnormals.png"))
    um = np.zeros((ih * iw, 4), dtype=np.float32)
    um[:, 3] = 1
    um[idx, 0] = (uv[:, 0] * 8) % 1
    um[idx, 1] = (uv[:, 1] * 8) % 1
    um[idx, 2] = uv[:, 0] * 0.5
    ui = M.image("uvmap")
    M.put(ui, um.reshape(ih, iw, 4))
    M.save_png(ui, os.path.join(DEBUG, "uvmap.png"))
alb = M.image("albedo")
# (where no ray found the cage — the toes' tips, the inner thigh by the hand: filled from around)
miss = S_[..., :3].sum(-1) < 0.04
for f in (4, 8, 16, 32, 64):
    if not miss.any():
        break
    have = (~miss).astype(np.float64)
    num = np.stack([wide(S_[..., c] * have, f, 2) for c in range(3)], -1)
    den = wide(have, f, 2)[..., None]
    fill = num / np.maximum(den, 1e-4)
    ok = (den[..., 0] > 0.05) & miss
    S_[..., :3][ok] = fill[ok]
    miss = miss & ~ok
print(f"  holes left: {int(miss.sum())} texels")
# (specks: thin marks where a texel read MakeHuman's lid or mouth inside — off their neighbourhood's tone and
# gone after an erosion; the lips, a broad patch, stay)
lumS = S_[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
around = np.stack([wide(S_[..., c], 4, 2) for c in range(3)], -1)
dev = np.abs(lumS - around @ np.array([0.2126, 0.7152, 0.0722])) / np.maximum(around.mean(-1), 0.05) > 0.12
dev |= np.abs(S_[..., 0] - S_[..., 1] - (around[..., 0] - around[..., 1])) > 0.08


def shift_all(m, fn):
    out = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out = fn(out, np.roll(np.roll(m, dy, 0), dx, 1))
    return out


core = dev
for _ in range(3):
    core = shift_all(core, np.logical_and)
keep = core
for _ in range(4):
    keep = shift_all(keep, np.logical_or)
speck = dev & ~keep
S_[..., :3][speck] = around[speck]
print(f"  specks cleaned: {int(speck.sum())} texels")
# the shorts (phase 0c: painted, no garment yet) — by height, not on the arms
arm_ix = [JOINT_NAMES.index(n) for n in JOINT_NAMES if n.startswith(("shoulder", "elbow", "forearm", "wrist", "fingers", "index", "thumb", "ring", "little"))]
armw = BW[:, arm_ix].sum(1)
zr = (P[:, 2] - P[:, 2].min()) / (P[:, 2].max() - P[:, 2].min())
short = ((zr > 0.36) & (zr < 0.575) & (armw < 0.5) & (bs_arm < 0.3)).astype(np.float32)
ca = low.data.color_attributes.new("mask", "FLOAT_COLOR", "POINT")
ca.data.foreach_set("color", np.repeat(short[:, None], 4, 1).ravel())
mimg = M.image("mask")
mm = bpy.data.materials.new("mask-m")
mm.use_nodes = True
nt = mm.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
an = nt.nodes.new("ShaderNodeAttribute")
an.attribute_name = "mask"
em = nt.nodes.new("ShaderNodeEmission")
out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(an.outputs["Color"], em.inputs["Color"])
nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
low.data.materials.clear()
low.data.materials.append(mm)
M.bake("EMIT", low, mimg)
mask = np.clip(M.pixels(mimg)[..., 0], 0, 1)
mask = M.sstep(0.35, 0.65, mask)
low.data.color_attributes.remove(low.data.color_attributes["mask"])
S_[..., :3] *= (0.55 + 0.45 * A)[..., None]
navy = np.array([0.1, 0.12, 0.2]) * (0.7 + 0.3 * A)[..., None]
S_[..., :3] = S_[..., :3] * (1 - mask[..., None]) + navy * mask[..., None]
M.put(alb, S_)
if DEBUG:
    M.save_png(alb, os.path.join(DEBUG, f"bs-{WHO}-albedo.png"))
skin_mean = S_[..., :3][(mask < 0.5) & (S_[..., :3].sum(-1) > 0.15)].mean(0)

# ---- 6. the new body in the cage's place, written as the people are
low.data.materials.clear()
low.data.materials.append(M.mat("skin", img=M.on_disk(alb), nrm=nrm, rough=0.55))
for n in JOINT_NAMES:
    low.vertex_groups.new(name=n)
for i in range(len(P)):
    top = np.argsort(-BW[i])[:4]
    for j in top:
        if BW[i, j] > 1e-4:
            low.vertex_groups[JOINT_NAMES[j]].add([i], float(BW[i, j]), "REPLACE")
low.shape_key_add(name="Basis")
for nm, d in shapes.items():
    kb = low.shape_key_add(name=nm)
    kb.data.foreach_set("co", (P + d).ravel())
bpy.data.objects.remove(cage)
low.name = "body"
low.data.name = "body"
for c in list(low.users_collection):
    c.objects.unlink(low)
bpy.data.collections["person"].objects.link(low)
low.parent = rig
mod = low.modifiers.new("rig", "ARMATURE")
mod.object = rig
life = json.loads(rig["life"])
life["skin_mean"] = [round(float(x), 4) for x in skin_mean]
life["base"] = "blender-studio"
# (each other body's joints' offsets, glTF's axes: x, z, −y)
life["bodies"] = {
    bname: {j: [round(float(o[0]), 5), round(float(o[2]), 5), round(float(-o[1]), 5)] for j, o in offs.items()}
    for bname, offs in BODY_JOINTS.items()
}
life.pop("iris", None)  # (MakeHuman's iris place in its eye texture: not this eye's)
rig["life"] = json.dumps(life)
# (the textures to the people's GPU budget: the skin's colour at 2048 for the face, its relief at half that —
# as the material library's normals — the mouth's at 256, brows, lashes and eyes at 512)
CAPS = {"teeth": 256, "tongue": 256, "brows": 512, "lashes": 512, "eyes": 512}
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    cap = CAPS.get(o.name, 2048)
    for m in o.data.materials:
        for n in m.node_tree.nodes if m and m.node_tree else []:
            if n.type == "TEX_IMAGE" and n.image:
                img = n.image
                c = 1024 if img.colorspace_settings.name == "Non-Color" and o.name == "body" else cap
                if max(img.size) > c:
                    img.scale(c, c)
os.makedirs(OUT, exist_ok=True)
path = os.path.abspath(os.path.join(OUT, f"person-{WHO}-bs.glb"))
bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children["person"]
bpy.ops.export_scene.gltf(
    filepath=path,
    use_active_collection=True,
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
    export_extras=True,
    export_tangents=True,
)
print("wrote", path, f"{os.path.getsize(path) / 1e6:.1f} MB")
if DEBUG:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DEBUG, f"bs-{WHO}.blend"))

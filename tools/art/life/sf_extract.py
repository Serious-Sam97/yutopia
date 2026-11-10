# Plan 74/75 — a downloaded hair (or beard) taken out of its glTF for hair.py's make_imported: its meshes,
# UVs and colour textures, in metres (x right, y up, facing +z), with the head it was made for measured.
#   blender -b --factory-startup -P tools/art/life/sf_extract.py -- IN.gltf OUT.npz
# Settings by environment (tools/art/life/sources.json keeps each work's; sources.py passes them):
#   MATS      only meshes with a material matching this (a whole character's hair, not its body)
#   HEADMATS  that character's skin: its head measured from it (else from the hair itself)
#   FLIP      facing away: turned round
#   STAND     lying on its back (its rig's turn not in the file): stood up
#   THICK     how far the hair stands off the head (m), when the head is measured from the hair
#   DECIMATE  this share of its triangles kept (Blender's collapse — the heaviest works, for the budget)
# → OUT.npz: P, UV (Blender's, v up), F (triangles), cranium (the head's top decimetre: its x/z middle,
# width, depth and top), tex (the colour textures grey — the game colours it — with their alpha, 1024 high,
# one per material side by side, the UVs moved into each one's slot).
import os
import re
import sys

import bpy
import numpy as np

IN, OUT = sys.argv[sys.argv.index("--") + 1 :][:2]
MATS = os.environ.get("MATS")
HEADMATS = os.environ.get("HEADMATS")
FLIP = bool(os.environ.get("FLIP"))
STAND = bool(os.environ.get("STAND"))
THICK = float(os.environ.get("THICK", "0.015"))
DECIMATE = float(os.environ.get("DECIMATE", "1"))
S = 1024

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=IN)


def has_mat(o, pattern, flags=0):
    return any(m and re.search(pattern, m.name, flags) for m in o.data.materials)


def world(o):
    """The object's vertices in the world, ours: y up, facing +z (Blender's z up, facing -y)."""
    M = np.array(o.matrix_world)
    Q = np.array([v.co[:] for v in o.data.vertices]) @ M[:3, :3].T + M[:3, 3]
    return np.stack([Q[:, 0], Q[:, 2], -Q[:, 1]], 1)


def turned(X):
    if FLIP:
        X = np.stack([-X[:, 0], X[:, 1], -X[:, 2]], 1)
    if STAND:
        X = np.stack([X[:, 0], -X[:, 2], X[:, 1]], 1)
    return X


obs = [o for o in bpy.context.scene.objects
       if o.type == "MESH" and len(o.data.polygons) and len(o.data.materials) and o.data.uv_layers
       and (not MATS or has_mat(o, MATS, re.I))]  # fmt: skip
mats = []
for o in obs:
    for m in o.data.materials:
        if m and m not in mats:
            mats.append(m)


def basecolor(m):
    ims = [n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    for im in ims:
        if any(w in im.name.lower() for w in ("base", "diff", "color")):
            return im
    return ims[0] if ims else None


names = [m.name for m in mats]
texs = []
for m in mats:
    im = basecolor(m)
    if im is None:
        texs.append(None)
        continue
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    if w > S:
        k = w // S
        px = px.reshape(h // k, k, w // k, k, 4).mean((1, 3))
    texs.append(px[::-1])  # (the top row first)

if DECIMATE < 1:
    for o in obs:
        mod = o.modifiers.new("decimate", "DECIMATE")
        mod.ratio = DECIMATE
        mod.use_collapse_triangulate = True
dg = bpy.context.evaluated_depsgraph_get()

P, UV, F = [], [], []
for o in obs:
    ev = o.evaluated_get(dg)
    me = ev.to_mesh() if DECIMATE < 1 else o.data
    base = len(P)
    M = np.array(o.matrix_world)
    Q = np.array([v.co[:] for v in me.vertices]) @ M[:3, :3].T + M[:3, 3]
    P.extend(np.stack([Q[:, 0], Q[:, 2], -Q[:, 1]], 1))
    uvl = me.uv_layers.active.data
    uv = np.zeros((len(me.vertices), 2))
    for p in me.polygons:
        slot = names.index(me.materials[p.material_index].name)  # (by name: the trimmed mesh's are copies)
        for li, vi in zip(p.loop_indices, p.vertices):
            u, v = uvl[li].uv[:]
            uv[vi] = ((u % 1.0 + slot) / len(mats), v % 1.0)
        vs = [base + v for v in p.vertices]
        F.extend((vs[0], vs[k], vs[k + 1]) for k in range(1, len(vs) - 1))
    UV.extend(uv.tolist())
P, UV, F = turned(np.array(P)), np.array(UV), np.array(F)

if HEADMATS:
    # the head from the character's own skin: its top slice, as deep as 0.6 of its own width (found by
    # iterating — whatever the units), brought to ~0.15 m wide; then its top decimetre
    H = turned(np.vstack([world(o) for o in bpy.context.scene.objects
                          if o.type == "MESH" and has_mat(o, HEADMATS)]))  # fmt: skip
    top = H[:, 1].max()
    depth = 0.1 * np.ptp(H[:, 1])
    for _ in range(6):
        w = np.ptp(H[H[:, 1] > top - depth][:, 0])
        depth = max(0.6 * w, 0.03 * np.ptp(H[:, 1]))
    k = 0.15 / max(w, 1e-9)
    P, H = P * k, H * k
    top = H[:, 1].max()
    C = H[H[:, 1] > top - 0.10]
else:
    # the head from the hair: brought to ~0.25 m wide (their units vary — cm, m, other; the fit to our
    # head scales it again), then its reach round the band 4–10 cm under its top, less its thickness
    P = P * (0.25 / max(np.ptp(P[:, 0]), 1e-9))
    hi = P[:, 1].max()
    C = P[(P[:, 1] < hi - 0.04) & (P[:, 1] > hi - 0.10)]
    top = hi - THICK
cranium = np.array([(C[:, 0].min() + C[:, 0].max()) / 2, (C[:, 2].min() + C[:, 2].max()) / 2,
                    np.ptp(C[:, 0]) - (0 if HEADMATS else 2 * THICK),
                    np.ptp(C[:, 2]) - (0 if HEADMATS else 2 * THICK), top])  # fmt: skip

grey = []
for t in texs:
    if t is None:
        t = np.ones((S, S, 4), np.float32)
    if t.shape[0] != S:
        t = np.kron(t, np.ones((S // t.shape[0], max(1, S // t.shape[1]), 1)))
    lum = t[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    ok = t[..., 3] > 0.5
    lum = np.clip(lum / max(1e-3, np.percentile(lum[ok], 95) if ok.any() else 1) * 0.95, 0, 1)
    grey.append(np.dstack([lum, lum, lum, t[..., 3]]))
tex = np.concatenate(grey, 1)
np.savez(OUT, P=P, UV=UV, F=F, cranium=cranium, tex=tex.astype(np.float32))
print(f"extracted {os.path.basename(OUT)}: {len(P)} vertices, {len(F)} triangles, texture {tex.shape[1]}×{tex.shape[0]}")

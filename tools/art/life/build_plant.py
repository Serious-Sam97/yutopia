# Plan 73, phase 0c — the life look's plant (organic things are made in Blender, F2): a rubber tree in
# a cream ceramic pot — three curving stems, glossy oval leaves shaped in the mesh itself (no cut-out
# edges), each painted with a lighter midrib and soft veins; a dark soil top. Seeded: the same plant
# every build.
#
#   blender -b --factory-startup -P tools/art/life/build_plant.py -- [--out DIR] [--seed N]
import math
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(os.path.dirname(__file__), "../../../apps/client/public/life"))
SEED = int(arg("--seed", "7"))
rng = np.random.default_rng(SEED)

bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh(name, verts, faces, uvs=None, mat=None, smooth=True):
    """`verts` in y-up metres (glTF's), facing +z: into Blender's z-up."""
    v = np.asarray(verts, dtype=np.float64)
    bl = np.stack([v[:, 0], -v[:, 2], v[:, 1]], 1)
    me = bpy.data.meshes.new(name)
    me.from_pydata(bl.tolist(), [], faces)
    if uvs is not None:
        lay = me.uv_layers.new(name="UVMap")
        li = 0
        for f in faces:
            for vi in f:
                lay.data[li].uv = uvs[vi]
                li += 1
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def material(name, color, rough, tex=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if tex is not None:
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = tex
        m.node_tree.links.new(n.outputs["Color"], b.inputs["Base Color"])
    return m


def leaf_texture(size=512):
    """A rubber tree's leaf, painted: deep green, lighter toward the middle, a pale midrib down v, soft
    veins sweeping out to the edges, a darker rim."""
    u = np.linspace(0, 1, size)[None, :].repeat(size, 0)  # across
    v = np.linspace(0, 1, size)[:, None].repeat(size, 1)  # along
    x = np.abs(u - 0.5) * 2
    dark = np.array([0.04, 0.16, 0.06])
    mid = np.array([0.1, 0.32, 0.12])
    c = dark[None, None] + (mid - dark)[None, None] * (1 - x[..., None] ** 1.5) * (0.6 + 0.4 * np.sin(v * math.pi))[..., None]
    rib = np.exp(-((u - 0.5) ** 2) / (2 * 0.008**2))
    c = c * (1 - rib[..., None] * 0.6) + np.array([0.55, 0.62, 0.38])[None, None] * rib[..., None] * 0.6
    vein = 0.5 + 0.5 * np.cos((v * 26 - x * 6) * math.pi)
    c *= (1 + 0.08 * (vein[..., None] ** 8) * (x[..., None] > 0.05))
    c *= (1 - 0.25 * np.clip((x - 0.85) / 0.15, 0, 1))[..., None]
    rgba = np.concatenate([np.clip(c, 0, 1), np.ones((size, size, 1))], 2)
    img = bpy.data.images.new("leaf", size, size, alpha=False)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    img.filepath_raw = os.path.join(bpy.app.tempdir or "/tmp", "leaf.png")
    img.file_format = "PNG"
    img.save()
    return img


# ---- the pot (a lathe), its soil
R0, R1, H = 0.12, 0.165, 0.3
profile = [(0.0, 0.0), (R0, 0.0), (R0 + 0.01, 0.01), (R1, H - 0.02), (R1 + 0.015, H), (R1 + 0.012, H + 0.025), (R1 - 0.008, H + 0.025), (R1 - 0.015, H - 0.03)]
SEG = 48
verts, faces = [], []
for j, (r, y) in enumerate(profile):
    for i in range(SEG):
        a = i / SEG * math.tau
        verts.append((r * math.cos(a), y, r * math.sin(a)))
for j in range(len(profile) - 1):
    for i in range(SEG):
        a, b = j * SEG + i, j * SEG + (i + 1) % SEG
        faces.append([a, b, b + SEG, a + SEG])
pot = material("pot", (0.86, 0.82, 0.74), 0.38)
mesh("pot", verts, faces, mat=pot)
soil_y = H - 0.035
sv = [(0, soil_y + 0.01, 0)] + [((R1 - 0.015) * math.cos(i / SEG * math.tau), soil_y, (R1 - 0.015) * math.sin(i / SEG * math.tau)) for i in range(SEG)]
mesh("soil", sv, [[0, 1 + i, 1 + (i + 1) % SEG] for i in range(SEG)], mat=material("soil", (0.09, 0.06, 0.04), 0.95))


# ---- stems (tubes along curves) and leaves
def tube(points, r0, r1, sides=7):
    pts = np.asarray(points)
    vs, fs = [], []
    n = len(pts)
    for k in range(n):
        t = pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]
        t /= np.linalg.norm(t)
        a = np.cross(t, [1, 0, 0])
        if np.linalg.norm(a) < 1e-3:
            a = np.cross(t, [0, 0, 1])
        a /= np.linalg.norm(a)
        b = np.cross(t, a)
        r = r0 + (r1 - r0) * k / (n - 1)
        for i in range(sides):
            ang = i / sides * math.tau
            vs.append(pts[k] + (a * math.cos(ang) + b * math.sin(ang)) * r)
    for k in range(n - 1):
        for i in range(sides):
            p, q = k * sides + i, k * sides + (i + 1) % sides
            fs.append([p, q, q + sides, p + sides])
    return vs, fs


def leaf(base, direction, length, width, droop, roll):
    """A leaf from `base` along `direction` (its tip's way), shaped: wide in the middle, pointed, folded
    a little along its midrib and arching down by `droop`."""
    d = np.asarray(direction, dtype=np.float64)
    d /= np.linalg.norm(d)
    side = np.cross(d, [0, 1, 0])
    if np.linalg.norm(side) < 1e-3:
        side = np.array([1.0, 0, 0])
    side /= np.linalg.norm(side)
    up = np.cross(side, d)
    c, s = math.cos(roll), math.sin(roll)
    side, up = side * c + up * s, up * c - side * s
    NL, NW = 10, 5
    vs, uv, fs = [], [], []
    for i in range(NL + 1):
        t = i / NL
        w = width * (math.sin(math.pi * min(1, t * 1.05)) ** 0.75) * (1 - 0.15 * t)
        for j in range(NW + 1):
            x = (j / NW - 0.5) * 2
            p = base + d * (t * length) + side * (x * w / 2)
            p = p + up * (-abs(x) * w * 0.18 - droop * t * t)
            vs.append(p)
            uv.append((j / NW, t))
    for i in range(NL):
        for j in range(NW):
            a = i * (NW + 1) + j
            fs.append([a, a + 1, a + NW + 2, a + NW + 1])
    return vs, uv, fs


stem_mat = material("stem", (0.3, 0.2, 0.12), 0.6)
leaf_mat = material("leaf", (1, 1, 1), 0.32, leaf_texture())
leaf_v, leaf_uv, leaf_f = [], [], []
stems_v, stems_f = [], []
for s_i, (ang, lean, height) in enumerate(((0.3, 0.12, 1.05), (2.4, 0.2, 0.82), (4.3, 0.1, 1.22), (5.5, 0.22, 0.66))):
    pts = []
    for k in range(9):
        t = k / 8
        out = lean * t * 0.6 + 0.02 * math.sin(t * 5 + s_i)
        pts.append(np.array([math.cos(ang) * out, soil_y + t * height, math.sin(ang) * out]))
    vs, fs = tube(pts, 0.012, 0.006)
    o = len(stems_v)
    stems_v += vs
    stems_f += [[x + o for x in f] for f in fs]
    # leaves along its upper two thirds, turning round it, larger low down
    nleaf = 14
    for k in range(nleaf):
        t = 0.25 + 0.75 * k / (nleaf - 1)
        idx = t * 8
        i0 = int(min(7, math.floor(idx)))
        p = pts[i0] + (pts[i0 + 1] - pts[i0]) * (idx - i0)
        around = ang + k * 2.4 + rng.uniform(-0.3, 0.3)
        tilt = 0.35 - 0.3 * t + rng.uniform(-0.1, 0.1)  # up from level (spread out, as a rubber tree's)
        dirv = np.array([math.cos(around) * math.cos(tilt), math.sin(tilt), math.sin(around) * math.cos(tilt)])
        stalk = p + dirv * 0.03
        L = 0.27 * (1.15 - 0.35 * t) * rng.uniform(0.9, 1.1)
        vs, uv, fs = leaf(stalk, dirv, L, L * 0.52, 0.05 + 0.04 * rng.uniform(), rng.uniform(-0.3, 0.3))
        o = len(leaf_v)
        leaf_v += vs
        leaf_uv += uv
        leaf_f += [[x + o for x in f] for f in fs]
    # a new leaf rolled at the top, in its red-brown sheath
    tip = pts[-1]
    sv, sf = tube([tip, tip + np.array([0.004, 0.06, 0.002])], 0.009, 0.002, 6)
    o = len(stems_v)
    stems_v += sv
    stems_f += [[x + o for x in f] for f in sf]

mesh("stems", stems_v, stems_f, mat=stem_mat)
mesh("leaves", leaf_v, leaf_f, uvs=leaf_uv, mat=leaf_mat)
# (leaves seen from both sides)
leaf_mat.use_backface_culling = False

os.makedirs(OUT, exist_ok=True)
path = os.path.abspath(os.path.join(OUT, "plant-rubber.glb"))
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_image_format="AUTO")
print(f"wrote {path} ({os.path.getsize(path) / 1e3:.0f} KB), {len(leaf_f)} leaf quads")

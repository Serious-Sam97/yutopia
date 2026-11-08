# Plan 73, phase 0d — the life look's leafy tree (organic things are made in Blender, F2): a broad
# deciduous tree, ~7 m — a curving trunk, two levels of branches, and a crown of leaf cards (each a quad
# painted with a cluster of small leaves, cut out by its alpha, turned every way so the crown reads
# round and full from anywhere). Bark painted on the trunk. Seeded: the same tree every build.
#
#   blender -b --factory-startup -P tools/art/life/build_tree.py -- [--out DIR] [--seed N]
import math
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(os.path.dirname(__file__), "../../../apps/client/public/life"))
SEED = int(arg("--seed", "11"))
rng = np.random.default_rng(SEED)
bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh(name, verts, faces, uvs=None, mat=None):
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
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def image(name, rgba):
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    img.filepath_raw = os.path.join(bpy.app.tempdir or "/tmp", f"{name}.png")
    img.file_format = "PNG"
    img.save()
    return img


def material(name, img, rough, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    n = m.node_tree.nodes.new("ShaderNodeTexImage")
    n.image = img
    m.node_tree.links.new(n.outputs["Color"], b.inputs["Base Color"])
    if alpha:
        m.node_tree.links.new(n.outputs["Alpha"], b.inputs["Alpha"])
    return m


def leaves_texture(size=512):
    """A cluster of small painted leaves on a clear ground: each an ellipse with a pointed tip, a
    lighter side to the sky, its own green."""
    rgba = np.zeros((size, size, 4))
    yy, xx = np.mgrid[0:size, 0:size] / size
    for _ in range(90):
        cx, cy = rng.uniform(0.1, 0.9, 2)
        if (cx - 0.5) ** 2 + (cy - 0.5) ** 2 > 0.17:
            continue
        a = rng.uniform(0, math.pi)
        L, W = rng.uniform(0.07, 0.11), rng.uniform(0.035, 0.05)
        dx, dy = xx - cx, yy - cy
        u = dx * math.cos(a) + dy * math.sin(a)
        v = -dx * math.sin(a) + dy * math.cos(a)
        inside = (u / L) ** 2 + (v / (W * (1 - 0.6 * np.clip(u / L, 0, 1)))) ** 2 < 1
        g = rng.uniform(0, 1)
        col = np.array([0.18 + 0.12 * g, 0.38 + 0.18 * g, 0.12 + 0.06 * g])
        light = 0.85 + 0.3 * np.clip(-v / W, -1, 1) * 0.5 + 0.15 * (1 - yy)
        c = col[None, None] * light[..., None]
        rgba[inside, :3] = c[inside]
        rgba[inside, 3] = 1
    return image("leaves", np.clip(rgba, 0, 1))


def bark_texture(size=256):
    yy, xx = np.mgrid[0:size, 0:size] / size
    stripes = 0.5 + 0.5 * np.sin((xx * 14 + 0.6 * np.sin(yy * 9)) * math.pi)
    c = np.array([0.32, 0.25, 0.19])[None, None] * (0.75 + 0.35 * stripes[..., None])
    return image("bark", np.concatenate([np.clip(c, 0, 1), np.ones((size, size, 1))], 2))


def tube(points, radii, sides=9):
    pts = np.asarray(points)
    vs, uv, fs = [], [], []
    n = len(pts)
    for k in range(n):
        t = pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]
        t /= np.linalg.norm(t)
        a = np.cross(t, [1, 0, 0])
        if np.linalg.norm(a) < 1e-3:
            a = np.cross(t, [0, 0, 1])
        a /= np.linalg.norm(a)
        b = np.cross(t, a)
        for i in range(sides + 1):
            ang = i / sides * math.tau
            vs.append(pts[k] + (a * math.cos(ang) + b * math.sin(ang)) * radii[k])
            uv.append((i / sides, k / (n - 1) * 4))
    for k in range(n - 1):
        for i in range(sides):
            p, q = k * (sides + 1) + i, k * (sides + 1) + i + 1
            fs.append([p, q, q + sides + 1, p + sides + 1])
    return vs, uv, fs


wood_v, wood_uv, wood_f = [], [], []
tips = []  # where the leaves go: (point, size)


def add_tube(pts, radii):
    vs, uv, fs = tube(pts, radii)
    o = len(wood_v)
    wood_v.extend(vs)
    wood_uv.extend(uv)
    wood_f.extend([[x + o for x in f] for f in fs])


def branch(start, direction, length, r0, level):
    d = np.asarray(direction, dtype=np.float64)
    d /= np.linalg.norm(d)
    pts, radii = [], []
    p = np.asarray(start, dtype=np.float64)
    n = 7
    for k in range(n):
        t = k / (n - 1)
        pts.append(p.copy())
        radii.append(r0 * (1 - 0.75 * t))
        bend = rng.normal(0, 0.12, 3) + np.array([0, 0.05 if level else 0.0, 0])
        d = d + bend
        d /= np.linalg.norm(d)
        p = p + d * (length / (n - 1))
    add_tube(pts, radii)
    if level >= 2:
        tips.append((pts[-1], length * 0.9))
        tips.append((pts[len(pts) // 2], length * 0.6))
        return
    kids = 4 if level == 0 else 3
    for i in range(kids):
        t = 0.45 + 0.5 * i / kids
        at = pts[int(t * (n - 1))]
        ang = rng.uniform(0, math.tau)
        out = np.array([math.cos(ang), 0, math.sin(ang)])
        nd = d * 0.55 + out * 0.75 + np.array([0, 0.35, 0])
        branch(at, nd, length * (0.62 if level == 0 else 0.55), radii[int(t * (n - 1))] * 0.6, level + 1)


# the trunk, branching from ~2.2 m
trunk_pts = [np.array([0.0, 0.0, 0.0])]
d = np.array([0.0, 1.0, 0.0])
for k in range(5):
    d = d + rng.normal(0, 0.06, 3)
    d[1] = abs(d[1])
    d /= np.linalg.norm(d)
    trunk_pts.append(trunk_pts[-1] + d * 0.55)
add_tube(trunk_pts, [0.2, 0.17, 0.15, 0.14, 0.13, 0.12])
top = trunk_pts[-1]
for i in range(5):
    ang = i / 5 * math.tau + rng.uniform(-0.3, 0.3)
    branch(top - np.array([0, 0.3 * (i % 2), 0]), [math.cos(ang) * 0.8, 1.0, math.sin(ang) * 0.8], 2.2, 0.1, 1)

# the crown: leaf cards round every tip, each turned its own way
lv, luv, lf = [], [], []
for p, s in tips:
    for _ in range(11):
        c = p + rng.normal(0, s * 0.4, 3)
        size = s * rng.uniform(0.6, 0.95) + 0.45
        nrm = rng.normal(0, 1, 3)
        nrm[1] = abs(nrm[1]) + 0.3
        nrm /= np.linalg.norm(nrm)
        a = np.cross(nrm, [0, 1, 0])
        if np.linalg.norm(a) < 1e-3:
            a = np.array([1.0, 0, 0])
        a /= np.linalg.norm(a)
        b = np.cross(nrm, a)
        o = len(lv)
        for (x, y), uv in (((-1, -1), (0, 0)), ((1, -1), (1, 0)), ((1, 1), (1, 1)), ((-1, 1), (0, 1))):
            lv.append(c + (a * x + b * y) * size / 2)
            luv.append(uv)
        lf.append([o, o + 1, o + 2, o + 3])

mesh("trunk", wood_v, wood_f, uvs=wood_uv, mat=material("bark", bark_texture(), 0.85))
leaf_mat = material("leaves", leaves_texture(), 0.55, alpha=True)
leaf_mat.use_backface_culling = False
mesh("crown", lv, lf, uvs=luv, mat=leaf_mat)
os.makedirs(OUT, exist_ok=True)
path = os.path.abspath(os.path.join(OUT, "tree-leafy.glb"))
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_image_format="AUTO")
print(f"wrote {path} ({os.path.getsize(path) / 1e3:.0f} KB), {len(lf)} leaf cards, {len(tips)} tips, {top[1]:.1f} m to the crown's start")

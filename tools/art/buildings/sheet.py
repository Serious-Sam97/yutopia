# Plan 110, phase 0 — the kit's sheet: every part, family by family, at one scale on a wall-coloured backing, a
# three-quarter orthographic view (so depth reads and sizes compare), its name under it. And the kit as a GLB.
#
#   blender -b --factory-startup -P tools/art/buildings/sheet.py -- [--out design/buildings/kit] [--only windows]
#        [--glb PATH]   (the kit as one GLB, a node a part: phase 1 writes it into the client)
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit  # noqa: E402
import parts  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../..")
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/buildings/kit")
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)

FAMILIES = ["windows", "dress", "doors", "shopfront", "entries", "edges", "roof", "backs", "signs", "gas", "garage"]
TITLES = {
    "windows": "Windows",
    "dress": "Window dress",
    "doors": "Doors",
    "shopfront": "Shopfronts",
    "entries": "Entries",
    "edges": "Edges and cornices",
    "roof": "Roof parts",
    "backs": "Backs and services",
    "signs": "Signs and lamps",
    "gas": "The gas station",
    "garage": "The parking garage",
}
STRETCH = {"x": 2.4, "y": 2.4}  # how long a stretched part is shown
FREE = {"roof", "gas", "garage", "backs"}  # families shown standing free (no wall behind), unless on a wall
ON_WALL = {"stair-bulkhead": False, "core-head": False, "fire-escape": True, "meter-electric": True, "meter-gas": True, "column-conc": False, "spandrel~x": True, "screen-mesh~x": True, "clock": True, "flagpole": False}
WALL = (0.47, 0.55, 0.60)  # (the sheet's wall: the skin role's colour, so trim reads)


def engine(scene):
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = e
            return
        except TypeError:
            pass


def studio(scene):
    engine(scene)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.76, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    scene.world = w
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(4)
    o = bpy.data.objects.new("sun", sun)
    o.rotation_euler = Euler((math.radians(52), math.radians(-8), math.radians(-35)))
    scene.collection.objects.link(o)
    try:
        scene.eevee.use_shadows = True
        scene.eevee.shadow_ray_count = 2
        scene.eevee.use_raytracing = True
        scene.eevee.taa_render_samples = 48
    except AttributeError:
        pass


def solid(name, col, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def plane(name, x0, x1, z0, z1, y, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], [], [(0, 3, 2, 1)])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def ground(name, x0, x1, y0, y1, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [], [(0, 1, 2, 3)])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def text(body, at, size, rot, col=(0.12, 0.12, 0.13)):
    c = bpy.data.curves.new("t", "FONT")
    c.body = body
    c.size = size
    c.align_x = "CENTER"
    o = bpy.data.objects.new("t", c)
    o.location = at
    o.rotation_euler = rot
    m = bpy.data.materials.new("tm")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = 1.0
    c.materials.append(m)
    bpy.context.collection.objects.link(o)
    return o


def stretch(name):
    sx = STRETCH["x"] if "~x" in name else 1.0
    sy = STRETCH["y"] if "~y" in name else 1.0
    return sx, sy


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
studio(scene)
parts.build()
made = bkit.objects()
print(f"{len(made)} parts")
for name, e in sorted(made.items()):
    print(f"  {name:24s} {bkit.tris(e):6d} tris")

if "--glb" in argv:
    size = bkit.export(argv[argv.index("--glb") + 1], made)
    print("kit.glb", size, "bytes")

wall_m = solid("wallback", WALL)
ground_m = solid("groundback", (0.55, 0.56, 0.55))
YAW, PITCH = math.radians(34), math.radians(16)

for fam in FAMILIES:
    if ONLY and fam not in ONLY:
        continue
    names = [n for n in parts.PARTS if parts.FAMILY[n] == fam]
    # lay them in rows (Blender's x along, z up; the part's front toward −y)
    x = 0.0
    row_y = 0.0
    rows = [[]]
    width_cap = 24.0
    sizes = {}
    for n in names:
        e = made[n]
        x0, x1, y0, y1, z0, z1 = bkit.bounds(e)
        sx, sy = stretch(n)
        w = (x1 - x0) * sx
        sizes[n] = (x0 * sx, x1 * sx, y0 * sy, y1 * sy, z0, z1)
        if rows[-1] and sum(sizes[m][1] - sizes[m][0] + 1.0 for m in rows[-1]) + w > width_cap:
            rows.append([])
        rows[-1].append(n)
    shown = set()
    zbase = 0.0
    for r in reversed(rows):
        h = max(sizes[n][3] for n in r) - min(0.0, min(sizes[n][2] for n in r))
        x = 0.0
        for n in r:
            x0, x1, y0, y1, z0, z1 = sizes[n]
            e = made[n]
            sx, sy = stretch(n)
            ox = x - x0
            base = zbase - min(0.0, y0) + 0.7
            e.location = (ox, 0, base)
            e.scale = (sx, 1, sy)
            shown.add(n)
            wallish = ON_WALL.get(n, fam not in FREE)
            if wallish:
                plane(f"back-{n}", ox + x0 - 0.35, ox + x1 + 0.35, base + y0 - 0.25, base + y1 + 0.3, max(0.0, -z0) + 0.005, wall_m)
            text(n, (ox + (x0 + x1) / 2, -max(z1, 0.3) - 0.2, base + min(0.0, y0) - 0.55), 0.24, Euler((math.radians(90) - PITCH * 0.0, 0, 0)))
            x += (x1 - x0) + 1.0
        zbase += h + 1.6
    for n, e in made.items():
        e.hide_render = n not in shown
        for c in e.children:
            c.hide_render = n not in shown
    # the camera: three-quarter, orthographic, fitted to everything shown (its labels and backings too)
    cd = bpy.data.cameras.new("c")
    cd.type = "ORTHO"
    cam = bpy.data.objects.new("c", cd)
    d = Vector((math.sin(YAW) * math.cos(PITCH), -math.cos(YAW) * math.cos(PITCH), math.sin(PITCH)))
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    for o in scene.objects:
        if o.type == "FONT":
            o.rotation_euler = cam.rotation_euler
    bpy.context.view_layer.update()
    R = cam.rotation_euler.to_matrix()
    right, up = R.col[0], R.col[1]
    us, vs, cs = [], [], []
    for o in scene.objects:
        if o.hide_render or o.type not in ("MESH", "FONT") or (o.type == "MESH" and o.parent and o.parent.name not in shown):
            continue
        if o.type == "FONT":
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        else:
            pts = [o.matrix_world @ v.co for v in o.data.vertices]
        for p in pts:
            us.append(p.dot(right))
            vs.append(p.dot(up))
            cs.append(p)
    aspect = 16 / 10
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    cd.ortho_scale = max(u1 - u0, (v1 - v0) * aspect) * 1.08
    mid = right * ((u0 + u1) / 2) + up * ((v0 + v1) / 2)
    cam.location = mid + d * 80
    cd.clip_end = 400
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 2000, 1250
    scene.render.filepath = os.path.join(OUT, f"{FAMILIES.index(fam):02d}-{fam}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", scene.render.filepath)
    # clear this family's backings, labels and camera
    for o in list(scene.objects):
        if o.type in ("FONT", "CAMERA") or o.name.startswith("back-"):
            bpy.data.objects.remove(o)
    for n in shown:
        made[n].location = (0, 0, -100)

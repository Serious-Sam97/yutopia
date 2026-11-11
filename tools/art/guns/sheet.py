# Plan 79, phase 0 — the blockouts' sheet: the five guns side on at one scale (a 10 cm bar), and
# three-quarter, in a grey studio.
#
#   blender -b --factory-startup -P tools/art/guns/sheet.py -- [--out design/guns]
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(os.path.dirname(__file__), "../../../design/guns")
os.makedirs(OUT, exist_ok=True)

NAMES = {"revolver": "Revolver — double-action .357, 4-inch", "shotgun": "Double-barrel — 12 gauge boxlock", "ak47": "AK-47 — 7.62", "sniper": "Sniper — bolt-action .308, scoped", "daybreak": "The Daybreak — ours"}


def engine(scene):
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = e
            return
        except TypeError:
            pass


def studio(scene):
    engine(scene)
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.33, 0.35, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.world = w
    for name, loc, energy, size in (("key", (-1.5, -2.5, 3.0), 380, 2.5), ("fill", (2.5, -2.0, 0.5), 110, 3.0), ("rim", (0.5, 3.0, 2.0), 300, 2.0)):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(o)


def text(body, at, size, color=(0.92, 0.92, 0.92)):
    c = bpy.data.curves.new("t", "FONT")
    c.body = body
    c.size = size
    o = bpy.data.objects.new("t", c)
    o.location = at
    o.rotation_euler = (math.pi / 2, 0, 0)
    m = bpy.data.materials.new("tm")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = 0.35
    c.materials.append(m)
    bpy.context.collection.objects.link(o)
    return o


def render(scene, cam, path, res):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
studio(scene)
built = {}
z = 0.0
for gid in ("revolver", "shotgun", "ak47", "sniper", "daybreak"):
    g = guns.BUILD[gid]()
    built[gid] = g
    z -= {"revolver": 0.2, "shotgun": 0.34, "ak47": 0.38, "sniper": 0.42, "daybreak": 0.42}[gid]
    g.root.location = (0, 0, z)
    length = g.points["muzzle"].x - g.points.get("butt", Vector((-0.04, 0, 0))).x
    text(f"{NAMES[gid]}   ·   {length * 100:.0f} cm", (-0.45, -0.1, z + (0.2 if gid in ("sniper", "daybreak") else 0.13)), 0.026)
# the 10 cm bar
bar = bpy.data.objects.new("bar", bpy.data.meshes.new("bar"))
bar.data.from_pydata([(0.55, -0.01, -0.06), (0.65, -0.01, -0.06), (0.65, -0.01, -0.055), (0.55, -0.01, -0.055)], [], [(0, 1, 2, 3)])
bar.data.materials.append(guns.mat("glow"))
scene.collection.objects.link(bar)
text("10 cm", (0.55, 0, -0.045), 0.022)

cd = bpy.data.cameras.new("side")
cd.type = "ORTHO"
cd.ortho_scale = 1.9
side = bpy.data.objects.new("side", cd)
side.location = (0.22, -3, -0.95)
side.rotation_euler = (math.pi / 2, 0, 0)
scene.collection.objects.link(side)
render(scene, side, os.path.join(OUT, "0-blockouts-side.png"), (1600, 1640))

# three-quarter: each gun on its own, from its right, a little above and ahead
for gid, g in built.items():
    for o in built.values():
        o.root.hide_render = o is not g
        for ch in o.root.children:
            ch.hide_render = o is not g or ch.name.endswith(".cut")
    for o in scene.objects:
        if o.type == "FONT" or o.name == "bar":
            o.hide_render = True
    back = g.points.get("butt", Vector((-0.045, 0, 0))).x
    c = g.root.location + Vector(((g.points["muzzle"].x + back) / 2, 0, 0.03))
    L = g.points["muzzle"].x - back
    pd = bpy.data.cameras.new("p")
    pd.lens = 50
    p = bpy.data.objects.new("p", pd)
    p.location = c + Vector((0.45, -1.0, 0.4)).normalized() * (L * 1.45 + 0.1)
    c = c + Vector((L * 0.08, 0, 0))  # (looked at a little toward the muzzle: perspective pushes it out)
    p.rotation_euler = (c - p.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(p)
    render(scene, p, os.path.join(OUT, f"0-blockout-{gid}.png"), (1200, 800))

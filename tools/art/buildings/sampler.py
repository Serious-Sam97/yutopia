# Plan 110, phase 0 — the kit in use: two fronts put together by hand from the parts (a five-bay colonial house,
# a two-storey brick shop on Main Street), so their sizes and how they meet are checked before the grammar (phase
# 1) lays them by code. The walls here are flat skins with their openings cut; the game's will be the material
# library's (clapboard, brick).
#
#   blender -b --factory-startup -P tools/art/buildings/sampler.py -- [--out design/buildings/kit]
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


def wall(role, x0, x1, y0, y1, holes, z=0.0):
    """A flat wall x0–x1, y0–y1 at z, its rectangular holes [(hx0, hx1, hy0, hy1)] cut (strips between their
    edges)."""
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    for a, b in zip(xs, xs[1:]):
        if b <= x0 or a >= x1:
            continue
        cut = sorted((h[2], h[3]) for h in holes if h[0] <= a and h[1] >= b)
        y = y0
        for c0, c1 in cut:
            if c0 > y:
                bkit.pane(role, a, b, y, c0, z)
            y = max(y, c1)
        if y < y1:
            bkit.pane(role, a, b, y, y1, z)


def gable(role, x0, x1, y, h, z):
    bkit.face(role, [(x0, y, z), (x1, y, z), ((x0 + x1) / 2, y + h, z)], (0, 0, 1))


# ── the scene: parts built once, set where they go as linked copies ─────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
parts.build()
made = bkit.objects()
for e in made.values():
    e.location = (0, 0, -100)
    for c in e.children:
        c.hide_render = True


def put(name, x, y, z=0.0, turn=0.0, sx=1.0, sy=1.0):
    """A copy of part `name` at (x, y, z) in the part frame of the scene (x along, y up, z out), turned about up."""
    e = made[name]
    root = bpy.data.objects.new(f"{name}@", None)
    scene.collection.objects.link(root)
    root.location = (x, -z, y)
    root.rotation_euler = (0, 0, turn)
    root.scale = (sx, 1, sy)
    for c in e.children:
        o = c.copy()
        o.hide_render = False
        o.parent = root
        o.matrix_parent_inverse.identity()
        scene.collection.objects.link(o)
    return root


bkit.BUFS.clear()
bkit.begin("scene")
bkit.at()

# ── a colonial: 12.5 × 8 m, two storeys (2.9 + 2.75), 38° side gable, five bays, centre door ─────────────────────
HX = -9.0  # its middle along the street
W, FL, G, U = 12.5, 0.75, 2.9, 2.75
x0, x1 = HX - W / 2, HX + W / 2
eave = FL + G + U
bays = [HX + (i - 2) * 2.35 for i in range(5)]
holes = []
for i, bx in enumerate(bays):
    if i != 2:
        holes.append((bx - 0.425, bx + 0.425, FL + 0.8, FL + 0.8 + 1.55))
    holes.append((bx - 0.425, bx + 0.425, FL + G + 0.55, FL + G + 0.55 + 1.55))
holes.append((HX - 0.53, HX + 0.53, FL, FL + 2.15 + 0.53))
wall("skin", x0, x1, FL, eave, holes)
bkit.box("stone", x0 - 0.05, x1 + 0.05, 0, FL, -8, 0.04)  # its foundation
for i, bx in enumerate(bays):
    if i != 2:
        put("win-dh66-cased", bx, FL + 0.8)
        for sg in (-1, 1):
            put("shutter-louvred~y", bx + sg * (0.425 + 0.1 + 0.23), FL + 0.8, 0.0, sy=1.55)
    put("win-dh66-cased", bx, FL + G + 0.55)
    for sg in (-1, 1):
        put("shutter-louvred~y", bx + sg * (0.425 + 0.1 + 0.23), FL + G + 0.55, 0.0, sy=1.55)
put("door-fan", HX, FL)
put("steps-wood~x", HX, 0.0, 0.1, sx=2.4)
for sg in (-1, 1):
    put("corner-board~y", x1 if sg > 0 else x0, FL, 0.0, 0.0 if sg < 0 else math.pi / 2, sy=eave - FL)
put("water-table~x", HX, FL, 0.0, sx=W)
put("cornice-box~x", HX, eave + 0.2, 0.0, sx=W + 0.6)
# the roof: a side gable at 38°, 8 m deep, eaves 0.45 out
D = 8.0
rise = (D / 2 + 0.45) * math.tan(math.radians(38))
bkit.quad("roof", (x0 - 0.35, eave + 0.3, 0.45), (x1 + 0.35, eave + 0.3, 0.45), (x1 + 0.35, eave + 0.3 + rise, -D / 2), (x0 - 0.35, eave + 0.3 + rise, -D / 2), (0, 1, 1))
for sg in (-1, 1):
    x = x1 if sg > 0 else x0
    bkit.face("skin", [(x, FL, 0), (x, FL, -D), (x, eave, -D), (x, eave + rise - 0.2, -D / 2), (x, eave, 0)], (sg, 0, 0))
put("chimney-brick", x1 - 0.8, eave + 0.3 + rise * 0.82, -D / 2 + 0.9)
put("return", x0 - 0.05, eave + 0.2, 0.0, math.pi / 2)

# ── a brick commercial block: 9 m front, a 4.4 m shop storey and a 3.5 m one over, a bracketed cornice ──────────
SX = 6.5
W2 = 9.0
a0, a1 = SX - W2 / 2, SX + W2 / 2
top = 4.4 + 3.5
# the shopfront: pilasters at the ends, bulkheads, plate glass, transoms, the recess left of middle, a fascia
pil = 0.42
inner0, inner1 = a0 + pil, a1 - pil
rec = 1.8
rx = SX - 1.6
bkit.box("brick", a0, inner0, 0, 4.4, -0.3, 0.0, skip=("back",))
bkit.box("brick", inner1, a1, 0, 4.4, -0.3, 0.0, skip=("back",))
for x in (a0 + pil / 2, a1 - pil / 2):
    put("shop-pilaster", x, 0.0, 0.0)
for s0, s1 in ((inner0, rx - rec / 2), (rx + rec / 2, inner1)):
    w = s1 - s0
    c = (s0 + s1) / 2
    put("shop-bulkhead~x", c, 0.0, 0.0, sx=w)
    put("shop-plate~x", c, 0.0, 0.0, sx=w)
    put("shop-transom~x", c, 0.0, 0.0, sx=w)
    n = max(1, round(w / 1.6))
    for k in range(1, n):
        put("shop-mullion", s0 + w * k / n, 0.0)
put("shop-recess", rx, 0.0, 0.0)
put("shop-fascia~x", SX, 3.6, 0.0, sx=W2 - 2 * pil)
put("awning-striped~x", SX + 0.3, 3.55, 0.0, sx=W2 - 2 * pil - 1.2)
put("sign-blade", a1 - 0.6, 5.2, 0.0)
put("gooseneck", SX - 2.0, 4.25, 0.0)
put("gooseneck", SX + 2.0, 4.25, 0.0)
# the upper storey: three tall hooded windows, a stone belt, the cornice and its brackets, a coping
uh = []
for i in range(3):
    x = SX + (i - 1) * 2.6
    uh.append((x - 0.425, x + 0.425, 4.4 + 0.75, 4.4 + 0.75 + 1.95))
wall("brick", a0, a1, 4.4, top + 0.9, uh)
for x0_, x1_, y0_, _ in uh:
    put("win-vic11-hood", (x0_ + x1_) / 2, y0_)
put("belt-course~x", SX, 4.4 - 0.05, 0.0, sx=W2 + 0.1)
put("cornice-bracketed~x", SX, top, 0.0, sx=W2 + 0.3)
for k in range(9):
    put("bracket", a0 + 0.2 + k * (W2 - 0.4) / 8, top, 0.0)
bkit.box("brick", a0, a1, 4.4, top + 0.9, -14, -0.3)  # its mass behind (the shop storey's set back for the recess)
bkit.box("brick", a0, a1, 0, 4.4, -14, -1.4)
put("coping~x", SX, top + 0.9, 0.0, sx=W2)
put("downpipe~y", a1 - 0.15, 0.0, 0.0, sy=top)
put("downpipe-shoe", a1 - 0.15, 0.0, 0.0)

# ── the sidewalk and the street ──────────────────────────────────────────────────────────────────────────────
bkit.box("concrete", -18, 14, -0.15, 0.0, -0.0, 4.5)
bkit.box("roof", -18, 14, -0.35, -0.15, 4.5, 14)
bkit.box("concrete", -18, 14, -0.2, -0.0, -16, 0.0)

scene_obj = bkit.objects()["scene"]

# ── light and camera ─────────────────────────────────────────────────────────────────────────────────────────
for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = e
        break
    except TypeError:
        pass
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.7, 0.85, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = w
sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 3.5
sun.angle = math.radians(2)
o = bpy.data.objects.new("sun", sun)
o.rotation_euler = Euler((math.radians(50), 0, math.radians(-40)))
scene.collection.objects.link(o)
try:
    scene.eevee.use_raytracing = True
    scene.eevee.taa_render_samples = 64
except AttributeError:
    pass
for name, eye, look, lens in (("street", (-2.0, -20.0, 3.2), (-1.5, 0, 4.0), 24), ("house", (-4.0, -13.0, 2.0), (-9.0, 0, 3.6), 30), ("shop", (11.5, -8.0, 2.4), (6.0, 0, 3.6), 28)):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cam = bpy.data.objects.new(name, cd)
    cam.location = eye
    cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 2000, 1250
    scene.render.filepath = os.path.join(OUT, f"sample-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", scene.render.filepath)

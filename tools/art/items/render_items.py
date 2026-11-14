# Plan 86 — the items as pictures of the things themselves (F2a): each rendered from its own 3D model, lamp-lit, on
# transparent black, for the inventory. The guns from the game's own GLBs (public/life/guns — plans 79–84); the
# rounds and things to use from their parts (the AK's magazine, the Daybreak's cell, the speedloader) or small
# models built here.
#   blender -b --factory-startup -P tools/art/items/render_items.py [-- --only revolver,aid] [-- --out <dir>]
#   blender -b --factory-startup -P tools/art/items/render_items.py -- --game
# Phase 0 (the mocks) renders them to design/inventory/items (PNG); `--game` (phase 1) to the game's
# apps/client/public/life/items (WEBP with its alpha, the sizes the panel and the HUD draw them at, twice over).
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "../../..")
GUNS = os.path.join(ROOT, "apps/client/public/life/guns")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
GAME = "--game" in argv
OUT = (
    argv[argv.index("--out") + 1]
    if "--out" in argv
    else os.path.join(ROOT, "apps/client/public/life/items" if GAME else "design/inventory/items")
)
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)

# (the game's: a gun wide in a pocket or on the belt, the rest square — twice the panel's largest, the tag's)
WIDE = (600, 250) if GAME else (720, 300)  # the guns
SQUARE = (256, 256) if GAME else (360, 360)  # the rest


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def mat(name, color, rough=0.5, metal=0.0, emit=0.0, alpha=1.0, trans=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    if trans:
        b.inputs["Transmission Weight"].default_value = trans
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        for attr, v in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, v)
            except (AttributeError, TypeError):
                pass
    return m


def put(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def cyl(r, h, at=(0, 0, 0), rot=(0, 0, 0), m=None, verts=32, depth_scale=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=at, rotation=rot, vertices=verts)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return put(o, m) if m else o


def cone(r1, r2, h, at=(0, 0, 0), rot=(0, 0, 0), m=None):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=h, location=at, rotation=rot, vertices=32)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return put(o, m) if m else o


def box(sx, sy, sz, at=(0, 0, 0), m=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.object
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return put(o, m) if m else o


def glb(name, keep=None):
    """A gun's GLB in; `keep`: only that node (and what's under it)."""
    bpy.ops.import_scene.gltf(filepath=os.path.join(GUNS, f"{name}.glb"))
    objs = list(bpy.context.selected_objects)
    if keep:
        k = bpy.data.objects.get(keep)
        assert k, keep
        under = {k, *k.children_recursive}
        for o in objs:
            if o not in under:
                bpy.data.objects.remove(o, do_unlink=True)
        # (the part at the origin, as it is on the gun)
        k.parent = None
        return [k, *k.children_recursive]
    return [o for o in objs if o.name in bpy.data.objects]


def frame(objs, res, turn=(0, 0, 0), pad=1.12):
    """A camera framing them (orthographic, from their right a little above), the lamp, the scene's output."""
    scn = bpy.context.scene
    root = bpy.data.objects.new("turn", None)
    scn.collection.objects.link(root)
    for o in objs:
        if o.parent is None or o.parent not in objs:
            o.parent = root
    root.rotation_euler = Euler(turn)
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        if o.type == "MESH":
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    mid = (lo + hi) / 2
    # (seen from −y — the gun's right side — and a little above)
    cam_d = bpy.data.cameras.new("cam")
    cam_d.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_d)
    scn.collection.objects.link(cam)
    tilt = math.radians(14)
    cam.location = mid + Vector((0, -3 * math.cos(tilt), 3 * math.sin(tilt)))
    cam.rotation_euler = Euler((math.pi / 2 - tilt, 0, 0))
    aspect = res[0] / res[1]
    w = hi.x - lo.x
    h = (hi.z - lo.z) * math.cos(tilt) + (hi.y - lo.y) * math.sin(tilt)
    cam_d.ortho_scale = max(w, h * aspect) * pad
    scn.camera = cam
    # the lamp: a warm key from above and ahead, a cool rim from behind, a faint fill
    def light(name, kind, energy, color, at, size=1.0):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = color
        if kind == "AREA":
            d.size = size
        o = bpy.data.objects.new(name, d)
        scn.collection.objects.link(o)
        o.location = mid + Vector(at)
        tr = o.constraints.new("TRACK_TO")
        tr.target = root
        tr.track_axis = "TRACK_NEGATIVE_Z"
        tr.up_axis = "UP_Y"

    s = max(w, hi.z - lo.z, 0.2)
    light("key", "AREA", 220 * s * s, (1.0, 0.86, 0.66), (-0.6 * s - 0.4, -1.2 * s - 0.6, 1.4 * s + 0.6), 0.8 * s + 0.3)
    light("rim", "AREA", 160 * s * s, (0.62, 0.74, 1.0), (0.8 * s + 0.4, 1.4 * s + 0.6, 0.8 * s + 0.3), 0.6 * s + 0.2)
    light("fill", "AREA", 40 * s * s, (0.9, 0.85, 0.8), (0.9 * s + 0.4, -1.4 * s - 0.6, -0.2), 1.2 * s + 0.4)
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.film_transparent = True
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scn.render.engine = e
            break
        except TypeError:
            pass
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "AgX - Medium High Contrast"
    scn.view_settings.exposure = 0.0
    w0 = bpy.data.worlds.new("w")
    w0.use_nodes = True
    # (something for the metal to show: a dim warm room round it — film transparent, so not seen)
    w0.node_tree.nodes["Background"].inputs["Color"].default_value = (0.34, 0.3, 0.26, 1)
    w0.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scn.world = w0


def render(name):
    s = bpy.context.scene
    f = s.render.image_settings
    if GAME:
        f.file_format = "WEBP"
        f.color_mode = "RGBA"
        f.quality = 86
    else:
        f.file_format = "PNG"
        f.color_mode = "RGBA"
    s.render.filepath = os.path.join(OUT, f"{name}.{'webp' if GAME else 'png'}")
    bpy.ops.render.render(write_still=True)
    print("wrote", s.render.filepath)


BRASS = lambda: mat("brass", (0.72, 0.5, 0.2), 0.3, 1.0)  # noqa: E731
LEAD = lambda: mat("lead", (0.45, 0.45, 0.47), 0.45, 0.8)  # noqa: E731
COPPER = lambda: mat("copper", (0.62, 0.3, 0.16), 0.32, 1.0)  # noqa: E731


def round_(at, r, case, tip, bullet_mat, along=(0, 0, 0)):
    """A cartridge standing on its base at `at`: its case, its bullet's ogive."""
    x, y, z = at
    cyl(r, case, (x, y, z + case / 2), m=BRASS())
    cyl(r * 1.06, r * 0.18, (x, y, z + r * 0.09), m=BRASS())
    cone(r * 0.96, r * 0.12, tip, (x, y, z + case + tip / 2), m=bullet_mat)


def item(name):
    if ONLY and name not in ONLY:
        return
    clear()
    res = SQUARE
    turn = (0, 0, 0)
    objs = []
    if name in ("revolver", "shotgun", "ak47", "sniper", "daybreak"):
        objs = glb(name)
        res = WIDE
    elif name == "r38":
        objs = glb("speedloader")
        # (the loader's six rounds' noses up, three-quarter)
        turn = (0, -math.pi / 2 + 0.25, 0.5)
    elif name == "r762":
        objs = glb("ak47", keep="magazine")
        turn = (0, 0, 0)
    elif name == "cell":
        objs = glb("daybreak", keep="cell")
        turn = (0.35, 0, 0)
    elif name == "r308":
        lead = COPPER()
        for i in range(3):
            round_((i * 0.019 - 0.019, i * 0.004, 0), 0.0062, 0.051, 0.03, lead)
        objs = list(bpy.data.objects)
        turn = (math.radians(90), 0, math.radians(-12))
    elif name == "shell":
        red = mat("hull", (0.55, 0.06, 0.05), 0.55)
        for i in range(2):
            x = i * 0.026 - 0.013
            cyl(0.0105, 0.058, (x, 0, 0.029 + 0.012), m=red)
            cyl(0.0108, 0.016, (x, 0, 0.008), m=BRASS())
            cyl(0.0122, 0.003, (x, 0, 0.0015), m=BRASS())
        objs = list(bpy.data.objects)
        turn = (math.radians(-8), 0, 0)
    elif name == "flare":
        red = mat("flare", (0.62, 0.07, 0.05), 0.6)
        black = mat("cap", (0.05, 0.05, 0.055), 0.5)
        tape = mat("tape", (0.85, 0.7, 0.15), 0.6)
        cyl(0.016, 0.21, (0, 0, 0), m=red)
        cyl(0.0175, 0.045, (0, 0, 0.12), m=black)
        cyl(0.0163, 0.012, (0, 0, 0.02), m=tape)
        cyl(0.0165, 0.012, (0, 0, -0.06), m=tape)
        objs = list(bpy.data.objects)
        turn = (0, math.radians(62), 0)
    elif name == "battery":
        body = mat("cell-body", (0.06, 0.065, 0.07), 0.4, 0.3)
        band = mat("cell-band", (0.85, 0.55, 0.12), 0.45, 0.2)
        steel = mat("steel", (0.7, 0.7, 0.72), 0.25, 1.0)
        cyl(0.017, 0.061, (0, 0, 0), m=body)
        cyl(0.01702, 0.02, (0, 0, 0.012), m=band)
        cyl(0.0172, 0.002, (0, 0, -0.0305), m=steel)
        cyl(0.0055, 0.004, (0, 0, 0.0325), m=steel)
        objs = list(bpy.data.objects)
        turn = (0, math.radians(70), math.radians(-20))
    elif name == "aid":
        tin = mat("tin", (0.86, 0.84, 0.79), 0.35, 0.2)
        red = mat("cross", (0.7, 0.07, 0.06), 0.5)
        steel = mat("latch", (0.6, 0.6, 0.62), 0.3, 1.0)
        box(0.2, 0.065, 0.14, (0, 0, 0), m=tin, bevel=0.008)
        box(0.012, 0.004, 0.08, (0, -0.0345, 0), m=red)
        box(0.08, 0.004, 0.012, (0, -0.0345, 0), m=red)
        box(0.07, 0.03, 0.01, (0, 0, 0.075), m=steel, bevel=0.003)
        objs = list(bpy.data.objects)
        turn = (0, 0, math.radians(-18))
    elif name == "fuse":
        glass = mat("glass", (0.85, 0.92, 0.96), 0.05, 0.0, alpha=0.35, trans=0.9)
        steel = mat("cap", (0.72, 0.72, 0.74), 0.25, 1.0)
        wire = mat("wire", (1.0, 0.75, 0.35), 0.4, 0.0, emit=0.6)
        cyl(0.0075, 0.042, (0, 0, 0), m=glass)
        cyl(0.0082, 0.009, (0, 0, 0.0215), m=steel)
        cyl(0.0082, 0.009, (0, 0, -0.0215), m=steel)
        cyl(0.0007, 0.04, (0, 0, 0), m=wire, verts=8)
        objs = list(bpy.data.objects)
        turn = (0, math.radians(90), math.radians(-25))
    elif name == "torch":
        # (plan 87) the torch, as the game's prop (chars/props.ts `torch`): the tail cap, a grip cut with six grooves,
        # the body flaring into the head, a chrome bezel, the lens and its LED — 22 cm, its lens up
        alu = mat("alu", (0.075, 0.078, 0.085), 0.35, 0.85)
        rubber = mat("rubber", (0.03, 0.03, 0.032), 0.8)
        chrome = mat("chrome", (0.85, 0.86, 0.88), 0.12, 1.0)
        lens = mat("lens", (1.0, 0.95, 0.82), 0.05, 0.0, emit=1.6)
        r = 0.016
        cyl(r * 0.8, 0.012, (0, 0, -0.109), m=rubber)
        cyl(r * 1.0, 0.086, (0, 0, -0.061), m=alu)
        for i in range(6):
            cyl(r * 1.05, 0.007, (0, 0, -0.0905 + i * 0.012), m=alu)
        cyl(r, 0.048, (0, 0, 0.006), m=alu)
        cone(r, r * 1.6, 0.046, (0, 0, 0.053), m=alu)
        cyl(r * 1.72, 0.022, (0, 0, 0.087), m=chrome)
        cyl(r * 1.45, 0.002, (0, 0, 0.0985), m=lens)
        box(0.006, 0.01, 0.014, (0, -r * 1.02, 0.0), m=rubber, bevel=0.002)
        box(0.004, 0.003, 0.05, (0, r * 1.12, -0.07), m=chrome, bevel=0.001)
        objs = list(bpy.data.objects)
        turn = (0, math.radians(58), math.radians(-14))
    frame(objs, res, turn)
    render(name)


for n in ("revolver", "shotgun", "ak47", "sniper", "daybreak", "r38", "shell", "r762", "r308", "cell", "flare",
          "battery", "aid", "fuse", "torch"):
    item(n)

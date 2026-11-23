# Plan 115 (docs/plan/115-the-strike-park-again.md, arc G phase 60) — the Strike Park's prop kit, our own:
#   container  a 20 ft shipping container (6.06 × 2.44 × 2.59): corrugated sides and roof, a door end with its four
#              locking rods and hinges, corner castings; its paint by role (tinted per box in the game)
#   crate      a wooden crate (1 × 1 × 1, scaled): a plank face, its frame and a brace on each side
#   barrel     an oil drum (0.58 Ø × 0.88): its rolling hoops, its lid's rim and bung
#   pallet     a wooden pallet (1.2 × 0.144 × 0.8)
#   sandbags   a low wall of sandbags (2 × 0.7 × 0.6): three courses, staggered
#   barrier    a concrete road barrier (2 × 0.82 × 0.6): its Jersey profile, a lifting eye
# (plan 115, the last stretch) the relay hut, and each map's showpiece standing outside its play, over its walls:
#   relayhut   a trackside relay hut (3 × 2.8 × 3): its door, vent louvres, the cable trough, a roof slab
#   chimney    the sawmill's brick stack (24 m): a plinth, the tapering stack, its steel bands and ladder
#   watertower a timber water tower (13 m): four braced legs, the stave tank and its hoops, a conical roof
#   portainer  the freight yard's gantry crane (24 m): portal legs, the boom out over the yard, its house, trolley
#   signalbox  a two-storey signal box: brick base, a timber operating floor glazed all round, a hipped roof
#   pylon      a chairlift pylon (12 m): its tube, crossarm, sheave trains and two chairs hung
#   towercrane a tower crane (32 m): the lattice mast, jib and counter-jib, counterweights, cab, hook
#   lighthouse a banded lighthouse (17 m): its tapering tower, gallery, the lantern, its cap
#   watchtower the range's timber watchtower (9 m): braced legs, a railed cabin, ladder, a windsock
# Each a node at its own origin (its footprint's middle on the floor), its meshes by role; three's frame (y up):
# glTF's y-up export turns Blender's z-up back. Run: blender -b --python tools/art/strike/props.py
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "../../../apps/client/public/life/strike/props.glb"))

ROLES = {
    "paint": (0.55, 0.30, 0.20, 0.7, 0.2),
    "steel": (0.16, 0.17, 0.18, 0.5, 0.6),
    "wood": (0.55, 0.40, 0.24, 0.8, 0.0),
    "wooddark": (0.33, 0.23, 0.13, 0.85, 0.0),
    "drum": (0.20, 0.33, 0.45, 0.55, 0.4),
    "burlap": (0.60, 0.53, 0.38, 0.95, 0.0),
    "concrete": (0.64, 0.63, 0.60, 0.9, 0.0),
    "rust": (0.42, 0.20, 0.12, 0.8, 0.3),
    "bark": (0.30, 0.22, 0.15, 0.95, 0.0),
    "cut": (0.78, 0.62, 0.40, 0.85, 0.0),
    "glass": (0.12, 0.15, 0.18, 0.1, 0.5),
    "rubber": (0.06, 0.06, 0.06, 0.9, 0.0),
    "hull": (0.80, 0.78, 0.72, 0.6, 0.0),
    "brick": (0.45, 0.22, 0.15, 0.9, 0.0),
    "crane": (0.85, 0.62, 0.12, 0.55, 0.3),
    "white": (0.88, 0.86, 0.80, 0.7, 0.0),
    "red": (0.62, 0.15, 0.12, 0.6, 0.0),
    "lamp": (1.0, 0.86, 0.55, 0.3, 0.0),
}


def material(role):
    m = bpy.data.materials.get(role)
    if m:
        return m
    m = bpy.data.materials.new(role)
    m.use_nodes = True
    r, g, b, rough, metal = ROLES[role]
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def box(name, role, x0, y0, z0, x1, y1, z1, parent):
    """A box in the part's frame (three's: x, y up, z) — made in Blender's (x, -z, y)."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = ((x1 - x0), (z1 - z0), (y1 - y0))
    o.location = ((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material(role))
    o.parent = parent
    return o


def cyl(name, role, x, y0, z, r, h, parent, verts=20):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.location = (x, -z, y0 + h / 2)
    o.data.materials.append(material(role))
    o.parent = parent
    return o


def part(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


def join_by_role(root):
    """The part's meshes joined into one a role (fewer draws)."""
    by = {}
    for o in list(root.children):
        if o.type != "MESH":
            continue
        by.setdefault(o.data.materials[0].name, []).append(o)
    for role, objs in by.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        objs[0].name = f"{root.name}.{role}"


def container():
    p = part("container")
    L, W, H = 6.06, 2.44, 2.59
    x0, x1 = -L / 2, L / 2
    z0, z1 = -W / 2, W / 2
    # the floor and the frame rails
    box("floor", "steel", x0, 0, z0, x1, 0.16, z1, p)
    for z in (z0, z1 - 0.12):
        box("rail", "steel", x0, 0.0, z, x1, 0.16, z + 0.12, p)
        box("toprail", "paint", x0, H - 0.14, z, x1, H, z + 0.12, p)
    # the corrugated sides: ribs out and in
    n = int(L / 0.28)
    for i in range(n):
        xa = x0 + 0.08 + i * (L - 0.16) / n
        xb = xa + (L - 0.16) / n * 0.55
        for side in (-1, 1):
            zz = z1 if side > 0 else z0
            box("rib", "paint", xa, 0.16, zz - 0.035 if side > 0 else zz - 0.005, xb, H - 0.14, zz + 0.005 if side > 0 else zz + 0.035, p)
        # the panel behind the ribs
    box("sidein", "paint", x0 + 0.05, 0.16, z0 + 0.02, x1 - 0.05, H - 0.14, z1 - 0.02, p)
    # the roof's shallow corrugation
    for i in range(int(L / 0.6)):
        xa = x0 + 0.1 + i * 0.6
        box("roofrib", "paint", xa, H - 0.02, z0 + 0.08, xa + 0.32, H + 0.02, z1 - 0.08, p)
    # the door end (+x): two leaves, four locking rods with their cams and handles, hinges
    box("door", "paint", x1 - 0.04, 0.16, z0 + 0.06, x1 + 0.01, H - 0.14, z1 - 0.06, p)
    box("seam", "steel", x1, 0.18, -0.01, x1 + 0.02, H - 0.16, 0.01, p)
    for zz in (-0.86, -0.36, 0.36, 0.86):
        box("rod", "steel", x1 + 0.01, 0.12, zz - 0.022, x1 + 0.06, H - 0.1, zz + 0.022, p)
        box("handle", "steel", x1 + 0.03, 1.0, zz - 0.02, x1 + 0.09, 1.08, zz + 0.2, p)
    for zz in (z0 + 0.04, z1 - 0.1):
        for yy in (0.5, 1.3, 2.1):
            box("hinge", "steel", x1 - 0.02, yy, zz, x1 + 0.05, yy + 0.14, zz + 0.06, p)
    # the corner castings
    for xx in (x0, x1 - 0.18):
        for zz in (z0, z1 - 0.16):
            for yy in (0.0, H - 0.12):
                box("corner", "steel", xx, yy, zz, xx + 0.18, yy + 0.12, zz + 0.16, p)
    join_by_role(p)


def crate():
    p = part("crate")
    s = 0.5
    box("body", "wood", -s + 0.04, 0.04, -s + 0.04, s - 0.04, 1 - 0.04, s - 0.04, p)
    # the frame on each face's edges
    t = 0.08
    for (ax, az) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        box("post", "wooddark", ax * s - (t if ax > 0 else 0), 0, az * s - (t if az > 0 else 0), ax * s + (0 if ax > 0 else t), 1, az * s + (0 if az > 0 else t), p)
    for yy in (0, 1 - t):
        box("bx", "wooddark", -s, yy, -s, s, yy + t, -s + t, p)
        box("bx", "wooddark", -s, yy, s - t, s, yy + t, s, p)
        box("bz", "wooddark", -s, yy, -s, -s + t, yy + t, s, p)
        box("bz", "wooddark", s - t, yy, -s, s, yy + t, s, p)
    # a brace across each side
    for side in (-1, 1):
        o = box("brace", "wooddark", -0.62, 0.46, side * (s + 0.01) - 0.03, 0.62, 0.54, side * (s + 0.01) + 0.03, p)
        o.rotation_euler = (0, math.radians(-40), 0)
        o2 = box("brace", "wooddark", side * (s + 0.01) - 0.03, 0.46, -0.62, side * (s + 0.01) + 0.03, 0.54, 0.62, p)
        o2.rotation_euler = (math.radians(40), 0, 0)
    join_by_role(p)


def barrel():
    p = part("barrel")
    cyl("drum", "drum", 0, 0, 0, 0.29, 0.88, p, 24)
    for yy in (0.02, 0.29, 0.58, 0.84):
        cyl("hoop", "steel", 0, yy, 0, 0.3, 0.035, p, 24)
    cyl("bung", "steel", 0.12, 0.88, 0.0, 0.03, 0.02, p, 10)
    join_by_role(p)


def pallet():
    p = part("pallet")
    for i in range(7):
        x = -0.6 + 0.04 + i * (1.12 / 6) - 0.05
        box("board", "wood", x, 0.122, -0.4, x + 0.1, 0.144, 0.4, p)
    for z in (-0.37, -0.02, 0.33):
        box("stringer", "wooddark", -0.6, 0.0, z, 0.6, 0.122, z + 0.07, p)
    join_by_role(p)


def sandbags():
    p = part("sandbags")
    for row in range(3):
        n = 5 if row % 2 == 0 else 4
        off = 0 if row % 2 == 0 else 0.2
        for i in range(n):
            x = -1.0 + off + i * 0.4 + 0.2
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=12, ring_count=8)
            o = bpy.context.active_object
            o.scale = (0.21, 0.29, 0.12)
            o.location = (x, 0, 0.11 + row * 0.21)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            o.data.materials.append(material("burlap"))
            o.parent = p
    join_by_role(p)


def barrier():
    p = part("barrier")
    # the Jersey profile: a wide foot, a sloped middle, a narrow top (three stacked boxes, bevelled by steps)
    box("foot", "concrete", -1.0, 0.0, -0.3, 1.0, 0.08, 0.3, p)
    box("slope", "concrete", -1.0, 0.08, -0.24, 1.0, 0.32, 0.24, p)
    box("mid", "concrete", -1.0, 0.32, -0.15, 1.0, 0.6, 0.15, p)
    box("top", "concrete", -1.0, 0.6, -0.1, 1.0, 0.82, 0.1, p)
    box("eye", "steel", -0.05, 0.82, -0.03, 0.05, 0.9, 0.03, p)
    join_by_role(p)


def bogie(p, x):
    """A pair of wheelsets under a car at x (its side frames, four wheels)."""
    for xx in (x - 0.9, x + 0.9):
        for z in (-0.72, 0.72):
            o = cyl("wheel", "steel", 0, 0.0, 0, 0.42, 0.12, p, 16)
            o.rotation_euler = (math.radians(90), 0, 0)
            o.location = (xx, -z, 0.42)
    box("sideframe", "steel", x - 1.4, 0.3, -0.85, x + 1.4, 0.62, -0.72, p)
    box("sideframe", "steel", x - 1.4, 0.3, 0.72, x + 1.4, 0.62, 0.85, p)


def underframe(p, L):
    box("frame", "steel", -L / 2, 0.85, -1.4, L / 2, 1.05, 1.4, p)
    bogie(p, -L / 2 + 2.2)
    bogie(p, L / 2 - 2.2)
    for x in (-L / 2 - 0.25, L / 2):
        for z in (-0.9, 0.9):
            cyl("buffer", "steel", x + 0.125, 0.85, z, 0.16, 0.25, p, 12).rotation_euler = (0, math.radians(90), 0)


def boxcar():
    """A boxcar (14 × 3.8 × 3): its ribbed sides, a sliding door each side, the roof's walk."""
    p = part("boxcar")
    L = 14.0
    underframe(p, L)
    box("body", "rust", -L / 2 + 0.1, 1.05, -1.4, L / 2 - 0.1, 3.7, 1.4, p)
    for i in range(15):
        x = -L / 2 + 0.5 + i * (L - 1) / 14
        for z in (-1.43, 1.43):
            box("rib", "rust", x - 0.05, 1.05, z - 0.03, x + 0.05, 3.7, z + 0.03, p)
    for z in (-1.46, 1.46):
        box("door", "rust", -1.3, 1.15, z - 0.04, 1.3, 3.55, z + 0.04, p)
        box("rail", "steel", -2.8, 3.55, z - 0.06, 2.8, 3.62, z + 0.06, p)
        box("handle", "steel", 1.1, 2.0, z - 0.08, 1.2, 2.6, z + 0.08, p)
    box("roof", "steel", -L / 2, 3.7, -1.45, L / 2, 3.8, 1.45, p)
    box("walk", "wooddark", -L / 2, 3.8, -0.25, L / 2, 3.84, 0.25, p)
    join_by_role(p)


def flatcar():
    p = part("flatcar")
    L = 14.0
    underframe(p, L)
    box("deck", "wooddark", -L / 2, 1.05, -1.45, L / 2, 1.1, 1.45, p)
    for i in range(8):
        x = -L / 2 + 0.6 + i * (L - 1.2) / 7
        for z in (-1.42, 1.42):
            box("pocket", "steel", x - 0.08, 0.9, z - 0.06, x + 0.08, 1.12, z + 0.06, p)
    join_by_role(p)


def tanker():
    p = part("tanker")
    L = 14.0
    underframe(p, L)
    o = cyl("tank", "steel", 0, 0, 0, 1.3, L - 1.0, p, 28)
    o.rotation_euler = (0, math.radians(90), 0)
    o.location = (0, 0, 1.05 + 1.3)
    for x in (-L / 2 + 0.5, L / 2 - 0.5):
        e = cyl("end", "steel", 0, 0, 0, 1.2, 0.2, p, 28)
        e.rotation_euler = (0, math.radians(90), 0)
        e.location = (x, 0, 2.35)
    cyl("dome", "steel", 0, 3.55, 0, 0.45, 0.35, p, 16)
    box("ladder", "galv" if "galv" in ROLES else "steel", 0.6, 1.1, 1.25, 0.7, 3.6, 1.35, p)
    box("walk", "wooddark", -1.4, 3.6, -0.6, 1.4, 3.65, 0.6, p)
    join_by_role(p)


def brakevan():
    p = part("brakevan")
    L = 7.8
    box("frame", "steel", -L / 2, 0.85, -1.4, L / 2, 1.05, 1.4, p)
    bogie(p, 0)
    box("cabin", "rust", -L / 2 + 1.0, 1.05, -1.35, L / 2 - 1.0, 3.5, 1.35, p)
    box("roof", "steel", -L / 2 + 0.8, 3.5, -1.45, L / 2 - 0.8, 3.62, 1.45, p)
    for z in (-1.37, 1.37):
        for x in (-1.6, 0.0, 1.6):
            box("window", "glass", x - 0.4, 2.2, z - 0.02, x + 0.4, 2.9, z + 0.02, p)
    for x in (-L / 2, L / 2 - 1.0):
        box("veranda", "wooddark", x, 1.05, -1.4, x + 1.0, 1.1, 1.4, p)
        box("railing", "steel", x, 1.1, -1.4, x + 1.0, 2.1, -1.35, p)
        box("railing", "steel", x, 1.1, 1.35, x + 1.0, 2.1, 1.4, p)
    box("chimney", "steel", 1.8, 3.6, 0.4, 2.0, 4.0, 0.6, p)
    join_by_role(p)


def bufferstop():
    p = part("bufferstop")
    box("block", "concrete", -1.0, 0.0, -1.5, 1.0, 1.0, 1.5, p)
    box("beam", "wooddark", -1.05, 0.7, -1.4, -0.85, 1.1, 1.4, p)
    for z in (-0.9, 0.9):
        o = cyl("buffer", "rust", 0, 0, 0, 0.2, 0.3, p, 12)
        o.rotation_euler = (0, math.radians(90), 0)
        o.location = (-1.2, -z, 0.9)
    join_by_role(p)


def logs():
    """A log stack (6 × 2.2 × 2.4): logs along x in three tiers, their cut ends showing."""
    p = part("logs")
    r = 0.36
    for tier, n in enumerate((3, 2, 1)):
        for i in range(n):
            z = -0.75 + i * 0.75 + tier * 0.375
            y = r + tier * (r * 1.7)
            o = cyl("log", "bark", 0, 0, 0, r, 5.8, p, 14)
            o.rotation_euler = (0, math.radians(90), 0)
            o.location = (0, -z, y)
            for x in (-2.91, 2.91):
                e = cyl("end", "cut", 0, 0, 0, r - 0.02, 0.02, p, 14)
                e.rotation_euler = (0, math.radians(90), 0)
                e.location = (x, -z, y)
    join_by_role(p)


def sacks():
    p = part("sacks")
    for row in range(2):
        for i in range(5 - row):
            for k in range(2):
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=10, ring_count=8)
                o = bpy.context.active_object
                o.scale = (0.4, 0.45, 0.3)
                o.location = (-1.6 + i * 0.8 + row * 0.4, -0.5 + k * 1.0, 0.3 + row * 0.55)
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                o.data.materials.append(material("burlap"))
                o.parent = p
    join_by_role(p)


def boat():
    """A rowboat (6 × 0.9 × 1.6): its hull narrowing to the bow, the thwarts, the gunwale."""
    p = part("boat")
    for i in range(6):
        x = -2.7 + i * 1.0
        w = 0.8 * (1 - (abs(x) / 3.2) ** 2) + 0.15
        box("hull", "hull", x - 0.5, 0.05, -w, x + 0.5, 0.75, w, p)
        box("gunwale", "wooddark", x - 0.5, 0.75, -w - 0.03, x + 0.5, 0.82, -w + 0.05, p)
        box("gunwale", "wooddark", x - 0.5, 0.75, w - 0.05, x + 0.5, 0.82, w + 0.03, p)
    for x in (-1.2, 0.2, 1.4):
        box("thwart", "wood", x - 0.15, 0.55, -0.7, x + 0.15, 0.6, 0.7, p)
    box("keel", "wooddark", -3.0, 0.0, -0.05, 3.0, 0.08, 0.05, p)
    join_by_role(p)


def woodpile():
    """Split firewood stacked between end posts (8 × 1.7 × 2)."""
    p = part("woodpile")
    for x in (-3.9, 3.9):
        box("post", "wooddark", x - 0.08, 0, -0.9, x + 0.08, 1.7, 0.9, p)
    for row in range(5):
        for i in range(18):
            x = -3.6 + i * 0.42 + (0.2 if row % 2 else 0)
            if x > 3.7:
                continue
            o = cyl("split", "bark", 0, 0, 0, 0.16, 1.8, p, 6)
            o.rotation_euler = (math.radians(90), 0, 0)
            o.location = (x, 0, 0.18 + row * 0.31)
    box("roof", "steel", -4.1, 1.75, -1.05, 4.1, 1.82, 1.05, p)
    join_by_role(p)


def van():
    """A box van (6 × 2.3 × 2.4): its cab, the box body, wheels."""
    p = part("van")
    box("body", "hull", -3.0, 0.5, -1.2, 1.4, 2.3, 1.2, p)
    box("cab", "paint", 1.4, 0.5, -1.15, 3.0, 1.9, 1.15, p)
    box("windscreen", "glass", 2.6, 1.2, -1.0, 3.02, 1.8, 1.0, p)
    for x in (-2.0, 2.2):
        for z in (-1.1, 1.1):
            o = cyl("tyre", "rubber", 0, 0, 0, 0.42, 0.3, p, 16)
            o.rotation_euler = (math.radians(90), 0, 0)
            o.location = (x, -z, 0.42)
    join_by_role(p)


def skip():
    """A builder's skip (4 × 1.4 × 2): its sloped ends, its lifting lugs."""
    p = part("skip")
    box("bin", "paint", -1.6, 0.1, -1.0, 1.6, 1.4, 1.0, p)
    box("lip", "steel", -2.0, 1.3, -1.02, 2.0, 1.4, 1.02, p)
    for x in (-1.85, 1.85):
        box("end", "paint", x - 0.2, 0.4, -1.0, x + 0.2, 1.3, 1.0, p)
    box("rubble", "concrete", -1.4, 1.0, -0.8, 1.4, 1.35, 0.8, p)
    join_by_role(p)


def barricade():
    """A plank barricade (6.3 × 1.3 × 0.3): posts and horizontal boards, a few nailed askew."""
    p = part("barricade")
    for x in (-3.0, -1.0, 1.0, 3.0):
        box("post", "wooddark", x - 0.07, 0, -0.07, x + 0.07, 1.3, 0.07, p)
    for i, y in enumerate((0.25, 0.6, 0.95)):
        o = box("board", "wood", -3.15, y, -0.02, 3.15, y + 0.22, 0.05, p)
        if i == 1:
            o.rotation_euler = (math.radians(2.5), 0, 0)
    join_by_role(p)


def cone(name, role, x, y0, z, r0, r1, h, parent, verts=24):
    bpy.ops.mesh.primitive_cone_add(radius1=r0, radius2=r1, depth=h, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.location = (x, -z, y0 + h / 2)
    o.data.materials.append(material(role))
    o.parent = parent
    return o


def beam(name, role, a, b, t, parent):
    """A square bar of side t from point a to point b (three's frame)."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (t, t, L)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Blender frame: (x, -z, y); the bar's z axis onto the direction
    import mathutils

    d = mathutils.Vector((dx, -dz, dy)).normalized()
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = mathutils.Vector((0, 0, 1)).rotation_difference(d)
    o.location = ((ax + bx) / 2, -(az + bz) / 2, (ay + by) / 2)
    o.data.materials.append(material(role))
    o.parent = parent
    return o


def relayhut():
    p = part("relayhut")
    box("walls", "concrete", -1.5, 0, -1.5, 1.5, 2.6, 1.5, p)
    box("roof", "concrete", -1.65, 2.6, -1.65, 1.65, 2.8, 1.65, p)
    box("door", "steel", -0.5, 0.05, 1.5, 0.5, 2.1, 1.56, p)
    box("plate", "red", 0.62, 1.5, 1.5, 0.98, 1.8, 1.55, p)
    for i in range(5):
        box("louvre", "steel", -1.56, 1.2 + i * 0.16, -0.6, -1.5, 1.27 + i * 0.16, 0.6, p)
    box("trough", "concrete", 1.5, 0, -1.4, 1.9, 0.35, 1.4, p)
    box("plinth", "concrete", -1.55, 0, -1.55, 1.55, 0.12, 1.55, p)
    join_by_role(p)


def chimney():
    p = part("chimney")
    box("plinth", "brick", -2.4, 0, -2.4, 2.4, 3.5, 2.4, p)
    box("cornice", "concrete", -2.6, 3.5, -2.6, 2.6, 3.8, 2.6, p)
    cone("stack", "brick", 0, 3.8, 0, 1.7, 1.05, 20.2, p, 28)
    cyl("crown", "brick", 0, 23.6, 0, 1.25, 0.6, p, 28)
    for y in (7, 11, 15, 19, 23):
        r = 1.7 - (y - 3.8) / 20.2 * 0.65 + 0.04
        cyl("band", "steel", 0, y, 0, r, 0.18, p, 28)
    for i in range(36):
        y = 4.2 + i * 0.55
        r = 1.7 - (y - 3.8) / 20.2 * 0.65
        box("rung", "steel", -0.25, y, -r - 0.22, 0.25, y + 0.05, -r - 0.17, p)
    box("door", "wooddark", -0.6, 0, -2.42, 0.6, 2.2, -2.38, p)
    join_by_role(p)


def watertower():
    p = part("watertower")
    H = 8.5
    for x in (-1.8, 1.8):
        for z in (-1.8, 1.8):
            beam("leg", "wooddark", (x * 1.15, 0, z * 1.15), (x * 0.85, H, z * 0.85), 0.3, p)
    for y0, y1 in ((0.5, 4.2), (4.2, 8.0)):
        f0 = 1.15 - y0 / H * 0.3
        f1 = 1.15 - y1 / H * 0.3
        for (ax, az), (bx, bz) in (((-1.8, -1.8), (1.8, -1.8)), ((1.8, -1.8), (1.8, 1.8)), ((1.8, 1.8), (-1.8, 1.8)), ((-1.8, 1.8), (-1.8, -1.8))):
            beam("brace", "wooddark", (ax * f0, y0, az * f0), (bx * f1, y1, bz * f1), 0.14, p)
            beam("brace", "wooddark", (bx * f0, y0, bz * f0), (ax * f1, y1, az * f1), 0.14, p)
    box("deck", "wood", -2.2, H, -2.2, 2.2, H + 0.2, 2.2, p)
    cyl("tank", "wood", 0, H + 0.2, 0, 2.3, 3.6, p, 32)
    for y in (H + 0.6, H + 1.5, H + 2.4, H + 3.3):
        cyl("hoop", "steel", 0, y, 0, 2.34, 0.08, p, 32)
    cone("roof", "wooddark", 0, H + 3.8, 0, 2.6, 0.1, 1.7, p, 32)
    beam("spout", "steel", (2.3, H + 0.8, 0), (3.6, H - 1.5, 0), 0.25, p)
    join_by_role(p)


def portainer():
    p = part("portainer")
    W, D, H = 16.0, 12.0, 22.0
    for x in (-W / 2, W / 2):
        for z in (-D / 2, D / 2):
            box("leg", "crane", x - 0.6, 0, z - 0.6, x + 0.6, H, z + 0.6, p)
            box("bogie", "steel", x - 1.2, 0, z - 0.9, x + 1.2, 1.0, z + 0.9, p)
        beam("brace", "crane", (x, 2, -D / 2), (x, H - 3, D / 2), 0.5, p)
    for z in (-D / 2, D / 2):
        box("portal", "crane", -W / 2 - 0.6, H - 2, z - 0.7, W / 2 + 0.6, H, z + 0.7, p)
        box("sill", "crane", -W / 2 - 0.6, 8, z - 0.5, W / 2 + 0.6, 9, z + 0.5, p)
    box("boom", "crane", -W / 2 - 14, H, -1.6, W / 2 + 22, H + 1.6, 1.6, p)
    box("house", "white", -W / 2 - 13, H + 1.6, -3, -W / 2 - 4, H + 5.5, 3, p)
    box("trolley", "steel", 6, H - 1.2, -1.8, 9, H, 1.8, p)
    box("cab", "glass", 6.6, H - 3.6, -1.2, 8.4, H - 1.2, 1.2, p)
    box("spreader", "crane", 3.5, H - 12, -1.3, 11.5, H - 11.4, 1.3, p)
    for x in (6.5, 8.5):
        beam("rope", "steel", (x, H - 1.2, 0), (x, H - 11.4, 0), 0.06, p)
    for i in range(8):
        x = -W / 2 + i * 6
        beam("stay", "steel", (W / 2 - 2, H + 9, 0), (x + 12, H + 1.6, 0), 0.18, p)
    box("apex", "crane", W / 2 - 3, H + 1.6, -1.0, W / 2 - 1, H + 9, 1.0, p)
    join_by_role(p)


def signalbox():
    p = part("signalbox")
    box("base", "brick", -3.5, 0, -2.2, 3.5, 3.2, 2.2, p)
    box("floor", "wooddark", -3.7, 3.2, -2.4, 3.7, 3.4, 2.4, p)
    box("posts", "wood", -3.6, 3.4, -2.3, 3.6, 5.6, 2.3, p)
    for z in (-2.32, 2.32):
        for i in range(6):
            x = -3.0 + i * 1.2
            box("pane", "glass", x - 0.5, 4.2, z - 0.02, x + 0.5, 5.4, z + 0.02, p)
    for x in (-3.62, 3.62):
        for i in range(3):
            zz = -1.4 + i * 1.4
            box("pane", "glass", x - 0.02, 4.2, zz - 0.55, x + 0.02, 5.4, zz + 0.55, p)
    cone("roof", "steel", 0, 5.6, 0, 5.0, 0.6, 1.8, p, 4).rotation_euler = (0, 0, math.radians(45))
    box("stair", "wooddark", 3.5, 0, -1.6, 4.4, 3.3, -0.8, p)
    box("nameboard", "white", -2.0, 3.45, -2.45, 2.0, 3.85, -2.4, p)
    box("stove", "steel", 2.6, 5.6, 1.2, 2.9, 7.2, 1.5, p)
    join_by_role(p)


def pylon():
    p = part("pylon")
    H = 12.0
    box("footing", "concrete", -0.9, 0, -0.9, 0.9, 0.5, 0.9, p)
    cone("tube", "steel", 0, 0.5, 0, 0.42, 0.3, H - 0.5, p, 16)
    box("arm", "steel", -0.25, H - 0.4, -3.4, 0.25, H, 3.4, p)
    for z in (-3.0, 3.0):
        box("sheaves", "rubber", -1.3, H - 0.8, z - 0.15, 1.3, H - 0.45, z + 0.15, p)
        box("hanger", "steel", -1.35, H - 0.45, z - 0.08, 1.35, H - 0.4, z + 0.08, p)
    box("ladder", "steel", -0.08, 0.5, 0.35, 0.08, H - 0.5, 0.45, p)
    box("cage", "steel", -0.6, H - 1.2, -0.6, 0.6, H - 1.1, 0.6, p)
    # two chairs hung from the cable, one each way
    for x, z in ((-4.0, -3.0), (4.5, 3.0)):
        beam("grip", "steel", (x, H - 0.6, z), (x, H - 3.6, z), 0.08, p)
        box("seat", "red", x - 0.9, H - 3.9, z - 0.3, x + 0.9, H - 3.75, z + 0.3, p)
        box("back", "red", x - 0.9, H - 3.75, z + 0.25, x + 0.9, H - 3.1, z + 0.32, p)
        box("bar", "steel", x - 0.9, H - 3.2, z - 0.35, x + 0.9, H - 3.15, z - 0.3, p)
    join_by_role(p)


def towercrane():
    p = part("towercrane")
    H = 32.0
    m = 1.1
    box("base", "concrete", -2.5, 0, -2.5, 2.5, 1.0, 2.5, p)
    for x in (-m, m):
        for z in (-m, m):
            box("chord", "crane", x - 0.12, 1, z - 0.12, x + 0.12, H, z + 0.12, p)
    y = 1.0
    i = 0
    while y < H - 2:
        for (ax, az), (bx, bz) in (((-m, -m), (m, -m)), ((m, -m), (m, m)), ((m, m), (-m, m)), ((-m, m), (-m, -m))):
            if i % 2:
                beam("lace", "crane", (ax, y, az), (bx, y + 2, bz), 0.07, p)
            else:
                beam("lace", "crane", (bx, y, bz), (ax, y + 2, az), 0.07, p)
        y += 2
        i += 1
    box("slew", "steel", -1.6, H, -1.6, 1.6, H + 1.0, 1.6, p)
    box("cab", "white", 1.3, H - 0.5, -1.0, 3.1, H + 1.2, 1.0, p)
    box("window", "glass", 3.1, H - 0.2, -0.8, 3.15, H + 1.0, 0.8, p)
    box("jib", "crane", -1, H + 1.0, -0.7, 38, H + 2.2, 0.7, p)
    box("counterjib", "crane", -13, H + 1.0, -0.9, -1, H + 1.8, 0.9, p)
    box("weights", "concrete", -12.5, H - 1.4, -1.0, -9.5, H + 1.0, 1.0, p)
    box("apex", "crane", -0.6, H + 1.0, -0.6, 0.6, H + 7.0, 0.6, p)
    beam("pendant", "steel", (0, H + 7, 0), (28, H + 2.2, 0), 0.08, p)
    beam("pendant", "steel", (0, H + 7, 0), (-12, H + 1.8, 0), 0.08, p)
    box("trolley", "steel", 21, H + 0.6, -0.8, 23, H + 1.0, 0.8, p)
    beam("rope", "steel", (22, H + 0.6, 0), (22, 14, 0), 0.05, p)
    box("hook", "red", 21.6, 13.2, -0.3, 22.4, 14.0, 0.3, p)
    box("load", "wooddark", 20.5, 11.4, -1.2, 23.5, 12.6, 1.2, p)
    join_by_role(p)


def lighthouse():
    p = part("lighthouse")
    box("rock", "concrete", -3.2, 0, -3.2, 3.2, 0.8, 3.2, p)
    H = 13.0
    bands = 5
    for i in range(bands):
        y0 = 0.8 + i * H / bands
        r0 = 2.2 - (i / bands) * 0.8
        r1 = 2.2 - ((i + 1) / bands) * 0.8
        cone("band", "white" if i % 2 == 0 else "red", 0, y0, 0, r0, r1, H / bands, p, 32)
    yg = 0.8 + H
    cyl("gallery", "steel", 0, yg, 0, 2.0, 0.25, p, 32)
    for k in range(16):
        a = k / 16 * math.tau
        box("rail", "steel", math.cos(a) * 1.9 - 0.03, yg + 0.25, math.sin(a) * 1.9 - 0.03, math.cos(a) * 1.9 + 0.03, yg + 1.2, math.sin(a) * 1.9 + 0.03, p)
    cyl("lantern", "glass", 0, yg + 0.25, 0, 1.0, 1.8, p, 16)
    cyl("lamp", "lamp", 0, yg + 0.8, 0, 0.45, 0.7, p, 12)
    cone("cap", "red", 0, yg + 2.05, 0, 1.25, 0.15, 1.2, p, 16)
    cyl("vent", "steel", 0, yg + 3.25, 0, 0.18, 0.4, p, 10)
    box("door", "wooddark", -0.45, 0.8, -2.25, 0.45, 2.8, -2.1, p)
    box("hut", "white", 2.5, 0.8, -1.5, 6.5, 3.4, 1.5, p)
    box("hutroof", "red", 2.3, 3.4, -1.7, 6.7, 3.7, 1.7, p)
    join_by_role(p)


def watchtower():
    p = part("watchtower")
    H = 6.0
    for x in (-1.6, 1.6):
        for z in (-1.6, 1.6):
            beam("leg", "wooddark", (x * 1.2, 0, z * 1.2), (x, H, z), 0.25, p)
    for y0, y1 in ((0.3, 3.0), (3.0, 5.8)):
        for (ax, az), (bx, bz) in (((-1.6, -1.6), (1.6, -1.6)), ((1.6, -1.6), (1.6, 1.6)), ((1.6, 1.6), (-1.6, 1.6)), ((-1.6, 1.6), (-1.6, -1.6))):
            f0 = 1.2 - y0 / H * 0.2
            f1 = 1.2 - y1 / H * 0.2
            beam("brace", "wood", (ax * f0, y0, az * f0), (bx * f1, y1, bz * f1), 0.12, p)
    box("floor", "wood", -2.0, H, -2.0, 2.0, H + 0.15, 2.0, p)
    for (x0, z0, x1, z1) in ((-2, -2, 2, -1.9), (-2, 1.9, 2, 2), (-2, -2, -1.9, 2), (1.9, -2, 2, 2)):
        box("wall", "wood", x0, H + 0.15, z0, x1, H + 1.1, z1, p)
    for x in (-1.95, 1.95):
        for z in (-1.95, 1.95):
            box("post", "wooddark", x - 0.07, H, z - 0.07, x + 0.07, H + 2.4, z + 0.07, p)
    cone("roof", "steel", 0, H + 2.4, 0, 3.1, 0.2, 1.2, p, 4).rotation_euler = (0, 0, math.radians(45))
    for i in range(20):
        y = 0.3 + i * 0.29
        box("rung", "wooddark", -0.35, y, 2.3, 0.35, y + 0.05, 2.36, p)
    box("ladder", "wooddark", -0.4, 0, 2.28, -0.34, H, 2.38, p)
    box("ladder", "wooddark", 0.34, 0, 2.28, 0.4, H, 2.38, p)
    box("pole", "steel", 1.85, H + 2.4, 1.85, 1.95, H + 4.4, 1.95, p)
    cone("sock", "red", 2.6, H + 4.0, 1.9, 0.25, 0.1, 1.4, p, 12).rotation_euler = (0, math.radians(90), 0)
    join_by_role(p)


clear()
relayhut()
chimney()
watertower()
portainer()
signalbox()
pylon()
towercrane()
lighthouse()
watchtower()
boxcar()
flatcar()
tanker()
brakevan()
bufferstop()
logs()
sacks()
boat()
woodpile()
van()
skip()
barricade()
container()
crate()
barrel()
pallet()
sandbags()
barrier()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print("wrote", OUT)

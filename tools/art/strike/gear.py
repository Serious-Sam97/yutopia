# Plan 119 (docs/plan/119-bots-knife-charge.md, F3a) — the Strike Park's own gear, as one .glb of three nodes:
#   knife   a drop-point combat knife (0.30 m): the blade with its fuller and a swedge, a guard, a ridged grip, a
#           pommel. Its node at the grip's middle; the blade up (+y), its edge toward +x, its flats facing ±z.
#   charge  the Raiders' charge (0.27 × 0.09 × 0.16): four putty blocks taped in two rows on a tray, the timer box on
#           them with its keypad (twelve keys), its screen ("screen") and its light ("led"). Its node at the tray's
#           middle underneath, the keypad up (+y), its long side along x, the screen toward −z (the one typing).
#   pack    the charge as it's carried on the back: stood on end in a webbing harness, two shoulder straps and a
#           waist strap. Its node where it lies on the back (the spine, between the shoulder blades); +y up, +z away
#           from the back.
# Three's frame (y up): glTF's y-up export turns Blender's z-up — Blender (x, y, z) is three's (x, z, −y). So modelled
# here: up is +z, three's +z (out of the back, the knife's flats) is Blender's −y.
#   blender -b --factory-startup --python tools/art/strike/gear.py
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "../../../apps/client/public/life/strike/gear.glb"))

# base colour, metal, roughness (an emission for the screen and the light)
KINDS = {
    "blade": ((0.55, 0.56, 0.57), 1.0, 0.28, None),
    "fuller": ((0.2, 0.21, 0.22), 1.0, 0.4, None),
    "guard": ((0.05, 0.05, 0.055), 0.7, 0.45, None),
    "grip": ((0.03, 0.032, 0.03), 0.0, 0.75, None),
    "putty": ((0.52, 0.5, 0.42), 0.0, 0.85, None),
    "tape": ((0.16, 0.19, 0.12), 0.0, 0.6, None),
    "box": ((0.035, 0.036, 0.034), 0.2, 0.5, None),
    "key": ((0.62, 0.6, 0.55), 0.0, 0.55, None),
    "wire": ((0.55, 0.08, 0.05), 0.0, 0.5, None),
    "wire2": ((0.05, 0.12, 0.45), 0.0, 0.5, None),
    "screen": ((0.05, 0.12, 0.06), 0.0, 0.3, (0.35, 0.9, 0.4)),
    "led": ((0.35, 0.04, 0.03), 0.0, 0.3, (1.0, 0.12, 0.06)),
    "webbing": ((0.11, 0.12, 0.09), 0.0, 0.9, None),
    "buckle": ((0.03, 0.03, 0.03), 0.3, 0.5, None),
}


def mat(kind):
    m = bpy.data.materials.get(kind)
    if m:
        return m
    base, metal, rough, glow = KINDS[kind]
    m = bpy.data.materials.new(kind)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if glow:
        b.inputs["Emission Color"].default_value = (*glow, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    return m


def mesh_from(bm, name, kind, parent):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(kind))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    return ob


def box(name, kind, parent, size, at=(0, 0, 0), rot=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    if rot is not None:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return mesh_from(bm, name, kind, parent)


def cyl(name, kind, parent, r, depth, at=(0, 0, 0), axis="z", seg=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth)
    if axis == "x":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    elif axis == "y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return mesh_from(bm, name, kind, parent)


def prism(name, kind, parent, outline, thick, y=0.0, bevel=0.0):
    """A flat piece from an outline in Blender's xz plane (x along, z up), `thick` through y (three's ±z)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y - thick / 2, z)) for x, z in outline]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, thick, 0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES")
    return mesh_from(bm, name, kind, parent)


def empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.parent = parent
    return e


def knife():
    k = empty("knife")
    # the blade: from the guard (z 0.055) to the tip (z 0.235); the edge at +x, the spine at −x; a drop point —
    # the spine dropping to the tip, the edge's belly rising to it
    out = [(-0.014, 0.055), (0.016, 0.055), (0.017, 0.15), (0.013, 0.2), (0.004, 0.228), (-0.002, 0.236),
           (-0.008, 0.215), (-0.012, 0.19), (-0.014, 0.15)]
    prism("blade", "blade", k, out, 0.0045, bevel=0.0008)
    # the fuller: a darker groove along the flat, both sides
    for s in (-1, 1):
        prism(f"fuller{s}", "fuller", k, [(-0.006, 0.07), (0.0, 0.07), (0.0, 0.17), (-0.006, 0.165)], 0.0006,
              y=s * 0.0024)
    # the guard: a flat bar across, its ends rounded down
    box("guard", "guard", k, (0.058, 0.016, 0.009), at=(0.0, 0, 0.05), bevel=0.002)
    # the grip: an oval column with six ridges, a pommel
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.0125, radius2=0.0135, depth=0.1)
    bmesh.ops.scale(bm, vec=Vector((1.0, 0.82, 1.0)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector((0, 0, -0.005)), verts=bm.verts)
    mesh_from(bm, "grip", "grip", k)
    for i in range(6):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=0.0142, radius2=0.0142, depth=0.004)
        bmesh.ops.scale(bm, vec=Vector((1.0, 0.82, 1.0)), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector((0, 0, -0.045 + i * 0.016)), verts=bm.verts)
        mesh_from(bm, f"ridge{i}", "grip", k)
    cyl("pommel", "guard", k, 0.0145, 0.014, at=(0, 0, -0.061), seg=14)
    return k


def charge(name="charge", parent=None):
    c = empty(name, parent)
    # the tray under it all
    box(f"{name}_tray", "box", c, (0.27, 0.16, 0.008), at=(0, 0, 0.004), bevel=0.002)
    # four putty blocks, two rows, each wrapped twice in tape
    for i, x in enumerate((-0.068, 0.068)):
        for j, y in enumerate((-0.04, 0.04)):
            box(f"{name}_putty{i}{j}", "putty", c, (0.13, 0.075, 0.05), at=(x, y, 0.033), bevel=0.004)
    for x in (-0.1, -0.035, 0.035, 0.1):
        box(f"{name}_tape{x:+.2f}", "tape", c, (0.022, 0.162, 0.054), at=(x, 0, 0.033), bevel=0.002)
    # the timer box on top, toward the screen's side (−y in Blender is three's +z: the screen faces three's −z, so
    # it sits at Blender +y)
    tb = box(f"{name}_timer", "box", c, (0.15, 0.1, 0.03), at=(0.0, 0.0, 0.072), bevel=0.003)
    tb.name = f"{name}_timer"
    # its screen: a strip at the far edge, three's −z (Blender +y)
    box(f"{name}_screen", "screen", c, (0.1, 0.026, 0.002), at=(0.0, 0.032, 0.0875))
    # the keypad: 3 × 4 keys, nearer the one typing
    for r in range(4):
        for q in range(3):
            box(f"{name}_key{r}{q}", "key", c, (0.018, 0.012, 0.004),
                at=(-0.024 + q * 0.024, 0.012 - r * 0.0155, 0.0885), bevel=0.0012)
    # the light, by the screen
    cyl(f"{name}_led", "led", c, 0.0045, 0.006, at=(0.062, 0.032, 0.089), seg=12)
    # the wires: from the box down into the blocks, red and blue
    for k, (kind, x) in enumerate((("wire", -0.07), ("wire2", -0.06))):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.0028, radius2=0.0028, depth=0.05)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(0.9, 3, "Y"))
        bmesh.ops.translate(bm, vec=Vector((x - 0.015, -0.03 + k * 0.012, 0.068)), verts=bm.verts)
        mesh_from(bm, f"{name}_w{k}", kind, c)
    # its name for the client: the screen and the light found by these names
    for ob in c.children:
        if ob.name.endswith("_screen"):
            ob.name = "screen" if name == "charge" else f"{name}_screen"
        if ob.name.endswith("_led"):
            ob.name = "led" if name == "charge" else f"{name}_led"
    return c


def pack():
    p = empty("pack")
    # the charge stood on end against the back: its tray toward the back (three's −z, Blender +y), long side up
    inner = charge("pack_charge", p)
    inner.matrix_parent_inverse = Matrix.Identity(4)
    # (Rx +90°: the keypad, Blender +z, out from the back, −y; then Ry −90°: its long side, x, up; the tray at y 0,
    # on the plate)
    inner.matrix_basis = Matrix.Translation((0, -0.004, 0.0)) @ Matrix.Rotation(-math.pi / 2, 4, "Y") @ Matrix.Rotation(
        math.pi / 2, 4, "X"
    )
    # a backing plate under it
    box("pack_plate", "webbing", p, (0.19, 0.012, 0.31), at=(0, 0.004, 0), bevel=0.004)
    # two shoulder straps up over the top and two straps round the charge
    for s in (-1, 1):
        box(f"pack_shoulder{s}", "webbing", p, (0.035, 0.008, 0.2), at=(s * 0.065, 0.0, 0.2), rot=Matrix.Rotation(
            -0.35, 3, "X"), bevel=0.001)
        box(f"pack_buckle{s}", "buckle", p, (0.04, 0.012, 0.022), at=(s * 0.065, -0.008, 0.11), bevel=0.002)
    for z in (-0.09, 0.08):
        box(f"pack_band{z:+.2f}", "webbing", p, (0.2, 0.11, 0.03), at=(0, -0.045, z), bevel=0.002)
    box("pack_waist", "webbing", p, (0.3, 0.01, 0.035), at=(0, 0.002, -0.16), bevel=0.001)
    return p


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
knife()
c = charge()
pack()
bpy.context.view_layer.update()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True)
print("[gear] wrote", OUT)

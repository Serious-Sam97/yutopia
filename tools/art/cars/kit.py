# Plan 92 — the cars' kit: materials, mesh helpers, booleans. Imported by bodies.py, parts.py, build_cars.py
# and mock.py (`import kit`).
#
# Frames: Blender's z-up metres. A car's frame: +x forward, +z up, +y its LEFT (the driver's side); the origin
# on the ground under its centre of gravity (the game's car-local frame: x forward, y up, z right — glTF's
# export_yup turns Blender (x, y, z) into (x, z, −y)).
#
# Every object made here carries two custom properties the build reads: `grp` (the moving group it belongs to:
# "body", "door_fl", "bonnet", "spin_fl"… — build_cars.py hangs each group under its pivot) and its material
# (one each: the build merges a group's objects by material — a few draw calls a car).
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

# ── materials (plain PBR factors, as the guns': the cabin's named after the life library's materials —
#    walnut, carpet, leather, tweed, velvet — so the game can lay the library's maps on them) ───────────────
# kind: (base colour, metallic, roughness, extra)
MAT = {
    "paint": ((0.5, 0.08, 0.06), 0.55, 0.32, {"coat": 1.0}),
    "paint2": ((0.85, 0.83, 0.78), 0.4, 0.32, {"coat": 1.0}),
    "chrome": ((0.8, 0.8, 0.8), 1.0, 0.08, {}),
    "trim": ((0.025, 0.025, 0.026), 0.0, 0.55, {}),  # satin black plastic, rubbing strips, surrounds
    "gloss": ((0.012, 0.012, 0.013), 0.0, 0.18, {}),  # gloss black: B-pillars, grille insides
    "rubber": ((0.018, 0.018, 0.018), 0.0, 0.88, {}),  # seals, tyres
    "tyre": ((0.022, 0.022, 0.022), 0.0, 0.82, {}),
    "glass": ((0.06, 0.07, 0.075), 0.0, 0.02, {"alpha": 0.32}),
    "glass_tint": ((0.02, 0.025, 0.03), 0.0, 0.02, {"alpha": 0.7}),
    "lens": ((0.85, 0.87, 0.9), 0.0, 0.03, {"alpha": 0.25}),  # headlamp and reverse lens
    "lens_red": ((0.55, 0.02, 0.015), 0.0, 0.08, {"alpha": 0.82}),
    "lens_amber": ((0.9, 0.38, 0.03), 0.0, 0.08, {"alpha": 0.8}),
    "reflector": ((0.92, 0.92, 0.92), 1.0, 0.05, {}),
    # the lamps' own light: emission the game drives (its node: lamp_head…); dark till then
    "emit_head": ((0.9, 0.9, 0.85), 0.0, 0.3, {"emit": (1.0, 0.95, 0.85), "es": 0.0}),
    "emit_tail": ((0.3, 0.01, 0.01), 0.0, 0.3, {"emit": (1.0, 0.05, 0.02), "es": 0.0}),
    "emit_brake": ((0.3, 0.01, 0.01), 0.0, 0.3, {"emit": (1.0, 0.03, 0.01), "es": 0.0}),
    "emit_reverse": ((0.8, 0.8, 0.8), 0.0, 0.3, {"emit": (1.0, 1.0, 0.95), "es": 0.0}),
    "emit_ind": ((0.6, 0.25, 0.02), 0.0, 0.3, {"emit": (1.0, 0.45, 0.02), "es": 0.0}),
    "emit_beacon_r": ((0.4, 0.02, 0.02), 0.0, 0.2, {"emit": (1.0, 0.05, 0.03), "es": 0.0}),
    "emit_beacon_b": ((0.02, 0.05, 0.4), 0.0, 0.2, {"emit": (0.05, 0.2, 1.0), "es": 0.0}),
    "emit_sign": ((0.9, 0.75, 0.2), 0.0, 0.4, {"emit": (1.0, 0.85, 0.4), "es": 0.0}),
    "plate": ((0.85, 0.84, 0.78), 0.0, 0.45, {}),  # the game writes the plate's text on it (UV 0..1)
    "steel": ((0.42, 0.43, 0.44), 1.0, 0.38, {}),
    "steel_paint": ((0.55, 0.56, 0.57), 0.6, 0.35, {}),  # painted steel wheels
    "alloy": ((0.7, 0.71, 0.72), 1.0, 0.22, {}),
    "alloy_dark": ((0.12, 0.12, 0.13), 0.9, 0.3, {}),
    "disc": ((0.3, 0.29, 0.28), 1.0, 0.45, {}),
    "caliper": ((0.18, 0.17, 0.16), 0.6, 0.5, {}),
    "under": ((0.03, 0.028, 0.026), 0.2, 0.8, {}),  # the underbody, wheel arches' liners
    "cast": ((0.25, 0.25, 0.26), 0.9, 0.55, {}),  # the engine's block
    "cam": ((0.55, 0.06, 0.04), 0.3, 0.4, {}),  # its cam cover (painted)
    "hose": ((0.02, 0.02, 0.02), 0.0, 0.7, {}),
    "battery": ((0.08, 0.08, 0.09), 0.0, 0.5, {}),
    "copper": ((0.62, 0.3, 0.16), 1.0, 0.35, {}),
    "dash": ((0.035, 0.034, 0.033), 0.0, 0.6, {}),  # the dashboard's moulded plastic
    "vinyl": ((0.06, 0.055, 0.05), 0.0, 0.55, {}),
    "carpet": ((0.07, 0.06, 0.05), 0.0, 0.95, {}),
    "tweed": ((0.22, 0.2, 0.17), 0.0, 0.9, {}),  # base cloth
    "velvet": ((0.18, 0.12, 0.09), 0.0, 0.85, {}),  # GL velour
    "leather": ((0.1, 0.06, 0.035), 0.0, 0.5, {}),
    "walnut": ((0.11, 0.05, 0.02), 0.0, 0.3, {}),
    "headliner": ((0.55, 0.52, 0.47), 0.0, 0.92, {}),
    "screen": ((0.02, 0.02, 0.015), 0.0, 0.2, {"emit": (1.0, 0.6, 0.15), "es": 0.0}),  # the VFD's canvas
    "gauge": ((0.03, 0.03, 0.03), 0.0, 0.25, {}),
    "canvas": ((0.045, 0.05, 0.04), 0.0, 0.92, {}),  # a soft top
    "woodgrain": ((0.2, 0.09, 0.04), 0.0, 0.35, {}),  # the estate GL's wood-look sides
    "fibre": ((0.82, 0.8, 0.74), 0.0, 0.45, {}),  # fibreglass (the high roof, the pop-top)
    "bed": ((0.04, 0.04, 0.04), 0.0, 0.75, {}),  # a pickup's bed liner
    "livery": ((0.95, 0.95, 0.93), 0.1, 0.35, {"coat": 1.0}),  # the police doors, the taxi's chequers
    "track": ((0.05, 0.05, 0.05), 0.2, 0.75, {}),
    "blade": ((0.85, 0.55, 0.05), 0.4, 0.4, {"coat": 0.5}),  # the plough's orange
    "wood": ((0.32, 0.18, 0.08), 0.0, 0.6, {}),  # the toboggan
    "collider": ((1.0, 0.0, 1.0), 0.0, 1.0, {}),  # the Jolt hull (never drawn)
    # (the quality pass)
    "glass_ws": ((1.0, 1.0, 1.0), 0.0, 0.02, {"alpha": 0.4}),  # the windscreen: its sun band in its texture
    "cluster": ((1.0, 1.0, 1.0), 0.0, 0.45, {}),  # the cluster's printed face
    "switch": ((1.0, 1.0, 1.0), 0.0, 0.5, {}),  # the switches' caps and their legends
    "livery_police": ((1.0, 1.0, 1.0), 0.1, 0.35, {"coat": 1.0}),
    "livery_taxi": ((1.0, 1.0, 1.0), 0.1, 0.35, {"coat": 1.0, "clip": True}),
    "sign_face": ((1.0, 1.0, 1.0), 0.0, 0.4, {"emit": (1.0, 0.85, 0.4), "es": 0.0}),
    "grille_mesh": ((0.02, 0.02, 0.021), 0.3, 0.4, {}),  # the grille's mesh, speaker grilles
    "gap": ((0.006, 0.006, 0.006), 0.0, 0.9, {}),  # a panel gap's walls: the dark line between panels
    "webbing": ((0.04, 0.04, 0.045), 0.0, 0.8, {}),
    "needle": ((0.95, 0.35, 0.08), 0.0, 0.4, {"emit": (1.0, 0.4, 0.1), "es": 0.0}),
}
MATS = {}


def _img(name):
    import textures

    p = textures.path(name)
    if not os.path.exists(p):
        return None
    im = bpy.data.images.get(name) or bpy.data.images.load(p)
    im.name = name
    if textures.TEX[name][0] != "albedo":
        im.colorspace_settings.name = "Non-Color"
    return im


def _wire(m, b, t, c):
    """A material's texture nodes (texmap.OWN or LIB_STILL entry t): the UVs (scaled by its tile), the base
    multiplied by the colour, the normal, the roughness from the ORM's G."""
    nt = m.node_tree
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    src = uv.outputs["UV"]
    if t.get("tile"):
        mp = nt.nodes.new("ShaderNodeMapping")
        s_ = 1.0 / t["tile"]
        mp.inputs["Scale"].default_value = (s_, s_, s_)
        nt.links.new(src, mp.inputs["Vector"])
        src = mp.outputs["Vector"]
    if t.get("base") and _img(t["base"]):
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = _img(t["base"])
        nt.links.new(src, tx.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = (*c, 1)
        nt.links.new(tx.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        if t.get("alpha"):
            nt.links.new(tx.outputs["Alpha"], b.inputs["Alpha"])
    if t.get("normal") and _img(t["normal"]):
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = _img(t["normal"])
        nt.links.new(src, tx.inputs["Vector"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = t.get("ns", 1.0)
        nt.links.new(tx.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if t.get("orm") and _img(t["orm"]):
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = _img(t["orm"])
        nt.links.new(src, tx.inputs["Vector"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tx.outputs["Color"], sep.inputs["Color"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = b.inputs["Roughness"].default_value
        nt.links.new(sep.outputs[1], mul.inputs[0])
        nt.links.new(mul.outputs[0], b.inputs["Roughness"])


def mat(kind):
    if kind in MATS:
        return MATS[kind]
    import texmap

    c, metal, rough, x = MAT[kind]
    m = bpy.data.materials.new(kind)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*c, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if "coat" in x:
        b.inputs["Coat Weight"].default_value = x["coat"]
        b.inputs["Coat Roughness"].default_value = 0.04
    if "alpha" in x:
        b.inputs["Alpha"].default_value = x["alpha"]
        for attr, v in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, v)
            except (AttributeError, TypeError):
                pass
    if x.get("clip"):
        for attr, v in (("surface_render_method", "DITHERED"), ("blend_method", "CLIP")):
            try:
                setattr(m, attr, v)
            except (AttributeError, TypeError):
                pass
    if "emit" in x:
        b.inputs["Emission Color"].default_value = (*x["emit"], 1)
        b.inputs["Emission Strength"].default_value = x["es"]
    t = texmap.OWN.get(kind) or texmap.LIB_STILL.get(kind)
    if t and TEXTURED:
        _wire(m, b, t, c)
    MATS[kind] = m
    return m


TEXTURED = True
SEG = 1.0  # (the mid level: fewer segments round every turned and swept part)


def uv_box(o, metres=1.0):
    """UVs by box projection, in metres (each face onto the plane its normal faces most)."""
    me = o.data
    if me.uv_layers:
        return
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y * (1 if n.x > 0 else -1), co.z
            elif ax == 1:
                u, v = co.x * (-1 if n.y > 0 else 1), co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u / metres, v / metres)


def uv_all():
    """Every textured mesh without UVs given box UVs in metres (the textures' tiles are in metres); the plain
    ones none (their bytes saved)."""
    import texmap

    for o in coll().objects:
        if o.type == "MESH" and len(o.data.polygons) and (o.get("kind") in texmap.OWN or o.get("kind") in texmap.LIB):
            uv_box(o)


def set_paint(kind, rgb, metallic=None):
    """The paint's colour for a render (the game sets its own per car)."""
    b = mat(kind).node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    if metallic is not None:
        b.inputs["Metallic"].default_value = metallic


def lit(kind, strength):
    """A lamp's emission on (renders: the game drives its own)."""
    mat(kind).node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = strength


# ── objects ────────────────────────────────────────────────────────────────────────────────────────────────
COLL = None


def coll():
    return bpy.context.scene.collection


def obj(name, me, kind, grp="body", smooth=True, angle=40):
    """A mesh object: one material, in a group."""
    me.materials.clear()
    me.materials.append(mat(kind))
    o = bpy.data.objects.new(name, me)
    coll().objects.link(o)
    o["grp"] = grp
    o["kind"] = kind
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=math.radians(angle))
        except AttributeError:
            pass
    return o


def from_pydata(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    me.validate()
    return me


def mk(name, verts, faces, kind, grp="body", smooth=True, angle=40):
    return obj(name, from_pydata(name, verts, faces), kind, grp, smooth, angle)


def apply_all(o):
    """Every modifier applied (and the object's transform baked into its mesh)."""
    dg = bpy.context.evaluated_depsgraph_get()
    e = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(e)
    me.transform(o.matrix_world)
    old = o.data
    o.modifiers.clear()
    o.data = me
    o.matrix_world = Matrix.Identity(4)
    if old.users == 0:
        bpy.data.meshes.remove(old)
    me.materials.clear()
    me.materials.append(mat(o["kind"]))
    return o


def bevel(o, width, segs=3, angle=35, limit="ANGLE", clamp=True):
    if SEG < 1.0:
        segs = max(1, int(round(segs * SEG * 0.6)))
    m = o.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segs
    m.limit_method = limit
    m.angle_limit = math.radians(angle)
    m.use_clamp_overlap = clamp
    m.harden_normals = False
    return apply_all(o)


def solidify(o, t, offset=-1.0):
    m = o.modifiers.new("solid", "SOLIDIFY")
    m.thickness = t
    m.offset = offset
    m.use_even_offset = True
    return apply_all(o)


def subsurf(o, levels=1):
    m = o.modifiers.new("sub", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return apply_all(o)


def _bbox(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    if not vs:
        return None
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))


def _outside_area(me, box, pad=0.01):
    """The area of the faces lying wholly outside a box — their own bounds clear of it (a correct boolean
    never touches them)."""
    lo, hi = box
    vs = me.vertices
    a = 0.0
    for p in me.polygons:
        cs = [vs[i].co for i in p.vertices]
        if (
            max(c.x for c in cs) < lo.x - pad
            or min(c.x for c in cs) > hi.x + pad
            or max(c.y for c in cs) < lo.y - pad
            or min(c.y for c in cs) > hi.y + pad
            or max(c.z for c in cs) < lo.z - pad
            or min(c.z for c in cs) > hi.z + pad
        ):
            a += p.area
    return a


def _try(o, cutter, op, solver, tolerant):
    m = o.modifiers.new("bool", "BOOLEAN")
    m.object = cutter
    m.operation = op
    m.solver = solver
    if solver == "EXACT":
        try:
            m.use_hole_tolerant = tolerant
        except AttributeError:
            pass
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.remove(m)
    return me


BOOL_FAILS = []


def boolean(o, cutter, op="DIFFERENCE"):
    """A boolean, checked: what's outside the cutter's box must come through untouched (a difference), what
    comes out must lie inside it (an intersection) — else the next solver is tried; none good, it's left as
    it was (and noted)."""
    box = _bbox(cutter)
    src_box = _bbox(o)
    if src_box is None:
        return o
    before = _outside_area(o.data, box) if op == "DIFFERENCE" else None
    for solver, tol in (("EXACT", True), ("MANIFOLD", False), ("EXACT", False), ("FLOAT", False), ("FAST", False)):
        try:
            me = _try(o, cutter, op, solver, tol)
        except TypeError:
            continue
        ok = True
        if op == "DIFFERENCE":
            after = _outside_area(me, box)
            ok = abs(after - before) <= max(0.002, before * 0.01)
            lo, hi = src_box
            for v in me.vertices:
                c = v.co
                if c.x < lo.x - 0.02 or c.x > hi.x + 0.02 or c.y < lo.y - 0.02 or c.y > hi.y + 0.02 or c.z < lo.z - 0.02 or c.z > hi.z + 0.02:
                    ok = False
                    break
        else:
            if len(me.polygons):
                for lo, hi in (box, src_box):
                    for v in me.vertices:
                        c = v.co
                        if c.x < lo.x - 0.02 or c.x > hi.x + 0.02 or c.y < lo.y - 0.02 or c.y > hi.y + 0.02 or c.z < lo.z - 0.02 or c.z > hi.z + 0.02:
                            ok = False
                            break
        if ok:
            old = o.data
            o.data = me
            if old.users == 0:
                bpy.data.meshes.remove(old)
            me.materials.clear()
            me.materials.append(mat(o["kind"]))
            return o
        bpy.data.meshes.remove(me)
    BOOL_FAILS.append((o.name, cutter.name, op))
    print(f"  (boolean {op} {o.name} by {cutter.name}: every solver failed — left as it was)")
    if op == "INTERSECT":
        o.data.clear_geometry()
    return o


def copy(o, name, kind=None, grp=None):
    n = o.copy()
    n.data = o.data.copy()
    n.name = name
    coll().objects.link(n)
    n["kind"] = kind or o["kind"]
    n["grp"] = grp or o["grp"]
    n.data.materials.clear()
    n.data.materials.append(mat(n["kind"]))
    return n


def kill(*obs):
    for o in obs:
        if o is None:
            continue
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def mirror_y(o, name=None, grp=None):
    """A copy mirrored to the other side (y → −y)."""
    n = copy(o, name or o.name + ".r", grp=grp)
    n.data.transform(Matrix.Scale(-1, 4, (0, 1, 0)))
    n.data.flip_normals()
    return n


def move(o, v):
    o.data.transform(Matrix.Translation(Vector(v)))
    return o


def rot(o, axis, angle, about=(0, 0, 0)):
    a = Vector(about)
    o.data.transform(Matrix.Translation(a) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-a))
    return o


def scale(o, s, about=(0, 0, 0)):
    a = Vector(about)
    S = Matrix.Diagonal((*s, 1)) if isinstance(s, (tuple, list)) else Matrix.Scale(s, 4)
    o.data.transform(Matrix.Translation(a) @ S @ Matrix.Translation(-a))
    return o


# ── primitives ─────────────────────────────────────────────────────────────────────────────────────────────


def box(name, c, size, kind, grp="body", r=0.0, segs=2):
    """A box at centre c (size x, y, z); rounded `r` if given."""
    sx, sy, sz = (s / 2 for s in size)
    v = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    o = mk(name, v, f, kind, grp, smooth=r > 0)
    move(o, c)
    if r > 0:
        bevel(o, min(r, min(size) / 2 * 0.98), segs, limit="NONE")
    return o


def lathe(name, prof, n, kind, grp="body", axis="y", cap=True, smooth=True, angle=40, uv_v=None, uv_u=1.0):
    """Turned about an axis from a profile of (r, h) points (h along the axis). With uv_v (a v for each profile
    point), UVs round it (u 0..uv_u once round, a seam column doubled)."""
    n = max(6, int(round(n * SEG)))
    verts, faces = [], []
    m = len(prof)
    cols = n + 1 if uv_v is not None else n
    for i in range(cols):
        a = 2 * math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        for r, h in prof:
            if axis == "y":
                verts.append((r * ca, h, r * sa))
            elif axis == "x":
                verts.append((h, r * ca, r * sa))
            else:
                verts.append((r * ca, r * sa, h))
    for i in range(n):
        j = (i + 1) % cols if uv_v is None else i + 1
        for k in range(m - 1):
            a, b, c, d = i * m + k, i * m + k + 1, j * m + k + 1, j * m + k
            faces.append((a, b, c, d) if axis != "x" else (a, d, c, b))
    if cap:
        for k, at in ((0, 0), (m - 1, 1)):
            if prof[k][0] > 1e-5:
                ring = [i * m + k for i in range(n)]
                faces.append(tuple(ring if (at == 0) == (axis == "x") else ring[::-1]))
    o = mk(name, verts, faces, kind, grp, smooth, angle)
    if uv_v is not None:
        me = o.data
        uv = me.uv_layers.new(name="UVMap")
        for p in me.polygons:
            for li in p.loop_indices:
                vi = me.loops[li].vertex_index
                i, k = divmod(vi, m)
                uv.data[li].uv = (uv_u * i / n, uv_v[k])
    if uv_v is not None:
        # (the seam column's verts are separate: merge nothing — the UVs need them apart)
        pass
    return o


def cyl(name, c, r, length, kind, grp="body", axis="y", n=24, r2=None, bevel_r=0.0):
    """A cylinder centred at c along an axis."""
    r2 = r if r2 is None else r2
    o = lathe(name, [(r, -length / 2), (r2, length / 2)], n, kind, grp, axis=axis)
    move(o, c)
    if bevel_r > 0:
        bevel(o, bevel_r, 2)
    return o


def tube(name, pts, r, kind, grp="body", n=10, cap=True):
    """A tube along points (a hose, an arm, a rail): a polyline swept by a circle."""
    pts = [Vector(p) for p in pts]
    n = max(4, int(round(n * SEG)))
    verts, faces = [], []
    prev = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev is None:
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(up).normalized()
        else:
            u = (prev - t * t.dot(prev)).normalized()
        prev = u
        w = t.cross(u).normalized()
        for k in range(n):
            a = 2 * math.pi * k / n
            verts.append(p + (u * math.cos(a) + w * math.sin(a)) * r)
    for i in range(len(pts) - 1):
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    if cap:
        faces.append(tuple(range(n))[::-1])
        last = (len(pts) - 1) * n
        faces.append(tuple(range(last, last + n)))
    return mk(name, verts, faces, kind, grp)


def prism(name, poly, y0, y1, kind, grp="body", smooth=False, axis="y"):
    """A side profile (x, z) extruded between y0 and y1 (axis y); or a plan (x, y) between z0 and z1 (axis z)."""
    n = len(poly)
    if axis == "y":
        verts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
    else:
        verts = [(x, y, y0) for x, y in poly] + [(x, y, y1) for x, y in poly]
    # the profile's winding: faces out whichever way it was drawn
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    ccw = area > 0
    a = list(range(n))
    b = list(range(n, 2 * n))
    if axis == "y":
        faces = [tuple(a if ccw else a[::-1]), tuple(b[::-1] if ccw else b)]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, n + i, n + j, j) if ccw else (i, j, n + j, n + i))
    else:
        faces = [tuple(a[::-1] if ccw else a), tuple(b if ccw else b[::-1])]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, n + j, n + i) if ccw else (i, n + i, n + j, j))
    return mk(name, verts, faces, kind, grp, smooth)


def offset_poly(poly, d):
    """A closed polygon (x, z) grown outward by d (shrunk if d < 0): each corner along its two edges' normals."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    s = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0 = (p1 - p0).normalized()
        e1 = (p2 - p1).normalized()
        n0 = Vector((e0.y, -e0.x)) * s
        n1 = Vector((e1.y, -e1.x)) * s
        m = (n0 + n1).normalized()
        cos = max(0.3, m.dot(n1))
        q = p1 + m * (d / cos)
        out.append((q.x, q.y))
    return out


def round_poly(poly, r, n=4):
    """A polygon's corners rounded (r each, or a list of radii)."""
    rs = r if isinstance(r, (list, tuple)) else [r] * len(poly)
    out = []
    m = len(poly)
    for i in range(m):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % m])
        ri = rs[i]
        if ri <= 0:
            out.append(tuple(p1))
            continue
        a = (p0 - p1).normalized()
        b = (p2 - p1).normalized()
        k = min(ri, (p0 - p1).length * 0.45, (p2 - p1).length * 0.45)
        s0, s1 = p1 + a * k, p1 + b * k
        for j in range(n + 1):
            t = j / n
            # a quadratic through the corner: s0 → p1 → s1
            q = s0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + s1 * t * t
            out.append((q.x, q.y))
    return out


def plate(name, c, w, h, kind, grp="body", normal="x", t=0.004):
    """A thin panel facing an axis (+x, -x, +y, -y), UVs 0..1 (a plate, a screen)."""
    if normal in ("x", "-x"):
        s = 1 if normal == "x" else -1
        v = [(0, -w / 2 * s, -h / 2), (0, w / 2 * s, -h / 2), (0, w / 2 * s, h / 2), (0, -w / 2 * s, h / 2)]
        back = [(-t * s, y, z) for _, y, z in v]
    else:
        s = 1 if normal == "y" else -1
        v = [(w / 2 * s, 0, -h / 2), (-w / 2 * s, 0, -h / 2), (-w / 2 * s, 0, h / 2), (w / 2 * s, 0, h / 2)]
        back = [(x, -t * s, z) for x, _, z in v]
    verts = v + back
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    o = mk(name, verts, faces, kind, grp, smooth=False)
    uv = o.data.uv_layers.new(name="UVMap")
    corners = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for li, loop in enumerate(o.data.polygons[0].loop_indices):
        uv.data[loop].uv = corners[li]
    move(o, c)
    return o


def join(objs, name=None):
    """Objects of one material and group joined into one."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bm = bmesh.new()
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name or objs[0].name)
    bm.to_mesh(me)
    bm.free()
    kind, grp = objs[0]["kind"], objs[0]["grp"]
    kill(*objs)
    o = obj(name or "joined", me, kind, grp, smooth=False)
    return o


# ── quality pass 2: smooth skins ────────────────────────────────────────────────────────────────────────────


class Ref:
    """A smooth reference surface (the shell before its cuts, finer): its triangles' vertex normals,
    interpolated where a point lands on it."""

    def __init__(self, objs):
        from mathutils.bvhtree import BVHTree

        bm = bmesh.new()
        for o in objs:
            me = o.data.copy()
            me.transform(o.matrix_world)
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.normal_update()
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        self.tris = [tuple(v.index for v in f.verts) for f in bm.faces]
        self.co = [v.co.copy() for v in bm.verts]
        self.vn = [v.normal.copy() for v in bm.verts]
        self.bvh = BVHTree.FromBMesh(bm)
        bm.free()

    def at(self, p, far=0.06):
        """(distance, smooth normal) at the surface nearest p — or (None, None)."""
        from mathutils.interpolate import poly_3d_calc

        loc, fn, i, d = self.bvh.find_nearest(p, far)
        if loc is None:
            return None, None
        a, b, c = self.tris[i]
        w = poly_3d_calc([self.co[a], self.co[b], self.co[c]], loc)
        n = self.vn[a] * w[0] + self.vn[b] * w[1] + self.vn[c] * w[2]
        if n.length < 1e-6:
            n = fn
        return d, n.normalized()


def skin_normals(o, ref, tol=0.004, inner=(0.012, 0.03), sharp=32):
    """The faces of `o` lying on the reference's surface take its smooth normals (and those on the shell's
    inside, the same turned in); the rest — a cut's walls, a rim — stay flat. However the booleans cut it, the
    paint shades as one smooth surface."""
    me = o.data
    if not len(me.polygons):
        return
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(sharp))
    vs = me.vertices
    out = [None] * len(me.loops)
    for p in me.polygons:
        fn = p.normal.copy()
        d, n = ref.at(p.center)
        mode = 0
        if d is not None and n is not None:
            if d < tol and fn.dot(n) > 0.5:
                mode = 1
            elif inner[0] < d < inner[1] and fn.dot(n) < -0.5:
                mode = -1
        for li in p.loop_indices:
            if mode == 0:
                out[li] = fn
                continue
            co = vs[me.loops[li].vertex_index].co
            if mode == 1:
                d2, n2 = ref.at(co, 0.02)
                out[li] = n2 if n2 is not None else fn
            else:
                d2, n2 = ref.at(co, 0.05)
                out[li] = -n2 if n2 is not None else fn
    me.normals_split_custom_set([tuple(n) for n in out])


def rrect(w, h, r, n=4):
    """A rounded rectangle's outline (y, z) about the origin, counter-clockwise (a circle when r ≥ the half
    sides)."""
    r = min(r, w / 2, h / 2)
    out = []
    for cy, cz, a0 in ((w / 2 - r, h / 2 - r, 0.0), (-w / 2 + r, h / 2 - r, 90.0), (-w / 2 + r, -h / 2 + r, 180.0), (w / 2 - r, -h / 2 + r, 270.0)):
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            out.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    # (a circle: the corners' shared points once)
    ded = []
    for p in out:
        if not ded or (abs(ded[-1][0] - p[0]) > 1e-6 or abs(ded[-1][1] - p[1]) > 1e-6):
            ded.append(p)
    if len(ded) > 2 and abs(ded[0][0] - ded[-1][0]) < 1e-6 and abs(ded[0][1] - ded[-1][1]) < 1e-6:
        ded.pop()
    return ded


def xprism(name, poly, x0, x1, kind, grp="body", caps=(True, True), smooth=False):
    """An outline (y, z) extruded along x from x0 (its back) to x1 (its front); `caps` (back, front)."""
    n = len(poly)
    verts = [(x0, y, z) for y, z in poly] + [(x1, y, z) for y, z in poly]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    if caps[0]:
        faces.append(tuple(range(n - 1, -1, -1)))
    if caps[1]:
        faces.append(tuple(range(n, 2 * n)))
    o = mk(name, verts, faces, kind, grp, smooth=smooth, angle=40)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def frame_x(name, c, outer, inner, depth, kind, grp="body", slope=0.004):
    """A frame facing +x at c (its front face's middle): between two outlines (y, z), `depth` deep, its inner
    edge set back `slope` (a lamp's bezel, a grille's surround)."""
    x, y, z = c
    no, ni = len(outer), len(inner)
    assert no == ni, "frame outlines must match"
    n = no
    verts = [(x, y + a, z + b_) for a, b_ in outer] + [(x - slope, y + a, z + b_) for a, b_ in inner]
    verts += [(x - depth, y + a, z + b_) for a, b_ in outer] + [(x - depth, y + a, z + b_) for a, b_ in inner]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))  # the face
        faces.append((2 * n + i, 2 * n + j, j, i))  # the outer side
        faces.append((n + i, n + j, 3 * n + j, 3 * n + i))  # the inner side
        faces.append((3 * n + i, 3 * n + j, 2 * n + j, 2 * n + i))  # the back
    o = mk(name, verts, faces, kind, grp, smooth=True, angle=35)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o

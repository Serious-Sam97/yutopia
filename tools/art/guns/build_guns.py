# Plan 79, phase 3 — the guns for the game: tools/art/guns/guns.py's models (the revolver and the
# double-barrel, redesigned after Alan Wake 2's) written as .glb into apps/client/public/life/guns/.
#
# Every part's booleans and bevels applied; each moving group's parts merged by material (a few draw
# calls a gun) and hung under a pivot at its hinge — the names tp/guns3d.ts's poseGun moves:
#   revolver   hammer · trigger · crane (the swing-out, along the bore below the cylinder) › cylinder
#   shotgun    barrels (at the hinge pin, the fore-end with them) · lever · triggers
#   ak47       magazine (on its front lug) · carrier (the charging handle on it) · trigger · selector
#   sniper     bolt (on the bore: turned up, run back) · trigger
#   daybreak   cell (out underneath) · core (its glow) · needle (the gauge) · trigger
# and `round<i>` (the revolver's six, the double-barrel's two shells' heads, the AK's top round), shown by how many are
# loaded. The gun's points are empty nodes `pt_<name>` (grip, muzzle, rear, front, fore, butt).
# Materials: plain PBR factors by kind (the node materials' look, flattened; their wood grain,
# checkering and engraving are for the renders — baking them is a later step).
#
# glTF is y-up: Blender's gun frame (+x the barrel, +z up, +y its left) comes out as three's (+x the
# barrel, +y up, +z its right) — tp/guns3d.ts's.
#
#   blender -b --factory-startup -P tools/art/guns/build_guns.py -- [--out DIR] [--only revolver]
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "apps/client/public/life/guns")
ONLY = argv[argv.index("--only") + 1].split(",") if "--only" in argv else ["revolver", "shotgun", "ak47", "sniper", "daybreak"]
os.makedirs(OUT, exist_ok=True)

# the kinds, flattened: base colour, metal, roughness (and an emission)
FLAT = {
    "nickel": ((0.66, 0.65, 0.62), 1.0, 0.2),
    # (plan 79 phase 8: every gun read near black by day — the game never gave their materials the sky's
    # reflection (tp/view.ts lifeGun: adoptLife now does); with it, blued a little lighter than it was and the
    # phosphate a little less a mirror — dark grey-black, as they are)
    "blued": ((0.05, 0.056, 0.07), 0.85, 0.32),
    "parker": ((0.06, 0.061, 0.058), 0.5, 0.56),
    "steel": ((0.32, 0.33, 0.34), 1.0, 0.32),
    "engraved": ((0.5, 0.48, 0.45), 1.0, 0.26),
    "case": ((0.22, 0.2, 0.2), 1.0, 0.3),
    "walnut": ((0.075, 0.032, 0.013), 0.0, 0.42),
    "birch": ((0.18, 0.07, 0.025), 0.0, 0.48),
    "polymer": ((0.05, 0.052, 0.05), 0.0, 0.62),
    "rubber": ((0.012, 0.012, 0.012), 0.0, 0.9),
    "leather": ((0.09, 0.045, 0.02), 0.0, 0.6),
    "brass": ((0.7, 0.5, 0.2), 1.0, 0.3),
    "copper": ((0.7, 0.3, 0.17), 1.0, 0.32),
    "lead": ((0.42, 0.43, 0.45), 0.8, 0.55),
    "dial": ((0.85, 0.8, 0.66), 0.0, 0.5),
    "dark": ((0.004, 0.004, 0.004), 0.0, 0.9),
    "insert": ((0.8, 0.06, 0.03), 0.0, 0.5),
    "coated": ((0.015, 0.04, 0.05), 0.4, 0.06),
    # (the Daybreak's: navy enamel; its lens and cell glass, pale; the core's warm white — its glow the
    # game's to drive, by the charge)
    "enamel": ((0.03, 0.05, 0.12), 0.15, 0.32),
    "glass": ((0.55, 0.6, 0.62), 0.0, 0.05),
    "glow": ((1.0, 0.9, 0.7), 0.0, 0.4),
}
FLAT_MATS = {}


def flat(kind):
    if kind not in FLAT_MATS:
        c, metal, rough = FLAT[kind]
        m = bpy.data.materials.new(f"gun-{kind}")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*c, 1)
        b.inputs["Metallic"].default_value = metal
        b.inputs["Roughness"].default_value = rough
        if kind in ("insert", "glow"):
            b.inputs["Emission Color"].default_value = (*c, 1)
            b.inputs["Emission Strength"].default_value = 0.6 if kind == "insert" else 2.0
        FLAT_MATS[kind] = m
    return FLAT_MATS[kind]


def kind_of(ob):
    return ob.data.materials[0].name.split("-check")[0].split(".")[0]


# the moving groups: their parts (by name, after "<gun>.") and their pivots (Blender's gun frame);
# a group's parent group, if it hangs on another
GROUPS = {
    "revolver": {
        "hammer": {"parts": ["hammer", "spur"], "at": (-0.012, 0, 0.062)},
        "trigger": {"parts": ["trigger"], "at": (0.023, 0, 0.031)},
        "crane": {"parts": ["crane"], "at": (0.0, 0, 0.0385)},
        "cylinder": {"parts": ["cylinder", *[f"round{i}" for i in range(6)]], "at": (0.0, 0, 0.0585), "in": "crane"},
    },
    "shotgun": {
        "barrels": {"parts": ["barrelL", "barrelR", "rib", "bead", "fore-end", "fore-iron", "latch", "round0", "round1"], "at": (0.144, 0, 0.033)},
        "lever": {"parts": ["lever"], "at": (0.026, 0, 0.079)},
        "triggers": {"parts": ["trigger0", "trigger1"], "at": (0.052, 0, 0.026)},
    },
    # (plan 79 phase 5) the magazine rocks out on its front lug; the carrier (the charging handle on it)
    # runs back along the bore; the selector turns on its pivot
    "ak47": {
        "magazine": {"parts": ["magazine", "mag-ribs", "floor", "round0"], "at": (0.124, 0, 0.026)},
        "carrier": {"parts": ["carrier"], "at": (0.17, 0, 0.073)},
        "trigger": {"parts": ["trigger"], "at": (0.022, 0, 0.02)},
        "selector": {"parts": ["selector"], "at": (0.045, -0.0258, 0.066)},
    },
    # (plan 79 phase 6) the bolt turns up about the bore and runs back along it; the trigger
    "sniper": {
        "bolt": {"parts": ["bolt", "bolt-arm", "bolt-knob"], "at": (0.0, 0, 0.066)},
        "trigger": {"parts": ["trigger"], "at": (0.03, 0, 0.006)},
    },
    # (plan 79 phase 7) the cell drops out underneath (and in); the core glows by the charge; the gauge's
    # needle swings with it; the trigger
    "daybreak": {
        "cell": {"parts": ["cell", "cell-glass", "filament"], "at": (0.135, 0, 0.04)},
        "core": {"parts": ["core"], "at": (0.45, 0, 0.115)},
        "needle": {"parts": ["needle"], "at": (0.31, 0, 0.17)},
        "trigger": {"parts": ["trigger"], "at": (0.028, 0, 0.04)},
    },
}


def evaluated(ob):
    """The part's mesh with its modifiers applied, in the gun's frame."""
    dg = bpy.context.evaluated_depsgraph_get()
    e = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(e)
    me.transform(ob.matrix_parent_inverse @ ob.matrix_basis)
    return me


def merge(meshes, name, at):
    """One mesh of several (each already in the gun's frame), moved so `at` is its origin."""
    bm = bmesh.new()
    for me in meshes:
        bm.from_mesh(me)
    bmesh.ops.translate(bm, vec=-Vector(at), verts=bm.verts)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    return out


def build(gid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    FLAT_MATS.clear()
    guns.MATS.clear()
    g = guns.BUILD[gid]()
    bpy.context.view_layer.update()
    spec = GROUPS[gid]
    group_of = {p: grp for grp, d in spec.items() for p in d["parts"]}
    # every part, applied, sorted into its group and material
    sets = {}
    for ob in list(g.root.children):
        if ob.type != "MESH" or ob.name.endswith(".cut"):
            continue
        part = ob.name.split(".", 1)[1]
        grp = group_of.get(part, "")
        key = (grp, part if part.startswith("round") else kind_of(ob))
        sets.setdefault(key, []).append((evaluated(ob), kind_of(ob)))
    points = dict(g.points)
    # a clean scene: the root, the pivots, the merged meshes, the points
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    root = bpy.data.objects.new(gid, None)
    bpy.context.collection.objects.link(root)
    pivots = {"": (root, Vector((0, 0, 0)))}
    for grp, d in spec.items():  # (in order: a group's parent comes before it)
        parent, pat = pivots[d.get("in", "")]
        e = bpy.data.objects.new(grp, None)
        bpy.context.collection.objects.link(e)
        e.parent = parent
        e.location = Vector(d["at"]) - pat
        pivots[grp] = (e, Vector(d["at"]))
    tris = 0
    for (grp, what), items in sets.items():
        parent, at = pivots[grp]
        me = merge([m for m, _ in items], f"{gid}-{grp or 'body'}-{what}", at)
        me.materials.append(flat(items[0][1]))
        for p in me.polygons:
            p.use_smooth = True
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        ob = bpy.data.objects.new(what if what.startswith("round") else f"{grp or 'body'}-{what}", me)
        bpy.context.collection.objects.link(ob)
        ob.parent = parent
    for name, at in points.items():
        e = bpy.data.objects.new(f"pt_{name}", None)
        bpy.context.collection.objects.link(e)
        e.parent = root
        e.location = at
    path = os.path.join(OUT, f"{gid}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_meshopt_compression_enable=True, export_extras=False)
    print(f"wrote {path} ({os.path.getsize(path) / 1e3:.0f} KB), {tris} triangles")


for gid in ONLY:
    build(gid)

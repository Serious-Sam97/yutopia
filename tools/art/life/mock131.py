# Plan 131 phase 0 — the body mocks: three bases (today's, MakeHuman pushed, Blender Studio's CC0 base) each
# aimed at three looks (Sims 4, inZOI, GTA V). Static figures for /dev/life/p131, not the game's people.
#
#   MakeHuman pushed (two builds a look: the figure and a firmer one to bake definition from):
#     blender -b --factory-startup -P tools/art/life/build_person.py -- --who man --look sims4 --bare \
#       --tex 2048 --blend /tmp/mh-sims4-man.blend
#     blender -b --factory-startup -P tools/art/life/build_person.py -- --who man --look sims4 --bare \
#       --def --blend /tmp/mh-sims4-man-def.blend
#     blender -b --factory-startup -P tools/art/life/mock131.py -- mh /tmp/mh-sims4-man.blend sims4 man OUT
#   Blender Studio (one bake a gender, the three looks from it):
#     blender -b --factory-startup -P tools/art/life/mock131.py -- bs BUNDLE.blend man OUT
#
# LOOKS: what build_person.py takes with --look (macro sliders, the face over IDEAL × `ideal`, age, skin).
import math
import os
import sys

LOOKS = {
    # Sims 4: soft and appealing — a touch larger head and eyes, small nose, full lips, smooth young skin,
    # everyday-but-fit bodies, no harsh anatomy
    "sims4": {
        "man": {
            "muscle": 0.52, "weight": 0.5, "height": 0.55, "proportions": 0.8, "shoulder_slope": 4, "ideal": 1.3,
            "race": {"caucasian": 0.8, "african": 0.05, "asian": 0.15},
            "skin": "skins/young_caucasian_male/young_lightskinned_male_diffuse.png",
            "face": {
                "eyes/{s}-eye-scale-incr": 0.6, "head/head-scale-vert-incr": 0.1, "head/head-scale-horiz-incr": 0.1,
                "head/head-scale-depth-incr": 0.1, "nose/nose-scale-horiz-decr": 0.3, "nose/nose-volume-decr": 0.4,
                "mouth/mouth-upperlip-volume-incr": 0.3, "mouth/mouth-lowerlip-volume-incr": 0.35,
                "chin/chin-width-incr": 0.15, "head/head-age-decr": 0.8, "neck/neck-double-decr": 0.8,
            },
        },
        "woman": {
            "muscle": 0.45, "weight": 0.5, "height": 0.5, "proportions": 0.85, "ideal": 1.3,
            "race": {"african": 0.7, "caucasian": 0.2, "asian": 0.1},
            "skin": "skins/young_african_female/young_darkskinned_female_diffuse.png",
            "face": {
                "eyes/{s}-eye-scale-incr": 0.75, "head/head-scale-vert-incr": 0.1, "head/head-scale-horiz-incr": 0.1,
                "head/head-scale-depth-incr": 0.1, "nose/nose-volume-decr": 0.5, "nose/nose-point-width-decr": 0.4,
                "mouth/mouth-upperlip-volume-incr": 0.45, "mouth/mouth-lowerlip-volume-incr": 0.5,
                "chin/chin-width-decr": 0.3, "head/head-age-decr": 0.8, "cheek/{s}-cheek-bones-incr": 0.3,
            },
        },
    },
    # inZOI: idealised realism — tall, long-legged, V-line jaw, slim straight nose, clear porcelain skin
    "inzoi": {
        "man": {
            "muscle": 0.56, "weight": 0.45, "height": 0.72, "proportions": 1.0, "shoulder_slope": 3, "ideal": 1.0,
            "race": {"asian": 0.8, "caucasian": 0.2},
            "skin": "skins/young_asian_male/young_lightskinned_male_diffuse3.png",
            "face": {
                "eyes/{s}-eye-scale-incr": 0.25, "nose/nose-scale-horiz-decr": 0.35, "nose/nose-volume-decr": 0.3,
                "nose/nose-point-up": 0.1, "chin/chin-prominent-incr": 0.25, "chin/chin-width-decr": 0.2,
                "cheek/{s}-cheek-bones-incr": 0.4, "head/head-fat-decr": 0.35, "head/head-oval": 0.5,
                "neck/neck-double-decr": 0.8, "torso/torso-vshape-incr": 0.25,
            },
        },
        "woman": {
            "muscle": 0.45, "weight": 0.4, "height": 0.68, "proportions": 1.0, "ideal": 1.0,
            "race": {"asian": 0.8, "caucasian": 0.2},
            "skin": "skins/young_asian_female/young_lightskinned_female_diffuse3.png",
            "face": {
                "eyes/{s}-eye-scale-incr": 0.5, "nose/nose-scale-horiz-decr": 0.45, "nose/nose-volume-decr": 0.45,
                "mouth/mouth-upperlip-volume-incr": 0.4, "mouth/mouth-lowerlip-volume-incr": 0.4,
                "chin/chin-width-decr": 0.45, "chin/chin-triangle": 0.3, "cheek/{s}-cheek-volume-decr": 0.3,
                "head/head-oval": 0.7, "neck/neck-double-decr": 0.8,
            },
        },
    },
    # GTA V: grounded — everyday proportions, a little older, the face left as people are, lived-in skin
    # (plan 131 phase 3: the GTA V man at old age — his `old` shape's other end)
    "gtav-old": {
        "man": {
            "muscle": 0.52, "weight": 0.6, "height": 0.53, "proportions": 0.35, "shoulder_slope": 6, "ideal": 0.25,
            "age_old": 0.85,
            "race": {"caucasian": 0.85, "african": 0.05, "asian": 0.1},
            "skin": "skins/old_caucasian_male/old_lightskinned_male_diffuse.png",
            "face": {"chin/chin-prominent-incr": 0.2, "chin/chin-width-incr": 0.2, "nose/nose-volume-incr": 0.1},
        },
        "woman": {
            "muscle": 0.44, "weight": 0.58, "height": 0.48, "proportions": 0.4, "ideal": 0.4, "age_old": 0.85,
            "race": {"african": 0.75, "caucasian": 0.15, "asian": 0.1},
            "skin": "skins/old_caucasian_female/old_lightskinned_female_diffuse.png",
            "face": {"cheek/{s}-cheek-bones-incr": 0.2},
        },
    },
    "gtav": {
        "man": {
            "muscle": 0.6, "weight": 0.6, "height": 0.55, "proportions": 0.35, "shoulder_slope": 6, "ideal": 0.25,
            "age_old": 0.18,
            "race": {"caucasian": 0.85, "african": 0.05, "asian": 0.1},
            "skin": "skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png",
            "face": {"chin/chin-prominent-incr": 0.2, "chin/chin-width-incr": 0.2, "nose/nose-volume-incr": 0.1},
        },
        "woman": {
            "muscle": 0.5, "weight": 0.56, "height": 0.5, "proportions": 0.4, "ideal": 0.4, "age_old": 0.08,
            "race": {"african": 0.75, "caucasian": 0.15, "asian": 0.1},
            # (a light skin's photo: the game tints it to the avatar's skin — a dark one lifted to a light skin
            # ran out of range, plan 73 4.2)
            "skin": "skins/young_caucasian_female/young_lightskinned_female_diffuse.png",
            "face": {"cheek/{s}-cheek-bones-incr": 0.2},
        },
    },
}

# The skin each Blender Studio look is painted in (the texture's own values: sRGB-encoded — Blender's byte
# images hold their pixels encoded; the GTA V man's tone is MakeHuman's middle-aged light skin's median): its tone, the lips', the brows', the cheeks'
# warmth, how mottled (blotches, fine grain), freckles
BS_SKIN = {
    "sims4": {
        "man": {"tone": (0.8, 0.56, 0.44), "lips": (0.55, 0.22, 0.2), "brow": (0.06, 0.035, 0.02), "blush": 0.12, "mottle": 0.025, "grain": 0.01, "freckles": 0.0, "brow_k": 0.95},
        "woman": {"tone": (0.16, 0.075, 0.042), "lips": (0.12, 0.04, 0.035), "brow": (0.02, 0.012, 0.008), "blush": 0.08, "mottle": 0.03, "grain": 0.01, "freckles": 0.0, "brow_k": 0.95},
    },
    "inzoi": {
        "man": {"tone": (0.84, 0.62, 0.52), "lips": (0.6, 0.3, 0.28), "brow": (0.03, 0.022, 0.016), "blush": 0.08, "mottle": 0.03, "grain": 0.02, "freckles": 0.0, "brow_k": 0.9},
        "woman": {"tone": (0.88, 0.66, 0.57), "lips": (0.62, 0.24, 0.26), "brow": (0.04, 0.028, 0.02), "blush": 0.15, "mottle": 0.025, "grain": 0.015, "freckles": 0.0, "brow_k": 0.85},
    },
    "gtav": {
        "man": {"tone": (0.84, 0.68, 0.57), "lips": (0.72, 0.47, 0.44), "brow": (0.22, 0.15, 0.1), "blush": 0.12, "mottle": 0.07, "grain": 0.04, "freckles": 0.2, "brow_k": 0.85},
        "woman": {"tone": (0.15, 0.072, 0.04), "lips": (0.1, 0.045, 0.035), "brow": (0.015, 0.01, 0.007), "blush": 0.06, "mottle": 0.07, "grain": 0.04, "freckles": 0.0, "brow_k": 0.8},
    },
}
# Each Blender Studio body's landmarks (metres, the body at x 0, read off ortho stills): eyes, the mouth's
# slit, the lips' top and bottom and half width, the brows' height, the shoulder/elbow/wrist (left; mirrored)
BS_LM = {
    "man": {"eye": 1.5725, "eye_x": 0.0345, "mouth": 1.502, "lip_top": 1.5104, "lip_bot": 1.4924, "lip_w": 0.0285, "brow": 1.5875,
            "nipple": (0.12, 1.21), "arm": [(0.17, 1.32), (0.30, 1.06), (0.38, 0.85), (0.42, 0.74)]},
    "woman": {"eye": 1.5345, "eye_x": 0.033, "mouth": 1.4664, "lip_top": 1.476, "lip_bot": 1.4565, "lip_w": 0.0255, "brow": 1.548,
              "nipple": None, "arm": [(0.18, 1.32), (0.28, 1.06), (0.37, 0.84), (0.41, 0.74)]},
}
TEX = 2048


def _np():
    import numpy as np

    return np


def cycles():
    import bpy

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "METAL"
        pr.refresh_devices()
        for d in pr.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:  # (CPU then)
        print("  (no GPU:", e, ")")
    sc.cycles.samples = 64
    sc.render.bake.margin = 12
    if sc.world is None:
        sc.world = bpy.data.worlds.new("w")
    sc.world.light_settings.distance = 0.05
    return sc


def image(name, float_buffer=False, size=TEX, data=False):
    import bpy

    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=float_buffer)
    img.generated_color = (0, 0, 0, 0)
    if data or float_buffer:
        # (a normal map, an AO, positions: values, not colours — an sRGB image bends them in the bake)
        img.colorspace_settings.name = "Non-Color"
    return img


def target(ob, img):
    """Each of the object's materials with this image as its active node: the bake's target."""
    import bpy

    if not ob.data.materials:
        ob.data.materials.append(bpy.data.materials.new(f"{ob.name}-m"))
    for m in ob.data.materials:
        m.use_nodes = True
        nt = m.node_tree
        n = nt.nodes.get("bake-target") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "bake-target"
        n.image = img
        nt.nodes.active = n


def bake(kind, low, img, high=None, **kw):
    import bpy

    sc = bpy.context.scene
    target(low, img)
    for o in [x for x in bpy.data.objects if x is not None and x.name in bpy.context.view_layer.objects]:
        o.select_set(False)
    if high is not None:
        high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    sc.render.bake.use_selected_to_active = high is not None
    sc.render.bake.cage_extrusion = kw.get("extrusion", 0.012)
    sc.render.bake.max_ray_distance = kw.get("ray", 0.04)
    args = {"type": kind}
    if kind == "NORMAL":
        args["normal_space"] = "TANGENT"
    bpy.ops.object.bake(**args)
    # (opaque: WebP drops the colour under a clear texel — a normal map baked with alpha 0 came out black)
    a = pixels(img)
    a[..., 3] = 1
    put(img, a)
    print(f"  baked {kind} {low.name}{' from ' + high.name if high else ''}")


def pixels(img):
    np = _np()
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def put(img, a):
    img.pixels.foreach_set(a.astype(np.float32).ravel() if False else a.astype("float32").ravel())


def emit_position(ob, img):
    """Bake each texel's object-space position (float) — the masks and noise are painted from it."""
    import bpy

    m = bpy.data.materials.new(f"{ob.name}-pos")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    g = nt.nodes.new("ShaderNodeNewGeometry")
    e = nt.nodes.new("ShaderNodeEmission")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(g.outputs["Position"], e.inputs["Color"])
    nt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    keep = list(ob.data.materials)
    ob.data.materials.clear()
    ob.data.materials.append(m)
    bake("EMIT", ob, img)
    ob.data.materials.clear()
    for k in keep:
        ob.data.materials.append(k)
    return pixels(img)


def noise3(p, freq, seed=0):
    """Smooth value noise in 0…1 at positions p (…, 3), `freq` cells a metre."""
    np = _np()
    rng = np.random.default_rng(seed)
    G = rng.random((64, 64, 64)).astype(np.float32)
    q = p * freq
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w * G[(i[..., 0] + dx) % 64, (i[..., 1] + dy) % 64, (i[..., 2] + dz) % 64]
    return out


def even_regions(S, block=32):
    """MakeHuman's skins are painted a face paler than the body: each region's tone divided out over a wide
    neighbourhood (its own texels only), the whole's kept — detail and hue stay, the patches go."""
    np = _np()
    h, w = S.shape[:2]
    on = (S[..., :3].sum(-1) > 0.05).astype(np.float32)
    nb = h // block
    rs = (S[..., :3] * on[..., None]).reshape(nb, block, nb, block, 3).sum((1, 3))
    cn = on.reshape(nb, block, nb, block).sum((1, 3))[..., None]
    # (smoothed over neighbouring blocks, twice)
    for _ in range(3):
        rs = (rs + np.roll(rs, 1, 0) + np.roll(rs, -1, 0) + np.roll(rs, 1, 1) + np.roll(rs, -1, 1)) / 5
        cn = (cn + np.roll(cn, 1, 0) + np.roll(cn, -1, 0) + np.roll(cn, 1, 1) + np.roll(cn, -1, 1)) / 5
    loc = rs / np.maximum(cn, 1e-3)
    glob = (S[..., :3] * on[..., None]).sum((0, 1)) / max(on.sum(), 1)
    ratio = np.clip(glob / np.maximum(loc, 1e-3), 0.6, 1.6)
    ratio = np.repeat(np.repeat(ratio, block, 0), block, 1)
    out = S.copy()
    out[..., :3] = np.where(on[..., None] > 0, S[..., :3] * ratio, S[..., :3])
    return out


def sstep(a, b, x):
    np = _np()
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mat(name, img=None, nrm=None, rgb=(0.5, 0.5, 0.5), rough=0.6, alpha=False):
    import bpy

    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    if img is not None:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.links.new(n.outputs["Color"], b.inputs["Base Color"])
        if alpha:
            nt.links.new(n.outputs["Alpha"], b.inputs["Alpha"])
    if nrm is not None:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = nrm
        nrm.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def on_disk(img):
    """The image written out and loaded back from its file: the glTF exporter wrote a baked, unsaved
    normal map as plain white."""
    import bpy
    import tempfile

    path = os.path.join(tempfile.gettempdir(), f"mock131-{os.getpid()}-{img.name}.png")
    save_png(img, path)
    cs = img.colorspace_settings.name
    out = bpy.data.images.load(path)
    out.colorspace_settings.name = cs
    return out


def cloth_slots(ob, arm_w, H, who, z0=0.0):
    """Shorts (and a top on the woman) as material slots 1 and 2 by height, the arms' faces left out."""
    np = _np()
    me = ob.data
    P = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", P)
    P = P.reshape(-1, 3)
    for p in me.polygons:
        vs = list(p.vertices)
        z = (P[vs, 2].mean() - z0) / H
        if arm_w[vs].mean() > 0.5:
            continue
        if 0.36 < z < 0.575:
            p.material_index = 1
        elif who == "woman" and 0.695 < z < 0.8:
            p.material_index = 2


def export(objs, path):
    import bpy

    for o in [x for x in bpy.data.objects if x is not None and x.name in bpy.context.view_layer.objects]:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_tangents=True,
        export_image_format="WEBP",
        export_skins=False,
        export_animations=False,
        export_morph=False,
        export_materials="EXPORT",
    )
    print("wrote", path, f"{os.path.getsize(path) / 1e6:.1f} MB", sum(len(o.data.polygons) for o in objs), "faces")


def plain(ob):
    """Its rig, its shapes, its parent taken off: a static mesh where it stands."""
    import bpy

    for m in list(ob.modifiers):
        if m.type == "ARMATURE":
            ob.modifiers.remove(m)
    if ob.data.shape_keys:
        ob.shape_key_clear()
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw


def subdivide(ob, levels):
    import bpy

    m = ob.modifiers.new("sub", "SUBSURF")
    m.levels = m.render_levels = levels
    m.uv_smooth = "PRESERVE_BOUNDARIES"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def run_mh(blend, look, who, out):
    """MakeHuman pushed: the look's figure subdivided once, definition baked from its firmer twin, AO, the
    MakeHuman skin of its age and ancestry at 2048 darkened by the AO."""
    import bpy

    np = _np()
    bpy.ops.wm.open_mainfile(filepath=blend)
    sc = cycles()
    for n in ("hair", "rig"):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    obs = [o for o in bpy.data.objects if o.type == "MESH"]
    body = bpy.data.objects["body"]
    # the arms' weights (the rig's arm joints), for the clothes' cut
    armg = {g.index for g in body.vertex_groups if g.name.startswith(("shoulder", "elbow", "forearm", "wrist", "fingers", "index", "thumb", "ring", "little"))}
    aw = np.zeros(len(body.data.vertices))
    for v in body.data.vertices:
        aw[v.index] = sum(g.weight for g in v.groups if g.group in armg)
    for o in obs:
        plain(o)
    H = body.dimensions[2]
    skin_img = next(n.image for n in body.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    body.data.materials.append(mat("bottom", rgb=(0.05, 0.08, 0.16), rough=0.85))
    body.data.materials.append(mat("top", rgb=(0.3, 0.05, 0.05), rough=0.85))
    z0 = min(v.co.z for v in body.data.vertices)
    subdivide(body, 1)
    aw = np.zeros(len(body.data.vertices))
    for v in body.data.vertices:
        aw[v.index] = sum(g.weight for g in v.groups if g.group in armg)
    cloth_slots(body, aw, H, who, z0=z0)
    # its firmer twin, subdivided twice: the definition's source
    with bpy.data.libraries.load(blend.replace(".blend", "-def.blend")) as (src, dst):
        dst.objects = ["body"]
    hi = dst.objects[0]
    hi.name = "def"
    sc.collection.objects.link(hi)
    plain(hi)
    subdivide(hi, 2)
    nrm = image("nrm", data=True)
    bake("NORMAL", body, nrm, high=hi, extrusion=0.01, ray=0.03)
    bpy.data.objects.remove(hi)
    ao = image("ao", data=True)
    sc.cycles.samples = 128
    bake("AO", body, ao)
    A = pixels(ao)[..., 0]
    if skin_img.size[0] != TEX:
        skin_img.scale(TEX, TEX)
    S = pixels(skin_img)
    if not os.environ.get("MOCK_RAW_SKIN"):
        S = even_regions(S)
    k = 0.55 + 0.45 * np.clip(A, 0, 1)
    S[..., :3] *= k[..., None]
    alb = image("albedo")
    put(alb, S)
    if os.environ.get("MOCK_DEBUG"):
        for im in (ao, alb):
            save_png(im, os.path.join(os.environ["MOCK_DEBUG"], f"{look}-{who}-{im.name}.png"))
    body.data.materials[0] = mat("skin", img=on_disk(alb), nrm=on_disk(nrm), rough=0.5)
    for i in (1, 2):
        pass
    obs = [o for o in bpy.data.objects if o.type == "MESH"]
    export(obs, os.path.join(out, f"mh-{look}-{who}.glb"))


def run_bs(bundle, who, out):
    """Blender Studio's realistic body: one UV atlas, normals and AO baked from its level-3 sculpt onto
    level 1, arms brought down by a small rig, then each look's skin (painted by code) and shape."""
    import bmesh
    import bpy
    from mathutils import Matrix, Vector

    np = _np()
    bpy.ops.wm.open_mainfile(filepath=bundle)
    src = bpy.data.objects[f"GEO-body_{ {'man': 'male', 'woman': 'female'}[who] }_realistic"]
    eyes = [c for c in src.children if c.type == "MESH"]
    keep = {src.name, *(e.name for e in eyes)}
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o)
    sc = cycles()
    for c in list(bpy.data.collections):
        for o in list(c.objects):
            if o.name in keep and o.name not in sc.collection.objects:
                sc.collection.objects.link(o)
        bpy.data.collections.remove(c)
    dx = src.location.x
    src.location.x = 0
    bpy.context.view_layer.update()
    for o in [src, *eyes]:
        o.data.materials.clear()
        for p in o.data.polygons:
            p.use_smooth = True
    # one atlas: the UDIM tiles' islands packed into 0…1
    bpy.context.view_layer.objects.active = src
    for o in [x for x in bpy.data.objects if x is not None and x.name in bpy.context.view_layer.objects]:
        o.select_set(o == src)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=False, margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = np.empty(len(src.data.uv_layers[0].data) * 2)
    src.data.uv_layers[0].data.foreach_get("uv", uv)
    print(f"  uv packed: {uv.min():.3f}…{uv.max():.3f}")

    def level(n, name):
        o = src.copy()
        o.data = src.data.copy()
        o.name = name
        sc.collection.objects.link(o)
        mr = next(m for m in o.modifiers if m.type == "MULTIRES")
        mr.levels = n
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mr.name)
        print(f"  {name}: level {n}, {len(o.data.polygons)} faces")
        return o

    low = level(1, "body")
    hi = level(3, "hi")
    nrm = image("nrm", data=True)
    bake("NORMAL", low, nrm, high=hi, extrusion=0.006, ray=0.02)
    ao = image("ao", data=True)
    sc.cycles.samples = 128
    bake("AO", low, ao, high=hi, extrusion=0.006, ray=0.02)
    bpy.data.objects.remove(hi)
    bpy.data.objects.remove(src)
    nrm = on_disk(nrm)
    for e in eyes:
        mw = e.matrix_world.copy()
        e.parent = None
        e.matrix_world = mw
    A = np.clip(pixels(ao)[..., 0], 0, 1)
    pos = emit_position(low, image("pos", float_buffer=True))
    eye_pos = [emit_position(e, image(f"pos-{e.name}", float_buffer=True, size=512)) for e in eyes]
    LM = BS_LM[who]
    # (positions in the body's own frame: x across, y front −, z up — metres)

    # ---- the rest pose: a small rig (trunk, clavicles, arms, legs) weighted by bone heat — on the mesh
    # scaled ×10 (heat weighting fails on a small body) — then posed by linear blend in numpy: the arm's
    # turn shared with the clavicle, the forearm straightened, the legs hung from the hips (feet under them)
    P = np.empty(len(low.data.vertices) * 3)
    low.data.vertices.foreach_get("co", P)
    P = P.reshape(-1, 3)

    def at(x, z, r=0.035, keep=None):
        m = (np.abs(P[:, 0] - x) < r) & (np.abs(P[:, 2] - z) < r)
        if keep is not None:
            m &= keep
        near = P[m]
        return near.mean(0) if len(near) else np.array([x, 0.0, z])

    def ring(z, sx):
        # the leg's section at a height: its centre (the arms kept out by |x| < 0.26)
        m = (np.abs(P[:, 2] - z) < 0.015) & (P[:, 0] * sx > 0.012) & (np.abs(P[:, 0]) < 0.26)
        return P[m].mean(0)

    def rot(axis, ang):
        axis = axis / np.linalg.norm(axis)
        K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
        return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K

    def between(u, v, k=1.0):
        u = u / np.linalg.norm(u)
        v = v / np.linalg.norm(v)
        ax = np.cross(u, v)
        if np.linalg.norm(ax) < 1e-9:
            return np.eye(3)
        return rot(ax, k * math.acos(float(np.clip(np.dot(u, v), -1, 1))))

    zmin = float(P[:, 2].min())
    H = float(P[:, 2].max() - zmin)
    J = {}
    for S, sx in (("L", 1), ("R", -1)):
        Sj, Ej, Wj, Tj = (at(sx * x, z) for x, z in LM["arm"])
        J[f"clav.{S}"] = (np.array([sx * 0.02, Sj[1] - 0.01, Sj[2] - 0.015]), Sj)
        J[f"upper.{S}"] = (Sj, Ej)
        J[f"fore.{S}"] = (Ej, Wj)
        J[f"hand.{S}"] = (Wj, Tj)
        hip = ring(zmin + 0.47 * H, sx)
        hip[2] = zmin + 0.52 * H
        knee = ring(zmin + 0.285 * H, sx)
        ank = ring(zmin + 0.055 * H, sx)
        J[f"thigh.{S}"] = (hip, knee)
        J[f"shin.{S}"] = (knee, ank)
        J[f"foot.{S}"] = (ank, ank + np.array([0, -0.12, -0.03]))
    J["trunk"] = (np.array([0, 0, zmin + 0.52 * H]), np.array([0, 0, zmin + 0.8 * H]))
    J["head"] = (np.array([0, 0, zmin + 0.8 * H]), np.array([0, 0, zmin + H]))
    PARENT = {"trunk": None, "head": "trunk"}
    for S in "LR":
        PARENT.update({f"clav.{S}": "trunk", f"upper.{S}": f"clav.{S}", f"fore.{S}": f"upper.{S}", f"hand.{S}": f"fore.{S}",
                       f"thigh.{S}": "trunk", f"shin.{S}": f"thigh.{S}", f"foot.{S}": f"shin.{S}"})
    SCALE = 10.0
    ad = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", ad)
    sc.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for n, (h, t) in J.items():
        eb = ad.edit_bones.new(n)
        eb.head = Vector(h * SCALE)
        eb.tail = Vector(t * SCALE)
    for n, par in PARENT.items():
        if par:
            ad.edit_bones[n].parent = ad.edit_bones[par]
    bpy.ops.object.mode_set(mode="OBJECT")
    low.data.vertices.foreach_set("co", (P * SCALE).ravel())
    low.data.update()
    for o in [x for x in bpy.data.objects if x is not None and x.name in bpy.context.view_layer.objects]:
        o.select_set(o in (low, rig))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    low.data.vertices.foreach_set("co", P.ravel())
    low.data.update()
    for m in list(low.modifiers):
        low.modifiers.remove(m)
    low.parent = None
    names = list(J)
    Wt = np.zeros((len(P), len(names)))
    for v in low.data.vertices:
        for g in v.groups:
            gn = low.vertex_groups[g.group].name
            if gn in names:
                Wt[v.index, names.index(gn)] = g.weight
    sw = Wt.sum(1)
    print(f"  heat weights: {int((sw > 0).sum())} of {len(P)} vertices")
    Wt[sw == 0, names.index("trunk")] = 1
    Wt /= Wt.sum(1, keepdims=True)
    bpy.data.objects.remove(rig)
    # each bone's world transform (M, t): p' = M p + t
    X = {}

    def compose(par, R, pivot):
        Mp, tp = X[par] if par else (np.eye(3), np.zeros(3))
        # the turn R about the pivot (in the rest frame), after the parent's
        return Mp @ R, Mp @ (pivot - R @ pivot) + tp

    def apply(n, p):
        M, t = X[n]
        return M @ p + t

    X["trunk"] = (np.eye(3), np.zeros(3))
    X["head"] = X["trunk"]
    for S, sx in (("L", 1), ("R", -1)):
        Sj, Ej = J[f"upper.{S}"]
        Wj = J[f"fore.{S}"][1]
        Cj = J[f"clav.{S}"][0]
        want = np.array([sx * math.sin(math.radians(5)), -0.02, -math.cos(math.radians(5))])
        full = between(Ej - Sj, want)
        X[f"clav.{S}"] = compose("trunk", between(Ej - Sj, want, 0.18), Cj)
        # the upper arm: the rest of the way, about the shoulder as the clavicle left it
        Rc = X[f"clav.{S}"][0]
        d1 = Rc @ (Ej - Sj)
        Ru = between(d1, want)
        Mc, tc = X[f"clav.{S}"]
        Sp = Mc @ Sj + tc
        X[f"upper.{S}"] = (Ru @ Mc, Ru @ (tc - Sp) + Sp)
        # the forearm along the upper arm, a few degrees bent forward
        Mu, tu = X[f"upper.{S}"]
        Ep = Mu @ Ej + tu
        f1 = Mu @ (Wj - Ej)
        fwant = want + np.array([0, -0.12, 0])
        Rf = between(f1, fwant)
        X[f"fore.{S}"] = (Rf @ Mu, Rf @ (tu - Ep) + Ep)
        X[f"hand.{S}"] = X[f"fore.{S}"]
        # the legs: the ankle under the hip, a little out
        hip, knee = J[f"thigh.{S}"]
        ank = J[f"shin.{S}"][1]
        Rt = between(ank - hip, np.array([sx * 0.05, 0, -1.0]))
        X[f"thigh.{S}"] = (Rt, hip - Rt @ hip)
        X[f"shin.{S}"] = X[f"thigh.{S}"]
        X[f"foot.{S}"] = X[f"thigh.{S}"]
    Q = np.zeros_like(P)
    for i, n in enumerate(names):
        M, t = X[n]
        Q += Wt[:, i : i + 1] * (P @ M.T + t)
    armw = sum(Wt[:, names.index(f"{b}.{S}")] for b in ("upper", "fore", "hand") for S in "LR")
    print(f"  arm weights: {int((armw > 0.5).sum())} vertices")
    low.data.materials.clear()
    low.data.materials.append(bpy.data.materials.new("skin"))
    low.data.materials.append(mat("bottom", rgb=(0.05, 0.08, 0.16), rough=0.85))
    low.data.materials.append(mat("top", rgb=(0.3, 0.05, 0.05), rough=0.85))
    cloth_slots(low, armw, H, who, z0=zmin)
    low.data.vertices.foreach_set("co", Q.ravel())
    low.data.update()

    # ---- the looks
    np.random.seed(1)
    on = pixels(bpy.data.images["pos"])[..., 3] > 0.5
    p3 = pos[..., :3]
    x, y, z = p3[..., 0], p3[..., 1], p3[..., 2]
    ax = np.abs(x)
    front = sstep(-0.005, -0.03, y - (np.median(P[np.abs(P[:, 2] - LM["mouth"]) < 0.01, 1]) if True else 0))
    face_front = y < np.percentile(P[np.abs(P[:, 2] - LM["mouth"]) < 0.02, 1], 40) + 0.03
    base_low = [low]
    Pp = np.empty(len(low.data.vertices) * 3)
    low.data.vertices.foreach_get("co", Pp)
    Pp = Pp.reshape(-1, 3)
    only = os.environ.get("MOCK_LOOKS", "").split(",") if os.environ.get("MOCK_LOOKS") else None
    for look, skins in BS_SKIN.items():
        if only and look not in only:
            continue
        K = skins[who]
        rgb = np.ones(p3.shape, dtype=np.float32) * np.array(K["tone"], dtype=np.float32)
        # mottling and grain (luminance and a little redness)
        m1 = noise3(p3, 18, 1) - 0.5
        m2 = noise3(p3, 140, 2) - 0.5
        m3 = noise3(p3, 600, 3) - 0.5
        lum = 1 + K["mottle"] * 2.2 * m1 + K["grain"] * 2 * m2 + K["grain"] * 1.5 * m3
        rgb *= lum[..., None]
        red = np.array([1.0, 0.82, 0.8])
        rgb *= (1 + (K["mottle"] * 1.5 * (noise3(p3, 9, 4) - 0.5))[..., None] * (red - 1)[None, None] * -2) if False else 1
        # warmer where blood shows: cheeks, nose, ears, knees, elbows, hands, feet
        warm = np.zeros_like(x)
        dz = z - (LM["eye"] - 0.03)
        for sx in (1, -1):
            warm = np.maximum(warm, np.exp(-(((x - sx * 0.045) / 0.025) ** 2 + (dz / 0.02) ** 2)) * face_front)
        warm = np.maximum(warm, np.exp(-((x / 0.012) ** 2 + ((z - (LM["eye"] - 0.035)) / 0.02) ** 2)) * 0.6 * face_front)
        warm = np.maximum(warm, sstep(0.6, 0.55, z) * sstep(0.4, 0.45, z) * 0.0)
        warm = np.maximum(warm, (z < 0.12) * 0.5)
        warm = np.maximum(warm, (ax > 0.33) * (z < 0.95) * 0.5)
        rgb = rgb * (1 - K["blush"] * warm)[..., None] + (K["blush"] * warm)[..., None] * rgb * np.array([1.35, 0.85, 0.8])
        # freckles
        if K["freckles"]:
            fr = sstep(0.82, 0.9, noise3(p3, 260, 5)) * K["freckles"] * (z > LM["eye"] - 0.08) * (z < LM["eye"] + 0.02) * face_front
            rgb *= (1 - 0.35 * fr)[..., None]
        # lips: an outline across the mouth (the top lip's bow, the lower fuller), soft at the edge
        u = x / LM["lip_w"]
        top = LM["mouth"] + (LM["lip_top"] - LM["mouth"]) * np.clip(1 - u**2, 0, 1) ** 0.5 * (1 - 0.25 * np.exp(-(u / 0.18) ** 2))
        bot = LM["mouth"] - (LM["mouth"] - LM["lip_bot"]) * np.clip(1 - u**2, 0, 1) ** 0.7
        inside = (np.abs(u) < 1) * sstep(top + 0.0015, top - 0.001, z) * sstep(bot - 0.0015, bot + 0.001, z) * face_front
        lips = np.array(K["lips"], dtype=np.float32)
        rgb = rgb * (1 - 0.85 * inside)[..., None] + (0.85 * inside)[..., None] * lips * (0.9 + 0.2 * noise3(p3, 400, 6))[..., None]
        # brows: an arch over each eye, hairs along it (a streak noise), thinning outward
        bw = np.zeros_like(x)
        for sx in (1, -1):
            t = (x * sx - LM["eye_x"] + 0.004) / 0.026  # (−1 inner … 1 outer)
            arch = LM["brow"] + 0.004 * (1 - t**2) - 0.003 * (t > 0) * t
            half = 0.0045 * (1 - 0.55 * np.clip(t, 0, 1)) * (1 + 0.25 * np.clip(-t, 0, 1))
            bw = np.maximum(bw, (np.abs(t) < 1.05) * sstep(half, half * 0.6, np.abs(z - arch)) * sstep(1.05, 0.85, np.abs(t)))
        strands = 0.55 + 0.45 * sstep(0.35, 0.7, noise3(np.stack([x * 6, z * 60, y * 6], -1), 120, 7))
        bw = bw * strands * K["brow_k"] * face_front
        rgb = rgb * (1 - bw)[..., None] + bw[..., None] * np.array(K["brow"], dtype=np.float32)
        # the man's nipples
        if LM["nipple"]:
            nx, nz = LM["nipple"]
            for sx in (1, -1):
                d = np.hypot(x - sx * nx, z - nz)
                n = sstep(0.014, 0.009, d) * (y < 0)
                rgb = rgb * (1 - 0.5 * n)[..., None] + (0.5 * n)[..., None] * rgb * np.array([0.8, 0.55, 0.5])
        # a shaved scalp's shadow on the man (GTA, Sims): the hairline's area a little cooler/darker
        if who == "man":
            scalp = sstep(LM["brow"] + 0.025, LM["brow"] + 0.045, z) * (z > 1.4) * 0.35
            scalp = scalp * sstep(-0.02, 0.03, -(y - 0.0) * 0 + (z - LM["eye"]))
            rgb = rgb * (1 - scalp)[..., None] + scalp[..., None] * rgb * np.array([0.55, 0.55, 0.6])
        rgb *= (0.55 + 0.45 * A)[..., None]
        out_img = image(f"albedo-{look}")
        a = np.concatenate([np.clip(np.nan_to_num(rgb, nan=0.5), 0, 1), np.ones_like(x)[..., None]], -1)
        a[~on] = 0
        put(out_img, a)
        if os.environ.get("MOCK_DEBUG"):
            save_png(out_img, os.path.join(os.environ["MOCK_DEBUG"], f"bs-{who}-{look}-albedo.png"))
            if look == "sims4":
                save_png(ao, os.path.join(os.environ["MOCK_DEBUG"], f"bs-{who}-ao.png"))
                save_png(nrm, os.path.join(os.environ["MOCK_DEBUG"], f"bs-{who}-nrm.png"))
                print("  on:", float(on.mean()), "pos range", float(np.nanmin(p3)), float(np.nanmax(p3)))
        # the eyes: sclera, an iris ring by the angle off the eye's forward (−y), the pupil
        eye_mats = []
        for e, ep in zip(eyes, eye_pos, strict=True):
            c = np.array(e.matrix_world.translation)
            ev = ep[..., :3] - c
            ev /= np.maximum(np.linalg.norm(ev, axis=-1, keepdims=True), 1e-6)
            ang = np.degrees(np.arccos(np.clip(-ev[..., 1], -1, 1)))
            iris_c = np.array({"sims4": (0.12, 0.2, 0.32), "inzoi": (0.08, 0.04, 0.02), "gtav": (0.3, 0.52, 0.52)}[look])
            sclera = np.array([0.82, 0.78, 0.74]) * (1 - 0.15 * sstep(50, 80, ang))[..., None]
            ir = iris_c * (0.75 + 0.5 * noise3(ep[..., :3] * np.array([1, 1, 1]), 900, 8))[..., None]
            ir = ir * (1 - 0.6 * sstep(23, 28, ang))[..., None]
            col = np.where((ang < 29)[..., None], ir, sclera)
            col = np.where((ang < 10)[..., None], 0.01, col)
            eimg = image(f"eye-{e.name}-{look}", size=512)
            put(eimg, np.concatenate([col, np.ones(ang.shape)[..., None]], -1))
            eye_mats.append(mat(f"eye-{look}", img=eimg, rough=0.1))
        # its shape: Sims 4 a larger head; inZOI longer legs; GTA V as sculpted
        ob = low.copy()
        ob.data = low.data.copy()
        ob.name = f"body-{look}"
        sc.collection.objects.link(ob)
        ob.data.materials[0] = mat("skin", img=on_disk(out_img), nrm=nrm, rough=0.5)
        es = []
        for e, em in zip(eyes, eye_mats, strict=True):
            e2 = e.copy()
            e2.data = e.data.copy()
            sc.collection.objects.link(e2)
            e2.data.materials.clear()
            e2.data.materials.append(em)
            es.append(e2)
        eye_c = float(np.mean([np.array(e.matrix_world.translation) for e in eyes], 0)[1])

        def shape(Q):
            Q = Q.copy()
            if look == "sims4":
                hc = np.array([0, eye_c + 0.04, LM["eye"] - 0.05])
                d = np.linalg.norm(Q - hc, axis=1)
                k = 1 + 0.1 * sstep(0.2, 0.12, d)
                Q = hc + (Q - hc) * k[:, None]
            elif look == "inzoi":
                zh = 0.92 if who == "man" else 0.88
                Q[:, 2] = np.where(Q[:, 2] < zh, Q[:, 2] * 1.04, Q[:, 2] + zh * 0.04)
            return Q

        Q = shape(Pp)
        for e2 in es:
            mw = np.array(e2.matrix_world)
            E = np.empty(len(e2.data.vertices) * 3)
            e2.data.vertices.foreach_get("co", E)
            E = E.reshape(-1, 3)
            W = E @ mw[:3, :3].T + mw[:3, 3]
            W = shape(W)
            E = (W - mw[:3, 3]) @ np.linalg.inv(mw[:3, :3]).T
            e2.data.vertices.foreach_set("co", E.ravel())
            e2.data.update()
        ob.data.vertices.foreach_set("co", Q.ravel())
        ob.data.update()
        export([ob, *es], os.path.join(out, f"bs-{look}-{who}.glb"))
        bpy.data.objects.remove(ob)
        for e2 in es:
            bpy.data.objects.remove(e2)


if __name__ == "__main__" and "--" in sys.argv:
    a = sys.argv[sys.argv.index("--") + 1 :]
    if a[0] == "mh":
        run_mh(*a[1:5])
    elif a[0] == "bs":
        run_bs(*a[1:4])

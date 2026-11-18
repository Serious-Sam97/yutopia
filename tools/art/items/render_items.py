# Plan 86 — the items as pictures of the things themselves (F2a): each rendered from its own 3D model, lamp-lit, on
# transparent black, for the inventory. The guns from the game's own GLBs (public/life/guns — plans 79–84); the
# rounds and things to use from their parts (the AK's magazine, the Daybreak's cell, the speedloader) or small
# models built here.
#   blender -b --factory-startup -P tools/art/items/render_items.py [-- --only revolver,aid] [-- --out <dir>]
#   blender -b --factory-startup -P tools/art/items/render_items.py -- --game
# Phase 0 (the mocks) renders them to design/inventory/items (PNG); `--game` (phase 1) to the game's
# apps/client/public/life/items (WEBP with its alpha, the sizes the panel and the HUD draw them at, twice over).
import json
import math
import os
import struct
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


# (plan 103) the skateboards: the game's own GLB if it's built (tools/art/skate → public/life/skate/<variant>.glb),
# else a deck modelled here at its measures — its plies painted, the grip on top, the kicks, the trucks, the wheels
SKATE = os.path.join(ROOT, "apps/client/public/life/skate")
SKATE_TEX = os.path.join(ROOT, "tools/art/skate/tex-src")
BOARD_SHAPES = {
    # length, width, wheelbase, wheel radius, wheel width, deck over the axles, (nose kick len, angle), (tail …)
    "vert": (0.76, 0.25, 0.38, 0.032, 0.042, 0.05, (0.08, 0.22), (0.15, 0.3)),
    "street": (0.8, 0.205, 0.36, 0.025, 0.032, 0.045, (0.13, 0.36), (0.13, 0.36)),
    "cruiser": (0.74, 0.23, 0.4, 0.03, 0.04, 0.06, (0.0, 0.0), (0.13, 0.3)),
}
# (each variant: its paint, its wheels — the pack's drawings' and the ground model's colours, tp/items3d.ts)
BOARDS = {
    "vert-classic": (0xE4007C, 0xF2EFE4),
    "vert-fish": (0x00A6A6, 0xF4F1E6),
    "vert-square": (0x2B3BFF, 0xFFFFFF),
    "street-pop": (0xC8A27A, 0xF3F0E8),
    "street-slick": (0x1A1A1A, 0xF3F0E8),
    "street-tech": (0x3C6E47, 0xF3F0E8),
    "cruiser-classic": (0xFF7F50, 0xFF8A3D),
    "cruiser-wood": (0xB98B5E, 0xF0E68C),
    "cruiser-mini": (0xFF4F79, 0xFFFFFF),
}


def srgb_lin(hexc):
    return tuple(pow(((hexc >> sh) & 255) / 255.0, 2.2) for sh in (16, 8, 0))


def board_manifest():
    p = os.path.join(SKATE, "manifest.json")
    if not os.path.exists(p):
        return {}
    with open(p) as f:
        return json.load(f).get("boards", {})


def board_glb(variant):
    """The game's GLB of a board, its KTX2 textures swapped for their PNG sources (tools/art/skate/tex-src: Blender
    reads no basisu) in a copy beside the output; the paint and wheels tinted as the game tints them (the manifest's
    first colours). The meshes, or None if it isn't built."""
    src = os.path.join(SKATE, f"{variant}.glb")
    if not os.path.exists(src):
        return None
    with open(src, "rb") as f:
        b = f.read()
    n0, _ = struct.unpack("<II", b[12:20])
    j = json.loads(b[20 : 20 + n0])
    rest = b[20 + n0 :]
    for k in ("extensionsUsed", "extensionsRequired"):
        if k in j:
            j[k] = [e for e in j[k] if e != "KHR_texture_basisu"]
    have = []
    for im in j.get("images", []):
        png = os.path.join(SKATE_TEX, os.path.splitext(os.path.basename(im.get("uri", "")))[0] + ".png")
        have.append(os.path.exists(png))
        im["uri"] = png
        im["mimeType"] = "image/png"
    gone = set()
    for i, t in enumerate(j.get("textures", [])):
        bu = t.pop("extensions", {}).get("KHR_texture_basisu")
        if bu:
            t["source"] = bu["source"]
        if not have[t.get("source", 0)]:
            gone.add(i)
    # (a shared map with no PNG here — the cars' paint normal, its ORM: left off, the factors stand)
    for m in j.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        for d in (m, pbr):
            for k in [k for k, v in d.items() if k.endswith("Texture") and v.get("index") in gone]:
                del d[k]
    js = json.dumps(j).encode()
    js += b" " * (-len(js) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest
    tmp = os.path.join(OUT, f".{variant}.glb")
    with open(tmp, "wb") as f:
        f.write(out)
    try:
        bpy.ops.import_scene.gltf(filepath=tmp)
    finally:
        os.remove(tmp)
    objs = [o for o in bpy.context.selected_objects if o.name in bpy.data.objects]
    for o in list(objs):
        if o.name.startswith("collider"):
            bpy.data.objects.remove(o, do_unlink=True)
            objs.remove(o)
    man = board_manifest().get(variant, {})

    def hexlin(h):
        h = h.lstrip("#")
        return tuple(pow(int(h[i : i + 2], 16) / 255.0, 2.2) for i in (0, 2, 4))

    tint = {"paint": man.get("colours", [None])[0], "urethane": man.get("wheel_colours", [None])[0]}
    for m in bpy.data.materials:
        c = tint.get(m.name.split(".")[0])
        if c and m.use_nodes and "Principled BSDF" in m.node_tree.nodes:
            m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*hexlin(c), 1)
    return objs


def board_model(variant):
    shape = variant.split("-")[0]
    L, W, wb, r, ww, rise, nose, tail = BOARD_SHAPES[shape]
    if variant == "street-tech":
        W, r, nose = 0.197, 0.024, (0.15, 0.36)
    if variant == "cruiser-mini":
        L, wb = 0.69, 0.36
    paint_c, wheel_c = BOARDS[variant]
    paint = mat("paint", srgb_lin(paint_c), 0.35 if variant != "street-slick" else 0.15)
    grip = mat("grip", (0.03, 0.03, 0.035), 0.95)
    alloy = mat("alloy", (0.68, 0.69, 0.71), 0.3, 1.0)
    steel = mat("steel", (0.5, 0.5, 0.52), 0.35, 1.0)
    urethane = mat("urethane", srgb_lin(wheel_c), 0.55)
    t = 0.012
    z = r + rise + t / 2
    nf = L / 2 - nose[0] - W / 4
    tf = L / 2 - tail[0] - W / 4
    box(nf + tf, W, t, ((nf - tf) / 2, 0, z), m=paint, bevel=0.002)
    box(nf + tf, W - 0.006, 0.002, ((nf - tf) / 2, 0, z + t / 2 + 0.001), m=grip)

    def kick(d, length, a, at):
        # a kick out from the flat's end (d +1 the nose, −1 the tail) and its round tip, both turned up by `a`
        parts = []
        if length > 0:
            parts.append(box(length, W, t, (d * length / 2, 0, 0), m=paint, bevel=0.002))
            parts.append(box(length, W - 0.006, 0.002, (d * length / 2, 0, t / 2 + 0.001), m=grip))
        tip = cyl(W / 2, t, (d * length, 0, 0), m=paint, verts=32)
        tip.scale = (0.5, 1, 1)
        parts.append(tip)
        top = cyl(W / 2 - 0.003, 0.002, (d * length, 0, t / 2 + 0.001), m=grip, verts=32)
        top.scale = (0.5, 1, 1)
        parts.append(top)
        piv = bpy.data.objects.new(f"kick{d}", None)
        bpy.context.scene.collection.objects.link(piv)
        for o in parts:
            o.parent = piv
        piv.location = (d * at, 0, z)
        piv.rotation_euler = Euler((0, -d * a, 0))

    kick(1, nose[0], nose[1], nf)
    kick(-1, tail[0], tail[1], tf)
    half = W / 2 - ww / 2
    for x in (wb / 2, -wb / 2):
        box(0.06, 0.055, 0.012, (x, 0, z - t / 2 - 0.006), m=alloy, bevel=0.002)
        box(0.022, 0.03, rise - 0.012, (x, 0, r + (rise - 0.012) / 2), m=alloy, bevel=0.003)
        box(0.03, half * 1.5, 0.022, (x, 0, r + 0.004), m=alloy, bevel=0.004)
        cyl(0.004, 2 * half + ww, (x, 0, r), rot=(math.pi / 2, 0, 0), m=steel, verts=12)
        for y in (half, -half):
            cyl(r, ww, (x, y, r), rot=(math.pi / 2, 0, 0), m=urethane, verts=32)
    bpy.context.view_layer.update()
    return [o for o in bpy.data.objects if o.type in ("MESH", "EMPTY")]


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
    elif name == "vxtape":
        # (plan 88) Vortex's cassette — the trophy: a black shell, his pink label, the two reel windows, the tape
        # pulled out of it in a loop
        shell = mat("shell", (0.025, 0.025, 0.03), 0.45)
        pink = mat("label", (1.0, 0.12, 0.45), 0.5)
        white = mat("hub", (0.85, 0.85, 0.85), 0.4)
        tapem = mat("tape", (0.12, 0.07, 0.04), 0.3, 0.4)
        glass = mat("window", (0.6, 0.65, 0.7), 0.1, 0.0, alpha=0.35, trans=0.8)
        box(0.1, 0.012, 0.064, (0, 0, 0), m=shell, bevel=0.003)
        box(0.084, 0.0125, 0.034, (0, -0.0002, 0.008), m=pink, bevel=0.001)
        box(0.05, 0.0128, 0.012, (0, -0.0003, 0.006), m=glass)
        for x in (-0.017, 0.017):
            cyl(0.0055, 0.0132, (x, 0, 0.006), rot=(math.pi / 2, 0, 0), m=white)
        box(0.05, 0.0125, 0.012, (0, 0, -0.026), m=shell, bevel=0.002)
        # (the tape: a ribbon pulled out of the shell's foot, hanging)
        box(0.006, 0.0012, 0.05, (0.006, 0.0, -0.055), m=tapem)
        box(0.006, 0.0012, 0.03, (-0.004, 0.0, -0.088), m=tapem)
        objs = list(bpy.data.objects)
        turn = (math.radians(-12), 0, math.radians(-16))
    elif name == "chains":
        # (plan 93 S6) a snow chain laid out flat: its two side chains, the ladder's cross chains between them (the
        # links' own steel, a little rust at the joins), a yellow tensioner hook at one end
        steel = mat("steel", (0.55, 0.56, 0.58), 0.32, 1.0)
        rust = mat("rust", (0.32, 0.17, 0.08), 0.75, 0.4)
        yellow = mat("hook", (0.95, 0.72, 0.08), 0.45, 0.1)

        def link(at, rot, m=steel):
            bpy.ops.mesh.primitive_torus_add(
                major_radius=0.007, minor_radius=0.0019, major_segments=20, minor_segments=8, location=at, rotation=rot
            )
            o = bpy.context.object
            o.scale = (1.0, 1.55, 1.0)
            put(o, m)

        n = 14
        step = 0.0165
        for side in (-0.045, 0.045):
            for i in range(n):
                y = (i - n / 2) * step
                link((side, y, 0), (0, 0, 0) if i % 2 else (0, math.pi / 2, 0), rust if i % 5 == 4 else steel)
        for j in range(4):
            y = (j - 1.5) * step * 3.4
            for k in range(5):
                x = (k - 2) * step
                link((x, y, 0.0006), (0, 0, math.pi / 2) if k % 2 else (math.pi / 2, 0, math.pi / 2))
        box(0.014, 0.022, 0.006, (0.045, (n / 2 + 0.6) * step, 0), m=yellow, bevel=0.002)
        objs = list(bpy.data.objects)
        turn = (math.radians(-55), 0, math.radians(-25))
    elif name == "wrench":
        # (plan 93 S7) a combination wrench: the shank, its open jaw at one end, the ring at the other
        steel = mat("steel", (0.62, 0.63, 0.66), 0.25, 1.0)
        dark = mat("dark", (0.08, 0.08, 0.09), 0.5, 0.6)
        box(0.012, 0.004, 0.16, (0, 0, 0), m=steel, bevel=0.0015)
        # (the open jaw: a base and its two prongs, a gap between them, turned 15° off the shank)
        box(0.036, 0.005, 0.012, (0, 0, 0.084), m=steel, bevel=0.002)
        for sx in (-1, 1):
            box(0.01, 0.005, 0.024, (sx * 0.013, 0, 0.1), m=steel, bevel=0.002)
        void = dark
        bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.0045, location=(0, 0, -0.088), rotation=(math.pi / 2, 0, 0))
        put(bpy.context.object, steel)
        objs = list(bpy.data.objects)
        turn = (0, math.radians(60), math.radians(-30))
    elif name.startswith("board_"):
        # (plan 103) a skateboard, three-quarter from above: its grip, a kick, the wheels past its edge
        variant = name[6:].replace("_", "-", 1)
        objs = board_glb(variant) or board_model(variant)
        turn = (math.radians(-58), 0, math.radians(-38))
    elif name == "towrope":
        # (plan 93 S7) a tow rope coiled: an orange strap in loops, a steel hook out of it each end
        orange = mat("rope", (0.9, 0.42, 0.06), 0.8)
        steel = mat("hook", (0.6, 0.6, 0.63), 0.3, 1.0)
        for i, r in enumerate((0.05, 0.043, 0.036)):
            bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.006, major_segments=40, location=(0, 0, i * 0.004))
            o = bpy.context.object
            o.scale = (1.0, 0.8, 1.0)
            put(o, orange)
        # (its two ends off the coil, flat straps out to either side, a hook on each)
        for sx in (-1, 1):
            box(0.045, 0.012, 0.003, (sx * 0.072, -0.012, 0.009), m=orange)
            bpy.ops.mesh.primitive_torus_add(
                major_radius=0.01, minor_radius=0.003, location=(sx * 0.1, -0.012, 0.009), rotation=(math.pi / 2, 0, 0)
            )
            put(bpy.context.object, steel)
        objs = list(bpy.data.objects)
        turn = (math.radians(-50), 0, math.radians(15))
    frame(objs, res, turn)
    render(name)


for n in ("revolver", "shotgun", "ak47", "sniper", "daybreak", "r38", "shell", "r762", "r308", "cell", "flare",
          "battery", "aid", "fuse", "torch", "vxtape", "chains", "wrench", "towrope",
          *(f"board_{v.replace('-', '_', 1)}" for v in BOARDS)):
    item(n)

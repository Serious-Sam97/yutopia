# Plan 126 phase 1 — stills of the built animals, read back from their .glb (the round trip checked too):
#   lineup.png   every animal at true scale, side by side, nose along +X (a 1.8 m post for scale)
#   poses-*.png  a grid: each animal (fitted to its cell) in a few of its clips
#   blender -b --factory-startup -P tools/art/animals/contact_sheet.py -- [--only a,b] [--out DIR] [--clips idle,walk]
import bpy
import json
import math
import os
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
GLB = os.path.join(ROOT, "apps/client/public/life/animals")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUTDIR = arg("--out", os.path.join(ROOT, "design/screens/animals"))
man = json.load(open(os.path.join(GLB, "manifest.json")))
ORDER = [k for k in man if not k.startswith("_")]
ONLY = arg("--only")
NAMES = ONLY.split(",") if ONLY else ORDER
CLIPS = (arg("--clips") or "idle,walk,run,eat,lie,sit,die,fly,glide,swim").split(",")
VIEW = arg("--view", "side")  # side | three


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB, f"{name}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    mesh = max((o for o in new if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)),
               key=lambda o: len(o.data.vertices))
    acts = {}
    for a in bpy.data.actions:
        if a.name not in [x for v in acts.values() for x in [v.name]]:
            pass
    ad = arm.animation_data
    if ad:
        for t in ad.nla_tracks:
            for s in t.strips:
                acts[t.name] = s.action
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
    if not acts:
        for a in bpy.data.actions:
            acts[a.name.split("_")[0]] = a
    return arm, mesh, new, acts


def posed_copy(arm, mesh, act, frac, name):
    """A static copy of the mesh in a clip at a fraction of its length."""
    arm.animation_data_create()
    if act is None:
        arm.animation_data.action = None
        arm.data.pose_position = "REST"
    else:
        arm.data.pose_position = "POSE"
        arm.animation_data.action = act
        if act.slots:
            arm.animation_data.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        # (a gait keyed quicker than 24 a second: between whole frames too)
        f = f0 + (f1 - f0) * frac
        bpy.context.scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mesh.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o = bpy.data.objects.new(name, me)
    o.matrix_world = mesh.matrix_world.copy()
    bpy.context.scene.collection.objects.link(o)
    return o


def bounds(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def text(s, loc, size):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = s
    cu.size = size
    cu.align_x = "CENTER"
    o = bpy.data.objects.new("t", cu)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new("ink")
    m.diffuse_color = (0.08, 0.08, 0.08, 1)
    cu.materials.append(m)
    return o


def setup_render(w, h, lo, hi, pad=0.05, view="side"):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "VERTEX"
    sh.show_cavity = False
    sh.show_shadows = False
    sh.show_specular_highlight = False
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    sc.world = world
    sh.background_type = "VIEWPORT"
    sh.background_color = (0.93, 0.92, 0.89)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    c = (lo + hi) / 2
    span = max((hi.x - lo.x) * h / w, hi.z - lo.z) * (1 + pad)
    cam.data.ortho_scale = span * max(1.0, w / h)
    if view == "side":
        cam.location = (c.x, c.y - 100, c.z)
        cam.rotation_euler = (math.pi / 2, 0, 0)
    elif view == "rear":
        # (from behind and to the left, a little above: the rump, the hind legs)
        el, az = math.radians(18), math.radians(-140)
        cam.location = (c.x + 100 * math.cos(el) * math.sin(az) * -1, c.y - 100 * math.cos(el) * math.cos(az) * -1, c.z + 100 * math.sin(el))
        cam.location = (c.x - 100 * math.cos(el) * 0.64, c.y - 100 * math.cos(el) * 0.77, c.z + 100 * math.sin(el))
        cam.rotation_euler = (math.pi / 2 - el, 0, math.radians(-40))
    else:
        el = math.radians(22)
        cam.location = (c.x, c.y - 100 * math.cos(el), c.z + 100 * math.sin(el))
        cam.rotation_euler = (math.pi / 2 - el, 0, 0)
    cam.data.clip_end = 1000
    return sc


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


def ground(x0, x1, z=0.0):
    me = bpy.data.meshes.new("g")
    me.from_pydata([(x0, -5, z - 0.002), (x1, -5, z - 0.002), (x1, 5, z - 0.002), (x0, 5, z - 0.002)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("g", me)
    bpy.context.scene.collection.objects.link(o)
    return o


def band(x0, x1, z, w=0.004):
    """A ground line seen from the side camera: a thin band upright in XZ, behind the animals."""
    me = bpy.data.meshes.new("band")
    me.from_pydata([(x0, 2, z - w), (x1, 2, z - w), (x1, 2, z), (x0, 2, z)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new("band", me)
    bpy.context.scene.collection.objects.link(o)
    return o


def lineup():
    reset()
    x = 0.0
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    gap = 0.12
    labels = []
    for n in NAMES:
        arm, mesh, new, acts = load(n)
        act = acts.get("idle")
        o = posed_copy(arm, mesh, act, 0.0, n)
        for ob in new:
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.context.view_layer.update()
        a, b = bounds(o)
        o.location.x += x - a.x
        if man[n].get("source") in ("bat", "fish"):
            o.location.z += -a.z + 0.1  # (flyers and swimmers: centred on their origin; lifted to be seen)
        bpy.context.view_layer.update()
        a, b = bounds(o)
        labels.append((n, (a.x + b.x) / 2, b.z))
        lo = Vector(map(min, lo, a))
        hi = Vector(map(max, hi, b))
        x = b.x + gap
    # a 1.8 m post
    bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=1.8, location=(x + 0.1, 0, 0.9))
    hi.x = x + 0.2
    hi.z = max(hi.z, 2.0)
    for n, cx, top in labels:
        text(n, (cx, -1, top + 0.05), 0.07)
    ground(lo.x - 1, hi.x + 1)
    setup_render(3600, 900, Vector((lo.x, 0, -0.05)), Vector((hi.x, 0, hi.z + 0.15)), pad=0.02)
    render(os.path.join(OUTDIR, arg("--name", "lineup") + ".png"))


def poses():
    reset()
    cell = 1.0
    rows = []
    for r, n in enumerate(NAMES):
        arm, mesh, new, acts = load(n)
        made = []
        for ci, clip in enumerate(CLIPS):
            act = acts.get(clip)
            if act is None and clip != "rest":
                continue
            frac = {"die": 1.0, "walk": 0.25, "run": 0.3, "eat": 0.5, "fly": 0.2, "jump": 0.45, "attack": 0.5}.get(clip, 0.3)
            o = posed_copy(arm, mesh, act, frac, f"{n}-{clip}")
            made.append((ci, clip, o))
        for ob in new:
            bpy.data.objects.remove(ob, do_unlink=True)
        size = max(max(b.x - a.x, b.z - a.z) for a, b in (bounds(o) for _, _, o in made))
        k = 0.85 / size
        for ci, clip, o in made:
            o.scale = (k, k, k)
            if VIEW == "three":
                o.rotation_euler = (0, 0, -0.75)
            bpy.context.view_layer.update()
            a, b = bounds(o)
            o.location.x += ci * cell + cell / 2 - (a.x + b.x) / 2
            o.location.z += -r * cell * 1.15 - a.z
            bpy.context.view_layer.update()
            text(clip, (ci * cell + cell / 2, -1, -r * cell * 1.15 - 0.09), 0.06)
        text(n, (-0.45, -1, -r * cell * 1.15 + 0.4), 0.09)
        rows.append(n)
    lo = Vector((-0.9, 0, -(len(NAMES) - 1) * cell * 1.15 - 0.2))
    hi = Vector((len(CLIPS) * cell, 0, cell))
    w = 2400
    h = int(w * (hi.z - lo.z) / (hi.x - lo.x))
    setup_render(w, h, lo, hi, pad=0.01, view=VIEW)
    render(os.path.join(OUTDIR, arg("--name", "poses") + ".png"))


def strips():
    """Each animal's clips (`--clips`) at six points of their cycle, on the true ground (not set down on it: a foot
    through it or off it shows) — `--what strips`."""
    reset()
    cell = 1.0
    STEPS = 6
    row = 0
    for n in NAMES:
        arm, mesh, new, acts = load(n)
        clips = [c for c in CLIPS if acts.get(c)]
        made = []
        for clip in clips:
            for i in range(STEPS):
                made.append((clip, i, posed_copy(arm, mesh, acts[clip], i / STEPS, f"{n}-{clip}-{i}")))
        for ob in new:
            bpy.data.objects.remove(ob, do_unlink=True)
        if not made:
            continue
        size = max(max(b.x - a.x, b.z - a.z) for a, b in (bounds(o) for _, _, o in made))
        k = 0.85 / size
        for ri, clip in enumerate(clips):
            z0 = -row * cell * 1.1
            for c, i, o in made:
                if c != clip:
                    continue
                o.scale = (k, k, k)
                bpy.context.view_layer.update()
                a, b = bounds(o)
                o.location.x += i * cell + cell / 2 - (a.x + b.x) / 2
                o.location.z += z0 + 0.1
            band(0.0, STEPS * cell, z0 + 0.1)
            text(f"{n} {clip}", (-0.5, -1, z0 + 0.4), 0.07)
            row += 1
    lo = Vector((-1.0, 0, -(row - 1) * cell * 1.1 - 0.05))
    hi = Vector((STEPS * cell, 0, cell))
    w = 2400
    h = int(w * (hi.z - lo.z) / (hi.x - lo.x))
    sc = setup_render(w, h, lo, hi, pad=0.01)
    render(os.path.join(OUTDIR, arg("--name", "strips") + ".png"))


os.makedirs(OUTDIR, exist_ok=True)
what = arg("--what", "both")
if what in ("both", "lineup"):
    lineup()
if what in ("both", "poses"):
    poses()
if what == "strips":
    strips()

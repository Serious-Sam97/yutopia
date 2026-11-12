# Plan 79, phase 0 — the mocks: the life man (public/life/person-man.glb) holding the blockouts
# (guns.py) and the torch, at night in the snow with one of the shadowed ahead, through the cameras the
# plan proposes (F1a: over the right shoulder whenever a gun is out; in closer to aim), and side views
# of the holds (F6a). The arms are posed by a two-bone solve here (the rig's bones are joints: each
# bone's head is its joint, its tail points up), the hands set to each gun's points.
#
#   blender -b --factory-startup -P tools/art/guns/mock.py -- [--out design/guns] [--only name,...]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402
from pose import Pose, arm, curl, look, man, place, stance, world  # noqa: E402, F401

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/guns")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)

FWD = Vector((0, -1, 0))  # the man faces −y; his left is +x
# what the crosshair is on (the aim camera's line, 10 m out): the guns and the torch converge there
TARGET = Vector((-0.45, -8.5, 1.4))
AIM = (TARGET - Vector((-0.05, -0.5, 1.36))).normalized()
UP = Vector((0, 0, 1))
LEFT = Vector((1, 0, 0))


# ── the scene: snow, pines, a moon, the fog, one of the shadowed ─────────────────────────────────
def engine(scene):
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = e
            return
        except TypeError:
            pass


def material(name, color, rough=0.8, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def night(scene):
    engine(scene)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.6
    w = bpy.data.worlds.new("night")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes["Background"].inputs["Color"].default_value = (0.014, 0.02, 0.04, 1)
    nt.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = w
    # the fog: a box of it round the clearing (a world volume put out the moon in Eevee)
    fog = bpy.data.materials.new("fog")
    fog.use_nodes = True
    fn = fog.node_tree
    fn.nodes.remove(fn.nodes["Principled BSDF"])
    vol = fn.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = 0.02
    vol.inputs["Color"].default_value = (0.8, 0.85, 0.95, 1)
    fn.links.new(vol.outputs[0], fn.nodes["Material Output"].inputs["Volume"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -10, 5))
    box = bpy.context.active_object
    box.scale = (50, 50, 10)
    box.data.materials.append(fog)
    try:
        scene.eevee.volumetric_end = 60
        scene.eevee.volumetric_tile_size = "4"
    except AttributeError:
        pass
    # the snow
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    snow = bpy.context.active_object
    snow.data.materials.append(material("snow", (0.62, 0.66, 0.74), 0.75))
    # the moon: low and cold, from behind on the left
    md = bpy.data.lights.new("moon", "SUN")
    md.energy = 0.22
    md.color = (0.6, 0.7, 1.0)
    moon = bpy.data.objects.new("moon", md)
    moon.rotation_euler = (math.radians(55), 0, math.radians(200))
    scene.collection.objects.link(moon)
    # pines, round the clearing (none on the line ahead)
    bark = material("bark", (0.05, 0.035, 0.025), 0.9)
    pine = material("pine", (0.02, 0.05, 0.035), 0.85)
    rnd = __import__("random").Random(79)
    for _ in range(70):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(9, 40)
        x, y = math.cos(a) * r, math.sin(a) * r
        if abs(x) < 3.5 and y < 0:
            continue
        h = rnd.uniform(5, 11)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=h * 0.4, location=(x, y, h * 0.2), vertices=8)
        bpy.context.active_object.data.materials.append(bark)
        for k in range(3):
            bpy.ops.mesh.primitive_cone_add(radius1=h * (0.28 - k * 0.06), depth=h * 0.45, location=(x, y, h * (0.35 + k * 0.2)), vertices=10)
            bpy.context.active_object.data.materials.append(pine)
    # one of the shadowed, ahead and a little to the right: a dark body in its own smoke
    dark = material("shade", (0.006, 0.006, 0.008), 0.6)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.1, location=(-0.45, -8.5, 1.05), vertices=16)
    bpy.context.active_object.data.materials.append(dark)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(-0.45, -8.5, 1.75))
    bpy.context.active_object.data.materials.append(dark)
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.95, location=(-0.45 + s * 0.28, -8.4, 1.15), vertices=8, rotation=(0.25, s * 0.25, 0))
        bpy.context.active_object.data.materials.append(dark)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.95, location=(-0.45 + s * 0.11, -8.5, 0.47), vertices=8)
        bpy.context.active_object.data.materials.append(dark)
    smoke = bpy.data.materials.new("smoke")
    smoke.use_nodes = True
    nt = smoke.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    v = nt.nodes.new("ShaderNodeVolumePrincipled")
    v.inputs["Density"].default_value = 1.2
    v.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)
    nt.links.new(v.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.75, location=(-0.45, -8.5, 1.2))
    sm = bpy.context.active_object
    sm.scale = (1, 1, 1.5)
    sm.data.materials.append(smoke)


# ── the man and his rig ──────────────────────────────────────────────────────────────────────────
# ── the holds ────────────────────────────────────────────────────────────────────────────────────
def handgun_aim(P, g, t, aim=AIM):
    """A handgun out at the shoulder's line, both arms forward, the torch in the left fist under the
    right wrist, the light along the barrel (F6a: the wrists back to back)."""
    stance(P, 0.15)
    G = Vector((-0.05, -0.5, 1.36))
    place(g, G, aim, UP)
    f = aim.normalized()
    right = -UP.cross(f)
    arm(P, "R", G, (f * 0.8 - right * 0.25 - UP * 0.25).normalized(), UP, Vector((-0.6, 0.3, -1)))
    curl(P, "R", 1.25, 0.55, 0.5)
    T = G + Vector((0.015, 0.03, -0.075))
    place(t, T, f, UP)
    arm(P, "L", T, -UP, f, Vector((0.7, 0.3, -1)))
    curl(P, "L", 1.3, 1.3, 0.7)
    look(P, f, 0.05)


def handgun_ready(P, g, t):
    """Low ready: both hands as aimed, the muzzle ~40° down, the arms in; the torch down with it."""
    stance(P, 0.12)
    f = (FWD * math.cos(0.7) - UP * math.sin(0.7)).normalized()
    G = Vector((-0.04, -0.34, 1.08))
    place(g, G, f, UP)
    right = -UP.cross(f)
    arm(P, "R", G, (f * 0.8 - right * 0.25 - UP * 0.25).normalized(), UP, Vector((-0.6, 0.6, -1)))
    curl(P, "R", 1.25, 0.55, 0.5)
    up_g = (UP - f * f.dot(UP)).normalized()
    T = G - up_g * 0.075 + Vector((0.015, 0.02, 0))
    place(t, T, f, up_g)
    arm(P, "L", T, -up_g, f, Vector((0.7, 0.6, -1)))
    curl(P, "L", 1.3, 1.3, 0.7)
    look(P, FWD, 0.15)


def long_aim(P, g, t, aim=AIM):
    """A long gun in the shoulder: the butt in the right shoulder's pocket, the cheek down on the stock,
    the left hand on the fore-end as far out as it reaches, the torch held along the fore-end in it."""
    stance(P, 0.55)
    pocket = P.head("shoulderR") + Vector((0.07, -0.07, -0.02))
    f = aim.normalized()
    # the gun's grip from its butt
    off = g.points["grip"] - g.points["butt"]
    place(g, Vector((0, 0, 0)), f, UP)
    R = g.root.matrix_world.to_3x3()
    G = pocket + R @ off
    place(g, G, f, UP)
    right = -UP.cross(f)
    arm(P, "R", G, (f * 0.7 - right * 0.4 - UP * 0.35).normalized(), UP, Vector((-1, 0.2, -0.4)))
    curl(P, "R", 1.25, 0.55, 0.5)
    # the fore-end: as far out along the gun as the left arm reaches
    Sl = P.head("shoulderL")
    reach = 0.5 + 0.06
    F = world(g, "fore")
    under = world(g, "grip") + (F - world(g, "grip")) * 0.0
    best = F
    for k in range(40):
        q = under + (F - under) * (1 - k / 40)
        if (q - Sl).length <= reach:
            best = q
            break
    Lh = (f * 0.55 + right * 0.85).normalized()
    arm(P, "L", best - UP * 0.01, Lh, UP.cross(Lh), Vector((0.4, 0.3, -1)))
    curl(P, "L", 1.0, 0.9, 0.5)
    if t is not None:
        place(t, best - UP * 0.045 + right * 0.0, f, UP)
    look(P, f, 0.22, side=0.08)
    return (best - F).length


def long_ready(P, g, t):
    """A long gun at the ready: the stock under the arm, the muzzle down ahead."""
    stance(P, 0.4)
    f = (FWD * math.cos(0.55) - UP * math.sin(0.55)).normalized()
    up_g = (UP - f * f.dot(UP)).normalized()
    pocket = P.head("shoulderR") + Vector((0.05, -0.02, -0.16))
    off = g.points["grip"] - g.points["butt"]
    place(g, Vector((0, 0, 0)), f, up_g)
    G = pocket + g.root.matrix_world.to_3x3() @ off
    place(g, G, f, up_g)
    right = -UP.cross(f)
    arm(P, "R", G, (f * 0.7 - right * 0.4 - up_g * 0.35).normalized(), up_g, Vector((-1, 0.4, -0.6)))
    curl(P, "R", 1.25, 0.55, 0.5)
    Sl = P.head("shoulderL")
    F = world(g, "fore")
    best = F
    for k in range(40):
        q = G + (F - G) * (1 - k / 40)
        if (q - Sl).length <= 0.56:
            best = q
            break
    Lh = (f * 0.55 + right * 0.85).normalized()
    arm(P, "L", best - up_g * 0.01, Lh, up_g.cross(Lh), Vector((0.4, 0.4, -1)))
    curl(P, "L", 1.0, 0.9, 0.5)
    if t is not None:
        place(t, best - up_g * 0.045, f, up_g)
    look(P, FWD, 0.12)


# ── the cameras (the game's numbers: tp/view.ts — EYE 1.15 over the feet, +0.35 aiming, FOV
# vertical) ───────────────────────────────────────────────────────────────────────────────────────
def camera(name, at, look_at=None, fov=50.0, along=None):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(fov)
    cd.clip_start = 0.02
    o = bpy.data.objects.new(name, cd)
    o.location = at
    d = (Vector(look_at) - Vector(at)) if look_at is not None else along
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(o)
    # (a soft fill from by the lens, as a game's camera carries: the man readable at night)
    fd = bpy.data.lights.new("fill", "POINT")
    fd.energy = 6
    fd.color = (0.75, 0.82, 1.0)
    fd.shadow_soft_size = 0.6
    fo = bpy.data.objects.new("fill", fd)
    fo.parent = o
    fo.location = (0.3, 0.4, 0.2)
    bpy.context.scene.collection.objects.link(fo)
    return o


def reticle(cam, spread=0.012, scope=False):
    """The reticle on the camera (F1–F3: a dot and four ticks opening with the spread), drawn just in
    front of the lens. The scope's: its glass ringed in black, its cross."""
    ink = material("ink", (0.95, 0.93, 0.88), 0.5, emit=4.0)
    black = material("black", (0, 0, 0), 1.0)
    z = -0.1
    k = math.tan(cam.data.angle_y / 2) * abs(z) * 2  # the frame's height at z
    items = []
    if scope:
        me = bpy.data.meshes.new("mask")
        n = 64
        vs = []
        for i in range(n):
            a = i / n * math.tau
            vs += [(math.cos(a) * k * 0.42, math.sin(a) * k * 0.42, z), (math.cos(a) * k * 3, math.sin(a) * k * 3, z)]
        me.from_pydata(vs, [], [(2 * i, 2 * ((i + 1) % n), 2 * ((i + 1) % n) + 1, 2 * i + 1) for i in range(n)])
        items.append((me, black))
        for w, h in ((k * 0.84, k * 0.0012), (k * 0.0012, k * 0.84)):
            items.append((quad(w, h, z * 0.99), material("cross", (0, 0, 0), 1.0)))
    else:
        g = k * 0.004 + spread * abs(z) * 2
        L = k * 0.012
        t = k * 0.0016
        items.append((quad(t * 1.4, t * 1.4, z), ink))
        for dx, dy, w, h in ((g + L / 2, 0, L, t), (-g - L / 2, 0, L, t), (0, g + L / 2, t, L), (0, -g - L / 2, t, L)):
            items.append((quad(w, h, z, dx, dy), ink))
    for me, m in items:
        me.materials.append(m)
        o = bpy.data.objects.new("ret", me)
        o.parent = cam
        bpy.context.scene.collection.objects.link(o)


def quad(w, h, z, x=0.0, y=0.0):
    me = bpy.data.meshes.new("q")
    me.from_pydata([(x - w / 2, y - h / 2, z), (x + w / 2, y - h / 2, z), (x + w / 2, y + h / 2, z), (x - w / 2, y + h / 2, z)], [], [(0, 1, 2, 3)])
    return me


def beam(t, focus):
    """The torch's light from its lens, along it: wide walking, narrow and longer focused (beam.ts)."""
    ld = bpy.data.lights.new("torch", "SPOT")
    ld.energy = 1600 if focus else 700
    ld.spot_size = 0.42 if focus else 0.95
    ld.spot_blend = 0.35
    ld.color = (1.0, 0.93, 0.82)
    ld.shadow_soft_size = 0.02
    o = bpy.data.objects.new("torch", ld)
    o.location = world(t, "muzzle")
    o.rotation_euler = (t.root.matrix_world.to_3x3() @ Vector((1, 0, 0))).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(o)
    return o


def render(cam, name, res=(1440, 810)):
    if ONLY and name not in ONLY:
        return
    s = bpy.context.scene
    s.camera = cam
    s.render.resolution_x, s.render.resolution_y = res
    s.render.filepath = os.path.join(OUT, f"0-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", s.render.filepath)


def clear(objs):
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)


# ── the shots ────────────────────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
night(scene)
rig = man()
P = Pose(rig)
built = {gid: guns.BUILD[gid]() for gid in guns.BUILD}
torch = guns.torch()


def only(g):
    for k, v in built.items():
        for o in [v.root, *v.root.children]:
            o.hide_render = v is not g or o.name.endswith(".cut")


def side_cams():
    """From his left, at the hold; from above and ahead (the wrists)."""
    return [camera("side", (2.0, -0.45, 1.35), (0, -0.45, 1.25), fov=30), camera("front", (-0.9, -2.0, 1.75), (-0.05, -0.4, 1.3), fov=30)]


extra = []
shots = [
    # (name, the hold, the gun, focused, cameras)
    ("aw2-revolver-ready", handgun_ready, "revolver", False, "ready"),
    ("aw2-revolver-aim", handgun_aim, "revolver", True, "aim"),
    ("aw2-shotgun-ready", long_ready, "shotgun", False, "ready"),
    ("aw2-shotgun-aim", long_aim, "shotgun", True, "aim"),
    ("aw2-ak47-aim", long_aim, "ak47", True, "aim"),
    ("aw2-sniper-aim", long_aim, "sniper", True, "aim"),
    ("aw2-daybreak-aim", long_aim, "daybreak", True, "aim"),
]
for name, hold, gid, focus, kind in shots:
    clear(extra)
    extra = []
    P.reset()
    g = built[gid]
    only(g)
    short = hold(P, g, torch)
    if short and short > 0.01:
        print(f"  {name}: the left hand {short * 100:.0f} cm short of the fore-end")
    extra.append(beam(torch, focus))
    if kind == "ready":
        # F1a: a gun out — tight over the right shoulder (AW2, RE5): ~0.5 m out, ~1.5 m back, a little down
        cam = camera("cam", (-0.5, 1.5, 1.74), along=Vector((0, -1, -0.1)), fov=50)
    else:
        # aiming: in to ~0.95 m, 0.45 m out, the FOV only a little narrower (50 → 46)
        cam = camera("cam", (-0.45, 0.95, 1.63), along=Vector((0, -1, -0.025)), fov=46)
        reticle(cam)
    extra.append(cam)
    extra += list(cam.children)
    render(cam, name)
    for c in side_cams():
        extra.append(c)
        render(c, f"{name}-{c.name}", (900, 900))

# the sniper through its scope: from the eye at the ocular, 4× (50° / 4)
clear(extra)
extra = []
P.reset()
g = built["sniper"]
only(g)
long_aim(P, g, torch)
extra.append(beam(torch, True))
eye = world(g, "rear")
# (first person through the glass: the man and the rifle aren't in the picture)
for o in [rig, *rig.children, g.root, *g.root.children, torch.root, *torch.root.children]:
    o.hide_render = True
cam = camera("scope", eye, along=AIM, fov=50 / 4)
reticle(cam, scope=True)
extra.append(cam)
render(cam, "aw2-sniper-scope")

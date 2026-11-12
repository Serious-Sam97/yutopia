# Plan 80, phase 0 — the revolver's mocks: the life man holding the revolver as plan 80 decided (RE4
# Remake's low ready, the isosceles aim thumbs forward, AW2's Harries with the torch, the real speedloader
# reload), in a plain lit studio, each from his right, the front and over his shoulder (the game's camera).
# Both hands placed on the gun — the right at its grip, the left in its support grip (its palm on the grip's
# left panel, the fingers wrapped under the trigger guard over the right's, the thumb forward) — by the
# two-bone solve that sets the whole hand (pose.py).
#
#   blender -b --factory-startup -P tools/art/guns/mock80.py -- [--out design/guns/p80] [--only ready,aim]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402
from pose import FWD, LEFT, UP, Pose, arm, curl, look, man, place, stance  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/guns/p80")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
CAMS_ONLY = set(argv[argv.index("--cams") + 1].split(",")) if "--cams" in argv else None
os.makedirs(OUT, exist_ok=True)
RIGHT = -LEFT


def studio(scene):
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = e
            break
        except TypeError:
            pass
    scene.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("studio")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.45, 0.5, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    scene.world = w
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    s = bpy.data.objects.new("sun", sun)
    s.rotation_euler = (math.radians(50), 0, math.radians(-35))
    scene.collection.objects.link(s)
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 220
    fill.size = 3
    f = bpy.data.objects.new("fill", fill)
    f.location = (-2.2, -2.4, 2.4)
    f.rotation_euler = Vector((2.2, 2.4, -1.1)).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(f)
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    floor = bpy.context.object
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.3, 0.3, 0.31, 1)
    floor.data.materials.append(m)


# ── the revolver's moving parts (the crane swings the cylinder out to the left; the rod pushes back) ──
SWING = ("crane", "cylinder", "rod", *[f"round{i}" for i in range(6)])
# (the crane's hinge low and to the left of the cylinder, as a real one's: swung 1.5 rad, the cylinder clears
# the frame — on the bore's line it only moved 2 cm and stayed in the frame window: the game's too, plan 80
# phase 1)
CRANE_AT = Vector((0.0, 0.017, 0.037))
SWING_RAD = 1.5


def cylinder_out(g, k, rod=0.0, rounds=6):
    """The cylinder swung out `k` (0 shut … 1 out, SWING_RAD to the left), the rod pushed back `rod` (m),
    `rounds` in it."""
    R = Matrix.Translation(CRANE_AT) @ Matrix.Rotation(-SWING_RAD * k, 4, "X") @ Matrix.Translation(-CRANE_AT)
    for ob in g.root.children:
        part = ob.name.split(".", 1)[1] if "." in ob.name else ob.name
        if part in SWING:
            M = R @ (Matrix.Translation((-rod, 0, 0)) if part == "rod" else Matrix.Identity(4))
            ob.matrix_basis = M
        if part.startswith("round"):
            ob.hide_render = int(part[5:]) >= rounds
    bpy.context.view_layer.update()


def gun_frame(f, u):
    f = f.normalized()
    u = (u - f * f.dot(u)).normalized()
    return f, u, u.cross(f)  # (along the barrel, its top, its left)


# the hands on the gun — in its frame (f along the barrel, u its top, l its left), from its grip point
def shooting_hand(P, G, f, u, index=0.55, pole=Vector((-0.7, 0.4, -1))):
    """The right hand round the grip: the palm's middle at the grip, the knuckles across it, the index on
    the trigger (`index` its curl: 0.1 along the frame)."""
    f, u, l = gun_frame(f, u)
    short = arm(P, "R", G - u * 0.012, (f * 0.75 + l * 0.15 - u * 0.62).normalized(), (f * 0.35 + u).normalized(), pole)
    if short > 0.005:
        print(f"  the right hand short by {short * 100:.1f} cm")
    curl(P, "R", 1.25, index, 0.45)


def support_hand(P, G, f, u, pole=Vector((0.7, 0.3, -1))):
    """The left hand in the support grip: its palm on the grip's left panel over the right's fingers, the
    fingers round under the trigger guard, the thumb forward along the frame."""
    f, u, l = gun_frame(f, u)
    # (the palm flat on the grip's left panel — its normal toward the gun's right, −l —, the index side
    # forward and up: so the fingers run forward and down across the grip's front, wrapping round it)
    at = G + l * 0.032 - u * 0.034 - f * 0.004
    short = arm(P, "L", at, (f * 0.6 - u * 0.75 - l * 0.12).normalized(), (f * 0.72 + u * 0.6).normalized(), pole)
    if short > 0.005:
        print(f"  the support hand short by {short * 100:.1f} cm")
    curl(P, "L", 1.15, 1.1, 0.12)


# ── the poses ───────────────────────────────────────────────────────────────────────────────────────
def low_ready(P, g, t, lo, torch=False):
    """RE4 Remake's low ready: both hands on, the gun at the lower belly, the muzzle ~45° down at the
    ground ahead, the trigger finger along the frame. With the torch on (F3a): the gun in the right hand
    alone, low; the torch out ahead in the left."""
    stance(P, 0.08)
    if not torch:
        f = (FWD * math.cos(0.75) - UP * math.sin(0.75) + RIGHT * 0.03).normalized()
        G = Vector((-0.02, -0.25, 1.06))
        place(g, G, f, UP)
        shooting_hand(P, G, f, UP, index=0.1, pole=Vector((-0.8, 0.6, -1)))
        support_hand(P, G, f, UP, pole=Vector((0.8, 0.6, -1)))
    else:
        f = (FWD * math.cos(0.9) - UP * math.sin(0.9) + RIGHT * 0.12).normalized()
        G = Vector((-0.17, -0.25, 0.98))
        place(g, G, f, UP)
        shooting_hand(P, G, f, UP, index=0.1, pole=Vector((-1, 0.6, -0.6)))
        ft = (FWD * math.cos(0.18) - UP * math.sin(0.18)).normalized()
        T = Vector((0.1, -0.48, 1.18))
        place(t, T, ft, UP)
        arm(P, "L", T, ft, UP, Vector((0.8, 0.3, -1)))
        curl(P, "L", 1.3, 1.3, 0.7)
    look(P, FWD, 0.2)


AIM = Vector((0, -1, -0.03)).normalized()


def aim(P, g, t, lo, torch=False):
    """Isosceles, thumbs forward: square to the target, the arms nearly straight, the gun just under the
    eye line, upright. With the torch (F3a): Harries — the left hand crossed under the right wrist, the
    backs of the hands pressed, the beam along the barrel."""
    stance(P, 0.0)
    G = Vector((-0.03, -0.5, 1.42))
    place(g, G, AIM, UP)
    shooting_hand(P, G, AIM, UP, index=0.55, pole=Vector((-1, 0.2, -0.7)))
    if not torch:
        support_hand(P, G, AIM, UP, pole=Vector((1, 0.2, -0.7)))
    else:
        f, u, l = gun_frame(AIM, UP)
        T = G - u * 0.085 - f * 0.05 - l * 0.012
        place(t, T, f, u)
        arm(P, "L", T, (-u * 0.7 - l * 0.7).normalized(), f, Vector((1, -0.2, -1)))
        curl(P, "L", 1.3, 1.3, 0.7)
    look(P, AIM, 0.06)


def reload_open(P, g, t, lo):
    """1 — the gun in close, elbows back; the right thumb on the latch, the left fingers rolling the
    cylinder out to the left."""
    stance(P, 0.05)
    f = (FWD * math.cos(0.35) - UP * math.sin(0.35)).normalized()
    u = (UP + LEFT * 0.35).normalized()
    G = Vector((-0.04, -0.3, 1.17))
    place(g, G, f, u)
    cylinder_out(g, 0.85)
    shooting_hand(P, G, f, u, index=0.1, pole=Vector((-1, 0.8, -0.8)))
    f2, u2, l2 = gun_frame(f, u)
    at = G + f2 * 0.05 + u2 * 0.035 + l2 * 0.035
    arm(P, "L", at, (-u2 * 0.6 - l2 * 0.5 + f2 * 0.4).normalized(), f2, Vector((0.9, 0.5, -1)))
    curl(P, "L", 0.9, 0.85, 0.3)
    look(P, (G - Vector((0, 0, 1.62))).normalized(), 0.35)


def reload_eject(P, g, t, lo):
    """2 — muzzle up: held by the left hand round the frame and the open cylinder, the right palm striking
    the ejector rod; the empties falling."""
    stance(P, 0.05)
    f = (UP * math.cos(0.2) + FWD * math.sin(0.2)).normalized()
    u = (-FWD + RIGHT * 0.2).normalized()
    G = Vector((-0.02, -0.3, 1.1))
    place(g, G, f, u)
    cylinder_out(g, 1.0, rod=0.022)
    f2, u2, l2 = gun_frame(f, u)
    at = G + f2 * 0.06 + l2 * 0.03
    arm(P, "L", at, (u2 * 0.3 - l2 * 0.95).normalized(), f2, Vector((0.9, 0.6, -0.8)))
    curl(P, "L", 1.1, 1.0, 0.5)
    # (the right palm flat on the rod's head, above it)
    tip = g.root.matrix_world @ Vector((0.13, -0.035, 0.0385 + 0.025))
    arm(P, "R", tip + f2 * 0.02, (-f2 * 0.15 + RIGHT * 0.9).normalized(), FWD, Vector((-1, 0.6, -0.6)))
    curl(P, "R", 0.15, 0.1, 0.4)
    look(P, (G + f2 * 0.15 - Vector((0, 0, 1.62))).normalized(), 0.25)


def reload_fetch(P, g, t, lo):
    """3 — muzzle down, the gun at the middle of the body above the belt in the left hand; the right hand
    at the right hip's pouch, taking a speedloader by its body."""
    stance(P, 0.05)
    f = (-UP * math.cos(0.25) + FWD * math.sin(0.25)).normalized()
    u = (FWD + LEFT * 0.2).normalized()
    G = Vector((-0.0, -0.27, 1.13))
    place(g, G, f, u)
    cylinder_out(g, 1.0, rounds=0)
    f2, u2, l2 = gun_frame(f, u)
    at = G + f2 * 0.06 + l2 * 0.03
    arm(P, "L", at, (-u2 * 0.3 - l2 * 0.95).normalized(), f2, Vector((0.9, 0.6, -0.8)))
    curl(P, "L", 1.1, 1.0, 0.5)
    L0 = Vector((-0.21, -0.07, 0.94))
    place(lo, L0, FWD * -0.2 + UP, FWD)
    arm(P, "R", L0 + Vector((-0.01, 0, 0.025)), (-UP * 0.4 + FWD * 0.9).normalized(), LEFT, Vector((-1, 0.4, -0.4)))
    curl(P, "R", 1.0, 0.9, 0.7)
    look(P, (Vector((-0.15, -0.15, 1.0)) - Vector((0, 0, 1.62))).normalized(), 0.35)


def reload_load(P, g, t, lo):
    """4 — the speedloader's rounds into the chambers (muzzle down, the cylinder's back up), squared, the
    knob twisted."""
    stance(P, 0.05)
    f = (-UP * math.cos(0.2) + FWD * math.sin(0.2)).normalized()
    u = (FWD + LEFT * 0.2).normalized()
    G = Vector((-0.0, -0.27, 1.13))
    place(g, G, f, u)
    cylinder_out(g, 1.0, rounds=6)
    f2, u2, l2 = gun_frame(f, u)
    at = G + f2 * 0.06 + l2 * 0.03
    arm(P, "L", at, (-u2 * 0.3 - l2 * 0.95).normalized(), f2, Vector((0.9, 0.6, -0.8)))
    curl(P, "L", 1.1, 1.0, 0.5)
    # (the loader on the open cylinder's back, its rounds down into the chambers)
    cyl = g.root.matrix_world @ (Matrix.Translation(CRANE_AT) @ Matrix.Rotation(-SWING_RAD, 4, "X") @ Matrix.Translation(-CRANE_AT) @ Vector((0.012, 0, 0.0585)))
    place(lo, cyl - f2 * 0.045, f2, u2)
    grip = lo.root.matrix_world @ lo.points["grip"]
    arm(P, "R", grip - f2 * 0.01, (f2 * 0.3 + LEFT * 0.9).normalized(), FWD, Vector((-1, 0.4, -0.5)))
    curl(P, "R", 1.0, 0.95, 0.7)
    look(P, (G - Vector((0, 0, 1.62))).normalized(), 0.4)


def reload_close(P, g, t, lo):
    """5 — the left thumb rolls the cylinder shut as the right hand takes its grip again."""
    stance(P, 0.05)
    f = (FWD * math.cos(0.35) - UP * math.sin(0.35)).normalized()
    u = (UP + LEFT * 0.3).normalized()
    G = Vector((-0.04, -0.3, 1.15))
    place(g, G, f, u)
    cylinder_out(g, 0.35)
    shooting_hand(P, G, f, u, index=0.1, pole=Vector((-1, 0.8, -0.8)))
    support_hand(P, G, f, u, pole=Vector((0.9, 0.6, -0.9)))
    look(P, (G - Vector((0, 0, 1.62))).normalized(), 0.3)


POSES = [
    ("ready", low_ready, {}),
    ("ready-torch", low_ready, {"torch": True}),
    ("aim", aim, {}),
    ("aim-torch", aim, {"torch": True}),
    ("reload-1-open", reload_open, {}),
    ("reload-2-eject", reload_eject, {}),
    ("reload-3-fetch", reload_fetch, {}),
    ("reload-4-load", reload_load, {}),
    ("reload-5-close", reload_close, {}),
]


def camera(name, at, look_at, fov):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(fov)
    cd.clip_start = 0.02
    o = bpy.data.objects.new(name, cd)
    o.location = at
    o.rotation_euler = (Vector(look_at) - Vector(at)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(o)
    return o


# (the body's colours: its textures are KTX2, which Blender doesn't read — plain ones, so the hands read)
TONES = {
    "skin": ((0.62, 0.42, 0.31), 0.55),
    "clothes": ((0.16, 0.2, 0.26), 0.85),
    "hair": ((0.09, 0.055, 0.035), 0.6),
    "brows": ((0.09, 0.055, 0.035), 0.6),
    "shoes": ((0.05, 0.04, 0.035), 0.5),
}


def tone(rig):
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if m and m.name in TONES and m.use_nodes:
                b = m.node_tree.nodes.get("Principled BSDF")
                if not b:
                    continue
                for k in ("Base Color", "Alpha"):
                    for link in list(b.inputs[k].links):
                        m.node_tree.links.remove(link)
                b.inputs["Alpha"].default_value = 1.0
                b.inputs["Base Color"].default_value = (*TONES[m.name][0], 1)
                b.inputs["Roughness"].default_value = TONES[m.name][1]


# (its run — imported by mock81.py for its scene's pieces, nothing runs)
if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    studio(scene)
    rig = man()
    tone(rig)
    P = Pose(rig)
    g = guns.revolver()
    t = guns.torch()
    lo = guns.speedloader()
    for o in [*g.root.children, *t.root.children, *lo.root.children]:
        if o.name.endswith(".cut"):
            o.hide_render = True
    CAMS = {
        "side": camera("side", (-2.2, -0.45, 1.3), (0, -0.35, 1.18), 34),
        "front": camera("front", (-0.55, -2.1, 1.6), (-0.03, -0.35, 1.2), 30),
        "shoulder": camera("shoulder", (-0.5, 1.5, 1.95), (-0.5, -2.5, 1.5), 46),
    }
    hands = camera("hands", (0, 0, 0), (0, -1, 0), 32)
    hands_l = camera("hands-left", (0, 0, 0), (0, -1, 0), 32)
    for name, fn, kw in POSES:
        if ONLY and name not in ONLY:
            continue
        P.reset()
        cylinder_out(g, 0)
        torch_on = kw.get("torch", False)
        for o in t.root.children:
            o.hide_render = not torch_on or o.name.endswith(".cut")
        loader_on = name in ("reload-3-fetch", "reload-4-load")
        for o in lo.root.children:
            o.hide_render = not loader_on or o.name.endswith(".cut")
        fn(P, g, t, lo, **kw)
        # (close on the hands: from ahead, a little to his right and above, at the gun)
        G = g.root.matrix_world.translation
        hands.location = G + Vector((-0.45, -0.6, 0.22))
        hands.rotation_euler = (G - hands.location).to_track_quat("-Z", "Y").to_euler()
        hands_l.location = G + Vector((0.48, -0.55, 0.2))
        hands_l.rotation_euler = (G - hands_l.location).to_track_quat("-Z", "Y").to_euler()
        # (the game's camera: from his head, 0.5 m to his right, 1.5 m back, 0.3 m up — looking ahead, as
        # plan 79's ready camera does)
        head = rig.matrix_world @ P.p["head"].head
        sh = CAMS["shoulder"]
        sh.location = head + RIGHT * 0.5 - FWD * 1.5 + UP * 0.3
        sh.rotation_euler = (FWD * 10 - UP * 1.2).to_track_quat("-Z", "Y").to_euler()
        for cname, cam in [*CAMS.items(), ("hands", hands), ("hands-left", hands_l)]:
            if CAMS_ONLY and cname not in CAMS_ONLY:
                continue
            scene.camera = cam
            # (the game's camera: its own wide picture; the rest square)
            scene.render.resolution_x, scene.render.resolution_y = (1280, 720) if cname == "shoulder" else (960, 960)
            scene.render.filepath = os.path.join(OUT, f"{name}-{cname}.png")
            bpy.ops.render.render(write_still=True)
        print("wrote", name)

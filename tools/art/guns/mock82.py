# Plan 82, phase 0 — the AK's mocks: the life man holding it as plan 82 decided (F1b the low ready in both hands
# before him, his shoulders square — his left shoulder forward to reach the handguard, never his trunk turned;
# F2a aimed square, the cheek on the stock; F3a the torch held against the handguard; F4a the reload rock and
# lock — the empty out and dropped, a new one from the pouch hooked and rocked in, racked under the rifle when
# dry; F5a the pouch at his left hip's front; F6a slung on his back mirrored to the double-barrel's), in a plain
# lit studio, from his right, the front, over his shoulder (the game's camera) and close on each hand. Both
# hands put on the gun at places on it by pose.py's two-bone solve that sets the whole hand.
#
#   blender -b --factory-startup -P tools/art/guns/mock82.py -- [--out design/guns/p82] [--only ready,aim]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402
from mock80 import camera, studio, tone  # noqa: E402  (its scene's pieces; its own run is guarded)
from pose import FWD, LEFT, UP, Pose, arm, curl, look, man, place, stance  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/guns/p82")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)
RIGHT = -LEFT
BACK = -FWD

# ── the AK's own (tools/art/guns/guns.py ak47(): +x the barrel, +y its left, +z up; its origin at the top of the
# pistol grip) ──────────────────────────────────────────────────────────────────────────────────────────────
MAG = ("magazine", "mag-ribs", "floor", "round0")
LUG = Vector((0.124, 0.0, 0.026))  # the magazine's front lug: it rocks about it
BUTT = Vector((-0.41, 0.0, -0.013))  # the butt plate's middle
# the right hand round the pistol grip: the palm's middle on its right side, ~4 cm down it
GRIP_PALM = Vector((-0.006, -0.012, -0.042))
CHARGE = Vector((0.19, -0.046, 0.073))  # the charging handle's knob (his right)
GUARD_X = (0.15, 0.43)  # where the left hand may go: from in front of the magazine (under the receiver) … the handguard's front
GUARD_PALM_Z = 0.034  # the left palm's middle under it (its underside ~2.5 cm up)
MAG_MID = Vector((0.13, 0.0, -0.07))  # the magazine's middle, unrocked


def gun_frame(f, u):
    f = f.normalized()
    u = (u - f * f.dot(u)).normalized()
    return f, u, u.cross(f)  # (along the barrel, its top, its left)


def at_gun(g, p, M=None):
    q = Vector(p)
    if M is not None:
        q = M @ q
    return g.root.matrix_world @ q


def parts(g):
    """Each part's own name (Blender suffixes a copy's: ak47.magazine.001) and its object."""
    for ob in g.root.children:
        bits = ob.name.split(".")
        yield (bits[1] if len(bits) > 1 else ob.name), ob


def mag_rock(g, k):
    """The magazine turned on its front lug `k` rad (− its bottom forward: out; 0 home)."""
    R = Matrix.Translation(LUG) @ Matrix.Rotation(k, 4, "Y") @ Matrix.Translation(-LUG)
    for name, ob in parts(g):
        if name in MAG:
            ob.matrix_basis = R
    bpy.context.view_layer.update()
    return R


def carrier_back(g, d):
    """The carrier (the charging handle on it) run back `d` m along the bore."""
    for name, ob in parts(g):
        if name == "carrier":
            ob.matrix_basis = Matrix.Translation((-d, 0, 0))
    bpy.context.view_layer.update()


def show(g, mag=True, rest=True):
    for name, ob in parts(g):
        if ".cut" in ob.name:
            ob.hide_render = True
            continue
        ob.hide_render = not (mag if name in MAG else rest)


def protract(P, d):
    """His left shoulder brought forward `d` m — the shoulder blade round his ribs, reaching (plan 81's)."""
    n = "shoulderL"
    P.p[n].matrix = Matrix.Translation(FWD * d) @ P.p[n].matrix
    P.upd()


def pocket(P, aimed):
    """The right shoulder's pocket: aimed, in from the joint and up (the cheek on the stock); carried, out at the
    shoulder's front (plan 81's: in toward the neck the stock's heel was in his chest)."""
    s = P.head("shoulderR")
    if aimed:
        return s + LEFT * 0.06 + FWD * 0.07 + UP * 0.025
    return s + LEFT * 0.03 + FWD * 0.07 - UP * 0.03


def from_butt(g, pk, f, u):
    place(g, Vector((0, 0, 0)), f, u)
    G = pk - g.root.matrix_world.to_3x3() @ BUTT
    place(g, G, f, u)
    return G


def right_on_grip(P, g, f, u, index=0.12, pole=Vector((-1, 0.2, -0.7))):
    """The right hand round the pistol grip: the web high on its back, the knuckles across it, the index along
    the receiver (or on the trigger)."""
    f, u, l = gun_frame(f, u)
    short = arm(P, "R", at_gun(g, GRIP_PALM), (f * 0.6 + l * 0.15 - u * 0.78).normalized(), (f * 0.45 + u).normalized(), pole)
    if short > 0.005:
        print(f"  the right hand short by {short * 100:.1f} cm")
    curl(P, "R", 1.25, index, 0.45)


def left_on_guard(P, g, f, u, pole=Vector((0.5, 0.3, -1)), torch=None):
    """The left hand palm up under the lower handguard, its fingers round its right side, the thumb ahead along
    its left — as far out along it as the arm reaches; the torch (if any) under it in the same fist."""
    f, u, l = gun_frame(f, u)
    Sl = P.head("shoulderL")
    best = None
    for k in range(40):
        x = GUARD_X[1] - k * (GUARD_X[1] - GUARD_X[0]) / 39
        p = at_gun(g, (x, 0, GUARD_PALM_Z))
        if (p - Sl).length <= 0.56:
            best = p
            print(f"  the handguard at {x:.3f}, {(p - Sl).length:.3f} from the left shoulder")
            break
    if best is None:
        best = at_gun(g, (GUARD_X[0], 0, GUARD_PALM_Z))
        print(f"  the handguard out of reach: {(best - Sl).length:.3f} at its back end")
    if torch is not None:
        place(torch, best - u * 0.045 + f * 0.05, f, u)
        best = best - u * 0.03
    short = arm(P, "L", best, (-l * 0.85 + f * 0.45).normalized(), f, pole)
    if short > 0.005:
        print(f"  the left hand short by {short * 100:.1f} cm")
    curl(P, "L", 1.1 if torch is None else 1.3, 1.0, 0.5)


def left_on_mag(P, g, f, u, M, pole=Vector((0.6, 0.2, -1))):
    """The left hand round the magazine (as `M` has it rocked): the palm on its left side, the fingers round its
    front, the thumb up behind it on the catch."""
    f, u, l = gun_frame(f, u)
    R3 = g.root.matrix_world.to_3x3() @ M.to_3x3()
    fm, um, lm = (R3 @ Vector((1, 0, 0))).normalized(), (R3 @ Vector((0, 0, 1))).normalized(), (R3 @ Vector((0, 1, 0))).normalized()
    at = at_gun(g, MAG_MID, M) + lm * 0.034
    short = arm(P, "L", at, (fm * 0.7 - um * 0.7).normalized(), (fm * 0.3 + um).normalized(), pole)
    if short > 0.005:
        print(f"  the left hand (the magazine) short by {short * 100:.1f} cm")
    curl(P, "L", 1.05, 1.0, 0.35)


# ── the props: the spare magazines (another AK's magazine alone), the pouch, the strap ─────────────────────
def material(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def LEATHER():
    return bpy.data.materials.get("strap") or material("strap", (0.16, 0.08, 0.035), 0.7)


def spare(name):
    """A magazine alone: an AK with only its magazine shown (its frame the gun's)."""
    m = guns.ak47()
    m.root.name = name
    show(m, mag=True, rest=False)
    return m


def mag_at(m, top, down, ahead):
    """A spare magazine placed by its mouth (the lug) at `top`, hanging along `down`, its curve toward `ahead`."""
    d = down.normalized()
    a = (ahead - d * d.dot(ahead)).normalized()
    # (the gun's frame: x along the barrel = `a`, z up = −d)
    place(m, Vector((0, 0, 0)), a, -d)
    place(m, top - m.root.matrix_world.to_3x3() @ LUG, a, -d)


def pouch(P):
    """The pouch on the belt at his left hip's front: a leather box, two magazines in it, their mouths up."""
    hip = P.head("hips") if "hips" in P.p else Vector((0, 0, 0.95))
    at = Vector((0.15, hip.y - 0.1, 0.93))
    out = (FWD * 0.75 + LEFT * 0.66).normalized()
    side = UP.cross(out).normalized()
    bpy.ops.mesh.primitive_cube_add(size=1)
    box = bpy.context.object
    box.name = "pouch"
    box.matrix_world = Matrix.Translation(at) @ Matrix((side, out, UP)).transposed().to_4x4() @ Matrix.Diagonal((0.09, 0.045, 0.11, 1))
    box.data.materials.append(LEATHER())
    mags = []
    for i, s in enumerate((-0.02, 0.02)):
        m = spare(f"pouched{i}")
        mag_at(m, at + side * s + UP * 0.075 + out * 0.004, -UP, side * -1)
        mags.append(m)
    return at, out, mags


def strap(points, name="sling"):
    objs = []
    for i in range(len(points) - 1):
        a, b = Vector(points[i]), Vector(points[i + 1])
        d = b - a
        bpy.ops.mesh.primitive_cube_add(size=1)
        o = bpy.context.object
        x = d.normalized()
        z = UP - x * x.dot(UP)
        if z.length < 1e-3:
            z = FWD - x * x.dot(FWD)
        z.normalize()
        y = z.cross(x)
        o.matrix_world = Matrix.Translation((a + b) / 2) @ Matrix((x, y, z)).transposed().to_4x4() @ Matrix.Diagonal((d.length + 0.01, 0.032, 0.004, 1))
        o.data.materials.append(LEATHER())
        o.name = f"{name}{i}"
        objs.append(o)
    return objs


# ── the poses ───────────────────────────────────────────────────────────────────────────────────────
AIM = Vector((0, -1, -0.03)).normalized()
READY_DOWN = 0.45


def ready(P, g, t, torch=False):
    """The low ready (F1b): his shoulders square, the butt at the shoulder's front, the muzzle ~35° down, both
    hands on — his left shoulder brought forward to the handguard."""
    stance(P, 0.08)
    protract(P, 0.07)
    f = (FWD * math.cos(READY_DOWN) - UP * math.sin(READY_DOWN) + LEFT * 0.28).normalized()
    from_butt(g, pocket(P, False), f, UP)
    right_on_grip(P, g, f, UP)
    left_on_guard(P, g, f, UP, pole=Vector((0.6, 0.4, -1)), torch=t if torch else None)
    look(P, FWD, 0.18)


def aim(P, g, t, torch=False):
    """Aimed square (F2a): the butt in the pocket, the cheek down on the stock, both elbows down; the torch
    against the handguard (F3a)."""
    stance(P, 0.25)
    protract(P, 0.07)
    from_butt(g, pocket(P, True), AIM, UP)
    right_on_grip(P, g, AIM, UP, index=0.55, pole=Vector((-1, 0.1, -0.8)))
    left_on_guard(P, g, AIM, UP, pole=Vector((0.4, 0.2, -1)), torch=t if torch else None)
    look(P, AIM, 0.4, side=0.18)


def reload_gun(P, g):
    """Reloading: kept up at the shoulder, the muzzle a little down and left, rolled so the magazine well
    faces his left hand."""
    stance(P, 0.12)
    protract(P, 0.07)
    # (in close: the butt tucked under his right arm, the gun across before him, the muzzle ahead, left and
    # a little down — the well under his chest, to his left hand)
    f = (FWD * 0.8 - UP * 0.2 + LEFT * 0.55).normalized()
    u = (UP + LEFT * 0.45).normalized()
    from_butt(g, P.head("shoulderR") - UP * 0.16 + FWD * 0.04 + LEFT * 0.02, f, u)
    right_on_grip(P, g, f, u, pole=Vector((-1, 0.4, -0.6)))
    look(P, (at_gun(g, LUG) - P.head("head")).normalized(), 0.35)
    return f, u


def reload_out(P, g, t, xs):
    """1 — the empty rocked out: his left hand round it, its thumb on the catch, its bottom swung forward."""
    f, u = reload_gun(P, g)
    M = mag_rock(g, -0.42)
    left_on_mag(P, g, f, u, M)


def reload_drop(P, g, t, xs):
    """2 — let go: the empty falling below, his left hand on its way down to the pouch."""
    f, u = reload_gun(P, g)
    show(g, mag=False)
    empty = xs["empty"]
    show(empty, mag=True, rest=False)
    well = at_gun(g, LUG)
    mag_at(empty, well - UP * 0.32 + FWD * 0.05, (-UP * 0.85 + FWD * 0.5).normalized(), FWD + LEFT * 0.4)
    at, out, mags = xs["pouch"]
    short = arm(P, "L", at + UP * 0.2 + out * 0.08, (-UP * 0.6 + FWD * 0.6).normalized(), (FWD * 0.5 + UP).normalized(), Vector((0.8, 0.5, -0.4)))
    if short > 0.005:
        print(f"  the left hand (to the pouch) short by {short * 100:.1f} cm")
    curl(P, "L", 0.4, 0.4, 0.2)


def reload_fetch(P, g, t, xs):
    """3 — at the pouch: a new one drawn up by its body, its mouth up."""
    f, u = reload_gun(P, g)
    show(g, mag=False)
    at, out, mags = xs["pouch"]
    for c in mags[1].root.children:
        c.hide_render = True
    m = xs["new"]
    show(m, mag=True, rest=False)
    top = at + UP * 0.12 + out * 0.004
    mag_at(m, top, -UP, -UP.cross(out))
    side = UP.cross(out).normalized()
    short = arm(P, "L", top - UP * 0.07 + side * 0.035, (-UP * 0.2 + out * 0.3 - side * 0.9).normalized(), UP, Vector((0.9, 0.4, -0.5)))
    if short > 0.005:
        print(f"  the left hand (at the pouch) short by {short * 100:.1f} cm")
    curl(P, "L", 1.05, 1.0, 0.35)
    look(P, (at - P.head("head")).normalized(), 0.3)


def reload_in(P, g, t, xs):
    """4 — the new one's lug hooked in the well, rocked back toward the guard — his palm behind it."""
    f, u = reload_gun(P, g)
    M = mag_rock(g, -0.3)
    left_on_mag(P, g, f, u, M)


def reload_rack(P, g, t, xs):
    """5 — run dry: his left hand under the rifle, its index on the charging handle (his right), swept back."""
    f, u = reload_gun(P, g)
    mag_rock(g, 0.0)
    carrier_back(g, 0.12)
    fr, ur, lr = gun_frame(f, u)
    knob = at_gun(g, CHARGE - Vector((0.12, 0, 0)))
    # (the palm up under the receiver, the fingers up round its right side, the index hooked on the knob — the
    # thumb's side ahead)
    palm = at_gun(g, Vector((CHARGE.x - 0.12 - 0.02, -0.004, -0.004)))
    short = arm(P, "L", palm, (-lr * 0.85 + ur * 0.4).normalized(), fr, Vector((0.5, -0.2, -1)))
    if short > 0.005:
        print(f"  the left hand (the handle) short by {short * 100:.1f} cm")
    curl(P, "L", 1.2, 1.1, 0.4)
    look(P, (knob - P.head("head")).normalized(), 0.3)


def slung(P, g, t, xs, both=False):
    """Put away (F6a): slung on his back, mirrored to the double-barrel's — the muzzle up past his left
    shoulder, the stock down at his right hip, the magazine out from his back; the strap from the front swivel
    over his left shoulder, across his chest to his right hip, round to the stock's loop."""
    stance(P, 0.0)
    f = (LEFT * 0.55 + UP * 0.83).normalized()
    u = FWD
    G = Vector((0.02, 0.15, 1.2))
    place(g, G, f, u)
    front = at_gun(g, (0.46, 0.0, 0.03))
    loop = at_gun(g, (-0.35, 0.0, 0.0))
    shL = P.head("shoulderL")
    strap([front, shL + UP * 0.07 + BACK * 0.02, shL + UP * 0.05 + FWD * 0.12 + RIGHT * 0.05, Vector((0.0, -0.15, 1.2)), Vector((-0.16, -0.11, 0.98)), Vector((-0.19, 0.04, 0.95)), loop], "sling-ak")
    if both:
        # (the double-barrel too, as plan 81 slings it: the stock up behind his right shoulder, the barrels down
        # to his left hip)
        s = xs["shotgun"]
        fs = (LEFT * 0.62 - UP * 0.78).normalized()
        us = fs.cross(FWD).normalized()
        if us.dot(BACK) < 0:
            us = -us
        place(s, Vector((-0.12, 0.135, 1.36)), fs, us)
        for o in s.root.children:
            o.hide_render = ".cut" in o.name
    for S in ("L", "R"):
        P.turn(f"shoulder{S}", FWD, 0.12 if S == "L" else -0.12)
    look(P, FWD, 0.05)


POSES = [
    ("ready", lambda P, g, t, xs: ready(P, g, t)),
    ("ready-torch", lambda P, g, t, xs: ready(P, g, t, torch=True)),
    ("aim", lambda P, g, t, xs: aim(P, g, t)),
    ("aim-torch", lambda P, g, t, xs: aim(P, g, t, torch=True)),
    ("reload-1-out", reload_out),
    ("reload-2-drop", reload_drop),
    ("reload-3-fetch", reload_fetch),
    ("reload-4-in", reload_in),
    ("reload-5-rack", reload_rack),
    ("slung", lambda P, g, t, xs: slung(P, g, t, xs)),
    ("slung-both", lambda P, g, t, xs: slung(P, g, t, xs, both=True)),
]

if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    studio(scene)
    rig = man()
    tone(rig)
    P = Pose(rig)
    g = guns.ak47()
    t = guns.torch()
    for o in t.root.children:
        if ".cut" in o.name:
            o.hide_render = True
    xs = {"empty": spare("empty"), "new": spare("new"), "shotgun": guns.shotgun()}
    CAMS = {
        "side": camera("side", (-2.3, -0.5, 1.3), (0, -0.35, 1.15), 36),
        "front": camera("front", (-0.6, -2.3, 1.55), (-0.03, -0.35, 1.15), 32),
        "shoulder": camera("shoulder", (-0.5, 1.5, 1.95), (-0.5, -2.5, 1.5), 46),
        "back": camera("back", (0.5, 2.2, 1.5), (0, 0, 1.2), 34),
        "left": camera("left", (1.6, -1.6, 1.2), (0.05, -0.1, 1.0), 34),
    }
    hands = camera("hands", (0, 0, 0), (0, -1, 0), 34)
    hands_l = camera("hands-left", (0, 0, 0), (0, -1, 0), 34)
    for name, fn in POSES:
        if ONLY and name not in ONLY:
            continue
        P.reset()
        show(g)
        mag_rock(g, 0.0)
        carrier_back(g, 0.0)
        for o in t.root.children:
            o.hide_render = "torch" not in name or ".cut" in o.name
        for k in ("empty", "new"):
            for c in xs[k].root.children:
                c.hide_render = True
        for o in xs["shotgun"].root.children:
            o.hide_render = True
        for o in bpy.data.objects:
            if o.name.startswith("sling-ak") or (o.name.startswith("pouch") and o.type == "MESH"):
                bpy.data.objects.remove(o, do_unlink=True)
        # (the pouch on the belt, built as the body stands, every pose)
        if "pouch" not in xs:
            xs["pouch"] = pouch(P)
        else:
            at, out, mags = xs["pouch"]
            bpy.ops.mesh.primitive_cube_add(size=1)
            box = bpy.context.object
            box.name = "pouch"
            side = UP.cross(out).normalized()
            box.matrix_world = Matrix.Translation(at) @ Matrix((side, out, UP)).transposed().to_4x4() @ Matrix.Diagonal((0.09, 0.045, 0.11, 1))
            box.data.materials.append(LEATHER())
            for m in mags:
                show(m, mag=True, rest=False)
        fn(P, g, t, xs)
        G = g.root.matrix_world.translation
        mid = at_gun(g, (0.2, 0, 0.02))
        hands.location = G + Vector((-0.45, -0.55, 0.22))
        hands.rotation_euler = (G - hands.location).to_track_quat("-Z", "Y").to_euler()
        hands_l.location = mid + Vector((0.5, -0.5, 0.2))
        hands_l.rotation_euler = (mid - hands_l.location).to_track_quat("-Z", "Y").to_euler()
        head = rig.matrix_world @ P.p["head"].head
        shc = CAMS["shoulder"]
        shc.location = head + RIGHT * 0.5 - FWD * 1.5 + UP * 0.3
        shc.rotation_euler = (FWD * 10 - UP * 1.2).to_track_quat("-Z", "Y").to_euler()
        cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("shoulder", shc), ("hands", hands), ("hands-left", hands_l)]
        if name.startswith("reload"):
            cams.append(("left", CAMS["left"]))
        if name.startswith("slung"):
            cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("back", CAMS["back"]), ("shoulder", shc)]
        for cname, cam in cams:
            scene.camera = cam
            scene.render.resolution_x, scene.render.resolution_y = (1280, 720) if cname == "shoulder" else (960, 960)
            scene.render.filepath = os.path.join(OUT, f"{name}-{cname}.png")
            bpy.ops.render.render(write_still=True)
        print("wrote", name)

# Plan 81, phase 0 — the double-barrel's mocks: the life man holding it as plan 81 decided (the low ready, the
# butt in the shoulder's pocket and the muzzle ~35° down; aimed square, the cheek on the comb; the torch held
# against the fore-end; the real reload a shell at a time from a carrier on the belt at the right hip; slung on
# his back, drawn over the right shoulder), in a plain lit studio, from his right, the front, over his
# shoulder (the game's camera) and close on each hand. Both hands put on the gun at places on it — the right on
# the stock's wrist, the left palm up under the fore-end, its fingers round its side — by pose.py's two-bone
# solve that sets the whole hand.
#
#   blender -b --factory-startup -P tools/art/guns/mock81.py -- [--out design/guns/p81] [--only ready,aim]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402
from mock80 import TONES, camera, studio, tone  # noqa: E402,F401  (its scene's pieces; its own run is guarded)
from pose import FWD, LEFT, UP, Pose, arm, curl, look, man, place, stance  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/guns/p81")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)
RIGHT = -LEFT
BACK = -FWD

# ── the double-barrel's own (tools/art/guns/guns.py shotgun(): +x the barrels, +y its left, +z up; the grip
# point at its origin, at the stock's wrist) ───────────────────────────────────────────────────────────────
B0 = 0.142  # the breech
BZ = 0.066  # the bore
HINGE = Vector((B0 + 0.002, 0.0, 0.033))
BARRELS = ("barrelL", "barrelR", "rib", "bead", "fore-end", "fore-iron", "latch", "round0", "round1")
BUTT = Vector((-0.392, 0.0, -0.035))  # the pad's middle
# the right hand on the stock's wrist: the palm's middle there (its skin on the wrist's right side)
WRIST = Vector((-0.046, -0.012, -0.022))


def gun_frame(f, u):
    f = f.normalized()
    u = (u - f * f.dot(u)).normalized()
    return f, u, u.cross(f)  # (along the barrels, its top, its left)


def open_gun(g, k):
    """The barrels dropped on their hinge `k` (0 shut … 1 broken open, 0.52 rad), the top lever across."""
    R = Matrix.Translation(HINGE) @ Matrix.Rotation(0.52 * k, 4, "Y") @ Matrix.Translation(-HINGE)
    L = Matrix.Translation((0.02, 0, BZ + 0.013)) @ Matrix.Rotation(-0.6 * min(1.0, k * 3), 4, "Z") @ Matrix.Translation((-0.02, 0, -(BZ + 0.013)))
    for ob in g.root.children:
        part = ob.name.split(".", 1)[1] if "." in ob.name else ob.name
        if part in BARRELS:
            ob.matrix_basis = R
        elif part == "lever":
            ob.matrix_basis = L
    bpy.context.view_layer.update()
    return R


def at_gun(g, p, barrels=None):
    """A point of the gun's (its own frame) in the world — on the barrels, as they've dropped."""
    q = Vector(p)
    if barrels is not None:
        q = barrels @ q
    return g.root.matrix_world @ q


def from_butt(g, pocket, f, u):
    """The gun placed by its butt in the shoulder's pocket, its barrels along f, its top along u: its grip."""
    place(g, Vector((0, 0, 0)), f, u)
    G = pocket - g.root.matrix_world.to_3x3() @ BUTT
    place(g, G, f, u)
    return G


def pocket(P, down=0.0):
    """The right shoulder's pocket: in from the joint, ahead of it, a little under."""
    return P.head("shoulderR") + LEFT * 0.06 + FWD * 0.07 - UP * (0.025 + down)


def right_on_wrist(P, g, f, u, index=0.5, pole=Vector((-1, 0.3, -0.5))):
    """The right hand round the stock's wrist: the knuckles across it, the index along the guard (or on the
    front trigger)."""
    f, u, l = gun_frame(f, u)
    W = at_gun(g, WRIST)
    short = arm(P, "R", W, (f * 0.75 + l * 0.15 - u * 0.62).normalized(), (f * 0.35 + u).normalized(), pole)
    if short > 0.005:
        print(f"  the right hand short by {short * 100:.1f} cm")
    curl(P, "R", 1.25, index, 0.45)


def left_under_fore(P, g, f, u, barrels=None, under=0.035, pole=Vector((0.5, 0.3, -1)), torch=None):
    """The left hand palm up under the fore-end, as far out along it as the arm reaches, its fingers round
    its right side, the thumb ahead along its left; the torch (if any) held under it in the same fist."""
    f, u, l = gun_frame(f, u)
    if barrels is not None:
        R3 = (g.root.matrix_world.to_3x3() @ barrels.to_3x3() @ g.root.matrix_world.to_3x3().inverted())
        f, u, l = (R3 @ f).normalized(), (R3 @ u).normalized(), (R3 @ l).normalized()
    Sl = P.head("shoulderL")
    best = None
    for k in range(40):
        x = 0.33 - k * 0.0045
        p = at_gun(g, (x, 0, under), barrels)
        if (p - Sl).length <= 0.55:
            best = p
            print(f"  the fore-end at {x:.3f}, {(p - Sl).length:.3f} from the left shoulder")
            break
    if best is None:
        best = at_gun(g, (0.16, 0, under), barrels)
        print(f"  the fore-end out of reach: {(best - Sl).length:.3f} at its back end")
    if torch is not None:
        # (the torch along the barrels under the fore-end, its lens ahead; the hand round both)
        place(torch, best - u * 0.045 - f * 0.06, f, u)
        best = best - u * 0.03
    short = arm(P, "L", best, (-l * 0.85 + f * 0.45).normalized(), f, pole)
    if short > 0.005:
        print(f"  the left hand short by {short * 100:.1f} cm")
    curl(P, "L", 1.1 if torch is None else 1.3, 1.0, 0.5)
    return best


# ── the props: a 12-gauge shell, the belt's carrier, the sling ──────────────────────────────────────────
def material(name, color, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def HULL():
    return bpy.data.materials.get("hull") or material("hull", (0.5, 0.06, 0.04), 0.45)


def LEATHER():
    return bpy.data.materials.get("strap") or material("strap", (0.16, 0.08, 0.035), 0.7)


def shell(name):
    """A 12-gauge shell: its brass head at its origin, its hull along +x (70 mm)."""
    s = guns.Gun(name)
    X = Vector((1, 0, 0))
    s.part("head", lambda bm: guns.lathe(bm, [(0, 0), (0, 0.0108), (0.0016, 0.0108), (0.0016, 0.0101), (0.013, 0.0101), (0.013, 0)], Vector((0, 0, 0)), X, 20), "brass")
    s.part("hull", lambda bm: guns.lathe(bm, [(0.013, 0), (0.013, 0.01), (0.068, 0.01), (0.07, 0.006), (0.07, 0)], Vector((0, 0, 0)), X, 20), HULL())
    return s


def put(o, at, x, up):
    """An object (its root) at `at`, its +x along x, its +z toward up."""
    x = x.normalized()
    z = (up - x * x.dot(up)).normalized()
    y = z.cross(x)
    o.root.matrix_world = Matrix.Translation(at) @ Matrix((x, y, z)).transposed().to_4x4()


def carrier(P):
    """The shell carrier on the belt at his right hip's side: a leather strip, four shells upright in its
    loops, their heads down. Its top middle back."""
    hip = P.head("hips") if "hips" in P.p else Vector((0, 0, 0.95))
    # (round on the hip's side, below where the stock sits under the arm reloading — ahead of it, it was hidden)
    at = Vector((-0.2, hip.y - 0.05, 0.95))
    out = (FWD * 0.3 + RIGHT * 0.95).normalized()
    side = UP.cross(out).normalized()
    bpy.ops.mesh.primitive_cube_add(size=1)
    strip = bpy.context.object
    strip.scale = (0.09, 0.006, 0.05)
    strip.matrix_world = Matrix.Translation(at - out * 0.004) @ Matrix((side, out, UP)).transposed().to_4x4() @ Matrix.Diagonal((0.09, 0.006, 0.05, 1))
    strip.data.materials.append(LEATHER())
    shells = []
    for i in range(4):
        s = shell(f"carried{i}")
        put(s, at + side * (-0.03 + i * 0.02) + out * 0.012 - UP * 0.03, UP, out)
        shells.append(s)
    return at, out, shells, strip


def strap(points, name="sling"):
    """The sling: a flat leather strap along the points (a run of thin boxes)."""
    objs = []
    for i in range(len(points) - 1):
        a, b = Vector(points[i]), Vector(points[i + 1])
        d = b - a
        bpy.ops.mesh.primitive_cube_add(size=1)
        o = bpy.context.object
        x = d.normalized()
        z = (UP - x * x.dot(UP))
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


def ready(P, g, t, torch=False):
    """The low ready (F1a): the butt in the shoulder's pocket, the muzzle ~35° down at the ground ahead,
    both hands on; with the torch (F3a) held against the fore-end in the left."""
    stance(P, 0.55)
    f = (FWD * math.cos(0.6) - UP * math.sin(0.6) + LEFT * 0.08).normalized()
    from_butt(g, pocket(P, 0.0), f, UP)
    right_on_wrist(P, g, f, UP, index=0.1, pole=Vector((-1, 0.4, -0.7)))
    left_under_fore(P, g, f, UP, pole=Vector((0.6, 0.4, -1)), torch=t if torch else None)
    look(P, FWD, 0.18)


def aim(P, g, t, torch=False):
    """Aimed square (F2a): the butt in the pocket, the cheek down on the comb, both elbows down, the head
    over the rib; with the torch held against the fore-end."""
    # (square to the target but the right shoulder a little back — the left arm can't reach the fore-end
    # with the shoulders flat to it: 16 cm short)
    stance(P, 0.55)
    # (the butt's heel up at the top of the shoulder: the comb under the cheek, the rib under the eye)
    from_butt(g, pocket(P, -0.05), AIM, UP)
    right_on_wrist(P, g, AIM, UP, index=0.55, pole=Vector((-1, 0.2, -0.8)))
    left_under_fore(P, g, AIM, UP, pole=Vector((0.4, 0.2, -1)), torch=t if torch else None)
    look(P, AIM, 0.36, side=0.2)


# the reload's gun: down under the right arm, the stock along the forearm against the ribs, the muzzle ahead,
# down and a little left — broken open on its hinge
def reload_gun(P, g, k_open=1.0):
    stance(P, 0.15)
    f = (FWD * math.cos(0.62) - UP * math.sin(0.62) + LEFT * 0.22).normalized()
    u = (UP + RIGHT * 0.25).normalized()
    G = Vector((-0.12, -0.2, 1.02))
    place(g, G, f, u)
    return f, u, open_gun(g, k_open)


def reload_open(P, g, t, sh):
    """1 — the right thumb across the top lever, the left hand drops the barrels: the fired shells thrown
    out by the ejectors, up and back over his right shoulder."""
    f, u, R = reload_gun(P, g, 1.0)
    right_on_wrist(P, g, f, u, index=0.1, pole=Vector((-1, 0.6, -0.3)))
    left_under_fore(P, g, f, u, barrels=R, pole=Vector((0.6, 0.5, -1)))
    f2, u2, l2 = gun_frame(f, u)
    for i, s in enumerate(sh[:2]):
        # (in the air: a few cm out of the breech, tumbling)
        b = at_gun(g, (B0, (1 if i == 0 else -1) * 0.0118, BZ), R)
        put(s, b + u2 * (0.07 + 0.03 * i) - f2 * (0.05 + 0.02 * i) + RIGHT * 0.03, -f2 + u2 * (0.6 - 0.4 * i), u2)
    look(P, (at_gun(g, (B0, 0, BZ)) - P.head("head")).normalized(), 0.3)


def reload_fetch(P, g, t, sh, car):
    """2 — the gun held open by the left hand on the fore-end and the stock under the right arm; the right
    hand at the carrier on the belt, a shell between its fingers."""
    f, u, R = reload_gun(P, g, 1.0)
    left_under_fore(P, g, f, u, barrels=R, pole=Vector((0.6, 0.5, -1)))
    at, out, shells, _ = car
    # (the hand over the carrier, its fingers down at the first loop: a shell drawn up out of it)
    top = at + UP * 0.045 + out * 0.03
    arm(P, "R", top, (-UP * 0.9 + out * 0.3).normalized(), (FWD * 0.6 + LEFT * 0.4).normalized(), Vector((-1, 0.7, -0.4)))
    curl(P, "R", 0.9, 0.9, 0.7)
    shells[0].root.hide_render = True
    put(sh[2], top - UP * 0.055 + out * 0.005, UP, out)
    look(P, (at - P.head("head")).normalized(), 0.35)


def reload_load(P, g, t, sh):
    """3 — the shell into the left chamber: the right fingers push it home by its brass, its hull in."""
    f, u, R = reload_gun(P, g, 1.0)
    left_under_fore(P, g, f, u, barrels=R, pole=Vector((0.6, 0.5, -1)))
    R3 = g.root.matrix_world.to_3x3() @ R.to_3x3() @ g.root.matrix_world.to_3x3().inverted()
    fb = (R3 @ gun_frame(f, u)[0]).normalized()
    ub = (R3 @ gun_frame(f, u)[1]).normalized()
    mouth = at_gun(g, (B0, 0.0118, BZ), R)
    # (half in: its head 3.5 cm out of the chamber's mouth)
    put(sh[2], mouth - fb * 0.035, fb, ub)
    head = mouth - fb * 0.04
    arm(P, "R", head - fb * 0.02 + ub * 0.005, (fb * 0.9 + ub * 0.1).normalized(), (RIGHT * 0.3 + ub).normalized(), Vector((-1, 0.6, -0.4)))
    curl(P, "R", 0.75, 0.6, 0.6)
    look(P, (mouth - P.head("head")).normalized(), 0.4)


def reload_close(P, g, t, sh):
    """4 — both in: the right hand back on the wrist lifts the stock up to the barrels the left hand holds —
    shut — on its way back up to the ready."""
    f, u, R = reload_gun(P, g, 0.15)
    for s in sh[:3]:
        s.root.hide_render = True
    right_on_wrist(P, g, f, u, index=0.1, pole=Vector((-1, 0.6, -0.4)))
    left_under_fore(P, g, f, u, barrels=R, pole=Vector((0.6, 0.5, -1)))
    look(P, FWD, 0.25)


def slung(P, g, t):
    """Put away (F6a): slung across his back, the stock up behind his right shoulder, the barrels down to his
    left hip; the strap from the stock's swivel over the right shoulder, across his chest to the left hip, round
    to the barrels."""
    stance(P, 0.0)
    f = (LEFT * 0.62 - UP * 0.78).normalized()
    # (its left side to his back; its top out from it)
    l = FWD
    u = f.cross(l).normalized()
    if u.dot(BACK) < 0:
        u = -u
    G = Vector((-0.12, 0.135, 1.36))
    place(g, G, f, u)
    sw = at_gun(g, (-0.26, 0, -0.09))
    shR = P.head("shoulderR")
    strap([sw, shR + UP * 0.07 + BACK * 0.02, shR + UP * 0.05 + FWD * 0.12 + LEFT * 0.05, Vector((0.0, -0.15, 1.2)), Vector((0.16, -0.11, 0.98)), Vector((0.19, 0.04, 0.95)), at_gun(g, (0.45, 0, 0.03))])
    for S in ("L", "R"):
        P.turn(f"shoulder{S}", FWD, 0.12 if S == "L" else -0.12)
    look(P, FWD, 0.05)


def draw(P, g, t):
    """Drawn over the right shoulder: the right hand up behind it on the stock's wrist, pulling it up and
    over."""
    slung(P, g, t)
    f, u, l = gun_frame(g.root.matrix_world.to_3x3() @ Vector((1, 0, 0)), g.root.matrix_world.to_3x3() @ Vector((0, 0, 1)))
    W = at_gun(g, WRIST)
    arm(P, "R", W, (-UP * 0.3 + BACK * 0.5 + LEFT * 0.4).normalized(), (BACK * 0.3 + UP).normalized(), Vector((-0.6, 0.2, 1)))
    curl(P, "R", 1.2, 1.1, 0.5)
    look(P, (FWD + RIGHT * 0.6 - UP * 0.1).normalized(), 0.0)


POSES = [
    ("ready", lambda P, g, t, sh, car: ready(P, g, t)),
    ("ready-torch", lambda P, g, t, sh, car: ready(P, g, t, torch=True)),
    ("aim", lambda P, g, t, sh, car: aim(P, g, t)),
    ("aim-torch", lambda P, g, t, sh, car: aim(P, g, t, torch=True)),
    ("reload-1-open", lambda P, g, t, sh, car: reload_open(P, g, t, sh)),
    ("reload-2-fetch", lambda P, g, t, sh, car: reload_fetch(P, g, t, sh, car)),
    ("reload-3-load", lambda P, g, t, sh, car: reload_load(P, g, t, sh)),
    ("reload-4-close", lambda P, g, t, sh, car: reload_close(P, g, t, sh)),
    ("slung", lambda P, g, t, sh, car: slung(P, g, t)),
    ("draw", lambda P, g, t, sh, car: draw(P, g, t)),
]

if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    studio(scene)
    rig = man()
    tone(rig)
    P = Pose(rig)
    g = guns.shotgun()
    t = guns.torch()
    for o in [*g.root.children, *t.root.children]:
        if o.name.endswith(".cut"):
            o.hide_render = True
    sh = [shell(f"shell{i}") for i in range(3)]
    CAMS = {
        "side": camera("side", (-2.3, -0.5, 1.3), (0, -0.35, 1.15), 36),
        "front": camera("front", (-0.6, -2.3, 1.55), (-0.03, -0.35, 1.15), 32),
        "shoulder": camera("shoulder", (-0.5, 1.5, 1.95), (-0.5, -2.5, 1.5), 46),
        "back": camera("back", (0.5, 2.2, 1.5), (0, 0, 1.2), 34),
    }
    hands = camera("hands", (0, 0, 0), (0, -1, 0), 34)
    hands_l = camera("hands-left", (0, 0, 0), (0, -1, 0), 34)
    car = None
    for name, fn in POSES:
        if ONLY and name not in ONLY:
            continue
        P.reset()
        open_gun(g, 0)
        for o in t.root.children:
            o.hide_render = "torch" not in name or o.name.endswith(".cut")
        for s in sh:
            for o in s.root.children:
                o.hide_render = False
            s.root.hide_render = False
        for o in bpy.data.objects:
            if o.name.startswith("sling"):
                bpy.data.objects.remove(o, do_unlink=True)
        # (the carrier on the belt, from the reload on; built once, as the body stands)
        if car is None:
            car = carrier(P)
        for o in car[2]:
            for c in o.root.children:
                c.hide_render = False
        reloading = name.startswith("reload")
        for i, s in enumerate(sh):
            vis = (name == "reload-1-open" and i < 2) or (name in ("reload-2-fetch", "reload-3-load") and i == 2)
            for o in s.root.children:
                o.hide_render = not vis
        fn(P, g, t, sh, car)
        if name == "reload-2-fetch":
            for c in car[2][0].root.children:
                c.hide_render = True
        _ = reloading
        G = g.root.matrix_world.translation
        mid = at_gun(g, (0.12, 0, 0.02))
        hands.location = G + Vector((-0.45, -0.55, 0.22))
        hands.rotation_euler = (G - hands.location).to_track_quat("-Z", "Y").to_euler()
        hands_l.location = mid + Vector((0.5, -0.5, 0.2))
        hands_l.rotation_euler = (mid - hands_l.location).to_track_quat("-Z", "Y").to_euler()
        head = rig.matrix_world @ P.p["head"].head
        shc = CAMS["shoulder"]
        shc.location = head + RIGHT * 0.5 - FWD * 1.5 + UP * 0.3
        shc.rotation_euler = (FWD * 10 - UP * 1.2).to_track_quat("-Z", "Y").to_euler()
        cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("shoulder", shc), ("hands", hands), ("hands-left", hands_l)]
        if name in ("slung", "draw"):
            cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("back", CAMS["back"]), ("shoulder", shc)]
        for cname, cam in cams:
            scene.camera = cam
            scene.render.resolution_x, scene.render.resolution_y = (1280, 720) if cname == "shoulder" else (960, 960)
            scene.render.filepath = os.path.join(OUT, f"{name}-{cname}.png")
            bpy.ops.render.render(write_still=True)
        print("wrote", name)

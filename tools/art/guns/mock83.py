# Plan 83, phase 0 — the sniper's mocks: the life man holding it as plan 83 decided (F1a the AK's low ready in
# both hands, his shoulders square — his left shoulder forward to the fore-end; F2a aimed square, his cheek on
# the riser and his right eye on the scope's axis at its eye relief; F3a the bolt worked by his right hand, the
# rifle kept at his shoulder, his cheek on it; F4a the reload raised nearly upright before his right chest, the
# left hand high on the fore-end, the rounds thumbed in one at a time; F5a the rounds in a sleeve on the stock's
# right side; F6a put away upright down the middle of his back, the muzzle down, over the two crossed long guns;
# F7a the torch against the fore-end), in a plain lit studio, from his right, the front, over his shoulder (the
# game's camera) and close on each hand. Both hands put on the gun at places on it by pose.py's two-bone solve.
#
#   blender -b --factory-startup -P tools/art/guns/mock83.py -- [--out design/guns/p83] [--only ready,aim]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402
from mock80 import camera, studio, tone  # noqa: E402  (its scene's pieces; its own run is guarded)
from mock82 import LEATHER, gun_frame, material, parts, protract, strap  # noqa: E402
from pose import FWD, LEFT, UP, Pose, arm, curl, look, man, place, stance  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/guns/p83")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)
RIGHT = -LEFT
BACK = -FWD

# ── the sniper's own (tools/art/guns/guns.py sniper(): +x the barrel, +y its left, +z up; its origin at the top
# of the pistol grip) ─────────────────────────────────────────────────────────────────────────────────────────
BZ = 0.066  # the bore over the grip
SZ = 0.112  # the scope's axis
BUTT = Vector((-0.39, 0.0, -0.01))  # the pad's middle
EYE = Vector((-0.235, 0.0, SZ))  # the eye at the scope's relief (~9 cm behind its eyecup)
# the right hand round the pistol grip: the palm's middle on its right side, ~4.5 cm down it
GRIP_PALM = Vector((-0.032, -0.02, -0.045))
KNOB = Vector((-0.006, -0.065, 0.034))  # the bolt's knob, home (his right, under the bore)
BOLT_AXIS = Vector((0.0, 0.0, BZ))  # the bolt turns on the bore
BOLT_UP = -1.05  # turned up (rad), then run back
BOLT_BACK = 0.075
PORT = Vector((0.065, -0.012, BZ + 0.004))  # the ejection port's middle: the magazine under it, the bolt back
GUARD_X = (0.17, 0.31)  # where the left hand goes carried and aimed: under the fore-end, behind the folded bipod
GUARD_HIGH = (0.26, 0.42)  # …and reloading, high on it (the rifle upright)
GUARD_PALM_Z = 0.004  # the left palm's middle under it (its underside ~1.3 cm up)
SLEEVE = Vector((-0.255, -0.027, 0.0))  # the cartridge sleeve's middle, on the stock's right side
ROUND_DX = 0.017  # its loops' spacing


def at_gun(g, p, M=None):
    q = Vector(p)
    if M is not None:
        q = M @ q
    return g.root.matrix_world @ q


def show(g):
    for _name, ob in parts(g):
        ob.hide_render = ".cut" in ob.name


def bolt(g, up, back):
    """The bolt (its arm and knob with it) turned up `up` (0..1 of BOLT_UP) and run back `back` (0..1)."""
    R = Matrix.Translation(BOLT_AXIS) @ Matrix.Rotation(BOLT_UP * up, 4, "X") @ Matrix.Translation(-BOLT_AXIS)
    M = Matrix.Translation((-BOLT_BACK * back, 0, 0)) @ R
    for name, ob in parts(g):
        if name in ("bolt", "bolt-arm", "bolt-knob"):
            ob.matrix_basis = M
    bpy.context.view_layer.update()
    return M


def from_butt(g, pk, f, u):
    place(g, Vector((0, 0, 0)), f, u)
    G = pk - g.root.matrix_world.to_3x3() @ BUTT
    place(g, G, f, u)
    return G


def pocket(P, aimed):
    s = P.head("shoulderR")
    if aimed:
        return s + LEFT * 0.06 + FWD * 0.07 + UP * 0.025
    return s + LEFT * 0.03 + FWD * 0.07 - UP * 0.03


def right_on_grip(P, g, f, u, index=0.12, pole=Vector((-1, 0.2, -0.7))):
    """The right hand round the pistol grip: the web high on its back, the knuckles across it, the index along
    the action (or on the trigger)."""
    f, u, l = gun_frame(f, u)
    short = arm(P, "R", at_gun(g, GRIP_PALM), (f * 0.55 + l * 0.15 - u * 0.82).normalized(), (f * 0.5 + u).normalized(), pole)
    if short > 0.005:
        print(f"  the right hand short by {short * 100:.1f} cm")
    curl(P, "R", 1.25, index, 0.45)


def left_on_guard(P, g, f, u, pole=Vector((0.5, 0.3, -1)), torch=None, span=GUARD_X, reach=0.56):
    """The left hand cupped up under the fore-end, its fingers along it and round its right — as far out along it
    as the arm reaches (in `span`); the torch (if any) under it in the same fist."""
    f, u, l = gun_frame(f, u)
    Sl = P.head("shoulderL")
    best = None
    for k in range(40):
        x = span[1] - k * (span[1] - span[0]) / 39
        p = at_gun(g, (x, 0, GUARD_PALM_Z))
        if (p - Sl).length <= reach:
            best = p
            print(f"  the fore-end at {x:.3f}, {(p - Sl).length:.3f} from the left shoulder")
            break
    if best is None:
        best = at_gun(g, (span[0], 0, GUARD_PALM_Z))
        print(f"  the fore-end out of reach: {(best - Sl).length:.3f} at {span[0]}")
    if torch is not None:
        place(torch, best - u * 0.045 + f * 0.05, f, u)
        best = best - u * 0.03
    # (the AK's: fingers forward along it and round its right side, the palm up under its left edge)
    short = arm(P, "L", best, (f * 0.8 - l * 0.55).normalized(), (f * 0.5 + u * 0.7 + l * 0.5).normalized(), pole)
    if short > 0.005:
        print(f"  the left hand short by {short * 100:.1f} cm")
    curl(P, "L", 1.1 if torch is None else 1.3, 1.0, 0.5)


def right_on_knob(P, g, f, u, M, pole=Vector((-0.7, 0.3, -1)), hand=None):
    """The right hand on the bolt's knob (as `M` has it): from its right and behind, the knob in the curl of the
    index and the thumb, the palm to the gun — the forearm low along the stock, clear of his face."""
    f, u, l = gun_frame(f, u)
    knob = at_gun(g, KNOB, M)
    off = hand or (-0.03, -0.012, -0.035)  # (his right, down, back from the knob)
    palm = knob - l * off[0] * -1 + u * off[1] + f * off[2]
    short = arm(P, "R", palm, (l * 0.55 + f * 0.6 + u * 0.1).normalized(), (u * 0.85 + f * 0.2).normalized(), pole)
    if short > 0.005:
        print(f"  the right hand (the knob) short by {short * 100:.1f} cm")
    curl(P, "R", 1.15, 1.0, 0.8)


def eye_on_scope(P, g, f, u, down=0.45, over=0.16):
    """His cheek down on the riser — the neck and head turned down and over as far as a real one goes on a stock
    — and the rifle brought up to his eye for the rest (as the game's cheekTo): his right eye on the scope's
    axis at its relief. The rifle's move printed."""
    for n in ("neck", "head"):
        P.p[n].matrix_basis = Matrix.Identity(4)
    P.upd()
    P.turn("neck", LEFT, down * 0.5)
    P.turn("neck", FWD, over * 0.5)
    P.turn("head", LEFT, down * 0.5)
    P.turn("head", FWD, over * 0.5)
    e = P.head("eyeR")
    fv, uv, lv = gun_frame(f, u)
    d = e - at_gun(g, EYE)
    d = d - fv * fv.dot(d)  # (not along the bore: the butt stays in the pocket's depth)
    m = g.root.matrix_world.copy()
    m.translation = m.translation + d
    g.root.matrix_world = m
    bpy.context.view_layer.update()
    print(f"  the rifle up {uv.dot(d) * 100:.1f} cm, over {lv.dot(d) * 100:.1f} to his eye (head down {down}, over {over})")
    return e


# ── the props: rounds, the sleeve, a spent case ─────────────────────────────────────────────────────────
def BRASS():
    return bpy.data.materials.get("brass-m") or material("brass-m", (0.78, 0.56, 0.25), 0.3, 1.0)


def COPPER():
    return bpy.data.materials.get("copper-m") or material("copper-m", (0.7, 0.36, 0.2), 0.3, 1.0)


def cartridge(name, spent=False):
    """A .308 round: the case 5.1 cm, 1.2 wide, its bullet 2 cm on its mouth (a spent case without); its axis
    its local +z, its base at the origin."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.006, depth=0.051, location=(0, 0, 0.0255))
    case = bpy.context.object
    case.data.materials.append(BRASS())
    objs = [case]
    if not spent:
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.0039, radius2=0.0008, depth=0.02, location=(0, 0, 0.061))
        b = bpy.context.object
        b.data.materials.append(COPPER())
        objs.append(b)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = case
    bpy.ops.object.join()
    case.name = name
    bpy.ops.object.select_all(action="DESELECT")
    return case


def put(ob, at, axis, side):
    """An object placed: its origin at `at`, its +z along `axis`, its +x toward `side`."""
    z = axis.normalized()
    x = (side - z * z.dot(side)).normalized()
    y = z.cross(x)
    ob.matrix_world = Matrix.Translation(at) @ Matrix((x, y, z)).transposed().to_4x4()


def sleeve(g, rounds):
    """The cartridge sleeve on the stock's right side (F5a): a band, five loops, the rounds standing across the
    stock, bullets up; `rounds` of them still in it."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    band = bpy.context.object
    band.name = "sleeve"
    band.data.materials.append(LEATHER())
    W = g.root.matrix_world
    R3 = W.to_3x3()
    f, u, l = (R3 @ Vector((1, 0, 0))).normalized(), (R3 @ Vector((0, 0, 1))).normalized(), (R3 @ Vector((0, 1, 0))).normalized()
    band.matrix_world = Matrix.Translation(at_gun(g, SLEEVE)) @ Matrix((f, l, u)).transposed().to_4x4() @ Matrix.Diagonal((0.1, 0.006, 0.042, 1))
    held = []
    for i in range(5):
        r = bpy.data.objects.get(f"sleeved{i}") or cartridge(f"sleeved{i}")
        r.hide_render = i >= rounds
        at = at_gun(g, SLEEVE + Vector(((i - 2) * ROUND_DX, -0.009, -0.03)))
        put(r, at, u, f)
        held.append(r)
    return band, held


# ── the poses ───────────────────────────────────────────────────────────────────────────────────────
AIM = Vector((0, -1, -0.03)).normalized()
READY_DOWN = 0.45


def ready(P, g, t, xs, torch=False):
    """The low ready (F1a, the AK's): his shoulders square, the butt at the shoulder's front, the muzzle ~26°
    down and across to his left, both hands on — his left shoulder brought forward to the fore-end."""
    stance(P, 0.08)
    protract(P, 0.07)
    f = (FWD * math.cos(READY_DOWN) - UP * math.sin(READY_DOWN) + LEFT * 0.28).normalized()
    from_butt(g, pocket(P, False), f, UP)
    right_on_grip(P, g, f, UP)
    left_on_guard(P, g, f, UP, pole=Vector((0.6, 0.4, -1)), torch=t if torch else None)
    look(P, FWD, 0.18)
    sleeve(g, 5)


def aim(P, g, t, xs, torch=False):
    """Aimed square (F2a): the butt in the pocket, his cheek down on the riser, his right eye on the scope's axis
    at its relief, both elbows down; the torch against the fore-end (F7a)."""
    stance(P, 0.25)
    protract(P, 0.07)
    from_butt(g, pocket(P, True), AIM, UP)
    eye_on_scope(P, g, AIM, UP)
    right_on_grip(P, g, AIM, UP, index=0.55, pole=Vector((-1, 0.1, -0.8)))
    left_on_guard(P, g, AIM, UP, pole=Vector((0.4, 0.2, -1)), torch=t if torch else None)
    sleeve(g, 5)


def bolt_key(P, g, t, xs, up, back, case=False):
    """The bolt worked (F3a): the rifle kept at his shoulder, his cheek on it, his left hand on the fore-end —
    his right hand off the grip on the knob: turned up, run back (the case thrown out to his right), home."""
    stance(P, 0.25)
    protract(P, 0.07)
    from_butt(g, pocket(P, True), AIM, UP)
    eye_on_scope(P, g, AIM, UP)
    M = bolt(g, up, back)
    right_on_knob(P, g, AIM, UP, M)
    left_on_guard(P, g, AIM, UP, pole=Vector((0.4, 0.2, -1)))
    sleeve(g, 5)
    if case:
        f, u, l = gun_frame(AIM, UP)
        c = xs["case"]
        c.hide_render = False
        put(c, at_gun(g, PORT) - l * 0.07 + u * 0.05 - f * 0.02, (-l * 0.6 + u * 0.5 + f * 0.3).normalized(), u)


def raised(P, g):
    """Reloading (F4a): the rifle swung up nearly upright before his right chest, the muzzle up and a little
    ahead, its right side (the port) turned to him; his left hand high on the fore-end; his head bowed to the
    action."""
    stance(P, 0.12)
    protract(P, 0.05)
    f = (UP * 0.8 + FWD * 0.52 + LEFT * 0.14).normalized()
    u = (LEFT * 0.8 + BACK * 0.35).normalized()
    sh = P.head("shoulderR")
    place(g, sh + FWD * 0.26 + LEFT * 0.1 - UP * 0.4, f, u)
    left_on_guard(P, g, f, u, pole=Vector((0.8, 0.3, -0.6)), span=GUARD_HIGH, reach=0.6)
    return f, u


def bow(P, g, p):
    look(P, (p - P.head("head")).normalized(), 0.35)


def reload_open(P, g, t, xs):
    """1 — raised, his right hand on the knob: the bolt up and back, the magazine open under the port."""
    f, u = raised(P, g)
    M = bolt(g, 1, 1)
    right_on_knob(P, g, f, u, M, pole=Vector((-1, 0.5, -0.6)))
    sleeve(g, 5)
    bow(P, g, at_gun(g, PORT))


def reload_fetch(P, g, t, xs):
    """2 — his right hand down to the sleeve on the stock: a round drawn up out of its loop."""
    f, u = raised(P, g)
    bolt(g, 1, 1)
    band, held = sleeve(g, 4)
    fr, ur, lr = gun_frame(f, u)
    r = xs["round"]
    r.hide_render = False
    top = at_gun(g, SLEEVE + Vector((2 * ROUND_DX, -0.009, 0.0)))
    put(r, top, ur, fr)
    # (the round pinched by its body between his thumb and index, the hand on its far side from the stock)
    short = arm(P, "R", top - lr * 0.03 + ur * 0.045, (ur * 0.4 + lr * 0.5 - fr * 0.6).normalized(), ur, Vector((-1, 0.5, -0.4)))
    if short > 0.005:
        print(f"  the right hand (the sleeve) short by {short * 100:.1f} cm")
    curl(P, "R", 1.0, 0.9, 0.8)
    bow(P, g, top)


def reload_in(P, g, t, xs):
    """3 — the round laid in the open action, bullet ahead, thumbed down into the magazine."""
    f, u = raised(P, g)
    bolt(g, 1, 1)
    sleeve(g, 4)
    fr, ur, lr = gun_frame(f, u)
    r = xs["round"]
    r.hide_render = False
    port = at_gun(g, PORT)
    put(r, port - fr * 0.03, fr, ur)
    short = arm(P, "R", port - lr * 0.035 + ur * 0.04, (fr * 0.3 + lr * 0.55 - ur * 0.75).normalized(), fr, Vector((-1, 0.6, -0.4)))
    if short > 0.005:
        print(f"  the right hand (the port) short by {short * 100:.1f} cm")
    curl(P, "R", 0.9, 0.8, 0.3)
    bow(P, g, port)


def reload_shut(P, g, t, xs):
    """4 — the bolt run home over them and turned down: his right hand on the knob."""
    f, u = raised(P, g)
    M = bolt(g, 0.5, 0)
    right_on_knob(P, g, f, u, M, pole=Vector((-1, 0.5, -0.6)))
    sleeve(g, 0)
    bow(P, g, at_gun(g, PORT))


def slung(P, g, t, xs, both=False, up=False, diag=False):
    """Put away (F6a): on his back, upright down the middle, the muzzle down, the stock up between his shoulder
    blades, its bolt out (his right); the strap from the stock's stud over his right shoulder, across his chest
    to his left hip, round to the fore-end's stud. With the AK and the double-barrel crossed under it."""
    stance(P, 0.0)
    out = 0.045 if both else 0.0
    if diag:
        # (on the AK's diagonal, over it: the muzzle up past his left shoulder, the stock down at his right hip,
        # flat, its bolt out)
        f = (LEFT * 0.55 + UP * 0.83).normalized()
        u = (RIGHT * 0.83 + UP * 0.55).normalized()
        G = Vector((0.0, 0.2 + out, 1.16))
    elif up:
        # (the other way up: the butt at the small of his back, the muzzle up past his head)
        f = UP
        u = LEFT
        G = Vector((0.0, 0.17 + out, 1.18))
    else:
        f = -UP
        u = RIGHT
        G = Vector((0.0, 0.17 + out, 1.13))
    place(g, G, f, u)
    rear = at_gun(g, (-0.28, -0.002, -0.098))
    front = at_gun(g, (0.59, -0.002, 0.02))
    shR = P.head("shoulderR")
    strap([rear, shR + UP * 0.07 + BACK * 0.02, shR + UP * 0.05 + FWD * 0.12 + LEFT * 0.05, Vector((0.0, -0.15, 1.2)), Vector((0.16, -0.11, 0.98)), Vector((0.19, 0.06, 0.92)), front], "sling-sn")
    if both:
        # (the AK flat, as plan 82 slings it: the muzzle up past his left shoulder, its right side to him)
        a = xs["ak"]
        fa = (LEFT * 0.55 + UP * 0.83).normalized()
        place(a, Vector((0.02, 0.16, 1.2)), fa, (RIGHT * 0.83 + UP * 0.55).normalized())
        for o in a.root.children:
            o.hide_render = ".cut" in o.name
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
    sleeve(g, 5)


POSES = [
    ("ready", lambda P, g, t, xs: ready(P, g, t, xs)),
    ("ready-torch", lambda P, g, t, xs: ready(P, g, t, xs, torch=True)),
    ("aim", lambda P, g, t, xs: aim(P, g, t, xs)),
    ("aim-torch", lambda P, g, t, xs: aim(P, g, t, xs, torch=True)),
    ("bolt-1-up", lambda P, g, t, xs: bolt_key(P, g, t, xs, 1, 0)),
    ("bolt-2-back", lambda P, g, t, xs: bolt_key(P, g, t, xs, 1, 1, case=True)),
    ("bolt-3-home", lambda P, g, t, xs: bolt_key(P, g, t, xs, 0.3, 0)),
    ("reload-1-open", reload_open),
    ("reload-2-fetch", reload_fetch),
    ("reload-3-in", reload_in),
    ("reload-4-shut", reload_shut),
    ("slung", lambda P, g, t, xs: slung(P, g, t, xs)),
    ("slung-all", lambda P, g, t, xs: slung(P, g, t, xs, both=True)),
    ("slung-up", lambda P, g, t, xs: slung(P, g, t, xs, up=True)),
    ("slung-up-all", lambda P, g, t, xs: slung(P, g, t, xs, both=True, up=True)),
    ("slung-diag-all", lambda P, g, t, xs: slung(P, g, t, xs, both=True, diag=True)),
]

if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    studio(scene)
    rig = man()
    tone(rig)
    P = Pose(rig)
    g = guns.sniper()
    t = guns.torch()
    for o in t.root.children:
        if ".cut" in o.name:
            o.hide_render = True
    xs = {"ak": guns.ak47(), "shotgun": guns.shotgun(), "round": cartridge("round"), "case": cartridge("case", spent=True)}
    CAMS = {
        "side": camera("side", (-2.3, -0.5, 1.3), (0, -0.35, 1.15), 36),
        "front": camera("front", (-0.6, -2.3, 1.55), (-0.03, -0.35, 1.15), 32),
        "shoulder": camera("shoulder", (-0.5, 1.5, 1.95), (-0.5, -2.5, 1.5), 46),
        "back": camera("back", (0.5, 2.4, 1.3), (0, 0, 1.0), 40),
        "left": camera("left", (1.6, -1.6, 1.2), (0.05, -0.1, 1.0), 34),
    }
    hands = camera("hands", (0, 0, 0), (0, -1, 0), 34)
    hands_l = camera("hands-left", (0, 0, 0), (0, -1, 0), 34)
    for name, fn in POSES:
        if ONLY and name not in ONLY:
            continue
        P.reset()
        show(g)
        bolt(g, 0, 0)
        for o in t.root.children:
            o.hide_render = "torch" not in name or ".cut" in o.name
        for k in ("ak", "shotgun"):
            for o in xs[k].root.children:
                o.hide_render = True
        xs["round"].hide_render = True
        xs["case"].hide_render = True
        for o in list(bpy.data.objects):
            if o.name.startswith("sling-sn") or o.name.startswith("sleeve") and not o.name.startswith("sleeved"):
                bpy.data.objects.remove(o, do_unlink=True)
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
        if name.startswith("aim") or name.startswith("bolt"):
            # (close on his eye at the scope: from his right, level with it)
            eye = rig.matrix_world @ P.p["eyeR"].head
            ec = camera("eye", (0, 0, 0), (0, -1, 0), 30)
            ec.location = eye + RIGHT * 0.42 + FWD * 0.06
            ec.rotation_euler = (eye + FWD * 0.06 - ec.location).to_track_quat("-Z", "Y").to_euler()
            cams.append(("eye", ec))
        if name.startswith("reload"):
            rc = camera("reload", (0, 0, 0), (0, -1, 0), 34)
            p = at_gun(g, PORT)
            rc.location = p + RIGHT * 0.55 + FWD * 0.35 + UP * 0.25
            rc.rotation_euler = (p - rc.location).to_track_quat("-Z", "Y").to_euler()
            cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("shoulder", shc), ("action", rc)]
        if name.startswith("slung"):
            cams = [("side", CAMS["side"]), ("back", CAMS["back"]), ("shoulder", shc)]
        for cname, cam in cams:
            scene.camera = cam
            scene.render.resolution_x, scene.render.resolution_y = (1280, 720) if cname == "shoulder" else (960, 960)
            scene.render.filepath = os.path.join(OUT, f"{name}-{cname}.png")
            bpy.ops.render.render(write_still=True)
        print("wrote", name)

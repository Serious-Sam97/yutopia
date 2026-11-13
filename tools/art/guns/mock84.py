# Plan 84, phase 0 — the Daybreak's mocks: the life man holding it as plan 84 decided (F1a the AK's low ready in
# both hands, his shoulders square — his left shoulder forward to the vertical fore-grip; F2a shouldered, the
# brace's pad in his pocket, his head upright behind the high ring sight; F3a the charge braced — his weight
# forward, the core swelling — and the shove of the shot; F4a the reload at the ready, turned on its side: the
# spent cell drawn out underneath and let fall, a new one from F5a's pouch on his belt's left front, pressed home;
# F6a put away upright down the middle of his back, the lens down, over the three long guns there; F7a the torch
# in his left fist against the fore-grip), in a plain lit studio, from his right, the front, over his shoulder
# (the game's camera) and close on each hand. Both hands put on the gun at places on it by pose.py's two-bone
# solve.
#
#   blender -b --factory-startup -P tools/art/guns/mock84.py -- [--out design/guns/p84] [--only ready,aim]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import guns  # noqa: E402
from mock80 import camera, studio, tone  # noqa: E402  (its scene's pieces; its own run is guarded)
from mock82 import LEATHER, gun_frame, material, parts, protract, strap  # noqa: E402
from mock83 import at_gun, put  # noqa: E402
from pose import FWD, LEFT, UP, Pose, arm, curl, look, man, place, stance  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(ROOT, "design/guns/p84")
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
os.makedirs(OUT, exist_ok=True)
RIGHT = -LEFT
BACK = -FWD

# ── the Daybreak's own (tools/art/guns/guns.py daybreak(): +x the barrel, +y its left, +z up; its origin the grip
# point, at the walnut grip's top) ─────────────────────────────────────────────────────────────────────────────
AZ = 0.115  # the lamp's axis over the grip
BUTT = Vector((-0.297, -0.035, AZ - 0.14))  # the brace's leather pad, its middle
SIGHT_Z = AZ + 0.085  # the line over the ring and the post
EYE = Vector((-0.2, 0.0, SIGHT_Z))  # the eye on that line, ~29 cm behind the ring
# the right hand round the walnut grip: the palm's middle on its right side, ~4.5 cm down it (the web high on its
# back, under the brass mount)
GRIP_PALM = Vector((-0.016, -0.02, -0.004))
# the left hand round the vertical fore-grip (thumb-break): the palm's middle on its left side, its index under
# the lamp's body, the thumb up over the grip's top against the body
FORE_PALM = Vector((0.288, 0.026, 0.024))
CELL = ("cell", "cell-glass", "filament")
CELL_MID = Vector((0.175, 0.0, 0.04))  # the cell's middle, home
READY_DOWN = 0.45
AIM = Vector((0, -1, -0.03)).normalized()


def show(g, cell=True, rest=True):
    for name, ob in parts(g):
        if ".cut" in ob.name:
            ob.hide_render = True
            continue
        ob.hide_render = not (cell if name in CELL else rest)


def cell_out(g, d):
    """The cell drawn `d` m down out of its cradle (gun frame −z)."""
    for name, ob in parts(g):
        if name in CELL:
            ob.matrix_basis = Matrix.Translation((0, 0, -d))
    bpy.context.view_layer.update()


def core(g, k):
    """The core swollen `k` (1 at rest; the charge's 1.5) — and its glow brighter with it."""
    for name, ob in parts(g):
        if name == "core":
            c = Vector((0.45, 0, AZ))
            ob.matrix_basis = Matrix.Translation(c) @ Matrix.Diagonal((k, k, k, 1)) @ Matrix.Translation(-c)
    m = bpy.data.materials.get("glow")
    if m and m.use_nodes:
        b = m.node_tree.nodes.get("Principled BSDF")
        if b and "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = 4.0 * k * k
    bpy.context.view_layer.update()


def from_butt(g, pk, f, u):
    place(g, Vector((0, 0, 0)), f, u)
    G = pk - g.root.matrix_world.to_3x3() @ BUTT
    place(g, G, f, u)
    return G


def pocket(P, aimed):
    """The right shoulder's pocket: aimed, in from the joint (the pad on the muscle by the collarbone); carried,
    out at the shoulder's front."""
    s = P.head("shoulderR")
    if aimed:
        return s + LEFT * 0.05 + FWD * 0.06 + UP * 0.0
    return s + LEFT * 0.03 + FWD * 0.08 - UP * 0.05


def right_on_grip(P, g, f, u, index=0.12, pole=Vector((-1, 0.2, -0.7))):
    """The right hand round the walnut grip: the web high on its back, the knuckles across it, the index along
    the guard (or on the trigger)."""
    f, u, l = gun_frame(f, u)
    # (the grip rakes back ~15°: the hand along it)
    short = arm(P, "R", at_gun(g, GRIP_PALM), (f * 0.62 + l * 0.15 - u * 0.77).normalized(), (f * 0.45 + u).normalized(), pole)
    if short > 0.005:
        print(f"  the right hand short by {short * 100:.1f} cm")
    curl(P, "R", 1.25, index, 0.45)


def left_on_fore(P, g, f, u, pole=Vector((0.6, 0.3, -1)), torch=None):
    """The left hand round the vertical fore-grip (thumb-break): the palm on its left side, the fingers round its
    front to its right, the index side up under the lamp's body, the thumb over the top; the forearm back along
    the gun's left toward the elbow. The torch (if any) in the same fist, along the barrel under the body."""
    f, u, l = gun_frame(f, u)
    p = at_gun(g, FORE_PALM)
    Sl = P.head("shoulderL")
    print(f"  the fore-grip {(p - Sl).length:.3f} from the left shoulder")
    if torch is not None:
        # (the torch under the body ahead of the grip, its beam along the barrel, its tail in the fist)
        place(torch, at_gun(g, Vector((0.325, 0.004, 0.035))), f, u)
    short = arm(P, "L", p, (f * 0.72 - l * 0.6 - u * 0.15).normalized(), (u * 0.95 + f * 0.1).normalized(), pole)
    if short > 0.005:
        print(f"  the left hand short by {short * 100:.1f} cm")
    curl(P, "L", 1.35, 1.25, 0.25)


def eye_on_sight(P, g, f, u, down=0.3, over=0.1):
    """His head nearly upright behind the high ring — the neck a little down and over, his cheek clear of the
    gun — and the gun brought up to his eye for the rest (as the game's cheekTo): his right eye on the sights'
    line. The gun's move printed."""
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
    d = d - fv * fv.dot(d)
    m = g.root.matrix_world.copy()
    m.translation = m.translation + d
    g.root.matrix_world = m
    bpy.context.view_layer.update()
    print(f"  the gun up {uv.dot(d) * 100:.1f} cm, over {lv.dot(d) * 100:.1f} to his eye (head down {down}, over {over}); the pad {(at_gun(g, BUTT) - P.head('shoulderR')).length * 100:.1f} cm from the shoulder joint")
    return e


# ── the props: cells, the pouch ────────────────────────────────────────────────────────────────────────
def spare(name, dark=False):
    """A cell alone: a Daybreak with only its cell shown (its frame the gun's); a spent one dark."""
    c = guns.daybreak()
    c.root.name = name
    show(c, cell=True, rest=False)
    if dark:
        m = bpy.data.materials.get("spent") or material("spent", (0.12, 0.1, 0.08), 0.5, 0.2)
        for nm, ob in parts(c):
            if nm == "filament":
                ob.data = ob.data.copy()
                ob.data.materials.clear()
                ob.data.materials.append(m)
    return c


def cell_at(c, mid, along, up):
    """A spare cell placed by its middle, its length along `along`."""
    place(c, Vector((0, 0, 0)), along, up)
    place(c, mid - c.root.matrix_world.to_3x3() @ CELL_MID, along, up)


def pouch(P):
    """The cell pouch on the belt at his left front, beside the AK's magazine pouch: a leather box, two cells
    standing in it, their tops showing."""
    at = Vector((0.11, -0.16, 0.93))
    out = (FWD * 0.88 + LEFT * 0.47).normalized()
    side = UP.cross(out).normalized()
    bpy.ops.mesh.primitive_cube_add(size=1)
    box = bpy.context.object
    box.name = "pouch"
    box.matrix_world = Matrix.Translation(at) @ Matrix((side, out, UP)).transposed().to_4x4() @ Matrix.Diagonal((0.12, 0.06, 0.13, 1))
    box.data.materials.append(LEATHER())
    cells = []
    for i, s in enumerate((-0.028, 0.028)):
        c = xs[f"pouched{i}"]
        cell_at(c, at + side * s + UP * 0.05, UP, out)
        cells.append(c)
    return at, out, side, cells


# ── the poses ───────────────────────────────────────────────────────────────────────────────────────
def ready(P, g, t, torch=False):
    """The low ready (F1a, the AK's): his shoulders square, the pad at the shoulder's front, the lens ~26° down
    and across to his left, both hands on — his left shoulder brought forward to the fore-grip."""
    stance(P, 0.08)
    protract(P, 0.07)
    f = (FWD * math.cos(READY_DOWN) - UP * math.sin(READY_DOWN) + LEFT * 0.28).normalized()
    from_butt(g, pocket(P, False), f, UP)
    right_on_grip(P, g, f, UP)
    left_on_fore(P, g, f, UP, pole=Vector((0.7, 0.3, -1)), torch=t if torch else None)
    look(P, FWD, 0.18)


def aim(P, g, t, torch=False, lean=0.0, kick=0.0):
    """Shouldered (F2a): the pad in the pocket, his head upright behind the ring, his right eye on the sights'
    line; both elbows down; the torch against the fore-grip (F7a). Charging (F3a): his weight forward onto his
    left foot, the trunk leaning into it; the shot's shove: the gun back into his shoulder and its lens up."""
    stance(P, 0.25)
    if lean:
        P.turn("spine", LEFT, lean * 0.5)
        P.turn("chest", LEFT, lean * 0.5)
    protract(P, 0.07 + lean * 0.2)
    f = (AIM + UP * kick).normalized()
    pk = pocket(P, True) - f * kick * 0.25
    from_butt(g, pk, f, UP)
    eye_on_sight(P, g, f, UP)
    right_on_grip(P, g, f, UP, index=0.55, pole=Vector((-1, 0.1, -0.8)))
    left_on_fore(P, g, f, UP, pole=Vector((0.5, 0.2, -1)), torch=t if torch else None)


def charge(P, g, t, xs):
    aim(P, g, t, lean=0.1)
    core(g, 1.55)


def shot(P, g, t, xs):
    aim(P, g, t, lean=0.04, kick=0.07)
    core(g, 0.8)


def reload_gun(P, g):
    """Reloading (F4a): at the ready, pulled in and turned on its side — the right hand keeps the grip and rolls
    it, top to his right, so the cell underneath faces his left hand and his eyes."""
    stance(P, 0.1)
    protract(P, 0.05)
    roll = 1.15
    f = (FWD * 0.82 - UP * 0.3 + LEFT * 0.38).normalized()
    u0 = (UP - f * f.dot(UP)).normalized()
    side = u0.cross(f)  # (its left)
    u = (u0 * math.cos(roll) - side * math.sin(roll)).normalized()
    # (at his chest, over the belt: the pouch free under it)
    from_butt(g, P.head("shoulderR") - UP * 0.11 + FWD * 0.06 + LEFT * 0.02, f, u)
    right_on_grip(P, g, f, u, pole=Vector((-1, 0.4, -0.6)))
    look(P, (at_gun(g, CELL_MID) - P.head("head")).normalized(), 0.4)
    return f, u


def left_on_cell(P, g, f, u, d, pole=Vector((0.7, 0.2, -1))):
    """The left hand round the cell (`d` out of its cradle): the palm on its underside, the fingers round it, the
    thumb along it."""
    fr, ur, lr = gun_frame(f, u)
    p = at_gun(g, CELL_MID + Vector((0, 0, -d - 0.04)))
    short = arm(P, "L", p, (fr * 0.85 + lr * 0.3).normalized(), (-lr * 0.4 + ur * 0.5 + fr * 0.2).normalized(), pole)
    if short > 0.005:
        print(f"  the left hand (the cell) short by {short * 100:.1f} cm")
    curl(P, "L", 1.0, 0.95, 0.35)


def reload_out(P, g, t, xs):
    """1 — the spent cell drawn out underneath: his left hand round it, pulling it free of the cradle."""
    f, u = reload_gun(P, g)
    cell_out(g, 0.05)
    left_on_cell(P, g, f, u, 0.05)


def reload_drop(P, g, t, xs):
    """2 — let fall: the spent cell dark below, his left hand on its way to the pouch."""
    f, u = reload_gun(P, g)
    show(g, cell=False)
    sp = xs["spent"]
    show(sp, cell=True, rest=False)
    mid = at_gun(g, CELL_MID) - UP * 0.42 + FWD * 0.04
    cell_at(sp, mid, (FWD + LEFT * 0.3 - UP * 0.6).normalized(), UP)
    at, out, side, cells = xs["pouch"]
    short = arm(P, "L", at + UP * 0.2 + out * 0.08, (-UP * 0.6 + FWD * 0.6).normalized(), (FWD * 0.5 + UP).normalized(), Vector((0.8, 0.5, -0.4)))
    if short > 0.005:
        print(f"  the left hand (to the pouch) short by {short * 100:.1f} cm")
    curl(P, "L", 0.4, 0.4, 0.2)


def reload_fetch(P, g, t, xs):
    """3 — at the pouch: a new cell drawn up out of it."""
    f, u = reload_gun(P, g)
    show(g, cell=False)
    at, out, side, cells = xs["pouch"]
    show(cells[1], cell=False, rest=False)
    c = xs["new"]
    show(c, cell=True, rest=False)
    mid = at + side * 0.028 + UP * 0.13
    cell_at(c, mid, UP, out)
    short = arm(P, "L", mid - side * 0.035 + out * 0.01, (UP * 0.3 - side * 0.9).normalized(), (UP * 0.95 + out * 0.2).normalized(), Vector((0.9, 0.4, -0.5)))
    if short > 0.005:
        print(f"  the left hand (at the pouch) short by {short * 100:.1f} cm")
    curl(P, "L", 1.05, 1.0, 0.35)
    look(P, (at - P.head("head")).normalized(), 0.3)


def reload_in(P, g, t, xs):
    """4 — the new cell pressed up into the cradle, his palm under it."""
    f, u = reload_gun(P, g)
    cell_out(g, 0.012)
    left_on_cell(P, g, f, u, 0.012)
    curl(P, "L", -0.2, -0.2, 0.1)


def slung(P, g, t, xs, others=False):
    """Put away (F6a): upright down the middle of his back, the lens down, its side to him (its grip and
    fore-grip to his left); the strap from the brace over his right shoulder, across his chest to his left hip,
    round to the lens's collar. Over the AK and the sniper (their diagonal) and the double-barrel (across)."""
    stance(P, 0.0)
    out = 0.07 if others else 0.0
    f = -UP
    u = RIGHT
    place(g, Vector((0.0, 0.0, 0.0)), f, u)
    # (its body's axis down his spine, the brace's pad at his shoulder blades)
    axis_at = Vector((0.0, 0.19 + out, 1.18))
    place(g, axis_at - g.root.matrix_world.to_3x3() @ Vector((0, 0, AZ)), f, u)
    top = at_gun(g, Vector((-0.3, 0.0, AZ)))
    low = at_gun(g, Vector((0.42, 0.0, AZ)))
    shR = P.head("shoulderR")
    strap([top, shR + UP * 0.07 + BACK * 0.02, shR + UP * 0.05 + FWD * 0.12 + LEFT * 0.05, Vector((0.0, -0.15, 1.2)), Vector((0.16, -0.11, 0.98)), Vector((0.19, 0.06, 0.92)), low], "sling-db")
    if others:
        a = xs["ak"]
        place(a, Vector((0.02, 0.16, 1.2)), (LEFT * 0.55 + UP * 0.83).normalized(), (RIGHT * 0.83 + UP * 0.55).normalized())
        sn = xs["sniper"]
        place(sn, Vector((0.0, 0.2, 1.16)), (LEFT * 0.55 + UP * 0.83).normalized(), (RIGHT * 0.83 + UP * 0.55).normalized())
        s = xs["shotgun"]
        fs = (LEFT * 0.62 - UP * 0.78).normalized()
        us = fs.cross(FWD).normalized()
        if us.dot(BACK) < 0:
            us = -us
        place(s, Vector((-0.12, 0.135, 1.36)), fs, us)
        for k in ("ak", "sniper", "shotgun"):
            for o in xs[k].root.children:
                o.hide_render = ".cut" in o.name
    for S in ("L", "R"):
        P.turn(f"shoulder{S}", FWD, 0.12 if S == "L" else -0.12)
    look(P, FWD, 0.05)


POSES = [
    ("ready", lambda P, g, t, xs: ready(P, g, t)),
    ("ready-torch", lambda P, g, t, xs: ready(P, g, t, torch=True)),
    ("aim", lambda P, g, t, xs: aim(P, g, t)),
    ("aim-torch", lambda P, g, t, xs: aim(P, g, t, torch=True)),
    ("charge", charge),
    ("shot", shot),
    ("reload-1-out", reload_out),
    ("reload-2-drop", reload_drop),
    ("reload-3-fetch", reload_fetch),
    ("reload-4-in", reload_in),
    ("slung", lambda P, g, t, xs: slung(P, g, t, xs)),
    ("slung-all", lambda P, g, t, xs: slung(P, g, t, xs, others=True)),
]

if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    studio(scene)
    rig = man()
    tone(rig)
    P = Pose(rig)
    g = guns.daybreak()
    t = guns.torch()
    for o in t.root.children:
        if ".cut" in o.name:
            o.hide_render = True
    xs = {"ak": guns.ak47(), "sniper": guns.sniper(), "shotgun": guns.shotgun(), "spent": spare("spent", dark=True), "new": spare("new"), "pouched0": spare("pouched0"), "pouched1": spare("pouched1")}
    CAMS = {
        "side": camera("side", (-2.3, -0.5, 1.3), (0, -0.35, 1.15), 36),
        "front": camera("front", (-0.6, -2.3, 1.55), (-0.03, -0.35, 1.15), 32),
        "shoulder": camera("shoulder", (-0.5, 1.5, 1.95), (-0.5, -2.5, 1.5), 46),
        "back": camera("back", (0.5, 2.4, 1.3), (0, 0, 1.0), 40),
    }
    hands = camera("hands", (0, 0, 0), (0, -1, 0), 34)
    hands_l = camera("hands-left", (0, 0, 0), (0, -1, 0), 34)
    for name, fn in POSES:
        if ONLY and name not in ONLY:
            continue
        P.reset()
        show(g)
        cell_out(g, 0)
        core(g, 1.0)
        for o in t.root.children:
            o.hide_render = "torch" not in name or ".cut" in o.name
        for k in ("ak", "sniper", "shotgun", "spent", "new"):
            for o in xs[k].root.children:
                o.hide_render = True
        for o in list(bpy.data.objects):
            if o.name.startswith("sling-db") or o.name == "pouch" or o.name.startswith("pouch."):
                bpy.data.objects.remove(o, do_unlink=True)
        xs["pouch"] = pouch(P)
        fn(P, g, t, xs)
        G = g.root.matrix_world.translation
        mid = at_gun(g, (0.2, 0, 0.05))
        hands.location = G + Vector((-0.5, -0.6, 0.25))
        hands.rotation_euler = (mid - hands.location).to_track_quat("-Z", "Y").to_euler()
        hands_l.location = mid + Vector((0.55, -0.5, 0.2))
        hands_l.rotation_euler = (mid - hands_l.location).to_track_quat("-Z", "Y").to_euler()
        head = rig.matrix_world @ P.p["head"].head
        shc = CAMS["shoulder"]
        shc.location = head + RIGHT * 0.5 - FWD * 1.5 + UP * 0.3
        shc.rotation_euler = (FWD * 10 - UP * 1.2).to_track_quat("-Z", "Y").to_euler()
        cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("shoulder", shc), ("hands", hands), ("hands-left", hands_l)]
        if name.startswith("aim") or name in ("charge", "shot"):
            # (close on his eye behind the ring: from his right, level with it)
            eye = rig.matrix_world @ P.p["eyeR"].head
            ec = camera("eye", (0, 0, 0), (0, -1, 0), 30)
            ec.location = eye + RIGHT * 0.5 + FWD * 0.12
            ec.rotation_euler = (eye + FWD * 0.15 - ec.location).to_track_quat("-Z", "Y").to_euler()
            cams.append(("eye", ec))
        if name.startswith("reload"):
            rc = camera("reload", (0, 0, 0), (0, -1, 0), 34)
            p = at_gun(g, CELL_MID)
            rc.location = p + LEFT * 0.55 + FWD * 0.45 + UP * 0.2
            rc.rotation_euler = (p - rc.location).to_track_quat("-Z", "Y").to_euler()
            cams = [("side", CAMS["side"]), ("front", CAMS["front"]), ("shoulder", shc), ("cell", rc)]
        if name.startswith("slung"):
            cams = [("side", CAMS["side"]), ("back", CAMS["back"]), ("shoulder", shc)]
        for cname, cam in cams:
            scene.camera = cam
            scene.render.resolution_x, scene.render.resolution_y = (1280, 720) if cname == "shoulder" else (960, 960)
            scene.render.filepath = os.path.join(OUT, f"{name}-{cname}.png")
            bpy.ops.render.render(write_still=True)
        print("wrote", name)

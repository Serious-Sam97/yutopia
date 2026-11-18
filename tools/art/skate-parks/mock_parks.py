# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the parks' stills (EEVEE): every piece close up, the hall inside
# from four angles, the yard from three, built straight from the board's numbers with the PNG textures in Blender's
# nodes — into design/skate/parks104/.
#
#   blender -b --factory-startup -P tools/art/skate-parks/mock_parks.py -- [--shots pieces,hall,yard,racks]
#                                                                          [--only <shot name>] [--res 1600x900]
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pkit as K  # noqa: E402
import hall  # noqa: E402
import pieces as P  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(K.ROOT, "design/skate/parks104"))
os.makedirs(OUT, exist_ok=True)
RES = tuple(int(v) for v in arg("--res", "1600x900").split("x"))
SHOTS = arg("--shots", "pieces,hall,hallout,yard").split(",")
ONLY = arg("--only")
SAMPLES = int(arg("--samples", "48"))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K._BL.clear()
    K.reset_bufs()
    K.TEXTURED = True
    K.LOD = "near"


def render_setup(outdoor=True, exposure=0.0):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = exposure
    try:
        sc.eevee.taa_render_samples = SAMPLES
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = True
        sc.eevee.ray_tracing_options.resolution_scale = "2"
        sc.eevee.use_fast_gi = True
    except (AttributeError, TypeError):
        pass
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    if outdoor:
        sky = nt.nodes.new("ShaderNodeTexSky")
        for t in ("MULTIPLE_SCATTERING", "NISHITA"):
            try:
                sky.sky_type = t
                break
            except TypeError:
                pass
        try:
            sky.sun_elevation = math.radians(24)
            sky.sun_rotation = math.radians(140)
        except AttributeError:
            pass
        nt.links.new(sky.outputs[0], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.22
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 2.2
        sun.angle = math.radians(1.5)
        sun.color = (1.0, 0.95, 0.88)
        so = bpy.data.objects.new("sun", sun)
        so.rotation_euler = (math.radians(62), 0, math.radians(-40))
        sc.collection.objects.link(so)
    else:
        bg.inputs["Color"].default_value = (0.02, 0.022, 0.025, 1)
        bg.inputs["Strength"].default_value = 1.0
    sc.world = w
    return sc


def camera(name, eye, look, lens=24):
    sc = bpy.context.scene
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 400
    co = bpy.data.objects.new(name, cam)
    sc.collection.objects.link(co)
    co.location = Vector(K.to_bl(eye))
    d = Vector(K.to_bl(look)) - co.location
    co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.camera = co
    return co


def shot(name, eye, look, lens=24):
    if ONLY and ONLY not in name:
        return
    camera(name, eye, look, lens)
    sc = bpy.context.scene
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("still", name, flush=True)


def ground(x0, y0, x1, y1, z, mat="floor", pad=0.0):
    K.face(mat, [(x0 - pad, y0 - pad, z), (x1 + pad, y0 - pad, z), (x1 + pad, y1 + pad, z), (x0 - pad, y1 + pad, z)], [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], n=(0, 0, 1), grp="ground")


def snow_ground(x0, y0, x1, y1, z):
    m = bpy.data.materials.new("snow")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.85, 0.88, 0.92, 1)
    b.inputs["Roughness"].default_value = 0.8
    me = bpy.data.meshes.new("snow")
    p = [K.to_bl(q) for q in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    me.from_pydata(p, [], [(0, 3, 2, 1)])
    me.materials.append(m)
    o = bpy.data.objects.new("snow", me)
    bpy.context.scene.collection.objects.link(o)


def park_scene(key):
    reset()
    pcs, p = K.pieces_of(key)
    park = K.Park(pcs, p["h"], "wood" if p["indoor"] else "concrete")
    K.frame((p["x0"], p["z0"], p["h"]))
    P.build_park(park)
    return park, p


def yard():
    park, p = park_scene("yard")
    ground(p["x0"], p["z0"], p["x1"], p["z1"], p["h"] + 0.001, "conc")
    K.objects()
    snow_ground(p["x0"] - 60, p["z0"] - 60, p["x1"] + 60, p["z1"] + 60, p["h"] - 0.02)
    render_setup(True)
    h = p["h"]
    shot("yard-01-bowl", (507, -484, h + 6.5), (494, -471, h), 22)
    shot("yard-02-plaza", (461, -463, h + 3.2), (471, -479, h + 0.5), 22)
    shot("yard-03-over", (512, -442, h + 18), (482, -472, h), 22)
    shot("yard-04-pocket", (491, -468, h + 0.9), (497, -470.5, h + 0.8), 20)


def hall_lights(H, lights, power=260):
    for i, (x, y, z) in enumerate(lights):
        L = bpy.data.lights.new("fit", "AREA")
        L.use_shadow = i % 3 == 1
        L.shape = "RECTANGLE"
        L.size = 1.4
        L.size_y = 0.2
        L.energy = power
        L.color = (0.93, 0.97, 1.0)
        o = bpy.data.objects.new("fit", L)
        o.location = Vector(K.to_bl((x, y, z - 0.05)))
        bpy.context.scene.collection.objects.link(o)


def hall_scene(out=False):
    park, p = park_scene("hall")
    H = K.DATA["hall"]
    lights = []
    hall.inside(H, K.DATA["shop"], lights)
    if out:
        hall.outside(H)
    K.objects()
    return park, p, lights


def hall_inside():
    park, p, lights = hall_scene()
    render_setup(False, 0.3)
    hall_lights(K.DATA["hall"], lights)
    h = p["h"]
    shot("hall-in-1-door", (482, -510.5, h + 1.7), (468, -527, h + 2.5), 20)
    shot("hall-in-2-mezzanine", (462, -509.6, h + 2.44 + 1.65), (485, -527, h + 1.0), 20)
    shot("hall-in-3-vert", (466.5, -526.0, h + 1.7), (457.9, -529.6, h + 4.2), 20)
    shot("hall-in-4-east", (467.5, -532.5, h + 5.0), (494, -516, h + 0.5), 20)
    shot("hall-in-5-island", (482.5, -516.5, h + 1.4), (489, -526, h + 0.8), 22)
    shot("hall-in-6-shop", (479, -514, h + 1.6), (483, -508.3, h + 1.5), 24)


def hall_outside():
    park, p, lights = hall_scene(out=True)
    snow_ground(p["x0"] - 60, p["z0"] - 60, p["x1"] + 60, p["z1"] + 60, p["h"] - 0.01)
    render_setup(True)
    h = p["h"]
    shot("hall-out-1-south", (490, -488, h + 3.5), (478, -508, h + 4), 22)
    shot("hall-out-2-corner", (512, -494, h + 12), (478, -522, h + 4), 24)


CONCRETE_TOO = {"quarter", "qp4", "qp4corner", "hip", "bowlhip", "bank", "pyramid", "stairs", "ledge", "spine", "bowlcorner", "mini", "kicker", "manualpad"}


def piece_still(kind, style):
    reset()
    d = K.DATA["pieces"][kind]
    u0, w0, u1, w1 = d["foot"]
    pc = {"kind": kind, "x": 0.0, "y": 0.0, "z": 0.0, "yaw": 0.0}
    park = K.Park([pc], 0.0, style)
    K.frame((0.0, 0.0, 0.0))
    P.build_park(park, seed=7, tags=2)
    pad = 3.0
    ground(u0 - pad, w0 - pad, u1 + pad, w1 + pad, 0.0005, "floor" if style == "wood" else "conc")
    K.objects()
    render_setup(True, -0.2)
    cu, cw = (u0 + u1) / 2, (w0 + w1) / 2
    span = max(u1 - u0, w1 - w0, 2.0)
    hgt = d["height"]
    # (from in front of its riding face, a little to its side, above its coping)
    turn = d["surfaces"][0]["sweep"] == "turn" if d["surfaces"] else False
    if kind in ("stairs", "stairs8"):
        eye = (u1 + span * 0.55, cw - span * 0.6, hgt + span * 0.15)
    elif kind in ("hip", "bowlhip"):
        eye = (span * 0.75, span * 0.75, hgt + span * 0.35)
    elif turn:
        eye = (-span * 0.2, -span * 0.2, hgt + span * 0.45)
    elif kind in ("pyramid", "funbox", "manualpad", "ledge", "rail", "kinkrail", "railing", "deck4", "deck8", "spine", "spine4", "mini", "half", "halfext"):
        eye = (cu - span * 0.55, cw - span * 0.75, hgt + span * 0.3)
    else:
        eye = (cu - span * 0.9, cw - span * 0.55, hgt * 0.7 + span * 0.25)
    look = (cu, cw, hgt * 0.4)
    shot(f"piece-{kind}-{style}", eye, look, 24)


def racks_still():
    import racks as RK

    reset()
    K.frame((0.0, 0.0, 0.0))
    RK.rack("hall")
    for k, x in enumerate((-0.5, 0.0, 0.5)):
        # (stand-in decks where the game stands its boards: nose up, leant back on the bar)
        lean = 0.2
        c, s_ = math.cos(lean), math.sin(lean)
        a = (x - 0.1, 0.1 - 0.37 * s_ + 0.02, 0.0)
        pts = [(x - 0.1, -0.03, 0.0), (x + 0.1, -0.03, 0.0), (x + 0.1, -0.03 + 0.8 * s_, 0.8 * c), (x - 0.1, -0.03 + 0.8 * s_, 0.8 * c)]
        K.face(["paint_yellow", "paint_door", "paint_black"][k], pts, [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, -c, s_))
        _ = a
    K.frame((-3.0, 0.0, 0.0))
    RK.rack("yard")
    K.frame((0.0, 0.0, 0.0))
    ground(-2, -2, 5, 1, 0.001, "floor")
    K.objects()
    render_setup(True, -0.3)
    shot("racks", (-1.2, -3.4, 1.5), (-1.4, 0.1, 0.6), 24)


if __name__ == "__main__":
    if "racks" in SHOTS:
        racks_still()
    if "pieces" in SHOTS:
        for kind in K.DATA["pieces"]:
            piece_still(kind, "wood")
            if kind in CONCRETE_TOO:
                piece_still(kind, "concrete")
    if "yard" in SHOTS:
        yard()
    if "hall" in SHOTS:
        hall_inside()
    if "hallout" in SHOTS:
        hall_outside()

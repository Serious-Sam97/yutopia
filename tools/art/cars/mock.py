# Plan 92, phase 0 — the cars' stills (EEVEE): a variant dressed and lit in a scene — by day on snow, at night
# with its lamps on, its cabin from the driver's seat, its engine under the open bonnet, or the line-up.
#
#   blender -b --factory-startup -P tools/art/cars/mock.py -- --car saloon-base [--shots day,night,cabin,engine,
#       side,rear] [--out design/cars] [--colour 0.5,0.08,0.06] [--res 1600x900]
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import dress  # noqa: E402
import kit  # noqa: E402
import variants  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(ROOT, "design/cars"))
os.makedirs(OUT, exist_ok=True)
RES = [int(x) for x in arg("--res", "1600x900").split("x")]
PALETTE = {
    "saloon-base": (0.62, 0.6, 0.55),
    "saloon-gl": (0.12, 0.17, 0.3),
    "saloon-sport": (0.55, 0.05, 0.04),
    "estate-base": (0.35, 0.42, 0.33),
    "estate-gl": (0.5, 0.36, 0.22),
    "estate-utility": (0.8, 0.8, 0.78),
    "hatch-base": (0.75, 0.55, 0.12),
    "hatch-gl": (0.2, 0.32, 0.45),
    "hatch-hot": (0.85, 0.85, 0.83),
    "4x4-short": (0.32, 0.36, 0.22),
    "4x4-long": (0.55, 0.12, 0.08),
    "4x4-expedition": (0.78, 0.72, 0.58),
    "pickup-single": (0.15, 0.25, 0.42),
    "pickup-crew": (0.08, 0.08, 0.09),
    "pickup-flatbed": (0.7, 0.68, 0.62),
    "van-panel": (0.85, 0.85, 0.82),
    "van-minibus": (0.6, 0.2, 0.08),
    "van-camper": (0.25, 0.45, 0.42),
    "shuttle-bus": (0.86, 0.8, 0.66),
    "snowmobile": (0.75, 0.08, 0.05),
    "snowcat": (0.8, 0.12, 0.05),
    "ploughtruck": (0.85, 0.5, 0.04),
    "tractor": (0.12, 0.35, 0.12),
    "toboggan": (0.5, 0.1, 0.05),
}


def scene_setup(night=False):
    sc = bpy.context.scene
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = e
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast" if not night else "None"
    try:
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = True
    except AttributeError:
        pass
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    if night:
        bg.inputs["Color"].default_value = (0.008, 0.01, 0.018, 1)
        bg.inputs["Strength"].default_value = 0.6
    else:
        sky = nt.nodes.new("ShaderNodeTexSky")
        try:
            sky.sky_type = "MULTIPLE_SCATTERING"
        except TypeError:
            try:
                sky.sky_type = "NISHITA"
            except TypeError:
                pass
        try:
            sky.sun_elevation = math.radians(22)
            sky.sun_rotation = math.radians(210)
        except AttributeError:
            pass
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.35
    sc.world = w
    if not night:
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 3.2
        sun.angle = math.radians(2)
        s = bpy.data.objects.new("sun", sun)
        s.rotation_euler = (math.radians(62), 0, math.radians(-150))
        sc.collection.objects.link(s)
    # the snow: a wide plane, a little uneven, a soft white
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    g = bpy.context.object
    m = bpy.data.materials.new("snow")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.82, 0.85, 0.9, 1) if not night else (0.5, 0.52, 0.58, 1)
    bsdf.inputs["Roughness"].default_value = 0.7
    try:
        bsdf.inputs["Subsurface Weight"].default_value = 0.1
    except KeyError:
        pass
    g.data.materials.append(m)
    return sc


def _camera(sc, loc, look, lens=40):
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.02
    o = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = o
    return o


def shot(sc, name):
    sc.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)


def light_spot(sc, loc, look, energy, size=0.1, color=(1, 0.95, 0.85), angle=60):
    l = bpy.data.lights.new("spot", "SPOT")
    l.energy = energy
    l.spot_size = math.radians(angle)
    l.shadow_soft_size = size
    l.color = color
    o = bpy.data.objects.new("spot", l)
    o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(o)
    return o


def point(sc, loc, energy, color, size=0.05):
    l = bpy.data.lights.new("pt", "POINT")
    l.energy = energy
    l.color = color
    l.shadow_soft_size = size
    o = bpy.data.objects.new("pt", l)
    o.location = loc
    sc.collection.objects.link(o)


def open_parts(car, groups_angles):
    """Doors / bonnet turned open about their pivots for a still."""
    for o in kit.coll().objects:
        if o.type != "MESH" or "grp" not in o.keys():
            continue
        g = o["grp"]
        parent = car.pivots.get(g, {}).get("parent")
        for want, ang in groups_angles.items():
            if g == want or (parent == want):
                d = car.pivots[want]
                at, ax = Vector(d["at"]), Vector(d["axis"])
                o.data.transform(Matrix.Translation(at) @ Matrix.Rotation(ang, 4, ax) @ Matrix.Translation(-at))


def render_car(vid, shots, colour=None):
    import work

    is_work = vid in work.BUILD
    if not is_work:
        spec, v = variants.get(vid)
    for s in shots:
        car = work.build(vid) if is_work else dress.dress(spec, v)
        # (the liveries: the game's to show; the stills show one only when asked — the police or taxi shot)
        want = {"police": "livery_police", "taxi": "livery_taxi"}.get(s)
        for o in list(kit.coll().objects):
            g = o.get("grp", "") if o.type == "MESH" else ""
            if g.startswith("livery_") and not (want and g.startswith(want)):
                kit.kill(o)
            if want == "livery_taxi" and g == "sign":
                pass
        b = car.b
        kit.set_paint("paint", {"police": (0.015, 0.015, 0.018), "taxi": (0.92, 0.7, 0.06)}.get(s) or colour or PALETTE.get(vid, (0.5, 0.1, 0.08)))
        night = s == "night"
        sc = scene_setup(night)
        L = b.L
        k = max(1.0, max(L, getattr(b, "roof", 1.5) * 2.6) / 4.9)  # (the cameras pulled back for big ones)

        def camera(sc, loc, look, lens=40, k=k):
            return _camera(sc, tuple(c * k for c in loc), tuple(c * (k if i < 2 else 1) for i, c in enumerate(look)), lens)

        if s in ("day", "police", "taxi"):
            camera(sc, (5.6, 4.6, 1.5), (0.1, 0, 0.62), 42)
            if s in ("police", "taxi"):
                import extras

                roof = car.points.get("x_roof", (0, 0, b.roof))
                for o in extras.addon("lightbar" if s == "police" else "taxisign"):
                    kit.move(o, roof)
                if s == "police":
                    kit.lit("emit_beacon_b", 6)
        elif s == "rear":
            camera(sc, (-5.8, 4.2, 1.6), (-0.2, 0, 0.62), 42)
        elif s == "side":
            camera(sc, (0, 9.5, 0.9), (0, 0, 0.75), 50)
        elif s == "front":
            camera(sc, (7.5, -1.6, 1.0), (0, 0, 0.7), 55)
        # (quality pass 2: the close-ups — the nose and its lamps, a front wheel, the underside from low, the
        # bonnet's reflections from above)
        elif s == "close":
            xn = b.x(0)
            _camera(sc, (xn + 1.9, 1.45, 1.0), (xn + 0.05, 0.25, b.lamp_z - 0.02), 40)
        elif s == "wheel":
            xw = b.x(b.axle_f)
            _camera(sc, (xw + 0.9, b.W / 2 + 1.25, 0.55), (xw, b.W / 2, b.wheel_r + 0.05), 40)
        elif s == "low":
            camera(sc, (3.2, 3.6, 0.18), (-0.4, 0, 0.32), 30)
        elif s == "top":
            _camera(sc, (b.x(0) + 1.6, 2.2, 2.4), (b.x(0.9), 0, b.zt(0.9)), 35)
        elif s == "tail":
            xt = b.x(b.L)
            _camera(sc, (xt - 1.9, 1.45, 1.05), (xt - 0.05, 0.3, sum(b.tail_z) / 2), 40)
        elif s == "night":
            for k in ("emit_head", "emit_tail"):
                kit.lit(k, 25 if k == "emit_head" else 8)
            kit.lit("screen", 3)
            for side in (1, -1):
                p = car.points[f"headlight_{'l' if side > 0 else 'r'}"]
                light_spot(sc, (p[0] + 0.05, p[1], p[2]), (p[0] + 12, p[1] * 1.6, 0), 260, 0.08, angle=50)
            point(sc, (b.x(b.L) - 0.2, 0.7, 0.75), 6, (1, 0.05, 0.03), 0.1)
            point(sc, (b.x(b.L) - 0.2, -0.7, 0.75), 6, (1, 0.05, 0.03), 0.1)
            # a street lamp off to the side, the moon
            point(sc, (2.5, 6.0, 4.5), 900, (1.0, 0.75, 0.45), 0.3)
            moon = bpy.data.lights.new("moon", "SUN")
            moon.energy = 0.08
            moon.color = (0.6, 0.7, 1.0)
            mo = bpy.data.objects.new("moon", moon)
            mo.rotation_euler = (math.radians(55), 0, math.radians(40))
            sc.collection.objects.link(mo)
            camera(sc, (6.2, 3.6, 1.35), (0.0, 0, 0.6), 38)
        elif s == "cabin":
            e = Vector(car.points["eye"])
            open_parts(car, {})
            light_spot(sc, (e.x + 2.5, e.y - 0.2, e.z + 2.5), (e.x, 0, 0.6), 400, 1.0, angle=90)
            camera(sc, (e.x - 0.1, e.y, e.z + 0.03), (e.x + 2.0, e.y - 0.25, e.z - 0.45), 22)
            kit.lit("screen", 4)
        elif s == "engine":
            open_parts(car, {"bonnet": math.radians(-62)})
            camera(sc, (b.x(-1.2), 1.3, 1.9), (b.x(0.85), 0, 0.6), 32)
        elif s == "doors":
            ang = {}
            for d in b.door_list():
                if d["side"] > 0:
                    ang[d["grp"]] = math.radians(62)
            ang["boot"] = math.radians(55)
            open_parts(car, ang)
            camera(sc, (1.5, 6.2, 1.9), (0, 0, 0.75), 38)
        shot(sc, f"{vid}-{s}")


if __name__ == "__main__":
    vids = arg("--car", "saloon-base").split(",")
    shots = arg("--shots", "day").split(",")
    col = arg("--colour")
    col = tuple(float(c) for c in col.split(",")) if col else None
    for vid in vids:
        render_car(vid, shots, col)

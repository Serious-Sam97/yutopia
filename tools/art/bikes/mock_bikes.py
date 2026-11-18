# Plan 101, phase 0 — the bikes' stills (EEVEE, the cars' mock lighting: a low sun over snow): each variant from
# the side and three-quarters, all twelve, each body beside a 1.70 m mannequin (seated on it and standing by
# it, the saddle's height marked), close-ups of the drivetrain and the cockpit, and the exported GLBs
# re-imported and posed by their pivots (check-<variant>.png).
#
#   blender -b --factory-startup -P tools/art/bikes/mock_bikes.py -- [--shots tiles,scale,detail,check]
#                                                                     [--bike road-race] [--out design/bikes]
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bkit as bk  # noqa: E402
import kit  # noqa: E402

import bikes  # noqa: E402

ROOT = os.path.join(HERE, "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(ROOT, "design/bikes"))
GLB = arg("--glb", os.path.join(ROOT, "apps/client/public/life/bikes"))
TMP = os.path.join(OUT, "_tiles")
os.makedirs(TMP, exist_ok=True)
SHOTS = arg("--shots", "tiles,scale,detail,check").split(",")
ONLY = arg("--bike", ",".join(bikes.ROAD_ORDER)).split(",")
V = Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.MATS.clear()
    bk.LOD = "near"
    kit.SEG = 1.0


def scene(res=(960, 540), ground=True, night=False):
    sc = bpy.context.scene
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = e
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    try:
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = True
        sc.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    sky = nt.nodes.new("ShaderNodeTexSky")
    for t in ("MULTIPLE_SCATTERING", "NISHITA"):
        try:
            sky.sky_type = t
            break
        except TypeError:
            pass
    try:
        sky.sun_elevation = math.radians(24)
        sky.sun_rotation = math.radians(200)
    except AttributeError:
        pass
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.22
    sc.world = w
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.4
    sun.angle = math.radians(2)
    s = bpy.data.objects.new("sun", sun)
    s.rotation_euler = (math.radians(58), 0, math.radians(-35))
    sc.collection.objects.link(s)
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 60
    fill.size = 4
    f = bpy.data.objects.new("fill", fill)
    f.location = (2.5, -4.5, 2.5)
    f.rotation_euler = (V((0, 0, 0.6)) - V(f.location)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(f)
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        g = bpy.context.object
        m = bpy.data.materials.new("snow")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.55, 0.57, 0.61, 1)
        b.inputs["Roughness"].default_value = 0.75
        g.data.materials.append(m)
    return sc


def camera(sc, loc, look, lens=50, ortho=None):
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.02
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    o = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (V(look) - V(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = o
    return o


def shot(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def hexc(h):
    h = h.lstrip("#")
    return tuple((int(h[i : i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))


def paint_bike(new_obs, vid, k=0):
    """This bike's own paint (its first period colour) and accent."""
    s = bikes.spec(vid)
    col = hexc(s["colours"][k])
    col2 = hexc(s.get("colour2") or "#202020")
    for kind, c in (("paint", col), ("paint2", col2)):
        m = kit.mat(kind).copy()
        m.name = f"{kind}-{vid}"
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*c, 1)
        for o in new_obs:
            if o.type == "MESH" and o.get("kind") == kind:
                o.data.materials.clear()
                o.data.materials.append(m)


def place(vid, at=(0, 0, 0), rz=0.0, k=0):
    before = set(bpy.data.objects)
    B, obs = bikes.build(vid)
    new = [o for o in bpy.data.objects if o not in before]
    paint_bike(new, vid, k)
    M = Matrix.Translation(V(at)) @ Matrix.Rotation(rz, 4, "Z")
    for o in new:
        if o.type == "MESH":
            o.data.transform(M)
    return B, new


def compose(paths, cols, out, gap=6):
    ims = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        a = np.array(im.pixels[:]).reshape(h, w, 4)
        ims.append(a)
        bpy.data.images.remove(im)
    h, w = ims[0].shape[:2]
    rows = (len(ims) + cols - 1) // cols
    W = cols * w + (cols - 1) * gap
    H = rows * h + (rows - 1) * gap
    canvas = np.zeros((H, W, 4))
    canvas[..., 3] = 1
    canvas[..., :3] = 0.04
    for i, a in enumerate(ims):
        r, c = divmod(i, cols)
        y0 = H - (r + 1) * h - r * gap
        x0 = c * (w + gap)
        canvas[y0 : y0 + h, x0 : x0 + w] = a
    img = bpy.data.images.new("out", W, H, alpha=True)
    img.pixels = canvas.ravel().tolist()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("composed", out)


def text(sc, s, at, size=0.06, rot=(math.pi / 2, 0, 0), colour=(0.05, 0.05, 0.06)):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = s
    cu.size = size
    cu.align_x = "CENTER"
    o = bpy.data.objects.new("t", cu)
    o.location = at
    o.rotation_euler = rot
    m = bpy.data.materials.new("ink")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*colour, 1)
    cu.materials.append(m)
    sc.collection.objects.link(o)
    return o


# ── tiles: each variant from the side and three-quarters ─────────────────────────────────────────────────────


def tiles():
    side, tq = {}, {}
    for vid in ONLY:
        reset()
        sc = scene()
        B, _ = place(vid)
        L = B.info["HF"].x - B.info["HR"].x
        cx = (B.info["HF"].x + B.info["HR"].x) / 2
        camera(sc, (cx, -6.5, 0.62), (cx, 0, 0.55), 85)
        p = os.path.join(TMP, f"{vid}-side.png")
        shot(sc, p)
        side[vid] = p
        sc.camera.location = (cx + 2.6, -3.0, 1.35)
        sc.camera.rotation_euler = (V((cx, 0, 0.5)) - V(sc.camera.location)).to_track_quat("-Z", "Y").to_euler()
        sc.camera.data.lens = 60
        p = os.path.join(TMP, f"{vid}-34.png")
        shot(sc, p)
        tq[vid] = p
    for body in ("town", "bmx", "mtb", "road"):
        vs = [v for v in bikes.ROAD_ORDER if v.startswith(body + "-")]
        if all(v in side for v in vs):
            compose([side[v] for v in vs], 3, os.path.join(OUT, f"0-{body}.png"))
            compose([tq[v] for v in vs], 3, os.path.join(OUT, f"0-{body}-34.png"))
    if all(v in tq for v in bikes.ROAD_ORDER):
        compose([tq[v] for v in bikes.ROAD_ORDER], 3, os.path.join(OUT, "0-all.png"))


# ── scale: each body with a 1.70 m mannequin on it and beside it ─────────────────────────────────────────────


def capsule(name, a, b, r, mat):
    o = bk.sweep(name, bk.resample([V(a), V(b)], 0.05), r, "trim", "x", n=14)
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in (a, b):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=14, ring_count=8)
        s = bpy.context.object
        s.data.materials.append(mat)
    return o


def two_bone(H, A, l1, l2, bend=V((1, 0, 0))):
    """A knee (or an elbow) between H and A, the limb bending toward `bend`."""
    d = A - H
    L = d.length
    if L > l1 + l2:
        return H + d.normalized() * l1, True
    a = (l1 * l1 + L * L - l2 * l2) / (2 * L)
    h = math.sqrt(max(0, l1 * l1 - a * a))
    u = d.normalized()
    w = (bend - u * u.dot(bend)).normalized()
    return H + u * a + w * h, False


def mannequin_seated(B, mat):
    I = B.info
    sit = I["sit"]
    hipc = sit + V((0.03, 0, 0.085))
    straight = []
    for side, pnm in ((1, "l"), (-1, "r")):
        hip = hipc + V((0, side * 0.085, 0))
        ped = I["pedal"][pnm]
        ank = V((ped.x - 0.1, side * 0.1, ped.z + 0.07))
        knee, st = two_bone(hip, ank, 0.41, 0.39, V((1, 0, 0.3)))
        straight.append(st)
        capsule("thigh", hip, knee, 0.06, mat)
        capsule("shin", knee, ank, 0.045, mat)
        capsule("foot", ank + V((-0.04, 0, -0.03)), ank + V((0.15, 0, -0.06)), 0.035, mat)
    # the torso leaning to reach the grips with the elbows a little bent
    g = (B.points["grip_l"][0] + B.points["grip_r"][0]) / 2
    best = None
    for k in range(0, 85):
        t = math.radians(k)
        sh = hipc + V((math.sin(t), 0, math.cos(t))) * 0.5
        e = abs((sh - g).length - 0.5)
        if best is None or e < best[0]:
            best = (e, sh)
    sh = best[1]
    capsule("torso", hipc + V((0, 0, 0.05)), sh - V((0, 0, 0.04)), 0.13, mat)
    for side, nm in ((1, "l"), (-1, "r")):
        s = sh + V((0, side * 0.18, 0))
        gp = B.points[f"grip_{nm}"][0]
        el, _ = two_bone(s, gp, 0.29, 0.27, V((-0.2, side * 0.6, -1)))
        capsule("upper", s, el, 0.04, mat)
        capsule("fore", el, gp, 0.033, mat)
    head = sh + (sh - hipc).normalized() * 0.12 + V((0.06, 0, 0.12))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.105, location=head, segments=20, ring_count=12)
    bpy.context.object.data.materials.append(mat)
    return straight


def mannequin_standing(at, mat):
    at = V(at)
    for side in (1, -1):
        hip = at + V((0, side * 0.09, 0.863))
        knee = at + V((0.01, side * 0.09, 0.47))
        ank = at + V((0, side * 0.09, 0.065))
        capsule("thigh", hip, knee, 0.065, mat)
        capsule("shin", knee, ank, 0.048, mat)
        capsule("foot", ank + V((-0.05, 0, -0.03)), ank + V((0.17, 0, -0.035)), 0.033, mat)
        sh = at + V((0, side * 0.18, 1.41))
        el = at + V((0.0, side * 0.21, 1.12))
        wr = at + V((0.04, side * 0.22, 0.86))
        capsule("upper", sh, el, 0.042, mat)
        capsule("fore", el, wr, 0.035, mat)
    capsule("torso", at + V((0, 0, 0.92)), at + V((0, 0, 1.38)), 0.14, mat)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.105, location=at + V((0, 0, 1.595)), segments=20, ring_count=12)
    bpy.context.object.data.materials.append(mat)


def scale_shots():
    tiles_ = []
    firsts = {"town": "town-classic", "bmx": "bmx-free", "mtb": "mtb-trail", "road": "road-race"}
    for body, vid in firsts.items():
        reset()
        sc = scene((1200, 900))
        mat = bpy.data.materials.new("mannequin")
        mat.use_nodes = True
        mb = mat.node_tree.nodes["Principled BSDF"]
        mb.inputs["Base Color"].default_value = (0.62, 0.6, 0.57, 1)
        mb.inputs["Roughness"].default_value = 0.6
        B, _ = place(vid, (0, 0, 0))
        st = mannequin_seated(B, mat)
        B2, _ = place(vid, (2.4, 0, 0))
        mannequin_standing((2.4 + B2.info["HR"].x - 0.45, 0.6, 0), mat)
        # the saddle's height marked: a thin bar at its top across both bikes and the figures' height
        sz = B.points["saddle"][0].z
        ink = bpy.data.materials.new("ink")
        ink.use_nodes = True
        ink.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.7, 0.08, 0.05, 1)
        for x0, x1, z, lab in ((-0.9, 3.6, sz, f"saddle {sz:.2f} m"), (1.2, 2.2, 1.7, "1.70 m"), (1.2, 2.2, 0.863, "hip 0.863 m"), (-0.9, -0.6, B.points['grip_l'][0].z, f"grips {B.points['grip_l'][0].z:.2f} m")):
            o = kit.box("mark", ((x0 + x1) / 2, -0.35, z), (x1 - x0, 0.004, 0.004), "trim", "x")
            o.data.materials.clear()
            o.data.materials.append(ink)
            text(sc, lab, (x0 + 0.15 if lab.startswith("grips") else x1 - 0.4, -0.36, z + 0.015), 0.065, colour=(0.6, 0.06, 0.04))
        text(sc, f"{bikes.spec(vid)['name']} ({vid}) — seated: the leg {'straight' if any(st) else 'bent'} at the front pedal", (1.3, -0.36, 1.86), 0.07)
        camera(sc, (1.3, -6.2, 1.0), (1.3, 0, 0.95), 55)
        p = os.path.join(TMP, f"scale-{body}.png")
        shot(sc, p)
        tiles_.append(p)
    compose(tiles_, 2, os.path.join(OUT, "0-scale.png"))


# ── details: the drivetrain and the cockpit ──────────────────────────────────────────────────────────────────


def detail_shots():
    firsts = {"town": "town-classic", "bmx": "bmx-free", "mtb": "mtb-trail", "road": "road-race"}
    for body, vid in firsts.items():
        if vid not in ONLY and arg("--bike"):
            continue
        reset()
        sc = scene((960, 720))
        B, _ = place(vid)
        I = B.info
        ps = []
        BB, HR, C = I["BB"], I["HR"], I["C"]
        camera(sc, (BB.x - 0.12, -0.75, BB.z + 0.22), (BB.x - 0.12, 0, BB.z - 0.02), 40)
        ps.append(os.path.join(TMP, f"det-{body}-a.png"))
        shot(sc, ps[-1])
        camera(sc, (HR.x + 0.25, -0.55, HR.z + 0.12), (HR.x, 0, HR.z - 0.04), 40)
        ps.append(os.path.join(TMP, f"det-{body}-b.png"))
        shot(sc, ps[-1])
        camera(sc, (C.x - 0.55, -0.45, C.z + 0.45), (C.x + 0.02, 0, C.z - 0.03), 40)
        ps.append(os.path.join(TMP, f"det-{body}-c.png"))
        shot(sc, ps[-1])
        camera(sc, (C.x + 0.6, -0.9, C.z - 0.1), (I["HF"].x - 0.05, 0, (C.z + I["HF"].z) / 2), 40)
        ps.append(os.path.join(TMP, f"det-{body}-d.png"))
        shot(sc, ps[-1])
        compose(ps, 2, os.path.join(OUT, f"0-detail-{body}.png"))


# ── checks: the exported GLBs re-imported and posed by their pivots ──────────────────────────────────────────


def check_shots():
    import json
    import struct

    for vid in ONLY:
        path = os.path.join(GLB, f"{vid}.glb")
        if not os.path.exists(path):
            continue
        reset()
        sc = scene((1200, 800))
        # (the import needs the basisu requirement dropped: Blender reads no KTX2)
        data = open(path, "rb").read()
        ln, _ = struct.unpack_from("<II", data, 12)
        js = json.loads(data[20 : 20 + ln])
        js.pop("extensionsRequired", None)
        js.pop("images", None)
        js.pop("textures", None)
        js.pop("samplers", None)
        for m in js.get("materials", []):
            pbr = m.get("pbrMetallicRoughness", {})
            for k in ("baseColorTexture", "metallicRoughnessTexture"):
                pbr.pop(k, None)
            for k in ("normalTexture", "occlusionTexture"):
                m.pop(k, None)
        j = json.dumps(js).encode()
        j += b" " * ((4 - len(j) % 4) % 4)
        rest = data[20 + ln :]
        tmp = os.path.join(TMP, f"{vid}-check.glb")
        open(tmp, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + len(rest)) + struct.pack("<II", len(j), 0x4E4F534A) + j + rest)
        bpy.ops.import_scene.gltf(filepath=tmp)
        s = bikes.spec(vid)
        for m in bpy.data.materials:
            if m.name.startswith("paint") and m.node_tree:
                b = m.node_tree.nodes.get("Principled BSDF")
                if b:
                    b.inputs["Base Color"].default_value = (*hexc(s["colours"][0] if m.name == "paint" else (s.get("colour2") or "#202020")), 1)
            if m.name == "collider":
                pass
        ob = bpy.data.objects
        for o in ob:
            if o.name.startswith("collider"):
                o.hide_render = True
        # pose: the bars 25° left (about steer's own glTF y = Blender local z), the cranks a quarter turn (glTF z =
        # Blender local −y) with the pedals kept level, the wheels a bit, the levers pulled, the stand down
        def rot(name, axis, ang):
            o = ob.get(name)
            if o is None:
                return
            o.matrix_basis = o.matrix_basis @ Matrix.Rotation(ang, 4, axis)

        rot("steer", "Z", math.radians(25))
        rot("crank", V((0, -1, 0)), math.radians(60))
        for p in ("pedal_l", "pedal_r"):
            rot(p, V((0, -1, 0)), math.radians(-60))
        rot("spin_f", V((0, -1, 0)), math.radians(40))
        rot("spin_r", V((0, -1, 0)), math.radians(40))
        man = json.load(open(os.path.join(GLB, "manifest.json")))["bikes"].get(vid, {})
        for nm, d in (man.get("levers") or {}).items():
            rot(nm, V((0, -1, 0)), d["pull"])
        if man.get("kickstand"):
            rot("kickstand", "X", man["kickstand"]["down"])
        bpy.context.view_layer.update()
        # markers: the root's axes (x red, y up green, z right blue — glTF's), the hubs, the bb, the saddle and grips
        for nm, c in (("x", (0.9, 0.05, 0.05)), ("up", (0.05, 0.7, 0.1)), ("right", (0.05, 0.2, 0.9))):
            mt = bpy.data.materials.new(nm)
            mt.use_nodes = True
            mt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*c, 1)
            mt.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (*c, 1)
            mt.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.0
            d = {"x": V((0.45, 0, 0)), "up": V((0, 0, 0.45)), "right": V((0, -0.45, 0))}[nm]
            o = bk.sweep("axis", [V((0, 0, 0.003)), V((0, 0, 0.003)) + d], 0.008, "trim", "x", n=10)
            o.data.materials.clear()
            o.data.materials.append(mt)
        mk = bpy.data.materials.new("mark")
        mk.use_nodes = True
        mk.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1.0, 0.75, 0.05, 1)
        mk.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1.0, 0.75, 0.05, 1)
        mk.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 2.0
        for nm in ("hub_f", "hub_r", "bb", "saddle", "grip_l", "grip_r", "steer_top", "steer_bottom", "lamp_f", "lamp_r", "bell", "stand_foot", "drop_l", "drop_r", "peg_fl", "peg_fr", "peg_rl", "peg_rr"):
            o = ob.get(nm)
            if o is None:
                continue
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=o.matrix_world.translation, segments=12, ring_count=8)
            bpy.context.object.data.materials.append(mk)
        # the steering axis drawn through steer's local up
        st = ob.get("steer")
        if st:
            p = st.matrix_world.translation
            up = (st.matrix_world.to_3x3() @ V((0, 0, 1))).normalized()
            o = bk.sweep("axisline", [p - up * 0.5, p + up * 0.5], 0.003, "trim", "x", n=8)
            o.data.materials.clear()
            o.data.materials.append(mk)
        camera(sc, (2.1, -2.8, 1.7), (0.2, 0, 0.45), 46)
        bpy.context.view_layer.update()
        t = text(sc, f"{vid}.glb re-imported: steer +25°, cranks +60° (pedals level), levers pulled{', stand down' if man.get('kickstand') else ''}", (0, 0, 0), 0.032)
        t.matrix_world = sc.camera.matrix_world @ Matrix.Translation((0, -0.44, -2.0))
        shot(sc, os.path.join(OUT, f"check-{vid}.png"))


if __name__ == "__main__":
    if "tiles" in SHOTS:
        tiles()
    if "scale" in SHOTS:
        scale_shots()
    if "detail" in SHOTS:
        detail_shots()
    if "check" in SHOTS:
        check_shots()

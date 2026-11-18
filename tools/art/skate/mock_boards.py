# Plan 103 — the skateboards' stills (EEVEE, the bikes' mock lighting: a low sun over snow): each variant from the
# top, the bottom, the side and three-quarters (0-<shape>.png), all nine (0-all.png), a 1.70 m mannequin standing on
# a street board in a regular stance beside one standing up straight (0-scale.png), close-ups of a truck
# (0-detail-truck.png), and the exported GLBs re-imported with their hangers turned (check-<variant>.png).
#
#   blender -b --factory-startup -P tools/art/skate/mock_boards.py -- [--shots tiles,scale,detail,check]
#                                                                       [--board street-pop] [--out design/skate]
import json
import math
import os
import struct
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import skit as sk  # noqa: E402
from skit import kit  # noqa: E402

import boards  # noqa: E402

ROOT = os.path.join(HERE, "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(ROOT, "design/skate"))
GLB = arg("--glb", os.path.join(ROOT, "apps/client/public/life/skate"))
TMP = tempfile.mkdtemp(prefix="skate-tiles-")
os.makedirs(OUT, exist_ok=True)
SHOTS = arg("--shots", "tiles,scale,detail,check").split(",")
ONLY = arg("--board", ",".join(boards.ORDER)).split(",")
V = Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.MATS.clear()
    kit.TEXTURED = True
    sk.LOD = "near"
    kit.SEG = 1.0


def scene(res=(960, 540), ground=True):
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
    s.rotation_euler = (math.radians(50), 0, math.radians(-35))
    sc.collection.objects.link(s)
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 40
    fill.size = 3
    f = bpy.data.objects.new("fill", fill)
    f.location = (1.5, -2.5, 1.6)
    f.rotation_euler = (V((0, 0, 0.1)) - V(f.location)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(f)
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
        g = bpy.context.object
        m = bpy.data.materials.new("ground")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.42, 0.43, 0.45, 1)
        b.inputs["Roughness"].default_value = 0.8
        g.data.materials.append(m)
    return sc


def camera(sc, loc, look, lens=50, ortho=None):
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.01
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


def graphic_png(vid):
    return os.path.join(sk.SRC, f"graphic-{vid}.png")


def place(vid, at=(0, 0, 0), rz=0.0, flip=False, k=0):
    """A board built at a spot (turned about z; flipped over onto its back), its paint and wheels in its own period
    colours, its own print."""
    s = boards.spec(vid)
    sk.set_graphic(graphic_png(vid), rough=0.12 if s.get("slick") else 0.42, coat=1.0 if s.get("slick") else 0.3)
    before = set(bpy.data.objects)
    B, obs = boards.build(vid)
    new = [o for o in bpy.data.objects if o not in before]
    for kind, col in (("paint", hexc(s["colours"][k])), ("paint2", hexc(s["colours"][(k + 1) % 3])), ("urethane", hexc(s["wheel_colours"][k]))):
        m = kit.mat(kind).copy()
        m.name = f"{kind}-{vid}"
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*col, 1)
        for o in new:
            if o.type == "MESH" and o.get("kind") == kind:
                o.data.materials.clear()
                o.data.materials.append(m)
    sk.uv_metric()
    M = Matrix.Translation(V(at)) @ Matrix.Rotation(rz, 4, "Z")
    if flip:
        top = max(p.z for p, _ in B.points.values()) + 0.03
        M = M @ Matrix.Translation((0, 0, top)) @ Matrix.Rotation(math.pi, 4, "X")
    for o in new:
        if o.type == "MESH":
            o.data.transform(M)
    return B, new, M


def compose(paths, cols, out, gap=6):
    ims = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        ims.append(np.array(im.pixels[:]).reshape(h, w, 4))
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


def ink(colour):
    m = bpy.data.materials.new("ink")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Emission Color"].default_value = (*colour, 1)
    b.inputs["Emission Strength"].default_value = 0.6
    return m


def text(sc, s, at, size=0.06, rot=(math.pi / 2, 0, 0), colour=(0.05, 0.05, 0.06), align="CENTER"):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = s
    cu.size = size
    cu.align_x = align
    o = bpy.data.objects.new("t", cu)
    o.location = at
    o.rotation_euler = rot
    cu.materials.append(ink(colour))
    sc.collection.objects.link(o)
    return o


# ── tiles: each variant from the top, the bottom, the side and three-quarters ────────────────────────────────


def tiles():
    out = {}
    for vid in ONLY:
        s = boards.spec(vid)
        L = s["x_n"] - s["x_t"]
        cx = (s["x_n"] + s["x_t"]) / 2
        ps = []
        reset()
        sc = scene()
        B, _, _ = place(vid)
        camera(sc, (cx, 0, 3), (cx, 0.0, 0), ortho=L * 1.12)
        ps.append(os.path.join(TMP, f"{vid}-top.png"))
        shot(sc, ps[-1])
        camera(sc, (cx, -3, B.info["H"] * 0.75), (cx, 0, B.info["H"] * 0.75), ortho=L * 1.12)
        ps.append(os.path.join(TMP, f"{vid}-side.png"))
        shot(sc, ps[-1])
        camera(sc, (cx + 0.75, -0.95, 0.55), (cx + 0.02, 0, 0.05), 50)
        ps.append(os.path.join(TMP, f"{vid}-34.png"))
        shot(sc, ps[-1])
        reset()
        sc = scene()
        place(vid, flip=True)
        camera(sc, (cx, 0, 3), (cx, 0.0, 0), ortho=L * 1.12)
        ps.append(os.path.join(TMP, f"{vid}-bottom.png"))
        shot(sc, ps[-1])
        out[vid] = [ps[0], ps[3], ps[1], ps[2]]
    for shape in ("vert", "street", "cruiser"):
        vs = [v for v in boards.ORDER if v.startswith(shape + "-")]
        if all(v in out for v in vs):
            compose([p for v in vs for p in out[v]], 4, os.path.join(OUT, f"0-{shape}.png"))
    if all(v in out for v in boards.ORDER):
        compose([out[v][3] for v in boards.ORDER], 3, os.path.join(OUT, "0-all.png"))


# ── scale: a 1.70 m mannequin standing on a street board in a regular stance, and one beside it ─────────────


def capsule(name, a, b, r, mat):
    o = sk.sweep(name, sk.bk.resample([V(a), V(b)], 0.05), r, "steel", "x", n=14)
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in (a, b):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=14, ring_count=8)
        bpy.context.object.data.materials.append(mat)
    return o


def two_bone(H, A, l1, l2, bend):
    d = A - H
    L = d.length
    if L > l1 + l2:
        return H + d.normalized() * l1
    a = (l1 * l1 + L * L - l2 * l2) / (2 * L)
    h = math.sqrt(max(0, l1 * l1 - a * a))
    u = d.normalized()
    w = (bend - u * u.dot(bend)).normalized()
    return H + u * a + w * h


def foot(heel, toe, mat):
    capsule("foot", heel, toe, 0.036, mat)


def mannequin_stance(B, at, mat):
    """Regular: the left foot forward over the front bolts, the right on the tail's kick; sideways, facing the
    toe side (−y), knees soft, arms loose."""
    at = V(at)
    ff = B.points["foot_f"][0] + at
    fr = B.points["foot_r"][0] + at
    # the feet across the deck (the heel at the heel edge), the front one turned a little toward the nose
    out = []
    for p, ang in ((ff, math.radians(70)), (fr, math.radians(84))):
        d = V((math.cos(ang), -math.sin(ang), 0))
        heel = p - d * 0.11 + V((0, 0, 0.035))
        toe = p + d * 0.14 + V((0, 0, 0.03))
        foot(heel, toe, mat)
        out.append(p + V((0, 0.035, 0.085)) - d * 0.04)
    ank_f, ank_r = out
    mid = (ank_f + ank_r) / 2
    hip_c = V((mid.x + 0.01, 0.03, ank_f.z - 0.075 + 0.79))
    for ank, sx in ((ank_f, 1), (ank_r, -1)):
        hip = hip_c + V((sx * 0.09, 0, 0))
        knee = two_bone(hip, ank, 0.43, 0.42, V((sx * 0.25, -1, 0)))
        capsule("thigh", hip, knee, 0.065, mat)
        capsule("shin", knee, ank, 0.047, mat)
    lean = V((0.02, -0.08, 1)).normalized()
    sh = hip_c + V((0, 0, 0.06)) + lean * 0.44
    capsule("torso", hip_c + V((0, 0, 0.06)), sh, 0.14, mat)
    for sx in (1, -1):
        s = sh + V((sx * 0.185, 0, -0.02))
        el = s + V((sx * 0.06, -0.06, -0.26))
        wr = el + V((sx * 0.07, -0.1, -0.2))
        capsule("upper", s, el, 0.042, mat)
        capsule("fore", el, wr, 0.035, mat)
    head = sh + lean * 0.2 + V((0.02, 0, 0))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.105, location=head, segments=20, ring_count=12)
    bpy.context.object.data.materials.append(mat)
    return head.z + 0.105


def mannequin_standing(at, mat):
    at = V(at)
    for side in (1, -1):
        hip = at + V((side * 0.09, 0, 0.863))
        knee = at + V((side * 0.09, -0.01, 0.47))
        ank = at + V((side * 0.09, 0, 0.065))
        capsule("thigh", hip, knee, 0.065, mat)
        capsule("shin", knee, ank, 0.048, mat)
        capsule("foot", ank + V((0, 0.05, -0.03)), ank + V((0, -0.17, -0.035)), 0.033, mat)
        sh = at + V((side * 0.18, 0, 1.41))
        el = at + V((side * 0.21, 0, 1.12))
        wr = at + V((side * 0.22, -0.04, 0.86))
        capsule("upper", sh, el, 0.042, mat)
        capsule("fore", el, wr, 0.035, mat)
    capsule("torso", at + V((0, 0, 0.92)), at + V((0, 0, 1.38)), 0.14, mat)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.105, location=at + V((0, 0, 1.595)), segments=20, ring_count=12)
    bpy.context.object.data.materials.append(mat)


def scale_shots():
    reset()
    sc = scene((1600, 1000))
    mat = bpy.data.materials.new("mannequin")
    mat.use_nodes = True
    mb = mat.node_tree.nodes["Principled BSDF"]
    mb.inputs["Base Color"].default_value = (0.62, 0.6, 0.57, 1)
    mb.inputs["Roughness"].default_value = 0.6
    B, _, _ = place("street-pop", (0, 0, 0))
    top = mannequin_stance(B, (0, 0, 0), mat)
    mannequin_standing((1.05, 0.0, 0), mat)
    Bv, _, _ = place("vert-classic", (-1.5, 0.6, 0))
    Bc, _, _ = place("cruiser-classic", (1.95, 0.3, 0), rz=0.0)
    red = (0.7, 0.08, 0.05)
    for x0, x1, z, lab in ((1.25, 1.55, 1.70, "1.70 m"), (-0.62, -0.45, B.info["H"], f"deck top {B.info['H'] * 100:.1f} cm"), (-0.62, -0.3, top, f"head {top:.2f} m")):
        o = kit.box("mark", ((x0 + x1) / 2, 0.0, z), (x1 - x0, 0.004, 0.004), "steel", "x")
        o.data.materials.clear()
        o.data.materials.append(ink(red))
        text(sc, lab, (x1 + 0.02 if x0 > 0 else x0 - 0.02, 0.0, z - 0.012), 0.045, colour=red, align="LEFT" if x0 > 0 else "RIGHT")
    text(sc, "Larch Kerb (street-pop, 31.5\" x 8\"), a regular stance: the front foot over the front bolts, the back foot on the tail", (0.1, 0.0, 1.95), 0.045)
    text(sc, "Varlow Comet (vert-classic, 10\")", (-1.5, 0.6, 0.25), 0.035)
    text(sc, "Sandell Coaster (cruiser-classic, 9\")", (1.95, 0.3, 0.25), 0.035)
    camera(sc, (0.1, -5.2, 1.05), (0.1, 0, 0.95), 40)
    shot(sc, os.path.join(OUT, "0-scale.png"))


# ── detail: a truck close up ─────────────────────────────────────────────────────────────────────────────────


def detail_shots():
    reset()
    sc = scene((960, 720))
    vid = "street-pop" if "street-pop" in ONLY or not arg("--board") else ONLY[0]
    B, _, _ = place(vid)
    s = boards.spec(vid)
    xr = -s["wb"] / 2
    xf = s["wb"] / 2
    r = s["wheel"][0]
    ps = []
    camera(sc, (xr, -0.45, 0.035), (xr, 0, 0.05), 50)
    ps.append(os.path.join(TMP, "det-a.png"))
    shot(sc, ps[-1])
    camera(sc, (xr + 0.24, -0.2, 0.018), (xr + 0.005, 0, 0.045), 40)
    ps.append(os.path.join(TMP, "det-b.png"))
    shot(sc, ps[-1])
    camera(sc, (xf + 0.42, -0.06, 0.06), (xf, 0, r + 0.01), 50)
    ps.append(os.path.join(TMP, "det-c.png"))
    shot(sc, ps[-1])
    camera(sc, (xf + 0.12, -0.2, 0.3), (xf + 0.005, 0, B.info["H"]), 45)
    ps.append(os.path.join(TMP, "det-d.png"))
    shot(sc, ps[-1])
    compose(ps, 2, os.path.join(OUT, "0-detail-truck.png"))


# ── checks: the exported GLBs re-imported, the hangers turned ────────────────────────────────────────────────


def check_shots():
    for vid in ONLY:
        path = os.path.join(GLB, f"{vid}.glb")
        if not os.path.exists(path):
            continue
        reset()
        sc = scene((1200, 800), ground=False)
        data = open(path, "rb").read()
        ln, _ = struct.unpack_from("<II", data, 12)
        js = json.loads(data[20 : 20 + ln])
        for k in ("extensionsRequired", "images", "textures", "samplers"):
            js.pop(k, None)
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
        s = boards.spec(vid)
        for m in bpy.data.materials:
            if not m.node_tree:
                continue
            b = m.node_tree.nodes.get("Principled BSDF")
            if b is None:
                continue
            if m.name == "paint":
                b.inputs["Base Color"].default_value = (*hexc(s["colours"][0]), 1)
            elif m.name == "urethane":
                b.inputs["Base Color"].default_value = (*hexc(s["wheel_colours"][0]), 1)
            elif m.name == "graphic":
                b.inputs["Base Color"].default_value = (1, 1, 1, 1)
                sk.wire(m, dict(tile=None), bpy.data.images.load(graphic_png(vid)))
            elif m.name in ("grip", "deck_wood"):
                b.inputs["Base Color"].default_value = (1, 1, 1, 1)
                sk.wire(m, sk.OWN[m.name])
        ob = bpy.data.objects
        for o in ob:
            if o.name.startswith("collider"):
                o.hide_render = True

        def turn(name, axis, ang):
            o = ob.get(name)
            if o is not None:
                o.matrix_basis = o.matrix_basis @ Matrix.Rotation(ang, 4, axis)

        turn("hanger_f", "Z", math.radians(20))
        turn("hanger_r", "Z", math.radians(-20))
        for w in ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"):
            turn(w, V((0, -1, 0)), math.radians(35))
        bpy.context.view_layer.update()
        for nm, c in (("x", (0.9, 0.05, 0.05)), ("up", (0.05, 0.7, 0.1)), ("right", (0.05, 0.2, 0.9))):
            d = {"x": V((0.25, 0, 0)), "up": V((0, 0, 0.25)), "right": V((0, -0.25, 0))}[nm]
            o = sk.sweep("axis", [V((0, 0, 0.002)), V((0, 0, 0.002)) + d], 0.004, "steel", "x", n=10)
            o.data.materials.clear()
            o.data.materials.append(ink(c))
        mk = ink((1.0, 0.75, 0.05))
        man = json.load(open(os.path.join(GLB, "manifest.json")))["boards"].get(vid, {})
        for nm in man.get("points", {}):
            o = ob.get(nm)
            if o is None:
                continue
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.006, location=o.matrix_world.translation, segments=12, ring_count=8)
            bpy.context.object.data.materials.append(mk)
        camera(sc, (0.62, -0.95, -0.42), (0.0, 0, 0.05), 40)
        bpy.context.view_layer.update()
        t = text(sc, f"{vid}.glb re-imported: hanger_f +20°, hanger_r −20°, wheels spun; points in yellow", (0, 0, 0), 0.016)
        t.matrix_world = sc.camera.matrix_world @ Matrix.Translation((0, -0.255, -1.0))
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

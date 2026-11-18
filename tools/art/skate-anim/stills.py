# Plan 104 F4a — the skater's clips as stills: the exported clips (anim.json, the game's format — what the client
# reads) posed on a life person (public/life/person-<who>.glb, skinned as the client skins it: the arms turned straight
# down at rest, her legs fitted to the rig's as chars/model.ts fitLeg does) with the street board built from its
# Blender source (tools/art/skate/boards.py) on the clip's board bone. A sheet a family: a row a clip, its key frames
# across (EEVEE).
#
#   blender -b --factory-startup -P tools/art/skate-anim/stills.py -- [--only kickflip,indy] [--sheet flips]
#           [--anim apps/client/public/life/skate/anim.json] [--out design/skate/anim104] [--view side|game|both]
import json
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "../skate"))
import rig as R  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


ANIM = arg("--anim", os.path.join(R.ROOT, "apps/client/public/life/skate/anim.json"))
OUT = arg("--out", os.path.join(R.ROOT, "design/skate/anim104"))
WHO = arg("--who", "man")
ONLY = [c for c in arg("--only", "").split(",") if c]
SHEET = arg("--sheet", "")
VIEW = arg("--view", "side")
RES = tuple(int(v) for v in arg("--res", "300x340").split("x"))
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix="skate-anim-")

SHEETS = {
    "roll": ["stance", "push", "carve+", "carve-", "crouch", "ollie", "land", "air", "revert", "powerslide",
             "stumble", "geton", "kickup"],
    "flips": ["kickflip", "heelflip", "shoveit", "impossible", "varial", "varialheel", "hardflip", "inwardheel",
              "treflip", "shove360", "kickflip.x2", "ghettobird", "fingerflip"],
    "grabs": ["indy", "melon", "method", "stiffy", "nosegrab", "tailgrab", "japan", "madonna", "benihana", "airwalk",
              "stalefish", "christair", "judo", "mctwist"],
    "grinds": ["fiftyfifty", "fiveo", "nosegrind", "crooked", "overcrook", "smith", "feeble", "boardslide", "lipslide",
               "noseslide", "tailslide", "bluntslide", "darkslide", "casper"],
    "balance": ["manual", "manual.bal-", "manual.bal+", "nosemanual", "hangten", "grind.bal-", "grind.bal0",
                "grind.bal+"],
    "lips": ["rocktofakie", "axlestall", "nosestall", "handplant", "wallride", "wallplant", "spine", "acid"],
}

# game (x her left, y up, z ahead) → Blender (x, −z, y)
CV = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CVi = CV.inverted()


def conv(m4):
    return CV @ m4 @ CVi


def T(v):
    return Matrix.Translation(Vector(v))


def R4(m3):
    return m3.to_4x4()


# ── the scene ───────────────────────────────────────────────────────────────────────────────────────────────
def scene():
    sc = bpy.context.scene
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = e
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "AgX"
    try:
        sc.eevee.taa_render_samples = 16
        sc.eevee.use_shadows = True
    except AttributeError:
        pass
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.68, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    sc.world = w
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    s = bpy.data.objects.new("sun", sun)
    s.rotation_euler = (math.radians(40), 0, math.radians(-30))
    sc.collection.objects.link(s)
    return sc


def flat_mat(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def box(name, c, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(mat)
    return o


def props():
    """The ground, a rail (along her x and along her z), a coping — shown by the clip's kind."""
    g = flat_mat("ground", (0.42, 0.43, 0.45))
    steel = flat_mat("steel", (0.6, 0.62, 0.66), 0.3)
    out = {}
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    out["ground"] = bpy.context.object
    out["ground"].data.materials.append(g)
    out["railx"] = box("railx", (0, 0, -0.03), (3.0, 0.05, 0.06), steel)
    out["railz"] = box("railz", (0, 0, -0.03), (0.05, 3.0, 0.06), steel)
    out["coping"] = box("coping", (-0.03, 0, -0.03), (0.06, 3.0, 0.06), steel)
    out["wall"] = box("wall", (-0.7, 0, -1.2), (1.3, 3.0, 2.3), flat_mat("ramp", (0.48, 0.36, 0.24)))
    return out


# ── the person ──────────────────────────────────────────────────────────────────────────────────────────────
class Person:
    def __init__(self, who):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(R.ROOT, f"apps/client/public/life/person-{who}.glb"))
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type == "MESH" and o.parent is None:
                bpy.data.objects.remove(o)
        self.arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
        self.rig = R.Rig(who)
        j = R.glb_json(os.path.join(R.ROOT, f"apps/client/public/life/person-{who}.glb"))
        nodes = j["nodes"]
        # (the skin's joints only: a mesh may share a bone's name — "hair")
        self.local = {}
        for i in j["skins"][0]["joints"]:
            nd = nodes[i]
            self.local[nd["name"]] = Vector(nd.get("translation", [0, 0, 0]))
        self.parent = {b.name: b.parent.name for b in self.arm.data.bones if b.parent}
        # the file's rest places (world, its skeleton unturned)
        self.bones = [b.name for b in self.arm.data.bones]
        self.F = {}
        for n in sorted(self.bones, key=self.depth):
            p = self.parent.get(n)
            self.F[n] = self.local[n] + (self.F[p] if p in self.F else Vector())
        # the arms' corrections: the client's straight-down rest → the file's
        self.Q = {}
        for S in "LR":
            qs = Vector((0, -1, 0)).rotation_difference(self.local[f"elbow{S}"].normalized())
            qe = Vector((0, -1, 0)).rotation_difference(self.local[f"wrist{S}"].normalized())
            self.Q[f"shoulder{S}"] = qs.to_matrix()
            for n in self.bones:
                if self.under(n, f"elbow{S}"):
                    self.Q[n] = qe.to_matrix()
        # the life leg's lengths and its sole
        self.ankle_y = self.F["ankleL"].y
        self.ball = self.local["toeL"].z
        self.Mr = {b.name: b.matrix_local.copy() for b in self.arm.data.bones}

    def under(self, n, top):
        while n:
            if n == top:
                return True
            n = self.parent.get(n)
        return False

    def pose(self, pose, lift):
        rig = self.rig
        J = rig.fk(pose, lift)  # the rig's (legs the rig's, arms straight down)
        X, W = {}, {}
        # trunk, arms, hands as the client's bones (client offsets: rig.off; the file's for what's not the rig's)
        order = [b for b in self.bones]
        order.sort(key=lambda n: self.depth(n))
        for n in order:
            p = self.parent.get(n)
            if n.startswith(("thigh", "knee", "ankle", "toe")) and n[-1] in "LR" and n[:-1] in ("thigh", "knee", "ankle", "toe"):
                continue
            if n == "hips":
                X[n], W[n] = J[n]
                continue
            # (the client's bones: the file's places, under the forearm turned straight down with it)
            off = self.local[n]
            if p in self.Q:
                off = self.Q[p].inverted() @ off
            X[n] = X[p] + W[p] @ off
            W[n] = J[n][1] if n in J else W[p]
        # the legs: the life leg's ankle where the rig's is (its sole), the knee the rig's way, the foot the rig's turn
        for S in "LR":
            th = X["hips"] + W["hips"] @ self.local[f"thigh{S}"]
            ra, rf = J[f"ankle{S}"]
            rk, _ = J[f"knee{S}"]
            rt, _ = J[f"thigh{S}"]
            target = ra + rf @ Vector((0, self.ankle_y - R.ANKLE, R.BALL - self.ball))
            a = self.local[f"knee{S}"].length
            b = self.local[f"ankle{S}"].length
            Dv = target - th
            d = max(abs(a - b) + 1e-3, min(a + b - 1e-4, Dv.length))
            u = Dv.normalized()
            pole = (rk - rt) - u * (rk - rt).dot(u)
            if pole.length < 1e-6:
                pole = Vector((0, 0, 1))
            pole.normalize()
            ca = max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d)))
            K = th + (u * ca + pole * math.sqrt(1 - ca * ca)) * a
            A = th + u * d
            W[f"thigh{S}"] = self.aim(self.local[f"knee{S}"], K - th, pole)
            W[f"knee{S}"] = self.aim(self.local[f"ankle{S}"], A - K, pole)
            W[f"ankle{S}"] = rf
            W[f"toe{S}"] = J[f"toe{S}"][1]
            X[f"thigh{S}"], X[f"knee{S}"], X[f"ankle{S}"] = th, K, A
            X[f"toe{S}"] = A + rf @ self.local[f"toe{S}"]
        # the bones: each its deform (file rest → posed), into Blender's pose
        M = {}
        for n in order:
            C = self.Q.get(n, Matrix.Identity(3))
            Dm = T(X[n]) @ R4(W[n] @ C.inverted()) @ T(-self.F[n])
            M[n] = conv(Dm) @ self.Mr[n]
        for n in order:
            pb = self.arm.pose.bones[n]
            p = self.arm.data.bones[n].parent
            if p is None:
                pb.matrix_basis = self.Mr[n].inverted() @ M[n]
            else:
                pn = p.name
                pb.matrix_basis = (self.Mr[pn].inverted() @ self.Mr[n]).inverted() @ (M[pn].inverted() @ M[n])
        bpy.context.view_layer.update()

    def depth(self, n):
        k = 0
        while n in self.parent and self.parent[n] in self.local and self.parent[n] in self.bones:
            n = self.parent[n]
            k += 1
        return k

    @staticmethod
    def aim(rest_off, now, pole):
        """A segment's world turn: its rest way (the file's) onto `now`, its bend plane toward `pole`."""
        r = rest_off.normalized()
        rz = Vector((0, 0, 1)) - r * r.z
        rz.normalize()
        n = now.normalized()
        nz = pole - n * pole.dot(n)
        nz.normalize()
        A = Matrix((r, rz, r.cross(rz))).transposed()
        B = Matrix((n, nz, n.cross(nz))).transposed()
        return B @ A.inverted()


# ── the board ───────────────────────────────────────────────────────────────────────────────────────────────
def board(vid="street-pop"):
    import boards  # noqa: E402
    import skit as sk  # noqa: E402
    from skit import kit  # noqa: E402

    kit.MATS.clear()
    kit.TEXTURED = True
    sk.LOD = "near"
    s = boards.spec(vid)
    sk.set_graphic(os.path.join(sk.SRC, f"graphic-{vid}.png"), rough=0.42, coat=0.3)
    before = set(bpy.data.objects)
    _B, _obs = boards.build(vid)
    new = [o for o in bpy.data.objects if o not in before]

    def hexc(h):
        h = h.lstrip("#")
        return tuple((int(h[i : i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))

    for kind, col in (("paint", hexc(s["colours"][0])), ("paint2", hexc(s["colours"][1])),
                      ("urethane", hexc(s["wheel_colours"][0]))):
        m = kit.mat(kind).copy()
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*col, 1)
        for o in new:
            if o.type == "MESH" and o.get("kind") == kind:
                o.data.materials.clear()
                o.data.materials.append(m)
    sk.uv_metric()
    root = bpy.data.objects.new("board", None)
    bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.type == "MESH" and o.parent is None and o.get("kind") != "collider" and "collider" not in o.name:
            o.parent = root
        elif "collider" in o.name:
            o.hide_render = True
    return root


# ── sampling the game's format (as the client does) ───────────────────────────────────────────────────────────
def at(c, name, t):
    v = c["ch"][name]
    if not isinstance(v, list):
        return v
    ts = c["t"]
    if t <= ts[0]:
        return v[0]
    if t >= ts[-1]:
        return v[-1]
    for i in range(1, len(ts)):
        if ts[i] >= t:
            k = (t - ts[i - 1]) / (ts[i] - ts[i - 1])
            return v[i - 1] + (v[i] - v[i - 1]) * k
    return v[-1]


def frame_of(c, t, deckY):
    pose = {j: tuple(at(c, f"{j}.{a}", t) for a in "xyz") for j in R.JOINTS}
    lift = tuple(at(c, f"lift.{a}", t) for a in "xyz")
    bc = Vector(tuple(at(c, f"bc.{a}", t) for a in "xyz"))
    be = tuple(at(c, f"be.{a}", t) for a in "xyz")
    Rb = R.board_m(*be)
    origin = bc - Rb @ Vector((0, deckY, 0))
    return pose, lift, T(origin) @ R4(Rb)


def camera(sc, loc, look, lens=40):
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.clip_start = 0.02
    o = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = o
    return o


def g2b(v):
    x, y, z = v
    return Vector((x, -z, y))


def label(sc, text, at_, size=0.11):
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "LEFT"
    o = bpy.data.objects.new("t", cu)
    sc.collection.objects.link(o)
    o.data.materials.append(flat_mat("ink", (0.03, 0.03, 0.035)))
    return o


def compose(rows, out, gap=4):
    """Rows of tile files → one PNG (np, top-left first)."""
    ims = []
    W = H = 0
    for row in rows:
        r = []
        for p in row:
            im = bpy.data.images.load(p)
            w, h = im.size
            r.append(np.array(im.pixels[:]).reshape(h, w, 4))
            bpy.data.images.remove(im)
        ims.append(r)
    h, w = ims[0][0].shape[:2]
    cols = max(len(r) for r in ims)
    Wd = cols * w + (cols - 1) * gap
    Hd = len(ims) * h + (len(ims) - 1) * gap
    canvas = np.zeros((Hd, Wd, 4))
    canvas[..., 3] = 1
    canvas[..., :3] = 0.04
    for ri, r in enumerate(ims):
        for ci, a in enumerate(r):
            y0 = Hd - (ri + 1) * h - ri * gap
            x0 = ci * (w + gap)
            canvas[y0 : y0 + h, x0 : x0 + w] = a
    img = bpy.data.images.new("out", Wd, Hd, alpha=True)
    img.pixels = canvas.ravel().tolist()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("composed", out)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = scene()
    doc = json.load(open(ANIM))
    clips = doc["clips"]
    deckY = doc["board"]["deckY"]
    P = props()
    person = Person(WHO)
    brd = board()
    sheets = {SHEET: SHEETS[SHEET]} if SHEET else ({"only": ONLY} if ONLY else SHEETS)
    views = ["side", "game"] if VIEW == "both" else [VIEW]
    for name, ids in sheets.items():
        for view in views:
            rows = []
            for cid in ids:
                c = clips.get(cid)
                if not c:
                    print("no clip", cid)
                    continue
                kind = c["kind"]
                slide = cid in ("boardslide", "lipslide", "darkslide")
                P["railx"].hide_render = not ((kind == "grind" and not slide) or cid.startswith("grind."))
                P["railz"].hide_render = not slide
                P["coping"].hide_render = P["wall"].hide_render = kind != "lip"
                P["ground"].location.z = -0.45 if kind in ("grind", "lip") or cid.startswith("grind.") else 0.0
                if kind == "lip":
                    P["ground"].location.z = -2.4
                air = kind in ("air", "flip", "grab")
                if air:
                    P["ground"].location.z = -0.6
                times = sorted(set(c.get("keys", [0.0]) + [c["dur"]]))
                if len(times) > 7:
                    times = [times[round(i * (len(times) - 1) / 6)] for i in range(7)]
                row = []
                for t in times:
                    pose, lift, Bm = frame_of(c, t, deckY)
                    person.pose(pose, lift)
                    brd.matrix_world = conv(Bm)
                    for o in list(sc.collection.objects):
                        if o.type == "CAMERA" or o.name.startswith("t"):
                            if o.type in ("CAMERA", "FONT"):
                                bpy.data.objects.remove(o)
                    if view == "side":
                        camera(sc, g2b((1.25, 1.05, 2.15)), g2b((0.0, 0.62, 0.0)), 36)
                    else:
                        # (the game's: behind her, the way she rolls (the nose's), 3.5 m back, 1.7 up)
                        camera(sc, g2b((-3.4, 1.7, 0.4)), g2b((0.3, 0.7, 0.0)), 30)
                    lab = label(sc, f"{cid}  {t:.2f}s", None)
                    cam = sc.camera
                    lab.parent = cam
                    lab.location = (-0.6, 0.72, -2.0)
                    lab.scale = (0.5, 0.5, 0.5)
                    p = os.path.join(TMP, f"{name}-{view}-{cid}-{t:.3f}.png")
                    sc.render.filepath = p
                    bpy.ops.render.render(write_still=True)
                    row.append(p)
                rows.append(row)
            if rows:
                compose(rows, os.path.join(OUT, f"{name}-{view}.png"))


main()

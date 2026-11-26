# Plan 126 phase 1 — the animals: CC0 packs (Quaternius, via poly.pizza) and two CC-BY works (Sherkiz: the rabbit,
# the hawk) restyled to the life look — one smooth skinned mesh (Catmull-Clark once, shaded smooth), colour baked
# into COLOR_0 (per species, countershaded, a little painted variation; one material, no textures), true size in
# metres on y=0, the nose along +X, the same clip names for every animal. Derived species are morphed from a
# source's rest (bones moved, the mesh skinned along), so the source's clips still play.
#
#   blender -b --factory-startup -P tools/art/animals/build_animals.py -- [--only deer,wolf] [--list]
#
# Sources: $ANIMAL_SRC (default ~/Developer/projects/yondra/yutopia-art-src/polypizza) — the downloads stay out
# of git. Output: apps/client/public/life/animals/<model>.glb and manifest.json (sizes, clips, triangles).
# See README.md beside this file.
import bpy
import bmesh
import json
import math
import os
import re
import sys

import numpy as np
from mathutils import Matrix, Quaternion, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SRC = os.environ.get("ANIMAL_SRC", os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/polypizza"))
OUT = os.path.join(ROOT, "apps/client/public/life/animals")
FPS = 24
CLIPS = ["idle", "idle2", "look", "eat", "walk", "trot", "run", "jump", "attack", "kick", "hitL", "hitR", "die",
         "lie", "sit", "fly", "glide", "swim", "drink", "sniff", "groom", "play", "howl", "stamp"]  # fmt: skip

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ---------------------------------------------------------------- colour helpers (sRGB 0..1 tuples)
def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def to_srgb(c):
    return tuple(max(0.0, min(1.0, 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)) for x in c[:3])


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    a = hexc(a) if isinstance(a, str) else a
    b = hexc(b) if isinstance(b, str) else b
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mul(a, k):
    a = hexc(a) if isinstance(a, str) else a
    return tuple(max(0.0, min(1.0, x * k)) for x in a)


def sstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


# ---------------------------------------------------------------- Blender plumbing
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def activate(o):
    bpy.context.view_layer.update()
    for x in bpy.context.scene.objects:
        if x is not None:
            x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def mode(o, m):
    activate(o)
    if bpy.context.object.mode != m:
        bpy.ops.object.mode_set(mode=m)


def fcurves(act):
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                yield from cb.fcurves


def channelbags(act):
    for layer in act.layers:
        for strip in layer.strips:
            yield from strip.channelbags


def scale_loc(act, s):
    for fc in fcurves(act):
        if fc.data_path.endswith(".location"):
            for k in fc.keyframe_points:
                k.co.y *= s
                k.handle_left.y *= s
                k.handle_right.y *= s
            fc.update()


def bone_of(path):
    m = re.match(r'pose\.bones\["(.+)"\]\.(\w+)', path)
    return (m.group(1), m.group(2)) if m else (None, None)


# ---------------------------------------------------------------- load a source: rest pose, nose +X, one mesh
STORED = {}


def load(src, yaw=90.0):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, src + ".glb"))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    acts = {}
    for a in bpy.data.actions:
        short = a.name.split("|")[-1]
        if short not in acts or ("|" in a.name and "|" not in acts[short].name):
            acts[short] = a
    ad = arm.animation_data
    if ad:
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)
        ad.action = None
    # (the pose the glTF's nodes hold — not always its bind pose: a bone no clip keys stays in it)
    bpy.context.view_layer.update()
    STORED.clear()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        STORED[pb.name] = [pb.location.copy(), pb.rotation_quaternion.copy()]
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    R = Matrix.Rotation(math.radians(yaw), 4, "Z")
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("Icosphere")]
    root = next(b.name for b in arm.data.bones if b.parent is None)
    for m in meshes:
        mw = m.matrix_world.copy()
        if not m.vertex_groups:
            vg = m.vertex_groups.new(name=m.parent_bone if m.parent_type == "BONE" and m.parent_bone else root)
            vg.add(range(len(m.data.vertices)), 1.0, "REPLACE")
        m.parent = None
        for md in list(m.modifiers):
            m.modifiers.remove(md)
        m.data.transform(R @ mw)
        m.matrix_world = Matrix()
    M = R @ arm.matrix_world
    s = M.to_scale()[0]
    arm.parent = None
    arm.matrix_world = Matrix()
    mode(arm, "EDIT")
    for eb in arm.data.edit_bones:
        eb.transform(M)
    mode(arm, "OBJECT")
    for a in set(acts.values()):
        scale_loc(a, s)
    for v in STORED.values():
        v[0] = v[0] * s
    for o in list(bpy.data.objects):
        if o is not arm and o not in meshes:
            bpy.data.objects.remove(o)
    keep = set(acts.values())
    for a in list(bpy.data.actions):
        if a not in keep:
            bpy.data.actions.remove(a)
    main = max(meshes, key=lambda o: len(o.data.vertices))
    if len(meshes) > 1:
        bpy.context.view_layer.update()
        for x in bpy.context.scene.objects:
            x.select_set(x in meshes)
        bpy.context.view_layer.objects.active = main
        bpy.ops.object.join()
    arm.name = "Armature"
    arm.data.name = "Armature"
    return arm, main, acts


def mat_names(mo):
    return [m.name if m else "" for m in mo.data.materials]


def delete_faces(mo, pred, fill=True):
    """Faces dropped where pred(material name, centre, vertex-weight fn) — horns, an udder, a rabbit's whiskers."""
    me = mo.data
    names = mat_names(mo)
    gi = {g.index: g.name for g in mo.vertex_groups}
    vw = [{gi[g.group]: g.weight for g in v.groups} for v in me.vertices]
    bm = bmesh.new()
    bm.from_mesh(me)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()

        def w(pat, f=f):
            r = re.compile(pat)
            return sum(sum(x for k, x in vw[v.index].items() if r.fullmatch(k)) for v in f.verts) / len(f.verts)

        if pred(names[f.material_index] if names else "", c, w, f):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    if fill:
        # (the hole an udder or a horn leaves, closed: its rim's own colour and weights)
        bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
    bm.to_mesh(me)
    bm.free()


def merge_weights(mo, pat, to):
    """Every vertex group whose bone matches `pat` folded into `to`'s (its weight added there, the group emptied)."""
    groups = [g for g in mo.vertex_groups if re.fullmatch(pat, g.name)]
    if not groups:
        return
    dst = mo.vertex_groups.get(to) or mo.vertex_groups.new(name=to)
    idx = {g.index for g in groups}
    for v in mo.data.vertices:
        w = sum(g.weight for g in v.groups if g.group in idx)
        if w <= 0:
            continue
        have = next((g.weight for g in v.groups if g.group == dst.index), 0.0)
        dst.add([v.index], min(1.0, have + w), "REPLACE")
        for g in groups:
            g.remove([v.index])


def prune_bones(arm, mo, acts):
    """Bones that move nothing (IK poles, controls) and lead to nothing that does: gone, with their curves."""
    gi = {g.index: g.name for g in mo.vertex_groups}
    weighted = set()
    for v in mo.data.vertices:
        for g in v.groups:
            if g.weight > 1e-4:
                weighted.add(gi[g.group])
    keep = set()
    for b in arm.data.bones:
        if b.name in weighted:
            x = b
            while x:
                keep.add(x.name)
                x = x.parent
    mode(arm, "EDIT")
    for eb in list(arm.data.edit_bones):
        if eb.name not in keep:
            arm.data.edit_bones.remove(eb)
    mode(arm, "OBJECT")
    for g in list(mo.vertex_groups):
        if g.name not in keep:
            mo.vertex_groups.remove(g)
    for a in set(acts.values()):
        for cb in channelbags(a):
            for fc in list(cb.fcurves):
                b, _ = bone_of(fc.data_path)
                if b is not None and b not in keep:
                    cb.fcurves.remove(fc)


# ---------------------------------------------------------------- morph: bones moved, the mesh skinned along
def _rx(deg):
    """A rotation from world-axis Euler degrees (x, y, z), applied x then y then z."""
    from mathutils import Euler

    return Euler(tuple(math.radians(d) for d in deg), "XYZ").to_matrix()


def morph(arm, mo, acts, scale=None, stretch=None, rot=None, move=None, attach=None, locscale=None):
    """Each bone's own part of the mesh scaled about its head in world axes (`scale`), or along/across its own
    direction (`stretch`), turned (`rot`, inherited by its children), moved (`move`); a child's head follows its
    parent's transform. `attach` gives a root (a foot's IK bone) a parent for this. Skinned by the bone weights
    (linear blend), so the joins stay smooth; the bones keep their orientation (or turn with `rot`), so every
    clip's rotations still play."""
    bones = arm.data.bones
    names = [b.name for b in bones]
    H = {b.name: b.head_local.copy() for b in bones}
    par = {b.name: (attach or {}).get(b.name, b.parent.name if b.parent else None) for b in bones}
    kids = {n: [c for c in names if bones[c].parent and bones[c].parent.name == n] for n in names}

    def match(table, n):
        return [v for pat, v in (table or {}).items() if re.fullmatch(pat, n)]

    def direction(n):
        ks = [H[c] - H[n] for c in kids[n] if (H[c] - H[n]).length > 1e-6]
        if ks:
            d = sum(ks, Vector()) / len(ks)
        else:
            d = H[n] - H[par[n]] if par[n] else Vector((0, 0, 1))
        return d.normalized() if d.length > 1e-9 else Vector((0, 0, 1))

    S, Rr, D = {}, {}, {}
    for n in names:
        m = Matrix.Identity(3)
        for v in match(scale, n):
            m = Matrix.Diagonal(Vector(v) if not isinstance(v, (int, float)) else Vector((v, v, v))) @ m
        for along, across in match(stretch, n):
            d = direction(n)
            dd = Matrix([[d[i] * d[j] for j in range(3)] for i in range(3)])
            m = (Matrix.Identity(3) + dd * (along - 1) + (Matrix.Identity(3) - dd) * (across - 1)) @ m
        S[n] = m
        r = Matrix.Identity(3)
        for v in match(rot, n):
            r = _rx(v) @ r
        Rr[n] = r
        D[n] = sum((Vector(v) for v in match(move, n)), Vector())
    Mx, Rc = {}, {}

    def get(n):
        if n in Mx:
            return
        p = par[n]
        if p:
            get(p)
            base, rp = Mx[p] @ H[n], Rc[p]
        else:
            base, rp = H[n].copy(), Matrix.Identity(3)
        base = base + D[n]
        Rc[n] = rp @ Rr[n]
        Mx[n] = Matrix.Translation(base) @ (Rc[n] @ S[n]).to_4x4() @ Matrix.Translation(-H[n])

    for n in names:
        get(n)
    # the mesh, by linear blend skinning
    me = mo.data
    gi = {g.index: g.name for g in mo.vertex_groups}
    for v in me.vertices:
        acc, tw = Vector(), 0.0
        for g in v.groups:
            n = gi.get(g.group)
            if n in Mx and g.weight > 0:
                acc += (Mx[n] @ v.co) * g.weight
                tw += g.weight
        if tw > 0:
            v.co = acc / tw
    me.update()
    # the bones: heads moved, orientation turned by their inherited rotation
    mode(arm, "EDIT")
    for eb in arm.data.edit_bones:
        n = eb.name
        old = eb.matrix.copy()
        head = Mx[n] @ H[n]
        eb.matrix = Matrix.Translation(head) @ (Rc[n] @ old.to_3x3()).to_4x4()
    mode(arm, "OBJECT")
    for pat, k in (locscale or {}).items():
        for a in set(acts.values()):
            for fc in fcurves(a):
                b, prop = bone_of(fc.data_path)
                if b and prop == "location" and re.fullmatch(pat, b):
                    for kp in fc.keyframe_points:
                        kp.co.y *= k
                        kp.handle_left.y *= k
                        kp.handle_right.y *= k
                    fc.update()


def scale_all(arm, mo, acts, s, offset=Vector()):
    Mt = Matrix.Translation(offset) @ Matrix.Scale(s, 4)
    mo.data.transform(Mt)
    mode(arm, "EDIT")
    for eb in arm.data.edit_bones:
        eb.transform(Mt)
    mode(arm, "OBJECT")
    if abs(s - 1) > 1e-9:
        for a in set(acts.values()):
            scale_loc(a, s)


def coords(mo):
    n = len(mo.data.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    mo.data.vertices.foreach_get("co", a)
    return a.reshape(n, 3)


def group_weight(mo, pat):
    r = re.compile(pat)
    ids = {g.index for g in mo.vertex_groups if r.fullmatch(g.name)}
    w = np.zeros(len(mo.data.vertices))
    for v in mo.data.vertices:
        w[v.index] = sum(g.weight for g in v.groups if g.group in ids)
    return w


def measure(mo, how, pat=None):
    P = coords(mo)
    if how == "top":
        w = group_weight(mo, pat)
        return P[w >= 0.5][:, 2].max() - P[:, 2].min()
    if how == "height":
        return P[:, 2].max() - P[:, 2].min()
    if how == "length":
        return P[:, 0].max() - P[:, 0].min()
    raise ValueError(how)


# ---------------------------------------------------------------- the mesh made smooth
def finish_mesh(mo, budget, subdiv=True, merge=1e-4):
    me = mo.data
    P = coords(mo)
    size = float(np.linalg.norm(P.max(0) - P.min(0)))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge * size)
    bm.to_mesh(me)
    bm.free()
    activate(mo)
    if me.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for name in ("sharp_edge", "sharp_face"):
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
    me.shade_smooth()
    if subdiv:
        md = mo.modifiers.new("sub", "SUBSURF")
        md.levels = md.render_levels = 1
        md.uv_smooth = "PRESERVE_CORNERS"
        bpy.ops.object.modifier_apply(modifier=md.name)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > budget:
        md = mo.modifiers.new("dec", "DECIMATE")
        md.ratio = budget / tris * 0.97
        bpy.ops.object.modifier_apply(modifier=md.name)
    me.shade_smooth()
    # four bones a vertex at most, normalised (glTF's JOINTS_0)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


def tris_of(mo):
    return sum(len(p.vertices) - 2 for p in mo.data.polygons)


# ---------------------------------------------------------------- colour
def role_of(name):
    n = name.lower()
    if "eye" in n and "white" in n:
        return "eyewhite"
    if "eye" in n and "lighter" in n:
        return "eyering"
    if "eye" in n:
        return "eye"
    if "nose" in n:
        return "nose"
    if n == "black":
        return "black"
    if "muzzle" in n:
        return "muzzle"
    if "hoove" in n or "claw" in n:
        return "hoof"
    if "horn" in n:
        return "horn"
    if "hair" in n:
        return "mane"
    if "grey" in n:
        return "socks"
    if "light" in n or "belly" in n or "bottom" in n or "white" in n:
        return "light"
    if "dark" in n:
        return "dark"
    if "fin" in n:
        return "fins"
    return "coat"


FLAT = {"eye", "eyewhite", "eyering", "nose", "hoof", "horn", "antler", "black", "beak", "claw"}


def mat_colour(m):
    """A source material's colour (sRGB) and its image's pixels, if it has one."""
    col, img = (0.8, 0.8, 0.8), None
    if m and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                img = n.image
        for n in m.node_tree.nodes:
            if n.type in ("MIX", "MIX_RGB"):
                for i in n.inputs:
                    if i.name == "B" and i.enabled and hasattr(i.default_value, "__len__") and len(i.default_value) == 4:
                        col = to_srgb(i.default_value)
            elif n.type == "BSDF_PRINCIPLED" and not n.inputs["Base Color"].links:
                col = to_srgb(n.inputs["Base Color"].default_value)
    pix = None
    if img is not None:
        w, h = img.size
        a = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        pix = a.reshape(h, w, 4)
    return col, pix


class Px:
    """What a painter sees at one face corner."""

    def __init__(self, ctx):
        self.ctx = ctx

    def w(self, pat):
        ids = self.ctx.pat(pat)
        return sum(x for g, x in self.gw if g in ids)


class PaintCtx:
    def __init__(self, mo):
        self.mo = mo
        self.cache = {}

    def pat(self, p):
        if p not in self.cache:
            r = re.compile(p)
            self.cache[p] = {g.index for g in self.mo.vertex_groups if r.fullmatch(g.name)}
        return self.cache[p]


def paint(mo, spec):
    """COLOR_0: each corner's colour — its source material's role in this species' palette (or the source
    texture, read where the corner's UV lands), the species' own rules over it, then a countershade (lighter
    under, a little darker on top) and a soft painted variation."""
    me = mo.data
    roles_over = spec.get("roles", {})
    mats = []
    for m in me.materials:
        name = m.name if m else ""
        col, pix = mat_colour(m)
        mats.append((roles_over.get(name, "tex" if pix is not None else role_of(name)), col, pix))
    palette = spec.get("palette", {})
    fn = spec.get("paint")
    shade = spec.get("countershade", 1.0)
    vary = spec.get("vary", 0.06)
    P = coords(mo)
    lo, hi = P.min(0), P.max(0)
    ctx = PaintCtx(mo)
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    # the source texture's average (to read a texel as lighter/darker than its surround)
    tex_mean = {}
    for i, (role, col, pix) in enumerate(mats):
        if pix is not None:
            tex_mean[i] = max(1e-3, float(np.mean(pix[..., :3] @ np.array([0.2126, 0.7152, 0.0722]))))
    gw = [[(g.group, g.weight) for g in v.groups] for v in me.vertices]
    eyes = spec.get("_eyes")
    if fn and eyes is None:
        # the eyes' centres (each side), for masks and rings
        e = [(Vector(P[l.vertex_index]), mats[p.material_index][0]) for p in me.polygons for l in (me.loops[i] for i in p.loop_indices)]
        pts = [c for c, r in e if r in ("eye", "eyewhite")]
        if pts:
            L = [c for c in pts if c.y > 0]
            Rr = [c for c in pts if c.y <= 0]
            eyes = [sum(s, Vector()) / len(s) for s in (L, Rr) if s]
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    out = []
    v_px = Px(ctx)
    for poly in me.polygons:
        role, col, pix = mats[poly.material_index]
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            p = Vector(P[vi])
            n = me.vertices[vi].normal
            c = col
            v_px.role = role
            v_px.tex = None
            if pix is not None and uv is not None:
                u, vv = uv[li].uv
                h, w_ = pix.shape[:2]
                c = tuple(float(x) for x in pix[int(vv % 1 * h) % h, int(u % 1 * w_) % w_, :3])
                v_px.tex = lum(c) / tex_mean[poly.material_index]
            if role in palette:
                c = hexc(palette[role]) if isinstance(palette[role], str) else palette[role]
            v_px.p, v_px.n, v_px.gw = p, n, gw[vi]
            v_px.u = (p.x - lo[0]) / max(1e-9, hi[0] - lo[0])
            v_px.h = (p.z - lo[2]) / max(1e-9, hi[2] - lo[2])
            v_px.top = hi[2]
            v_px.eyes = eyes
            v_px.flat = role in FLAT
            if fn:
                c = fn(c, v_px)
            if not v_px.flat:
                k = spec.get("noise", 3.0) / max(1e-6, hi[2] - lo[2])
                c = mul(c, 1 + vary * noise.noise(p * k))
                if shade:
                    down, up = max(0.0, -n.z), max(0.0, n.z)
                    c = mix(c, mix(c, (1, 1, 1), 0.18), down * 0.55 * shade)
                    c = mul(c, 1 - 0.10 * up * shade)
            out.append(c)
    for i, c in enumerate(out):
        attr.data[i].color_srgb = (c[0], c[1], c[2], 1.0)
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find("Col")
    # one material, white: the colour is the vertices'
    for a in list(me.color_attributes):
        if a.name != "Col":
            me.color_attributes.remove(a)
    mat = bpy.data.materials.new("animal")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.85
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.material_index = 0
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])


# ---------------------------------------------------------------- posing (for the clips we make)
class Rig:
    def __init__(self, arm, mo, acts):
        self.arm, self.mo, self.acts = arm, mo, acts
        bones = arm.data.bones
        order = []

        def walk(b):
            order.append(b.name)
            for c in b.children:
                walk(c)

        for b in bones:
            if b.parent is None:
                walk(b)
        self.order = order
        self.cache = {}
        self.spec = {}
        self.stored = dict(STORED)
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.parent = {b.name: b.parent.name if b.parent else None for b in bones}
        self.R3 = {n: m.to_3x3().normalized() for n, m in self.rest.items()}
        self.V = coords(mo)
        gi = {g.index: g.name for g in mo.vertex_groups}
        idx = {n: i for i, n in enumerate(order)}
        self.W = np.zeros((len(self.V), len(order)))
        for v in mo.data.vertices:
            for g in v.groups:
                n = gi.get(g.group)
                if n in idx:
                    self.W[v.index, idx[n]] += g.weight
        s = self.W.sum(1, keepdims=True)
        self.W = np.where(s > 0, self.W / np.maximum(s, 1e-9), 0)
        P = self.V
        self.size = float(P[:, 2].max() - P[:, 2].min())
        self.length = float(P[:, 0].max() - P[:, 0].min())

    def has(self, n):
        return n in self.rest

    def blank(self):
        return {n: [Vector(), Quaternion()] for n in self.order}

    @staticmethod
    def copy(pose):
        return {n: [l.copy(), q.copy()] for n, (l, q) in pose.items()}

    def rot(self, pose, n, axis, deg):
        """Turn bone n by deg about a world axis (as the axis sits at rest), after its clip's own turn."""
        if n not in pose:
            return
        ax = self.R3[n].inverted() @ Vector(axis)
        pose[n][1] = pose[n][1] @ Quaternion(ax.normalized(), math.radians(deg))

    def fk(self, pose):
        P = {}
        for n in self.order:
            l, q = pose.get(n, (Vector(), Quaternion()))
            L = Matrix.Translation(l) @ q.to_matrix().to_4x4()
            p = self.parent[n]
            P[n] = (P[p] @ self.rest[p].inverted() @ self.rest[n] @ L) if p else self.rest[n] @ L
        return P

    def skin(self, pose):
        P = self.fk(pose)
        K = np.array([np.array(P[n] @ self.rest[n].inverted()) for n in self.order])  # (B,4,4)
        V4 = np.c_[self.V, np.ones(len(self.V))]
        T = np.einsum("bij,nj->nbi", K, V4)[..., :3]  # (N,B,3)
        out = np.einsum("nb,nbi->ni", self.W, T)
        unweighted = self.W.sum(1) == 0
        out[unweighted] = self.V[unweighted]
        return out

    def shift(self, pose, vec, bones=None):
        """Every root (or the bones given) moved by a world vector."""
        for n in bones or [n for n in self.order if self.parent[n] is None]:
            pose[n][0] = pose[n][0] + self.R3[n].inverted() @ Vector(vec)

    def ground(self, pose, z=0.0):
        pts = self.skin(pose)
        self.shift(pose, (0, 0, z - pts[:, 2].min()))

    def attach(self, pose, pairs):
        """Feet on IK roots carried by their legs' lower bones (as though the leg held them)."""
        P = self.fk(pose)
        for ik, leg in pairs:
            if ik not in P or leg not in P:
                continue
            target = P[leg] @ self.rest[leg].inverted() @ self.rest[ik]
            p = self.parent[ik]
            local = (self.rest[ik].inverted() @ target) if p is None else (
                (self.rest[p].inverted() @ self.rest[ik]).inverted() @ P[p].inverted() @ target)
            pose[ik] = [local.to_translation(), local.to_quaternion()]

    # clips
    def sample(self, act, f0=None, f1=None, step=1.0):
        """Its poses frame by frame (or `step` frames apart: a clip keyed quicker than 24 a second, plan 129)."""
        curves = {}
        for fc in fcurves(act):
            b, prop = bone_of(fc.data_path)
            if b in self.rest and prop in ("location", "rotation_quaternion"):
                curves[(b, prop, fc.array_index)] = fc
        if step != 1.0:
            a0, a1 = act.frame_range
            fs = [a0 + i * step for i in range(int(round((a1 - a0) / step)) + 1)]
        else:
            a0, a1 = (int(round(x)) for x in act.frame_range)
            fs = range(a0 if f0 is None else f0, (a1 if f1 is None else f1) + 1)
        frames = []
        for f in fs:
            pose = self.blank()
            for n, (l, q) in self.stored.items():
                if n in pose:
                    pose[n] = [l.copy(), q.copy()]
            for (b, prop, i), fc in curves.items():
                v = fc.evaluate(f)
                if prop == "location":
                    pose[b][0][i] = v
                else:
                    pose[b][1][i] = v
            for n in pose:
                pose[n][1].normalize()
            frames.append(pose)
        return frames


def lerp_pose(a, b, t):
    return {n: [a[n][0].lerp(b[n][0], t), a[n][1].slerp(b[n][1], t)] for n in a}


def retime(frames, k):
    """Played k times as fast (resampled at 24 fps)."""
    n = len(frames)
    m = max(2, int(round((n - 1) / k)) + 1)
    out = []
    for j in range(m):
        t = j * (n - 1) / (m - 1)
        i = min(int(t), n - 2)
        out.append(lerp_pose(frames[i], frames[i + 1], t - i))
    return out


def ease(t):
    return t * t * (3 - 2 * t)


def _thin(vals, err, tol):
    """The frames a curve needs for linear interpolation to stay within tol of every frame (greedy)."""
    n = len(vals)
    keep = [0]
    i = 0
    while i < n - 1:
        j = i + 2
        while j < n and all(err(vals[k], vals[i], vals[j], (k - i) / (j - i)) <= tol for k in range(i + 1, j)):
            j += 1
        keep.append(j - 1)
        i = j - 1
    return keep


def moving(frames, size):
    """The bones a clip moves off their rest: (location bones, rotation bones)."""
    ltol, qtol = 0.001 * size, math.radians(0.15)
    locs = {b for b in frames[0] if any(f[b][0].length > ltol for f in frames)}
    rots = {b for b in frames[0] if any(f[b][1].rotation_difference(Quaternion()).angle > qtol for f in frames)}
    return locs, rots


def write_action(arm, name, frames, size=1.0, all_locs=(), all_rots=(), step=1.0):
    """A clip from per-frame poses: a channel only where the bone leaves its rest, and only the keys linear
    interpolation needs (0.15 degrees, 0.1 % of the body). `step`: the frames (of 24 a second) between poses — under 1
    for a clip keyed quicker (a gait's, plan 129)."""
    act = bpy.data.actions.new(name)
    slot = act.slots.new(id_type="OBJECT", name=arm.name)
    layer = act.layers.new("Layer")
    strip = layer.strips.new(type="KEYFRAME")
    cb = strip.channelbag(slot, ensure=True)
    n = len(frames)
    ltol = 0.001 * size
    qtol = math.radians(0.15)

    def lerr(v, a, b, t):
        return (v - a.lerp(b, t)).length

    def qerr(v, a, b, t):
        return v.rotation_difference(a.slerp(b, t)).angle

    def put(path, i, group, keys, vals):
        fc = cb.fcurves.new(path, index=i, group_name=group)
        fc.keyframe_points.add(len(keys))
        fc.keyframe_points.foreach_set("co", [x for f in keys for x in (f * step, vals[f][i])])
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"

    for b in frames[0]:
        locs = [f[b][0] for f in frames]
        if b in all_locs or any(l.length > ltol for l in locs):
            keys = _thin(locs, lerr, ltol * 0.5)
            for i in range(3):
                put(f'pose.bones["{b}"].location', i, b, keys, locs)
        prev = None
        qs = []
        for f in frames:  # (one hemisphere: no flips between keys)
            q = f[b][1].copy()
            if prev is not None and prev.dot(q) < 0:
                q.negate()
            qs.append(q)
            prev = q
        if b in all_rots or any(q.rotation_difference(Quaternion()).angle > qtol for q in qs):
            keys = _thin(qs, qerr, qtol)
            for i in range(4):
                put(f'pose.bones["{b}"].rotation_quaternion', i, b, keys, qs)
    act.use_fake_user = True
    act.frame_range = (0, (n - 1) * step)
    act.use_frame_range = True
    return act


# ---------------------------------------------------------------- the four-legged (Quaternius "Ultimate" rigs)
U_FEET = [("IKFrontLeg.L", "FrontLowerLeg.L"), ("IKFrontLeg.R", "FrontLowerLeg.R"),
          ("IKBackLeg.L", "BackLowerLeg.L"), ("IKBackLeg.R", "BackLowerLeg.R")]  # fmt: skip
U_ATTACH = dict(U_FEET)
U_TORSO = r"Body|Back|Torso\d?"
U_LEGS = r"(Front|Back)(UpperLeg|LowerLeg|Leg)\.[LR]"


def u_source(R, *names):
    for n in names:
        if n in R.acts:
            return R.sample(R.acts[n])
    return None


def _G():
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import gaits as G

    return G


def _fold(R, p, P0, k, ground, at_x, flat=0.0):
    """One leg folded flat on the ground: its middle joint (a hind leg's hock, a fore leg's elbow) put down at `at_x`
    (on the ground), its last bone laid along the ground forward of it to the paw — the upper bones solved to the
    joint, the last aimed at the paw."""
    G = _G()
    chain, last, foot = G.U_LEGS[k]
    seg = (G.foot_point(R, P0, last, foot) - P0[chain[2]].to_translation()).length
    P = R.fk(p)
    y = P[chain[2]].to_translation().y
    J = Vector((at_x, y, ground))
    G.solve_leg(R, p, chain[:2], chain[1], chain[2], J, iters=80)
    th = math.radians(flat)
    F = J + Vector((math.cos(th), 0.0, -math.sin(th))) * seg
    G.solve_leg(R, p, [chain[2]], chain[2], foot, F, iters=40)


def _belly_down(R, p, floor, keep, tip=True):
    """The body let down (its legs and tail aside) till its lowest is on the ground (`floor`), its hips no lower than
    `keep`; with `tip`, its fore end tipped down about the hips till the chest is down too — the rump let down again
    after each tip (a tip lifts it), so both ends lie."""
    G = _G()
    body = G.body_verts(R)
    if body is None:
        return

    def settle():
        pts = R.skin(p)[body]
        hipz = R.fk(p)["BackLeg.L"].to_translation().z
        d = min(float(pts[:, 2].min()) - floor - 0.004 * R.size, hipz - keep)
        if d > 0:
            R.shift(p, (0, 0, -d))
        return R.skin(p)[body]

    pts = settle()
    if not tip:
        return
    # (the chest: its lowest ahead of the hips, brought down by a turn of the spine at its root)
    for _ in range(16):
        hipx = R.fk(p)["BackLeg.L"].to_translation().x
        front = pts[pts[:, 0] > hipx + 0.25 * (pts[:, 0].max() - hipx)]
        if not len(front) or float(front[:, 2].min()) - floor < 0.015 * R.size:
            break
        R.rot(p, "Back", Y, 2.0)
        R.rot(p, "Neck1", Y, -2.0)
        pts = settle()


def paw_lie(R, base, spec):
    """Lying down (a dog's, a cat's, a bear's: sternal), from targets — the wolf's fixed angles on a reshaped body
    put its hind legs up behind its rump: the body down, each hind hock on the ground beside the hip with its sole
    flat forward to the paw, the fore legs flat out in front (elbow down under the shoulder, forearm forward); the
    head up; a slow breath."""
    G = _G()
    lie = spec.get("lie", {})
    p = R.copy(base)
    P0 = R.fk(base)
    feet = {k: P0[f].to_translation() for k, (_, _, f) in G.U_LEGS.items()}
    hip = P0["BackLeg.L"].to_translation()
    L = hip.z - feet["HL"].z
    # (down till its belly's on the ground — its chest too: the fore end let down to it — and no lower than a fifth
    # of its leg at the hip)
    R.shift(p, (0, 0, -(hip.z - (feet["HL"].z + 0.42 * L))))
    _belly_down(R, p, floor=float(R.skin(base)[:, 2].min()), keep=feet["HL"].z + 0.2 * L)
    for s, sign in (("L", 1), ("R", -1)):
        R.rot(p, f"BackLeg.{s}", X, lie.get("splay", 14) * sign)
        R.rot(p, f"FrontShoulder.{s}", X, 4 * sign)
    P = R.fk(p)
    for k in G.U_LEGS:
        chain = G.U_LEGS[k][0]
        top = P[chain[1]].to_translation()
        g = feet[k].z + 0.02 * L
        if k[0] == "H" and lie.get("hind") == "stretch":
            # (a bear's: its hind legs stretched out behind it along the ground — a thigh that big folded beside the
            # belly pinches its skin into spikes)
            chain, last, foot = G.U_LEGS[k]
            hip_k = P[chain[0]].to_translation()
            reach = sum((P0[b].to_translation() - P0[a].to_translation()).length for a, b in zip(chain, chain[1:]))
            reach += (G.foot_point(R, P0, last, foot) - P0[last].to_translation()).length
            dz = hip_k.z - g
            dx = math.sqrt(max(0.0, (0.9 * reach) ** 2 - dz * dz))
            G.solve_leg(R, p, chain, last, foot, Vector((hip_k.x - dx, P[foot].to_translation().y, g)), iters=80)
        elif k[0] == "H":
            # (the hock that far behind the knee: a big thigh folded too tight pinches its skin)
            _fold(R, p, P0, k, g, top.x - lie.get("hock", 0.12) * L)
        else:
            _fold(R, p, P0, k, g, top.x - 0.02 * L)
    R.rot(p, "Neck1", Y, lie.get("neck", -8))
    R.attach(p, U_FEET)
    for ik, _ in U_FEET:
        p[ik][1] = base[ik][1].copy()
    R.ground(p)
    return breathe(R, p, ["Torso2", "Torso"], 2.0, 72, head=("Head", 4))


def paw_sit(R, base, spec):
    """Sitting (a dog's, a cat's, a bear's), from targets: the body tipped up about the hips (less, where the fore
    legs wouldn't reach the ground), the rump down, each hind hock on the ground under it with its sole flat forward
    to the paw, the fore legs upright to the ground under the shoulders, the head kept level."""
    G = _G()
    sit = spec.get("sit_pose", {})
    P0 = R.fk(base)
    feet = {k: P0[f].to_translation() for k, (_, _, f) in G.U_LEGS.items()}
    L = P0["BackLeg.L"].to_translation().z - feet["HL"].z
    chain, last, foot = G.U_LEGS["FL"]
    fore = sum((P0[b].to_translation() - P0[a].to_translation()).length for a, b in zip(chain, chain[1:]))
    fore += (G.foot_point(R, P0, last, foot) - P0[last].to_translation()).length
    th0 = sit.get("pitch", -40)
    for th in [th0 * f for f in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5)]:
        p = R.copy(base)
        R.rot(p, "Back", Y, th)
        P = R.fk(p)
        hip = P["BackLeg.L"].to_translation()
        R.shift(p, (0, 0, -(hip.z - (feet["HL"].z + 0.36 * L))))
        # (the rump on the ground)
        _belly_down(R, p, floor=float(R.skin(base)[:, 2].min()), keep=feet["HL"].z + 0.15 * L, tip=False)
        P = R.fk(p)
        sh = P[chain[0]].to_translation()
        if sh.z - feet["FL"].z <= 0.96 * fore:
            break
    P = R.fk(p)
    for k, (chain_k, last_k, foot_k) in G.U_LEGS.items():
        if k[0] == "H":
            top = P[chain_k[0]].to_translation()
            _fold(R, p, P0, k, feet[k].z + 0.02 * L, top.x - sit.get("hock", 0.08) * L)
        else:
            sh = P[chain_k[0]].to_translation()
            G.solve_leg(R, p, chain_k, last_k, foot_k, Vector((sh.x + 0.04 * L, feet[k].y, feet[k].z)), iters=80)
    R.rot(p, "Neck1", Y, -th * 0.45)
    R.rot(p, "Neck3", Y, -th * 0.3)
    R.rot(p, "Tail1", Y, -th * 0.9)
    R.attach(p, U_FEET)
    for ik, _ in U_FEET:
        p[ik][1] = base[ik][1].copy()
    R.ground(p)
    return breathe(R, p, ["Torso2"], 1.5, 72, head=("Head", 5))


def u_lie(R, base, spec):
    """Lying down, resting (sternal): the front legs folded under the chest (knee forward, cannon tucked back),
    the hind legs folded beside the belly (stifle forward, hock back, cannon forward on the ground); the head
    up; a slow breath."""
    p = R.copy(base)
    lie = spec.get("lie", {})
    fu, fl = lie.get("front", (-75, 165))
    femur, tibia, cannon = lie.get("back", (-40, 65, -115))
    for s, sign in (("L", 1), ("R", -1)):
        R.rot(p, f"FrontUpperLeg.{s}", Y, fu)
        R.rot(p, f"FrontLowerLeg.{s}", Y, fl)
        R.rot(p, f"BackLeg.{s}", Y, femur)
        R.rot(p, f"BackLeg.{s}", X, lie.get("splay", 14) * sign)
        R.rot(p, f"BackUpperLeg.{s}", Y, tibia)
        R.rot(p, f"BackLowerLeg.{s}", Y, cannon)
        R.rot(p, f"FrontShoulder.{s}", X, 4 * sign)
    R.rot(p, "Neck1", Y, lie.get("neck", -8))
    R.attach(p, U_FEET)
    R.ground(p)
    return breathe(R, p, ["Torso2", "Torso"], 2.0, 72, head=("Head", 4))


def u_sit(R, base, spec):
    """Sitting (a dog's, a cat's): the body tipped up about the hips, the front legs upright, the hind legs
    folded under (stifle forward, hock back, paw flat), the head kept level."""
    p = R.copy(base)
    sit = spec.get("sit_pose", {})
    th = sit.get("pitch", -40)
    femur, tibia, cannon = sit.get("back", (-45, 95, -45))
    R.rot(p, "Back", Y, th)
    for s in "LR":
        R.rot(p, f"FrontShoulder.{s}", Y, -th * 0.55)
        R.rot(p, f"FrontUpperLeg.{s}", Y, -th * 0.45)
        R.rot(p, f"BackLeg.{s}", Y, femur)
        R.rot(p, f"BackUpperLeg.{s}", Y, tibia)
        R.rot(p, f"BackLowerLeg.{s}", Y, cannon)
    R.rot(p, "Neck1", Y, -th * 0.45)
    R.rot(p, "Neck3", Y, -th * 0.3)
    R.rot(p, "Tail1", Y, -th * 0.9)
    R.attach(p, U_FEET)
    R.ground(p)
    return breathe(R, p, ["Torso2"], 1.5, 72, head=("Head", 5))


def breathe(R, p, bones, deg, n, head=None):
    out = []
    for f in range(n):
        q = R.copy(p)
        s = math.sin(2 * math.pi * f / n)
        for b in bones:
            R.rot(q, b, Y, -deg * 0.5 * s)
        if head:
            R.rot(q, head[0], Z, head[1] * math.sin(2 * math.pi * f / n + 1.0))
        out.append(q)
    out.append(R.copy(out[0]))
    return out


def u_swim(R, walk):
    frames = retime(walk, 0.7)
    for p in frames:
        R.rot(p, "Neck1", Y, -18)
        R.rot(p, "Head", Y, -10)
    return frames


# ---------------------------------------------------------------- the day's own (docs/plan/128-animal-minds.md, F11b)
# Made from the rest pose where the packs hadn't them: a drink at the water, a sniff along the ground, a groom of the
# flank, the young's play bow, a howl (a wolf's; the others' own call), the alarm's stamp. Negative Y is the neck up.
def u_drink(R, base, n=48):
    """Head down to the water, the front legs a little apart, lapping."""
    out = []
    for f in range(n + 1):
        t = f / n
        q = R.copy(base)
        R.rot(q, "Neck1", Y, 38)
        R.rot(q, "Neck2", Y, 10)
        R.rot(q, "Head", Y, 22 + 5 * math.sin(2 * math.pi * t * 6))
        for s_, sg in (("L", 1), ("R", -1)):
            R.rot(q, f"FrontUpperLeg.{s_}", X, 6 * sg)
        R.attach(q, U_FEET)
        R.ground(q)
        out.append(q)
    return out


def u_sniff(R, base, n=60):
    """Nose down along the ground, side to side, a nod now and then."""
    out = []
    for f in range(n + 1):
        t = f / n
        q = R.copy(base)
        R.rot(q, "Neck1", Y, 26 + 4 * math.sin(2 * math.pi * t * 3))
        R.rot(q, "Head", Y, 14)
        R.rot(q, "Neck1", Z, 16 * math.sin(2 * math.pi * t))
        R.rot(q, "Head", Z, 10 * math.sin(2 * math.pi * t + 0.6))
        R.attach(q, U_FEET)
        R.ground(q)
        out.append(q)
    return out


def u_groom(R, base, n=72):
    """Round to its flank, a lick, a nibble; and back."""
    out = []
    for f in range(n + 1):
        t = f / n
        k = ease(min(1, t * 4)) if t < 0.75 else ease(max(0, (1 - t) * 4))
        q = R.copy(base)
        R.rot(q, "Neck1", Z, 48 * k)
        R.rot(q, "Neck2", Z, 26 * k)
        R.rot(q, "Neck3", Z, 16 * k)
        R.rot(q, "Head", Y, (18 + 6 * math.sin(2 * math.pi * t * 7)) * k)
        R.rot(q, "Torso", Z, -8 * k)
        R.attach(q, U_FEET)
        R.ground(q)
        out.append(q)
    return out


def u_play(R, base, n=36):
    """The play bow: the front down, the rear up, the tail going; up and down again."""
    out = []
    for f in range(n + 1):
        t = f / n
        k = 0.65 + 0.35 * math.sin(2 * math.pi * t)
        q = R.copy(base)
        # (the chest down onto the elbows, the rear left standing — its feet kept where they are)
        R.rot(q, "Torso", Y, 10 * k)
        for s_ in "LR":
            R.rot(q, f"FrontShoulder.{s_}", Y, 18 * k)
            R.rot(q, f"FrontUpperLeg.{s_}", Y, -30 * k)
            R.rot(q, f"FrontLowerLeg.{s_}", Y, 28 * k)
        R.rot(q, "Neck1", Y, -20 * k)
        for i, tb in enumerate(("Tail1", "Tail2", "Tail3")):
            R.rot(q, tb, Z, 28 * math.sin(2 * math.pi * t * 4 + i * 0.6))
        R.attach(q, U_FEET)
        R.ground(q)
        out.append(q)
    return out


def u_howl(R, base, n=96):
    """Head up to the sky, held, a tremble in it; down again."""
    out = []
    for f in range(n + 1):
        t = f / n
        k = ease(min(1, t * 5)) if t < 0.8 else ease(max(0, (1 - t) * 5))
        q = R.copy(base)
        R.rot(q, "Neck1", Y, -30 * k)
        R.rot(q, "Neck2", Y, -16 * k)
        R.rot(q, "Neck3", Y, -12 * k)
        R.rot(q, "Head", Y, (-34 + 1.5 * math.sin(2 * math.pi * t * 11)) * k)
        R.rot(q, "Back", Y, -6 * k)
        R.attach(q, U_FEET)
        R.ground(q)
        out.append(q)
    return out


def u_stamp(R, base, n=18):
    """The alarm: head up, a fore hoof lifted and brought down hard (played once)."""
    out = []
    for f in range(n + 1):
        t = f / n
        lift = math.sin(math.pi * min(1, t * 1.5))
        q = R.copy(base)
        R.rot(q, "Neck1", Y, -18 * min(1, t * 3))
        R.rot(q, "Head", Y, -10 * min(1, t * 3))
        R.rot(q, "FrontUpperLeg.R", Y, -26 * lift)
        R.rot(q, "FrontLowerLeg.R", Y, 34 * lift)
        # (every foot follows its leg — the lifted one too: the IK bone is the foot)
        R.attach(q, U_FEET)
        R.ground(q)
        out.append(q)
    return out


def u_gaits(R, c, base):
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import gaits as G

    sp = G.game_speeds().get(G.species_of(getattr(R, "name", "")))
    if not sp or not c.get("walk"):
        return
    walk_src, run_src = c["walk"], c.get("run") or c["walk"]
    info = {}
    for clip, kind, src in (
        ("walk", "walk", walk_src),
        ("trot", "trot", walk_src),
        ("run", G.RUN_GAIT.get(G.species_of(R.name), "gallop"), run_src),
    ):
        frames, meta = G.gait_clip(R, base, kind, sp[clip], src=src)
        for q in frames:
            R.attach(q, U_FEET)
            # (each foot kept level as it stood — carried by its leg it'd tip, its toe through the ground)
            for ik, _ in U_FEET:
                if ik in q and ik in base:
                    q[ik][1] = base[ik][1].copy()
        c[clip] = frames
        info[clip] = {**meta, "gait": kind}
    R.gaits = info
    print(f"[gaits] {R.name}: " + ", ".join(f"{k} {v['gait']} {v['speed']} m/s cycle {v['cycle']} s stance {v["stance"]} m fps {v["fps"]} drop {v["drop"]} miss {v["miss"]}" for k, v in info.items()))


def two_gaits(R, c, base, fam):
    """A bird's walk and run (or hop), a hare's or a frog's hop, made at the game's speeds (plan 129)."""
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import gaits as G

    sp = G.game_speeds().get(G.species_of(getattr(R, "name", "")))
    if not sp:
        return
    legs = G.B_LEGS if fam == "B" else G.R_LEGS
    if any(not R.has(b) for k in legs for b in legs[k][0]):
        return
    sp_name = G.species_of(R.name)
    plan = (
        [("walk", "hop" if sp_name in G.HOPPERS else "bwalk", sp["walk"]), ("run", "hop" if sp_name in G.HOPPERS else "bwalk", sp["run"])]
        if fam == "B"
        else [("walk", "hare", sp["walk"]), ("trot", "hare", sp["trot"]), ("run", "hare", sp["run"])]
    )
    info = {}
    for clip, kind, v in plan:
        frames, meta = G.gait_clip(R, base, kind, v, src=c.get(clip) or c.get("walk"), legs=legs)
        c[clip] = frames
        info[clip] = {**meta, "gait": kind}
    R.gaits = info
    print(f"[gaits] {R.name}: " + ", ".join(f"{k} {v['gait']} {v['speed']} m/s cycle {v["cycle"]} s stance {v["stance"]} fps {v["fps"]} drop {v["drop"]} miss {v["miss"]}" for k, v in info.items()))


def clips_U(R, spec):
    c = {}
    c["idle"] = u_source(R, "Idle")
    c["idle2"] = u_source(R, "Idle_2")
    c["look"] = u_source(R, "Idle_Headlow", "Idle_2_HeadLow")
    c["eat"] = u_source(R, "Eating")
    c["walk"] = u_source(R, "Walk")
    c["run"] = u_source(R, "Gallop")
    c["jump"] = u_source(R, "Gallop_Jump")
    c["attack"] = u_source(R, "Attack", "Attack_Headbutt")
    c["kick"] = u_source(R, "Attack_Kick")
    c["hitL"] = u_source(R, "Idle_HitReact_Left")
    c["hitR"] = u_source(R, "Idle_HitReact_Right", "Idle_HitReact_Left")
    c["die"] = u_source(R, "Death")
    if c["walk"]:
        c["trot"] = retime(c["walk"], spec.get("trot", 1.55))
    base = c["idle"][0]
    # (the wolf's and the fox's rigs — a dog's, a cat's, a bear's legs —: lying and sitting from targets; the hoofed
    # fold their legs as their own angles have them)
    paws = spec.get("src") in ("wolf_b", "fox")
    c["lie"] = (paw_lie if paws else u_lie)(R, base, spec)
    if spec.get("sit"):
        c["sit"] = (paw_sit if paws else u_sit)(R, base, spec)
    if spec.get("swim") and c["walk"]:
        c["swim"] = u_swim(R, c["walk"])
    # (plan 129 F4a/F5: the walk, a real trot, the run — each its gait, made at the game's own speed for it, the feet
    # planted; the body's motion the source's own)
    u_gaits(R, c, base)
    # (plan 128 F11b: the day's own)
    c["drink"] = u_drink(R, base)
    c["sniff"] = u_sniff(R, base)
    c["groom"] = u_groom(R, base)
    c["play"] = u_play(R, base)
    c["howl"] = u_howl(R, base)
    c["stamp"] = u_stamp(R, base)
    # (a bear's, a beaver's hind feet: heel down, under the hip — the wolf's rig stands on its toes)
    if spec.get("plant"):
        if HERE not in sys.path:
            sys.path.insert(0, HERE)
        import gaits as G

        G.plantigrade(R, c, base, **spec["plant"])
    for k in spec.get("drop", ()):
        c[k] = None
    return c


# ---------------------------------------------------------------- birds (the hawk's metarig)
B_WINGS = {"L": ["Wing.L", "Wing.001.L", "Wing.002.L"], "R": ["Wing.R", "Wing.001.R", "Wing.002.R"]}


def wing_dihedral(R, side):
    """How far the wing's mesh rises from its shoulder (radians): its hand's vertices against the joint."""
    key = ("dihedral", side)
    if key not in R.cache:
        idx = [i for i, n in enumerate(R.order) if re.fullmatch(rf"Wing\.002\.{side}|w_feather\.00[12]\.{side}", n)]
        w = R.W[:, idx].sum(1)
        m = R.V[w > 0.5].mean(0)
        sh = R.rest[f"Wing.{side}"].to_translation()
        R.cache[key] = math.atan2(m[2] - sh.z, abs(m[1] - sh.y))
    return R.cache[key]


def b_fold(R, p, k=1.0, spec=None):
    """Wings folded on the back: the wing first brought level (the mesh's dihedral taken out), then in its own
    plane the shoulder sweeps it back, the elbow brings the forearm forward, the wrist takes the hand back;
    then the folded wing is laid along the body's slope (droop) and tented, its leading edge down the flank and
    its feathers over the back. k=0 leaves them; a negative k opens them a little (a flinch)."""
    spec = spec or R.spec
    f = spec.get("fold", {})
    pitch = spec.get("morph", {}).get("rot", {}).get(r"spine\.003", (0, 0, 0))[1]
    sweep, roll, feathers = f.get("sweep", 105), f.get("roll", 0), f.get("feathers", 85)
    droop = f.get("droop", -(50 - pitch) * 0.85)
    elbow, wrist = f.get("elbow", 15), f.get("wrist", 15)
    for s, sg in (("L", 1), ("R", -1)):
        a, b, c = B_WINGS[s]
        d = wing_dihedral(R, s)
        n0 = Vector((0, -sg * math.sin(d), math.cos(d)))  # (the raised wing's plane normal)
        # the span once swept and laid along the body: the axis it is rolled about
        span = Vector((0, sg, 0))
        span.rotate(Quaternion(Z, math.radians(sg * sweep)))
        span.rotate(Quaternion(Y, math.radians(droop)))
        # (the first turn given is applied last)
        R.rot(p, a, span, sg * roll * k)
        R.rot(p, a, Y, droop * k)
        R.rot(p, a, Z, sg * sweep * k)
        R.rot(p, a, X, -sg * math.degrees(d) * k)
        R.rot(p, b, n0, -sg * elbow * k)
        R.rot(p, c, n0, sg * wrist * k)
        # (the feathers slid back along the arm, as a folding wing stacks them: the wing made narrow)
        for i in range(1, 5):
            R.rot(p, f"w_feather.00{i}.{s}", n0, -sg * feathers * k)
    return p


def b_base(R, spec):
    p = R.blank()
    b_fold(R, p, 1.0, spec)
    R.ground(p)
    return p


def b_idle(R, base, n=72, head=8):
    out = []
    for f in range(n):
        q = R.copy(base)
        s = math.sin(2 * math.pi * f / n)
        R.rot(q, "spine.005", Y, -1.2 * s)
        R.rot(q, "head", Z, head * math.sin(2 * math.pi * f / n * 2 + 0.5))
        out.append(q)
    out.append(R.copy(out[0]))
    return out


def b_look(R, base, deg=60, n=96):
    out = []
    keys = [(0, 0), (0.12, 0), (0.3, deg), (0.5, deg), (0.62, -deg * 0.8), (0.82, -deg * 0.8), (1.0, 0)]
    for f in range(n + 1):
        t = f / n
        for (t0, a0), (t1, a1) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                a = a0 + (a1 - a0) * ease((t - t0) / max(1e-9, t1 - t0))
                break
        q = R.copy(base)
        R.rot(q, "neck.002", Z, a * 0.35)
        R.rot(q, "head", Z, a * 0.65)
        out.append(q)
    return out


def b_peck(R, base, n=36, depth=1.0):
    out = []
    for f in range(n + 1):
        t = f / n
        d = max(0.0, math.sin(2 * math.pi * t * 2)) ** 0.7 * depth
        q = R.copy(base)
        R.rot(q, "spine.005", Y, 25 * d)
        R.rot(q, "neck.001", Y, 45 * d)
        R.rot(q, "neck.002", Y, 25 * d)
        R.rot(q, "head", Y, 15 * d)
        for s in "LR":
            R.rot(q, f"thigh.{s}", Y, -25 * d)
        out.append(q)
    return out


def b_walk(R, base, n=20, swing=28, roll=4, bob=0.04, headbob=True):
    out = []
    for f in range(n + 1):
        t = f / n
        q = R.copy(base)
        for s, ph in (("L", 0.0), ("R", 0.5)):
            a = math.sin(2 * math.pi * (t + ph))
            lift = max(0.0, math.sin(2 * math.pi * (t + ph + 0.25)))
            R.rot(q, f"thigh.{s}", Y, -swing * a)
            R.rot(q, f"shin.{s}", Y, -20 * lift)
            R.rot(q, f"foot.{s}", Y, 30 * lift)
        R.rot(q, "spine.003", X, roll * math.sin(2 * math.pi * t))
        R.shift(q, (0, 0, bob * R.size * abs(math.sin(2 * math.pi * t))), ["spine.003"])
        if headbob:
            R.rot(q, "neck.001", Y, 8 * math.sin(4 * math.pi * t))
        out.append(q)
    return out


def b_tuck(R, q):
    for s in "LR":
        R.rot(q, f"thigh.{s}", Y, 70)
        R.rot(q, f"shin.{s}", Y, -110)
        R.rot(q, f"foot.{s}", Y, 60)


def b_lie(R, base):
    p = R.copy(base)
    for s in "LR":
        R.rot(p, f"thigh.{s}", Y, -55)
        R.rot(p, f"shin.{s}", Y, 120)
        R.rot(p, f"foot.{s}", Y, -50)
    R.ground(p)
    return breathe(R, p, ["spine.005"], 2.0, 72, head=("head", 10))


def b_swim(R, base, n=24):
    out = []
    for f in range(n + 1):
        t = f / n
        q = R.copy(base)
        for s, ph in (("L", 0.0), ("R", 0.5)):
            R.rot(q, f"thigh.{s}", Y, 60 + 20 * math.sin(2 * math.pi * (t + ph)))
            R.rot(q, f"shin.{s}", Y, -60)
        R.rot(q, "head", Z, 6 * math.sin(2 * math.pi * t))
        out.append(q)
    return out


def b_hit(R, base, side, n=12):
    out = []
    for f in range(n + 1):
        t = f / n
        k = math.sin(math.pi * min(1.0, t * 1.6)) * (1 - t) ** 0.5
        q = R.copy(base)
        R.rot(q, "spine.003", X, side * 18 * k)
        R.rot(q, "head", Z, -side * 25 * k)
        b_fold(R, q, -0.35 * k)
        out.append(q)
    return out


def b_die(R, base, n=18):
    end = R.copy(base)
    R.rot(end, "spine.003", X, 95)
    R.rot(end, "neck.001", Y, 30)
    R.rot(end, "neck.002", X, 20)
    b_fold(R, end, -0.3)
    for s in "LR":
        R.rot(end, f"thigh.{s}", Y, -40)
        R.rot(end, f"foot.{s}", Y, 40)
    R.ground(end)
    out = []
    for f in range(n + 1):
        t = ease(f / n)
        q = lerp_pose(base, end, t)
        R.shift(q, (0, 0, 0.15 * R.size * math.sin(math.pi * t)), ["spine.003"])
        out.append(q)
    return out


def b_attack(R, base, n=16):
    out = []
    for f in range(n + 1):
        t = f / n
        k = math.sin(math.pi * t) ** 1.5
        q = R.copy(base)
        R.rot(q, "spine.005", Y, 20 * k)
        R.rot(q, "neck.001", Y, 25 * k)
        R.rot(q, "head", Y, 20 * k)
        b_fold(R, q, -0.6 * k)
        out.append(q)
    return out


def b_jump(R, base, fly, n=14):
    """A hop: crouch, up with the wings half open, down."""
    mid = fly[len(fly) // 4] if fly else base
    out = []
    for f in range(n + 1):
        t = f / n
        crouch = math.sin(math.pi * min(1, t / 0.3)) if t < 0.3 else 0
        up = math.sin(math.pi * max(0, (t - 0.25) / 0.75)) if t > 0.25 else 0
        q = lerp_pose(base, mid, up * 0.6)
        for s in "LR":
            R.rot(q, f"thigh.{s}", Y, -30 * crouch)
            R.rot(q, f"shin.{s}", Y, 50 * crouch)
        R.shift(q, (0, 0, 0.45 * R.size * up - 0.1 * R.size * crouch), ["spine.003"])
        out.append(q)
    return out


def b_glide(R, fly, n=48):
    # the stroke's frame whose left hand is nearest level with the shoulder: held, with a slow bank
    best, bz = fly[0], 1e9
    for p in fly:
        P = R.fk(p)
        dz = abs(P["Wing.002.L"].to_translation().z - P["Wing.L"].to_translation().z)
        if dz < bz:
            best, bz = p, dz
    out = []
    for f in range(n + 1):
        q = R.copy(best)
        R.rot(q, "spine.003", X, 5 * math.sin(2 * math.pi * f / n))
        out.append(q)
    return out


def clips_B(R, spec):
    c = {}
    fly = R.sample(R.acts["Fly"]) if "Fly" in R.acts else None
    pitch = spec.get("morph", {}).get("rot", {}).get(r"spine\.003", (0, 0, 0))[1]
    if fly:
        # (the clip leaves the root as the file's nodes hold it — turned about: the body flown level, nose +X,
        # from the standing rest (about 50 degrees up, less what the morph tipped it))
        for p in fly:
            p["spine.003"] = [Vector(), Quaternion()]
            R.rot(p, "spine.003", Y, spec.get("fly_pitch", 50) - pitch)
    base = b_base(R, spec)
    c["idle"] = b_idle(R, base, head=spec.get("idle_head", 8))
    c["idle2"] = b_peck(R, base, n=48, depth=0.35)
    c["look"] = b_look(R, base, deg=spec.get("look", 60))
    c["eat"] = b_peck(R, base)
    # (plan 128 F11b) a sip at the water; its call: head up, a bob
    c["drink"] = b_peck(R, base, n=60, depth=0.7)
    c["howl"] = b_look(R, base, deg=spec.get("look", 60) * 0.3)
    c["walk"] = b_walk(R, base, roll=spec.get("waddle", 4), headbob=spec.get("headbob", True))
    c["run"] = retime(c["walk"], 1.8)
    c["fly"] = fly
    c["glide"] = b_glide(R, fly) if fly else None
    c["jump"] = b_jump(R, base, fly)
    c["attack"] = b_attack(R, base)
    c["hitL"] = b_hit(R, base, 1)
    c["hitR"] = b_hit(R, base, -1)
    c["die"] = b_die(R, base)
    c["lie"] = b_lie(R, base)
    sw = R.copy(base)
    c["swim"] = b_swim(R, sw)
    # (plan 129: a walk with the feet planted; the run its quick walk — a small bird's hop)
    two_gaits(R, c, base, "B")
    for k in spec.get("drop", ()):
        c[k] = None
    return c


# ---------------------------------------------------------------- the rabbit's rig (hare, frog)
def r_hold(R, base, n=48):
    return [R.copy(base) for _ in range(n)] + [R.copy(base)]


def clips_R(R, spec):
    c = {}
    idle = R.sample(R.acts["Bunny_idle"])
    walk = R.sample(R.acts["Bunny_walk"])
    base = idle[0]
    c["idle"] = idle
    c["walk"] = walk
    c["trot"] = retime(walk, 1.3)
    c["run"] = retime(walk, 1.8)
    c["jump"] = retime(walk, 0.8)
    # sitting up, alert
    up = R.copy(base)
    a = spec.get("situp", -40)
    R.rot(up, "spine", Y, a)
    for s in "LR":
        R.rot(up, f"thigh.{s}", Y, -a * 0.9)
        R.rot(up, f"upper_arm.{s}", Y, -a * 0.8)
    R.rot(up, "neck", Y, -a * 0.6)
    R.ground(up)
    c["sit"] = breathe(R, up, ["spine.002"], 2, 48, head=("head", 10))
    # (idle2: up on the haunches for a look round, and down again)
    c["idle2"] = [lerp_pose(base, up, ease(min(1, f / 12)) if f < 36 else ease(max(0, (60 - f) / 24))) for f in range(61)]
    # nibbling
    eat = []
    for f in range(37):
        t = f / 36
        q = R.copy(base)
        R.rot(q, "neck", Y, 28)
        R.rot(q, "head", Y, 18 + 6 * math.sin(2 * math.pi * t * 4))
        eat.append(q)
    c["eat"] = eat
    # looking about
    look = []
    for f in range(73):
        t = f / 72
        a = 45 * math.sin(2 * math.pi * t)
        q = R.copy(base)
        R.rot(q, "neck", Z, a * 0.4)
        R.rot(q, "head", Z, a * 0.6)
        for s, sg in (("L", 1), ("R", -1)):
            R.rot(q, f"hear.{s}", X, 10 * sg * math.sin(2 * math.pi * t * 2))
        look.append(q)
    c["look"] = look
    # flat, resting
    flat = R.copy(base)
    for s in "LR":
        R.rot(flat, f"upper_arm.{s}", Y, -45)
        R.rot(flat, f"forearm.{s}", Y, -20)
        R.rot(flat, f"hear.{s}", Y, 50)
    R.rot(flat, "neck", Y, 10)
    R.ground(flat)
    c["lie"] = breathe(R, flat, ["spine.002"], 2, 60)
    # hit, die
    for name, side in (("hitL", 1), ("hitR", -1)):
        out = []
        for f in range(13):
            t = f / 12
            k = math.sin(math.pi * min(1, t * 1.6)) * (1 - t) ** 0.5
            q = R.copy(base)
            R.rot(q, "spine", X, side * 15 * k)
            R.rot(q, "head", Z, -side * 20 * k)
            out.append(q)
        c[name] = out
    end = R.copy(base)
    R.rot(end, "spine", X, 90)
    for s in "LR":
        R.rot(end, f"thigh.{s}", Y, 50)
        R.rot(end, f"upper_arm.{s}", Y, -40)
    R.ground(end)
    c["die"] = [lerp_pose(base, end, ease(f / 16)) for f in range(17)]
    c["swim"] = retime(walk, 0.6)
    c["walk"], c["trot"], c["run"] = walk, retime(walk, 1.3), retime(walk, 1.8)
    two_gaits(R, c, base, "R")
    # (plan 128 F11b) a sniff about: its nibbling slowed; the alarm: a thump of the hind feet
    c["sniff"] = retime(eat, 0.6)
    thump = []
    for f in range(19):
        t = f / 18
        lift = math.sin(math.pi * min(1, t * 1.6))
        q = R.copy(base)
        for s_ in "LR":
            R.rot(q, f"thigh.{s_}", Y, -22 * lift)
        R.rot(q, "neck", Y, -12 * min(1, t * 3))
        R.ground(q)
        thump.append(q)
    c["stamp"] = thump
    c["attack"] = None
    for k in spec.get("drop", ()):
        c[k] = None
    return c


# ---------------------------------------------------------------- the bat, the fish
def clips_bat(R, spec):
    c = {}
    fly = R.sample(R.acts["Bat_Flying"])
    c["fly"] = fly
    c["idle"] = retime(fly, 0.8)
    c["attack"] = R.sample(R.acts["Bat_Attack"])
    c["die"] = R.sample(R.acts["Bat_Death"])
    c["hitL"] = R.sample(R.acts["Bat_Hit"])
    c["hitR"] = c["hitL"]
    c["glide"] = [R.copy(fly[len(fly) // 4]) for _ in range(25)]
    return c


def clips_fish(R, spec):
    c = {}
    sw = R.sample(R.acts["Swim"])
    c["swim"] = sw
    c["idle"] = retime(sw, 0.5)
    c["run"] = retime(sw, 2.0)
    end = R.copy(sw[0])
    root = R.order[0]
    R.rot(end, root, X, 180)
    c["die"] = [lerp_pose(sw[0], end, ease(f / 20)) for f in range(21)]
    for name, side in (("hitL", 1), ("hitR", -1)):
        out = []
        for f in range(11):
            k = math.sin(math.pi * f / 10)
            q = R.copy(sw[0])
            R.rot(q, root, Z, side * 25 * k)
            out.append(q)
        c[name] = out
    return c


CLIP_FNS = {"U": clips_U, "B": clips_B, "R": clips_R, "bat": clips_bat, "fish": clips_fish}


def rebase_rest(arm, mo, acts, act_name=None, frame=0):
    """A clip's pose made the rest: the mesh skinned into it, the bones' rest moved to it, every clip re-expressed
    against the new rest (the same motion). For a source whose stored rest isn't a pose it was made for."""
    R = Rig(arm, mo, acts)
    if act_name is None:
        pose0 = R.blank()
        for n, (l, q) in STORED.items():
            if n in pose0:
                pose0[n] = [l.copy(), q.copy()]
    else:
        pose0 = R.sample(acts[act_name])[frame]
    V = R.skin(pose0)
    P0 = R.fk(pose0)
    new = {}
    for name, act in list(acts.items()):
        frames = []
        for pose in R.sample(act):
            P = R.fk(pose)
            out = {}
            for n in R.order:
                p = R.parent[n]
                L = (P0[n].inverted() @ P[n]) if p is None else ((P0[p].inverted() @ P0[n]).inverted() @ P[p].inverted() @ P[n])
                out[n] = [L.to_translation(), L.to_quaternion()]
            frames.append(out)
        new[name] = frames
    for i, v in enumerate(mo.data.vertices):
        v.co = Vector(V[i])
    mo.data.update()
    mode(arm, "EDIT")
    for eb in arm.data.edit_bones:
        eb.matrix = P0[eb.name]
    mode(arm, "OBJECT")
    for a in set(acts.values()):
        bpy.data.actions.remove(a)
    for name, frames in new.items():
        acts[name] = write_action(arm, name, frames)
    STORED.clear()  # (the rest is that pose now)


def nose_to_x(arm, mo, head):
    """Turned about Z so the head bone lies along +X from the body's middle."""
    P = coords(mo)
    c = (P.min(0) + P.max(0)) / 2
    h = arm.data.bones[head].head_local
    a = math.atan2(h.y - c[1], h.x - c[0])
    Rz = Matrix.Rotation(-a, 4, "Z")
    mo.data.transform(Rz)
    mode(arm, "EDIT")
    for eb in arm.data.edit_bones:
        eb.transform(Rz)
    mode(arm, "OBJECT")


# ---------------------------------------------------------------- the build of one model
def build(name, spec):
    fam = spec["rig"]
    arm, mo, acts = load(spec["src"], spec.get("yaw", 90.0))
    mo.name = name
    if spec.get("rest_from"):
        rebase_rest(arm, mo, acts, *(() if spec["rest_from"] == "stored" else spec["rest_from"]))
        nose_to_x(arm, mo, spec["nose"])
    if spec.get("pre"):
        spec["pre"](arm, mo)
    if spec.get("delete"):
        delete_faces(mo, spec["delete"])
    prune_bones(arm, mo, acts)
    m = dict(spec.get("morph", {}))
    if fam == "U":
        m.setdefault("attach", U_ATTACH)
    if m:
        morph(arm, mo, acts, **m)
    if spec.get("post"):
        spec["post"](arm, mo)
    # (a stub of a tail — the bear's —: its skin the body's, not a chain of eight bones squeezed into a few cm that
    # crumple the rump as the hips fold)
    for pat, to in (spec.get("merge_weights") or {}).items():
        merge_weights(mo, pat, to)
    # true size
    how, pat = spec.get("measure", ("top", U_TORSO))
    got = measure(mo, how, pat)
    s = spec["size"] / got
    scale_all(arm, mo, acts, s)
    P = coords(mo)
    zmin = P[:, 2].min()
    if spec.get("centre") == "body":
        c = (P.min(0) + P.max(0)) / 2
        off = Vector((-c[0], -c[1], -c[2]))
    else:
        low = P[P[:, 2] < zmin + 0.25 * (P[:, 2].max() - zmin)]
        c = (low.min(0) + low.max(0)) / 2
        off = Vector((-c[0], -c[1], -zmin))
    scale_all(arm, mo, acts, 1.0, off)
    finish_mesh(mo, spec.get("budget", 12000), subdiv=spec.get("subdiv", True))
    paint(mo, spec)
    # bound to the armature
    mo.parent = arm
    md = mo.modifiers.new("Armature", "ARMATURE")
    md.object = arm
    # the clips
    R = Rig(arm, mo, acts)
    R.spec = spec
    R.name = name
    R.gaits = {}
    made = CLIP_FNS[fam](R, spec)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    present = []
    first = None
    # (every bone any clip moves is keyed in every clip: a player that doesn't put unkeyed bones back to their
    # rest still gets each clip whole)
    all_locs, all_rots = set(), set()
    for fr in made.values():
        if fr:
            l, r = moving(fr, R.size)
            all_locs |= l
            all_rots |= r
    for clip in CLIPS:
        fr = made.get(clip)
        if fr:
            made_fps = R.gaits.get(clip, {}).get("fps", FPS)
            act = write_action(arm, clip, fr, R.size, all_locs, all_rots, step=FPS / made_fps)
            present.append(clip)
            first = first or act
    arm.animation_data_create()
    arm.animation_data.action = first
    arm.animation_data.action_slot = first.slots[0]
    bpy.context.scene.frame_set(0)
    arm.data.pose_position = "POSE"
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.glb")
    activate(arm)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_slide_to_zero=True,
        export_force_sampling=False,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_reset_pose_bones=True,
        export_morph=False,
        export_vertex_color="ACTIVE",
        export_texcoords=False,
        export_normals=True,
        export_meshopt_compression_enable=True,
        export_apply=False,
        export_extras=False,
        export_copyright=spec.get("copyright", "") or "",
    )
    P = coords(mo)
    info = {
        "file": f"{name}.glb",
        "source": spec["src"],
        "bytes": os.path.getsize(path),
        "tris": tris_of(mo),
        "bones": len(arm.data.bones),
        "clips": present,
        "missing": [c for c in CLIPS if c not in present],
        "size_m": {"length": round(float(P[:, 0].max() - P[:, 0].min()), 3),
                   "width": round(float(P[:, 1].max() - P[:, 1].min()), 3),
                   "height": round(float(P[:, 2].max() - P[:, 2].min()), 3)},
        "measured": f"{how} = {spec['size']} m",
        # (plan 129: the gaits made — each clip's speed, m/s at its rate 1: the client plays it at its speed / this)
        "gaits": getattr(R, "gaits", {}),
        "speeds": {k: v["speed"] for k, v in getattr(R, "gaits", {}).items()},
    }  # fmt: skip
    print(f"[animals] {name}: {info['tris']} tris, {info['bytes'] / 1024:.0f} KB, clips {len(present)}/{len(CLIPS)}")
    return info


# ---------------------------------------------------------------- the species
exec(open(os.path.join(HERE, "species.py")).read())  # MODELS: palettes, morphs, clip choices (plain data + painters)


def main():
    only = arg("--only")
    names = only.split(",") if only else list(MODELS)
    if "--list" in argv:
        print("\n".join(MODELS))
        return
    man_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for n in names:
        manifest[n] = build(n, MODELS[n])
    manifest = {k: manifest[k] for k in MODELS if k in manifest}
    with open(man_path, "w") as f:
        json.dump({"_note": "tools/art/animals/build_animals.py — nose along +X, feet on y=0, metres",
                   **{k: v for k, v in manifest.items() if not k.startswith("_")}}, f, indent=1)  # fmt: skip
        f.write("\n")


if __name__ == "__main__":
    main()

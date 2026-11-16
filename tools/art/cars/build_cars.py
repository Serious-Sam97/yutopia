# Plan 92 — the cars for the game: each variant dressed (dress.py), its parts merged by group and material and
# hung under its pivots, its dents as shape keys, written as three .glb (near, mid, and one far per body) into
# apps/client/public/life/cars/, and its numbers into manifest.json — so the game needs no guessing.
#
#   blender -b --factory-startup -P tools/art/cars/build_cars.py -- [--car saloon-base,saloon-gl] [--out DIR]
#                                                                    [--no-mid] [--render DIR]
#
# The nodes (glTF, y-up: Blender's (x, y, z) → (x, z, −y): x forward, y up, z the car's right — the game's):
#   <variant>                      the root, on the ground under the centre of gravity
#     body                         the sprung body (its paint carries the morphs dent_front/rear/left/right/roof)
#       door_fl, door_fr, …        each at its hinge (its axis in the manifest); mirror_l/r under the front doors
#       bonnet, boot               at their hinges; bumper_f (detachable)
#       wiper_l/r, steering, pedal_0..2, lever, handbrake      the moving cabin parts
#       lamp_head, lamp_tail, lamp_brake, lamp_reverse, lamp_ind_l/r    the lamps' own light (emission)
#       screen                     the VFD's canvas (UV 0..1)
#       plate_f (on bumper_f), plate_r (on boot)                the plates (UV 0..1)
#       collider                   the Jolt hull (convex; never drawn)
#       seat_0.., eye, exhaust_0, headlight_l/r, hub_fl.., x_roof, x_front, x_spot_l/r, x_flap_*   points
#     wheel_fl › steer_fl › spin_fl (…rr)   at each hub: the suspension moves wheel_, steer_ turns, spin_ rolls
import json
import math
import os
import sys

import bmesh
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


OUT = arg("--out", os.path.join(ROOT, "apps/client/public/life/cars"))
import work as _work  # noqa: E402

ONLY = arg("--car", ",".join(variants.ROAD + list(_work.BUILD))).split(",")
os.makedirs(OUT, exist_ok=True)
MANIFEST = os.path.join(OUT, "manifest.json")
try:
    with open(MANIFEST) as _f:
        PREV = json.load(_f)
except (OSError, ValueError):
    PREV = {}


def gl(p):
    """Blender's frame → glTF's (the game's)."""
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]


def merged(car):
    """Every object merged by (group, material) → {group: [object]}."""
    sets = {}
    for o in list(kit.coll().objects):
        if o.type != "MESH" or "grp" not in o.keys():
            continue
        if len(o.data.polygons) == 0:
            kit.kill(o)
            continue
        sets.setdefault((o["grp"], o["kind"]), []).append(o)
    out = {}
    for (grp, kind), obs in sets.items():
        j = kit.join(obs, f"{grp}-{kind}")
        out.setdefault(grp, []).append(j)
    return out


def dents(o, b):
    """The dent morphs on a paint mesh: the nose, the tail, each side, the roof pushed in (smooth, a little
    crumpled)."""
    if not o.data.shape_keys:
        o.shape_key_add(name="Basis")
    xf, xr = b.x(0), b.x(b.L)
    zones = {
        "dent_front": lambda p: max(0.0, (p.x - (xf - 0.7)) / 0.7),
        "dent_rear": lambda p: max(0.0, ((xr + 0.7) - p.x) / 0.7),
        "dent_left": lambda p: max(0.0, (p.y - 0.45) / 0.5) * max(0.0, 1 - abs(p.x - b.x(b.L * 0.45)) / 1.6),
        "dent_right": lambda p: max(0.0, (-p.y - 0.45) / 0.5) * max(0.0, 1 - abs(p.x - b.x(b.L * 0.45)) / 1.6),
        "dent_roof": lambda p: max(0.0, (p.z - (b.roof - 0.25)) / 0.25),
    }
    push = {
        "dent_front": Vector((-1, 0, -0.25)),
        "dent_rear": Vector((1, 0, -0.2)),
        "dent_left": Vector((0, -1, 0)),
        "dent_right": Vector((0, 1, 0)),
        "dent_roof": Vector((0, 0, -1)),
    }
    for name, f in zones.items():
        k = o.shape_key_add(name=name, from_mix=False)
        for i, v in enumerate(o.data.vertices):
            w = min(1.0, f(v.co))
            if w <= 0:
                continue
            p = v.co
            crumple = 0.6 + 0.4 * math.sin(p.x * 23.0 + p.y * 17.0) * math.sin(p.z * 19.0 + p.x * 7.0)
            k.data[i].co = p + push[name] * (0.09 * w * w * crumple)


def hang(car, groups, root_name):
    """The scene laid out for export: the root, the pivots (each mesh moved so its pivot is its origin), the
    points."""
    root = bpy.data.objects.new(root_name, None)
    kit.coll().objects.link(root)
    piv = dict(car.pivots)
    piv.setdefault("body", dict(at=(0, 0, 0), axis=(0, 0, 1), parent="root"))
    for g in groups:
        if g not in piv and g != "collider":
            # a lamp's or another fixed group: on the body, at its origin
            piv[g] = dict(at=(0, 0, 0), axis=(0, 0, 1), parent="body")
    piv["collider"] = dict(at=(0, 0, 0), axis=(0, 0, 1), parent="body")
    empties = {"root": (root, Vector((0, 0, 0)))}

    def make(g):
        if g in empties:
            return empties[g]
        d = piv[g]
        parent = d.get("parent", "body")
        pe, pat = make(parent) if parent != "root" else empties["root"]
        e = bpy.data.objects.new(g, None)
        kit.coll().objects.link(e)
        e.parent = pe
        at = Vector(d["at"]) if g != "body" else Vector((0, 0, 0))
        e.location = at - pat
        empties[g] = (e, at)
        return empties[g]

    for g in piv:
        make(g)
    for g, obs in groups.items():
        e, at = empties[g]
        for o in obs:
            o.data.transform(Matrix.Translation(-at), shape_keys=True)
            o.parent = e
            o.name = f"{g}-{o['kind']}"
    for name, p in car.points.items():
        e = bpy.data.objects.new(name, None)
        kit.coll().objects.link(e)
        e.parent = empties["body"][0]
        e.location = Vector(p)
    return root


NORMAL_BITS = int(arg("--normal-bits", "10"))


def _quantize_exporter():
    """(quality pass 2) The exporter's floats snapped to grids before meshopt packs them: normals to 1/512,
    UVs to 1/4096, positions to 1/8192 m (0.12 mm) — the low bits that were noise now zeros, the smooth
    normals of the paint a third the bytes; nothing visible. Patched once into Blender's own glTF exporter."""
    import numpy as np

    try:
        from io_scene_gltf2.blender.exp import primitive_extract as pe
    except ImportError:
        import importlib

        pe = importlib.import_module("addons_core.io_scene_gltf2.blender.exp.primitive_extract")
    C = pe.PrimitiveCreator
    if getattr(C, "_q2", False):
        return
    get_n, get_uv, get_p = C._PrimitiveCreator__get_normals, C._PrimitiveCreator__get_uvs_attribute, C._PrimitiveCreator__get_positions

    def normals(self):
        get_n(self)
        self.normals = (np.round(self.normals * 512.0) / 512.0).astype(np.float32)

    def uvs(self, idx, attr):
        get_uv(self, idx, attr)
        for k in ("0", "1"):
            a = self.dots[attr["gltf_attribute_name"] + k]
            self.dots[attr["gltf_attribute_name"] + k] = np.round(a * 4096.0) / 4096.0

    def positions(self):
        get_p(self)
        self.locs = (np.round(self.locs * 8192.0) / 8192.0).astype(np.float32)
        self.morph_locs = [(np.round(m * 8192.0) / 8192.0).astype(np.float32) for m in self.morph_locs]

    # (and the normals' mantissas: 10 bits, not 12 — meshopt's exponential filter, ~0.06° at worst)
    try:
        from io_scene_gltf2.io.exp import meshopt as mo
    except ImportError:
        import importlib

        mo = importlib.import_module("addons_core.io_scene_gltf2.io.exp.meshopt")
    enc = mo.MeshoptEncoder.encode_attribute

    def encode_attribute(attribute_name, data, byteStride, export_settings):
        was = mo.EXP_FILTER_BITS
        if attribute_name in ("NORMAL", "SK_NORMAL"):
            mo.EXP_FILTER_BITS = NORMAL_BITS
        try:
            return enc(attribute_name, data, byteStride, export_settings)
        finally:
            mo.EXP_FILTER_BITS = was

    mo.MeshoptEncoder.encode_attribute = staticmethod(encode_attribute)
    C._PrimitiveCreator__get_normals = normals
    C._PrimitiveCreator__get_uvs_attribute = uvs
    C._PrimitiveCreator__get_positions = positions
    C._q2 = True


def export(path, root, depth=0):
    _quantize_exporter()
    for o in bpy.data.objects:
        o.select_set(False)
    keep = [root] + list(root.children_recursive)
    for o in keep:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        use_selection=True,
        export_meshopt_compression_enable=True,
        export_extras=False,
        export_morph=True,
        export_morph_normal=False,
        export_apply=False,
        export_image_format="NONE",
    )
    import link_tex

    link_tex.link(path, depth)
    return os.path.getsize(path)


def tri_count(groups):
    return sum(kit.tris(o) for obs in groups.values() for o in obs)


def decimate(o, ratio):
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    kit.apply_all(o)


# what the mid and far levels keep
MID_DROP = {"pedal_0", "pedal_1", "pedal_2", "handbrake", "screen", "radio_screen"}
MID_DROP_KINDS = {"emit_brake"}


def build_variant(vid):
    spec, v = variants.get(vid)
    car = dress.dress(spec, v)
    b = car.b
    col = dress.collider(car)
    # (its points, the game's Jolt hull: docs/plan/92 phase 9)
    hull = [gl(col.matrix_world @ v.co) for v in col.data.vertices]
    groups = merged(car)
    near_tris = tri_count(groups) - sum(kit.tris(o) for o in groups.get("collider", []))
    for g, obs in groups.items():
        for o in obs:
            if o["kind"] == "paint" and g in ("body",) or (o["kind"] == "paint" and g.startswith(("door_", "bonnet", "boot"))):
                dents(o, b)
    root = hang(car, groups, vid)
    path = os.path.join(OUT, f"{vid}.glb")
    size = export(path, root)
    print(f"wrote {path} ({size / 1e6:.2f} MB), {near_tris} triangles")
    entry = {
        "file": f"{vid}.glb",
        "body": vid.split("-")[0],
        "variant": vid.split("-", 1)[1],
        "kind": spec.get("kind", "sedan"),
        "name": v.get("name", vid),
        "dims": {"length": round(b.L, 3), "width": round(b.W, 3), "height": round(b.roof, 3), "ahead": round(b.ahead, 3), "cog": b.cog},
        "wheelbase": round(b.axle_r - b.axle_f, 3),
        "track": round(b.track * 2, 3),
        "wheel": {"r": b.wheel_r, "width": b.wheel_w, "style": v["wheels"]},
        "hubs": {t: gl(car.points[f"hub_{t}"]) for t in ("fl", "fr", "rl", "rr")},
        "seats": [gl(car.points[k]) for k in sorted((k for k in car.points if k.startswith("seat_")), key=lambda k: int(k[5:]))],
        "eye": gl(car.points["eye"]),
        "points": {k: gl(p) for k, p in car.points.items()},
        "pivots": {g: {"at": gl(d["at"]), "axis": gl(d["axis"]), "parent": d.get("parent", "body"), **{k: x for k, x in d.items() if k not in ("at", "axis", "parent")}} for g, d in car.pivots.items()},
        "doors": [d["grp"] for d in b.door_list()],
        "tris": {"near": near_tris},
        "bytes": {"near": size},
        "materials": sorted({o["kind"] for obs in groups.values() for o in obs}),
        "morphs": ["dent_front", "dent_rear", "dent_left", "dent_right", "dent_roof"],
        "hull": hull,
    }
    # ── mid: the cabin's small parts gone, everything thinned ──
    if "--no-mid" not in argv:
        car = dress.dress(spec, v, lod="mid")
        groups = merged(car)
        for g in list(groups):
            if g in MID_DROP:
                for o in groups.pop(g):
                    kit.kill(o)
        root = hang(car, groups, vid)
        mid = os.path.join(OUT, f"{vid}-mid.glb")
        msize = export(mid, root)
        entry["tris"]["mid"] = tri_count(groups)
        entry["bytes"]["mid"] = msize
        print(f"wrote {mid} ({msize / 1e6:.2f} MB), {entry['tris']['mid']} triangles")
    return entry


def build_far(body):
    """One far model a body: its base variant's shell, glass and wheels thinned to a silhouette (~1.5k)."""
    vid = f"{body}-{variants.BODIES[body]['far']}"
    spec, v = variants.get(vid)
    car = dress.dress(spec, dict(v, wheels="steel"), lod="far")
    groups = merged(car)
    keep_kinds = {"paint", "glass", "tyre", "trim", "chrome", "emit_head", "emit_tail", "lens_red", "steel_paint", "paint2", "canvas", "fibre", "woodgrain", "livery", "bed"}
    for g in list(groups):
        obs = groups[g]
        kept = []
        for o in obs:
            if o["kind"] not in keep_kinds or g in ("steering", "lever", "handbrake") or g.startswith(("pedal", "wiper", "mirror", "screen")):
                kit.kill(o)
            else:
                kept.append(o)
        groups[g] = kept
    # the cabin's insides: gone (the far glass is opaque: tinted)
    flat = {}
    for g, obs in groups.items():
        for o in obs:
            flat.setdefault(o["kind"], []).append(o)
    out = {"body": []}
    for kind, obs in flat.items():
        j = kit.join(obs, f"far-{kind}")
        j["grp"] = "body"
        out["body"].append(j)
    total = tri_count(out)
    for o in out["body"]:
        share = {"paint": 0.55, "glass": 0.1, "tyre": 0.15}.get(o["kind"], 0.04)
        want = 1500 * share
        if kit.tris(o) > want:
            decimate(o, max(0.01, want / kit.tris(o)))
    car.pivots = {}
    car.points = {}
    root = hang(car, out, f"{body}-far")
    path = os.path.join(OUT, f"{body}-far.glb")
    size = export(path, root)
    print(f"wrote {path} ({size / 1e6:.2f} MB), {tri_count(out)} triangles")
    return {"file": f"{body}-far.glb", "tris": tri_count(out), "bytes": size}


def build_work(wid):
    """A work vehicle (work.py): near, mid (thinned) and far (its own, thinned hard)."""
    import work

    entry = None
    for lod in ("near", "mid", "far"):
        car = work.build(wid, lod)
        b = car.b
        if lod == "near":
            # the Jolt hull: the convex hull of what isn't a wheel, a track or a moving cabin part
            import bmesh as _bm

            bm = _bm.new()
            # (quality pass 2: the hull the game was tuned on kept — the last manifest's, when there is one)
            was = PREV.get("cars", {}).get(wid, {}).get("hull")
            if was:
                for x, y, z in was:
                    bm.verts.new((x, -z, y))
            else:
                for o in list(kit.coll().objects):
                    if o.type == "MESH" and o.get("grp") in ("body", "bonnet", "door_fl", "door_fr", "boot", "blade"):
                        for v in o.data.vertices:
                            bm.verts.new(o.matrix_world @ v.co)
            res = _bm.ops.convex_hull(bm, input=bm.verts[:])
            # (only the hull's own corners: what was inside it, and what it left unused, gone)
            drop = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, _bm.types.BMVert)}
            _bm.ops.delete(bm, geom=list(drop), context="VERTS")
            me = bpy.data.meshes.new("collider")
            bm.to_mesh(me)
            bm.free()
            col = kit.obj("collider", me, "collider", "collider", smooth=False)
            hull = [gl(col.matrix_world @ v.co) for v in col.data.vertices]
        groups = merged(car)
        if lod != "near":
            for g in list(groups):
                if g in ("steering",) or g.startswith("pedal"):
                    for o in groups.pop(g):
                        kit.kill(o)
            total = tri_count(groups)
            target = 17000 if lod == "mid" else 1500
            ratio = min(1.0, target / max(total, 1))
            if ratio < 1.0:
                for g, obs in groups.items():
                    for o in obs:
                        if kit.tris(o) > 40:
                            decimate(o, ratio)
        if lod == "far":
            car.pivots = {}
            car.points = {}
            flat = {}
            for g, obs in groups.items():
                for o in obs:
                    flat.setdefault(o["kind"], []).append(o)
            groups = {"body": []}
            for kind, obs in flat.items():
                j = kit.join(obs, f"far-{kind}")
                j["grp"] = "body"
                groups["body"].append(j)
        root = hang(car, groups, wid if lod != "far" else f"{wid}-far")
        name = {"near": f"{wid}.glb", "mid": f"{wid}-mid.glb", "far": f"{wid}-far.glb"}[lod]
        path = os.path.join(OUT, name)
        size = export(path, root)
        tris = tri_count(groups) - (sum(kit.tris(o) for o in groups.get("collider", [])) if lod == "near" else 0)
        print(f"wrote {path} ({size / 1e6:.2f} MB), {tris} triangles")
        if lod == "near":
            entry = {
                "file": name,
                "body": wid,
                "variant": "work",
                "kind": b.kind,
                "name": wid,
                "dims": {"length": b.L, "width": b.W, "height": b.roof, "ahead": b.ahead, "cog": b.cog},
                "wheelbase": round(b.axle_r - b.axle_f, 3),
                "track": round(b.track * 2, 3),
                "wheel": {"r": b.wheel_r, "width": b.wheel_w},
                "hubs": {t: gl(car.points[f"hub_{t}"]) for t in ("fl", "fr", "rl", "rr") if f"hub_{t}" in car.points},
                "seats": [gl(car.points[k]) for k in sorted((k for k in car.points if k.startswith("seat_")), key=lambda k: int(k[5:]))],
                "eye": gl(car.points["eye"]) if "eye" in car.points else None,
                "points": {k: gl(p) for k, p in car.points.items()},
                "pivots": {g: {"at": gl(d["at"]), "axis": gl(d["axis"]), "parent": d.get("parent", "body"), **{k: x for k, x in d.items() if k not in ("at", "axis", "parent")}} for g, d in car.pivots.items()},
                "doors": [g for g in car.pivots if g.startswith("door_")],
                "tris": {"near": tris},
                "bytes": {"near": size},
                "materials": sorted({o["kind"] for obs in groups.values() for o in obs}),
                "morphs": [],
                "hull": hull,
            }
        else:
            entry["tris"][lod] = tris
            entry["bytes"][lod] = size
    return entry


def build_addons():
    """The shared add-ons and wheels (F13b): extras/<id>.glb, wheels/<id>.glb — each at its socket's origin."""
    import extras

    out = {"extras": {}, "wheels": {}}
    for kind in variants.ADDONS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        kit.MATS.clear()
        obs = extras.addon(kind)
        car = dress.Car(None, {})
        groups = merged(car)
        root = hang(car, groups, f"x-{kind}")
        os.makedirs(os.path.join(OUT, "extras"), exist_ok=True)
        path = os.path.join(OUT, "extras", f"{kind}.glb")
        size = export(path, root, 1)
        out["extras"][kind] = {"file": f"extras/{kind}.glb", "socket": SOCKET.get(kind, "x_roof"), "tris": tri_count(groups), "bytes": size}
        print(f"wrote {path} ({size / 1e3:.0f} KB), {tri_count(groups)} triangles")
    for style in variants.WHEELS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        kit.MATS.clear()
        extras.wheel_addon(style)
        car = dress.Car(None, {})
        groups = merged(car)
        root = hang(car, groups, f"w-{style}")
        os.makedirs(os.path.join(OUT, "wheels"), exist_ok=True)
        path = os.path.join(OUT, "wheels", f"{style}.glb")
        size = export(path, root, 1)
        out["wheels"][style] = {"file": f"wheels/{style}.glb", "ref": {"r": 0.317, "width": 0.195}, "tris": tri_count(groups), "bytes": size}
        print(f"wrote {path} ({size / 1e3:.0f} KB), {tri_count(groups)} triangles")
    return out


# where each add-on goes (the car's socket; mud flaps on all four x_flap_*, chains on each hub)
SOCKET = {"roofrack": "x_roof", "skibox": "x_roof", "lightbar": "x_roof", "taxisign": "x_roof", "bullbar": "x_front", "spots": "x_spot_l", "flaps": "x_flap_*", "chains": "hub_*"}


def main():
    man = {"version": 1, "frame": "glTF y-up: x forward, y up, z right; origin on the ground under the centre of gravity; a pivot's side 1 is the car's left (-z)", "cars": {}, "far": {}}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST) as f:
                man = json.load(f)
        except ValueError:
            pass
    man["frame"] = "glTF y-up: x forward, y up, z right; origin on the ground under the centre of gravity; a pivot's side 1 is the car's left (-z)"
    bodies_done = set()
    import work

    for vid in ONLY:
        if vid in work.BUILD:
            man["cars"][vid] = build_work(vid)
            continue
        if vid in variants.ROAD:
            man["cars"][vid] = build_variant(vid)
            body = vid.split("-")[0]
            if body not in bodies_done and "--no-far" not in argv:
                man["far"][body] = build_far(body)
                bodies_done.add(body)
    if "--addons" in argv or "--car" not in argv:
        man.update(build_addons())
    with open(MANIFEST, "w") as f:
        json.dump(man, f, indent=1)
    print("wrote", MANIFEST)


main()

# Plan 103 — the skateboards for the game: each variant built (boards.py), its objects merged by pivot and material
# and hung under its pivots, written as near and mid .glb (and one far a shape) into apps/client/public/life/skate/,
# its numbers into manifest.json — so the game guesses nothing.
#
#   blender -b --factory-startup -P tools/art/skate/build_boards.py -- [--board street-pop,vert-fish] [--out DIR]
#                                                                       [--no-mid] [--no-far]
#
# The frame (glTF y-up; Blender's (x, y, z) → (x, z, −y)): x forward (the nose), y up, z the board's right; the
# origin on the ground under the middle between the axles. The nodes: see README.md.
import json
import os
import sys

import bpy
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


OUT = arg("--out", os.path.join(ROOT, "apps/client/public/life/skate"))
ONLY = arg("--board", ",".join(boards.ORDER)).split(",")
os.makedirs(OUT, exist_ok=True)
MANIFEST = os.path.join(OUT, "manifest.json")
FRAME = "glTF y-up: x forward (nose), y up, z right; origin on the ground under the axles' middle"
BUDGET = {"near": 12000, "mid": 1500, "far": 150}
NEAR_BYTES = 600_000


def gl(p):
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]


def reset(lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.MATS.clear()
    kit.TEXTURED = False  # (the GLB carries no images: link() points it at the KTX2s)
    sk.LOD = lod
    kit.SEG = 1.0


def merged():
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
        # (smooth shading kept: the joined copy lost it — the per-face flags were in the source meshes' data)
        out.setdefault(grp, []).append(j)
    return out


def hang(B, groups, root_name, with_points=True):
    """The pivots as empties (each in the board's own orientation: x forward, the glTF y up), the merged meshes
    under them in their pivots' frames, the points under the pivots they move with."""
    root = bpy.data.objects.new(root_name, None)
    kit.coll().objects.link(root)
    W = {"root": Matrix.Identity(4), "collider": Matrix.Identity(4)}
    for g, (at, _, _) in B.pivots.items():
        W[g] = Matrix.Translation(Vector(at))
    parent_of = {g: p for g, (_, _, p) in B.pivots.items()}
    parent_of["collider"] = "root"
    E = {"root": root}

    def make(g):
        if g in E:
            return E[g]
        pe = make(parent_of.get(g, "root") or "root")
        e = bpy.data.objects.new(g, None)
        kit.coll().objects.link(e)
        e.parent = pe
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = W[parent_of.get(g, "root") or "root"].inverted() @ W[g]
        E[g] = e
        return e

    for g in list(B.pivots) + (["collider"] if "collider" in groups else []):
        make(g)
    for g, obs in groups.items():
        e = make(g)
        Wi = W[g].inverted()
        for o in obs:
            o.data.transform(Wi)
            o.matrix_world = Matrix.Identity(4)
            o.parent = e
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.matrix_basis = Matrix.Identity(4)
            o.name = f"{g}-{o['kind']}"
            o.data.name = o.name
    if with_points:
        for name, (p, g) in B.points.items():
            if name in B.pivots:
                continue  # (points.deck is the deck pivot's own origin)
            e = bpy.data.objects.new(name, None)
            kit.coll().objects.link(e)
            e.parent = make(g)
            e.matrix_parent_inverse = Matrix.Identity(4)
            e.matrix_basis = W[g].inverted() @ Matrix.Translation(Vector(p))
    return root


def tri_count(groups, skip=("collider",)):
    return sum(kit.tris(o) for g, obs in groups.items() if g not in skip for o in obs)


def export(path, root):
    sys.path.insert(0, os.path.join(HERE, "../bikes"))
    import bexport

    return bexport.export(path, root)


def extents(groups, names=None):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for g, obs in groups.items():
        if g == "collider" or (names and g not in names):
            continue
        for o in obs:
            for v in o.data.vertices:
                c = o.matrix_world @ v.co
                lo = Vector((min(lo.x, c.x), min(lo.y, c.y), min(lo.z, c.z)))
                hi = Vector((max(hi.x, c.x), max(hi.y, c.y), max(hi.z, c.z)))
    return lo, hi


def graphic_of(vid):
    s = boards.spec(vid)
    return None if s["bottom"] == "paint" and not s.get("slick") else f"graphic-{vid}"


def finish(vid):
    """The graphic's finish: the slick's glossy plastic, else a satin screen print."""
    if boards.spec(vid).get("slick"):
        sk.set_graphic(None, rough=0.12, coat=1.0)
    else:
        sk.set_graphic(None, rough=0.42, coat=0.3)


def build_lod(vid, lod):
    reset(lod)
    finish(vid)
    B, obs = boards.build(vid)
    boards.collider(B, boards.spec(vid))
    sk.uv_metric()
    groups = merged()
    return B, groups, tri_count(groups)


def build_variant(vid):
    s = boards.spec(vid)
    B, groups, near_tris, = build_lod(vid, "near")
    lo, hi = extents(groups, {"deck"})
    mats = sorted({o["kind"] for g, obs in groups.items() for o in obs if g != "collider"})
    I = B.info
    root = hang(B, groups, vid)
    path = os.path.join(OUT, f"{vid}.glb")
    export(path, root)
    sk.link(path, graphic_of(vid))
    size = os.path.getsize(path)
    print(f"wrote {path} ({size / 1e3:.0f} KB), {near_tris} triangles")
    R, W, _ = s["wheel"]
    entry = {
        "file": f"{vid}.glb",
        "mid": f"{vid}-mid.glb",
        "far": f"{s['shape']}-far.glb",
        "shape": s["shape"],
        "variant": vid,
        "name": s["name"],
        "dims": {"length": round(hi.x - lo.x, 3), "width": round(hi.y - lo.y, 3), "height": round(I["H"], 4), "thick": s["thick"]},
        "wheelbase": s["wb"],
        "truck_width": s["tw"],
        "wheel": {"r": R, "width": W},
        "kick": I["kick"],
        "points": {k: gl(p) for k, (p, g) in B.points.items()},
        "pivots": {k: gl(at) for k, (at, _, _) in B.pivots.items()},
        "materials": mats,
        "tris": {"near": near_tris},
        "bytes": {"near": size},
        "graphic": f"tex/{graphic_of(vid)}.ktx2" if graphic_of(vid) else None,
        "colours": s["colours"],
        "wheel_colours": s["wheel_colours"],
        "mass": I["mass"],
        "has": {
            "rails": bool(s.get("rails")),
            "skid": bool(s.get("skid")),
            "nose_guard": bool(s.get("nose_guard")),
            "lapper": bool(s.get("lapper")),
            "slick": bool(s.get("slick")),
            "risers": s["riser"] > 0,
            "grip_nose": s["grip"] == "full",
        },
    }
    if "--no-mid" not in argv:
        Bm, gm, mid_tris = build_lod(vid, "mid")
        root = hang(Bm, gm, vid)
        mid = os.path.join(OUT, f"{vid}-mid.glb")
        export(mid, root)
        sk.link(mid, graphic_of(vid))
        msize = os.path.getsize(mid)
        entry["tris"]["mid"] = mid_tris
        entry["bytes"]["mid"] = msize
        print(f"wrote {mid} ({msize / 1e3:.0f} KB), {mid_tris} triangles")
    return entry


def build_far(shape, vid):
    """One far model a shape: the deck as a slab (its kicks kept), four discs, a rod for each truck — one root."""
    reset("far")
    finish(vid)
    B, obs = boards.build(vid)
    for o in kit.coll().objects:
        if o.type == "MESH":
            o["grp"] = "far"
    groups = merged()
    tris = tri_count(groups)
    root = bpy.data.objects.new(f"{shape}-far", None)
    kit.coll().objects.link(root)
    for obs_ in groups.values():
        for o in obs_:
            o.parent = root
            o.name = f"{shape}-far-{o['kind']}"
            o.data.name = o.name
    path = os.path.join(OUT, f"{shape}-far.glb")
    export(path, root)
    sk.link(path, graphic_of(vid))
    size = os.path.getsize(path)
    print(f"wrote {path} ({size / 1e3:.1f} KB), {tris} triangles")
    return {"file": f"{shape}-far.glb", "tris": tris, "bytes": size, "from": vid}


def main():
    man = {"version": 1, "frame": FRAME, "boards": {}, "far": {}}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST) as f:
                old = json.load(f)
            man["boards"].update(old.get("boards", {}))
            man["far"].update(old.get("far", {}))
        except ValueError:
            pass
    done = set()
    for vid in ONLY:
        man["boards"][vid] = build_variant(vid)
        shape = vid.split("-")[0]
        if shape not in done and "--no-far" not in argv:
            first = [v for v in boards.ORDER if v.startswith(shape + "-")][0]
            man["far"][shape] = build_far(shape, first)
            done.add(shape)
        for v in man["boards"]:
            sh = man["boards"][v]["shape"]
            if sh in man["far"]:
                man["boards"][v]["tris"]["far"] = man["far"][sh]["tris"]
        man["boards"] = {k: man["boards"][k] for k in boards.ORDER if k in man["boards"]}
        with open(MANIFEST, "w") as f:
            json.dump(man, f, indent=1)
    print("wrote", MANIFEST)


if __name__ == "__main__":
    main()

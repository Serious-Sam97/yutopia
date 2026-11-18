# Plan 101 — the bicycles for the game: each variant built (bikes.py), its objects merged by group and material
# and hung under its pivots, written as near and mid .glb (and one far per body) into
# apps/client/public/life/bikes/, its numbers into manifest.json — so the game guesses nothing.
#
#   blender -b --factory-startup -P tools/art/bikes/build_bikes.py -- [--bike town-classic,bmx-free] [--out DIR]
#                                                                       [--no-mid] [--no-far]
#
# The frame (glTF y-up; Blender's (x, y, z) → (x, z, −y)): x forward, y up, z the bike's right; the origin on the
# ground under the bottom bracket. The nodes: see README.md.
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bkit as bk  # noqa: E402
import kit  # noqa: E402

import bikes  # noqa: E402
import btex  # noqa: E402

ROOT = os.path.join(HERE, "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(ROOT, "apps/client/public/life/bikes"))
ONLY = arg("--bike", ",".join(bikes.ROAD_ORDER)).split(",")
os.makedirs(OUT, exist_ok=True)
MANIFEST = os.path.join(OUT, "manifest.json")
FRAME = "glTF y-up: x forward, y up, z right; origin on the ground under the bottom bracket"
BUDGET = {"near": 45000, "mid": 8000, "far": 600}


def gl(p):
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]


def gl_dir(p):
    v = Vector(p).normalized()
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def reset(lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.MATS.clear()
    bk.LOD = lod
    kit.SEG = {"near": 1.0, "mid": 0.5, "far": 0.3}[lod]


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
        out.setdefault(grp, []).append(j)
    return out


def world_mats(B):
    """Each pivot's world matrix (Blender): steer and bars_spin with their local y up the steering axis and z to
    the right; the levers' z on their hinges; the kickstand's x on its hinge; the rest the bike's own frame."""
    W = {"root": Matrix.Identity(4)}
    for g, (at, ax, parent) in B.pivots.items():
        at = Vector(at)
        if g in ("steer", "bars_spin"):
            W[g] = bk.basis(ax, (0, -1, 0), at)
        elif g.startswith("lever_"):
            axv = Vector(ax).normalized()
            up = Vector((0, 0, 1)) if abs(axv.z) < 0.9 else Vector((1, 0, 0))
            U = (up - axv * axv.dot(up)).normalized()
            W[g] = bk.basis(U, axv, at)
        elif g == "kickstand":
            axv = Vector(ax).normalized()
            p = Vector((0, 0, 1))
            p = (p - axv * axv.dot(p)).normalized()
            W[g] = bk.basis(p, axv.cross(p), at)
        else:
            W[g] = bk.ident(at)
    return W


def hang(B, groups, root_name, with_points=True):
    root = bpy.data.objects.new(root_name, None)
    kit.coll().objects.link(root)
    W = world_mats(B)
    E = {"root": root}
    parent_of = {g: p for g, (_, _, p) in B.pivots.items()}
    parent_of["collider"] = "root"
    W["collider"] = Matrix.Identity(4)

    def make(g):
        if g in E:
            return E[g]
        p = parent_of.get(g, "root") or "root"
        pe = make(p)
        e = bpy.data.objects.new(g, None)
        kit.coll().objects.link(e)
        e.parent = pe
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_basis = W[p].inverted() @ W[g]
        E[g] = e
        return e

    for g in list(B.pivots) + (["collider"] if "collider" in groups else []):
        make(g)
    for g, obs in groups.items():
        e = make(g) if g in W else make("frame")
        Wi = W.get(g, W["frame"]).inverted()
        for o in obs:
            o.data.transform(Wi)
            o.matrix_world = Matrix.Identity(4)
            o.parent = e
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.matrix_basis = Matrix.Identity(4)
            o.name = f"{g}-{o['kind']}"
    if with_points:
        for name, (p, g) in B.points.items():
            e = bpy.data.objects.new(name, None)
            kit.coll().objects.link(e)
            pg = g or "root"
            e.parent = make(pg)
            e.matrix_parent_inverse = Matrix.Identity(4)
            e.matrix_basis = W[pg].inverted() @ bk.ident(p)
    return root


def tri_count(groups, skip=("collider",)):
    return sum(kit.tris(o) for g, obs in groups.items() if g not in skip for o in obs)


def export(path, root):
    import bexport as bce

    return bce.export(path, root)


def decimate(o, ratio):
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    kit.apply_all(o)


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


def build_lod(vid, lod):
    reset(lod)
    B, obs = bikes.build(vid)
    if lod == "mid":
        # (the mid keeps no small parts: bolts, caps, nuts — anything under 3 cm across that isn't a lamp)
        for o in list(kit.coll().objects):
            if o.type != "MESH" or not len(o.data.vertices) or str(o.get("kind", "")).startswith(("emit", "lens")):
                continue
            vs = [v.co for v in o.data.vertices]
            lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
            hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
            if (hi - lo).length < 0.03:
                kit.kill(o)
    kit.uv_all()
    col = None
    if lod == "near":
        c = bikes.collider(B)
        col = [gl(v.co) for v in c.data.vertices]
    groups = merged()
    tris = tri_count(groups)
    for _ in range(3):
        if lod != "mid" or tris <= BUDGET["mid"] * 0.98:
            break
        # thin the heaviest meshes to the budget (never the spokes' disc, the chain's band, a lamp)
        big = [o for obs_ in groups.values() for o in obs_ if kit.tris(o) > 200 and o["kind"] not in ("spokes", "chain", "collider") and not o["kind"].startswith(("emit", "lens"))]
        fixed = tris - sum(kit.tris(o) for o in big)
        ratio = (BUDGET["mid"] * 0.96 - fixed) / max(1, tris - fixed)
        for o in big:
            decimate(o, max(0.3, min(1.0, ratio)))
        tris = tri_count(groups)
    return B, groups, tris, col


def build_variant(vid):
    s = bikes.spec(vid)
    B, groups, near_tris, col = build_lod(vid, "near")
    lo, hi = extents(groups)
    blo, bhi = extents(groups, {"steer", "bars_spin", "lever_l", "lever_r"})
    hull = col or []
    mats = sorted({o["kind"] for g, obs in groups.items() for o in obs if g != "collider"})
    I = B.info
    root = hang(B, groups, vid)
    path = os.path.join(OUT, f"{vid}.glb")
    size = export(path, root)
    btex.link(path)
    size = os.path.getsize(path)
    print(f"wrote {path} ({size / 1e6:.2f} MB), {near_tris} triangles")
    pts = {k: gl(p) for k, (p, g) in B.points.items()}
    wf, wr = I["wf"], I["wr"]
    rings, cogs = I["rings"], I["cogs"]
    entry = {
        "file": f"{vid}.glb",
        "mid": f"{vid}-mid.glb",
        "far": f"{s['body']}-far.glb",
        "body": s["body"],
        "variant": vid,
        "kind": s["kind"],
        "name": s["name"],
        "dims": {"length": round(hi.x - lo.x, 3), "width": round(bhi.y - blo.y, 3), "height": round(hi.z, 3), "front": round(hi.x, 3), "back": round(lo.x, 3)},
        "wheelbase": round(I["HF"].x - I["HR"].x, 3),
        "wheel": {"f": {"r": wf["r"], "width": wf["tw"]}, "r": {"r": wr["r"], "width": wr["tw"]}},
        "head_angle": s["ha"],
        "seat_angle": s["sa"],
        "rake": s["rake"],
        "crank": I["arm"],
        "crank_zero": "the right arm points forward (+x), the left back; pedals level",
        "pedal": {"from_crank": round(I["p_off"], 3), "q": round(I["q"] + I["p_off"], 3), "note": "pedal_l/pedal_r origins: the pedal body's centre on its spindle"},
        "teeth": [rings[0] if len(rings) < 3 else rings[1], cogs[len(cogs) // 2] if len(cogs) > 1 else cogs[0]],
        "rings": rings,
        "cogs": cogs,
        "points": pts,
        "steer": {"at": gl(I["SB"]), "axis": gl_dir(I["a"])},
        "levers": B.info["levers"],
        "kickstand": B.info.get("kickstand"),
        "has": {
            "lamp": s.get("lamp", "none"),
            "bell": bool(s.get("bell")),
            "basket": bool(s.get("basket")),
            "rack": bool(s.get("rack")) or bool(s.get("carrier")),
            "carrier": bool(s.get("carrier")),
            "pegs": bool(s.get("pegs")),
            "gyro": bool(s.get("gyro")),
            "studs": wf.get("tread") == "studded",
            "guards": bool(s.get("guards")),
            "gears": s.get("gears", 1),
            "hub_gears": 3 if s["wheel_r"].get("hub") == "drum" else 0,
            "fixed": bool(s.get("fixed")),
            "kickstand": bool(s.get("kickstand")),
            "chain_case": s.get("chain_guard") == "case",
        },
        "materials": mats,
        "tris": {"near": near_tris},
        "bytes": {"near": size},
        "colours": s["colours"],
        "colour2": s.get("colour2"),
        "hull": hull,
        "nodes": sorted(list(B.pivots) + (["collider"] if col else [])),
    }
    if s["wheel_r"].get("hub") == "drum":
        entry["hub_ratios"] = [0.75, 1.0, 1.333]
    entry["measured"] = {
        "saddle_y": round(B.points["saddle"][0].z, 3),
        "grip_y": round((B.points["grip_l"][0].z + B.points["grip_r"][0].z) / 2, 3),
        "bb_y": round(I["BB"].z, 3),
        "drop_y": round(B.points["drop_l"][0].z, 3) if "drop_l" in B.points else None,
    }
    if "--no-mid" not in argv:
        Bm, gm, mid_tris, _ = build_lod(vid, "mid")
        root = hang(Bm, gm, vid)
        mid = os.path.join(OUT, f"{vid}-mid.glb")
        msize = export(mid, root)
        btex.link(mid)
        msize = os.path.getsize(mid)
        entry["tris"]["mid"] = mid_tris
        entry["bytes"]["mid"] = msize
        print(f"wrote {mid} ({msize / 1e6:.2f} MB), {mid_tris} triangles")
    return entry


def build_far(body, vid):
    """One far model a body: its tubes as five-sided rods, its wheels as discs (a tyre ring, the spokes' alpha
    disc), the bars, the saddle, the cranks — a few hundred triangles, no pivots."""
    reset("mid")
    B, obs = bikes.build(vid)
    for o in list(kit.coll().objects):
        kit.kill(o)
    bk.LOD = "far"
    kit.SEG = 1.0
    I = B.info
    V = Vector
    made = []
    for name, pts, r, grp in I["far"]:
        pts = [V(p) for p in pts]
        if len(pts) > 3:
            pts = [pts[0], pts[len(pts) // 2], pts[-1]]
        made.append(bk.sweep("far_" + name, pts, max(r, 0.009), "paint", "frame", n=4, cap=(False, False)))
    for H, w in ((I["HF"], I["wf"]), (I["HR"], I["wr"])):
        prof = [(w["bead"] - 0.004, -w["tw"] / 2), (w["r"], -w["tw"] / 4), (w["r"], w["tw"] / 4), (w["bead"] - 0.004, w["tw"] / 2)]
        o = kit.lathe("far_tyre", prof + [prof[0]], 14, "tyre", "frame", axis="y", cap=False)
        o.data.transform(Matrix.Translation(H))
        made.append(o)
        d = bk.LOD
        bk.LOD = "mid"
        import bwheel

        made.append(bwheel.spoke_disc(H, w["bead"] - 0.008, "frame"))
        bk.LOD = d
    bp = I["bar_path"]
    bp = [bp[0], bp[len(bp) // 2], bp[-1]]
    full = [V((p.x, -p.y, p.z)) for p in bp[::-1]][:-1] + bp
    made.append(bk.sweep("far_bar", full, 0.013, "alloy", "frame", n=4, cap=(False, False)))
    made.append(bk.sweep("far_stem", [I["ST"], I["C"]], 0.012, "alloy", "frame", n=4, cap=(False, False)))
    made.append(kit.box("far_saddle", I["sit"] + V((0.03, 0, -0.02)), (0.25, 0.12, 0.04), "vinyl", "frame"))
    made.append(bk.sweep("far_post", [I["sit"] + V((0.04, 0, -0.03)), I["clamp"] + V((0, 0, -0.1))], 0.013, "alloy", "frame", n=4, cap=(False, False)))
    BB = I["BB"]
    made.append(bk.sweep("far_crank", [BB + V((-I["arm"], 0.08, 0)), BB + V((0, 0.06, 0)), BB + V((0, -0.06, 0)), BB + V((I["arm"], -0.08, 0))], 0.01, "alloy", "frame", n=4, cap=(False, False)))
    groups = {}
    for o in made:
        o["grp"] = "frame"
    groups = merged()
    tris = tri_count(groups)
    B.pivots = {"frame": (V((0, 0, 0)), None, "root")}
    root = hang(B, groups, f"{body}-far", with_points=False)
    path = os.path.join(OUT, f"{body}-far.glb")
    size = export(path, root)
    btex.link(path)
    size = os.path.getsize(path)
    print(f"wrote {path} ({size / 1e3:.0f} KB), {tris} triangles")
    return {"file": f"{body}-far.glb", "tris": tris, "bytes": size, "from": vid}


def main():
    man = {"version": 1, "frame": FRAME, "bikes": {}, "far": {}}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST) as f:
                old = json.load(f)
            man["bikes"].update(old.get("bikes", {}))
            man["far"].update(old.get("far", {}))
        except ValueError:
            pass
    done = set()
    for vid in ONLY:
        man["bikes"][vid] = build_variant(vid)
        body = vid.split("-")[0]
        if body not in done and "--no-far" not in argv:
            first = [v for v in bikes.ROAD_ORDER if v.startswith(body + "-")][0]
            man["far"][body] = build_far(body, first)
            done.add(body)
        for v in man["bikes"]:
            b = man["bikes"][v]["body"]
            if b in man["far"]:
                man["bikes"][v]["tris"]["far"] = man["far"][b]["tris"]
        with open(MANIFEST, "w") as f:
            json.dump(man, f, indent=1)
    print("wrote", MANIFEST)


if __name__ == "__main__":
    main()

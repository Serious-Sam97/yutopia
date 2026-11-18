# Plan 103 — the skateboards' GLBs checked against their contract (README.md). The nodes, their transforms and the
# triangle counts are read straight from each GLB's JSON chunk (glTF's own frame: x forward, y up, z right); the
# wheels' lowest points need the vertices (meshopt-packed), so the near file is imported into Blender for those.
#
#   blender -b --factory-startup -P tools/art/skate/check_glb.py -- [--board street-pop,…] [--dir DIR]
#
# Asserts, for every variant: the pivots and points exist and sit where the manifest says (≤ 1 mm); the pivots keep
# the board's orientation (the hangers' local y up, the wheels' local z the axle); hanger_* on axle_*; the wheels'
# bottoms at y = 0 (≤ 2 mm); the four wheels symmetric; each hanger turned ±20° about its local y keeps its two
# wheels on the ground within 2 mm of each other; x forward (nose ahead of the tail), toe = +z; the budgets (near
# ≤ 12k triangles and ≤ 600 KB, mid ≤ 1.5k, far ≤ 150); every material one of the kinds; no unnamed meshes; the
# mid with the same pivots and points; the far one root node and its meshes.
import json
import math
import os
import struct
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


DIR = arg("--dir", os.path.join(ROOT, "apps/client/public/life/skate"))
BUDGET = {"near": 12000, "mid": 1500, "far": 150}
NEAR_BYTES = 600_000
PIVOTS = ["deck", "hanger_f", "hanger_r", "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr", "collider"]
POINTS = ["deck", "nose", "tail", "bolts_f", "bolts_r", "foot_f", "foot_r", "axle_f", "axle_r", "grab_nose", "grab_tail", "grab_toe", "grab_heel", "grab_toe_f", "grab_heel_f", "grab_toe_r", "grab_heel_r"]
KINDS = {"deck_wood", "grip", "graphic", "paint", "paint2", "plastic", "alloy", "steel", "rubber", "urethane", "bearing", "collider"}
PARENT = {"hanger_f": "deck", "hanger_r": "deck", "wheel_fl": "hanger_f", "wheel_fr": "hanger_f", "wheel_rl": "hanger_r", "wheel_rr": "hanger_r", "axle_f": "hanger_f", "axle_r": "hanger_r"}


def read_json(path):
    data = open(path, "rb").read()
    ln, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    return json.loads(data[20 : 20 + ln])


def mat_trs(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    s = n.get("scale", [1, 1, 1])
    R = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [[R[r][0] * s[0], R[r][1] * s[1], R[r][2] * s[2], t[r]] for r in range(3)] + [[0, 0, 0, 1]]


def mul(A, B):
    return [[sum(A[r][k] * B[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def world(js):
    nodes = js["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i
    W = {}

    def get(i):
        if i in W:
            return W[i]
        M = mat_trs(nodes[i])
        if i in parent:
            M = mul(get(parent[i]), M)
        W[i] = M
        return M

    out = {}
    for i, n in enumerate(nodes):
        out[n.get("name", f"#{i}")] = (get(i), i)
    names = {i: n.get("name") for i, n in enumerate(nodes)}
    return out, {names[c]: names[p] for c, p in parent.items()}


def pos(M):
    return [M[0][3], M[1][3], M[2][3]]


def col(M, k):
    v = [M[0][k], M[1][k], M[2][k]]
    L = math.sqrt(sum(x * x for x in v))
    return [x / L for x in v]


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def tris(js, skip=("collider",)):
    t = 0
    sk = {n["mesh"] for n in js["nodes"] if "mesh" in n and any(n.get("name", "").startswith(s) for s in skip)}
    for mi, m in enumerate(js.get("meshes", [])):
        if mi in sk:
            continue
        for p in m["primitives"]:
            t += js["accessors"][p["indices"]]["count"] // 3 if "indices" in p else js["accessors"][p["attributes"]["POSITION"]]["count"] // 3
    return t


def wheel_lows(path, turns=(0.0, 20.0, -20.0)):
    """The lowest world height of each wheel (glTF y = Blender z after the import), with the hangers turned by each
    angle about their own vertical."""
    import bpy
    from mathutils import Matrix

    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = open(path, "rb").read()
    ln, _ = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20 : 20 + ln])
    js.pop("extensionsRequired", None)
    for k in ("images", "textures", "samplers"):
        js.pop(k, None)
    for m in js.get("materials", []):
        m.get("pbrMetallicRoughness", {}).pop("baseColorTexture", None)
        m.get("pbrMetallicRoughness", {}).pop("metallicRoughnessTexture", None)
        m.pop("normalTexture", None)
    j = json.dumps(js).encode()
    j += b" " * ((4 - len(j) % 4) % 4)
    rest = data[20 + ln :]
    tmp = os.path.join(tempfile.gettempdir(), "skate-check.glb")
    open(tmp, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + len(rest)) + struct.pack("<II", len(j), 0x4E4F534A) + j + rest)
    bpy.ops.import_scene.gltf(filepath=tmp)
    ob = bpy.data.objects
    out = {}
    for ang in turns:
        for h in ("hanger_f", "hanger_r"):
            e = ob[h]
            e.matrix_basis = Matrix.Translation(e.matrix_basis.translation) @ Matrix.Rotation(math.radians(ang if h == "hanger_f" else -ang), 4, "Z")
        bpy.context.view_layer.update()
        res = {}
        for w in ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"):
            lo = None
            for o in [ob[w]] + list(ob[w].children_recursive):
                if o.type != "MESH":
                    continue
                M = o.matrix_world
                for v in o.data.vertices:
                    z = (M @ v.co).z
                    lo = z if lo is None else min(lo, z)
            res[w] = lo
        out[ang] = res
    return out


def check(vid, e, fails):
    def ok(cond, msg):
        if not cond:
            fails.append(f"{vid}: {msg}")
        return cond

    near = os.path.join(DIR, e["file"])
    js = read_json(near)
    W, par = world(js)
    for n in PIVOTS + POINTS + [vid]:
        ok(n in W, f"node {n} missing")
    for n, p in PARENT.items():
        ok(par.get(n) == p, f"{n} under {par.get(n)}, not {p}")
    for n in POINTS:
        if n in W and n in e["points"]:
            d = dist(pos(W[n][0]), e["points"][n])
            ok(d <= 0.001, f"point {n} {d * 1000:.2f} mm off the manifest")
            if n not in ("axle_f", "axle_r", "deck"):
                ok(par.get(n) == "deck", f"point {n} not under deck")
    for n, p in e["pivots"].items():
        if n in W:
            ok(dist(pos(W[n][0]), p) <= 0.001, f"pivot {n} off the manifest")
    for h, a in (("hanger_f", "axle_f"), ("hanger_r", "axle_r")):
        ok(dist(pos(W[h][0]), pos(W[a][0])) <= 0.001, f"{h} not on {a}")
    for n in ("deck", "hanger_f", "hanger_r", "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"):
        ok(col(W[n][0], 1)[1] > 0.9999 and col(W[n][0], 2)[2] > 0.9999, f"{n} not in the board's orientation")
    P = {n: pos(W[n][0]) for n in W}
    ok(P["nose"][0] > P["tail"][0] and P["axle_f"][0] > P["axle_r"][0], "x not forward")
    ok(P["grab_toe"][2] > 0 > P["grab_heel"][2], "toe not +z")
    ok(abs(P["deck"][0]) < 0.001 and abs(P["deck"][2]) < 0.001, "deck pivot not over the origin")
    ok(abs(P["axle_f"][0] + P["axle_r"][0]) < 0.001, "the origin not under the axles' middle")
    fl, fr, rl, rr = P["wheel_fl"], P["wheel_fr"], P["wheel_rl"], P["wheel_rr"]
    ok(abs(fl[2] + fr[2]) < 0.0005 and abs(rl[2] + rr[2]) < 0.0005 and abs(fl[2] - rl[2]) < 0.0005, "wheels not symmetric across")
    ok(abs(fl[0] - fr[0]) < 0.0005 and abs(rl[0] - rr[0]) < 0.0005 and abs(fl[1] - rl[1]) < 0.0005, "wheels not paired")
    ok(fl[2] < 0 < fr[2], "wheel_fl not on the left (−z)")
    # the budgets and bytes
    t = {"near": tris(js), "mid": tris(read_json(os.path.join(DIR, e["mid"]))), "far": tris(read_json(os.path.join(DIR, e["far"])))}
    for k, v in t.items():
        ok(v <= BUDGET[k], f"{k} {v} triangles > {BUDGET[k]}")
        ok(e["tris"].get(k) == v, f"manifest's {k} triangles {e['tris'].get(k)} ≠ {v}")
    ok(os.path.getsize(near) <= NEAR_BYTES, f"near {os.path.getsize(near) / 1e3:.0f} KB > 600")
    ok(e["bytes"]["near"] == os.path.getsize(near), "manifest's near bytes stale")
    # materials, names
    for path in (near, os.path.join(DIR, e["mid"]), os.path.join(DIR, e["far"])):
        j = read_json(path)
        names = {m.get("name") for m in j.get("materials", [])}
        bad = names - KINDS
        ok(not bad, f"{os.path.basename(path)}: materials not in the list: {sorted(bad)}")
        for m in j.get("meshes", []):
            ok(bool(m.get("name")), f"{os.path.basename(path)}: an unnamed mesh")
        for n in j["nodes"]:
            ok(bool(n.get("name")), f"{os.path.basename(path)}: an unnamed node")
            if "mesh" in n:
                kind = n["name"].split("-")[-1]
                ok(kind in KINDS, f"{os.path.basename(path)}: mesh node {n['name']} not named by its kind")
        if path == near:
            ok(sorted(names - {"collider"}) == e["materials"], f"manifest's materials {e['materials']} ≠ {sorted(names - {'collider'})}")
    # the mid: the same pivots and points
    Wm, parm = world(read_json(os.path.join(DIR, e["mid"])))
    for n in PIVOTS + POINTS:
        if ok(n in Wm, f"mid: node {n} missing") and n in W:
            ok(dist(pos(Wm[n][0]), pos(W[n][0])) <= 0.001, f"mid: {n} moved")
    # the far: one root, its meshes
    jf = read_json(os.path.join(DIR, e["far"]))
    roots = set(range(len(jf["nodes"]))) - {c for n in jf["nodes"] for c in n.get("children", [])}
    ok(len(roots) == 1 and all("mesh" in jf["nodes"][c] for c in jf["nodes"][list(roots)[0]].get("children", [])), "far: not one root over its meshes")
    # the wheels on the ground, straight and turned
    lows = wheel_lows(near)
    for ang, res in lows.items():
        for w, z in res.items():
            ok(z is not None and abs(z) <= 0.002, f"{w}'s bottom at y = {z:.4f} with the hangers at ±{ang:.0f}°")
        for a, b in (("wheel_fl", "wheel_fr"), ("wheel_rl", "wheel_rr")):
            ok(abs(res[a] - res[b]) <= 0.002, f"{a}/{b} {abs(res[a] - res[b]) * 1000:.1f} mm apart in height at {ang:.0f}°")
    return t, lows, P


def main():
    man = json.load(open(os.path.join(DIR, "manifest.json")))
    only = arg("--board")
    fails = []
    for vid, e in man["boards"].items():
        if only and vid not in only.split(","):
            continue
        t, lows, P = check(vid, e, fails)
        lo = min(min(r.values()) for r in lows.values())
        hi = max(max(r.values()) for r in lows.values())
        print(f"{vid:16s} near {t['near']:6d} mid {t['mid']:5d} far {t['far']:4d}  wheels y {lo * 1000:+.2f}..{hi * 1000:+.2f} mm  deck {P['deck'][1]:.4f}  nose {P['nose'][1]:.3f} tail {P['tail'][1]:.3f}")
    for shape, f in man["far"].items():
        ok_ = f["tris"] <= BUDGET["far"]
        if not ok_:
            fails.append(f"{shape}-far: {f['tris']} triangles")
    if fails:
        print("FAIL")
        for f in fails:
            print("  " + f)
        sys.exit(1)
    print("ALL OK")


main()

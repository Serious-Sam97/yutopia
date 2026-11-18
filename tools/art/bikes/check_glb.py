# Plan 101 — the bikes' GLBs checked against their contract (README.md). The nodes, their transforms and the
# triangle counts are read straight from each GLB's JSON chunk (glTF's own frame: x forward, y up, z right); the
# wheels' lowest points need the vertices (meshopt-packed), so the near file is imported into Blender for those.
#
#   blender -b --factory-startup -P tools/art/bikes/check_glb.py -- [--bike town-classic,…] [--dir DIR]
#
# Asserts, for every variant: the nodes exist (the pivots, the points it should have); steer's local +y lies along
# the head tube (steer_bottom → steer_top) within 1°; spin_f/spin_r sit on hub_f/hub_r within 2 mm; crank on bb;
# bb on the origin's vertical (x = z = 0); the tyres touch y = 0 (± 5 mm); x forward (hub_f.x > hub_r.x, lamp_f
# ahead of the bars); the triangle budgets (near ≤ 45k, mid ≤ 8k, far ≤ 600); near ≤ 1.5 MB; the mid file has the
# same pivots as the near.
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "../../..")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


DIR = arg("--dir", os.path.join(ROOT, "apps/client/public/life/bikes"))
BUDGET = {"near": 45000, "mid": 8000, "far": 600}
PIVOTS = ["frame", "steer", "wheel_f", "spin_f", "lever_l", "lever_r", "wheel_r", "spin_r", "crank", "pedal_l", "pedal_r"]
POINTS = ["saddle", "grip_l", "grip_r", "bb", "hub_f", "hub_r", "lamp_r", "steer_top", "steer_bottom"]


def read_json(path):
    data = open(path, "rb").read()
    ln, kind = struct.unpack_from("<II", data, 12)
    assert kind == 0x4E4F534A
    return json.loads(data[20 : 20 + ln])


# ── 4×4 matrices as lists (row-major) ─────────────────────────────────────────────────────────────────────────


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
    return out, parent


def pos(M):
    return [M[0][3], M[1][3], M[2][3]]


def col(M, k):
    v = [M[0][k], M[1][k], M[2][k]]
    L = math.sqrt(sum(x * x for x in v))
    return [x / L for x in v]


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def tris(js, skip_names=("collider",)):
    t = 0
    skip = set()
    for n in js["nodes"]:
        if "mesh" in n and any(n.get("name", "").startswith(s) for s in skip_names):
            skip.add(n["mesh"])
    for mi, m in enumerate(js.get("meshes", [])):
        if mi in skip:
            continue
        for p in m["primitives"]:
            if "indices" in p:
                t += js["accessors"][p["indices"]]["count"] // 3
            else:
                t += js["accessors"][p["attributes"]["POSITION"]]["count"] // 3
    return t


def lowest(path, under):
    """The lowest world y (glTF) of the meshes under a node (Blender's import: its z)."""
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = open(path, "rb").read()
    ln, _ = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20 : 20 + ln])
    js.pop("extensionsRequired", None)
    j = json.dumps(js).encode()
    j += b" " * ((4 - len(j) % 4) % 4)
    rest = data[20 + ln :]
    tmp = os.path.join(os.environ.get("TMPDIR", "/tmp"), "bike-check.glb")
    open(tmp, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + len(rest)) + struct.pack("<II", len(j), 0x4E4F534A) + j + rest)
    bpy.ops.import_scene.gltf(filepath=tmp)
    out = {}
    for name in under:
        root = bpy.data.objects.get(name)
        lo = None
        if root is None:
            out[name] = None
            continue
        for o in [root] + list(root.children_recursive):
            if o.type != "MESH":
                continue
            M = o.matrix_world
            for v in o.data.vertices:
                z = (M @ v.co).z
                lo = z if lo is None else min(lo, z)
        out[name] = lo
    return out


def check(vid, entry, fails):
    def ok(cond, msg):
        if not cond:
            fails.append(f"{vid}: {msg}")
        return cond

    near = os.path.join(DIR, entry["file"])
    mid = os.path.join(DIR, entry["mid"])
    far = os.path.join(DIR, entry["far"])
    js = read_json(near)
    W, _ = world(js)
    names = set(W)
    want = list(PIVOTS) + list(POINTS) + ["collider", vid]
    if entry["body"] == "road":
        want += ["drop_l", "drop_r"]
    if entry.get("kickstand"):
        want += ["kickstand", "stand_foot"]
    if entry["has"]["lamp"] != "none":
        want += ["lamp_f"]
    if entry["has"]["bell"]:
        want += ["bell"]
    if entry["has"]["pegs"]:
        want += ["peg_fl", "peg_fr", "peg_rl", "peg_rr"]
    if entry["has"]["gyro"]:
        want += ["bars_spin"]
    for n in want:
        ok(n in names, f"node {n} missing")
    P = {n: pos(W[n][0]) for n in names if n in W}
    # steer's +y along the head tube
    if "steer" in W and "steer_top" in P:
        y = col(W["steer"][0], 1)
        ht = [a - b for a, b in zip(P["steer_top"], P["steer_bottom"])]
        L = math.sqrt(sum(x * x for x in ht))
        ang = math.degrees(math.acos(max(-1, min(1, sum(a * b / L for a, b in zip(y, ht))))))
        ok(ang <= 1.0, f"steer +y off the head tube by {ang:.2f}°")
        z = col(W["steer"][0], 2)
        ok(z[2] > 0.99, f"steer +z not to the right ({z})")
        ok(dist(P["steer"], P["steer_bottom"]) < 0.002, "steer's origin not at steer_bottom (on the axis)")
    ok(dist(P["spin_f"], P["hub_f"]) <= 0.002, f"spin_f {dist(P['spin_f'], P['hub_f']) * 1000:.1f} mm off hub_f")
    ok(dist(P["spin_r"], P["hub_r"]) <= 0.002, f"spin_r {dist(P['spin_r'], P['hub_r']) * 1000:.1f} mm off hub_r")
    ok(dist(P["crank"], P["bb"]) <= 0.002, "crank off bb")
    ok(abs(P["bb"][0]) < 0.001 and abs(P["bb"][2]) < 0.001, f"bb not over the origin ({P['bb']})")
    ok(P["hub_f"][0] > P["hub_r"][0], "x not forward (hub_f behind hub_r)")
    ok(P["saddle"][0] < P["grip_l"][0], "saddle ahead of the grips")
    if "lamp_f" in P:
        ok(P["lamp_f"][0] > P["steer_top"][0], "lamp_f behind the head tube")
    ok(P["grip_l"][2] < 0 < P["grip_r"][2], "grip_l not on the left (−z) / grip_r on the right")
    # the spins' axles: local z along the bike's z
    for s in ("spin_f", "spin_r", "crank", "pedal_l", "pedal_r"):
        z = col(W[s][0], 2)
        ok(z[2] > 0.999, f"{s}'s local z isn't the axle")
    if "kickstand" in W and entry.get("kickstand"):
        x = col(W["kickstand"][0], 0)
        ok(abs(math.sqrt(sum(v * v for v in x)) - 1) < 1e-3, "kickstand axis")
    # the budgets
    t = {"near": tris(js), "mid": tris(read_json(mid)), "far": tris(read_json(far))}
    for k, v in t.items():
        ok(v <= BUDGET[k], f"{k} {v} triangles > {BUDGET[k]}")
    ok(os.path.getsize(near) <= 1.5e6, f"near {os.path.getsize(near) / 1e6:.2f} MB > 1.5")
    # the mid's pivots the same
    Wm, _ = world(read_json(mid))
    for n in PIVOTS:
        ok(n in Wm, f"mid: node {n} missing")
        if n in Wm and n in W:
            ok(dist(pos(Wm[n][0]), pos(W[n][0])) < 0.002, f"mid: {n} moved")
    # the tyres on the ground
    lo = lowest(near, ["spin_f", "spin_r"])
    for k, v in lo.items():
        ok(v is not None and abs(v) <= 0.005, f"{k}'s lowest point at y = {v}")
    return t, lo, P


def main():
    man = json.load(open(os.path.join(DIR, "manifest.json")))
    only = arg("--bike")
    fails = []
    for vid, e in man["bikes"].items():
        if only and vid not in only.split(","):
            continue
        t, lo, P = check(vid, e, fails)
        print(f"{vid:14s} near {t['near']:6d} mid {t['mid']:5d} far {t['far']:4d}  tyres y {lo['spin_f']:+.4f} {lo['spin_r']:+.4f}  saddle {P['saddle'][1]:.3f} grips {P['grip_l'][1]:.3f} bb {P['bb'][1]:.3f}")
    if fails:
        print("FAIL")
        for f in fails:
            print("  " + f)
        sys.exit(1)
    print("ALL OK")


main()

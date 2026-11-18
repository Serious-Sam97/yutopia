# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the parks for the game: both parks' ramps (the board's own
# profiles, pieces.py), the hall's inside and outside (hall.py), the two racks, and every build-menu piece kind
# (`sk_*`, in its footprint's frame), each near and mid, as GLBs in apps/client/public/life/skate-parks/ with a
# manifest.json the game reads (files, origins, triangles, bytes, the fittings' lights, which materials glow at
# night and which the snow dusts).
#
#   pnpm --dir packages/shared exec tsx ../../tools/art/skate-parks/dump.mts      (the numbers, first)
#   blender -b --factory-startup -P tools/art/skate-parks/ptex.py -- --encode    (the textures)
#   blender -b --factory-startup -P tools/art/skate-parks/build_parks.py -- [--only hall,yard,shell,racks,kinds]
#
# Frames: glTF y-up, three's (x east, y up, z south = the Grounds' z), metres. A park's (and the hall's) origin at
# its plot's north-west corner on its floor (x0, h, z0); a rack's at its own point (racks.ts: x, y, z), facing −z
# (north) as the game turns it; a kind's at its footprint's corner (the kit's frame: x across, z down).
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hall  # noqa: E402
import pieces as P  # noqa: E402
import pkit as K  # noqa: E402
import racks as R  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ONLY = (argv[argv.index("--only") + 1] if "--only" in argv else "hall,yard,shell,racks,kinds").split(",")
OUT = K.OUT
MAN = os.path.join(OUT, "manifest.json")
BUDGET = {"ramps": {"near": 160_000, "mid": 30_000}, "shell": {"near": 60_000, "mid": 12_000}, "kind": {"near": 8_000, "mid": 1_500}}


def reset(lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    K._BL.clear()
    K.reset_bufs()
    K.TEXTURED = False
    K.LOD = lod


def write(name, lod, root):
    objs = K.objects()
    n = K.tris([o for obs in objs.values() for o in obs])
    path = os.path.join(OUT, f"{name}{'' if lod == 'near' else '-' + lod}.glb")
    size = K.export(path, objs, root)
    mats = sorted({o.data.materials[0].name for obs in objs.values() for o in obs})
    print(f"wrote {os.path.basename(path)}: {n} tris, {size} bytes", flush=True)
    return {"file": os.path.basename(path), "tris": n, "bytes": size, "materials": mats}


def park_glb(key, lod):
    reset(lod)
    pcs, p = K.pieces_of(key)
    park = K.Park(pcs, p["h"], "wood" if p["indoor"] else "concrete")
    K.frame((p["x0"], p["z0"], p["h"]))
    P.build_park(park)
    return write(f"{key}-ramps", lod, f"{key}-ramps"), [p["x0"], p["h"], p["z0"]]


def shell_glb(which, lod, lights):
    reset(lod)
    H = K.DATA["hall"]
    K.frame((H["x0"], H["z0"], H["h"]))
    if which == "in":
        hall.inside(H, K.DATA["shop"], lights)
    else:
        hall.outside(H)
    return write(f"hall-{which}", lod, f"hall-{which}")


def kind_glb(kind, style, lod):
    """A build-menu piece in its footprint (x across, z down — the kit's frame): placed as piecesOfThings places a
    thing at rot 0 on (0, 0)."""
    reset(lod)
    f = K.DATA["fits"][kind]
    Q = math.pi / 2
    at = f["at"]
    yaw = 0.0 if f["along"] == "u" else -Q
    pc = {"kind": f["piece"], "x": at[0], "y": at[1], "z": 0.0, "yaw": yaw}
    park = K.Park([pc], f["lift"], style)
    K.frame((0.0, 0.0, 0.0))
    P.build_park(park, seed=hash(kind) % 1000, tags=1 if style == "wood" else 0)
    return write(f"kind-{kind}-{style}", lod, f"{kind}-{style}")


if __name__ == "__main__":
    man = json.load(open(MAN)) if os.path.exists(MAN) else {}
    man.update({"version": 1, "frame": "glTF y-up = three's: x east, y up, z south (the Grounds' z), metres"})
    man.setdefault("parks", {})
    man.setdefault("kinds", {})
    for key in ("hall", "yard"):
        if key not in ONLY:
            continue
        near, origin = park_glb(key, "near")
        mid, _ = park_glb(key, "mid")
        man["parks"][key] = {"origin": origin, "near": near, "mid": mid}
    if "shell" in ONLY:
        H = K.DATA["hall"]
        lights = []
        shell = {}
        for which in ("in", "out"):
            shell[which] = {"near": shell_glb(which, "near", lights if which == "in" else [])}
            shell[which]["mid"] = shell_glb(which, "mid", [])
        man["hall"] = {
            "origin": [H["x0"], H["h"], H["z0"]],
            **shell,
            # (the fittings: floor x, y south, z up — the game's lamps hang at each)
            "lights": lights,
            "glow": {"winglow": "windows", "signlit": "sign"},
        }
    if "racks" in ONLY:
        man["racks"] = {}
        for style in ("hall", "yard"):
            reset("near")
            K.frame((0.0, 0.0, 0.0))
            R.rack(style)
            man["racks"][style] = write(f"rack-{style}", "near", f"rack-{style}")
    if "kinds" in ONLY:
        for kind in K.DATA["fits"]:
            for style in ("wood", "concrete"):
                if kind in ("sk_rail", "sk_kinkrail") and style == "concrete":
                    continue
                man["kinds"].setdefault(kind, {})[style] = {"near": kind_glb(kind, style, "near"), "mid": kind_glb(kind, style, "mid")}
    man["snow"] = ["conc", "conctop", "concside"]
    json.dump(man, open(MAN, "w"), indent=1)
    print("manifest", MAN)

# Plan 106 — our clips measured the way capture.py measures the real skaters (heights, bends, spreads, elevations), so
# the two can be held side by side: the rig solved per frame (build.py), its joints by FK (rig.py).
#
#   blender -b --factory-startup -P tools/art/skate-anim/audit.py -- [--only stance,push] [--every 6]
import math
import os
import sys

import bpy  # noqa: F401
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402
import clips as C  # noqa: E402
import rig as R  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ONLY = set((argv[argv.index("--only") + 1] if "--only" in argv else "").split(",")) - {""}
EVERY = int(argv[argv.index("--every") + 1]) if "--every" in argv else 6


def ang(a, b):
    return math.degrees(a.normalized().angle(b.normalized())) if a.length > 1e-6 and b.length > 1e-6 else 0.0


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig = R.Rig("man")
    leg = R.THIGH + R.SHIN
    print("clip         t     hipN  kneeF kneeB  spread kneeW/ankW tilt  armF  armB  elbF  elbB  soleF soleB")
    for cid, spec in C.CLIPS.items():
        if ONLY and cid not in ONLY:
            continue
        _ob, act, end = B.author(spec)
        prev = None
        for f in range(0, end + 1):
            s = B.solve(rig, B.sample(act, f), spec["space"], prev)
            prev = s
            if f % EVERY and f != end:
                continue
            J = rig.fk(s["j"], s["lift"])
            p = {k: v[0] for k, v in J.items()}
            hip = (p["thighL"] + p["thighR"]) / 2
            sh = (p["shoulderL"] + p["shoulderR"]) / 2
            soleL = p["ankleL"].y - R.ANKLE
            soleR = p["ankleR"].y - R.ANKLE
            lo = min(soleL, soleR)
            kL = 180 - ang(p["thighL"] - p["kneeL"], p["ankleL"] - p["kneeL"])
            kR = 180 - ang(p["thighR"] - p["kneeR"], p["ankleR"] - p["kneeR"])
            spread = (p["ankleL"] - p["ankleR"]).length / leg
            kw = (p["kneeL"] - p["kneeR"]).length / max(1e-3, (p["ankleL"] - p["ankleR"]).length)
            tilt = ang(sh - hip, Vector((0, 1, 0)))
            down = hip - sh
            aL = ang(p["elbowL"] - p["shoulderL"], down)
            aR = ang(p["elbowR"] - p["shoulderR"], down)
            eL = 180 - ang(p["shoulderL"] - p["elbowL"], p["wristL"] - p["elbowL"])
            eR = 180 - ang(p["shoulderR"] - p["elbowR"], p["wristR"] - p["elbowR"])
            print(f"{cid[:12]:12s} {f / B.FPS:4.2f}  {(hip.y - lo) / leg:.2f}  {kL:5.0f} {kR:5.0f}   {spread:.2f}   {kw:4.2f}"
                  f"    {tilt:4.0f}  {aL:4.0f}  {aR:4.0f}  {eL:4.0f}  {eR:4.0f}  {(soleL - lo) / leg:.2f}  {(soleR - lo) / leg:.2f}")


main()

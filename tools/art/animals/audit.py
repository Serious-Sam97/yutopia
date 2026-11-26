# Every clip of every animal measured (docs/plan/129-animal-animations.md, F2a): each built model
# (apps/client/public/life/animals/<model>.glb) loaded, each clip skinned frame by frame, and from its vertices:
#   ground speed   — the clip is played in place: what's on the ground moves back at the speed the body would go.
#                    The median of that is the clip's own speed (m/s at its rate 1); the game plays it at
#                    its speed / this (plan 129 F5).
#   slide          — how much what's on the ground doesn't move together (feet skating against each other), m/s.
#   floats / sinks — its lowest point above the ground, or through it, across the clip (m, against its size).
#   seam           — a looped clip's last frame against its first (m, the most any vertex jumps).
#   still          — a clip that barely moves (a rest pose where there should be a clip).
# Out: tools/art/animals/audit.json (each model, each clip) and the clip speeds into the models' manifest.
#
#   /opt/homebrew/bin/blender -b --factory-startup -P tools/art/animals/audit.py [-- --only bear,wolf]
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import build_animals as B  # noqa: E402

ONCE = {"die", "attack", "kick", "hitL", "hitR", "jump", "stamp"}
MOVES = {"walk", "trot", "run", "swim"}


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


FEET = ("IKFrontLeg.L", "IKFrontLeg.R", "IKBackLeg.L", "IKBackLeg.R", "foot.L", "foot.R", "hand.L", "hand.R")


def feet_speed(R, frames, dt):
    """By the feet themselves (where the rig has foot bones: the IK roots, a bird's or a hare's foot): a foot down —
    within a little of its lowest in the clip — moves back at the ground's speed; the median of that is the clip's
    speed, the spread of it the slide. None when the rig has none."""
    feet = [f for f in FEET if f in R.rest]
    if not feet:
        return None
    pos = {f: [] for f in feet}
    for p in frames:
        P = R.fk(p)
        for f in feet:
            pos[f].append(P[f].to_translation())
    v = []
    for f in feet:
        zs = [q.z for q in pos[f]]
        lo, hi = min(zs), max(zs)
        # (a squirrel's foot lifts a few millimetres: its own lift's share, not a floor of millimetres)
        down = lo + max(0.0005, (hi - lo) * 0.12)
        for i in range(len(frames) - 1):
            if pos[f][i].z <= down and pos[f][i + 1].z <= down:
                v.append(-(pos[f][i + 1].x - pos[f][i].x) / dt)
    if len(v) < 3:
        return None
    v = np.array(v)
    m = float(np.median(v))
    return m, float(np.median(np.abs(v - m)))


def measure(R, frames, dt=1.0 / B.FPS):
    pts = np.array([R.skin(p) for p in frames])  # (F, N, 3), metres, nose +X, z up
    size = R.size
    F = len(frames)
    low = pts[:, :, 2].min(1)  # each frame's lowest
    # what's on the ground: within 2% of its height of the lowest this frame, and the next
    eps = max(0.01, size * 0.02)
    back = []
    spread = []
    for f in range(F - 1):
        on = (pts[f, :, 2] - low[f] < eps) & (pts[f + 1, :, 2] - low[f + 1] < eps)
        if on.sum() < 3:
            continue
        v = (pts[f + 1, on, :2] - pts[f, on, :2]) / dt  # (n, 2)
        back.append(-np.median(v[:, 0]))
        spread.append(float(np.median(np.abs(v[:, 0] - np.median(v[:, 0]))) + np.median(np.abs(v[:, 1]))))
    speed = float(np.median(back)) if back else 0.0
    slide = float(np.median(spread)) if spread else 0.0
    fs = feet_speed(R, frames, dt)
    if fs:
        speed, slide = fs
    move = float(np.abs(pts - pts[0]).max())
    seam = float(np.abs(pts[-1] - pts[0]).max())
    return {
        "frames": F,
        "speed": round(speed, 3),
        "slide": round(slide, 3),
        "floats": round(float(low.min()), 3),
        "sinks": round(float(-min(0.0, low.min())), 3),
        "lift": round(float(low.max()), 3),
        "seam": round(seam, 3),
        "moves": round(move, 3),
        "size": round(size, 3),
    }


def audit(model):
    B.SRC = B.OUT
    arm, mo, acts = B.load(model, yaw=0.0)
    R = B.Rig(arm, mo, acts)
    out = {}
    made = json.load(open(os.path.join(B.OUT, "manifest.json"))).get(model, {}).get("gaits", {})
    for name, act in acts.items():
        # (a gait keyed quicker than 24 a second: read at its own keys' rate)
        fps = made.get(name, {}).get("fps", B.FPS)
        frames = R.sample(act, step=B.FPS / fps)
        if len(frames) < 2:
            continue
        m = measure(R, frames, 1.0 / fps)
        size = m["size"] or 1
        flags = []
        if name not in ONCE and m["seam"] > 0.04 * size:
            flags.append("seam")
        if m["moves"] < 0.004 * size:
            flags.append("still")
        if m["lift"] > 0.06 * size and name not in {"fly", "glide", "jump", "swim", "die", "attack", "run", "trot"}:
            flags.append("floats")
        if m["sinks"] > 0.03 * size:
            flags.append("sinks")
        if name in MOVES and m["speed"] < 0.05:
            flags.append("no-stride")
        if name in MOVES and m["speed"] > 0 and m["slide"] > 0.35 * m["speed"]:
            flags.append("slides")
        if name in {"idle", "idle2", "look", "eat", "lie", "sit", "drink", "sniff", "groom", "howl"} and m["slide"] > 0.08:
            flags.append("skates")
        m["flags"] = flags
        out[name] = m
    return out


def main():
    only = arg("--only")
    man_path = os.path.join(B.OUT, "manifest.json")
    manifest = json.load(open(man_path))
    names = [n for n in manifest if not n.startswith("_")]
    if only:
        names = [n for n in names if n in only.split(",")]
    path = os.path.join(os.path.dirname(__file__), "audit.json")
    report = json.load(open(path)) if os.path.exists(path) and only else {}
    for n in names:
        report[n] = audit(n)
        bad = {c: m["flags"] for c, m in report[n].items() if m["flags"]}
        sp = {c: report[n][c]["speed"] for c in ("walk", "trot", "run") if c in report[n]}
        print(f"[audit] {n}: speeds {sp} flags {bad}")
        # the clip speeds into the manifest (the client plays each at its speed / this)
        # (a gait the build made: its own speed, exact; the rest as measured — the client's bench measures the made
        # ones as the game plays them (/dev/animals, __animalBench.measure): the truer word on birds, whose feet this
        # reads short)
        made = manifest[n].get("gaits", {})
        manifest[n]["speeds"] = {
            **{c: report[n][c]["speed"] for c in MOVES if c in report[n] and report[n][c]["speed"] > 0.05 and c not in made},
            **{c: v["speed"] for c, v in made.items()},
        }
    with open(path, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    with open(man_path, "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()

# Plan 104 F4a — the game's rig, in Blender's Python (mathutils), for the skater's clips.
#
# The game's pose format (apps/client/src/world/chars/rig.ts): each joint an Euler (x, y, z) in radians, in three.js's
# "XYZ" order (the matrix Rx·Ry·Rz — mathutils' order "ZYX"), under its parent; at rest no joint is turned, the
# person faces +z, x is her own left, y up. The hips are placed at their rest + a `lift` (m). Every bone of the person
# (PersonModel's) is made unturned at the joint's place, so a pose is that and nothing more.
#
# The legs are the rig's (chars/moves.ts THIGH, SHIN, ANKLE, HIP_H — read from that file): every pose solves them,
# and a life body's own legs are fitted to the rig's after (chars/model.ts fitLeg: its ankle where the rig's is, its
# thigh joint HIP_H − hipY under its own, straight down the root). The trunk and the arms are a life file's
# (public/life/person-<who>.glb: its joints' places), the arms straight down at rest as the client makes them.
#
# Everything here is in her space: x her left, y up, z ahead, the root on the ground (the board's contact).
import json
import math
import os
import re
import struct

from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "../../.."))

JOINTS = [
    "hips", "spine", "chest", "neck", "head",
    "shoulderL", "elbowL", "wristL", "fingersL", "indexL", "thumbL",
    "shoulderR", "elbowR", "wristR", "fingersR", "indexR", "thumbR",
    "thighL", "kneeL", "ankleL", "toeL", "thighR", "kneeR", "ankleR", "toeR",
]
PARENT = {
    "hips": None, "spine": "hips", "chest": "spine", "neck": "chest", "head": "neck",
    "shoulderL": "chest", "elbowL": "shoulderL", "wristL": "elbowL",
    "fingersL": "wristL", "indexL": "wristL", "thumbL": "wristL",
    "shoulderR": "chest", "elbowR": "shoulderR", "wristR": "elbowR",
    "fingersR": "wristR", "indexR": "wristR", "thumbR": "wristR",
    "thighL": "hips", "kneeL": "thighL", "ankleL": "kneeL", "toeL": "ankleL",
    "thighR": "hips", "kneeR": "thighR", "ankleR": "kneeR", "toeR": "ankleR",
}


def _const(src, name):
    m = re.search(rf"export const {name} = ([0-9.()*/+\- ]+);", src)
    if not m:
        raise RuntimeError(f"moves.ts: no {name}")
    expr = m.group(1)
    if not re.fullmatch(r"[0-9.()*/+\- ]+", expr):
        raise RuntimeError(expr)
    return float(eval(expr, {"__builtins__": {}}))  # noqa: S307 (digits and operators only)


_moves = open(os.path.join(ROOT, "apps/client/src/world/chars/moves.ts")).read()
THIGH = _const(_moves, "THIGH")
SHIN = THIGH  # (moves.ts: SHIN = THIGH)
ANKLE = _const(_moves, "ANKLE")
BALL = _const(_moves, "BALL")
HIP_H = THIGH + SHIN + ANKLE


def glb_json(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20 : 20 + n])


def e2m(e):
    """three.js XYZ Euler → a 3×3 rotation."""
    return Euler((e[0], e[1], e[2]), "ZYX").to_matrix()


def m2e(m, compat=None):
    """A rotation → three.js XYZ Euler (the closest to `compat`, unwrapped)."""
    if compat is not None:
        e = m.to_euler("ZYX", Euler(compat, "ZYX"))
    else:
        e = m.to_euler("ZYX")
    return (e.x, e.y, e.z)


def board_m(roll, yaw, pitch):
    """The board's turn (three.js "YXZ": Ry·Rx·Rz — the yaw about her up, the roll about its length, the pitch
    across)."""
    return Euler((roll, yaw, pitch), "ZXY").to_matrix()


def board_e(m, compat=None):
    if compat is not None:
        e = m.to_euler("ZXY", Euler(compat, "ZXY"))
    else:
        e = m.to_euler("ZXY")
    return (e.x, e.y, e.z)


class Rig:
    """One body's rest: the joints' offsets under their parents (her space), from a life file."""

    def __init__(self, who="man"):
        j = glb_json(os.path.join(ROOT, f"apps/client/public/life/person-{who}.glb"))
        nodes = j["nodes"]
        by = {nd.get("name"): nd for nd in nodes}
        self.file = {}
        for name in JOINTS:
            self.file[name] = Vector(by[name].get("translation", [0, 0, 0]))
        off = {k: v.copy() for k, v in self.file.items()}
        # (the arms straight down at rest, their lengths kept — life.ts)
        for S in "LR":
            off[f"elbow{S}"] = Vector((0, -self.file[f"elbow{S}"].length, 0))
            off[f"wrist{S}"] = Vector((0, -self.file[f"wrist{S}"].length, 0))
        self.rest_hips = self.file["hips"].copy()
        self.life_hip_y = self.rest_hips.y + self.file["thighL"].y
        # (the rig's legs: thigh, shin; the toe joint at the ball)
        for S in "LR":
            off[f"knee{S}"] = Vector((0, -THIGH, 0))
            off[f"ankle{S}"] = Vector((0, -SHIN, 0))
            off[f"toe{S}"] = Vector((0, -ANKLE, BALL))
        self.off = off
        self.upper = off["elbowL"].length
        self.fore = off["wristL"].length
        self.who = who

    def thigh_at(self, S, hips_pos, hips_rot):
        """The rig's thigh joint (her space) for the hips placed so (fitLeg's: HIP_H − hipY straight down the root)."""
        return hips_pos + hips_rot @ self.file[f"thigh{S}"] + Vector((0, HIP_H - self.life_hip_y, 0))

    def fk(self, pose, lift):
        """Every joint's place and turn (her space): {joint: (pos Vector, rot Matrix3)}."""
        out = {}
        for name in JOINTS:
            e = pose.get(name, (0.0, 0.0, 0.0))
            R = e2m(e)
            par = PARENT[name]
            if par is None:
                pos = self.rest_hips + Vector(lift)
                out[name] = (pos, R)
                continue
            pp, pr = out[par]
            if name.startswith("thigh"):
                pos = self.thigh_at(name[-1], pp, pr)
            else:
                pos = pp + pr @ self.off[name]
            out[name] = (pos, pr @ R)
        return out


def basis(x, y, z):
    m = Matrix((x, y, z)).transposed()
    return m


def leg_ik(rig, S, hips_pos, hips_rot, ankle, pole, foot_rot):
    """The rig's leg for its ankle at `ankle`, the knee toward `pole` (a way, her space), the foot turned `foot_rot`
    (her space): the thigh's Euler under the hips, the knee's bend, the ankle's Euler (within a real ankle's reach)."""
    H = rig.thigh_at(S, hips_pos, hips_rot)
    D = ankle - H
    d = max(0.05, min(THIGH + SHIN - 1e-4, D.length))
    u = D.normalized()
    v = Vector(pole) - u * Vector(pole).dot(u)
    if v.length < 1e-6:
        v = Vector((0, 0, 1)) - u * u.z
    v.normalize()
    ca = max(-1.0, min(1.0, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)))
    sa = math.sqrt(max(0.0, 1 - ca * ca))
    T = (u * ca + v * sa).normalized()
    K = H + T * THIGH
    Sh = (H + u * d - K).normalized()
    F = -(Sh - T * Sh.dot(T))
    if F.length < 1e-6:
        F = v - T * v.dot(T)
    F.normalize()
    bend = math.acos(max(-1.0, min(1.0, T.dot(Sh))))
    Y = -T
    X = Y.cross(F)
    Wt = basis(X, Y, F)
    thigh = hips_rot.inverted() @ Wt
    Ws = Wt @ Matrix.Rotation(bend, 3, "X")
    ank = Ws.inverted() @ foot_rot
    ae = m2e(ank)
    ae = (max(-0.85, min(0.95, ae[0])), max(-0.45, min(0.45, ae[1])), max(-0.4, min(0.4, ae[2])))
    return m2e(thigh), bend, ae


def arm_ik(rig, S, chest_pos, chest_rot, target, pole):
    """The arm for its wrist at `target` (her space), the elbow toward `pole` (her space): the shoulder's Euler under
    the chest, the elbow's bend (negative x: forward)."""
    sh = chest_pos + chest_rot @ rig.off[f"shoulder{S}"]
    D = target - sh
    a, b = rig.upper, rig.fore
    d = max(0.05, min(a + b - 1e-4, D.length))
    u = D.normalized()
    p = Vector(pole)
    v = p - u * p.dot(u)
    if v.length < 1e-6:
        v = Vector((0, -1, -0.3)) - u * u.dot(Vector((0, -1, -0.3)))
    v.normalize()
    ca = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
    sa = math.sqrt(max(0.0, 1 - ca * ca))
    U = (u * ca + v * sa).normalized()
    E = sh + U * a
    Fa = (sh + u * d - E).normalized()
    Z = Fa - U * Fa.dot(U)
    if Z.length < 1e-6:
        Z = Vector((0, 0, 1)) - U * U.z
    Z.normalize()
    bend = math.acos(max(-1.0, min(1.0, U.dot(Fa))))
    Y = -U
    X = Y.cross(Z)
    W = basis(X, Y, Z)
    loc = chest_rot.inverted() @ W
    return m2e(loc), -bend


def hand_shape(side, fingers, index, thumb):
    """rig.ts handPose: the fingers' curl, the index's, the thumb folded (side 1 the left)."""
    S = "L" if side > 0 else "R"
    return {
        f"fingers{S}": (0.0, 0.0, -side * fingers),
        f"index{S}": (0.0, 0.0, -side * index),
        f"thumb{S}": (0.3 * thumb, -side * thumb, 0.0),
    }


HANDS = {
    "open": (0.05, 0.05, 0.0),
    "relaxed": (0.45, 0.35, 0.7),
    "loose": (0.85, 0.75, 0.45),
    "grip": (1.15, 1.05, 0.65),
    "fist": (1.5, 1.5, 0.95),
}

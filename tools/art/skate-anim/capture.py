# Plan 106 — real skaters' motion (poses/<id>.json, MediaPipe's world landmarks), measured against our clips.
#
# A segment of a source clip (frames a..b, which foot is in front) is put in her space — x the board's nose (the front
# foot's way), y up, z her toes — scaled to the rig's legs, filtered, and turned into clips.py's channels per frame:
#   hx hy hz        the hips over the root (the root on the ground under the board's middle, found from her feet)
#   hry hrz hrx     the pelvis's turn toward the nose (its hip line), its side tilt, its tip (a share of the bend)
#   sx sy sz cx     the trunk against the pelvis (the shoulders' line and the spine's way)
#   nx ny dx dy     the head's look (the nose against the ears), split over the neck and the head
#   L/R f o t e     each arm's shoulder (the upper arm's way and the forearm's plane) and the elbow's bend
#   F/B x y z lk h t kx ky kz   each foot: its sole's spot (on the board, or off it in her space), locked or not,
#                   turned toward the nose, pointed, the knee's way
#   bp px py        the board's pitch from the soles (a pop: about the tail's axle)
# A goofy skater (the right foot in front) is mirrored into a regular one.
#
#   tools/art/skate-anim/.venv/bin/python -I tools/art/skate-anim/capture.py probe <id> [a b] [--front L|R]
#        → per-frame numbers (to find a segment) and poses/<id>-rig.jpg (her skeleton in her space: side, front, top)
#   tools/art/skate-anim/.venv/bin/python -I tools/art/skate-anim/capture.py measure <id> <a> <b> [every]
#        → the robust numbers per frame (what one camera can't spoil much): the hips over the lowest sole, each
#          knee's bend, the feet's spread, the knees' width against the ankles', the trunk's lean, each arm's
#          elevation and elbow, each sole off the lowest — set beside audit.py's of our clips
#
# (The per-frame channels are a probe: from one camera the turn about the vertical — the board's heading, the hips'
# and the shoulders' yaw — swings by tens of degrees with the depth's guesses, so the clips take their numbers from
# `measure`, not a frame-by-frame retarget. See docs/plan/106-skate-animation.md.)
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
POSES = os.path.join(HERE, "poses")
OUTD = os.path.join(HERE, "captured")

# the rig's numbers (rig.py reads them from chars/moves.ts; copied here without Blender's mathutils)
_moves = open(os.path.join(HERE, "../../../apps/client/src/world/chars/moves.ts")).read()


def _const(name):
    import re

    m = re.search(rf"export const {name} = ([0-9.()*/+\- ]+);", _moves)
    return float(eval(m.group(1), {"__builtins__": {}}))  # noqa: S307 (digits and operators only)


THIGH = _const("THIGH")
SHIN = THIGH
ANKLE = _const("ANKLE")
HIP_H = THIGH + SHIN + ANKLE
D = 0.0885
TAIL_Y = 0.0957
FOOT_F = np.array([0.17, D, -0.035])
FOOT_B = np.array([-0.25, TAIL_Y, -0.03])
AXLE_X = 0.178

# MediaPipe's landmarks
NOSE, EAR_L, EAR_R = 0, 7, 8
SH_L, SH_R, EL_L, EL_R, WR_L, WR_R = 11, 12, 13, 14, 15, 16
HIP_L, HIP_R, KN_L, KN_R, AN_L, AN_R = 23, 24, 25, 26, 27, 28
HEEL_L, HEEL_R, TOE_L, TOE_R = 29, 30, 31, 32
SWAP = {SH_L: SH_R, EL_L: EL_R, WR_L: WR_R, HIP_L: HIP_R, KN_L: KN_R, AN_L: AN_R, HEEL_L: HEEL_R, TOE_L: TOE_R,
        EAR_L: EAR_R}
SWAP.update({v: k for k, v in list(SWAP.items())})


def load(cid):
    doc = json.load(open(os.path.join(POSES, f"{cid}.json")))
    fr = doc["frames"]
    n = len(fr)
    P = np.full((n, 33, 3), np.nan)
    V = np.zeros((n, 33))
    for i, f in enumerate(fr):
        if f:
            w = np.array(f["w"])
            # (MediaPipe: x right, y down, z away → x right, y up, z toward the camera)
            P[i] = w * np.array([1, -1, -1])
            V[i] = f["v"]
    return doc["fps"], P, V


def fill(P):
    """Missing frames linearly in between (and held at the ends)."""
    n = P.shape[0]
    ok = ~np.isnan(P[:, 0, 0])
    idx = np.arange(n)
    if not ok.any():
        return P
    for j in range(P.shape[1]):
        for a in range(3):
            P[:, j, a] = np.interp(idx, idx[ok], P[ok, j, a])
    return P


def smooth(X, sigma):
    """A Gaussian filter along time (edges held)."""
    if sigma <= 0:
        return X
    r = int(math.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([np.repeat(X[:1], r, 0), X, np.repeat(X[-1:], r, 0)], 0)
    out = np.zeros_like(X)
    for i in range(len(k)):
        out += k[i] * pad[i : i + X.shape[0]]
    return out


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def euler_xyz(m):
    """A rotation → three.js "XYZ" Euler (the matrix Rx·Ry·Rz)."""
    y = math.asin(max(-1.0, min(1.0, m[0, 2])))
    if abs(m[0, 2]) < 0.9999:
        x = math.atan2(-m[1, 2], m[2, 2])
        z = math.atan2(-m[0, 1], m[0, 0])
    else:
        x = math.atan2(m[2, 1], m[1, 1])
        z = 0.0
    return x, y, z


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def frame_of(x, y):
    """Columns x, y, z from an x and a rough y (y kept, x made square to it)."""
    y = unit(y)
    x = unit(x - y * np.dot(x, y))
    z = np.cross(x, y)
    return np.stack([x, y, z], 1)


def her_space(P, front, on=None, axis_sigma=2.0):
    """Every frame in her space: x the board's way (front ankle − back ankle, where both are on it; in between, the
    heading carried), y up, z her toes; mirrored for a goofy skater (the right foot in front) so the front foot is
    always her left. Returns the landmarks there (still about her hips' middle) and each frame's board heading."""
    n = P.shape[0]
    fa, ba = (AN_L, AN_R) if front == "L" else (AN_R, AN_L)
    d = P[:, fa] - P[:, ba]
    d[:, 1] = 0
    ang = np.arctan2(d[:, 2], d[:, 0])
    good = np.ones(n, bool) if on is None else on
    spread = np.linalg.norm(d, axis=1)
    good = good & (spread > 0.18)
    idx = np.arange(n)
    if good.any():
        a = np.unwrap(ang[good])
        ang = np.interp(idx, idx[good], a)
    ang = smooth(ang[:, None], axis_sigma)[:, 0]
    out = np.zeros_like(P)
    for i in range(n):
        x = np.array([math.cos(ang[i]), 0, math.sin(ang[i])])
        Y = np.array([0, 1.0, 0])
        z = np.cross(x, Y)
        M = np.stack([x, Y, z], 0)  # rows: world → her
        out[i] = P[i] @ M.T
    if front == "R":
        # (a goofy skater: her toes were −z; mirrored through z, her right is now her left)
        out[:, :, 2] *= -1
        sw = out.copy()
        for a, b in SWAP.items():
            sw[:, a] = out[:, b]
        out = sw
    return out, ang


def leg_scale(Q):
    th = np.linalg.norm(Q[:, HIP_L] - Q[:, KN_L], axis=1) + np.linalg.norm(Q[:, HIP_R] - Q[:, KN_R], axis=1)
    sh = np.linalg.norm(Q[:, KN_L] - Q[:, AN_L], axis=1) + np.linalg.norm(Q[:, KN_R] - Q[:, AN_R], axis=1)
    return (THIGH + SHIN) / np.median((th + sh) / 2)


def foot_on(Q, i, S, floor):
    """Is the foot near the lowest sole (on the board) this frame."""
    h, t = (HEEL_L, TOE_L) if S == "L" else (HEEL_R, TOE_R)
    sole = min(Q[i, h, 1], Q[i, t, 1])
    return sole - floor < 0.06


def channels(Q, i, feet_on, prev=None):
    """One frame's channels (Q: her space, scaled, about her hips)."""
    q = Q[i]
    ch = {}
    # the root: under the board's middle on the ground, from the front foot (on the board) — else the back
    if feet_on["F"]:
        root = q[AN_L] - np.array([FOOT_F[0], FOOT_F[1] + ANKLE, FOOT_F[2]])
    else:
        root = q[AN_R] - np.array([FOOT_B[0], FOOT_B[1] + ANKLE, FOOT_B[2]])
    hipm = (q[HIP_L] + q[HIP_R]) / 2
    hp = hipm - root
    ch["hx"], ch["hy"], ch["hz"] = float(hp[0]), float(hp[1]), float(hp[2])
    # the pelvis: its hip line's yaw (toward the nose: + about y) and side tilt
    hl = q[HIP_L] - q[HIP_R]
    hry = math.atan2(-hl[2], hl[0])
    hrz = math.atan2(hl[1], math.hypot(hl[0], hl[2]))
    # the trunk: the spine's way (hips' middle → shoulders' middle) and the shoulders' line
    shm = (q[SH_L] + q[SH_R]) / 2
    Rt = frame_of(q[SH_L] - q[SH_R], shm - hipm)
    # (its forward bend, seen along the pelvis's facing; the pelvis tips with a share of it)
    sp = Rt[:, 1]
    face = np.array([math.sin(hry), 0, math.cos(hry)])
    bend = math.atan2(np.dot(sp, face), sp[1])
    hrx = 0.3 * bend
    Rp = rx(hrx) @ ry(hry) @ rz(hrz)
    rel = Rp.T @ Rt
    ex, ey, ez = euler_xyz(rel)
    ch.update(hrx=hrx, hry=hry, hrz=hrz, sx=0.72 * ex, cx=0.28 * ex, sy=ey, sz=ez, cy=0.0, cz=0.0)
    # the head: the nose against the ears' middle, in the chest's frame
    em = (q[EAR_L] + q[EAR_R]) / 2
    fv = Rt.T @ (q[NOSE] - em)
    yaw = math.atan2(fv[0], fv[2])
    pitch = math.atan2(-fv[1], math.hypot(fv[0], fv[2])) - 0.2
    ch.update(ny=0.4 * yaw, dy=0.6 * yaw, nx=0.35 * pitch, dx=0.65 * pitch)
    # the arms: the shoulder's turn (the upper arm's way, the forearm's plane) and the elbow
    for S, side, sh, el, wr in (("L", 1, SH_L, EL_L, WR_L), ("R", -1, SH_R, EL_R, WR_R)):
        u = unit(Rt.T @ (q[el] - q[sh]))
        w = unit(Rt.T @ (q[wr] - q[el]))
        e = math.acos(max(-1.0, min(1.0, float(np.dot(u, w)))))
        b = w - u * np.dot(w, u)
        if np.linalg.norm(b) < 0.05:
            b = np.array([0, 0, 1.0]) - u * u[2]
        Z = unit(b)
        Yv = -u
        X = np.cross(Yv, Z)
        M = np.stack([X, Yv, Z], 1)
        ax, ay, az = euler_xyz(M)
        ch[f"{S}f"] = -ax
        ch[f"{S}t"] = side * ay
        ch[f"{S}o"] = side * az
        ch[f"{S}e"] = e
    # the feet: their soles (the ankle less the rig's ankle height), turned, pointed, the knee's way
    for key, an, kn, hi, he, to in (("F", AN_L, KN_L, HIP_L, HEEL_L, TOE_L), ("B", AN_R, KN_R, HIP_R, HEEL_R, TOE_R)):
        sole = q[an] - root - np.array([0, ANKLE, 0])
        d = q[to] - q[he]
        h = math.atan2(d[0], d[2])
        t = math.atan2(-d[1], math.hypot(d[0], d[2]))
        on = feet_on[key]
        if on:
            sole = sole.copy()
            if key == "F":
                sole = FOOT_F.copy()
            else:
                sole[0] = max(-0.33, min(-0.12, sole[0]))
                sole[1] = TAIL_Y if sole[0] < -0.22 else D
                sole[2] = max(-0.08, min(0.06, sole[2]))
            t = 0.0
        ch[f"{key}x"], ch[f"{key}y"], ch[f"{key}z"] = (float(v) for v in sole)
        ch[f"{key}ox"] = ch[f"{key}oy"] = ch[f"{key}oz"] = 0.0
        ch[f"{key}lk"] = 1.0 if on else 0.0
        ch[f"{key}h"] = h
        ch[f"{key}t"] = t
        hipj = q[hi]
        ak = q[an] - hipj
        kv = q[kn] - hipj
        pole = unit(kv - unit(ak) * np.dot(kv, unit(ak)))
        ch[f"{key}kx"], ch[f"{key}ky"], ch[f"{key}kz"] = (float(v) for v in pole)
    return ch


def unwrap_ch(rows):
    for k in rows[0]:
        if k.endswith(("f", "o", "t", "h")) or k in ("hry", "sy", "dy", "ny"):
            a = np.unwrap(np.array([r[k] for r in rows]))
            for r, v in zip(rows, a):
                r[k] = float(v)
    return rows


def segment(cid, a, b, front="L", sigma=None, on_pad=0.06):
    fps, P, V = load(cid)
    P = fill(P)
    sig = sigma if sigma is not None else max(1.0, fps / 20)
    P = smooth(P.reshape(len(P), -1), sig).reshape(P.shape)
    P = P[a : b + 1]
    Q, ang = her_space(P, front)
    s = leg_scale(Q)
    Q = Q * s
    # the board's level: the lowest of the soles over the segment's frames, per frame the lowest sole
    rows = []
    soles = np.minimum(np.minimum(Q[:, HEEL_L, 1], Q[:, TOE_L, 1]), np.minimum(Q[:, HEEL_R, 1], Q[:, TOE_R, 1]))
    for i in range(len(Q)):
        floor = soles[i]
        on = {"F": foot_on(Q, i, "L", floor), "B": foot_on(Q, i, "R", floor)}
        if not on["F"] and not on["B"]:
            on["F"] = True
        rows.append(channels(Q, i, on))
    rows = unwrap_ch(rows)
    return fps, s, Q, rows


def sheet(cid, Q, path, every=2):
    import cv2

    edges = [(SH_L, SH_R), (SH_L, EL_L), (EL_L, WR_L), (SH_R, EL_R), (EL_R, WR_R), (SH_L, HIP_L), (SH_R, HIP_R),
             (HIP_L, HIP_R), (HIP_L, KN_L), (KN_L, AN_L), (AN_L, HEEL_L), (HEEL_L, TOE_L), (AN_L, TOE_L),
             (HIP_R, KN_R), (KN_R, AN_R), (AN_R, HEEL_R), (HEEL_R, TOE_R), (AN_R, TOE_R), (EAR_L, NOSE),
             (EAR_R, NOSE)]
    left = {SH_L, EL_L, WR_L, HIP_L, KN_L, AN_L, HEEL_L, TOE_L, EAR_L}
    cells = []
    for i in range(0, len(Q), every):
        q = Q[i]
        views = []
        for name, (ax, ay, sx) in (("side", (0, 1, 1)), ("front", (2, 1, -1)), ("top", (0, 2, 1))):
            img = np.full((200, 160, 3), 30, np.uint8)
            def pt(p):  # noqa: E306
                return (int(80 + sx * p[ax] * 110), int(120 - p[ay] * 110) if name != "top" else int(100 + p[ay] * 110))
            for a_, b_ in edges:
                c = (80, 200, 255) if a_ in left and b_ in left else (120, 255, 120) if a_ not in left and b_ not in left else (200, 200, 200)
                cv2.line(img, pt(q[a_]), pt(q[b_]), c, 2)
            if name != "top":
                lo = min(q[HEEL_L][1], q[TOE_L][1], q[HEEL_R][1], q[TOE_R][1])
                cv2.line(img, (0, int(120 - lo * 110)), (160, int(120 - lo * 110)), (90, 90, 90), 1)
            cv2.putText(img, f"{i} {name}", (3, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 255), 1)
            views.append(img)
        cells.append(np.concatenate(views, 1))
    cols = 3
    rows_ = (len(cells) + cols - 1) // cols
    h, w = cells[0].shape[:2]
    out = np.zeros((rows_ * h, cols * w, 3), np.uint8)
    for k, c in enumerate(cells):
        y, x = divmod(k, cols)
        out[y * h : (y + 1) * h, x * w : (x + 1) * w] = c
    cv2.imwrite(path, out)


def probe(cid, a=None, b=None, front="L"):
    fps, P, V = load(cid)
    n = len(P)
    a = 0 if a is None else a
    b = n - 1 if b is None else b
    fps, s, Q, rows = segment(cid, a, b, front)
    print(f"{cid} frames {a}..{b} at {fps:.0f} fps, scale {s:.2f}")
    print("  i    hy    hx    hz   hry   sx    sy   Bx    By    Bz  Flk Blk  Lf   Lo   Le   Rf   Ro   Re   dy")
    for i, r in enumerate(rows):
        print(f"{a + i:4d} {r['hy']:.2f} {r['hx']:+.2f} {r['hz']:+.2f} {r['hry']:+.2f} {r['sx']:+.2f} {r['sy']:+.2f} "
              f"{r['Bx']:+.2f} {r['By']:+.2f} {r['Bz']:+.2f}  {r['Flk']:.0f}   {r['Blk']:.0f}  {r['Lf']:+.2f} "
              f"{r['Lo']:+.2f} {r['Le']:.2f} {r['Rf']:+.2f} {r['Ro']:+.2f} {r['Re']:.2f} {r['dy']:+.2f}")
    sheet(cid, Q, os.path.join(POSES, f"{cid}-rig.jpg"), every=max(1, int(round(fps / 8))))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "probe":
        args = [x for x in sys.argv[2:] if not x.startswith("--")]
        front = sys.argv[sys.argv.index("--front") + 1] if "--front" in sys.argv else "L"
        args = [x for x in args if x != front]
        cid = args[0]
        a = int(args[1]) if len(args) > 1 else None
        b = int(args[2]) if len(args) > 2 else None
        probe(cid, a, b, front)


# ── robust measures (what monocular depth can't spoil much): heights, bends, spreads, elevations ──────────────
def ang(a, b):
    return math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(unit(a), unit(b)))))))


def measure(cid, a, b, every=1):
    fps, P, V = load(cid)
    P = fill(P)
    P = smooth(P.reshape(len(P), -1), max(1.0, fps / 20)).reshape(P.shape)
    print(f"{cid} {a}..{b} @{fps:.0f}  hipN = hips over the lowest sole / leg; knee = bend from straight (deg)")
    print("   f   t(s)  hipN  kneeL kneeR  spread kneeW/ankW tilt  armL  armR  elbL  elbR  soleL soleR")
    for i in range(a, b + 1, every):
        q = P[i]
        leg = (np.linalg.norm(q[HIP_L] - q[KN_L]) + np.linalg.norm(q[KN_L] - q[AN_L]) + np.linalg.norm(q[HIP_R] - q[KN_R])
               + np.linalg.norm(q[KN_R] - q[AN_R])) / 2
        sL = min(q[HEEL_L, 1], q[TOE_L, 1])
        sR = min(q[HEEL_R, 1], q[TOE_R, 1])
        lo = min(sL, sR)
        hip = (q[HIP_L] + q[HIP_R]) / 2
        sh = (q[SH_L] + q[SH_R]) / 2
        kL = 180 - ang(q[HIP_L] - q[KN_L], q[AN_L] - q[KN_L])
        kR = 180 - ang(q[HIP_R] - q[KN_R], q[AN_R] - q[KN_R])
        spread = np.linalg.norm(q[AN_L] - q[AN_R]) / leg
        kw = np.linalg.norm(q[KN_L] - q[KN_R]) / max(1e-3, np.linalg.norm(q[AN_L] - q[AN_R]))
        tilt = ang(sh - hip, np.array([0, 1.0, 0]))
        down = hip - sh
        aL = ang(q[EL_L] - q[SH_L], down)
        aR = ang(q[EL_R] - q[SH_R], down)
        eL = 180 - ang(q[SH_L] - q[EL_L], q[WR_L] - q[EL_L])
        eR = 180 - ang(q[SH_R] - q[EL_R], q[WR_R] - q[EL_R])
        print(f"{i:4d} {(i - a) / fps:5.2f}  {(hip[1] - lo) / leg:.2f}  {kL:5.0f} {kR:5.0f}   {spread:.2f}   {kw:4.2f}   "
              f"{tilt:4.0f}  {aL:4.0f}  {aR:4.0f}  {eL:4.0f}  {eR:4.0f}  {(sL - lo) / leg:.2f}  {(sR - lo) / leg:.2f}")


if __name__ == "__main__" and sys.argv[1] == "measure":
    measure(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]) if len(sys.argv) > 5 else 1)

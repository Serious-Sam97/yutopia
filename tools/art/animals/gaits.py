# The gaits, made (docs/plan/129-animal-animations.md, F4a/F5): a walk, a real trot, a lope, a gallop, a bound, a hop —
# each foot on a path of its own (planted, moving back under the body at the ground's speed, then lifted and swung
# forward), its legs solved to reach it (CCD about the side-to-side axis), the body's bob, pitch and spine's flex by the
# gait, and the spine, neck, head, tail and ears carried over from the source's own clip (retimed). Feet don't slide by
# construction: each clip goes at exactly the speed it's made for — the game's walk, trot, run for the species
# (species.ts) — so it's played at its rate 1 there.
import math
import os
import re

from mathutils import Matrix, Vector

Y = Vector((0, 1, 0))
HERE = os.path.dirname(os.path.abspath(__file__))
SPECIES_TS = os.path.join(HERE, "..", "..", "..", "packages", "shared", "src", "animals", "species.ts")

# each gait: the share of the cycle a foot's on the ground (duty); when each foot lands (phase, 0..1); how far a foot
# reaches under the body against its leg's length (what the leg can make: a run's longer stride is its time in the air,
# not a longer reach — past ~1.75 the leg straightens short of it and the foot drags); the body's bob and the spine's
# flex (against the leg's length)
GAITS = {
    # (four legs, one after another: the lateral sequence — hind, fore the same side, the other hind, the other fore)
    "walk": dict(duty=0.66, phase={"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}, reach=1.55, lift=0.12, bob=0.025, flex=0.0, bobs=2, crouch=0.04, give=0.08),
    # (the diagonals together: near hind with off fore)
    "trot": dict(duty=0.45, phase={"HL": 0.0, "FR": 0.0, "HR": 0.5, "FL": 0.5}, reach=1.75, lift=0.16, bob=0.04, flex=0.0, bobs=2, crouch=0.08, give=0.1),
    # (a rotary gallop: hinds close, then the fores; a moment in the air; the spine bends and stretches)
    "gallop": dict(duty=0.28, phase={"HL": 0.0, "HR": 0.12, "FR": 0.42, "FL": 0.54}, reach=1.6, lift=0.22, bob=0.07, flex=9.0, bobs=1),
    # (a bear's, a raccoon's lope: a slower, rolling transverse canter, a heavier body)
    "lope": dict(duty=0.38, phase={"HL": 0.0, "HR": 0.18, "FL": 0.48, "FR": 0.62}, reach=1.7, lift=0.18, bob=0.05, flex=6.0, bobs=1),
    # (a squirrel's, a hare's bound: the hinds together, then the fores together)
    "bound": dict(duty=0.3, phase={"HL": 0.0, "HR": 0.02, "FL": 0.5, "FR": 0.52}, reach=1.7, lift=0.25, bob=0.1, flex=12.0, bobs=1),
}

# two legs: a bird's walk (one foot then the other, its head bobbing), a small bird's hop (both at once)
GAITS["bwalk"] = dict(duty=0.62, phase={"HL": 0.0, "HR": 0.5}, reach=1.3, lift=0.3, bob=0.04, flex=0.0, bobs=2, crouch=0.04, give=0.06)
GAITS["hop"] = dict(duty=0.32, phase={"HL": 0.0, "HR": 0.02}, reach=1.6, lift=0.45, bob=0.12, flex=0.0, bobs=1, body=True, crouch=0.04, give=0.06)
# (the hare's, the frog's: the hinds together and the fores, slow or fast — a hop at any pace)
GAITS["hare"] = dict(duty=0.34, phase={"HL": 0.0, "HR": 0.03, "FL": 0.45, "FR": 0.5}, reach=1.8, lift=0.3, bob=0.16, flex=10.0, bobs=1, body=True)

# the bird's legs (the hawk's skeleton: thigh, shin, the foot on it), the hare's (thigh, shin, foot; arm, forearm, hand)
B_LEGS = {
    "HL": (["thigh.L", "shin.L"], "shin.L", "foot.L"),
    "HR": (["thigh.R", "shin.R"], "shin.R", "foot.R"),
}
R_LEGS = {
    "HL": (["thigh.L", "shin.L"], "shin.L", "foot.L"),
    "HR": (["thigh.R", "shin.R"], "shin.R", "foot.R"),
    "FL": (["upper_arm.L", "forearm.L"], "forearm.L", "hand.L"),
    "FR": (["upper_arm.R", "forearm.R"], "forearm.R", "hand.R"),
}
# small birds hop; the rest walk
HOPPERS = {"songbird", "crow"}

# what each runs with (else the gallop)
RUN_GAIT = {"bear": "lope", "raccoon": "lope", "beaver": "lope", "squirrel": "bound", "pig": "lope", "sheep": "gallop"}


def game_speeds():
    """The game's walk and run for each species (species.ts: walk, run); its trot as the game's (min(run, walk × 2.4))."""
    src = open(SPECIES_TS).read()
    out = {}
    for m in re.finditer(r"^  ([a-z_]+): D\(\{(.*?)\n  \}\)", src, re.M | re.S):
        w = re.search(r"\bwalk: ([\d.]+)", m.group(2))
        r = re.search(r"\brun: ([\d.]+)", m.group(2))
        if w and r:
            walk, run = float(w.group(1)), float(r.group(1))
            out[m.group(1)] = {"walk": walk, "trot": min(run, walk * 2.4), "run": run}
    return out


SPEED_OF = {"deer_buck": "deer", "horse_white": "horse", "chick": "chicken"}


def species_of(model):
    return SPEED_OF.get(model, model)


# ---------------------------------------------------------------- legs
def foot_point(R, P, last, foot):
    """Where its foot is, carried by its leg's last bone (as the IK root would be put there: Rig.attach)."""
    return (P[last] @ R.rest[last].inverted() @ R.rest[foot]).to_translation()


def _chain_foot(R, pose, chain, last, foot, P):
    """Its foot where its chain puts it: only the chain's own bones recomputed (P: the rest of the body, as posed)."""
    Q = {}
    for n in chain:
        p = R.parent[n]
        l, q = pose[n]
        Q[n] = (Q[p] if p in Q else P[p]) @ R.rest[p].inverted() @ R.rest[n] @ Matrix.Translation(l) @ q.to_matrix().to_4x4()
    return (Q[last] @ R.rest[last].inverted() @ R.rest[foot]).to_translation()


def solve_leg(R, pose, chain, last, foot, target, iters=24, step=18.0):
    """Its chain turned (about the side-to-side axis) so its foot comes to `target`: damped least squares (a step kept
    only if it brings the foot closer, else damped harder), from the pose it's in — each go the smallest turn of all
    its joints together toward the target, so a knee keeps bending the way it bends (a straight leg's shortening is
    slow, never a flip)."""
    P = R.fk(pose)
    eps = 0.5
    damp = 0.002

    def err():
        f = _chain_foot(R, pose, chain, last, foot, P)
        return f, target.x - f.x, target.z - f.z

    f, ex, ez = err()
    for _ in range(iters):
        e0 = math.hypot(ex, ez)
        if e0 < 0.0005 * R.size:
            break
        J = []
        for b in chain:
            q = pose[b][1].copy()
            R.rot(pose, b, Y, eps)
            f2 = _chain_foot(R, pose, chain, last, foot, P)
            pose[b][1] = q
            J.append(((f2.x - f.x) / eps, (f2.z - f.z) / eps))
        a0 = sum(j[0] * j[0] for j in J)
        c = sum(j[0] * j[1] for j in J)
        d0 = sum(j[1] * j[1] for j in J)
        keep = {b: pose[b][1].copy() for b in chain}
        for _try in range(6):
            lam = damp * (a0 + d0) + 1e-12
            a, d = a0 + lam, d0 + lam
            det = a * d - c * c
            y0, y1 = (d * ex - c * ez) / det, (-c * ex + a * ez) / det
            for (jx, jz), b in zip(J, chain):
                R.rot(pose, b, Y, max(-step, min(step, jx * y0 + jz * y1)))
            f2, ex2, ez2 = err()
            if math.hypot(ex2, ez2) < e0:
                f, ex, ez = f2, ex2, ez2
                damp = max(0.0005, damp * 0.5)
                break
            for b in chain:
                pose[b][1] = keep[b].copy()
            damp *= 8
        else:
            break
    return pose


# the four legs of the Quaternius rigs: (its chain from the hip, its last bone, its foot)
U_LEGS = {
    # (the fore leg from its shoulder blade: most of a fore stride is the blade's swing, the leg below it near straight)
    "FL": (["FrontShoulder.L", "FrontUpperLeg.L", "FrontLowerLeg.L"], "FrontLowerLeg.L", "IKFrontLeg.L"),
    "FR": (["FrontShoulder.R", "FrontUpperLeg.R", "FrontLowerLeg.R"], "FrontLowerLeg.R", "IKFrontLeg.R"),
    "HL": (["BackLeg.L", "BackUpperLeg.L", "BackLowerLeg.L"], "BackLowerLeg.L", "IKBackLeg.L"),
    "HR": (["BackLeg.R", "BackUpperLeg.R", "BackLowerLeg.R"], "BackLowerLeg.R", "IKBackLeg.R"),
}
LEG_BONE = re.compile(r"(FrontShoulder|UpperLeg|LowerLeg|BackLeg\.|^IK|^FF|^thigh|^shin|^foot|^upper_arm|^forearm|^hand|^t_|^r_toe)")


def foot_path(p, duty, stance, lift, carry=1.0):
    """Where a foot is (along, up) at its phase `p` (0 its landing): on the ground going back `stance` over its
    duty, then up and forward again — leaving the ground still going back (and coming down to it already going back)
    at `carry` of the ground's speed, as a living foot does: not stopped dead against the body there, so it isn't
    dragged forward along the ground as it lifts or lands (a Hermite curve, its ends' slopes the stance's)."""
    if p < duty:
        s = p / duty
        return stance * (0.5 - s), 0.0
    s = (p - duty) / (1 - duty)
    m = -stance * (1 - duty) / duty * carry
    x = stance * 0.5 * (6 * s * s - 4 * s ** 3 - 1) + m * s * (2 * s - 1) * (s - 1)
    return x, lift * math.sin(math.pi * s)


def leg_reach(R, pose, chain, last, foot, foot0, L, tol):
    """How far forward and back of where it stands (`foot0`) its foot reaches the ground, in this pose (the body as it
    sits there): the window its foot can be planted in."""
    def ok(dx):
        q = R.copy(pose)
        t = Vector((foot0.x + dx, foot0.y, foot0.z))
        solve_leg(R, q, chain, last, foot, t, iters=40)
        e = foot_point(R, R.fk(q), last, foot) - t
        return math.hypot(e.x, e.z) < tol

    out = []
    for sgn in (1.0, -1.0):
        lo, hi = 0.0, 2.5 * L
        for _ in range(9):
            mid = (lo + hi) / 2
            if ok(sgn * mid):
                lo = mid
            else:
                hi = mid
        out.append(lo)
    return out[0], out[1]


TAIL = re.compile(r"^(Tail\d|tail)")


def TAIL_ROOT(R):
    return next((n for n in ("Tail1", "tail") if n in R.rest), None)


def _verts(R, pick):
    import numpy as np

    sel = np.array([bool(pick(n)) for n in R.order])
    w = R.W[:, sel].sum(1)
    return w


def body_verts(R):
    """The vertices of its body, not its legs or tail (under half their weight on those bones): what mustn't go into
    the ground."""
    import numpy as np

    w = _verts(R, lambda n: LEG_BONE.search(n) or TAIL.search(n))
    idx = np.nonzero((w < 0.5) & (R.W.sum(1) > 0))[0]
    return idx if len(idx) else None


def tail_verts(R):
    import numpy as np

    idx = np.nonzero(_verts(R, lambda n: TAIL.search(n)) >= 0.5)[0]
    return idx if len(idx) else None


# keys while a foot is down (fewer and it sweeps past the ground between them), and the most keys a cycle takes
KEYS_DOWN = 5
MAX_KEYS = 72


def gait_clip(R, base, kind, speed, src=None, legs=U_LEGS, fps=24):
    """A cycle of `kind` at `speed` m/s: its stride from what each leg reaches on the ground (its window, the body let
    down a little where the gait's stride needs more), its length from the speed, the legs solved each frame — and
    the body let down further on a frame where a foot that should be down can't reach (a gallop's flexed spine, a
    bob's top). Keyed as often as a quick foot needs (at least KEYS_DOWN keys while it's down); its keys' rate is the
    meta's `fps`."""
    g = GAITS[kind]
    P0 = R.fk(base)
    feet0 = {k: foot_point(R, P0, last, foot) for k, (_, last, foot) in legs.items()}
    hip = {k: P0[chain[0]].to_translation() for k, (chain, _, _) in legs.items()}
    # (its shortest leg: the scale of the bob, the lift)
    L = min(hip[k].z - feet0[k].z for k in legs)
    tol = 0.02 * L
    # the stride: the gait's own (against the leg), no longer than every leg can plant a foot through — each foot's
    # stance centred in its own window; the body let down (to `crouch` of the leg) where the stride wants it
    want = g["reach"] * L
    drop = 0.0
    # (a walk barely crouches — its stride is the leg's swing, the body riding over it; a gallop gathers low)
    for d in (0.0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.16):
        if d > g.get("crouch", 0.12) + 1e-9:
            break
        q = R.copy(base)
        R.shift(q, (0, 0, -d * L))
        win = {k: leg_reach(R, q, chain, last, foot, feet0[k], L, tol) for k, (chain, last, foot) in legs.items()}
        avail = 0.92 * min(f + b for f, b in win.values())
        if d == 0.0 or avail > best[0] + 0.02 * L:
            best = (avail, d, win)
        if avail >= want:
            break
    avail, drop, win = best
    drop *= L
    # (the stride shortened where the body would have to sink more than the gait's `give` to plant its feet — a
    # duck's short legs take short steps, not a belly on the ground)
    reach = max(0.25 * L, min(want, avail))
    g0, fps0 = g, fps
    body, tailv = body_verts(R), tail_verts(R)
    floor = float(R.skin(base)[:, 2].min())
    best_go = None
    for _go in range(6):
        centre = {k: (f - b) / 2 for k, (f, b) in win.items()}
        duty = g0["duty"]
        cycle = reach / max(0.05, speed * duty)
        # (quicker than a living cycle goes — a hare at full stretch —: less of it on the ground, more in the air; a small
        # body's quickest is quicker — its stride's time goes as the root of its leg's length)
        QUICK = max(0.1, min(0.25, 0.25 * math.sqrt(max(L, 1e-3) / 0.6)))
        if cycle < QUICK:
            cycle = QUICK
            duty = max(0.05, reach / max(0.05, speed * cycle))
        cycle = min(2.2, cycle)
        # (a quick foot's few milliseconds down: keyed at its own rate, however quick, within MAX_KEYS a cycle)
        fps = max(fps0, int(math.ceil(KEYS_DOWN / max(1e-3, duty * cycle))))
        fps = min(fps, max(24, int(MAX_KEYS / cycle)))
        n = max(6, int(round(cycle * fps)))
        cycle = n / fps
        stance = speed * duty * cycle
        g = {**g0, "duty": duty}
        # (a hop's body goes up only while no foot's down — up off the ground in the air, on it while a foot is)
        def down_w(t):
            w = 0.0
            for k in legs:
                p = (t - g["phase"][k]) % 1.0
                edge = 0.08
                if p < duty:
                    m = 1.0
                else:
                    m = max(0.0, 1.0 - min(p - duty, 1.0 - p) / edge)
                w = max(w, m)
            return w

        def make(f, extra, tail=0.0):
            t = (f % n) / n
            q = R.copy(base)
            # the body: its spine, neck, head, tail from the source's clip (at the same point of its own cycle)
            if src:
                s = src[int(round(t * (len(src) - 1)))]
                for b, v in s.items():
                    if b in q and not LEG_BONE.search(b):
                        q[b] = [v[0].copy(), v[1].copy()]
            # the bob (down as the feet take the weight), the spine's flex (gathered, stretched)
            # (a hop's lift by the whole body — a sitting hare's folded legs are short —, a stride's bob by the leg; a hop
            # goes up off the ground, never into it)
            if g.get("body"):
                bob = g["bob"] * R.size * (1.0 - down_w(t))
            else:
                bob = g["bob"] * L * -math.cos(2 * math.pi * t * g["bobs"])
            R.shift(q, (0, 0, bob - drop - extra))
            # (a tail swung down through the ground — a gallop's, the body low —: raised at its root)
            if tail and TAIL_ROOT(R):
                R.rot(q, TAIL_ROOT(R), Y, tail)
            if g["flex"]:
                fl = g["flex"] * math.sin(2 * math.pi * t)
                R.rot(q, "Torso", Y, fl)
                R.rot(q, "Back", Y, -fl * 0.6)
                R.rot(q, "Neck1", Y, -fl * 0.5)
                R.rot(q, "spine.001", Y, fl)
                R.rot(q, "spine.003", Y, -fl * 0.6)
            short = 0.0
            miss = []
            for k, (chain, last, foot) in legs.items():
                p = (t - g["phase"][k]) % 1.0
                dx, dz = foot_path(p, g["duty"], stance, g["lift"] * L)
                target = Vector((feet0[k].x + centre[k] + dx, feet0[k].y, feet0[k].z + dz))
                solve_leg(R, q, chain, last, foot, target)
                # (how far its foot is from where it should be while it's down: a leg that can't reach)
                if p < g["duty"]:
                    e = foot_point(R, R.fk(q), last, foot) - target
                    miss.append((abs(e.x) / max(L, 1e-4), e.z / max(L, 1e-4), math.hypot(e.x, e.z) < tol))
                    short = max(short, e.z)
            # (a foot on its leg — a bird's, a hare's —: kept at its angle as it stood, the toes flat, not tipped through
            # the ground as the shin swings; a foot of its own (the Quaternius rigs' IK roots) is the caller's)
            P = R.fk(q)
            for k, (chain, last, foot) in legs.items():
                if R.parent.get(foot) != last:
                    continue
                W = Matrix.Translation(P[foot].to_translation()) @ P0[foot].to_3x3().to_4x4()
                local = (P[last] @ R.rest[last].inverted() @ R.rest[foot]).inverted() @ W
                q[foot][1] = local.to_quaternion()
            return q, miss, short

        # a first go, then the body let down where a down foot fell short (smoothed over its neighbours, so it's a
        # sink into the step, not a jolt), twice over
        extra = [0.0] * n
        got = [make(f, extra[f]) for f in range(n)]
        for _ in range(3):
            short = [s for _, _, s in got]
            if max(short) < tol:
                break
            need = [extra[f] + max(0.0, short[f]) for f in range(n)]
            wide = [max(need[(f + j) % n] for j in (-2, -1, 0, 1, 2)) for f in range(n)]
            extra = [min(0.25 * L, (wide[(f - 1) % n] + 2 * wide[f] + wide[(f + 1) % n]) / 4) for f in range(n)]
            # (the frames always the ones made with this `extra`)
            got = [make(f, extra[f]) for f in range(n)]
        # the body (not its legs, not its tail) kept out of the ground: a frame let down so far its belly would go
        # through is raised back (its feet then short there — and the stride shortened below)
        tails = [0.0] * n
        if body is not None:
            lift = [max(0.0, floor - float(R.skin(q)[body, 2].min())) for q, _, _ in got]
            if max(lift) > 0.004 * R.size:
                wide = [max(lift[(f + j) % n] for j in (-1, 0, 1)) for f in range(n)]
                extra = [max(0.0, extra[f] - wide[f]) for f in range(n)]
                got = [make(f, extra[f]) for f in range(n)]
        # its tail raised where it'd go through
        if tailv is not None and TAIL_ROOT(R):
            for f in range(n):
                a = 0.0
                q = got[f][0]
                while float(R.skin(q)[tailv, 2].min()) < floor - 0.004 * R.size and a < 60:
                    a += 6.0
                    q = make(f, extra[f], a)[0]
                tails[f] = a
            if max(tails):
                wide = [max(tails[(f + j) % n] for j in (-2, -1, 0, 1, 2)) for f in range(n)]
                tails = [(wide[(f - 1) % n] + 2 * wide[f] + wide[(f + 1) % n]) / 4 for f in range(n)]
                got = [make(f, extra[f], tails[f]) for f in range(n)]
        downs = [m for _, ms, _ in got for m in ms]
        planted = sum(1 for m in downs if m[2]) / max(1, len(downs))
        ok = planted >= 0.9 and max(extra) <= g.get("give", 0.25) * L
        # (the go kept: the first that passes; till one does, the best planted)
        if best_go is None or (ok and not best_go[0]) or (not best_go[0] and planted > best_go[1] + 0.02):
            best_go = (ok, planted, got, dict(cycle=cycle, stance=stance, fps=fps, extra=extra, n=n))
        if ok or reach <= 0.3 * L:
            break
        reach = max(0.3 * L, reach * 0.85)
    _, planted, got, kept = best_go
    cycle, stance, fps, extra, n = kept["cycle"], kept["stance"], kept["fps"], kept["extra"], kept["n"]
    # (its last frame its first, exactly: a loop with no seam)
    out = [q for q, _, _ in got] + [R.copy(got[0][0])]
    miss = [m for _, ms, _ in got for m in ms]
    return out, {"speed": round(speed, 3), "cycle": round(cycle, 3), "stance": round(stance, 3), "leg": round(L, 3), "fps": fps,
        "drop": round((drop + sum(extra) / n) / max(L, 1e-4), 3),
        # (while down, against its leg: how far it's off along (the mean), how far up off the ground (the most); the
        # share of its time down that it's on its mark)
        "miss": [round(sum(m[0] for m in miss) / max(1, len(miss)), 3), round(max((m[1] for m in miss), default=0), 3),
                 round(sum(1 for m in miss if m[2]) / max(1, len(miss)), 3)]}


# ---------------------------------------------------------------- a heel on the ground (a bear's, a beaver's)
# the clips that stand on their hind feet (not lying, sitting, swimming, dead)
PLANT_CLIPS = ("idle", "idle2", "look", "eat", "walk", "trot", "run", "attack", "kick", "hitL", "hitR", "drink", "sniff",
               "groom", "howl", "stamp", "play", "jump")


def plantigrade(R, clips, base, heel=0.5, lift=75.0):
    """The hind legs of a plantigrade animal (the wolf's rig a bear's or a beaver's): the hind foot brought forward
    under the hip, its sole (the leg's last bone) laid flat on the ground behind it — the heel down — and lifted as
    the foot lifts (or where the leg can't reach it flat: the heel comes up first, as a bear's does at the end of a
    stride). `heel`: where the heel stands, behind the hip by this share of the sole. Each clip's feet go where they
    went, moved forward the same for all; the thigh and shin solved to the heel, the sole aimed at the foot."""
    P0 = R.fk(base)
    legs = {k: v for k, v in U_LEGS.items() if k in ("HL", "HR")}
    feet0 = {k: P0[foot].to_translation() for k, (_, _, foot) in legs.items()}
    L = min(P0[c[0]].to_translation().z - feet0[k].z for k, (c, _, _) in legs.items())
    sole, reach, near, fwd = {}, {}, {}, {}
    for k, (chain, last, foot) in legs.items():
        hip, knee, hock = (P0[b].to_translation() for b in chain)
        # (the sole's length as the leg carries its foot — the paw lands at its end exactly)
        sole[k] = (foot_point(R, P0, last, foot) - hock).length
        reach[k] = (knee - hip).length + (hock - knee).length
        # (and how close: a short thigh on a long shin can't bring the heel in under the hip)
        near[k] = abs((knee - hip).length - (hock - knee).length)
        # (the heel under the hip, a little behind: the foot a sole ahead of it)
        fwd[k] = (hip.x - heel * sole[k] + sole[k]) - feet0[k].x
    for name in PLANT_CLIPS:
        frames = clips.get(name)
        if not frames:
            continue
        # (a gait's steps centred under the hip as its own: its feet's mean where the standing foot goes — each gait's
        # stride sits where its leg's window put it, so one shift for all would put a walk's hind feet far forward)
        shift = dict(fwd)
        if name in ("walk", "trot", "run"):
            for k, (chain, last, foot) in legs.items():
                mean = sum(R.fk(q)[foot].to_translation().x for q in frames) / len(frames)
                shift[k] = feet0[k].x + fwd[k] - mean
        for q in frames:
            for k, (chain, last, foot) in legs.items():
                R.shift(q, (shift[k], 0, 0), bones=[foot])
                P = R.fk(q)
                F = P[foot].to_translation()
                hip = P[chain[0]].to_translation()
                up = max(0.0, min(1.0, (F.z - feet0[k].z) / (0.25 * L)))
                th = math.radians(4.0 + lift * up)
                while True:
                    H = F + Vector((-math.cos(th), 0.0, math.sin(th))) * sole[k]
                    if 1.05 * near[k] <= (H - hip).length <= 0.97 * reach[k] or th > math.radians(85):
                        break
                    th += math.radians(4.0)
                solve_leg(R, q, chain[:2], chain[1], chain[2], H, iters=40)
                solve_leg(R, q, [chain[2]], chain[2], foot, F, iters=20)
                # (out of reach even heel up: the paw at the leg's end, not apart from it)
                P = R.fk(q)
                if (foot_point(R, P, last, foot) - F).length > 0.01 * L:
                    rot = q[foot][1].copy()
                    R.attach(q, [(foot, last)])
                    q[foot][1] = rot

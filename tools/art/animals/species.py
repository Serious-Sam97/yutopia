# Plan 126 — the cast's models: each one's source, true size, morph (bones moved in world axes: X nose, Y left,
# Z up), palette and painter, and which clips it makes. Read by build_animals.py (exec'd into it: the colour
# helpers mix/mul/hexc/sstep/noise and the axis vectors are its).

# ---- bone groups
U_LOW = r"(Front|Back)LowerLeg\.[LR]|FFB?\.[LR]|IK(Front|Back)Leg\.[LR]"
U_LEG = r"(Front|Back)(UpperLeg|LowerLeg)\.[LR]|BackLeg\.[LR]"
U_FOOT = r"FFB?\.[LR]|IK(Front|Back)Leg\.[LR]"
U_TAIL = r"Tail\d"
U_EAR = r"Ear\d\.[LR]"
U_NECK = r"Neck\d"
U_SPINE = r"Body|Back|Torso\d?"


def no_udder_horns(name, c, w, f):
    return name == "Horns" or (name == "Muzzle" and w(U_SPINE + r"|" + U_LEG) > 0.4)


def repair_far(limit, relax=True):
    """The rabbit's flank: some of its vertices are skinned to IK controls and sit far off as spikes. Each one
    is pulled back into its neighbours (relaxed till it sits among them) and given their weights."""

    def pre(arm, mo):
        me = mo.data
        H = {b.name: [b.head_local] + [k.head_local for k in b.children] for b in arm.data.bones}
        gi = {g.index: g.name for g in mo.vertex_groups}
        far = set()
        for v in me.vertices:
            ds = [min((v.co - p).length for p in H[gi[g.group]]) for g in v.groups if g.weight > 0.2 and gi[g.group] in H]
            bad = any(gi[g.group].startswith(("control", "pole")) and g.weight > 0.02 for g in v.groups)
            if bad or not ds or min(ds) > limit:
                far.add(v.index)
        nb = {i: set() for i in range(len(me.vertices))}
        for e in me.edges:
            a, b = e.vertices
            nb[a].add(b)
            nb[b].add(a)
        # (each glTF corner split: neighbours across a seam are the vertices at the same place)
        co = {i: me.vertices[i].co.copy() for i in range(len(me.vertices))}
        for _ in range(80 if relax else 0):
            new = {}
            for i in far:
                ns = list(nb[i])
                if ns:
                    new[i] = sum((co[j] for j in ns), Vector()) / len(ns)
            co.update(new)
        for i in far:
            me.vertices[i].co = co[i]
        # weights: the nearest good vertex's
        good = [v.index for v in me.vertices if v.index not in far]
        P = np.array([tuple(me.vertices[i].co) for i in good])
        for i in far:
            j = good[int(np.argmin(((P - np.array(tuple(co[i]))) ** 2).sum(1)))]
            src = [(g.group, g.weight) for g in me.vertices[j].groups]
            for g in list(me.vertices[i].groups):
                mo.vertex_groups[g.group].remove([i])
            for gidx, wt in src:
                mo.vertex_groups[gidx].add([i], wt, "REPLACE")
        me.update()
        print(f"[animals] repaired {len(far)} stray vertices")

    return pre


def antler_faces(mo, P):
    """The stag's antler faces: its dark material (shared with the nose and hooves), above the eyes."""
    me = mo.data
    names = [m.name if m else "" for m in me.materials]
    eye = [v for p in me.polygons if names[p.material_index] == "Material.011" for v in p.vertices]
    above = P[eye][:, 2].max() if eye else P[:, 2].max() * 0.5
    return [p.index for p in me.polygons if names[p.material_index] == "Material.001"
            and P[list(p.vertices)][:, 2].min() > above]


def antlers(sx, sy, sz, lift=0.0):
    """The stag's antlers (its second mesh: on Head, above the skull) reshaped about each one's base."""

    def pre(arm, mo):
        me = mo.data
        names = [m.name if m else "" for m in me.materials]
        P = coords(mo)
        top = P[:, 2].max()
        ids = {v for i in antler_faces(mo, P) for v in me.polygons[i].vertices}
        for side in (1, -1):
            vs = [i for i in ids if P[i, 1] * side > 0]
            if not vs:
                continue
            base = P[min(vs, key=lambda i: P[i, 2])]
            for i in vs:
                d = P[i] - base
                me.vertices[i].co = Vector(base + d * np.array([sx, sy, sz]) + np.array([0, 0, lift]))
        me.update()

    return pre


def no_antlers(arm, mo):
    """The stag's branching antlers taken off (the moose gets palms after its morph: palms_after)."""
    me = mo.data
    P = coords(mo)
    ant = antler_faces(mo, P)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in ant], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    me.update()


def palms_after(length=1.0, lift=12.0):
    """The moose's antlers, put on once its head is shaped: on each side, just behind the eyes on the top of the
    skull, a short thick beam out and a flat blade with tines along its outer edge (smoothed by the
    subdivision later). Skinned to Head."""

    def post(arm, mo):
        me = mo.data
        names = [m.name if m else "" for m in me.materials]
        mat = names.index("Material.001")
        P = coords(mo)
        H = P[:, 2].max() - P[:, 2].min()
        eye = np.array(sorted({v for p in me.polygons if names[p.material_index] == "Material.011" for v in p.vertices}))
        ex, ew = P[eye, 0].mean(), np.abs(P[eye, 1]).max()
        gh = mo.vertex_groups["Head"].index
        head = np.array([v.index for v in me.vertices if any(g.group == gh and g.weight > 0.5 for g in v.groups)])
        bx = ex - 0.05 * H
        crown = head[(np.abs(P[head, 0] - bx) < 0.04 * H) & (np.abs(P[head, 1]) < 0.7 * ew)]
        bz = P[crown, 2].max() - 0.01 * H
        L = 0.2 * H * length
        outline = [(-0.08, -0.14), (0.28, -0.13), (0.38, -0.28), (0.62, -0.34), (0.8, -0.3), (0.98, -0.42),
                   (0.88, -0.2), (1.04, -0.17), (0.9, -0.06), (1.06, 0.02), (0.9, 0.08), (1.0, 0.19),
                   (0.8, 0.17), (0.86, 0.32), (0.64, 0.22), (0.46, 0.18), (0.3, 0.13), (-0.08, 0.14)]  # fmt: skip
        bm = bmesh.new()
        bm.from_mesh(me)
        deform = bm.verts.layers.deform.verify()
        for side in (1, -1):
            base = Vector((bx, side * 0.6 * ew, bz))
            a = math.radians(lift)
            u = Vector((0, side * math.cos(a), math.sin(a)))  # out from the skull, rising
            v = Vector((1, 0, 0.5)).normalized()  # fore-aft, the front edge raised: a cupped blade
            n = u.cross(v).normalized() * side
            rings = []
            for off in (-1, 1):
                # (thick at the beam, thinner over the blade: a thin plate shrinks away under the subdivision)
                rings.append([bm.verts.new(base + u * (x * L) + v * (y * L * 1.1)
                                           + n * off * L * (0.1 if x < 0.35 else 0.05)) for x, y in outline])
            faces = [bm.faces.new(rings[0][::-1]), bm.faces.new(rings[1])]
            k = len(outline)
            for i in range(k):
                faces.append(bm.faces.new([rings[0][i], rings[0][(i + 1) % k], rings[1][(i + 1) % k], rings[1][i]]))
            for f in faces:
                f.material_index = mat
            for r in rings:
                for vert in r:
                    vert[deform][gh] = 1.0
            bmesh.ops.triangulate(bm, faces=faces[:2])
        bm.to_mesh(me)
        bm.free()
        me.update()

    return post


def eye_near(V, r):
    if not V.eyes:
        return 1e9, None
    e = min(V.eyes, key=lambda e: (V.p - e).length)
    return (V.p - e).length / r, e


def antler_part(V, hoof, nose="#1c1715"):
    """The stag's dark material is its antlers, its nose and its hooves: which one this corner is (or None)."""
    if V.role != "antler":
        return None
    if V.w("Head") < 0.5:
        V.role = "hoof"
        return hexc(hoof)
    if V.eyes and V.p.z < max(e.z for e in V.eyes):
        V.role = "nose"
        return hexc(nose)
    return None


# ---- painters (sRGB in, sRGB out; V: role, p, n, u (0 tail → 1 nose), h (0 feet → 1 top), w(bone regex), tex)
def p_deer(c, V):
    part = antler_part(V, "#2a231e")
    if part:
        return part
    if V.flat:
        return c
    if V.role == "coat":
        c = mix(c, "#6e5a48", sstep(0.55, 0.95, V.h) * 0.6)
    return c


def p_elk(c, V):
    part = antler_part(V, "#221b16")
    if part:
        return part
    if V.flat:
        return c
    dark = "#3e2c1f"
    c = mix(c, dark, V.w(U_NECK + "|Head|Torso3") * 0.9 + V.w(U_LEG + "|" + U_FOOT) * 0.85)
    if V.role == "light" and V.w("Head|" + U_NECK) < 0.3:
        c = hexc("#dcc9a6")  # the rump patch, the belly
    return c


def p_moose(c, V):
    part = antler_part(V, "#1f1915", "#2a201a")
    if part:
        return part
    if V.flat:
        return c
    c = hexc("#2c211a") if V.role != "light" else hexc("#3b2d23")
    c = mix(c, "#7a6a58", V.w(U_LOW) * 0.85)  # the pale stockings
    c = mix(c, "#3d3029", V.w("Head") * 0.6)
    return c


def p_wolf(c, V):
    if V.flat:
        return c
    if V.role == "coat":
        c = mix("#8b8a84", "#4f4c47", sstep(0.62, 0.95, V.h) * 0.8 + V.w(U_TAIL) * 0.3)
        c = mix(c, "#6a655d", V.w(U_EAR) * 0.6)
    return c


def p_fox(c, V):
    if V.flat:
        return c
    if V.role == "coat":
        c = mix("#c75a1e", "#9c4318", sstep(0.6, 0.95, V.h) * 0.6)
        c = mix(c, "#2a1d18", V.w(r"Ear[34]\.[LR]") * 0.9)
    return c


def p_lynx(c, V):
    if V.flat:
        return c
    base = mix("#b09a7c", "#8c7a62", sstep(0.6, 0.95, V.h))
    if V.role == "light":
        base = hexc("#e7dcc8")
    if V.role == "socks":
        base = hexc("#a08c70")
    k = 9.0 / V.top
    spot = sstep(0.42, 0.55, noise.noise(V.p * k))
    base = mix(base, "#5a4a3a", spot * 0.55 * (1 - V.w("Head")) * (V.role != "light"))
    base = mix(base, "#1c1714", V.w(r"Ear4\.[LR]") * 0.95 + V.w(r"Tail[5-8]") * 0.9)
    return base


def p_raccoon(c, V):
    if V.flat:
        return c
    base = mix("#8e8a84", "#55524e", sstep(0.55, 0.95, V.h) * 0.7)
    if V.role == "light":
        base = hexc("#cfcbc4")
    if V.role == "socks":
        base = hexc("#2c2826")
    if V.w(U_TAIL) > 0.3:
        ring = sstep(0.1, 0.4, math.sin(2 * math.pi * V.u * 19))
        base = mix(base, "#262220", ring * V.w(U_TAIL) + V.w(r"Tail[78]") * 0.8)
    if V.w("Head") > 0.4 and V.eyes:
        d, e = eye_near(V, 0.16 * V.top)
        if e is not None:
            mask = 1 - sstep(0.7, 1.15, max(abs(V.p.x - e.x) * 0.8, abs(V.p.z - e.z) * 1.6) / (0.16 * V.top))
            base = mix(base, "#1b1817", mask * V.w("Head"))
            if V.p.z > e.z + 0.08 * V.top and abs(V.p.x - e.x) < 0.2 * V.top:
                base = mix(base, "#e8e4de", 0.7 * V.w("Head"))
    return base


def p_squirrel(c, V):
    if V.flat:
        return c
    if V.role == "light" and V.w("Head") > 0.3:
        return mix("#b5683e", "#e8d6bc", 0.35)  # (no fox's white mask: a paler cheek)
    base = mix("#a5532d", "#7d3f24", sstep(0.6, 0.95, V.h) * 0.5)
    if V.role == "light" and V.w(U_TAIL) < 0.4:
        base = hexc("#efe2cc")
    if V.role == "socks":
        base = hexc("#8a4a2a")
    base = mix(base, "#b8663a", V.w(U_TAIL) * 0.6)
    return base


def p_beaver(c, V):
    if V.flat:
        return c
    base = mix("#5a3d28", "#3e2a1c", sstep(0.55, 0.95, V.h) * 0.6)
    if V.role == "light":
        base = hexc("#7a5a42")
    if V.role == "socks":
        base = hexc("#2d221c")
    tail = V.w(r"Tail[2-8]")
    if tail > 0.2:
        scale = 0.5 + 0.5 * noise.noise(V.p * (40.0 / V.top))
        base = mix(base, mul("#3a3330", 0.9 + 0.2 * scale), tail)
    return base


def p_cat(c, V):
    if V.flat:
        return c
    base = mix("#9a8a74", "#7a6a56", sstep(0.6, 0.95, V.h) * 0.6)
    belly = V.role == "light"
    if belly:
        base = hexc("#dcd2c0")
    if V.role == "socks":
        base = hexc("#a8977f")
    k = 2 * math.pi / (0.16 * V.top)
    wob = noise.noise(V.p * (4.0 / V.top)) * 1.0
    if V.w(U_LEG + "|" + U_FOOT + "|" + U_TAIL) > 0.5:
        st = math.sin(V.p.z * k * 0.9 + wob) if V.w(U_TAIL) < 0.5 else math.sin(V.p.x * k + wob)
    else:
        st = math.sin(V.p.x * k + wob)
    stripe = sstep(0.45, 0.85, st) * (0.25 if belly else 0.6)
    base = mix(base, "#3e3329", stripe)
    base = mix(base, "#2e2620", V.w(r"Tail[78]") * 0.8)
    return base


def p_bear(c, V):
    if V.flat:
        return c
    base = mix("#1d1916", "#120f0d", sstep(0.6, 0.95, V.h))
    if V.role == "light" and V.w("Head") > 0.5 and V.eyes:
        e = V.eyes[0]
        if V.p.x > e.x - 0.02 * V.top:
            base = hexc("#8c6a4c")  # the tan muzzle
    return base


def p_boar(c, V):
    if V.flat:
        return c
    base = mix("#6a5644", "#3a2e24", sstep(0.45, 0.92, V.h))
    base = mix(base, "#2a211b", V.w(U_LOW) * 0.8)
    bristle = sstep(0.75, 0.95, V.h) * max(0.0, V.n.z) * (0.5 + 0.5 * noise.noise(V.p * (30.0 / V.top)))
    base = mix(base, "#120e0b", bristle)
    if V.role == "muzzle" or V.role == "light" and V.w("Head") > 0.5:
        base = hexc("#3a2f27")
    return base


def p_pig(c, V):
    if V.flat:
        return c
    base = hexc("#e7aaa0")
    if V.role in ("muzzle",):
        base = hexc("#d98d88")
    base = mix(base, "#d99a92", V.w(U_LOW) * 0.6)
    return base


def p_sheep(c, V):
    if V.flat:
        return c
    face = V.w("Head") + V.w(U_LOW) * 1.2
    curl = 0.5 + 0.5 * noise.noise(V.p * (22.0 / V.top))
    wool = mul("#ece3d0", 0.9 + 0.12 * curl)
    if V.role == "muzzle":
        return hexc("#3a3330")
    return mix(wool, "#2f2a27", min(1.0, face))


def p_cow(c, V):
    if V.flat:
        return c
    if V.role == "muzzle":
        return hexc("#d9a8a0")
    k = 2.2 / V.top
    v = noise.noise(V.p * k + Vector((3.1, 0.7, 1.3)))
    patch = sstep(0.05, 0.12, v)
    base = mix("#f1eee8", "#191716", patch)
    base = mix(base, "#f1eee8", V.w(U_LOW) * 0.85)
    if V.w("Head") > 0.5:
        base = mix(base, "#191716", sstep(0.3, 0.6, V.w("Head")) * (1 - sstep(-0.2, 0.4, V.n.x)))
    return base


def p_horse(c, V):
    if V.flat:
        return c
    if V.role == "mane":
        return hexc("#151110")
    base = mix("#7a3f1f", "#5a2c15", sstep(0.6, 0.95, V.h) * 0.6)
    base = mix(base, "#1a1310", V.w(U_LOW) * 0.9)
    if V.role in ("muzzle",):
        base = hexc("#2a1d17")
    return base


def p_horse_white(c, V):
    if V.flat:
        return c
    if V.role == "mane":
        return hexc("#ddd6ca")
    base = mix("#ece8e1", "#d6d1c8", sstep(0.6, 0.95, V.h))
    base = mix(base, "#c9c3b9", V.w(U_LOW) * 0.5)
    if V.role == "muzzle":
        base = hexc("#5a504a")
    return base


def p_hare(c, V):
    if V.role == "eye":
        return hexc("#151212") if V.p.z > 0.6 * V.top else hexc("#b88a86")
    tip = V.w(r"hear\.002\.[LR]")
    base = hexc("#f4f3ee")
    if V.role == "light":
        base = hexc("#fbfaf6")
    return mix(base, "#6b5b4b", sstep(0.25, 0.75, tip))


def p_frog(c, V):
    if V.role == "eye":
        return hexc("#0f0d0b")
    base = mix("#6c8a3c", "#4a6a2a", sstep(0.4, 0.9, V.h))
    if V.n.z < -0.2 or V.role == "light":
        base = mix(base, "#d5d29a", sstep(-0.2, -0.6, V.n.z) + (0.6 if V.role == "light" else 0))
    spot = sstep(0.35, 0.5, noise.noise(V.p * (6.0 / V.top)))
    return mix(base, "#2f3f1c", spot * 0.7 * max(0.0, V.n.z))


def p_bat(c, V):
    if V.flat and V.role != "black":
        return c
    if V.role == "black":
        return hexc("#2a1f1c")
    if V.role == "light":
        return hexc("#6e5442")
    return hexc("#3c2c25")


def p_fish(c, V):
    if V.role == "fins":
        return hexc("#8c8064")
    top = mix("#4e5d3c", "#6d7650", V.h)
    base = mix(hexc("#e6e5da"), top, sstep(0.25, 0.65, V.h))
    base = mix(base, "#c98a86", sstep(0.75, 0.95, abs(V.n.y)) * sstep(0.3, 0.45, V.h) * (1 - sstep(0.55, 0.7, V.h)) * 0.6)
    spot = sstep(0.45, 0.55, noise.noise(V.p * (25.0 / V.top)))
    return mix(base, "#2a2a22", spot * sstep(0.45, 0.6, V.h) * 0.7)


# ---- birds: colour by the region each vertex's weights lie in
B_BEAK = r"beak.*"
B_EYE = r"eye\.[LR]"
B_NECK = r"neck\.\d+"
B_WING = r"Wing.*|w_feather.*|shoulder\.[LR]"
B_PRIM = r"Wing\.002\.[LR]|w_feather\.00[12]\.[LR]"
B_TAIL = r"t_feather\.[LR]|spine|spine\.001"
B_LEGS = r"shin\.[LR]|foot\.[LR]|t_(ring|index|middle|thumb)\.\d+\.[LR]"


def bird(body, head=None, neck=None, breast=None, back=None, wing=None, prim=None, tail=None, beak="#2a2624",
         legs="#3a3330", eye="#120f0e", detail=0.35, extra=None):  # fmt: skip
    def fn(c, V):
        b = hexc(body)
        if back:
            b = mix(b, back, sstep(0.1, 0.6, V.n.z))
        if breast:
            b = mix(b, breast, sstep(0.0, 0.5, V.n.x - max(0.0, V.n.z)) * (1 - V.w(B_WING)))
        if tail:
            b = mix(b, tail, V.w(B_TAIL))
        if wing:
            b = mix(b, wing, V.w(B_WING))
        if prim:
            b = mix(b, prim, V.w(B_PRIM))
        if neck:
            b = mix(b, neck, V.w(B_NECK))
        if head:
            b = mix(b, head, V.w("head") + V.w(B_EYE) * 0.5)
        if extra:
            b = extra(b, V)
        if V.tex is not None and detail:
            b = mul(b, 1 + (min(V.tex, 1.6) - 1) * detail)
        b = mix(b, legs, sstep(0.3, 0.7, V.w(B_LEGS)))
        if V.w(B_BEAK) > 0.5:
            V.flat = True
            b = hexc(beak)
        if V.w(B_EYE) > 0.75:
            V.flat = True
            b = hexc(eye)
        return b

    return fn


def mallard_extra(b, V):
    ring = V.w(B_NECK) * sstep(0.2, 0.6, V.w("neck.001")) * (1 - V.w("head"))
    b = mix(b, "#f0eee8", sstep(0.35, 0.6, ring))
    spec = V.w(r"Wing\.001\.[LR]") * sstep(0.2, 0.5, -V.n.z + 0.4)
    return mix(b, "#2c4aa0", spec * 0.6)


def goose_extra(b, V):
    if V.w("head") > 0.5 and V.eyes:
        d, e = eye_near(V, 0.05 * V.top)
        if e is not None and V.p.z < e.z and V.p.x < e.x + 0.02 * V.top:
            b = mix(b, "#f2f1ec", 0.95)  # the white chinstrap
    return mix(b, "#f2f0ea", sstep(0.3, 0.8, -V.n.z) * V.w(B_TAIL))


def gull_extra(b, V):
    return mix(b, "#1c1c1e", V.w(r"w_feather\.00[12]\.[LR]") * 0.9)


def owl_extra(b, V):
    m = 0.5 + 0.5 * noise.noise(V.p * (30.0 / V.top))
    b = mul(b, 0.82 + 0.3 * m)
    if V.w("head") > 0.5:
        b = mix(b, "#d6c3a0", sstep(0.3, 0.8, V.n.x))  # the facial disc
    return b


def pigeon_extra(b, V):
    sheen = V.w(B_NECK) * (0.5 + 0.5 * math.sin(V.p.z * 60.0 / V.top + V.n.y * 3))
    b = mix(b, mix("#4f7a62", "#7a5a8a", 0.5 + 0.5 * math.sin(V.n.y * 4)), sheen * 0.8)
    bar = V.w(r"Wing\.001\.[LR]") * sstep(0.2, 0.6, V.n.z)
    return mix(b, "#3c3f48", bar * 0.7)


def hen_extra(b, V):
    if V.w("head") > 0.5:
        top = sstep(0.55, 0.9, V.n.z)
        b = mix(b, "#c4202a", top)  # the comb
        if V.eyes:
            e = V.eyes[0]
            if V.p.z < e.z - 0.03 * V.top and V.p.x > e.x - 0.01 * V.top:
                b = mix(b, "#c4202a", 0.9)  # the wattles
    return b


def chick_extra(b, V):
    return b


def bird_neck(arm, mo):
    """The hawk's neck skin hangs on neck.003, a stub beside the neck's chain: its weights handed to neck.001 and
    neck.002 by where each vertex lies between the chest and the head, so the neck stretches and bends."""
    B = arm.data.bones
    a, h = B["neck.001"].head_local, B["head"].head_local
    ax = h - a
    g3 = mo.vertex_groups.get("neck.003")
    g1, g2 = mo.vertex_groups["neck.001"], mo.vertex_groups["neck.002"]
    if g3 is None:
        return
    for v in mo.data.vertices:
        w = next((g.weight for g in v.groups if g.group == g3.index), 0.0)
        if w <= 0:
            continue
        t = max(0.0, min(1.0, (v.co - a).dot(ax) / ax.length_squared))
        g3.remove([v.index])
        for grp, part in ((g1, w * (1 - t)), (g2, w * t)):
            if part > 1e-4:
                old = next((g.weight for g in v.groups if g.group == grp.index), 0.0)
                grp.add([v.index], old + part, "REPLACE")


def bird_morph(pitch=0.0, neck=1.0, head=1.0, body=(1, 1, 1), wings=1.0, legs=1.0, beak=(1, 1, 1), tail=1.0,
               tail_up=0.0, neck_counter=0.85):  # fmt: skip
    return dict(
        scale={
            r"spine\.00[2-7]|pelvis\.[LR]": body,
            r"head|eye\.[LR]": head,
            B_BEAK: beak,
            r"Wing.*|w_feather.*": wings,
            r"thigh\.[LR]|shin\.[LR]|foot\.[LR]|t_(ring|index|middle|thumb)\.\d+\.[LR]": legs,
            r"t_feather\.[LR]|spine|spine\.001": tail,
        },
        stretch={r"neck\.00[12]|neck\.003": (neck, 1.0)},
        rot={
            r"spine\.003": (0, pitch, 0),
            r"thigh\.[LR]": (0, -pitch, 0),
            r"neck\.001": (0, -pitch * neck_counter, 0),
            r"t_feather\.[LR]": (0, tail_up, 0),
        },
    )


HAWK = dict(rig="B", src="hawk", pre=bird_neck, measure=("length", None), budget=6000, subdiv=False, noise=4.0, vary=0.05,
            copyright="Hawk Lp Rigged by Sherkiz (https://poly.pizza/m/RkN6MEbP6g), CC BY 3.0 — recoloured and "
                      "reshaped for Yutopia, new clips")  # fmt: skip
RABBIT_CR = ("Rabbit by Sherkiz (https://poly.pizza/m/Km89u3twcR), CC BY 3.0 — recoloured and reshaped for "
             "Yutopia, new clips")  # fmt: skip

STAG_ROLES = {"Material.003": "light", "Material": "coat", "Material.010": "dark", "Material.001": "antler",
              "Material.011": "eye"}  # fmt: skip
# (dogs, cats, bears lie like a sphinx — forelegs forward on the ground — and sit on their haunches)
PAW = dict(lie={"front": (-85, 5), "back": (-60, 125, -75), "neck": -4, "splay": 18},
           sit_pose={"pitch": -52, "back": (-62, 130, -62)})
FOXLIKE = dict(rig="U", src="fox", sit=True, swim=True, **PAW)

MODELS = {
    # ---- big
    "deer": dict(rig="U", src="deer", size=0.95, swim=True, palette={"coat": "#8a705a", "light": "#efe9de",
                 "dark": "#3d3027", "hoof": "#2a231e", "eye": "#141110", "eyering": "#5a4636",
                 "eyewhite": "#d8d2c8"}, paint=p_deer),  # fmt: skip
    "deer_buck": dict(rig="U", src="stag", size=1.0, swim=True, roles=STAG_ROLES, pre=antlers(0.9, 0.9, 0.9),
                      palette={"coat": "#86705a", "light": "#d6cab8", "dark": "#3a2d24", "antler": "#cdb998",
                               "eye": "#141110"}, paint=p_deer),  # fmt: skip
    "elk": dict(rig="U", src="stag", size=1.45, swim=True, roles=STAG_ROLES, pre=antlers(1.1, 1.15, 1.15),
                morph=dict(scale={U_NECK: (1, 1.3, 1.2), r"Torso3": (1, 1.1, 1.1)}),
                palette={"coat": "#b08f68", "light": "#dcc9a6", "dark": "#2e2219", "antler": "#c9b38e",
                         "eye": "#141110"}, paint=p_elk),  # fmt: skip
    "moose": dict(rig="U", src="stag", size=1.9, swim=True, roles=STAG_ROLES, pre=no_antlers, post=palms_after(1.6, 22.0),
                  morph=dict(scale={U_LEG: (1, 1, 1.28), r"Torso3": (1, 1.12, 1.45), r"Torso2?|Back": (1.05, 1.12, 1.12),
                                    U_NECK: (0.8, 1.35, 1.3), r"Head": (2.1, 1.25, 1.0), U_TAIL: (0.4, 0.6, 0.6)},
                             rot={r"Neck1": (0, 12, 0)},
                             locscale={r"IK.*": 1.25}),
                  palette={"antler": "#b8a586", "eye": "#100d0b"}, paint=p_moose),  # fmt: skip
    "wolf": dict(rig="U", src="wolf_b", size=0.8, sit=True, swim=True, **PAW,
                 palette={"light": "#e4dccb", "eye": "#1a1410", "nose": "#151312"}, paint=p_wolf),  # fmt: skip
    "bear": dict(rig="U", src="wolf_b", size=1.0, sit=True, swim=True, trot=1.3, plant={"heel": 0.5},
                 merge_weights={r"Tail\d": "Back"},
                 lie={"front": (-80, 5), "back": (-45, 100, -55), "neck": -4, "splay": 8, "hind": "stretch"},
                 sit_pose={"pitch": -45, "back": (-55, 115, -55), "hock": 0.3},
                 morph=dict(scale={U_SPINE: (1.1, 1.65, 1.5), r"Torso3": (1.0, 1.0, 1.15), r"(Front|Back)Shoulder\.[LR]": (1.4, 1.3, 1.0),
                                   U_LEG: (1.45, 1.4, 0.95), U_FOOT: (1.35, 1.35, 1.0), U_TAIL: (0.08, 0.4, 0.4),
                                   U_EAR: (0.6, 0.8, 0.5), r"Head": (0.95, 1.6, 1.4), U_NECK: (0.8, 1.55, 1.45)},
                            locscale={r"IK.*": 0.95}),
                 palette={"eye": "#0d0b0a", "nose": "#0f0d0c"}, paint=p_bear),  # fmt: skip
    "boar": dict(rig="U", src="cow", size=0.85, delete=no_udder_horns, trot=1.4,
                 morph=dict(scale={U_LEG: (0.9, 0.9, 0.62), U_FOOT: (0.9, 0.9, 0.8), r"Torso3": (1.0, 1.0, 1.25),
                                   U_SPINE: (0.92, 1.05, 1.05), U_NECK: (0.55, 1.25, 1.2), r"Head": (1.2, 0.8, 0.85),
                                   U_TAIL: (0.45, 0.6, 0.6)}, locscale={r"IK.*": 0.65}),
                 palette={"hoof": "#1f1a17", "eye": "#0e0c0b", "eyewhite": "#2a221e"}, paint=p_boar),  # fmt: skip
    "lynx": dict(**FOXLIKE, size=0.6,
                 morph=dict(scale={U_LEG: (1, 1, 1.32), U_FOOT: (1.35, 1.35, 1.2), U_TAIL: (0.22, 0.85, 0.85),
                                   U_EAR: (1.25, 1.3, 1.45), r"Head": (0.62, 1.2, 1.08), U_SPINE: (0.92, 1.12, 1.1),
                                   r"(Front|Back)(UpperLeg|LowerLeg)\.[LR]|BackLeg\.[LR]": (1.3, 1.3, 1.0)},
                            locscale={r"IK.*": 1.3}),
                 palette={"eye": "#2a2410", "nose": "#3a2a26"}, paint=p_lynx),  # fmt: skip
    # ---- small
    "fox": dict(**FOXLIKE, size=0.4, budget=9000,
                palette={"light": "#f1ebe0", "socks": "#1d1714", "eye": "#1a130e", "nose": "#121010"}, paint=p_fox),  # fmt: skip
    "raccoon": dict(**FOXLIKE, size=0.3, budget=8000, trot=1.35,
                    morph=dict(scale={U_LEG: (1.1, 1.1, 0.6), U_FOOT: (1.15, 1.15, 0.9), U_SPINE: (1.0, 1.35, 1.3),
                                      U_TAIL: (0.75, 1.5, 1.5), r"Head": (0.8, 1.15, 1.05), U_EAR: (0.7, 0.85, 0.6),
                                      U_NECK: (0.9, 1.2, 1.2)}, locscale={r"IK.*": 0.6}),
                    palette={"eye": "#0f0d0c", "nose": "#141212"}, paint=p_raccoon),  # fmt: skip
    "squirrel": dict(**FOXLIKE, size=0.1, budget=6000,
                     morph=dict(scale={U_LEG: (1.15, 1.15, 0.5), U_SPINE: (0.8, 1.15, 1.15), U_TAIL: (1.2, 2.5, 2.5),
                                       r"Head": (0.58, 1.15, 1.15), U_EAR: (0.7, 0.8, 0.8), U_NECK: (0.7, 1.1, 1.1)},
                                rot={r"Tail1": (0, 55, 0), r"Tail4": (0, 35, 0)}, locscale={r"IK.*": 0.6}),
                     palette={"eye": "#0f0d0c", "nose": "#2a1d18"}, paint=p_squirrel),  # fmt: skip
    "beaver": dict(**FOXLIKE, size=0.35, budget=8000, trot=1.3, drop=("sit",), plant={"heel": 2.0},
                   morph=dict(scale={U_LEG: (1.3, 1.3, 0.45), U_FOOT: (1.3, 1.3, 0.8), U_SPINE: (1.1, 1.6, 1.45),
                                     U_NECK: (0.7, 1.5, 1.4), r"Head": (0.65, 1.3, 1.15), U_EAR: (0.4, 0.4, 0.35),
                                     U_TAIL: (0.7, 2.6, 0.35)},
                              rot={r"Tail1": (0, -15, 0)}, locscale={r"IK.*": 0.5}),
                   palette={"eye": "#0f0d0c", "nose": "#1a1412"}, paint=p_beaver),  # fmt: skip
    "cat": dict(**FOXLIKE, size=0.26, budget=8000,
                morph=dict(scale={r"Head": (0.58, 1.12, 1.1), U_TAIL: (1.1, 0.5, 0.5), U_LEG: (1.1, 1.1, 0.85),
                                  U_SPINE: (0.92, 1.0, 1.0), U_EAR: (0.9, 1.0, 0.9)}, locscale={r"IK.*": 0.85}),
                palette={"eye": "#7a8a2a", "nose": "#c08a86"}, paint=p_cat),  # fmt: skip
    "hare": dict(rig="R", src="rabbit", yaw=-90.0, size=0.3, measure=("height", None), budget=6000,
                 rest_from="stored", nose="head", pre=repair_far(0.25, relax=False), palette={}, paint=p_hare, copyright=RABBIT_CR),  # fmt: skip
    "frog": dict(rig="R", src="rabbit", yaw=-90.0, size=0.09, measure=("length", None), budget=4000,
                 rest_from="stored", nose="head", pre=repair_far(0.25, relax=False), situp=-25, drop=("sit",),
                 morph=dict(scale={r"hear.*": 0.12, r"spine(\.00[1-3])?|belly\.C|Breast\.C|pelvis.*": (1.0, 1.5, 0.6),
                                   r"head|head\.001|neck.*": (0.8, 1.6, 0.65), r"tail\.001": 0.2,
                                   r"thigh\.[LR]|shin\.[LR]|foot\.[LR]|r_toe\.[LR]": (1.25, 1.2, 1.1)}),
                 paint=p_frog, copyright=RABBIT_CR),  # fmt: skip
    # ---- the farm
    "cow": dict(rig="U", src="cow", size=1.4, palette={"hoof": "#2b2520", "horn": "#d9cfb8", "eye": "#0f0d0c",
                "eyewhite": "#c9c2b8"}, paint=p_cow),  # fmt: skip
    "pig": dict(rig="U", src="cow", size=0.8, delete=no_udder_horns, trot=1.4,
                morph=dict(scale={U_LEG: (0.9, 0.9, 0.52), U_FOOT: (0.9, 0.9, 0.75), U_SPINE: (1.0, 1.2, 1.1),
                                  U_NECK: (0.55, 1.2, 1.0), r"Head": (0.85, 0.95, 0.85), U_TAIL: (0.4, 0.6, 0.6)},
                           locscale={r"IK.*": 0.55}),
                palette={"hoof": "#6a5048", "eye": "#141110", "eyewhite": "#e8c0b8"}, paint=p_pig),  # fmt: skip
    "sheep": dict(rig="U", src="cow", size=0.8, delete=no_udder_horns, trot=1.4,
                  morph=dict(scale={U_SPINE: (1.0, 1.5, 1.45), U_NECK: (0.6, 1.5, 1.35), r"Head": (0.72, 0.78, 0.85),
                                    U_LEG: (0.72, 0.72, 0.75), U_FOOT: (0.8, 0.8, 1.0), U_TAIL: (0.35, 1.2, 1.2)},
                             locscale={r"IK.*": 0.75}),
                  palette={"hoof": "#1f1b19", "eye": "#141110", "eyewhite": "#3a3330"}, paint=p_sheep),  # fmt: skip
    "horse": dict(rig="U", src="horse_a", size=1.6, swim=True,
                  palette={"hoof": "#2a2420", "eye": "#0f0d0c", "eyewhite": "#2a2420", "light": "#8a4a26",
                           "dark": "#2a1a12"}, paint=p_horse),  # fmt: skip
    "horse_white": dict(rig="U", src="horse_white", size=1.6, swim=True,
                        palette={"hoof": "#4a403a", "eye": "#0f0d0c", "eyewhite": "#2a2420", "light": "#e2ddd4"},
                        paint=p_horse_white),  # fmt: skip
    # ---- birds (the hawk's rig)
    "crow": dict(HAWK, size=0.45, morph=bird_morph(pitch=20, beak=(1.4, 1.0, 1.1)),
                 paint=bird("#2a2a31", back="#212128", wing="#25252c", beak="#18181a", legs="#1c1c1e", eye="#0a0a0a", detail=0.3)),  # fmt: skip
    "songbird": dict(HAWK, size=0.15, budget=4000, morph=bird_morph(pitch=15, head=1.25, beak=(0.6, 0.8, 0.8), legs=0.8,
                     body=(1, 1.2, 1.1)), headbob=False,
                     paint=bird("#7a5a3c", head="#6b5a4a", breast="#c4643a", back="#6a4c32", wing="#5e4a36",
                                beak="#2b2622", legs="#8a6a5a")),  # fmt: skip
    "duck": dict(HAWK, size=0.55, waddle=9, morph=bird_morph(pitch=38, neck=0.7, body=(1, 1.4, 0.85), legs=0.55,
                 beak=(1.3, 1.8, 0.6)),
                 paint=bird("#a8a49c", head="#1f5a35", neck="#1f5a35", breast="#6b3b28", back="#7a6a58",
                            wing="#8a7c6a", tail="#2a2a2a", beak="#d6bd34", legs="#e0882a", extra=mallard_extra,
                            detail=0.2)),  # fmt: skip
    "goose": dict(HAWK, size=0.85, waddle=7, morph=bird_morph(pitch=30, neck=3.2, body=(1, 1.3, 1.0), legs=0.8,
                  beak=(1.1, 1.3, 0.9)),
                  paint=bird("#8c8273", head="#1b1b1b", neck="#1b1b1b", breast="#a39a8c", back="#6e6558",
                             wing="#6a6154", tail="#2a2724", beak="#1b1b1b", legs="#1e1e1e", extra=goose_extra)),  # fmt: skip
    "gull": dict(HAWK, size=0.6, morph=bird_morph(pitch=25, legs=0.8, wings=1.15, beak=(1.2, 0.8, 0.9)),
                 paint=bird("#f2f2ef", wing="#9aa3ab", back="#e8e8e6", tail="#f2f2ef", beak="#e6c53a",
                            legs="#d9b89a", extra=gull_extra, detail=0.15)),  # fmt: skip
    "owl": dict(HAWK, size=0.45, measure=("height", None), look=110, idle_head=14, morph=bird_morph(pitch=-12, neck=0.3, head=2.1,
                body=(1, 1.35, 1.2), tail=0.6, legs=0.8, beak=(0.55, 0.65, 0.65)),
                paint=bird("#7a6248", head="#8a7056", breast="#a08668", wing="#6a5440", beak="#3a3028",
                           legs="#9a8a70", eye="#d9a21e", extra=owl_extra, detail=0.3)),  # fmt: skip
    "pigeon": dict(HAWK, size=0.32, morph=bird_morph(pitch=22, head=0.85, body=(1, 1.2, 1.1), beak=(0.6, 0.7, 0.7),
                   legs=0.6),
                   paint=bird("#8e95a3", head="#6c7383", neck="#6c7383", wing="#9aa0ac", prim="#3c3f48",
                              tail="#4a4e58", beak="#2a2a2e", legs="#c86a6a", eye="#c8541a", extra=pigeon_extra,
                              detail=0.2)),  # fmt: skip
    "chicken": dict(HAWK, size=0.4, measure=("height", None), budget=6000, waddle=6,
                    morph=bird_morph(pitch=30, neck=0.8, head=1.1, body=(1.0, 1.5, 1.35), wings=0.55, legs=0.9,
                                     beak=(0.7, 0.9, 0.9), tail_up=35, tail=0.5),
                    paint=bird("#9c5a2e", head="#b8743a", neck="#c2843f", wing="#8a4e28", tail="#3d2a1d",
                               beak="#e0b84a", legs="#d9b44a", extra=hen_extra, detail=0.25)),  # fmt: skip
    "chick": dict(HAWK, size=0.12, measure=("height", None), budget=4000, drop=("fly", "glide", "jump"),
                  morph=bird_morph(pitch=10, neck=0.4, head=1.6, body=(1.6, 1.6, 1.6), wings=0.4, legs=0.6,
                                   tail=0.3, beak=(0.6, 0.8, 0.8)),
                  paint=bird("#f2d14a", head="#f5d955", beak="#e8902a", legs="#e8902a", detail=0.1)),  # fmt: skip
    # ---- the rest
    "bat": dict(rig="bat", src="bat", rest_from="stored", nose="Nose", size=0.12, measure=("height", None), centre="body", budget=5000,
                palette={"eye": "#0a0808", "nose": "#4a2e2e"}, paint=p_bat),  # fmt: skip
    "fish": dict(rig="fish", src="fish", rest_from="stored", nose="Face", size=0.3, measure=("length", None), centre="body", budget=4000,
                 paint=p_fish),  # fmt: skip
}

# Plan 92 — the road cars' line-up (docs/plan/92-the-cars.md, F10b: a model per variant, three a body). Each
# variant: its body's numbers (bodies.py) with its own changes, and how it's dressed (dress.py):
#   head     rect | quad (four round)          grille   horizontal | vertical (chrome) | body
#   bumper   black | chrome | paint            wheels   cover | steel | lattice | turbine | sport | winter | offroad
#   seat     tweed | velvet | leather           chrome   window surrounds, mouldings' inserts, handles
#   walnut   the dash's and doors' strips       sport    bucket seats, a leather wheel
#   fogs     round fog lamps in the bumper      badge    the model's name on the tail ("ESKER" is the make: ours)
import copy

import bodies

ROAD = []
BODIES = {}
_V = {}


def body(name, spec, far="base"):
    BODIES[name] = dict(spec=spec, far=far)


def variant(vid, v, **spec_changes):
    ROAD.append(vid)
    _V[vid] = (spec_changes, v)


def get(vid):
    changes, v = _V[vid]
    spec = copy.deepcopy(BODIES[vid.split("-")[0]]["spec"])
    for k, x in changes.items():
        spec[k] = x
    return spec, v


# ── the saloon (the sedan): 4.9 m, four doors, RWD ────────────────────────────────────────────────────────
body("saloon", bodies.SALOON)
variant("saloon-base", dict(name="Esker 240", badge="240", head="rect", grille="horizontal", bumper="black", wheels="cover", seat="tweed"))
variant("saloon-gl", dict(name="Esker 240 GL", badge="240 GL", head="rect", grille="vertical", bumper="chrome", wheels="lattice", seat="velvet", chrome=True, walnut=True, mirror_kind="paint"))
variant("saloon-sport", dict(name="Esker 240 S", badge="240 S", head="quad", grille="horizontal", bumper="paint", wheels="sport", seat="leather", sport=True, fogs=True, mirror_kind="paint", skirts=True, spoiler=True))

# ── the estate (the wagon): the saloon's front, the roof to the tail, a tailgate ───────────────────────────
body("estate", bodies.ESTATE)
variant("estate-base", dict(name="Esker 240 Touring", badge="240 T", head="rect", grille="horizontal", bumper="black", wheels="steel", seat="tweed"))
variant("estate-gl", dict(name="Esker 240 Touring GL", badge="240 GLT", head="rect", grille="vertical", bumper="chrome", wheels="turbine", seat="velvet", chrome=True, walnut=True, wood=True, rails=True, mirror_kind="paint"))
# (the plumber's: a high fibreglass roof behind the front doors, the rear side windows blanked)
variant(
    "estate-utility",
    dict(name="Esker 240 Utility", badge="240 U", head="rect", grille="horizontal", bumper="black", wheels="steel", seat="vinyl", rows=[]),
    gh=[(1.66, 0.958), (2.33, 1.5), (2.48, 1.53), (2.86, 1.535), (2.98, 1.76), (4.62, 1.77), (4.74, 1.72), (4.86, 0.97)],
    quarters=[],
    doors=[dict(grp="door_f", s0=1.71, s1=2.82, bottom=0.28), dict(grp="door_r", s0=2.825, s1=3.68, bottom=0.28, window=False)],
)

# ── the hatch: 3.95 m, FWD, three or five doors ────────────────────────────────────────────────────────────
body("hatch", bodies.HATCH)
variant("hatch-base", dict(name="Esker Pika", badge="PIKA", head="rect", grille="horizontal", bumper="black", wheels="cover", seat="tweed"))
variant(
    "hatch-gl",
    dict(name="Esker Pika GL", badge="PIKA GL", head="rect", grille="vertical", bumper="chrome", wheels="lattice", seat="velvet", chrome=True, mirror_kind="paint"),
    doors=[dict(grp="door_f", s0=1.3, s1=2.2, bottom=0.27), dict(grp="door_r", s0=2.205, s1=2.95, bottom=0.27)],
    quarters=[(2.98, 3.45)],
)
variant("hatch-hot", dict(name="Esker Pika RS", badge="PIKA RS", head="quad", grille="horizontal", bumper="paint", wheels="sport", seat="leather", sport=True, fogs=True, flares=True, flare_kind="trim", scoop=True, spoiler=True, skirts=True, mirror_kind="paint"), track=0.72, wheel_w=0.195)

# ── the 4x4: short soft top, long hard top, the expedition ────────────────────────────────────────────────
body("4x4", bodies.OFFROAD, far="long")
variant("4x4-short", dict(name="Esker Ridge", badge="RIDGE", head="round", grille="horizontal", bumper="black", wheels="offroad", aggressive=True, seat="vinyl", spare=True, canvas_from=2.48, rear_glass="glass_tint"))
variant(
    "4x4-long",
    dict(name="Esker Ridge 5", badge="RIDGE 5", head="round", grille="horizontal", bumper="black", wheels="steel", aggressive=True, seat="tweed", spare=True, rails=True, rows=[(3.2, 0.67, (0.45, -0.45))]),
    L=4.45,
    ahead=2.15,
    axle_r=3.5,
    arches=[(0.75, 0.47), (3.5, 0.47)],
    bottom=[(0.0, 0.5), (0.3, 0.46), (1.2, 0.42), (3.0, 0.42), (4.15, 0.46), (4.45, 0.5)],
    top=[(0.0, 0.95), (0.03, 1.0), (0.1, 1.04), (0.3, 1.06), (1.1, 1.1), (1.2, 1.12), (4.35, 1.12), (4.45, 1.1)],
    gh=[(1.22, 1.115), (1.56, 1.69), (1.66, 1.73), (4.31, 1.735), (4.41, 1.12)],
    openings=[(1.18, 4.41, 0.77)],
    quarters=[(3.3, 4.31)],
    doors=[dict(grp="door_f", s0=1.24, s1=2.3, bottom=0.43), dict(grp="door_r", s0=2.305, s1=3.25, bottom=0.43)],
    boot=dict(kind="side", hinge_s=4.39, z_low=0.5, plate_z=0.72, hw=0.72, glass_bot=0.07),
    cabin=dict(bodies.OFFROAD["cabin"], back=4.35),
)
variant(
    "4x4-expedition",
    dict(name="Esker Ridge Trek", badge="TREK", head="round", grille="horizontal", bumper="black", wheels="offroad", aggressive=True, seat="vinyl", spare=True, rack=True, snorkel=True, bullbar=True, spots=True, flares=True, flare_kind="trim", rows=[(3.2, 0.67, (0.45, -0.45))]),
    L=4.45,
    ahead=2.15,
    axle_r=3.5,
    wheel_r=0.39,
    wheel_w=0.235,
    arch_z=0.42,
    arches=[(0.75, 0.5), (3.5, 0.5)],
    bottom=[(0.0, 0.56), (0.3, 0.52), (1.2, 0.48), (3.0, 0.48), (4.15, 0.52), (4.45, 0.56)],
    top=[(0.0, 1.01), (0.03, 1.06), (0.1, 1.1), (0.3, 1.12), (1.1, 1.16), (1.2, 1.18), (4.35, 1.18), (4.45, 1.16)],
    belt=1.18,
    roof=1.79,
    gh=[(1.22, 1.175), (1.56, 1.75), (1.66, 1.79), (4.31, 1.795), (4.41, 1.18)],
    openings=[(1.18, 4.41, 0.77)],
    quarters=[(3.3, 4.31)],
    doors=[dict(grp="door_f", s0=1.24, s1=2.3, bottom=0.49), dict(grp="door_r", s0=2.305, s1=3.25, bottom=0.49)],
    boot=dict(kind="side", hinge_s=4.39, z_low=0.56, plate_z=0.78, hw=0.72, glass_bot=0.07),
    bumper_z=0.44,
    lamp_z=0.92,
    tail_z=(0.66, 0.92),
    moulding_z=0.68,
    cabin=dict(floor=0.54, back=4.35, wheel_s=1.62, wheel_z=1.21, lever_s=1.75, front_s=2.08, rear_s=2.95, hip=0.74, boot_floor=0.66),
)

# ── the pickup: single cab, crew cab, the farm's flatbed ──────────────────────────────────────────────────
body("pickup", bodies.PICKUP, far="single")
variant("pickup-single", dict(name="Esker Haul", badge="HAUL", head="rect", grille="horizontal", bumper="chrome", wheels="steel", seat="vinyl", vee=True))
variant(
    "pickup-crew",
    dict(name="Esker Haul Crew", badge="HAUL CREW", head="quad", grille="vertical", bumper="chrome", wheels="turbine", seat="velvet", chrome=True, vee=True, mirror_kind="chrome", rows=[(3.55, 0.54, (0.45, -0.45))]),
    L=5.5,
    ahead=2.5,
    axle_r=4.3,
    arches=[(0.95, 0.45), (4.3, 0.45)],
    bottom=[(0.0, 0.48), (0.5, 0.34), (1.42, 0.32), (3.83, 0.32), (4.85, 0.36), (5.5, 0.44)],
    top=[(0.0, 0.8), (0.04, 0.86), (0.12, 0.9), (0.4, 0.93), (1.2, 0.99), (1.62, 1.015), (5.45, 1.02), (5.5, 1.0)],
    gh=[(1.66, 1.012), (2.22, 1.58), (2.34, 1.62), (3.95, 1.625), (4.05, 1.6), (4.08, 1.02)],
    openings=[(1.6, 4.08, 0.86), (4.17, 5.43, 0.86)],
    doors=[dict(grp="door_f", s0=1.71, s1=2.86, bottom=0.33), dict(grp="door_r", s0=2.865, s1=3.78, bottom=0.33)],
    boot=dict(kind="drop", hinge_s=5.45, z_low=0.62, z_top=1.04, plate_z=0.55, hw=0.8, plate_on="body"),
    bed=dict(s0=4.15, s1=5.44, floor=0.62),
    cabin=dict(bodies.PICKUP["cabin"], back=4.08),
)
variant(
    "pickup-flatbed",
    dict(name="Esker Haul Flatbed", badge="HAUL", head="rect", grille="horizontal", bumper="black", wheels="steel", seat="vinyl", flatbed=True),
    L=3.42,
    arches=[(0.95, 0.45)],
    plan_r=(0.2, 0.04),
    bottom=[(0.0, 0.48), (0.5, 0.34), (1.42, 0.32), (3.42, 0.32)],
    top=[(0.0, 0.8), (0.04, 0.86), (0.12, 0.9), (0.4, 0.93), (1.2, 0.99), (1.62, 1.015), (3.42, 1.02)],
    openings=[(1.6, 3.33, 0.86)],
    boot=dict(kind="none", z_low=0.6, plate_z=0.55, hw=0.8),
    bed=dict(s0=3.48, s1=5.3, floor=0.95),
    tail_wrap=0.7,
)

# ── the van: panel van, minibus, camper ────────────────────────────────────────────────────────────────────
body("van", bodies.VAN, far="panel")
variant("van-panel", dict(name="Esker Drover", badge="DROVER", head="rect", grille="horizontal", bumper="black", wheels="steel", seat="vinyl"))
variant(
    "van-minibus",
    dict(name="Esker Drover Bus", badge="DROVER 8", head="rect", grille="vertical", bumper="chrome", wheels="cover", seat="tweed", chrome=True, rows=[(2.75, 0.66, (0.5, 0.0, -0.5)), (3.7, 0.66, (0.5, 0.0, -0.5))]),
    quarters=[(1.9, 3.0, 1), (3.05, 4.4, 1), (3.05, 4.4, -1)],
    doors=[dict(grp="door_f", s0=0.93, s1=1.82, bottom=0.31), dict(grp="door_s", s0=1.9, s1=3.0, bottom=0.31, sides=(-1,), kind="slide")],
)
variant(
    "van-camper",
    dict(name="Esker Drover Camper", badge="DROVER C", head="rect", grille="vertical", bumper="paint", wheels="turbine", seat="velvet", poptop=True, rows=[(2.8, 0.66, (0.45, -0.45))], two_tone=True),
    quarters=[(1.9, 3.0, 1), (3.05, 4.4, 1), (3.05, 4.4, -1)],
    doors=[dict(grp="door_f", s0=0.93, s1=1.82, bottom=0.31), dict(grp="door_s", s0=1.9, s1=3.0, bottom=0.31, sides=(-1,), kind="slide")],
)

# ── the shuttle (the AI's bus; plan 27): one model ────────────────────────────────────────────────────────
body("shuttle", bodies.BUS, far="bus")
variant("shuttle-bus", dict(name="Esker Shuttle", badge="SHUTTLE", head="rect", grille="horizontal", bumper="black", wheels="steel", seat="vinyl", two_tone=True, rows=[(2.4 + 1.25 * k, 0.83, (0.8, 0.3, -0.3, -0.8)) for k in range(5) if k != 2]))

# ── what the variants share (F13b): the buyer's add-ons and wheels ─────────────────────────────────────────
ADDONS = ["roofrack", "skibox", "bullbar", "spots", "flaps", "chains", "lightbar", "taxisign"]
WHEELS = ["steel", "cover", "lattice", "turbine", "sport", "winter", "offroad"]

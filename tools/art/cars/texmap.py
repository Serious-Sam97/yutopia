# Plan 92 (quality pass) — which material wears which texture: one table, read by kit.py (Blender's nodes, for
# the stills) and by link_tex.py (the GLB's references, for the game). UVs on every tiling surface are in
# metres (kit.uv_box); a texture's `tile` is its repeat in metres (the GLB says it with KHR_texture_transform).
#
# OWN: ours, tex/<name>.ktx2 beside the cars (textures.py).
#   base / normal / orm: the texture for each slot; tile: metres a repeat (None: the model's own UVs, an atlas);
#   ns: the normal's strength; alpha: "BLEND" or "MASK" (the base's alpha)
OWN = {
    # (quality pass 2: the peel and flake a whisper — at 0.35 the paint read as stucco up close)
    "paint": dict(normal="paint_n", orm="paint_orm", tile=0.35, ns=0.08),
    "paint2": dict(normal="paint_n", orm="paint_orm", tile=0.35, ns=0.08),
    "tyre": dict(base="tyre_a", normal="tyre_n", tile=None, ns=1.0),
    "dash": dict(normal="grain_n", tile=0.12, ns=0.6),
    "trim": dict(normal="grain_n", tile=0.12, ns=0.5),
    "under": dict(normal="grain_n", tile=0.12, ns=0.8),
    "bed": dict(normal="grain_n", tile=0.12, ns=1.0),
    "gauge": dict(normal="grain_n", tile=0.12, ns=0.4),
    "lens": dict(normal="lens_n", tile=0.04, ns=0.8),
    "lens_red": dict(normal="rib_n", tile=0.025, ns=0.8),
    "lens_amber": dict(normal="rib_n", tile=0.025, ns=0.8),
    "grille_mesh": dict(normal="grille_n", tile=0.05, ns=1.0),
    "glass_ws": dict(base="glass_ws", tile=None, alpha="BLEND"),
    "plate": dict(base="plate_a", tile=None),
    "cluster": dict(base="cluster_a", tile=None),
    "switch": dict(base="switch_a", tile=None),
    "livery_police": dict(base="police_a", tile=None),
    "livery_taxi": dict(base="taxi_a", tile=None, alpha="MASK"),
    "sign_face": dict(base="sign_a", tile=None),
}
# LIB: the life library's own maps (apps/client/public/life/mat/<id>-albedo|normal|orm.ktx2), its repeat
# (life-matlib-list.ts `metres`); the fabrics' albedo is grey, tinted by the material's colour
LIB = {
    "tweed": ("tweed", 0.25),
    "velvet": ("velvet", 0.3),
    "leather": ("leather", 0.3),
    "vinyl": ("leather", 0.3),
    "carpet": ("carpet", 0.5),
    "headliner": ("linen", 0.25),
    "walnut": ("walnut", 1.0),
    "woodgrain": ("walnut", 1.0),
    "wood": ("pine", 1.0),
    "canvas": ("twill", 0.2),
    "webbing": ("twill", 0.2),
}
# (Blender's stand-ins for the library's, in the stills only)
LIB_STILL = {
    "tweed": dict(normal="fabric_n", tile=0.06, ns=0.8),
    "velvet": dict(normal="fabric_n", tile=0.04, ns=0.5),
    "leather": dict(normal="grain_n", tile=0.2, ns=0.6),
    "vinyl": dict(normal="grain_n", tile=0.15, ns=0.6),
    "carpet": dict(normal="carpet_n", tile=0.1, ns=1.0),
    "headliner": dict(normal="fabric_n", tile=0.1, ns=0.4),
    "walnut": dict(base="wood_a", tile=0.6),
    "woodgrain": dict(base="wood_a", tile=0.8),
    "wood": dict(base="wood_a", tile=0.5),
    "canvas": dict(normal="fabric_n", tile=0.08, ns=0.9),
    "webbing": dict(normal="fabric_n", tile=0.03, ns=0.8),
}

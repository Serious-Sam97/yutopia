# Plan 74, the technique samples — a hair card atlas baked from real strands: four clumps of a couple of
# hundred hair curves each (rooted together, waving, clumping to their tips, thinning), rendered in
# Cycles with the physical hair shader (its own shading and shadow between strands) against nothing, a
# clump a column, grey (the game colours it). → an RGBA PNG, as hair.py textures()'s cards: four columns,
# the root at the image's top.
#   blender -b --factory-startup -P tools/art/life/bake_hair_atlas.py -- OUT.png
import math
import sys

import bpy
import numpy as np

OUT = sys.argv[sys.argv.index("--") + 1]
W, H = 256, 1024  # a column

sc = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
sc.render.engine = "CYCLES"
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.view_settings.view_transform = "Standard"
sc.world = bpy.data.worlds.new("w")
sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = 1.0  # the column's height: 1 unit, its width a quarter
cam.location = (0, -5, 0)
cam.rotation_euler = (math.pi / 2, 0, 0)
sc.collection.objects.link(cam)
sc.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(55), 0, math.radians(25))
sc.collection.objects.link(sun)

mat = bpy.data.materials.new("hair")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
hb = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
hb.parametrization = "COLOR"
hb.inputs["Color"].default_value = (0.55, 0.55, 0.55, 1)
hb.inputs["Roughness"].default_value = 0.35
outn = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(hb.outputs[0], outn.inputs[0])

import os
SHEET = os.environ.get("SHEET") == "1"
CLUMPS = [  # strands, spread at the root, how much they clump to the tip, wave, length range
    (240, 0.06, 0.55, 0.012, (0.75, 1.0)),
    (200, 0.08, 0.35, 0.02, (0.6, 0.98)),
    (260, 0.05, 0.7, 0.008, (0.8, 1.0)),
    (160, 0.09, 0.25, 0.03, (0.5, 0.95)),
] if not SHEET else [  # (a sheet: strands across the column's whole width, for others' wide cards)
    (1400, -0.105, 0.1, 0.006, (0.8, 1.0)),
    (1200, -0.105, 0.15, 0.012, (0.65, 1.0)),
    (1500, -0.105, 0.05, 0.004, (0.85, 1.0)),
    (1100, -0.105, 0.2, 0.018, (0.55, 1.0)),
]
SEG = 24


def clump(seed, count, spread, gather, wave, lengths):
    rng = np.random.default_rng(seed)
    cv = bpy.data.hair_curves.new(f"clump{seed}")
    cv.add_curves([SEG] * count)
    P = np.zeros((count, SEG, 3))
    R = np.zeros((count, SEG))
    for i in range(count):
        x0 = rng.uniform(spread, -spread) if spread < 0 else rng.normal(scale=spread)
        y0 = rng.normal(scale=abs(spread) * 0.3)
        ln = rng.uniform(*lengths)
        ph = rng.uniform(0, 2 * math.pi)
        fr = rng.uniform(1.5, 3.5)
        for k in range(SEG):
            t = k / (SEG - 1)
            z = 0.5 - t * ln
            g = 1 - gather * t  # clumping in toward the clump's line
            x = x0 * g + wave * math.sin(ph + fr * t * 2 * math.pi) * t
            P[i, k] = (x, y0 * g, z)
            R[i, k] = 0.0016 * (1 - 0.8 * t)
    cv.position_data.foreach_set("vector", P.reshape(-1).astype(np.float32))
    if "radius" not in cv.attributes:
        cv.attributes.new("radius", "FLOAT", "POINT")
    cv.attributes["radius"].data.foreach_set("value", R.reshape(-1).astype(np.float32))
    cv.materials.append(mat)
    ob = bpy.data.objects.new(f"clump{seed}", cv)
    sc.collection.objects.link(ob)
    return ob


cols = []
for i, spec in enumerate(CLUMPS):
    ob = clump(i + 1, *spec)
    path = f"{OUT}.col{i}.png"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(ob)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1]  # (the image's top first)
    cols.append(px)
    print(f"baked clump {i}: alpha {px[..., 3].mean():.3f}")
atlas = np.concatenate(cols, axis=1)
# grey, its light kept a little brighter than the render's (the game's colour multiplies it)
lum = atlas[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
lum = np.clip(lum / max(1e-3, np.percentile(lum[atlas[..., 3] > 0.5], 95)) * 0.95, 0, 1)
out = np.dstack([lum, lum, lum, atlas[..., 3]])
img = bpy.data.images.new("atlas", out.shape[1], out.shape[0], alpha=True)
img.pixels.foreach_set(out[::-1].ravel())
img.filepath_raw = OUT
img.file_format = "PNG"
img.save()
np.save(OUT + ".npy", out)
print("wrote", OUT, out.shape)

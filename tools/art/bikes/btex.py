# Plan 101 — the bikes' own textures (few: the cars' are reused) and their links in the GLBs.
#
#   spokes36: the mid level's spokes — 36 laced three-cross, an alpha disc across a wheel (UV 0..1 over the
#   wheel's rim circle). Drawn here with numpy, written as PNG (tools/art/bikes/tex-src) and as KTX2 (basisu) into
#   apps/client/public/life/bikes/tex/.
#
#   link(path): a bike's GLB pointed at its textures by URI, as the cars' link_tex does — ours in tex/, the cars'
#   in ../cars/tex/, the life library's in ../mat/.
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../cars"))
import link_tex  # noqa: E402  (its GLB reader and writer, its image stripper)

ROOT = os.path.join(HERE, "../../..")
SRC = os.path.join(HERE, "tex-src")
OUT = os.path.join(ROOT, "apps/client/public/life/bikes/tex")
BASISU = os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu")

# material → its maps (URIs relative to the bikes' folder); tile: metres a repeat (None: the mesh's own UVs)
OWN = {
    "paint": dict(normal="../cars/tex/paint_n", orm="../cars/tex/paint_orm", tile=0.35, ns=0.08),
    "paint2": dict(normal="../cars/tex/paint_n", orm="../cars/tex/paint_orm", tile=0.35, ns=0.08),
    "trim": dict(normal="../cars/tex/grain_n", tile=0.12, ns=0.5),
    "lens": dict(normal="../cars/tex/lens_n", tile=0.04, ns=0.8),
    "lens_red": dict(normal="../cars/tex/rib_n", tile=0.025, ns=0.8),
    "lens_amber": dict(normal="../cars/tex/rib_n", tile=0.025, ns=0.8),
    "spokes": dict(base="tex/spokes36", tile=None, alpha="MASK"),
}
LIB = {"vinyl": ("leather", 0.3), "leather": ("leather", 0.3), "canvas": ("twill", 0.2), "webbing": ("twill", 0.2)}


def make_spokes(n=1024, hub=0.105, spokes=36, cross=3, width_m=0.0024, wheel_m=0.6):
    """36 spokes three-cross on a transparent disc: each a line from a flange hole to its rim hole."""
    import zlib  # noqa: F401

    os.makedirs(SRC, exist_ok=True)
    yy, xx = np.mgrid[0:n, 0:n]
    u = (xx + 0.5) / n * 2 - 1
    v = (yy + 0.5) / n * 2 - 1
    a = np.zeros((n, n))
    half_w = width_m / wheel_m * 2 / 2  # (in the disc's −1..1 units)
    step = 2 * math.pi / spokes
    for side in (1, -1):
        for k in range(spokes // 2):
            ri = 2 * k + (0 if side > 0 else 1)
            ar = ri * step
            lead = 1 if k % 2 == 0 else -1
            ah = ar + lead * cross * 2 * step
            x0, y0 = hub * math.cos(ah), hub * math.sin(ah)
            x1, y1 = 0.985 * math.cos(ar), 0.985 * math.sin(ar)
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy
            t = np.clip(((u - x0) * dx + (v - y0) * dy) / L2, 0, 1)
            d = np.hypot(u - (x0 + t * dx), v - (y0 + t * dy))
            px = 2.0 / n
            a = np.maximum(a, np.clip((half_w + px - d) / (2 * px), 0, 1))
    r = np.hypot(u, v)
    a[r > 0.995] = 0
    rgb = np.full((n, n, 3), 0.78)
    # (a spoke's sheen: lighter along its middle)
    img = np.dstack([rgb, a])
    img = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    path = os.path.join(SRC, "spokes36.png")
    _png(path, img[::-1])
    return path


def _png(path, rgba):
    import struct
    import zlib

    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[i].tobytes() for i in range(h))

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(out)


def encode():
    os.makedirs(OUT, exist_ok=True)
    src = os.path.join(SRC, "spokes36.png")
    out = os.path.join(OUT, "spokes36.ktx2")
    subprocess.run([BASISU, "-ktx2", "-mipmap", "-quiet", src, "-output_file", out], check=True, stdout=subprocess.DEVNULL)
    return out


def link(path):
    js, binc = link_tex._read(path)
    binc = link_tex._drop_images(js, binc)
    images, textures = [], []
    js["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]

    def tex(uri, tile):
        if uri not in [im["uri"] for im in images]:
            images.append({"uri": uri, "mimeType": "image/ktx2"})
        src = [im["uri"] for im in images].index(uri)
        textures.append({"sampler": 0, "extensions": {"KHR_texture_basisu": {"source": src}}})
        ref = {"index": len(textures) - 1}
        if tile:
            s = 1.0 / tile
            ref["extensions"] = {"KHR_texture_transform": {"scale": [s, s]}}
        return ref

    used_transform = False
    for m in js.get("materials", []):
        name = m.get("name", "").split(".")[0]
        pbr = m.setdefault("pbrMetallicRoughness", {})
        t = OWN.get(name)
        if t:
            tile = t.get("tile")
            used_transform |= bool(tile)
            if t.get("base"):
                pbr["baseColorTexture"] = tex(f"{t['base']}.ktx2", tile)
            if t.get("normal"):
                m["normalTexture"] = dict(tex(f"{t['normal']}.ktx2", tile), scale=t.get("ns", 1.0))
            if t.get("orm"):
                pbr["metallicRoughnessTexture"] = tex(f"{t['orm']}.ktx2", tile)
            if t.get("alpha"):
                m["alphaMode"] = t["alpha"]
                if t["alpha"] == "MASK":
                    m["alphaCutoff"] = 0.4
                m["doubleSided"] = True
            continue
        lib = LIB.get(name)
        if lib:
            lid, metres = lib
            used_transform = True
            base = f"../mat/{lid}"
            pbr["baseColorTexture"] = tex(f"{base}-albedo.ktx2", metres)
            m["normalTexture"] = tex(f"{base}-normal.ktx2", metres)
            pbr["metallicRoughnessTexture"] = tex(f"{base}-orm.ktx2", metres)
            m["occlusionTexture"] = tex(f"{base}-orm.ktx2", metres)
            pbr["roughnessFactor"] = 1.0
    if images:
        js["images"] = images
        js["textures"] = textures
        used = js.setdefault("extensionsUsed", [])
        req = js.setdefault("extensionsRequired", [])
        for e in ("KHR_texture_basisu",) + (("KHR_texture_transform",) if used_transform else ()):
            if e not in used:
                used.append(e)
        if "KHR_texture_basisu" not in req:
            req.append("KHR_texture_basisu")
    else:
        js.pop("samplers", None)
    link_tex._write(path, js, binc)
    return [im["uri"] for im in images]


if __name__ == "__main__":
    print(make_spokes())
    print(encode())

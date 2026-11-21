# Plan 101 — the bikes' GLB export: plan 92's patched glTF exporter (tools/art/cars/build_cars.py's
# _quantize_exporter and export, copied here: that file runs its build on import) — positions, normals and UVs
# snapped to grids before meshopt packs them, y-up, the selection under the root.
import os

import bpy

NORMAL_BITS = 10


def _quantize_exporter():
    """(quality pass 2) The exporter's floats snapped to grids before meshopt packs them: normals to 1/512,
    UVs to 1/4096, positions to 1/8192 m (0.12 mm) — the low bits that were noise now zeros, the smooth
    normals of the paint a third the bytes; nothing visible. Patched once into Blender's own glTF exporter."""
    import numpy as np

    try:
        from io_scene_gltf2.blender.exp import primitive_extract as pe
    except ImportError:
        import importlib

        pe = importlib.import_module("addons_core.io_scene_gltf2.blender.exp.primitive_extract")
    C = pe.PrimitiveCreator
    if getattr(C, "_q2", False):
        return
    get_n, get_uv, get_p = C._PrimitiveCreator__get_normals, C._PrimitiveCreator__get_uvs_attribute, C._PrimitiveCreator__get_positions

    def normals(self):
        get_n(self)
        self.normals = (np.round(self.normals * 512.0) / 512.0).astype(np.float32)

    def uvs(self, idx, attr):
        get_uv(self, idx, attr)
        for k in ("0", "1"):
            a = self.dots[attr["gltf_attribute_name"] + k]
            self.dots[attr["gltf_attribute_name"] + k] = np.round(a * 4096.0) / 4096.0

    def positions(self):
        get_p(self)
        self.locs = (np.round(self.locs * 8192.0) / 8192.0).astype(np.float32)
        self.morph_locs = [(np.round(m * 8192.0) / 8192.0).astype(np.float32) for m in self.morph_locs]

    # (and the normals' mantissas: 10 bits, not 12 — meshopt's exponential filter, ~0.06° at worst)
    try:
        from io_scene_gltf2.io.exp import meshopt as mo
    except ImportError:
        import importlib

        mo = importlib.import_module("addons_core.io_scene_gltf2.io.exp.meshopt")
    enc = mo.MeshoptEncoder.encode_attribute

    def encode_attribute(attribute_name, data, byteStride, export_settings):
        was = mo.EXP_FILTER_BITS
        if attribute_name in ("NORMAL", "SK_NORMAL"):
            mo.EXP_FILTER_BITS = NORMAL_BITS
        try:
            return enc(attribute_name, data, byteStride, export_settings)
        finally:
            mo.EXP_FILTER_BITS = was

    mo.MeshoptEncoder.encode_attribute = staticmethod(encode_attribute)
    C._PrimitiveCreator__get_normals = normals
    C._PrimitiveCreator__get_uvs_attribute = uvs
    C._PrimitiveCreator__get_positions = positions
    C._q2 = True


def export(path, root, depth=0, uvs=True):
    _quantize_exporter()
    for o in bpy.data.objects:
        o.select_set(False)
    keep = [root] + list(root.children_recursive)
    for o in keep:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        use_selection=True,
        export_meshopt_compression_enable=True,
        export_extras=False,
        export_morph=True,
        export_morph_normal=False,
        export_apply=False,
        export_image_format="NONE",
        export_texcoords=uvs,
    )
    return os.path.getsize(path)



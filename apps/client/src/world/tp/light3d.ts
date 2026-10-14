import type { MapDef, WorldObjectDef } from "@yutopia/shared";
import { CanvasTexture, LinearFilter, type Material, SRGBColorSpace, Vector2 } from "three";
import { daylight } from "../art/daylight";
import { LightMap, lightSources } from "../art/light";

// The iso view's light, in 3D: the same baked light map (lamps and windows
// ray-marched across the tiles, walls and shut doors blocking them) plus the
// hour's ambient, as one plan-space texture that every lit surface multiplies
// by — sampled a little in front of the face it's on, as the iso view lights a
// wall by the floor in front of it. People take the same tint where they stand.

export class Light3 {
  private lm: LightMap | null = null;
  private canvas = document.createElement("canvas");
  private tex = new CanvasTexture(this.canvas);
  private sig = "";
  private hour = 12;
  readonly uniforms = {
    lmTex: { value: this.tex },
    lmSize: { value: new Vector2(1, 1) },
  };

  constructor() {
    this.tex.colorSpace = SRGBColorSpace; // light values as the iso view multiplies them (in sRGB)
    this.tex.flipY = false; // row 0 = y 0
    this.tex.magFilter = LinearFilter;
    this.tex.minFilter = LinearFilter;
    this.tex.generateMipmaps = false;
  }

  // Bake again when what gives or blocks light changed (cheap to call often).
  update(map: MapDef, objects: WorldObjectDef[]) {
    const doors = objects
      .filter((o) => o.kind === "door")
      .map((o) => `${o.x},${o.y},${o.props?.state ?? ""}`)
      .join(";");
    const sig = `${map.width}x${map.height}|${map.hWalls.join("")}|${map.vWalls.join("")}|${JSON.stringify(lightSources(objects))}|${doors}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.lm = new LightMap(map, objects);
    this.uniforms.lmSize.value.set(map.width, map.height);
    this.composite();
  }

  setHour(h: number) {
    this.hour = h;
    this.composite();
  }

  private composite() {
    if (!this.lm) return;
    const d = daylight(this.hour);
    const w = this.canvas.width;
    this.lm.composite(d.ambient, d.window, this.canvas);
    if (w !== this.canvas.width) {
      // a new size needs a new GPU texture
      this.tex.dispose();
    }
    this.tex.needsUpdate = true;
  }

  // the light at a point, ambient included (0xRRGGBB, as iso tints people)
  tintAt(x: number, y: number): number {
    if (!this.lm) return 0xffffff;
    const d = daylight(this.hour);
    return this.lm.tintAt(x, y, d.ambient, d.window);
  }

  // Make a material take this light (Lambert: its lit colour is multiplied).
  patch(m: Material) {
    const u = this.uniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.lmTex = u.lmTex;
      shader.uniforms.lmSize = u.lmSize;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec2 lmSize;\nvarying vec2 vLmUv;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          vec4 lmW = modelMatrix * vec4( transformed, 1.0 );
          vec3 lmN = normalize( mat3( modelMatrix ) * objectNormal );
          vLmUv = ( lmW.xz + lmN.xz * 0.22 ) / lmSize;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D lmTex;\nvarying vec2 vLmUv;")
        .replace(
          "#include <opaque_fragment>",
          "outgoingLight *= texture2D( lmTex, clamp( vLmUv, 0.0, 1.0 ) ).rgb;\n#include <opaque_fragment>",
        );
    };
    m.customProgramCacheKey = () => "yutopia-lightmap";
    m.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
  }
}

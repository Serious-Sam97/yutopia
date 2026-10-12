import { type Container, Sprite, Texture, TilingSprite } from "pixi.js";

// High quality's finish: a warm colour grade over the whole picture, a soft
// vignette and a whisper of film grain. All three are plain overlay sprites —
// the grade multiplies the picture by a warm white (a little less blue and
// green), which looks like a gentle warm LUT without an extra render pass.
// Off on Medium and Low.

function vignetteTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(128, 128, 60, 128, 128, 182);
  grd.addColorStop(0, "rgba(26,16,10,0)");
  grd.addColorStop(0.75, "rgba(26,16,10,0.08)");
  grd.addColorStop(1, "rgba(26,16,10,0.32)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return Texture.from(c);
}

function grainTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(128, 128);
  let a = 0x9e3779b9;
  for (let i = 0; i < img.data.length; i += 4) {
    a = (Math.imul(a ^ (a >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    const v = (a >>> 24) & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

export class Post {
  private grade: Sprite;
  private vignette: Sprite;
  private grain: TilingSprite;
  private enabled = false;

  constructor(private stage: Container) {
    this.grade = new Sprite(Texture.WHITE);
    this.grade.tint = 0xfff8ee; // ×(1, 0.97, 0.93): a gentle warm, no dimming
    this.grade.blendMode = "multiply";
    this.vignette = new Sprite(vignetteTexture());
    this.grain = new TilingSprite({ texture: grainTexture(), width: 100, height: 100 });
    this.grain.alpha = 0.025;
    this.grade.visible = this.vignette.visible = this.grain.visible = false;
    stage.addChild(this.grade, this.vignette, this.grain);
  }

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.grade.visible = this.vignette.visible = this.grain.visible = on;
  }

  private frame = 0;
  update(W: number, H: number, moving: boolean) {
    if (!this.enabled) return;
    // keep the overlays on top of everything else on the stage
    const n = this.stage.children.length;
    if (this.stage.children[n - 1] !== this.grain) this.stage.addChild(this.grade, this.vignette, this.grain);
    this.grade.width = W;
    this.grade.height = H;
    this.vignette.width = W;
    this.vignette.height = H;
    this.grain.width = W;
    this.grain.height = H;
    if (moving) {
      // a new grain position every frame (a cheap hash, so it's repeatable)
      this.frame = (this.frame + 1) % 997;
      this.grain.tilePosition.set((this.frame * 73) % 128, (this.frame * 151) % 128);
    }
  }
}

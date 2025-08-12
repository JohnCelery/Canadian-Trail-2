// systems/sprite.js
// Minimal canvas sprite class (Phase 1 stub)
// - Works with either real images or placeholders
// - Future phases can extend with animations/frames

export class Sprite {
  /**
   * @param {HTMLImageElement} image
   * @param {Object} [opts]
   * @param {number} [opts.frameWidth]  - pixels
   * @param {number} [opts.frameHeight] - pixels
   * @param {number} [opts.fps]
   */
  constructor(image, opts = {}) {
    this.image = image;
    this.fw = opts.frameWidth || image?.naturalWidth || 32;
    this.fh = opts.frameHeight || image?.naturalHeight || 32;
    this.fps = opts.fps || 12;
    this.time = 0;
    this.frame = 0;
    this.frames = Math.max(1, Math.floor((image?.naturalWidth || this.fw) / this.fw));
  }

  update(dt) {
    if (this.frames <= 1) return;
    this.time += dt;
    const advance = Math.floor(this.time * this.fps);
    if (advance > 0) {
      this.frame = (this.frame + advance) % this.frames;
      this.time -= advance / this.fps;
    }
  }

  draw(ctx, x, y, scale = 1) {
    const sx = this.frame * this.fw;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.image, sx, 0, this.fw, this.fh, Math.floor(x), Math.floor(y), this.fw * scale, this.fh * scale);
  }
}

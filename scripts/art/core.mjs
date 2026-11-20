// Shared pixel-art primitives: palette loading, indexed Canvas, PNG encode/decode.
// Dependency-free (node:zlib only). Single source of truth for colours is
// apps/game/src/theme/palette.ts, parsed here so art can never drift from the tokens.
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';

const PALETTE_FILE = new URL('../../apps/game/src/theme/palette.ts', import.meta.url);

/** @returns {Record<string,string>} token -> '#rrggbb' */
export function loadPalette() {
  const src = readFileSync(PALETTE_FILE, 'utf8');
  const body = src.slice(src.indexOf('PALETTE = {'), src.indexOf('} as const'));
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

export const PALETTE = loadPalette();
export const TOKENS = Object.keys(PALETTE);
/** Index 0 is transparent; tokens are 1-based in palette order. */
const INDEX = Object.fromEntries(TOKENS.map((t, i) => [t, i + 1]));

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Indexed sprite canvas. Pixels hold palette indices (0 = transparent). */
export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x, y) {
    return this.inside(x, y) ? this.px[y * this.w + x] : 0;
  }
  /** Set one pixel; token null/undefined clears it. Out-of-bounds writes are ignored. */
  set(x, y, token) {
    if (!this.inside(x, y)) return;
    if (token == null) this.px[y * this.w + x] = 0;
    else {
      const i = INDEX[token];
      if (!i) throw new Error(`Unknown palette token: ${token}`);
      this.px[y * this.w + x] = i;
    }
  }
  rect(x, y, w, h, token) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, token);
  }
  /** Elliptical disc using a half-pixel-biased distance test (crisp, no AA). */
  ellipse(cx, cy, rx, ry, token) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.5);
        const dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) this.set(x, y, token);
      }
  }
  /** Ellipse with hard 3-tone shading: light upper-left, dark lower-right. */
  shadedEllipse(cx, cy, rx, ry, [light, mid, dark]) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.5);
        const dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy > 1) continue;
        const d = dx + dy;
        this.set(x, y, d < -0.55 ? light : d > 0.45 ? dark : mid);
      }
  }
  /** Draw ASCII rows; legend maps char -> token, '.' or ' ' is transparent. */
  bitmap(x0, y0, rows, legend) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.' || ch === ' ') return;
        const token = legend[ch];
        if (!token) throw new Error(`Bitmap char '${ch}' missing from legend`);
        this.set(x0 + i, y0 + j, token);
      });
    });
  }
  /**
   * Oblique cube/box with fixed top-left light: light top strip (depth `t`),
   * mid front face, dark right strip (width `s`). Box spans x..x+w, y..y+h in total.
   */
  box(x, y, w, h, t, s, [top, left, right]) {
    this.rect(x, y, w, t, top);
    this.rect(x, y + t, w - s, h - t, left);
    this.rect(x + w - s, y + t, s, h - t, right);
    // Hard highlight along the lit top-left edge.
    this.rect(x, y, w, 1, top);
  }
  /** Re-tone `base` pixels on the lit (top/left) and shaded (bottom/right) silhouette edges. */
  edgeShade(base, light, dark) {
    const snap = this.clone();
    const b = INDEX[base];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (snap.get(x, y) !== b) continue;
        if (!snap.get(x - 1, y) || !snap.get(x, y - 1)) this.set(x, y, light);
        else if (!snap.get(x + 1, y) || !snap.get(x, y + 1)) this.set(x, y, dark);
      }
    return this;
  }
  /** Paint the 1px outline around the silhouette: transparent pixels 4-adjacent to art. */
  autoOutline(token = 'outline') {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))
          add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, token);
    return this;
  }
  clone() {
    const c = new Canvas(this.w, this.h);
    c.px.set(this.px);
    return c;
  }
  flipX() {
    const c = new Canvas(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        c.px[y * this.w + x] = this.px[y * this.w + (this.w - 1 - x)];
    return c;
  }
  /** Overlay `other` (non-transparent pixels win). */
  stamp(other, dx = 0, dy = 0) {
    for (let y = 0; y < other.h; y++)
      for (let x = 0; x < other.w; x++) {
        const v = other.px[y * other.w + x];
        if (v && this.inside(x + dx, y + dy)) this.px[(y + dy) * this.w + x + dx] = v;
      }
    return this;
  }
  /** Pixels of `this` that differ from `base` (transparent elsewhere). */
  diff(base) {
    const c = new Canvas(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) if (this.px[i] !== base.px[i]) c.px[i] = this.px[i];
    return c;
  }
  toRgba() {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.px.length; i++) {
      const v = this.px[i];
      if (!v) continue;
      const [r, g, b] = hexToRgb(PALETTE[TOKENS[v - 1]]);
      out.set([r, g, b, 255], i * 4);
    }
    return out;
  }
}

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode RGBA8 pixels to PNG (filter 0, deterministic). */
export function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode an 8-bit RGBA/RGB non-interlaced PNG. Returns { w, h, rgba }. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('Not a PNG');
  let off = 8;
  let w = 0;
  let h = 0;
  let channels = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 6 && data[9] !== 2) || data[12] !== 0)
        throw new Error('Unsupported PNG variant (need 8-bit RGB/RGBA, non-interlaced)');
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v;
      if (f === 0) v = cur;
      else if (f === 1) v = cur + a;
      else if (f === 2) v = cur + b;
      else if (f === 3) v = cur + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = v & 255;
    }
  }
  if (channels === 4) return { w, h, rgba: new Uint8Array(px) };
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255], i * 4);
  return { w, h, rgba };
}

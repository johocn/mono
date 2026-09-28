/* 生成 photo 皮肤包的 5 张 png 素材：node:zlib 手写最小 PNG 编码器，零第三方依赖。
   用法：node tools/gen-photo-assets.mjs   → public/skins/photo/tex/*.png */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/skins/photo/tex');
mkdirSync(OUT, { recursive: true });

/* —— CRC32 + PNG 分块 —— */
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** rgba(Uint8Array w*h*4) → PNG Buffer（8bit RGBA，scanline filter 全 0） */
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type = RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* —— 极简 2D 画布：rect / ellipse / vgrad，alpha-over 混合 —— */
function cv(w, h) {
  const px = new Uint8Array(w * h * 4);
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const blend = (x, y, c, a) => {
    if (a <= 0 || x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    const da = px[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round((c[k] * a + px[i + k] * da * (1 - a)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };
  const api = {
    rect(x0, y0, ww, hh, color, a = 1) {
      const c = rgb(color);
      for (let y = Math.round(y0); y < Math.round(y0 + hh); y++)
        for (let x = Math.round(x0); x < Math.round(x0 + ww); x++) blend(x, y, c, a);
      return api;
    },
    ellipse(cx, cy, rx, ry, color, a = 1) {
      const c = rgb(color);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) blend(x, y, c, a);
        }
      return api;
    },
    vgrad(x0, y0, ww, hh, top, bottom) {
      const a = rgb(top);
      const b = rgb(bottom);
      for (let y = Math.round(y0); y < Math.round(y0 + hh); y++) {
        const t = (y - y0) / Math.max(1, hh - 1);
        const c = [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
        for (let x = Math.round(x0); x < Math.round(x0 + ww); x++) blend(x, y, c, 1);
      }
      return api;
    },
    save(name) {
      writeFileSync(resolve(OUT, name), png(w, h, px));
      console.log(`[photo] ${name}  ${w}×${h}`);
    },
  };
  return api;
}

/* —— 5 张素材：尺寸按元素注册表逻辑包围盒，与 proc 版同廓形 —— */

/* 1. board.center.fountain  box { w:60, h:28 }，anchor [0.5, 1] */
cv(60, 28)
  .vgrad(0, 0, 60, 28, '#20463f', '#0f2420')
  .ellipse(30, 24, 26, 7, '#2c5b52')
  .ellipse(30, 22, 20, 5, '#3b7a6c')
  .rect(27, 6, 6, 16, '#5fb9a6')
  .ellipse(30, 5, 9, 4, '#8fe0cd', 0.85)
  .ellipse(30, 12, 12, 3, '#a8ece1', 0.4)
  .save('fountain.png');

/* 2. prop.tree  box { w:14, h:30 }，anchor [0.5, 1] */
cv(28, 60)
  .rect(12, 34, 4, 24, '#3a2a1c')
  .ellipse(14, 26, 13, 12, '#2f6b3f')
  .ellipse(7, 22, 8, 7, '#275c35')
  .ellipse(21, 24, 8, 7, '#347a48')
  .ellipse(14, 12, 8, 7, '#3d8c52')
  .ellipse(10, 10, 3, 3, '#8fd6a0', 0.5)
  .save('tree.png');

/* 3. prop.lamp  box { w:8, h:28 }，anchor [0.5, 1] */
cv(16, 56)
  .ellipse(8, 52, 7, 3, '#12201c')
  .rect(7, 12, 2, 41, '#2a3330')
  .rect(3, 9, 10, 3, '#3a4640')
  .ellipse(8, 8, 8, 7, '#ffd682', 0.22)
  .ellipse(8, 8, 4, 4, '#ffe6a8')
  .save('lamp.png');

/* 4. piece.p1  box { w:8.4, h:13 }，anchor [0.5, 1]（玩家一绿色） */
cv(16, 24)
  .ellipse(8, 21, 7, 3, '#0d1a14')
  .ellipse(8, 12, 6, 7, '#3fbf7f')
  .ellipse(8, 6, 4, 4, '#63d79c')
  .ellipse(6.5, 5, 1.6, 1.6, '#dffbe9', 0.8)
  .save('pawn1.png');

/* 5. showcase.mini  box { w:160, h:210 }，anchor [0,0]（对齐 roundRect 左上角原点） */
{
  const c = cv(160, 210).vgrad(0, 0, 160, 210, '#16221e', '#0d1512');
  c.rect(3, 3, 154, 204, '#101a17').rect(6, 6, 148, 198, '#1b2622').rect(6, 6, 148, 26, '#2a3830');
  const hs = [44, 32, 20]; // 与 proc 版 showcaseMini 的三档天际线高度一致
  let x = 8;
  for (let i = 0; x < 150; i++) {
    const bw = 10 + ((i * 5) % 16);
    const bh = hs[i % 3];
    c.rect(x, 96 - bh, bw, bh, '#233029');
    x += bw + 3;
  }
  c.rect(6, 110, 148, 94, '#182220');
  c.save('card.png');
}

console.log(`[photo] 素材已写入 ${OUT}`);
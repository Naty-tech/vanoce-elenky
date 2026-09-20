/* ============================================================================
 *  Generátor ikon aplikace – spustí se příkazem:  node scripts/generate-icons.mjs
 *  Nepotřebuje žádné knihovny, PNG skládá ručně (zlib je součástí Node.js).
 *  Kreslí se ve čtyřnásobném rozlišení a pak zmenšuje, aby byly hrany hladké.
 * ==========================================================================*/
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');

const GREEN = [0x12, 0x45, 0x2f];
const RED = [0xc1, 0x27, 0x33];
const CREAM = [0xfb, 0xf4, 0xea];
const GOLD = [0xe3, 0xbd, 0x78];

/* ------------------------------------------------------------ PNG zápis -- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtr "none"
    rgba.copy
      ? rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------------- kreslení -- */
function canvas(size) {
  const px = Buffer.alloc(size * size * 4, 0);

  const blend = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = color[0];
    px[i + 1] = color[1];
    px[i + 2] = color[2];
    px[i + 3] = 255;
  };

  return {
    px,
    rect(x, y, w, h, color) {
      for (let j = Math.round(y); j < Math.round(y + h); j++)
        for (let i = Math.round(x); i < Math.round(x + w); i++) blend(i, j, color);
    },
    roundRect(x, y, w, h, r, color) {
      for (let j = Math.round(y); j < Math.round(y + h); j++) {
        for (let i = Math.round(x); i < Math.round(x + w); i++) {
          const dx = Math.max(x + r - i - 0.5, 0, i + 0.5 - (x + w - r));
          const dy = Math.max(y + r - j - 0.5, 0, j + 0.5 - (y + h - r));
          if (dx * dx + dy * dy <= r * r) blend(i, j, color);
        }
      }
    },
    circle(cx, cy, r, color) {
      for (let j = Math.round(cy - r); j <= Math.round(cy + r); j++) {
        for (let i = Math.round(cx - r); i <= Math.round(cx + r); i++) {
          const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) blend(i, j, color);
        }
      }
    }
  };
}

function downsample(src, bigSize, factor) {
  const size = bigSize / factor;
  const out = Buffer.alloc(size * size * 4);
  const area = factor * factor;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * bigSize + (x * factor + dx)) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = r / area; out[o + 1] = g / area; out[o + 2] = b / area; out[o + 3] = a / area;
    }
  }
  return out;
}

function drawIcon(size, { maskable = false } = {}) {
  const F = 4;
  const S = size * F;
  const c = canvas(S);

  // pozadí – zimní zeleň
  if (maskable) c.rect(0, 0, S, S, GREEN);
  else c.roundRect(0, 0, S, S, S * 0.22, GREEN);

  // pár zlatých hvězdiček
  if (!maskable) {
    c.circle(S * 0.17, S * 0.20, S * 0.016, GOLD);
    c.circle(S * 0.84, S * 0.26, S * 0.013, GOLD);
    c.circle(S * 0.24, S * 0.80, S * 0.012, GOLD);
    c.circle(S * 0.79, S * 0.75, S * 0.016, GOLD);
  }

  // dárek – v maskovatelné variantě menší, aby se vešel do bezpečné zóny
  const scale = maskable ? 0.40 : 0.54;
  const w = S * scale;
  const h = w * 0.88;
  const cx = S / 2;
  const cy = S / 2 + h * 0.08;

  const bodyTop = cy - h / 2 + h * 0.26;
  const lidW = w * 1.14;

  // tělo krabice
  c.roundRect(cx - w / 2, bodyTop, w, cy + h / 2 - bodyTop, w * 0.06, CREAM);
  // víko
  c.roundRect(cx - lidW / 2, cy - h / 2, lidW, h * 0.22, w * 0.06, CREAM);
  // svislá stuha
  c.rect(cx - w * 0.09, cy - h / 2, w * 0.18, h, RED);
  // vodorovná stuha na víku
  c.rect(cx - lidW / 2, cy - h / 2 + h * 0.055, lidW, h * 0.11, RED);
  // mašle
  const bowR = w * 0.155;
  const bowY = cy - h / 2 - bowR * 0.55;
  c.circle(cx - bowR * 0.95, bowY, bowR, RED);
  c.circle(cx + bowR * 0.95, bowY, bowR, RED);
  c.circle(cx, bowY + bowR * 0.35, bowR * 0.45, GOLD);

  return encodePng(size, downsample(c.px, S, F));
}

/* ------------------------------------------------------------------ běh -- */
mkdirSync(OUT, { recursive: true });

const files = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  ['icon-maskable-512.png', drawIcon(512, { maskable: true })],
  ['apple-touch-icon.png', drawIcon(180)]
];

for (const [name, data] of files) {
  writeFileSync(join(OUT, name), data);
  console.log('vytvořeno: icons/' + name + ' (' + data.length + ' B)');
}

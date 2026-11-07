import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'public/data', name)));
const game = read('game.json'), bosses = read('boss-loot.json').bosses;
const provenance = read('entity-icons-provenance.json');
const cache = new Map();

// Independently decode the bundled 8-bit RGBA atlases and indexed PNG icons.
// This catches valid-looking metadata pointing at blank, corrupt or wrong-size files.
function decodePNG(file) {
  if (cache.has(file)) return cache.get(file);
  const bytes = fs.readFileSync(file), compressed = [];
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
  let header, palette, transparency, ended = false;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= bytes.length, `${file} truncated ${type}`);
    const chunk = bytes.subarray(offset + 8, offset + length + 8);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + length + 8)), bytes.readUInt32BE(offset + length + 8), `${file} ${type} CRC`);
    if (type === 'IHDR') header = { width: chunk.readUInt32BE(0), height: chunk.readUInt32BE(4), depth: chunk[8], color: chunk[9], interlace: chunk[12] };
    if (type === 'IDAT') compressed.push(chunk);
    if (type === 'PLTE') palette = chunk;
    if (type === 'tRNS') transparency = chunk;
    if (type === 'IEND') ended = true;
    offset += length + 12;
  }
  assert.ok(ended && header && compressed.length, `${file} incomplete PNG`);
  const { width, height, depth, color, interlace } = header;
  assert.equal(interlace, 0, `${file} unsupported interlace`);
  assert.ok(color === 6 && depth === 8 || color === 3 && [1, 2, 4, 8].includes(depth), `${file} encoding changed; update decoder`);
  const bpp = color === 6 ? 4 : 1, stride = color === 6 ? width * 4 : Math.ceil(width * depth / 8);
  const raw = inflateSync(Buffer.concat(compressed)), pixels = Buffer.alloc(height * stride), alpha = Buffer.alloc(width * height);
  assert.equal(raw.length, height * (stride + 1), `${file} uncompressed dimensions`);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; assert.ok(filter <= 4, `${file} filter`);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= bpp ? pixels[at - bpp] : 0, b = y ? pixels[at - stride] : 0, c = y && x >= bpp ? pixels[at - stride - bpp] : 0;
      pixels[at] = (raw[y * (stride + 1) + 1 + x] + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0)) & 255;
    }
    for (let x = 0; x < width; x++) {
      if (color === 6) alpha[y * width + x] = pixels[y * stride + x * 4 + 3];
      else {
        const bit = x * depth, entry = (pixels[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        assert.ok(palette && entry * 3 + 2 < palette.length, `${file} palette index`);
        alpha[y * width + x] = transparency?.[entry] ?? 255;
      }
    }
  }
  const result = { width, height, alpha }; cache.set(file, result); return result;
}

function assetPath(file) {
  assert.match(file, /^icons\/[\w.%-]+\.(?:png|gif)$/);
  return path.join(root, 'public', file);
}
function assertSprite(entry) {
  assert.ok(Array.isArray(entry.sprite) && entry.sprite.length === 5, `${entry.name}: missing sprite`);
  const [sheetId, x, y, w, h] = entry.sprite;
  assert.ok(entry.sprite.every(Number.isInteger), `${entry.name}: coordinates`);
  const sheet = game.sheets[sheetId]; assert.ok(sheet, `${entry.name}: sheet`);
  const image = decodePNG(assetPath(sheet.file));
  assert.equal(image.width, sheet.w); assert.equal(image.height, sheet.h);
  assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= image.width && y + h <= image.height, `${entry.name}: sprite bounds`);
  let visible = false;
  for (let yy = y; yy < y + h && !visible; yy++) for (let xx = x; xx < x + w; xx++) if (image.alpha[yy * image.width + xx]) { visible = true; break; }
  assert.ok(visible, `${entry.name}: sprite is entirely transparent`);
}

test('every catalog icon resolves to a nonempty, in-bounds asset except the documented internal effect', () => {
  const absent = [];
  for (const item of game.items) {
    if (item.iconFile) {
      const file = assetPath(item.iconFile);
      if (file.endsWith('.png')) assert.ok(decodePNG(file).alpha.some(value => value > 0), `${item.name}: empty PNG`);
      else {
        const bytes = fs.readFileSync(file);
        assert.match(bytes.subarray(0, 6).toString(), /^GIF8[79]a$/);
        assert.ok(bytes.readUInt16LE(6) > 0 && bytes.readUInt16LE(8) > 0);
        assert.equal(bytes.at(-1), 0x3b, `${item.name}: truncated GIF`);
      }
    } else if (item.sprite) assertSprite(item);
    else absent.push(item.id);
  }
  assert.deepEqual(absent, [6143], 'new missing icons must be investigated, never silently accepted');
  assert.equal(game.items.find(item => item.id === 6143).unobtainable, true);
});

test('all residents, including town pets and Diva Slime, have their own visible sprites', () => {
  for (const resident of game.townNpcs) assertSprite(resident);
  const expected = { TownCat: 'Town_Cat.gif', TownDog: 'Town_Dog.gif', TownBunny: 'Town_Bunny.gif', TownSlimeRainbow: 'Diva_Slime.gif' };
  for (const [key, iconName] of Object.entries(expected)) assert.equal(game.townNpcs.find(npc => npc.key === key)?.iconName, iconName);
  assert.notDeepEqual(game.townNpcs.find(npc => npc.key === 'TownBunny').sprite, game.items.find(item => item.key === 'Bunny').sprite, 'town pet must not use the catchable item picture');
});

test('all 18 bosses and 4 pillars use distinct source-backed entity images', () => {
  assert.equal(Object.keys(game.entityIcons).length, 22);
  const coordinates = new Set();
  for (const boss of bosses) {
    const entity = game.entityIcons[boss.key]; assert.ok(entity, boss.key); assert.equal(entity.name, boss.name); assertSprite(entity);
    assert.match(entity.iconName, ['solar', 'vortex', 'nebula', 'stardust'].includes(boss.key) ? /_Pillar\.png$/ : /^Map_Icon_/);
    coordinates.add(JSON.stringify(entity.sprite));
    const source = provenance.entries.find(entry => entry.key === boss.key);
    assert.equal(source?.iconName, entity.iconName);
    assert.equal(source?.sourceUrl, `https://terraria.wiki.gg/images/${entity.iconName}`);
  }
  assert.equal(coordinates.size, 22);
  assert.equal(provenance.license, 'CC BY-NC-SA 4.0');
});

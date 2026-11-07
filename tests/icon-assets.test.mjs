import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIconAsset } from '../core/icon-assets.mjs';

const sheets = [{ file: 'icons/sheet.png', w: 64, h: 64 }];
test('icons resolve atlas crops and standalone files from the application document', () => {
  assert.deepEqual(resolveIconAsset({ name: '血泪', sprite: [0, 8, 9, 10, 12] }, sheets), {
    kind: 'sprite', label: '血泪', src: './icons/sheet.png', x: 8, y: 9, width: 10, height: 12, sheetWidth: 64, sheetHeight: 64,
  });
  assert.deepEqual(resolveIconAsset({ name: '心', iconFile: './icons/heart.gif' }, sheets), { kind: 'image', label: '心', src: './icons/heart.gif' });
});
test('missing icon data returns named explanations instead of silent blank cells', () => {
  assert.deepEqual(resolveIconAsset(undefined, sheets, '血月'), { kind: 'missing', label: '血月', reason: '没有匹配的图标资料' });
  assert.match(resolveIconAsset({ name: '火绒狐特效（内部）' }, sheets).reason, /内部特殊条目/);
  assert.equal(resolveIconAsset({ id: 9999 }, sheets).label, '物品 #9999');
});
test('invalid atlas metadata is rejected before rendering an image', () => {
  for (const sprite of [[0, 1, 2], [0, -1, 0, 10, 10], [0, 60, 0, 10, 10], [0, 0, 0, 0, 10], [0, 0, 0, 10, Infinity], [2, 0, 0, 10, 10]]) {
    assert.equal(resolveIconAsset({ name: '测试', sprite }, sheets).kind, 'missing');
  }
  assert.equal(resolveIconAsset({ name: '测试', sprite: [0, 0, 0, 10, 10] }, undefined).kind, 'missing');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWarehouseItem, inferWarehouseCategory, normalizeWarehouseArea, ruleForChest, suggestedWarehouseNames, summarizeWarehouse, warehouseReplyMatches, warehouseScope, warehouseTypeCategories } from '../core/warehouse-model.mjs';

const byId = new Map([[11, { key: 'IronOre', category: '材料' }], [19, { key: 'GoldBar', category: '材料' }], [28, { key: 'LesserHealingPotion', category: '消耗品' }], [4, { key: 'IronBroadsword', category: '武器' }]]);
const chest = (index, items, more = {}) => ({ index, x: 100 + index * 3, y: 100, name: '', capacity: 40, itemsKnown: true, locked: false, inUse: false, items, ...more });
const item = (id, stack = 1) => ({ id, stack });

test('warehouse regions normalize deliberate corners and reject partial or invalid coordinates', () => {
  assert.deepEqual(normalizeWarehouseArea({ x1: '300', y1: '100', x2: '100', y2: '200' }), { x1: 100, y1: 100, x2: 300, y2: 200 });
  for (const value of ['', null, -1, 1.5, Infinity, 100001]) assert.throws(() => normalizeWarehouseArea({ x1: value, y1: 1, x2: 2, y2: 3 }));
});

test('warehouse categories refine materials conservatively and detect genuinely mixed chests', () => {
  assert.equal(classifyWarehouseItem(byId.get(11)), 'ores');
  assert.equal(classifyWarehouseItem({ key: 'DirtBlock', category: '材料' }), 'building');
  assert.equal(classifyWarehouseItem({ key: 'OreSword', category: '武器' }), 'weapons');
  assert.equal(classifyWarehouseItem(byId.get(28)), 'potions');
  assert.equal(inferWarehouseCategory(chest(0, [item(11, 9999), item(28)]), byId), 'mixed', 'large stack must not hide a mixed-use chest');
  assert.equal(inferWarehouseCategory(chest(0, [item(11), item(19), item(28)]), byId), 'ores');
});

test('warehouse naming preserves custom names, excluded and unavailable chests with stable numbering', () => {
  const chests = [chest(4, [item(28)]), chest(1, [item(11)]), chest(2, [item(19)], { name: '珍藏' }), chest(3, [item(11)], { locked: true }), chest(5, []), chest(6, [item(11)], { inUse: null })];
  const rules = [{ index: 5, x: 115, y: 100, excluded: true }];
  assert.deepEqual(suggestedWarehouseNames(chests, rules, byId).map(row => [row.index, row.name]), [[1, '矿石与锭 01'], [4, '药水 01']]);
  const names = suggestedWarehouseNames(chests, [{ index: 2, x: 106, y: 100, keepName: false }], byId, 6);
  assert.ok(names.every(row => row.name.length <= 6));
  assert.equal(ruleForChest(chest(5, [], { x: 116 }), rules).excluded, false, 'rule does not follow a reused index to different coordinates');
});

test('warehouse overview counts occupied slots and cross-chest duplicates without counting same-chest stacks twice', () => {
  const chests = [chest(0, [item(11), item(11), item(0, 0)]), chest(1, [item(11), item(28)], { locked: true }), chest(2, [])];
  assert.deepEqual(summarizeWarehouse(chests), { chests: 3, used: 4, capacity: 120, empty: 1, unavailable: 1, unknown: 0, duplicateTypes: 1, free: 116 });
  assert.deepEqual(warehouseTypeCategories(chests, [item(4)], byId), { 4: 'weapons', 11: 'ores', 28: 'potions' });
});

test('unknown chest contents are not counted or named as empty storage', () => {
  const unknown = chest(0, [], { itemsKnown: false, eligible: false, capacity: 40 });
  const missing = chest(1, [], { itemsKnown: undefined, eligible: false });
  const empty = chest(2, []);
  const totals = summarizeWarehouse([unknown, missing, empty]);
  assert.equal(totals.chests, 3);
  assert.equal(totals.unknown, 2);
  assert.equal(totals.capacity, 40);
  assert.equal(totals.free, 40);
  assert.equal(totals.empty, 1);
  assert.equal(inferWarehouseCategory(unknown, byId), 'unknown');
  assert.deepEqual(suggestedWarehouseNames([unknown, missing], [], byId), []);
  assert.deepEqual(warehouseTypeCategories([{ ...unknown, items: [item(11)] }], [], byId), {});
});

test('warehouse names avoid preserved names and remain stable when generated names are renamed again', () => {
  const chests = [chest(0, [item(11)], { name: '矿石与锭 01' }), chest(1, [item(11)]), chest(2, [item(11)], { name: '矿石与锭 02', locked: true }), chest(3, [item(11)], { eligible: false, name: '矿石与锭 03' })];
  assert.deepEqual(suggestedWarehouseNames(chests, [], byId).map(row => row.name), ['矿石与锭 04']);
  const renamed = chest(1, [item(11)], { name: '矿石与锭 04' });
  assert.deepEqual(suggestedWarehouseNames([chests[0], renamed, chests[2], chests[3]], [{ index: 1, x: 103, y: 100, keepName: false }], byId), []);
});

test('warehouse replies and saved scope cannot cross world or character boundaries', () => {
  const state = { connected: true, inWorld: true, world: { id: 1, name: '家' }, player: { name: 'A' }, netMode: 0, worldControl: true };
  const scope = warehouseScope(state);
  assert.notEqual(scope, warehouseScope({ ...state, player: { name: 'B' } }));
  assert.equal(warehouseScope({ ...state, connected: false }), null);
  assert.equal(warehouseReplyMatches({ worldId: 1 }, scope, scope, 1), true);
  assert.equal(warehouseReplyMatches({ worldId: 2 }, scope, scope, 1), false);
  assert.equal(warehouseReplyMatches({ worldId: 1 }, scope, 'different', 1), false);
});

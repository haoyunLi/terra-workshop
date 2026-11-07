import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsStorageReply, findPersonalItems, matchingStorageTypes, mergeChestResults, storageGroupName } from '../core/storage-search.mjs';

test('storage query resolves exact numeric ID and localized names within game version', () => {
  const items = [{ id: 8, name: '火把', english: 'Torch' }, { id: 28, name: '弱效治疗药水', english: 'Lesser Healing Potion' }, { id: 500, name: '新物品' }];
  assert.deepEqual([...matchingStorageTypes(items, '8')], [8]);
  assert.deepEqual([...matchingStorageTypes(items, '#28')], [28]);
  assert.deepEqual([...matchingStorageTypes(items, '治疗')], [28]);
  assert.deepEqual([...matchingStorageTypes(items, 'TORCH')], [8]);
  assert.deepEqual([...matchingStorageTypes(items, '', 500)], [8, 28]);
});

test('personal search returns actual group-local slot and readonly inactive loadouts', () => {
  const empty = { id: 0, stack: 0 }, potion = { id: 28, stack: 12, prefix: 0 };
  const player = { groups: { inventory: [empty, potion], coins: [potion], ammo: [empty, potion], equipment: [potion],
    dyes: [potion], misc: [potion], miscDyes: [potion], piggyBank: [potion], safe: [potion], defendersForge: [potion], voidVault: [potion] } };
  const loadouts = { loadout1: [empty, potion], loadout2Dyes: [potion] };
  const results = findPersonalItems(player, loadouts, new Set([28]));
  assert.equal(results.length, 13);
  assert.equal(results.find(row => row.group === 'inventory').slot, 1);
  assert.equal(results.find(row => row.group === 'ammo').slot, 1);
  assert.equal(results.find(row => row.group === 'loadout1').readOnly, true);
  assert.equal(results.find(row => row.group === 'safe').readOnly, false);
  assert.equal(findPersonalItems(player, loadouts, new Set([28]), 'safe').length, 1);
  assert.deepEqual(findPersonalItems(null, {}, new Set([28])), []);
  assert.equal(storageGroupName('loadout2Dyes'), '备用配装 3 · 染料');
  assert.equal(storageGroupName('miscDyes'), '宠物与坐骑染料');
});

test('paged world results deduplicate chest/slot and reject stale query or world', () => {
  const old = [{ chestIndex: 2, slot: 1, stack: 10 }];
  const incoming = [{ chestIndex: 2, slot: 1, stack: 11 }, { chestIndex: 2, slot: 2, stack: 1 }];
  assert.deepEqual(mergeChestResults(old, incoming), incoming);
  const result = { worldId: 10, results: incoming };
  assert.equal(acceptsStorageReply(result, '10:potions', '10:potions', 10), true);
  assert.equal(acceptsStorageReply(result, '10:potions', '11:potions', 10), false);
  assert.equal(acceptsStorageReply(result, '10:potions', '10:torch', 10), false);
  assert.equal(acceptsStorageReply(result, '10:potions', '10:potions', 11), false);
  assert.equal(acceptsStorageReply({ worldId: 10 }, 'same', 'same', 10), false);
});

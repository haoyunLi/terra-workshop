import assert from 'node:assert/strict';

export async function runStorageChecks(live, fixture) {
  let state = await live.status();
  assert.equal(state.capabilities.storageSearch, true);
  assert.equal(state.storageLoadouts.loadout1[4].id, 28);
  assert.equal(state.storageLoadouts.loadout2Dyes[7].id, 100);
  assert.equal(state.storageLoadouts.loadout0, undefined, 'active loadout comes from equipment group');
  assert.equal(state.player.groups.loadout1, undefined, 'readonly loadouts must not change inventory editing/undo');
  const worldId = state.world.id;
  const search = args => live.command('searchStorage', { worldId, types: [28], ...args });
  const first = (await search({ limit: 1 })).result;
  assert.equal(first.worldId, worldId);
  assert.deepEqual(first.results.map(row => [row.chestIndex, row.slot, row.stack]), [[0, 2, 15]], 'multiplayer search must read authoritative host, not client fixture stack 999');
  assert.equal(first.results[0].chestName, '药水箱');
  assert.equal(first.results[0].locked, false);
  assert.equal(first.results[0].inUse, false);
  assert.equal(first.truncated, true);
  assert.deepEqual(first.nextCursor, { chest: 3, slot: 0 });
  await fixture('storageRemoveFirstMatch', () => true);
  const second = (await search({ limit: 1, cursorChest: first.nextCursor.chest, cursorSlot: first.nextCursor.slot })).result;
  assert.deepEqual(second.results.map(row => [row.chestIndex, row.slot, row.stack]), [[3, 0, 20]], 'cursor remains stable when an earlier result is removed');
  assert.equal(second.results[0].locked, true);
  assert.equal(second.results[0].inUse, true);
  assert.deepEqual([second.results[0].x, second.results[0].y], [350, 430]);
  const third = (await search({ limit: 1, cursorChest: second.nextCursor.chest, cursorSlot: second.nextCursor.slot })).result;
  assert.equal(third.results[0].slot, 45, 'native array length supports slots beyond legacy 40');
  assert.equal(third.nextCursor, null);
  assert.equal(third.truncated, false);
  const lastChest = (await search({ types: [8] })).result.results[0];
  assert.equal(lastChest.chestIndex, 7999, 'search reaches native maxChests');
  assert.equal(lastChest.chestName.length, 80, 'response bounds player-provided chest names');
  assert.deepEqual((await search({ types: [4956] })).result.results, []);
  for (const args of [{ types: [] }, { types: Array(257).fill(28) }, { types: [0] }, { types: [90000] },
    { types: [28.5] }, { limit: 101 }, { limit: 0 }, { cursorChest: -1 }, { cursorSlot: -1 }, { worldId: worldId + 99 }]) {
    await assert.rejects(search(args));
  }
  await fixture('storageChangeWorld', current => current.world?.id === 98766 && current.worldControl, { both: true });
  await assert.rejects(search({}), /世界已改变/);
  assert.deepEqual((await live.command('searchStorage', { worldId: 98766, types: [28] })).result.results, []);
  await fixture('storageRestoreWorld', current => current.world?.id === 98765 && current.worldControl, { both: true });
  assert.equal((await search({})).result.results.length, 3, 'search reads restored world without stale cache');
  console.log('Storage checks passed: exact personal slots/loadouts, authoritative paged world chests, bounds, locks/use, world-change rejection.');
}

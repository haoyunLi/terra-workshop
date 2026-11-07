import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runWarehouseChecks(live, fixture) {
  const state = await live.status(), multiplayer = state.netMode === 1;
  const worldId = state.world.id, area = { x1: 590, y1: 230, x2: 780, y2: 250 };
  const categories = { 28: 'potions', 8: 'building', 71: 'other', 40: 'consumables' };
  const command = async (action, args) => (await live.command(action, args)).result;
  const scan = args => command('warehouseScan', { worldId, area, ...args });
  const preview = (scanId, mode, args = {}) => command('warehousePreview', { scanId, mode, categories, ...args });
  const apply = planId => command('warehouseApply', { planId });
  const undo = undoId => command('warehouseUndo', { undoId });
  const control = (action, check = () => true) => fixture(action, check, { both: true });
  const reset = () => control('warehouseReset', s => s.world?.id === worldId);
  const rule = (index, extra = {}) => ({ index, x: 600 + index - 20, y: 240, ...extra });
  async function report() {
    await fixture('warehouseReport');
    const text = await fs.readFile(path.join(live.settings.gameFolder, multiplayer ? 'server-warehouse-report.txt' : 'warehouse-report.txt'), 'utf8');
    return text.trim().split(/\r?\n/).filter(Boolean).map(row => row.split('|'));
  }
  const inventory = rows => rows.filter(row => row[0] === 'inventory');
  const quantities = rows => {
    const totals = new Map();
    for (const row of rows.filter(row => row[0] !== 'name')) {
      const signature = [row[0] === 'inventory' ? 'all' : 'all', ...row.slice(3, 4), ...row.slice(5)].join('|');
      totals.set(signature, (totals.get(signature) || 0) + Number(row[4]));
    }
    return [...totals].sort((a, b) => a[0].localeCompare(b[0]));
  };

  await reset();
  let initial = await scan();
  assert.equal(initial.worldId, worldId);
  assert.equal(initial.chests.length, 6);
  assert.equal(initial.capabilities.deposit, !multiplayer);
  assert.deepEqual(initial.chests.filter(c => c.eligible).map(c => c.index), [20, 21, 22]);
  assert.match(initial.chests.find(c => c.index === 23).skipReason, /上锁/);
  assert.match(initial.chests.find(c => c.index === 24).skipReason, /使用/);
  assert.match(initial.chests.find(c => c.index === 25).skipReason, /异常/);
  const original = await report();
  const sortPlan = await preview(initial.scanId, 'sort');
  assert.ok(sortPlan.moves.some(move => move.type === 28 && move.stack > 0));
  assert.deepEqual(await report(), original, 'preview must never mutate items');
  assert.equal(sortPlan.skipped.length, 3);
  const sorted = await apply(sortPlan.planId);
  assert.equal(sorted.applied, true);
  assert.deepEqual(quantities(await report()), quantities(original), 'all quantities and hidden item properties survive sort');
  let sortedScan = await scan();
  const potionSlots = sortedScan.chests.find(c => c.index === 20).slots.filter(i => i.type === 28);
  assert.deepEqual(potionSlots.map(i => [i.prefix, i.stack]).sort((a, b) => a[0] - b[0]), [[0, 18], [81, 4]], 'compatible copies merge, different prefixes remain separate');
  await undo(sorted.undoId);
  assert.deepEqual(await report(), original, 'undo restores exact original slots and properties');
  await assert.rejects(undo(sorted.undoId), /撤销/);
  await assert.rejects(apply(sortPlan.planId), /计划/);

  // Names are bound to index and coordinates. Preservation applies only to a
  // real custom name; an unnamed box must still receive the suggested name.
  initial = await scan();
  const renamePlan = await preview(initial.scanId, 'rename', {
    rules: [rule(20, { keepName: true }), rule(21, { keepName: true })],
    names: [rule(20, { name: '药水 01' }), rule(21, { name: '建筑 01' }), rule(23, { name: '不能改锁箱' })],
  });
  assert.deepEqual(renamePlan.renames.map(row => [row.index, row.after]), [[21, '建筑 01']]);
  const renamed = await apply(renamePlan.planId);
  assert.ok((await report()).some(row => row[0] === 'name' && row[1] === '21' && row[2] === '建筑 01'));
  await undo(renamed.undoId);
  assert.deepEqual(await report(), original);

  initial = await scan();
  const organizedPlan = await preview(initial.scanId, 'organize', { rules: [rule(20, { category: 'potions' }), rule(21, { category: 'building' })] });
  assert.ok(organizedPlan.moves.some(move => move.from.index !== move.to.index));
  const organized = await apply(organizedPlan.planId);
  const arranged = await scan();
  assert.deepEqual(new Set(arranged.chests.find(c => c.index === 20).slots.filter(i => i.type > 0).map(i => i.type)), new Set([28]));
  assert.deepEqual(arranged.chests.find(c => c.index === 21).slots.filter(i => i.type > 0).map(i => [i.type, i.stack]), [[8, 12]]);
  assert.deepEqual(quantities(await report()), quantities(original));
  await undo(organized.undoId);

  // Excluded/locked boxes may change independently without invalidating a plan.
  initial = await scan();
  const independent = await preview(initial.scanId, 'sort');
  await control('warehouseExcludedChange');
  const independentApplied = await apply(independent.planId);
  await undo(independentApplied.undoId);
  assert.equal((await scan()).chests.find(c => c.index === 23).slots[0].stack, 12);
  await reset();

  // Every touched before-state is verified, including otherwise hidden reference
  // fields, position, object identity and occupancy. Failure is all-or-nothing.
  for (const action of ['warehouseMutate', 'warehouseMutateNested', 'warehouseOccupy', 'warehouseLock', 'warehouseReplace', 'warehouseMoveChest']) {
    await reset(); const before = await scan(), plan = await preview(before.scanId, 'sort');
    await control(action); const externallyChanged = await report();
    await assert.rejects(apply(plan.planId), /改变|占用|上锁|位置/);
    assert.deepEqual(await report(), externallyChanged, `conflict ${action} must not write any item`);
  }
  await reset(); initial = await scan();
  const undoPlan = await preview(initial.scanId, 'sort'), undoApplied = await apply(undoPlan.planId);
  await control('warehouseMutate'); const changedAfterApply = await report();
  await assert.rejects(undo(undoApplied.undoId), /改变/);
  assert.deepEqual(await report(), changedAfterApply, 'undo must not overwrite new player changes');

  await reset(); initial = await scan();
  for (const bad of [
    { rules: [rule(20, { x: 601 })] }, { rules: [rule(20, { category: 'unknown' })] },
    { rules: [rule(20), rule(20)] }, { names: [rule(20, { name: '箱'.repeat(21) })] },
    { names: [rule(20, { name: 'bad\nname' })] }, { categories: { 28: 'unknown' } },
  ]) await assert.rejects(preview(initial.scanId, 'rename', bad));
  await assert.rejects(scan({ worldId: worldId + 1 }), /世界/);
  await assert.rejects(scan({ area: { ...area, x1: area.x2 + 1 } }), /范围/);
  await assert.rejects(scan({ area: { ...area, x1: -1 } }), /范围/);
  const noBuildingSpace = await preview(initial.scanId, 'organize', { rules: [rule(20, { category: 'potions' }), rule(21, { category: 'potions' }), rule(22, { category: 'potions' })] });
  assert.ok(noBuildingSpace.warnings.some(w => /原箱/.test(w)));
  const partialApplied = await apply(noBuildingSpace.planId);
  const partialScan = await scan();
  assert.equal(partialScan.chests.find(c => c.index === 20).slots.filter(i => i.type === 8).reduce((n, i) => n + i.stack, 0), 3);
  assert.equal(partialScan.chests.find(c => c.index === 21).slots.filter(i => i.type === 8).reduce((n, i) => n + i.stack, 0), 9);
  assert.deepEqual(quantities(await report()), quantities(original), 'unmatched categories stay in their source without loss');
  await undo(partialApplied.undoId);

  await control('warehouseTooMany');
  await assert.rejects(scan(), /128/);
  await reset(); await control('warehouseTooManySlots');
  await assert.rejects(scan(), /8192/);
  await reset(); await control('warehouseNullSlot');
  const nullScan = await scan(), nullPlan = await preview(nullScan.scanId, 'sort');
  const nullApply = await apply(nullPlan.planId); await undo(nullApply.undoId);
  await reset();

  initial = await scan();
  if (multiplayer) {
    await assert.rejects(preview(initial.scanId, 'deposit'), /单人模式/);
  } else {
    const depositBefore = await report(), deposit = await preview(initial.scanId, 'deposit', { reserves: [{ type: 28, stack: 25 }] });
    assert.ok(deposit.moves.some(move => move.from.kind === 'inventory' && move.type === 28 && move.stack === 42));
    const deposited = await apply(deposit.planId), depositAfter = await report();
    assert.deepEqual(quantities(depositAfter), quantities(depositBefore), 'deposit preserves every quantity and custom attribute');
    const protectedSlots = rows => inventory(rows).filter(row => [0, 11, 50, 54].includes(Number(row[2])));
    assert.deepEqual(protectedSlots(depositAfter), protectedSlots(depositBefore), 'hotbar, favorite, coins and ammo stay untouched');
    assert.equal(inventory(depositAfter).find(row => row[2] === '10')[4], '8');
    assert.equal(inventory(depositAfter).find(row => row[2] === '12'), undefined);
    await undo(deposited.undoId); assert.deepEqual(await report(), depositBefore);

    initial = await scan(); const inventoryConflict = await preview(initial.scanId, 'deposit');
    await control('warehouseInventoryChange'); const alteredInventory = await report();
    await assert.rejects(apply(inventoryConflict.planId), /背包物品已改变/);
    assert.deepEqual(await report(), alteredInventory);
    await reset(); initial = await scan();
    const pendingInventoryPlan = await preview(initial.scanId, 'deposit');
    await control('warehouseInventoryLock');
    await assert.rejects(apply(pendingInventoryPlan.planId), /原版合成或堆叠/);
    await reset(); await control('warehouseFull');
    const fullBefore = await report(), fullScan = await scan(), fullPlan = await preview(fullScan.scanId, 'deposit');
    assert.equal(fullPlan.moves.length, 0); assert.ok(fullPlan.warnings.length > 0);
    await apply(fullPlan.planId); assert.deepEqual(await report(), fullBefore, 'full storage leaves deposits safely in inventory');
  }
  await reset(); initial = await scan(); const oldWorldPlan = await preview(initial.scanId, 'sort');
  await control('warehouseWorld', s => s.world?.id === worldId + 1);
  await assert.rejects(apply(oldWorldPlan.planId), /计划|世界/);
  await reset(); initial = await scan(); const oldActorPlan = await preview(initial.scanId, 'sort');
  await control('warehouseActor');
  await assert.rejects(apply(oldActorPlan.planId), /角色/);
  await reset(); initial = await scan(); const futurePlan = await preview(initial.scanId, 'sort');
  await control('warehouseFutureVersion');
  await assert.rejects(apply(futurePlan.planId), /版本/);
  const readOnly = await scan(); assert.ok(readOnly.warnings.length > 0);
  await reset();
  if (multiplayer) {
    const packets = await fs.readFile(path.join(live.settings.gameFolder, 'server-packets.log'), 'utf8');
    assert.match(packets, /^32\|20\|/m, 'chest item updates are broadcast from the authoritative host');
    assert.match(packets, /^69\|21\|/m, 'chest names are broadcast using the native message');
  }
  console.log('Warehouse checks passed: preview-only planning, native clones, conservation, safe merging, rename/category/deposit rules, conflict-safe undo, mode/world/version/bounds guards.');
}

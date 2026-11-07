import test from 'node:test';
import assert from 'node:assert/strict';
import { materialCounts, missingRecipeMaterials } from '../core/recipe-materials.mjs';

test('Recipe materials include five personal stores and exclude worn equipment and loadouts', () => {
  const player = { groups: {
    inventory: [{ id: 187, stack: 1 }, { id: 0, stack: 0 }],
    piggyBank: [{ id: 22, stack: 2 }],
    safe: [{ id: 22, stack: 3 }],
    defendersForge: [{ id: 22, stack: 4 }],
    voidVault: [{ id: 22, stack: 5 }],
    equipment: [{ id: 186, stack: 1 }],
    loadout0: [{ id: 186, stack: 1 }],
    misc: [{ id: 186, stack: 1 }],
  } };
  const counts = materialCounts(player);
  assert.deepEqual([...counts], [[187, 1], [22, 14]]);
  assert.deepEqual(missingRecipeMaterials([
    { item: { id: 187 }, ingredient: { amount: 1 } },
    { item: { id: 186 }, ingredient: { amount: 1 } },
  ], counts), [{ type: 186, stack: 1, prefix: 0, group: 'inventory' }]);
  assert.equal(materialCounts(null).size, 0);
});

test('Recipe supply subtracts ownership once after combining repeated material choices', () => {
  const counts = new Map([[22, 4], [9, 20]]);
  const rows = [
    { item: { id: 22 }, ingredient: { group: 'Any Iron Bar', amount: 3 } },
    { item: { id: 22 }, ingredient: { item: 'IronBar', amount: 5 } },
    { item: { id: 9 }, ingredient: { item: 'Wood', amount: 10 } },
  ];
  assert.deepEqual(missingRecipeMaterials(rows, counts), [
    { type: 22, stack: 4, prefix: 0, group: 'inventory' },
  ]);
  assert.deepEqual([...counts], [[22, 4], [9, 20]]);
});

test('Unresolved or invalid recipe ingredients cannot issue a partial material grant', () => {
  const valid = { item: { id: 9 }, ingredient: { amount: 10 } };
  const unresolved = { item: undefined, ingredient: { group: 'Unknown material', amount: 2 } };
  assert.deepEqual(missingRecipeMaterials([valid, unresolved], new Map()), []);
  assert.deepEqual(missingRecipeMaterials([valid, { item: { id: 22 }, ingredient: { amount: -1 } }], new Map()), []);
});

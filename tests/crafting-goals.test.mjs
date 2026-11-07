import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { craftingInventory, craftingScope, sameCraftingScope, createCraftingIndex, planCraftingGoal, craftingSources } from '../core/crafting-goals.mjs';

const items = ['Target', 'Left', 'Right', 'Ore', 'Bar', 'Wood', 'RichWood'].map((key, i) => ({ id: i + 1, key, name: key }));
const recipe = (result, ingredients, amount = 1) => ({ result, ingredients: ingredients.map(([item, amount]) => ({ item, amount })), amount, stations: ['Furnace'] });
const goal = (itemId = 1, quantity = 1, extra = {}) => ({ itemId, quantity, ...extra });
const index = recipes => createCraftingIndex(items, { recipes });
const flatten = node => [node, ...node.children.flatMap(flatten)];

test('owned target is consumed before any recipe or ingredient requirement', () => {
  const plan = planCraftingGoal(index([recipe('Target', [['Ore', 9]])]), goal(), new Map([[1, 1], [4, 2]]));
  assert.equal(plan.root.fromOwned, 1);
  assert.equal(plan.root.children.length, 0);
  assert.equal(plan.ownedUsed, 1);
  assert.equal(plan.materialsReady, true);
});

test('shared raw resources are reserved once across the whole target tree', () => {
  const data = index([recipe('Target', [['Left', 1], ['Right', 1]]), recipe('Left', [['Ore', 3]]), recipe('Right', [['Ore', 4]])]);
  const stock = new Map([[4, 5]]), plan = planCraftingGoal(data, goal(), stock);
  assert.deepEqual(plan.missing, [{ itemId: 4, quantity: 2, reasons: ['acquire'] }]);
  assert.equal(flatten(plan.root).reduce((sum, node) => sum + node.fromOwned, 0), 5);
  assert.equal(stock.get(4), 5, 'planning must not mutate caller inventory');
  assert.equal(plan.complete, true);
  assert.equal(plan.materialsReady, false);
});

test('partially owned targets reduce craft batches before calculating leaf costs', () => {
  const data = index([recipe('Target', [['Bar', 2]], 3), recipe('Bar', [['Ore', 4]], 3)]);
  const plan = planCraftingGoal(data, goal(1, 8), new Map([[1, 2], [5, 1], [4, 6]]));
  assert.equal(plan.root.fromOwned, 2);
  assert.equal(plan.root.batches, 2);
  assert.equal(plan.root.children[0].required, 4);
  assert.equal(plan.root.children[0].fromOwned, 1);
  assert.equal(plan.root.children[0].batches, 1);
  assert.equal(plan.ownedUsed, 7);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.materialsReady, true);
});

test('craft batches and remaining outputs are reused without being labeled owned', () => {
  const data = index([recipe('Target', [['Left', 1], ['Right', 1]]), recipe('Left', [['Bar', 2]]), recipe('Right', [['Bar', 1]]), recipe('Bar', [['Ore', 4]], 3)]);
  const plan = planCraftingGoal(data, goal(), new Map([[4, 4]]));
  const bars = flatten(plan.root).filter(node => node.itemId === 5);
  assert.equal(bars[0].batches, 1);
  assert.equal(bars[0].remainder, 1);
  assert.equal(bars[1].fromPlanned, 1);
  assert.equal(bars[1].fromOwned, 0);
  assert.equal(plan.craftSteps, 4);
  assert.equal(plan.materialsReady, true);
  assert.deepEqual(plan.stations, ['Furnace']);
});

test('all alternatives require an explicit valid choice and preserve global recipe IDs', () => {
  const data = index([{ ...recipe('Target', [['Ore', 99]]), platforms: ['old-gen-console'] }, recipe('Target', [['Ore', 2]]), recipe('Target', [['Wood', 1]])]);
  const undecided = planCraftingGoal(data, goal(), new Map([[4, 2]]));
  assert.equal(undecided.complete, false);
  assert.equal(undecided.root.reason, 'recipeChoice');
  assert.deepEqual(undecided.root.recipeOptions, [1, 2]);
  assert.equal(planCraftingGoal(data, goal(1, 1, { recipeChoices: { 1: 0 } }), new Map()).complete, false);
  const chosen = planCraftingGoal(data, goal(1, 1, { recipeChoices: { 1: 2 } }), new Map());
  assert.deepEqual(chosen.missing.map(row => [row.itemId, row.quantity]), [[6, 1]]);
});

test('ingredient group choices are explicit and count only the chosen member', () => {
  const data = createCraftingIndex(items, { groups: { 'Any Wood': { items: ['Wood', 'RichWood'] } }, recipes: [{ result: 'Target', amount: 1, stations: ['By Hand'], ingredients: [{ group: 'Any Wood', amount: 3 }] }] });
  const stock = new Map([[6, 3]]);
  assert.equal(planCraftingGoal(data, goal(), stock).root.children[0].reason, 'groupChoice');
  assert.equal(planCraftingGoal(data, goal(1, 1, { groupChoices: { '0:0': 6 } }), stock).materialsReady, true);
  const rich = planCraftingGoal(data, goal(1, 1, { groupChoices: { '0:0': 7 } }), stock);
  assert.deepEqual(rich.missing.map(row => [row.itemId, row.quantity]), [[7, 3]]);
  assert.equal(planCraftingGoal(data, goal(1, 1, { groupChoices: { '0:0': 4 } }), stock).complete, false);
});

test('conversion cycles terminate without inventing raw resources or craftability', () => {
  const data = index([recipe('Target', [['Bar', 1]]), recipe('Bar', [['Target', 1]])]);
  const plan = planCraftingGoal(data, goal(), new Map());
  assert.equal(plan.unresolved[0].reason, 'cycle');
  assert.equal(plan.nodeCount, 3);
  assert.equal(plan.materialsReady, false);
  assert.deepEqual(plan.missing, [{ itemId: 1, quantity: 1, reasons: ['cycle'] }]);
});

test('unresolved intermediate recipes cannot donate fictional surplus to later branches', () => {
  const data = createCraftingIndex(items, { groups: { 'Any Wood': { items: ['Wood', 'RichWood'] } }, recipes: [recipe('Target', [['Bar', 1], ['Bar', 1]]), { result: 'Bar', amount: 3, ingredients: [{ group: 'Any Wood', amount: 1 }] }] });
  const plan = planCraftingGoal(data, goal(), new Map());
  assert.equal(plan.root.children[1].fromPlanned, 0);
  assert.equal(plan.complete, false);
});

test('depth, node, unknown item and invalid ingredient guards report incomplete plans', () => {
  const data = index([recipe('Target', [['Left', 1], ['Right', 1]]), recipe('Left', [['Bar', 1]]), recipe('Bar', [['Ore', 1]])]);
  assert.equal(planCraftingGoal(data, goal(), new Map(), { maxDepth: 1 }).unresolved[0].reason, 'limit');
  const bounded = planCraftingGoal(data, goal(), new Map(), { maxNodes: 2 });
  assert.equal(bounded.complete, false);
  assert.ok(bounded.nodeCount <= 3);
  assert.equal(planCraftingGoal(data, goal(), new Map(), { itemCount: 4 }).unresolved[0].reason, 'item');
  const malformed = index([recipe('Target', [['Unlisted', 1]])]);
  assert.equal(planCraftingGoal(malformed, goal(), new Map()).unresolved[0].reason, 'item');
  const invalid = index([recipe('Target', [['Ore', -1]])]);
  assert.equal(planCraftingGoal(invalid, goal(), new Map()).unresolved[0].reason, 'quantity');
});

test('inventory excludes equipped items and stale world/character warehouse snapshots', () => {
  const state = { connected: true, inWorld: true, world: { id: 3, name: 'Home' }, player: { name: 'Player', groups: { inventory: [{ id: 4, stack: 3 }], piggyBank: [{ id: 4, stack: 2 }], armor: [{ id: 4, stack: 90 }], loadout1Armor: [{ id: 4, stack: 90 }] } } };
  const scope = craftingScope(state), warehouse = new Map([[4, 7]]);
  assert.equal(craftingInventory(state).counts.get(4), 5);
  assert.equal(craftingInventory(state, warehouse, scope).counts.get(4), 12);
  for (const stale of [{ ...scope, worldId: 4 }, { ...scope, worldName: 'Other' }, { ...scope, playerName: 'Other' }]) {
    assert.equal(sameCraftingScope(scope, stale), false);
    assert.equal(craftingInventory(state, warehouse, stale).counts.get(4), 5);
    assert.equal(craftingInventory(state, warehouse, stale).warehouseIncluded, false);
  }
  assert.equal(craftingScope({ ...state, connected: false }), null);
  assert.equal(sameCraftingScope({}, {}), false);
  assert.equal(craftingInventory({ ...state, connected: false }, warehouse, scope).counts.size, 0);
});

test('bundled Zenith plan uses real recipe ingredients and sourced boss drops', () => {
  const game = JSON.parse(readFileSync(new URL('../public/data/game.json', import.meta.url)));
  const recipes = JSON.parse(readFileSync(new URL('../public/data/recipes.json', import.meta.url)));
  const loot = JSON.parse(readFileSync(new URL('../public/data/boss-loot.json', import.meta.url)));
  const data = createCraftingIndex(game.items, recipes), zenith = data.byKey.get('Zenith');
  const plan = planCraftingGoal(data, goal(zenith.id), new Map());
  assert.equal(plan.root.children.length, 10);
  assert.ok(plan.stations.includes('Mythril Anvil'));
  assert.ok(plan.missing.some(row => row.itemId === data.byKey.get('Meowmere').id));
  const sources = craftingSources(loot);
  assert.ok(sources.get(data.byKey.get('Meowmere').id).some(source => source.name === '月亮领主'));
  assert.equal(sources.has(data.byKey.get('CopperOre').id), false, 'unsupported acquisition routes must stay unknown');
});

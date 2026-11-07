import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { collectionOwnedCounts, collectionScope, normalizeCollection, progressPresentation, readCollection, toggleCollection } from '../core/progress.mjs';
import { ownedCounts } from '../core/player.mjs';

const loot = JSON.parse(await fs.readFile(new URL('../public/data/boss-loot.json', import.meta.url), 'utf8'));
const game = JSON.parse(await fs.readFile(new URL('../public/data/game.json', import.meta.url), 'utf8'));
const allowed = new Set(loot.bosses.flatMap(boss => boss.drops.map(drop => drop.id)));
const world = { connected: true, inWorld: true, world: { id: 42, name: '世界' }, player: { name: '角色' } };

test('collection scope separates worlds and characters and rejects disconnected/menu snapshots', () => {
  const key = collectionScope(world);
  assert.notEqual(key, collectionScope({ ...world, world: { ...world.world, id: 43 } }));
  assert.notEqual(key, collectionScope({ ...world, player: { name: '另一个角色' } }));
  assert.notEqual(key, collectionScope({ ...world, world: { ...world.world, name: '同号新世界' } }));
  assert.notEqual(collectionScope({ ...world, world: { id: 42, name: 'a,b' }, player: { name: 'c' } }), collectionScope({ ...world, world: { id: 42, name: 'a' }, player: { name: 'b,c' } }));
  for (const state of [null, { ...world, connected: false }, { ...world, inWorld: false }, { ...world, player: null }, { ...world, world: { id: null, name: '世界' } }]) assert.equal(collectionScope(state), null);
});

test('collection storage tolerates damaged or incompatible records and validates item IDs', () => {
  const id = [...allowed][0], id2 = [...allowed][1];
  const memory = new Map(), storage = { getItem: key => memory.get(key) ?? null };
  const key = collectionScope(world);
  for (const raw of ['oops', 'null', '{"version":2,"collected":[1]}', 'x'.repeat(150001)]) {
    memory.set(key, raw);
    assert.deepEqual(readCollection(storage, key, allowed), { version: 1, collected: [], targets: [] });
  }
  memory.set(key, JSON.stringify({ version: 1, collected: [id, id, String(id), -1, 0, 999999, null, 1.2], targets: [id2], unsafe: true }));
  assert.deepEqual(readCollection(storage, key, allowed), { version: 1, collected: [id], targets: [id2] });
  assert.throws(() => readCollection({ getItem: () => { throw Error('unavailable'); } }, key, allowed), /unavailable/);
  assert.deepEqual(readCollection(storage, collectionScope({ ...world, player: { name: '新角色' } }), allowed).collected, []);
});

test('manual collected marks and targets persist independently of current possession', () => {
  const id = [...allowed][0], original = normalizeCollection(null, allowed);
  const marked = toggleCollection(original, 'collected', id, allowed);
  const targeted = toggleCollection(marked, 'targets', id, allowed);
  assert.deepEqual(original.collected, [], 'Never mutate a previous React state');
  assert.deepEqual(marked.targets, []);
  assert.deepEqual(targeted, { version: 1, collected: [id], targets: [id] });
  const stored = readCollection({ getItem: () => JSON.stringify(targeted) }, collectionScope(world), allowed);
  assert.deepEqual(stored, targeted);
  const counts = ownedCounts({ groups: { inventory: [{ id, stack: 2 }], safe: [{ id, stack: 3 }], equipment: [{ id, stack: 1 }] } });
  assert.equal(counts.get(id), 6);
  assert.equal(ownedCounts({ groups: { inventory: [] } }).has(id), false);
  assert.ok(stored.collected.includes(id), 'Selling or moving an item must not erase a manual history mark');
  assert.deepEqual(toggleCollection(stored, 'collected', id, allowed), { version: 1, collected: [], targets: [id] });
  assert.throws(() => toggleCollection(stored, 'version', id, allowed));
  assert.throws(() => toggleCollection(stored, 'collected', 999999, allowed));
});

test('unknown, shared and milestone states never become confirmed defeat labels', () => {
  assert.equal(progressPresentation(null).tone, 'unknown');
  assert.equal(progressPresentation({ available: false, defeated: false }).text, '未读取');
  assert.equal(progressPresentation({ available: true, kind: 'defeat', defeated: null }).tone, 'unknown');
  assert.equal(progressPresentation({ available: true, kind: 'defeat', defeated: false }).text, '世界未击败');
  assert.equal(progressPresentation({ available: true, kind: 'defeat', defeated: true }).tone, 'done');
  assert.equal(progressPresentation({ available: true, kind: 'shared', stageReached: true, defeated: null }).text, '邪恶阶段已通过');
  assert.equal(progressPresentation({ available: true, kind: 'milestone', stageReached: true, defeated: null }).text, '已进入困难模式');
  assert.equal(progressPresentation({ available: true, kind: 'pillar', defeated: true }).text, '已击败 · 可重置');
});

test('collection ownership includes the separate inactive loadout snapshot without double-counting active equipment', () => {
  const id = [...allowed][0];
  const state = { ...world, player: { name: '角色', groups: { inventory: [{ id, stack: 2 }], equipment: [{ id, stack: 1 }] } }, storageLoadouts: { loadout1: [{ id, stack: 1 }], loadout2: [] } };
  assert.equal(collectionOwnedCounts(state).get(id), 4);
  assert.equal(collectionOwnedCounts({ ...state, storageLoadouts: {} }).get(id), 3);
  assert.equal(collectionOwnedCounts({ ...state, connected: false }).size, 0);
});

test('boss collection data has source-qualified desktop items for all 18 bosses and four pillars', () => {
  assert.equal(loot.bosses.length, 22);
  assert.equal(new Set(loot.bosses.map(boss => boss.key)).size, 22);
  assert.equal(loot.license, 'CC BY-NC-SA 4.0');
  assert.match(loot.sourceUrl, /^https:\/\/github.com\/Doeschi\//);
  assert.match(loot.dataVersion, /^\d{4}-\d{2}-\d{2}$/);
  const byId = new Map(game.items.map(item => [item.id, item]));
  for (const boss of loot.bosses) {
    assert.ok(byId.has(boss.item), `Icon exists for ${boss.key}`);
    assert.ok(boss.drops.length, `${boss.key} is not empty`);
    assert.equal(new Set(boss.drops.map(drop => drop.id)).size, boss.drops.length);
    for (const drop of boss.drops) {
      assert.equal(byId.get(drop.id)?.key, drop.key);
      assert.match(drop.url, /^https:\/\/terraria.wiki.gg\/wiki\//);
      assert.ok(drop.routes.length);
      for (const route of drop.routes) {
        assert.match(route.url, /^https:\/\/terraria.wiki.gg\/wiki\//);
        assert.ok(['boss', 'bag'].includes(route.via));
        assert.ok(route.modes.every(mode => ['normal', 'expert', 'master'].includes(mode)));
        assert.ok(Array.isArray(route.notes));
        assert.equal(route.chance, undefined, 'Collection view must not misstate conditional drop odds');
      }
    }
  }
  for (const [key, id] of [['solar',3458],['vortex',3456],['nebula',3457],['stardust',3459]]) assert.deepEqual(loot.bosses.find(boss => boss.key === key).drops.map(drop => drop.id), [id]);
  const terraprisma = loot.bosses.find(boss => boss.key === 'empress').drops.find(drop => drop.key === 'EmpressBlade');
  assert.ok(terraprisma.routes.every(route => route.notes.some(note => note.includes('全部伤害') && note.includes('白天'))));
  const shield = loot.bosses.find(boss => boss.key === 'eye').drops.find(drop => drop.key === 'EoCShield');
  assert.ok(shield.routes.every(route => route.via === 'bag' && !route.modes.includes('normal')));
});

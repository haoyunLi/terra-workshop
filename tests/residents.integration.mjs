import assert from 'node:assert/strict';

const entry = (state, id) => state.residentConditions?.entries.find(n => n.id === id);
export async function runResidentChecks(live, fixture) {
  const setup = (action, check) => fixture(action, check, { both: true });
  await setup('residentBaseline', state => entry(state, 17)?.status === 'unmet' && state.npcs.length === 1);
  let state = await live.status();
  assert.equal(state.residentConditions.source, 'world');
  assert.equal(state.residentConditions.housing, 'unknown');
  assert.equal(state.residentConditions.entries.length, 39);
  assert.equal(entry(state, 18).requirements.find(r => r.key === 'merchant').status, 'unmet');
  assert.equal(entry(state, 107).status, 'unmet');
  assert.equal(entry(state, 160).requirements.find(r => r.kind === 'housing').status, 'unknown');
  const evaluated = state.residentConditions.evaluatedAt;
  assert.equal((await live.status()).residentConditions.evaluatedAt, evaluated, 'polling reuses the five-second condition cache');
  await setup('resident49Silver', state => entry(state, 17)?.status === 'unmet' && state.player.groups.coins[0].stack === 49);
  await setup('resident50Silver', state => entry(state, 17)?.status === 'satisfied');
  await setup('residentUnlocked', state => entry(state, 17)?.status === 'satisfied' && entry(state, 107)?.status === 'satisfied');
  state = await live.status();
  assert.equal(entry(state, 633).status, 'satisfied');
  assert.equal(entry(state, 17).status, 'satisfied', 'permanent unlock survives removal of the original item requirement');
  assert.equal(entry(state, 663).status, 'unmet');
  assert.ok(entry(state, 663).requirements[0].missingNpcIds.includes(17));
  await setup('residentPopulation8', state => entry(state, 227)?.status === 'satisfied');
  state = await live.status();
  assert.equal(entry(state, 207).status, 'satisfied');
  assert.equal(entry(state, 208).status, 'unmet');
  const npc = state.npcs.find(n => n.type === 17);
  const result = await live.command('teleport', { x: npc.x, y: npc.y, worldId: state.world.id });
  assert.equal(result.state.player.x, npc.x);
  assert.equal(result.state.player.y, npc.y);
  await assert.rejects(live.command('teleport', { x: npc.x, y: npc.y, worldId: state.world.id + 1 }), /另一个世界/);
  await setup('residentUnknownVersion', state => entry(state, 17)?.status === 'unknown');
  state = await live.status();
  assert.equal(state.residentConditions.supported, false);
  assert.equal(entry(state, 107).status, 'unknown', 'unverified versions do not present false certainty');
  await setup('residentRestore', state => state.gameVersion.includes('1.4.5.8') && state.npcs.length === 0);
  console.log('Resident conditions: 39 NPCs, native eligibility, unlock persistence, population, unknown housing, cached evaluation and player travel passed.');
}

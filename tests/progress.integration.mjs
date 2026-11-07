import assert from 'node:assert/strict';

// Called by the shared runner once in single player and once through its host bridge.
export async function runProgressChecks(live, fixture) {
  const read = async key => (await live.status()).progress?.bosses.find(b => b.key === key);
  await fixture('progressReset', async () => (await read('eye'))?.defeated === false);
  const state = await live.status();
  assert.equal(state.capabilities.progress, true);
  assert.equal(state.progress.source, 'native-world-flags');
  assert.equal(state.progress.bosses.length, 22);
  assert.equal(new Set(state.progress.bosses.map(b => b.key)).size, 22);
  assert.ok(state.progress.bosses.every(b => b.available));
  assert.equal(state.progress.bosses.filter(b => b.kind === 'defeat').length, 15);
  assert.equal(state.progress.bosses.filter(b => b.kind === 'pillar').length, 4);
  assert.equal((await read('wall')).defeated, null);
  assert.equal((await read('wall')).stageReached, false);
  await fixture('progressEye', async () => (await read('eye')).defeated === true);
  assert.equal((await read('kingSlime')).defeated, false);
  await fixture('progressEvil', async () => (await read('eater')).stageReached === true);
  for (const key of ['eater', 'brain']) {
    const record = await read(key);
    assert.equal(record.kind, 'shared');
    assert.equal(record.defeated, null, 'Shared evil progression must not claim either individual boss was defeated');
    assert.equal(record.stageReached, true);
  }
  await fixture('progressSolar', async () => (await read('solar')).defeated === true);
  assert.match((await read('solar')).note, /重置/);
  await fixture('progressHardmode', async () => (await read('wall')).stageReached === true);
  assert.equal((await read('wall')).defeated, null, 'Hardmode is a milestone, not an individual defeat record');
  if (state.netMode === 1) {
    const client = (await live.request('state')).state;
    assert.equal(client.progress.bosses.find(b => b.key === 'eye').defeated, false, 'Test host progress differs from client progress');
    assert.equal((await read('eye')).defeated, true, 'Multiplayer UI uses host world progress');
  }
  await fixture('progressRestore', async () => (await read('eye')).defeated === false && (await read('wall')).stageReached === true);
}

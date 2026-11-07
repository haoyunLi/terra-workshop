import assert from 'node:assert/strict';
import { test } from 'node:test';
import { residentMatchesFilter, residentReportFor, residentTeleportArgs } from '../src/residentModel.mjs';

test('resident filters separate missing prerequisites, housing and readiness', () => {
  assert.equal(residentMatchesFilter('missing', null, { status: 'unknown' }), false);
  assert.equal(residentMatchesFilter('missing', null, { status: 'unmet' }), true);
  assert.equal(residentMatchesFilter('missing', { type: 17 }, { status: 'unmet' }), false);
  assert.equal(residentMatchesFilter('ready', null, { status: 'satisfied' }), true);
  assert.equal(residentMatchesFilter('housing', { type: 37, homeless: true }), false);
  assert.equal(residentMatchesFilter('housing', { type: 17, homeless: true }), true);
  assert.equal(residentMatchesFilter('absent', { type: 17 }), false);
});

test('conditions from another world or an unconnected host are never shown', () => {
  const residentConditions = { source: 'world', worldId: 2, entries: [{ id: 17 }] };
  const state = { connected: true, inWorld: true, worldControl: true, world: { id: 2 }, residentConditions };
  assert.equal(residentReportFor(state), residentConditions);
  assert.equal(residentReportFor({ ...state, world: { id: 3 } }), null);
  assert.equal(residentReportFor({ ...state, worldControl: false }), null);
  assert.equal(residentReportFor({ ...state, connected: false }), null);
  assert.equal(residentReportFor({ ...state, inWorld: false }), null);
});

test('resident travel binds integer tile coordinates to the current world', () => {
  assert.deepEqual(residentTeleportArgs({ x: 120, y: 80 }, 2), { x: 120, y: 80, worldId: 2 });
  assert.equal(residentTeleportArgs({ x: 120.4, y: 80 }, 2), null);
  assert.equal(residentTeleportArgs({ x: NaN, y: 80 }, 2), null);
  assert.equal(residentTeleportArgs({ x: 120, y: 80 }, undefined), null);
});

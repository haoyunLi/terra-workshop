import { ownedCounts } from './player.mjs';

const PREFIX = 'terra-collection-v1:';
export function collectionOwnedCounts(state) {
  if (!collectionScope(state) || !state.player?.groups) return new Map();
  return ownedCounts({ ...state.player, groups: { ...state.player.groups, ...state.storageLoadouts } });
}
export function collectionScope(state) {
  const world = state?.world, player = state?.player;
  if (!state?.connected || !state.inWorld || !Number.isInteger(world?.id) || !world.name || !player?.name) return null;
  return PREFIX + JSON.stringify([world.id, world.name, player.name]);
}
export function normalizeCollection(value, allowedIds) {
  const empty = { version: 1, collected: [], targets: [] };
  if (!value || value.version !== 1 || typeof value !== 'object') return empty;
  const clean = entries => Array.isArray(entries) ? [...new Set(entries.filter(id => Number.isInteger(id) && id > 0 && allowedIds.has(id)))].sort((a,b) => a-b) : [];
  return { version: 1, collected: clean(value.collected), targets: clean(value.targets) };
}
export function readCollection(storage, scope, allowedIds) {
  if (!scope) return normalizeCollection(null, allowedIds);
  const raw = storage.getItem(scope);
  if (!raw || raw.length > 150000) return normalizeCollection(null, allowedIds);
  try { return normalizeCollection(JSON.parse(raw), allowedIds); } catch { return normalizeCollection(null, allowedIds); }
}
export function toggleCollection(value, field, id, allowedIds) {
  if (!['collected', 'targets'].includes(field) || !allowedIds.has(id) || !Number.isInteger(id)) throw Error('无效的收藏项目。');
  const next = normalizeCollection(value, allowedIds);
  next[field] = next[field].includes(id) ? next[field].filter(entry => entry !== id) : [...next[field], id].sort((a,b) => a-b);
  return next;
}
export function progressPresentation(record) {
  if (!record?.available) return { text: '未读取', tone: 'unknown' };
  if (record.kind === 'shared') return { text: record.stageReached ? '邪恶阶段已通过' : '邪恶阶段未完成', tone: record.stageReached ? 'stage' : 'pending' };
  if (record.kind === 'milestone') return { text: record.stageReached ? '已进入困难模式' : '困难模式前', tone: record.stageReached ? 'stage' : 'pending' };
  if (typeof record.defeated !== 'boolean') return { text: '未读取', tone: 'unknown' };
  if (record.kind === 'pillar') return { text: record.defeated ? '已击败 · 可重置' : '尚未击败 · 四柱', tone: record.defeated ? 'done' : 'pending' };
  return { text: record.defeated ? '世界已击败' : '世界未击败', tone: record.defeated ? 'done' : 'pending' };
}

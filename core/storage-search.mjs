import { GROUPS } from './player.mjs';

export function matchingStorageTypes(items, query, itemCount = Infinity) {
  const term = query.trim().toLowerCase();
  const numeric = /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : null;
  return new Set(items.filter(item => item.id > 0 && item.id < itemCount &&
    (!term || (numeric !== null ? item.id === numeric :
      `${item.search || ''} ${item.name || ''} ${item.english || ''}`.toLowerCase().includes(term))))
    .map(item => item.id));
}

export function acceptsStorageReply(result, requestedContext, currentContext, worldId) {
  return requestedContext === currentContext && result?.worldId === worldId && Array.isArray(result.results);
}

export function storageGroupName(group) {
  const loadout = /^loadout(\d+)(Dyes)?$/.exec(group);
  if (loadout) return `备用配装 ${Number(loadout[1]) + 1}${loadout[2] ? ' · 染料' : ' · 装备'}`;
  return GROUPS[group] || (group === 'miscDyes' ? '宠物与坐骑染料' : group);
}

export function findPersonalItems(player, loadouts, matchingIds, groupFilter = 'all') {
  if (!player) return [];
  const results = [];
  for (const [group, slots] of Object.entries({ ...player.groups, ...loadouts })) {
    if (groupFilter !== 'all' && group !== groupFilter) continue;
    slots.forEach((item, slot) => {
      if (item?.id > 0 && item.stack > 0 && matchingIds.has(item.id)) {
        results.push({ group, slot, itemId: item.id, stack: item.stack, prefix: item.prefix || 0,
          readOnly: !Object.hasOwn(player.groups, group), key: `${group}:${slot}` });
      }
    });
  }
  return results;
}

export function mergeChestResults(existing, incoming) {
  const bySlot = new Map(existing.map(item => [`${item.chestIndex}:${item.slot}`, item]));
  for (const item of incoming) bySlot.set(`${item.chestIndex}:${item.slot}`, item);
  return [...bySlot.values()];
}

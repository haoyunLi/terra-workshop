export const residentStatusLabels = {
  satisfied: '前置已满足',
  unmet: '缺少条件',
  unknown: '条件待确认',
};

// Never keep showing a condition report from another world or a disconnected host.
export function residentReportFor(state) {
  const report = state.residentConditions;
  return state.connected && state.inWorld && state.worldControl && report?.source === 'world'
    && report.worldId === state.world?.id ? report : null;
}

export function residentMatchesFilter(filter, current, condition) {
  if (filter === 'absent') return !current;
  if (filter === 'missing') return !current && condition?.status === 'unmet';
  if (filter === 'housing') return !!current?.homeless && ![37, 368, 453].includes(current.type);
  if (filter === 'ready') return !current && condition?.status === 'satisfied';
  return true;
}

export function residentTeleportArgs(npc, worldId) {
  if (![npc?.x, npc?.y, worldId].every(Number.isInteger)) return null;
  return { x: npc.x, y: npc.y, worldId };
}

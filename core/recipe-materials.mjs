const materialGroups = ['inventory', 'piggyBank', 'safe', 'defendersForge', 'voidVault'];

export function materialCounts(player) {
  const counts = new Map();
  for (const group of materialGroups) {
    for (const item of player?.groups?.[group] || []) {
      if (Number.isInteger(item.id) && item.id > 0 && Number.isInteger(item.stack) && item.stack > 0) {
        counts.set(item.id, (counts.get(item.id) || 0) + item.stack);
      }
    }
  }
  return counts;
}

export function missingRecipeMaterials(rows, counts) {
  // An unresolved material group must never produce a partial supply request.
  if (rows.some(row => !Number.isInteger(row.item?.id) || row.item.id <= 0
    || !Number.isInteger(row.ingredient?.amount) || row.ingredient.amount <= 0)) return [];

  const required = new Map();
  for (const { item, ingredient } of rows) {
    required.set(item.id, (required.get(item.id) || 0) + ingredient.amount);
  }
  return [...required].map(([type, amount]) => ({
    type,
    stack: Math.max(0, amount - (counts.get(type) || 0)),
    prefix: 0,
    group: 'inventory',
  })).filter(item => item.stack > 0);
}

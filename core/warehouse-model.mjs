export const WAREHOUSE_CATEGORIES = [
  { id: 'ores', label: '矿石与锭' }, { id: 'building', label: '建筑材料' },
  { id: 'potions', label: '药水' }, { id: 'materials', label: '材料' },
  { id: 'weapons', label: '武器' }, { id: 'tools', label: '工具' },
  { id: 'armor', label: '装备' }, { id: 'accessories', label: '饰品' },
  { id: 'consumables', label: '消耗品' }, { id: 'pets', label: '宠物' },
  { id: 'mounts', label: '坐骑' }, { id: 'dyes', label: '染料' }, { id: 'other', label: '其他' },
];
const labels = new Map(WAREHOUSE_CATEGORIES.map(category => [category.id, category.label]));
const sourceCategories = { 武器: 'weapons', 工具: 'tools', 装备: 'armor', 饰品: 'accessories', 材料: 'materials', 建筑: 'building', 消耗品: 'consumables', 宠物: 'pets', 坐骑: 'mounts', 染料: 'dyes', 其他: 'other' };

export function warehouseCategoryLabel(category) { return labels.get(category) || (category === 'mixed' ? '混合物资' : category === 'empty' ? '空箱' : category === 'unknown' ? '内容未读取' : '自动识别'); }

export function classifyWarehouseItem(item) {
  if (!item) return 'other';
  const key = item.key || '';
  if (item.category === '材料') {
    if (/(?:Ore|Bar)$/.test(key)) return 'ores';
    if (/(?:Block|Brick|Wall|Platform|Wood)$/.test(key)) return 'building';
  }
  if (item.category === '消耗品' && (/Potion$/.test(key) || ['BottledWater', 'BottledHoney'].includes(key))) return 'potions';
  return sourceCategories[item.category] || 'other';
}

export function warehouseScope(state) {
  return state?.connected && state.inWorld && Number.isInteger(state.world?.id) && state.world?.name && state.player?.name
    ? JSON.stringify([state.world.id, state.world.name, state.player.name, state.netMode, !!state.worldControl]) : null;
}

export function normalizeWarehouseArea(area) {
  const values = ['x1', 'y1', 'x2', 'y2'].map(key => Number(area?.[key]));
  if (['x1', 'y1', 'x2', 'y2'].some(key => area?.[key] === '' || area?.[key] == null) ||
    values.some(value => !Number.isInteger(value) || value < 0 || value > 100000)) throw Error('请填写两角的有效图格坐标。');
  const [x1, y1, x2, y2] = values;
  return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
}

export function warehouseChestKey(chest) { return `${chest.index}:${chest.x}:${chest.y}`; }

export function ruleForChest(chest, rules = []) {
  return rules.find(rule => rule.index === chest.index && rule.x === chest.x && rule.y === chest.y) ||
    { index: chest.index, x: chest.x, y: chest.y, excluded: false, category: '', keepName: true };
}

export function inferWarehouseCategory(chest, byId) {
  if (chest.itemsKnown !== true) return 'unknown';
  const counts = new Map();
  for (const item of chest.items || []) {
    if (!(item.id > 0 && item.stack > 0)) continue;
    const category = classifyWarehouseItem(byId.get(item.id));
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  if (!counts.size) return 'empty';
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return sorted[0][1] / total >= 0.6 ? sorted[0][0] : 'mixed';
}

function limitedName(label, suffix, maxLength) {
  let result = '';
  for (const character of label) {
    if (result.length + character.length + suffix.length > maxLength) break;
    result += character;
  }
  return result + suffix;
}

export function suggestedWarehouseNames(chests, rules, byId, maxLength = 20) {
  const limit = Math.max(4, Math.min(80, Number.isInteger(maxLength) ? maxLength : 20));
  const numbers = new Map(), names = [];
  const ordered = [...chests].sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index);
  const unchanged = chest => {
    const rule = ruleForChest(chest, rules);
    return rule.excluded || chest.itemsKnown !== true || chest.eligible === false || chest.locked !== false || chest.inUse !== false || (rule.keepName !== false && chest.name?.trim());
  };
  const usedNames = new Set(ordered.filter(unchanged).map(chest => chest.name).filter(Boolean));
  for (const chest of ordered) {
    const rule = ruleForChest(chest, rules);
    if (unchanged(chest)) continue;
    const category = rule.category || inferWarehouseCategory(chest, byId);
    let number = numbers.get(category) || 0, name;
    do {
      number++;
      name = limitedName(warehouseCategoryLabel(category), ` ${String(number).padStart(2, '0')}`, limit);
    } while (usedNames.has(name));
    numbers.set(category, number);
    usedNames.add(name);
    if (name !== chest.name) names.push({ index: chest.index, x: chest.x, y: chest.y, name });
  }
  return names;
}

export function warehouseTypeCategories(chests, inventory, byId) {
  const result = {};
  for (const items of [...chests.filter(chest => chest.itemsKnown === true).map(chest => chest.items || []), inventory || []]) {
    for (const item of items) if (item.id > 0 && item.stack > 0) result[item.id] = classifyWarehouseItem(byId.get(item.id));
  }
  return result;
}

export function summarizeWarehouse(chests) {
  const totals = { chests: chests.length, used: 0, capacity: 0, empty: 0, unavailable: 0, unknown: 0, duplicateTypes: 0 };
  const locations = new Map();
  for (const chest of chests) {
    if (chest.eligible === false || chest.locked !== false || chest.inUse !== false) totals.unavailable++;
    if (chest.itemsKnown !== true) { totals.unknown++; continue; }
    const items = chest.items || [];
    const used = items.filter(item => item.id > 0 && item.stack > 0);
    totals.capacity += Number.isInteger(chest.capacity) ? chest.capacity : items.length;
    totals.used += used.length;
    if (!used.length) totals.empty++;
    for (const type of new Set(used.map(item => item.id))) locations.set(type, (locations.get(type) || 0) + 1);
  }
  totals.duplicateTypes = [...locations.values()].filter(count => count > 1).length;
  totals.free = totals.capacity - totals.used;
  return totals;
}

export function warehouseReplyMatches(reply, scope, currentScope, worldId) {
  return scope === currentScope && reply?.worldId === worldId;
}

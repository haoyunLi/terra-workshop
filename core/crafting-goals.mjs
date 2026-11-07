import { materialCounts } from './recipe-materials.mjs';

export function craftingScope(state) {
  if (!state?.connected || !state.inWorld || !Number.isInteger(state.world?.id) || !state.world?.name || !state.player?.name) return null;
  return { worldId: state.world.id, worldName: state.world.name, playerName: state.player.name };
}
export function sameCraftingScope(left, right) {
  return !!left && !!right && Number.isInteger(left.worldId) && !!left.worldName && !!left.playerName
    && left.worldId === right.worldId && left.worldName === right.worldName && left.playerName === right.playerName;
}
export function craftingInventory(state, warehouseCounts, warehouseContext) {
  const scope = craftingScope(state), counts = scope ? materialCounts(state.player) : new Map();
  const warehouseIncluded = sameCraftingScope(scope, warehouseContext) && warehouseCounts instanceof Map;
  if (warehouseIncluded) for (const [id, quantity] of warehouseCounts) {
    if (Number.isInteger(id) && id > 0 && Number.isSafeInteger(quantity) && quantity > 0) counts.set(id, (counts.get(id) || 0) + quantity);
  }
  return { counts, warehouseIncluded };
}

export function createCraftingIndex(items, data) {
  const byId = new Map(items.map(item => [item.id, item]));
  const byKey = new Map(items.map(item => [item.key, item]));
  const recipesByItem = new Map(), byRecipe = new Map();
  (data.recipes || []).forEach((recipe, index) => {
    if (recipe.platforms && !recipe.platforms.includes('desktop')) return;
    const result = byKey.get(recipe.result);
    if (!result || !Number.isInteger(recipe.amount) || recipe.amount < 1 || !Array.isArray(recipe.ingredients)) return;
    const entry = { ...recipe, index, itemId: result.id,
      ingredients: recipe.ingredients.map((ingredient, ingredientIndex) => ({ ...ingredient, choiceKey: `${index}:${ingredientIndex}`,
        candidates: ingredient.item ? [byKey.get(ingredient.item)].filter(Boolean).map(item => item.id)
          : (data.groups?.[ingredient.group]?.items || []).map(key => byKey.get(key)?.id).filter(Number.isInteger) })) };
    const list = recipesByItem.get(result.id) || [];
    list.push(entry); recipesByItem.set(result.id, list); byRecipe.set(index, entry);
  });
  return { byId, byKey, recipesByItem, byRecipe, stations: data.stations || {} };
}

// A material plan reserves owned items globally across the tree and carries batch
// remainders forward. Planned outputs are distinguished from items actually owned.
export function planCraftingGoal(index, goal, counts, options = {}) {
  const maxNodes = Math.min(1000, Math.max(1, options.maxNodes || 400));
  const maxDepth = Math.min(30, Math.max(1, options.maxDepth || 16));
  const itemCount = options.itemCount || Infinity;
  const stock = new Map(), plannedStock = new Map(), missing = new Map(), unresolved = [], stations = new Set();
  for (const [id, amount] of counts || []) if (Number.isInteger(id) && id > 0 && Number.isSafeInteger(amount) && amount > 0) stock.set(id, amount);
  const initialStock = new Map(stock);
  let nodeCount = 0, craftSteps = 0;
  const consume = (pool, id, amount) => { const used = Math.min(pool.get(id) || 0, amount); if (used) pool.set(id, pool.get(id) - used); return used; };
  const block = (node, reason, detail) => { node.reason = reason; node.detail = detail; unresolved.push(node); return node; };
  const addMissing = (id, quantity, reason = 'acquire') => {
    const old = missing.get(id) || { itemId: id, quantity: 0, reasons: [] };
    old.quantity += quantity; if (!old.reasons.includes(reason)) old.reasons.push(reason); missing.set(id, old);
  };
  function expand(itemId, required, path, depth, edge = {}) {
    const node = { key: `node-${nodeCount++}`, itemId, required, fromOwned: 0, fromPlanned: 0, remaining: required, children: [], ...edge };
    if (nodeCount > maxNodes || depth > maxDepth) return block(node, 'limit', '材料树过深或分支过多，请缩小目标或选择其他配方。');
    if (!Number.isSafeInteger(required) || required < 1 || required > 2147483647) return block(node, 'quantity', '展开后的需求量超出可计算范围。');
    if (!index.byId.has(itemId) || itemId >= itemCount) return block(node, 'item', '当前目录或游戏版本中没有这项材料。');
    node.fromOwned = consume(stock, itemId, required);
    node.fromPlanned = consume(plannedStock, itemId, required - node.fromOwned);
    node.remaining = required - node.fromOwned - node.fromPlanned;
    if (!node.remaining) { node.reason = 'owned'; return node; }
    if (path.has(itemId)) { addMissing(itemId, node.remaining, 'cycle'); return block(node, 'cycle', '这条配方回到自身，已停止展开。请选择其他配方，或直接收集此物品。'); }
    const recipes = index.recipesByItem.get(itemId) || [];
    node.recipeOptions = recipes.map(recipe => recipe.index);
    if (!recipes.length) { node.reason = 'acquire'; addMissing(itemId, node.remaining); return node; }
    const selected = goal.recipeChoices?.[itemId];
    const recipe = recipes.length === 1 ? recipes[0] : recipes.find(entry => entry.index === selected);
    if (!recipe) return block(node, 'recipeChoice', '这个物品有多条配方，请选择本次使用的配方。');
    node.recipeIndex = recipe.index;
    node.batches = Math.ceil(node.remaining / recipe.amount);
    node.outputPerBatch = recipe.amount;
    node.produced = node.batches * recipe.amount;
    node.stations = recipe.stations || [];
    node.reason = 'craft'; craftSteps++;
    node.stations.forEach(station => stations.add(station));
    const nextPath = new Set(path); nextPath.add(itemId);
    const unresolvedBefore = unresolved.length;
    for (const ingredient of recipe.ingredients) {
      const needed = ingredient.amount * node.batches;
      const chosen = ingredient.item || ingredient.candidates.length === 1 ? ingredient.candidates[0] : goal.groupChoices?.[ingredient.choiceKey];
      if (!Number.isInteger(ingredient.amount) || ingredient.amount < 1 || !ingredient.candidates.includes(chosen)) {
        const child = { key: `node-${nodeCount++}`, itemId: null, required: needed, remaining: needed, children: [],
          fromOwned: 0, fromPlanned: 0, ingredient, groupChoiceKey: ingredient.choiceKey, candidates: ingredient.candidates };
        const invalidAmount = !Number.isInteger(ingredient.amount) || ingredient.amount < 1;
        block(child, invalidAmount ? 'quantity' : ingredient.candidates.length ? 'groupChoice' : 'item', invalidAmount
          ? '本地数据中的材料数量无效，无法展开这条配方。' : ingredient.candidates.length
            ? '请选择这组材料使用的具体物品。' : '本地数据未解析出这项材料，不会把它计为已满足。');
        node.children.push(child);
      } else node.children.push(expand(chosen, needed, nextPath, depth + 1, { ingredient, groupChoiceKey: ingredient.group ? ingredient.choiceKey : null, candidates: ingredient.candidates }));
      if (nodeCount > maxNodes) break;
    }
    // Remainders belong to this proposed sequence even if its raw resources still
    // need collecting. This prevents overcounting batches in later branches.
    const remainder = node.produced - node.remaining;
    if (remainder > 0 && unresolved.length === unresolvedBefore) plannedStock.set(itemId, (plannedStock.get(itemId) || 0) + remainder);
    node.remainder = unresolved.length === unresolvedBefore ? remainder : 0;
    return node;
  }
  const root = expand(goal.itemId, goal.quantity, new Set(), 0);
  return { root, missing: [...missing.values()].sort((a, b) => a.itemId - b.itemId), unresolved,
    stations: [...stations], craftSteps, nodeCount, complete: unresolved.length === 0,
    materialsReady: missing.size === 0 && unresolved.length === 0,
    ownedUsed: [...initialStock].reduce((sum, [id, quantity]) => sum + Math.max(0, quantity - (stock.get(id) || 0)), 0) };
}

export function craftingSources(loot) {
  const sources = new Map();
  for (const boss of loot?.bosses || []) for (const drop of boss.drops || []) {
    const list = sources.get(drop.id) || [];
    list.push({ bossKey: boss.key, name: boss.name, url: boss.url, itemUrl: drop.url,
      notes: [...new Set((drop.routes || []).flatMap(route => route.notes || []))],
      modes: [...new Set((drop.routes || []).flatMap(route => route.modes || []))] });
    sources.set(drop.id, list);
  }
  return sources;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, ChevronRight, GitBranch, Info, Plus, RefreshCw, Save, Search, Target, Trash2 } from 'lucide-react';
import { craftingInventory, craftingScope, sameCraftingScope, createCraftingIndex, planCraftingGoal, craftingSources } from '../core/crafting-goals.mjs';
import { progressPresentation } from '../core/progress.mjs';
import { Icon } from './ui';
import './crafting-goals.css';

const conditionNames = { 'By Hand': '徒手', Water: '水', Honey: '蜂蜜', Lava: '熔岩', 'Ecto Mist': '灵雾', 'Snow Biome': '雪原环境', 'Demon Altar': '恶魔 / 猩红祭坛' };
const groupNames = { 'Any Wood': '任意木材', 'Any Iron Bar': '铁锭 / 铅锭', 'Any Sand': '任意沙块', 'Any Fragment': '任意天界碎片' };
const reasonNames = { owned: '已满足', craft: '继续合成', acquire: '待收集', recipeChoice: '待选配方', groupChoice: '待选材料', cycle: '循环配方', item: '材料未解析', limit: '已达展开上限', quantity: '数量无效' };
const number = value => Number.isFinite(value) ? value.toLocaleString() : '—';
const wiki = item => `https://terraria.wiki.gg/wiki/${encodeURIComponent((item?.english || item?.key || '').replaceAll(' ', '_'))}`;
const signature = goal => JSON.stringify([goal.itemId, goal.quantity, goal.recipeChoices || {}, goal.groupChoices || {}]);

function stationName(station, index) {
  if (conditionNames[station]) return conditionNames[station];
  const names = index.stations[station]?.items?.map(key => index.byKey.get(key)?.name).filter(Boolean);
  return names?.length ? names.join(' / ') : station;
}
function ingredientName(ingredient, index) {
  return ingredient.item ? index.byKey.get(ingredient.item)?.name || ingredient.item : groupNames[ingredient.group] || ingredient.group || '未知材料';
}
function recipeLabel(recipe, index) {
  return `${recipe.ingredients.slice(0, 4).map(row => `${ingredientName(row, index)} × ${row.amount}`).join(' + ')}${recipe.ingredients.length > 4 ? '…' : ''} → ${recipe.amount} 件 · ${(recipe.stations || []).map(station => stationName(station, index)).join('、') || '制作站未记录'}`;
}

export function CraftingGoalsPage({ live, game, workshop, onError, warehouseCounts, warehouseContext }) {
  const [resource, setResource] = useState({ data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setResource({ data: null, error: '' });
    Promise.all(['recipes', 'boss-loot'].map(name => fetch(`./data/${name}.json`, { signal: controller.signal }).then(response => {
      if (!response.ok) throw Error('本地材料资料读取失败。');
      return response.json();
    }))).then(([recipes, loot]) => {
      if (!Array.isArray(recipes?.recipes) || !recipes.groups || !recipes.stations || !Array.isArray(loot?.bosses)) throw Error('本地材料资料格式不完整。');
      if (current) setResource({ data: { recipes, loot }, error: '' });
    }).catch(error => {
      if (current && error.name !== 'AbortError') setResource({ data: null, error: '材料资料读取失败。请重新读取；若仍然失败，请重新安装完整的工坊 App。' });
    });
    return () => { current = false; controller.abort(); };
  }, [attempt]);
  const index = useMemo(() => resource.data ? createCraftingIndex(game.items, resource.data.recipes) : null, [game.items, resource.data]);
  const sources = useMemo(() => craftingSources(resource.data?.loot), [resource.data]);
  const scope = craftingScope(live.state);
  if (resource.error) return <section className="crafting-page"><div className="crafting-callout" role="alert"><Info size={17}/><p>{resource.error}</p></div><div><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>重新读取材料资料</button></div></section>;
  if (!index || !workshop.ready) return <section className="crafting-page"><p className="crafting-empty" role="status">正在读取配方与本机目标…</p></section>;
  return <GoalWorkbench key={scope ? JSON.stringify(scope) : 'disconnected'} {...{ live, game, workshop, onError, index, sources, scope, warehouseCounts, warehouseContext }} loot={resource.data.loot}/>;
}

function GoalWorkbench({ live, game, workshop, onError, index, sources, scope, loot, warehouseCounts, warehouseContext }) {
  const goals = workshop.profile.craftingGoals || [];
  const scopedGoals = goals.filter(goal => sameCraftingScope(goal, scope));
  const suggested = ['Zenith', 'TerraBlade', 'AnkhShield', 'CellPhone'].map(key => index.byKey.get(key)).filter(Boolean);
  const newGoal = itemId => ({ itemId: itemId || suggested[0]?.id || game.items[0]?.id, quantity: 1, recipeChoices: {}, groupChoices: {} });
  const [draft, setDraft] = useState(() => scopedGoals[0] ? { ...scopedGoals[0] } : newGoal());
  const [query, setQuery] = useState('');
  const [includeWarehouse, setIncludeWarehouse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const state = live.state;
  const saved = scopedGoals.find(goal => goal.id === draft.id);
  const dirty = !saved || signature(saved) !== signature(draft);
  const selectedItem = index.byId.get(draft.itemId);
  const warehouseAvailable = warehouseCounts instanceof Map && sameCraftingScope(scope, warehouseContext);
  const inventory = useMemo(() => craftingInventory(state, includeWarehouse ? warehouseCounts : null, warehouseContext), [state, includeWarehouse, warehouseCounts, warehouseContext]);
  const plan = useMemo(() => planCraftingGoal(index, draft, inventory.counts, { itemCount: scope ? state.itemCount : undefined }), [index, draft, inventory.counts, scope, state.itemCount]);
  const progress = useMemo(() => new Map((scope ? state.progress?.bosses || [] : []).map(row => [row.key, row])), [scope, state.progress]);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (term ? game.items.filter(item => `${item.search || ''} ${item.name} ${item.english} ${item.id}`.toLocaleLowerCase().includes(term)) : suggested)
      .filter(item => item.id > 0 && (!scope || !state.itemCount || item.id < state.itemCount)).slice(0, 40);
  }, [query, game.items, state.itemCount, scope, index]);
  const nextBosses = useMemo(() => {
    const rows = new Map();
    for (const row of plan.missing) for (const source of sources.get(row.itemId) || []) {
      const record = progress.get(source.bossKey);
      if (record?.available && ['defeat', 'pillar'].includes(record.kind) && record.defeated === false) {
        const boss = rows.get(source.bossKey) || { ...source, items: new Set() };
        boss.items.add(index.byId.get(row.itemId)?.name || String(row.itemId)); rows.set(source.bossKey, boss);
      }
    }
    return [...rows.values()];
  }, [plan, sources, progress, index]);

  function chooseItem(itemId) { setDraft(newGoal(itemId)); setNotice(''); }
  function changeRecipe(itemId, value) {
    setDraft(old => { const recipeChoices = { ...old.recipeChoices }; if (value === '') delete recipeChoices[itemId]; else recipeChoices[itemId] = Number(value); return { ...old, recipeChoices }; });
    setNotice('');
  }
  function changeGroup(key, value) {
    setDraft(old => { const groupChoices = { ...old.groupChoices }; if (value === '') delete groupChoices[key]; else groupChoices[key] = Number(value); return { ...old, groupChoices }; });
    setNotice('');
  }
  async function saveGoal() {
    if (!scope || busy || !selectedItem) return;
    if (!saved && goals.length >= 30) { setNotice('最多保存 30 个目标，请先删除一个已有目标。'); return; }
    setBusy(true); setNotice('');
    const entry = { ...draft, ...scope, id: saved?.id || crypto.randomUUID(), name: selectedItem.name };
    try {
      await workshop.save({ ...workshop.profile, craftingGoals: saved ? goals.map(goal => goal.id === saved.id ? entry : goal) : [...goals, entry] });
      if (mounted.current) { setDraft(entry); setNotice('已保存到当前世界与角色的目标。'); }
    } catch (error) { if (mounted.current) { setNotice('目标未保存，请重试。'); onError?.(error); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function deleteGoal() {
    if (!saved || busy) return;
    setBusy(true); setNotice('');
    try {
      await workshop.save({ ...workshop.profile, craftingGoals: goals.filter(goal => goal.id !== saved.id) });
      if (mounted.current) { setDraft(newGoal(draft.itemId)); setNotice('已删除这个已保存目标。'); }
    } catch (error) { if (mounted.current) { setNotice('删除失败，请重试。'); onError?.(error); } }
    finally { if (mounted.current) setBusy(false); }
  }

  return <section className="crafting-page">
    <header className="crafting-intro"><div><span className="eyebrow">ONE GOAL, EVERY INGREDIENT</span><h3>从想要的装备，找到下一步</h3><p>{scope ? `${scope.worldName} · ${scope.playerName}` : '连接游戏并进入世界后，自动对照持有材料，也能保存目标。'}</p></div><GitBranch size={39} strokeWidth={1.3}/></header>
    <div className="crafting-layout">
      <aside className="crafting-sidebar" aria-label="合成目标选择">
        <div className="crafting-sidebar-heading"><h4>我的目标</h4><button aria-label="新增合成目标" title="新增合成目标" disabled={busy} onClick={() => { setDraft(newGoal()); setQuery(''); setNotice(''); }}><Plus size={15}/></button></div>
        {scopedGoals.length ? <div className="crafting-saved">{scopedGoals.map(goal => <button key={goal.id} aria-pressed={draft.id === goal.id} className={draft.id === goal.id ? 'selected' : ''} disabled={busy} onClick={() => { setDraft({ ...goal }); setNotice(''); }}><Icon item={index.byId.get(goal.itemId)} sheets={game.sheets} size={28}/><span>{index.byId.get(goal.itemId)?.name || goal.name}<small>目标数量 {number(goal.quantity)}</small></span></button>)}</div> : <p className="crafting-muted crafting-sidebar-note">{scope ? '还没有保存目标。选择物品，开始列出材料。' : '离线时可以预览材料树；目标按世界与角色分别保存。'}</p>}
        <h4>选择目标物品</h4><label className="crafting-search"><Search size={15}/><input value={query} aria-label="搜索合成目标物品" placeholder="名称、英文或 ID" onChange={event => setQuery(event.target.value)}/></label>
        <p className="crafting-muted crafting-search-note">{query.trim() ? '显示前 40 个匹配物品' : '常用目标 · 也可搜索任意物品'}</p>
        <div className="crafting-results">{matches.map(item => <button key={item.id} className={draft.itemId === item.id ? 'selected' : ''} disabled={busy} onClick={() => chooseItem(item.id)} title={item.description}><Icon item={item} sheets={game.sheets} size={28}/><span>{item.name}<small>{item.english}</small></span><ChevronRight size={13}/></button>)}{!matches.length ? <p className="crafting-empty">没有匹配物品。</p> : null}</div>
      </aside>
      <div className="crafting-main">
        <header className="crafting-target"><Icon item={selectedItem} sheets={game.sheets} size={52}/><div><span className="eyebrow">{saved ? 'SAVED GOAL' : 'NEW GOAL'}</span><h3>{selectedItem?.name || '未知物品'}</h3><p>{selectedItem?.description || '选择一件物品，查看递归材料需求。'}</p></div></header>
        <div className="crafting-target-actions"><label>目标数量<input type="number" min="1" max="9999" aria-label="合成目标数量" value={draft.quantity} disabled={busy} onChange={event => { const value = Number(event.target.value); setDraft(old => ({ ...old, quantity: Math.max(1, Math.min(9999, Math.trunc(value) || 1)) })); setNotice(''); }}/></label><button className="primary" disabled={!scope || busy || !dirty || !selectedItem} onClick={saveGoal}><Save size={14}/>{busy ? '处理中…' : saved ? '保存更改' : '保存目标'}</button>{saved ? <button className="crafting-delete" disabled={busy} aria-label="删除当前合成目标" title="删除当前目标" onClick={deleteGoal}><Trash2 size={15}/></button> : null}<span className="crafting-muted">{dirty ? '尚未保存' : '已保存'}</span></div>
        {notice ? <p className="crafting-notice" role="status">{notice}</p> : null}
        <div className="crafting-inventory-note"><p><Info size={14}/>库存统计：背包和随身仓储；不包含身上装备。每份已有材料仅分配一次。</p><label><input type="checkbox" checked={includeWarehouse && warehouseAvailable} disabled={!warehouseAvailable} onChange={event => setIncludeWarehouse(event.target.checked)}/>计入仓库扫描快照{warehouseAvailable ? <span> · {warehouseContext.name || '仓库'}{warehouseContext.scannedAt ? ` · ${new Date(warehouseContext.scannedAt).toLocaleTimeString()}` : ''}</span> : null}</label><small>{warehouseAvailable ? '箱子有变动后请回「基地仓库」重新扫描；快照不会实时刷新。' : '在「基地仓库」扫描当前世界的仓库后，可计入其快照。'}</small></div>
        <div className="crafting-metrics"><div><span>分配已有物品</span><strong>{scope ? number(plan.ownedUsed) : '—'}<small> 件</small></strong></div><div><span>{plan.complete ? '待收集材料' : '已解析的缺口'}</span><strong>{number(plan.missing.length)}<small> 种</small></strong></div><div><span>配方与材料待确认</span><strong>{number(plan.unresolved.length)}<small> 处</small></strong></div></div>
        <div className={`crafting-plan-status ${plan.materialsReady ? 'ready' : ''}`}><Check size={15}/><p>{!scope ? '离线预览：按没有库存展开。连接世界后会自动重新计算。' : plan.root.reason === 'owned' ? '当前库存已经满足目标数量。' : plan.materialsReady ? '材料数量已满足计划。制作前仍需检查下方制作站和环境。' : plan.complete ? '材料树已解析，按下方缺口继续收集。' : '材料树尚未完整：请选择配方或材料；已解析缺口可能继续增加。'}</p></div>
        <section className="crafting-tree-section" aria-label="递归材料树"><div className="crafting-section-title"><h4><GitBranch size={16}/>材料树</h4><span>点击箭头展开分支</span></div><div className="crafting-tree"><MaterialNode key={draft.itemId} node={plan.root} depth={0} {...{ index, game, draft, changeRecipe, changeGroup }}/></div></section>
        {plan.stations.length ? <section className="crafting-stations"><h4>这份计划需要的制作站 / 环境</h4><div>{plan.stations.map(station => <span key={station}>{stationName(station, index)}{index.stations[station]?.condition && station !== 'By Hand' ? ' · 条件' : ''}</span>)}</div><p>尚未检测附近制作站与环境。材料齐备不代表此刻就能合成；箱子快照中的材料可能需要先取出。</p></section> : null}
        {nextBosses.length ? <section className="crafting-next"><h4><Target size={16}/>可以关注的下一场挑战</h4><p>以下未击败首领在已收录资料中有目标材料。召唤条件与掉落随机性请查看对应资料。</p>{nextBosses.map(boss => <a key={boss.bossKey} href={boss.url} target="_blank" rel="noreferrer"><span>{boss.name}<small>{[...boss.items].join('、')}</small></span><ArrowUpRight size={14}/></a>)}</section> : null}
        <section className="crafting-missing"><div className="crafting-section-title"><h4>缺口清单</h4><span>{plan.complete ? '按当前目标汇总' : '仅显示已解析分支'}</span></div>{plan.missing.length ? plan.missing.map(row => <MissingMaterial key={row.itemId} {...{ row, index, game, sources, progress }}/>) : <p className="crafting-empty">{plan.materialsReady ? '当前计划没有材料缺口。' : '先完成上方配方与材料选择，才能列出完整缺口。'}</p>}</section>
      </div>
    </div>
    <footer className="crafting-footnotes"><p>目标规划只读取库存，不发放物品、不执行合成。计算针对当前选中目标；多个目标之间不会预留库存。已计划产物与已有库存分别标注。</p><p>制作配方来自随 App 提供的本地资料；当前数据不含完整商店、宝箱和怪物掉落路径。未收录来源会明确标记，具体版本差异以游戏为准。</p><p>Boss 掉落资料：Terraria {loot.gameVersion} · <a href={loot.sourceUrl} target="_blank" rel="noreferrer">Progress Tracker / Wiki</a> · <a href={loot.licenseUrl} target="_blank" rel="noreferrer">{loot.license}</a></p></footer>
  </section>;
}

function MaterialNode({ node, depth, index, game, draft, changeRecipe, changeGroup }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const item = index.byId.get(node.itemId);
  const selectableGroup = node.groupChoiceKey && node.candidates?.length > 1;
  const options = (node.recipeOptions || []).map(id => index.byRecipe.get(id)).filter(Boolean);
  const children = node.children.length > 0;
  const label = item?.name || (node.ingredient && ingredientName(node.ingredient, index)) || '未解析材料';
  return <div className={`crafting-node crafting-node-${node.reason}`}>
    <div className="crafting-node-row"><button className="crafting-expand" aria-label={`${expanded ? '收起' : '展开'} ${label} 的材料`} aria-expanded={children ? expanded : undefined} disabled={!children} onClick={() => setExpanded(value => !value)}>{children ? expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/> : <span/>}</button><Icon item={item} sheets={game.sheets} size={26}/><div className="crafting-node-info"><b>{label}<em>× {number(node.required)}</em></b><p>{node.fromOwned > 0 ? <span className="owned">已有分配 {number(node.fromOwned)}</span> : null}{node.fromPlanned > 0 ? <span>前序合成余量 {number(node.fromPlanned)}</span> : null}{node.reason === 'craft' ? <span>合成 {number(node.batches)} 次 · 每次 {number(node.outputPerBatch)} 件{node.remainder > 0 ? ` · 余 ${number(node.remainder)}` : ''}</span> : null}{node.reason === 'acquire' || node.reason === 'cycle' ? <span>仍缺 {number(node.remaining)}</span> : null}</p></div><span className="crafting-node-badge">{reasonNames[node.reason] || node.reason}</span></div>
    {selectableGroup ? <label className="crafting-node-choice">{groupNames[node.ingredient.group] || node.ingredient.group}<select aria-label={`选择 ${groupNames[node.ingredient.group] || node.ingredient.group} 的材料`} value={draft.groupChoices?.[node.groupChoiceKey] ?? ''} onChange={event => changeGroup(node.groupChoiceKey, event.target.value)}><option value="">请选择具体材料</option>{node.candidates.map(id => <option key={id} value={id}>{index.byId.get(id)?.name || id}</option>)}</select></label> : null}
    {options.length > 1 ? <label className="crafting-node-choice">本次使用配方<select aria-label={`选择 ${label} 的配方`} value={options.some(recipe => recipe.index === draft.recipeChoices?.[node.itemId]) ? draft.recipeChoices[node.itemId] : ''} onChange={event => changeRecipe(node.itemId, event.target.value)}><option value="">请选择配方（{options.length} 条）</option>{options.map(recipe => <option key={recipe.index} value={recipe.index}>{recipeLabel(recipe, index)}</option>)}</select></label> : null}
    {node.detail ? <p className="crafting-node-detail">{node.detail}</p> : null}
    {node.stations?.length ? <p className="crafting-node-station">{node.stations.map(station => stationName(station, index)).join(' · ')}</p> : null}
    {children && expanded ? <div className="crafting-node-children">{node.children.map(child => <MaterialNode key={`${child.key}:${child.itemId}:${child.recipeIndex ?? ''}`} node={child} depth={depth + 1} {...{ index, game, draft, changeRecipe, changeGroup }}/>)}</div> : null}
  </div>;
}

function MissingMaterial({ row, index, game, sources, progress }) {
  const item = index.byId.get(row.itemId), routes = sources.get(row.itemId) || [];
  return <article className="crafting-missing-row"><div className="crafting-missing-title"><Icon item={item} sheets={game.sheets} size={32}/><div><a href={wiki(item)} target="_blank" rel="noreferrer">{item?.name || row.itemId}<ArrowUpRight size={12}/></a><p>{item?.description}</p></div><b>缺 {number(row.quantity)}</b></div>{routes.length ? <div className="crafting-source-list">{routes.map(source => {
    const status = progressPresentation(progress.get(source.bossKey));
    const mode = source.modes.includes('normal') ? '' : source.modes.includes('expert') ? '专家 / 大师' : source.modes.includes('master') ? '大师' : '';
    return <div key={source.bossKey}><a href={source.url} target="_blank" rel="noreferrer">{source.name}<ArrowUpRight size={11}/></a><span>{status.text}{mode ? ` · ${mode}` : ''}</span>{source.notes.length ? <p>{source.notes.join('；')}</p> : null}</div>;
  })}</div> : <p className="crafting-source-unknown">{row.reasons.includes('cycle') ? '转换配方形成循环，请选择其他配方，或直接收集。' : item?.obtain?.length ? `目录提示：${item.obtain.join('、')}。具体获取路径尚未收录。` : '具体获取路径尚未收录，可打开物品 Wiki 查看。'}</p>}</article>;
}

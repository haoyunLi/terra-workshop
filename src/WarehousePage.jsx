import { useEffect, useMemo, useRef, useState } from 'react';
import { Warehouse, MapPin, Crosshair, Plus, Save, Trash2, ScanLine, Boxes, PackageOpen, LockKeyhole, WandSparkles, ArrowDownUp, ArrowRightLeft, Backpack, Undo2, Check, Search, ChevronDown, Info, ShieldCheck } from 'lucide-react';
import { Icon } from './ui.jsx';
import { WAREHOUSE_CATEGORIES, warehouseCategoryLabel, warehouseScope, normalizeWarehouseArea, warehouseChestKey, ruleForChest, inferWarehouseCategory, suggestedWarehouseNames, warehouseTypeCategories, summarizeWarehouse } from '../core/warehouse-model.mjs';
import './warehouse.css';

const EMPTY_AREA = { x1: '', y1: '', x2: '', y2: '' };
const MODES = [
  { id: 'rename', label: '自动命名', icon: WandSparkles, detail: '根据内容或指定分类命名；默认保留已有名称。' },
  { id: 'sort', label: '箱内整理', icon: ArrowDownUp, detail: '在每个箱子内部合并同类堆叠、排列物品。' },
  { id: 'organize', label: '跨箱归类', icon: ArrowRightLeft, detail: '按分类归入选中的箱子；装不下的物品保留在原箱，并在预览中提示。' },
  { id: 'deposit', label: '回家存包', icon: Backpack, detail: '存入背包物资，保留快捷栏、收藏物品与自定义数量。' },
];
const number = value => Number(value || 0).toLocaleString('zh-CN');
const expires = value => typeof value === 'number' ? value : Date.parse(value || '');
const expired = (value, now) => Number.isFinite(expires(value)) && expires(value) <= now;
const itemName = (byId, type) => byId.get(type)?.name || `物品 #${type}`;
const timeLabel = value => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const adaptSlots = slots => (slots || []).map(item => ({ ...item, id: item.type }));
const adaptScan = result => ({ ...result, checkedAt: new Date().toISOString(),
  chests: (result.chests || []).map(chest => ({ ...chest,
    itemsKnown: chest.itemsKnown === true || (chest.itemsKnown === undefined && (chest.slots?.length || 0) > 0),
    capacity: Number.isInteger(chest.capacity) ? chest.capacity : chest.slots?.length || 0, items: adaptSlots(chest.slots) })),
  inventory: adaptSlots(result.inventory) });

export function WarehousePage(props) {
  return <WarehouseSession key={warehouseScope(props.live.state) || 'offline'} {...props}/>;
}

function WarehouseSession({ live, game, workshop, run, onError, onNotice, onSnapshot, undoRecord, onUndoRecord }) {
  const { state } = live, scope = warehouseScope(state), worldId = state.world?.id;
  const zones = (workshop.profile?.warehouses || []).filter(zone => zone.worldId === worldId && zone.worldName === state.world?.name);
  const initial = zones[0];
  const [selectedId, setSelectedId] = useState(initial?.id || '');
  const [name, setName] = useState(initial?.name || '我的基地');
  const [area, setArea] = useState(initial?.area || { ...EMPTY_AREA });
  const [rules, setRules] = useState(initial?.rules || []), [reserves, setReserves] = useState(initial?.reserves || []);
  const [dirty, setDirty] = useState(false), [mode, setMode] = useState('rename');
  const [scan, setScan] = useState(null), [plan, setPlan] = useState(null), [undo, setUndo] = useState(undoRecord?.scope === scope ? undoRecord : null);
  const [operation, setOperation] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [filter, setFilter] = useState(''), [reserveQuery, setReserveQuery] = useState(''), [reserveType, setReserveType] = useState(null), [reserveStack, setReserveStack] = useState(30);
  const [moveLimit, setMoveLimit] = useState(40), [now, setNow] = useState(Date.now());
  const mounted = useRef(true), requestId = useRef(0), scopeRef = useRef(scope), snapshotCallback = useRef(onSnapshot), inFlight = useRef(false);
  scopeRef.current = scope; snapshotCallback.current = onSnapshot;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);
  useEffect(() => {
    if (!scan && !plan && !undo) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [scan, plan, undo]);
  const byId = useMemo(() => new Map(game.items.map(item => [item.id, item])), [game]);
  const overview = useMemo(() => summarizeWarehouse(scan?.chests || []), [scan]);
  const usable = useMemo(() => (scan?.chests || []).filter(chest => chest.itemsKnown && chest.eligible === true && !ruleForChest(chest, rules).excluded), [scan, rules]);
  const filtered = useMemo(() => (scan?.chests || []).filter(chest => {
    const query = filter.trim().toLowerCase();
    return !query || `${chest.name} ${chest.index + 1} ${chest.x},${chest.y} ${warehouseCategoryLabel(inferWarehouseCategory(chest, byId))}`.toLowerCase().includes(query) ||
      chest.items.some(item => item.stack > 0 && `${item.id} ${byId.get(item.id)?.search || itemName(byId, item.id)}`.toLowerCase().includes(query));
  }), [scan, filter, byId]);
  const reserveMatches = useMemo(() => {
    const query = reserveQuery.trim().toLowerCase();
    if (!query || reserveType !== null) return [];
    return game.items.filter(item => item.id > 0 && item.id < (state.itemCount || Infinity) && (String(item.id) === query || `${item.search || ''} ${item.name} ${item.english || ''}`.toLowerCase().includes(query))).slice(0, 12);
  }, [game, reserveQuery, reserveType, state.itemCount]);
  const pending = !!operation || live.busy;
  const ready = !!scope && !!state.worldControl && !state.player?.dead && !!state.capabilities?.warehouseManagement;
  const scanExpired = scan && expired(scan.expiresAt, now), planExpired = plan && expired(plan.expiresAt, now);
  const depositReady = scan?.capabilities?.deposit === true || state.capabilities?.warehouseDeposit === true;
  const modeInfo = MODES.find(entry => entry.id === mode);
  let areaError = '', normalizedArea = null;
  try { normalizedArea = normalizeWarehouseArea(area); } catch (cause) { areaError = cause.message; }
  const whyUnavailable = !scope ? '进入世界后可读取基地箱子。' : !state.capabilities?.warehouseManagement ? '当前仓库管理已验证原版 1.4.5.8；请用新版工坊启动该版本。' : !state.worldControl ? '需要单人模式，或连接你在本机创建的房间主机。' : state.player?.dead ? '角色复活后可操作仓库。' : '';
  const previewReason = whyUnavailable || (!scan ? '先扫描选定区域。' : scanExpired ? '扫描已过期，请刷新箱子。' : !usable.length ? '请至少选择一个可用箱子。' : mode === 'deposit' && !depositReady ? '回家存包仅支持单人模式。多人模式可使用箱子命名、箱内整理和跨箱归类。' : '');
  const hasChanges = !!plan && ((plan.renames?.length || 0) + (plan.moves?.length || 0) > 0);

  useEffect(() => {
    if (!scan) return;
    snapshotCallback.current?.({ worldId, worldName: state.world?.name, playerName: state.player?.name,
      checkedAt: scan.checkedAt, scanId: scan.scanId, expiresAt: scan.expiresAt, area: scan.area, chests: usable });
  }, [scan, usable, worldId, state.world?.name, state.player?.name]);

  function resetPlan() { setPlan(null); setMoveLimit(40); setError(''); }
  function resetScan() { setScan(null); resetPlan(); snapshotCallback.current?.(null); }
  function editArea(next) { setArea(next); setDirty(true); resetScan(); }
  function updateRules(next) { setRules(next); setDirty(true); resetPlan(); }
  function updateRule(chest, changes) {
    const key = warehouseChestKey(chest), rule = { ...ruleForChest(chest, rules), ...changes };
    updateRules([...rules.filter(entry => warehouseChestKey(entry) !== key), rule].slice(-256));
  }
  function selectAll(excluded) {
    const visibleKeys = new Set(filtered.map(warehouseChestKey));
    updateRules([...rules.filter(rule => !visibleKeys.has(warehouseChestKey(rule))), ...filtered.map(chest => ({ ...ruleForChest(chest, rules), excluded }))].slice(-256));
  }
  function selectZone(id) {
    const zone = zones.find(entry => entry.id === id);
    setSelectedId(zone?.id || ''); setName(zone?.name || '我的基地'); setArea(zone?.area || { ...EMPTY_AREA });
    setRules(zone?.rules || []); setReserves(zone?.reserves || []); setDirty(false); setFilter(''); resetScan();
  }
  function capture(corner) {
    if (!ready) return;
    editArea({ ...area, [`x${corner}`]: Math.floor(state.player.x), [`y${corner}`]: Math.floor(state.player.y) });
  }
  function nearby() {
    if (!ready) return;
    const x = Math.floor(state.player.x), y = Math.floor(state.player.y);
    editArea({ x1: Math.max(0, x - 40), y1: Math.max(0, y - 40), x2: x + 40, y2: y + 40 });
  }
  function current(id) { return mounted.current && scopeRef.current === scope && requestId.current === id; }
  function report(cause) { const message = cause?.message || String(cause); setError(message); onError?.(cause); }
  function inform(message) { setNotice(message); onNotice?.(message); }
  async function perform(label, task) {
    if (pending || inFlight.current) return;
    inFlight.current = true;
    const id = ++requestId.current; setOperation(label); setError(''); setNotice('');
    try { await task(id); } catch (cause) { if (current(id)) report(cause); }
    finally { inFlight.current = false; if (current(id)) setOperation(''); }
  }
  async function fetchScan(id) {
    const result = await live.command('warehouseScan', { worldId, area: normalizeWarehouseArea(area) });
    if (!current(id) || result?.worldId !== worldId) return;
    const next = adaptScan(result); setScan(next); setPlan(null); setMoveLimit(40); setNow(Date.now());
    return next;
  }
  function scanArea() {
    if (!ready || areaError) return;
    perform('scan', async id => { resetScan(); await fetchScan(id); });
  }
  function saveZone() {
    perform('save', async id => {
      const all = workshop.profile?.warehouses || [];
      if (!selectedId && all.length >= 30) throw Error('最多保存 30 个基地，请先删除不再使用的记录。');
      if (!name.trim()) throw Error('请为基地填写名称。');
      const zone = { id: selectedId || globalThis.crypto.randomUUID(), name: name.trim().slice(0, 60), worldId,
        worldName: state.world.name, area: normalizeWarehouseArea(area), rules, reserves };
      await workshop.save({ ...workshop.profile, warehouses: [...all.filter(entry => entry.id !== zone.id), zone] });
      if (!current(id)) return;
      setSelectedId(zone.id); setName(zone.name); setDirty(false); inform('基地范围与整理规则已保存。');
    });
  }
  function deleteZone() {
    perform('save', async id => {
      await workshop.save({ ...workshop.profile, warehouses: (workshop.profile?.warehouses || []).filter(entry => entry.id !== selectedId) });
      if (!current(id)) return;
      setSelectedId(''); setDirty(true); inform('已删除基地记录；游戏中的箱子不受影响。');
    });
  }
  function preview() {
    if (previewReason) return;
    perform('preview', async id => {
      resetPlan();
      const keys = new Set(scan.chests.map(warehouseChestKey));
      const activeRules = rules.filter(rule => keys.has(warehouseChestKey(rule)));
      const result = await live.command('warehousePreview', { scanId: scan.scanId, mode, rules: activeRules,
        categories: warehouseTypeCategories(scan.chests, scan.inventory, byId),
        names: mode === 'rename' ? suggestedWarehouseNames(scan.chests, rules, byId, 20) : [], reserves });
      if (!current(id) || result?.worldId !== worldId) return;
      setPlan(result); setNow(Date.now());
    });
  }
  function applyPlan() {
    if (!plan || !hasChanges || planExpired || !ready) return;
    perform('apply', async id => {
      const result = await live.command('warehouseApply', { planId: plan.planId });
      if (!current(id) || result?.worldId !== worldId || !result.applied) return;
      const record = { scope, id: result.undoId, expiresAt: result.expiresAt || Date.now() + 10 * 60 * 1000, summary: result.summary };
      setUndo(record); onUndoRecord?.(record);
      resetScan();
      inform(`已完成${modeInfo.label}。${result.backupMessage || ''} ${(result.warnings || []).map(warningText).join(' ')}`.trim());
      await fetchScan(id);
    });
  }
  function undoLast() {
    if (!undo || expired(undo.expiresAt, now) || !ready) return;
    perform('undo', async id => {
      const result = await live.command('warehouseUndo', { undoId: undo.id });
      if (!current(id) || result?.worldId !== worldId || !result.undone) return;
      setUndo(null); onUndoRecord?.(null); resetScan(); inform(`已撤销上一次整理。${(result.warnings || []).map(warningText).join(' ')}`);
      await fetchScan(id);
    });
  }
  function addReserve() {
    if (reserveType === null || !Number.isInteger(Number(reserveStack)) || Number(reserveStack) < 1 || Number(reserveStack) > 999999) return;
    if (reserves.length >= 100 && !reserves.some(entry => entry.type === reserveType)) { report(Error('最多设置 100 种物品的保留数量。')); return; }
    setReserves([...reserves.filter(entry => entry.type !== reserveType), { type: reserveType, stack: Number(reserveStack) }]);
    setReserveQuery(''); setReserveType(null); setDirty(true); resetPlan();
  }

  return <section className="page-panel warehouse-page">
    <div className="page-title"><div><span className="eyebrow">A PLACE FOR EVERYTHING</span><h2>把家里的物品，整理到位</h2><p>选定基地，查看真实箱子，再预览命名与整理结果。</p></div><Warehouse size={32}/></div>
    {whyUnavailable ? <div className="warehouse-message"><Info size={17}/>{whyUnavailable}</div> : null}
    {error ? <div className="warehouse-message warehouse-error" role="alert">{error}</div> : null}
    {notice ? <div className="warehouse-message warehouse-success" role="status"><Check size={17}/>{notice}</div> : null}

    <section className="warehouse-card warehouse-base" aria-labelledby="warehouse-base-title">
      <div className="warehouse-section-head"><div><h3 id="warehouse-base-title"><MapPin size={18}/>我的基地</h3><p>{state.world?.name || '等待进入世界'} · 范围与规则按世界保存</p></div>
        <div className="warehouse-inline-actions"><select aria-label="选择已保存基地" value={selectedId} disabled={pending || !scope} onChange={event => selectZone(event.target.value)}><option value="">未保存的基地</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>
          <button disabled={pending || !scope} onClick={() => selectZone('')}><Plus size={15}/>新建</button></div></div>
      <div className="warehouse-base-name"><input aria-label="基地名称" placeholder="例如：出生点仓库" maxLength={60} value={name} disabled={pending || !scope} onChange={event => { setName(event.target.value); setDirty(true); }}/>
        <button disabled={pending || !scope || !!areaError || !name.trim() || !workshop.ready} onClick={saveZone}><Save size={15}/>{operation === 'save' ? '保存中…' : '保存基地'}</button>
        {selectedId ? <button className="icon-btn" aria-label="删除当前基地记录" title="只删除工坊记录，不改动游戏箱子" disabled={pending} onClick={deleteZone}><Trash2 size={16}/></button> : null}
        <span className="warehouse-draft">{dirty ? '有未保存的范围或规则' : selectedId ? '已保存' : '尚未保存'}</span></div>
      <div className="warehouse-region"><div className="warehouse-corners">{[1, 2].map(corner => <fieldset key={corner} disabled={pending || !scope}><legend>角点 {corner === 1 ? 'A' : 'B'}</legend>
        <label>X<input aria-label={`角点 ${corner === 1 ? 'A' : 'B'} X 坐标`} type="number" min="0" max="100000" step="1" value={area[`x${corner}`]} onChange={event => editArea({ ...area, [`x${corner}`]: event.target.value })}/></label>
        <label>Y<input aria-label={`角点 ${corner === 1 ? 'A' : 'B'} Y 坐标`} type="number" min="0" max="100000" step="1" value={area[`y${corner}`]} onChange={event => editArea({ ...area, [`y${corner}`]: event.target.value })}/></label>
        <button disabled={!ready} onClick={() => capture(corner)} title="走到该角点后再记录"><Crosshair size={14}/>记录脚下</button></fieldset>)}</div>
        <div className="warehouse-scan-actions"><button disabled={!ready || pending} onClick={nearby}><Crosshair size={15}/>使用角色附近</button>
          <button className="primary" disabled={!ready || pending || !!areaError} onClick={scanArea}><ScanLine size={16}/>{operation === 'scan' ? '正在扫描…' : scan ? '刷新箱子' : '扫描这片区域'}</button></div></div>
      <p className="warehouse-footnote">{normalizedArea ? `${number(normalizedArea.x2 - normalizedArea.x1 + 1)} × ${number(normalizedArea.y2 - normalizedArea.y1 + 1)} 图格 · 两角 ${normalizedArea.x1}, ${normalizedArea.y1} — ${normalizedArea.x2}, ${normalizedArea.y2}` : '分别站到基地的两个对角记录位置，也可直接输入图格坐标。'} · 仅点击扫描时读取；每次最多 128 个箱子。</p>
    </section>

    {!scan ? <div className="warehouse-empty"><Boxes size={36}/><h3>先选一片熟悉的仓库</h3><p>扫描后可看见容量、箱中物品与分类建议。上锁、正在使用的箱子会跳过。</p></div> : <>
      <div className="warehouse-stats" aria-label="仓库容量概览">
        <Stat icon={Boxes} value={overview.chests} label="区域内箱子" detail={`${usable.length} 个参与整理`}/>
        <Stat icon={PackageOpen} value={overview.free} label="空闲槽位" detail={`已用 ${overview.used} / ${overview.capacity}`}/>
        <Stat icon={Warehouse} value={overview.empty} label="空箱" detail={`${overview.duplicateTypes} 种物品分散存放`}/>
        <Stat icon={LockKeyhole} value={overview.unavailable} label="暂不可用" detail="上锁、占用或状态未知"/>
      </div>
      {overview.unknown > 0 ? <p className="warehouse-footnote">有 {overview.unknown} 个箱子内容未读取；容量、空闲槽位、空箱和分散物品统计只包含已成功读取的箱子。</p> : null}
      <section className="warehouse-card" aria-labelledby="warehouse-chests-title">
        <div className="warehouse-section-head"><div><h3 id="warehouse-chests-title"><Boxes size={18}/>箱子与分类</h3><p>{timeLabel(scan.checkedAt)} 扫描 · {scanExpired ? '扫描已过期，请刷新' : '游戏中物品有变化时，请重新扫描'}</p></div>
          <label className="warehouse-search"><Search size={16}/><input aria-label="筛选箱子" placeholder="箱名、分类或物品" value={filter} onChange={event => setFilter(event.target.value)}/></label></div>
        <div className="warehouse-list-actions"><span>勾选的箱子参与本次操作，分类也决定归类目的地。</span><div><button disabled={pending} onClick={() => selectAll(false)}>选择当前列表</button><button disabled={pending} onClick={() => selectAll(true)}>排除当前列表</button></div></div>
        <div className="warehouse-chest-list">{filtered.map(chest => <ChestRow key={warehouseChestKey(chest)} chest={chest} rule={ruleForChest(chest, rules)} byId={byId} game={game} disabled={pending} onRule={changes => updateRule(chest, changes)} onLocate={run && ready && chest.x >= 10 && chest.y >= 11 ? () => run('teleport', { x: chest.x + 3, y: chest.y - 1, worldId }) : null}/>)}
          {!filtered.length ? <p className="warehouse-inline-empty">{scan.chests.length ? '没有匹配的箱子。' : '这片区域没有箱子，请调整两个角点。'}</p> : null}</div>
        <Warnings warnings={scan.warnings}/>
      </section>

      <section className="warehouse-card warehouse-operation" aria-labelledby="warehouse-operation-title">
        <div className="warehouse-section-head"><div><h3 id="warehouse-operation-title"><WandSparkles size={18}/>选择整理方式</h3><p>先查看具体变化，确认后才会修改游戏。</p></div><span className="warehouse-badge"><ShieldCheck size={14}/>不新增或删除物品</span></div>
        <div className="warehouse-modes" role="group" aria-label="整理方式">{MODES.map(entry => { const ModeIcon = entry.icon; return <button key={entry.id} aria-pressed={mode === entry.id} disabled={pending} className={mode === entry.id ? 'active' : ''} onClick={() => { setMode(entry.id); resetPlan(); }}><ModeIcon size={20}/>{entry.label}</button>; })}</div>
        <p className="warehouse-mode-detail">{modeInfo.detail}</p>
        {mode === 'organize' ? <p className="warehouse-footnote">可为矿石、药水等指定专用箱。未指定分类时，根据已有内容自动判断；空箱和混合箱由整理预览说明用途。</p> : null}
        {mode === 'deposit' ? <div className="warehouse-reserves"><div className="warehouse-section-head"><div><h4>背包保留清单</h4><p>快捷栏与收藏物品始终保留。额外指定要随身携带的数量。</p></div></div>
          <div className="warehouse-reserve-form"><div className="warehouse-reserve-search"><label className="warehouse-search"><Search size={16}/><input aria-label="搜索保留物品" placeholder="物品名称或 ID" disabled={pending} value={reserveQuery} onChange={event => { setReserveQuery(event.target.value); setReserveType(null); }}/></label>
            {reserveMatches.length ? <div className="warehouse-reserve-options" role="listbox" aria-label="保留物品候选">{reserveMatches.map(item => <button key={item.id} role="option" aria-selected={false} disabled={pending} onClick={() => { setReserveType(item.id); setReserveQuery(item.name); }}><Icon item={item} sheets={game.sheets} size={24}/><span>{item.name}</span><small>#{item.id}</small></button>)}</div> : null}</div>
            <label className="warehouse-count-label">保留<input aria-label="背包保留数量" type="number" min="1" max="999999" step="1" disabled={pending} value={reserveStack} onChange={event => setReserveStack(event.target.value)}/></label>
            <button disabled={pending || reserveType === null || !Number.isInteger(Number(reserveStack)) || Number(reserveStack) < 1 || Number(reserveStack) > 999999} onClick={addReserve}><Plus size={15}/>加入清单</button></div>
          <div className="warehouse-reserve-tags">{reserves.map(entry => <span key={entry.type}><Icon item={byId.get(entry.type)} sheets={game.sheets} size={25}/>{itemName(byId, entry.type)} <b>× {number(entry.stack)}</b><button aria-label={`移除${itemName(byId, entry.type)}保留规则`} disabled={pending} onClick={() => { setReserves(reserves.filter(rule => rule.type !== entry.type)); setDirty(true); resetPlan(); }}><Trash2 size={13}/></button></span>)}{!reserves.length ? <small>尚未设置额外保留物品。</small> : null}</div>
        </div> : null}
        <div className="warehouse-preview-actions"><div><strong>{usable.length} 个箱子参与{modeInfo.label}</strong><p>{previewReason || '预览会检查箱子状态、分类容量与物品数量。'}</p></div><button className="primary" disabled={pending || !!previewReason} onClick={preview}><WandSparkles size={16}/>{operation === 'preview' ? '正在生成预览…' : '预览改动'}</button></div>
      </section>

      {plan ? <section className="warehouse-card warehouse-preview" aria-labelledby="warehouse-preview-title">
        <div className="warehouse-section-head"><div><span className="eyebrow">REVIEW BEFORE APPLYING</span><h3 id="warehouse-preview-title">{modeInfo.label}预览</h3><p>{planExpired ? '预览已过期，请重新生成。' : '预览有效期 2 分钟；应用时会再次检查游戏状态。'}</p></div><span className="warehouse-badge">{number(plan.renames?.length)} 个命名 · {number(plan.moves?.length)} 项移动</span></div>
        {plan.renames?.length ? <div className="warehouse-renames">{plan.renames.map(change => <div key={`${change.index}:${change.x}:${change.y}`}><small>#{change.index + 1} · {change.x}, {change.y}</small><span>{change.before || '未命名箱子'}</span><ArrowRightLeft size={14}/><strong>{change.after}</strong></div>)}</div> : null}
        {plan.moves?.length ? <><div className="warehouse-move-head"><strong>物品移动明细</strong><span>合计移动 {number(plan.moves.reduce((total, move) => total + move.stack, 0))} 件 · 数量保持不变</span></div>
          <div className="warehouse-moves">{plan.moves.slice(0, moveLimit).map((move, index) => <div key={index}><Icon item={byId.get(move.type)} sheets={game.sheets} size={28}/><span><strong>{itemName(byId, move.type)}</strong><small>#{move.type}{move.prefix ? ` · 前缀 #${move.prefix}` : ''}</small></span><b>× {number(move.stack)}</b><span className="warehouse-move-route">{locationLabel(move.from)}<span>→</span>{locationLabel(move.to)}</span></div>)}</div>
          {plan.moves.length > moveLimit ? <button className="warehouse-show-more" onClick={() => setMoveLimit(value => value + 80)}><ChevronDown size={15}/>继续显示 {Math.min(80, plan.moves.length - moveLimit)} 项（剩余 {plan.moves.length - moveLimit}）</button> : null}</> : null}
        {!hasChanges ? <div className="warehouse-inline-empty"><Check size={20}/>当前规则下没有需要修改的内容。</div> : null}
        {plan.skipped?.length ? <details className="warehouse-skipped"><summary>{plan.skipped.length} 个箱子已跳过</summary>{plan.skipped.map((entry, index) => <p key={index}>箱子 #{entry.index + 1} · {entry.x}, {entry.y}：{entry.reason}</p>)}</details> : null}
        <Warnings warnings={plan.warnings}/>
        <div className="warehouse-apply"><p>整理前自动备份角色与世界，可能需要几秒。只执行以上改动；箱子或背包发生变化时会拒绝应用，请重新扫描。</p><button className="primary" disabled={pending || !hasChanges || planExpired || !ready} onClick={applyPlan}><Check size={16}/>{operation === 'apply' ? '正在备份并应用…' : '应用这些改动'}</button></div>
      </section> : null}
    </>}
    {undo ? <div className="warehouse-undo"><div><Undo2 size={20}/><span><strong>可以撤销上一次整理</strong><small>{expired(undo.expiresAt, now) ? '撤销已过期' : '10 分钟内有效；仅在相关物品未再次变化时恢复'}</small></span></div><button disabled={pending || !ready || expired(undo.expiresAt, now)} onClick={undoLast}><Undo2 size={15}/>{operation === 'undo' ? '正在恢复…' : '撤销上一次'}</button></div> : null}
  </section>;
}

function Stat({ icon: StatIcon, value, label, detail }) {
  return <div className="warehouse-stat"><StatIcon size={19}/><div><strong>{number(value)}</strong><span>{label}</span><small>{detail}</small></div></div>;
}
function ChestRow({ chest, rule, byId, game, disabled, onRule, onLocate }) {
  const items = chest.items.filter(item => item.id > 0 && item.stack > 0), category = inferWarehouseCategory(chest, byId);
  return <article className={`warehouse-chest ${rule.excluded ? 'excluded' : ''} ${!chest.eligible ? 'unavailable' : ''}`}>
    <label className="warehouse-chest-check"><input type="checkbox" aria-label={`箱子 #${chest.index + 1} 参与整理`} checked={!rule.excluded && chest.eligible === true} disabled={disabled || !chest.eligible} onChange={event => onRule({ excluded: !event.target.checked })}/></label>
    <div className="warehouse-chest-main"><div><strong>{chest.name || `未命名箱子 #${chest.index + 1}`}</strong>{!chest.eligible ? <span className="warehouse-status"><LockKeyhole size={12}/>{chest.skipReason || (chest.locked ? '已上锁' : chest.inUse ? '正在使用' : '暂不可用')}</span> : rule.excluded ? <span className="warehouse-status">已排除</span> : null}</div><small>#{chest.index + 1} · {chest.x}, {chest.y} · {chest.itemsKnown ? `${items.length}/${chest.capacity} 槽 · ${warehouseCategoryLabel(category)}` : '内容未读取'}</small>
      <div className="warehouse-chest-items">{!chest.itemsKnown ? <small>内容未知，不计入空箱与容量统计</small> : <>{items.slice(0, 5).map(item => <span key={item.slot} title={`${itemName(byId, item.id)} × ${number(item.stack)}`}><Icon item={byId.get(item.id)} sheets={game.sheets} size={25}/></span>)}{items.length > 5 ? <small>+{items.length - 5} 槽</small> : !items.length ? <small>空箱，可分配一个分类</small> : null}</>}</div></div>
    <div className="warehouse-chest-rules"><label><span>收纳分类</span><select aria-label={`箱子 #${chest.index + 1} 收纳分类`} value={rule.category || ''} disabled={disabled || !chest.eligible} onChange={event => onRule({ category: event.target.value })}><option value="">按内容自动识别</option>{WAREHOUSE_CATEGORIES.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label className="warehouse-keep-name"><input type="checkbox" checked={rule.keepName !== false} disabled={disabled || !chest.eligible} onChange={event => onRule({ keepName: event.target.checked })}/>保留已有名称</label></div>
    <button className="icon-btn warehouse-locate" aria-label={`前往箱子 #${chest.index + 1} 附近`} title="前往箱子附近" disabled={disabled || !onLocate} onClick={onLocate}><MapPin size={16}/></button>
  </article>;
}
function warningText(value) { return typeof value === 'string' ? value : value?.message || value?.reason || String(value); }
function Warnings({ warnings }) { return warnings?.length ? <div className="warehouse-warnings" role="status">{warnings.map((value, index) => <p key={index}><Info size={15}/>{warningText(value)}</p>)}</div> : null; }
function locationLabel(location) { return location?.kind === 'inventory' ? `背包 · 槽 ${Number(location.slot) + 1}` : `箱子 #${Number(location?.index) + 1} · 槽 ${Number(location?.slot) + 1}`; }

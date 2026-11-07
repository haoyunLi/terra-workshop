import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Boxes, Backpack, MapPin, LocateFixed, LockKeyhole, RefreshCw, ArrowDown, PackageSearch } from 'lucide-react';
import { Icon } from './ui.jsx';
import { acceptsStorageReply, findPersonalItems, matchingStorageTypes, mergeChestResults, storageGroupName } from '../core/storage-search.mjs';
import './storage-search.css';

const PAGE_SIZE = 100, MAX_VISIBLE_CHESTS = 500;

export function StorageSearch({ live, game, run, onLocateSlot, onError }) {
  const { state, busy } = live;
  const [query, setQuery] = useState(''), [group, setGroup] = useState('all');
  const [personalLimit, setPersonalLimit] = useState(PAGE_SIZE), [worldResult, setWorldResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const active = state.connected && state.inWorld;
  const worldId = state.world?.id;
  const context = JSON.stringify([active, worldId, state.player?.name, state.netMode, !!state.worldControl, query.trim().toLowerCase()]);
  const contextRef = useRef(context), mounted = useRef(true), requestId = useRef(0);
  contextRef.current = context;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);
  useEffect(() => { requestId.current++; setWorldResult(null); setSearching(false); }, [context]);
  useEffect(() => { setPersonalLimit(PAGE_SIZE); }, [context, group]);
  const byId = useMemo(() => new Map(game.items.map(item => [item.id, item])), [game]);
  const types = useMemo(() => matchingStorageTypes(game.items, query, state.itemCount || Infinity), [game, query, state.itemCount]);
  const groups = active ? Object.keys({ ...state.player?.groups, ...state.storageLoadouts }) : [];
  const selectedGroup = group === 'all' || groups.includes(group) ? group : 'all';
  const personal = useMemo(() => active ? findPersonalItems(state.player, state.storageLoadouts, types, selectedGroup) : [],
    [active, state.player, state.storageLoadouts, types, selectedGroup]);
  const found = worldResult?.context === context ? worldResult : null;
  const worldSupported = !!state.capabilities?.storageSearch;
  const worldReady = active && worldSupported && state.worldControl && !state.player?.dead;
  const queryReady = !!query.trim() && types.size > 0 && types.size <= 256;
  const canSearch = worldReady && queryReady && !busy && !searching;
  const total = personal.reduce((sum, item) => sum + item.stack, 0);

  async function searchWorld(append = false) {
    if (!canSearch) return;
    const requestedContext = context, requestedWorld = worldId, currentRequest = ++requestId.current;
    const previous = append ? found : null;
    setSearching(true);
    try {
      const result = await live.command('searchStorage', { types: [...types], worldId: requestedWorld, limit: PAGE_SIZE,
        cursorChest: previous?.nextCursor?.chest || 0, cursorSlot: previous?.nextCursor?.slot || 0 });
      if (!mounted.current || currentRequest !== requestId.current ||
        !acceptsStorageReply(result, requestedContext, contextRef.current, requestedWorld)) return;
      setWorldResult({ ...result, context: requestedContext,
        results: previous ? mergeChestResults(previous.results, result.results) : result.results,
        checkedAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    } catch (error) {
      if (mounted.current && requestedContext === contextRef.current) onError?.(error);
    } finally { if (mounted.current && currentRequest === requestId.current) setSearching(false); }
  }

  return <section className="page-panel storage-search-page">
    <div className="page-title"><div><span className="eyebrow">FIND YOUR SUPPLIES</span><h2>东西放哪儿了？</h2>
      <p>搜索背包、装备与私人储物空间，再按需查找当前世界的箱子。</p></div><PackageSearch size={31} /></div>
    <form className="storage-search-bar" onSubmit={event => { event.preventDefault(); searchWorld(); }}>
      <label className="search"><Search size={19}/><input aria-label="跨储物空间搜索" placeholder="搜索中文、英文名称，或输入完整物品 ID" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <button type="submit" className="primary" disabled={!canSearch}><Search size={16}/>{searching ? '正在查找…' : '查找世界箱子'}</button>
    </form>
    {!active ? <div className="storage-empty"><Backpack size={32}/><h3>进入世界后，开始找物品</h3><p>角色的随身物品和私人储物会随游戏同步。</p></div> : <>
      <section className="storage-section" aria-labelledby="personal-storage-title">
        <header className="storage-section-head"><div><h3 id="personal-storage-title"><Backpack size={18}/>角色与私人储物</h3>
          <p aria-live="polite">{personal.length} 个槽位 · 合计 {total.toLocaleString()} 件 · 随游戏同步</p></div>
          <select aria-label="筛选储物位置" value={selectedGroup} onChange={event => setGroup(event.target.value)}><option value="all">全部位置</option>
            {groups.map(key => <option key={key} value={key}>{storageGroupName(key)}</option>)}</select></header>
        {personal.length ? <div className="storage-results">{personal.slice(0, personalLimit).map(item => <StorageItem key={item.key} item={item} game={game} byId={byId}>
          <div className="storage-location"><span>{storageGroupName(item.group)} · 槽位 {item.slot + 1}</span>
            {item.readOnly ? <small>在游戏中切换到该配装后，可在背包页编辑</small> : item.group === 'inventory' && item.slot < 10 ? <small>快捷栏 {item.slot + 1}</small> : null}</div>
          {item.readOnly ? <span className="storage-readonly">备用配装</span> : <button className="storage-locate" aria-label={`定位${storageGroupName(item.group)}槽位 ${item.slot + 1}`} onClick={() => onLocateSlot?.({ group: item.group, slot: item.slot, itemId: item.itemId })}><LocateFixed size={15}/>定位槽位</button>}
        </StorageItem>)}</div> : <div className="storage-inline-empty">{query ? '这些储物位置中没有匹配物品。试试世界箱子。' : '这个位置还没有物品。'}</div>}
        {personal.length > personalLimit ? <button className="storage-more" onClick={() => setPersonalLimit(value => value + PAGE_SIZE)}><ArrowDown size={15}/>继续显示 {Math.min(PAGE_SIZE, personal.length - personalLimit)} 个槽位</button> : null}
      </section>
      <section className="storage-section storage-world-section" aria-labelledby="world-storage-title">
        <header className="storage-section-head"><div><h3 id="world-storage-title"><Boxes size={18}/>世界箱子 <span className="storage-badge">按需查找</span></h3>
          <p>{state.world?.name || '当前世界'} · {found ? `${found.checkedAt} 查找 · 已显示 ${found.results.length} 个槽位` : '点击查找后，读取当前世界箱子中的物品位置'}</p></div>
          {found ? <button disabled={!canSearch} onClick={() => searchWorld()}><RefreshCw size={14}/>刷新结果</button> : null}</header>
        {!worldSupported ? <p className="storage-hint">请通过新版工坊启动游戏，以启用世界箱子查找。</p> : !state.worldControl ?
          <p className="storage-hint">世界箱子需要单人模式，或连接你在本机创建的房间主机。</p> : state.player?.dead ?
          <p className="storage-hint">角色复活后可查找世界箱子。</p> : !query.trim() ? <p className="storage-hint">输入物品名称或 ID，再点击上方「查找世界箱子」。</p> : types.size > 256 ?
          <p className="storage-hint">名称匹配 {types.size} 种物品。请使用更具体的名称或完整 ID，将范围缩小到 256 种以内。</p> : !types.size ?
          <p className="storage-hint">当前游戏版本没有匹配的物品，请换个名称或 ID。</p> : null}
        {found ? <>{found.results.length ? <div className="storage-results">{found.results.map(item => <StorageItem key={`${item.chestIndex}:${item.slot}`} item={item} game={game} byId={byId}>
          <div className="storage-location"><span>{item.chestName || `未命名箱子 #${item.chestIndex + 1}`} · 槽位 {item.slot + 1}</span>
            <small>位置 {item.x}, {item.y} · 箱子 #{item.chestIndex + 1}{item.locked === true ? ' · 已上锁' : item.locked === null ? ' · 锁状态未知' : ''}{item.inUse ? ' · 有玩家正在使用' : ''}</small></div>
          <button className="storage-locate" disabled={!worldReady || busy || item.x < 10 || item.y < 11} title="传送到箱子旁边；仍需在游戏中打开箱子" onClick={() => run('teleport', { x: item.x + 3, y: item.y - 1, worldId: found.worldId })}>{item.locked ? <LockKeyhole size={15}/> : <MapPin size={15}/>}前往附近</button>
        </StorageItem>)}</div> : <div className="storage-inline-empty">当前世界的箱子中没有匹配物品。</div>}
          {found.nextCursor && found.results.length < MAX_VISIBLE_CHESTS ? <button className="storage-more" disabled={!canSearch} onClick={() => searchWorld(true)}><ArrowDown size={15}/>继续查找后续箱子</button> : null}
          {found.nextCursor && found.results.length >= MAX_VISIBLE_CHESTS ? <p className="storage-hint">已显示前 {MAX_VISIBLE_CHESTS} 个匹配槽位，请缩小搜索范围继续查找。</p> : null}
          <p className="storage-footnote">箱子结果来自查找时刻。取走、放入物品后请刷新；上锁的箱子仍需满足游戏中的开启条件。</p>
        </> : null}
      </section>
    </>}
  </section>;
}

function StorageItem({ item, game, byId, children }) {
  const definition = byId.get(item.itemId);
  return <article className="storage-result"><div className="storage-item-icon"><Icon item={definition} sheets={game.sheets} size={36}/></div>
    <div className="storage-item-name"><strong>{definition?.name || `物品 #${item.itemId}`}</strong><small>#{item.itemId} · 数量 <b>{item.stack.toLocaleString()}</b></small></div>{children}</article>;
}

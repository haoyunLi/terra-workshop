import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, CheckCircle2, Circle, Flag, Info, RefreshCw, Search, Star, Trophy } from 'lucide-react';
import { collectionOwnedCounts, collectionScope, normalizeCollection, progressPresentation, readCollection, toggleCollection } from '../core/progress.mjs';
import { Icon } from './ui';
import './progress.css';

const stages = [['pre-hardmode','启程 · 困难模式前'],['hardmode','深入 · 困难模式'],['pillars','终局 · 天界四柱']];
const modeNames = { normal: '经典', expert: '专家', master: '大师' };

export function ProgressPage({ live, game, onError }) {
  const [resource, setResource] = useState({ data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setResource({ data: null, error: '' });
    fetch('./data/boss-loot.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw Error('无法打开本地战利品清单。');
      return response.json();
    }).then(data => {
      if (data?.version !== 1 || !Array.isArray(data.bosses) || !data.bosses.length || !data.bosses.every(boss =>
        typeof boss.key === 'string' && typeof boss.name === 'string' && Array.isArray(boss.drops) && boss.drops.every(drop =>
          Number.isInteger(drop.id) && Array.isArray(drop.routes) && drop.routes.every(route => Array.isArray(route.modes) && Array.isArray(route.notes))))) {
        throw Error('本地战利品清单格式不完整。');
      }
      if (current) setResource({ data, error: '' });
    }).catch(error => {
      if (current && error.name !== 'AbortError') setResource({ data: null, error: '战利品清单读取失败，请重新读取。若仍失败，请重新安装完整的工坊 App。' });
    });
    return () => { current = false; controller.abort(); };
  }, [attempt]);
  const loot = resource.data;
  const allowedIds = useMemo(() => new Set(loot?.bosses.flatMap(boss => boss.drops.map(drop => drop.id)) || []), [loot]);
  const scope = collectionScope(live.state);
  if (resource.error) return <section className="progress-page"><div className="progress-callout" role="alert"><Info size={17}/><p>{resource.error}</p></div><div><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15}/>重新读取战利品清单</button></div></section>;
  if (!loot) return <section className="progress-page"><div className="progress-callout" role="status"><Info size={17}/><p>正在读取本地战利品清单…</p></div></section>;
  return <CollectionView key={scope || 'disconnected'} {...{ live, game, onError, scope, loot, allowedIds }}/>;
}

function CollectionView({ live, game, onError, scope, loot, allowedIds }) {
  const state = live.state;
  const [initial] = useState(() => {
    try { return { value: readCollection(localStorage, scope, allowedIds), error: '' }; }
    catch { return { value: normalizeCollection(null, allowedIds), error: '本机收藏记录暂时无法读取，请检查 App 的本地存储。' }; }
  });
  const [collection, setCollection] = useState(initial.value);
  const [selected, setSelected] = useState('kingSlime');
  const [bossQuery, setBossQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const byId = useMemo(() => new Map(game.items.map(item => [item.id, item])), [game]);
  const owned = useMemo(() => collectionOwnedCounts(state), [scope, state.player, state.storageLoadouts]);
  const marked = new Set(collection.collected), targets = new Set(collection.targets);
  const acquired = id => marked.has(id) || (owned.get(id) || 0) > 0;
  const records = scope ? state.progress?.bosses || [] : [];
  const byBoss = new Map(records.map(boss => [boss.key, boss]));
  const known = records.filter(boss => boss.kind === 'defeat' && boss.available);
  const completed = known.filter(boss => boss.defeated === true).length;
  const collected = [...allowedIds].filter(acquired).length;
  const pending = collection.targets.filter(id => !acquired(id)).length;
  const query = bossQuery.trim().toLocaleLowerCase();
  const bosses = loot.bosses.filter(boss => `${boss.name} ${boss.english}`.toLocaleLowerCase().includes(query));
  const current = bosses.find(boss => boss.key === selected) || bosses[0];
  const record = current && byBoss.get(current.key), presentation = progressPresentation(record);
  const search = itemQuery.trim().toLocaleLowerCase();
  const drops = current?.drops.filter(drop => {
    const item = byId.get(drop.id);
    return item && `${item.name} ${item.english} ${item.key} ${item.id}`.toLocaleLowerCase().includes(search)
      && (filter === 'all' || filter === 'missing' && !acquired(drop.id) || filter === 'target' && targets.has(drop.id) || filter === 'marked' && marked.has(drop.id));
  }) || [];

  function toggle(field, id) {
    if (!scope) return;
    try {
      const next = toggleCollection(collection, field, id, allowedIds);
      localStorage.setItem(scope, JSON.stringify(next));
      setCollection(next);
    } catch { onError?.(Error('收藏记录保存失败，本次标记未保存。请检查 App 的本地存储空间。')); }
  }

  return <section className="progress-page">
    <div className="progress-intro"><div><span className="eyebrow">YOUR NEXT TROPHY</span><h3>每次挑战，都有新的收获</h3><p>{scope ? `${state.world.name} · ${state.player.name}` : '连接游戏并进入世界，即可读取挑战进度和当前持有物品。'}</p></div><Trophy size={40} strokeWidth={1.25}/></div>
    <div className="progress-stats">
      <div><span>世界已确认击败首领</span><strong>{known.length ? completed : '—'}<small>{known.length ? ` / ${known.length}` : ''}</small></strong><p>另有 3 项阶段参考，四柱单独查看</p></div>
      <div><span>战利品收藏</span><strong>{scope ? collected : '—'}<small> / {allowedIds.size}</small></strong><p>当前持有或已手动标记</p></div>
      <div><span>待收集目标</span><strong>{scope ? pending : '—'}</strong><p>点击物品旁的星标，列出下个目标</p></div>
    </div>
    {scope && !state.capabilities?.progress ? <div className="progress-callout"><Info size={17}/><p>当前连接没有提供世界进度。通过新版工坊启动游戏与本地主机后再查看；物品收藏仍可使用。</p></div> : null}
    {initial.error ? <div className="progress-callout"><Info size={17}/><p>{initial.error}</p></div> : null}
    <div className="progress-workbench">
      <aside className="progress-bosses" aria-label="挑战列表">
        <label className="progress-search"><Search size={15}/><input aria-label="搜索首领或天界柱" placeholder="搜索首领或天界柱" value={bossQuery} onChange={event => setBossQuery(event.target.value)}/></label>
        <div className="progress-boss-scroll">{stages.map(([stage, label]) => {
          const entries = bosses.filter(boss => boss.stage === stage);
          return entries.length ? <div className="progress-stage" key={stage}><h4>{label}</h4>{entries.map(boss => {
            const status = progressPresentation(byBoss.get(boss.key));
            const done = boss.drops.filter(drop => acquired(drop.id)).length;
            return <button key={boss.key} className={`progress-boss ${current?.key === boss.key ? 'selected' : ''}`} aria-pressed={current?.key === boss.key} onClick={() => { setSelected(boss.key); setItemQuery(''); }}>
              <Icon item={byId.get(boss.item)} sheets={game.sheets} size={30}/><span><b>{boss.name}</b><small className={`progress-tone-${status.tone}`}>{status.text}</small></span><em>{scope ? done : '—'}<small>/{boss.drops.length}</small></em>
            </button>;
          })}</div> : null;
        })}{!bosses.length ? <p className="progress-empty">没有匹配的挑战。</p> : null}</div>
      </aside>
      <div className="progress-detail">{current ? <>
        <header className="progress-detail-title"><div><span className="eyebrow">LOOT COLLECTION</span><h3>{current.name}</h3><span className={`progress-badge progress-tone-${presentation.tone}`}>{presentation.tone === 'done' ? <CheckCircle2 size={13}/> : <Flag size={13}/>} {presentation.text}</span></div><Icon item={byId.get(current.item)} sheets={game.sheets} size={52}/></header>
        <p className="progress-world-note">{record?.note || '世界进度尚未读取。你仍可以浏览收录的战利品。'}</p>
        <div className="progress-collection-meter"><span>{scope ? `${current.drops.filter(drop => acquired(drop.id)).length} / ${current.drops.length} 件已收集` : `${current.drops.length} 件收录战利品`}</span><a href={current.url} target="_blank" rel="noreferrer">首领 Wiki <ArrowUpRight size={13}/></a><div><i style={{ width: `${scope ? current.drops.filter(drop => acquired(drop.id)).length / Math.max(1, current.drops.length) * 100 : 0}%` }}/></div></div>
        <div className="progress-loot-toolbar"><label className="progress-search"><Search size={15}/><input aria-label="搜索当前挑战的战利品" value={itemQuery} placeholder="搜索这场挑战的战利品" onChange={event => setItemQuery(event.target.value)}/></label><select aria-label="筛选战利品" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部战利品</option><option value="missing">尚未收集</option><option value="target">我的目标</option><option value="marked">手动标记</option></select></div>
        <div className="progress-loot-list">{drops.map(drop => {
          const item = byId.get(drop.id), count = owned.get(drop.id) || 0, manual = marked.has(drop.id);
          const modes = [...new Set(drop.routes.flatMap(route => route.modes))];
          const notes = [...new Set(drop.routes.flatMap(route => route.notes))];
          const difficulty = modes.includes('normal') ? '' : modes.includes('expert') ? '专家 / 大师' : modes.includes('master') ? '大师' : '';
          return <article key={drop.id} className={`progress-loot ${acquired(drop.id) ? 'acquired' : ''}`}>
            <div className="progress-loot-main"><Icon item={item} sheets={game.sheets} size={36}/><div><a className="progress-item-name" href={drop.url} target="_blank" rel="noreferrer">{item.name}<ArrowUpRight size={12}/></a><p className="progress-item-description" title={item.description}>{item.description}</p><div className="progress-item-status">{count > 0 ? <span className="owned"><Check size={11}/>当前持有 {count.toLocaleString()}</span> : <span>当前未持有</span>}{manual ? <span className="recorded">已手动标记</span> : null}{difficulty ? <span>{difficulty}</span> : null}</div></div></div>
            <div className="progress-loot-actions"><button className={targets.has(drop.id) ? 'targeted' : ''} aria-label={`${targets.has(drop.id) ? '取消目标' : '设为目标'}：${item.name}`} aria-pressed={targets.has(drop.id)} disabled={!scope} title={targets.has(drop.id) ? '取消收集目标' : '设为收集目标'} onClick={() => toggle('targets', drop.id)}><Star size={16} fill={targets.has(drop.id) ? 'currentColor' : 'none'}/></button><button className={manual ? 'marked' : ''} aria-label={`${manual ? '取消手动标记' : '手动标记已收集'}：${item.name}`} aria-pressed={manual} disabled={!scope} onClick={() => toggle('collected', drop.id)}>{manual ? <CheckCircle2 size={15}/> : <Circle size={15}/>}<span>{manual ? '已记录' : '标记'}</span></button></div>
            {notes.length ? <p className="progress-drop-note"><Info size={12}/>{notes.join('；')}</p> : null}
            <details className="progress-drop-routes"><summary>获取途径与难度</summary><ul>{drop.routes.map((route, index) => <li key={index}><a href={route.url} target="_blank" rel="noreferrer">{route.via === 'bag' ? '开启宝藏袋' : '击败首领 / 对应部位'} <ArrowUpRight size={11}/></a>{route.modes.length ? ` · ${route.modes.map(mode => modeNames[mode] || mode).join(' / ')}` : ''}</li>)}</ul></details>
          </article>;
        })}{!drops.length ? <div className="progress-empty"><Star size={24}/><p>{filter === 'target' ? '还没有匹配的目标，点击战利品旁的星标即可添加。' : '没有匹配的战利品，可尝试切换筛选或搜索词。'}</p></div> : null}</div>
      </> : <div className="progress-empty">搜索并选择一场挑战，查看战利品。</div>}</div>
    </div>
    <div className="progress-footnotes"><p><Info size={14}/>「当前持有」统计角色背包、随身仓储与配装，不包含世界箱子。历史收集请手动标记；标记与目标按世界编号、世界名和角色名保存在本机，不改写游戏进度。</p><p>{loot.scope}</p><p>数据：Terraria {loot.gameVersion} · {loot.dataVersion} · <a href={loot.sourceUrl} target="_blank" rel="noreferrer">Terraria Wiki / Progress Tracker</a> · <a href={loot.licenseUrl} target="_blank" rel="noreferrer">{loot.license}</a></p></div>
  </section>;
}

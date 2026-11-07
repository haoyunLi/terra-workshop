import { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleHelp, Clock3, Gamepad2, Heart, Home, Info, MapPin, Navigation, Plus, Search, Users, X } from 'lucide-react';
import { Icon, Modal, Field } from './ui';
import { residentMatchesFilter, residentReportFor, residentStatusLabels, residentTeleportArgs } from './residentModel.mjs';
import './residents.css';

function ConditionMark({ status }) {
  return status === 'satisfied' ? <Check size={14}/> : status === 'unmet' ? <X size={14}/> : <CircleHelp size={14}/>;
}

export default function ResidentsPanel({ live, run, game, onConnect }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [housing, setHousing] = useState(null);
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const state = live.state;
  const canAct = state.connected && state.inWorld && state.worldControl && !state.player?.dead;
  const canTravel = state.connected && state.inWorld && [0, 1].includes(state.netMode) && !state.player?.dead;
  const local = game.townNpcs || [];
  const byId = useMemo(() => new Map(local.map(n => [n.id, n])), [local]);
  const residents = state.inWorld && state.connected ? state.npcs || [] : [];
  const residentByType = new Map(residents.map(n => [n.type, n]));
  const report = residentReportFor(state);
  const conditions = new Map((report?.entries || []).map(n => [n.id, n]));
  const term = search.toLowerCase().trim();
  const all = (state.townCatalog?.length ? state.townCatalog : local).map(n => ({ ...n, ...byId.get(n.id) }));
  const filtered = all.filter(n => (!term || `${n.name} ${n.english} ${n.id}`.toLowerCase().includes(term))
    && residentMatchesFilter(filter, residentByType.get(n.id), conditions.get(n.id)));
  const tabs = [['all', '全部居民'], ['absent', '尚未出现'], ['missing', '缺少条件'], ['ready', '前置已满足'], ['housing', '等待住房']];

  function openHousing(npc) {
    setHousing(npc);
    setX(state.player?.x ?? '');
    setY(state.player?.y ?? '');
  }

  return <section className="page-panel residents-page">
    <div className="page-title">
      <div><h2>为下一位居民准备好</h2><p>查看自然到访条件，找到居民的位置，再安排一个家。</p></div>
      {!state.inWorld && <button onClick={onConnect}><Gamepad2 size={17}/>游戏连接</button>}
    </div>
    <div className="resident-overview">
      <div><Users size={21}/><span><strong>{residents.length}</strong> 位居民在世界中</span></div>
      <div><Home size={21}/><span><strong>{residents.filter(n => residentMatchesFilter('housing', n)).length}</strong> 位等待住房</span></div>
      <div className="resident-refresh"><Clock3 size={16}/><span>{report ? `条件每 ${report.refreshSeconds || 5} 秒更新 · 缓存 ${Math.floor(report.ageSeconds || 0)} 秒` : '连接本机世界后读取条件'}</span></div>
    </div>
    <div className="resident-filter-bar">
      <div className="search"><Search size={18}/><input aria-label="搜索居民" placeholder="搜索名称或 NPC ID" value={search} onChange={e => setSearch(e.target.value)}/></div>
      <div className="resident-filter-tabs" aria-label="居民筛选">{tabs.map(([key, name]) => <button key={key} className={filter === key ? 'selected' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{name}</button>)}</div>
    </div>
    <div className="resident-list">{filtered.map(n => {
      const current = residentByType.get(n.id);
      const condition = conditions.get(n.id);
      const status = condition?.status || 'unknown';
      const requirements = condition?.requirements || [];
      const missing = requirements.filter(r => r.kind === 'prerequisite' && r.status === 'unmet');
      const teleport = current && residentTeleportArgs(current, state.world?.id);
      const visitor = [37, 368, 453].includes(n.id);
      return <article className="resident-card" key={n.id}>
        <div className="resident-card-main">
          <div className="resident-portrait"><Icon item={n} sheets={game.sheets} size={42}/></div>
          <div className="resident-info">
            <h3>{n.name}<span>#{n.id}</span></h3>
            <p>{current ? visitor ? '特殊访客 · 不使用普通住房' : current.homeless ? '已出现 · 等待住房' : `已入住 · 房间 ${current.homeX}, ${current.homeY}` : '当前世界未出现'}</p>
            {current && <small>{current.name} · 生命 {current.life} / {current.maxLife}</small>}
          </div>
          <span className={`resident-condition-badge ${current ? 'present' : status}`}><ConditionMark status={current ? 'satisfied' : status}/>{current ? '已在世界中' : residentStatusLabels[status]}</span>
        </div>
        {current ? <div className="resident-location"><MapPin size={14}/><span>位置 {current.x}, {current.y} 图格</span>{Number.isFinite(state.player?.x) && <span>距角色约 {Math.round(Math.hypot(current.x - state.player.x, current.y - state.player.y))} 格</span>}</div>
          : missing.length > 0 && <p className="resident-missing-hint">还需要：{missing.map(r => r.label).join('；')}</p>}
        <details className="resident-requirements">
          <summary><span><Info size={14}/>{current ? '查看自然到访条件' : status === 'unmet' ? `${missing.length} 项前置条件未满足` : status === 'satisfied' ? '前置已满足 · 仍需等待游戏到访' : '查看条件与获取方式'}</span><ChevronDown size={15}/></summary>
          <div className="resident-requirements-content">
            {requirements.length ? <ul>{requirements.map(r => <li className={r.status} key={r.key}><ConditionMark status={r.status}/><div><strong>{r.label}<em>{r.status === 'satisfied' ? '已满足' : r.status === 'unmet' ? '未满足' : '待确认'}</em></strong>{r.detail && <p>{r.detail}</p>}{r.status !== 'satisfied' && r.missingNpcIds?.length > 0 && <p>尚缺：{r.missingNpcIds.map(id => byId.get(id)?.name || `NPC #${id}`).join('、')}</p>}</div></li>)}</ul>
              : <p className="muted">{!state.inWorld ? '进入游戏世界后查看已满足与缺少的条件。' : '当前连接没有可核验的条件数据，暂记为未知。'}</p>}
            {condition?.note && <p className="resident-condition-note">{condition.note}</p>}
            {!visitor && <p className="resident-housing-note"><Home size={14}/>空房与环境未扫描。使用「安排住房」时由游戏验证；已分配住房坐标也不代表此刻重新验证过。</p>}
          </div>
        </details>
        <div className="resident-card-actions">{current ? <>
          <button className="resident-travel" disabled={!canTravel || live.busy || !teleport} onClick={() => run('teleport', teleport)}><Navigation size={14}/>前往居民</button>
          <button disabled={!canAct || live.busy} onClick={() => run('moveNpc', { index: current.index })}><MapPin size={14}/>移到身边</button>
          <button disabled={!canAct || live.busy || current.life >= current.maxLife} onClick={() => run('healNpc', { index: current.index })}><Heart size={14}/>治疗</button>
          {!visitor && <><button disabled={!canAct || live.busy || !state.capabilities?.findHome} onClick={() => run('findHome', { index: current.index })}>自动找房</button><button disabled={!canAct || live.busy || !state.capabilities?.housing} onClick={() => openHousing(current)}><Home size={14}/>安排住房</button></>}
        </> : <><span>可跳过自然到访条件</span><button className="primary" disabled={!canAct || live.busy} onClick={() => run('spawnNpc', { type: n.id, findHome: !visitor })}><Plus size={15}/>强制召唤{visitor ? '' : '并找房'}</button></>}</div>
      </article>;
    })}</div>
    {!filtered.length && <div className="empty"><Search size={28}/><h3>没有符合筛选的居民</h3><p>试试其他筛选，或搜索中文、英文名称与数字 ID。</p></div>}
    <div className="notice"><Info size={18}/><p>{report?.note || '多人房间的条件数据需要本机主机连接。'} 1.4.5 中无房居民也可能白天到访，并在夜间离开。「强制召唤」跳过自然条件，仍由游戏处理住房与保存。</p></div>
    {housing && <Modal title={`安排 ${byId.get(housing.type)?.name || housing.name} 的住房`} onClose={() => setHousing(null)}>
      <p className="muted">让角色站进准备好的空房，使用当前坐标；也可输入房间内部的图格坐标。</p>
      <div className="form-grid"><Field label="房间 X（图格）"><input aria-label="住房 X" type="number" value={x} onChange={e => setX(e.target.value)}/></Field><Field label="房间 Y（图格）"><input aria-label="住房 Y" type="number" value={y} onChange={e => setY(e.target.value)}/></Field></div>
      <div className="modal-actions"><button onClick={() => { setX(state.player?.x ?? ''); setY(state.player?.y ?? ''); }}><MapPin size={16}/>使用角色位置</button><button className="primary" disabled={!canAct || live.busy || x === '' || y === '' || !Number.isInteger(Number(x)) || !Number.isInteger(Number(y))} onClick={async () => { try { await run('houseNpc', { index: housing.index, x: Number(x), y: Number(y) }, true); setHousing(null); } catch {} }}><Check size={16}/>入住此房间</button></div>
    </Modal>}
  </section>;
}

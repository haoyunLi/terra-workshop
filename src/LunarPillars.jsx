import { useState } from 'react';
import { Sparkles, Play, MapPin, Info, Moon, Shield } from 'lucide-react';
import { Icon, Modal } from './ui';

const pillars = [
  { key: 'solar', name: '日耀柱', item: 3458, className: '近战', description: '日耀碎片 · 炽热的近战力量' },
  { key: 'vortex', name: '星旋柱', item: 3456, className: '远程', description: '星旋碎片 · 异星的远程力量' },
  { key: 'nebula', name: '星云柱', item: 3457, className: '魔法', description: '星云碎片 · 浩瀚的魔法力量' },
  { key: 'stardust', name: '星尘柱', item: 3459, className: '召唤', description: '星尘碎片 · 群星的召唤力量' },
];

function PillarSigil() {
  return <svg className="pillar-sigil" viewBox="0 0 80 115" fill="none" aria-hidden="true">
    <path d="M40 6 58 30 50 46H30L22 30 40 6Z" fill="currentColor" opacity=".14"/>
    <path d="m40 6 18 24-8 16H30L22 30 40 6Zm0 0v40M22 30l18 8 18-8" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M28 52h24l5 8-6 8H29l-6-8 5-8Zm2 21h20v7H30v-7Zm0 12h20l-3 9H33l-3-9Zm3 14h14l-7 11-7-11Z" fill="currentColor" opacity=".7"/>
    <path d="M15 53 8 61l7 9M65 53l7 8-7 9M9 30h7M64 30h7" stroke="currentColor" strokeWidth="1.5" opacity=".5"/>
    <circle cx="40" cy="60" r="3" fill="#16282d"/>
  </svg>;
}

function Meter({ label, value, maximum, known }) {
  const percent = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  return <div className="pillar-meter"><div><span>{label}</span><strong>{known ? `${value.toLocaleString()} / ${maximum.toLocaleString()}` : '—'}</strong></div><div className="pillar-track"><i style={{ width: known ? `${percent}%` : '0%' }}/></div></div>;
}

export function LunarPillars({ live, game, run }) {
  const [confirm, setConfirm] = useState(false);
  const state = live.state;
  const lunar = state.events?.lunar;
  const available = state.connected && state.inWorld && !state.player?.dead && state.worldControl && !live.busy;
  const supported = !!state.capabilities?.lunarEvents;
  const countdown = lunar?.countdown || 0;
  const blocked = !!lunar?.active || countdown > 0 || !!state.bosses?.length;
  const startEnabled = available && supported && state.world?.hardmode && !blocked;
  const statusText = countdown > 0 ? '天界四柱已被击败，月亮领主即将降临。'
    : lunar?.active ? '四座天界柱已降临世界，击败周围的敌怪可以削弱对应护盾。'
      : state.inWorld && !state.world?.hardmode ? '进入困难模式后，可以开启天界事件。'
        : state.inWorld && !supported ? '通过新版工坊重新启动游戏后，可以使用天界四柱。'
          : '同时开启日耀、星旋、星云、星尘四座天界柱，按原版规则推进最终挑战。';

  return <div className="lunar-page">
    <div className="lunar-overview"><div><span className="eyebrow">THE LUNAR EVENTS</span><h3>四柱降临，终局将至</h3><p>{statusText}</p></div><button className="primary" disabled={!startEnabled} onClick={() => setConfirm(true)}><Play size={16}/>{countdown > 0 ? '等待月亮领主' : lunar?.active ? '天界事件进行中' : '开启天界四柱'}</button></div>
    {countdown > 0 ? <div className="lunar-countdown"><Moon size={27}/><div><b>月亮领主即将降临</b><p>原版世界事件正在倒计时，请准备好战斗。</p></div><strong>{countdown}<small> 秒</small></strong></div> : null}
    <div className="lunar-grid">{pillars.map(definition => {
      const current = lunar?.pillars?.find(pillar => pillar.key === definition.key);
      const known = !!current?.active;
      const hasLocation = Number.isFinite(current?.x) && Number.isFinite(current?.y) && current?.maxLife > 0;
      const status = known ? current.shield > 0 ? '护盾保护中' : '护盾已解除' : current?.defeated ? '已击败' : '等待降临';
      return <article className={`pillar-card pillar-${definition.key}`} key={definition.key}>
        <div className="pillar-art"><PillarSigil/><span className="pillar-fragment"><Icon item={game.items.find(item => item.id === definition.item)} sheets={game.sheets} size={27}/></span></div>
        <div className="pillar-content"><div className="pillar-heading"><h3>{definition.name}</h3><span>{definition.className} · {status}</span></div><p>{definition.description}</p>
          <Meter label="剩余护盾" value={current?.shield || 0} maximum={current?.maxShield || 0} known={known}/>
          <Meter label="天界柱生命" value={current?.life || 0} maximum={current?.maxLife || 0} known={known}/>
          {hasLocation ? <p className="pillar-position">位置 {current.x}, {current.y} 图格</p> : null}
          <button aria-label={`前往${definition.name}附近`} disabled={!available || !known || !hasLocation} onClick={() => run('teleport', { x: Math.round(current.x) + 12, y: Math.round(current.y), worldId: state.world.id })}><MapPin size={13}/>前往附近</button>
        </div>
      </article>;
    })}</div>
    <div className="notice"><Shield size={17}/><p>击败对应区域的敌怪会削弱护盾，护盾归零后可攻击天界柱。四柱全部被击败后，原版游戏会继续召唤月亮领主。柱形图案为工坊设计，右上角展示对应碎片。</p></div>
    <div className="notice"><Info size={17}/><p>开启后将保留原版世界进度，普通事件的「结束」按钮不会取消天界事件。传送会检查边界和方块碰撞，抵达后仍需应对附近敌怪。</p></div>
    {confirm ? <Modal title="开启天界四柱" onClose={() => setConfirm(false)}><p className="modal-body">将在当前世界同时生成日耀柱、星旋柱、星云柱和星尘柱，并开启原版天界事件。击败全部四柱会继续触发月亮领主。建议提前在「存档备份」中保留当前进度。</p><div className="modal-actions"><button onClick={() => setConfirm(false)}>取消</button><button className="primary" onClick={() => { setConfirm(false); run('event', { key: 'lunar' }); }}><Sparkles size={16}/>确认开启四柱</button></div></Modal> : null}
  </div>;
}

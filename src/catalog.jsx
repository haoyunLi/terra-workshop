import { useDeferredValue, useMemo, useState, useEffect } from 'react';
import { Search, LayoutGrid, List, Star, ChevronLeft, ChevronRight, Plus, Minus, Backpack, Trash2, Info, ArrowUpRight, Clock3, Package, Sparkles, Check } from 'lucide-react';
import { Icon, Field, rarityColors } from './ui';
import { GROUPS } from '../core/player.mjs';
import { materialCounts, missingRecipeMaterials } from '../core/recipe-materials.mjs';

const categories = ['全部', '武器', '工具', '装备', '饰品', '材料', '消耗品', '建筑'];
const preferred = [4956, 757, 3065, 3063, 3541, 1553, 1260, 3389, 3531, 3570, 3384, 3031];
const recentStorageKey = 'terra-recent-items-v1';

function readRecentItems() {
  try {
    const value = JSON.parse(localStorage.getItem(recentStorageKey) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter(Number.isInteger))].slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function Catalog({ game, selected, setSelected, counts, favorites, toggleFavorite, player, multiplayer = false, busy = false, onPin, onAdd, onRemove, onSupply }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const [ownership, setOwnership] = useState('all');
  const [sort, setSort] = useState('featured');
  const [list, setList] = useState(false);
  const [page, setPage] = useState(0);
  const [recent, setRecent] = useState(readRecentItems);
  const term = useDeferredValue(search.trim().toLowerCase());
  const items = useMemo(() => {
    const filtered = game.items.filter(item => {
      const matchesOwnership = ownership === 'all'
        || ownership === 'owned' && counts.has(item.id)
        || ownership === 'missing' && !counts.has(item.id)
        || ownership === 'favorites' && favorites.includes(item.id)
        || ownership === 'recent' && recent.includes(item.id);
      return (!term || item.search.includes(term)) && (category === '全部' || item.category === category) && matchesOwnership;
    });
    if (ownership === 'recent') return filtered.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    if (sort === 'name') return filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    if (sort === 'rare') return filtered.sort((a, b) => b.rarity - a.rarity || a.id - b.id);
    if (sort === 'owned') return filtered.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.id - b.id);
    if (sort === 'featured') return filtered.sort((a, b) => {
      const aRank = preferred.indexOf(a.id);
      const bRank = preferred.indexOf(b.id);
      return (aRank < 0 ? 99999 : aRank) - (bRank < 0 ? 99999 : bRank) || a.id - b.id;
    });
    return filtered;
  }, [game, term, category, ownership, sort, counts, favorites, recent]);

  useEffect(() => setPage(0), [term, category, ownership, sort]);
  function chooseItem(item) {
    setSelected(item);
    const next = [item.id, ...recent.filter(id => id !== item.id)].slice(0, 40);
    setRecent(next);
    try { localStorage.setItem(recentStorageKey, JSON.stringify(next)); } catch { /* Browsing remains available when storage is full. */ }
  }
  const last = Math.max(0, Math.ceil(items.length / 48) - 1);
  const current = Math.min(page, last);
  const visible = items.slice(current * 48, current * 48 + 48);

  return <div className="workspace">
    <section className="catalog-panel">
      <div className="collection-heading"><div><span className="eyebrow">THE ITEM COLLECTION</span><h2>你的冒险，随取所需</h2></div><span className="collection-count"><Package size={15}/>{game.items.length.toLocaleString()}<small>件物品</small></span></div>
      <div className="catalog-controls">
        <div className="search"><Search size={19}/><input aria-label="搜索物品" placeholder="搜索物品名称、英文或 ID…" value={search} onChange={event => setSearch(event.target.value)}/><kbd>/</kbd></div>
        <div className="collection-shortcuts" aria-label="物品集合筛选">
          <button className={ownership === 'all' ? 'active' : ''} onClick={() => setOwnership('all')}><LayoutGrid size={14}/>全部物品</button>
          <button className={ownership === 'favorites' ? 'active' : ''} onClick={() => setOwnership('favorites')}><Star size={14}/>收藏<span>{favorites.length}</span></button>
          <button className={ownership === 'recent' ? 'active' : ''} onClick={() => setOwnership('recent')}><Clock3 size={14}/>最近浏览</button>
        </div>
        <div className="category-tabs">{categories.map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>)}<select aria-label="更多物品分类" value={categories.includes(category) ? '' : category} onChange={event => setCategory(event.target.value || '全部')}><option value="">更多</option>{['弹药', '坐骑', '宠物', '染料', '其他'].map(value => <option key={value}>{value}</option>)}</select></div>
      </div>
      <div className="catalog-toolbar"><div><strong>{ownership === 'recent' ? '最近浏览' : ownership === 'favorites' ? '我的收藏' : category === '全部' ? '探索物品' : category}</strong><span>{items.length.toLocaleString()} 件</span></div><div className="view-controls"><select aria-label="拥有状态筛选" value={ownership} onChange={event => setOwnership(event.target.value)}><option value="all">全部状态</option><option value="owned" disabled={!player}>已拥有</option><option value="missing" disabled={!player}>未拥有</option><option value="favorites">我的收藏</option><option value="recent">最近浏览</option></select><select aria-label="物品排序" value={sort} disabled={ownership === 'recent'} onChange={event => setSort(event.target.value)}><option value="featured">精选排序</option><option value="id">物品 ID</option><option value="rare">稀有度</option><option value="name">名称</option><option value="owned" disabled={!player}>拥有数量</option></select><button title="网格视图" aria-label="网格视图" className={!list ? 'active' : ''} onClick={() => setList(false)}><LayoutGrid size={16}/></button><button title="列表视图" aria-label="列表视图" className={list ? 'active' : ''} onClick={() => setList(true)}><List size={17}/></button></div></div>
      <div className={`item-grid ${list ? 'list-view' : ''}`}>{visible.map(item => <div className={`item-tile ${selected.id === item.id ? 'selected' : ''}`} style={{ '--rarity': rarityColors[item.rarity] || '#aebec9' }} key={item.id}>
        <button className="item-select" onClick={() => chooseItem(item)} aria-label={`选择 ${item.name}`} aria-pressed={selected.id === item.id}><Icon item={item} sheets={game.sheets} size={list ? 36 : 60}/><span className="tile-name">{item.name}</span><span className="tile-id">#{item.id}{counts.has(item.id) ? <em><Check size={10}/>{counts.get(item.id).toLocaleString()}</em> : null}</span></button>
        <span className="tile-rarity" aria-hidden="true"/>
        <button className={`favorite-btn ${favorites.includes(item.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(item.id) ? '取消收藏' : '收藏'} ${item.name}`} onClick={() => toggleFavorite(item.id)}><Star size={14} fill={favorites.includes(item.id) ? 'currentColor' : 'none'}/></button>
      </div>)}{!visible.length ? <div className="empty"><Search size={32}/><h3>{ownership === 'recent' ? '从一件喜欢的物品开始' : '没有找到物品'}</h3><p>{ownership === 'recent' ? '点击浏览过的物品会保存在这里。' : '试试其他名称、ID 或筛选条件。'}</p><button onClick={() => { setSearch(''); setCategory('全部'); setOwnership('all'); }}>浏览全部物品</button></div> : null}</div>
      <div className="pagination"><span>{items.length ? current * 48 + 1 : 0}–{Math.min((current + 1) * 48, items.length)} / {items.length.toLocaleString()}</span><div><button aria-label="上一页" disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/></button><span>{current + 1} / {last + 1}</span><button aria-label="下一页" disabled={current >= last} onClick={() => setPage(current + 1)}><ChevronRight size={18}/></button></div></div>
    </section>
    <Inspector {...{ game, selected, player, multiplayer, busy, onPin, counts, onAdd, onRemove, onSupply }}/>
  </div>;
}

export function Inspector({ game, selected: item, player, multiplayer = false, busy = false, onPin, counts, onAdd, onRemove, onSupply }) {
  const [quantity, setQuantity] = useState(1);
  const [prefix, setPrefix] = useState(0);
  const [group, setGroup] = useState('inventory');
  const [oversize, setOversize] = useState(false);
  const [tab, setTab] = useState('info');
  const [recipes, setRecipes] = useState(null);
  const [recipeError, setRecipeError] = useState(false);
  useEffect(() => { setPrefix(0); setQuantity(1); }, [item.id]);
  useEffect(() => {
    if (tab !== 'recipes' || recipes || recipeError) return;
    let canceled = false;
    fetch('./data/recipes.json').then(response => {
      if (!response.ok) throw Error('recipe load failed');
      return response.json();
    }).then(value => { if (!canceled) setRecipes(value); }).catch(() => { if (!canceled) setRecipeError(true); });
    return () => { canceled = true; };
  }, [tab, recipes, recipeError]);
  const byKey = useMemo(() => new Map(game.items.map(value => [value.key, value])), [game]);
  const recipeCounts = useMemo(() => materialCounts(player), [player]);
  const resultRecipes = recipes?.recipes.filter(recipe => recipe.result === item.key) || [];
  const prefixList = player?.version < 315 ? game.prefixes.filter(value => value.id <= 84) : game.prefixes;
  const validQuantity = Number.isInteger(Number(quantity)) && Number(quantity) >= 1 && Number(quantity) <= 2147483647;
  const statsLabels = { damage: '基础伤害', damageType: '伤害类型', defense: '防御', critical: '暴击率 %', knockback: '击退', mana: '魔力消耗', pickaxePower: '镐力 %', axePower: '斧力 %', hammerPower: '锤力 %' };

  return <aside className="inspector">
    <div className="inspector-label"><Sparkles size={13}/><span>物品工作台</span><span>#{item.id}</span></div>
    <div className="item-hero" style={{ '--rarity': rarityColors[item.rarity] || '#aebec9' }}><div className="item-display"><Icon item={item} sheets={game.sheets} size={88}/></div><h2>{item.name}</h2><p>{item.english}</p><div className="item-badges"><span>{item.category}</span><span style={{ color: rarityColors[item.rarity] || '#c7d2e0' }}>稀有度 {item.rarity}</span><span>堆叠 {item.maxStack.toLocaleString()}</span></div></div>
    <div className="inspector-edit">
      <div className="quantity-row"><label htmlFor="quantity">获得数量</label><div className="stepper"><button aria-label="减少数量" onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}><Minus size={16}/></button><input id="quantity" aria-label="添加数量" type="number" min="1" max="2147483647" step="1" value={quantity} onChange={event => setQuantity(event.target.value)}/><button aria-label="增加数量" onClick={() => setQuantity(Math.min(2147483647, Number(quantity) + 1))}><Plus size={16}/></button></div></div>
      <div className="quantity-presets">{[1, 99, 9999].map(value => <button key={value} className={Number(quantity) === value ? 'active' : ''} onClick={() => setQuantity(value)}>{value.toLocaleString()}</button>)}<button onClick={() => setQuantity(item.maxStack)}>一组</button></div>
      <div className="item-edit-fields"><Field label="词缀"><select aria-label="词缀" value={prefix} onChange={event => setPrefix(Number(event.target.value))}>{prefixList.map(value => <option key={value.id} value={value.id}>{value.name}{value.id ? ` · ${value.id}` : ''}</option>)}</select></Field><Field label="放入位置"><select aria-label="目标位置" value={group} onChange={event => setGroup(event.target.value)}>{['inventory', 'piggyBank', 'safe', 'defendersForge', 'voidVault'].map(key => <option key={key} value={key}>{GROUPS[key]}</option>)}</select></Field></div>
      <label className="check-line"><input type="checkbox" checked={oversize && !multiplayer} disabled={multiplayer} onChange={event => setOversize(event.target.checked)}/>单槽超堆叠{multiplayer ? '（多人禁用）' : ''}<span title="游戏可能在加载或使用时修正超过原生限制的堆叠。"><Info size={13}/></span></label>
      <button className="primary add-button" disabled={!player || busy || !validQuantity} onClick={() => onAdd(item, group, Number(quantity), prefix, oversize && !multiplayer)}><Plus size={19}/>立即获得物品<ArrowUpRight size={17}/></button>
      {onPin ? <button className="pin-item-button" disabled={!validQuantity} onClick={() => onPin(item, group, Number(quantity), prefix)}><Star size={14}/>加入常用快捷栏</button> : null}
      {counts.has(item.id) ? <div className="owned-line"><span><Backpack size={13}/>已拥有 {counts.get(item.id).toLocaleString()} 个</span><button disabled={busy || !player} onClick={() => onRemove(item)}><Trash2 size={13}/>全部移除</button></div> : <small className="helper"><Info size={13}/>{player ? '超过原生堆叠上限时自动分槽。' : '进入游戏世界后即可实时获得。'}</small>}
      <p className="inline-item-intro">{item.description}</p>
    </div>
    <div className="detail-tabs"><button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>物品属性</button><button className={tab === 'recipes' ? 'active' : ''} onClick={() => setTab('recipes')}>配方与材料</button></div>
    <div className="item-description">{tab === 'info' ? <>{item.unobtainable ? <p className="warning-text">内部或非正常获取物品，游戏可能转换或移除。</p> : null}<dl>{Object.entries(item.stats).map(([key, value]) => <div key={key}><dt>{statsLabels[key] || key}</dt><dd>{value}</dd></div>)}<div><dt>原生堆叠</dt><dd>{item.maxStack.toLocaleString()}</dd></div>{item.introduced ? <div><dt>加入版本</dt><dd>{item.introduced}</dd></div> : null}</dl><a href={`https://terraria.wiki.gg/zh/wiki/${encodeURIComponent(item.name)}`} target="_blank" rel="noreferrer">查看中文 Wiki <ArrowUpRight size={14}/></a><small>介绍由物品属性整理，非逐字游戏提示。</small></> : recipeError ? <div><p>本地配方读取失败。</p><button onClick={() => setRecipeError(false)}>重新读取</button></div> : !recipes ? <p>正在读取本地配方…</p> : !resultRecipes.length ? <p>暂无收录配方，可从物品介绍查看其他获取方式。</p> : <>{resultRecipes.map((recipe, index) => <RecipeCard key={`${item.id}-${index}`} {...{ recipe, recipes, game, byKey, player, busy, onSupply }} counts={recipeCounts}/>)}</>}</div>
  </aside>;
}

function RecipeCard({ recipe, recipes, game, byKey, counts, player, busy, onSupply }) {
  const [choices, setChoices] = useState({});
  const rows = recipe.ingredients.map((ingredient, index) => {
    const options = (recipes.groups?.[ingredient.group]?.items || []).map(key => byKey.get(key)).filter(Boolean);
    const selected = choices[index] || options.find(item => counts.has(item.id))?.key || options[0]?.key;
    return { ingredient, options, item: byKey.get(ingredient.item || selected), selected, index };
  });
  const missing = missingRecipeMaterials(rows, counts);
  const resolved = rows.every(row => row.item && Number.isInteger(row.ingredient.amount) && row.ingredient.amount > 0);
  return <section className="recipe">
    <div className="recipe-heading"><strong>每次产出 {recipe.amount} 个</strong>{player && resolved ? <span className={missing.length ? 'condition-warn' : 'condition-ok'}>{missing.length ? `缺 ${missing.length} 种材料` : '材料已集齐'}</span> : null}</div>
    {rows.map(row => <div className="recipe-ingredient" key={row.index}><Icon item={row.item} sheets={game.sheets} size={27}/><div>{row.options.length ? <select aria-label={`选择第 ${row.index + 1} 项同类材料`} value={row.selected} onChange={event => setChoices({ ...choices, [row.index]: event.target.value })}>{row.options.map(item => <option key={item.id} value={item.key}>{item.name}</option>)}</select> : <span>{row.item?.name || row.ingredient.item || row.ingredient.group || '任意同类材料'}</span>}{player && row.item ? <small>已拥有 {counts.get(row.item.id) || 0}</small> : null}</div><b>×{row.ingredient.amount}</b></div>)}
    <small>制作站 · {recipe.stations.map(key => recipes.stations[key]?.items?.map(item => byKey.get(item)?.name).filter(Boolean).join(' / ') || key).join('、') || '徒手'}</small>
    {onSupply ? <button className="recipe-supply" disabled={!player || busy || !resolved || !missing.length} onClick={() => onSupply(missing)}><Package size={14}/>{player && resolved && !missing.length ? '当前材料已齐备' : '补齐一次合成的材料'}</button> : null}
    <small className="recipe-note">按背包与随身仓储持有量统计，补齐到主背包。仓储材料需在游戏内取出或满足原生访问条件，制作站需自行准备。选择同类材料后按该种类计算。</small>
  </section>;
}

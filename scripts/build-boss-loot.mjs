// Rebuild: node scripts/build-boss-loot.mjs /path/to/Terraria-Progress-Tracker/pipeline/data_readable
// Wiki-derived data retains CC BY-NC-SA 4.0; see THIRD_PARTY_NOTICES.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const upstream = process.argv[2];
if (!upstream) throw Error('Pass the upstream pipeline/data_readable directory.');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async name => JSON.parse(await fs.readFile(path.join(upstream, `${name}.json`), 'utf8'));
const [sourceBosses, sourceDrops, sourceItems, meta, game] = await Promise.all([
  read('bosses'), read('drops'), read('items'), read('meta'),
  fs.readFile(path.join(root, 'public/data/game.json'), 'utf8').then(JSON.parse),
]);
const definitions = [
  ['kingSlime','king-slime','史莱姆王',560],['eye','eye-of-cthulhu','克苏鲁之眼',43],
  ['eater','eater-of-worlds','世界吞噬怪',70],['brain','brain-of-cthulhu','克苏鲁之脑',1331],
  ['queenBee','queen-bee','蜂王',1133],['skeletron','skeletron','骷髅王',1307],
  ['deerclops','deerclops','独眼巨鹿',5120],['wall','wall-of-flesh','血肉墙',267],
  ['queenSlime','queen-slime','史莱姆皇后',4988],['twins','the-twins','双子魔眼',544],
  ['destroyer','the-destroyer','毁灭者',556],['prime','skeletron-prime','机械骷髅王',557],
  ['plantera','plantera','世纪之花',1293],['golem','golem','石巨人',1293],
  ['duke','duke-fishron','猪龙鱼公爵',2673],['empress','empress-of-light','光之女皇',4961],
  ['cultist','lunatic-cultist','拜月教邪教徒',3549],['moonLord','moon-lord','月亮领主',3601],
  ['solar','solar-pillar','日耀柱',3458],['vortex','vortex-pillar','星旋柱',3456],
  ['nebula','nebula-pillar','星云柱',3457],['stardust','stardust-pillar','星尘柱',3459],
];
const byKey = new Map(game.items.map(item => [item.key, item]));
const sourceByKey = new Map(sourceItems.map(item => [item.key, item]));
const desktop = value => !value.platforms?.length || value.platforms.includes('desktop');
const conditions = {
  'seed-no-dungeon': '世界没有地牢时的特殊掉落，完整条件见 Wiki',
  'seed-no-hellforge': '世界缺少地狱熔炉时的特殊掉落，完整条件见 Wiki',
  'seed-remix': '混合世界（Remix）种子',
  'same-day': '在同一个游戏日击败克苏鲁之眼与血肉墙',
  'no-altar': '世界没有祭坛并满足额外条件，见 Wiki',
  'seed-no-temple': '世界没有神庙时的特殊掉落，完整条件见 Wiki',
  'no-demon-heart': '尚未使用恶魔之心',
  'no-portal-gun': '背包中没有传送枪',
};
const bosses = definitions.map(([key, slug, name, item]) => {
  const source = sourceBosses.bosses.find(boss => boss.id === slug);
  if (!source) throw Error(`Missing source boss ${slug}`);
  const drops = [];
  for (const [itemKey, records] of Object.entries(sourceDrops.items)) {
    const gameItem = byKey.get(itemKey), sourceItem = sourceByKey.get(itemKey);
    if (!gameItem || !sourceItem || !desktop(sourceItem) || sourceBosses.ignoreItems.includes(itemKey)) continue;
    const routes = records.filter(record => source.sources.includes(record.source) && desktop(record) && desktop(sourceDrops.sources[record.source] || {})).map(record => {
      const venue = sourceDrops.sources[record.source];
      const notes = (record.conditions || []).map(condition => {
        if (!conditions[condition]) throw Error(`Untranslated condition ${condition}`);
        return conditions[condition];
      });
      if (itemKey === 'EmpressBlade') notes.push('对光之女皇造成的全部伤害必须发生在白天'); // Wiki Terraprisma introduction.
      if (record.note && !record.conditions?.length) notes.push(['GrenadeLauncher','RocketI'].includes(itemKey)
        ? '经典模式首次击败世纪之花时必定掉落；之后仍有机会获得' : '特殊掉落条件见 Wiki');
      return { via: venue.kind === 'bag' ? 'bag' : 'boss', modes: record.modes || [], notes, url: venue.url };
    });
    if (routes.length) drops.push({ id: gameItem.id, key: itemKey, url: sourceItem.url, routes: [...new Map(routes.map(route => [JSON.stringify(route), route])).values()] });
  }
  drops.sort((a,b) => a.id - b.id);
  return { key, name, english: source.name, stage: source.stage === 'event' ? 'pillars' : source.stage, item, url: sourceDrops.sources[slug].url, drops };
});
const result = {
  version: 1, gameVersion: meta.gameVersion, dataVersion: meta.dataVersion,
  source: 'Terraria Wiki via Terraria Progress Tracker',
  sourceUrl: 'https://github.com/Doeschi/Terraria-Progress-Tracker',
  license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  scope: '18 位首领与天界四柱的桌面版掉落及宝藏袋内容，基于所标注日期的数据；不含钱币和常规治疗药水。特殊种子、难度与额外条件见各物品 Wiki。此清单不表示每次击败都会获得全部物品。',
  bosses,
};
await fs.writeFile(path.join(root, 'public/data/boss-loot.json'), `${JSON.stringify(result)}\n`);
console.log(`Wrote ${bosses.length} encounters and ${new Set(bosses.flatMap(boss => boss.drops.map(drop => drop.id))).size} distinct items.`);

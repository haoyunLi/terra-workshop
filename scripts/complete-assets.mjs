import fs from 'node:fs/promises';
const file='public/data/game.json',game=JSON.parse(await fs.readFile(file,'utf8'));
const source=JSON.parse(await fs.readFile('../item-reference/web/public/data/sprites.json','utf8'));
const explicit={6135:'Demon_Altar_%28item%29.png',6136:'Crimson_Altar_%28item%29.png',6150:'Chillet.png',6151:'Chillet_Ignis.png'};
const names={3705:'假宝箱（内部）',3706:'假宝箱 2（内部）',3847:'食人魔面具',3848:'哥布林面具',3849:'哥布林投弹手帽',3850:'埃特尼亚标枪',3851:'狗头人炸药背包',3853:'无聊弓（内部）',3861:'食人魔宝藏袋',3862:'黑暗魔法师宝藏袋',3978:'纯色染料',4143:'魔力斗篷星星',4722:'第一分形',5013:'睡眠图标（内部）',6135:'恶魔祭坛图标',6136:'猩红祭坛图标',6143:'火绒狐特效（内部）'};
const results=await Promise.allSettled(game.items.filter(i=>!i.sprite).map(async item=>{
  const icon=explicit[item.id]||item.iconName;
  if(source.icons[icon]){item.sprite=source.icons[icon];return;}
  const response=await fetch('https://terraria.wiki.gg/images/'+icon,{signal:AbortSignal.timeout(12000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('image/png'))throw Error(`${item.id}: HTTP ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(`public/icons/item-${item.id}.png`,bytes);item.iconFile=`icons/item-${item.id}.png`;
}));
for(const item of game.items){
  if(names[item.id]){item.name=names[item.id];item.search=`${item.name} ${item.english} ${item.key} ${item.id}`.toLowerCase();item.description=`${item.name}是游戏中的内部、旧版或即时效果物品。此条目用于查看和识别物品 ID；不适合作为普通背包资源，游戏可能在加载时移除或转换。`;}
}
await fs.writeFile(file,JSON.stringify(game));
console.log(JSON.stringify({total:game.items.length,withIcons:game.items.filter(x=>x.sprite||x.iconFile).length,missing:game.items.filter(x=>!x.sprite&&!x.iconFile).map(i=>[i.id,i.name]),failures:results.filter(x=>x.status==='rejected').map(x=>x.reason.message)},null,2));

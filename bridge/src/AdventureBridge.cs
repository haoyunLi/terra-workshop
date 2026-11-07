using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using HarmonyLib;

namespace TerraWorkshop {
  [HarmonyPatch]
  public static class WorkshopSpawnPatch {
    public static bool Prepare(){try{return R.Method(R.T("Terraria.NPC"),"SpawnNPC");}catch{return false;}}
    public static MethodBase TargetMethod(){return R.T("Terraria.NPC").GetMethods(R.All).First(m=>m.Name=="SpawnNPC"&&m.IsStatic&&m.GetParameters().Length==0);}
    public static bool Prefix(){return !Bridge.NaturalSpawnsPaused;}
  }
  public static partial class Bridge {
    private sealed class BossSpec {
      public string Key,Name,Condition,Description; public int[] Types;public int Item;public bool Night,Jungle,Hallow,Ocean,Underworld,Evil,Temple,Hardmode;
    }
    private static readonly BossSpec[] Bosses={
      new BossSpec{Key="kingSlime",Name="史莱姆王",Types=new[]{50},Item=560,Condition="地表开阔区域",Description="适合熟悉走位的首领。主要战利品：史莱姆坐骑、忍者装备。"},
      new BossSpec{Key="eye",Name="克苏鲁之眼",Types=new[]{4},Item=43,Night=true,Condition="夜晚",Description="会冲刺的巨大眼球。主要战利品：邪恶矿石与克苏鲁之盾（专家）。"},
      new BossSpec{Key="eater",Name="世界吞噬怪",Types=new[]{13},Item=70,Evil=true,Condition="腐化之地",Description="分节蠕虫首领。主要战利品：魔矿与暗影鳞片。"},
      new BossSpec{Key="brain",Name="克苏鲁之脑",Types=new[]{266},Item=1331,Evil=true,Condition="猩红之地",Description="幻影与飞眼组成的首领战。主要战利品：猩红矿与组织样本。"},
      new BossSpec{Key="queenBee",Name="蜂王",Types=new[]{222},Item=1133,Jungle=true,Condition="丛林，推荐地下蜂巢",Description="会冲刺和召唤小蜜蜂。主要战利品：蜜蜂武器与养蜂人。"},
      new BossSpec{Key="skeletron",Name="骷髅王",Types=new[]{35},Item=1307,Night=true,Condition="夜晚，推荐地牢入口",Description="头部和双手组成的首领。击败后可正常探索地牢。"},
      new BossSpec{Key="deerclops",Name="独眼巨鹿",Types=new[]{668},Item=5120,Condition="推荐雪原开阔场地",Description="来自联动内容的首领。主要战利品：眼骨与联动武器。"},
      new BossSpec{Key="wall",Name="血肉墙",Types=new[]{113},Item=267,Underworld=true,Condition="地狱；击败会将世界推进困难模式",Description="横穿地狱的首领。主要战利品：神锤与职业徽章。"},
      new BossSpec{Key="queenSlime",Name="史莱姆皇后",Types=new[]{657},Item=4988,Hallow=true,Hardmode=true,Condition="困难模式 · 神圣之地",Description="拥有飞行阶段的史莱姆首领。主要战利品：水晶刺客装备。"},
      new BossSpec{Key="twins",Name="双子魔眼",Types=new[]{125,126},Item=544,Night=true,Hardmode=true,Condition="困难模式 · 夜晚",Description="两只协同攻击的机械眼球。主要战利品：视域之魂与神圣锭。"},
      new BossSpec{Key="destroyer",Name="毁灭者",Types=new[]{134},Item=556,Night=true,Hardmode=true,Condition="困难模式 · 夜晚",Description="巨型机械蠕虫。主要战利品：力量之魂与神圣锭。"},
      new BossSpec{Key="prime",Name="机械骷髅王",Types=new[]{127},Item=557,Night=true,Hardmode=true,Condition="困难模式 · 夜晚",Description="拥有多条机械手臂。主要战利品：恐惧之魂与神圣锭。"},
      new BossSpec{Key="plantera",Name="世纪之花",Types=new[]{262},Item=1293,Jungle=true,Hardmode=true,Condition="困难模式 · 地下丛林",Description="需要地下丛林战斗场地。主要战利品：神庙钥匙与多种职业武器。"},
      new BossSpec{Key="golem",Name="石巨人",Types=new[]{245},Item=1293,Temple=true,Hardmode=true,Condition="困难模式 · 丛林神庙",Description="神庙中的多部件首领。主要战利品：锯刃镐与日耀相关材料。"},
      new BossSpec{Key="duke",Name="猪龙鱼公爵",Types=new[]{370},Item=2673,Ocean=true,Hardmode=true,Condition="困难模式 · 海洋",Description="高速冲刺的海洋首领。主要战利品：猪龙鱼之翼与泡泡枪。"},
      new BossSpec{Key="empress",Name="光之女皇",Types=new[]{636},Item=4961,Hallow=true,Hardmode=true,Condition="困难模式 · 神圣之地；白天伤害极高",Description="弹幕型首领。主要战利品：万花筒、星光与泰拉棱镜（特殊条件）。"},
      new BossSpec{Key="cultist",Name="拜月教邪教徒",Types=new[]{439},Item=3549,Hardmode=true,Condition="困难模式；击败后进入天界事件",Description="使用多种魔法与分身。击败将推动天界事件。"},
      new BossSpec{Key="moonLord",Name="月亮领主",Types=new[]{398},Item=3601,Hardmode=true,Condition="困难模式 · 推荐宽阔战斗场地",Description="多部位最终首领。主要战利品：夜明矿与终局武器。"}
    };
    private static bool spawnPaused;private static double spawnRateFactor=1,spawnMaxFactor=1;private static int originalRate=-1,originalMax=-1;private static bool spawnModified;
    public static bool NaturalSpawnsPaused {get{return spawnPaused&&(IsServer||R.I(MainType,"netMode")==0);}}
    private static void AdventureTick(){try{
      if(!InWorld){if(spawnModified){var npc=R.T("Terraria.NPC");R.Set(npc,"defaultSpawnRate",originalRate);R.Set(npc,"defaultMaxSpawns",originalMax);}spawnModified=false;spawnPaused=false;spawnRateFactor=spawnMaxFactor=1;return;}
      if(R.I(MainType,"netMode")==1)return;
      if(spawnModified){var npc=R.T("Terraria.NPC");R.Set(npc,"defaultSpawnRate",Math.Max(1,(int)Math.Round(originalRate/spawnRateFactor)));R.Set(npc,"defaultMaxSpawns",Math.Max(1,(int)Math.Ceiling(originalMax*spawnMaxFactor)));}
    }catch{}}
    private static double DecimalArg(Dictionary<string,object> args,string name,double fallback,double min,double max){object raw;double v;if(!args.TryGetValue(name,out raw))return fallback;if(!double.TryParse(Convert.ToString(raw,CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture,out v)||double.IsNaN(v)||double.IsInfinity(v)||v<min||v>max)throw new InvalidOperationException(name+" 超出范围。");return v;}
    private static List<string> BossRequirements(BossSpec b,object p){var issues=new List<string>();if(b.Night&&R.B(MainType,"dayTime"))issues.Add("需要夜晚");if(b.Hardmode&&!R.B(MainType,"hardMode"))issues.Add("需要困难模式");if(b.Jungle&&!R.B(p,"ZoneJungle"))issues.Add("需要丛林环境");if(b.Key=="plantera"&&R.D(R.Get(p,"position"),"Y")/16<R.D(MainType,"worldSurface"))issues.Add("需要地下丛林");if(b.Hallow&&!R.B(p,"ZoneHallow"))issues.Add("需要神圣之地");if(b.Ocean&&!R.B(p,"ZoneBeach"))issues.Add("需要海洋环境");if(b.Underworld&&!R.B(p,"ZoneUnderworldHeight"))issues.Add("需要地狱环境");if(b.Temple&&!R.B(p,"ZoneLihzhardTemple"))issues.Add("需要丛林神庙");if(b.Evil&&!R.B(p,b.Key=="eater"?"ZoneCorrupt":"ZoneCrimson"))issues.Add(b.Key=="eater"?"需要腐化之地":"需要猩红之地");return issues;}
    private static IEnumerable<object> CurrentBosses(){var a=R.Get(MainType,"npc") as Array;if(a==null)yield break;for(int n=0;n<a.Length;n++){var npc=a.GetValue(n);if(npc==null||!R.B(npc,"active")||!R.B(npc,"boss"))continue;yield return R.Dict("index",n,"type",R.I(npc,"type"),"name",Convert.ToString(R.Get(npc,"FullName","Boss")),"life",R.I(npc,"life"),"maxLife",R.I(npc,"lifeMax"));}}
    private static bool AnyBossType(int[] types){var all=(Array)R.Get(MainType,"npc");foreach(var n in all)if(n!=null&&R.B(n,"active")&&types.Contains(R.I(n,"type")))return true;return false;}
    private static bool AnyEvent(){return R.B(MainType,"bloodMoon")||R.B(MainType,"eclipse")||R.B(MainType,"pumpkinMoon")||R.B(MainType,"snowMoon")||R.B(MainType,"slimeRain")||R.I(MainType,"invasionType")>0;}
    private static void EndEvents(){RequireWorldControl();R.TrySet(MainType,"bloodMoon",false);R.TrySet(MainType,"eclipse",false);if(R.Method(MainType,"stopMoonEvent"))R.Call(MainType,"stopMoonEvent");else{R.TrySet(MainType,"pumpkinMoon",false);R.TrySet(MainType,"snowMoon",false);}if(R.Method(MainType,"StopSlimeRain"))R.Call(MainType,"StopSlimeRain",false);R.TrySet(MainType,"invasionType",0);R.TrySet(MainType,"invasionSize",0);R.TrySet(MainType,"invasionProgress",0);R.TrySet(MainType,"invasionProgressWave",0);R.TrySet(MainType,"invasionProgressNearInvasion",false);Send(7);if(R.Method(MainType,"SyncAnInvasion"))R.Call(MainType,"SyncAnInvasion",-1);}
    private static void SendHousing(int index,object npc){if(R.I(MainType,"netMode")==0)return;R.Call(R.T("Terraria.NetMessage"),"SendData",60,-1,-1,null,index,(float)R.I(npc,"homeTileX"),(float)R.I(npc,"homeTileY"),R.B(npc,"homeless")?1f:0f);}
    private static void SyncVitals(){Send(16,R.I(MainType,"myPlayer"));Send(42,R.I(MainType,"myPlayer"));}
    private static bool AdventureAction(string action,Dictionary<string,object> args,out object result){result=null;var p=Player();
      if(action=="spawnBoss"){
        RequireWorldControl();var b=Bosses.FirstOrDefault(x=>x.Key==Text(args,"key"));if(b==null)throw new InvalidOperationException("未知首领。");if(LunarInProgress())throw new InvalidOperationException("天界事件正在进行，请完成四柱与月亮领主挑战后再召唤其他首领。");if(CurrentBosses().Any()||AnyBossType(b.Types))throw new InvalidOperationException("已有首领在战斗中，请结束当前战斗再召唤。");
        var issues=BossRequirements(b,p);bool adjust=Bool(args,"prepareTime")&&b.Night&&R.B(MainType,"dayTime");var blocking=issues.Where(x=>!(adjust&&x=="需要夜晚")).ToList();if(blocking.Count>0)throw new InvalidOperationException(string.Join("，",blocking)+"。可使用传送书签前往对应场地。");if(adjust){R.Set(MainType,"dayTime",false);R.Set(MainType,"time",0.0);Send(7);}
        var npcType=R.T("Terraria.NPC");if(b.Key=="wall")R.Call(npcType,"SpawnWOF",R.Get(p,"position"));else foreach(int type in b.Types)R.Call(npcType,"SpawnOnPlayer",R.I(p,"whoAmI",IsServer?actorIndex:R.I(MainType,"myPlayer")),type);
        if(!AnyBossType(b.Types))throw new InvalidOperationException("游戏没有生成该首领，请检查场地与世界状态。");result=R.Dict("message",b.Name+"已召唤。");return true;
      }
      if(action=="event"){
        RequireWorldControl();string key=Text(args,"key");if(key=="lunar"){result=StartLunarEvent();return true;}if(key=="stop"){EndEvents();result=R.Dict("message","普通月亮事件、入侵及史莱姆雨已结束。");return true;}
        if(AnyEvent()||LunarInProgress())throw new InvalidOperationException("已有事件正在进行，请先结束当前事件。");
        if(new[]{"pirates","martians","eclipse","pumpkin","frost"}.Contains(key)&&!R.B(MainType,"hardMode"))throw new InvalidOperationException("此事件需要困难模式世界。");
        if(new[]{"bloodMoon","pumpkin","frost"}.Contains(key)){R.Set(MainType,"dayTime",false);R.Set(MainType,"time",0.0);}if(key=="eclipse"){R.Set(MainType,"dayTime",true);R.Set(MainType,"time",0.0);}
        if(key=="bloodMoon")R.Set(MainType,"bloodMoon",true);else if(key=="eclipse")R.Set(MainType,"eclipse",true);else if(key=="pumpkin")R.Call(MainType,"startPumpkinMoon");else if(key=="frost")R.Call(MainType,"startSnowMoon");else if(key=="slimeRain")R.Call(MainType,"StartSlimeRain",true);else {int invasion=key=="goblins"?1:key=="snowLegion"?2:key=="pirates"?3:key=="martians"?4:0;if(invasion==0)throw new InvalidOperationException("未知事件。");R.Call(MainType,"StartInvasion",invasion);}
        Send(7);if(R.Method(MainType,"SyncAnInvasion"))R.Call(MainType,"SyncAnInvasion",-1);result=R.Dict("message","事件已开始，已同步世界状态。");return true;
      }
      if(action=="spawnControl"){
        RequireWorldControl();var npc=R.T("Terraria.NPC");if(!R.Has(npc,"defaultSpawnRate")||!R.Has(npc,"defaultMaxSpawns"))throw new InvalidOperationException("此版本不支持刷怪倍率控制。");
        double rate=DecimalArg(args,"rate",1,0.1,10),max=DecimalArg(args,"max",1,0.1,10);if(!spawnModified){originalRate=R.I(npc,"defaultSpawnRate",600);originalMax=R.I(npc,"defaultMaxSpawns",5);}spawnRateFactor=rate;spawnMaxFactor=max;spawnPaused=Bool(args,"paused");spawnModified=true;AdventureTick();result=R.Dict("message",spawnPaused?"自然刷怪已暂停。":"自然刷怪设置已更新。");return true;
      }
      if(action=="teleport"){
        int x,y;if(Text(args,"destination")=="death"){var d=R.Get(p,"lastDeathPostion");if(d==null||R.D(d,"X")<=0||R.D(d,"Y")<=0)throw new InvalidOperationException("当前角色没有可用的死亡位置。");x=(int)(R.D(d,"X")/16);y=(int)(R.D(d,"Y")/16);}else{x=Number(args,"x",-1,10,R.I(MainType,"maxTilesX",8400)-10);y=Number(args,"y",-1,10,R.I(MainType,"maxTilesY",2400)-10);if(Number(args,"worldId",int.MinValue,int.MinValue,int.MaxValue)!=R.I(MainType,"worldID"))throw new InvalidOperationException("书签属于另一个世界。");}
        var old=R.Get(p,"position");var target=R.Vec(old,x*16f,y*16f);try{var c=R.T("Terraria.Collision");if(R.Method(c,"SolidCollision")&&Convert.ToBoolean(R.Call(c,"SolidCollision",target,R.I(p,"width",20),R.I(p,"height",42))))throw new InvalidOperationException("目标位置有实心方块，请选择空旷位置。");}catch(InvalidOperationException e){if(e.Message.Contains("实心"))throw;}
        R.Call(p,"Teleport",target,0,0);R.TrySet(p,"fallStart",y);R.TrySet(p,"immune",true);R.TrySet(p,"immuneTime",120);Send(13,R.I(MainType,"myPlayer"));result=R.Dict("message","已传送到目标位置。");return true;
      }
      if(action=="refill"){
        int target=Number(args,"stack",9999,1,9999),changed=0;var inv=Arrays(p)["inventory"];var plan=new List<KeyValuePair<int,object>>();for(int n=0;n<Math.Min(58,inv.Length);n++){var item=inv.GetValue(n);if(R.I(item,"type")==0||!R.B(item,"consumable")||!(R.I(item,"ammo")>0||R.I(item,"healLife")>0||R.I(item,"healMana")>0||R.B(item,"potion")||R.I(item,"buffType")>0))continue;int limit=Math.Min(target,Math.Max(1,R.I(item,"maxStack",9999)));if(R.I(item,"stack")>=limit)continue;plan.Add(new KeyValuePair<int,object>(n,NewItem(R.I(item,"type"),limit,R.I(item,"prefix"),R.B(item,"favorited"))));}if(plan.Count>0)Remember(p);foreach(var change in plan){inv.SetValue(change.Value,change.Key);SyncSlot(change.Key<50?"inventory":change.Key<54?"coins":"ammo",change.Key<50?change.Key:change.Key<54?change.Key-50:change.Key-54);changed++;}result=R.Dict("message","已补充 "+changed+" 个已有药水或弹药槽位。","slots",changed);return true;
      }
      if(action=="giveBatch"){
        object value;if(!args.TryGetValue("items",out value)||!(value is IEnumerable))throw new InvalidOperationException("预设内容无效。");var entries=((IEnumerable)value).Cast<object>().ToArray();if(entries.Length==0||entries.Length>100)throw new InvalidOperationException("预设需要 1–100 项物品。");var original=Inventory(p);var savedUndo=lastUndo;var savedPlayer=undoPlayer;var savedWorld=undoWorld;try{foreach(var entry in entries){var d=entry as Dictionary<string,object>;if(d==null)throw new InvalidOperationException("预设项目无效。");Give(d);}lastUndo=original;undoPlayer=Convert.ToString(R.Get(p,"name"));undoWorld=Convert.ToString(R.Get(MainType,"worldID"));}catch{lastUndo=original;undoPlayer=Convert.ToString(R.Get(p,"name"));undoWorld=Convert.ToString(R.Get(MainType,"worldID"));Undo(p);lastUndo=savedUndo;undoPlayer=savedPlayer;undoWorld=savedWorld;throw;}result=R.Dict("message","预设中的 "+entries.Length+" 项物品已全部发放。");return true;
      }
      return false;
    }
    private static object SaveInfo(string field){try{var data=R.Get(MainType,field);return data==null?null:R.Dict("path",Convert.ToString(R.Get(data,"Path","")),"cloud",R.B(data,"IsCloudSave"));}catch{return null;}}
    private static void ExtendSnapshot(Dictionary<string,object> state,object p){
      state["bridgeVersion"]="2.3.0";state["bosses"]=CurrentBosses().ToArray();state["bossCatalog"]=Bosses.Select(b=>R.Dict("key",b.Key,"name",b.Name,"types",b.Types,"item",b.Item,"condition",b.Condition,"description",b.Description,"requirements",BossRequirements(b,p).ToArray(),"active",AnyBossType(b.Types))).ToArray();
      state["events"]=R.Dict("bloodMoon",R.B(MainType,"bloodMoon"),"eclipse",R.B(MainType,"eclipse"),"pumpkin",R.B(MainType,"pumpkinMoon"),"frost",R.B(MainType,"snowMoon"),"slimeRain",R.B(MainType,"slimeRain"),"invasion",R.I(MainType,"invasionType"),"remaining",R.I(MainType,"invasionSize"),"total",R.I(MainType,"invasionSizeStart"),"wave",R.I(R.T("Terraria.NPC"),"waveNumber"),"lunar",LunarSnapshot());
      state["spawns"]=R.Dict("paused",spawnPaused,"rate",spawnRateFactor,"max",spawnMaxFactor);state["saves"]=R.Dict("player",IsServer?null:SaveInfo("ActivePlayerFileData"),"world",R.I(MainType,"netMode")==1?null:SaveInfo("ActiveWorldFileData"));
      var caps=(Dictionary<string,object>)state["capabilities"];caps["bosses"]=R.Method(R.T("Terraria.NPC"),"SpawnOnPlayer");caps["events"]=R.Method(MainType,"StartInvasion");caps["lunarEvents"]=LunarSupported();caps["spawnControl"]=R.Has(R.T("Terraria.NPC"),"defaultSpawnRate");
    }
  }
}

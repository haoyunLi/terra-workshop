using System;
using System.Collections.Generic;
using System.Linq;

namespace TerraWorkshop {
  public static partial class Bridge {
    // Field names verified against the vanilla 1.4.5.8 client and dedicated server.
    // A missing field is unknown, never a false defeat record.
    private static object ProgressFlag(Type owner,string name) {
      try {var value=R.Has(owner,name)?R.Get(owner,name):null;return value is bool?value:null;}catch{return null;}
    }
    private static void PopulateProgress(Dictionary<string,object> state) {
      var npc=R.T("Terraria.NPC");
      var flags=new[]{
        new[]{"kingSlime","downedSlimeKing"},new[]{"eye","downedBoss1"},
        new[]{"eater","downedBoss2"},new[]{"brain","downedBoss2"},
        new[]{"queenBee","downedQueenBee"},new[]{"skeletron","downedBoss3"},
        new[]{"deerclops","downedDeerclops"},new[]{"wall","hardMode"},
        new[]{"queenSlime","downedQueenSlime"},new[]{"twins","downedMechBoss2"},
        new[]{"destroyer","downedMechBoss1"},new[]{"prime","downedMechBoss3"},
        new[]{"plantera","downedPlantBoss"},new[]{"golem","downedGolemBoss"},
        new[]{"duke","downedFishron"},new[]{"empress","downedEmpressOfLight"},
        new[]{"cultist","downedAncientCultist"},new[]{"moonLord","downedMoonlord"},
        new[]{"solar","downedTowerSolar"},new[]{"vortex","downedTowerVortex"},
        new[]{"nebula","downedTowerNebula"},new[]{"stardust","downedTowerStardust"}
      };
      var entries=new List<object>();
      foreach(var flag in flags) {
        bool shared=flag[0]=="eater"||flag[0]=="brain",milestone=flag[0]=="wall",pillar=flag[1].StartsWith("downedTower",StringComparison.Ordinal);
        var value=ProgressFlag(milestone?MainType:npc,flag[1]);
        string note=shared?"原版世界共用一个邪恶首领进度标记，无法分别确认世界吞噬怪和克苏鲁之脑的击败记录。"
          :milestone?"以世界是否进入困难模式显示阶段；原版没有独立的血肉墙击败记录。"
          :value==null?"当前游戏版本未提供可读取的进度标记。"
          :pillar?"显示当前或最近一轮天界事件的击败状态；再次开启天界事件会重置四柱标记。"
          :"读取当前世界保存的击败标记；这是世界进度，不是本角色的击杀记录。";
        entries.Add(R.Dict("key",flag[0],"available",value!=null,"defeated",shared||milestone?null:value,
          "stageReached",shared||milestone?value:null,"kind",shared?"shared":milestone?"milestone":pillar?"pillar":"defeat","note",note));
      }
      state["progress"]=R.Dict("source","native-world-flags","bosses",entries.ToArray());
      var caps=state["capabilities"] as Dictionary<string,object>;
      if(caps!=null)caps["progress"]=entries.Cast<Dictionary<string,object>>().Any(x=>(bool)x["available"]);
    }
  }
}

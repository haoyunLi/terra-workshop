using System;
using System.Collections.Generic;
using System.Linq;

namespace TerraWorkshop {
  public static partial class Bridge {
    private sealed class PillarSpec {
      public string Key, Name, Suffix;
      public int Type, Item;
    }

    private static readonly PillarSpec[] Pillars = {
      new PillarSpec { Key="solar", Name="日耀柱", Suffix="Solar", Type=517, Item=3458 },
      new PillarSpec { Key="vortex", Name="星旋柱", Suffix="Vortex", Type=422, Item=3456 },
      new PillarSpec { Key="nebula", Name="星云柱", Suffix="Nebula", Type=507, Item=3457 },
      new PillarSpec { Key="stardust", Name="星尘柱", Suffix="Stardust", Type=493, Item=3459 }
    };

    private static bool LunarSupported() {
      var npcType = R.T("Terraria.NPC");
      return R.Method(R.T("Terraria.WorldGen"), "TriggerLunarApocalypse")
        && R.Has(npcType, "LunarApocalypseIsUp")
        && R.Has(npcType, "ShieldStrengthTowerMax")
        && Pillars.All(p => R.Has(npcType, "ShieldStrengthTower" + p.Suffix)
          && R.Has(npcType, "TowerActive" + p.Suffix));
    }

    private static bool LunarInProgress() {
      var npcType = R.T("Terraria.NPC");
      return R.B(npcType, "LunarApocalypseIsUp")
        || R.I(npcType, "MoonLordCountdown") > 0
        || Pillars.Any(p => R.B(npcType, "TowerActive" + p.Suffix))
        || AnyBossType(Pillars.Select(p => p.Type).ToArray());
    }

    private static object LunarSnapshot() {
      var npcType = R.T("Terraria.NPC");
      var npcs = ((Array)R.Get(MainType, "npc")).Cast<object>();
      int maxShield = R.I(npcType, "ShieldStrengthTowerMax");
      var states = new List<object>();
      foreach (var pillar in Pillars) {
        var npc = npcs.FirstOrDefault(n => n != null && R.B(n, "active") && R.I(n, "type") == pillar.Type);
        bool active = npc != null || R.B(npcType, "TowerActive" + pillar.Suffix);
        var position = npc == null ? null : R.Get(npc, "position");
        states.Add(R.Dict(
          "key", pillar.Key, "name", pillar.Name, "type", pillar.Type, "item", pillar.Item,
          "active", active, "shield", R.I(npcType, "ShieldStrengthTower" + pillar.Suffix),
          "maxShield", maxShield, "life", npc == null ? 0 : R.I(npc, "life"),
          "maxLife", npc == null ? 0 : R.I(npc, "lifeMax"),
          "x", position == null ? (object)null : (int)(R.D(position, "X") / 16),
          "y", position == null ? (object)null : (int)(R.D(position, "Y") / 16),
          "defeated", !active && R.B(npcType, "downedTower" + pillar.Suffix)));
      }
      return R.Dict("active", LunarInProgress(),
        "countdown", (int)Math.Ceiling(Math.Max(0, R.I(npcType, "MoonLordCountdown")) / 60.0),
        "pillars", states.ToArray());
    }

    private static object StartLunarEvent() {
      RequireWorldControl();
      if (!LunarSupported()) throw new InvalidOperationException("当前游戏版本不支持天界事件控制。");
      if (!R.B(MainType, "hardMode")) throw new InvalidOperationException("天界事件需要困难模式世界。");
      if (LunarInProgress()) throw new InvalidOperationException("天界事件或月亮领主倒计时已在进行，请完成当前挑战。");
      if (CurrentBosses().Any()) throw new InvalidOperationException("已有首领在战斗中，请结束当前战斗再开启天界事件。");
      if (AnyEvent()) throw new InvalidOperationException("已有事件正在进行，请先结束当前事件。");
      var npcs = (Array)R.Get(MainType, "npc");
      var npcType = R.T("Terraria.NPC");
      var protectedSlots = R.Get(npcType, "spawnSlotProtected") as Array;
      int maxNpcs = Math.Min(R.I(MainType, "maxNPCs", npcs.Length), npcs.Length);
      bool hasSlotCheck = R.Method(npcType, "IsSpawnSlotInUse");
      int freeSlots = 0;
      // The final npc-array element is a sentinel. In 1.4.5 recently used slots
      // can also be reserved even when the NPC is inactive.
      for (int index = 0; index < maxNpcs; index++) {
        bool inUse = hasSlotCheck
          ? Convert.ToBoolean(R.Call(npcType, "IsSpawnSlotInUse", index))
          : R.B(npcs.GetValue(index), "active") || (protectedSlots != null
            && index < protectedSlots.Length && Convert.ToInt32(protectedSlots.GetValue(index)) > 0);
        if (!inUse) freeSlots++;
      }
      if (freeSlots < Pillars.Length)
        throw new InvalidOperationException("世界敌怪数量已满，暂时没有足够位置生成四座天界柱。");

      // The vanilla entry point chooses locations and initializes shields and progression.
      // Historical downedTower flags are deliberately preserved, just as in the game.
      R.Call(R.T("Terraria.WorldGen"), "TriggerLunarApocalypse");
      for (int index = 0; index < npcs.Length; index++) {
        var npc = npcs.GetValue(index);
        if (npc != null && R.B(npc, "active") && Pillars.Any(p => p.Type == R.I(npc, "type"))) {
          R.TrySet(npc, "netUpdate", true);
          Send(23, index);
        }
      }
      Send(7);
      Send(101);
      return R.Dict("message", "天界事件已开启，四座天界柱已生成。击败全部四柱后，月亮领主会按游戏规则降临。");
    }
  }
}

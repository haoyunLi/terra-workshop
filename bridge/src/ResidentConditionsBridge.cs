// Read-only town arrival prerequisites. Rules verified against vanilla 1.4.5.8.
// Housing validation and spawning are deliberately left to the game's explicit commands.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace TerraWorkshop {
  public static partial class Bridge {
    private static string residentConditionWorld;
    private static DateTime residentConditionTime;
    private static List<object> residentConditionEntries;
    private const int ResidentRefreshSeconds = 5;

    private static bool? ResidentFlag(Type type, string field) {
      try { return R.Has(type, field) ? (bool?)R.B(type, field) : null; } catch { return null; }
    }
    private static bool? ResidentAny(params bool?[] values) {
      return values.Any(v => v == true) ? true : values.Any(v => !v.HasValue) ? (bool?)null : false;
    }
    private static bool? ResidentAll(params bool?[] values) {
      return values.Any(v => v == false) ? false : values.Any(v => !v.HasValue) ? (bool?)null : true;
    }
    private static string ResidentStatus(bool? value) { return !value.HasValue ? "unknown" : value.Value ? "satisfied" : "unmet"; }
    private static Dictionary<string,object> ResidentRequirement(string key, string label, bool? value, string detail = "", string kind = "prerequisite") {
      return R.Dict("key", key, "label", label, "status", ResidentStatus(value), "detail", detail, "kind", kind);
    }
    private static bool? ResidentNative(Type npc, string method) {
      // These five vanilla methods only inspect inventory/stats and persistent unlock flags.
      try { var m = npc.GetMethod(method, R.All, null, Type.EmptyTypes, null); return m != null && m.ReturnType == typeof(bool) ? (bool?)m.Invoke(null, null) : null; }
      catch { return null; }
    }
    private static void PopulateResidentConditions(Dictionary<string,object> state) {
      var main = MainType;
      bool authority = IsServer || R.I(main, "netMode") == 0;
      var caps = state["capabilities"] as Dictionary<string,object>;
      if (caps != null) caps["residentConditions"] = authority;
      string world = Convert.ToString(R.Get(main, "worldID"), CultureInfo.InvariantCulture) + "|" + Convert.ToString(R.Get(main, "worldName")) + "|" + R.I(main, "netMode");
      bool supported = Convert.ToString(R.Get(main, "versionNumber", "")).Contains("1.4.5.");
      var now = DateTime.UtcNow;
      if (!authority) {
        state["residentConditions"] = R.Dict("source", "unavailable", "entries", new object[0], "housing", "unknown", "refreshSeconds", ResidentRefreshSeconds, "note", "等待本机主机的世界状态。");
        return;
      }
      if (residentConditionEntries == null || residentConditionWorld != world || (now - residentConditionTime).TotalSeconds >= ResidentRefreshSeconds) {
        residentConditionEntries = EvaluateResidentConditions(state, supported);
        residentConditionTime = now;
        residentConditionWorld = world;
      }
      state["residentConditions"] = R.Dict("source", "world", "worldId", R.I(main, "worldID"), "ruleVersion", "1.4.5", "supported", supported,
        "evaluatedAt", residentConditionTime.ToString("o", CultureInfo.InvariantCulture), "ageSeconds", Math.Round((now - residentConditionTime).TotalSeconds, 1),
        "refreshSeconds", ResidentRefreshSeconds, "entries", residentConditionEntries, "housing", "unknown",
        "note", supported ? "前置条件每 5 秒读取一次；房屋空置、空间、生物群落和自然到访时机由游戏判定。" : "当前游戏版本的自然到访规则尚未核验，条件显示为未知。");
    }

    private static List<object> EvaluateResidentConditions(Dictionary<string,object> state, bool supported) {
      var main = MainType;
      var npc = R.T("Terraria.NPC");
      var residents = ((List<object>)state["npcs"]).Cast<Dictionary<string,object>>().ToList();
      var present = new HashSet<int>(residents.Select(n => Convert.ToInt32(n["type"])));
      int population = residents.Count;
      Func<string,bool?> flag = name => supported ? ResidentFlag(npc, name) : null;
      Func<string,bool?> worldFlag = name => supported ? ResidentFlag(main, name) : null;
      Func<int,bool?> has = id => supported ? (bool?)present.Contains(id) : null;
      Func<int,bool?> count = required => supported ? (bool?)(population >= required) : null;
      var entries = new List<object>();
      Action<int,string,Dictionary<string,object>[]> add = (id, note, requirements) => {
        var checks = requirements.Where(r => (string)r["kind"] == "prerequisite").ToArray();
        string status = checks.Any(r => (string)r["status"] == "unmet") ? "unmet" : checks.Length == 0 || checks.Any(r => (string)r["status"] == "unknown") ? "unknown" : "satisfied";
        entries.Add(R.Dict("id", id, "status", status, "requirements", requirements, "note", note));
      };
      Action<int,string,string,string> rescued = (id, field, label, note) => add(id, note, new[]{ResidentRequirement("rescue", label, flag(field))});
      Func<string,string,Dictionary<string,object>> native = (method, label) => ResidentRequirement("native", label, supported ? ResidentNative(npc, method) : null, "读取当前游戏的原生判定；已永久解锁时，无须再次准备物品。");
      string countDetail = "当前游戏统计：" + population + " 位城镇 NPC（含城镇宠物与史莱姆）。";

      add(22, "普通世界的起始居民；特殊种子可能改变初始居民。", new[]{ResidentRequirement("guide", "向导没有额外进度门槛", supported ? (bool?)true : null)});
      add(17, "所有在线角色身上的钱币按游戏规则共同计算；箱子中的钱币不计入。", new[]{native("SpawnAllowed_Merchant", "在线角色合计携带至少 50 银币，或商人已解锁")});
      add(18, "生命条件使用永久基础生命；商人仍须在世界中。", new[]{native("SpawnAllowed_Nurse", "一名在线角色基础生命达到 120，或护士已解锁"), ResidentRequirement("merchant", "商人在世界中", has(17))});
      add(19, "枪械必须使用子弹；并非所有远程武器都符合要求。", new[]{native("SpawnAllowed_ArmsDealer", "携带子弹或使用子弹的枪械，或军火商已解锁")});
      add(20, "感染种子的例外规则也计入判定。", new[]{ResidentRequirement("boss", "击败克苏鲁之眼、世界吞噬怪／克苏鲁之脑或骷髅王之一（或感染种子）", ResidentAny(flag("downedBoss1"), flag("downedBoss2"), flag("downedBoss3"), worldFlag("infectedSeed")))});
      add(38, "爆炸物范围使用当前游戏的物品集合。", new[]{native("SpawnAllowed_Demolitionist", "携带有效爆炸物，或爆破专家已解锁"), ResidentRequirement("merchant", "商人在世界中", has(17))});
      add(54, "击败地牢入口的骷髅王后解锁。", new[]{ResidentRequirement("skeletron", "击败骷髅王", flag("downedBoss3"))});
      rescued(107, "savedGoblin", "已解救受缚哥布林", "击败哥布林军队后，在洞穴层寻找并与受缚哥布林交谈。");
      rescued(108, "savedWizard", "已解救受缚巫师", "困难模式下，在洞穴层寻找并与受缚巫师交谈。");
      rescued(124, "savedMech", "已解救受缚机械师", "击败骷髅王后，在地牢找到并解救机械师。");
      add(142, "圣诞节状态读取游戏本身；节期结束后圣诞老人会离开。", new[]{ResidentRequirement("frostLegion", "击败雪人军团", flag("downedFrost")), ResidentRequirement("christmas", "游戏处于圣诞节期", worldFlag("xMas"))});
      add(160, "1.4.5 中可在困难模式无房到访；永久入住仍须满足蘑菇房要求。", new[]{ResidentRequirement("hardmode", "世界进入困难模式", worldFlag("hardMode")), ResidentRequirement("mushroomHouse", "准备合格的发光蘑菇群落住房（通常需要地表）", null, "未扫描房屋与生物群落；特殊种子、已解锁状态会影响高度要求。请用游戏住房查询确认。", "housing")});
      add(178, "十周年世界且非 FTW 的特殊规则也计入。", new[]{ResidentRequirement("mechanical", "击败任意机械 Boss，或符合十周年种子例外", ResidentAny(flag("downedMechBossAny"), ResidentAll(worldFlag("tenthAnniversaryWorld"), worldFlag("getGoodWorld").HasValue ? !worldFlag("getGoodWorld").Value : (bool?)null)))});
      add(207, "染料条件包含身上装备的有效染料；城镇人数独立计算。", new[]{native("SpawnAllowed_DyeTrader", "携带有效染料／染料材料，或染料商已解锁"), ResidentRequirement("population", "世界中至少有 4 位城镇 NPC", count(4), countDetail)});
      bool? partyUnlocked = flag("unlockedPartyGirlSpawn");
      add(208, "首次到访还需要随机判定，符合人数条件并不保证立即出现。", new[]{ResidentRequirement("population", "至少 20 位城镇 NPC，或派对女孩已永久解锁", ResidentAny(partyUnlocked, count(20)), countDetail), ResidentRequirement("random", "等待游戏的随机到访判定", partyUnlocked == true ? (bool?)true : null, "首次到访每次检查有 1/40 机会；工坊不掷骰或改变游戏随机数。", "timing")});
      add(209, "读取世界进度，不会通过检查修改 Boss 击败记录。", new[]{ResidentRequirement("hardmode", "世界进入困难模式", worldFlag("hardMode")), ResidentRequirement("plantera", "击败世纪之花", flag("downedPlantBoss"))});
      add(227, "1.4.5 使用 8 位城镇 NPC 的人数门槛。", new[]{ResidentRequirement("population", "世界中至少有 8 位城镇 NPC", count(8), countDetail)});
      add(228, "击败丛林蜂巢中的蜂王后解锁。", new[]{ResidentRequirement("queenBee", "击败蜂王", flag("downedQueenBee"))});
      add(229, "完成海盗入侵后解锁。", new[]{ResidentRequirement("pirates", "击败海盗入侵", flag("downedPirates"))});
      rescued(353, "savedStylist", "已解救受缚发型师", "在蜘蛛洞中寻找并解救发型师。");
      rescued(369, "savedAngler", "已唤醒沉睡渔夫", "在海边找到沉睡渔夫并与其交谈。");
      rescued(441, "savedTaxCollector", "已净化痛苦亡魂", "困难模式下，在地狱对痛苦亡魂使用净化粉。");
      rescued(550, "savedBartender", "已唤醒昏迷男子", "击败世界吞噬怪或克苏鲁之脑后，找到昏迷男子并交谈。");
      rescued(588, "savedGolfer", "已解救高尔夫球手", "在地下沙漠找到高尔夫球手并交谈。");
      bool? bestiary = null;
      string bestiaryDetail = "当前版本未提供可读的图鉴完成度。";
      if (supported) try {
        var report = R.Call(main, "GetBestiaryProgressReport");
        if (report != null && R.Has(report, "CompletionPercent")) { double percent = R.D(report, "CompletionPercent"); bestiary = percent >= 0.1; bestiaryDetail = "当前图鉴完成度：" + (percent * 100).ToString("0.0", CultureInfo.InvariantCulture) + "%"; }
      } catch { }
      bool? vampireException = ResidentAll(worldFlag("vampireSeed"), worldFlag("infectedSeed").HasValue ? !worldFlag("infectedSeed").Value : (bool?)null);
      add(633, "吸血鬼且非感染种子的例外规则也计入。", new[]{ResidentRequirement("bestiary", "图鉴完成度至少 10%，或符合特殊种子例外", ResidentAny(bestiary, vampireException), bestiaryDetail)});
      var princessIds = new[]{17,18,19,20,22,38,54,107,108,124,160,178,207,208,209,227,228,229,353,369,441,550,588,633};
      bool? allResidents = supported ? (bool?)princessIds.All(present.Contains) : null;
      var princessRequirement = ResidentRequirement("town", "其余 24 位普通居民都在世界中，或公主已解锁", ResidentAny(allResidents, flag("unlockedPrincessSpawn"), ResidentAll(worldFlag("tenthAnniversaryWorld"), worldFlag("getGoodWorld").HasValue ? !worldFlag("getGoodWorld").Value : (bool?)null)));
      princessRequirement["missingNpcIds"] = princessIds.Where(id => !present.Contains(id)).ToArray();
      add(663, "不要求圣诞老人、访客、宠物和史莱姆；永久解锁及十周年种子例外也计入。", new[]{princessRequirement});
      rescued(637, "boughtCat", "已使用猫咪许可证", "从动物学家处购买并使用猫咪许可证；可与普通居民共享住房。");
      rescued(638, "boughtDog", "已使用狗狗许可证", "图鉴达到 25% 后可购买狗狗许可证；使用后解锁。");
      rescued(656, "boughtBunny", "已使用兔兔许可证", "图鉴达到 45% 后可购买兔兔许可证；使用后解锁。");
      rescued(670, "unlockedSlimeBlueSpawn", "已解锁书呆子史莱姆", "击败史莱姆王后解锁。");
      bool? naturalParty = null;
      if (supported) try { naturalParty = ResidentFlag(R.T("Terraria.GameContent.Events.BirthdayParty"), "GenuineParty"); } catch { }
      add(678, "派对中心手动开启的派对不满足首次解锁要求。", new[]{ResidentRequirement("party", "自然派对正在进行，或酷酷史莱姆已解锁", ResidentAny(flag("unlockedSlimeGreenSpawn"), naturalParty))});
      rescued(679, "unlockedSlimeOldSpawn", "已解锁长者史莱姆", "击败骷髅王后，在洞穴层用金钥匙开启摇动的旧箱。");
      rescued(680, "unlockedSlimePurpleSpawn", "已解锁笨拙史莱姆", "在太空层寻找气球携带的史莱姆，打破气球。");
      rescued(681, "unlockedSlimeRainbowSpawn", "已解锁天后史莱姆", "把闪耀史莱姆气球丢入微光。");
      rescued(682, "unlockedSlimeRedSpawn", "已解锁暴躁史莱姆", "在血月期间钓鱼，有机会钓起。");
      rescued(683, "unlockedSlimeYellowSpawn", "已解锁神秘史莱姆", "在丛林对神秘青蛙使用净化粉。");
      rescued(684, "unlockedSlimeCopperSpawn", "已解锁侍卫史莱姆", "将铜短剑或铜头盔丢给普通史莱姆。");
      add(37, "地牢入口的特殊 NPC，不接受普通城镇住房；击败骷髅王后由服装商取代。", new[]{ResidentRequirement("special", "在地牢入口寻找老人", null)});
      add(368, "旅商是临时访客，不会永久入住。到访受时间、城镇人数与随机判定影响。", new[]{ResidentRequirement("visitor", "等待游戏生成临时访客", null)});
      return entries;
    }
  }
}

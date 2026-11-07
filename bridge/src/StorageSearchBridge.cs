using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;

namespace TerraWorkshop {
  public static partial class Bridge {
    private static void PopulateStorageSnapshot(Dictionary<string, object> state, object player) {
      var capabilities = (Dictionary<string, object>)state["capabilities"];
      capabilities["storageSearch"] = R.Has(MainType, "chest");
      var groups = new Dictionary<string, object>();
      var loadouts = R.Get(player, "Loadouts") as Array;
      if (loadouts != null) {
        int selected = R.I(player, "CurrentLoadoutIndex", -1);
        for (int index = 0; index < loadouts.Length; index++) {
          if (index == selected) continue;
          var loadout = loadouts.GetValue(index);
          if (loadout == null) continue;
          var armor = R.Get(loadout, "Armor") as Array;
          var dyes = R.Get(loadout, "Dye") as Array;
          if (armor != null) groups["loadout" + index] = ItemList(armor);
          if (dyes != null) groups["loadout" + index + "Dyes"] = ItemList(dyes);
        }
      }
      state["storageLoadouts"] = groups;
    }

    private static bool TryStorageAction(string action, Dictionary<string, object> args, out object result) {
      result = null;
      if (action != "searchStorage") return false;
      RequireWorldControl();
      int worldId = Number(args, "worldId", 0, int.MinValue, int.MaxValue);
      if (!args.ContainsKey("worldId") || worldId != R.I(MainType, "worldID"))
        throw new InvalidOperationException("世界已改变，请重新搜索当前世界的箱子。");
      var chests = R.Get(MainType, "chest") as Array;
      if (chests == null) throw new InvalidOperationException("当前游戏版本无法读取世界箱子。");
      object suppliedTypes;
      var values = args.TryGetValue("types", out suppliedTypes) ? suppliedTypes as IList : null;
      if (values == null || values.Count < 1 || values.Count > 256)
        throw new InvalidOperationException("请将世界箱子搜索缩小到 1–256 种物品。");
      var types = new HashSet<int>();
      foreach (var value in values) {
        int type;
        if (!int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Integer,
          CultureInfo.InvariantCulture, out type) || type < 1 || type >= ItemCount())
          throw new InvalidOperationException("箱子搜索包含当前版本不支持的物品 ID。");
        types.Add(type);
      }
      int chestCount = Math.Min(chests.Length, R.I(MainType, "maxChests", chests.Length));
      int firstChest = Number(args, "cursorChest", 0, 0, chestCount);
      int firstSlot = Number(args, "cursorSlot", 0, 0, 65535);
      int limit = Number(args, "limit", 100, 1, 100);
      var matches = new List<object>();
      object nextCursor = null;
      int scannedChests = 0;
      var itemType = R.T("Terraria.Item");
      var typeField = itemType.GetField("type", R.All);
      var stackField = itemType.GetField("stack", R.All);
      if (typeField == null || stackField == null)
        throw new InvalidOperationException("当前游戏版本的物品结构无法用于箱子搜索。");

      for (int chestIndex = firstChest; chestIndex < chestCount; chestIndex++) {
        var chest = chests.GetValue(chestIndex);
        if (chest == null) continue;
        var slots = R.Get(chest, "item") as Array;
        if (slots == null) continue;
        scannedChests++;
        Dictionary<string, object> details = null;
        int start = chestIndex == firstChest ? firstSlot : 0;
        for (int slot = start; slot < slots.Length; slot++) {
          var item = slots.GetValue(slot);
          if (item == null) continue;
          int type = Convert.ToInt32(typeField.GetValue(item));
          if (!types.Contains(type)) continue;
          int stack = Convert.ToInt32(stackField.GetValue(item));
          if (stack <= 0) continue;
          if (matches.Count == limit) {
            nextCursor = R.Dict("chest", chestIndex, "slot", slot);
            break;
          }
          if (details == null) details = StorageChestDetails(chest, chestIndex);
          var match = new Dictionary<string, object>(details);
          match["slot"] = slot;
          match["itemId"] = type;
          match["stack"] = stack;
          match["prefix"] = R.I(item, "prefix");
          matches.Add(match);
        }
        if (nextCursor != null) break;
      }
      result = R.Dict("worldId", worldId, "results", matches,
        "nextCursor", nextCursor, "truncated", nextCursor != null, "scannedChests", scannedChests,
        "message", matches.Count == 0 ? "本次扫描没有找到匹配物品。" : "已读取世界箱子中的物品位置。");
      return true;
    }

    private static Dictionary<string, object> StorageChestDetails(object chest, int index) {
      int x = R.I(chest, "x", -1), y = R.I(chest, "y", -1);
      string name = Convert.ToString(R.Get(chest, "name", "")) ?? "";
      if (name.Length > 80) name = name.Substring(0, 80);
      var chestType = R.T("Terraria.Chest");
      object locked = null, inUse = null;
      try {
        if (x >= 0 && y >= 0 && x < R.I(MainType, "maxTilesX") && y < R.I(MainType, "maxTilesY")
          && R.Method(chestType, "IsLocked")) locked = Convert.ToBoolean(R.Call(chestType, "IsLocked", x, y));
      } catch { /* An unknown tile layout leaves the lock status explicitly unknown. */ }
      try {
        if (R.Method(chestType, "UsingChest")) inUse = Convert.ToInt32(R.Call(chestType, "UsingChest", index)) >= 0;
      } catch { /* Older versions may expose a different chest-use query. */ }
      return R.Dict("chestIndex", index, "chestName", name, "x", x, "y", y, "locked", locked, "inUse", inUse);
    }
  }
}

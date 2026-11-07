// Warehouse transactions run on the native game update thread. Original items are
// cloned, never reconstructed from IDs. Client supplied previews are never trusted.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;

namespace TerraWorkshop {
  public static partial class Bridge {
    private const int WarehouseMaxChests = 128, WarehouseMaxSlots = 8192;
    private static readonly string[] WarehouseCategories = { "ores", "building", "potions", "materials", "weapons", "tools", "armor", "accessories", "consumables", "pets", "mounts", "dyes", "other" };
    private static readonly Dictionary<string, WarehouseScan> WarehouseScans = new Dictionary<string, WarehouseScan>();
    private static readonly Dictionary<string, WarehousePlan> WarehousePlans = new Dictionary<string, WarehousePlan>();
    private static readonly Dictionary<string, WarehousePlan> WarehouseUndos = new Dictionary<string, WarehousePlan>();
    private static readonly Dictionary<Type, FieldInfo[]> WarehouseFields = new Dictionary<Type, FieldInfo[]>();
    private static object warehouseWorldIdentity;
    private static int warehouseWorldId;

    private sealed class WarehouseContext {
      public object Player, World, ChestArray;
      public int WorldId, Actor, Width, Height;
      public string PlayerName, WorldName;
    }
    private sealed class WarehouseItem {
      public object Value;
      public string Stamp, Key;
      public int Type, Stack, Prefix, Max;
      public bool Favorite;
    }
    private sealed class WarehouseChest {
      public object Chest;
      public Array Array;
      public int Index, X, Y;
      public string Name, Reason;
      public object Locked, InUse;
      public WarehouseItem[] Items;
      public bool ItemsKnown;
      public bool Eligible { get { return Reason == ""; } }
    }
    private sealed class WarehouseScan {
      public string Id;
      public DateTime Expires;
      public WarehouseContext Context;
      public Dictionary<string, object> Area;
      public List<WarehouseChest> Chests;
      public Array InventoryArray;
      public WarehouseItem[] Inventory;
    }
    private sealed class WarehouseChange {
      public WarehouseChest Before;
      public WarehouseItem[] After;
      public string AfterName;
      public bool Changed;
    }
    private sealed class WarehousePlan {
      public string Id, ScanId, Mode;
      public DateTime Expires;
      public WarehouseContext Context;
      public List<WarehouseChange> Changes;
      public WarehouseItem[] InventoryBefore, InventoryAfter;
      public Array InventoryArray;
      public Dictionary<string, object> Summary;
      public List<object> Moves = new List<object>(), Renames = new List<object>(), Skipped = new List<object>();
      public List<string> Warnings = new List<string>();
    }
    private sealed class WarehouseRule {
      public bool Excluded, KeepName;
      public string Category = "";
    }
    private sealed class WarehouseLocated {
      public WarehouseItem Item;
      public Dictionary<string, object> Location;
      public int Remaining;
    }

    private static bool WarehouseSupported() {
      // These field semantics and packets were checked against both native 1.4.5.8
      // binaries. A later version must be verified before enabling its writes.
      var version = Convert.ToString(R.Get(MainType, "versionNumber", ""));
      return System.Text.RegularExpressions.Regex.IsMatch(version, @"^(Terraria\s+)?v?1\.4\.5\.8(?:\s|$)") && R.Method(R.T("Terraria.Item"), "Clone");
    }
    private static void PopulateWarehouseSnapshot(Dictionary<string, object> state, object player) {
      var caps = (Dictionary<string, object>)state["capabilities"];
      caps["warehouseManagement"] = WarehouseSupported() && R.Has(MainType, "chest");
      caps["warehouseDeposit"] = WarehouseSupported() && R.I(MainType, "netMode") == 0;
    }
    private static void WarehouseTick() {
      object identity = R.Get(MainType, "chest");
      int id = R.I(MainType, "worldID");
      if (!InWorld || !ReferenceEquals(identity, warehouseWorldIdentity) || id != warehouseWorldId) {
        WarehouseScans.Clear(); WarehousePlans.Clear(); WarehouseUndos.Clear();
        warehouseWorldIdentity = identity; warehouseWorldId = id;
      }
      // Expired state is bounded even while the UI is idle.
      var now = DateTime.UtcNow;
      foreach (var key in WarehouseScans.Where(p => p.Value.Expires < now).Select(p => p.Key).ToArray()) WarehouseScans.Remove(key);
      foreach (var key in WarehousePlans.Where(p => p.Value.Expires < now).Select(p => p.Key).ToArray()) WarehousePlans.Remove(key);
      foreach (var key in WarehouseUndos.Where(p => p.Value.Expires < now).Select(p => p.Key).ToArray()) WarehouseUndos.Remove(key);
    }
    private static bool TryWarehouseAction(string action, Dictionary<string, object> args, out object result) {
      result = null;
      if (action != "warehouseScan" && action != "warehousePreview" && action != "warehouseApply" && action != "warehouseUndo") return false;
      RequireWorldControl();
      WarehouseTick();
      if (action == "warehouseScan") result = WarehouseRead(args);
      else {
        if (!WarehouseSupported()) throw new InvalidOperationException("当前版本尚未验证仓库写入；支持原版 1.4.5.8，请等待兼容更新。");
        if (action == "warehousePreview") result = WarehousePreview(args);
        else if (action == "warehouseApply") result = WarehouseApply(args, false);
        else result = WarehouseApply(args, true);
      }
      return true;
    }
    private static WarehouseContext WarehouseCaptureContext() {
      var player = Player();
      return new WarehouseContext { Player = player, PlayerName = Convert.ToString(R.Get(player, "name", "")), Actor = R.I(player, "whoAmI"),
        World = R.Get(MainType, "ActiveWorldFileData"), ChestArray = R.Get(MainType, "chest"), WorldId = R.I(MainType, "worldID"),
        WorldName = Convert.ToString(R.Get(MainType, "worldName", "")), Width = R.I(MainType, "maxTilesX"), Height = R.I(MainType, "maxTilesY") };
    }
    private static void WarehouseGuard(WarehouseContext context, DateTime expires) {
      RequireWorld(); RequireWorldControl();
      var now = WarehouseCaptureContext();
      if (now.WorldId != context.WorldId || now.WorldName != context.WorldName || now.Width != context.Width || now.Height != context.Height ||
          !ReferenceEquals(now.World, context.World) || !ReferenceEquals(now.ChestArray, context.ChestArray))
        throw new InvalidOperationException("世界已改变，仓库预览已失效，请重新扫描。");
      if (!ReferenceEquals(now.Player, context.Player) || now.Actor != context.Actor || now.PlayerName != context.PlayerName || !R.B(now.Player, "active"))
        throw new InvalidOperationException("角色已改变，仓库预览已失效，请重新扫描。");
      if (expires <= DateTime.UtcNow) throw new InvalidOperationException("仓库预览已过期，请重新扫描。");
    }
    private static Dictionary<string, object> WarehouseObject(Dictionary<string, object> args, string key, bool required = false) {
      object value;
      bool supplied = args.TryGetValue(key, out value);
      var result = supplied ? value as Dictionary<string, object> : null;
      if ((required || supplied) && result == null) throw new InvalidOperationException("缺少有效参数：" + key);
      return result;
    }
    private static IList WarehouseList(Dictionary<string, object> args, string key, int maximum) {
      object value;
      if (!args.TryGetValue(key, out value)) return new object[0];
      var list = value as IList;
      if (list == null || list.Count > maximum) throw new InvalidOperationException(key + " 超出允许范围。");
      return list;
    }
    private static WarehouseItem WarehouseCaptureItem(object item) {
      if (item == null) return new WarehouseItem { Stamp = WarehouseFingerprint(null, false), Key = WarehouseFingerprint(null, true) };
      int type = R.I(item, "type"), stack = R.I(item, "stack"), max = R.I(item, "maxStack");
      if (type < 0 || type >= ItemCount() || stack < 0 || (type > 0 && (stack < 1 || max < 1 || stack > max)))
        throw new InvalidOperationException("物品数量或物品结构异常；为避免丢失，已跳过该箱子。");
      return new WarehouseItem { Value = R.Call(item, "Clone"), Type = type, Stack = type == 0 ? 0 : stack, Prefix = R.I(item, "prefix"),
        Favorite = R.B(item, "favorited"), Max = max, Stamp = WarehouseFingerprint(item, false), Key = WarehouseFingerprint(item, true) };
    }
    private static WarehouseItem[] WarehouseCaptureItems(Array items) {
      if (items == null || items.Length > WarehouseMaxSlots) throw new InvalidOperationException("物品格结构未知。");
      var result = new WarehouseItem[items.Length];
      for (int i = 0; i < result.Length; i++) result[i] = WarehouseCaptureItem(items.GetValue(i));
      return result;
    }
    private static FieldInfo[] WarehouseInstanceFields(Type type) {
      FieldInfo[] fields;
      if (WarehouseFields.TryGetValue(type, out fields)) return fields;
      var all = new List<FieldInfo>();
      for (var cursor = type; cursor != null && cursor != typeof(object); cursor = cursor.BaseType)
        all.AddRange(cursor.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly));
      fields = all.OrderBy(f => f.DeclaringType.FullName + "." + f.Name, StringComparer.Ordinal).ToArray();
      WarehouseFields[type] = fields;
      return fields;
    }
    private static string WarehouseFingerprint(object item, bool ignoreStack) {
      var text = new StringBuilder();
      int nodes = 0;
      WarehouseFingerprintValue(item, text, new HashSet<object>(WarehouseReferenceComparer.Instance), 0, ref nodes, ignoreStack);
      using (var hash = SHA256.Create()) return Convert.ToBase64String(hash.ComputeHash(Encoding.UTF8.GetBytes(text.ToString())));
    }
    private sealed class WarehouseReferenceComparer : IEqualityComparer<object> {
      internal static readonly WarehouseReferenceComparer Instance = new WarehouseReferenceComparer();
      public new bool Equals(object a, object b) { return ReferenceEquals(a, b); }
      public int GetHashCode(object value) { return RuntimeHelpers.GetHashCode(value); }
    }
    private static void WarehouseFingerprintValue(object value, StringBuilder text, HashSet<object> active, int depth, ref int nodes, bool ignoreStack) {
      if (++nodes > 8192 || depth > 16) throw new InvalidOperationException("物品包含未支持的复杂属性，无法安全整理。");
      if (value == null) { text.Append("null;"); return; }
      var type = value.GetType();
      text.Append(type.FullName).Append(':');
      if (value is string) { var s = (string)value; text.Append(s.Length).Append(':').Append(s).Append(';'); return; }
      if (type.IsPrimitive || type.IsEnum || value is decimal || value is DateTime || value is Guid) {
        if (value is float) text.Append(BitConverter.ToString(BitConverter.GetBytes((float)value)));
        else if (value is double) text.Append(BitConverter.ToString(BitConverter.GetBytes((double)value)));
        else text.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
        text.Append(';'); return;
      }
      if (!type.IsValueType && !active.Add(value)) { text.Append('@').Append(RuntimeHelpers.GetHashCode(value)).Append(';'); return; }
      var array = value as Array;
      if (array != null) { text.Append(array.Length).Append('['); foreach (var element in array) WarehouseFingerprintValue(element, text, active, depth + 1, ref nodes, false); text.Append(']'); }
      else foreach (var field in WarehouseInstanceFields(type)) {
        if (ignoreStack && depth == 0 && field.Name == "stack") continue;
        text.Append(field.DeclaringType.FullName).Append('.').Append(field.Name).Append('=');
        WarehouseFingerprintValue(field.GetValue(value), text, active, depth + 1, ref nodes, false);
      }
      if (!type.IsValueType) active.Remove(value);
    }
    private static Dictionary<string, object> WarehouseItemJson(WarehouseItem item, int slot) {
      return R.Dict("slot", slot, "type", item.Type, "stack", item.Stack, "prefix", item.Prefix, "favorited", item.Favorite, "maxStack", item.Max);
    }
    private static object WarehouseRead(Dictionary<string, object> args) {
      if (!args.ContainsKey("worldId") || Number(args, "worldId", 0, int.MinValue, int.MaxValue) != R.I(MainType, "worldID"))
        throw new InvalidOperationException("世界已改变，请刷新当前世界后重新扫描。");
      var area = WarehouseObject(args, "area", true);
      int x1 = Number(area, "x1", -1, 0, R.I(MainType, "maxTilesX") - 1), x2 = Number(area, "x2", -1, 0, R.I(MainType, "maxTilesX") - 1),
          y1 = Number(area, "y1", -1, 0, R.I(MainType, "maxTilesY") - 1), y2 = Number(area, "y2", -1, 0, R.I(MainType, "maxTilesY") - 1);
      if (x1 > x2 || y1 > y2) throw new InvalidOperationException("仓库范围起点必须位于终点左上方。");
      var chests = R.Get(MainType, "chest") as Array;
      if (chests == null) throw new InvalidOperationException("当前版本无法读取世界箱子。");
      var scan = new WarehouseScan { Id = Guid.NewGuid().ToString("N"), Expires = DateTime.UtcNow.AddMinutes(5), Context = WarehouseCaptureContext(),
        Area = R.Dict("x1", x1, "y1", y1, "x2", x2, "y2", y2), Chests = new List<WarehouseChest>() };
      int totalSlots = 0;
      for (int index = 0; index < chests.Length; index++) {
        var chest = chests.GetValue(index); if (chest == null) continue;
        int x = R.I(chest, "x", -1), y = R.I(chest, "y", -1);
        if (x < x1 || x > x2 || y < y1 || y > y2) continue;
        if (scan.Chests.Count == WarehouseMaxChests) throw new InvalidOperationException("范围内超过 128 个箱子，请缩小仓库范围；本次未作任何修改。");
        var details = StorageChestDetails(chest, index);
        var slots = R.Get(chest, "item") as Array;
        totalSlots += slots == null ? 0 : slots.Length;
        if (totalSlots > WarehouseMaxSlots) throw new InvalidOperationException("范围内超过 8192 个物品格，请缩小仓库范围；本次未作任何修改。");
        var row = new WarehouseChest { Chest = chest, Array = slots, Index = index, X = x, Y = y, Name = Convert.ToString(R.Get(chest, "name", "")),
          Locked = details["locked"], InUse = details["inUse"], Reason = "" };
        if (row.Locked == null || row.InUse == null || slots == null) row.Reason = "无法确认箱子状态";
        else if ((bool)row.Locked) row.Reason = "箱子已上锁";
        else if ((bool)row.InUse) row.Reason = "箱子正在被玩家使用";
        else if (slots.Length < 1 || slots.Length > 256 || R.B(chest, "bankChest") || (R.Has(chest, "maxItems") && R.I(chest, "maxItems") != slots.Length) ||
            (R.Has(chest, "index") && R.I(chest, "index") != index))
          row.Reason = "箱子结构或容量未知";
        try { row.Items = WarehouseCaptureItems(slots); row.ItemsKnown = true; } catch (Exception error) { row.Items = new WarehouseItem[0]; row.Reason = error.Message; }
        scan.Chests.Add(row);
      }
      scan.InventoryArray = R.Get(scan.Context.Player, "inventory") as Array;
      try { scan.Inventory = WarehouseCaptureItems(scan.InventoryArray); } catch { scan.Inventory = new WarehouseItem[0]; }
      foreach (var key in WarehouseScans.Where(p => p.Value.Context.Actor == scan.Context.Actor).Select(p => p.Key).ToArray()) WarehouseScans.Remove(key);
      WarehouseScans[scan.Id] = scan;
      var warnings = new List<string>();
      if (!WarehouseSupported()) warnings.Add("当前游戏版本只支持扫描，仓库写入需要经过兼容验证。");
      return WarehouseBoundResponse(R.Dict("scanId", scan.Id, "worldId", scan.Context.WorldId, "area", scan.Area, "expiresAt", scan.Expires.ToString("o"),
        "chests", scan.Chests.Select(c => (object)R.Dict("index", c.Index, "x", c.X, "y", c.Y, "name", c.Name, "locked", c.Locked, "inUse", c.InUse,
          "eligible", c.Eligible, "skipReason", c.Reason, "itemsKnown", c.ItemsKnown, "capacity", c.Array == null ? (object)null : c.Array.Length,
          "slots", c.Items.Select((i, n) => (object)WarehouseItemJson(i, n)).ToArray())).ToArray(),
        "inventory", scan.Inventory.Select((i, n) => (object)WarehouseItemJson(i, n)).ToArray(), "capabilities", R.Dict("deposit", WarehouseSupported() && R.I(MainType, "netMode") == 0 && scan.Inventory.Length >= 50), "warnings", warnings));
    }

    private static void WarehouseCheckChest(WarehouseChest chest, WarehouseItem[] expected, string expectedName) {
      var chests = R.Get(MainType, "chest") as Array;
      if (chests == null || chest.Index >= chests.Length || !ReferenceEquals(chests.GetValue(chest.Index), chest.Chest) ||
          R.I(chest.Chest, "x") != chest.X || R.I(chest.Chest, "y") != chest.Y || !ReferenceEquals(R.Get(chest.Chest, "item"), chest.Array))
        throw new InvalidOperationException("箱子位置或实例已改变，请重新扫描。");
      if (R.B(chest.Chest, "bankChest") || (R.Has(chest.Chest, "maxItems") && R.I(chest.Chest, "maxItems") != expected.Length) ||
          (R.Has(chest.Chest, "index") && R.I(chest.Chest, "index") != chest.Index))
        throw new InvalidOperationException("箱子结构已改变，请重新扫描。");
      var details = StorageChestDetails(chest.Chest, chest.Index);
      if (!(details["locked"] is bool) || !(details["inUse"] is bool) || (bool)details["locked"] || (bool)details["inUse"])
        throw new InvalidOperationException("箱子已上锁、被占用或状态未知；没有执行修改，请重新扫描。");
      if (Convert.ToString(R.Get(chest.Chest, "name", "")) != expectedName || chest.Array.Length != expected.Length)
        throw new InvalidOperationException("箱子名称或容量已改变，请重新扫描。");
      for (int slot = 0; slot < expected.Length; slot++) if (WarehouseFingerprint(chest.Array.GetValue(slot), false) != expected[slot].Stamp)
        throw new InvalidOperationException("箱子内容已改变，原计划已取消；请重新扫描。");
    }
    private static void WarehouseCheckInventory(WarehousePlan plan, WarehouseItem[] expected) {
      if (R.I(MainType, "netMode") != 0) throw new InvalidOperationException("本版背包存入与撤销仅支持单人模式。");
      if (R.Method(plan.Context.Player, "HasLockedInventory") && Convert.ToBoolean(R.Call(plan.Context.Player, "HasLockedInventory")))
        throw new InvalidOperationException("背包正在进行原版合成或堆叠操作，请等待完成后重新预览。");
      if (!ReferenceEquals(R.Get(plan.Context.Player, "inventory"), plan.InventoryArray) || plan.InventoryArray.Length != expected.Length)
        throw new InvalidOperationException("背包已改变，请重新扫描。");
      for (int slot = 0; slot < expected.Length; slot++) if (WarehouseFingerprint(plan.InventoryArray.GetValue(slot), false) != expected[slot].Stamp)
        throw new InvalidOperationException("背包物品已改变，原计划已取消；请重新扫描。");
    }
    private static Dictionary<int, WarehouseRule> WarehouseReadRules(Dictionary<string, object> args, WarehouseScan scan) {
      var result = new Dictionary<int, WarehouseRule>();
      foreach (var value in WarehouseList(args, "rules", WarehouseMaxChests)) {
        var row = value as Dictionary<string, object>; if (row == null) throw new InvalidOperationException("无效箱子规则。");
        var chest = WarehouseMatchChest(row, scan);
        if (result.ContainsKey(chest.Index)) throw new InvalidOperationException("箱子规则重复。");
        var category = Text(row, "category");
        if (category != "" && !WarehouseCategories.Contains(category)) throw new InvalidOperationException("未知仓库分类。");
        result.Add(chest.Index, new WarehouseRule { Excluded = Bool(row, "excluded"), KeepName = Bool(row, "keepName"), Category = category });
      }
      return result;
    }
    private static WarehouseChest WarehouseMatchChest(Dictionary<string, object> row, WarehouseScan scan) {
      int index = Number(row, "index", -1, 0, int.MaxValue), x = Number(row, "x", -1, 0, int.MaxValue), y = Number(row, "y", -1, 0, int.MaxValue);
      var chest = scan.Chests.FirstOrDefault(c => c.Index == index && c.X == x && c.Y == y);
      if (chest == null) throw new InvalidOperationException("箱子规则不属于本次扫描的位置，请重新扫描。");
      return chest;
    }
    private static Dictionary<int, string> WarehouseReadCategories(Dictionary<string, object> args) {
      var values = WarehouseObject(args, "categories") ?? new Dictionary<string, object>();
      if (values.Count > ItemCount()) throw new InvalidOperationException("分类表过大。");
      var result = new Dictionary<int, string>();
      foreach (var pair in values) {
        int type; var category = Convert.ToString(pair.Value);
        if (!int.TryParse(pair.Key, NumberStyles.Integer, CultureInfo.InvariantCulture, out type) || type <= 0 || type >= ItemCount() || !WarehouseCategories.Contains(category))
          throw new InvalidOperationException("分类表包含无效物品或分类。");
        result[type] = category;
      }
      return result;
    }
    private static string WarehouseCategory(WarehouseItem item, Dictionary<int, string> categories) { string category; return categories.TryGetValue(item.Type, out category) ? category : "other"; }
    private static WarehouseItem WarehouseWithStack(WarehouseItem item, int stack) {
      if (stack <= 0) return WarehouseEmpty();
      var value = R.Call(item.Value, "Clone"); R.Set(value, "stack", stack);
      return WarehouseCaptureItem(value);
    }
    private static WarehouseItem WarehouseEmpty() { return WarehouseCaptureItem(Activator.CreateInstance(R.T("Terraria.Item"))); }
    private static WarehouseItem[] WarehouseEmptySlots(int length) { return Enumerable.Range(0, length).Select(_ => WarehouseEmpty()).ToArray(); }
    private static List<WarehouseItem> WarehousePack(IEnumerable<WarehouseItem> source, Dictionary<int, string> categories) {
      var result = new List<WarehouseItem>();
      foreach (var group in source.Where(i => i.Type > 0 && i.Stack > 0).GroupBy(i => i.Key)) {
        var original = group.First(); long total = group.Sum(i => (long)i.Stack);
        while (total > 0) { int count = (int)Math.Min(total, original.Max); result.Add(WarehouseWithStack(original, count)); total -= count; }
      }
      return result.OrderBy(i => Array.IndexOf(WarehouseCategories, WarehouseCategory(i, categories))).ThenBy(i => i.Type).ThenBy(i => i.Prefix).ThenBy(i => i.Key, StringComparer.Ordinal).ThenByDescending(i => i.Stack).ToList();
    }
    private static object WarehousePreview(Dictionary<string, object> args) {
      WarehouseScan scan;
      if (!WarehouseScans.TryGetValue(Text(args, "scanId"), out scan)) throw new InvalidOperationException("扫描已失效，请重新扫描仓库。");
      WarehouseGuard(scan.Context, scan.Expires);
      string mode = Text(args, "mode");
      if (!new[] { "rename", "sort", "organize", "deposit" }.Contains(mode)) throw new InvalidOperationException("未知仓库操作。");
      if (mode == "deposit" && R.I(MainType, "netMode") != 0) throw new InvalidOperationException("本版背包存入仅支持单人模式；多人模式可使用箱子命名、排序和跨箱分类。");
      var rules = WarehouseReadRules(args, scan); var categories = WarehouseReadCategories(args);
      var plan = new WarehousePlan { Id = Guid.NewGuid().ToString("N"), ScanId = scan.Id, Mode = mode, Context = scan.Context, Expires = DateTime.UtcNow.AddMinutes(2), Changes = new List<WarehouseChange>() };
      foreach (var chest in scan.Chests) {
        WarehouseRule rule; if (!rules.TryGetValue(chest.Index, out rule)) rule = new WarehouseRule();
        string reason = !chest.Eligible ? chest.Reason : rule.Excluded ? "已排除此箱子" : "";
        if (reason != "") { plan.Skipped.Add(R.Dict("index", chest.Index, "x", chest.X, "y", chest.Y, "reason", reason)); continue; }
        WarehouseCheckChest(chest, chest.Items, chest.Name);
        plan.Changes.Add(new WarehouseChange { Before = chest, After = chest.Items.ToArray(), AfterName = chest.Name });
      }
      if (plan.Changes.Count == 0) throw new InvalidOperationException("范围内没有可以操作的箱子，请调整范围或排除规则。");
      if (mode == "rename") {
        var seen = new HashSet<int>();
        foreach (var value in WarehouseList(args, "names", WarehouseMaxChests)) {
          var row = value as Dictionary<string, object>; if (row == null) throw new InvalidOperationException("无效箱子名称。");
          var chest = WarehouseMatchChest(row, scan);
          if (!seen.Add(chest.Index)) throw new InvalidOperationException("箱子名称重复。");
          var name = Text(row, "name");
          if (name.Length > 20 || name.Any(c => char.IsControl(c))) throw new InvalidOperationException("箱子名称最多 20 个字符且不能包含控制字符。");
          var change = plan.Changes.FirstOrDefault(c => c.Before.Index == chest.Index); WarehouseRule rule;
          if (change != null && !(rules.TryGetValue(chest.Index, out rule) && rule.KeepName && !string.IsNullOrWhiteSpace(chest.Name))) change.AfterName = name;
        }
      } else if (mode == "sort") {
        foreach (var change in plan.Changes) {
          var packed = WarehousePack(change.Before.Items, categories);
          if (packed.Count > change.Before.Items.Length) throw new InvalidOperationException("箱子容量不足，无法安全整理。");
          change.After = WarehouseEmptySlots(change.Before.Items.Length);
          for (int slot = 0; slot < packed.Count; slot++) change.After[slot] = packed[slot];
        }
      } else if (mode == "organize") WarehouseOrganize(plan, rules, categories);
      else WarehouseDeposit(plan, scan, rules, categories, args);
      WarehouseConservation(plan);
      WarehouseDescribePlan(plan);
      var response = WarehouseBoundResponse(R.Dict("planId", plan.Id, "scanId", plan.ScanId, "worldId", plan.Context.WorldId, "mode", plan.Mode, "expiresAt", plan.Expires.ToString("o"),
        "summary", plan.Summary, "renames", plan.Renames, "moves", plan.Moves, "warnings", plan.Warnings, "skipped", plan.Skipped));
      foreach (var key in WarehousePlans.Where(p => p.Value.Context.Actor == plan.Context.Actor).Select(p => p.Key).ToArray()) WarehousePlans.Remove(key);
      WarehousePlans[plan.Id] = plan;
      return response;
    }
    private static void WarehouseOrganize(WarehousePlan plan, Dictionary<int, WarehouseRule> rules, Dictionary<int, string> categories) {
      var bins = new Dictionary<int, string>();
      foreach (var change in plan.Changes) {
        WarehouseRule rule; string category = rules.TryGetValue(change.Before.Index, out rule) ? rule.Category : "";
        var packed = WarehousePack(change.Before.Items, categories);
        if (category == "") category = packed.GroupBy(i => WarehouseCategory(i, categories)).OrderByDescending(g => g.Count()).ThenBy(g => Array.IndexOf(WarehouseCategories, g.Key)).Select(g => g.Key).FirstOrDefault() ?? "";
        bins[change.Before.Index] = category;
        change.After = WarehouseEmptySlots(change.Before.Items.Length);
        for (int slot = 0; slot < packed.Count; slot++) change.After[slot] = packed[slot];
      }
      // Transfer only into compatible stacks or empty slots. An item which cannot
      // fit stays in its source chest; no global repack ever evicts it. A second
      // pass can use space released by the first pass, without unbounded searches.
      for (int pass = 0; pass < 2; pass++) foreach (var source in plan.Changes) {
        for (int slot = 0; slot < source.After.Length; slot++) {
          var item = source.After[slot]; if (item.Type <= 0) continue;
          string category = WarehouseCategory(item, categories);
          if (bins[source.Before.Index] == category) continue;
          int remaining = item.Stack;
          var targets = plan.Changes.Where(c => c != source && (bins[c.Before.Index] == category || bins[c.Before.Index] == "")).OrderBy(c => bins[c.Before.Index] == "" ? 1 : 0).ThenBy(c => c.Before.Index).ToList();
          foreach (var target in targets) for (int dest = 0; dest < target.After.Length && remaining > 0; dest++) {
            var current = target.After[dest]; if (current.Type <= 0 || current.Key != item.Key || current.Stack >= current.Max) continue;
            int count = Math.Min(remaining, current.Max - current.Stack);
            target.After[dest] = WarehouseWithStack(current, current.Stack + count); remaining -= count; bins[target.Before.Index] = category;
          }
          foreach (var target in targets) for (int dest = 0; dest < target.After.Length && remaining > 0; dest++) {
            if (target.After[dest].Type > 0) continue;
            int count = Math.Min(remaining, item.Max); target.After[dest] = WarehouseWithStack(item, count); remaining -= count; bins[target.Before.Index] = category;
          }
          if (remaining != item.Stack) source.After[slot] = WarehouseWithStack(item, remaining);
        }
      }
      if (plan.Changes.Any(c => c.After.Any(i => i.Type > 0 && WarehouseCategory(i, categories) != bins[c.Before.Index])))
        plan.Warnings.Add("部分分类没有可用空间，未能归类的物品已留在原箱；可以增加空箱或调整专用分类。");
    }
    private static void WarehouseDeposit(WarehousePlan plan, WarehouseScan scan, Dictionary<int, WarehouseRule> rules, Dictionary<int, string> categories, Dictionary<string, object> args) {
      if (scan.Inventory.Length < 50) throw new InvalidOperationException("无法读取完整背包，请重新扫描。");
      plan.InventoryArray = scan.InventoryArray; plan.InventoryBefore = scan.Inventory; plan.InventoryAfter = scan.Inventory.ToArray();
      WarehouseCheckInventory(plan, plan.InventoryBefore);
      var reserves = new Dictionary<int, int>();
      foreach (var value in WarehouseList(args, "reserves", 128)) {
        var row = value as Dictionary<string, object>; if (row == null) throw new InvalidOperationException("无效保留物品规则。");
        int type = Number(row, "type", -1, 1, ItemCount() - 1), count = Number(row, "stack", -1, 0, int.MaxValue);
        if (reserves.ContainsKey(type)) throw new InvalidOperationException("保留物品规则重复。"); reserves.Add(type, count);
      }
      var retained = new Dictionary<int, long>();
      for (int slot = 0; slot < plan.InventoryBefore.Length; slot++) {
        var item = plan.InventoryBefore[slot];
        // Hotbar, favorites, coins/ammo and mouse slots are never sources.
        if (slot < 10 || slot >= 50 || item.Favorite) {
          long count; retained.TryGetValue(item.Type, out count); retained[item.Type] = count + item.Stack;
        }
      }
      int unable = 0;
      for (int slot = 10; slot < 50; slot++) {
        var item = plan.InventoryBefore[slot]; if (item.Type <= 0 || item.Favorite) continue;
        long have; retained.TryGetValue(item.Type, out have); int reserve; reserves.TryGetValue(item.Type, out reserve);
        int keep = (int)Math.Min(item.Stack, Math.Max(0L, reserve - have)); retained[item.Type] = have + keep;
        int remaining = item.Stack - keep;
        var targets = plan.Changes.Where(c => { WarehouseRule rule; return !rules.TryGetValue(c.Before.Index, out rule) || rule.Category == "" || rule.Category == WarehouseCategory(item, categories); })
          .OrderByDescending(c => c.After.Any(i => i.Type == item.Type)).ThenBy(c => c.Before.Index).ToList();
        foreach (var target in targets) for (int dest = 0; dest < target.After.Length && remaining > 0; dest++) {
          var current = target.After[dest];
          if (current.Type <= 0 || current.Key != item.Key || current.Stack >= current.Max) continue;
          int count = Math.Min(remaining, current.Max - current.Stack); target.After[dest] = WarehouseWithStack(current, current.Stack + count); remaining -= count;
        }
        foreach (var target in targets) for (int dest = 0; dest < target.After.Length && remaining > 0; dest++) {
          if (target.After[dest].Type > 0) continue;
          int count = Math.Min(remaining, item.Max); target.After[dest] = WarehouseWithStack(item, count); remaining -= count;
        }
        plan.InventoryAfter[slot] = WarehouseWithStack(item, keep + remaining);
        if (remaining > 0) unable++;
      }
      if (unable > 0) plan.Warnings.Add("部分物品没有适合的空位，已保留在背包；未丢弃任何物品。");
    }
    private static void WarehouseConservation(WarehousePlan plan) {
      var before = plan.Changes.SelectMany(c => c.Before.Items).Concat(plan.InventoryBefore ?? new WarehouseItem[0]);
      var after = plan.Changes.SelectMany(c => c.After).Concat(plan.InventoryAfter ?? new WarehouseItem[0]);
      var counts = new Dictionary<string, long>();
      foreach (var item in before.Where(i => i.Type > 0)) { long n; counts.TryGetValue(item.Key, out n); counts[item.Key] = checked(n + item.Stack); }
      foreach (var item in after.Where(i => i.Type > 0)) { long n; counts.TryGetValue(item.Key, out n); counts[item.Key] = checked(n - item.Stack); }
      if (counts.Values.Any(n => n != 0)) throw new InvalidOperationException("物品属性或数量守恒校验未通过；没有执行修改。");
    }
    private static Dictionary<string, object> WarehouseLocation(WarehouseChest chest, int slot) {
      return chest == null ? R.Dict("kind", "inventory", "slot", slot) : R.Dict("kind", "chest", "index", chest.Index, "x", chest.X, "y", chest.Y, "slot", slot);
    }
    private static string WarehouseLocationKey(Dictionary<string, object> location) { return Text(location, "kind") + ":" + Text(location, "index") + ":" + Text(location, "slot"); }
    private static void WarehouseDescribePlan(WarehousePlan plan) {
      var before = new List<WarehouseLocated>(); var after = new List<WarehouseLocated>();
      foreach (var change in plan.Changes) {
        change.Changed = change.AfterName != change.Before.Name || change.After.Where((item, i) => item.Stamp != change.Before.Items[i].Stamp).Any();
        if (change.AfterName != change.Before.Name) plan.Renames.Add(R.Dict("index", change.Before.Index, "x", change.Before.X, "y", change.Before.Y, "before", change.Before.Name, "after", change.AfterName));
        for (int slot = 0; slot < change.After.Length; slot++) {
          before.Add(new WarehouseLocated { Item = change.Before.Items[slot], Remaining = change.Before.Items[slot].Stack, Location = WarehouseLocation(change.Before, slot) });
          after.Add(new WarehouseLocated { Item = change.After[slot], Remaining = change.After[slot].Stack, Location = WarehouseLocation(change.Before, slot) });
        }
      }
      if (plan.InventoryBefore != null) for (int slot = 0; slot < plan.InventoryBefore.Length; slot++) {
        before.Add(new WarehouseLocated { Item = plan.InventoryBefore[slot], Remaining = plan.InventoryBefore[slot].Stack, Location = WarehouseLocation(null, slot) });
        after.Add(new WarehouseLocated { Item = plan.InventoryAfter[slot], Remaining = plan.InventoryAfter[slot].Stack, Location = WarehouseLocation(null, slot) });
      }
      // First subtract unchanged quantities at each location, then pair only the
      // real transfers. This exposes merges and splits accurately in the preview.
      for (int i = 0; i < before.Count; i++) if (before[i].Item.Key == after[i].Item.Key) {
        int retained = Math.Min(before[i].Remaining, after[i].Remaining); before[i].Remaining -= retained; after[i].Remaining -= retained;
      }
      var destinations = after.Where(v => v.Remaining > 0).GroupBy(v => v.Item.Key).ToDictionary(g => g.Key, g => new Queue<WarehouseLocated>(g));
      long itemsMoved = 0;
      foreach (var source in before.Where(v => v.Remaining > 0)) while (source.Remaining > 0) {
        Queue<WarehouseLocated> queue;
        if (!destinations.TryGetValue(source.Item.Key, out queue) || queue.Count == 0) throw new InvalidOperationException("仓库移动预览校验失败。");
        var destination = queue.Peek(); int count = Math.Min(source.Remaining, destination.Remaining);
        if (plan.Moves.Count >= 6000) throw new InvalidOperationException("本次整理超过 6000 条移动记录，请缩小仓库范围后分批预览；没有修改物品。");
        plan.Moves.Add(R.Dict("from", source.Location, "to", destination.Location, "type", source.Item.Type, "prefix", source.Item.Prefix, "stack", count));
        itemsMoved += count; source.Remaining -= count; destination.Remaining -= count;
        if (destination.Remaining == 0) queue.Dequeue();
      }
      plan.Summary = R.Dict("chests", plan.Changes.Count(c => c.Changed), "renames", plan.Renames.Count, "moves", plan.Moves.Count, "items", itemsMoved);
    }
    private static object WarehouseBoundResponse(object response) {
      // Leave room for the regular player/world snapshot in the 2 MB envelope.
      bool tooLarge;
      try { tooLarge = Encoding.UTF8.GetByteCount(Serialize(response)) > 1536 * 1024; }
      catch (InvalidOperationException) { tooLarge = true; }
      if (tooLarge) throw new InvalidOperationException("仓库结果过大，请缩小范围后分批预览；没有修改物品。");
      return response;
    }
    private static object WarehouseApply(Dictionary<string, object> args, bool undo) {
      WarehousePlan plan;
      var store = undo ? WarehouseUndos : WarehousePlans;
      string id = Text(args, undo ? "undoId" : "planId");
      if (!store.TryGetValue(id, out plan)) throw new InvalidOperationException(undo ? "没有可撤销的仓库操作，或撤销记录已过期。" : "计划已失效，请重新预览仓库操作。");
      WarehouseGuard(plan.Context, plan.Expires);
      var changes = undo ? plan.Changes.Where(c => c.Changed).ToList() : plan.Changes;
      foreach (var change in changes) WarehouseCheckChest(change.Before, undo ? change.After : change.Before.Items, undo ? change.AfterName : change.Before.Name);
      if (plan.InventoryBefore != null) WarehouseCheckInventory(plan, undo ? plan.InventoryAfter : plan.InventoryBefore);
      WarehouseConservation(plan);
      // A tick processes one transaction without yielding. Pre-check every source
      // before the first assignment; roll back all affected slots if assignment fails.
      try {
        foreach (var change in changes.Where(c => c.Changed)) WarehouseWriteChest(change, undo);
        if (plan.InventoryBefore != null) WarehouseWriteInventory(plan, undo);
      } catch {
        foreach (var change in changes.Where(c => c.Changed)) WarehouseWriteChest(change, !undo);
        if (plan.InventoryBefore != null) WarehouseWriteInventory(plan, !undo);
        throw;
      }
      store.Remove(id);
      var warnings = new List<string>(plan.Warnings);
      foreach (var change in changes.Where(c => c.Changed)) {
        try {
          for (int slot = 0; slot < change.After.Length; slot++) if (change.Before.Items[slot].Stamp != change.After[slot].Stamp) Send(32, change.Before.Index, slot);
          if (change.AfterName != change.Before.Name && R.I(MainType, "netMode") != 0)
            R.Call(R.T("Terraria.NetMessage"), "SendData", 69, -1, -1, null, change.Before.Index, (float)change.Before.X, (float)change.Before.Y);
        } catch { warnings.Add("箱子已修改，但部分网络通知未送达；重新打开箱子可刷新内容。"); }
      }
      if (undo) return R.Dict("undone", true, "worldId", plan.Context.WorldId, "summary", plan.Summary, "warnings", warnings);
      // Only one undo per actor is retained. A second application cannot make an
      // older undo overwrite the user's intervening warehouse changes.
      foreach (var key in WarehouseUndos.Where(p => p.Value.Context.Actor == plan.Context.Actor).Select(p => p.Key).ToArray()) WarehouseUndos.Remove(key);
      string undoId = Guid.NewGuid().ToString("N"); plan.Expires = DateTime.UtcNow.AddMinutes(10); WarehouseUndos[undoId] = plan;
      WarehouseScans.Remove(plan.ScanId);
      return R.Dict("applied", true, "worldId", plan.Context.WorldId, "undoId", undoId, "expiresAt", plan.Expires.ToString("o"), "summary", plan.Summary, "warnings", warnings);
    }
    private static void WarehouseWriteChest(WarehouseChange change, bool restore) {
      var items = restore ? change.Before.Items : change.After;
      for (int slot = 0; slot < items.Length; slot++) if (change.Before.Items[slot].Stamp != change.After[slot].Stamp)
        change.Before.Array.SetValue(items[slot].Value == null ? null : R.Call(items[slot].Value, "Clone"), slot);
      R.Set(change.Before.Chest, "name", restore ? change.Before.Name : change.AfterName);
    }
    private static void WarehouseWriteInventory(WarehousePlan plan, bool restore) {
      var items = restore ? plan.InventoryBefore : plan.InventoryAfter;
      for (int slot = 0; slot < items.Length; slot++) if (plan.InventoryBefore[slot].Stamp != plan.InventoryAfter[slot].Stamp)
        plan.InventoryArray.SetValue(items[slot].Value == null ? null : R.Call(items[slot].Value, "Clone"), slot);
    }
  }
}

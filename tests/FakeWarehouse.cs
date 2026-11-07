// Test API only: exercises native cloning and unknown item fields without game code.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;

namespace Terraria {
  public sealed class WarehouseItemData { public int Charge; public byte[] Bytes = new byte[] { 3, 7, 11 }; }
  public partial class Item {
    public string warehouseTag = "";
    public int warehouseDamage;
    public WarehouseItemData warehouseData;
    public Item Clone() { return (Item)MemberwiseClone(); }
  }
  public partial class Player {
    public bool warehouseInventoryLocked;
    public bool HasLockedInventory() { return warehouseInventoryLocked; }
  }
  public static class WarehouseFixture {
    private static string ReportPath { get { return Path.Combine(Main.FixtureRoot, Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE") == "server" ? "server-warehouse-report.txt" : "warehouse-report.txt"); } }
    private static Item Make(int type, int count, string tag = "", int damage = 0, int prefix = 0, bool favorite = false) {
      var item = new Item(); item.SetDefaults(type); item.stack = count; item.prefix = prefix;
      item.warehouseTag = tag; item.warehouseDamage = damage; item.favorited = favorite;
      item.warehouseData = new WarehouseItemData { Charge = damage + 1 };
      return item;
    }
    private static Chest ChestAt(int index, string name = "") { return new Chest { x = 600 + index - 20, y = 240, name = name }; }
    private static void Reset() {
      Main.worldID = 98765; Main.versionNumber = "Terraria 1.4.5.8 [Test Harness]";
      Main.player[0].warehouseInventoryLocked = false;
      Main.chest = new Chest[8000];
      for (int i = 20; i <= 25; i++) Main.chest[i] = ChestAt(i);
      Main.chest[20].name = "原有名字";
      Main.chest[20].item[5] = Make(28, 12, "heal-a", 99);
      Main.chest[20].item[7] = Main.chest[20].item[5].Clone(); Main.chest[20].item[7].stack = 6;
      Main.chest[20].item[2] = Make(8, 3, "torch", 17);
      Main.chest[20].item[4] = Make(28, 4, "heal-b", 99, 81);
      Main.chest[21].item[0] = Make(8, 9, "torch", 17);
      Main.chest[23].fixtureLocked = true; Main.chest[23].item[0] = Make(28, 11, "locked", 5);
      Main.chest[24].fixtureInUse = true; Main.chest[24].item[0] = Make(8, 13, "occupied", 6);
      Main.chest[25].item[0] = Make(28, 1); Main.chest[25].item[0].maxStack = 0;
      var inventory = Main.player[0].inventory;
      for (int slot = 0; slot < inventory.Length; slot++) inventory[slot] = new Item();
      inventory[0] = Make(28, 10, "hotbar", 101);
      inventory[10] = Make(28, 50, "heal-a", 99);
      inventory[11] = Make(28, 7, "favorite", 102, 0, true);
      inventory[12] = Make(8, 20, "torch", 17);
      inventory[50] = Make(71, 99, "coins", 103);
      inventory[54] = Make(40, 99, "ammo", 104);
    }
    private static void Report() {
      var rows = new List<string>();
      for (int index = 0; index < Main.chest.Length; index++) if (Main.chest[index] != null) {
        var chest = Main.chest[index];
        rows.Add("name|" + index + "|" + chest.name);
        for (int slot = 0; slot < chest.item.Length; slot++) if (chest.item[slot] != null && chest.item[slot].type > 0) rows.Add(ItemRow("chest", index, slot, chest.item[slot]));
      }
      for (int slot = 0; slot < Main.player[0].inventory.Length; slot++) if (Main.player[0].inventory[slot] != null && Main.player[0].inventory[slot].type > 0) rows.Add(ItemRow("inventory", 0, slot, Main.player[0].inventory[slot]));
      File.WriteAllLines(ReportPath, rows);
    }
    private static string ItemRow(string kind, int index, int slot, Item item) {
      return string.Join("|", new object[] { kind, index, slot, item.type, item.stack, item.prefix, item.favorited, item.maxStack,
        item.warehouseTag, item.warehouseDamage, item.warehouseData == null ? -1 : item.warehouseData.Charge,
        item.warehouseData == null ? "" : string.Join(",", item.warehouseData.Bytes) });
    }
    public static void ApplyControl(string action) {
      if (!action.StartsWith("warehouse", StringComparison.Ordinal)) return;
      if (action == "warehouseReset") Reset();
      else if (action == "warehouseMutate") { Main.chest[20].item.First(i => i.type == 28).stack++; }
      else if (action == "warehouseMutateNested") { Main.chest[20].item.First(i => i.type == 28).warehouseData.Bytes[1]++; }
      else if (action == "warehouseOccupy") Main.chest[21].fixtureInUse = true;
      else if (action == "warehouseExcludedChange") Main.chest[23].item[0].stack++;
      else if (action == "warehouseLock") Main.chest[20].fixtureLocked = true;
      else if (action == "warehouseReplace") {
        var old = Main.chest[20]; Main.chest[20] = ChestAt(20, old.name); Main.chest[20].item = old.item;
      } else if (action == "warehouseMoveChest") Main.chest[20].x++;
      else if (action == "warehouseWorld") Main.worldID++;
      else if (action == "warehouseActor") Main.player[0].name += "切换";
      else if (action == "warehouseFutureVersion") Main.versionNumber = "Terraria 1.4.5.9";
      else if (action == "warehouseInventoryChange") Main.player[0].inventory[10].stack++;
      else if (action == "warehouseInventoryLock") Main.player[0].warehouseInventoryLocked = true;
      else if (action == "warehouseTooMany") {
        Main.chest = new Chest[8000]; for (int i = 20; i <= 148; i++) Main.chest[i] = ChestAt(i);
      } else if (action == "warehouseTooManySlots") Main.chest[20].item = Enumerable.Range(0, 8193).Select(_ => new Item()).ToArray();
      else if (action == "warehouseFull") {
        for (int index = 20; index <= 22; index++) for (int slot = 0; slot < Main.chest[index].item.Length; slot++) Main.chest[index].item[slot] = Make(8, 9999, "full-" + index + "-" + slot, 17);
      } else if (action == "warehouseNullSlot") Main.chest[20].item[0] = null;
      Report();
    }
  }
}

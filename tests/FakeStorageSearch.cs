// Integration fixture only. Does not ship with the App or contain game code.
using System;
using System.Linq;

namespace Terraria {
  public partial class Main {
    public static int maxChests = 8000;
    public static Chest[] chest = StorageSearchFixture.InitialChests();
  }
  public partial class Chest {
    public int x, y;
    public string name = "";
    public bool fixtureLocked, fixtureInUse;
    public static bool IsLocked(int x, int y) {
      var match = Main.chest.FirstOrDefault(value => value != null && value.x == x && value.y == y);
      return match != null && match.fixtureLocked;
    }
    public static int UsingChest(int index) { return Main.chest[index].fixtureInUse ? 0 : -1; }
  }
  public class EquipmentLoadout {
    public Item[] Armor = Enumerable.Range(0, 20).Select(_ => new Item()).ToArray();
    public Item[] Dye = Enumerable.Range(0, 10).Select(_ => new Item()).ToArray();
  }
  public partial class Player {
    public EquipmentLoadout[] Loadouts = StorageSearchFixture.InitialLoadouts();
  }
  public static class StorageSearchFixture {
    public static Chest[] InitialChests() {
      var chests = new Chest[8000];
      bool clientOnly = Environment.GetEnvironmentVariable("TERRA_WORKSHOP_TEST_MULTIPLAYER") == "1" &&
        Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE") != "server";
      chests[0] = new Chest { x = 200, y = 220, name = "药水箱" };
      chests[0].item[2] = Item(28, clientOnly ? 999 : 15);
      chests[3] = new Chest { x = 350, y = 430, name = "地牢药箱", fixtureLocked = true, fixtureInUse = true,
        item = Enumerable.Range(0, 60).Select(_ => new Item()).ToArray() };
      chests[3].item[0] = Item(28, 20);
      chests[3].item[45] = Item(28, 7);
      chests[7999] = new Chest { x = 1000, y = 700, name = new string('箱', 100) };
      chests[7999].item[39] = Item(8, 99);
      return chests;
    }
    public static EquipmentLoadout[] InitialLoadouts() {
      var loadouts = Enumerable.Range(0, 3).Select(_ => new EquipmentLoadout()).ToArray();
      loadouts[1].Armor[4] = Item(28, 2);
      loadouts[2].Dye[7] = Item(100, 1);
      return loadouts;
    }
    private static Item Item(int type, int stack) { var item = new Item(); item.SetDefaults(type); item.stack = stack; return item; }
    public static void ApplyControl(string action) {
      if (action == "storageChangeWorld") { Main.worldID = 98766; Main.chest = new Chest[8000]; }
      if (action == "storageRestoreWorld") { Main.worldID = 98765; Main.chest = InitialChests(); }
      if (action == "storageRemoveFirstMatch") Main.chest[0].item[2] = new Item();
    }
  }
}

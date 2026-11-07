// Test fixture only; no Terraria assets or executable code are shipped here.
using System;
using System.Linq;

namespace Terraria {
  public partial class NPC {
    public static bool savedGoblin, savedWizard, savedMech, savedStylist, savedAngler, savedTaxCollector, savedBartender, savedGolfer;
    public static bool unlockedMerchantSpawn, unlockedNurseSpawn, unlockedArmsDealerSpawn, unlockedDemolitionistSpawn, unlockedDyeTraderSpawn, unlockedPartyGirlSpawn, unlockedPrincessSpawn;
    public static bool unlockedSlimeBlueSpawn, unlockedSlimeGreenSpawn, unlockedSlimeOldSpawn, unlockedSlimePurpleSpawn, unlockedSlimeRainbowSpawn, unlockedSlimeRedSpawn, unlockedSlimeYellowSpawn, unlockedSlimeCopperSpawn;
    public static bool boughtCat, boughtDog, boughtBunny;
    public static bool SpawnAllowed_Merchant() {
      long value = Main.player.Where(p => p.active).SelectMany(p => p.inventory).Where(i => i != null).Sum(i => (long)i.stack * (i.type == 71 ? 1 : i.type == 72 ? 100 : i.type == 73 ? 10000 : i.type == 74 ? 1000000 : 0));
      return unlockedMerchantSpawn || value >= 5000;
    }
    public static bool SpawnAllowed_Nurse() { return unlockedNurseSpawn || Main.player.Any(p => p.active && p.statLifeMax >= 120); }
    public static bool SpawnAllowed_ArmsDealer() { return unlockedArmsDealerSpawn; }
    public static bool SpawnAllowed_Demolitionist() { return unlockedDemolitionistSpawn; }
    public static bool SpawnAllowed_DyeTrader() { return unlockedDyeTraderSpawn; }
  }
  public partial class Main {
    public static bool infectedSeed, vampireSeed, tenthAnniversaryWorld, getGoodWorld, xMas;
    public static double ResidentBestiaryPercent;
    public static ResidentBestiaryReport GetBestiaryProgressReport() { return new ResidentBestiaryReport { CompletionPercent = ResidentBestiaryPercent }; }
  }
  public class ResidentBestiaryReport { public double CompletionPercent { get; set; } }
  public static class ResidentConditionsFixture {
    static int originalWorldId;
    static bool saved;
    static void Town(int slot, int id) {
      Main.npc[slot].SetDefaults(id); Main.npc[slot].active = Main.npc[slot].townNPC = true;
      Main.npc[slot].position = new Vec((200 + slot * 3) * 16, 100 * 16); Main.npc[slot].homeless = true;
    }
    public static void ApplyControl(string action) {
      if (action == "residentBaseline") {
        if (!saved) { originalWorldId = Main.worldID; saved = true; }
        foreach (var n in Main.npc) n.active = false;
        foreach (var p in Main.player) foreach (var item in p.inventory) if (item.type >= 71 && item.type <= 74) item.SetDefaults(0);
        NPC.unlockedMerchantSpawn = NPC.unlockedNurseSpawn = NPC.unlockedArmsDealerSpawn = NPC.unlockedDemolitionistSpawn = NPC.unlockedDyeTraderSpawn = NPC.unlockedPartyGirlSpawn = NPC.unlockedPrincessSpawn = false;
        NPC.savedGoblin = false;
        Main.infectedSeed = Main.vampireSeed = Main.tenthAnniversaryWorld = Main.getGoodWorld = false;
        Main.ResidentBestiaryPercent = 0;
        Town(0, 22);
        Main.worldID = originalWorldId + 71;
      }
      if (action == "resident49Silver") { Main.player[0].inventory[50].SetDefaults(72); Main.player[0].inventory[50].stack = 49; Main.worldID++; }
      if (action == "resident50Silver") { Main.player[0].inventory[50].SetDefaults(72); Main.player[0].inventory[50].stack = 50; Main.worldID++; }
      if (action == "residentUnlocked") { Main.player[0].inventory[50].SetDefaults(0); NPC.unlockedMerchantSpawn = true; NPC.savedGoblin = true; Main.ResidentBestiaryPercent = 0.2; Main.worldID++; }
      if (action == "residentPopulation8") { for (int i = 0; i < 8; i++) Town(i, new[]{22,17,18,19,637,638,656,670}[i]); NPC.unlockedDyeTraderSpawn = true; Main.worldID++; }
      if (action == "residentUnknownVersion") { Main.versionNumber = "Terraria 1.4.4.9 [Test Harness]"; Main.worldID++; }
      if (action == "residentRestore") {
        Main.versionNumber = "Terraria 1.4.5.8 [Test Harness]";
        if (saved) Main.worldID = originalWorldId;
        foreach (var n in Main.npc) n.active = false;
        NPC.unlockedMerchantSpawn = NPC.savedGoblin = NPC.unlockedDyeTraderSpawn = false;
        Main.ResidentBestiaryPercent = 0;
      }
    }
  }
}
namespace Terraria.GameContent.Events { public static class BirthdayParty { public static bool GenuineParty; } }

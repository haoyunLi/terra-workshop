# Third-party notices

The application source code is GPL-3.0-or-later except where the original license of a third-party file says otherwise. Data and artwork are licensed separately. This project does not grant rights to Terraria itself.

| Component | Source | License / usage |
| --- | --- | --- |
| Runtime launcher | https://github.com/ConfuzzedCat/TerrariaInjector | GPL-3.0. Original copyright notices retained in `bridge/src/launcher`; full license at `LICENSE`. |
| Terraria Progress Tracker | https://github.com/Doeschi/Terraria-Progress-Tracker | MIT for code and test reader, copied license in `LICENSES`. Wiki data and sprites are CC BY-NC-SA 4.0. |
| TEdit | https://github.com/TEdit/Terraria-Map-Editor | Microsoft Public License; item identities, names, localization and NPC metadata. License in `LICENSES`. |
| Terraria Plr Editor | https://github.com/royalrizen/Terraria-Plr-Editor | MIT; item metadata used during database preparation. License in `LICENSES`. |
| TerrariaModder | https://github.com/Inidar1/terraria-modder | MIT; consulted for runtime integration patterns, not bundled as a mod framework. License in `LICENSES`. |
| Harmony 2.4.2 | https://github.com/pardeike/Harmony | MIT; restored from NuGet and bundled with compiled runtime. License in `LICENSES`. |
| Mono.Cecil 0.11.6 | https://github.com/jbevain/cecil | MIT; restored from NuGet and bundled with compiled runtime. License in `LICENSES`. |
| Microsoft.Net.Compilers.Toolset 4.12.0 | https://github.com/dotnet/roslyn | MIT; build tool only, downloaded from NuGet and not committed. |
| React / React DOM | https://github.com/facebook/react | MIT; installed via npm. |
| Lucide | https://github.com/lucide-icons/lucide | ISC; installed via npm. |
| Vite | https://github.com/vitejs/vite | MIT; build dependency. |
| Electron | https://github.com/electron/electron | MIT and bundled Chromium/Node third-party notices. Packaged apps retain Electron's `LICENSE` and `LICENSES.chromium.html`. |
| Electron Packager | https://github.com/electron/packager | BSD-2-Clause; packaging dependency. |

## Launcher adaptation

Files `Program.cs`, `Logger.cs`, `LifecycleHooks.cs`, and `ModCountLabel.cs` derive from TerrariaInjector. Changes use an environment-selected game path and logging directory, avoid renaming the installed game executable, disable console logging in the companion launcher, and add `LauncherBootstrap.cs` to establish a game-root AppDomain and resolve loader dependencies. The custom reflection bridge is in `bridge/src/WorkshopBridge.cs`.

Source code, build scripts, fixed dependency versions and restoration hashes are provided in this repository. Compiling the runtime also copies corresponding launcher and bridge source beside the binaries.

## Wiki data, sprites and descriptions

`public/data/game.json`, `public/data/recipes.json` and `public/icons/` include transformed Terraria Wiki material obtained via Terraria Progress Tracker. Sources: https://terraria.wiki.gg/ and https://github.com/Doeschi/Terraria-Progress-Tracker . This material is distributed under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International**: https://creativecommons.org/licenses/by-nc-sa/4.0/ . Its license is independent of the source-code license.

Transformations include Chinese/English item-name merging, desktop item identity corrections, category and stat normalization, search indices, descriptions assembled from attributes, localized display names and NPC metadata. Most descriptions are generated summaries rather than literal game tooltips. Game artwork remains associated with Terraria / Re-Logic. The pixel tree app mark was generated for this project with OpenAI ImageGen and is not an official Terraria logo.

## Independent reader and synthetic fixtures

`vendor/player-reader/` contains JavaScript converted from Terraria Progress Tracker's TypeScript player reader, used for independent validation of the offline utility module. `public/examples/classic.plr` and `journey.plr` are upstream synthetic test characters, not the user's personal saves. They are included only for tests. `tests/FakeTerraria.cs` is a small simulated API written for integration tests; it contains no extracted game code or game assets.

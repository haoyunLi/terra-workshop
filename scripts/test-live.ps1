#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build-bridge.ps1')
$testRoot = Join-Path $appRoot '.work/tests'
$gameRoot = Join-Path $testRoot 'game'
New-Item -ItemType Directory -Path (Join-Path $gameRoot 'Content') -Force | Out-Null
[IO.File]::WriteAllBytes((Join-Path $gameRoot 'Content/PixelShader.xnb'),[byte[]]@(1,3,3,7))
$compiler = Join-Path $appRoot '.work/tools/compiler/tasks/net472/csc.exe'
& $compiler /nologo /target:winexe /platform:anycpu32bitpreferred /optimize+ "/out:$gameRoot/Terraria.exe" (Join-Path $appRoot 'tests/FakeTerraria.cs')
if ($LASTEXITCODE -ne 0) {throw 'Simulated fixture compilation failed.'}
Push-Location $appRoot
try {node tests/live.integration.mjs; if ($LASTEXITCODE -ne 0) {throw 'Live integration test failed.'}}
finally {Pop-Location}

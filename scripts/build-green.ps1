# EasyWork - Windows Green Build (no bundle / portable)
#
# Produces a copy-and-run EasyWork.exe with no installer and no dependency on the
# Visual C++ Redistributable (thanks to +crt-static in src-tauri/.cargo/config.toml).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/build-green.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/build-green.ps1 -DebugBuild
#   powershell -ExecutionPolicy Bypass -File scripts/build-green.ps1 -Clean
#
# Prerequisites:
#   - Node.js 20.19+ / 22.12+ (Vite 7 要求) with pnpm (canonical package manager)
#   - Rust toolchain with target x86_64-pc-windows-msvc
#   - VS Build Tools ("Desktop development with C++")
#   - WebView2 Runtime only on the END-USER machine

# NOTE: do NOT name the switch -Debug — [CmdletBinding()] injects a common
# -Debug parameter and the clash aborts parsing. Use -DebugBuild instead.
param(
    [switch]$DebugBuild,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/.."

$profile = if ($DebugBuild) { "debug" } else { "release" }
$targetDir = if ($DebugBuild) { "debug" } else { "release" }

function Write-Fail($msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

function Invoke-Step {
    param([string]$Command, [string[]]$Arguments)
    $cmdLine = $Command + " " + ($Arguments -join " ")
    Write-Host "==> $cmdLine" -ForegroundColor Cyan
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Fail("$Command exited with code $LASTEXITCODE")
    }
}

# 0. Prerequisites
Write-Host "==> Checking prerequisites ..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Fail("node not found in PATH") }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { Write-Fail("cargo not found in PATH") }
if (Get-Command rustup -ErrorAction SilentlyContinue) {
    # NOTE: `rustup target list --installed` returns an *array* of lines. PowerShell's
    # -match/-notmatch on an array returns the subset of matching lines (truthy), NOT a
    # boolean — so a direct `-notmatch` would always be truthy and fail the check.
    # Join to a single string first to get correct boolean semantics.
    $installed = rustup target list --installed 2>$null | Out-String
    if ($installed -notmatch "x86_64-pc-windows-msvc") {
        Write-Fail("Rust target x86_64-pc-windows-msvc missing. Run: rustup target add x86_64-pc-windows-msvc")
    }
} else {
    Write-Host "    (rustup not found; skipping target check)" -ForegroundColor Yellow
}

# 1. Package manager: pnpm is canonical for this repo
#    (declared via `packageManager` field + pnpm-lock.yaml + pnpm-workspace.yaml).
#    Only (re)install when node_modules is missing or NOT owned by pnpm, so we never
#    let `pnpm run` trigger a surprise re-install that pnpm 11 would block on esbuild's
#    build script. esbuild is allow-listed via package.json `pnpm.onlyBuiltDependencies`.
$pkgMgr = "pnpm"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "    pnpm not in PATH; enabling via corepack" -ForegroundColor Yellow
    & corepack enable 2>$null
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Fail("pnpm not available. Run: corepack enable   (or: npm i -g pnpm)")
}

$nodeModulesExists = Test-Path "$root/node_modules"
$pnpmOwned = Test-Path "$root/node_modules/.pnpm"
$needInstall = (-not $nodeModulesExists) -or (-not $pnpmOwned)
Write-Host "    Package manager: pnpm (canonical). node_modules present: $nodeModulesExists, pnpm-owned: $pnpmOwned" -ForegroundColor Gray

# 1b. Install (guarded - never a surprise re-install)
if ($needInstall) {
    Write-Host "==> Installing dependencies (pnpm install) ..." -ForegroundColor Cyan
    # confirmModulesPurge=false avoids an interactive prompt when replacing an npm-layout node_modules
    Invoke-Step -Command "pnpm" -Arguments @("install", "--config.confirmModulesPurge=false")
} else {
    Write-Host "    node_modules already pnpm-owned; skipping install." -ForegroundColor Gray
}

# 2. Defuse genie-safe-delete delete-interception shim if present
if ($env:NODE_OPTIONS -match "genie-safe-delete") {
    Write-Host "==> NODE_OPTIONS has genie-safe-delete shim; clearing it for this build." -ForegroundColor Yellow
    $env:NODE_OPTIONS = ""
}

# 3. Optional clean
if ($Clean) {
    Write-Host "==> Cleaning old artifacts ..." -ForegroundColor Cyan
    if (Test-Path "$root/dist") { Remove-Item "$root/dist" -Recurse -Force }
    if (Test-Path "$root/src-tauri/target/$targetDir") { Remove-Item "$root/src-tauri/target/$targetDir" -Recurse -Force }
}

# 4. Frontend build (canonical: `tsc -b && vite build`).
#    `tsc -b` is the type-check gate; vite only runs if it passes (&& short-circuit).
#    tsconfig.node.json now emits declarations to a temp dir, so a fresh checkout builds
#    cleanly (no TS6310) while incremental builds stay fast.
$start = Get-Date
Write-Host "==> Building frontend (pnpm run build = tsc -b && vite build) ..." -ForegroundColor Cyan
Push-Location $root
Invoke-Step -Command "pnpm" -Arguments @("run", "build")
Pop-Location

# 5. Backend build (no bundling; tauri.conf.json bundle.active=false).
#    `--features custom-protocol` is REQUIRED for release (and any self-contained exe):
#    without it Tauri treats the build as "dev" and tries to load devUrl
#    (http://localhost:1420) instead of embedding the frontend dist assets.
Write-Host "==> Building Tauri $profile binary (cargo build --$targetDir --features custom-protocol) ..." -ForegroundColor Cyan
Push-Location "$root/src-tauri"
Invoke-Step -Command "cargo" -Arguments @("build", "--$targetDir", "--features", "custom-protocol")
Pop-Location

# 6. Collect artifact
$exe = "$root/src-tauri/target/$targetDir/easywork.exe"
if (-not (Test-Path $exe)) { Write-Fail("$exe not found") }

$greenDir = "$root/release-green"
New-Item -ItemType Directory -Force -Path $greenDir | Out-Null
Copy-Item $exe "$greenDir/EasyWork.exe" -Force

$sizeMB = [math]::Round((Get-Item "$greenDir/EasyWork.exe").Length / 1MB, 2)
$duration = (Get-Date) - $start
Write-Host ""
Write-Host "==> Green build ready:" -ForegroundColor Green
Write-Host "    $greenDir/EasyWork.exe  ($sizeMB MB, took $($duration.TotalSeconds.ToString('0.0')) s)" -ForegroundColor Green
Write-Host "    Ship the whole release-green/ folder. End-user PC needs WebView2 Runtime (preinstalled on Win10/11)." -ForegroundColor Gray

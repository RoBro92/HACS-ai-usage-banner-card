param(
  [string]$InstallDir = "$env:USERPROFILE\ai-usage-card",
  [string]$RepoUrl = "https://github.com/RoBro92/HACS-ai-usage-banner-card.git"
)

$ErrorActionPreference = "Stop"

function Require-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host $InstallHint
    throw "$Name is required"
  }
}

Require-Command git "Install Git with: winget install --id Git.Git"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
}

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  npm install -g @openai/codex
}

if (-not (Get-Command gemini -ErrorAction SilentlyContinue)) {
  npm install -g @google/gemini-cli
}

if (Test-Path $InstallDir) {
  Remove-Item $InstallDir -Recurse -Force
}
git clone --depth=1 $RepoUrl $InstallDir

$envFile = Join-Path $InstallDir ".env.ps1"
if (-not (Test-Path $envFile)) {
  @'
$env:MQTT_HOST="homeassistant.local"
$env:MQTT_PORT="1883"
$env:MQTT_USER=""
$env:MQTT_PASSWORD=""
'@ | Set-Content -Path $envFile -Encoding UTF8
}

$runner = Join-Path $InstallDir "examples\collectors\run-ai-usage-collector.mjs"
$codexAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"& '$envFile'; node '$runner' --provider codex`""
$geminiAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"& '$envFile'; node '$runner' --provider gemini`""

schtasks /Create /TN "AI Usage Codex" /SC MINUTE /MO 15 /TR $codexAction /F | Out-Null
schtasks /Create /TN "AI Usage Gemini" /SC MINUTE /MO 15 /TR $geminiAction /F | Out-Null

Write-Host "Installed AI usage collector in $InstallDir."
Write-Host "Edit $envFile with MQTT credentials, then run the scheduled tasks or wait up to 15 minutes."

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$tempDir = Join-Path $projectRoot ".tmp"
$npmCacheDir = Join-Path $projectRoot ".npm-cache"

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
New-Item -ItemType Directory -Force -Path $npmCacheDir | Out-Null

$env:TEMP = $tempDir
$env:TMP = $tempDir
$env:npm_config_cache = $npmCacheDir

Write-Host "TEMP=$env:TEMP"
Write-Host "TMP=$env:TMP"
Write-Host "npm_config_cache=$env:npm_config_cache"
Write-Host ""
Write-Host "Examples:"
Write-Host "  npm install"
Write-Host "  npm run dev"
Write-Host "  npm run build"
Write-Host ""
Write-Host "This window now uses project-local temp and npm cache directories."

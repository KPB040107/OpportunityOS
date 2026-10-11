param([int]$Port=3000)
$ErrorActionPreference='Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot=Join-Path $projectRoot 'web'
$runtimeRoot=Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $webRoot '.next/BUILD_ID'))) { throw 'Build the website first: run pnpm build inside web.' }
$nodePath=(Get-Command node -ErrorAction Stop).Source
$healthUrl="http://localhost:$Port/login"
try {
  $existing=Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -UseBasicParsing
  if ($existing.StatusCode -eq 200 -and $existing.Content -match 'OpportunityOS') { Write-Host "Website is already running: http://localhost:$Port"; exit 0 }
} catch { }
$server=Start-Process -FilePath $nodePath -ArgumentList @('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',"$Port") -WorkingDirectory $webRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'website.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'website.err.log')
$server.Id | Set-Content -LiteralPath (Join-Path $runtimeRoot 'website.pid')
Write-Host "Website starting: http://localhost:$Port"

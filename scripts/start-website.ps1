param([int]$Port=3000)
$ErrorActionPreference='Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$webRoot=Join-Path $projectRoot 'web'
$runtimeRoot=Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $webRoot '.next/BUILD_ID'))) { throw 'Build the website first: run pnpm build inside web.' }
$nodePath=& (Join-Path $PSScriptRoot 'resolve-node-runtime.ps1')
$healthUrl="http://localhost:$Port/login"
function Test-WebsiteHealth {
  try {
    $existing = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -UseBasicParsing
    return ($existing.StatusCode -eq 200 -and $existing.Content -match 'OpportunityOS')
  } catch { return $false }
}

if (Test-WebsiteHealth) {
  Write-Host "Website is already running: http://localhost:$Port"
  exit 0
}

function Start-PersistentProcess([string]$FilePath, [string]$ArgumentList, [string]$WorkingDirectory) {
  $cmd = "`"$FilePath`" $ArgumentList"
  try {
    $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
      CommandLine = $cmd
      CurrentDirectory = $WorkingDirectory
    }
    if ($res.ReturnValue -eq 0 -and $res.ProcessId) {
      $p = Get-Process -Id $res.ProcessId -ErrorAction SilentlyContinue
      if ($p) { return $p }
    }
  } catch {}
  return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru
}

$server = Start-PersistentProcess $nodePath "node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $Port" $webRoot
$server.Id | Set-Content -LiteralPath (Join-Path $runtimeRoot 'website.pid')

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Test-WebsiteHealth) {
    Write-Host "Website is ready: http://localhost:$Port"
    exit 0
  }
  Start-Sleep -Seconds 1
}
throw "Website failed to pass health check within 30 seconds."

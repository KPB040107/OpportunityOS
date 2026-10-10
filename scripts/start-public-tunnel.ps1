$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$localDir = Join-Path $workspace '.local'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$cloudflaredPath = Join-Path $workspace '.tools\cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflaredPath)) { throw 'Install the verified Cloudflare executable in .tools first.' }
$expectedHash = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
if ((Get-FileHash -Algorithm SHA256 $cloudflaredPath).Hash.ToLower() -ne $expectedHash) { throw 'Cloudflare executable checksum mismatch.' }
function Get-OwnedProcess([string]$PidFile, [string]$ExpectedPath) {
    if (-not (Test-Path -LiteralPath $PidFile)) { return $null }
    $savedPid = [int](Get-Content -LiteralPath $PidFile)
    $savedProcess = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
    if ($savedProcess -and $savedProcess.Path -eq $ExpectedPath) { return $savedProcess }
    return $null
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$gatewayPid = Join-Path $localDir 'gateway.pid'
if (-not (Get-OwnedProcess $gatewayPid $nodePath)) {
    $listener = Get-NetTCPConnection -LocalPort 5680 -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw 'Port 5680 is occupied by an unrelated process.' }
    $gatewayScript = Join-Path $PSScriptRoot 'webhook-gateway.mjs'
    $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $gatewayScript + '"') -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDir 'gateway.out.log') -RedirectStandardError (Join-Path $localDir 'gateway.err.log')
    [System.IO.File]::WriteAllText($gatewayPid, $process.Id.ToString())
}
$tunnelPid = Join-Path $localDir 'tunnel.pid'
$tunnelLog = Join-Path $localDir 'tunnel.err.log'
if (-not (Get-OwnedProcess $tunnelPid $cloudflaredPath)) {
    $process = Start-Process -FilePath $cloudflaredPath -ArgumentList '--no-autoupdate tunnel --protocol http2 --url http://127.0.0.1:5680' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDir 'tunnel.out.log') -RedirectStandardError $tunnelLog
    [System.IO.File]::WriteAllText($tunnelPid, $process.Id.ToString())
}
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-Path -LiteralPath $tunnelLog) {
        $stream = [System.IO.File]::Open($tunnelLog, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $reader = New-Object System.IO.StreamReader($stream)
        try { $logText = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $match = [regex]::Match($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            & (Join-Path $PSScriptRoot 'set-public-url.ps1') -Url ($match.Value + '/')
            Write-Output ('Public webhook base URL: ' + $match.Value + '/')
            exit 0
        }
    }
    Start-Sleep -Seconds 1
}
throw 'Tunnel URL not ready after 30 seconds. Inspect .local/tunnel.err.log and retry.'

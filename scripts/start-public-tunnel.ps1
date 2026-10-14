$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$localDir = Join-Path $workspace '.local'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$cloudflaredPath = Join-Path $workspace '.tools\cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflaredPath)) { throw 'Install the verified Cloudflare executable in .tools first.' }
$expectedHash = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'
if ((Get-FileHash -Algorithm SHA256 $cloudflaredPath).Hash.ToLower() -ne $expectedHash) { throw 'Cloudflare executable checksum mismatch.' }
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
function Get-OwnedProcess([string]$PidFile, [string]$ExpectedPath, [string]$ExpectedArgument) {
    if (-not (Test-Path -LiteralPath $PidFile)) { return $null }
    $savedPid = [int](Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue)
    $savedProcess = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
    if ($savedProcess -and $savedProcess.Path -eq $ExpectedPath) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$savedPid" -ErrorAction SilentlyContinue
        if ($processInfo.CommandLine -and $processInfo.CommandLine.IndexOf($ExpectedArgument, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $savedProcess }
    }
    return $null
}
function Test-GatewayHealth {
    try {
        $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:5680/' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return ($resp.StatusCode -eq 404)
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 404) { return $true }
        return $false
    }
}

$nodePath = & (Join-Path $PSScriptRoot 'resolve-node-runtime.ps1')
$gatewayPid = Join-Path $localDir 'gateway.pid'
$gatewayScript = Join-Path $PSScriptRoot 'webhook-gateway.mjs'
$ownedGateway = Get-OwnedProcess $gatewayPid $nodePath $gatewayScript

if ($ownedGateway -and (Test-GatewayHealth)) {
    # Gateway is already running and healthy
} else {
    if ($ownedGateway) {
        Stop-Process -Id $ownedGateway.Id -Force -ErrorAction SilentlyContinue
    }
    $listener = Get-NetTCPConnection -LocalPort 5680 -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw 'Port 5680 is occupied by an unrelated process.' }
    $process = Start-PersistentProcess $nodePath "`"$gatewayScript`"" $workspace
    [System.IO.File]::WriteAllText($gatewayPid, $process.Id.ToString())
    $gatewayReady = $false
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-GatewayHealth) { $gatewayReady = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $gatewayReady) { throw 'Webhook gateway failed to pass health check on port 5680.' }
}

$tunnelPid = Join-Path $localDir 'tunnel.pid'
$tunnelLog = Join-Path $localDir 'tunnel.err.log'
$ownedTunnel = Get-OwnedProcess $tunnelPid $cloudflaredPath '--url http://127.0.0.1:5680'

if ($ownedTunnel -and (Test-Path -LiteralPath $tunnelLog)) {
    $recentTunnelLog = Get-Content -LiteralPath $tunnelLog -Tail 20
    if ($recentTunnelLog -match 'Unauthorized: Tunnel not found') {
        Stop-Process -Id $ownedTunnel.Id -ErrorAction SilentlyContinue
        $ownedTunnel = $null
    } else {
        $logText = Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue
        $matches = [regex]::Matches($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($matches.Count -gt 0) {
            $existingUrl = $matches[$matches.Count - 1].Value
            $tunnelOk = $false
            Clear-DnsClientCache -ErrorAction SilentlyContinue
            try {
                $resp = Invoke-WebRequest -Uri $existingUrl -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
                if ($resp.StatusCode -eq 404) { $tunnelOk = $true }
            } catch {
                if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 404) { $tunnelOk = $true }
            }
            if ($tunnelOk) {
                & (Join-Path $PSScriptRoot 'set-public-url.ps1') -Url ($existingUrl + '/')
                try { docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5682 n8n n8n execute --id=opportunityosSlice5Autopilot 2>$null | Out-Null } catch {}
                Write-Output ('Public webhook base URL: ' + $existingUrl + '/')
                exit 0
            }
        }
        Stop-Process -Id $ownedTunnel.Id -Force -ErrorAction SilentlyContinue
        $ownedTunnel = $null
    }
}

if (-not $ownedTunnel) {
    if (Test-Path -LiteralPath $tunnelLog) { Remove-Item -LiteralPath $tunnelLog -Force -ErrorAction SilentlyContinue }
    $process = Start-PersistentProcess $cloudflaredPath "--no-autoupdate tunnel --protocol http2 --url http://127.0.0.1:5680 --logfile `"$tunnelLog`"" $workspace
    [System.IO.File]::WriteAllText($tunnelPid, $process.Id.ToString())
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-Path -LiteralPath $tunnelLog) {
        $stream = [System.IO.File]::Open($tunnelLog, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $reader = New-Object System.IO.StreamReader($stream)
        try { $logText = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $match = [regex]::Match($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $tunnelUrl = $match.Value
            $tunnelHealthy = $false
            Clear-DnsClientCache -ErrorAction SilentlyContinue
            for ($h = 0; $h -lt 15; $h++) {
                try {
                    $resp = Invoke-WebRequest -Uri $tunnelUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
                    if ($resp.StatusCode -eq 404) { $tunnelHealthy = $true; break }
                } catch {
                    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 404) { $tunnelHealthy = $true; break }
                }
                Start-Sleep -Milliseconds 500
            }
            & (Join-Path $PSScriptRoot 'set-public-url.ps1') -Url ($tunnelUrl + '/')
            try { docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5682 n8n n8n execute --id=opportunityosSlice5Autopilot 2>$null | Out-Null } catch {}
            Write-Output ('Public webhook base URL: ' + $tunnelUrl + '/')
            exit 0
        }
    }
    Start-Sleep -Seconds 1
}
throw 'Tunnel URL not ready after 30 seconds. Inspect .local/tunnel.err.log and retry.'

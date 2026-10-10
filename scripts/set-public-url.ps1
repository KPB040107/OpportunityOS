param([Parameter(Mandatory=$true)][uri]$Url)
$ErrorActionPreference = 'Stop'
if ($Url.Scheme -ne 'https' -or $Url.Host -notmatch '^[a-z0-9-]+\.trycloudflare\.com$' -or $Url.UserInfo -or $Url.Query -or $Url.Fragment -or $Url.Port -ne 443 -or $Url.AbsolutePath -ne '/') {
    throw 'Use the HTTPS root URL printed by the Cloudflare Quick Tunnel.'
}
$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$contents = [System.IO.File]::ReadAllText($envPath)
$publicUrl = $Url.AbsoluteUri.TrimEnd('/') + '/'
if ($contents -notmatch '(?m)^WEBHOOK_URL=') { throw 'Missing WEBHOOK_URL in local configuration.' }
$contents = [regex]::Replace($contents, '(?m)^WEBHOOK_URL=.*$', 'WEBHOOK_URL=' + $publicUrl)
[System.IO.File]::WriteAllText($envPath, $contents)
Write-Host 'Public webhook URL updated; the encryption key and local editor URL were preserved.'

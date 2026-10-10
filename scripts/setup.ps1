$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $workspace '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Host 'Existing configuration retained. Encryption key was not changed.'
    exit 0
}
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$key = [Convert]::ToBase64String($bytes)
$template = Get-Content -Raw -LiteralPath (Join-Path $workspace '.env.example')
[System.IO.File]::WriteAllText($envPath, $template.Replace('GENERATED_BY_SETUP', $key))
Write-Host 'Local configuration created. Keep .env private and back it up with your n8n volume.'

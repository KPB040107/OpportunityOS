param([string]$NodePath = $env:OPPORTUNITYOS_NODE_PATH)
$ErrorActionPreference = 'Stop'

# Normal terminals may not inherit the Node runtime on the Codex tool PATH.
# Use an installed runtime first, then the verified local bundled runtime.
$candidates = @()
if ($NodePath) {
    $candidates += $NodePath
} else {
    $installed = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if ($installed) { $candidates += $installed.Source }
    if ($env:USERPROFILE) {
        $candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    }
}

foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $versionText = & $candidate --version 2>$null
    if ($LASTEXITCODE -eq 0 -and "$versionText" -match '^v(\d+\.\d+\.\d+)$') {
        if ([version]$Matches[1] -ge [version]'20.9.0') {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
}

if ($NodePath) { throw 'The configured Node executable is missing or older than 20.9. Set OPPORTUNITYOS_NODE_PATH to a supported node.exe.' }
throw 'No supported Node runtime was found. Install Node.js 20.9 or newer, reopen PowerShell, or set OPPORTUNITYOS_NODE_PATH to your node.exe.'

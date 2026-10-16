$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$taskConfig = @{}
Get-Content -LiteralPath (Join-Path $projectRoot 'web/.env.local') | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $taskConfig[$matches[1]] = $matches[2]
    }
}

if (-not $taskConfig['N8N_PROJECT_ID']) {
    throw 'N8N_PROJECT_ID missing in web/.env.local'
}

docker compose cp .local/03-evaluate.runtime.json n8n:/tmp/03-evaluate.json
if ($LASTEXITCODE -ne 0) { throw 'Workflow copy failed.' }

docker compose exec -T n8n n8n import:workflow --input=/tmp/03-evaluate.json --projectId=$($taskConfig['N8N_PROJECT_ID'])
if ($LASTEXITCODE -ne 0) { throw 'Workflow import failed.' }

docker compose exec -T n8n n8n update:workflow --id=opportunityosSlice3Evaluate --active=true
if ($LASTEXITCODE -ne 0) { throw 'Workflow activation failed.' }

Write-Host '03-evaluate workflow imported and activated successfully.'

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

docker compose cp .local/01-ingest.runtime.json n8n:/tmp/01-ingest.json
if ($LASTEXITCODE -ne 0) { throw 'Workflow copy failed.' }

docker compose exec -T n8n n8n import:workflow --input=/tmp/01-ingest.json --projectId=$($taskConfig['N8N_PROJECT_ID'])
if ($LASTEXITCODE -ne 0) { throw 'Workflow import failed.' }

# Also activate the workflow
docker compose exec -T n8n n8n update:workflow --id=opportunityosSlice1Ingest --active=true
if ($LASTEXITCODE -ne 0) { throw 'Workflow activation failed.' }

Write-Host '01-ingest workflow imported and activated successfully.'

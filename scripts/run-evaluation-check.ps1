param([Parameter(Mandatory=$true)][ValidateSet('ACT','ASK','IGNORE')][string]$Route)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$taskConfig=@{}
Get-Content -LiteralPath web/.env.local | ForEach-Object {if($_ -match '^([^=]+)=(.*)$'){$taskConfig[$matches[1]]=$matches[2]}}
node scripts/prepare-evaluation-check.mjs $Route
if($LASTEXITCODE -ne 0){throw 'Fixture preparation failed'}
docker compose cp .local/slice3-switch-check.json n8n:/tmp/opportunityos-switch-check.json
if($LASTEXITCODE -ne 0){throw 'Fixture workflow copy failed'}
docker compose exec -T n8n n8n import:workflow --input=/tmp/opportunityos-switch-check.json --projectId=$($taskConfig['N8N_PROJECT_ID'])
if($LASTEXITCODE -ne 0){throw 'Fixture workflow import failed'}
docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5682 n8n n8n execute --id=opportunityosSlice3SwitchCheck --rawOutput *> .local/slice3-switch-check.log
if($LASTEXITCODE -ne 0){throw 'Fixture execution failed; inspect the ignored log locally'}
node scripts/verify-evaluation-check.mjs $Route
if($LASTEXITCODE -ne 0){throw 'Fixture Switch output did not pass verification'}

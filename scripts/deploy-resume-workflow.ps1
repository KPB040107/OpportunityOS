param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$taskConfig = @{}
Get-Content -LiteralPath (Join-Path $projectRoot 'web/.env.local') | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { $taskConfig[$matches[1]] = $matches[2] }
}

$nodePath = & (Join-Path $PSScriptRoot 'resolve-node-runtime.ps1')
& $nodePath (Join-Path $PSScriptRoot 'generate-resume-workflow.mjs') --runtime
if ($LASTEXITCODE -ne 0) { throw 'Workflow generation failed.' }

docker compose cp .local/10-resume.runtime.json n8n:/tmp/10-resume.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/10-resume.json --projectId=$($taskConfig['N8N_PROJECT_ID'])
Write-Host 'Resume workflow deployed and published to n8n successfully.'

param([Parameter(Mandatory=$true)][string]$SqlFile)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$sqlPath=(Resolve-Path -LiteralPath $SqlFile).Path
Set-Location -LiteralPath $projectRoot
$taskConfig=@{}
Get-Content -LiteralPath (Join-Path $projectRoot 'web/.env.local') | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { $taskConfig[$matches[1]]=$matches[2] } }
if (-not $taskConfig['N8N_POSTGRES_CREDENTIAL_ID']) { throw 'Configure the existing Postgres credential reference first.' }
if (-not $taskConfig['N8N_PROJECT_ID']) { throw 'Configure N8N_PROJECT_ID for the existing Personal project in web/.env.local.' }
$node=@{id='sql';name='Run the reviewed database change';type='n8n-nodes-base.postgres';typeVersion=2.6;position=@(240,0);parameters=@{operation='executeQuery';query=[IO.File]::ReadAllText($sqlPath);options=@{}};credentials=@{postgres=@{id=$taskConfig['N8N_POSTGRES_CREDENTIAL_ID'];name=$taskConfig['N8N_POSTGRES_CREDENTIAL_NAME']}}}
$workflow=@{id='opportunityosDatabaseMaintenance';name='OpportunityOS TEST database maintenance - manual only';active=$false;settings=@{executionOrder='v1';saveDataSuccessExecution='none';saveDataErrorExecution='none';saveManualExecutions=$false};nodes=@(@{id='manual';name='Run one reviewed SQL file';type='n8n-nodes-base.manualTrigger';typeVersion=1;position=@(0,0);parameters=@{}},$node);connections=@{}}
# PowerShell unrolls nested arrays; a tiny JSON writer preserves n8n's edge shape.
$temporary=Join-Path $projectRoot '.local/database-workflow.json'
[IO.File]::WriteAllText($temporary,($workflow|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
$nodePath = & (Join-Path $PSScriptRoot 'resolve-node-runtime.ps1')
& $nodePath -e "const fs=require('fs');const p='.local/database-workflow.json';const w=JSON.parse(fs.readFileSync(p,'utf8'));w.connections={'Run one reviewed SQL file':{main:[[{node:'Run the reviewed database change',type:'main',index:0}]]}};fs.writeFileSync(p,JSON.stringify(w));"

if ($LASTEXITCODE -ne 0) { throw 'Workflow generation failed.' }
docker compose cp $temporary n8n:/tmp/opportunityos-database.json
if ($LASTEXITCODE -ne 0) { throw 'Workflow copy failed.' }
docker compose exec -T n8n n8n import:workflow --input=/tmp/opportunityos-database.json --projectId=$($taskConfig['N8N_PROJECT_ID'])
if ($LASTEXITCODE -ne 0) { throw 'Workflow import failed.' }
$log=Join-Path $projectRoot '.local/database-execution.log'
docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5682 n8n n8n execute --id=opportunityosDatabaseMaintenance --rawOutput *> $log
if ($LASTEXITCODE -ne 0) { throw "Database execution failed. Review $log locally; do not share full execution logs." }
Write-Host 'Database workflow completed successfully. Execution output stays in ignored local files.'

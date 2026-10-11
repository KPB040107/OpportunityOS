$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
node scripts/prepare-content-race.mjs
if ($LASTEXITCODE -ne 0) { throw 'Concurrency fixture generation failed.' }
$raceSettings=Get-Content .local/content-race-config.json -Raw | ConvertFrom-Json
& scripts/run-database.ps1 -SqlFile .local/content-race-setup.sql
try {
  foreach ($name in @('a','b')) {
    docker compose cp ".local/content-race-$name.json" "n8n:/tmp/opportunityos-content-race-$name.json"
    if ($LASTEXITCODE -ne 0) { throw 'Concurrency workflow copy failed.' }
    docker compose exec -T n8n n8n import:workflow --input="/tmp/opportunityos-content-race-$name.json" --projectId=$($raceSettings.project)
    if ($LASTEXITCODE -ne 0) { throw 'Concurrency workflow import failed.' }
  }
  $raceProcesses=@()
  foreach ($run in @(@{name='a';port=5682},@{name='b';port=5683})) {
    $argsList=@('compose','exec','-T','-e',"N8N_RUNNERS_BROKER_PORT=$($run.port)",'n8n','n8n','execute',"--id=opportunityosSlice2ContentRace$($run.name.ToUpper())",'--rawOutput')
    $raceProcesses+=Start-Process -FilePath (Get-Command docker).Source -ArgumentList $argsList -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot ".local/content-race-$($run.name).log") -RedirectStandardError (Join-Path $projectRoot ".local/content-race-$($run.name).err.log")
  }
  foreach ($process in $raceProcesses) { $process.WaitForExit(); $process.Refresh(); if ($null -ne $process.ExitCode -and $process.ExitCode -ne 0) { throw 'Concurrent execution failed; inspect local logs.' } }
  node scripts/verify-content-race.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent execution assertions failed.' }
  & scripts/run-database.ps1 -SqlFile .local/content-race-verify.sql
} finally {
  & scripts/run-database.ps1 -SqlFile .local/content-race-cleanup.sql
}

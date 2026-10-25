param()
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
node scripts/doctor.mjs
if($LASTEXITCODE -ne 0){throw 'Doctor falhou'}

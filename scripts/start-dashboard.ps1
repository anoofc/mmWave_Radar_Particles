$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  if (!(Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' } }
  & npm.cmd run dev
  if ($LASTEXITCODE -ne 0) { throw 'Dashboard startup failed' }
} finally { Pop-Location }

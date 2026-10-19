param(
  [ValidateSet('minimal','xiao_esp32c6')][string]$Environment = 'xiao_esp32c6',
  [switch]$Upload,
  [string]$Port
)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  $pioArgs = @('run','-d','firmware','-e',$Environment)
  if ($Upload) { $pioArgs += @('-t','upload') }
  if ($Port) { $pioArgs += @('--upload-port',$Port) }
  & pio @pioArgs
  if ($LASTEXITCODE -ne 0) { throw 'PlatformIO failed' }
} finally { Pop-Location }

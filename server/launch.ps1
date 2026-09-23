$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataRoot = Join-Path $env:LOCALAPPDATA 'KoretsMuseum'
$runFile = Join-Path $dataRoot 'running.json'
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
$pnpmExe = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
$gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
$networkMode = $env:KORETS_NETWORK -eq '1'
$siteBindAddress = if ($networkMode) { '0.0.0.0' } else { '127.0.0.1' }
function Test-LocalPort([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $port); return $true }
  catch { return $false }
  finally { $client.Close() }
}
if (-not $nodeExe -or -not $pnpmExe) {
  Write-Host 'Node.js or pnpm is missing. Please contact the museum website administrator.'
  exit 1
}
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
Set-Location $projectRoot

if (Test-Path $runFile) {
  try {
    $running = Get-Content $runFile -Raw | ConvertFrom-Json
    if ($running.project -eq $projectRoot) {
      foreach ($service in @(@{ id = $running.sitePid; marker = 'wrangler.js' }, @{ id = $running.apiPid; marker = 'server\index.mjs' })) {
        if (-not $service.id) { continue }
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.id)" -ErrorAction SilentlyContinue
        if ($processInfo -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($projectRoot) -and $processInfo.CommandLine.Contains($service.marker)) {
          Stop-Process -Id $service.id -Force
        }
      }
    }
  } catch { Write-Host 'Could not stop a previous museum service; checking ports next.' }
}

Start-Sleep -Seconds 2
if (Test-LocalPort 3000) { Write-Host 'Port 3000 is already occupied. Please close the other website service.'; exit 1 }
if (Test-LocalPort 3001) { Write-Host 'Port 3001 is already occupied. Please close the other data service.'; exit 1 }

if (Test-Path (Join-Path $projectRoot '.git')) {
  if (-not $gitExe) { Write-Host 'Git is missing; starting the current version without updating.' }
  else {
    & $gitExe remote get-url origin 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $branch = (& $gitExe branch --show-current).Trim()
      $trackedRemote = & $gitExe config --get "branch.$branch.remote"
      if ($trackedRemote -eq 'origin') {
        Write-Host 'Checking GitHub for updates...'
        & $gitExe pull --ff-only
        if ($LASTEXITCODE -ne 0) { Write-Host 'Update could not be applied. Starting the current version.' }
      } else { Write-Host 'GitHub repository is connected; updates start after the first publish.' }
    }
  }
}

Write-Host 'Preparing website...'
& $pnpmExe install --frozen-lockfile
if ($LASTEXITCODE -ne 0 -and -not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'Installation failed. Please contact the museum website administrator.'
  exit 1
}
& $pnpmExe build
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Website build failed. Please contact the museum website administrator.'
  exit 1
}

$apiEntry = Join-Path $projectRoot 'server\index.mjs'
$siteEntry = Join-Path $projectRoot 'node_modules\wrangler\bin\wrangler.js'
$siteConfig = Join-Path $projectRoot 'dist\server\wrangler.json'
$apiProcess = Start-Process -FilePath $nodeExe -ArgumentList "`"$apiEntry`"" -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot 'api-out.log') -RedirectStandardError (Join-Path $dataRoot 'api-error.log')
$siteProcess = Start-Process -FilePath $nodeExe -ArgumentList "`"$siteEntry`" dev --config `"$siteConfig`" --port 3000 --ip $siteBindAddress" -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot 'site-out.log') -RedirectStandardError (Join-Path $dataRoot 'site-error.log')
@{ project = $projectRoot; apiPid = $apiProcess.Id; sitePid = $siteProcess.Id } | ConvertTo-Json | Set-Content $runFile

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if ((Test-LocalPort 3000) -and (Test-LocalPort 3001)) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  Write-Host "Website did not start. Logs are in $dataRoot. Please contact the museum website administrator."
  exit 1
}
Start-Process 'http://localhost:3000/'
if ($networkMode) {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
  $address = if ($route) { Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1 -ExpandProperty IPAddress }
  if ($address) { Write-Host "Museum website is ready on the office network: http://${address}:3000/" }
  else { Write-Host 'Museum website is ready, but the office network address could not be detected.' }
} else { Write-Host 'Museum website is ready on this PC.' }

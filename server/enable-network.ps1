$ErrorActionPreference = 'Stop'
$rules = @(
  @{ Name = 'KoretsMuseum-Web'; Display = 'Korets Museum website (local network)'; Port = 3000 },
  @{ Name = 'KoretsMuseum-Data'; Display = 'Korets Museum data (local network)'; Port = 3001 }
)
foreach ($entry in $rules) {
  $existing = Get-NetFirewallRule -Name $entry.Name -ErrorAction SilentlyContinue
  if (-not $existing) {
    New-NetFirewallRule -Name $entry.Name -DisplayName $entry.Display -Direction Inbound -Action Allow -Protocol TCP -LocalPort $entry.Port -RemoteAddress LocalSubnet -Profile Any | Out-Null
  } else {
    Set-NetFirewallRule -Name $entry.Name -Enabled True -Action Allow -Profile Any | Out-Null
    Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $existing -RemoteAddress LocalSubnet | Out-Null
  }
}
Write-Host 'Office-network access is enabled for the Korets Museum website.'

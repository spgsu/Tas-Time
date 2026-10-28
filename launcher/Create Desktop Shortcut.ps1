# Creates a desktop shortcut without installing software or changing browser settings.
param([switch]$Check)
$ErrorActionPreference = 'Stop'
$appFile = Join-Path $PSScriptRoot 'Tas-Time.html'
$iconFile = Join-Path $PSScriptRoot 'Tas-Time.ico'
foreach ($path in @($appFile, $iconFile)) {
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing $path. Build Tas-Time first or extract the complete download." }
}
$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$found = @($candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if (!$found) { throw 'Microsoft Edge or Google Chrome was not found.' }
$browserPath = $found[0]
# Edge set to clear browsing data on exit erases the recovery copy and file link, so Tas-Time cannot resume.
$edgeClears = @('HKLM:\Software\Policies\Microsoft\Edge', 'HKCU:\Software\Policies\Microsoft\Edge') |
  Where-Object { (Get-ItemProperty -LiteralPath $_ -Name ClearBrowsingDataOnExit -ErrorAction SilentlyContinue).ClearBrowsingDataOnExit -eq 1 }
if ($edgeClears -and $browserPath -like '*msedge.exe') {
  $chrome = $found | Where-Object { $_ -like '*chrome.exe' } | Select-Object -First 1
  if ($chrome) {
    $browserPath = $chrome
    Write-Output 'Edge is set to clear browsing data on exit, so the shortcut uses Chrome to let Tas-Time resume your last session.'
  } else {
    Write-Warning 'Edge is set to clear browsing data on exit. Tas-Time will start empty each time; use Open file to continue a saved book.'
  }
}
$appUrl = ([System.Uri]::new([System.IO.Path]::GetFullPath($appFile))).AbsoluteUri
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Tas-Time.lnk'
$arguments = '--app="' + $appUrl + '" --new-window'
if ($Check) {
  Write-Output "Shortcut: $shortcutPath"
  Write-Output "Browser: $browserPath"
  Write-Output "Arguments: $arguments"
  Write-Output "Icon: $iconFile"
  exit 0
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browserPath
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = "$iconFile,0"
$shortcut.Description = 'Tas-Time - your offline planning book'
$shortcut.Save()
Write-Output "Created $shortcutPath"

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
$browserPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$browserPath) { throw 'Microsoft Edge or Google Chrome was not found.' }
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

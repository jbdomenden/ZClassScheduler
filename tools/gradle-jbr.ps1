Param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = "Stop"

function Find-JBRHome {
  $roots = @()

  if ($env:LOCALAPPDATA) {
    $roots += (Join-Path $env:LOCALAPPDATA "Programs")
  }

  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }

    $dirs =
      Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -like "IntelliJ IDEA*" -or
        $_.Name -like "Android Studio*" -or
        $_.Name -like "PyCharm*" -or
        $_.Name -like "WebStorm*" -or
        $_.Name -like "PhpStorm*"
      }

    foreach ($d in $dirs) {
      $jbr = Join-Path $d.FullName "jbr"
      $java = Join-Path $jbr "bin\\java.exe"
      if (Test-Path $java) { return $jbr }
    }
  }

  return $null
}

$jbrHome = Find-JBRHome
if ($jbrHome) {
  $env:JAVA_HOME = $jbrHome
  $env:Path = "$env:JAVA_HOME\\bin;$env:Path"
  Write-Host "Using JAVA_HOME=$env:JAVA_HOME"
} else {
  Write-Host "JBR not found under %LOCALAPPDATA%\\Programs. Using JAVA_HOME=$env:JAVA_HOME"
}

& .\\gradlew.bat @Args
exit $LASTEXITCODE


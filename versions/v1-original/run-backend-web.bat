@echo off
setlocal

cd /d "%~dp0"

echo Preparing backend runtime ...
call mvn -q -DskipTests compile dependency:build-classpath "-Dmdep.outputFile=build-output/classpath.txt"
if errorlevel 1 goto :error

powershell -NoProfile -ExecutionPolicy Bypass -Command "$cp=(Get-Content -Path 'build-output/classpath.txt' -Raw).Trim(); if([string]::IsNullOrWhiteSpace($cp)){ Write-Host 'Failed to read classpath from build-output/classpath.txt'; exit 1 }; & java -cp ('build-output/classes;' + $cp) com.sipsg.autodeploy.AutoDeployApplication"
exit /b %ERRORLEVEL%

:error
echo Backend preparation failed.
exit /b 1

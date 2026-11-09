@echo off
setlocal

cd /d "%~dp0"

echo [1/3] Building frontend (React) ...
pushd frontend
call npm run build
if errorlevel 1 goto :error
popd

echo [2/3] Copying frontend build to Spring Boot static resources ...
if exist src\main\resources\static (
  rmdir /s /q src\main\resources\static
)
mkdir src\main\resources\static
xcopy frontend\build src\main\resources\static /E /I /Y >nul
if errorlevel 1 goto :error

echo [3/3] Compiling Java backend ...
call mvn -q -DskipTests clean compile dependency:build-classpath "-Dmdep.outputFile=build-output/classpath.txt"
if errorlevel 1 goto :error

echo.
echo Build completed.
echo Backend runtime assets are in: build-output\
echo Start backend with: run-backend-web.bat
exit /b 0

:error
echo.
echo Build failed. Check the logs above.
exit /b 1

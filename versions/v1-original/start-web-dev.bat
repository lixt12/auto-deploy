@echo off
setlocal

cd /d "%~dp0"

echo [1/2] Starting Java backend at http://localhost:18088 ...
start "v1-java-backend" cmd /k "cd /d \"%~dp0\" && call run-backend-web.bat"

echo [2/2] Starting React frontend at http://localhost:3000 ...
start "v1-web-frontend" cmd /k "cd /d \"%~dp0frontend\" && set HOST=localhost && npm start"

echo.
echo Web development environment started.
echo - Backend:  http://localhost:18088
echo - Frontend: http://localhost:3000
echo.
echo Default admin: admin / admin123

endlocal


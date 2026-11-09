@echo off
chcp 65001 >nul
cls

echo.
echo ===================================
echo   🚀 自动化部署系统 - 统一架构版
echo ===================================
echo.

cd /d "%~dp0"

echo 📍 当前目录: %CD%
echo.

echo 🔍 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo ✅ Node.js 版本:
node --version
echo.

echo 📦 检查依赖包...
if not exist "node_modules" (
    echo 🔄 正在安装依赖包...
    npm install
    echo.
)

echo 🚀 启动开发环境...
echo.
echo 🌐 前端地址: http://localhost:3000
echo 🔧 后端API: http://localhost:8088
echo 👤 默认账户: admin / admin123
echo.
echo 按 Ctrl+C 停止服务器
echo.

npm run dev

pause

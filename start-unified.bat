@echo off
chcp 65001 >nul
title 自动化部署系统 - 统一架构版本
echo ========================================
echo   自动化部署系统 v2.0 - 统一架构版本
echo ========================================
echo.

cd auto-deploy-v2-unified

echo 🔍 检查Node.js环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js未安装或不在PATH中
    echo 请先安装Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js环境检查通过
echo.

echo 📦 安装依赖...
if not exist node_modules npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo ✅ 依赖安装完成
echo.

echo 🚀 启动开发环境...
echo 🔗 前端: http://localhost:3000
echo 🔗 后端: http://localhost:8088
echo 🔗 健康检查: http://localhost:8088/health
echo.
echo 💡 默认管理员账号: admin / admin123
echo 💡 按 Ctrl+C 可以停止所有服务
echo.

npm run electron-dev

pause

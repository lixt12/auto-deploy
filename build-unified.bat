@echo off
chcp 65001 >nul
title 自动化部署系统 - 统一架构构建
echo ========================================
echo   自动化部署系统 v2.0 - 统一架构构建
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
npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo ✅ 依赖安装完成
echo.

echo 🔧 清理旧的构建文件...
npm run clean

echo 🏗️ 构建应用程序...
npm run electron-build

if %errorlevel% equ 0 (
    echo.
    echo 🎉 构建成功！
    echo.
    echo 📁 安装包位置: dist-desktop/
    echo.
    dir dist-desktop\*.exe
    echo.
) else (
    echo.
    echo ❌ 构建失败
    echo 请检查错误信息并重试
    echo.
)

pause

@echo off
chcp 65001 >nul
title 🚀 启动Auto-Deploy v2统一版本

echo.
echo ============================================
echo 🚀 Auto-Deploy v2 统一架构版本启动器
echo ============================================
echo.
echo 📍 当前目录: %cd%
echo 🎯 目标版本: v2-unified (推荐)
echo.

:: 检查目录是否存在
if not exist "versions\v2-unified" (
    echo ❌ 错误: 找不到 v2-unified 目录
    echo 请确保项目目录结构完整
    pause
    exit /b 1
)

:: 切换到统一版本目录
cd versions\v2-unified

echo 📂 切换到目录: %cd%
echo.

:: 检查package.json是否存在
if not exist "package.json" (
    echo ❌ 错误: 找不到 package.json 文件
    echo 请确保v2-unified目录完整
    pause
    exit /b 1
)

:: 检查node_modules是否存在，不存在则安装依赖
if not exist "node_modules" (
    echo 📦 检测到缺少依赖，正在安装...
    echo.
    npm install
    echo.
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
    echo.
)

echo 🎯 启动选项:
echo [1] 完整开发环境 (前端+后端)
echo [2] 仅启动后端服务
echo [3] 仅启动前端服务  
echo [4] 启动桌面应用
echo [5] 构建生产版本
echo [0] 退出
echo.

set /p choice="请选择启动方式 (1-5, 0退出): "

if "%choice%"=="1" (
    echo.
    echo 🚀 启动完整开发环境...
    echo 📍 前端地址: http://localhost:3000
    echo 📍 后端地址: http://localhost:8088
    echo 💡 按 Ctrl+C 停止服务
    echo.
    npm run dev
) else if "%choice%"=="2" (
    echo.
    echo 🔧 启动后端服务...
    echo 📍 服务地址: http://localhost:8088
    echo.
    npm run backend
) else if "%choice%"=="3" (
    echo.
    echo 🎨 启动前端服务...
    echo 📍 服务地址: http://localhost:3000
    echo.
    npm run frontend
) else if "%choice%"=="4" (
    echo.
    echo 💻 启动桌面应用...
    echo.
    npm run electron-dev
) else if "%choice%"=="5" (
    echo.
    echo 🏗️ 构建生产版本...
    echo.
    npm run build-all
    if not errorlevel 1 (
        echo.
        echo ✅ 构建完成！
        echo 📦 如需打包桌面应用，运行: npm run electron-build
    )
) else if "%choice%"=="0" (
    echo.
    echo 👋 再见！
    exit /b 0
) else (
    echo.
    echo ❌ 无效选择，请重新运行脚本
)

echo.
pause

@echo off
chcp 65001 >nul
title 🔧 启动Auto-Deploy v1原始版本

echo.
echo ============================================
echo 🔧 Auto-Deploy v1 原始复杂架构版本启动器
echo ============================================
echo.
echo 📍 当前目录: %cd%
echo 🎯 目标版本: v1-original (学习参考)
echo ⚠️  注意: 此版本构建复杂，建议使用v2版本
echo.

:: 检查目录是否存在
if not exist "versions\v1-original" (
    echo ❌ 错误: 找不到 v1-original 目录
    echo 请确保项目目录结构完整
    pause
    exit /b 1
)

echo 🎯 启动选项:
echo [1] Spring Boot 后端 (Java)
echo [2] React 前端 (开发模式)
echo [3] Node.js 实验后端
echo [4] Electron 桌面应用
echo [5] Maven 构建 Java 后端
echo [6] 前端生产构建
echo [0] 退出
echo.

set /p choice="请选择启动方式 (1-6, 0退出): "

if "%choice%"=="1" (
    echo.
    echo ☕ 启动Spring Boot后端...
    echo 📍 API地址: http://localhost:8080
    echo.
    cd versions\v1-original
    if exist "target\classes" (
        java -jar target\*.jar
    ) else (
        echo 📦 需要先编译项目，正在运行Maven...
        mvn spring-boot:run
    )
) else if "%choice%"=="2" (
    echo.
    echo 🎨 启动React前端开发服务器...
    echo 📍 前端地址: http://localhost:3000
    echo.
    cd versions\v1-original\frontend
    if not exist "node_modules" (
        echo 📦 安装前端依赖...
        npm install
    )
    npm start
) else if "%choice%"=="3" (
    echo.
    echo 🔧 启动Node.js实验后端...
    echo 📍 API地址: http://localhost:8088
    echo.
    cd versions\v1-original\backend-nodejs
    if not exist "node_modules" (
        echo 📦 安装后端依赖...
        npm install
    )
    npm start
) else if "%choice%"=="4" (
    echo.
    echo 💻 启动Electron桌面应用...
    echo.
    cd versions\v1-original\frontend
    if not exist "node_modules" (
        echo 📦 安装依赖...
        npm install
    )
    npm run electron-dev
) else if "%choice%"=="5" (
    echo.
    echo 🏗️ Maven构建Java后端...
    echo.
    cd versions\v1-original
    mvn clean package -DskipTests
    if not errorlevel 1 (
        echo ✅ 构建完成！可运行选项1启动后端
    )
) else if "%choice%"=="6" (
    echo.
    echo 🏗️ 构建React前端生产版本...
    echo.
    cd versions\v1-original\frontend
    if not exist "node_modules" (
        npm install
    )
    npm run build
    if not errorlevel 1 (
        echo ✅ 前端构建完成！
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
echo 💡 提示: 推荐使用 启动-v2-统一版本.bat 获得更好的开发体验
echo.
pause

#!/bin/bash

echo "========================================"
echo "自动部署系统 - 跨平台桌面应用打包脚本"
echo "========================================"

echo
echo "[1/4] 清理旧的构建文件..."
rm -rf target/
rm -rf frontend/dist/
rm -rf frontend/build/

echo
echo "[2/4] 编译Spring Boot后端..."
mvn clean package -DskipTests
if [ $? -ne 0 ]; then
    echo "后端编译失败！"
    exit 1
fi

echo
echo "[3/4] 检查JAR文件..."
if [ ! -f "target/auto-deploy-1.0.0.jar" ]; then
    echo "JAR文件不存在！请检查Maven构建是否成功。"
    exit 1
fi

echo
echo "[4/4] 构建前端并打包Electron应用..."
cd frontend

npm install
if [ $? -ne 0 ]; then
    echo "npm install 失败！"
    exit 1
fi

npm run electron-pack
if [ $? -ne 0 ]; then
    echo "Electron打包失败！"
    exit 1
fi

cd ..

echo
echo "========================================"
echo "打包完成！"
echo "========================================"
echo
echo "打包文件位置: frontend/dist/"
echo
echo "您可以在dist目录中找到对应平台的安装包。"
echo

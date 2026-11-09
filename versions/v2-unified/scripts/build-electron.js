const fs = require('fs');
const path = require('path');

// 复制 Electron 文件到 dist-electron 目录
function copyElectronFiles() {
    const sourceDir = path.join(__dirname, '../src/electron');
    const targetDir = path.join(__dirname, '../dist-electron');

    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // 复制整个 electron 目录
    copyDirectory(sourceDir, targetDir);
    
    console.log('✅ Electron 文件复制完成');
}

function copyDirectory(source, target) {
    // 确保目标目录存在
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    // 读取源目录内容
    const items = fs.readdirSync(source);

    items.forEach(item => {
        const sourcePath = path.join(source, item);
        const targetPath = path.join(target, item);
        const stat = fs.statSync(sourcePath);

        if (stat.isDirectory()) {
            // 递归复制子目录
            copyDirectory(sourcePath, targetPath);
        } else {
            // 复制文件
            fs.copyFileSync(sourcePath, targetPath);
        }
    });
}

// 主构建函数
function buildElectron() {
    console.log('🔧 开始构建 Electron...');
    
    try {
        copyElectronFiles();
        
        console.log('🎉 Electron 构建完成!');
        console.log('📁 输出目录: dist-electron/');
        
    } catch (error) {
        console.error('❌ Electron 构建失败:', error);
        process.exit(1);
    }
}

// 如果直接执行此脚本
if (require.main === module) {
    buildElectron();
}

module.exports = { buildElectron };

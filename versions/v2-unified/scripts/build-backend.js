const fs = require('fs');
const path = require('path');

// 复制后端文件到 dist-backend 目录
function copyBackendFiles() {
    const sourceDir = path.join(__dirname, '../src/backend');
    const targetDir = path.join(__dirname, '../dist-backend');

    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // 复制整个后端目录
    copyDirectory(sourceDir, targetDir);
    
    console.log('✅ 后端文件复制完成');
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

// 创建环境配置文件
function createEnvironmentConfig() {
    const envConfig = {
        NODE_ENV: 'production',
        PORT: 8088,
        JWT_SECRET: 'auto-deploy-production-secret-' + Date.now(),
        LOG_LEVEL: 'info'
    };

    const envPath = path.join(__dirname, '../dist-backend/.env');
    const envContent = Object.entries(envConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    fs.writeFileSync(envPath, envContent);
    console.log('✅ 环境配置文件创建完成');
}

// 主构建函数
function buildBackend() {
    console.log('🔧 开始构建后端...');
    
    try {
        copyBackendFiles();
        createEnvironmentConfig();
        
        console.log('🎉 后端构建完成!');
        console.log('📁 输出目录: dist-backend/');
        
    } catch (error) {
        console.error('❌ 后端构建失败:', error);
        process.exit(1);
    }
}

// 如果直接执行此脚本
if (require.main === module) {
    buildBackend();
}

module.exports = { buildBackend };

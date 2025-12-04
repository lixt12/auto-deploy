const database = require('../config/database');
const logger = require('../utils/logger');

async function initializeDatabase() {
    try {
        console.log('🗄️  开始初始化数据库...');
        
        // 初始化数据库
        await database.initialize();
        
        console.log('✅ 数据库初始化完成！');
        console.log(`📁 数据库文件: ${database.dbPath}`);
        
        // 获取一些基本统计信息
        const userCount = await database.get('SELECT COUNT(*) as count FROM users');
        const projectCount = await database.get('SELECT COUNT(*) as count FROM projects');
        const serverCount = await database.get('SELECT COUNT(*) as count FROM servers');
        
        console.log('\n📊 数据库统计:');
        console.log(`   用户数量: ${userCount.count}`);
        console.log(`   项目数量: ${projectCount.count}`);
        console.log(`   服务器数量: ${serverCount.count}`);
        
        console.log('\n🔐 默认管理员账户:');
        console.log('   用户名: admin');
        console.log('   密码: admin123');
        console.log('   ⚠️  请在生产环境中修改默认密码！');
        
        await database.close();
        
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };

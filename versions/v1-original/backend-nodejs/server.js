const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const database = require('./config/database');

// 路由导入
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const serverRoutes = require('./routes/servers');
const logRoutes = require('./routes/logs');

const app = express();
const PORT = process.env.PORT || 8088;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
});

// 静态文件服务
app.use('/static', express.static(path.join(__dirname, 'public')));

// 路由配置
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/logs', logRoutes);

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: database.isReady() ? 'connected' : 'disconnected'
    });
});

// 404处理
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `路由 ${req.originalUrl} 不存在`
    });
});

// 全局错误处理
app.use((err, req, res, next) => {
    logger.error(`错误: ${err.message}`, { stack: err.stack });
    res.status(500).json({
        success: false,
        message: '服务器内部错误',
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
});

// 启动服务器
async function startServer() {
    try {
        // 初始化数据库
        await database.initialize();
        logger.info('数据库初始化完成');
        
        // 启动服务器
        app.listen(PORT, () => {
            logger.info(`
🚀 自动部署系统后端启动成功！
📍 端口: ${PORT}
🌐 地址: http://localhost:${PORT}
📊 健康检查: http://localhost:${PORT}/health
🗂️  数据库: ${process.env.DATABASE_PATH || './data/database.sqlite'}
⏱️  启动时间: ${new Date().toISOString()}
            `);
        });
        
    } catch (error) {
        logger.error('服务器启动失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', async () => {
    logger.info('收到停止信号，正在优雅关闭...');
    await database.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('收到终止信号，正在优雅关闭...');
    await database.close();
    process.exit(0);
});

startServer();

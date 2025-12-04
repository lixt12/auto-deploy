const express = require('express');
const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const sshClient = require('../utils/ssh-client');
const logger = require('../utils/logger');

const router = express.Router();

// 中间件：验证请求数据
const validateServer = [
    body('name').notEmpty().withMessage('服务器名称不能为空'),
    body('host').notEmpty().withMessage('主机地址不能为空'),
    body('host').isIP().withMessage('请输入有效的IP地址').optional({ checkFalsy: true }),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('端口范围应在1-65535之间').optional(),
    body('username').notEmpty().withMessage('用户名不能为空'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '请求数据验证失败',
                errors: errors.array()
            });
        }
        next();
    }
];

// 记录操作日志
async function logOperation(operation, serverName, serverId, message, userId = null) {
    try {
        await database.run(`
            INSERT INTO system_logs (level, category, operation, target_type, target_name, target_id, message, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, ['INFO', 'SERVER', operation, 'Server', serverName, serverId, message, userId]);
    } catch (error) {
        logger.error('记录操作日志失败:', error);
    }
}

// 记录错误日志
async function logError(controller, operation, target, error, userId = null) {
    try {
        await database.run(`
            INSERT INTO system_logs (level, category, operation, target_type, target_name, message, details, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, ['ERROR', 'SERVER', operation, controller, target, error.message, error.stack, userId]);
    } catch (logErr) {
        logger.error('记录错误日志失败:', logErr);
    }
}

// GET /api/servers - 获取所有服务器
router.get('/', async (req, res) => {
    try {
        const servers = await database.all(`
            SELECT 
                s.*,
                u.username as created_by_name
            FROM servers s
            LEFT JOIN users u ON s.created_by = u.id
            ORDER BY s.created_at DESC
        `);
        
        // 不返回敏感信息
        const safeServers = servers.map(server => {
            const { password, ...safeServer } = server;
            return safeServer;
        });
        
        res.json({
            success: true,
            data: safeServers
        });
        
    } catch (error) {
        logger.error('获取服务器列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取服务器列表失败: ' + error.message
        });
    }
});

// GET /api/servers/:id - 获取服务器详情
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const server = await database.get(`
            SELECT 
                s.*,
                u.username as created_by_name
            FROM servers s
            LEFT JOIN users u ON s.created_by = u.id
            WHERE s.id = ?
        `, [id]);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                message: '服务器不存在'
            });
        }
        
        // 不返回密码
        const { password, ...safeServer } = server;
        
        res.json({
            success: true,
            data: safeServer
        });
        
    } catch (error) {
        logger.error('获取服务器详情失败:', error);
        res.status(500).json({
            success: false,
            message: '获取服务器详情失败: ' + error.message
        });
    }
});

// POST /api/servers - 创建服务器
router.post('/', validateServer, async (req, res) => {
    try {
        const {
            name, host, port = 22, username, password, privateKeyPath, description
        } = req.body;
        
        // 检查主机和端口是否已存在
        const existingServer = await database.get(
            'SELECT id FROM servers WHERE host = ? AND port = ?',
            [host, port]
        );
        
        if (existingServer) {
            return res.status(400).json({
                success: false,
                message: '该主机和端口的服务器已存在'
            });
        }
        
        // 创建服务器
        const result = await database.run(`
            INSERT INTO servers (
                name, host, port, username, password, private_key_path, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [name, host, port, username, password, privateKeyPath, description]);
        
        // 获取创建的服务器（不包含密码）
        const createdServer = await database.get(`
            SELECT id, name, host, port, username, private_key_path, description,
                   connection_status, last_check_at, created_at, updated_at
            FROM servers WHERE id = ?
        `, [result.id]);
        
        // 记录操作日志
        await logOperation('创建', name, result.id, `成功创建服务器，主机: ${host}:${port}`);
        
        res.json({
            success: true,
            message: '服务器创建成功',
            data: createdServer
        });
        
        logger.info(`服务器创建成功: ${name} (${host}:${port})`);
        
    } catch (error) {
        logger.error('服务器创建失败:', error);
        await logError('ServerController', '创建服务器', `主机: ${req.body.host}`, error);
        
        res.status(400).json({
            success: false,
            message: '服务器创建失败: ' + error.message
        });
    }
});

// PUT /api/servers/:id - 更新服务器
router.put('/:id', validateServer, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, host, port = 22, username, password, privateKeyPath, description
        } = req.body;
        
        // 检查服务器是否存在
        const existingServer = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        if (!existingServer) {
            return res.status(404).json({
                success: false,
                message: '服务器不存在'
            });
        }
        
        // 检查主机端口是否重复（排除自己）
        if (existingServer.host !== host || existingServer.port !== port) {
            const duplicateServer = await database.get(
                'SELECT id FROM servers WHERE host = ? AND port = ? AND id != ?',
                [host, port, id]
            );
            if (duplicateServer) {
                return res.status(400).json({
                    success: false,
                    message: '该主机和端口的服务器已存在'
                });
            }
        }
        
        // 更新服务器
        await database.run(`
            UPDATE servers SET
                name = ?, host = ?, port = ?, username = ?, password = ?,
                private_key_path = ?, description = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [name, host, port, username, password, privateKeyPath, description, id]);
        
        // 获取更新后的服务器（不包含密码）
        const updatedServer = await database.get(`
            SELECT id, name, host, port, username, private_key_path, description,
                   connection_status, last_check_at, created_at, updated_at
            FROM servers WHERE id = ?
        `, [id]);
        
        // 记录操作日志
        await logOperation('更新', name, parseInt(id), `成功更新服务器，服务器ID: ${id}`);
        
        res.json({
            success: true,
            message: '服务器更新成功',
            data: updatedServer
        });
        
        logger.info(`服务器更新成功: ${name} (ID: ${id})`);
        
    } catch (error) {
        logger.error('服务器更新失败:', error);
        await logError('ServerController', '更新服务器', `服务器ID: ${req.params.id}`, error);
        
        res.status(400).json({
            success: false,
            message: '服务器更新失败: ' + error.message
        });
    }
});

// POST /api/servers/delete - 删除服务器 (兼容原API格式)
router.post('/delete', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(422).json({
                success: false,
                message: '服务器ID不能为空'
            });
        }
        
        // 获取服务器信息
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        const serverName = server ? server.name : `服务器-${id}`;
        const serverId = server ? server.id : null;
        
        // 删除服务器
        const result = await database.run('DELETE FROM servers WHERE id = ?', [id]);
        
        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: '服务器不存在'
            });
        }
        
        // 记录操作日志
        await logOperation('删除', serverName, serverId, `成功删除服务器，服务器ID: ${id}`);
        
        res.json({
            success: true,
            message: '服务器删除成功'
        });
        
        logger.info(`服务器删除成功: ${serverName} (ID: ${id})`);
        
    } catch (error) {
        logger.error('服务器删除失败:', error);
        await logError('ServerController', '删除服务器', `服务器ID: ${req.body.id}`, error);
        
        res.status(400).json({
            success: false,
            message: '服务器删除失败: ' + error.message
        });
    }
});

// POST /api/servers/test-connection - 测试连接
router.post('/test-connection', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(422).json({
                success: false,
                message: '服务器ID不能为空'
            });
        }
        
        // 获取服务器信息
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                message: '服务器不存在'
            });
        }
        
        // 测试连接
        const connected = await sshClient.testConnection({
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password,
            privateKeyPath: server.private_key_path
        });
        
        // 更新连接状态
        await database.run(
            'UPDATE servers SET connection_status = ?, last_check_at = CURRENT_TIMESTAMP WHERE id = ?',
            [connected ? 'ONLINE' : 'OFFLINE', id]
        );
        
        // 记录操作日志
        await logOperation('测试连接', server.name, server.id, `连接测试结果: ${connected ? '成功' : '失败'}`);
        
        res.json({
            success: true,
            connected: connected,
            message: connected ? '连接测试成功' : '连接测试失败'
        });
        
        logger.info(`服务器连接测试: ${server.name} - ${connected ? '成功' : '失败'}`);
        
    } catch (error) {
        logger.error('连接测试失败:', error);
        await logError('ServerController', '测试连接', `服务器ID: ${req.body.id}`, error);
        
        res.status(500).json({
            success: false,
            connected: false,
            message: '连接测试失败: ' + error.message
        });
    }
});

module.exports = router;

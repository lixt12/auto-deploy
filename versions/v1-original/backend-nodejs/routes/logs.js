const express = require('express');
const { query } = require('express-validator');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/logs - 获取系统日志
router.get('/', [
    query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
    query('size').optional().isInt({ min: 1, max: 100 }).withMessage('每页大小必须在1-100之间'),
    query('level').optional().isIn(['INFO', 'WARN', 'ERROR']).withMessage('日志级别无效'),
    query('category').optional().isIn(['PROJECT', 'SERVER', 'DEPLOYMENT', 'AUTH']).withMessage('日志分类无效'),
], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 50;
        const level = req.query.level;
        const category = req.query.category;
        const operation = req.query.operation;
        const targetType = req.query.target_type;
        const startDate = req.query.start_date;
        const endDate = req.query.end_date;
        
        const offset = (page - 1) * size;
        
        // 构建查询条件
        let whereConditions = [];
        let params = [];
        
        if (level) {
            whereConditions.push('level = ?');
            params.push(level);
        }
        
        if (category) {
            whereConditions.push('category = ?');
            params.push(category);
        }
        
        if (operation) {
            whereConditions.push('operation LIKE ?');
            params.push(`%${operation}%`);
        }
        
        if (targetType) {
            whereConditions.push('target_type = ?');
            params.push(targetType);
        }
        
        if (startDate) {
            whereConditions.push('created_at >= ?');
            params.push(startDate);
        }
        
        if (endDate) {
            whereConditions.push('created_at <= ?');
            params.push(endDate + ' 23:59:59');
        }
        
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        
        // 获取总数
        const countSql = `
            SELECT COUNT(*) as total 
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            ${whereClause}
        `;
        
        const { total } = await database.get(countSql, params);
        
        // 获取分页数据
        const dataSql = `
            SELECT 
                sl.*,
                u.username as user_name
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            ${whereClause}
            ORDER BY sl.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const logs = await database.all(dataSql, [...params, size, offset]);
        
        res.json({
            success: true,
            data: {
                logs: logs,
                pagination: {
                    page: page,
                    size: size,
                    total: total,
                    totalPages: Math.ceil(total / size)
                }
            }
        });
        
    } catch (error) {
        logger.error('获取系统日志失败:', error);
        res.status(500).json({
            success: false,
            message: '获取系统日志失败: ' + error.message
        });
    }
});

// GET /api/logs/:id - 获取日志详情
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const log = await database.get(`
            SELECT 
                sl.*,
                u.username as user_name
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            WHERE sl.id = ?
        `, [id]);
        
        if (!log) {
            return res.status(404).json({
                success: false,
                message: '日志记录不存在'
            });
        }
        
        res.json({
            success: true,
            data: log
        });
        
    } catch (error) {
        logger.error('获取日志详情失败:', error);
        res.status(500).json({
            success: false,
            message: '获取日志详情失败: ' + error.message
        });
    }
});

// GET /api/logs/stats/summary - 获取日志统计信息
router.get('/stats/summary', async (req, res) => {
    try {
        const timeRange = req.query.range || '7d'; // 7d, 30d, 90d
        
        let dateFilter = '';
        if (timeRange === '7d') {
            dateFilter = "WHERE created_at >= datetime('now', '-7 days')";
        } else if (timeRange === '30d') {
            dateFilter = "WHERE created_at >= datetime('now', '-30 days')";
        } else if (timeRange === '90d') {
            dateFilter = "WHERE created_at >= datetime('now', '-90 days')";
        }
        
        // 按级别统计
        const levelStats = await database.all(`
            SELECT 
                level,
                COUNT(*) as count
            FROM system_logs
            ${dateFilter}
            GROUP BY level
            ORDER BY count DESC
        `);
        
        // 按分类统计
        const categoryStats = await database.all(`
            SELECT 
                category,
                COUNT(*) as count
            FROM system_logs
            ${dateFilter}
            GROUP BY category
            ORDER BY count DESC
        `);
        
        // 按日期统计（最近7天）
        const dailyStats = await database.all(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as errors,
                SUM(CASE WHEN level = 'WARN' THEN 1 ELSE 0 END) as warnings,
                SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) as infos
            FROM system_logs
            WHERE created_at >= datetime('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);
        
        // 最近的错误日志
        const recentErrors = await database.all(`
            SELECT 
                sl.*,
                u.username as user_name
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            WHERE sl.level = 'ERROR'
            ORDER BY sl.created_at DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: {
                levelStats: levelStats,
                categoryStats: categoryStats,
                dailyStats: dailyStats,
                recentErrors: recentErrors,
                timeRange: timeRange
            }
        });
        
    } catch (error) {
        logger.error('获取日志统计失败:', error);
        res.status(500).json({
            success: false,
            message: '获取日志统计失败: ' + error.message
        });
    }
});

// POST /api/logs/clean - 清理日志 (需要管理员权限)
router.post('/clean', authUtils.authenticateToken.bind(authUtils), authUtils.requireAdmin.bind(authUtils), async (req, res) => {
    try {
        const { days = 90, level } = req.body;
        
        let whereClause = `WHERE created_at < datetime('now', '-${days} days')`;
        let params = [];
        
        if (level) {
            whereClause += ' AND level = ?';
            params.push(level);
        }
        
        const result = await database.run(`DELETE FROM system_logs ${whereClause}`, params);
        
        // 记录清理操作
        await database.run(`
            INSERT INTO system_logs (level, category, operation, message, user_id)
            VALUES (?, ?, ?, ?, ?)
        `, ['INFO', 'SYSTEM', '日志清理', `清理了${result.changes}条${days}天前的日志`, req.user.id]);
        
        res.json({
            success: true,
            message: `清理完成，删除了${result.changes}条日志记录`
        });
        
        logger.info(`日志清理完成: 删除${result.changes}条记录 (用户: ${req.user.username})`);
        
    } catch (error) {
        logger.error('日志清理失败:', error);
        res.status(500).json({
            success: false,
            message: '日志清理失败: ' + error.message
        });
    }
});

// POST /api/logs/export - 导出日志 (需要管理员权限)
router.post('/export', authUtils.authenticateToken.bind(authUtils), authUtils.requireAdmin.bind(authUtils), async (req, res) => {
    try {
        const { format = 'json', startDate, endDate, level, category } = req.body;
        
        let whereConditions = [];
        let params = [];
        
        if (startDate) {
            whereConditions.push('created_at >= ?');
            params.push(startDate);
        }
        
        if (endDate) {
            whereConditions.push('created_at <= ?');
            params.push(endDate + ' 23:59:59');
        }
        
        if (level) {
            whereConditions.push('level = ?');
            params.push(level);
        }
        
        if (category) {
            whereConditions.push('category = ?');
            params.push(category);
        }
        
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        
        const logs = await database.all(`
            SELECT 
                sl.*,
                u.username as user_name
            FROM system_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
            ${whereClause}
            ORDER BY sl.created_at DESC
        `, params);
        
        if (format === 'csv') {
            // 构建CSV格式
            let csv = 'ID,Level,Category,Operation,Target Type,Target Name,Message,User,Created At\n';
            logs.forEach(log => {
                const row = [
                    log.id,
                    log.level,
                    log.category,
                    log.operation,
                    log.target_type || '',
                    log.target_name || '',
                    `"${(log.message || '').replace(/"/g, '""')}"`,
                    log.user_name || '',
                    log.created_at
                ].join(',');
                csv += row + '\n';
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
            res.send(csv);
        } else {
            // JSON格式
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="logs.json"');
            res.json({
                exportDate: new Date().toISOString(),
                totalRecords: logs.length,
                data: logs
            });
        }
        
        logger.info(`日志导出: ${logs.length}条记录 (用户: ${req.user.username})`);
        
    } catch (error) {
        logger.error('日志导出失败:', error);
        res.status(500).json({
            success: false,
            message: '日志导出失败: ' + error.message
        });
    }
});

module.exports = router;

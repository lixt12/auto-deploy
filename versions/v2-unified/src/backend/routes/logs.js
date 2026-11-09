const express = require('express');
const { body, query, validationResult } = require('express-validator');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');
const { getSystemSettings } = require('../utils/systemSettings');

const router = express.Router();

function toIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

async function resolveRetentionDays(requestedDays) {
    if (requestedDays !== undefined && requestedDays !== null && requestedDays !== '') {
        return toIntInRange(requestedDays, 30, 1, 3650);
    }

    const settings = await getSystemSettings();
    return toIntInRange(settings.log_retention_days, 30, 1, 3650);
}

async function deleteLogsOlderThanDays(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return database.run(
        'DELETE FROM system_logs WHERE created_at < ?',
        [cutoffDate.toISOString()]
    );
}

const validateLogQuery = [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize must be between 1 and 100'),
    query('level').optional().isIn(['DEBUG', 'INFO', 'WARN', 'ERROR']).withMessage('invalid log level'),
    query('category').optional().isString().withMessage('category must be a string'),
    query('targetId').optional().isInt({ min: 1 }).withMessage('targetId must be a positive integer'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Request validation failed',
                errors: errors.array()
            });
        }
        return next();
    }
];

const validateBatchDelete = [
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    body('ids').custom((ids) => {
        const isValid = Array.isArray(ids)
            && ids.length <= 500
            && ids.every(id => Number.isInteger(Number(id)) && Number(id) > 0);
        if (!isValid) {
            throw new Error('ids must be positive integers and no more than 500 items');
        }
        return true;
    }),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Request validation failed',
                errors: errors.array()
            });
        }
        return next();
    }
];

// GET /api/logs
router.get(
    '/',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.LOGS_VIEW),
    validateLogQuery,
    async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 20,
            level,
            category,
            operation,
            targetId,
            startDate,
            endDate,
            keyword
        } = req.query;

        const parsedPage = Math.max(parseInt(String(page), 10), 1);
        const parsedPageSize = Math.max(parseInt(String(pageSize), 10), 1);
        const offset = (parsedPage - 1) * parsedPageSize;

        const whereConditions = [];
        const queryParams = [];

        if (level) {
            whereConditions.push('sl.level = ?');
            queryParams.push(level);
        }

        if (category) {
            whereConditions.push('sl.category = ?');
            queryParams.push(category);
        }

        if (operation) {
            whereConditions.push('sl.operation LIKE ?');
            queryParams.push(`%${operation}%`);
        }

        if (targetId) {
            whereConditions.push('sl.target_id = ?');
            queryParams.push(Number(targetId));
        }

        if (startDate) {
            whereConditions.push('sl.created_at >= ?');
            queryParams.push(startDate);
        }

        if (endDate) {
            whereConditions.push('sl.created_at <= ?');
            queryParams.push(endDate);
        }

        if (keyword) {
            whereConditions.push('(sl.message LIKE ? OR sl.target_name LIKE ? OR sl.details LIKE ?)');
            queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        const logs = await database.all(
            `SELECT
                sl.*,
                u.username AS user_name
             FROM system_logs sl
             LEFT JOIN users u ON sl.user_id = u.id
             ${whereClause}
             ORDER BY sl.created_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, parsedPageSize, offset]
        );

        const countResult = await database.get(
            `SELECT COUNT(*) AS total
             FROM system_logs sl
             ${whereClause}`,
            queryParams
        );

        const stats = await database.all(
            `SELECT
                level,
                COUNT(*) AS count
             FROM system_logs sl
             ${whereClause}
             GROUP BY level`,
            queryParams
        );

        return res.json({
            success: true,
            data: {
                logs,
                pagination: {
                    page: parsedPage,
                    pageSize: parsedPageSize,
                    total: Number(countResult?.total || 0),
                    totalPages: Math.ceil(Number(countResult?.total || 0) / parsedPageSize)
                },
                stats: (stats || []).reduce((acc, stat) => {
                    acc[String(stat.level || '').toLowerCase()] = stat.count;
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        logger.error('Failed to query logs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    }
);

// GET /api/logs/categories
router.get(
    '/categories',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.LOGS_VIEW),
    async (req, res) => {
    try {
        const categories = await database.all(
            `SELECT DISTINCT category
             FROM system_logs
             ORDER BY category`
        );

        return res.json({
            success: true,
            data: categories.map(item => item.category)
        });
    } catch (error) {
        logger.error('Failed to query log categories:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    }
);

// GET /api/logs/operations
router.get(
    '/operations',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.LOGS_VIEW),
    async (req, res) => {
    try {
        const operations = await database.all(
            `SELECT DISTINCT operation
             FROM system_logs
             ORDER BY operation`
        );

        return res.json({
            success: true,
            data: operations.map(item => item.operation)
        });
    } catch (error) {
        logger.error('Failed to query log operations:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    }
);

// POST /api/logs/cleanup
router.post(
    '/cleanup',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.LOGS_MANAGE),
    async (req, res) => {
    try {
        const days = await resolveRetentionDays(req.body?.days);
        const result = await deleteLogsOlderThanDays(days);

        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            ['INFO', 'SYSTEM', 'CLEANUP_LOGS', `Cleaned up ${result.changes} logs older than ${days} days`, req.user.id]
        );

        logger.info(`User ${req.user.username} cleaned ${result.changes} logs older than ${days} days`);

        return res.json({
            success: true,
            message: `Cleaned ${result.changes} logs`,
            data: {
                deletedCount: result.changes,
                days
            }
        });
    } catch (error) {
        logger.error('Failed to cleanup logs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    }
);

// POST /api/logs/batch-delete
router.post(
    '/batch-delete',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.LOGS_MANAGE),
    validateBatchDelete,
    async (req, res) => {
    try {
        const { ids } = req.body;
        const uniqueIds = [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];

        if (uniqueIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid log IDs provided'
            });
        }

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const result = await database.run(
            `DELETE FROM system_logs WHERE id IN (${placeholders})`,
            uniqueIds
        );

        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                'WARN',
                'SYSTEM',
                'BATCH_DELETE_LOGS',
                `Deleted ${result.changes} logs in batch operation`,
                req.user.id
            ]
        );

        logger.info(`User ${req.user.username} batch deleted ${result.changes} logs`);

        return res.json({
            success: true,
            message: `Deleted ${result.changes} logs`,
            data: {
                requestedCount: uniqueIds.length,
                deletedCount: result.changes
            }
        });
    } catch (error) {
        logger.error('Batch delete logs failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    }
);

// GET /api/logs/export
router.get(
    '/export',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.LOGS_MANAGE),
    async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            level,
            category,
            operation,
            targetId,
            keyword,
            format = 'json'
        } = req.query;

        const whereConditions = [];
        const queryParams = [];

        if (level) {
            whereConditions.push('sl.level = ?');
            queryParams.push(level);
        }

        if (category) {
            whereConditions.push('sl.category = ?');
            queryParams.push(category);
        }

        if (operation) {
            whereConditions.push('sl.operation LIKE ?');
            queryParams.push(`%${operation}%`);
        }

        if (targetId) {
            whereConditions.push('sl.target_id = ?');
            queryParams.push(Number(targetId));
        }

        if (startDate) {
            whereConditions.push('sl.created_at >= ?');
            queryParams.push(startDate);
        }

        if (endDate) {
            whereConditions.push('sl.created_at <= ?');
            queryParams.push(endDate);
        }

        if (keyword) {
            whereConditions.push('(sl.message LIKE ? OR sl.target_name LIKE ? OR sl.details LIKE ?)');
            queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        const logs = await database.all(
            `SELECT
                sl.*,
                u.username AS user_name
             FROM system_logs sl
             LEFT JOIN users u ON sl.user_id = u.id
             ${whereClause}
             ORDER BY sl.created_at DESC
             LIMIT 10000`,
            queryParams
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportFormat = String(format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
        const filename = `system-logs-${timestamp}.${exportFormat}`;

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        if (exportFormat === 'csv') {
            const csvHeader = 'ID,Level,Category,Operation,Target Type,Target Name,Message,User,Created At\n';
            const csvContent = logs.map(log => [
                log.id,
                log.level,
                log.category,
                log.operation,
                log.target_type || '',
                log.target_name || '',
                `"${String(log.message || '').replace(/"/g, '""')}"`,
                log.user_name || '',
                log.created_at
            ].join(',')).join('\n');

            res.send(csvHeader + csvContent);
        } else {
            res.json({
                exported_at: new Date().toISOString(),
                total_records: logs.length,
                filters: { startDate, endDate, level, category, operation, targetId, keyword },
                logs
            });
        }

        logger.info(`User ${req.user.username} exported ${logs.length} logs`);
    } catch (error) {
        logger.error('Failed to export logs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    }
);

module.exports = router;

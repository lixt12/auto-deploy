const express = require('express');
const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');
const {
    DEFAULT_SYSTEM_SETTINGS,
    getSystemSettings,
    saveSystemSettings
} = require('../utils/systemSettings');

const router = express.Router();
const dashboardSummaryCache = new Map();
const DASHBOARD_CACHE_TTL_MS = 5000;

function handleValidationErrors(req, res, next) {
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

function toIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

const validateSettings = [
    body('system_name').optional().isString().isLength({ min: 1, max: 120 }),
    body('admin_email').optional().isEmail(),
    body('max_concurrent_deployments').optional().isInt({ min: 1, max: 100 }),
    body('deployment_timeout').optional().isInt({ min: 60, max: 86400 }),
    body('log_retention_days').optional().isInt({ min: 1, max: 3650 }),
    body('session_timeout').optional().isInt({ min: 30, max: 10080 }),
    body('max_login_attempts').optional().isInt({ min: 3, max: 20 }),
    body('login_lock_minutes').optional().isInt({ min: 1, max: 1440 }),
    body('password_min_length').optional().isInt({ min: 6, max: 64 }),
    handleValidationErrors
];

// GET /api/system/settings
router.get('/settings', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SETTINGS_VIEW), async (req, res) => {
    try {
        const settings = await getSystemSettings();
        return res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('Failed to get system settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/system/settings
router.post('/settings', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SETTINGS_MANAGE), validateSettings, async (req, res) => {
    try {
        const incomingSettings = {
            ...DEFAULT_SYSTEM_SETTINGS,
            ...req.body
        };

        const nextSettings = await saveSystemSettings(incomingSettings);

        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            ['INFO', 'SYSTEM', 'UPDATE_SETTINGS', `User ${req.user.username} updated system settings`, req.user.id]
        );

        return res.json({
            success: true,
            message: 'System settings saved successfully',
            data: nextSettings
        });
    } catch (error) {
        logger.error('Failed to save system settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET /api/system/status
router.get('/status', authUtils.authenticateToken, async (req, res) => {
    try {
        const dbHealthy = await database.healthCheck();
        return res.json({
            success: true,
            data: {
                status: dbHealthy ? 'OK' : 'DEGRADED',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodejs: process.version,
                platform: process.platform,
                database: dbHealthy ? 'connected' : 'disconnected'
            }
        });
    } catch (error) {
        logger.error('Failed to get system status:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET /api/system/dashboard-summary
router.get(
    '/dashboard-summary',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.DASHBOARD_VIEW),
    async (req, res) => {
        try {
            const days = toIntInRange(req.query.days, 30, 1, 365);
            const cacheKey = `days:${days}`;
            const now = Date.now();
            const cached = dashboardSummaryCache.get(cacheKey);
            if (cached && now - cached.ts <= DASHBOARD_CACHE_TTL_MS) {
                return res.json(cached.payload);
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const from = cutoffDate.toISOString();

            const [
                projectAgg,
                serverAgg,
                statusRows,
                dailyStats,
                projectStats,
                serverStats,
                recentDeployments
            ] = await Promise.all([
                database.get(
                    `SELECT
                        COUNT(*) AS total_projects,
                        SUM(CASE WHEN auto_deploy = 1 THEN 1 ELSE 0 END) AS auto_deploy_projects
                     FROM projects`
                ),
                database.get(
                    `SELECT
                        COUNT(*) AS total_servers,
                        SUM(CASE WHEN UPPER(COALESCE(connection_status, 'UNKNOWN')) = 'ONLINE' THEN 1 ELSE 0 END) AS online_servers,
                        SUM(CASE WHEN UPPER(COALESCE(connection_status, 'UNKNOWN')) = 'OFFLINE' THEN 1 ELSE 0 END) AS offline_servers
                     FROM servers`
                ),
                database.all(
                    `SELECT status, COUNT(*) AS count
                     FROM deployments
                     WHERE started_at >= ?
                     GROUP BY status`,
                    [from]
                ),
                database.all(
                    `SELECT
                        DATE(started_at) AS date,
                        COUNT(*) AS total,
                        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
                        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
                     FROM deployments
                     WHERE started_at >= ?
                     GROUP BY DATE(started_at)
                     ORDER BY date DESC`,
                    [from]
                ),
                database.all(
                    `SELECT
                        p.name AS project_name,
                        COUNT(*) AS total,
                        SUM(CASE WHEN d.status = 'SUCCESS' THEN 1 ELSE 0 END) AS success
                     FROM deployments d
                     LEFT JOIN projects p ON d.project_id = p.id
                     WHERE d.started_at >= ?
                     GROUP BY p.id, p.name
                     ORDER BY total DESC
                     LIMIT 10`,
                    [from]
                ),
                database.all(
                    `SELECT
                        COALESCE(s.name, 'Unknown Server') AS server_name,
                        COUNT(*) AS total,
                        SUM(CASE WHEN d.status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
                        SUM(CASE WHEN d.status = 'FAILED' THEN 1 ELSE 0 END) AS failed
                     FROM deployments d
                     LEFT JOIN servers s ON d.server_id = s.id
                     WHERE d.started_at >= ?
                     GROUP BY s.id, s.name
                     ORDER BY total DESC
                     LIMIT 10`,
                    [from]
                ),
                database.all(
                    `SELECT
                        d.id,
                        d.project_id,
                        d.server_id,
                        d.status,
                        d.log,
                        d.started_at,
                        p.name AS project_name,
                        s.name AS server_name
                     FROM deployments d
                     LEFT JOIN projects p ON d.project_id = p.id
                     LEFT JOIN servers s ON d.server_id = s.id
                     ORDER BY d.started_at DESC
                     LIMIT 10`
                )
            ]);

            const statusStats = (statusRows || []).reduce((acc, row) => {
                acc[String(row.status || '').toLowerCase()] = Number(row.count || 0);
                return acc;
            }, {});

            const totalServers = Number(serverAgg?.total_servers || 0);
            const onlineServers = Number(serverAgg?.online_servers || 0);
            const offlineServers = Number(serverAgg?.offline_servers || 0);
            const payload = {
                success: true,
                data: {
                    days,
                    generated_at: new Date().toISOString(),
                    totalProjects: Number(projectAgg?.total_projects || 0),
                    autoDeployProjects: Number(projectAgg?.auto_deploy_projects || 0),
                    totalServers,
                    onlineServers,
                    offlineServers,
                    unknownServers: Math.max(0, totalServers - onlineServers - offlineServers),
                    statusStats,
                    dailyStats: dailyStats || [],
                    projectStats: projectStats || [],
                    serverStats: serverStats || [],
                    recentDeployments: recentDeployments || []
                }
            };

            dashboardSummaryCache.set(cacheKey, {
                ts: now,
                payload
            });

            return res.json(payload);
        } catch (error) {
            logger.error('Failed to get dashboard summary:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

module.exports = router;

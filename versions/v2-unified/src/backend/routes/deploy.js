const express = require('express');
const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');
const { getSystemSettings } = require('../utils/systemSettings');
const {
    notifyDeploymentStart,
    notifyDeploymentSuccess,
    notifyDeploymentFailure,
    notifyDeploymentCancelled
} = require('../utils/notificationService');

const router = express.Router();

const DEFAULT_DEPLOYMENT_TIMEOUT_SECONDS = 1800;
const DEFAULT_MAX_CONCURRENT_DEPLOYMENTS = 5;

const validateDeploy = [
    body('project_id').isInt({ min: 1 }).withMessage('project_id must be a positive integer'),
    body('server_id').isInt({ min: 1 }).withMessage('server_id must be a positive integer'),
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

function appendLog(log, message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    return log ? `${log}${line}\n` : `${line}\n`;
}

function toIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

async function updateDeploymentRecord(deploymentId, status, log, completed = false) {
    await database.run(
        `UPDATE deployments
         SET status = ?, log = ?, completed_at = ?
         WHERE id = ?`,
        [status, log, completed ? new Date().toISOString() : null, deploymentId]
    );
}

async function simulateDeploy(project, server, userId, version, options = {}) {
    const timeoutSeconds = toIntInRange(
        options.timeoutSeconds,
        DEFAULT_DEPLOYMENT_TIMEOUT_SECONDS,
        60,
        86400
    );
    const timeoutMs = timeoutSeconds * 1000;
    const startAt = Date.now();

    const createResult = await database.run(
        `INSERT INTO deployments (project_id, server_id, version, status, log, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [project.id, server.id, version || null, 'RUNNING', appendLog('', 'Deployment started'), userId]
    );

    const deploymentId = createResult.id;
    if (!deploymentId) {
        throw new Error('Failed to create deployment record');
    }

    void notifyDeploymentStart({
        deploymentId,
        projectId: project.id,
        projectName: project.name,
        serverId: server.id,
        serverName: server.name,
        version,
        createdBy: userId
    });

    const steps = [
        { name: 'Initialize deployment environment', duration: 600 },
        { name: 'Fetch source code', duration: 1200 },
        { name: 'Install dependencies', duration: 1500 },
        { name: 'Build project', duration: 2000 },
        { name: 'Publish to target server', duration: 1200 },
        { name: 'Run health check', duration: 600 }
    ];

    let log = appendLog('', `Deployment job created, job id: ${deploymentId}`);

    for (const step of steps) {
        const latest = await database.get('SELECT status, log FROM deployments WHERE id = ?', [deploymentId]);
        if (!latest || latest.status !== 'RUNNING') {
            return {
                deploymentId,
                status: latest?.status || 'CANCELLED',
                log: latest?.log || log
            };
        }

        if (Date.now() - startAt >= timeoutMs) {
            log = appendLog(latest.log || log, `ERROR: deployment timed out after ${timeoutSeconds}s`);
            await updateDeploymentRecord(deploymentId, 'FAILED', log, true);
            void notifyDeploymentFailure({
                deploymentId,
                projectId: project.id,
                projectName: project.name,
                serverId: server.id,
                serverName: server.name,
                version,
                reason: `Timed out after ${timeoutSeconds}s`
            });
            return { deploymentId, status: 'FAILED', log };
        }

        await new Promise(resolve => setTimeout(resolve, step.duration));

        const latestAfterSleep = await database.get('SELECT status, log FROM deployments WHERE id = ?', [deploymentId]);
        if (!latestAfterSleep || latestAfterSleep.status !== 'RUNNING') {
            return {
                deploymentId,
                status: latestAfterSleep?.status || 'CANCELLED',
                log: latestAfterSleep?.log || log
            };
        }

        log = latestAfterSleep.log || log;
        log = appendLog(log, `${step.name}...`);

        if (Date.now() - startAt >= timeoutMs) {
            log = appendLog(log, `ERROR: deployment timed out after ${timeoutSeconds}s`);
            await updateDeploymentRecord(deploymentId, 'FAILED', log, true);
            void notifyDeploymentFailure({
                deploymentId,
                projectId: project.id,
                projectName: project.name,
                serverId: server.id,
                serverName: server.name,
                version,
                reason: `Timed out after ${timeoutSeconds}s`
            });
            return { deploymentId, status: 'FAILED', log };
        }

        // Keep the old demo behavior of random failure.
        if (Math.random() < 0.08) {
            log = appendLog(log, `ERROR: ${step.name} failed`);
            await updateDeploymentRecord(deploymentId, 'FAILED', log, true);
            void notifyDeploymentFailure({
                deploymentId,
                projectId: project.id,
                projectName: project.name,
                serverId: server.id,
                serverName: server.name,
                version,
                reason: `${step.name} failed`
            });
            return { deploymentId, status: 'FAILED', log };
        }

        log = appendLog(log, `OK: ${step.name} completed`);
        await updateDeploymentRecord(deploymentId, 'RUNNING', log, false);
    }

    log = appendLog(log, 'Deployment completed successfully');
    await updateDeploymentRecord(deploymentId, 'SUCCESS', log, true);
    void notifyDeploymentSuccess({
        deploymentId,
        projectId: project.id,
        projectName: project.name,
        serverId: server.id,
        serverName: server.name,
        version
    });
    return { deploymentId, status: 'SUCCESS', log };
}

// GET /api/deploy
router.get('/', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.DEPLOYMENTS_VIEW), async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const pageSize = Math.max(parseInt(req.query.pageSize || '20', 10), 1);
        const { project_id, server_id, status } = req.query;

        const offset = (page - 1) * pageSize;
        const whereConditions = [];
        const queryParams = [];

        if (project_id) {
            whereConditions.push('d.project_id = ?');
            queryParams.push(project_id);
        }

        if (server_id) {
            whereConditions.push('d.server_id = ?');
            queryParams.push(server_id);
        }

        if (status) {
            whereConditions.push('d.status = ?');
            queryParams.push(status);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const deployments = await database.all(
            `SELECT
                d.*, p.name AS project_name,
                s.name AS server_name, s.host AS server_host, s.port AS server_port,
                u.username AS created_by_name
             FROM deployments d
             LEFT JOIN projects p ON d.project_id = p.id
             LEFT JOIN servers s ON d.server_id = s.id
             LEFT JOIN users u ON d.created_by = u.id
             ${whereClause}
             ORDER BY d.started_at DESC
             LIMIT ? OFFSET ?`,
            [...queryParams, pageSize, offset]
        );

        const countResult = await database.get(
            `SELECT COUNT(*) AS total
             FROM deployments d
             ${whereClause}`,
            queryParams
        );

        const total = Number(countResult?.total || 0);

        return res.json({
            success: true,
            data: {
                deployments,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        });
    } catch (error) {
        logger.error('Failed to get deployments:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET /api/deploy/stats
router.get('/stats', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.DEPLOYMENTS_VIEW), async (req, res) => {
    try {
        const days = Math.max(parseInt(req.query.days || '7', 10), 1);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const from = cutoffDate.toISOString();

        const statusStats = await database.all(
            `SELECT status, COUNT(*) AS count
             FROM deployments
             WHERE started_at >= ?
             GROUP BY status`,
            [from]
        );

        const dailyStats = await database.all(
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
        );

        const projectStats = await database.all(
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
        );

        const serverStats = await database.all(
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
        );

        const normalizedStatus = (statusStats || []).reduce((acc, item) => {
            acc[String(item.status || '').toLowerCase()] = item.count;
            return acc;
        }, {});

        return res.json({
            success: true,
            data: {
                period: `${days} days`,
                statusStats: normalizedStatus,
                dailyStats,
                projectStats,
                serverStats
            }
        });
    } catch (error) {
        logger.error('Failed to get deployment stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET /api/deploy/:id
router.get('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.DEPLOYMENTS_VIEW), async (req, res) => {
    try {
        const { id } = req.params;

        const deployment = await database.get(
            `SELECT
                d.*, p.name AS project_name, p.git_url AS project_git_url, p.git_branch AS project_git_branch,
                s.name AS server_name, s.host AS server_host, s.port AS server_port,
                u.username AS created_by_name
             FROM deployments d
             LEFT JOIN projects p ON d.project_id = p.id
             LEFT JOIN servers s ON d.server_id = s.id
             LEFT JOIN users u ON d.created_by = u.id
             WHERE d.id = ?`,
            [id]
        );

        if (!deployment) {
            return res.status(404).json({
                success: false,
                message: 'Deployment not found'
            });
        }

        return res.json({
            success: true,
            data: deployment
        });
    } catch (error) {
        logger.error('Failed to get deployment detail:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/deploy
router.post('/', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.DEPLOYMENTS_MANAGE), validateDeploy, async (req, res) => {
    try {
        const { project_id, server_id, version } = req.body;
        const settings = await getSystemSettings();
        const maxConcurrentDeployments = toIntInRange(
            settings.max_concurrent_deployments,
            DEFAULT_MAX_CONCURRENT_DEPLOYMENTS,
            1,
            100
        );
        const deploymentTimeoutSeconds = toIntInRange(
            settings.deployment_timeout,
            DEFAULT_DEPLOYMENT_TIMEOUT_SECONDS,
            60,
            86400
        );

        const project = await database.get('SELECT * FROM projects WHERE id = ?', [project_id]);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const server = await database.get('SELECT * FROM servers WHERE id = ?', [server_id]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const runningDeployment = await database.get(
            `SELECT id FROM deployments
             WHERE project_id = ? AND server_id = ? AND status = 'RUNNING'`,
            [project_id, server_id]
        );

        if (runningDeployment) {
            return res.status(409).json({
                success: false,
                message: 'A running deployment already exists for this project and server'
            });
        }

        const runningCountResult = await database.get(
            `SELECT COUNT(*) AS total
             FROM deployments
             WHERE status = 'RUNNING'`
        );
        const runningCount = Number(runningCountResult?.total || 0);
        if (runningCount >= maxConcurrentDeployments) {
            return res.status(429).json({
                success: false,
                message: `Too many running deployments (${runningCount}/${maxConcurrentDeployments})`
            });
        }

        logger.info(`User ${req.user.username} started deployment: ${project.name} -> ${server.name}`);

        simulateDeploy(project, server, req.user.id, version, {
            timeoutSeconds: deploymentTimeoutSeconds
        })
            .then(result => {
                logger.info(`Deployment completed: id=${result.deploymentId}, status=${result.status}`);
            })
            .catch(error => {
                logger.error('Background deployment execution failed:', error);
            });

        return res.status(202).json({
            success: true,
            message: 'Deployment task created and running in background',
            data: {
                project_name: project.name,
                server_name: server.name,
                status: 'RUNNING',
                timeout_seconds: deploymentTimeoutSeconds
            }
        });
    } catch (error) {
        logger.error('Failed to create deployment:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/deploy/:id/cancel
router.post('/:id/cancel', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.DEPLOYMENTS_CANCEL), async (req, res) => {
    try {
        const { id } = req.params;
        const deployment = await database.get('SELECT * FROM deployments WHERE id = ?', [id]);

        if (!deployment) {
            return res.status(404).json({
                success: false,
                message: 'Deployment not found'
            });
        }

        if (deployment.status !== 'RUNNING') {
            return res.status(400).json({
                success: false,
                message: 'Only running deployments can be cancelled'
            });
        }

        const updatedLog = appendLog(deployment.log || '', 'Deployment cancelled by user');
        await updateDeploymentRecord(id, 'CANCELLED', updatedLog, true);

        await database.run(
            `INSERT INTO system_logs (level, category, operation, target_type, target_name, target_id, message, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['INFO', 'DEPLOY', 'CANCEL', 'Deployment', `ID-${id}`, id, 'Deployment cancelled', req.user.id]
        );

        const project = await database.get('SELECT id, name FROM projects WHERE id = ?', [deployment.project_id]);
        const server = await database.get('SELECT id, name FROM servers WHERE id = ?', [deployment.server_id]);
        void notifyDeploymentCancelled({
            deploymentId: Number(id),
            projectId: deployment.project_id,
            projectName: project?.name || `Project-${deployment.project_id}`,
            serverId: deployment.server_id,
            serverName: server?.name || `Server-${deployment.server_id}`,
            cancelledBy: req.user.username
        });

        return res.json({
            success: true,
            message: 'Deployment cancelled'
        });
    } catch (error) {
        logger.error('Failed to cancel deployment:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;

const express = require('express');
const { body, validationResult } = require('express-validator');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');
const {
    getNotificationSettings,
    sanitizeNotificationSettingsForResponse,
    saveNotificationSettings,
    getNotificationLogs,
    sendTestEmailNotification,
    sendTestDingTalkNotification
} = require('../utils/notificationService');

const router = express.Router();

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

const validateSettings = [
    body('notification_frequency').optional().isIn(['immediately', 'hourly', 'daily']),
    body('email_smtp_port').optional().isInt({ min: 1, max: 65535 }),
    body('webhook_enabled').optional().isBoolean(),
    body('webhook_url').optional().isString().isLength({ max: 2048 }),
    body('webhook_secret').optional().isString().isLength({ max: 1024 }),
    body('webhook_timeout_ms').optional().isInt({ min: 1000, max: 30000 }),
    body('dingtalk_enabled').optional().isBoolean(),
    body('dingtalk_webhook_url').optional().isString().isLength({ max: 2048 }),
    body('dingtalk_secret').optional().isString().isLength({ max: 1024 }),
    body('dingtalk_timeout_ms').optional().isInt({ min: 1000, max: 30000 }),
    body('dingtalk_at_all').optional().isBoolean(),
    body('dingtalk_at_mobiles').optional().custom(value => (
        typeof value === 'string' || Array.isArray(value)
    )),
    body('quiet_hours_start').optional().matches(/^\d{2}:\d{2}$/),
    body('quiet_hours_end').optional().matches(/^\d{2}:\d{2}$/),
    body('notification_recipients').optional().custom(value => (
        typeof value === 'string' || Array.isArray(value)
    )),
    handleValidationErrors
];

const validateTestEmail = [
    body('recipient').isEmail().withMessage('recipient must be a valid email'),
    handleValidationErrors
];

const validateTestDingTalk = [
    body('message').optional().isString().isLength({ max: 1000 }),
    handleValidationErrors
];

// GET /api/notifications/settings
router.get('/settings', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.NOTIFICATIONS_VIEW), async (req, res) => {
    try {
        const settings = await getNotificationSettings();
        return res.json({
            success: true,
            data: sanitizeNotificationSettingsForResponse(settings)
        });
    } catch (error) {
        logger.error('Failed to get notification settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/notifications/settings
router.post('/settings', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.NOTIFICATIONS_MANAGE), validateSettings, async (req, res) => {
    try {
        const savedSettings = await saveNotificationSettings(req.body || {});

        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                'INFO',
                'NOTIFICATION',
                'UPDATE_SETTINGS',
                `User ${req.user.username} updated notification settings`,
                req.user.id
            ]
        );

        return res.json({
            success: true,
            message: 'Notification settings saved successfully',
            data: sanitizeNotificationSettingsForResponse(savedSettings)
        });
    } catch (error) {
        logger.error('Failed to save notification settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET /api/notifications/logs
router.get('/logs', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.NOTIFICATIONS_VIEW), async (req, res) => {
    try {
        const logs = await getNotificationLogs(req.query.limit || 200);
        return res.json({
            success: true,
            data: logs || []
        });
    } catch (error) {
        logger.error('Failed to get notification logs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/notifications/test-email
router.post('/test-email', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.NOTIFICATIONS_MANAGE), validateTestEmail, async (req, res) => {
    try {
        const { recipient } = req.body;
        const result = await sendTestEmailNotification(recipient, req.user.username);

        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                result.success ? 'INFO' : 'WARN',
                'NOTIFICATION',
                'TEST_EMAIL',
                `User ${req.user.username} executed test email to ${recipient}`,
                req.user.id
            ]
        );

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message || 'Test email failed'
            });
        }

        return res.json({
            success: true,
            message: 'Test email sent successfully (simulated mode)',
            data: result
        });
    } catch (error) {
        logger.error('Failed to send test email:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/notifications/test-dingtalk
router.post('/test-dingtalk', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.NOTIFICATIONS_MANAGE), validateTestDingTalk, async (req, res) => {
    try {
        const customMessage = String(req.body?.message || '').trim();
        const result = await sendTestDingTalkNotification(req.user.username, customMessage);

        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                result.success ? 'INFO' : 'WARN',
                'NOTIFICATION',
                'TEST_DINGTALK',
                `User ${req.user.username} executed test dingtalk notification`,
                req.user.id
            ]
        );

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message || 'Test DingTalk failed'
            });
        }

        return res.json({
            success: true,
            message: 'Test DingTalk sent',
            data: result
        });
    } catch (error) {
        logger.error('Failed to send test DingTalk:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const database = require('../config/database');
const logger = require('./logger');

const DEFAULT_NOTIFICATION_SETTINGS = {
    email_enabled: false,
    email_smtp_host: '',
    email_smtp_port: 587,
    email_smtp_username: '',
    email_smtp_password: '',
    email_from: '',
    webhook_enabled: false,
    webhook_url: '',
    webhook_secret: '',
    webhook_timeout_ms: 5000,
    dingtalk_enabled: false,
    dingtalk_webhook_url: '',
    dingtalk_secret: '',
    dingtalk_timeout_ms: 5000,
    dingtalk_at_all: false,
    dingtalk_at_mobiles: [],
    notify_deployment_success: true,
    notify_deployment_failure: true,
    notify_deployment_start: false,
    notify_server_offline: true,
    notify_service_down: true,
    notify_system_error: true,
    notification_frequency: 'immediately',
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    notification_recipients: []
};
const MASKED_SECRET_PLACEHOLDER = '******';

const EVENT_CONFIG = {
    deployment_start: {
        toggle: 'notify_deployment_start',
        type: 'DEPLOYMENT_START',
        title: 'Deployment Started'
    },
    deployment_success: {
        toggle: 'notify_deployment_success',
        type: 'DEPLOYMENT_SUCCESS',
        title: 'Deployment Succeeded'
    },
    deployment_failure: {
        toggle: 'notify_deployment_failure',
        type: 'DEPLOYMENT_FAILURE',
        title: 'Deployment Failed'
    },
    deployment_cancelled: {
        toggle: 'notify_deployment_failure',
        type: 'DEPLOYMENT_CANCELLED',
        title: 'Deployment Cancelled'
    },
    server_offline: {
        toggle: 'notify_server_offline',
        type: 'SERVER_OFFLINE',
        title: 'Server Offline'
    },
    service_down: {
        toggle: 'notify_service_down',
        type: 'SERVICE_DOWN',
        title: 'Service Down'
    },
    system_error: {
        toggle: 'notify_system_error',
        type: 'SYSTEM_ERROR',
        title: 'System Error'
    },
    test_email: {
        type: 'TEST_EMAIL',
        title: 'Test Email'
    },
    test_dingtalk: {
        type: 'TEST_DINGTALK',
        title: 'Test DingTalk'
    }
};

const DINGTALK_EVENT_LABELS = {
    deployment_start: '\u90e8\u7f72\u5f00\u59cb',
    deployment_success: '\u90e8\u7f72\u6210\u529f',
    deployment_failure: '\u90e8\u7f72\u5931\u8d25',
    deployment_cancelled: '\u90e8\u7f72\u5df2\u53d6\u6d88',
    server_offline: '\u670d\u52a1\u5668\u79bb\u7ebf',
    service_down: '\u670d\u52a1\u5b95\u673a',
    system_error: '\u7cfb\u7edf\u9519\u8bef',
    test_email: '\u6d4b\u8bd5\u90ae\u4ef6',
    test_dingtalk: '\u6d4b\u8bd5\u9489\u9489'
};

let lastSystemErrorNotificationAt = 0;

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === '1' || value === 1 || value === 'true') {
        return true;
    }
    if (value === '0' || value === 0 || value === 'false') {
        return false;
    }
    return fallback;
}

function toIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

function normalizeRecipients(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => String(item).trim())
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/[,\n;]/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    return [];
}

function normalizeTime(value, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
        return fallback;
    }
    const [hour, minute] = trimmed.split(':').map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return fallback;
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeSecretText(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
}

function resolveSecretField(nextValue, existingValue) {
    if (nextValue === undefined) {
        return normalizeSecretText(existingValue);
    }

    const normalizedNext = normalizeSecretText(nextValue);
    if (normalizedNext === MASKED_SECRET_PLACEHOLDER) {
        return normalizeSecretText(existingValue);
    }
    return normalizedNext;
}

function formatShanghaiDateTime(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const getPart = type => {
        const found = parts.find(item => item.type === type);
        return found ? found.value : '00';
    };
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}

function getDingTalkEventLabel(eventKey) {
    return DINGTALK_EVENT_LABELS[eventKey] || String(eventKey || '\u901a\u77e5');
}

function getDingTalkTitle(eventKey, fallbackTitle) {
    return DINGTALK_EVENT_LABELS[eventKey] || String(fallbackTitle || '\u901a\u77e5');
}

function normalizeNotificationSettings(settings = {}) {
    return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...settings,
        email_enabled: toBoolean(settings.email_enabled, DEFAULT_NOTIFICATION_SETTINGS.email_enabled),
        email_smtp_port: toIntInRange(
            settings.email_smtp_port,
            DEFAULT_NOTIFICATION_SETTINGS.email_smtp_port,
            1,
            65535
        ),
        webhook_enabled: toBoolean(settings.webhook_enabled, DEFAULT_NOTIFICATION_SETTINGS.webhook_enabled),
        webhook_url: String(settings.webhook_url || '').trim(),
        webhook_secret: String(settings.webhook_secret || '').trim(),
        webhook_timeout_ms: toIntInRange(
            settings.webhook_timeout_ms,
            DEFAULT_NOTIFICATION_SETTINGS.webhook_timeout_ms,
            1000,
            30000
        ),
        dingtalk_enabled: toBoolean(settings.dingtalk_enabled, DEFAULT_NOTIFICATION_SETTINGS.dingtalk_enabled),
        dingtalk_webhook_url: String(settings.dingtalk_webhook_url || '').trim(),
        dingtalk_secret: String(settings.dingtalk_secret || '').trim(),
        dingtalk_timeout_ms: toIntInRange(
            settings.dingtalk_timeout_ms,
            DEFAULT_NOTIFICATION_SETTINGS.dingtalk_timeout_ms,
            1000,
            30000
        ),
        dingtalk_at_all: toBoolean(settings.dingtalk_at_all, DEFAULT_NOTIFICATION_SETTINGS.dingtalk_at_all),
        dingtalk_at_mobiles: normalizeRecipients(settings.dingtalk_at_mobiles),
        notify_deployment_success: toBoolean(
            settings.notify_deployment_success,
            DEFAULT_NOTIFICATION_SETTINGS.notify_deployment_success
        ),
        notify_deployment_failure: toBoolean(
            settings.notify_deployment_failure,
            DEFAULT_NOTIFICATION_SETTINGS.notify_deployment_failure
        ),
        notify_deployment_start: toBoolean(
            settings.notify_deployment_start,
            DEFAULT_NOTIFICATION_SETTINGS.notify_deployment_start
        ),
        notify_server_offline: toBoolean(
            settings.notify_server_offline,
            DEFAULT_NOTIFICATION_SETTINGS.notify_server_offline
        ),
        notify_service_down: toBoolean(
            settings.notify_service_down,
            DEFAULT_NOTIFICATION_SETTINGS.notify_service_down
        ),
        notify_system_error: toBoolean(
            settings.notify_system_error,
            DEFAULT_NOTIFICATION_SETTINGS.notify_system_error
        ),
        notification_frequency: ['immediately', 'hourly', 'daily'].includes(settings.notification_frequency)
            ? settings.notification_frequency
            : DEFAULT_NOTIFICATION_SETTINGS.notification_frequency,
        quiet_hours_enabled: toBoolean(
            settings.quiet_hours_enabled,
            DEFAULT_NOTIFICATION_SETTINGS.quiet_hours_enabled
        ),
        quiet_hours_start: normalizeTime(settings.quiet_hours_start, DEFAULT_NOTIFICATION_SETTINGS.quiet_hours_start),
        quiet_hours_end: normalizeTime(settings.quiet_hours_end, DEFAULT_NOTIFICATION_SETTINGS.quiet_hours_end),
        notification_recipients: normalizeRecipients(settings.notification_recipients)
    };
}

async function getNotificationSettings() {
    const row = await database.get('SELECT settings_json FROM notification_settings WHERE id = 1');
    if (!row || !row.settings_json) {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }

    try {
        const parsed = JSON.parse(row.settings_json);
        return normalizeNotificationSettings(parsed);
    } catch (error) {
        logger.warn('Failed to parse notification settings JSON, fallback to defaults');
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
}

function sanitizeNotificationSettingsForResponse(settings = {}) {
    const normalized = normalizeNotificationSettings(settings);
    const emailConfigured = Boolean(normalized.email_smtp_password);
    const webhookSecretConfigured = Boolean(normalized.webhook_secret);
    const dingtalkSecretConfigured = Boolean(normalized.dingtalk_secret);

    return {
        ...normalized,
        email_smtp_password: emailConfigured ? MASKED_SECRET_PLACEHOLDER : '',
        webhook_secret: webhookSecretConfigured ? MASKED_SECRET_PLACEHOLDER : '',
        dingtalk_secret: dingtalkSecretConfigured ? MASKED_SECRET_PLACEHOLDER : '',
        email_smtp_password_configured: emailConfigured,
        webhook_secret_configured: webhookSecretConfigured,
        dingtalk_secret_configured: dingtalkSecretConfigured
    };
}

async function saveNotificationSettings(settings) {
    const existing = await getNotificationSettings();
    const merged = {
        ...existing,
        ...(settings || {})
    };

    merged.email_smtp_password = resolveSecretField(settings?.email_smtp_password, existing.email_smtp_password);
    merged.webhook_secret = resolveSecretField(settings?.webhook_secret, existing.webhook_secret);
    merged.dingtalk_secret = resolveSecretField(settings?.dingtalk_secret, existing.dingtalk_secret);

    const normalized = normalizeNotificationSettings(merged);
    await database.run(
        `INSERT OR REPLACE INTO notification_settings (id, settings_json, updated_at)
         VALUES (1, ?, CURRENT_TIMESTAMP)`,
        [JSON.stringify(normalized)]
    );
    return normalized;
}

async function appendNotificationLog({ type, title, message, recipient, status }) {
    const normalizedStatus = ['sent', 'failed', 'pending'].includes(status) ? status : 'pending';
    await database.run(
        `INSERT INTO notification_logs (type, title, message, recipient, status)
         VALUES (?, ?, ?, ?, ?)`,
        [type || 'GENERAL', title || '-', message || '-', recipient || '-', normalizedStatus]
    );
}

async function getNotificationLogs(limit = 200) {
    const normalizedLimit = toIntInRange(limit, 200, 1, 1000);
    return database.all(
        `SELECT id, type, title, message, recipient, status, created_at
         FROM notification_logs
         ORDER BY created_at DESC
         LIMIT ?`,
        [normalizedLimit]
    );
}

function parseTimeToMinutes(value) {
    const normalized = normalizeTime(value, '00:00');
    const [hour, minute] = normalized.split(':').map(Number);
    return hour * 60 + minute;
}

function isInQuietHours(settings, now = new Date()) {
    if (!settings.quiet_hours_enabled) {
        return false;
    }
    const startMinutes = parseTimeToMinutes(settings.quiet_hours_start);
    const endMinutes = parseTimeToMinutes(settings.quiet_hours_end);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (startMinutes === endMinutes) {
        return true;
    }
    if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function getEventMeta(eventKey) {
    return EVENT_CONFIG[eventKey] || {
        type: String(eventKey || 'EVENT').toUpperCase(),
        title: String(eventKey || 'Event')
    };
}

function shouldDispatchEvent(settings, eventKey) {
    const meta = getEventMeta(eventKey);
    if (!meta.toggle) {
        return true;
    }
    return toBoolean(settings[meta.toggle], true);
}

function postJson(urlString, body, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        let targetUrl;
        try {
            targetUrl = new URL(urlString);
        } catch (error) {
            reject(new Error(`Invalid webhook URL: ${urlString}`));
            return;
        }

        const isHttps = targetUrl.protocol === 'https:';
        const requestLib = isHttps ? https : http;
        const request = requestLib.request(
            {
                protocol: targetUrl.protocol,
                hostname: targetUrl.hostname,
                port: targetUrl.port || (isHttps ? 443 : 80),
                path: `${targetUrl.pathname}${targetUrl.search}`,
                method: 'POST',
                headers,
                timeout: timeoutMs
            },
            response => {
                let rawBody = '';
                response.setEncoding('utf8');
                response.on('data', chunk => {
                    rawBody += chunk;
                });
                response.on('end', () => {
                    const statusCode = Number(response.statusCode || 0);
                    resolve({
                        ok: statusCode >= 200 && statusCode < 300,
                        statusCode,
                        body: rawBody
                    });
                });
            }
        );

        request.on('timeout', () => {
            request.destroy(new Error(`Webhook request timed out after ${timeoutMs}ms`));
        });

        request.on('error', error => reject(error));
        request.write(body);
        request.end();
    });
}

async function sendWebhook(settings, eventKey, title, message, payload) {
    if (!settings.webhook_enabled) {
        return { attempted: false, success: false, message: 'Webhook disabled' };
    }

    const webhookUrl = String(settings.webhook_url || '').trim();
    if (!webhookUrl) {
        return { attempted: true, success: false, message: 'Webhook URL is empty' };
    }

    const timestamp = String(Date.now());
    const bodyObject = {
        event: eventKey,
        title,
        message,
        timestamp: new Date().toISOString(),
        payload: payload || {}
    };
    const body = JSON.stringify(bodyObject);
    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Auto-Deploy-Event': String(eventKey),
        'X-Auto-Deploy-Timestamp': timestamp
    };

    if (settings.webhook_secret) {
        const signature = crypto
            .createHmac('sha256', settings.webhook_secret)
            .update(`${timestamp}.${body}`)
            .digest('hex');
        headers['X-Auto-Deploy-Signature'] = `sha256=${signature}`;
    }

    try {
        const result = await postJson(webhookUrl, body, headers, settings.webhook_timeout_ms);
        if (result.ok) {
            return {
                attempted: true,
                success: true,
                message: `Webhook delivered (${result.statusCode})`
            };
        }

        return {
            attempted: true,
            success: false,
            message: `Webhook failed with status ${result.statusCode}`
        };
    } catch (error) {
        return {
            attempted: true,
            success: false,
            message: `Webhook request failed: ${error.message}`
        };
    }
}

function buildDingTalkSignedUrl(webhookUrl, secret) {
    const target = new URL(webhookUrl);
    if (!secret) {
        return target.toString();
    }

    const timestamp = String(Date.now());
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = crypto
        .createHmac('sha256', secret)
        .update(stringToSign)
        .digest('base64');
    target.searchParams.set('timestamp', timestamp);
    target.searchParams.set('sign', sign);
    return target.toString();
}

function isLikelyDingTalkWebhook(urlString) {
    try {
        const target = new URL(String(urlString || '').trim());
        const host = String(target.hostname || '').toLowerCase();
        const pathname = String(target.pathname || '').toLowerCase();
        return host.includes('dingtalk.com') && pathname.includes('/robot/send');
    } catch (error) {
        return false;
    }
}

async function sendDingTalk(settings, eventKey, title, message) {
    if (!settings.dingtalk_enabled) {
        return { attempted: false, success: false, message: 'DingTalk disabled' };
    }

    const webhookUrl = String(settings.dingtalk_webhook_url || '').trim();
    if (!webhookUrl) {
        return { attempted: true, success: false, message: 'DingTalk webhook URL is empty' };
    }

    let targetUrl = '';
    try {
        targetUrl = buildDingTalkSignedUrl(webhookUrl, String(settings.dingtalk_secret || '').trim());
    } catch (error) {
        return {
            attempted: true,
            success: false,
            message: `Invalid DingTalk webhook URL: ${webhookUrl}`
        };
    }

    const atMobiles = normalizeRecipients(settings.dingtalk_at_mobiles);
    const localizedTitle = getDingTalkTitle(eventKey, title);
    const localizedEvent = getDingTalkEventLabel(eventKey);
    const localizedTime = formatShanghaiDateTime(new Date());
    const contentText = String(message || '').trim() || '-';
    const markdownText = [
        `### ${localizedTitle}`,
        '',
        '**\u6d88\u606f\u5185\u5bb9**',
        contentText,
        '',
        '---',
        '**\u4e8b\u4ef6\u4fe1\u606f**',
        `- \u4e8b\u4ef6\uff1a${localizedEvent}`,
        `- \u65f6\u95f4\uff1a${localizedTime}`
    ].join('\n');
    const bodyObject = {
        msgtype: 'markdown',
        markdown: {
            title: localizedTitle,
            text: markdownText
        },
        at: {
            isAtAll: Boolean(settings.dingtalk_at_all),
            atMobiles
        }
    };
    const body = JSON.stringify(bodyObject);
    const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    };

    try {
        const result = await postJson(targetUrl, body, headers, settings.dingtalk_timeout_ms);
        if (!result.ok) {
            return {
                attempted: true,
                success: false,
                message: `DingTalk failed with status ${result.statusCode}`
            };
        }

        let responsePayload = null;
        try {
            responsePayload = JSON.parse(String(result.body || '').trim() || '{}');
        } catch (parseError) {
            responsePayload = null;
        }
        if (responsePayload && Number(responsePayload.errcode || 0) !== 0) {
            return {
                attempted: true,
                success: false,
                message: `DingTalk error: ${responsePayload.errmsg || responsePayload.errcode}`
            };
        }

        return {
            attempted: true,
            success: true,
            message: `DingTalk delivered (${result.statusCode})`
        };
    } catch (error) {
        return {
            attempted: true,
            success: false,
            message: `DingTalk request failed: ${error.message}`
        };
    }
}

function canSendEmail(settings) {
    return settings.email_enabled
        && Boolean(String(settings.email_smtp_host || '').trim())
        && Boolean(String(settings.email_smtp_username || '').trim())
        && Boolean(String(settings.email_smtp_password || '').trim());
}

async function sendEmail(settings, recipients, eventKey, title, message) {
    if (!settings.email_enabled) {
        return { attempted: false, success: false, message: 'Email disabled' };
    }

    if (!recipients || recipients.length === 0) {
        return { attempted: true, success: false, message: 'No email recipients configured' };
    }

    if (!canSendEmail(settings)) {
        return {
            attempted: true,
            success: false,
            message: 'SMTP fields are incomplete'
        };
    }

    // Keep email dispatch as simulated mode until SMTP transport is introduced.
    return {
        attempted: true,
        success: true,
        message: `Email simulated for ${eventKey} to ${recipients.join(', ')}`,
        title,
        body: message
    };
}

function summarizeChannels(channelResults) {
    return channelResults
        .filter(result => result.attempted)
        .map(result => `${result.channel}: ${result.message}`)
        .join(' | ');
}

function summarizeAllChannels(channelResults) {
    return channelResults
        .map(result => `${result.channel}: ${result.message}`)
        .join(' | ');
}

function resolveStatus(channelResults) {
    const attempted = channelResults.filter(item => item.attempted);
    if (attempted.length === 0) {
        return 'pending';
    }
    if (attempted.every(item => item.success)) {
        return 'sent';
    }
    if (attempted.some(item => item.success)) {
        return 'sent';
    }
    return 'failed';
}

async function dispatchNotification({
    eventKey,
    title,
    message,
    payload = {},
    recipients = null,
    force = false,
    ignoreQuietHours = false,
    channels = { email: true, webhook: true, dingtalk: true }
}) {
    const settings = await getNotificationSettings();
    const meta = getEventMeta(eventKey);
    const resolvedTitle = title || meta.title;
    const resolvedMessage = message || '-';

    if (!force && !shouldDispatchEvent(settings, eventKey)) {
        return {
            success: true,
            skipped: true,
            reason: 'disabled'
        };
    }

    if (!ignoreQuietHours && isInQuietHours(settings)) {
        await appendNotificationLog({
            type: meta.type,
            title: resolvedTitle,
            message: `${resolvedMessage} | Suppressed by quiet hours`,
            recipient: '-',
            status: 'pending'
        });
        return {
            success: true,
            skipped: true,
            reason: 'quiet_hours'
        };
    }

    const resolvedRecipients = normalizeRecipients(
        recipients === null ? settings.notification_recipients : recipients
    );

    const channelResults = [];
    if (channels.email !== false) {
        const emailResult = await sendEmail(settings, resolvedRecipients, eventKey, resolvedTitle, resolvedMessage);
        channelResults.push({
            channel: 'email',
            ...emailResult
        });
    }

    if (channels.webhook !== false) {
        const webhookResult = await sendWebhook(settings, eventKey, resolvedTitle, resolvedMessage, payload);
        channelResults.push({
            channel: 'webhook',
            ...webhookResult
        });
    }

    if (channels.dingtalk !== false) {
        const dingtalkResult = await sendDingTalk(settings, eventKey, resolvedTitle, resolvedMessage);
        channelResults.push({
            channel: 'dingtalk',
            ...dingtalkResult
        });
    }

    const attemptedChannels = channelResults.filter(item => item.attempted);
    const status = attemptedChannels.length === 0 ? 'failed' : resolveStatus(channelResults);
    const summary = attemptedChannels.length === 0
        ? summarizeAllChannels(channelResults)
        : summarizeChannels(channelResults);
    const includeEmailRecipient = channels.email !== false && resolvedRecipients.length > 0;
    const includeWebhookRecipient = channels.webhook !== false && settings.webhook_enabled;
    const includeDingTalkRecipient = channels.dingtalk !== false && settings.dingtalk_enabled;
    const recipientSummary = [
        includeEmailRecipient ? `email:${resolvedRecipients.join(',')}` : '',
        includeWebhookRecipient ? `webhook:${settings.webhook_url || '-'}` : '',
        includeDingTalkRecipient ? `dingtalk:${settings.dingtalk_webhook_url || '-'}` : ''
    ].filter(Boolean).join(' | ') || '-';

    await appendNotificationLog({
        type: meta.type,
        title: resolvedTitle,
        message: summary ? `${resolvedMessage} | ${summary}` : resolvedMessage,
        recipient: recipientSummary,
        status
    });

    return {
        success: status !== 'failed',
        status,
        summary
    };
}

async function safeDispatch(args) {
    try {
        return await dispatchNotification(args);
    } catch (error) {
        logger.error(`Dispatch notification failed (${args.eventKey}):`, error);
        try {
            const meta = getEventMeta(args.eventKey);
            await appendNotificationLog({
                type: meta.type,
                title: args.title || meta.title,
                message: `${args.message || '-'} | Dispatch error: ${error.message}`,
                recipient: '-',
                status: 'failed'
            });
        } catch (writeError) {
            logger.error('Failed to write notification failure log:', writeError);
        }
        return {
            success: false,
            status: 'failed',
            error: error.message
        };
    }
}

function formatDeploymentTarget(payload = {}) {
    const projectName = payload.projectName || payload.project_name || 'Unknown project';
    const serverName = payload.serverName || payload.server_name || 'Unknown server';
    return `${projectName} -> ${serverName}`;
}

async function notifyDeploymentStart(payload = {}) {
    const deploymentId = payload.deploymentId || payload.deployment_id;
    return safeDispatch({
        eventKey: 'deployment_start',
        title: 'Deployment Started',
        message: `Deployment #${deploymentId || '-'} started (${formatDeploymentTarget(payload)})`,
        payload
    });
}

async function notifyDeploymentSuccess(payload = {}) {
    const deploymentId = payload.deploymentId || payload.deployment_id;
    return safeDispatch({
        eventKey: 'deployment_success',
        title: 'Deployment Succeeded',
        message: `Deployment #${deploymentId || '-'} succeeded (${formatDeploymentTarget(payload)})`,
        payload
    });
}

async function notifyDeploymentFailure(payload = {}) {
    const deploymentId = payload.deploymentId || payload.deployment_id;
    const reason = payload.reason ? `, reason: ${payload.reason}` : '';
    return safeDispatch({
        eventKey: 'deployment_failure',
        title: 'Deployment Failed',
        message: `Deployment #${deploymentId || '-'} failed (${formatDeploymentTarget(payload)}${reason})`,
        payload
    });
}

async function notifyDeploymentCancelled(payload = {}) {
    const deploymentId = payload.deploymentId || payload.deployment_id;
    return safeDispatch({
        eventKey: 'deployment_cancelled',
        title: 'Deployment Cancelled',
        message: `Deployment #${deploymentId || '-'} cancelled (${formatDeploymentTarget(payload)})`,
        payload
    });
}

async function notifyServerOffline(payload = {}) {
    const serverName = payload.serverName || payload.server_name || 'Unknown server';
    const host = payload.host || '-';
    const port = payload.port || '-';
    const reason = payload.reason ? `, reason: ${payload.reason}` : '';
    return safeDispatch({
        eventKey: 'server_offline',
        title: 'Server Offline',
        message: `Server offline: ${serverName} (${host}:${port}${reason})`,
        payload
    });
}

function compactSingleLineText(value, maxLength = 120) {
    const text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) {
        return '-';
    }
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildSingleServiceDownMessage(payload = {}) {
    const serverName = payload.serverName || payload.server_name || 'Unknown server';
    const serviceName = payload.serviceName || payload.service_name || 'Unknown service';
    const host = payload.host || '-';
    const port = payload.port || '-';
    const reason = payload.reason ? `, reason: ${payload.reason}` : '';
    return `Service down: ${serviceName} on ${serverName} (${host}:${port}${reason})`;
}

function buildBatchServiceDownMessage(payload = {}) {
    const services = Array.isArray(payload.services)
        ? payload.services.filter(item => item && typeof item === 'object')
        : [];
    if (services.length === 0) {
        return '';
    }

    const issueCount = Math.max(
        Number.parseInt(String(payload.issueCount || services.length), 10) || services.length,
        services.length
    );
    const trigger = compactSingleLineText(payload.checkedBy || payload.trigger || '', 40);
    const header = trigger === '-'
        ? `Service down alert: ${issueCount} issue(s) detected`
        : `Service down alert: ${issueCount} issue(s) detected (trigger: ${trigger})`;

    const maxItems = 12;
    const listedItems = services.slice(0, maxItems);
    const lines = listedItems.map((item, index) => {
        const serviceName = compactSingleLineText(item.serviceName || item.service_name || '-', 60);
        const serverName = compactSingleLineText(item.serverName || item.server_name || 'Unknown server', 50);
        const host = compactSingleLineText(item.host || '-', 60);
        const port = compactSingleLineText(item.port || '-', 10);
        const status = compactSingleLineText(item.status || item.serviceStatus || item.service_status || '', 20);
        const reason = compactSingleLineText(item.reason || '-', 120);
        const statusPart = status === '-' ? '' : `, status=${status}`;
        return `${index + 1}. ${serviceName} @ ${serverName} (${host}:${port}${statusPart}) - ${reason}`;
    });

    const omittedCount = issueCount - listedItems.length;
    if (omittedCount > 0) {
        lines.push(`...and ${omittedCount} more service issue(s).`);
    }

    return `${header}\n${lines.join('\n')}`;
}

async function notifyServiceDown(payload = {}) {
    const batchMessage = buildBatchServiceDownMessage(payload);
    const message = batchMessage || buildSingleServiceDownMessage(payload);
    const services = Array.isArray(payload.services) ? payload.services : [];
    const title = services.length > 1
        ? `Service Down (${services.length})`
        : 'Service Down';

    return safeDispatch({
        eventKey: 'service_down',
        title,
        message,
        payload
    });
}

async function notifySystemError(payload = {}) {
    const cooldownMs = toIntInRange(process.env.SYSTEM_ERROR_NOTIFY_COOLDOWN_MS, 60000, 5000, 3600000);
    const now = Date.now();
    if (now - lastSystemErrorNotificationAt < cooldownMs) {
        return {
            success: true,
            skipped: true,
            reason: 'rate_limited'
        };
    }

    lastSystemErrorNotificationAt = now;
    const path = payload.path || payload.url || '-';
    const method = payload.method || '-';
    const status = payload.status || 500;
    const reason = payload.message || 'Unknown error';

    return safeDispatch({
        eventKey: 'system_error',
        title: 'System Error',
        message: `HTTP ${status} ${method} ${path} - ${reason}`,
        payload,
        ignoreQuietHours: true
    });
}

async function sendTestEmailNotification(recipient, requestedBy = 'system') {
    const settings = await getNotificationSettings();
    if (!settings.email_enabled) {
        await appendNotificationLog({
            type: EVENT_CONFIG.test_email.type,
            title: EVENT_CONFIG.test_email.title,
            message: 'Email notifications are disabled',
            recipient: recipient || '-',
            status: 'failed'
        });
        return {
            success: false,
            status: 'failed',
            message: 'Email notifications are disabled'
        };
    }

    return safeDispatch({
        eventKey: 'test_email',
        title: EVENT_CONFIG.test_email.title,
        message: `Test email requested by ${requestedBy}`,
        payload: {
            recipient,
            requestedBy
        },
        recipients: [recipient],
        force: true,
        channels: {
            email: true,
            webhook: false,
            dingtalk: false
        },
        ignoreQuietHours: true
    });
}

async function sendTestDingTalkNotification(requestedBy = 'system', customMessage = '') {
    const settings = await getNotificationSettings();
    const normalizedCustomMessage = String(customMessage || '').trim();
    const messageText = normalizedCustomMessage || '\u8fd9\u662f\u4e00\u6761\u9489\u9489\u6d4b\u8bd5\u6d88\u606f';
    const testTitle = `\u6d4b\u8bd5\u9489\u9489\uff08\u53d1\u8d77\u4eba\uff1a${requestedBy}\uff09`;

    let effectiveSettings = settings;
    let usedWebhookCompat = false;
    const explicitDingTalkUrl = String(settings.dingtalk_webhook_url || '').trim();
    if ((!settings.dingtalk_enabled || !explicitDingTalkUrl)
        && settings.webhook_enabled
        && isLikelyDingTalkWebhook(settings.webhook_url)) {
        effectiveSettings = {
            ...settings,
            dingtalk_enabled: true,
            dingtalk_webhook_url: String(settings.webhook_url || '').trim(),
            dingtalk_secret: String(settings.webhook_secret || '').trim(),
            dingtalk_timeout_ms: toIntInRange(
                settings.webhook_timeout_ms,
                settings.dingtalk_timeout_ms || DEFAULT_NOTIFICATION_SETTINGS.dingtalk_timeout_ms,
                1000,
                30000
            )
        };
        usedWebhookCompat = true;
    }

    if (!effectiveSettings.dingtalk_enabled) {
        const disabledMessage = isLikelyDingTalkWebhook(settings.webhook_url)
            ? 'DingTalk channel is disabled. You configured a DingTalk URL in Webhook channel. Enable DingTalk channel or keep using webhook channel.'
            : 'DingTalk notifications are disabled';
        await appendNotificationLog({
            type: EVENT_CONFIG.test_dingtalk.type,
            title: EVENT_CONFIG.test_dingtalk.title,
            message: disabledMessage,
            recipient: settings.dingtalk_webhook_url || settings.webhook_url || '-',
            status: 'failed'
        });
        return {
            success: false,
            status: 'failed',
            message: disabledMessage
        };
    }

    const dingtalkResult = await sendDingTalk(
        effectiveSettings,
        'test_dingtalk',
        testTitle,
        messageText
    );

    const status = dingtalkResult.success ? 'sent' : 'failed';
    const sourceMessage = usedWebhookCompat ? ' | source: webhook channel' : '';
    await appendNotificationLog({
        type: EVENT_CONFIG.test_dingtalk.type,
        title: EVENT_CONFIG.test_dingtalk.title,
        message: `\u6d4b\u8bd5\u9489\u9489\uff08\u53d1\u8d77\u4eba\uff1a${requestedBy}\uff09\uff1a${messageText} | dingtalk: ${dingtalkResult.message}${sourceMessage}`,
        recipient: `dingtalk:${effectiveSettings.dingtalk_webhook_url || '-'}`,
        status
    });

    return {
        success: dingtalkResult.success,
        status,
        message: dingtalkResult.message,
        source: usedWebhookCompat ? 'webhook' : 'dingtalk'
    };
}

module.exports = {
    DEFAULT_NOTIFICATION_SETTINGS,
    MASKED_SECRET_PLACEHOLDER,
    normalizeNotificationSettings,
    getNotificationSettings,
    sanitizeNotificationSettingsForResponse,
    saveNotificationSettings,
    appendNotificationLog,
    getNotificationLogs,
    dispatchNotification,
    sendTestEmailNotification,
    sendTestDingTalkNotification,
    notifyDeploymentStart,
    notifyDeploymentSuccess,
    notifyDeploymentFailure,
    notifyDeploymentCancelled,
    notifyServerOffline,
    notifyServiceDown,
    notifySystemError
};

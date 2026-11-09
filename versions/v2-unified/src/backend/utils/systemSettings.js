const database = require('../config/database');

const DEFAULT_SYSTEM_SETTINGS = {
    system_name: '自动化部署系统',
    system_description: '企业级自动化部署管理平台',
    admin_email: 'admin@example.com',
    timezone: 'Asia/Shanghai',
    max_concurrent_deployments: 5,
    deployment_timeout: 1800,
    auto_cleanup_logs: true,
    log_retention_days: 30,
    session_timeout: 1440,
    max_login_attempts: 5,
    login_lock_minutes: 15,
    password_min_length: 8,
    require_password_change: false,
    email_notifications: false,
    deployment_notifications: true,
    error_notifications: true,
    database_backup_enabled: false,
    database_backup_interval: 24,
    database_backup_retention: 7
};

function parseDbValue(raw) {
    if (raw === null || raw === undefined) {
        return raw;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        return raw;
    }
}

function toInt(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

function toBoolean(value, fallback) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 'true' || value === '1' || value === 1) {
        return true;
    }
    if (value === 'false' || value === '0' || value === 0) {
        return false;
    }
    return fallback;
}

function normalizeSettings(settings) {
    return {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...settings,
        max_concurrent_deployments: toInt(
            settings.max_concurrent_deployments,
            DEFAULT_SYSTEM_SETTINGS.max_concurrent_deployments,
            1,
            100
        ),
        deployment_timeout: toInt(
            settings.deployment_timeout,
            DEFAULT_SYSTEM_SETTINGS.deployment_timeout,
            60,
            86400
        ),
        auto_cleanup_logs: toBoolean(
            settings.auto_cleanup_logs,
            DEFAULT_SYSTEM_SETTINGS.auto_cleanup_logs
        ),
        log_retention_days: toInt(
            settings.log_retention_days,
            DEFAULT_SYSTEM_SETTINGS.log_retention_days,
            1,
            3650
        ),
        session_timeout: toInt(
            settings.session_timeout,
            DEFAULT_SYSTEM_SETTINGS.session_timeout,
            30,
            10080
        ),
        max_login_attempts: toInt(
            settings.max_login_attempts,
            DEFAULT_SYSTEM_SETTINGS.max_login_attempts,
            3,
            20
        ),
        login_lock_minutes: toInt(
            settings.login_lock_minutes,
            DEFAULT_SYSTEM_SETTINGS.login_lock_minutes,
            1,
            1440
        ),
        password_min_length: toInt(
            settings.password_min_length,
            DEFAULT_SYSTEM_SETTINGS.password_min_length,
            6,
            64
        ),
        require_password_change: toBoolean(
            settings.require_password_change,
            DEFAULT_SYSTEM_SETTINGS.require_password_change
        ),
        database_backup_enabled: toBoolean(
            settings.database_backup_enabled,
            DEFAULT_SYSTEM_SETTINGS.database_backup_enabled
        ),
        database_backup_interval: toInt(
            settings.database_backup_interval,
            DEFAULT_SYSTEM_SETTINGS.database_backup_interval,
            1,
            720
        ),
        database_backup_retention: toInt(
            settings.database_backup_retention,
            DEFAULT_SYSTEM_SETTINGS.database_backup_retention,
            1,
            3650
        )
    };
}

async function getSystemSettings() {
    const rows = await database.all('SELECT key, value FROM system_settings');
    if (!rows || rows.length === 0) {
        return { ...DEFAULT_SYSTEM_SETTINGS };
    }

    const loaded = {};
    for (const row of rows) {
        loaded[row.key] = parseDbValue(row.value);
    }

    return normalizeSettings(loaded);
}

async function saveSystemSettings(settings) {
    const normalized = normalizeSettings(settings || {});
    await database.withDeferredSave(async () => {
        for (const [key, value] of Object.entries(normalized)) {
            await database.run(
                'INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [key, JSON.stringify(value)]
            );
        }
    });
    return normalized;
}

module.exports = {
    DEFAULT_SYSTEM_SETTINGS,
    getSystemSettings,
    saveSystemSettings
};

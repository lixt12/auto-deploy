const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-jwt-secret-1234567890';

const {
    MASKED_SECRET_PLACEHOLDER,
    sanitizeNotificationSettingsForResponse
} = require('../src/backend/utils/notificationService');

test('sanitizeNotificationSettingsForResponse should mask secret fields', () => {
    const sanitized = sanitizeNotificationSettingsForResponse({
        email_smtp_password: 'smtp-password',
        webhook_secret: 'webhook-secret',
        dingtalk_secret: 'dingtalk-secret'
    });

    assert.equal(sanitized.email_smtp_password, MASKED_SECRET_PLACEHOLDER);
    assert.equal(sanitized.webhook_secret, MASKED_SECRET_PLACEHOLDER);
    assert.equal(sanitized.dingtalk_secret, MASKED_SECRET_PLACEHOLDER);
    assert.equal(sanitized.email_smtp_password_configured, true);
    assert.equal(sanitized.webhook_secret_configured, true);
    assert.equal(sanitized.dingtalk_secret_configured, true);
});

test('sanitizeNotificationSettingsForResponse should keep empty secrets as empty', () => {
    const sanitized = sanitizeNotificationSettingsForResponse({
        email_smtp_password: '',
        webhook_secret: '',
        dingtalk_secret: ''
    });

    assert.equal(sanitized.email_smtp_password, '');
    assert.equal(sanitized.webhook_secret, '');
    assert.equal(sanitized.dingtalk_secret, '');
    assert.equal(sanitized.email_smtp_password_configured, false);
    assert.equal(sanitized.webhook_secret_configured, false);
    assert.equal(sanitized.dingtalk_secret_configured, false);
});

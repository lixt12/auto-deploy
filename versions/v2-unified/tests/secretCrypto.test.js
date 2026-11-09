const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-jwt-secret-1234567890';

const { ENCRYPTION_PREFIX, encryptSecret, decryptSecret } = require('../src/backend/utils/secretCrypto');

test('encryptSecret/decryptSecret should round-trip plaintext', () => {
    const plain = 'S3cureP@ssw0rd!';
    const encrypted = encryptSecret(plain);
    assert.ok(typeof encrypted === 'string');
    assert.ok(encrypted.startsWith(ENCRYPTION_PREFIX));
    assert.notEqual(encrypted, plain);
    assert.equal(decryptSecret(encrypted), plain);
});

test('decryptSecret should keep legacy plaintext values compatible', () => {
    assert.equal(decryptSecret('legacy-plain-password'), 'legacy-plain-password');
    assert.equal(decryptSecret(null), null);
});

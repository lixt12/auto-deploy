const crypto = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1:';
const AES_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function buildKeyMaterial() {
    const raw = String(process.env.SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || '').trim();
    if (!raw) {
        throw new Error('SECRET_ENCRYPTION_KEY (or JWT_SECRET) is required for credential encryption');
    }

    if (/^[a-f0-9]{64}$/i.test(raw)) {
        return Buffer.from(raw, 'hex');
    }

    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 43) {
        try {
            const base64 = Buffer.from(raw, 'base64');
            if (base64.length >= 32) {
                return base64.slice(0, 32);
            }
        } catch (error) {
            // Fallback to deterministic hash below.
        }
    }

    return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

const ENCRYPTION_KEY = buildKeyMaterial();

function isEncryptedValue(value) {
    return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

function encryptSecret(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const plainText = String(value).trim();
    if (!plainText) {
        return null;
    }

    if (isEncryptedValue(plainText)) {
        return plainText;
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${ENCRYPTION_PREFIX}${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();
    if (!text) {
        return null;
    }

    if (!isEncryptedValue(text)) {
        return text;
    }

    const payload = text.slice(ENCRYPTION_PREFIX.length);
    const [ivRaw, tagRaw, cipherRaw] = payload.split('.');
    if (!ivRaw || !tagRaw || !cipherRaw) {
        throw new Error('Invalid encrypted secret payload format');
    }

    const iv = Buffer.from(ivRaw, 'base64url');
    const authTag = Buffer.from(tagRaw, 'base64url');
    const encrypted = Buffer.from(cipherRaw, 'base64url');

    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH || encrypted.length === 0) {
        throw new Error('Invalid encrypted secret payload');
    }

    const decipher = crypto.createDecipheriv(AES_ALGO, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
}

module.exports = {
    ENCRYPTION_PREFIX,
    isEncryptedValue,
    encryptSecret,
    decryptSecret
};

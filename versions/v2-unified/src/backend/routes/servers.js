const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const database = require('../config/database');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');
const { notifyServerOffline, notifyServiceDown } = require('../utils/notificationService');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');

const router = express.Router();
const SERVICE_MANAGER_TYPES = new Set(['systemd', 'docker', 'custom']);
const SERVICE_ACTIONS = new Set(['check', 'start', 'stop', 'restart']);

function isTruthy(value) {
    if (value === true || value === 1) {
        return true;
    }
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function normalizeOptionalText(value) {
    if (value === undefined || value === null) {
        return null;
    }
    const normalized = String(value).trim();
    return normalized ? normalized : null;
}

function normalizePort(value, fallback = 22) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

function normalizeManagerType(value, fallback = 'systemd') {
    const normalized = String(value || '').trim().toLowerCase();
    if (SERVICE_MANAGER_TYPES.has(normalized)) {
        return normalized;
    }
    return fallback;
}

function toIntBoolean(value, fallback = 0) {
    if (value === undefined || value === null) {
        return fallback ? 1 : 0;
    }
    return isTruthy(value) ? 1 : 0;
}

function escapeShellArg(value) {
    const text = String(value ?? '');
    return `'${text.replace(/'/g, `'\\''`)}'`;
}

function parseDateToMs(value) {
    if (!value) {
        return 0;
    }

    const text = String(value).trim();
    if (!text) {
        return 0;
    }

    const normalized = text.includes('T') ? text : text.replace(' ', 'T');
    const candidates = [normalized, `${normalized}Z`, text];
    for (const item of candidates) {
        const ms = Date.parse(item);
        if (Number.isFinite(ms)) {
            return ms;
        }
    }
    return 0;
}

function isConnectivityRelatedError(input) {
    const text = String(input || '').trim().toLowerCase();
    if (!text) {
        return false;
    }

    const patterns = [
        /ssh connection failed/,
        /target connection error/,
        /bastion connection error/,
        /bastion tunnel failed/,
        /bastion tunnel stream error/,
        /connection lost before handshake/,
        /all configured authentication methods failed/,
        /connection timed out/,
        /\btimed out\b/,
        /connection refused/,
        /connect econnrefused/,
        /read econnreset/,
        /socket hang up/,
        /host not found/,
        /host unreachable/,
        /network is unreachable/,
        /no route to host/,
        /channel open failure/,
        /handshake/,
        /unable to authenticate/
    ];
    return patterns.some(pattern => pattern.test(text));
}

const validateServer = [
    body('name').notEmpty().withMessage('Server name is required'),
    body('host').notEmpty().withMessage('Host is required'),
    body('port')
        .optional({ nullable: true })
        .isInt({ min: 1, max: 65535 })
        .withMessage('Port must be between 1 and 65535'),
    body('username').notEmpty().withMessage('Username is required'),
    body('bastion_enabled')
        .optional({ nullable: true })
        .isBoolean()
        .withMessage('bastion_enabled must be a boolean'),
    body('bastion_port')
        .optional({ nullable: true })
        .isInt({ min: 1, max: 65535 })
        .withMessage('bastion_port must be between 1 and 65535'),
    body().custom((_, { req }) => {
        if (!isTruthy(req.body.bastion_enabled)) {
            return true;
        }

        if (!normalizeOptionalText(req.body.bastion_host)) {
            throw new Error('bastion_host is required when bastion_enabled is true');
        }
        if (!normalizeOptionalText(req.body.bastion_username)) {
            throw new Error('bastion_username is required when bastion_enabled is true');
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

const validateImportServers = [
    body('servers').isArray({ min: 1, max: 1000 }).withMessage('servers must be an array with 1-1000 items'),
    body('overwrite_existing').optional().isBoolean().withMessage('overwrite_existing must be a boolean'),
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

const validateServerService = [
    body('name')
        .optional()
        .isString()
        .isLength({ min: 1, max: 200 })
        .withMessage('Service name is required and must be 1-200 characters'),
    body('manager_type')
        .optional()
        .isString()
        .custom((value) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!SERVICE_MANAGER_TYPES.has(normalized)) {
                throw new Error(`manager_type must be one of: ${Array.from(SERVICE_MANAGER_TYPES).join(', ')}`);
            }
            return true;
        }),
    body('check_command').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('start_command').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('stop_command').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('restart_command').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body('monitor_enabled').optional().isBoolean(),
    body('auto_restart').optional().isBoolean(),
    body('notify_on_down').optional().isBoolean(),
    body().custom((_, { req }) => {
        const managerType = String(req.body?.manager_type || 'systemd').trim().toLowerCase();
        if (managerType !== 'custom') {
            return true;
        }

        const checkCommand = normalizeOptionalText(req.body?.check_command);
        if (!checkCommand) {
            throw new Error('check_command is required when manager_type=custom');
        }

        const hasActionCommand = [
            normalizeOptionalText(req.body?.start_command),
            normalizeOptionalText(req.body?.stop_command),
            normalizeOptionalText(req.body?.restart_command)
        ].some(Boolean);
        if (!hasActionCommand) {
            throw new Error('At least one of start_command/stop_command/restart_command is required when manager_type=custom');
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

const validateServiceAction = [
    body('action')
        .notEmpty()
        .withMessage('action is required')
        .custom((value) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!SERVICE_ACTIONS.has(normalized)) {
                throw new Error(`action must be one of: ${Array.from(SERVICE_ACTIONS).join(', ')}`);
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

async function logOperation(operation, serverName, serverId, message, userId = null) {
    try {
        await database.run(
            `INSERT INTO system_logs (level, category, operation, target_type, target_name, target_id, message, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['INFO', 'SERVER', operation, 'Server', serverName, serverId, message, userId]
        );
    } catch (error) {
        logger.error('Failed to write server operation log:', error);
    }
}

function maskServerSecret(server) {
    return {
        ...server,
        password: server.password ? '******' : null,
        private_key_path: server.private_key_path || null,
        bastion_password: server.bastion_password ? '******' : null,
        has_password: Boolean(server.password),
        has_bastion_password: Boolean(server.bastion_password)
    };
}

function decryptSecretSafe(value) {
    try {
        return decryptSecret(value);
    } catch (error) {
        throw new Error(`Failed to decrypt credential: ${error.message}`);
    }
}

function withDecryptedServerSecrets(server) {
    if (!server || typeof server !== 'object') {
        return server;
    }

    return {
        ...server,
        password: decryptSecretSafe(server.password),
        bastion_password: decryptSecretSafe(server.bastion_password)
    };
}

function withEncryptedServerSecrets(server) {
    if (!server || typeof server !== 'object') {
        return server;
    }

    return {
        ...server,
        password: encryptSecret(server.password),
        bastion_password: encryptSecret(server.bastion_password)
    };
}

function mapSSHError(error) {
    if (!error) {
        return 'SSH连接失败';
    }

    if (error.level === 'client-authentication') {
        return 'SSH认证失败：用户名/密码/私钥无效';
    }

    switch (error.code) {
        case 'ENOTFOUND':
            return 'SSH连接失败：主机不存在';
        case 'ECONNREFUSED':
            return 'SSH连接失败：连接被拒绝';
        case 'EHOSTUNREACH':
            return 'SSH连接失败：主机不可达';
        case 'ETIMEDOUT':
            return 'SSH连接失败：连接超时';
        default:
            break;
    }

    const rawMessage = String(error.message || '').trim();
    if (!rawMessage) {
        return 'SSH连接失败：未知错误';
    }

    const normalized = rawMessage.toLowerCase();
    if (normalized.includes('connection lost before handshake')) {
        return 'SSH连接失败：握手前连接已断开';
    }
    if (normalized.includes('all configured authentication methods failed')) {
        return 'SSH认证失败：所有认证方式均失败';
    }
    if (normalized.includes('handshake') && normalized.includes('timeout')) {
        return 'SSH连接失败：握手超时';
    }
    if (normalized.includes('timed out')) {
        return 'SSH连接失败：连接超时';
    }
    if (normalized.includes('permission denied')) {
        return 'SSH认证失败：权限不足';
    }
    if (normalized.includes('unable to parse private key')) {
        return 'SSH私钥解析失败';
    }
    if (normalized.includes('no supported authentication methods')) {
        return 'SSH认证失败：无可用认证方式';
    }

    return `SSH连接失败：${rawMessage}`;
}

function resolvePrivateKeyPath(privateKeyPath) {
    if (!privateKeyPath) {
        return null;
    }

    return path.isAbsolute(privateKeyPath)
        ? privateKeyPath
        : path.resolve(process.cwd(), privateKeyPath);
}

function getConfiguredAuthMethod(password, privateKeyPath) {
    return normalizeOptionalText(privateKeyPath) ? 'private_key' : (normalizeOptionalText(password) ? 'password' : 'none');
}

function getConnectionMode(server) {
    return isTruthy(server?.bastion_enabled) ? 'bastion' : 'direct';
}

function normalizeBastionConfig(input, existingServer = null) {
    const hasToggle = input.bastion_enabled !== undefined;
    const enabled = hasToggle
        ? isTruthy(input.bastion_enabled)
        : isTruthy(existingServer?.bastion_enabled);

    const fallbackHost = normalizeOptionalText(existingServer?.bastion_host);
    const fallbackPort = normalizePort(existingServer?.bastion_port, 22);
    const fallbackUsername = normalizeOptionalText(existingServer?.bastion_username);
    const fallbackPassword = normalizeOptionalText(existingServer?.bastion_password);
    const fallbackPrivateKeyPath = normalizeOptionalText(existingServer?.bastion_private_key_path);

    let host = input.bastion_host !== undefined
        ? normalizeOptionalText(input.bastion_host)
        : fallbackHost;
    let port = input.bastion_port !== undefined
        ? normalizePort(input.bastion_port, 22)
        : fallbackPort;
    let username = input.bastion_username !== undefined
        ? normalizeOptionalText(input.bastion_username)
        : fallbackUsername;
    let password = fallbackPassword;
    if (input.bastion_password !== undefined) {
        password = input.bastion_password === '******'
            ? fallbackPassword
            : normalizeOptionalText(input.bastion_password);
    }
    let privateKeyPath = input.bastion_private_key_path !== undefined
        ? normalizeOptionalText(input.bastion_private_key_path)
        : fallbackPrivateKeyPath;

    if (!enabled) {
        host = null;
        port = 22;
        username = null;
        password = null;
        privateKeyPath = null;
    }

    return {
        enabled: enabled ? 1 : 0,
        host,
        port,
        username,
        password,
        privateKeyPath
    };
}

function normalizeImportedServerRecord(input, existingServer = null) {
    if (!input || typeof input !== 'object') {
        throw new Error('Invalid server item');
    }

    const name = normalizeOptionalText(input.name);
    const host = normalizeOptionalText(input.host);
    const username = normalizeOptionalText(input.username);
    const fallbackPort = normalizePort(existingServer?.port, 22);
    const port = normalizePort(input.port, fallbackPort);

    if (!name) {
        throw new Error('Server name is required');
    }
    if (!host) {
        throw new Error('Server host is required');
    }
    if (!username) {
        throw new Error('Server username is required');
    }

    const description = Object.prototype.hasOwnProperty.call(input, 'description')
        ? normalizeOptionalText(input.description)
        : normalizeOptionalText(existingServer?.description);

    const privateKeyPath = Object.prototype.hasOwnProperty.call(input, 'private_key_path')
        ? normalizeOptionalText(input.private_key_path)
        : normalizeOptionalText(existingServer?.private_key_path);

    let password = normalizeOptionalText(existingServer?.password);
    if (Object.prototype.hasOwnProperty.call(input, 'password')) {
        password = input.password === '******'
            ? normalizeOptionalText(existingServer?.password)
            : normalizeOptionalText(input.password);
    }

    const bastionConfig = normalizeBastionConfig({
        bastion_enabled: input.bastion_enabled,
        bastion_host: input.bastion_host,
        bastion_port: input.bastion_port,
        bastion_username: input.bastion_username,
        bastion_password: input.bastion_password,
        bastion_private_key_path: input.bastion_private_key_path
    }, existingServer);

    return {
        name,
        host,
        port,
        username,
        password,
        privateKeyPath,
        description,
        bastionConfig
    };
}

async function testSSHConnection(server) {
    const startTime = Date.now();
    const testTimeoutMs = Number(process.env.SSH_TEST_TIMEOUT_MS || 10000);
    const targetAuthMethod = getConfiguredAuthMethod(server.password, server.private_key_path);
    const bastionAuthMethod = getConfiguredAuthMethod(server.bastion_password, server.bastion_private_key_path);
    const connectionMode = getConnectionMode(server);

    try {
        const sshResult = await createSSHClient(server, testTimeoutMs);
        try {
            sshResult.client.end();
        } catch (closeError) {
            // Ignore close errors after test.
        }

        return {
            success: true,
            message: 'SSH connection successful',
            authMethod: sshResult.authMethod,
            responseTime: Date.now() - startTime,
            connectionMode
        };
    } catch (error) {
        return {
            success: false,
            message: error.message || 'SSH connection failed',
            authMethod: connectionMode === 'bastion'
                ? `${targetAuthMethod} via bastion(${bastionAuthMethod})`
                : targetAuthMethod,
            responseTime: Date.now() - startTime,
            connectionMode
        };
    }
}

async function testBastionConnection(server) {
    const startTime = Date.now();
    if (getConnectionMode(server) !== 'bastion') {
        return {
            success: false,
            message: 'Bastion is not enabled for this server',
            authMethod: 'none',
            responseTime: Date.now() - startTime
        };
    }

    const bastionProbeServer = {
        host: normalizeOptionalText(server.bastion_host),
        port: normalizePort(server.bastion_port, 22),
        username: normalizeOptionalText(server.bastion_username),
        password: server.bastion_password,
        private_key_path: server.bastion_private_key_path,
        bastion_enabled: false
    };

    try {
        const sshResult = await createSSHClient(bastionProbeServer, Number(process.env.SSH_TEST_TIMEOUT_MS || 10000));
        try {
            sshResult.client.end();
        } catch (closeError) {
            // Ignore close errors after test.
        }

        return {
            success: true,
            message: 'Bastion SSH connection successful',
            authMethod: sshResult.authMethod,
            responseTime: Date.now() - startTime
        };
    } catch (error) {
        return {
            success: false,
            message: error.message || 'Bastion SSH connection failed',
            authMethod: getConfiguredAuthMethod(server.bastion_password, server.bastion_private_key_path),
            responseTime: Date.now() - startTime
        };
    }
}

function toNumberOrNull(value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function toFixedNumber(value, digits = 1) {
    if (!Number.isFinite(value)) {
        return null;
    }
    return Number.parseFloat(Number(value).toFixed(digits));
}

function safePercent(value, total) {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
        return null;
    }
    return toFixedNumber((value / total) * 100, 1);
}

function formatSecondsToHuman(seconds) {
    const total = Math.max(Number.parseInt(String(seconds), 10) || 0, 0);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    const parts = [];
    if (days > 0) {
        parts.push(`${days}d`);
    }
    if (hours > 0 || days > 0) {
        parts.push(`${hours}h`);
    }
    parts.push(`${minutes}m`);
    return parts.join(' ');
}

function buildSSHAuthInfo(password, privateKeyPath, authTargetLabel = 'SSH target') {
    const hasPassword = Boolean(password && String(password).trim());
    const hasPrivateKey = Boolean(privateKeyPath && String(privateKeyPath).trim());

    if (!hasPassword && !hasPrivateKey) {
        return {
            ok: false,
            error: `${authTargetLabel} has no password or private key configured`
        };
    }

    let privateKeyContent = null;
    if (hasPrivateKey) {
        try {
            const keyPath = resolvePrivateKeyPath(String(privateKeyPath).trim());
            privateKeyContent = fs.readFileSync(keyPath, 'utf8');
        } catch (error) {
            return {
                ok: false,
                error: `${authTargetLabel} private key read failed: ${error.message}`
            };
        }
    }

    return {
        ok: true,
        hasPassword,
        hasPrivateKey,
        privateKeyContent,
        authMethod: hasPrivateKey ? 'private_key' : 'password'
    };
}

function createSSHClient(server, timeoutMs = 12000) {
    const resolvedServer = withDecryptedServerSecrets(server);
    const useBastion = getConnectionMode(resolvedServer) === 'bastion';
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const targetPort = normalizePort(resolvedServer.port, 22);
        const targetAuthInfo = buildSSHAuthInfo(resolvedServer.password, resolvedServer.private_key_path, 'Target server SSH');
        if (!targetAuthInfo.ok) {
            reject(new Error(targetAuthInfo.error));
            return;
        }

        if (!useBastion) {
            const client = new Client();
            let settled = false;

            const finishError = (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                try {
                    client.end();
                } catch (closeError) {
                    // Ignore close errors after connect failure.
                }
                reject(error);
            };

            client.on('ready', () => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve({
                    client,
                    authMethod: targetAuthInfo.authMethod,
                    connectTimeMs: Date.now() - startedAt,
                    connectionMode: 'direct'
                });
            });

            client.on('error', (error) => {
                finishError(new Error(mapSSHError(error)));
            });

            client.on('timeout', () => {
                finishError(new Error('SSH connection failed: connection timed out'));
            });

            try {
                const connectConfig = {
                    host: resolvedServer.host,
                    port: targetPort,
                    username: resolvedServer.username,
                    readyTimeout: timeoutMs,
                    keepaliveInterval: 3000
                };

                if (targetAuthInfo.hasPrivateKey) {
                    connectConfig.privateKey = targetAuthInfo.privateKeyContent;
                    if (targetAuthInfo.hasPassword) {
                        connectConfig.passphrase = resolvedServer.password;
                    }
                } else {
                    connectConfig.password = resolvedServer.password;
                }

                client.connect(connectConfig);
            } catch (error) {
                finishError(new Error(mapSSHError(error)));
            }
            return;
        }

        const bastionHost = normalizeOptionalText(resolvedServer.bastion_host);
        const bastionUsername = normalizeOptionalText(resolvedServer.bastion_username);
        if (!bastionHost || !bastionUsername) {
            reject(new Error('Bastion host and username are required when bastion is enabled'));
            return;
        }

        const bastionPort = normalizePort(resolvedServer.bastion_port, 22);
        const bastionAuthInfo = buildSSHAuthInfo(
            resolvedServer.bastion_password,
            resolvedServer.bastion_private_key_path,
            'Bastion SSH'
        );
        if (!bastionAuthInfo.ok) {
            reject(new Error(bastionAuthInfo.error));
            return;
        }

        const bastionClient = new Client();
        const targetClient = new Client();
        let settled = false;
        let tunnelStream = null;

        const closeAll = () => {
            if (tunnelStream && !tunnelStream.destroyed) {
                try {
                    tunnelStream.end();
                } catch (streamEndError) {
                    // Ignore stream close errors.
                }
                try {
                    tunnelStream.destroy();
                } catch (streamDestroyError) {
                    // Ignore stream destroy errors.
                }
            }
            try {
                targetClient.end();
            } catch (targetCloseError) {
                // Ignore target close errors.
            }
            try {
                bastionClient.end();
            } catch (bastionCloseError) {
                // Ignore bastion close errors.
            }
        };

        const finishError = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            closeAll();
            reject(error);
        };

        const finishSuccess = () => {
            if (settled) {
                return;
            }
            settled = true;

            const originalEnd = targetClient.end.bind(targetClient);
            targetClient.end = (...args) => {
                let result;
                try {
                    result = originalEnd(...args);
                } catch (error) {
                    result = undefined;
                }

                if (tunnelStream && !tunnelStream.destroyed) {
                    try {
                        tunnelStream.end();
                    } catch (streamEndError) {
                        // Ignore stream close errors.
                    }
                }
                try {
                    bastionClient.end();
                } catch (bastionCloseError) {
                    // Ignore bastion close errors.
                }
                return result;
            };

            resolve({
                client: targetClient,
                authMethod: `${targetAuthInfo.authMethod} via bastion(${bastionAuthInfo.authMethod})`,
                connectTimeMs: Date.now() - startedAt,
                connectionMode: 'bastion'
            });
        };

        bastionClient.on('ready', () => {
            bastionClient.forwardOut(
                '127.0.0.1',
                0,
                resolvedServer.host,
                targetPort,
                (forwardError, stream) => {
                    if (forwardError) {
                        finishError(new Error(`Bastion tunnel failed: ${forwardError.message || forwardError}`));
                        return;
                    }

                    tunnelStream = stream;
                    stream.on('close', () => {
                        if (!settled) {
                            finishError(new Error('SSH connection failed: bastion tunnel closed unexpectedly'));
                        }
                    });
                    stream.on('error', (error) => {
                        if (!settled) {
                            finishError(new Error(`Bastion tunnel stream error: ${error.message || error}`));
                        }
                    });

                    targetClient.on('ready', finishSuccess);
                    targetClient.on('error', (error) => {
                        finishError(new Error(`Target connection error: ${mapSSHError(error)}`));
                    });
                    targetClient.on('timeout', () => {
                        finishError(new Error('SSH connection failed: target connection timed out'));
                    });
                    targetClient.on('close', () => {
                        if (!settled) {
                            finishError(new Error('SSH connection failed: target connection closed unexpectedly'));
                        }
                    });

                    try {
                        const targetConfig = {
                            sock: stream,
                            username: resolvedServer.username,
                            readyTimeout: timeoutMs,
                            keepaliveInterval: 3000
                        };

                        if (targetAuthInfo.hasPrivateKey) {
                            targetConfig.privateKey = targetAuthInfo.privateKeyContent;
                            if (targetAuthInfo.hasPassword) {
                                targetConfig.passphrase = resolvedServer.password;
                            }
                        } else {
                            targetConfig.password = resolvedServer.password;
                        }

                        targetClient.connect(targetConfig);
                    } catch (error) {
                        finishError(new Error(`Target connection error: ${mapSSHError(error)}`));
                    }
                }
            );
        });

        bastionClient.on('error', (error) => {
            finishError(new Error(`Bastion connection error: ${mapSSHError(error)}`));
        });
        bastionClient.on('timeout', () => {
            finishError(new Error('SSH connection failed: bastion connection timed out'));
        });
        bastionClient.on('close', () => {
            if (!settled) {
                finishError(new Error('SSH connection failed: bastion connection closed unexpectedly'));
            }
        });

        try {
            const bastionConfig = {
                host: bastionHost,
                port: bastionPort,
                username: bastionUsername,
                readyTimeout: timeoutMs,
                keepaliveInterval: 3000
            };

            if (bastionAuthInfo.hasPrivateKey) {
                bastionConfig.privateKey = bastionAuthInfo.privateKeyContent;
                if (bastionAuthInfo.hasPassword) {
                    bastionConfig.passphrase = resolvedServer.bastion_password;
                }
            } else {
                bastionConfig.password = resolvedServer.bastion_password;
            }

            bastionClient.connect(bastionConfig);
        } catch (error) {
            finishError(new Error(`Bastion connection error: ${mapSSHError(error)}`));
        }
    });
}

function runSSHCommand(client, command, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        client.exec(command, (error, stream) => {
            if (error) {
                reject(error);
                return;
            }

            const timeout = setTimeout(() => {
                try {
                    stream.close();
                } catch (closeError) {
                    // Ignore close error.
                }
                reject(new Error(`Command timeout (${timeoutMs}ms): ${command}`));
            }, timeoutMs);

            stream.on('close', (code) => {
                clearTimeout(timeout);
                resolve({
                    code: Number.isFinite(code) ? Number(code) : null,
                    stdout: String(stdout || '').replace(/\r/g, '').trim(),
                    stderr: String(stderr || '').replace(/\r/g, '').trim(),
                    command
                });
            });

            stream.on('data', (data) => {
                stdout += data.toString('utf8');
            });

            stream.stderr.on('data', (data) => {
                stderr += data.toString('utf8');
            });
        });
    });
}

async function runFirstCommand(client, commands, timeoutMs = 9000) {
    for (const command of commands) {
        try {
            const result = await runSSHCommand(client, command, timeoutMs);
            if (result.stdout || result.stderr || result.code === 0) {
                return result;
            }
        } catch (error) {
            // Try next fallback command.
        }
    }

    return {
        code: null,
        stdout: '',
        stderr: '',
        command: commands[0] || ''
    };
}

function buildServiceCommands(service) {
    const managerType = normalizeManagerType(service.manager_type, 'systemd');
    const serviceName = String(service.name || '').trim();
    const escapedName = escapeShellArg(serviceName);

    const defaultCommands = managerType === 'systemd'
        ? {
            check: `systemctl is-active ${escapedName} || true`,
            start: `systemctl start ${escapedName}`,
            stop: `systemctl stop ${escapedName}`,
            restart: `systemctl restart ${escapedName}`
        }
        : managerType === 'docker'
            ? {
                check: `sh -lc "(docker inspect -f '{{if .State.Running}}running{{else}}stopped{{end}}' ${escapedName} 2>/dev/null || sudo -n docker inspect -f '{{if .State.Running}}running{{else}}stopped{{end}}' ${escapedName} 2>/dev/null || echo not_found)"`,
                start: `sh -lc "(docker start ${escapedName} || sudo -n docker start ${escapedName})"`,
                stop: `sh -lc "(docker stop ${escapedName} || sudo -n docker stop ${escapedName})"`,
                restart: `sh -lc "(docker restart ${escapedName} || sudo -n docker restart ${escapedName})"`
            }
        : {
            check: null,
            start: null,
            stop: null,
            restart: null
        };

    return {
        managerType,
        check: normalizeOptionalText(service.check_command) || defaultCommands.check,
        start: normalizeOptionalText(service.start_command) || defaultCommands.start,
        stop: normalizeOptionalText(service.stop_command) || defaultCommands.stop,
        restart: normalizeOptionalText(service.restart_command) || defaultCommands.restart
    };
}

function parseServiceStatus(service, result) {
    const managerType = normalizeManagerType(service.manager_type, 'systemd');
    const stdout = String(result?.stdout || '').trim();
    const stderr = String(result?.stderr || '').trim();
    const output = `${stdout}\n${stderr}`.trim().toLowerCase();
    const token = output.split(/\s+/).find(Boolean) || '';
    const code = Number.isFinite(result?.code) ? Number(result.code) : null;

    if (managerType === 'systemd') {
        if (token === 'active') {
            return 'RUNNING';
        }
        if (token === 'inactive' || token === 'failed' || token === 'deactivating') {
            return 'STOPPED';
        }
        if (/\binactive|failed|dead|stopped|not[-\s]?found|unknown\b/i.test(output)) {
            return 'STOPPED';
        }
        if (/\bactive\b/i.test(output) || /\brunning\b/i.test(output)) {
            return 'RUNNING';
        }
        if (code === 0) {
            return 'RUNNING';
        }
        if (code !== null) {
            return 'STOPPED';
        }
        return 'UNKNOWN';
    }

    if (managerType === 'docker') {
        if (/\brunning\b|\btrue\b|\bup\b/i.test(output)) {
            return 'RUNNING';
        }
        if (/\bstopped\b|\bfalse\b|\bexited\b|\bdead\b|\bcreated\b|not[_\s-]?found|no such object/i.test(output)) {
            return 'STOPPED';
        }
        if (code === 0) {
            return 'RUNNING';
        }
        if (code !== null) {
            return 'STOPPED';
        }
        return output ? 'STOPPED' : 'UNKNOWN';
    }

    if (code === 0) {
        return 'RUNNING';
    }
    if (code !== null) {
        return 'STOPPED';
    }
    return output ? 'STOPPED' : 'UNKNOWN';
}

function getServiceDownNotifyCooldownMs() {
    return Math.max(
        Number.parseInt(String(process.env.SERVICE_DOWN_NOTIFY_COOLDOWN_MS || 600000), 10) || 600000,
        30000
    );
}

function shouldNotifyServiceDown(service) {
    if (!isTruthy(service.notify_on_down)) {
        return false;
    }

    const cooldownMs = getServiceDownNotifyCooldownMs();
    const lastNotifyMs = parseDateToMs(service.last_notify_at);
    if (lastNotifyMs > 0 && Date.now() - lastNotifyMs < cooldownMs) {
        return false;
    }
    return true;
}

function normalizeServiceDownReason(reason, maxLength = 240) {
    const text = String(reason || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) {
        return 'Service is not running';
    }
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildServiceDownNotificationItem(service, server, reason, trigger, status = null) {
    return {
        serviceId: Number(service.id),
        serviceName: service.name,
        serverId: Number(server.id),
        serverName: server.name,
        host: server.host,
        port: server.port,
        status: status || service.status || 'UNKNOWN',
        reason: normalizeServiceDownReason(reason),
        checkedBy: trigger
    };
}

async function maybeNotifyServiceDown(service, server, reason, actorName = 'system') {
    if (!shouldNotifyServiceDown(service)) {
        return false;
    }

    try {
        const result = await notifyServiceDown({
            serverId: Number(server.id),
            serverName: server.name,
            host: server.host,
            port: server.port,
            serviceId: Number(service.id),
            serviceName: service.name,
            reason: normalizeServiceDownReason(reason),
            checkedBy: actorName
        });
        return result?.success !== false;
    } catch (error) {
        logger.error(`Failed to send service-down notification (service=${service.id}):`, error);
        return false;
    }
}

async function loadManagedService(serverId, serviceId) {
    return database.get(
        `SELECT *
         FROM server_services
         WHERE id = ? AND server_id = ?`,
        [serviceId, serverId]
    );
}

async function runServiceActionWithClient(client, service, action) {
    const commands = buildServiceCommands(service);
    const normalizedAction = String(action || 'check').trim().toLowerCase();
    const timeoutMs = Math.max(
        Number.parseInt(String(process.env.SERVICE_COMMAND_TIMEOUT_MS || 12000), 10) || 12000,
        2000
    );

    let actionResult = null;
    if (normalizedAction !== 'check') {
        const command = commands[normalizedAction];
        if (!command) {
            throw new Error(`Service action command is not configured: ${normalizedAction}`);
        }
        actionResult = await runSSHCommand(client, command, timeoutMs);
    }

    if (!commands.check) {
        throw new Error('Service check command is not configured');
    }
    const checkResult = await runSSHCommand(client, commands.check, timeoutMs);
    const status = parseServiceStatus(service, checkResult);

    return {
        action: normalizedAction,
        commands,
        actionResult,
        checkResult,
        status
    };
}

async function discoverRunningServicesWithClient(client, limit = 200) {
    const normalizedLimit = Math.min(
        Math.max(Number.parseInt(String(limit), 10) || 200, 1),
        500
    );
    const timeoutMs = Math.max(
        Number.parseInt(String(process.env.SERVICE_DISCOVER_TIMEOUT_MS || 15000), 10) || 15000,
        5000
    );

    const systemdCommand = `sh -lc "if command -v systemctl >/dev/null 2>&1; then systemctl list-units --type=service --state=running --no-pager --no-legend --plain 2>/dev/null; fi"`;
    const dockerCommand = `sh -lc "if command -v docker >/dev/null 2>&1; then if docker ps --format '{{json .}}' >/dev/null 2>&1; then docker ps --format '{{json .}}' 2>/dev/null; elif command -v sudo >/dev/null 2>&1 && sudo -n docker ps --format '{{json .}}' >/dev/null 2>&1; then sudo -n docker ps --format '{{json .}}' 2>/dev/null; fi; elif command -v sudo >/dev/null 2>&1 && sudo -n docker ps --format '{{json .}}' >/dev/null 2>&1; then sudo -n docker ps --format '{{json .}}' 2>/dev/null; fi"`;

    const systemdResult = await runSSHCommand(client, systemdCommand, timeoutMs);
    const dockerResult = await runSSHCommand(client, dockerCommand, timeoutMs);

    const systemdLines = String(systemdResult.stdout || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    const services = [];
    const seen = new Set();
    for (const line of systemdLines) {
        const unitName = line.split(/\s+/)[0] || '';
        if (!unitName || !unitName.endsWith('.service')) {
            continue;
        }

        const serviceName = unitName.replace(/\.service$/i, '');
        const dedupeKey = unitName.toLowerCase();
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);

        services.push({
            unit_name: unitName,
            service_name: serviceName,
            display_name: serviceName && serviceName !== unitName
                ? `${unitName} (${serviceName})`
                : unitName,
            manager_type: 'systemd'
        });

        if (services.length >= normalizedLimit) {
            break;
        }
    }

    if (services.length < normalizedLimit) {
        const dockerLines = String(dockerResult.stdout || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        for (const line of dockerLines) {
            let parsed = null;
            try {
                parsed = JSON.parse(line);
            } catch (error) {
                continue;
            }

            const containerName = String(parsed?.Names || '').trim();
            if (!containerName) {
                continue;
            }
            const image = String(parsed?.Image || '').trim();
            const containerId = String(parsed?.ID || '').trim();
            const runtimeStatus = String(parsed?.Status || '').trim();

            const dedupeKey = containerName.toLowerCase();
            if (seen.has(dedupeKey)) {
                continue;
            }
            seen.add(dedupeKey);

            services.push({
                unit_name: containerName,
                service_name: image || containerId || containerName,
                display_name: image
                    ? `${containerName} (${image})`
                    : containerName,
                manager_type: 'docker',
                runtime_status: runtimeStatus || undefined
            });

            if (services.length >= normalizedLimit) {
                break;
            }
        }
    }

    return {
        command: `${systemdCommand}; ${dockerCommand}`,
        commands: {
            systemd: systemdCommand,
            docker: dockerCommand
        },
        stdout: [String(systemdResult.stdout || ''), String(dockerResult.stdout || '')].filter(Boolean).join('\n'),
        stderr: [String(systemdResult.stderr || ''), String(dockerResult.stderr || '')].filter(Boolean).join('\n'),
        exitCode: dockerResult.code ?? systemdResult.code,
        services
    };
}

async function runManagedServiceMonitorJob(options = {}) {
    const trigger = String(options.trigger || 'scheduler');
    const actorUserId = Number.isInteger(Number(options.actorUserId)) ? Number(options.actorUserId) : null;
    const serverId = Number.isInteger(Number(options.serverId)) && Number(options.serverId) > 0
        ? Number(options.serverId)
        : null;

    const monitorRows = serverId
        ? await database.all(
            `SELECT
                ss.id AS service_id,
                ss.server_id AS service_server_id,
                ss.name AS service_name,
                ss.manager_type AS service_manager_type,
                ss.check_command AS service_check_command,
                ss.start_command AS service_start_command,
                ss.stop_command AS service_stop_command,
                ss.restart_command AS service_restart_command,
                ss.monitor_enabled AS service_monitor_enabled,
                ss.auto_restart AS service_auto_restart,
                ss.notify_on_down AS service_notify_on_down,
                ss.status AS service_status,
                ss.last_notify_at AS service_last_notify_at,
                s.id AS server_id,
                s.name AS server_name,
                s.host AS server_host,
                s.port AS server_port,
                s.username AS server_username,
                s.password AS server_password,
                s.private_key_path AS server_private_key_path,
                s.bastion_enabled AS server_bastion_enabled,
                s.bastion_host AS server_bastion_host,
                s.bastion_port AS server_bastion_port,
                s.bastion_username AS server_bastion_username,
                s.bastion_password AS server_bastion_password,
                s.bastion_private_key_path AS server_bastion_private_key_path
             FROM server_services ss
             JOIN servers s ON s.id = ss.server_id
             WHERE ss.monitor_enabled = 1 AND ss.server_id = ?
             ORDER BY ss.id ASC`,
            [serverId]
        )
        : await database.all(
            `SELECT
                ss.id AS service_id,
                ss.server_id AS service_server_id,
                ss.name AS service_name,
                ss.manager_type AS service_manager_type,
                ss.check_command AS service_check_command,
                ss.start_command AS service_start_command,
                ss.stop_command AS service_stop_command,
                ss.restart_command AS service_restart_command,
                ss.monitor_enabled AS service_monitor_enabled,
                ss.auto_restart AS service_auto_restart,
                ss.notify_on_down AS service_notify_on_down,
                ss.status AS service_status,
                ss.last_notify_at AS service_last_notify_at,
                s.id AS server_id,
                s.name AS server_name,
                s.host AS server_host,
                s.port AS server_port,
                s.username AS server_username,
                s.password AS server_password,
                s.private_key_path AS server_private_key_path,
                s.bastion_enabled AS server_bastion_enabled,
                s.bastion_host AS server_bastion_host,
                s.bastion_port AS server_bastion_port,
                s.bastion_username AS server_bastion_username,
                s.bastion_password AS server_bastion_password,
                s.bastion_private_key_path AS server_bastion_private_key_path
             FROM server_services ss
             JOIN servers s ON s.id = ss.server_id
             WHERE ss.monitor_enabled = 1
             ORDER BY ss.id ASC`
        );

    const summary = {
        trigger,
        total: monitorRows.length,
        running: 0,
        down: 0,
        error: 0,
        connectivityError: 0,
        autoRestarted: 0,
        notified: 0,
        changed: 0,
        failures: []
    };
    const pendingServiceDownNotifications = [];
    const pendingNotifyServiceIds = new Set();

    const processMonitorRow = async (row) => {
        const service = {
            id: row.service_id,
            server_id: row.service_server_id,
            name: row.service_name,
            manager_type: row.service_manager_type,
            check_command: row.service_check_command,
            start_command: row.service_start_command,
            stop_command: row.service_stop_command,
            restart_command: row.service_restart_command,
            monitor_enabled: row.service_monitor_enabled,
            auto_restart: row.service_auto_restart,
            notify_on_down: row.service_notify_on_down,
            status: row.service_status,
            last_notify_at: row.service_last_notify_at
        };
        const server = {
            id: row.server_id,
            name: row.server_name,
            host: row.server_host,
            port: row.server_port,
            username: row.server_username,
            password: row.server_password,
            private_key_path: row.server_private_key_path,
            bastion_enabled: row.server_bastion_enabled,
            bastion_host: row.server_bastion_host,
            bastion_port: row.server_bastion_port,
            bastion_username: row.server_bastion_username,
            bastion_password: row.server_bastion_password,
            bastion_private_key_path: row.server_bastion_private_key_path
        };

        let sshClient;
        try {
            const sshResult = await createSSHClient(server, Number(process.env.SSH_TEST_TIMEOUT_MS || 12000));
            sshClient = sshResult.client;

            const result = await runServiceActionWithClient(sshClient, service, 'check');
            let finalStatus = result.status;
            let errorText = finalStatus === 'RUNNING'
                ? null
                : `Service status: ${finalStatus} (${result.checkResult.stdout || result.checkResult.stderr || '-'})`;
            let autoRestarted = false;

            if (finalStatus !== 'RUNNING' && isTruthy(service.auto_restart)) {
                try {
                    const restartResult = await runServiceActionWithClient(sshClient, service, 'restart');
                    finalStatus = restartResult.status;
                    autoRestarted = finalStatus === 'RUNNING';
                    errorText = autoRestarted
                        ? null
                        : `Auto restart failed: ${restartResult.checkResult.stdout || restartResult.checkResult.stderr || '-'}`;
                    if (autoRestarted) {
                        summary.autoRestarted += 1;
                        await logOperation(
                            'SERVICE_AUTO_RESTART',
                            server.name,
                            server.id,
                            `Service ${service.name} auto restarted by ${trigger}`,
                            actorUserId
                        );
                    }
                } catch (restartError) {
                    errorText = `Auto restart error: ${restartError.message || restartError}`;
                }
            }

            let lastNotifyAt = service.last_notify_at || null;
            if (finalStatus === 'RUNNING') {
                lastNotifyAt = null;
                summary.running += 1;
            } else {
                summary.down += 1;
                if (shouldNotifyServiceDown(service)) {
                    pendingServiceDownNotifications.push(
                        buildServiceDownNotificationItem(
                            service,
                            server,
                            errorText || 'Service is not running',
                            trigger,
                            finalStatus
                        )
                    );
                    pendingNotifyServiceIds.add(Number(service.id));
                }
            }

            if (String(service.status || 'UNKNOWN') !== finalStatus) {
                summary.changed += 1;
                await logOperation(
                    'SERVICE_STATUS_CHANGE',
                    server.name,
                    server.id,
                    `Service ${service.name} status changed: ${service.status || 'UNKNOWN'} -> ${finalStatus}`,
                    actorUserId
                );
            }

            await database.run(
                `UPDATE server_services
                 SET status = ?, last_check_at = CURRENT_TIMESTAMP, last_error = ?, last_notify_at = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [finalStatus, errorText, lastNotifyAt, service.id]
            );
        } catch (error) {
            const errorText = error.message || String(error);
            const connectivityError = isConnectivityRelatedError(errorText);
            summary.error += 1;
            if (connectivityError) {
                summary.connectivityError += 1;
            }
            summary.failures.push({
                service_id: service.id,
                service_name: service.name,
                server_id: service.server_id,
                server_name: server.name,
                error: errorText,
                error_type: connectivityError ? 'CONNECTIVITY' : 'EXECUTION'
            });

            let lastNotifyAt = service.last_notify_at || null;
            if (!connectivityError && shouldNotifyServiceDown(service)) {
                pendingServiceDownNotifications.push(
                    buildServiceDownNotificationItem(
                        service,
                        server,
                        errorText,
                        trigger,
                        'ERROR'
                    )
                );
                pendingNotifyServiceIds.add(Number(service.id));
            }

            const keepStatus = String(service.status || '').trim().toUpperCase();
            const nextStatus = connectivityError
                ? (keepStatus || 'UNKNOWN')
                : 'ERROR';

            await database.run(
                `UPDATE server_services
                 SET status = ?, last_check_at = CURRENT_TIMESTAMP, last_error = ?, last_notify_at = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [nextStatus, errorText, lastNotifyAt, service.id]
            );
        } finally {
            if (sshClient) {
                try {
                    sshClient.end();
                } catch (closeError) {
                    // Ignore close error.
                }
            }
        }
    };

    const monitorConcurrency = toIntInRange(process.env.SERVICE_MONITOR_CONCURRENCY, 6, 1, 32);
    await database.withDeferredSave(async () => {
        for (let i = 0; i < monitorRows.length; i += monitorConcurrency) {
            const chunk = monitorRows.slice(i, i + monitorConcurrency);
            await Promise.all(chunk.map(row => processMonitorRow(row)));
        }

        if (pendingServiceDownNotifications.length > 0 && pendingNotifyServiceIds.size > 0) {
            try {
                const notifyResult = await notifyServiceDown({
                    trigger,
                    checkedBy: trigger,
                    issueCount: pendingServiceDownNotifications.length,
                    services: pendingServiceDownNotifications
                });

                if (notifyResult?.success !== false) {
                    const notifiedAt = new Date().toISOString();
                    for (const serviceId of pendingNotifyServiceIds) {
                        await database.run(
                            `UPDATE server_services
                             SET last_notify_at = ?, updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [notifiedAt, serviceId]
                        );
                    }
                    summary.notified += pendingNotifyServiceIds.size;
                }
            } catch (error) {
                logger.error('Failed to send batched service-down notification:', error);
            }
        }
    });

    return summary;
}

function parseCpuMetrics(raw) {
    const text = String(raw || '');

    // Linux top output: "... 95.0 id ..."
    const idleMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*id\b/i);
    if (idleMatch) {
        const idle = toNumberOrNull(idleMatch[1]);
        const usage = idle === null ? null : toFixedNumber(100 - idle, 1);
        return {
            usagePercent: usage,
            idlePercent: idle
        };
    }

    // Linux vmstat fallback: last column is idle.
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length >= 2 && /vmstat/i.test(text)) {
        const last = lines[lines.length - 1].split(/\s+/);
        if (last.length >= 15) {
            const idle = toNumberOrNull(last[14]);
            return {
                usagePercent: idle === null ? null : toFixedNumber(100 - idle, 1),
                idlePercent: idle
            };
        }
    }

    // Windows fallback: LoadPercentage=12
    const winMatch = text.match(/LoadPercentage\s*=\s*([0-9]+)/i);
    if (winMatch) {
        const usage = toNumberOrNull(winMatch[1]);
        return {
            usagePercent: usage,
            idlePercent: usage === null ? null : toFixedNumber(100 - usage, 1)
        };
    }

    return {
        usagePercent: null,
        idlePercent: null
    };
}

function splitCommandTokens(commandLine) {
    const tokens = String(commandLine || '')
        .match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) || [];
    return tokens.map(token => token.replace(/^['"]|['"]$/g, ''));
}

function basenameOfExecutable(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    return path.basename(text.replace(/^['"]|['"]$/g, ''));
}

function deriveServiceNameFromProcess(processName, commandLine) {
    const normalizedProcess = String(processName || '').trim();
    const normalizedCommand = String(commandLine || '').trim();

    const springMatch = normalizedCommand.match(/(?:-D|--)spring\.application\.name=([A-Za-z0-9._-]+)/i);
    if (springMatch) {
        return springMatch[1];
    }

    const jarMatch = normalizedCommand.match(/(?:^|\s)-jar\s+("?)([^"\s]+\.jar)\1/i);
    if (jarMatch) {
        return path.basename(jarMatch[2]).replace(/\.jar$/i, '');
    }

    const unitMatch = normalizedCommand.match(/([A-Za-z0-9@._-]+\.service)\b/i);
    if (unitMatch) {
        return unitMatch[1];
    }

    const tokens = splitCommandTokens(normalizedCommand);
    const executable = basenameOfExecutable(tokens[0] || normalizedProcess);
    const processLower = normalizedProcess.toLowerCase();
    const executableLower = executable.toLowerCase();

    if (executableLower === 'java' || executableLower === 'java.exe' || processLower === 'java') {
        let skipNext = false;
        for (let index = 1; index < tokens.length; index += 1) {
            const token = tokens[index];
            if (!token) {
                continue;
            }
            if (skipNext) {
                skipNext = false;
                continue;
            }
            if (token === '-jar') {
                skipNext = true;
                continue;
            }
            if (token === '-cp' || token === '-classpath' || token === '--class-path' || token === '--module-path' || token === '-p') {
                skipNext = true;
                continue;
            }
            if (token.startsWith('-')) {
                continue;
            }
            if (/^[A-Za-z_][\w$]*(?:\.[\w$]+)+$/.test(token)) {
                const parts = token.split('.');
                return parts[parts.length - 1];
            }
            break;
        }
    }

    if (executable && /^(node(?:\.exe)?|python(?:3(?:\.exe)?)?|bash|sh)$/i.test(executable)) {
        const script = basenameOfExecutable(tokens[1] || '');
        if (script) {
            return script.replace(/\.(js|mjs|cjs|py|sh)$/i, '');
        }
    }

    if (executable && executableLower !== processLower) {
        return executable;
    }

    return normalizedProcess || executable || '-';
}

function parseWindowsCpuProcessRanking(raw) {
    const text = String(raw || '');
    if (!text || text.indexOf('=') < 0) {
        return [];
    }

    const chunks = text
        .split(/\n\s*\n/)
        .map(chunk => chunk.trim())
        .filter(Boolean);

    const rows = [];
    for (const chunk of chunks) {
        const kv = {};
        for (const line of chunk.split('\n')) {
            const row = line.trim();
            const idx = row.indexOf('=');
            if (idx <= 0) {
                continue;
            }
            const key = row.slice(0, idx).trim().toLowerCase();
            const value = row.slice(idx + 1).trim();
            kv[key] = value;
        }

        const name = kv.name || '';
        const pid = toNumberOrNull(kv.idprocess);
        const cpuPercent = toNumberOrNull(kv.percentprocessortime);
        if (!name || pid === null || cpuPercent === null) {
            continue;
        }
        if (name.toLowerCase() === 'idle' || name.toLowerCase() === '_total') {
            continue;
        }

        rows.push({
            pid,
            name,
            cpuPercent,
            memoryPercent: null,
            user: null,
            commandLine: null,
            serviceName: deriveServiceNameFromProcess(name, '')
        });
    }

    return rows;
}

function parseLinuxCpuProcessRanking(raw) {
    const lines = String(raw || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return [];
    }

    const rows = [];
    for (const line of lines) {
        if (/^(pid|user)\b/i.test(line)) {
            continue;
        }

        // ps -eo pid=,user=,pcpu=,pmem=,comm=,args=
        const compactPsMatch = line.match(/^(\d+)\s+(\S+)\s+(-?[0-9]+(?:\.[0-9]+)?)\s+(-?[0-9]+(?:\.[0-9]+)?)\s+(\S+)\s*(.*)$/);
        if (compactPsMatch) {
            const pid = Number(compactPsMatch[1]);
            const user = compactPsMatch[2];
            const cpuPercent = toNumberOrNull(compactPsMatch[3]);
            const memoryPercent = toNumberOrNull(compactPsMatch[4]);
            const name = compactPsMatch[5] || '-';
            const commandLine = compactPsMatch[6] ? compactPsMatch[6].trim() : null;
            if (cpuPercent !== null) {
                rows.push({
                    pid,
                    name,
                    cpuPercent,
                    memoryPercent,
                    user,
                    commandLine,
                    serviceName: deriveServiceNameFromProcess(name, commandLine)
                });
            }
            continue;
        }

        const fields = line.split(/\s+/);
        if (fields.length >= 3 && /^\d+$/.test(fields[0]) && /^-?[0-9]+(?:\.[0-9]+)?$/.test(fields[2])) {
            const pid = Number(fields[0]);
            const cpuPercent = toNumberOrNull(fields[2]);
            const memoryPercent = fields.length >= 4 ? toNumberOrNull(fields[3]) : null;
            const name = fields[1] || '-';
            if (cpuPercent !== null) {
                rows.push({
                    pid,
                    name,
                    cpuPercent,
                    memoryPercent,
                    user: null,
                    commandLine: null,
                    serviceName: deriveServiceNameFromProcess(name, '')
                });
            }
            continue;
        }

        if (fields.length >= 11 && /^\d+$/.test(fields[1]) && /^-?[0-9]+(?:\.[0-9]+)?$/.test(fields[2])) {
            const user = fields[0];
            const pid = Number(fields[1]);
            const cpuPercent = toNumberOrNull(fields[2]);
            const memoryPercent = toNumberOrNull(fields[3]);
            const commandLine = fields.slice(10).join(' ') || null;
            const executable = basenameOfExecutable(fields[10] || '');
            const name = executable || fields[0] || '-';
            if (cpuPercent !== null) {
                rows.push({
                    pid,
                    name,
                    cpuPercent,
                    memoryPercent,
                    user,
                    commandLine,
                    serviceName: deriveServiceNameFromProcess(name, commandLine)
                });
            }
        }
    }

    return rows;
}

function parseCpuProcessRanking(raw, limit = 10) {
    const windowsRows = parseWindowsCpuProcessRanking(raw);
    const sourceRows = windowsRows.length > 0 ? windowsRows : parseLinuxCpuProcessRanking(raw);
    const sortedRows = sourceRows
        .sort((a, b) => {
            if (b.cpuPercent !== a.cpuPercent) {
                return b.cpuPercent - a.cpuPercent;
            }
            return a.pid - b.pid;
        });

    const dedupedRows = [];
    const seenPid = new Set();
    for (const item of sortedRows) {
        if (seenPid.has(item.pid)) {
            continue;
        }
        seenPid.add(item.pid);
        dedupedRows.push(item);
    }

    return dedupedRows
        .slice(0, Math.max(1, limit))
        .map((item, index) => ({
            rank: index + 1,
            pid: item.pid,
            name: item.name,
            cpuPercent: item.cpuPercent,
            memoryPercent: item.memoryPercent,
            user: item.user || null,
            commandLine: item.commandLine || null,
            serviceName: item.serviceName || null
        }));
}

function parseMemoryMetrics(raw) {
    const text = String(raw || '');

    // Linux free -m
    const memLine = text.match(/^Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+(\d+)/mi);
    if (memLine) {
        const totalMB = toNumberOrNull(memLine[1]);
        const usedMB = toNumberOrNull(memLine[2]);
        const freeMB = toNumberOrNull(memLine[3]);
        const availableMB = toNumberOrNull(memLine[4]);
        return {
            totalMB,
            usedMB,
            freeMB,
            availableMB,
            usagePercent: safePercent(usedMB, totalMB)
        };
    }

    // Linux /proc/meminfo
    const totalKb = text.match(/MemTotal:\s+(\d+)\s+kB/i);
    const availableKb = text.match(/MemAvailable:\s+(\d+)\s+kB/i);
    if (totalKb && availableKb) {
        const totalMB = toFixedNumber(Number(totalKb[1]) / 1024, 0);
        const availableMB = toFixedNumber(Number(availableKb[1]) / 1024, 0);
        const usedMB = (totalMB !== null && availableMB !== null) ? totalMB - availableMB : null;
        return {
            totalMB,
            usedMB,
            freeMB: null,
            availableMB,
            usagePercent: safePercent(usedMB, totalMB)
        };
    }

    // Windows wmic output is in KB.
    const winTotalKb = text.match(/TotalVisibleMemorySize\s*=\s*(\d+)/i);
    const winFreeKb = text.match(/FreePhysicalMemory\s*=\s*(\d+)/i);
    if (winTotalKb && winFreeKb) {
        const totalMB = toFixedNumber(Number(winTotalKb[1]) / 1024, 0);
        const freeMB = toFixedNumber(Number(winFreeKb[1]) / 1024, 0);
        const usedMB = (totalMB !== null && freeMB !== null) ? totalMB - freeMB : null;
        return {
            totalMB,
            usedMB,
            freeMB,
            availableMB: freeMB,
            usagePercent: safePercent(usedMB, totalMB)
        };
    }

    return {
        totalMB: null,
        usedMB: null,
        freeMB: null,
        availableMB: null,
        usagePercent: null
    };
}

function isLikelyVirtualFilesystem(filesystem, mount) {
    const fs = String(filesystem || '').toLowerCase();
    const mountPath = String(mount || '').toLowerCase();

    if (
        fs.startsWith('tmpfs')
        || fs.startsWith('devtmpfs')
        || fs.startsWith('overlay')
        || fs.startsWith('squashfs')
        || fs.startsWith('proc')
        || fs.startsWith('sysfs')
        || fs.startsWith('cgroup')
        || fs.startsWith('mqueue')
        || fs === 'none'
        || fs === 'udev'
    ) {
        return true;
    }

    return mountPath.startsWith('/proc')
        || mountPath.startsWith('/sys')
        || mountPath.startsWith('/run')
        || mountPath.startsWith('/dev');
}

function classifyDiskKind(filesystem, mount) {
    const mountPath = String(mount || '');
    const fs = String(filesystem || '');

    if (
        mountPath === '/'
        || /^\/boot(\/|$)/i.test(mountPath)
        || /^\/system(\/|$)/i.test(mountPath)
        || /^C:$/i.test(fs)
        || /^C:$/i.test(mountPath)
    ) {
        return 'system';
    }

    return 'data';
}

function summarizeDisks(disks) {
    const safeDisks = Array.isArray(disks) ? disks : [];
    const systemDiskCount = safeDisks.filter(item => item.kind === 'system').length;
    const dataDiskCount = safeDisks.length - systemDiskCount;

    return {
        count: safeDisks.length,
        systemDiskCount,
        dataDiskCount,
        disks: safeDisks
    };
}

function parseDiskMetrics(raw) {
    const text = String(raw || '');
    const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    const linuxDisks = lines
        .filter(line => !/^filesystem/i.test(line) && !/^size/i.test(line))
        .map(line => line.split(/\s+/))
        .filter(fields => fields.length >= 6 && /%$/.test(fields[4]))
        .map(fields => {
            const filesystem = fields[0];
            const mount = fields[5];
            const kind = classifyDiskKind(filesystem, mount);
            return {
                filesystem,
                size: fields[1],
                used: fields[2],
                available: fields[3],
                usePercent: fields[4],
                mount,
                kind
            };
        })
        .filter(item => !isLikelyVirtualFilesystem(item.filesystem, item.mount));

    if (linuxDisks.length > 0) {
        return summarizeDisks(linuxDisks);
    }

    // Windows wmic /format:list output fallback.
    const chunks = text
        .split(/\n\s*\n/)
        .map(chunk => chunk.trim())
        .filter(Boolean);

    const winDisksFromList = [];
    for (const chunk of chunks) {
        const rows = chunk.split('\n').map(line => line.trim()).filter(Boolean);
        const kv = {};
        for (const row of rows) {
            const idx = row.indexOf('=');
            if (idx <= 0) {
                continue;
            }
            const key = row.slice(0, idx).trim().toLowerCase();
            const value = row.slice(idx + 1).trim();
            kv[key] = value;
        }

        const device = kv.deviceid;
        const size = Number(kv.size || 0);
        const free = Number(kv.freespace || 0);
        if (!device || !Number.isFinite(size) || size <= 0 || !Number.isFinite(free)) {
            continue;
        }

        const used = size - free;
        const percent = size > 0 ? toFixedNumber((used / size) * 100, 1) : null;
        const toGB = (bytes) => `${toFixedNumber(bytes / (1024 ** 3), 1)}G`;
        const kind = /^C:$/i.test(device) ? 'system' : 'data';

        winDisksFromList.push({
            filesystem: device,
            size: toGB(size),
            used: toGB(used),
            available: toGB(free),
            usePercent: percent === null ? null : `${percent}%`,
            mount: device,
            kind
        });
    }

    if (winDisksFromList.length > 0) {
        return summarizeDisks(winDisksFromList);
    }

    return summarizeDisks([]);
}

function parseLoadMetrics(raw) {
    const text = String(raw || '');

    const procMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/);
    if (procMatch) {
        return {
            one: toNumberOrNull(procMatch[1]),
            five: toNumberOrNull(procMatch[2]),
            fifteen: toNumberOrNull(procMatch[3])
        };
    }

    const uptimeMatch = text.match(/load average[s]?:\s*([0-9]+(?:\.[0-9]+)?)[,\s]+([0-9]+(?:\.[0-9]+)?)[,\s]+([0-9]+(?:\.[0-9]+)?)/i);
    if (uptimeMatch) {
        return {
            one: toNumberOrNull(uptimeMatch[1]),
            five: toNumberOrNull(uptimeMatch[2]),
            fifteen: toNumberOrNull(uptimeMatch[3])
        };
    }

    return {
        one: null,
        five: null,
        fifteen: null
    };
}

function parseUptimeMetrics(raw) {
    const text = String(raw || '').trim();
    if (!text) {
        return {
            human: null
        };
    }

    if (/^up\s+/i.test(text)) {
        return {
            human: text
        };
    }

    const secMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)/);
    if (secMatch) {
        return {
            human: formatSecondsToHuman(secMatch[1])
        };
    }

    return {
        human: text
    };
}

async function collectServerPerformance(client) {
    const [cpuRaw, cpuTopRaw, memoryRaw, diskRaw, loadRaw, uptimeRaw, osRaw, hostnameRaw] = await Promise.all([
        runFirstCommand(client, ['LANG=C top -bn1 | head -n 5', 'vmstat 1 2', 'wmic cpu get loadpercentage /value']),
        runFirstCommand(client, [
            'LANG=C ps -ww -eo pid=,user=,pcpu=,pmem=,comm=,args= --sort=-pcpu | head -n 10',
            'LANG=C ps auxww --sort=-%cpu | head -n 11',
            'LANG=C ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 11',
            'wmic path Win32_PerfFormattedData_PerfProc_Process get Name,IDProcess,PercentProcessorTime /format:list'
        ]),
        runFirstCommand(client, ['free -m', 'cat /proc/meminfo', 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value']),
        runFirstCommand(client, ['df -hP', 'df -h', 'wmic logicaldisk where "DriveType=3" get DeviceID,Size,FreeSpace /format:list']),
        runFirstCommand(client, ['cat /proc/loadavg', 'uptime']),
        runFirstCommand(client, ['uptime -p', 'cat /proc/uptime', 'uptime', 'wmic os get lastbootuptime /value']),
        runFirstCommand(client, ['uname -srmo', 'ver']),
        runFirstCommand(client, ['hostname'])
    ]);

    const cpuText = cpuRaw.stdout || cpuRaw.stderr;
    const cpuTopText = cpuTopRaw.stdout || cpuTopRaw.stderr;

    return {
        cpu: {
            ...parseCpuMetrics(cpuText),
            processRanking: parseCpuProcessRanking(cpuTopText, 10),
            raw: cpuText || null,
            topRaw: cpuTopText || null
        },
        memory: {
            ...parseMemoryMetrics(memoryRaw.stdout || memoryRaw.stderr),
            raw: memoryRaw.stdout || memoryRaw.stderr || null
        },
        disk: {
            ...parseDiskMetrics(diskRaw.stdout || diskRaw.stderr),
            raw: diskRaw.stdout || diskRaw.stderr || null
        },
        load: {
            ...parseLoadMetrics(loadRaw.stdout || loadRaw.stderr),
            raw: loadRaw.stdout || loadRaw.stderr || null
        },
        uptime: {
            ...parseUptimeMetrics(uptimeRaw.stdout || uptimeRaw.stderr),
            raw: uptimeRaw.stdout || uptimeRaw.stderr || null
        },
        os: {
            name: (osRaw.stdout || osRaw.stderr || '').split('\n')[0] || null,
            hostname: (hostnameRaw.stdout || hostnameRaw.stderr || '').split('\n')[0] || null
        }
    };
}

function normalizeHistoryOccurredAt(input) {
    if (!input) {
        return null;
    }

    const text = String(input).trim();
    if (!text) {
        return null;
    }

    if (/^\d{9,}$/.test(text)) {
        const epoch = Number(text);
        if (Number.isFinite(epoch) && epoch > 0) {
            return new Date(epoch * 1000).toISOString();
        }
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }

    return text;
}

function parseSyslogTimestamp(input) {
    const text = String(input || '').trim();
    if (!text) {
        return null;
    }

    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) {
        return direct.toISOString();
    }

    const syslogMatch = text.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})$/);
    if (syslogMatch) {
        const month = syslogMatch[1];
        const day = syslogMatch[2].padStart(2, '0');
        const hhmmss = syslogMatch[3];
        const year = new Date().getFullYear();
        const rebuilt = new Date(`${month} ${day} ${year} ${hhmmss}`);
        if (!Number.isNaN(rebuilt.getTime())) {
            return rebuilt.toISOString();
        }
    }

    return null;
}

function normalizeAuditdTimestamp(input) {
    const text = String(input || '').trim();
    if (!text) {
        return null;
    }

    if (/^\d+(?:\.\d+)?$/.test(text)) {
        const seconds = Number(text);
        if (Number.isFinite(seconds) && seconds > 0) {
            return new Date(Math.floor(seconds * 1000)).toISOString();
        }
    }

    const mdYMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
    if (mdYMatch) {
        const month = mdYMatch[1];
        const day = mdYMatch[2];
        const year = mdYMatch[3];
        const time = mdYMatch[4];
        const millis = mdYMatch[5] ? `.${mdYMatch[5].slice(0, 3).padEnd(3, '0')}` : '';
        const rebuilt = new Date(`${year}-${month}-${day}T${time}${millis}`);
        if (!Number.isNaN(rebuilt.getTime())) {
            return rebuilt.toISOString();
        }
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }

    return null;
}

function maskSensitiveCommand(command) {
    const text = String(command || '').trim();
    if (!text) {
        return '';
    }

    return text
        .replace(/(--password(?:=|\s+))\S+/ig, '$1***')
        .replace(/(-p(?:=|\s+))\S+/ig, '$1***')
        .replace(/(password(?:=|\s+))\S+/ig, '$1***')
        .replace(/(token(?:=|\s+))\S+/ig, '$1***')
        .replace(/(secret(?:=|\s+))\S+/ig, '$1***');
}

function parseServerOperationHistory(raw, defaultUser, limit = 80) {
    const lines = String(raw || '')
        .split('\n')
        .map(line => line.replace(/\r/g, ''))
        .filter(line => line.trim());

    if (lines.length === 0) {
        return [];
    }

    let source = 'history';
    let pendingOccurredAt = null;
    const items = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (line.startsWith('__SOURCE__:')) {
            source = line.slice('__SOURCE__:'.length).trim() || 'history';
            pendingOccurredAt = null;
            continue;
        }

        const zshMatch = line.match(/^:\s*(\d{9,})\s*:\s*\d+\s*;(.*)$/);
        if (zshMatch) {
            const command = maskSensitiveCommand(zshMatch[2]);
            if (command) {
                items.push({
                    operation: 'SERVER_COMMAND_HISTORY',
                    eventType: 'command_history',
                    source,
                    user: defaultUser || null,
                    occurredAt: normalizeHistoryOccurredAt(zshMatch[1]),
                    command,
                    summary: command
                });
            }
            pendingOccurredAt = null;
            continue;
        }

        const bashTimestamp = line.match(/^#(\d{9,})$/);
        if (bashTimestamp) {
            pendingOccurredAt = normalizeHistoryOccurredAt(bashTimestamp[1]);
            continue;
        }

        const histTimeMatch = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.*)$/);
        if (histTimeMatch) {
            const command = maskSensitiveCommand(histTimeMatch[2]);
            if (command) {
                items.push({
                    operation: 'SERVER_COMMAND_HISTORY',
                    eventType: 'command_history',
                    source,
                    user: defaultUser || null,
                    occurredAt: normalizeHistoryOccurredAt(histTimeMatch[1]),
                    command,
                    summary: command
                });
            }
            pendingOccurredAt = null;
            continue;
        }

        const withIndexMatch = line.match(/^\d+\s+(.*)$/);
        const normalizedCommand = maskSensitiveCommand(withIndexMatch ? withIndexMatch[1] : line);
        if (!normalizedCommand || normalizedCommand === 'history') {
            pendingOccurredAt = null;
            continue;
        }

        items.push({
            operation: 'SERVER_COMMAND_HISTORY',
            eventType: 'command_history',
            source,
            user: defaultUser || null,
            occurredAt: pendingOccurredAt,
            command: normalizedCommand,
            summary: normalizedCommand
        });
        pendingOccurredAt = null;
    }

    const deduped = [];
    const seen = new Set();
    for (const item of items) {
        const command = String(item.command || '').trim();
        if (!command) {
            continue;
        }

        const dedupeKey = `${item.occurredAt || '-'}|${command}`;
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);

        deduped.push({
            operation: item.operation || 'SERVER_COMMAND_HISTORY',
            eventType: item.eventType || 'command_history',
            source: item.source || 'history',
            user: item.user || null,
            occurredAt: item.occurredAt || null,
            command: command.slice(0, 2000),
            summary: String(item.summary || command).slice(0, 500),
            rawLine: item.rawLine ? String(item.rawLine).slice(0, 2000) : null
        });
    }

    return deduped.slice(-Math.max(1, limit));
}

function parseServerSecurityAuditLine(line, source, defaultUser) {
    const normalized = String(line || '').replace(/\r/g, '').trim();
    if (!normalized) {
        return null;
    }

    let occurredAt = null;
    let body = normalized;
    let host = null;

    const isoMatch = normalized.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(\S+)\s+(.*)$/);
    if (isoMatch) {
        occurredAt = normalizeHistoryOccurredAt(isoMatch[1]);
        host = isoMatch[2];
        body = isoMatch[3];
    } else {
        const syslogMatch = normalized.match(/^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(.*)$/);
        if (syslogMatch) {
            occurredAt = parseSyslogTimestamp(syslogMatch[1]);
            host = syslogMatch[2];
            body = syslogMatch[3];
        }
    }

    const lower = body.toLowerCase();
    const isRelevant = lower.includes('sudo')
        || lower.includes('sshd')
        || lower.includes('authentication failure')
        || lower.includes('pam_unix')
        || /\bsu(\[|:)/i.test(body);
    if (!isRelevant) {
        return null;
    }

    const sudoCommandMatch = body.match(/sudo(?:\[\d+\])?:\s*([^:]+)\s*:.*\bCOMMAND=(.+)$/i);
    if (sudoCommandMatch) {
        const actor = normalizeOptionalText(sudoCommandMatch[1]);
        const command = maskSensitiveCommand(sudoCommandMatch[2]);
        if (!command) {
            return null;
        }
        return {
            operation: 'SERVER_SUDO_COMMAND',
            eventType: 'sudo_command',
            source,
            user: actor || defaultUser || null,
            occurredAt: occurredAt || null,
            command,
            summary: `sudo command: ${command}`,
            rawLine: normalized,
            host: host || null
        };
    }

    const acceptedMatch = body.match(/sshd(?:\[\d+\])?:\s+Accepted\s+\S+\s+for\s+([A-Za-z0-9._-]+)/i);
    if (acceptedMatch) {
        const actor = normalizeOptionalText(acceptedMatch[1]);
        return {
            operation: 'SERVER_AUTH_EVENT',
            eventType: 'ssh_login_success',
            source,
            user: actor || defaultUser || null,
            occurredAt: occurredAt || null,
            command: null,
            summary: body.slice(0, 500),
            rawLine: normalized,
            host: host || null
        };
    }

    if (/sshd(?:\[\d+\])?:\s+Failed password/i.test(body) || /authentication failure/i.test(lower) || /invalid user/i.test(lower)) {
        const failedUserMatch = body.match(/for(?: invalid user)?\s+([A-Za-z0-9._-]+)/i);
        const actor = normalizeOptionalText(failedUserMatch ? failedUserMatch[1] : null);
        return {
            operation: 'SERVER_AUTH_EVENT',
            eventType: 'ssh_login_failed',
            source,
            user: actor || defaultUser || null,
            occurredAt: occurredAt || null,
            command: null,
            summary: body.slice(0, 500),
            rawLine: normalized,
            host: host || null
        };
    }

    if (/session opened/i.test(lower) || /session closed/i.test(lower)) {
        return {
            operation: 'SERVER_AUTH_EVENT',
            eventType: /opened/i.test(lower) ? 'session_opened' : 'session_closed',
            source,
            user: defaultUser || null,
            occurredAt: occurredAt || null,
            command: null,
            summary: body.slice(0, 500),
            rawLine: normalized,
            host: host || null
        };
    }

    return {
        operation: 'SERVER_AUTH_EVENT',
        eventType: 'security_event',
        source,
        user: defaultUser || null,
        occurredAt: occurredAt || null,
        command: null,
        summary: body.slice(0, 500),
        rawLine: normalized,
        host: host || null
    };
}

function extractAuditBodyField(body, key) {
    const text = String(body || '');
    if (!text) {
        return null;
    }

    const quoted = text.match(new RegExp(`\\b${key}=(\"([^\"]*)\"|'([^']*)')`, 'i'));
    if (quoted) {
        return (quoted[2] || quoted[3] || '').trim() || null;
    }

    const simple = text.match(new RegExp(`\\b${key}=([^\\s]+)`, 'i'));
    if (simple) {
        return String(simple[1] || '').trim() || null;
    }

    return null;
}

function parseAuditdExecCommand(body) {
    const matches = Array.from(String(body || '').matchAll(/\ba(\d+)=("([^"]*)"|'([^']*)'|([^\s]+))/gi));
    if (matches.length === 0) {
        return null;
    }

    const parts = matches
        .map(match => ({
            index: Number(match[1]),
            value: (match[3] || match[4] || match[5] || '').trim()
        }))
        .filter(item => Number.isFinite(item.index))
        .sort((a, b) => a.index - b.index)
        .map(item => item.value)
        .filter(Boolean);

    if (parts.length === 0) {
        return null;
    }

    return parts.join(' ');
}

function parseAuditdEventLine(line, source, defaultUser) {
    const normalized = String(line || '').replace(/\r/g, '').trim();
    if (!normalized) {
        return null;
    }

    const match = normalized.match(/^type=([A-Z_]+)\s+msg=audit\(([^)]+)\)\s*:\s*(.*)$/);
    if (!match) {
        return null;
    }

    const type = match[1];
    const auditPart = match[2];
    const body = match[3] || '';
    const auditTimestamp = String(auditPart).split(':')[0];
    const occurredAt = normalizeAuditdTimestamp(auditTimestamp);

    const acct = extractAuditBodyField(body, 'acct');
    const auid = extractAuditBodyField(body, 'auid');
    const uid = extractAuditBodyField(body, 'uid');
    const actorUser = normalizeOptionalText(acct || (auid && auid !== 'unset' ? auid : null) || uid || defaultUser || null);

    let command = extractAuditBodyField(body, 'cmd');
    if (!command && /^EXECVE$/i.test(type)) {
        command = parseAuditdExecCommand(body);
    }
    command = command ? maskSensitiveCommand(command) : null;

    let operation = 'SERVER_AUDITD_EVENT';
    let eventType = `auditd_${String(type || '').toLowerCase()}`;
    if (command && /\bsudo\b/i.test(command)) {
        operation = 'SERVER_SUDO_COMMAND';
        eventType = 'sudo_command_auditd';
    } else if (/^(USER_AUTH|USER_LOGIN|USER_ACCT|LOGIN|AUTH)$/i.test(type)) {
        operation = 'SERVER_AUTH_EVENT';
        eventType = 'auditd_auth_event';
    }

    const summary = command
        ? `auditd ${type}: ${command}`
        : `auditd ${type}: ${String(body).slice(0, 450)}`;

    return {
        operation,
        eventType,
        source: source || 'auditd_ausearch',
        user: actorUser || null,
        occurredAt: occurredAt || null,
        command: command || null,
        summary: summary.slice(0, 500),
        rawLine: normalized.slice(0, 2000),
        host: null
    };
}

function parseServerSecurityAuditLogs(raw, defaultUser, limit = 120) {
    const lines = String(raw || '')
        .split('\n')
        .map(line => line.replace(/\r/g, ''))
        .filter(line => line.trim());

    if (lines.length === 0) {
        return [];
    }

    let source = 'security_logs';
    const parsed = [];
    for (const line of lines) {
        const text = line.trim();
        if (text.startsWith('__SOURCE__:')) {
            source = text.slice('__SOURCE__:'.length).trim() || 'security_logs';
            continue;
        }

        const item = parseAuditdEventLine(text, source, defaultUser)
            || parseServerSecurityAuditLine(text, source, defaultUser);
        if (!item) {
            continue;
        }
        parsed.push(item);
    }

    const deduped = [];
    const seen = new Set();
    for (const item of parsed) {
        const key = `${item.operation}|${item.eventType}|${item.occurredAt || '-'}|${item.summary}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(item);
    }

    return deduped.slice(-Math.max(1, limit));
}

async function collectServerOperationHistory(client, defaultUser, perServerLimit = 80) {
    const normalizedLimit = Math.min(Math.max(Number(perServerLimit) || 80, 20), 300);
    const tailSize = Math.max(normalizedLimit * 6, 200);

    const result = await runFirstCommand(
        client,
        [
            `LANG=C sh -lc "if [ -f ~/.zsh_history ]; then echo __SOURCE__:zsh_history; tail -n ${tailSize} ~/.zsh_history; fi; if [ -f ~/.bash_history ]; then echo __SOURCE__:bash_history; tail -n ${tailSize} ~/.bash_history; fi"`,
            `LANG=C bash -lc "HISTTIMEFORMAT='%F %T '; echo __SOURCE__:bash_history_runtime; history ${Math.max(normalizedLimit * 4, 120)}"`,
            `LANG=C sh -lc "echo __SOURCE__:runtime_history; history ${Math.max(normalizedLimit * 4, 120)} 2>/dev/null || true"`
        ],
        15000
    );

    const raw = result.stdout || result.stderr || '';
    return {
        raw,
        items: parseServerOperationHistory(raw, defaultUser, normalizedLimit)
    };
}

async function collectServerSecurityAuditLogs(client, defaultUser, perServerLimit = 120) {
    const normalizedLimit = Math.min(Math.max(Number(perServerLimit) || 120, 40), 400);
    const tailSize = Math.max(normalizedLimit * 4, 200);
    const commands = [
        `LANG=C sh -lc "if command -v ausearch >/dev/null 2>&1; then echo __SOURCE__:auditd_ausearch; ausearch -i -m USER_CMD,EXECVE,USER_AUTH,USER_LOGIN,USER_ACCT -ts recent 2>/dev/null | tail -n ${tailSize}; fi"`,
        `LANG=C sh -lc "if command -v journalctl >/dev/null 2>&1; then echo __SOURCE__:journal_auth; journalctl --no-pager -n ${tailSize} -o short-iso 2>/dev/null | grep -Ei 'sudo|sshd|pam_unix|authentication failure|invalid user|su\\[' | tail -n ${normalizedLimit}; fi"`,
        `LANG=C sh -lc "if [ -f /var/log/auth.log ]; then echo __SOURCE__:auth_log; tail -n ${tailSize} /var/log/auth.log; fi; if [ -f /var/log/secure ]; then echo __SOURCE__:secure_log; tail -n ${tailSize} /var/log/secure; fi"`,
        `LANG=C sh -lc "if [ -f /var/log/messages ]; then echo __SOURCE__:messages_log; tail -n ${tailSize} /var/log/messages | grep -Ei 'sudo|sshd|pam_unix|authentication failure|invalid user|su\\['; fi"`
    ];

    const outputs = [];
    for (const command of commands) {
        try {
            const result = await runSSHCommand(client, command, 20000);
            const text = (result.stdout || '').trim() || (result.stderr || '').trim();
            if (text) {
                outputs.push(text);
            }
        } catch (error) {
            // Ignore and continue next audit source.
        }
    }

    const raw = outputs.join('\n');
    return {
        raw,
        items: parseServerSecurityAuditLogs(raw, defaultUser, normalizedLimit)
    };
}

async function writeServerAuditLogs(server, items, actorUserId) {
    if (!Array.isArray(items) || items.length === 0) {
        return {
            insertedCount: 0,
            skippedCount: 0
        };
    }

    const recentRows = await database.all(
        `SELECT operation, message
         FROM system_logs
         WHERE category = ? AND target_id = ?
         ORDER BY id DESC
         LIMIT 2400`,
        ['SERVER_AUDIT', server.id]
    );

    const existingMessages = new Set(
        (recentRows || []).map(row => `${String(row.operation || '')}|${String(row.message || '')}`)
    );
    let insertedCount = 0;
    let skippedCount = 0;
    const insertedByOperation = {};
    const skippedByOperation = {};

    for (const item of items) {
        const occurredAt = item.occurredAt || 'unknown-time';
        const operation = item.operation || 'SERVER_AUTH_EVENT';
        const content = item.command || item.summary || '';
        if (!content) {
            skippedCount += 1;
            skippedByOperation[operation] = (skippedByOperation[operation] || 0) + 1;
            continue;
        }

        const message = `[${occurredAt}] ${String(content).slice(0, 2000)}`;
        const uniqueKey = `${operation}|${message}`;
        if (existingMessages.has(uniqueKey)) {
            skippedCount += 1;
            skippedByOperation[operation] = (skippedByOperation[operation] || 0) + 1;
            continue;
        }

        await database.run(
            `INSERT INTO system_logs (
                level, category, operation, target_type, target_name, target_id, message, details, user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'INFO',
                'SERVER_AUDIT',
                operation,
                'Server',
                server.name,
                server.id,
                message,
                JSON.stringify({
                    serverHost: server.host,
                    source: item.source || 'security_logs',
                    serverUser: item.user || null,
                    command: item.command || null,
                    summary: item.summary || null,
                    eventType: item.eventType || null,
                    rawLine: item.rawLine || null,
                    occurredAt,
                    host: item.host || null
                }),
                actorUserId || null
            ]
        );

        existingMessages.add(uniqueKey);
        insertedCount += 1;
        insertedByOperation[operation] = (insertedByOperation[operation] || 0) + 1;
    }

    return {
        insertedCount,
        skippedCount,
        insertedByOperation,
        skippedByOperation
    };
}

function normalizeServicePayload(input = {}, existingService = null) {
    const name = input.name !== undefined
        ? normalizeOptionalText(input.name)
        : normalizeOptionalText(existingService?.name);
    if (!name) {
        throw new Error('Service name is required');
    }

    const managerType = normalizeManagerType(
        input.manager_type !== undefined ? input.manager_type : existingService?.manager_type,
        'systemd'
    );
    const checkCommand = input.check_command !== undefined
        ? normalizeOptionalText(input.check_command)
        : normalizeOptionalText(existingService?.check_command);
    const startCommand = input.start_command !== undefined
        ? normalizeOptionalText(input.start_command)
        : normalizeOptionalText(existingService?.start_command);
    const stopCommand = input.stop_command !== undefined
        ? normalizeOptionalText(input.stop_command)
        : normalizeOptionalText(existingService?.stop_command);
    const restartCommand = input.restart_command !== undefined
        ? normalizeOptionalText(input.restart_command)
        : normalizeOptionalText(existingService?.restart_command);

    if (managerType === 'custom') {
        if (!checkCommand) {
            throw new Error('check_command is required when manager_type=custom');
        }
        if (![startCommand, stopCommand, restartCommand].some(Boolean)) {
            throw new Error('At least one action command is required for custom service');
        }
    }

    return {
        name,
        manager_type: managerType,
        check_command: checkCommand,
        start_command: startCommand,
        stop_command: stopCommand,
        restart_command: restartCommand,
        monitor_enabled: toIntBoolean(
            input.monitor_enabled,
            existingService ? toIntBoolean(existingService.monitor_enabled, 1) : 1
        ),
        auto_restart: toIntBoolean(
            input.auto_restart,
            existingService ? toIntBoolean(existingService.auto_restart, 0) : 0
        ),
        notify_on_down: toIntBoolean(
            input.notify_on_down,
            existingService ? toIntBoolean(existingService.notify_on_down, 1) : 1
        )
    };
}

// POST /api/servers/services/monitor/run
router.post('/services/monitor/run', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    try {
        const summary = await runManagedServiceMonitorJob({
            trigger: 'manual',
            actorUserId: req.user.id,
            serverId: req.body?.server_id
        });

        return res.json({
            success: true,
            message: 'Managed service monitor executed',
            data: summary
        });
    } catch (error) {
        logger.error('Failed to run managed service monitor manually:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to run service monitor'
        });
    }
});

// POST /api/servers/:id/services/discover
router.post('/:id/services/discover', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    let sshClient;
    try {
        const serverId = Number(req.params.id);
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const sshResult = await createSSHClient(server, Number(process.env.SSH_TEST_TIMEOUT_MS || 12000));
        sshClient = sshResult.client;

        const discoverResult = await discoverRunningServicesWithClient(sshClient, req.body?.limit || req.query?.limit || 200);
        const existingRows = await database.all(
            'SELECT name FROM server_services WHERE server_id = ?',
            [serverId]
        );
        const existing = new Set(
            (existingRows || []).map(item => String(item.name || '').trim().toLowerCase()).filter(Boolean)
        );

        const services = (discoverResult.services || []).map(item => {
            const unit = String(item.unit_name || '').trim();
            const shortName = String(item.service_name || '').trim();
            const configured = existing.has(unit.toLowerCase()) || existing.has(shortName.toLowerCase());
            return {
                ...item,
                configured
            };
        });

        await logOperation(
            'DISCOVER_RUNNING_SERVICES',
            server.name,
            serverId,
            `Discovered ${services.length} running services`,
            req.user.id
        );

        return res.json({
            success: true,
            message: `Detected ${services.length} running services`,
            data: {
                count: services.length,
                services
            }
        });
    } catch (error) {
        logger.error('Failed to discover running services:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to discover running services'
        });
    } finally {
        if (sshClient) {
            try {
                sshClient.end();
            } catch (closeError) {
                // Ignore close error.
            }
        }
    }
});

// GET /api/servers/:id/services
router.get('/:id/services', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_VIEW), async (req, res) => {
    try {
        const serverId = Number(req.params.id);
        const server = await database.get('SELECT id, name FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const services = await database.all(
            `SELECT
                id, server_id, name, manager_type,
                check_command, start_command, stop_command, restart_command,
                monitor_enabled, auto_restart, notify_on_down,
                status, last_check_at, last_error, last_notify_at,
                created_at, updated_at
             FROM server_services
             WHERE server_id = ?
             ORDER BY name ASC, id ASC`,
            [serverId]
        );

        return res.json({
            success: true,
            data: services || []
        });
    } catch (error) {
        logger.error('Failed to query server services:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/servers/:id/services
router.post('/:id/services', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateServerService, async (req, res) => {
    try {
        const serverId = Number(req.params.id);
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const payload = normalizeServicePayload(req.body || {}, null);
        const duplicate = await database.get(
            'SELECT id FROM server_services WHERE server_id = ? AND name = ?',
            [serverId, payload.name]
        );
        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: 'Service already exists on this server'
            });
        }

        const result = await database.run(
            `INSERT INTO server_services (
                server_id, name, manager_type, check_command, start_command, stop_command, restart_command,
                monitor_enabled, auto_restart, notify_on_down, status, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                serverId,
                payload.name,
                payload.manager_type,
                payload.check_command,
                payload.start_command,
                payload.stop_command,
                payload.restart_command,
                payload.monitor_enabled,
                payload.auto_restart,
                payload.notify_on_down,
                'UNKNOWN',
                req.user.id
            ]
        );

        await logOperation(
            'CREATE_SERVICE_CONFIG',
            server.name,
            serverId,
            `Configured managed service ${payload.name} (${payload.manager_type})`,
            req.user.id
        );

        const created = await loadManagedService(serverId, result.id);
        return res.status(201).json({
            success: true,
            message: 'Service configuration created',
            data: created
        });
    } catch (error) {
        logger.error('Failed to create server service config:', error);
        const isInputError = /required|At least one/i.test(String(error.message || ''));
        return res.status(isInputError ? 400 : 500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// PUT /api/servers/:id/services/:serviceId
router.put('/:id/services/:serviceId', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateServerService, async (req, res) => {
    try {
        const serverId = Number(req.params.id);
        const serviceId = Number(req.params.serviceId);
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const existingService = await loadManagedService(serverId, serviceId);
        if (!existingService) {
            return res.status(404).json({
                success: false,
                message: 'Service config not found'
            });
        }

        const payload = normalizeServicePayload(req.body || {}, existingService);
        const duplicate = await database.get(
            'SELECT id FROM server_services WHERE server_id = ? AND name = ? AND id != ?',
            [serverId, payload.name, serviceId]
        );
        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: 'Service already exists on this server'
            });
        }

        await database.run(
            `UPDATE server_services
             SET name = ?, manager_type = ?, check_command = ?, start_command = ?, stop_command = ?, restart_command = ?,
                 monitor_enabled = ?, auto_restart = ?, notify_on_down = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND server_id = ?`,
            [
                payload.name,
                payload.manager_type,
                payload.check_command,
                payload.start_command,
                payload.stop_command,
                payload.restart_command,
                payload.monitor_enabled,
                payload.auto_restart,
                payload.notify_on_down,
                serviceId,
                serverId
            ]
        );

        await logOperation(
            'UPDATE_SERVICE_CONFIG',
            server.name,
            serverId,
            `Updated managed service ${payload.name} (${payload.manager_type})`,
            req.user.id
        );

        const updated = await loadManagedService(serverId, serviceId);
        return res.json({
            success: true,
            message: 'Service configuration updated',
            data: updated
        });
    } catch (error) {
        logger.error('Failed to update server service config:', error);
        const isInputError = /required|At least one/i.test(String(error.message || ''));
        return res.status(isInputError ? 400 : 500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// DELETE /api/servers/:id/services/:serviceId
router.delete('/:id/services/:serviceId', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    try {
        const serverId = Number(req.params.id);
        const serviceId = Number(req.params.serviceId);
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const service = await loadManagedService(serverId, serviceId);
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service config not found'
            });
        }

        await database.run(
            'DELETE FROM server_services WHERE id = ? AND server_id = ?',
            [serviceId, serverId]
        );

        await logOperation(
            'DELETE_SERVICE_CONFIG',
            server.name,
            serverId,
            `Deleted managed service ${service.name}`,
            req.user.id
        );

        return res.json({
            success: true,
            message: 'Service configuration deleted'
        });
    } catch (error) {
        logger.error('Failed to delete server service config:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/servers/:id/services/:serviceId/action
router.post('/:id/services/:serviceId/action', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateServiceAction, async (req, res) => {
    let sshClient;
    try {
        const serverId = Number(req.params.id);
        const serviceId = Number(req.params.serviceId);
        const action = String(req.body?.action || 'check').trim().toLowerCase();
        const operationMap = {
            check: 'CHECK_SERVICE',
            start: 'START_SERVICE',
            stop: 'STOP_SERVICE',
            restart: 'RESTART_SERVICE'
        };

        const server = await database.get('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const service = await loadManagedService(serverId, serviceId);
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service config not found'
            });
        }

        const sshResult = await createSSHClient(server, Number(process.env.SSH_TEST_TIMEOUT_MS || 12000));
        sshClient = sshResult.client;

        const actionResult = await runServiceActionWithClient(sshClient, service, action);
        const expectedStatus = action === 'stop' ? 'STOPPED' : 'RUNNING';
        const success = action === 'check'
            ? actionResult.status === 'RUNNING'
            : actionResult.status === expectedStatus;
        const outputText = actionResult.actionResult
            ? (actionResult.actionResult.stdout || actionResult.actionResult.stderr || `exit:${actionResult.actionResult.code}`)
            : (actionResult.checkResult.stdout || actionResult.checkResult.stderr || '-');
        const errorText = success ? null : `Service ${service.name} is ${actionResult.status}`;

        let lastNotifyAt = service.last_notify_at || null;
        if (actionResult.status === 'RUNNING') {
            lastNotifyAt = null;
        } else {
            const notified = await maybeNotifyServiceDown(
                service,
                server,
                errorText || outputText || 'Service is not running',
                req.user.username
            );
            if (notified) {
                lastNotifyAt = new Date().toISOString();
            }
        }

        await database.run(
            `UPDATE server_services
             SET status = ?, last_check_at = CURRENT_TIMESTAMP, last_error = ?, last_notify_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND server_id = ?`,
            [actionResult.status, errorText, lastNotifyAt, serviceId, serverId]
        );

        await logOperation(
            operationMap[action] || 'CHECK_SERVICE',
            server.name,
            serverId,
            `Service ${service.name} ${action}: ${actionResult.status}`,
            req.user.id
        );

        return res.json({
            success,
            message: success
                ? `Service ${service.name} ${action} success`
                : `Service ${service.name} ${action} result: ${actionResult.status}`,
            data: {
                service_id: serviceId,
                service_name: service.name,
                action,
                status: actionResult.status,
                check: actionResult.checkResult,
                action_result: actionResult.actionResult
            }
        });
    } catch (error) {
        logger.error('Failed to execute managed service action:', error);
        const isInputError = /not configured/i.test(String(error.message || ''));
        return res.status(isInputError ? 400 : 500).json({
            success: false,
            message: error.message || 'Failed to execute service action'
        });
    } finally {
        if (sshClient) {
            try {
                sshClient.end();
            } catch (closeError) {
                // Ignore close error.
            }
        }
    }
});

// GET /api/servers
router.get('/', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_VIEW), async (req, res) => {
    try {
        const servers = await database.all(
            `SELECT s.*, u.username AS created_by_name
             FROM servers s
             LEFT JOIN users u ON s.created_by = u.id
             ORDER BY s.created_at DESC`
        );

        res.json({
            success: true,
            data: servers.map(maskServerSecret)
        });
    } catch (error) {
        logger.error('Failed to query servers:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET /api/servers/export
router.get('/export', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    try {
        const servers = await database.all(
            `SELECT
                name, host, port, username, password, private_key_path,
                bastion_enabled, bastion_host, bastion_port, bastion_username, bastion_password, bastion_private_key_path,
                description
             FROM servers
             ORDER BY created_at DESC`
        );

        const data = (servers || []).map(item => ({
            name: item.name,
            host: item.host,
            port: normalizePort(item.port, 22),
            username: item.username,
            password: null,
            has_password: Boolean(item.password),
            private_key_path: normalizeOptionalText(item.private_key_path),
            bastion_enabled: isTruthy(item.bastion_enabled),
            bastion_host: normalizeOptionalText(item.bastion_host),
            bastion_port: normalizePort(item.bastion_port, 22),
            bastion_username: normalizeOptionalText(item.bastion_username),
            bastion_password: null,
            has_bastion_password: Boolean(item.bastion_password),
            bastion_private_key_path: normalizeOptionalText(item.bastion_private_key_path),
            description: normalizeOptionalText(item.description)
        }));

        await logOperation(
            'EXPORT',
            'ALL_SERVERS',
            null,
            `Exported ${data.length} servers`,
            req.user.id
        );

        return res.json({
            success: true,
            data: {
                version: 2,
                exported_at: new Date().toISOString(),
                server_count: data.length,
                servers: data
            }
        });
    } catch (error) {
        logger.error('Failed to export servers:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export servers'
        });
    }
});

// POST /api/servers/import
router.post('/import', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateImportServers, async (req, res) => {
    try {
        const servers = Array.isArray(req.body?.servers) ? req.body.servers : [];
        const overwriteExisting = isTruthy(req.body?.overwrite_existing);

        let insertedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        const failures = [];

        await database.withDeferredSave(async () => {
            for (let i = 0; i < servers.length; i += 1) {
                const raw = servers[i];
                const index = i + 1;

                try {
                    const tentativeHost = normalizeOptionalText(raw?.host);
                    const tentativePort = normalizePort(raw?.port, 22);

                    if (!tentativeHost) {
                        throw new Error('Server host is required');
                    }

                    const existingServer = await database.get(
                        'SELECT * FROM servers WHERE host = ? AND port = ?',
                        [tentativeHost, tentativePort]
                    );
                    const normalized = normalizeImportedServerRecord(raw, existingServer || null);
                    const encryptedPassword = encryptSecret(normalized.password);
                    const encryptedBastionPassword = encryptSecret(normalized.bastionConfig.password);

                    if (existingServer) {
                        if (!overwriteExisting) {
                            skippedCount += 1;
                            continue;
                        }

                        await database.run(
                            `UPDATE servers SET
                                name = ?, username = ?, password = ?, private_key_path = ?, description = ?,
                                bastion_enabled = ?, bastion_host = ?, bastion_port = ?, bastion_username = ?, bastion_password = ?, bastion_private_key_path = ?,
                                connection_status = 'UNKNOWN', last_check_at = NULL, updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [
                                normalized.name,
                                normalized.username,
                                encryptedPassword,
                                normalized.privateKeyPath,
                                normalized.description,
                                normalized.bastionConfig.enabled,
                                normalized.bastionConfig.host,
                                normalized.bastionConfig.port,
                                normalized.bastionConfig.username,
                                encryptedBastionPassword,
                                normalized.bastionConfig.privateKeyPath,
                                existingServer.id
                            ]
                        );
                        updatedCount += 1;
                    } else {
                        await database.run(
                            `INSERT INTO servers (
                                name, host, port, username, password, private_key_path, description,
                                bastion_enabled, bastion_host, bastion_port, bastion_username, bastion_password, bastion_private_key_path,
                                connection_status, created_by
                             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                normalized.name,
                                normalized.host,
                                normalized.port,
                                normalized.username,
                                encryptedPassword,
                                normalized.privateKeyPath,
                                normalized.description,
                                normalized.bastionConfig.enabled,
                                normalized.bastionConfig.host,
                                normalized.bastionConfig.port,
                                normalized.bastionConfig.username,
                                encryptedBastionPassword,
                                normalized.bastionConfig.privateKeyPath,
                                'UNKNOWN',
                                req.user.id
                            ]
                        );
                        insertedCount += 1;
                    }
                } catch (error) {
                    failures.push({
                        index,
                        name: normalizeOptionalText(raw?.name) || null,
                        host: normalizeOptionalText(raw?.host) || null,
                        reason: error.message || 'Invalid server data'
                    });
                }
            }
        });

        await logOperation(
            'IMPORT',
            'ALL_SERVERS',
            null,
            `Imported servers: inserted=${insertedCount}, updated=${updatedCount}, skipped=${skippedCount}, failed=${failures.length}`,
            req.user.id
        );

        return res.json({
            success: true,
            message: `Imported servers: inserted ${insertedCount}, updated ${updatedCount}, skipped ${skippedCount}, failed ${failures.length}`,
            data: {
                requestedCount: servers.length,
                insertedCount,
                updatedCount,
                skippedCount,
                failedCount: failures.length,
                failures
            }
        });
    } catch (error) {
        logger.error('Failed to import servers:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to import servers'
        });
    }
});

// GET /api/servers/:id
router.get('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_VIEW), async (req, res) => {
    try {
        const { id } = req.params;

        const server = await database.get(
            `SELECT s.*, u.username AS created_by_name
             FROM servers s
             LEFT JOIN users u ON s.created_by = u.id
             WHERE s.id = ?`,
            [id]
        );

        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        return res.json({
            success: true,
            data: maskServerSecret(server)
        });
    } catch (error) {
        logger.error('Failed to query server detail:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/servers
router.post('/', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateServer, async (req, res) => {
    try {
        const {
            name,
            host,
            port = 22,
            username,
            password,
            private_key_path,
            description,
            bastion_enabled,
            bastion_host,
            bastion_port,
            bastion_username,
            bastion_password,
            bastion_private_key_path
        } = req.body;

        const normalizedPort = normalizePort(port, 22);
        const normalizedPassword = password && password !== '******' ? encryptSecret(password) : null;
        const normalizedPrivateKeyPath = normalizeOptionalText(private_key_path);
        const normalizedDescription = normalizeOptionalText(description);
        const bastionConfig = normalizeBastionConfig({
            bastion_enabled,
            bastion_host,
            bastion_port,
            bastion_username,
            bastion_password,
            bastion_private_key_path
        });

        const existingServer = await database.get(
            'SELECT id FROM servers WHERE host = ? AND port = ?',
            [host, normalizedPort]
        );
        if (existingServer) {
            return res.status(409).json({
                success: false,
                message: 'A server with the same host and port already exists'
            });
        }

        const result = await database.run(
            `INSERT INTO servers (
                name, host, port, username, password, private_key_path, description,
                bastion_enabled, bastion_host, bastion_port, bastion_username, bastion_password, bastion_private_key_path,
                created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                host,
                normalizedPort,
                username,
                normalizedPassword,
                normalizedPrivateKeyPath,
                normalizedDescription,
                bastionConfig.enabled,
                bastionConfig.host,
                bastionConfig.port,
                bastionConfig.username,
                encryptSecret(bastionConfig.password),
                bastionConfig.privateKeyPath,
                req.user.id
            ]
        );

        await logOperation(
            'CREATE',
            name,
            result.id,
            `Create server ${name} (${host}:${normalizedPort})`,
            req.user.id
        );

        logger.info(`User ${req.user.username} created server ${name} (${host}:${normalizedPort})`);

        return res.status(201).json({
            success: true,
            message: 'Server created successfully',
            data: {
                id: result.id,
                name,
                host,
                port: normalizedPort
            }
        });
    } catch (error) {
        logger.error('Failed to create server:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// PUT /api/servers/:id
router.put('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateServer, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            host,
            port,
            username,
            password,
            private_key_path,
            description,
            bastion_enabled,
            bastion_host,
            bastion_port,
            bastion_username,
            bastion_password,
            bastion_private_key_path
        } = req.body;

        const existingServer = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        if (!existingServer) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const normalizedPort = normalizePort(port, 22);

        if (existingServer.host !== host || Number(existingServer.port) !== normalizedPort) {
            const duplicateServer = await database.get(
                'SELECT id FROM servers WHERE host = ? AND port = ? AND id != ?',
                [host, normalizedPort, id]
            );
            if (duplicateServer) {
                return res.status(409).json({
                    success: false,
                    message: 'A server with the same host and port already exists'
                });
            }
        }

        const normalizedDescription = normalizeOptionalText(description);
        const bastionConfig = normalizeBastionConfig({
            bastion_enabled,
            bastion_host,
            bastion_port,
            bastion_username,
            bastion_password,
            bastion_private_key_path
        }, existingServer);

        const updateData = [
            name,
            host,
            normalizedPort,
            username,
            normalizedDescription,
            bastionConfig.enabled,
            bastionConfig.host,
            bastionConfig.port,
            bastionConfig.username,
            encryptSecret(bastionConfig.password),
            bastionConfig.privateKeyPath
        ];
        let updateSql = `
            UPDATE servers SET
                name = ?, host = ?, port = ?, username = ?, description = ?,
                bastion_enabled = ?, bastion_host = ?, bastion_port = ?,
                bastion_username = ?, bastion_password = ?, bastion_private_key_path = ?,
                updated_at = CURRENT_TIMESTAMP
        `;

        if (password && password !== '******') {
            updateSql += ', password = ?';
            updateData.push(encryptSecret(password));
        }

        if (private_key_path !== undefined) {
            updateSql += ', private_key_path = ?';
            updateData.push(normalizeOptionalText(private_key_path));
        }

        updateSql += ' WHERE id = ?';
        updateData.push(id);

        await database.run(updateSql, updateData);

        await logOperation(
            'UPDATE',
            name,
            id,
            `Update server ${name} (${host}:${normalizedPort})`,
            req.user.id
        );

        logger.info(`User ${req.user.username} updated server ${name} (ID: ${id})`);

        return res.json({
            success: true,
            message: 'Server updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update server:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// DELETE /api/servers/:id
router.delete('/:id', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    try {
        const { id } = req.params;

        const server = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        await database.run('DELETE FROM servers WHERE id = ?', [id]);

        await logOperation(
            'DELETE',
            server.name,
            id,
            `Delete server ${server.name} (${server.host}:${server.port})`,
            req.user.id
        );

        logger.info(`User ${req.user.username} deleted server ${server.name} (ID: ${id})`);

        return res.json({
            success: true,
            message: 'Server deleted successfully'
        });
    } catch (error) {
        logger.error('Failed to delete server:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/servers/batch-delete
router.post('/batch-delete', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), validateBatchDelete, async (req, res) => {
    try {
        const { ids } = req.body;
        const uniqueIds = [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];

        if (uniqueIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid server IDs provided'
            });
        }

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const servers = await database.all(
            `SELECT id, name, host, port FROM servers WHERE id IN (${placeholders})`,
            uniqueIds
        );

        const result = await database.run(
            `DELETE FROM servers WHERE id IN (${placeholders})`,
            uniqueIds
        );

        const deletedNames = servers.map(item => `${item.name}(${item.host}:${item.port})`).join(', ') || 'N/A';
        await logOperation(
            'BATCH_DELETE',
            deletedNames,
            null,
            `Batch delete servers, removed ${result.changes} records`,
            req.user.id
        );

        logger.info(`User ${req.user.username} batch deleted ${result.changes} servers`);

        return res.json({
            success: true,
            message: `Deleted ${result.changes} servers`,
            data: {
                requestedCount: uniqueIds.length,
                deletedCount: result.changes
            }
        });
    } catch (error) {
        logger.error('Batch delete servers failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/servers/audit-logs/sync
router.post('/audit-logs/sync', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_AUDIT), async (req, res) => {
    const perServerLimit = Math.min(Math.max(Number(req.body?.perServerLimit) || 80, 20), 300);
    const authPerServerLimit = Math.min(Math.max(Number(req.body?.authPerServerLimit) || Math.max(Math.floor(perServerLimit * 1.5), 120), 40), 500);
    const requestServerId = Number(req.body?.server_id || req.query?.server_id || 0);

    try {
        const servers = requestServerId > 0
            ? await database.all('SELECT * FROM servers WHERE id = ?', [requestServerId])
            : await database.all('SELECT * FROM servers ORDER BY id ASC');

        if (!servers || servers.length === 0) {
            return res.status(404).json({
                success: false,
                message: requestServerId > 0 ? 'Server not found' : 'No servers configured'
            });
        }

        let successCount = 0;
        let insertedCount = 0;
        let skippedCount = 0;
        const insertedByOperation = {};
        const skippedByOperation = {};
        const failures = [];

        for (const server of servers) {
            let sshClient;
            try {
                const sshResult = await createSSHClient(server, Number(process.env.SSH_TEST_TIMEOUT_MS || 12000));
                sshClient = sshResult.client;

                const historyResult = await collectServerOperationHistory(
                    sshClient,
                    normalizeOptionalText(server.username),
                    perServerLimit
                );
                const securityResult = await collectServerSecurityAuditLogs(
                    sshClient,
                    normalizeOptionalText(server.username),
                    authPerServerLimit
                );

                const writeResult = await writeServerAuditLogs(
                    server,
                    [...historyResult.items, ...securityResult.items],
                    req.user.id
                );
                insertedCount += writeResult.insertedCount;
                skippedCount += writeResult.skippedCount;
                Object.entries(writeResult.insertedByOperation || {}).forEach(([op, count]) => {
                    insertedByOperation[op] = (insertedByOperation[op] || 0) + Number(count || 0);
                });
                Object.entries(writeResult.skippedByOperation || {}).forEach(([op, count]) => {
                    skippedByOperation[op] = (skippedByOperation[op] || 0) + Number(count || 0);
                });
                successCount += 1;
            } catch (error) {
                failures.push({
                    server_id: server.id,
                    server_name: server.name,
                    host: server.host,
                    error: error.message || String(error)
                });
                logger.warn(`Failed to sync server audit logs: server=${server.id}, reason=${error.message || error}`);
            } finally {
                if (sshClient) {
                    try {
                        sshClient.end();
                    } catch (closeError) {
                        // Ignore close error.
                    }
                }
            }
        }

        await database.run(
            `INSERT INTO system_logs (level, category, operation, target_type, target_name, target_id, message, details, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'INFO',
                'SERVER_AUDIT',
                'SYNC_SERVER_AUDIT',
                requestServerId > 0 ? 'Server' : 'Servers',
                requestServerId > 0 ? (servers[0]?.name || String(requestServerId)) : 'ALL',
                requestServerId > 0 ? requestServerId : null,
                `Server audit sync finished: inserted ${insertedCount}, skipped ${skippedCount}, success ${successCount}/${servers.length}`,
                JSON.stringify({
                    perServerLimit,
                    authPerServerLimit,
                    totalServers: servers.length,
                    successCount,
                    failedCount: failures.length,
                    insertedByOperation,
                    skippedByOperation,
                    failures: failures.slice(0, 50)
                }),
                req.user.id
            ]
        );

        return res.json({
            success: true,
            message: 'Server operation logs synced',
            data: {
                totalServers: servers.length,
                successCount,
                failedCount: failures.length,
                insertedCount,
                skippedCount,
                perServerLimit,
                authPerServerLimit,
                insertedByOperation,
                skippedByOperation,
                failures
            }
        });
    } catch (error) {
        logger.error('Failed to sync server audit logs:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to sync server audit logs'
        });
    }
});

// GET /api/servers/:id/performance
router.get('/:id/performance', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_VIEW), async (req, res) => {
    let sshClient;
    try {
        const { id } = req.params;
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        const startedAt = Date.now();
        const sshResult = await createSSHClient(server);
        sshClient = sshResult.client;

        const metrics = await collectServerPerformance(sshClient);
        const responseTime = Date.now() - startedAt;

        await database.run(
            'UPDATE servers SET connection_status = ?, last_check_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['ONLINE', id]
        );

        await logOperation(
            'GET_PERFORMANCE',
            server.name,
            id,
            `Collected server performance (${responseTime}ms)`,
            req.user.id
        );

        return res.json({
            success: true,
            data: {
                server: {
                    id: server.id,
                    name: server.name,
                    host: server.host,
                    port: server.port,
                    username: server.username
                },
                connection: {
                    authMethod: sshResult.authMethod,
                    responseTime,
                    mode: sshResult.connectionMode || getConnectionMode(server)
                },
                metrics,
                collected_at: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Failed to get server performance:', error);

        if (req.params.id) {
            try {
                await database.run(
                    'UPDATE servers SET connection_status = ?, last_check_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['OFFLINE', req.params.id]
                );
            } catch (updateError) {
                logger.error('Failed to update server status after performance error:', updateError);
            }
        }

        return res.status(502).json({
            success: false,
            message: error.message || 'Failed to fetch server performance'
        });
    } finally {
        if (sshClient) {
            try {
                sshClient.end();
            } catch (closeError) {
                // Ignore close error.
            }
        }
    }
});

// POST /api/servers/:id/test-bastion
router.post('/:id/test-bastion', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    try {
        const { id } = req.params;
        const server = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        if (getConnectionMode(server) !== 'bastion') {
            return res.status(400).json({
                success: false,
                message: 'Bastion is not enabled for this server'
            });
        }

        logger.info(`User ${req.user.username} testing bastion connection for server: ${server.name} (${server.host}:${server.port})`);

        const testResult = await testBastionConnection(server);
        await logOperation(
            'TEST_BASTION_CONNECTION',
            server.name,
            id,
            `Bastion SSH test: ${testResult.message} (${testResult.responseTime}ms)`,
            req.user.id
        );

        return res.json({
            success: testResult.success,
            message: testResult.message,
            data: {
                ...testResult,
                bastion: {
                    host: server.bastion_host,
                    port: normalizePort(server.bastion_port, 22),
                    username: server.bastion_username
                },
                server: {
                    name: server.name,
                    host: server.host,
                    port: server.port
                }
            }
        });
    } catch (error) {
        logger.error('Failed to test bastion connection:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /api/servers/:id/test
router.post('/:id/test', authUtils.authenticateToken, authUtils.requirePermission(authUtils.PERMISSIONS.SERVERS_MANAGE), async (req, res) => {
    try {
        const { id } = req.params;

        const server = await database.get('SELECT * FROM servers WHERE id = ?', [id]);
        if (!server) {
            return res.status(404).json({
                success: false,
                message: 'Server not found'
            });
        }

        logger.info(`User ${req.user.username} testing SSH connection: ${server.name} (${server.host}:${server.port})`);

        const testResult = await testSSHConnection(server);

        const status = testResult.success ? 'ONLINE' : 'OFFLINE';
        await database.run(
            'UPDATE servers SET connection_status = ?, last_check_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, id]
        );

        await logOperation(
            'TEST_CONNECTION',
            server.name,
            id,
            `SSH test: ${testResult.message} (${testResult.responseTime}ms)`,
            req.user.id
        );

        if (status === 'OFFLINE') {
            void notifyServerOffline({
                serverId: Number(id),
                serverName: server.name,
                host: server.host,
                port: server.port,
                reason: testResult.message,
                responseTime: testResult.responseTime,
                testedBy: req.user.username
            });
        }

        return res.json({
            success: testResult.success,
            message: testResult.message,
            data: {
                ...testResult,
                status,
                server: {
                    name: server.name,
                    host: server.host,
                    port: server.port
                }
            }
        });
    } catch (error) {
        logger.error('Failed to test server connection:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.runManagedServiceMonitorJob = runManagedServiceMonitorJob;
module.exports = router;

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const authUtils = require('../utils/auth');
const database = require('../config/database');
const logger = require('../utils/logger');
const { getSystemSettings, saveSystemSettings } = require('../utils/systemSettings');

const router = express.Router();

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: '请求数据校验失败',
            errors: errors.array()
        });
    }
    next();
}

async function logSystem(level, category, operation, message, userId = null) {
    try {
        await database.run(
            `INSERT INTO system_logs (level, category, operation, message, user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [level, category, operation, message, userId]
        );
    } catch (error) {
        logger.error('写入系统日志失败:', error);
    }
}

function toIntInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

async function getPasswordMinLength() {
    const settings = await getSystemSettings();
    return toIntInRange(settings.password_min_length, 8, 6, 64);
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
    const dateMs = Date.parse(normalized);
    return Number.isFinite(dateMs) ? dateMs : 0;
}

function buildTemporaryPassword(length = 16) {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '@#$%&*!?';
    const all = `${lower}${upper}${digits}${symbols}`;

    const pick = (charset) => charset[Math.floor(Math.random() * charset.length)];
    const target = Math.max(12, Number.parseInt(String(length), 10) || 16);
    const raw = [
        pick(lower),
        pick(upper),
        pick(digits),
        pick(symbols)
    ];

    while (raw.length < target) {
        raw.push(pick(all));
    }

    for (let i = raw.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [raw[i], raw[j]] = [raw[j], raw[i]];
    }

    return raw.join('');
}

function normalizeRoleGroupsConfig(rawRoleGroups, availableRoles) {
    if (!rawRoleGroups || typeof rawRoleGroups !== 'object' || Array.isArray(rawRoleGroups)) {
        return {};
    }

    const lookup = new Map(
        (availableRoles || []).map(role => [String(role).trim().toLowerCase(), String(role).trim()])
    );
    const usedRoles = new Set();
    const normalized = {};

    for (const [groupKey, groupRoles] of Object.entries(rawRoleGroups)) {
        const normalizedGroupKey = String(groupKey || '').trim();
        if (!normalizedGroupKey || !Array.isArray(groupRoles)) {
            continue;
        }

        const nextRoles = [];
        for (const role of groupRoles) {
            const roleKey = lookup.get(String(role || '').trim().toLowerCase());
            if (!roleKey || usedRoles.has(roleKey)) {
                continue;
            }
            usedRoles.add(roleKey);
            nextRoles.push(roleKey);
        }

        if (nextRoles.length > 0) {
            normalized[normalizedGroupKey] = nextRoles;
        }
    }

    return normalized;
}

const validateLogin = [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空'),
    handleValidationErrors
];

const validateRegister = [
    body('username')
        .notEmpty().withMessage('用户名不能为空')
        .isLength({ min: 3, max: 50 }).withMessage('用户名长度应为 3-50 个字符')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
    body('password')
        .isLength({ min: 6 }).withMessage('密码长度至少 8 位')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('密码必须包含字母和数字'),
    body('email').optional().isEmail().withMessage('邮箱格式不正确'),
    handleValidationErrors
];

const validateUserCreation = [
    body('username')
        .notEmpty().withMessage('用户名不能为空')
        .isLength({ min: 3, max: 50 }).withMessage('用户名长度应为 3-50 个字符')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
    body('password')
        .isLength({ min: 6 }).withMessage('密码长度至少 8 位')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('密码必须包含字母和数字'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('邮箱格式不正确'),
    body('role').optional().isIn(['admin', 'user']).withMessage('角色不合法'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值'),
    handleValidationErrors
];

const validateUserUpdate = [
    param('id').isInt({ min: 1 }).withMessage('用户 ID 不合法'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('邮箱格式不正确'),
    body('role').optional().isIn(['admin', 'user']).withMessage('角色不合法'),
    body('password').optional().isLength({ min: 6 }).withMessage('密码长度至少 8 位'),
    body('is_active').optional().isBoolean().withMessage('is_active 必须为布尔值'),
    handleValidationErrors
];

const validateUserIdParam = [
    param('id').isInt({ min: 1 }).withMessage('用户 ID 不合法'),
    handleValidationErrors
];

const validateRoleGroupsUpdate = [
    body('role_groups')
        .custom((value) => {
            if (value === undefined) {
                return true;
            }
            return value && typeof value === 'object' && !Array.isArray(value);
        })
        .withMessage('role_groups must be an object'),
    handleValidationErrors
];

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { username, password } = req.body;
        const settings = await getSystemSettings();
        const maxLoginAttempts = toIntInRange(settings.max_login_attempts, 5, 3, 20);
        const lockMinutes = toIntInRange(settings.login_lock_minutes, 15, 1, 1440);

        const user = await database.get(
            `SELECT
                id, username, password, email, role, is_active,
                failed_login_attempts, locked_until
             FROM users
             WHERE username = ?`,
            [username]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        if (user.is_active === 0) {
            return res.status(403).json({
                success: false,
                message: '账号已被禁用，请联系管理员'
            });
        }

        const now = Date.now();
        const lockUntilMs = parseDateToMs(user.locked_until);
        if (lockUntilMs > now) {
            return res.status(429).json({
                success: false,
                message: `登录失败次数过多，账号已锁定，请在 ${new Date(lockUntilMs).toISOString()} 后重试`
            });
        }
        if (lockUntilMs > 0 && lockUntilMs <= now) {
            await database.run(
                `UPDATE users
                 SET failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [user.id]
            );
            user.failed_login_attempts = 0;
            user.locked_until = null;
        }

        const isValidPassword = await authUtils.comparePassword(password, user.password);
        if (!isValidPassword) {
            const failedLoginAttempts = Math.max(0, Number.parseInt(String(user.failed_login_attempts || 0), 10) || 0) + 1;
            const shouldLock = failedLoginAttempts >= maxLoginAttempts;
            const nextLockedUntil = shouldLock
                ? new Date(Date.now() + lockMinutes * 60 * 1000).toISOString()
                : null;

            await database.run(
                `UPDATE users
                 SET failed_login_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [failedLoginAttempts, nextLockedUntil, user.id]
            );

            if (shouldLock) {
                await logSystem(
                    'WARN',
                    'AUTH',
                    'LOGIN_LOCKED',
                    `用户 ${username} 登录失败超过阈值，账号锁定 ${lockMinutes} 分钟`,
                    user.id
                );
                return res.status(429).json({
                    success: false,
                    message: `登录失败次数过多，账号已锁定 ${lockMinutes} 分钟`
                });
            }

            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        const sessionTimeoutMinutes = toIntInRange(settings.session_timeout, 1440, 30, 10080);
        const token = authUtils.generateToken(
            {
                id: user.id,
                username: user.username,
                role: user.role
            },
            { expiresIn: `${sessionTimeoutMinutes}m` }
        );

        await database.run(
            `UPDATE users
             SET last_login = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL
             WHERE id = ?`,
            [user.id]
        );
        await logSystem('INFO', 'AUTH', 'LOGIN', `用户 ${username} 登录成功`, user.id);

        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    permissions: authUtils.resolvePermissions(user.role),
                    is_active: user.is_active !== 0
                }
            }
        });
    } catch (error) {
        logger.error('登录处理错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// POST /api/auth/register
router.post('/register', validateRegister, async (req, res) => {
    try {
        const { username, password, email } = req.body;

        const existingUser = await database.get('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: '用户名已存在'
            });
        }

        if (email) {
            const existingEmail = await database.get('SELECT id FROM users WHERE email = ?', [email]);
            if (existingEmail) {
                return res.status(409).json({
                    success: false,
                    message: '邮箱已被使用'
                });
            }
        }

        const passwordMinLength = await getPasswordMinLength();
        if (String(password || '').length < passwordMinLength) {
            return res.status(400).json({
                success: false,
                message: `Password must be at least ${passwordMinLength} characters`
            });
        }

        const hashedPassword = await authUtils.hashPassword(password);
        const result = await database.run(
            `INSERT INTO users (username, password, email, role, is_active, force_password_change)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [username, hashedPassword, email || null, 'user', 1, 0]
        );

        await logSystem('INFO', 'AUTH', 'REGISTER', `用户 ${username} 注册成功`, result.id);

        res.status(201).json({
            success: true,
            message: '注册成功',
            data: {
                id: result.id,
                username,
                email: email || null
            }
        });
    } catch (error) {
        logger.error('注册处理错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// GET /api/auth/profile
router.get(
    '/profile',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.PROFILE_VIEW),
    async (req, res) => {
    try {
        const user = await database.get(
            `SELECT id, username, email, role, is_active, last_login, created_at, updated_at
             FROM users
             WHERE id = ?`,
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        res.json({
            success: true,
            data: {
                ...user,
                permissions: authUtils.resolvePermissions(user.role),
                is_active: user.is_active !== 0
            }
        });
    } catch (error) {
        logger.error('获取用户信息错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
    }
);

// GET /api/auth/profile/stats
router.get(
    '/profile/stats',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.PROFILE_VIEW),
    async (req, res) => {
    try {
        const userId = req.user.id;

        const projectStats = await database.get(
            'SELECT COUNT(*) AS total_projects FROM projects WHERE created_by = ?',
            [userId]
        );

        const deploymentStats = await database.get(
            `SELECT
                COUNT(*) AS total_deployments,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS successful_deployments,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_deployments,
                MAX(started_at) AS last_deployment
             FROM deployments
             WHERE created_by = ?`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                total_projects: projectStats?.total_projects || 0,
                total_deployments: deploymentStats?.total_deployments || 0,
                successful_deployments: deploymentStats?.successful_deployments || 0,
                failed_deployments: deploymentStats?.failed_deployments || 0,
                last_deployment: deploymentStats?.last_deployment || null
            }
        });
    } catch (error) {
        logger.error('获取用户统计信息失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
    }
);

// GET /api/auth/profile/activities
router.get(
    '/profile/activities',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.PROFILE_VIEW),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit 必须在 1-50 之间'),
    handleValidationErrors,
    async (req, res) => {
        try {
            const limit = parseInt(req.query.limit || '20', 10);
            const activities = await database.all(
                `SELECT id, operation, message, created_at
                 FROM system_logs
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT ?`,
                [req.user.id, limit]
            );

            res.json({
                success: true,
                data: activities || []
            });
        } catch (error) {
            logger.error('获取用户活动失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// PUT /api/auth/profile
router.put(
    '/profile',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.PROFILE_MANAGE),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('邮箱格式不正确'),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { email } = req.body;
            const userId = req.user.id;

            if (email) {
                const existingEmail = await database.get(
                    'SELECT id FROM users WHERE email = ? AND id != ?',
                    [email, userId]
                );

                if (existingEmail) {
                    return res.status(409).json({
                        success: false,
                        message: '邮箱已被其他用户使用'
                    });
                }
            }

            await database.run(
                'UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [email || null, userId]
            );

            await logSystem('INFO', 'AUTH', 'UPDATE_PROFILE', `用户 ${req.user.username} 更新了个人资料`, userId);

            res.json({
                success: true,
                message: '用户信息更新成功'
            });
        } catch (error) {
            logger.error('更新用户信息错误:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// POST /api/auth/change-password
router.post(
    '/change-password',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.PROFILE_MANAGE),
    body('currentPassword').notEmpty().withMessage('当前密码不能为空'),
    body('newPassword')
        .isLength({ min: 6 }).withMessage('新密码长度至少 8 位')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('新密码必须包含字母和数字'),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.id;

            const user = await database.get('SELECT password FROM users WHERE id = ?', [userId]);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }

            const isValidPassword = await authUtils.comparePassword(currentPassword, user.password);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: '当前密码不正确'
                });
            }
            const passwordMinLength = await getPasswordMinLength();
            if (String(newPassword || '').length < passwordMinLength) {
                return res.status(400).json({
                    success: false,
                    message: `Password must be at least ${passwordMinLength} characters`
                });
            }

            const hashedNewPassword = await authUtils.hashPassword(newPassword);
            await database.run(
                `UPDATE users
                 SET password = ?, force_password_change = 0, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [hashedNewPassword, userId]
            );

            await logSystem('INFO', 'AUTH', 'CHANGE_PASSWORD', `用户 ${req.user.username} 修改了密码`, userId);

            res.json({
                success: true,
                message: '密码修改成功'
            });
        } catch (error) {
            logger.error('修改密码错误:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// POST /api/auth/logout
router.post(
    '/logout',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.PROFILE_VIEW),
    async (req, res) => {
    try {
        await logSystem('INFO', 'AUTH', 'LOGOUT', `用户 ${req.user.username} 登出`, req.user.id);

        res.json({
            success: true,
            message: '登出成功'
        });
    } catch (error) {
        logger.error('登出处理错误:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
    }
);

// GET /api/auth/permissions
router.get(
    '/permissions',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_MANAGE),
    async (req, res) => {
        try {
            const permissionList = Object.values(authUtils.PERMISSIONS);
            const roles = Object.keys(authUtils.ROLE_PERMISSIONS || {}).reduce((acc, roleKey) => {
                acc[roleKey] = authUtils.resolvePermissions(roleKey);
                return acc;
            }, {});
            const settings = await getSystemSettings();
            const roleGroups = normalizeRoleGroupsConfig(settings.role_group_config, Object.keys(roles));

            res.json({
                success: true,
                data: {
                    permissions: permissionList,
                    roles,
                    role_groups: roleGroups
                }
            });
        } catch (error) {
            logger.error('获取角色权限失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// PUT /api/auth/permissions/role-groups
router.put(
    '/permissions/role-groups',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_MANAGE),
    validateRoleGroupsUpdate,
    async (req, res) => {
        try {
            const permissionRoles = Object.keys(authUtils.ROLE_PERMISSIONS || {});
            const normalizedRoleGroups = normalizeRoleGroupsConfig(req.body?.role_groups, permissionRoles);
            const currentSettings = await getSystemSettings();

            const nextSettings = await saveSystemSettings({
                ...currentSettings,
                role_group_config: normalizedRoleGroups
            });

            await logSystem(
                'INFO',
                'AUTH',
                'UPDATE_ROLE_GROUPS',
                `User ${req.user.username} updated role group config`,
                req.user.id
            );

            res.json({
                success: true,
                message: 'Role group configuration updated',
                data: {
                    role_groups: normalizeRoleGroupsConfig(nextSettings.role_group_config, permissionRoles)
                }
            });
        } catch (error) {
            logger.error('Failed to update role groups:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
);

// GET /api/auth/users
router.get(
    '/users',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_VIEW),
    async (req, res) => {
    try {
        const users = await database.all(
            `SELECT id, username, email, role, is_active, last_login, created_at, updated_at
             FROM users
             ORDER BY created_at DESC`
        );

        res.json({
            success: true,
            data: (users || []).map(user => ({
                ...user,
                permissions: authUtils.resolvePermissions(user.role),
                is_active: user.is_active !== 0
            }))
        });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
    }
);

// POST /api/auth/users
router.post(
    '/users',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_MANAGE),
    validateUserCreation,
    async (req, res) => {
        try {
            const {
                username,
                password,
                email,
                role = 'user',
                is_active = true
            } = req.body;

            const existingUser = await database.get('SELECT id FROM users WHERE username = ?', [username]);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: '用户名已存在'
                });
            }

            if (email) {
                const existingEmail = await database.get('SELECT id FROM users WHERE email = ?', [email]);
                if (existingEmail) {
                    return res.status(409).json({
                        success: false,
                        message: '邮箱已被使用'
                    });
                }
            }

            const passwordMinLength = await getPasswordMinLength();
            if (String(password || '').length < passwordMinLength) {
                return res.status(400).json({
                    success: false,
                    message: `Password must be at least ${passwordMinLength} characters`
                });
            }

            const hashedPassword = await authUtils.hashPassword(password);
            const result = await database.run(
                `INSERT INTO users (username, password, email, role, is_active, force_password_change)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [username, hashedPassword, email || null, role, is_active ? 1 : 0, 0]
            );

            await logSystem('INFO', 'AUTH', 'CREATE_USER', `管理员 ${req.user.username} 创建用户 ${username}`, req.user.id);

            res.status(201).json({
                success: true,
                message: '用户创建成功',
                data: {
                    id: result.id,
                    username,
                    email: email || null,
                    role,
                    permissions: authUtils.resolvePermissions(role),
                    is_active: !!is_active
                }
            });
        } catch (error) {
            logger.error('创建用户失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// PUT /api/auth/users/:id
router.put(
    '/users/:id',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_MANAGE),
    validateUserUpdate,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { email, role, password, is_active } = req.body;

            const existingUser = await database.get('SELECT * FROM users WHERE id = ?', [id]);
            if (!existingUser) {
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }

            if (typeof is_active === 'boolean' && !is_active && req.user.id === id) {
                return res.status(400).json({
                    success: false,
                    message: '不能禁用当前登录用户'
                });
            }

            if (email) {
                const existingEmail = await database.get(
                    'SELECT id FROM users WHERE email = ? AND id != ?',
                    [email, id]
                );
                if (existingEmail) {
                    return res.status(409).json({
                        success: false,
                        message: '邮箱已被其他用户使用'
                    });
                }
            }

            const updateFields = [];
            const params = [];

            if (email !== undefined) {
                updateFields.push('email = ?');
                params.push(email || null);
            }
            if (role !== undefined) {
                updateFields.push('role = ?');
                params.push(role);
            }
            if (typeof is_active === 'boolean') {
                updateFields.push('is_active = ?');
                params.push(is_active ? 1 : 0);
            }
            if (password) {
                const passwordMinLength = await getPasswordMinLength();
                if (String(password || '').length < passwordMinLength) {
                    return res.status(400).json({
                        success: false,
                        message: `Password must be at least ${passwordMinLength} characters`
                    });
                }
                const hashedPassword = await authUtils.hashPassword(password);
                updateFields.push('password = ?');
                params.push(hashedPassword);
                updateFields.push('force_password_change = ?');
                params.push(0);
            }

            if (updateFields.length === 0) {
                return res.json({
                    success: true,
                    message: '没有字段需要更新'
                });
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            params.push(id);

            await database.run(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, params);
            await logSystem('INFO', 'AUTH', 'UPDATE_USER', `管理员 ${req.user.username} 更新用户 ${existingUser.username}`, req.user.id);

            res.json({
                success: true,
                message: '用户更新成功'
            });
        } catch (error) {
            logger.error('更新用户失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// DELETE /api/auth/users/:id
router.delete(
    '/users/:id',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_MANAGE),
    validateUserIdParam,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);

            if (req.user.id === id) {
                return res.status(400).json({
                    success: false,
                    message: '不能删除当前登录用户'
                });
            }

            const user = await database.get('SELECT id, username FROM users WHERE id = ?', [id]);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }

            await database.run('DELETE FROM users WHERE id = ?', [id]);
            await logSystem('INFO', 'AUTH', 'DELETE_USER', `管理员 ${req.user.username} 删除用户 ${user.username}`, req.user.id);

            res.json({
                success: true,
                message: '用户删除成功'
            });
        } catch (error) {
            logger.error('删除用户失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

// POST /api/auth/users/:id/reset-password
router.post(
    '/users/:id/reset-password',
    authUtils.authenticateToken,
    authUtils.requirePermission(authUtils.PERMISSIONS.USERS_MANAGE),
    validateUserIdParam,
    body('newPassword')
        .optional({ values: 'falsy' })
        .isLength({ min: 6, max: 128 })
        .withMessage('newPassword length must be between 6 and 128'),
    handleValidationErrors,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const user = await database.get('SELECT id, username FROM users WHERE id = ?', [id]);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: '用户不存在'
                });
            }

            const requestedPassword = String(req.body?.newPassword || '').trim();
            const passwordMinLength = await getPasswordMinLength();
            const resetPassword = requestedPassword || buildTemporaryPassword(Math.max(passwordMinLength + 4, 14));
            if (String(resetPassword || '').length < passwordMinLength) {
                return res.status(400).json({
                    success: false,
                    message: `Password must be at least ${passwordMinLength} characters`
                });
            }
            const hashedPassword = await authUtils.hashPassword(resetPassword);

            await database.run(
                `UPDATE users
                 SET password = ?, force_password_change = 1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [hashedPassword, id]
            );

            await logSystem(
                'WARN',
                'AUTH',
                'RESET_PASSWORD',
                `管理员 ${req.user.username} 重置了用户 ${user.username} 的密码（${requestedPassword ? '指定临时密码' : '系统随机密码'}）`,
                req.user.id
            );

            res.json({
                success: true,
                message: requestedPassword
                    ? '密码重置成功'
                    : '密码已重置并生成随机临时密码，请通过安全渠道通知用户'
            });
        } catch (error) {
            logger.error('重置用户密码失败:', error);
            res.status(500).json({
                success: false,
                message: '服务器内部错误'
            });
        }
    }
);

module.exports = router;



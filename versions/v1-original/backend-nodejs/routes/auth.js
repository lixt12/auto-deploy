const express = require('express');
const { body, validationResult } = require('express-validator');
const authUtils = require('../utils/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 登录验证中间件
const validateLogin = [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '请求数据验证失败',
                errors: errors.array()
            });
        }
        next();
    }
];

// 注册验证中间件
const validateRegister = [
    body('username')
        .notEmpty().withMessage('用户名不能为空')
        .isLength({ min: 3, max: 50 }).withMessage('用户名长度应为3-50个字符')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
    body('password')
        .isLength({ min: 6 }).withMessage('密码长度至少6个字符')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('密码必须包含字母和数字'),
    body('email')
        .optional()
        .isEmail().withMessage('邮箱格式不正确'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: '请求数据验证失败',
                errors: errors.array()
            });
        }
        next();
    }
];

// POST /api/auth/login - 用户登录
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 验证登录
        const user = await authUtils.validateLogin(username, password);
        
        // 生成token
        const token = authUtils.generateToken(user);
        
        res.json({
            success: true,
            message: '登录成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token: token,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });
        
        logger.info(`用户登录成功: ${username}`);
        
    } catch (error) {
        logger.warn(`用户登录失败: ${req.body.username} - ${error.message}`);
        
        res.status(401).json({
            success: false,
            message: '用户名或密码错误'
        });
    }
});

// POST /api/auth/register - 用户注册
router.post('/register', validateRegister, async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        // 注册用户
        const user = await authUtils.registerUser({
            username,
            password,
            email,
            role: 'user'
        });
        
        // 生成token
        const token = authUtils.generateToken(user);
        
        res.status(201).json({
            success: true,
            message: '注册成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                },
                token: token,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });
        
        logger.info(`新用户注册成功: ${username}`);
        
    } catch (error) {
        logger.error(`用户注册失败: ${req.body.username} - ${error.message}`);
        
        let statusCode = 400;
        let message = error.message;
        
        if (error.message.includes('用户名已存在')) {
            statusCode = 409;
        }
        
        res.status(statusCode).json({
            success: false,
            message: message
        });
    }
});

// POST /api/auth/verify - 验证token
router.post('/verify', (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: '缺少访问token'
            });
        }
        
        const user = authUtils.verifyToken(token);
        
        res.json({
            success: true,
            message: 'token有效',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            }
        });
        
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'token无效或已过期'
        });
    }
});

// POST /api/auth/refresh - 刷新token
router.post('/refresh', (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: '缺少访问token'
            });
        }
        
        const user = authUtils.verifyToken(token);
        const newToken = authUtils.generateToken(user);
        
        res.json({
            success: true,
            message: 'token刷新成功',
            data: {
                token: newToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        });
        
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'token无效，无法刷新'
        });
    }
});

// GET /api/auth/profile - 获取用户资料 (需要认证)
router.get('/profile', authUtils.authenticateToken.bind(authUtils), async (req, res) => {
    try {
        const database = require('../config/database');
        
        const user = await database.get(
            'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
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
            data: user
        });
        
    } catch (error) {
        logger.error('获取用户资料失败:', error);
        res.status(500).json({
            success: false,
            message: '获取用户资料失败'
        });
    }
});

// POST /api/auth/logout - 用户登出
router.post('/logout', authUtils.authenticateToken.bind(authUtils), (req, res) => {
    // 在实际应用中，这里可以将token加入黑名单
    // 目前只是返回成功响应
    res.json({
        success: true,
        message: '登出成功'
    });
    
    logger.info(`用户登出: ${req.user.username}`);
});

module.exports = router;

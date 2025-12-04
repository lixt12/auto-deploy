const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const logger = require('./logger');

class AuthUtils {
    // 生成JWT token
    generateToken(user) {
        const payload = {
            id: user.id,
            username: user.username,
            role: user.role
        };
        
        return jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '24h'
        });
    }

    // 验证JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            throw new Error('无效的token');
        }
    }

    // 加密密码
    async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    // 验证密码
    async comparePassword(password, hashedPassword) {
        return bcrypt.compare(password, hashedPassword);
    }

    // 中间件：验证token
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '缺少访问token'
            });
        }

        try {
            const user = this.verifyToken(token);
            req.user = user;
            next();
        } catch (error) {
            logger.warn(`Token验证失败: ${error.message}`);
            return res.status(403).json({
                success: false,
                message: 'token无效或已过期'
            });
        }
    }

    // 中间件：验证管理员权限
    requireAdmin(req, res, next) {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            return res.status(403).json({
                success: false,
                message: '需要管理员权限'
            });
        }
    }

    // 登录验证
    async validateLogin(username, password) {
        try {
            const user = await database.get(
                'SELECT * FROM users WHERE username = ?',
                [username]
            );

            if (!user) {
                throw new Error('用户名不存在');
            }

            const isPasswordValid = await this.comparePassword(password, user.password);
            if (!isPasswordValid) {
                throw new Error('密码错误');
            }

            // 不返回密码
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;

        } catch (error) {
            logger.warn(`登录验证失败: ${username} - ${error.message}`);
            throw error;
        }
    }

    // 注册用户
    async registerUser(userData) {
        const { username, password, email, role = 'user' } = userData;
        
        try {
            // 检查用户是否已存在
            const existingUser = await database.get(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );

            if (existingUser) {
                throw new Error('用户名已存在');
            }

            // 加密密码
            const hashedPassword = await this.hashPassword(password);

            // 创建用户
            const result = await database.run(
                'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, email, role]
            );

            logger.info(`新用户注册: ${username}`);
            return { id: result.id, username, email, role };

        } catch (error) {
            logger.error(`用户注册失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new AuthUtils();

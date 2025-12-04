const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // 确保数据目录存在
            const dataDir = path.dirname(this.dbPath);
            await fs.mkdir(dataDir, { recursive: true });
            
            // 连接数据库
            this.db = new sqlite3.Database(this.dbPath);
            
            // 启用外键约束
            await this.run('PRAGMA foreign_keys = ON');
            
            // 创建表
            await this.createTables();
            
            // 插入初始数据
            await this.insertInitialData();
            
            this.isInitialized = true;
            logger.info(`数据库连接成功: ${this.dbPath}`);
            
        } catch (error) {
            logger.error('数据库初始化失败:', error);
            throw error;
        }
    }

    async createTables() {
        const tables = {
            // 用户表
            users: `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    email TEXT,
                    role TEXT DEFAULT 'user',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `,
            
            // 项目表
            projects: `
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    git_url TEXT,
                    git_branch TEXT DEFAULT 'master',
                    project_path TEXT,
                    build_tool TEXT,
                    build_command TEXT,
                    deploy_path TEXT,
                    auto_deploy BOOLEAN DEFAULT FALSE,
                    health_check_url TEXT,
                    created_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            `,
            
            // 服务器表
            servers: `
                CREATE TABLE IF NOT EXISTS servers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    host TEXT NOT NULL,
                    port INTEGER DEFAULT 22,
                    username TEXT NOT NULL,
                    password TEXT,
                    private_key_path TEXT,
                    description TEXT,
                    connection_status TEXT DEFAULT 'UNKNOWN',
                    last_check_at DATETIME,
                    created_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(host, port),
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            `,
            
            // 部署记录表
            deployments: `
                CREATE TABLE IF NOT EXISTS deployments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    server_id INTEGER NOT NULL,
                    version TEXT,
                    status TEXT DEFAULT 'PENDING',
                    log TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    created_by INTEGER,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
                    FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            `,
            
            // 系统日志表
            system_logs: `
                CREATE TABLE IF NOT EXISTS system_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level TEXT NOT NULL,
                    category TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    target_type TEXT,
                    target_name TEXT,
                    target_id INTEGER,
                    message TEXT NOT NULL,
                    details TEXT,
                    user_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            `
        };

        for (const [tableName, sql] of Object.entries(tables)) {
            await this.run(sql);
            logger.info(`创建表: ${tableName}`);
        }
    }

    async insertInitialData() {
        // 检查是否已有管理员用户
        const adminExists = await this.get('SELECT id FROM users WHERE username = ?', ['admin']);
        
        if (!adminExists) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            
            await this.run(
                'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
                ['admin', hashedPassword, 'admin@example.com', 'admin']
            );
            
            logger.info('创建默认管理员用户: admin/admin123');
        }
    }

    // 封装数据库操作
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    logger.error(`SQL执行错误: ${sql}`, err);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error(`SQL查询错误: ${sql}`, err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error(`SQL查询错误: ${sql}`, err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        logger.error('关闭数据库连接时出错:', err);
                    } else {
                        logger.info('数据库连接已关闭');
                    }
                    resolve();
                });
            });
        }
    }

    isReady() {
        return this.isInitialized && this.db;
    }
}

module.exports = new Database();

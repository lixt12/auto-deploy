const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { encryptSecret } = require('../utils/secretCrypto');

class DatabaseManager {
    constructor() {
        this.SQL = null;
        this.db = null;
        this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/database.sqlite');
        this.isInitialized = false;
        this.saveQueue = Promise.resolve();
        this.deferSaveDepth = 0;
        this.deferredSaveDirty = false;
    }

    async initialize() {
        try {
            this.SQL = await initSqlJs();

            const dataDir = path.dirname(this.dbPath);
            await fs.mkdir(dataDir, { recursive: true });

            let dbBuffer;
            try {
                dbBuffer = await fs.readFile(this.dbPath);
            } catch (error) {
                dbBuffer = null;
            }

            this.db = new this.SQL.Database(dbBuffer);
            this.db.run('PRAGMA foreign_keys = ON');

            await this.createTables();
            await this.runMigrations();
            await this.insertInitialData();
            await this.saveDatabase();

            this.isInitialized = true;
            logger.info(`数据库连接成功: ${this.dbPath}`);
        } catch (error) {
            logger.error('数据库初始化失败:', error);
            throw error;
        }
    }

    async createTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                email TEXT,
                role TEXT DEFAULT 'user',
                is_active INTEGER DEFAULT 1,
                last_login DATETIME,
                force_password_change INTEGER DEFAULT 0,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS projects (
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
            )`,
            `CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER DEFAULT 22,
                username TEXT NOT NULL,
                password TEXT,
                private_key_path TEXT,
                bastion_enabled INTEGER DEFAULT 0,
                bastion_host TEXT,
                bastion_port INTEGER DEFAULT 22,
                bastion_username TEXT,
                bastion_password TEXT,
                bastion_private_key_path TEXT,
                description TEXT,
                connection_status TEXT DEFAULT 'UNKNOWN',
                last_check_at DATETIME,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(host, port),
                FOREIGN KEY (created_by) REFERENCES users (id)
            )`,
            `CREATE TABLE IF NOT EXISTS deployments (
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
            )`,
            `CREATE TABLE IF NOT EXISTS system_logs (
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
            )`,
            `CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS notification_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                settings_json TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS notification_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                recipient TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS server_services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                manager_type TEXT NOT NULL DEFAULT 'systemd',
                check_command TEXT,
                start_command TEXT,
                stop_command TEXT,
                restart_command TEXT,
                monitor_enabled INTEGER DEFAULT 1,
                auto_restart INTEGER DEFAULT 0,
                notify_on_down INTEGER DEFAULT 1,
                status TEXT DEFAULT 'UNKNOWN',
                last_check_at DATETIME,
                last_error TEXT,
                last_notify_at DATETIME,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers (id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users (id),
                UNIQUE(server_id, name)
            )`,
            'CREATE INDEX IF NOT EXISTS idx_deployments_started_at ON deployments(started_at)',
            'CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)',
            'CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by)',
            'CREATE INDEX IF NOT EXISTS idx_servers_created_by ON servers(created_by)',
            'CREATE INDEX IF NOT EXISTS idx_server_services_server_id ON server_services(server_id)',
            'CREATE INDEX IF NOT EXISTS idx_server_services_monitor_enabled ON server_services(monitor_enabled)'
        ];

        for (const sql of tables) {
            this.db.run(sql);
        }
    }

    async runMigrations() {
        await this.ensureUsersColumns();
        await this.ensureServersColumns();
        await this.ensureServersCredentialsEncrypted();
    }

    async ensureUsersColumns() {
        const columns = this.all('PRAGMA table_info(users)');
        const names = new Set(columns.map(column => column.name));

        const migrations = [];
        if (!names.has('is_active')) {
            migrations.push("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
        }
        if (!names.has('last_login')) {
            migrations.push('ALTER TABLE users ADD COLUMN last_login DATETIME');
        }
        if (!names.has('force_password_change')) {
            migrations.push('ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 0');
        }
        if (!names.has('failed_login_attempts')) {
            migrations.push('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0');
        }
        if (!names.has('locked_until')) {
            migrations.push('ALTER TABLE users ADD COLUMN locked_until DATETIME');
        }

        for (const sql of migrations) {
            this.db.run(sql);
            logger.info(`执行数据库迁移: ${sql}`);
        }
    }

    async ensureServersColumns() {
        const columns = this.all('PRAGMA table_info(servers)');
        const names = new Set(columns.map(column => column.name));

        const migrations = [];
        if (!names.has('bastion_enabled')) {
            migrations.push('ALTER TABLE servers ADD COLUMN bastion_enabled INTEGER DEFAULT 0');
        }
        if (!names.has('bastion_host')) {
            migrations.push('ALTER TABLE servers ADD COLUMN bastion_host TEXT');
        }
        if (!names.has('bastion_port')) {
            migrations.push('ALTER TABLE servers ADD COLUMN bastion_port INTEGER DEFAULT 22');
        }
        if (!names.has('bastion_username')) {
            migrations.push('ALTER TABLE servers ADD COLUMN bastion_username TEXT');
        }
        if (!names.has('bastion_password')) {
            migrations.push('ALTER TABLE servers ADD COLUMN bastion_password TEXT');
        }
        if (!names.has('bastion_private_key_path')) {
            migrations.push('ALTER TABLE servers ADD COLUMN bastion_private_key_path TEXT');
        }

        for (const sql of migrations) {
            this.db.run(sql);
            logger.info(`æ‰§è¡Œæ•°æ®åº“è¿ç§»: ${sql}`);
        }
    }

    async ensureServersCredentialsEncrypted() {
        const rows = this.all('SELECT id, password, bastion_password FROM servers');
        if (!rows || rows.length === 0) {
            return;
        }

        let stmt;
        let updatedCount = 0;
        try {
            stmt = this.db.prepare(
                `UPDATE servers
                 SET password = ?, bastion_password = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`
            );

            for (const row of rows) {
                const nextPassword = encryptSecret(row.password);
                const nextBastionPassword = encryptSecret(row.bastion_password);
                if (nextPassword === row.password && nextBastionPassword === row.bastion_password) {
                    continue;
                }

                stmt.run([nextPassword, nextBastionPassword, row.id]);
                stmt.reset();
                updatedCount += 1;
            }
        } finally {
            if (stmt) {
                stmt.free();
            }
        }

        if (updatedCount > 0) {
            logger.info(`Credential migration completed: ${updatedCount} server records encrypted`);
        }
    }

    generateRandomPassword(length = 16) {
        return crypto.randomBytes(length).toString('base64url');
    }

    async insertInitialData() {
        try {
            const stmt = this.db.prepare('SELECT id FROM users WHERE username = ?');
            stmt.bind(['admin']);
            const adminExists = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();

            if (!adminExists) {
                const bcrypt = require('bcryptjs');
                const initialPassword = process.env.DEFAULT_ADMIN_PASSWORD || this.generateRandomPassword();
                const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
                const hashedPassword = await bcrypt.hash(initialPassword, 10);

                const insertStmt = this.db.prepare(
                    `INSERT INTO users (username, password, email, role, is_active, force_password_change)
                     VALUES (?, ?, ?, ?, ?, ?)`
                );
                insertStmt.run([
                    'admin',
                    hashedPassword,
                    adminEmail,
                    'admin',
                    1,
                    process.env.DEFAULT_ADMIN_PASSWORD ? 0 : 1
                ]);
                insertStmt.free();

                logger.warn('已创建默认管理员账号: admin');
                if (process.env.DEFAULT_ADMIN_PASSWORD) {
                    logger.warn('管理员初始密码来自环境变量 DEFAULT_ADMIN_PASSWORD');
                } else {
                    logger.warn(`管理员临时密码: ${initialPassword}，请首次登录后立即修改`);
                }
            }
        } catch (error) {
            logger.error('插入初始数据失败:', error);
        }
    }

    async saveDatabase() {
        if (!this.db) {
            return;
        }

        try {
            const data = this.db.export();
            await fs.writeFile(this.dbPath, data);
        } catch (error) {
            logger.error('保存数据库失败:', error);
            throw error;
        }
    }

    queueSave() {
        this.saveQueue = this.saveQueue
            .then(() => this.saveDatabase())
            .catch(error => {
                logger.error('自动保存数据库失败:', error);
            });
        return this.saveQueue;
    }

    extractWriteMeta() {
        const result = this.db.exec('SELECT last_insert_rowid() AS id, changes() AS changes');
        const row = result?.[0]?.values?.[0];
        return {
            id: row ? row[0] : null,
            changes: row ? row[1] : 0
        };
    }

    async run(sql, params = []) {
        let stmt;
        try {
            stmt = this.db.prepare(sql);
            stmt.run(params);
            const writeMeta = this.extractWriteMeta();
            if (this.deferSaveDepth > 0) {
                this.deferredSaveDirty = true;
            } else {
                await this.queueSave();
            }

            const isInsert = /^\s*INSERT\b/i.test(sql);
            return {
                id: isInsert && writeMeta.changes > 0 ? writeMeta.id : null,
                changes: writeMeta.changes || 0
            };
        } catch (err) {
            logger.error(`SQL执行错误: ${sql}`, err);
            throw err;
        } finally {
            if (stmt) {
                stmt.free();
            }
        }
    }

    get(sql, params = []) {
        let stmt;
        try {
            stmt = this.db.prepare(sql);
            if (params && params.length > 0) {
                stmt.bind(params);
            }
            if (!stmt.step()) {
                return undefined;
            }
            return stmt.getAsObject();
        } catch (err) {
            logger.error(`SQL查询错误: ${sql}`, err);
            throw err;
        } finally {
            if (stmt) {
                stmt.free();
            }
        }
    }

    all(sql, params = []) {
        let stmt;
        try {
            stmt = this.db.prepare(sql);
            if (params && params.length > 0) {
                stmt.bind(params);
            }

            const rows = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            return rows;
        } catch (err) {
            logger.error(`SQL查询错误: ${sql}`, err);
            throw err;
        } finally {
            if (stmt) {
                stmt.free();
            }
        }
    }

    async withDeferredSave(handler) {
        this.deferSaveDepth += 1;
        try {
            return await handler();
        } finally {
            this.deferSaveDepth = Math.max(0, this.deferSaveDepth - 1);
            if (this.deferSaveDepth === 0 && this.deferredSaveDirty) {
                this.deferredSaveDirty = false;
                await this.queueSave();
            }
        }
    }

    async healthCheck() {
        try {
            this.get('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }

    async close() {
        if (this.db) {
            try {
                await this.saveQueue;
                await this.saveDatabase();
                this.db.close();
                logger.info('数据库连接已关闭');
            } catch (err) {
                logger.error('关闭数据库连接时出错:', err);
            }
        }
    }

    isReady() {
        return this.isInitialized && this.db;
    }
}

module.exports = new DatabaseManager();

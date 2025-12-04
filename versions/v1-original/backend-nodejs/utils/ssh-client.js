const { NodeSSH } = require('node-ssh');
const logger = require('./logger');

class SSHClient {
    constructor() {
        this.connections = new Map(); // 连接池
    }

    // 创建SSH连接
    async createConnection(serverConfig) {
        const { host, port = 22, username, password, privateKeyPath } = serverConfig;
        
        const ssh = new NodeSSH();
        const connectionKey = `${host}:${port}:${username}`;

        try {
            const config = {
                host,
                port,
                username,
                readyTimeout: 10000,
                timeout: 10000
            };

            // 根据认证方式设置连接配置
            if (password && password.trim()) {
                config.password = password;
            } else if (privateKeyPath && privateKeyPath.trim()) {
                config.privateKey = privateKeyPath;
            } else {
                throw new Error('未提供有效的认证信息（密码或私钥路径）');
            }

            await ssh.connect(config);
            
            // 缓存连接
            this.connections.set(connectionKey, {
                ssh,
                lastUsed: Date.now(),
                config: serverConfig
            });

            logger.info(`SSH连接创建成功: ${connectionKey}`);
            return ssh;

        } catch (error) {
            logger.error(`SSH连接失败: ${connectionKey} - ${error.message}`);
            throw new Error(`SSH连接失败: ${error.message}`);
        }
    }

    // 获取或创建连接
    async getConnection(serverConfig) {
        const { host, port = 22, username } = serverConfig;
        const connectionKey = `${host}:${port}:${username}`;

        // 检查现有连接
        if (this.connections.has(connectionKey)) {
            const connection = this.connections.get(connectionKey);
            
            // 检查连接是否仍然有效
            if (connection.ssh.isConnected()) {
                connection.lastUsed = Date.now();
                return connection.ssh;
            } else {
                // 连接已断开，清理缓存
                this.connections.delete(connectionKey);
            }
        }

        // 创建新连接
        return this.createConnection(serverConfig);
    }

    // 测试连接
    async testConnection(serverConfig) {
        let ssh = null;
        try {
            ssh = await this.createConnection(serverConfig);
            
            // 执行简单命令测试连接
            const result = await ssh.execCommand('echo "connection test"');
            
            if (result.code === 0) {
                logger.info(`连接测试成功: ${serverConfig.host}:${serverConfig.port}`);
                return true;
            } else {
                logger.warn(`连接测试失败: ${result.stderr}`);
                return false;
            }

        } catch (error) {
            logger.error(`连接测试异常: ${error.message}`);
            return false;
        } finally {
            if (ssh && ssh.isConnected()) {
                ssh.dispose();
            }
        }
    }

    // 执行命令
    async executeCommand(serverConfig, command, options = {}) {
        let ssh = null;
        try {
            ssh = await this.getConnection(serverConfig);
            
            logger.info(`执行命令: ${command} 在 ${serverConfig.host}`);
            const result = await ssh.execCommand(command, {
                cwd: options.workingDirectory,
                timeout: options.timeout || 30000
            });

            return {
                success: result.code === 0,
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.code
            };

        } catch (error) {
            logger.error(`命令执行失败: ${error.message}`);
            return {
                success: false,
                stdout: '',
                stderr: error.message,
                code: -1
            };
        }
    }

    // 上传文件
    async uploadFile(serverConfig, localPath, remotePath) {
        let ssh = null;
        try {
            ssh = await this.getConnection(serverConfig);
            
            await ssh.putFile(localPath, remotePath);
            logger.info(`文件上传成功: ${localPath} -> ${remotePath}`);
            return true;

        } catch (error) {
            logger.error(`文件上传失败: ${error.message}`);
            throw error;
        }
    }

    // 下载文件
    async downloadFile(serverConfig, remotePath, localPath) {
        let ssh = null;
        try {
            ssh = await this.getConnection(serverConfig);
            
            await ssh.getFile(localPath, remotePath);
            logger.info(`文件下载成功: ${remotePath} -> ${localPath}`);
            return true;

        } catch (error) {
            logger.error(`文件下载失败: ${error.message}`);
            throw error;
        }
    }

    // 清理过期连接
    cleanupConnections() {
        const now = Date.now();
        const maxIdleTime = 5 * 60 * 1000; // 5分钟

        for (const [key, connection] of this.connections.entries()) {
            if (now - connection.lastUsed > maxIdleTime) {
                if (connection.ssh.isConnected()) {
                    connection.ssh.dispose();
                }
                this.connections.delete(key);
                logger.info(`清理过期SSH连接: ${key}`);
            }
        }
    }

    // 关闭所有连接
    closeAllConnections() {
        for (const [key, connection] of this.connections.entries()) {
            if (connection.ssh.isConnected()) {
                connection.ssh.dispose();
            }
        }
        this.connections.clear();
        logger.info('已关闭所有SSH连接');
    }
}

// 创建单例实例
const sshClient = new SSHClient();

// 定期清理过期连接
setInterval(() => {
    sshClient.cleanupConnections();
}, 60000); // 每分钟检查一次

// 进程退出时清理连接
process.on('exit', () => {
    sshClient.closeAllConnections();
});

module.exports = sshClient;

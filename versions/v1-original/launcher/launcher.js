#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

// 配置
const CONFIG = {
    projectRoot: path.join(__dirname, '..'),
    backendDir: path.join(__dirname, '..', 'backend-nodejs'),
    frontendDir: path.join(__dirname, '..', 'frontend'),
    electronDir: path.join(__dirname, '..', 'electron'),
    ports: {
        backend: 18088,
        frontend: 3000
    }
};

class AutoDeployLauncher {
    constructor() {
        this.processes = {
            backend: null,
            frontend: null,
            electron: null
        };
        
        // 优雅退出处理
        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
        process.on('exit', () => this.cleanup());
    }

    // 显示启动界面
    showWelcome() {
        console.clear();
        console.log(chalk.cyan.bold('========================================'));
        console.log(chalk.cyan.bold('   🚀 自动化部署系统 - 轻量版启动器'));
        console.log(chalk.cyan.bold('========================================'));
        console.log('');
        console.log(chalk.green('📊 性能提升: 启动速度 10倍+，内存占用减少 70%+'));
        console.log(chalk.green('🔧 技术栈: Node.js + Express + SQLite + React'));
        console.log('');
    }

    // 检查环境
    async checkEnvironment() {
        const spinner = ora('🔍 检查运行环境...').start();
        
        try {
            // 检查Node.js版本 - 使用process.version避免执行外部命令的问题
            const nodeVersion = process.version;
            console.log(chalk.gray(`Node.js版本: ${nodeVersion}`));
            
            // 检查项目文件
            if (!fs.existsSync(CONFIG.backendDir)) {
                throw new Error('后端目录不存在: ' + CONFIG.backendDir);
            }
            
            if (!fs.existsSync(CONFIG.frontendDir)) {
                throw new Error('前端目录不存在: ' + CONFIG.frontendDir);
            }

            // 检查关键文件
            const backendPackage = path.join(CONFIG.backendDir, 'package.json');
            const frontendPackage = path.join(CONFIG.frontendDir, 'package.json');
            
            if (!fs.existsSync(backendPackage)) {
                throw new Error('后端package.json不存在');
            }
            
            if (!fs.existsSync(frontendPackage)) {
                throw new Error('前端package.json不存在');
            }

            spinner.succeed(chalk.green('✅ 环境检查通过'));
            return true;
            
        } catch (error) {
            spinner.fail(chalk.red('❌ 环境检查失败: ' + error.message));
            
            if (error.message.includes('目录不存在')) {
                console.log(chalk.yellow('💡 请确保在正确的项目目录中运行启动器'));
                console.log(chalk.yellow('💡 当前目录: ' + CONFIG.projectRoot));
            }
            
            await this.waitForKey();
            return false;
        }
    }

    // 选择启动模式
    async selectMode() {
        const { mode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'mode',
                message: '请选择启动模式:',
                choices: [
                    { name: '🚀 生产模式 (推荐) - 最佳性能，构建优化', value: 'production' },
                    { name: '🔥 开发模式 - 热重载，开发者工具', value: 'development' },
                    { name: '🛠️  修复模式 - 清理重装，解决问题', value: 'fix' },
                    { name: '🧹 清理缓存 - 仅清理npm缓存', value: 'clean' },
                    { name: '❌ 退出', value: 'exit' }
                ]
            }
        ]);

        return mode;
    }

    // 执行命令并返回Promise
    execCommand(command, cwd = process.cwd()) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    // 检查依赖
    async checkDependencies(dir, name) {
        const nodeModulesPath = path.join(dir, 'node_modules');
        
        if (!fs.existsSync(nodeModulesPath)) {
            const spinner = ora(`📦 安装${name}依赖...`).start();
            
            try {
                await this.execCommand('npm install', dir);
                spinner.succeed(chalk.green(`✅ ${name}依赖安装完成`));
            } catch (error) {
                spinner.fail(chalk.red(`❌ ${name}依赖安装失败`));
                throw error;
            }
        }
    }

    // 生产模式启动
    async startProductionMode() {
        try {
            // 检查并安装依赖
            await this.checkDependencies(CONFIG.backendDir, '后端');
            await this.checkDependencies(CONFIG.frontendDir, '前端');

            // 构建前端
            const buildSpinner = ora('🏗️ 构建前端...').start();
            try {
                await this.execCommand('npm run build', CONFIG.frontendDir);
                buildSpinner.succeed(chalk.green('✅ 前端构建完成'));
            } catch (error) {
                buildSpinner.fail(chalk.red('❌ 前端构建失败'));
                throw error;
            }

            // 启动后端
            console.log(chalk.blue('🚀 启动后端服务...'));
            this.processes.backend = spawn('npm', ['start'], {
                cwd: CONFIG.backendDir,
                stdio: 'pipe'
            });

            this.processes.backend.stdout.on('data', (data) => {
                console.log(chalk.gray('[后端]'), data.toString().trim());
            });

            this.processes.backend.stderr.on('data', (data) => {
                console.error(chalk.red('[后端错误]'), data.toString().trim());
            });

            // 等待后端启动
            await this.waitForBackend();

            // 启动Electron
            console.log(chalk.blue('🎯 启动桌面应用...'));
            this.processes.electron = spawn('npx', ['electron', path.join(CONFIG.electronDir, 'main-nodejs.js')], {
                cwd: CONFIG.frontendDir,
                stdio: 'inherit'
            });

            this.processes.electron.on('close', () => {
                console.log(chalk.yellow('📱 应用已关闭'));
                this.cleanup();
            });

        } catch (error) {
            console.error(chalk.red('❌ 启动失败:'), error.message);
            await this.waitForKey();
        }
    }

    // 开发模式启动
    async startDevelopmentMode() {
        try {
            // 检查并安装依赖
            await this.checkDependencies(CONFIG.backendDir, '后端');
            await this.checkDependencies(CONFIG.frontendDir, '前端');

            // 启动后端
            console.log(chalk.blue('🚀 启动后端服务 (开发模式)...'));
            this.processes.backend = spawn('npm', ['run', 'dev'], {
                cwd: CONFIG.backendDir,
                stdio: 'pipe'
            });

            this.processes.backend.stdout.on('data', (data) => {
                console.log(chalk.gray('[后端]'), data.toString().trim());
            });

            // 等待后端启动
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 启动前端开发服务器
            console.log(chalk.blue('🎨 启动前端开发服务器...'));
            this.processes.frontend = spawn('npm', ['start'], {
                cwd: CONFIG.frontendDir,
                stdio: 'pipe'
            });

            this.processes.frontend.stdout.on('data', (data) => {
                console.log(chalk.gray('[前端]'), data.toString().trim());
            });

            // 等待前端启动
            await new Promise(resolve => setTimeout(resolve, 10000));

            // 启动Electron开发模式
            console.log(chalk.blue('🎯 启动桌面应用 (开发模式)...'));
            this.processes.electron = spawn('npx', ['electron', path.join(CONFIG.electronDir, 'main-dev.js')], {
                cwd: CONFIG.frontendDir,
                stdio: 'inherit'
            });

            this.processes.electron.on('close', () => {
                console.log(chalk.yellow('📱 应用已关闭'));
                this.cleanup();
            });

        } catch (error) {
            console.error(chalk.red('❌ 开发模式启动失败:'), error.message);
            await this.waitForKey();
        }
    }

    // 修复模式
    async startFixMode() {
        console.log(chalk.blue('🛠️ 修复模式启动...'));
        
        // 清理后端
        await this.cleanDirectory(CONFIG.backendDir, '后端');
        
        // 清理前端
        await this.cleanDirectory(CONFIG.frontendDir, '前端');
        
        // 重新安装依赖
        await this.checkDependencies(CONFIG.backendDir, '后端');
        await this.checkDependencies(CONFIG.frontendDir, '前端');
        
        console.log(chalk.green('✅ 修复完成！现在可以选择其他模式启动'));
        await this.waitForKey();
    }

    // 清理目录
    async cleanDirectory(dir, name) {
        const spinner = ora(`🧹 清理${name}...`).start();
        
        try {
            const nodeModulesPath = path.join(dir, 'node_modules');
            const packageLockPath = path.join(dir, 'package-lock.json');
            
            // 使用Node.js原生API清理而不是外部命令
            if (fs.existsSync(nodeModulesPath)) {
                await this.removeDirectory(nodeModulesPath);
            }
            
            if (fs.existsSync(packageLockPath)) {
                fs.unlinkSync(packageLockPath);
            }
            
            // 清理npm缓存 - 在EXE环境中可能需要特殊处理
            try {
                await this.execCommand('npm cache clean --force', dir);
            } catch (error) {
                // 忽略缓存清理错误，不是关键操作
                console.log(chalk.yellow('⚠️ npm缓存清理跳过'));
            }
            
            spinner.succeed(chalk.green(`✅ ${name}清理完成`));
            
        } catch (error) {
            spinner.fail(chalk.red(`❌ ${name}清理失败: ${error.message}`));
        }
    }

    // 递归删除目录
    async removeDirectory(dir) {
        if (fs.existsSync(dir)) {
            const stat = fs.statSync(dir);
            if (stat.isDirectory()) {
                // 使用Node.js 14.14.0+的新API
                if (fs.rmSync) {
                    fs.rmSync(dir, { recursive: true, force: true });
                } else {
                    // 兼容旧版本Node.js
                    this.removeDirectoryRecursive(dir);
                }
            }
        }
    }

    // 递归删除目录（兼容旧版本）
    removeDirectoryRecursive(dir) {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach((file) => {
                const curPath = path.join(dir, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.removeDirectoryRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(dir);
        }
    }

    // 等待后端启动
    async waitForBackend() {
        const spinner = ora('⏳ 等待后端服务启动...').start();
        
        // 使用HTTP请求替代curl命令
        const http = require('http');
        
        for (let i = 0; i < 30; i++) {
            try {
                await this.checkBackendHealth();
                spinner.succeed(chalk.green('✅ 后端服务启动完成'));
                return;
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        spinner.fail(chalk.red('❌ 后端服务启动超时'));
        throw new Error('后端服务启动超时');
    }

    // 检查后端健康状态
    checkBackendHealth() {
        return new Promise((resolve, reject) => {
            const http = require('http');
            const options = {
                hostname: 'localhost',
                port: CONFIG.ports.backend,
                path: '/health',
                method: 'GET',
                timeout: 2000
            };

            const req = http.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`Health check failed: ${res.statusCode}`));
                }
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Health check timeout'));
            });

            req.setTimeout(2000);
            req.end();
        });
    }

    // 等待按键
    waitForKey() {
        return inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '按 Enter 键继续...',
                default: ''
            }
        ]);
    }

    // 清理进程
    cleanup() {
        console.log(chalk.yellow('\n🔄 正在关闭服务...'));
        
        Object.values(this.processes).forEach(process => {
            if (process && !process.killed) {
                process.kill('SIGTERM');
            }
        });
        
        setTimeout(() => {
            Object.values(this.processes).forEach(process => {
                if (process && !process.killed) {
                    process.kill('SIGKILL');
                }
            });
            process.exit(0);
        }, 3000);
    }

    // 主函数
    async run() {
        this.showWelcome();
        
        // 检查环境
        const envOk = await this.checkEnvironment();
        if (!envOk) {
            return;
        }

        while (true) {
            const mode = await this.selectMode();
            
            switch (mode) {
                case 'production':
                    await this.startProductionMode();
                    break;
                
                case 'development':
                    await this.startDevelopmentMode();
                    break;
                
                case 'fix':
                    await this.startFixMode();
                    continue;
                
                case 'clean':
                    try {
                        await this.execCommand('npm cache clean --force');
                        console.log(chalk.green('✅ 缓存清理完成'));
                    } catch (error) {
                        console.log(chalk.yellow('⚠️ npm缓存清理失败，可能需要手动清理'));
                        console.log(chalk.gray('可以尝试: npm cache clean --force'));
                    }
                    await this.waitForKey();
                    continue;
                
                case 'exit':
                default:
                    console.log(chalk.green('👋 再见！'));
                    process.exit(0);
            }
            
            break;
        }
    }
}

// 启动应用
if (require.main === module) {
    const launcher = new AutoDeployLauncher();
    launcher.run().catch(error => {
        console.error(chalk.red('💥 启动器出错:'), error);
        process.exit(1);
    });
}

module.exports = AutoDeployLauncher;


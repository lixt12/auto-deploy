const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// 热重载开发模式
const isDev = true;
let mainWindow;
let javaProcess;
let isBackendReady = false;

// 文件监控
const chokidar = require('chokidar');
let frontendWatcher;
let backendWatcher;

console.log('🔥 热重载开发模式启动');

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false // 开发模式允许跨域
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    title: '🔥 自动化部署系统 - 热重载开发版',
    titleBarStyle: 'default'
  });

  // 显示开发状态页面
  showDevelopmentStatus();

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 自动打开开发者工具
    mainWindow.webContents.openDevTools();
    console.log('✅ 开发窗口已显示');
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
    // 停止文件监控
    stopFileWatchers();
    // 关闭后端进程
    stopBackend();
  });

  // 创建开发菜单
  createDevelopmentMenu();
}

// 显示开发状态页面
function showDevelopmentStatus() {
  const statusHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>🔥 热重载开发环境</title>
      <style>
        body {
          margin: 0;
          padding: 20px;
          font-family: 'Microsoft YaHei', Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
        }
        .container {
          max-width: 1000px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          padding: 20px 0;
        }
        .title {
          font-size: 36px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .subtitle {
          font-size: 18px;
          opacity: 0.9;
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin: 40px 0;
        }
        .status-card {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 20px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.2);
        }
        .card-title {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        .status-ready { background: #4CAF50; }
        .status-loading { background: #FF9800; }
        .status-error { background: #F44336; }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        .info-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .info-list li {
          padding: 5px 0;
          opacity: 0.9;
        }
        .logs {
          background: rgba(0,0,0,0.3);
          border-radius: 10px;
          padding: 20px;
          margin: 20px 0;
          max-height: 300px;
          overflow-y: auto;
          font-family: 'Consolas', monospace;
          font-size: 14px;
        }
        .log-entry {
          margin: 5px 0;
          padding: 2px 0;
        }
        .log-info { color: #2196F3; }
        .log-success { color: #4CAF50; }
        .log-warning { color: #FF9800; }
        .log-error { color: #F44336; }
        .controls {
          text-align: center;
          margin: 20px 0;
        }
        .btn {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 10px 20px;
          margin: 0 10px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        }
        .btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
          margin: 30px 0;
        }
        .feature {
          background: rgba(255,255,255,0.1);
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        .feature-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="title">🔥 热重载开发环境</div>
          <div class="subtitle">Auto Deploy System - Hot Reload Development</div>
        </div>

        <div class="status-grid">
          <div class="status-card">
            <div class="card-title">
              <span class="status-indicator status-loading" id="backend-status"></span>
              🔧 后端服务
            </div>
            <ul class="info-list">
              <li>📍 地址: <span id="backend-url">检测中...</span></li>
              <li>🚀 状态: <span id="backend-state">启动中</span></li>
              <li>🔄 热重启: 已启用</li>
              <li>📊 日志级别: DEBUG</li>
            </ul>
          </div>

          <div class="status-card">
            <div class="card-title">
              <span class="status-indicator status-loading" id="frontend-status"></span>
              🎨 前端服务
            </div>
            <ul class="info-list">
              <li>📍 地址: <span id="frontend-url">检测中...</span></li>
              <li>🚀 状态: <span id="frontend-state">启动中</span></li>
              <li>🔥 热重载: Fast Refresh</li>
              <li>⚡ 构建: Webpack Dev</li>
            </ul>
          </div>

          <div class="status-card">
            <div class="card-title">
              <span class="status-indicator status-ready" id="electron-status"></span>
              🖥️ 桌面应用
            </div>
            <ul class="info-list">
              <li>📍 版本: Electron 开发版</li>
              <li>🚀 状态: <span id="electron-state">运行中</span></li>
              <li>🔧 DevTools: 已开启</li>
              <li>🔄 热重载: 支持</li>
            </ul>
          </div>

          <div class="status-card">
            <div class="card-title">
              <span class="status-indicator status-loading" id="monitor-status"></span>
              🔍 文件监控
            </div>
            <ul class="info-list">
              <li>📁 前端: <span id="frontend-watch">监控中</span></li>
              <li>📁 后端: <span id="backend-watch">监控中</span></li>
              <li>🔄 自动重载: 已启用</li>
              <li>⚡ 响应时间: <1秒</li>
            </ul>
          </div>
        </div>

        <div class="features">
          <div class="feature">
            <div class="feature-icon">⚡</div>
            <div>前端秒级热重载</div>
          </div>
          <div class="feature">
            <div class="feature-icon">🔄</div>
            <div>后端智能重启</div>
          </div>
          <div class="feature">
            <div class="feature-icon">🔧</div>
            <div>开发者工具</div>
          </div>
          <div class="feature">
            <div class="feature-icon">📊</div>
            <div>实时日志监控</div>
          </div>
        </div>

        <div class="logs" id="logs">
          <div class="log-entry log-info">[${new Date().toLocaleTimeString()}] 🔥 热重载开发环境启动中...</div>
          <div class="log-entry log-info">[${new Date().toLocaleTimeString()}] 🔍 初始化文件监控...</div>
          <div class="log-entry log-info">[${new Date().toLocaleTimeString()}] 🚀 准备启动服务...</div>
        </div>

        <div class="controls">
          <button class="btn" onclick="checkServices()">🔍 检查服务</button>
          <button class="btn" onclick="restartBackend()">🔄 重启后端</button>
          <button class="btn" onclick="restartFrontend()">🔄 重启前端</button>
          <button class="btn" onclick="openDevTools()">🔧 开发者工具</button>
          <button class="btn" onclick="loadApp()">🚀 加载应用</button>
        </div>
      </div>

      <script>
        // 状态更新函数
        function updateStatus(service, status, url = null) {
          const indicator = document.getElementById(service + '-status');
          const state = document.getElementById(service + '-state');
          const urlElement = document.getElementById(service + '-url');
          
          if (indicator) {
            indicator.className = 'status-indicator status-' + status;
          }
          
          if (state) {
            state.textContent = status === 'ready' ? '运行中' : 
                               status === 'loading' ? '启动中' : '错误';
          }
          
          if (urlElement && url) {
            urlElement.textContent = url;
          }
        }

        // 添加日志
        function addLog(message, type = 'info') {
          const logs = document.getElementById('logs');
          const logEntry = document.createElement('div');
          logEntry.className = 'log-entry log-' + type;
          logEntry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
          logs.appendChild(logEntry);
          logs.scrollTop = logs.scrollHeight;
        }

        // 控制函数
        function checkServices() {
          addLog('🔍 检查服务状态...', 'info');
          // 检查后端
          fetch('http://localhost:8088/actuator/health')
            .then(response => {
              if (response.ok) {
                updateStatus('backend', 'ready', 'http://localhost:8088');
                addLog('✅ 后端服务正常', 'success');
              } else {
                updateStatus('backend', 'error');
                addLog('❌ 后端服务异常', 'error');
              }
            })
            .catch(() => {
              updateStatus('backend', 'loading');
              addLog('⏳ 后端服务启动中...', 'warning');
            });

          // 检查前端
          fetch('http://localhost:3000')
            .then(response => {
              if (response.ok) {
                updateStatus('frontend', 'ready', 'http://localhost:3000');
                addLog('✅ 前端服务正常', 'success');
              } else {
                updateStatus('frontend', 'error');
                addLog('❌ 前端服务异常', 'error');
              }
            })
            .catch(() => {
              updateStatus('frontend', 'loading');
              addLog('⏳ 前端服务启动中...', 'warning');
            });
        }

        function restartBackend() {
          addLog('🔄 重启后端服务...', 'info');
          updateStatus('backend', 'loading');
          // 发送重启命令到主进程
          if (window.electronAPI) {
            window.electronAPI.restartBackend();
          }
        }

        function restartFrontend() {
          addLog('🔄 重新加载前端...', 'info');
          updateStatus('frontend', 'loading');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }

        function openDevTools() {
          if (window.electronAPI) {
            window.electronAPI.openDevTools();
          }
        }

        function loadApp() {
          addLog('🚀 加载应用界面...', 'info');
          // 检查服务是否就绪
          Promise.all([
            fetch('http://localhost:8088/actuator/health'),
            fetch('http://localhost:3000')
          ]).then(() => {
            addLog('✅ 服务检查完成，加载应用...', 'success');
            window.location.href = 'http://localhost:3000';
          }).catch(() => {
            addLog('❌ 服务未就绪，请等待服务启动完成', 'error');
          });
        }

        // 自动检查服务状态
        setInterval(checkServices, 3000);
        
        // 初始检查
        setTimeout(checkServices, 1000);
      </script>
    </body>
    </html>
  `;

  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(statusHtml));
}

// 创建开发菜单
function createDevelopmentMenu() {
  const template = [
    {
      label: '🔥 热重载',
      submenu: [
        {
          label: '🚀 加载应用',
          accelerator: 'F1',
          click: () => {
            if (isBackendReady) {
              mainWindow.loadURL('http://localhost:3000');
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: '服务未就绪',
                message: '后端服务尚未启动完成，请稍候再试'
              });
            }
          }
        },
        {
          label: '🔄 重新加载前端',
          accelerator: 'F5',
          click: () => mainWindow.reload()
        },
        {
          label: '🔄 强制刷新',
          accelerator: 'Ctrl+F5',
          click: () => mainWindow.webContents.reloadIgnoringCache()
        },
        { type: 'separator' },
        {
          label: '📊 开发状态页',
          accelerator: 'F2',
          click: () => showDevelopmentStatus()
        }
      ]
    },
    {
      label: '🔧 开发工具',
      submenu: [
        {
          label: '🔧 开发者工具',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools()
        },
        {
          label: '🔍 网络面板',
          accelerator: 'Ctrl+Shift+E',
          click: () => {
            mainWindow.webContents.openDevTools();
            mainWindow.webContents.executeJavaScript(`
              DevToolsAPI.showPanel('network');
            `);
          }
        },
        {
          label: '📊 控制台',
          accelerator: 'Ctrl+Shift+J',
          click: () => {
            mainWindow.webContents.openDevTools();
            mainWindow.webContents.executeJavaScript(`
              DevToolsAPI.showPanel('console');
            `);
          }
        },
        { type: 'separator' },
        {
          label: '🔄 重启后端',
          accelerator: 'Ctrl+Shift+R',
          click: () => restartBackend()
        }
      ]
    },
    {
      label: '📁 快速访问',
      submenu: [
        {
          label: '🌐 前端地址',
          click: () => shell.openExternal('http://localhost:3000')
        },
        {
          label: '🔧 后端地址',
          click: () => shell.openExternal('http://localhost:8088')
        },
        {
          label: '📊 Health Check',
          click: () => shell.openExternal('http://localhost:8088/actuator/health')
        },
        {
          label: '📊 H2 控制台',
          click: () => shell.openExternal('http://localhost:8088/h2-console')
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 启动文件监控
function startFileWatchers() {
  // 监控前端文件
  const frontendPath = path.join(__dirname, '../frontend/src');
  frontendWatcher = chokidar.watch(frontendPath, {
    ignored: /node_modules/,
    persistent: true
  });

  frontendWatcher.on('change', (filePath) => {
    console.log(`🔥 前端文件变化: ${filePath}`);
    if (mainWindow) {
      mainWindow.webContents.send('file-changed', {
        type: 'frontend',
        file: filePath
      });
    }
  });

  // 监控后端文件
  const backendPath = path.join(__dirname, '../src/main/java');
  backendWatcher = chokidar.watch(backendPath, {
    ignored: /target/,
    persistent: true
  });

  backendWatcher.on('change', (filePath) => {
    console.log(`🔥 后端文件变化: ${filePath}`);
    if (mainWindow) {
      mainWindow.webContents.send('file-changed', {
        type: 'backend',
        file: filePath
      });
    }
  });
}

// 停止文件监控
function stopFileWatchers() {
  if (frontendWatcher) {
    frontendWatcher.close();
  }
  if (backendWatcher) {
    backendWatcher.close();
  }
}

// 重启后端
function restartBackend() {
  if (javaProcess) {
    javaProcess.kill();
  }
  setTimeout(() => {
    startBackend();
  }, 2000);
}

// 启动后端
function startBackend() {
  const jarPath = path.join(__dirname, '../target/auto-deploy-1.0.0.jar');
  
  javaProcess = spawn('java', [
    '-jar', jarPath,
    '--spring.profiles.active=dev',
    '--spring.devtools.restart.enabled=true',
    '--spring.devtools.livereload.enabled=true',
    '--logging.level.com.sipsg.autodeploy=DEBUG',
    '--server.port=8088'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  javaProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`Backend: ${output}`);
    
    if (output.includes('Started AutoDeployApplication')) {
      isBackendReady = true;
      console.log('✅ 后端服务启动完成');
      if (mainWindow) {
        mainWindow.webContents.send('backend-ready');
      }
    }
  });

  javaProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });
}

// 停止后端
function stopBackend() {
  if (javaProcess) {
    javaProcess.kill();
    javaProcess = null;
  }
}

// 应用事件
app.whenReady().then(() => {
  createWindow();
  startFileWatchers();
  
  // 延迟启动后端，确保前端服务先启动
  setTimeout(() => {
    startBackend();
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopFileWatchers();
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopFileWatchers();
  stopBackend();
});

// IPC 处理
ipcMain.handle('restart-backend', restartBackend);
ipcMain.handle('get-backend-status', () => isBackendReady);

console.log('🔥 热重载开发环境已初始化');

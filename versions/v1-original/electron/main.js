const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn, exec } = require('child_process');
const kill = require('tree-kill');

let mainWindow;
let backendProcess;
let frontendProcess;

// 后端进程管理
function startBackend() {
  return new Promise((resolve, reject) => {
    console.log('启动后端服务...');
    
    if (isDev) {
      // 开发模式：使用Maven启动
      backendProcess = spawn('mvn', ['spring-boot:run'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
    } else {
      // 生产模式：使用打包的jar文件
      const jarPath = path.join(process.resourcesPath, 'backend', 'auto-deploy-1.0.0.jar');
      backendProcess = spawn('java', ['-jar', jarPath], {
        stdio: 'pipe'
      });
    }

    backendProcess.stdout.on('data', (data) => {
      console.log(`后端输出: ${data}`);
      if (data.toString().includes('Started AutoDeployApplication')) {
        console.log('后端服务启动成功');
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`后端错误: ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`后端进程退出，代码: ${code}`);
    });

    backendProcess.on('error', (err) => {
      console.error('后端启动失败:', err);
      reject(err);
    });

    // 30秒超时
    setTimeout(() => {
      reject(new Error('后端启动超时'));
    }, 30000);
  });
}

// 前端进程管理（仅开发模式）
function startFrontend() {
  if (!isDev) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    console.log('启动前端开发服务器...');
    
    frontendProcess = spawn('npm', ['start'], {
      cwd: path.join(process.cwd(), 'frontend'),
      stdio: 'pipe',
      shell: true
    });

    frontendProcess.stdout.on('data', (data) => {
      console.log(`前端输出: ${data}`);
      if (data.toString().includes('webpack compiled') || 
          data.toString().includes('Local:') ||
          data.toString().includes('compiled successfully')) {
        console.log('前端服务启动成功');
        resolve();
      }
    });

    frontendProcess.stderr.on('data', (data) => {
      console.error(`前端错误: ${data}`);
    });

    frontendProcess.on('close', (code) => {
      console.log(`前端进程退出，代码: ${code}`);
    });

    frontendProcess.on('error', (err) => {
      console.error('前端启动失败:', err);
      reject(err);
    });

    // 60秒超时
    setTimeout(() => {
      reject(new Error('前端启动超时'));
    }, 60000);
  });
}

// 停止所有进程
function stopProcesses() {
  return new Promise((resolve) => {
    let processesToKill = 0;
    let processesKilled = 0;

    const checkComplete = () => {
      processesKilled++;
      if (processesKilled >= processesToKill) {
        resolve();
      }
    };

    if (backendProcess) {
      processesToKill++;
      kill(backendProcess.pid, 'SIGTERM', (err) => {
        if (err) console.error('停止后端进程失败:', err);
        else console.log('后端进程已停止');
        checkComplete();
      });
    }

    if (frontendProcess) {
      processesToKill++;
      kill(frontendProcess.pid, 'SIGTERM', (err) => {
        if (err) console.error('停止前端进程失败:', err);
        else console.log('前端进程已停止');
        checkComplete();
      });
    }

    if (processesToKill === 0) {
      resolve();
    }
  });
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false // 允许跨域请求
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    titleBarStyle: 'default'
  });

  // 设置窗口标题
  mainWindow.setTitle('自动化部署系统');

  // 加载应用
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../frontend/build/index.html')}`;
  
  console.log('加载URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 开发模式下打开开发者工具
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 创建菜单
  createMenu();
}

// 创建应用菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '刷新',
          accelerator: 'F5',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: '强制刷新',
          accelerator: 'Ctrl+F5',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '查看',
      submenu: [
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        },
        {
          label: '实际大小',
          accelerator: 'Ctrl+0',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.setZoomLevel(0);
            }
          }
        },
        {
          label: '放大',
          accelerator: 'Ctrl+Plus',
          click: () => {
            if (mainWindow) {
              const currentZoom = mainWindow.webContents.getZoomLevel();
              mainWindow.webContents.setZoomLevel(currentZoom + 0.5);
            }
          }
        },
        {
          label: '缩小',
          accelerator: 'Ctrl+-',
          click: () => {
            if (mainWindow) {
              const currentZoom = mainWindow.webContents.getZoomLevel();
              mainWindow.webContents.setZoomLevel(currentZoom - 0.5);
            }
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '自动化部署系统',
              detail: '版本: 1.0.0\n一个现代化的自动化部署管理系统'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 应用准备就绪
app.whenReady().then(async () => {
  try {
    console.log('应用启动中...');
    
    // 启动后端服务
    await startBackend();
    
    // 启动前端服务（仅开发模式）
    if (isDev) {
      await startFrontend();
    }
    
    // 等待服务启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 创建主窗口
    createWindow();
    
  } catch (error) {
    console.error('应用启动失败:', error);
    dialog.showErrorBox('启动失败', `应用启动失败: ${error.message}`);
    app.quit();
  }
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用激活时
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 应用退出前
app.on('before-quit', async (event) => {
  if (backendProcess || frontendProcess) {
    event.preventDefault();
    console.log('正在停止服务...');
    
    try {
      await stopProcesses();
      console.log('所有服务已停止');
      app.quit();
    } catch (error) {
      console.error('停止服务失败:', error);
      app.quit();
    }
  }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

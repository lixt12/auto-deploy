const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let backendProcess = null;
let mainWindow = null;

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = process.env.BACKEND_PORT || 8088;

function checkBackendHealth() {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, res => {
      const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
      res.resume();
      resolve(!!ok);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const ok = await checkBackendHealth();
    if (ok) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

function startBackendServer() {
  const backendPath = isDev
    ? path.join(__dirname, '../backend/server.js')
    : path.join(process.resourcesPath, 'backend/server.js');

  console.log('启动后端服务器...', backendPath);

  backendProcess = spawn('node', [backendPath], {
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: BACKEND_PORT
    },
    stdio: ['ignore', 'inherit', 'inherit']
  });

  backendProcess.on('error', error => {
    console.error('后端服务器启动失败:', error);
  });

  backendProcess.on('exit', code => {
    console.log(`后端服务器退出，退出码: ${code}`);
    backendProcess = null;
  });
}

function stopBackendServer() {
  if (backendProcess) {
    console.log('停止后端服务器...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    titleBarStyle: 'default'
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIPC() {
  ipcMain.handle('backend:status', async () => ({
    running: backendProcess !== null,
    port: BACKEND_PORT,
    url: `http://127.0.0.1:${BACKEND_PORT}`
  }));

  ipcMain.handle('backend:restart', async () => {
    stopBackendServer();
    await new Promise(resolve => setTimeout(resolve, 800));
    startBackendServer();
    await waitForBackend(12000);
    return true;
  });

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    name: app.getName(),
    isDev
  }));

  ipcMain.handle('app:version', async () => app.getVersion());

  ipcMain.handle('system:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Invalid URL');
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('system:show-item', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
      throw new Error('Invalid path');
    }
    shell.showItemInFolder(targetPath);
    return true;
  });

  ipcMain.handle('dev:open-devtools', async () => {
    if (mainWindow) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    return true;
  });

  ipcMain.handle('dev:toggle-devtools', async () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
    return true;
  });
}

app.whenReady().then(async () => {
  console.log('自动化部署系统启动中...');

  startBackendServer();
  const backendReady = await waitForBackend();
  if (!backendReady) {
    console.warn('后端在预期时间内未完全就绪，界面将继续启动');
  }

  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackendServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackendServer();
});

process.on('SIGINT', () => {
  stopBackendServer();
  app.quit();
});

process.on('SIGTERM', () => {
  stopBackendServer();
  app.quit();
});

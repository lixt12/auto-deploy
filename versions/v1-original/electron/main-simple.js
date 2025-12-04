const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // 允许跨域，方便开发
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    title: '自动化部署系统 - 开发版'
  });

  // 加载前端开发服务器
  mainWindow.loadURL('http://localhost:3000');

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 自动打开开发者工具
    mainWindow.webContents.openDevTools();
  });

  // 窗口关闭时
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 创建菜单
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: '开发',
      submenu: [
        {
          label: '刷新',
          accelerator: 'F5',
          click: () => mainWindow && mainWindow.reload()
        },
        {
          label: '强制刷新',
          accelerator: 'Ctrl+F5',
          click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache()
        },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools()
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '查看',
      submenu: [
        {
          label: '实际大小',
          accelerator: 'Ctrl+0',
          click: () => mainWindow && mainWindow.webContents.setZoomLevel(0)
        },
        {
          label: '放大',
          accelerator: 'Ctrl+Plus',
          click: () => {
            if (mainWindow) {
              const zoom = mainWindow.webContents.getZoomLevel();
              mainWindow.webContents.setZoomLevel(zoom + 0.5);
            }
          }
        },
        {
          label: '缩小',
          accelerator: 'Ctrl+-',
          click: () => {
            if (mainWindow) {
              const zoom = mainWindow.webContents.getZoomLevel();
              mainWindow.webContents.setZoomLevel(zoom - 0.5);
            }
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 应用准备就绪时
app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('Electron开发版启动');
console.log('前端地址: http://localhost:3000');
console.log('后端地址: http://localhost:8088');

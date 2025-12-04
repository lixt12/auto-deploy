const { app, BrowserWindow } = require('electron');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        },
        title: '自动化部署系统 - 开发模式',
        show: false
    });

    // 加载React开发服务器
    mainWindow.loadURL('http://localhost:3000');

    // 自动打开开发者工具
    mainWindow.webContents.openDevTools();

    // 页面加载完成后显示窗口
    mainWindow.webContents.once('did-finish-load', () => {
        console.log('✅ 前端开发界面加载完成');
        mainWindow.show();
    });

    // 处理加载错误
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('❌ 前端加载失败:', errorCode, errorDescription);
        
        if (errorCode === -102) {
            console.log('💡 等待React开发服务器启动...');
            // 3秒后重试
            setTimeout(() => {
                mainWindow.reload();
            }, 3000);
        }
    });
}

// 应用准备就绪时创建窗口
app.whenReady().then(() => {
    createWindow();
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 激活应用时重新创建窗口
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

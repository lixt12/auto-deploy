const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;
let isShuttingDown = false; // 防止循环重启
let restartAttempts = 0; // 重启尝试次数

// 检查端口是否被占用
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

// 查找jar文件
function findJarFile() {
  // 调试信息
  console.log('当前工作目录:', process.cwd());
  console.log('__dirname:', __dirname);
  console.log('process.resourcesPath:', process.resourcesPath);
  
  const possiblePaths = [
    // 打包后的环境 - 优先检查
    path.join(process.resourcesPath, 'backend', 'auto-deploy-1.0.0.jar'),
    // 开发环境
    path.join(process.cwd(), 'target', 'auto-deploy-1.0.0.jar'),
    // 相对于exe的路径
    path.join(path.dirname(process.execPath), 'resources', 'backend', 'auto-deploy-1.0.0.jar'),
    // 其他可能的路径
    path.join(__dirname, '..', 'backend', 'auto-deploy-1.0.0.jar'),
    path.join(__dirname, '..', 'target', 'auto-deploy-1.0.0.jar')
  ];

  console.log('搜索jar文件的路径:', possiblePaths);

  for (const jarPath of possiblePaths) {
    console.log(`检查路径: ${jarPath}`);
    if (fs.existsSync(jarPath)) {
      console.log(`✅ 找到jar文件: ${jarPath}`);
      return jarPath;
    } else {
      console.log(`❌ 文件不存在: ${jarPath}`);
    }
  }
  
  console.error('❌ 未找到jar文件');
  return null;
}

// 启动后端服务
async function startBackend() {
  return new Promise(async (resolve, reject) => {
    const jarPath = findJarFile();
    
    if (!jarPath) {
      reject(new Error('找不到后端jar文件'));
      return;
    }

    console.log('启动后端服务...');
    console.log('JAR路径:', jarPath);
    
    // 检查端口是否可用
    const portAvailable = await isPortAvailable(18088);
    if (!portAvailable) {
      reject(new Error('端口18088已被占用，请关闭其他使用该端口的应用'));
      return;
    }
    console.log('端口18088检查通过');
    
    // 检查Java是否可用 - 尝试多个可能的路径
    let javaPath = 'java';
    const possibleJavaPaths = [
      'java',  // 系统PATH中的java
      'C:\\Program Files\\Java\\jdk1.8.0_xxx\\bin\\java.exe',
      'C:\\Program Files\\Java\\jre1.8.0_xxx\\bin\\java.exe',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-8.0.xxx-hotspot\\bin\\java.exe',
      'C:\\Program Files\\Eclipse Adoptium\\jre-8.0.xxx-hotspot\\bin\\java.exe'
    ];
    
    // 尝试从注册表或环境变量获取Java路径
    try {
      const javaHome = process.env.JAVA_HOME;
      if (javaHome) {
        const javaExe = path.join(javaHome, 'bin', 'java.exe');
        if (fs.existsSync(javaExe)) {
          possibleJavaPaths.unshift(javaExe);
          console.log(`从JAVA_HOME找到Java: ${javaExe}`);
        }
      }
    } catch (error) {
      console.log('无法读取JAVA_HOME环境变量');
    }
    
    let javaFound = false;
    for (const path of possibleJavaPaths) {
      try {
        const javaVersion = require('child_process').execSync(`"${path}" -version`, { 
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        console.log(`✅ Java环境检查通过: ${path}`);
        javaPath = path;
        javaFound = true;
        break;
      } catch (error) {
        console.log(`❌ Java路径无效: ${path}`);
      }
    }
    
    if (!javaFound) {
      console.error('❌ 所有Java路径都无效');
      reject(new Error('Java运行时环境不可用，请确保已安装Java 8或更高版本\n\n建议：\n1. 安装Java 8或更高版本\n2. 将Java添加到系统PATH环境变量\n3. 或者将Java运行时复制到应用目录'));
      return;
    }
    
    // 使用静默模式启动jar
    const javaArgs = [
      '-Xmx512m',  // 限制最大堆内存
      '-Dfile.encoding=UTF-8',
      '-Djava.awt.headless=true',
      '-jar', 
      jarPath,
      '--server.port=18088',
      '--spring.profiles.active=prod',
      '--logging.level.com.sipsg.autodeploy=INFO',
      '--logging.level.org.springframework=WARN',
      '--logging.level.org.apache.catalina=WARN',
      '--spring.jpa.show-sql=false'
    ];
    
    console.log('Java启动参数:', javaArgs);
    
    backendProcess = spawn(javaPath, javaArgs, {
      stdio: ['ignore', 'pipe', 'pipe'], // 静默模式，只捕获输出
      windowsHide: true, // Windows下隐藏控制台窗口
      cwd: path.dirname(jarPath) // 设置工作目录
    });

    let startupTimeout;
    let hasResolved = false;

    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('后端输出:', output);
      
      // 检查启动成功标志
      if (output.includes('Started AutoDeployApplication') && !hasResolved) {
        hasResolved = true;
        clearTimeout(startupTimeout);
        console.log('后端服务启动成功');
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error('后端错误:', data.toString());
    });

    backendProcess.on('close', (code, signal) => {
      console.log(`后端进程退出 - 退出码: ${code}, 信号: ${signal}`);
      
      // 防止循环重启
      if (isShuttingDown) {
        console.log('应用正在关闭，跳过重启');
        return;
      }
      
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(startupTimeout);
        
        let errorMessage = `后端进程异常退出，退出码: ${code}`;
        
        // 解释常见的退出码
        if (code === 3221226505) {
          errorMessage += '\n这通常是由于以下原因：\n1. Java环境问题\n2. 端口18088被占用\n3. JAR文件损坏或不完整';
        } else if (code === 1) {
          errorMessage += '\n应用启动失败，请检查日志';
        }
        
        reject(new Error(errorMessage));
      } else {
        // 如果后端意外退出，显示错误但不重启
        console.error('❌ 后端服务意外退出');
        if (mainWindow && !mainWindow.isDestroyed()) {
          dialog.showErrorBox('后端服务错误', '后端服务意外退出，请重启应用');
        }
      }
    });

    backendProcess.on('error', (error) => {
      console.error('后端进程启动错误:', error);
      if (!hasResolved) {
        hasResolved = true;
        clearTimeout(startupTimeout);
        reject(new Error(`启动后端服务失败: ${error.message}`));
      }
    });

    // 20秒启动超时
    startupTimeout = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        reject(new Error('后端启动超时'));
      }
    }, 20000);
  });
}

// 停止后端服务
function stopBackend() {
  return new Promise((resolve) => {
    if (backendProcess) {
      console.log('正在停止后端服务...');
      
      backendProcess.on('close', () => {
        console.log('后端服务已停止');
        resolve();
      });
      
      // 尝试优雅关闭
      backendProcess.kill('SIGTERM');
      
      // 5秒后强制关闭
      setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          backendProcess.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    } else {
      resolve();
    }
  });
}

// 创建启动画面
function createSplashScreen() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false
    }
  });

  // 创建简单的启动画面HTML
  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: 'Microsoft YaHei', sans-serif;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100vh;
          border-radius: 10px;
        }
        .logo {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .subtitle {
          font-size: 14px;
          opacity: 0.8;
          margin-bottom: 30px;
        }
        .loading {
          width: 200px;
          height: 4px;
          background: rgba(255,255,255,0.3);
          border-radius: 2px;
          overflow: hidden;
        }
        .loading-bar {
          height: 100%;
          background: white;
          border-radius: 2px;
          animation: loading 2s infinite;
        }
        @keyframes loading {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        .status {
          margin-top: 20px;
          font-size: 12px;
          opacity: 0.7;
        }
      </style>
    </head>
    <body>
      <div class="logo">🚀</div>
      <div class="title">自动化部署系统</div>
      <div class="subtitle">Auto Deploy System</div>
      <div class="loading">
        <div class="loading-bar"></div>
      </div>
      <div class="status" id="status">正在启动服务...</div>
      
      <script>
        const statuses = [
          '正在启动服务...',
          '初始化数据库...',
          '加载配置文件...',
          '启动Web服务器...',
          '准备用户界面...'
        ];
        
        let currentIndex = 0;
        setInterval(() => {
          document.getElementById('status').textContent = statuses[currentIndex];
          currentIndex = (currentIndex + 1) % statuses.length;
        }, 1000);
      </script>
    </body>
    </html>
  `;

  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
  return splash;
}

// 创建主窗口
async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      devTools: true, // 启用开发者工具用于调试
      allowRunningInsecureContent: true, // 允许不安全内容
      experimentalFeatures: true
    },
    // icon: path.join(__dirname, 'assets', 'icon.png'), // 暂时禁用图标
    title: '自动化部署系统'
  });

  // 强制打开开发者工具用于调试白屏问题
  mainWindow.webContents.openDevTools();

  // 加载前端页面
  console.log('🔧 当前目录:', __dirname);
  console.log('🔧 应用路径:', app.getAppPath());
  
  // 检测是否在开发环境或热重载模式
  const isDev = !app.isPackaged || process.env.HOT_RELOAD === 'true';
  console.log('🔧 开发环境:', isDev);
  
  let frontendPath;
  
  if (isDev) {
    // 开发环境或热重载模式：优先从开发服务器加载
    if (process.env.HOT_RELOAD === 'true') {
      console.log('🔥 热重载模式：从开发服务器加载');
      try {
        await mainWindow.loadURL('http://localhost:3000');
        console.log('✅ 热重载前端页面加载成功');
        return; // 直接返回，不需要文件路径
      } catch (error) {
        console.log('❌ 开发服务器连接失败，回退到本地文件:', error.message);
      }
    }
    
    // 从项目根目录加载构建文件
    frontendPath = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
    console.log('📂 开发环境前端路径:', frontendPath);
  } else {
    // 生产环境：从app.asar中加载
    // 在打包后，__dirname指向app.asar内部，直接使用相对路径
    frontendPath = path.join(__dirname, 'frontend', 'build', 'index.html');
    console.log('📦 生产环境前端路径:', frontendPath);
    
    // 如果直接路径不存在，尝试绝对路径
    if (!fs.existsSync(frontendPath)) {
      const appPath = app.getAppPath();
      frontendPath = path.join(appPath, 'frontend', 'build', 'index.html');
      console.log('📦 尝试绝对路径:', frontendPath);
    }
  }
  
  if (fs.existsSync(frontendPath)) {
    console.log('✅ 前端文件存在，正在加载...');
    try {
      await mainWindow.loadFile(frontendPath);
      console.log('✅ 前端页面加载成功');
    } catch (error) {
      console.error('❌ 前端页面加载失败:', error);
      // 如果加载失败，尝试加载一个简单的错误页面
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>加载错误</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 50px; text-align: center; }
            .error { color: #d32f2f; }
            .info { color: #1976d2; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1 class="error">前端页面加载失败</h1>
          <p>请尝试重新启动应用</p>
          <div class="info">
            <p>错误信息: ${error.message}</p>
            <p>前端路径: ${frontendPath}</p>
          </div>
        </body>
        </html>
      `;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    }
  } else {
    console.log('❌ 前端文件不存在:', frontendPath);
    // 加载一个提示页面
    const notFoundHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>文件未找到</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 50px; text-align: center; }
          .error { color: #d32f2f; }
          .info { color: #1976d2; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h1 class="error">前端文件未找到</h1>
        <p>请确保前端已正确构建</p>
        <div class="info">
          <p>查找路径: ${frontendPath}</p>
          <p>开发环境: ${isDev}</p>
          <p>应用路径: ${app.getAppPath()}</p>
        </div>
      </body>
      </html>
    `;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(notFoundHtml)}`);
  }

  // 添加页面加载事件监听
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('📄 页面开始加载...');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ 页面加载完成');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('❌ 页面加载失败:');
    console.error('- 错误代码:', errorCode);
    console.error('- 错误描述:', errorDescription);
    console.error('- URL:', validatedURL);
  });

  // 添加控制台消息监听
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`🖥️ 前端控制台 [${level}]:`, message);
  });

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    
    console.log('✅ 主窗口已显示');
  });

  // 添加快捷键打开开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
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
          click: () => mainWindow && mainWindow.reload()
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
              detail: '版本: 1.0.0\n一个现代化的自动化部署管理系统\n\n© 2024 SIPSG'
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 应用启动
app.whenReady().then(async () => {
  console.log('应用启动中...');
  
  // 显示启动画面
  const splash = createSplashScreen();
  
  try {
    // 启动后端服务
    await startBackend();
    
    // 等待一下确保服务完全启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 创建主窗口
    await createMainWindow();
    
    // 主窗口显示后关闭启动画面
    mainWindow.once('ready-to-show', () => {
      splash.close();
    });
    
  } catch (error) {
    console.error('启动失败:', error);
    splash.close();
    
    dialog.showErrorBox('启动失败', `应用启动失败: ${error.message}\n\n请确保：\n1. Java环境已正确安装\n2. 端口18088未被占用\n3. 应用文件完整`);
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
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

// 应用退出前
app.on('before-quit', async (event) => {
  isShuttingDown = true; // 设置关闭标志，防止循环重启
  
  if (backendProcess) {
    event.preventDefault();
    console.log('正在关闭应用...');
    
    try {
      await stopBackend();
      app.quit();
    } catch (error) {
      console.error('关闭后端服务失败:', error);
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


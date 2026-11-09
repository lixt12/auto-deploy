const { contextBridge, ipcRenderer } = require('electron')

// 暴露受保护的方法到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 后端服务管理
  backend: {
    getStatus: () => ipcRenderer.invoke('backend:status'),
    restart: () => ipcRenderer.invoke('backend:restart')
  },

  // 应用信息
  app: {
    getInfo: () => ipcRenderer.invoke('app:info'),
    getVersion: () => ipcRenderer.invoke('app:version')
  },

  // 系统工具
  system: {
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
    showItemInFolder: (path) => ipcRenderer.invoke('system:show-item', path)
  },

  // 开发者工具
  dev: {
    openDevTools: () => ipcRenderer.invoke('dev:open-devtools'),
    toggleDevTools: () => ipcRenderer.invoke('dev:toggle-devtools')
  }
})

// 暴露环境信息
contextBridge.exposeInMainWorld('env', {
  NODE_ENV: process.env.NODE_ENV,
  isDev: process.env.NODE_ENV === 'development',
  platform: process.platform
})

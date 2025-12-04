/**
 * Electron Builder 配置 - 解决代码签名问题
 */
module.exports = {
  appId: "com.sipsg.autodeploy",
  productName: "自动部署系统",
  directories: {
    output: "dist"
  },
  files: [
    "build/**/*",
    "public/electron.js",
    "node_modules/**/*",
    "../target/auto-deploy-*.jar",
    "../src/main/resources/auto-deploy.yml"
  ],
  extraResources: [
    {
      from: "../target",
      to: "backend",
      filter: ["auto-deploy-*.jar"]
    },
    {
      from: "../src/main/resources",
      to: "config",
      filter: ["*.yml", "*.yaml", "*.properties"]
    }
  ],
  win: {
    target: [
      {
        target: "portable", 
        arch: ["x64"]
      }
    ],
    // 完全禁用代码签名和工具下载
    sign: null,
    verifyUpdateCodeSignature: false,
    requestedExecutionLevel: "asInvoker",
    // 禁用可执行文件签名和编辑
    signAndEditExecutable: false
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "自动部署系统"
  },
  portable: {
    artifactName: "自动部署系统-${version}-portable.exe"
  },
  // 禁用所有可能触发代码签名的功能
  forceCodeSigning: false,
  afterSign: null,
  compression: "normal",
  npmRebuild: false,
  buildDependenciesFromSource: false,
  // 禁用 Windows 特定的工具下载
  electronDownload: {
    cache: false
  }
};

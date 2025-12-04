/**
 * 热重载开发版Electron Builder配置
 * 特点：热重载、文件监控、开发工具、实时重启
 */
module.exports = {
  appId: "com.sipsg.autodeploy.hotreload",
  productName: "AutoDeploy-HotReload",
  directories: {
    output: "dist-hotreload"
  },
  files: [
    "build/**/*",
    "../electron/main-hotreload.js",
    "../electron/assets/**/*",
    "node_modules/**/*",
    "!node_modules/chokidar/**/*", // 需要单独处理
    "../target/auto-deploy-*.jar",
    "../src/main/resources/auto-deploy.yml"
  ],
  extraResources: [
    {
      from: "../target/",
      to: "backend/",
      filter: ["auto-deploy-*.jar"]
    },
    {
      from: "../src/main/resources/",
      to: "config/",
      filter: ["auto-deploy.yml", "application.yml"]
    }
  ],
  // 需要单独安装的原生依赖
  beforeBuild: async (context) => {
    // 确保chokidar可以正常工作
    const { execSync } = require('child_process');
    try {
      execSync('npm install chokidar', { cwd: context.appDir });
    } catch (error) {
      console.warn('Warning: Could not install chokidar');
    }
  },
  win: {
    target: [
      {
        target: "portable",
        arch: ["x64"]
      }
    ],
    sign: false,
    verifyUpdateCodeSignature: false,
    forceCodeSigning: false,
    signAndEditExecutable: false,
    // 包含Node.js原生模块
    electronDistDirectory: "node_modules/electron/dist"
  },
  portable: {
    artifactName: "AutoDeploy-HotReload-${version}.exe"
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: "AutoDeploy HotReload",
    artifactName: "AutoDeploy-HotReload-${version}-setup.exe"
  },
  forceCodeSigning: false,
  compression: "store", // 快速打包，不压缩
  npmRebuild: true, // 重新构建原生模块
  buildDependenciesFromSource: false,
  // 包含开发依赖
  includeDevDependencies: true
};

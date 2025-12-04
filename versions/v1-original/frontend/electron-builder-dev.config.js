/**
 * 开发版Electron Builder配置
 * 特点：热重载、开发工具、完整日志
 */
module.exports = {
  appId: "com.sipsg.autodeploy.dev",
  productName: "AutoDeploy-Dev",
  directories: {
    output: "dist-dev"
  },
  files: [
    "build/**/*",
    "../electron/main-simple.js",
    "../electron/assets/**/*",
    "node_modules/**/*",
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
    // 关键：避免修改可执行文件元数据（rcedit），以防在无签名/无 VS 运行库环境下失败
    signAndEditExecutable: false
  },
  portable: {
    artifactName: "AutoDeploy-Dev-${version}-portable.exe"
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: "AutoDeploy Dev",
    artifactName: "AutoDeploy-Dev-${version}-setup.exe"
  },
  forceCodeSigning: false,
  compression: "store", // 快速打包
  npmRebuild: false
};

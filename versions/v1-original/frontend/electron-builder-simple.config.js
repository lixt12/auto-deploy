/**
 * 简单的Electron Builder配置
 */
module.exports = {
  appId: "com.sipsg.autodeploy",
  productName: "自动部署系统",
  directories: {
    output: "dist"
  },
  main: "simple-main.js",
  files: [
    "build/**/*",
    "simple-main.js",
    "node_modules/**/*"
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
      filter: ["*.yml", "*.yaml"]
    }
  ],
  win: {
    target: [
      {
        target: "portable",
        arch: ["x64"]
      }
    ],
    sign: false
  },
  portable: {
    artifactName: "自动部署系统-${version}-portable.exe"
  },
  forceCodeSigning: false
};

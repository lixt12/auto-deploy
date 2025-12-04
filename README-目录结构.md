# 🗂️ Auto-Deploy 项目目录结构

## 📁 项目版本管理

本项目经过多次架构调整和优化，现在采用版本化管理以便对比和选择使用。

**项目根目录**: `D:\IdeaProjects\12\auto-deploy\`

### 📂 versions/ - 版本管理目录

#### 🔧 v1-original/ - 原始复杂架构版本
- **技术栈**: Spring Boot + React + Electron (多技术栈混合)
- **后端**: Java Spring Boot (`src/main/java/`)
- **前端**: React + TypeScript (`frontend/src/`)
- **桌面端**: Electron (`electron/`)
- **独立实验**: Node.js后端 (`backend-nodejs/`)、启动器 (`launcher/`)
- **构建工具**: Maven (Java) + npm/Vite (前端) + Electron Builder

**特点**:
- ✅ 功能完整，技术栈成熟
- ❌ 架构复杂，构建困难
- ❌ 多技术栈维护成本高
- ❌ 打包经常失败

#### 🚀 v2-unified/ - 统一架构版本（推荐）
- **技术栈**: 全栈Node.js + React + Electron (统一技术栈)
- **后端**: Node.js + Express + SQLite
- **前端**: React + TypeScript + Ant Design
- **桌面端**: Electron
- **构建工具**: 统一npm生态系统

**特点**:
- ✅ 架构简洁统一
- ✅ 构建稳定可靠
- ✅ 开发效率高
- ✅ 维护成本低
- ✅ 所有页面功能完整

## 🚀 快速启动

### 推荐使用 v2-unified 版本

```bash
# 进入统一版本目录
cd versions/v2-unified

# 安装依赖
npm install

# 开发模式启动（前后端同时）
npm run dev

# 或分别启动
npm run backend    # 后端服务 http://localhost:8088
npm run frontend   # 前端服务 http://localhost:3000

# Electron桌面应用
npm run electron-dev

# 构建生产版本
npm run build-all

# 打包桌面应用
npm run electron-build
```

### 使用批处理脚本（Windows）

双击运行：
- `启动-v2-统一版本.bat` - 启动推荐版本
- `启动-v1-原始版本.bat` - 启动原始版本（如需要）

## 📊 版本对比

| 特性 | v1-original | v2-unified |
|------|-------------|------------|
| 技术栈 | Java + React + Node.js | 纯Node.js |
| 构建复杂度 | 高 | 低 |
| 维护成本 | 高 | 低 |
| 打包成功率 | 低 | 高 |
| 开发效率 | 低 | 高 |
| 功能完整性 | 完整 | 完整 |
| 推荐度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 💡 建议

- **新项目开发**: 使用 `v2-unified` 版本
- **生产环境部署**: 使用 `v2-unified` 版本
- **学习参考**: 可参考 `v1-original` 版本的技术实现
- **技术迁移**: 从 v1 向 v2 迁移时的参考对比

## 📝 更新日志

- **v2.0** - 2025.09.22: 统一架构重构完成，所有页面功能实现
- **v1.0** - 之前版本: 原始多技术栈实现

---

💡 **提示**: 推荐使用 v2-unified 版本，它提供了更好的开发体验和更稳定的构建过程。

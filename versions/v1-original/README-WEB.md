# v1 Web 版本说明（Java 后端）

本目录已按“网页版 + Java 后端”方式整理，`v2` 不受影响。

## 技术栈

- 后端: Spring Boot (Java 8), H2
- 前端: React (CRA), Ant Design

## 开发模式（推荐）

在 `versions/v1-original` 目录运行：

```bat
start-web-dev.bat
```

启动后：

- 前端: `http://localhost:3000`
- 后端 API: `http://localhost:18088/api`

默认管理员账号：

- 用户名: `admin`
- 密码: `admin123`

## 生产构建（Web）

在 `versions/v1-original` 目录运行：

```bat
build-web.bat
```

该脚本会执行：

1. 构建前端
2. 将前端产物复制到 `src/main/resources/static`
3. 编译 Java 后端并生成运行 classpath

完成后可运行：

```bat
run-backend-web.bat
```

后端通过 `build-output/classes + build-output/classpath.txt` 运行。

## API 基地址配置

前端默认使用：

- 开发: `proxy -> http://localhost:18088`
- 运行时 API: `/api`

如需覆盖，可设置环境变量：

- `REACT_APP_API_BASE_URL`


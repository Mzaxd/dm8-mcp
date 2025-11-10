# 📝 MCP 客户端配置指南

本指南说明如何在各种 MCP 客户端中配置 mcp-dm8-server，支持多种安装和配置方式。

---

## 🎯 三种配置方式

### 方式 1: 使用 npx（推荐 - 无需安装）

适用于已发布到 npm 的包，或使用本地链接。

### 方式 2: 使用本地路径

直接指向项目的 dist 目录。

### 方式 3: 全局安装

安装到全局 node_modules。

---

## 📦 准备工作

### 选项 A: 发布到 npm（公开或私有）

```bash
cd /Users/your-name/software/mcp/mcp-dm8-server

# 1. 确保构建完成
npm run build

# 2. 发布到 npm
npm publish

# 如果是私有包
npm publish --access restricted
```

### 选项 B: 使用 npm link（本地开发）

```bash
cd /Users/your-name/software/mcp/mcp-dm8-server

# 1. 构建项目
npm run build

# 2. 创建全局链接
npm link

# 验证链接
which mcp-dm8
# 应该显示: /usr/local/bin/mcp-dm8
```

### 选项 C: 全局安装（推荐）

```bash
cd /Users/your-name/software/mcp/mcp-dm8-server

# 1. 构建项目
npm run build

# 2. 全局安装
npm install -g .

# 验证安装
mcp-dm8 --version
# 应该显示: mcp-dm8-server v1.1.0
```

---

## 🔧 MCP 客户端配置

### 1. Claude Desktop

**配置文件位置**: `~/Library/Application Support/Claude/claude_desktop_config.json`

#### 方式 1: 使用 npx（无需预安装）

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ]
    }
  }
}
```

#### 方式 2: 使用本地路径

```json
{
  "mcpServers": {
    "dm8": {
      "command": "node",
      "args": [
        "/Users/your-name/software/mcp/mcp-dm8-server/dist/index.js",
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

#### 方式 3: 使用全局安装的命令

```json
{
  "mcpServers": {
    "dm8": {
      "command": "mcp-dm8",
      "args": [
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

#### 方式 4: 混合使用（CLI 参数 + 环境变量）

```json
{
  "mcpServers": {
    "dm8": {
      "command": "mcp-dm8",
      "args": [
        "--host", "127.0.0.1",
        "--port", "5236"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider",
        "DM_USERNAME": "SYSDBA",
        "DM_PASSWORD": "your_password",
        "DM_SCHEMA": "SYSDBA"
      }
    }
  }
}
```

---

### 2. Cline (VSCode Extension)

**配置文件位置**: VSCode Settings → Cline → MCP Settings

```json
{
  "mcpServers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "localhost",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ]
    }
  }
}
```

---

### 3. mcp-router

**配置文件**: `~/.mcp-router/config.json`

```json
{
  "servers": {
    "dm8": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "127.0.0.1",
        "--port", "5236",
        "--username", "SYSDBA",
        "--password", "your_password",
        "--schema", "SYSDBA"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

---

### 4. Zed Editor

**配置文件**: `~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "dm8": {
      "command": {
        "path": "npx",
        "args": [
          "-y",
          "mcp-dm8-server",
          "--host", "127.0.0.1",
          "--port", "5236",
          "--username", "SYSDBA",
          "--password", "your_password",
          "--schema", "SYSDBA"
        ],
        "env": {
          "NODE_OPTIONS": "--openssl-legacy-provider"
        }
      }
    }
  }
}
```

---

## 🔐 安全最佳实践

### 1. 避免在配置文件中明文存储密码

#### 方式 A: 使用环境变量文件

```bash
# 创建 ~/.dm8_credentials
cat > ~/.dm8_credentials << EOF
export DM_USERNAME="SYSDBA"
export DM_PASSWORD="your_secure_password"
export DM_SCHEMA="SYSDBA"
EOF

# 设置权限
chmod 600 ~/.dm8_credentials

# 在 shell 配置中加载（~/.zshrc 或 ~/.bashrc）
source ~/.dm8_credentials
```

然后在 MCP 配置中使用环境变量：

```json
{
  "mcpServers": {
    "dm8": {
      "command": "mcp-dm8",
      "args": [
        "--host", "127.0.0.1",
        "--port", "5236"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

#### 方式 B: 使用 .env 文件

在项目目录创建 `.env` 文件：

```bash
DM_HOST=127.0.0.1
DM_PORT=5236
DM_USERNAME=SYSDBA
DM_PASSWORD=your_secure_password
DM_SCHEMA=SYSDBA
```

然后使用本地路径方式启动：

```json
{
  "mcpServers": {
    "dm8": {
      "command": "node",
      "args": [
        "/Users/your-name/software/mcp/mcp-dm8-server/dist/index.js"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

---

## 🎛️ 配置参数说明

### 必需参数

| 参数 | CLI | 环境变量 | 默认值 | 说明 |
|------|-----|----------|--------|------|
| 主机 | `--host` | `DM_HOST` | 无 | DM8 服务器地址 |
| 端口 | `--port` | `DM_PORT` | 5236 | DM8 服务器端口 |
| 用户名 | `--username` | `DM_USERNAME` | 无 | 数据库用户名 |
| 密码 | `--password` | `DM_PASSWORD` | 无 | 数据库密码 |
| Schema | `--schema` | `DM_SCHEMA` | 无 | 默认 Schema |

### 可选参数

| 参数 | 说明 |
|------|------|
| `--version` | 显示版本号 |

### 环境变量

| 变量 | 说明 |
|------|------|
| `NODE_OPTIONS` | Node.js 选项（Node 18+ 需要 `--openssl-legacy-provider`） |

---

## 🧪 测试配置

### 1. 测试本地安装

```bash
# 测试命令是否可用
mcp-dm8 --version

# 测试连接（会显示配置缺失提示）
mcp-dm8

# 测试完整配置
mcp-dm8 \
  --host 127.0.0.1 \
  --port 5236 \
  --username SYSDBA \
  --password your_password \
  --schema SYSDBA
```

### 2. 测试 npx

```bash
npx -y mcp-dm8-server --version

# 如果是本地链接
npx /Users/your-name/software/mcp/mcp-dm8-server \
  --host 127.0.0.1 \
  --port 5236 \
  --username SYSDBA \
  --password your_password \
  --schema SYSDBA
```

---

## 📋 推荐配置方案

### 开发环境

**推荐**: 本地路径 + `.env` 文件

```json
{
  "mcpServers": {
    "dm8-dev": {
      "command": "node",
      "args": [
        "/Users/your-name/software/mcp/mcp-dm8-server/dist/index.js"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider"
      }
    }
  }
}
```

### 生产环境

**推荐**: npx + CLI 参数（或全局安装）

```json
{
  "mcpServers": {
    "dm8-prod": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-dm8-server",
        "--host", "prod-db.example.com",
        "--port", "5236"
      ],
      "env": {
        "NODE_OPTIONS": "--openssl-legacy-provider",
        "DM_USERNAME": "readonly_user",
        "DM_PASSWORD": "secure_password",
        "DM_SCHEMA": "PRODUCTION"
      }
    }
  }
}
```

---

## 🔄 更新和维护

### 更新全局安装

```bash
cd /Users/your-name/software/mcp/mcp-dm8-server
npm run build
npm install -g .
```

### 更新 npm link

```bash
cd /Users/your-name/software/mcp/mcp-dm8-server
npm run build
# link 会自动使用最新的 dist
```

### 清理旧版本

```bash
# 查看当前安装的版本
npm list -g mcp-dm8-server

# 卸载旧版本
npm uninstall -g mcp-dm8-server

# 重新安装
npm install -g /Users/your-name/software/mcp/mcp-dm8-server
```

---

## 🐛 故障排查

### 问题 1: "command not found: mcp-dm8"

```bash
# 检查是否已全局安装
npm list -g mcp-dm8-server

# 检查 PATH
echo $PATH

# 重新链接
npm link
```

### 问题 2: npx 找不到包

```bash
# 使用完整路径
npx /Users/your-name/software/mcp/mcp-dm8-server

# 或者先发布到 npm
npm publish
```

### 问题 3: Node 18+ OpenSSL 错误

确保配置中包含：

```json
"env": {
  "NODE_OPTIONS": "--openssl-legacy-provider"
}
```

### 问题 4: "缺少数据库配置" 警告

确保通过 CLI 参数或环境变量传递了所有必需配置：
- `--username` 或 `DM_USERNAME`
- `--password` 或 `DM_PASSWORD`
- `--host` 或 `DM_HOST`
- `--schema` 或 `DM_SCHEMA`

---

## 💡 最佳实践总结

1. ✅ **使用 npm link 或全局安装**进行本地开发
2. ✅ **使用 npx** 进行无安装运行（需要发布到 npm）
3. ✅ **通过 CLI 参数传递敏感信息**（避免环境变量泄露）
4. ✅ **使用只读用户**连接数据库
5. ✅ **定期更新**到最新版本

---

## 📚 相关文档

- [README.md](./README.md) - 项目说明
- [SECURITY_ANALYSIS_REPORT.md](./SECURITY_ANALYSIS_REPORT.md) - 安全分析
- [README_SECURITY_FIXES.md](./README_SECURITY_FIXES.md) - 安全修复

---

**更新时间**: 2025-11-10  
**版本**: 1.1.0


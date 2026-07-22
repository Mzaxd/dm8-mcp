<!-- Generated: 2026-02-26 | Updated: 2026-07-22 -->

# mcp-dm8-server

## Purpose
TypeScript 版达梦 DM8 Model Context Protocol (MCP) 服务器，为 MCP 客户端（如 Claude Desktop、mcp-router、mcp-use）提供数据库只读访问能力。

## Key Files

| File | Description |
|------|-------------|
| `package.json` | 项目配置，定义依赖和构建脚本 |
| `tsconfig.json` | TypeScript 编译配置 |
| `README.md` | 用户文档和配置指南 |
| `CLAUDE.md` | AI 代理开发指南 |
| `.mcp.json` | MCP 服务器配置 |
| `start-dm8.sh` | Node.js 18+ 兼容启动脚本（`--openssl-legacy-provider`） |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | 源代码目录 (见 `src/AGENTS.md`) |
| `tests/` | 测试用例 (见 `tests/AGENTS.md`) |
| `dist/` | 编译输出目录 (自动生成) |

## For AI Agents

### Working In This Directory
- 使用 `npm run build` 构建项目
- 使用 `npm run dev` 进行开发模式 (tsx watch)
- 使用 `npm test` 运行测试
- Node.js 18+ 需要 `--openssl-legacy-provider` 参数

### Testing Requirements
- 运行 `npm test` 确保所有测试通过
- 测试框架使用 Vitest
- 新增功能需要添加相应测试

### Common Patterns
- ESM 模块格式 (`"type": "module"`)
- 使用 Zod 进行输入验证
- 配置优先级: CLI 参数 > 运行时覆盖 > 环境变量 > 配置文件

## Dependencies

### Internal
- `src/` - 所有源代码模块

### External
- `@modelcontextprotocol/sdk` - MCP 协议 SDK
- `dmdb` - 达梦数据库原生驱动
- `zod` - 运行时类型验证
- `yargs` / `yargs-parser` - CLI 参数解析
- `dotenv` - 环境变量加载

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client                               │
│         (Claude Desktop / mcp-router / mcp-use)              │
└─────────────────────────────────────────────────────────────┘
                              │ stdio
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (src/)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ list_tables │  │describe_table│  │execute_query│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │               │               │                    │
│         └───────────────┼───────────────┘                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────┐            │
│  │              Utils Layer                     │            │
│  │ db.ts · connectionPool.ts · targetResolver.ts│            │
│  │ validation.ts · explainHelper.ts             │            │
│  └─────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   DM8 Database                               │
│                    (dmdb driver)                             │
└─────────────────────────────────────────────────────────────┘
```

## Security Features
- SQL 注入防护（标识符验证）
- 只读查询强制（仅 SELECT/SHOW/DESCRIBE/EXPLAIN）
- Schema 白名单校验
- 数据库凭据 URL 编码

<!-- MANUAL: -->

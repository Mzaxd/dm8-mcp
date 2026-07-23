# 安全说明

本文件说明 `mcp-dm8-server` 的只读防护模型、已知局限，以及部署侧必须落实的纵深防御。

## 威胁模型

MCP server 把数据库暴露给 LLM，LLM 可能生成任意 SQL。核心目标：**`execute_query` 永远只读，且无法被绕过执行写 / DDL / 会话级破坏**。

## 应用层防护（assertReadOnlyQuery）

位置：`src/utils/validation.ts`

1. **前缀白名单**：trim + toUpperCase 后，必须以 `SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN` 开头。
2. **分号拦截**：`/;\s*\S/` 禁止分号后跟非空白字符，堵多语句注入。

## 对照 Datadog 披露的官方 Postgres MCP 漏洞

2025 年 Datadog 安全实验室披露 Anthropic 官方 `server-postgres` 的只读绕过漏洞（[分析原文](https://securitylabs.datadoghq.com/articles/mcp-vulnerability-case-study-SQL-injection-in-the-postgresql-mcp-server/)）。两类攻击向量与本项目的对照：

### 向量 1：多语句注入 `COMMIT; DROP...`

官方当初用 `BEGIN READ ONLY` 事务隔离，被 `COMMIT; <写操作>` 提前结束事务后注入。

本项目**不依赖事务隔离**，在字符串层拦截：

| Payload | 结论 |
|---------|------|
| `SELECT 1; DROP TABLE x` | 分号后有 `D`，拦截 ✅ |
| `COMMIT; ...` | `COMMIT` 不在白名单前缀，拦截 ✅ |
| `/* */SELECT 1` | trim 后首字符 `/` 不匹配前缀，拦截 ✅ |
| `SELECT 1; -- c\nDROP TABLE x` | 分号后有 `-`，拦截 ✅ |

### 向量 2：会话污染 `SET statement_timeout`

官方当初 `SET` 会话变量后连接归还池，污染下一个用户。

本项目：`SET` 不在白名单前缀，应用层拦截 ✅。但需注意——连接池 `testOnBorrow` 仅做 `SELECT 1` 探活，**不重置会话状态**。当前因 `SET` 被前缀检查挡住而无攻击面；这属于"单点防护"，必须配合下方的 DB 层权限兜底。

## 固有局限（重要）

`assertReadOnlyQuery` 是**纯字符串前缀检查**，无法防御"以 `SELECT` 开头但语义有副作用"的语句。若 DM8 未来出现 `SELECT` 开头却可建表/写数据的方言，字符串检查会放行。

曾尝试用 `connection.getStatementInfo()` 做权威只读判定，但 dmdb 1.0.52452 存在 statement handle 泄漏（累积触发 `[160]`），已回退到字符串检查，详见 `validation.ts` 注释与 commit `f89b22c`。

**结论：字符串检查是第一道闸，不能是唯一一道。**

## Defense-in-depth：DB 账号最小权限（部署必须）

应用层防护之外，**必须**给 MCP 使用的数据库账号设置只读权限：

- 创建专用账号，仅 `GRANT SELECT` 需要查询的表 / 视图；
- 禁止 `INSERT/UPDATE/DELETE` 及任何 DDL（`CREATE/ALTER/DROP/TRUNCATE`）；
- 禁止授予 `DBA` / `RESOURCE` 等含写权限的角色；
- 生产库优先使用只读备库或 DM8 的只读用户。

即使应用层字符串检查被绕过，DB 层权限也会兜底拒绝写操作。这是 Datadog 强调的核心结论："经典的数据库权限控制对 MCP 同样适用，且是最后一道闸。"

## 其他安全特性

| 特性 | 实现 |
|------|------|
| 标识符校验 | `normalizeIdentifier`：`/^[A-Za-z_][A-Za-z0-9_]*$/`，防 `schema`/`table` 参数注入 |
| 参数化查询 | 所有用户输入走绑定参数（`:owner`、`:table`），不拼 SQL |
| Schema 白名单 | `validateSchemaAccess` 限制可访问 schema 范围 |
| 凭据 URL 编码 | 连接串中密码 `encodeURIComponent` |
| 配置文件忽略 | `.claude/dm8-mcp.json` 已加入 `.gitignore` |
| 查询超时 | 见 P1b：连接级 `socketTimeout`，防止恶意慢查询 |

## 报告漏洞

请开 GitHub Issue 或直接提 PR。

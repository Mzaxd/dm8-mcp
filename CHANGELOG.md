# Changelog

## 2.0.0 — 2026-07-31

> 中英双语 / Bilingual（中文 ↓ English below）

---

### 🇨🇳 中文

2.0 是一个 **breaking change** 版本，聚焦修复「多连接、跨 schema 场景下 LLM 容易查错库」的顽疾。基于对 60+ 真实对话记录的取证，定位到 `defaultConnection` 静默回落与 schema 弱标识是根因，重构了连接选择与错误引导。

#### ⚠️ Breaking Changes

- **移除 `defaultConnection` / `connection.default` 配置项**：多连接场景下「默认连接」会让 LLM 在 dev/uat/prod 之间静默查错库（同名 schema 跨连接时尤甚）。多连接模式下未显式传 `connection` 时，改为报错并返回连接目录，不再静默回落。
- **移除 CLI `--default-connection` 与环境变量 `DM_DEFAULT_CONNECTION`**：同上。旧配置文件里的相关字段会被静默忽略，不会报错。

**迁移**：让 LLM 显式传 `connection` 参数（错误响应会给出每个连接的说明、可访问 schema 与正确调用示例）。单连接模式行为不变（自动选中唯一连接）。

#### ✨ 新特性

- **连接级 `description` 字段**：每个连接可标注环境（如「开发环境」「生产环境，慎用」），出现在 `list_schemas` 输出与所有错误引导文案中，让 LLM 一眼区分 dev/uat/prod。
- **`list_schemas` 重构为「连接目录」**：以连接为第一公民，新增 `ambiguousSchemas` 警告段，显式标出哪些同名 schema 跨多个连接（如 `CUSTOMER → dev-GAS, uat-GAS93, prod-CUSTOMER`），提示 LLM 这类 schema 必须显式传 `connection`。
- **错误响应 prompt-engineering**：schema 多匹配 / schema 不在白名单 / 多连接裸调 / 连接名不存在 四种场景，统一返回「可用连接目录 + 正确调用示例」的引导文案，遵循 Anthropic《Writing effective tools for agents》建议。
- **`execute_query` 新增 `queriedSchemas` 元数据**：从 SQL 的 `FROM`/`JOIN` 子句解析实际触达的 schema，与 `schema`（会话默认）分离，根治「SQL 全限定跨 schema 查询时元数据错位」问题。

#### 🔒 安全

- **`list_schemas` 凭据保护**：返回的连接目录剔除 `password` 字段，杜绝凭据经 MCP 暴露给 client/LLM。新增回归测试守住。

#### 🧪 质量

- 新增 `tests/listSchemas.test.ts`、`tests/queriedSchemas.test.ts`；`targetResolver.test.ts` 重写覆盖新的连接选择逻辑。11 个测试文件 / 76 tests 全绿；lint、build 通过。

---

### 🇬🇧 English

2.0 is a **breaking change** release focused on fixing the long-standing issue of LLMs silently querying the wrong database in multi-connection, cross-schema scenarios. Based on evidence from 60+ real conversation logs, the root cause was identified as silent fallback to `defaultConnection` combined with schema being a weak identifier. Connection selection and error guidance have been redesigned.

#### ⚠️ Breaking Changes

- **Removed `defaultConnection` / `connection.default` config options**: a "default connection" lets the LLM silently query the wrong database when comparing dev/uat/prod (especially with same-name schemas across connections). In multi-connection mode, omitting `connection` now raises an error with a connection catalog instead of falling back.
- **Removed CLI `--default-connection` and env var `DM_DEFAULT_CONNECTION`**: same rationale. Legacy fields in existing config files are silently ignored (no error).

**Migration**: have the LLM pass `connection` explicitly (error responses include each connection's description, accessible schemas, and a correct call example). Single-connection mode is unchanged.

#### ✨ Features

- **Per-connection `description` field**: annotate each connection's environment (e.g. "Dev", "Production — use with caution"). Shown in `list_schemas` output and all error guides so the LLM can tell dev/uat/prod apart at a glance.
- **`list_schemas` redesigned as a connection catalog**: connection-first layout with a new `ambiguousSchemas` section that flags same-name schemas spanning multiple connections (e.g. `CUSTOMER → dev-GAS, uat-GAS93, prod-CUSTOMER`), signaling the LLM must pass `connection` explicitly for them.
- **Prompt-engineered error responses**: schema multi-match / schema not in whitelist / bare multi-connection call / unknown connection name all return a unified guide with the connection catalog and a correct call example, following Anthropic's *Writing effective tools for agents*.
- **`execute_query` `queriedSchemas` metadata**: parses schemas actually touched by the SQL's `FROM`/`JOIN` clauses, separated from `schema` (session default), fixing metadata drift on cross-schema queries via fully-qualified `SCHEMA.TABLE`.

#### 🔒 Security

- **`list_schemas` credential protection**: the returned connection catalog now strips the `password` field, preventing credentials from leaking to clients/LLMs via MCP. Guarded by a regression test.

#### 🧪 Quality

- Added `tests/listSchemas.test.ts`, `tests/queriedSchemas.test.ts`; rewrote `targetResolver.test.ts` to cover the new selection logic. 11 test files / 76 tests all green; lint and build pass.

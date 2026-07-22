<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-26 | Updated: 2026-07-22 -->

# utils

## Purpose
底层工具函数库：dmdb 连接池管理、多连接/schema 目标解析、输入验证、EXPLAIN 语句改写。

## Key Files

| File | Description |
|------|-------------|
| `db.ts` | `withDmConnection` 借还连接包装器、连接池统计 |
| `connectionPool.ts` | dmdb `Pool` 单例，按 `connectionName::schema` 缓存池，支持主备 fallback |
| `targetResolver.ts` | `resolveTargetConnection` 根据 connection/schema 解析目标连接与白名单校验 |
| `validation.ts` | 标识符规范化、SQL 注入防护、只读查询检查、schema 白名单校验 |
| `explainHelper.ts` | `EXPLAIN` → `EXPLAIN FOR` 改写（让 JDBC 能拿到执行计划） |

## Subdirectories

无子目录。

## For AI Agents

### Working In This Directory
- 所有数据库操作必须通过 `withDmConnection(target, handler)` 包装器
- 连接由 dmdb `Pool` 管理：`handler` 结束后自动归还（`connection.close()` 是归还池，非真关），并行查询互不阻塞
- schema 由 dmdb 驱动在连接建立时通过 connectString 的 `?schema=` 自动 `SET SCHEMA`，**无需手动 SET**
- 验证失败抛出 `ValidationError`

### Testing Requirements
- `connectionPool.test.ts` / `validation.test.ts` / `targetResolver.test.ts` / `explainHelper.test.ts`
- 测试 mock `dmdb`（含 `createPool`）与 `config.js`
- 验证 SQL 注入防护与连接池缓存行为

### Common Patterns
```typescript
// 数据库查询模式（必传 target）
import { withDmConnection } from './db.js';
import { resolveTargetConnection } from './targetResolver.js';

const target = resolveTargetConnection({ connection, schema });
const rows = await withDmConnection(target, async (connection) => {
  return connection.execute<Row>(sql, params);
});

// 验证模式
import { normalizeIdentifier, assertReadOnlyQuery, ValidationError } from './validation.js';

const normalized = normalizeIdentifier(rawInput);  // 可能抛出 ValidationError
assertReadOnlyQuery(userSQL);  // 仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN
```

## Dependencies

### Internal
- `../config.js` - 连接配置、`getConnectionByName`

### External
- `dmdb` - 达梦数据库驱动（`createPool` / `Pool` / `Connection`）

## Module Details

### db.ts
```typescript
export interface DmConnectionTarget { connectionName: string; schema: string }

// 从 dmdb Pool 借连接执行 handler，结束后归还池
export async function withDmConnection<T>(
  target: DmConnectionTarget,
  handler: (connection: Connection) => Promise<T>
): Promise<T>

export async function closeAllConnections(): Promise<void>  // graceful shutdown 用
export function getPoolStats(): PoolStats
```

### connectionPool.ts
```typescript
export interface PoolStats { totalConnections: number; schemas: string[]; lastAccessTime: Record<string, Date> }

class ConnectionPool {
  getOrCreatePool(connectionName: string, schema: string): Promise<Pool>  // 不存在则建池（含主备 fallback）
  closeConnection(connectionName: string, schema: string): Promise<void>
  closeAll(): Promise<void>
  getStats(): PoolStats
  hasConnection(connectionName: string, schema?: string): boolean
}
export const connectionPool: ConnectionPool
// 池参数（env 覆盖）：DM_POOL_MAX=5 / DM_POOL_MIN=1 / DM_POOL_TIMEOUT=60
// testOnBorrow=true，借出前自动探活，替代手动 SELECT 1
```

### targetResolver.ts
```typescript
export function resolveTargetConnection(input: { connection?: string; schema?: string }): ResolvedTarget
// 解析优先级：显式 connection > schema 匹配 > 默认连接；校验 schema 白名单
```

### validation.ts
```typescript
export class ValidationError extends Error
export function normalizeIdentifier(raw: string): string   // 仅 [A-Za-z_][A-Za-z0-9_]*，转大写
export function assertReadOnlyQuery(query: string): void   // SELECT/SHOW/DESCRIBE/EXPLAIN
export function validateSchemaAccess(schema: string, allowedSchemas: string[]): void
```

### explainHelper.ts
```typescript
export function isExplainStatement(sql: string): boolean
export function rewriteExplain(sql: string): string  // EXPLAIN <sql> → EXPLAIN FOR <sql>
```

## Security Features

| 功能 | 实现位置 |
|------|----------|
| SQL 注入防护 | `validation.ts` - `normalizeIdentifier()` |
| 只读强制 | `validation.ts` - `assertReadOnlyQuery()` |
| Schema 白名单 | `validation.ts` / `targetResolver.ts` |
| 凭据 URL 编码 | `connectionPool.ts` - `encodeURIComponent` |

<!-- MANUAL: -->

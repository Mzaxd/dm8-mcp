<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-26 | Updated: 2026-07-22 -->

# tests

## Purpose
项目测试目录，使用 Vitest 验证核心功能的正确性与安全性。当前 5 个测试文件、33 个用例（`npm test` 全绿）。

## Key Files

| File | Tests | 覆盖点 |
|------|-------|--------|
| `validation.test.ts` | 4 | `normalizeIdentifier` 标识符规范化、`assertReadOnlyQuery` 只读检查 |
| `explainHelper.test.ts` | 10 | `isExplainStatement` 识别、`rewriteExplain` 改写（大小写/空白/去重 FOR） |
| `targetResolver.test.ts` | 3 | 多连接目标解析：默认连接、schema 推断、多匹配报错 |
| `connectionPool.test.ts` | 8 | dmdb Pool 缓存、`db` 模块导出、统计与关闭 |
| `configFile.test.ts` | 8 | 配置文件加载、环境切换、CLI 覆盖、主备/默认连接解析 |

## Subdirectories

无子目录。

## For AI Agents

### Working In This Directory
- 测试框架：Vitest（无配置文件，使用默认配置）
- 运行命令：`npm test` 或 `npm run test:watch`
- 覆盖率：`npm run test:coverage`
- 测试文件命名：`*.test.ts`，与 `src/` 结构对应
- 测试通过 `vi.mock` mock `dmdb`（含 `createPool`）与 `config.js`

### Testing Requirements
- 新增工具函数应添加对应测试
- 覆盖正常流程和边界情况
- 验证安全相关功能（SQL 注入防护等）

### Common Patterns
```typescript
import { describe, expect, it, vi } from 'vitest';
import { functionToTest } from '../src/utils/module.js';

// mock 外部依赖（dmdb 驱动、config）
vi.mock('dmdb', () => ({ default: { createPool: vi.fn(), /* ... */ } }));
vi.mock('../src/config.js', () => ({ getConnectionByName: () => ({ /* ... */ }) }));

describe('functionToTest', () => {
  it('should handle normal input', () => {
    expect(functionToTest('input')).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => functionToTest('bad')).toThrowError();
  });
});
```

## Dependencies

### Internal（被测模块）
- `../src/utils/validation.js`
- `../src/utils/explainHelper.js`
- `../src/utils/targetResolver.js`
- `../src/utils/connectionPool.js` / `db.js`
- `../src/config.js`

### External
- `vitest` - 测试框架 (describe, it, expect, vi)

## Test Coverage

### validation.test.ts
| 用例 | 描述 |
|------|------|
| `should uppercase valid identifiers` | 合法标识符自动转大写 |
| `should throw on invalid identifiers` | 非法字符抛出错误 |
| `accepts SELECT statements` | SELECT 语句通过 |
| `rejects UPDATE statements` | UPDATE 语句被拒绝 |

### explainHelper.test.ts
| 用例 | 描述 |
|------|------|
| `detects EXPLAIN prefix` / `detects explain (lowercase)` | 识别 EXPLAIN 前缀（大小写） |
| `detects EXPLAIN FOR` / `rejects non-EXPLAIN` / `rejects embedded mid-string` | 边界识别 |
| `inserts FOR after EXPLAIN` / `keeps EXPLAIN FOR unchanged` | 改写正确性 |
| `works case-insensitively` / `normalizes whitespace` / `does not double-insert FOR` | 大小写/空白/去重 |

### targetResolver.test.ts
| 用例 | 描述 |
|------|------|
| `uses the configured default connection when no parameters are provided` | 无参数时用默认连接 |
| `infers the connection from a unique schema` | schema 唯一匹配时推断连接 |
| `rejects schemas that match multiple connections` | schema 多匹配时报错 |

### connectionPool.test.ts
| 用例 | 描述 |
|------|------|
| `should create connection pool module without errors` | 模块加载 |
| `should return empty stats initially` | 初始统计为空 |
| `should report no connection for unknown schema` | 未知连接判定 |
| `should close all connections without error` | 全量关闭 |
| `should cache one pool per connection::schema key` | **Pool 缓存**：同 key 只建一个 Pool，connectString 含 `?schema=` |
| `should export withDmConnection/closeAllConnections/getPoolStats` | `db` 模块导出契约 |

### configFile.test.ts
| 用例 | 描述 |
|------|------|
| `loads connections from .claude/dm8-mcp.json with activeEnv` | 配置文件 + activeEnv 加载 |
| `selects environment via env field from config` | env 字段切换环境 |
| `CLI --connections overrides config file` / `CLI --host overrides config file` | CLI 优先级 |
| `returns empty connections when no config file and no CLI params` | 无配置时空列表 |
| `parses masterHost and masterPort from config file` | 主备 fallback 配置解析 |
| `reads defaultConnection from environment config` | 默认连接读取 |
| `loads config from explicit --config path` | 显式 `--config` 路径 |

## Running Tests

```bash
# 运行所有测试
npm test

# 单个文件
npx vitest run tests/connectionPool.test.ts

# 监视模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## Test Guidelines

1. **命名规范**: 测试文件与源文件对应，如 `validation.ts` → `validation.test.ts`
2. **隔离性**: 每个测试用例应独立，`vi.resetModules()` 重置模块缓存
3. **清晰性**: 测试描述应清晰说明预期行为
4. **完整性**: 覆盖正常流程、边界情况和错误处理

<!-- MANUAL: -->

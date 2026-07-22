/**
 * 真实 DM8 集成测试 —— 验证连接池、schema 路由、并行查询在真实库上的行为。
 *
 * 默认跳过，避免日常 `npm test` 依赖数据库。运行方式：
 *   PowerShell:  $env:DM_INTEGRATION='1'; $env:NODE_OPTIONS='--openssl-legacy-provider'; npx vitest run tests/integration.test.ts
 *   Bash:        DM_INTEGRATION=1 NODE_OPTIONS=--openssl-legacy-provider npx vitest run tests/integration.test.ts
 *
 * 连接信息从 tests/integration.config.json 读取（已 gitignore，不入库）。
 * 文件不存在时即使开启也跳过。全程只读 SELECT，且仅在 dev 连接上执行，绝不触碰 prod。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Connection } from 'dmdb';

import { setConfig, resetConfigCache } from '../src/config.js';
import { withDmConnection, closeAllConnections } from '../src/utils/db.js';

const CONFIG_PATH = path.join(__dirname, 'integration.config.json');
const enabled = process.env.DM_INTEGRATION === '1' && fs.existsSync(CONFIG_PATH);

// 只在 dev 连接上测，schema 取 GASBASE（dev-GAS 的默认 schema）
const TARGET = { connectionName: 'dev-GAS', schema: 'GASBASE' };

describe('集成测试（真实 DM8）', () => {
  beforeAll(() => {
    if (!enabled) return;
    resetConfigCache();
    // 把本地 integration.config.json 注入 config.ts（最高优先级）
    setConfig({ configFile: CONFIG_PATH });
  });

  afterAll(async () => {
    if (enabled) await closeAllConnections();
  });

  it.runIf(enabled)('连接建池 + 基本查询 SELECT 1', async () => {
    const rows = await withDmConnection(TARGET, async (c) => {
      const r = await c.execute<{ ONE: number }>('SELECT 1 AS ONE FROM DUAL');
      return r.rows ?? [];
    });
    expect(rows[0]?.ONE).toBe(1);
  });

  it.runIf(enabled)('schema 经 connectString ?schema= 自动设置（CURRENT_SCHEMA = GASBASE）', async () => {
    const schema = await withDmConnection(TARGET, (c) => currentSchema(c));
    console.log('[集成] CURRENT_SCHEMA =', schema);
    expect(schema?.toUpperCase()).toBe('GASBASE');
  });

  it.runIf(enabled)('list_tables 元数据查询可跑', async () => {
    const rows = await withDmConnection(TARGET, async (c) => {
      const r = await c.execute<{ TABLE_NAME: string }>(
        'SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :owner AND ROWNUM <= 5',
        { owner: 'GASBASE' }
      );
      return r.rows ?? [];
    });
    console.log('[集成] GASBASE 前 5 张表:', rows.map((r) => r.TABLE_NAME));
    expect(Array.isArray(rows)).toBe(true);
  });

  it.runIf(enabled)('并行查询快于串行（验证连接池并发 —— P0 核心目标）', async () => {
    // 拉全列元数据，制造足够的单次查询耗时，让并行优势可观测
    const heavy = "SELECT * FROM ALL_TAB_COLUMNS WHERE OWNER = 'GASBASE'";
    const N = 4;

    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      await withDmConnection(TARGET, (c) => c.execute(heavy));
    }
    const serial = Date.now() - t0;

    const t1 = Date.now();
    await Promise.all(
      Array.from({ length: N }, () =>
        withDmConnection(TARGET, (c) => c.execute(heavy))
      )
    );
    const parallel = Date.now() - t1;

    console.log(
      `[集成] 串行 ${N} 次: ${serial}ms | 并行 ${N} 次: ${parallel}ms | 加速比 ${(serial / parallel).toFixed(2)}x`
    );
    // 宽松断言：并行应明显快于串行（池让查询真正并发，而非共享单连接串行）
    expect(parallel).toBeLessThan(serial);
  }, 60000);
});

/** 读取当前会话 schema，兼容多种 DM8 语法。 */
async function currentSchema(c: Connection): Promise<string | undefined> {
  for (const sql of [
    'SELECT CURRENT_SCHEMA AS S FROM DUAL',
    "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS S FROM DUAL",
  ]) {
    try {
      const r = await c.execute<{ S: string }>(sql);
      if (r.rows?.[0]?.S) return String(r.rows[0].S);
    } catch {
      // 试下一种语法
    }
  }
  return undefined;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dmdb 模块
vi.mock('dmdb', () => ({
  default: {
    OUT_FORMAT_OBJECT: 0,
    getConnection: vi.fn(),
    createPool: vi.fn(),
  },
}));

// Mock config 模块
vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    username: 'testuser',
    password: 'testpass',
    host: 'localhost',
    port: '5236',
    schema: 'TEST_SCHEMA',
  }),
  getConnectionByName: () => ({
    name: 'default',
    username: 'testuser',
    password: 'testpass',
    host: 'localhost',
    port: '5236',
    schema: 'TEST_SCHEMA',
  }),
}));

describe('ConnectionPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置模块缓存以获取新的连接池实例
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create connection pool module without errors', async () => {
    const { connectionPool } = await import('../src/utils/connectionPool.js');
    expect(connectionPool).toBeDefined();
    expect(typeof connectionPool.getOrCreatePool).toBe('function');
    expect(typeof connectionPool.closeAll).toBe('function');
    expect(typeof connectionPool.getStats).toBe('function');
  });

  it('should return empty stats initially', async () => {
    const { connectionPool } = await import('../src/utils/connectionPool.js');
    const stats = connectionPool.getStats();
    expect(stats.totalConnections).toBe(0);
    expect(stats.schemas).toEqual([]);
  });

  it('should report no connection for unknown schema', async () => {
    const { connectionPool } = await import('../src/utils/connectionPool.js');
    expect(connectionPool.hasConnection('UNKNOWN')).toBe(false);
  });

  it('should close all connections without error', async () => {
    const { connectionPool } = await import('../src/utils/connectionPool.js');
    await expect(connectionPool.closeAll()).resolves.not.toThrow();
  });

  it('should cache one pool per connection::schema key', async () => {
    const dmdbDefault = (await import('dmdb')).default as {
      createPool: ReturnType<typeof vi.fn>;
    };
    const fakePool = {
      close: vi.fn().mockResolvedValue(undefined),
      connectionsOpen: 2,
    };
    dmdbDefault.createPool.mockResolvedValue(fakePool);

    const { connectionPool } = await import('../src/utils/connectionPool.js');
    const p1 = await connectionPool.getOrCreatePool('default', 'TEST_SCHEMA');
    const p2 = await connectionPool.getOrCreatePool('default', 'TEST_SCHEMA');

    // 同一 connection::schema 只建一个 Pool（P0：并行查询共享 Pool 而非单连接）
    expect(p1).toBe(p2);
    expect(dmdbDefault.createPool).toHaveBeenCalledTimes(1);
    // schema 走 connectString，由 dmdb 在新连接 openConnection 时自动 SET SCHEMA
    const attrs = dmdbDefault.createPool.mock.calls[0][0] as { connectString: string };
    expect(attrs.connectString).toContain('?schema=TEST_SCHEMA');

    await connectionPool.closeAll();
    expect(fakePool.close).toHaveBeenCalledTimes(1);
  });

  it('should dedupe concurrent pool creation and set unique poolAlias', async () => {
    const dmdbDefault = (await import('dmdb')).default as {
      createPool: ReturnType<typeof vi.fn>;
    };
    const fakePool = {
      close: vi.fn().mockResolvedValue(undefined),
      connectionsOpen: 1,
    };
    dmdbDefault.createPool.mockResolvedValue(fakePool);

    const { connectionPool } = await import('../src/utils/connectionPool.js');
    // 并发同 key：只触发一次 createPool，两个调用拿到同一个 Pool
    const [p1, p2] = await Promise.all([
      connectionPool.getOrCreatePool('default', 'TEST_SCHEMA'),
      connectionPool.getOrCreatePool('default', 'TEST_SCHEMA'),
    ]);
    expect(p1).toBe(p2);
    expect(dmdbDefault.createPool).toHaveBeenCalledTimes(1);

    // poolAlias 唯一（= 缓存 key），避免 dmdb 默认 "default" 别名挤兑
    const attrs = dmdbDefault.createPool.mock.calls[0][0] as { poolAlias: string };
    expect(attrs.poolAlias).toBe('DEFAULT::TEST_SCHEMA');

    await connectionPool.closeAll();
  });

  it('injects socketTimeout into connectString when DM_QUERY_TIMEOUT_MS set', async () => {
    process.env.DM_QUERY_TIMEOUT_MS = '30000';
    try {
      vi.resetModules();
      const dmdbDefault = (await import('dmdb')).default as {
        createPool: ReturnType<typeof vi.fn>;
      };
      dmdbDefault.createPool.mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
        connectionsOpen: 1,
      });
      const { connectionPool } = await import('../src/utils/connectionPool.js');
      await connectionPool.getOrCreatePool('default', 'TEST_SCHEMA');
      const attrs = dmdbDefault.createPool.mock.calls[0][0] as { connectString: string };
      expect(attrs.connectString).toContain('socketTimeout=30000');
      await connectionPool.closeAll();
    } finally {
      delete process.env.DM_QUERY_TIMEOUT_MS;
    }
  });

  it('omits socketTimeout when DM_QUERY_TIMEOUT_MS unset', async () => {
    delete process.env.DM_QUERY_TIMEOUT_MS;
    vi.resetModules();
    const dmdbDefault = (await import('dmdb')).default as {
      createPool: ReturnType<typeof vi.fn>;
    };
    dmdbDefault.createPool.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      connectionsOpen: 1,
    });
    const { connectionPool } = await import('../src/utils/connectionPool.js');
    await connectionPool.getOrCreatePool('default', 'TEST_SCHEMA');
    const attrs = dmdbDefault.createPool.mock.calls[0][0] as { connectString: string };
    expect(attrs.connectString).not.toContain('socketTimeout');
    await connectionPool.closeAll();
  });

  // 回归：dmdb dm.js parseUrl 用 url.parse(url).auth.split(":") 取凭据，
  // 不 decode 且对含 ":" 的密码会截断。凭据必须走 query（url.parse(url,true) 标准 decode），
  // 不能放 URL userInfo。否则密码里的 ":" 会触发 [-2501] 用户名或密码错误。
  it('keeps credentials in query, not URL userInfo', async () => {
    delete process.env.DM_QUERY_TIMEOUT_MS;
    vi.resetModules();
    const dmdbDefault = (await import('dmdb')).default as {
      createPool: ReturnType<typeof vi.fn>;
    };
    dmdbDefault.createPool.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      connectionsOpen: 1,
    });
    const { connectionPool } = await import('../src/utils/connectionPool.js');
    await connectionPool.getOrCreatePool('default', 'TEST_SCHEMA');
    const attrs = dmdbDefault.createPool.mock.calls[0][0] as { connectString: string };
    // 不走 userInfo：connectString 不含 "@"
    expect(attrs.connectString).not.toContain('@');
    // 凭据在 query，由 url.parse(url, true) 标准 decode
    expect(attrs.connectString).toMatch(/[?&]user=testuser(&|$)/);
    expect(attrs.connectString).toMatch(/[?&]password=testpass(&|$)/);
    await connectionPool.closeAll();
  });
});

describe('db module with connection pool', () => {
  it('should export withDmConnection function', async () => {
    const { withDmConnection } = await import('../src/utils/db.js');
    expect(typeof withDmConnection).toBe('function');
  });

  it('should export closeAllConnections function', async () => {
    const { closeAllConnections } = await import('../src/utils/db.js');
    expect(typeof closeAllConnections).toBe('function');
  });

  it('should export getPoolStats function', async () => {
    const { getPoolStats } = await import('../src/utils/db.js');
    expect(typeof getPoolStats).toBe('function');
  });
});

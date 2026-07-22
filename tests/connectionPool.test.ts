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

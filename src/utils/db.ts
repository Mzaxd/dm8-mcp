import type { Connection } from 'dmdb';

import { connectionPool } from './connectionPool.js';

// 重新导出连接池相关功能
export { connectionPool, type PoolStats } from './connectionPool.js';

export interface DmConnectionTarget {
  connectionName: string;
  schema: string;
}

/**
 * 使用连接池执行数据库操作。
 * 每次调用从 dmdb Pool 借出一个连接，handler 结束后归还池，
 * 使并行查询互不阻塞（Pool 内多个连接可并发执行）。
 */
export async function withDmConnection<T>(
  target: DmConnectionTarget,
  handler: (connection: Connection) => Promise<T>
): Promise<T> {
  const pool = await connectionPool.getOrCreatePool(
    target.connectionName,
    target.schema
  );
  const connection = await pool.getConnection();
  try {
    return await handler(connection);
  } finally {
    // 归还池（dmdb PoolConnection.close 是归还，非真关）
    try {
      await connection.close();
    } catch {
      // 归还失败忽略，连接会被驱动按 poolTimeout 回收
    }
  }
}

/**
 * 关闭所有连接池
 */
export async function closeAllConnections(): Promise<void> {
  await connectionPool.closeAll();
}

/**
 * 获取连接池统计信息
 */
export function getPoolStats() {
  return connectionPool.getStats();
}

import type { Connection } from 'dmdb';

import { connectionPool } from './connectionPool.js';
import { normalizeIdentifier } from './validation.js';

// 重新导出连接池相关功能
export { connectionPool, type PoolStats } from './connectionPool.js';

export interface DmConnectionTarget {
  connectionName: string;
  schema: string;
}

/**
 * 使用连接池执行数据库操作
 * @param target - 目标连接与模式
 * @param handler - 数据库操作处理器
 * @returns 操作结果
 */
export async function withDmConnection<T>(
  target: DmConnectionTarget,
  handler: (connection: Connection) => Promise<T>
): Promise<T> {
  const connection = await connectionPool.getOrCreateConnection(
    target.connectionName,
    target.schema
  );
  // 连接池管理的连接不需要手动关闭
  return handler(connection);
}

/**
 * 关闭所有连接池中的连接
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

/**
 * 设置连接的 schema（用于连接池中的连接切换）
 * @deprecated 连接池会自动设置 schema，通常不需要手动调用
 */
export async function ensureSchema(connection: Connection, schema: string): Promise<void> {
  const normalized = normalizeIdentifier(schema);
  await connection.execute(`SET SCHEMA "${normalized}"`);
}

import dmdb from 'dmdb';
import type { Connection } from 'dmdb';

import { getConfig } from '../config.js';
import { setProxyEnv, restoreProxyEnv, validateProxyConfig } from './proxy.js';

dmdb.outFormat = dmdb.OUT_FORMAT_OBJECT;

/**
 * 连接池统计信息
 */
export interface PoolStats {
  totalConnections: number;
  schemas: string[];
  lastAccessTime: Record<string, Date>;
}

/**
 * DM8 数据库连接池
 * 按 schema 缓存连接，支持连接复用
 */
class ConnectionPool {
  private connections: Map<string, Connection> = new Map();
  private lastAccess: Map<string, Date> = new Map();
  private isShuttingDown = false;

  /**
   * 获取或创建指定 schema 的连接
   * @param schema - 目标模式名
   * @returns 数据库连接
   */
  async getOrCreateConnection(schema: string): Promise<Connection> {
    if (this.isShuttingDown) {
      throw new Error('连接池正在关闭，无法创建新连接');
    }

    // 检查是否已有连接
    const existingConn = this.connections.get(schema);
    if (existingConn) {
      // 验证连接是否仍然有效
      try {
        await existingConn.execute('SELECT 1 FROM DUAL');
        this.lastAccess.set(schema, new Date());
        return existingConn;
      } catch {
        // 连接已失效，移除并重新创建
        this.connections.delete(schema);
        this.lastAccess.delete(schema);
      }
    }

    // 创建新连接
    const connection = await this.createConnection(schema);
    this.connections.set(schema, connection);
    this.lastAccess.set(schema, new Date());
    return connection;
  }

  /**
   * 创建新的数据库连接
   */
  private async createConnection(schema: string): Promise<Connection> {
    const config = getConfig();
    const { username, password, host, port, proxy } = config;

    if (!username || !password || !host) {
      throw new Error('缺少数据库连接配置，请设置 DM_USERNAME/DM_PASSWORD/DM_HOST');
    }

    // 验证代理配置
    if (proxy && proxy.enabled) {
      const proxyErrors = validateProxyConfig(proxy);
      if (proxyErrors.length > 0) {
        throw new Error(`代理配置错误: ${proxyErrors.join(', ')}`);
      }
      setProxyEnv(proxy);
    }

    try {
      const encodedUser = encodeURIComponent(username);
      const encodedPassword = encodeURIComponent(password);
      const connectString = `dm://${encodedUser}:${encodedPassword}@${host}:${port}`;

      const connection = await dmdb.getConnection(connectString);

      // 设置 schema
      await connection.execute(`SET SCHEMA "${schema}"`);

      return connection;
    } finally {
      if (proxy && proxy.enabled) {
        restoreProxyEnv();
      }
    }
  }

  /**
   * 关闭指定 schema 的连接
   */
  async closeConnection(schema: string): Promise<void> {
    const connection = this.connections.get(schema);
    if (connection) {
      try {
        await connection.close();
      } catch {
        // 忽略关闭错误
      }
      this.connections.delete(schema);
      this.lastAccess.delete(schema);
    }
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    this.isShuttingDown = true;

    const closePromises = Array.from(this.connections.entries()).map(
      async ([schema, connection]) => {
        try {
          await connection.close();
        } catch {
          // 忽略单个连接关闭错误
        }
      }
    );

    await Promise.allSettled(closePromises);
    this.connections.clear();
    this.lastAccess.clear();
  }

  /**
   * 获取连接池统计信息
   */
  getStats(): PoolStats {
    const lastAccessTime: Record<string, Date> = {};
    this.lastAccess.forEach((date, schema) => {
      lastAccessTime[schema] = date;
    });

    return {
      totalConnections: this.connections.size,
      schemas: Array.from(this.connections.keys()),
      lastAccessTime,
    };
  }

  /**
   * 检查指定 schema 是否有活跃连接
   */
  hasConnection(schema: string): boolean {
    return this.connections.has(schema);
  }
}

// 单例实例
export const connectionPool = new ConnectionPool();

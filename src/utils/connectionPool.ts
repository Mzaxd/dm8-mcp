import dmdb from 'dmdb';
import type { Connection } from 'dmdb';

import { getConnectionByName } from '../config.js';

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

  // 空闲超过此时间（毫秒）才做 SELECT 1 探活
  private static readonly LIVENESS_THRESHOLD_MS = 30_000;

  private buildConnectionKey(connectionName: string, schema: string): string {
    return `${connectionName.toUpperCase()}::${schema.toUpperCase()}`;
  }

  /**
   * 获取或创建指定连接与 schema 的连接
   */
  async getOrCreateConnection(
    connectionName: string,
    schema: string
  ): Promise<Connection> {
    if (this.isShuttingDown) {
      throw new Error('连接池正在关闭，无法创建新连接');
    }

    const connectionKey = this.buildConnectionKey(connectionName, schema);

    const existingConn = this.connections.get(connectionKey);
    if (existingConn) {
      const elapsed = Date.now() - (this.lastAccess.get(connectionKey)?.getTime() ?? 0);
      if (elapsed < ConnectionPool.LIVENESS_THRESHOLD_MS) {
        // 最近用过，跳过探活直接复用
        return existingConn;
      }
      // 空闲较久，验证连接是否仍然有效
      try {
        await existingConn.execute('SELECT 1 FROM DUAL');
        this.lastAccess.set(connectionKey, new Date());
        return existingConn;
      } catch {
        this.connections.delete(connectionKey);
        this.lastAccess.delete(connectionKey);
      }
    }

    const connection = await this.createConnection(connectionName, schema);
    this.connections.set(connectionKey, connection);
    this.lastAccess.set(connectionKey, new Date());
    return connection;
  }

  /**
   * 创建新的数据库连接，支持主从 fallback
   */
  private async createConnection(
    connectionName: string,
    schema: string
  ): Promise<Connection> {
    const config = getConnectionByName(connectionName);
    if (!config) {
      throw new Error(`未找到连接 "${connectionName}"`);
    }

    const { username, password, host, port, masterHost, masterPort } = config;

    if (!username || !password || !host) {
      throw new Error(
        `连接 "${connectionName}" 缺少数据库配置，请检查 host/username/password`
      );
    }

    const encodedUser = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);

    try {
      const connection = await this.buildConnection(
        encodedUser, encodedPassword, host, port, schema
      );
      return connection;
    } catch (primaryError) {
      if (masterHost) {
        const effectiveMasterPort = masterPort || port;
        console.error(
          `[DM8 MCP] 连接 ${host}:${port} 失败，fallback 到主库 ${masterHost}:${effectiveMasterPort}`
        );
        try {
          const connection = await this.buildConnection(
            encodedUser, encodedPassword, masterHost, effectiveMasterPort, schema
          );
          return connection;
        } catch {
          // fallback 也失败，抛出原始错误
        }
      }
      throw primaryError;
    }
  }

  private async buildConnection(
    encodedUser: string,
    encodedPassword: string,
    host: string,
    port: string,
    schema: string
  ): Promise<Connection> {
    const connectString = `dm://${encodedUser}:${encodedPassword}@${host}:${port}`;
    const connection = await this.withTimeout(
      dmdb.getConnection(connectString),
      10000,
      `连接 ${host}:${port} 超时`
    );
    await connection.execute(`SET SCHEMA "${schema}"`);
    return connection;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 关闭指定连接与 schema 的连接
   */
  async closeConnection(connectionName: string, schema: string): Promise<void> {
    const connectionKey = this.buildConnectionKey(connectionName, schema);
    const connection = this.connections.get(connectionKey);
    if (connection) {
      try {
        await connection.close();
      } catch {
        // 忽略关闭错误
      }
      this.connections.delete(connectionKey);
      this.lastAccess.delete(connectionKey);
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
   * 检查指定连接是否有活跃连接
   */
  hasConnection(connectionName: string, schema?: string): boolean {
    if (schema) {
      return this.connections.has(this.buildConnectionKey(connectionName, schema));
    }

    const prefix = `${connectionName.toUpperCase()}::`;
    return Array.from(this.connections.keys()).some((key) => key.startsWith(prefix));
  }
}

// 单例实例
export const connectionPool = new ConnectionPool();

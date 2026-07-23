import dmdb from 'dmdb';
import type { Pool, PoolAttributes } from 'dmdb';

import { getConnectionByName } from '../config.js';

dmdb.outFormat = dmdb.OUT_FORMAT_OBJECT;
// CLOB 列默认以 Lob 流对象返回，其内部含 BigInt 等不可 JSON 序列化的属性，
// 导致 structuredContent 序列化（MCP 返回）抛错/挂起——SELECT * 含 CLOB 查询卡死的根因。
// fetchAsString 让 CLOB 直接以 String 返回，绕开 Lob 流。实测：91ms 秒回，序列化正常。
dmdb.fetchAsString = [dmdb.CLOB];

/**
 * 连接池统计信息
 */
export interface PoolStats {
  totalConnections: number;
  schemas: string[];
  lastAccessTime: Record<string, Date>;
}

// ponytail: 池参数从 env 读取，覆盖常见场景；需要按连接精细调参时再升级为 ConnectionConfig 字段
const POOL_MAX = Number(process.env.DM_POOL_MAX) || 5;
const POOL_MIN = Number(process.env.DM_POOL_MIN) || 1;
const POOL_TIMEOUT = Number(process.env.DM_POOL_TIMEOUT) || 60;
const CONNECT_TIMEOUT_MS = 10_000;
// ponytail: socketTimeout 是 dmdb 连接级查询超时（见 index.d.ts ConnectionAttributes.socketTimeout），
// 执行耗时超过该值的 SQL 会被服务端报错。0=不限。影响该连接所有 SQL（含心跳，但 SELECT 1 极快不触发）。
// 防恶意/意外慢查询长期占用连接。升级路径：需按单条查询粒度超时，改用 resultSet 流式 + 应用层 Promise.race。
const QUERY_TIMEOUT_MS = Number(process.env.DM_QUERY_TIMEOUT_MS) || 0;

/**
 * DM8 数据库连接池。
 * 按 connectionName::schema 缓存 dmdb Pool，每个 Pool 内多个连接可并行执行查询，
 * 避免单 Connection 并发不安全导致的串行阻塞。
 */
class ConnectionPool {
  private pools: Map<string, Pool> = new Map();
  private lastAccess: Map<string, Date> = new Map();
  // ponytail: 同 key 并发建池去重，避免 dmdb 1.0.52452+ 下同 poolAlias 第二次 createPool 报 [20006]
  private pendings: Map<string, Promise<Pool>> = new Map();
  private isShuttingDown = false;

  private buildConnectionKey(connectionName: string, schema: string): string {
    return `${connectionName.toUpperCase()}::${schema.toUpperCase()}`;
  }

  /**
   * 获取或创建指定连接与 schema 的连接池。
   */
  async getOrCreatePool(connectionName: string, schema: string): Promise<Pool> {
    if (this.isShuttingDown) {
      throw new Error('连接池正在关闭，无法创建新连接池');
    }

    const connectionKey = this.buildConnectionKey(connectionName, schema);
    const existingPool = this.pools.get(connectionKey);
    if (existingPool) {
      this.lastAccess.set(connectionKey, new Date());
      return existingPool;
    }

    // 并发去重：同 key 并发首次建池只触发一次 createPool。
    // 否则 dmdb 1.0.52452+ 会对同一 poolAlias 的第二次 createPool 抛 [20006]。
    const inflight = this.pendings.get(connectionKey);
    if (inflight) return inflight;

    const creating = this.createPool(connectionName, schema)
      .then((pool) => {
        this.pools.set(connectionKey, pool);
        this.lastAccess.set(connectionKey, new Date());
        return pool;
      })
      .finally(() => {
        this.pendings.delete(connectionKey);
      });

    this.pendings.set(connectionKey, creating);
    return creating;
  }

  /**
   * 创建连接池，支持主从 fallback。
   * schema 通过 connectString 的 ?schema= 传入，dmdb 在每个新连接 openConnection 时
   * 自动执行 SET SCHEMA（见 dmdb connection.js: conn_prop_schema 处理），无需手动维护。
   */
  private async createPool(connectionName: string, schema: string): Promise<Pool> {
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

    // ponytail: dmdb 1.0.52452+ 的 createPool 无 poolAlias 守卫且默认别名 "default"，
    // 不传则所有池挤到同一别名，第二个池必报 [20006]。显式传唯一别名（= 缓存 key）。
    const poolAlias = this.buildConnectionKey(connectionName, schema);

    try {
      return await this.openPool(
        encodedUser,
        encodedPassword,
        host,
        port,
        schema,
        poolAlias
      );
    } catch (primaryError) {
      if (masterHost) {
        const effectiveMasterPort = masterPort || port;
        console.error(
          `[DM8 MCP] 连接 ${host}:${port} 建池失败，fallback 到主库 ${masterHost}:${effectiveMasterPort}`
        );
        try {
          return await this.openPool(
            encodedUser,
            encodedPassword,
            masterHost,
            effectiveMasterPort,
            schema,
            poolAlias
          );
        } catch {
          // fallback 也失败，抛出原始错误
        }
      }
      throw primaryError;
    }
  }

  private async openPool(
    encodedUser: string,
    encodedPassword: string,
    host: string,
    port: string,
    schema: string,
    poolAlias: string
  ): Promise<Pool> {
    // socketTimeout 仅在配置 >0 时拼入连接串，避免改动默认行为
    const query = QUERY_TIMEOUT_MS > 0
      ? `?schema=${schema}&socketTimeout=${QUERY_TIMEOUT_MS}`
      : `?schema=${schema}`;
    const attributes: PoolAttributes = {
      // schema 走 query 参数：dmdb 解析后在新连接 openConnection 时自动 SET SCHEMA
      connectString: `dm://${encodedUser}:${encodedPassword}@${host}:${port}${query}`,
      // 唯一别名，避免 dmdb 默认 "default" 别名挤兑（见 createPool 注释）
      poolAlias,
      poolMin: POOL_MIN,
      poolMax: POOL_MAX,
      poolTimeout: POOL_TIMEOUT,
      // 借出前自动探活，替代手动的 SELECT 1 FROM DUAL
      testOnBorrow: true,
      validationQuery: 'select 1 from dual',
    };
    return this.withTimeout(
      dmdb.createPool(attributes),
      CONNECT_TIMEOUT_MS,
      `连接 ${host}:${port} 建池超时`
    );
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
   * 关闭指定连接与 schema 的连接池
   */
  async closeConnection(connectionName: string, schema: string): Promise<void> {
    const connectionKey = this.buildConnectionKey(connectionName, schema);
    const pool = this.pools.get(connectionKey);
    if (pool) {
      try {
        await pool.close();
      } catch {
        // 忽略关闭错误
      }
      this.pools.delete(connectionKey);
      this.lastAccess.delete(connectionKey);
    }
    this.pendings.delete(connectionKey);
  }

  /**
   * 关闭所有连接池
   */
  async closeAll(): Promise<void> {
    this.isShuttingDown = true;

    const closePromises = Array.from(this.pools.values()).map(async (pool) => {
      try {
        await pool.close();
      } catch {
        // 忽略单个连接池关闭错误
      }
    });

    await Promise.allSettled(closePromises);
    this.pools.clear();
    this.lastAccess.clear();
    this.pendings.clear();
  }

  /**
   * 获取连接池统计信息。
   * totalConnections 为所有 Pool 当前打开连接数（使用中 + 空闲）之和。
   */
  getStats(): PoolStats {
    const lastAccessTime: Record<string, Date> = {};
    this.lastAccess.forEach((date, key) => {
      lastAccessTime[key] = date;
    });

    let totalConnections = 0;
    this.pools.forEach((pool) => {
      totalConnections += pool.connectionsOpen;
    });

    return {
      totalConnections,
      schemas: Array.from(this.pools.keys()),
      lastAccessTime,
    };
  }

  /**
   * 检查指定连接是否有活跃连接池
   */
  hasConnection(connectionName: string, schema?: string): boolean {
    if (schema) {
      return this.pools.has(this.buildConnectionKey(connectionName, schema));
    }

    const prefix = `${connectionName.toUpperCase()}::`;
    return Array.from(this.pools.keys()).some((key) => key.startsWith(prefix));
  }
}

// 单例实例
export const connectionPool = new ConnectionPool();

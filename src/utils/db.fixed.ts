/**
 * 🔒 安全修复版本 - DM8 数据库连接管理
 * 
 * 修复内容：
 * - ✅ 实现连接池（修复高危漏洞 #2）
 * - ✅ 修复 SQL 注入（修复高危漏洞 #1）
 * - ✅ 添加查询超时（修复中高危漏洞 #4）
 * - ✅ 添加连接重试机制
 * - ✅ 改善错误处理
 * - ✅ 实现优雅关闭
 */

import dmdb from 'dmdb';
import type { Connection, Pool } from 'dmdb';

import { getConfig } from '../config.js';
import { normalizeIdentifier } from './validation.js';
import { logger } from './logger.js';

// ===========================
// 类型定义
// ===========================

export interface ConnectionOptions {
  timeout?: number;           // 查询超时（秒）
  retries?: number;          // 重试次数
  retryDelay?: number;       // 重试延迟（毫秒）
}

export interface PoolStats {
  connectionsOpen: number;
  connectionsInUse: number;
}

// ===========================
// 连接池管理
// ===========================

let pool: Pool | null = null;
let isShuttingDown = false;

// 设置输出格式
dmdb.outFormat = dmdb.OUT_FORMAT_OBJECT;

/**
 * 获取或创建连接池（单例模式）
 * 
 * ✅ 修复：使用连接池替代每次创建新连接
 */
export function getPool(): Pool {
  if (isShuttingDown) {
    throw new Error('服务器正在关闭，无法创建新连接');
  }

  if (!pool) {
    const config = getConfig();
    
    if (!config.username || !config.password || !config.host) {
      throw new Error('缺少数据库连接配置，请设置 DM_USERNAME/DM_PASSWORD/DM_HOST');
    }

    const encodedUser = encodeURIComponent(config.username);
    const encodedPassword = encodeURIComponent(config.password);
    const connectString = `dm://${encodedUser}:${encodedPassword}@${config.host}:${config.port}`;

    // 创建连接池
    pool = dmdb.createPool({
      user: config.username,
      password: config.password,
      connectString: connectString,
      poolMin: parseInt(process.env.CONNECTION_POOL_MIN || '2', 10),      // 最小连接数
      poolMax: parseInt(process.env.CONNECTION_POOL_MAX || '20', 10),     // 最大连接数
      poolIncrement: 2,                // 每次增加的连接数
      poolTimeout: 30,                 // 获取连接的超时时间（秒）
    });

    logger.info({
      poolMin: pool.poolMin,
      poolMax: pool.poolMax,
      host: config.host,
      port: config.port,
    }, 'DM8 连接池已初始化');

    // 启动连接池监控
    startPoolMonitoring();
  }

  return pool;
}

/**
 * ✅ 新增：连接池统计
 */
export function getPoolStats(): PoolStats | null {
  if (!pool) {
    return null;
  }

  return {
    connectionsOpen: pool.connectionsOpen || 0,
    connectionsInUse: pool.connectionsInUse || 0,
  };
}

/**
 * ✅ 新增：连接池监控
 */
function startPoolMonitoring(): void {
  // 每分钟记录连接池状态
  setInterval(() => {
    const stats = getPoolStats();
    if (stats) {
      logger.info(stats, 'DM8 连接池状态');
      
      // 告警：连接池使用率过高
      const maxConnections = pool?.poolMax ?? 20;
      const usage = stats.connectionsInUse / maxConnections;
      
      if (usage >= 0.9) {
        logger.warn(stats, '⚠️ DM8 连接池使用率超过 90%');
      }
    }
  }, 60000);
}

/**
 * ✅ 修复：安全的 Schema 设置（防止 SQL 注入）
 */
async function setSchema(connection: Connection, schema: string): Promise<void> {
  if (!schema) {
    return;
  }

  try {
    // ✅ 安全：先验证标识符，防止 SQL 注入
    const validatedSchema = normalizeIdentifier(schema);
    
    // ✅ 新增：验证 schema 是否存在
    const checkResult = await connection.execute<{ CNT: number }>(
      `SELECT COUNT(*) as CNT FROM DBA_USERS WHERE USERNAME = :schema`,
      { schema: validatedSchema }
    );
    
    if (!checkResult.rows?.[0]?.CNT) {
      logger.warn({ schema: validatedSchema }, 'Schema 不存在');
      throw new Error(`Schema ${validatedSchema} 不存在`);
    }
    
    // 设置 schema
    await connection.execute(`SET SCHEMA ${validatedSchema}`);
    
    logger.debug({ schema: validatedSchema }, 'Schema 已设置');
  } catch (error) {
    logger.error({ error, schema }, '设置 Schema 失败');
    throw new Error(
      `设置 schema 失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * ✅ 修复：带连接池的数据库操作包装函数
 * ✅ 新增：查询超时支持
 * ✅ 新增：重试机制
 */
export async function withDmConnection<T>(
  handler: (connection: Connection) => Promise<T>,
  options: ConnectionOptions = {}
): Promise<T> {
  const {
    timeout = parseInt(process.env.QUERY_TIMEOUT || '30', 10),
    retries = 0,
    retryDelay = 1000,
  } = options;

  const pool = getPool();
  let lastError: Error | null = null;

  // ✅ 新增：重试机制
  for (let attempt = 0; attempt <= retries; attempt++) {
    let connection: Connection | null = null;
    
    try {
      // 从连接池获取连接
      connection = await pool.getConnection();
      
      // ✅ 新增：设置查询超时
      if (timeout > 0) {
        await connection.execute(`SET QUERY_TIMEOUT = ${timeout}`);
      }
      
      // 设置 schema
      const config = getConfig();
      if (config.schema) {
        await setSchema(connection, config.schema);
      }
      
      // 执行操作
      const result = await handler(connection);
      
      return result;
      
    } catch (error) {
      lastError = error as Error;
      
      // 判断是否应该重试
      const shouldRetry = attempt < retries && isRetryableError(error);
      
      if (shouldRetry) {
        const delay = retryDelay * (attempt + 1); // 指数退避
        logger.warn(
          { error, attempt: attempt + 1, delay },
          'DM8 数据库操作失败，准备重试'
        );
        await sleep(delay);
      } else {
        // 不重试或已达最大重试次数
        logger.error({ error, attempt }, 'DM8 数据库操作失败');
        throw error;
      }
      
    } finally {
      // ✅ 修复：释放连接回连接池
      if (connection) {
        try {
          await connection.close();
        } catch (error) {
          // 静默忽略关闭错误
          logger.debug({ error }, '连接关闭时出现错误（已忽略）');
        }
      }
    }
  }

  throw lastError || new Error('数据库操作失败');
}

/**
 * ✅ 新增：判断错误是否可重试
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  
  // 可重试的错误类型
  const retryableErrors = [
    'connection timeout',
    'connection refused',
    'econnrefused',
    'network error',
    'etimedout',
    'connection reset',
    'connection closed',
  ];

  return retryableErrors.some(err => message.includes(err));
}

/**
 * 工具函数：延迟
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ✅ 新增：健康检查
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  details: PoolStats | { error: string };
}> {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    try {
      await connection.execute('SELECT 1 FROM DUAL');
      const stats = getPoolStats();
      
      return {
        healthy: true,
        details: stats || { error: 'No stats available' },
      };
    } finally {
      await connection.close();
    }
  } catch (error) {
    logger.error({ error }, 'DM8 健康检查失败');
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * ✅ 新增：优雅关闭
 */
export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  isShuttingDown = true;
  
  logger.info('正在关闭 DM8 连接池...');
  
  try {
    await pool.close();
    pool = null;
    logger.info('DM8 连接池已关闭');
  } catch (error) {
    logger.error({ error }, '关闭 DM8 连接池时出错');
    throw error;
  } finally {
    isShuttingDown = false;
  }
}

/**
 * ✅ 新增：注册优雅关闭处理器
 */
export function registerShutdownHandlers(): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info({ signal }, '收到关闭信号');
      
      try {
        await closePool();
        process.exit(0);
      } catch (error) {
        logger.error({ error }, '优雅关闭失败');
        process.exit(1);
      }
    });
  });

  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    logger.error({ error }, '未捕获的异常');
    closePool().finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, '未处理的 Promise 拒绝');
    closePool().finally(() => process.exit(1));
  });
}

// ===========================
// 向后兼容的导出（已废弃）
// ===========================

/**
 * @deprecated 使用 withDmConnection 替代
 * 保留以确保向后兼容
 */
export async function createDmConnection(): Promise<Connection> {
  logger.warn('createDmConnection 已废弃，请使用 withDmConnection');
  const pool = getPool();
  return pool.getConnection();
}

/**
 * @deprecated 使用 setSchema 替代
 */
export async function ensureSchema(connection: Connection, schema: string): Promise<void> {
  await setSchema(connection, schema);
}


/**
 * 🔒 安全修复 - 日志系统
 * 
 * 功能：
 * - ✅ 结构化日志记录
 * - ✅ 敏感信息脱敏
 * - ✅ 多级别日志支持
 * - ✅ 生产环境优化
 */

import pino from 'pino';

// ===========================
// 敏感字段配置
// ===========================

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'session',
];

// ===========================
// 日志配置
// ===========================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===========================
// 创建日志实例
// ===========================

export const logger = pino({
  level: LOG_LEVEL,
  
  // 脱敏配置
  redact: {
    paths: SENSITIVE_FIELDS,
    censor: '[REDACTED]',
  },

  // 格式化配置
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        host: bindings.hostname,
        node_version: process.version,
      };
    },
  },

  // 时间戳格式
  timestamp: pino.stdTimeFunctions.isoTime,

  // 生产环境优化
  ...(NODE_ENV === 'production'
    ? {
        // 生产环境使用 JSON 格式
        serializers: pino.stdSerializers,
      }
    : {
        // 开发环境使用美化格式
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
});

// ===========================
// 日志辅助函数
// ===========================

/**
 * 记录数据库操作日志
 */
export function logDatabaseOperation(
  operation: string,
  details: Record<string, unknown>,
  duration?: number
): void {
  logger.info(
    {
      operation,
      duration: duration !== undefined ? `${duration}ms` : undefined,
      ...details,
    },
    `数据库操作: ${operation}`
  );
}

/**
 * 记录安全事件
 */
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, unknown>
): void {
  const logMethod = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  
  logger[logMethod](
    {
      event,
      severity,
      timestamp: new Date().toISOString(),
      ...details,
    },
    `🔒 安全事件: ${event}`
  );
}

/**
 * 记录性能指标
 */
export function logPerformanceMetric(
  metric: string,
  value: number,
  unit: string = 'ms'
): void {
  logger.debug(
    {
      metric,
      value,
      unit,
    },
    `性能指标: ${metric} = ${value}${unit}`
  );
}

// ===========================
// 导出类型
// ===========================

export type Logger = typeof logger;


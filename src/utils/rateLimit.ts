/**
 * 🔒 安全修复 - 速率限制
 * 
 * 功能：
 * - ✅ 基于令牌桶算法的速率限制
 * - ✅ 支持多客户端隔离
 * - ✅ 内存高效存储
 * - ✅ 自动清理过期数据
 */

import { logger, logSecurityEvent } from './logger.js';

// ===========================
// 类型定义
// ===========================

interface TokenBucket {
  tokens: number;           // 当前令牌数
  lastRefill: number;       // 上次填充时间（毫秒时间戳）
  maxTokens: number;        // 最大令牌数
  refillRate: number;       // 每秒填充速率
}

interface RateLimitConfig {
  maxTokens: number;        // 最大令牌数（突发容量）
  refillRate: number;       // 每秒填充速率
  windowMs: number;         // 时间窗口（毫秒）
}

// ===========================
// 默认配置
// ===========================

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),    // 100 个请求
  refillRate: 100 / 60,                                             // 每秒 ~1.67 个令牌
  windowMs: 60000,                                                  // 1 分钟
};

// ===========================
// 速率限制器类
// ===========================

export class RateLimiter {
  private buckets: Map<string, TokenBucket>;
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.buckets = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cleanupInterval = null;

    // 启动定期清理
    this.startCleanup();

    logger.info(
      {
        maxTokens: this.config.maxTokens,
        refillRate: this.config.refillRate,
        windowMs: this.config.windowMs,
      },
      '速率限制器已初始化'
    );
  }

  /**
   * 检查是否允许请求
   * @param clientId 客户端标识符
   * @param cost 请求消耗的令牌数（默认 1）
   * @returns 是否允许请求
   */
  public async checkLimit(clientId: string, cost: number = 1): Promise<boolean> {
    let bucket = this.buckets.get(clientId);

    // 如果桶不存在，创建新桶
    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: Date.now(),
        maxTokens: this.config.maxTokens,
        refillRate: this.config.refillRate,
      };
      this.buckets.set(clientId, bucket);
    }

    // 填充令牌
    this.refillTokens(bucket);

    // 检查是否有足够的令牌
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true;
    }

    // 记录速率限制事件
    logSecurityEvent('rate_limit_exceeded', 'medium', {
      clientId,
      remainingTokens: bucket.tokens,
      requestedCost: cost,
    });

    return false;
  }

  /**
   * 强制检查并抛出错误
   */
  public async checkLimitOrThrow(clientId: string, cost: number = 1): Promise<void> {
    const allowed = await this.checkLimit(clientId, cost);

    if (!allowed) {
      throw new RateLimitError(
        `请求过于频繁，请稍后再试。客户端: ${clientId}`,
        this.getRetryAfter(clientId)
      );
    }
  }

  /**
   * 填充令牌（令牌桶算法）
   */
  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000; // 转换为秒

    // 计算应该填充的令牌数
    const tokensToAdd = timePassed * bucket.refillRate;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * 获取建议的重试时间（秒）
   */
  private getRetryAfter(clientId: string): number {
    const bucket = this.buckets.get(clientId);
    if (!bucket) {
      return 60; // 默认 1 分钟
    }

    // 计算填充到至少 1 个令牌需要的时间
    const tokensNeeded = Math.max(0, 1 - bucket.tokens);
    const secondsNeeded = tokensNeeded / bucket.refillRate;

    return Math.ceil(secondsNeeded);
  }

  /**
   * 获取客户端状态
   */
  public getClientStats(clientId: string): {
    remainingTokens: number;
    maxTokens: number;
    retryAfter: number;
  } | null {
    const bucket = this.buckets.get(clientId);
    if (!bucket) {
      return null;
    }

    this.refillTokens(bucket);

    return {
      remainingTokens: Math.floor(bucket.tokens),
      maxTokens: bucket.maxTokens,
      retryAfter: this.getRetryAfter(clientId),
    };
  }

  /**
   * 重置客户端限制
   */
  public resetClient(clientId: string): void {
    this.buckets.delete(clientId);
    logger.info({ clientId }, '客户端速率限制已重置');
  }

  /**
   * 定期清理不活跃的客户端
   */
  private startCleanup(): void {
    // 每 5 分钟清理一次
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const inactiveThreshold = 10 * 60 * 1000; // 10 分钟

      let cleanedCount = 0;

      for (const [clientId, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > inactiveThreshold) {
          this.buckets.delete(clientId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(
          { cleanedCount, remainingClients: this.buckets.size },
          '清理不活跃的速率限制桶'
        );
      }
    }, 5 * 60 * 1000);

    // 确保 Node.js 退出时清理定时器
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 停止速率限制器
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
    logger.info('速率限制器已停止');
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    totalClients: number;
    activeClients: number;
    config: RateLimitConfig;
  } {
    const now = Date.now();
    const activeThreshold = 60000; // 1 分钟内活跃

    let activeClients = 0;
    for (const bucket of this.buckets.values()) {
      if (now - bucket.lastRefill < activeThreshold) {
        activeClients++;
      }
    }

    return {
      totalClients: this.buckets.size,
      activeClients,
      config: this.config,
    };
  }
}

// ===========================
// 自定义错误类型
// ===========================

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ===========================
// 全局单例实例
// ===========================

let globalRateLimiter: RateLimiter | null = null;

/**
 * 获取全局速率限制器实例
 */
export function getRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();
  }
  return globalRateLimiter;
}

/**
 * 关闭全局速率限制器
 */
export function closeRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.stop();
    globalRateLimiter = null;
  }
}

// ===========================
// 便捷函数
// ===========================

/**
 * 检查速率限制的中间件函数
 */
export async function checkRateLimit(clientId: string, cost: number = 1): Promise<void> {
  const limiter = getRateLimiter();
  await limiter.checkLimitOrThrow(clientId, cost);
}


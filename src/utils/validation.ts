const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 规范化数据库对象名称并校验格式，防止注入风险。
 */
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new ValidationError('标识符不能为空');
  }
  if (!IDENTIFIER_PATTERN.test(trimmed)) {
    throw new ValidationError(`标识符包含非法字符: ${trimmed}`);
  }
  return trimmed.toUpperCase();
}

const READONLY_PREFIXES = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN'];

/**
 * 验证 SQL 语句是否为只读查询。
 */
export function assertReadOnlyQuery(query: string): void {
  const normalized = query.trim().toUpperCase();
  if (!READONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new ValidationError('仅允许执行 SELECT/SHOW/DESCRIBE/EXPLAIN 语句');
  }
}

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

/**
 * 验证 schema 是否在允许访问的白名单中。
 * @param schema - 待验证的 schema 名称
 * @param allowedSchemas - 允许的 schema 列表
 */
export function validateSchemaAccess(schema: string, allowedSchemas: string[]): void {
  const normalizedSchema = schema.toUpperCase();
  // 如果配置了白名单，则检查是否在列表中
  if (allowedSchemas.length > 0 && !allowedSchemas.includes(normalizedSchema)) {
    throw new ValidationError(
      `Schema "${schema}" 不在配置允许访问的列表中。允许访问的 Schema: ${allowedSchemas.join(', ')}`
    );
  }
}

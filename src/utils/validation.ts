import type { Connection } from 'dmdb';

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
 * 前缀预检 + 分号多语句拦截（同步、无需连接、廉价）。
 * 权威判定见 assertReadonlyByStatementType（基于驱动解析），本函数是其前哨过滤。
 */
export function assertReadOnlyQuery(query: string): void {
  const normalized = query.trim().toUpperCase();
  if (!READONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new ValidationError('仅允许执行 SELECT/SHOW/DESCRIBE/EXPLAIN 语句');
  }
  // 禁止分号后跟非空内容，堵多语句注入（如 "SELECT 1; DROP TABLE x"）
  if (/;\s*\S/.test(query)) {
    throw new ValidationError('查询中不允许使用分号拼接多条语句');
  }
}

// dmdb statementType 常量（见 dmdb index.d.ts STMT_TYPE_*）
const STMT_TYPE_SELECT = 1;
const STMT_TYPE_EXPLAIN_PLAN = 15;

/**
 * 基于驱动解析的 statementType 做权威只读判定，比前缀检查更可靠
 * （能识别 "SELECT 前缀欺骗"、SELECT INTO 等前缀检查漏掉的写操作语义）。
 * SHOW/DESCRIBE 等无法 prepare 的语句会抛错，此时降级信任前缀检查（调用前已完成）。
 */
export async function assertReadonlyByStatementType(
  connection: Pick<Connection, 'getStatementInfo'>,
  sql: string
): Promise<void> {
  let info: { statementType?: number } | undefined;
  try {
    info = await connection.getStatementInfo(sql);
  } catch {
    // 降级：前缀 + 分号检查已在调用前完成
    return;
  }
  const type = info?.statementType;
  if (type !== STMT_TYPE_SELECT && type !== STMT_TYPE_EXPLAIN_PLAN) {
    throw new ValidationError(`仅允许只读查询，驱动检测到语句类型码: ${type}`);
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

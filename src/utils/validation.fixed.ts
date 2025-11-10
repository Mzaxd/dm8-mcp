/**
 * 🔒 安全修复版本 - 输入验证和安全检查
 * 
 * 修复内容：
 * - ✅ 增强只读查询验证（修复高危漏洞 #3）
 * - ✅ 添加多语句检测
 * - ✅ 添加危险函数检测
 * - ✅ 添加输入长度限制（修复中危漏洞 #7）
 * - ✅ 增强标识符验证
 * - ✅ 添加详细的错误消息
 */

// ===========================
// 常量定义
// ===========================

// ✅ 新增：长度限制
export const MAX_QUERY_LENGTH = 10000;        // 10KB
export const MAX_IDENTIFIER_LENGTH = 128;     // 128 字符
export const MAX_TABLE_NAME_LENGTH = 64;      // 64 字符

// ===========================
// 自定义错误类型
// ===========================

export class ValidationError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ===========================
// 只读查询验证（增强版）
// ===========================

/**
 * ✅ 修复：增强的只读查询验证
 * 
 * 新增检查：
 * 1. 多语句检测
 * 2. 危险函数检测
 * 3. 文件操作检测
 * 4. 子查询写操作检测
 * 5. 长度限制
 */
export function assertReadOnlyQuery(query: string): void {
  // ===========================
  // 1. 基础验证
  // ===========================
  
  if (!query || query.trim().length === 0) {
    throw new ValidationError('查询不能为空', 'EMPTY_QUERY');
  }

  // ✅ 新增：长度检查
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(
      `查询过长（最大 ${MAX_QUERY_LENGTH} 字符，当前 ${query.length} 字符）`,
      'QUERY_TOO_LONG'
    );
  }

  const trimmed = query.trim();
  const normalized = trimmed.toUpperCase();

  // ===========================
  // 2. 白名单检查：只允许只读操作
  // ===========================
  
  const allowedPatterns = [
    /^SELECT\s/i,                           // SELECT 查询
    /^WITH\s+.*?\s+AS\s+.*?SELECT\s/is,    // CTE (Common Table Expression)
    /^SHOW\s/i,                            // SHOW 命令
    /^DESCRIBE\s/i,                        // DESCRIBE 命令
    /^DESC\s/i,                            // DESC 命令（简写）
    /^EXPLAIN\s/i,                         // EXPLAIN 查询计划
  ];

  const isAllowed = allowedPatterns.some((pattern) => pattern.test(trimmed));

  if (!isAllowed) {
    throw new ValidationError(
      '仅允许只读查询操作（SELECT, SHOW, DESCRIBE, EXPLAIN, WITH）',
      'INVALID_QUERY_TYPE'
    );
  }

  // ===========================
  // 3. ✅ 新增：多语句检测
  // ===========================
  
  checkMultipleStatements(query);

  // ===========================
  // 4. 黑名单检查：危险操作关键字
  // ===========================
  
  const dangerousKeywords = [
    // DML 写操作
    { pattern: /\bINSERT\b/i, name: 'INSERT' },
    { pattern: /\bUPDATE\b/i, name: 'UPDATE' },
    { pattern: /\bDELETE\b/i, name: 'DELETE' },
    { pattern: /\bMERGE\b/i, name: 'MERGE' },
    
    // DDL 操作
    { pattern: /\bDROP\b/i, name: 'DROP' },
    { pattern: /\bCREATE\b/i, name: 'CREATE' },
    { pattern: /\bALTER\b/i, name: 'ALTER' },
    { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
    { pattern: /\bRENAME\b/i, name: 'RENAME' },
    
    // 权限操作
    { pattern: /\bGRANT\b/i, name: 'GRANT' },
    { pattern: /\bREVOKE\b/i, name: 'REVOKE' },
    
    // 事务控制（可能绕过只读限制）
    { pattern: /\bBEGIN\b/i, name: 'BEGIN' },
    { pattern: /\bCOMMIT\b/i, name: 'COMMIT' },
    { pattern: /\bROLLBACK\b/i, name: 'ROLLBACK' },
    
    // 存储过程和函数执行
    { pattern: /\bEXECUTE\b/i, name: 'EXECUTE' },
    { pattern: /\bCALL\b/i, name: 'CALL' },
    
    // 锁定操作
    { pattern: /\bLOCK\b/i, name: 'LOCK' },
  ];

  for (const keyword of dangerousKeywords) {
    if (keyword.pattern.test(query)) {
      throw new ValidationError(
        `查询包含不允许的操作: ${keyword.name}`,
        'DANGEROUS_KEYWORD'
      );
    }
  }

  // ===========================
  // 5. ✅ 新增：危险函数检测
  // ===========================
  
  checkDangerousFunctions(query);

  // ===========================
  // 6. ✅ 新增：文件操作检测
  // ===========================
  
  checkFileOperations(query);

  // ===========================
  // 7. ✅ 新增：其他危险模式检测
  // ===========================
  
  checkDangerousPatterns(query);
}

/**
 * ✅ 新增：多语句检测
 * 防止 SQL 注入攻击，如: SELECT 1; DROP TABLE users;
 */
function checkMultipleStatements(query: string): void {
  // 移除字符串字面量（避免误判）
  const withoutStrings = query.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  
  // 计算分号数量
  const semicolons = (withoutStrings.match(/;/g) || []).length;
  
  // 允许查询末尾有一个分号
  const endsWithSemicolon = withoutStrings.trim().endsWith(';');
  
  if (semicolons > 1) {
    throw new ValidationError(
      '不允许多语句查询（检测到多个分号）',
      'MULTIPLE_STATEMENTS'
    );
  }
  
  if (semicolons === 1 && !endsWithSemicolon) {
    throw new ValidationError(
      '不允许多语句查询（分号不在末尾）',
      'MULTIPLE_STATEMENTS'
    );
  }
}

/**
 * ✅ 新增：危险函数检测
 * 防止使用可能读取服务器文件、执行命令等危险函数
 */
function checkDangerousFunctions(query: string): void {
  const dangerousFunctions = [
    // PostgreSQL/openGauss 文件读取函数
    { pattern: /pg_read_file\s*\(/i, name: 'pg_read_file' },
    { pattern: /pg_read_binary_file\s*\(/i, name: 'pg_read_binary_file' },
    { pattern: /pg_ls_dir\s*\(/i, name: 'pg_ls_dir' },
    { pattern: /pg_stat_file\s*\(/i, name: 'pg_stat_file' },
    
    // 大对象（Large Object）操作
    { pattern: /lo_import\s*\(/i, name: 'lo_import' },
    { pattern: /lo_export\s*\(/i, name: 'lo_export' },
    
    // 程序执行
    { pattern: /pg_execute\s*\(/i, name: 'pg_execute' },
    
    // MySQL 特有（防御性检查）
    { pattern: /load_file\s*\(/i, name: 'load_file' },
    { pattern: /into\s+outfile/i, name: 'INTO OUTFILE' },
    { pattern: /into\s+dumpfile/i, name: 'INTO DUMPFILE' },
  ];

  for (const func of dangerousFunctions) {
    if (func.pattern.test(query)) {
      throw new ValidationError(
        `查询包含危险函数: ${func.name}`,
        'DANGEROUS_FUNCTION'
      );
    }
  }
}

/**
 * ✅ 新增：文件操作检测
 */
function checkFileOperations(query: string): void {
  const fileOperations = [
    { pattern: /\bCOPY\s+/i, name: 'COPY' },
    { pattern: /\bLOAD\s+DATA/i, name: 'LOAD DATA' },
    { pattern: /\bLOAD\s+XML/i, name: 'LOAD XML' },
  ];

  for (const op of fileOperations) {
    if (op.pattern.test(query)) {
      throw new ValidationError(
        `查询包含文件操作: ${op.name}`,
        'FILE_OPERATION'
      );
    }
  }
}

/**
 * ✅ 新增：其他危险模式检测
 */
function checkDangerousPatterns(query: string): void {
  // 检测可能的子查询写操作
  // 如：SELECT * FROM (DELETE FROM users RETURNING *) AS t
  const subqueryWritePattern = /\([\s\S]*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)[\s\S]*\)/i;
  if (subqueryWritePattern.test(query)) {
    throw new ValidationError(
      '子查询中不允许写操作',
      'SUBQUERY_WRITE_OPERATION'
    );
  }

  // 检测 RETURNING 子句（可能与 INSERT/UPDATE/DELETE 结合使用）
  if (/\bRETURNING\b/i.test(query)) {
    throw new ValidationError(
      '不允许使用 RETURNING 子句',
      'RETURNING_CLAUSE'
    );
  }

  // ✅ 新增：检测 NULL 字节注入
  if (query.includes('\x00')) {
    throw new ValidationError(
      '查询包含非法字符（NULL 字节）',
      'NULL_BYTE_INJECTION'
    );
  }

  // ✅ 新增：检测过多的嵌套括号（可能的混淆攻击）
  const parenDepth = getMaxParenDepth(query);
  if (parenDepth > 10) {
    throw new ValidationError(
      `查询嵌套过深（最大允许 10 层，当前 ${parenDepth} 层）`,
      'EXCESSIVE_NESTING'
    );
  }
}

/**
 * 工具函数：计算最大括号嵌套深度
 */
function getMaxParenDepth(str: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of str) {
    if (char === '(') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === ')') {
      currentDepth--;
    }
  }

  return maxDepth;
}

// ===========================
// 标识符验证（增强版）
// ===========================

/**
 * ✅ 修复：增强的标识符规范化
 * 
 * 新增：
 * - 长度限制
 * - 更严格的字符检查
 * - 关键字检查
 */
export function normalizeIdentifier(identifier: string | undefined): string {
  if (!identifier) {
    throw new ValidationError('标识符不能为空', 'EMPTY_IDENTIFIER');
  }

  const normalized = identifier.trim();

  // ✅ 新增：长度检查
  if (normalized.length === 0) {
    throw new ValidationError('标识符不能为空', 'EMPTY_IDENTIFIER');
  }

  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw new ValidationError(
      `标识符过长（最大 ${MAX_IDENTIFIER_LENGTH} 字符，当前 ${normalized.length} 字符）`,
      'IDENTIFIER_TOO_LONG'
    );
  }

  // 严格的字符检查：只允许字母、数字、下划线
  if (!/^[a-zA-Z0-9_]+$/.test(normalized)) {
    throw new ValidationError(
      `标识符包含非法字符: "${identifier}". 仅允许字母、数字和下划线`,
      'INVALID_IDENTIFIER_CHARS'
    );
  }

  // ✅ 新增：不允许以数字开头（SQL 规范）
  if (/^[0-9]/.test(normalized)) {
    throw new ValidationError(
      `标识符不能以数字开头: "${identifier}"`,
      'IDENTIFIER_STARTS_WITH_NUMBER'
    );
  }

  // ✅ 新增：SQL 关键字检查（避免混淆）
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'TRIGGER', 'PROCEDURE',
    'FUNCTION', 'USER', 'GRANT', 'REVOKE', 'PUBLIC', 'SCHEMA',
  ];

  if (sqlKeywords.includes(normalized.toUpperCase())) {
    throw new ValidationError(
      `标识符不能使用 SQL 关键字: "${identifier}"`,
      'IDENTIFIER_IS_KEYWORD'
    );
  }

  return normalized;
}

/**
 * ✅ 修复：增强的表名验证
 */
export function validateTableName(tableName: string): void {
  if (!tableName || tableName.trim().length === 0) {
    throw new ValidationError('表名不能为空', 'EMPTY_TABLE_NAME');
  }

  const trimmed = tableName.trim();

  // ✅ 新增：长度检查
  if (trimmed.length > MAX_TABLE_NAME_LENGTH) {
    throw new ValidationError(
      `表名过长（最大 ${MAX_TABLE_NAME_LENGTH} 字符，当前 ${trimmed.length} 字符）`,
      'TABLE_NAME_TOO_LONG'
    );
  }

  // 允许 schema.table 格式
  const parts = trimmed.split('.');
  
  if (parts.length > 2) {
    throw new ValidationError(
      '表名格式错误，最多允许一个点号 (schema.table)',
      'INVALID_TABLE_NAME_FORMAT'
    );
  }

  // 验证每个部分
  parts.forEach((part, index) => {
    const partName = index === 0 && parts.length === 2 ? 'schema' : '表名';
    
    if (!/^[a-zA-Z0-9_]+$/.test(part.trim())) {
      throw new ValidationError(
        `${partName}包含非法字符: "${tableName}". 仅允许字母、数字、下划线和点号`,
        'INVALID_TABLE_NAME_CHARS'
      );
    }

    // ✅ 新增：不允许以数字开头
    if (/^[0-9]/.test(part.trim())) {
      throw new ValidationError(
        `${partName}不能以数字开头: "${tableName}"`,
        'TABLE_NAME_STARTS_WITH_NUMBER'
      );
    }
  });
}

// ===========================
// ✅ 新增：Schema 名称验证
// ===========================

export function validateSchemaName(schemaName: string | undefined): string {
  if (!schemaName) {
    return 'public'; // 默认 schema
  }

  return normalizeIdentifier(schemaName);
}

// ===========================
// ✅ 新增：批量验证
// ===========================

export function validateQueryParams(params: {
  query?: string;
  schema?: string;
  table?: string;
}): void {
  if (params.query) {
    assertReadOnlyQuery(params.query);
  }

  if (params.schema) {
    validateSchemaName(params.schema);
  }

  if (params.table) {
    validateTableName(params.table);
  }
}

// ===========================
// ✅ 新增：安全的标识符引用
// ===========================

/**
 * 使用双引号引用标识符（PostgreSQL 规范）
 * 防止标识符与关键字冲突
 */
export function quoteIdentifier(identifier: string): string {
  const normalized = normalizeIdentifier(identifier);
  // 转义内部的双引号
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * 安全地构建表的完全限定名
 */
export function getQualifiedTableName(
  tableName: string,
  schemaName?: string
): string {
  const validatedTable = normalizeIdentifier(tableName);
  
  if (schemaName) {
    const validatedSchema = normalizeIdentifier(schemaName);
    return `${quoteIdentifier(validatedSchema)}.${quoteIdentifier(validatedTable)}`;
  }
  
  return quoteIdentifier(validatedTable);
}


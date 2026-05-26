/**
 * EXPLAIN 语句处理工具。
 *
 * DM8 的 EXPLAIN（不带 FOR）输出到控制台文本流，JDBC ResultSet 拿不到
 * 结果，返回空的 columns 和 rows。加 FOR 后，执行计划写入 ##PLAN_TABLE
 * 同时作为 ResultSet 返回，可以正常获取。
 */

export function isExplainStatement(sql: string): boolean {
  return /^EXPLAIN\s/i.test(sql.trim());
}

/**
 * 将 EXPLAIN <sql> 改写为 EXPLAIN FOR <sql>，使 JDBC 能拿到执行计划。
 * 已包含 FOR 的语句原样返回。
 */
export function rewriteExplain(sql: string): string {
  return sql.replace(/^EXPLAIN\s+(?!FOR\b)/i, 'EXPLAIN FOR ');
}

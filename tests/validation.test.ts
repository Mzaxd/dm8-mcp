import { describe, expect, it } from 'vitest';

import { assertReadOnlyQuery, normalizeIdentifier } from '../src/utils/validation.js';

describe('normalizeIdentifier', () => {
  it('uppercases valid identifiers', () => {
    expect(normalizeIdentifier('scott')).toBe('SCOTT');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeIdentifier('  scott  ')).toBe('SCOTT');
  });

  it('accepts underscore and digits after first char', () => {
    expect(normalizeIdentifier('user_1')).toBe('USER_1');
  });

  it('throws on empty string', () => {
    expect(() => normalizeIdentifier('')).toThrowError();
    expect(() => normalizeIdentifier('   ')).toThrowError();
  });

  it('throws on invalid characters', () => {
    expect(() => normalizeIdentifier('abc-123')).toThrowError();
    expect(() => normalizeIdentifier('1abc')).toThrowError();
    expect(() => normalizeIdentifier('ab$c')).toThrowError();
  });
});

describe('assertReadOnlyQuery', () => {
  it('accepts SELECT', () => {
    expect(() => assertReadOnlyQuery('select * from dual')).not.toThrow();
  });

  it('accepts SHOW / DESCRIBE / EXPLAIN prefixes', () => {
    expect(() => assertReadOnlyQuery('SHOW TABLES')).not.toThrow();
    expect(() => assertReadOnlyQuery('DESCRIBE t')).not.toThrow();
    expect(() => assertReadOnlyQuery('EXPLAIN SELECT 1')).not.toThrow();
  });

  it('accepts leading whitespace and mixed case', () => {
    expect(() => assertReadOnlyQuery('   SeLeCt 1')).not.toThrow();
  });

  it('allows a single trailing semicolon', () => {
    expect(() => assertReadOnlyQuery('SELECT 1;')).not.toThrow();
  });

  it('rejects write statements', () => {
    expect(() => assertReadOnlyQuery('update users set name = 1')).toThrow();
    expect(() => assertReadOnlyQuery('delete from users')).toThrow();
    expect(() => assertReadOnlyQuery('drop table t')).toThrow();
  });

  it('rejects multi-statement injection via semicolon', () => {
    expect(() => assertReadOnlyQuery('SELECT 1; DROP TABLE x')).toThrow();
    expect(() => assertReadOnlyQuery('SELECT 1;\nDELETE FROM t')).toThrow();
    expect(() => assertReadOnlyQuery('SELECT 1; -- c\nDROP TABLE x')).toThrow();
  });
});

// 对照 Datadog 披露的官方 Postgres MCP 只读绕过漏洞（见 docs/SECURITY.md）。
// 覆盖两类向量：多语句注入 + 会话污染，以及字符串检查的边界行为。
describe('read-only bypass vectors (Datadog CVE-style hardening)', () => {
  it('rejects COMMIT/ROLLBACK that would end a read-only transaction', () => {
    expect(() => assertReadOnlyQuery('COMMIT')).toThrow();
    expect(() => assertReadOnlyQuery('COMMIT; DROP SCHEMA x CASCADE')).toThrow();
    expect(() => assertReadOnlyQuery('ROLLBACK')).toThrow();
  });

  it('rejects session-polluting statements (SET / GRANT / ALTER)', () => {
    expect(() => assertReadOnlyQuery('SET statement_timeout TO 1')).toThrow();
    expect(() => assertReadOnlyQuery('SET ROLE DBA')).toThrow();
    expect(() => assertReadOnlyQuery('GRANT ALL TO public')).toThrow();
    expect(() => assertReadOnlyQuery('ALTER SESSION SET ...')).toThrow();
  });

  it('rejects comment-only prefixes that hide a leading keyword', () => {
    expect(() => assertReadOnlyQuery('/* bypass */ DROP TABLE x')).toThrow();
    expect(() => assertReadOnlyQuery('-- comment\nDROP TABLE x')).toThrow();
  });

  it('rejects write DDL even when SELECT appears as a substring later', () => {
    expect(() => assertReadOnlyQuery('CREATE TABLE x AS SELECT 1')).toThrow();
    expect(() => assertReadOnlyQuery('INSERT INTO t SELECT 1')).toThrow();
    expect(() => assertReadOnlyQuery('UPDATE (SELECT 1) SET a=1')).toThrow();
  });

  it('allows trailing whitespace / lone semicolon after SELECT', () => {
    expect(() => assertReadOnlyQuery('SELECT 1')).not.toThrow();
    expect(() => assertReadOnlyQuery('SELECT 1;')).not.toThrow();
    expect(() => assertReadOnlyQuery('SELECT 1;   ')).not.toThrow();
    expect(() => assertReadOnlyQuery('SELECT 1;\n')).not.toThrow();
  });
});

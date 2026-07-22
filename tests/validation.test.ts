import { describe, expect, it } from 'vitest';

import {
  assertReadOnlyQuery,
  assertReadonlyByStatementType,
  normalizeIdentifier,
} from '../src/utils/validation.js';

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

describe('assertReadonlyByStatementType', () => {
  // ponytail: 只需 getStatementInfo 字段，无需完整 Connection，测试用最小 fake
  const fakeConn = (statementType: number | undefined, shouldThrow = false) => ({
    getStatementInfo: shouldThrow
      ? async () => {
          throw new Error('prepare failed');
        }
      : async () => ({ statementType }),
  });

  it('allows SELECT type (1)', async () => {
    await expect(
      assertReadonlyByStatementType(fakeConn(1), 'SELECT 1')
    ).resolves.toBeUndefined();
  });

  it('allows EXPLAIN_PLAN type (15)', async () => {
    await expect(
      assertReadonlyByStatementType(fakeConn(15), 'EXPLAIN FOR SELECT 1')
    ).resolves.toBeUndefined();
  });

  it('rejects UPDATE/DELETE/INSERT types', async () => {
    await expect(assertReadonlyByStatementType(fakeConn(2), 'x')).rejects.toThrow();
    await expect(assertReadonlyByStatementType(fakeConn(3), 'x')).rejects.toThrow();
    await expect(assertReadonlyByStatementType(fakeConn(4), 'x')).rejects.toThrow();
  });

  it('rejects undefined statementType', async () => {
    await expect(
      assertReadonlyByStatementType(fakeConn(undefined), 'x')
    ).rejects.toThrow();
  });

  it('degrades gracefully when getStatementInfo throws', async () => {
    // SHOW/DESCRIBE 等无法 prepare 的语句降级放行（前缀检查已由调用方完成）
    await expect(
      assertReadonlyByStatementType(fakeConn(2, true), 'SHOW TABLES')
    ).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { isExplainStatement, rewriteExplain } from '../src/utils/explainHelper.js';

describe('isExplainStatement', () => {
  it('detects EXPLAIN prefix', () => {
    expect(isExplainStatement('EXPLAIN SELECT * FROM t')).toBe(true);
  });

  it('detects explain (lowercase)', () => {
    expect(isExplainStatement('explain select 1')).toBe(true);
  });

  it('detects EXPLAIN FOR', () => {
    expect(isExplainStatement('EXPLAIN FOR SELECT * FROM t')).toBe(true);
  });

  it('rejects non-EXPLAIN statements', () => {
    expect(isExplainStatement('SELECT * FROM t')).toBe(false);
  });

  it('rejects EXPLAIN embedded mid-string', () => {
    expect(isExplainStatement('SELECT EXPLAIN FROM t')).toBe(false);
  });
});

describe('rewriteExplain', () => {
  it('inserts FOR after EXPLAIN', () => {
    expect(rewriteExplain('EXPLAIN SELECT * FROM dual')).toBe(
      'EXPLAIN FOR SELECT * FROM dual'
    );
  });

  it('keeps EXPLAIN FOR unchanged', () => {
    expect(rewriteExplain('EXPLAIN FOR SELECT * FROM t')).toBe(
      'EXPLAIN FOR SELECT * FROM t'
    );
  });

  it('works case-insensitively', () => {
    expect(rewriteExplain('explain select 1')).toBe('EXPLAIN FOR select 1');
    expect(rewriteExplain('Explain For select 1')).toBe('Explain For select 1');
  });

  it('normalizes whitespace after EXPLAIN', () => {
    expect(rewriteExplain('EXPLAIN\nSELECT a FROM t')).toBe(
      'EXPLAIN FOR SELECT a FROM t'
    );
    expect(rewriteExplain('EXPLAIN\tSELECT a FROM t')).toBe(
      'EXPLAIN FOR SELECT a FROM t'
    );
  });

  it('does not double-insert FOR', () => {
    expect(rewriteExplain('EXPLAIN FOR SELECT * FROM t')).toBe(
      'EXPLAIN FOR SELECT * FROM t'
    );
  });
});

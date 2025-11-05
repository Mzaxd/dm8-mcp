import { describe, expect, it } from 'vitest';

import { assertReadOnlyQuery, normalizeIdentifier } from '../src/utils/validation.js';

describe('normalizeIdentifier', () => {
  it('should uppercase valid identifiers', () => {
    expect(normalizeIdentifier('scott')).toBe('SCOTT');
  });

  it('should throw on invalid identifiers', () => {
    expect(() => normalizeIdentifier('abc-123')).toThrowError();
  });
});

describe('assertReadOnlyQuery', () => {
  it('accepts SELECT statements', () => {
    expect(() => assertReadOnlyQuery('select * from dual')).not.toThrow();
  });

  it('rejects UPDATE statements', () => {
    expect(() => assertReadOnlyQuery('update users set name = 1')).toThrowError();
  });
});

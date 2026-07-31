import { describe, it, expect } from 'vitest';

import { extractQueriedSchemas } from '../src/tools/executeQuery.js';

describe('extractQueriedSchemas', () => {
  it('extracts schema from a single FROM-clause qualified table (case A)', () => {
    expect(
      extractQueriedSchemas(
        "SELECT * FROM CUSTOMER.MDG_TY024_DETAIL WHERE HEADER_ID=(SELECT ID FROM CUSTOMER.MDG_TY024 WHERE TRANS_ID='T024001')"
      )
    ).toEqual(['CUSTOMER']);
  });

  it('extracts schemas from cross-schema JOINs (case B)', () => {
    const sql = `SELECT l.invoice_log_id, l.pay_id, p.account_id, a.customer_code
      FROM sys_invoice_log l
      LEFT JOIN CHARGING.PY_PAY p ON p.pay_id = l.pay_id
      LEFT JOIN CUSTOMER.CM_ACCOUNT a ON a.account_id = p.account_id
      WHERE l.pay_id IS NOT NULL
      FETCH FIRST 5 ROWS ONLY`;
    // sys_invoice_log 未限定 schema 不计入；CHARGING / CUSTOMER 被识别
    expect(extractQueriedSchemas(sql).sort()).toEqual(['CHARGING', 'CUSTOMER']);
  });

  it('dedupes and uppercases (mixed-case schema refs)', () => {
    expect(
      extractQueriedSchemas('SELECT * FROM Customer.A WHERE ID IN (SELECT ID FROM customer.B)')
    ).toEqual(['CUSTOMER']);
  });

  it('returns empty when no schema-qualified tables', () => {
    expect(extractQueriedSchemas('SELECT * FROM USERS WHERE ID = 1')).toEqual([]);
  });

  it('ignores alias.column refs in WHERE/SELECT (not FROM/JOIN targets)', () => {
    // a.customer_code / a.id 是别名.列，前面不是 FROM/JOIN，不应被当成 schema
    expect(
      extractQueriedSchemas('SELECT a.customer_code FROM ACCOUNTS a WHERE a.id = 1')
    ).toEqual([]);
  });

  it('is case-insensitive on FROM/JOIN keyword', () => {
    expect(extractQueriedSchemas('select x from LOGGING.EVT join LOGGING.USR u on u.id=x.id')).toEqual(
      ['LOGGING']
    );
  });
});

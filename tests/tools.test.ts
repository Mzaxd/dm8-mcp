import { describe, it, expect, vi, beforeEach } from 'vitest';

// 捕获 registerTool 注册的 handler，便于直接调用测试，无需起完整 McpServer。
function createToolCapture() {
  const tools = new Map<
    string,
    { config: { title?: string; description?: string }; handler: (args: unknown) => Promise<unknown> }
  >();
  const server = {
    registerTool(
      name: string,
      config: { title?: string; description?: string },
      handler: (args: unknown) => Promise<unknown>
    ) {
      tools.set(name, { config, handler });
    },
    // execute_query 上报 logging 用；其余工具不调用也无妨
    sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
  };
  return { server, tools };
}

// hoisted 共享状态：每个用例改 state.result，被 mock 的 execute 返回。
const dbMock = vi.hoisted(() => {
  const state = { result: { rows: [] as unknown[] } };
  const execute = vi.fn(async () => state.result);
  return { state, execute };
});

vi.mock('dmdb', () => {
  const fakeConn = {
    execute: dbMock.execute,
    close: vi.fn(async () => undefined),
  };
  const fakePool = {
    getConnection: vi.fn(async () => fakeConn),
    close: vi.fn(async () => undefined),
    connectionsOpen: 1,
  };
  return {
    default: {
      OUT_FORMAT_OBJECT: 0,
      OUT_FORMAT_ARRAY: 4001,
      CLOB: 2017,
      BLOB: 2019,
      createPool: vi.fn(async () => fakePool),
    },
  };
});

vi.mock('../src/config.js', () => ({
  getConfig: () => ({}),
  getConnectionByName: () => ({
    name: 'default',
    host: 'h',
    port: '5236',
    username: 'u',
    password: 'p',
    schema: 'SCOTT',
  }),
  getConfiguredConnections: () => [
    {
      name: 'default',
      host: 'h',
      port: '5236',
      username: 'u',
      password: 'p',
      schema: 'SCOTT',
    },
  ],
  getConfiguredSchemas: () => [{ name: 'SCOTT' }],
}));

import { registerDescribeTableTool } from '../src/tools/describeTable.js';
import { registerExecuteQueryTool } from '../src/tools/executeQuery.js';
import { registerListIndexesTool } from '../src/tools/listIndexes.js';

describe('describe_table tool', () => {
  beforeEach(() => {
    dbMock.state.result = { rows: [] };
    dbMock.execute.mockClear();
  });

  it('joins ALL_COL_COMMENTS and appends non-empty comments', async () => {
    dbMock.state.result = {
      rows: [
        { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', DATA_LENGTH: 22, NULLABLE: 'N', COMMENTS: '主键' },
        { COLUMN_NAME: 'NAME', DATA_TYPE: 'VARCHAR2', DATA_LENGTH: 100, NULLABLE: 'Y', COMMENTS: null },
      ],
    };
    const { server, tools } = createToolCapture();
    registerDescribeTableTool(server as never);

    const res = (await tools.get('describe_table')!.handler({ table: 'USERS' })) as {
      content: { text: string }[];
      structuredContent: { columns: string[]; rows: unknown[]; table: string };
    };

    const sql = String(dbMock.execute.mock.calls[0][0]);
    expect(sql).toContain('ALL_COL_COMMENTS');
    // 有注释的列追加 -- 主键；无注释的不追加
    expect(res.content[0].text).toContain('ID NUMBER(22) N  -- 主键');
    expect(res.content[0].text).toContain('NAME VARCHAR2(100) Y');
    expect(res.content[0].text).not.toMatch(/Y\s+--/);
    expect(res.structuredContent.columns).toEqual([
      'COLUMN_NAME',
      'DATA_TYPE',
      'DATA_LENGTH',
      'NULLABLE',
      'COMMENTS',
    ]);
    expect(res.structuredContent.table).toBe('USERS');
  });

  it('returns isError when table not found', async () => {
    dbMock.state.result = { rows: [] };
    const { server, tools } = createToolCapture();
    registerDescribeTableTool(server as never);

    const res = (await tools.get('describe_table')!.handler({ table: 'NOPE' })) as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('SCOTT.NOPE');
  });

  it('uppercases and validates the table identifier', async () => {
    dbMock.state.result = { rows: [] };
    const { server, tools } = createToolCapture();
    registerDescribeTableTool(server as never);

    await tools.get('describe_table')!.handler({ table: 'users' });
    const binds = dbMock.execute.mock.calls[0][1] as { table: string };
    expect(binds.table).toBe('USERS');
  });

  it('rejects invalid table identifier', async () => {
    const { server, tools } = createToolCapture();
    registerDescribeTableTool(server as never);

    const res = (await tools.get('describe_table')!.handler({ table: 'a;b' })) as {
      isError: boolean;
    };
    expect(res.isError).toBe(true);
  });
});

describe('list_indexes tool', () => {
  beforeEach(() => {
    dbMock.state.result = { rows: [] };
    dbMock.execute.mockClear();
  });

  it('folds multi-column index rows into one line', async () => {
    dbMock.state.result = {
      rows: [
        { INDEX_NAME: 'PK_USERS', UNIQUENESS: 'UNIQUE', COLUMN_NAME: 'ID', COLUMN_POSITION: 1 },
        { INDEX_NAME: 'UK_EMAIL', UNIQUENESS: 'UNIQUE', COLUMN_NAME: 'EMAIL', COLUMN_POSITION: 1 },
        { INDEX_NAME: 'IDX_NAME', UNIQUENESS: 'NONUNIQUE', COLUMN_NAME: 'LAST', COLUMN_POSITION: 1 },
        { INDEX_NAME: 'IDX_NAME', UNIQUENESS: 'NONUNIQUE', COLUMN_NAME: 'FIRST', COLUMN_POSITION: 2 },
      ],
    };
    const { server, tools } = createToolCapture();
    registerListIndexesTool(server as never);

    const res = (await tools.get('list_indexes')!.handler({ table: 'USERS' })) as {
      content: { text: string }[];
      structuredContent: { indexes: { indexName: string; columns: string[] }[] };
    };

    const sql = String(dbMock.execute.mock.calls[0][0]);
    expect(sql).toContain('ALL_INDEXES');
    expect(sql).toContain('ALL_IND_COLUMNS');
    // IDX_NAME 两列折叠成一行
    expect(res.content[0].text).toContain('IDX_NAME [NONUNIQUE] (LAST, FIRST)');
    expect(res.structuredContent.indexes).toHaveLength(3);
    const idxName = res.structuredContent.indexes.find((i) => i.indexName === 'IDX_NAME');
    expect(idxName?.columns).toEqual(['LAST', 'FIRST']);
  });

  it('returns friendly message when no indexes', async () => {
    dbMock.state.result = { rows: [] };
    const { server, tools } = createToolCapture();
    registerListIndexesTool(server as never);

    const res = (await tools.get('list_indexes')!.handler({ table: 'BARE' })) as {
      content: { text: string }[];
      structuredContent: { indexes: unknown[] };
    };
    expect(res.content[0].text).toContain('未找到索引');
    expect(res.structuredContent.indexes).toEqual([]);
  });
});

describe('execute_query tool', () => {
  beforeEach(() => {
    dbMock.state.result = { rows: [] };
    dbMock.execute.mockClear();
  });

  it('passes driver-level maxRows = rowLimit + 1 to execute', async () => {
    dbMock.state.result = { rows: [{ A: 1 }, { A: 2 }] };
    const { server, tools } = createToolCapture();
    registerExecuteQueryTool(server as never);

    await tools.get('execute_query')!.handler({ query: 'SELECT * FROM DUAL', maxRows: 10 });
    // execute(sql, binds, options) —— 第三参数为驱动层 maxRows
    const opts = dbMock.execute.mock.calls[0][2] as { maxRows: number };
    expect(opts.maxRows).toBe(11);
  });

  it('marks truncated and slices when rows exceed maxRows', async () => {
    dbMock.state.result = { rows: [{ A: 1 }, { A: 2 }, { A: 3 }, { A: 4 }] };
    const { server, tools } = createToolCapture();
    registerExecuteQueryTool(server as never);

    const res = (await tools
      .get('execute_query')!
      .handler({ query: 'SELECT * FROM DUAL', maxRows: 3 })) as {
      structuredContent: { truncated: boolean; rows: unknown[]; rowCount: number };
    };
    expect(res.structuredContent.truncated).toBe(true);
    expect(res.structuredContent.rows).toHaveLength(3);
    expect(res.structuredContent.rowCount).toBe(3);
  });

  it('does not mark truncated when within maxRows', async () => {
    dbMock.state.result = { rows: [{ A: 1 }, { A: 2 }] };
    const { server, tools } = createToolCapture();
    registerExecuteQueryTool(server as never);

    const res = (await tools
      .get('execute_query')!
      .handler({ query: 'SELECT * FROM DUAL', maxRows: 10 })) as {
      structuredContent: { truncated: boolean; rowCount: number };
    };
    expect(res.structuredContent.truncated).toBe(false);
    expect(res.structuredContent.rowCount).toBe(2);
  });

  it('rejects non-read-only query before touching the DB', async () => {
    const { server, tools } = createToolCapture();
    registerExecuteQueryTool(server as never);

    const res = (await tools.get('execute_query')!.handler({ query: 'DROP TABLE x' })) as {
      isError: boolean;
    };
    expect(res.isError).toBe(true);
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it('emits a logging notification per successful query', async () => {
    dbMock.state.result = { rows: [{ A: 1 }] };
    const { server, tools } = createToolCapture();
    registerExecuteQueryTool(server as never);

    await tools.get('execute_query')!.handler({ query: 'SELECT 1 FROM DUAL' });
    expect(server.sendLoggingMessage).toHaveBeenCalledTimes(1);
    const params = server.sendLoggingMessage.mock.calls[0][0] as {
      level: string;
      logger: string;
      data: { query: string; slow: boolean };
    };
    expect(params.logger).toBe('dm8.execute_query');
    expect(params.level).toBe('info');
    expect(params.data.query).toBe('SELECT 1 FROM DUAL');
    expect(params.data.slow).toBe(false);
  });

  it('emits an error-level log on failure', async () => {
    const { server, tools } = createToolCapture();
    registerExecuteQueryTool(server as never);

    await tools.get('execute_query')!.handler({ query: 'DROP TABLE x' });
    const params = server.sendLoggingMessage.mock.calls[0][0] as {
      level: string;
      data: { error: string };
    };
    expect(params.level).toBe('error');
    expect(params.data.error).toContain('仅允许');
  });
});

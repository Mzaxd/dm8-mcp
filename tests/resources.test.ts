import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  getConnectionByName: (name: string) => ({
    name,
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
      schemas: [{ name: 'SCOTT' }],
    },
  ],
  getConfiguredSchemas: () => [{ name: 'SCOTT' }],
}));

import { registerTableResource } from '../src/resources/tableResource.js';

function captureResource() {
  const captured: {
    name?: string;
    template?: { uriTemplate: { template: string }; listCallback?: () => Promise<unknown> };
    config?: { title?: string; description?: string };
    readCallback?: (uri: URL, variables: Record<string, string>) => Promise<unknown>;
  } = {};
  const server = {
    registerResource(
      name: string,
      template: { uriTemplate: { template: string }; listCallback?: () => Promise<unknown> },
      config: { title?: string; description?: string },
      readCallback: (uri: URL, variables: Record<string, string>) => Promise<unknown>
    ) {
      Object.assign(captured, { name, template, config, readCallback });
    },
  };
  return { server, captured };
}

describe('table-schema resource', () => {
  beforeEach(() => {
    dbMock.state.result = { rows: [] };
    dbMock.execute.mockClear();
  });

  it('registers a dm8:///{connection}/{schema}/{table} template with a list callback', () => {
    const { server, captured } = captureResource();
    registerTableResource(server as never);
    expect(captured.name).toBe('table-schema');
    expect(captured.template!.uriTemplate.template).toBe('dm8:///{connection}/{schema}/{table}');
    expect(typeof captured.template!.listCallback).toBe('function');
  });

  it('read callback returns formatted column text with comments', async () => {
    dbMock.state.result = {
      rows: [
        { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', DATA_LENGTH: 22, NULLABLE: 'N', COMMENTS: '主键' },
        { COLUMN_NAME: 'NAME', DATA_TYPE: 'VARCHAR2', DATA_LENGTH: 100, NULLABLE: 'Y', COMMENTS: null },
      ],
    };
    const { server, captured } = captureResource();
    registerTableResource(server as never);

    const res = (await captured.readCallback!(new URL('dm8:///default/SCOTT/USERS'), {
      connection: 'default',
      schema: 'SCOTT',
      table: 'users',
    })) as { contents: { uri: URL; mimeType: string; text: string }[] };

    expect(res.contents).toHaveLength(1);
    expect(res.contents[0].mimeType).toBe('text/plain');
    expect(res.contents[0].text).toContain('ID NUMBER(22) N  -- 主键');
    expect(res.contents[0].text).toContain('NAME VARCHAR2(100) Y');
    // table 标识符被规范化为大写
    const binds = dbMock.execute.mock.calls[0][1] as { table: string };
    expect(binds.table).toBe('USERS');
  });

  it('read callback returns placeholder when table not found', async () => {
    dbMock.state.result = { rows: [] };
    const { server, captured } = captureResource();
    registerTableResource(server as never);

    const res = (await captured.readCallback!(new URL('dm8:///default/SCOTT/NOPE'), {
      connection: 'default',
      schema: 'SCOTT',
      table: 'NOPE',
    })) as { contents: { text: string }[] };
    expect(res.contents[0].text).toContain('未找到表 SCOTT.NOPE');
  });

  it('list callback enumerates tables across configured connections', async () => {
    dbMock.state.result = {
      rows: [{ TABLE_NAME: 'USERS' }, { TABLE_NAME: 'ORDERS' }],
    };
    const { server, captured } = captureResource();
    registerTableResource(server as never);

    const res = (await captured.template!.listCallback!()) as {
      resources: { uri: string; name: string }[];
    };
    expect(res.resources).toHaveLength(2);
    expect(res.resources[0].uri).toBe('dm8:///default/SCOTT/USERS');
    expect(res.resources[1].uri).toBe('dm8:///default/SCOTT/ORDERS');
  });
});

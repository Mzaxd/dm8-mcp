import { describe, it, expect, vi } from 'vitest';

// 捕获 registerTool 注册的 handler，直接调用测试，无需起完整 McpServer。
function createToolCapture() {
  const tools = new Map<string, { handler: (args: unknown) => Promise<unknown> }>();
  const server = {
    registerTool(
      name: string,
      _config: unknown,
      handler: (args: unknown) => Promise<unknown>
    ) {
      tools.set(name, { handler });
    },
    sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
  };
  return { server, tools };
}

const dbMock = vi.hoisted(() => {
  const state = { result: { rows: [] as unknown[] } };
  const execute = vi.fn(async () => state.result);
  return { state, execute };
});

vi.mock('dmdb', () => {
  const fakeConn = { execute: dbMock.execute, close: vi.fn(async () => undefined) };
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

// 关键：两个连接共享 CUSTOMER schema —— 这是跨连接查错的典型场景，
// list_schemas 必须把它标为 ambiguous 并在文本输出里警告。
vi.mock('../src/config.js', () => ({
  getConfig: () => ({}),
  getConfiguredConnections: () => [
    {
      name: 'dev-GAS',
      host: 'h1',
      port: '5236',
      username: 'u',
      password: 'p',
      schema: 'GASBASE',
      schemas: [{ name: 'GASBASE' }, { name: 'CUSTOMER' }],
      description: '开发环境',
    },
    {
      name: 'prod-CUSTOMER',
      host: 'h2',
      port: '5236',
      username: 'u',
      password: 'p',
      schema: 'CUSTOMER',
      schemas: [{ name: 'CUSTOMER' }],
      description: '生产环境，慎用',
    },
  ],
  getConfiguredSchemas: () => [{ name: 'GASBASE' }, { name: 'CUSTOMER' }],
  getConnectionByName: () => undefined,
}));

import { registerListSchemasTool } from '../src/tools/listSchemas.js';

describe('list_schemas tool', () => {
  it('flags schemas shared across multiple connections as ambiguous', async () => {
    const { server, tools } = createToolCapture();
    registerListSchemasTool(server as never);

    const result = (await tools.get('list_schemas')!.handler({})) as {
      structuredContent: {
        ambiguousSchemas: Record<string, string[]>;
      };
      content: { text: string }[];
    };

    // CUSTOMER 同时属于 dev-GAS 和 prod-CUSTOMER —— 必须标为歧义
    expect(result.structuredContent.ambiguousSchemas.CUSTOMER).toEqual([
      'dev-GAS',
      'prod-CUSTOMER',
    ]);
    // GASBASE 只属于 dev-GAS，不应进歧义列表
    expect(result.structuredContent.ambiguousSchemas.GASBASE).toBeUndefined();
    // 文本输出必须带可操作的警告行
    expect(result.content[0].text).toMatch(/CUSTOMER → dev-GAS, prod-CUSTOMER/);

    // 安全回归：连接目录里的 password 必须被剔除，绝不外泄给 client/LLM
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/password/i);
  });
});

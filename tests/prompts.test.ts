import { describe, it, expect } from 'vitest';

import { registerPrompts } from '../src/prompts/index.js';

function capturePrompts() {
  const prompts = new Map<
    string,
    { config: { title?: string; description?: string }; cb: (args: unknown) => Promise<unknown> }
  >();
  const server = {
    registerPrompt(
      name: string,
      config: { title?: string; description?: string },
      cb: (args: unknown) => Promise<unknown>
    ) {
      prompts.set(name, { config, cb });
    },
  };
  return { server, prompts };
}

describe('prompts', () => {
  it('registers explore-schema and analyze-table', () => {
    const { server, prompts } = capturePrompts();
    registerPrompts(server as never);
    expect(prompts.has('explore-schema')).toBe(true);
    expect(prompts.has('analyze-table')).toBe(true);
  });

  it('explore-schema embeds connection/schema and lists the workflow', async () => {
    const { server, prompts } = capturePrompts();
    registerPrompts(server as never);

    const res = (await prompts.get('explore-schema')!.cb({
      connection: 'gasbase',
      schema: 'GASBASE',
    })) as { messages: { role: string; content: { text: string } }[] };

    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].role).toBe('assistant');
    expect(res.messages[0].content.text).toContain('gasbase / GASBASE');
    expect(res.messages[0].content.text).toContain('list_tables');
    expect(res.messages[0].content.text).toContain('describe_table');
    expect(res.messages[0].content.text).toContain('list_indexes');
  });

  it('explore-schema falls back to default when no args', async () => {
    const { server, prompts } = capturePrompts();
    registerPrompts(server as never);

    const res = (await prompts.get('explore-schema')!.cb({})) as {
      messages: { content: { text: string } }[];
    };
    expect(res.messages[0].content.text).toContain('默认连接 / schema');
  });

  it('analyze-table embeds the table name and COUNT probe', async () => {
    const { server, prompts } = capturePrompts();
    registerPrompts(server as never);

    const res = (await prompts.get('analyze-table')!.cb({
      table: 'ORDERS',
      schema: 'SALES',
    })) as { messages: { content: { text: string } }[] };
    expect(res.messages[0].content.text).toContain('ORDERS');
    expect(res.messages[0].content.text).toContain('SALES');
    expect(res.messages[0].content.text).toContain('COUNT(*)');
  });
});

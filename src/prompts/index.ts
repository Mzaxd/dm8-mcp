import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * 注册 MCP prompts。prompt 是预定义的、带参数的指令模板，client 调 prompts/get
 * 取回后注入 LLM 上下文，把"怎么查 DB"的最佳实践固化下来，减少 LLM 乱试。
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'explore-schema',
    {
      title: '探查数据库 Schema',
      description: '生成系统化探查指定连接/schema 的指令：先列表，再按需描述与索引',
      argsSchema: {
        connection: z.string().optional().describe('连接名'),
        schema: z.string().optional().describe('Schema 名'),
      },
    },
    async ({ connection, schema }) => {
      const where =
        [connection, schema].filter(Boolean).join(' / ') || '默认连接 / schema';
      return {
        messages: [
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: [
                `系统探查 ${where}：`,
                '1) 先调 list_tables 获取该 schema 的全部表名；',
                '2) 挑出业务相关的表，逐一 describe_table 获取列定义与列注释（ALL_COL_COMMENTS）；',
                '3) 对查询关键的表调 list_indexes 了解索引与唯一约束；',
                '4) 汇报：表清单 → 重要表的字段含义 → 建议的查询入口。',
                '全程只读，禁止推测不存在的列名，一切以 describe_table 返回为准。',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'analyze-table',
    {
      title: '分析表结构与数据',
      description: '生成单表结构、索引、数据分布的只读分析指令',
      argsSchema: {
        table: z.string().describe('表名'),
        connection: z.string().optional().describe('连接名'),
        schema: z.string().optional().describe('Schema 名'),
      },
    },
    async ({ table, connection, schema }) => {
      const target = [connection, schema].filter(Boolean).join(' / ');
      const where = target ? `（${target}）` : '';
      return {
        messages: [
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: [
                `分析表 ${table}${where}：`,
                '1) describe_table 拿到列、类型、是否可空、列注释；',
                '2) list_indexes 拿到索引、唯一约束、索引列；',
                '3) execute_query 用只读 SELECT 摸数据特征：',
                '   - SELECT COUNT(*) FROM <table> 了解规模；',
                '   - 对枚举/状态列 SELECT DISTINCT <col>, COUNT(*) … GROUP BY 了解分布；',
                '   - 对时间列 SELECT MIN/MAX 了解时间范围。',
                '输出：字段含义表、索引评估、数据分布摘要、潜在查询风险（如全表扫描）。',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );
}

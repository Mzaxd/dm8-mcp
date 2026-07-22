<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-26 | Updated: 2026-02-26 -->

# tools

## Purpose
MCP 工具实现层，提供三个核心数据库操作工具：列出表、描述表结构、执行只读查询。每个工具独立注册到 MCP 服务器。

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | 工具注册入口，统一导出 `registerTools` 函数 |
| `listTables.ts` | `list_tables` 工具 - 列出指定 Schema 下的所有表 |
| `describeTable.ts` | `describe_table` 工具 - 显示表的列结构信息 |
| `executeQuery.ts` | `execute_query` 工具 - 执行只读 SQL 查询 |

## Subdirectories

无子目录。

## For AI Agents

### Working In This Directory
- 每个工具独立文件，遵循单一职责原则
- 工具使用 Zod 定义输入 schema
- 所有工具返回标准 MCP 响应格式
- 错误处理统一使用 `isError: true` 标记

### Testing Requirements
- 测试应覆盖正常流程和错误情况
- 验证 SQL 注入防护
- 验证只读查询限制

### Common Patterns
```typescript
// 工具注册模式
export function registerXxxTool(server: McpServer): void {
  server.registerTool(
    'tool_name',
    {
      title: '工具标题',
      description: '工具描述',
      inputSchema: { /* Zod schema */ },
    },
    async (params) => {
      // 1. 解析目标连接与 schema（含白名单校验）
      const target = resolveTargetConnection({ connection: params.connection, schema: params.schema });

      // 2. 执行数据库操作（withDmConnection 自动借还连接）
      const result = await withDmConnection(target, async (conn) => {
        return conn.execute(sql, bindParams);
      });

      // 3. 返回结果（content + structuredContent）
      return { content: [{ type: 'text', text: result }] };
    }
  );
}
```

## Dependencies

### Internal
- `../config.js` - 获取数据库配置
- `../utils/db.js` - 数据库连接管理
- `../utils/validation.js` - 输入验证和安全检查

### External
- `@modelcontextprotocol/sdk` - McpServer 类型
- `zod` - 输入 schema 定义和验证

## Tool Details

### list_tables
| 属性 | 值 |
|------|------|
| 名称 | `list_tables` |
| 描述 | 列出指定 Schema 下的所有表名 |
| 参数 | `schema` (可选) - 数据库 Schema |
| SQL | `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :owner` |

### describe_table
| 属性 | 值 |
|------|------|
| 名称 | `describe_table` |
| 描述 | 返回列名、类型、长度以及是否可空信息 |
| 参数 | `schema` (可选), `table` (必填) |
| SQL | `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE FROM ALL_TAB_COLUMNS WHERE OWNER = :owner AND TABLE_NAME = :table` |
| 输出 | 文本格式 + `structuredContent` |

### execute_query
| 属性 | 值 |
|------|------|
| 名称 | `execute_query` |
| 描述 | 仅允许 SELECT/SHOW/DESCRIBE/EXPLAIN 语句 |
| 参数 | `connection` (可选), `schema` (可选), `query` (必填), `maxRows` (可选, 默认 1000) |
| 安全 | 调用 `assertReadOnlyQuery()` 验证 |
| 输出 | `content` 为 TSV 预览（前 50 行），`structuredContent` 含完整 rows + `truncated` 标记 |

## Error Handling

```typescript
// 标准错误返回格式
catch (error) {
  const message = error instanceof ValidationError || error instanceof Error
    ? error.message
    : '未知错误';
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
```

<!-- MANUAL: -->

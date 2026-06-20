# MCP 协议支持对比：外部工具扩展

## Coder MCP 支持

### 现状
**Coder 目前没有 MCP（Model Context Protocol）支持。**

## Claude Code MCP 系统

### MCP 架构
```
MCP Client (Claude Code) ←STDIO/HTTP→ MCP Server (外部工具)
                                      ↓
                                 发现工具列表
                                 发现 Resources
                                 发现 Prompts
```

### MCP 工具集成
- MCP Server 提供的工具通过 `mcpInfo` 字段标记来源：
  ```typescript
  mcpInfo?: { serverName: string; toolName: string }
  ```
- 工具名支持两种模式：有前缀（`mcp__server__tool`）和无前缀
- `inputJSONSchema` 直接使用 JSON Schema（非 Zod），因为 schema 来自远程协议
- 通过 `filterToolsByDenyRules()` 支持 `mcp__server` 前缀的 blanket deny 规则

### MCP 工具列表
| 工具 | 用途 |
|------|------|
| **MCPTool** | 调用 MCP Server 提供的工具 |
| **ListMcpResourcesTool** | 列出 MCP Server 的资源 |
| **ReadMcpResourceTool** | 读取指定 MCP 资源 |
| **McpAuthTool** | MCP 服务器认证 |

### MCP Skills
- MCP Server 的 prompt 通过 `mcpSkillBuilders.ts` 转换为 Skill Command
- 标记为 `loadedFrom: 'mcp'`
- **安全边界**：MCP Skills 的 Prompt 禁止执行内联 shell 命令（远程内容不可信）

### MCP Elicitation
- MCP Server 可请求用户输入（Elicitation Protocol, -32042）
- `handleElicitation()` 回调处理 URL 确认对话框
- Elicitation Hook 控制用户输入对话框的显示

### MCP 连接管理
- STDIO 传输（本地进程）和 HTTP 传输（远程服务）
- 连接池管理（复用连接减少启动开销）
- 连接状态监控（断线重连）

## Coder 可学习的思想

### 1. MCP 作为扩展基石
MCP 是 AI 工具生态的统一协议。支持 MCP 意味着可以连接数百个外部工具服务器（数据库、API、云服务、IDE 等），无需为每个工具单独编写代码。

**建议**：Coder 应将 MCP 客户端支持列为高优先级功能。可通过独立的 MCP 管理页面配置服务器连接。

### 2. MCP 工具自动发现
MCP Server 启动后，Claude Code 自动发现其提供的工具列表并注册到工具系统。新工具立即可用，无需重启。

**建议**：Coder 的 MCP 客户端应支持热插拔——连接/断开 MCP Server 时动态更新可用工具列表。

### 3. 安全设计
- **Blanket Deny**：支持 `mcp__server` 前缀的服务器级别拒绝规则
- **内容隔离**：MCP Skills 禁止执行内联 shell 命令
- **认证协议**：McpAuthTool 处理 OAuth 等认证流程

**建议**：Coder 的 MCP 实现必须包含安全边界——默认 Ask 模式、服务器级别权限控制、远程内容沙箱。

### 4. MCP Resources
除了工具，MCP Server 还可提供 Resources（可读数据源）。`ReadMcpResourceTool` 允许 AI 读取这些资源。

**建议**：Coder 支持 MCP Resources 可以让 AI 访问数据库查询结果、API 文档等动态数据源。

### 5. 实现策略
MCP 协议有成熟的 TypeScript SDK (`@modelcontextprotocol/sdk`)，集成成本相对较低。

**Phase 1**（基础）：
- STDIO 传输的 MCP Client
- 工具发现和调用
- 基本的权限控制

**Phase 2**（增强）：
- HTTP 传输支持
- Resources 读取
- Prompts 映射为 Skills

**Phase 3**（高级）：
- Elicitation 协议
- 连接池管理
- MCP Skill 市场

## 补充：Coder 当前的 Web 工具替代方案

Coder 目前有 `web_search` 和 `browse_page` 工具提供有限的 Web 能力。MCP 可以将这些能力扩展到任意外部服务（GitHub API、Jira、数据库等），是更通用的解决方案。

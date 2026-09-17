# icourse163-mcp

中国大学MOOC（[icourse163.org](https://www.icourse163.org)）本机 **stdio MCP**。

对齐 [K4F7/chaoxing-mcp](https://github.com/K4F7/chaoxing-mcp) / [K4F7/pu-mcp](https://github.com/K4F7/pu-mcp)：

- 本地进程，stdio；不托管远端会话
- 登录只走 CLI / 环境变量；MCP 工具不收密码
- 首个工具：`list_todos`（未交作业 / 测验等仍开放待办）

## 状态

脚手架与 MVP 由专仓 bot 按 `ready-for-agent` issue 推进（本机 grok build）。

## 非目标（MVP 不做）

- 代写 / 代交作业
- 抢课 / 刷课
- 把账号密码放进 MCP 工具参数

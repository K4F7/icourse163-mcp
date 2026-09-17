# icourse163-mcp

中国大学MOOC（[icourse163.org](https://www.icourse163.org)）本机 **stdio MCP**。

对齐 [K4F7/chaoxing-mcp](https://github.com/K4F7/chaoxing-mcp) / [K4F7/pu-mcp](https://github.com/K4F7/pu-mcp)：

- 本地进程，stdio；不托管远端会话
- 登录只走 CLI / 环境变量；MCP 工具不收密码
- 首个工具：`list_todos`（未交作业 / 测验等仍开放待办）

## 安装 / 启动

```sh
npm ci
npm start --silent
```

`--silent` 避免 npm 横幅写进 stdout（会破坏 MCP JSON-RPC）。stdin 保持打开时进程不应退出。

Grok Bot / Cursor 的 AddMcpServer **没有 cwd**，必须用绝对路径启动。配置示例见 [docs/mcp.md](docs/mcp.md)。

登录只走 CLI（MCP 工具不收密码）。Cookie 粘贴或 Playwright 账密、如何确认 / 清除会话：见 [docs/login.md](docs/login.md)。

```sh
npm run login --silent -- --cookie-file /path/to/cookie.txt
npm run login --silent -- --check
```

当前 `list_todos` 仍是骨架占位（`not_implemented`）；真实待办拉取是后续 issue。

## 状态

脚手架与 MVP 由专仓 bot 按 `ready-for-agent` issue 推进（本机 grok build）。

## 非目标（MVP 不做）

- 代写 / 代交作业
- 抢课 / 刷课
- 把账号密码放进 MCP 工具参数

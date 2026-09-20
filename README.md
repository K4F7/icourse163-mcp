# icourse163-mcp

中国大学MOOC（[icourse163.org](https://www.icourse163.org)）本机 **stdio MCP**。

对齐 [K4F7/chaoxing-mcp](https://github.com/K4F7/chaoxing-mcp) / [K4F7/pu-mcp](https://github.com/K4F7/pu-mcp)：

- 本地进程，stdio；不托管远端会话
- 登录只走 CLI / 环境变量；MCP 工具不收密码
- 首个工具：`list_todos`（未交作业 / 测验等仍开放待办）

产品目标尽量对齐 [OCS 中国大学MOOC 脚本](https://github.com/ocsjs/ocsjs/blob/4.0/packages/scripts/src/projects/icourse.ts) 的学习自动化；**明确不做考试代交**。

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

`list_todos` 列出仍开放的作业 / 测验 / 考试（未完成、未交、可作答）。`status: ok` 且 `todos` 为空表示确实没有开放待办；认证失效是 `auth_expired`（`isError`），不会伪装成空成功。工具不接收、不返回 cookie 或密码。

## 已有能力

- CLI 登录（cookie 文件 / Playwright 账密；见 [docs/login.md](docs/login.md)）
- MCP 工具 `list_todos`：列出仍开放的作业 / 测验 / 考试待办

## 目标能力（后续 issue）

对齐 OCS 的学习自动化范围。实现路径可选用本仓既有 **RPC** 风格、参考 OCS 的 **DOM/Playwright**，或二者混合——由后续 issue 细化：

- **自动看课**：视频 / 音频 / PPT 等学习单元推进
- **随堂测验辅助**：读题与作答辅助
- **作业辅助**：读题 / 作答；是否正式提交须由工具参数**显式**控制，默认草稿或预览

## 非目标

- **考试代交**（不做）
- 抢课
- 把账号密码放进 MCP 工具参数

## 状态

脚手架与 MVP 由专仓 bot 按 `ready-for-agent` issue 推进（本机 grok build）。

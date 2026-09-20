# icourse163-mcp

中国大学MOOC（[icourse163.org](https://www.icourse163.org)）本机 **stdio MCP**。

对齐 [K4F7/chaoxing-mcp](https://github.com/K4F7/chaoxing-mcp) / [K4F7/pu-mcp](https://github.com/K4F7/pu-mcp)：

- 本地进程，stdio；不托管远端会话
- 登录只走 CLI / 环境变量；MCP 工具不收密码
- 工具：`list_todos`（仍开放待办）、`list_courses`（已选课）、`list_term_units`（课件目录 lesson→unit）、`study_unit`（视频/音频进度推进）

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
- MCP 工具 `list_courses` / `list_term_units`：已选课与课件目录
- MCP 工具 `study_unit`：对视频单元 RPC 推进学习进度（见 docs/mcp.md 限制与检测风险）

## 目标能力（后续 issue）

对齐 OCS 的学习自动化范围。实现路径可选用本仓既有 **RPC** 风格、参考 OCS 的 **DOM/Playwright**，或二者混合——由后续 issue 细化：

- **自动看课**：视频/音频已由 `study_unit` 覆盖（RPC）；PPT/文档见后续 issue
- **测验 / 作业辅助**（工具语义与后续 #17 对齐）：固定流水线

  `read`（结构化题干 + 选项）→ AI 填答 → **`save` 必调（保存草稿）** →（可选）用户检查确认后才显式 `submit`

  - **作业**：AI 作答后**必须**调 `save`；再等用户检查后才显式 `submit`
  - **考试**：代交仍不做；若做读题 + AI 作答，同样**必须** `save`，**绝不**自动提交
  - **默认不交**：`submit` 仅在用户确认后显式调用
  - **视频弹窗题**：复用同一套读题 + 预选 / `save`，勿静默提交

## 非目标

- **考试代交**（不做；不做自动 `submit`）
- 抢课
- 把账号密码放进 MCP 工具参数

## 状态

脚手架与 MVP 由专仓 bot 按 `ready-for-agent` issue 推进（本机 grok build）。

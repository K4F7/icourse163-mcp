# 中国大学MOOC MCP（stdio）

本仓库根目录就是给 Grok Bot / Cursor 用的本机 stdio MCP。体验对齐 [K4F7/chaoxing-mcp](https://github.com/K4F7/chaoxing-mcp) / [K4F7/pu-mcp](https://github.com/K4F7/pu-mcp)：一个进程、stdio、凭据不进工具参数。

工具目前只有 `list_todos`。登录只走 CLI，见 [docs/login.md](login.md)。MCP 从不接收或返回 cookie / 密码。

产品目标对齐 OCS 学习自动化（自动看课、测验/作业辅助；**考试代交不做**），详见仓库根 [README](../README.md)。答卷流水线：`read` → AI 填答 → **`save` 必调（草稿）** → 用户确认后才显式 `submit`（默认不交）。实现可用 RPC 或 DOM/Playwright（或混合），由后续 issue 细化。

## 安装

在仓库根：

```sh
npm ci
```

启动（`--silent` 避免 npm 把脚本横幅写进 stdout，否则会破坏 MCP JSON-RPC）：

```sh
npm start --silent
```

`package.json` 的 `start` 是 `node --import tsx src/stdio.ts`。stdin 保持打开时进程不应退出。

也可直接跑仓库里的包装脚本（自己 `cd` 到仓库根再 `exec`）：

```sh
/ABS/PATH/TO/icourse163-mcp/scripts/run-mcp.sh
```

## 挂到 Grok Bot / Cursor（AddMcpServer **没有 cwd**）

Grok Bot 的 AddMcpServer **不提供 cwd**，必须用绝对路径启动。不要依赖客户端帮你 `cd` 进仓库。把下面的 `/ABS/PATH/TO/icourse163-mcp` 换成本机仓库的真实绝对路径。不要把 cookie、账号或密码写进 MCP 配置或 `list_todos` 参数。先在仓库根 `npm run login`（cookie 文件或 Playwright 环境变量），确认 `LOGIN_OK has_cookie=true` 后再挂 MCP。

### 方式 A：绝对路径包装脚本（推荐）

command = `scripts/run-mcp.sh` 的绝对路径，args 为空。

```json
{
  "command": "/ABS/PATH/TO/icourse163-mcp/scripts/run-mcp.sh",
  "args": []
}
```

Cursor `mcpServers`：

```json
{
  "mcpServers": {
    "icourse163": {
      "command": "/ABS/PATH/TO/icourse163-mcp/scripts/run-mcp.sh",
      "args": []
    }
  }
}
```

Grok Bot user-scope TOML：

```toml
[mcp_servers.icourse163]
command = "/ABS/PATH/TO/icourse163-mcp/scripts/run-mcp.sh"
args = []
startup_timeout_sec = 60
```

### 方式 B：`npm start --silent --prefix`（绝对路径）

command = `"npm"`。`--prefix` 必须是仓库根的绝对路径；`--silent` 必填，避免 npm 横幅破坏 stdout 上的 JSON-RPC。

```json
{
  "command": "npm",
  "args": ["start", "--silent", "--prefix", "/ABS/PATH/TO/icourse163-mcp"]
}
```

Cursor：

```json
{
  "mcpServers": {
    "icourse163": {
      "command": "npm",
      "args": ["start", "--silent", "--prefix", "/ABS/PATH/TO/icourse163-mcp"]
    }
  }
}
```

```toml
[mcp_servers.icourse163]
command = "npm"
args = ["start", "--silent", "--prefix", "/ABS/PATH/TO/icourse163-mcp"]
startup_timeout_sec = 60
```

## 和仓库根 `.grok/config.toml` 的区别

本机从**仓库根**启动的 grok（cwd = repo root）可以用相对形式，不必写绝对路径：

```toml
[mcp_servers.icourse163]
command = "npm"
args = ["start", "--silent"]
startup_timeout_sec = 60
```

Grok Bot AddMcpServer 没有 cwd，必须用上面的绝对路径脚本或 `--prefix /ABS/PATH/TO/icourse163-mcp`。

## `list_todos`

- 列出中国大学MOOC（icourse163.org）仍开放的待办（未完成 / 未交 / 可作答的作业、测验、考试）。
- 每条含 `id`、`title`、`course_title`、`due_at`（ISO `+08:00` 或 `null`）、`kind`（作业 / 测验 / 考试）。
- `status: ok` 且 `todos` 为空表示确实没有开放待办，不是失败。
- `auth_expired` 以及其他失败都是 `isError`，不会伪装成「没有作业」。
- stdio 使用本机会话存储与 HTTP 客户端：先 `probeSession`，再拉课程面板（MOOC+SPOC 分页）和每门课的 `getLastLearnedMocTermDto`（Referer 必须是 `learn/{school}-{courseId}?tid={termId}`）。
- 不要传账号或 cookie；工具也不返回它们。登录、确认、清除会话见 [docs/login.md](login.md)。


## `list_courses`

- 列出已选课程（MOOC + SPOC 分页，与 `list_todos` 同一课程面板 RPC）。
- 每条含 `id`、`name`、`school`、`type`（`mooc`|`spoc`）、`term_id`。
- `status: ok` 且 `courses` 为空表示确实没有已选课。
- `auth_expired` 以及其他失败都是 `isError`。
- 不要传账号或 cookie。

## `list_term_units`

- 入参：`course_id`、`term_id`，可选 `school_short_name`（拼 learn Referer）。
- 返回 lesson → unit 课件树；单元 `type` 为 `video`|`doc`|`quiz`|`other`（由官方 `contentType` 映射：1→video，3/4→doc，5→quiz，其余→other）。
- 章级 `quizs` 会作为 `quiz` 课节出现。若 RPC 带学习信号（如 `hasLearned` / `evaluateStatus`），填入 `learn_status`，否则为 `null`。
- 使用官方 `getLastLearnedMocTermDto` RPC（非 Playwright）。不代答、不代交；测验读写见后续 issue。
- `auth_expired` 为 `isError`。不要传账号或 cookie。

## `study_unit`

- Args: `course_id`, `term_id`, `unit_id` (from `list_courses` / `list_term_units`); optional `school_short_name`; optional `playback_rate` (0.5–2, default 1); optional `page_interval_sec` (0–10, default 1) for doc/PPT page-turn pacing (align OCS `readSpeed`).
- Advances **video/audio** and **doc/PPT** (contentType 3/4) unit progress via official RPCs: resolve unit in `getLastLearnedMocTermDto`, optional `getLessonUnitLearnVo` (duration/videoId or `textPages`), then `saveMocContentLearn`. **No Playwright** in this implementation.
- Success: `status: "ok"`, `completed: true`, `learned_sec` / `duration_sec` / `percent` for video; `page_count` / `page_interval_sec` / `percent` for doc; `transport: "rpc"`.
- Distinct failures (`isError`):
  - `non_media_unit` — unit is quiz/other (not video/audio/doc)
  - `auth_expired` — missing/expired session
  - `page_structure_change` — unit missing from catalog, or learnVo/save response unparseable
- **Video popup quizzes**: not auto-answered or silently submitted; use later quiz tools (read → AI → save).
- **Limits / detection risk**: RPC progress reports can differ from real playback timing or page-turn traffic; platforms may flag this. Use only on accounts you own. Do not pass cookies/passwords. `playback_rate` / `page_interval_sec` are recorded on the result; the RPC path does not actually stream media or drive a PDF viewer.
- Never pass accounts or cookies.


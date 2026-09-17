# 中国大学MOOC MCP（stdio）

本仓库根目录就是给 Grok Bot / Cursor 用的本机 stdio MCP。体验对齐 [K4F7/chaoxing-mcp](https://github.com/K4F7/chaoxing-mcp) / [K4F7/pu-mcp](https://github.com/K4F7/pu-mcp)：一个进程、stdio、凭据不进工具参数。

工具只有 `list_todos`。当前是骨架占位（`status: "not_implemented"`、`isError: true`）；登录 CLI 与真实待办拉取是后续 issue。MCP 从不接收或返回 cookie / 密码。

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

Grok Bot 的 AddMcpServer **不提供 cwd**，必须用绝对路径启动。不要依赖客户端帮你 `cd` 进仓库。把下面的 `/ABS/PATH/TO/icourse163-mcp` 换成本机仓库的真实绝对路径。不要把 cookie、账号或密码写进 MCP 配置或 `list_todos` 参数。

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

- 列出中国大学MOOC（icourse163.org）仍开放的待办（未交作业 / 测验等）。
- `status: ok` 且 `todos` 为空表示确实没有开放待办，不是失败。
- `auth_expired` 以及其他失败都是 `isError`，不会伪装成「没有作业」。
- 骨架阶段返回 `not_implemented`（同样是 `isError` + 空 `todos`），真实网络实现见后续 issue。
- 不要传账号或 cookie；工具也不返回它们。

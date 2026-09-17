# 登录（仅 CLI）

中国大学MOOC（icourse163.org）会话只存在本机。**MCP 工具从不接收密码或 cookie**，也不返回它们。先用 CLI 登录，再挂 stdio MCP。

成功时只打印 `LOGIN_OK has_cookie=true`，不会打印 cookie 或密码。

## 存哪儿

优先 OS 钥匙串（`@napi-rs/keyring`，service `icourse163.mcp` / account `cookie`）。钥匙串不可用时落到 `0600` 文件：

- `$XDG_CONFIG_HOME/icourse163-mcp/session`
- 若未设 `XDG_CONFIG_HOME`：`~/.config/icourse163-mcp/session`

本地文件安全性低于钥匙串。不要把该文件提交进 git。不保存密码。

## Cookie 粘贴（可靠兜底）

从浏览器开发者工具复制已登录后访问 `www.icourse163.org` 的 **Cookie** 请求头（必须包含 `NTESSTUDYSI`），写入一个本机文件，然后：

```sh
npm run login --silent -- --cookie-file /path/to/cookie.txt
```

或环境变量（不要把真实值写进仓库、文档或 MCP 配置）：

```sh
ICOURSE163_COOKIE='…paste cookie header…' npm run login --silent
```

Netscape `cookies.txt`（仅 `icourse163.org` 域）也可以。缺 `NTESSTUDYSI` 会失败。

## Playwright 账密

对环境变量 `ICOURSE163_USERNAME` / `ICOURSE163_PASSWORD`（可用 `-u` / `-p` 覆盖；用 `--silent` 以免 npm 横幅把 `-p` 打出来）：

```sh
ICOURSE163_USERNAME='…' ICOURSE163_PASSWORD='…' npm run login --silent
```

流程：打开首页 → `iframe[src*='reg.icourse163.org'][src*='index_dl2']` 填账密。需要本机 **Chrome / Chromium**（`playwright-core` 走系统 Chrome `channel: "chrome"`；也可设 `ICOURSE163_CHROME` 指向浏览器可执行文件）。无图形界面时走 headless。

不做学校 SSO（docs.icourse163.org）。不做代答 / 代交。

## 确认 / 清除

```sh
npm run login --silent -- --check
# 成功：SESSION_OK has_cookie=true

npm run login --silent -- --clear
# 成功：SESSION_CLEARED
```

`--check` 会预热 `https://www.icourse163.org/`（需要 `STUDY_INFO`）或打一条轻量课程列表 RPC（`code:0`）。失败是 `auth_expired`，**不会**伪装成「没有待办」。

```sh
npm run login -- --help
```

## 和 MCP 的关系

先 CLI 登录，再挂 MCP。`list_todos` 用本机会话拉仍开放的待办；工具参数里没有账号、密码或 cookie，返回里也不含它们。

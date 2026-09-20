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

**优先级：** 有效的 `ICOURSE163_COOKIE`（或 `--cookie-file`）优先于账密。若环境变量 cookie 缺 `NTESSTUDYSI` 或会话探测失败，且同时提供了用户名/密码，则回退到 Playwright 账密登录（显式 `--cookie-file` 失败不会回退）。

## Playwright 账密

对环境变量 `ICOURSE163_USERNAME` / `ICOURSE163_PASSWORD`（可用 `-u` / `-p` 覆盖；用 `--silent` 以免 npm 横幅把 `-p` 打出来）：

```sh
ICOURSE163_USERNAME='…' ICOURSE163_PASSWORD='…' npm run login --silent
```

流程：打开首页（SPA，等待可见的「登录」入口，而不是立刻扫 DOM）→ `iframe[src*='reg.icourse163.org'][src*='index_dl2']`。URS 默认短信/扫码，密码框可能已存在但隐藏；若未见密码框则点「密码登录 / 账号登录 / 邮箱登录」，再填账密。提交点可见的 `a.u-loginbtn` / `button|input[type=submit]` / `#dologin`，或可见的纯「登录」文案（不会点隐藏的「网易邮箱账号登录」）。需要本机 **Chrome / Chromium**（`playwright-core` 走系统 Chrome `channel: "chrome"`；也可设 `ICOURSE163_CHROME` 指向浏览器可执行文件）。无图形界面时走 headless。

不做学校 SSO（docs.icourse163.org）。登录 CLI 只负责会话建立；产品目标/非目标（含**考试代交不做**）见 [README](../README.md)。

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

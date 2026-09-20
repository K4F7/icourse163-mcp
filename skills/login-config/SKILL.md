---
name: login-config
description: Help the user log in to 中国大学MOOC (icourse163.org) locally via CLI. Use when the user needs to configure login, is unauthenticated, or list_todos returns auth_expired.
---

# 登录配置

只引导用户在本机用 CLI 建立会话。不要在对话里收集、转述或保存密码或 cookie。

- 交互式 / TTY：让用户自己在本机终端运行 `npm run login`；不要代跑、不要让用户把密码或 cookie 贴进对话。
- 无 TTY / Grok Bot / agent：可用环境变量非交互登录（`ICOURSE163_COOKIE` 或 `ICOURSE163_USERNAME` / `ICOURSE163_PASSWORD`），或 `--cookie-file` 指向本机已有文件。优先 secret-request / 环境变量，不要把密文写进对话。

## 步骤

1. 确认仓库根已 `npm ci`，工作目录是本仓根（Agent Plugin 下即 `${PLUGIN_ROOT}`）。
2. 引导登录（二选一；不要向用户要密码贴进聊天）：

   - **Cookie 粘贴（可靠兜底）**：用户从浏览器复制已登录 `www.icourse163.org` 的 Cookie 请求头（须含 `NTESSTUDYSI`）写入本机文件后：

     ```sh
     npm run login --silent -- --cookie-file /path/to/cookie.txt
     ```

     或设 `ICOURSE163_COOKIE` 后 `npm run login --silent`。

   - **Playwright 账密**：设好 `ICOURSE163_USERNAME` / `ICOURSE163_PASSWORD`（可用 `-u` / `-p` 覆盖）后：

     ```sh
     ICOURSE163_USERNAME='…' ICOURSE163_PASSWORD='…' npm run login --silent
     ```

3. 登录成功只应看到 `LOGIN_OK has_cookie=true`（不会打印 cookie / 密码）。可用：

   ```sh
   npm run login --silent -- --check
   ```

   期望 `SESSION_OK has_cookie=true`。
4. 挂上 MCP 后调用 `list_todos` 验证：`status: ok`（可为空待办）表示会话可用；`auth_expired`（`isError`）表示需重新登录。不要追问或回显 cookie / 密码。

更多细节见仓库 [docs/login.md](../../docs/login.md)。

## 禁止

- 不要向用户要密码或 cookie，不要在对话里收集、转述或保存它们。需要凭据时用环境变量、本机 cookie 文件或 Grok Bot secret-request。
- 不要提供或调用 MCP login 工具；本插件没有 login。MCP 工具从不接收密码或 cookie。
- 示例里不要写真实账号、密码、cookie 或 token。
- 交互式 / TTY：不要替用户执行会提示输入密码的登录；让用户自己在终端完成。

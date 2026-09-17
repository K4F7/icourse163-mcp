# ADR 0001：icourse163 API 与 MCP 契约笔记

日期：2026-09-17

本仓库只做本机 stdio MCP，工具面只有 `list_todos`。下列会话 / RPC 行为来自公开仓库的模式归纳，**不是**把那些实现拷进本仓。本文不含密钥、cookie、密码或个人 token。

## 参考（只引模式与 URL，不拷代码）

- [kuan-er/sjtu-agent](https://github.com/kuan-er/sjtu-agent) `ddl_checker.py`（icourse163 段）— 较新的会话与待办流
- [xhh678876/openclaw-sjtu](https://github.com/xhh678876/openclaw-sjtu) `scripts/platforms/icourse163.py` — 上面流程的整理移植
- [Fleey/icourse163-Api](https://github.com/Fleey/icourse163-Api) — 较旧的 DWR + cookie/CSRF
- 可选历史：[skywalker512/cn_mooc_dl](https://github.com/skywalker512/cn_mooc_dl) — passport 登录，可能已过时

## 会话

- Cookie `NTESSTUDYSI` 同时是 session id 和 `csrfKey` / `edu-script-token`。
- 先 GET `https://www.icourse163.org/` 预热，让 STUDY_INFO 落到 `.icourse163.org`。
- 鉴权探针：预热成功（有 STUDY_INFO）或课程列表 RPC 返回 `code:0`。缺 cookie / 失效 → `auth_expired`，**禁止**用空的 `ok` 列表表示失败。

## 登录（仅 CLI；MCP 永不收密码）

后续登录 issue 的优先级：

1. 粘贴 cookie 的 CLI（例如 `--cookie-file` 或环境变量 `ICOURSE163_COOKIE`）— 可靠兜底
2. Playwright 对首页密码登录：`iframe[src*='reg.icourse163.org'][src*='index_dl2']`，环境变量 `ICOURSE163_USERNAME` / `ICOURSE163_PASSWORD`
3. 不做学校 SSO（docs.icourse163.org API）
4. 不做代答 / 代交

Cookie 只存在本机（钥匙串优先，或 XDG 配置目录下 `0600` 文件）。MCP 工具不接收、不返回 cookie。

## 课程列表 RPC

`POST https://www.icourse163.org/web/j/learnerCourseRpcBean.getMyLearnedCoursePanelList.rpc?csrfKey={NTESSTUDYSI}`

Body：`type=30&p={page}&psize=20&courseType={1|2}`（1=MOOC，2=SPOC）

解析 `result.result[]` → `{ name, course_id: id, term_id: termPanel.id, school_short_name: schoolPanel.shortName }`

## 学期结构 / 未完成待办

`POST https://www.icourse163.org/web/j/courseBean.getLastLearnedMocTermDto.rpc?csrfKey=…`

Body：`termId={termId}`

Headers：`Referer: https://www.icourse163.org/learn/{school}-{courseId}?tid={termId}`（错误 Referer 可能得到 null）

解析 `result.mocTermDto`（或 `result`）：

- `chapters[].quizs[]`：`deadline`（ms）、分数、`usedTryCount`、`name`
- `chapters[].lessons[].units[]` 中 `contentType==5`（旧测验单元）
- `exams[]`：`endTime` / `deadline`、分数

`list_todos` 开放过滤：deadline 在未来；分数缺失或 0；优先排除已交（`usedTryCount>0`），只保留未完成 / 未交 / 可作答。已关闭状态不进列表。

## MCP 产品形态

- 仓库根即 Node/TS stdio MCP（`npm start` = `node --import tsx src/stdio.ts`）
- 工具只有 `list_todos`
- `auth_expired` 等失败为 `isError`；`ok` + 空 `todos` 表示确实没有开放待办
- 本骨架返回 `not_implemented`（同样是 `isError` + 空 `todos`），真实网络实现替换函数体、不改信封
- MCP 永不接受密码；工具不返回 cookie

## 非目标

本文只记契约。Playwright、keyring、HTTP 客户端、登录 CLI 与真实 RPC 不在本骨架范围。

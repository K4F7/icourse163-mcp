# ADR 0001：icourse163 API 与 MCP 契约笔记

日期：2026-09-17

本仓库只做本机 stdio MCP，工具面含 `list_todos`、`list_courses`、`list_term_units`。下列会话 / RPC 行为来自公开仓库的模式归纳，**不是**把那些实现拷进本仓。本文不含密钥、cookie、密码或个人 token。

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
4. 考试代交不做（作业辅助范围见 README；登录 issue 不实现答题）

Cookie 只存在本机（钥匙串优先，或 XDG 配置目录下 `0600` 文件）。MCP 工具不接收、不返回 cookie。

## 课程列表 RPC

`POST https://www.icourse163.org/web/j/learnerCourseRpcBean.getMyLearnedCoursePanelList.rpc?csrfKey={NTESSTUDYSI}`

Body：`type=30&p={page}&psize=20&courseType={1|2}`（1=MOOC，2=SPOC）

解析 `result.result[]` → `{ name, course_id: id, term_id: termPanel.id, school_short_name: schoolPanel.shortName }`

## 学期结构 / 未完成待办

`POST https://www.icourse163.org/web/j/courseBean.getLastLearnedMocTermDto.rpc?csrfKey=…`

Body：`termId={termId}`

Headers：`Referer: https://www.icourse163.org/learn/{school}-{courseId}?tid={termId}`（错误 Referer 可能得到 null）

解析 `result.mocTermDto`（或 `result` 本身就是 mocTermDto）：

- `chapters[].quizs[]`：优先读嵌套 `test`，再回退 quiz 自身。`deadline`（ms）、`userScore` / `testScore`、`usedTryCount`、`name` / `id`
- `chapters[].lessons[].units[]` 中 `contentType==5`（旧测验单元）：`deadline` / `testEndTime`、`testScore`
- `exams[]`：`endTime` / `deadline`、`name` / `title`、分数

`due_at` 由 ms 截止时间格式化为 ISO `+08:00`；缺失则为 `null`。

`list_todos` 开放过滤（未完成 / 未交 / 可作答）：deadline 在未来；分数缺失或 0；`usedTryCount>0` 视为已交并排除。deadline 缺失时，仅在其余信号都表明未完成时才保留。中文关闭态文案（已提交、已批改、已结束、不可作答等）放在 `CLOSED_STATE_LABELS`，命中即排除。

课程面板按 `courseType` 1（MOOC）和 2（SPOC）分页，`psize=20`，直到空页或短页。学期 RPC 的 Referer 必须是 `https://www.icourse163.org/learn/{school}-{courseId}?tid={termId}`，否则 `result` 可能为 null。

## 课件单元类型（list_term_units）

`chapters[].lessons[].units[].contentType`（与学校开放文档一致）：1 视频 → `video`；3 PDF / 4 富文本 → `doc`；5 随堂测验 → `quiz`；6 讨论、7 直播及其他 → `other`。章级 `quizs[]` 映射为 `quiz`。学习状态字段若存在则透出为 `learn_status` 字符串，否则 `null`。

## MCP 产品形态

- 仓库根即 Node/TS stdio MCP（`npm start` = `node --import tsx src/stdio.ts`）
- 工具：`list_todos`、`list_courses`、`list_term_units`
- `auth_expired` 等失败为 `isError`；`ok` + 空 `todos` 表示确实没有开放待办
- MCP 永不接受密码；工具不返回 cookie

## 非目标

本文只记契约与会话/RPC 笔记。不做学校 SSO。产品目标/非目标（自动看课、测验/作业辅助、`save` 必调、**考试代交不做**）以仓库根 [README](../../README.md) 为准。

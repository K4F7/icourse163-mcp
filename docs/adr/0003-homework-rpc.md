# ADR 0003：作业/测验 get + save + 显式 submit 走 mocQuizRpcBean

日期：2026-09-21

## 决策

作业辅助（issue #17）使用官方 `mocQuizRpcBean` JSON RPC：

- 读题：`getOpenQuizPaperDto` / `getOpenHomeworkPaperDto`
- 写答：`submitAnswers`，以 **`preview`** 区分草稿与正式提交

MCP 工具面：

| 工具 | preview | 语义 |
|------|---------|------|
| `get_homework` | n/a | 结构化读题 |
| `save_homework_answers` | **强制 true** | 草稿保存（必调）；拒绝夹带 submit |
| `submit_homework` | **false** | 显式正式提交；拒绝 exam |

HTTP 端口增加可选 `json` body（与既有 `form` 互斥），因试卷提交需要结构化 `paperDto`。

## 理由

- 对齐 OCS work 脚本「答完自行检查再保存/提交」；本仓允许显式 submit（与 chaoxing-mcp 全面拒绝提交不同），但默认不交。
- 可 mock 的 RPC 单测，无需 Playwright。
- Sein 澄清：测验复用作业工具；考试代交不做。

## 后果

- 文档必须写清：save 必调、submit 仅用户确认后、exam 拒绝正式提交。
- `todo_id` 复用 `list_todos` 复合 id。

## 读卷 tid 解析（#27）

`list_todos` 的 catalog id（`unit.id` / `quiz.id` / `homework.id` / `exam.id`）**不是** `getOpenQuizPaperDto` / `getOpenHomeworkPaperDto` 的 `tid`。读题前必须用 `getLastLearnedMocTermDto` 解析：

| source | 目录字段 | 试卷 tid |
|--------|----------|----------|
| `unit` | `units[]` contentType 5 | `contentId` |
| `quiz` | `chapters.quizs[]` | `contentId` 或 `test.id` |
| `homework` | `chapters.homeworks[]` | `contentId` 或 `test.id` |
| `exam` | `exams[]` | `contentId` 或 `test.id` |

直接用 catalog id 作 tid 会得到 `code:0` 且 `result: null`（「试卷 result 为空」）。

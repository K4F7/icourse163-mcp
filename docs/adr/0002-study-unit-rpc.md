# ADR 0002：study_unit 走 saveMocContentLearn RPC

日期：2026-09-21

## 决策

`study_unit` 优先使用官方学习进度 RPC（`courseBean.getLessonUnitLearnVo` + `courseBean.saveMocContentLearn`），覆盖视频与文档/PPT（contentType 3/4，DTO 带 `pageNum`），与现有 `list_*` 工具同一 cookie/csrfKey/Referer 模式。不在本 issue 引入 Playwright 看课。

## 理由

- Issue #14 要求可 mock 的 HTTP/RPC 单测；RPC 路径可在无浏览器下证明。
- OCS 的 `watchMedia` 是 DOM 播放；本仓已有课程目录 RPC，进度上报 RPC 可复用会话与 Referer。
- Playwright 作为后续兜底（页面结构变化或签名头强制时）仍可加，不阻塞 MCP 工具面。

## 后果

- 文档必须写明检测风险：RPC 直报 ≠ 真实播放时序。
- 视频弹窗题不在此工具静默提交。
- `playback_rate` 写入结果；RPC 不真实拉流。

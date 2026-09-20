# ADR 0002：study_unit 双通道（RPC + Playwright）

日期：2026-09-21（修订：#26）

## 决策

`study_unit` 默认 `transport=auto`：优先官方学习进度 RPC（`getLessonUnitLearnVo` + `saveMocContentLearn`），当 save 返回 `-10006` / `本地时间` / `并发限制` 等阻断时，回退到本机 Playwright DOM 路径（对齐 OCS `watchMedia` / `readPPT`）。也可显式 `transport=rpc` 或 `transport=playwright`。

## 理由

- Issue #14 要求可 mock 的 HTTP/RPC 单测；RPC 路径可在无浏览器下证明。
- 真课上 `saveMocContentLearn` 常被 `-10006` 挡住（#24）；OCS 并不依赖该 RPC，而是浏览器内播放/翻页。
- 本仓 CLI 登录已使用 Playwright + 系统 Chrome；看课复用同一启动/cookie 注入模式，MCP 仍不收密。

## 后果

- 文档必须写明 Chrome 依赖、检测风险、RPC 与 Playwright 的关系。
- 视频弹窗题不在此工具静默提交（`needs_quiz_assist` → read/save 流水线）。
- `playback_rate` / `page_interval_sec` 对 Playwright 路径生效；RPC 路径主要记录参数。
- 单测默认 `ICOURSE163_DISALLOW_LIVE_PLAYWRIGHT=1`，强制注入 mock runner，避免 CI 拉起 Chrome。

# Live Story Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现自然语音驱动、宽容剧情推进、实时画面互动与可重播视频回忆。
**Architecture:** 保留 React + Node + AliRTC。拆分剧情理解、服务端设置、参考图协议、回忆持久化与 UI 面板；服务端代理鉴权，客户端只持有短期票据。
**Tech Stack:** TypeScript / React / Express / ws / Vidu S2 / AliRTC / Vitest。
**Spec:** docs/superpowers/specs/2026-10-17-live-story-upgrade.md

## Global Constraints
- 摄像头始终关闭，麦克风仅通话授权后发布，创建前获取权限。
- 连续3轮未匹配进入显式安全分支；线索门槛不绕过。
- 密钥仅服务端，活跃会话不可换key。录像只存本机 .data。
- 官方 images[] 协议和 type12 ack；字幕 type9/10；录制 enable_recording。

## Review Focus
- 异步迟到事件不推进新会话剧情；字幕重复不计两轮。
- 用户拒绝麦克风仍能文字通话，停止后无活跃音轨。
- 参考图失败和排队状态不可谎报成功；不允许路径穿越。
- 换密钥期间正在创建/结算的旧会话使用原凭据。
- 录像生成延迟、断网、重启、删除与下载竞争不破坏其他回忆。

### Task 1: 剧情理解与兜底
Files: src/game/{types,engine,story}.ts, server/index.ts, tests/engine.test.ts
Interface: GameState.unmatchedTurns; respondLocally(state,input), recordUnmatched(state,input,reply?) -> TurnResult; fallbackApplied boolean.
- [x] 添加同义表达/模糊匹配/否定/三轮兜底/旧存档测试，运行看到失败。
- [x] 实现并验证剧情门槛、计数重置和 LLM 无匹配共享兜底。

### Task 2: 配置与官方协议
Files: server/{settings,protocol}.ts, server/live.ts, server/safety.ts, tests/upgrade-server.test.ts
Interfaces: readSettings/updateSettings; parseTranscript(message); buildInteraction(id/image/remove); live api snapshot key per session.
- [x] 编写设置保密/原子更新、转写去重输入、图片类型/大小校验测试并验证失败。
- [x] 实现动态设置、type9/10转发、type11/12互动、type97/98场景人设。

### Task 3: 回忆服务
Files: server/memories.ts, server/live.ts, server/index.ts, tests/memories.test.ts
Interfaces: MemoryStore.create/update/list/delete/refreshRecording; /api/memories routes; file endpoint.
- [x] 测试持久化、删除、生成中/失败/下载、无密钥输出。
- [x] enable_recording，后台有界取录像、重启恢复记录并支持手动重试、界面刷新获取。

### Task 4: 语音与字幕客户端
Files: src/lib/live.ts, src/App.tsx, tests/live-client.test.ts
Interfaces: start(nodeId,{microphone}); microphone hooks/transcript hooks, setMicrophone(bool), interaction(...), updateScene(nodeId).
- [x] 测试创建前权限、停止释放、转写去重、不重复转发语音、接收失败清理。
- [x] RTC原生语音、统一字幕及自动剧情推进；摄像头保持关闭。

### Task 5: UI面板及联调
Files: src/components/{GameSettings,Interactions,Memories}.tsx, src/styles.css, docs/vidu-capabilities.md
- [x] 设置key/区域/语义服务、互动图选择、回忆播放下载删除、内联字幕/输入。
- [x] npm test + npm run build；浏览器桌面手机与模拟协议测试；短会话官方验收。
- [x] 更新说明和实际验收证据；最终独立审查并修复重要问题。

## Execution ledger
- Plan created before implementation; current branch codex/rain-chapter clean at 644c1e7.
- Upstream activeLive=0; previous sessions confirmed ended. No paid tests started for this upgrade yet.
- Tasks 1–4 implemented; 29 automated tests pass and production build passes. New tests observed failing before each implementation.
- Official page differs from older GitHub reference: images[] supports data URIs. Implementation uses the current page.
- Ruling: microphone is direct RTC, not browser ASR during live calls. Type9/10 transcription drives storyline without resending user audio as text.
- Ruling: recordings are official MP4 fetched after hangup, not captureStream; includes character audio and avoids browser recording compatibility gaps.

- Final implementation: all seven requested areas delivered. 37 tests in 10 files pass; production build passes. Independent review fixes verified.
- Live QA found and fixed type9 echo re-entry and transient page visibility hangup. Background reference accepted via real type12 ack; received 1344x768 video.
- Official recordings downloaded as real local MP4s with validated parallel ranges and bounded network retries. Empty zero-second QA records cleaned up; nonempty memories retained.
- Remaining validation boundaries: actual human multi-turn speech/recognition quality and precise appearance fidelity need player evaluation. Default storyline matching is rules-based until an optional LLM is configured. Details and QA billing in docs/verification.md.

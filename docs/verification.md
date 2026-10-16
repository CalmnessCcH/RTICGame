# Verification log

## Automated
- Initial story-engine tests demonstrated 7 expected failures before implementation; all 9 passed afterward.
- Initial live-client lifecycle tests demonstrated 2 failures: stale warmup instructions and overlapping singleton destruction. Both passed after queued performance and serialized teardown were implemented.
- Independent review identified the two lifecycle defects above and skipped transition dialogue. Transition replies now have a separate player-confirmed continuation stage.
- Current automated suite: 20 passing tests covering story gating/reachability, negation, ambiguity, save parsing, origin checks, secret redaction, active persona isolation, client lifecycle, server orphan cleanup, handshake cancellation, ticket validation and concurrency rejection.
- TypeScript and production build pass. Rollup reports two upstream Zod comment annotation warnings; emitted bundle is valid.

## Real service
- Initial China endpoint returned `unauthorized`, before creating any live session.
- User confirmed international endpoint; configured `api.vidu.com`. Creating a session returned `insufficient credits` before any session was created. The server's session report remained empty. No generated media was received. Image fidelity, audio/video latency, lip sync, live action response and real billing termination remain unverified until the account has credits.

## Browser
- Home and initial playable scene render in Ego browser; screenshot saved to artifacts/home-desktop.png.
- Browser text-input test sent “抱歉，让你久等了”; the intended response “我说的，不只是今晚。不过……你来了就好。” appeared before continuation, verifying the skipped-reply fix.
- Browser completed every scene on the evidence route through the “未被雨声淹没” ending. All 4 clues appeared in the journal.
- Reload + continue restored the completed chapter correctly.
- Browser opened character profiles and journal, then restarted through the confirmation dialog.
- Mobile viewport 390×844: document width 390 (no horizontal overflow), composer bounds y=768..821 (fully on-screen); screenshot artifacts/play-mobile.png. Desktop scene, cinema, ending and profile screenshots also saved under artifacts/.
- Microphone capture was not exercised, to avoid requesting browser device permissions during automated QA. Voice transcription uses the browser's SpeechRecognition service and is availability dependent.
- Permanent API key scan of built assets: 0 occurrences. `.env` is ignored by Git and mode 0600.
- Final production server started successfully at http://127.0.0.1:8787. Production homepage loaded at 1440×900 with no captured runtime errors or unhandled rejections. Character portrait framing visually verified; final screenshots: artifacts/characters-final.png and artifacts/home-final.png.

## Independent review and remaining limitations
- Independent reviewer identified 3 issues; all addressed: serialized SDK cleanup, queued warmup instructions, and explicit transition-reply UI. Regression tests cover the two SDK races; browser check covers transition dialogue.
- S2 standard real-time edition is experimental here; exact spoken script enforcement is not guaranteed. The formal component-edition path requires further integration.
- The supplied credential is only a Vidu key. No independent LLM was supplied, so unrestricted semantic dialogue is not live-tested; the playable default honestly identifies itself as a rules-based prototype.

## Funded-account retest — 2026-10-16
- First creation attempt hit the 45-second network timeout. A read-only upstream list afterward returned zero lives.
- Next attempt successfully created session `1008672018347859968`; control connection ready after 1226 ms, but no text instruction or RTC video was received before a camera permission prompt interrupted browser QA.
- SDK 7.1.9 source inspection showed default `isSupported()` checks H264 encoding; `isSupported("recvonly")` skips that camera-dependent probe. Changed the client to check receive-only capabilities before creating any billable session. Added a regression test proving an unsupported receiver never calls the creation endpoint (red before fix, green after fix).
- Local service shutdown sent hangup. A direct upstream query confirmed `ended`, `billed_seconds: 27`, `credits_cost: 41`.
- All 19 tests and production build pass. Updated production server started. Browser validation of the receive-only fix and video response remains pending user dismissal of the browser-owned camera prompt.

### Follow-up: capture defaults
- Second session `1008675099949150208` reached ready in 4806 ms and sent one text instruction. A camera prompt recurred after RTC join, disproving the earlier hypothesis that the capability check caused the prompt.
- Full SDK inspection identified `startDefaultCameraAndMic` during join, with local publication flags defaulting to true. Before joining, the client now explicitly calls `publishLocalVideoStream(false)` and `publishLocalAudioStream(false)`. The receive-only preflight remains useful but was not the cause of capture.
- Added regression covering both disabled publication flags before join; failed before implementation, passed after. All 20 tests and production build pass.
- Server shutdown sent hangup; upstream confirmed this second session `ended`, 50 billed seconds, 75 credits. Total observed billed credits across both sessions: 116. Browser validation remains pending handling of the second browser-owned permission prompt.

# Verification log

## Upgrade verification — 2026-10-17 (current)

- Implemented native RTC microphone publication (camera off), auto storyline routing from user transcription, unified scene captions, paraphrases/fuzzy matching with a three-turn fallback, reference-image interactions, persistent recording memories, and in-game server-side credential settings.
- Latest automated suite: **37 tests / 10 files pass**; TypeScript and production build pass. Two upstream Zod annotation warnings remain non-blocking. Independent review fixes cover retained output mute state, deletion racing an MP4 rename, queued voice cancellation, and consuming outbound echo matches so later repeated speech is not lost.
- Real S2 received video at **1344×768** and type10 character captions. Microphone capture requested only audio with echo cancellation/noise suppression, `video:false`; captured audio track was `ended` after stop. Continuous human speech, VAD timing and recognition quality are still for player testing.
- Real type9 also echoes outbound text commands. Initial test exposed erroneous story advancement; server now filters one matching outbound echo within a short window. Distinct speech without upstream IDs receives distinct local IDs; repeated spoken sentences are not permanently deduplicated by text.
- A real cinema-background reference-image request returned **type12 success** while video remained available. This confirms protocol acceptance; appearance consistency and final background fidelity were not independently graded.
- Browser showed a three-turn unmatched fallback to `ask-feelings`, displaying the transition reply and continuation button. The second unmatched request happened during a local server restart and correctly used local fallback. Engine tests separately verify three consecutive turns and clue gates.
- Browser settings saved blank key fields without disclosing or replacing the key. Built asset scan: zero occurrences of the configured key; `.env` mode `0600` and gitignored.
- Mobile 390×844: document width 390; input bounds y=768..821. Screenshots: `artifacts/upgrade-mobile.png`, `artifacts/upgrade-settings.png`, `artifacts/upgrade-interaction.png`.
- Real recording metadata returned an MP4. Full-file downloads timed out on the cross-region route; parallel, validated byte ranges and bounded network retries successfully saved actual MP4s (approximately 7.7MB and 15MB) under `.data/memories`. Readiness is only marked after a complete validated download. Pending/failed old downloads can be refreshed after restart.
- One RTC connection received no frames and ended automatically after the receive timeout. Browser automation also produced millisecond hidden/visible events; lifecycle now ignores transient flips, but ends calls when backgrounded for one second or on page exit.
- Upgrade QA sessions: `1008867671120293888` 39s/59 credits; `1008868424668950528` 27s/41 credits; `1008868839212982272` 0s/0; `1008869185356312576` 0s/0; `1008869479318302720` 20s/30 credits; `1008870427755294720` 54s/81 credits. All confirmed ended; total **211 credits** for these QA sessions. Removed the two empty zero-second QA memories. Later user-started session reports are separate.
- No independent language-model key is configured. Current story understanding uses improved local rules; optional semantic-model settings are available. The S2 role model sometimes opens in English despite a Chinese persona, and does not guarantee verbatim scripted dialogue; dedicated voice/LLM configuration or component mode remains future work.

- Final real playback: fixed Express default hidden-directory rejection on the validated MP4 route. HTTP Range returned 206/video-mp4, and browser playback advanced to 2.56s in an 18.242s video at 1278×720. Regression test first failed 404 vs 206, then passed. Screenshot: `artifacts/upgrade-memory-playback.png`.
- Later user-started recording contains distinct microphone transcripts including repeated greetings; it also downloaded successfully. Recognition accuracy and natural conversation quality remain subjective playtest items.

The sections below retain historical evidence from earlier versions and do not describe the current microphone or memory behavior.

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

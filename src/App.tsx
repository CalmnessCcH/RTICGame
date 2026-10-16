import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Film,
  Headphones,
  Heart,
  History,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { characters, clues, scenes, story } from "./game/story";
import {
  applyAction,
  availableActions,
  createGame,
  parseSave,
  respondLocally,
} from "./game/engine";
import type { GameState, TurnResult } from "./game/types";
import { loadGame, readGame, saveGame } from "./lib/storage";
import { LiveSession, type LiveStatus } from "./lib/live";
import { Modal } from "./components/Modal";

type Panel =
  "journal" | "people" | "history" | "settings" | "restart" | "about" | null;
type Config = {
  viduConfigured: boolean;
  region: string;
  liveMaxSeconds: number;
  llmConfigured: boolean;
};
const liveLabels: Record<LiveStatus, string> = {
  idle: "开启实时表演",
  starting: "正在建立会话",
  warming: "角色准备中",
  connecting: "正在接入画面",
  live: "实时表演中",
  ended: "重新开启表演",
  error: "重试实时表演",
};
const Logo = () => (
  <span className="brand">
    <span className="rain-mark">
      <i />
      <i />
      <i />
    </span>
    <span>雨停之前</span>
    <small>BEFORE THE RAIN ENDS</small>
  </span>
);

export default function App() {
  const [state, setState] = useState<GameState>(loadGame);
  const [playing, setPlaying] = useState(false);
  const [hasSave, setHasSave] = useState(() => Boolean(readGame()));
  const [panel, setPanel] = useState<Panel>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reply, setReply] = useState("");
  const [mode, setMode] = useState("rules");
  const [config, setConfig] = useState<Config | null>(null);
  const [pending, setPending] = useState<{
    nodeId: string;
    actionId: string;
  } | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [liveStarted, setLiveStarted] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [maxLive, setMaxLive] = useState(120);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef<LiveSession | null>(null);
  const recognition = useRef<any>(null);
  const generation = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const turnLock = useRef(false);
  const node = story[pending?.nodeId ?? state.nodeId];
  const character = characters[node.character];
  const scene = scenes[node.scene];
  const actions = availableActions(state);
  const liveActive = ["starting", "warming", "connecting", "live"].includes(
    liveStatus,
  );
  const elapsed = liveStarted
    ? Math.max(0, Math.floor((now - liveStarted) / 1000))
    : 0;
  const notify = (text: string) => setNotice(text);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => notify("本地服务未连接，仍可使用剧情选项试玩。"));
  }, []);
  useEffect(() => {
    if (!playing) return;
    if (!saveGame(state))
      notify("浏览器无法保存进度，请导出存档保留本次故事。");
    else setHasSave(true);
  }, [state, playing]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!liveActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [liveActive]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        void live.current?.stop("ended");
        recognition.current?.abort();
        window.speechSynthesis?.cancel();
      }
    };
    const leave = () => {
      void live.current?.stop("ended");
      recognition.current?.abort();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);
  useEffect(() => {
    if (!voice || !playing || liveActive || !("speechSynthesis" in window))
      return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(reply || node.dialogue);
    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [voice, playing, reply, node.id, liveActive]);
  useEffect(() => {
    if (panel) {
      recognition.current?.abort();
    }
  }, [panel]);
  function stopLive() {
    void live.current?.stop("ended");
    live.current = null;
    setLiveStarted(0);
  }
  function newGame() {
    generation.current++;
    turnLock.current = false;
    setBusy(false);
    stopLive();
    recognition.current?.abort();
    setState(createGame());
    setPending(null);
    setReply("");
    setInput("");
    setPlaying(true);
    setPanel(null);
  }
  function home() {
    generation.current++;
    turnLock.current = false;
    setBusy(false);
    stopLive();
    recognition.current?.abort();
    setPlaying(false);
    setPending(null);
    setReply("");
    window.speechSynthesis?.cancel();
  }
  function commit(result: TurnResult, previous: GameState) {
    setState(result.state);
    setInput("");
    if (result.advanced) {
      setReply(result.reply);
      setPending({ nodeId: previous.nodeId, actionId: result.actionId! });
      live.current?.performAction(previous.nodeId, result.actionId!);
      const found = result.state.clues.find((c) => !previous.clues.includes(c));
      if (found) notify(`新线索已收录：${clues[found].title}`);
    } else {
      setReply(result.reply);
      if (liveActive) live.current?.chat(previous.nodeId, input.trim());
    }
  }
  function continueStory() {
    const next = story[state.nodeId];
    if (next.character !== node.character || next.ending) stopLive();
    else live.current?.perform(next.id);
    setPending(null);
    setReply("");
  }
  function choose(id: string) {
    if (turnLock.current || busy || pending) return;
    const before = stateRef.current;
    commit(applyAction(before, id), before);
  }
  async function submit() {
    const text = input.trim();
    if (!text || turnLock.current || node.ending || pending) return;
    turnLock.current = true;
    setBusy(true);
    recognition.current?.abort();
    const before = stateRef.current;
    const epoch = ++generation.current;
    live.current?.interrupt();
    try {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: before, input: text }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("输入服务不可用");
      const result = await response.json();
      if (epoch !== generation.current) return;
      const valid = parseSave(JSON.stringify(result.state));
      if (!valid) throw new Error("响应格式无效");
      setMode(result.mode || "rules");
      commit({ ...result, state: valid }, before);
      if (!result.advanced && result.mode === "rules")
        notify("规则试玩未匹配到明确选择；可以换个说法，或使用下方选项。");
    } catch {
      if (epoch !== generation.current) return;
      setMode("rules");
      commit(respondLocally(before, text), before);
      notify("已使用本地剧情规则回应。");
    } finally {
      if (epoch === generation.current) {
        turnLock.current = false;
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }
  function startLive() {
    if (liveActive) {
      stopLive();
      return;
    }
    if (!config?.viduConfigured) {
      setPanel("settings");
      return;
    }
    if (!video.current) return;
    window.speechSynthesis?.cancel();
    live.current = new LiveSession(video.current, {
      status: setLiveStatus,
      notice: notify,
      started: (at, max) => {
        setLiveStarted(at);
        setMaxLive(max);
      },
    });
    setPanel(null);
    void live.current.start(node.id);
    if (pending) live.current.performAction(pending.nodeId, pending.actionId);
  }
  function startVoice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      notify("当前浏览器不支持语音转文字，请用 Chrome/Edge 或直接输入文字。");
      return;
    }
    const r = new Speech();
    recognition.current = r;
    r.lang = "zh-CN";
    r.interimResults = true;
    r.continuous = false;
    r.onstart = () => {
      setListening(true);
      live.current?.interrupt();
    };
    r.onend = () => setListening(false);
    r.onerror = (e: any) => {
      setListening(false);
      notify(
        e.error === "not-allowed"
          ? "麦克风未获授权，可以继续使用文字。"
          : "没有识别到清晰语音，请重试或输入文字。",
      );
    };
    r.onresult = (e: any) => {
      setInput(
        Array.from(e.results as any[])
          .map((x: any) => x[0].transcript)
          .join("")
          .slice(0, 1000),
      );
    };
    try {
      r.start();
    } catch {
      setListening(false);
      notify("无法启动麦克风，请稍后重试。");
    }
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "雨停之前-第一章存档.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSave(file?: File) {
    if (!file) return;
    if (file.size > 500000) {
      notify("存档文件过大。");
      return;
    }
    const parsed = parseSave(await file.text());
    if (!parsed) {
      notify("存档损坏或版本不兼容，当前进度已保留。");
      return;
    }
    generation.current++;
    turnLock.current = false;
    setBusy(false);
    stopLive();
    setState(parsed);
    setPending(null);
    setPlaying(true);
    setReply("");
    setPanel(null);
    notify("已恢复这段故事。");
  }
  return (
    <main
      className={`app ${playing ? "is-playing" : "is-home"} ${node.scene}`}
      style={{ "--text-scale": textScale } as React.CSSProperties}
    >
      <div
        className="scene-background"
        key={playing ? node.scene : "home"}
        style={{
          backgroundImage: `url(${playing ? scene.image : scenes.cafe.image})`,
        }}
      />
      <video
        ref={video}
        className={`live-video ${liveStatus === "live" ? "visible" : ""}`}
        autoPlay
        playsInline
        muted={muted}
      />
      <div className="scene-shade" />
      <div className="film-grain" aria-hidden="true" />
      <header className="topbar">
        <button
          className="brand-button"
          onClick={home}
          aria-label="返回故事首页"
        >
          <Logo />
        </button>
        <nav aria-label="主要导航">
          <button
            className={!panel ? "selected" : ""}
            onClick={() => setPanel(null)}
          >
            故事
          </button>
          <button onClick={() => setPanel("people")}>人物</button>
          <button onClick={() => setPanel("journal")}>
            记忆
            <span className="nav-count">
              {state.clues.length.toString().padStart(2, "0")}
            </span>
          </button>
        </nav>
        <div className="header-actions">
          {playing && !node.ending && (
            <button
              className={`live-button ${liveStatus === "live" ? "connected" : ""}`}
              onClick={startLive}
              disabled={busy}
              title={
                liveActive ? "结束本次实时会话" : "启用 Vidu S2 实时角色表演"
              }
            >
              {liveActive && liveStatus !== "live" ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <span className="status-dot" />
              )}
              <span>{liveLabels[liveStatus]}</span>
              {liveActive && <Square size={11} />}
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => setPanel("settings")}
            aria-label="设置"
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      {!playing ? (
        <>
          <section className="home-content">
            <div className="eyebrow home-eyebrow">
              <span className="short-rule" /> 一场关于重逢的互动叙事
            </div>
            <h1>
              雨停
              <span>
                之前<span className="title-dot">。</span>
              </span>
            </h1>
            <p className="english-title">BEFORE THE RAIN ENDS</p>
            <p className="home-description">
              有些重逢，是为了告别。
              <br />
              有些声音，等了你整整三年。
            </p>
            <div className="start-actions">
              <button
                className="primary-button"
                onClick={() => {
                  if (hasSave) {
                    setPlaying(true);
                  } else newGame();
                }}
              >
                <span>{hasSave ? "继续故事" : "走进这个雨夜"}</span>
                <ArrowRight size={20} />
              </button>
              {hasSave && (
                <button
                  className="text-button"
                  onClick={() => setPanel("restart")}
                >
                  重新开始 <RotateCcw size={13} />
                </button>
              )}
            </div>
            <div className="home-caption">
              <Headphones size={14} />
              <span>建议佩戴耳机 · 文字 / 语音交互</span>
            </div>
          </section>
          <aside className="portrait-caption">
            <span className="caption-line" />
            <span>林知夏</span>
            <small>「我以为你不会来了。」</small>
          </aside>
          <footer className="home-footer">
            <div className="chapter-label">
              <span className="chapter-number">01</span>
              <div>
                <span className="eyebrow">CHAPTER ONE</span>
                <h2>迟到的来信</h2>
              </div>
            </div>
            <p>
              一封未寄出的信，一段被截断的录音。
              <br />
              这一次，你会听到最后吗？
            </p>
            <div className="chapter-meta">
              <span>两位女主</span>
              <i />
              <span>三个章节结果</span>
              <ArrowUpRight size={18} />
            </div>
            <button
              className="round-button"
              onClick={() => setPanel("about")}
              aria-label="关于这个故事"
            >
              <CircleHelp size={19} />
            </button>
          </footer>
        </>
      ) : (
        <>
          <div className="scene-heading">
            <button className="back-link" onClick={home}>
              <ChevronLeft size={14} /> 第一章 · 迟到的来信
            </button>
            <div className="location">
              <MapPin size={13} />
              {scene.name}
              <span>{node.time}</span>
            </div>
            <h2>{node.title}</h2>
            <p>{node.narration}</p>
          </div>
          <aside className="scene-aside">
            <span className="scene-index">
              {String(Math.min(node.beat, 9)).padStart(2, "0")} <i>/ 09</i>
            </span>
            <div className="progress-track">
              <span
                style={{ height: `${Math.min(node.beat / 9, 1) * 100}%` }}
              />
            </div>
            <button
              className="round-button"
              onClick={() => setPanel("history")}
              aria-label="对话回顾"
            >
              <History size={18} />
            </button>
            <button
              className="round-button"
              onClick={() => setPanel("journal")}
              aria-label="线索手记"
            >
              <BookOpen size={18} />
              {state.clues.length > 0 && <b>{state.clues.length}</b>}
            </button>
            <button
              className="round-button"
              onClick={() => setPanel("people")}
              aria-label="人物关系"
            >
              <Heart size={18} />
            </button>
            {liveActive && (
              <button
                className="round-button"
                onClick={() => {
                  setMuted(!muted);
                  if (muted) void video.current?.play().catch(() => {});
                }}
                aria-label={muted ? "开启视频声音" : "关闭视频声音"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
          </aside>
          {node.ending ? (
            <section className="ending-panel">
              <span className="eyebrow">CHAPTER COMPLETE</span>
              <span className="ending-tag">{node.ending.tag}</span>
              <h1>{node.ending.title}</h1>
              <p>{node.ending.text}</p>
              <div className="ending-stats">
                <span>
                  收录线索 <b>{state.clues.length}/4</b>
                </span>
                <span>
                  共同经历 <b>{state.turns} 次回应</b>
                </span>
              </div>
              <p className="ending-quote">
                「{node.dialogue.replace("\n", "")}」
              </p>
              <div className="ending-actions">
                <button
                  className="primary-button"
                  onClick={() => setPanel("restart")}
                >
                  再听另一种答案 <RotateCcw size={16} />
                </button>
                <button
                  className="text-button"
                  onClick={() => setPanel("journal")}
                >
                  翻开手记 <ArrowUpRight size={15} />
                </button>
              </div>
              <small>第一章试玩结束 · 后续章节尚在创作中</small>
            </section>
          ) : (
            <section className="interaction-panel">
              <div className="dialogue-header">
                <span className="character-name">{character.name}</span>
                <span className="character-role">{character.role}</span>
                <span className="dialogue-line" />
                <span className="relationship">
                  <Heart size={12} />{" "}
                  {state.trust[node.character] >= 60
                    ? "渐渐靠近"
                    : state.trust[node.character] >= 35
                      ? "久别重逢"
                      : "初次相识"}
                </span>
              </div>
              <p className="dialogue" aria-live="polite">
                {busy ? (
                  <>
                    <span className="thinking-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="thinking-label">正在理解你的回应</span>
                  </>
                ) : (
                  reply || node.dialogue
                )}
              </p>
              {pending ? (
                <div className="continue-scene">
                  <span>她的话，落在雨声之间。</span>
                  <button className="primary-button" onClick={continueStory}>
                    继续故事 <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="choice-heading">
                    <span>你可以这样回应</span>
                    <span className="choice-hint">
                      或用自己的话，改变这个夜晚
                    </span>
                  </div>
                  <div className="choices">
                    {node.actions.map((action, index) => {
                      const allowed = actions.some((a) => a.id === action.id);
                      return (
                        <button
                          key={action.id}
                          className="choice"
                          disabled={!allowed || busy}
                          onClick={() => choose(action.id)}
                          title={
                            allowed ? action.hint : `尚未满足：${action.hint}`
                          }
                        >
                          <span className="choice-index">
                            {allowed ? (
                              String(index + 1).padStart(2, "0")
                            ) : (
                              <LockKeyhole size={13} />
                            )}
                          </span>
                          <span>
                            {action.label}
                            <small>
                              {allowed
                                ? action.hint
                                : `未解锁 · ${action.hint}`}
                            </small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      );
                    })}
                  </div>
                  <form
                    className={`composer ${listening ? "listening" : ""}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <button
                      type="button"
                      className="microphone"
                      onClick={startVoice}
                      disabled={busy}
                      aria-label={listening ? "停止语音输入" : "语音输入"}
                    >
                      {listening ? <AudioLines size={20} /> : <Mic size={19} />}
                    </button>
                    <span className="composer-divider" />
                    <textarea
                      ref={inputRef}
                      value={input}
                      maxLength={1000}
                      rows={1}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        listening
                          ? "正在听你说话，完成后请确认发送…"
                          : `对${character.name}说些什么…`
                      }
                      aria-label="你的回应"
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void submit();
                        }
                      }}
                    />
                    <span className="enter-hint">↵</span>
                    <button
                      type="submit"
                      className="send-button"
                      disabled={!input.trim() || busy}
                      aria-label="发送回应"
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <ArrowRight size={20} />
                      )}
                    </button>
                  </form>
                </>
              )}
              <div className="play-footer">
                <span>
                  <span className="status-dot" />
                  {liveStatus === "live"
                    ? `S2 实时影像 · ${Math.max(0, maxLive - elapsed)}s`
                    : "剧情图模式"}
                  <i /> {mode === "ai" ? "AI 语义交互" : "规则剧情试玩"}
                </span>
                <span>
                  <Check size={11} /> 进度自动保存
                  <span className="desktop-only"> · {node.objective}</span>
                </span>
              </div>
            </section>
          )}
        </>
      )}
      {notice && !panel && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            <X size={14} />
          </button>
        </div>
      )}
      {panel && (
        <Modal
          title={
            {
              journal: "留下的线索",
              people: "与你相遇的人",
              history: "那些说过的话",
              settings: "让故事更适合你",
              restart: "重新走进这个雨夜？",
              about: "关于这场重逢",
            }[panel]
          }
          kicker={
            {
              journal: "THE THINGS WE KEEP",
              people: "PEOPLE IN THE RAIN",
              history: "CONVERSATION",
              settings: "YOUR EXPERIENCE",
              restart: "ANOTHER BEGINNING",
              about: "BEFORE THE RAIN ENDS",
            }[panel]
          }
          onClose={() => setPanel(null)}
        >
          {notice && (
            <div className="panel-notice" role="status">
              {notice}
            </div>
          )}
          {panel === "journal" && (
            <>
              <p className="panel-intro">
                有些声音，只有放在一起，才能听懂。
                <span>{state.clues.length} / 4 已收录</span>
              </p>
              <div className="clue-list">
                {Object.entries(clues).map(([id, clue], index) => (
                  <article
                    className={`clue-card ${state.clues.includes(id as any) ? "unlocked" : "locked"}`}
                    key={id}
                  >
                    <div className="clue-number">0{index + 1}</div>
                    <div>
                      <span className="eyebrow">
                        {state.clues.includes(id as any)
                          ? clue.subtitle
                          : "尚未遇见"}
                      </span>
                      <h3>
                        {state.clues.includes(id as any)
                          ? clue.title
                          : "雨声里的空白"}
                      </h3>
                      <p>
                        {state.clues.includes(id as any)
                          ? clue.detail
                          : "继续探索，让故事把这块拼图交到你手上。"}
                      </p>
                    </div>
                    {!state.clues.includes(id as any) && (
                      <LockKeyhole size={16} />
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {panel === "people" && (
            <div className="people-grid">
              {Object.values(characters).map((c) => (
                <article className="person-card" key={c.id}>
                  <div
                    className="person-image"
                    style={{ backgroundImage: `url(${c.portrait})` }}
                  />
                  <div className="person-info">
                    <span className="eyebrow">
                      {c.age} 岁 / {c.role}
                    </span>
                    <h3>{c.name}</h3>
                    <blockquote>“{c.quote}”</blockquote>
                    <p>{c.description}</p>
                    <div className="trust-label">
                      <Heart size={13} />
                      <span>与你的信任</span>
                      <b>
                        {state.trust[c.id]}
                        <small> / 100</small>
                      </b>
                    </div>
                    <div className="trust-track">
                      <span style={{ width: `${state.trust[c.id]}%` }} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {panel === "history" && (
            <div className="history-list">
              {state.history.length ? (
                state.history.map((line) => (
                  <article
                    key={line.id}
                    className={line.speaker === "你" ? "player-line" : ""}
                  >
                    <span>
                      {line.speaker}
                      <small>{story[line.nodeId].time}</small>
                    </span>
                    <p>{line.text}</p>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <History size={28} />
                  <p>这个夜晚，还在等你的第一句话。</p>
                </div>
              )}
            </div>
          )}
          {panel === "settings" && (
            <div className="settings-list">
              <section>
                <span className="eyebrow">IMAGE & INTERACTION</span>
                <h3>让她真正动起来</h3>
                <p>
                  Vidu S2 实时角色表演。单次上限 {config?.liveMaxSeconds ?? 120}{" "}
                  秒，按会话时长计费；换人物或离开页面会结束会话。
                </p>
                <div className="service-state">
                  <span
                    className={`status-dot ${config?.viduConfigured ? "configured" : ""}`}
                  />
                  {config?.viduConfigured
                    ? `本地密钥已配置 · ${config.region === "api.vidu.com" ? "国际站" : "中国站"}`
                    : "尚未配置密钥，请在本地 .env 中设置 VIDU_API_KEY"}
                </div>
                <button
                  className="outline-button"
                  disabled={
                    !playing || Boolean(node.ending) || !config?.viduConfigured
                  }
                  onClick={startLive}
                >
                  {liveActive ? <Square size={14} /> : <Play size={14} />}{" "}
                  {liveActive ? "结束实时表演" : "开启本场实时表演"}
                </button>
                {!playing && <small>进入故事后即可开启。</small>}
                <p className="fine-print">
                  当前接入为 S2
                  实时版实验模式。视频口播可能与剧本字幕有差异，游戏分支以你的选择和手记为准。
                </p>
              </section>
              <section>
                <span className="eyebrow">READING</span>
                <div className="setting-row">
                  <div>
                    <h3>文字朗读</h3>
                    <p>使用浏览器系统声音；实时视频开启时暂停。</p>
                  </div>
                  <button
                    className={`toggle ${voice ? "on" : ""}`}
                    onClick={() => setVoice(!voice)}
                    aria-label="切换文字朗读"
                    aria-pressed={voice}
                  >
                    <span />
                  </button>
                </div>
                <label className="setting-row">
                  <span>对话字号</span>
                  <input
                    aria-label="对话字号"
                    type="range"
                    min="0.85"
                    max="1.25"
                    step="0.05"
                    value={textScale}
                    onChange={(e) => setTextScale(Number(e.target.value))}
                  />
                </label>
              </section>
              <section>
                <span className="eyebrow">YOUR MEMORY</span>
                <h3>保存这一晚</h3>
                <p>进度自动保存在此浏览器。导出文件可在另一台设备继续。</p>
                <div className="save-actions">
                  <button className="outline-button" onClick={exportSave}>
                    <Download size={15} /> 导出存档
                  </button>
                  <button
                    className="outline-button"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={15} /> 导入存档
                  </button>
                </div>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    void importSave(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  className="text-button danger"
                  onClick={() => setPanel("restart")}
                >
                  <RotateCcw size={13} /> 重新开始
                </button>
              </section>
              <section>
                <span className="eyebrow">INTERACTION MODE</span>
                <p>
                  {config?.llmConfigured
                    ? "已配置独立语言模型，输入将使用语义理解。"
                    : "当前为规则剧情试玩：支持明确意图和推荐选项。开放式语义理解可在 .env 中接入语言模型。"}
                </p>
                <p className="fine-print">
                  语音输入由浏览器识别服务处理，可能需要联网。角色均为原创成年虚构人物。
                </p>
              </section>
            </div>
          )}
          {panel === "restart" && (
            <div className="restart-content">
              <p>
                当前进度会被新的第一章替换。想留下这一次选择，可以先导出存档。
              </p>
              <div className="save-actions">
                <button className="outline-button" onClick={exportSave}>
                  <Download size={15} /> 先导出存档
                </button>
                <button className="primary-button" onClick={newGame}>
                  重新开始 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
          {panel === "about" && (
            <div className="about-content">
              <Film size={30} />
              <p>
                你是周屿，一名离开临海城三年的声音修复师。旧影院即将拆除，一封迟到的来信，让你在雨夜重新见到两个熟悉又陌生的人。
              </p>
              <p>
                用文字、语音或推荐选项回应她们。留意信件与声音里的细节，你的选择会改变这一章的落点。
              </p>
              <div className="about-details">
                <span>第一人称</span>
                <span>电影写实</span>
                <span>都市悬疑 · 恋爱</span>
              </div>
              <p className="fine-print">
                当前为第一章可玩原型。剧情图为 AI 生成；实时影像需主动开启 Vidu
                S2。尚未开启时显示静态剧情图。
              </p>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}

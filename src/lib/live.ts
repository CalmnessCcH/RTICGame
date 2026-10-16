export type LiveStatus =
  "idle" | "starting" | "warming" | "connecting" | "live" | "ended" | "error";
type Hooks = {
  status: (status: LiveStatus) => void;
  notice: (text: string) => void;
  started: (time: number, max: number) => void;
};
declare global {
  interface Window {
    AliRtcEngine?: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}
let sdkPromise: Promise<void> | undefined;
let teardown: Promise<void> = Promise.resolve();
function loadSdk() {
  if (window.AliRtcEngine) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.1.9/aliyun-rtc-sdk.js";
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("实时视频组件加载超时，请检查网络。"));
    }, 20000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("无法加载实时视频组件。"));
    };
    document.head.append(script);
  }).catch((e) => {
    sdkPromise = undefined;
    throw e;
  });
  return sdkPromise;
}
export class LiveSession {
  private data?: { id: string; ticket: string; rtc: any; maxSeconds: number };
  private socket?: WebSocket;
  private engine?: any;
  private stopped = false;
  private joined = false;
  private joinTask?: Promise<void>;
  private ready = false;
  private frameTimer?: ReturnType<typeof setTimeout>;
  private stopTask?: Promise<void>;
  private pending: {
    action: "perform" | "perform_action";
    nodeId: string;
    actionId?: string;
  } = { action: "perform", nodeId: "arrival" };
  constructor(
    private video: HTMLVideoElement,
    private hooks: Hooks,
  ) {}
  private ensure() {
    if (this.stopped) throw new Error("会话已取消");
  }
  async start(nodeId: string) {
    this.hooks.status("starting");
    this.pending = { action: "perform", nodeId };
    try {
      await teardown;
      this.ensure();
      await loadSdk();
      this.ensure();
      const Engine = window.AliRtcEngine;
      if (!Engine?.getInstance) throw new Error("实时视频组件未就绪。");
      // Playback only needs decoding. Run capability checks before billing starts.
      const support = await Engine.isSupported("recvonly");
      this.ensure();
      if (!support.support)
        throw new Error("当前浏览器不支持实时视频，请尝试 Chrome 或 Edge。");
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
        signal: AbortSignal.timeout(55000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法创建实时会话");
      this.data = data;
      if (this.stopped) {
        this.endRemote();
        return;
      }
      const socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live?${new URLSearchParams({ id: data.id, ticket: data.ticket })}`,
      );
      this.socket = socket;
      socket.onmessage = (event) => {
        if (this.stopped) return;
        let message: any;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.event === "warming") this.hooks.status("warming");
        if (message.event === "ready" && !this.ready) {
          this.ready = true;
          this.hooks.started(message.startedAt, message.maxSeconds);
          this.joinTask = this.joinRtc(nodeId).catch((e) => {
            if (!this.stopped) {
              this.hooks.notice(e.message);
              void this.stop("error");
            }
          });
        }
        if (message.event === "error") {
          this.hooks.notice(message.message);
          void this.stop("error");
        }
        if (message.event === "ended") {
          this.hooks.notice(message.reason);
          void this.stop("ended");
        }
      };
      socket.onerror = () => {
        if (!this.stopped) {
          this.hooks.notice("实时控制连接失败。");
          void this.stop("error");
        }
      };
      socket.onclose = () => {
        if (!this.stopped) {
          this.hooks.notice("实时会话已结束，可以继续文字剧情。");
          void this.stop("ended");
        }
      };
    } catch (e) {
      if (!this.stopped) {
        this.hooks.notice((e as Error).message);
        await this.stop("error");
      }
    }
  }
  private async joinRtc(nodeId: string) {
    this.ensure();
    this.hooks.status("connecting");
    const Engine = window.AliRtcEngine;
    if (!Engine?.getInstance) throw new Error("实时视频组件未就绪。");
    const engine = Engine.getInstance();
    this.engine = engine;
    const subscribe = (
      userId: string,
      _old: number,
      state: number,
      type: number,
    ) => {
      if (
        this.stopped ||
        state !== 3 ||
        !/^live-(bot|video-push)-/.test(userId)
      )
        return;
      engine.setRemoteViewConfig(this.video, userId, type);
      this.video.play().catch(() => {
        if (!this.stopped)
          this.hooks.notice(
            "视频已连接；如果没有声音，请点击画面右上角的声音按钮。",
          );
      });
    };
    engine.on("videoSubscribeStateChanged", (u: string, o: number, n: number) =>
      subscribe(u, o, n, 1),
    );
    engine.on(
      "screenShareSubscribeStateChanged",
      (u: string, o: number, n: number) => subscribe(u, o, n, 2),
    );
    engine.on("authInfoExpired", () => {
      this.hooks.notice("实时凭据已到期。");
      void this.stop("ended");
    });
    engine.on("bye", () => void this.stop("ended"));
    this.video.onplaying = () => {
      if (!this.stopped) {
        clearTimeout(this.frameTimer);
        this.hooks.status("live");
      }
    };
    await engine.setChannelProfile("communication");
    this.ensure();
    await engine.setAudioOnlyMode(false);
    this.ensure();
    // AliRTC defaults to opening camera + microphone on join unless both
    // publication flags are explicitly disabled before joining the channel.
    await engine.publishLocalVideoStream(false);
    this.ensure();
    await engine.publishLocalAudioStream(false);
    this.ensure();
    await engine.setDefaultSubscribeAllRemoteAudioStreams(true);
    this.ensure();
    await engine.setDefaultSubscribeAllRemoteVideoStreams(true);
    this.ensure();
    await engine.joinChannel(this.data!.rtc.token, this.data!.rtc.user_id);
    this.ensure();
    this.joined = true;
    this.flushPerformance();
    this.frameTimer = setTimeout(() => {
      if (!this.stopped && this.video.readyState < 2) {
        this.hooks.notice("已连接，但未收到可播放的视频，已结束会话。");
        void this.stop("error");
      }
    }, 25000);
  }
  private flushPerformance() {
    if (
      this.joined &&
      !this.stopped &&
      this.socket?.readyState === WebSocket.OPEN
    )
      this.socket.send(JSON.stringify(this.pending));
  }
  perform(nodeId: string) {
    this.pending = { action: "perform", nodeId };
    this.flushPerformance();
  }
  performAction(nodeId: string, actionId: string) {
    this.pending = { action: "perform_action", nodeId, actionId };
    this.flushPerformance();
  }
  chat(nodeId: string, content: string) {
    if (this.joined && this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ action: "chat", nodeId, content }));
  }
  interrupt() {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ action: "interrupt" }));
  }
  private endRemote() {
    if (this.data)
      void fetch("/api/live/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: this.data.id, ticket: this.data.ticket }),
        keepalive: true,
      }).catch(() => {});
  }
  stop(status: LiveStatus = "idle"): Promise<void> {
    if (this.stopTask) return this.stopTask;
    this.stopped = true;
    this.ready = false;
    this.endRemote();
    clearTimeout(this.frameTimer);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: "hangup" }));
      this.socket.close();
    } else if (this.socket?.readyState === WebSocket.CONNECTING)
      this.socket.addEventListener("open", () => this.socket?.close(), {
        once: true,
      });
    this.video.onplaying = null;
    this.video.srcObject = null;
    this.hooks.status(status);
    // Serialize access to AliRTC's singleton: old cleanup must never destroy a replacement.
    this.stopTask = (async () => {
      await this.joinTask?.catch(() => {});
      for (const method of ["leaveChannel", "destroy"]) {
        try {
          await this.engine?.[method]?.();
        } catch {}
      }
      this.engine = undefined;
    })();
    teardown = this.stopTask;
    return this.stopTask;
  }
}

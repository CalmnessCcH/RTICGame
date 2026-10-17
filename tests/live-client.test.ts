import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSession } from "../src/lib/live";
const tick = () => new Promise((r) => setTimeout(r, 0));
class Socket extends EventTarget {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 1;
  sent: any[] = [];
  onmessage: any;
  onerror: any;
  onclose: any;
  static all: Socket[] = [];
  constructor(_url: string) {
    super();
    Socket.all.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  ready() {
    this.onmessage?.({
      data: JSON.stringify({
        event: "ready",
        startedAt: Date.now(),
        maxSeconds: 120,
      }),
    });
  }
}
const sessions: LiveSession[] = [];
function setup(leave: () => Promise<void> = async () => {}) {
  let joined = false;
  const engine = {
    on: vi.fn(),
    switchMicrophone: vi.fn(async () => {}),
    muteAllRemoteAudioPlaying: vi.fn(),
    publishLocalVideoStream: vi.fn(async (_enabled: boolean) => {}),
    publishLocalAudioStream: vi.fn(async (_enabled: boolean) => {}),
    setChannelProfile: vi.fn(async () => {}),
    setAudioOnlyMode: vi.fn(async () => {}),
    setDefaultSubscribeAllRemoteAudioStreams: vi.fn(async () => {}),
    setDefaultSubscribeAllRemoteVideoStreams: vi.fn(async () => {}),
    joinChannel: vi.fn(async () => {
      joined = true;
    }),
    leaveChannel: vi.fn(leave),
    destroy: vi.fn(async () => {
      joined = false;
    }),
  };
  vi.stubGlobal("window", {
    AliRtcEngine: {
      isSupported: vi.fn(async () => ({ support: true })),
      getInstance: () => engine,
    },
  });
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:8787" });
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/end")
          ? { ok: true }
          : {
              id: "test",
              ticket: "ticket",
              rtc: { token: "ephemeral", user_id: "user" },
              maxSeconds: 120,
            },
    })),
  );
  const make = () => {
    const s = new LiveSession(
      {
        srcObject: null,
        readyState: 4,
        play: async () => {},
        onplaying: null,
      } as unknown as HTMLVideoElement,
      { status: vi.fn(), notice: vi.fn(), started: vi.fn() },
    );
    sessions.push(s);
    return s;
  };
  return { make, engine, joined: () => joined };
}
afterEach(async () => {
  for (const s of sessions) await s.stop();
  sessions.length = 0;
  Socket.all.length = 0;
  vi.unstubAllGlobals();
});
describe("live lifecycle", () => {
  it('retains output mute requested before the RTC engine exists',async()=>{
    const {make,engine}=setup();const session=make();session.setOutputMuted(true);
    await session.start('arrival');Socket.all[0].ready();await tick();await tick();
    expect(engine.muteAllRemoteAudioPlaying).toHaveBeenLastCalledWith(true);
  });

  it("obtains microphone before paying and releases it on cancellation", async () => {
    const { make } = setup();
    const stop = vi.fn();
    const track = {
      enabled: true,
      stop,
      getSettings: () => ({ deviceId: "mic" }),
    };
    const gum = vi.fn(async () => ({
      getTracks: () => [track],
      getAudioTracks: () => [track],
    }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: gum } });
    const session = make();
    await session.start("arrival", { microphone: true });
    expect(gum).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    expect(gum.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0],
    );
    await session.stop();
    expect(stop).toHaveBeenCalled();
  });

  it("disables local audio and video publishing before joining RTC", async () => {
    const { make, engine } = setup();
    await make().start("arrival");
    Socket.all[0].ready();
    await tick();
    await tick();
    expect(engine.publishLocalVideoStream).toHaveBeenCalledWith(false);
    expect(engine.publishLocalAudioStream).toHaveBeenCalledWith(false);
    expect(
      engine.publishLocalVideoStream.mock.invocationCallOrder[0],
    ).toBeLessThan(engine.joinChannel.mock.invocationCallOrder[0]);
    expect(
      engine.publishLocalAudioStream.mock.invocationCallOrder[0],
    ).toBeLessThan(engine.joinChannel.mock.invocationCallOrder[0]);
  });
  it("checks receive-only support before creating a billable session", async () => {
    const { make } = setup();
    const support = vi.mocked(window.AliRtcEngine.isSupported);
    support.mockResolvedValue({ support: false });
    await make().start("arrival");
    expect(support).toHaveBeenCalledWith("recvonly");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("performs the latest scene when the player advances during warmup", async () => {
    const { make } = setup();
    const s = make();
    await s.start("arrival");
    s.perform("envelope");
    Socket.all[0].ready();
    await tick();
    await tick();
    expect(
      Socket.all[0].sent
        .filter((x) => x.action === "perform")
        .map((x) => x.nodeId),
    ).toEqual(["envelope"]);
  });
  it("finishes old singleton teardown once before starting a replacement", async () => {
    let release!: () => void;
    let pending = true;
    const oldLeave = new Promise<void>((r) => (release = r));
    const { make, engine, joined } = setup(() =>
      pending ? oldLeave : Promise.resolve(),
    );
    const first = make();
    await first.start("arrival");
    Socket.all[0].ready();
    await tick();
    await tick();
    const closing = first.stop();
    const second = make();
    const starting = second.start("arrival");
    await tick();
    const countBeforeRelease = Socket.all.length;
    pending = false;
    release();
    await closing;
    await starting;
    Socket.all.at(-1)!.ready();
    await tick();
    await tick();
    expect(countBeforeRelease).toBe(1);
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(joined()).toBe(true);
  });
});

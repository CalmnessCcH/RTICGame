import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { Express } from "express";
import { avatarPayload, isLocalRequest, safeError } from "./safety";
import { characters, story } from "../src/game/story";

type Session = {
  id: string;
  ticket: string;
  character: string;
  remote: WebSocket;
  client?: WebSocket;
  ready: boolean;
  ended: boolean;
  seq: number;
  conn: string;
  created: number;
  started?: number;
  timers: ReturnType<typeof setTimeout>[];
  retry?: ReturnType<typeof setTimeout>;
  lastText?: number;
  report: Report;
};
type Report = {
  id: string;
  createdAt: number;
  readyMs?: number;
  endedAt?: number;
  reason?: string;
  messages: number;
  textSent: number;
  upstreamState?: string;
  billedSeconds?: number;
  creditsCost?: number;
  queryError?: string;
};

export function installLive(app: Express, server: Server) {
  const key = (process.env.VIDU_API_KEY ?? "").replace(/^Token\s+/, "").trim();
  const host =
    process.env.VIDU_HOST === "api.vidu.com" ? "api.vidu.com" : "api.vidu.cn";
  const maxSeconds = Math.max(
    15,
    Math.min(600, Number(process.env.LIVE_MAX_SECONDS) || 120),
  );
  const sessions = new Map<string, Session>();
  const reports: Report[] = [];
  let creating = false;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16000 });
  const send = (s: Session, event: object) => {
    if (s.client?.readyState === WebSocket.OPEN)
      s.client.send(JSON.stringify(event));
  };
  function signal(s: Session, type: number, payload: object) {
    if (s.remote.readyState === WebSocket.OPEN)
      s.remote.send(
        JSON.stringify({
          type,
          live_id: s.id,
          conn_id: s.conn,
          seq_id: ++s.seq,
          payload,
        }),
      );
  }
  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`https://${host}${path}`, {
      ...options,
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data)
      throw new Error(
        safeError(
          data?.error?.message ||
            data?.message ||
            `Vidu HTTP ${response.status}`,
        ),
      );
    return data;
  }
  async function queryReport(report: Report) {
    try {
      const data = await api(`/live/v1/lives/${encodeURIComponent(report.id)}`);
      const live = data.live ?? data;
      report.upstreamState = live.status;
      report.billedSeconds = Number(live.billed_seconds) || 0;
      report.creditsCost = Number(live.credits_cost) || 0;
    } catch (e) {
      report.queryError = safeError((e as Error).message);
    }
  }
  function end(s: Session, reason: string) {
    if (s.ended) return;
    s.ended = true;
    s.timers.forEach(clearTimeout);
    clearTimeout(s.retry);
    signal(s, 5, { hangup: { hangup_reason: "user_end" } });
    send(s, { event: "ended", reason });
    s.client?.close(1000, "session ended");
    // If shutdown races the upstream handshake, send hangup immediately on open.
    if (s.remote.readyState === WebSocket.CONNECTING) {
      s.remote.once("open", () => {
        signal(s, 5, { hangup: { hangup_reason: "user_end" } });
        s.remote.close();
      });
    } else if (s.remote.readyState === WebSocket.OPEN)
      s.remote.close(1000, "session ended");
    s.report.endedAt = Date.now();
    s.report.reason = reason;
    sessions.delete(s.id);
    const check = setTimeout(() => void queryReport(s.report), 1800);
    check.unref();
  }
  function attachUpstream(s: Session) {
    s.remote.on("open", () => {
      if (s.ended) return;
      signal(s, 1, { conn_init: { version: 1 } });
    });
    s.remote.on("message", (buffer) => {
      if (s.ended) return;
      let message: any;
      try {
        message = JSON.parse(buffer.toString());
      } catch {
        return;
      }
      s.report.messages++;
      const ack = message.payload?.conn_init_ack;
      if (message.type === 2 && ack) {
        if (ack.success) {
          if (!s.ready) {
            s.ready = true;
            s.started = Date.now();
            s.report.readyMs = s.started - s.created;
            clearTimeout(s.retry);
            s.timers.push(
              setTimeout(
                () => end(s, "已达到本次实时体验时长上限"),
                maxSeconds * 1000,
              ),
            );
          }
          send(s, { event: "ready", startedAt: s.started, maxSeconds });
        } else if (ack.error_code === "NOT_READY") {
          send(s, { event: "warming" });
          clearTimeout(s.retry);
          s.retry = setTimeout(
            () => signal(s, 1, { conn_init: { version: 1 } }),
            2500,
          );
        } else {
          send(s, {
            event: "error",
            message: safeError(ack.error_msg || ack.error_code || "初始化失败"),
          });
          end(s, "初始化失败");
        }
      }
      if (message.type === 6)
        end(
          s,
          safeError(message.payload?.hangup?.hangup_reason || "服务端结束会话"),
        );
    });
    s.remote.on("error", () => {
      send(s, {
        event: "error",
        message: "Vidu 控制连接失败，请检查网络和区域配置。",
      });
      end(s, "上游连接错误");
    });
    s.remote.on("close", () => end(s, "实时连接已关闭"));
    s.timers.push(
      setTimeout(() => {
        if (!s.ready) end(s, "角色准备超时，请稍后重试");
      }, 60000),
    );
    s.timers.push(
      setTimeout(() => {
        if (!s.client) end(s, "客户端未连接，已自动回收");
      }, 30000),
    );
  }
  app.get("/api/status", (_req, res) =>
    res.json({
      viduConfigured: Boolean(key),
      region: host,
      liveMaxSeconds: maxSeconds,
      activeLive: sessions.size,
      llmConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL),
    }),
  );
  app.get("/api/live/reports", (_req, res) => res.json(reports));
  app.post("/api/live", async (req, res) => {
    if (!key) {
      res.status(503).json({ error: "尚未配置 Vidu API 密钥。" });
      return;
    }
    if (creating || sessions.size) {
      res.status(409).json({ error: "已有实时会话，请先结束后再试。" });
      return;
    }
    const node =
      typeof req.body?.nodeId === "string" ? story[req.body.nodeId] : undefined;
    if (!node || node.ending) {
      res.status(400).json({ error: "当前节点无法开启实时表演。" });
      return;
    }
    creating = true;
    try {
      const image = await readFile(
        resolve("public", characters[node.character].image.slice(1)),
      );
      const data = await api("/live/s_avatar/realtime", {
        method: "POST",
        body: JSON.stringify(
          avatarPayload(
            node.id,
            `data:image/png;base64,${image.toString("base64")}`,
          ),
        ),
      });
      const id = data.live?.id;
      if (typeof id !== "string" || !id)
        throw new Error("Vidu 没有返回有效的会话编号。");
      const conn = randomUUID();
      const remote = new WebSocket(
        `wss://${host}/live/ws/live/connect?${new URLSearchParams({ live_id: id, conn_id: conn })}`,
        {
          headers: { Authorization: `Token ${key}` },
          handshakeTimeout: 15000,
          maxPayload: 1024 * 1024,
        },
      );
      const report: Report = {
        id,
        createdAt: Date.now(),
        messages: 0,
        textSent: 0,
      };
      reports.push(report);
      if (reports.length > 20) reports.shift();
      const s: Session = {
        id,
        conn,
        remote,
        ticket: randomUUID(),
        character: node.character,
        ready: false,
        ended: false,
        seq: 0,
        created: Date.now(),
        timers: [],
        report,
      };
      sessions.set(id, s);
      attachUpstream(s);
      if (!data.rtc?.token) {
        end(s, "缺少 RTC 凭据");
        throw new Error("Vidu 未返回完整 RTC 凭据。");
      }
      if (res.destroyed) {
        end(s, "请求方已离开");
        return;
      }
      res.json({ id, ticket: s.ticket, rtc: data.rtc, maxSeconds });
    } catch (e) {
      res.status(502).json({ error: safeError((e as Error).message) });
    } finally {
      creating = false;
    }
  });
  app.post("/api/live/end", (req, res) => {
    const s = sessions.get(req.body?.id);
    if (s && s.ticket === req.body?.ticket) end(s, "玩家结束会话");
    res.json({ ok: true });
  });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws/live") return;
    const s = sessions.get(url.searchParams.get("id") ?? "");
    if (
      !isLocalRequest(req.headers.host, req.headers.origin) ||
      !s ||
      s.ticket !== url.searchParams.get("ticket") ||
      s.client
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      s.client = client;
      if (s.ready)
        send(s, { event: "ready", startedAt: s.started, maxSeconds });
      else send(s, { event: "warming" });
      // A dead browser must not hold a billable upstream session until the full cap.
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) {
          end(s, "客户端断开");
          return;
        }
        alive = false;
        client.ping();
      }, 10000);
      client.on("pong", () => {
        alive = true;
      });
      client.on("close", () => {
        clearInterval(heartbeat);
        end(s, "客户端离开");
      });
      client.on("error", () => end(s, "客户端连接错误"));
      client.on("message", (buffer) => {
        try {
          const msg = JSON.parse(buffer.toString());
          if (msg.action === "hangup") {
            end(s, "玩家结束会话");
            return;
          }
          if (!s.ready || s.ended) return;
          if (msg.action === "interrupt") {
            signal(s, 7, {});
            return;
          }
          if (Date.now() - (s.lastText ?? 0) < 500) return;
          const node =
            typeof msg.nodeId === "string" ? story[msg.nodeId] : undefined;
          if (!node || node.character !== s.character) return;
          let content: string;
          if (msg.action === "perform")
            content = `表演台词：${node.dialogue}。轻微自然表情，保持原有背景和衣服，不要读出指令。`;
          else if (msg.action === "perform_action") {
            const action = node.actions.find((a) => a.id === msg.actionId);
            if (!action) return;
            content = `表演台词：${action.reply}。轻微自然表情，保持原有背景和衣服，不要读出指令。`;
          } else if (
            msg.action === "chat" &&
            typeof msg.content === "string" &&
            msg.content.trim()
          )
            content = msg.content.trim().slice(0, 1000);
          else return;
          s.lastText = Date.now();
          s.report.textSent++;
          signal(s, 99, {
            text_msg: { msg_id: randomUUID(), content, timestamp: Date.now() },
          });
          send(s, { event: "text_sent" });
        } catch {
          send(s, { event: "error", message: "无法读取本次指令。" });
        }
      });
    });
  });
  return {
    shutdown: () => {
      for (const s of [...sessions.values()]) end(s, "本地服务关闭");
      wss.close();
    },
  };
}

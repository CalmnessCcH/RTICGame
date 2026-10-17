import { downloadRecording } from "./recording";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const keyTag = (key: string) =>
  createHash("sha256").update(key).digest("hex").slice(0, 16);
export type Memory = {
  id: string;
  nodeId: string;
  character: string;
  createdAt: number;
  region: string;
  keyTag: string;
  endedAt?: number;
  status: "live" | "pending" | "ready" | "error";
  error?: string;
  transcript: { speaker: string; text: string; at: number }[];
  billedSeconds?: number;
  creditsCost?: number;
};
export class MemoryStore {
  private data = new Map<string, Memory>();
  private loaded: Promise<void>;
  private queue = Promise.resolve();
  private jobs = new Set<string>();
  constructor(public root = resolve(".data/memories")) {
    this.loaded = this.load();
  }
  private async load() {
    await mkdir(this.root, { recursive: true });
    const records = await readFile(join(this.root, "index.json"), "utf8").catch(
      (e) => {
        if (e.code === "ENOENT") return "[]";
        throw e;
      },
    );
    for (const m of JSON.parse(records)) {
      if (/^[\w-]+$/.test(m.id))
        this.data.set(m.id, {
          ...m,
          status: m.status === "live" ? "pending" : m.status,
        });
    }
  }
  private async persist() {
    const content = JSON.stringify([...this.data.values()]);
    const save = async () => {
      const tmp = join(this.root, `index.${randomUUID()}.tmp`);
      await writeFile(tmp, content, { mode: 0o600 });
      await rename(tmp, join(this.root, "index.json"));
    };
    this.queue = this.queue.then(save, save);
    await this.queue;
  }
  async list() {
    await this.loaded;
    return [...this.data.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({ ...m, transcript: [...m.transcript] }));
  }
  async get(id: string) {
    await this.loaded;
    return this.data.get(id);
  }
  async create(m: Omit<Memory, "status" | "transcript">) {
    await this.loaded;
    if (!/^[\w-]+$/.test(m.id)) throw new Error("无效回忆");
    this.data.set(m.id, { ...m, status: "live", transcript: [] });
    await this.persist();
  }
  async update(id: string, patch: Partial<Memory>) {
    await this.loaded;
    const m = this.data.get(id);
    if (!m) return;
    Object.assign(m, patch, { id });
    await this.persist();
  }
  async append(id: string, speaker: string, text: string) {
    await this.loaded;
    const m = this.data.get(id);
    if (!m) return;
    m.transcript = [
      ...m.transcript,
      { speaker, text: text.slice(0, 2000), at: Date.now() },
    ].slice(-300);
    await this.persist();
  }
  file(id: string) {
    if (!/^[\w-]+$/.test(id)) throw new Error("无效回忆");
    return join(this.root, `${id}.mp4`);
  }
  async remove(id: string) {
    this.file(id);
    await this.loaded;
    const m = this.data.get(id);
    if (m?.status === "live") throw new Error("请先结束通话再删除。");
    this.data.delete(id);
    await this.persist();
    await rm(this.file(id), { force: true });
  }
  async refresh(id: string, credentials: { key: string; host: string }) {
    await this.loaded;
    const m = this.data.get(id);
    if (!m || m.status === "live" || m.status === "ready" || this.jobs.has(id))
      return;
    if (m.keyTag !== keyTag(credentials.key) || m.region !== credentials.host) {
      await this.update(id, {
        status: "error",
        error: "请切回创建这段回忆的密钥及区域后刷新。",
      });
      return;
    }
    this.jobs.add(id);
    const temp = this.file(id) + ".part";
    try {
      const response = await fetch(
        `https://${credentials.host}/live/v1/lives/${encodeURIComponent(id)}/recording`,
        {
          headers: { Authorization: `Token ${credentials.key}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new Error(`录像查询暂不可用（${response.status}）`);
      const { recording } = await response.json();
      if (recording?.error_code && recording.error_code !== "unspecified")
        throw new Error("Vidu 录像生成失败，请稍后刷新。");
      if (!recording?.video_url) {
        await this.update(id, { status: "pending", error: undefined });
        return;
      }
      const url = new URL(recording.video_url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        /^(localhost|127\.|10\.|192\.168\.|\[)/.test(url.hostname)
      )
        throw new Error("录像地址无效。");
      const video = await downloadRecording(url);
      if (!this.data.has(id)) return;
      await writeFile(temp, video, { mode: 0o600 });
      if (!this.data.has(id)) {
        await rm(temp, { force: true });
        return;
      }
      await rename(temp, this.file(id));
      if (!this.data.has(id)) {
        await rm(this.file(id), { force: true });
        return;
      }

      await this.update(id, { status: "ready", error: undefined });
    } catch (e) {
      await this.update(id, {
        status: "error",
        error:
          (e as Error).name === "TimeoutError"
            ? "录像下载超时，请刷新重试。"
            : (e as Error).message,
      });
      await rm(temp, { force: true });
    } finally {
      this.jobs.delete(id);
    }
  }
}

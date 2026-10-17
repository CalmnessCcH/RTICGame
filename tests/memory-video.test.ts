import { it, expect, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fixture = vi.hoisted(() => ({ file: "" }));
vi.mock("../server/memories", () => ({
  keyTag: () => "",
  MemoryStore: class {
    async get() {
      return { status: "ready" };
    }
    file() {
      return fixture.file;
    }
  },
}));
import { installLive } from "../server/live";
it("serves private recordings to the validated playback route with byte ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "rain-video-"));
  await mkdir(join(root, ".data"));
  fixture.file = join(root, ".data", "video.mp4");
  await writeFile(fixture.file, Buffer.from([0, 1, 2, 3, 4]));
  const app = express(),
    server = createServer(app);
  const live = installLive(app, server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const port = (server.address() as any).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/memories/one/video`,
      { headers: { Range: "bytes=1-3" } },
    );
    expect(response.status).toBe(206);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      1, 2, 3,
    ]);
  } finally {
    live.shutdown();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});

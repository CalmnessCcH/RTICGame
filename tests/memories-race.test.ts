import { it, expect, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const gate = vi.hoisted(() => ({
  beforeRename: undefined as undefined | (() => Promise<void>),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<any>();
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (from.endsWith(".part")) await gate.beforeRename?.();
      return fs.rename(from, to);
    },
  };
});
import { MemoryStore, keyTag } from "../server/memories";
it("does not leave a deleted video when removal races the final rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "rain-race-"));
  try {
    const store = new MemoryStore(root);
    await store.create({
      id: "race",
      nodeId: "arrival",
      character: "lin",
      createdAt: 1,
      region: "api.vidu.com",
      keyTag: keyTag("test"),
    });
    await store.update("race", { status: "pending" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/recording")
          ? {
              ok: true,
              json: async () => ({
                recording: { video_url: "https://cdn.example.com/video.mp4" },
              }),
            }
          : {
              ok: true,
              body: new ReadableStream({
                start(c) {
                  c.enqueue(new Uint8Array([1, 2, 3]));
                  c.close();
                },
              }),
            },
      ),
    );
    gate.beforeRename = () => store.remove("race");
    await store.refresh("race", { key: "test", host: "api.vidu.com" });
    expect(await store.list()).toEqual([]);
    await expect(stat(store.file("race"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    gate.beforeRename = undefined;
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  }
});

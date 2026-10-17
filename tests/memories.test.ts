import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../server/memories";
describe("durable memories", () => {
  it("preserves captions across restart and removes only the requested memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "rain-memory-"));
    try {
      const store = new MemoryStore(root);
      await store.create({
        id: "one",
        nodeId: "arrival",
        character: "lin",
        createdAt: 1,
        region: "api.vidu.com",
        keyTag: "tag",
      });
      await store.update("one", {
        status: "pending",
        transcript: [{ speaker: "你", text: "你好", at: 2 }],
      });
      const again = new MemoryStore(root);
      expect((await again.list())[0].transcript[0].text).toBe("你好");
      await expect(again.remove("../.env")).rejects.toThrow();
      await again.remove("one");
      expect(await again.list()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

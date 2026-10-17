import { it, expect, vi } from "vitest";
import { downloadRecording } from "../server/recording";
it("reassembles validated ranges in byte order", async () => {
  const data = Buffer.alloc(1024 * 1024 + 3, 7);
  data.fill(9, 1024 * 1024);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const [start, end] = options.headers.Range.slice(6)
        .split("-")
        .map(Number);
      const last = Math.min(end, data.length - 1);
      return new Response(data.subarray(start, last + 1), {
        status: 206,
        headers: { "content-range": `bytes ${start}-${last}/${data.length}` },
      });
    }),
  );
  try {
    expect(
      (await downloadRecording(new URL("https://example.com/video"))).equals(
        data,
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("rejects a truncated range instead of saving a corrupt video", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("a", {
          status: 206,
          headers: { "content-range": "bytes 0-2/3" },
        }),
    ),
  );
  try {
    await expect(
      downloadRecording(new URL("https://example.com/video")),
    ).rejects.toThrow("不完整");
  } finally {
    vi.unstubAllGlobals();
  }
});

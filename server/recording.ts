const chunkSize = 1024 * 1024;
const limit = 120 * chunkSize;

// Parallel ranges avoid one slow cross-region connection timing out the whole MP4.
export async function downloadRecording(url: URL): Promise<Buffer> {
  const deadline = AbortSignal.timeout(240000);
  async function requestPart(start: number, end: number) {
    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      redirect: "error",
      signal: AbortSignal.any([deadline, AbortSignal.timeout(60000)]),
    });
    if (!response.ok || !response.body)
      throw new Error("录像下载失败，请刷新重试。");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body as any) {
      bytes += chunk.length;
      if (bytes > limit) throw new Error("录像超过本地 120MB 限制。");
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    if (response.status !== 206) {
      if (start !== 0) throw new Error("录像分段下载失败，请刷新重试。");
      return { data, total: bytes };
    }
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
      response.headers.get("content-range") || "",
    );
    if (
      !match ||
      Number(match[1]) !== start ||
      Number(match[2]) !== Math.min(end, Number(match[3]) - 1) ||
      bytes !== Number(match[2]) - start + 1
    )
      throw new Error("录像分段不完整，请刷新重试。");
    const total = Number(match[3]);
    if (total > limit) throw new Error("录像超过本地 120MB 限制。");
    return { data, total };
  }
  async function part(start: number, end: number) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestPart(start, end);
      } catch (e) {
        if (
          attempt >= 2 ||
          deadline.aborted ||
          !["TypeError", "TimeoutError"].includes((e as Error).name)
        )
          throw e;
      }
    }
  }
  const first = await part(0, chunkSize - 1);
  if (!first.total) throw new Error("录像为空，请稍后重试。");
  if (first.data.length === first.total) return first.data;
  const parts = [first.data];
  let next = 1;
  const count = Math.ceil(first.total / chunkSize);
  await Promise.all(
    Array.from({ length: Math.min(4, count - 1) }, async () => {
      while (next < count) {
        const index = next++;
        const p = await part(
          index * chunkSize,
          Math.min(first.total - 1, (index + 1) * chunkSize - 1),
        );
        if (p.total !== first.total)
          throw new Error("录像文件发生变化，请刷新重试。");
        parts[index] = p.data;
      }
    }),
  );
  return Buffer.concat(parts);
}

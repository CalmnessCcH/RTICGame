import { useEffect, useState } from "react";
import { characters, story } from "../game/story";
type Memory = {
  id: string;
  nodeId: string;
  character: "lin" | "shen";
  createdAt: number;
  status: string;
  error?: string;
  creditsCost?: number;
  transcript: { speaker: string; text: string; at: number }[];
};
export function Memories() {
  const [items, setItems] = useState<Memory[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const r = await fetch("/api/memories");
      if (!r.ok) throw new Error("回忆加载失败。");
      setItems(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);
  const post = async (path: string, id: string) => {
    try {
      const r = await fetch(`/api/memories/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="memory-gallery">
      <p className="panel-intro">
        和她说过的话，留在这一晚。录像结束后通常需要约两分钟生成，下载到本机后可反复观看。
      </p>
      {loading && <p>正在翻阅回忆…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !items.length && (
        <div className="empty-state">
          <p>还没有录下的故事。</p>
          <small>下一次实时通话会自动收录在这里。</small>
        </div>
      )}
      {items.map((m) => (
        <article className="memory-card" key={m.id}>
          <div className="memory-heading">
            <div>
              <small>{new Date(m.createdAt).toLocaleString("zh-CN")}</small>
              <h3>
                {characters[m.character]?.name} ·{" "}
                {story[m.nodeId]?.title || "雨夜片段"}
              </h3>
            </div>
            <span>
              {
                (
                  {
                    live: "通话中",
                    pending: "录像生成中",
                    ready: "可以重温",
                    error: "待重试",
                  } as any
                )[m.status]
              }
            </span>
          </div>
          {selected === m.id && m.status === "ready" ? (
            <video
              controls
              autoPlay
              playsInline
              src={`/api/memories/${m.id}/video`}
            />
          ) : (
            <button
              className="memory-cover"
              disabled={m.status !== "ready"}
              onClick={() => setSelected(m.id)}
              style={{
                backgroundImage: `url(${characters[m.character]?.image})`,
              }}
            >
              {m.status === "ready"
                ? "▶ 重温这一刻"
                : m.status === "live"
                  ? "正在记录此刻"
                  : "等待录像生成"}
            </button>
          )}
          {m.error && <p>{m.error}</p>}
          <div className="memory-actions">
            {m.status === "ready" ? (
              <a
                className="outline-button"
                href={`/api/memories/${m.id}/video`}
                download={`雨停之前-${m.id}.mp4`}
              >
                下载视频
              </a>
            ) : (
              <button
                className="outline-button"
                disabled={m.status === "live"}
                onClick={() => void post("refresh", m.id)}
              >
                刷新录像
              </button>
            )}
            <button
              className="text-button"
              disabled={m.status === "live"}
              onClick={() => void post("delete", m.id)}
            >
              删除这段回忆
            </button>
            {m.creditsCost !== undefined && <small>{m.creditsCost} 积分</small>}
          </div>
          <details>
            <summary>
              查看对话 ·{" "}
              {m.transcript.filter((t) => t.speaker !== "剧情指令").length} 条
            </summary>
            {m.transcript
              .filter((t) => t.speaker !== "剧情指令")
              .map((t, i) => (
                <p key={i}>
                  <strong>{t.speaker}</strong>　{t.text}
                </p>
              ))}
          </details>
        </article>
      ))}
    </div>
  );
}

import { useState } from "react";
const presets = [
  { id: "coffee", label: "递一杯咖啡", image: "lin-cafe.png", kind: "道具" },
  { id: "knit", label: "米白针织衫", image: "lin-reference.png", kind: "换装" },
  {
    id: "coat",
    label: "风衣与高领衫",
    image: "shen-reference.png",
    kind: "换装",
  },
  { id: "cafe", label: "雨夜咖啡馆", image: "cafe-empty.png", kind: "背景" },
  {
    id: "cinema",
    label: "旧影院放映室",
    image: "cinema-empty.png",
    kind: "背景",
  },
];
export function Interactions({
  active,
  busy,
  message,
  onApply,
}: {
  active: boolean;
  busy: boolean;
  message: string;
  onApply: (op: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState("object"),
    [image, setImage] = useState(""),
    [prompt, setPrompt] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="interactions">
      <p className="panel-intro">
        把一个小动作，变成此刻的回应。画面变化不会改变剧情线索。
      </p>
      {!active && (
        <p className="panel-notice">进入故事并开启通话后，即可与她互动。</p>
      )}
      <div className="interaction-grid">
        {presets.map((p) => (
          <button
            key={p.id}
            disabled={!active || busy}
            onClick={() => onApply({ preset: p.id })}
          >
            <img src={`/assets/${p.image}`} alt="" />
            <small>{p.kind}</small>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <details>
        <summary>使用自己的道具、服装或场景图</summary>
        <label>
          互动类型
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="object">剧情道具</option>
            <option value="garment">衣服</option>
            <option value="background">背景</option>
          </select>
        </label>
        <label>
          参考图（PNG / JPEG / WebP，最多 3MB）
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setImage("");
              setError("");
              if (!f) return;
              if (
                f.size > 3 * 1024 * 1024 ||
                !["image/png", "image/jpeg", "image/webp"].includes(f.type)
              ) {
                setError("请选择 3MB 以内的 PNG、JPEG 或 WebP。");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setImage(String(reader.result));
              reader.readAsDataURL(f);
            }}
          />
        </label>
        {image && (
          <img className="reference-preview" src={image} alt="互动参考图" />
        )}
        <label>
          想让她怎么做
          <input
            value={prompt}
            maxLength={500}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：拿起这封信，仔细看一眼"
          />
        </label>
        <button
          className="outline-button"
          disabled={!active || busy || !image}
          onClick={() => onApply({ kind, image, prompt })}
        >
          应用参考图
        </button>
      </details>
      <button
        className="text-button"
        disabled={!active || busy}
        onClick={() => onApply({ remove: true })}
      >
        撤销最近一次画面变化
      </button>
      <p role="status">{busy ? "正在等待角色接受参考图…" : message || error}</p>
    </div>
  );
}

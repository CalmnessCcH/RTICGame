import { useState } from "react";
export function GameSettings({
  config,
  onSaved,
  active,
}: {
  config: any;
  onSaved: (config: any) => void;
  active: boolean;
}) {
  const [key, setKey] = useState(""),
    [region, setRegion] = useState(config?.region || "api.vidu.com"),
    [llmKey, setLlmKey] = useState(""),
    [base, setBase] = useState(config?.llmBaseUrl || ""),
    [model, setModel] = useState(config?.llmModel || ""),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="connection-settings">
      <span className="eyebrow">CONNECTION</span>
      <h3>连接你的角色</h3>
      <p>密钥仅保存在此电脑的服务端；留空保留已有密钥。修改前请结束通话。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setMessage("");
          try {
            const r = await fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                viduKey: key,
                region,
                llmKey,
                llmBaseUrl: base,
                llmModel: model,
              }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setKey("");
            setLlmKey("");
            onSaved(d);
            setMessage("已保存，新通话立即使用新配置。");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Vidu API Key
          <input
            type="password"
            autoComplete="new-password"
            placeholder={
              config?.viduConfigured ? "已配置 · 输入新 Key 可替换" : "vda_…"
            }
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={active}
          />
        </label>
        <label>
          密钥区域
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={active}
          >
            <option value="api.vidu.com">国际站 platform.vidu.com</option>
            <option value="api.vidu.cn">中国站 platform.vidu.cn</option>
          </select>
        </label>
        <details>
          <summary>增强剧情理解（可选语言模型）</summary>
          <p>
            Vidu
            负责实时对话；独立语言模型可提升剧情意图识别。未配置时使用同义匹配与三轮引导。
          </p>
          <label>
            语言模型 Key
            <input
              type="password"
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              autoComplete="new-password"
              placeholder="留空保留"
            />
          </label>
          <label>
            兼容接口地址
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label>
            模型名称
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="模型 ID"
            />
          </label>
        </details>
        <button className="outline-button" disabled={active || saving}>
          {saving ? "正在保存…" : "保存连接设置"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}

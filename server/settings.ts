import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
export function publicSettings() {
  return {
    viduConfigured: Boolean(process.env.VIDU_API_KEY),
    region:
      process.env.VIDU_HOST === "api.vidu.cn" ? "api.vidu.cn" : "api.vidu.com",
    llmConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL),
    llmBaseUrl: process.env.LLM_BASE_URL || "",
    llmModel: process.env.LLM_MODEL || "",
  };
}
export async function saveSettings(input: any, path = resolve(".env")) {
  if (!input || !["api.vidu.cn", "api.vidu.com"].includes(input.region))
    throw new Error("请选择中国站或国际站。");
  const patch: Record<string, string> = { VIDU_HOST: input.region };
  if (input.viduKey) {
    if (
      typeof input.viduKey !== "string" ||
      !/^vda_[A-Za-z0-9_-]{8,200}$/.test(input.viduKey)
    )
      throw new Error("Vidu Key 格式无效。");
    patch.VIDU_API_KEY = input.viduKey;
  }
  if (input.llmKey) {
    if (
      typeof input.llmKey !== "string" ||
      input.llmKey.length > 300 ||
      /[\r\n\0]/.test(input.llmKey)
    )
      throw new Error("语言模型 Key 格式无效。");
    patch.LLM_API_KEY = input.llmKey;
  }
  if (input.llmBaseUrl !== undefined) {
    const value = String(input.llmBaseUrl).trim();
    if (value) {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error("语言模型接口须为 HTTPS 地址。");
    }
    patch.LLM_BASE_URL = value;
  }
  if (input.llmModel !== undefined) {
    if (
      typeof input.llmModel !== "string" ||
      input.llmModel.length > 120 ||
      /[\r\n\0]/.test(input.llmModel)
    )
      throw new Error("模型名称无效。");
    patch.LLM_MODEL = input.llmModel;
  }
  const existing = await readFile(path, "utf8").catch((e) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
  const values = { ...dotenv.parse(existing), ...patch };
  const target = `${path}.${randomUUID()}.tmp`;
  await writeFile(
    target,
    Object.entries(values)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  await rename(target, path);
  // No mutation until the complete file is durable. Test destinations never alter real settings.
  if (path === resolve(".env")) Object.assign(process.env, patch);
  return { saved: true, region: input.region };
}

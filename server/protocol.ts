import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
export type Transcript = {
  id: string;
  speaker: "user" | "character";
  text: string;
  final: boolean;
};
export function parseTranscript(message: any): Transcript | null {
  if (![9, 10].includes(message?.type)) return null;
  const search = (p: any, depth = 0): any => {
    if (!p || typeof p !== "object" || depth > 4) return null;
    if (
      typeof p.text === "string" ||
      typeof p.content === "string" ||
      typeof p.transcript === "string"
    )
      return p;
    for (const v of Object.values(p)) {
      const found = search(v, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const p = search(message.payload);
  if (!p) return null;
  const text = String(p.text ?? p.content ?? p.transcript)
    .trim()
    .slice(0, 2000);
  if (!text) return null;
  const final =
    p.is_final !== false && p.final !== false && p.finished !== false;
  return {
    id: String(
      p.msg_id ?? p.sentence_id ?? p.id ?? message.seq_id ?? randomUUID(),
    ),
    speaker: message.type === 9 ? "user" : "character",
    text,
    final,
  };
}
const presets: Record<string, { file: string; kind: string; prompt: string }> =
  {
    coffee: {
      file: "lin-cafe.png",
      kind: "object",
      prompt:
        "只参考图中的咖啡杯，拿起杯子轻轻喝一口，保留当前人物、衣服和背景。",
    },
    knit: {
      file: "lin-reference.png",
      kind: "garment",
      prompt: "换上参考图中的米白色针织衫，保持当前人物的脸和背景。",
    },
    coat: {
      file: "shen-reference.png",
      kind: "garment",
      prompt: "换上参考图中的浅色风衣和深色高领内搭，保持当前人物的脸和背景。",
    },
    cafe: {
      file: "cafe-empty.png",
      kind: "background",
      prompt: "背景换为雨夜咖啡馆，人物保持不变。",
    },
    cinema: {
      file: "cinema-empty.png",
      kind: "background",
      prompt: "背景换为旧影院放映室，人物保持不变。",
    },
  };
export async function interactionPayload(input: any): Promise<any> {
  if (input?.remove === true)
    return { prompt_operation: { op_type: "remove" } };
  let kind = input?.kind,
    image = input?.image,
    prompt = input?.prompt || "";
  if (input?.preset) {
    const p = presets[input.preset];
    if (!p) throw new Error("未知互动参考图。");
    kind = p.kind;
    prompt = p.prompt;
    image = `data:image/png;base64,${(await readFile(resolve("public/assets", p.file))).toString("base64")}`;
  }
  if (
    !["object", "garment", "background"].includes(kind) ||
    typeof image !== "string" ||
    image.length > 4_200_000 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image)
  )
    throw new Error("请选择 3MB 以内的 PNG、JPEG 或 WebP 图片。");
  if (typeof prompt !== "string" || prompt.length > 500)
    throw new Error("互动描述请控制在 500 字以内。");
  return {
    prompt_operation: {
      op_type: "switch",
      images: [
        { image_uri: image, image_id: randomUUID(), kind, user_text: prompt },
      ],
    },
  };
}

// Vidu echoes text_msg as type9 too; these are not new microphone turns.
export class OutboundEchoes {
  private entries: { id: string; text: string; at: number }[] = [];
  private normalize(text: string) {
    return text.replace(/\s+/g, "").slice(0, 2000);
  }
  add(text: string, id: string) {
    this.entries.push({ id, text: this.normalize(text), at: Date.now() });
    this.entries = this.entries.slice(-100);
  }
  matches(t: Transcript) {
    if (t.speaker !== "user") return false;
    this.entries = this.entries.filter((e) => Date.now() - e.at < 15000);
    const text = this.normalize(t.text);
    const index = this.entries.findIndex(
      (e) =>
        e.id === t.id ||
        e.text === text ||
        (!t.final && e.text.startsWith(text)),
    );
    if (index < 0) return false;
    if (t.final) this.entries.splice(index, 1);
    return true;
  }
}

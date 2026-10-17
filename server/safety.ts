import { characters, story } from "../src/game/story";
export function safeError(message: string): string {
  if (/insufficient credits/i.test(message))
    return "Vidu 账户积分不足，请在对应区域的开放平台充值后重试。";
  if (/^unauthorized$/i.test(message))
    return "Vidu 鉴权失败，请确认密钥及中国站/国际站区域配置一致。";
  return message
    .replace(/(?:Token\s+)?vda_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 400);
}
export function isLocalRequest(
  host: string | undefined,
  origin: string | undefined,
): boolean {
  if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  if (!origin) return true;
  try {
    return (
      new URL(origin).host === host && new URL(origin).protocol === "http:"
    );
  } catch {
    return false;
  }
}
export function avatarPayload(nodeId: string, image: string) {
  const node = story[nodeId];
  if (!node) throw new Error("未知剧情节点");
  const c = characters[node.character];
  return {
    model: "vidu-s2",
    enable_recording: true,
    audio: { enable_transcription: true },
    vad: { type: "server", threshold: 0.5, silence_duration_ms: 700 },
    idle_motion: { enabled: true, source: "default", recommend: "intelligent" },
    action: { enabled: true },
    call_mode: "video",
    character_id: "1",
    avatar: {
      image_uri: image,
      name: c.name,
      persona_enhance: false,
      persona: `你是互动剧《雨停之前》中的${c.name}，${c.age}岁，${c.role}。你面对镜头中的周屿（28岁声音修复师）交流。${c.description}。使用自然普通话，温柔克制的电影表演，不要自我介绍为AI。镜头固定，保留参考图中的衣着和环境。当前场景：${node.title}。当前你知道的内容仅限：${node.narration} ${node.dialogue}。不要编造过去事件、承诺新剧情、换地点或展示另一个人。不知道的事情坦诚说不知道。每次简短回应，动作轻微。收到「表演台词」指令时，只自然说出台词中的内容，不读指令本身。剧情进度由外部游戏决定。`,
    },
  };
}

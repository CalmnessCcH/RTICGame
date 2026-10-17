import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSettings } from "../server/settings";
import {
  parseTranscript,
  interactionPayload,
  OutboundEchoes,
} from "../server/protocol";
describe("live upgrade boundaries", () => {
  it("writes keys only to a private env and returns public status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rain-"));
    const path = join(dir, ".env");
    try {
      const result = await saveSettings(
        { viduKey: "vda_test_long_secret", region: "api.vidu.com" },
        path,
      );
      expect(JSON.stringify(result)).not.toContain("secret");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(await readFile(path, "utf8")).toContain("VIDU_API_KEY");
      await expect(
        saveSettings(
          { viduKey: "bad\nINJECT=yes", region: "api.vidu.com" },
          path,
        ),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("maps official user/character transcripts and ignores interim or unrelated controls", () => {
    expect(
      parseTranscript({
        type: 9,
        payload: {
          audio_transcription: {
            text: "我想看看信",
            is_final: true,
            msg_id: "u1",
          },
        },
      }),
    ).toMatchObject({ speaker: "user", text: "我想看看信", id: "u1" });
    expect(
      parseTranscript({
        type: 10,
        payload: { text: "你来了", is_final: false },
      })?.final,
    ).toBe(false);
    expect(
      parseTranscript({ type: 2, payload: { text: "not dialogue" } }),
    ).toBeNull();
  });
  it("builds current images-array protocol, accepts local image data and rejects arbitrary paths", async () => {
    const data = "data:image/png;base64,aGVsbG8=";
    const payload = await interactionPayload({
      kind: "object",
      image: data,
      prompt: "拿着杯子",
    });
    expect(payload.prompt_operation.images[0]).toMatchObject({
      kind: "object",
      image_uri: data,
      user_text: "拿着杯子",
    });
    await expect(
      interactionPayload({ kind: "object", preset: "../../.env" }),
    ).rejects.toThrow();
    expect(await interactionPayload({ remove: true })).toEqual({
      prompt_operation: { op_type: "remove" },
    });
  });
});

describe("upstream text echoes", () => {
  it("filters text commands echoed as user transcripts without swallowing unrelated speech", () => {
    const echoes = new OutboundEchoes();
    echoes.add("表演台词：你来了。\n保持背景", "command-1");
    expect(
      echoes.matches({
        id: "other",
        speaker: "user",
        text: "我想看信",
        final: true,
      }),
    ).toBe(false);
    expect(
      echoes.matches({
        id: "command-1",
        speaker: "user",
        text: "partial",
        final: false,
      }),
    ).toBe(true);
    expect(
      echoes.matches({
        id: "9:echo",
        speaker: "user",
        text: "表演台词：你来了。 保持背景",
        final: true,
      }),
    ).toBe(true);
    expect(
      echoes.matches({
        id: "new-voice-turn",
        speaker: "user",
        text: "表演台词：你来了。 保持背景",
        final: true,
      }),
    ).toBe(false);
    expect(
      echoes.matches({
        id: "command-1",
        speaker: "character",
        text: "你来了",
        final: true,
      }),
    ).toBe(false);
  });
  it("keeps repeated spoken sentences distinct when upstream provides no ID", () => {
    const message = { type: 9, payload: { text: "我想听听" } };
    expect(parseTranscript(message)?.id).not.toBe(parseTranscript(message)?.id);
  });
});

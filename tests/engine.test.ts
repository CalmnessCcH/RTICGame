import { describe, expect, it } from "vitest";
import {
  createGame,
  availableActions,
  applyAction,
  interpretInput,
  parseSave,
} from "../src/game/engine";
import { story } from "../src/game/story";
import type { GameState } from "../src/game/types";

const follow = (ids: string[]) =>
  ids.reduce((s, id) => applyAction(s, id).state, createGame());
const toFinal = [
  "apologize",
  "open-letter",
  "analyze-audio",
  "promise-listen",
  "go-cinema",
  "greet-shen",
  "read-ledger",
  "compare-clues",
];
describe("story progression", () => {
  it("unlocks the complete recording only after corroborating all three clues", () => {
    const state = follow(toFinal);
    expect(state.nodeId).toBe("finale");
    expect(state.clues).toEqual(["letter", "waveform", "ledger", "splice"]);
    expect(applyAction(state, "choose-truth").state.nodeId).toBe(
      "ending-truth",
    );
  });
  it("does not grant gated evidence or skip to a locked ending", () => {
    const state = { ...createGame(), nodeId: "evidence" };
    expect(availableActions(state).some((a) => a.id === "compare-clues")).toBe(
      false,
    );
    expect(applyAction(state, "compare-clues").state).toEqual(state);
    expect(applyAction(createGame(), "choose-truth").state.nodeId).toBe(
      "arrival",
    );
  });
  it("replaying a consumed action cannot farm relationship or evidence", () => {
    const state = follow(["apologize", "open-letter"]);
    expect(applyAction(state, "open-letter").state).toEqual(state);
    expect(state.clues).toEqual(["letter"]);
  });
  it("allows both relationship endings without forcing full evidence", () => {
    const path = [
      "coffee",
      "leave-letter",
      "ask-feelings",
      "need-proof",
      "go-cinema",
      "ask-original",
      "ask-silence",
      "trust-shen",
    ];
    expect(applyAction(follow(path), "choose-lin").state.nodeId).toBe(
      "ending-lin",
    );
    expect(applyAction(follow(path), "choose-shen").state.nodeId).toBe(
      "ending-shen",
    );
  });
  it("has no dangling destinations and all three endings are reachable", () => {
    for (const node of Object.values(story))
      for (const action of node.actions)
        expect(story[action.next]).toBeDefined();
    const reached = new Set<string>();
    const queue: GameState[] = [createGame()];
    while (queue.length) {
      const s = queue.shift()!;
      const k = s.nodeId + ":" + s.clues.join();
      if (reached.has(k)) continue;
      reached.add(k);
      for (const a of availableActions(s))
        queue.push(applyAction(s, a.id).state);
    }
    for (const end of ["ending-lin", "ending-shen", "ending-truth"])
      expect([...reached].some((k) => k.startsWith(end + ":"))).toBe(true);
  });
});
describe("input interpretation", () => {
  it("recognizes a relevant paraphrase without matching unrelated chat", () => {
    expect(interpretInput(createGame(), "真的抱歉，让你久等了")).toBe(
      "apologize",
    );
    expect(interpretInput(createGame(), "明天股票会涨吗")).toBeNull();
  });
  it("does not turn a negative instruction into its affirmative opposite", () => {
    const s = { ...createGame(), nodeId: "envelope" };
    expect(interpretInput(s, "不要打开信封")).not.toBe("open-letter");
    expect(interpretInput(s, "先不拆，你亲口告诉我吧")).toBe("leave-letter");
    expect(
      interpretInput({ ...s, nodeId: "departure" }, "我不想去影院"),
    ).toBeNull();
  });
  it("keeps competing intentions in the same scene for clarification", () => {
    expect(interpretInput(createGame(), "抱歉。你找我有什么事？")).toBeNull();
  });
});
describe("save integrity", () => {
  it("round trips a real save and rejects corruption, invalid nodes and out-of-bounds trust", () => {
    const saved = follow(toFinal);
    expect(parseSave(JSON.stringify(saved))).toEqual(saved);
    expect(parseSave("{")).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...saved, nodeId: "missing" })),
    ).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...saved, trust: { lin: 999, shen: 20 } })),
    ).toBeNull();
    expect(
      parseSave(JSON.stringify({ ...saved, clues: ["hacked"] })),
    ).toBeNull();
    expect(parseSave(JSON.stringify({ ...saved, version: 2 }))).toBeNull();
  });
});

import { z } from "zod";
import type { Action, GameState, TurnResult } from "./types";
import { characters, story } from "./story";
export function createGame(): GameState {
  return {
    version: 1,
    nodeId: "arrival",
    trust: { lin: 38, shen: 20 },
    clues: [],
    visited: ["arrival"],
    history: [],
    turns: 0,
    updatedAt: Date.now(),
  };
}
export function availableActions(state: GameState): Action[] {
  return (story[state.nodeId]?.actions ?? []).filter((action) =>
    (action.requires ?? []).every((clue) => state.clues.includes(clue)),
  );
}
export function applyAction(
  state: GameState,
  id: string,
  input?: string,
): TurnResult {
  const action = availableActions(state).find((a) => a.id === id);
  if (!action) return { state, reply: "", advanced: false, actionId: null };
  const node = story[state.nodeId];
  const next = story[action.next];
  const turn = state.turns + 1;
  const trust = { ...state.trust };
  for (const key of ["lin", "shen"] as const)
    trust[key] = Math.max(
      0,
      Math.min(100, trust[key] + (action.trust?.[key] ?? 0)),
    );
  const nextState: GameState = {
    ...state,
    nodeId: action.next,
    trust,
    clues: action.grants
      ? [...new Set([...state.clues, action.grants])]
      : [...state.clues],
    visited: [...new Set([...state.visited, action.next])],
    turns: turn,
    updatedAt: Date.now(),
    history: [
      ...state.history,
      {
        id: `${turn}-player`,
        speaker: "你",
        text: input || action.label,
        nodeId: node.id,
      },
      {
        id: `${turn}-reply`,
        speaker: characters[node.character].name,
        text: action.reply,
        nodeId: node.id,
      },
      {
        id: `${turn}-next`,
        speaker: characters[next.character].name,
        text: next.dialogue,
        nodeId: next.id,
      },
    ].slice(-160),
  };
  return {
    state: nextState,
    reply: action.reply,
    advanced: true,
    actionId: action.id,
  };
}
const normalize = (text: string) =>
  text.replace(/[\s，。！？、,.!?…]/g, "").toLowerCase();
export function interpretInput(state: GameState, input: string): string | null {
  const text = normalize(input);
  if (!text || text.length > 1000) return null;
  const actions = availableActions(state);
  const exact = actions.find((a) => normalize(a.label) === text);
  if (exact) return exact.id;
  const matches = actions.filter((a) =>
    a.intent.some((keyword) => {
      const at = text.indexOf(normalize(keyword));
      if (at < 0) return false;
      // Preserve explicit negative intents, but never turn negated affirmative terms into actions.
      if (/^(不|先不|别|没有|不会)/.test(keyword)) return true;
      return !/(不|别|没|不要|不想|不能|不愿|不打算|不准备|不可以|别再).{0,2}$/.test(
        text.slice(Math.max(0, at - 6), at),
      );
    }),
  );
  return matches.length === 1 ? matches[0].id : null;
}
export function respondLocally(state: GameState, input: string): TurnResult {
  const action = interpretInput(state, input);
  if (action) return applyAction(state, action, input);
  const node = story[state.nodeId];
  const character = characters[node.character];
  const text = input.trim().slice(0, 1000);
  if (!text) return { state, reply: "", advanced: false, actionId: null };
  let reply =
    node.character === "lin"
      ? "我在听。只是今晚，有些话我真的不想再错过。你愿意先回应眼前这件事吗？"
      : "这个问题我记下了。不过我们先把眼前的事说清楚。你准备怎么做？";
  if (/你是谁|你的名字|叫什么/.test(text))
    reply = `我是${character.name}。${character.quote}`;
  else if (/跳过|忽略.*规则|直接.*结局|所有.*线索/.test(text))
    reply = "有些答案，只能一步一步找。我们先从眼前这件事开始。";
  const turn = state.turns + 1;
  return {
    state: {
      ...state,
      turns: turn,
      updatedAt: Date.now(),
      history: [
        ...state.history,
        { id: `${turn}-player`, speaker: "你", text, nodeId: node.id },
        {
          id: `${turn}-reply`,
          speaker: character.name,
          text: reply,
          nodeId: node.id,
        },
      ].slice(-160),
    },
    reply,
    advanced: false,
    actionId: null,
  };
}
const nodeId = z.string().refine((value) => Object.hasOwn(story, value));
const saveSchema = z
  .object({
    version: z.literal(1),
    nodeId,
    trust: z.object({
      lin: z.number().int().min(0).max(100),
      shen: z.number().int().min(0).max(100),
    }),
    clues: z
      .array(z.enum(["letter", "waveform", "ledger", "splice"]))
      .max(4)
      .refine((c) => new Set(c).size === c.length),
    visited: z.array(nodeId).min(1).max(12),
    turns: z.number().int().min(0).max(100000),
    updatedAt: z.number().finite().min(0),
    history: z
      .array(
        z.object({
          id: z.string().max(80),
          speaker: z.string().max(30),
          text: z.string().max(2000),
          nodeId,
        }),
      )
      .max(160),
  })
  .refine(
    (s) =>
      !s.clues.includes("splice") ||
      ["letter", "waveform", "ledger"].every((c) =>
        s.clues.includes(c as (typeof s.clues)[number]),
      ),
  )
  .refine((s) => s.nodeId !== "ending-truth" || s.clues.includes("splice"));
export function parseSave(raw: string): GameState | null {
  if (raw.length > 500000) return null;
  try {
    const parsed = saveSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

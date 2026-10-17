export type CharacterId = "lin" | "shen";
export type SceneId = "cafe" | "cinema";
export type ClueId = "letter" | "waveform" | "ledger" | "splice";
export interface Character {
  id: CharacterId;
  name: string;
  age: number;
  role: string;
  quote: string;
  description: string;
  image: string;
  portrait: string;
  color: string;
}
export interface Action {
  id: string;
  label: string;
  hint: string;
  intent: string[];
  next: string;
  reply: string;
  requires?: ClueId[];
  grants?: ClueId;
  trust?: Partial<Record<CharacterId, number>>;
}
export interface StoryNode {
  id: string;
  title: string;
  scene: SceneId;
  character: CharacterId;
  time: string;
  beat: number;
  narration: string;
  dialogue: string;
  objective: string;
  actions: Action[];
  ending?: { tag: string; title: string; text: string };
}
export interface LogEntry {
  id: string;
  speaker: string;
  text: string;
  nodeId: string;
}
export interface GameState {
  version: 1;
  nodeId: string;
  trust: Record<CharacterId, number>;
  clues: ClueId[];
  visited: string[];
  history: LogEntry[];
  turns: number;
  unmatchedTurns: number;
  updatedAt: number;
}
export interface TurnResult {
  state: GameState;
  reply: string;
  advanced: boolean;
  actionId: string | null;
  fallbackApplied?: boolean;
}

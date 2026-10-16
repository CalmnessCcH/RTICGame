import { createGame, parseSave } from "../game/engine";
import type { GameState } from "../game/types";
const KEY = "rain.chapter1.v1";
export function readGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSave(raw) : null;
  } catch {
    return null;
  }
}
export function saveGame(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function loadGame() {
  return readGame() ?? createGame();
}

import { describe, it, expect } from "vitest";
import { safeError, isLocalRequest, avatarPayload } from "../server/safety";
describe("local service boundaries", () => {
  it("never reflects API tokens into error text", () => {
    expect(safeError("failed Token vda_123_secret_Value")).toBe(
      "failed [redacted]",
    );
  });
  it("rejects cross-origin requests and host rebinding", () => {
    expect(isLocalRequest("127.0.0.1:8787", "http://127.0.0.1:8787")).toBe(
      true,
    );
    expect(isLocalRequest("localhost:8787", "https://other.example")).toBe(
      false,
    );
    expect(isLocalRequest("attacker.example:8787", undefined)).toBe(false);
    expect(isLocalRequest("127.0.0.1:8787", undefined)).toBe(true);
  });
  it("builds only the active adult character and does not leak the ending", () => {
    const p = avatarPayload("arrival", "data:image/png;base64,test");
    expect(p.avatar.name).toBe("林知夏");
    expect(p.avatar.persona).toContain("27岁");
    expect(p.avatar.persona).not.toContain("正门积水了");
    expect(p.avatar.persona).not.toContain("vda_");
    expect(() => avatarPayload("missing", "x")).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { onWhite, readableAccent } from "./accent";

describe("readable accents", () => {
  it("gives templates' old accents their new ones", () => {
    expect(readableAccent("#E07400")).toBe("#b85600");
    expect(readableAccent("#2f9e44")).toBe("#28803a");
    expect(readableAccent("#e5484d")).toBe("#cf3439");
  });
  it("darkens other light accents just enough, and leaves readable ones", () => {
    const next = readableAccent("#ff8800")!;
    expect(onWhite("#ff8800")).toBeLessThan(4.5);
    expect(onWhite(next)).toBeGreaterThanOrEqual(4.5);
    expect(onWhite(next)).toBeLessThan(5.5);
    for (const ok of ["#294b3b", "#b85600", "#3f5491", "not a colour"])
      expect(readableAccent(ok)).toBeNull();
  });
});

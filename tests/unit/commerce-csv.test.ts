import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../../src/commerce/csv";
describe("catalog CSV", () => {
  it("round-trips commas, quotes, line breaks and unicode", () => {
    const rows = [
      ["name", "description"],
      ['A "nice", vase', "Two\nlines — café"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("blocks malformed imports instead of shifting inventory columns", () => {
    expect(() => parseCsv('title,stock\n"Vase,1')).toThrow();
    expect(() => parseCsv('title,stock\n"Vase"oops,1')).toThrow();
    expect(() => parseCsv("title,stock\nVase")).toThrow();
  });
  it("prevents spreadsheet formula injection on export", () => {
    expect(parseCsv(toCsv([["=CMD()", "+SUM(1)", "@evil"]]))).toEqual([
      ["'=CMD()", "'+SUM(1)", "'@evil"],
    ]);
  });
});

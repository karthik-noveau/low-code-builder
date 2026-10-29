import { describe, expect, it } from "vitest";
import { createNode } from "./registry";
import { color, declarations, treeCss } from "./style";
import type { Node, Style } from "./model";

const node = (
  type: Node["type"],
  style?: Style,
  extra: Partial<Node> = {},
): Node => ({
  ...createNode(type),
  id: `${type}-1`,
  style,
  ...extra,
});

describe("style tokens", () => {
  it("maps colour tokens to theme variables and keeps safe values", () => {
    expect(color("accent")).toBe("var(--site-accent)");
    expect(color("text")).toBe("var(--site-color)");
    expect(color("#12ab34")).toBe("#12ab34");
    expect(color("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("drops unsafe colours", () => {
    for (const bad of [
      "red;background:url(x)",
      "expression(alert(1))",
      "var(--x)",
      "#zzz",
      "url(a)",
    ])
      expect(color(bad)).toBe("");
    expect(declarations({ color: "red}body{display:none" })).toEqual([]);
  });

  it("uses the lifted accent for accent text", () => {
    expect(declarations({ color: "accent" })).toContain(
      "color:var(--blk-ink, var(--site-accent))",
    );
    expect(declarations({ background: "accent" })).toContain(
      "background:var(--site-accent)",
    );
  });

  it("turns font-size tokens and px into sizes", () => {
    expect(declarations({ fontSize: "sm" })).toContain("font-size:14px");
    expect(declarations({ fontSize: "3xl" }).join()).toContain(
      "var(--site-scale, 1)",
    );
    expect(declarations({ fontSize: "40" })).toContain("font-size:40px");
    expect(declarations({ fontSize: "40px;x" })).toEqual([]);
  });

  it("radius, shadow and spacing", () => {
    expect(declarations({ radius: "theme" })).toContain(
      "border-radius:var(--site-radius)",
    );
    expect(declarations({ radius: "full" })).toContain("border-radius:999px");
    expect(declarations({ padding: [1, 2, 3, 4] })).toContain(
      "padding:1px 2px 3px 4px",
    );
    // Section padding scales vertically with the theme's spacing.
    expect(declarations({ padding: [10, 2, 10, 2] }, "section")[0]).toContain(
      "calc(10px * var(--site-space, 1))",
    );
  });

  it("a set width holds without overflowing", () => {
    const d = declarations({ width: 44 });
    expect(d).toEqual(
      expect.arrayContaining(["width:44px", "max-width:100%", "flex:0 0 auto"]),
    );
    expect(declarations({ width: 300, maxWidth: 200 })).not.toContain(
      "max-width:100%",
    );
  });
});

describe("background images", () => {
  it("adds an overlay and accepts site images", () => {
    const d = declarations({
      backgroundImage: "/images/dish.jpg",
      overlay: 40,
    }).join(";");
    expect(d).toContain("rgb(0 0 0 / 0.4)");
    expect(d).toContain('url("/images/dish.jpg")');
  });

  it("rejects unsafe image addresses", () => {
    for (const bad of [
      "javascript:alert(1)",
      'x") ; color:red',
      "data:text/html,hi",
    ]) {
      const d = declarations({ backgroundImage: bad }).join(";");
      expect(d).not.toContain("javascript");
      expect(d).not.toContain("text/html");
      expect(d).not.toMatch(/url\("[^"]*"[^ ]*;/);
    }
  });
});

describe("grids", () => {
  it("writes column counts as variables per device", () => {
    expect(declarations({ columns: 4 }, "grid")).toContain("--cols:4");
    expect(declarations({ columns: 2 }, "grid", "tablet")).toContain(
      "--cols-t:2",
    );
    expect(declarations({ columns: 1 }, "columns", "mobile")).toContain(
      "--cols-m:1",
    );
    expect(declarations({ columns: 9 }, "grid")).toContain("--cols:6");
    // Not a grid: no column variable, flex settings instead.
    expect(declarations({ columns: 3, direction: "row" }, "box")).toEqual([
      "flex-direction:row",
    ]);
  });
});

describe("treeCss", () => {
  it("scopes rules to the node and puts tablet/phone overrides in container queries", () => {
    const css = treeCss([
      node("box", { gap: 10 }, { tablet: { gap: 6 }, mobile: { gap: 4 } }),
    ]);
    expect(css).toContain(".website .n-box-1.blk{gap:10px}");
    expect(css).toMatch(
      /@container \(max-width:768px\)\{\.website \.n-box-1\.blk\{gap:6px\}\}/,
    );
    expect(css).toMatch(
      /@container \(max-width:480px\)\{\.website \.n-box-1\.blk\{gap:4px\}\}/,
    );
  });

  it("puts a section's layout and content width on its inner column", () => {
    const css = treeCss([
      node(
        "section",
        { gap: 30, padding: [8, 8, 8, 8], contentWidth: "narrow" },
        { children: [] },
      ),
    ]);
    expect(css).toContain(".website .n-section-1.blk>.blk-inner{gap:30px}");
    expect(css).toContain(
      ".website .n-section-1.blk>.blk-inner{max-width:680px}",
    );
    expect(css).toMatch(/\.n-section-1\.blk\{padding:/);
  });

  it("skips nodes whose ids could escape the selector", () => {
    expect(treeCss([node("box", { gap: 1 }, { id: "x}body{" })])).toBe("");
  });
});

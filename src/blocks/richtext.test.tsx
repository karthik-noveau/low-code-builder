import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  explode,
  implode,
  inlineLinks,
  mapInlineLinks,
  MAX_INLINE_LINKS,
  normalizeRuns,
  parseInline,
  plainText,
  richText,
  sameMeaning,
  serializeInline,
  type Run,
} from "./richtext";

const html = (s: string, accent = false) =>
  renderToStaticMarkup(<>{richText(s, { accent })}</>);
const H = { accent: true };

describe("inline markup: reading", () => {
  it("reads bold, italic, links and nesting", () => {
    expect(html("Fresh **bread** daily")).toBe(
      "Fresh <strong>bread</strong> daily",
    );
    expect(html("Fresh __bread__ daily")).toBe(
      'Fresh <em class="blk-i">bread</em> daily',
    );
    expect(html("**bold __and italic__**")).toBe(
      '<strong>bold <em class="blk-i">and italic</em></strong>',
    );
    expect(html("See [our menu](/menu).")).toBe(
      'See <a href="/menu">our menu</a>.',
    );
    expect(html("[**Order** now](https://x.in/o)")).toBe(
      '<a href="https://x.in/o" rel="noopener noreferrer"><strong>Order</strong> now</a>',
    );
    expect(html('[Map](https://maps.app/x "new tab")')).toBe(
      '<a href="https://maps.app/x" target="_blank" rel="noopener noreferrer">Map</a>',
    );
    // Drawn in one order (link, accent, bold, italic) however it was typed.
    expect(html("**[a](#offers)**")).toBe(
      '<a href="#offers"><strong>a</strong></a>',
    );
    expect(html("[Call](tel:+919876543210) or [mail](mailto:a@b.in)")).toBe(
      '<a href="tel:+919876543210">Call</a> or <a href="mailto:a@b.in">mail</a>',
    );
  });

  it("keeps the heading accent exactly as before", () => {
    expect(html("Buy from us. *Earn rewards.*", true)).toBe(
      "Buy from us. <em>Earn rewards.</em>",
    );
    // The old rule had no spacing rules: any *words* on one line.
    expect(html("2*3*4", true)).toBe("2<em>3</em>4");
    expect(html("a * b * c", true)).toBe("a <em> b </em> c");
    expect(html("*a*\n*b*", true)).toBe("<em>a</em>\n<em>b</em>");
    expect(html("**Bold** and *accent*", true)).toBe(
      "<strong>Bold</strong> and <em>accent</em>",
    );
    expect(html("***Both***", true)).toBe("<em><strong>Both</strong></em>");
    // Text blocks have no accent: single stars are just stars.
    expect(html("Mon*Fri *only*")).toBe("Mon*Fri *only*");
  });

  it("leaves unclosed and misplaced markers as typed", () => {
    for (const s of [
      "5 ** 3",
      "2**3 and 4**5",
      "** not bold**",
      "**not bold **",
      "Save **20%",
      "snake_case and __init and a__b__c",
      "first_last@shop.in, @__handle",
      "[optional] and [x] (y)",
      "[notes](see below)",
      "Bring a **pen\nand** paper",
      "____",
      "Price: ₹1,499*",
      "end]",
    ])
      expect([s, html(s)]).toEqual([s, s.replaceAll("&", "&amp;")]);
  });

  it("never makes unsafe links", () => {
    expect(html("[click](javascript:alert)")).toBe("click");
    expect(html("[x](data:text/html,hi)")).toBe("x");
    expect(html("[x](//evil.example)")).toBe("x");
    expect(html("[x](vbscript:run)")).toBe("x");
    expect(html("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
    expect(html(`[x](https://a.in/${"p".repeat(1200)})`)).toBe("x");
    // Links can't hold links.
    expect(html("[a [b](/b) c](/c)")).toBe('[a <a href="/b">b</a> c](/c)');
    // Past the cap, links show their words.
    const many = Array.from({ length: 25 }, (_, n) => `[l${n}](/p${n})`).join(
      " ",
    );
    expect(inlineLinks(many)).toHaveLength(25);
    expect(parseInline(many).filter((r) => r.link)).toHaveLength(
      MAX_INLINE_LINKS,
    );
    expect(html(many)).toContain(" l24");
  });

  it("reads escapes", () => {
    expect(html("\\*\\*not bold\\*\\*")).toBe("**not bold**");
    expect(html("a \\[b](/c)")).toBe("a [b](/c)");
    expect(html("back\\\\slash")).toBe("back\\slash");
    expect(html("C:\\Users")).toBe("C:\\Users");
  });

  it("is quick on long, hostile text", () => {
    for (const s of [
      "**[__".repeat(1000),
      "[".repeat(5000),
      "*a ".repeat(1600),
    ]) {
      const t = performance.now();
      parseInline(s, H);
      serializeInline(parseInline(s, H), H);
      expect(performance.now() - t).toBeLessThan(400);
    }
  });
});

describe("inline markup: writing", () => {
  const runs = (...r: Run[]) => r;
  it("writes runs and reads them back", () => {
    const cases: [Run[], string][] = [
      [runs({ text: "Fresh " }, { text: "bread", b: true }), "Fresh **bread**"],
      [
        runs({ text: "a", i: true }, { text: " b", i: true, b: true }),
        "__a__ **__b__**",
      ],
      [
        runs(
          { text: "Go ", link: { href: "/menu" } },
          { text: "now", b: true, link: { href: "/menu" } },
        ),
        "[Go **now**](/menu)",
      ],
      [
        runs({ text: "Map", link: { href: "https://m.in", newTab: true } }),
        '[Map](https://m.in "new tab")',
      ],
    ];
    for (const [r, s] of cases) {
      expect(serializeInline(r)).toBe(s);
      expect(sameMeaning(parseInline(s), normalizeRuns(r))).toBe(true);
    }
  });

  it("stores plain text exactly as typed", () => {
    for (const s of ["a_b@x.in", "2*3", "[draft]", "Mon–Sat, 9–6", ""])
      expect(serializeInline([{ text: s }])).toBe(s);
  });

  it("escapes markers typed as text, only when needed", () => {
    for (const s of ["**not bold**", "__x__", "[a](/b)", "\\*", "a*b*c"]) {
      const out = serializeInline([{ text: s }], H);
      expect(plainText(parseInline(out, H))).toBe(s);
      expect(parseInline(out, H)).toHaveLength(1);
    }
    expect(serializeInline([{ text: "**x**" }])).toBe("\\*\\*x\\*\\*");
  });

  it("keeps formatting on whole words, off spaces and line breaks", () => {
    // "foo" bold inside "foobar": the word follows its first letter.
    expect(
      serializeInline([{ text: "foo", b: true }, { text: "bar baz" }]),
    ).toBe("**foobar** baz");
    expect(serializeInline([{ text: " hi ", b: true }, { text: "x" }])).toBe(
      " **hi** x",
    );
    expect(serializeInline([{ text: "a\nb", i: true }])).toBe("__a__\n__b__");
    // Accent only in headings; unsafe links dropped.
    expect(serializeInline([{ text: "x", accent: true }])).toBe("x");
    expect(serializeInline([{ text: "x", accent: true }], H)).toBe("*x*");
    expect(
      serializeInline([{ text: "x", link: { href: "javascript:alert(1)" } }]),
    ).toBe("x");
  });

  it("round-trips random formatting", () => {
    const words = [
      "a",
      "b",
      "c1",
      " ",
      " ",
      ",",
      ".",
      "*",
      "_",
      "[",
      "]",
      "(",
      ")",
      "\\",
      "\n",
      "x y",
      "é",
    ];
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let t = 0; t < 600; t++) {
      const list: Run[] = [];
      for (let k = 0; k < 1 + rnd(8); k++)
        list.push({
          text: words[rnd(words.length)],
          ...(rnd(3) === 0 ? { b: true } : {}),
          ...(rnd(3) === 0 ? { i: true } : {}),
          ...(rnd(4) === 0 ? { accent: true } : {}),
          ...(rnd(4) === 0 ? { link: { href: rnd(2) ? "/p" : "#q" } } : {}),
        });
      for (const o of [{}, H]) {
        const s = serializeInline(list, o);
        const back = parseInline(s, o);
        expect([s, sameMeaning(back, normalizeRuns(list, o))]).toEqual([
          s,
          true,
        ]);
        expect(serializeInline(back, o)).toBe(s);
      }
    }
  });

  it("explodes and implodes", () => {
    const r: Run[] = [{ text: "ab", b: true }, { text: "c" }];
    const { text, marks } = explode(r);
    expect(text).toBe("abc");
    expect(implode(text, marks)).toEqual(r);
  });

  it("rewrites link addresses and nothing else", () => {
    const s = "Visit [our menu](/menu) **today**, * literal";
    expect(mapInlineLinks(s, {}, (u) => (u === "/menu" ? "/food" : u))).toBe(
      "Visit [our menu](/food) **today**, * literal",
    );
    expect(mapInlineLinks(s, {}, (u) => u)).toBe(s);
  });
});

/**
 * Every keyboard shortcut in the editor, grouped, with the keys for this
 * computer (⌘ on a Mac, Ctrl elsewhere). Opened with "?".
 */
const mac =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl";
const ALT = mac ? "⌥" : "Alt";

const GROUPS: { title: string; keys: [string, string[][]][] }[] = [
  {
    title: "Everywhere",
    keys: [
      ["Find anything, do anything", [[MOD, "K"]]],
      ["Undo", [[MOD, "Z"]]],
      ["Redo", [[MOD, "⇧", "Z"]]],
      ["Add a block or section", [["A"]]],
      ["Show these shortcuts", [["?"]]],
    ],
  },
  {
    title: "Selected block",
    keys: [
      ["Next / previous block", [["Tab"], ["⇧", "Tab"]]],
      ["Edit its text, or go inside", [["Enter"]]],
      ["Select the block it sits in", [["Esc"]]],
      [
        "Move up / down",
        [
          [ALT, "↑"],
          [ALT, "↓"],
        ],
      ],
      ["Duplicate", [[MOD, "D"]]],
      [
        "Copy / paste after",
        [
          [MOD, "C"],
          [MOD, "V"],
        ],
      ],
      ["Delete", [["Del"]]],
      ["More actions", [["Right-click"]]],
    ],
  },
  {
    title: "Typing on the page",
    keys: [
      ["Save the text", [[MOD, "Enter"]]],
      ["Cancel", [["Esc"]]],
      ["Accent colour for words (headings)", [["*", "word", "*"]]],
    ],
  },
  {
    title: "Style tab",
    keys: [
      ["Nudge a number", [["↑"], ["↓"]]],
      [
        "Nudge by ten",
        [
          ["⇧", "↑"],
          ["⇧", "↓"],
        ],
      ],
      ["Scrub a number", [["Drag its unit"]]],
    ],
  },
];

export function ShortcutSheet() {
  return (
    <div className="shortcut-sheet">
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <dl>
            {g.keys.map(([label, combos]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {combos.map((combo, i) => (
                    <span key={i}>
                      {i > 0 && <em>or</em>}
                      {combo.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

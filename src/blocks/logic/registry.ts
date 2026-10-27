/**
 * The dialog block's registry entry (spread into BLOCKS in ../registry.ts).
 * A dialog isn't part of the page's flow: it opens when a click says so
 * ("When clicked: Open a dialog", the Inspector's Actions tab) and closes
 * with its close button, Esc or a click outside.
 */
import { nodeId, type Node } from "../model";
import type { BlockDef } from "../registry";

const choice = (...pairs: [string, string][]) =>
  pairs.map(([value, label]) => ({ value, label }));

export const LOGIC_BLOCKS: Record<"dialog", BlockDef> = {
  dialog: {
    label: "Dialog",
    icon: "window",
    category: "logic",
    description:
      "A pop-up or side panel that opens when a button or image is clicked",
    container: true,
    fields: [
      { key: "title", label: "Title", kind: "text" },
      {
        key: "kind",
        label: "Opens as",
        kind: "select",
        options: choice(
          ["modal", "A pop-up in the middle"],
          ["drawer", "A panel from the side"],
        ),
      },
      {
        key: "size",
        label: "Width",
        kind: "select",
        options: choice(["sm", "Narrow"], ["md", "Medium"], ["lg", "Wide"]),
      },
    ],
    props: () => ({ title: "A short title", kind: "modal", size: "md" }),
    style: () => ({ gap: 16 }),
    children: (): Node[] => [
      {
        id: nodeId(),
        type: "text",
        props: {
          text: "Put anything here: text, images, buttons or a form.",
          variant: "body",
        },
      },
    ],
  },
};

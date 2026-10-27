/**
 * A list block's points typed on the canvas, each like a heading's text
 * (RichInlineText: bold, italic and links, the text tools, plain paste).
 * Double-click a point to type into it. Enter starts a new point after it
 * (splitting it at the caret), Backspace at the start of a point joins it to
 * the one before (an empty one goes), ↑/↓ move between points. The whole
 * typing session is saved as one change (one undo step); Escape cancels it.
 */
import { useState, type ReactNode } from "react";
import type { Node, PropValue } from "../model";
import { RichInlineText } from "./RichInlineText";
import {
  finishItems,
  itemsValue,
  joinPrevious,
  moveToItem,
  splitItem,
  type ListEdit,
} from "./listItems";

export interface ListTyping {
  typing: string | null;
  onStartTyping: (id: string) => void;
  onFinishTyping: () => void;
  onCommit: (id: string, key: string, value: PropValue) => void;
  onDraft?: (text: string) => void;
  onSelect: (id: string) => void;
}

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export function TypedList({
  node,
  items,
  edit,
  marker,
  render,
}: {
  node: Node;
  /** The points as drawn (one per line, empty ones left out). */
  items: string[];
  edit: ListTyping;
  /** Drawn before each point (the tick). */
  marker: ReactNode;
  render: (value: string) => ReactNode;
}) {
  const typing = edit.typing === node.id;
  /** The point typing starts in (the one double-clicked). */
  const [startAt, setStartAt] = useState(0);
  /** While typing: the points as typed so far, and which one has the caret. */
  const [list, setList] = useState<(ListEdit & { turn: number }) | null>(null);
  const [wasTyping, setWasTyping] = useState(typing);
  if (typing !== wasTyping) {
    setWasTyping(typing);
    setList(
      typing
        ? {
            items: items.length ? items : [""],
            index: Math.min(startAt, Math.max(0, items.length - 1)),
            turn: 0,
          }
        : null,
    );
    setStartAt(0);
  }
  const shown = (typing && list?.items) || items;
  const draft = (next: string[]) => edit.onDraft?.(next.join("\n"));

  return shown.map((item, i) => {
    const active = typing && list?.index === i;
    const replace = (text: string) =>
      (list?.items ?? items).map((v, j) => (j === i ? text : v));
    return (
      <li key={active && list.turn ? `${i}:${list.turn}` : i}>
        {marker}
        <RichInlineText
          as="span"
          value={item}
          editing={active}
          caret={active ? list.caret : undefined}
          label={`Edit point ${i + 1} of the list`}
          options={{}}
          render={render}
          onCommit={() => {}}
          onActivate={() => edit.onSelect(node.id)}
          onStartEdit={() => {
            if (typing) return;
            setStartAt(i);
            edit.onStartTyping(node.id);
          }}
          onDraft={(text) => draft(replace(text))}
          onFinishEdit={({ cancelled, text }) => {
            if (!cancelled) {
              const next = finishItems(replace(text));
              if (!same(next, items))
                edit.onCommit(
                  node.id,
                  "items",
                  itemsValue(next, node.props.items),
                );
            }
            edit.onFinishTyping();
          }}
          lineKeys={(key, at) => {
            const current = list?.items ?? items;
            const next =
              key === "enter"
                ? splitItem(current, i, at.runs, ...at.selection)
                : key === "backspace"
                  ? joinPrevious(current, i, at.runs)
                  : moveToItem(
                      current,
                      i,
                      at.runs,
                      key === "up" ? -1 : 1,
                      at.selection[0],
                    );
            if (!next) return false;
            setList({ ...next, turn: (list?.turn ?? 0) + 1 });
            draft(next.items);
            return true;
          }}
        />
      </li>
    );
  });
}

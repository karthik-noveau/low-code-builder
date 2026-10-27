/**
 * Locked blocks (`node.locked`) keep their place: they can't be moved,
 * dragged or deleted, and nothing is added to or taken out of them. Their
 * text and settings stay editable. A locked section's root locks the section
 * (it can't be moved or deleted either). The store refuses these changes;
 * the editor checks first so it can say why.
 */
import { findNode, locate, type Node, type NodeType } from "./model";
import { canHold, nodeLabel } from "./registry";

/** Whether `parent` takes a `type` block: it can hold one and isn't locked. */
export const accepts = (parent: Node, type: NodeType) =>
  !parent.locked && canHold(parent.type, type);

/**
 * What keeps `id` (in the section `root`) where it is: the block itself, or
 * the locked block it sits in. Undefined when it can move.
 */
export function pinnedBy(root: Node, id: string): Node | undefined {
  const node = findNode([root], id);
  if (!node) return;
  if (node.locked) return node;
  const parent = locate([root], id)?.parent;
  return parent?.locked ? parent : undefined;
}

/**
 * Why `id` can't be moved, deleted or duplicated, in the owner's words, or
 * null when it can. A locked block can be duplicated (the copy goes beside
 * it), unless what it sits in is locked too. `section` names the section
 * (its root has no label of its own).
 */
/** Every refusal says this, so notifications can show a lock for them. */
export const LOCK_HINT = "Unlock it in Layers";

export function lockNotice(
  root: Node,
  id: string,
  doing: "move" | "delete" | "duplicate",
  section = "This section",
): string | null {
  const node = findNode([root], id);
  const parent = locate([root], id)?.parent;
  const by =
    doing === "duplicate"
      ? node !== root && parent?.locked
        ? parent
        : undefined
      : pinnedBy(root, id);
  if (!by) return null;
  if (by.id === id) return `Locked. Unlock it in Layers to ${doing} it.`;
  const name = by === root ? section : nodeLabel(by);
  return doing === "duplicate"
    ? `${name} is locked. Unlock it in Layers to add blocks to it.`
    : `${name} is locked. Unlock it in Layers to ${doing} what’s inside.`;
}

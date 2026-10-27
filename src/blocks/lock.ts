/**
 * Locked blocks (`node.locked`) keep their place: they can't be moved,
 * dragged or deleted, and nothing is added to or taken out of them. Their
 * text and settings stay editable. A locked section's root locks the section
 * (it can't be moved or deleted either). The store refuses these changes;
 * the editor checks first so it can say why.
 */
import { findNode, locate, walk, type Node, type NodeType } from "./model";
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

/**
 * Why the blocks inside `id` can't be added to or taken out of from its
 * settings (a columns block's column count), or null when they can: the
 * block is locked, or a block that would go (`removing`) is.
 */
export function childrenLock(
  root: Node,
  id: string,
  removing: Node[] = [],
  section = "This section",
): string | null {
  const node = findNode([root], id);
  if (!node) return null;
  if (node.locked)
    return `${node === root ? `${section} is locked.` : "Locked."} Unlock it in Layers to add or remove what’s inside.`;
  const locked = removing.find((c) => c.locked);
  return locked
    ? `${nodeLabel(locked)} is locked. Unlock it in Layers to remove it.`
    : null;
}

/**
 * Whether a change from `before` to `after` (one section's tree) keeps every
 * lock: locked blocks are still there, in the same block, holding the same
 * blocks in the same order. The store refuses changes that don't.
 */
export function keepsLocks(before: Node, after: Node): boolean {
  const parents = new Map<string, string | null>();
  const kids = new Map<string, string[]>();
  const index = (n: Node, parent: string | null) => {
    parents.set(n.id, parent);
    kids.set(
      n.id,
      (n.children ?? []).map((c) => c.id),
    );
    n.children?.forEach((c) => index(c, n.id));
  };
  index(after, null);
  const same = (a: string[], b: string[] | undefined) =>
    !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  for (const n of walk([before])) {
    if (!n.locked) continue;
    if (!parents.has(n.id)) return false;
    if (
      n !== before &&
      parents.get(n.id) !== locate([before], n.id)?.parent?.id
    )
      return false;
    if (
      !same(
        (n.children ?? []).map((c) => c.id),
        kids.get(n.id),
      )
    )
      return false;
  }
  return true;
}

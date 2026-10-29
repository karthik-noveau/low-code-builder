/**
 * The Inspector for a block in a "blocks" section. Every block gets a
 * purposeful first tab: content blocks open on Content (their registry
 * fields), layout blocks on Layout (their settings, how they arrange what's
 * inside, and a list of what's inside). Style is per screen size
 * (StylePanel). Data blocks also get Data (DataPanel); every block gets
 * Actions (ActionsPanel: when clicked, show only when, page values). The section block
 * itself stands for its section: its name and visibility are the section's.
 */
import { useState } from "react";
import { Icon } from "../../studio/Icon";
import { Field, IconButton } from "../../studio/ui";
import { useStudio } from "../../studio/store";
import type { Device, Section } from "../../studio/model";
import type { MediaTarget } from "../../studio/Inspector";
import { pathTo, type Node, type PropValue } from "../model";
import { BLOCKS, createNode, nodeLabel } from "../registry";
import { ContentField, Switch } from "./fields";
import { DeviceBar, Group, StylePanel } from "./StylePanel";
import {
  duplicateSelected,
  removeSelected,
  selectionLock,
  undoAction,
  type Notify,
} from "./actions";
import { DataPanel } from "./DataPanel";
import { childrenLock } from "../lock";
import { ActionsPanel } from "./ActionsPanel";
import { hasDataTab } from "../data/bind";
import { actionLabel } from "../logic/blocks";

type Tab = "content" | "layout" | "style" | "data" | "actions";
const TAB_NAMES: Record<Tab, string> = {
  content: "Content",
  layout: "Layout",
  style: "Style",
  data: "Data",
  actions: "Actions",
};

export function NodeInspector({
  section,
  node,
  device,
  onDevice,
  pickMedia,
  notify,
  onClose,
  onSelectNode,
  draft,
  onEditText,
  onAddBlock,
}: {
  section: Section;
  node: Node;
  device: Device;
  onDevice?: (device: Device) => void;
  pickMedia: (target: MediaTarget) => void;
  notify: Notify;
  onClose?: () => void;
  onSelectNode: (node: string) => void;
  /** The block's text while it's being typed on the canvas. */
  draft?: { node: string; text: string };
  /** Starts typing the block's text on the canvas. */
  onEditText?: (node: string) => void;
  /** Opens the Add panel's blocks, to add inside this block. */
  onAddBlock?: () => void;
}) {
  const store = useStudio();
  const root = section.root!;
  const isRoot = node.id === root.id;
  const def = BLOCKS[node.type];
  const container = !!def.container;
  // Data blocks (and blocks inside a repeat) also get a Data tab.
  const dataTab = hasDataTab(root, node);
  const tabs: Tab[] = [
    container ? "layout" : "content",
    "style",
    ...(dataTab ? (["data"] as const) : []),
    "actions",
  ];
  // The choice is remembered per block while it stays selected.
  const [chosen, setChosen] = useState<{ id: string; tab: Tab }>();
  const tab: Tab =
    chosen?.id === node.id && tabs.includes(chosen.tab)
      ? chosen.tab
      : // Data blocks without a source yet open on Data, where it's chosen.
        dataTab &&
          def.category === "data" &&
          !node.props.source &&
          "source" in def.props()
        ? "data"
        : tabs[0];
  const setTab = (t: Tab) => setChosen({ id: node.id, tab: t });
  const path = pathTo([root], node.id);
  const setProp = (key: string, value: PropValue) =>
    store.updateNode(
      section.id,
      node.id,
      (n) => ({ ...n, props: { ...n.props, [key]: value } }),
      `prop:${node.id}:${key}`,
    );
  const columns = node.type === "columns" ? (node.children ?? []) : [];
  const setColumns = (count: number) =>
    store.updateNode(section.id, node.id, (n) => {
      const kids = n.children ?? [];
      const children =
        count > kids.length
          ? [
              ...kids,
              ...Array.from({ length: count - kids.length }, () =>
                createNode("column"),
              ),
            ]
          : kids.slice(0, count);
      return { ...n, children, style: { ...n.style, columns: count } };
    });
  const name = isRoot ? section.name : nodeLabel(node);
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  const parentName = parent
    ? parent.id === root.id
      ? section.name
      : nodeLabel(parent)
    : undefined;

  // A block with a click shows it in place of its "Goes to" link.
  const click = node.on?.click;
  const clickNote = click?.length ? (
    <div className="node-click-summary" key="click-summary">
      <Icon name="zap" size={14} />
      <span>
        When clicked:{" "}
        <strong>
          {actionLabel(click[0], store.project, root)}
          {click.length > 1 ? ` + ${click.length - 1} more` : ""}
        </strong>
      </span>
      <button type="button" onClick={() => setTab("actions")}>
        Change
      </button>
    </div>
  ) : null;
  const shownFields = def.fields.filter(
    (spec) =>
      // The photo shade only does something on the image banner look.
      !(
        node.type === "section" &&
        spec.key === "shade" &&
        node.props.look !== "hero"
      ) &&
      // The button's text only matters once there is a button.
      !(spec.key === "moreLabel" && node.props.more !== true) &&
      (!click?.length ||
      !(
        spec.kind === "link" ||
        (node.type === "button" && spec.key === "newTab")
      )),
  );
  const fields = def.fields.length > 0 && (
    <div className="inspector-group node-fields">
      {def.fields.some((f) => f.kind === "link") && clickNote}
      {shownFields.map((spec) => (
        <ContentField
          key={spec.key}
          spec={spec}
          value={node.props[spec.key]}
          onChange={(v) => setProp(spec.key, v)}
          onPickImage={() =>
            pickMedia({
              section: section.id,
              node: node.id,
              prop: spec.key,
            })
          }
          optionalIcon={node.type !== "icon"}
          draft={
            draft?.node === node.id && def.inline === spec.key
              ? draft.text
              : undefined
          }
          onEditCanvas={
            def.inline === spec.key && onEditText
              ? () => onEditText(node.id)
              : undefined
          }
        />
      ))}
    </div>
  );
  // Adding or removing a column changes what the block holds (lock.ts).
  const addLock =
    node.type === "columns"
      ? childrenLock(root, node.id, [], section.name)
      : null;
  const removeLock =
    node.type === "columns"
      ? childrenLock(root, node.id, columns.slice(-1), section.name)
      : null;
  const columnCount = node.type === "columns" && (
    <>
      <div className="node-count">
        <span>
          <strong>{columns.length} columns</strong> side by side, stacked on
          phones
        </span>
        <IconButton
          icon="minus"
          label="Remove the last column"
          disabled={columns.length <= 2 || !!removeLock}
          onClick={() => {
            if (removeLock) return notify(removeLock);
            setColumns(columns.length - 1);
            notify("Column removed", undoAction);
          }}
        />
        <IconButton
          icon="plus"
          label="Add a column"
          disabled={columns.length >= 4 || !!addLock}
          onClick={() => {
            if (addLock) return notify(addLock);
            setColumns(columns.length + 1);
          }}
        />
      </div>
      {(addLock || (removeLock && columns.length > 2)) && (
        <p className="node-empty-note">
          <Icon name="lock" size={12} /> {addLock ?? removeLock}
        </p>
      )}
    </>
  );
  const inside = container && (
    <Group id="inside" title={`Inside (${node.children?.length ?? 0})`} open>
      {node.children?.length ? (
        <ul className="node-children" aria-label={`Blocks in ${name}`}>
          {node.children.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.hidden ? "is-hidden" : ""}
                onClick={() => onSelectNode(c.id)}
              >
                <Icon name={BLOCKS[c.type].icon} size={13} />
                <span>{nodeLabel(c)}</span>
                {c.hidden && <Icon name="eyeOff" size={12} />}
                <Icon name="chevron" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="node-empty-note">
          Nothing inside yet. Add a block, or drag one here from the page.
        </p>
      )}
      {node.locked ? (
        <p className="node-empty-note">
          <Icon name="lock" size={12} /> Locked. Unlock it in Layers to add or
          remove blocks inside.
        </p>
      ) : (
        onAddBlock &&
        node.type !== "columns" && (
          <button
            type="button"
            className="node-add-inside"
            onClick={onAddBlock}
          >
            <Icon name="plus" size={14} />
            Add a block inside
          </button>
        )
      )}
    </Group>
  );
  const layer = (
    <Group id="layer" title={isRoot ? "Section" : "Name and visibility"} open>
      <Field
        label={isRoot ? "Section name" : "Name in Layers"}
        value={isRoot ? section.name : (node.name ?? "")}
        placeholder={def.label}
        maxLength={80}
        hint="Only shown in your editor."
        onChange={(value) =>
          isRoot
            ? store.updateSection(section.id, { name: value })
            : store.updateNode(
                section.id,
                node.id,
                (n) => ({ ...n, name: value || undefined }),
                `name:${node.id}`,
              )
        }
      />
      <Switch
        label="Show on site"
        checked={isRoot ? !section.hidden : !node.hidden}
        onChange={(on) =>
          isRoot
            ? store.updateSection(section.id, { hidden: !on })
            : store.updateNode(section.id, node.id, (n) => ({
                ...n,
                hidden: on ? undefined : true,
              }))
        }
      />
    </Group>
  );

  return (
    <aside className="inspector node-inspector">
      <div className="inspector-heading node-heading">
        <span className="node-heading-icon" aria-hidden="true">
          <Icon name={isRoot ? "panel" : def.icon} size={16} />
        </span>
        <span className="node-heading-text">
          <strong>{name}</strong>
          <small>
            {/* The type, unless the name already says it ("Heading · in Copy"
                reads as "in Copy"). */}
            {isRoot ? "Section" : name !== def.label && def.label}
            {parent && (
              <>
                {name !== def.label ? " · in " : "In "}
                <button
                  type="button"
                  className="node-parent"
                  aria-label={`Select ${parentName}, the block it sits in`}
                  title={path
                    .slice(0, -1)
                    .map((n) =>
                      n.id === root.id ? section.name : nodeLabel(n),
                    )
                    .join(" › ")}
                  onClick={() => onSelectNode(parent.id)}
                >
                  {parentName}
                </button>
              </>
            )}
          </small>
        </span>
        <IconButton
          icon="x"
          label="Close inspector"
          onClick={onClose ?? (() => store.select(null))}
        />
      </div>
      <div
        className="inspector-tabs node-tabs"
        role="tablist"
        aria-label="Block settings"
      >
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {TAB_NAMES[t]}
          </button>
        ))}
      </div>
      <div className="inspector-scroll" key={`${node.id}-${tab}`}>
        {(tab === "layout" || tab === "style") && (
          <DeviceBar
            node={node}
            device={device}
            onDevice={onDevice}
            onResetAll={() =>
              store.updateNode(section.id, node.id, (n) => {
                const next = { ...n };
                delete next[device === "tablet" ? "tablet" : "mobile"];
                return next;
              })
            }
          />
        )}
        {tab === "data" ? (
          <DataPanel section={section} node={node} />
        ) : tab === "actions" ? (
          <ActionsPanel
            section={section}
            node={node}
            notify={notify}
            onSelectNode={(s, n) =>
              s === section.id ? onSelectNode(n) : store.select(s, n)
            }
          />
        ) : tab === "content" ? (
          <>
            {fields}
            {!def.fields.length && (
              <p className="node-empty-note is-boxed">
                <Icon name="palette" size={15} />
                <span>
                  Nothing to fill in for a {def.label.toLowerCase()}.{" "}
                  <button type="button" onClick={() => setTab("style")}>
                    Change its look
                  </button>
                </span>
              </p>
            )}
            {layer}
          </>
        ) : tab === "layout" ? (
          <>
            {(fields || columnCount) && (
              <Group
                id={`settings-${isRoot ? "section" : node.type}`}
                title={isRoot ? "Section settings" : `${def.label} settings`}
              >
                {columnCount}
                {fields}
              </Group>
            )}
            <StylePanel
              section={section}
              node={node}
              device={device}
              pickMedia={pickMedia}
              part="layout"
            />
            {inside}
            {layer}
          </>
        ) : (
          <StylePanel
            section={section}
            node={node}
            device={device}
            pickMedia={pickMedia}
          />
        )}
      </div>
      <div className="inspector-bottom">
        <button
          className="danger-text"
          onClick={() => {
            const locked = selectionLock("delete");
            if (locked) return notify(locked);
            removeSelected();
            notify(`${name} deleted`, undoAction);
          }}
        >
          <Icon name="trash" size={14} />
          {isRoot ? "Remove section" : "Delete block"}
        </button>
        {isRoot && (
          <IconButton
            icon="folder"
            label="Save section to library"
            onClick={() => {
              store.saveSection(section.id);
              notify(`${section.name} saved. Find it in Saved sections.`);
            }}
          />
        )}
        <IconButton
          icon="copy"
          label={isRoot ? "Duplicate section" : "Duplicate block"}
          onClick={() => {
            const locked = selectionLock("duplicate");
            if (locked) return notify(locked);
            duplicateSelected();
            notify(
              isRoot ? "Section duplicated" : "Block duplicated",
              undoAction,
            );
          }}
        />
      </div>
    </aside>
  );
}

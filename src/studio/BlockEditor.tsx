import { Icon } from "./Icon";
import { Field, Range, IconButton } from "./ui";
import { useStudio } from "./store";
import {
  blockMeta,
  findBlockParent,
  leafBlocks,
  safeImage,
  MAX_COLUMNS,
  type Block,
  type BlockType,
  type Section,
} from "./model";
import type { MediaTarget } from "./Inspector";

const preview = (b: Block) =>
  b.type === "columns"
    ? `${b.children.length} columns`
    : b.type === "spacer"
      ? `${b.height}px`
      : b.text || b.alt || blockMeta[b.type].label;

function AddBlock({
  label,
  types,
  onAdd,
}: {
  label: string;
  types: BlockType[];
  onAdd: (type: BlockType) => void;
}) {
  return (
    <label className="block-add">
      <Icon name="plus" size={14} />
      <span>{label}</span>
      <select
        aria-label={label}
        value=""
        onChange={(e) => e.target.value && onAdd(e.target.value as BlockType)}
      >
        <option value="" disabled>
          {label}
        </option>
        {types.map((t) => (
          <option key={t} value={t}>
            {blockMeta[t].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BlockRows({
  section,
  blocks,
  depth,
}: {
  section: Section;
  blocks: Block[];
  depth: number;
}) {
  const store = useStudio();
  return (
    <>
      {blocks.map((b, index) => (
        <li key={b.id}>
          <div
            className={`block-row ${store.selectedBlock === b.id ? "selected" : ""}`}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <button
              className="block-row-main"
              onClick={() => store.select(section.id, b.id)}
              aria-current={store.selectedBlock === b.id || undefined}
            >
              <Icon name={blockMeta[b.type].icon} size={14} />
              <span className="block-row-type">
                {b.type === "column"
                  ? `Column ${index + 1}`
                  : blockMeta[b.type].label}
              </span>
              {b.type !== "column" && (
                <span className="block-row-preview">{preview(b)}</span>
              )}
            </button>
            <IconButton
              icon="up"
              label={`Move ${blockMeta[b.type].label} up`}
              disabled={index === 0}
              onClick={() => store.moveBlock(section.id, b.id, -1)}
            />
            <IconButton
              icon="down"
              label={`Move ${blockMeta[b.type].label} down`}
              disabled={index === blocks.length - 1}
              onClick={() => store.moveBlock(section.id, b.id, 1)}
            />
          </div>
          {b.children.length > 0 && (
            <ul>
              <BlockRows
                section={section}
                blocks={b.children}
                depth={depth + 1}
              />
            </ul>
          )}
          {b.type === "column" && (
            <div style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
              <AddBlock
                label="Add to column"
                types={leafBlocks}
                onAdd={(type) =>
                  store.addBlock(section.id, type, { parent: b.id })
                }
              />
            </div>
          )}
        </li>
      ))}
    </>
  );
}

export function BlockTree({ section }: { section: Section }) {
  const store = useStudio();
  const blocks = section.blocks ?? [];
  return (
    <div className="inspector-group">
      <h4>
        BLOCKS<span>{blocks.length}</span>
      </h4>
      {blocks.length ? (
        <ul className="block-tree" aria-label="Blocks">
          <BlockRows section={section} blocks={blocks} depth={0} />
        </ul>
      ) : (
        <p className="block-empty">
          Add headings, text, images, buttons, and columns to build this
          section.
        </p>
      )}
      <AddBlock
        label="Add block"
        types={[...leafBlocks, "columns"]}
        onAdd={(type) => store.addBlock(section.id, type)}
      />
    </div>
  );
}

const sizeLabels = { sm: "S", md: "M", lg: "L", xl: "XL" } as const;

export function BlockSettings({
  section,
  block: b,
  pickMedia,
  notify,
}: {
  section: Section;
  block: Block;
  pickMedia: (target: MediaTarget) => void;
  notify: (text: string) => void;
}) {
  const store = useStudio();
  const update = (values: Partial<Block>) =>
    store.updateBlock(section.id, b.id, values);
  const parent = findBlockParent(section.blocks ?? [], b.id)?.parent;
  const columns =
    b.type === "columns" ? b : parent?.type === "columns" ? parent : undefined;
  const label =
    b.type === "column" && parent
      ? `Column ${parent.children.findIndex((c) => c.id === b.id) + 1}`
      : blockMeta[b.type].label;
  return (
    <>
      <div className="inspector-group">
        <button
          className="block-back"
          onClick={() => store.select(section.id, parent?.id ?? null)}
        >
          <Icon name="arrow" size={14} />
          Back to{" "}
          {parent ? blockMeta[parent.type].label.toLowerCase() : section.name}
        </button>
        <h4>{label.toUpperCase()}</h4>
        {(b.type === "heading" || b.type === "text" || b.type === "button") && (
          <Field
            label={b.type === "button" ? "Button label" : "Text"}
            value={b.text}
            multiline={b.type !== "button"}
            onChange={(text) => update({ text })}
          />
        )}
        {(b.type === "heading" || b.type === "text") && (
          <>
            <label className="field">Size</label>
            <div className="segmented">
              {(["sm", "md", "lg", "xl"] as const).map((size) => (
                <button
                  key={size}
                  aria-label={`Size ${size}`}
                  className={b.size === size ? "chosen" : ""}
                  onClick={() => update({ size })}
                >
                  {sizeLabels[size]}
                </button>
              ))}
            </div>
          </>
        )}
        {b.type === "button" && (
          <>
            <label className="field">
              Style
              <select
                value={b.variant}
                onChange={(e) =>
                  update({ variant: e.target.value as Block["variant"] })
                }
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="link">Text link</option>
              </select>
            </label>
            <label className="field">
              Link to
              <select
                value={
                  store.project.pages.some((p) => `/${p.slug}` === b.url)
                    ? b.url
                    : "custom"
                }
                onChange={(e) =>
                  update({
                    url: e.target.value === "custom" ? "#" : e.target.value,
                  })
                }
              >
                {store.project.pages.map((p) => (
                  <option value={`/${p.slug}`} key={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="custom">Custom link</option>
              </select>
            </label>
            <Field
              label="Link URL"
              value={b.url}
              onChange={(url) => update({ url })}
              placeholder="https://example.com"
            />
          </>
        )}
        {b.type === "image" && (
          <>
            <button
              className="media-picker"
              onClick={() => pickMedia({ section: section.id, block: b.id })}
            >
              {b.image ? (
                <img src={safeImage(b.image)} alt="Selected image" />
              ) : (
                <span className="media-placeholder">
                  <Icon name="image" size={25} />
                </span>
              )}
              <span>
                <Icon name="image" size={14} />
                {b.image ? "Change image" : "Select an image"}
                <Icon name="chevron" size={13} />
              </span>
            </button>
            <Field
              label="Image description"
              value={b.alt}
              onChange={(alt) => update({ alt })}
              placeholder="Describe your image"
            />
            <Range
              label="Height"
              value={b.height}
              max={900}
              step={10}
              onChange={(height) => update({ height })}
            />
            <small className="block-hint">0 keeps the image’s own shape.</small>
          </>
        )}
        {b.type === "spacer" && (
          <Range
            label="Height"
            value={b.height}
            max={400}
            step={4}
            onChange={(height) => update({ height })}
          />
        )}
        {columns && (
          <button
            className="subtle-button full-width"
            disabled={columns.children.length >= MAX_COLUMNS}
            onClick={() =>
              store.addBlock(section.id, "column", { parent: columns.id })
            }
          >
            <Icon name="plus" size={15} />
            {columns.children.length >= MAX_COLUMNS
              ? `Up to ${MAX_COLUMNS} columns`
              : "Add column"}
          </button>
        )}
        {b.type === "column" && (
          <AddBlock
            label="Add to column"
            types={leafBlocks}
            onAdd={(type) => store.addBlock(section.id, type, { parent: b.id })}
          />
        )}
      </div>
      <div className="inspector-group block-actions">
        <button
          className="danger-text"
          onClick={() => {
            store.removeBlock(section.id, b.id);
            notify(`${label} removed. You can undo this change.`);
          }}
        >
          <Icon name="trash" size={14} />
          Remove {label.toLowerCase()}
        </button>
        <IconButton
          icon="copy"
          label={`Duplicate ${label.toLowerCase()}`}
          onClick={() => store.duplicateBlock(section.id, b.id)}
        />
      </div>
    </>
  );
}

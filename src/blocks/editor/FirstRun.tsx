/**
 * A blank page's canvas: a way in for someone who has never built a page.
 * Popular ready-made sections (drawn small, in this site's look), a
 * template gallery, and the blocks people reach for first.
 */
import { Icon } from "../../studio/Icon";
import { useStudio } from "../../studio/store";
import type { NodeType } from "../model";
import { BLOCKS } from "../registry";
import { PRESETS } from "../presets";
import { PresetPreview } from "./AddPanel";

/** One prebuilt section from each of the categories people start with. */
const STARTERS = ["hero", "features", "content", "contact"]
  .map((c) => PRESETS.find((p) => p.category === c))
  .filter((p): p is (typeof PRESETS)[number] => !!p);
const FIRST_BLOCKS: NodeType[] = [
  "heading",
  "text",
  "image",
  "button",
  "columns",
  "video",
];

export function FirstRun({
  pageName,
  onAddSection,
  onTemplates,
  onPreset,
  onBlock,
}: {
  pageName: string;
  /** Opens the Add panel. */
  onAddSection: () => void;
  onTemplates: () => void;
  onPreset: (id: string) => void;
  onBlock: (type: NodeType) => void;
}) {
  const project = useStudio((s) => s.project);
  return (
    <div className="first-run" role="region" aria-label={`Start ${pageName}`}>
      <div className="first-run-head">
        <span className="first-run-icon" aria-hidden="true">
          <Icon name="sparkles" size={20} />
        </span>
        <h2>Let’s build {pageName}</h2>
        <p>
          Start with a ready-made section and change anything in it, or put
          blocks down one at a time.
        </p>
        <div className="first-run-actions">
          <button
            type="button"
            className="first-run-primary"
            onClick={onAddSection}
          >
            <Icon name="plus" size={15} />
            Add a section
          </button>
          <button
            type="button"
            className="first-run-secondary"
            onClick={onTemplates}
          >
            <Icon name="grid" size={15} />
            Browse templates
          </button>
        </div>
      </div>
      <div className="first-run-block">
        <h3>Popular sections</h3>
        <div className="first-run-presets">
          {STARTERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="first-run-preset"
              aria-label={`Add ${p.name}: ${p.description}`}
              onClick={() => onPreset(p.id)}
            >
              <PresetPreview preset={p} project={project} zoom={0.19} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="first-run-block">
        <h3>Or start with a block</h3>
        <div className="first-run-blocks">
          {FIRST_BLOCKS.filter((t) => BLOCKS[t]).map((t) => (
            <button key={t} type="button" onClick={() => onBlock(t)}>
              <Icon name={BLOCKS[t].icon} size={15} />
              {BLOCKS[t].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

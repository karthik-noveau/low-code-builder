import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { Icon } from "./Icon";
export interface StudioCommand {
  id: string;
  title: string;
  description: string;
  icon: string;
  run: () => void;
}
export function CommandMenu({
  commands,
  onClose,
}: {
  commands: StudioCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const activeResult = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeResult.current?.scrollIntoView({ block: "nearest" });
  }, [active, query]);
  const results = commands
    .filter((c) =>
      `${c.title} ${c.description}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 9);
  const execute = (c: StudioCommand) => {
    onClose();
    c.run();
  };
  return (
    <Modal
      title="What would you like to do?"
      subtitle="Find a page, jump to a section, or make a change."
      onClose={onClose}
    >
      <div className="command-search">
        <Icon name="search" size={20} />
        <input
          autoFocus
          aria-label="Search commands"
          placeholder="Try “colors”, “contact”, or “add a gallery”…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((n) =>
                Math.max(0, Math.min(results.length - 1, n + 1)),
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => Math.max(0, n - 1));
            }
            if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              execute(results[active]);
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="command-results">
        {results.map((c, i) => (
          <button
            key={c.id}
            ref={i === active ? activeResult : undefined}
            className={i === active ? "active" : ""}
            onMouseEnter={() => setActive(i)}
            onClick={() => execute(c)}
          >
            <span>
              <Icon name={c.icon} size={17} />
            </span>
            <div>
              <strong title={c.title}>{c.title}</strong>
              <small>{c.description}</small>
            </div>
            <Icon name="arrow" size={14} />
          </button>
        ))}
        {!results.length && (
          <p>No matches yet. Try a page name or “add section”.</p>
        )}
      </div>
      <div className="command-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> to explore
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
      </div>
    </Modal>
  );
}

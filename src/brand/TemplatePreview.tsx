import { useState, useRef } from "react";
import { Website } from "../studio/Website";
import { createProject } from "../studio/templates";
import { collections } from "./content";
import { Arrow, Brand } from "./Brand";
import { PublicSite } from "./PublicSite";
import "./brand.css";
import "./public.css";

export function TemplatePreview({ id }: { id: string }) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const item = collections.find((item) => item.id === id);
  const [project] = useState(() => createProject(item?.id || "blank"));
  const [pageId, setPageId] = useState(project.pages[0].id);
  const [opened, setOpened] = useState<{ c: string; i: string } | null>(null);
  const [device, setDevice] = useState("desktop");
  const page = project.pages.find((page) => page.id === pageId)!;
  // Collection cards open their item page (a dish, a service, an event).
  const openedCollection = project.collections?.find((c) => c.id === opened?.c);
  const openedItem = openedCollection?.items.find((i) => i.id === opened?.i);
  if (!item) return <PublicSite path="/404" />;
  return (
    <div
      ref={scrollArea}
      className="brand-app brand-public pub-preview template-preview-page"
    >
      <header className="pub-preview-bar">
        <a
          className="pub-preview-back"
          href="/templates"
          aria-label="Back to templates"
        >
          <Brand compact />
          <span>← All templates</span>
        </a>
        <div className="pub-preview-title">
          <strong>{item.name}</strong>
          <span>{item.category}</span>
        </div>
        <div className="pub-segmented" aria-label="Preview size">
          <button
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            Desktop
          </button>
          <button
            aria-pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
          >
            Mobile
          </button>
        </div>
        <a
          className="pub-btn pub-btn-primary pub-btn-small"
          href={`/new?template=${item.id}`}
        >
          Use this template <Arrow />
        </a>
      </header>
      <div className="pub-preview-info">
        <span>
          A working business · {item.works.join(" · ")} · Replace sample text
          and testimonials before publishing.
        </span>
        <span>Fully editable in Forma</span>
      </div>
      <div className="pub-preview-stage">
        <main
          id="main"
          className={`pub-preview-frame template-full-preview ${device === "mobile" ? "is-mobile preview-mobile" : ""}`}
        >
          <Website
            project={project}
            page={page}
            preview
            item={
              openedCollection && openedItem
                ? { collection: openedCollection, item: openedItem }
                : undefined
            }
            onOpenItem={(c, i) => {
              setOpened({ c, i });
              scrollArea.current?.scrollTo({ top: 0 });
            }}
            onNavigate={(id) => {
              setOpened(null);
              setPageId(id);
              scrollArea.current?.scrollTo({ top: 0 });
            }}
          />
        </main>
      </div>
    </div>
  );
}

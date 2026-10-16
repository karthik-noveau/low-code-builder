import { useState, useRef } from "react";
import { Website } from "../studio/Website";
import { createProject } from "../studio/templates";
import { collections } from "./content";
import { Arrow, Brand } from "./Brand";
import { PublicSite } from "./PublicSite";
import "./brand.css";

export function TemplatePreview({ id }: { id: string }) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const item = collections.find((item) => item.id === id);
  const [project] = useState(() => createProject(item?.id || "blank"));
  const [pageId, setPageId] = useState(project.pages[0].id);
  const [device, setDevice] = useState("desktop");
  const page = project.pages.find((page) => page.id === pageId)!;
  if (!item) return <PublicSite path="/404" />;
  return (
    <div ref={scrollArea} className="brand-app template-preview-page">
      <header className="template-preview-header">
        <a href="/templates" aria-label="Back to templates">
          <Brand compact />
          <span>← All templates</span>
        </a>
        <div>
          <strong>{item.name}</strong>
          <span>{item.category}</span>
        </div>
        <div className="template-preview-devices" aria-label="Preview size">
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
          className="brand-button brand-button-small"
          href={`/new?template=${item.id}`}
        >
          Use this template <Arrow />
        </a>
      </header>
      <div className="template-preview-info">
        <span>
          Starting-point preview · Replace sample text and testimonials before
          publishing.
        </span>
        <span>Fully editable in Forma ↗</span>
      </div>
      <main
        id="main"
        className={`template-full-preview ${device === "mobile" ? "preview-mobile" : ""}`}
      >
        <Website
          project={project}
          page={page}
          preview
          onNavigate={(id) => {
            setPageId(id);
            scrollArea.current?.scrollTo({ top: 0 });
          }}
        />
      </main>
    </div>
  );
}

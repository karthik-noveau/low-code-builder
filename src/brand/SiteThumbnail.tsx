import { useEffect, useMemo, useRef, useState } from "react";
import { Website } from "../studio/Website";
import type { Project } from "../studio/model";
import * as cloud from "../cloud/client";
import { TemplateArt } from "./TemplateArt";

// Drafts already drawn on this page, by site and version.
const drafts = new Map<string, Promise<Project>>();
const draftFor = (site: cloud.Site) => {
  const key = `${site.id}:${site.version}`;
  if (!drafts.has(key))
    drafts.set(
      key,
      cloud.loadDraft(site.id).then((draft) => draft.project as Project),
    );
  return drafts.get(key)!;
};

/**
 * A live, scaled-down picture of a site's own home page. It loads once the
 * card scrolls into view; until then (or if the draft can't be read) the
 * template art or a calm initial stands in.
 */
export function SiteThumbnail({ site }: { site: cloud.Site }) {
  const box = useRef<HTMLDivElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let live = true;
    const fit = () => setScale(element.clientWidth / 1280);
    fit();
    const resize =
      typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    resize?.observe(element);
    const load = () =>
      draftFor(site)
        .then((value) => live && setProject(value))
        .catch(() => {});
    let seen: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      seen = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          seen?.disconnect();
          void load();
        }
      });
      seen.observe(element);
    } else void load();
    return () => {
      live = false;
      resize?.disconnect();
      seen?.disconnect();
    };
  }, [site]);
  // The top of the home page is all a card shows.
  const page = useMemo(() => {
    const home = project?.pages[0];
    return home && { ...home, sections: home.sections.slice(0, 4) };
  }, [project]);
  const empty = page && !page.sections.some((s) => !s.hidden);
  return (
    <div className="site-thumb" ref={box} aria-hidden="true" inert>
      {project && page && !empty ? (
        <div
          className="site-thumb-canvas"
          style={{ transform: `scale(${scale})` }}
        >
          <Website project={project} page={page} preview />
        </div>
      ) : site.template && site.template !== "blank" ? (
        <TemplateArt template={site.template} />
      ) : (
        <span
          className="site-thumb-blank"
          style={{
            ["--thumb-hue" as string]: `${[...site.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360}`,
          }}
        >
          <span>{site.name.trim()[0]?.toUpperCase() || "W"}</span>
          {empty && <small>Empty home page</small>}
        </span>
      )}
    </div>
  );
}

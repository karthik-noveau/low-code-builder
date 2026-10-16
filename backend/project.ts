import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  validateProject,
  sectionMeta,
  flattenBlocks,
  type Project,
} from "../src/studio/model";
import { config, insist, HttpError } from "./config";

export const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function decodeProject(bytes: Buffer): {
  project: Project;
  checksum: string;
} {
  insist(
    bytes.length <= config.maxCompressed,
    413,
    "The compressed project exceeds 3 MB. Remove unused images or use image URLs.",
  );
  let value: unknown;
  let json: Buffer;
  try {
    json = gunzipSync(bytes, { maxOutputLength: config.maxExpanded });
    value = JSON.parse(json.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid or oversized compressed project.");
  }
  insist(validateProject(value), 422, "This project has an invalid format.");
  const p = value;
  insist(
    p.name.trim().length > 0 && p.name.length <= 120,
    422,
    "Use a project name between 1 and 120 characters.",
  );
  const sections = [
    ...p.header,
    ...p.footer,
    ...p.pages.flatMap((page) => page.sections),
    ...(p.savedSections || []),
  ];
  insist(
    p.pages.length <= 50 && sections.length <= 300 && p.assets.length <= 200,
    422,
    "A site can have up to 50 pages, 300 sections and 200 saved images.",
  );
  for (const s of sections) {
    insist(
      Object.hasOwn(sectionMeta, s.type) && s.items.length <= 100,
      422,
      "Invalid section or too many section items.",
    );
    insist(
      [s.background, s.color].every(
        (c) => c === "" || /^#[0-9a-f]{6}$/i.test(c),
      ),
      422,
      "Section colors must be six-digit hex colors.",
    );
    insist(
      [
        s.id,
        s.name,
        s.title,
        s.eyebrow,
        s.body,
        s.buttonLabel,
        s.buttonUrl,
        s.imageAlt,
        s.formAction,
        ...s.items.flatMap((i) => [i.id, i.title, i.body, i.price, i.url]),
      ].every((v) => v.length <= 20000),
      422,
      "A text field is too long.",
    );
    const blocks = flattenBlocks(s.blocks);
    insist(
      blocks.length <= 200 &&
        blocks.every((b) =>
          [b.id, b.text, b.url, b.alt].every((v) => v.length <= 20000),
        ),
      422,
      "A section has too many blocks or a block's text is too long.",
    );
  }
  insist(
    p.pages.every(
      (page) =>
        page.slug.length <= 100 &&
        [page.id, page.name, page.title, page.description].every(
          (v) => v.length <= 20000,
        ),
    ),
    422,
    "A page field is too long.",
  );
  return { project: p, checksum: digest(json) };
}

/** Where an app section's screens link (AppSection.tsx). */
import type { App, AppForm } from "./model";
import type { Section } from "../studio/model";
import { sectionAppForms } from "../blocks/project";

/** Pages a step links to, e.g. "View my rewards" after sending. */
export interface AppLinks {
  /** The lookup that shows the visitor's record (shown after sending). */
  lookup?: { href: string; label: string };
  /** The form that adds to the visitor's history (lookup's "New" and empty state). */
  submit?: { href: string; label: string };
}

/**
 * Where a form's screens link: after sending, the lookup of the same people
 * ("View my rewards"); from a lookup, the form that adds to their history.
 */
export function appLinks(
  app: App,
  pages: { slug: string; sections: Section[] }[],
  form: AppForm,
  href: (url: string) => string,
): AppLinks {
  const pageOf = (other: AppForm) =>
    pages.find((p) =>
      p.sections.some((s) => sectionAppForms(s).includes(other.id)),
    );
  const links: AppLinks = {};
  const lookup =
    form.kind === "submit" && form.identify
      ? app.forms.find(
          (f) =>
            f.kind === "lookup" &&
            f.table === form.identify!.table &&
            pageOf(f),
        )
      : undefined;
  if (lookup)
    links.lookup = {
      href: href(`/${pageOf(lookup)!.slug}`),
      label: `View ${lookup.title.toLowerCase()}`,
    };
  const submit =
    form.kind === "lookup"
      ? app.forms.find(
          (f) =>
            f.kind === "submit" &&
            f.identify?.table === form.table &&
            pageOf(f),
        )
      : undefined;
  if (submit)
    links.submit = {
      href: href(`/${pageOf(submit)!.slug}`),
      label: submit.title,
    };
  return links;
}

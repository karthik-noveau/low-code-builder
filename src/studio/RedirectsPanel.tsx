import { useId, useState, type ChangeEvent } from "react";
import { useStudio } from "./store";
import { Icon } from "./Icon";
import { IconButton } from "./ui";
import { parseCsv } from "../commerce/csv";
import {
  MAX_REDIRECTS,
  mergeRedirects,
  redirectFrom,
  redirectsFromRows,
  redirectTo,
} from "./redirects";

/**
 * Old addresses that keep working after a move from Shopify, Wix or another
 * site (Settings → Moved pages). Store products imported from Shopify or Wix
 * redirect by themselves; this list is for pages, blog posts and anything else.
 */
export function RedirectsPanel() {
  const project = useStudio((s) => s.project);
  const commit = useStudio((s) => s.commit);
  const redirects = project.redirects ?? [];
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("/");
  const [message, setMessage] = useState("");
  const fromId = useId(),
    toId = useId();
  const save = (next: typeof redirects) =>
    commit((p) => ({ ...p, redirects: next }), "redirects");
  const add = () => {
    const old = redirectFrom(from),
      target = redirectTo(to);
    if (!old)
      return setMessage(
        "Use the old page’s address, like /pages/about-us: lowercase letters, numbers and dashes.",
      );
    if (!target)
      return setMessage("Choose a page, or paste a full https:// address.");
    if (
      redirects.length >= MAX_REDIRECTS &&
      !redirects.some((r) => r.from === old)
    )
      return setMessage(`A site keeps up to ${MAX_REDIRECTS} moved pages.`);
    save(mergeRedirects(redirects, [{ from: old, to: target }]));
    setFrom("");
    setMessage(`/${old} now goes to ${target}.`);
  };
  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Use a CSV under 1 MB.");
      const { redirects: found, skipped } = redirectsFromRows(
        parseCsv(await file.text()),
      );
      if (!found.length)
        throw new Error(
          "No redirects found. Use Shopify’s URL redirect export, or two columns: old address, new address.",
        );
      const next = mergeRedirects(redirects, found);
      save(next);
      setMessage(
        `${found.length} moved ${found.length === 1 ? "page" : "pages"} added${skipped ? `, ${skipped} skipped (unsupported address)` : ""}.${next.length >= MAX_REDIRECTS ? ` The list is full at ${MAX_REDIRECTS}.` : ""}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Couldn’t read that file.",
      );
    }
  };
  return (
    <div className="redirects-panel">
      <p className="muted-note">
        Moving from Shopify, Wix or another site? Keep old links, bookmarks and
        search results working. Products imported into your store redirect by
        themselves.
      </p>
      <div className="redirects-add">
        <div className="field">
          <div className="field-label-row">
            <label htmlFor={fromId}>Old address</label>
          </div>
          <input
            id={fromId}
            value={from}
            placeholder="/pages/about-us"
            maxLength={300}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <div className="field">
          <div className="field-label-row">
            <label htmlFor={toId}>Goes to</label>
          </div>
          <select
            id={toId}
            value={to.startsWith("https://") ? "url" : to}
            onChange={(e) =>
              setTo(e.target.value === "url" ? "https://" : e.target.value)
            }
          >
            {project.pages.map((page) => (
              <option key={page.id} value={`/${page.slug}`}>
                {page.name || page.slug || "Home"}
              </option>
            ))}
            <option value="url">Another address…</option>
          </select>
          {to.startsWith("https://") && (
            <input
              aria-label="Destination address"
              value={to}
              maxLength={2000}
              onChange={(e) => setTo(e.target.value)}
            />
          )}
        </div>
        <button className="subtle-button full-width" onClick={add}>
          <Icon name="plus" size={15} />
          Add moved page
        </button>
      </div>
      {message && (
        <p className="muted-note" role="status">
          {message}
        </p>
      )}
      {!!redirects.length && (
        <ul className="redirects-list" aria-label="Moved pages">
          {redirects.map((r) => (
            <li key={r.from}>
              <span>
                <code>/{r.from}</code>
                <small>→ {r.to}</small>
              </span>
              <IconButton
                icon="x"
                label={`Remove /${r.from}`}
                onClick={() => save(redirects.filter((x) => x.from !== r.from))}
              />
            </li>
          ))}
        </ul>
      )}
      <label className="subtle-button full-width import-button">
        <Icon name="upload" size={15} />
        Import redirects CSV
        <input type="file" accept=".csv,text/csv" onChange={onImport} />
      </label>
      <p className="muted-note">
        In Shopify: Online Store → Navigation → URL Redirects → Export. Moved
        pages go live when you publish.
      </p>
    </div>
  );
}

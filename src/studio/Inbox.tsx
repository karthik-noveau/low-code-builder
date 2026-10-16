import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Modal } from "./ui";
import { useStudio } from "./store";
import * as cloud from "../cloud/client";
import {
  REQUEST_FIELDS,
  REQUEST_KINDS,
  type InboxRequest,
  type RequestFieldId,
} from "./requests";

/** The cloud site open in the editor, if any (CloudWorkspace keeps it in the URL). */
const activeSiteId = () =>
  new URLSearchParams(location.search).get("site") ?? undefined;

const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function Inbox({ onClose }: { onClose: () => void }) {
  const project = useStudio((s) => s.project);
  const siteId = activeSiteId();
  const [requests, setRequests] = useState<InboxRequest[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"new" | "all">("new");
  const [open, setOpen] = useState<string | null>(null);
  const fetchRequests = useCallback(
    () =>
      cloud
        .request<{ requests: InboxRequest[] }>(`/sites/${siteId}/inbox`)
        .then(({ requests }) => requests),
    [siteId],
  );
  const load = async () => {
    try {
      setRequests(await fetchRequests());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your inbox.");
    }
  };
  useEffect(() => {
    if (!siteId) return;
    let active = true;
    fetchRequests()
      .then((list) => {
        if (active) setRequests(list);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load your inbox.",
          );
      });
    return () => {
      active = false;
    };
  }, [siteId, fetchRequests]);
  const mark = async (r: InboxRequest, status: InboxRequest["status"]) => {
    try {
      const { request } = await cloud.request<{ request: InboxRequest }>(
        `/sites/${siteId}/inbox/${r.id}`,
        { method: "POST", body: JSON.stringify({ status }) },
      );
      setRequests(
        (list) => list?.map((x) => (x.id === r.id ? request : x)) ?? null,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the request.",
      );
    }
  };
  const actions = (project.collections ?? []).filter((c) => c.request);
  const shown = (requests ?? []).filter(
    (r) => filter === "all" || r.status === "new",
  );
  const unread = (requests ?? []).filter((r) => r.status === "new").length;
  return (
    <Modal
      title="Inbox"
      subtitle="Bookings, orders, applications and RSVPs from your published site."
      onClose={onClose}
    >
      <div className="inbox">
        {!siteId ? (
          <div className="inbox-empty">
            <Icon name="mail" size={20} />
            <strong>Publish with Forma to receive requests</strong>
            <p>
              Open Workspace, save this site to your account and publish it.
              Visitor actions on item pages then send requests here, with no
              form service or app to install.
            </p>
            {!actions.length && (
              <p>
                Choose a visitor action in Data → a collection → Settings, e.g.
                bookings for services or applications for jobs.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="inbox-bar">
              <div className="segmented" role="tablist" aria-label="Show">
                {(["new", "all"] as const).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    className={filter === f ? "chosen" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f === "new" ? `New${unread ? ` · ${unread}` : ""}` : "All"}
                  </button>
                ))}
              </div>
              <button className="subtle-button" onClick={() => void load()}>
                Refresh
              </button>
            </div>
            {error && (
              <p className="inbox-error" role="alert">
                {error}
              </p>
            )}
            {requests === null && !error && (
              <p className="inbox-muted">Loading…</p>
            )}
            {requests && !shown.length && (
              <div className="inbox-empty">
                <Icon name="mail" size={20} />
                <strong>
                  {filter === "new"
                    ? "You’re all caught up"
                    : "No requests yet"}
                </strong>
                <p>
                  {actions.length
                    ? `Requests from ${actions.map((c) => c.name).join(", ")} pages appear here after you publish.`
                    : "Choose a visitor action in Data → a collection → Settings."}
                </p>
              </div>
            )}
            <ul className="inbox-list">
              {shown.map((r) => (
                <li key={r.id} className={r.status === "new" ? "is-new" : ""}>
                  <button
                    className="inbox-row"
                    aria-expanded={open === r.id}
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                  >
                    <span className="inbox-kind">
                      {REQUEST_KINDS[r.kind].noun}
                    </span>
                    <span className="inbox-who">
                      <strong>{r.name}</strong>
                      <small>
                        {r.itemTitle} · {r.collectionName}
                      </small>
                    </span>
                    <time dateTime={r.createdAt}>{when(r.createdAt)}</time>
                  </button>
                  {open === r.id && (
                    <div className="inbox-detail">
                      <dl>
                        <div>
                          <dt>Email</dt>
                          <dd>
                            <a href={`mailto:${r.email}`}>{r.email}</a>
                          </dd>
                        </div>
                        {REQUEST_KINDS[r.kind].fields
                          .filter((f): f is RequestFieldId => !!r.fields[f])
                          .map((f) => (
                            <div key={f}>
                              <dt>{REQUEST_FIELDS[f].label}</dt>
                              <dd>{r.fields[f]}</dd>
                            </div>
                          ))}
                      </dl>
                      <div className="inbox-actions">
                        <a
                          className="subtle-button"
                          href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.itemTitle}`)}`}
                        >
                          <Icon name="send" size={14} />
                          Reply
                        </a>
                        <button
                          className="primary-button"
                          onClick={() =>
                            void mark(r, r.status === "new" ? "done" : "new")
                          }
                        >
                          {r.status === "new"
                            ? "Mark as done"
                            : "Move back to new"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

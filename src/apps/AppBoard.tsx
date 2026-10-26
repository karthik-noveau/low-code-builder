/**
 * The board view of a table with steps: one column per step that still needs
 * the owner (waiting and in-progress statuses), oldest first, like a kitchen
 * or packing queue. Each card shows what was ordered, how long it's waited,
 * whether it's paid, and the next steps as one-tap buttons.
 */
import {
  recordTitle,
  type App,
  type AppAction,
  type AppRecord,
  type AppTable,
} from "./model";
import { PaymentBadge } from "./AppUi";
import { useEffect, useState } from "react";
import {
  boardStatuses,
  linkTitler,
  recordLines,
  recordSummary,
  timeAgo,
  type LinkTitle,
} from "./app-helpers";
import { describeLines } from "./model";
import type { LinkTitles } from "./api-types";

export function AppBoard({
  app,
  table,
  records,
  links,
  fresh,
  busy,
  onOpen,
  onAct,
}: {
  app: App;
  table: AppTable;
  /** Already searched; the board picks the ones in its columns. */
  records: AppRecord[];
  links: LinkTitles;
  /** Records that arrived since the owner last looked. */
  fresh: Set<string>;
  /** The record an action is running on, so its buttons wait. */
  busy?: string;
  onOpen: (recordId: string) => void;
  onAct: (record: AppRecord, action: AppAction) => void;
}) {
  const linkTitle = linkTitler(links);
  // Ages ("12 min ago") move on by themselves.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const columns = boardStatuses(table);
  return (
    <div className="app-board" role="list" aria-label={`${table.name} board`}>
      {columns.map((status) => {
        const cards = records
          .filter((r) => r.status === status.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return (
          <section
            key={status.id}
            className={`app-board-column is-${status.tone}`}
            role="listitem"
            aria-label={`${status.name}, ${cards.length}`}
          >
            <h3>
              <span>{status.name}</span>
              <span className="app-chip-count">{cards.length}</span>
            </h3>
            {!cards.length ? (
              <p className="commerce-muted app-board-empty">Nothing here</p>
            ) : (
              <ul>
                {cards.map((r) => (
                  <BoardCard
                    key={r.id}
                    app={app}
                    table={table}
                    record={r}
                    linkTitle={linkTitle}
                    now={now}
                    fresh={fresh.has(r.id)}
                    busy={busy === r.id}
                    onOpen={() => onOpen(r.id)}
                    onAct={(a) => onAct(r, a)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({
  app,
  table,
  record,
  linkTitle,
  now,
  fresh,
  busy,
  onOpen,
  onAct,
}: {
  app: App;
  table: AppTable;
  record: AppRecord;
  linkTitle: LinkTitle;
  now: number;
  fresh: boolean;
  busy: boolean;
  onOpen: () => void;
  onAct: (action: AppAction) => void;
}) {
  const title = recordTitle(table, record);
  const lines = recordLines(table, record);
  const actions = table.actions.filter((a) => a.from.includes(record.status));
  const detail = lines.length
    ? describeLines(lines)
    : recordSummary(app, table, record, linkTitle);
  return (
    <li className={`app-board-card ${fresh ? "is-new" : ""}`}>
      <button type="button" className="app-board-open" onClick={onOpen}>
        <span className="app-board-top">
          {record.ref && <span className="app-board-ref">{record.ref}</span>}
          {fresh && <span className="app-new-tag">New</span>}
          <span className="app-board-age">
            {timeAgo(record.createdAt, now)}
          </span>
        </span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </button>
      {(record.payment || actions.length > 0) && (
        <div className="app-board-foot">
          {record.payment && <PaymentBadge payment={record.payment} />}
          {actions.length > 0 && (
            <div
              className="app-board-actions"
              role="group"
              aria-label={`Actions for ${record.ref || title}`}
            >
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`commerce-button ${a.tone === "danger" ? "secondary" : ""}`}
                  disabled={busy}
                  aria-label={`${a.name} ${record.ref || title}`}
                  onClick={() => onAct(a)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

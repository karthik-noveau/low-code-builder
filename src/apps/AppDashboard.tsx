/** The app's dashboard: the owner's figures and lists, as the app defines them. */
import { Icon } from "../studio/Icon";
import { formatMoney, recordTitle, tableOf, type App } from "./model";
import type { Summary } from "./api-types";
import { Empty, LoadError, PaymentBadge, StatusPill } from "./AppUi";
import { linkTitler, recordSummary, showTotal, showValue } from "./app-helpers";

export function AppDashboard({
  app,
  summary,
  error,
  siteId,
  onRetry,
  onOpen,
  onTable,
}: {
  app: App;
  summary?: Summary;
  error: string;
  siteId: string;
  onRetry: () => void;
  onOpen: (tableId: string, recordId: string) => void;
  onTable: (tableId: string) => void;
}) {
  if (error && !summary) return <LoadError message={error} onRetry={onRetry} />;
  if (!summary)
    return (
      <p role="status" className="app-loading">
        Loading your dashboard…
      </p>
    );
  if (!summary.cards.length && !summary.lists.length)
    return (
      <Empty title="Your dashboard is empty" icon="chart">
        <p>
          Add figures (like “Waiting for review” or “Rewards owed”) and lists
          (like “Top earners”) to the dashboard in the app builder.
        </p>
        <a className="commerce-button" href={`/editor?site=${siteId}`}>
          Open the app builder
        </a>
      </Empty>
    );
  const linkTitle = linkTitler(summary.links);
  const listDef = (id: string) => app.dashboard.lists.find((l) => l.id === id);
  return (
    <>
      {error && <LoadError message={error} onRetry={onRetry} />}
      {summary.cards.length > 0 && (
        <div className="commerce-stats app-cards">
          {summary.cards.map((card) => (
            <div key={card.id} className="commerce-stat">
              <span>{card.name}</span>
              <strong>
                {card.money
                  ? formatMoney(card.value, app.currency)
                  : card.value.toLocaleString()}
              </strong>
            </div>
          ))}
        </div>
      )}
      <div className="app-lists">
        {summary.lists.map((list) => {
          const table = tableOf(app, list.table);
          if (!table) return null;
          const sort = listDef(list.id)?.sort ?? "";
          const total = table.totals.find((t) => t.id === sort);
          const field = table.fields.find(
            (f) => f.id === sort && f.id !== table.titleField,
          );
          return (
            <section key={list.id} className="commerce-panel app-list">
              <div className="app-list-head">
                <h2>{list.name}</h2>
                <a
                  className="commerce-link"
                  href={`/apps?site=${siteId}&table=${table.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onTable(table.id);
                  }}
                >
                  All {table.name.toLowerCase()}
                </a>
              </div>
              {!list.records.length ? (
                <p className="commerce-muted">Nothing here right now.</p>
              ) : (
                <ol className="app-mini-list">
                  {list.records.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(table.id, r.id)}
                      >
                        <span className="app-mini-title">
                          <strong>{recordTitle(table, r)}</strong>
                          <small>
                            {[r.ref, recordSummary(app, table, r, linkTitle)]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                        {total && (
                          <span className="app-mini-total">
                            {showTotal(app, total, r.totals?.[total.id])}
                          </span>
                        )}
                        {field && (
                          <span className="app-mini-total">
                            {showValue(app, field, r, linkTitle)}
                          </span>
                        )}
                        {r.payment?.status === "unpaid" && (
                          <PaymentBadge payment={r.payment} />
                        )}
                        <StatusPill table={table} status={r.status} />
                        <Icon
                          name="chevron"
                          size={14}
                          className="app-mini-go"
                        />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

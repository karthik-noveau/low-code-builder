/**
 * The places panel of a table with capacity rules (tables for a time slot,
 * seats at an event): for each upcoming slot that has bookings, how many
 * places are taken and how many are left. Worked out from the records the
 * page already has, so it needs no request of its own.
 */
import type { App, AppRecord, AppTable } from "./model";
import { placesRows, type Catalog } from "./app-helpers";

const SHOWN = 12;

export function AppCapacity({
  app,
  table,
  records,
  catalog,
}: {
  app: App;
  table: AppTable;
  records: AppRecord[];
  catalog?: Catalog;
}) {
  const rules = table.capacity ?? [];
  if (!rules.length) return null;
  return (
    <details className="app-places" open>
      <summary>Places</summary>
      {rules.map((rule) => {
        const rows = placesRows(app, table, rule, records, catalog);
        const dated = rule.group.some(
          (id) => table.fields.find((f) => f.id === id)?.type === "date",
        );
        return (
          <section key={rule.id} aria-label={rule.name}>
            <h3>
              {rule.name}
              {dated && <small> · today and the next 7 days</small>}
            </h3>
            {!rows.length ? (
              <p className="commerce-muted">
                Nothing booked yet
                {rule.maxField ? "" : ` — all ${rule.max} places are free`}.
              </p>
            ) : (
              <ul>
                {rows.slice(0, SHOWN).map((row) => {
                  const left = Math.max(0, row.max - row.taken);
                  const tone = !left
                    ? "bad"
                    : left / row.max <= 0.2
                      ? "waiting"
                      : "good";
                  return (
                    <li key={row.key} className={`is-${tone}`}>
                      <span className="app-places-label">{row.label}</span>
                      <span
                        className="app-places-bar"
                        aria-hidden="true"
                        style={{
                          ["--taken" as string]: `${Math.min(100, row.max ? (row.taken / row.max) * 100 : 100)}%`,
                        }}
                      />
                      <span className="app-places-count">
                        {row.taken} of {row.max} taken ·{" "}
                        <strong>{left ? `${left} left` : "Full"}</strong>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {rows.length > SHOWN && (
              <p className="commerce-hint">
                {rows.length - SHOWN} more slots with bookings.
              </p>
            )}
          </section>
        );
      })}
    </details>
  );
}
